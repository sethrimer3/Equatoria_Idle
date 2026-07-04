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

type DrawBounds = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

const DENSE_ENEMY_COUNT = 140;
const DENSE_PROJECTILE_COUNT = 120;

function isCircleVisible(x: number, y: number, radius: number, bounds?: DrawBounds): boolean {
  return !bounds || (
    x + radius >= bounds.left &&
    x - radius <= bounds.right &&
    y + radius >= bounds.top &&
    y - radius <= bounds.bottom
  );
}

function canDrawEnemyGlow(count: number): boolean {
  return !isLowGraphicsMode && count < DENSE_ENEMY_COUNT;
}

function canDrawProjectileGlow(count: number): boolean {
  return !isLowGraphicsMode && count < DENSE_PROJECTILE_COUNT;
}

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

export function drawQuartzEnemies(ctx: CanvasRenderingContext2D, enemies: QuartzEnemy[], bounds?: DrawBounds): void {
  if (enemies.length === 0) return;
  const drawGlow = canDrawEnemyGlow(enemies.length);
  const half = QUARTZ_ENEMY_SIZE / 2;
  if (drawGlow) { ctx.shadowBlur = QUARTZ_ENEMY_SIZE * 4; ctx.shadowColor = QUARTZ_ENEMY_GLOW; }
  ctx.fillStyle = QUARTZ_ENEMY_COLOR;
  for (const enemy of enemies) {
    if (!isCircleVisible(enemy.x, enemy.y, QUARTZ_ENEMY_SIZE * 2, bounds)) continue;
    ctx.save();
    ctx.translate(Math.floor(enemy.x), Math.floor(enemy.y));
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-half, -half, QUARTZ_ENEMY_SIZE, QUARTZ_ENEMY_SIZE);
    ctx.restore();
  }
  ctx.shadowBlur = 0;
  const barW = QUARTZ_ENEMY_SIZE * 2.5; const barH = 2;
  ctx.globalAlpha = 0.7;
  for (const enemy of enemies) {
    if (!isCircleVisible(enemy.x, enemy.y, QUARTZ_ENEMY_SIZE * 2, bounds)) continue;
    drawEnemyHealthBar(ctx, enemy, enemy.x - barW / 2, enemy.y + QUARTZ_ENEMY_SIZE + 2, barW, barH, QUARTZ_ENEMY_COLOR);
  }
  ctx.globalAlpha = 1;
}

export function drawQuartzSpikes(ctx: CanvasRenderingContext2D, spikes: QuartzSpike[], bounds?: DrawBounds): void {
  if (spikes.length === 0) return;
  const drawGlow = canDrawProjectileGlow(spikes.length);
  const half = QUARTZ_SPIKE_SIZE / 2;
  if (drawGlow) { ctx.shadowBlur = QUARTZ_SPIKE_SIZE * 3; ctx.shadowColor = QUARTZ_SPIKE_GLOW; }
  ctx.fillStyle = QUARTZ_SPIKE_COLOR;
  for (const s of spikes) {
    if (!isCircleVisible(s.x, s.y, QUARTZ_SPIKE_SIZE * 2, bounds)) continue;
    ctx.save();
    ctx.translate(Math.floor(s.x), Math.floor(s.y));
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-half, -half, QUARTZ_SPIKE_SIZE, QUARTZ_SPIKE_SIZE);
    ctx.restore();
  }
  ctx.shadowBlur = 0;
}

