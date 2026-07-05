/**
 * rpg-weapon-amethyst-ships.ts — Amethyst companion ship weapon system.
 *
 * Extracted from rpg-weapon-ships.ts to keep that file focused on the
 * sapphire ship system. This module owns the full lifecycle of amethyst
 * companion ships:
 *
 *   • Amethyst ships — distribute across the furthest enemies; fire slow
 *     spiraling pierce lasers that track their original target.
 *
 * The factory `createAmethystShipSystem(ctx)` receives an `AmethystShipCtx`
 * dependency-injection object and returns an `AmethystShipHandle` exposing
 * ship/laser state arrays and per-frame update functions.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getScaledWeaponDamage } from '../../sim/rpg/rpg-state';
import { resolveWeaponDefinition, resolveCraftedWeaponModifiers } from '../../data/rpg/crafted-weapon-helpers';
import {
  AMETHYST_SHIP_FIRE_MS, AMETHYST_SHIP_ORBIT_RADIUS, AMETHYST_SHIP_MAX_SPEED, AMETHYST_SHIP_TRAIL_CAP,
  AMETHYST_LASER_DAMAGE_MULT, AMETHYST_LASER_INITIAL_RADIUS,
  AMETHYST_LASER_ANGULAR_SPEED, AMETHYST_LASER_DURATION_MS, AMETHYST_LASER_HIT_RADIUS, AMETHYST_LASER_TRAIL_CAP,
  AMETHYST_LASER_COLOR, AMETHYST_LASER_GLOW, AMETHYST_SHIP_ATTACK_RANGE,
} from './rpg-weapon-constants';
import {
  HIT_EFFECT_DURATION_MS, TARGET_FRAME_MS,
  FLUID_VEL_FRAME_TO_PX_S, FLUID_PROJECTILE_STRENGTH,
  FLUID_AMETHYST_R, FLUID_AMETHYST_G, FLUID_AMETHYST_B,
} from './rpg-constants';
import type { FluidImpulse } from './rpg-fluid';
import type { RpgPlayerStats, HitEffect, ClosestTarget } from './rpg-types';
import type { AmethystShip, AmethystLaser } from './rpg-enemy-types';
import { segmentIntersectsTopographicTerrain, type TopographicTerrainState } from './terrain/topographic-terrain';

// ── Module-level helpers ──────────────────────────────────────────────────

/** Appends the current position to a circular trail buffer. */
function updateShipTrail(
  x: number,
  y: number,
  trailX: Float64Array,
  trailY: Float64Array,
  state: { trailHead: number; trailCount: number },
): void {
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
    ?? target.nullstone?.maxHp ?? target.fracteryl?.maxHp ?? target.eigenstein?.maxHp ?? target.boss?.maxHp
    ?? target.lifeCell?.maxHp ?? target.lifeCoreColony?.coreMaxHp ?? 1;
}

// ── Dependency-injection context ──────────────────────────────────────────

/** Structural subset of ShipWeaponCtx containing only what the amethyst system needs. */
export interface AmethystShipCtx {
  mote: { x: number; y: number };
  rpgSimState: RpgSimState;
  playerStats: RpgPlayerStats;
  hitEffects: HitEffect[];
  fluid: { addForce(impulse: FluidImpulse): void };
  getEffectiveEquippedIds: () => Set<string>;
  findEquippedWeaponIdByEffect: (effectKind: string) => string | null;
  collectEnemyBodyTargets: () => ClosestTarget[];
  damageBodyTarget: (target: ClosestTarget, rawDamage: number, defPierceRatio: number, bypassShield: boolean) => number;
  spawnDamageNumber: (x: number, y: number, vx: number, vy: number, text: string, healthFraction: number, color: string) => void;
  withDamageSource: (weaponId: string | null, fn: () => void) => void;
  /** Returns current terrain state, or null if terrain is not active. */
  getTerrainState?: () => TopographicTerrainState | null;
}

// ── Handle returned to the caller ─────────────────────────────────────────

export interface AmethystShipHandle {
  readonly amethystShips: AmethystShip[];
  readonly amethystLasers: AmethystLaser[];
  syncAmethystShips: () => void;
  updateAmethystShips: (deltaMs: number) => void;
  updateAmethystLasers: (deltaMs: number) => void;
  reset: () => void;
}

// ── Factory ───────────────────────────────────────────────────────────────

