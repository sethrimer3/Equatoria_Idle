/**
 * lens-definitions.ts — Naming map and forge-level unlock chances for the Lens system.
 *
 * Tier 1 effects are active combat statuses.
 * Tier 2 effects for all 12 mote tiers are implemented.
 * Tier 3 effects for all 12 mote tiers are implemented.
 */

import type { TierId } from '../tiers';
import type { LensEffectTier, LensRarity } from './lens-types';
import type { EnemyStatusKey } from '../../sim/rpg/enemy-status-effects';
import { getForgeEffectUnlockChances, type ForgeEffectUnlockChances } from './weave-rolling';

// ─── Implemented Tier 2 tier IDs ──────────────────────────────────

/** Tier IDs whose Tier 2 effects are fully implemented. */
export const LENS_T2_IMPLEMENTED_TIER_IDS = new Set<TierId>([
  'sand', 'quartz', 'ruby', 'citrine', 'emerald', 'sapphire', 'iolite',
  'amethyst', 'diamond', 'nullstone', 'fracteryl', 'eigenstein',
]);

// ─── Implemented Tier 3 tier IDs ──────────────────────────────────

/** Tier IDs whose Tier 3 effects are fully implemented. */
export const LENS_T3_IMPLEMENTED_TIER_IDS = new Set<TierId>([
  'sand', 'quartz', 'ruby', 'citrine', 'emerald', 'sapphire',
  'iolite', 'amethyst', 'diamond', 'nullstone', 'fracteryl', 'eigenstein',
]);

// ─── Effect naming map ────────────────────────────────────────────

/** Display names per (tier, effectTier). All T1/T2/T3 effects are implemented. */
export const LENS_EFFECT_NAMES: Partial<Record<TierId, Record<LensEffectTier, string>>> = {
  sand: {
    1: 'Abraded',
    2: 'Sand Spray',
    3: 'Sandstorm Cascade',
  },
  quartz: {
    1: 'Refracted',
    2: 'Prism Split',
    3: 'Perfect Refraction',
  },
  ruby: {
    1: 'Burning',
    2: 'Ruby Beam Splinters',
    3: 'Meltdown Core',
  },
  citrine: {
    1: 'Radiant',
    2: 'Solar Flare Burst',
    3: 'Radiant Detonation',
  },
  emerald: {
    1: 'Poisoned',
    2: 'Venom Spores',
    3: 'Viridian Bloom',
  },
  sapphire: {
    1: 'Chilled',
    2: 'Ice Shards',
    3: 'Absolute Zero',
  },
  iolite: {
    1: 'Time-Warped',
    2: 'Delayed Echo Strike',
    3: 'Time Fracture',
  },
  amethyst: {
    1: 'Echo-Marked',
    2: 'Phantom Repeat',
    3: 'Mirror Volley',
  },
  diamond: {
    1: 'Cracked',
    2: 'Diamond Shrapnel',
    3: 'Faultline Break',
  },
  nullstone: {
    1: 'Gravitized',
    2: 'Gravity Pulse',
    3: 'Event Horizon',
  },
  fracteryl: {
    1: 'Fractal Wound',
    2: 'Recursive Splinter',
    3: 'Infinite Descent',
  },
  eigenstein: {
    1: 'Rift-Scarred',
    2: 'Rift Slash',
    3: 'Reality Cascade',
  },
  // sunstone intentionally omitted — power scaling only, no effects
};

// ─── Tier 2 effect descriptions (implemented tiers only) ─────────

/** Human-readable description for implemented Tier 2 effects. */
export const LENS_T2_DESCRIPTIONS: Partial<Record<TierId, string>> = {
  sand:     'On hit (proc): emit sand fragments from the target — deals physical damage and applies Abraded to nearby enemies.',
  quartz:   'On hit (proc): split crystal beams toward nearby enemies — deals precision damage and applies Refracted.',
  ruby:     'On hit (proc): fire red beamlets in a cone — deals fire damage and applies Burning to hit enemies.',
  citrine:  'On hit (proc): create a solar flare burst — deals radiant damage and applies Radiant to nearby enemies.',
  emerald:  'On hit (proc): release venom spores — deals poison damage and applies Poisoned to nearby enemies.',
  sapphire:   'On hit (proc): burst icy shards outward — deals damage and applies Chilled to nearby enemies.',
  iolite:     'On hit (proc): schedule a delayed echo strike — applies Time-Warped and repeats damage after a short delay.',
  amethyst:   'On hit (proc): queue a ghostly phantom repeat — repeats triggering hit damage after ~600ms and applies Echo-Marked.',
  diamond:    'On hit (proc): emit diamond shrapnel outward — deals piercing damage and applies Cracked to nearby enemies.',
  nullstone:  'On hit (proc): release a gravity pulse — pulls nearby enemies inward, deals void damage, and applies Gravitized.',
  fracteryl:  'On hit (proc): spawn fractal splinter shards (depth capped at 1) — deals reduced damage and applies Fractal Wound.',
  eigenstein: 'On hit (proc): tear a dimensional rift slash — deals rift damage and applies Rift-Scarred.',
};

