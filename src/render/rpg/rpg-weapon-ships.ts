/**
 * rpg-weapon-ships.ts — Sapphire companion ship weapon system for the RPG tab.
 *
 * Extracted from rpg-weapon-systems.ts to keep that module focused on
 * single-projectile and melee weapons. This module owns the sapphire ship
 * lifecycle and orchestrates the amethyst ship system via
 * `createAmethystShipSystem` (rpg-weapon-amethyst-ships.ts):
 *
 *   • Sapphire ships — orbit the targeted enemy; fire fast curving lasers.
 *   • Amethyst ships — distribute across the furthest enemies; fire slow
 *     spiraling pierce lasers that track their original target.
 *
 * The factory `createShipWeaponSystems(ctx)` receives a `ShipWeaponCtx`
 * dependency-injection object and returns a `ShipWeaponHandle` exposing
 * ship/laser state arrays (consumed by rpg-weapon-draw.ts for rendering) and
 * per-frame update functions (called by the main update loop in
 * rpg-weapon-systems.ts via its RpgWeaponHandle delegation).
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getScaledWeaponDamage } from '../../sim/rpg/rpg-state';
import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import {
  SAPPHIRE_SHIP_FIRE_MS, SAPPHIRE_SHIP_ORBIT_RADIUS, SAPPHIRE_SHIP_MAX_SPEED,
  SAPPHIRE_SHIP_LASER_RANGE, SAPPHIRE_SHIP_TRAIL_CAP, SAPPHIRE_SHIP_TRAIL_MIN_DIST,
  SAPPHIRE_LASER_SPEED, SAPPHIRE_LASER_LIFE_MS, SAPPHIRE_LASER_HIT_RADIUS,
  SAPPHIRE_LASER_TRAIL_CAP, SAPPHIRE_LASER_TRAIL_MIN_DIST,
  SAPPHIRE_LASER_COLOR, SAPPHIRE_LASER_GLOW, SAPPHIRE_LASER_SPREAD_RAD,
  SAPPHIRE_LASER_CURVE_RATE, SAPPHIRE_LASER_LATERAL_VEL, SAPPHIRE_LASER_LATERAL_DECAY,
} from './rpg-weapon-constants';
import {
  HIT_EFFECT_DURATION_MS, TARGET_FRAME_MS,
  FLUID_VEL_FRAME_TO_PX_S, FLUID_PROJECTILE_STRENGTH,
  FLUID_SAPPH_R, FLUID_SAPPH_G, FLUID_SAPPH_B,
} from './rpg-constants';
import { createAmethystShipSystem } from './rpg-weapon-amethyst-ships';
import type { FluidImpulse } from './rpg-fluid';
import type { RpgPlayerStats, HitEffect, ClosestTarget } from './rpg-types';
import type { SapphireShip, SapphireLaser, AmethystShip, AmethystLaser } from './rpg-enemy-types';
import { segmentIntersectsTopographicTerrain, type TopographicTerrainState } from './terrain/topographic-terrain';

// ── Dependency-injection context ──────────────────────────────────────────

// ── Module-level helpers ──────────────────────────────────────────────────

/** Appends the current position to a circular trail buffer.
 *  @param minDist  Minimum distance (px) the entity must have moved since the
 *                  last recorded point before a new point is added.  0 means
 *                  always add (no minimum-distance guard).
 */
function updateShipTrail(
  x: number,
  y: number,
  trailX: Float64Array,
  trailY: Float64Array,
  state: { trailHead: number; trailCount: number },
  minDist: number = 0,
): void {
  if (minDist > 0 && state.trailCount > 0) {
    const prevIdx = (state.trailHead - 1 + trailX.length) % trailX.length;
    const dx = x - trailX[prevIdx];
    const dy = y - trailY[prevIdx];
    if (dx * dx + dy * dy < minDist * minDist) return;
  }
  trailX[state.trailHead] = x;
  trailY[state.trailHead] = y;
  state.trailHead = (state.trailHead + 1) % trailX.length;
  if (state.trailCount < trailX.length) state.trailCount++;
}

