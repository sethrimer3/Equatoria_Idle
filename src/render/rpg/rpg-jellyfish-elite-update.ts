/**
 * rpg-jellyfish-elite-update.ts — Per-frame AI, physics, and tentacle
 * simulation for all four elite jellyfish variants.
 *
 * Tentacle constraint — taut-only pulling:
 *   Each segment pair only pulls the child segment when the distance between
 *   them exceeds segMaxLen.  Below that threshold the child segment is never
 *   pushed, so tails lag naturally on direction changes and only go taut when
 *   the head has moved far enough.
 *
 * Verlet integration gives segments momentum/sway without storing velocity
 *   explicitly.  Per-frame damping prevents oscillation runaway.
 */
import { type RpgEnemyCtx, applyEnemyTerrainPushOut } from './rpg-enemy-updates';
import type { EliteJellyfishEnemy } from './rpg-jellyfish-elite-types';
import { TARGET_FRAME_MS, PLAYER_HIT_RADIUS } from './rpg-constants';
import {
  ELITE_JELLYFISH_BASE_SIZE, ELITE_JELLYFISH_CONTACT_RADIUS,
  ENCIRCLING_ORBIT_RADIUS, ENCIRCLING_ORBIT_SPEED,
  LONGTAIL_FLANK_DIST,
  WHIPLASH_JELLYFISH_BURST_CD_MS, WHIPLASH_JELLYFISH_PULSE_FORCE,
  BASIC_JELLYFISH_PULSE_CD_MS, BASIC_JELLYFISH_PULSE_DUR_MS,
  LONGTAIL_JELLYFISH_PULSE_CD_MS, LONGTAIL_JELLYFISH_PULSE_DUR_MS,
  WHIPLASH_JELLYFISH_PULSE_CD_MS, WHIPLASH_JELLYFISH_PULSE_DUR_MS,
  ENCIRCLING_JELLYFISH_PULSE_CD_MS, ENCIRCLING_JELLYFISH_PULSE_DUR_MS,
} from './rpg-jellyfish-elite-constants';
import { PROC_CONTACT_CD_MS } from './rpg-procedural-constants';

// ── Steering targets per variant ──────────────────────────────────────────────

function getSteeringTarget(
  e: EliteJellyfishEnemy,
  moteX: number, moteY: number,
  deltaMs: number,
): { tx: number; ty: number } {
  const dx = moteX - e.x, dy = moteY - e.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  switch (e.variant) {
    case 'basic':
      return { tx: moteX, ty: moteY };

    case 'longtail': {
      // Flank perpendicular to player direction, attempting tail sweep
      const perpX = -dy / len * e.flankSign;
      const perpY =  dx / len * e.flankSign;
      return {
        tx: moteX + perpX * LONGTAIL_FLANK_DIST,
        ty: moteY + perpY * LONGTAIL_FLANK_DIST,
      };
    }

    case 'whiplash':
      // Direct chase; burst toward player
      return { tx: moteX, ty: moteY };

    case 'encircling': {
      // Orbit around player at ENCIRCLING_ORBIT_RADIUS
      e.orbitAngle += (deltaMs / 1000) * ENCIRCLING_ORBIT_SPEED * e.flankSign;
      return {
        tx: moteX + Math.cos(e.orbitAngle) * ENCIRCLING_ORBIT_RADIUS,
        ty: moteY + Math.sin(e.orbitAngle) * ENCIRCLING_ORBIT_RADIUS,
      };
    }
  }
}

// ── Tentacle simulation ───────────────────────────────────────────────────────

function updateTentacles(e: EliteJellyfishEnemy, dt: number): void {
  const { tailCount, segmentsPerTail, segX, segY, segPvX, segPvY, segMaxLen, segDamping } = e;

  // Tail bases attach to the bottom rim of the bell, spread symmetrically
  const bellSize = ELITE_JELLYFISH_BASE_SIZE;
  for (let t = 0; t < tailCount; t++) {
    const baseAngle = Math.PI * 0.15 + (t / (tailCount - 1 || 1)) * Math.PI * 0.7;
    const bx = e.x + Math.cos(Math.PI * 0.5 + baseAngle) * bellSize * 0.85;
    const by = e.y + Math.sin(Math.PI * 0.5 + baseAngle) * bellSize * 0.85;

    const base = t * segmentsPerTail;

    // Snap root segment to bell rim; no Verlet for the anchor
    segX[base] = bx;
    segY[base] = by;
    segPvX[base] = bx;
    segPvY[base] = by;

    // Propagate Verlet + taut-only constraint through child segments
    for (let s = 1; s < segmentsPerTail; s++) {
      const idx = base + s;

      // Verlet: velocity = (current - previous) * damping
      const velX = (segX[idx] - segPvX[idx]) * segDamping;
      const velY = (segY[idx] - segPvY[idx]) * segDamping;

      segPvX[idx] = segX[idx];
      segPvY[idx] = segY[idx];

      segX[idx] += velX * dt;
      segY[idx] += velY * dt;

      // Taut-only constraint: only pull toward parent if distance > maxLen
      const pdx = segX[idx - 1] - segX[idx];
      const pdy = segY[idx - 1] - segY[idx];
      const dist = Math.sqrt(pdx * pdx + pdy * pdy);
      if (dist > segMaxLen) {
        const pull = (dist - segMaxLen) / dist;
        segX[idx] += pdx * pull;
        segY[idx] += pdy * pull;
      }
    }
  }
}

