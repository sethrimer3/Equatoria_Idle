# Equatoria Idle — File Index

## Root

- `index.html` — Entry point HTML, loads styles and main.ts
- `vite.config.ts` — Vite build configuration
- `tsconfig.json` — TypeScript compiler configuration
- `package.json` — Dependencies and scripts
- `idle_progression_spreadsheet_guide.md` — Consolidated formulas/constants for modeling idle pacing in spreadsheets.

## src/

### src/main.ts
- Entry point. Boots the app when DOM is ready.

### src/styles.css
- Import barrel for all CSS. Re-imports from `src/styles/` sub-files.

### src/styles/base.css
- CSS reset, `:root` variables, `@font-face`, `#app` layout.

### src/styles/canvas.css
- Background animation canvas, vermiculate canvas, `#canvas-container`, `#game-canvas`.
- `#rpg-container` — flex-centred container for the RPG canvas (height excludes stats panel + tab bar).
- `#rpg-canvas` — fixed `aspect-ratio: 320/568` with `max-width/max-height: 100%` for uniform letterbox/pillarbox scaling on desktop; no independent X/Y stretch.
- `#rpg-stats-panel` — DOM stats panel (3×tab-height) above the navigation bar, with `.rpg-stat`, `.rpg-stat-label`, `.rpg-stat-value` child classes.

### src/styles/panels.css
- `#panels-container` overlay, panel base, upgrade buttons, resource rows, settings controls, credits.

### src/styles/tabs.css
- `.tab-bar`, `.tab-btn`, active/inactive states.

### src/styles/components.css
- Loading screen, loom cards, equation display (locked/unlocked), achievement cards.

### src/styles/idle-overlay.css
- Styles for the idle/offline reward overlay (`.idle-overlay`, `.idle-overlay__card`, tier rows, animations).
- Uses CSS variables from `base.css`; `backdrop-filter: blur(4px)` guarded by `@supports`.

### src/styles/responsive.css
- `@media` queries for landscape and desktop wider layout.

### src/app/game-app.ts
- Slim application bootstrap (DOM setup, panel wiring, pointer listeners, resize handler).
- `startApp()` — creates systems and wires them via `app-actions` and `app-game-loop`.
- Delegates action handling to `app-actions.ts` and game loop to `app-game-loop.ts`.

### src/app/app-types.ts
- `AppState` and `UIPanels` interfaces shared by app modules.

### src/app/app-actions.ts
- `handleAction()` — central action dispatcher.
- `setActiveTab()` — panel visibility switching; also calls `rpgRender.setActive()` and `rpgRender.resize()` when the RPG tab is activated so the letterbox layout is correct immediately.
- `updateVisiblePanels()` — refreshes the currently active panel.

### src/app/app-game-loop.ts
- `createGameLoop()` factory — creates the frame-by-frame game loop.
- `GameLoopContext` interface — all dependencies injected.
- Loop: sim tick → particle update → background → render → UI update → auto-save.

### src/data/tiers/tier-definitions.ts
- Single source of truth for all 11 gemstone tiers (Sand through Nullstone).
- Exports `TIERS`, `TIER_BY_ID`, `VISIBLE_TIERS`, `VISIBLE_TIER_COUNT`.

### src/data/looms/loom-definitions.ts
- Loom definitions for all 11 tiers — passive mote production configs.
- Each Loom: `tierId`, `displayName`, `description`, `baseRate`, `ratePerLevel`, `baseCost`, `costScaleFactor`.
- Exports `LOOM_DEFINITIONS`, `LOOM_BY_TIER`, `loomUpgradeCost()`, `loomProductionRate()`.

### src/data/equation/equation-tier-roles.ts
- Defines the mathematical role of each tier in the central equation using the slot-and-wrapper model.
- Each role: `tierId`, `role` (EquationRole), `interaction` (slot/wrapper/argument/foundation), `operator` (alias for role), `symbol`, `baseValue`, `valuePerLevel`.
- Slot tiers: Ruby (base_value), Sunstone (additive_slot), Citrine (multiplier_slot), Emerald (exponent_slot).
- Wrapper tiers: Sapphire (summation_wrap), Iolite (product_wrap), Amethyst (factorial_wrap), Diamond (integral_wrap), Nullstone (recursion_wrap).
- Special: Quartz (time_argument), Sand (foundation).
- Exports `EQUATION_TIER_ROLES`, `EQUATION_ROLE_BY_TIER`, `EquationRole`, `EquationInteraction`.

