# Equatoria Idle — File Index

## Root

- `index.html` — Entry point HTML, loads styles and main.ts
- `vite.config.ts` — Vite build configuration
- `tsconfig.json` — TypeScript compiler configuration
- `package.json` — Dependencies and scripts

## src/

### src/main.ts
- Entry point. Boots the app when DOM is ready.

### src/styles.css
- All CSS for the game. Mobile-first responsive layout.
- Sections: reset, app layout, canvas, panels, upgrades, resources, settings, tab bar, Loom cards, equation display, forge locked/unlocked presentation, media queries.

### src/app/game-app.ts
- Main application orchestrator.
- `startApp()` — bootstraps DOM, creates systems, runs game loop.
- `handleAction()` — central action dispatcher (tap, purchase, unlock forge, upgrade loom, tab switch, save, reset).
- `recomputeGenerators()` — recomputes generator ring positions on resize/tier unlock.
- Game loop: sim tick (Looms + auto-tap) → particle update → render → UI update → auto-save.

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

### src/sim/equation/equation-state.ts
- Authoritative equation state: per-tier segments with levels and unlock flags.
- `isForgeUnlocked` — whether the Equation Forge is active.
- `createEquationState()`, `applyEquationUpgrade()`, `unlockTier()`, `incrementTapCount()`, `unlockForge()`.

### src/sim/equation/equation-logic.ts
- Tap value computation per segment and per tier (only when forge is unlocked).
- `computeTapGains()` — per-tier mote gains for a single tap (skips Sand foundation tier).
- `buildEquationView()` — generates `EquationTermView[]` with `operator` field (EquationRole).
- `buildStructuredEquationHtml()` — builds nested equation HTML from inside out (slot/wrapper model). Quartz sets f(…t), Ruby/Sunstone/Citrine/Emerald modify inner slots, Sapphire+ wrap the expression.
- `computeEquationOutput()` — evaluates the structured equation for scoring.

