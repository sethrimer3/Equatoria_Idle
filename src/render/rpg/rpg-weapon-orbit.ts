/**
 * rpg-weapon-orbit.ts — Weapon orbit particle helpers for the RPG tab.
 *
 * Extracted from rpg-render.ts to keep that file smaller.
 *
 * Exports:
 *   - `buildWeaponOrbitParticle(ctx, weaponId, startAngle)` — constructs one orbit particle.
 *   - `buildOrbitProjectile(ctx)` — constructs the special orbit projectile (if unlocked).
 *   - `updateWeaponOrbitParticles(ctx, deltaMs)` — advances all orbit particles each frame.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getRpgUpgradeLevel, getSkillNodeRank } from '../../sim/rpg/rpg-state';
import { resolveWeaponDefinition } from '../../data/rpg/crafted-weapon-helpers';
import { TIER_BY_ID } from '../../data/tiers';
import type { WeaponOrbitParticle, OrbitProjectile, RpgMote } from './rpg-types';
import {
  WEAPON_PARTICLE_ORBIT_SPEED, WEAPON_PARTICLE_ORBIT_RADIUS, WEAPON_PARTICLE_MIN_SPEED,
  ORBIT_PROJ_RADIUS, ORBIT_PROJ_TRAIL_CAP,
  WEAPON_ORBIT_TRAIL_CAP, MIN_TRAIL_DISTANCE,
} from './rpg-constants';

// ── Context ───────────────────────────────────────────────────────────────────

export interface WeaponOrbitCtx {
  mote: RpgMote;
  weaponOrbitParticles: WeaponOrbitParticle[];
  rpgSimState: RpgSimState;
}

// ── Factory functions ─────────────────────────────────────────────────────────

export function buildWeaponOrbitParticle(
  ctx: WeaponOrbitCtx,
  weaponId: string,
  startAngle: number,
): WeaponOrbitParticle | null {
  const weaponDef = resolveWeaponDefinition(weaponId);
  if (!weaponDef) return null;
  const tierDef   = TIER_BY_ID.get(weaponDef.costTierId);
  const color     = tierDef?.color     ?? '#ffd764';
  const glowColor = tierDef?.glowColor ?? '#ffe599';
  const tier = ctx.rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
  // Level-based size increase is halved to reduce visual clutter at high tiers.
  const size = 1 + (tier - 1) * 0.5;
  return {
    angle: startAngle,
    x: ctx.mote.x + Math.cos(startAngle) * WEAPON_PARTICLE_ORBIT_RADIUS,
    y: ctx.mote.y + Math.sin(startAngle) * WEAPON_PARTICLE_ORBIT_RADIUS,
    trailX: new Float64Array(WEAPON_ORBIT_TRAIL_CAP),
    trailY: new Float64Array(WEAPON_ORBIT_TRAIL_CAP),
    trailHead: 0, trailCount: 0,
    color, glowColor, size,
  };
}

export function buildOrbitProjectile(
  ctx: WeaponOrbitCtx,
): OrbitProjectile[] {
  const hasUpgrade = getRpgUpgradeLevel(ctx.rpgSimState, 'orbit_projectile') >= 1;
  if (!hasUpgrade) return [];
  // orbit_count adds up to 3 extra projectiles
  const extraCount = getSkillNodeRank(ctx.rpgSimState, 'orbit_count');
  const totalCount = 1 + extraCount;
  const result: OrbitProjectile[] = [];
  for (let i = 0; i < totalCount; i++) {
    const angle = Math.PI + (2 * Math.PI * i) / totalCount;
    result.push({
      angle,
      x: ctx.mote.x + Math.cos(angle) * ORBIT_PROJ_RADIUS,
      y: ctx.mote.y + Math.sin(angle) * ORBIT_PROJ_RADIUS,
      trailX: new Float64Array(ORBIT_PROJ_TRAIL_CAP),
      trailY: new Float64Array(ORBIT_PROJ_TRAIL_CAP),
      trailHead: 0, trailCount: 0,
      hitCooldowns: new Map(),
      reformMs: 0,
    });
  }
  return result;
}

// ── Per-frame update ──────────────────────────────────────────────────────────

export function updateWeaponOrbitParticles(ctx: WeaponOrbitCtx, deltaMs: number): void {
  if (ctx.weaponOrbitParticles.length === 0) return;
  const dt = deltaMs / 1000;
  const angleStep = ctx.weaponOrbitParticles.length > 0
    ? (2 * Math.PI) / ctx.weaponOrbitParticles.length
    : 0;
  for (let idx = 0; idx < ctx.weaponOrbitParticles.length; idx++) {
    const p = ctx.weaponOrbitParticles[idx];
    p.angle += WEAPON_PARTICLE_ORBIT_SPEED * dt;
    // Keep evenly spaced when multiple weapons are equipped
    const targetAngle = idx * angleStep + (Date.now() / 1000) * WEAPON_PARTICLE_ORBIT_SPEED;
    const angleDelta = ((targetAngle - p.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    p.angle += angleDelta * 0.05;
    const newX = ctx.mote.x + Math.cos(p.angle) * WEAPON_PARTICLE_ORBIT_RADIUS;
    const newY = ctx.mote.y + Math.sin(p.angle) * WEAPON_PARTICLE_ORBIT_RADIUS;
    const dx = newX - p.x, dy = newY - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < WEAPON_PARTICLE_MIN_SPEED * dt) p.angle += 0.05;
    p.x = newX; p.y = newY;

    // Distance-based trail update to prevent jittering at high refresh rates.
    const MIN_TRAIL_DISTANCE_SQ = MIN_TRAIL_DISTANCE * MIN_TRAIL_DISTANCE;
    const lastTrailIdx = (p.trailHead - 1 + WEAPON_ORBIT_TRAIL_CAP) % WEAPON_ORBIT_TRAIL_CAP;
    const trailDx = p.x - p.trailX[lastTrailIdx];
    const trailDy = p.y - p.trailY[lastTrailIdx];
    const trailDistSq = trailDx * trailDx + trailDy * trailDy;

    if (p.trailCount === 0 || trailDistSq >= MIN_TRAIL_DISTANCE_SQ) {
      p.trailX[p.trailHead] = p.x;
      p.trailY[p.trailHead] = p.y;
      p.trailHead = (p.trailHead + 1) % WEAPON_ORBIT_TRAIL_CAP;
      if (p.trailCount < WEAPON_ORBIT_TRAIL_CAP) p.trailCount++;
    }
  }
}
