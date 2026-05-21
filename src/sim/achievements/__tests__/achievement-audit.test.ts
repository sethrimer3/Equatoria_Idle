/**
 * achievement-audit.test.ts — Consistency checks for the achievement system.
 *
 * These tests do NOT require game state — they operate purely on the static
 * definition arrays and type maps. They catch:
 *   - Duplicate achievement IDs
 *   - Unknown subcategoryId references
 *   - Unknown tierId references in conditions
 *   - Duplicate displayNames (logged as a warning, not a failure)
 *   - all_bosses_at_speed achievability sanity (TOTAL_BOSS_COUNT must be > 0)
 */

import { describe, it, expect } from 'vitest';
import { ACHIEVEMENT_DEFINITIONS } from '../../../data/achievements';
import { ACHIEVEMENT_SUBCATEGORY_BY_ID } from '../../../data/achievements/achievement-subcategories';
import { TIER_BY_ID } from '../../../data/tiers';
import { TOTAL_BOSS_COUNT } from '../../rpg/rpg-state';

describe('Achievement system consistency', () => {
  it('has no duplicate achievement IDs', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const ach of ACHIEVEMENT_DEFINITIONS) {
      if (seen.has(ach.id)) {
        duplicates.push(ach.id);
      }
      seen.add(ach.id);
    }
    expect(duplicates).toEqual([]);
  });

  it('every subcategoryId references a known subcategory', () => {
    const unknown: string[] = [];
    for (const ach of ACHIEVEMENT_DEFINITIONS) {
      if (ach.subcategoryId && !ACHIEVEMENT_SUBCATEGORY_BY_ID.has(ach.subcategoryId)) {
        unknown.push(`${ach.id} → subcategoryId '${ach.subcategoryId}'`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('every tierId in conditions references a known tier', () => {
    const unknown: string[] = [];
    for (const ach of ACHIEVEMENT_DEFINITIONS) {
      const cond = ach.condition;
      let tierId: string | undefined;
      if ('tierId' in cond) tierId = cond.tierId;
      if (tierId && !TIER_BY_ID.has(tierId as never)) {
        unknown.push(`${ach.id} → tierId '${tierId}'`);
      }
      if ('tierIds' in cond) {
        for (const t of cond.tierIds) {
          if (!TIER_BY_ID.has(t as never)) {
            unknown.push(`${ach.id} → tierIds entry '${t}'`);
          }
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it('TOTAL_BOSS_COUNT is positive (all_bosses_at_speed can be achieved)', () => {
    expect(TOTAL_BOSS_COUNT).toBeGreaterThan(0);
  });

  it('reports duplicate displayNames (informational — not a hard failure)', () => {
    const nameMap = new Map<string, string[]>();
    for (const ach of ACHIEVEMENT_DEFINITIONS) {
      const existing = nameMap.get(ach.displayName);
      if (existing) {
        existing.push(ach.id);
      } else {
        nameMap.set(ach.displayName, [ach.id]);
      }
    }
    const duplicates: string[] = [];
    for (const [name, ids] of nameMap) {
      if (ids.length > 1) {
        duplicates.push(`"${name}" used by: ${ids.join(', ')}`);
      }
    }
    // Log but do not fail — some duplicates may be intentional (e.g. RPG numbered achievements).
    if (duplicates.length > 0) {
      console.warn('Duplicate displayNames found (review if intentional):\n', duplicates.join('\n'));
    }
    // Only fail if there are truly identical non-numbered names (exclude RPG #N style)
    const nonNumbered = duplicates.filter(d => !d.includes('"RPG #'));
    expect(nonNumbered).toEqual([]);
  });
});
