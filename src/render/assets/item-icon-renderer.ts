/**
 * item-icon-renderer.ts — Masked animated fill renderer for item icons.
 *
 * Uses PNG silhouette masks (alpha channel) to clip animated radial-gradient
 * blobs whose colors and prominence reflect the item's mote composition.
 *
 * Primary API: createItemIconCanvas(opts) → HTMLCanvasElement
 *   Returns a self-animating canvas element driven by an internal RAF loop.
 *   Register it in the DOM; it auto-cleans up when disconnected.
 *
 * Secondary API: drawMaskedAnimatedItemIcon(ctx, opts)
 *   Standalone draw for embedding in a game canvas context.
 *   Caller should reuse the same opts object reference across frames; blobs
 *   are cached internally by seed.
 *
 * Asset naming convention:
 *   ASSETS/SPRITES/ITEMS/WEAPONS/${tierId}Weapon.png
 *   ASSETS/SPRITES/ITEMS/WEAVES/${tierId}Weave.png
 *   ASSETS/SPRITES/ITEMS/LENSES/${tierId}Lens.png
 *
 * Missing assets fail gracefully: a diamond-shape fallback is rendered instead.
 */

import { loadImage, getCachedImage } from './asset-loader';
import { getMoteIconPath } from './asset-paths';
import { TIER_BY_ID } from '../../data/tiers';
import type { TierId } from '../../data/tiers';

const _warnedMissingMasks = new Set<string>();

// ─── Luminance-to-alpha mask conversion (weapon PNG masks) ───────────────────
// Weapon PNG files are black silhouettes on white backgrounds with no alpha
// channel.  destination-in using the raw image treats the white background as
// opaque and shows the whole square.  Convert once: dark=opaque, light=transparent.

const _processedMaskCache = new Map<string, HTMLCanvasElement>();

function getLuminanceMaskCanvas(
  path: string,
  maskImg: HTMLImageElement,
  res: number,
): HTMLCanvasElement {
  const cached = _processedMaskCache.get(path);
  if (cached) return cached;

  const off = document.createElement('canvas');
  off.width  = res;
  off.height = res;
  const ctx = off.getContext('2d')!;
  ctx.drawImage(maskImg, 0, 0, res, res);

  const imageData = ctx.getImageData(0, 0, res, res);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    // dark pixels (weapon shape) → opaque; light pixels (background) → transparent
    d[i + 3] = Math.max(0, Math.min(255, 255 - lum)) | 0;
    d[i]     = 255;
    d[i + 1] = 255;
    d[i + 2] = 255;
  }
  ctx.putImageData(imageData, 0, 0);

  _processedMaskCache.set(path, off);
  return off;
}

function loadMaskWithWarning(path: string): void {
  loadImage(path).catch(() => {
    if (!_warnedMissingMasks.has(path)) {
      _warnedMissingMasks.add(path);
      console.warn(`[item-icon-renderer] Missing mask PNG: ${path}`);
    }
  });
}

// ─── Public types ─────────────────────────────────────────────────────────────

export type ItemIconType = 'weapon' | 'weave' | 'lens';

export interface CompositionEntry {
  tierId: TierId;
  share: number; // [0,1], entries should sum to ~1
}

export interface ItemIconOptions {
  itemType: ItemIconType;
  /** Dominant tier — selects the PNG mask asset. */
  tierId: TierId;
  composition: CompositionEntry[];
  width: number;
  height: number;
  /** Numeric seed for deterministic blob layout. Use stringToIconSeed(item.id). */
  seed?: number;
}

// ─── Path resolution ──────────────────────────────────────────────────────────

const FOLDER: Record<ItemIconType, string> = {
  weapon: 'WEAPONS',
  weave:  'WEAVES',
  lens:   'LENSES',
};

const SUFFIX: Record<ItemIconType, string> = {
  weapon: 'Weapon',
  weave:  'Weave',
  lens:   'Lens',
};

export function getItemMaskPath(itemType: ItemIconType, tierId: string): string {
  return `ASSETS/SPRITES/ITEMS/${FOLDER[itemType]}/${tierId}${SUFFIX[itemType]}.png`;
}

/**
 * Converts an item id string to a numeric seed for blob layout.
 * Stable across calls for the same id.
 */
