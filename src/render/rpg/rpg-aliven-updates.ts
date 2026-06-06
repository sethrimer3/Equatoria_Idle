/**
 * rpg-aliven-updates.ts — Per-frame physics and core orchestration for the
 * AlivenParticle enemy system.
 *
 * updateAlivenGroups() is called once per frame from rpg-render.ts after all
 * standard enemy updates and before removeDeadEnemies().
 *
 * Special-ability logic (contact damage, spitter, dasher, pulser, healer,
 * ghost, bullets, and splitter death) lives in rpg-aliven-specials.ts.
 */

import type { AlivenParticle, AlivenParticleGroup, AlivenUpdateCtx } from './rpg-aliven-types';
// Re-export AlivenUpdateCtx for backward compatibility with existing import sites.
export type { AlivenUpdateCtx };
import {
  ALIVEN_SEPARATION_MAX_COUNT,
  ALIVEN_SEPARATION_STRENGTH,
  ALIVEN_TRAIL_CAP,
  ALIVEN_TRAIL_MIN_DIST_SQ,
  ALIVEN_WANDER_STRENGTH,
  ALIVEN_SEEK_STRENGTH,
  ALIVEN_ORBIT_STRENGTH,
  ALIVEN_VARIANT_PARAMS,
} from './rpg-aliven-constants';
import {
  applyParticleLifeForces,
  getActiveAlivenFriction,
  getActiveAlivenMaxVelocity,
} from './terrain/impetus-particle-life';
import {
  tickContact,
  tickSpitter,
  tickDasher,
  tickPulser,
  tickHealer,
  tickGhost,
  tickBullets,
} from './rpg-aliven-specials';
// Re-export handleAlivenParticleDeath for backward compatibility with rpg-damage.ts.
export { handleAlivenParticleDeath } from './rpg-aliven-specials';

// ── Dev telemetry ─────────────────────────────────────────────────────────

/**
 * Returns a snapshot of aliven group activity for the dev overlay.
 * Cheap O(G) walk over the groups array — safe to call every frame.
 */
export function getAlivenGroupTelemetry(groups: AlivenParticleGroup[]): {
  activeGroups: number;
  totalAliveParticles: number;
} {
  let activeGroups = 0;
  let totalAliveParticles = 0;
  for (const g of groups) {
    if (g.aliveCount > 0) {
      activeGroups++;
      totalAliveParticles += g.aliveCount;
    }
  }
  return { activeGroups, totalAliveParticles };
}

// ── Per-frame spawn interval per variant ──────────────────────────────────
function getSpawnIntervalMs(variantId: string): number {
  const p = ALIVEN_VARIANT_PARAMS[variantId as keyof typeof ALIVEN_VARIANT_PARAMS];
  return p ? p.spawnIntervalMs : 400;
}

// ── Main update entry point ───────────────────────────────────────────────

export function updateAlivenGroups(
  groups: AlivenParticleGroup[],
  ctx: AlivenUpdateCtx,
  deltaMs: number,
): void {
  applyParticleLifeForces(groups, deltaMs);
  for (const group of groups) {
    tickSpawnOneParticle(group, deltaMs, ctx);
    updateCentroid(group);
    if (group.aliveCount > 1 && group.aliveCount <= ALIVEN_SEPARATION_MAX_COUNT) {
      separateOverlappingParticles(group, deltaMs);
    }
    if (group.splitFlashMs > 0) {
      group.splitFlashMs = Math.max(0, group.splitFlashMs - deltaMs);
    }
    for (const p of group.particles) {
      if (!p.isAlive) continue;
      tickMovement(p, group, ctx, deltaMs);
      tickTrail(p);
      tickVisuals(p, deltaMs);
      tickContact(p, group, ctx, deltaMs);
      tickSpecial(p, group, ctx, deltaMs);
    }
    tickBullets(group, ctx, deltaMs);
  }
}

// ── Spawn one particle per frame ─────────────────────────────────────────