### src/data/particles/particle-config.ts
- All physics constants for particle simulation.
- Velocities, forces, gravity strengths, merge thresholds, forge parameters, shockwave parameters.
- Euler fluid constants are deprecated (replaced by Particle Life system).

### src/data/particles/interaction-matrix.ts
- 13×13 Particle Life interaction matrix.
- `createDefaultInteractionMatrix()` — hand-tuned defaults for emergent behaviour.
- `createRandomInteractionMatrix()` — random matrix for experimentation.
- `cloneInteractionMatrix()` — deep-clone helper.
- Serialization: `serializeInteractionMatrix()`, `deserializeInteractionMatrix()`.
- `MOTE_TYPE_COUNT = 13`.

### src/data/particles/particle-life-config.ts
- All constants for the Particle Life simulation.
- Radii: `PL_INTERACTION_RADIUS`, `PL_PROTECTED_RADIUS`.
- Force strengths: `PL_MATRIX_FORCE_SCALE`, `PL_PROTECTED_REPULSION_STRENGTH`.
- Velocity: `PL_VELOCITY_DAMPING`, `PL_MAX_VELOCITY`.
- Size-force bias default: `PL_ENABLE_SIZE_FORCE_BIAS_DEFAULT`.
- Grid cell size: `PL_GRID_CELL_SIZE`.

### src/data/particles/size-tiers.ts
- `SizeIndex` type (number, unlimited). Particle sizes 0, 1, 2, 3, …
- Each size is (sizeIndex + 1) virtual pixels wide/tall (1×1, 2×2, 3×3, …).
- 100 particles of size N combine into 1 of size N+1.
- Function-based helpers: `getSizeScaleMultiplier()`, `getSizeMinVelocityModifier()`, etc.
- Backward-compatible readonly arrays for sizes 0–3.

### src/data/upgrades/upgrade-types.ts
- `UpgradeDefinition` interface, `UpgradeEffectKind` type.
- `upgradeCostAtLevel()` — cost formula.

### src/data/upgrades/upgrade-catalog.ts
- All equation upgrade definitions aligned to equation tier roles/operators.
- Per-tier equation-part upgrades (Quartz → Nullstone), no global equation upgrades.
- Exports `ALL_UPGRADES`, `UPGRADE_BY_ID`.

### src/data/balance/balance-constants.ts
- Global tuning constants: tap values, costs, scaling, intervals, caps.
- `tierUnlockCost()` — cost to unlock next tier.
- `EQUATION_FORGE_COST` — Sand cost to unlock the Equation Forge (50).

### src/sim/looms/loom-state.ts
- Per-tier Loom state: level, isUnlocked, accumulatorMs.
- `createLoomState()` — Sand Loom starts unlocked at level 1.
- `tickLooms(state, deltaMs, productionBonus?)` — passive production tick; bonus multiplier applied to all rates.
- `upgradeLoom()`, `unlockLoom()`, `getLoom()`, `getLoomRate()`, `getLoomCost()`.

### src/sim/idle/idle-reward.ts
- Pure (no-side-effect) idle reward calculation.
- `IdleTierReward` interface — per-tier reward data (tierId, displayName, color, ratePerMinute, totalMotes, isUnlocked).
- `IdleRewardSummary` interface — full offline summary (minutesAway, equivalenceBefore/After/Gained, tierRewards[]).
- `calculateIdleRewards(game, elapsedMs)` — computes what was earned offline without mutating live state.

### src/sim/idle/apply-idle-rewards.ts
- `applyIdleRewards(game, summary)` — commits idle reward mote gains to the live game state.
- Integer motes are deposited at size-0 and cascade-merged (100 at size N → 1 at size N+1) before updating `moteTotals`; fractional motes are added directly.

