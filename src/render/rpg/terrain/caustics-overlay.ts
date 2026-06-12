/**
 * caustics-overlay.ts — Animated underwater visual overlay for the Caustics RPG zone.
 *
 * Visual pipeline (drawn in this order by rpg-render-draw.ts):
 *   1. drawCausticsBackground()   — deep-water atmosphere + floor glow pool; before fluid/terrain
 *   2. drawCausticsFloorEffects() — caustic light network, shimmer bands, rising bubbles
 *
 * ── Caustic light network (build 165) ─────────────────────────────────────────
 *   Three drifting layers of Voronoi cell-boundary (Worley F2−F1) caustic
 *   texture tiles are composited into a dedicated half-resolution offscreen
 *   light buffer.  The buffer is then drawn back to the main canvas using
 *   globalCompositeOperation = 'screen' with a soft CSS blur, producing the
 *   characteristic soft-edged underwater caustic shimmer.
 *
 *   Layers A and C share tile variant A; Layer B uses tile variant B (different
 *   Voronoi seed from caustics-texture.ts).  Distinct source tiles eliminate
 *   the wallpaper-repeat artefact when layers align.
 *
 *     Layer A: scale 1.00×, slow rightward+downward drift  (~8.5 / 6.0 px/s)
 *     Layer B: scale 1.28×, elliptical sin/cos orbit + slow rotation (~0.015 rad/s)
 *     Layer C: scale 0.78×, rightward+upward drift         (~4.2 / 5.8 px/s)
 *
 * Offscreen light buffer:
 *   Caustic layers are drawn to a half-resolution (lightScale = 0.5) offscreen
 *   canvas first.  When composited back to the main canvas it is drawn at full
 *   size, producing a natural bilinear-upscale softness.  An additional CSS
 *   blur (CAUSTICS_BLUR_PX) is applied at composite time for the soft glow.
 *   The offscreen canvas is created/resized only when the main canvas size
 *   changes — never allocated per frame.
 *
 * Per-frame allocations:
 *   CanvasPattern.setTransform() is called with reusable module-level DOMMatrix
 *   objects (_matA, _matB, _matC) instead of new object literals each frame.
 *   Only e/f (translation) and, for Layer B, the rotation-derived a/b/c/d
 *   fields are mutated per frame — no new objects allocated.
 *
 *   drawCausticsBackground() gradients are cached by context + dimensions;
 *   recreated only when those change (never during normal gameplay on the fixed
 *   360×640 RPG canvas).
 *
 *   _drawCausticsShimmer() still calls canvas path operations (3 beginPath/stroke
 *   pairs) and creates no object literals.  Bubbles use pre-baked constants.
 *
 * Low-graphics mode:
 *   One cached layer at reduced alpha.  No expensive glow pass or CSS blur.
 *   Still reads as aquarium-floor caustics, not fading ovals.
 *
 * Draw order:
 *   drawCausticsBackground()   — after '#0a0a12' base fill, before fluid/terrain
 *   drawCausticsFloorEffects() — after terrain render, before enemies/player
 *
 * Tunables (top of this file):
 *   CAUSTICS_LIGHT_SCALE    — offscreen buffer resolution relative to main canvas
 *   CAUSTICS_BLUR_PX        — CSS blur applied when compositing light buffer
 *   CAUSTICS_COMPOSITE_ALPHA — opacity of the full light buffer on main canvas
 */

import { getCausticsTextureTile, getCausticsTextureTile2 } from './caustics-texture';
import type { SeafloorTerrainData } from './seafloor-terrain';

// ── Tunables ───────────────────────────────────────────────────────────────────

/** Resolution of the offscreen caustic light buffer relative to the main canvas.
 *  0.5 = half-res → natural bilinear upscale provides inherent softness + perf. */
const CAUSTICS_LIGHT_SCALE    = 0.5;

/** CSS blur applied when compositing the light buffer back to the main canvas (px).
 *  Adds soft glow around caustic filaments.  Set to 0 to rely on upscale alone. */
const CAUSTICS_BLUR_PX        = 6;

/** Opacity of the composited light buffer over the scene.  0.6–0.8 is typical. */
const CAUSTICS_COMPOSITE_ALPHA = 0.72;

// ── Height-aware caustics tunables ────────────────────────────────────────────
// These control the depth-parallax and brightness effects applied per ridge.
// Tuned conservatively: subtle implied depth without visually detaching caustics.

