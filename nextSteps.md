# Next Steps — Equatoria Idle

Current build: **#210**

---

## Build #210 — Weapon Crafting page with percentage slider (Upgrades tab)

### Completed in this build

* **`src/data/rpg/crafting-allocation.ts`** — pure math helpers for the crafting UI:
  - `enforceMinSegmentSize(shares, minFraction)`: fixes segments below minimum via iterative
    redistribution (clamp → renormalize from unfixed segments), stable result.
  - `snapToStep(value, stepFraction)`: snaps to nearest step multiple.
  - `sharesFromHandles / handlesFromShares`: convert between N-1 handle positions and N shares.
  - `clampHandle(hi, pos, handles, minFraction)`: enforce minimum segment size per handle move.
  - `computeMaxBudget(tiers, shares, inventory, devMode)`: weighted budget ceiling from inventory.
  - `allocateIngredients(tiers, shares, inventory, powerFraction, devMode)`: full allocation →
    refined crystal ingredient array. Ensures ≥1 crystal when budget > 0, clamps to inventory.

* **`src/ui/panels/rpg-weapon-crafting-page.ts`** — new standalone crafting workspace:
  - Tier chip selector (up to forge capacity; only shows tiers with available crystals or in dev mode).
  - Multi-segment percentage slider: N-1 draggable handles, colored segments, tier name + % labels.
  - Mouse, touch, and keyboard drag (arrow keys, Shift+arrow for 5% steps).
  - Minimum 5% segment size enforced; 1% snap step.
  - Power slider (1–100% of max weighted budget).
  - Live actual composition preview (post-floor, using `computeCraftedWeaponComposition`).
  - Shows Lv/×mult/mote-wt estimate.
  - Craft button with validation messages (no types selected, insufficient crystals, over-capacity).
  - Collapsible `<details>` "Exact counts / advanced" fallback with per-tier number inputs.
  - Dispatches `{ kind: 'craft_weapon', ingredients }` (same action as before).
  - Slider/selection state is preserved across tab updates (crafting page persists on the pane).

* **`src/ui/panels/rpg-upgrades-tab.ts`** — wires the crafting page:
  - Creates one `RpgWeaponCraftingPage` instance (persists across updates).
  - Renders it at the top of the Upgrades tab when crystals exist or dev mode is on.
  - Existing upgrade purchase cards remain unchanged below.

* **CSS** (`src/styles/canvas.css`) — `forge-craft__*` classes:
  - Dark background panel, gold border.
  - Chip buttons with tier color CSS variable.
  - `.forge-craft__track` + `.forge-craft__segment` + `.forge-craft__handle` for the slider.
  - Glowing handles with focus/hover states.
  - Power range input, composition chips, stats row, validation, craft button.
  - Advanced `<details>` collapsible section.

* **Tests** (`src/data/rpg/__tests__/crafting-allocation.test.ts`, 20 tests):
  - `enforceMinSegmentSize` sums to 1, minimum enforced in all cases.
  - `snapToStep` rounding.
  - `sharesFromHandles` / `handlesFromShares` round-trip.
  - `clampHandle` minimum constraint.
  - `computeMaxBudget` inventory gating, dev mode, limiting-tier logic.
  - `allocateIngredients` floor counts, power scaling, inventory clamping, empty inventory,
    forge capacity (only selected tiers appear in result).

### Deferred / next steps

* **Move to a dedicated Forge tab**: The crafting page is currently shown in the Upgrades tab
  as a temporary home. When a dedicated RPG Forge tab is created, import and mount
  `createRpgWeaponCraftingPage` there and remove it from `rpg-upgrades-tab.ts`.

* **Remove `buildForgeCraftingPanel` from `rpg-weapons-tab.ts`**: The old number-input crafting
  panel is still live in the Weapons tab. Once the new percentage-slider page is validated,
  remove the old panel (or keep it as a permanent dev-only fallback). They dispatch the same
  action so both are safe simultaneously.

* **Segment label overflow**: On very narrow segments (< ~15%) the tier name + % label
  is clipped. Future polish: hide label or show only % when segment is too narrow.

* **Slider keyboard focus indicator**: The handle has a glow on `:focus` but no visible
  focus ring for accessibility compliance. A visible outline can be added later.

