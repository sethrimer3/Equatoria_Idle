/**
 * rpg-player-attack-single.ts — Single and piercing weapon attack handler.
 *
 * Extracted from rpg-player-attack.ts. Handles the `single` and `piercing`
 * weapon effect kinds: finds the closest target within range, then applies
 * damage to it with the appropriate colour and pierce ratio.
 *
 * Imported and called by `performWeaponAttack` in rpg-player-attack.ts.
 */

import {
  BOSS_GLOW_COLORS, SAPPHIRE_ENEMY_GLOW,
} from './rpg-constants';
import {
  EMERALD_ENEMY_GLOW, AMBER_ENEMY_GLOW, VOID_ENEMY_GLOW,
  QUARTZ_ENEMY_GLOW, RUBY_ENEMY_GLOW, SUNSTONE_ENEMY_GLOW, CITRINE_ENEMY_GLOW,
  IOLITE_ENEMY_GLOW, AMETHYST_ENEMY_GLOW, DIAMOND_ENEMY_GLOW, NULLSTONE_ENEMY_GLOW,
  FRACTERYL_ENEMY_GLOW, EIGENSTEIN_ENEMY_GLOW,
} from './rpg-enemy-constants';
import type { RpgPlayerAttackCtx } from './rpg-player-attack';
import type { CraftedWeaponModifiers } from '../../data/rpg/crafted-weapon-types';
import type { CraftedLensData } from '../../data/rpg/lens-types';
import { applyCraftedPostHit, makeFracterylPool } from './rpg-crafted-post-hit';
import {
  applyLensStatus, getIncomingDamageMult, getRiftScarredDamageMult, incrementRiftScarredStacks,
} from '../../sim/rpg/enemy-status-effects';
import { buildAllTier1StatusParams } from '../../data/rpg/lens-status-effects';
import type { ClosestTarget } from './rpg-types';

/** Extracts the primary hittable enemy object from a ClosestTarget (null for sub-projectiles). */
function extractTargetEntity(t: ClosestTarget): object | null {
  if (t.laser) return t.laser;
  if (t.sapphire) return t.sapphire;
  if (t.emerald) return t.emerald;
  if (t.amber) return t.amber;
  if (t.void) return t.void;
  if (t.quartz) return t.quartz;
  if (t.ruby) return t.ruby;
  if (t.sunstone) return t.sunstone;
  if (t.citrine) return t.citrine;
  if (t.iolite) return t.iolite;
  if (t.amethyst) return t.amethyst;
  if (t.diamond) return t.diamond;
  if (t.nullstone) return t.nullstone;
  if (t.fracteryl) return t.fracteryl;
  if (t.eigenstein) return t.eigenstein;
  if (t.polyomino) return t.polyomino;
  if (t.fissilePolyomino) return t.fissilePolyomino;
  if (t.refractorPolyomino) return t.refractorPolyomino;
  if (t.elite) return t.elite;
  if (t.boss) return t.boss;
  if (t.alivenParticle) return t.alivenParticle;
  if (t.dustWisp) return t.dustWisp;
  if (t.ribbonWorm) return t.ribbonWorm;
  if (t.lanternMoth) return t.lanternMoth;
  if (t.eyeStalk) return t.eyeStalk;
  if (t.jellyfish) return t.jellyfish;
  if (t.clothGhost) return t.clothGhost;
  if (t.plantTurret) return t.plantTurret;
  if (t.gearInsect) return t.gearInsect;
  if (t.spiderCrawler) return t.spiderCrawler;
  if (t.moteSwarm) return t.moteSwarm;
  if (t.shadowHand) return t.shadowHand;
  if (t.sandFish) return t.sandFish;
  if (t.quartzFish) return t.quartzFish;
  if (t.rubyFish) return t.rubyFish;
  if (t.sunstoneFish) return t.sunstoneFish;
  if (t.emeraldFish) return t.emeraldFish;
  if (t.sapphireFish) return t.sapphireFish;
  if (t.amethystFish) return t.amethystFish;
  if (t.diamondFish) return t.diamondFish;
  if (t.binaryRing) return t.binaryRing;
  if (t.nadirCubePoint) return t.nadirCubePoint;
  // Sub-entities (shards, missiles, spikes, bolts) do not receive statuses
  return null;
}

