# Next Steps — Equatoria Idle

Current build: **#29**

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

### Build #28 — Aliven indicator, wave pacing, group cap, performance
- **Aliven i-frame interface**: added `setPlayerIFramesMs(ms)` to `AlivenUpdateCtx` interface and wired the setter in `rpg-render.ts`. Spitter bullet hits already granted i-frames via `dealContactDamageToPlayer`; the setter makes the contract explicit and enables future callers to grant i-frames without triggering damage.
- **Aliven indicator integration**: `drawEnemyIndicators` now accepts an `alivenGroups` parameter and draws a tier-colored marker at each living group's centroid. Updated call site in `rpg-render-draw.ts`.
- **Hand-authored early Aliven wave appearances**: added Aliven spawns to `WAVE_DEFINITIONS` waves 2–25, introducing variants one at a time:
  - Wave 2–4: `aliven_spark_cluster` (spitter swarm, first encounter)
  - Wave 5–6: `aliven_quartz_ghost` (ghost/invulnerability mechanic)
  - Wave 7–10: `aliven_shard_bloom` (dasher aggression)
  - Wave 12–13: `aliven_pulse_swarm` (AoE shockwave mechanic)
  - Wave 15–16: `aliven_ember_ring` (trail-emitting movement reading)
  - Wave 18–19: `aliven_void_splinters` (splitter death cascade)
  - Wave 22–23: `aliven_healer_nodes` (teach prioritising healers)
  - Waves 24–25: mixed spark_cluster / void_splinters (combined challenge)
  - Procedural generator (wave 26+) continues to mix all unlocked variants.
- **Global Aliven group cap**: added `MAX_ACTIVE_ALIVEN_GROUPS = 8` to `rpg-aliven-constants.ts`; `spawnEnemyById` skips the spawn if the cap is reached, protecting mobile performance.
- **`applyForgeFieldForces` optimization**: pre-computed per-field squared radii and forge-check flags outside the particle loop; switched inner-loop distance comparison to squared-distance to avoid `Math.sqrt` for most particles.

### Build #29 — Dev playtesting panel, auto-tap upgrades, SVG forecast timeline
- **Dev playtesting panel** (`src/ui/panels/dev-panel.ts`): added a new "🔬 Playtesting Tools" section in Settings (visible only when Developer Mode is on):
  - RPG wave-jump buttons for waves 2, 5, 8, 12, 15, 18, 22, 25, 26.
  - Aliven spawn controls: per-variant spawn buttons, spawn-cap-count (8 groups) bulk button, clear-all button, live active group count display.
  - Forge state snapshot: heat tap count, crunch active flag, sacrifice progress per tier.
  - Loom state table: level, efficiency level, conversion progress, and special-purchased status for each unlocked loom.
  - Aliven balance validation table: hpBase, atkBase, xpMult, particleCount, specialKind, cooldown range for every variant; warns on bad constants (negative HP/ATK/XP, specialCdMin > specialCdMax).
- **Dev hooks wiring**: `RpgRender` gained `devSpawnAliven(variantId)`, `devClearAliven()`, `getAlivenGroupCount()`; `SettingsPanel` gained `registerDevHooks(hooks)`; game-app.ts wires hooks immediately after rpgRender is created.
- **Auto-tap upgrade** (`upgrade-catalog.ts`): added `AUTO_TAP_UPGRADE` (`id: 'auto_tap_speed'`, `tierId: 'sand'`, `baseCost: 50`, `costScaleFactor: 3`, `maxLevel: 13`). Level 1 unlocks auto-tap at 5 000 ms; each subsequent level reduces the interval by 400 ms down to the 200 ms hard floor. Compatible with existing saves (no prior catalog entry, so autoTapLevel was always 0). Balance Forecast picks it up automatically via `ALL_UPGRADES`.
- **Balance Forecast — SVG strategy timeline**: added `renderStrategyTimeline` function and a "📈 Strategy Timeline (Approximate)" section below the Strategy Comparison table. Renders each milestone as a dot on a shared time axis, one color per strategy. Tooltips show exact time. No extra dependencies.

---

## Current Remaining Work

### Needs manual playtesting before claiming done
- Balance values: sacrifice threshold (2,000), loom conversion base cost (50), efficiency scaling (3ˣ), 10% passive non-sand production rate. Needs real playtesting.
- **Auto-tap upgrade feel**: first level at 50 sand motes, scaling by 3× per level — does the pacing feel right? Is 13 levels the right depth?
- **Forge 3-tap heat sequence**: does the heat UI row feel responsive? Is 3 taps the right number?
- **Forge capture and sacrifice flash timing**: does the 600ms shockwave feel satisfying?
- **Loom capture audio cooldown**: does 400ms cooldown feel right at various particle densities?
- **Loom efficiency upgrade UX**: verify the button deducts the correct tier's motes and the UI reflects it correctly.
- **Early game conversion pacing**: with a fresh save, does the sand→quartz loom feel achievable?
- **Non-sand 10% passive production feel**: does non-sand progression feel too slow without active captures?
- **Aliven group readability with new visuals**: healer beam, pulser ring, splitter burst — are they legible and not cluttered?
- **Aliven early wave pacing**: play waves 2–25 and verify each variant introduction feels readable and not overwhelming.
- **Aliven performance**: verify frame rate stays stable when 8 groups (the cap) are alive simultaneously on a mid-tier device. Use the dev panel "Spawn 8" button to test.
- **Aliven indicator markers**: verify tier-colored markers appear for Aliven group centroids (requires playing to wave 2+).
- **Aliven balance values**: `hpBase`, `atkBase`, `xpMult`, `specialCdMin/Max` values are starting points — needs real playtesting. Use the dev panel's Aliven Balance Table for reference.

