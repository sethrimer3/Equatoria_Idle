/**
 * rpg-enemy-updates.ts — Per-frame update logic for all non-boss, non-laser enemy types.
 *
 * Each function is a pure transformation over its own entity arrays plus a
 * shared RpgEnemyCtx that holds the handful of cross-cutting references
 * (player position, canvas dimensions, fluid, callback delegates).
 *
 * Extracted from rpg-render.ts Phase 5 to keep that closure under ~5 500 lines
 * and give each enemy system a navigable, self-contained home.
 *
 * Sections (in wave-unlock order):
 *   - Emerald (wave 9)
 *   - Amber (wave 12)
 *   - Void (wave 15)
 *   - Quartz (wave 1 variant)
 *   - Ruby
 *   - Sunstone
 *   - Citrine
 *   - Iolite
 *   - Amethyst
 *   - Diamond
 *   - Nullstone
 *   - Fracteryl
 *   - Eigenstein
 *   - Teleport particles (visual helper, enemy-agnostic)
 */

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
  HitEffect, ShotLine,
  TeleportParticle,
} from './rpg-types';
import type { FluidImpulse } from './rpg-fluid';
import {
  TARGET_FRAME_MS,
  EMERALD_PATROL_SPEED, EMERALD_PATROL_TURN_MS, EMERALD_PATROL_DAMPING,
  EMERALD_ATTACK_RADIUS, EMERALD_CHARGE_MS, EMERALD_BLINK_OFFSET, EMERALD_COOLDOWN_MS,
  EMERALD_GHOST_FADE_MS, EMERALD_ENEMY_SIZE,
  FLUID_VEL_FRAME_TO_PX_S, FLUID_ENEMY_STRENGTH, FLUID_PROJECTILE_STRENGTH,
  FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B,
  FLUID_AMBER_R, FLUID_AMBER_G, FLUID_AMBER_B,
  FLUID_VOID_R, FLUID_VOID_G, FLUID_VOID_B,
  FLUID_MISSILE_STRENGTH,
  FLUID_FRACTERYL_R, FLUID_FRACTERYL_G, FLUID_FRACTERYL_B,
  FLUID_EIGENSTEIN_R, FLUID_EIGENSTEIN_G, FLUID_EIGENSTEIN_B,
  AMBER_PATROL_SPEED, AMBER_PATROL_TURN_MS, AMBER_PATROL_DAMPING,
  AMBER_MISSILE_CD_MS, AMBER_MISSILE_JITTER,
  AMBER_SHARD_COUNT, AMBER_SHARD_SPREAD_RAD, AMBER_SHARD_SPEED,
  AMBER_SHARD_SEEK_STR, AMBER_SHARD_MAX_SPEED, AMBER_SHARD_TRAIL_CAP,
  AMBER_ENEMY_SIZE, SPEED_EPSILON,
  VOID_PURSUE_SPEED, VOID_CONTACT_RADIUS, VOID_CONTACT_CD_MS,
  VOID_AURA_PULSE_MS, VOID_ENEMY_SIZE,
  QUARTZ_PREFERRED_DIST, QUARTZ_APPROACH_SPEED, QUARTZ_STRAFE_SPEED,
  QUARTZ_SPIKE_CD_MS, QUARTZ_SPIKE_JITTER, QUARTZ_SPIKE_SPEED,
  RUBY_PATROL_SPEED, RUBY_BOLT_CD_MS, RUBY_BOLT_JITTER, RUBY_PREFERRED_DIST, RUBY_BOLT_SPEED,
  SUNSTONE_ORBIT_SPEED, SUNSTONE_PREFERRED_DIST, SUNSTONE_PULSE_CD_MS, SUNSTONE_PULSE_JITTER,
  SUNSTONE_ENEMY_SIZE, SUNSTONE_ENEMY_GLOW,
  CITRINE_PATROL_SPEED, CITRINE_PATROL_TURN_MS,
  CITRINE_BOLT_CD_MS, CITRINE_BOLT_JITTER, CITRINE_BOLT_SPEED,
  CITRINE_BOLT_MAX_SPEED, CITRINE_BOLT_SEEK, CITRINE_BOLT_TRAIL_CAP,
  IOLITE_PATROL_SPEED, IOLITE_PATROL_TURN_MS,
  IOLITE_BEAM_CD_MS, IOLITE_BEAM_JITTER, IOLITE_BEAM_RANGE,
  IOLITE_BEAM_COUNT, IOLITE_BEAM_SPREAD_RAD, IOLITE_ENEMY_GLOW,
  AMETHYST_PATROL_SPEED, AMETHYST_PATROL_TURN_MS,
  AMETHYST_BURST_CD_MS, AMETHYST_BURST_JITTER, AMETHYST_BURST_COUNT,
  AMETHYST_SHARD_SPEED,
  DIAMOND_PATROL_SPEED, DIAMOND_ORBIT_SPEED,
  DIAMOND_PHASE_INVULN_MS, DIAMOND_PHASE_VULN_MS,
  DIAMOND_SHARD_CD_MS, DIAMOND_SHARD_COUNT, DIAMOND_SHARD_SPEED, DIAMOND_ENEMY_SIZE,
  NULLSTONE_GRAVITY_STRENGTH, NULLSTONE_GRAVITY_RADIUS,
  NULLSTONE_ABSORB_MS, NULLSTONE_ABSORB_CD_MS,
  NULLSTONE_PATROL_SPEED, NULLSTONE_PATROL_TURN_MS,
  NULLSTONE_TENDRIL_CD_MS, NULLSTONE_TENDRIL_COUNT,
  VOID_TENDRIL_SPEED,
  FRACTERYL_PATROL_TURN_MS, FRACTERYL_BURST_CD_MS, FRACTERYL_BURST_JITTER,
  FRACTERYL_ENEMY_SIZE,
  EIGENSTEIN_PATROL_TURN_MS, EIGENSTEIN_BEAM_CD_MS, EIGENSTEIN_BEAM_JITTER,
  EIGENSTEIN_BEAM_CHARGE_MS, EIGENSTEIN_BEAM_FIRE_MS, EIGENSTEIN_ENEMY_SIZE,
  HIT_EFFECT_DURATION_MS, PLAYER_HIT_RADIUS,
} from './rpg-constants';
import {
  makeAmberShard,
  makeQuartzSpike,
  makeRubyBolt,
  makeCitrineBolt,
  makeAmethystShard,
  makeDiamondShard,
  makeVoidTendril,
  makeFracterylShard,
} from './rpg-factories';