export function drawRubyEnemies(ctx: CanvasRenderingContext2D, enemies: RubyEnemy[], bounds?: DrawBounds): void {
  if (enemies.length === 0) return;
  const drawGlow = canDrawEnemyGlow(enemies.length);
  const half = RUBY_ENEMY_SIZE / 2;
  if (drawGlow) { ctx.shadowBlur = RUBY_ENEMY_SIZE * 5; ctx.shadowColor = RUBY_ENEMY_GLOW; }
  ctx.fillStyle = RUBY_ENEMY_COLOR;
  for (const enemy of enemies) {
    if (!isCircleVisible(enemy.x, enemy.y, RUBY_ENEMY_SIZE * 2, bounds)) continue;
    ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), RUBY_ENEMY_SIZE, RUBY_ENEMY_SIZE);
  }
  ctx.shadowBlur = 0;
  const barW = RUBY_ENEMY_SIZE * 2.5; const barH = 2;
  ctx.globalAlpha = 0.7;
  for (const enemy of enemies) {
    if (!isCircleVisible(enemy.x, enemy.y, RUBY_ENEMY_SIZE * 2, bounds)) continue;
    drawEnemyHealthBar(ctx, enemy, enemy.x - barW / 2, enemy.y + RUBY_ENEMY_SIZE + 2, barW, barH, RUBY_ENEMY_COLOR);
  }
  ctx.globalAlpha = 1;
}

export function drawRubyBolts(ctx: CanvasRenderingContext2D, bolts: RubyBolt[], bounds?: DrawBounds): void {
  if (bolts.length === 0) return;
  const drawGlow = canDrawProjectileGlow(bolts.length);
  const half = RUBY_BOLT_SIZE / 2;
  if (drawGlow) { ctx.shadowBlur = RUBY_BOLT_SIZE * 4; ctx.shadowColor = RUBY_BOLT_GLOW; }
  ctx.fillStyle = RUBY_BOLT_COLOR;
  for (const b of bolts) {
    if (!isCircleVisible(b.x, b.y, RUBY_BOLT_SIZE * 2, bounds)) continue;
    ctx.fillRect(Math.floor(b.x - half), Math.floor(b.y - half), RUBY_BOLT_SIZE, RUBY_BOLT_SIZE);
  }
  ctx.shadowBlur = 0;
}

export function drawSunstoneEnemies(ctx: CanvasRenderingContext2D, enemies: SunstoneEnemy[], bounds?: DrawBounds): void {
  if (enemies.length === 0) return;
  const drawGlow = canDrawEnemyGlow(enemies.length);
  const half = SUNSTONE_ENEMY_SIZE / 2;
  // Batch bodies
  if (drawGlow) { ctx.shadowBlur = SUNSTONE_ENEMY_SIZE * 5; ctx.shadowColor = SUNSTONE_ENEMY_GLOW; }
  ctx.fillStyle = SUNSTONE_ENEMY_COLOR;
  for (const enemy of enemies) {
    if (!isCircleVisible(enemy.x, enemy.y, SUNSTONE_ENEMY_SIZE * 2, bounds)) continue;
    ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), SUNSTONE_ENEMY_SIZE, SUNSTONE_ENEMY_SIZE);
  }
  ctx.shadowBlur = 0;
  // Batch mine-radius rings into one path
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = SUNSTONE_ENEMY_GLOW; ctx.lineWidth = 1;
  ctx.beginPath();
  for (const enemy of enemies) {
    if (!isCircleVisible(enemy.x, enemy.y, SUNSTONE_ENEMY_SIZE * 2, bounds)) continue;
    ctx.arc(enemy.x, enemy.y, SUNSTONE_ENEMY_SIZE * 1.6, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Batch health bars
  const barW = SUNSTONE_ENEMY_SIZE * 3; const barH = 2;
  ctx.globalAlpha = 0.7;
  for (const enemy of enemies) {
    if (!isCircleVisible(enemy.x, enemy.y, SUNSTONE_ENEMY_SIZE * 2, bounds)) continue;
    drawEnemyHealthBar(ctx, enemy, enemy.x - barW / 2, enemy.y + SUNSTONE_ENEMY_SIZE + 2, barW, barH, SUNSTONE_ENEMY_COLOR);
  }
  ctx.globalAlpha = 1;
}

export function drawCitrineEnemies(ctx: CanvasRenderingContext2D, enemies: CitrineEnemy[], bounds?: DrawBounds): void {
  if (enemies.length === 0) return;
  const drawGlow = canDrawEnemyGlow(enemies.length);
  const half = CITRINE_ENEMY_SIZE / 2;
  if (drawGlow) { ctx.shadowBlur = CITRINE_ENEMY_SIZE * 5; ctx.shadowColor = CITRINE_ENEMY_GLOW; }
  ctx.fillStyle = CITRINE_ENEMY_COLOR;
  for (const enemy of enemies) {
    if (!isCircleVisible(enemy.x, enemy.y, CITRINE_ENEMY_SIZE * 2, bounds)) continue;
    ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), CITRINE_ENEMY_SIZE, CITRINE_ENEMY_SIZE);
  }
  ctx.shadowBlur = 0;
  const barW = CITRINE_ENEMY_SIZE * 2.5; const barH = 2;
  ctx.globalAlpha = 0.7;
  for (const enemy of enemies) {
    if (!isCircleVisible(enemy.x, enemy.y, CITRINE_ENEMY_SIZE * 2, bounds)) continue;
    drawEnemyHealthBar(ctx, enemy, enemy.x - barW / 2, enemy.y + CITRINE_ENEMY_SIZE + 2, barW, barH, CITRINE_ENEMY_COLOR);
  }
  ctx.globalAlpha = 1;
}