/** Returns the max HP of the primary entity inside a ClosestTarget. */
function getTargetMaxHp(target: ClosestTarget): number {
  return target.laser?.maxHp ?? target.sapphire?.maxHp ?? target.emerald?.maxHp ?? target.amber?.maxHp
    ?? target.void?.maxHp ?? target.quartz?.maxHp ?? target.ruby?.maxHp ?? target.sunstone?.maxHp
    ?? target.citrine?.maxHp ?? target.iolite?.maxHp ?? target.amethyst?.maxHp ?? target.diamond?.maxHp
    ?? target.nullstone?.maxHp ?? target.fracteryl?.maxHp ?? target.eigenstein?.maxHp ?? target.boss?.maxHp ?? 1;
}

/** Structural subset of RpgWeaponCtx containing only what ship systems need. */
export interface ShipWeaponCtx {
  mote: { x: number; y: number };
  dim: { w: number; h: number };
  /** Full visible world-space bounds — updated on every resize. */
  viewport: { left: number; top: number; right: number; bottom: number };
  rpgSimState: RpgSimState;
  playerStats: RpgPlayerStats;
  hitEffects: HitEffect[];
  fluid: { addForce(impulse: FluidImpulse): void };
  getEffectiveEquippedIds: () => Set<string>;
  findEquippedWeaponIdByEffect: (effectKind: string) => string | null;
  findClosestEnemyFrom: (x: number, y: number, rangeSq: number) => ClosestTarget | null;
  getTargetedEnemy: () => ClosestTarget | null;
  collectEnemyBodyTargets: () => ClosestTarget[];
  damageBodyTarget: (target: ClosestTarget, rawDamage: number, defPierceRatio: number, bypassShield: boolean) => number;
  spawnDamageNumber: (x: number, y: number, vx: number, vy: number, text: string, healthFraction: number, color: string) => void;
  withDamageSource: (weaponId: string | null, fn: () => void) => void;
  /** Returns current terrain state, or null if terrain is not active. */
  getTerrainState?: () => TopographicTerrainState | null;
}

// ── Handle returned to the caller ─────────────────────────────────────────

export interface ShipWeaponHandle {
  // State arrays exposed for draw calls
  readonly sapphireShips: SapphireShip[];
  readonly sapphireLasers: SapphireLaser[];
  readonly amethystShips: AmethystShip[];
  readonly amethystLasers: AmethystLaser[];

  // Per-frame update functions
  updateSapphireShips: (deltaMs: number) => void;
  updateSapphireLasers: (deltaMs: number) => void;
  updateAmethystShips: (deltaMs: number) => void;
  updateAmethystLasers: (deltaMs: number) => void;

  // Called when weapon equip state changes (from applyEquipmentStats / notifyEquip)
  syncSapphireShips: () => void;
  syncAmethystShips: () => void;

  // Clears all ship and laser state (called by the weapon system's reset on restart)
  reset: () => void;
}

// ── Factory ───────────────────────────────────────────────────────────────

