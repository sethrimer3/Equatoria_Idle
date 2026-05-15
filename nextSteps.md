# Next Steps — Equatoria Idle

Current build: **#27**

---

## Build History Summary

### Build #4 — AlivenParticle enemy system
Implemented the full AlivenParticle swarm-enemy system: 7 variants (spark_cluster, shard_bloom, ember_drift, dasher, ghost, pulser, healer, splitter, spitter, orbiter), per-group lifecycle, specials, ghost phase, trails, and initial draw.

### Build #11 — Balance Forecast dev panel
Implemented the dev-only ⚖ Balance Forecast panel (Settings tab, dev mode). Static ETA analysis, fresh-run milestone simulation, four strategy comparisons (wait_only / cheapest_first / best_efficiency / rush_next_tier), and pacing warnings.

### Build #24 — Forge/Loom capture economy
3-tap heat system for the equation forge (`ForgeCrunchState`, `tapForgeHeat`), sacrifice pathway (`applyForgeSacrifice` at 10,000 mass/upgrade), loom capture conversion (`applyLoomCapture`, `getLoomInputTierId`, `tryUpgradeLoomEfficiency`), `ForgeFieldInfo`/`applyForgeFieldForces`, particle `isCaptured` field, save-version 23.

### Build #25 — Economy balance pass + polish
Lowered sacrifice threshold (10,000→2,000), loom conversion cost (100→50), efficiency scaling (5ˣ→3ˣ); non-sand looms now produce 10% passive motes. Added forge heat UI row, loom field aura visuals.

### Build #26 — Forge/Loom economy polish
- Verified and documented the forge sacrifice pathway vs legacy crunch pathway (no conflict).
- Fixed loom efficiency button showing wrong tier's mote balance.
- Added forge sacrifice flash (`drawForgeSacrificeFlash`, 600ms shockwave ring).
- Expanded forge tap radius for touch input (1.5× via `isTouchInput` flag).
- Added loom capture audio feedback (400ms cooldown gate on `onMotesMerged`).
- Cleaned loom button inline styles → CSS classes.
- Added Vitest; 18 unit tests for forge/loom economy logic.

### Build #27 — Aliven polish, architecture cleanup, forecast improvements
- **Removed** dead `tap_equation_forge` action type and no-op dispatch case.
- **Extracted** `FORGE_TOUCH_TAP_MULTIPLIER = 1.5` constant to `particle-config.ts`.
- **Aliven — overlap separation**: lightweight O(n²) repulsion pass (capped at `ALIVEN_SEPARATION_MAX_COUNT = 16`).
- **Aliven — pulser shockwave ring**: expanding ring visual for 350ms when pulser fires (`pulserFlashMs` on particle).
- **Aliven — splitter burst**: flash ring at split position for 300ms (`splitFlashMs/X/Y` on group).
- **Aliven — healer beam**: dashed faint line from healer to healed target for 280ms (`healBeamMs/TargetX/Y` on particle).
- **Aliven — centroid glow**: subtle glow behind the group centroid (proportional to health ratio).
- **Aliven — spitter bullet highlight**: white center dot on bullets for dodge readability.
- **Aliven — group health bar**: thin 22px bar above centroid showing aliveCount/targetCount.
- **Lucky mote fallback**: `trySpawnLuckyMote` now falls back to direct `TIER_BY_ID` lookup if `enemyTypeId` is not in `ENEMY_TYPE_TO_TIER` (handles Aliven groups using tier IDs directly). 6 new unit tests added.
- **Balance Forecast — cost-growth warnings**: `generatePacingWarnings` now flags loom upgrade cost jumps > `suspiciousCostGrowthMultiplier` (25×) between adjacent levels.
- **Balance Forecast — simulate from current state**: toggle checkbox in the panel; when checked, strategy runs start from the player's current resources/unlocks instead of a fresh run.

---

## Current Remaining Work

### Needs manual playtesting before claiming done
- Balance values: sacrifice threshold (2,000), loom conversion base cost (50), efficiency scaling (3ˣ), 10% passive non-sand production rate. These are initial estimates; tune after real playtesting.
- **Forge 3-tap heat sequence**: does the heat UI row feel responsive? Is 3 taps the right number?
- **Forge capture and sacrifice flash timing**: does the 600ms shockwave feel satisfying?
- **Loom capture audio cooldown**: does 400ms cooldown feel right at various particle densities?
- **Loom efficiency upgrade UX**: verify the button deducts the correct tier's motes and the UI reflects it correctly.
- **Early game conversion pacing**: with a fresh save, does the sand→quartz loom feel achievable?
- **Non-sand 10% passive production feel**: does non-sand progression feel too slow without active captures?
- **Aliven group readability with new visuals**: healer beam, pulser ring, splitter burst — are they legible and not cluttered?
- **Aliven performance with many groups**: check mobile frame rate when 5+ groups are alive simultaneously.

