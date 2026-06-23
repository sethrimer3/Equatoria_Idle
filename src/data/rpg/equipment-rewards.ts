import type { TierId } from '../tiers';
import type { RpgZoneId } from './rpg-zone-definitions';
import type { CraftedWeaponIngredient } from './crafted-weapon-types';

export type EquipmentRewardKind = 'lens' | 'weave';
export type EquipmentRewardSource = 'normal' | 'elite' | 'boss' | 'milestone' | 'dev';

export interface EquipmentRewardSpec {
  kind: EquipmentRewardKind;
  ingredients: CraftedWeaponIngredient[];
  forgeLevel: number;
  source: EquipmentRewardSource;
  isMajor: boolean;
  /** Zone this item was obtained in, for source metadata. */
  zoneId: RpgZoneId;
  /** Wave number at drop time, for source metadata. */
  wave: number;
  /** Quality floor for rarity rolling. Boss drops use 0.45 (minimum Uncommon). */
  qualityFloor: number;
}

export interface EquipmentRewardRollContext {
  zoneId: RpgZoneId;
  subzoneId?: string;
  wave: number;
  forgeLevel: number;
  source: EquipmentRewardSource;
  rng?: () => number;
}

export const EQUIPMENT_REWARD_DROP_RATES = {
  normalLensChance: 0.012,
  normalWeaveChance: 0.0015,
  eliteLensChance: 0.18,
  eliteWeaveChance: 0.045,
  bossLensChance: 1,
  bossWeaveChance: 0.65,
  milestoneLensChance: 1,
  milestoneWeaveChance: 0.35,
} as const;

const ZONE_LENS_TIERS: Record<RpgZoneId, readonly TierId[]> = {
  euhedral: ['sand', 'quartz', 'ruby', 'sapphire'],
  impetus: ['quartz', 'sapphire', 'iolite', 'nullstone'],
  caustics: ['quartz', 'citrine', 'sapphire', 'diamond'],
  verdure: ['emerald', 'citrine', 'amethyst', 'fracteryl'],
  horizon: ['diamond', 'nullstone', 'fracteryl', 'eigenstein'],
};

const ZONE_WEAVE_TIERS: Record<RpgZoneId, readonly TierId[]> = {
  euhedral: ['sand', 'ruby'],
  impetus: ['sand', 'sapphire', 'iolite'],
  caustics: ['citrine', 'sapphire', 'diamond'],
  verdure: ['emerald', 'amethyst', 'fracteryl'],
  horizon: ['diamond', 'nullstone', 'eigenstein'],
};

function depthCapForWave(wave: number): number {
  if (wave >= 80) return 4;
  if (wave >= 50) return 3;
  if (wave >= 20) return 2;
  return 1;
}

function sourcePower(ctx: EquipmentRewardRollContext): number {
  if (ctx.source === 'boss') return 4;
  if (ctx.source === 'milestone') return 3;
  if (ctx.source === 'elite') return 2;
  return 1;
}

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

function buildIngredients(tiers: readonly TierId[], ctx: EquipmentRewardRollContext): CraftedWeaponIngredient[] {
  const rng = ctx.rng ?? Math.random;
  const cap = Math.min(tiers.length, Math.max(1, depthCapForWave(ctx.wave), ctx.forgeLevel));
  const eligible = tiers.slice(0, cap);
  const primary = pick(eligible, rng);
  const count = sourcePower(ctx) + Math.floor(Math.max(0, ctx.wave) / 25);
  const ingredients: CraftedWeaponIngredient[] = [{ tierId: primary, refinedCount: BigInt(Math.max(1, count)) }];
  if ((ctx.source === 'boss' || ctx.source === 'milestone') && eligible.length > 1 && rng() < 0.45) {
    let secondary = pick(eligible, rng);
    if (secondary === primary) secondary = eligible.find(t => t !== primary) ?? secondary;
    if (secondary !== primary) ingredients.push({ tierId: secondary, refinedCount: 1n });
  }
  return ingredients;
}

