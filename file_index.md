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
- Game loop: sim tick → particle update → render → UI update → auto-save.

### src/data/tiers/tier-definitions.ts
- Single source of truth for all colour tiers.
- Exports `TIERS`, `TIER_BY_ID`, `VISIBLE_TIERS`, `VISIBLE_TIER_COUNT`.
- 7 visible tiers (red→violet) + 2 secret (prismatic, void).

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
- Aggregate game state combining equation, resources, progression.
- `tapEquation()` — main tap action.
- `tryPurchaseUpgrade()`, `tryUnlockNextTier()` — purchase actions.
- `simTick()` — per-frame simulation advance (auto-tap).

### src/render/canvas/game-canvas.ts
- Canvas creation and lifecycle.
- Internal resolution: 320px wide, height adapts to aspect ratio.
- `createGameCanvas()`, `resizeCanvas()`, `clearCanvas()`, `drawBackground()`.

### src/render/particles/particle-system.ts
- `ParticleSystem` class with pooled particles (300 max).
- `emit()` — burst particles at position.
- `update()` — physics (gravity, bounce, trail shift).
- `draw()` — render trails and dots with alpha fade.

### src/render/equation/equation-renderer.ts
- `drawEquation()` — renders equation terms on canvas.
- `drawScore()` — score display at top.
- `drawTapHint()` — pulsing "Tap the equation!" hint.

### src/input/input-handler.ts
- `GameAction` type (discriminated union of all actions).
- `setupInputListeners()` — pointer event → GameAction dispatch.

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
