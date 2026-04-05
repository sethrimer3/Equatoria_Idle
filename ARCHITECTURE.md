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
│ particles│ forge    │ settings │ drag     │  config        │
│          │ display  │          │          │  size-tiers    │
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
| Generators       | `sim/particles/generator-state`| Yes (recomputed on resize/unlock) |
| Particles        | `render/particles/particle-system` | Yes (visual + physics) |
| Active Tab       | `app/game-app` (AppState)      | Yes      |
| Settings         | `settings/settings-state`      | Yes      |
| Tier definitions | `data/tiers/tier-definitions`  | No (const) |
| Upgrade defs     | `data/upgrades/upgrade-catalog`| No (const) |
| Physics constants| `data/particles/particle-config` | No (const) |

## Equation Rendering Pipeline

1. `buildEquationView()` generates `EquationTermView[]` from authoritative equation state
2. `drawEquation()` renders terms on canvas with per-tier colours
3. Terms are joined by `+` operators in a centred layout
4. Flash overlay fades on tap for visual feedback

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

- **Tab Bar** (bottom): Equation / Upgrades / Settings
- **Equation tab**: canvas interaction + upgrade buttons
- **Upgrades tab**: per-tier mote totals, upgrade list
- **Settings tab**: volume sliders, toggles, save/reset, credits

## Resize / Scaling Strategy

- Canvas renders at 320px internal width
- Height adapts to container aspect ratio
- CSS `image-rendering: pixelated` for crisp upscaling
- DOM UI renders at device resolution
- Responsive layout with mobile-first CSS, landscape media queries
- Generator positions are recomputed on every resize event

