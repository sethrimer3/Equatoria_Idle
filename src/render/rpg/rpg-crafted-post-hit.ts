/**
 * rpg-crafted-post-hit.ts — Shared crafted-weapon post-hit effects.
 *
 * Exports:
 *   makeFracterylPool(strikes)   — create a shared counter for a weapon attack
 *   applyCraftedPostHit(...)     — apply Nullstone pull and/or Fracteryl
 *                                  follow-ups after a single target is hit
 *
 * Usage:
 *   single/piercing  — pool = makeFracterylPool(mods.fracterylStrikes),
 *                      one call with hitX/hitY = target position
 *   multi            — pool created once before target loop, one call per
 *                      target so pool is shared and Fracteryl is capped across
 *                      all targets
 *   aoe              — pool created once, one call at mote position after all
 *                      AoE hits (Nullstone at mote center; Fracteryl capped at
 *                      fracterylStrikes total across the whole burst)
 *
 * Safety rules enforced here:
 *   - Fracteryl follow-ups never call applyCraftedPostHit again (no recursion).
 *   - fracterylPool.value is decremented before each strike, so the pool is
 *     strictly bounded even across multi / aoe attack loops.
 *   - Nullstone pull is skipped when hitX or hitY is NaN / Infinity.
 *   - Fracteryl follow-up damage is skipped when strikeDmg < 0.5 (rounds to 0).
 *   - damageFollowUpTarget returns 0 for any unrecognised ClosestTarget variant.
 */

import type { RpgPlayerAttackCtx } from './rpg-player-attack';
import type { CraftedWeaponModifiers } from '../../data/rpg/crafted-weapon-types';
import type { ClosestTarget } from './rpg-types';
import { FRACTERYL_ENEMY_GLOW } from './rpg-enemy-constants';

/** Hard upper bound on Fracteryl pool size (mirrors the modifier cap). */
export const FRACTERYL_POOL_MAX = 10;

/**
 * Create a Fracteryl follow-up pool for one weapon attack.
 * Pass this to applyCraftedPostHit; share across all targets in multi/aoe.
 */
export function makeFracterylPool(fracterylStrikes: number): { value: number } {
  return { value: Math.max(0, Math.min(FRACTERYL_POOL_MAX, fracterylStrikes)) };
}

/**
 * Damage a target using the attack ctx damage functions.
 * Covers all ClosestTarget variants that RpgPlayerAttackCtx can handle.
 * Returns actual damage dealt, or 0 for unhandled target variants.
 * Does NOT trigger further post-hit effects.
 */
