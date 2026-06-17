/**
 * status-combo-definitions.ts — Central data for all curated status combos.
 *
 * Five combos, each with a trigger condition, cooldown, and boss/elite scaling.
 * Import from here to display in glossary or to drive the combo engine.
 */

import type { EnemyStatusKey } from '../../sim/rpg/enemy-status-effects';

export interface StatusComboDefinition {
  id: string;
  displayName: string;
  /** Short all-caps label shown as floating feedback text. */
  feedbackLabel: string;
  /** Hex color for feedback text and damage numbers. */
  feedbackColor: string;
  /** One-sentence player-facing description. */
  description: string;
  /** All of these statuses must be present on the enemy to trigger. */
  requiredStatuses: readonly EnemyStatusKey[];
  /** Per-enemy cooldown. Prevents rapid-fire abuse. */
  cooldownMs: number;
  /** Damage multiplier applied when target is a boss. 0 = skip entirely. */
  bossMultiplier: number;
  /** Damage multiplier applied when target is an elite. */
  eliteMultiplier: number;
  /** Statuses removed from the enemy when the combo fires. */
  consumeStatuses: readonly EnemyStatusKey[];
  /** Rift Detonation only: minimum total rift-scarred stacks to trigger. */
  riftStackThreshold?: number;
  /** Optional note shown in glossary for boss/elite behaviour. */
  bossNote?: string;
}

export const STATUS_COMBO_DEFINITIONS: readonly StatusComboDefinition[] = [
  {
    id: 'steamBurst',
    displayName: 'Steam Burst',
    feedbackLabel: 'STEAM',
    feedbackColor: '#b8eeff',
    description: 'Burning + Chilled — steam explosion. Consumes the Chill.',
    requiredStatuses: ['burning', 'chilled'],
    cooldownMs: 3000,
    bossMultiplier: 0.30,
    eliteMultiplier: 0.60,
    consumeStatuses: ['chilled'],
  },
  {
    id: 'shatter',
    displayName: 'Shatter',
    feedbackLabel: 'SHATTER',
    feedbackColor: '#aaeeff',
    description: 'Hit a Frozen enemy for a bonus burst of damage. Shatters the freeze.',
    requiredStatuses: ['frozen'],
    cooldownMs: 2000,
    bossMultiplier: 0.40,
    eliteMultiplier: 0.70,
    consumeStatuses: ['frozen'],
    bossNote: 'Reduced on bosses.',
  },
  {
    id: 'toxicRupture',
    displayName: 'Toxic Rupture',
    feedbackLabel: 'RUPTURE',
    feedbackColor: '#66dd44',
    description: 'Poisoned + Cracked — armor crack lets toxin burst for bonus damage.',
    requiredStatuses: ['poisoned', 'cracked'],
    cooldownMs: 2500,
    bossMultiplier: 0.35,
    eliteMultiplier: 0.65,
    consumeStatuses: [],
    bossNote: 'Reduced on bosses.',
  },
  {
    id: 'gravityCollapse',
    displayName: 'Gravity Collapse',
    feedbackLabel: 'COLLAPSE',
    feedbackColor: '#8855cc',
    description: 'Hitting a Gravitized enemy causes a small AoE implosion.',
    requiredStatuses: ['gravitized'],
    cooldownMs: 4000,
    bossMultiplier: 0.00,
    eliteMultiplier: 0.40,
    consumeStatuses: [],
    bossNote: 'Does not affect bosses.',
  },
  {
    id: 'riftDetonation',
    displayName: 'Rift Detonation',
    feedbackLabel: 'RIFT',
    feedbackColor: '#44ffee',
    description: 'Rift-Scarred stacks detonate when 8 or more accumulate.',
    requiredStatuses: ['riftScarred'],
    riftStackThreshold: 8,
    cooldownMs: 5000,
    bossMultiplier: 0.25,
    eliteMultiplier: 0.50,
    consumeStatuses: [],
    bossNote: 'Reduced on bosses.',
  },
] as const;

export function getComboById(id: string): StatusComboDefinition | undefined {
  return STATUS_COMBO_DEFINITIONS.find(c => c.id === id);
}
