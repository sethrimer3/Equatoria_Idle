/**
 * rpg-combat-effects-draw.ts — Draw functions for combat feedback visuals.
 *
 * Extracted from rpg-entity-draw.ts so that file stays focused on weapon
 * projectile rendering.  Covers the short-lived per-hit visual flourishes:
 *   - Death burst particles
 *   - Shot-line tracers from the player to each struck enemy
 *   - Expanding hit-flash squares at each struck enemy position
 *   - Floating damage numbers and "BLOCKED" labels
 *
 * All functions are pure: they accept `ctx: CanvasRenderingContext2D` and the
 * relevant array — no closure state.
 */

import type {
  DeathParticle, ShotLine, HitEffect, DamageNumber,
} from './rpg-types';
import {
  SHOT_LINE_DURATION_MS, HIT_EFFECT_DURATION_MS,
  DAMAGE_NUM_DURATION_MS, DAMAGE_NUM_FONT_FAMILY,
} from './rpg-constants';

// ── Low-graphics mode flag ────────────────────────────────────────────────────
let isLowGraphicsMode = false;

/** Sets low-graphics mode for combat-effects draw functions (skips glow). */
export function setLowGraphicsMode(enabled: boolean): void {
  isLowGraphicsMode = enabled;
}

// ── Draw functions ────────────────────────────────────────────────────────────

export function drawDeathParticles(ctx: CanvasRenderingContext2D, particles: DeathParticle[]): void {
  for (const p of particles) {
    ctx.globalAlpha = p.alpha; ctx.shadowBlur = isLowGraphicsMode ? 0 : p.size * 3; ctx.shadowColor = p.color;
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.floor(p.x - p.size / 2), Math.floor(p.y - p.size / 2), Math.ceil(p.size), Math.ceil(p.size));
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

export function drawShotLines(ctx: CanvasRenderingContext2D, lines: ShotLine[]): void {
  if (lines.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (const line of lines) {
    const t = line.timerMs / SHOT_LINE_DURATION_MS;
    ctx.globalAlpha = t * 0.7;
    ctx.strokeStyle = line.color;
    ctx.shadowBlur  = isLowGraphicsMode ? 0 : 3; ctx.shadowColor = line.color;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
  }
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  ctx.restore();
}

export function drawHitEffects(ctx: CanvasRenderingContext2D, effects: HitEffect[]): void {
  if (effects.length === 0) return;
  ctx.save();
  for (const h of effects) {
    const t    = h.timerMs / HIT_EFFECT_DURATION_MS;
    const size = 3 + (1 - t) * 5;
    const half = size / 2;
    ctx.globalAlpha = t * 0.9;
    ctx.shadowBlur  = isLowGraphicsMode ? 0 : size * 3; ctx.shadowColor = h.color; ctx.fillStyle = h.color;
    ctx.fillRect(Math.floor(h.x - half), Math.floor(h.y - half), Math.ceil(size), Math.ceil(size));
  }
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  ctx.restore();
}

export function drawDamageNumbers(ctx: CanvasRenderingContext2D, numbers: DamageNumber[]): void {
  if (numbers.length === 0) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const dn of numbers) {
    const t = dn.timerMs / DAMAGE_NUM_DURATION_MS;
    // Fade in sharply, then hold, then fade out in the last third.
    const alpha = t > 0.33 ? 1.0 : t / 0.33;
    ctx.globalAlpha = alpha;
    const fontPx = Math.max(1, Math.round(dn.fontPx));
    ctx.font = `bold ${fontPx}px ${DAMAGE_NUM_FONT_FAMILY}`;
    ctx.shadowBlur  = isLowGraphicsMode ? 0 : fontPx * 2;
    ctx.shadowColor = dn.color;
    ctx.lineWidth = Math.max(2, Math.round(fontPx * 0.16));
    ctx.strokeStyle = '#000000';

    const x = Math.round(dn.x);
    const y = Math.round(dn.y);

    // Build gradient fill when both a source (weapon) and target (enemy) color are available.
    // The gradient flows top-to-bottom: sourceColor at top → enemy color at bottom.
    // This creates a "slashing" feel where the weapon color bleeds into the enemy color.
    if (dn.sourceColor && dn.sourceColor !== dn.color) {
      const halfH = Math.max(fontPx * 0.6, 4);
      const grad = ctx.createLinearGradient(x, y - halfH, x, y + halfH);
      grad.addColorStop(0, dn.sourceColor);
      grad.addColorStop(1, dn.color);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = dn.color;
    }

    ctx.strokeText(dn.text, x, y);
    ctx.fillText(dn.text, x, y);
  }
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  ctx.restore();
}