// ── Shared context interface ───────────────────────────────────────────────────

/**
 * Minimal shared context passed to every enemy update function.
 *
 * All fields are object references or callbacks captured by the
 * createRpgRender closure, so they always reflect current closure state.
 * `dim` is an object kept in sync with the closure's widthPx / heightPx
 * on every resize(), so reading `ctx.dim.w` is always current.
 */
export interface RpgEnemyCtx {
  /** Player mote — position and velocity (mutable reference). */
  readonly mote: { x: number; y: number; vx: number; vy: number };
  /** Current canvas dimensions — updated on resize via shared object. */
  readonly dim: { w: number; h: number };
  /** Euler fluid simulator — only addForce used by enemy update code. */
  readonly fluid: { addForce(impulse: FluidImpulse): void };
  /** Hit-flash effect array — pushed to by some enemy systems. */
  readonly hitEffects: HitEffect[];
  /** Shot-line visual array — pushed to by Iolite beams. */
  readonly shotLines: ShotLine[];
  /** Deal standard (no-knockback) damage to the player. Handles iframes. */
  dealDamageToPlayer(atk: number): void;
  /**
   * Deal knockback-carrying damage to the player (used only by Amber shards).
   * @param atk - raw attack value
   * @param normDirX - normalised knockback/damage-number direction X
   * @param normDirY - normalised knockback/damage-number direction Y
   */
  dealDamageToPlayerKnockback(atk: number, normDirX: number, normDirY: number): void;
  /** Clamp an entity within canvas bounds, reversing velocity on each axis. */
  clampEnemyToBounds(e: { x: number; y: number; vx: number; vy: number }): void;
}

// ── Emerald enemy system (blink-striker) ──────────────────────────────────────

export function updateEmeraldEnemies(
  enemies: EmeraldEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote, dim, fluid } = ctx;
  for (const enemy of enemies) {
    // Fade ghost afterimage
    if (enemy.ghostAlpha > 0) {
      enemy.ghostAlpha = Math.max(0, enemy.ghostAlpha - deltaMs / EMERALD_GHOST_FADE_MS);
    }

    if (enemy.phase === 'patrol') {
      // Random patrol movement
      enemy.patrolTimerMs -= deltaMs;
      if (enemy.patrolTimerMs <= 0) {
        const angle = Math.random() * Math.PI * 2;
        enemy.vx = Math.cos(angle) * EMERALD_PATROL_SPEED;
        enemy.vy = Math.sin(angle) * EMERALD_PATROL_SPEED;
        enemy.patrolTimerMs = EMERALD_PATROL_TURN_MS * (0.5 + Math.random() * 0.8);
      }
      const dampFactor = Math.pow(EMERALD_PATROL_DAMPING, dt);
      enemy.vx *= dampFactor; enemy.vy *= dampFactor;
      enemy.x  += enemy.vx * dt; enemy.y += enemy.vy * dt;
      // Clamp
      const half = EMERALD_ENEMY_SIZE / 2;
      if (enemy.x < half)            { enemy.x = half;            enemy.vx =  Math.abs(enemy.vx) * 0.5; }
      if (enemy.x > dim.w - half)    { enemy.x = dim.w - half;    enemy.vx = -Math.abs(enemy.vx) * 0.5; }
      if (enemy.y < half)            { enemy.y = half;             enemy.vy =  Math.abs(enemy.vy) * 0.5; }
      if (enemy.y > dim.h - half)    { enemy.y = dim.h - half;     enemy.vy = -Math.abs(enemy.vy) * 0.5; }

      // Fluid from patrol movement
      const espd = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
      if (espd > 0.04) {
        fluid.addForce({
          x: enemy.x, y: enemy.y,
          vx: enemy.vx * FLUID_VEL_FRAME_TO_PX_S,
          vy: enemy.vy * FLUID_VEL_FRAME_TO_PX_S,
          r: FLUID_EMERALD_R, g: FLUID_EMERALD_G, b: FLUID_EMERALD_B,
          strength: FLUID_ENEMY_STRENGTH,
        });
      }

      // Detect player
      const dx = mote.x - enemy.x, dy = mote.y - enemy.y;
      if (dx * dx + dy * dy < EMERALD_ATTACK_RADIUS * EMERALD_ATTACK_RADIUS) {
        enemy.phase = 'charging'; enemy.phaseMs = 0; enemy.hasHitPlayer = false;
        enemy.vx = 0; enemy.vy = 0;
      }

    } else if (enemy.phase === 'charging') {
      enemy.phaseMs += deltaMs;
      // Brief charge-up — enemy freezes and pulses
      if (enemy.phaseMs >= EMERALD_CHARGE_MS) {
        // Blink: store ghost at current position, teleport near player
        enemy.ghostX = enemy.x; enemy.ghostY = enemy.y; enemy.ghostAlpha = 1;
        const angle = Math.random() * Math.PI * 2;
        enemy.x = mote.x + Math.cos(angle) * EMERALD_BLINK_OFFSET;
        enemy.y = mote.y + Math.sin(angle) * EMERALD_BLINK_OFFSET;
        // Clamp to bounds after blink
        const half = EMERALD_ENEMY_SIZE / 2;
        enemy.x = Math.max(half, Math.min(dim.w - half, enemy.x));
        enemy.y = Math.max(half, Math.min(dim.h - half, enemy.y));
        enemy.phase = 'blinking'; enemy.phaseMs = 0;
        // Flash of fluid at both origin and destination
        fluid.addForce({
          x: enemy.ghostX, y: enemy.ghostY,
          vx: (mote.x - enemy.ghostX) * 0.02 * FLUID_VEL_FRAME_TO_PX_S,
          vy: (mote.y - enemy.ghostY) * 0.02 * FLUID_VEL_FRAME_TO_PX_S,
          r: FLUID_EMERALD_R, g: FLUID_EMERALD_G, b: FLUID_EMERALD_B,
          strength: 1.2,
        });
      }

    } else if (enemy.phase === 'blinking') {
      // One-frame blink — deliver contact damage then go to cooldown
      if (!enemy.hasHitPlayer) {
        enemy.hasHitPlayer = true;
        ctx.dealDamageToPlayer(enemy.atk);
      }
      enemy.phase = 'cooldown'; enemy.phaseMs = 0;

    } else if (enemy.phase === 'cooldown') {
      enemy.phaseMs += deltaMs;
      if (enemy.phaseMs >= EMERALD_COOLDOWN_MS) {
        enemy.phase = 'patrol'; enemy.phaseMs = 0;
        enemy.patrolTimerMs = EMERALD_PATROL_TURN_MS * Math.random();
      }
    }
  }
}

