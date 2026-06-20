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
import { getScaledWeaponDamage, getSkillNodeRank } from '../../sim/rpg/rpg-state';
import { resolveWeaponDefinition, resolveCraftedWeaponModifiers } from '../../data/rpg/crafted-weapon-helpers';
import { TIER_BY_ID } from '../../data/tiers';
import { PLAYER_BASE_RANGE_PX } from './rpg-constants';
import type { LaserEnemy, SapphireMissile, RpgPlayerStats, SapphireEnemy } from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy, AmberShard,
  VoidEnemy, QuartzEnemy, QuartzSpike,
  RubyEnemy, RubyBolt, SunstoneEnemy,
  CitrineEnemy, CitrineBolt, IoliteEnemy,
  AmethystEnemy, AmethystShard, DiamondEnemy, DiamondShard,
  NullstoneEnemy, VoidTendril, FracterylEnemy, FracterylShard,
  EigensteinEnemy, BossEnemy, EliteEnemy, StardustEnemy,
} from './rpg-enemy-types';
import type { AlivenParticle, AlivenParticleGroup } from './rpg-aliven-types';
import type { ClosestTarget } from './rpg-types';
import type { BinaryRingEnemy } from './rpg-binary-ring-encounter';
import type {
  PolyominoEnemy, FissilePolyominoEnemy, RefractorPolyominoEnemy,
} from './polyomino-enemy-types';
import { performAoeAttack } from './rpg-player-attack-aoe';
import { performMultiAttack } from './rpg-player-attack-multi';
import { performSingleAttack } from './rpg-player-attack-single';
import {
  applyEquipmentModifiersToAttackContext,
  getCombinedEquipmentModifiers,
  type CombinedEquipmentModifiers,
} from '../../data/rpg/equipment-modifiers';

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
  polyominoEnemies: PolyominoEnemy[];
  fissilePolyominoEnemies: FissilePolyominoEnemy[];
  refractorPolyominoEnemies: RefractorPolyominoEnemy[];
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
  eliteJellyfishEnemies: import('./rpg-jellyfish-elite-types').EliteJellyfishEnemy[];
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
  damagePolyominoEnemy: (enemy: PolyominoEnemy, dmg: number, armorMult: number) => number;
  damageFissilePolyominoEnemy: (enemy: FissilePolyominoEnemy, dmg: number, armorMult: number) => number;
  damageRefractorPolyominoEnemy: (enemy: RefractorPolyominoEnemy, dmg: number, armorMult: number) => number;
  damageEliteEnemy: (enemy: EliteEnemy, dmg: number, armorMult: number) => number;
  damageBossEnemy: (rawDamage: number, defPierceRatio: number, fromDiamondBlade?: boolean) => number;
  damageAlivenParticle: (particle: AlivenParticle, group: AlivenParticleGroup, dmg: number) => number;
  // ── Proc creature damage fns ────────────────────────────────────────────────
  damageDustWispEnemy: (e: import('./rpg-procedural-types').DustWispEnemy, raw: number, pierce: number) => number;
  damageRibbonWormEnemy: (e: import('./rpg-procedural-types').RibbonWormEnemy, raw: number, pierce: number) => number;
  damageLanternMothEnemy: (e: import('./rpg-procedural-types').LanternMothEnemy, raw: number, pierce: number) => number;
  damageEyeStalkEnemy: (e: import('./rpg-procedural-types').EyeStalkEnemy, raw: number, pierce: number) => number;
  damageJellyfishEnemy: (e: import('./rpg-procedural-types').JellyfishEnemy, raw: number, pierce: number) => number;
  damageEliteJellyfishEnemy: (e: import('./rpg-jellyfish-elite-types').EliteJellyfishEnemy, raw: number, pierce: number) => number;
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
  horizonPentagonGroups: import('./horizon-pentagon-types').HorizonPentagonGroup[];
  damageHorizonPentagonReal: (g: import('./horizon-pentagon-types').HorizonPentagonGroup, raw: number, pierce: number) => number;
  damageHorizonMissile: (m: import('./horizon-pentagon-types').HorizonMissile, raw: number, pierce: number) => number;

  // Visual spawners
  spawnHitVisuals: (enemy: LaserEnemy, dmg: number, color: string, sourceColor?: string) => void;
  spawnHitVisualsAt: (x: number, y: number, maxHp: number, dmg: number, color: string, sourceColor?: string) => void;
  spawnDamageNumber: (x: number, y: number, vx: number, vy: number, text: string, ratio: number, color: string) => void;
  /** Spawn a short-lived combo burst effect at (x, y) for the given combo. */
  spawnComboEffect: (x: number, y: number, comboId: string, color: string) => void;

  // Fluid explosion
  fluid: {
    addExplosion(x: number, y: number, strength: number, r: number, g: number, b: number): void;
  };

  // Targeting
  findClosestTarget: (rangeSq: number) => ClosestTarget | null;

  // Weapon spawn callbacks (from weaponSystems handle)
  spawnSandProjectile: (targetX: number, targetY: number, damage: number) => void;
  spawnPoisonBolt: (targetX: number, targetY: number, weaponId: string, tier: number, damage: number) => void;
  spawnEmeraldMissile: (targetX: number, targetY: number, damage: number, tier: number, bonusDetectPx?: number) => void;
  fireLaserBeam: (targetX: number, targetY: number, weaponId: string) => void;
  layMine: (damage: number, tier: number) => void;
  spawnFracterylSpearVolley: (weaponId: string, damage: number, tier: number) => void;

  /**
   * Optional hook called after a real weapon hit (finalDmg > 0) on a main enemy.
   * Used by weave echo-strike: caller receives final hit damage, position, enemy
   * max HP, and a callback to apply bonus damage directly to that enemy.
   * Not called for sub-projectile targets (shards, bolts, spikes, missiles).
   * Not called from within echo bonus application — no recursion is possible.
   */
  onWeaponHitEnemy?(finalDmg: number, hitX: number, hitY: number, maxHp: number, applyBonusDmg: (bonus: number) => void, targetEntity?: object): void;

  /**
   * Spawns a short pull-only vortex at (hitX, hitY).
   * Called after a crafted weapon hit if nullstonePullRadius > 0.
   */
  applyNullstonePull(hitX: number, hitY: number, radius: number): void;
  /** Returns the ATK multiplier for the given weapon (>= 1). Multiply base damage by this. */
  getWeaponAtkMultiplier(weaponId: string): number;
  /** Returns the RNG multiplier for the given weapon (>= 1). Multiply base range by this. */
  getWeaponRngMultiplier(weaponId: string): number;
  /** Returns the PRC multiplier for the given weapon (>= 1). Multiply pierce ratio by this. */
  getWeaponPrcMultiplier(weaponId: string): number;
  /** Returns the equipped weave/lens cooldown bonus as a percentage. */
  getEquipmentCooldownPct(): number;
}