export function stringToIconSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Derives a CompositionEntry array from raw ingredient counts.
 * Suitable for weaves and lenses which store ingredients rather than
 * a pre-computed composition.
 */
export function ingredientsToComposition(
  ingredients: readonly { tierId: TierId; refinedCount: number }[],
): CompositionEntry[] {
  const total = ingredients.reduce((s, i) => s + i.refinedCount, 0);
  if (total === 0) return [];
  return ingredients
    .filter(i => i.refinedCount > 0)
    .map(i => ({ tierId: i.tierId, share: i.refinedCount / total }));
}

/**
 * Begins loading the mask PNG in the background.
 * Safe to call speculatively; the cache in asset-loader prevents double loads.
 */
export function prefetchItemMask(itemType: ItemIconType, tierId: string): void {
  const path = getItemMaskPath(itemType, tierId);
  if (!getCachedImage(path)) {
    loadMaskWithWarning(path);
  }
}

// ─── Internal blob definition ─────────────────────────────────────────────────

interface BlobDef {
  color: string;
  cx: number;    // base center x [0,1]
  cy: number;    // base center y [0,1]
  dx: number;    // drift amplitude x [0,1]
  dy: number;    // drift amplitude y [0,1]
  r: number;     // radius as fraction of canvas min-dimension
  speedX: number;
  speedY: number;
  phaseX: number;
  phaseY: number;
  alpha: number;
}

