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
  getIncomingDamageMult, getRiftScarredDamageMult,
} from '../../sim/rpg/enemy-status-effects';
import { applyTier1LensStatusesToEnemy } from '../../sim/rpg/enemy-status-application';

// Throttle affinity feedback (IMMUNE/RESIST/WEAK) to once per entity per 2500ms,
// preventing rapid-fire weapons from flooding the screen.
const _affinityFeedbackTs = new WeakMap<object, number>();
function _canShowAffinityFeedback(entity: object): boolean {
  const now = performance.now();
  const last = _affinityFeedbackTs.get(entity) ?? 0;
  if (now - last < 2500) return false;
  _affinityFeedbackTs.set(entity, now);
  return true;
}
import { handleLensTier2EffectsOnWeaponHit } from './lens-tier2-effects';
import { handleLensTier3EffectsOnWeaponHit } from './lens-tier3-effects';
import type { ClosestTarget } from './rpg-types';
import { evaluateStatusCombosOnStatusApplied, evaluateShatterCombo } from '../../sim/rpg/enemy-status-combos';
import { applyComboResults } from './rpg-combo-apply';

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
  if (t.horizonPentagonReal) return t.horizonPentagonReal;
  // Sub-entities (shards, missiles, spikes, bolts) do not receive statuses
  return null;
}

/** Maps a ClosestTarget to the enemy type ID used in the affinity table. */
function getTargetEnemyTypeId(t: ClosestTarget): string {
  if (t.ruby) return 'ruby';
  if (t.rubyFish) return 'rubyFish';
  if (t.emerald) return 'emerald';
  if (t.emeraldFish) return 'emeraldFish';
  if (t.sapphire) return 'sapphire';
  if (t.sapphireFish) return 'sapphireFish';
  if (t.nullstone) return 'nullstone';
  if (t.elite) return `elite_${t.elite.tier}`;
  if (t.boss) return 'boss';
  return 'other';
}

