/**
 * rpg-aliven-draw.ts — Canvas rendering for the AlivenParticle enemy system.
 *
 * Draws pulsing glow circles, comet trails, spitter windup rings, and bullets.
 * Also renders:
 *   - Pulser shockwave ring (pulserFlashMs > 0)
 *   - Healer beam to last healed target (healBeamMs > 0)
 *   - Group centroid glow (subtle cohesion indicator)
 *   - Group health bar (aliveCount / targetCount)
 *   - Splitter death burst ring (group.splitFlashMs > 0)
 *   - Spitter bullets with a bright center highlight for dodge readability
 * setAlivenLowGraphics() is called by rpg-render.ts via setLowGraphicsMode().
 */

import type { AlivenParticleGroup, AlivenParticle, AlivenBullet } from './rpg-aliven-types';
import { ALIVEN_SPITTER_WINDUP_MS, ALIVEN_PULSE_RADIUS_PX } from './rpg-aliven-constants';

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
    // Group centroid glow (drawn before particles so it appears behind them).
    if (!_lowGraphics && group.aliveCount > 0) {
      drawCentroidGlow(ctx, group);
    }
    // Elite gold halo (drawn behind particles).
    if (group.isElite && group.aliveCount > 0) {
      drawEliteHalo(ctx, group);
    }
    // Splitter death burst ring.
    if (group.splitFlashMs > 0) {
      drawSplitBurst(ctx, group);
    }
    for (const p of group.particles) {
      if (!p.isAlive) continue;
      // Healer beam (drawn before the particle so it appears behind the healer body).
      if (p.specialKind === 'healer' && p.healBeamMs > 0) {
        drawHealerBeam(ctx, p);
      }
      drawParticle(ctx, p, group.isElite);
    }
    for (const b of group.bullets) {
      drawBullet(ctx, b);
    }
    // Group health bar (drawn on top of particles).
    if (group.aliveCount > 0 && group.targetCount > 1) {
      drawGroupHealthBar(ctx, group);
    }
    // Elite crown marker above health bar.
    if (group.isElite && group.aliveCount > 0) {
      drawEliteCrown(ctx, group);
    }
  }
}

// ── Elite halo & crown ────────────────────────────────────────────