* **Pre-existing lint errors (unrelated)**:
  - `npm run lint` reports 8 errors in pre-existing files (rpg-render.ts, rpg-elite-empower-particles.ts,
    rpg-render-update.ts, topographic-terrain.test.ts). None introduced by Build #210.

---

---

## Build #209 — Fracteryl Spear Array (dominant crafted weapon)

### Completed in this build

* **`fracterylSpear`** added to `WeaponEffect` union in `weapon-definitions.ts`.
* **`getDominantCraftedEffect('fracteryl')`** now returns `{ kind: 'fracterylSpear' }`
  instead of the placeholder `emeraldMissile`.
* Stat-scaling switch in `deriveCraftedWeaponStats` handles `fracterylSpear`:
  damage ×0.90, cooldown ×1.10, range = INFINITE_RANGE.
* **`rpg-weapon-fracteryl-spear.ts`** — new weapon system:
  - `spawnFracterylSpearVolley(weaponId, damage, tier)`: spawns 3–10 spears
    (3 base, +1 per 2 tiers, capped 10) radially around the player.
  - Each spear orbits the player during its stagger delay (110 ms apart),
    tracking the nearest target, then launches straight toward it.
  - `updateFracterylSpears(deltaMs)`: advances forming/flying state, hit detection
    via `collectEnemyBodyTargets` + `damageBodyTarget`, spawns a bloom on impact.
  - `updateFracterylBlooms(deltaMs)`: ticks bloom damage every 200 ms, checks
    all branch endpoints against enemies, per-tick deduplication by position key.
  - Branch generation: iterative BFS, 3-fold symmetry, up to 5 generations,
    64 branches max, length ×0.65 per gen, damage ×0.55 per gen.
  - Hard caps: 30 active spears, 10 active blooms.
* **`rpg-weapon-draw-fracteryl.ts`** — draw module:
  - `drawFracterylSpears`: crystalline shaft + diamond spearhead, pointing at target.
  - `drawFracterylBlooms`: recursive branch lines fading with lifetime and generation,
    small endpoint motes at gen 0/1 for accent.
* Wired into `rpg-weapon-systems.ts` (factory, handle, reset).
* Wired into `rpg-weapon-tick.ts` (update dispatch under `fracterylSpear` effect).
* Wired into `rpg-player-attack.ts` (`fracterylSpear` dispatch calls volley spawn).
* Wired into `rpg-render.ts` (`spawnFracterylSpearVolley` passed into attack ctx).
* Wired into `rpg-render-draw.ts` (draw calls + low-graphics propagation).
* **Fracteryl modifier unchanged**: non-dominant Fracteryl still contributes
  `fracterylStrikes` recursive strikes to other weapon families via `applyCraftedPostHit`.
* **Tests** (`crafted-weapons.test.ts`): 3 new tests confirming
  - `getDominantCraftedEffect('fracteryl')` → `fracterylSpear`
  - fracteryl-dominant crafted weapon definition uses `fracterylSpear`
  - non-dominant fracteryl still contributes `fracterylStrikes > 0`

### Known limitations (first pass)

* Spears fly straight (no homing) — intentional for simplicity and predictability.
* Bloom hit detection uses endpoint proximity (12 px radius), not full segment
  intersection. Fine for first pass; true segment collision can be added later.
* Branch count and damage balance are first-pass estimates; tune after playtesting.
* No per-spear particle trail yet (purely solid shaft draw).
* Bloom does not despawn when its source enemy dies — expires naturally by lifetime.

### Manual verification checklist

- [ ] Craft a Fracteryl-dominant weapon, equip it.
- [ ] Confirm spears appear and orbit around the player before launching.
- [ ] Confirm spears launch one by one with stagger delay.
- [ ] Confirm each impact spawns a visible fractal bloom.
- [ ] Confirm bloom damages enemies repeatedly.
- [ ] Confirm Fracteryl modifier still fires recursive strikes on non-Fracteryl weapons.
- [ ] Confirm Emerald missiles still work normally.
- [ ] Confirm no crashes on enemy death during spear flight.
- [ ] Confirm no crashes on wave transition with active blooms.

---

## Build #208 — Crafted weapon post-hit centralization (Nullstone + Fracteryl)

### Completed in this build

