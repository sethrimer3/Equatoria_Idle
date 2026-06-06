/**
 * rpg-aliven-specials.ts — Special-ability tick functions and contact damage
 * for the AlivenParticle enemy system.
 *
 * Extracted from rpg-aliven-updates.ts to keep that file focused on the core
 * per-frame orchestration loop (spawn, centroid, movement, trails, timers).
 * This file owns the logic for every per-particle ability trigger and the
 * death handler for the splitter variant.
 *
 * Exports (called by rpg-aliven-updates.ts):
 *   tickContact              — contact damage check executed every frame
 *   tickSpitter / Dasher / Pulser / Healer / Ghost — cooldown-driven abilities
 *   tickBullets              — advances and collides spitter projectiles
 *   handleAlivenParticleDeath — spawns child particles for the splitter variant
 */

import type { AlivenParticle, AlivenParticleGroup, AlivenUpdateCtx } from './rpg-aliven-types';
import {
  ALIVEN_CONTACT_EXTRA_RADIUS_PX,
  ALIVEN_CONTACT_CD_MS,
  ALIVEN_HIT_FLASH_MS,
  ALIVEN_WINDUP_THRESHOLD,
  ALIVEN_SPITTER_WINDUP_MS,
  ALIVEN_SPITTER_BULLET_SPEED,
  ALIVEN_WINDUP_SENTINEL,
  ALIVEN_DASH_SPEED,
  ALIVEN_PULSER_RING_DURATION_MS,
  ALIVEN_PULSE_RADIUS_PX,
  ALIVEN_PULSE_ATK_MULT,
  ALIVEN_HEALER_RANGE_SQ,
  ALIVEN_HEAL_FRACTION,
  ALIVEN_HEALER_BEAM_MS,
  ALIVEN_GHOST_DURATION_MS,
  ALIVEN_SPITTER_BULLET_RADIUS,
  ALIVEN_VARIANT_PARAMS,
  ALIVEN_MAX_PARTICLES,
  ALIVEN_SPLIT_FLASH_MS,
} from './rpg-aliven-constants';
import { makeAlivenParticle } from './rpg-aliven-factories';
import {
  recordPlayerDamageFromContact,
  recordPlayerDamageFromBullet,
  recordAlivenBulletFired,
} from '../../dev/session-telemetry';

// ── Shared private helper ─────────────────────────────────────────────────

/** Contact/ability damage proportional to maxHp so it scales with waves. */
const ALIVEN_ATK_HP_RATIO = 0.07;
function getAtk(p: AlivenParticle): number {
  return Math.max(1, Math.ceil(p.maxHp * ALIVEN_ATK_HP_RATIO));
}

// ── Contact damage ────────────────────────────────────────────────────────

export function tickContact(
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

  const atk = getAtk(p);
  ctx.dealContactDamageToPlayer(atk);
  recordPlayerDamageFromContact(atk);
  p.contactCdMs = ALIVEN_CONTACT_CD_MS;
  p.hitFlashMs  = ALIVEN_HIT_FLASH_MS;
}

// ── Special abilities ─────────────────────────────────────────────────────

/** Spitter — counts down, enters windup, then fires a bullet at the player. */
export function tickSpitter(
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
        const inaccuracy = (Math.random() - 0.5) * 0.25;
        const angle = Math.atan2(dy, dx) + inaccuracy;
        group.bullets.push({
          x:    p.x, y: p.y,
          vx:   Math.cos(angle) * ALIVEN_SPITTER_BULLET_SPEED,
          vy:   Math.sin(angle) * ALIVEN_SPITTER_BULLET_SPEED,
          atk:  getAtk(p),
          color: p.color,
        });
        recordAlivenBulletFired(group.variantId);
      }
      p.windupMs = 0;
      p.specialCdMs = p.specialCdMin + Math.random() * (p.specialCdMax - p.specialCdMin);
    }
    return;
  }
  // Normal countdown
  p.specialCdMs -= deltaMs;
  if (p.specialCdMs <= 0) {
    p.specialCdMs = ALIVEN_WINDUP_SENTINEL;
    p.windupMs    = 0;
  }
}

