# Next Steps — Equatoria Idle

Current build: **#204**

---

## Build #204 — Crafted weapons: four modifier combat hooks wired

### Completed in this build

* **Build number updated**: `src/buildInfo.ts` now reports `BUILD_NUMBER = 204`.

* **Iolite poison bonus**: Crafted weapon `poisonBonusDmg` now feeds into poison bolts. The bonus is computed at bolt spawn, stored on the bolt, then added to poison tick damage when the debuff is attached.

* **Emerald acquisition range**: Crafted weapon `emeraldAcquisitionRangePx` is now threaded into emerald missiles as `bonusDetectPx`, giving each missile its own increased homing detection radius.

* **Nullstone pull**: Crafted weapon `nullstonePullRadius` now triggers after a single-target crafted weapon hit. The first implementation applies a capped instant pull/nudge toward the impact point for enemies within radius.

* **Fracteryl recursive strikes**: Crafted weapon `fracterylStrikes` now triggers follow-up single-target strikes after the initial hit, with 50% damage decay per repeat and the existing hard cap of 10 repeats.

### Real remaining next steps after Build #204

1. **Amethyst extra ships**
   - Still placeholder.
   - Needs a new crafted/support weapon behavior where Amethyst content adds extra ships that attack furthest targets using the player's crafted weapon identity or a safe approximation of it.

2. **Eigenstein behavior**
   - Still intentionally undefined.
   - Do not invent final behavior casually. It needs a deliberate design pass because it is meant to feel like an endgame/rule-altering mote.

3. **Broaden crafted modifier coverage beyond the current first-pass paths**
   - Nullstone pull and Fracteryl recursive strikes are currently wired through the single-target hit path.
   - Decide whether they should also trigger from multi-target, AoE, laser, gatling/sand projectile, poison bolt impact, emerald missile, sunstone mines, vortex, chain whip, and sword combo.
   - If they should, centralize crafted post-hit handling so every attack family can call the same safe hook.

4. **Improve Nullstone visual/feel**
   - Current implementation is an instant positional nudge, not a visible black-hole field.
   - Add a brief visual vortex/black-hole effect at the hit point.
   - Consider a short-duration pull force over several frames rather than a one-frame snap.
   - Keep strict caps on radius, duration, and simultaneous active pulls.

5. **Improve Fracteryl feedback and safety**
   - Current recursive strikes use follow-up damage but need clearer visuals/audio so the player can see recursion happening.
   - Add tests or runtime guards ensuring recursive strikes cannot recursively trigger additional recursive chains unless explicitly intended.
   - Decide whether recursive strikes should retarget nearest enemies, continue against the original target, or branch visually.

6. **Combat tests for Build #204 hooks**
   - Add tests or lightweight simulation checks for:
     - Iolite poison bonus actually increases poison tick damage.
     - Emerald missiles use `bonusDetectPx` in acquisition checks.
     - Nullstone pull moves only enemies inside radius and never moves invalid/dead targets.
     - Fracteryl follow-ups cap at 10 and decay damage correctly.

7. **Balance/playtesting**
   - Playtest modifier coefficients, forge upgrade costs, crafted weapon DPS, crit cap, armor ignore cap, poison bonus, pull radius, repeat count, and `REFINED_CRYSTAL_THRESHOLD = 500`.
   - Watch especially for Sand + Fracteryl, Sapphire + Fracteryl, Diamond + Ruby, and Nullstone + AoE combinations.

8. **`forge.forgeCraftLevel` save cleanup**
   - `forge.forgeCraftLevel` is still present in v30 saves but is no longer authoritative. The real capacity comes from the `forge_craft_level` RPG upgrade.
   - Remove or deprecate the stale field in a future v31 save migration.

9. **Crafted weapon visual polish**
   - Current crafted card icon is a static gradient diamond silhouette.
   - Future polish: sprite silhouette based on weapon form, with animated drifting blob-gradient fill based on up to six mote colors.

10. **Older Caustics fish debug follow-ups**
    - Fish pathfinding works, but optional debug visualization for fish A* paths/stuck states remains deferred.
    - Per-species fish turn-rate tuning and narrow-passage playtesting remain optional polish tasks.

---

## Build #203 — Crafted weapons: modifier data, crit, armor ignore, tests

### Completed in this build

* **`CraftedWeaponModifiers` type**: Added to `CraftedWeaponData`. Stores `critChancePct`, `armorIgnorePct`, `poisonBonusDmg`, `nullstonePullRadius`, `fracterylStrikes`, `emeraldAcquisitionRangePx`. Computed from composition by `computeCraftedWeaponModifiers()`. Cached at craft time and re-derived on load. `resolveCraftedWeaponModifiers(weaponId)` provides O(1) lookup at attack time.

* **Sand fire-rate / damage divisor**: Baked into `deriveCraftedWeaponStats`. Formula: `divisor = 1 + sandShare × 10`. Both `cooldownMs` and `damage` are divided by this factor. Net DPS stays approximately flat; Sand trades per-hit power for attack frequency. Guards: `damage ≥ 6`, `cooldownMs ≥ 220ms`.