export function drawCitrineBolts(ctx: CanvasRenderingContext2D, bolts: CitrineBolt[], bounds?: DrawBounds): void {
  const drawGlow = canDrawProjectileGlow(bolts.length);
  const trailStep = bolts.length >= DENSE_PROJECTILE_COUNT ? 2 : 1;
  for (const b of bolts) {
    if (!isCircleVisible(b.x, b.y, CITRINE_BOLT_SIZE * 3, bounds)) continue;
    // Draw trail
    if (drawGlow && b.trailCount >= 2) {
      ctx.save();
      for (let i = 0; i < b.trailCount; i += trailStep) {
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
    ctx.shadowBlur = drawGlow ? CITRINE_BOLT_SIZE * 4 : 0; ctx.shadowColor = CITRINE_BOLT_GLOW;
    ctx.fillStyle = CITRINE_BOLT_COLOR;
    ctx.fillRect(Math.floor(b.x - half), Math.floor(b.y - half), CITRINE_BOLT_SIZE, CITRINE_BOLT_SIZE);
    ctx.shadowBlur = 0;
  }
}

export function drawIoliteEnemies(ctx: CanvasRenderingContext2D, enemies: IoliteEnemy[], bounds?: DrawBounds): void {
  if (enemies.length === 0) return;
  const drawGlow = canDrawEnemyGlow(enemies.length);
  const half = IOLITE_ENEMY_SIZE / 2;
  if (drawGlow) { ctx.shadowBlur = IOLITE_ENEMY_SIZE * 5; ctx.shadowColor = IOLITE_ENEMY_GLOW; }
  ctx.fillStyle = IOLITE_ENEMY_COLOR;
  for (const enemy of enemies) {
    if (!isCircleVisible(enemy.x, enemy.y, IOLITE_ENEMY_SIZE * 2, bounds)) continue;
    ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), IOLITE_ENEMY_SIZE, IOLITE_ENEMY_SIZE);
  }
  ctx.shadowBlur = 0;
  const barW = IOLITE_ENEMY_SIZE * 3; const barH = 2;
  ctx.globalAlpha = 0.7;
  for (const enemy of enemies) {
    if (!isCircleVisible(enemy.x, enemy.y, IOLITE_ENEMY_SIZE * 2, bounds)) continue;
    drawEnemyHealthBar(ctx, enemy, enemy.x - barW / 2, enemy.y + IOLITE_ENEMY_SIZE + 2, barW, barH, IOLITE_ENEMY_COLOR);
  }
  ctx.globalAlpha = 1;
}

