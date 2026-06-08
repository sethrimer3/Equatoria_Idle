/**
 * horizon-pentagon-draw.ts — Canvas draw calls for HorizonPentagonGroup entities.
 */

import type { HorizonPentagonGroup, HorizonMissile, HorizonBullet,
  HorizonLaserState, HorizonPuffParticle } from './horizon-pentagon-types';
import {
  PENTAGON_RADIUS, PENTAGON_COLOR, PENTAGON_GLOW,
  SHADOW_ALPHA, SHADOW_COLOR,
  MISSILE_SIZE, MISSILE_COLOR, MISSILE_GLOW, MISSILE_EXPLODE_RADIUS,
  GATLING_SIZE, GATLING_COLOR, GATLING_GLOW,
  LASER_CHARGE_MS, LASER_FIRE_MS, LASER_WARNING_COLOR, LASER_FIRE_COLOR, LASER_GLOW_COLOR,
  LASER_HITBOX_PX,
  PUFF_SIZE, PUFF_COLOR,
  MISSILE_TRAIL_CAP,
} from './horizon-pentagon-constants';
import { shouldDrawEnemyHealthBar, enemyHealthFraction } from './rpg-health-bar';

// ── Polygon builder ───────────────────────────────────────────────────────────

function _buildPolygon(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  r: number,
  sides: number,
  rotation: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (i / sides) * Math.PI * 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// ── Laser helpers ─────────────────────────────────────────────────────────────

const LASER_LENGTH = 1600; // px — long enough to cross any arena

function _drawLaser(
  ctx: CanvasRenderingContext2D,
  laser: HorizonLaserState,
): void {
  const { originX, originY, dirX, dirY, phase, timerMs } = laser;
  const endX = originX + dirX * LASER_LENGTH;
  const endY = originY + dirY * LASER_LENGTH;

  if (phase === 'charging') {
    const t = 1 - timerMs / LASER_CHARGE_MS; // 0 → 1 as charge progresses
    const alpha = 0.15 + t * 0.25;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = LASER_WARNING_COLOR;
    ctx.lineWidth   = LASER_HITBOX_PX * 2;
    ctx.shadowColor = LASER_GLOW_COLOR;
    ctx.shadowBlur  = 8;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.restore();
  } else {
    // Firing — bright beam
    const t = 1 - timerMs / LASER_FIRE_MS;
    const alpha = 0.9 - t * 0.4;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = LASER_FIRE_COLOR;
    ctx.lineWidth   = LASER_HITBOX_PX * 1.8;
    ctx.shadowColor = LASER_GLOW_COLOR;
    ctx.shadowBlur  = 18;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    // Inner bright core
    ctx.globalAlpha = alpha * 0.7;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 2;
    ctx.shadowBlur  = 4;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.restore();
  }
}

// ── Pentagon body ─────────────────────────────────────────────────────────────

function _drawPentagonBody(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  pulseMs: number,
  isShadow: boolean,
): void {
  const rotation = pulseMs * 0.0005;
  const r = PENTAGON_RADIUS + Math.sin(pulseMs * 0.0031) * 1.2;

  ctx.save();
  ctx.globalAlpha = isShadow ? SHADOW_ALPHA : 1.0;

  const color = isShadow ? SHADOW_COLOR : PENTAGON_COLOR;
  const glow  = isShadow ? '#334499'    : PENTAGON_GLOW;

  // Glow
  ctx.shadowColor = glow;
  ctx.shadowBlur  = isShadow ? 8 : 14;

  _buildPolygon(ctx, cx, cy, r, 5, rotation);
  ctx.fillStyle = color;
  ctx.fill();

  // Outline
  ctx.shadowBlur = 0;
  ctx.strokeStyle = isShadow ? '#2233aa' : '#88aaff';
  ctx.lineWidth   = isShadow ? 1 : 1.5;
  ctx.stroke();

  ctx.restore();
}

// ── Missile ───────────────────────────────────────────────────────────────────

function _drawMissile(
  ctx: CanvasRenderingContext2D,
  m: HorizonMissile,
): void {
  // Trail
  if (m.trailCount > 1) {
    ctx.save();
    for (let i = 0; i < m.trailCount - 1; i++) {
      const idx0 = (m.trailHead - m.trailCount + i + MISSILE_TRAIL_CAP) % MISSILE_TRAIL_CAP;
      const idx1 = (idx0 + 1) % MISSILE_TRAIL_CAP;
      const alpha = (i / m.trailCount) * 0.35;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = MISSILE_COLOR;
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(m.trailX[idx0]!, m.trailY[idx0]!);
      ctx.lineTo(m.trailX[idx1]!, m.trailY[idx1]!);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Explosion flash ring
  if (m.explodeFlashMs > 0) {
    const t = 1 - m.explodeFlashMs / 180;
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.7;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.shadowColor = MISSILE_GLOW;
    ctx.shadowBlur  = 12;
    ctx.beginPath();
    ctx.arc(m.x, m.y, MISSILE_EXPLODE_RADIUS * t, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Body
  ctx.save();
  ctx.fillStyle   = MISSILE_COLOR;
  ctx.shadowColor = MISSILE_GLOW;
  ctx.shadowBlur  = 8;
  ctx.beginPath();
  ctx.arc(m.x, m.y, MISSILE_SIZE, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Gatling bullet ────────────────────────────────────────────────────────────

function _drawBullet(ctx: CanvasRenderingContext2D, b: HorizonBullet): void {
  ctx.save();
  ctx.fillStyle   = GATLING_COLOR;
  ctx.shadowColor = GATLING_GLOW;
  ctx.shadowBlur  = 6;
  ctx.beginPath();
  ctx.arc(b.x, b.y, GATLING_SIZE, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Puff particle ─────────────────────────────────────────────────────────────

function _drawPuff(ctx: CanvasRenderingContext2D, p: HorizonPuffParticle): void {
  const t = p.lifeMs / p.maxLifeMs;
  ctx.save();
  ctx.globalAlpha = t * 0.7;
  ctx.fillStyle   = PUFF_COLOR;
  ctx.beginPath();
  ctx.arc(p.x, p.y, PUFF_SIZE * (0.5 + t * 0.5), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── HP bar (real body only) ───────────────────────────────────────────────────

function _drawHpBar(
  ctx: CanvasRenderingContext2D,
  g: HorizonPentagonGroup,
): void {
  if (!shouldDrawEnemyHealthBar(g)) return;
  const frac = enemyHealthFraction(g);
  const barW = 32, barH = 4;
  const bx   = g.x - barW / 2, by = g.y - PENTAGON_RADIUS - 10;
  ctx.save();
  ctx.fillStyle = '#222244';
  ctx.fillRect(bx, by, barW, barH);
  ctx.fillStyle = frac > 0.5 ? '#66aaff' : frac > 0.25 ? '#ffaa33' : '#ff4444';
  ctx.fillRect(bx, by, barW * frac, barH);
  ctx.restore();
}

// ── Mirror-line visualization (optional debug/flavor) ────────────────────────

function _drawMirrorLines(
  ctx: CanvasRenderingContext2D,
  g: HorizonPentagonGroup,
  arenaW: number,
): void {
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = '#6699ff';
  ctx.lineWidth   = 1;
  ctx.setLineDash([6, 10]);
  for (const lineY of g.mirrorLineYs) {
    ctx.beginPath();
    ctx.moveTo(0, lineY);
    ctx.lineTo(arenaW, lineY);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

// ── Main draw entry ───────────────────────────────────────────────────────────

export function drawHorizonPentagonGroups(
  ctx: CanvasRenderingContext2D,
  groups: HorizonPentagonGroup[],
  arenaW: number,
): void {
  for (const g of groups) {
    // Mirror lines (subtle background hint)
    _drawMirrorLines(ctx, g, arenaW);

    // Shadow bodies (drawn first, behind real body)
    for (const s of g.shadows) {
      _drawPentagonBody(ctx, s.x, s.y, g.pulseMs, /*isShadow=*/ true);
      if (s.activeLaser) _drawLaser(ctx, s.activeLaser);
    }

    // Real body
    _drawPentagonBody(ctx, g.x, g.y, g.pulseMs, /*isShadow=*/ false);
    if (g.activeLaser) _drawLaser(ctx, g.activeLaser);

    // HP bar on real body
    _drawHpBar(ctx, g);

    // Projectiles (drawn on top)
    for (const m of g.missiles) _drawMissile(ctx, m);
    for (const b of g.bullets)  _drawBullet(ctx, b);

    // Puff particles
    for (const p of g.puffs) _drawPuff(ctx, p);
  }
}
