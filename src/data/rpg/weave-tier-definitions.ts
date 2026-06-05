/**
 * weave-tier-definitions.ts — Tier-1/2/3 STUB effect registry for the Weave crafting system.
 *
 * All effects are STUB placeholders. No real gameplay behavior is implemented yet.
 * Weave tier effects are intended to be passive/economy/utility/defensive modifiers —
 * distinct in purpose from lens effects (which are combat/offensive).
 *
 * Sunstone is intentionally omitted — it contributes to power scaling only.
 */

import type { TierId } from '../tiers';
import type { WeaveTierEffectTier } from './weave-types';

/** Display names per (tierId, effectTier). All names include "(STUB)" to signal placeholder status. */
export const WEAVE_TIER_EFFECT_NAMES: Partial<Record<TierId, Record<WeaveTierEffectTier, string>>> = {
  sand: {
    1: 'Minor Haste (STUB)',
    2: 'Dust Veil (STUB)',
    3: 'Sandstorm Shroud (STUB)',
  },
  quartz: {
    1: 'Crystal Yield (STUB)',
    2: 'Prismatic Guard (STUB)',
    3: 'Resonant Lattice (STUB)',
  },
  ruby: {
    1: 'Ember Surge (STUB)',
    2: 'Ignition Shell (STUB)',
    3: 'Molten Core (STUB)',
  },
  citrine: {
    1: 'Radiant Aura (STUB)',
    2: 'Solar Aegis (STUB)',
    3: 'Gilded Bastion (STUB)',
  },
  emerald: {
    1: 'Overgrowth (STUB)',
    2: 'Thorn Weave (STUB)',
    3: 'Verdant Cascade (STUB)',
  },
  sapphire: {
    1: 'Tempered Mind (STUB)',
    2: 'Ice Ward (STUB)',
    3: 'Glacial Bulwark (STUB)',
  },
  iolite: {
    1: 'Stored Momentum (STUB)',
    2: 'Temporal Buffer (STUB)',
    3: 'Stasis Weave (STUB)',
  },
  amethyst: {
    1: 'Phantom Thread (STUB)',
    2: 'Echo Barrier (STUB)',
    3: 'Mirror Shroud (STUB)',
  },
  diamond: {
    1: 'Adamantine Weave (STUB)',
    2: 'Faceted Guard (STUB)',
    3: 'Diamond Bastion (STUB)',
  },
  nullstone: {
    1: 'Null Barrier (STUB)',
    2: 'Gravity Shroud (STUB)',
    3: 'Event Dampener (STUB)',
  },
  fracteryl: {
    1: 'Fractal Loop (STUB)',
    2: 'Recursive Shield (STUB)',
    3: 'Infinite Weave (STUB)',
  },
  eigenstein: {
    1: 'Rift Ward (STUB)',
    2: 'Dimensional Veil (STUB)',
    3: 'Reality Anchor (STUB)',
  },
};

/** Placeholder descriptions for Tier 1 weave tier effects. */
export const WEAVE_T1_DESCRIPTIONS: Partial<Record<TierId, string>> = {
  sand:       'STUB: Passive haste bonus — intended as an economy production rate modifier.',
  quartz:     'STUB: Passive crystal yield bonus — intended to boost refined crystal output.',
  ruby:       'STUB: Passive crit surge bonus — intended as a loom critical chance/output modifier.',
  citrine:    'STUB: Passive radiant aura — intended as a broad-spectrum production multiplier.',
  emerald:    'STUB: Passive overgrowth bonus — intended to chain adjacent loom production.',
  sapphire:   'STUB: Passive precision boost — intended to raise crafting roll floors.',
  iolite:     'STUB: Passive momentum storage — intended to buffer and persist offline progress.',
  amethyst:   'STUB: Passive phantom thread — intended to duplicate occasional loom ticks.',
  diamond:    'STUB: Passive adamantine weave — intended as a defensive armor bonus.',
  nullstone:  'STUB: Passive null barrier — intended to slow or suppress nearby enemy actions.',
  fracteryl:  'STUB: Passive fractal loop — intended to recursively echo a portion of production.',
  eigenstein: 'STUB: Passive rift ward — intended to provide dimensional damage resistance.',
};

/** Placeholder descriptions for Tier 2 weave tier effects. */
export const WEAVE_T2_DESCRIPTIONS: Partial<Record<TierId, string>> = {
  sand:       'STUB: Dust Veil passive — intended to reduce incoming damage by a small percentage.',
  quartz:     'STUB: Prismatic Guard passive — intended to partially filter loom waste.',
  ruby:       'STUB: Ignition Shell passive — intended to grant bonus forge output on crit.',
  citrine:    'STUB: Solar Aegis passive — intended to amplify all production when above a threshold.',
  emerald:    'STUB: Thorn Weave passive — intended to reflect a fraction of loom feed cost.',
  sapphire:   'STUB: Ice Ward passive — intended to periodically impede enemy advance.',
  iolite:     'STUB: Temporal Buffer passive — intended to extend offline progress window.',
  amethyst:   'STUB: Echo Barrier passive — intended to duplicate forge outputs occasionally.',
  diamond:    'STUB: Faceted Guard passive — intended to increase armor rating further.',
  nullstone:  'STUB: Gravity Shroud passive — intended to pull motes inward faster.',
  fracteryl:  'STUB: Recursive Shield passive — intended to absorb a portion of damage via fractal recursion.',
  eigenstein: 'STUB: Dimensional Veil passive — intended to reduce rift damage taken.',
};

/** Placeholder descriptions for Tier 3 weave tier effects. */
export const WEAVE_T3_DESCRIPTIONS: Partial<Record<TierId, string>> = {
  sand:       'STUB: Sandstorm Shroud — intended as an area-of-effect production aura buffing all looms in range.',
  quartz:     'STUB: Resonant Lattice — intended to create a feedback loop amplifying crystal yield over time.',
  ruby:       'STUB: Molten Core — intended to periodically trigger a forge surge doubling output briefly.',
  citrine:    'STUB: Gilded Bastion — intended to grant a temporary production immunity shield.',
  emerald:    'STUB: Verdant Cascade — intended to create a propagating growth burst across adjacent looms.',
  sapphire:   'STUB: Glacial Bulwark — intended to create a sustained damage-absorbing ice barrier.',
  iolite:     'STUB: Stasis Weave — intended to freeze production decay for an extended offline period.',
  amethyst:   'STUB: Mirror Shroud — intended to mirror all loom production to a phantom second output.',
  diamond:    'STUB: Diamond Bastion — intended to grant temporary invulnerability when health drops low.',
  nullstone:  'STUB: Event Dampener — intended to suppress all enemy abilities in a radius periodically.',
  fracteryl:  'STUB: Infinite Weave — intended to recursively repeat the strongest active weave effect once.',
  eigenstein: 'STUB: Reality Anchor — intended to pin dimensional rift damage to a fixed cap for a duration.',
};