### src/sim/equation/equation-state.ts
- Authoritative equation state: per-tier segments with levels and unlock flags.
- `isForgeUnlocked` — whether the Equation Forge is active.
- `createEquationState()`, `applyEquationUpgrade()`, `unlockTier()`, `incrementTapCount()`, `unlockForge()`.

### src/sim/equation/equation-logic.ts
- Re-export barrel for backward compatibility.
- Re-exports from `equation-tap.ts`, `equation-view.ts`, `equation-eval.ts`.

### src/sim/equation/equation-tap.ts
- `segmentTapValue()` — motes per tap for a single segment.
- `computeTapGains()` — per-tier mote gains for a single tap (skips Sand foundation tier).

### src/sim/equation/equation-view.ts
- `EquationTermView` interface — per-tier display data with `operator` field (EquationRole).
- `buildEquationView()` — generates `EquationTermView[]` for canvas and DOM rendering.
- `buildStructuredEquationHtml()` — builds nested equation HTML from inside out (slot/wrapper model).

### src/sim/equation/equation-eval.ts
- `computeEquationOutput()` — evaluates the structured equation for scoring. Pure function.

### src/sim/resources/resource-state.ts
- Authoritative mote totals per tier and lifetime totals.
- `addMotes()`, `spendMotes()`, `getMotes()`, `getTotalMotes()`.
- `getEquivalence()` — product of all non-zero per-tier mote totals (player's "Equivalence" score).
- `totalToSizeCounts(total)` — converts a float total to a `Map<SizeIndex, number>` in base-100 (Grain, Shard, Chunk, Mass, …). Used at save time and for display.
- `sizeCountsToTotal(counts)` — inverse of `totalToSizeCounts`; reconstructs the float total from size counts. Used at load time.

### src/sim/progression/progression-state.ts
- Upgrade levels, unlocked tier count, auto-tap level, global multiplier.
- `purchaseUpgrade()`, `getUpgradeCost()`, `canAffordUpgrade()`, `getAutoTapIntervalMs()`.

### src/sim/game-state.ts
- Aggregate game state combining equation, resources, progression, forge, Looms, achievements, and aliven.
- `tapEquation()` — multiplies gains by `achievements.tapMultiplierBonus`.
- `tryPurchaseUpgrade(state, id, bypassCost?)`, `tryUnlockNextTier(state, bypassCost?)`, `tryUnlockEquationForge(state, bypassCost?)`, `tryUpgradeLoom(state, tierId, bypassCost?)` — optional dev mode cost bypass.
- `tryAlivenMote(state, tierId, bypassCost?)` — spend 10,000 motes to aliven a mote type.
- `simTick()` — passes loom bonus from achievements; checks achievement unlock conditions each tick.

### src/sim/forge/forge-state.ts
- `ForgeCrunchState` interface and factory.
- `getForgeRotationMultiplier()` — spin speed multiplier based on crunch phase.

### src/sim/forge/forge-logic.ts
- Forge crunch lifecycle management.

### src/sim/particles/sim-particle-state.ts
- `SimParticleState` — inventory and unlocked tiers.

### src/sim/particles/generator-state.ts
- Generator ring positioning around the equation center.
- Fixed 11-slot circular layout with 160px radius for tiers 1–11 (Sand through Nullstone).
- **Fracteryl (12th tier)** placed directly above the forge at `GENERATOR_RADIUS_PX / 2` distance.
- **Eigenstein (13th tier)** placed directly below the forge at `GENERATOR_RADIUS_PX / 2` distance.
- `GENERATOR_RADIUS_PX` is now exported for use by other modules.

### src/sim/particles/merge-logic.ts
- `ActiveMergeInfo` — descriptor for in-progress particle merge.

### src/render/canvas/game-canvas.ts
- Canvas creation and lifecycle at 320px internal width.

### src/render/assets/asset-paths.ts
- Centralized asset path definitions (single source of truth).

### src/render/assets/asset-loader.ts
- Image loading utility with caching.

### src/render/assets/color-utils.ts
- Shared color parsing utilities for the render layer.
- `colorWithAlpha(color, alpha)` — converts `#RRGGBB` or `rgb()` strings to `rgba()`, used by generator and forge renderers.
- `parseHexToRgb(color)` — parses a hex color to a cached `[r, g, b]` tuple, used by particle renderers.
- Eliminates duplicate hex-parsing implementations previously found in `particle-renderer.ts`, `particle-grab-visual.ts`, `generator-renderer.ts`, and `forge-renderer.ts`.

### src/render/background/background-animation.ts
- Background animation player for 2402-frame WebP sequence.

### src/render/background/vermiculate-effect.ts
- Decorative background tracer effect (worm-line style, ported from Thero Chapter 1).

### src/render/background/substrate-effect.ts
- Decorative background crystalline crack effect (Substrate style, ported from Thero Shin Spire / Chapter 6).
- Exports `SubstrateEffect` interface and `createSubstrateEffect({ quality })` factory.
- Quality parameter ('low' | 'medium' | 'high') scales seed count, max fronts, and grain density.

### src/render/particles/particle-types.ts
- All shared particle system interfaces and type aliases.
- `EquatoriaParticle` — core particle interface with ring-buffer trail fields.
- `ActiveMerge`, `ProceduralMerge` — merge tracking types.
- `Shockwave` — visual shockwave effect type.
- `ParticleRenderOptions` — glow/trail toggle flags.

### src/render/particles/particle-pool.ts
- Particle object pool and lifecycle management.
- `ParticlePool` class — acquire/release with internal free list.
- `initParticle()` — initialises all particle fields on spawn.
- Pre-computed `TIER_INDEX_MAP` for O(1) tier index lookup.

### src/render/particles/particle-physics.ts
- Per-particle physics: gravity, veer, velocity clamping, bounce.
- `updateParticlePhysics()` — full per-particle physics step. Accepts `isForgeUnlocked` flag; forge attraction is skipped when the forge is not yet unlocked.
- `applyEdgeRepulsion()` — boundary push forces.
- `updateTrails()` / `clearTrails()` — ring-buffer trail management.
- `getTrailPosition()` — zero-allocation trail position reader.

### src/render/particles/particle-merge.ts
- Traditional merge at generators + procedural seek-merge.
- Fisher-Yates partial shuffle for O(k) random selection.
- Module-level reusable `Map` for grouping (avoids per-frame allocation).
- `attemptMerge()`, `processActiveMerges()`, `enforceParticleLimit()`.
- `attemptProceduralMerge()`, `updateProceduralMerges()`.

### src/render/particles/particle-forge.ts
- Forge crunch integration between sim-layer forge-logic and visual particles.
- `checkAndStartForgeCrunch()`, `completeForgeCrunch()`.

### src/render/particles/particle-shockwave.ts
- Shockwave expansion, fade, and spatial-grid force application.
- `updateShockwaves()`, `getShockwaveScaleForSize()`.

### src/render/particles/particle-renderer.ts
- Batched canvas rendering for trails, particles, and shockwaves.
- Numeric batch keys `(tierIndex << 8 | sizeIndex)`, Float64Array position buffers.
- `drawParticles()` — unified render function.
- `getParticleRendererAnimTimeMs()` — returns accumulated animation time for external sync.

### src/render/particles/particle-grab-visual.ts
- Grab-radius circle overlay and spinning comet orbs drawn when the player holds down on the canvas.
- `drawGrabVisual()` — draws a dashed circle at drag center, then one counterclockwise-spinning comet orb per unique tier of grabbed particles, with additive-blended trails.

### src/render/particles/spatial-grid.ts
- Numeric-keyed spatial hash grid for collision queries.
- `gridKey(cx, cy)` — exported shared key function (also used by `particle-life.ts` and `euler-fluid.ts`).
- `buildSpatialGrid()`, `forEachNearby()` — callback-based (no result array allocation).

### src/render/particles/particle-system.ts
- Slim orchestrator class.
- Owns particle array, merge/shockwave lists, pool, interaction matrix, aliven set, and debug state.
- Runs per-frame update pipeline: physics → trails → **Particle Life forces** → damping → wrap → merges → forge → shockwaves.
- `alivenedTierIndices` — `Set<number>` of tier indices that are alivened; synced from game state each frame by the game loop.
- `interactionMatrix` — 13×13 matrix owned here, defaults from `createDefaultInteractionMatrix()`.
- `enableSizeForceBias` — boolean toggle for size-based force scaling.
- `debugState` — `ParticleLifeDebugState` for debug visualization toggles.

### src/render/particles/particle-life.ts
- Particle Life pairwise force computation (replaces euler-fluid.ts).
- `applyParticleLifeForces(particles, matrix, alivenedTierIndices, ...)` — spatial-grid-based O(n·k) neighbour interaction.
  - 1×1 inert mote rule: skips size-1 particles entirely.
  - Non-alivened rule: skips particles whose tier is not in `alivenedTierIndices`.
  - Zone 1 (protected radius): strong repulsion prevents collapse.
  - Zone 2 (matrix-controlled): force from interactionMatrix[a][b] with cosine taper.
  - Optional size-force bias: `sqrt(sizeA) * sqrt(sizeB)` scaling.
  - Toroidal wrapped distance computation.
- `applyParticleLifeDamping()` — velocity damping + max speed clamp.
- `applyWrapAround()` — toroidal position wraparound.

### src/render/particles/particle-life-debug.ts
- Debug visualization tools for Particle Life system.
- `ParticleLifeDebugState` — toggleable debug flags.
- `drawParticleLifeDebug()` — entry point for all debug overlays.
- Sub-tools: interaction radius circles, spatial grid view, inert mote highlights, size factor labels, interaction matrix color overlay.

### src/render/equation/equation-renderer.ts
- `drawEquation()` — renders equation terms on canvas.
- `drawScore()` — score display at top.
- `drawTapHint()` — pulsing hint for new players.

### src/render/generators/generator-renderer.ts
- Generator sprite rendering with procedural fallback.
- All tiers now show a swirling arc effect (`drawRangeSwirl`) in their tier color at 75% of physics range.
- Previously only nullstone had the swirl; now generalized to all tiers via `colorWithAlpha` helper.
- `INFLUENCE_VISUAL_SCALE = 0.75` — visual range is 25% smaller than physics range.

### src/render/forge/forge-renderer.ts
- Forge sprite rendering with crunch animation overlay.
- Influence circle is now a bidirectional fire-color swirl at 75% of `MAX_FORGE_ATTRACTION_DISTANCE`.
- `FORGE_FIRE_COLORS` — seven fire gradient colors (`#FFB21A` → `#B7370A`).
- Two arc sets rotate clockwise and counter-clockwise simultaneously.

### src/render/rpg/rpg-render.ts
- Independent RPG canvas rendering system for the RPG tab.
- Fixed internal resolution: `INTERNAL_WIDTH = 320`, `INTERNAL_HEIGHT = 568` (portrait 9:16).  CSS `aspect-ratio` provides letterbox/pillarbox scaling so pixels are always uniform on desktop.
- **Player mote** — 3×3 sand-colored mote with touch joystick, WASD/Arrow key controls, always-on pulsing glow, smoothly-interpolated comet trail, and starting stats HP=100 ATK=10 DEF=5.
- **Movement glow smoothing** — `glowMovementIntensity` (0–1) LERP-ramps up (`GLOW_MOVE_RAMP_UP`) when moving and down (`GLOW_MOVE_RAMP_DOWN`) when stopped; gates trail and halo brightness.
- **Laser enemy** — 2×2 red mote with five-phase AI: `idle`, `decelerate`, `dash`, `overshoot`, `cooldown`.  Bezier lineDash attack-trail with draw/erase phases.
- **Wave system** — data-driven wave spawning via `getWaveDefinition()` from `src/data/rpg/wave-definitions.ts`.  Waves complete when spawn queue is empty and all enemies are dead; `INTER_WAVE_DELAY_MS` pause before next wave starts.  Updates `rpgSimState.highestWaveReached` in persistent sim state.
- **Death/restart loop** — `rpgPhase: RpgPhase` state machine (`alive` | `dying` | `restarting`).  Death triggers a `DEATH_BURST_COUNT`-particle radial burst, player fade-out, screen darken (over `DEATH_ANIM_DURATION_MS`), then a full `doRestart()`.  Restart performs a black-screen fade-in over `RESTART_FADE_IN_MS`.
- **Stats panel** — DOM `#rpg-stats-panel` with five widgets: HP / ATK / DEF / WAVE / BOOST (loom boost %).  Callers append to root and toggle display with the tab.
- **Equipment stats** — `applyEquipmentStats()` reads `rpgSimState.equippedWeaponId` and adds `WeaponDefinition.stats` bonuses when a weapon is equipped.
- Accepts `rpgSimState: RpgSimState` as second factory argument so it can mutate persistent wave progress directly.
- Exports `createRpgRender(container, rpgSimState)` factory and `RpgRender` interface.

### src/data/rpg/wave-definitions.ts
- `WaveSpawn` and `WaveDefinition` types.
- `WAVE_DEFINITIONS` — hand-authored waves 1–10 (laser enemy, increasing count and tighter delays).
- `getWaveDefinition(waveNumber)` — returns predefined definition or generates one procedurally for waves beyond 10.

### src/data/rpg/weapon-definitions.ts
- `WeaponStats` and `WeaponDefinition` types.
- `WEAPON_DEFINITIONS` — three initial weapons: Sand Blade, Ruby Lance, Sunstone Ward.
- `WEAPON_BY_ID` — O(1) lookup map.

### src/sim/rpg/rpg-state.ts
- `RpgSimState` interface — `highestWaveReached`, `purchasedWeaponIds` (Set), `equippedWeaponId`.
- `createRpgSimState()` — zero-state factory.
- `getWaveBoostMultiplier(state)` — returns loom production multiplier = 1 + (highestWave^1.2)/100.
- `formatWaveBoostPercent(state)` — returns display string like "+6.9%".

### src/ui/panels/weapon-store-panel.ts
- `WeaponStorePanel` interface and `createWeaponStorePanel(dispatch)` factory.
- Renders purchasable weapons from `WEAPON_DEFINITIONS` as cards.
- Shows affordability from ResourceState; dispatches `purchase_weapon` / `equip_weapon` actions.
- `update(rpgState, resources, numberFormat)` — refreshes card list.
- `setVisible(visible)` — toggles the overlay.

### src/render/ui/trace-effect.ts
- Fullscreen fixed canvas overlay for animated golden outline + tracing circles.
- `createTraceEffect(mountTarget)` — returns `TraceEffect` with `setEquationTargets()` and `setMatrixTarget()`.
- Used by equation-panel (upgrade hover) and loom-panel (matrix cell drag).
- Two small golden circles trace the perimeter of the outlined rect using `perimeterPoint()`.

### src/data/achievements/achievement-definitions.ts
- 11 achievement definitions for tiers sand through nullstone.
- Each achievement includes: id, `groupId`, displayName, description, requiresTierId, requiresLifetimeMotes, bonusKind, bonusMultiplier.
- Bonus kinds: `tap_multiplier` (×tap gains) or `loom_multiplier` (×loom production).
- Exports `ACHIEVEMENT_DEFINITIONS`, `ACHIEVEMENT_BY_ID`.

### src/data/achievements/achievement-groups.ts
- Canonical achievement category metadata used by the UI accordion.
- `ACHIEVEMENT_GROUPS` defines the 5 groups: Earthen, Blazing, Golden, Celestial, Secret.
- `ACHIEVEMENT_GROUP_BY_ID` provides quick lookup by group id.

### src/sim/achievements/achievement-state.ts
- `AchievementState` — set of unlocked achievement IDs plus cached bonus multipliers.
- `checkAndUnlockAchievements()` — checks lifetime motes for each tier and unlocks achievements.
- `recomputeBonuses()` — recalculates `tapMultiplierBonus` and `loomMultiplierBonus` from unlocked set.

### src/sim/aliven/aliven-state.ts
- Aliven system — tracks which mote types have been "alivened" (awakened for Particle Life).
- `AlivenState` — `{ alivenedTierIds: Set<TierId> }`.
- `ALIVEN_COST = 10_000` motes of own type per tier.
- `MAX_ALIVENEABLE_UNLOCK_ORDER = 10` (Nullstone is last; Fracteryl and Eigenstein cannot be alivened).
- `createAlivenState()`, `isTierAliveneable()`, `isAlivened()`, `canAffordAliven()`, `getAlivenCount()`.
- `getAlivenedTiersOrdered()` — returns alivened tier IDs sorted by unlock order (defines matrix row/col order).
- `tryAliven(state, resources, tierId, bypassCost?)` — deducts cost, adds tier to alivened set.

### src/input/input-handler.ts
- `GameAction` type: tap, purchase_upgrade, unlock_next_tier, unlock_equation_forge, upgrade_loom, aliven_mote, set_active_tab, save_game, reset_game.
- `TabId` type: 'equation' | 'looms' | 'resources' | 'achievements' | 'settings'.
- `setupInputListeners()` — pointer event → GameAction dispatch.

### src/input/particle-drag.ts
- Particle drag interaction state and handlers.

### src/ui/loading/loading-screen.ts
- Loading screen with company logo and fade-out transition.

### src/ui/tabs/tab-bar.ts
- Bottom tab bar: Equation / Looms / Tiers / Achievements / Settings.
- Adds the achievements-tab unclaimed indicator (golden sheen + sparkle orbs).
- `createTabBar()` — returns element plus `setActiveTab()` and `updateAchievementIndicator(state)`.
- Reuses `hasUnclaimedAchievements(state)` to keep tab indicator active whenever any earned achievement is unclaimed.

### src/ui/achievements/sparkle-shared.ts
- Shared sparkle constants matching Thero timings and drift/scale ranges.
- Exports `randomInRange()` utility used by both achievements panel and tab bar sparkle emitters.

### src/ui/panels/equation-panel.ts
- Equation tab content — the central Equation Forge panel.
- Before forge unlock: shows dormant locked forge state with description and unlock button (50 Sand).
- After forge unlock: shows the structured nested f(t) equation display + equation upgrades grouped by tier.
- `buildStructuredEquationHtml()` from sim layer generates the nested HTML.
- Hovering an equation upgrade highlights the corresponding tier's equation fragments with a golden glow.
- When a `TraceEffect` is provided, the golden outline + tracing circles appear over the highlighted spans.
- `createEquationPanel(dispatch, traceEffect?)` — optional trace effect parameter.

### src/ui/panels/loom-panel.ts
- Looms tab content with two sub-tabs: **Upgrades** and **Aliven**.
- **Upgrades sub-tab**: Shows a card per unlocked tier's Loom: name, description, level, production rate, upgrade button.
- **Aliven sub-tab**: For each of tiers 0–10 (Nullstone), shows aliven unlock button (cost: 10,000 own motes) or ✦ Alive badge.
  - Below unlock rows, shows the N×N interaction matrix for all currently alivened tiers.
  - Matrix colors: green for attraction (positive), red for repulsion (negative), neutral for zero.
  - Matrix is rebuilt only when aliven count changes (keyed by tier ID join string).
  - During a click-and-hold drag on a cell, a `TraceEffect` golden outline + tracer circles appear around the cell.
- `createLoomPanel(dispatch, traceEffect?)` — optional trace effect parameter.

### src/audio/

Audio system — eight focused modules:

- **`audio-paths.ts`** — All audio asset path constants, URL-encoded so spaces and `#` in filenames work with `fetch()`.
- **`audio-context.ts`** — Web Audio `AudioContext` singleton with Safari `webkitAudioContext` fallback and `resumeAudioContext()` helper.
- **`audio-loader.ts`** — `loadAudioBuffer(ctx, path)` — async fetch + `decodeAudioData` with in-flight deduplication and per-path caching. `preloadAudioBuffers()` for bulk warm-up.
- **`music-player.ts`** — `MusicPlayer` — shuffled 3-track playlist with 8-second Web Audio crossfades. Two alternating `GainNode` slots. Play order is fixed at startup (random once).
- **`ambiance-player.ts`** — `AmbiancePlayer` — looping `lowRumble.mp3` at −10 dB relative to SFX volume. Fades in/out (1 s) when the `equation` tab is entered/left.
- **`sfx-player.ts`** — `SfxPlayer` — single SFX, random-from-list, polyphony-limited (motes merging, max 2), forge charging fade-in/out.
- **`audio-system.ts`** — `AudioSystem` interface + `createAudioSystem(musicVolume, sfxVolume)` factory. No-op fallback when Web Audio API is unavailable.
- **`index.ts`** — Barrel: exports `AudioSystem`, `createAudioSystem`.

### src/data/particles/particle-config.ts
- Added `FORGE_SPIN_UP_THRESHOLD_MS` — named constant for the elapsed-ms threshold at which the forge spin-up animation begins.


- Tier progression panel (renamed from Upgrades).
- Contains only the tier unlock button for unlocking new gemstone tiers.
- Equation upgrades and forge unlock have moved to the Equation panel.

### src/ui/panels/achievements-panel.ts
- Achievements tab content.
- Renders grouped accordion categories with toggle rows (`icon + name + claimed/total`).
- Group and card sparkle emitters are managed with timer-backed emitter maps and cleaned up on hide/destroy.
- Unclaimed cards and group toggles use Thero-style golden shimmer + sparkle visuals.
- Exports `hasUnclaimedAchievements(state)` for tab-bar indicator logic.
- Includes a top-center queued golden reward text animation when claims are tapped.

### src/ui/panels/resource-panel.ts
- Per-tier mote display with refined gem icons.
- Shows total mote count, lifetime total, and per-size breakdown (Grain/Shard/Chunk/Mass/…) derived from `totalToSizeCounts`.

### src/ui/idle/idle-overlay.ts
- DOM overlay shown when the player returns after being away ≥ 1 minute.
- Lists Equivalence gained (always shown) and per-tier Mote gains (hidden if tier Loom is locked).
- Numbers animate from 0 to their target over ~600 ms (ease-out cubic via requestAnimationFrame).
- `IdleOverlay` interface — `{ element, show(summary), hide() }`.
- `createIdleOverlay()` — factory function; tap/click anywhere to dismiss.

### src/ui/panels/settings-panel.ts
- Settings controls: volume, particles, shake, developer mode toggle, save, reset, credits.

### src/settings/settings-state.ts
- User settings model and localStorage persistence.
- `isDevMode: boolean` — when true, all game actions bypass cost checks.
- `numberFormat: 'letters' | 'scientific' | 'engineering'` — controls number display format across all UI panels and canvas score.

### src/settings/save-load.ts
- Game state serialization/deserialization.
- Versioned save format (version 7): motes persisted as `moteSizeCounts` (base-100 per-size counts per tier). Backward-compatible with versions 1–6 (flat `moteTotals`).
- On load, size counts are decoded back to float totals; idle rewards are then applied at size-0 with cascade merging.

### src/settings/offline-time.ts
- Lightweight last-active timestamp helpers using a separate localStorage key (`equatoria_last_active`).
- `readLastActiveTimestamp()` — returns stored ms timestamp or null.
- `writeLastActiveTimestamp()` — writes `Date.now()` to the key; called on app start and on `visibilitychange` (hidden).

### src/util/format.ts
- `formatNumber()` — convenience wrapper, always uses 'letters' format.
- `formatNumberAs(n, format)` — format using 'letters' (K/M/B/T/Qa/Qi/Sx/Sp), 'scientific' (1.23e9), or 'engineering' (1.23×10⁹) notation.
- `NumberFormat` type — `'letters' | 'scientific' | 'engineering'`.

### src/util/particle-compression.ts
- `computeOutputCompression(rawRatePerSec)` — converts raw 1×1 production rate into the single highest-value particle size to emit and its per-second emit rate.
- Rule: `sizeIndex = floor(log(rawRate) / log(100))`; `emitRatePerSec = rawRate / 100^sizeIndex`.
- Returns `{ sizeIndex, emitRatePerSec, sizeLabel }`.
- Works for arbitrary sizes (not capped at 4×4).
- Used by `app-game-loop.ts` for per-frame loom particle emission.
