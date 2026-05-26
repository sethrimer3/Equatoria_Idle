/**
 * rpg-weapon-systems.ts — Orchestrator for all player weapon systems.
 *
 * Extracted from rpg-render.ts to keep the render module focused on drawing.
 * This file composes the per-weapon sub-modules and exposes a unified
 * `RpgWeaponHandle` to the render module.
 *
 * Sub-modules:
 *   • rpg-weapon-sand.ts      — sand gatling projectiles
 *   • rpg-weapon-chain.ts     — quartz chain whip (spring physics)
 *   • rpg-weapon-vortex.ts    — nullstone vortex spawner and updater
 *   • rpg-weapon-poison.ts    — iolite poison bolt + debuff
 *   • rpg-weapon-sunstone.ts  — sunstone fused proximity mine
 *   • rpg-weapon-sword.ts     — diamond sword combo state machine
 *   • rpg-weapon-emerald.ts   — emerald homing missiles
 *   • rpg-weapon-laser-beam.ts — ruby continuous laser beam
 *   • rpg-weapon-ships.ts     — sapphire/amethyst companion ships
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import {
  BASE_ATTACK_TIMER_KEY,
} from './rpg-constants';
import type { FluidImpulse } from './rpg-fluid';
import type { RpgPlayerStats } from './rpg-types';
import type {
  SandProjectile, ChainWhipState,
  LaserBeamEffect, NullstoneVortex, VortexWeaponState,
  SwordComboState,
  IolitePoisonBolt,
  LaserEnemy, SapphireEnemy, SapphireMissile, HitEffect,
} from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy, AmberShard,
  VoidEnemy, QuartzEnemy, QuartzSpike,
  RubyEnemy, RubyBolt, SunstoneEnemy, CitrineEnemy, CitrineBolt,
  IoliteEnemy, AmethystEnemy, AmethystShard,
  DiamondEnemy, DiamondShard, NullstoneEnemy, VoidTendril,
  FracterylEnemy, FracterylShard, EigensteinEnemy,
  BossEnemy, EliteEnemy, StardustEnemy,
  EmeraldPlayerMissile, EmeraldSubMissile, EmeraldSwirlParticle,
  SunstoneMine,
  SapphireShip, SapphireLaser,
  AmethystShip, AmethystLaser,
} from './rpg-enemy-types';
import type { BinaryRingEnemy } from './rpg-binary-ring-encounter';
import type { ClosestTarget } from './rpg-types';
import type { AlivenParticle, AlivenParticleGroup } from './rpg-aliven-types';
import type { TopographicTerrainState } from './terrain/topographic-terrain';
import { createShipWeaponSystems } from './rpg-weapon-ships';
import { createSandWeaponSystem } from './rpg-weapon-sand';
import { createChainWeaponSystem } from './rpg-weapon-chain';
import { createVortexWeaponSystem } from './rpg-weapon-vortex';
import { createPoisonWeaponSystem } from './rpg-weapon-poison';
import { createSunstoneWeaponSystem } from './rpg-weapon-sunstone';
import { createSwordWeaponSystem } from './rpg-weapon-sword';
import { createEmeraldWeaponSystem } from './rpg-weapon-emerald';
import { createLaserBeamWeaponSystem } from './rpg-weapon-laser-beam';

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
  eliteEnemies: EliteEnemy[];
  binaryRingEnemies: BinaryRingEnemy[];
  stardustEnemies: StardustEnemy[];
  alivenGroups: AlivenParticleGroup[];
  // ── Procedural creature arrays ──────────────────────────────────────────────
  dustWispEnemies: import('./rpg-procedural-types').DustWispEnemy[];
  ribbonWormEnemies: import('./rpg-procedural-types').RibbonWormEnemy[];
  lanternMothEnemies: import('./rpg-procedural-types').LanternMothEnemy[];
  eyeStalkEnemies: import('./rpg-procedural-types').EyeStalkEnemy[];
  jellyfishEnemies: import('./rpg-procedural-types').JellyfishEnemy[];
  clothGhostEnemies: import('./rpg-procedural-types').ClothGhostEnemy[];
  plantTurretEnemies: import('./rpg-procedural-types').PlantTurretEnemy[];
  gearInsectEnemies: import('./rpg-procedural-types').GearInsectEnemy[];
  spiderCrawlerEnemies: import('./rpg-procedural-types').SpiderCrawlerEnemy[];
  moteSwarmEnemies: import('./rpg-procedural-types').MoteSwarmEnemy[];
  shadowHandEnemies: import('./rpg-procedural-types').ShadowHandEnemy[];
  sandFishEnemies: import('./rpg-procedural-types').SandFishEnemy[];
  quartzFishEnemies: import('./rpg-procedural-types').QuartzFishEnemy[];
  rubyFishEnemies: import('./rpg-procedural-types').RubyFishEnemy[];
  sunstoneFishEnemies: import('./rpg-procedural-types').SunstoneFishEnemy[];
  emeraldFishEnemies: import('./rpg-procedural-types').EmeraldFishEnemy[];
  sapphireFishEnemies: import('./rpg-procedural-types').SapphireFishEnemy[];
  amethystFishEnemies: import('./rpg-procedural-types').AmethystFishEnemy[];
  diamondFishEnemies: import('./rpg-procedural-types').DiamondFishEnemy[];
  plantProjectiles: import('./rpg-procedural-types').PlantProjectile[];

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
  damageEliteEnemy: (enemy: EliteEnemy, dmg: number, armorMult: number) => number;
  damageBossEnemy: (rawDamage: number, defPierceRatio: number, fromDiamondBlade?: boolean) => number;
  damageAlivenParticle: (particle: AlivenParticle, group: AlivenParticleGroup, rawDamage: number) => number;
  // ── Proc creature damage fns ────────────────────────────────────────────────
  damageDustWispEnemy: (e: import('./rpg-procedural-types').DustWispEnemy, raw: number, pierce: number) => number;
  damageRibbonWormEnemy: (e: import('./rpg-procedural-types').RibbonWormEnemy, raw: number, pierce: number) => number;
  damageLanternMothEnemy: (e: import('./rpg-procedural-types').LanternMothEnemy, raw: number, pierce: number) => number;
  damageEyeStalkEnemy: (e: import('./rpg-procedural-types').EyeStalkEnemy, raw: number, pierce: number) => number;
  damageJellyfishEnemy: (e: import('./rpg-procedural-types').JellyfishEnemy, raw: number, pierce: number) => number;
  damageClothGhostEnemy: (e: import('./rpg-procedural-types').ClothGhostEnemy, raw: number, pierce: number) => number;
  damagePlantTurretEnemy: (e: import('./rpg-procedural-types').PlantTurretEnemy, raw: number, pierce: number) => number;
  damageGearInsectEnemy: (e: import('./rpg-procedural-types').GearInsectEnemy, raw: number, pierce: number) => number;
  damageSpiderCrawlerEnemy: (e: import('./rpg-procedural-types').SpiderCrawlerEnemy, raw: number, pierce: number) => number;
  damageMoteSwarmEnemy: (e: import('./rpg-procedural-types').MoteSwarmEnemy, raw: number, pierce: number) => number;
  damageShadowHandEnemy: (e: import('./rpg-procedural-types').ShadowHandEnemy, raw: number, pierce: number) => number;
  damageSandFishEnemy: (e: import('./rpg-procedural-types').SandFishEnemy, raw: number, pierce: number) => number;
  damageQuartzFishEnemy: (e: import('./rpg-procedural-types').QuartzFishEnemy, raw: number, pierce: number, bypassShield: boolean) => number;
  damageRubyFishEnemy: (e: import('./rpg-procedural-types').RubyFishEnemy, raw: number, pierce: number) => number;
  damageSunstoneFishEnemy: (e: import('./rpg-procedural-types').SunstoneFishEnemy, raw: number, pierce: number) => number;
  damageEmeraldFishEnemy: (e: import('./rpg-procedural-types').EmeraldFishEnemy, raw: number, pierce: number) => number;
  damageSapphireFishEnemy: (e: import('./rpg-procedural-types').SapphireFishEnemy, raw: number, pierce: number) => number;
  damageAmethystFishEnemy: (e: import('./rpg-procedural-types').AmethystFishEnemy, raw: number, pierce: number) => number;
  damageDiamondFishEnemy: (e: import('./rpg-procedural-types').DiamondFishEnemy, raw: number, pierce: number) => number;
  damagePlantProjectile: (p: import('./rpg-procedural-types').PlantProjectile, raw: number) => number;

  // Generic multi-type targeting and damage
  damageBodyTarget: (target: ClosestTarget, rawDamage: number, defPierceRatio: number, bypassShield: boolean) => number;
  findClosestTarget: (rangeSq: number) => ClosestTarget | null;
  findClosestEnemy: (rangeSq: number) => { x: number; y: number } | null;
  collectEnemyBodyTargets: () => ClosestTarget[];
  findClosestEnemyFrom: (x: number, y: number, rangeSq: number) => ClosestTarget | null;
  getTargetedEnemy: () => ClosestTarget | null;

  // Visual spawners
  spawnDamageNumber: (x: number, y: number, vx: number, vy: number, text: string, healthFraction: number, color: string, sourceColor?: string) => void;
  spawnHitVisuals: (enemy: LaserEnemy, dmg: number, color: string, sourceColor?: string) => void;
  spawnHitVisualsAt: (x: number, y: number, maxHp: number, dmg: number, color: string, sourceColor?: string) => void;

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
  /** Returns the current topographic terrain state, or null if none is active. */
  getTerrainState: () => TopographicTerrainState | null;
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

