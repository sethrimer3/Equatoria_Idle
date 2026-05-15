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
  QuartzEnemy,
  RubyEnemy,
  SunstoneEnemy,
  CitrineEnemy,
  IoliteEnemy,
  AmethystEnemy,
  DiamondEnemy,
  NullstoneEnemy,
  FracterylEnemy,
  EigensteinEnemy,
  BossEnemy,
} from './rpg-enemy-types';

import {
  SAPPHIRE_SHIELD_RADIUS, SAPPHIRE_ENEMY_GLOW, SAPPHIRE_ENEMY_COLOR, SAPPHIRE_ENEMY_SIZE,
  MISSILE_TRAIL_CAP, MISSILE_TRAIL_DASH_RATIO, MISSILE_GLOW, MISSILE_COLOR, MISSILE_SIZE,
  LASER_ENEMY_SIZE, LASER_ENEMY_COLOR, LASER_ENEMY_GLOW,
  LASER_DASH_DISTANCE, LASER_TRAIL_ERASE_MS, ATTACK_TRAIL_LENGTH_SCALE,
  ATTACK_TRAIL_ALPHA, ATTACK_TRAIL_ERASE_FADE,
  BOSS_SIZE_BASE,
} from './rpg-constants';
import {
  EMERALD_ENEMY_SIZE, EMERALD_ENEMY_GLOW, EMERALD_ENEMY_COLOR, EMERALD_CHARGE_MS,
  AMBER_ENEMY_SIZE, AMBER_ENEMY_COLOR, AMBER_ENEMY_GLOW,
  AMBER_SHARD_TRAIL_CAP, AMBER_SHARD_GLOW, AMBER_SHARD_COLOR, AMBER_SHARD_SIZE,
  VOID_AURA_PULSE_MS, VOID_ENEMY_GLOW, VOID_AURA_RADIUS, VOID_ENEMY_COLOR, VOID_ENEMY_SIZE,
  QUARTZ_ENEMY_SIZE,
  RUBY_ENEMY_SIZE,
  SUNSTONE_ENEMY_SIZE,
  CITRINE_ENEMY_SIZE,
  IOLITE_ENEMY_SIZE,
  AMETHYST_ENEMY_SIZE,
  DIAMOND_ENEMY_SIZE,
  NULLSTONE_ENEMY_SIZE,
  FRACTERYL_ENEMY_SIZE,
  EIGENSTEIN_ENEMY_SIZE,
} from './rpg-enemy-constants';
import type { AlivenParticleGroup } from './rpg-aliven-types';
import { setLowGraphicsMode as setAdvLowGraphics } from './rpg-enemy-draw-adv';

// ── Low-graphics mode flag ────────────────────────────────────
let isLowGraphicsMode = false;

/**
 * Sets low-graphics mode for all enemy draw functions.
 * Propagates to rpg-enemy-draw-adv.ts so only one call-site is needed.
 */
