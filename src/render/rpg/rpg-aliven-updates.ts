/**
 * rpg-aliven-updates.ts — Per-frame physics and special-ability update
 * for the AlivenParticle enemy system.
 *
 * updateAlivenGroups() is called once per frame from rpg-render.ts after
 * all standard enemy updates and before removeDeadEnemies().
 */

import type { AlivenParticle, AlivenParticleGroup } from './rpg-aliven-types';
import {
  ALIVEN_MAX_PARTICLES,
  ALIVEN_CONTACT_EXTRA_RADIUS_PX,
  ALIVEN_CONTACT_CD_MS,
  ALIVEN_HIT_FLASH_MS,
  ALIVEN_TRAIL_CAP,
  ALIVEN_TRAIL_MIN_DIST_SQ,
  ALIVEN_SPITTER_WINDUP_MS,
  ALIVEN_SPITTER_BULLET_SPEED,
  ALIVEN_SPITTER_BULLET_RADIUS,
  ALIVEN_WINDUP_SENTINEL,
  ALIVEN_WINDUP_THRESHOLD,
  ALIVEN_DASH_SPEED,
  ALIVEN_PULSE_RADIUS_PX,
  ALIVEN_PULSE_ATK_MULT,
  ALIVEN_PULSER_RING_DURATION_MS,
  ALIVEN_HEAL_FRACTION,
  ALIVEN_HEALER_RANGE_SQ,
  ALIVEN_HEALER_BEAM_MS,
  ALIVEN_SPLIT_FLASH_MS,
  ALIVEN_ORBIT_STRENGTH,
  ALIVEN_GHOST_DURATION_MS,
  ALIVEN_FRICTION,
  ALIVEN_WANDER_STRENGTH,
  ALIVEN_SEEK_STRENGTH,
  ALIVEN_VARIANT_PARAMS,
  ALIVEN_SEPARATION_MAX_COUNT,
  ALIVEN_SEPARATION_STRENGTH,
} from './rpg-aliven-constants';
import { makeAlivenParticle } from './rpg-aliven-factories';

// ── Per-frame spawn interval per variant ──────────────────────────────────
function getSpawnIntervalMs(variantId: string): number {
  const p = ALIVEN_VARIANT_PARAMS[variantId as keyof typeof ALIVEN_VARIANT_PARAMS];
  return p ? p.spawnIntervalMs : 400;
}

// ── Base ATK from maxHp ───────────────────────────────────────────────────
/** Contact damage proportional to maxHp so it scales consistently with waves. */
const ALIVEN_ATK_HP_RATIO = 0.07;
function getAtk(p: AlivenParticle): number {
  return Math.max(1, Math.ceil(p.maxHp * ALIVEN_ATK_HP_RATIO));
}

// ── Context injected from rpg-render.ts ──────────────────────────────────
export interface AlivenUpdateCtx {
  playerX: number;
  playerY: number;
  playerRadius: number;
  /** Current remaining i-frame duration (read-only from updates; use setPlayerIFramesMs to write). */
  playerIFramesMs: number;
  /** Grant the player i-frames directly (e.g. from spitter bullet hits). */
  setPlayerIFramesMs(ms: number): void;
  canvasW: number;
  canvasH: number;
  dealContactDamageToPlayer(atk: number): void;
}

// ── Main update entry point ───────────────────────────────────────────────

export function updateAlivenGroups(
  groups: AlivenParticleGroup[],
  ctx: AlivenUpdateCtx,
  deltaMs: number,
): void {
  for (const group of groups) {
    tickSpawnOneParticle(group, deltaMs, ctx.canvasW, ctx.canvasH);
    updateCentroid(group);
    // Lightweight O(n²) overlap separation — only for small groups.
    if (group.aliveCount > 1 && group.aliveCount <= ALIVEN_SEPARATION_MAX_COUNT) {
      separateOverlappingParticles(group, deltaMs);
    }
    // Tick group-level visual timers.
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
  canvasW: number,
  canvasH: number,
): void {
  if (group.spawnedCount >= group.targetCount) return;
  group.spawnCdMs -= deltaMs;
  if (group.spawnCdMs > 0) return;
  group.spawnCdMs = getSpawnIntervalMs(group.variantId);

  const p = group.particles[group.spawnedCount];
  group.spawnedCount++;

  // Place near group centroid, searching outward in a small spiral.
  const minR = p.radiusPx + 1;
  const maxR = minR + 12;
  for (let attempt = 0; attempt < 16; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const r = minR + Math.random() * (maxR - minR);
    const nx = group.cx + Math.cos(angle) * r;
    const ny = group.cy + Math.sin(angle) * r;
    if (nx < p.radiusPx || nx > canvasW - p.radiusPx) continue;
    if (ny < p.radiusPx || ny > canvasH - p.radiusPx) continue;
    // Check no overlap with already-alive particles.
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
  // Fallback: use a wider radius if spiral fails.
  const angle = Math.random() * Math.PI * 2;
  p.x = Math.max(p.radiusPx, Math.min(canvasW - p.radiusPx, group.cx + Math.cos(angle) * (maxR + 5)));
  p.y = Math.max(p.radiusPx, Math.min(canvasH - p.radiusPx, group.cy + Math.sin(angle) * (maxR + 5)));
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
 * Only called when aliveCount ≤ ALIVEN_SEPARATION_MAX_COUNT to keep cost bounded.
 * Uses impulse-based velocity nudges — no position teleporting — so it feels smooth.
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
      // Impulse proportional to overlap depth, capped to avoid explosions.
      const overlap  = minDist - dist;
      const strength = Math.min(overlap * ALIVEN_SEPARATION_STRENGTH * deltaMs, 0.04);
      a.vx -= nx * strength;
      a.vy -= ny * strength;
      b.vx += nx * strength;
      b.vy += ny * strength;
    }
  }
}

