/**
 * rpg-targeting.ts — Targeting system for the RPG tab.
 *
 * Provides closest-target lookup functions and damage dispatch across all
 * enemy types. Extracted from rpg-render.ts to reduce file size.
 *
 * Use createRpgTargeting(ctx) to create the targeting handle.
 */

import type { ClosestTarget } from './rpg-types';
import type { RpgTargetingCtx, RpgTargetingHandle } from './rpg-targeting-types';
import { findClosestTarget, findClosestEnemy } from './rpg-targeting-nearest';
import {
  collectEnemyBodyTargets,
  findClosestEnemyFrom,
  getTargetedEnemy,
} from './rpg-targeting-targets';

export type { RpgTargetingCtx, RpgTargetingHandle, TargetCollectionOptions } from './rpg-targeting-types';

export function createRpgTargeting(ctx: RpgTargetingCtx): RpgTargetingHandle {
  let targetedEnemy: object | null = null;
  const TAP_TARGET_RADIUS_PX = 24;

  function tryTargetEnemyAt(tapX: number, tapY: number): void {
    let best: ClosestTarget | null = null;
    let bestSq = TAP_TARGET_RADIUS_PX * TAP_TARGET_RADIUS_PX;
    for (const target of collectEnemyBodyTargets(ctx)) {
      const dx = target.x - tapX;
      const dy = target.y - tapY;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) {
        bestSq = d;
        best = target;
      }
    }
    targetedEnemy = best ? getTargetObject(best) : null;
  }

  function damageBodyTarget(target: ClosestTarget, rawDamage: number, defPierceRatio: number, bypassShield: boolean): number {
    if (target.laser) return ctx.damageEnemy(target.laser, rawDamage, defPierceRatio);
    if (target.sapphire) return ctx.damageSapphireEnemy(target.sapphire, rawDamage, defPierceRatio, bypassShield);
    if (target.emerald) return ctx.damageEmeraldEnemy(target.emerald, rawDamage, defPierceRatio);
    if (target.amber) return ctx.damageAmberEnemy(target.amber, rawDamage, defPierceRatio);
    if (target.void) return ctx.damageVoidEnemy(target.void, rawDamage, defPierceRatio);
    if (target.quartz) return ctx.damageQuartzEnemy(target.quartz, rawDamage, defPierceRatio);
    if (target.ruby) return ctx.damageRubyEnemy(target.ruby, rawDamage, defPierceRatio);
    if (target.sunstone) return ctx.damageSunstoneEnemy(target.sunstone, rawDamage, defPierceRatio);
    if (target.citrine) return ctx.damageCitrineEnemy(target.citrine, rawDamage, defPierceRatio);
    if (target.iolite) return ctx.damageIoliteEnemy(target.iolite, rawDamage, defPierceRatio);
    if (target.amethyst) return ctx.damageAmethystEnemy(target.amethyst, rawDamage, defPierceRatio, bypassShield);
    if (target.diamond) return ctx.damageDiamondEnemy(target.diamond, rawDamage, defPierceRatio);
    if (target.nullstone) return ctx.damageNullstoneEnemy(target.nullstone, rawDamage, defPierceRatio);
    if (target.fracteryl) return ctx.damageFracterylEnemy(target.fracteryl, rawDamage, defPierceRatio);
    if (target.eigenstein) return ctx.damageEigensteinEnemy(target.eigenstein, rawDamage, defPierceRatio);
    if (target.polyomino) return ctx.damagePolyominoEnemy(target.polyomino, rawDamage, defPierceRatio);
    if (target.fissilePolyomino) return ctx.damageFissilePolyominoEnemy(target.fissilePolyomino, rawDamage, defPierceRatio);
    if (target.refractorPolyomino) return ctx.damageRefractorPolyominoEnemy(target.refractorPolyomino, rawDamage, defPierceRatio);
    if (target.binaryRing) return ctx.damageBinaryRingEnemy(target.binaryRing, rawDamage, defPierceRatio);
    if (target.nadirCubePoint) return ctx.damageNadirCubePointEnemy(target.nadirCubePoint, rawDamage, defPierceRatio);
    if (target.horizonPentagonReal) return ctx.damageHorizonPentagonReal(target.horizonPentagonReal, rawDamage, defPierceRatio);
    if (target.horizonMissile) return ctx.damageHorizonMissile(target.horizonMissile, rawDamage, defPierceRatio);
    if (target.elite) return ctx.damageEliteEnemy(target.elite, rawDamage, defPierceRatio);
    if (target.alivenParticle && target.alivenGroup) return ctx.damageAlivenParticle(target.alivenParticle, target.alivenGroup, rawDamage);
    if (target.boss) return ctx.damageBossEnemy(rawDamage, defPierceRatio);
    if (target.dustWisp) return ctx.damageDustWispEnemy(target.dustWisp, rawDamage, defPierceRatio);
    if (target.ribbonWorm) return ctx.damageRibbonWormEnemy(target.ribbonWorm, rawDamage, defPierceRatio);
    if (target.lanternMoth) return ctx.damageLanternMothEnemy(target.lanternMoth, rawDamage, defPierceRatio);
    if (target.eyeStalk) return ctx.damageEyeStalkEnemy(target.eyeStalk, rawDamage, defPierceRatio);
    if (target.jellyfish) return ctx.damageJellyfishEnemy(target.jellyfish, rawDamage, defPierceRatio);
    if (target.eliteJellyfish) return ctx.damageEliteJellyfishEnemy(target.eliteJellyfish, rawDamage, defPierceRatio);
    if (target.clothGhost) return ctx.damageClothGhostEnemy(target.clothGhost, rawDamage, defPierceRatio);
    if (target.plantTurret) return ctx.damagePlantTurretEnemy(target.plantTurret, rawDamage, defPierceRatio);
    if (target.gearInsect) return ctx.damageGearInsectEnemy(target.gearInsect, rawDamage, defPierceRatio);
    if (target.spiderCrawler) return ctx.damageSpiderCrawlerEnemy(target.spiderCrawler, rawDamage, defPierceRatio);
    if (target.moteSwarm) return ctx.damageMoteSwarmEnemy(target.moteSwarm, rawDamage, defPierceRatio);
    if (target.shadowHand) return ctx.damageShadowHandEnemy(target.shadowHand, rawDamage, defPierceRatio);
    if (target.sandFish) return ctx.damageSandFishEnemy(target.sandFish, rawDamage, defPierceRatio);
    if (target.quartzFish) return ctx.damageQuartzFishEnemy(target.quartzFish, rawDamage, defPierceRatio, bypassShield);
    if (target.rubyFish) return ctx.damageRubyFishEnemy(target.rubyFish, rawDamage, defPierceRatio);
    if (target.sunstoneFish) return ctx.damageSunstoneFishEnemy(target.sunstoneFish, rawDamage, defPierceRatio);
    if (target.emeraldFish) return ctx.damageEmeraldFishEnemy(target.emeraldFish, rawDamage, defPierceRatio);
    if (target.sapphireFish) return ctx.damageSapphireFishEnemy(target.sapphireFish, rawDamage, defPierceRatio);
    if (target.amethystFish) return ctx.damageAmethystFishEnemy(target.amethystFish, rawDamage, defPierceRatio);
    if (target.diamondFish) return ctx.damageDiamondFishEnemy(target.diamondFish, rawDamage, defPierceRatio);
    if (target.plantProj) return ctx.damagePlantProjectile(target.plantProj, rawDamage);
    if (target.verdurePlant) return ctx.damageVerdurePlant(target.verdurePlant, rawDamage);
    return 0;
  }

  return {
    findClosestTarget: (rangeSq) => findClosestTarget(ctx, rangeSq),
    findClosestEnemy: (rangeSq) => findClosestEnemy(ctx, rangeSq),
    collectEnemyBodyTargets: (opts) => collectEnemyBodyTargets(ctx, opts),
    findClosestEnemyFrom: (x, y, rangeSq, opts) => findClosestEnemyFrom(ctx, x, y, rangeSq, opts),
    getTargetedEnemy: () => getTargetedEnemy(ctx, targetedEnemy),
    getManualTargetedEnemy: () => {
      if (!targetedEnemy) return null;
      const resolved = getTargetedEnemy(ctx, targetedEnemy);
      if (resolved && Object.values(resolved).some((value) => value === targetedEnemy)) return resolved;
      targetedEnemy = null;
      return null;
    },
    clearTargetedEnemy: () => { targetedEnemy = null; },
    tryTargetEnemyAt,
    damageBodyTarget,
  };
}

function getTargetObject(target: ClosestTarget): object | null {
  return target.laser ?? target.sapphire ?? target.emerald ?? target.amber ?? target.void
    ?? target.quartz ?? target.ruby ?? target.sunstone ?? target.citrine ?? target.iolite
    ?? target.amethyst ?? target.diamond ?? target.nullstone ?? target.fracteryl ?? target.eigenstein
    ?? target.polyomino ?? target.fissilePolyomino ?? target.refractorPolyomino
    ?? target.elite ?? target.alivenParticle ?? target.boss
    ?? target.dustWisp ?? target.ribbonWorm ?? target.lanternMoth ?? target.eyeStalk
    ?? target.jellyfish ?? target.eliteJellyfish ?? target.clothGhost ?? target.plantTurret
    ?? target.gearInsect ?? target.spiderCrawler ?? target.moteSwarm ?? target.shadowHand
    ?? target.sandFish ?? target.quartzFish ?? target.rubyFish ?? target.sunstoneFish
    ?? target.emeraldFish ?? target.sapphireFish ?? target.amethystFish ?? target.diamondFish
    ?? target.plantProj ?? target.verdurePlant ?? target.binaryRing ?? target.nadirCubePoint
    ?? target.horizonPentagonReal ?? null;
}