export function getEligibleLensDrops(ctx: EquipmentRewardRollContext): readonly TierId[] {
  return ZONE_LENS_TIERS[ctx.zoneId] ?? ZONE_LENS_TIERS.euhedral;
}

export function getEligibleWeaveDrops(ctx: EquipmentRewardRollContext): readonly TierId[] {
  return ZONE_WEAVE_TIERS[ctx.zoneId] ?? ZONE_WEAVE_TIERS.euhedral;
}

export function rollLensDrop(ctx: EquipmentRewardRollContext): EquipmentRewardSpec | null {
  const rng = ctx.rng ?? Math.random;
  const chance =
    ctx.source === 'boss' ? EQUIPMENT_REWARD_DROP_RATES.bossLensChance :
    ctx.source === 'milestone' ? EQUIPMENT_REWARD_DROP_RATES.milestoneLensChance :
    ctx.source === 'elite' ? EQUIPMENT_REWARD_DROP_RATES.eliteLensChance :
    EQUIPMENT_REWARD_DROP_RATES.normalLensChance;
  if (rng() >= chance) return null;
  return {
    kind: 'lens',
    source: ctx.source,
    isMajor: ctx.source === 'boss' || ctx.source === 'milestone',
    forgeLevel: Math.max(1, Math.min(5, ctx.forgeLevel)),
    ingredients: buildIngredients(getEligibleLensDrops(ctx), ctx),
  };
}

export function rollWeaveDrop(ctx: EquipmentRewardRollContext): EquipmentRewardSpec | null {
  const rng = ctx.rng ?? Math.random;
  const chance =
    ctx.source === 'boss' ? EQUIPMENT_REWARD_DROP_RATES.bossWeaveChance :
    ctx.source === 'milestone' ? EQUIPMENT_REWARD_DROP_RATES.milestoneWeaveChance :
    ctx.source === 'elite' ? EQUIPMENT_REWARD_DROP_RATES.eliteWeaveChance :
    EQUIPMENT_REWARD_DROP_RATES.normalWeaveChance;
  if (rng() >= chance) return null;
  return {
    kind: 'weave',
    source: ctx.source,
    isMajor: ctx.source === 'boss' || ctx.source === 'milestone',
    forgeLevel: Math.max(1, Math.min(5, ctx.forgeLevel)),
    ingredients: buildIngredients(getEligibleWeaveDrops(ctx), ctx),
  };
}

// ── Dev/debug tuning helpers ──────────────────────────────────────────────────

export interface RewardTuningInfo {
  zoneId: RpgZoneId;
  wave: number;
  source: EquipmentRewardSource;
  lensDropChance: number;
  weaveDropChance: number;
  eligibleLensTiers: readonly TierId[];
  eligibleWeaveTiers: readonly TierId[];
  depthCap: number;
  /** Why certain mote tiers cannot drop. */
  ineligibleLensTierReasons: Record<string, string>;
  ineligibleWeaveTierReasons: Record<string, string>;
}

const ALL_TIER_IDS: readonly TierId[] = [
  'sand', 'quartz', 'ruby', 'citrine', 'emerald', 'sapphire',
  'iolite', 'amethyst', 'diamond', 'nullstone', 'fracteryl', 'eigenstein',
];