/** Apply all Tier 1 lens statuses to the given enemy after a successful hit. */
function applyLensStatusesOnHit(
  entity: object,
  lens: CraftedLensData,
  weaponId: string,
  hitDamage: number,
): void {
  const params = buildAllTier1StatusParams(lens, weaponId, hitDamage);
  for (const p of params) {
    applyLensStatus(entity, p);
  }
  // Increment Rift-Scarred stacks (only if rift-scarred effect was applied)
  const hasRift = lens.effects.some(e => e.effectTier === 1 && e.tierId === 'eigenstein');
  if (hasRift) incrementRiftScarredStacks(entity, lens.id);
}

export function performSingleAttack(
  ctx: RpgPlayerAttackCtx,
  rawDamage: number,
  rangeSq: number,
  isPiercing: boolean,
  defPierceRatio: number,
  shotColor: string,
  craftedMods?: CraftedWeaponModifiers,
  attachedLens?: CraftedLensData,
  weaponId?: string,
): void {
  const {
    damageEnemy, damageSapphireEnemy, damageMissile,
    damageEmeraldEnemy, damageAmberEnemy, damageAmberShard, damageVoidEnemy,
    damageQuartzEnemy, damageQuartzSpike, damageRubyEnemy, damageRubyBolt,
    damageSunstoneEnemy, damageCitrineEnemy, damageCitrineBolt, damageIoliteEnemy,
    damageAmethystEnemy, damageAmethystShard, damageDiamondEnemy, damageDiamondShard,
    damageNullstoneEnemy, damageVoidTendril, damageFracterylEnemy, damageFracterylShard,
    damageEigensteinEnemy, damagePolyominoEnemy, damageFissilePolyominoEnemy, damageRefractorPolyominoEnemy,
    damageEliteEnemy, damageBossEnemy,
    spawnHitVisuals, spawnHitVisualsAt, findClosestTarget,
  } = ctx;

  const piercingColor = '#74c0fc';
  // When piercing, use piercingColor as both the enemy indicator color and the source.
  // Otherwise, shotColor is the weapon/source color and the per-enemy glow is the target color.
  const effectiveSourceColor = isPiercing ? piercingColor : shotColor;
  const closestT = findClosestTarget(rangeSq);
  if (!closestT) return;
  const hitX = closestT.x;
  const hitY = closestT.y;

  // ── Lens status pre-hit: apply incoming-damage multipliers ───────────────────
  const targetEntity = attachedLens ? extractTargetEntity(closestT) : null;
  const lensSourceKey = attachedLens?.id ?? '';
  const statusMult = targetEntity ? getIncomingDamageMult(targetEntity) : 1;
  const riftMult   = (targetEntity && lensSourceKey) ? getRiftScarredDamageMult(targetEntity, lensSourceKey) : 1;
  const effectiveRaw = rawDamage * statusMult * riftMult;

  if (closestT.laser) {
    const dmg = damageEnemy(closestT.laser, effectiveRaw, defPierceRatio);
    spawnHitVisuals(closestT.laser, dmg, isPiercing ? piercingColor : shotColor, effectiveSourceColor);
  } else if (closestT.sapphire) {
    const dmg = damageSapphireEnemy(closestT.sapphire, effectiveRaw, defPierceRatio, false);
    spawnHitVisualsAt(closestT.sapphire.x, closestT.sapphire.y, closestT.sapphire.maxHp, dmg,
      isPiercing ? piercingColor : SAPPHIRE_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.missile) {
    damageMissile(closestT.missile, rawDamage);
  } else if (closestT.emerald) {
    const dmg = damageEmeraldEnemy(closestT.emerald, rawDamage, defPierceRatio);
    spawnHitVisualsAt(closestT.emerald.x, closestT.emerald.y, closestT.emerald.maxHp, dmg,
      isPiercing ? piercingColor : EMERALD_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.amber) {
    const dmg = damageAmberEnemy(closestT.amber, rawDamage, defPierceRatio);
    spawnHitVisualsAt(closestT.amber.x, closestT.amber.y, closestT.amber.maxHp, dmg,
      isPiercing ? piercingColor : AMBER_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.ambershard) {
    damageAmberShard(closestT.ambershard, rawDamage);
  } else if (closestT.void) {
    const dmg = damageVoidEnemy(closestT.void, rawDamage, defPierceRatio);
    spawnHitVisualsAt(closestT.void.x, closestT.void.y, closestT.void.maxHp, dmg,
      isPiercing ? piercingColor : VOID_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.quartz) {
    const dmg = damageQuartzEnemy(closestT.quartz, rawDamage, defPierceRatio);
    spawnHitVisualsAt(closestT.quartz.x, closestT.quartz.y, closestT.quartz.maxHp, dmg,
      isPiercing ? piercingColor : QUARTZ_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.quartzspike) {
    damageQuartzSpike(closestT.quartzspike, rawDamage);
  } else if (closestT.ruby) {
    const dmg = damageRubyEnemy(closestT.ruby, rawDamage, defPierceRatio);
    spawnHitVisualsAt(closestT.ruby.x, closestT.ruby.y, closestT.ruby.maxHp, dmg,
      isPiercing ? piercingColor : RUBY_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.rubybolt) {
    damageRubyBolt(closestT.rubybolt, rawDamage);
  } else if (closestT.sunstone) {
    const dmg = damageSunstoneEnemy(closestT.sunstone, rawDamage, defPierceRatio);
    spawnHitVisualsAt(closestT.sunstone.x, closestT.sunstone.y, closestT.sunstone.maxHp, dmg,
      isPiercing ? piercingColor : SUNSTONE_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.citrine) {
    const dmg = damageCitrineEnemy(closestT.citrine, rawDamage, defPierceRatio);
    spawnHitVisualsAt(closestT.citrine.x, closestT.citrine.y, closestT.citrine.maxHp, dmg,
      isPiercing ? piercingColor : CITRINE_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.citrinebolt) {
    damageCitrineBolt(closestT.citrinebolt, rawDamage);
  } else if (closestT.iolite) {
    const dmg = damageIoliteEnemy(closestT.iolite, rawDamage, defPierceRatio);
    spawnHitVisualsAt(closestT.iolite.x, closestT.iolite.y, closestT.iolite.maxHp, dmg,
      isPiercing ? piercingColor : IOLITE_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.amethyst) {
    const dmg = damageAmethystEnemy(closestT.amethyst, rawDamage, defPierceRatio, false);
    spawnHitVisualsAt(closestT.amethyst.x, closestT.amethyst.y, closestT.amethyst.maxHp, dmg,
      isPiercing ? piercingColor : AMETHYST_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.amethystshard) {
    damageAmethystShard(closestT.amethystshard, rawDamage);
  } else if (closestT.diamond) {
    const dmg = damageDiamondEnemy(closestT.diamond, rawDamage, defPierceRatio);
    spawnHitVisualsAt(closestT.diamond.x, closestT.diamond.y, closestT.diamond.maxHp, dmg,
      isPiercing ? piercingColor : DIAMOND_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.diamondshard) {
    damageDiamondShard(closestT.diamondshard, rawDamage);
  } else if (closestT.nullstone) {
    const dmg = damageNullstoneEnemy(closestT.nullstone, rawDamage, defPierceRatio);
    spawnHitVisualsAt(closestT.nullstone.x, closestT.nullstone.y, closestT.nullstone.maxHp, dmg,
      isPiercing ? piercingColor : NULLSTONE_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.voidtendril) {
    damageVoidTendril(closestT.voidtendril, rawDamage);
  } else if (closestT.fracteryl) {
    const dmg = damageFracterylEnemy(closestT.fracteryl, rawDamage, defPierceRatio);
    spawnHitVisualsAt(closestT.fracteryl.x, closestT.fracteryl.y, closestT.fracteryl.maxHp, dmg,
      isPiercing ? piercingColor : FRACTERYL_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.fracterylshard) {
    damageFracterylShard(closestT.fracterylshard, rawDamage);
  } else if (closestT.eigenstein) {
    const dmg = damageEigensteinEnemy(closestT.eigenstein, rawDamage, defPierceRatio);
    spawnHitVisualsAt(closestT.eigenstein.x, closestT.eigenstein.y, closestT.eigenstein.maxHp, dmg,
      isPiercing ? piercingColor : EIGENSTEIN_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.polyomino) {
    const dmg = damagePolyominoEnemy(closestT.polyomino, rawDamage, defPierceRatio);
    spawnHitVisualsAt(closestT.x, closestT.y, closestT.polyomino.maxHp, dmg,
      isPiercing ? piercingColor : '#52b788', effectiveSourceColor);
  } else if (closestT.fissilePolyomino) {
    const dmg = damageFissilePolyominoEnemy(closestT.fissilePolyomino, rawDamage, defPierceRatio);
    spawnHitVisualsAt(closestT.x, closestT.y, closestT.fissilePolyomino.maxHp, dmg,
      isPiercing ? piercingColor : '#e9c46a', effectiveSourceColor);
  } else if (closestT.refractorPolyomino) {
    const dmg = damageRefractorPolyominoEnemy(closestT.refractorPolyomino, rawDamage, defPierceRatio);
    spawnHitVisualsAt(closestT.x, closestT.y, closestT.refractorPolyomino.maxHp, dmg,
      isPiercing ? piercingColor : '#00f5d4', effectiveSourceColor);
  } else if (closestT.elite) {
    const dmg = damageEliteEnemy(closestT.elite, rawDamage, defPierceRatio);
    spawnHitVisualsAt(closestT.elite.x, closestT.elite.y, closestT.elite.maxHp, dmg,
      isPiercing ? piercingColor : '#ffe060', effectiveSourceColor);
  } else if (closestT.boss) {
    const dmg = damageBossEnemy(rawDamage, defPierceRatio);
    if (dmg > 0) spawnHitVisualsAt(closestT.boss.x, closestT.boss.y, closestT.boss.maxHp, dmg,
      isPiercing ? piercingColor : BOSS_GLOW_COLORS[Math.min(closestT.boss.bossId, BOSS_GLOW_COLORS.length - 1)],
      effectiveSourceColor);
  } else if (closestT.alivenParticle && closestT.alivenGroup) {
    const dmg = ctx.damageAlivenParticle(closestT.alivenParticle, closestT.alivenGroup, rawDamage);
    if (dmg > 0) spawnHitVisualsAt(closestT.alivenParticle.x, closestT.alivenParticle.y, closestT.alivenParticle.maxHp, dmg,
      isPiercing ? piercingColor : closestT.alivenParticle.glowColor, effectiveSourceColor);
  }

  // ── Crafted weapon post-hit effects ──────────────────────────────────────

  if (craftedMods && (craftedMods.nullstonePullRadius > 0 || craftedMods.fracterylStrikes > 0)) {
    const pool = makeFracterylPool(craftedMods.fracterylStrikes);
    applyCraftedPostHit(ctx, hitX, hitY, rawDamage, defPierceRatio, craftedMods, rangeSq, pool, effectiveSourceColor);
  }
}