// ── Particle-life movement ────────────────────────────────────────────────

function tickMovement(
  p: AlivenParticle,
  group: AlivenParticleGroup,
  ctx: AlivenUpdateCtx,
  deltaMs: number,
): void {
  // Wander noise
  p.vx += (Math.random() - 0.5) * ALIVEN_WANDER_STRENGTH * deltaMs;
  p.vy += (Math.random() - 0.5) * ALIVEN_WANDER_STRENGTH * deltaMs;

  // Bias toward player
  const dpx = ctx.playerX - p.x, dpy = ctx.playerY - p.y;
  const dpLen = Math.sqrt(dpx * dpx + dpy * dpy);
  if (dpLen > 0.01) {
    p.vx += (dpx / dpLen) * ALIVEN_SEEK_STRENGTH * deltaMs;
    p.vy += (dpy / dpLen) * ALIVEN_SEEK_STRENGTH * deltaMs;
  }

  // Orbiter centripetal pull toward centroid
  if (p.specialKind === 'orbiter') {
    const dcx = group.cx - p.x, dcy = group.cy - p.y;
    p.vx += dcx * ALIVEN_ORBIT_STRENGTH * deltaMs;
    p.vy += dcy * ALIVEN_ORBIT_STRENGTH * deltaMs;
  }

  // Cap velocity
  const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  const maxSpeed = 0.18; // px/ms
  if (speed > maxSpeed) {
    const s = maxSpeed / speed;
    p.vx *= s; p.vy *= s;
  }

  // Friction
  p.vx *= ALIVEN_FRICTION;
  p.vy *= ALIVEN_FRICTION;

  // Integrate position
  p.x += p.vx * deltaMs;
  p.y += p.vy * deltaMs;

  // Bounce off walls
  if (p.x < p.radiusPx)                         { p.x = p.radiusPx;                p.vx = Math.abs(p.vx); }
  if (p.x > ctx.canvasW - p.radiusPx)           { p.x = ctx.canvasW - p.radiusPx;  p.vx = -Math.abs(p.vx); }
  if (p.y < p.radiusPx)                         { p.y = p.radiusPx;                p.vy = Math.abs(p.vy); }
  if (p.y > ctx.canvasH - p.radiusPx)           { p.y = ctx.canvasH - p.radiusPx;  p.vy = -Math.abs(p.vy); }
}

// ── Trail ─────────────────────────────────────────────────────────────────