function tickSpawnOneParticle(
  group: AlivenParticleGroup,
  deltaMs: number,
  ctx: AlivenUpdateCtx,
): void {
  if (group.spawnedCount >= group.targetCount) return;
  group.spawnCdMs -= deltaMs;
  if (group.spawnCdMs > 0) return;
  group.spawnCdMs = getSpawnIntervalMs(group.variantId);

  const p = group.particles[group.spawnedCount];
  group.spawnedCount++;

  const minR = p.radiusPx + 1;
  const maxR = minR + 12;
  const { arenaLeft, arenaTop, arenaRight, arenaBottom } = ctx;
  for (let attempt = 0; attempt < 16; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const r = minR + Math.random() * (maxR - minR);
    const nx = group.cx + Math.cos(angle) * r;
    const ny = group.cy + Math.sin(angle) * r;
    if (nx < arenaLeft + p.radiusPx || nx > arenaRight - p.radiusPx) continue;
    if (ny < arenaTop + p.radiusPx  || ny > arenaBottom - p.radiusPx) continue;
    let overlaps = false;
    for (const other of group.particles) {
      if (!other.isAlive) continue;
      const dx = other.x - nx, dy = other.y - ny;
      if (dx * dx + dy * dy < (other.radiusPx + p.radiusPx) * (other.radiusPx + p.radiusPx)) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) {
      p.x = nx; p.y = ny;
      p.isAlive = true;
      return;
    }
  }
  // Fallback: wider radius if spiral fails.
  const angle = Math.random() * Math.PI * 2;
  p.x = Math.max(arenaLeft + p.radiusPx, Math.min(arenaRight - p.radiusPx, group.cx + Math.cos(angle) * (maxR + 5)));
  p.y = Math.max(arenaTop + p.radiusPx,  Math.min(arenaBottom - p.radiusPx, group.cy + Math.sin(angle) * (maxR + 5)));
  p.isAlive = true;
}

// ── Centroid update ────────────────────────────────────────────────────────

function updateCentroid(group: AlivenParticleGroup): void {
  let sx = 0, sy = 0, count = 0;
  for (const p of group.particles) {
    if (!p.isAlive) continue;
    sx += p.x; sy += p.y; count++;
  }
  group.aliveCount = count;
  if (count > 0) {
    group.cx = sx / count;
    group.cy = sy / count;
    group.x  = group.cx;
    group.y  = group.cy;
  }
}

// ── Particle overlap separation ────────────────────────────────────────────

/**
 * O(n²) lightweight repulsion pass that pushes overlapping alive particles apart.
 * Only called when aliveCount <= ALIVEN_SEPARATION_MAX_COUNT to keep cost bounded.
 */
function separateOverlappingParticles(group: AlivenParticleGroup, deltaMs: number): void {
  const ps = group.particles;
  for (let i = 0; i < ps.length - 1; i++) {
    const a = ps[i];
    if (!a.isAlive) continue;
    for (let j = i + 1; j < ps.length; j++) {
      const b = ps[j];
      if (!b.isAlive) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minDist = a.radiusPx + b.radiusPx;
      const distSq  = dx * dx + dy * dy;
      if (distSq >= minDist * minDist || distSq < 0.0001) continue;
      const dist = Math.sqrt(distSq);
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap  = minDist - dist;
      const strength = Math.min(overlap * ALIVEN_SEPARATION_STRENGTH * deltaMs, 0.04);
      a.vx -= nx * strength;
      a.vy -= ny * strength;
      b.vx += nx * strength;
      b.vy += ny * strength;
    }
  }
}

// ── Particle movement ─────────────────────────────────────────────────────