export function createAmethystShipSystem(ctx: AmethystShipCtx): AmethystShipHandle {
  const {
    mote, rpgSimState, playerStats, hitEffects, fluid,
    getEffectiveEquippedIds, findEquippedWeaponIdByEffect,
    collectEnemyBodyTargets, damageBodyTarget, spawnDamageNumber,
  } = ctx;

  const amethystShips: AmethystShip[] = [];
  const amethystLasers: AmethystLaser[] = [];

  // ── Amethyst ship system ──────────────────────────────────────────

  /** Global cap: never allow more than this many amethyst ships total. */
  const MAX_AMETHYST_SHIPS = 16;

  /**
   * Syncs amethyst ships to match:
   *   1. Static amethystShip weapon tier (as before).
   *   2. Crafted weapons with amethystShipCount > 0.
   * Call when weapon equip state changes.
   */
  function syncAmethystShips(): void {
    // Build desired list: (sourceWeaponId, count, baseDamage) tuples in equip order.
    const desired: Array<{ sourceWeaponId: string | null; count: number; baseDamage: number }> = [];

    for (const weaponId of getEffectiveEquippedIds()) {
      const wd = resolveWeaponDefinition(weaponId);
      if (wd?.stats.effect?.kind === 'amethystShip') {
        const tier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
        desired.push({ sourceWeaponId: null, count: tier, baseDamage: wd.stats.damage });
        break; // only one static amethystShip weapon slot
      }
    }

    for (const weaponId of getEffectiveEquippedIds()) {
      const mods = resolveCraftedWeaponModifiers(weaponId);
      if (!mods || mods.amethystShipCount <= 0) continue;
      const wd = resolveWeaponDefinition(weaponId);
      const baseDamage = wd?.stats.damage ?? 0;
      desired.push({ sourceWeaponId: weaponId, count: mods.amethystShipCount, baseDamage });
    }

    // Flatten desired into ordered slots, applying the global cap.
    const slots: Array<{ sourceWeaponId: string | null; baseDamage: number }> = [];
    for (const { sourceWeaponId, count, baseDamage } of desired) {
      for (let i = 0; i < count && slots.length < MAX_AMETHYST_SHIPS; i++) {
        slots.push({ sourceWeaponId, baseDamage });
      }
    }

    // Trim excess ships.
    while (amethystShips.length > slots.length) amethystShips.pop();

    // Add new ships for new slots.
    while (amethystShips.length < slots.length) {
      const idx = amethystShips.length;
      const total = slots.length;
      const angle = (idx / total) * Math.PI * 2;
      const slot = slots[idx]!;
      amethystShips.push({
        x: mote.x + Math.cos(angle) * AMETHYST_SHIP_ORBIT_RADIUS,
        y: mote.y + Math.sin(angle) * AMETHYST_SHIP_ORBIT_RADIUS,
        vx: 0, vy: 0,
        orbitAngle: angle,
        fireCooldownMs: Math.random() * AMETHYST_SHIP_FIRE_MS,
        baseDamage: slot.baseDamage,
        sourceWeaponId: slot.sourceWeaponId,
        trailX: new Float64Array(AMETHYST_SHIP_TRAIL_CAP),
        trailY: new Float64Array(AMETHYST_SHIP_TRAIL_CAP),
        trailHead: 0, trailCount: 0,
      });
    }

    // Refresh baseDamage and sourceWeaponId for existing ships in case tiers changed.
    for (let i = 0; i < amethystShips.length; i++) {
      const slot = slots[i]!;
      amethystShips[i]!.baseDamage = slot.baseDamage;
      amethystShips[i]!.sourceWeaponId = slot.sourceWeaponId;
    }
  }

  /**
   * Updates amethyst ships: orbit around furthest enemy (or player),
   * fire spiraling pierce lasers every 3 seconds.
   */
  function updateAmethystShips(deltaMs: number): void {
    if (amethystShips.length === 0) return;
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const targets = collectEnemyBodyTargets().sort((a, b) => b.distSq - a.distSq);

    for (let i = 0; i < amethystShips.length; i++) {
      const ship = amethystShips[i];
      const target = targets.length > 0 ? targets[i % targets.length] : null;
      const targetX = target ? target.x : mote.x;
      const targetY = target ? target.y : mote.y;
      ship.orbitAngle += 1.7 * (deltaMs / 1000);
      const angleOffset = (i / amethystShips.length) * Math.PI * 2;
      const desiredX = targetX + Math.cos(ship.orbitAngle + angleOffset) * AMETHYST_SHIP_ORBIT_RADIUS;
      const desiredY = targetY + Math.sin(ship.orbitAngle + angleOffset) * AMETHYST_SHIP_ORBIT_RADIUS;

      const dx = desiredX - ship.x;
      const dy = desiredY - ship.y;
      const moveSpeed = AMETHYST_SHIP_MAX_SPEED * dt;
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
      updateShipTrail(ship.x, ship.y, ship.trailX, ship.trailY, ship);

      ship.fireCooldownMs -= deltaMs;
      if (ship.fireCooldownMs <= 0 && target) {
        const dxFire = target.x - ship.x, dyFire = target.y - ship.y;
        const inRange = dxFire * dxFire + dyFire * dyFire <= AMETHYST_SHIP_ATTACK_RANGE * AMETHYST_SHIP_ATTACK_RANGE;
        if (inRange) {
          ship.fireCooldownMs += AMETHYST_SHIP_FIRE_MS;
          spawnAmethystLaser(ship, target);
        }
        // When out of range the cooldown stays ≤0 so the ship fires as soon as it closes in.
      }
    }
  }

  /**
   * Spawns an amethyst laser from a ship toward a target enemy.
   * Damage is attributed to ship.sourceWeaponId (crafted) or the static amethystShip weapon.
   */
  function spawnAmethystLaser(ship: AmethystShip, target: ClosestTarget): void {
    const angle = Math.atan2(ship.y - target.y, ship.x - target.x);

    const resolvedSourceId = ship.sourceWeaponId ?? findEquippedWeaponIdByEffect('amethystShip');
    const tier = resolvedSourceId ? (rpgSimState.weaponTiersByWeaponId.get(resolvedSourceId) ?? 1) : 1;
    const scaledDamage = getScaledWeaponDamage(ship.baseDamage, tier, playerStats.atk) * AMETHYST_LASER_DAMAGE_MULT;

    amethystLasers.push({
      x: target.x + Math.cos(angle) * AMETHYST_LASER_INITIAL_RADIUS,
      y: target.y + Math.sin(angle) * AMETHYST_LASER_INITIAL_RADIUS,
      centerX: target.x,
      centerY: target.y,
      radius: AMETHYST_LASER_INITIAL_RADIUS,
      angle,
      lifeMs: AMETHYST_LASER_DURATION_MS,
      scaledDamage,
      sourceWeaponId: ship.sourceWeaponId,
      piercedEnemies: new Set(),
      targetEnemy: target.boss ?? target.eigenstein ?? target.fracteryl ?? target.nullstone ?? target.diamond
        ?? target.amethyst ?? target.iolite ?? target.citrine ?? target.sunstone ?? target.ruby
        ?? target.quartz ?? target.void ?? target.amber ?? target.emerald ?? target.sapphire ?? target.laser ?? null,
      trailX: new Float64Array(AMETHYST_LASER_TRAIL_CAP),
      trailY: new Float64Array(AMETHYST_LASER_TRAIL_CAP),
      trailHead: 0,
      trailCount: 0,
    });
  }

  /**
   * Updates amethyst lasers: move with spiral, pierce through enemies.
   * Each laser is updated inside withDamageSource for its own source weapon.
   */
  function updateAmethystLasers(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const terrain = ctx.getTerrainState ? ctx.getTerrainState() : null;
    const staticWeaponId = findEquippedWeaponIdByEffect('amethystShip');
    const liveTargets = collectEnemyBodyTargets();

    for (let i = amethystLasers.length - 1; i >= 0; i--) {
      const laser = amethystLasers[i]!;
      const sourceId = laser.sourceWeaponId ?? staticWeaponId;
      let remove = false;

      ctx.withDamageSource(sourceId, () => {
        laser.lifeMs -= deltaMs;

        const targetStillAlive = laser.targetEnemy === null || liveTargets.some(t =>
          t.laser === laser.targetEnemy || t.sapphire === laser.targetEnemy || t.emerald === laser.targetEnemy ||
          t.amber === laser.targetEnemy || t.void === laser.targetEnemy || t.quartz === laser.targetEnemy ||
          t.ruby === laser.targetEnemy || t.sunstone === laser.targetEnemy || t.citrine === laser.targetEnemy ||
          t.iolite === laser.targetEnemy || t.amethyst === laser.targetEnemy || t.diamond === laser.targetEnemy ||
          t.nullstone === laser.targetEnemy || t.fracteryl === laser.targetEnemy || t.eigenstein === laser.targetEnemy ||
          t.boss === laser.targetEnemy
        );
        if (!targetStillAlive) { remove = true; return; }

        if (laser.targetEnemy && 'x' in laser.targetEnemy && 'y' in laser.targetEnemy) {
          const targetPos = laser.targetEnemy as { x: number; y: number };
          laser.centerX = targetPos.x;
          laser.centerY = targetPos.y;
        }
        laser.angle += AMETHYST_LASER_ANGULAR_SPEED * dt;
        laser.radius = Math.max(0, laser.radius - (AMETHYST_LASER_INITIAL_RADIUS / (AMETHYST_LASER_DURATION_MS / TARGET_FRAME_MS)) * dt);
        const prevX = laser.x, prevY = laser.y;
        laser.x = laser.centerX + Math.cos(laser.angle) * laser.radius;
        laser.y = laser.centerY + Math.sin(laser.angle) * laser.radius;

        if (terrain && segmentIntersectsTopographicTerrain(terrain, prevX, prevY, laser.x, laser.y)) {
          remove = true; return;
        }

        updateShipTrail(laser.x, laser.y, laser.trailX, laser.trailY, laser);

        if (laser.radius > 1) {
          const tangentX = -Math.sin(laser.angle);
          const tangentY =  Math.cos(laser.angle);
          const dxC = laser.centerX - laser.x;
          const dyC = laser.centerY - laser.y;
          const rr  = Math.sqrt(dxC * dxC + dyC * dyC) || 1;
          const inwardX = dxC / rr;
          const inwardY = dyC / rr;
          const spiralSpeed = laser.radius * AMETHYST_LASER_ANGULAR_SPEED * FLUID_VEL_FRAME_TO_PX_S;
          fluid.addForce({
            x: laser.x, y: laser.y,
            vx: (tangentX * 0.6 + inwardX * 0.4) * spiralSpeed,
            vy: (tangentY * 0.6 + inwardY * 0.4) * spiralSpeed,
            r: FLUID_AMETHYST_R, g: FLUID_AMETHYST_G, b: FLUID_AMETHYST_B,
            strength: FLUID_PROJECTILE_STRENGTH,
          });
        }

        let hitIntendedTarget = false;
        for (const target of liveTargets) {
          const targetObj = target.boss ?? target.eigenstein ?? target.fracteryl ?? target.nullstone ?? target.diamond
            ?? target.amethyst ?? target.iolite ?? target.citrine ?? target.sunstone ?? target.ruby
            ?? target.quartz ?? target.void ?? target.amber ?? target.emerald ?? target.sapphire ?? target.laser ?? null;
          if (targetObj !== laser.targetEnemy && targetObj !== null && laser.piercedEnemies.has(targetObj)) continue;
          const dx = target.x - laser.x, dy = target.y - laser.y;
          if (dx * dx + dy * dy > AMETHYST_LASER_HIT_RADIUS * AMETHYST_LASER_HIT_RADIUS) continue;
          if (targetObj !== null) laser.piercedEnemies.add(targetObj);
          const dmg = damageBodyTarget(target, laser.scaledDamage, 0.5, true);
          if (dmg > 0) {
            spawnDamageNumber(target.x, target.y, 0, -1, String(Math.round(dmg)), dmg / Math.max(1, getTargetMaxHp(target)), AMETHYST_LASER_COLOR);
            hitEffects.push({ x: target.x, y: target.y, timerMs: HIT_EFFECT_DURATION_MS, color: AMETHYST_LASER_GLOW });
          }
          if (targetObj === laser.targetEnemy) hitIntendedTarget = true;
        }

        if (hitIntendedTarget || laser.lifeMs <= 0 || laser.radius <= 0) {
          remove = true;
        }
      });

      if (remove) amethystLasers.splice(i, 1);
    }
  }

  // ── Handle ────────────────────────────────────────────────────────

  return {
    get amethystShips() { return amethystShips; },
    get amethystLasers() { return amethystLasers; },
    syncAmethystShips,
    updateAmethystShips,
    updateAmethystLasers,
    reset(): void {
      amethystShips.length = 0;
      amethystLasers.length = 0;
    },
  };
}