// ── Amber enemy system (fan-gunner) ───────────────────────────────────────────

function spawnAmberFanBurst(enemy: AmberEnemy, shards: AmberShard[], ctx: RpgEnemyCtx): void {
  const { mote, fluid } = ctx;
  const dx = mote.x - enemy.x, dy = mote.y - enemy.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const baseDirX = dist > 0.01 ? dx / dist : 0;
  const baseDirY = dist > 0.01 ? dy / dist : 1;
  const baseAngle = Math.atan2(baseDirY, baseDirX);
  for (let i = 0; i < AMBER_SHARD_COUNT; i++) {
    const spread = (i - (AMBER_SHARD_COUNT - 1) / 2) * AMBER_SHARD_SPREAD_RAD;
    const angle = baseAngle + spread;
    const vx = Math.cos(angle) * AMBER_SHARD_SPEED;
    const vy = Math.sin(angle) * AMBER_SHARD_SPEED;
    shards.push(makeAmberShard(enemy.x, enemy.y, vx, vy));
  }
  fluid.addForce({
    x: enemy.x, y: enemy.y,
    vx: baseDirX * FLUID_VEL_FRAME_TO_PX_S * 2.0,
    vy: baseDirY * FLUID_VEL_FRAME_TO_PX_S * 2.0,
    r: FLUID_AMBER_R, g: FLUID_AMBER_G, b: FLUID_AMBER_B,
    strength: FLUID_PROJECTILE_STRENGTH * 1.5,
  });
}

export function updateAmberEnemies(
  enemies: AmberEnemy[],
  shards: AmberShard[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { dim, fluid } = ctx;
  for (const enemy of enemies) {
    // Patrol
    enemy.patrolTimerMs -= deltaMs;
    if (enemy.patrolTimerMs <= 0) {
      const angle = Math.random() * Math.PI * 2;
      enemy.vx = Math.cos(angle) * AMBER_PATROL_SPEED;
      enemy.vy = Math.sin(angle) * AMBER_PATROL_SPEED;
      enemy.patrolTimerMs = AMBER_PATROL_TURN_MS * (0.5 + Math.random() * 0.8);
    }
    const dampFactor = Math.pow(AMBER_PATROL_DAMPING, dt);
    enemy.vx *= dampFactor; enemy.vy *= dampFactor;
    enemy.x  += enemy.vx * dt; enemy.y += enemy.vy * dt;
    const half = AMBER_ENEMY_SIZE / 2;
    if (enemy.x < half)         { enemy.x = half;         enemy.vx =  Math.abs(enemy.vx) * 0.5; }
    if (enemy.x > dim.w - half) { enemy.x = dim.w - half; enemy.vx = -Math.abs(enemy.vx) * 0.5; }
    if (enemy.y < half)         { enemy.y = half;          enemy.vy =  Math.abs(enemy.vy) * 0.5; }
    if (enemy.y > dim.h - half) { enemy.y = dim.h - half;  enemy.vy = -Math.abs(enemy.vy) * 0.5; }

    // Fluid from movement
    const espd = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
    if (espd > 0.04) {
      fluid.addForce({
        x: enemy.x, y: enemy.y,
        vx: enemy.vx * FLUID_VEL_FRAME_TO_PX_S,
        vy: enemy.vy * FLUID_VEL_FRAME_TO_PX_S,
        r: FLUID_AMBER_R, g: FLUID_AMBER_G, b: FLUID_AMBER_B,
        strength: FLUID_ENEMY_STRENGTH,
      });
    }

    // Fan-burst timer
    enemy.missileTimerMs -= deltaMs;
    if (enemy.missileTimerMs <= 0) {
      spawnAmberFanBurst(enemy, shards, ctx);
      enemy.missileTimerMs = AMBER_MISSILE_CD_MS + (Math.random() - 0.5) * AMBER_MISSILE_JITTER;
    }
  }
}

export function updateAmberShards(
  shards: AmberShard[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote, dim, fluid } = ctx;
  for (let i = shards.length - 1; i >= 0; i--) {
    const s = shards[i];
    if (s.hp <= 0) { shards.splice(i, 1); continue; }

    // Heat-seeking toward player
    const dx = mote.x - s.x, dy = mote.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.01) {
      s.vx += (dx / dist) * AMBER_SHARD_SEEK_STR;
      s.vy += (dy / dist) * AMBER_SHARD_SEEK_STR;
    }
    const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    if (speed > AMBER_SHARD_MAX_SPEED) {
      s.vx = (s.vx / speed) * AMBER_SHARD_MAX_SPEED;
      s.vy = (s.vy / speed) * AMBER_SHARD_MAX_SPEED;
    }
    s.x += s.vx * dt; s.y += s.vy * dt;

    // Fluid trail
    fluid.addForce({
      x: s.x, y: s.y,
      vx: s.vx * FLUID_VEL_FRAME_TO_PX_S,
      vy: s.vy * FLUID_VEL_FRAME_TO_PX_S,
      r: FLUID_AMBER_R, g: FLUID_AMBER_G, b: FLUID_AMBER_B,
      strength: FLUID_MISSILE_STRENGTH * 0.7,
    });

    // Trail recording
    s.trailX[s.trailHead] = s.x; s.trailY[s.trailHead] = s.y;
    s.trailHead = (s.trailHead + 1) % AMBER_SHARD_TRAIL_CAP;
    if (s.trailCount < AMBER_SHARD_TRAIL_CAP) s.trailCount++;

    // Player hit (with knockback)
    if (!s.hasHitPlayer) {
      const pdx = mote.x - s.x, pdy = mote.y - s.y;
      if (pdx * pdx + pdy * pdy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
        s.hasHitPlayer = true;
        const curSpeed = speed + SPEED_EPSILON;
        ctx.dealDamageToPlayerKnockback(s.atk, s.vx / curSpeed, s.vy / curSpeed);
        shards.splice(i, 1); continue;
      }
    }

    // Despawn if out of bounds
    const margin = 20;
    if (s.x < -margin || s.x > dim.w + margin || s.y < -margin || s.y > dim.h + margin) {
      shards.splice(i, 1);
    }
  }
}

