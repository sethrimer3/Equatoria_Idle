/**
 * rpg-skill-tree-definitions.ts — Central skill tree structure, validation,
 * and purchase helpers.
 *
 * The UI (rpg-skill-tree-tab.ts) and the action handler (app-actions.ts)
 * both consume this module so the two always agree on what can be bought.
 */

import { RPG_UPGRADE_BY_ID } from './rpg-upgrade-definitions';
import type { RpgSimState } from '../../sim/rpg/rpg-state';
import type { ResourceState } from '../../sim/resources';
import { getMotes } from '../../sim/resources';

// ─── Skill tree node definition ───────────────────────────────────────────

export interface SkillTreeNodeDef {
  upgradeId: string | null;
  x: number;
  y: number;
  icon: string;
  /** null = requires root (awakening); string = upgradeId of required parent */
  prerequisiteId: string | null;
  branch: 'movement' | 'defense' | 'weapons' | 'resources' | 'root' | 'orbits' | 'elemental';
  /** root = gold large medallion; unlock = one-time medallion; repeatable = smaller circle */
  nodeType: 'root' | 'unlock' | 'repeatable';
}

// ─── Visible skill tree nodes (world-space coordinates, root at 0,0) ────────

export const VISIBLE_SKILL_TREE_NODES: SkillTreeNodeDef[] = [
  // ── Root / Core ───────────────────────────────────────────────────────
  { upgradeId: 'awakening',       x:    0, y:    0, icon: '✦', prerequisiteId: null,                  branch: 'root',      nodeType: 'root'       },
  { upgradeId: 'rpg_training',    x:    0, y: -115, icon: '⚔', prerequisiteId: null,                  branch: 'root',      nodeType: 'repeatable' },
  { upgradeId: 'battle_focus',    x: -140, y: -215, icon: '◎', prerequisiteId: 'rpg_training',        branch: 'root',      nodeType: 'repeatable' },
  { upgradeId: 'codex_initiate',  x:  140, y: -215, icon: '≡', prerequisiteId: 'rpg_training',        branch: 'root',      nodeType: 'repeatable' },
  // ── Movement branch ───────────────────────────────────────────────────
  { upgradeId: 'speed',           x: -260, y:  -65, icon: '▲', prerequisiteId: null,                  branch: 'movement',  nodeType: 'repeatable' },
  { upgradeId: 'acceleration',    x: -400, y: -155, icon: '▶', prerequisiteId: 'speed',               branch: 'movement',  nodeType: 'repeatable' },
  { upgradeId: 'dash',            x: -510, y: -255, icon: '⚡', prerequisiteId: 'acceleration',        branch: 'movement',  nodeType: 'unlock'     },
  { upgradeId: 'dash_cooldown',   x: -590, y: -375, icon: '○', prerequisiteId: 'dash',                branch: 'movement',  nodeType: 'repeatable' },
  { upgradeId: 'afterimage',      x: -430, y: -380, icon: '≈', prerequisiteId: 'dash',                branch: 'movement',  nodeType: 'repeatable' },
  // ── Defense branch ────────────────────────────────────────────────────
  { upgradeId: 'block_chance',    x:  255, y:  -90, icon: '■', prerequisiteId: null,                  branch: 'defense',   nodeType: 'repeatable' },
  { upgradeId: 'block_strength',  x:  400, y: -195, icon: '⊞', prerequisiteId: 'block_chance',        branch: 'defense',   nodeType: 'repeatable' },
  { upgradeId: 'projectile_deflection', x: 255, y: -265, icon: '⊘', prerequisiteId: 'block_chance',  branch: 'defense',   nodeType: 'repeatable' },
  { upgradeId: 'status_resistance', x: 400, y: -380, icon: '◈', prerequisiteId: 'block_strength',     branch: 'defense',   nodeType: 'repeatable' },
  { upgradeId: 'second_wind',     x:  140, y: -350, icon: '♥', prerequisiteId: 'block_chance',        branch: 'defense',   nodeType: 'unlock'     },
  // ── Weapons branch ────────────────────────────────────────────────────
  { upgradeId: 'extra_weapon_slot', x: 255, y:  90, icon: '⊕', prerequisiteId: null,                  branch: 'weapons',   nodeType: 'repeatable' },
  { upgradeId: 'weapon_mastery',  x:  400, y:  190, icon: '◆', prerequisiteId: 'extra_weapon_slot',   branch: 'weapons',   nodeType: 'repeatable' },
  { upgradeId: 'dominance_amp',   x:  530, y:  290, icon: '★', prerequisiteId: 'weapon_mastery',      branch: 'weapons',   nodeType: 'repeatable' },
  { upgradeId: 'balanced_alloy',  x:  375, y:  315, icon: '⊙', prerequisiteId: 'weapon_mastery',      branch: 'weapons',   nodeType: 'repeatable' },
  { upgradeId: 'quick_swap',      x:  175, y:  215, icon: '↺', prerequisiteId: 'extra_weapon_slot',   branch: 'weapons',   nodeType: 'unlock'     },
  // ── Orbiting branch ───────────────────────────────────────────────────
  { upgradeId: 'orbit_projectile', x:  90, y:  120, icon: '○', prerequisiteId: null,                  branch: 'orbits',    nodeType: 'unlock'     },
  { upgradeId: 'orbit_count',     x:  -55, y:  220, icon: '⊚', prerequisiteId: 'orbit_projectile',    branch: 'orbits',    nodeType: 'repeatable' },
  { upgradeId: 'orbit_detonation', x: 195, y:  225, icon: '✸', prerequisiteId: 'orbit_projectile',    branch: 'orbits',    nodeType: 'unlock'     },
  { upgradeId: 'piercing_orbit',  x: -155, y:  325, icon: '◈', prerequisiteId: 'orbit_count',         branch: 'orbits',    nodeType: 'repeatable' },
  { upgradeId: 'orbital_radius',  x:   35, y:  355, icon: '⊛', prerequisiteId: 'orbit_count',         branch: 'orbits',    nodeType: 'repeatable' },
  { upgradeId: 'comet_return',    x:  185, y:  335, icon: '↩', prerequisiteId: 'orbit_detonation',    branch: 'orbits',    nodeType: 'unlock'     },
  // ── Elemental branch ──────────────────────────────────────────────────
  { upgradeId: 'elemental_attunement', x: -40, y: 450, icon: '◇', prerequisiteId: null,               branch: 'elemental', nodeType: 'repeatable' },
  { upgradeId: 'sand_agility',    x: -545, y:  360, icon: '▲', prerequisiteId: 'elemental_attunement', branch: 'elemental', nodeType: 'repeatable' },
  { upgradeId: 'quartz_multiplicity', x: -545, y: 475, icon: '◇', prerequisiteId: 'sand_agility',     branch: 'elemental', nodeType: 'repeatable' },
  { upgradeId: 'ruby_penetration', x: -395, y:  495, icon: '▶', prerequisiteId: 'elemental_attunement', branch: 'elemental', nodeType: 'repeatable' },
  { upgradeId: 'citrine_bloom',   x: -230, y:  510, icon: '⊛', prerequisiteId: 'elemental_attunement', branch: 'elemental', nodeType: 'repeatable' },
  { upgradeId: 'emerald_seeking', x:   65, y:  510, icon: '◉', prerequisiteId: 'elemental_attunement', branch: 'elemental', nodeType: 'repeatable' },
  { upgradeId: 'sapphire_precision', x: 250, y:  495, icon: '✚', prerequisiteId: 'elemental_attunement', branch: 'elemental', nodeType: 'repeatable' },
  { upgradeId: 'amethyst_echo',   x:  450, y:  430, icon: '≈', prerequisiteId: 'elemental_attunement', branch: 'elemental', nodeType: 'unlock'     },
  { upgradeId: 'diamond_severance', x: 570, y:  430, icon: '✦', prerequisiteId: 'amethyst_echo',       branch: 'elemental', nodeType: 'unlock'     },
  // ── Resource branch ───────────────────────────────────────────────────
  { upgradeId: 'mote_magnetism',  x: -255, y:  120, icon: '⊛', prerequisiteId: null,                  branch: 'resources', nodeType: 'repeatable' },
  { upgradeId: 'battle_salvage',  x: -385, y:  225, icon: '◉', prerequisiteId: 'mote_magnetism',      branch: 'resources', nodeType: 'repeatable' },
  { upgradeId: 'boss_spoils',     x: -505, y:  130, icon: '★', prerequisiteId: 'mote_magnetism',      branch: 'resources', nodeType: 'unlock'     },
  { upgradeId: 'treasure_sense',  x: -445, y:  345, icon: '◆', prerequisiteId: 'battle_salvage',      branch: 'resources', nodeType: 'repeatable' },
];

