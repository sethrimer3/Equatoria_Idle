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

export function rollEquipmentReward(ctx: EquipmentRewardRollContext): EquipmentRewardSpec | null {
  const lens = rollLensDrop(ctx);
  if (lens) return lens;
  return rollWeaveDrop(ctx);
}
