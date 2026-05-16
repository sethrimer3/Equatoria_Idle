/**
 * rpg-weapon-sand-drift.ts — Sand drift pixel effect for the sand blade.
 *
 * Extracted from rpg-weapon-draw-sword.ts to keep that file focused on
 * sword/blade polygon drawing.  Each swing spawns a set of tiny 2×2 pixel
 * sand-colored squares that drift slowly and fade out over 2 seconds.
 *
 * Exports:
 *   spawnSandSwingPixels   — emit pixels along a swing arc
 *   updateSandDriftPixels  — advance pixel physics each frame
 *   drawSandDriftPixels    — render all active pixels
 */

import { SAND_BLADE_COLORS } from './rpg-weapon-constants';

// ── Sand drift pixel constants ────────────────────────────────

/** Total lifetime of each sand drift pixel (ms). */
const SAND_PIXEL_LIFE_MS    = 2000;
/** Number of pixels spawned per swing. */
const SAND_PIXEL_SPAWN_COUNT = 30;
/** Pixel size in canvas px. */
const SAND_PIXEL_SIZE        = 2;
/** Max drift speed (px/ms). */
const SAND_PIXEL_MAX_SPEED   = 0.08;

interface SandDriftPixel {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Remaining lifetime, counts down from SAND_PIXEL_LIFE_MS to 0. */
  lifeMs: number;
  color: string;
}

const _sandDriftPixels: SandDriftPixel[] = [];

/**
 * Spawn sand drift pixels along the sword arc when a new swing begins.
 * Called by rpg-render.ts on the first frame of each sand blade swing.
 */
export function spawnSandSwingPixels(
  mx: number, my: number,
  arcStart: number, arcEnd: number,
  swordLength: number,
): void {
  for (let i = 0; i < SAND_PIXEL_SPAWN_COUNT; i++) {
    const angle  = arcStart + Math.random() * (arcEnd - arcStart);
    const dist   = swordLength * (0.25 + Math.random() * 0.75);
    const x      = mx + Math.cos(angle) * dist;
    const y      = my + Math.sin(angle) * dist;
    const dir    = Math.random() * Math.PI * 2;
    const speed  = SAND_PIXEL_MAX_SPEED * (0.3 + Math.random() * 0.7);
    const color  = SAND_BLADE_COLORS[Math.floor(Math.random() * SAND_BLADE_COLORS.length)];
    _sandDriftPixels.push({ x, y, vx: Math.cos(dir) * speed, vy: Math.sin(dir) * speed, lifeMs: SAND_PIXEL_LIFE_MS, color });
  }
}

/** Advance sand drift pixels by deltaMs. Call once per frame when sand blade is active. */
export function updateSandDriftPixels(deltaMs: number): void {
  for (let i = _sandDriftPixels.length - 1; i >= 0; i--) {
    const p = _sandDriftPixels[i];
    p.x      += p.vx * deltaMs;
    p.y      += p.vy * deltaMs;
    p.lifeMs -= deltaMs;
    if (p.lifeMs <= 0) _sandDriftPixels.splice(i, 1);
  }
}

/** Draw all active sand drift pixels as 2×2 sand-colored squares that fade over time. */
export function drawSandDriftPixels(ctx: CanvasRenderingContext2D): void {
  if (_sandDriftPixels.length === 0) return;
  ctx.save();
  for (const p of _sandDriftPixels) {
    const alpha = p.lifeMs / SAND_PIXEL_LIFE_MS;
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle   = p.color;
    ctx.fillRect(Math.floor(p.x), Math.floor(p.y), SAND_PIXEL_SIZE, SAND_PIXEL_SIZE);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
