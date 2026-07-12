# Equatoria Idle — File Index

## Root

- `index.html` — Entry point HTML, loads styles and main.ts
- `vite.config.ts` — Vite build configuration; desktop mode uses a relative base path for Electron/local file loading while GitHub Actions keeps the repository Pages base path.
- `tsconfig.json` — TypeScript compiler configuration
- `package.json` — Dependencies and scripts, including Vite browser commands and Electron desktop launch commands.
- `electron/main.cjs` — Minimal Electron main process that disables Chromium GPU/sandbox startup paths, stores profile/cache data in `.electron-user-data`, logs desktop startup/crash diagnostics to `electron-runtime.log`, serves `dist` through the Electron-only `equatoria://app/` protocol with production CSP headers, supports an optional Vite dev-server CSP through `EQUATORIA_ELECTRON_DEV_SERVER`, and loads the renderer with context isolation, sandboxing, web security enabled, and Node integration disabled.
- `run-desktop.bat` — Windows double-click launcher: installs missing dependencies, builds the desktop output, starts Electron, and starts a delayed helper that hides the launcher console during normal play.
- `run-browser-dev.bat` — Windows double-click launcher for the Vite browser development server.
- `build-game.bat` — Windows double-click launcher for the normal production/static build.
- `ELECTRON.md` — Desktop launch, batch-file, save-profile, and missing-asset troubleshooting notes.
- `scripts/copy-assets.mjs` — Cross-platform postbuild helper that copies required runtime asset directories into `dist/ASSETS`.
- `scripts/hide-console-after-delay.ps1` — Windows launcher helper that waits one second, then hides the console window handle passed by `run-desktop.bat`.
- `idle_progression_spreadsheet_guide.md` — Consolidated formulas/constants for modeling idle pacing in spreadsheets.

## src/

### src/buildInfo.ts
- Single source of truth for the build number.
- Exports `BUILD_NUMBER` — increment by 1 with every PR/change.
- Imported by `settings-panel.ts` to display "Build #N" in the Settings tab footer.

### ASSETS/bossMidi/
- Boss-only MIDI pattern assets. Files are loaded by `rpg-boss-midi-runtime.ts`, parsed once, and copied into `dist/ASSETS/bossMidi` by `scripts/copy-assets.mjs`.

### src/main.ts
- Entry point. Boots the app when DOM is ready.

### src/styles.css
- Import barrel for all CSS. Re-imports from `src/styles/` sub-files.

### src/styles/base.css
- CSS reset, `:root` variables, `@font-face`, `#app` layout.

### src/styles/canvas.css
- Background animation canvas, vermiculate canvas, `#canvas-container`, `#game-area`, `#game-canvas`.
- `#canvas-container` — full-screen flex container that letterboxes / pillarboxes `#game-area`.
- `#game-area` — `position: relative` wrapper whose CSS size is set by `resizeCanvas()` to fill the container; children are `#game-canvas` and `#hud-overlay`.
- `#game-canvas.idle-canvas-pixelated` — *(build 193+)* class applied by `resizeCanvas` in pixelated mode; sets `image-rendering: pixelated` / `crisp-edges` so the low-res backing is scaled up with nearest-neighbor.
- `#rpg-container` — flex-centred container for the RPG canvas (height excludes stats panel + tab bar).
- `#rpg-canvas` — responsive RPG canvas; the render host expands to fill `#rpg-container`. Increasing the host's width or height reveals more visible RPG world rather than zooming in. A stable safe-core transform keeps the `RPG_LOGICAL_WIDTH × RPG_LOGICAL_HEIGHT` (360×640) world centred; extra space is live world area with real enemies, terrain, and effects.
- `#rpg-stats-panel` — DOM stats panel (3×tab-height) above the navigation bar, with `.rpg-stat`, `.rpg-stat-label`, `.rpg-stat-value` child classes.
- `.rpg-dps-widget` — compact square right-side RPG stats widget with per-equipped-weapon DPS rows, low/high axis labels, tracks, and animated colored bars.
- RPG developer visual overlays are dev-mode-gated and individually controlled from the RPG Menu tab; all default off.
- Ruby beam clipping uses the live RPG viewport in all directions; Verdure cave walls/nav-grid rebuild on material active-bound resize changes.

### src/styles/panels.css
- `#panels-container` overlay, panel base, upgrade buttons, resource rows, settings controls, credits.

### src/styles/tabs.css
- `.tab-bar`, `.tab-btn`, active/inactive states.
- `.tab-bar-decor` — top-layer menu outline sprite overlay; currently hidden while the tab buttons use direct gold strokes.
- Tab buttons use thin dark-gold separators, with a darker 2px active-tab stroke.

### src/styles/components.css
- Loading screen, loom cards, equation display (locked/unlocked), achievement cards.
- **Build 192+:** `.hud-equation-pixel-canvas` styles (`image-rendering: pixelated/crisp-edges`, `width: 100%`, `height: auto`) for the pixel equation canvas.

### src/styles/idle-overlay.css
- Styles for the idle/offline reward overlay (`.idle-overlay`, `.idle-overlay__card`, tier rows, animations).
- Uses CSS variables from `base.css`; `backdrop-filter: blur(4px)` guarded by `@supports`.

### src/styles/responsive.css
- `@media` queries for landscape and desktop wider layout.

### src/app/game-app.ts
- Slim application bootstrap (DOM setup, panel wiring, pointer listeners, resize handler).
- `startApp()` — creates systems and wires them via `app-actions` and `app-game-loop`.
- Delegates action handling to `app-actions.ts`, game loop to `app-game-loop.ts`, canvas pointer wiring to `game-app-canvas-input.ts`, and idle-reward eligibility checks to `game-app-idle.ts`.
- **Build 193+:** initialises `cc.idleCanvasRenderStyle` from persisted settings immediately after `createGameCanvas`; passes `onIdleCanvasRenderStyleChange` callback to `createSettingsPanel` that updates `cc.idleCanvasRenderStyle`, calls `resizeCanvas`, and recomputes generator positions.
- Resize handler skips hidden zero-size main-canvas measurements while the RPG tab is active, preventing the Equation canvas from being resized to 0 after focus or viewport changes.

### src/app/app-types.ts
- `AppState` and `UIPanels` interfaces shared by app modules.

### src/app/app-actions.ts
- `handleAction()` — central action dispatcher.
- Forge taps pass both clocks to `tapEquationForge`: game elapsed time for heat-tap timeout state, wall-clock time for warm-up animation.
- `setActiveTab()` — panel visibility switching; also calls `rpgRender.setActive()` and `rpgRender.resize()` when the RPG tab is activated so the letterbox layout is correct immediately.
- `updateVisiblePanels()` — refreshes the currently active panel.

- Switching from RPG back to a non-RPG tab refreshes the main canvas size and generator positions before the next Equation render.

### src/app/app-game-loop.ts
- `createGameLoop()` factory — creates the frame-by-frame game loop.
- `GameLoopContext` interface — all dependencies injected.
- Loop: sim tick → `tickForgeWarmup` → particle update → background → render → forge preview computation → dev viewport debug (dev mode only) → UI update → auto-save.
- Calls `computeForgePreviewTerms` each frame and passes `forgePreviewTerms` to `hudOverlay.update`.
- Calls `drawIdleViewportDebug(cc)` when `settings.isDevMode` is true (drawn last so it is always visible).
- Newly unlocked achievement notifications are queued and emitted at 700 ms intervals so popup text and achievement SFX do not stack on the same frame.

- Resets the main canvas 2D context state before each full-frame render so leaked alpha, transforms, filters, or blend modes cannot blank later layers.

### src/render/legacy/forge-equation-preview-legacy.ts
- Retired display-only forge warm-up equation preview bridge.
- Intentionally not imported by active runtime systems.

### src/app/game-app-canvas-input.ts
- Canvas pointer-input wiring extracted from `game-app.ts`.
- Exports `wireCanvasPointerInput()` to connect pointer down/move/up/cancel handlers for drag interactions, generator hover tracking, and forge/equation tap dispatch.
- **Build 108+:** accepts a `dispatch: ActionHandler` parameter and dispatches the `tap` action directly from the canvas `pointerdown` event (with `{ passive: false }` and `preventDefault()` to suppress synthetic mobile mouse events). This is more reliable on mobile than listening on the container, because the canvas has `touch-action: none` and pointer capture is set immediately.

### src/app/game-app-idle.ts
- Shared idle-reward eligibility helper used by `game-app.ts`.
- Exports `applyIdleRewardsIfEligible()` which applies queued idle rewards and opens the idle overlay only when elapsed time and rewards are meaningful.
- **Build 108+:** accepts an optional `skipPopup: boolean` parameter (default `false`). When true, rewards are still applied but the count-up overlay is suppressed, matching the "Skip idle pop up at start" setting.

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

### src/data/particles/particle-tweaks.ts
- Mutable runtime config that mirrors a subset of `particle-config.ts` and `particle-life-config.ts`.
- `particleTweaks` — live object read by physics hot-paths; change at runtime for instant effect.
- `PARTICLE_TWEAKS_DEFAULTS` — immutable snapshot of original defaults.
- `resetParticleTweaks()` — restores all tweaks to defaults.
- Used by the developer-mode particle tweaks panel in settings.

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
- Per-tier Loom state: level, isUnlocked, accumulatorMs, conversionProgress, conversionEfficiencyLevel.
- `createLoomState()` — Sand Loom starts unlocked at level 1.
- `tickLooms(state, deltaMs, productionBonus?)` — passive production tick; bonus multiplier applied to all rates.
- `upgradeLoom()`, `unlockLoom()`, `getLoom()`, `getLoomRate()`, `getLoomCost()`.
- `getLoomInputTierId(tierId)` — returns the tier whose particles the loom captures (one tier below output); Sand returns null.
- `getLoomConversionThreshold(effLevel)` — small-equivalent mass required per output mote.
- `getLoomEfficiencyUpgradeCost(tierId, currentLevel)` — mote cost for next efficiency upgrade.
- `applyLoomCapture(state, tierId, mass)` — add captured mass to conversionProgress; awards motes on threshold.
- `tryUpgradeLoomEfficiency(state, tierId)` — spends motes to increase efficiency level (max 5).
- `MAX_LOOM_EFFICIENCY_LEVEL = 5`.

### src/sim/idle/idle-reward.ts
- Pure (no-side-effect) idle reward calculation.
- `IdleTierReward` interface — per-tier reward data (tierId, displayName, color, ratePerMinute, totalMotes, isUnlocked).
- `IdleRewardSummary` interface — full offline summary (minutesAway, equivalenceBefore/After/Gained, tierRewards[]).
- `calculateIdleRewards(game, elapsedMs)` — computes what was earned offline without mutating live state.

### src/sim/idle/apply-idle-rewards.ts
- `queueIdleRewards(game, summary)` — decomposes idle rewards into size-based `PendingMoteEntry` items and appends them to `game.pendingIdleMotes`.
- Entries are ordered: lowest tier first, largest `sizeIndex` first within each tier.
- `simTick()` drains one entry per frame (adds `MERGE_THRESHOLD^sizeIndex` motes), so rewards trickle in rather than appearing all at once.
- Fractional motes (<1) are applied directly to avoid rounding loss.

### src/sim/equation/equation-state.ts
- Authoritative equation state: per-tier segments with levels and unlock flags.
- `isForgeUnlocked` — whether the Equation Forge is active.
- `createEquationState()`, `applyEquationUpgrade()`, `unlockTier()`, `incrementTapCount()`, `unlockForge()`.

### src/sim/equation/equation-logic.ts
- Re-export barrel for backward compatibility.
- Re-exports active equation tap/state/evaluation logic; display-only equation views are retired to `src/render/legacy/`.

### src/sim/equation/equation-tap.ts
- `segmentTapValue()` — motes per tap for a single segment.
- `computeTapGains()` — per-tier mote gains for a single tap (skips Sand foundation tier).

### src/render/legacy/equation-term-view-legacy.ts
- Retired display-only `EquationTermView`, view builder, and structured equation HTML implementation.
- Intentionally not imported by active runtime systems.

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
- Aggregate game state combining equation, resources, progression, forge, Looms, achievements, aliven, and RPG.
- `PendingMoteEntry` interface — `{tierId, sizeIndex, count}` for drip-adding idle motes one per frame.
- `pendingMoteValue(sizeIndex)` — value of one mote at a given size (`MERGE_THRESHOLD^sizeIndex`).
- `tapEquation()` — multiplies gains by `achievements.tapMultiplierBonus`.
- `tapEquationForge(state, heatTapNowMs, warmupNowMs?)` — calls `tapForgeHeat` using game elapsed time; starts warm-up on 3rd tap using wall-clock time.
- `processLoomCapture(state, tierId, massSmallEquiv)` — handles captured particle mass → loom conversion.
- `applyForgeSacrifice(state, massByTier)` — converts forge-sacrificed mass into equation upgrades.
- `tryPurchaseUpgrade(state, id, bypassCost?)`, `tryUnlockNextTier(state, bypassCost?)`, `tryUnlockEquationForge(state, bypassCost?)`, `tryUpgradeLoom(state, tierId, bypassCost?)`, `tryUpgradeLoomEfficiencyAction(state, tierId)` — optional dev mode cost bypass.
- `tryAlivenMote(state, tierId, bypassCost?)` — spend 10,000 motes to aliven a mote type.
- `simTick()` — passes loom bonus from achievements; drains one pending idle mote each frame; calls `tickForgeHeatTimeout`; checks achievement unlock conditions each tick.

### src/sim/forge/forge-state.ts
- `ForgeCrunchState` interface and factory.
- `isWarmingUp`, `warmupStartMs` — warm-up phase tracking fields added to interface.
- `heatTapCount`, `lastHeatTapMs`, `sacrificeProgressByTierId` — 3-tap heat system fields.
- Warm-up constants: `FORGE_TAPS_TO_WAKE = 3`, `FORGE_TAP_RESET_MS = 5000`, `FORGE_WARMUP_RING_INTERVAL_MS = 2000`, `FORGE_WARMUP_TOTAL_RINGS = 5`, `FORGE_TOTAL_WARMUP_MS = 9000`, `FORGE_GRAVITY_BASE`, `FORGE_GRAVITY_MAX`, `FORGE_RING_ACTIVE_SPIN_MULTIPLIER = 4`.
- `tapForgeHeat(state, nowMs)` — increments heat tap; ignores taps during warmup/crunch; returns true on 3rd tap.
- `startForgeWarmup(state, nowMs)` — begins the 9-second warm-up sequence.
- `tickForgeWarmup(state, nowMs)` — advances warm-up timer; calls `startEquationForgeCrunch` when elapsed ≥ 9s.
- `getActiveRingCount(state, nowMs)` — returns 0–5 ring lit count for the renderer.
- `getForgeWarmupProgress(state, nowMs)` — returns [0,1] progress scalar.
- `startEquationForgeCrunch(state)` — activates forge crunch; resets warmup fields.
- `tickForgeHeatTimeout(state, nowMs)` — resets heat if player is idle > `FORGE_TAP_RESET_MS`.
- `getForgeRotationMultiplier()` — spin speed multiplier based on crunch/warmup phase.

### src/sim/forge/forge-logic.ts
- Forge crunch lifecycle management.
- `checkForgeCrunch()` — disabled (always returns null); crunch now triggered by 3-tap heat system.
- `startForgeCrunch()`, `updateForgeCrunch()`, `getCrunchOutput()` — still used by the render/particle layer.

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
- Exports `IDLE_LOGICAL_WIDTH = 320` and `IDLE_LOGICAL_HEIGHT = 640` — fallback world dimensions before first resize.
- `CanvasContext` — canvas element, 2D context, `widthPx`/`heightPx` (world coordinate size), `dpr`, `gameArea` wrapper div, and `idleCanvasRenderStyle` ('pixelated' | 'crisp').
- `createGameCanvas()` — creates `#game-area` wrapper + `#game-canvas` child; defaults to 'pixelated' render style.
- `resizeCanvas()` — *(build 193+)* dual-mode: crisp mode sets backing = CSS × DPR; pixelated mode sets backing = ~320 px wide internal size and applies `idle-canvas-pixelated` class.
- `resetCanvasRenderState()` — crisp: applies DPR scale transform; pixelated: identity transform + `imageSmoothingEnabled = false`.

### src/render/canvas/idle-viewport-debug.ts *(build 128)*
- Dev-mode viewport diagnostic overlay for the Equation / Idle canvas.
- `drawIdleViewportDebug(cc)` — draws a small info panel (top-right corner) showing logical size, canvas backing size, game-area CSS size, devicePixelRatio, and render scale.
- Drawn last in the game loop when `settings.isDevMode` is true; useful for verifying that logical coordinates stay stable across resize and zoom events.

### src/render/assets/asset-paths.ts
- Centralized asset path definitions (single source of truth).
- `getRefinedGemPath(tierId)` — returns full path to the refined gem sprite (`.webp` for sand–nullstone, `.png` for fracteryl/eigenstein). Each tier has a dedicated sprite; fracteryl and eigenstein no longer fall back to nullstone.
- `getGemIconPath(tierId)` — raw gem icon (unrefined, for equation/resource display).
- Exports hot/cold Equation Forge sprite paths and `FORGE_RING_SPRITE_PATHS`.

### src/render/assets/refined-gem-preload.ts
- `preloadRefinedGemSprites()` — fires and forgets all 13 refined gem images into the asset-loader cache at startup, ensuring they are ready before loom glyphs and inventory chips need them.

### src/render/assets/asset-loader.ts
- Image loading utility with caching.

### src/render/forge/forge-ring-renderer.ts
- Visual-only Equation Forge ring renderer.
- Exports `preloadForgeRingSprites()` and `drawForgeRings(ctx, x, y, forgeSize, nowMs, intensity, activeRingCount?)`.
- `activeRingCount` (0–5): lit rings spin at `FORGE_RING_ACTIVE_SPIN_MULTIPLIER` (4×) and render at 1.8× alpha; unlit rings keep their subtle idle animation.
- Contains the data-driven five-ring config for sprite path, radius scale, rotation speed/direction, opacity, phase, and optional pulsing.

### src/render/assets/item-icon-renderer.ts
- Masked animated fill renderer for item icons (weapons, weaves, lenses).
- Uses PNG silhouette masks (alpha channel, `destination-in` compositing) to clip animated radial-gradient blobs.
- `createItemIconCanvas(opts)` — returns a self-animating `HTMLCanvasElement` driven by a shared internal RAF loop. Canvas auto-unregisters when removed from DOM.
- `drawMaskedAnimatedItemIcon(ctx, opts)` — standalone draw for embedding in game canvas contexts.
- `getItemMaskPath(itemType, tierId)` — resolves PNG paths from the naming convention.
- `prefetchItemMask(itemType, tierId)` — kicks off async background load.
- `ingredientsToComposition(ingredients)` — converts raw ingredient counts to `CompositionEntry[]` shares.
- `stringToIconSeed(id)` — deterministic numeric seed from item id string.
- Graceful fallback: diamond clip-path when no PNG mask is loaded yet.
- Asset convention: `ASSETS/SPRITES/ITEMS/{WEAPONS|WEAVES|LENSES}/${tierId}{Weapon|Weave|Lens}.png`.

### src/render/assets/color-utils.ts
- Shared color parsing utilities for the render layer.
- `colorWithAlpha(color, alpha)` — converts `#RRGGBB` or `rgb()` strings to `rgba()`, used by generator and forge renderers.
- `parseHexToRgb(color)` — parses a hex color to a cached `[r, g, b]` tuple, used by particle renderers.
- Eliminates duplicate hex-parsing implementations previously found in `particle-renderer.ts`, `particle-grab-visual.ts`, `generator-renderer.ts`, and `forge-renderer.ts`.

### src/render/background/background-animation.ts
- Background animation player for 2402-frame WebP sequence.

### src/render/background/vermiculate-effect.ts
- Decorative background tracer effect (worm-line style, ported from Thero Chapter 1).
- Factory and public `VermiculateEffect` interface only (~315 lines); constants, types, and pure helpers extracted to `vermiculate-effect-internals.ts`.

### src/render/background/vermiculate-effect-internals.ts
- Internal constants, types, and pure helpers for `vermiculate-effect.ts` (~185 lines).
- Exports all tuning constants, `PaletteColor`/`PALETTE`, internal interfaces (`TracerSegment`, `TracerStyles`, `TracerMode`, `Tracer`, `ContactHighlight`, `SegmentHit`), and pure functions (`clamp`, `pickColor`, `randomOrthogonalAngle`, `randomOrthogonalTurnInterval`, `normalizeAngle`, `reflectAngle`, `createDotSprite`, `buildStyles`, `createTracerSegment`, `getSegmentIntersection`).
- Should not be imported by any module other than `vermiculate-effect.ts`.

### src/render/background/substrate-effect.ts
- Decorative background crystalline crack effect (Substrate style, ported from Thero Shin Spire / Chapter 6).
- Exports `SubstrateEffect` interface and `createSubstrateEffect({ quality })` factory.
- Quality parameter ('low' | 'medium' | 'high') scales seed count, max fronts, and grain density.
- Constants, types, and helpers extracted to `substrate-effect-internals.ts`.

### src/render/background/substrate-effect-internals.ts
- Internal constants, types, and pure helpers for `substrate-effect.ts`.
- Exports all configurable parameters (SEED_COUNT, MAX_FRONTS, GROWTH_SPEED, etc.), undraw/collision-glow constants, colour palette (PaletteColor, PALETTE), internal types (FrontMode, TrailPoint, CollisionGlow, GrowthFront), and helpers (randomPaletteColor, quantisedAngle, createFront).
- Should not be imported by any module other than `substrate-effect.ts`.

### src/render/background/nadir-substrate-effect.ts
- Horizon-zone Nadir variant of the substrate crystalline background effect.
- Exports `NadirSubstrateEffect` interface and `createNadirSubstrateEffect({ quality })` factory; implementation currently mirrors `substrate-effect.ts`.

### src/render/background/nadir-substrate-effect-internals.ts
- Nadir-specific internal constants, types, and helpers for `nadir-substrate-effect.ts`.
- Currently matches `substrate-effect-internals.ts` exactly aside from the file header comment, so future tuning can diverge without affecting Zenith.

