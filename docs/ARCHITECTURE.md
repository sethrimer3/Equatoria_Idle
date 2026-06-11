# Equatoria Idle Compact Architecture Guide

Last verified: 2026-06-06
Current build at verification: 230

This file is the compact AI-facing architecture guide. The root `ARCHITECTURE.md` and `DECISIONS.md` remain the deeper references.

## Runtime flow diagram

```
index.html
  └── src/main.ts (DOMContentLoaded)
        └── src/app/game-app.ts :: startApp()
              ├── loadGame() / createGameState()    ← localStorage or fresh
              ├── loadSettings()                    ← localStorage settings
              ├── preloadGeneratorSprites(), preloadForgeSprites(), preloadRefinedGemSprites()
              ├── createGameCanvas() + resizeCanvas()
              ├── createParticleSystem()
              ├── createAudioSystem()
              ├── createTabBar(), createUpgradePanel(), createLoomPanel(), ...
              ├── createRpgRender(container, game.rpg, callbacks)
              ├── wireCanvasPointerInput()           ← pointer/touch → GameAction → dispatch()
              ├── applyIdleRewardsIfEligible()       ← if offline time elapsed
              └── requestAnimationFrame(gameLoop)   ← starts main loop

Main loop (app-game-loop.ts :: createGameLoop()):
  1. simTick(game, deltaMs)           ← looms, auto-tap, achievements, idle drip
  2. tickForgeWarmup(forge, nowMs)    ← forge crunch timer
  3. if RPG tab active: rpgRender.update(deltaMs) → return early
  4. emit particles from looms
  5. particles.update(deltaMs, ...)   ← physics, Particle Life, merges, forge crunch
  6. audio events (merges, forge, achievements)
  7. bgAnimation.update() + render background
  8. drawGenerators(), drawForge(), drawForgeCrunch()
  9. hudOverlay.update(...)           ← live equation + score DOM update (every frame)
  10. particles.draw(...)             ← batched canvas draw
  11. if devMode: drawPerfStats()
  12. if 100ms elapsed: updateVisiblePanels()  ← DOM panel throttle
  13. autosave check (every 30s)
  14. requestAnimationFrame(gameLoop)

Persistence flows:
  Save:  saveGame(state) → serializeGameState() → JSON → localStorage['equatoria_save']
  Load:  localStorage['equatoria_save'] → JSON.parse → deserializeGameState() → GameState
  Reset: sessionStorage['equatoria_reset_pending'] = '1' → deleteSave() → location.reload()
  Offline: localStorage['equatoria_last_active_ts'] → elapsed → applyIdleRewardsIfEligible()

Action flow:
  DOM event → pointer/button handler → dispatch(GameAction) → handleAction() → sim mutation → panel refresh
```

## Runtime shape

Equatoria Idle has four major runtime layers:

1. **App orchestration** in `src/app/`: creates systems, wires inputs, dispatches actions, runs the frame loop, resizes canvases, updates panels, and saves.
2. **Authoritative simulation** in `src/sim/`: owns progression, resources, equation state, forge state, looms, achievements, RPG persistence, and save-relevant data.
3. **Rendering and transient combat visuals** in `src/render/`: owns canvases, particles, forge visuals, backgrounds, RPG entities/effects, and visual-only state.
4. **DOM UI** in `src/ui/` plus `src/styles/`: owns panels, tabs, settings UI, resource displays, RPG menus, and user-facing controls.

The safe default is: app wires, sim decides, render displays, UI dispatches.

## Core update loop

The main loop is created in `src/app/app-game-loop.ts`. At a high level it:

1. Advances simulation ticks and timers.
2. Advances forge warm-up/crunch state.
3. Updates particles and capture fields.
4. Updates background/render systems.
5. Renders the current active view.
6. Computes forge preview display data.
7. Draws dev overlays when enabled.
8. Throttles DOM UI updates.
9. Handles autosave cadence.

When changing update order, check both idle/equation side effects and RPG mode side effects.

## Action flow

`src/app/app-actions.ts` is the central dispatcher for user actions and UI-triggered commands. Inputs and panels should translate intent into actions rather than directly mutating deep state.

Common action sources:

- canvas pointer events via `game-app-canvas-input.ts`;
- tab/panel buttons in `src/ui/`;
- settings toggles and dev tools;
- RPG menu, weapons, upgrade, and crafting UI.

## Coordinate spaces

### Idle/equation view

- Logical world: 320 × 640.
- Canvas/backing depends on render style: pixelated low-res or crisp DPR-backed.
- DOM HUD must align with the same logical coordinate model.
- Resize should not mutate core idle/equation world coordinates.

### RPG view

- Stable safe core: 360 × 640.
- Larger hosts reveal more active/visible world area instead of zooming in.
- Field-space data should drive visible bounds, active bounds, spawn bounds, padded effect bounds, and world/screen conversion.
- Some banners and readability elements intentionally remain centered on the safe core.

Use explicit suffixes in new variables: `World`, `Screen`, `Canvas`, `Ui`, `Px`, `Ms`, `Rad`, `Scale`, `Bounds`.

## State ownership

| State | Owner | Notes |
|---|---|---|
| Resources/motes | `src/sim/resources/` | Authoritative economy totals and lifetime totals |
| Equation progression | `src/sim/equation/` | Tier segments, levels, forge unlock, equation view/eval helpers |
| General progression | `src/sim/progression/` | Upgrade levels, auto-tap, costs, multipliers |
| Forge state | `src/sim/forge/` | Heat taps, warm-up, crunch state, refined progress |
| Looms | `src/sim/looms/` | Passive production, capture conversion, efficiency |
| Achievements | `src/sim/achievements/` | Unlocks, bonuses, notifications |
| Persistent RPG progress | `src/sim/rpg/` and RPG save paths | Equipped weapons, crafted weapons, upgrades, XP/level data |
| Idle visual particles | `src/render/particles/` | Transient visual/physics particles with callbacks into sim |
| RPG combat entities | `src/render/rpg/` | Mostly transient combat entities, projectiles, enemies, effects |
| Settings | `src/settings/` | Persisted preferences and version-tolerant defaults |
| UI active tab/panels | `src/app/` and `src/ui/` | DOM visibility and panel refreshes |

## Equation and idle progression

The equation is a structured tier-driven model, not a flat concatenated string. Tiers either own a slot or wrap the whole expression.

Important concepts:

- Sand is the foundation/pre-equation tier.
- Quartz modifies the time argument.
- Ruby/Sunstone/Citrine/Emerald own inner slots.
- Sapphire/Iolite/Amethyst/Diamond/Nullstone wrap the expression.
- Fracteryl and Eigenstein exist as later/expanded tier concepts in parts of the codebase; check current files before assuming full UI/equation support.

Read:

- `src/data/tiers/tier-definitions.ts`
- `src/data/equation/equation-tier-roles.ts`
- `src/sim/equation/equation-state.ts`
- `src/sim/equation/equation-view.ts`
- `src/sim/equation/equation-eval.ts`
- relevant UI panel files

## Motes, particles, and loom capture

The repository distinguishes economy resources from visual particles.

- Mote totals live in simulation/resource state.
- Visual particles are transient render objects.
- Particle capture and forge completion can report mass back into sim via callbacks.
- Particle sizes use base-100 meaning, where larger `sizeIndex` represents compressed small-equivalent mass.
- 1×1 particles are intentionally inert in Particle Life.
- Alivened tiers participate in Particle Life; non-alivened tiers generally do not.

Read:

- `src/sim/resources/resource-state.ts`
- `src/data/particles/size-tiers.ts`
- `src/render/particles/particle-system.ts`
- `src/render/particles/particle-life.ts`
- `src/render/particles/particle-forge.ts`
- `src/render/particles/forge-field-forces.ts`

## Forge architecture

There are multiple related forge concepts:

1. **Equation Forge unlock/warm-up/crunch**, managed by `src/sim/forge/` and rendered by `src/render/forge/`.
2. **Particle-to-equation sacrifice**, handled through forge crunch completion and `applyForgeSacrifice`.
3. **Refined crystal and crafted weapon system**, added in builds 201-206 and tied to RPG weapon crafting.

Agents must avoid conflating these. The crafted weapon system consumes refined crystals; it should not casually rewrite the idle equation forge loop unless the task explicitly requests that.