function tickTrail(p: AlivenParticle): void {
  // Only ember and dasher particles keep trails in v1.
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

// ── Timers ─────────────────────────────────────────────────────────────────

function tickVisuals(p: AlivenParticle, deltaMs: number): void {
  p.pulseMs   += deltaMs;
  p.hitFlashMs = Math.max(0, p.hitFlashMs - deltaMs);
  p.contactCdMs = Math.max(0, p.contactCdMs - deltaMs);
  if (p.pulserFlashMs > 0) p.pulserFlashMs = Math.max(0, p.pulserFlashMs - deltaMs);
  if (p.healBeamMs > 0)    p.healBeamMs    = Math.max(0, p.healBeamMs    - deltaMs);
}

// ── Contact damage ────────────────────────────────────────────────────────

function tickContact(
  p: AlivenParticle,
  _group: AlivenParticleGroup,
  ctx: AlivenUpdateCtx,
  _deltaMs: number,
): void {
  if (p.contactCdMs > 0) return;
  if (ctx.playerIFramesMs > 0) return;
  const hitRadius = p.radiusPx + ctx.playerRadius + ALIVEN_CONTACT_EXTRA_RADIUS_PX;
  const dx = p.x - ctx.playerX, dy = p.y - ctx.playerY;
  if (dx * dx + dy * dy > hitRadius * hitRadius) return;

  // Deal damage and start cooldown
  ctx.dealContactDamageToPlayer(getAtk(p));
  p.contactCdMs = ALIVEN_CONTACT_CD_MS;
  p.hitFlashMs  = ALIVEN_HIT_FLASH_MS;
}

// ── Special abilities ─────────────────────────────────────────────────────

function tickSpecial(
  p: AlivenParticle,
  group: AlivenParticleGroup,
  ctx: AlivenUpdateCtx,
  deltaMs: number,
): void {
  switch (p.specialKind) {
    case 'spitter':  tickSpitter(p, group, ctx, deltaMs); break;
    case 'dasher':   tickDasher(p, ctx, deltaMs);          break;
    case 'pulser':   tickPulser(p, ctx, deltaMs);          break;
    case 'healer':   tickHealer(p, group, deltaMs);        break;
    case 'ghost':    tickGhost(p, deltaMs);                break;
    case 'ember':    /* trail only, no extra logic */       break;
    case 'splitter': /* handled in death, not per-frame */  break;
    case 'orbiter':  /* centripetal handled in movement */  break;
    default:         break;
  }
}

// Spitter — counts down, enters windup, then fires.
function tickSpitter(
  p: AlivenParticle,
  group: AlivenParticleGroup,
  ctx: AlivenUpdateCtx,
  deltaMs: number,
): void {
  if (p.specialCdMs > ALIVEN_WINDUP_THRESHOLD) {
    // In windup phase
    p.windupMs += deltaMs;
    if (p.windupMs >= ALIVEN_SPITTER_WINDUP_MS) {
      // Fire
      const dx = ctx.playerX - p.x, dy = ctx.playerY - p.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0.01) {
        // Small aim inaccuracy
        const inaccuracy = (Math.random() - 0.5) * 0.25;
        const angle = Math.atan2(dy, dx) + inaccuracy;
        group.bullets.push({
          x:   p.x, y: p.y,
          vx:  Math.cos(angle) * ALIVEN_SPITTER_BULLET_SPEED,
          vy:  Math.sin(angle) * ALIVEN_SPITTER_BULLET_SPEED,
          atk: getAtk(p),
          color: p.color,
        });
      }
      p.windupMs = 0;
      // Reset to normal cooldown
      p.specialCdMs = p.specialCdMin + Math.random() * (p.specialCdMax - p.specialCdMin);
    }
    return;
  }
  // Normal countdown
  p.specialCdMs -= deltaMs;
  if (p.specialCdMs <= 0) {
    // Enter windup: sentinel flags the windup phase
    p.specialCdMs = ALIVEN_WINDUP_SENTINEL;
    p.windupMs    = 0;
  }
}

// Dasher — every cooldown interval, adds a burst of velocity toward the player.
function tickDasher(p: AlivenParticle, ctx: AlivenUpdateCtx, deltaMs: number): void {
  p.specialCdMs -= deltaMs;
  if (p.specialCdMs > 0) return;
  p.specialCdMs = p.specialCdMin + Math.random() * (p.specialCdMax - p.specialCdMin);
  const dx = ctx.playerX - p.x, dy = ctx.playerY - p.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > 0.01) {
    p.vx += (dx / len) * ALIVEN_DASH_SPEED;
    p.vy += (dy / len) * ALIVEN_DASH_SPEED;
  }
}

// Pulser — emits a shockwave that hits the player if in range.
function tickPulser(p: AlivenParticle, ctx: AlivenUpdateCtx, deltaMs: number): void {
  p.specialCdMs -= deltaMs;
  if (p.specialCdMs > 0) return;
  p.specialCdMs = p.specialCdMin + Math.random() * (p.specialCdMax - p.specialCdMin);
  // Trigger the shockwave ring visual regardless of whether the player is in range.
  p.pulserFlashMs = ALIVEN_PULSER_RING_DURATION_MS;
  if (ctx.playerIFramesMs > 0) return;
  const dx = p.x - ctx.playerX, dy = p.y - ctx.playerY;
  const distSq = dx * dx + dy * dy;
  if (distSq < ALIVEN_PULSE_RADIUS_PX * ALIVEN_PULSE_RADIUS_PX) {
    ctx.dealContactDamageToPlayer(Math.ceil(getAtk(p) * ALIVEN_PULSE_ATK_MULT));
    p.hitFlashMs = ALIVEN_HIT_FLASH_MS;
  }
}