function lcgRand(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function buildBlobs(composition: CompositionEntry[], seed: number): BlobDef[] {
  const rand = lcgRand(seed);
  const blobs: BlobDef[] = [];

  for (const entry of composition) {
    if (entry.share <= 0) continue;
    const color = TIER_BY_ID.get(entry.tierId)?.color ?? '#ffffff';
    // 1-4 blobs: more share → more blobs
    const count = Math.max(1, Math.min(4, Math.round(1 + entry.share * 3)));
    for (let i = 0; i < count; i++) {
      blobs.push({
        color,
        cx: 0.15 + rand() * 0.7,
        cy: 0.15 + rand() * 0.7,
        dx: 0.08 + rand() * 0.22,
        dy: 0.08 + rand() * 0.22,
        r: (0.22 + rand() * 0.32) * (0.4 + entry.share * 0.6),
        speedX: 0.25 + rand() * 0.45,
        speedY: 0.25 + rand() * 0.45,
        phaseX: rand() * Math.PI * 2,
        phaseY: rand() * Math.PI * 2,
        alpha: 0.45 + entry.share * 0.55,
      });
    }
  }
  return blobs;
}

// ─── Fill canvas drawing ──────────────────────────────────────────────────────

const FILL_RES = 64; // low-res offscreen fill; scaled up to target size

function drawGradientFill(
  ctx: CanvasRenderingContext2D,
  blobs: BlobDef[],
  timeMs: number,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Dark base so unlit areas aren't transparent (mask will clip edges)
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#08080f';
  ctx.fillRect(0, 0, w, h);

  const t = timeMs / 1000;

  for (const blob of blobs) {
    const bx = (blob.cx + blob.dx * Math.sin(t * blob.speedX + blob.phaseX)) * w;
    const by = (blob.cy + blob.dy * Math.cos(t * blob.speedY + blob.phaseY)) * h;
    const radius = blob.r * Math.min(w, h);

    const grad = ctx.createRadialGradient(bx, by, 0, bx, by, radius);
    grad.addColorStop(0,   blob.color + 'dd');
    grad.addColorStop(0.4, blob.color + '88');
    grad.addColorStop(1,   blob.color + '00');

    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = blob.alpha;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(bx, by, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// Diamond fallback path when no mask PNG is available yet
function drawDiamondFallback(
  ctx: CanvasRenderingContext2D,
  fillCanvas: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w,     y + h * 0.4);
  ctx.lineTo(x + w / 2, y + h);
  ctx.lineTo(x,         y + h * 0.4);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(fillCanvas, x, y, w, h);
  ctx.restore();
}

// ─── Standalone draw (game-canvas use) ───────────────────────────────────────

interface StandaloneState {
  blobs: BlobDef[];
  fillCanvas: HTMLCanvasElement;
  fillCtx: CanvasRenderingContext2D;
  maskCanvas: HTMLCanvasElement;
  maskCtx: CanvasRenderingContext2D;
}

const standaloneCache = new Map<number, StandaloneState>();

function getOrCreateStandaloneState(
  composition: CompositionEntry[],
  seed: number,
): StandaloneState {
  let state = standaloneCache.get(seed);
  if (!state) {
    const fillCanvas = document.createElement('canvas');
    fillCanvas.width  = FILL_RES;
    fillCanvas.height = FILL_RES;
    const fillCtx = fillCanvas.getContext('2d')!;

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width  = FILL_RES;
    maskCanvas.height = FILL_RES;
    const maskCtx = maskCanvas.getContext('2d')!;

    state = { blobs: buildBlobs(composition, seed), fillCanvas, fillCtx, maskCanvas, maskCtx };
    standaloneCache.set(seed, state);
  }
  return state;
}

/**
 * Draws a masked animated item icon directly onto an existing canvas context.
 * Suitable for use in a game canvas rendering loop.
 * Callers should use a consistent seed per item to avoid re-creating blob state.
 */
export function drawMaskedAnimatedItemIcon(
  ctx: CanvasRenderingContext2D,
  opts: ItemIconOptions & { x: number; y: number; timeMs: number },
): void {
  const { itemType, tierId, composition, x, y, width, height, seed = 0, timeMs } = opts;

  const maskPath = getItemMaskPath(itemType, tierId);
  const maskImg  = getCachedImage(maskPath);

  // Kick off async load if not yet cached
  if (!maskImg) prefetchItemMask(itemType, tierId);

  const state = getOrCreateStandaloneState(composition, seed);
  drawGradientFill(state.fillCtx, state.blobs, timeMs);

  if (maskImg) {
    const maskSource = itemType === 'weapon'
      ? getLuminanceMaskCanvas(maskPath, maskImg, FILL_RES)
      : maskImg;
    state.maskCtx.clearRect(0, 0, FILL_RES, FILL_RES);
    state.maskCtx.globalCompositeOperation = 'source-over';
    state.maskCtx.drawImage(state.fillCanvas, 0, 0);
    state.maskCtx.globalCompositeOperation = 'destination-in';
    state.maskCtx.drawImage(maskSource, 0, 0, FILL_RES, FILL_RES);
    state.maskCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(state.maskCanvas, x, y, width, height);
  } else {
    drawDiamondFallback(ctx, state.fillCanvas, x, y, width, height);
  }
}

// ─── Animated canvas element (DOM integration) ───────────────────────────────

interface LiveIconState {
  blobs: BlobDef[];
  maskPath: string;
  isLuminanceMask: boolean;
  fillCanvas: HTMLCanvasElement;
  fillCtx: CanvasRenderingContext2D;
  maskCanvas: HTMLCanvasElement;
  maskCtx: CanvasRenderingContext2D;
}

const liveIcons = new Map<HTMLCanvasElement, LiveIconState>();

// ─── Mote-symbol icon canvases (weave/loom inventory) ────────────────────────

interface MoteIconState {
  tierId: TierId;
  glowColor: string;
}

const _moteIcons = new Map<HTMLCanvasElement, MoteIconState>();
const MOTE_ICON_ROTATION_RPS = 0.08; // rotations per second — slow, matches loom orbital

/**
 * Shared helper: draw the mote symbol/glyph sprite for a tier.
 * Uses the same moteIcons/*.webp sprite the equation upgrades panel and
 * loom orbital buttons use.  Falls back to a colored circle if the sprite
 * has not yet loaded.
 */
export function drawEquationMoteIcon(
  ctx: CanvasRenderingContext2D,
  tierId: TierId,
  x: number,
  y: number,
  size: number,
  rotation = 0,
): void {
  const path = getMoteIconPath(tierId);
  const img  = getCachedImage(path);
  if (!img) {
    loadImage(path).catch(() => {});
    const tier = TIER_BY_ID.get(tierId);
    if (tier) {
      ctx.save();
      ctx.fillStyle = tier.color;
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    return;
  }
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate(rotation);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}

let rafHandle = 0;

function rafLoop(nowMs: number): void {
  // Prune disconnected canvases
  for (const [canvas] of liveIcons) {
    if (!canvas.isConnected) liveIcons.delete(canvas);
  }
  for (const [canvas] of _moteIcons) {
    if (!canvas.isConnected) _moteIcons.delete(canvas);
  }

  if (liveIcons.size === 0 && _moteIcons.size === 0) {
    rafHandle = 0;
    return;
  }

  // ── Item icons (blob fill + mask) ─────────────────────────────────────────
  for (const [canvas, state] of liveIcons) {
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    const maskImg = getCachedImage(state.maskPath);
    const w = canvas.width;
    const h = canvas.height;

    drawGradientFill(state.fillCtx, state.blobs, nowMs);

    ctx.clearRect(0, 0, w, h);

    if (maskImg) {
      const maskSource = state.isLuminanceMask
        ? getLuminanceMaskCanvas(state.maskPath, maskImg, FILL_RES)
        : maskImg;
      state.maskCtx.clearRect(0, 0, FILL_RES, FILL_RES);
      state.maskCtx.globalCompositeOperation = 'source-over';
      state.maskCtx.drawImage(state.fillCanvas, 0, 0);
      state.maskCtx.globalCompositeOperation = 'destination-in';
      state.maskCtx.drawImage(maskSource, 0, 0, FILL_RES, FILL_RES);
      state.maskCtx.globalCompositeOperation = 'source-over';
      ctx.drawImage(state.maskCanvas, 0, 0, w, h);
    } else {
      drawDiamondFallback(ctx, state.fillCanvas, 0, 0, w, h);
    }
  }

  // ── Mote-symbol icons (weave/loom inventory) ──────────────────────────────
  const rotation = (nowMs / 1000) * MOTE_ICON_ROTATION_RPS * Math.PI * 2;
  for (const [canvas, state] of _moteIcons) {
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.shadowBlur = w * 0.5;
    ctx.shadowColor = state.glowColor;
    drawEquationMoteIcon(ctx, state.tierId, 0, 0, w, rotation);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  rafHandle = requestAnimationFrame(rafLoop);
}

/**
 * Creates a self-animating canvas showing the mote symbol sprite for a tier.
 * Matches the visual used by the loom orbital buttons in the crafting page:
 * the moteIcons/*.webp sprite with a slow rotation and tier-color glow.
 * Use this for weave and loom inventory icons instead of the blob-fill renderer.
 */
export function createMoteIconCanvas(
  tierId: TierId,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;

  const path = getMoteIconPath(tierId);
  if (!getCachedImage(path)) {
    loadImage(path).catch(() => {});
  }

  const glowColor = TIER_BY_ID.get(tierId)?.glowColor ?? '#ffffff';
  _moteIcons.set(canvas, { tierId, glowColor });

  if (rafHandle === 0) {
    rafHandle = requestAnimationFrame(rafLoop);
  }

  return canvas;
}

/**
 * Creates a self-animating HTMLCanvasElement for an item icon.
 *
 * The canvas drives its own RAF animation loop. It automatically unregisters
 * when disconnected from the DOM, so rebuilding card lists does not leak.
 *
 * Style the returned canvas element as needed before inserting into the DOM.
 */
export function createItemIconCanvas(opts: ItemIconOptions): HTMLCanvasElement {
  const { itemType, tierId, composition, width, height, seed = 0 } = opts;

  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;

  const maskPath = getItemMaskPath(itemType, tierId);
  if (!getCachedImage(maskPath)) {
    loadMaskWithWarning(maskPath);
  }

  const fillCanvas = document.createElement('canvas');
  fillCanvas.width  = FILL_RES;
  fillCanvas.height = FILL_RES;
  const fillCtx = fillCanvas.getContext('2d')!;

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width  = FILL_RES;
  maskCanvas.height = FILL_RES;
  const maskCtx = maskCanvas.getContext('2d')!;

  liveIcons.set(canvas, {
    blobs: buildBlobs(composition, seed),
    maskPath,
    isLuminanceMask: itemType === 'weapon',
    fillCanvas,
    fillCtx,
    maskCanvas,
    maskCtx,
  });

  if (rafHandle === 0) {
    rafHandle = requestAnimationFrame(rafLoop);
  }

  return canvas;
}
