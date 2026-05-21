/**
 * rpg-player-attack.ts — Player auto-attack dispatch for the RPG tab.
 *
 * Exports:
 *   RpgPlayerAttackCtx — dependency-injection context (all enemy arrays,
 *                        damage functions, visual spawners, fluid ref, etc.)
 *   performWeaponAttack(ctx, weaponId) — main entry point called once per
 *                        weapon cooldown tick. Dispatches to the appropriate
 *                        attack-mode handler:
 *
 *     • Delegating kinds (gatling, chainWhip, vortex, swordCombo, poisonBolt,
 *       emeraldMissile, laserBeam) — handled here with early returns.
 *     • sunstoneMine — handled here (no target needed).
 *     • aoe     → rpg-player-attack-aoe.ts    (performAoeAttack)
 *     • multi   → rpg-player-attack-multi.ts  (performMultiAttack)
 *     • single / piercing → rpg-player-attack-single.ts (performSingleAttack)
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getScaledWeaponDamage } from '../../sim/rpg/rpg-state';
import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import { PLAYER_BASE_RANGE_PX } from './rpg-constants';
import type { LaserEnemy, SapphireMissile, RpgPlayerStats, SapphireEnemy } from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy, AmberShard,
  VoidEnemy, QuartzEnemy, QuartzSpike,
  RubyEnemy, RubyBolt, SunstoneEnemy,
  CitrineEnemy, CitrineBolt, IoliteEnemy,
  AmethystEnemy, AmethystShard, DiamondEnemy, DiamondShard,
  NullstoneEnemy, VoidTendril, FracterylEnemy, FracterylShard,
  EigensteinEnemy, BossEnemy, EliteEnemy,
} from './rpg-enemy-types';
import type { AlivenParticle, AlivenParticleGroup } from './rpg-aliven-types';
import type { ClosestTarget } from './rpg-types';
import { performAoeAttack } from './rpg-player-attack-aoe';
import { performMultiAttack } from './rpg-player-attack-multi';
import { performSingleAttack } from './rpg-player-attack-single';

// ── Dependency-injection context ──────────────────────────────────────────────

export interface RpgPlayerAttackCtx {
  // Player mote (live reference)
  mote: { x: number; y: number };

  // Live getter — bossEnemy changes during gameplay
  readonly bossEnemy: BossEnemy | null;

  // Sim state and player stats
  rpgSimState: RpgSimState;
  playerStats: RpgPlayerStats;

  // All enemy arrays (live references)
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
  plantProjectiles: import('./rpg-procedural-types').PlantProjectile[];

  // Per-enemy damage functions
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
  damageAlivenParticle: (particle: AlivenParticle, group: AlivenParticleGroup, dmg: number) => number;
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
  damagePlantProjectile: (p: import('./rpg-procedural-types').PlantProjectile, raw: number) => number;

  // Visual spawners
  spawnHitVisuals: (enemy: LaserEnemy, dmg: number, color: string) => void;
  spawnHitVisualsAt: (x: number, y: number, maxHp: number, dmg: number, color: string) => void;

  // Fluid explosion
  fluid: {
    addExplosion(x: number, y: number, strength: number, r: number, g: number, b: number): void;
  };

  // Targeting
  findClosestTarget: (rangeSq: number) => ClosestTarget | null;

  // Weapon spawn callbacks (from weaponSystems handle)
  spawnSandProjectile: (targetX: number, targetY: number, damage: number) => void;
  spawnPoisonBolt: (targetX: number, targetY: number, weaponId: string, tier: number, damage: number) => void;
  spawnEmeraldMissile: (targetX: number, targetY: number, damage: number, tier: number) => void;
  fireLaserBeam: (targetX: number, targetY: number, weaponId: string) => void;
  layMine: (damage: number, tier: number) => void;
}

// ── Attack dispatch ───────────────────────────────────────────────────────────

/**
 * Fires the player's equipped weapon at enemies once per cooldown tick.
 * Delegates to the appropriate handler module for aoe / multi / single.
 */