/**
 * Light-direction parallax shift applied per unit of normalised ridge elevation
 * (0–1), measured in main-canvas pixels.  Higher ridges sample the caustic
 * texture from a slightly different position, creating a subtle parallax effect.
 * Increase for a stronger effect; keep ≤ 4 to avoid detachment artefacts.
 */
const CAUSTIC_HEIGHT_SHIFT_PX = 2.0;

/**
 * Screen-blend alpha increment per unit of normalised ridge elevation (0–1).
 * Higher ridges receive this much additional caustic brightness.
 * Translates the formula `brightnessMultiplier = 1.0 + elevation × 0.08` into
 * an additive screen-blend contribution.
 */
const CAUSTIC_ELEVATION_BRIGHTNESS_PER_LAYER = 0.08;

/**
 * Maximum screen-blend alpha for the elevation brightness overlay.
 * Prevents blown-out white patches on ridge crests.
 * Corresponds to a brightnessMultiplier cap of CAUSTIC_MAX_ELEVATION_BRIGHTNESS.
 */
const CAUSTIC_MAX_ELEVATION_BRIGHTNESS = 1.35;

/** Implied light-source direction used for parallax offset (not normalised). */
const _CAUSTIC_LIGHT_DIR_X =  0.25;
const _CAUSTIC_LIGHT_DIR_Y = -1.0;

// ── Offscreen light buffer ────────────────────────────────────────────────────
// Allocated once; re-created only when the main canvas size changes.
// All caustic tile layers are drawn into this buffer first.  The buffer is then
// composited onto the main canvas with screen blending + optional CSS blur.

let _lightCanvas: HTMLCanvasElement | null = null;
let _lightCtx:    CanvasRenderingContext2D | null = null;
let _lightW       = 0;   // current light-buffer width  (in light-buffer pixels)
let _lightH       = 0;   // current light-buffer height (in light-buffer pixels)
let _lightMainW   = 0;   // main-canvas width that generated the current buffer
let _lightMainH   = 0;   // main-canvas height that generated the current buffer

// ── Pre-baked bubble data ──────────────────────────────────────────────────────

/**
 * Bubble parameter table.
 * Layout per row: [baseXFrac, periodSec, xWobbleAmpPx, xWobbleFreq, radiusPx, alphaBase, phaseOffset]
 */
const _BUBBLE_DATA: readonly (readonly number[])[] = [
  //  baseX  period  wobAmp  wobFreq  r    alpha  phase
  [   0.12,   8.3,   7.0,   0.90,   2.0,  0.20,  0.00 ],
  [   0.28,   6.7,   5.0,   1.10,   1.5,  0.22,  0.07 ],
  [   0.43,   9.1,   9.0,   0.70,   1.8,  0.16,  0.14 ],
  [   0.57,   7.4,   6.0,   1.30,   2.5,  0.21,  0.21 ],
  [   0.71,  10.2,   4.0,   0.80,   1.2,  0.24,  0.29 ],
  [   0.85,   6.0,   8.0,   1.50,   2.0,  0.19,  0.36 ],
  [   0.18,  11.5,   5.0,   0.60,   1.5,  0.15,  0.43 ],
  [   0.35,   8.8,   7.0,   1.00,   1.8,  0.20,  0.50 ],
  [   0.50,   7.2,   3.0,   1.20,   2.2,  0.22,  0.57 ],
  [   0.65,   9.6,   6.0,   0.90,   1.6,  0.18,  0.64 ],
  [   0.78,   6.5,   9.0,   1.40,   1.3,  0.23,  0.71 ],
  [   0.92,   8.0,   5.0,   0.80,   2.4,  0.17,  0.79 ],
  [   0.22,  10.8,   7.0,   1.10,   1.7,  0.21,  0.86 ],
  [   0.47,   7.9,   4.0,   1.30,   2.1,  0.19,  0.93 ],
];

const _HIGH_BUBBLE_COUNT = 14;
const _LOW_BUBBLE_COUNT  = 6;

const _SHIMMER_COLOR = '#6ad8e0';

// ── CanvasPattern cache ────────────────────────────────────────────────────────
// Patterns are cached and reused across frames to avoid per-frame allocations.
// Invalidated when the light-buffer context or source tiles change.
// _patternTileA — tile used for Layers A and C (variant A).
// _patternTileB — tile used for Layer B (variant B, distinct Voronoi topology).

let _patternA: CanvasPattern | null = null;  // layer A (always drawn)
let _patternB: CanvasPattern | null = null;  // layer B (high-graphics)
let _patternC: CanvasPattern | null = null;  // layer C (high-graphics)
let _patternCtx:   CanvasRenderingContext2D | null = null;
let _patternTileA: HTMLCanvasElement | null = null;
let _patternTileB: HTMLCanvasElement | null = null;