function damageFollowUpTarget(
  ctx: RpgPlayerAttackCtx,
  target: ClosestTarget,
  damage: number,
  defPierceRatio: number,
): number {
  if (target.laser) return ctx.damageEnemy(target.laser, damage, defPierceRatio);
  if (target.sapphire) return ctx.damageSapphireEnemy(target.sapphire, damage, defPierceRatio, false);
  if (target.missile) return ctx.damageMissile(target.missile, damage);
  if (target.emerald) return ctx.damageEmeraldEnemy(target.emerald, damage, defPierceRatio);
  if (target.amber) return ctx.damageAmberEnemy(target.amber, damage, defPierceRatio);
  if (target.ambershard) return ctx.damageAmberShard(target.ambershard, damage);
  if (target.void) return ctx.damageVoidEnemy(target.void, damage, defPierceRatio);
  if (target.quartz) return ctx.damageQuartzEnemy(target.quartz, damage, defPierceRatio);
  if (target.quartzspike) return ctx.damageQuartzSpike(target.quartzspike, damage);
  if (target.ruby) return ctx.damageRubyEnemy(target.ruby, damage, defPierceRatio);
  if (target.rubybolt) return ctx.damageRubyBolt(target.rubybolt, damage);
  if (target.sunstone) return ctx.damageSunstoneEnemy(target.sunstone, damage, defPierceRatio);
  if (target.citrine) return ctx.damageCitrineEnemy(target.citrine, damage, defPierceRatio);
  if (target.citrinebolt) return ctx.damageCitrineBolt(target.citrinebolt, damage);
  if (target.iolite) return ctx.damageIoliteEnemy(target.iolite, damage, defPierceRatio);
  if (target.amethyst) return ctx.damageAmethystEnemy(target.amethyst, damage, defPierceRatio, false);
  if (target.amethystshard) return ctx.damageAmethystShard(target.amethystshard, damage);
  if (target.diamond) return ctx.damageDiamondEnemy(target.diamond, damage, defPierceRatio);
  if (target.diamondshard) return ctx.damageDiamondShard(target.diamondshard, damage);
  if (target.nullstone) return ctx.damageNullstoneEnemy(target.nullstone, damage, defPierceRatio);
  if (target.voidtendril) return ctx.damageVoidTendril(target.voidtendril, damage);
  if (target.fracteryl) return ctx.damageFracterylEnemy(target.fracteryl, damage, defPierceRatio);
  if (target.fracterylshard) return ctx.damageFracterylShard(target.fracterylshard, damage);
  if (target.eigenstein) return ctx.damageEigensteinEnemy(target.eigenstein, damage, defPierceRatio);
  if (target.polyomino) return ctx.damagePolyominoEnemy(target.polyomino, damage, defPierceRatio);
  if (target.fissilePolyomino) return ctx.damageFissilePolyominoEnemy(target.fissilePolyomino, damage, defPierceRatio);
  if (target.refractorPolyomino) return ctx.damageRefractorPolyominoEnemy(target.refractorPolyomino, damage, defPierceRatio);
  if (target.elite) return ctx.damageEliteEnemy(target.elite, damage, defPierceRatio);
  if (target.boss) return ctx.damageBossEnemy(damage, defPierceRatio);
  if (target.alivenParticle && target.alivenGroup) return ctx.damageAlivenParticle(target.alivenParticle, target.alivenGroup, damage);
  if (target.dustWisp) return ctx.damageDustWispEnemy(target.dustWisp, damage, defPierceRatio);
  if (target.ribbonWorm) return ctx.damageRibbonWormEnemy(target.ribbonWorm, damage, defPierceRatio);
  if (target.lanternMoth) return ctx.damageLanternMothEnemy(target.lanternMoth, damage, defPierceRatio);
  if (target.eyeStalk) return ctx.damageEyeStalkEnemy(target.eyeStalk, damage, defPierceRatio);
  if (target.jellyfish) return ctx.damageJellyfishEnemy(target.jellyfish, damage, defPierceRatio);
  if (target.clothGhost) return ctx.damageClothGhostEnemy(target.clothGhost, damage, defPierceRatio);
  if (target.plantTurret) return ctx.damagePlantTurretEnemy(target.plantTurret, damage, defPierceRatio);
  if (target.gearInsect) return ctx.damageGearInsectEnemy(target.gearInsect, damage, defPierceRatio);
  if (target.spiderCrawler) return ctx.damageSpiderCrawlerEnemy(target.spiderCrawler, damage, defPierceRatio);
  if (target.moteSwarm) return ctx.damageMoteSwarmEnemy(target.moteSwarm, damage, defPierceRatio);
  if (target.shadowHand) return ctx.damageShadowHandEnemy(target.shadowHand, damage, defPierceRatio);
  if (target.sandFish) return ctx.damageSandFishEnemy(target.sandFish, damage, defPierceRatio);
  if (target.quartzFish) return ctx.damageQuartzFishEnemy(target.quartzFish, damage, defPierceRatio, false);
  if (target.rubyFish) return ctx.damageRubyFishEnemy(target.rubyFish, damage, defPierceRatio);
  if (target.sunstoneFish) return ctx.damageSunstoneFishEnemy(target.sunstoneFish, damage, defPierceRatio);
  if (target.emeraldFish) return ctx.damageEmeraldFishEnemy(target.emeraldFish, damage, defPierceRatio);
  if (target.sapphireFish) return ctx.damageSapphireFishEnemy(target.sapphireFish, damage, defPierceRatio);
  if (target.amethystFish) return ctx.damageAmethystFishEnemy(target.amethystFish, damage, defPierceRatio);
  if (target.diamondFish) return ctx.damageDiamondFishEnemy(target.diamondFish, damage, defPierceRatio);
  if (target.plantProj) return ctx.damagePlantProjectile(target.plantProj, damage);
  return 0;
}

/**
 * Apply crafted weapon post-hit effects (Nullstone pull + Fracteryl follow-ups)
 * for a single hit event.
 *
 * @param hitX / hitY   - world position of the hit (used for Nullstone pull origin).
 * @param rawDamage     - base damage of the original attack (follow-ups start at 50%).
 * @param defPierceRatio - defense pierce ratio for follow-up damage dispatch.
 * @param craftedMods   - modifier record for the weapon.
 * @param rangeSq       - squared targeting range used to find follow-up targets.
 * @param fracterylPool - shared { value: N } counter. Decremented per follow-up.
 *                        Use makeFracterylPool() for single-attack; share a single
 *                        pool instance across all target hits in multi / aoe.
 * @param shotColor     - weapon/source color used for Fracteryl hit visuals.
 */
export function applyCraftedPostHit(
  ctx: RpgPlayerAttackCtx,
  hitX: number,
  hitY: number,
  rawDamage: number,
  defPierceRatio: number,
  craftedMods: CraftedWeaponModifiers,
  rangeSq: number,
  fracterylPool: { value: number },
  shotColor: string,
): void {
  // Nullstone: spawn a short pull-only vortex at the hit point.
  // applyNullstonePull handles dead / invalid / out-of-radius targets internally.
  if (craftedMods.nullstonePullRadius > 0 && Number.isFinite(hitX) && Number.isFinite(hitY)) {
    ctx.applyNullstonePull(hitX, hitY, craftedMods.nullstonePullRadius);
  }

  // Fracteryl: fire follow-up strikes with 50% damage decay per repeat.
  // Consuming from fracterylPool prevents further post-hit chains (no recursion).
  if (fracterylPool.value > 0 && craftedMods.fracterylStrikes > 0) {
    let strikeDmg = rawDamage * 0.5;
    while (fracterylPool.value > 0 && Number.isFinite(strikeDmg) && strikeDmg >= 0.5) {
      const followTarget = ctx.findClosestTarget(rangeSq);
      if (!followTarget) break;
      fracterylPool.value--;
      damageFollowUpTarget(ctx, followTarget, strikeDmg, defPierceRatio);
      ctx.spawnHitVisualsAt(followTarget.x, followTarget.y, 1000, strikeDmg, FRACTERYL_ENEMY_GLOW, shotColor);
      strikeDmg *= 0.5;
    }
  }
}
