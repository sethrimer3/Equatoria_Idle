---
name: project-lens-status-effects
description: Tier 1 lens status effects implemented in RPG combat — what was built, key files, design decisions
metadata:
  type: project
---

Tier 1 lens status effects are now fully implemented (2026-06-04). Weapons with attached lenses apply real combat statuses on hit. Tier 2 and Tier 3 remain STUB.

**Why:** Requested feature pass to make lenses meaningful in combat.

**How to apply:** When touching the lens system or RPG combat damage path, check these files.

## New files
- `src/sim/rpg/enemy-status-effects.ts` — WeakMap-based status registry, tick function, damage/speed multipliers
- `src/data/rpg/lens-status-effects.ts` — lens LensEffect → LensStatusParams converters (T1 only)
- `src/render/rpg/enemy-status-render.ts` — canvas status label overlay (3-letter abbreviations above enemies)
- `src/sim/rpg/__tests__/enemy-status-effects.test.ts` — 31 tests covering all 11 acceptance criteria

## Key modified files
- `lens-types.ts` — `isApplied: boolean` (was `false`)
- `lens-definitions.ts` — T1 names no longer have "STUB" suffix; added `LENS_T1_DESCRIPTIONS`
- `lens-rolling.ts` — T1 effects get `isApplied: true` and a real description
- `save-deserialize.ts` — T1 effects restore with `isApplied: true` (was hardcoded `false`)
- `rpg-player-attack.ts` — looks up `attachedLens` from `rpgSimState.craftedWeapons`; passes to attack handlers
- `rpg-player-attack-single.ts` — applies status multipliers pre-hit; applies T1 statuses post-hit
- `rpg-player-attack-multi.ts` / `rpg-player-attack-aoe.ts` — same pattern, multi-target variants
- `rpg-render-update.ts` — calls `tickLensStatuses(arrays, deltaMs, moteX, moteY)` each frame
- `rpg-render-draw.ts` — calls `renderEnemyStatusLabels(canvas2d, ctx)` after player mote draw
- `rpg-weapons-tab.ts` — T1 shows "✓ active" in green; T2/T3 show "STUB"
- `lens-rolling.test.ts` — updated assertions for new isApplied/STUB behavior

## Design decisions
- Status registry is a `WeakMap<object, EnemyStatusState>` — no changes to enemy type interfaces required
- Movement slow is applied POST-update (velocity scaling after enemy physics) — 1-frame lag, works well for patrol enemies
- DoT damage applied directly to `enemy.hp` (bypasses DPS meter, acceptable)
- `TickableEnemy` has optional `vx?/vy?` because Polyomino enemies don't have velocity fields
- Rift-Scarred stacks tracked per source key (`lens.id`); reset via `clearEnemyStatuses()` on enemy death
- Echo-Marked echoes stored in status record, maximum 3 pending echoes per enemy

## Status key → mechanic map
- abraded/refracted/radiant/cracked → damage vulnerability (+X% incoming weapon damage)
- burning/poisoned → DoT (tick every 1000ms)
- fractalWound → decaying DoT (4 ticks × 70% decay, every 600ms)
- chilled/timeWarped/gravitized → movement speed reduction
- gravitized also → small velocity impulse toward player each tick
- echoMarked → delayed repeat of X% hit damage after 600ms (non-recursive)
- riftScarred → per-source stacking damage bonus (max 20 stacks)