// ── Reusable DOMMatrix objects for CanvasPattern transforms ───────────────────
// Initialised once with the constant scale components; only translation (e, f)
// and Layer B's rotation-derived a/b/c/d are updated each frame.
// Avoids new object literal allocation inside the hot draw path.
const _matA = new DOMMatrix([1, 0, 0, 1, 0, 0]);     // scale 1.00×, identity rotation
const _matB = new DOMMatrix([1.28, 0, 0, 1.28, 0, 0]); // scale 1.28×; a/b/c/d updated with rotation
const _matC = new DOMMatrix([0.78, 0, 0, 0.78, 0, 0]); // scale 0.78×, no rotation

/**
 * Reusable DOMMatrix for the height-aware parallax pass.
 * e/f (translation) are mutated per ridge in the height-aware drawing loop;
 * a/b/c/d are fixed at the same values as _matA (scale 1.0×, no rotation).
 * A single module-level instance avoids allocating one DOMMatrix per ridge per frame.
 */
const _matHeightAware = new DOMMatrix([1, 0, 0, 1, 0, 0]);

// ── Background gradient cache ─────────────────────────────────────────────────
// Gradients are bound to their creating context; recreated only when the
// context or canvas dimensions change (never in normal play on the 360×640 canvas).
let _bgGradCtx: CanvasRenderingContext2D | null = null;
let _bgGradW  = 0;
let _bgGradH  = 0;
let _bgGradLow = false;
let _atmoGrad:  CanvasGradient | null = null;
let _poolGrad:  CanvasGradient | null = null;

// ── Intensity mask gradient cache ─────────────────────────────────────────────
// A subtle top-darkening gradient that makes the caustic network feel like it
// is concentrated on the seafloor rather than uniformly lit.
// Cached by context + canvas height; recreated only when those change.
let _maskGradCtx: CanvasRenderingContext2D | null = null;
let _maskGradH  = 0;
let _maskGrad:   CanvasGradient | null = null;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Draw the deep-water atmosphere tint + floor glow pool behind the battlefield.
 *
 * Call immediately after the initial background fill, before fluid and terrain,
 * so it sits at the very bottom of the visual stack.
 */
export function drawCausticsBackground(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  lowGraphics: boolean,
): void {
  canvas2d.save();

  // Rebuild cached gradients if context, dimensions, or quality tier changed.
  if (_bgGradCtx !== canvas2d || _bgGradW !== widthPx || _bgGradH !== heightPx || _bgGradLow !== lowGraphics) {
    _bgGradCtx = canvas2d;
    _bgGradW   = widthPx;
    _bgGradH   = heightPx;
    _bgGradLow = lowGraphics;

    // ── Main atmosphere gradient ────────────────────────────────────────────
    // Near-black navy at the top (deep open water) transitioning to murky
    // seafloor teal at the bottom — the ground receives more scattered light.
    _atmoGrad = canvas2d.createLinearGradient(0, 0, 0, heightPx);
    _atmoGrad.addColorStop(0,   '#010d1a');  // near-black navy (deep water column)
    _atmoGrad.addColorStop(0.5, '#011e1e');  // dark teal (mid-water)
    _atmoGrad.addColorStop(1,   '#023028');  // murky seafloor teal

    // ── Floor glow pool (high-graphics only) ───────────────────────────────
    if (!lowGraphics) {
      _poolGrad = canvas2d.createRadialGradient(
        widthPx * 0.5, heightPx,        0,
        widthPx * 0.5, heightPx * 0.88, widthPx * 0.70,
      );
      _poolGrad.addColorStop(0,    'rgba(42, 170, 148, 0.13)');
      _poolGrad.addColorStop(0.55, 'rgba(18, 105, 105, 0.05)');
      _poolGrad.addColorStop(1,    'rgba(0,   0,   0,  0)');
    } else {
      _poolGrad = null;
    }
  }

  // ── Main atmosphere gradient ──────────────────────────────────────────────
  canvas2d.fillStyle = _atmoGrad!;
  canvas2d.globalAlpha = lowGraphics ? 0.30 : 0.40;
  canvas2d.fillRect(0, 0, widthPx, heightPx);

  // ── Floor glow pool (high-graphics only) ─────────────────────────────────
  if (!lowGraphics && _poolGrad) {
    canvas2d.fillStyle = _poolGrad;
    canvas2d.globalAlpha = 1;
    // Paint the full gradient. Clipping it to the lower 32% creates a visible
    // horizontal tint discontinuity at the clip boundary.
    canvas2d.fillRect(0, 0, widthPx, heightPx);
  }

  canvas2d.restore();
}

