/**
 * rpg-enemy-updates-adv-late.ts — Per-frame update logic for late-tier enemy types.
 *
 * Sections:
 *   - Fracteryl  — fractal shard bursts
 *   - Eigenstein — charge-up beam
 *   - Teleport particles — visual helper, shared across systems
 *
 * Early-tier enemies (Iolite, Amethyst, Diamond, Nullstone) are in
 * rpg-enemy-updates-adv-early.ts.  rpg-enemy-updates-adv.ts is the re-export barrel.
 */

import type {
  FracterylEnemy, FracterylShard,
  EigensteinEnemy, EigensteinBeam,
  TeleportParticle,
} from './rpg-enemy-types';
import {
  TARGET_FRAME_MS, PLAYER_HIT_RADIUS,
  FLUID_FRACTERYL_R, FLUID_FRACTERYL_G, FLUID_FRACTERYL_B,
  FLUID_EIGENSTEIN_R, FLUID_EIGENSTEIN_G, FLUID_EIGENSTEIN_B,
} from './rpg-constants';
import {
  FRACTERYL_PATROL_TURN_MS, FRACTERYL_BURST_CD_MS, FRACTERYL_BURST_JITTER,
  FRACTERYL_ENEMY_SIZE,
  EIGENSTEIN_PATROL_TURN_MS, EIGENSTEIN_BEAM_CD_MS, EIGENSTEIN_BEAM_JITTER,
  EIGENSTEIN_BEAM_CHARGE_MS, EIGENSTEIN_BEAM_FIRE_MS, EIGENSTEIN_ENEMY_SIZE,
} from './rpg-enemy-constants';
import {
  makeFracterylShard,
} from './rpg-factories';
import type { RpgEnemyCtx } from './rpg-enemy-updates';
import { applyEnemyTerrainPushOut } from './rpg-enemy-updates';
import { segmentIntersectsTopographicTerrain } from './terrain/topographic-terrain';

// ── Fracteryl enemy system ─────────────────────────────────────────────────────

export function updateFracterylEnemies(
  enemies: FracterylEnemy[],
  shards: FracterylShard[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote, dim, fluid } = ctx;
  const terrain = ctx.getTerrainState();
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
    if (enemy.x < half)         { enemy.x = half;          enemy.vx = Math.abs(enemy.vx) * 0.5; }
    if (enemy.x > dim.w - half) { enemy.x = dim.w - half;  enemy.vx = -Math.abs(enemy.vx) * 0.5; }
    if (enemy.y < half)         { enemy.y = half;           enemy.vy = Math.abs(enemy.vy) * 0.5; }
    if (enemy.y > dim.h - half) { enemy.y = dim.h - half;   enemy.vy = -Math.abs(enemy.vy) * 0.5; }
    applyEnemyTerrainPushOut(enemy, terrain, half);

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
    const prevX = shard.x, prevY = shard.y;
    shard.x += shard.vx * dt; shard.y += shard.vy * dt;
    if (terrain && segmentIntersectsTopographicTerrain(terrain, prevX, prevY, shard.x, shard.y)) {
      shards.splice(i, 1); continue;
    }
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
  const terrain = ctx.getTerrainState();
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
    applyEnemyTerrainPushOut(enemy, terrain, half);

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
