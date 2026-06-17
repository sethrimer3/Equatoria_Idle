/**
 * rpg-enemy-updates-adv-early.ts — Per-frame update logic for wave 40–70 enemy types.
 *
 * Sections (in wave-unlock order):
 *   - Iolite    (wave 40) — fan beams
 *   - Amethyst  (wave 50) — shield + ring burst
 *   - Diamond   (wave 60) — phase invuln + prismatic shards
 *   - Nullstone (wave 70) — gravity + void tendrils
 *
 * Late-tier enemies (Fracteryl, Eigenstein, Teleport particles) are in
 * rpg-enemy-updates-adv-late.ts.  rpg-enemy-updates-adv.ts is the re-export barrel.
 */

import type {
  IoliteEnemy,
  AmethystEnemy, AmethystShard,
  DiamondEnemy, DiamondShard,
  NullstoneEnemy, VoidTendril,
} from './rpg-enemy-types';
import {
  TARGET_FRAME_MS, PLAYER_HIT_RADIUS,
} from './rpg-constants';
import {
  IOLITE_PATROL_SPEED, IOLITE_PATROL_TURN_MS,
  IOLITE_ENEMY_SIZE,
  IOLITE_BEAM_CD_MS, IOLITE_BEAM_JITTER, IOLITE_BEAM_RANGE,
  IOLITE_BEAM_COUNT, IOLITE_BEAM_SPREAD_RAD, IOLITE_ENEMY_GLOW,
  AMETHYST_PATROL_SPEED, AMETHYST_PATROL_TURN_MS,
  AMETHYST_ENEMY_SIZE,
  AMETHYST_BURST_CD_MS, AMETHYST_BURST_JITTER, AMETHYST_BURST_COUNT,
  AMETHYST_SHARD_SPEED,
  DIAMOND_PATROL_SPEED, DIAMOND_ORBIT_SPEED,
  DIAMOND_PHASE_INVULN_MS, DIAMOND_PHASE_VULN_MS,
  DIAMOND_SHARD_CD_MS, DIAMOND_SHARD_COUNT, DIAMOND_SHARD_SPEED, DIAMOND_ENEMY_SIZE,
  NULLSTONE_GRAVITY_STRENGTH, NULLSTONE_GRAVITY_RADIUS,
  NULLSTONE_ABSORB_MS, NULLSTONE_ABSORB_CD_MS,
  NULLSTONE_PATROL_SPEED, NULLSTONE_PATROL_TURN_MS,
  NULLSTONE_ENEMY_SIZE,
  NULLSTONE_TENDRIL_CD_MS, NULLSTONE_TENDRIL_COUNT, VOID_TENDRIL_SPEED,
} from './rpg-enemy-constants';
import {
  makeAmethystShard,
  makeDiamondShard,
  makeVoidTendril,
} from './rpg-factories';
import type { RpgEnemyCtx } from './rpg-enemy-updates';
import { segmentIntersectsTopographicTerrain } from './terrain/topographic-terrain';
import { actorMoveX, actorMoveY, buildActorSolidCtx, type ActorSolidCtx } from './rpg-actor-collision';

// ── Iolite enemy system (wave 40) ─────────────────────────────────────────────

export function updateIoliteEnemies(
  enemies: IoliteEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote } = ctx;
  const terrain = ctx.getTerrainState();
  const wallState = ctx.getVerdureCaveWallState?.() ?? null;
  const _solidCtx: ActorSolidCtx = buildActorSolidCtx(ctx.viewport, terrain, wallState);
  for (const enemy of enemies) {
    enemy.patrolTimerMs -= deltaMs;
    if (enemy.patrolTimerMs <= 0) {
      enemy.patrolTimerMs = IOLITE_PATROL_TURN_MS * (0.5 + Math.random());
      const angle = Math.random() * Math.PI * 2;
      enemy.vx = Math.cos(angle) * IOLITE_PATROL_SPEED;
      enemy.vy = Math.sin(angle) * IOLITE_PATROL_SPEED;
    }
    const half = IOLITE_ENEMY_SIZE / 2;
    actorMoveX(enemy, half, half, enemy.vx * dt, _solidCtx, () => { enemy.vx = 0; });
    actorMoveY(enemy, half, half, enemy.vy * dt, _solidCtx, () => { enemy.vy = 0; });
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
            ctx.applyPlayerStatusFromSource?.('iolite');
          }
        }
        ctx.shotLines.push({ x1: enemy.x, y1: enemy.y, x2: enemy.x + bdirX * IOLITE_BEAM_RANGE, y2: enemy.y + bdirY * IOLITE_BEAM_RANGE, timerMs: 200, color: IOLITE_ENEMY_GLOW });
      }
    }
  }
}

// ── Amethyst enemy system (wave 50) ───────────────────────────────────────────