* **`rpg-crafted-post-hit.ts`** — new shared helper module in `src/render/rpg/`.
  Exports `makeFracterylPool(strikes)` and `applyCraftedPostHit(...)`.
  Contains the single comprehensive `damageFollowUpTarget` dispatch that covers
  all ClosestTarget variants reachable via `RpgPlayerAttackCtx`, replacing the
  partial inline list that was in `performSingleAttack`.

* **Nullstone pull** moved out of `performSingleAttack` into `applyCraftedPostHit`.
  Now fires for single/piercing, multi, and AoE attacks.
  - Single/piercing: pull at the hit target's position.
  - Multi: pull at each hit target's position (bounded by targetCount ≤ 6).
  - AoE: one pull at the mote center after all AoE hits (avoids O(n²) per burst).
  - Guards: skipped when hitX/hitY is NaN or Infinity.

* **Fracteryl follow-ups** moved out of `performSingleAttack` into `applyCraftedPostHit`.
  Now fires for single/piercing, multi, and AoE attacks.
  - **No recursion**: follow-up strikes are dispatched directly through
    `damageFollowUpTarget`; `applyCraftedPostHit` is never called from within it.
  - **Shared pool cap**: multi and AoE create one `makeFracterylPool` instance
    shared across all targets — total follow-ups per attack ≤ `fracterylStrikes`,
    not `fracterylStrikes × targetCount`. Prevents runaway DPS.
  - **Damage decay**: 50% per follow-up, loop exits when `strikeDmg < 0.5`.
  - **Full target coverage**: `damageFollowUpTarget` handles all enemy types that
    `performSingleAttack`'s original Fracteryl code missed (missile, ambershard,
    quartzspike, rubybolt, citrinebolt, amethystshard, diamondshard, voidtendril,
    fracterylshard, and all procedural creature types).

* **`performMultiAttack`** gains `craftedMods?` param; `getSortEntryPos` helper
  extracts hit position from a `MultiSortEntry` without changing the type.

* **`performAoeAttack`** gains `craftedMods?` and `rangeSq?` params.

* **`performWeaponAttack`** passes `craftedMods` and `rangeSq` through to both
  `performAoeAttack` and `performMultiAttack`.

* **Tests** (12 new, 237 total passing):
  - `makeFracterylPool` value, clamp, reference semantics.
  - Fracteryl damage decay formula (50% per repeat).
  - Fracteryl pool drain and no-recursion guard.
  - Nullstone pull guard against NaN / Infinity coordinates.
  - Multi/AoE shared pool cap: total follow-ups ≤ `fracterylStrikes` across all targets.
  - `fracterylStrikes=0` produces zero follow-ups.

### Deferred / first-pass notes

* **Projectile/self-managed families** (gatling/sand, poisonBolt, emeraldMissile,
  laserBeam, chainWhip, vortex, swordCombo): Nullstone and Fracteryl still do not
  fire for these. They are deferred to avoid risky rewrites of their self-managed
  update loops. Gatling projectiles land asynchronously so a synchronous post-hit
  hook doesn't cleanly fit without a broader refactor.

* **Nullstone visual (vortex pulse)**: No black-hole/vortex visual was added.
  The pull is still an instant positional nudge without a visible field effect.
  Requires hooks into a visual particle layer or a new short-lived effect type.
  Deferred to a future build.

* **Fracteryl visual**: Follow-up hits use `FRACTERYL_ENEMY_GLOW` color on the
  `spawnHitVisualsAt` call. No dedicated "chain strike" visual trajectory or audio.
  Deferred.

* **Pre-existing lint errors** (unrelated to this build):
  - `npm run lint` reports 8 errors in `src/render/rpg/rpg-render.ts` (4× `no-explicit-any`),
    `src/render/rpg/rpg-elite-empower-particles.ts` (1× `prefer-const`),
    and `src/render/rpg/rpg-render-update.ts` (1× `no-explicit-any`).
  - None introduced by Build #208.

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

3. **Broaden crafted modifier coverage beyond the current first-pass paths** ✅ Done in Build #208.
   - Nullstone and Fracteryl now fire for single/piercing, multi, and AoE via `rpg-crafted-post-hit.ts`.
   - Projectile/self-managed families (gatling, poisonBolt, emeraldMissile, laserBeam, chainWhip, vortex, swordCombo) remain deferred — see Build #208 deferred notes.

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
