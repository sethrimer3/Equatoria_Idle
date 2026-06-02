import { TIER_BY_ID, type TierId } from '../tiers';
import {
  INFINITE_RANGE,
  WEAPON_BY_ID,
  type WeaponDefinition,
  type WeaponEffect,
  type WeaponStats,
} from './weapon-definitions';
import type {
  CraftedWeaponCompositionEntry,
  CraftedWeaponData,
  CraftedWeaponIngredient,
} from './crafted-weapon-types';

const craftedWeaponCache = new Map<string, WeaponDefinition>();

const EFFECT_LABELS: Record<string, string> = {
  single: 'single-target strike',
  multi: 'split volley',
  aoe: 'shockwave burst',
  piercing: 'piercing shot',
  gatling: 'rapid-fire barrage',
  emeraldMissile: 'seeking missile swarm',
  poisonBolt: 'venom bolt',
};

const EFFECT_NOUNS: Record<string, string> = {
  single: 'Edge',
  multi: 'Volley',
  aoe: 'Nova',
  piercing: 'Lance',
  gatling: 'Spray',
  emeraldMissile: 'Swarm',
  poisonBolt: 'Sting',
};

export function getTierForgeWeight(tierId: TierId): number {
  const tier = TIER_BY_ID.get(tierId);
  return Math.pow(100, tier?.unlockOrder ?? 0);
}

export function getForgeCapacity(forgeCraftLevel: number): number {
  // Level 1→2, Level 2→3, Level 3→4, Level 4→5, Level 5+→6
  const level = Math.max(1, Math.floor(forgeCraftLevel) || 1);
  return Math.min(6, level + 1);
}

export function normalizeCraftedWeaponIngredients(
  ingredients: CraftedWeaponIngredient[],
): CraftedWeaponIngredient[] {
  const merged = new Map<TierId, number>();
  for (const ingredient of ingredients) {
    const refinedCount = Math.max(0, Math.floor(ingredient.refinedCount));
    if (refinedCount <= 0) continue;
    merged.set(ingredient.tierId, (merged.get(ingredient.tierId) ?? 0) + refinedCount);
  }
  return Array.from(merged.entries())
    .map(([tierId, refinedCount]) => ({ tierId, refinedCount }))
    .sort((a, b) => {
      const orderDiff = (TIER_BY_ID.get(b.tierId)?.unlockOrder ?? 0) - (TIER_BY_ID.get(a.tierId)?.unlockOrder ?? 0);
      return orderDiff !== 0 ? orderDiff : a.tierId.localeCompare(b.tierId);
    });
}

export function computeCraftedWeaponComposition(
  ingredients: CraftedWeaponIngredient[],
): CraftedWeaponCompositionEntry[] {
  const normalized = normalizeCraftedWeaponIngredients(ingredients);
  const weightedEntries = normalized.map((ingredient) => ({
    tierId: ingredient.tierId,
    weightedValue: ingredient.refinedCount * getTierForgeWeight(ingredient.tierId),
  }));
  const totalWeight = weightedEntries.reduce((sum, entry) => sum + entry.weightedValue, 0);
  return weightedEntries
    .map((entry) => ({
      ...entry,
      share: totalWeight > 0 ? entry.weightedValue / totalWeight : 0,
    }))
    .sort((a, b) => b.weightedValue - a.weightedValue);
}

