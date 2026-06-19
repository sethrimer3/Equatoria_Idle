/**
 * equipment-modifiers.ts - Pure combat-facing aggregation for equipped lenses and weaves.
 *
 * This module depends only on saved item data and static RPG definitions. It is safe
 * to call from sim tests, render combat code, and UI previews.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import type { CraftedLensData } from './lens-types';
import type { CraftedWeaveData } from './weave-types';
import { buildAllTier1StatusParams } from './lens-status-effects';
import type { LensStatusParams } from '../../sim/rpg/enemy-status-effects';
import { getStatMultiplierForLevel } from './item-refinement';
import { getWeaveEffectDef } from './weave-effects-registry';

export interface EquipmentCombatModifiers {
  weaponDamagePct: number;
  cooldownPct: number;
  projectileSpeedPct: number;
  critChancePct: number;
  critDamagePct: number;
  statusChancePct: number;
  playerDefensePct: number;
}

export interface EquippedLensModifiers extends EquipmentCombatModifiers {
  lens: CraftedLensData | null;
  tier1StatusParams: LensStatusParams[];
  hasTier2Hooks: boolean;
  hasTier3Hooks: boolean;
  hasRiftScarred: boolean;
}

export interface EquippedWeaveModifiers extends EquipmentCombatModifiers {
  equippedWeaves: CraftedWeaveData[];
}

export interface CombinedEquipmentModifiers extends EquipmentCombatModifiers {
  lens: CraftedLensData | null;
  equippedWeaves: CraftedWeaveData[];
  tier1StatusParams: LensStatusParams[];
  hasTier2Hooks: boolean;
  hasTier3Hooks: boolean;
  hasRiftScarred: boolean;
}

export const EMPTY_EQUIPMENT_COMBAT_MODIFIERS: EquipmentCombatModifiers = {
  weaponDamagePct: 0,
  cooldownPct: 0,
  projectileSpeedPct: 0,
  critChancePct: 0,
  critDamagePct: 0,
  statusChancePct: 0,
  playerDefensePct: 0,
};

function emptyLensModifiers(): EquippedLensModifiers {
  return {
    ...EMPTY_EQUIPMENT_COMBAT_MODIFIERS,
    lens: null,
    tier1StatusParams: [],
    hasTier2Hooks: false,
    hasTier3Hooks: false,
    hasRiftScarred: false,
  };
}

function addPercentByAffix(mods: EquipmentCombatModifiers, affixId: string, value: number, refineMult = 1.0): void {
  value = value * refineMult;
  switch (affixId) {
    case 'sand_loom_speed':
    case 'sand_forge_speed':
      mods.cooldownPct += value * 0.25;
      break;
    case 'citrine_all_loom':
    case 'eigenstein_rift_damage':
      mods.weaponDamagePct += value * 0.35;
      break;
    case 'ruby_loom_crit_chance':
      mods.critChancePct += value * 0.35;
      break;
    case 'ruby_loom_crit_output':
    case 'amethyst_echo_strength':
      mods.critDamagePct += value * 0.3;
      break;
    case 'emerald_chain_chance':
    case 'nullstone_enemy_slow':
      mods.statusChancePct += value * 0.35;
      break;
    case 'sapphire_base_mult':
      mods.projectileSpeedPct += value * 0.3;
      break;
    case 'diamond_armor':
      mods.playerDefensePct += value;
      break;
    default:
      break;
  }
}

function clampCombatModifiers<T extends EquipmentCombatModifiers>(mods: T): T {
  mods.weaponDamagePct = Math.min(100, Math.max(0, mods.weaponDamagePct));
  mods.cooldownPct = Math.min(60, Math.max(0, mods.cooldownPct));
  mods.projectileSpeedPct = Math.min(80, Math.max(0, mods.projectileSpeedPct));
  mods.critChancePct = Math.min(75, Math.max(0, mods.critChancePct));
  mods.critDamagePct = Math.min(150, Math.max(0, mods.critDamagePct));
  mods.statusChancePct = Math.min(75, Math.max(0, mods.statusChancePct));
  mods.playerDefensePct = Math.min(200, Math.max(0, mods.playerDefensePct));
  return mods;
}

export function getEquippedLensModifiers(
  lens: CraftedLensData | null | undefined,
  weaponId: string,
  hitDamage: number,
): EquippedLensModifiers {
  if (!lens) return emptyLensModifiers();

  let weaponDamagePct = 0;
  let statusChancePct = 0;
  let critChancePct = 0;
  let critDamagePct = 0;
  let hasTier2Hooks = false;
  let hasTier3Hooks = false;
  let hasRiftScarred = false;

  for (const effect of lens.effects ?? []) {
    if (!effect.isApplied) continue;
    if (effect.effectTier === 1) {
      statusChancePct += Math.max(0, effect.magnitude) * 0.08;
      weaponDamagePct += Math.max(0, effect.magnitude) * 0.04;
      if (effect.tierId === 'eigenstein') hasRiftScarred = true;
    } else if (effect.effectTier === 2) {
      hasTier2Hooks = true;
      weaponDamagePct += Math.max(0, effect.magnitude) * 0.06;
      statusChancePct += Math.max(0, effect.magnitude) * 0.04;
    } else if (effect.effectTier === 3) {
      hasTier3Hooks = true;
      weaponDamagePct += Math.max(0, effect.magnitude) * 0.08;
      critChancePct += Math.max(0, effect.magnitude) * 0.03;
      critDamagePct += Math.max(0, effect.magnitude) * 0.08;
    }
  }

  const refineMult = getStatMultiplierForLevel(lens.refinementLevel ?? 0);
  return clampCombatModifiers({
    weaponDamagePct: weaponDamagePct * refineMult,
    cooldownPct: 0,
    projectileSpeedPct: 0,
    critChancePct: critChancePct * refineMult,
    critDamagePct: critDamagePct * refineMult,
    statusChancePct: statusChancePct * refineMult,
    playerDefensePct: 0,
    lens,
    tier1StatusParams: buildAllTier1StatusParams(lens, weaponId, hitDamage),
    hasTier2Hooks,
    hasTier3Hooks,
    hasRiftScarred,
  });
}

export function getEquippedWeaveModifiers(
  equippedSlots: readonly (string | null)[] | null | undefined,
  craftedWeaves: readonly CraftedWeaveData[] | null | undefined,
): EquippedWeaveModifiers {
  const mods: EquippedWeaveModifiers = {
    ...EMPTY_EQUIPMENT_COMBAT_MODIFIERS,
    equippedWeaves: [],
  };
  if (!equippedSlots || !craftedWeaves) return mods;

  const weaveById = new Map(craftedWeaves.map(weave => [weave.id, weave]));
  for (const id of equippedSlots) {
    if (!id) continue;
    const weave = weaveById.get(id);
    if (!weave) continue;
    mods.equippedWeaves.push(weave);
    const refineMult = getStatMultiplierForLevel(weave.refinementLevel ?? 0);
    for (const affix of weave.affixes ?? []) addPercentByAffix(mods, affix.affixId, affix.value, refineMult);
    for (const effect of weave.effects ?? []) {
      const def = getWeaveEffectDef(effect.id);
      if (!def || def.category !== 'passive') continue; // proc effects don't contribute static stats
      mods[def.statKey] += effect.value * refineMult;
    }
  }

  return clampCombatModifiers(mods);
}

export function getCombinedEquipmentModifiers(args: {
  rpgState: RpgSimState;
  weaponId: string;
  hitDamage: number;
}): CombinedEquipmentModifiers {
  const lens = args.rpgState.craftedWeapons.find(w => w.id === args.weaponId)?.attachedLens ?? null;
  const lensMods = getEquippedLensModifiers(lens, args.weaponId, args.hitDamage);
  const weaveMods = getEquippedWeaveModifiers(args.rpgState.equippedWeaveSlots, args.rpgState.craftedWeaves);

  return clampCombatModifiers({
    weaponDamagePct: lensMods.weaponDamagePct + weaveMods.weaponDamagePct,
    cooldownPct: lensMods.cooldownPct + weaveMods.cooldownPct,
    projectileSpeedPct: lensMods.projectileSpeedPct + weaveMods.projectileSpeedPct,
    critChancePct: lensMods.critChancePct + weaveMods.critChancePct,
    critDamagePct: lensMods.critDamagePct + weaveMods.critDamagePct,
    statusChancePct: lensMods.statusChancePct + weaveMods.statusChancePct,
    playerDefensePct: lensMods.playerDefensePct + weaveMods.playerDefensePct,
    lens: lensMods.lens,
    equippedWeaves: weaveMods.equippedWeaves,
    tier1StatusParams: lensMods.tier1StatusParams,
    hasTier2Hooks: lensMods.hasTier2Hooks,
    hasTier3Hooks: lensMods.hasTier3Hooks,
    hasRiftScarred: lensMods.hasRiftScarred,
  });
}

export function applyEquipmentModifiersToAttackContext(
  rawDamage: number,
  modifiers: EquipmentCombatModifiers,
): number {
  return rawDamage * (1 + modifiers.weaponDamagePct / 100);
}
