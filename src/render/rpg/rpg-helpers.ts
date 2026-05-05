/**
 * rpg-helpers.ts — Pure computation helpers for the RPG system.
 *
 * These are small, stateless functions used by both update logic (in
 * rpg-render.ts) and draw logic (in rpg-weapon-draw.ts / rpg-boss-draw.ts).
 * Extracting them here eliminates duplication and lets both sides import from
 * a single source of truth without depending on the full createRpgRender
 * closure.
 *
 * Sections:
 *   - Chain whip node helpers
 *   - Diamond sword helpers
 *   - Nullstone vortex helpers
 */

import {
  CHAIN_MIN_RADIUS, CHAIN_MAX_RADIUS, CHAIN_NODES,
  CHAIN_MIN_INERTIA, CHAIN_MAX_INERTIA,
  SWORD_SHARD_SIZE_BASE, SWORD_SHARD_COUNT, SWORD_SHARD_SHAPES,
} from './rpg-weapon-constants';

// ── Chain whip node helpers ────────────────────────────────────────────────────

/** Returns the visual radius of chain node i (0 = anchor near player, CHAIN_NODES-1 = tip). */
export function chainNodeRadius(i: number): number {
  return CHAIN_MIN_RADIUS + (CHAIN_MAX_RADIUS - CHAIN_MIN_RADIUS) * i / (CHAIN_NODES - 1);
}

/**
 * Returns 1/inertia for chain node i.
 * Higher inverse mass → more responsive to spring forces.
 * i=0 (anchor, closest to player) has lowest inertia → most responsive.
 * i=CHAIN_NODES-1 (tip) has highest inertia → least responsive.
 */
export function chainNodeInvMass(i: number): number {
  const inertia = CHAIN_MIN_INERTIA + (CHAIN_MAX_INERTIA - CHAIN_MIN_INERTIA) * i / (CHAIN_NODES - 1);
  return 1.0 / inertia;
}

// ── Diamond sword helpers ──────────────────────────────────────────────────────

/** Returns the sword blade length in pixels for the given weapon tier. */
export function getSwordLength(tier: number): number {
  return 30 + (tier - 1) * 8;
}

/** Returns an array of evenly-spaced shard distances from handle to tip. */
export function getShardDistances(swordLength: number): number[] {
  const handleDist = 5;
  const dists: number[] = [];
  for (let i = 0; i < SWORD_SHARD_COUNT; i++) {
    dists.push(handleDist + (swordLength - handleDist) * (i / (SWORD_SHARD_COUNT - 1)));
  }
  return dists;
}

/**
 * Normalises an angle difference to [−π, π].
 * Used to compute the shortest angular path between two blade angles.
 */
export function wrapAngleDiff(a: number): number {
  while (a >  Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Returns the draw shape and radius for prismatic shard at index i on the blade. */
export function getShardStyle(index: number): { shapeIdx: number; radius: number } {
  const radius = SWORD_SHARD_SIZE_BASE * (0.85 + 0.3 * (index / (SWORD_SHARD_COUNT - 1)));
  const shapeIdx = index % SWORD_SHARD_SHAPES.length;
  return { shapeIdx, radius };
}

// ── Nullstone vortex helpers ───────────────────────────────────────────────────

/** Returns the pull-radius (px) for a vortex of the given weapon tier. */
export function getVortexTierRadius(tier: number): number {
  return 40 + (tier - 1) * 10;
}

/** Returns the active duration (ms) for a vortex of the given weapon tier. */
export function getVortexTierDurationMs(tier: number): number {
  return 3000 + (tier - 1) * 200;
}

/** Returns the number of simultaneous vortexes for the given weapon tier. */
export function getVortexCount(tier: number): number {
  return tier >= 7 ? 3 : tier >= 4 ? 2 : 1;
}
