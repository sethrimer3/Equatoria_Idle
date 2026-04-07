# Equatoria Idle — Architecture

## Overview

Equatoria Idle is a mobile-first idle game built with TypeScript, rendered on a low-resolution canvas with DOM-based UI overlays. The game centres on upgrading a mathematical equation that generates coloured motes (resources).

## Runtime Flow

1. **Bootstrap** (`src/main.ts` → `src/app/game-app.ts`)
   - Load saved game or create fresh state
   - Build DOM structure: canvas container, panels container, tab bar
   - Set up input listeners on canvas (tap dispatch + particle drag)
   - Compute initial generator ring positions
   - Start `requestAnimationFrame` game loop

2. **Game Loop** (60 fps target)
   - `simTick()` — advance simulation (auto-tap, timers)
   - Recompute generators if tier count changed
   - Update particle physics (generators, forge crunch, merge system, shockwaves)
   - Render: clear → background → generators → forge → equation → score → crunch overlay → particles → hints
   - DOM UI update (throttled to ~10 fps)
   - Auto-save check

3. **Action Dispatch**
   - Input layer translates pointer events into `GameAction` objects
   - Tab buttons and upgrade buttons dispatch actions directly
   - `handleAction()` in `game-app.ts` routes all actions

## System Boundaries

```
┌────────────────────────────────────────────────────────────┐
│  app/  — orchestration, game loop, wiring                  │
├──────────┬──────────┬──────────┬──────────┬────────────────┤
│  sim/    │ render/  │  ui/     │  input/  │  data/         │
│          │          │          │          │                │
│ equation │ canvas   │ tabs     │ pointer  │ tiers          │
│ resources│ particles│ panels   │ events → │ upgrades       │
│ progress.│ equation │ upgrades │ GameAct. │ balance        │
│ forge    │ generators│resources│ particle │ particles/     │
│ looms    │ forge    │ looms    │ drag     │  config        │
│ particles│ display  │ equation │          │  size-tiers    │
│          │          │ settings │          │ looms          │
│          │          │          │          │ equation/roles │
├──────────┴──────────┴──────────┴──────────┴────────────────┤
│  settings/ — save/load, user preferences                   │
│  util/     — formatting helpers                            │
└────────────────────────────────────────────────────────────┘
```

## State Ownership

| State Area       | Owner                          | Mutable? |
|------------------|--------------------------------|----------|
| Equation         | `sim/equation/equation-state`  | Yes      |
| Resources        | `sim/resources/resource-state` | Yes      |
| Progression      | `sim/progression/progression-state` | Yes |
| Forge crunch     | `sim/forge/forge-state`        | Yes (via forge-logic) |
| Looms            | `sim/looms/loom-state`         | Yes      |
| Generators       | `sim/particles/generator-state`| Yes (recomputed on resize/unlock) |
| Particles        | `render/particles/particle-system` | Yes (visual + physics) |
| Active Tab       | `app/game-app` (AppState)      | Yes      |
| Settings         | `settings/settings-state`      | Yes      |
| Tier definitions | `data/tiers/tier-definitions`  | No (const) |
| Loom definitions | `data/looms/loom-definitions`  | No (const) |
| Equation roles   | `data/equation/equation-tier-roles` | No (const) |
| Upgrade defs     | `data/upgrades/upgrade-catalog`| No (const) |
| Physics constants| `data/particles/particle-config` | No (const) |

## Equation Rendering Pipeline

1. `buildEquationView()` generates `EquationTermView[]` from authoritative equation state (only when forge is unlocked)
2. Each term carries a `tierId`, `color`, `text`, `level`, and `operator` (passive_time, manual_input, addition, multiplication, exponentiation, summation, product, factorial, integration, recursion)
3. **Canvas rendering**: `drawEquation()` renders terms on canvas with per-tier colours and `+` operators
4. **DOM rendering**: `buildStructuredEquation()` in the Equation panel generates HTML with colored `<span>` elements, superscripts for exponents, and subscripts for summation/product notation
5. Flash overlay fades on tap for visual feedback

## Loom System

- Each of the 11 gemstone tiers has a passive production Loom
- Sand Loom starts unlocked at level 1; other Looms unlock when their tier unlocks
- `tickLooms()` runs every sim tick, producing fractional motes per tier via an accumulator
- Loom definitions in `data/looms/` set base rate, rate per level, base cost, and cost scaling
- Looms are displayed in the Looms tab with per-tier cards showing level, rate, and upgrade button