// ── Void enemy system (slow bruiser) ──────────────────────────────────────────

export function updateVoidEnemies(
  enemies: VoidEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote, dim, fluid } = ctx;
  for (const enemy of enemies) {
    enemy.pulseMs = (enemy.pulseMs + deltaMs) % VOID_AURA_PULSE_MS;

    // Constant pursuit of player
    const dx = mote.x - enemy.x, dy = mote.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.01) {
      enemy.vx = (dx / dist) * VOID_PURSUE_SPEED;
      enemy.vy = (dy / dist) * VOID_PURSUE_SPEED;
    } else {
      enemy.vx = 0; enemy.vy = 0;
    }
    enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;

    // Clamp to bounds
    const half = VOID_ENEMY_SIZE / 2;
    if (enemy.x < half)         { enemy.x = half; }
    if (enemy.x > dim.w - half) { enemy.x = dim.w - half; }
    if (enemy.y < half)         { enemy.y = half; }
    if (enemy.y > dim.h - half) { enemy.y = dim.h - half; }

    // Fluid from movement
    const espd = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
    if (espd > 0.04) {
      fluid.addForce({
        x: enemy.x, y: enemy.y,
        vx: enemy.vx * FLUID_VEL_FRAME_TO_PX_S,
        vy: enemy.vy * FLUID_VEL_FRAME_TO_PX_S,
        r: FLUID_VOID_R, g: FLUID_VOID_G, b: FLUID_VOID_B,
        strength: FLUID_ENEMY_STRENGTH * 1.3,
      });
    }

    // Contact damage (with cooldown per tick)
    if (enemy.contactCdMs > 0) {
      enemy.contactCdMs = Math.max(0, enemy.contactCdMs - deltaMs);
    }
    if (enemy.contactCdMs <= 0) {
      const cdx = mote.x - enemy.x, cdy = mote.y - enemy.y;
      if (cdx * cdx + cdy * cdy < VOID_CONTACT_RADIUS * VOID_CONTACT_RADIUS) {
        ctx.dealDamageToPlayer(enemy.atk);
        enemy.contactCdMs = VOID_CONTACT_CD_MS;
      }
    }
  }
}

// ── Quartz enemy system ────────────────────────────────────────────────────────

export function updateQuartzEnemies(
  enemies: QuartzEnemy[],
  spikes: QuartzSpike[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote } = ctx;
  for (const enemy of enemies) {
    const dx = mote.x - enemy.x, dy = mote.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    if (dist > QUARTZ_PREFERRED_DIST + 20) {
      enemy.vx += (dx / dist) * QUARTZ_APPROACH_SPEED;
      enemy.vy += (dy / dist) * QUARTZ_APPROACH_SPEED;
    } else if (dist < QUARTZ_PREFERRED_DIST - 20) {
      enemy.vx -= (dx / dist) * QUARTZ_APPROACH_SPEED;
      enemy.vy -= (dy / dist) * QUARTZ_APPROACH_SPEED;
    } else {
      const perpX = -dy / dist, perpY = dx / dist;
      enemy.vx += perpX * QUARTZ_STRAFE_SPEED * enemy.strafeDir;
      enemy.vy += perpY * QUARTZ_STRAFE_SPEED * enemy.strafeDir;
    }
    const speed = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
    if (speed > 2.0) { enemy.vx = (enemy.vx / speed) * 2.0; enemy.vy = (enemy.vy / speed) * 2.0; }
    enemy.vx *= 0.85; enemy.vy *= 0.85;
    enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;
    ctx.clampEnemyToBounds(enemy);
    enemy.strafeDirFlipMs -= deltaMs;
    if (enemy.strafeDirFlipMs <= 0) {
      enemy.strafeDir = (enemy.strafeDir === 1 ? -1 : 1) as 1 | -1;
      enemy.strafeDirFlipMs = 2000 + Math.random() * 2000;
    }
    enemy.spikeTimerMs -= deltaMs;
    if (enemy.spikeTimerMs <= 0) {
      enemy.spikeTimerMs = QUARTZ_SPIKE_CD_MS + Math.random() * QUARTZ_SPIKE_JITTER;
      const sdx = mote.x - enemy.x, sdy = mote.y - enemy.y;
      const slen = Math.sqrt(sdx * sdx + sdy * sdy) || 1;
      spikes.push(makeQuartzSpike(enemy.x, enemy.y, (sdx / slen) * QUARTZ_SPIKE_SPEED, (sdy / slen) * QUARTZ_SPIKE_SPEED));
    }
  }
}

export function updateQuartzSpikes(
  spikes: QuartzSpike[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote, dim } = ctx;
  for (let i = spikes.length - 1; i >= 0; i--) {
    const s = spikes[i];
    s.x += s.vx * dt; s.y += s.vy * dt;
    s.lifeMs -= deltaMs;
    if (s.lifeMs <= 0 || s.x < 0 || s.x > dim.w || s.y < 0 || s.y > dim.h) {
      spikes.splice(i, 1); continue;
    }
    if (!s.hasHitPlayer) {
      const dx = s.x - mote.x, dy = s.y - mote.y;
      if (dx * dx + dy * dy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
        s.hasHitPlayer = true;
        ctx.dealDamageToPlayer(s.atk);
      }
    }
  }
}

// ── Ruby enemy system ──────────────────────────────────────────────────────────