export function setLowGraphicsMode(enabled: boolean): void {
  isLowGraphicsMode = enabled;
  setAdvLowGraphics(enabled);
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
  for (const enemy of enemies) {
    // Draw shield circle
    const shieldAlpha = enemy.shieldHp / enemy.maxShieldHp;
    if (enemy.shieldHp > 0) {
      ctx.save();
      ctx.globalAlpha = 0.25 + shieldAlpha * 0.35;
      ctx.shadowBlur  = isLowGraphicsMode ? 0 : SAPPHIRE_SHIELD_RADIUS * 2; ctx.shadowColor = SAPPHIRE_ENEMY_GLOW;
      ctx.strokeStyle = SAPPHIRE_ENEMY_GLOW; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, SAPPHIRE_SHIELD_RADIUS, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = shieldAlpha * 0.18;
      ctx.fillStyle = SAPPHIRE_ENEMY_GLOW;
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, SAPPHIRE_SHIELD_RADIUS, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    // HP bar
    const barW = SAPPHIRE_SHIELD_RADIUS * 2;
    const barH = 2;
    const barX = enemy.x - barW / 2;
    const barY = enemy.y + SAPPHIRE_SHIELD_RADIUS + 3;
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#222'; ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = SAPPHIRE_ENEMY_COLOR;
    ctx.fillRect(barX, barY, barW * (enemy.hp / enemy.maxHp), barH);
    // Shield HP bar (below HP bar)
    if (enemy.shieldHp > 0) {
      ctx.fillStyle = '#333'; ctx.fillRect(barX, barY + barH + 1, barW, barH);
      ctx.fillStyle = '#88ccff';
      ctx.fillRect(barX, barY + barH + 1, barW * (enemy.shieldHp / enemy.maxShieldHp), barH);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // Enemy body (square)
    const half = SAPPHIRE_ENEMY_SIZE / 2;
    ctx.shadowBlur = isLowGraphicsMode ? 0 : SAPPHIRE_ENEMY_SIZE * 5; ctx.shadowColor = SAPPHIRE_ENEMY_GLOW;
    ctx.fillStyle = SAPPHIRE_ENEMY_COLOR;
    ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), SAPPHIRE_ENEMY_SIZE, SAPPHIRE_ENEMY_SIZE);
    ctx.shadowBlur = 0;
  }
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
  for (const enemy of enemies) {
    // Draw ghost afterimage at blink origin
    if (enemy.ghostAlpha > 0.02) {
      const half = EMERALD_ENEMY_SIZE / 2;
      ctx.save();
      ctx.globalAlpha = enemy.ghostAlpha * 0.5;
      ctx.shadowBlur  = isLowGraphicsMode ? 0 : EMERALD_ENEMY_SIZE * 6; ctx.shadowColor = EMERALD_ENEMY_GLOW;
      ctx.fillStyle   = EMERALD_ENEMY_GLOW;
      ctx.fillRect(Math.floor(enemy.ghostX - half), Math.floor(enemy.ghostY - half), EMERALD_ENEMY_SIZE, EMERALD_ENEMY_SIZE);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      ctx.restore();
    }
    // HP bar
    const barW = EMERALD_ENEMY_SIZE * 2.5;
    const barH = 2;
    const barX = enemy.x - barW / 2;
    const barY = enemy.y + EMERALD_ENEMY_SIZE / 2 + 3;
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#222'; ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = EMERALD_ENEMY_COLOR;
    ctx.fillRect(barX, barY, barW * (enemy.hp / enemy.maxHp), barH);
    ctx.globalAlpha = 1;
    ctx.restore();
    // Body — pulses brighter during charging phase
    const chargeGlow = enemy.phase === 'charging' ? (enemy.phaseMs / EMERALD_CHARGE_MS) * 0.6 : 0;
    const half = EMERALD_ENEMY_SIZE / 2;
    ctx.shadowBlur  = isLowGraphicsMode ? 0 : EMERALD_ENEMY_SIZE * (5 + chargeGlow * 8); ctx.shadowColor = EMERALD_ENEMY_GLOW;
    ctx.fillStyle   = EMERALD_ENEMY_COLOR;
    ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), EMERALD_ENEMY_SIZE, EMERALD_ENEMY_SIZE);
    ctx.shadowBlur = 0;
  }
}

export function drawAmberEnemies(ctx: CanvasRenderingContext2D, enemies: AmberEnemy[]): void {
  for (const enemy of enemies) {
    const barW = AMBER_ENEMY_SIZE * 2.5;
    const barH = 2;
    const barX = enemy.x - barW / 2;
    const barY = enemy.y + AMBER_ENEMY_SIZE / 2 + 3;
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#222'; ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = AMBER_ENEMY_COLOR;
    ctx.fillRect(barX, barY, barW * (enemy.hp / enemy.maxHp), barH);
    ctx.globalAlpha = 1;
    ctx.restore();
    const half = AMBER_ENEMY_SIZE / 2;
    ctx.shadowBlur  = isLowGraphicsMode ? 0 : AMBER_ENEMY_SIZE * 5; ctx.shadowColor = AMBER_ENEMY_GLOW;
    ctx.fillStyle   = AMBER_ENEMY_COLOR;
    ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), AMBER_ENEMY_SIZE, AMBER_ENEMY_SIZE);
    ctx.shadowBlur = 0;
  }
}

