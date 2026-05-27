/**
 * rpg-enemy-draw-adv.ts — Draw functions for advanced (Quartz-tier and above) enemies.
 *
 * Extracted from rpg-enemy-draw.ts to keep that file under ~300 lines.
 * Contains draw functions for all enemy types from Quartz onward:
 *   Quartz, Ruby, Sunstone, Citrine, Iolite, Amethyst, Diamond,
 *   Nullstone, Fracteryl, Eigenstein, and teleport particles.
 *
 * Each function takes an explicit `ctx: CanvasRenderingContext2D` as its first
 * parameter plus the entity array(s) it needs — no closure captures.
 */

import type {
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
} from './rpg-enemy-types';
import {
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
import { enemyHealthFraction, shouldDrawEnemyHealthBar } from './rpg-health-bar';

// ── Low-graphics mode flag ────────────────────────────────────
let isLowGraphicsMode = false;

function drawEnemyHealthBar(
  ctx: CanvasRenderingContext2D,
  enemy: { hp: number; maxHp: number },
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): void {
  if (!shouldDrawEnemyHealthBar(enemy)) return;
  ctx.fillStyle = '#222'; ctx.fillRect(x, y, width, height);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width * enemyHealthFraction(enemy), height);
}

/** Sets low-graphics mode for advanced enemy draw functions (skips glow & trails). */
export function setLowGraphicsMode(enabled: boolean): void {
  isLowGraphicsMode = enabled;
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
    drawEnemyHealthBar(ctx, enemy, enemy.x - barW / 2, enemy.y + QUARTZ_ENEMY_SIZE + 2, barW, barH, QUARTZ_ENEMY_COLOR);
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
    drawEnemyHealthBar(ctx, enemy, enemy.x - barW / 2, enemy.y + RUBY_ENEMY_SIZE + 2, barW, barH, RUBY_ENEMY_COLOR);
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
    drawEnemyHealthBar(ctx, enemy, enemy.x - barW / 2, enemy.y + SUNSTONE_ENEMY_SIZE + 2, barW, barH, SUNSTONE_ENEMY_COLOR);
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
    drawEnemyHealthBar(ctx, enemy, enemy.x - barW / 2, enemy.y + CITRINE_ENEMY_SIZE + 2, barW, barH, CITRINE_ENEMY_COLOR);
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
    drawEnemyHealthBar(ctx, enemy, enemy.x - barW / 2, enemy.y + IOLITE_ENEMY_SIZE + 2, barW, barH, IOLITE_ENEMY_COLOR);
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
    drawEnemyHealthBar(ctx, enemy, enemy.x - barW / 2, enemy.y + AMETHYST_ENEMY_SIZE + 2, barW, barH, AMETHYST_ENEMY_COLOR);
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
    drawEnemyHealthBar(ctx, enemy, enemy.x - barW / 2, enemy.y + DIAMOND_ENEMY_SIZE + 2, barW, barH, DIAMOND_ENEMY_COLOR);
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
    drawEnemyHealthBar(ctx, enemy, enemy.x - barW / 2, enemy.y + NULLSTONE_ENEMY_SIZE + 2, barW, barH, NULLSTONE_ENEMY_COLOR);
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
