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

## Known incomplete / next steps

### Equation forge crunch pathway
- **No dedicated in-game visual for sacrifice feedback**: When a crunch fires, the particles are removed but there is no separate particle burst or flash effect at the forge. A brief shockwave/flash at the forge on crunch would improve feedback.
- **Heat indicator in UI panel**: `drawForge` renders heat rings on the canvas, but there is no DOM text label showing "0/3", "1/3", "2/3" in the equation sub-panel. This should be added to `src/ui/panels/equation-panel.ts` (or equivalent).
- **Forge tap input boundary**: The tap-on-forge detection in `input-handler.ts` uses a radius check; on small phones this may be hard to hit. Consider expanding the tap area.

### Loom conversion economy
- **Old passive production coexists with new capture economy**: `tickLooms` still runs and generates passive motes in addition to particle conversion motes. This was intentional for backward compatibility but may need rebalancing — either remove passive production from higher-tier looms or adjust rates significantly.
- **Sand Loom**: Has no input tier and produces sand passively. Particle capture does not apply. Correct by design.
- **Loom field visual**: There is no visual indicator on the canvas showing which generator circle is a loom field. A faint colored aura ring around unlocked non-sand loom positions (drawn in forge-renderer or a new loom-field-renderer.ts) would help players see the attraction zones.
- **Loom efficiency upgrades not tested end-to-end**: The efficiency upgrade logic is wired but the UI dispatch (`upgrade_loom_efficiency` action) was not confirmed working in a live build. Verify the button in the Loom pane properly deducts motes and increments efficiency level.
- **Balance values need playtesting**: `baseInputCostPerOutput = 100`, `minCostRatio = 0.25`, `0.94 per efficiency level`, efficiency upgrade cost `50 * 3^level` — all are initial estimates.

### Architecture / code quality
- **`completeForgeCrunchCallback` inside particle-system.ts**: The forge crunch completion currently uses the legacy `completeForgeCrunch` function that was designed for the old spawn-a-replacement particle pathway. The new path should skip spawning output particles and instead fire `onEquationForgeCrunchCompleted`. Verify this was handled cleanly (check `particle-forge.ts`).
- **`particle-forge.ts` legacy path**: `completeForgeCrunch` still spawns replacement particles using `getCrunchOutput`. This may conflict with the new sacrifice-based pathway if not guarded. Ensure forge-crunch particles marked `isForgeCrunchParticle` are sacrificed rather than converted.
- **`ForgeFieldInfo[]` rebuild cost**: The array is rebuilt each frame but does not allocate new objects for loom fields (pushed into a fixed buffer). Verify this is efficient with many unlocked looms.
- **Per-frame spatial pass**: `applyForgeFieldForces` iterates all particles × all fields. With 13 tiers unlocked and 2000 particles, this is ~26000 comparisons per substep. Use early exits and dist² checks to keep this fast.
- **Tests**: No automated tests exist for the new forge/loom logic. Unit tests for `tapForgeHeat`, `applyForgeSacrifice`, `applyLoomCapture`, and `getLoomInputTierId` should be added.

### UI Polish
- **Equation forge heat state not shown in DOM UI**: Only the canvas shows heat rings. Add a DOM element in the Equation sub-panel showing "Forge: tap 0/3 / 1/3 / 2/3 / CRUNCH!" 
- **Loom conversion progress bar styling**: The progress bar HTML in `loom-upgrades-pane.ts` uses inline styles. Extract to CSS classes for consistency.
- **No audio events for loom conversion**: When a particle is consumed by a loom, there is no sound cue. Consider reusing the merge sound at low volume.

### Balance
- Sacrifice threshold of 10,000 mass per equation upgrade tier may be too high or too low — needs playtesting.
- Loom conversion base cost of 100 small-equivalents per output mote needs playtesting.
- Efficiency upgrade cost scaling (50 × 3^level) needs playtesting.
- The interaction between passive loom production and particle capture may make looms feel disjointed — a unified design pass is needed.