export function updateRubyEnemies(
  enemies: RubyEnemy[],
  bolts: RubyBolt[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote } = ctx;
  for (const enemy of enemies) {
    enemy.patrolTimerMs -= deltaMs;
    if (enemy.patrolTimerMs <= 0) {
      const angle = Math.random() * Math.PI * 2;
      enemy.vx = Math.cos(angle) * RUBY_PATROL_SPEED;
      enemy.vy = Math.sin(angle) * RUBY_PATROL_SPEED;
      enemy.patrolTimerMs = 800 + Math.random() * 1200;
    }
    const dx = mote.x - enemy.x, dy = mote.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    if (dist > RUBY_PREFERRED_DIST) {
      enemy.vx = (dx / dist) * RUBY_PATROL_SPEED;
      enemy.vy = (dy / dist) * RUBY_PATROL_SPEED;
    }
    enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;
    ctx.clampEnemyToBounds(enemy);
    enemy.boltTimerMs -= deltaMs;
    if (enemy.boltTimerMs <= 0) {
      enemy.boltTimerMs = RUBY_BOLT_CD_MS + Math.random() * RUBY_BOLT_JITTER;
      const bdx = mote.x - enemy.x, bdy = mote.y - enemy.y;
      const blen = Math.sqrt(bdx * bdx + bdy * bdy) || 1;
      enemy.consecutiveShots++;
      const burstCount = enemy.consecutiveShots >= 3 ? 3 : 2;
      if (enemy.consecutiveShots >= 3) enemy.consecutiveShots = 0;
      for (let b = 0; b < burstCount; b++) {
        const spread = (b - (burstCount - 1) / 2) * 0.15;
        const cos = Math.cos(spread), sin = Math.sin(spread);
        const bvx = ((bdx / blen) * cos - (bdy / blen) * sin) * RUBY_BOLT_SPEED;
        const bvy = ((bdx / blen) * sin + (bdy / blen) * cos) * RUBY_BOLT_SPEED;
        bolts.push(makeRubyBolt(enemy.x, enemy.y, bvx, bvy));
      }
    }
  }
}

export function updateRubyBolts(
  bolts: RubyBolt[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote, dim } = ctx;
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.lifeMs -= deltaMs;
    if (b.lifeMs <= 0 || b.x < 0 || b.x > dim.w || b.y < 0 || b.y > dim.h) {
      bolts.splice(i, 1); continue;
    }
    if (!b.hasHitPlayer) {
      const dx = b.x - mote.x, dy = b.y - mote.y;
      if (dx * dx + dy * dy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
        b.hasHitPlayer = true;
        ctx.dealDamageToPlayer(b.atk);
      }
    }
  }
}

// ── Sunstone enemy system ──────────────────────────────────────────────────────

export function updateSunstoneEnemies(
  enemies: SunstoneEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const { mote, dim } = ctx;
  for (const enemy of enemies) {
    enemy.orbitAngle += SUNSTONE_ORBIT_SPEED * (deltaMs / 1000);
    enemy.x = mote.x + Math.cos(enemy.orbitAngle) * SUNSTONE_PREFERRED_DIST;
    enemy.y = mote.y + Math.sin(enemy.orbitAngle) * SUNSTONE_PREFERRED_DIST;
    const half = SUNSTONE_ENEMY_SIZE / 2;
    enemy.x = Math.max(half, Math.min(dim.w - half, enemy.x));
    enemy.y = Math.max(half, Math.min(dim.h - half, enemy.y));
    enemy.pulseTimerMs -= deltaMs;
    if (enemy.pulseTimerMs <= 0) {
      enemy.pulseTimerMs = SUNSTONE_PULSE_CD_MS + Math.random() * SUNSTONE_PULSE_JITTER;
      const dx = mote.x - enemy.x, dy = mote.y - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= SUNSTONE_PREFERRED_DIST + 20) {
        ctx.dealDamageToPlayer(enemy.atk);
        ctx.hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: SUNSTONE_ENEMY_GLOW });
      }
    }
  }
}

// ── Citrine enemy system ───────────────────────────────────────────────────────

export function updateCitrineEnemies(
  enemies: CitrineEnemy[],
  bolts: CitrineBolt[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote } = ctx;
  for (const enemy of enemies) {
    enemy.patrolTimerMs -= deltaMs;
    if (enemy.patrolTimerMs <= 0) {
      enemy.patrolTimerMs = CITRINE_PATROL_TURN_MS * (0.5 + Math.random());
      const angle = Math.random() * Math.PI * 2;
      enemy.vx = Math.cos(angle) * CITRINE_PATROL_SPEED;
      enemy.vy = Math.sin(angle) * CITRINE_PATROL_SPEED;
    }
    enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;
    ctx.clampEnemyToBounds(enemy);
    enemy.boltTimerMs -= deltaMs;
    if (enemy.boltTimerMs <= 0) {
      enemy.boltTimerMs = CITRINE_BOLT_CD_MS + Math.random() * CITRINE_BOLT_JITTER;
      const bdx = mote.x - enemy.x, bdy = mote.y - enemy.y;
      const blen = Math.sqrt(bdx * bdx + bdy * bdy) || 1;
      bolts.push(makeCitrineBolt(enemy.x, enemy.y, (bdx / blen) * CITRINE_BOLT_SPEED, (bdy / blen) * CITRINE_BOLT_SPEED));
    }
  }
}

export function updateCitrineBolts(
  bolts: CitrineBolt[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote, dim } = ctx;
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    // Homing seek toward player
    const dx = mote.x - b.x, dy = mote.y - b.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    b.vx += (dx / dist) * CITRINE_BOLT_SEEK;
    b.vy += (dy / dist) * CITRINE_BOLT_SEEK;
    const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (speed > CITRINE_BOLT_MAX_SPEED) { b.vx = (b.vx / speed) * CITRINE_BOLT_MAX_SPEED; b.vy = (b.vy / speed) * CITRINE_BOLT_MAX_SPEED; }
    // Trail recording
    b.trailX[b.trailHead] = b.x; b.trailY[b.trailHead] = b.y;
    b.trailHead = (b.trailHead + 1) % CITRINE_BOLT_TRAIL_CAP;
    if (b.trailCount < CITRINE_BOLT_TRAIL_CAP) b.trailCount++;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < 0 || b.x > dim.w || b.y < 0 || b.y > dim.h) {
      bolts.splice(i, 1); continue;
    }
    if (!b.hasHitPlayer) {
      const pdx = b.x - mote.x, pdy = b.y - mote.y;
      if (pdx * pdx + pdy * pdy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
        b.hasHitPlayer = true;
        ctx.dealDamageToPlayer(b.atk);
      }
    }
  }
}

