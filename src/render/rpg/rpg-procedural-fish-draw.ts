/**
 * rpg-procedural-fish-draw.ts — Canvas rendering for the 8 fish creature types
 * and fish-related projectiles/hazards.
 *
 * Fish share a common silhouette renderer (drawProceduralFishSilhouette) which
 * handles body bend, fins, tail, and glow.  Per-species draw functions layer
 * species-specific details on top (shields, decoys, mines, etc.).
 *
 * Extracted from rpg-procedural-draw.ts to keep that file manageable.
 */

import type {
  SandFishEnemy, QuartzFishEnemy, RubyFishEnemy, SunstoneFishEnemy,
  EmeraldFishEnemy, SapphireFishEnemy, AmethystFishEnemy, DiamondFishEnemy,
  FishMine, FishSpike, FishBolt, FishDecoy,
} from './rpg-procedural-types';
import {
  SANDFISH_SIZE, SANDFISH_COLOR, SANDFISH_GLOW,
  QUARTZFISH_SIZE, QUARTZFISH_COLOR, QUARTZFISH_GLOW,
  RUBYFISH_SIZE, RUBYFISH_COLOR, RUBYFISH_GLOW,
  SUNSTONEFISH_SIZE, SUNSTONEFISH_COLOR, SUNSTONEFISH_GLOW,
  EMERALDFISH_SIZE, EMERALDFISH_MINI_SIZE, EMERALDFISH_COLOR, EMERALDFISH_GLOW,
  SAPPHIREFISH_SIZE, SAPPHIREFISH_COLOR, SAPPHIREFISH_GLOW,
  AMETHYSTFISH_SIZE, AMETHYSTFISH_COLOR, AMETHYSTFISH_GLOW,
  DIAMONDFISH_SIZE, DIAMONDFISH_COLOR, DIAMONDFISH_GLOW,
} from './rpg-procedural-constants';

// ── Low-graphics flag (mirrors rpg-procedural-draw; toggled via setFishDrawLowGraphics) ──
let isLowGraphicsMode = false;
export function setFishDrawLowGraphics(enabled: boolean): void {
  isLowGraphicsMode = enabled;
}

// ── Shared draw helpers ────────────────────────────────────────────────────────
function applyGlow(ctx: CanvasRenderingContext2D, color: string, blur: number): void {
  if (isLowGraphicsMode) return;
  ctx.shadowBlur  = blur;
  ctx.shadowColor = color;
}
function clearGlow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowBlur = 0;
}

/** HP-bar fraction 0-1. */
function hpFrac(e: { hp: number; maxHp: number }): number {
  return e.maxHp > 0 ? Math.max(0, e.hp / e.maxHp) : 0;
}

/** Draw a small hit-flash overlay (white circle, fades quickly). */
function drawHitFlash(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, flashMs: number): void {
  if (flashMs <= 0 || isLowGraphicsMode) return;
  ctx.save();
  ctx.globalAlpha = Math.min(flashMs / 80, 1) * 0.7;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x, y, r * 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Draw an HP bar 2px tall below the enemy. */
function drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, frac: number): void {
  const w = r * 2.5, h = 2, bx = x - w / 2, by = y + r + 2;
  ctx.fillStyle = '#333';
  ctx.fillRect(bx, by, w, h);
  ctx.fillStyle = frac > 0.5 ? '#44ff44' : frac > 0.25 ? '#ffaa00' : '#ff3333';
  ctx.fillRect(bx, by, w * frac, h);
}

// ── Fish enemies and projectiles ───────────────────────────────────────────────

/** Options forwarded to the fish silhouette renderer. */
interface FishDrawOpts {
  /** Overall opacity [0–1]; undefined = fully opaque. */
  alpha?: number;
  /** When true, draw white diamond-armor facets inside the body. */
  diamond?: boolean;
  /** When true, reduce swim-bend amplitude (ruby dash: body straightens). */
  rubyDash?: boolean;
  /** When true, increase tail-beat frequency (mini emerald fish). */
  fastTwitch?: boolean;
}