/** Apply all Tier 1 lens statuses to the given enemy after a successful hit. */
function applyLensStatusesOnHit(
  entity: object,
  lens: CraftedLensData,
  weaponId: string,
  hitDamage: number,
  enemyTypeId: string,
  onStatusFeedback?: (text: string, x: number, y: number) => void,
  feedbackX?: number,
  feedbackY?: number,
): void {
  const params = buildAllTier1StatusParams(lens, weaponId, hitDamage);
  const isBossElite = isBossOrEliteType(enemyTypeId);
  let feedbackShown = false;
  for (const p of params) {
    const mult = getEnemyStatusAffinityMultiplier(enemyTypeId, p.key);
    if (mult === 0) {
      if (!feedbackShown && onStatusFeedback && feedbackX !== undefined) {
        onStatusFeedback('IMMUNE', feedbackX, feedbackY ?? 0);
        feedbackShown = true;
      }
      continue;
    }
    let scaled = mult === 1 ? p : { ...p, durationMs: p.durationMs * mult, magnitude: p.magnitude * mult };
    // Bosses/elites use lower Rift-Scarred stack cap and fewer Fractal Wound ticks.
    if (isBossElite) {
      if (scaled.key === 'riftScarred') {
        scaled = { ...scaled, riftScarredStackCap: ENEMY_RIFT_STACK_CAP_BOSS };
      } else if (scaled.key === 'fractalWound') {
        scaled = { ...scaled, fractalTickCount: ENEMY_FRAC_TICKS_BOSS };
      }
    }
    applyLensStatus(entity, scaled);
    if (!feedbackShown && mult !== 1 && onStatusFeedback && feedbackX !== undefined) {
      onStatusFeedback(mult > 1 ? 'WEAK!' : 'RESIST', feedbackX, feedbackY ?? 0);
      feedbackShown = true;
    }
  }
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
  const comboTargetEntity = extractTargetEntity(closestT);
  const comboEnemyTypeId = getTargetEnemyTypeId(closestT);
  const targetEntity = attachedLens ? comboTargetEntity : null;
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
    damageMissile(closestT.missile, effectiveRaw);
  } else if (closestT.emerald) {
    const dmg = damageEmeraldEnemy(closestT.emerald, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(closestT.emerald.x, closestT.emerald.y, closestT.emerald.maxHp, dmg,
      isPiercing ? piercingColor : EMERALD_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.amber) {
    const dmg = damageAmberEnemy(closestT.amber, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(closestT.amber.x, closestT.amber.y, closestT.amber.maxHp, dmg,
      isPiercing ? piercingColor : AMBER_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.ambershard) {
    damageAmberShard(closestT.ambershard, effectiveRaw);
  } else if (closestT.void) {
    const dmg = damageVoidEnemy(closestT.void, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(closestT.void.x, closestT.void.y, closestT.void.maxHp, dmg,
      isPiercing ? piercingColor : VOID_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.quartz) {
    const dmg = damageQuartzEnemy(closestT.quartz, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(closestT.quartz.x, closestT.quartz.y, closestT.quartz.maxHp, dmg,
      isPiercing ? piercingColor : QUARTZ_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.quartzspike) {
    damageQuartzSpike(closestT.quartzspike, effectiveRaw);
  } else if (closestT.ruby) {
    const dmg = damageRubyEnemy(closestT.ruby, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(closestT.ruby.x, closestT.ruby.y, closestT.ruby.maxHp, dmg,
      isPiercing ? piercingColor : RUBY_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.rubybolt) {
    damageRubyBolt(closestT.rubybolt, effectiveRaw);
  } else if (closestT.sunstone) {
    const dmg = damageSunstoneEnemy(closestT.sunstone, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(closestT.sunstone.x, closestT.sunstone.y, closestT.sunstone.maxHp, dmg,
      isPiercing ? piercingColor : SUNSTONE_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.citrine) {
    const dmg = damageCitrineEnemy(closestT.citrine, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(closestT.citrine.x, closestT.citrine.y, closestT.citrine.maxHp, dmg,
      isPiercing ? piercingColor : CITRINE_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.citrinebolt) {
    damageCitrineBolt(closestT.citrinebolt, effectiveRaw);
  } else if (closestT.iolite) {
    const dmg = damageIoliteEnemy(closestT.iolite, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(closestT.iolite.x, closestT.iolite.y, closestT.iolite.maxHp, dmg,
      isPiercing ? piercingColor : IOLITE_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.amethyst) {
    const dmg = damageAmethystEnemy(closestT.amethyst, effectiveRaw, defPierceRatio, false);
    spawnHitVisualsAt(closestT.amethyst.x, closestT.amethyst.y, closestT.amethyst.maxHp, dmg,
      isPiercing ? piercingColor : AMETHYST_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.amethystshard) {
    damageAmethystShard(closestT.amethystshard, effectiveRaw);
  } else if (closestT.diamond) {
    const dmg = damageDiamondEnemy(closestT.diamond, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(closestT.diamond.x, closestT.diamond.y, closestT.diamond.maxHp, dmg,
      isPiercing ? piercingColor : DIAMOND_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.diamondshard) {
    damageDiamondShard(closestT.diamondshard, effectiveRaw);
  } else if (closestT.nullstone) {
    const dmg = damageNullstoneEnemy(closestT.nullstone, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(closestT.nullstone.x, closestT.nullstone.y, closestT.nullstone.maxHp, dmg,
      isPiercing ? piercingColor : NULLSTONE_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.voidtendril) {
    damageVoidTendril(closestT.voidtendril, effectiveRaw);
  } else if (closestT.fracteryl) {
    const dmg = damageFracterylEnemy(closestT.fracteryl, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(closestT.fracteryl.x, closestT.fracteryl.y, closestT.fracteryl.maxHp, dmg,
      isPiercing ? piercingColor : FRACTERYL_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.fracterylshard) {
    damageFracterylShard(closestT.fracterylshard, effectiveRaw);
  } else if (closestT.eigenstein) {
    const dmg = damageEigensteinEnemy(closestT.eigenstein, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(closestT.eigenstein.x, closestT.eigenstein.y, closestT.eigenstein.maxHp, dmg,
      isPiercing ? piercingColor : EIGENSTEIN_ENEMY_GLOW, effectiveSourceColor);
  } else if (closestT.polyomino) {
    const dmg = damagePolyominoEnemy(closestT.polyomino, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(closestT.x, closestT.y, closestT.polyomino.maxHp, dmg,
      isPiercing ? piercingColor : '#52b788', effectiveSourceColor);
  } else if (closestT.fissilePolyomino) {
    const dmg = damageFissilePolyominoEnemy(closestT.fissilePolyomino, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(closestT.x, closestT.y, closestT.fissilePolyomino.maxHp, dmg,
      isPiercing ? piercingColor : '#e9c46a', effectiveSourceColor);
  } else if (closestT.refractorPolyomino) {
    const dmg = damageRefractorPolyominoEnemy(closestT.refractorPolyomino, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(closestT.x, closestT.y, closestT.refractorPolyomino.maxHp, dmg,
      isPiercing ? piercingColor : '#00f5d4', effectiveSourceColor);
  } else if (closestT.elite) {
    const dmg = damageEliteEnemy(closestT.elite, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(closestT.elite.x, closestT.elite.y, closestT.elite.maxHp, dmg,
      isPiercing ? piercingColor : '#ffe060', effectiveSourceColor);
  } else if (closestT.boss) {
    const dmg = damageBossEnemy(effectiveRaw, defPierceRatio);
    if (dmg > 0) spawnHitVisualsAt(closestT.boss.x, closestT.boss.y, closestT.boss.maxHp, dmg,
      isPiercing ? piercingColor : BOSS_GLOW_COLORS[Math.min(closestT.boss.bossId, BOSS_GLOW_COLORS.length - 1)],
      effectiveSourceColor);
  } else if (closestT.alivenParticle && closestT.alivenGroup) {
    const dmg = ctx.damageAlivenParticle(closestT.alivenParticle, closestT.alivenGroup, effectiveRaw);
    if (dmg > 0) spawnHitVisualsAt(closestT.alivenParticle.x, closestT.alivenParticle.y, closestT.alivenParticle.maxHp, dmg,
      isPiercing ? piercingColor : closestT.alivenParticle.glowColor, effectiveSourceColor);
  } else if (closestT.horizonPentagonReal) {
    const g = closestT.horizonPentagonReal;
    const dmg = ctx.damageHorizonPentagonReal(g, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(hitX, hitY, g.maxHp, dmg, isPiercing ? piercingColor : '#6699ff', effectiveSourceColor);
  } else if (closestT.horizonMissile) {
    ctx.damageHorizonMissile(closestT.horizonMissile, effectiveRaw, defPierceRatio);
  }

  // ── Lens status post-hit: apply Tier 1 statuses to target ───────────────────
  if (attachedLens && targetEntity && weaponId) {
    const enemyTypeId = getTargetEnemyTypeId(closestT);
    applyLensStatusesOnHit(
      targetEntity, attachedLens, weaponId, rawDamage, enemyTypeId,
      _canShowAffinityFeedback(targetEntity) ? (text, x, y) => {
        const color = text === 'IMMUNE' ? '#9ab' : text === 'WEAK!' ? '#7ef' : '#fa8';
        ctx.spawnDamageNumber(x, y, 0, -0.8, text, 0.15, color);
      } : undefined,
      hitX, hitY,
    );
    handleLensTier2EffectsOnWeaponHit({ targetEntity, hitDamage: rawDamage, lens: attachedLens, weaponId, ctx });
    handleLensTier3EffectsOnWeaponHit({ targetEntity, hitDamage: rawDamage, lens: attachedLens, weaponId, ctx });
  }

  // ── Crafted weapon post-hit effects ──────────────────────────────────────

  if (craftedMods && (craftedMods.nullstonePullRadius > 0 || craftedMods.fracterylStrikes > 0)) {
    const pool = makeFracterylPool(craftedMods.fracterylStrikes);
    applyCraftedPostHit(ctx, hitX, hitY, rawDamage, defPierceRatio, craftedMods, rangeSq, pool, effectiveSourceColor);
  }

  // ── Status combo evaluation ───────────────────────────────────────────────

  if (comboTargetEntity) {
    const nowMs = performance.now();
    const comboResults = evaluateStatusCombosOnStatusApplied({
      enemy: comboTargetEntity, enemyTypeId: comboEnemyTypeId,
      x: hitX, y: hitY, baseDamage: rawDamage, nowMs,
    });
    const shatter = evaluateShatterCombo({
      enemy: comboTargetEntity, enemyTypeId: comboEnemyTypeId,
      x: hitX, y: hitY, hitDamage: rawDamage, nowMs,
    });
    if (shatter) comboResults.push(shatter);
    applyComboResults(ctx, comboResults);
  }
}