// ── Iolite enemy system ────────────────────────────────────────────────────────

export function updateIoliteEnemies(
  enemies: IoliteEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote } = ctx;
  for (const enemy of enemies) {
    enemy.patrolTimerMs -= deltaMs;
    if (enemy.patrolTimerMs <= 0) {
      enemy.patrolTimerMs = IOLITE_PATROL_TURN_MS * (0.5 + Math.random());
      const angle = Math.random() * Math.PI * 2;
      enemy.vx = Math.cos(angle) * IOLITE_PATROL_SPEED;
      enemy.vy = Math.sin(angle) * IOLITE_PATROL_SPEED;
    }
    enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;
    ctx.clampEnemyToBounds(enemy);
    enemy.beamTimerMs -= deltaMs;
    if (enemy.beamTimerMs <= 0) {
      enemy.beamTimerMs = IOLITE_BEAM_CD_MS + Math.random() * IOLITE_BEAM_JITTER;
      const bdx = mote.x - enemy.x, bdy = mote.y - enemy.y;
      const baseAngle = Math.atan2(bdy, bdx);
      for (let b = 0; b < IOLITE_BEAM_COUNT; b++) {
        const spreadAngle = baseAngle + (b - Math.floor(IOLITE_BEAM_COUNT / 2)) * (IOLITE_BEAM_SPREAD_RAD / (IOLITE_BEAM_COUNT - 1));
        const bdirX = Math.cos(spreadAngle), bdirY = Math.sin(spreadAngle);
        const pdx2 = mote.x - enemy.x, pdy2 = mote.y - enemy.y;
        const tProj = pdx2 * bdirX + pdy2 * bdirY;
        if (tProj >= 0 && tProj <= IOLITE_BEAM_RANGE) {
          const perpDist = Math.abs(pdx2 * bdirY - pdy2 * bdirX);
          if (perpDist <= PLAYER_HIT_RADIUS) {
            ctx.dealDamageToPlayer(enemy.atk);
          }
        }
        ctx.shotLines.push({ x1: enemy.x, y1: enemy.y, x2: enemy.x + bdirX * IOLITE_BEAM_RANGE, y2: enemy.y + bdirY * IOLITE_BEAM_RANGE, timerMs: 200, color: IOLITE_ENEMY_GLOW });
      }
    }
  }
}

// ── Amethyst enemy system ──────────────────────────────────────────────────────

export function updateAmethystEnemies(
  enemies: AmethystEnemy[],
  shards: AmethystShard[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const enemy of enemies) {
    enemy.patrolTimerMs -= deltaMs;
    if (enemy.patrolTimerMs <= 0) {
      enemy.patrolTimerMs = AMETHYST_PATROL_TURN_MS * (0.5 + Math.random());
      const angle = Math.random() * Math.PI * 2;
      enemy.vx = Math.cos(angle) * AMETHYST_PATROL_SPEED;
      enemy.vy = Math.sin(angle) * AMETHYST_PATROL_SPEED;
    }
    enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;
    ctx.clampEnemyToBounds(enemy);
    enemy.burstTimerMs -= deltaMs;
    if (enemy.burstTimerMs <= 0) {
      enemy.burstTimerMs = AMETHYST_BURST_CD_MS + Math.random() * AMETHYST_BURST_JITTER;
      for (let b = 0; b < AMETHYST_BURST_COUNT; b++) {
        const angle = (b / AMETHYST_BURST_COUNT) * Math.PI * 2;
        shards.push(makeAmethystShard(enemy.x, enemy.y, Math.cos(angle) * AMETHYST_SHARD_SPEED, Math.sin(angle) * AMETHYST_SHARD_SPEED));
      }
    }
  }
}

export function updateAmethystShards(
  shards: AmethystShard[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote, dim } = ctx;
  for (let i = shards.length - 1; i >= 0; i--) {
    const s = shards[i];
    s.x += s.vx * dt; s.y += s.vy * dt;
    s.lifeMs -= deltaMs;
    if (s.lifeMs <= 0 || s.x < 0 || s.x > dim.w || s.y < 0 || s.y > dim.h) {
      shards.splice(i, 1); continue;
    }
    if (!s.hasHitPlayer) {
      const dx = s.x - mote.x, dy = s.y - mote.y;
      if (dx * dx + dy * dy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
        s.hasHitPlayer = true;
        ctx.dealDamageToPlayer(s.atk);
      }
    }
  }
}

// ── Diamond enemy system ───────────────────────────────────────────────────────

export function updateDiamondEnemies(
  enemies: DiamondEnemy[],
  shards: DiamondShard[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote, dim } = ctx;
  for (const enemy of enemies) {
    enemy.phaseTimerMs -= deltaMs;
    if (enemy.phaseTimerMs <= 0) {
      if (enemy.phaseInvuln) {
        enemy.phaseInvuln = false;
        enemy.phaseTimerMs = DIAMOND_PHASE_VULN_MS;
      } else {
        enemy.phaseInvuln = true;
        enemy.phaseTimerMs = DIAMOND_PHASE_INVULN_MS;
      }
    }
    if (enemy.phaseInvuln) {
      enemy.orbitAngle += DIAMOND_ORBIT_SPEED * (deltaMs / 1000);
      enemy.x = mote.x + Math.cos(enemy.orbitAngle) * 80;
      enemy.y = mote.y + Math.sin(enemy.orbitAngle) * 80;
      const half = DIAMOND_ENEMY_SIZE / 2;
      enemy.x = Math.max(half, Math.min(dim.w - half, enemy.x));
      enemy.y = Math.max(half, Math.min(dim.h - half, enemy.y));
    } else {
      const dx = mote.x - enemy.x, dy = mote.y - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      enemy.vx = (dx / dist) * DIAMOND_PATROL_SPEED;
      enemy.vy = (dy / dist) * DIAMOND_PATROL_SPEED;
      enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;
      ctx.clampEnemyToBounds(enemy);
      enemy.shardTimerMs -= deltaMs;
      if (enemy.shardTimerMs <= 0) {
        enemy.shardTimerMs = DIAMOND_SHARD_CD_MS + Math.random() * 500;
        for (let b = 0; b < DIAMOND_SHARD_COUNT; b++) {
          const angle = (b / DIAMOND_SHARD_COUNT) * Math.PI * 2;
          shards.push(makeDiamondShard(enemy.x, enemy.y, Math.cos(angle) * DIAMOND_SHARD_SPEED, Math.sin(angle) * DIAMOND_SHARD_SPEED));
        }
      }
    }
  }
}