export function createShipWeaponSystems(ctx: ShipWeaponCtx): ShipWeaponHandle {
  const {
    mote, viewport, rpgSimState, playerStats, hitEffects, fluid,
    getEffectiveEquippedIds, findEquippedWeaponIdByEffect,
    findClosestEnemyFrom, getTargetedEnemy,
    damageBodyTarget, spawnDamageNumber,
  } = ctx;

  // Amethyst ship system (owned by the companion module).
  const amethystSystem = createAmethystShipSystem(ctx);

  const sapphireShips: SapphireShip[] = [];
  const sapphireLasers: SapphireLaser[] = [];

  // ── Sapphire ship system ──────────────────────────────────────────

  /**
   * Syncs sapphire ships to match equipped weapon tier.
   * Call when weapon equip state changes.
   */
  function syncSapphireShips(): void {
    let equippedTier = 0;
    let baseDamage = 0;
    for (const weaponId of getEffectiveEquippedIds()) {
      const wd = WEAPON_BY_ID.get(weaponId);
      if (wd?.stats.effect?.kind === 'sapphireShip') {
        equippedTier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
        baseDamage = wd.stats.damage;
        break;
      }
    }

    while (sapphireShips.length > equippedTier) sapphireShips.pop();
    while (sapphireShips.length < equippedTier) {
      const angle = (sapphireShips.length / equippedTier) * Math.PI * 2;
      sapphireShips.push({
        x: mote.x + Math.cos(angle) * SAPPHIRE_SHIP_ORBIT_RADIUS,
        y: mote.y + Math.sin(angle) * SAPPHIRE_SHIP_ORBIT_RADIUS,
        vx: 0,
        vy: 0,
        orbitAngle: angle,
        fireCooldownMs: Math.random() * SAPPHIRE_SHIP_FIRE_MS,
        baseDamage,
        trailX: new Float64Array(SAPPHIRE_SHIP_TRAIL_CAP),
        trailY: new Float64Array(SAPPHIRE_SHIP_TRAIL_CAP),
        trailHead: 0,
        trailCount: 0,
      });
    }
    for (const ship of sapphireShips) ship.baseDamage = baseDamage;
  }

  /**
   * Updates sapphire ships: orbit around targeted enemy (or player),
   * fire curving lasers at nearby enemies.
   */
  function updateSapphireShips(deltaMs: number): void {
    if (sapphireShips.length === 0) return;
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const effectiveTarget = getTargetedEnemy();
    const targetX = effectiveTarget ? effectiveTarget.x : mote.x;
    const targetY = effectiveTarget ? effectiveTarget.y : mote.y;

    for (let i = 0; i < sapphireShips.length; i++) {
      const ship = sapphireShips[i];
      ship.orbitAngle += 2.6 * (deltaMs / 1000);
      const angleOffset = (i / sapphireShips.length) * Math.PI * 2;
      const desiredX = targetX + Math.cos(ship.orbitAngle + angleOffset) * SAPPHIRE_SHIP_ORBIT_RADIUS;
      const desiredY = targetY + Math.sin(ship.orbitAngle + angleOffset) * SAPPHIRE_SHIP_ORBIT_RADIUS;

      const dx = desiredX - ship.x;
      const dy = desiredY - ship.y;
      const moveSpeed = SAPPHIRE_SHIP_MAX_SPEED * dt;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > moveSpeed) {
        ship.vx = (dx / dist) * moveSpeed;
        ship.vy = (dy / dist) * moveSpeed;
        ship.x += ship.vx;
        ship.y += ship.vy;
      } else {
        ship.vx = desiredX - ship.x;
        ship.vy = desiredY - ship.y;
        ship.x = desiredX;
        ship.y = desiredY;
      }
      updateShipTrail(ship.x, ship.y, ship.trailX, ship.trailY, ship, SAPPHIRE_SHIP_TRAIL_MIN_DIST);

      const nearestEnemy = findClosestEnemyFrom(ship.x, ship.y, SAPPHIRE_SHIP_LASER_RANGE * SAPPHIRE_SHIP_LASER_RANGE);
      ship.fireCooldownMs -= deltaMs;
      if (ship.fireCooldownMs <= 0 && nearestEnemy) {
        ship.fireCooldownMs += SAPPHIRE_SHIP_FIRE_MS;
        spawnSapphireLaser(ship, nearestEnemy);
      }
    }
  }

  /**
   * Spawns a sapphire laser from a ship toward a target enemy.
   */
  function spawnSapphireLaser(ship: SapphireShip, target: ClosestTarget): void {
    const weaponId = findEquippedWeaponIdByEffect('sapphireShip');
    const tier = weaponId ? (rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1) : 1;
    const scaledDamage = getScaledWeaponDamage(ship.baseDamage, tier, playerStats.atk);
    const baseAngle = Math.atan2(target.y - ship.y, target.x - ship.x);
    const angle = baseAngle + (Math.random() * 2 - 1) * SAPPHIRE_LASER_SPREAD_RAD;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const lateralDir = Math.random() > 0.5 ? 1 : -1;
    sapphireLasers.push({
      x: ship.x,
      y: ship.y,
      vx: dirX * SAPPHIRE_LASER_SPEED,
      vy: dirY * SAPPHIRE_LASER_SPEED,
      lateralVx: -dirY * SAPPHIRE_LASER_LATERAL_VEL * lateralDir,
      lateralVy: dirX * SAPPHIRE_LASER_LATERAL_VEL * lateralDir,
      curveDir: lateralDir,
      lifeMs: SAPPHIRE_LASER_LIFE_MS,
      scaledDamage,
      trailX: new Float64Array(SAPPHIRE_LASER_TRAIL_CAP),
      trailY: new Float64Array(SAPPHIRE_LASER_TRAIL_CAP),
      trailHead: 0,
      trailCount: 0,
    });
  }

  /**
   * Updates sapphire lasers: move with curve, check collisions, despawn.
   */
  function updateSapphireLasers(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const terrain = ctx.getTerrainState ? ctx.getTerrainState() : null;
    const weaponId = findEquippedWeaponIdByEffect('sapphireShip');
    ctx.withDamageSource(weaponId, () => {
      for (let i = sapphireLasers.length - 1; i >= 0; i--) {
        const laser = sapphireLasers[i];
        laser.lifeMs -= deltaMs;
        const speed = Math.sqrt(laser.vx * laser.vx + laser.vy * laser.vy);
        if (speed > 0.001) {
          const angle = Math.atan2(laser.vy, laser.vx) + SAPPHIRE_LASER_CURVE_RATE * laser.curveDir * dt;
          laser.vx = Math.cos(angle) * speed;
          laser.vy = Math.sin(angle) * speed;
        }
        const prevX = laser.x, prevY = laser.y;
        laser.x += (laser.vx + laser.lateralVx) * dt;
        laser.y += (laser.vy + laser.lateralVy) * dt;
        laser.lateralVx *= Math.pow(SAPPHIRE_LASER_LATERAL_DECAY, dt);
        laser.lateralVy *= Math.pow(SAPPHIRE_LASER_LATERAL_DECAY, dt);

        // Terrain blocking: destroy the laser if it crossed a solid island.
        if (terrain && segmentIntersectsTopographicTerrain(terrain, prevX, prevY, laser.x, laser.y)) {
          sapphireLasers.splice(i, 1); continue;
        }

        updateShipTrail(laser.x, laser.y, laser.trailX, laser.trailY, laser, SAPPHIRE_LASER_TRAIL_MIN_DIST);

        // Inject forward-motion force into the fluid field (adds sapphire color swirls).
        fluid.addForce({
          x: laser.x, y: laser.y,
          vx: laser.vx * FLUID_VEL_FRAME_TO_PX_S,
          vy: laser.vy * FLUID_VEL_FRAME_TO_PX_S,
          r: FLUID_SAPPH_R, g: FLUID_SAPPH_G, b: FLUID_SAPPH_B,
          strength: FLUID_PROJECTILE_STRENGTH * 0.5,
        });

        const hitTarget = findClosestEnemyFrom(laser.x, laser.y, SAPPHIRE_LASER_HIT_RADIUS * SAPPHIRE_LASER_HIT_RADIUS);
        if (hitTarget) {
          const dmg = damageBodyTarget(hitTarget, laser.scaledDamage, 0.2, false);
          if (dmg > 0) {
            spawnDamageNumber(hitTarget.x, hitTarget.y, 0, -1, String(Math.round(dmg)), dmg / Math.max(1, getTargetMaxHp(hitTarget)), SAPPHIRE_LASER_COLOR);
            hitEffects.push({ x: hitTarget.x, y: hitTarget.y, timerMs: HIT_EFFECT_DURATION_MS, color: SAPPHIRE_LASER_GLOW });
          }
          sapphireLasers.splice(i, 1);
          continue;
        }

        if (laser.lifeMs <= 0 || laser.x < viewport.left - 50 || laser.x > viewport.right + 50 || laser.y < viewport.top - 50 || laser.y > viewport.bottom + 50) {
          sapphireLasers.splice(i, 1);
        }
      }
    });
  }

  // ── Handle ────────────────────────────────────────────────────────

  return {
    get sapphireShips() { return sapphireShips; },
    get sapphireLasers() { return sapphireLasers; },
    get amethystShips() { return amethystSystem.amethystShips; },
    get amethystLasers() { return amethystSystem.amethystLasers; },

    syncSapphireShips,
    syncAmethystShips: () => amethystSystem.syncAmethystShips(),

    updateSapphireShips,
    updateSapphireLasers,
    updateAmethystShips: (deltaMs: number) => amethystSystem.updateAmethystShips(deltaMs),
    updateAmethystLasers: (deltaMs: number) => amethystSystem.updateAmethystLasers(deltaMs),

    reset(): void {
      sapphireShips.length = 0;
      sapphireLasers.length = 0;
      amethystSystem.reset();
    },
  };
}