export function updateAmethystEnemies(
  enemies: AmethystEnemy[],
  shards: AmethystShard[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const terrain = ctx.getTerrainState();
  const wallState = ctx.getVerdureCaveWallState?.() ?? null;
  const _solidCtx: ActorSolidCtx = buildActorSolidCtx(ctx.viewport, terrain, wallState);
  for (const enemy of enemies) {
    enemy.patrolTimerMs -= deltaMs;
    if (enemy.patrolTimerMs <= 0) {
      enemy.patrolTimerMs = AMETHYST_PATROL_TURN_MS * (0.5 + Math.random());
      const angle = Math.random() * Math.PI * 2;
      enemy.vx = Math.cos(angle) * AMETHYST_PATROL_SPEED;
      enemy.vy = Math.sin(angle) * AMETHYST_PATROL_SPEED;
    }
    const half = AMETHYST_ENEMY_SIZE / 2;
    actorMoveX(enemy, half, half, enemy.vx * dt, _solidCtx, () => { enemy.vx = 0; });
    actorMoveY(enemy, half, half, enemy.vy * dt, _solidCtx, () => { enemy.vy = 0; });
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
  const { mote, viewport } = ctx;
  const terrain = ctx.getTerrainState();
  for (let i = shards.length - 1; i >= 0; i--) {
    const s = shards[i];
    const prevX = s.x, prevY = s.y;
    s.x += s.vx * dt; s.y += s.vy * dt;
    s.lifeMs -= deltaMs;
    if (s.lifeMs <= 0 || s.x < viewport.left || s.x > viewport.right || s.y < viewport.top || s.y > viewport.bottom
        || (terrain && segmentIntersectsTopographicTerrain(terrain, prevX, prevY, s.x, s.y))) {
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

// ── Diamond enemy system (wave 60) ────────────────────────────────────────────

export function updateDiamondEnemies(
  enemies: DiamondEnemy[],
  shards: DiamondShard[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote, viewport } = ctx;
  const terrain = ctx.getTerrainState();
  const wallState = ctx.getVerdureCaveWallState?.() ?? null;
  const _solidCtx: ActorSolidCtx = buildActorSolidCtx(ctx.viewport, terrain, wallState);
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
      enemy.x = Math.max(viewport.left + half, Math.min(viewport.right - half, enemy.x));
      enemy.y = Math.max(viewport.top + half, Math.min(viewport.bottom - half, enemy.y));
    } else {
      const dx = mote.x - enemy.x, dy = mote.y - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      enemy.vx = (dx / dist) * DIAMOND_PATROL_SPEED;
      enemy.vy = (dy / dist) * DIAMOND_PATROL_SPEED;
      const half = DIAMOND_ENEMY_SIZE / 2;
      actorMoveX(enemy, half, half, enemy.vx * dt, _solidCtx, () => { enemy.vx = 0; });
      actorMoveY(enemy, half, half, enemy.vy * dt, _solidCtx, () => { enemy.vy = 0; });
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
  const { mote, viewport } = ctx;
  const terrain = ctx.getTerrainState();
  for (let i = shards.length - 1; i >= 0; i--) {
    const s = shards[i];
    const prevX = s.x, prevY = s.y;
    s.x += s.vx * dt; s.y += s.vy * dt;
    s.lifeMs -= deltaMs;
    if (s.lifeMs <= 0 || s.x < viewport.left || s.x > viewport.right || s.y < viewport.top || s.y > viewport.bottom
        || (terrain && segmentIntersectsTopographicTerrain(terrain, prevX, prevY, s.x, s.y))) {
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

// ── Nullstone enemy system (wave 70) ──────────────────────────────────────────

export function updateNullstoneEnemies(
  enemies: NullstoneEnemy[],
  tendrils: VoidTendril[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote } = ctx;
  const terrain = ctx.getTerrainState();
  const wallState = ctx.getVerdureCaveWallState?.() ?? null;
  const _solidCtx: ActorSolidCtx = buildActorSolidCtx(ctx.viewport, terrain, wallState);
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
    const half = NULLSTONE_ENEMY_SIZE / 2;
    actorMoveX(enemy, half, half, enemy.vx * dt, _solidCtx, () => { enemy.vx = 0; });
    actorMoveY(enemy, half, half, enemy.vy * dt, _solidCtx, () => { enemy.vy = 0; });
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
  const { mote, viewport } = ctx;
  const terrain = ctx.getTerrainState();
  for (let i = tendrils.length - 1; i >= 0; i--) {
    const t = tendrils[i];
    const prevX = t.x, prevY = t.y;
    t.x += t.vx * dt; t.y += t.vy * dt;
    t.lifeMs -= deltaMs;
    if (t.lifeMs <= 0 || t.x < viewport.left || t.x > viewport.right || t.y < viewport.top || t.y > viewport.bottom
        || (terrain && segmentIntersectsTopographicTerrain(terrain, prevX, prevY, t.x, t.y))) {
      tendrils.splice(i, 1); continue;
    }
    if (!t.hasHitPlayer) {
      const dx = t.x - mote.x, dy = t.y - mote.y;
      if (dx * dx + dy * dy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
        t.hasHitPlayer = true;
        ctx.dealDamageToPlayer(t.atk);
        ctx.applyPlayerStatusFromSource?.('nullstone');
      }
    }
  }
}
