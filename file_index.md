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
- Sections: reset, app layout, canvas, panels, upgrades, resources, settings, tab bar, media queries.

### src/app/game-app.ts
- Main application orchestrator.
- `startApp()` — bootstraps DOM, creates systems, runs game loop.
- `handleAction()` — central action dispatcher.
- `recomputeGenerators()` — recomputes generator ring positions on resize/tier unlock.
- Game loop: sim tick → particle update → render (generators, forge, equation, score, particles) → UI update → auto-save.

### src/data/tiers/tier-definitions.ts
- Single source of truth for all colour tiers.
- Exports `TIERS`, `TIER_BY_ID`, `VISIBLE_TIERS`, `VISIBLE_TIER_COUNT`.
- 7 visible tiers (red→violet) + 2 secret (prismatic, void).

### src/data/particles/particle-config.ts
- All physics constants for particle simulation.
- Velocities, forces, gravity strengths, merge thresholds, forge parameters, shockwave parameters.

### src/data/particles/size-tiers.ts
- `SizeIndex` type (0–3), `SizeName` type.
- `SMALL/MEDIUM/LARGE/EXTRA_LARGE_SIZE_INDEX` constants.
- Per-size scaling arrays: scale multipliers, velocity modifiers, force modifiers, small equivalents.

### src/data/upgrades/upgrade-types.ts
- `UpgradeDefinition` interface, `UpgradeEffectKind` type.
- `upgradeCostAtLevel()` — cost formula.

### src/data/upgrades/upgrade-catalog.ts
- All upgrade definitions: per-tier tap upgrades, auto-tap, global multiplier.
- Exports `ALL_UPGRADES`, `UPGRADE_BY_ID`.

### src/data/balance/balance-constants.ts
- Global tuning constants: tap values, costs, scaling, intervals, caps.
- `tierUnlockCost()` — cost to unlock next tier.

### src/sim/equation/equation-state.ts
- Authoritative equation state: per-tier segments with levels and unlock flags.
- `createEquationState()`, `applyEquationUpgrade()`, `unlockTier()`, `incrementTapCount()`.

### src/sim/equation/equation-logic.ts
- Tap value computation per segment and per tier.
- `computeTapGains()` — per-tier mote gains for a single tap.
- `buildEquationView()` — generates view-model for rendering.

### src/sim/resources/resource-state.ts
- Authoritative mote totals per tier and lifetime totals.
- `addMotes()`, `spendMotes()`, `getMotes()`, `getTotalMotes()`.

### src/sim/progression/progression-state.ts
- Upgrade levels, unlocked tier count, auto-tap level, global multiplier.
- `purchaseUpgrade()`, `getUpgradeCost()`, `canAffordUpgrade()`, `getAutoTapIntervalMs()`.

### src/sim/game-state.ts
- Aggregate game state combining equation, resources, progression, and forge crunch state.
- `tapEquation()` — main tap action.
- `tryPurchaseUpgrade()`, `tryUnlockNextTier()` — purchase actions.
- `simTick()` — per-frame simulation advance (auto-tap).

### src/sim/forge/forge-state.ts
- `ForgeCrunchState` interface and factory.
- `getForgeRotationMultiplier()` — spin speed multiplier based on crunch phase.

### src/sim/forge/forge-logic.ts
- `getCrunchOutput()` — compute output tier/size from an input particle.
- `checkForgeCrunch()` — detect valid crunch conditions and arm the timer.
- `startForgeCrunch()`, `updateForgeCrunch()` — crunch lifecycle management.
- `getEquationCrunchBonus()` — equation-level-based crunch bonus.

### src/sim/particles/sim-particle-state.ts
- `SimParticleState` — inventory and unlocked tiers.
- `updateInventory()`, `getInventoryTotal()`.

### src/sim/particles/generator-state.ts
- `GeneratorInfo` — position, range, and tier index for each generator.
- `GeneratorState` — generator list, forge position, fade-in map.
- `computeGeneratorPositions()` — places generators in a ring around the equation center.

### src/sim/particles/merge-logic.ts
- `ActiveMergeInfo` — read-only descriptor for an in-progress particle merge.

### src/render/canvas/game-canvas.ts
- Canvas creation and lifecycle.
- Internal resolution: 320px wide, height adapts to aspect ratio.
- `createGameCanvas()`, `resizeCanvas()`, `clearCanvas()`, `drawBackground()`.

### src/render/particles/particle-system.ts
- `ParticleSystem` class with a dynamic particle pool.
- `emit()` — spawn near generator position.
- `emitAtPosition()` — burst at canvas coordinates (tap/auto-tap).
- `update()` — full physics, merges, forge crunch, shockwaves.
- `draw()` — batched square rendering with glow, plus shockwave arcs.
- Merge system: accumulates 100 small particles near a generator → upgrades to next size.
- Forge crunch: particles near the forge are consumed and converted to next tier.
- Shockwave system: expanding ring effect on merge completion.
- Spatial hash grid for efficient shockwave→particle collision.

### src/render/equation/equation-renderer.ts
- `drawEquation()` — renders equation terms on canvas.
- `drawScore()` — score display at top.
- `drawTapHint()` — pulsing "Tap the equation!" hint.

### src/render/generators/generator-renderer.ts
- `drawGenerators()` — draws Star-of-David style rotating generator icons with glow and range circles.

### src/render/forge/forge-renderer.ts
- `drawForge()` — draws the rotating forge icon with glow and attraction radius indicator.
- `drawForgeCrunch()` — draws the crunch animation ring overlay.

### src/input/input-handler.ts
- `GameAction` type (discriminated union of all actions).
- `setupInputListeners()` — pointer event → GameAction dispatch.

### src/input/particle-drag.ts
- `ParticleDragState` — tracks drag position and velocity.
- `handleParticleDragDown/Move/Up()` — lock nearby particles to the pointer and release with velocity.

### src/ui/tabs/tab-bar.ts
- Bottom tab bar: Equation / Upgrades / Settings.
- `createTabBar()` — returns element and `setActiveTab()` method.

### src/ui/panels/upgrade-panel.ts
- Upgrade purchase buttons (per-tier taps, auto-tap, multiplier, tier unlock).
- Updates button labels, costs, and disabled state from game state.

### src/ui/panels/resource-panel.ts
- Per-tier mote display with current and lifetime totals.

### src/ui/panels/settings-panel.ts
- Settings controls: volume sliders, particle toggle, shake toggle, save, reset, credits.

### src/settings/settings-state.ts
- User settings model and localStorage persistence.

### src/settings/save-load.ts
- Game state serialization/deserialization.
- `saveGame()`, `loadGame()`, `deleteSave()`.
- Versioned save format (version 1).

### src/util/format.ts
- `formatNumber()` — K/M/B/T suffix formatting.

