/**
 * rpg-entity-draw.ts — Pure entity draw functions extracted from rpg-render.ts.
 *
 * Each function takes an explicit `ctx: CanvasRenderingContext2D` as its first
 * parameter, plus the entity array(s) it needs, instead of capturing them from
 * a closure.  This lets callers (including tests) use these functions without
 * constructing the entire rpg-render closure.
 */

import type {
  SapphireEnemy, SapphireMissile,
  EmeraldEnemy,
  AmberEnemy, AmberShard,
  VoidEnemy,
  QuartzEnemy, QuartzSpike,
  RubyEnemy, RubyBolt,
  SunstoneEnemy,
  CitrineEnemy, CitrineBolt,
  IoliteEnemy,
  AmethystEnemy, AmethystShard,
  DiamondEnemy, DiamondShard,
  NullstoneEnemy, VoidTendril,
  FracterylEnemy, FracterylShard,
  EigensteinEnemy, EigensteinBeam,
  BossProjectile,
  SandProjectile,
  IolitePoisonBolt,
  LaserBeamEffect,
  DeathParticle, ShotLine, HitEffect, DamageNumber,
  LaserEnemy,
  WeaponOrbitParticle, OrbitProjectile,
  TeleportParticle,
  EmeraldPlayerMissile,
  SunstoneMine,
} from './rpg-types';

import {
  SAND_PROJ_LIFE_MS, SAND_PROJ_SIZE, SAND_PROJ_GLOW, SAND_PROJ_COLOR,
  POISON_BOLT_LIFE_MS, POISON_BOLT_TRAIL_CAP, POISON_BOLT_SIZE, POISON_BOLT_COLOR, POISON_BOLT_GLOW,
  LASER_BEAM_VISIBLE_MS, LASER_BEAM_GLOW, LASER_BEAM_COLOR, LASER_BEAM_WIDTH,
  SAPPHIRE_SHIELD_RADIUS, SAPPHIRE_ENEMY_GLOW, SAPPHIRE_ENEMY_COLOR, SAPPHIRE_ENEMY_SIZE,
  MISSILE_TRAIL_CAP, MISSILE_TRAIL_DASH_RATIO, MISSILE_GLOW, MISSILE_COLOR, MISSILE_SIZE,
  EMERALD_ENEMY_SIZE, EMERALD_ENEMY_GLOW, EMERALD_ENEMY_COLOR, EMERALD_CHARGE_MS,
  AMBER_ENEMY_SIZE, AMBER_ENEMY_COLOR, AMBER_ENEMY_GLOW,
  AMBER_SHARD_TRAIL_CAP, AMBER_SHARD_GLOW, AMBER_SHARD_COLOR, AMBER_SHARD_SIZE,
  VOID_AURA_PULSE_MS, VOID_ENEMY_GLOW, VOID_AURA_RADIUS, VOID_ENEMY_COLOR, VOID_ENEMY_SIZE,
  QUARTZ_ENEMY_SIZE, QUARTZ_ENEMY_GLOW, QUARTZ_ENEMY_COLOR,
  QUARTZ_SPIKE_SIZE, QUARTZ_SPIKE_GLOW, QUARTZ_SPIKE_COLOR,
  RUBY_ENEMY_SIZE, RUBY_ENEMY_GLOW, RUBY_ENEMY_COLOR,
  RUBY_BOLT_SIZE, RUBY_BOLT_GLOW, RUBY_BOLT_COLOR,
  SUNSTONE_ENEMY_SIZE, SUNSTONE_ENEMY_GLOW, SUNSTONE_ENEMY_COLOR,
  CITRINE_ENEMY_SIZE, CITRINE_ENEMY_GLOW, CITRINE_ENEMY_COLOR,
  CITRINE_BOLT_TRAIL_CAP, CITRINE_BOLT_COLOR, CITRINE_BOLT_SIZE, CITRINE_BOLT_GLOW,
  IOLITE_ENEMY_SIZE, IOLITE_ENEMY_GLOW, IOLITE_ENEMY_COLOR,
  AMETHYST_ENEMY_SIZE, AMETHYST_ENEMY_GLOW, AMETHYST_ENEMY_COLOR,
  AMETHYST_SHARD_SIZE, AMETHYST_SHARD_GLOW, AMETHYST_SHARD_COLOR,
  DIAMOND_ENEMY_SIZE, DIAMOND_ENEMY_GLOW, DIAMOND_ENEMY_COLOR,
  DIAMOND_SHARD_SIZE, DIAMOND_SHARD_GLOW, DIAMOND_SHARD_COLOR,
  NULLSTONE_ENEMY_SIZE, NULLSTONE_ENEMY_GLOW, NULLSTONE_ENEMY_COLOR, NULLSTONE_GRAVITY_RADIUS,
  VOID_TENDRIL_SIZE, VOID_TENDRIL_GLOW, VOID_TENDRIL_COLOR,
  FRACTERYL_ENEMY_SIZE, FRACTERYL_ENEMY_GLOW, FRACTERYL_ENEMY_COLOR,
  EIGENSTEIN_ENEMY_SIZE, EIGENSTEIN_ENEMY_GLOW, EIGENSTEIN_ENEMY_COLOR, EIGENSTEIN_BEAM_CHARGE_MS,
  SHOT_LINE_DURATION_MS, HIT_EFFECT_DURATION_MS,
  DAMAGE_NUM_DURATION_MS, DAMAGE_NUM_FONT_FAMILY,
  WEAPON_ORBIT_TRAIL_CAP, ORBIT_PROJ_TRAIL_CAP, ORBIT_PROJ_SIZE,
  LASER_DASH_DISTANCE, LASER_TRAIL_ERASE_MS, ATTACK_TRAIL_LENGTH_SCALE,
  ATTACK_TRAIL_ALPHA, ATTACK_TRAIL_ERASE_FADE, LASER_ENEMY_GLOW, LASER_ENEMY_COLOR,
  EMERALD_MISSILE_SIZE, EMERALD_MISSILE_COLOR, EMERALD_MISSILE_GLOW, EMERALD_MISSILE_TRAIL_CAP,
  SUNSTONE_MINE_FUSE_MS, SUNSTONE_MINE_SIZE, SUNSTONE_MINE_COLOR, SUNSTONE_MINE_GLOW,
  SUNSTONE_MINE_DANGER_COLOR,
} from './rpg-constants';