export function createRpgWeaponSystems(ctx: RpgWeaponCtx): RpgWeaponHandle {
  // ── Sub-system modules ─────────────────────────────────────────
  const ships = createShipWeaponSystems(ctx);
  const sand = createSandWeaponSystem(ctx);
  const chain = createChainWeaponSystem(ctx);
  const vortex = createVortexWeaponSystem(ctx);
  const poison = createPoisonWeaponSystem(ctx);
  const sunstone = createSunstoneWeaponSystem(ctx);
  const sword = createSwordWeaponSystem(ctx);
  const emerald = createEmeraldWeaponSystem(ctx);
  const laserBeam = createLaserBeamWeaponSystem(ctx);


  // ── Sand blade (starter weapon, no weapon equipped) ───────────────

  /**
   * Updates the sand blade combo state when no weapon is equipped.
   * Reuses the sword combo state machine under the sentinel key __base__.
   */
  function updateSandBlade(deltaMs: number): void {
    ctx.withDamageSource(BASE_ATTACK_TIMER_KEY, () => sword.updateSwordCombo(BASE_ATTACK_TIMER_KEY, deltaMs));
  }

  // ── Expose laserBeamEffect as getter so handle stays in sync ──
  // (laserBeamEffect is a let variable that gets replaced, not mutated)
  return {
    get sandProjectiles() { return sand.sandProjectiles; },
    get chainWhipStates() { return chain.chainWhipStates; },
    get activeVortexes() { return vortex.activeVortexes; },
    get vortexWeaponStates() { return vortex.vortexWeaponStates; },
    get swordComboStates() { return sword.swordComboStates; },
    get poisonBolts() { return poison.poisonBolts; },
    get emeraldPlayerMissiles() { return emerald.emeraldPlayerMissiles; },
    get emeraldSubMissiles() { return emerald.emeraldSubMissiles; },
    get emeraldSwirlParticles() { return emerald.emeraldSwirlParticles; },
    get sunstoneMines() { return sunstone.sunstoneMines; },
    get laserBeamEffect() { return laserBeam.laserBeamEffect; },
    get sapphireShips() { return ships.sapphireShips; },
    get sapphireLasers() { return ships.sapphireLasers; },
    get amethystShips() { return ships.amethystShips; },
    get amethystLasers() { return ships.amethystLasers; },

    updateSandProjectiles: (deltaMs: number) => sand.updateSandProjectiles(deltaMs),
    updateChainWhip: (weaponId: string, deltaMs: number) => chain.updateChainWhip(weaponId, deltaMs),
    updateVortexWeapon: (weaponId: string, deltaMs: number) => vortex.updateVortexWeapon(weaponId, deltaMs),
    updateVortexes: (deltaMs: number) => vortex.updateVortexes(deltaMs),
    updateSwordCombo: (weaponId: string, deltaMs: number) => sword.updateSwordCombo(weaponId, deltaMs),
    updatePoisonBolts: (deltaMs: number) => poison.updatePoisonBolts(deltaMs),
    updatePoisonDebuffs: (deltaMs: number) => poison.updatePoisonDebuffs(deltaMs),
    updateEmeraldPlayerMissiles: (deltaMs: number) => emerald.updateEmeraldPlayerMissiles(deltaMs),
    updateEmeraldSubMissiles: (deltaMs: number) => emerald.updateEmeraldSubMissiles(deltaMs),
    updateEmeraldSwirlParticles: (deltaMs: number) => emerald.updateEmeraldSwirlParticles(deltaMs),
    updateSunstoneMines: (deltaMs: number) => sunstone.updateSunstoneMines(deltaMs),
    updateLaserBeamEffect: (deltaMs: number) => laserBeam.updateLaserBeamEffect(deltaMs),
    updateSapphireShips: (deltaMs: number) => ships.updateSapphireShips(deltaMs),
    updateSapphireLasers: (deltaMs: number) => ships.updateSapphireLasers(deltaMs),
    updateAmethystShips: (deltaMs: number) => ships.updateAmethystShips(deltaMs),
    updateAmethystLasers: (deltaMs: number) => ships.updateAmethystLasers(deltaMs),
    updateSandBlade,

    syncSapphireShips: () => ships.syncSapphireShips(),
    syncAmethystShips: () => ships.syncAmethystShips(),

    spawnSandProjectile: (targetX: number, targetY: number, damage: number) => sand.spawnSandProjectile(targetX, targetY, damage),
    spawnPoisonBolt: (targetX: number, targetY: number, weaponId: string, tier: number, damage: number) => poison.spawnPoisonBolt(targetX, targetY, weaponId, tier, damage),
    spawnEmeraldMissile: (targetX: number, targetY: number, damage: number, tier: number) => emerald.spawnEmeraldMissile(targetX, targetY, damage, tier),
    fireLaserBeam: (targetX: number, targetY: number, weaponId: string) => laserBeam.fireLaserBeam(targetX, targetY, weaponId),
    layMine: (damage: number, tier: number) => sunstone.layMine(damage, tier),

    reset(): void {
      sand.reset();
      chain.reset();
      vortex.reset();
      sword.reset();
      poison.reset();
      emerald.reset();
      sunstone.reset();
      laserBeam.reset();
      ships.reset();
    },
  };
}