// ─── Tier 3 effect descriptions (implemented tiers only) ─────────

/** Human-readable description for implemented Tier 3 effects. */
export const LENS_T3_DESCRIPTIONS: Partial<Record<TierId, string>> = {
  sand:      'Sandstorm Cascade: Sand Spray fragments have a chance to release a smaller secondary cascade — deals reduced damage and applies Abraded. Cascade depth capped at 1.',
  quartz:    'Perfect Refraction: Prism Split shards bounce once to a nearby enemy after hitting — deals reduced bounce damage and applies Refracted. No infinite bouncing.',
  ruby:      'Meltdown Core: Ruby hits build heat on the target; at threshold, trigger a fire explosion — damages nearby enemies and applies Burning. Heat and explosion rate capped.',
  citrine:   'Radiant Detonation: When a Radiant-tagged enemy dies, it has a chance to detonate — damages nearby enemies in a golden flash and applies Radiant. Capped per death chain.',
  emerald:   'Viridian Bloom: When a Poison-tagged enemy dies, create a temporary toxic bloom zone — damages enemies inside over time and applies Poisoned. Zone duration and rate capped.',
  sapphire:  'Absolute Zero: Repeated Sapphire lens hits on a Chilled enemy can freeze it — frozen enemies nearly stop moving for a capped duration. The next hit shatters the ice for bonus damage.',
  iolite:    'Time Fracture: Hits against Time-Warped enemies have a chance to fracture time — bursts secondary hits around the target and refreshes Time-Warped. Capped; must not loop.',
  amethyst:  'Mirror Volley: On proc, split the hit into ghostly mirror strikes against nearby enemies — deals reduced damage and applies Echo-Marked. Chain depth capped at 1; mirror hits cannot mirror.',
  diamond:   'Faultline Break: Hits against Cracked enemies have a chance to trigger a fracture burst — damages nearby enemies and applies Cracked. TODO: scale with armor when armor system exists.',
  nullstone: 'Event Horizon: Hits against Gravitized enemies have a chance to spawn a micro black hole — pulls nearby enemies inward, deals periodic void damage, and applies Gravitized. Active zones capped.',
  fracteryl: 'Infinite Descent: When Fractal Wound fully expires on a tagged enemy, a capped chance exists to reapply it at reduced strength (max 2 repeats). Visual: recursive fractal glyph.',
  eigenstein:'Reality Cascade: Repeated hits against Rift-Scarred enemies build per-source instability; at threshold, trigger a dimensional break — deals rift damage scaled by Rift-Scarred stacks and partially clears instability.',
};

// ─── Tier 1 effect descriptions ───────────────────────────────────

/** Human-readable description for Tier 1 effects (used in buildLensEffect). */
export const LENS_T1_DESCRIPTIONS: Partial<Record<TierId, string>> = {
  sand:       'On hit: applies Abraded — enemy takes increased weapon damage.',
  quartz:     'On hit: applies Refracted — enemy takes increased weapon damage (precision vulnerability).',
  ruby:       'On hit: applies Burning — enemy takes fire damage over time.',
  citrine:    'On hit: applies Radiant — enemy takes increased damage (radiance vulnerability).',
  emerald:    'On hit: applies Poisoned — enemy takes poison damage over time.',
  sapphire:   'On hit: applies Chilled — enemy movement speed reduced.',
  iolite:     'On hit: applies Time-Warped — enemy movement and action rate slowed.',
  amethyst:   'On hit: applies Echo-Marked — repeats a portion of hit damage after a short delay.',
  diamond:    'On hit: applies Cracked — enemy takes increased damage (armor vulnerability).',
  nullstone:  'On hit: applies Gravitized — enemy slowed and pulled toward impact.',
  fracteryl:  'On hit: applies Fractal Wound — recursive damage ticks with decay.',
  eigenstein: 'On hit: applies Rift-Scarred — stacking bonus damage per hit with same lens.',
};

// ─── Forge-level unlock chances ───────────────────────────────────

/** Re-exported as the lens-specific alias; the shared table lives in weave-rolling. */
export type LensEffectUnlockChances = ForgeEffectUnlockChances;

export function getLensEffectUnlockChances(forgeLevel: number): LensEffectUnlockChances {
  return getForgeEffectUnlockChances(forgeLevel);
}

// ─── Max mote types ───────────────────────────────────────────────

const LENS_MAX_MOTE_TYPES: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 2,
  5: 3,
};