function tickMovement(
  p: AlivenParticle,
  group: AlivenParticleGroup,
  ctx: AlivenUpdateCtx,
  deltaMs: number,
): void {
  // Wander noise
  p.vx += (Math.random() - 0.5) * ALIVEN_WANDER_STRENGTH * deltaMs;
  p.vy += (Math.random() - 0.5) * ALIVEN_WANDER_STRENGTH * deltaMs;

  // Player-seeking bias — elite groups only; normal groups are driven by the matrix.
  if (group.isElite) {
    const dpx = ctx.playerX - p.x, dpy = ctx.playerY - p.y;
    const dpLen = Math.sqrt(dpx * dpx + dpy * dpy);
    if (dpLen > 0.01) {
      p.vx += (dpx / dpLen) * ALIVEN_SEEK_STRENGTH * deltaMs;
      p.vy += (dpy / dpLen) * ALIVEN_SEEK_STRENGTH * deltaMs;
    }
  }

  // Orbiter centripetal pull toward centroid
  if (p.specialKind === 'orbiter') {
    const dcx = group.cx - p.x, dcy = group.cy - p.y;
    p.vx += dcx * ALIVEN_ORBIT_STRENGTH * deltaMs;
    p.vy += dcy * ALIVEN_ORBIT_STRENGTH * deltaMs;
  }

  // Cap velocity — uses per-profile max from active Impetus matrix (falls back to 0.18)
  const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  const maxSpeed = getActiveAlivenMaxVelocity();
  if (speed > maxSpeed) {
    const s = maxSpeed / speed;
    p.vx *= s; p.vy *= s;
  }

  // Friction — uses per-profile damping from active Impetus matrix (falls back to 0.985)
  const friction = getActiveAlivenFriction();
  p.vx *= friction;
  p.vy *= friction;

  // Integrate position
  p.x += p.vx * deltaMs;
  p.y += p.vy * deltaMs;

  // Bounce off arena walls (uses full visible activeBounds, not the fixed safe core).
  const r = p.radiusPx;
  if (p.x < ctx.arenaLeft   + r) { p.x = ctx.arenaLeft   + r; p.vx =  Math.abs(p.vx); }
  if (p.x > ctx.arenaRight  - r) { p.x = ctx.arenaRight  - r; p.vx = -Math.abs(p.vx); }
  if (p.y < ctx.arenaTop    + r) { p.y = ctx.arenaTop    + r; p.vy =  Math.abs(p.vy); }
  if (p.y > ctx.arenaBottom - r) { p.y = ctx.arenaBottom - r; p.vy = -Math.abs(p.vy); }
}

// ── Trail ─────────────────────────────────────────────────────────────────

function tickTrail(p: AlivenParticle): void {
  if (p.specialKind !== 'ember' && p.specialKind !== 'dasher') return;
  if (p.trail.length === 0) {
    p.trail.push({ x: p.x, y: p.y });
    return;
  }
  const last = p.trail[p.trail.length - 1];
  const dx = p.x - last.x, dy = p.y - last.y;
  if (dx * dx + dy * dy < ALIVEN_TRAIL_MIN_DIST_SQ) return;
  if (p.trail.length >= ALIVEN_TRAIL_CAP) p.trail.shift();
  p.trail.push({ x: p.x, y: p.y });
}

// ── Per-frame visual timers ────────────────────────────────────────────────

function tickVisuals(p: AlivenParticle, deltaMs: number): void {
  p.pulseMs    += deltaMs;
  p.hitFlashMs  = Math.max(0, p.hitFlashMs  - deltaMs);
  p.contactCdMs = Math.max(0, p.contactCdMs - deltaMs);
  if (p.pulserFlashMs > 0) p.pulserFlashMs = Math.max(0, p.pulserFlashMs - deltaMs);
  if (p.healBeamMs    > 0) p.healBeamMs    = Math.max(0, p.healBeamMs    - deltaMs);
}

// ── Special-ability dispatcher ────────────────────────────────────────────

function tickSpecial(
  p: AlivenParticle,
  group: AlivenParticleGroup,
  ctx: AlivenUpdateCtx,
  deltaMs: number,
): void {
  switch (p.specialKind) {
    case 'spitter':  tickSpitter(p, group, ctx, deltaMs); break;
    case 'dasher':   tickDasher(p, ctx, deltaMs, group.isElite); break;
    case 'pulser':   tickPulser(p, ctx, deltaMs);          break;
    case 'healer':   tickHealer(p, group, deltaMs);        break;
    case 'ghost':    tickGhost(p, deltaMs);                break;
    case 'ember':    /* trail only, no extra logic */       break;
    case 'splitter': /* handled in death, not per-frame */  break;
    case 'orbiter':  /* centripetal handled in movement */  break;
    default:         break;
  }
}