/**
 * Draw the animated caustic light network, shimmer bands, and rising bubbles
 * on top of the terrain but below enemies and the player.
 *
 * Caustic layers are rendered into a half-resolution offscreen light buffer
 * first, then composited onto the main canvas with 'screen' blending and a
 * soft CSS blur.  This produces smooth, light-like caustic shimmer rather
 * than crisp, hard-edged patterns.
 *
 * The main visual identity comes from three drifting layers of a cached Voronoi
 * caustic texture — not from alpha-pulsing ovals or simple sine-wave bands.
 *
 * When `seafloorData` is provided the caustic sampling is adjusted per ridge:
 *   - Pattern coordinates are offset by `CAUSTIC_HEIGHT_SHIFT_PX` in the
 *     implied light direction so raised ridges intercept a different portion
 *     of the caustic field than the flat seafloor around them.
 *   - Ridges receive a subtle additional screen-blended brightness overlay
 *     proportional to their normalised elevation.
 *
 * Call after terrain rendering and before the first enemy draw call.
 *
 * @param worldOffX  World-space X origin of the local draw coordinate frame.
 *   Set to `visibleBounds.left` when the canvas context has been translated by
 *   `(visibleBounds.left, visibleBounds.top)` so that ridge world coordinates
 *   are correctly offset within the light buffer.  Defaults to 0 (safe core).
 * @param worldOffY  World-space Y origin of the local draw coordinate frame.
 *   Defaults to 0 (safe core).
 */
