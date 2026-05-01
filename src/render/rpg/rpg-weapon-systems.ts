/**
 * rpg-weapon-systems.ts — All player weapon update logic for the RPG tab.
 *
 * Extracted from rpg-render.ts to keep the render module focused on
 * orchestration and drawing. Each weapon system (sand gatling, chain whip,
 * vortex, sword combo, poison bolt, emerald missile, sunstone mine, ruby laser
 * beam) is self-contained here.  Companion ship weapons (sapphire, amethyst)
 * are implemented in rpg-weapon-ships.ts and composed in via
 * createShipWeaponSystems().
 *
 * The factory function `createRpgWeaponSystems(ctx)` receives a
 * `RpgWeaponCtx` dependency-injection object that provides all external
 * state and callbacks needed by the weapon functions. It returns a
 * `RpgWeaponHandle` exposing weapon state arrays (for drawing) and
 * per-frame update functions (called by the main update loop).
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getScaledWeaponDamage, getScaledWeaponCooldown } from '../../sim/rpg/rpg-state';
import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import {
  HIT_EFFECT_DURATION_MS, TARGET_FRAME_MS,
  SAND_PROJ_SPEED, SAND_PROJ_LIFE_MS, SAND_PROJ_COLOR,
  CHAIN_NODES, CHAIN_NODE_COLOR,
  CHAIN_LASH_MS, CHAIN_RETRACT_MS, CHAIN_HIT_CD_MS,
  CHAIN_REST_LENGTH, CHAIN_SPRING_K, CHAIN_ANCHOR_K, CHAIN_RETRACT_ANCHOR_K,
  CHAIN_DAMPING, CHAIN_LASH_SPEED,
  LASER_BEAM_VISIBLE_MS, LASER_BEAM_COLOR, LASER_BEAM_GLOW,
  VORTEX_PULL_STRENGTH, VORTEX_DAMAGE_INTERVAL_MS, VORTEX_SPAWN_DIST,
  VORTEX_COLOR, VORTEX_SPIN_RATE,
  SWORD_SWING_MS, SWORD_COLOR, SWORD_PRISMATIC_COLORS, SAND_BLADE_COLORS,
  SWORD_SHARD_COUNT, SWORD_HINGE_SPRING_K, SWORD_HINGE_DAMPING,
  SWORD_SHARD_FOLLOW_BASE, SWORD_SHARD_FOLLOW_DECAY,
  SWORD_BEAM_DURATION_MS, SWORD_SWIPE_VISUAL_MS,
  SWORD_FLUID_DRAG_STR, SWORD_FLUID_SWIPE_STR, SWORD_DEFAULT_COOLDOWN_MS,
  SWORD_COMBO_THRESHOLD, SWORD_COMBO_WINDOW_MS, SWORD_COMBO_MIN_SWIPE_DELAY_MS, SWORD_COMBO_SPIN_TURNS,
  SWORD_COMBO_SPIN_MS, SWORD_COMBO_DAMAGE_MULT,
  POISON_ARMOR_IGNORE_PER_TIER, POISON_DURATION_BASE_TIER, POISON_DURATION_MS_PER_TIER,
  POISON_TOTAL_MULTIPLIER, POISON_BOLT_SPEED, POISON_BOLT_SIZE, POISON_BOLT_COLOR,
  POISON_BOLT_LIFE_MS, POISON_BOLT_TRAIL_CAP, POISON_TICK_INTERVAL_MS,
  BOSS_SIZE_BASE,
  FLUID_EXPLOSION_STRENGTH,
  FLUID_SAND_R, FLUID_SAND_G, FLUID_SAND_B,
  FLUID_CHAIN_R, FLUID_CHAIN_G, FLUID_CHAIN_B,
  FLUID_BEAM_R, FLUID_BEAM_G, FLUID_BEAM_B,
  FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B,
  EMERALD_MISSILE_SPEED, EMERALD_MISSILE_MAX_SPEED, EMERALD_MISSILE_SEEK_STR,
  EMERALD_MISSILE_TRAIL_CAP, EMERALD_MISSILE_COLOR, EMERALD_MISSILE_HIT_RADIUS,
  EMERALD_MISSILE_PROXIMITY_PX, EMERALD_MISSILE_DETECT_PX, EMERALD_MISSILE_NO_TARGET_MS,
  EMERALD_MISSILE_FIZZLE_DRAG, EMERALD_MISSILE_STOP_SPEED,
  EMERALD_MISSILE_SUB_BASE, EMERALD_MISSILE_SUB_PER_TIER,
  EMERALD_SUB_MISSILE_SPEED, EMERALD_SUB_MISSILE_MAX_SPEED, EMERALD_SUB_MISSILE_SEEK_STR,
  EMERALD_SUB_MISSILE_TRAIL_CAP, EMERALD_SUB_MISSILE_HIT_RADIUS,
  EMERALD_SUB_MISSILE_SQUIGGLE, EMERALD_SUB_MISSILE_SQUIGGLE_HZ,
  EMERALD_SUB_MISSILE_DETECT_PX,
  EMERALD_SUB_MISSILE_FUEL_MS, EMERALD_SUB_MISSILE_DECEL_START_MS,
  EMERALD_SUB_MISSILE_FIZZLE_DRAG, EMERALD_SUB_MISSILE_STOP_SPEED,
  EMERALD_SUB_MISSILE_POST_STOP_DELAY_MS,
  EMERALD_SUB_MISSILE_AOE_PX, EMERALD_SUB_MISSILE_DAMAGE_MULT,
  EMERALD_SUB_MISSILE_CONE_SPREAD,
  EMERALD_SWIRL_COUNT, EMERALD_SWIRL_LIFE_MS, EMERALD_SWIRL_SPEED, EMERALD_SWIRL_DRAG,
  SUNSTONE_MINE_FUSE_MS, SUNSTONE_MINE_PROXIMITY_PX, SUNSTONE_MINE_AOE_BASE_PX,
  SUNSTONE_MINE_AOE_PER_TIER_PX, SUNSTONE_MINE_HP, SUNSTONE_MINE_SIZE,
  FLUID_VEL_FRAME_TO_PX_S, FLUID_PROJECTILE_STRENGTH, FLUID_LASER_BEAM_STRENGTH,
  LASER_ENEMY_SIZE, SAPPHIRE_ENEMY_SIZE, SAPPHIRE_SHIELD_RADIUS, MISSILE_SIZE, SAND_PROJ_SIZE,
  BASE_ATTACK_TIMER_KEY,
} from './rpg-constants';
import {
  EMERALD_ENEMY_SIZE, AMBER_ENEMY_SIZE, AMBER_SHARD_SIZE,
  VOID_ENEMY_SIZE, QUARTZ_ENEMY_SIZE, QUARTZ_SPIKE_SIZE,
  RUBY_ENEMY_SIZE, RUBY_BOLT_SIZE,
  SUNSTONE_ENEMY_SIZE, CITRINE_ENEMY_SIZE, CITRINE_BOLT_SIZE,
  IOLITE_ENEMY_SIZE, AMETHYST_ENEMY_SIZE, AMETHYST_SHARD_SIZE,
  DIAMOND_ENEMY_SIZE, DIAMOND_SHARD_SIZE,
  NULLSTONE_ENEMY_SIZE, VOID_TENDRIL_SIZE,
  FRACTERYL_ENEMY_SIZE, EIGENSTEIN_ENEMY_SIZE,
} from './rpg-enemy-constants';
import {
  chainNodeRadius, chainNodeInvMass,
  getSwordLength, getShardDistances, wrapAngleDiff,
  getVortexTierRadius, getVortexTierDurationMs, getVortexCount,
} from './rpg-helpers';
import type { FluidImpulse } from './rpg-fluid';
import type { RpgPlayerStats } from './rpg-types';
import type {
  SandProjectile, ChainWhipState,
  LaserBeamEffect, NullstoneVortex, VortexWeaponState,
  SwordComboState,
  IolitePoisonBolt, PoisonDebuff,
  LaserEnemy, SapphireEnemy, SapphireMissile, HitEffect,
} from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy, AmberShard,
  VoidEnemy, QuartzEnemy, QuartzSpike,
  RubyEnemy, RubyBolt, SunstoneEnemy, CitrineEnemy, CitrineBolt,
  IoliteEnemy, AmethystEnemy, AmethystShard,
  DiamondEnemy, DiamondShard, NullstoneEnemy, VoidTendril,
  FracterylEnemy, FracterylShard, EigensteinEnemy,
  BossEnemy,
  EmeraldPlayerMissile, EmeraldSubMissile, EmeraldSwirlParticle,
  SunstoneMine,
  SapphireShip, SapphireLaser,
  AmethystShip, AmethystLaser,
} from './rpg-enemy-types';
import type { ClosestTarget } from './rpg-types';
import { createShipWeaponSystems } from './rpg-weapon-ships';

// ── Dependency-injection context passed in from rpg-render.ts ─────────────

export interface RpgWeaponCtx {
  // Viewport dimensions (updated on resize)
  dim: { w: number; h: number };

  // Player mote (live object reference — x/y are mutated by physics)
  mote: { x: number; y: number };

  // Live getter properties (values change each frame)
  readonly bossEnemy: BossEnemy | null;
  readonly playerAimAngle: number;

  // Player and sim state
  playerStats: RpgPlayerStats;
  rpgSimState: RpgSimState;

  // Enemy arrays (live references — mutations via damage functions, removals via removeDeadEnemies)
  enemies: LaserEnemy[];
  sapphireEnemies: SapphireEnemy[];
  sapphireMissiles: SapphireMissile[];
  emeraldEnemies: EmeraldEnemy[];
  amberEnemies: AmberEnemy[];
  amberShards: AmberShard[];
  voidEnemies: VoidEnemy[];
  quartzEnemies: QuartzEnemy[];
  quartzSpikes: QuartzSpike[];
  rubyEnemies: RubyEnemy[];
  rubyBolts: RubyBolt[];
  sunstoneEnemies: SunstoneEnemy[];
  citrineEnemies: CitrineEnemy[];
  citrineBolts: CitrineBolt[];
  ioliteEnemies: IoliteEnemy[];
  amethystEnemies: AmethystEnemy[];
  amethystShards: AmethystShard[];
  diamondEnemies: DiamondEnemy[];
  diamondShards: DiamondShard[];
  nullstoneEnemies: NullstoneEnemy[];
  voidTendrils: VoidTendril[];
  fracterylEnemies: FracterylEnemy[];
  fracterylShards: FracterylShard[];
  eigensteinEnemies: EigensteinEnemy[];

  // Hit effects array (weapon functions push directly into this array)
  hitEffects: HitEffect[];

  // Per-enemy damage functions (from createDamageFns)
  damageEnemy: (enemy: LaserEnemy, dmg: number, armorMult: number) => number;
  damageSapphireEnemy: (enemy: SapphireEnemy, dmg: number, armorMult: number, isImpact: boolean) => number;
  damageMissile: (missile: SapphireMissile, dmg: number) => number;
  damageEmeraldEnemy: (enemy: EmeraldEnemy, dmg: number, armorMult: number) => number;
  damageAmberEnemy: (enemy: AmberEnemy, dmg: number, armorMult: number) => number;
  damageAmberShard: (shard: AmberShard, dmg: number) => number;
  damageVoidEnemy: (enemy: VoidEnemy, dmg: number, armorMult: number) => number;
  damageQuartzEnemy: (enemy: QuartzEnemy, dmg: number, armorMult: number) => number;
  damageQuartzSpike: (spike: QuartzSpike, dmg: number) => number;
  damageRubyEnemy: (enemy: RubyEnemy, dmg: number, armorMult: number) => number;
  damageRubyBolt: (bolt: RubyBolt, dmg: number) => number;
  damageSunstoneEnemy: (enemy: SunstoneEnemy, dmg: number, armorMult: number) => number;
  damageCitrineEnemy: (enemy: CitrineEnemy, dmg: number, armorMult: number) => number;
  damageCitrineBolt: (bolt: CitrineBolt, dmg: number) => number;
  damageIoliteEnemy: (enemy: IoliteEnemy, dmg: number, armorMult: number) => number;
  damageAmethystEnemy: (enemy: AmethystEnemy, dmg: number, armorMult: number, isImpact: boolean) => number;
  damageAmethystShard: (shard: AmethystShard, dmg: number) => number;
  damageDiamondEnemy: (enemy: DiamondEnemy, dmg: number, armorMult: number) => number;
  damageDiamondShard: (shard: DiamondShard, dmg: number) => number;
  damageNullstoneEnemy: (enemy: NullstoneEnemy, dmg: number, armorMult: number) => number;
  damageVoidTendril: (tendril: VoidTendril, dmg: number) => number;
  damageFracterylEnemy: (enemy: FracterylEnemy, dmg: number, armorMult: number) => number;
  damageFracterylShard: (shard: FracterylShard, dmg: number) => number;
  damageEigensteinEnemy: (enemy: EigensteinEnemy, dmg: number, armorMult: number) => number;
  damageBossEnemy: (rawDamage: number, defPierceRatio: number, fromDiamondBlade?: boolean) => number;

  // Generic multi-type targeting and damage
  damageBodyTarget: (target: ClosestTarget, rawDamage: number, defPierceRatio: number, bypassShield: boolean) => number;
  findClosestTarget: (rangeSq: number) => ClosestTarget | null;
  findClosestEnemy: (rangeSq: number) => { x: number; y: number } | null;
  collectEnemyBodyTargets: () => ClosestTarget[];
  findClosestEnemyFrom: (x: number, y: number, rangeSq: number) => ClosestTarget | null;
  getTargetedEnemy: () => ClosestTarget | null;

  // Visual spawners
  spawnDamageNumber: (x: number, y: number, vx: number, vy: number, text: string, healthFraction: number, color: string) => void;
  spawnHitVisuals: (enemy: LaserEnemy, dmg: number, color: string) => void;
  spawnHitVisualsAt: (x: number, y: number, maxHp: number, dmg: number, color: string) => void;

  // Fluid simulation
  fluid: {
    addForce(impulse: FluidImpulse): void;
    addExplosion(x: number, y: number, strength: number, r: number, g: number, b: number): void;
  };

  // Game-flow callbacks
  removeDeadEnemies: () => void;
  checkWaveCompletion: () => void;

  // Stats-panel damage attribution wrapper (wraps a block so DPS is attributed to a weapon)
  withDamageSource: (weaponId: string | null, fn: () => void) => void;

  // Weapon utility
  findEquippedWeaponIdByEffect: (effectKind: string) => string | null;
  getCachedLuckPercent: () => number;
  getEffectiveEquippedIds: () => Set<string>;
}

// ── Weapon system handle returned to rpg-render.ts ────────────────────────

export interface RpgWeaponHandle {
  // Weapon state arrays — exposed for draw calls and applyEquipmentStats
  readonly sandProjectiles: SandProjectile[];
  readonly chainWhipStates: Map<string, ChainWhipState>;
  readonly activeVortexes: NullstoneVortex[];
  readonly vortexWeaponStates: Map<string, VortexWeaponState>;
  readonly swordComboStates: Map<string, SwordComboState>;
  readonly poisonBolts: IolitePoisonBolt[];
  readonly emeraldPlayerMissiles: EmeraldPlayerMissile[];
  readonly emeraldSubMissiles: EmeraldSubMissile[];
  readonly emeraldSwirlParticles: EmeraldSwirlParticle[];
  readonly sunstoneMines: SunstoneMine[];
  readonly laserBeamEffect: LaserBeamEffect | null;
  readonly sapphireShips: SapphireShip[];
  readonly sapphireLasers: SapphireLaser[];
  readonly amethystShips: AmethystShip[];
  readonly amethystLasers: AmethystLaser[];

  // Per-frame update functions called by the main update loop
  updateSandProjectiles: (deltaMs: number) => void;
  updateChainWhip: (weaponId: string, deltaMs: number) => void;
  updateVortexWeapon: (weaponId: string, deltaMs: number) => void;
  updateVortexes: (deltaMs: number) => void;
  updateSwordCombo: (weaponId: string, deltaMs: number) => void;
  updatePoisonBolts: (deltaMs: number) => void;
  updatePoisonDebuffs: (deltaMs: number) => void;
  updateEmeraldPlayerMissiles: (deltaMs: number) => void;
  updateEmeraldSubMissiles: (deltaMs: number) => void;
  updateEmeraldSwirlParticles: (deltaMs: number) => void;
  updateSunstoneMines: (deltaMs: number) => void;
  updateLaserBeamEffect: (deltaMs: number) => void;
  updateSapphireShips: (deltaMs: number) => void;
  updateSapphireLasers: (deltaMs: number) => void;
  updateAmethystShips: (deltaMs: number) => void;
  updateAmethystLasers: (deltaMs: number) => void;
  /** Updates the sand blade when no weapon is equipped. */
  updateSandBlade: (deltaMs: number) => void;

  // Companion ship sync (called by applyEquipmentStats and notifyEquip)
  syncSapphireShips: () => void;
  syncAmethystShips: () => void;

  // Attack spawn functions called from performWeaponAttack in rpg-render.ts
  spawnSandProjectile: (targetX: number, targetY: number, damage: number) => void;
  spawnPoisonBolt: (targetX: number, targetY: number, weaponId: string, tier: number, damage: number) => void;
  spawnEmeraldMissile: (targetX: number, targetY: number, damage: number, tier: number) => void;
  fireLaserBeam: (targetX: number, targetY: number, weaponId: string) => void;
  layMine: (damage: number, tier: number) => void;

  // Reset all weapon state (called by doRestart in rpg-render.ts)
  reset: () => void;
}