### src/render/background/true-binary-horizon.ts
- Preserved copy of the original (pre-build-158) Binary Horizon effect, used for the True sublevel.
- Exports `TrueBinaryHorizon` interface and `createTrueBinaryHorizon({ quality })` factory.
- Horizontal horizon at ~48% canvas height; particles flow upward/downward via a sine/cosine curl field.
- 8 colour buckets (white/silver → cyan → teal → blue → violet), central radial glow, breathing pulse.
- Isolated from Zenith changes: True and Zenith now use separate instances and separate files.
- Wired in `rpg-render.ts → drawZoneBgOverlay` for the `'true'` subzone.

### src/render/background/zenith-binary-horizon.ts
- Reworked Binary Horizon background for the Zenith sublevel (build 160).
- Exports `ZenithBinaryHorizon` interface and `createZenithBinaryHorizon({ quality })` factory.
- **Wave presentation with cut sequence**: each wave generates 1–5 sequential cut effects; each cut animates from one edge-perimeter point to another, leaves a persistent source line, and triggers screen shake.
- **Phase state machine**: `'cutting'` → `'active'` → `'collapsing'` → `'cleared'`.
  - `cutting`: cut animations play sequentially; particles begin emerging from completed source lines.
  - `active`: normal path-accumulation from all completed source lines.
  - `collapsing`: particles converge toward source lines with stronger buffer fade; lines fade at the end.
  - `cleared`: offscreen canvas is blank; waiting for the next `beginZenithBinaryHorizonWave` call.
- **Multiple source lines** (up to 5): all stored in flat `Float32Array`s; each particle carries a `psrcLine` index. Multi-line similarity rejection ensures distinct cut angles/positions.
- **Geometry rule**: each cut line leaves ≥ 10% of the canvas on both sides (Shoelace area test; same rule as before but applied to all 1–5 lines).
- **Screen shake**: `triggerShake(amplitude)` → decaying cosine oscillator on `shakeX/shakeY`; exposed via `getShakeOffset()`. Applied in `rpg-render-draw.ts` as a canvas translate.
- **Lifecycle API**: `beginZenithBinaryHorizonWave(waveNumber)`, `endZenithBinaryHorizonWave()`, `setScreenShakeEnabled(enabled)`.
- `update(now, w, h, waveNumber?)`: initialises on first call; does NOT auto-reseed on wave change (explicit lifecycle calls are required).
- Seeded PRNG: mulberry32; deterministic cut count and line placement per wave number.
- Low-graphics: 1600 particles, 0.35× scale, 35 prewarm, shorter collapse, no cut-head glow.
- Wired in `rpg-render.ts → drawZoneBgOverlay` + `beginWaveTerrain` / `setIsInterWave` callbacks.

### src/render/background/zenith-binary-ring-background.ts
- Path-traced Binary Ring encounter background for Zenith elite fights.
- Exports `ZenithBinaryRingBackground` and `createZenithBinaryRingBackground({ quality })`.
- Uses one persistent offscreen canvas with translucent-black trail fade, deterministic radial/tangential ring flow, and age-based palette lerp over 1.5s.
- Particle state is fully preallocated in `Float32Array` / `Uint8Array`, batched into 8 colour buckets, with no hot-path object allocation.
- Drawn by `rpg-render.ts → drawZoneBgOverlay` only while a Binary Ring enemy is active.

### src/render/background/nadir-cubic-grid-background.ts
- CubicGrid-style 3D rotating dotted lattice background for Horizon → Nadir elite waves.
- Exports `NadirCubicGridBackground` and `createNadirCubicGridBackground()`.
- Precomputes all lattice world coordinates once in `buildLatticePoints()` (X/Y/Z-parallel lines,
  `HALF_CELLS=7`, `SAMPLES=42`). Zero per-frame allocation; rotation + projection run in typed array loops.
- Renders to a `RENDER_SCALE=0.5` offscreen canvas via `ImageData` pixel writes (one `putImageData`
  per frame). Upscaled to game canvas with `imageSmoothingEnabled=false`.
- Axis colours: X=blue-white, Y=red-magenta, Z=cyan-green. Depth fading by squared distance.
- Smooth `masterAlpha` fade-in (1.2 s) / fade-out (0.8 s) driven by `isEliteWaveActive` parameter.
- Low-graphics: `HALF_CELLS_LOW=5`, `SAMPLES_LOW=28`, `RENDER_SCALE_LOW=0.35`.
- `getProjectionState()` exposes the live cube rotation angles plus logical game size so gameplay systems can project anchored world-space lattice points with the same math as the background.
- Activated by `rpg-render.ts → drawZoneBgOverlay` when `isNadirEliteWave && !isInterWave`.

### src/render/particles/particle-types.ts
- All shared particle system interfaces and type aliases.
- `EquatoriaParticle` — core particle interface with ring-buffer trail fields and capture state (`isCaptured`, `capturedById`, `particleId`).
- `ActiveMerge`, `ProceduralMerge` — merge tracking types.
- `Shockwave` — visual shockwave effect type.
- `ParticleRenderOptions` — glow/trail toggle flags.

### src/render/particles/particle-pool.ts
- Particle object pool and lifecycle management.
- `ParticlePool` class — acquire/release with internal free list.
- `initParticle()` — initialises all particle fields on spawn; assigns unique `particleId` from module-level `_nextParticleId` counter.
- `release()` — resets `isCaptured`/`capturedById` on return to pool.
- Pre-computed `TIER_INDEX_MAP` for O(1) tier index lookup.

### src/render/particles/forge-field-forces.ts
- Capture-only field logic for the forge and looms; normal motes are not attracted or steered.
- `ForgeFieldInfo` interface — id, position, radii, `compatibleTierId`, `isUnlocked`.
- `LoomCapture` interface — `particle`, `fieldId`, `inputTierId`, `mass`.
- `applyCaptureFields(particles, fields, crunchState, outLoomCaptures, delta)` — captures eligible particles that naturally enter an inner radius without changing free-moving trajectories.

### src/render/particles/legacy/loom-forge-attraction-legacy.ts
- Non-runtime history of removed normal-mote generator/loom attraction, forge attraction/warmup pull, loom steering, and containment behavior.
- Intentionally not imported by active runtime systems.

### src/render/particles/particle-physics.ts
- Per-particle physics: pointer pull, veer, velocity clamping, bounce.
- `updateParticlePhysics()` — normal mote movement step; intentionally has no loom/forge attraction.
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
- `checkAndStartForgeCrunch()`, `completeForgeCrunch()` — original auto-timer path (still present).
- `completeEquationForgeCrunch(particles, pool)` — new 3-tap path; removes all forge-captured particles, accumulates mass by tier using `Math.pow(100, sizeIndex)`, returns `Map<string, number>`.

### src/render/particles/particle-shockwave.ts
- Shockwave expansion, fade, and spatial-grid force application.
- `updateShockwaves()`, `getShockwaveScaleForSize()`.

### src/render/particles/particle-glow-field.ts
- Smooth nebula-style glow field drawn behind particles in high-graphics mode.
- Divides the canvas into a low-resolution grid (CELL_SIZE=4 internal pixels per cell → 80 cells wide on the 320 px canvas).
- Per-frame: applies temporal persistence decay, then Gaussian-splats each particle's energy into nearby cells using the exact sub-cell fractional position (continuous Gaussian, no cell-snap stepping).
- Colour mixing uses weighted-average RGB (each tier contributes proportionally) for smooth gradients between differently-coloured motes.
- Alpha curve: `1 − exp(−GLOW_K · totalIntensity)`, capped at MAX_ALPHA, keeps glows soft and proportional.
- Writes pixel data to an offscreen canvas, upscales 4× with bilinear smoothing, and composites onto the main canvas with `globalCompositeOperation = BLEND_MODE ('screen')`.
- All tuning constants (GLOW_ENABLED, CELL_SIZE, SPLAT_RADIUS, SPLAT_SIGMA, INTENSITY_MULT, PERSISTENCE, MAX_ALPHA, GLOW_K, BLEND_MODE) are grouped at the top of the file.
- `drawParticleGlowField(ctx, particles, canvasW, canvasH)` — draw the field; call before trails and particle bodies.
- `resetGlowField()` — clear all intensities on game reset.

### src/render/particles/particle-renderer.ts
- Batched canvas rendering for trails, particles, and shockwaves.
- Numeric batch keys `(tierIndex << 8 | sizeIndex)`, Float64Array position buffers.
- `drawParticles()` — draws glow field (high graphics), merge trails, particle trails, batched particle bodies, shockwaves, and prismatic sheen effects.
- Per-particle shadowBlur reduced to 1.5× size (from 3×) when glow field is active; the field provides the broad ambient glow.
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
- Runs per-frame update pipeline: physics → trails → **Particle Life forces** → **capture-only field checks** → damping → wrap → merges → forge → shockwaves.
- Delegates loom-capture particle removal + callback emission to `particle-system-loom-capture.ts`.
- Delegates forge spin-up/crunch transition event detection to `particle-system-audio.ts`.
- `forgeFields: ForgeFieldInfo[]` — updated each frame via `setForgeFields()` from the game loop.
- `onParticleCapturedByLoom` callback — fires after each substep with `LoomCapture` data; wired to `processLoomCapture`.
- `onEquationForgeCrunchCompleted` callback — fires when crunch animation ends with `Map<string, number>`; wired to `applyForgeSacrifice`.
- `alivenedTierIndices` — `Set<number>` of tier indices that are alivened; synced from game state each frame by the game loop.
- `interactionMatrix` — 13×13 matrix owned here, defaults from `createDefaultInteractionMatrix()`.
- `enableSizeForceBias` — boolean toggle for size-based force scaling.
- `debugState` — `ParticleLifeDebugState` for debug visualization toggles.

### src/render/particles/particle-system-loom-capture.ts
- Loom-capture post-processing helper extracted from `particle-system.ts`.
- `processLoomCaptures(...)` removes loom-captured particles in place, returns them to `ParticlePool`, and forwards per-capture callbacks.
- Uses a caller-provided reusable `Set<EquatoriaParticle>` scratch buffer to avoid per-frame `Set` allocation.

### src/render/particles/particle-system-audio.ts
- Forge-audio transition helper extracted from `particle-system.ts`.
- `computeForgeAudioTransitions(...)` derives `forgeCrunchStarted`, `forgeSpinUpBegan`, and `forgeSpinUpCancelled` plus next spin/crunch state flags.
- Pure computation module; no side effects or state ownership.

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

### src/render/legacy/equation-canvas-display-legacy.ts
- Retired canvas equation/equivalence renderer, preserved for history only.
- `drawScore()` — score display at top.
- `drawTapHint()` — pulsing hint for new players.

### src/render/generators/generator-renderer.ts
- Generator sprite rendering with procedural fallback.
- All tiers now show a swirling arc effect (`drawRangeSwirl`) in their tier color at 75% of physics range.
- Previously only nullstone had the swirl; now generalized to all tiers via `colorWithAlpha` helper.
- `INFLUENCE_VISUAL_SCALE = 0.75` — visual range is 25% smaller than physics range.

### src/render/forge/forge-renderer.ts
- Forge rendering orchestrator (~200 lines after private helper extraction).
- Public exports: `preloadForgeSprites`, `drawForge`, `drawLoomFieldAuras`, `drawForgeCrunch`, `drawForgeSacrificeFlash`.
- `drawForge(ctx, ..., heatTapCount)` — orchestrates background glow, heat rings, sprite/fallback, and influence swirl by calling helpers from `forge-renderer-draw.ts`.
- `drawLoomFieldAuras` — draws faint tier-colored aura rings for each active loom capture field.
- `drawForgeSacrificeFlash` — 600ms expanding shockwave ring at the forge on sacrifice crunch completion.
- Sub-draw helpers live in `forge-renderer-draw.ts` (not for direct import).

### src/render/forge/forge-renderer-draw.ts
- Private draw helpers for `forge-renderer.ts` (~230 lines).
- Contains `FORGE_FIRE_COLORS` (7-color fire gradient), and the following helpers:
  - `drawForgeBackgroundGlow` — slow-pulsing warm radial glow behind the forge.
  - `drawForgeHeatRings` — 1–2 pulsing amber/orange rings for forge heat state.
  - `drawForgeInfluenceSwirl` — bidirectional fire-color swirl arcs at the influence radius.
  - `drawForgeSprite` / `drawForgeFallback` — sprite or geometric fallback.
  - `drawLoomAura` — faint tier-colored capture ring for a single loom field.
- Not intended for import outside `forge-renderer.ts`.

### src/render/rpg/rpg-constants.ts
- Core numeric and string constants for the RPG rendering system (~311 lines after weapon extraction).
- Covers: player, mote, joystick, laser/sapphire starter enemies, missile, boss, damage numbers, iframes, fluid injection forces, and lucky mote drop constants.
- Imports `PLAYER_BASE_ATK` from `rpg-state.ts` (used to initialise `PLAYER_ATK_INIT`).
- Exports all constants; consumed by `rpg-render.ts`, `rpg-factories.ts`, and RPG draw/update modules.
- Weapon-specific constants (chain whip, laser beam, vortex, sword, poison, emerald missiles, sunstone mines, companion ships) have been moved to `rpg-weapon-constants.ts`.

### src/render/rpg/rpg-weapon-constants.ts
- All player-weapon and weapon-projectile constants (~330 lines after extraction).
- Covers: sand projectiles, ruby laser beam, nullstone vortex, diamond sword (shard shapes, combo system, `SAND_BLADE_COLORS`), poison bolt, emerald player + sub-missiles + swirl particles, sunstone mines, sapphire/amethyst companion ships + spiral lasers.
- Chain whip physics/visual constants are re-exported from `rpg-weapon-chain-params.ts`.
- Consumed by all weapon system modules plus `rpg-weapons-tab.ts` (dev tuning panel).

### src/render/rpg/rpg-weapon-chain-params.ts
- Quartz chain whip physics constants and dev-tuning API (~155 lines). Extracted from `rpg-weapon-constants.ts`.
- **Chain whip physics parameters are mutable `let` exports** to support runtime dev-mode tuning.
- Exports `ChainWhipParamKey`, `ChainWhipParams`, `CHAIN_WHIP_PARAM_DEFAULTS`, `getChainWhipParams()`, `setChainWhipParam(key, value)`, `resetChainWhipParams()`.
- Also exports visual constants `CHAIN_NODES`, `CHAIN_NODE_COLOR`, `CHAIN_NODE_GLOW`, `CHAIN_LINE_COLOR`.
- All exports are re-exported from `rpg-weapon-constants.ts` for backward compat.

### src/render/rpg/rpg-enemy-constants.ts
- Per-enemy-type constants for all non-starter enemy types (~230 lines).
- Covers: Emerald, Amber, Void, Quartz, Ruby, Sunstone, Citrine, Iolite, Amethyst, Diamond, Nullstone, Fracteryl, Eigenstein (and their projectiles/shards).
- Also contains the XP multiplier table for all enemy types (including Laser and Sapphire).
- No imports — all values are primitive literals.
- Consumed by `rpg-factories.ts`, `rpg-enemy-updates.ts`, `rpg-enemy-updates-adv.ts`, `rpg-enemy-draw.ts`, `rpg-enemy-draw-adv.ts`, and `rpg-render.ts`.

### src/render/rpg/rpg-types.ts
- Core interfaces and type aliases for the RPG rendering system (~299 lines after enemy types extracted).
- Covers: `RpgMote`, `RpgJoystick`, `RpgKeyState`, `RpgPlayerStats`, `RpgPhase`, `SpawnEntry`, starter enemy interfaces (`LaserEnemy`, `SapphireEnemy`, `SapphireMissile`), projectile interfaces, weapon-effect state (`AttackTrailState`, `ChainWhipState`, `NullstoneVortex`, `VortexWeaponState`, `SwordComboState`, `SwipeEffect`, `PrismaticBeamEffect`), visual-effect interfaces (`DeathParticle`, `HitEffect`, `ShotLine`, `DamageNumber`, `LaserBeamEffect`, `WeaponOrbitParticle`, `OrbitProjectile`), `SandProjectile`, `IolitePoisonBolt`, `PoisonDebuff`.
- All non-starter enemy interfaces (EmeraldEnemy → LuckyMotePopup) have been moved to `rpg-enemy-types.ts`.
- No runtime dependencies (types only).

### src/render/rpg/rpg-enemy-types.ts
- All enemy interfaces: `EmeraldPhase`, `EmeraldEnemy`, `AmberEnemy`, `AmberShard`, `VoidEnemy`, `QuartzEnemy`, `QuartzSpike`, `RubyEnemy`, `RubyBolt`, `SunstoneEnemy`, `CitrineEnemy`, `CitrineBolt`, `IoliteEnemy`, `AmethystEnemy`, `AmethystShard`, `DiamondEnemy`, `DiamondShard`, `NullstoneEnemy`, `VoidTendril`, `BossEnemy`, `BossProjectile`, `FracterylEnemy`, `FracterylShard`, `EigensteinEnemy`, `EigensteinBeam`, `DanmakuSafeZone`.
- Also exports `EliteTier` (union of 8 tier names) and `EliteEnemy`.
- Player weapon and pickup entity types (`TeleportParticle`, `EmeraldPlayerMissile`, `EmeraldSubMissile`, `EmeraldSwirlParticle`, `SunstoneMine`, `SapphireShip`, `SapphireLaser`, `AmethystShip`, `AmethystLaser`, `LuckyMote`, `LuckyMotePopup`) are defined in `rpg-entity-types.ts` and re-exported here for backward compatibility.
- No runtime dependencies (types only).

### src/render/rpg/rpg-entity-types.ts
- Player weapon and pickup entity type interfaces extracted from `rpg-enemy-types.ts`.
- Covers: `TeleportParticle`, `EmeraldPlayerMissile`, `EmeraldSubMissile`, `EmeraldSwirlParticle`, `SunstoneMine`, `SapphireShip`, `SapphireLaser`, `AmethystShip`, `AmethystLaser`, `LuckyMote`, `LuckyMotePopup`.
- No runtime dependencies (types only).

### src/render/rpg/rpg-elite-enemy-helpers.ts
- Shared context type and projectile-spawning helpers for elite polygon enemies (~274 lines).
- Exports `EliteEnemyCtx` (extends `RpgEnemyCtx` with the 6 projectile arrays elites fire into).
- Exports `TIER_FLUID` — per-tier (r, g, b) fluid-color lookup.
- Exports movement helper `patrolStep`, fluid helper `eliteFluidExplosion`, and utility `clamp`.
- Exports projectile spawn helpers: `fireSpikeFan`, `fireSpikeRing`, `fireBoltFan`, `fireHomingBolts`, `fireShardsRing`, `fireDiamondRing`, `fireTendrilRing`.
- Extracted from `rpg-elite-enemy-updates.ts` to keep behavioral logic and boilerplate helpers in separate files.

### src/render/rpg/rpg-elite-enemy-updates.ts
- Dispatcher barrel for all 8 elite polygon enemies (~52 lines).
- Exports `updateEliteEnemies(elites, ctx, deltaMs)` and re-exports `EliteEnemyCtx` from helpers.
- Per-tier update logic delegated to two sub-modules:
  - `rpg-elite-enemy-updates-early.ts` — Quartz, Ruby, Sunstone, Citrine
  - `rpg-elite-enemy-updates-late.ts` — Iolite, Amethyst, Diamond, Nullstone

### src/render/rpg/rpg-elite-enemy-updates-early.ts
- Per-frame update functions for early elite tiers (~195 lines): Quartz, Ruby, Sunstone, Citrine.
- Exports: `updateEliteQuartz`, `updateEliteRuby`, `updateEliteSunstone`, `updateEliteCitrine`.
- Each tier has 2 distinct attacks reusing existing projectile arrays:
  - **Quartz (3)**: Crystal Salvo (two staggered 3-spike bursts) + Crystal Nova (9-spike ring).
  - **Ruby (4)**: Cardinal Burst (4 bolts N/E/S/W) + Triple Shot (tight 3-bolt spread).
  - **Sunstone (5)**: Star Flare (5 homing citrine bolts) + Corona Pulse (10-spike ring).
  - **Citrine (6)**: Hex Swarm (6 homing citrine bolts) + Laser Hex (6 instant beams via fluid).

### src/render/rpg/rpg-elite-enemy-updates-late.ts
- Per-frame update functions for late elite tiers (~235 lines): Iolite, Amethyst, Diamond, Nullstone.
- Exports: `updateEliteIolite`, `updateEliteAmethyst`, `updateEliteDiamond`, `updateEliteNullstone`.
- Each tier has 2 distinct attacks reusing existing projectile arrays:
  - **Iolite (7)**: Prism Fan (7 bolts in wide arc) + Gravity Well (pulls player 2.5 s).
  - **Amethyst (8)**: Crystal Storm (two staggered 8-shard rings) + reactive shield burst.
  - **Diamond (9)**: Nine-Star burst + phase cycle (invuln orbit ↔ vulnerable patrol).
  - **Nullstone (10)**: Tendril Swarm + Event Horizon (20-tendril ring when HP < 30%).

### src/render/rpg/rpg-elite-enemy-draw.ts
- Draw functions for elite polygon enemies.
- Each elite is a rotating regular polygon (3–10 sides) with glow, HP bar, and a star-crown indicator.
- Exports `drawEliteEnemies(ctx, elites)` and `setLowGraphicsMode(enabled)`.
- Amethyst elite also renders a shield arc around its body.
- Diamond elite pulses with opacity during its invuln orbit phase.

### src/render/rpg/rpg-aliven-types.ts
- Type definitions for the AlivenParticle enemy system.
- Exports: `AlivenParticle`, `AlivenParticleGroup`, `AlivenBullet`, `AlivenTrailPoint`, `AlivenSpecialKind`, `AlivenVariantParams`, `AlivenUpdateCtx`.
- `AlivenUpdateCtx` was moved here from `rpg-aliven-updates.ts` to break a potential circular dependency between the updates and specials modules.

### src/render/rpg/rpg-aliven-constants.ts
- Tuning constants and per-variant parameter table for the AlivenParticle enemy system.
- Exports: `ALIVEN_VARIANTS`, `AlivenVariantId`, `ALIVEN_VARIANT_PARAMS`, `ALIVEN_FLUID_COLORS`, and all physics/timer constants.

