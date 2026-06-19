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
  DeathParticle, ShotLine, HitEffect, DamageNumber, ComboEffect, WardEffect,
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

/**
 * Draw short-lived per-combo burst effects at the point of impact.
 * t = timerMs / totalMs ranges from 1 (just spawned) to 0 (expiring).
 */
export function drawComboEffects(ctx: CanvasRenderingContext2D, effects: ComboEffect[]): void {
  if (effects.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (const e of effects) {
    const t = e.timerMs / e.totalMs;
    ctx.shadowColor = e.color;
    const glow = isLowGraphicsMode ? 0 : 6;
    switch (e.comboId) {
      case 'steamBurst': {
        ctx.globalAlpha = t * 0.85; ctx.shadowBlur = glow; ctx.strokeStyle = e.color;
        const r1 = 8 + (1 - t) * 72; const r2 = 4 + (1 - t) * 40;
        ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(e.x, e.y, r1, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = t * 0.5; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(e.x, e.y, r2, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'shatter': {
        ctx.globalAlpha = t; ctx.shadowBlur = glow; ctx.strokeStyle = e.color; ctx.lineWidth = 1.5;
        const len = (1 - t) * 44;
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          ctx.beginPath(); ctx.moveTo(e.x + Math.cos(ang) * 4, e.y + Math.sin(ang) * 4);
          ctx.lineTo(e.x + Math.cos(ang) * (4 + len), e.y + Math.sin(ang) * (4 + len)); ctx.stroke();
        }
        break;
      }
      case 'toxicRupture': {
        ctx.globalAlpha = t * 0.9; ctx.shadowBlur = glow; ctx.strokeStyle = e.color; ctx.lineWidth = 2.5;
        const rO = Math.max(1, (1 - t) * 52);
        ctx.beginPath(); ctx.arc(e.x, e.y, rO, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = t * 0.4; ctx.fillStyle = e.color; ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(e.x, e.y, Math.max(1, rO * 0.35), 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'gravityCollapse': {
        const rC = t * 68;
        if (rC > 1) {
          ctx.globalAlpha = t; ctx.shadowBlur = glow; ctx.strokeStyle = e.color;
          ctx.lineWidth = 2 + t * 2; ctx.beginPath(); ctx.arc(e.x, e.y, rC, 0, Math.PI * 2); ctx.stroke();
        }
        break;
      }
      case 'riftDetonation': {
        ctx.globalAlpha = t; ctx.shadowBlur = glow; ctx.strokeStyle = e.color; ctx.lineWidth = 1.5;
        const rB = (1 - t) * 56;
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2 + t * 0.8;
          const jag = Math.sin(t * Math.PI * 4 + i) * 8;
          ctx.beginPath(); ctx.moveTo(e.x + Math.cos(ang) * 6, e.y + Math.sin(ang) * 6);
          ctx.lineTo(e.x + Math.cos(ang + 0.18) * (rB + jag), e.y + Math.sin(ang + 0.18) * (rB + jag)); ctx.stroke();
          if (rB > 1) { ctx.beginPath(); ctx.arc(e.x, e.y, rB * 0.6, ang - 0.15, ang + 0.15); ctx.stroke(); }
        }
        break;
      }
      default: break;
    }
  }
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  ctx.restore();
}
