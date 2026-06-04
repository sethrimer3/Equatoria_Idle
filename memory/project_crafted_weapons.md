---
name: project-crafted-weapons-and-weaves
description: Status of crafted weapons and weaves in the Forge — what's done, what's deferred, and integration notes
metadata:
  type: project
---

## Crafted Weapons
Fully functional. PR #278 scaffold + Build 201 complete.

- `src/data/rpg/crafted-weapon-types.ts` — types
- `src/data/rpg/crafted-weapon-helpers.ts` — composition/stats logic
- `src/data/rpg/crafting-allocation.ts` — ingredient allocation helpers
- `src/sim/game-state.ts` → `craftWeapon()` — deducts crystals, creates weapon
- Save version 30 introduced: `craftedWeapons[]`, `refinedCrystalsByTierId`

## Weaves (implemented)
Passive equippable items that boost looms, forge, and later systems.

**Files added:**
- `src/data/rpg/weave-types.ts` — WeaveAffix, CraftedWeaveData, WeaveRarity, WeaveAffixId types
- `src/data/rpg/weave-definitions.ts` — per-tier affix families (12 tiers; sunstone excluded from affixes)
- `src/data/rpg/weave-rolling.ts` — triangularRandom, getWeaveRarity, rollWeaveAffix, createCraftedWeave
- `src/data/rpg/weave-effects.ts` — aggregateEquippedWeaveEffects (with caps)
- `src/ui/panels/weave-slots.ts` — 6-slot row, locked/empty/occupied states, drag reorder
- `src/ui/panels/weave-inventory.ts` — inventory list, drag to slots
- `src/data/rpg/__tests__/weave-rolling.test.ts` — 45 tests, all passing

**Files modified:**
- `src/sim/rpg/rpg-state.ts` — added `craftedWeaves[]`, `equippedWeaveSlots[6]`
- `src/sim/forge/forge-state.ts` — added `getUnlockedWeaveSlotCount(forgeLevel)`, `TOTAL_WEAVE_SLOTS`
- `src/settings/save-types.ts` — v31+ fields: `craftedWeaves`, `equippedWeaveSlots`
- `src/settings/save-serialize.ts` / `save-deserialize.ts` — serialize/restore weaves (migration-safe)
- `src/input/input-handler.ts` — craft_weave, equip_weave_to_slot, unequip_weave, move_weave_slot
- `src/app/app-actions.ts` — handlers for all weave actions
- `src/sim/game-state.ts` — craftWeave(), computeEquippedWeaveLoomBonus(), simTick loom integration
- `src/sim/index.ts` — exports craftWeave
- `src/ui/panels/rpg-weapon-crafting-page.ts` — WEAPON/WEAVE/LENS mode selector, weave crafting UI
- `src/ui/panels/loom-panel.ts` — passes forgeLevel to craftingPage.update()
- `src/styles/components.css` — weave slot/card/popup/mode-selector styles

**Applied bonuses (actually integrated into gameplay):**
- `citrine_all_loom` → loom output multiplier via simTick

**Stored-only bonuses (displayed but not yet applied):**
- All other affix IDs — displayed with "(stored)" label in the UI
- TODO integration points are where their respective systems are built

**Slot unlock:** `getUnlockedWeaveSlotCount(forgeLevel)` = min(6, forgeLevel + 1)
- forge 1→2 unlocked, forge 5→6 unlocked

**Why:** Design spec from task description; passive bonus system for Looms and Forge.
**How to apply:** When adding new gameplay systems, check weave-effects.ts for pending bonuses.