// Fast lookups
export const VISIBLE_SKILL_TREE_NODE_IDS = new Set(
  VISIBLE_SKILL_TREE_NODES
    .map(n => n.upgradeId)
    .filter((id): id is string => id !== null),
);

export const VISIBLE_SKILL_TREE_NODE_BY_ID = new Map<string, SkillTreeNodeDef>(
  VISIBLE_SKILL_TREE_NODES
    .filter(n => n.upgradeId !== null)
    .map(n => [n.upgradeId as string, n]),
);

// ─── Budget validation ─────────────────────────────────────────────────────

export const EXPECTED_SKILL_TREE_TOTAL_POINTS = 200;

/** Computed total of (maxLevel × skillPointCost) across all visible nodes. */
export const SKILL_TREE_TOTAL_POINTS: number = (() => {
  let total = 0;
  for (const node of VISIBLE_SKILL_TREE_NODES) {
    if (!node.upgradeId) continue;
    const def = RPG_UPGRADE_BY_ID.get(node.upgradeId);
    if (def) total += def.maxLevel * def.skillPointCost;
  }
  return total;
})();

/**
 * Validates that the visible skill tree budget equals exactly 200.
 * In dev / non-production environments this should be called at startup.
 */
export function validateSkillTreeBudget(): void {
  if (SKILL_TREE_TOTAL_POINTS !== EXPECTED_SKILL_TREE_TOTAL_POINTS) {
    console.error(
      `[SkillTree] Budget mismatch: computed ${SKILL_TREE_TOTAL_POINTS} SP ` +
      `but expected ${EXPECTED_SKILL_TREE_TOTAL_POINTS}. ` +
      `Adjust node maxLevels / skillPointCosts to restore the 200-point budget.`,
    );
  }
}

