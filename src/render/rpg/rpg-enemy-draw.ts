/**
 * rpg-enemy-draw.ts — Enemy-type draw functions extracted from rpg-entity-draw.ts.
 *
 * Contains draw functions for all enemy types and their associated projectiles/effects
 * (missiles, shards, spikes, bolts, tendrils, beams, teleport particles, etc.).
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
  TeleportParticle,
  BossEnemy,
} from './rpg-enemy-types';

import {
  SAPPHIRE_SHIELD_RADIUS, SAPPHIRE_ENEMY_GLOW, SAPPHIRE_ENEMY_COLOR, SAPPHIRE_ENEMY_SIZE,
  MISSILE_TRAIL_CAP, MISSILE_TRAIL_DASH_RATIO, MISSILE_GLOW, MISSILE_COLOR, MISSILE_SIZE,
  LASER_ENEMY_SIZE, LASER_ENEMY_COLOR, LASER_ENEMY_GLOW,
  BOSS_SIZE_BASE,
} from './rpg-constants';
import {
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
} from './rpg-enemy-constants';
import { drawAttackTrail } from './rpg-entity-draw';

// ── Low-graphics mode flag ────────────────────────────────────
let isLowGraphicsMode = false;

/** Sets low-graphics mode for RPG enemy draw functions (skips glow & trails). */
export function setLowGraphicsMode(enabled: boolean): void {
  isLowGraphicsMode = enabled;
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

export function drawQuartzEnemies(ctx: CanvasRenderingContext2D, enemies: QuartzEnemy[]): void {
  for (const enemy of enemies) {
    const half = QUARTZ_ENEMY_SIZE / 2;
    ctx.save();
    ctx.translate(Math.floor(enemy.x), Math.floor(enemy.y));
    ctx.rotate(Math.PI / 4);
    ctx.shadowBlur = isLowGraphicsMode ? 0 : QUARTZ_ENEMY_SIZE * 4; ctx.shadowColor = QUARTZ_ENEMY_GLOW;
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
    ctx.shadowBlur = isLowGraphicsMode ? 0 : QUARTZ_SPIKE_SIZE * 3; ctx.shadowColor = QUARTZ_SPIKE_GLOW;
    ctx.fillStyle = QUARTZ_SPIKE_COLOR;
    ctx.fillRect(-half, -half, QUARTZ_SPIKE_SIZE, QUARTZ_SPIKE_SIZE);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

export function drawRubyEnemies(ctx: CanvasRenderingContext2D, enemies: RubyEnemy[]): void {
  for (const enemy of enemies) {
    const half = RUBY_ENEMY_SIZE / 2;
    ctx.shadowBlur = isLowGraphicsMode ? 0 : RUBY_ENEMY_SIZE * 5; ctx.shadowColor = RUBY_ENEMY_GLOW;
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
    ctx.shadowBlur = isLowGraphicsMode ? 0 : RUBY_BOLT_SIZE * 4; ctx.shadowColor = RUBY_BOLT_GLOW;
    ctx.fillStyle = RUBY_BOLT_COLOR;
    ctx.fillRect(Math.floor(b.x - half), Math.floor(b.y - half), RUBY_BOLT_SIZE, RUBY_BOLT_SIZE);
    ctx.shadowBlur = 0;
  }
}

export function drawSunstoneEnemies(ctx: CanvasRenderingContext2D, enemies: SunstoneEnemy[]): void {
  for (const enemy of enemies) {
    const half = SUNSTONE_ENEMY_SIZE / 2;
    ctx.save();
    ctx.shadowBlur = isLowGraphicsMode ? 0 : SUNSTONE_ENEMY_SIZE * 5; ctx.shadowColor = SUNSTONE_ENEMY_GLOW;
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
    ctx.shadowBlur = isLowGraphicsMode ? 0 : CITRINE_ENEMY_SIZE * 5; ctx.shadowColor = CITRINE_ENEMY_GLOW;
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
    if (!isLowGraphicsMode && b.trailCount >= 2) {
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
    ctx.shadowBlur = isLowGraphicsMode ? 0 : CITRINE_BOLT_SIZE * 4; ctx.shadowColor = CITRINE_BOLT_GLOW;
    ctx.fillStyle = CITRINE_BOLT_COLOR;
    ctx.fillRect(Math.floor(b.x - half), Math.floor(b.y - half), CITRINE_BOLT_SIZE, CITRINE_BOLT_SIZE);
    ctx.shadowBlur = 0;
  }
}

export function drawIoliteEnemies(ctx: CanvasRenderingContext2D, enemies: IoliteEnemy[]): void {
  for (const enemy of enemies) {
    const half = IOLITE_ENEMY_SIZE / 2;
    ctx.save();
    ctx.shadowBlur = isLowGraphicsMode ? 0 : IOLITE_ENEMY_SIZE * 5; ctx.shadowColor = IOLITE_ENEMY_GLOW;
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
      ctx.shadowBlur = isLowGraphicsMode ? 0 : AMETHYST_ENEMY_SIZE * 4; ctx.shadowColor = AMETHYST_ENEMY_GLOW;
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, AMETHYST_ENEMY_SIZE * 1.8, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.restore();
    }
    const half = AMETHYST_ENEMY_SIZE / 2;
    ctx.shadowBlur = isLowGraphicsMode ? 0 : AMETHYST_ENEMY_SIZE * 5; ctx.shadowColor = AMETHYST_ENEMY_GLOW;
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
    ctx.shadowBlur = isLowGraphicsMode ? 0 : AMETHYST_SHARD_SIZE * 3; ctx.shadowColor = AMETHYST_SHARD_GLOW;
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
    ctx.shadowBlur = isLowGraphicsMode ? 0 : DIAMOND_ENEMY_SIZE * (enemy.phaseInvuln ? 10 : 5);
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
    ctx.shadowBlur = isLowGraphicsMode ? 0 : DIAMOND_SHARD_SIZE * 4; ctx.shadowColor = DIAMOND_SHARD_GLOW;
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
      ctx.shadowBlur = isLowGraphicsMode ? 0 : NULLSTONE_ENEMY_SIZE * 8; ctx.shadowColor = NULLSTONE_ENEMY_GLOW;
      ctx.strokeStyle = NULLSTONE_ENEMY_GLOW; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, NULLSTONE_ENEMY_SIZE * 1.8, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.restore();
    }
    // Body
    const half = NULLSTONE_ENEMY_SIZE / 2;
    ctx.shadowBlur = isLowGraphicsMode ? 0 : NULLSTONE_ENEMY_SIZE * 6; ctx.shadowColor = NULLSTONE_ENEMY_GLOW;
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
    ctx.shadowBlur = isLowGraphicsMode ? 0 : VOID_TENDRIL_SIZE * 3; ctx.shadowColor = VOID_TENDRIL_GLOW;
    ctx.fillStyle = VOID_TENDRIL_COLOR;
    ctx.fillRect(Math.floor(t.x - half), Math.floor(t.y - half), VOID_TENDRIL_SIZE, VOID_TENDRIL_SIZE);
    ctx.shadowBlur = 0;
  }
}

export function drawFracterylEnemies(ctx: CanvasRenderingContext2D, enemies: FracterylEnemy[], shards: FracterylShard[]): void {
  for (const enemy of enemies) {
    const half = FRACTERYL_ENEMY_SIZE / 2;
    const pulse = Math.sin(enemy.pulseMs * 0.002) * 2;
    ctx.shadowBlur = isLowGraphicsMode ? 0 : 8 + pulse; ctx.shadowColor = FRACTERYL_ENEMY_GLOW;
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
    ctx.shadowBlur = isLowGraphicsMode ? 0 : 10 + pulse; ctx.shadowColor = EIGENSTEIN_ENEMY_GLOW;
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
    ctx.shadowBlur = isLowGraphicsMode ? 0 : (beam.isActive ? 12 : 4);
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
    ctx.shadowBlur = isLowGraphicsMode ? 0 : 8; ctx.shadowColor = p.color;
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.floor(p.x - 1.5), Math.floor(p.y - 1.5), 3, 3);
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
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

/** Draws red triangle or outline indicators above all living enemies. */
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
): void {
  if (style === 'off') return;
  const drawMarker = (x: number, y: number, size: number): void => {
    if (style === 'outline') {
      ctx.save();
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = 1.5;
      if (!isLowGraphicsMode) {
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#ff3b30';
      }
      ctx.strokeRect(x - size / 2 - 2, y - size / 2 - 2, size + 4, size + 4);
      ctx.restore();
      return;
    }
    ctx.save();
    const markerY = y - size * 0.9 - 5;
    ctx.fillStyle = '#ff3b30';
    if (!isLowGraphicsMode) {
      ctx.shadowBlur = 5;
      ctx.shadowColor = '#ff3b30';
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
}