### Architecture / code quality
- **`AlivenUpdateCtx.playerIFramesMs`** — currently read-only; a setter would enable i-frames from spitter bullet hits (not just contact damage). Low priority.
- **Hand-authored wave appearances**: consider introducing Aliven variants one-at-a-time across early waves rather than procedurally from `firstWave`.
- **Global Aliven group cap**: stress-test with >15 concurrent groups on mobile; add a cap if needed.
- **`applyForgeFieldForces` spatial pass**: with 13 tiers unlocked and 2000 particles this is ~26k comparisons/substep — verify performance on low-end devices.

### Balance Forecast — still deferred
- **RPG milestone simulation**: the engine cannot simulate RPG combat loop (wave/XP progression). Add a stub DPS model if needed.
- **Auto-tap upgrades in forecast**: no auto-tap upgrade definitions exist in the catalog yet; the forecast cannot include them until definitions are added.
- **Timeline visualization**: a canvas/SVG chart of the strategy curves would help; deferred until the panel stabilises.

### Aliven — remaining polish
- **Enemy indicator integration** (Priority 3H): The `rpg-enemies-tab-icons.ts` system draws icons for off-screen enemies. Extending it for Aliven variants requires adding `createAlivenIconCanvas` calls per variant and wiring them into the indicator sweep. Non-trivial; left for a dedicated pass.
  - Files to change: `src/ui/panels/rpg-enemies-tab-icons.ts`, `src/render/rpg/rpg-aliven-draw.ts`, indicator spawning in `rpg-wave-manager.ts`.
- **Aliven balance pass**: `hpBase`, `atkBase`, `xpMult`, `specialCdMin/Max` values are starting points — needs real playtesting.

---

## Manual Playtesting Checklist

Use this when doing a manual playtesting session. Check off what you tested.

### Forge
- [ ] Forge 3-tap heat sequence: tapping three times triggers crunch (particles captured, sacrifice flash shown)
- [ ] Forge tap on mobile: is the touch hit area large enough?
- [ ] Forge sacrifice flash: 600ms shockwave ring visible and feels satisfying
- [ ] Forge heat UI row (equation panel): shows ● dots and count, disappears after crunch

### Looms
- [ ] Loom capture: particles sucked into loom, progress bar increments toward output mote
- [ ] Loom audio cooldown: a sound plays when particles are captured; not overwhelming
- [ ] Loom efficiency upgrade: button shows correct tier mote cost; pressing deducts and increments level
- [ ] Loom conversion threshold drops with efficiency upgrades
- [ ] Non-sand passive production: Quartz+ looms trickle motes slowly even without captures

### Aliven Enemies
- [ ] Overlap separation: alive particles within a group stay visually separated (not piled up)
- [ ] Pulser ring visual: a ring expands outward when a pulser fires its shockwave
- [ ] Splitter burst: a brief flash ring appears at the particle position when a splitter dies and splits
- [ ] Healer beam: a faint dashed line connects healer to the particle it just healed
- [ ] Centroid glow: a subtle ambient glow is visible around the group center
- [ ] Spitter bullets: bullets have a bright white center highlight; clearly distinct from the spitter body
- [ ] Group health bar: thin bar above centroid shows alive/total ratio; disappears when group dies
- [ ] Performance: frame rate stable with 3+ Aliven groups alive simultaneously on a mid-tier device

### General
- [ ] Save/load: existing save (v23+) loads without errors or lost progress
- [ ] Desktop mouse: forge tap, loom interaction, equation tap all work with mouse
- [ ] Mobile touch: same flows work on a real phone (portrait and landscape)
- [ ] Tab switching: switching between Equation / Resources / Settings preserves all UI state
- [ ] Settings persistence: dev mode, visual options, sound volume all persist across reload

---

## Balance Forecast Panel Reference

Accessible only in dev mode (Settings → Developer Mode ON).

| File | Purpose |
|---|---|
| `balance-forecast-types.ts` | Shared types, `formatDuration`, warning thresholds |
| `balance-forecast-engine.ts` | Core analysis/simulation engine |
| `balance-forecast-panel.ts` | DOM panel rendering |
| `balance-forecast-sim.ts` | Strategy simulation runner |
| `balance-forecast-state.ts` | SimState, `createFreshSimState`, `simStateFromGame` |
| `balance-forecast-purchases.ts` | Available-purchase enumeration |
| `balance-forecast-strategies.ts` | Strategy function definitions |

**"Simulate from current state" toggle**: when checked, the Strategy Comparison table starts from your current resources/unlocks rather than a fresh game. Useful for planning which strategy would be most efficient from your current position.

**Cost-growth warnings**: the pacing warnings section now includes flags when adjacent loom upgrade costs jump by more than 25× (configurable via `BALANCE_WARNING_THRESHOLDS.suspiciousCostGrowthMultiplier`).
