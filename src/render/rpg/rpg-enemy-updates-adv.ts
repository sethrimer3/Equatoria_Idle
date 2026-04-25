/**
 * rpg-enemy-updates-adv.ts — Per-frame update logic for advanced enemy types.
 *
 * Contains the wave 40-70+ enemy systems, extracted from rpg-enemy-updates.ts
 * to keep both files under ~700 lines each.
 *
 * All functions follow the same RpgEnemyCtx contract as rpg-enemy-updates.ts.
 *
 * Sections (in wave-unlock order):
 *   - Iolite  (wave 40) — fan beams
 *   - Amethyst (wave 50) — shield + ring burst
 *   - Diamond  (wave 60) — phase invuln + prismatic shards
 *   - Nullstone (wave 70) — gravity + void tendrils
 *   - Fracteryl           — fractal shard bursts
 *   - Eigenstein          — charge-up beam
 *   - Teleport particles  — visual helper, shared across systems
 */

import type {
  IoliteEnemy,
  AmethystEnemy, AmethystShard,
  DiamondEnemy, DiamondShard,
  NullstoneEnemy, VoidTendril,
  FracterylEnemy, FracterylShard,
  EigensteinEnemy, EigensteinBeam,
  TeleportParticle,
} from './rpg-types';
import {
  TARGET_FRAME_MS, PLAYER_HIT_RADIUS,
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
  NULLSTONE_TENDRIL_CD_MS, NULLSTONE_TENDRIL_COUNT, VOID_TENDRIL_SPEED,
  FRACTERYL_PATROL_TURN_MS, FRACTERYL_BURST_CD_MS, FRACTERYL_BURST_JITTER,
  FRACTERYL_ENEMY_SIZE,
  EIGENSTEIN_PATROL_TURN_MS, EIGENSTEIN_BEAM_CD_MS, EIGENSTEIN_BEAM_JITTER,
  EIGENSTEIN_BEAM_CHARGE_MS, EIGENSTEIN_BEAM_FIRE_MS, EIGENSTEIN_ENEMY_SIZE,
  FLUID_FRACTERYL_R, FLUID_FRACTERYL_G, FLUID_FRACTERYL_B,
  FLUID_EIGENSTEIN_R, FLUID_EIGENSTEIN_G, FLUID_EIGENSTEIN_B,
} from './rpg-constants';
import {
  makeAmethystShard,
  makeDiamondShard,
  makeVoidTendril,
  makeFracterylShard,
} from './rpg-factories';
import type { RpgEnemyCtx } from './rpg-enemy-updates';

// ── Iolite enemy system (wave 40) ─────────────────────────────────────────────

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

// ── Amethyst enemy system (wave 50) ───────────────────────────────────────────

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

// ── Diamond enemy system (wave 60) ────────────────────────────────────────────

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

// ── Nullstone enemy system (wave 70) ──────────────────────────────────────────

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
    if (enemy.x < half)         { enemy.x = half;          enemy.vx = Math.abs(enemy.vx) * 0.5; }
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