export function updateDiamondShards(
  shards: DiamondShard[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote, dim } = ctx;
  for (let i = shards.length - 1; i >= 0; i--) {
    const s = shards[i];
    s.x += s.vx * dt; s.y += s.vy * dt;
    s.lifeMs -= deltaMs;
    if (s.lifeMs <= 0 || s.x < 0 || s.x > dim.w || s.y < 0 || s.y > dim.h) {
      shards.splice(i, 1); continue;
    }
    if (!s.hasHitPlayer) {
      const dx = s.x - mote.x, dy = s.y - mote.y;
      if (dx * dx + dy * dy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
        s.hasHitPlayer = true;
        ctx.dealDamageToPlayer(s.atk);
      }
    }
  }
}

// ── Nullstone enemy system ─────────────────────────────────────────────────────

export function updateNullstoneEnemies(
  enemies: NullstoneEnemy[],
  tendrils: VoidTendril[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote } = ctx;
  for (const enemy of enemies) {
    enemy.pulseMs += deltaMs;
    // Gravity pull on player
    const gdx = enemy.x - mote.x, gdy = enemy.y - mote.y;
    const gdist = Math.sqrt(gdx * gdx + gdy * gdy);
    if (gdist > 0 && gdist < NULLSTONE_GRAVITY_RADIUS) {
      mote.vx += (gdx / gdist) * NULLSTONE_GRAVITY_STRENGTH * gdist * dt;
      mote.vy += (gdy / gdist) * NULLSTONE_GRAVITY_STRENGTH * gdist * dt;
    }
    // Absorb / immunity cycling
    if (enemy.isAbsorbing) {
      enemy.absorbTimerMs -= deltaMs;
      if (enemy.absorbTimerMs <= 0) { enemy.isAbsorbing = false; enemy.absorbCdMs = NULLSTONE_ABSORB_CD_MS; }
    } else {
      enemy.absorbCdMs -= deltaMs;
      if (enemy.absorbCdMs <= 0) { enemy.isAbsorbing = true; enemy.absorbTimerMs = NULLSTONE_ABSORB_MS; }
    }
    // Patrol
    enemy.patrolTimerMs -= deltaMs;
    if (enemy.patrolTimerMs <= 0) {
      enemy.patrolTimerMs = NULLSTONE_PATROL_TURN_MS * (0.5 + Math.random());
      const angle = Math.random() * Math.PI * 2;
      enemy.vx = Math.cos(angle) * NULLSTONE_PATROL_SPEED;
      enemy.vy = Math.sin(angle) * NULLSTONE_PATROL_SPEED;
    }
    enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;
    ctx.clampEnemyToBounds(enemy);
    // Tendril attack
    enemy.tendrilTimerMs -= deltaMs;
    if (enemy.tendrilTimerMs <= 0) {
      enemy.tendrilTimerMs = NULLSTONE_TENDRIL_CD_MS + Math.random() * 1000;
      const tdx = mote.x - enemy.x, tdy = mote.y - enemy.y;
      const tlen = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
      for (let t = 0; t < NULLSTONE_TENDRIL_COUNT; t++) {
        const spread = (t - Math.floor(NULLSTONE_TENDRIL_COUNT / 2)) * 0.4;
        const cos = Math.cos(spread), sin = Math.sin(spread);
        const tvx = ((tdx / tlen) * cos - (tdy / tlen) * sin) * VOID_TENDRIL_SPEED;
        const tvy = ((tdx / tlen) * sin + (tdy / tlen) * cos) * VOID_TENDRIL_SPEED;
        tendrils.push(makeVoidTendril(enemy.x, enemy.y, tvx, tvy));
      }
    }
  }
}

export function updateVoidTendrils(
  tendrils: VoidTendril[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote, dim } = ctx;
  for (let i = tendrils.length - 1; i >= 0; i--) {
    const t = tendrils[i];
    t.x += t.vx * dt; t.y += t.vy * dt;
    t.lifeMs -= deltaMs;
    if (t.lifeMs <= 0 || t.x < 0 || t.x > dim.w || t.y < 0 || t.y > dim.h) {
      tendrils.splice(i, 1); continue;
    }
    if (!t.hasHitPlayer) {
      const dx = t.x - mote.x, dy = t.y - mote.y;
      if (dx * dx + dy * dy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
        t.hasHitPlayer = true;
        ctx.dealDamageToPlayer(t.atk);
      }
    }
  }
}

// ── Fracteryl enemy system ─────────────────────────────────────────────────────