export function drawAmethystEnemies(ctx: CanvasRenderingContext2D, enemies: AmethystEnemy[], bounds?: DrawBounds): void {
  const drawGlow = canDrawEnemyGlow(enemies.length);
  // Per-enemy shield rings (alpha varies per enemy)
  ctx.strokeStyle = AMETHYST_ENEMY_GLOW; ctx.lineWidth = 2;
  if (drawGlow) { ctx.shadowBlur = AMETHYST_ENEMY_SIZE * 4; ctx.shadowColor = AMETHYST_ENEMY_GLOW; }
  for (const enemy of enemies) {
    if (enemy.shieldHp <= 0) continue;
    if (!isCircleVisible(enemy.x, enemy.y, AMETHYST_ENEMY_SIZE * 2, bounds)) continue;
    ctx.globalAlpha = 0.3 + (enemy.shieldHp / enemy.maxShieldHp) * 0.4;
    ctx.beginPath(); ctx.arc(enemy.x, enemy.y, AMETHYST_ENEMY_SIZE * 1.8, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  if (enemies.length === 0) return;
  // Batch bodies
  const half = AMETHYST_ENEMY_SIZE / 2;
  if (drawGlow) { ctx.shadowBlur = AMETHYST_ENEMY_SIZE * 5; ctx.shadowColor = AMETHYST_ENEMY_GLOW; }
  ctx.fillStyle = AMETHYST_ENEMY_COLOR;
  for (const enemy of enemies) {
    if (!isCircleVisible(enemy.x, enemy.y, AMETHYST_ENEMY_SIZE * 2, bounds)) continue;
    ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), AMETHYST_ENEMY_SIZE, AMETHYST_ENEMY_SIZE);
  }
  ctx.shadowBlur = 0;
  // Batch health bars
  const barW = AMETHYST_ENEMY_SIZE * 3; const barH = 2;
  ctx.globalAlpha = 0.7;
  for (const enemy of enemies) {
    if (!isCircleVisible(enemy.x, enemy.y, AMETHYST_ENEMY_SIZE * 2, bounds)) continue;
    drawEnemyHealthBar(ctx, enemy, enemy.x - barW / 2, enemy.y + AMETHYST_ENEMY_SIZE + 2, barW, barH, AMETHYST_ENEMY_COLOR);
  }
  ctx.globalAlpha = 1;
}

export function drawAmethystShards(ctx: CanvasRenderingContext2D, shards: AmethystShard[], bounds?: DrawBounds): void {
  if (shards.length === 0) return;
  const drawGlow = canDrawProjectileGlow(shards.length);
  const half = AMETHYST_SHARD_SIZE / 2;
  if (drawGlow) { ctx.shadowBlur = AMETHYST_SHARD_SIZE * 3; ctx.shadowColor = AMETHYST_SHARD_GLOW; }
  ctx.fillStyle = AMETHYST_SHARD_COLOR;
  for (const s of shards) {
    if (!isCircleVisible(s.x, s.y, AMETHYST_SHARD_SIZE * 2, bounds)) continue;
    ctx.save();
    ctx.translate(Math.floor(s.x), Math.floor(s.y));
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-half, -half, AMETHYST_SHARD_SIZE, AMETHYST_SHARD_SIZE);
    ctx.restore();
  }
  ctx.shadowBlur = 0;
}

