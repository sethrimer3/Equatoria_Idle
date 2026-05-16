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

export type { RpgTargetingCtx, RpgTargetingHandle } from './rpg-targeting-types';

export function createRpgTargeting(ctx: RpgTargetingCtx): RpgTargetingHandle {

  let targetedEnemy: object | null = null;

  function tryTargetEnemyAt(tapX: number, tapY: number): void {
    // Manual tap-to-target is currently disabled by design — the function clears
    // the stored target so the next getTargetedEnemy() call falls back to the
    // closest automatic target.  The tap position is received but not yet used.
    void tapX;
    void tapY;
    targetedEnemy = null;
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
    if (target.elite) return ctx.damageEliteEnemy(target.elite, rawDamage, defPierceRatio);
    if (target.alivenParticle && target.alivenGroup) return ctx.damageAlivenParticle(target.alivenParticle, target.alivenGroup, rawDamage);
    if (target.boss) return ctx.damageBossEnemy(rawDamage, defPierceRatio);
    return 0;
  }

  return {
    findClosestTarget: (rangeSq) => findClosestTarget(ctx, rangeSq),
    findClosestEnemy: (rangeSq) => findClosestEnemy(ctx, rangeSq),
    collectEnemyBodyTargets: () => collectEnemyBodyTargets(ctx),
    findClosestEnemyFrom: (x, y, rangeSq) => findClosestEnemyFrom(ctx, x, y, rangeSq),
    getTargetedEnemy: () => getTargetedEnemy(ctx, targetedEnemy),
    tryTargetEnemyAt,
    damageBodyTarget,
  };
}