export function updateFracterylEnemies(
  enemies: FracterylEnemy[],
  shards: FracterylShard[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote, dim, fluid } = ctx;
  for (const enemy of enemies) {
    enemy.pulseMs = (enemy.pulseMs + deltaMs) % 3000;
    if (enemy.patrolTimerMs > 0) {
      enemy.patrolTimerMs = Math.max(0, enemy.patrolTimerMs - deltaMs);
    } else {
      enemy.patrolTimerMs = FRACTERYL_PATROL_TURN_MS + Math.random() * FRACTERYL_BURST_JITTER;
      enemy.orbitAngle = Math.random() * Math.PI * 2;
    }
    enemy.vx += Math.cos(enemy.orbitAngle) * 0.15;
    enemy.vy += Math.sin(enemy.orbitAngle) * 0.15;
    enemy.vx *= 0.92; enemy.vy *= 0.92;
    enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;
    const half = FRACTERYL_ENEMY_SIZE / 2;
    if (enemy.x < half)         { enemy.x = half;         enemy.vx = Math.abs(enemy.vx) * 0.5; }
    if (enemy.x > dim.w - half) { enemy.x = dim.w - half;  enemy.vx = -Math.abs(enemy.vx) * 0.5; }
    if (enemy.y < half)         { enemy.y = half;           enemy.vy = Math.abs(enemy.vy) * 0.5; }
    if (enemy.y > dim.h - half) { enemy.y = dim.h - half;   enemy.vy = -Math.abs(enemy.vy) * 0.5; }

    enemy.burstTimerMs -= deltaMs;
    if (enemy.burstTimerMs <= 0) {
      enemy.burstTimerMs = FRACTERYL_BURST_CD_MS + Math.random() * FRACTERYL_BURST_JITTER;
      const shardCount = 6;
      const speed = 1.5;
      for (let i = 0; i < shardCount; i++) {
        const angle = (i / shardCount) * Math.PI * 2;
        shards.push(makeFracterylShard(
          enemy.x, enemy.y,
          Math.cos(angle) * speed, Math.sin(angle) * speed,
          0,
        ));
      }
      fluid.addForce({ x: enemy.x, y: enemy.y,
        vx: 0, vy: 0,
        r: FLUID_FRACTERYL_R, g: FLUID_FRACTERYL_G, b: FLUID_FRACTERYL_B,
        strength: 1.2 });
    }
  }
  for (let i = shards.length - 1; i >= 0; i--) {
    const shard = shards[i];
    shard.lifeMs -= deltaMs;
    if (shard.lifeMs <= 0) { shards.splice(i, 1); continue; }
    shard.x += shard.vx * dt; shard.y += shard.vy * dt;
    if (!shard.hasHitPlayer) {
      const sdx = mote.x - shard.x, sdy = mote.y - shard.y;
      if (sdx * sdx + sdy * sdy < (FRACTERYL_ENEMY_SIZE / 2 + PLAYER_HIT_RADIUS) ** 2) {
        ctx.dealDamageToPlayer(shard.atk);
        shard.hasHitPlayer = true;
        shards.splice(i, 1);
      }
    }
  }
}

// ── Eigenstein enemy system ────────────────────────────────────────────────────

export function updateEigensteinEnemies(
  enemies: EigensteinEnemy[],
  beams: EigensteinBeam[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote, dim, fluid } = ctx;
  for (const enemy of enemies) {
    enemy.pulseMs = (enemy.pulseMs + deltaMs) % 3000;
    if (enemy.patrolTimerMs > 0) {
      enemy.patrolTimerMs = Math.max(0, enemy.patrolTimerMs - deltaMs);
    } else {
      enemy.patrolTimerMs = EIGENSTEIN_PATROL_TURN_MS + Math.random() * EIGENSTEIN_BEAM_JITTER;
      enemy.beamAngle = Math.random() * Math.PI * 2;
    }
    enemy.vx += Math.cos(enemy.beamAngle) * 0.12;
    enemy.vy += Math.sin(enemy.beamAngle) * 0.12;
    enemy.vx *= 0.91; enemy.vy *= 0.91;
    enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;
    const half = EIGENSTEIN_ENEMY_SIZE / 2;
    if (enemy.x < half)         { enemy.x = half;          enemy.vx = Math.abs(enemy.vx) * 0.5; }
    if (enemy.x > dim.w - half) { enemy.x = dim.w - half;  enemy.vx = -Math.abs(enemy.vx) * 0.5; }
    if (enemy.y < half)         { enemy.y = half;           enemy.vy = Math.abs(enemy.vy) * 0.5; }
    if (enemy.y > dim.h - half) { enemy.y = dim.h - half;   enemy.vy = -Math.abs(enemy.vy) * 0.5; }

    enemy.beamTimerMs -= deltaMs;
    if (enemy.beamTimerMs <= 0) {
      enemy.beamTimerMs = EIGENSTEIN_BEAM_CD_MS + Math.random() * EIGENSTEIN_BEAM_JITTER;
      const aimAngle = Math.atan2(mote.y - enemy.y, mote.x - enemy.x);
      const totalMs = EIGENSTEIN_BEAM_CHARGE_MS + EIGENSTEIN_BEAM_FIRE_MS;
      beams.push({
        originX: enemy.x, originY: enemy.y,
        angle: aimAngle,
        atk: enemy.atk,
        isActive: false,
        timerMs: EIGENSTEIN_BEAM_CHARGE_MS,
        maxTimerMs: totalMs,
      });
      fluid.addForce({ x: enemy.x, y: enemy.y,
        vx: 0, vy: 0,
        r: FLUID_EIGENSTEIN_R, g: FLUID_EIGENSTEIN_G, b: FLUID_EIGENSTEIN_B,
        strength: 1.5 });
    }
  }
}

export function updateEigensteinBeams(
  beams: EigensteinBeam[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const { mote, dim } = ctx;
  const beamLen = Math.sqrt(dim.w * dim.w + dim.h * dim.h);
  for (let i = beams.length - 1; i >= 0; i--) {
    const beam = beams[i];
    beam.timerMs -= deltaMs;
    if (!beam.isActive && beam.timerMs <= 0) {
      beam.isActive = true;
      beam.timerMs = EIGENSTEIN_BEAM_FIRE_MS;
    }
    if (beam.isActive) {
      if (beam.timerMs <= 0) { beams.splice(i, 1); continue; }
      const dx = mote.x - beam.originX, dy = mote.y - beam.originY;
      const proj = dx * Math.cos(beam.angle) + dy * Math.sin(beam.angle);
      if (proj > 0 && proj < beamLen) {
        const perp = Math.abs(-dx * Math.sin(beam.angle) + dy * Math.cos(beam.angle));
        if (perp < PLAYER_HIT_RADIUS + 3) {
          ctx.dealDamageToPlayer(beam.atk * (deltaMs / 1000) * 60);
        }
      }
    }
  }
}

// ── Teleport particles (visual helper) ────────────────────────────────────────

/** Updates comet-trail teleport particles spawned by the emerald blink effect. */
export function updateTeleportParticles(
  particles: TeleportParticle[],
  deltaMs: number,
): void {
  if (particles.length === 0) return;
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.90; p.vy *= 0.90;
    p.alpha -= deltaMs / 350;
    if (p.alpha <= 0) particles.splice(i, 1);
  }
}