export function getDominantCraftedEffect(tierId: TierId): WeaponEffect {
  switch (tierId) {
    case 'sand':
      return { kind: 'single' };
    case 'quartz':
      return { kind: 'multi', targetCount: 2 };
    case 'ruby':
      return { kind: 'piercing', defPierceRatio: 0.35 };
    case 'sunstone':
      return { kind: 'aoe', aoeRadius: 42 };
    case 'citrine':
      return { kind: 'gatling' };
    case 'emerald':
      return { kind: 'emeraldMissile' };
    case 'sapphire':
      return { kind: 'multi', targetCount: 3 };
    case 'iolite':
      return { kind: 'poisonBolt' };
    case 'amethyst':
      return { kind: 'piercing', defPierceRatio: 0.45 };
    case 'diamond':
      return { kind: 'multi', targetCount: 4 };
    case 'nullstone':
      return { kind: 'aoe', aoeRadius: 58 };
    case 'fracteryl':
      return { kind: 'emeraldMissile' };
    case 'eigenstein':
      return { kind: 'piercing', defPierceRatio: 0.65 };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function deriveEffect(
  dominantTierId: TierId,
  secondaryTierId: TierId,
  dominantShare: number,
  secondaryShare: number,
): WeaponEffect {
  const base = getDominantCraftedEffect(dominantTierId);
  const secondaryOrder = TIER_BY_ID.get(secondaryTierId)?.unlockOrder ?? 0;
  switch (base.kind) {
    case 'multi':
      return {
        kind: 'multi',
        targetCount: clamp(base.targetCount + Math.floor(secondaryOrder / 4) + (dominantShare >= 0.75 ? 1 : 0), 2, 6),
      };
    case 'aoe':
      return {
        kind: 'aoe',
        aoeRadius: Math.round(base.aoeRadius + secondaryOrder * 2 + secondaryShare * 24),
      };
    case 'piercing':
      return {
        kind: 'piercing',
        defPierceRatio: clamp(base.defPierceRatio + secondaryShare * 0.18, 0.2, 0.9),
      };
    default:
      return base;
  }
}

export function deriveCraftedWeaponStats(
  ingredients: CraftedWeaponIngredient[],
  forgeCraftLevel: number,
): {
  composition: CraftedWeaponCompositionEntry[];
  dominantTierId: TierId;
  secondaryTierId: TierId;
  stats: WeaponStats;
} {
  const composition = computeCraftedWeaponComposition(ingredients);
  const dominantTierId = composition[0]?.tierId ?? 'sand';
  const secondaryTierId = composition[1]?.tierId ?? dominantTierId;
  const dominantShare = composition[0]?.share ?? 1;
  const secondaryShare = composition[1]?.share ?? 0;
  const dominantOrder = TIER_BY_ID.get(dominantTierId)?.unlockOrder ?? 0;
  const secondaryOrder = TIER_BY_ID.get(secondaryTierId)?.unlockOrder ?? dominantOrder;
  const ingredientCount = normalizeCraftedWeaponIngredients(ingredients).length;
  const craftBonus = Math.max(0, forgeCraftLevel - 1);

  const effect = deriveEffect(dominantTierId, secondaryTierId, dominantShare, secondaryShare);
  let damage = Math.round(
    12
      + dominantOrder * 7
      + secondaryOrder * 3
      + dominantShare * 24
      + secondaryShare * 10
      + ingredientCount * 3
      + craftBonus * 4,
  );
  let cooldownMs = Math.round(
    1500
      - dominantOrder * 55
      - secondaryOrder * 18
      - dominantShare * 260
      - secondaryShare * 90
      - craftBonus * 35,
  );
  let range = Math.round(
    110
      + dominantOrder * 20
      + secondaryOrder * 8
      + dominantShare * 70
      + secondaryShare * 30
      + craftBonus * 12,
  );
  let defBonus = Math.round(1 + secondaryOrder * 0.6 + dominantShare * 4 + ingredientCount + craftBonus);

  switch (effect.kind) {
    case 'gatling':
      damage = Math.max(6, Math.round(damage * 0.55));
      cooldownMs = Math.round(cooldownMs * 0.42);
      range = Math.round(range * 0.82);
      break;
    case 'multi':
      damage = Math.max(8, Math.round(damage * 0.78));
      cooldownMs = Math.round(cooldownMs * 0.9);
      break;
    case 'aoe':
      damage = Math.max(10, Math.round(damage * 0.88));
      cooldownMs = Math.round(cooldownMs * 1.12);
      range = Math.round(range * 0.92);
      break;
    case 'piercing':
      cooldownMs = Math.round(cooldownMs * 1.04);
      break;
    case 'emeraldMissile':
      damage = Math.max(8, Math.round(damage * 0.84));
      cooldownMs = Math.round(cooldownMs * 0.82);
      range = INFINITE_RANGE;
      break;
    case 'poisonBolt':
      damage = Math.max(7, Math.round(damage * 0.72));
      cooldownMs = Math.round(cooldownMs * 0.76);
      range = Math.round(range * 1.15);
      break;
    case 'single':
      break;
  }

  return {
    composition,
    dominantTierId,
    secondaryTierId,
    stats: {
      damage,
      cooldownMs: clamp(cooldownMs, 220, 2500),
      range: clamp(range, 70, INFINITE_RANGE),
      defBonus: Math.max(0, defBonus),
      effect,
    },
  };
}

function formatEffectLabel(effect: WeaponEffect): string {
  return EFFECT_LABELS[effect.kind] ?? effect.kind;
}

export function formatCraftedWeaponModifier(craftedWeapon: CraftedWeaponData): string {
  return craftedWeapon.composition
    .map(e => {
      const name = TIER_BY_ID.get(e.tierId)?.displayName ?? e.tierId;
      return `${name} ${Math.round(e.share * 100)}%`;
    })
    .join(' · ');
}

/** Return per-tier modifier description lines for display on the weapon card. */
export function getCraftedModifierLines(craftedWeapon: CraftedWeaponData): string[] {
  const lines: string[] = [];
  for (const entry of craftedWeapon.composition) {
    const pct = Math.round(entry.share * 100);
    if (pct <= 0) continue;
    const power = Math.round(entry.share * 1000);
    switch (entry.tierId) {
      case 'sand':
        lines.push(`Sand ${pct}%: +${power}% fire rate, ÷${(1 + entry.share).toFixed(1)} dmg/hit`);
        break;
      case 'quartz':
        lines.push(`Quartz ${pct}%: +${Math.round(entry.share * 3)} extra targets`);
        break;
      case 'ruby':
        lines.push(`Ruby ${pct}%: +${pct}% DEF pierce`);
        break;
      case 'citrine':
        lines.push(`Citrine ${pct}%: +${Math.round(entry.share * 40)}px AoE radius`);
        break;
      case 'emerald':
        lines.push(`Emerald ${pct}%: +${Math.round(entry.share * 120)}px homing range`);
        break;
      case 'sapphire':
        lines.push(`Sapphire ${pct}%: +${Math.min(pct, 60)}% crit chance`);
        break;
      case 'iolite':
        lines.push(`Iolite ${pct}%: +${Math.round(entry.share * 18)} poison dmg/tick`);
        break;
      case 'amethyst':
        lines.push(`Amethyst ${pct}%: companion ships (placeholder)`);
        break;
      case 'diamond':
        lines.push(`Diamond ${pct}%: ${pct}% armor ignored`);
        break;
      case 'nullstone':
        lines.push(`Nullstone ${pct}%: pull radius ${Math.round(entry.share * 80)}px (capped)`);
        break;
      case 'fracteryl':
        lines.push(`Fracteryl ${pct}%: ${Math.min(Math.round(entry.share * 10), 10)} recursive strikes`);
        break;
      case 'eigenstein':
        lines.push(`Eigenstein ${pct}%: (reserved — no final behavior)`);
        break;
      case 'sunstone':
        lines.push(`Sunstone ${pct}%: +${Math.round(entry.share * 30)}px mine radius`);
        break;
    }
  }
  return lines;
}

function getCraftedWeaponName(
  dominantTierId: TierId,
  secondaryTierId: TierId,
  effect: WeaponEffect,
): string {
  const dominantName = TIER_BY_ID.get(dominantTierId)?.displayName ?? dominantTierId;
  const secondaryName = TIER_BY_ID.get(secondaryTierId)?.displayName ?? secondaryTierId;
  const noun = EFFECT_NOUNS[effect.kind] ?? 'Armament';
  return `${dominantName} ${secondaryName} ${noun}`;
}

function getCraftedWeaponDescription(
  ingredients: CraftedWeaponIngredient[],
  dominantTierId: TierId,
  secondaryTierId: TierId,
  effect: WeaponEffect,
): string {
  const ingredientText = normalizeCraftedWeaponIngredients(ingredients)
    .map((ingredient) => {
      const name = TIER_BY_ID.get(ingredient.tierId)?.displayName ?? ingredient.tierId;
      return `${ingredient.refinedCount} ${name}`;
    })
    .join(', ');
  const dominantName = TIER_BY_ID.get(dominantTierId)?.displayName ?? dominantTierId;
  const secondaryName = TIER_BY_ID.get(secondaryTierId)?.displayName ?? secondaryTierId;
  return `${formatEffectLabel(effect)} forged from ${ingredientText}. Dominant ${dominantName} structure with ${secondaryName} support.`;
}

export function createCraftedWeaponDefinition(
  id: string,
  ingredients: CraftedWeaponIngredient[],
  forgeCraftLevel: number,
): CraftedWeaponData {
  const normalized = normalizeCraftedWeaponIngredients(ingredients);
  const { composition, dominantTierId, secondaryTierId, stats } = deriveCraftedWeaponStats(normalized, forgeCraftLevel);
  const name = getCraftedWeaponName(dominantTierId, secondaryTierId, stats.effect ?? { kind: 'single' });
  const description = getCraftedWeaponDescription(normalized, dominantTierId, secondaryTierId, stats.effect ?? { kind: 'single' });
  const definition: WeaponDefinition = {
    id,
    name,
    description,
    costTierId: dominantTierId,
    cost: 0,
    stats,
  };
  const craftedWeapon: CraftedWeaponData = {
    id,
    name,
    description,
    ingredients: normalized,
    composition,
    dominantTierId,
    secondaryTierId,
    forgeCraftLevel,
    definition,
  };
  craftedWeaponCache.set(id, definition);
  return craftedWeapon;
}

export function registerCraftedWeapons(craftedWeapons: CraftedWeaponData[]): void {
  for (const craftedWeapon of craftedWeapons) {
    craftedWeaponCache.set(craftedWeapon.id, craftedWeapon.definition);
  }
}

export function resolveWeaponDefinition(weaponId: string): WeaponDefinition | undefined {
  return WEAPON_BY_ID.get(weaponId) ?? craftedWeaponCache.get(weaponId);
}