// ─── Spent-points helper ───────────────────────────────────────────────────

/**
 * Returns the total skill points spent on visible tree nodes only.
 * Hidden legacy upgrades (evasion, xp_gain, forge_craft_level) are ignored.
 */
export function getVisibleSkillTreeSpentPoints(rpgState: RpgSimState): number {
  let spent = 0;
  for (const [upgradeId, level] of rpgState.rpgUpgradeLevels) {
    if (!VISIBLE_SKILL_TREE_NODE_IDS.has(upgradeId)) continue;
    const def = RPG_UPGRADE_BY_ID.get(upgradeId);
    if (def) spent += level * def.skillPointCost;
  }
  return spent;
}

// ─── Purchase validation ───────────────────────────────────────────────────

export type PurchaseBlockReason =
  | 'max_level'
  | 'missing_prerequisite'
  | 'not_enough_skill_points'
  | 'not_enough_resource'
  | 'unknown_upgrade'
  | 'not_in_skill_tree';

export interface PurchaseCheckResult {
  ok: boolean;
  reason?: PurchaseBlockReason;
}

/**
 * Central purchase validation for RPG skill tree nodes.
 * Used by both the detail card and the `purchase_rpg_upgrade` action handler.
 */
export function canPurchaseRpgSkill(
  rpgState: RpgSimState,
  resources: ResourceState,
  upgradeId: string,
  isDevMode: boolean,
): PurchaseCheckResult {
  if (isDevMode) return { ok: true };

  const upgradeDef = RPG_UPGRADE_BY_ID.get(upgradeId);
  if (!upgradeDef) return { ok: false, reason: 'unknown_upgrade' };

  if (!VISIBLE_SKILL_TREE_NODE_IDS.has(upgradeId)) {
    return { ok: false, reason: 'not_in_skill_tree' };
  }

  const currentRank = rpgState.rpgUpgradeLevels.get(upgradeId) ?? 0;
  if (currentRank >= upgradeDef.maxLevel) return { ok: false, reason: 'max_level' };

  // Prerequisite check
  const nodeDef = VISIBLE_SKILL_TREE_NODE_BY_ID.get(upgradeId);
  if (nodeDef) {
    const needsAwakening = nodeDef.prerequisiteId === null && upgradeId !== 'awakening';
    if (needsAwakening) {
      const awakeningRank = rpgState.rpgUpgradeLevels.get('awakening') ?? 0;
      if (awakeningRank < 1) return { ok: false, reason: 'missing_prerequisite' };
    } else if (nodeDef.prerequisiteId !== null) {
      const prereqRank = rpgState.rpgUpgradeLevels.get(nodeDef.prerequisiteId) ?? 0;
      if (prereqRank < 1) return { ok: false, reason: 'missing_prerequisite' };
    }
  }

  if (rpgState.unspentSkillPoints < upgradeDef.skillPointCost) {
    return { ok: false, reason: 'not_enough_skill_points' };
  }

  if (upgradeDef.costPerLevel > 0) {
    const balance = getMotes(resources, upgradeDef.costTierId);
    if (balance < upgradeDef.costPerLevel) return { ok: false, reason: 'not_enough_resource' };
  }

  return { ok: true };
}
