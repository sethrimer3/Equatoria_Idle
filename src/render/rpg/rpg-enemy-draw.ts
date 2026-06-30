/**
 * rpg-enemy-draw.ts — Draw functions for starter/mid-tier enemies.
 *
 * Contains draw functions for Laser, Sapphire, Emerald, Amber, and Void enemies
 * (the starter-through-Void tier), plus shared infrastructure (drawAttackTrail,
 * drawLaserEnemies, drawEnemyIndicators).
 *
 * Advanced enemy draw functions (Quartz and above) live in rpg-enemy-draw-adv.ts.
 *
 * Each function takes an explicit `ctx: CanvasRenderingContext2D` as its first
 * parameter, plus the entity array(s) it needs, instead of capturing them from
 * a closure.
 */

import type {
  SapphireEnemy, SapphireMissile,
  LaserEnemy,
} from './rpg-types';
import type {
  EmeraldEnemy,
  AmberEnemy, AmberShard,
  VoidEnemy,
} from './rpg-enemy-types';

import {
  SAPPHIRE_SHIELD_RADIUS, SAPPHIRE_ENEMY_GLOW, SAPPHIRE_ENEMY_COLOR, SAPPHIRE_ENEMY_SIZE,
  MISSILE_TRAIL_CAP, MISSILE_TRAIL_DASH_RATIO, MISSILE_GLOW, MISSILE_COLOR, MISSILE_SIZE,
  LASER_ENEMY_SIZE, LASER_ENEMY_COLOR, LASER_ENEMY_GLOW,
  LASER_DASH_DISTANCE, LASER_TRAIL_ERASE_MS, ATTACK_TRAIL_LENGTH_SCALE,
  ATTACK_TRAIL_ALPHA, ATTACK_TRAIL_ERASE_FADE,
} from './rpg-constants';
import {
  EMERALD_ENEMY_SIZE, EMERALD_ENEMY_GLOW, EMERALD_ENEMY_COLOR, EMERALD_CHARGE_MS,
  AMBER_ENEMY_SIZE, AMBER_ENEMY_COLOR, AMBER_ENEMY_GLOW,
  AMBER_SHARD_TRAIL_CAP, AMBER_SHARD_GLOW, AMBER_SHARD_COLOR, AMBER_SHARD_SIZE,
  VOID_AURA_PULSE_MS, VOID_ENEMY_GLOW, VOID_AURA_RADIUS, VOID_ENEMY_COLOR, VOID_ENEMY_SIZE,
} from './rpg-enemy-constants';
import { setLowGraphicsMode as setAdvLowGraphics } from './rpg-enemy-draw-adv';
import {
  setEnemyIndicatorLowGraphicsMode,
} from './rpg-enemy-indicators';
import { enemyHealthFraction, shouldDrawEnemyHealthBar } from './rpg-health-bar';

export { drawEnemyIndicators } from './rpg-enemy-indicators';

// ── Low-graphics mode flag ────────────────────────────────────
let isLowGraphicsMode = false;

function drawEnemyHealthBar(
  ctx: CanvasRenderingContext2D,
  enemy: { hp: number; maxHp: number },
  barX: number,
  barY: number,
  barW: number,
  barH: number,
  color: string,
): void {
  if (!shouldDrawEnemyHealthBar(enemy)) return;
  ctx.fillStyle = '#222'; ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = color;
  ctx.fillRect(barX, barY, barW * enemyHealthFraction(enemy), barH);
}

/**
 * Sets low-graphics mode for all enemy draw functions.
 * Propagates to rpg-enemy-draw-adv.ts so only one call-site is needed.
 */
export function setLowGraphicsMode(enabled: boolean): void {
  isLowGraphicsMode = enabled;
  setAdvLowGraphics(enabled);
  setEnemyIndicatorLowGraphicsMode(enabled);
}

/**
 * Draws the curved dashed trail left by a laser enemy during its dash attack.
 * Moved here from rpg-entity-draw.ts since this is the sole consumer.
 */
