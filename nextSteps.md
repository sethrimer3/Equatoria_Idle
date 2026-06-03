# Next Steps — Equatoria Idle

Current build: **#207**

---

## Build #207 — Eigenstein sword: dimensional rift weapon

### Completed in this build

* **`getDominantCraftedEffect` for `eigenstein`** now returns `{ kind: 'swordCombo' }`
  instead of `piercing`, so Eigenstein-dominant crafted weapons are recognized as
  sword-family weapons throughout the combat and visual pipeline.

* **`isEigensteinDominant(weaponId)`** registry in `crafted-weapon-helpers.ts`.
  Populated when a weapon is created or loaded via `registerCraftedWeapons`.
  Used by the sword combo system to enable Eigenstein-specific behavior.

* **`EFFECT_LABELS['swordCombo']` and `EFFECT_NOUNS['swordCombo']`** added so
  Eigenstein weapon cards show "dimensional sword slash" / "Blade" correctly.

* **`EigensteinRiftEffect` / `EigensteinRiftBranch`** types in `rpg-types.ts`.
  Short-lived rift crack visuals spawned on each Eigenstein hit. Stored on
  `SwordComboState` per-weapon.

* **`SwordComboState` extended** with optional `isEigensteinBlade`, `riftAccum`
  (WeakMap<object, number>), and `riftEffects` (EigensteinRiftEffect[]).
  Non-eigenstein weapons leave these as `undefined`.

* **Per-enemy rift damage compounding** in `swordHitInArc`:
  - `storedBefore = riftAccum.get(enemy) ?? 0`
  - `effectiveDamage = baseDamage + storedBefore`
  - `riftAccum.set(enemy, storedBefore + baseDamage)` (capped at 9999)
  - Accumulation is per-enemy via WeakMap — clears naturally on enemy GC.
  - Different enemies do not share accumulation.

* **Eigenstein sword visual** (`drawEigensteinBlade` in `rpg-weapon-draw-sword.ts`):
  - 1.7× longer than diamond sword at same tier (10 shards vs 7).
  - First 3 shards: stable hilt / crossguard (dark void-purple, neon outline).
  - Shards 3–9: continuously oscillate in angle (amplitude=0.28 rad, freq-staggered),
    cycling through neon "impossible" blade colors, polygon shape changes over time.
  - Swipe arc and beam effects use matching neon palette.

* **Dimensional rift slash visual** (part of `drawEigensteinBlade`):
  - On each Eigenstein hit, 3–6 branch cracks grow from the impact point.
  - Dark void core + bright neon outline per branch, substrate-inspired.
  - Perpendicular tick marks at branch tips.
  - Intensity scales with rift accumulation (bigger/more intense on repeated hits).
  - Duration ~700 ms; branches grow in first 45% of lifetime, then fade.
  - Capped at 8 simultaneous rift effects per weapon.

* **`getShardDistances(length, count?)` extended** with optional count parameter
  so Eigenstein (10 shards) generates correct distance arrays without breaking
  existing callers (default still uses `SWORD_SHARD_COUNT = 7`).

* **Eigenstein constants** added to `rpg-weapon-constants.ts`:
  `EIGENSTEIN_SHARD_COUNT`, `EIGENSTEIN_BLADE_LENGTH_MULT`, `EIGENSTEIN_STABLE_SHARDS`,
  oscillation params, color palettes, `EIGENSTEIN_RIFT_DURATION_MS`,
  `EIGENSTEIN_RIFT_MAX`, `EIGENSTEIN_RIFT_ACCUM_CAP`.

* **Tests** (28 new, 225 total passing):
  - `getDominantCraftedEffect('eigenstein')` → `swordCombo`
  - `isEigensteinDominant` registry round-trip
  - Pure rift accumulation math: compounding formula, per-enemy isolation, WeakMap isolation

### Deferred / first-pass notes

* **Per-enemy rift tint visual**: enemies with accumulated rift damage do not yet show
  a faint inverted outline. Implementing this requires hooks into the per-enemy draw
  loop for every enemy type. Deferred to a future build.

* **Rift branch secondary branching**: rift cracks currently have no sub-branches
  (only tick marks at tips). Substrate-style recursive branching deferred.

* **Fluid color**: Eigenstein fluid drag still uses `SWORD_PRISMATIC_COLORS` palette
  during the combo update (the physics update path). The draw path uses eigenstein
  neon colors. A dedicated eigenstein fluid color could be added later.

* **Accumulation cap**: `EIGENSTEIN_RIFT_ACCUM_CAP = 9999`. This is a hard ceiling;
  a soft-cap (logarithmic) may feel better in playtesting.

* **Rift color inversion**: colors are neon/saturated impossibles approximating
  an imaginary-plane feeling, not true pixel-level color inversion. True pixel
  inversion would require `destination-out` or `difference` compositing.

---

## Build #206 — Crafted weapons: base level system

### Completed in this build

* **`computeTotalWeightedMoteValue(ingredients)`**: Sums `refinedCount × getTierForgeWeight(tierId)`
  across all ingredients. Tier weights follow composition math (100^unlockOrder):
  Sand=1, Quartz=100, Ruby=10 000, …