## Particle Rendering Pipeline

1. `ParticleSystem` manages a dynamic pool of `EquatoriaParticle` objects
2. On tap, `emitAtPosition()` spawns small particles at pointer canvas coords
3. Each frame `update()` runs:
   - Per-particle physics: generator gravity, forge attraction, veer, velocity clamping, bounce
   - Merge detection: 100 small particles near a generator → upgrade to next size
   - Particle limit enforcement: auto-merge excess small particles
   - Forge crunch: eligible medium+ particles near forge → consumed after timer → next-tier output
   - Shockwave expansion and impulse application (spatial hash grid)
4. `draw()` batches particles by color+size for efficient canvas rendering, then draws shockwave arcs

## Generator System

- Generators are positioned in a ring around the equation center
- Each unlocked tier gets one generator
- Ring radius scales with `min(canvasWidth, canvasHeight) * 0.35`
- Recomputed on resize and tier unlock events
- Drawn as counter-rotating Star-of-David triangles with glow and dashed influence radius

## Forge System

- Single forge at the equation center
- Animates with spin speed that accelerates as crunch timer counts down
- Medium/large/extra-large particles within `FORGE_RADIUS` trigger the crunch timer
- After `FORGE_VALID_WAIT_TIME_MS`, a crunch animation plays, consuming particles and outputting next-tier equivalents
- Forge crunch state lives in `GameState.forge` so it persists with the game state object

## Particle Drag Interaction

- `ParticleDragState` tracks pointer position and velocity
- On pointer down: particles within `INTERACTION_RADIUS_FRACTION * min(w,h)` are locked to pointer
- On pointer move: locked particles follow the pointer
- On pointer up: particles are released; if stationary, velocity is reduced to minimum

## UI Structure

- **Tab Bar** (bottom): Equation / Looms / Upgrades / Settings — always visible over game canvas
- **Equation tab**: Shows the Equation Forge. Before unlock: dormant locked presentation with Sand cost requirement. After unlock: the colored f(t) equation display + equation-specific upgrades + tier unlock button.
- **Looms tab**: Shows per-tier passive production Looms in card layout — tier name, gem icon, description, level, production rate, upgrade button. Only unlocked tiers' Looms are shown.
- **Upgrades tab**: slides in from the right over the canvas as a semi-transparent overlay. Contains upgrade buttons (with gem icon sprites), resource rows (with refined gem sprites), and tier unlock button.
- **Settings tab**: slides in same as Upgrades — volume sliders, toggles, save/reset, credits

## Early-Game Progression

1. Player starts with Sand Loom unlocked (level 1, 1 mote/sec)
2. Sand Loom can be upgraded using Sand motes (Looms tab)
3. At 50 Sand, player can unlock the Equation Forge (Equation tab)
4. After Equation Forge is unlocked, the f(t) equation appears and becomes tappable
5. Unlocking Quartz adds the first equation term (passive r·t)
6. Unlocking Ruby adds the manual tap variable (x)
7. Further tiers add increasingly complex mathematical operators

## Loading Screen

- Displays company logo (gravy_thyme_logo.webp) on a black background
- Shows a pulsing "Loading..." text indicator
- Fades out after assets are preloaded (minimum 1.5s for branding)

## Background Animation

- 2402-frame WebP sequence at 24fps (100 seconds, looping)
- Rendered to a dedicated background canvas behind all game content
- Uses a rolling buffer of ~60 frames to avoid loading all frames into memory
- Frames are loaded progressively and evicted when far from playback position

## Sprite Assets

All sprites are served from `public/assets/`:
- **Gem icons** (`sprites/gemIcons/`): per-tier raw gem icons used in upgrade buttons
- **Refined gems** (`sprites/refinedGems/`): per-tier refined gem icons used in resource rows
- **Generators** (`sprites/generators/`): per-tier generator sprites rendered on canvas
- **Forge** (`sprites/equationForge/`): dual forge sprites with counter-rotation
- **Logo** (`sprites/logo/`): company logo for loading screen
- **Background animation** (`animations/menuBackground_animation/`): frame sequence

Tier-to-gem mapping is defined in `src/render/assets/asset-paths.ts`.

## Resize / Scaling Strategy

- Canvas renders at 320px internal width
- Height adapts to container aspect ratio
- CSS `image-rendering: pixelated` for crisp upscaling
- DOM UI renders at device resolution
- Responsive layout with mobile-first CSS, landscape media queries
- Generator positions are recomputed on every resize event

