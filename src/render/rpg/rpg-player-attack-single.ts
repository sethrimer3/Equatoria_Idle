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
import type { CombinedEquipmentModifiers } from '../../data/rpg/equipment-modifiers';
import { applyCraftedPostHit, makeFracterylPool } from './rpg-crafted-post-hit';
import {
  getIncomingDamageMult, getRiftScarredDamageMult,
} from '../../sim/rpg/enemy-status-effects';
import { getLingeringHexDamageMult } from '../../sim/rpg/weave-enemy-debuffs';
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


export function performSingleAttack(
  ctx: RpgPlayerAttackCtx,
  rawDamage: number,
  rangeSq: number,
  isPiercing: boolean,
  defPierceRatio: number,
  shotColor: string,
  craftedMods?: CraftedWeaponModifiers,
  equipment?: CombinedEquipmentModifiers,
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

  // Populated when a real hit lands on a main enemy (dmg > 0). Used by the
  // onWeaponHitEnemy hook (weave_echo_strike) after the main hit/VFX block.
  let echoHit: { dmg: number; x: number; y: number; maxHp: number; applyFn: (b: number) => void } | null = null;

  // ── Lens status pre-hit: apply incoming-damage multipliers ───────────────────
  const comboTargetEntity = extractTargetEntity(closestT);
  const comboEnemyTypeId = getTargetEnemyTypeId(closestT);
  const targetEntity = equipment?.lens ? comboTargetEntity : null;
  const lensSourceKey = equipment?.lens?.id ?? '';
  const statusMult = targetEntity ? getIncomingDamageMult(targetEntity) : 1;
  const riftMult   = (targetEntity && lensSourceKey) ? getRiftScarredDamageMult(targetEntity, lensSourceKey) : 1;
  const hexMult    = comboTargetEntity ? getLingeringHexDamageMult(comboTargetEntity) : 1;
  const effectiveRaw = rawDamage * statusMult * riftMult * hexMult;

  if (closestT.laser) {
    const e = closestT.laser;
    const dmg = damageEnemy(e, effectiveRaw, defPierceRatio);
    spawnHitVisuals(e, dmg, isPiercing ? piercingColor : shotColor, effectiveSourceColor);
    if (dmg > 0) echoHit = { dmg, x: e.x, y: e.y, maxHp: e.maxHp, applyFn: (b) => damageEnemy(e, b, 1) };
  } else if (closestT.sapphire) {
    const e = closestT.sapphire;
    const dmg = damageSapphireEnemy(e, effectiveRaw, defPierceRatio, false);
    spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, isPiercing ? piercingColor : SAPPHIRE_ENEMY_GLOW, effectiveSourceColor);
    if (dmg > 0) echoHit = { dmg, x: e.x, y: e.y, maxHp: e.maxHp, applyFn: (b) => damageSapphireEnemy(e, b, 1, false) };
  } else if (closestT.missile) {
    damageMissile(closestT.missile, effectiveRaw);
  } else if (closestT.emerald) {
    const e = closestT.emerald;
    const dmg = damageEmeraldEnemy(e, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, isPiercing ? piercingColor : EMERALD_ENEMY_GLOW, effectiveSourceColor);
    if (dmg > 0) echoHit = { dmg, x: e.x, y: e.y, maxHp: e.maxHp, applyFn: (b) => damageEmeraldEnemy(e, b, 1) };
  } else if (closestT.amber) {
    const e = closestT.amber;
    const dmg = damageAmberEnemy(e, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, isPiercing ? piercingColor : AMBER_ENEMY_GLOW, effectiveSourceColor);
    if (dmg > 0) echoHit = { dmg, x: e.x, y: e.y, maxHp: e.maxHp, applyFn: (b) => damageAmberEnemy(e, b, 1) };
  } else if (closestT.ambershard) {
    damageAmberShard(closestT.ambershard, effectiveRaw);
  } else if (closestT.void) {
    const e = closestT.void;
    const dmg = damageVoidEnemy(e, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, isPiercing ? piercingColor : VOID_ENEMY_GLOW, effectiveSourceColor);
    if (dmg > 0) echoHit = { dmg, x: e.x, y: e.y, maxHp: e.maxHp, applyFn: (b) => damageVoidEnemy(e, b, 1) };
  } else if (closestT.quartz) {
    const e = closestT.quartz;
    const dmg = damageQuartzEnemy(e, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, isPiercing ? piercingColor : QUARTZ_ENEMY_GLOW, effectiveSourceColor);
    if (dmg > 0) echoHit = { dmg, x: e.x, y: e.y, maxHp: e.maxHp, applyFn: (b) => damageQuartzEnemy(e, b, 1) };
  } else if (closestT.quartzspike) {
    damageQuartzSpike(closestT.quartzspike, effectiveRaw);
  } else if (closestT.ruby) {
    const e = closestT.ruby;
    const dmg = damageRubyEnemy(e, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, isPiercing ? piercingColor : RUBY_ENEMY_GLOW, effectiveSourceColor);
    if (dmg > 0) echoHit = { dmg, x: e.x, y: e.y, maxHp: e.maxHp, applyFn: (b) => damageRubyEnemy(e, b, 1) };
  } else if (closestT.rubybolt) {
    damageRubyBolt(closestT.rubybolt, effectiveRaw);
  } else if (closestT.sunstone) {
    const e = closestT.sunstone;
    const dmg = damageSunstoneEnemy(e, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, isPiercing ? piercingColor : SUNSTONE_ENEMY_GLOW, effectiveSourceColor);
    if (dmg > 0) echoHit = { dmg, x: e.x, y: e.y, maxHp: e.maxHp, applyFn: (b) => damageSunstoneEnemy(e, b, 1) };
  } else if (closestT.citrine) {
    const e = closestT.citrine;
    const dmg = damageCitrineEnemy(e, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, isPiercing ? piercingColor : CITRINE_ENEMY_GLOW, effectiveSourceColor);
    if (dmg > 0) echoHit = { dmg, x: e.x, y: e.y, maxHp: e.maxHp, applyFn: (b) => damageCitrineEnemy(e, b, 1) };
  } else if (closestT.citrinebolt) {
    damageCitrineBolt(closestT.citrinebolt, effectiveRaw);
  } else if (closestT.iolite) {
    const e = closestT.iolite;
    const dmg = damageIoliteEnemy(e, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, isPiercing ? piercingColor : IOLITE_ENEMY_GLOW, effectiveSourceColor);
    if (dmg > 0) echoHit = { dmg, x: e.x, y: e.y, maxHp: e.maxHp, applyFn: (b) => damageIoliteEnemy(e, b, 1) };
  } else if (closestT.amethyst) {
    const e = closestT.amethyst;
    const dmg = damageAmethystEnemy(e, effectiveRaw, defPierceRatio, false);
    spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, isPiercing ? piercingColor : AMETHYST_ENEMY_GLOW, effectiveSourceColor);
    if (dmg > 0) echoHit = { dmg, x: e.x, y: e.y, maxHp: e.maxHp, applyFn: (b) => damageAmethystEnemy(e, b, 1, false) };
  } else if (closestT.amethystshard) {
    damageAmethystShard(closestT.amethystshard, effectiveRaw);
  } else if (closestT.diamond) {
    const e = closestT.diamond;
    const dmg = damageDiamondEnemy(e, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, isPiercing ? piercingColor : DIAMOND_ENEMY_GLOW, effectiveSourceColor);
    if (dmg > 0) echoHit = { dmg, x: e.x, y: e.y, maxHp: e.maxHp, applyFn: (b) => damageDiamondEnemy(e, b, 1) };
  } else if (closestT.diamondshard) {
    damageDiamondShard(closestT.diamondshard, effectiveRaw);
  } else if (closestT.nullstone) {
    const e = closestT.nullstone;
    const dmg = damageNullstoneEnemy(e, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, isPiercing ? piercingColor : NULLSTONE_ENEMY_GLOW, effectiveSourceColor);
    if (dmg > 0) echoHit = { dmg, x: e.x, y: e.y, maxHp: e.maxHp, applyFn: (b) => damageNullstoneEnemy(e, b, 1) };
  } else if (closestT.voidtendril) {
    damageVoidTendril(closestT.voidtendril, effectiveRaw);
  } else if (closestT.fracteryl) {
    const e = closestT.fracteryl;
    const dmg = damageFracterylEnemy(e, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, isPiercing ? piercingColor : FRACTERYL_ENEMY_GLOW, effectiveSourceColor);
    if (dmg > 0) echoHit = { dmg, x: e.x, y: e.y, maxHp: e.maxHp, applyFn: (b) => damageFracterylEnemy(e, b, 1) };
  } else if (closestT.fracterylshard) {
    damageFracterylShard(closestT.fracterylshard, effectiveRaw);
  } else if (closestT.eigenstein) {
    const e = closestT.eigenstein;
    const dmg = damageEigensteinEnemy(e, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, isPiercing ? piercingColor : EIGENSTEIN_ENEMY_GLOW, effectiveSourceColor);
    if (dmg > 0) echoHit = { dmg, x: e.x, y: e.y, maxHp: e.maxHp, applyFn: (b) => damageEigensteinEnemy(e, b, 1) };
  } else if (closestT.polyomino) {
    const e = closestT.polyomino;
    const dmg = damagePolyominoEnemy(e, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(closestT.x, closestT.y, e.maxHp, dmg, isPiercing ? piercingColor : '#52b788', effectiveSourceColor);
    if (dmg > 0) echoHit = { dmg, x: closestT.x, y: closestT.y, maxHp: e.maxHp, applyFn: (b) => damagePolyominoEnemy(e, b, 1) };
  } else if (closestT.fissilePolyomino) {
    const e = closestT.fissilePolyomino;
    const dmg = damageFissilePolyominoEnemy(e, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(closestT.x, closestT.y, e.maxHp, dmg, isPiercing ? piercingColor : '#e9c46a', effectiveSourceColor);
    if (dmg > 0) echoHit = { dmg, x: closestT.x, y: closestT.y, maxHp: e.maxHp, applyFn: (b) => damageFissilePolyominoEnemy(e, b, 1) };
  } else if (closestT.refractorPolyomino) {
    const e = closestT.refractorPolyomino;
    const dmg = damageRefractorPolyominoEnemy(e, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(closestT.x, closestT.y, e.maxHp, dmg, isPiercing ? piercingColor : '#00f5d4', effectiveSourceColor);
    if (dmg > 0) echoHit = { dmg, x: closestT.x, y: closestT.y, maxHp: e.maxHp, applyFn: (b) => damageRefractorPolyominoEnemy(e, b, 1) };
  } else if (closestT.elite) {
    const e = closestT.elite;
    const dmg = damageEliteEnemy(e, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, isPiercing ? piercingColor : '#ffe060', effectiveSourceColor);
    if (dmg > 0) echoHit = { dmg, x: e.x, y: e.y, maxHp: e.maxHp, applyFn: (b) => damageEliteEnemy(e, b, 1) };
  } else if (closestT.boss) {
    const e = closestT.boss;
    const dmg = damageBossEnemy(effectiveRaw, defPierceRatio);
    if (dmg > 0) {
      spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg,
        isPiercing ? piercingColor : BOSS_GLOW_COLORS[Math.min(e.bossId, BOSS_GLOW_COLORS.length - 1)],
        effectiveSourceColor);
      echoHit = { dmg, x: e.x, y: e.y, maxHp: e.maxHp, applyFn: (b) => damageBossEnemy(b, 1) };
    }
  } else if (closestT.alivenParticle && closestT.alivenGroup) {
    const p = closestT.alivenParticle; const g = closestT.alivenGroup;
    const dmg = ctx.damageAlivenParticle(p, g, effectiveRaw);
    if (dmg > 0) {
      spawnHitVisualsAt(p.x, p.y, p.maxHp, dmg, isPiercing ? piercingColor : p.glowColor, effectiveSourceColor);
      echoHit = { dmg, x: p.x, y: p.y, maxHp: p.maxHp, applyFn: (b) => ctx.damageAlivenParticle(p, g, b) };
    }
  } else if (closestT.horizonPentagonReal) {
    const g = closestT.horizonPentagonReal;
    const dmg = ctx.damageHorizonPentagonReal(g, effectiveRaw, defPierceRatio);
    spawnHitVisualsAt(hitX, hitY, g.maxHp, dmg, isPiercing ? piercingColor : '#6699ff', effectiveSourceColor);
    if (dmg > 0) echoHit = { dmg, x: hitX, y: hitY, maxHp: g.maxHp, applyFn: (b) => ctx.damageHorizonPentagonReal(g, b, 1) };
  } else if (closestT.horizonMissile) {
    ctx.damageHorizonMissile(closestT.horizonMissile, effectiveRaw, defPierceRatio);
  }

  // ── Weave echo proc (onWeaponHitEnemy) ────────────────────────────────────
  // Called after the main hit so the bonus damage is applied to the same enemy
  // without going through performWeaponAttack — no recursion is possible.
  if (echoHit) ctx.onWeaponHitEnemy?.(echoHit.dmg, echoHit.x, echoHit.y, echoHit.maxHp, echoHit.applyFn, comboTargetEntity ?? undefined);

  // ── Lens status post-hit: apply Tier 1 statuses to target ───────────────────
  if (equipment?.lens && targetEntity && weaponId) {
    const enemyTypeId = getTargetEnemyTypeId(closestT);
    const statusResult = applyTier1LensStatusesToEnemy({
      enemy: targetEntity, lens: equipment.lens, weaponId, hitDamage: rawDamage, enemyTypeId,
      statusPowerPct: equipment.statusChancePct,
    });
    if (statusResult.affinityFeedback && _canShowAffinityFeedback(targetEntity)) {
      const text = statusResult.affinityFeedback;
      const color = text === 'IMMUNE' ? '#9ab' : text === 'WEAK!' ? '#7ef' : '#fa8';
      ctx.spawnDamageNumber(hitX, hitY, 0, -0.8, text, 0.15, color);
    }
    handleLensTier2EffectsOnWeaponHit({ targetEntity, hitDamage: rawDamage, lens: equipment.lens, weaponId, ctx });
    handleLensTier3EffectsOnWeaponHit({ targetEntity, hitDamage: rawDamage, lens: equipment.lens, weaponId, ctx });
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
      x: hitX, y: hitY, baseDamage: rawDamage, nowMs, triggerKind: 'statusApplied',
    });
    const shatter = evaluateShatterCombo({
      enemy: comboTargetEntity, enemyTypeId: comboEnemyTypeId,
      x: hitX, y: hitY, hitDamage: rawDamage, nowMs,
    });
    if (shatter) comboResults.push(shatter);
    applyComboResults(ctx, comboResults);
  }
}