### src/render/rpg/rpg-aliven-factories.ts
- Factory functions for AlivenParticle enemies.
- Exports: `makeAlivenParticle(params, waveStatScale)`, `makeAlivenGroup(variantId, x, y, waveNumber)`.

### src/render/rpg/rpg-aliven-updates.ts
- **Core loop orchestrator** (~263 lines, trimmed from 499 by extracting specials to rpg-aliven-specials.ts).
- Owns: spawn-over-time, centroid tracking, overlap separation, movement, trails, timers, and the `tickSpecial` dispatcher.
- Exports: `updateAlivenGroups(groups, ctx, deltaMs)`.
- Re-exports for backward compat: `AlivenUpdateCtx` (from rpg-aliven-types), `handleAlivenParticleDeath` (from rpg-aliven-specials).

### src/render/rpg/rpg-aliven-specials.ts
- **Special-ability tick functions** (~245 lines, extracted from rpg-aliven-updates.ts).
- Owns: `tickContact`, `tickSpitter`, `tickDasher`, `tickPulser`, `tickHealer`, `tickGhost`, `tickBullets`, `handleAlivenParticleDeath`.
- All exported; called by the `tickSpecial` dispatcher in rpg-aliven-updates.ts.
- Private helper `getAtk(p)` computes proportional damage from maxHp.

### src/render/rpg/rpg-aliven-draw.ts
- Canvas rendering for AlivenParticle groups: pulsing glow circles, comet trails, windup rings, bullets.
- Exports: `drawAlivenGroups(ctx, groups)`, `setAlivenLowGraphics(enabled)`.

### src/render/rpg/rpg-factories.ts
- **Re-export barrel** — 12-line aggregator that re-exports everything from the three tier-grouped factory files below. Backward-compatible: all existing `import ... from './rpg-factories'` still work unchanged.

### src/render/rpg/rpg-factories-early.ts
- Factory functions for wave-1 to wave-5 enemy types: `makeAttackTrail`, `makeLaserEnemy`, `makeSapphireEnemy`, `makeSapphireMissile`, `makeEmeraldEnemy`, `makeAmberEnemy`, `makeAmberShard`, `makeVoidEnemy`, `makeQuartzEnemy`, `makeQuartzSpike`, `makeRubyEnemy`, `makeRubyBolt`.

### src/render/rpg/rpg-factories-mid.ts
- Factory functions for wave-6 to wave-10 enemy types: `makeSunstoneEnemy`, `makeCitrineEnemy`, `makeCitrineBolt`, `makeIoliteEnemy`, `makeAmethystEnemy`, `makeAmethystShard`, `makeDiamondEnemy`, `makeDiamondShard`, `makeNullstoneEnemy`, `makeVoidTendril`.

### src/render/rpg/rpg-factories-late.ts
- Factory functions for late-game enemies and boss: `makeFracterylEnemy`, `makeFracterylShard`, `makeEigensteinEnemy`, `makeDanmakuSafeZone`, `makeEliteEnemy(tier, x, y, waveNumber)`, `makeBossEnemy(rawBossId, waveNumber, w, h)`.

### src/render/rpg/rpg-fluid.ts
- Euler fluid background simulation orchestrator for RPG mode. Ported from Chapter 3 EulerFluidEffect.js in sethrimer3/Thero_Idle_TD.
- Owns grid/particle state, force injection (`addForce`, `addExplosion`), resize/reset, and graphics-density switching.
- Delegates per-frame simulation to `rpg-fluid-step.ts` and trail draw batching to `rpg-fluid-render.ts`.
- **No ambient injection** — velocity enters only via `addForce()` and `addExplosion()` calls from gameplay systems.
- Exports: `createRpgFluid()`, `RpgFluid` interface, `FluidImpulse` type.
- Constants, types, and helpers extracted to `rpg-fluid-constants.ts`.

### src/render/rpg/rpg-fluid-constants.ts
- Internal constants, types, and helpers for `rpg-fluid.ts`.
- Exports all grid/particle/field/colour/batching constants, `_batches` pre-allocated draw buffer, math helpers (_clamp, _smoothstep, _hueBucket, _bilerp), `FluidParticle` interface, and `_makeParticle()`.
- Should not be imported by any module other than `rpg-fluid.ts`.

### src/render/rpg/rpg-fluid-step.ts
- Per-frame fluid simulation update loop extracted from `rpg-fluid.ts`.
- Handles field decay and clamp, velocity diffusion, sparse occupancy rebuild, particle advection/lifecycle, colour blending, and sparse respawn recycling.
- Keeps hot-path behavior allocation-free by mutating pre-allocated arrays passed by `rpg-fluid.ts`.

### src/render/rpg/rpg-fluid-render.ts
- Per-frame trail rendering extraction for fluid particles.
- Clears and repopulates shared hue/alpha `_batches`, then issues batched canvas strokes.
- Preserves prior draw strategy of at most `HUE_STEPS × ALPHA_BUCKETS` state buckets per frame.

### src/render/rpg/rpg-entity-draw.ts
- Exported pure draw functions for weapon projectiles (~346 lines after player-draw extraction).
- Covers: sand projectiles, poison bolts, laser beam effect, boss projectiles, emerald missiles (player + sub + swirl), and sunstone mines.
- Player mote, orbit particle, orbit projectile, and target reticle draws have moved to `rpg-player-draw.ts`.
- Exposes its own `setLowGraphicsMode()` (independent of other draw modules); called from `rpg-render.ts`.
- **Companion ship draw** has moved to `rpg-companion-draw.ts`.
- **Combat feedback visuals** (death particles, shot lines, hit effects, damage numbers) have moved to `rpg-combat-effects-draw.ts`.
- **`drawAttackTrail`** (laser enemy dash trail) has moved to `rpg-enemy-draw.ts`.
- No runtime side-effects; safe to call from any rendering context.

### src/render/rpg/rpg-player-draw.ts
- Pure draw functions for player mote, weapon orbit particle, orbit projectile, and target reticle (~215 lines).
- Extracted from `rpg-entity-draw.ts` to group all player-visual rendering in one focused module.
- `drawPlayerMote(ctx, mote, glowMovementIntensity, rpgPhase, deathAlpha, glowTimeS, playerIFramesMs)` — respects `isLowGraphicsMode` via the module flag.
- `drawWeaponOrbitParticle(ctx, p)` and `drawOrbitProjectile(ctx, op)` — orbit visuals with comet trails.
- `drawTargetReticle(ctx, x, y, radius, nowMs)` — pulsing corner-bracket + dashed inner ring.
- Exposes its own `setLowGraphicsMode()` export; called from `rpg-render.ts` alongside `setEntityLowGraphics`.

### src/render/rpg/rpg-companion-draw.ts
- Pure draw functions for Sapphire and Amethyst companion ships and their lasers (~257 lines).
- Extracted from `rpg-entity-draw.ts` to keep that file focused on weapon projectiles.
- Covers: `drawSapphireShips`, `drawSapphireLasers`, `drawAmethystShips`, `drawAmethystLasers`.
- Uses the neon trail system (`neon-trail-draw.ts`) for high-quality trail rendering.
- Module-level `_sapphireShipTrailCfg`, `_sapphireLaserTrailCfg`, `_amethystLaserTrailCfg` — cached `NeonTrailConfig` objects (no per-frame allocation).
- Has its own `setLowGraphicsMode()` export; called from `rpg-render.ts` at startup.

### src/render/rpg/rpg-combat-effects-draw.ts
- Pure draw functions for per-hit feedback visuals (~95 lines).
- Extracted from `rpg-entity-draw.ts`.
- Covers: `drawDeathParticles`, `drawShotLines`, `drawHitEffects`, `drawDamageNumbers`.
- All functions are stateless: they accept a canvas context and the relevant entity array.
- Has its own `setLowGraphicsMode()` export; called from `rpg-render.ts`.

### src/render/rpg/rpg-weapon-draw.ts
- Canvas draw functions for chain-whip and vortex weapon visuals (~173 lines).
- Extracted from `rpg-render.ts`; sword/sand blade drawing further extracted to `rpg-weapon-draw-sword.ts`.
- Exports `drawChainWhip(ctx, state, mote)` and `drawVortexes(ctx, vortexes)`.
- Has its own `setLowGraphicsMode()` export for chain-whip glow; called from `rpg-render.ts`.

### src/render/rpg/rpg-weapon-draw-sword.ts
- Canvas draw functions for diamond sword and sand blade weapon visuals (~390 lines).
- Extracted from `rpg-weapon-draw.ts` to keep that file focused on chain/vortex drawing.
- Exports `drawSwordCombos(ctx, comboStates, mote, weaponTiers)` and `drawSandBladeCombo(ctx, state, mote)`.
- Re-exports sand drift pixel functions from `rpg-weapon-sand-drift.ts`: `spawnSandSwingPixels`, `updateSandDriftPixels`, `drawSandDriftPixels`.
- Has its own `setLowGraphicsMode()` export for sword glow; both weapon draw setters are called from `rpg-render.ts`.

### src/render/rpg/rpg-weapon-sand-drift.ts
- Sand drift pixel effect for the sand blade (~85 lines). Extracted from `rpg-weapon-draw-sword.ts`.
- Manages module-level `_sandDriftPixels` array with full lifecycle: spawn, update, draw.
- Exports `spawnSandSwingPixels`, `updateSandDriftPixels`, `drawSandDriftPixels`.

### src/render/rpg/rpg-boss-wave.ts
- Boss wave lifecycle management extracted from `rpg-render.ts` (~230 lines).
- Exports `BossWaveCtx` interface, `BossWaveHandle` interface, and `createBossWaveManager(ctx)` factory.
- Owns: `teleportPlayerToSafeZone`, `enterBossWave`, `exitBossWave`, `startBossFight`, `damageBossEnemy`.
- `BossWaveCtx` exposes all mutable closure state via getter/setter callbacks (same pattern as `BossUpdateCtx`, `WaveManagerCtx`).
- `BossWaveCtx` now has optional lifecycle hooks: `onEnterBossWave`, `onExitBossWave`, `onTeleportToSafeZone` — called to notify the stage director.
- `rpg-render.ts` retains `isBossWaveActive`, `bossActiveEquipIds`, and `bossPreWaveWeaponTiers` as let-variables; `getEffectiveEquippedIds()` stays in `rpg-render.ts` and reads them directly.
- Initialized after `statsPanel` is created (which sets up `recordDps`), since `damageBossEnemy` and `spawnDamageNumber` callbacks are required.

### src/data/boss-dialogue.ts and src/render/rpg/rpg-boss-dialogue.ts

- Boss-specific scripted dialogue is separate from normal enemy barks.
- Edit only `src/data/boss-dialogue.ts` to add boss names, intro lines, phase lines, HP thresholds, and event dialogue.
- The render-side director tracks one-time thresholds/phases, priority, cooldowns, and the boss subtitle box.

### src/render/rpg/rpg-boss-stage-director.ts (NEW, build 110)
- Stage director for boss-wave fights. Choreographs a bottom-to-boss traversal loop.
- State type: `BossStageDirectorState` — tracks stage index, timer, corridor, hazards, wisps, flash, dev mode.
- Lifecycle: `createBossStageDirectorState()`, `resetBossStageDirector()` (on enterBossWave), `advanceBossStage()` (on teleport), `deactivateBossStageDirector()` (on exitBossWave).
- Route: `getCorridorCenterX(worldY, ...)` — shared by stage director + draw module; supports centerVertical, sCurveRight, sCurveLeft per stage.
- Hazards: `VerticalRainHazard` (column rain streams avoiding the corridor) and `SweepBarHazard` (bar with gap tracking the corridor).
- Hazards have telegraph → active → fading phases; telegraph flickers before becoming dangerous.
- Collision: `updateBossStageDirector()` checks player vs. active hazards; safe zone and boss-proximity suppress damage.
- `isPlayerInStageDirectorSafeZone()` shared by stage director and `rpg-boss-attack-update.ts`.
- Context type: `BossStageDirectorCtx` — dim, playerStats, iframes, hp, spawnDamageNumber.

### src/render/rpg/rpg-boss-stage-draw.ts (NEW, build 110)
- Draws: luminous corridor glow + edge lines, wisp particles, vertical rain streams, sweep bars, boss-contact flash, dev debug overlay.
- Entry point: `drawBossStageDirector(c, state, bossEnemy, dim, glowTimeS, isLowGraphics)`.
- `setStageDirLowGraphics(enabled)` — called from `setAllDrawLowGraphics()` in `rpg-render-draw.ts`.
- Dev overlay shows: corridor bounds, boss damage window, safe zone circle, hazard hitboxes, stage info text.

### src/render/rpg/neon-trail-draw.ts
- Reusable neon particle trail rendering system for Float64Array ring-buffer trails.
- Exports `NeonTrailConfig` interface — create at module level to avoid per-frame allocation.
- Exports `beginNeonGlowBatch(mainCtx)` — clears module-level half-resolution offscreen glow canvas.
- Exports `drawNeonTrailGlow(trailXArr, trailYArr, trailHead, trailCount, trailCap, cfg, headAlpha)` — draws soft additive glow layer onto the offscreen canvas.
- Exports `drawNeonTrailCore(mainCtx, ...)` — draws a crisp, tapered, smooth quadratic bezier trail directly on the main canvas.
- Exports `endNeonGlowBatch(mainCtx)` — composites the accumulated glow back with `'lighter'` additive blending.
- Zero per-frame heap allocations; one drawImage call per batch.
- Glow canvas maintained at 0.5× main canvas resolution for fill-rate efficiency.
- Smooth paths use the midpoint quadratic bezier technique (no gradient objects per frame).

### src/render/rpg/rpg-enemy-draw.ts
- Exported pure draw functions for starter-through-Void tier enemies (~370 lines).
- Covers: Sapphire+missiles, Emerald, Amber+shards, Void, Laser, plus `drawAttackTrail`.
- Advanced enemy draw functions (Quartz and above) have been split out to `rpg-enemy-draw-adv.ts`.
- `setLowGraphicsMode()` propagates to both `rpg-enemy-draw-adv.ts` and `rpg-enemy-indicators.ts` so callers only need one call.
- Each function takes `ctx: CanvasRenderingContext2D` plus the relevant entity array(s) — no closure dependencies.
- Re-exports `drawEnemyIndicators` from `rpg-enemy-indicators.ts` for call-site compatibility.

### src/render/rpg/rpg-health-bar.ts
- Shared RPG enemy lifebar helpers.
- Exports `ENEMY_HEALTH_BAR_VISIBLE_THRESHOLD`, `enemyHealthFraction()`, and `shouldDrawEnemyHealthBar()`.
- Keeps standard, advanced, elite, boss, Binary Ring, Stardust, and procedural enemy lifebar visibility aligned.

### src/render/rpg/rpg-enemy-indicators.ts
- Extracted enemy marker renderer (~130 lines) from `rpg-enemy-draw.ts`.
- Exports `drawEnemyIndicators()` for triangle/outline/off enemy markers across all enemy tiers + boss + Aliven group centroids.
- Owns `setEnemyIndicatorLowGraphicsMode()` and local low-graphics flag, set via `rpg-enemy-draw.ts`’s `setLowGraphicsMode()` fan-out.