export function performWeaponAttack(ctx: RpgPlayerAttackCtx, weaponId: string): void {
  const { rpgSimState, playerStats, findClosestTarget } = ctx;
  const bossEnemy = ctx.bossEnemy;

  const weaponDef = WEAPON_BY_ID.get(weaponId);

  // Sunstone mines can always be placed (no target needed).
  if (weaponDef?.stats.effect?.kind === 'sunstoneMine') {
    const tier      = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const rawDamage = weaponDef
      ? getScaledWeaponDamage(weaponDef.stats.damage, tier, playerStats.atk)
      : playerStats.atk;
    ctx.layMine(rawDamage, tier);
    return;
  }

  // Skip if no enemies present.
  const { enemies, sapphireEnemies, sapphireMissiles,
    emeraldEnemies, amberEnemies, amberShards, voidEnemies,
    quartzEnemies, quartzSpikes, rubyEnemies, rubyBolts,
    sunstoneEnemies, citrineEnemies, citrineBolts,
    ioliteEnemies, amethystEnemies, amethystShards,
    diamondEnemies, diamondShards, nullstoneEnemies, voidTendrils,
    fracterylEnemies, fracterylShards, eigensteinEnemies,
    eliteEnemies, alivenGroups,
    dustWispEnemies, ribbonWormEnemies, lanternMothEnemies, eyeStalkEnemies,
    jellyfishEnemies, clothGhostEnemies, plantTurretEnemies, gearInsectEnemies,
    spiderCrawlerEnemies, moteSwarmEnemies, shadowHandEnemies, plantProjectiles,
  } = ctx;
  let alivenParticleCount = 0;
  for (const g of alivenGroups) {
    for (const p of g.particles) { if (p.isAlive) alivenParticleCount++; }
  }
  const totalTargets = enemies.length + sapphireEnemies.length + sapphireMissiles.length
    + emeraldEnemies.length + amberEnemies.length + amberShards.length + voidEnemies.length
    + quartzEnemies.length + quartzSpikes.length + rubyEnemies.length + rubyBolts.length
    + sunstoneEnemies.length + citrineEnemies.length + citrineBolts.length
    + ioliteEnemies.length + amethystEnemies.length + amethystShards.length
    + diamondEnemies.length + diamondShards.length + nullstoneEnemies.length + voidTendrils.length
    + fracterylEnemies.length + fracterylShards.length + eigensteinEnemies.length
    + eliteEnemies.length + alivenParticleCount
    + dustWispEnemies.length + ribbonWormEnemies.length + lanternMothEnemies.length
    + eyeStalkEnemies.length + jellyfishEnemies.length + clothGhostEnemies.length
    + plantTurretEnemies.length + gearInsectEnemies.length + spiderCrawlerEnemies.length
    + moteSwarmEnemies.length + shadowHandEnemies.length + plantProjectiles.length
    + (bossEnemy ? 1 : 0);
  if (totalTargets === 0) return;

  const range     = weaponDef?.stats.range ?? PLAYER_BASE_RANGE_PX;
  const tier      = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
  const rawDamage = weaponDef
    ? getScaledWeaponDamage(weaponDef.stats.damage, tier, playerStats.atk)
    : playerStats.atk;
  const effect    = weaponDef?.stats.effect ?? { kind: 'single' as const };
  const rangeSq   = range * range;

  // ── Delegating weapon kinds (self-managed or projectile-based) ────────────

  if (effect.kind === 'gatling') {
    const target = findClosestTarget(rangeSq);
    if (target) ctx.spawnSandProjectile(target.x, target.y, rawDamage);
    return;
  }

  if (effect.kind === 'chainWhip') return; // lash triggered inside updateChainWhip()
  if (effect.kind === 'vortex' || effect.kind === 'swordCombo') return; // self-managed

  if (effect.kind === 'poisonBolt') {
    const target = findClosestTarget(rangeSq);
    if (target) ctx.spawnPoisonBolt(target.x, target.y, weaponId, tier, rawDamage);
    return;
  }

  if (effect.kind === 'emeraldMissile') {
    const target = findClosestTarget(rangeSq);
    if (target) ctx.spawnEmeraldMissile(target.x, target.y, rawDamage, tier);
    return;
  }

  if (effect.kind === 'laserBeam') {
    const target = findClosestTarget(rangeSq);
    if (target) ctx.fireLaserBeam(target.x, target.y, weaponId);
    return;
  }

  // ── Attack-mode handlers ──────────────────────────────────────────────────

  if (effect.kind === 'aoe') {
    performAoeAttack(ctx, rawDamage, effect.aoeRadius);
    return;
  }

  if (effect.kind === 'multi') {
    performMultiAttack(ctx, rawDamage, rangeSq, effect.targetCount);
    return;
  }

  // single / piercing
  const isPiercing     = effect.kind === 'piercing';
  const defPierceRatio = isPiercing ? effect.defPierceRatio : 0;
  performSingleAttack(ctx, rawDamage, rangeSq, isPiercing, defPierceRatio, '#ffd764');
}