## RPG architecture

RPG mode is large and partially render-owned because the combat loop, enemies, projectiles, effects, and draw systems are tightly coupled to canvas state.

Major principles:

- Persistent progression should live in sim/save state.
- Combat transient state can live in RPG render/combat modules.
- Equipped weapon ids may be static or crafted; always use resolver paths where crafted weapons might appear.
- Low-graphics mode should reduce visual cost without changing combat rules.
- Zone-specific backgrounds/terrain should use shared field-space bounds and should not assume the old 360 × 640-only world.

For RPG work, use `docs/AI_REPO_MAP.md` to choose a cluster before reading code.

## Crafted weapon system

Builds 201-206 added the first major crafted weapon implementation:

- Refined crystals are tracked by tier.
- Crafted weapons are serialized in save v30-era structures.
- Crafted ids resolve dynamically through resolver helpers.
- Ingredient tier weights use 100x scaling per tier order.
- Composition affects modifiers.
- Total weighted mote value derives base level and base stat multiplier.
- Amethyst ships, crit, armor ignore, poison bonus, Emerald acquisition range, Nullstone pull, and Fracteryl follow-ups have first-pass hooks.

Open design/implementation areas remain in `docs/TODO.md` and `nextSteps.md`, especially Eigenstein, visual polish, centralizing crafted post-hit hooks, and balance.

## Save/load architecture

Saves are JSON in localStorage with a version field and defaults for old structures. The repo has historical drift in older docs, so when save details matter, verify current save code directly instead of relying only on prose.

Rules:

- Any new persistent field needs safe defaulting for older saves.
- Do not persist transient visual-only data unless deliberately designed.
- Save migrations should be explicit and documented.
- Browser and Electron localStorage profiles are separate.

## Performance-sensitive areas

Treat these as hot paths:

- Particle update and draw loops.
- Particle Life force computation and spatial grids.
- RPG enemy/projectile/combat loops.
- RPG fluid simulation and draw batching.
- Background effects using particles, typed arrays, or offscreen canvases.
- Canvas resize and render-state transitions.

Prefer:

- object pools;
- typed arrays where already used;
- reusable scratch buffers;
- stable arrays and in-place mutation in hot loops;
- simple loops over abstraction-heavy code in per-frame paths.

Avoid:

- per-frame object creation;
- repeated `Map`/`Set` allocation in hot paths unless a reusable scratch structure is impossible;
- accidental DOM work inside animation loops;
- hidden layout thrashing.

## Documentation architecture

Use the docs as layers:

1. `AGENTS.md`: required agent entry point — read order, checklists, constraints.
2. `docs/REPO_MAP.md`: compact folder map with HIGH VALUE / CAUTION / IGNORE labels.
3. `docs/AI_REPO_MAP.md`: extended subsystem map with risks and routing table.
4. `docs/ARCHITECTURE.md`: this compact architecture guide.
5. `docs/AI_TASK_ROUTING.md`: first files, keywords, and pitfalls per task type.
6. `docs/FILE_GUIDE.md`: per-file responsibilities grouped by system.
7. `docs/CONVENTIONS.md`: naming, state, rendering, and testing rules.
8. `docs/DEPENDENCY_MAP.md`: module dependency hierarchy.
9. `docs/CURRENT_STATUS.md`: current status, recent builds, known limitations.
10. `docs/TODO.md`: condensed actionable tasks.
11. `docs/CHANGELOG_FOR_AGENTS.md`: structural change log for agents.
12. Root `file_index.md`: detailed file-level map.
13. Root `ARCHITECTURE.md` and `DECISIONS.md`: deeper historical/technical references.
14. `nextSteps.md`: build history and implementation notes.

## Common failure modes

- Reading too much unrelated RPG code before identifying the correct cluster.
- Treating old docs as current when `nextSteps.md` or source code has moved on.
- Using static weapon maps where crafted weapon ids require dynamic resolver support.
- Changing canvas CSS and accidentally changing gameplay scale or coordinate assumptions.
- Adding visual effects that ignore low-graphics mode or mobile performance.
- Updating behavior without updating `docs/CURRENT_STATUS.md`, `docs/TODO.md`, or `file_index.md`.