/** Returns drop tuning info for the given context — intended for the debug overlay only. */
export function getRewardTuningInfo(ctx: EquipmentRewardRollContext): RewardTuningInfo {
  const eligibleLens = getEligibleLensDrops(ctx);
  const eligibleWeave = getEligibleWeaveDrops(ctx);
  const eligibleLensSet = new Set(eligibleLens);
  const eligibleWeaveSet = new Set(eligibleWeave);

  const lensChance =
    ctx.source === 'boss' ? EQUIPMENT_REWARD_DROP_RATES.bossLensChance :
    ctx.source === 'milestone' ? EQUIPMENT_REWARD_DROP_RATES.milestoneLensChance :
    ctx.source === 'elite' ? EQUIPMENT_REWARD_DROP_RATES.eliteLensChance :
    EQUIPMENT_REWARD_DROP_RATES.normalLensChance;

  const weaveChance =
    ctx.source === 'boss' ? EQUIPMENT_REWARD_DROP_RATES.bossWeaveChance :
    ctx.source === 'milestone' ? EQUIPMENT_REWARD_DROP_RATES.milestoneWeaveChance :
    ctx.source === 'elite' ? EQUIPMENT_REWARD_DROP_RATES.eliteWeaveChance :
    EQUIPMENT_REWARD_DROP_RATES.normalWeaveChance;

  const ineligibleLensReasons: Record<string, string> = {};
  const ineligibleWeaveReasons: Record<string, string> = {};
  const zoneLens = ZONE_LENS_TIERS[ctx.zoneId] ?? ZONE_LENS_TIERS.euhedral;
  const zoneWeave = ZONE_WEAVE_TIERS[ctx.zoneId] ?? ZONE_WEAVE_TIERS.euhedral;
  const dc = depthCapForWave(ctx.wave);

  for (const tid of ALL_TIER_IDS) {
    if (!eligibleLensSet.has(tid)) {
      if (!zoneLens.includes(tid)) {
        ineligibleLensReasons[tid] = `not in ${ctx.zoneId} zone pool`;
      } else {
        const idx = zoneLens.indexOf(tid);
        ineligibleLensReasons[tid] = `zone pool index ${idx} exceeds depth cap ${dc} (wave ${ctx.wave})`;
      }
    }
    if (!eligibleWeaveSet.has(tid)) {
      if (!zoneWeave.includes(tid)) {
        ineligibleWeaveReasons[tid] = `not in ${ctx.zoneId} zone pool`;
      } else {
        const idx = zoneWeave.indexOf(tid);
        ineligibleWeaveReasons[tid] = `zone pool index ${idx} exceeds depth cap ${dc} (wave ${ctx.wave})`;
      }
    }
  }

  return {
    zoneId: ctx.zoneId,
    wave: ctx.wave,
    source: ctx.source,
    lensDropChance: lensChance,
    weaveDropChance: weaveChance,
    eligibleLensTiers: eligibleLens,
    eligibleWeaveTiers: eligibleWeave,
    depthCap: dc,
    ineligibleLensTierReasons: ineligibleLensReasons,
    ineligibleWeaveTierReasons: ineligibleWeaveReasons,
  };
}

// ── Reward simulation (deterministic, for tests and debug) ────────────────────

export interface RewardSimResult {
  totalKills: number;
  lensDrops: number;
  weaveDrops: number;
  lensDropRate: number;
  weaveDropRate: number;
  tierCounts: Record<string, number>;
}

/**
 * Simulates `count` reward rolls using a deterministic RNG and returns aggregate stats.
 * Pure function — no side effects. Safe to call from tests.
 */
export function simulateRewardRolls(
  count: number,
  ctx: Omit<EquipmentRewardRollContext, 'rng'>,
  rng: () => number,
): RewardSimResult {
  let lensDrops = 0;
  let weaveDrops = 0;
  const tierCounts: Record<string, number> = {};

  for (let i = 0; i < count; i++) {
    const spec = rollEquipmentReward({ ...ctx, rng });
    if (!spec) continue;
    if (spec.kind === 'lens') lensDrops++;
    else weaveDrops++;
    for (const ing of spec.ingredients) {
      tierCounts[ing.tierId] = (tierCounts[ing.tierId] ?? 0) + 1;
    }
  }

  return {
    totalKills: count,
    lensDrops,
    weaveDrops,
    lensDropRate: lensDrops / count,
    weaveDropRate: weaveDrops / count,
    tierCounts,
  };
}

export function rollEquipmentReward(ctx: EquipmentRewardRollContext): EquipmentRewardSpec | null {
  const lens = rollLensDrop(ctx);
  if (lens) return lens;
  return rollWeaveDrop(ctx);
}
