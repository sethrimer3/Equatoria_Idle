/**
 * rpg-weapon-ships.ts — Companion ship weapon systems for the RPG tab.
 *
 * Extracted from rpg-weapon-systems.ts to keep that module focused on
 * single-projectile and melee weapons. This module owns the full lifecycle
 * of both companion ship types:
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
  HIT_EFFECT_DURATION_MS, TARGET_FRAME_MS,
  SAPPHIRE_SHIP_FIRE_MS, SAPPHIRE_SHIP_ORBIT_RADIUS, SAPPHIRE_SHIP_MAX_SPEED,
  SAPPHIRE_SHIP_LASER_RANGE, SAPPHIRE_SHIP_TRAIL_CAP,
  SAPPHIRE_LASER_SPEED, SAPPHIRE_LASER_LIFE_MS, SAPPHIRE_LASER_HIT_RADIUS,
  SAPPHIRE_LASER_TRAIL_CAP, SAPPHIRE_LASER_COLOR, SAPPHIRE_LASER_GLOW, SAPPHIRE_LASER_SPREAD_RAD,
  SAPPHIRE_LASER_CURVE_RATE, SAPPHIRE_LASER_LATERAL_VEL, SAPPHIRE_LASER_LATERAL_DECAY,
  AMETHYST_SHIP_FIRE_MS, AMETHYST_SHIP_ORBIT_RADIUS, AMETHYST_SHIP_MAX_SPEED, AMETHYST_SHIP_TRAIL_CAP,
  AMETHYST_LASER_DAMAGE_MULT, AMETHYST_LASER_INITIAL_RADIUS,
  AMETHYST_LASER_ANGULAR_SPEED, AMETHYST_LASER_DURATION_MS, AMETHYST_LASER_HIT_RADIUS, AMETHYST_LASER_TRAIL_CAP,
  AMETHYST_LASER_COLOR, AMETHYST_LASER_GLOW, AMETHYST_SHIP_ATTACK_RANGE,
} from './rpg-constants';
import type { RpgPlayerStats, HitEffect, ClosestTarget } from './rpg-types';
import type { SapphireShip, SapphireLaser, AmethystShip, AmethystLaser } from './rpg-enemy-types';

// ── Dependency-injection context ──────────────────────────────────────────

/** Structural subset of RpgWeaponCtx containing only what ship systems need. */
export interface ShipWeaponCtx {
  mote: { x: number; y: number };
  dim: { w: number; h: number };
  rpgSimState: RpgSimState;
  playerStats: RpgPlayerStats;
  hitEffects: HitEffect[];
  getEffectiveEquippedIds: () => Set<string>;
  findEquippedWeaponIdByEffect: (effectKind: string) => string | null;
  findClosestEnemyFrom: (x: number, y: number, rangeSq: number) => ClosestTarget | null;
  getTargetedEnemy: () => ClosestTarget | null;
  collectEnemyBodyTargets: () => ClosestTarget[];
  damageBodyTarget: (target: ClosestTarget, rawDamage: number, defPierceRatio: number, bypassShield: boolean) => number;
  spawnDamageNumber: (x: number, y: number, vx: number, vy: number, text: string, healthFraction: number, color: string) => void;
  withDamageSource: (weaponId: string | null, fn: () => void) => void;
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
    mote, dim, rpgSimState, playerStats, hitEffects,
    getEffectiveEquippedIds, findEquippedWeaponIdByEffect,
    findClosestEnemyFrom, getTargetedEnemy, collectEnemyBodyTargets,
    damageBodyTarget, spawnDamageNumber,
  } = ctx;

  const sapphireShips: SapphireShip[] = [];
  const sapphireLasers: SapphireLaser[] = [];
  const amethystShips: AmethystShip[] = [];
  const amethystLasers: AmethystLaser[] = [];

  // ── Helpers ──────────────────────────────────────────────────────

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
      ?? target.nullstone?.maxHp ?? target.fracteryl?.maxHp ?? target.eigenstein?.maxHp ?? target.boss?.maxHp ?? 1;
  }

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
      updateShipTrail(ship.x, ship.y, ship.trailX, ship.trailY, ship);

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
        laser.x += (laser.vx + laser.lateralVx) * dt;
        laser.y += (laser.vy + laser.lateralVy) * dt;
        laser.lateralVx *= Math.pow(SAPPHIRE_LASER_LATERAL_DECAY, dt);
        laser.lateralVy *= Math.pow(SAPPHIRE_LASER_LATERAL_DECAY, dt);
        updateShipTrail(laser.x, laser.y, laser.trailX, laser.trailY, laser);

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

        if (laser.lifeMs <= 0 || laser.x < -50 || laser.x > dim.w + 50 || laser.y < -50 || laser.y > dim.h + 50) {
          sapphireLasers.splice(i, 1);
        }
      }
    });
  }

  // ── Amethyst ship system ──────────────────────────────────────────

  /**
   * Syncs amethyst ships to match equipped weapon tier.
   * Call when weapon equip state changes.
   */
  function syncAmethystShips(): void {
    let equippedTier = 0;
    let baseDamage = 0;
    for (const weaponId of getEffectiveEquippedIds()) {
      const wd = WEAPON_BY_ID.get(weaponId);
      if (wd?.stats.effect?.kind === 'amethystShip') {
        equippedTier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
        baseDamage = wd.stats.damage;
        break;
      }
    }

    while (amethystShips.length > equippedTier) amethystShips.pop();
    while (amethystShips.length < equippedTier) {
      const angle = (amethystShips.length / equippedTier) * Math.PI * 2;
      amethystShips.push({
        x: mote.x + Math.cos(angle) * AMETHYST_SHIP_ORBIT_RADIUS,
        y: mote.y + Math.sin(angle) * AMETHYST_SHIP_ORBIT_RADIUS,
        vx: 0,
        vy: 0,
        orbitAngle: angle,
        fireCooldownMs: Math.random() * AMETHYST_SHIP_FIRE_MS,
        baseDamage,
        trailX: new Float64Array(AMETHYST_SHIP_TRAIL_CAP),
        trailY: new Float64Array(AMETHYST_SHIP_TRAIL_CAP),
        trailHead: 0,
        trailCount: 0,
      });
    }
    for (const ship of amethystShips) ship.baseDamage = baseDamage;
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
   */
  function spawnAmethystLaser(ship: AmethystShip, target: ClosestTarget): void {
    const angle = Math.atan2(ship.y - target.y, ship.x - target.x);

    // Calculate damage based on weapon tier (30× base damage)
    const weaponId = findEquippedWeaponIdByEffect('amethystShip');
    const tier = weaponId ? (rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1) : 1;
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
   */
  function updateAmethystLasers(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const weaponId = findEquippedWeaponIdByEffect('amethystShip');
    ctx.withDamageSource(weaponId, () => {
      const liveTargets = collectEnemyBodyTargets();
      for (let i = amethystLasers.length - 1; i >= 0; i--) {
        const laser = amethystLasers[i];
        laser.lifeMs -= deltaMs;
        const targetStillAlive = laser.targetEnemy === null || liveTargets.some(t =>
          t.laser === laser.targetEnemy || t.sapphire === laser.targetEnemy || t.emerald === laser.targetEnemy ||
          t.amber === laser.targetEnemy || t.void === laser.targetEnemy || t.quartz === laser.targetEnemy ||
          t.ruby === laser.targetEnemy || t.sunstone === laser.targetEnemy || t.citrine === laser.targetEnemy ||
          t.iolite === laser.targetEnemy || t.amethyst === laser.targetEnemy || t.diamond === laser.targetEnemy ||
          t.nullstone === laser.targetEnemy || t.fracteryl === laser.targetEnemy || t.eigenstein === laser.targetEnemy ||
          t.boss === laser.targetEnemy
        );
        if (!targetStillAlive) {
          amethystLasers.splice(i, 1);
          continue;
        }

        if (laser.targetEnemy && 'x' in laser.targetEnemy && 'y' in laser.targetEnemy) {
          const targetPos = laser.targetEnemy as { x: number; y: number };
          laser.centerX = targetPos.x;
          laser.centerY = targetPos.y;
        }
        laser.angle += AMETHYST_LASER_ANGULAR_SPEED * dt;
        laser.radius = Math.max(0, laser.radius - (AMETHYST_LASER_INITIAL_RADIUS / (AMETHYST_LASER_DURATION_MS / TARGET_FRAME_MS)) * dt);
        laser.x = laser.centerX + Math.cos(laser.angle) * laser.radius;
        laser.y = laser.centerY + Math.sin(laser.angle) * laser.radius;
        updateShipTrail(laser.x, laser.y, laser.trailX, laser.trailY, laser);

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
          amethystLasers.splice(i, 1);
        }
      }
    });
  }

  // ── Handle ────────────────────────────────────────────────────────

  return {
    get sapphireShips() { return sapphireShips; },
    get sapphireLasers() { return sapphireLasers; },
    get amethystShips() { return amethystShips; },
    get amethystLasers() { return amethystLasers; },

    syncSapphireShips,
    syncAmethystShips,

    updateSapphireShips,
    updateSapphireLasers,
    updateAmethystShips,
    updateAmethystLasers,

    reset(): void {
      sapphireShips.length = 0;
      sapphireLasers.length = 0;
      amethystShips.length = 0;
      amethystLasers.length = 0;
    },
  };
}
