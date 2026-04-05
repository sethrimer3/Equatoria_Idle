# Equatoria Idle — Architecture

## Overview

Equatoria Idle is a mobile-first idle game built with TypeScript, rendered on a low-resolution canvas with DOM-based UI overlays. The game centres on upgrading a mathematical equation that generates coloured motes (resources).

## Runtime Flow

1. **Bootstrap** (`src/main.ts` → `src/app/game-app.ts`)
   - Load saved game or create fresh state
   - Build DOM structure: canvas container, panels container, tab bar
   - Set up input listeners on canvas
   - Start `requestAnimationFrame` game loop

2. **Game Loop** (60 fps target)
   - `simTick()` — advance simulation (auto-tap, timers)
   - Process input actions (tap → mote gains + particles)
   - Update particle physics
   - Render: clear → background → equation → score → particles → hints
   - DOM UI update (throttled to ~10 fps)
   - Auto-save check

3. **Action Dispatch**
   - Input layer translates pointer events into `GameAction` objects
   - Tab buttons and upgrade buttons dispatch actions directly
   - `handleAction()` in `game-app.ts` routes all actions

## System Boundaries

```
┌─────────────────────────────────────────────────┐
│  app/  — orchestration, game loop, wiring       │
├──────────┬──────────┬──────────┬────────────────┤
│  sim/    │ render/  │  ui/     │  input/        │
│          │          │          │                │
│ equation │ canvas   │ tabs     │ pointer events │
│ resources│ particles│ panels   │ → GameAction   │
│ progress │ equation │ upgrades │                │
│          │ display  │ resources│                │
│          │          │ settings │                │
├──────────┴──────────┴──────────┴────────────────┤
│  data/     — tiers, upgrades, balance constants │
│  settings/ — save/load, user preferences        │
│  util/     — formatting helpers                 │
└─────────────────────────────────────────────────┘
```

## State Ownership

| State Area       | Owner                          | Mutable? |
|------------------|--------------------------------|----------|
| Equation         | `sim/equation/equation-state`  | Yes      |
| Resources        | `sim/resources/resource-state` | Yes      |
| Progression      | `sim/progression/progression-state` | Yes |
| Particles        | `render/particles/particle-system` | Yes (visual only) |
| Active Tab       | `app/game-app` (AppState)      | Yes      |
| Settings         | `settings/settings-state`      | Yes      |
| Tier definitions | `data/tiers/tier-definitions`  | No (const) |
| Upgrade defs     | `data/upgrades/upgrade-catalog`| No (const) |

## Equation Rendering Pipeline

1. `buildEquationView()` generates `EquationTermView[]` from authoritative equation state
2. `drawEquation()` renders terms on canvas with per-tier colours
3. Terms are joined by `+` operators in a centred layout
4. Flash overlay fades on tap for visual feedback

## Particle Rendering Pipeline

1. `ParticleSystem` manages a fixed-size pool (300 max)
2. On tap, particles are emitted at the pointer position with tier colours
3. Each frame: update physics (velocity, gravity, bounce), shift trails
4. Render: trails as lines, main particles as circles with alpha fade

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