// ── Contact damage check ──────────────────────────────────────────────────────

function checkContactDamage(e: EliteJellyfishEnemy, ctx: RpgEnemyCtx): void {
  if (e.contactCdMs > 0) return;

  const hitR = PLAYER_HIT_RADIUS;
  const contactR = ELITE_JELLYFISH_CONTACT_RADIUS;
  const threshold = (contactR + hitR) ** 2;

  // Head
  const hdx = ctx.mote.x - e.x, hdy = ctx.mote.y - e.y;
  if (hdx * hdx + hdy * hdy <= (ELITE_JELLYFISH_BASE_SIZE + hitR) ** 2) {
    ctx.dealDamageToPlayer(e.atk);
    e.contactCdMs = PROC_CONTACT_CD_MS;
    return;
  }

  // Tentacle segments
  const { tailCount, segmentsPerTail, segX, segY } = e;
  for (let t = 0; t < tailCount && e.contactCdMs <= 0; t++) {
    const base = t * segmentsPerTail;
    for (let s = 0; s < segmentsPerTail && e.contactCdMs <= 0; s++) {
      const idx = base + s;
      const tdx = ctx.mote.x - segX[idx];
      const tdy = ctx.mote.y - segY[idx];
      if (tdx * tdx + tdy * tdy <= threshold) {
        ctx.dealDamageToPlayer(e.atk);
        e.contactCdMs = PROC_CONTACT_CD_MS;
      }
    }
  }
}

// ── Main update ───────────────────────────────────────────────────────────────

export function updateEliteJellyfishEnemies(
  enemies: EliteJellyfishEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);

  for (const e of enemies) {
    e.animPhase  += deltaMs / 1000;
    e.bellPhase  += deltaMs / 1000;
    if (e.hitFlashMs  > 0) e.hitFlashMs  -= deltaMs;
    if (e.contactCdMs > 0) e.contactCdMs -= deltaMs;

    // ── Whiplash burst cooldown ──────────────────────────────────────────────
    if (e.variant === 'whiplash' && e.burstCdMs > 0) {
      e.burstCdMs -= deltaMs;
      if (e.burstCdMs <= 0) {
        // Fire a large burst pulse toward the player
        const dx = ctx.mote.x - e.x, dy = ctx.mote.y - e.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        e.vx += (dx / len) * WHIPLASH_JELLYFISH_PULSE_FORCE * 3.5;
        e.vy += (dy / len) * WHIPLASH_JELLYFISH_PULSE_FORCE * 3.5;
        e.burstCdMs = WHIPLASH_JELLYFISH_BURST_CD_MS * (0.8 + Math.random() * 0.4);
      }
    }

    // ── Pulse management ─────────────────────────────────────────────────────
    if (e.pulseActiveMs > 0) {
      e.pulseActiveMs -= deltaMs;
    } else {
      e.pulseCdMs -= deltaMs;
      if (e.pulseCdMs <= 0) {
        const pulseDur = e.variant === 'basic' ? BASIC_JELLYFISH_PULSE_DUR_MS
          : e.variant === 'longtail' ? LONGTAIL_JELLYFISH_PULSE_DUR_MS
          : e.variant === 'whiplash' ? WHIPLASH_JELLYFISH_PULSE_DUR_MS
          : ENCIRCLING_JELLYFISH_PULSE_DUR_MS;
        const nextCd = e.variant === 'basic' ? BASIC_JELLYFISH_PULSE_CD_MS
          : e.variant === 'longtail' ? LONGTAIL_JELLYFISH_PULSE_CD_MS
          : e.variant === 'whiplash' ? WHIPLASH_JELLYFISH_PULSE_CD_MS
          : ENCIRCLING_JELLYFISH_PULSE_CD_MS;
        e.pulseActiveMs = pulseDur;
        e.pulseCdMs = nextCd * (0.75 + Math.random() * 0.5);
      }
    }

    // ── Steering ─────────────────────────────────────────────────────────────
    const { tx, ty } = getSteeringTarget(e, ctx.mote.x, ctx.mote.y, deltaMs);
    const sdx = tx - e.x, sdy = ty - e.y;
    const slen = Math.sqrt(sdx * sdx + sdy * sdy) || 1;

    if (e.pulseActiveMs > 0) {
      // Thrusting: apply pulse force toward steering target
      e.vx += (sdx / slen) * e.pulseForce;
      e.vy += (sdy / slen) * e.pulseForce;
    }

    // Drift drag always applied
    e.vx *= e.driftDrag;
    e.vy *= e.driftDrag;

    e.x += e.vx * dt;
    e.y += e.vy * dt;

    ctx.clampEnemyToBounds(e);
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), ELITE_JELLYFISH_BASE_SIZE / 2);

    // ── Tentacles ────────────────────────────────────────────────────────────
    updateTentacles(e, dt);

    // ── Contact damage ───────────────────────────────────────────────────────
    checkContactDamage(e, ctx);
  }
}

// ── TODO: enemyTentacleReflector ─────────────────────────────────────────────
// Laser/ray reflection against tentacle capsules requires ray-segment intersection
// that would touch weapon system internals non-trivially.  When wiring laser
// reflection, implement:
//   export function enemyTentacleReflector(
//     e: EliteJellyfishEnemy,
//     rayOx: number, rayOy: number,
//     rayDx: number, rayDy: number,
//   ): { hitT: number; reflectDx: number; reflectDy: number } | null
// and call it from rpg-weapon-laser.ts before the normal hit check.