export function getLensMaxMoteTypes(forgeLevel: number): number {
  return LENS_MAX_MOTE_TYPES[forgeLevel] ?? 3;
}

export interface LensStatModifiers {
  weaponDamagePct?: number;
  statusChancePct?: number;
  critChancePct?: number;
  critDamagePct?: number;
}

export interface LensItemDefinition {
  id: string;
  displayName: string;
  moteTierId?: TierId;
  tier: LensEffectTier;
  rarity: LensRarity;
  description: string;
  iconKey: string;
  statModifiers: LensStatModifiers;
  statusKey?: EnemyStatusKey;
  specialHookKey?: string;
}

export const LENS_ITEM_DEFINITIONS: readonly LensItemDefinition[] = [
  {
    id: 'lens-sand-abrasion-t1',
    displayName: 'Sand Abrasion Lens',
    moteTierId: 'sand',
    tier: 1,
    rarity: 'Common',
    description: LENS_T1_DESCRIPTIONS.sand ?? 'Applies Abraded on hit.',
    iconKey: 'lens:sand',
    statModifiers: { weaponDamagePct: 3, statusChancePct: 4 },
    statusKey: 'abraded',
  },
  {
    id: 'lens-ruby-kindling-t1',
    displayName: 'Ruby Kindling Lens',
    moteTierId: 'ruby',
    tier: 1,
    rarity: 'Uncommon',
    description: LENS_T1_DESCRIPTIONS.ruby ?? 'Applies Burning on hit.',
    iconKey: 'lens:ruby',
    statModifiers: { weaponDamagePct: 2, statusChancePct: 6 },
    statusKey: 'burning',
  },
  {
    id: 'lens-sapphire-chill-t1',
    displayName: 'Sapphire Chill Lens',
    moteTierId: 'sapphire',
    tier: 1,
    rarity: 'Uncommon',
    description: LENS_T1_DESCRIPTIONS.sapphire ?? 'Applies Chilled on hit.',
    iconKey: 'lens:sapphire',
    statModifiers: { statusChancePct: 7 },
    statusKey: 'chilled',
  },
  {
    id: 'lens-quartz-prism-t2',
    displayName: 'Quartz Prism Lens',
    moteTierId: 'quartz',
    tier: 2,
    rarity: 'Rare',
    description: LENS_T2_DESCRIPTIONS.quartz ?? 'Splits precision beams on proc.',
    iconKey: 'lens:quartz',
    statModifiers: { weaponDamagePct: 5, critChancePct: 2 },
    statusKey: 'refracted',
    specialHookKey: 'lensTier2',
  },
  {
    id: 'lens-emerald-spore-t2',
    displayName: 'Emerald Spore Lens',
    moteTierId: 'emerald',
    tier: 2,
    rarity: 'Rare',
    description: LENS_T2_DESCRIPTIONS.emerald ?? 'Releases venom spores on proc.',
    iconKey: 'lens:emerald',
    statModifiers: { weaponDamagePct: 4, statusChancePct: 8 },
    statusKey: 'poisoned',
    specialHookKey: 'lensTier2',
  },
  {
    id: 'lens-nullstone-pulse-t2',
    displayName: 'Nullstone Pulse Lens',
    moteTierId: 'nullstone',
    tier: 2,
    rarity: 'Epic',
    description: LENS_T2_DESCRIPTIONS.nullstone ?? 'Releases a gravity pulse on proc.',
    iconKey: 'lens:nullstone',
    statModifiers: { statusChancePct: 9 },
    statusKey: 'gravitized',
    specialHookKey: 'lensTier2',
  },
  {
    id: 'lens-sapphire-zero-t3',
    displayName: 'Sapphire Absolute Zero Lens',
    moteTierId: 'sapphire',
    tier: 3,
    rarity: 'Legendary',
    description: LENS_T3_DESCRIPTIONS.sapphire ?? 'Repeated chilled hits can freeze.',
    iconKey: 'lens:sapphire:t3',
    statModifiers: { critChancePct: 4, critDamagePct: 12, statusChancePct: 10 },
    statusKey: 'chilled',
    specialHookKey: 'lensTier3',
  },
  {
    id: 'lens-eigenstein-cascade-t3',
    displayName: 'Eigenstein Cascade Lens',
    moteTierId: 'eigenstein',
    tier: 3,
    rarity: 'Mythic',
    description: LENS_T3_DESCRIPTIONS.eigenstein ?? 'Builds rift instability on scarred enemies.',
    iconKey: 'lens:eigenstein:t3',
    statModifiers: { weaponDamagePct: 8, statusChancePct: 8 },
    statusKey: 'riftScarred',
    specialHookKey: 'lensTier3',
  },
];

export const LENS_ITEM_DEFINITION_BY_ID = new Map(LENS_ITEM_DEFINITIONS.map(def => [def.id, def]));