/** Pulsing golden ring drawn behind the swarm to mark elite groups. */
function drawEliteHalo(ctx: CanvasRenderingContext2D, group: AlivenParticleGroup): void {
  ctx.save();
  ctx.globalAlpha = 0.40;
  ctx.strokeStyle = '#ffdd66';
  ctx.lineWidth = 1.5;
  if (!_lowGraphics) {
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ffaa00';
  }
  ctx.beginPath();
  ctx.arc(group.cx, group.cy, 20, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Small crown drawn above the health bar to identify elite groups. */
function drawEliteCrown(ctx: CanvasRenderingContext2D, group: AlivenParticleGroup): void {
  // Crown is centred at group.cx, just above the health bar (which sits at cy - 14).
  const cx = group.cx;
  const baseY = group.cy - 19; // bottom of crown
  const tipH = 5;              // height of each crown point
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#ffdd66';
  if (!_lowGraphics) {
    ctx.shadowBlur = 4;
    ctx.shadowColor = '#ffaa00';
  }
  // Three crown points: left, centre, right
  const w = 5; // half-width of crown base
  ctx.beginPath();
  // Left point
  ctx.moveTo(cx - w, baseY);
  ctx.lineTo(cx - w + 1, baseY - tipH + 1);
  ctx.lineTo(cx - w + 2, baseY);
  // Centre point (taller)
  ctx.lineTo(cx - 1, baseY);
  ctx.lineTo(cx, baseY - tipH - 1);
  ctx.lineTo(cx + 1, baseY);
  // Right point
  ctx.lineTo(cx + w - 2, baseY);
  ctx.lineTo(cx + w - 1, baseY - tipH + 1);
  ctx.lineTo(cx + w, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ── Centroid glow ─────────────────────────────────────────────────

function drawCentroidGlow(ctx: CanvasRenderingContext2D, group: AlivenParticleGroup): void {
  // Skip if the group has almost all particles alive (glow would be too obvious/bright).
  const healthRatio = group.aliveCount / Math.max(1, group.targetCount);
  if (healthRatio <= 0) return;
  ctx.save();
  ctx.globalAlpha = healthRatio * 0.12;
  ctx.shadowBlur  = 18;
  ctx.shadowColor = group.particles.find(p => p.isAlive)?.glowColor ?? '#888888';
  ctx.fillStyle   = ctx.shadowColor;
  ctx.beginPath();
  ctx.arc(group.cx, group.cy, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Group health bar ──────────────────────────────────────────────

function drawGroupHealthBar(ctx: CanvasRenderingContext2D, group: AlivenParticleGroup): void {
  const barW = 22;
  const barH = 2.5;
  const bx   = group.cx - barW / 2;
  const by   = group.cy - 14;
  const healthRatio = group.aliveCount / Math.max(1, group.targetCount);
  ctx.save();
  ctx.globalAlpha = 0.55;
  // Background track.
  ctx.fillStyle = '#222222';
  ctx.fillRect(bx, by, barW, barH);
  // Health fill — color shifts red as health drops.
  const color = group.particles.find(p => p.isAlive)?.color ?? '#aaaaaa';
  ctx.fillStyle = color;
  ctx.fillRect(bx, by, barW * healthRatio, barH);
  ctx.restore();
}

// ── Splitter burst ring ───────────────────────────────────────────

function drawSplitBurst(ctx: CanvasRenderingContext2D, group: AlivenParticleGroup): void {
  if (group.splitFlashMs <= 0) return;
  const maxMs = 300; // must match ALIVEN_SPLIT_FLASH_MS
  const t = 1 - group.splitFlashMs / maxMs; // 0→1 over the duration
  const color = group.particles.find(p => p.isAlive)?.color ?? '#ffffff';
  const r = 3 + t * 10;
  ctx.save();
  ctx.globalAlpha = (1 - t) * 0.6;
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1.2;
  if (!_lowGraphics) {
    ctx.shadowBlur  = 5;
    ctx.shadowColor = color;
  }
  ctx.beginPath();
  ctx.arc(group.splitFlashX, group.splitFlashY, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ── Healer beam ───────────────────────────────────────────────────

function drawHealerBeam(ctx: CanvasRenderingContext2D, p: AlivenParticle): void {
  const maxMs = 280; // must match ALIVEN_HEALER_BEAM_MS
  const t = p.healBeamMs / maxMs; // 1→0 as beam fades
  ctx.save();
  ctx.globalAlpha = t * 0.45;
  ctx.strokeStyle = p.glowColor;
  ctx.lineWidth   = 0.8;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.healBeamTargetX, p.healBeamTargetY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawParticle(ctx: CanvasRenderingContext2D, p: AlivenParticle, isElite = false): void {
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

  // Elite: gold outer rim on each particle
  if (isElite) {
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#ffdd66';
    ctx.lineWidth   = 0.8;
    ctx.shadowBlur  = 0;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 1.8, 0, Math.PI * 2);
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

  // Pulser shockwave ring — expands outward from the particle while pulserFlashMs > 0.
  if (p.pulserFlashMs > 0) {
    const maxMs = 350; // must match ALIVEN_PULSER_RING_DURATION_MS
    const tf = 1 - p.pulserFlashMs / maxMs; // 0→1 over the duration
    const ringR = r + tf * ALIVEN_PULSE_RADIUS_PX;
    ctx.globalAlpha = (1 - tf) * 0.7;
    ctx.strokeStyle = p.glowColor;
    ctx.lineWidth   = 1.2;
    ctx.shadowBlur  = 0;
    ctx.beginPath();
    ctx.arc(p.x, p.y, ringR, 0, Math.PI * 2);
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
  // Outer bullet body (same tier color as spitter).
  ctx.globalAlpha = 0.85;
  ctx.fillStyle   = b.color;
  ctx.beginPath();
  ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
  ctx.fill();
  // Bright white center highlight so bullets are visually distinct from particles.
  ctx.shadowBlur  = 0;
  ctx.globalAlpha = 0.55;
  ctx.fillStyle   = '#ffffff';
  ctx.beginPath();
  ctx.arc(b.x, b.y, 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