export function drawAmberShards(ctx: CanvasRenderingContext2D, shards: AmberShard[]): void {
  if (shards.length === 0) return;
  ctx.save();
  for (const s of shards) {
    // Trail
    if (!isLowGraphicsMode && s.trailCount >= 2) {
      const dashLen = AMBER_SHARD_TRAIL_CAP * 0.6;
      const startIdx = (s.trailHead - s.trailCount + AMBER_SHARD_TRAIL_CAP) % AMBER_SHARD_TRAIL_CAP;
      const lastIdx  = (s.trailHead - 1 + AMBER_SHARD_TRAIL_CAP) % AMBER_SHARD_TRAIL_CAP;
      ctx.save();
      ctx.setLineDash([dashLen, dashLen]);
      ctx.lineDashOffset = -(dashLen * (1 - s.trailCount / AMBER_SHARD_TRAIL_CAP));
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.65; ctx.shadowBlur = isLowGraphicsMode ? 0 : 4; ctx.shadowColor = AMBER_SHARD_GLOW;
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
    // Shard body
    const half = AMBER_SHARD_SIZE / 2;
    ctx.globalAlpha = 1;
    if (!isLowGraphicsMode) {
      ctx.shadowBlur = AMBER_SHARD_SIZE * 5; ctx.shadowColor = AMBER_SHARD_GLOW;
      ctx.fillStyle = AMBER_SHARD_GLOW;
      const gh = half * 2;
      ctx.fillRect(Math.floor(s.x - gh), Math.floor(s.y - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = AMBER_SHARD_COLOR;
    ctx.fillRect(Math.floor(s.x - half), Math.floor(s.y - half), AMBER_SHARD_SIZE, AMBER_SHARD_SIZE);
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawVoidEnemies(ctx: CanvasRenderingContext2D, enemies: VoidEnemy[]): void {
  for (const enemy of enemies) {
    // Pulsing aura rings
    const pulseT = enemy.pulseMs / VOID_AURA_PULSE_MS;
    const auraAlpha = Math.sin(pulseT * Math.PI * 2) * 0.3 + 0.35;
    ctx.save();
    ctx.globalAlpha = auraAlpha * 0.4;
    ctx.shadowBlur  = isLowGraphicsMode ? 0 : VOID_AURA_RADIUS * 2; ctx.shadowColor = VOID_ENEMY_GLOW;
    ctx.strokeStyle = VOID_ENEMY_GLOW; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(enemy.x, enemy.y, VOID_AURA_RADIUS * (1 + pulseT * 0.3), 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = auraAlpha * 0.15;
    ctx.fillStyle = VOID_ENEMY_GLOW;
    ctx.beginPath(); ctx.arc(enemy.x, enemy.y, VOID_AURA_RADIUS, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
    // HP bar
    const barW = VOID_ENEMY_SIZE * 3;
    const barH = 2;
    const barX = enemy.x - barW / 2;
    const barY = enemy.y + VOID_AURA_RADIUS + 3;
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#222'; ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = VOID_ENEMY_COLOR;
    ctx.fillRect(barX, barY, barW * (enemy.hp / enemy.maxHp), barH);
    ctx.globalAlpha = 1;
    ctx.restore();
    // Body
    const half = VOID_ENEMY_SIZE / 2;
    ctx.shadowBlur  = isLowGraphicsMode ? 0 : VOID_ENEMY_SIZE * 6; ctx.shadowColor = VOID_ENEMY_GLOW;
    ctx.fillStyle   = VOID_ENEMY_COLOR;
    ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), VOID_ENEMY_SIZE, VOID_ENEMY_SIZE);
    ctx.shadowBlur = 0;
  }
}

// ── Laser enemy draw (first enemy type, inline health bar) ───────────────────

/** Draws the basic (laser-type) enemies: square body with health bar underneath. */
export function drawLaserEnemies(ctx: CanvasRenderingContext2D, enemies: LaserEnemy[], nowMs: number): void {
  for (const enemy of enemies) {
    drawAttackTrail(ctx, enemy, nowMs);
    const half = LASER_ENEMY_SIZE / 2;
    if (!isLowGraphicsMode) {
      ctx.shadowBlur = LASER_ENEMY_SIZE * 5; ctx.shadowColor = LASER_ENEMY_GLOW;
    }
    ctx.fillStyle = LASER_ENEMY_COLOR;
    ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), LASER_ENEMY_SIZE, LASER_ENEMY_SIZE);
    ctx.shadowBlur = 0;
    // Health bar
    const barW = LASER_ENEMY_SIZE * 2.5;
    const barH = 2;
    const barX = enemy.x - barW / 2;
    const barY = enemy.y + half + 2;
    ctx.fillStyle = '#222'; ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = LASER_ENEMY_COLOR;
    ctx.fillRect(barX, barY, barW * (enemy.hp / enemy.maxHp), barH);
  }
}

// ── Enemy indicator markers (triangle arrows or outline boxes above each enemy) ─

/** Draws red triangle or outline indicators above all living enemies.
 *  Aliven groups receive a tier-colored marker at their group centroid. */
export function drawEnemyIndicators(
  ctx: CanvasRenderingContext2D,
  style: 'triangle' | 'outline' | 'off',
  enemies: LaserEnemy[],
  sapphireEnemies: SapphireEnemy[],
  emeraldEnemies: EmeraldEnemy[],
  amberEnemies: AmberEnemy[],
  voidEnemies: VoidEnemy[],
  quartzEnemies: QuartzEnemy[],
  rubyEnemies: RubyEnemy[],
  sunstoneEnemies: SunstoneEnemy[],
  citrineEnemies: CitrineEnemy[],
  ioliteEnemies: IoliteEnemy[],
  amethystEnemies: AmethystEnemy[],
  diamondEnemies: DiamondEnemy[],
  nullstoneEnemies: NullstoneEnemy[],
  fracterylEnemies: FracterylEnemy[],
  eigensteinEnemies: EigensteinEnemy[],
  bossEnemy: BossEnemy | null,
  alivenGroups: AlivenParticleGroup[],
): void {
  if (style === 'off') return;
  const drawMarker = (x: number, y: number, size: number, color = '#ff3b30'): void => {
    if (style === 'outline') {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      if (!isLowGraphicsMode) {
        ctx.shadowBlur = 6;
        ctx.shadowColor = color;
      }
      ctx.strokeRect(x - size / 2 - 2, y - size / 2 - 2, size + 4, size + 4);
      ctx.restore();
      return;
    }
    ctx.save();
    const markerY = y - size * 0.9 - 5;
    ctx.fillStyle = color;
    if (!isLowGraphicsMode) {
      ctx.shadowBlur = 5;
      ctx.shadowColor = color;
    }
    ctx.beginPath();
    ctx.moveTo(x, markerY);
    ctx.lineTo(x - 3, markerY - 5);
    ctx.lineTo(x + 3, markerY - 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  for (const enemy of enemies)         drawMarker(enemy.x, enemy.y, LASER_ENEMY_SIZE);
  for (const enemy of sapphireEnemies) drawMarker(enemy.x, enemy.y, SAPPHIRE_ENEMY_SIZE);
  for (const enemy of emeraldEnemies)  drawMarker(enemy.x, enemy.y, EMERALD_ENEMY_SIZE);
  for (const enemy of amberEnemies)    drawMarker(enemy.x, enemy.y, AMBER_ENEMY_SIZE);
  for (const enemy of voidEnemies)     drawMarker(enemy.x, enemy.y, VOID_ENEMY_SIZE);
  for (const enemy of quartzEnemies)   drawMarker(enemy.x, enemy.y, QUARTZ_ENEMY_SIZE);
  for (const enemy of rubyEnemies)     drawMarker(enemy.x, enemy.y, RUBY_ENEMY_SIZE);
  for (const enemy of sunstoneEnemies) drawMarker(enemy.x, enemy.y, SUNSTONE_ENEMY_SIZE);
  for (const enemy of citrineEnemies)  drawMarker(enemy.x, enemy.y, CITRINE_ENEMY_SIZE);
  for (const enemy of ioliteEnemies)   drawMarker(enemy.x, enemy.y, IOLITE_ENEMY_SIZE);
  for (const enemy of amethystEnemies) drawMarker(enemy.x, enemy.y, AMETHYST_ENEMY_SIZE);
  for (const enemy of diamondEnemies)  drawMarker(enemy.x, enemy.y, DIAMOND_ENEMY_SIZE);
  for (const enemy of nullstoneEnemies) drawMarker(enemy.x, enemy.y, NULLSTONE_ENEMY_SIZE);
  for (const enemy of fracterylEnemies) drawMarker(enemy.x, enemy.y, FRACTERYL_ENEMY_SIZE);
  for (const enemy of eigensteinEnemies) drawMarker(enemy.x, enemy.y, EIGENSTEIN_ENEMY_SIZE);
  if (bossEnemy) drawMarker(bossEnemy.x, bossEnemy.y, BOSS_SIZE_BASE * 2);
  // Aliven groups: use each group's tier color for the indicator so they stand out.
  for (const group of alivenGroups) {
    if (group.aliveCount <= 0) continue;
    const groupColor = group.particles.find(p => p.isAlive)?.glowColor ?? '#aaaaff';
    drawMarker(group.cx, group.cy, 8, groupColor);
  }
}