### src/render/rpg/rpg-enemy-draw-adv.ts
- Exported pure draw functions for advanced (Quartz-tier and above) enemies (~376 lines).
- Covers: Quartz+spikes, Ruby+bolts, Sunstone, Citrine+bolts, Iolite, Amethyst+shards, Diamond+shards, Nullstone+tendrils, Fracteryl+shards, Eigenstein+beams, teleport particles.
- Extracted from `rpg-enemy-draw.ts` (formerly 755 lines) to keep both files under ~450 lines.
- Has its own `isLowGraphicsMode` flag set via `setLowGraphicsMode()` (called through `rpg-enemy-draw.ts`'s `setLowGraphicsMode` which delegates here).
- Imported directly by `rpg-render.ts` alongside `rpg-enemy-draw.ts`.

### src/render/rpg/rpg-procedural-draw.ts  *(~567 lines after build 161)*
- Canvas rendering for the 11 original procedural creature types (DustWisp through ShadowHand) plus PlantProjectile.
- **Build 161:** Fish drawing (~400 lines) extracted to `rpg-procedural-fish-draw.ts`. All fish functions re-exported here for backward compat. `setProcLowGraphicsMode` now also delegates to `setFishDrawLowGraphics`.
- Shared helpers: `applyGlow`, `clearGlow`, `hpFrac`, `drawHitFlash`, `drawHpBar` (private).
- Orchestrator: `drawProceduralEnemies(canvas, ctx, nowMs)` — draws all 19 creature types + fish projectiles.
- Exports: `drawDustWispEnemies` through `drawShadowHandEnemies`, `drawPlantProjectiles`, `setProcLowGraphicsMode`, plus all fish functions via re-export.

### src/render/rpg/rpg-procedural-fish-draw.ts  *(new — build 161, ~467 lines)*
- Canvas rendering for the 8 fish creature types (SandFish through DiamondFish) and fish projectiles/hazards (FishMine, FishSpike, FishBolt, FishDecoy).
- Shared helpers duplicated from `rpg-procedural-draw.ts`: `applyGlow`, `clearGlow`, `hpFrac`, `drawHitFlash`, `drawHpBar`.
- Core silhouette renderer: `drawProceduralFishSilhouette` — swim-bend via power-curve, pectoral fins, tail fan, optional diamond armor facets, glow.
- Exports: `drawSandFishEnemies` through `drawDiamondFishEnemies`, `drawFishMines`, `drawFishSpikes`, `drawFishBolts`, `drawFishDecoys`, `setFishDrawLowGraphics`.

### src/render/rpg/rpg-procedural-update.ts  *(~462 lines after build 161)*
- Per-frame update logic for the 11 original procedural creature types + PlantProjectiles.
- **Build 161:** Fish update logic (~471 lines) extracted to `rpg-procedural-fish-update.ts`. All fish functions re-exported here for backward compat.
- Shared helpers: `patrolStep`, `pursueStep`, `contactDamage` (private).
- Orchestrator: `updateProceduralEnemies(arrays, ctx, deltaMs)` — builds shared school list and delegates to all creature update functions.
- Exports: `updateDustWispEnemies` through `updateShadowHandEnemies`, `updatePlantProjectiles`, plus all fish update functions via re-export.

### src/render/rpg/rpg-procedural-fish-update.ts  *(new — build 161, ~522 lines)*
- Per-frame update logic for the 8 fish creature types and fish-related projectiles/hazards.
- Core movement: `swimSchoolStep` — Boids-style schooling with separation, alignment, cohesion, player-seek, edge-avoidance, and terrain-anticipation probes.
- Species-specific: lunge (SandFish), dash+recovery (RubyFish), mine-drop (SunstoneFish), bolt-fire (SapphireFish), teleport (AmethystFish), armor cycling (DiamondFish).
- Exports: `updateSandFishEnemies` through `updateDiamondFishEnemies`, `updateFishMines`, `updateFishSpikes`, `updateFishBolts`, `updateFishDecoys`.

### src/render/rpg/rpg-enemy-updates.ts *(updated — build 169)*
- 9 exported enemy update functions covering early-wave enemy types (~530 lines after build 123).
- Covers: emerald, amber+shards, void.
- Exports the `RpgEnemyCtx` interface: a minimal shared-reference object (`mote`, `dim`, `fluid`,
  `hitEffects`, `shotLines`, `dealDamageToPlayer`, `dealDamageToPlayerKnockback`, `clampEnemyToBounds`,
  `getTerrainState`, `getNavGrid`, and (build 169) optional `getVerdureCaveWallState`).
- **Build 123:** `updateVoidEnemies` uses A* pathfinding (via `computePathSteeredDirection` from
  `rpg-pathfinding.ts`) instead of the local `terrainAwareDirection` angular probe.  Per-enemy path
  states stored in a `WeakMap<VoidEnemy, RpgPathState>` for automatic GC on despawn.
- **Build 169:** `applyEnemyVerdureWallPushOut(entity, wallState, halfSize)` — new export; applies
  soft Verdure wall repulsion (velocity nudge) + hard snap-out fail-safe.  Called centrally from
  `rpg-render-update.ts` for all enemy arrays when Verdure zone is active.
- `applyEnemyTerrainPushOut` and `terrainAwareDirection` remain as exported helpers used by
  mid/adv update files (push-out) and as a documented fallback steering option.
- `dim: { w, h }` is a live object kept in sync with `widthPx`/`heightPx` on each resize; no getter indirection needed.
- Each function takes its own entity arrays as explicit parameters, making data flow visible at call sites.
- No closure dependencies; pure transformation over given arrays + ctx reference.

### src/render/rpg/rpg-enemy-updates-mid.ts
- 7 exported enemy update functions covering mid-wave enemy types (~230 lines).
- Covers: quartz+spikes, ruby+bolts, sunstone, citrine+bolts.
- Imports `RpgEnemyCtx` from `rpg-enemy-updates.ts`; follows identical contract.
- Split from `rpg-enemy-updates.ts` to keep that file under ~400 lines.

### src/render/rpg/rpg-enemy-updates-basic.ts
- 3 exported enemy update functions for the earliest wave types (~279 lines).
- Covers: **laser enemies** (idle/decelerate/dash/overshoot/cooldown phases via `updateLaserEnemies`), **sapphire enemies + missiles** (`updateSapphireEnemies`, `updateSapphireMissiles`).
- Imports `RpgEnemyCtx` from `rpg-enemy-updates.ts`; follows identical contract.
- Split from `rpg-enemy-updates.ts` to keep that file under ~650 lines.

### src/render/rpg/polyomino-enemy-types.ts
- Type definitions for Verdure polyomino elites: `PolyominoCell`, `PolyominoEnemy`, `FissilePolyominoEnemy`, `RefractorPolyominoEnemy`, and `PolyominoLaser`.

### src/render/rpg/polyomino-enemy-factories.ts
- Factories and shared helpers for Verdure polyomino variants.
- Exports movement/fade tuning constants and helpers: `buildPolyominoSeedCells`, `stepPolyomino`, and `getPolyominoCellWorldPos`.
- Exports factories: `makePolyominoEnemy`, `makeFissilePolyominoEnemy`, `makeRefractorPolyominoEnemy`.

### src/render/rpg/polyomino-enemy-update.ts
- Per-frame update logic for Verdure polyomino variants.
- Handles grid-step movement, cell fade lifecycle, centroid refresh, contact damage, fissile split behavior, and refractor laser spawn/hit checks.

### src/render/rpg/polyomino-enemy-draw.ts
- Draw helpers for Verdure polyomino variants.
- Renders per-cell fade-in/out squares, hit-flash borders, and refractor cardinal laser beams.

### src/render/rpg/rpg-enemy-updates-adv.ts
- Re-export barrel (~20 lines); re-exports all functions from `rpg-enemy-updates-adv-early.ts` and `rpg-enemy-updates-adv-late.ts` for backward compatibility.

### src/render/rpg/rpg-enemy-updates-adv-early.ts
- Per-frame update logic for wave 40–70 enemy types: iolite, amethyst+shards, diamond+shards, nullstone+tendrils (~287 lines).
- Imports `RpgEnemyCtx` from `rpg-enemy-updates.ts`; follows identical contract.
- Exports: `updateIoliteEnemies`, `updateAmethystEnemies`, `updateAmethystShards`, `updateDiamondEnemies`, `updateDiamondShards`, `updateNullstoneEnemies`, `updateVoidTendrils`.

### src/render/rpg/rpg-enemy-updates-adv-late.ts
- Per-frame update logic for late-tier enemy types: fracteryl+shards, eigenstein+beams, teleport particles (~190 lines).
- Imports `RpgEnemyCtx` from `rpg-enemy-updates.ts`; follows identical contract.
- Exports: `updateFracterylEnemies`, `updateEigensteinEnemies`, `updateEigensteinBeams`, `updateTeleportParticles`.

### src/render/rpg/rpg-boss-update.ts
- Per-frame update orchestration for the boss enemy and boss projectiles (~234 lines).
- Exports `BossUpdateCtx` interface, `updateBossEnemy(boss, ctx, deltaMs)`, and `updateBossProjectiles(bossProjectiles, ctx, deltaMs)`.
- `updateBossEnemy` handles: dt computation, pulse/phase-transition/timer ticks, direction vectors, delegates to `updateBossBehavior` (rpg-boss-behaviors.ts), then applies contact damage and position clamp for non-wave frames.
- `BossUpdateCtx` exposes mutable closure state (danmakuSafeZone, playerIFramesMs, isBossWaveActive) via getter/setter callbacks.
- Includes `isInBottomSafeZone(px, py, dim)` local helper.

### src/render/rpg/rpg-boss-behaviors.ts
- Per-boss-ID (non-wave) movement and attack patterns for bosses 1–6 (~242 lines), extracted from `rpg-boss-update.ts`; bosses 7–12 delegated to `rpg-boss-behaviors-late.ts`.
- Exports `BossBehaviorCtx` (re-exported from `rpg-boss-behaviors-wave.ts`) and `updateBossBehavior(boss, ctx, dt, dx, dy, dirX, dirY, dist, atk1Cd, atk2Cd, deltaMs): boolean`.
- Returns `true` (boss-wave danmaku mode — delegates to `rpg-boss-behaviors-wave.ts`) or `false` (velocities only changed — caller applies position clamp).

### src/render/rpg/rpg-boss-behaviors-late.ts
- Per-boss-ID (non-wave) movement and attack patterns for bosses 7–12 (~170 lines).
- Exports `updateLateBossBehavior(boss, ctx, dt, dx, dy, dirX, dirY, dist, atk1Cd, atk2Cd, deltaMs): void`.
- Covers: invulnerability cycling (boss 7), gravity well / absorb toggle (boss 8), chaos orbit + homing (boss 9), multi-ring spiral (boss 10), danmaku ring patterns (bosses 11–12).

### src/render/rpg/rpg-boss-behaviors-wave.ts
- Boss-wave danmaku patterns extracted from `rpg-boss-behaviors.ts` (~207 lines).
- Exports `BossBehaviorCtx` (shared context interface for both boss behavior files) and `updateBossWaveBehavior(boss, ctx, dt, dx, dy, atk1Cd, atk2Cd)`.
- Three danmaku pattern types that scale with `danmakuLevel`: flower ring, spiral burst, star formation.
- Secondary attack: aimed fan of fast bullets toward the player.

### src/render/rpg/rpg-boss-draw.ts
- 4 exported pure draw functions for boss wave HUD elements (~265 lines).
- Covers: `drawBossEnemy` (sprite, HP bar, phase pips, INVULN label), `drawBottomSafeZone` (prismatic ring), `drawDanmakuSafeZone` (safe-angle wedge), `drawWaveClearBanner` (fade-in/out clear overlay).
- Each function takes `ctx: CanvasRenderingContext2D` plus explicit parameters — no closure dependencies.

### src/render/rpg/rpg-boss-attack-types.ts
- Type definitions for all six boss special attack families: `grav`, `hexTrail`, `mandala`, `vermiculate`, `missileRing`, `motherSwarm`.
- Exports: `createPrng` (mulberry32), `HazardMode` union, `TrailRing` + helpers (`createTrailRing`, `trailPush`), all attack instance interfaces, `BossAttackInstance` union, `BossAttackState`, `createBossAttackState`.
- Trail ring buffers use Float64Array for neon-trail-draw.ts compatibility.

### src/render/rpg/rpg-boss-attack-config.ts
- Data-driven attack profiles for all 10 bosses (IDs 1–10).
- Exports: `BossAttackKind`, `BossAttackKindConfig`, `BossAttackProfileConfig`, `BOSS_ATTACK_PROFILES`, `getBossAttackProfile`.
- Each boss has phase0/1/2 configs with cooldownMs, pressureScore, durationMs, and kind-specific params.

### src/render/rpg/rpg-boss-attack-update.ts
- Scheduler and per-frame update orchestrator for all boss special attacks (~230 lines).
- Exports: `BossAttackUpdateCtx` (getter/setter lambda pattern), `updateBossAttacks`, `applyBossAttackCollision`, `setBossAttacksLowGraphics`.
- Caps: MAX_ACTIVE_ATTACKS=6. Pressure-based spawn gating, per-boss-per-kind cooldowns.
- Collision uses circle/capsule geometry; delegates hit detection to per-family hazard functions.

### src/render/rpg/rpg-boss-attacks-draw.ts
- Visual rendering for all six attack families (~290 lines).
- Exports: `drawBossAttacks`, `setDrawBossAttacksLowGraphics`.
- Module-level NeonTrailConfig constants (never allocated per frame). Wraps all draws in beginNeonGlowBatch/endNeonGlowBatch.

### src/render/rpg/attacks/rpg-attack-grav.ts
- Gravitational orbital body attack: softened Newtonian gravity, well orbiting, bounce off bounds, Float64Array trail rings.
- Exports: `spawnGravAttack`, `updateGravAttack`, `getGravHazardCircles`.

### src/render/rpg/attacks/rpg-attack-hex.ts
- Hex-grid crawling lightning bolt attack: flat-top axial coordinates, warning phase, player-biased direction, segment aging.
- Exports: `hexToWorld`, `hexNeighborDir`, `spawnHexAttack`, `updateHexAttack`, `getHexHazardCapsules`, `getHexHeadCircles`.

### src/render/rpg/attacks/rpg-attack-mandala.ts
- Radial wave projectile burst attack: safe gaps near player, angular drift per wave, MAX_PROJECTILES=48 cap.
- Exports: `spawnMandalaAttack`, `updateMandalaAttack`, `getMandalaHazardCircles`.

### src/render/rpg/attacks/rpg-attack-vermiculate.ts
- Sinuous worm attack: deterministic sin-based angular noise + player bias, bounce off walls, trail ring.
- Exports: `spawnVermiculateAttack`, `updateVermiculateAttack`, `getVermiculateHazardCircles`.

### src/render/rpg/attacks/rpg-attack-missile.ts
- Guided missile attack: state machine (flying→exploding→lingering→fading), homing, expanding ring hazard.
- Exports: `spawnMissileAttack`, `updateMissileAttack`, `getMissileHazardCircles`.

### src/render/rpg/attacks/rpg-attack-swarm.ts
- Mother + follower swarm attack: mother steers toward player with noise, followers attracted to mother, index-based deterministic noise.
- Exports: `spawnSwarmAttack`, `updateSwarmAttack`, `getSwarmHazardCircles`.

### src/render/rpg/rpg-damage.ts
- Per-entity damage functions extracted from `rpg-render.ts` via factory pattern.
- Exports `DamageCtx` interface (`recordDps` callback) and `createDamageFns(ctx)` factory.
- `createDamageFns` now includes `damageBinaryRingEnemy` for the Zenith elite encounter alongside the existing enemy damage helpers.
- `damageBossEnemy` is NOT included; it lives in `rpg-boss-wave.ts` (part of boss wave lifecycle management).
- Imports entity types from `./rpg-types` / `./rpg-binary-ring-encounter` and `MINIMUM_SHIELD_DAMAGE` from `./rpg-constants`.

### src/render/rpg/rpg-lucky-motes.ts
- Pure-function module for the lucky mote drop system (~222 lines).
- Exports: `ENEMY_TYPE_TO_TIER` (enemy-type → tier ID map), `trySpawnLuckyMote`, `updateLuckyMotes`, `updateLuckyMotePopups`, `drawLuckyMotes`, `drawLuckyMotePopups`.
- All functions take explicit parameters (no closures): entity arrays, mote position, deltaMs, callbacks, isLowGraphicsMode.
- `trySpawnLuckyMote(luckyMotes, enemyTypeId, x, y, luckPct)` takes the pre-computed luck percent as a parameter; the caller (`rpg-render.ts`) provides `getCachedLuckPercent()`.
- Imports `LuckyMote`, `LuckyMotePopup` from `./rpg-types`; constants from `./rpg-constants`; `TIER_BY_ID`, `TierId` from `../../data/tiers`.

### src/render/rpg/rpg-weapon-systems.ts
- Orchestrator for all player weapon update logic for the RPG tab (~300 lines).
- Exports `RpgWeaponCtx` interface (dependency-injection context), `RpgWeaponHandle` interface, and `createRpgWeaponSystems(ctx)` factory.
- Directly implements: sand blade starter weapon only (delegates everything else to sub-modules).
- Instantiates: `chain`, `vortex`, `poison`, `sunstone`, `sand`, `sword`, `emerald`, `laserBeam`, `ships`.
- `reset()` calls reset on all nine sub-modules.

### src/render/rpg/rpg-weapon-chain.ts
- Build 166: contact damage also routes procedural/Verdure bodies through `collectEnemyBodyTargets` + `damageBodyTarget`.
- Quartz chain whip weapon system extracted from `rpg-weapon-systems.ts` (~250 lines).
- Exports `ChainWeaponCtx` interface, `ChainWeaponHandle` interface, and `createChainWeaponSystem(ctx)` factory.
- Owns `chainWhipStates: Map<string, ChainWhipState>`; exposes via getter on handle.
- Covers: `buildChainWhip` (rope node init), `stepChainPhysics` (asymmetric spring + damping), `updateChainWhip` (idle/lashing/retracting state machine, contact damage, fluid injection).

### src/render/rpg/rpg-weapon-vortex.ts
- Build 166: vortex pull and damage ticks include procedural/Verdure body targets through the generic body-target path.
- Nullstone vortex weapon system extracted from `rpg-weapon-systems.ts` (~210 lines).
- Exports `VortexWeaponCtx` interface, `VortexWeaponHandle` interface, and `createVortexWeaponSystem(ctx)` factory.
- Owns `activeVortexes: NullstoneVortex[]` and `vortexWeaponStates: Map<string, VortexWeaponState>`; both exposed via getters.
- Covers: `fireVortex` (spawn spread), `updateVortexWeapon` (cooldown), `updateVortexes` (pull, spin, damage ticks, fluid swirl).

### src/render/rpg/rpg-weapon-poison.ts
- Build 166: bolt collisions can hit procedural bodies through `damageBodyTarget`; eligible procedural enemies also receive poison debuffs.
- Iolite poison bolt weapon system extracted from `rpg-weapon-systems.ts` (~230 lines).
- Exports `PoisonWeaponCtx` interface, `PoisonWeaponHandle` interface, and `createPoisonWeaponSystem(ctx)` factory.
- Owns `poisonBolts: IolitePoisonBolt[]`; exposed via getter on handle.
- Covers: `spawnPoisonBolt`, `attachPoisonDebuff` (closure-based per-enemy debuff), `updatePoisonBolts` (movement, trail, fluid, collision), `updatePoisonDebuffs` (tick damage).

### src/render/rpg/rpg-weapon-sunstone.ts
- Build 166: mine proximity/AOE checks include procedural/Verdure body targets through the generic body-target path.
- Sunstone mine weapon system extracted from `rpg-weapon-systems.ts` (~230 lines).
- Exports `SunstoneWeaponCtx` interface, `SunstoneWeaponHandle` interface, and `createSunstoneWeaponSystem(ctx)` factory.
- Owns `sunstoneMines: SunstoneMine[]`; exposed via getter on handle.
- Covers: `layMine`, `detonateMine` (AOE damage + fluid explosion), `updateSunstoneMines` (fuse countdown, enemy contact damage, proximity trigger).

### src/render/rpg/rpg-weapon-sand.ts
- Build 166: `SandWeaponCtx` exposes generic body targeting/damage for procedural enemy collisions.
- Sand gatling projectile weapon system (~120 lines).
- Exports `SandWeaponCtx` interface, `SandWeaponHandle` interface, and `createSandWeaponSystem(ctx)` factory.
- Owns `sandProjectiles: SandProjectile[]`; exposes via getter on handle.
- Covers: `spawnSandProjectile`, `updateSandProjectiles` (movement, fluid injection, bounds check).
- Hit-testing against all enemy types is in `rpg-weapon-sand-collision.ts` via `checkSandProjectileHit`.

### src/render/rpg/rpg-weapon-sand-collision.ts
- Build 166: sand projectile collision checks include procedural/Verdure bodies through the generic body-target path.
- Per-projectile collision detection for sand gatling projectiles (~290 lines).
- Exports `checkSandProjectileHit(p, ctx): boolean` — tests one `SandProjectile` against all enemy
  arrays in the provided `SandWeaponCtx` and returns `true` if the projectile should be removed.
- Hit priority sequence: laser → sapphire → emerald → amber → void → quartz → ruby → sunstone →
  citrine → iolite → amethyst → diamond → nullstone → fracteryl → eigenstein → elite → boss.

### src/render/rpg/rpg-weapon-sword.ts
- Diamond sword combo weapon factory (~42 lines). Defines `SwordWeaponHandle` interface and `createSwordWeaponSystem(ctx)` factory.
- Combo state machine and all helpers live in `rpg-weapon-sword-combo.ts`; factory simply delegates `updateSwordCombo` calls there.
- Re-exports `SwordWeaponCtx` (defined in `rpg-weapon-sword-combo.ts`) for backwards compatibility with importers.

### src/render/rpg/rpg-weapon-sword-combo.ts
- Build 166: idle trigger, combo continuation, and arc centering include generic body targets, including procedural enemies.
- Diamond sword / sand blade per-frame combo state machine (~320 lines after extraction), extracted from `rpg-weapon-sword.ts`.
- Exports `SwordWeaponCtx` type (re-exported from `rpg-weapon-sword-combo-helpers.ts`) and `updateSwordComboForWeapon(swordComboStates, ctx, weaponId, deltaMs)`.
- Internal helpers (buildSwordCombo, angleInArc, spawnSwordBeam, swordHitInArc) are in `rpg-weapon-sword-combo-helpers.ts`.
- Covers phase state machine: idle → swing → combo_window → spin_combo, hinge physics, shard chain, fluid drag.

### src/render/rpg/rpg-weapon-sword-combo-helpers.ts
- Build 166: `swordHitInArc` applies damage through `damageBodyTarget` for shared classic/procedural hit handling while preserving the close-range terrain touch exception.
- Internal helpers for the sword combo state machine (~195 lines). Extracted from `rpg-weapon-sword-combo.ts`.
- Exports `SwordWeaponCtx` interface (DI context), `SPIN_TICK_THRESHOLDS`, `buildSwordCombo`, `angleInArc`, `spawnSwordBeam`, `swordHitInArc`.
- `SwordWeaponCtx` is re-exported from `rpg-weapon-sword-combo.ts` for backward compat.

### src/render/rpg/rpg-weapon-emerald.ts
- Build 166: primary missile seek and collision checks include procedural/Verdure body targets.
- Emerald heat-seeking player missile system (~310 lines). Sub-missiles/swirl now live in `rpg-weapon-emerald-subs.ts`.
- Exports `EmeraldWeaponCtx` interface, `EmeraldWeaponHandle` interface, and `createEmeraldWeaponSystem(ctx)` factory.
- Delegates sub-missile and swirl state to a `createEmeraldSubSystem(ctx)` instance from the companion module.
- Covers: `spawnEmeraldMissile`, `updateEmeraldPlayerMissiles` (seek, proximity burst, fizzle burst, collision).
- Re-exports `EmeraldSubsCtx` and `EmeraldSubsHandle` from `rpg-weapon-emerald-subs.ts`.

### src/render/rpg/rpg-weapon-emerald-subs.ts
- Emerald sub-missile and swirl particle system (~285 lines). Extracted from `rpg-weapon-emerald.ts`.
- Exports `EmeraldSubsCtx` (structural subset of `EmeraldWeaponCtx` minus `mote`), `EmeraldSubsHandle`, and `createEmeraldSubSystem(ctx)` factory.
- Covers: `spawnEmeraldSubMissiles` (cone or 360° burst), `spawnEmeraldSwirlExplosion`, `updateEmeraldSubMissiles` (seek, decel, AOE), `updateEmeraldSwirlParticles`.

### src/render/rpg/rpg-weapon-laser-beam.ts
- Ruby laser beam weapon orchestrator extracted from `rpg-weapon-systems.ts` (~230 lines after hit-sweep extraction).
- Exports `LaserBeamWeaponCtx` interface, `LaserBeamWeaponHandle` interface, and `createLaserBeamWeaponSystem(ctx)` factory.
- Owns `let laserBeamEffect: LaserBeamEffect | null`; exposed via getter on handle.
- Delegates beam collision/damage sweep to `rpg-weapon-laser-beam-hits.ts`.
- Covers: `fireLaserBeam` (instantaneous ray cast + helper-driven hit sweep + fluid beam injection), `updateLaserBeamEffect` (aging/deactivation).

### src/render/rpg/rpg-weapon-laser-beam-hits.ts
- Ruby laser beam hit-sweep helper extracted from `rpg-weapon-laser-beam.ts`.
- Exports `LaserBeamHitSweepCtx` and `applyLaserBeamHitSweep(ctx)`.
- Owns beam-path collision checks and per-enemy/boss damage + hit-effect + damage-number side effects for all enemy families.

### src/render/rpg/rpg-weapon-ships.ts
- Sapphire companion ship system and combined factory (~270 lines). Amethyst ships now live in `rpg-weapon-amethyst-ships.ts`.
- Exports `ShipWeaponCtx` interface (structural subset of `RpgWeaponCtx`), `ShipWeaponHandle` interface, and `createShipWeaponSystems(ctx)` factory.
- Delegates amethyst state to a `createAmethystShipSystem(ctx)` instance from the companion module.
- Module-level helpers: `updateShipTrail` (circular trail buffer) and `getTargetMaxHp` (extracts max HP from `ClosestTarget`).
- Covers sapphire ships only: orbit targeted enemy, fire fast curving lasers (`syncSapphireShips`, `updateSapphireShips`, `updateSapphireLasers`).

### src/render/rpg/rpg-weapon-amethyst-ships.ts
- Amethyst companion ship system (~240 lines). Extracted from `rpg-weapon-ships.ts`.
- Exports `AmethystShipCtx` (structural subset of `ShipWeaponCtx`), `AmethystShipHandle`, and `createAmethystShipSystem(ctx)` factory.
- Covers: `syncAmethystShips`, `updateAmethystShips`, `spawnAmethystLaser`, `updateAmethystLasers` (spiral pierce projectiles).

### src/render/rpg/rpg-targeting.ts
- Targeting orchestrator for the RPG tab extracted from `rpg-render.ts` (~80 lines after helper extraction).
- Re-exports `RpgTargetingCtx` and `RpgTargetingHandle` from `rpg-targeting-types.ts`.
- Owns `targetedEnemy: object | null` state (moved from `rpg-render.ts`).
- Wires helper modules and exposes handle methods:
  - nearest queries from `rpg-targeting-nearest.ts`
  - target collection/state queries from `rpg-targeting-targets.ts`
  - local `damageBodyTarget` damage dispatch and `tryTargetEnemyAt` target-clear stub.

### src/render/rpg/rpg-targeting-nearest.ts
- Nearest-target query helpers extracted from `rpg-targeting.ts`.
- Exports `findClosestTarget(ctx, rangeSq)` (closest entity incl. projectiles + Aliven particles) and `findClosestEnemy(ctx, rangeSq)` (closest enemy body only).

### src/render/rpg/rpg-targeting-targets.ts
- Build 166: `getTargetedEnemy` first reconstructs stale/manual targets from the centralized body target list, covering all procedural enemy families.
- Target collection and targeted-enemy resolution helpers extracted from `rpg-targeting.ts`.
- Exports `collectEnemyBodyTargets(ctx)`, `findClosestEnemyFrom(ctx, x, y, rangeSq)`, and `getTargetedEnemy(ctx, targetedEnemy)`.
- Keeps `ClosestTarget` assembly logic centralized for RPG targeting and multi-target weapon paths.

### src/render/rpg/rpg-targeting-types.ts
- Type-only home for targeting contracts extracted from `rpg-targeting.ts`.
- Exports `RpgTargetingCtx` (all enemy arrays + damage dispatch callbacks) and `RpgTargetingHandle` (public targeting API).
- Includes Binary Ring elite arrays and `damageBinaryRingEnemy`, so generic targeting can lock onto the Zenith encounter body.
- Keeps runtime logic in `rpg-targeting.ts` while preserving existing import compatibility through type re-exports.

### src/render/rpg/rpg-binary-ring-encounter.ts
- Self-contained Zenith elite encounter module for the Binary Ring boss-like enemy.
- Exports encounter types (`BinaryRingEnemy`, `BinaryRingMissile`, `BinaryLaserSweep`, age/phase unions), `BINARY_RING_CONFIG`, factory helpers, update functions, and `drawBinaryRingEncounter()`.
- Owns the phase cycle (evolve → laser telegraph/attack → missile telegraph/attack → optional age transition), homing missile logic, sweeping laser logic, and ring/missile/laser draw passes.
- Integrated by `rpg-render-update.ts` for per-frame simulation and by `rpg-render.ts → drawZoneBgOverlay` for presentation.

### src/render/rpg/rpg-player-attack.ts
- Player auto-attack context and dispatcher (~222 lines).
- Exports `RpgPlayerAttackCtx` interface and `performWeaponAttack(ctx, weaponId)`.
- `RpgPlayerAttackCtx` carries all enemy arrays, damage functions, visual spawners, fluid reference, targeting callback, and weapon-system spawn callbacks via DI.
- Handles delegating weapon kinds inline (gatling, chainWhip, vortex, swordCombo, poisonBolt, emeraldMissile, laserBeam, sunstoneMine) and delegates aoe/multi/single to the three handler modules below.
- `rpg-render.ts` initialises `playerAttackCtx` after `weaponSystems` is created.

### src/render/rpg/rpg-crafted-post-hit.ts
- Shared crafted-weapon post-hit effects. Exports `makeFracterylPool(strikes)` and `applyCraftedPostHit(...)`.
- `damageFollowUpTarget` (module-private): comprehensive dispatch across all ClosestTarget variants reachable via RpgPlayerAttackCtx.
- Fracteryl follow-ups never re-enter the function (no recursion). Multi/AoE share one pool to cap total follow-ups.

### src/render/rpg/rpg-player-attack-aoe.ts
- AOE weapon attack handler. Exported: `performAoeAttack(ctx, rawDamage, aoeRadius, armorIgnore?, craftedMods?, rangeSq?, equipment?)`.
- Loops all enemy arrays within `aoeRadius` of the mote, applies lens statuses via shared equipment/status helpers, emits fluid explosion, then calls `applyCraftedPostHit` once at mote center.

### src/render/rpg/rpg-player-attack-multi.ts
- Multi-target weapon attack handler. Exported: `performMultiAttack(ctx, rawDamage, rangeSq, targetCount, armorIgnore?, craftedMods?, equipment?)`.
- Collects all in-range entities into a typed `MultiSortEntry[]`, sorts by distance, damages the closest N.
- Applies Tier 1 lens statuses through `applyTier1LensStatusesToEnemy`, then calls `applyCraftedPostHit` per target with a shared Fracteryl pool.

### src/render/rpg/rpg-player-attack-single.ts
- Single and piercing weapon attack handler. Exported: `performSingleAttack(ctx, rawDamage, rangeSq, isPiercing, defPierceRatio, shotColor, craftedMods?, equipment?)`.
- Uses `findClosestTarget`, applies lens/status helpers, dispatches to the matching damage/visual call, then delegates to `applyCraftedPostHit`.

### src/render/rpg/rpg-player-damage.ts
- Player damage application and hit-visual helpers extracted from `rpg-render.ts` (~198 lines).
- Exports `PlayerDamageCtx` interface, `PlayerDamageHandle` interface, and `createPlayerDamageFns(ctx)` factory.
- `PlayerDamageCtx` carries live references to `mote`, `playerStats`, getter/setter for `playerIFramesMs`, and the `hitEffects`, `shotLines`, and `damageNumbers` arrays.
- Covers: `spawnDamageNumber` (floating text with font-size proportional to damage ratio), `spawnHitVisualsAt` (hit flash + shot line + damage number), `spawnHitVisuals` (thin wrapper for laser enemies), `dealDamageToPlayer` (defence-reduced iframe-gated damage), `dealDamageToPlayerKnockback` (same with directional mote velocity impulse), `updateShotVisuals` (timer advancement + pruning), `updateDamageNumbers` (decelerating float + iframe timer).
- `rpg-render.ts` constructs `playerDamageCtx` early (after state declarations) and destructures all seven functions from the handle.

### src/render/rpg/rpg-player-movement.ts
- Player physics and movement extracted from `rpg-render.ts` (~288 lines).
- Exports `PlayerMovementCtx` interface, `PlayerMovementState` interface, and `updatePlayerMovement(ctx, state, deltaMs)` function.
- `PlayerMovementCtx` carries the mote, joystick, keyboard state, canvas dimensions, all enemy arrays (for auto-move), fluid handle, rpgSimState, and effective-weapon-ids accessor.
- `PlayerMovementState` holds `glowMovementIntensity` and `playerAimAngle` — both are read and mutated in place each frame.
- Covers: joystick/keyboard input → velocity, auto-move nearest-enemy steering, position clamping, distance-gated comet trail, glow intensity LERP ramp, aim angle tracking, and player-movement fluid injection.
- `rpg-render.ts` owns `playerMovementState: PlayerMovementState` (shared with `weaponCtx.playerAimAngle` getter and the draw trail).

### src/render/rpg/rpg-orbit-projectile.ts
- Orbit projectile update logic extracted from `rpg-render.ts` (~297 lines).
- Exports `OrbitProjectileCtx` interface and `updateOrbitProjectile(ctx, op, deltaMs)` function.
- `OrbitProjectileCtx` carries the player mote, a `bossEnemy` getter, all 17 enemy arrays, `hitEffects` array, 18 per-enemy damage functions, and `spawnDamageNumber` callback.
- Covers: angle/position update (counter-clockwise, ORBIT_PROJ_SPEED_RAD), distance-gated trail, per-enemy hit cooldown advancement, and collision detection vs. all enemy types + boss.
- `rpg-render.ts` owns `orbitProjectileCtx: OrbitProjectileCtx` and passes `orbitProjectile` (nullable) each frame.

### src/render/rpg/rpg-input.ts
- Pointer and keyboard input handling for the RPG tab (~140 lines).
- Extracted from `rpg-render.ts` to isolate input translation from game logic.
- Exports `RpgInputCtx` interface, `RpgInputHandle` interface, and `createRpgInput(ctx)` factory.
- Registers canvas pointer events (pointerdown/move/up/cancel) → virtual joystick state.
- Registers document keyboard events (WASD + Arrow keys) → `RpgKeyState`.
- Detects short taps (≤250ms, ≤10px movement) and calls `tryTargetEnemyAt` for manual enemy targeting.
- Provides `dispose()` to remove document-level keyboard listeners.
- `rpg-render.ts` calls `createRpgInput({ canvas, dim, joystick, keys, getIsActive, tryTargetEnemyAt })` at init time.

### src/render/rpg/rpg-wave-manager.ts
- Wave lifecycle management extracted from `rpg-render.ts` (~220 lines after dead-enemy sweep extraction).
- Exports `WaveManagerCtx` interface, `WaveManagerHandle` interface, and `createWaveManager(ctx)` factory.
- Scalar state (`currentWave`, `isInterWave`, `bossEnemy`, `isBossFightFromMenu`, `interWaveTimerMs`) is accessed through getter/setter lambdas on `WaveManagerCtx` so `rpg-render.ts` retains authoritative ownership.
- Covers four functions: `removeDeadEnemies` (delegates to `rpg-wave-dead-enemies.ts`), `startNextWave` (increment counter, skip boss waves, build spawn queue), `checkWaveCompletion` (detect all-clear, start inter-wave delay), `tickSpawnQueue` (drain timed spawn queue, delegates spawning to `rpg-enemy-spawn.ts`).
- Terrain hooks now gate enemy spawning until topographic terrain finishes its grow-in animation, then trigger terrain shrink on wave clear.
- Enemy placement logic (`spawnEnemyById`) extracted to `rpg-enemy-spawn.ts`; dead-enemy sweep extracted to `rpg-wave-dead-enemies.ts`.
- Build 174: Horizon → Nadir 10th-wave cube encounters are now auto-managed outside the spawn queue; wave completion waits for cube-point enemies plus their mines/trails/bolts/link-lasers to clear.

### src/render/rpg/nadir-cube-point-types.ts
- Shared type home for the Nadir cube-point encounter.
- Exports cube projection constants, `NadirCubeProjectionState`, `projectNadirAnchor()`, and the enemy/hazard interfaces used across update, draw, targeting, and damage modules.

### src/render/rpg/nadir-cube-point-update.ts
- Spawn + simulation logic for awakened cube lattice points in Horizon → Nadir.
- Exports `spawnNadirCubeEncounter()`, `updateNadirCubePointEnemies()`, `clearNadirCubeEncounter()`, and `NADIR_CUBE_POINT_RADIUS`.
- Handles deterministic anchor selection from the lattice shell/core set, per-frame re-projection, and hazard behaviors (mines, trail segments, turret bolts, link lasers).

### src/render/rpg/nadir-cube-point-draw.ts
- Canvas draw pass for Nadir cube-point enemies and their hazards.
- Exports `drawNadirCubeEncounter()` plus per-hazard helpers and `setNadirCubeLowGraphics(enabled)`.
- Draws the encounter above the zone background/terrain layers but below regular enemy bodies.

### src/render/rpg/terrain/topographic-terrain.ts
- Build 166: Caustics/seafloor terrain profile routes to classic `topographic` contour islands with the `cyanTactical` palette; `seafloorRidges` remains available but unused by Caustics.
- Self-contained seeded terrain orchestrator for RPG waves. Now supports deterministic
  biome scheduling plus multiple terrain variants behind one collision/render API.
- **Build 161:** Collision helpers extracted to `topographic-terrain-collision.ts`.
  All public collision API is re-exported from this file via `export * from './topographic-terrain-collision'`
  so existing consumers are unaffected. File reduced from ~1832 to ~963 lines.
- **Build 147+:** All four terrain collision helpers and `signedDistanceToTerrainBoundary` now handle
  `seafloorRidges` via capsule math.
- **Build 146+:** `RpgTerrainKind = 'none' | 'topographic' | 'recursiveSquares' | 'basalt' | 'seafloorRidges' | 'reserved4' | 'reserved5'`.
- **Build 125+:** `getTerrainKindForWave(waveNumber, isBossWave)` assigns 20-wave biome slots.
- Exports deterministic terrain generation/render helpers plus geometry helpers:
  `generateTopographicTerrain`, `beginWaveTerrain`, `updateTopographicTerrain`,
  `beginTopographicTerrainShrink`, `renderTopographicTerrain`,
  `isPointInsideTopographicTerrain`, `segmentIntersectsTopographicTerrain`,
  `circleIntersectsTopographicTerrain`, `terrainFirstIntersectionT`,
  `hasTopographicTerrainLineOfSight`, `getTopographicTerrainSolidPolygons`,
  `pushPointOutsideTopographicTerrain`, `signedDistanceToTerrainBoundary`,
  `computeTerrainRepulsionForce`, `setTopographicTerrainDevMode`, `RING_POINTS`.
- `RING_POINTS = 64` — number of polygon points per ring and solid outer polygon.
- Builds 2–5 irregular contour islands per wave using a seeded PRNG, palette cycling,
  staggered ring growth/shrink animation.
- **Build 84+:** calls `buildMergedContours` from `topographic-terrain-field.ts` at
  generation time; `renderTopographicTerrain` draws merged scalar-field contours.
- **Build 85+:** `lightCache: TopographyLightCache | null` on terrain state stores
  the baked lighting overlay.

### src/render/rpg/terrain/topographic-terrain-collision.ts  *(new — build 161)*
- Extracted from `topographic-terrain.ts`. Owns all spatial query functions for terrain:
  point-inside, segment-intersection, circle-intersection, line-of-sight, ray-march,
  solid-polygon export, signed-distance, push-out, and repulsion force.
- Handles all terrain variants: `topographic`, `recursiveSquares`, `basalt`, `seafloorRidges`.
- Exports: `isPointInsideTopographicTerrain`, `segmentIntersectsTopographicTerrain`,
  `circleIntersectsTopographicTerrain`, `hasTopographicTerrainLineOfSight`,
  `terrainFirstIntersectionT`, `getTopographicTerrainSolidPolygons`,
  `signedDistanceToTerrainBoundary`, `pushPointOutsideTopographicTerrain`,
  `computeTerrainRepulsionForce`.
- All exported from `topographic-terrain.ts` via re-export; import from either path.

### src/render/rpg/terrain/recursive-square-terrain.ts  *(new — build 124)*
- Generates and renders the `recursiveSquares` terrain variant.
- `RecursiveSquareNode` — one rotated square: centre, half-size, angle, depth, colors,
  bounding radius, and precomputed world-space corners.
- `generateRecursiveSquareTerrain(seed, waveNumber, canvasW, canvasH)` — deterministic
  tree of up to `MAX_DEPTH=4` nested squares.  Children attach to random sides of parents
  with configurable overlap (35–85 %).  Player safe-zone (70 px around canvas centre)
  excluded.  Returns a flat parent-before-children list for collision iteration.
- `getSquareNodeGrowthAlpha01(depth, squareMaxDepth, growth01)` — staggered animation
  helper: root squares appear first, deeper children follow.
- `renderRecursiveSquareTerrain(ctx, squareNodes, squareMaxDepth, growth01)` — dark fill,
  crisp depth-scaled outline, faint glow on root/d1 squares, corner accent dots on roots.
- Imported by `topographic-terrain.ts`; not used directly outside the terrain module.

### src/render/rpg/terrain/basalt-terrain.ts  *(new — build 125)*
- Generates and renders the `basalt` terrain variant.
- `BasaltHexCell` — one pointy-top hex column: center, circumradius, 6 world-space corners,
  height scalar, fill/line colors, appear delay, and cluster id.
- `BasaltTerrainState` — `cells`, `solidPolygons`, and normalized sun direction for shadows.
- `generateBasaltTerrain(seed, waveNumber, canvasW, canvasH)` — deterministic 1–2 cluster
  hex-field generator with player-safe-zone exclusion, edge margins, organic noise boundary,
  per-cell height shading, and a 200-cell cap for performance.
- `getBasaltCellAlpha(cell, growth01)` — staggered grow-in helper used by both renderer and
  collision dispatch.
- `renderBasaltTerrain(ctx, basalt, growth01)` — draws offset column shadows first, then fills,
  then outlines.
- Imported by `topographic-terrain.ts`; not used directly outside the terrain module.

### src/render/rpg/terrain/topographic-lighting-types.ts
- Shared type definitions for the topography lighting system.
- Exports `TopographyLightConfig`, `TopographyLightCache`, and
  `TopographyLightSamplingData`.
- Imported by `topographic-terrain.ts` (to type `lightCache`) and by
  `topographic-lighting.ts` (implementation).  Kept separate to prevent a
  circular dependency.
- `TopographyLightSamplingData` is the safe read-only interface for future
  entity-shadow code; obtain it via `getActiveTopographyLightSamplingData()`.

### src/render/rpg/terrain/topographic-lighting.ts
- Cached topography directional-lighting overlay for RPG terrain.
- Exports `buildTopographyLightCache`, `renderTopographyLighting`,
  `renderPersistentTopographySunlight`, `setTopographyLightConfig`,
  `setTopographyLightingDevMode`, `getActiveTopographyLightSamplingData`, and
  `DEFAULT_TOPOGRAPHY_LIGHT_CONFIG`.
  Also re-exports `TopographyLightConfig`, `TopographyLightCache`, and
  `TopographyLightSamplingData` from `topographic-lighting-types.ts`.
- Bakes a coarse scalar-height grid from terrain islands, projects directional
  shadows away from the light source with length scaled by local contour height,
  smooths grids with a separable **Gaussian** blur, combines slope shading and
  shadow into a light grid, then composites highlight, shadow, and faint beam
  shafts into an offscreen canvas.
- **Build 118+:** keeps long cast shadows visible on the ground, removes the
  render-time blur that smeared them into a black silhouette fringe, and applies
  a tiny height-based alpha fade to terrain lighting edges.
- `renderPersistentTopographySunlight` draws the warm sunlight fill every RPG
  frame from a cached offscreen canvas, independent of active terrain, so
  sunlight persists between waves without rebuilding the gradient each frame.
- The lighting grid uses 8 px cells, quantizes growth to 10 cache levels, and
  applies a small draw-time blur to the mountain lighting overlay.  This keeps
  shaded edges soft while avoiding the costly 4 px grid/ray-cast rebuilds.
- During terrain growth, cache invalidation quantizes `growth01` and rebakes the
  height grid at that height.  This makes cast shadows lengthen laterally away
  from the light source instead of scaling outward from the terrain centroid.
- Cache is stored on `TopographicTerrainState.lightCache`; a new wave
  creates a fresh state (cache starts `null`).  Within a wave the cache
  rebuilds only when canvas size, palette, or light config changes — no
  per-frame rebuild during stable gameplay.
- `getActiveTopographyLightSamplingData(state)` returns a `TopographyLightSamplingData`
  snapshot for future entity-shadow code (read-only access to heightGrid, shadowGrid,
  lightGrid, cellSizePx, gridW/H, and lightAngle).
- Dev mode visualizes the baked height map, shadow map, and light-direction arrow.

### src/render/rpg/terrain/topographic-terrain-field.ts
- Scalar field + Marching Squares contour extraction for smooth terrain merging.
- **Scalar field:** each island contributes a smooth height blob (island radius / distance,
  clamped); overlapping islands combine additively so their fields merge naturally.
- **Marching Squares:** extracts contour polylines at 9 threshold levels from the combined
  field; saddle-point disambiguation uses cell-centre average value.
- **Polyline stitching:** builds a segment-adjacency graph, walks chains to form closed or
  near-closed polylines; polylines with < 3 points are discarded.
- `buildMergedContours(islands, canvasW, canvasH, palette, colorOffset, seed)` returns
  `MergedTopographicContours` with `levels` (ordered outermost-first) and `solidBoundaries`
  (the outermost level's polylines, used for collision).
- Computed once per wave at generation time; zero per-frame cost.

### src/render/rpg/terrain/rpg-pathfinding.ts *(updated — build 169)*
- Grid-based A* pathfinder for RPG entity navigation around topographic terrain obstacles.
- **Grid:** `buildRpgNavigationGrid(terrain, widthPx, heightPx, cellSizePx?)` — builds a
  flat `Uint8Array` blocked/walkable grid.  Cell is blocked if its centre is inside terrain
  or a 12 px clearance circle overlaps terrain.  20 px default cell size.
- **Soft obstacles (build 169):** `RpgNavGrid` now includes `moveCost: Uint8Array` (all-1s by
  default).  `applyCircleSoftObstacles(navGrid, circles)` marks cells within each circle as
  cost=`SOFT_OBSTACLE_COST` (8).  A* multiplies edge cost by `moveCost[nidx]`, so soft cells
  are 8× more expensive but never fully blocked.  Used for Impetus asteroids.
- **A\*:** `findRpgPath(navGrid, startX, startY, goalX, goalY, terrain)` — 8-directional,
  no diagonal corner-cutting.  Blocked start/goal cells are snapped to nearest walkable.
  Result is post-processed with a line-of-sight funnel to collapse straight segments.
- **Steering:** `getPathSteeringDirection(path, idxRef, x, y, lookaheadPx?)` — looks ahead
  along the path for a smooth direction.  `computePathSteeredDirection(...)` is a one-call
  helper that calls `updateEntityPathState` + `getPathSteeringDirection`.
- **Path state:** `RpgPathState` — per-entity mutable state (path, waypointIdx, targets,
  nextRepathMs, stuckMs).  Created with `createRpgPathState()`.  Player uses a module-level
  singleton; enemies use a `WeakMap` (auto-GC'd on despawn).
- **Repath throttling:** player every ~300 ms (`PLAYER_REPATH_MS`); enemies every ~600 ms
  (`DEFAULT_REPATH_MS`) ±20 % jitter.  Stuck detection forces an earlier repath.
- **Debug:** `drawRpgPathfindingDebug(ctx, enabled, navGrid, playerPath, enemyPaths)` —
  draws blocked cells in translucent red, soft-obstacle cells in yellow, paths in cyan/orange.
  No-op when disabled.

### src/render/rpg/terrain/caustics-texture.ts  *(new — build 149, updated build 150)*
- Procedural Voronoi/Worley F2−F1 caustic texture generator and cache.
- Generates two distinct tile variants per quality tier (variant A — seed `_SEED_A`; variant B — seed `_SEED_B`).  Four cached canvases total: `_tileHighA/B`, `_tileLowA/B`.
- High-quality tiles: 256×256 px, 25 seeds.  Low-quality tiles: 128×128 px, 16 seeds.
- Seamlessly tileable via toroidal (periodic) boundary conditions on seed distances.
- `getCausticsTextureTile(lowGraphics)` — returns variant A tile (for Layers A and C).
- `getCausticsTextureTile2(lowGraphics)` — returns variant B tile (for Layer B).
- `prewarmCausticsTextures()` — eagerly generates all four tiles; call before first Caustics frame.
- `invalidateCausticsTextureCache()` — clears all four cached canvases.
- `_generateTile(size, nSeeds, seed)` — internal generator; `putImageData` called once, never per frame.

### src/render/rpg/terrain/caustics-overlay.ts  *(build 140, updated builds 148–150)*
- Stateless underwater zone overlay for Caustics.
- `drawCausticsBackground()` — deep-water atmosphere gradient (near-black navy → murky seafloor teal)
  plus a soft radial floor glow pool at the seabed (high-graphics only).
  Gradients cached by context + dimensions — no per-frame allocation on the fixed 360×640 canvas.
- `drawCausticsFloorEffects()` — caustic light network, intensity mask, shimmer bands, rising bubbles.
- **Build 149+:** `_drawCausticsTileLayers()` draws 2–3 drifting `CanvasPattern` layers with
  `globalCompositeOperation = 'screen'`.  Layers A and C use variant-A tile; Layer B uses
  variant-B tile (different Voronoi topology) to break the wallpaper-repeat effect.
  Layer B also has a very slow rotation (~0.015 rad/s) via the DOMMatrix transform.
  Module-level `DOMMatrix` objects (`_matA`, `_matB`, `_matC`) replace new object literals — only
  `e`/`f` (translation) and Layer B's rotation components are mutated per frame.
- **Build 150+:** `_drawCausticsIntensityMask()` — cached gradient that darkens the top 30% of the
  canvas by up to 16% alpha, making caustics feel concentrated on the seafloor.

### src/render/rpg/terrain/seafloor-terrain.ts  *(new — build 146, updated build 147)*
- Dedicated seafloor ridge/channel terrain generator for the Caustics zone.
- Replaces the generic topographic contour generator for `terrainProfile === 'seafloor'`.
- **Build 147+:** `SeafloorCollisionSegment` type — capsule (x1,y1,x2,y2,radius) for a hard ridge section.
  `SeafloorRidge.collisionSegments` and `SeafloorTerrainData.allCollisionSegments` hold all capsules.
  `generateSeafloorTerrain()` now calls `_generateRidgeCollisionSegments()` for each ridge: 25–45% blocked,
  1–3 non-contiguous spans, edge exclusion zones, min gap 55 px, radius = 38% body width.
  `renderSeafloorTerrain()` draws a brighter teal marker over each blocked capsule (Task D visual clarity).
- `generateSeafloorTerrain(seed, canvasW, canvasH)` — creates 4–7 elongated sinuous ridges spanning the arena width with gentle diagonal bias and sine-wave undulation. Deterministic from wave-derived seed; coordinate-stable across resizes.
- `renderSeafloorTerrain(ctx, data, growth01, lowGraphics)` — wide soft body stroke + narrow teal crest highlight per ridge. Low-graphics mode halves ridge count and skips crest strokes.
- Imported and dispatched by `topographic-terrain.ts` via `terrainKind === 'seafloorRidges'`.

### src/render/rpg/terrain/impetus-overlay.ts *(updated — build 169)*
- Stateless Impetus-space overlay with deterministic starfield, nebula haze, gravity wells, and decorative asteroid drift.
- Exports `drawImpetusBackground()` for the atmosphere pass, `drawImpetusFloorEffects()` for post-terrain space visuals, `getImpetusDevLine(lowGraphics)` for the dev overlay, and (build 169) `getImpetusAsteroidObstacles(widthPx, heightPx)` which returns obstacle circles for the 7 static asteroid base positions (used by `applyCircleSoftObstacles` in `rpg-render.ts`).
- Low-graphics mode now renders a simplified two-ring gravity well (`_drawGravityWellsSimple()`) instead of skipping them entirely.
- Star alpha boosted by 1.4× in low-graphics mode; background base alpha raised to 0.50.

### src/render/rpg/terrain/rpg-verdure-render.ts
- Visual renderer for Verdure environmental hazards and decorative growth.
- `drawVerdureEdgeRocks()` is now a deprecated fallback; active Verdure cave wall rendering lives in `verdure-cave-walls.ts`, while this module still owns Verdure plants and death fragments.
- Renders 7 plant types: vine, spiral, flower, leafy, thorn, fern, mushroom. Ferns have paired alternating leaflets with midrib lines; mushrooms have dome caps with bioluminescent glow and spots.
- Targetable plants show a glow outline in high-graphics or a ring at the tip in low-graphics.

### src/render/rpg/terrain/verdure-cave-walls.ts *(updated — build 169)*
- Verdure-only cave wall system: deterministic inner-boundary depth generation, edge anchor-point precomputation, wall collision queries, soft repulsion, hard push-out, cached Voronoi wall textures, dev debug draw, and nav-grid integration.
- Exports `generateVerdureCaveWalls`, `isPointInVerdureWall`, `pushPointOutsideVerdureWall`, `computeVerdureWallRepulsion`, `drawVerdureFloor`, `drawVerdureCaveWalls`, `drawVerdureWallDebug`, depth-sampling helpers (`sampleVerdureTopDepth`, `sampleVerdureBottomDepth`, `sampleVerdureLeftDepth`, `sampleVerdureRightDepth`), `drawVerdureRimStrips`, and (build 169) `applyVerdureWallsToNavGrid(state, navGrid)`.
- **Build 169 changes**: `_buildEdgePoints()` suppresses top/bottom edge anchors within 80 px of canvas corners, preventing dual-strip overlap in all four corners. `applyVerdureWallsToNavGrid` marks nav-grid cells inside the wall band as `blocked=1`, using the same spatial query as player/enemy collision.
- `drawVerdureFloor` and `drawVerdureCaveWalls` are used on elite waves (multiples of 10) only; other waves use `verdure-segmented-surface.ts`.
- Both `textureCanvas` and `floorTextureCanvas` are built lazily and cached by seed + canvas size.

### src/render/rpg/terrain/verdure-segmented-surface.ts *(added — build 164)*
- Crisp segmented floor/wall surface for non-elite Verdure waves (wave % 10 !== 0).
- Floor: jittered-grid triangulation (~18 px cells → 2 triangles each) with seeded random facing directions and directional lighting baked in.
- Walls: Voronoi cells computed via Sutherland-Hodgman half-plane clipping; masked to wall region using ImageData alpha compositing.
- Exports `VerdureInfluenceObj`, `drawVerdureFloorSegmented(canvas2d, wState, lowGraphics)`, `drawVerdureWallsSegmented(canvas2d, wState, lowGraphics, influences)`.
- Static base (floor + walls) is baked once to an offscreen canvas and cached by seed/size/lowGraphics.
- Dynamic tint: per-frame, nearby combat objects (enemies, player) tint facing segments via dot-product front-facing test and distance falloff. Pre-allocated Float32Array accumulators avoid GC pressure.
- Rim-strip highlights (from `drawVerdureRimStrips`) are baked into the static canvas for crisp inner-edge lines.

### src/render/rpg/rpg-wave-dead-enemies.ts
- Dead-enemy sweep orchestrator extracted from `rpg-wave-manager.ts`.
- Exports `removeDeadEnemiesImpl(ctx, addKill)` and keeps API stable for `rpg-wave-manager.ts`.
- Delegates regular enemy-array sweeps to `rpg-wave-dead-enemies-standard.ts` and elite/aliven/boss logic to `rpg-wave-dead-enemies-special.ts`.
- Called by `rpg-wave-manager.ts`'s `removeDeadEnemies()` closure.

### src/render/rpg/rpg-wave-dead-enemies-standard.ts
- Standard dead-enemy sweep pass for normal enemy arrays and shard/projectile cleanup.
- Handles fluid explosion effects, lucky mote attempts, kill-counter increments, and XP accumulation for non-elite/non-boss kills.
- Returns accumulated XP for application by the orchestrator.

### src/render/rpg/rpg-wave-dead-enemies-special.ts
- Special dead-entity sweep pass for elite enemies, aliven groups, and boss defeat handling.
- Elite/aliven helpers return XP contributions; boss handling applies boss XP immediately and performs completion/secret-flag updates.
- Keeps secret-achievement and telemetry side effects centralized away from standard enemy loops.

### src/render/rpg/rpg-enemy-spawn.ts
- Enemy placement logic extracted from `rpg-wave-manager.ts` (~210 lines).
- Exports `EnemySpawnCtx` interface (minimal subset of `WaveManagerCtx`) and `spawnEnemyById(ctx, enemyTypeId)` function.
- Selects a random canvas position via rejection sampling (stays ≥80 px from the player); void and nullstone enemies spawn at canvas edges.
- Imports all enemy factory functions from `rpg-factories.ts` and enemy/canvas size constants from `rpg-constants.ts` / `rpg-enemy-constants.ts`.

### src/render/rpg/rpg-soft-wire.ts
- Shared soft-body wire renderer for all visible wires in the RPG stats panel.
- Exports `RopeNode`, `SoftWireData`, `SoftWireRenderer`, and `createSoftWireRenderer(panelEl)` factory.
- Owns: SVG overlay element, Verlet-rope physics (ROPE_N=24 nodes), per-wire linearGradient colour bleed, slurp/retract animation, shared drag-preview rope polyline.
- `createWire(srcColor, dstColor)` allocates SVG elements and a tip-handle div for one wire.
- `updateLockedWire` / `updateSlurpingWire` / `setDragPreview` / `updateDragPreviewPhysics` / `hideDragPreview` are called per-frame by `rpg-equip-wiring.ts`.

### src/render/rpg/rpg-stats-panel.ts
- RPG stats panel logic layer: DPS tracking, equip-wiring registration, and per-frame update (~500 lines after DOM extraction).
- Exports `RpgStatsPanelCtx` interface, `RpgStatsPanelHandle` interface, and `createRpgStatsPanel(ctx)` factory.
- DOM construction delegated to `rpg-stats-panel-dom.ts` via `buildStatsPanelDom()`.
- Owns: DPS rolling-window tracker (10-second window, per-weapon attribution), HP/Reg/Def display updates, weapon stat rows, **XP reservoir display**, multiplier box UI (progress bars + level text), and equip-wiring plug registrations.
- All visible wires use the unified soft-body system via `createEquipWiringSystem` (see `rpg-equip-wiring.ts`).
- Box 1: 5 weapon-source output plugs + square purple `playerXpIn` socket at the bottom; Box 2: XP reservoir drain to connected modifier box or player XP socket; Boxes 3–5: multiplier boxes with progress/level.
- Wire state tracking: `equippedByWire` set, `xpTargetModifier` index, `xpTargetPlayer` bool, `statModifiers` map (slotIdx:statKey → **number[]** — supports additive stacking of multiple modifier boxes on the same stat).
- **Additive multiplier stacking**: `getWeaponStatMultiplier` sums all connected modifier box levels (e.g. x3+x4 = x7). Single canonical function — no duplicate lookup logic elsewhere.
- **Per-frame XP drain**: drains `xpReservoir` into connected modifier box at `max(50, reservoir × 1.5)` XP/sec; same drain rate applies when `xpTargetPlayer` is active.
- `RpgStatsPanelHandle` exposes `recordDps`, `withDamageSource`, `update`, `setDevMode`, `element`, `menuButtonContainer`, **`isSlotEquippedByWire`**, **`hasAnyEquipWire`**, **`getWeaponStatMultiplier`**.

### src/render/rpg/rpg-stats-panel-dom.ts
- Orchestrator for RPG stats panel DOM assembly.
- Extracted from `rpg-stats-panel.ts` to isolate HTML element creation from update logic.
- Exports `StatsPanelDomRefs` interface and `buildStatsPanelDom()` factory.
- Delegates section construction and badge wiring to `rpg-stats-panel-dom-sections.ts`.
- Returns `StatsPanelDomRefs` containing all live element references, including `modProgressFills`, `modLevelTexts`, and **`playerXpInEl`** (Box 1 XP input socket).

### src/render/rpg/rpg-stats-panel-dom-sections.ts
- Section builders/helpers for the RPG stats panel DOM.
- Exports `createStatsPanelPrimaryColumn()` (player icon + weapon source plugs + **square purple XP socket**, XP/modifier boxes with **progress bars + level text + Roman numerals**, weapon stat rows), `createStatsPanelRightColumn()`, and `addStatsPanelDevBadges()`.
- Modifier boxes now include: absolute-positioned Roman numeral (top-left), flex content column (progress bar + level text), and plug stack.

### src/render/rpg/rpg-equip-wiring-types.ts
- Types and pure helpers for the RPG plug wiring system.
- Exports `PlugType` union (includes **`playerXpIn`** for Box 1 XP socket); `isCompatible`, `isOutputPlug`, `maxOutgoing`, `maxIncoming`, `wireColor`, `wireDstColor` compatibility/colour helpers.
- Compatibility: `xpOut → playerXpIn` is valid (one incoming connection max).
- Exports `EquipWireConnection`, `EquipWiringState`, `createEquipWiringState()` data model.
- Exports `EquipWiringCtx` and `EquipWiringHandle` public interfaces.
- Exports internal `PlugRecord` and `WireEntry` types used by `rpg-equip-wiring.ts`.
- All pure functions — no DOM access.

### src/render/rpg/rpg-equip-wiring.ts
- Plug wiring system factory for the RPG stats panel (~375 lines).
- Re-exports all types from `rpg-equip-wiring-types.ts` for backward compatibility.
- Exports `createEquipWiringSystem(ctx)` factory; returns `EquipWiringHandle`.

### src/render/rpg/rpg-render-types.ts
- Type-only home for the RPG render API extracted from `rpg-render.ts`.
- Exports `RpgRender` and `RpgRenderOptions` interfaces.
- `rpg-render.ts` re-exports these interfaces so existing imports from `rpg-render.ts` remain valid.

### src/render/rpg/rpg-render-helpers.ts
- Small pure/helper logic extracted from `rpg-render.ts` to keep the main module focused.
- Exports `createCachedLuckPercentGetter(rpgSimState)` (XP-change-based luck cache), `findEquippedWeaponIdByEffect(effectKind, equippedWeaponIds)`, and `clampEnemyToBounds(enemy, widthPx, heightPx)`.
- Contains no render-loop ownership state; `rpg-render.ts` remains the orchestrator and passes current values through.

### src/render/rpg/rpg-render.ts *(updated — build 169)*
- Independent RPG canvas rendering system for the RPG tab (~990 lines after this refactor).
- Module-level constants, types, and factory functions have been extracted to `rpg-constants.ts`, `rpg-types.ts`, and `rpg-factories.ts` respectively.
- Public interfaces `RpgRender` and `RpgRenderOptions` moved to `rpg-render-types.ts` and re-exported from this module.
- Misc reusable helpers moved to `rpg-render-helpers.ts` and consumed via thin forwarding wrappers.
- Targeting helpers (findClosestTarget, findClosestEnemy, getTargetedEnemy, etc.) extracted to `rpg-targeting.ts`; rpg-render.ts keeps 7 one-liner forwarding stubs and delegates to `targeting: RpgTargetingHandle`.
- Player weapon attack dispatch (`performWeaponAttack`) extracted to `rpg-player-attack.ts`; rpg-render.ts initialises `playerAttackCtx: RpgPlayerAttackCtx` and delegates via a one-liner stub.
- Player damage helpers (spawnDamageNumber, spawnHitVisualsAt, dealDamageToPlayer, etc.) extracted to `rpg-player-damage.ts` via `createPlayerDamageFns` factory; rpg-render.ts constructs `playerDamageCtx` and destructures all seven returned functions.
- Player physics and movement (`updatePhysics`) extracted to `rpg-player-movement.ts`; rpg-render.ts owns `playerMovementState: PlayerMovementState` and `movementCtx: PlayerMovementCtx` and calls `updatePlayerMovement(movementCtx, playerMovementState, deltaMs)`.
- Orbit projectile update (`updateOrbitProjectile`) extracted to `rpg-orbit-projectile.ts`; rpg-render.ts owns `orbitProjectileCtx: OrbitProjectileCtx` and calls `updateOrbitProjectile(orbitProjectileCtx, orbitProjectile, deltaMs)`.
- Pointer + keyboard input handling extracted to `rpg-input.ts`; rpg-render.ts calls `createRpgInput({ canvas, dim, joystick, keys, getIsActive, tryTargetEnemyAt })` at init time.
- Entity draw functions split: weapon/effects in `rpg-entity-draw.ts`, enemy bodies in `rpg-enemy-draw.ts`; all call sites pass `ctx` and entity arrays explicitly.
- Laser enemy draw (`drawLaserEnemies`) lives in `rpg-enemy-draw.ts`; all-enemy indicator markers (`drawEnemyIndicators`) now live in `rpg-enemy-indicators.ts` and are re-exported by `rpg-enemy-draw.ts` for call-site stability.
- Player mote comet trail + body draw (`drawPlayerMote`) extracted to `rpg-player-draw.ts`; called with `playerMovementState.glowMovementIntensity` and `playerIFramesMs`.
- Lucky mote system (spawn, update, draw) extracted to `rpg-lucky-motes.ts` as pure functions with explicit parameters.
- Per-entity damage functions are created through `rpg-damage.ts`; Zenith now adds `damageBinaryRingEnemy` into the same factory pipeline.
- Per-frame enemy update functions extracted to `rpg-enemy-updates.ts` (early wave: emerald/amber/void), `rpg-enemy-updates-mid.ts` (mid-wave: quartz/ruby/sunstone/citrine), `rpg-enemy-updates-basic.ts` (laser, sapphire), and `rpg-enemy-updates-adv.ts` (wave 40+); called via `enemyCtx: RpgEnemyCtx` object.
- Horizon Zenith now owns Binary Ring encounter state (`binaryRingEnemies`, missiles, laser sweep, special background instance) in addition to the Binary Horizon / Nadir background effects.
- Boss update functions (`updateBossEnemy`, `updateBossProjectiles`) extracted to `rpg-boss-update.ts`; per-boss-ID behavior dispatch extracted further to `rpg-boss-behaviors.ts` (non-wave) and `rpg-boss-behaviors-wave.ts` (danmaku); called via `bossCtx: BossUpdateCtx` object.
- Boss draw, safe-zone, and wave-clear banner functions extracted to `rpg-boss-draw.ts`.
- Chain whip and vortex draw functions extracted to `rpg-weapon-draw.ts`; sword combo and sand blade draw functions extracted to `rpg-weapon-draw-sword.ts`.
- Pure helpers (`chainNodeRadius`, `chainNodeInvMass`, `getSwordLength`, etc.) extracted to `rpg-helpers.ts`.
- Wave lifecycle (removeDeadEnemies, spawnEnemyById, startNextWave, checkWaveCompletion, tickSpawnQueue) extracted to `rpg-wave-manager.ts`; rpg-render.ts retains ownership of all wave/enemy arrays and scalar state via getter/setter lambdas.
- Per-frame canvas draw function extracted to `rpg-render-draw.ts` via `drawRpgFrame(ctx, state, nowMs)`; `setAllDrawLowGraphics` forwards low-graphics flag to all draw modules.
- `drawZoneBgOverlay` now swaps between Binary Horizon, the Binary Ring offscreen background, and Nadir substrate depending on active Horizon subzone + encounter state.
- Death/restart lifecycle (triggerDeath, doRestart, updateDying, updateRestarting) extracted to `rpg-death-restart.ts`; rpg-render.ts builds `deathRestartCtx: RpgDeathRestartCtx` and delegates all four functions.
- Weapon orbit particle helpers (buildWeaponOrbitParticle, buildOrbitProjectile, updateWeaponOrbitParticles) extracted to `rpg-weapon-orbit.ts`; called via `weaponOrbitCtx: WeaponOrbitCtx`.
- Per-frame weapon system tick (weapon system updates, auto-attack timers, sand blade fallback) extracted to `rpg-weapon-tick.ts`; rpg-render.ts builds `weaponTickCtx: WeaponTickCtx` and calls `tickWeaponSystems(weaponTickCtx, deltaMs)`.
- Contains `createRpgRender()` closure with all update/draw logic for player, enemies, weapons, AI, input, and the stats panel DOM.
- Instantiates `createRpgFluid()` and renders it as the first background layer in `draw()`, before all entities.
- Injects fluid forces from: player movement, laser enemy movement, sapphire enemy patrol, sand projectiles, sapphire missile heat-seeker trail (every frame), missile launch impulse, laser beam fire (multi-point), chain whip lash, AoE weapon pulse, and enemy-death explosions.
- Calls `fluid.step(deltaMs)` each update frame (including dying/restarting phases) and `fluid.reset()` on restart.
- Fixed internal resolution: `INTERNAL_WIDTH = 320`, `INTERNAL_HEIGHT = 568` (portrait 9:16) for the main game canvas.  CSS `aspect-ratio` provides letterbox/pillarbox scaling so pixels are always uniform on desktop.  The RPG canvas uses a different model: see `rpgFieldSpace.ts` for `RpgFieldSpace` which governs the RPG world dimensions.
- **Player mote** — 3×3 sand-colored mote with touch joystick, WASD/Arrow key controls, always-on pulsing glow, smoothly-interpolated comet trail, and starting stats HP=100 ATK=10 DEF=5.
- **Movement glow smoothing** — `playerMovementState.glowMovementIntensity` (0–1) LERP-ramps up when moving and down when stopped; gates trail and halo brightness. Owned by `playerMovementState: PlayerMovementState`.
- **Laser enemy** — 2×2 red mote with five-phase AI: `idle`, `decelerate`, `dash`, `overshoot`, `cooldown`.  Bezier lineDash attack-trail with draw/erase phases.
- **Wave system** — data-driven wave spawning via `getWaveDefinition()` from `src/data/rpg/wave-definitions.ts`.  Waves complete when spawn queue is empty and all enemies are dead; `INTER_WAVE_DELAY_MS` pause before next wave starts.  Updates `rpgSimState.highestWaveReached` in persistent sim state.
- **Death/restart loop** — delegated to `rpg-death-restart.ts`; builds `deathRestartCtx` once to avoid closures in the hot path.
- **Multiple equipped weapons** — `equippedWeaponIds: Set<string>` from RpgSimState; `weaponAttackTimers: Map<weaponId, number>` for independent per-weapon attack cadence; one `WeaponOrbitParticle` per weapon (evenly-spaced orbits); one `ChainWhipState` per chainWhip weapon.
- **Companion ship weapons** — Sapphire/Amethyst weapon effects create persistent ships while equipped. Sapphire ships orbit nearest enemies and fire fast curving lasers; Amethyst ships distribute across furthest enemies and fire slow spiraling pierce lasers.
- **DPS widget** — Rolling 10-second damage samples are attributed by weapon id and rendered into the right-side stats panel as per-equipped-weapon bars.
- **Low graphics mode** — Public `setLowGraphicsMode()` forwards the graphics setting into RPG entity, weapon, and boss draw modules via `setAllDrawLowGraphics`, disabling glow/trail-heavy passes without changing combat logic.
- **Weapon tier damage** — `getScaledWeaponDamage(baseDamage, tier, playerAtk)` and `getScaledWeaponCooldown(baseCooldownMs, tier)` imported from `rpg-state.ts` and applied per attack.
- **Damage number deviation** — each damage number direction has a ±15° triangular-distribution random angle jitter in `spawnHitVisualsAt`.
- **Auto-move** — `_autoMoveEnabled` flag; when on and no manual input, steers toward the nearest enemy (via `rpg-player-movement.ts`) and stops when within weapon effective range. Manual joystick/keyboard input always overrides.
- **Equipment stats** — `applyEquipmentStats()` reads `rpgSimState.equippedWeaponId` and adds `WeaponDefinition.stats` bonuses when a weapon is equipped. Called on `setActive(true)`, `doRestart()`, and via the public `notifyEquip()` method so stats update immediately when the player equips mid-run.
- **Luck stat** — `LUCK` widget in stats panel shows `formatLuckPercent(xp)`. On each enemy kill, `trySpawnLuckyMote()` rolls against `getCachedLuckPercent()` (cached to avoid repeated log calls). On success, a `LuckyMote` of the enemy's tier spawns at the death position with random drift. Lucky motes magnetize to the player within `LUCKY_MOTE_MAGNET_DIST` px and are collected within `LUCKY_MOTE_COLLECT_DIST` px, triggering `onLuckyMoteCollected` callback and spawning a `LuckyMotePopup` floating text. Enemy-to-tier mapping: laser→sand, amber→sunstone, void→nullstone; all others map to matching tier.
- Accepts `rpgSimState: RpgSimState` and optional `options: RpgRenderOptions` (`onLuckyMoteCollected` callback) as factory arguments.
- Exports `createRpgRender(container, rpgSimState, options?)` factory and `RpgRender` / `RpgRenderOptions` interfaces.
- **Game loop** — `update()` delegates to `runRpgUpdate(updateCtx, deltaMs, autoMoveEnabled)` in `rpg-render-update.ts`; `updateCtx: RpgUpdateCtx` is built once at factory creation time and captures all mutable state through getters/setters.
- **Build 169:** Fixed missing `getVerdureCaveWallState` in `movementCtx` (player wall collision was dead). Added `getVerdureCaveWallState` to both `movementCtx` and `enemyCtx`. `beginWaveTerrain` now applies Impetus asteroid soft obstacles and Verdure wall hard-blocks to the nav grid immediately after `buildRpgNavigationGrid`.

### src/render/rpg/rpg-render-update.ts *(updated — build 169)*
- Per-frame simulation step extracted from `rpg-render.ts` (`~325 lines`).
- Exports `runRpgUpdate(ctx, deltaMs, autoMoveEnabled)`, `RpgUpdateCtx` interface, and `RpgEnemyUpdateArrays` interface.
- `RpgEnemyUpdateArrays` bundles all 31 enemy/projectile arrays into one typed object to avoid bloating `RpgUpdateCtx`.
- `RpgUpdateCtx` exposes mutable closure variables through getters/setters so rpg-render.ts closures remain the single source of truth.
- Runs all enemy type update functions, boss physics, weapon tick, lucky motes, achievement flag tracking, HP regen, and death check; then calls `drawRpgFrame`.
- **Build 169:** Centralized Verdure wall push-out pass runs after all enemy updates when `getVerdureCaveWallState?.()` is non-null. Iterates all 26 mobile enemy arrays via `_applyVerdureWallPassToArray` helper and calls `applyEnemyVerdureWallPushOut` on each entity.

### src/render/rpg/rpg-render-draw.ts
- Per-frame canvas draw function extracted from `rpg-render.ts`.
- Exports `RpgDrawCtx` interface, `RpgDrawFrameState` interface, `createRpgDrawFrameState()`, `drawRpgFrame(ctx, state, nowMs)`, and `setAllDrawLowGraphics(enabled)`.
- `drawRpgFrame` renders one complete frame: background, zone overlays (Caustics, Verdure, Impetus, Horizon substrate hook), terrain, floor effects, enemies, boss, particles, player mote, weapon effects, and UI overlays.
- **Screen shake**: reads `ctx.getZenithShakeOffset?.()` at the top of each frame; if non-zero, wraps all scene drawing in `canvas2d.save() / translate(shakeX, shakeY) / restore()`.
- `shouldDrawPersistentTopographySunlight(activeZoneId, terrainState)` helper gates the topography sunlight fill.
- `RpgDrawCtx` includes optional `drawZoneBgOverlay()` and `getZenithShakeOffset?()` for Horizon substrate + shake.
- `setAllDrawLowGraphics` forwards the low-graphics flag to all draw-side modules.
- Dev overlay (`drawRpgViewportDiagnostics`) reports: zone, subzone, terrainKind, lowGraphics, bg route, sunlightWash.

### src/render/rpg/rpg-death-restart.ts
- Player death and level-restart lifecycle extracted from `rpg-render.ts` (~227 lines).
- Exports `RpgDeathRestartCtx` interface, `triggerDeath(ctx)`, `doRestart(ctx)`, `updateDying(ctx, deltaMs)`, `updateRestarting(ctx, deltaMs)`.
- `triggerDeath` transitions to 'dying' phase and spawns `DEATH_BURST_COUNT` radial burst particles.
- `doRestart` clears all entity arrays, resets all physics/wave state, and calls `applyEquipmentStats()`.
- `updateDying` advances the death animation and calls `doRestart` + transitions to 'restarting' when the hold time elapses.
- `updateRestarting` fades the restart overlay in and transitions to 'alive'.

### src/render/rpg/rpg-weapon-orbit.ts
- Build 166: orbit projectile collision context now routes procedural/Verdure bodies through `collectEnemyBodyTargets` + `damageBodyTarget`.
- Weapon orbit particle helpers extracted from `rpg-render.ts` (~109 lines).
- Exports `WeaponOrbitCtx` interface, `buildWeaponOrbitParticle(ctx, weaponId, startAngle)`, `buildOrbitProjectile(ctx)`, `updateWeaponOrbitParticles(ctx, deltaMs)`.
- `buildWeaponOrbitParticle` uses `TIER_BY_ID` for color and `weaponTiersByWeaponId` for size scaling.
- `buildOrbitProjectile` checks the `orbit_projectile` RPG upgrade level and returns null if not unlocked.
- `updateWeaponOrbitParticles` advances all orbit particle angles, maintains even spacing, and records distance-based trail points.

### src/render/rpg/rpg-weapon-tick.ts
- Per-frame weapon system update dispatch extracted from `rpg-render.ts` (~165 lines).
- Exports `WeaponTickCtx` interface and `tickWeaponSystems(ctx, deltaMs)`.
- Handles three responsibilities: weapon effect system updates (sand, chainWhip, vortex, etc.), per-weapon auto-attack timer countdown and `performWeaponAttack` dispatch, and sand blade fallback when no weapons are equipped.
- `WeaponTickCtx` includes `getWeaponSpdMultiplier(weaponId): number`; the cooldown for each weapon is divided by this multiplier before counting down.
- `rpg-render.ts` constructs `weaponTickCtx: WeaponTickCtx` once (after context objects) and calls `tickWeaponSystems(weaponTickCtx, deltaMs)` each frame.

### src/data/rpg/wave-definitions.ts
- `WaveSpawn` and `WaveDefinition` types.
- `WAVE_DEFINITIONS` — hand-authored waves 1–25 (laser enemy, increasing count and tighter delays).
- `getWaveDefinition(waveNumber)` — returns predefined definition or generates one procedurally for waves beyond 25.
- `STANDARD_WAVE_ENEMY_IDS` — all 15 standard enemy IDs used by wave definitions.
- `PROCEDURAL_WAVE_ENEMY_IDS` — all 11 procedural creature IDs (proc_*) used by the generator.
- `ELITE_WAVE_ENEMY_IDS` — all 8 elite enemy IDs used by the generator.

### src/data/rpg/weapon-definitions.ts
- `WeaponEffect` — discriminated union: `single | multi | aoe | piercing | sapphireShip | amethystShip`.
- `WeaponStats` and `WeaponDefinition` types.
- `WEAPON_DEFINITIONS` — 11 weapons covering every non-secret tier in unlock order (Sand → Nullstone):
  `sand_blade`, `quartz_shard`, `ruby_lance`, `sunstone_ward`, `citrine_nova`, `emerald_spray`,
  `sapphire_spike`, `iolite_volley`, `amethyst_pierce`, `diamond_bastion`, `nullstone_nova`.
- Sapphire and Amethyst definitions use persistent companion ship effects rather than the generic piercing effect.
- `WEAPON_BY_ID` — O(1) lookup map.

### src/data/rpg/equipment-modifiers.ts
- Pure aggregation layer for equipped lenses and weaves.
- Exports `getEquippedLensModifiers`, `getEquippedWeaveModifiers`, `getCombinedEquipmentModifiers`, and `applyEquipmentModifiersToAttackContext`.
- No DOM or render dependencies; combat callers consume `CombinedEquipmentModifiers` instead of reading raw inventory/equipment state directly.

### src/data/rpg/rpg-zone-definitions.ts
- Defines `RpgZoneId` ('euhedral' | 'impetus' | 'caustics' | 'verdure' | 'horizon') and `RpgZoneDefinition`.
- `RPG_ZONE_DEFINITIONS` — ordered array of all 5 zone definitions with display names, descriptions, enemy id lists, and optional subzone arrays (Horizon only).
- `RPG_ZONE_BY_ID` — O(1) lookup map.
- `RPG_ZONE_IDS` — ordered zone id array.
- `getRpgZoneDisplayName(zoneId)` — returns display name (e.g. "Euhedral").

### src/render/rpg/rpg-zone-select.ts
- DOM overlay panel for zone selection, appended to `#rpg-area`.
- `createRpgZoneSelectPanel(rpgSimState, onZoneSelect, onSubzoneSelect?)` — factory.
- Lists all 5 zones with display names and per-zone highest wave reached.
- Highlights the currently active zone; calls `onZoneSelect(zoneId)` when a different zone is selected.
- **Build 146+:** Selecting a non-Horizon zone closes the panel; selecting Horizon keeps it open for subzone selection. Zone rows are rebuilt after each switch so highlights and best-wave display stay current.
- When Horizon is active or selected, shows a subzone panel (Zenith / Nadir / True cards) below the zone list; calls `onSubzoneSelect(subzoneId)` when a subzone is tapped.
- Re-exports `HorizonSubzoneId` (defined in `rpg-state.ts`) for backward compat.
- `open()` / `close()` / `isOpen` public API.

### src/sim/rpg/rpg-state.ts
- `HorizonSubzoneId = 'zenith' | 'nadir' | 'true'` — exported union type for Horizon subzone ids.
- `RpgSimState` interface — `highestWaveReached`, `activeZoneId` (default 'euhedral'), `activeSubzoneId: HorizonSubzoneId` (default 'zenith', used for Horizon subzone selection), `highestWaveReachedByZone` (Record<RpgZoneId, number>), `purchasedWeaponIds` (Set), `equippedWeaponIds` (Set of all equipped weapon ids), `bossCompletions` (Map<bossId, bestSpeedPct>), `bossSpeedPct` (10–100), `encounteredEnemyTypes` (Set<string> of all enemy type IDs that have spawned).
- Exports `PLAYER_BASE_ATK = 10`, `MAX_WEAPON_TIER = 7`, `MIN_BOSS_SPEED_PCT = 10`, `MAX_BOSS_SPEED_PCT = 100`, `BOSS_SPEED_STEP = 10`, `TOTAL_BOSS_COUNT = 10`.
- `createRpgSimState()` — zero-state factory.
- Weapon scaling helpers: `getWeaponTierUpgradeCost`, `getScaledWeaponDamage`, `getScaledWeaponCooldown` (kept here to avoid circular dep on PLAYER_BASE_ATK).
- Re-exports all functions from `rpg-state-xp.ts` and `rpg-state-upgrades.ts` for backward compatibility.

### src/sim/rpg/rpg-state-xp.ts
- XP and luck computation functions extracted from `rpg-state.ts` (~215 lines).
- Exports: `getXpPerKill`, `getWaveStatScale`, `getXpAtkBonus`, `getXpDefBonus`, `getLuckPercent`, `formatLuckPercent`, `formatXp`, `addXpWithAllocation`, `getEffectiveXpAtkBonus`, `getEffectiveXpDefBonus`, `getEffectiveXpLuckBonus`, `getEffectiveXpHpBonus`.
- New: `getMultiplierXpCost(level): number` — returns `50 × 5^(level-1)`; `tickMultiplierXpProgress(state, modIdx, amount)` — advances multiplier box XP, levelling up as needed.

### src/sim/rpg/rpg-state-upgrades.ts
- Wave boost, RPG upgrade, and boss helper functions extracted from `rpg-state.ts` (~78 lines).
- Exports: `getWaveBoostMultiplier`, `formatWaveBoostPercent`, `getRpgUpgradeLevel`, `getRpgSpeedMultiplier`, `getMaxEquippedWeapons`, `getBossXpMultiplier`, `isBossUnlocked`.

### src/ui/panels/weapon-store-panel.ts
- `WeaponStorePanel` interface and `createWeaponStorePanel(dispatch)` factory.
- Renders purchasable weapons from `WEAPON_DEFINITIONS` as cards.
- Shows affordability from ResourceState; dispatches `purchase_weapon` / `equip_weapon` actions.
- `update(rpgState, resources, numberFormat)` — refreshes card list.
- `setVisible(visible)` — toggles the overlay.

### src/ui/panels/rpg-menu-tab.ts
- Menu sub-tab pane for the RPG overlay panel (auto-move toggle + respawn-wave checkpoint selector + dev wave jump).
- `RpgMenuTabPane` interface; `createRpgMenuTabPane(dispatch, onAutoMoveChange)` factory.
- Exposes `isAutoMoveEnabled` (writable) updated immediately on checkbox change; parent reads it via `onAutoMoveChange` callback.
- `update(rpgState, isDevMode?)` rebuilds content from current state. When `isDevMode=true`, shows a "Dev: Jump to Wave" section with a wave selector (Wave 1, 10, 20, … 1000) and Jump button that dispatches `dev_jump_wave`.

### src/ui/panels/rpg-weapons-tab.ts
- Weapons sub-tab pane for the RPG overlay panel (weapon purchase / equip / unequip / tier-upgrade cards).
- `RpgWeaponsTabPane` interface; `createRpgWeaponsTabPane(dispatch)` factory.
- `update(rpgState, resources, numberFormat, isDevMode)` rebuilds the full weapon list.
- In dev mode: appends a **Quartz Whip Physics** section at the bottom with labelled number inputs for all 15 tunable `CHAIN_*` constants (via `setChainWhipParam` / `resetChainWhipParams` from `rpg-weapon-constants.ts`).

### src/ui/panels/rpg-upgrades-tab.ts
- Upgrades sub-tab pane for the RPG overlay panel (per-upgrade purchase cards + weapon crafting page).
- `RpgUpgradesTabPane` interface; `createRpgUpgradesTabPane(dispatch)` factory.
- `update(rpgState, resources, numberFormat, isDevMode)` rebuilds the upgrade list.
- When crystals exist or dev mode is on, renders `RpgWeaponCraftingPage` at the top (temporary location).

### src/ui/panels/rpg-weapon-crafting-page.ts
- Standalone weapon-crafting workspace rendered inside the Upgrades tab (temporary; move to a Forge tab later).
- `RpgWeaponCraftingPage` interface; `createRpgWeaponCraftingPage(dispatch)` factory.
- `update(rpgState, isDevMode)` rebuilds the full crafting UI while preserving slider/chip state.
- Multi-segment percentage slider: N-1 draggable handles (mouse + touch + keyboard), colored segments.
- Tier chip selector (respects forge capacity); power slider (1–100% of max budget).
- Live actual composition preview (post-floor via `computeCraftedWeaponComposition`).
- Dispatches `{ kind: 'craft_weapon', ingredients }`.
- Collapsible "Exact counts / advanced" fallback with number inputs.

### src/data/rpg/crafting-allocation.ts
- Pure math helpers for the crafting page percentage-to-ingredient conversion.
- `enforceMinSegmentSize`: clamp shares to minimum, redistribute from unfixed segments.
- `sharesFromHandles` / `handlesFromShares`: convert between N-1 handle positions and N shares.
- `clampHandle`: enforce minimum segment size when moving a handle.
- `computeMaxBudget`: weighted budget ceiling given shares and inventory.
- `allocateIngredients`: convert shares + power fraction → refined crystal ingredient array.

### src/ui/panels/rpg-bosses-tab.ts
- Bosses sub-tab pane for the RPG overlay panel (boss list + speed selector).
- `RpgBossesTabPane` interface; `createRpgBossesTabPane(dispatch)` factory.
- `update(rpgState)` rebuilds boss list, speed buttons, and next-unlock hint.
- Dispatches `start_boss_fight` (closes menu, triggers boss fight via rpgRender) and `set_boss_speed` actions.
- Each boss entry shows lock status, best completion speed, XP multiplier, and Fight button.

### src/ui/panels/rpg-enemies-tab.ts
- Enemies sub-tab (bestiary) for the RPG overlay panel (~290 lines).
- `RpgEnemiesTabPane` interface; `createRpgEnemiesTabPane(dispatch)` factory.
- `update(rpgState, isDevMode)` rebuilds the enemy and boss catalog from imported data.
- Enemies include local zone-filter tabs: ALL, Euhedral, Impetus, Caustics, Verdure, and Horizon; Horizon shows an empty state until entries are assigned.
- **Regular enemies** use explicit `encounteredEnemyTypes` set when populated; falls back to `highestWaveReached >= firstWave` for old saves (empty set). All are visible in dev mode.
- **Bosses** are visible once beaten (`bossCompletions` has non-zero entry); all are visible in dev mode.
- Icon drawing functions extracted to `rpg-enemies-tab-icons.ts`.

### src/ui/panels/rpg-enemies-tab-icons.ts
- Icon rendering helpers for the RPG enemies bestiary tab.
- Exports `ICON_SIZE`, `createAlivenIconCanvas(entry)` (animated RAF mini-sim for swarm enemies), `drawEnemyIcon(canvas, entry)` (static icon for regular enemies), `drawBossIcon(canvas, bossId)`, and `drawPolygonPath(ctx, cx, cy, radius, sides)`.
- Used by `rpg-enemies-tab.ts` for enemy entry card icons.

### src/ui/panels/rpg-enemies-catalog.ts
- Backward-compatible barrel for RPG enemies catalog exports.
- Re-exports `EnemyShape`, `EnemyCatalogEntry`, `ENEMY_CATALOG`, and `BOSS_DESCRIPTIONS`.

### src/ui/panels/rpg-enemies-catalog-types.ts
- Type-only module for the bestiary schema.
- Exports `EnemyShape`, `EnemyZoneId`, and `EnemyCatalogEntry`.

### src/ui/panels/rpg-enemies-catalog-entries.ts
- Static enemy catalog data for the RPG enemies tab.
- Exports `ENEMY_CATALOG` with regular, elite, and aliven entries.
- Each entry can carry `zone` metadata for encyclopedia filtering without duplicating definitions.
- Imports size/color/stat constants from `rpg-constants.ts` and `rpg-enemy-constants.ts`.

### src/ui/panels/rpg-enemies-catalog-bosses.ts
- Static boss lore/description strings for the RPG enemies tab.
- Exports `BOSS_DESCRIPTIONS`.

### src/render/ui/trace-effect.ts
- Fullscreen fixed canvas overlay for animated golden outline + tracing circles.
- `createTraceEffect(mountTarget)` — returns `TraceEffect` with `setEquationTargets()`, `setMatrixTarget()`, and idempotent `dispose()` lifecycle cleanup.
- Used by the active ALIVEN matrix drag highlight; the equation-target API remains available while the visible equation display is retired.
- Two small golden circles trace the perimeter of the outlined rect using `perimeterPoint()`.
- The overlay is demand-driven: it owns no animation frame while target-free, wakes when the first target appears, and cancels immediately after the last target clears.

### src/data/achievements/achievement-definition-types.ts
- `AchievementBonusKind`, `AchievementCondition` (discriminated union, 60+ kinds), `AchievementDefinition` interface.
- No runtime dependencies (types only). Imported by all achievement data files below.

### src/data/achievements/achievement-definitions-motes.ts
- `MOTES_ACHIEVEMENTS` — all mote-group achievement definitions (~130 entries).

### src/data/achievements/achievement-definitions-equation.ts
- `EQUATION_ACHIEVEMENTS` — all equation-group achievement definitions (~100 entries).

### src/data/achievements/achievement-definitions-rpg.ts
- `RPG_ACHIEVEMENTS` — named RPG achievements (wave/boss/XP/weapon milestones).
- `RPG_NUMBERED_ACHIEVEMENTS` — hidden-criteria numbered RPG achievements (#001–#200).

### src/data/achievements/achievement-definitions-secret.ts
- `SECRET_ACHIEVEMENTS` — secret-group achievements (hidden until earned, large bonuses).

### src/data/achievements/achievement-definitions.ts
- Aggregator: imports from the five files above, assembles and exports `ACHIEVEMENT_DEFINITIONS` and `ACHIEVEMENT_BY_ID`.
- Re-exports `AchievementBonusKind`, `AchievementCondition`, `AchievementDefinition` for backward compatibility.

### src/data/achievements/achievement-subcategories.ts
- `AchievementSubcategory` interface and `ACHIEVEMENT_SUBCATEGORIES` ordered list.
- 11 RPG subcategories: Wave Progression, Bosses, XP & Stats, Weapons Purchased, Weapon Upgrades, RPG Upgrades, Regular Enemies, Elite Enemies, Aliven Enemies, Lucky Motes, Challenge.
- `ACHIEVEMENT_SUBCATEGORY_BY_ID` map for quick lookup.

### src/data/achievements/achievement-groups.ts
- Canonical achievement category metadata used by the UI accordion.
- `ACHIEVEMENT_GROUPS` defines the 4 groups: Motes, Equation, RPG, Secret.
- `ACHIEVEMENT_GROUP_BY_ID` provides quick lookup by group id.

### src/sim/achievements/achievement-state.ts
- `AchievementState` — set of unlocked/claimed achievement IDs plus cached bonus multipliers.
- `createAchievementState()`, `checkAndUnlockAchievements()`, `recomputeBonuses()`.
- `claimAchievement()`, `claimAllUnlockedAchievements()`, `getClaimableCount()`.
- Condition evaluation delegated to `achievement-conditions.ts` via `isConditionMet`.

### src/sim/achievements/achievement-conditions.ts
- `isConditionMet(condition, resources, equation, rpg, aliven, globalTapMultiplier)` — switch dispatch over all `AchievementCondition` kinds (~35 cases).
- Extracted from `achievement-state.ts` to keep state management separate from condition logic.
- Not intended for direct import outside the `achievements/` directory.

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

### src/ui/hud/hud-overlay.ts
- DOM-based HUD overlay rendered above the game canvas.
- Shows mote counts and loom production-rate labels only; visible equation/equivalence presentation is intentionally retired.
- `createHudOverlay()` — returns `element` and `update(params: HudUpdateParams)`.

### src/ui/legacy/ and src/render/legacy/
- Preserve the retired HUD equation, panel equation, forge-preview equation, canvas equation/equivalence renderer, pixel renderer, display view model, and idle equivalence row.
- Intentionally not imported by active runtime systems.

### src/ui/tabs/tab-bar.ts
- Bottom tab bar: Equation / Looms / Tiers / Achievements / Settings.
- Adds `menuBarDecor.png` as a decorative outline overlay above the tab bar.
- Adds the achievements-tab unclaimed indicator (golden sheen + sparkle orbs).
- `createTabBar()` — returns element plus `setActiveTab()` and `updateAchievementIndicator(state)`.
- Reuses `hasUnclaimedAchievements(state)` to keep tab indicator active whenever any earned achievement is unclaimed.

### src/ui/achievements/sparkle-shared.ts
- Shared sparkle constants matching Thero timings and drift/scale ranges.
- Exports `randomInRange()` utility used by both achievements panel and tab bar sparkle emitters.

### src/ui/achievements/achievement-progress-text.ts
- Pure formatting utility — no side effects, no DOM dependencies.
- Exports `getProgressText(condition, state, numberFormat)` — returns a human-readable progress string for any `AchievementCondition` kind.
- Used by `achievements-panel.ts` to show live progress toward each locked achievement.

### src/ui/panels/equation-panel.ts
- Equation tab content — the central Equation Forge panel.
- Before forge unlock: shows dormant locked forge state with description and unlock button (50 Sand).
- After forge unlock: shows forge heat state and equation upgrades grouped by tier without rendering the formula.
- `buildStructuredEquationHtml()` from sim layer generates the nested HTML.
- Hovering an equation upgrade highlights the corresponding tier's equation fragments with a golden glow.
- When a `TraceEffect` is provided, the golden outline + tracing circles appear over the highlighted spans.
- `createEquationPanel(dispatch, traceEffect?)` — optional trace effect parameter.

### src/ui/panels/loom-panel.ts
- Slim orchestrator for the combined Upgrades panel (three sub-tabs: Equation, Loom, Aliven).
- Owns sub-tab bar and switching logic; delegates all content to sub-pane modules.
- `createLoomPanel(dispatch, traceEffect?, equationContent?)` — wires sub-panes.

### src/ui/panels/loom-upgrades-pane.ts
- "Loom" sub-tab content: passive-production Loom upgrade cards + special one-time upgrade cards.
- One card per colour tier; cards show level, effective rate, particle-size label, and upgrade button.
- Special upgrade cards show purchase cost and purchased state.
- `createLoomUpgradesPane(dispatch)` → `{ element, update(state, fmt) }`.

### src/ui/panels/aliven-pane.ts
- "Aliven" sub-tab orchestrator: title/subtitle, matrix section wiring, and per-tier aliven rows.
- Aliven rows show unlock button (cost 10,000 own motes) or ✦ Alive badge.
- Matrix functionality is delegated to `aliven-pane-matrix.ts`.
- `createAlivenPane(dispatch, traceEffect?)` → `{ element, update(state, fmt) }`.

### src/ui/panels/aliven-pane-matrix.ts
- Extracted interaction-matrix module for the Aliven pane.
- Owns matrix controls (+0.05/−0.05/reset), matrix grid DOM build, and cell drag/tap editing dispatch.
- Rebuilds matrix only when alivened-tier membership changes; refreshes visible cell values each update.
- Integrates with `TraceEffect` to show matrix-cell targeting visuals during pointer interaction.

### src/audio/

Audio system — eight focused modules:

- **`audio-paths.ts`** — All audio asset path constants, URL-encoded so spaces and `#` in filenames work with `fetch()`.
- **`audio-context.ts`** — Web Audio `AudioContext` singleton with Safari `webkitAudioContext` fallback and `resumeAudioContext()` helper.
- **`audio-loader.ts`** — `loadAudioBuffer(ctx, path)` — async fetch + `decodeAudioData` with in-flight deduplication and per-path caching. `preloadAudioBuffers()` for bulk warm-up.
- **`music-player.ts`** — `MusicPlayer` — shuffled 3-track playlist with 8-second Web Audio crossfades. Two alternating `GainNode` slots. Play order is fixed at startup (random once).
- **`ambiance-player.ts`** — `AmbiancePlayer` — looping `lowRumble.mp3` at −10 dB relative to SFX volume. Fades in/out (1 s) when the `equation` tab is entered/left.
- **`sfx-player.ts`** — `SfxPlayer` — single SFX, random-from-list, polyphony-limited (motes merging, max 2), forge charging fade-in/out; disables and drops SFX while focus audio is paused so suspended-context events do not burst on resume.
- **`audio-system.ts`** — `AudioSystem` interface + `createAudioSystem(musicVolume, sfxVolume)` factory. No-op fallback when Web Audio API is unavailable; tracks focus state and gates SFX event handlers while unfocused.
- **`index.ts`** — Barrel: exports `AudioSystem`, `createAudioSystem`.

### src/data/particles/particle-config.ts
- Added `FORGE_SPIN_UP_THRESHOLD_MS` — named constant for the elapsed-ms threshold at which the forge spin-up animation begins.


- Tier progression panel (renamed from Upgrades).
- Contains only the tier unlock button for unlocking new gemstone tiers.
- Equation upgrades and forge unlock have moved to the Equation panel.

### src/ui/panels/achievements-panel.ts
- Achievements tab orchestrator — filter bar, nested category accordions, glyph/sparkle wiring (~250 lines after update/filter split).
- DOM building (group accordions, subcategory accordions, achievement cards) extracted to `achievements-panel-dom.ts`.
- Sparkle system extracted to `achievements-panel-sparkle.ts`.
- Glyph animation extracted to `achievements-panel-glyph.ts`.
- Main card/group update pass and filter application extracted to `achievements-panel-update.ts`.
- Filter bar: three checkboxes (show earned, show unearned, show hidden) with defaults earned+unearned=on, hidden=off.
- Main category accordions: only one open at a time; opening another closes the previous.
- RPG group: nested subcategory accordions (11 subcategories); only one subcategory open at a time.
- isSecret achievements: glyph name, desc, bonus, progress when not earned.
- isHiddenCriteria achievements: glyph only the progress field when not earned.
- Sparkle emitters managed per card and group toggle, cleaned up on hide/destroy.
- Exports `hasUnclaimedAchievements(state)` for tab-bar indicator logic.
- Progress text formatting extracted to `src/ui/achievements/achievement-progress-text.ts`.

### src/ui/panels/achievements-panel-sparkle.ts
- Sparkle particle animation system for earned-unclaimed achievement cards (~92 lines).
- Exports `createSparkleSystem()` → `SparkleSystemHandle` with `setSparkleEmitter(host, enabled)` and `stopAllSparkles()`.
- Manages per-host timeout chains; creates CSS-animated `.achievement-sparkle` spans.
- Extracted from `achievements-panel.ts` to keep sparkle state self-contained.

### src/ui/panels/achievements-panel-glyph.ts
- Per-character scrambled glyph animation for secret/hidden-criteria achievement cards (~127 lines).
- Exports `createGlyphSystem(deps)` → `GlyphSystemHandle` with `rebuildGlyphEntries`, `startGlyphAnimation`, `stopGlyphAnimation`.
- Dependencies: `getCardRefs()` and `getFilterShowHidden()` getters (injected from `achievements-panel.ts`).
- Uses `requestAnimationFrame` loop; mutates one random character per entry every 1–5 frames.
- Respects `prefers-reduced-motion` by skipping most updates at 98% probability.
- Extracted from `achievements-panel.ts`.

### src/ui/panels/achievements-panel-dom.ts

### src/ui/panels/achievements-panel-dom.ts
- Achievement DOM building helpers extracted from `achievements-panel.ts` (~355 lines).
- Exports text helpers: `bonusText`, `getAccentColor`, `makeScrambledText`, `randomGlyphChar`.
- Exports DOM ref types: `CardRefs`, `SubcategoryRefs`, `GroupRefs`, `AchievementsDomCallbacks`.
- Exports `buildAchievementsDom(groupsRoot, callbacks)` — builds all group/subcategory/card elements and returns `{ cardRefs, groupRefs }`.
- Cards are built by the private `appendCard` function; click handlers fire `callbacks.onCardClaim(id, formattedBonus)`.

### src/ui/panels/achievements-panel-update.ts
- Achievement panel state-update and filtering helpers extracted from `achievements-panel.ts`.
- Exports `cardIsVisible`, `applyAchievementFilters`, and `updateAchievementCardsAndGroupHeaders`.
- Owns card state class/label updates, group/subcategory progress counts, and sparkle eligibility checks.

### src/ui/panels/resource-panel.ts
- Per-tier mote display with refined gem icons.
- Shows total mote count, lifetime total, and per-size breakdown (Grain/Shard/Chunk/Mass/…) derived from `totalToSizeCounts`.

### src/ui/idle/idle-overlay.ts
- DOM overlay shown when the player returns after being away ≥ 1 minute.
- Lists time away and per-tier Mote gains; equivalence is intentionally not shown.
- Numbers animate from 0 to their target over ~600 ms (ease-out cubic via requestAnimationFrame).
- `IdleOverlay` interface — `{ element, show(summary), hide() }`.
- `createIdleOverlay()` — factory function; tap/click anywhere to dismiss.

### src/ui/panels/dev-panel.ts
- Developer-mode playtesting panel orchestrator.
- Preserves public `DevPanel`/`DevPanelHooks` contract and wires wave-jump controls, spawn controls, snapshots, and telemetry refresh actions.
- Delegates DOM primitives/wave constants to `dev-panel-dom.ts` and table/snapshot rendering to `dev-panel-render.ts`.

### src/ui/panels/dev-panel-dom.ts
- Shared dev-panel DOM helpers.
- Exports `WAVE_JUMP_TARGETS`, `el()`, and `makeSubTitle()` used by `dev-panel.ts` and `dev-panel-render.ts`.

### src/ui/panels/dev-panel-render.ts
- Extracted render/snapshot helpers for dev-panel sections.
- Exports `buildAlivenBalanceTable`, `refreshForgeStateLines`, `refreshLoomStateTable`, and `refreshTelemetryTables`.
- Owns static aliven balance table creation plus session telemetry table rendering.

### src/ui/panels/settings-panel.ts
- Settings panel orchestrator for controls, toggles, save/reset actions, credits, and dev-only embedded panels.
- Wires `settings-panel-controls.ts` row builders and `settings-panel-dev-tweaks.ts` particle tweak section.
- The retired Equation Render Style setting remains load-compatible but is no longer shown.
- **Build 193+:** "Idle Canvas Render" select row (Pixelated / Crisp HiDPI) added after "Background Style". Accepts optional `onIdleCanvasRenderStyleChange` callback invoked on change.

### src/ui/panels/settings-panel-controls.ts
- Shared DOM row builders for settings controls.
- Exports `createSliderRow`, `createToggleRow`, and `createSelectRow`.
- Slider row includes gold glow interpolation and thresholded border/text shadow effects.

### src/ui/panels/settings-panel-dev-tweaks.ts
- Dev-only particle tweak section extracted from `settings-panel.ts`.
- Exports `createDevTweaksSection()` which renders numeric tweak inputs and a reset-to-defaults action.
- Owns the `DEV_TWEAK_FIELDS` list and writes directly to `particleTweaks` on input change.

### src/settings/settings-state.ts
- User settings model and localStorage persistence.
- `isDevMode: boolean` — when true, all game actions bypass cost checks.
- RPG developer visual toggles: viewport/field-space, pathfinding, Verdure wall, Nadir anchor, boss-stage, topographic terrain, and topographic lighting debug overlays. These are visible only in dev mode and default off.
- `numberFormat: 'letters' | 'scientific' | 'engineering'` — controls number display format across all UI panels and canvas score.
- **Build 108+:** `skipIdlePopupAtStart: boolean` — when true, the startup idle earnings overlay is skipped; rewards are still applied silently.
- `equationRenderStyle: 'pixel' | 'smooth'` is retained only for settings-file compatibility.
- **Build 193+:** `idleCanvasRenderStyle: 'pixelated' | 'crisp'` — controls the backing-store resolution of the main idle/world canvas. Default `'pixelated'`: low-res ~320 px wide backing, nearest-neighbor upscaled. `'crisp'`: HiDPI backing (CSS × DPR).

### src/settings/save-load.ts
- Thin localStorage I/O layer (~45 lines after extraction).
- Exports `saveGame(state)`, `loadGame()`, `deleteSave()`.
- Also re-exports `serializeGameState` and `deserializeGameState` from sub-modules.
- All heavy lifting delegated to `save-types.ts`, `save-serialize.ts`, `save-deserialize.ts`.

### src/settings/save-types.ts
- `SaveData` interface and save format constants (`SAVE_KEY`, `SAVE_VERSION = 23`).
- Full versioned wire format: equation, resources, progression, looms, forge, achievements, aliven, rpg, pendingIdleMotes.
- Extensively commented with version notes for each optional field.

### src/settings/save-serialize.ts
- `serializeGameState(state: GameState): SaveData` — converts live state to wire format.
- Pure function, no side effects.

### src/settings/save-deserialize.ts
- `deserializeGameState(data: SaveData): GameState` — hydrates a SaveData into a live GameState.
- Handles all version migrations (v1–v23) via optional-field defaults.

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

### src/ui/panels/balance-forecast/balance-forecast-types.ts
- Shared types and constants for the Balance Forecast dev panel.
- Exports `formatDuration(seconds)` — compact human-readable duration string.
- Exports `ForecastTarget`, `ForecastResult`, `ForecastCategory`, `RequirementEta`, `EtaStatus`.
- Exports `Milestone`, `StrategyResult`, `StrategyId`, `PacingWarning`, `WarningKind`.
- Exports `BALANCE_WARNING_THRESHOLDS` — tunable thresholds for pacing warnings.

### src/ui/panels/balance-forecast/balance-forecast-sim.ts
- Strategy simulation runner for the balance forecast system (~145 lines after splitting).
- Exports `runStrategySimulation(initialState, strategyId, maxSimSeconds)` — runs a full strategy simulation and returns `StrategyResult`.
- Re-exports `SimState, createFreshSimState, simStateFromGame, getLoomRateSim, getTotalProductionRateSim, simTick, simCheckAchievements` from `balance-forecast-state.ts` for backward compatibility.
- Internal: `getTimeToNextPurchase` — adaptive time-step helper that computes time to next affordable purchase.
- Imports strategy functions and milestone specs from `balance-forecast-strategies.ts`.

### src/ui/panels/balance-forecast/balance-forecast-state.ts
- Lightweight simulation state model for the balance forecast (~240 lines).
- Exports `SimState` interface and `SimState`-related lifecycle helpers: `createFreshSimState`, `cloneSimState`, `simStateFromGame`.
- Exports production rate helpers: `getLoomRateSim`, `getTotalProductionRateSim`.
- Exports simulation step primitives: `simTick` (advance time), `simCheckAchievements` (apply achievement bonus side-effects).

### src/ui/panels/balance-forecast/balance-forecast-purchases.ts
- Purchase decision helpers for the balance forecast simulation (~165 lines).
- Exports `PurchaseCandidate` interface, `getAllAffordablePurchases(sim)`, and `applyPurchase(sim, candidate)`.
- Enumerates: Equation Forge, tier unlocks, loom upgrades, special loom upgrades, equation upgrades.

### src/ui/panels/balance-forecast/balance-forecast-strategies.ts
- Milestone definitions and strategy implementations for the balance forecast (~130 lines).
- Exports `MILESTONE_SPECS` — ordered list of progression checkpoints.
- Exports `STRATEGY_FNS` and `STRATEGY_NAMES` — lookup maps for the four strategies: `wait_only`, `cheapest_first`, `best_efficiency`, `rush_next_tier`.

### src/ui/panels/balance-forecast/balance-forecast-engine.ts
- Public API orchestrator for the balance analysis engine (~100 lines after refactor).
- `runBalanceForecast(game, options)` — orchestrates ETA analysis, strategy simulations, and pacing warnings into `ForecastResult`. Does not mutate game state.
- Target computation delegated to `balance-forecast-targets.ts`; pacing warnings delegated to `balance-forecast-warnings.ts`.

### src/ui/panels/balance-forecast/balance-forecast-targets.ts
- Per-target ETA analysis extracted from `balance-forecast-engine.ts` (~264 lines).
- Exports: `computeRequirementEta(sim, tierId, required)`, `buildForecastTarget(id, displayName, category, requirements)`, `getAllForecastTargets(sim)`.
- Covers: equation forge, tier unlocks, loom upgrades, special looms, equation upgrades, lifetime-motes achievements.

### src/ui/panels/balance-forecast/balance-forecast-warnings.ts
- Pacing warning generation extracted from `balance-forecast-engine.ts` (~145 lines).
- Exports: `generatePacingWarnings(targets, strategyResults)`.
- Detects: long gaps, unlock clusters, extreme ETAs, no-production tiers, inverted tier order, stuck simulations, steep cost growth.

### src/ui/panels/balance-forecast/balance-forecast-panel.ts
- Dev-only DOM panel for the Balance Forecast system (~215 lines).
- `createBalanceForecastPanel()` — returns `BalanceForecastPanel` interface.
- Renders: Next Meaningful Events, Static ETA table, Fresh-Run Timeline, Strategy Comparison, Pacing Warnings.
- Controls: max-sim-time selector, ↺ Run Analysis button, 📋 Copy Results button.
- Runs simulation lazily (on open or refresh click) — never runs on every frame.
- Hidden unless `setDevMode(true)` is called.
- Pure rendering helpers extracted to `balance-forecast-render.ts`.

### src/ui/panels/balance-forecast/balance-forecast-render.ts
- Pure DOM rendering helpers extracted from `balance-forecast-panel.ts` (~250 lines after strategy split).
- Exports: `el`, `makeSection`, `statusClass`, `categoryLabel`, `safeNum`, plus strategy render re-exports for compatibility.
- Render functions: `renderStaticEtaTable`, `renderNextMeaningfulTargets`, `renderFreshRunTimeline`, `renderPacingWarnings`.
- Also exports `buildTextReport(result)` for the copy-to-clipboard text report.
- All functions are stateless (take only data + HTMLElement); no closure dependencies.

### src/ui/panels/balance-forecast/balance-forecast-render-strategies.ts
- Strategy-oriented render helpers extracted from `balance-forecast-render.ts`.
- Exports: `collectMilestoneIds`, `renderStrategyComparison`, `renderStrategyTimeline`.
- Contains table/SVG timeline rendering logic for multi-strategy milestone comparisons.

### src/dev/session-telemetry.ts
- Lightweight dev-only session telemetry counters. No browser dependencies; pure TypeScript.
- Tracks forge crunches, sacrifice mass/upgrades by tier, loom captures/motes by tier, passive motes, Aliven spawn/kill by variant, cap skips, peak group count, player damage from contact and bullets, bullets fired.
- Exports: `recordForgeCrunch`, `recordForgeSacrifice`, `recordLoomCapture`, `recordLoomEfficiencyUpgrade`, `recordLoomPassiveMotes`, `recordAlivenSpawn`, `recordAlivenKill`, `recordAlivenCapSkip`, `recordPlayerDamageFromContact`, `recordPlayerDamageFromBullet`, `recordAlivenBulletFired`, `resetSessionTelemetry`, `getSessionTelemetrySnapshot`, `getAvgSacrificePerCrunch`.
- State is module-level; `resetSessionTelemetry()` clears all counters. Snapshot is a deep-copy (JSON round-trip) safe for display use.

### src/dev/session-telemetry.test.ts
- 35 Vitest unit tests for session-telemetry.ts (reset, increments, unknown-key robustness, snapshot isolation, derived average).

### src/render/rpg/__tests__/enemy-catalog-coverage.test.ts
- Coverage validation: every enemy type ID that can appear via WAVE_DEFINITIONS, the procedural generator, elite spawns, or aliven groups must have an entry in ENEMY_CATALOG.
- Imports `STANDARD_WAVE_ENEMY_IDS`, `PROCEDURAL_WAVE_ENEMY_IDS`, `ELITE_WAVE_ENEMY_IDS` from `wave-definitions.ts`.
- Intentional exclusion: `'boss'` (boss entries live in `BOSS_DESCRIPTIONS`).
- Fails loudly with wave number and ID when a real type is missing.

### src/render/rpg/__tests__/verdure-polyomino-wave.test.ts
- Regression tests for Verdure wave generation.
- Verifies `getZoneWaveDefinition` uses only polyomino variants on multiples of 10 and keeps the normal procedural pool on non-elite Verdure waves.

### src/render/rpg/__tests__/rpg-expanded-bounds.test.ts
- Regression tests for expanded RPG field-space gameplay bounds.
- Verifies Ruby laser beams clip to `viewport.left/top/right/bottom`, terrain still truncates beams first, and Verdure wall/nav-grid helpers respect nonzero-origin active bounds.

#### Stardust (Particle Cloud Elite — Build 109+)
- **rpg-stardust-factories.ts** — Factory functions for creating Stardust enemies. Exports getStardustParticleCount (scales 6→40 particles over 120 waves) and makeStardustEnemy (initializes particle cloud with random drift velocities and rainbow hue offsets).
- **rpg-stardust-update.ts** — State machine update logic with 5-phase cycle (drifting → warning → frozen → laser → resuming). Exports updateStardustEnemies, builds laser chains using terrain LOS checks (buildLaserChain), detects player damage via segment-circle intersection (checkPlayerLaserIntersection).
- **rpg-stardust-draw.ts** — Canvas rendering for prismatic particle cloud and laser chains. Exports drawStardustEnemies, draws particles with hue-cycling rainbow edges and radial gradient glow, laser chains with rainbow glow + white/gold core, spark bursts at bounce nodes, HP bar.