// Healer — periodically restores a small fraction of maxHp to nearby particles.
function tickHealer(p: AlivenParticle, group: AlivenParticleGroup, deltaMs: number): void {
  p.specialCdMs -= deltaMs;
  if (p.specialCdMs > 0) return;
  p.specialCdMs = p.specialCdMin + Math.random() * (p.specialCdMax - p.specialCdMin);
  for (const other of group.particles) {
    if (!other.isAlive || other === p) continue;
    if (other.hp >= other.maxHp) continue;
    const dx = other.x - p.x, dy = other.y - p.y;
    if (dx * dx + dy * dy > ALIVEN_HEALER_RANGE_SQ) continue;
    other.hp = Math.min(other.maxHp, other.hp + Math.ceil(other.maxHp * ALIVEN_HEAL_FRACTION));
    // Record beam target on the first healed particle for the visual.
    p.healBeamTargetX = other.x;
    p.healBeamTargetY = other.y;
    p.healBeamMs      = ALIVEN_HEALER_BEAM_MS;
  }
}

// Ghost — periodically enters an invulnerable phase (ghostMs > 0 blocks incoming damage).
function tickGhost(p: AlivenParticle, deltaMs: number): void {
  if (p.ghostMs > 0) {
    p.ghostMs = Math.max(0, p.ghostMs - deltaMs);
    return;
  }
  p.specialCdMs -= deltaMs;
  if (p.specialCdMs <= 0) {
    p.ghostMs     = ALIVEN_GHOST_DURATION_MS;
    p.specialCdMs = p.specialCdMin + Math.random() * (p.specialCdMax - p.specialCdMin);
  }
}

// ── Bullet update ──────────────────────────────────────────────────────────

function tickBullets(
  group: AlivenParticleGroup,
  ctx: AlivenUpdateCtx,
  deltaMs: number,
): void {
  for (let i = group.bullets.length - 1; i >= 0; i--) {
    const b = group.bullets[i];
    b.x += b.vx * deltaMs;
    b.y += b.vy * deltaMs;

    // Remove if off-canvas
    if (b.x < -10 || b.x > ctx.canvasW + 10 || b.y < -10 || b.y > ctx.canvasH + 10) {
      group.bullets.splice(i, 1);
      continue;
    }

    // Player contact
    if (ctx.playerIFramesMs <= 0) {
      const dx = b.x - ctx.playerX, dy = b.y - ctx.playerY;
      const hitR = ALIVEN_SPITTER_BULLET_RADIUS + ctx.playerRadius;
      if (dx * dx + dy * dy < hitR * hitR) {
        ctx.dealContactDamageToPlayer(b.atk);
        group.bullets.splice(i, 1);
      }
    }
  }
}

// ── Death handler ──────────────────────────────────────────────────────────

/**
 * Called from rpg-damage.ts after a particle's HP reaches 0.
 * Handles splitter death: spawns 2 small child particles if the group
 * has capacity and the dead particle is a splitter.
 */
export function handleAlivenParticleDeath(
  group: AlivenParticleGroup,
  dead: AlivenParticle,
): void {
  if (dead.specialKind !== 'splitter') return;
  const params = ALIVEN_VARIANT_PARAMS[group.variantId as keyof typeof ALIVEN_VARIANT_PARAMS];
  if (!params) return;

  const liveCount = group.particles.filter(q => q.isAlive).length;
  const canAdd = ALIVEN_MAX_PARTICLES - group.particles.length;
  const toSpawn = Math.min(2, canAdd);
  if (liveCount === 0 || toSpawn === 0) return; // no room or group already defeated
  for (let i = 0; i < toSpawn; i++) {
    // Child is weaker: half the radius and one third maxHp
    const childHp = Math.max(1, Math.ceil(dead.maxHp / 3));
    const child: AlivenParticle = makeAlivenParticle(
      { ...params, hpBase: childHp, radiusPx: Math.max(1.5, dead.radiusPx * 0.6), specialKind: 'none' },
      1, // already scaled by wave, pass 1 to avoid double-scaling
    );
    child.x = dead.x + (Math.random() - 0.5) * 8;
    child.y = dead.y + (Math.random() - 0.5) * 8;
    child.hp    = childHp;
    child.maxHp = childHp;
    child.isAlive = true;
    group.particles.push(child);
    if (group.spawnedCount < group.particles.length) {
      group.spawnedCount = group.particles.length;
      group.targetCount  = group.particles.length;
    }
    void liveCount;
  }
  // Trigger the split burst visual at the death position.
  group.splitFlashMs = ALIVEN_SPLIT_FLASH_MS;
  group.splitFlashX  = dead.x;
  group.splitFlashY  = dead.y;
}