export function drawAttackTrail(ctx: CanvasRenderingContext2D, enemy: LaserEnemy, nowMs: number): void {
  const trail = enemy.attackTrail;
  if (!trail.active) return;
  const isDashing = trail.trailEndMs === Infinity;
  let drawProgress: number, eraseProgress: number;
  if (isDashing) {
    drawProgress = Math.min(enemy.dashTraveled / LASER_DASH_DISTANCE, 1.0);
    eraseProgress = 0;
  } else {
    drawProgress = 1.0;
    eraseProgress = Math.min((nowMs - trail.trailEndMs) / LASER_TRAIL_ERASE_MS, 1.0);
    if (eraseProgress >= 1.0) { trail.active = false; return; }
  }
  const sx = trail.startX, sy = trail.startY, tx = trail.endX, ty = trail.endY;
  const ddx = tx - sx, ddy = ty - sy;
  const L = Math.sqrt(ddx * ddx + ddy * ddy);
  if (L < 1) return;
  const midX = (sx + tx) * 0.5, midY = (sy + ty) * 0.5;
  const perpX = -ddy / L, perpY = ddx / L;
  const curveOffset = L * Math.tan(trail.controlAngle);
  const controlX = midX + perpX * curveOffset, controlY = midY + perpY * curveOffset;
  const dashLen    = L * ATTACK_TRAIL_LENGTH_SCALE;
  const dashOffset = isDashing ? dashLen * (1 - drawProgress) : -(dashLen * eraseProgress);
  const alpha = isDashing ? ATTACK_TRAIL_ALPHA : ATTACK_TRAIL_ALPHA * (1 - eraseProgress * ATTACK_TRAIL_ERASE_FADE);
  ctx.save();
  ctx.setLineDash([dashLen, dashLen]);
  ctx.lineDashOffset = dashOffset;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = alpha;
  ctx.shadowBlur = isLowGraphicsMode ? 0 : 5; ctx.shadowColor = LASER_ENEMY_GLOW;
  ctx.strokeStyle = LASER_ENEMY_GLOW; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(controlX, controlY, tx, ty); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = LASER_ENEMY_COLOR; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(controlX, controlY, tx, ty); ctx.stroke();
  ctx.restore();
}

