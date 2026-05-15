# Next Steps — AlivenParticle Enemy System

The AlivenParticle enemy system (Build #4) is complete and builds without errors. These notes capture suggested follow-up work.

## Immediate follow-up
- **Hand-author waves 2–28 appearances** — currently the procedural generator adds every aliven variant starting from its `firstWave`. Consider adjusting hand-authored waves 2–25 to introduce variants one at a time with tighter framing (e.g. wave 2 has only spark_cluster, wave 5 adds shard_bloom, etc.).
- **Balance pass** — `hpBase`, `atkBase`, `xpMult`, and `specialCdMin/Max` values in `rpg-aliven-constants.ts` were chosen as starting points. A real balance pass after playtesting is needed.
- **Particle collision separation** — currently particles can overlap each other. A cheap separation repulsion loop would improve visual readability.

## Visual improvements
- **Pulser shockwave ring** — the pulser special fires invisibly today. Adding a brief ring animation at the pulse radius would communicate intent to the player.
- **Splitter particle spawn burst** — add a small flash or particle spray at the death/split position.
- **Healer beam visual** — a faint line from healer to healed target when healing activates would make the heal special more legible.
- **Group centroid glow** — drawing a faint ambient glow at the group centroid would help communicate group cohesion.

## Gameplay depth
- **Aliven bullet color variation** — spitter bullets currently use the particle color. Distinguishing them from the particle itself (e.g. slightly brighter) would make them easier to dodge.
- **Group-level health bar** — a thin group HP bar above the centroid (counting alive / total particles) would help players gauge kill progress.
- **Wave indicator integration** — add aliven variant icons to the enemy-indicators system so the player knows what's off-screen.
- **Lucky mote tier mapping** — currently uses the group's `tierId` directly. If new tier IDs are added that don't map to lucky mote drop tables, add a fallback.

## Code quality
- **Particle overlap separation** — add a lightweight O(n²) separation pass among alive particles within a group (capped at small group sizes).
- **AlivenUpdateCtx `playerIFramesMs`** — currently just reads the value; a setter would enable i-frames from spitter bullet hits and not just contact damage.
- **Test with >28 aliven groups alive simultaneously** — stress-test frame rate on mobile hardware; if needed, add a global cap on simultaneous aliven groups.

---

# Balance Forecast / Progression Analysis Panel (Build #11)

The Balance Forecast dev panel is implemented and accessible from the Settings tab when Developer Mode is enabled.

## Where it lives

| File | Purpose |
|---|---|
| `src/ui/panels/balance-forecast/balance-forecast-types.ts` | Shared types, `formatDuration`, warning thresholds |
| `src/ui/panels/balance-forecast/balance-forecast-engine.ts` | Core analysis/simulation engine |
| `src/ui/panels/balance-forecast/balance-forecast-panel.ts` | DOM panel rendering |
| `src/styles/panels.css` | `.bf-*` CSS classes appended at bottom |

## How to open

1. Open the game → Settings tab.
2. Toggle **Developer Mode** ON.
3. The **⚖ Balance Forecast** panel appears below the Particle Tweaks section.
4. Click **↺ Run Analysis** (runs automatically on first open).
5. Select different max simulation times with the dropdown; analysis re-runs automatically.

## What each section means

- **Next Meaningful Events** — top 8 reachable targets sorted by ETA from the current state.
- **Static ETA Analysis** — full table of every known target, grouped by status (available / reachable / blocked).
- **Fresh-Run Milestone Timeline** — starting from a new game, using Cheapest First strategy, when each major milestone is reached.
- **Strategy Comparison** — four strategies simulated in parallel, showing milestone times side-by-side.
- **Pacing Warnings** — automated balance issue flags (long gaps, clusters, extreme ETAs, etc.).

## Strategy approximations

All four strategies are approximations that work well for rough balance comparison but are not optimal solvers:

- **Wait Only** — pure baseline; no purchases ever.
- **Cheapest First** — always buys the cheapest currently affordable item. Good for casual play simulation.
- **Best Efficiency** — rates candidates by `productionGain / cost` with a bonus weight for tier unlocks and the forge. Production gain for equation upgrades is an approximation (0.01 abstract units).
- **Rush Next Tier** — prioritises the forge, then tier unlocks, then loom upgrades for the pay tier, then falls back to cheapest.

## Systems not yet fully covered by the forecast

- RPG-related achievements (wave_reached, weapon_purchased, boss_defeated, xp_reached) — these are not simulatable by the balance engine, since it doesn't run the RPG combat loop.
- Auto-tap unlock (progression `autoTapLevel`) — the engine upgrades loom/equation items but does not simulate auto-tap purchase upgrades yet (no such upgrade definition in the catalog currently).
- Achievement bonuses for claimed achievements — the simulation grants bonuses immediately on unlock (not on claim), which slightly overestimates bonuses compared to real play.

## Possible future improvements

- Add RPG milestone simulation (stub wave progression based on a simple DPS model).
- Add auto-tap upgrade purchases to the strategy candidates when those upgrade definitions exist.
- Add per-upgrade cost growth warnings (comparing adjacent loom upgrade costs).
- Add a "simulate from current state" mode for strategy comparison (rather than fresh-run only).
- Add a timeline chart (canvas or SVG) to visualise progression curves.

---

# Particle Crunch Economy Refactor (Build #24)

## What was implemented

### Equation Forge — 3-tap heat system
- **`src/sim/forge/forge-state.ts`**: `ForgeCrunchState` extended with `heatTapCount`, `lastHeatTapMs`, `sacrificeProgressByTierId`. New functions: `tapForgeHeat`, `startEquationForgeCrunch`, `tickForgeHeatTimeout`.
- **`src/sim/game-state.ts`**: `tapEquationForge(state, nowMs)` wired to the heat-tap system. `applyForgeSacrifice(state, sacrifices)` applies per-tier sacrifice mass → equation upgrade conversion at 10,000 mass per upgrade. `processLoomCapture(state, inputTierId, mass)` routes to loom conversion logic.
- **`src/render/forge/forge-renderer.ts`**: `drawForge` now accepts `heatTapCount` (0–3) and renders amber/orange/red heat rings around the forge visual.
- **`src/app/app-game-loop.ts`**: Callback `onEquationForgeCrunchCompleted` fires `applyForgeSacrifice`; `onParticleCapturedByLoom` fires `processLoomCapture`.
- **`src/app/app-actions.ts`**: `tap_equation_forge` action dispatches `tapEquationForge` and triggers visual feedback.
- **`src/input/input-handler.ts`**: Tapping on the forge area dispatches `tap_equation_forge`.

### Loom conversion economy
- **`src/sim/looms/loom-state.ts`**: `LoomTierState` extended with `conversionProgress` and `conversionEfficiencyLevel`. New functions: `getLoomInputTierId` (returns previous tier or null for sand), `getLoomConversionCost` (base 100, reduces 6% per efficiency level, min 25%), `applyLoomCapture` (conversion formula with fractional progress), `tryUpgradeLoomEfficiency` (spend own-tier motes for efficiency levels).
- **`src/ui/panels/loom-upgrades-pane.ts`**: Shows input tier ("Attracts: 2x2+ Sand particles"), conversion rate ("100 Sand → 1 Quartz"), progress bar toward next output mote, efficiency level + upgrade button.

### Particle capture fields
- **`src/render/particles/forge-field-forces.ts`** (new): `ForgeFieldInfo` type + `applyForgeFieldForces` function. Particles ≥ sizeIndex 1 inside the outer radius receive gentle attraction; inside the capture radius they are marked `isCaptured`. Loom captures are queued for immediate conversion. Forge captures only happen while `crunchState.isActive`.
- **`src/render/particles/particle-types.ts`**: `EquatoriaParticle` extended with `isCaptured`, `capturedById`, `particleId`.
- **`src/render/particles/particle-pool.ts`**: Particle pool initializes the new fields including a monotonically increasing `particleId` counter.
- **`src/render/particles/particle-system.ts`**: `setForgeFields(fields)` stores fields; update loop calls `applyForgeFieldForces` after Particle Life forces; captured particles are excluded from subsequent PL force passes; callbacks `onParticleCapturedByLoom` and `onEquationForgeCrunchCompleted` wired; `completeForgeCrunchCallback` applies sacrifices and removes forge-captured particles.
- **`src/render/particles/particle-physics.ts`**: Captured particles skip forge-attraction forces (they are frozen until crunch completes).
- **`src/render/particles/particle-life.ts`**: Captured particles skip Particle Life pairwise force computation.
- **`src/app/app-game-loop.ts`**: Builds `ForgeFieldInfo[]` each frame — equation forge field + per-unlocked-loom fields positioned at loom output tier generator position.

### Save/load
- **`src/settings/save-load.ts`**: SAVE_VERSION bumped to 23. Saves `forge.heatTapCount`, `forge.sacrificeProgressByTierId`; per-loom `conversionProgress` and `conversionEfficiencyLevel`. Backward-compatible defaults (0 / empty map) for older saves.

---

# Forge/Loom Economy Polish (Build #26)

## What was implemented (verified by code inspection; not manually playtested)

### Task 1 — Forge crunch pathway verified and documented ✅ Done (Build #26)
- Inspected `particle-forge.ts`, `particle-system.ts`, and `forge-logic.ts`.
- Confirmed `checkForgeCrunch` always returns `null` (explicitly disabled), so the legacy `isForgeCrunchParticle` path never fires and cannot conflict with the new sacrifice path.
- The new sacrifice pathway correctly marks particles with `isCaptured + capturedById === 'forge'` (different flags from the legacy path).
- Added a top-of-file comment block in `particle-forge.ts` and inline comments in `particle-system.ts` making the split between the two pathways unambiguous.

### Task 2 — Loom efficiency upgrade UI bug fixed ✅ Done (Build #26)
- **Bug**: The efficiency button in `loom-upgrades-pane.ts` was displaying and checking the *input tier* (e.g. Sand) mote balance, but `tryUpgradeLoomEfficiency` charges the *own/output tier* motes.
- **Fix**: Changed the button text, cost display, and `disabled` check to use `def.tierId` (own-tier) motes instead of `inputTierId` motes. The button now correctly reads: `"⚗ Efficiency +1 — N Quartz"` (for the Quartz loom) and is disabled only when the player lacks enough Quartz motes.

### Task 3 — Forge sacrifice visual feedback ✅ Done (Build #26)
- Added `forgeSacrificeFlashMs: number` to `AppState`.
- Set it to `performance.now()` inside `onEquationForgeCrunchCompleted`.
- Added `drawForgeSacrificeFlash(cc, forgeX, forgeY, nowMs, forgeSacrificeFlashMs)` to `forge-renderer.ts`: a 600ms expanding shockwave ring + secondary softer ring + a brief center flash glow (visible only in first 20% of the animation). No per-frame allocations; radial gradient is created only when the flash is active.
- Called from `app-game-loop.ts` after `drawForgeCrunch`.

### Task 4 — Forge tap radius expanded for touch/mobile ✅ Done (Build #26)
- Added `isTouchInput: boolean` to the `tap` GameAction type; `setupInputListeners` sets it from `e.pointerType === 'touch'`.
- The forge tap radius check in `app-actions.ts` now uses `MAX_FORGE_ATTRACTION_DISTANCE × 1.5` for touch input and `× 1.0` for mouse/desktop input, making it significantly easier to hit on small phones without changing precision for mouse users.

### Task 5 — Loom capture audio feedback ✅ Done (Build #26)
- Added a 400ms cooldown timer in `createGameLoop` (inside `app-game-loop.ts`).
- When `onParticleCapturedByLoom` fires, the cooldown-gated path calls `audioSystem.onMotesMerged(1)` — reusing the existing merge SFX pool with built-in polyphony limiting. This gives a soft, familiar audio cue without overwhelming the player during rapid captures.

### Task 6 — Loom pane inline style cleanup ✅ Done (Build #26)
- Removed `effBtn.style.marginTop = '4px'` inline style; added `.loom-efficiency-btn { margin-top: 4px; }` to `src/styles/components.css`.
- Replaced `effBtn.style.display = 'none'` / `''` with `classList.toggle('loom-efficiency-btn--hidden', ...)` backed by a `.loom-efficiency-btn--hidden { display: none; }` CSS rule.

### Task 7 — Unit tests with Vitest ✅ Done (Build #26)
- Added `vitest@3` to devDependencies; created `vitest.config.ts`; added `"test": "vitest run"` to `package.json`.
- Created `src/sim/__tests__/forge-loom-economy.test.ts` with **18 unit tests** covering:
  - `tapForgeHeat`: first tap, third tap trigger, N-tap requirement, blocked while active
  - `tickForgeHeatTimeout`: resets after 30s, does not reset too early
  - `applyForgeSacrifice`: accumulates mass, converts at threshold, stores fractional remainder, handles multiple tiers
  - `applyLoomCapture`: converts at default threshold, preserves fractional progress, efficiency lowers threshold, sand is passive
  - `getLoomInputTierId`: sand→null, quartz→sand, ruby→quartz, unknown→null (no throw)
- All 18 tests pass.

## Still Remaining

### Needs playtesting before claiming done
- **Balance values**: sacrifice threshold (2000), loom conversion base cost (50), efficiency scaling (3ˣ), and 10% passive non-sand production rate are initial estimates. They need real playtesting to evaluate feel.
- **Loom efficiency upgrade UX**: The button fix is verified by code inspection; it was not tested end-to-end in a running build (no browser test harness).
- **Forge sacrifice flash visual**: Implemented and verified to draw the correct geometric shapes; exact timing (600ms) and scale feel need visual playtesting.
- **Loom audio cooldown**: Plays `onMotesMerged` at most once per 400ms. Whether this cooldown value feels right needs playtesting — it may be too frequent or too sparse depending on particle density.

### AlivenParticle polish (tasks 8–9 from problem statement — deferred)
These were deprioritised in favour of completing the forge/loom economy tasks first:
- Particle overlap separation within Aliven groups (lightweight O(n²) repulsion pass).
- Pulser shockwave ring visual.
- Splitter death/split burst visual.
- Healer beam visual.
- Group centroid glow.
- Spitter bullet colour variation.
- Group-level health bar above centroid.
- Enemy indicator integration for Aliven variants.
- Lucky mote tier fallback for unknown tier IDs.

### Balance Forecast improvements (task 9 from problem statement — deferred)
- Simulate-from-current-state mode for strategy comparison.
- Simple timeline visualisation.
- Auto-tap upgrade candidates when upgrade definitions exist.
- Cost-growth warnings comparing adjacent loom upgrade costs.

### Architecture (nice-to-have, not blocking)
- The `tap_equation_forge` GameAction case in `app-actions.ts` is still a no-op (forge heat taps are handled inside the `tap` case). The dead case could be removed or documented.
- Consider adding a `FORGE_TOUCH_TAP_MULTIPLIER` constant in `particle-config.ts` instead of the hardcoded `1.5` in `app-actions.ts`.


The AlivenParticle enemy system (Build #4) is complete and builds without errors. These notes capture suggested follow-up work.

## Immediate follow-up
- **Hand-author waves 2–28 appearances** — currently the procedural generator adds every aliven variant starting from its `firstWave`. Consider adjusting hand-authored waves 2–25 to introduce variants one at a time with tighter framing (e.g. wave 2 has only spark_cluster, wave 5 adds shard_bloom, etc.).
- **Balance pass** — `hpBase`, `atkBase`, `xpMult`, and `specialCdMin/Max` values in `rpg-aliven-constants.ts` were chosen as starting points. A real balance pass after playtesting is needed.
- **Particle collision separation** — currently particles can overlap each other. A cheap separation repulsion loop would improve visual readability.

## Visual improvements
- **Pulser shockwave ring** — the pulser special fires invisibly today. Adding a brief ring animation at the pulse radius would communicate intent to the player.
- **Splitter particle spawn burst** — add a small flash or particle spray at the death/split position.
- **Healer beam visual** — a faint line from healer to healed target when healing activates would make the heal special more legible.
- **Group centroid glow** — drawing a faint ambient glow at the group centroid would help communicate group cohesion.

## Gameplay depth
- **Aliven bullet color variation** — spitter bullets currently use the particle color. Distinguishing them from the particle itself (e.g. slightly brighter) would make them easier to dodge.
- **Group-level health bar** — a thin group HP bar above the centroid (counting alive / total particles) would help players gauge kill progress.
- **Wave indicator integration** — add aliven variant icons to the enemy-indicators system so the player knows what's off-screen.
- **Lucky mote tier mapping** — currently uses the group's `tierId` directly. If new tier IDs are added that don't map to lucky mote drop tables, add a fallback.

## Code quality
- **Particle overlap separation** — add a lightweight O(n²) separation pass among alive particles within a group (capped at small group sizes).
- **AlivenUpdateCtx `playerIFramesMs`** — currently just reads the value; a setter would enable i-frames from spitter bullet hits and not just contact damage.
- **Test with >28 aliven groups alive simultaneously** — stress-test frame rate on mobile hardware; if needed, add a global cap on simultaneous aliven groups.

---

# Balance Forecast / Progression Analysis Panel (Build #11)

The Balance Forecast dev panel is implemented and accessible from the Settings tab when Developer Mode is enabled.

## Where it lives

| File | Purpose |
|---|---|
| `src/ui/panels/balance-forecast/balance-forecast-types.ts` | Shared types, `formatDuration`, warning thresholds |
| `src/ui/panels/balance-forecast/balance-forecast-engine.ts` | Core analysis/simulation engine |
| `src/ui/panels/balance-forecast/balance-forecast-panel.ts` | DOM panel rendering |
| `src/styles/panels.css` | `.bf-*` CSS classes appended at bottom |

## How to open

1. Open the game → Settings tab.
2. Toggle **Developer Mode** ON.
3. The **⚖ Balance Forecast** panel appears below the Particle Tweaks section.
4. Click **↺ Run Analysis** (runs automatically on first open).
5. Select different max simulation times with the dropdown; analysis re-runs automatically.

## What each section means

- **Next Meaningful Events** — top 8 reachable targets sorted by ETA from the current state.
- **Static ETA Analysis** — full table of every known target, grouped by status (available / reachable / blocked).
- **Fresh-Run Milestone Timeline** — starting from a new game, using Cheapest First strategy, when each major milestone is reached.
- **Strategy Comparison** — four strategies simulated in parallel, showing milestone times side-by-side.
- **Pacing Warnings** — automated balance issue flags (long gaps, clusters, extreme ETAs, etc.).

## Strategy approximations

All four strategies are approximations that work well for rough balance comparison but are not optimal solvers:

- **Wait Only** — pure baseline; no purchases ever.
- **Cheapest First** — always buys the cheapest currently affordable item. Good for casual play simulation.
- **Best Efficiency** — rates candidates by `productionGain / cost` with a bonus weight for tier unlocks and the forge. Production gain for equation upgrades is an approximation (0.01 abstract units).
- **Rush Next Tier** — prioritises the forge, then tier unlocks, then loom upgrades for the pay tier, then falls back to cheapest.

## Systems not yet fully covered by the forecast

- RPG-related achievements (wave_reached, weapon_purchased, boss_defeated, xp_reached) — these are not simulatable by the balance engine, since it doesn't run the RPG combat loop.
- Auto-tap unlock (progression `autoTapLevel`) — the engine upgrades loom/equation items but does not simulate auto-tap purchase upgrades yet (no such upgrade definition in the catalog currently).
- Achievement bonuses for claimed achievements — the simulation grants bonuses immediately on unlock (not on claim), which slightly overestimates bonuses compared to real play.

## Possible future improvements

- Add RPG milestone simulation (stub wave progression based on a simple DPS model).
- Add auto-tap upgrade purchases to the strategy candidates when those upgrade definitions exist.
- Add per-upgrade cost growth warnings (comparing adjacent loom upgrade costs).
- Add a "simulate from current state" mode for strategy comparison (rather than fresh-run only).
- Add a timeline chart (canvas or SVG) to visualise progression curves.

---

# Particle Crunch Economy Refactor (Build #24)

## What was implemented

### Equation Forge — 3-tap heat system
- **`src/sim/forge/forge-state.ts`**: `ForgeCrunchState` extended with `heatTapCount`, `lastHeatTapMs`, `sacrificeProgressByTierId`. New functions: `tapForgeHeat`, `startEquationForgeCrunch`, `tickForgeHeatTimeout`.
- **`src/sim/game-state.ts`**: `tapEquationForge(state, nowMs)` wired to the heat-tap system. `applyForgeSacrifice(state, sacrifices)` applies per-tier sacrifice mass → equation upgrade conversion at 10,000 mass per upgrade. `processLoomCapture(state, inputTierId, mass)` routes to loom conversion logic.
- **`src/render/forge/forge-renderer.ts`**: `drawForge` now accepts `heatTapCount` (0–3) and renders amber/orange/red heat rings around the forge visual.
- **`src/app/app-game-loop.ts`**: Callback `onEquationForgeCrunchCompleted` fires `applyForgeSacrifice`; `onParticleCapturedByLoom` fires `processLoomCapture`.
- **`src/app/app-actions.ts`**: `tap_equation_forge` action dispatches `tapEquationForge` and triggers visual feedback.
- **`src/input/input-handler.ts`**: Tapping on the forge area dispatches `tap_equation_forge`.

### Loom conversion economy
- **`src/sim/looms/loom-state.ts`**: `LoomTierState` extended with `conversionProgress` and `conversionEfficiencyLevel`. New functions: `getLoomInputTierId` (returns previous tier or null for sand), `getLoomConversionCost` (base 100, reduces 6% per efficiency level, min 25%), `applyLoomCapture` (conversion formula with fractional progress), `tryUpgradeLoomEfficiency` (spend own-tier motes for efficiency levels).
- **`src/ui/panels/loom-upgrades-pane.ts`**: Shows input tier ("Attracts: 2x2+ Sand particles"), conversion rate ("100 Sand → 1 Quartz"), progress bar toward next output mote, efficiency level + upgrade button.

### Particle capture fields
- **`src/render/particles/forge-field-forces.ts`** (new): `ForgeFieldInfo` type + `applyForgeFieldForces` function. Particles ≥ sizeIndex 1 inside the outer radius receive gentle attraction; inside the capture radius they are marked `isCaptured`. Loom captures are queued for immediate conversion. Forge captures only happen while `crunchState.isActive`.
- **`src/render/particles/particle-types.ts`**: `EquatoriaParticle` extended with `isCaptured`, `capturedById`, `particleId`.
- **`src/render/particles/particle-pool.ts`**: Particle pool initializes the new fields including a monotonically increasing `particleId` counter.
- **`src/render/particles/particle-system.ts`**: `setForgeFields(fields)` stores fields; update loop calls `applyForgeFieldForces` after Particle Life forces; captured particles are excluded from subsequent PL force passes; callbacks `onParticleCapturedByLoom` and `onEquationForgeCrunchCompleted` wired; `completeForgeCrunchCallback` applies sacrifices and removes forge-captured particles.
- **`src/render/particles/particle-physics.ts`**: Captured particles skip forge-attraction forces (they are frozen until crunch completes).
- **`src/render/particles/particle-life.ts`**: Captured particles skip Particle Life pairwise force computation.
- **`src/app/app-game-loop.ts`**: Builds `ForgeFieldInfo[]` each frame — equation forge field + per-unlocked-loom fields positioned at loom output tier generator position.

### Save/load
- **`src/settings/save-load.ts`**: SAVE_VERSION bumped to 23. Saves `forge.heatTapCount`, `forge.sacrificeProgressByTierId`; per-loom `conversionProgress` and `conversionEfficiencyLevel`. Backward-compatible defaults (0 / empty map) for older saves.

## Known incomplete / next steps

### Equation forge crunch pathway
- **No dedicated in-game visual for sacrifice feedback**: When a crunch fires, the particles are removed but there is no separate particle burst or flash effect at the forge. A brief shockwave/flash at the forge on crunch would improve feedback.
- ~~**Heat indicator in UI panel**~~ ✅ **Done (Build #25)**: `equation-panel.ts` now shows a `forge-heat-row` with colored ● dots and a `(n/3)` count below the equation display whenever `heatTapCount > 0`.
- **Forge tap input boundary**: The tap-on-forge detection in `input-handler.ts` uses a radius check; on small phones this may be hard to hit. Consider expanding the tap area.

### Loom conversion economy
- ~~**Old passive production coexists with new capture economy**~~ ✅ **Done (Build #25)**: Non-sand looms now produce passive motes at 10% of their normal rate. Sand loom retains 100% passive rate (no input tier). This makes particle capture the dominant economy path for higher tiers while keeping a small passive floor for idle sessions.
- **Sand Loom**: Has no input tier and produces sand passively. Particle capture does not apply. Correct by design.
- ~~**Loom field visual**~~ ✅ **Done (Build #25)**: `drawLoomFieldAuras()` in `forge-renderer.ts` draws a faint pulsing colored inner ring (capture zone) and outer dashed ring (attraction zone) around each unlocked loom field, called in `app-game-loop.ts` between generators and forge draw.
- **Loom efficiency upgrades not tested end-to-end**: The efficiency upgrade logic is wired but the UI dispatch (`upgrade_loom_efficiency` action) was not confirmed working in a live build. Verify the button in the Loom pane properly deducts motes and increments efficiency level.
- ~~**Balance values need playtesting (initial estimates)**~~ ✅ **Adjusted (Build #25)**: Conversion threshold lowered 100→50 (more achievable early); efficiency cost scaling changed from 5ˣ→3ˣ; sacrifice threshold lowered 10,000→2,000 (≈20 medium-particle captures). These remain estimates — further tuning after playtesting is expected.

### Architecture / code quality
- **`completeForgeCrunchCallback` inside particle-system.ts**: The forge crunch completion currently uses the legacy `completeForgeCrunch` function that was designed for the old spawn-a-replacement particle pathway. The new path should skip spawning output particles and instead fire `onEquationForgeCrunchCompleted`. Verify this was handled cleanly (check `particle-forge.ts`).
- **`particle-forge.ts` legacy path**: `completeForgeCrunch` still spawns replacement particles using `getCrunchOutput`. This may conflict with the new sacrifice-based pathway if not guarded. Ensure forge-crunch particles marked `isForgeCrunchParticle` are sacrificed rather than converted.
- **`ForgeFieldInfo[]` rebuild cost**: The array is rebuilt each frame but does not allocate new objects for loom fields (pushed into a fixed buffer). Verify this is efficient with many unlocked looms.
- **Per-frame spatial pass**: `applyForgeFieldForces` iterates all particles × all fields. With 13 tiers unlocked and 2000 particles, this is ~26000 comparisons per substep. Use early exits and dist² checks to keep this fast.
- **Tests**: No automated tests exist for the new forge/loom logic. Unit tests for `tapForgeHeat`, `applyForgeSacrifice`, `applyLoomCapture`, and `getLoomInputTierId` should be added.

### UI Polish
- ~~**Equation forge heat state not shown in DOM UI**~~ ✅ **Done (Build #25)**: See heat indicator note above.
- **Loom conversion progress bar styling**: The progress bar HTML in `loom-upgrades-pane.ts` uses inline styles. Extract to CSS classes for consistency.
- **No audio events for loom conversion**: When a particle is consumed by a loom, there is no sound cue. Consider reusing the merge sound at low volume.

### Balance
- ~~Sacrifice threshold of 10,000~~: Lowered to 2,000 (Build #25). Further tuning needed.
- ~~Loom conversion base cost of 100~~: Lowered to 50 (Build #25). Further tuning needed.
- ~~Efficiency upgrade cost scaling (50 × 5^level)~~: Changed to 50 × 3^level (Build #25). Further tuning needed.
- ~~Passive loom production and particle capture felt disjointed~~: Non-sand passive production reduced to 10% (Build #25). Unified economy pass still recommended after more playtesting.