### Balance Forecast — still deferred
- **RPG milestone simulation**: the engine cannot simulate RPG combat loop (wave/XP progression). A stub DPS model needs: player base DPS from playerStats, enemy HP formula per wave tier, XP per kill constant, and how wave-boost multiplier grows. Once those numbers stabilise, add a labeled "RPG estimate" section to balance-forecast-engine.ts.
- **Timeline chart enhancements**: the SVG timeline renders dots but has no click-through or zoom. If axis labelling is hard to read at high milestone counts, consider collapsing rows to category headers.

### Telemetry (not yet implemented)
Session-counters for forge crunches, mass sacrificed by tier, loom captures by tier, Aliven spawns/kills by variant were noted as useful for balancing (Priority 2 in the original spec) but are not yet tracked. The dev panel currently shows current state, not session totals. Tracking these requires incrementing counters at call sites (`startEquationForgeCrunch`, `applyLoomCapture`, `removeDeadEnemiesImpl`). Consider adding them when balance questions become concrete enough to need data.

---

## Manual Playtesting Checklist

Use this when doing a manual playtesting session. Check off what you tested.

### Dev Panel
- [ ] "🔬 Playtesting Tools" section appears in Settings only when Developer Mode is on
- [ ] Wave-jump buttons (W2 … W26) teleport the RPG to the correct wave
- [ ] Aliven spawn buttons add the correct variant; count display updates
- [ ] Spawn-8 button adds up to 8 groups (capped); cap does not overflow
- [ ] Clear Aliven button removes all active groups
- [ ] Forge state shows correct heat tap count and crunch active flag
- [ ] Loom table shows correct level and conversion progress per tier
- [ ] Aliven balance table shows all 7 variants with no unexpected warnings

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

### Auto-Tap Upgrade
- [ ] "Auto-Tap Speed" upgrade appears in the upgrades panel when sand motes ≥ 50
- [ ] Buying level 1 enables auto-tap at 5 000 ms interval (visible from equation timer)
- [ ] Each subsequent level reduces interval by 400 ms
- [ ] At level 13, auto-tap interval is at the 200 ms hard floor and the upgrade is maxed

### Aliven Enemies
- [ ] Wave 2 introduction: a `spark_cluster` group appears after the laser/quartz enemies — player can learn the swarm pattern
- [ ] Wave 5 introduction: a `quartz_ghost` group appears — ghost invulnerability is readable
- [ ] Wave 8 introduction: a `shard_bloom` group appears — dasher aggression is distinct from earlier variants
- [ ] Wave 12 introduction: a `pulse_swarm` group appears — AoE shockwave ring is visible and communicates range
- [ ] Wave 15 introduction: an `ember_ring` group appears — trail patterns are visible
- [ ] Wave 18 introduction: a `void_splinters` group appears — splitter burst visual fires on death
- [ ] Wave 22 introduction: a `healer_nodes` group appears — healer beam draws attention to the healer particle
- [ ] Overlap separation: alive particles within a group stay visually separated (not piled up)
- [ ] Pulser ring visual: a ring expands outward when a pulser fires its shockwave
- [ ] Splitter burst: a brief flash ring appears at the particle position when a splitter dies and splits
- [ ] Healer beam: a faint dashed line connects healer to the particle it just healed
- [ ] Group cap: when 8 groups are alive, no new groups spawn (wave 26+ procedural)
- [ ] Performance: frame rate stable with 8 Aliven groups alive simultaneously on a mid-tier device

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
| `balance-forecast-panel.ts` | DOM panel rendering (includes SVG timeline) |
| `balance-forecast-sim.ts` | Strategy simulation runner |
| `balance-forecast-state.ts` | SimState, `createFreshSimState`, `simStateFromGame` |
| `balance-forecast-purchases.ts` | Available-purchase enumeration |
| `balance-forecast-strategies.ts` | Strategy function definitions |

**"Simulate from current state" toggle**: when checked, the Strategy Comparison table starts from your current resources/unlocks rather than a fresh game. Useful for planning which strategy would be most efficient from your current position.

**Cost-growth warnings**: the pacing warnings section now includes flags when adjacent loom upgrade costs jump by more than 25× (configurable via `BALANCE_WARNING_THRESHOLDS.suspiciousCostGrowthMultiplier`).

**SVG strategy timeline**: a simple dot-chart below the Strategy Comparison table showing when each milestone is reached per strategy. Hover a dot to see the exact time. No zoom or interactivity beyond tooltips.