export function drawSapphireEnemies(ctx: CanvasRenderingContext2D, enemies: SapphireEnemy[]): void {
  // Per-enemy shield visuals (alpha varies per enemy)
  for (const enemy of enemies) {
    if (enemy.shieldHp <= 0) continue;
    const shieldAlpha = enemy.shieldHp / enemy.maxShieldHp;
    ctx.save();
    ctx.globalAlpha = 0.25 + shieldAlpha * 0.35;
    if (!isLowGraphicsMode) { ctx.shadowBlur = SAPPHIRE_SHIELD_RADIUS * 2; ctx.shadowColor = SAPPHIRE_ENEMY_GLOW; }
    ctx.strokeStyle = SAPPHIRE_ENEMY_GLOW; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(enemy.x, enemy.y, SAPPHIRE_SHIELD_RADIUS, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = shieldAlpha * 0.18;
    ctx.fillStyle = SAPPHIRE_ENEMY_GLOW;
    ctx.beginPath(); ctx.arc(enemy.x, enemy.y, SAPPHIRE_SHIELD_RADIUS, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  if (enemies.length === 0) return;
  // Batch enemy bodies
  const half = SAPPHIRE_ENEMY_SIZE / 2;
  if (!isLowGraphicsMode) { ctx.shadowBlur = SAPPHIRE_ENEMY_SIZE * 5; ctx.shadowColor = SAPPHIRE_ENEMY_GLOW; }
  ctx.fillStyle = SAPPHIRE_ENEMY_COLOR;
  for (const enemy of enemies) {
    ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), SAPPHIRE_ENEMY_SIZE, SAPPHIRE_ENEMY_SIZE);
  }
  ctx.shadowBlur = 0;
  // HP + shield bars (per-enemy, no save/restore)
  const barW = SAPPHIRE_SHIELD_RADIUS * 2; const barH = 2;
  ctx.globalAlpha = 0.7;
  for (const enemy of enemies) {
    const barX = enemy.x - barW / 2;
    const barY = enemy.y + SAPPHIRE_SHIELD_RADIUS + 3;
    drawEnemyHealthBar(ctx, enemy, barX, barY, barW, barH, SAPPHIRE_ENEMY_COLOR);
    if (enemy.shieldHp > 0) {
      ctx.fillStyle = '#333'; ctx.fillRect(barX, barY + barH + 1, barW, barH);
      ctx.fillStyle = '#88ccff';
      ctx.fillRect(barX, barY + barH + 1, barW * (enemy.shieldHp / enemy.maxShieldHp), barH);
    }
  }
  ctx.globalAlpha = 1;
}

export function drawSapphireMissiles(ctx: CanvasRenderingContext2D, missiles: SapphireMissile[]): void {
  if (missiles.length === 0) return;
  ctx.save();
  for (const m of missiles) {
    // Draw trail using lineDash style similar to laser attack trail
    if (!isLowGraphicsMode && m.trailCount >= 2) {
      const dashLen = MISSILE_TRAIL_CAP * MISSILE_TRAIL_DASH_RATIO;
      const startIdx = (m.trailHead - m.trailCount + MISSILE_TRAIL_CAP) % MISSILE_TRAIL_CAP;
      const lastIdx  = (m.trailHead - 1 + MISSILE_TRAIL_CAP) % MISSILE_TRAIL_CAP;
      const sx = m.trailX[startIdx], sy = m.trailY[startIdx];
      const ex = m.trailX[lastIdx],  ey = m.trailY[lastIdx];
      ctx.save();
      ctx.setLineDash([dashLen, dashLen]);
      ctx.lineDashOffset = -(dashLen * (1 - m.trailCount / MISSILE_TRAIL_CAP));
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.7; ctx.shadowBlur = isLowGraphicsMode ? 0 : 5; ctx.shadowColor = MISSILE_GLOW;
      ctx.strokeStyle = MISSILE_GLOW; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = MISSILE_COLOR; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    // Missile body
    const half = MISSILE_SIZE / 2;
    ctx.globalAlpha = 1;
    if (!isLowGraphicsMode) {
      ctx.shadowBlur = MISSILE_SIZE * 5; ctx.shadowColor = MISSILE_GLOW;
      ctx.fillStyle = MISSILE_GLOW;
      const gh = half * 2;
      ctx.fillRect(Math.floor(m.x - gh), Math.floor(m.y - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = MISSILE_COLOR;
    ctx.fillRect(Math.floor(m.x - half), Math.floor(m.y - half), MISSILE_SIZE, MISSILE_SIZE);
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawEmeraldEnemies(ctx: CanvasRenderingContext2D, enemies: EmeraldEnemy[]): void {
  // Ghost afterimage pass (varying alpha per enemy, no save/restore)
  if (!isLowGraphicsMode) {
    const half = EMERALD_ENEMY_SIZE / 2;
    ctx.fillStyle = EMERALD_ENEMY_GLOW;
    ctx.shadowBlur = EMERALD_ENEMY_SIZE * 6; ctx.shadowColor = EMERALD_ENEMY_GLOW;
    for (const enemy of enemies) {
      if (enemy.ghostAlpha <= 0.02) continue;
      ctx.globalAlpha = enemy.ghostAlpha * 0.5;
      ctx.fillRect(Math.floor(enemy.ghostX - half), Math.floor(enemy.ghostY - half), EMERALD_ENEMY_SIZE, EMERALD_ENEMY_SIZE);
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
  if (enemies.length === 0) return;
  // Bodies (shadow varies per enemy due to chargeGlow, but hoist fillStyle)
  const half = EMERALD_ENEMY_SIZE / 2;
  ctx.fillStyle = EMERALD_ENEMY_COLOR;
  for (const enemy of enemies) {
    const chargeGlow = enemy.phase === 'charging' ? (enemy.phaseMs / EMERALD_CHARGE_MS) * 0.6 : 0;
    if (!isLowGraphicsMode) { ctx.shadowBlur = EMERALD_ENEMY_SIZE * (5 + chargeGlow * 8); ctx.shadowColor = EMERALD_ENEMY_GLOW; }
    ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), EMERALD_ENEMY_SIZE, EMERALD_ENEMY_SIZE);
    ctx.shadowBlur = 0;
  }
  // Batch health bars
  const barW = EMERALD_ENEMY_SIZE * 2.5; const barH = 2;
  ctx.globalAlpha = 0.7;
  for (const enemy of enemies) {
    drawEnemyHealthBar(ctx, enemy, enemy.x - barW / 2, enemy.y + half + 3, barW, barH, EMERALD_ENEMY_COLOR);
  }
  ctx.globalAlpha = 1;
}

export function drawAmberEnemies(ctx: CanvasRenderingContext2D, enemies: AmberEnemy[]): void {
  if (enemies.length === 0) return;
  const half = AMBER_ENEMY_SIZE / 2;
  if (!isLowGraphicsMode) { ctx.shadowBlur = AMBER_ENEMY_SIZE * 5; ctx.shadowColor = AMBER_ENEMY_GLOW; }
  ctx.fillStyle = AMBER_ENEMY_COLOR;
  for (const enemy of enemies) {
    ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), AMBER_ENEMY_SIZE, AMBER_ENEMY_SIZE);
  }
  ctx.shadowBlur = 0;
  const barW = AMBER_ENEMY_SIZE * 2.5; const barH = 2;
  ctx.globalAlpha = 0.7;
  for (const enemy of enemies) {
    drawEnemyHealthBar(ctx, enemy, enemy.x - barW / 2, enemy.y + half + 3, barW, barH, AMBER_ENEMY_COLOR);
  }
  ctx.globalAlpha = 1;
}

export function drawAmberShards(ctx: CanvasRenderingContext2D, shards: AmberShard[]): void {
  if (shards.length === 0) return;
  // Per-shard trails (varying state per shard)
  if (!isLowGraphicsMode) {
    for (const s of shards) {
      if (s.trailCount < 2) continue;
      const dashLen = AMBER_SHARD_TRAIL_CAP * 0.6;
      const startIdx = (s.trailHead - s.trailCount + AMBER_SHARD_TRAIL_CAP) % AMBER_SHARD_TRAIL_CAP;
      const lastIdx  = (s.trailHead - 1 + AMBER_SHARD_TRAIL_CAP) % AMBER_SHARD_TRAIL_CAP;
      ctx.save();
      ctx.setLineDash([dashLen, dashLen]);
      ctx.lineDashOffset = -(dashLen * (1 - s.trailCount / AMBER_SHARD_TRAIL_CAP));
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.65; ctx.shadowBlur = 4; ctx.shadowColor = AMBER_SHARD_GLOW;
      ctx.strokeStyle = AMBER_SHARD_GLOW; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(s.trailX[startIdx], s.trailY[startIdx]);
      ctx.lineTo(s.trailX[lastIdx],  s.trailY[lastIdx]);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = AMBER_SHARD_COLOR; ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(s.trailX[startIdx], s.trailY[startIdx]);
      ctx.lineTo(s.trailX[lastIdx],  s.trailY[lastIdx]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    // Batch glow blobs (one shadow state for all)
    const half = AMBER_SHARD_SIZE / 2;
    const gh = half * 2;
    ctx.shadowBlur = AMBER_SHARD_SIZE * 5; ctx.shadowColor = AMBER_SHARD_GLOW;
    ctx.fillStyle = AMBER_SHARD_GLOW;
    for (const s of shards) {
      ctx.fillRect(Math.floor(s.x - gh), Math.floor(s.y - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
    }
    ctx.shadowBlur = 0;
  }
  // Batch shard bodies
  const half = AMBER_SHARD_SIZE / 2;
  ctx.fillStyle = AMBER_SHARD_COLOR;
  for (const s of shards) {
    ctx.fillRect(Math.floor(s.x - half), Math.floor(s.y - half), AMBER_SHARD_SIZE, AMBER_SHARD_SIZE);
  }
}

export function drawVoidEnemies(ctx: CanvasRenderingContext2D, enemies: VoidEnemy[]): void {
  // Per-enemy aura rings (alpha and radius vary per enemy)
  ctx.strokeStyle = VOID_ENEMY_GLOW; ctx.lineWidth = 1;
  if (!isLowGraphicsMode) { ctx.shadowBlur = VOID_AURA_RADIUS * 2; ctx.shadowColor = VOID_ENEMY_GLOW; }
  for (const enemy of enemies) {
    const pulseT = enemy.pulseMs / VOID_AURA_PULSE_MS;
    const auraAlpha = Math.sin(pulseT * Math.PI * 2) * 0.3 + 0.35;
    ctx.globalAlpha = auraAlpha * 0.4;
    ctx.beginPath(); ctx.arc(enemy.x, enemy.y, VOID_AURA_RADIUS * (1 + pulseT * 0.3), 0, Math.PI * 2); ctx.stroke();
  }
  ctx.shadowBlur = 0;
  // Aura fill pass (fixed radius, alpha varies)
  ctx.fillStyle = VOID_ENEMY_GLOW;
  for (const enemy of enemies) {
    const pulseT = enemy.pulseMs / VOID_AURA_PULSE_MS;
    const auraAlpha = Math.sin(pulseT * Math.PI * 2) * 0.3 + 0.35;
    ctx.globalAlpha = auraAlpha * 0.15;
    ctx.beginPath(); ctx.arc(enemy.x, enemy.y, VOID_AURA_RADIUS, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (enemies.length === 0) return;
  // Batch bodies
  const half = VOID_ENEMY_SIZE / 2;
  if (!isLowGraphicsMode) { ctx.shadowBlur = VOID_ENEMY_SIZE * 6; ctx.shadowColor = VOID_ENEMY_GLOW; }
  ctx.fillStyle = VOID_ENEMY_COLOR;
  for (const enemy of enemies) {
    ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), VOID_ENEMY_SIZE, VOID_ENEMY_SIZE);
  }
  ctx.shadowBlur = 0;
  // Batch health bars
  const barW = VOID_ENEMY_SIZE * 3; const barH = 2;
  ctx.globalAlpha = 0.7;
  for (const enemy of enemies) {
    drawEnemyHealthBar(ctx, enemy, enemy.x - barW / 2, enemy.y + VOID_AURA_RADIUS + 3, barW, barH, VOID_ENEMY_COLOR);
  }
  ctx.globalAlpha = 1;
}

// ── Laser enemy draw (first enemy type, inline health bar) ───────────────────

/** Draws the basic (laser-type) enemies: square body with health bar underneath. */
export function drawLaserEnemies(ctx: CanvasRenderingContext2D, enemies: LaserEnemy[], nowMs: number): void {
  if (enemies.length === 0) return;
  for (const enemy of enemies) drawAttackTrail(ctx, enemy, nowMs);
  const half = LASER_ENEMY_SIZE / 2;
  if (!isLowGraphicsMode) { ctx.shadowBlur = LASER_ENEMY_SIZE * 5; ctx.shadowColor = LASER_ENEMY_GLOW; }
  ctx.fillStyle = LASER_ENEMY_COLOR;
  for (const enemy of enemies) {
    ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), LASER_ENEMY_SIZE, LASER_ENEMY_SIZE);
  }
  ctx.shadowBlur = 0;
  const barW = LASER_ENEMY_SIZE * 2.5;
  const barH = 2;
  for (const enemy of enemies) {
    drawEnemyHealthBar(ctx, enemy, enemy.x - barW / 2, enemy.y + half + 2, barW, barH, LASER_ENEMY_COLOR);
  }
}