### src/sim/resources/resource-state.ts
- Authoritative mote totals per tier and lifetime totals.
- `addMotes()`, `spendMotes()`, `getMotes()`, `getTotalMotes()`.
- `getEquivalence()` — product of all non-zero per-tier mote totals (player's "Equivalence" score).

### src/sim/progression/progression-state.ts
- Upgrade levels, unlocked tier count, auto-tap level, global multiplier.
- `purchaseUpgrade()`, `getUpgradeCost()`, `canAffordUpgrade()`, `getAutoTapIntervalMs()`.

### src/sim/game-state.ts
- Aggregate game state combining equation, resources, progression, forge, Looms, and achievements.
- `tapEquation()` — multiplies gains by `achievements.tapMultiplierBonus`.
- `tryPurchaseUpgrade(state, id, bypassCost?)`, `tryUnlockNextTier(state, bypassCost?)`, `tryUnlockEquationForge(state, bypassCost?)`, `tryUpgradeLoom(state, tierId, bypassCost?)` — optional dev mode cost bypass.
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
- Fixed 11-slot circular layout with 160px radius.
- Generators start at 270° (12 o'clock) with equal angular spacing (360°/11).

### src/sim/particles/merge-logic.ts
- `ActiveMergeInfo` — descriptor for in-progress particle merge.

### src/render/canvas/game-canvas.ts
- Canvas creation and lifecycle at 320px internal width.

### src/render/assets/asset-paths.ts
- Centralized asset path definitions (single source of truth).

### src/render/assets/asset-loader.ts
- Image loading utility with caching.

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
- `updateParticlePhysics()` — full per-particle physics step.
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

### src/render/particles/spatial-grid.ts
- Numeric-keyed spatial hash grid for collision queries.
- `buildSpatialGrid()`, `forEachNearby()` — callback-based (no result array allocation).

### src/render/particles/particle-system.ts
- Slim orchestrator class (~200 lines, reduced from 1112).
- Owns particle array, merge/shockwave lists, and pool.
- Runs per-frame update pipeline: physics → trails → Euler → merges → forge → shockwaves.
- Delegates rendering to `particle-renderer.ts`.

### src/render/equation/equation-renderer.ts
- `drawEquation()` — renders equation terms on canvas.
- `drawScore()` — score display at top.
- `drawTapHint()` — pulsing hint for new players.

### src/render/generators/generator-renderer.ts
- Generator sprite rendering with procedural fallback.

### src/render/forge/forge-renderer.ts
- Forge sprite rendering with crunch animation overlay.

### src/data/achievements/achievement-definitions.ts
- 9 achievement definitions for tiers sand through amethyst (last two tiers excluded).
- Each achievement: id, displayName, description, requiresTierId, requiresLifetimeMotes, bonusKind, bonusMultiplier.
- Bonus kinds: `tap_multiplier` (×tap gains) or `loom_multiplier` (×loom production).
- Exports `ACHIEVEMENT_DEFINITIONS`, `ACHIEVEMENT_BY_ID`.

### src/sim/achievements/achievement-state.ts
- `AchievementState` — set of unlocked achievement IDs plus cached bonus multipliers.
- `checkAndUnlockAchievements()` — checks lifetime motes for each tier and unlocks achievements.
- `recomputeBonuses()` — recalculates `tapMultiplierBonus` and `loomMultiplierBonus` from unlocked set.

### src/input/input-handler.ts
- `GameAction` type: tap, purchase_upgrade, unlock_next_tier, unlock_equation_forge, upgrade_loom, set_active_tab, save_game, reset_game.
- `TabId` type: 'equation' | 'looms' | 'resources' | 'achievements' | 'settings'.
- `setupInputListeners()` — pointer event → GameAction dispatch.

### src/input/particle-drag.ts
- Particle drag interaction state and handlers.

### src/ui/loading/loading-screen.ts
- Loading screen with company logo and fade-out transition.

### src/ui/tabs/tab-bar.ts
- Bottom tab bar: Equation / Looms / Tiers / Achievements / Settings.
- Looms and Equation are the two main progression tabs.
- `createTabBar()` — returns element and `setActiveTab()` method.

### src/ui/panels/equation-panel.ts
- Equation tab content — the central Equation Forge panel.
- Before forge unlock: shows dormant locked forge state with description and unlock button (50 Sand).
- After forge unlock: shows the structured nested f(t) equation display + equation upgrades grouped by tier.
- `buildStructuredEquationHtml()` from sim layer generates the nested HTML.
- Hovering an equation upgrade highlights the corresponding tier's equation fragments.
- `createEquationPanel(dispatch)` — now takes dispatch handler for forge unlock and upgrade purchases.

### src/ui/panels/loom-panel.ts
- Looms tab content.
- Shows a card per unlocked tier's Loom: name, description, level, production rate, upgrade button.
- Updates affordability and visibility based on game state.

### src/ui/panels/upgrade-panel.ts
- Tier progression panel (renamed from Upgrades).
- Contains only the tier unlock button for unlocking new gemstone tiers.
- Equation upgrades and forge unlock have moved to the Equation panel.

### src/ui/panels/achievements-panel.ts
- Achievements tab content.
- Shows a card per achievement: name, bonus badge, description, progress/unlock status.
- Locked achievements shown at reduced opacity; unlocked ones highlighted with trophy icon.

### src/ui/panels/resource-panel.ts
- Per-tier mote display with refined gem icons.

### src/ui/panels/settings-panel.ts
- Settings controls: volume, particles, shake, developer mode toggle, save, reset, credits.

### src/settings/settings-state.ts
- User settings model and localStorage persistence.
- `isDevMode: boolean` — when true, all game actions bypass cost checks.
- `numberFormat: 'letters' | 'scientific' | 'engineering'` — controls number display format across all UI panels and canvas score.

### src/settings/save-load.ts
- Game state serialization/deserialization.
- Versioned save format (version 4): includes Loom state, `isForgeUnlocked`, and achievement unlock set.
- Backward-compatible with version 1, 2, and 3 saves.

### src/util/format.ts
- `formatNumber()` — convenience wrapper, always uses 'letters' format.
- `formatNumberAs(n, format)` — format using 'letters' (K/M/B/T/Qa/Qi/Sx/Sp), 'scientific' (1.23e9), or 'engineering' (1.23×10⁹) notation.
- `NumberFormat` type — `'letters' | 'scientific' | 'engineering'`.