* **Sapphire crit**: Applied in `performWeaponAttack`. Each attack rolls `Math.random() < critChancePct/100`; on crit, `rawDamage` is doubled before dispatch to all attack handlers. Capped at 60% in `computeCraftedWeaponModifiers`.

* **Diamond armor ignore**: Implemented as `armorIgnore` passed to `performAoeAttack` and `performMultiAttack`, and merged into `defPierceRatio` for single/piercing attacks via `Math.max(armorIgnore, effectivePierce)`.

* **Tests** (`src/data/rpg/__tests__/crafted-weapons.test.ts`, 22 tests): tier-weighted composition, forge capacity, Sand divisor floor, Fracteryl cap, Sapphire/Diamond caps, Nullstone cap, and crafted weapon round-trip.

### Historical deferred items resolved or superseded by Build #204

* Iolite poison bonus, Emerald acquisition range, Nullstone pull, and Fracteryl recursive strikes moved from data-only to first-pass combat hooks in Build #204.

### Still relevant from this build

* Amethyst extra ships remain placeholder.
* Eigenstein remains reserved.
* Balance and playtesting are still needed.

---

## Build #202 — Crafted weapons: forge capacity upgrade, crystal feedback, visuals, modifiers

### Completed in this build

* **Forge craft level upgrade**: Added `forge_craft_level` RPG upgrade (max level 4, costs emerald motes, 8k per level). `craftWeapon()` derives forge craft level from `getRpgUpgradeLevel(state.rpg, 'forge_craft_level') + 1`. Capacity at upgrade level 0–4 maps to 2–6 slots.

* **Refined crystal feedback**: `applyForgeSacrifice` returns crystals gained per tier. The game loop stores it in `AppState.lastRefinedCrystalsGained`, and `drawForgeSacrificeFlash` renders tier-colored floating crystal-gain text above the forge.

* **Crafted weapon visual icon**: Each crafted weapon card shows a diamond SVG silhouette filled with a linear gradient derived from composition shares. Glows with dominant tier color.

* **Percent-based modifier display** (`getCraftedModifierLines`): Shows human-readable modifier lines using `effectPower = share × 1000` for Sand, Quartz, Ruby, Citrine, Emerald, Sapphire, Iolite, Amethyst placeholder, Diamond, Nullstone, Fracteryl, and Eigenstein reserved.

---

## Build #201 — Crafted weapons: save/load, combat resolver, crafting action, UI

### Completed in this build

* **Save/load (v30)**: `SAVE_VERSION` bumped to 30. `SaveData` extended with `rpg.craftedWeapons`, `rpg.refinedCrystalsByTierId`, `forge.refinedProgressByTierId`, and `forge.forgeCraftLevel`. Serialize/deserialize wired up. After loading, `registerCraftedWeapons()` is called so crafted weapon IDs resolve immediately. Old saves default safely.

* **Resolver integration**: Combat and display files that look up equipped weapon IDs now use `resolveWeaponDefinition()` instead of direct `WEAPON_BY_ID.get()` where crafted IDs may appear. Static catalogue lookups remain static.

* **`craft_weapon` action**: Wired in `app-actions.ts`; validates via `craftWeapon()`, plays success/error audio, and refreshes the RPG menu panel.

* **Forge capacity**: `getForgeCapacity` maps level 1→2 slots, level 2→3, level 3→4, level 4→5, level 5+→6.

* **Weapons tab UI**: Forge crafting panel shows crystal inventory, per-tier inputs, live composition preview, Craft button, and crafted weapon cards with composition, stats, and equip/unequip controls.

---

## Build #194 — Verdure cave walls expand with field-space active bounds

### Status

Verdure cave/stone walls now expand with field-space active bounds instead of being locked to the old 360×640 safe core. Wall rendering, collision, floor texture, spawn rejection, plant anchors, and nav-grid integration now account for the expanded world-space origin and dimensions.

---

## Build #191 — RPG desktop zoom/cropping fix

### Status

The RPG safe core now scales using `min(containerW / 360, containerH / 640, 1)` so the full 360×640 safe core remains visible on desktop layouts that are shorter than 640 CSS px.

---

## Build #190 — Caustics fish terrain-aware pathfinding

### Status

Caustics fish enemies now navigate around topology using hybrid A* path steering, multi-angle local avoidance, stuck detection, and fish-like motion preservation.

### Optional follow-ups

1. Wire fish path states into the debug overlay.
2. Add per-species fish turn rates.
3. Monitor narrow-passage edge cases.
4. Consider A* soft obstacles for fish spawn zones.

---

## Field-space adoption status

All field-space adoption tasks from builds #185–#188 are complete, including topographic lighting coverage across the full visible world.

### Intentional safe-core uses

- `drawBottomSafeZone`, `drawBossStageDirector`, and `drawWaveClearBanner` remain centered on the stable 360×640 core for readability.