* **`computeCraftedWeaponBaseLevel(totalWeightedMoteValue)`**:
  `Math.max(1, floor(log10(totalWeightedMoteValue + 1)))`.
  log10 scaling means each order-of-magnitude jump in resources is one level.

* **`computeCraftedWeaponBaseStatMultiplier(totalWeightedMoteValue)`**:
  `1 + log10(totalWeightedMoteValue + 1) × 0.12`.
  Examples: 200 → ×1.28, 10 000 → ×1.48, 1 000 000 → ×1.72.

* **Stat application** (in `deriveCraftedWeaponStats`, after sand divisor):
  - `damage  ×= baseStatMult` (floor 6)
  - `cooldownMs /= 1 + (baseStatMult - 1) × 0.25` (floor 220 ms)
  - `range    ×= 1 + (baseStatMult - 1) × 0.35` (infinite range weapons unchanged)
  - `defBonus ×= baseStatMult` (floor 0)

* **`critDamageMultiplier`** added to `CraftedWeaponModifiers`:
  `Math.min(3.0, 2.0 + log10(totalWeightedMoteValue + 1) × 0.05)`.
  Crit damage now uses this multiplier instead of the hard-coded ×2.
  Wired into `performWeaponAttack` in `rpg-player-attack.ts`.

* **`CraftedWeaponData` new fields**: `totalWeightedMoteValue`, `baseLevel`,
  `baseStatMultiplier`. Populated in `createCraftedWeaponDefinition` and
  recomputed on deserialization from `ingredients` (no save format change).

* **UI**: weapon cards show `Lv.X | ×Y.YY base | Z mote-wt` row.

* **Tests**: 13 new tests covering weighted value math, base level monotonicity,
  stat multiplier monotonicity, stat floors, and round-trip field presence
  (218 total passing).

### Balance notes (first pass — needs playtesting)

* `baseStatMult` coefficients (0.12 per log10 unit) and stat-application fractions
  (damage=full, range=0.35, cooldown=0.25) are intentionally conservative.
  Adjust after playtesting with typical recipe sizes.
* A 100% Amethyst recipe with 1 refined crystal gives mote-wt=100^9≈1e18 → mult≈×3.16;
  clamp `baseStatMult` if needed to avoid extreme values from deep-tier single crystals.

---

## Build #205 — Crafted weapons: Amethyst companion ships (first pass)

### Completed in this build

* **`amethystShipCount` modifier**: Added to `CraftedWeaponModifiers`.
  Formula: `Math.min(10, Math.round(amethystShare × 10))`. Computed by
  `computeCraftedWeaponModifiers`; 100% Amethyst → 10 ships, 60% → 6 ships.

* **Modifier display**: Replaced `"companion ships (placeholder)"` with
  `"+N furthest-target ship(s)"` using the same formula as the actual modifier.

* **Ship sync (`syncAmethystShips`)**: Extended to also allocate ships for
  crafted weapons whose `amethystShipCount > 0`. Ship slots are filled in
  equip order (static amethystShip weapon first, then crafted weapons).
  Global cap: 16 total ships. Ships store `sourceWeaponId: string | null`
  to track which weapon they came from.

* **Damage attribution**: `AmethystShip` and `AmethystLaser` both carry
  `sourceWeaponId`. Lasers fired from crafted ships use the crafted weapon
  for `withDamageSource`. Static ships fall back to the equipped `amethystShip`
  weapon ID as before.

* **Tests**: 4 new tests in `crafted-weapons.test.ts` covering 100%, 60%,
  0% Amethyst share and cap enforcement.

### Known limitations / deferred

* Crafted Amethyst ships use the same visual as static Amethyst ships
  (no procedural color from weapon composition yet).
* Ships target furthest enemies regardless of the crafted weapon's primary
  attack family — "true weapon mirroring" (e.g. poison ships) is deferred.
* Balance (ship count coefficients, damage multipliers) needs playtesting.

---

## Build #204 — Crafted weapons: four modifier combat hooks wired

### Completed in this build

* **Build number updated**: `src/buildInfo.ts` now reports `BUILD_NUMBER = 204`.

* **Iolite poison bonus**: Crafted weapon `poisonBonusDmg` now feeds into poison bolts. The bonus is computed at bolt spawn, stored on the bolt, then added to poison tick damage when the debuff is attached.

* **Emerald acquisition range**: Crafted weapon `emeraldAcquisitionRangePx` is now threaded into emerald missiles as `bonusDetectPx`, giving each missile its own increased homing detection radius.

* **Nullstone pull**: Crafted weapon `nullstonePullRadius` now triggers after a single-target crafted weapon hit. The first implementation applies a capped instant pull/nudge toward the impact point for enemies within radius.

* **Fracteryl recursive strikes**: Crafted weapon `fracterylStrikes` now triggers follow-up single-target strikes after the initial hit, with 50% damage decay per repeat and the existing hard cap of 10 repeats.

### Real remaining next steps after Build #204

1. **Amethyst extra ships** — Implemented as first pass in Build #205 above.

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

### Historical deferred items resolved or superseded

* Iolite, Emerald, Nullstone, and Fracteryl moved to first-pass combat hooks in Build #204.
* Amethyst extra ships moved to first-pass implementation in Build #205.
* Eigenstein remains reserved.

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