export function drawDiamondEnemies(ctx: CanvasRenderingContext2D, enemies: DiamondEnemy[], bounds?: DrawBounds): void {
  const drawGlow = canDrawEnemyGlow(enemies.length);
  for (const enemy of enemies) {
    if (!isCircleVisible(enemy.x, enemy.y, DIAMOND_ENEMY_SIZE * 2, bounds)) continue;
    const half = DIAMOND_ENEMY_SIZE / 2;
    ctx.save();
    ctx.translate(Math.floor(enemy.x), Math.floor(enemy.y));
    ctx.rotate(Math.PI / 4);
    const glowColor = enemy.phaseInvuln ? '#aaddff' : DIAMOND_ENEMY_GLOW;
    ctx.shadowBlur = drawGlow ? DIAMOND_ENEMY_SIZE * (enemy.phaseInvuln ? 10 : 5) : 0;
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

export function drawDiamondShards(ctx: CanvasRenderingContext2D, shards: DiamondShard[], bounds?: DrawBounds): void {
  if (shards.length === 0) return;
  const drawGlow = canDrawProjectileGlow(shards.length);
  const half = DIAMOND_SHARD_SIZE / 2;
  if (drawGlow) { ctx.shadowBlur = DIAMOND_SHARD_SIZE * 4; ctx.shadowColor = DIAMOND_SHARD_GLOW; }
  ctx.fillStyle = DIAMOND_SHARD_COLOR;
  for (const s of shards) {
    if (!isCircleVisible(s.x, s.y, DIAMOND_SHARD_SIZE * 2, bounds)) continue;
    ctx.save();
    ctx.translate(Math.floor(s.x), Math.floor(s.y));
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-half, -half, DIAMOND_SHARD_SIZE, DIAMOND_SHARD_SIZE);
    ctx.restore();
  }
  ctx.shadowBlur = 0;
}

export function drawNullstoneEnemies(ctx: CanvasRenderingContext2D, enemies: NullstoneEnemy[], bounds?: DrawBounds): void {
  if (enemies.length === 0) return;
  const drawGlow = canDrawEnemyGlow(enemies.length);
  // Gravity rings (alpha and radius vary per enemy)
  ctx.strokeStyle = NULLSTONE_ENEMY_GLOW; ctx.lineWidth = 1;
  for (const enemy of enemies) {
    if (!isCircleVisible(enemy.x, enemy.y, NULLSTONE_GRAVITY_RADIUS, bounds)) continue;
    const pulseT = (enemy.pulseMs % 2000) / 2000;
    ctx.globalAlpha = 0.15 * (1 - pulseT);
    ctx.beginPath(); ctx.arc(enemy.x, enemy.y, NULLSTONE_GRAVITY_RADIUS * pulseT, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Absorb glows (conditional per enemy)
  if (drawGlow) {
    ctx.lineWidth = 2;
    for (const enemy of enemies) {
      if (!enemy.isAbsorbing) continue;
      if (!isCircleVisible(enemy.x, enemy.y, NULLSTONE_ENEMY_SIZE * 3, bounds)) continue;
      ctx.globalAlpha = 0.5;
      ctx.shadowBlur = NULLSTONE_ENEMY_SIZE * 8; ctx.shadowColor = NULLSTONE_ENEMY_GLOW;
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, NULLSTONE_ENEMY_SIZE * 1.8, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = 1;
  }
  // Batch bodies
  const half = NULLSTONE_ENEMY_SIZE / 2;
  if (drawGlow) { ctx.shadowBlur = NULLSTONE_ENEMY_SIZE * 6; ctx.shadowColor = NULLSTONE_ENEMY_GLOW; }
  ctx.fillStyle = NULLSTONE_ENEMY_COLOR;
  for (const enemy of enemies) {
    if (!isCircleVisible(enemy.x, enemy.y, NULLSTONE_GRAVITY_RADIUS, bounds)) continue;
    ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), NULLSTONE_ENEMY_SIZE, NULLSTONE_ENEMY_SIZE);
  }
  ctx.shadowBlur = 0;
  // Batch health bars
  const barW = NULLSTONE_ENEMY_SIZE * 3; const barH = 2;
  ctx.globalAlpha = 0.7;
  for (const enemy of enemies) {
    if (!isCircleVisible(enemy.x, enemy.y, NULLSTONE_GRAVITY_RADIUS, bounds)) continue;
    drawEnemyHealthBar(ctx, enemy, enemy.x - barW / 2, enemy.y + NULLSTONE_ENEMY_SIZE + 2, barW, barH, NULLSTONE_ENEMY_COLOR);
  }
  ctx.globalAlpha = 1;
}

export function drawVoidTendrils(ctx: CanvasRenderingContext2D, tendrils: VoidTendril[], bounds?: DrawBounds): void {
  if (tendrils.length === 0) return;
  const drawGlow = canDrawProjectileGlow(tendrils.length);
  const half = VOID_TENDRIL_SIZE / 2;
  if (drawGlow) { ctx.shadowBlur = VOID_TENDRIL_SIZE * 3; ctx.shadowColor = VOID_TENDRIL_GLOW; }
  ctx.fillStyle = VOID_TENDRIL_COLOR;
  for (const t of tendrils) {
    if (!isCircleVisible(t.x, t.y, VOID_TENDRIL_SIZE * 2, bounds)) continue;
    ctx.fillRect(Math.floor(t.x - half), Math.floor(t.y - half), VOID_TENDRIL_SIZE, VOID_TENDRIL_SIZE);
  }
  ctx.shadowBlur = 0;
}

export function drawFracterylEnemies(ctx: CanvasRenderingContext2D, enemies: FracterylEnemy[], shards: FracterylShard[], bounds?: DrawBounds): void {
  const drawGlow = canDrawEnemyGlow(enemies.length);
  // Bodies: shadow varies per enemy (pulse), but hoist fillStyle
  const half = FRACTERYL_ENEMY_SIZE / 2;
  ctx.fillStyle = FRACTERYL_ENEMY_COLOR;
  for (const enemy of enemies) {
    if (!isCircleVisible(enemy.x, enemy.y, FRACTERYL_ENEMY_SIZE * 2, bounds)) continue;
    const pulse = Math.sin(enemy.pulseMs * 0.002) * 2;
    if (drawGlow) { ctx.shadowBlur = 8 + pulse; ctx.shadowColor = FRACTERYL_ENEMY_GLOW; }
    ctx.save();
    ctx.translate(Math.round(enemy.x), Math.round(enemy.y));
    ctx.rotate(enemy.pulseMs * 0.002);
    ctx.fillRect(-half, -half, FRACTERYL_ENEMY_SIZE, FRACTERYL_ENEMY_SIZE);
    ctx.restore();
    ctx.shadowBlur = 0;
  }
  // Shards: hoist fillStyle, alpha varies per shard
  if (shards.length > 0) {
    ctx.fillStyle = FRACTERYL_ENEMY_COLOR;
    for (const shard of shards) {
      if (!isCircleVisible(shard.x, shard.y, 4, bounds)) continue;
      ctx.globalAlpha = Math.min(1, shard.lifeMs / 200);
      ctx.beginPath();
      ctx.arc(Math.round(shard.x), Math.round(shard.y), 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

export function drawEigensteinEnemies(ctx: CanvasRenderingContext2D, enemies: EigensteinEnemy[], bounds?: DrawBounds): void {
  const drawGlow = canDrawEnemyGlow(enemies.length);
  const half = EIGENSTEIN_ENEMY_SIZE / 2;
  ctx.fillStyle = EIGENSTEIN_ENEMY_COLOR;
  for (const enemy of enemies) {
    if (!isCircleVisible(enemy.x, enemy.y, EIGENSTEIN_ENEMY_SIZE * 2, bounds)) continue;
    const pulse = Math.sin(enemy.pulseMs * 0.002) * 3;
    if (drawGlow) { ctx.shadowBlur = 10 + pulse; ctx.shadowColor = EIGENSTEIN_ENEMY_GLOW; }
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

export function drawTeleportParticles(ctx: CanvasRenderingContext2D, particles: TeleportParticle[], bounds?: DrawBounds): void {
  if (particles.length === 0) return;
  const drawGlow = canDrawProjectileGlow(particles.length);
  ctx.save();
  for (const p of particles) {
    if (!isCircleVisible(p.x, p.y, 6, bounds)) continue;
    const a = Math.max(0, p.alpha);
    ctx.globalAlpha = a;
    ctx.shadowBlur = drawGlow ? 8 : 0; ctx.shadowColor = p.color;
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.floor(p.x - 1.5), Math.floor(p.y - 1.5), 3, 3);
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}