export function drawSandProjectiles(ctx: CanvasRenderingContext2D, sandProjectiles: SandProjectile[]): void {
  if (sandProjectiles.length === 0) return;
  ctx.save();
  for (const p of sandProjectiles) {
    const alpha = p.lifeMs / SAND_PROJ_LIFE_MS;
    ctx.globalAlpha = alpha * 0.9;
    ctx.shadowBlur  = SAND_PROJ_SIZE * 4; ctx.shadowColor = SAND_PROJ_GLOW;
    ctx.fillStyle   = SAND_PROJ_GLOW;
    const gr = SAND_PROJ_SIZE * 1.5;
    ctx.fillRect(Math.floor(p.x - gr), Math.floor(p.y - gr), Math.ceil(gr * 2), Math.ceil(gr * 2));
    ctx.shadowBlur = 0;
    ctx.fillStyle  = SAND_PROJ_COLOR;
    ctx.fillRect(Math.floor(p.x - SAND_PROJ_SIZE / 2), Math.floor(p.y - SAND_PROJ_SIZE / 2), SAND_PROJ_SIZE, SAND_PROJ_SIZE);
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawPoisonBolts(ctx: CanvasRenderingContext2D, poisonBolts: IolitePoisonBolt[]): void {
  if (poisonBolts.length === 0) return;
  ctx.save();
  for (const p of poisonBolts) {
    const alpha = p.lifeMs / POISON_BOLT_LIFE_MS;
    // Trail
    if (p.trailCount >= 2) {
      for (let i = 0; i < p.trailCount; i++) {
        const idx = (p.trailHead - p.trailCount + i + POISON_BOLT_TRAIL_CAP) % POISON_BOLT_TRAIL_CAP;
        const t   = i / p.trailCount;
        const r   = POISON_BOLT_SIZE * t * 0.8;
        if (r < 0.3) continue;
        ctx.globalAlpha = t * alpha * 0.5;
        ctx.fillStyle = POISON_BOLT_COLOR;
        ctx.fillRect(Math.floor(p.trailX[idx] - r), Math.floor(p.trailY[idx] - r), Math.ceil(r * 2), Math.ceil(r * 2));
      }
    }
    // Bolt core
    ctx.globalAlpha = alpha * 0.9;
    ctx.shadowBlur  = POISON_BOLT_SIZE * 4; ctx.shadowColor = POISON_BOLT_GLOW;
    ctx.fillStyle   = POISON_BOLT_GLOW;
    const gr = POISON_BOLT_SIZE * 1.5;
    ctx.fillRect(Math.floor(p.x - gr), Math.floor(p.y - gr), Math.ceil(gr * 2), Math.ceil(gr * 2));
    ctx.shadowBlur = 0;
    ctx.fillStyle  = POISON_BOLT_COLOR;
    ctx.fillRect(Math.floor(p.x - POISON_BOLT_SIZE / 2), Math.floor(p.y - POISON_BOLT_SIZE / 2), POISON_BOLT_SIZE, POISON_BOLT_SIZE);
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawLaserBeamEffect(ctx: CanvasRenderingContext2D, effect: LaserBeamEffect | null): void {
  if (!effect || !effect.active) return;
  const endX = effect.endX;
  const endY = effect.endY;
  const t = effect.timerMs / LASER_BEAM_VISIBLE_MS;
  ctx.save();
  ctx.globalAlpha = t * 0.9;
  ctx.lineCap = 'round';
  // Glow pass
  ctx.shadowBlur = 12; ctx.shadowColor = LASER_BEAM_GLOW;
  ctx.strokeStyle = LASER_BEAM_GLOW; ctx.lineWidth = LASER_BEAM_WIDTH * 3;
  ctx.beginPath(); ctx.moveTo(effect.startX, effect.startY); ctx.lineTo(endX, endY); ctx.stroke();
  ctx.shadowBlur = 0;
  // Core pass
  ctx.strokeStyle = LASER_BEAM_COLOR; ctx.lineWidth = LASER_BEAM_WIDTH;
  ctx.beginPath(); ctx.moveTo(effect.startX, effect.startY); ctx.lineTo(endX, endY); ctx.stroke();
  ctx.globalAlpha = 1; ctx.restore();
}

export function drawSapphireEnemies(ctx: CanvasRenderingContext2D, enemies: SapphireEnemy[]): void {
  for (const enemy of enemies) {
    // Draw shield circle
    const shieldAlpha = enemy.shieldHp / enemy.maxShieldHp;
    if (enemy.shieldHp > 0) {
      ctx.save();
      ctx.globalAlpha = 0.25 + shieldAlpha * 0.35;
      ctx.shadowBlur  = SAPPHIRE_SHIELD_RADIUS * 2; ctx.shadowColor = SAPPHIRE_ENEMY_GLOW;
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
    ctx.shadowBlur = SAPPHIRE_ENEMY_SIZE * 5; ctx.shadowColor = SAPPHIRE_ENEMY_GLOW;
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
    if (m.trailCount >= 2) {
      const dashLen = MISSILE_TRAIL_CAP * MISSILE_TRAIL_DASH_RATIO;
      const startIdx = (m.trailHead - m.trailCount + MISSILE_TRAIL_CAP) % MISSILE_TRAIL_CAP;
      const lastIdx  = (m.trailHead - 1 + MISSILE_TRAIL_CAP) % MISSILE_TRAIL_CAP;
      const sx = m.trailX[startIdx], sy = m.trailY[startIdx];
      const ex = m.trailX[lastIdx],  ey = m.trailY[lastIdx];
      ctx.save();
      ctx.setLineDash([dashLen, dashLen]);
      ctx.lineDashOffset = -(dashLen * (1 - m.trailCount / MISSILE_TRAIL_CAP));
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.7; ctx.shadowBlur = 5; ctx.shadowColor = MISSILE_GLOW;
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
    ctx.shadowBlur = MISSILE_SIZE * 5; ctx.shadowColor = MISSILE_GLOW;
    ctx.fillStyle = MISSILE_GLOW;
    const gh = half * 2;
    ctx.fillRect(Math.floor(m.x - gh), Math.floor(m.y - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
    ctx.shadowBlur = 0;
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
      ctx.shadowBlur  = EMERALD_ENEMY_SIZE * 6; ctx.shadowColor = EMERALD_ENEMY_GLOW;
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
    ctx.shadowBlur  = EMERALD_ENEMY_SIZE * (5 + chargeGlow * 8); ctx.shadowColor = EMERALD_ENEMY_GLOW;
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
    ctx.shadowBlur  = AMBER_ENEMY_SIZE * 5; ctx.shadowColor = AMBER_ENEMY_GLOW;
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
    if (s.trailCount >= 2) {
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
    // Shard body
    const half = AMBER_SHARD_SIZE / 2;
    ctx.globalAlpha = 1;
    ctx.shadowBlur = AMBER_SHARD_SIZE * 5; ctx.shadowColor = AMBER_SHARD_GLOW;
    ctx.fillStyle = AMBER_SHARD_GLOW;
    const gh = half * 2;
    ctx.fillRect(Math.floor(s.x - gh), Math.floor(s.y - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
    ctx.shadowBlur = 0;
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
    ctx.shadowBlur  = VOID_AURA_RADIUS * 2; ctx.shadowColor = VOID_ENEMY_GLOW;
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
    ctx.shadowBlur  = VOID_ENEMY_SIZE * 6; ctx.shadowColor = VOID_ENEMY_GLOW;
    ctx.fillStyle   = VOID_ENEMY_COLOR;
    ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), VOID_ENEMY_SIZE, VOID_ENEMY_SIZE);
    ctx.shadowBlur = 0;
  }
}

export function drawQuartzEnemies(ctx: CanvasRenderingContext2D, enemies: QuartzEnemy[]): void {
  for (const enemy of enemies) {
    const half = QUARTZ_ENEMY_SIZE / 2;
    ctx.save();
    ctx.translate(Math.floor(enemy.x), Math.floor(enemy.y));
    ctx.rotate(Math.PI / 4);
    ctx.shadowBlur = QUARTZ_ENEMY_SIZE * 4; ctx.shadowColor = QUARTZ_ENEMY_GLOW;
    ctx.fillStyle = QUARTZ_ENEMY_COLOR;
    ctx.fillRect(-half, -half, QUARTZ_ENEMY_SIZE, QUARTZ_ENEMY_SIZE);
    ctx.shadowBlur = 0;
    ctx.restore();
    const barW = QUARTZ_ENEMY_SIZE * 2.5; const barH = 2;
    ctx.save(); ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#222'; ctx.fillRect(enemy.x - barW / 2, enemy.y + QUARTZ_ENEMY_SIZE + 2, barW, barH);
    ctx.fillStyle = QUARTZ_ENEMY_COLOR;
    ctx.fillRect(enemy.x - barW / 2, enemy.y + QUARTZ_ENEMY_SIZE + 2, barW * (enemy.hp / enemy.maxHp), barH);
    ctx.globalAlpha = 1; ctx.restore();
  }
}

export function drawQuartzSpikes(ctx: CanvasRenderingContext2D, spikes: QuartzSpike[]): void {
  for (const s of spikes) {
    ctx.save();
    ctx.translate(Math.floor(s.x), Math.floor(s.y));
    ctx.rotate(Math.PI / 4);
    const half = QUARTZ_SPIKE_SIZE / 2;
    ctx.shadowBlur = QUARTZ_SPIKE_SIZE * 3; ctx.shadowColor = QUARTZ_SPIKE_GLOW;
    ctx.fillStyle = QUARTZ_SPIKE_COLOR;
    ctx.fillRect(-half, -half, QUARTZ_SPIKE_SIZE, QUARTZ_SPIKE_SIZE);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

export function drawRubyEnemies(ctx: CanvasRenderingContext2D, enemies: RubyEnemy[]): void {
  for (const enemy of enemies) {
    const half = RUBY_ENEMY_SIZE / 2;
    ctx.shadowBlur = RUBY_ENEMY_SIZE * 5; ctx.shadowColor = RUBY_ENEMY_GLOW;
    ctx.fillStyle = RUBY_ENEMY_COLOR;
    ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), RUBY_ENEMY_SIZE, RUBY_ENEMY_SIZE);
    ctx.shadowBlur = 0;
    const barW = RUBY_ENEMY_SIZE * 2.5; const barH = 2;
    ctx.save(); ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#222'; ctx.fillRect(enemy.x - barW / 2, enemy.y + RUBY_ENEMY_SIZE + 2, barW, barH);
    ctx.fillStyle = RUBY_ENEMY_COLOR;
    ctx.fillRect(enemy.x - barW / 2, enemy.y + RUBY_ENEMY_SIZE + 2, barW * (enemy.hp / enemy.maxHp), barH);
    ctx.globalAlpha = 1; ctx.restore();
  }
}

export function drawRubyBolts(ctx: CanvasRenderingContext2D, bolts: RubyBolt[]): void {
  for (const b of bolts) {
    const half = RUBY_BOLT_SIZE / 2;
    ctx.shadowBlur = RUBY_BOLT_SIZE * 4; ctx.shadowColor = RUBY_BOLT_GLOW;
    ctx.fillStyle = RUBY_BOLT_COLOR;
    ctx.fillRect(Math.floor(b.x - half), Math.floor(b.y - half), RUBY_BOLT_SIZE, RUBY_BOLT_SIZE);
    ctx.shadowBlur = 0;
  }
}

export function drawSunstoneEnemies(ctx: CanvasRenderingContext2D, enemies: SunstoneEnemy[]): void {
  for (const enemy of enemies) {
    const half = SUNSTONE_ENEMY_SIZE / 2;
    ctx.save();
    ctx.shadowBlur = SUNSTONE_ENEMY_SIZE * 5; ctx.shadowColor = SUNSTONE_ENEMY_GLOW;
    ctx.fillStyle = SUNSTONE_ENEMY_COLOR;
    ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), SUNSTONE_ENEMY_SIZE, SUNSTONE_ENEMY_SIZE);
    ctx.globalAlpha = 0.3; ctx.strokeStyle = SUNSTONE_ENEMY_GLOW; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(enemy.x, enemy.y, SUNSTONE_ENEMY_SIZE * 1.6, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.restore();
    const barW = SUNSTONE_ENEMY_SIZE * 3; const barH = 2;
    ctx.save(); ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#222'; ctx.fillRect(enemy.x - barW / 2, enemy.y + SUNSTONE_ENEMY_SIZE + 2, barW, barH);
    ctx.fillStyle = SUNSTONE_ENEMY_COLOR;
    ctx.fillRect(enemy.x - barW / 2, enemy.y + SUNSTONE_ENEMY_SIZE + 2, barW * (enemy.hp / enemy.maxHp), barH);
    ctx.globalAlpha = 1; ctx.restore();
  }
}

export function drawCitrineEnemies(ctx: CanvasRenderingContext2D, enemies: CitrineEnemy[]): void {
  for (const enemy of enemies) {
    const half = CITRINE_ENEMY_SIZE / 2;
    ctx.shadowBlur = CITRINE_ENEMY_SIZE * 5; ctx.shadowColor = CITRINE_ENEMY_GLOW;
    ctx.fillStyle = CITRINE_ENEMY_COLOR;
    ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), CITRINE_ENEMY_SIZE, CITRINE_ENEMY_SIZE);
    ctx.shadowBlur = 0;
    const barW = CITRINE_ENEMY_SIZE * 2.5; const barH = 2;
    ctx.save(); ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#222'; ctx.fillRect(enemy.x - barW / 2, enemy.y + CITRINE_ENEMY_SIZE + 2, barW, barH);
    ctx.fillStyle = CITRINE_ENEMY_COLOR;
    ctx.fillRect(enemy.x - barW / 2, enemy.y + CITRINE_ENEMY_SIZE + 2, barW * (enemy.hp / enemy.maxHp), barH);
    ctx.globalAlpha = 1; ctx.restore();
  }
}

export function drawCitrineBolts(ctx: CanvasRenderingContext2D, bolts: CitrineBolt[]): void {
  for (const b of bolts) {
    // Draw trail
    if (b.trailCount >= 2) {
      ctx.save();
      for (let i = 0; i < b.trailCount; i++) {
        const t = i / b.trailCount;
        const bufIdx = (b.trailHead - b.trailCount + i + CITRINE_BOLT_TRAIL_CAP) % CITRINE_BOLT_TRAIL_CAP;
        ctx.globalAlpha = t * 0.35;
        ctx.fillStyle = CITRINE_BOLT_COLOR;
        const ts = CITRINE_BOLT_SIZE * 0.7;
        ctx.fillRect(Math.floor(b.trailX[bufIdx] - ts / 2), Math.floor(b.trailY[bufIdx] - ts / 2), Math.ceil(ts), Math.ceil(ts));
      }
      ctx.globalAlpha = 1; ctx.restore();
    }
    const half = CITRINE_BOLT_SIZE / 2;
    ctx.shadowBlur = CITRINE_BOLT_SIZE * 4; ctx.shadowColor = CITRINE_BOLT_GLOW;
    ctx.fillStyle = CITRINE_BOLT_COLOR;
    ctx.fillRect(Math.floor(b.x - half), Math.floor(b.y - half), CITRINE_BOLT_SIZE, CITRINE_BOLT_SIZE);
    ctx.shadowBlur = 0;
  }
}

export function drawIoliteEnemies(ctx: CanvasRenderingContext2D, enemies: IoliteEnemy[]): void {
  for (const enemy of enemies) {
    const half = IOLITE_ENEMY_SIZE / 2;
    ctx.save();
    ctx.shadowBlur = IOLITE_ENEMY_SIZE * 5; ctx.shadowColor = IOLITE_ENEMY_GLOW;
    ctx.fillStyle = IOLITE_ENEMY_COLOR;
    ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), IOLITE_ENEMY_SIZE, IOLITE_ENEMY_SIZE);
    ctx.shadowBlur = 0;
    ctx.restore();
    const barW = IOLITE_ENEMY_SIZE * 3; const barH = 2;
    ctx.save(); ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#222'; ctx.fillRect(enemy.x - barW / 2, enemy.y + IOLITE_ENEMY_SIZE + 2, barW, barH);
    ctx.fillStyle = IOLITE_ENEMY_COLOR;
    ctx.fillRect(enemy.x - barW / 2, enemy.y + IOLITE_ENEMY_SIZE + 2, barW * (enemy.hp / enemy.maxHp), barH);
    ctx.globalAlpha = 1; ctx.restore();
  }
}

export function drawAmethystEnemies(ctx: CanvasRenderingContext2D, enemies: AmethystEnemy[]): void {
  for (const enemy of enemies) {
    if (enemy.shieldHp > 0) {
      const shieldRatio = enemy.shieldHp / enemy.maxShieldHp;
      ctx.save();
      ctx.globalAlpha = 0.3 + shieldRatio * 0.4;
      ctx.strokeStyle = AMETHYST_ENEMY_GLOW; ctx.lineWidth = 2;
      ctx.shadowBlur = AMETHYST_ENEMY_SIZE * 4; ctx.shadowColor = AMETHYST_ENEMY_GLOW;
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, AMETHYST_ENEMY_SIZE * 1.8, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.restore();
    }
    const half = AMETHYST_ENEMY_SIZE / 2;
    ctx.shadowBlur = AMETHYST_ENEMY_SIZE * 5; ctx.shadowColor = AMETHYST_ENEMY_GLOW;
    ctx.fillStyle = AMETHYST_ENEMY_COLOR;
    ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), AMETHYST_ENEMY_SIZE, AMETHYST_ENEMY_SIZE);
    ctx.shadowBlur = 0;
    const barW = AMETHYST_ENEMY_SIZE * 3; const barH = 2;
    ctx.save(); ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#222'; ctx.fillRect(enemy.x - barW / 2, enemy.y + AMETHYST_ENEMY_SIZE + 2, barW, barH);
    ctx.fillStyle = AMETHYST_ENEMY_COLOR;
    ctx.fillRect(enemy.x - barW / 2, enemy.y + AMETHYST_ENEMY_SIZE + 2, barW * (enemy.hp / enemy.maxHp), barH);
    ctx.globalAlpha = 1; ctx.restore();
  }
}

export function drawAmethystShards(ctx: CanvasRenderingContext2D, shards: AmethystShard[]): void {
  for (const s of shards) {
    const half = AMETHYST_SHARD_SIZE / 2;
    ctx.save();
    ctx.translate(Math.floor(s.x), Math.floor(s.y));
    ctx.rotate(Math.PI / 4);
    ctx.shadowBlur = AMETHYST_SHARD_SIZE * 3; ctx.shadowColor = AMETHYST_SHARD_GLOW;
    ctx.fillStyle = AMETHYST_SHARD_COLOR;
    ctx.fillRect(-half, -half, AMETHYST_SHARD_SIZE, AMETHYST_SHARD_SIZE);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

export function drawDiamondEnemies(ctx: CanvasRenderingContext2D, enemies: DiamondEnemy[]): void {
  for (const enemy of enemies) {
    const half = DIAMOND_ENEMY_SIZE / 2;
    ctx.save();
    ctx.translate(Math.floor(enemy.x), Math.floor(enemy.y));
    ctx.rotate(Math.PI / 4);
    const glowColor = enemy.phaseInvuln ? '#aaddff' : DIAMOND_ENEMY_GLOW;
    ctx.shadowBlur = DIAMOND_ENEMY_SIZE * (enemy.phaseInvuln ? 10 : 5);
    ctx.shadowColor = glowColor;
    ctx.fillStyle = enemy.phaseInvuln ? '#aaddff' : DIAMOND_ENEMY_COLOR;
    ctx.globalAlpha = enemy.phaseInvuln ? 0.6 : 1;
    ctx.fillRect(-half, -half, DIAMOND_ENEMY_SIZE, DIAMOND_ENEMY_SIZE);
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    ctx.restore();
    const barW = DIAMOND_ENEMY_SIZE * 3; const barH = 2;
    ctx.save(); ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#222'; ctx.fillRect(enemy.x - barW / 2, enemy.y + DIAMOND_ENEMY_SIZE + 2, barW, barH);
    ctx.fillStyle = DIAMOND_ENEMY_COLOR;
    ctx.fillRect(enemy.x - barW / 2, enemy.y + DIAMOND_ENEMY_SIZE + 2, barW * (enemy.hp / enemy.maxHp), barH);
    ctx.globalAlpha = 1; ctx.restore();
  }
}

export function drawDiamondShards(ctx: CanvasRenderingContext2D, shards: DiamondShard[]): void {
  for (const s of shards) {
    const half = DIAMOND_SHARD_SIZE / 2;
    ctx.save();
    ctx.translate(Math.floor(s.x), Math.floor(s.y));
    ctx.rotate(Math.PI / 4);
    ctx.shadowBlur = DIAMOND_SHARD_SIZE * 4; ctx.shadowColor = DIAMOND_SHARD_GLOW;
    ctx.fillStyle = DIAMOND_SHARD_COLOR;
    ctx.fillRect(-half, -half, DIAMOND_SHARD_SIZE, DIAMOND_SHARD_SIZE);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

export function drawNullstoneEnemies(ctx: CanvasRenderingContext2D, enemies: NullstoneEnemy[]): void {
  for (const enemy of enemies) {
    // Gravity field ring
    const pulseT = (enemy.pulseMs % 2000) / 2000;
    ctx.save();
    ctx.globalAlpha = 0.15 * (1 - pulseT);
    ctx.strokeStyle = NULLSTONE_ENEMY_GLOW; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(enemy.x, enemy.y, NULLSTONE_GRAVITY_RADIUS * pulseT, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1; ctx.restore();
    // Absorb glow
    if (enemy.isAbsorbing) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.shadowBlur = NULLSTONE_ENEMY_SIZE * 8; ctx.shadowColor = NULLSTONE_ENEMY_GLOW;
      ctx.strokeStyle = NULLSTONE_ENEMY_GLOW; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, NULLSTONE_ENEMY_SIZE * 1.8, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.restore();
    }
    // Body
    const half = NULLSTONE_ENEMY_SIZE / 2;
    ctx.shadowBlur = NULLSTONE_ENEMY_SIZE * 6; ctx.shadowColor = NULLSTONE_ENEMY_GLOW;
    ctx.fillStyle = NULLSTONE_ENEMY_COLOR;
    ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), NULLSTONE_ENEMY_SIZE, NULLSTONE_ENEMY_SIZE);
    ctx.shadowBlur = 0;
    const barW = NULLSTONE_ENEMY_SIZE * 3; const barH = 2;
    ctx.save(); ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#222'; ctx.fillRect(enemy.x - barW / 2, enemy.y + NULLSTONE_ENEMY_SIZE + 2, barW, barH);
    ctx.fillStyle = NULLSTONE_ENEMY_COLOR;
    ctx.fillRect(enemy.x - barW / 2, enemy.y + NULLSTONE_ENEMY_SIZE + 2, barW * (enemy.hp / enemy.maxHp), barH);
    ctx.globalAlpha = 1; ctx.restore();
  }
}

export function drawVoidTendrils(ctx: CanvasRenderingContext2D, tendrils: VoidTendril[]): void {
  for (const t of tendrils) {
    const half = VOID_TENDRIL_SIZE / 2;
    ctx.shadowBlur = VOID_TENDRIL_SIZE * 3; ctx.shadowColor = VOID_TENDRIL_GLOW;
    ctx.fillStyle = VOID_TENDRIL_COLOR;
    ctx.fillRect(Math.floor(t.x - half), Math.floor(t.y - half), VOID_TENDRIL_SIZE, VOID_TENDRIL_SIZE);
    ctx.shadowBlur = 0;
  }
}

export function drawFracterylEnemies(ctx: CanvasRenderingContext2D, enemies: FracterylEnemy[], shards: FracterylShard[]): void {
  for (const enemy of enemies) {
    const half = FRACTERYL_ENEMY_SIZE / 2;
    const pulse = Math.sin(enemy.pulseMs * 0.002) * 2;
    ctx.shadowBlur = 8 + pulse; ctx.shadowColor = FRACTERYL_ENEMY_GLOW;
    ctx.fillStyle = FRACTERYL_ENEMY_COLOR;
    ctx.save();
    ctx.translate(Math.round(enemy.x), Math.round(enemy.y));
    ctx.rotate(enemy.pulseMs * 0.002);
    ctx.fillRect(-half, -half, FRACTERYL_ENEMY_SIZE, FRACTERYL_ENEMY_SIZE);
    ctx.restore();
    ctx.shadowBlur = 0;
  }
  for (const shard of shards) {
    ctx.globalAlpha = Math.min(1, shard.lifeMs / 200);
    ctx.fillStyle = FRACTERYL_ENEMY_COLOR;
    ctx.beginPath();
    ctx.arc(Math.round(shard.x), Math.round(shard.y), 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

export function drawEigensteinEnemies(ctx: CanvasRenderingContext2D, enemies: EigensteinEnemy[]): void {
  for (const enemy of enemies) {
    const half = EIGENSTEIN_ENEMY_SIZE / 2;
    const pulse = Math.sin(enemy.pulseMs * 0.002) * 3;
    ctx.shadowBlur = 10 + pulse; ctx.shadowColor = EIGENSTEIN_ENEMY_GLOW;
    ctx.fillStyle = EIGENSTEIN_ENEMY_COLOR;
    ctx.save();
    ctx.translate(Math.round(enemy.x), Math.round(enemy.y));
    ctx.rotate(enemy.pulseMs * 0.0015);
    ctx.fillRect(-half, -half, EIGENSTEIN_ENEMY_SIZE, EIGENSTEIN_ENEMY_SIZE);
    ctx.restore();
    ctx.shadowBlur = 0;
  }
}

export function drawEigensteinBeams(ctx: CanvasRenderingContext2D, beams: EigensteinBeam[], widthPx: number, heightPx: number): void {
  const beamLen = Math.sqrt(widthPx * widthPx + heightPx * heightPx);
  for (const beam of beams) {
    const alpha = beam.isActive ? 0.8 : (1 - beam.timerMs / EIGENSTEIN_BEAM_CHARGE_MS) * 0.45;
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.strokeStyle = EIGENSTEIN_ENEMY_GLOW;
    ctx.lineWidth = beam.isActive ? 5 : 2;
    ctx.shadowBlur = beam.isActive ? 12 : 4;
    ctx.shadowColor = EIGENSTEIN_ENEMY_GLOW;
    ctx.beginPath();
    ctx.moveTo(beam.originX, beam.originY);
    ctx.lineTo(beam.originX + Math.cos(beam.angle) * beamLen, beam.originY + Math.sin(beam.angle) * beamLen);
    ctx.stroke();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
}

export function drawTeleportParticles(ctx: CanvasRenderingContext2D, particles: TeleportParticle[]): void {
  if (particles.length === 0) return;
  ctx.save();
  for (const p of particles) {
    const a = Math.max(0, p.alpha);
    ctx.globalAlpha = a;
    ctx.shadowBlur = 8; ctx.shadowColor = p.color;
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.floor(p.x - 1.5), Math.floor(p.y - 1.5), 3, 3);
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

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
  ctx.shadowBlur = 5; ctx.shadowColor = LASER_ENEMY_GLOW;
  ctx.strokeStyle = LASER_ENEMY_GLOW; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(controlX, controlY, tx, ty); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = LASER_ENEMY_COLOR; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(controlX, controlY, tx, ty); ctx.stroke();
  ctx.restore();
}

export function drawDeathParticles(ctx: CanvasRenderingContext2D, particles: DeathParticle[]): void {
  for (const p of particles) {
    ctx.globalAlpha = p.alpha; ctx.shadowBlur = p.size * 3; ctx.shadowColor = p.color;
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
    ctx.shadowBlur  = 3; ctx.shadowColor = line.color;
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
    ctx.shadowBlur  = size * 3; ctx.shadowColor = h.color; ctx.fillStyle = h.color;
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
    ctx.shadowBlur  = fontPx * 2;
    ctx.shadowColor = dn.color;
    ctx.fillStyle   = dn.color;
    ctx.fillText(dn.text, Math.round(dn.x), Math.round(dn.y));
  }
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  ctx.restore();
}

export function drawWeaponOrbitParticle(ctx: CanvasRenderingContext2D, p: WeaponOrbitParticle): void {
  ctx.save();
  // Draw trail first
  if (p.trailCount >= 2) {
    for (let i = 0; i < p.trailCount; i++) {
      const t      = i / p.trailCount;
      const bufIdx = (p.trailHead - p.trailCount + i + WEAPON_ORBIT_TRAIL_CAP) % WEAPON_ORBIT_TRAIL_CAP;
      const trailSize = p.size * t * 1.2;
      if (trailSize < 0.3) continue;
      const half = trailSize / 2;
      ctx.globalAlpha = t * 0.5;
      ctx.shadowBlur = trailSize * 5; ctx.shadowColor = p.glowColor; ctx.fillStyle = p.glowColor;
      ctx.fillRect(Math.floor(p.trailX[bufIdx] - half), Math.floor(p.trailY[bufIdx] - half), Math.ceil(trailSize), Math.ceil(trailSize));
      ctx.shadowBlur = 0;
    }
  }
  // Draw main particle
  const half = p.size / 2;
  ctx.globalAlpha = 0.9;
  ctx.shadowBlur = p.size * 5; ctx.shadowColor = p.glowColor; ctx.fillStyle = p.glowColor;
  ctx.fillRect(Math.floor(p.x - half * 1.8), Math.floor(p.y - half * 1.8), Math.ceil(p.size * 1.8), Math.ceil(p.size * 1.8));
  ctx.shadowBlur = 0;
  ctx.fillStyle = p.color;
  ctx.fillRect(Math.floor(p.x - half), Math.floor(p.y - half), Math.ceil(p.size), Math.ceil(p.size));
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawOrbitProjectile(ctx: CanvasRenderingContext2D, op: OrbitProjectile | null): void {
  if (!op) return;
  const projColor   = '#ffaa44';
  const projGlow    = '#ffcc88';
  ctx.save();
  // Trail
  if (op.trailCount >= 2) {
    for (let i = 0; i < op.trailCount; i++) {
      const t      = i / op.trailCount;
      const bufIdx = (op.trailHead - op.trailCount + i + ORBIT_PROJ_TRAIL_CAP) % ORBIT_PROJ_TRAIL_CAP;
      const trailSize = ORBIT_PROJ_SIZE * t * 1.3;
      if (trailSize < 0.3) continue;
      const half = trailSize / 2;
      ctx.globalAlpha = t * 0.45;
      ctx.shadowBlur = trailSize * 6; ctx.shadowColor = projGlow; ctx.fillStyle = projGlow;
      const gh = half * 2.2;
      ctx.fillRect(Math.floor(op.trailX[bufIdx] - gh), Math.floor(op.trailY[bufIdx] - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
      ctx.shadowBlur = 0;
      ctx.globalAlpha = t * 0.7;
      ctx.fillStyle = projColor;
      ctx.fillRect(Math.floor(op.trailX[bufIdx] - half), Math.floor(op.trailY[bufIdx] - half), Math.ceil(trailSize), Math.ceil(trailSize));
    }
  }
  // Main projectile body
  const half = ORBIT_PROJ_SIZE / 2;
  ctx.globalAlpha = 1;
  ctx.shadowBlur = ORBIT_PROJ_SIZE * 5; ctx.shadowColor = projGlow; ctx.fillStyle = projGlow;
  const gh = half * 2.2;
  ctx.fillRect(Math.floor(op.x - gh), Math.floor(op.y - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
  ctx.shadowBlur = 0;
  ctx.fillStyle = projColor;
  ctx.fillRect(Math.floor(op.x - half), Math.floor(op.y - half), ORBIT_PROJ_SIZE, ORBIT_PROJ_SIZE);
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawBossProjectiles(ctx: CanvasRenderingContext2D, projectiles: BossProjectile[]): void {
  if (projectiles.length === 0) return;
  ctx.save();
  for (const p of projectiles) {
    const lifeRatio = p.lifeMs / p.maxLifeMs;
    const alpha = Math.min(1, lifeRatio * 3.0);
    const ph = p.size / 2;
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = p.size * 5; ctx.shadowColor = p.glowColor; ctx.fillStyle = p.glowColor;
    const gh = ph * 2.2;
    ctx.fillRect(Math.floor(p.x - gh), Math.floor(p.y - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
    ctx.shadowBlur = 0;
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.floor(p.x - ph), Math.floor(p.y - ph), p.size, p.size);
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}


// ── Emerald player missiles (heat-seeking, gorgeous comet trails) ──────────────

export function drawEmeraldPlayerMissiles(
  ctx: CanvasRenderingContext2D,
  missiles: EmeraldPlayerMissile[],
): void {
  if (missiles.length === 0) return;
  ctx.save();
  for (const m of missiles) {
    // Comet trail — layered glow fading from bright tip to dark tail.
    if (m.trailCount >= 2) {
      for (let i = 0; i < m.trailCount; i++) {
        const t      = i / m.trailCount;
        const bufIdx = (m.trailHead - m.trailCount + i + EMERALD_MISSILE_TRAIL_CAP) % EMERALD_MISSILE_TRAIL_CAP;
        const trailSize = EMERALD_MISSILE_SIZE * t * 1.8;
        if (trailSize < 0.2) continue;
        const half = trailSize / 2;
        // Outer glow layer.
        ctx.globalAlpha = t * 0.5;
        ctx.shadowBlur  = trailSize * 7; ctx.shadowColor = EMERALD_MISSILE_GLOW;
        ctx.fillStyle   = EMERALD_MISSILE_GLOW;
        const gh = half * 2.5;
        ctx.fillRect(Math.floor(m.trailX[bufIdx] - gh), Math.floor(m.trailY[bufIdx] - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
        ctx.shadowBlur = 0;
        // Inner core layer.
        ctx.globalAlpha = t * 0.75;
        ctx.fillStyle   = EMERALD_MISSILE_COLOR;
        ctx.fillRect(Math.floor(m.trailX[bufIdx] - half), Math.floor(m.trailY[bufIdx] - half), Math.ceil(trailSize), Math.ceil(trailSize));
      }
    }
    // Missile body — bright emerald core.
    const half = EMERALD_MISSILE_SIZE / 2;
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = EMERALD_MISSILE_SIZE * 6; ctx.shadowColor = EMERALD_MISSILE_GLOW;
    ctx.fillStyle   = EMERALD_MISSILE_GLOW;
    const gh = half * 2.4;
    ctx.fillRect(Math.floor(m.x - gh), Math.floor(m.y - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
    ctx.shadowBlur = 0;
    ctx.fillStyle  = EMERALD_MISSILE_COLOR;
    ctx.fillRect(Math.floor(m.x - half), Math.floor(m.y - half), EMERALD_MISSILE_SIZE, EMERALD_MISSILE_SIZE);
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

// ── Sunstone mines ────────────────────────────────────────────────────────────

export function drawSunstoneMines(
  ctx: CanvasRenderingContext2D,
  mines: SunstoneMine[],
): void {
  if (mines.length === 0) return;
  const nowMs = Date.now();
  ctx.save();
  for (const mine of mines) {
    const fuseRatio = mine.fuseMs / SUNSTONE_MINE_FUSE_MS;
    // Danger threshold: last 4 seconds the mine pulses red.
    const isDanger = mine.fuseMs <= 4000;
    const pulseT   = isDanger ? (Math.sin(nowMs / 120) + 1) * 0.5 : 0;
    const bodyColor = isDanger
      ? lerpColor(SUNSTONE_MINE_COLOR, SUNSTONE_MINE_DANGER_COLOR, pulseT)
      : SUNSTONE_MINE_COLOR;
    const glowColor = isDanger
      ? lerpColor(SUNSTONE_MINE_GLOW, '#ff6600', pulseT)
      : SUNSTONE_MINE_GLOW;

    const half = SUNSTONE_MINE_SIZE / 2;

    // Outer glow.
    ctx.globalAlpha = 0.7;
    ctx.shadowBlur  = SUNSTONE_MINE_SIZE * 5; ctx.shadowColor = glowColor;
    ctx.fillStyle   = glowColor;
    const gh = half * 2;
    ctx.fillRect(Math.floor(mine.x - gh), Math.floor(mine.y - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
    ctx.shadowBlur = 0;

    // Mine body.
    ctx.globalAlpha = 1;
    ctx.fillStyle   = bodyColor;
    ctx.fillRect(Math.floor(mine.x - half), Math.floor(mine.y - half), SUNSTONE_MINE_SIZE, SUNSTONE_MINE_SIZE);

    // Fuse ring indicator: arc around mine showing remaining fuse time.
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = bodyColor;
    ctx.shadowBlur  = 3; ctx.shadowColor = glowColor;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.arc(mine.x, mine.y, SUNSTONE_MINE_SIZE + 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fuseRatio);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

/**
 * Linearly interpolates between two CSS hex colours.
 * Both colors must be 7-character '#rrggbb' strings.
 */
function lerpColor(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r  = Math.round(ar + (br - ar) * t);
  const g  = Math.round(ag + (bg - ag) * t);
  const bv = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bv.toString(16).padStart(2, '0')}`;
}