/** Dasher — bursts of velocity toward the player every cooldown interval. */
export function tickDasher(p: AlivenParticle, ctx: AlivenUpdateCtx, deltaMs: number): void {
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

/** Pulser — emits a shockwave that hits the player if in range. */
export function tickPulser(p: AlivenParticle, ctx: AlivenUpdateCtx, deltaMs: number): void {
  p.specialCdMs -= deltaMs;
  if (p.specialCdMs > 0) return;
  p.specialCdMs = p.specialCdMin + Math.random() * (p.specialCdMax - p.specialCdMin);
  p.pulserFlashMs = ALIVEN_PULSER_RING_DURATION_MS;
  if (ctx.playerIFramesMs > 0) return;
  const dx = p.x - ctx.playerX, dy = p.y - ctx.playerY;
  const distSq = dx * dx + dy * dy;
  if (distSq < ALIVEN_PULSE_RADIUS_PX * ALIVEN_PULSE_RADIUS_PX) {
    const atk = Math.ceil(getAtk(p) * ALIVEN_PULSE_ATK_MULT);
    ctx.dealContactDamageToPlayer(atk);
    recordPlayerDamageFromContact(atk);
    p.hitFlashMs = ALIVEN_HIT_FLASH_MS;
  }
}

/** Healer — restores a fraction of maxHp to nearby particles on cooldown. */
export function tickHealer(p: AlivenParticle, group: AlivenParticleGroup, deltaMs: number): void {
  p.specialCdMs -= deltaMs;
  if (p.specialCdMs > 0) return;
  p.specialCdMs = p.specialCdMin + Math.random() * (p.specialCdMax - p.specialCdMin);
  for (const other of group.particles) {
    if (!other.isAlive || other === p) continue;
    if (other.hp >= other.maxHp) continue;
    const dx = other.x - p.x, dy = other.y - p.y;
    if (dx * dx + dy * dy > ALIVEN_HEALER_RANGE_SQ) continue;
    other.hp = Math.min(other.maxHp, other.hp + Math.ceil(other.maxHp * ALIVEN_HEAL_FRACTION));
    p.healBeamTargetX = other.x;
    p.healBeamTargetY = other.y;
    p.healBeamMs      = ALIVEN_HEALER_BEAM_MS;
  }
}

/** Ghost — periodically enters an invulnerable phase (ghostMs > 0 blocks damage). */
export function tickGhost(p: AlivenParticle, deltaMs: number): void {
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

export function tickBullets(
  group: AlivenParticleGroup,
  ctx: AlivenUpdateCtx,
  deltaMs: number,
): void {
  for (let i = group.bullets.length - 1; i >= 0; i--) {
    const b = group.bullets[i];
    b.x += b.vx * deltaMs;
    b.y += b.vy * deltaMs;

    if (b.x < ctx.arenaLeft - 10 || b.x > ctx.arenaRight + 10 ||
        b.y < ctx.arenaTop - 10  || b.y > ctx.arenaBottom + 10) {
      group.bullets.splice(i, 1);
      continue;
    }

    if (ctx.playerIFramesMs <= 0) {
      const dx = b.x - ctx.playerX, dy = b.y - ctx.playerY;
      const hitR = ALIVEN_SPITTER_BULLET_RADIUS + ctx.playerRadius;
      if (dx * dx + dy * dy < hitR * hitR) {
        ctx.dealContactDamageToPlayer(b.atk);
        recordPlayerDamageFromBullet(b.atk);
        group.bullets.splice(i, 1);
      }
    }
  }
}

// ── Death handler ──────────────────────────────────────────────────────────

/**
 * Called from rpg-damage.ts after a particle's HP reaches 0.
 * Handles splitter death: spawns up to 2 weaker child particles if the group
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
  if (liveCount === 0 || toSpawn === 0) return;
  for (let i = 0; i < toSpawn; i++) {
    const childHp = Math.max(1, Math.ceil(dead.maxHp / 3));
    const child: AlivenParticle = makeAlivenParticle(
      { ...params, hpBase: childHp, radiusPx: Math.max(1.5, dead.radiusPx * 0.6), specialKind: 'none' },
      1,
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
  group.splitFlashMs = ALIVEN_SPLIT_FLASH_MS;
  group.splitFlashX  = dead.x;
  group.splitFlashY  = dead.y;
}