export function drawCausticsFloorEffects(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  nowMs: number,
  lowGraphics: boolean,
  seafloorData?: SeafloorTerrainData,
  worldOffX = 0,
  worldOffY = 0,
): void {
  const tS = nowMs * 0.001;

  // ── Acquire / resize the offscreen light buffer ──────────────────────────
  const scale   = lowGraphics ? 1.0 : CAUSTICS_LIGHT_SCALE;  // low mode: no downscale
  const lw = Math.max(1, Math.round(widthPx  * scale));
  const lh = Math.max(1, Math.round(heightPx * scale));

  if (!_lightCanvas || _lightMainW !== widthPx || _lightMainH !== heightPx) {
    if (!_lightCanvas) {
      _lightCanvas = document.createElement('canvas');
    }
    _lightCanvas.width  = lw;
    _lightCanvas.height = lh;
    _lightCtx = _lightCanvas.getContext('2d');
    _lightW   = lw;
    _lightH   = lh;
    _lightMainW = widthPx;
    _lightMainH = heightPx;
    // Invalidate cached patterns — they are bound to the old context.
    _patternCtx = null;
  }

  if (!_lightCtx) return;

  // Clear the light buffer each frame (it is not accumulated).
  _lightCtx.clearRect(0, 0, _lightW, _lightH);

  // ── Render caustic tile layers into the light buffer ─────────────────────
  _drawCausticsTileLayers(_lightCtx, _lightW, _lightH, tS, lowGraphics);

  // ── Height-aware parallax pass (into the same light buffer) ──────────────
  // Draws each ridge area with a slightly shifted caustic pattern offset so
  // raised terrain intercepts the light field from a different angle.
  // Ridge world coordinates are translated by (-worldOffX, -worldOffY) to map
  // into the light-buffer's local coordinate space.
  if (seafloorData && seafloorData.ridges.length > 0) {
    _drawCausticsHeightAwarePass(
      _lightCtx, _lightW, _lightH, scale, seafloorData, lowGraphics,
      worldOffX, worldOffY,
    );
  }

  // ── Composite light buffer onto the main canvas ──────────────────────────
  canvas2d.save();
  canvas2d.globalCompositeOperation = 'screen';
  canvas2d.globalAlpha = lowGraphics ? 0.45 : CAUSTICS_COMPOSITE_ALPHA;
  if (!lowGraphics && CAUSTICS_BLUR_PX > 0) {
    canvas2d.filter = `blur(${CAUSTICS_BLUR_PX}px)`;
  }
  canvas2d.drawImage(_lightCanvas, 0, 0, widthPx, heightPx);
  canvas2d.restore();

  // ── Intensity mask + shimmer + bubbles drawn directly on main canvas ─────
  _drawCausticsIntensityMask(canvas2d, widthPx, heightPx);
  if (!lowGraphics) {
    _drawCausticsShimmer(canvas2d, widthPx, heightPx, tS);
  }
  _drawCausticsBubbles(canvas2d, widthPx, heightPx, tS, lowGraphics);

  // ── Elevation brightness overlay on main canvas ───────────────────────────
  // Screen-blended aqua highlight along ridge crests; higher ridges are brighter.
  // Applied after the light-buffer composite so it is affected by the same
  // screen blending that brightens the base caustic network.
  // Ridge coordinates are offset by (-worldOffX, -worldOffY) to align with the
  // translated main canvas context.
  if (seafloorData && seafloorData.ridges.length > 0) {
    _drawCausticsElevationBrightness(canvas2d, seafloorData, lowGraphics, worldOffX, worldOffY);
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Render caustic tile layers into the provided context (the offscreen light
 * buffer in normal operation; the main canvas in low-graphics mode).
 *
 * Layer A and C use tile variant A; Layer B uses tile variant B (distinct
 * Voronoi topology) to reduce the wallpaper-like repeating appearance.
 * Layer B also has a very slow rotation (~0.015 rad/s ≈ 1 full turn / 420 s)
 * which introduces skew variation so the cell network feels more alive.
 *
 * All three CanvasPattern objects are cached module-level and reused each frame.
 * setTransform() is called with reusable DOMMatrix instances (_matA/_matB/_matC),
 * mutating only the fields that change per frame — no new object literals.
 *
 * Layer parameters (drift speeds in source-tile pixels per second):
 *   A: scale 1.00×, (+8.5, +6.0) px/s — main caustic weave  [tile variant A]
 *   B: scale 1.28×, elliptical sin/cos orbit + slow rotation  [tile variant B, high only]
 *   C: scale 0.78×, (+4.2, −5.8) px/s — finer detail        [tile variant A, high only]
 */
function _drawCausticsTileLayers(
  ctx: CanvasRenderingContext2D,
  bufW: number,
  bufH: number,
  tS: number,
  lowGraphics: boolean,
): void {
  const tileA = getCausticsTextureTile(lowGraphics);
  // Layer B is high-graphics only — avoid generating the alternate tile in low mode.
  const tileB = lowGraphics ? null : getCausticsTextureTile2(lowGraphics);

  // Refresh cached CanvasPattern objects if the context or source tiles changed.
  // In low-graphics mode tileB is null, so only _patternA is needed.
  if (_patternCtx !== ctx || _patternTileA !== tileA || _patternTileB !== tileB) {
    _patternA = ctx.createPattern(tileA, 'repeat');
    _patternB = tileB ? ctx.createPattern(tileB, 'repeat') : null;
    _patternC = lowGraphics ? null : ctx.createPattern(tileA, 'repeat');
    _patternCtx  = ctx;
    _patternTileA = tileA;
    _patternTileB = tileB;
  }
  if (!_patternA) return;

  const tileW = tileA.width;
  const tileH = tileA.height;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';

  // ── Layer A: main caustic weave, slow rightward + downward drift ──────────
  _matA.e = (tS * 8.5) % tileW;
  _matA.f = (tS * 6.0) % tileH;
  _patternA.setTransform(_matA);
  ctx.globalAlpha = lowGraphics ? 0.55 : 0.70;
  ctx.fillStyle = _patternA;
  ctx.fillRect(0, 0, bufW, bufH);

  if (!lowGraphics) {
    if (_patternB) {
      // ── Layer B: tile variant B, scale 1.28×, slow drift + very slow rotation.
      //
      // Translation uses sin/cos circular orbit rather than linear+modulo drift.
      // Reason: with a rotated CanvasPattern the canvas-space period for txB is
      // NOT simply tileW*scale — it is tileW*scale only when sin(rotB)=0.  At any
      // other rotation angle, wrapping txB by tileBW shifts the pattern origin in
      // pattern space by (tileW*cos r, −tileW*sin r), introducing a visible y-jump.
      // Sin/cos offsets are inherently periodic and never wrap abruptly.
      const scaleB = 1.28;
      const rotB   = tS * 0.015;          // ~1° per 1.16 s; imperceptible frame-to-frame
      const cosRB  = Math.cos(rotB) * scaleB;
      const sinRB  = Math.sin(rotB) * scaleB;
      const tileBW = tileB!.width  * scaleB;
      const tileBH = tileB!.height * scaleB;
      // Circular orbit: periods ~52.7 s (x) and ~72.4 s (y), phase-offset so the
      // path is elliptical.  Amplitudes ≈ 48 % / 38 % of the scaled tile dimension,
      // giving similar apparent motion speed to the former linear drift.
      const txB = tileBW * 0.48 * Math.sin(tS * 0.1194);
      const tyB = tileBH * 0.38 * Math.cos(tS * 0.0868 - 0.8);
      _matB.a = cosRB;  _matB.b = sinRB;
      _matB.c = -sinRB; _matB.d = cosRB;
      _matB.e = txB;    _matB.f = tyB;
      _patternB.setTransform(_matB);
      ctx.globalAlpha = 0.50;
      ctx.fillStyle = _patternB;
      ctx.fillRect(0, 0, bufW, bufH);
    }

    if (_patternC) {
      // ── Layer C: scale 0.78×, rightward + upward drift (fine shimmer) ────
      const scaleC = 0.78;
      const periodCx = tileW * scaleC;
      const periodCy = tileH * scaleC;
      const txC = (tS * 4.2) % periodCx;
      const tyC = (((-(tS * 5.8)) % periodCy) + periodCy) % periodCy;
      _matC.e = txC;
      _matC.f = tyC;
      _patternC.setTransform(_matC);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = _patternC;
      ctx.fillRect(0, 0, bufW, bufH);
    }
  }

  ctx.restore();
}

/**
 * Draw a subtle intensity/projection mask so the caustic light network
 * feels concentrated on the seafloor rather than uniformly lit.
 *
 * A cached linear gradient darkens the top ~30% of the canvas (toward the
 * water surface above, where direct scattered light would wash out caustics).
 * The middle and lower thirds receive no additional darkening.
 *
 * The gradient is recreated only if the context or canvas height changes —
 * never during normal play on the fixed 360×640 RPG canvas.
 *
 * Drawn with normal composite (source-over) at globalAlpha=1 so it applies
 * a neutral darkening pass that does not affect non-caustic elements drawn
 * later in the same frame.
 */
function _drawCausticsIntensityMask(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
): void {
  if (_maskGradCtx !== canvas2d || _maskGradH !== heightPx) {
    _maskGradCtx = canvas2d;
    _maskGradH   = heightPx;
    _maskGrad = canvas2d.createLinearGradient(0, 0, 0, heightPx * 0.30);
    _maskGrad.addColorStop(0,   'rgba(0, 0, 0, 0.16)');
    _maskGrad.addColorStop(1,   'rgba(0, 0, 0, 0)');
  }
  canvas2d.save();
  canvas2d.globalCompositeOperation = 'source-over';
  canvas2d.globalAlpha = 1;
  canvas2d.fillStyle = _maskGrad!;
  canvas2d.fillRect(0, 0, widthPx, heightPx * 0.30);
  canvas2d.restore();
}

/**
 * Draw faint horizontal shimmer bands simulating light ripples on the water
 * surface seen from below.  High-graphics only.
 *
 * Kept deliberately subtle (3 bands, very low alpha) so the caustic tile
 * network remains the dominant visual identity.
 */
function _drawCausticsShimmer(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  tS: number,
): void {
  const bandCount = 3;
  canvas2d.save();
  canvas2d.strokeStyle = _SHIMMER_COLOR;
  canvas2d.lineWidth = 1.0;

  for (let b = 0; b < bandCount; b++) {
    const yBase = heightPx * (0.05 + b * 0.060);
    const alpha = 0.012 + 0.007 * Math.sin(tS * 0.55 + b * 1.5708);
    canvas2d.globalAlpha = alpha;

    canvas2d.beginPath();
    canvas2d.moveTo(0, yBase);
    for (let x = 8; x <= widthPx; x += 8) {
      const y = yBase + 2.5 * Math.sin(x * 0.068 + tS * (0.65 + b * 0.15));
      canvas2d.lineTo(x, y);
    }
    canvas2d.stroke();
  }

  canvas2d.restore();
}

/**
 * Draw sparse rising bubble particles.  Each bubble cycles continuously from
 * the bottom of the arena to the top with a gentle horizontal wobble.
 * All parameters are pre-baked — no per-frame allocations.
 */
function _drawCausticsBubbles(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  tS: number,
  lowGraphics: boolean,
): void {
  const bubbleCount = lowGraphics ? _LOW_BUBBLE_COUNT : _HIGH_BUBBLE_COUNT;
  canvas2d.save();
  canvas2d.strokeStyle = 'rgba(160, 230, 255, 0.85)';
  canvas2d.lineWidth = 0.6;

  for (let i = 0; i < bubbleCount; i++) {
    const row       = _BUBBLE_DATA[i];
    const baseXFrac = row[0];
    const period    = row[1];
    const wobAmp    = row[2];
    const wobFreq   = row[3];
    const radius    = row[4];
    const alphaBase = row[5];
    const phaseOff  = row[6];

    // phase 0 = just appeared at bottom; phase 1 = reached top
    const phase = ((tS / period) + phaseOff) % 1.0;

    const y = heightPx * (1.0 - phase);
    const x = widthPx * baseXFrac + wobAmp * Math.sin(tS * wobFreq + phaseOff * 6.283);

    // Fade in from bottom and fade out near the top.
    const fadeEdge = Math.min(phase * 8.0, (1.0 - phase) * 6.0, 1.0);
    const alpha = alphaBase * fadeEdge;

    canvas2d.globalAlpha = alpha;
    canvas2d.beginPath();
    canvas2d.arc(x, y, radius, 0, Math.PI * 2);
    canvas2d.stroke();
  }

  canvas2d.restore();
}

// ── Height-aware caustics helpers ─────────────────────────────────────────────

/**
 * Draws an additional caustic pass into the light buffer where each ridge area
 * receives the pattern with a height-based parallax offset.
 *
 * The key principle: a raised seafloor intercepts light from a slightly different
 * position in the caustic field than a flat floor at the same (x, y).  By
 * offsetting the pattern transform in the implied light direction, ridge pixels
 * sample a different part of the texture — creating the appearance of depth.
 *
 * Each ridge is drawn using a clipped filled polygon (the ridge's fat stroke
 * region) so that the shifted pattern only appears within the ridge footprint.
 *
 * Performance:
 *   - Module-level `_matHeightAware` is mutated per ridge; no allocation.
 *   - Ridge polygon tracing uses only `ctx.moveTo` / `ctx.lineTo` — no arrays.
 *   - 4–7 ridges × ~20 points each: trivial per frame.
 */
function _drawCausticsHeightAwarePass(
  ctx: CanvasRenderingContext2D,
  bufW: number,
  bufH: number,
  bufScale: number,
  seafloor: SeafloorTerrainData,
  lowGraphics: boolean,
  worldOffX = 0,
  worldOffY = 0,
): void {
  if (!_patternA) return;

  const tileA = getCausticsTextureTile(lowGraphics);
  const tileW = tileA.width;
  const tileH = tileA.height;

  // Normalise ridge widths so the widest ridge = elevation 1.0.
  let maxWidth = 1;
  for (const ridge of seafloor.ridges) {
    if (ridge.width > maxWidth) maxWidth = ridge.width;
  }

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';

  for (const ridge of seafloor.ridges) {
    if (ridge.points.length < 2) continue;

    // Normalised elevation 0..1 (wider/more prominent ridge = higher elevation).
    const normElev = ridge.width / maxWidth;

    // Parallax shift in light-buffer pixels.
    // `bufScale` converts main-canvas pixels → light-buffer pixels (0.5 in high mode).
    const heightShift = normElev * CAUSTIC_HEIGHT_SHIFT_PX * bufScale;

    // Shifted pattern origin: offset in the opposite of the light direction so
    // raised pixels appear to sample from the "upstream" part of the caustic field.
    const shiftedE = ((_matA.e - _CAUSTIC_LIGHT_DIR_X * heightShift) % tileW + tileW) % tileW;
    const shiftedF = ((_matA.f - _CAUSTIC_LIGHT_DIR_Y * heightShift) % tileH + tileH) % tileH;

    // Build and clip to a filled polygon matching the ridge body footprint.
    const halfW = ridge.width * 0.5 * bufScale;
    ctx.save();
    ctx.beginPath();
    _traceRidgePolygon(ctx, ridge.points, halfW, bufScale, worldOffX, worldOffY);
    ctx.clip();

    // Draw the height-shifted pattern within the clipped ridge area.
    // Alpha is proportional to elevation so subtle ridges get a lighter touch.
    _matHeightAware.e = shiftedE;
    _matHeightAware.f = shiftedF;
    _patternA.setTransform(_matHeightAware);
    ctx.globalAlpha = (lowGraphics ? 0.22 : 0.32) * normElev;
    ctx.fillStyle = _patternA;
    ctx.fillRect(0, 0, bufW, bufH);

    // Restore _patternA to the main layer transform so subsequent draws are correct.
    _patternA.setTransform(_matA);

    ctx.restore();
  }

  ctx.restore();
}

/**
 * Draws a subtle screen-blended aqua brightness highlight along each ridge crest,
 * proportional to its normalised elevation.  Applied directly to the main canvas
 * after light-buffer compositing.
 *
 * Implements the formula: `brightnessMultiplier = 1 + elevation × CAUSTIC_ELEVATION_BRIGHTNESS_PER_LAYER`
 * by translating the fractional multiplier increment into a screen-blend alpha on
 * a teal-aqua stroke.  The stroke is narrower than the visual ridge body so it
 * concentrates on the crest rather than the full width.
 *
 * Brightness is clamped via `CAUSTIC_MAX_ELEVATION_BRIGHTNESS` to prevent
 * blown-out white patches even on the tallest ridges.
 */
function _drawCausticsElevationBrightness(
  ctx: CanvasRenderingContext2D,
  seafloor: SeafloorTerrainData,
  lowGraphics: boolean,
  worldOffX = 0,
  worldOffY = 0,
): void {
  let maxWidth = 1;
  for (const ridge of seafloor.ridges) {
    if (ridge.width > maxWidth) maxWidth = ridge.width;
  }

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#58d8e4';  // soft teal-aqua matching the caustic filament colour

  for (const ridge of seafloor.ridges) {
    if (ridge.points.length < 2) continue;

    const normElev = ridge.width / maxWidth;

    // Brightness alpha: elevation × per-layer constant, capped at max multiplier.
    const maxExtra    = CAUSTIC_MAX_ELEVATION_BRIGHTNESS - 1.0;
    const brightAlpha = Math.min(
      normElev * CAUSTIC_ELEVATION_BRIGHTNESS_PER_LAYER,
      maxExtra,
    ) * (lowGraphics ? 0.5 : 1.0);

    if (brightAlpha < 0.005) continue;

    ctx.globalAlpha = brightAlpha;
    // Stroke width slightly narrower than the body so the glow concentrates on the crest.
    ctx.lineWidth = ridge.width * 0.45;

    ctx.beginPath();
    ctx.moveTo(ridge.points[0].x - worldOffX, ridge.points[0].y - worldOffY);
    for (let i = 1; i < ridge.points.length; i++) {
      ctx.lineTo(ridge.points[i].x - worldOffX, ridge.points[i].y - worldOffY);
    }
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Traces a filled polygon representing the footprint of a ridge's body stroke.
 *
 * The polygon is built by walking the ridge centerline twice:
 *   1. Forward along the left-perpendicular edge (top of ridge).
 *   2. Backward along the right-perpendicular edge (bottom of ridge).
 *
 * The perpendicular at each point is derived from the average tangent of its
 * adjacent segments, giving smooth corners without sharp jags.
 *
 * All coordinates are scaled by `bufScale` to convert from main-canvas space
 * to light-buffer space.  No array allocations — uses only moveTo / lineTo.
 *
 * @param halfW  Half the ridge body width, already scaled to buffer space.
 */
function _traceRidgePolygon(
  ctx: CanvasRenderingContext2D,
  pts: readonly { x: number; y: number }[],
  halfW: number,
  scale: number,
  worldOffX = 0,
  worldOffY = 0,
): void {
  const n = pts.length;
  if (n < 2) return;

  // Forward pass: left/top perpendicular edge.
  for (let i = 0; i < n; i++) {
    // Tangent direction at point i (averaged from adjacent segments).
    const i0 = i > 0     ? i - 1 : 0;
    const i1 = i < n - 1 ? i + 1 : n - 1;
    const dx = pts[i1].x - pts[i0].x;
    const dy = pts[i1].y - pts[i0].y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const tx = dx / len;
    const ty = dy / len;
    // Left perpendicular: (-ty, tx)
    const x = (pts[i].x - worldOffX) * scale + (-ty) * halfW;
    const y = (pts[i].y - worldOffY) * scale + ( tx) * halfW;
    if (i === 0) ctx.moveTo(x, y);
    else         ctx.lineTo(x, y);
  }

  // Backward pass: right/bottom perpendicular edge.
  for (let i = n - 1; i >= 0; i--) {
    const i0 = i > 0     ? i - 1 : 0;
    const i1 = i < n - 1 ? i + 1 : n - 1;
    const dx = pts[i1].x - pts[i0].x;
    const dy = pts[i1].y - pts[i0].y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const tx = dx / len;
    const ty = dy / len;
    // Right perpendicular: (ty, -tx)
    const x = (pts[i].x - worldOffX) * scale + ( ty) * halfW;
    const y = (pts[i].y - worldOffY) * scale + (-tx) * halfW;
    ctx.lineTo(x, y);
  }

  ctx.closePath();
}