// ── Attack dispatch ───────────────────────────────────────────────────────────

/**
 * Fires the player's equipped weapon at enemies once per cooldown tick.
 * Delegates to the appropriate handler module for aoe / multi / single.
 */
export function performWeaponAttack(ctx: RpgPlayerAttackCtx, weaponId: string): void {
  const { rpgSimState, playerStats, findClosestTarget } = ctx;
  const bossEnemy = ctx.bossEnemy;

  const weaponDef = resolveWeaponDefinition(weaponId);

  // Sunstone mines can always be placed (no target needed).
  if (weaponDef?.stats.effect?.kind === 'sunstoneMine') {
    const tier      = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const rawDamage = (weaponDef
      ? getScaledWeaponDamage(weaponDef.stats.damage, tier, playerStats.atk)
      : playerStats.atk) * Math.max(1, ctx.getWeaponAtkMultiplier(weaponId));
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
    polyominoEnemies, fissilePolyominoEnemies, refractorPolyominoEnemies,
    eliteEnemies, binaryRingEnemies, alivenGroups,
    dustWispEnemies, ribbonWormEnemies, lanternMothEnemies, eyeStalkEnemies,
    jellyfishEnemies, eliteJellyfishEnemies, clothGhostEnemies, plantTurretEnemies, gearInsectEnemies,
    spiderCrawlerEnemies, moteSwarmEnemies, shadowHandEnemies,
    sandFishEnemies, quartzFishEnemies, rubyFishEnemies, sunstoneFishEnemies,
    emeraldFishEnemies, sapphireFishEnemies, amethystFishEnemies, diamondFishEnemies,
    plantProjectiles,
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
    + polyominoEnemies.length + fissilePolyominoEnemies.length + refractorPolyominoEnemies.length
    + eliteEnemies.length + binaryRingEnemies.length + alivenParticleCount
    + dustWispEnemies.length + ribbonWormEnemies.length + lanternMothEnemies.length
    + eyeStalkEnemies.length + jellyfishEnemies.length + eliteJellyfishEnemies.length + clothGhostEnemies.length
    + plantTurretEnemies.length + gearInsectEnemies.length + spiderCrawlerEnemies.length
    + moteSwarmEnemies.length + shadowHandEnemies.length
    + sandFishEnemies.length + quartzFishEnemies.length + rubyFishEnemies.length
    + sunstoneFishEnemies.length + emeraldFishEnemies.length + sapphireFishEnemies.length
    + amethystFishEnemies.length + diamondFishEnemies.length + plantProjectiles.length
    + ctx.horizonPentagonGroups.length
    + (bossEnemy ? 1 : 0);
  if (totalTargets === 0) return;

  const range     = (weaponDef?.stats.range ?? PLAYER_BASE_RANGE_PX) * Math.max(1, ctx.getWeaponRngMultiplier(weaponId));
  const tier      = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
  const craftedMods = resolveCraftedWeaponModifiers(weaponId);
  let baseDmg   = (weaponDef
    ? getScaledWeaponDamage(weaponDef.stats.damage, tier, playerStats.atk)
    : playerStats.atk) * Math.max(1, ctx.getWeaponAtkMultiplier(weaponId));
  // RPG Training: global damage bonus.
  const trainingRank = getSkillNodeRank(rpgSimState, 'rpg_training');
  if (trainingRank > 0) baseDmg *= 1 + trainingRank * 0.03;
  // Weapon Mastery and Dominance Amplifier scale crafted weapon damage only.
  if (craftedMods) {
    const masteryRank = getSkillNodeRank(rpgSimState, 'weapon_mastery');
    const ampRank     = getSkillNodeRank(rpgSimState, 'dominance_amp');
    if (masteryRank > 0) baseDmg *= 1 + masteryRank * 0.04;
    if (ampRank     > 0) baseDmg *= 1 + ampRank     * 0.06;
  }
  // Sapphire crit: roll for critChancePct% chance, deal critDamageMultiplier× damage.
  const preCritEquipment = getCombinedEquipmentModifiers({ rpgState: rpgSimState, weaponId, hitDamage: baseDmg });
  baseDmg = applyEquipmentModifiersToAttackContext(baseDmg, preCritEquipment);

  const totalCritChancePct = (craftedMods?.critChancePct ?? 0) + preCritEquipment.critChancePct;
  const isCrit    = totalCritChancePct > 0
    ? Math.random() * 100 < totalCritChancePct
    : false;
  const critMult  = (craftedMods?.critDamageMultiplier ?? 2) * (1 + preCritEquipment.critDamagePct / 100);
  const rawDamage = isCrit ? baseDmg * critMult : baseDmg;
  const equipment: CombinedEquipmentModifiers =
    getCombinedEquipmentModifiers({ rpgState: rpgSimState, weaponId, hitDamage: rawDamage });
  const effect    = weaponDef?.stats.effect ?? { kind: 'single' as const };
  const rangeSq   = range * range;

  // ── Delegating weapon kinds (self-managed or projectile-based) ────────────

  // ── Delegating weapons: Echo Strike does not trigger from these paths. ────────
  // Hit resolution happens inside weapon system handlers (spawned projectiles,
  // self-managed systems, DOT ticks) with no clean hook point here.

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
    if (target) ctx.spawnEmeraldMissile(target.x, target.y, rawDamage, tier, craftedMods?.emeraldAcquisitionRangePx ?? 0);
    return;
  }

  if (effect.kind === 'laserBeam') {
    const target = findClosestTarget(rangeSq);
    if (target) ctx.fireLaserBeam(target.x, target.y, weaponId);
    return;
  }

  if (effect.kind === 'fracterylSpear') {
    ctx.spawnFracterylSpearVolley(weaponId, rawDamage, tier);
    return;
  }

  // sunstoneMine: placed asynchronously via layMine — no direct hit hook.

  // Diamond armor ignore: applies as a minimum defPierceRatio regardless of effect kind.
  const armorIgnore = craftedMods ? craftedMods.armorIgnorePct : 0;

  // ── Attack-mode handlers ──────────────────────────────────────────────────

  if (effect.kind === 'aoe') {
    performAoeAttack(ctx, rawDamage, effect.aoeRadius, armorIgnore, craftedMods ?? undefined, rangeSq, equipment, weaponId);
    return;
  }

  if (effect.kind === 'multi') {
    performMultiAttack(ctx, rawDamage, rangeSq, effect.targetCount, armorIgnore, craftedMods ?? undefined, equipment, weaponId);
    return;
  }

  // single / piercing
  const isPiercing     = effect.kind === 'piercing';
  const basePierce     = isPiercing ? effect.defPierceRatio : 0;
  const defPierceRatio = Math.min(1, Math.max(armorIgnore, isPiercing
    ? basePierce * Math.max(1, ctx.getWeaponPrcMultiplier(weaponId))
    : 0));
  // Resolve the weapon's source/shot color from its tier for gradient damage numbers.
  // Default '#ffd764' is the player mote's sand/gold glow (used when no weapon or unknown tier).
  const weaponShotColor = weaponDef
    ? (TIER_BY_ID.get(weaponDef.costTierId as import('../../data/tiers').TierId)?.color ?? '#ffd764')
    : '#ffd764';
  performSingleAttack(ctx, rawDamage, rangeSq, isPiercing, defPierceRatio, weaponShotColor, craftedMods ?? undefined, equipment, weaponId);
}
