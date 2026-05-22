/**
 * rpg-enemy-updates-mid.ts — Per-frame update logic for mid-wave enemy types.
 *
 * Contains the wave 20-35 enemy systems, extracted from rpg-enemy-updates.ts
 * to keep both files under ~400 lines.
 *
 * All functions follow the same RpgEnemyCtx contract as rpg-enemy-updates.ts.
 *
 * Sections (in wave-unlock order):
 *   - Quartz  (wave 20) — strafe-orbiter + crystal spikes
 *   - Ruby    (wave 25) — fast patrol + burst bolts
 *   - Sunstone (wave 30) — orbit + pulse damage
 *   - Citrine  (wave 35) — homing bolts
 */

import type {
  QuartzEnemy, QuartzSpike,
  RubyEnemy, RubyBolt,
  SunstoneEnemy,
  CitrineEnemy, CitrineBolt,
} from './rpg-enemy-types';
import {
  TARGET_FRAME_MS,
  HIT_EFFECT_DURATION_MS, PLAYER_HIT_RADIUS,
} from './rpg-constants';
import {
  QUARTZ_PREFERRED_DIST, QUARTZ_APPROACH_SPEED, QUARTZ_STRAFE_SPEED,
  QUARTZ_SPIKE_CD_MS, QUARTZ_SPIKE_JITTER, QUARTZ_SPIKE_SPEED,
  QUARTZ_ENEMY_SIZE,
  RUBY_PATROL_SPEED, RUBY_BOLT_CD_MS, RUBY_BOLT_JITTER, RUBY_PREFERRED_DIST, RUBY_BOLT_SPEED,
  RUBY_ENEMY_SIZE,
  SUNSTONE_ORBIT_SPEED, SUNSTONE_PREFERRED_DIST, SUNSTONE_PULSE_CD_MS, SUNSTONE_PULSE_JITTER,
  SUNSTONE_ENEMY_SIZE, SUNSTONE_ENEMY_GLOW,
  CITRINE_PATROL_SPEED, CITRINE_PATROL_TURN_MS,
  CITRINE_ENEMY_SIZE,
  CITRINE_BOLT_CD_MS, CITRINE_BOLT_JITTER, CITRINE_BOLT_SPEED,
  CITRINE_BOLT_MAX_SPEED, CITRINE_BOLT_SEEK, CITRINE_BOLT_TRAIL_CAP,
} from './rpg-enemy-constants';
import {
  makeQuartzSpike,
  makeRubyBolt,
  makeCitrineBolt,
} from './rpg-factories';
import type { RpgEnemyCtx } from './rpg-enemy-updates';
import { applyEnemyTerrainPushOut } from './rpg-enemy-updates';
import { segmentIntersectsTopographicTerrain } from './terrain/topographic-terrain';

// ── Quartz enemy system ────────────────────────────────────────────────────────

export function updateQuartzEnemies(
  enemies: QuartzEnemy[],
  spikes: QuartzSpike[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote } = ctx;
  const terrain = ctx.getTerrainState();
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
    applyEnemyTerrainPushOut(enemy, terrain, QUARTZ_ENEMY_SIZE / 2);
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
  const terrain = ctx.getTerrainState();
  for (let i = spikes.length - 1; i >= 0; i--) {
    const s = spikes[i];
    const prevX = s.x, prevY = s.y;
    s.x += s.vx * dt; s.y += s.vy * dt;
    s.lifeMs -= deltaMs;
    if (s.lifeMs <= 0 || s.x < 0 || s.x > dim.w || s.y < 0 || s.y > dim.h
        || (terrain && segmentIntersectsTopographicTerrain(terrain, prevX, prevY, s.x, s.y))) {
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
  const terrain = ctx.getTerrainState();
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
    applyEnemyTerrainPushOut(enemy, terrain, RUBY_ENEMY_SIZE / 2);
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
  const terrain = ctx.getTerrainState();
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    const prevX = b.x, prevY = b.y;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.lifeMs -= deltaMs;
    if (b.lifeMs <= 0 || b.x < 0 || b.x > dim.w || b.y < 0 || b.y > dim.h
        || (terrain && segmentIntersectsTopographicTerrain(terrain, prevX, prevY, b.x, b.y))) {
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
  const terrain = ctx.getTerrainState();
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
    applyEnemyTerrainPushOut(enemy, terrain, CITRINE_ENEMY_SIZE / 2);
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
  const terrain = ctx.getTerrainState();
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
    const prevX = b.x, prevY = b.y;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < 0 || b.x > dim.w || b.y < 0 || b.y > dim.h
        || (terrain && segmentIntersectsTopographicTerrain(terrain, prevX, prevY, b.x, b.y))) {
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