/**
 * Build a function that maps a local x coordinate to a Y swim-bend offset.
 * Bend is zero near the head and grows toward the tail, modelled as a power
 * curve so the body looks natural.  Amplitude is tuned per fish state.
 */
function getFishBendFn(
  animPhase: number,
  size: number,
  opts?: FishDrawOpts,
): (px: number) => number {
  const beatFreq = opts?.fastTwitch ? 3.4 : 2.8;
  let amplitude = size * 0.38;
  if (opts?.rubyDash) amplitude *= 0.25;  // straighten during high-speed dash
  if (opts?.diamond)  amplitude *= 0.70;  // gentler sway when armour is up

  const rawBend   = Math.sin(animPhase * beatFreq) * amplitude;
  const xHead     =  size * 1.20;
  const xTailBase = -size * 1.05;
  const range     = xHead - xTailBase;

  return (px: number): number => {
    const t = (xHead - px) / range;
    return rawBend * Math.pow(Math.max(0, t), 1.5);
  };
}

/**
 * Draw two small pectoral fins near the front of the fish body.
 * Each fin is a short ellipse rotated slightly outward and rendered at
 * reduced opacity so the body silhouette remains the dominant shape.
 */
function drawFishFins(
  ctx: CanvasRenderingContext2D,
  s: number,
  bendFn: (px: number) => number,
  bodyColor: string,
): void {
  const attachX  = s * 0.35;
  const bFin     = bendFn(attachX);
  const finHalfL = s * 0.58;   // half-length along body axis
  const finHalfW = s * 0.22;   // half-width perpendicular
  const fanAngle = 0.50;        // rotation outward (rad)

  ctx.save();
  ctx.fillStyle = bodyColor;
  ctx.globalAlpha *= 0.68;

  // Upper fin (top-down left)
  ctx.save();
  ctx.translate(attachX, bFin - s * 0.48);
  ctx.rotate(-fanAngle);
  ctx.beginPath();
  ctx.ellipse(0, 0, finHalfL, finHalfW, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Lower fin (top-down right)
  ctx.save();
  ctx.translate(attachX, bFin + s * 0.48);
  ctx.rotate(fanAngle);
  ctx.beginPath();
  ctx.ellipse(0, 0, finHalfL, finHalfW, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

/**
 * Draw two subtle internal crystal-facet lines.
 * Uses a very low alpha so they read as gemstone highlights without looking
 * like cartoon eye markings.  Skipped entirely in low-graphics mode.
 */
function drawFishFacets(
  ctx: CanvasRenderingContext2D,
  s: number,
  bendFn: (px: number) => number,
): void {
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth   = Math.max(0.5, s * 0.08);
  ctx.globalAlpha = 0.18;
  ctx.lineCap     = 'round';

  // Facet line A: diagonal across the front half of the body
  ctx.beginPath();
  ctx.moveTo(s * 0.80, bendFn(s * 0.80) - s * 0.22);
  ctx.lineTo(s * 0.10, bendFn(s * 0.10) + s * 0.30);
  ctx.stroke();

  // Facet line B: shorter cut across the mid-body
  ctx.beginPath();
  ctx.moveTo(s * 0.15, bendFn(s * 0.15) - s * 0.40);
  ctx.lineTo(-s * 0.30, bendFn(-s * 0.30) + s * 0.12);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw a single gem-fish using a top-down silhouette approach.
 *
 * The fish is rendered in local space (faces +X), then rotated by `swimAngle`.
 * A bezier-curve outline produces a rounded head, tapered body, pectoral fins,
 * and a forked caudal tail.  A swim-bend function displaces body and tail points
 * along Y so the fish visibly undulates with `animPhase`.  No eye or pupil is
 * drawn at any point.
 */
function drawProceduralFishSilhouette(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  swimAngle: number,
  animPhase: number,
  bodyColor: string,
  glowColor: string,
  opts?: FishDrawOpts,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(swimAngle);
  if (opts?.alpha !== undefined && opts.alpha < 1) ctx.globalAlpha = opts.alpha;

  const s      = size;
  const bendFn = getFishBendFn(animPhase, s, opts);

  // Key x positions (local coords; fish faces +X)
  const xH   =  s * 1.20;   // head tip
  const xM   =  s * 0.05;   // mid-body (widest)
  const xTB  = -s * 1.05;   // tail base
  const xTT  = -s * 1.80;   // tail lobe tips

  // Half-widths at key sections
  const hwH  = s * 0.30;    // head
  const hwM  = s * 0.60;    // mid (widest)
  const hwTB = s * 0.18;    // tail base

  // Y bend offsets at each key x
  const bH   = bendFn(xH);
  const bM   = bendFn(xM);
  const bTB  = bendFn(xTB);
  const bTT  = bendFn(xTT);

  // Forked tail lobe tips (slight asymmetry for organic feel)
  const lobeSpread = s * 0.30;
  const upperTipY  = bTT - lobeSpread;
  const lowerTipY  = bTT + lobeSpread;

  // Notch between tail lobes (slightly inward from tips in X)
  const xNotch = xTT + s * 0.20;
  const bNotch = bendFn(xNotch);

  // ── Body silhouette ──────────────────────────────────────────────
  applyGlow(ctx, glowColor, s + 4);
  ctx.fillStyle = bodyColor;
  ctx.beginPath();

  // Head tip (rounded nose: both top and bottom beziers meet here smoothly)
  ctx.moveTo(xH, bH);

  // Top outline: head → widest body → tail base
  ctx.bezierCurveTo(
    xH - s * 0.05, bH - hwH,
    xM + s * 0.55, bM - hwM,
    xM, bM - hwM,
  );
  ctx.bezierCurveTo(
    xM - s * 0.50, bM - hwM,
    xTB + s * 0.28, bTB - hwTB,
    xTB, bTB - hwTB,
  );

  // Upper tail lobe
  ctx.bezierCurveTo(
    xTB - s * 0.22, bTB - hwTB * 1.6,
    xTT + s * 0.18, upperTipY - s * 0.04,
    xTT, upperTipY,
  );

  // Tail notch (concave between lobes)
  ctx.bezierCurveTo(
    xTT + s * 0.10, upperTipY + s * 0.10,
    xNotch + s * 0.05, bNotch - s * 0.04,
    xNotch, bNotch,
  );

  // Lower tail lobe
  ctx.bezierCurveTo(
    xNotch + s * 0.05, bNotch + s * 0.04,
    xTT + s * 0.10, lowerTipY - s * 0.10,
    xTT, lowerTipY,
  );

  // Bottom outline: tail base → widest body → head tip
  ctx.bezierCurveTo(
    xTT + s * 0.18, lowerTipY + s * 0.04,
    xTB - s * 0.22, bTB + hwTB * 1.6,
    xTB, bTB + hwTB,
  );
  ctx.bezierCurveTo(
    xTB + s * 0.28, bTB + hwTB,
    xM - s * 0.50, bM + hwM,
    xM, bM + hwM,
  );
  ctx.bezierCurveTo(
    xM + s * 0.55, bM + hwM,
    xH - s * 0.05, bH + hwH,
    xH, bH,
  );

  ctx.closePath();
  ctx.fill();
  clearGlow(ctx);

  // ── Pectoral fins ────────────────────────────────────────────────
  drawFishFins(ctx, s, bendFn, bodyColor);

  // ── Internal crystal facets (detail pass, skipped in low-graphics) ──
  if (!isLowGraphicsMode) {
    drawFishFacets(ctx, s, bendFn);
  }

  // ── Diamond armor overlay (white facet lines when armor is active) ──
  if (opts?.diamond) {
    ctx.save();
    ctx.strokeStyle = '#ddfbff';
    ctx.lineWidth   = Math.max(0.7, s * 0.10);
    ctx.globalAlpha = 0.55;
    ctx.lineCap     = 'round';

    const fA = bendFn(s * 0.50);
    const fB = bendFn(-s * 0.30);
    // Diagonal armour shard crossing the body
    ctx.beginPath();
    ctx.moveTo(s * 0.50, fA - hwM * 0.60);
    ctx.lineTo(-s * 0.30, fB + hwM * 0.55);
    ctx.stroke();
    // Transverse shard at mid-body
    ctx.beginPath();
    ctx.moveTo(s * 0.05, bM - hwM * 0.48);
    ctx.lineTo(s * 0.05, bM + hwM * 0.48);
    ctx.stroke();

    ctx.restore();
  }

  ctx.restore();
}

export function drawSandFishEnemies(canvas: CanvasRenderingContext2D, enemies: SandFishEnemy[]): void {
  for (const e of enemies) {
    drawProceduralFishSilhouette(canvas, e.x, e.y, SANDFISH_SIZE, e.swimAngle, e.animPhase, SANDFISH_COLOR, SANDFISH_GLOW);
    drawHitFlash(canvas, e.x, e.y, SANDFISH_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, SANDFISH_SIZE, hpFrac(e));
  }
}

export function drawQuartzFishEnemies(canvas: CanvasRenderingContext2D, enemies: QuartzFishEnemy[]): void {
  for (const e of enemies) {
    drawProceduralFishSilhouette(canvas, e.x, e.y, QUARTZFISH_SIZE, e.swimAngle, e.animPhase, QUARTZFISH_COLOR, QUARTZFISH_GLOW);
    if (!e.shieldBroken && e.shieldHp > 0) {
      canvas.save();
      canvas.strokeStyle = QUARTZFISH_GLOW;
      canvas.globalAlpha = 0.6;
      canvas.lineWidth = 1.5;
      canvas.beginPath();
      canvas.arc(e.x, e.y, QUARTZFISH_SIZE + 4, 0, Math.PI * 2);
      canvas.stroke();
      canvas.restore();
    }
    drawHitFlash(canvas, e.x, e.y, QUARTZFISH_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, QUARTZFISH_SIZE, hpFrac(e));
  }
}

export function drawRubyFishEnemies(canvas: CanvasRenderingContext2D, enemies: RubyFishEnemy[]): void {
  for (const e of enemies) {
    const alpha    = e.dashState === 'windup' ? 0.65 : 1;
    const rubyDash = e.dashState === 'dash';
    drawProceduralFishSilhouette(canvas, e.x, e.y, RUBYFISH_SIZE, e.swimAngle, e.animPhase, RUBYFISH_COLOR, RUBYFISH_GLOW, { alpha, rubyDash });
    drawHitFlash(canvas, e.x, e.y, RUBYFISH_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, RUBYFISH_SIZE, hpFrac(e));
  }
}

export function drawSunstoneFishEnemies(canvas: CanvasRenderingContext2D, enemies: SunstoneFishEnemy[]): void {
  for (const e of enemies) {
    drawProceduralFishSilhouette(canvas, e.x, e.y, SUNSTONEFISH_SIZE, e.swimAngle, e.animPhase, SUNSTONEFISH_COLOR, SUNSTONEFISH_GLOW);
    drawHitFlash(canvas, e.x, e.y, SUNSTONEFISH_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, SUNSTONEFISH_SIZE, hpFrac(e));
  }
}

export function drawEmeraldFishEnemies(canvas: CanvasRenderingContext2D, enemies: EmeraldFishEnemy[]): void {
  for (const e of enemies) {
    const size = e.isMini ? EMERALDFISH_MINI_SIZE : EMERALDFISH_SIZE;
    drawProceduralFishSilhouette(canvas, e.x, e.y, size, e.swimAngle, e.animPhase, EMERALDFISH_COLOR, EMERALDFISH_GLOW, { alpha: e.isMini ? 0.9 : 1, fastTwitch: e.isMini });
    drawHitFlash(canvas, e.x, e.y, size, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, size, hpFrac(e));
  }
}

export function drawSapphireFishEnemies(canvas: CanvasRenderingContext2D, enemies: SapphireFishEnemy[]): void {
  for (const e of enemies) {
    drawProceduralFishSilhouette(canvas, e.x, e.y, SAPPHIREFISH_SIZE, e.swimAngle, e.animPhase, SAPPHIREFISH_COLOR, SAPPHIREFISH_GLOW);
    drawHitFlash(canvas, e.x, e.y, SAPPHIREFISH_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, SAPPHIREFISH_SIZE, hpFrac(e));
  }
}

export function drawAmethystFishEnemies(canvas: CanvasRenderingContext2D, enemies: AmethystFishEnemy[]): void {
  for (const e of enemies) {
    drawProceduralFishSilhouette(canvas, e.x, e.y, AMETHYSTFISH_SIZE, e.swimAngle, e.animPhase, AMETHYSTFISH_COLOR, AMETHYSTFISH_GLOW);
    drawHitFlash(canvas, e.x, e.y, AMETHYSTFISH_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, AMETHYSTFISH_SIZE, hpFrac(e));
  }
}

export function drawDiamondFishEnemies(canvas: CanvasRenderingContext2D, enemies: DiamondFishEnemy[]): void {
  for (const e of enemies) {
    drawProceduralFishSilhouette(canvas, e.x, e.y, DIAMONDFISH_SIZE, e.swimAngle, e.animPhase, DIAMONDFISH_COLOR, DIAMONDFISH_GLOW, { diamond: e.armorActive });
    if (e.armorActive) {
      canvas.save();
      canvas.strokeStyle = DIAMONDFISH_GLOW;
      canvas.globalAlpha = 0.75;
      canvas.lineWidth = 2;
      canvas.beginPath();
      canvas.arc(e.x, e.y, DIAMONDFISH_SIZE + 3, 0, Math.PI * 2);
      canvas.stroke();
      canvas.restore();
    }
    drawHitFlash(canvas, e.x, e.y, DIAMONDFISH_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, DIAMONDFISH_SIZE, hpFrac(e));
  }
}

export function drawFishMines(canvas: CanvasRenderingContext2D, mines: FishMine[]): void {
  for (const m of mines) {
    canvas.save();
    applyGlow(canvas, SUNSTONEFISH_GLOW, 6);
    canvas.globalAlpha = m.armedMs > 0 ? 0.75 : 1;
    canvas.fillStyle = SUNSTONEFISH_COLOR;
    canvas.beginPath();
    canvas.arc(m.x, m.y, 4, 0, Math.PI * 2);
    canvas.fill();
    clearGlow(canvas);
    canvas.restore();
  }
}

export function drawFishSpikes(canvas: CanvasRenderingContext2D, spikes: FishSpike[]): void {
  for (const s of spikes) {
    canvas.save();
    canvas.translate(s.x, s.y);
    canvas.rotate(Math.atan2(s.vy, s.vx));
    canvas.fillStyle = SUNSTONEFISH_GLOW;
    canvas.beginPath();
    canvas.moveTo(5, 0);
    canvas.lineTo(-4, -2);
    canvas.lineTo(-4, 2);
    canvas.closePath();
    canvas.fill();
    canvas.restore();
  }
}

export function drawFishBolts(canvas: CanvasRenderingContext2D, bolts: FishBolt[]): void {
  for (const b of bolts) {
    canvas.save();
    applyGlow(canvas, SAPPHIREFISH_GLOW, 6);
    canvas.fillStyle = SAPPHIREFISH_COLOR;
    canvas.beginPath();
    canvas.arc(b.x, b.y, 3, 0, Math.PI * 2);
    canvas.fill();
    clearGlow(canvas);
    canvas.restore();
  }
}

export function drawFishDecoys(canvas: CanvasRenderingContext2D, decoys: FishDecoy[]): void {
  for (const d of decoys) {
    const alpha = Math.max(0, d.lifeMs / 1500) * 0.5;
    drawProceduralFishSilhouette(canvas, d.x, d.y, AMETHYSTFISH_SIZE, d.swimAngle, d.animPhase, AMETHYSTFISH_COLOR, AMETHYSTFISH_GLOW, { alpha });
  }
}
