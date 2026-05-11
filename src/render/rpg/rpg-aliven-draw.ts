/**
 * rpg-aliven-draw.ts — Canvas rendering for the AlivenParticle enemy system.
 *
 * Draws pulsing glow circles, comet trails, spitter windup rings, and bullets.
 * setAlivenLowGraphics() is called by rpg-render.ts via setLowGraphicsMode().
 */

import type { AlivenParticleGroup, AlivenParticle, AlivenBullet } from './rpg-aliven-types';
import { ALIVEN_SPITTER_WINDUP_MS } from './rpg-aliven-constants';

let _lowGraphics = false;

/** Called from rpg-render.ts when the graphics mode toggles. */
export function setAlivenLowGraphics(enabled: boolean): void {
  _lowGraphics = enabled;
}

/** Draws all alive particles and bullets for every group. */
export function drawAlivenGroups(
  ctx: CanvasRenderingContext2D,
  groups: AlivenParticleGroup[],
): void {
  for (const group of groups) {
    for (const p of group.particles) {
      if (!p.isAlive) continue;
      drawParticle(ctx, p);
    }
    for (const b of group.bullets) {
      drawBullet(ctx, b);
    }
  }
}

function drawParticle(ctx: CanvasRenderingContext2D, p: AlivenParticle): void {
  const pulse = 0.78 + 0.22 * Math.sin(p.pulseMs / 420);
  const r     = p.radiusPx * pulse;
  const isFlashing = p.hitFlashMs > 0;
  const isGhost    = p.ghostMs > 0;

  // Comet trail (ember and dasher only, skip in low-graphics mode)
  if (!_lowGraphics && p.trail.length >= 2) {
    ctx.save();
    for (let i = 1; i < p.trail.length; i++) {
      const t = i / p.trail.length;
      ctx.globalAlpha = t * 0.35;
      ctx.strokeStyle = p.color;
      ctx.lineWidth   = r * t * 0.7;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(p.trail[i - 1].x, p.trail[i - 1].y);
      ctx.lineTo(p.trail[i].x,     p.trail[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.save();

  if (isGhost) {
    // Ghost phase: semi-transparent with pulsing ring indicator
    const ghostPulse = 0.3 + 0.25 * Math.sin(p.pulseMs / 150);
    ctx.globalAlpha = ghostPulse;
    ctx.fillStyle   = p.color;
    if (!_lowGraphics) {
      ctx.shadowBlur  = r * 2;
      ctx.shadowColor = p.glowColor;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    // Faint outer ring to indicate ghost state
    ctx.globalAlpha = ghostPulse * 0.6;
    ctx.strokeStyle = p.glowColor;
    ctx.lineWidth   = 0.8;
    ctx.shadowBlur  = 0;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Glow (skip in low-graphics mode)
  if (!_lowGraphics) {
    ctx.shadowBlur  = r * 3.5;
    ctx.shadowColor = p.glowColor;
  }

  ctx.globalAlpha = 0.90;
  ctx.fillStyle   = isFlashing ? '#ffffff' : p.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();

  // Healer: extra outer ring to mark it as special
  if (p.specialKind === 'healer') {
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = p.glowColor;
    ctx.lineWidth   = 0.8;
    ctx.shadowBlur  = 0;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 2.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Spitter wind-up ring
  if (p.windupMs > 0) {
    const frac = Math.min(1, p.windupMs / ALIVEN_SPITTER_WINDUP_MS);
    ctx.globalAlpha = frac * 0.65;
    ctx.strokeStyle = p.glowColor;
    ctx.lineWidth   = 1;
    ctx.shadowBlur  = 0;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 2 + frac * 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawBullet(ctx: CanvasRenderingContext2D, b: AlivenBullet): void {
  ctx.save();
  if (!_lowGraphics) {
    ctx.shadowBlur  = 7;
    ctx.shadowColor = b.color;
  }
  ctx.globalAlpha = 0.85;
  ctx.fillStyle   = b.color;
  ctx.beginPath();
  ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