// ── Factory ───────────────────────────────────────────────────────────────

/** Progress thresholds (0–1) at which the spin combo deals a damage tick. */
const SPIN_TICK_THRESHOLDS = [0, 0.5, 1.0] as const;

export function createRpgWeaponSystems(ctx: RpgWeaponCtx): RpgWeaponHandle {
  // Unpack stable references from ctx (arrays are live because objects are references).
  // For scalar live values (bossEnemy, playerAimAngle), access via ctx.xxx each call.
  const {
    enemies, sapphireEnemies, sapphireMissiles,
    emeraldEnemies, amberEnemies, amberShards,
    voidEnemies, quartzEnemies, quartzSpikes,
    rubyEnemies, rubyBolts, sunstoneEnemies,
    citrineEnemies, citrineBolts, ioliteEnemies,
    amethystEnemies, amethystShards, diamondEnemies, diamondShards,
    nullstoneEnemies, voidTendrils, fracterylEnemies, fracterylShards, eigensteinEnemies,
    damageEnemy, damageSapphireEnemy, damageMissile,
    damageEmeraldEnemy, damageAmberEnemy, damageAmberShard,
    damageVoidEnemy, damageQuartzEnemy, damageQuartzSpike,
    damageRubyEnemy, damageRubyBolt, damageSunstoneEnemy,
    damageCitrineEnemy, damageCitrineBolt, damageIoliteEnemy,
    damageAmethystEnemy, damageAmethystShard, damageDiamondEnemy,
    damageDiamondShard, damageNullstoneEnemy, damageVoidTendril,
    damageFracterylEnemy, damageFracterylShard, damageEigensteinEnemy,
    damageBossEnemy,
    findClosestEnemy,
    spawnDamageNumber, spawnHitVisualsAt,
    hitEffects, fluid, rpgSimState, playerStats, mote, dim,
    removeDeadEnemies, checkWaveCompletion,
  } = ctx;

  // ── Companion ship sub-module ──────────────────────────────────
  const ships = createShipWeaponSystems(ctx);

  // ── Weapon state ───────────────────────────────────────────────
  const sandProjectiles: SandProjectile[] = [];
  const chainWhipStates: Map<string, ChainWhipState> = new Map();
  let laserBeamEffect: LaserBeamEffect | null = null;
  const activeVortexes: NullstoneVortex[] = [];
  const vortexWeaponStates: Map<string, VortexWeaponState> = new Map();
  const swordComboStates: Map<string, SwordComboState> = new Map();
  const poisonBolts: IolitePoisonBolt[] = [];
  const poisonDebuffs: Map<object, PoisonDebuff> = new Map();
  const emeraldPlayerMissiles: EmeraldPlayerMissile[] = [];
  const emeraldSubMissiles: EmeraldSubMissile[] = [];
  const emeraldSwirlParticles: EmeraldSwirlParticle[] = [];
  const sunstoneMines: SunstoneMine[] = [];

  // ── Sand gatling projectile system ─────────────────────────────

  function spawnSandProjectile(targetX: number, targetY: number, damage: number): void {
    const dx = targetX - mote.x, dy = targetY - mote.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) return;
    sandProjectiles.push({
      x: mote.x, y: mote.y,
      vx: (dx / dist) * SAND_PROJ_SPEED,
      vy: (dy / dist) * SAND_PROJ_SPEED,
      lifeMs: SAND_PROJ_LIFE_MS,
      scaledDamage: damage,
    });
  }

  function updateSandProjectiles(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);

    for (let i = sandProjectiles.length - 1; i >= 0; i--) {
      const p = sandProjectiles[i];
      const damage = p.scaledDamage;
      p.lifeMs -= deltaMs;
      if (p.lifeMs <= 0) { sandProjectiles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;

      // Inject sand-projectile motion into fluid.
      fluid.addForce({
        x: p.x, y: p.y,
        vx: p.vx * FLUID_VEL_FRAME_TO_PX_S,
        vy: p.vy * FLUID_VEL_FRAME_TO_PX_S,
        r: FLUID_SAND_R, g: FLUID_SAND_G, b: FLUID_SAND_B,
        strength: FLUID_PROJECTILE_STRENGTH,
      });

      // Bounds check
      if (p.x < 0 || p.x > dim.w || p.y < 0 || p.y > dim.h) {
        sandProjectiles.splice(i, 1); continue;
      }

      // Collision with laser enemies
      let hit = false;
      for (const e of enemies) {
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < (LASER_ENEMY_SIZE * 2) ** 2) {
          const dmg = damageEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with sapphire enemies
      for (const e of sapphireEnemies) {
        const hitR = SAPPHIRE_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageSapphireEnemy(e, damage, 0, false);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with missiles
      for (const m of sapphireMissiles) {
        const dx = p.x - m.x, dy = p.y - m.y;
        if (dx * dx + dy * dy < (MISSILE_SIZE * 2.5) ** 2) {
          const dmg = damageMissile(m, damage);
          spawnHitVisualsAt(m.x, m.y, m.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); break;
        }
      }
      if (hit) continue;

      // Collision with emerald enemies
      for (const e of emeraldEnemies) {
        const hitR = EMERALD_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageEmeraldEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with amber enemies
      for (const e of amberEnemies) {
        const hitR = AMBER_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageAmberEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with amber shards
      for (const s of amberShards) {
        const dx = p.x - s.x, dy = p.y - s.y;
        if (dx * dx + dy * dy < (AMBER_SHARD_SIZE * 2.5) ** 2) {
          const dmg = damageAmberShard(s, damage);
          spawnHitVisualsAt(s.x, s.y, s.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with void enemies
      for (const e of voidEnemies) {
        const hitR = VOID_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageVoidEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); break;
        }
      }
      if (hit) continue;

      // Collision with quartz enemies
      for (const e of quartzEnemies) {
        const hitR = QUARTZ_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageQuartzEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with quartz spikes
      for (const s of quartzSpikes) {
        const dx = p.x - s.x, dy = p.y - s.y;
        if (dx * dx + dy * dy < (QUARTZ_SPIKE_SIZE * 2.5) ** 2) {
          damageQuartzSpike(s, damage);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with ruby enemies
      for (const e of rubyEnemies) {
        const hitR = RUBY_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageRubyEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with ruby bolts
      for (const b of rubyBolts) {
        const dx = p.x - b.x, dy = p.y - b.y;
        if (dx * dx + dy * dy < (RUBY_BOLT_SIZE * 2.5) ** 2) {
          damageRubyBolt(b, damage);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with sunstone enemies
      for (const e of sunstoneEnemies) {
        const hitR = SUNSTONE_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageSunstoneEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with citrine enemies
      for (const e of citrineEnemies) {
        const hitR = CITRINE_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageCitrineEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with citrine bolts
      for (const b of citrineBolts) {
        const dx = p.x - b.x, dy = p.y - b.y;
        if (dx * dx + dy * dy < (CITRINE_BOLT_SIZE * 2.5) ** 2) {
          damageCitrineBolt(b, damage);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with iolite enemies
      for (const e of ioliteEnemies) {
        const hitR = IOLITE_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageIoliteEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with amethyst enemies
      for (const e of amethystEnemies) {
        const hitR = AMETHYST_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageAmethystEnemy(e, damage, 0, false);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with amethyst shards
      for (const s of amethystShards) {
        const dx = p.x - s.x, dy = p.y - s.y;
        if (dx * dx + dy * dy < (AMETHYST_SHARD_SIZE * 2.5) ** 2) {
          damageAmethystShard(s, damage);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with diamond enemies
      for (const e of diamondEnemies) {
        const hitR = DIAMOND_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageDiamondEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with diamond shards
      for (const s of diamondShards) {
        const dx = p.x - s.x, dy = p.y - s.y;
        if (dx * dx + dy * dy < (DIAMOND_SHARD_SIZE * 2.5) ** 2) {
          damageDiamondShard(s, damage);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with nullstone enemies
      for (const e of nullstoneEnemies) {
        const hitR = NULLSTONE_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageNullstoneEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with void tendrils
      for (const t of voidTendrils) {
        const dx = p.x - t.x, dy = p.y - t.y;
        if (dx * dx + dy * dy < (VOID_TENDRIL_SIZE * 2.5) ** 2) {
          damageVoidTendril(t, damage);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with fracteryl enemies and shards
      for (const e of fracterylEnemies) {
        const hitR = FRACTERYL_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageFracterylEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;
      for (const s of fracterylShards) {
        const dx = p.x - s.x, dy = p.y - s.y;
        if (dx * dx + dy * dy < (FRACTERYL_ENEMY_SIZE * 0.5 + SAND_PROJ_SIZE) ** 2) {
          damageFracterylShard(s, damage);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with eigenstein enemies
      for (const e of eigensteinEnemies) {
        const hitR = EIGENSTEIN_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageEigensteinEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with boss
      if (ctx.bossEnemy) {
        const bossHitSize = BOSS_SIZE_BASE + ctx.bossEnemy.bossId * 1.5;
        const hitR = bossHitSize / 2 + SAND_PROJ_SIZE;
        const dx = p.x - ctx.bossEnemy.x, dy = p.y - ctx.bossEnemy.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageBossEnemy(damage, 0);
          if (dmg > 0) spawnHitVisualsAt(ctx.bossEnemy.x, ctx.bossEnemy.y, ctx.bossEnemy.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1);
        }
      }
    }
  }


  // ── Quartz chain whip system ───────────────────────────────────

  function buildChainWhip(weaponId: string): ChainWhipState {
    const nodesX  = new Float64Array(CHAIN_NODES);
    const nodesY  = new Float64Array(CHAIN_NODES);
    const nodesVx = new Float64Array(CHAIN_NODES);
    const nodesVy = new Float64Array(CHAIN_NODES);
    for (let i = 0; i < CHAIN_NODES; i++) { nodesX[i] = mote.x; nodesY[i] = mote.y; }
    const weaponDef = WEAPON_BY_ID.get(weaponId);
    return {
      phase: 'idle',
      phaseMs: 0,
      cooldownMs: weaponDef?.stats.cooldownMs ?? 2500,
      targetX: mote.x, targetY: mote.y,
      nodesX, nodesY, nodesVx, nodesVy,
      hitCooldowns: new Map(),
    };
  }

  function updateChainWhipCooldowns(ws: ChainWhipState, deltaMs: number): void {
    for (const [key, cd] of ws.hitCooldowns) {
      const next = cd - deltaMs;
      if (next <= 0) ws.hitCooldowns.delete(key);
      else ws.hitCooldowns.set(key, next);
    }
  }

  /**
   * Advances the softbody spring physics for all chain nodes.
   * anchorK controls how strongly node 0 is pulled toward the player.
   */
  function stepChainPhysics(ws: ChainWhipState, dt: number, anchorK: number): void {
    // Node 0: spring anchor toward player (rest length 0)
    ws.nodesVx[0] += (mote.x - ws.nodesX[0]) * anchorK * chainNodeInvMass(0) * dt;
    ws.nodesVy[0] += (mote.y - ws.nodesY[0]) * anchorK * chainNodeInvMass(0) * dt;

    // Spring forces between adjacent pairs
    for (let i = 0; i < CHAIN_NODES - 1; i++) {
      const sdx = ws.nodesX[i + 1] - ws.nodesX[i];
      const sdy = ws.nodesY[i + 1] - ws.nodesY[i];
      const sdist = Math.sqrt(sdx * sdx + sdy * sdy);
      if (sdist < 0.001) continue;
      const stretch = sdist - CHAIN_REST_LENGTH;
      const fx = (sdx / sdist) * stretch * CHAIN_SPRING_K;
      const fy = (sdy / sdist) * stretch * CHAIN_SPRING_K;
      ws.nodesVx[i]     += fx * chainNodeInvMass(i)     * dt;
      ws.nodesVy[i]     += fy * chainNodeInvMass(i)     * dt;
      ws.nodesVx[i + 1] -= fx * chainNodeInvMass(i + 1) * dt;
      ws.nodesVy[i + 1] -= fy * chainNodeInvMass(i + 1) * dt;
    }

    // Integrate positions + apply damping
    const dampFactor = Math.pow(CHAIN_DAMPING, dt);
    for (let i = 0; i < CHAIN_NODES; i++) {
      ws.nodesVx[i] *= dampFactor;
      ws.nodesVy[i] *= dampFactor;
      ws.nodesX[i] += ws.nodesVx[i] * dt;
      ws.nodesY[i] += ws.nodesVy[i] * dt;
    }
  }

  function updateChainWhip(weaponId: string, deltaMs: number): void {
    const weaponDef = WEAPON_BY_ID.get(weaponId);
    if (!weaponDef || weaponDef.stats.effect?.kind !== 'chainWhip') {
      chainWhipStates.delete(weaponId);
      return;
    }
    if (!chainWhipStates.has(weaponId)) chainWhipStates.set(weaponId, buildChainWhip(weaponId));
    const ws = chainWhipStates.get(weaponId)!;
    const range = weaponDef.stats.range;
    const tier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const contactDamage = getScaledWeaponDamage(weaponDef.stats.damage, tier, playerStats.atk);

    updateChainWhipCooldowns(ws, deltaMs);

    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);

    if (ws.phase === 'idle') {
      // Soft anchor during idle — nodes settle back toward player
      stepChainPhysics(ws, dt, CHAIN_ANCHOR_K);
      ws.phaseMs += deltaMs;
      if (ws.phaseMs >= ws.cooldownMs) {
        const target = findClosestEnemy(range * range);
        if (target) {
          ws.targetX = target.x; ws.targetY = target.y;
          // Give the tip (CHAIN_NODES-1) a sudden velocity toward the target
          const tipX = ws.nodesX[CHAIN_NODES - 1], tipY = ws.nodesY[CHAIN_NODES - 1];
          const tdx = ws.targetX - tipX, tdy = ws.targetY - tipY;
          const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
          if (tdist > 0.01) {
            ws.nodesVx[CHAIN_NODES - 1] = (tdx / tdist) * CHAIN_LASH_SPEED;
            ws.nodesVy[CHAIN_NODES - 1] = (tdy / tdist) * CHAIN_LASH_SPEED;
          }
          ws.phase = 'lashing'; ws.phaseMs = 0;
        } else {
          ws.phaseMs = ws.cooldownMs;
        }
      }
    } else if (ws.phase === 'lashing') {
      ws.phaseMs += deltaMs;
      stepChainPhysics(ws, dt, CHAIN_ANCHOR_K);

      // Contact damage: check all nodes against all enemies
      const applyContactDamage = (tx: number, ty: number, target: LaserEnemy | SapphireEnemy | EmeraldEnemy | AmberEnemy | VoidEnemy | QuartzEnemy | RubyEnemy | SunstoneEnemy | CitrineEnemy | IoliteEnemy | AmethystEnemy | DiamondEnemy | NullstoneEnemy | FracterylEnemy | EigensteinEnemy): void => {
        const nodeR = chainNodeRadius(CHAIN_NODES - 1); // use tip radius for hit detection
        const r = nodeR + LASER_ENEMY_SIZE;
        const dx = tx - target.x, dy = ty - target.y;
        if (dx * dx + dy * dy < r * r) {
          if (!ws.hitCooldowns.has(target)) {
            let dmg = 0;
            // Sapphire is the only enemy type with `shieldHp` but without a `kind` discriminator.
            // Amethyst also has `shieldHp` but carries `kind: 'amethyst'`, so the `!('kind' in target)` check correctly excludes it.
            if ('shieldHp' in target && !('kind' in target)) {
              dmg = damageSapphireEnemy(target as SapphireEnemy, contactDamage, 0, false);
            } else if ('kind' in target) {
              const t = target as EmeraldEnemy | AmberEnemy | VoidEnemy | QuartzEnemy | RubyEnemy | SunstoneEnemy | CitrineEnemy | IoliteEnemy | AmethystEnemy | DiamondEnemy | NullstoneEnemy | FracterylEnemy | EigensteinEnemy;
              switch (t.kind) {
                case 'emerald':    dmg = damageEmeraldEnemy(t, contactDamage, 0); break;
                case 'amber':      dmg = damageAmberEnemy(t, contactDamage, 0); break;
                case 'void':       dmg = damageVoidEnemy(t, contactDamage, 0); break;
                case 'quartz':     dmg = damageQuartzEnemy(t, contactDamage, 0); break;
                case 'ruby':       dmg = damageRubyEnemy(t, contactDamage, 0); break;
                case 'sunstone':   dmg = damageSunstoneEnemy(t, contactDamage, 0); break;
                case 'citrine':    dmg = damageCitrineEnemy(t, contactDamage, 0); break;
                case 'iolite':     dmg = damageIoliteEnemy(t, contactDamage, 0); break;
                case 'amethyst':   dmg = damageAmethystEnemy(t, contactDamage, 0, false); break;
                case 'diamond':    dmg = damageDiamondEnemy(t, contactDamage, 0); break;
                case 'nullstone':  dmg = damageNullstoneEnemy(t, contactDamage, 0); break;
                case 'fracteryl':  dmg = damageFracterylEnemy(t, contactDamage, 0); break;
                case 'eigenstein': dmg = damageEigensteinEnemy(t, contactDamage, 0); break;
              }
            } else {
              dmg = damageEnemy(target as LaserEnemy, contactDamage, 0);
            }
            ws.hitCooldowns.set(target, CHAIN_HIT_CD_MS);
            hitEffects.push({ x: target.x, y: target.y, timerMs: HIT_EFFECT_DURATION_MS, color: CHAIN_NODE_COLOR });
            spawnDamageNumber(target.x, target.y, 0, -1, String(Math.round(dmg)), dmg / target.maxHp, CHAIN_NODE_COLOR);
          }
        }
      };
      for (let ni = 0; ni < CHAIN_NODES; ni++) {
        const nx = ws.nodesX[ni], ny = ws.nodesY[ni];
        for (const e of enemies)          applyContactDamage(nx, ny, e);
        for (const e of sapphireEnemies)  applyContactDamage(nx, ny, e);
        for (const e of emeraldEnemies)   applyContactDamage(nx, ny, e);
        for (const e of amberEnemies)     applyContactDamage(nx, ny, e);
        for (const e of voidEnemies)      applyContactDamage(nx, ny, e);
        for (const e of quartzEnemies)    applyContactDamage(nx, ny, e);
        for (const e of rubyEnemies)      applyContactDamage(nx, ny, e);
        for (const e of sunstoneEnemies)  applyContactDamage(nx, ny, e);
        for (const e of citrineEnemies)   applyContactDamage(nx, ny, e);
        for (const e of ioliteEnemies)    applyContactDamage(nx, ny, e);
        for (const e of amethystEnemies)  applyContactDamage(nx, ny, e);
        for (const e of diamondEnemies)   applyContactDamage(nx, ny, e);
        for (const e of nullstoneEnemies) applyContactDamage(nx, ny, e);
        for (const e of fracterylEnemies) applyContactDamage(nx, ny, e);
        for (const e of eigensteinEnemies) applyContactDamage(nx, ny, e);
      }
      // Apply chain whip damage to boss
      if (ctx.bossEnemy) {
        const bossHitR = BOSS_SIZE_BASE + ctx.bossEnemy.bossId * 1.5 + chainNodeRadius(CHAIN_NODES - 1);
        for (let ni = 0; ni < CHAIN_NODES; ni++) {
          const nx = ws.nodesX[ni], ny = ws.nodesY[ni];
          if (ws.hitCooldowns.has(ctx.bossEnemy)) break;
          const dx = nx - ctx.bossEnemy.x, dy = ny - ctx.bossEnemy.y;
          if (dx * dx + dy * dy < bossHitR * bossHitR) {
            const dmg = damageBossEnemy(contactDamage, 0);
            ws.hitCooldowns.set(ctx.bossEnemy, CHAIN_HIT_CD_MS);
            hitEffects.push({ x: ctx.bossEnemy.x, y: ctx.bossEnemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: CHAIN_NODE_COLOR });
            if (dmg > 0) spawnDamageNumber(ctx.bossEnemy.x, ctx.bossEnemy.y, 0, -1, String(Math.round(dmg)), dmg / ctx.bossEnemy.maxHp, CHAIN_NODE_COLOR);
          }
        }
      }

      // Inject fluid force along the chain length
      const tipDx = ws.targetX - mote.x;
      const tipDy = ws.targetY - mote.y;
      const tipDist = Math.sqrt(tipDx * tipDx + tipDy * tipDy);
      if (tipDist > 0.1) {
        for (let ni = 0; ni < CHAIN_NODES; ni++) {
          fluid.addForce({
            x: ws.nodesX[ni], y: ws.nodesY[ni],
            vx: (tipDx / tipDist) * FLUID_VEL_FRAME_TO_PX_S * 1.5,
            vy: (tipDy / tipDist) * FLUID_VEL_FRAME_TO_PX_S * 1.5,
            r: FLUID_CHAIN_R, g: FLUID_CHAIN_G, b: FLUID_CHAIN_B,
            strength: 1.2,
          });
        }
      }

      if (ws.phaseMs >= CHAIN_LASH_MS) { ws.phase = 'retracting'; ws.phaseMs = 0; }
    } else if (ws.phase === 'retracting') {
      ws.phaseMs += deltaMs;
      // Use stronger anchor spring to pull nodes back toward player
      stepChainPhysics(ws, dt, CHAIN_RETRACT_ANCHOR_K);
      if (ws.phaseMs >= CHAIN_RETRACT_MS) { ws.phase = 'idle'; ws.phaseMs = 0; }
    }
  }

  // ── Nullstone vortex system ────────────────────────────────────

  function fireVortex(weaponId: string, tier: number): void {
    const weaponDef = WEAPON_BY_ID.get(weaponId);
    const rawDamage = weaponDef
      ? getScaledWeaponDamage(weaponDef.stats.damage, tier, playerStats.atk)
      : playerStats.atk;
    const radiusPx    = getVortexTierRadius(tier);
    const durationMs  = getVortexTierDurationMs(tier);
    const count       = getVortexCount(tier);
    // Set the per-weapon cooldown to 2× duration before spawning vortexes.
    vortexWeaponStates.set(weaponId, { cooldownMs: durationMs * 2 });
    for (let i = 0; i < count; i++) {
      const angle = ctx.playerAimAngle + (i / count) * Math.PI * 2;
      activeVortexes.push({
        x: mote.x + Math.cos(angle) * VORTEX_SPAWN_DIST,
        y: mote.y + Math.sin(angle) * VORTEX_SPAWN_DIST,
        radiusPx,
        durationMs,
        maxDurationMs: durationMs,
        spinAngle: 0,
        damageTimerMs: VORTEX_DAMAGE_INTERVAL_MS,
        scaledDamage: rawDamage / 3,
        weaponId,
      });
    }
  }

  function updateVortexWeapon(weaponId: string, deltaMs: number): void {
    const tier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    if (!vortexWeaponStates.has(weaponId)) vortexWeaponStates.set(weaponId, { cooldownMs: 0 });
    const state = vortexWeaponStates.get(weaponId)!;
    state.cooldownMs -= deltaMs;
    if (state.cooldownMs <= 0) fireVortex(weaponId, tier);
  }

  /** Applies vortex damage to one enemy; shows a damage number if any dealt. */
  function applyVortexTickToEnemy<T extends { x: number; y: number; maxHp: number }>(
    vortex: NullstoneVortex,
    e: T,
    damageFn: (enemy: T, dmg: number, pierce: number) => number,
  ): void {
    const dx = e.x - vortex.x, dy = e.y - vortex.y;
    if (dx * dx + dy * dy > vortex.radiusPx * vortex.radiusPx) return;
    const dmg = damageFn(e, vortex.scaledDamage, 0);
    if (dmg > 0) spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, VORTEX_COLOR);
  }

  function updateVortexes(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const pull = VORTEX_PULL_STRENGTH * dt;

    for (let i = activeVortexes.length - 1; i >= 0; i--) {
      const v = activeVortexes[i];
      v.durationMs -= deltaMs;
      if (v.durationMs <= 0) { activeVortexes.splice(i, 1); continue; }

      v.spinAngle += VORTEX_SPIN_RATE * deltaMs / 1000;

      // Gravity pull — nudge each enemy toward the vortex center.
      const applyPull = (e: { x: number; y: number }) => {
        const dx = v.x - e.x, dy = v.y - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.01 && dist <= v.radiusPx) {
          e.x += (dx / dist) * pull;
          e.y += (dy / dist) * pull;
        }
      };
      for (const e of enemies)          applyPull(e);
      for (const e of sapphireEnemies)  applyPull(e);
      for (const e of emeraldEnemies)   applyPull(e);
      for (const e of amberEnemies)     applyPull(e);
      for (const e of voidEnemies)      applyPull(e);
      for (const e of quartzEnemies)    applyPull(e);
      for (const e of rubyEnemies)      applyPull(e);
      for (const e of sunstoneEnemies)  applyPull(e);
      for (const e of citrineEnemies)   applyPull(e);
      for (const e of ioliteEnemies)    applyPull(e);
      for (const e of amethystEnemies)  applyPull(e);
      for (const e of diamondEnemies)   applyPull(e);
      for (const e of nullstoneEnemies) applyPull(e);
      for (const e of fracterylEnemies) applyPull(e);
      for (const e of eigensteinEnemies) applyPull(e);
      if (ctx.bossEnemy) applyPull(ctx.bossEnemy);

      // Fluid inward swirl
      fluid.addForce({
        x: v.x, y: v.y, vx: 0, vy: 0,
        r: 150, g: 100, b: 200,
        strength: 0.4,
      });

      // Damage ticks
      v.damageTimerMs -= deltaMs;
      if (v.damageTimerMs <= 0) {
        v.damageTimerMs += VORTEX_DAMAGE_INTERVAL_MS;
        for (const e of enemies)          applyVortexTickToEnemy(v, e, damageEnemy);
        for (const e of sapphireEnemies)  applyVortexTickToEnemy(v, e, (en, dmg, p) => damageSapphireEnemy(en, dmg, p, false));
        for (const e of emeraldEnemies)   applyVortexTickToEnemy(v, e, damageEmeraldEnemy);
        for (const e of amberEnemies)     applyVortexTickToEnemy(v, e, damageAmberEnemy);
        for (const e of voidEnemies)      applyVortexTickToEnemy(v, e, damageVoidEnemy);
        for (const e of quartzEnemies)    applyVortexTickToEnemy(v, e, damageQuartzEnemy);
        for (const e of rubyEnemies)      applyVortexTickToEnemy(v, e, damageRubyEnemy);
        for (const e of sunstoneEnemies)  applyVortexTickToEnemy(v, e, damageSunstoneEnemy);
        for (const e of citrineEnemies)   applyVortexTickToEnemy(v, e, damageCitrineEnemy);
        for (const e of ioliteEnemies)    applyVortexTickToEnemy(v, e, damageIoliteEnemy);
        for (const e of amethystEnemies)  applyVortexTickToEnemy(v, e, (en, dmg, p) => damageAmethystEnemy(en, dmg, p, false));
        for (const e of diamondEnemies)   applyVortexTickToEnemy(v, e, damageDiamondEnemy);
        for (const e of nullstoneEnemies) applyVortexTickToEnemy(v, e, damageNullstoneEnemy);
        for (const e of fracterylEnemies) applyVortexTickToEnemy(v, e, (en, dmg, p) => damageFracterylEnemy(en, dmg, p));
        for (const e of eigensteinEnemies) applyVortexTickToEnemy(v, e, (en, dmg, p) => damageEigensteinEnemy(en, dmg, p));
        if (ctx.bossEnemy) {
          const bx = ctx.bossEnemy.x - v.x, by = ctx.bossEnemy.y - v.y;
          if (bx * bx + by * by <= v.radiusPx * v.radiusPx) {
            const dmg = damageBossEnemy(v.scaledDamage, 0);
            if (dmg > 0) spawnDamageNumber(ctx.bossEnemy.x, ctx.bossEnemy.y, 0, -1, String(Math.round(dmg)), dmg / ctx.bossEnemy.maxHp, VORTEX_COLOR);
          }
        }
        removeDeadEnemies();
        checkWaveCompletion();
      }
    }
  }

  // ── Diamond sword system ───────────────────────────────────────

  function buildSwordCombo(weaponId: string): SwordComboState {
    const weaponDef  = WEAPON_BY_ID.get(weaponId);
    const tier       = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const cooldownMs = getScaledWeaponCooldown(weaponDef?.stats.cooldownMs ?? SWORD_DEFAULT_COOLDOWN_MS, tier);
    const initAngle  = ctx.playerAimAngle + Math.PI / 2;
    return {
      phase: 'idle', phaseMs: 0, cooldownMs,
      hitThisSwing: new Set(),
      swordAngle: initAngle, swordAngularVel: 0,
      shardAngles: Array.from({ length: SWORD_SHARD_COUNT }, () => initAngle),
      swipeArcStart: 0, swipeArcEnd: 0,
      swipeEffects: [], beamEffects: [],
      swingIsRightToLeft: true,
      comboCount: 0,
      spinComboAngle: 0,
      spinComboDamageTicks: 0,
    };
  }

  /**
   * Returns true if angle `a` lies within the arc swept from `start` toward `end`
   * in the short (≤ 2π) direction.
   */
  function angleInArc(a: number, start: number, end: number): boolean {
    const diff = ((a - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const span = ((end - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    return diff <= span;
  }

  function swordHitInArc(
    state: SwordComboState,
    swordLength: number,
    rawDamage: number,
    arcStart: number,
    arcEnd: number,
    weaponId: string,
  ): void {
    const hitColor = SWORD_COLOR;
    const isDiamondBlade = weaponId === 'diamond_bastion';
    const check = <T extends { x: number; y: number; maxHp: number }>(
      e: T,
      damageFn: (enemy: T, dmg: number, pierce: number) => number,
    ) => {
      if (state.hitThisSwing.has(e)) return;
      const dx = e.x - mote.x, dy = e.y - mote.y;
      if (dx * dx + dy * dy > swordLength * swordLength) return;
      if (!angleInArc(Math.atan2(dy, dx), arcStart, arcEnd)) return;
      const dmg = damageFn(e, rawDamage, 1.0);
      state.hitThisSwing.add(e);
      hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: hitColor });
      spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, hitColor);
      // Spawn prismatic beam through the hit enemy.
      spawnSwordBeam(state, e.x, e.y, arcStart, arcEnd, swordLength);
    };
    for (const e of enemies)          check(e, damageEnemy);
    for (const e of sapphireEnemies)  check(e, (en, d, p) => damageSapphireEnemy(en, d, p, false));
    for (const e of emeraldEnemies)   check(e, damageEmeraldEnemy);
    for (const e of amberEnemies)     check(e, damageAmberEnemy);
    for (const e of voidEnemies)      check(e, damageVoidEnemy);
    for (const e of quartzEnemies)    check(e, damageQuartzEnemy);
    for (const e of rubyEnemies)      check(e, damageRubyEnemy);
    for (const e of sunstoneEnemies)  check(e, damageSunstoneEnemy);
    for (const e of citrineEnemies)   check(e, damageCitrineEnemy);
    for (const e of ioliteEnemies)    check(e, damageIoliteEnemy);
    for (const e of amethystEnemies)  check(e, (en, d, p) => damageAmethystEnemy(en, d, p, false));
    for (const e of diamondEnemies)   check(e, damageDiamondEnemy);
    for (const e of nullstoneEnemies) check(e, damageNullstoneEnemy);
    for (const e of fracterylEnemies) check(e, (en, d, p) => damageFracterylEnemy(en, d, p));
    for (const e of eigensteinEnemies) check(e, (en, d, p) => damageEigensteinEnemy(en, d, p));
    if (ctx.bossEnemy && !state.hitThisSwing.has(ctx.bossEnemy)) {
      const dx = ctx.bossEnemy.x - mote.x, dy = ctx.bossEnemy.y - mote.y;
      if (dx * dx + dy * dy <= swordLength * swordLength &&
          angleInArc(Math.atan2(dy, dx), arcStart, arcEnd)) {
        const dmg = damageBossEnemy(rawDamage, 1.0, isDiamondBlade);
        state.hitThisSwing.add(ctx.bossEnemy);
        if (dmg > 0) {
          hitEffects.push({ x: ctx.bossEnemy.x, y: ctx.bossEnemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: hitColor });
          spawnDamageNumber(ctx.bossEnemy.x, ctx.bossEnemy.y, 0, -1, String(Math.round(dmg)), dmg / ctx.bossEnemy.maxHp, hitColor);
          spawnSwordBeam(state, ctx.bossEnemy.x, ctx.bossEnemy.y, arcStart, arcEnd, swordLength);
        }
      }
    }
  }

  /**
   * Spawn a prismatic beam effect cutting across the enemy position.
   * The beam originates "out of thin air" beside the player, in the swipe direction.
   */
  function spawnSwordBeam(
    state: SwordComboState,
    enemyX: number, enemyY: number,
    arcStart: number, arcEnd: number,
    swordLength: number,
  ): void {
    // Direction of the cut: midpoint of the swipe arc.
    const midAngle = arcStart + wrapAngleDiff(arcEnd - arcStart) * 0.5;
    const dirX = Math.cos(midAngle);
    const dirY = Math.sin(midAngle);
    // Perpendicular offset so the beam appears slightly beside the player.
    const perpX = -dirY; const perpY = dirX;
    const perpOffset = 4; // px perpendicular offset
    // Position the beam so it passes through the enemy, extending from tail to past it.
    const beamLen = swordLength * 1.5;
    const halfLen = beamLen * 0.5;
    const beamCx = enemyX + perpX * perpOffset;
    const beamCy = enemyY + perpY * perpOffset;
    state.beamEffects.push({
      tailX: beamCx - dirX * halfLen,
      tailY: beamCy - dirY * halfLen,
      tipX:  beamCx + dirX * halfLen,
      tipY:  beamCy + dirY * halfLen,
      progress: 0,
      maxTimerMs: SWORD_BEAM_DURATION_MS,
    });
  }

  function updateSwordCombo(weaponId: string, deltaMs: number): void {
    if (!swordComboStates.has(weaponId)) swordComboStates.set(weaponId, buildSwordCombo(weaponId));
    const state      = swordComboStates.get(weaponId)!;
    const weaponDef  = WEAPON_BY_ID.get(weaponId);
    const tier       = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const rawDamage  = weaponDef
      ? getScaledWeaponDamage(weaponDef.stats.damage, tier, playerStats.atk)
      : playerStats.atk;
    const swordLength    = getSwordLength(tier);
    const fullCooldownMs = getScaledWeaponCooldown(weaponDef?.stats.cooldownMs ?? SWORD_DEFAULT_COOLDOWN_MS, tier);
    const nowMs = Date.now();

    // ── 1. Update hinge physics: spring pulls toward right-hand rest angle based on
    //       last movement facing (ctx.playerAimAngle). Overridden during swing/spin.
    const restAngle = ctx.playerAimAngle + Math.PI / 2;
    const angleDiff = wrapAngleDiff(restAngle - state.swordAngle);
    state.swordAngularVel += angleDiff * SWORD_HINGE_SPRING_K;
    state.swordAngularVel *= SWORD_HINGE_DAMPING;
    if (state.phase !== 'swing' && state.phase !== 'spin_combo' && state.phase !== 'combo_window') {
      state.swordAngle += state.swordAngularVel;
    }

    // ── 2. Update shard chain (each shard lags the previous) ──
    const followBase = SWORD_SHARD_FOLLOW_BASE;
    const followDecay = SWORD_SHARD_FOLLOW_DECAY;
    if (state.phase !== 'swing' && state.phase !== 'spin_combo') {
      // Shard 0 follows the main hinge angle.
      const d0 = wrapAngleDiff(state.swordAngle - state.shardAngles[0]);
      state.shardAngles[0] += d0 * followBase;
      for (let i = 1; i < SWORD_SHARD_COUNT; i++) {
        const followRate = Math.max(0.08, followBase - i * followDecay);
        const di = wrapAngleDiff(state.shardAngles[i - 1] - state.shardAngles[i]);
        state.shardAngles[i] += di * followRate;
      }
    } else {
      // During swing/spin: drive the blade through the arc; shards follow with chain lag.
      let driveAngle: number;
      if (state.phase === 'swing') {
        const t = Math.min(1, state.phaseMs / SWORD_SWING_MS);
        // R→L: drive from arcStart → arcEnd. L→R: drive from arcEnd → arcStart.
        if (state.swingIsRightToLeft) {
          driveAngle = state.swipeArcStart + (state.swipeArcEnd - state.swipeArcStart) * t;
        } else {
          driveAngle = state.swipeArcEnd + (state.swipeArcStart - state.swipeArcEnd) * t;
        }
      } else {
        // spin_combo: direct drive
        driveAngle = state.spinComboAngle;
      }
      state.swordAngle = driveAngle;
      state.shardAngles[0] = driveAngle;
      for (let i = 1; i < SWORD_SHARD_COUNT; i++) {
        const followRate = Math.max(0.08, followBase - i * followDecay);
        const di = wrapAngleDiff(state.shardAngles[i - 1] - state.shardAngles[i]);
        state.shardAngles[i] += di * followRate;
      }
    }

    // ── 3. Add fluid forces from sword drag (each shard per frame) ──
    const isSandBlade = weaponId === BASE_ATTACK_TIMER_KEY;
    const comboLength = swordLength;
    if (state.phase !== 'combo_window') {
      const dists = getShardDistances(comboLength);
      const colorPaletteDrag = isSandBlade ? SAND_BLADE_COLORS : SWORD_PRISMATIC_COLORS;
      const colIdx = Math.floor(nowMs / 60) % colorPaletteDrag.length;
      const hexColor = colorPaletteDrag[colIdx];
      let pr = parseInt(hexColor.slice(1, 3), 16);
      let pg = parseInt(hexColor.slice(3, 5), 16);
      let pb = parseInt(hexColor.slice(5, 7), 16);
      if (isSandBlade) {
        const bright = 0.7 + 0.3 * (1 + Math.sin(nowMs * 0.007));
        pr = Math.min(255, Math.round(pr * bright));
        pg = Math.min(255, Math.round(pg * bright));
        pb = Math.min(255, Math.round(pb * bright));
      }
      for (let i = 0; i < SWORD_SHARD_COUNT; i++) {
        const sx = mote.x + Math.cos(state.shardAngles[i]) * dists[i];
        const sy = mote.y + Math.sin(state.shardAngles[i]) * dists[i];
        const perpX = -Math.sin(state.shardAngles[i]);
        const perpY =  Math.cos(state.shardAngles[i]);
        fluid.addForce({
          x: sx, y: sy,
          vx: perpX * SWORD_FLUID_DRAG_STR * FLUID_VEL_FRAME_TO_PX_S,
          vy: perpY * SWORD_FLUID_DRAG_STR * FLUID_VEL_FRAME_TO_PX_S,
          r: pr, g: pg, b: pb,
          strength: FLUID_PROJECTILE_STRENGTH * (state.phase === 'spin_combo' ? 1.5 : 0.5),
        });
      }
    }

    // ── 4. Phase state machine ──
    state.phaseMs += deltaMs;

    if (state.phase === 'idle') {
      if (state.phaseMs >= state.cooldownMs) {
        // Trigger a swing if any enemy is within sword range.
        const rangeSq = swordLength * swordLength;
        let anyInRange = false;
        const checkEnemy = (e: { x: number; y: number }) => {
          if (anyInRange) return;
          const dx = e.x - mote.x, dy = e.y - mote.y;
          if (dx * dx + dy * dy <= rangeSq) anyInRange = true;
        };
        for (const e of enemies)           checkEnemy(e);
        for (const e of sapphireEnemies)   checkEnemy(e);
        for (const e of emeraldEnemies)    checkEnemy(e);
        for (const e of amberEnemies)      checkEnemy(e);
        for (const e of voidEnemies)       checkEnemy(e);
        for (const e of quartzEnemies)     checkEnemy(e);
        for (const e of rubyEnemies)       checkEnemy(e);
        for (const e of sunstoneEnemies)   checkEnemy(e);
        for (const e of citrineEnemies)    checkEnemy(e);
        for (const e of ioliteEnemies)     checkEnemy(e);
        for (const e of amethystEnemies)   checkEnemy(e);
        for (const e of diamondEnemies)    checkEnemy(e);
        for (const e of nullstoneEnemies)  checkEnemy(e);
        for (const e of fracterylEnemies)  checkEnemy(e);
        for (const e of eigensteinEnemies) checkEnemy(e);
        if (ctx.bossEnemy) checkEnemy(ctx.bossEnemy);

        if (anyInRange) {
          // Find the nearest enemy angle to center the 180° arc on.
          let bestDistSq = Infinity;
          let bestAngle  = 0;
          const findNearest = (e: { x: number; y: number }) => {
            const dx = e.x - mote.x, dy = e.y - mote.y;
            const d = dx * dx + dy * dy;
            if (d < bestDistSq) { bestDistSq = d; bestAngle = Math.atan2(dy, dx); }
          };
          for (const e of enemies)           findNearest(e);
          for (const e of sapphireEnemies)   findNearest(e);
          for (const e of emeraldEnemies)    findNearest(e);
          for (const e of amberEnemies)      findNearest(e);
          for (const e of voidEnemies)       findNearest(e);
          for (const e of quartzEnemies)     findNearest(e);
          for (const e of rubyEnemies)       findNearest(e);
          for (const e of sunstoneEnemies)   findNearest(e);
          for (const e of citrineEnemies)    findNearest(e);
          for (const e of ioliteEnemies)     findNearest(e);
          for (const e of amethystEnemies)   findNearest(e);
          for (const e of diamondEnemies)    findNearest(e);
          for (const e of nullstoneEnemies)  findNearest(e);
          for (const e of fracterylEnemies)  findNearest(e);
          for (const e of eigensteinEnemies) findNearest(e);
          if (ctx.bossEnemy) findNearest(ctx.bossEnemy);

          // Arc is centered on the enemy; half-width = π/2 gives a 180° sweep.
          // arcStart = left side (start for R→L drive), arcEnd = right side.
          state.swipeArcStart = bestAngle - Math.PI / 2;
          state.swipeArcEnd   = bestAngle + Math.PI / 2;
          state.phase = 'swing'; state.phaseMs = 0; state.hitThisSwing.clear();
          state.swipeEffects.push({
            x: mote.x, y: mote.y,
            arcStart: state.swipeArcStart, arcEnd: state.swipeArcEnd,
            swordLength,
            timerMs: SWORD_SWIPE_VISUAL_MS,
            maxTimerMs: SWORD_SWIPE_VISUAL_MS,
          });
        }
      }
    } else if (state.phase === 'swing') {
      // Hit detection during the swing (full 180° arc).
      swordHitInArc(state, swordLength, rawDamage, state.swipeArcStart, state.swipeArcEnd, weaponId);

      // Add stronger crescent fluid forces during the swipe.
      const numSamples = 6;
      const colorPaletteSwing = isSandBlade ? SAND_BLADE_COLORS : SWORD_PRISMATIC_COLORS;
      const colIdx2 = Math.floor(nowMs / 60) % colorPaletteSwing.length;
      const hexC2 = colorPaletteSwing[colIdx2];
      let sr = parseInt(hexC2.slice(1, 3), 16);
      let sg = parseInt(hexC2.slice(3, 5), 16);
      let sb = parseInt(hexC2.slice(5, 7), 16);
      if (isSandBlade) {
        const bright = 0.7 + 0.3 * (1 + Math.sin(nowMs * 0.007 + 1.0));
        sr = Math.min(255, Math.round(sr * bright));
        sg = Math.min(255, Math.round(sg * bright));
        sb = Math.min(255, Math.round(sb * bright));
      }
      const t2 = Math.min(1, state.phaseMs / SWORD_SWING_MS);
      const arcSpan = state.swipeArcEnd - state.swipeArcStart;
      for (let s = 0; s < numSamples; s++) {
        const frac = s / (numSamples - 1);
        const angle = state.swipeArcStart + arcSpan * frac;
        fluid.addForce({
          x: mote.x + Math.cos(angle) * swordLength,
          y: mote.y + Math.sin(angle) * swordLength,
          vx: Math.cos(angle) * SWORD_FLUID_SWIPE_STR * FLUID_VEL_FRAME_TO_PX_S * t2,
          vy: Math.sin(angle) * SWORD_FLUID_SWIPE_STR * FLUID_VEL_FRAME_TO_PX_S * t2,
          r: sr, g: sg, b: sb,
          strength: FLUID_PROJECTILE_STRENGTH * 2.0,
        });
      }

      if (state.phaseMs >= SWORD_SWING_MS) {
        // Flip swing direction for next slash and count this completed slash.
        state.swingIsRightToLeft = !state.swingIsRightToLeft;
        state.comboCount += 1;
        state.hitThisSwing.clear();
        removeDeadEnemies(); checkWaveCompletion();

        if (state.comboCount >= SWORD_COMBO_THRESHOLD) {
          // 4 slashes complete — enter the 360° spinning 5th attack.
          // The spin starts from the endpoint of the last swing.
          const spinStartAngle = state.swipeArcStart;
          state.phase = 'spin_combo';
          state.phaseMs = 0;
          state.spinComboAngle = spinStartAngle;
          // swipeArcEnd stores the spin start angle (reuse to avoid adding a field).
          state.swipeArcEnd = spinStartAngle;
          state.spinComboDamageTicks = 0;
          state.hitThisSwing.clear();
        } else {
          // Enter the 1-second combo window — sword held in place, waiting for next slash.
          state.phase = 'combo_window';
          state.phaseMs = 0;
          state.swordAngularVel = 0; // freeze sword at its current end-of-swing position
        }
      }
    } else if (state.phase === 'spin_combo') {
      // ── Spin combo: 3 rapid full rotations, damage at beginning/middle/end ──
      const spinProgress = state.phaseMs / SWORD_COMBO_SPIN_MS; // 0 → 1
      const totalSpin = SWORD_COMBO_SPIN_TURNS * Math.PI * 2;   // 6π
      // swipeArcEnd stores the spin start angle (set when combo was triggered).
      state.spinComboAngle = state.swipeArcEnd + totalSpin * Math.min(spinProgress, 1);

      // Apply damage at 3 fixed checkpoints: beginning (0%), middle (50%), end (100%).
      // The hit-set is cleared before each tick so every enemy can be struck each time.
      for (let tick = state.spinComboDamageTicks; tick < SPIN_TICK_THRESHOLDS.length; tick++) {
        if (spinProgress < SPIN_TICK_THRESHOLDS[tick]) break;
        state.spinComboDamageTicks = tick + 1;
        state.hitThisSwing.clear();
        // Hitbox radius = sword length (same as the visible ring).
        const comboRange = swordLength;
        swordHitInArc(state, comboRange, rawDamage * SWORD_COMBO_DAMAGE_MULT, 0, Math.PI * 2, weaponId);
        // Wide fluid burst for each tick.
        const numS = 12;
        const colorPaletteSpin = isSandBlade ? SAND_BLADE_COLORS : SWORD_PRISMATIC_COLORS;
        const hexC3 = colorPaletteSpin[Math.floor(nowMs / 40) % colorPaletteSpin.length];
        let crr = parseInt(hexC3.slice(1, 3), 16);
        let crg = parseInt(hexC3.slice(3, 5), 16);
        let crb = parseInt(hexC3.slice(5, 7), 16);
        if (isSandBlade) {
          const bright = 0.7 + 0.3 * (1 + Math.sin(nowMs * 0.011));
          crr = Math.min(255, Math.round(crr * bright));
          crg = Math.min(255, Math.round(crg * bright));
          crb = Math.min(255, Math.round(crb * bright));
        }
        for (let s = 0; s < numS; s++) {
          const a = (s / numS) * Math.PI * 2;
          fluid.addForce({
            x: mote.x + Math.cos(a) * comboRange,
            y: mote.y + Math.sin(a) * comboRange,
            vx: Math.cos(a) * SWORD_FLUID_SWIPE_STR * 2.0 * FLUID_VEL_FRAME_TO_PX_S,
            vy: Math.sin(a) * SWORD_FLUID_SWIPE_STR * 2.0 * FLUID_VEL_FRAME_TO_PX_S,
            r: crr, g: crg, b: crb,
            strength: FLUID_PROJECTILE_STRENGTH * 4.0,
          });
        }
      }

      if (state.phaseMs >= SWORD_COMBO_SPIN_MS) {
        // Snap sword back to right-hand rest position and reset combo.
        const restAngle = ctx.playerAimAngle + Math.PI / 2;
        state.swordAngle = restAngle;
        for (let i = 0; i < SWORD_SHARD_COUNT; i++) state.shardAngles[i] = restAngle;
        state.swingIsRightToLeft = true;
        state.comboCount = 0;
        state.phase = 'idle'; state.phaseMs = 0;
        state.cooldownMs = fullCooldownMs;
        state.hitThisSwing.clear();
        removeDeadEnemies(); checkWaveCompletion();
      }
    } else if (state.phase === 'combo_window') {
      // ── Combo window: immediately start next slash if enemy in range; break combo on timeout ──
      const rangeSq = swordLength * swordLength;
      let anyInRange = false;
      const checkCombo = (e: { x: number; y: number }) => {
        if (anyInRange) return;
        const dx = e.x - mote.x, dy = e.y - mote.y;
        if (dx * dx + dy * dy <= rangeSq) anyInRange = true;
      };
      for (const e of enemies)           checkCombo(e);
      for (const e of sapphireEnemies)   checkCombo(e);
      for (const e of emeraldEnemies)    checkCombo(e);
      for (const e of amberEnemies)      checkCombo(e);
      for (const e of voidEnemies)       checkCombo(e);
      for (const e of quartzEnemies)     checkCombo(e);
      for (const e of rubyEnemies)       checkCombo(e);
      for (const e of sunstoneEnemies)   checkCombo(e);
      for (const e of citrineEnemies)    checkCombo(e);
      for (const e of ioliteEnemies)     checkCombo(e);
      for (const e of amethystEnemies)   checkCombo(e);
      for (const e of diamondEnemies)    checkCombo(e);
      for (const e of nullstoneEnemies)  checkCombo(e);
      for (const e of fracterylEnemies)  checkCombo(e);
      for (const e of eigensteinEnemies) checkCombo(e);
      if (ctx.bossEnemy) checkCombo(ctx.bossEnemy);

      if (anyInRange && state.phaseMs >= SWORD_COMBO_MIN_SWIPE_DELAY_MS) {
        // Enemy in range and minimum inter-swipe delay elapsed — start the next slash.
        let bestDistSq = Infinity;
        let bestAngle  = 0;
        const findNearest = (e: { x: number; y: number }) => {
          const dx = e.x - mote.x, dy = e.y - mote.y;
          const d = dx * dx + dy * dy;
          if (d < bestDistSq) { bestDistSq = d; bestAngle = Math.atan2(dy, dx); }
        };
        for (const e of enemies)           findNearest(e);
        for (const e of sapphireEnemies)   findNearest(e);
        for (const e of emeraldEnemies)    findNearest(e);
        for (const e of amberEnemies)      findNearest(e);
        for (const e of voidEnemies)       findNearest(e);
        for (const e of quartzEnemies)     findNearest(e);
        for (const e of rubyEnemies)       findNearest(e);
        for (const e of sunstoneEnemies)   findNearest(e);
        for (const e of citrineEnemies)    findNearest(e);
        for (const e of ioliteEnemies)     findNearest(e);
        for (const e of amethystEnemies)   findNearest(e);
        for (const e of diamondEnemies)    findNearest(e);
        for (const e of nullstoneEnemies)  findNearest(e);
        for (const e of fracterylEnemies)  findNearest(e);
        for (const e of eigensteinEnemies) findNearest(e);
        if (ctx.bossEnemy) findNearest(ctx.bossEnemy);

        state.swipeArcStart = bestAngle - Math.PI / 2;
        state.swipeArcEnd   = bestAngle + Math.PI / 2;
        state.phase = 'swing'; state.phaseMs = 0; state.hitThisSwing.clear();
        state.swipeEffects.push({
          x: mote.x, y: mote.y,
          arcStart: state.swipeArcStart, arcEnd: state.swipeArcEnd,
          swordLength,
          timerMs: SWORD_SWIPE_VISUAL_MS,
          maxTimerMs: SWORD_SWIPE_VISUAL_MS,
        });
      } else if (state.phaseMs >= SWORD_COMBO_WINDOW_MS) {
        // Combo window expired — break the combo and return to idle.
        state.comboCount = 0;
        state.swingIsRightToLeft = true; // reset to default starting direction
        state.phase = 'idle'; state.phaseMs = 0;
        state.cooldownMs = fullCooldownMs;
      }
    }

    // ── 5. Age swipe and beam effects (unconditional) ──
    for (let i = state.swipeEffects.length - 1; i >= 0; i--) {
      state.swipeEffects[i].timerMs -= deltaMs;
      if (state.swipeEffects[i].timerMs <= 0) state.swipeEffects.splice(i, 1);
    }
    for (let i = state.beamEffects.length - 1; i >= 0; i--) {
      state.beamEffects[i].progress += deltaMs / (state.beamEffects[i].maxTimerMs * 0.5);
      if (state.beamEffects[i].progress >= 2) state.beamEffects.splice(i, 1);
    }
  }

  // ── Iolite poison bolt system ──────────────────────────────────

  function spawnPoisonBolt(targetX: number, targetY: number, weaponId: string, tier: number, rawDamage: number): void {
    const dx = targetX - mote.x, dy = targetY - mote.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) return;
    poisonBolts.push({
      x: mote.x, y: mote.y,
      vx: (dx / dist) * POISON_BOLT_SPEED,
      vy: (dy / dist) * POISON_BOLT_SPEED,
      lifeMs: POISON_BOLT_LIFE_MS,
      scaledDamage: rawDamage,
      tier, weaponId,
      trailX: new Float64Array(POISON_BOLT_TRAIL_CAP),
      trailY: new Float64Array(POISON_BOLT_TRAIL_CAP),
      trailHead: 0, trailCount: 0,
    });
  }

  /** Attaches or refreshes a poison debuff on a target, using a closure for typed damage dispatch. */
  function attachPoisonDebuff<T extends { x: number; y: number; hp: number; maxHp: number }>(
    target: T,
    rawDamage: number,
    tier: number,
    damageFn: (enemy: T, dmg: number, pierce: number) => number,
  ): void {
    const armorIgnore   = Math.min(1, tier * POISON_ARMOR_IGNORE_PER_TIER);
    const clampedTier   = Math.min(tier, POISON_DURATION_BASE_TIER - 1);
    const durationMs    = (POISON_DURATION_BASE_TIER - clampedTier) * POISON_DURATION_MS_PER_TIER;
    const poisonTotal   = rawDamage * tier * POISON_TOTAL_MULTIPLIER;
    const damagePerTick = poisonTotal / (durationMs / POISON_TICK_INTERVAL_MS);
    poisonDebuffs.set(target, {
      remainingDamage: poisonTotal,
      damagePerTick,
      tickTimerMs: POISON_TICK_INTERVAL_MS,
      maxHp: target.maxHp,
      isAlive: () => target.hp > 0,
      applyTick:  (tick: number) => target.hp > 0 ? damageFn(target, tick, armorIgnore) : 0,
      getPos: () => ({ x: target.x, y: target.y }),
    });
  }

  function updatePoisonBolts(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const hitR = POISON_BOLT_SIZE * 3;

    for (let i = poisonBolts.length - 1; i >= 0; i--) {
      const p = poisonBolts[i];
      p.lifeMs -= deltaMs;
      if (p.lifeMs <= 0) { poisonBolts.splice(i, 1); continue; }

      p.x += p.vx * dt; p.y += p.vy * dt;

      // Trail ring buffer
      p.trailX[p.trailHead] = p.x; p.trailY[p.trailHead] = p.y;
      p.trailHead = (p.trailHead + 1) % POISON_BOLT_TRAIL_CAP;
      if (p.trailCount < POISON_BOLT_TRAIL_CAP) p.trailCount++;

      // Fluid injection
      fluid.addForce({
        x: p.x, y: p.y,
        vx: p.vx * FLUID_VEL_FRAME_TO_PX_S * 0.4,
        vy: p.vy * FLUID_VEL_FRAME_TO_PX_S * 0.4,
        r: 136, g: 68, b: 255,
        strength: 0.1,
      });

      if (p.x < 0 || p.x > dim.w || p.y < 0 || p.y > dim.h) {
        poisonBolts.splice(i, 1); continue;
      }

      // Collision — first hit ends the bolt.
      let hit = false;
      const tryHit = <T extends { x: number; y: number; hp: number; maxHp: number }>(
        e: T,
        damageFn: (enemy: T, dmg: number, pierce: number) => number,
      ): boolean => {
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy >= hitR * hitR) return false;
        const dmg = damageFn(e, p.scaledDamage, 0);
        spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, POISON_BOLT_COLOR);
        attachPoisonDebuff(e, p.scaledDamage, p.tier, damageFn);
        return true;
      };

      for (const e of enemies)          { if (tryHit(e, damageEnemy))                                         { hit = true; break; } }
      if (!hit) for (const e of sapphireEnemies)  { if (tryHit(e, (en, d, r) => damageSapphireEnemy(en, d, r, false))) { hit = true; break; } }
      if (!hit) for (const e of emeraldEnemies)   { if (tryHit(e, damageEmeraldEnemy))                        { hit = true; break; } }
      if (!hit) for (const e of amberEnemies)     { if (tryHit(e, damageAmberEnemy))                          { hit = true; break; } }
      if (!hit) for (const e of voidEnemies)      { if (tryHit(e, damageVoidEnemy))                           { hit = true; break; } }
      if (!hit) for (const e of quartzEnemies)    { if (tryHit(e, damageQuartzEnemy))                         { hit = true; break; } }
      if (!hit) for (const e of rubyEnemies)      { if (tryHit(e, damageRubyEnemy))                           { hit = true; break; } }
      if (!hit) for (const e of sunstoneEnemies)  { if (tryHit(e, damageSunstoneEnemy))                       { hit = true; break; } }
      if (!hit) for (const e of citrineEnemies)   { if (tryHit(e, damageCitrineEnemy))                        { hit = true; break; } }
      if (!hit) for (const e of ioliteEnemies)    { if (tryHit(e, damageIoliteEnemy))                         { hit = true; break; } }
      if (!hit) for (const e of amethystEnemies)  { if (tryHit(e, (en, d, r) => damageAmethystEnemy(en, d, r, false))) { hit = true; break; } }
      if (!hit) for (const e of diamondEnemies)   { if (tryHit(e, damageDiamondEnemy))                        { hit = true; break; } }
      if (!hit) for (const e of nullstoneEnemies) { if (tryHit(e, damageNullstoneEnemy))                      { hit = true; break; } }
      if (!hit) for (const e of fracterylEnemies) { if (tryHit(e, (en, d, r) => damageFracterylEnemy(en, d, r))) { hit = true; break; } }
      if (!hit) for (const e of eigensteinEnemies) { if (tryHit(e, (en, d, r) => damageEigensteinEnemy(en, d, r))) { hit = true; break; } }
      if (!hit && ctx.bossEnemy) {
        const boss = ctx.bossEnemy;
        const dx = p.x - boss.x, dy = p.y - boss.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageBossEnemy(p.scaledDamage, 0);
          if (dmg > 0) spawnHitVisualsAt(boss.x, boss.y, boss.maxHp, dmg, POISON_BOLT_COLOR);
          attachPoisonDebuff(boss, p.scaledDamage, p.tier, (_b, d, r) => damageBossEnemy(d, r));
          hit = true;
        }
      }

      if (hit) {
        poisonBolts.splice(i, 1);
        removeDeadEnemies(); checkWaveCompletion();
      }
    }
  }

  function updatePoisonDebuffs(deltaMs: number): void {
    for (const [target, debuff] of poisonDebuffs) {
      if (debuff.remainingDamage <= 0) { poisonDebuffs.delete(target); continue; }
      // Remove the debuff if the target has already been killed.
      if (!debuff.isAlive()) { poisonDebuffs.delete(target); continue; }

      debuff.tickTimerMs -= deltaMs;
      if (debuff.tickTimerMs <= 0) {
        debuff.tickTimerMs += POISON_TICK_INTERVAL_MS;
        const tick = Math.min(debuff.damagePerTick, debuff.remainingDamage);
        debuff.remainingDamage -= tick;
        const dmg = debuff.applyTick(tick);
        if (dmg > 0) {
          const pos = debuff.getPos();
          spawnDamageNumber(pos.x, pos.y, 0, -1, String(Math.round(dmg)), dmg / debuff.maxHp, POISON_BOLT_COLOR);
        }
        if (debuff.remainingDamage <= 0) poisonDebuffs.delete(target);
      }
    }
    removeDeadEnemies();
    checkWaveCompletion();
  }


  // ── Emerald heat-seeking missile system ───────────────────────

  function spawnEmeraldMissile(targetX: number, targetY: number, scaledDamage: number, tier: number): void {
    const dx = targetX - mote.x, dy = targetY - mote.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) return;
    emeraldPlayerMissiles.push({
      x: mote.x, y: mote.y,
      vx: (dx / dist) * EMERALD_MISSILE_SPEED,
      vy: (dy / dist) * EMERALD_MISSILE_SPEED,
      scaledDamage,
      tier,
      noTargetMs: 0,
      isFizzling: false,
      trailX: new Float64Array(EMERALD_MISSILE_TRAIL_CAP),
      trailY: new Float64Array(EMERALD_MISSILE_TRAIL_CAP),
      trailHead: 0, trailCount: 0,
    });
  }

  /** Spawn sub-missiles from (ox, oy), scattered in a cone or equidistantly. */
  function spawnEmeraldSubMissiles(
    ox: number, oy: number,
    scaledDamage: number,
    tier: number,
    coneAngle: number | null,   // null → equidistant 360° spread
  ): void {
    const count = EMERALD_MISSILE_SUB_BASE + (tier - 1) * EMERALD_MISSILE_SUB_PER_TIER;
    for (let k = 0; k < count; k++) {
      let angle: number;
      if (coneAngle === null) {
        // Equidistant full-circle spread.
        angle = (k / count) * Math.PI * 2;
      } else {
        // Random within the configured half-angle of the cone direction.
        angle = coneAngle + (Math.random() - 0.5) * 2 * EMERALD_SUB_MISSILE_CONE_SPREAD;
      }
      emeraldSubMissiles.push({
        x: ox, y: oy,
        vx: Math.cos(angle) * EMERALD_SUB_MISSILE_SPEED,
        vy: Math.sin(angle) * EMERALD_SUB_MISSILE_SPEED,
        scaledDamage: scaledDamage * EMERALD_SUB_MISSILE_DAMAGE_MULT,
        squigglePhase: Math.random() * Math.PI * 2,
        lifetimeMs: 0,
        stoppedMs: 0,
        trailX: new Float32Array(EMERALD_SUB_MISSILE_TRAIL_CAP),
        trailY: new Float32Array(EMERALD_SUB_MISSILE_TRAIL_CAP),
        trailHead: 0, trailCount: 0,
      });
    }
  }

  function updateEmeraldPlayerMissiles(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const hitR        = EMERALD_MISSILE_HIT_RADIUS;
    const proxR2      = EMERALD_MISSILE_PROXIMITY_PX * EMERALD_MISSILE_PROXIMITY_PX;
    const detectR2    = EMERALD_MISSILE_DETECT_PX * EMERALD_MISSILE_DETECT_PX;
    const fizzleDrag  = Math.pow(EMERALD_MISSILE_FIZZLE_DRAG, dt);

    for (let i = emeraldPlayerMissiles.length - 1; i >= 0; i--) {
      const m = emeraldPlayerMissiles[i];

      // Find nearest enemy and its distance.
      let nearestEnemyX: number | null = null;
      let nearestEnemyY: number | null = null;
      let nearestDistSq = Infinity;
      const checkTarget = (ex: number, ey: number) => {
        const d = (ex - m.x) * (ex - m.x) + (ey - m.y) * (ey - m.y);
        if (d < nearestDistSq) { nearestDistSq = d; nearestEnemyX = ex; nearestEnemyY = ey; }
      };
      for (const e of enemies)          checkTarget(e.x, e.y);
      for (const e of sapphireEnemies)  checkTarget(e.x, e.y);
      for (const e of emeraldEnemies)   checkTarget(e.x, e.y);
      for (const e of amberEnemies)     checkTarget(e.x, e.y);
      for (const e of voidEnemies)      checkTarget(e.x, e.y);
      for (const e of quartzEnemies)    checkTarget(e.x, e.y);
      for (const e of rubyEnemies)      checkTarget(e.x, e.y);
      for (const e of sunstoneEnemies)  checkTarget(e.x, e.y);
      for (const e of citrineEnemies)   checkTarget(e.x, e.y);
      for (const e of ioliteEnemies)    checkTarget(e.x, e.y);
      for (const e of amethystEnemies)  checkTarget(e.x, e.y);
      for (const e of diamondEnemies)   checkTarget(e.x, e.y);
      for (const e of nullstoneEnemies) checkTarget(e.x, e.y);
      for (const e of fracterylEnemies) checkTarget(e.x, e.y);
      for (const e of eigensteinEnemies) checkTarget(e.x, e.y);
      if (ctx.bossEnemy) checkTarget(ctx.bossEnemy.x, ctx.bossEnemy.y);

      // If an enemy is close enough to detect, reset fizzle timer and home toward it.
      if (nearestDistSq <= detectR2 && nearestEnemyX !== null && nearestEnemyY !== null) {
        m.noTargetMs = 0;
        m.isFizzling = false;

        const ex = nearestEnemyX - m.x, ey = nearestEnemyY - m.y;
        const eDist = Math.sqrt(ex * ex + ey * ey);
        if (eDist > 0.01) {
          m.vx += (ex / eDist) * EMERALD_MISSILE_SEEK_STR * dt;
          m.vy += (ey / eDist) * EMERALD_MISSILE_SEEK_STR * dt;
        }

        // Proximity explosion — burst into sub-missiles in a cone toward enemy.
        if (nearestDistSq <= proxR2) {
          const coneAngle = Math.atan2(nearestEnemyY - m.y, nearestEnemyX - m.x);
          spawnEmeraldSubMissiles(m.x, m.y, m.scaledDamage, m.tier, coneAngle);
          fluid.addExplosion(m.x, m.y, FLUID_EXPLOSION_STRENGTH * 0.5,
            FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
          emeraldPlayerMissiles.splice(i, 1);
          continue;
        }
      } else {
        // No enemy in detection range — accumulate no-target time.
        m.noTargetMs += deltaMs;
        if (m.noTargetMs >= EMERALD_MISSILE_NO_TARGET_MS) {
          m.isFizzling = true;
        }
      }

      // Fizzle drag decelerates the missile.
      if (m.isFizzling) {
        m.vx *= fizzleDrag;
        m.vy *= fizzleDrag;
      } else {
        // Normal speed clamp.
        const spd = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
        if (spd > EMERALD_MISSILE_MAX_SPEED) {
          const s = EMERALD_MISSILE_MAX_SPEED / spd;
          m.vx *= s; m.vy *= s;
        }
      }

      m.x += m.vx * dt; m.y += m.vy * dt;

      // Wall bounce — reflect off all four edges.
      if (m.x < 0)         { m.x = 0;         m.vx =  Math.abs(m.vx); }
      else if (m.x > dim.w)  { m.x = dim.w;  m.vx = -Math.abs(m.vx); }
      if (m.y < 0)         { m.y = 0;         m.vy =  Math.abs(m.vy); }
      else if (m.y > dim.h) { m.y = dim.h; m.vy = -Math.abs(m.vy); }

      // Trail update.
      m.trailX[m.trailHead] = m.x; m.trailY[m.trailHead] = m.y;
      m.trailHead = (m.trailHead + 1) % EMERALD_MISSILE_TRAIL_CAP;
      if (m.trailCount < EMERALD_MISSILE_TRAIL_CAP) m.trailCount++;

      // Fluid injection — emerald comet sweep.
      fluid.addForce({
        x: m.x, y: m.y,
        vx: m.vx * FLUID_VEL_FRAME_TO_PX_S * 0.5,
        vy: m.vy * FLUID_VEL_FRAME_TO_PX_S * 0.5,
        r: FLUID_EMERALD_R, g: FLUID_EMERALD_G, b: FLUID_EMERALD_B,
        strength: FLUID_PROJECTILE_STRENGTH * 0.8,
      });

      // Fully stopped while fizzling — explode into equidistant sub-missiles.
      if (m.isFizzling && Math.sqrt(m.vx * m.vx + m.vy * m.vy) < EMERALD_MISSILE_STOP_SPEED) {
        spawnEmeraldSubMissiles(m.x, m.y, m.scaledDamage, m.tier, null);
        fluid.addExplosion(m.x, m.y, FLUID_EXPLOSION_STRENGTH * 0.5,
          FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
        emeraldPlayerMissiles.splice(i, 1);
        continue;
      }

      // Collision detection — hit first matching enemy.
      let hit = false;
      const tryHit = <T extends { x: number; y: number; hp: number; maxHp: number }>(
        e: T,
        damageFn: (enemy: T, dmg: number, pierce: number) => number,
      ): boolean => {
        const dx = m.x - e.x, dy = m.y - e.y;
        if (dx * dx + dy * dy >= hitR * hitR) return false;
        const dmg = damageFn(e, m.scaledDamage, 0);
        spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, EMERALD_MISSILE_COLOR);
        fluid.addExplosion(e.x, e.y, FLUID_EXPLOSION_STRENGTH * 0.35,
          FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
        return true;
      };

      for (const e of enemies)          { if (tryHit(e, damageEnemy))                                          { hit = true; break; } }
      if (!hit) for (const e of sapphireEnemies)  { if (tryHit(e, (en, d, p) => damageSapphireEnemy(en, d, p, false))) { hit = true; break; } }
      if (!hit) for (const e of emeraldEnemies)   { if (tryHit(e, damageEmeraldEnemy))                         { hit = true; break; } }
      if (!hit) for (const e of amberEnemies)     { if (tryHit(e, damageAmberEnemy))                           { hit = true; break; } }
      if (!hit) for (const e of voidEnemies)      { if (tryHit(e, damageVoidEnemy))                            { hit = true; break; } }
      if (!hit) for (const e of quartzEnemies)    { if (tryHit(e, damageQuartzEnemy))                          { hit = true; break; } }
      if (!hit) for (const e of rubyEnemies)      { if (tryHit(e, damageRubyEnemy))                            { hit = true; break; } }
      if (!hit) for (const e of sunstoneEnemies)  { if (tryHit(e, damageSunstoneEnemy))                        { hit = true; break; } }
      if (!hit) for (const e of citrineEnemies)   { if (tryHit(e, damageCitrineEnemy))                         { hit = true; break; } }
      if (!hit) for (const e of ioliteEnemies)    { if (tryHit(e, damageIoliteEnemy))                          { hit = true; break; } }
      if (!hit) for (const e of amethystEnemies)  { if (tryHit(e, (en, d, p) => damageAmethystEnemy(en, d, p, false))) { hit = true; break; } }
      if (!hit) for (const e of diamondEnemies)   { if (tryHit(e, damageDiamondEnemy))                         { hit = true; break; } }
      if (!hit) for (const e of nullstoneEnemies) { if (tryHit(e, damageNullstoneEnemy))                       { hit = true; break; } }
      if (!hit) for (const e of fracterylEnemies) { if (tryHit(e, (en, d, p) => damageFracterylEnemy(en, d, p))) { hit = true; break; } }
      if (!hit) for (const e of eigensteinEnemies) { if (tryHit(e, (en, d, p) => damageEigensteinEnemy(en, d, p))) { hit = true; break; } }
      if (!hit && ctx.bossEnemy) {
        const boss = ctx.bossEnemy;
        const dx = m.x - boss.x, dy = m.y - boss.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageBossEnemy(m.scaledDamage, 0);
          if (dmg > 0) {
            spawnHitVisualsAt(boss.x, boss.y, boss.maxHp, dmg, EMERALD_MISSILE_COLOR);
            fluid.addExplosion(boss.x, boss.y, FLUID_EXPLOSION_STRENGTH * 0.35,
              FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
          }
          hit = true;
        }
      }

      if (hit) {
        emeraldPlayerMissiles.splice(i, 1);
        removeDeadEnemies(); checkWaveCompletion();
      }
    }
  }

  function spawnEmeraldSwirlExplosion(ox: number, oy: number): void {
    for (let k = 0; k < EMERALD_SWIRL_COUNT; k++) {
      // Equidistant angles with a random offset for visual variety.
      const baseAngle = (k / EMERALD_SWIRL_COUNT) * Math.PI * 2 + Math.random() * 0.3;
      // Tangential component creates the swirl; outward component spreads the ring.
      const outward   = EMERALD_SWIRL_SPEED * (0.6 + Math.random() * 0.4);
      const tangential = EMERALD_SWIRL_SPEED * (0.5 + Math.random() * 0.5);
      const outX = Math.cos(baseAngle), outY = Math.sin(baseAngle);
      const tanX = -outY, tanY =  outX;
      emeraldSwirlParticles.push({
        x: ox, y: oy,
        vx: outX * outward + tanX * tangential,
        vy: outY * outward + tanY * tangential,
        lifeMs: EMERALD_SWIRL_LIFE_MS,
      });
    }
  }

  function updateEmeraldSubMissiles(deltaMs: number): void {
    const dt          = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const hitR2       = EMERALD_SUB_MISSILE_HIT_RADIUS * EMERALD_SUB_MISSILE_HIT_RADIUS;
    const detectR2    = EMERALD_SUB_MISSILE_DETECT_PX * EMERALD_SUB_MISSILE_DETECT_PX;
    const decelDrag   = Math.pow(EMERALD_SUB_MISSILE_FIZZLE_DRAG, dt);

    for (let i = emeraldSubMissiles.length - 1; i >= 0; i--) {
      const s = emeraldSubMissiles[i];

      // Advance total lifetime.
      s.lifetimeMs += deltaMs;

      // Fuel phase: homing active while lifetime < DECEL_START_MS.
      // Hard cutoff: if lifetime exceeds FUEL_MS, force stopped to trigger explosion.
      const isDecelerating = s.lifetimeMs >= EMERALD_SUB_MISSILE_DECEL_START_MS;
      if (s.lifetimeMs >= EMERALD_SUB_MISSILE_FUEL_MS) {
        s.vx = 0; s.vy = 0;
      }

      if (!isDecelerating) {
        // Still has fuel — seek nearest enemy within detection range.
        let nearestX: number | null = null;
        let nearestY: number | null = null;
        let nearestDist2 = Infinity;
        const checkTarget = (ex: number, ey: number) => {
          const d = (ex - s.x) * (ex - s.x) + (ey - s.y) * (ey - s.y);
          if (d < nearestDist2) { nearestDist2 = d; nearestX = ex; nearestY = ey; }
        };
        for (const e of enemies)           checkTarget(e.x, e.y);
        for (const e of sapphireEnemies)   checkTarget(e.x, e.y);
        for (const e of emeraldEnemies)    checkTarget(e.x, e.y);
        for (const e of amberEnemies)      checkTarget(e.x, e.y);
        for (const e of voidEnemies)       checkTarget(e.x, e.y);
        for (const e of quartzEnemies)     checkTarget(e.x, e.y);
        for (const e of rubyEnemies)       checkTarget(e.x, e.y);
        for (const e of sunstoneEnemies)   checkTarget(e.x, e.y);
        for (const e of citrineEnemies)    checkTarget(e.x, e.y);
        for (const e of ioliteEnemies)     checkTarget(e.x, e.y);
        for (const e of amethystEnemies)   checkTarget(e.x, e.y);
        for (const e of diamondEnemies)    checkTarget(e.x, e.y);
        for (const e of nullstoneEnemies)  checkTarget(e.x, e.y);
        for (const e of fracterylEnemies)  checkTarget(e.x, e.y);
        for (const e of eigensteinEnemies) checkTarget(e.x, e.y);
        if (ctx.bossEnemy) checkTarget(ctx.bossEnemy.x, ctx.bossEnemy.y);

        if (nearestDist2 <= detectR2 && nearestX !== null && nearestY !== null) {
          const ex = nearestX - s.x, ey = nearestY - s.y;
          const eDist = Math.sqrt(ex * ex + ey * ey);
          if (eDist > 0.01) {
            s.vx += (ex / eDist) * EMERALD_SUB_MISSILE_SEEK_STR * dt;
            s.vy += (ey / eDist) * EMERALD_SUB_MISSILE_SEEK_STR * dt;
          }
        }

        // Speed clamp while powered.
        const spd = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
        if (spd > EMERALD_SUB_MISSILE_MAX_SPEED) {
          const scale = EMERALD_SUB_MISSILE_MAX_SPEED / spd;
          s.vx *= scale; s.vy *= scale;
        }
      } else {
        // Fuel ran out — apply drag to gradually stop between seconds 2 and 4.
        s.vx *= decelDrag;
        s.vy *= decelDrag;
      }

      // Squiggle wobble while still powered.
      if (!isDecelerating) {
        s.squigglePhase += EMERALD_SUB_MISSILE_SQUIGGLE_HZ * dt;
        const spd0 = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
        if (spd0 > 0.01) {
          const perpX = -s.vy / spd0;
          const perpY =  s.vx / spd0;
          const wobble = Math.sin(s.squigglePhase) * EMERALD_SUB_MISSILE_SQUIGGLE * dt;
          s.vx += perpX * wobble;
          s.vy += perpY * wobble;
        }
      }

      s.x += s.vx * dt; s.y += s.vy * dt;

      // Wall bounce.
      if (s.x < 0)              { s.x = 0;          s.vx =  Math.abs(s.vx); }
      else if (s.x > dim.w)   { s.x = dim.w;    s.vx = -Math.abs(s.vx); }
      if (s.y < 0)              { s.y = 0;           s.vy =  Math.abs(s.vy); }
      else if (s.y > dim.h)  { s.y = dim.h;    s.vy = -Math.abs(s.vy); }

      // Trail update.
      s.trailX[s.trailHead] = s.x; s.trailY[s.trailHead] = s.y;
      s.trailHead = (s.trailHead + 1) % EMERALD_SUB_MISSILE_TRAIL_CAP;
      if (s.trailCount < EMERALD_SUB_MISSILE_TRAIL_CAP) s.trailCount++;

      // Fluid injection.
      fluid.addForce({
        x: s.x, y: s.y,
        vx: s.vx * FLUID_VEL_FRAME_TO_PX_S * 0.3,
        vy: s.vy * FLUID_VEL_FRAME_TO_PX_S * 0.3,
        r: FLUID_EMERALD_R, g: FLUID_EMERALD_G, b: FLUID_EMERALD_B,
        strength: FLUID_PROJECTILE_STRENGTH * 0.4,
      });

      // Post-stop delay: once decelerated and nearly stopped, count down then explode.
      if (isDecelerating && Math.sqrt(s.vx * s.vx + s.vy * s.vy) < EMERALD_SUB_MISSILE_STOP_SPEED) {
        s.stoppedMs += deltaMs;
        if (s.stoppedMs >= EMERALD_SUB_MISSILE_POST_STOP_DELAY_MS) {
          // AOE explosion with swirling green particles.
          const aoeR2 = EMERALD_SUB_MISSILE_AOE_PX * EMERALD_SUB_MISSILE_AOE_PX;
          fluid.addExplosion(s.x, s.y, FLUID_EXPLOSION_STRENGTH * 0.4,
            FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
          spawnEmeraldSwirlExplosion(s.x, s.y);
          const applyAoe = <T extends { x: number; y: number; hp: number; maxHp: number }>(
            arr: T[], damageFn: (e: T, dmg: number, pierce: number) => number,
          ) => {
            for (const e of arr) {
              const ddx = e.x - s.x, ddy = e.y - s.y;
              if (ddx * ddx + ddy * ddy <= aoeR2) {
                const dmg = damageFn(e, s.scaledDamage, 0);
                if (dmg > 0) spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, EMERALD_MISSILE_COLOR);
              }
            }
          };
          applyAoe(enemies,          damageEnemy);
          applyAoe(sapphireEnemies,  (e, d, p) => damageSapphireEnemy(e, d, p, false));
          applyAoe(emeraldEnemies,   damageEmeraldEnemy);
          applyAoe(amberEnemies,     damageAmberEnemy);
          applyAoe(voidEnemies,      damageVoidEnemy);
          applyAoe(quartzEnemies,    damageQuartzEnemy);
          applyAoe(rubyEnemies,      damageRubyEnemy);
          applyAoe(sunstoneEnemies,  damageSunstoneEnemy);
          applyAoe(citrineEnemies,   damageCitrineEnemy);
          applyAoe(ioliteEnemies,    damageIoliteEnemy);
          applyAoe(amethystEnemies,  (e, d, p) => damageAmethystEnemy(e, d, p, false));
          applyAoe(diamondEnemies,   damageDiamondEnemy);
          applyAoe(nullstoneEnemies, damageNullstoneEnemy);
          applyAoe(fracterylEnemies, (e, d, p) => damageFracterylEnemy(e, d, p));
          applyAoe(eigensteinEnemies,(e, d, p) => damageEigensteinEnemy(e, d, p));
          if (ctx.bossEnemy) {
            const bdx = ctx.bossEnemy.x - s.x, bdy = ctx.bossEnemy.y - s.y;
            if (bdx * bdx + bdy * bdy <= aoeR2) {
              const dmg = damageBossEnemy(s.scaledDamage, 0);
              if (dmg > 0) spawnHitVisualsAt(ctx.bossEnemy.x, ctx.bossEnemy.y, ctx.bossEnemy.maxHp, dmg, EMERALD_MISSILE_COLOR);
            }
          }
          emeraldSubMissiles.splice(i, 1);
          removeDeadEnemies(); checkWaveCompletion();
          continue;
        }
        // Still in post-stop delay — skip collision detection (missile is inert).
        continue;
      }

      // Collision detection — direct hit (only while in motion).
      let hit = false;
      const tryHitSub = <T extends { x: number; y: number; hp: number; maxHp: number }>(
        e: T,
        damageFn: (enemy: T, dmg: number, pierce: number) => number,
      ): boolean => {
        const dx = s.x - e.x, dy = s.y - e.y;
        if (dx * dx + dy * dy >= hitR2) return false;
        const dmg = damageFn(e, s.scaledDamage, 0);
        spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, EMERALD_MISSILE_COLOR);
        fluid.addExplosion(e.x, e.y, FLUID_EXPLOSION_STRENGTH * 0.2,
          FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
        return true;
      };
      for (const e of enemies)           { if (tryHitSub(e, damageEnemy))                                           { hit = true; break; } }
      if (!hit) for (const e of sapphireEnemies)  { if (tryHitSub(e, (en, d, p) => damageSapphireEnemy(en, d, p, false))) { hit = true; break; } }
      if (!hit) for (const e of emeraldEnemies)   { if (tryHitSub(e, damageEmeraldEnemy))                          { hit = true; break; } }
      if (!hit) for (const e of amberEnemies)     { if (tryHitSub(e, damageAmberEnemy))                            { hit = true; break; } }
      if (!hit) for (const e of voidEnemies)      { if (tryHitSub(e, damageVoidEnemy))                             { hit = true; break; } }
      if (!hit) for (const e of quartzEnemies)    { if (tryHitSub(e, damageQuartzEnemy))                           { hit = true; break; } }
      if (!hit) for (const e of rubyEnemies)      { if (tryHitSub(e, damageRubyEnemy))                             { hit = true; break; } }
      if (!hit) for (const e of sunstoneEnemies)  { if (tryHitSub(e, damageSunstoneEnemy))                         { hit = true; break; } }
      if (!hit) for (const e of citrineEnemies)   { if (tryHitSub(e, damageCitrineEnemy))                          { hit = true; break; } }
      if (!hit) for (const e of ioliteEnemies)    { if (tryHitSub(e, damageIoliteEnemy))                           { hit = true; break; } }
      if (!hit) for (const e of amethystEnemies)  { if (tryHitSub(e, (en, d, p) => damageAmethystEnemy(en, d, p, false))) { hit = true; break; } }
      if (!hit) for (const e of diamondEnemies)   { if (tryHitSub(e, damageDiamondEnemy))                          { hit = true; break; } }
      if (!hit) for (const e of nullstoneEnemies) { if (tryHitSub(e, damageNullstoneEnemy))                        { hit = true; break; } }
      if (!hit) for (const e of fracterylEnemies) { if (tryHitSub(e, (en, d, p) => damageFracterylEnemy(en, d, p))) { hit = true; break; } }
      if (!hit) for (const e of eigensteinEnemies) { if (tryHitSub(e, (en, d, p) => damageEigensteinEnemy(en, d, p))) { hit = true; break; } }
      if (!hit && ctx.bossEnemy) {
        const boss = ctx.bossEnemy;
        const dx = s.x - boss.x, dy = s.y - boss.y;
        if (dx * dx + dy * dy < hitR2) {
          const dmg = damageBossEnemy(s.scaledDamage, 0);
          if (dmg > 0) {
            spawnHitVisualsAt(boss.x, boss.y, boss.maxHp, dmg, EMERALD_MISSILE_COLOR);
            fluid.addExplosion(boss.x, boss.y, FLUID_EXPLOSION_STRENGTH * 0.2,
              FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
          }
          hit = true;
        }
      }
      if (hit) {
        emeraldSubMissiles.splice(i, 1);
        removeDeadEnemies(); checkWaveCompletion();
      }
    }
  }

  function updateEmeraldSwirlParticles(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const drag = Math.pow(EMERALD_SWIRL_DRAG, dt);
    for (let i = emeraldSwirlParticles.length - 1; i >= 0; i--) {
      const p = emeraldSwirlParticles[i];
      p.lifeMs -= deltaMs;
      if (p.lifeMs <= 0) { emeraldSwirlParticles.splice(i, 1); continue; }
      p.vx *= drag; p.vy *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }


  // ── Sunstone mine system ───────────────────────────────────────

  function layMine(scaledDamage: number, tier: number): void {
    const aoeRadius = SUNSTONE_MINE_AOE_BASE_PX + (tier - 1) * SUNSTONE_MINE_AOE_PER_TIER_PX;
    sunstoneMines.push({
      x: mote.x, y: mote.y,
      fuseMs: SUNSTONE_MINE_FUSE_MS,
      maxFuseMs: SUNSTONE_MINE_FUSE_MS,
      hp: SUNSTONE_MINE_HP,
      maxHp: SUNSTONE_MINE_HP,
      scaledDamage,
      aoeRadius,
      proximityRadius: SUNSTONE_MINE_PROXIMITY_PX,
    });
  }

  /**
   * Detonates a mine at the given index (removes it and applies AOE damage
   * to all enemies in aoeRadius).
   */
  function detonateMine(index: number): void {
    const mine = sunstoneMines[index];
    sunstoneMines.splice(index, 1);

    fluid.addExplosion(mine.x, mine.y, FLUID_EXPLOSION_STRENGTH * 1.4,
      255, 140, 40);

    const r2 = mine.aoeRadius * mine.aoeRadius;
    const applyAoe = <T extends { x: number; y: number; hp: number; maxHp: number }>(
      arr: T[],
      damageFn: (e: T, dmg: number, pierce: number) => number,
      color: string,
    ) => {
      for (const e of arr) {
        const dx = e.x - mine.x, dy = e.y - mine.y;
        if (dx * dx + dy * dy <= r2) {
          const dmg = damageFn(e, mine.scaledDamage, 0);
          if (dmg > 0) spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, color);
        }
      }
    };
    const col = '#ffaa22';
    applyAoe(enemies,          damageEnemy, col);
    applyAoe(sapphireEnemies,  (e, d, p) => damageSapphireEnemy(e, d, p, false), col);
    applyAoe(emeraldEnemies,   damageEmeraldEnemy, col);
    applyAoe(amberEnemies,     damageAmberEnemy, col);
    applyAoe(voidEnemies,      damageVoidEnemy, col);
    applyAoe(quartzEnemies,    damageQuartzEnemy, col);
    applyAoe(rubyEnemies,      damageRubyEnemy, col);
    applyAoe(sunstoneEnemies,  damageSunstoneEnemy, col);
    applyAoe(citrineEnemies,   damageCitrineEnemy, col);
    applyAoe(ioliteEnemies,    damageIoliteEnemy, col);
    applyAoe(amethystEnemies,  (e, d, p) => damageAmethystEnemy(e, d, p, false), col);
    applyAoe(diamondEnemies,   damageDiamondEnemy, col);
    applyAoe(nullstoneEnemies, damageNullstoneEnemy, col);
    applyAoe(fracterylEnemies, (e, d, p) => damageFracterylEnemy(e, d, p), col);
    applyAoe(eigensteinEnemies,(e, d, p) => damageEigensteinEnemy(e, d, p), col);
    if (ctx.bossEnemy) {
      const dx = ctx.bossEnemy.x - mine.x, dy = ctx.bossEnemy.y - mine.y;
      if (dx * dx + dy * dy <= r2) {
        const dmg = damageBossEnemy(mine.scaledDamage, 0);
        if (dmg > 0) spawnHitVisualsAt(ctx.bossEnemy.x, ctx.bossEnemy.y, ctx.bossEnemy.maxHp, dmg, col);
      }
    }
    removeDeadEnemies(); checkWaveCompletion();
  }

  function updateSunstoneMines(deltaMs: number): void {
    for (let i = sunstoneMines.length - 1; i >= 0; i--) {
      const mine = sunstoneMines[i];

      // Fuse countdown.
      mine.fuseMs -= deltaMs;

      // Apply incoming damage from enemies that overlap the mine.
      const mineHitR = SUNSTONE_MINE_SIZE + 2;
      const mineHitR2 = mineHitR * mineHitR;
      const checkEnemyContact = (ex: number, ey: number, atk: number) => {
        const dx = ex - mine.x, dy = ey - mine.y;
        if (dx * dx + dy * dy <= mineHitR2) {
          mine.hp -= atk;
        }
      };
      for (const e of enemies)          checkEnemyContact(e.x, e.y, e.atk);
      for (const e of sapphireEnemies)  checkEnemyContact(e.x, e.y, e.atk);
      for (const e of emeraldEnemies)   checkEnemyContact(e.x, e.y, e.atk);
      for (const e of amberEnemies)     checkEnemyContact(e.x, e.y, e.atk);
      for (const e of voidEnemies)      checkEnemyContact(e.x, e.y, e.atk);
      for (const e of quartzEnemies)    checkEnemyContact(e.x, e.y, e.atk);
      for (const e of rubyEnemies)      checkEnemyContact(e.x, e.y, e.atk);
      for (const e of sunstoneEnemies)  checkEnemyContact(e.x, e.y, e.atk);
      for (const e of citrineEnemies)   checkEnemyContact(e.x, e.y, e.atk);
      for (const e of ioliteEnemies)    checkEnemyContact(e.x, e.y, e.atk);
      for (const e of amethystEnemies)  checkEnemyContact(e.x, e.y, e.atk);
      for (const e of diamondEnemies)   checkEnemyContact(e.x, e.y, e.atk);
      for (const e of nullstoneEnemies) checkEnemyContact(e.x, e.y, e.atk);
      for (const e of fracterylEnemies) checkEnemyContact(e.x, e.y, e.atk);
      for (const e of eigensteinEnemies) checkEnemyContact(e.x, e.y, e.atk);

      // Proximity check — detonate if any enemy enters trigger radius.
      let triggered = false;
      const prox2 = mine.proximityRadius * mine.proximityRadius;
      const inProximity = (ex: number, ey: number) => {
        const dx = ex - mine.x, dy = ey - mine.y;
        return dx * dx + dy * dy <= prox2;
      };
      if (!triggered) for (const e of enemies)          { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of sapphireEnemies)  { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of emeraldEnemies)   { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of amberEnemies)     { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of voidEnemies)      { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of quartzEnemies)    { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of rubyEnemies)      { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of sunstoneEnemies)  { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of citrineEnemies)   { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of ioliteEnemies)    { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of amethystEnemies)  { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of diamondEnemies)   { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of nullstoneEnemies) { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of fracterylEnemies) { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of eigensteinEnemies) { if (inProximity(e.x, e.y)) { triggered = true; break; } }

      // Detonate if fuse expired, proximity triggered, or HP depleted by incoming damage.
      if (mine.fuseMs <= 0 || triggered || mine.hp <= 0) {
        detonateMine(i);
      }
    }
  }


  // ── Ruby laser beam system ─────────────────────────────────────

  function fireLaserBeam(targetX: number, targetY: number, weaponId: string): void {
    const dx = targetX - mote.x, dy = targetY - mote.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) return;
    const dirX = dx / dist, dirY = dy / dist;
    laserBeamEffect = { active: true, startX: mote.x, startY: mote.y, dirX, dirY, timerMs: LASER_BEAM_VISIBLE_MS, endX: 0, endY: 0 };

    // Compute the endpoint (extend to canvas edge)
    let tMax = Infinity;
    if (dirX > 0)  tMax = Math.min(tMax, (dim.w  - mote.x) / dirX);
    if (dirX < 0)  tMax = Math.min(tMax, -mote.x / dirX);
    if (dirY > 0)  tMax = Math.min(tMax, (dim.h - mote.y) / dirY);
    if (dirY < 0)  tMax = Math.min(tMax, -mote.y / dirY);
    const endX = mote.x + dirX * tMax;
    const endY = mote.y + dirY * tMax;

    const weaponDef = WEAPON_BY_ID.get(weaponId);
    const tier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const baseDamage = getScaledWeaponDamage(weaponDef?.stats.damage ?? 80, tier, playerStats.atk);

    // Hit every laser enemy on the beam path
    for (const e of enemies) {
      // Point-to-line distance
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= LASER_ENEMY_SIZE * 2) {
        const dmg = damageEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit every sapphire enemy on the beam path (bypasses shield)
    for (const e of sapphireEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= SAPPHIRE_SHIELD_RADIUS + 2) {
        const dmg = damageSapphireEnemy(e, baseDamage, 1.0, true);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit missiles on the beam path
    for (const m of sapphireMissiles) {
      const ex = m.x - mote.x, ey = m.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= MISSILE_SIZE * 2) {
        damageMissile(m, baseDamage);
      }
    }

    // Hit emerald enemies on the beam path
    for (const e of emeraldEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= EMERALD_ENEMY_SIZE * 2) {
        const dmg = damageEmeraldEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit amber enemies on the beam path
    for (const e of amberEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= AMBER_ENEMY_SIZE * 2) {
        const dmg = damageAmberEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit amber shards on the beam path
    for (const s of amberShards) {
      const ex = s.x - mote.x, ey = s.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= AMBER_SHARD_SIZE * 2) {
        damageAmberShard(s, baseDamage);
      }
    }

    // Hit void enemies on the beam path
    for (const e of voidEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= VOID_ENEMY_SIZE * 2) {
        const dmg = damageVoidEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit quartz enemies on the beam path
    for (const e of quartzEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= QUARTZ_ENEMY_SIZE * 2) {
        const dmg = damageQuartzEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit ruby enemies on the beam path
    for (const e of rubyEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= RUBY_ENEMY_SIZE * 2) {
        const dmg = damageRubyEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit sunstone enemies on the beam path
    for (const e of sunstoneEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= SUNSTONE_ENEMY_SIZE * 2) {
        const dmg = damageSunstoneEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit citrine enemies on the beam path
    for (const e of citrineEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= CITRINE_ENEMY_SIZE * 2) {
        const dmg = damageCitrineEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit iolite enemies on the beam path
    for (const e of ioliteEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= IOLITE_ENEMY_SIZE * 2) {
        const dmg = damageIoliteEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit amethyst enemies on the beam path (bypasses shield)
    for (const e of amethystEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= AMETHYST_ENEMY_SIZE * 2) {
        const dmg = damageAmethystEnemy(e, baseDamage, 1.0, true);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit diamond enemies on the beam path
    for (const e of diamondEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= DIAMOND_ENEMY_SIZE * 2) {
        const dmg = damageDiamondEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit nullstone enemies on the beam path
    for (const e of nullstoneEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= NULLSTONE_ENEMY_SIZE * 2) {
        const dmg = damageNullstoneEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit fracteryl enemies on the beam path
    for (const e of fracterylEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= FRACTERYL_ENEMY_SIZE * 2) {
        const dmg = damageFracterylEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit eigenstein enemies on the beam path
    for (const e of eigensteinEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= EIGENSTEIN_ENEMY_SIZE * 2) {
        const dmg = damageEigensteinEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit boss on the beam path
    if (ctx.bossEnemy) {
      const bossSize = BOSS_SIZE_BASE + ctx.bossEnemy.bossId * 1.5;
      const ex = ctx.bossEnemy.x - mote.x, ey = ctx.bossEnemy.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj >= 0 && tProj <= tMax) {
        const perpDist = Math.abs(ex * dirY - ey * dirX);
        if (perpDist <= bossSize) {
          const dmg = damageBossEnemy(baseDamage, 1.0);
          if (dmg > 0) {
            hitEffects.push({ x: ctx.bossEnemy.x, y: ctx.bossEnemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
            spawnDamageNumber(ctx.bossEnemy.x, ctx.bossEnemy.y, 0, -1, String(Math.round(dmg)), dmg / ctx.bossEnemy.maxHp, LASER_BEAM_COLOR);
          }
        }
      }
    }

    // Store end coords for drawing
    laserBeamEffect.startX = mote.x; laserBeamEffect.startY = mote.y;
    laserBeamEffect.endX = endX;
    laserBeamEffect.endY = endY;

    // Inject beam force along its length: sample multiple points from muzzle
    // to edge, creating a strong directional fluid channel in the beam color.
    const beamLen = tMax;
    const beamSteps = Math.max(4, Math.floor(beamLen / 20));
    for (let k = 0; k <= beamSteps; k++) {
      const t = k / beamSteps;
      fluid.addForce({
        x: mote.x + dirX * beamLen * t,
        y: mote.y + dirY * beamLen * t,
        vx: dirX * FLUID_VEL_FRAME_TO_PX_S * 3.0,
        vy: dirY * FLUID_VEL_FRAME_TO_PX_S * 3.0,
        r: FLUID_BEAM_R, g: FLUID_BEAM_G, b: FLUID_BEAM_B,
        strength: FLUID_LASER_BEAM_STRENGTH,
      });
    }
  }

  function updateLaserBeamEffect(deltaMs: number): void {
    if (!laserBeamEffect || !laserBeamEffect.active) return;
    laserBeamEffect.timerMs -= deltaMs;
    if (laserBeamEffect.timerMs <= 0) laserBeamEffect.active = false;
  }

  // ── Sand blade (starter weapon, no weapon equipped) ───────────────

  /**
   * Updates the sand blade combo state when no weapon is equipped.
   * Reuses the sword combo state machine under the sentinel key __base__.
   */
  function updateSandBlade(deltaMs: number): void {
    ctx.withDamageSource(BASE_ATTACK_TIMER_KEY, () => updateSwordCombo(BASE_ATTACK_TIMER_KEY, deltaMs));
  }

  // ── Expose laserBeamEffect as getter so handle stays in sync ──
  // (laserBeamEffect is a let variable that gets replaced, not mutated)
  return {
    get sandProjectiles() { return sandProjectiles; },
    get chainWhipStates() { return chainWhipStates; },
    get activeVortexes() { return activeVortexes; },
    get vortexWeaponStates() { return vortexWeaponStates; },
    get swordComboStates() { return swordComboStates; },
    get poisonBolts() { return poisonBolts; },
    get emeraldPlayerMissiles() { return emeraldPlayerMissiles; },
    get emeraldSubMissiles() { return emeraldSubMissiles; },
    get emeraldSwirlParticles() { return emeraldSwirlParticles; },
    get sunstoneMines() { return sunstoneMines; },
    get laserBeamEffect() { return laserBeamEffect; },
    get sapphireShips() { return ships.sapphireShips; },
    get sapphireLasers() { return ships.sapphireLasers; },
    get amethystShips() { return ships.amethystShips; },
    get amethystLasers() { return ships.amethystLasers; },

    updateSandProjectiles,
    updateChainWhip,
    updateVortexWeapon,
    updateVortexes,
    updateSwordCombo,
    updatePoisonBolts,
    updatePoisonDebuffs,
    updateEmeraldPlayerMissiles,
    updateEmeraldSubMissiles,
    updateEmeraldSwirlParticles,
    updateSunstoneMines,
    updateLaserBeamEffect,
    updateSapphireShips: (deltaMs: number) => ships.updateSapphireShips(deltaMs),
    updateSapphireLasers: (deltaMs: number) => ships.updateSapphireLasers(deltaMs),
    updateAmethystShips: (deltaMs: number) => ships.updateAmethystShips(deltaMs),
    updateAmethystLasers: (deltaMs: number) => ships.updateAmethystLasers(deltaMs),
    updateSandBlade,

    syncSapphireShips: () => ships.syncSapphireShips(),
    syncAmethystShips: () => ships.syncAmethystShips(),

    spawnSandProjectile,
    spawnPoisonBolt,
    spawnEmeraldMissile,
    fireLaserBeam,
    layMine,

    reset(): void {
      sandProjectiles.length = 0;
      chainWhipStates.clear();
      activeVortexes.length = 0;
      vortexWeaponStates.clear();
      swordComboStates.clear();
      poisonBolts.length = 0;
      poisonDebuffs.clear();
      emeraldPlayerMissiles.length = 0;
      emeraldSubMissiles.length = 0;
      sunstoneMines.length = 0;
      laserBeamEffect = null;
      ships.reset();
    },
  };
}
