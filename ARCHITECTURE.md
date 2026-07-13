# Equatoria Idle — Architecture

## Overview

Equatoria Idle is a mobile-first idle game built with TypeScript, rendered on a low-resolution canvas with DOM-based UI overlays. The game centres on upgrading a mathematical equation that generates coloured motes (resources).

## Runtime Flow

1. **Bootstrap** (`src/main.ts` → `src/app/game-app.ts`)
   - Load saved game or create fresh state
   - Build DOM structure: canvas container, panels container, tab bar
   - Set up input listeners on canvas (tap dispatch + particle drag)
   - Compute initial generator ring positions
   - Start the owned game-loop controller and return an `AppRuntime`

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

## Application Runtime Lifecycle

Each successful `startApp()` invocation returns one `AppRuntime` with an idempotent `dispose()` method. `main.ts` retains the current handle and disposes it before replacement.

The runtime composes app-scoped cleanup in reverse creation order. The main loop stops first, followed by global listeners, canvas input, panel/RPG resources, timers, callbacks, audio, background effects, and achievement registration. Root DOM is removed last. Cleanup failures are reported individually and do not prevent remaining cleanup.

The main `GameLoopController` owns at most one pending animation frame. Repeated `start()` calls cannot create parallel loops, `stop()` cancels the pending frame, stopping during a callback prevents a successor, and disposed loops cannot simulate. Frame cadence, FPS limiting, update/render ordering, RPG updates, and auto-save remain in the existing loop body.

The shared lazy `AudioContext`, decoded audio buffers, asset caches, and the reusable RPG zone-select stylesheet are process-scoped. App-created audio sources/gains/timers, DOM, callbacks, effects, listeners, and render resources are runtime-scoped.

Reset remains a page-reload flow. Runtime disposal provides teardown and safe replacement; it is not an in-process reset of gameplay state.

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
2. Each term carries a `tierId`, `color`, `text`, `level`, and `operator` (role type: time_argument, base_value, additive_slot, multiplier_slot, exponent_slot, summation_wrap, product_wrap, factorial_wrap, integral_wrap, recursion_wrap)
3. **Structured equation model**: The equation is built as a nested mathematical structure, NOT a flat list of appended terms. Each tier either:
   - modifies a specific slot value (Ruby = base, Sunstone = additive, Citrine = multiplier, Emerald = exponent)
   - wraps the entire expression (Sapphire = Σ, Iolite = Π, Amethyst = Γ!, Diamond = ∫, Nullstone = lim)
   - modifies the left-side time argument (Quartz: f(t) → f(2t) → f(3t))
4. **DOM rendering**: `buildStructuredEquationHtml()` builds the equation from inside out as nested HTML with colored `<span>` elements, superscripts, subscripts, and proper parenthesization
5. **Canvas rendering**: `drawEquation()` builds color-segmented equation text for the low-res canvas
6. Hovering an equation upgrade highlights the corresponding tier's equation fragments
7. Flash overlay fades on tap for visual feedback

### Equation Progression (visual example):
- Forge locked → (dormant state)
- Quartz: `f(t) = …`
- Ruby: `f(t) = 1`
- Sunstone: `f(t) = 1 + 1`
- Citrine: `f(t) = (1 + 1) × 1`
- Emerald: `f(t) = ((1 + 1) × 1)^1`
- Sapphire: `f(t) = Σ(((1 + 1) × 1)^1)`
- Iolite: `f(t) = Π(Σ(((1 + 1) × 1)^1))`
- Higher tiers wrap further

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
   - **Particle Life forces**: pairwise interactions governed by a 13×13 interaction matrix
     - 1×1 motes are fully inert (no forces applied or received)
     - Protected radius prevents singularity collapse
     - Matrix-controlled mid-range forces with cosine taper
     - Optional size-force bias: `sqrt(sizePixels)` scaling
   - Velocity damping and max speed clamping
   - Toroidal position wraparound
   - Merge detection: 100 small particles near a generator → upgrade to next size
   - Particle limit enforcement: auto-merge excess small particles
   - Forge crunch: eligible medium+ particles near forge → consumed after timer → next-tier output
   - Shockwave expansion and impulse application (spatial hash grid)
4. `draw()` batches particles by color+size for efficient canvas rendering, then draws shockwave arcs and optional debug overlays

## Generator System

- Generators are positioned in a ring around the equation center (logical coordinate 160, 320)
- Each unlocked tier gets one generator
- Ring radius: `GENERATOR_RADIUS_PX = 160 * SCENE_ZOOM_SCALE = 128` logical px
- Positions are expressed in the fixed 320 × 640 logical coordinate space and **never change on resize**
- Recomputed only when the unlocked tier count changes
- Drawn as counter-rotating Star-of-David triangles with glow and dashed influence radius

## Scaling / Viewport Model (build 128+)

The Equation / Idle render uses a **fixed logical coordinate space** of 320 × 640 px.

- All game state (particles, generators, loom fields, forge center) lives in this space at all times.
- `#canvas-container` is a full-screen flex container that letterboxes / pillarboxes `#game-area`.
- `#game-area` is a `position: relative` div whose CSS dimensions are updated by `resizeCanvas()` to be the largest 320:640 rectangle that fits the container.
- Both `#game-canvas` and `#hud-overlay` are children of `#game-area`, so percentage-based HUD positions (generator equation labels) map correctly to logical coordinates.
- `canvasCoordsFromPointerEvent()` converts pointer events from CSS/screen → logical using `getBoundingClientRect()` on the canvas.
- Resize events update only the CSS display size; no game-world state is mutated.
- Dev mode draws an `[Idle Viewport Debug]` overlay (top-right) showing logical size, CSS size, backing size, devicePixelRatio, and render scale.

## Forge System

- Single forge at the equation center
- Animates with cold and fiery sprite pairs in the same orientation; idle/cold state spins very slowly, and a forge tap fades into the fiery pair before cooling back down
- Five decorative ring sprites from Thero Idle TD rotate around the forge via `render/forge/forge-ring-renderer.ts`; these are visual-only and centered on the same canvas forge coordinates used by particles and input
- Spin speed accelerates as crunch timer counts down
- Medium/large/extra-large particles within `FORGE_RADIUS` trigger the crunch timer
- After `FORGE_VALID_WAIT_TIME_MS`, a crunch animation plays, consuming particles and outputting next-tier equivalents
- Forge crunch state lives in `GameState.forge` so it persists with the game state object

## Particle Drag Interaction

- `ParticleDragState` tracks pointer position and velocity
- On pointer down: particles within `INTERACTION_RADIUS_FRACTION * min(w,h)` are locked to pointer
- On pointer move: locked particles follow the pointer
- On pointer up: particles are released; if stationary, velocity is reduced to minimum

## RPG Combat Rendering

- `createRpgRender()` creates one renderer-local `RpgEncounterCollections` owner for encounter
  bodies, sub-entities, special encounters, rewards, and short-lived combat visuals. Update, draw,
  targeting, wave/dead-sweep, and restart contexts retain the same stable arrays.
- Boss entry, zone switching, normal restart, and boss restart use explicit typed reset profiles that
  truncate arrays in place. Specialized Verdure, Nadir, boss/MIDI, weapon, fluid, and player-effect
  cleanup remains outside the collection owner.
- `createRpgRender()` separately owns input state, weapon timers and internals, companion ships,
  scalar wave/boss/player state, terrain, audio hooks, and the RPG stats panel DOM
- Persistent RPG progression lives in `RpgSimState`; equipped weapon ids and weapon tiers are read from sim state rather than duplicated in rendering code
- Sapphire and Amethyst companion ships are persistent render/combat entities while their weapons are equipped; ship count is derived from weapon tier
- Sapphire ships use nearest-enemy targeting. Amethyst ships sort enemies by distance from the player and distribute ships across the furthest targets
- The RPG stats panel is DOM-based and includes a compact per-equipped-weapon DPS widget using a rolling 10 second damage sample
- Low graphics mode is passed from settings through the app game loop into RPG draw modules, where glow and trail-heavy passes are skipped without changing combat state

## UI Structure

- **Tab Bar** (bottom): Equation / Looms / Tiers / Achievements / Settings — always visible over game canvas
- **Equation tab**: Shows the Equation Forge as a panel overlay. Before forge unlock: dormant locked presentation with Sand cost requirement and unlock button. After unlock: the colored nested f(t) equation display + equation-specific upgrades grouped by tier with hover-highlight linking.
- **Looms tab**: Shows per-tier passive production Looms in card layout — tier name, gem icon, description, level, production rate, upgrade button. Only unlocked tiers' Looms are shown.
- **Tiers tab**: slides in from the right over the canvas as a semi-transparent overlay. Contains the tier unlock button for unlocking new gemstone tiers.
- **Achievements tab**: shows achievement cards with progress tracking and bonus multipliers
- **Settings tab**: slides in same as others — volume sliders, toggles, save/reset, credits

## Early-Game Progression

1. Player starts with Sand Loom unlocked (level 1, 1 mote/sec), default tab is Looms
2. Sand Loom can be upgraded using Sand motes (Looms tab)
3. At 50 Sand, player can unlock the Equation Forge (Equation tab shows locked state with unlock button)
4. After Equation Forge is unlocked, the f(t) equation appears
5. Unlocking Quartz adds the time argument: f(t) = …
6. Unlocking Ruby adds the first base value: f(t) = 1
7. Unlocking Sunstone adds addition: f(t) = 1 + 1
8. Unlocking Citrine wraps with multiplication: f(t) = (1 + 1) × 1
9. Unlocking Emerald wraps with exponentiation: f(t) = ((1 + 1) × 1)^1
10. Higher tiers add summation, product, factorial, integral, and recursion wrappers

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
- **Forge** (`sprites/equationForge/`): hot/cold dual forge sprites with counter-rotation, plus five Thero-derived blurred ring sprites in `forgeRings/`
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

## Boss MIDI Attack Scheduling

Boss-wave fights can opt into MIDI-backed attack timing without changing normal waves or player attacks.

- Runtime `.mid` files live in `ASSETS/bossMidi/`; `scripts/copy-assets.mjs` copies that folder into `dist/ASSETS`.
- `src/data/rpg/boss-midi-parser.ts` parses Type-0/Type-1 MIDI files into normalized note events with `timeMs`, `durationMs`, `beat`, `durationBeats`, `note`, `velocity`, `channel`, and optional track/instrument metadata.
- `src/data/rpg/boss-midi-scheduler.ts` advances from boss-wave simulation elapsed time, not wall-clock time, so boss speed scaling also scales MIDI attack timing.
- `src/data/rpg/boss-midi-config.ts` maps notes to existing boss attack kinds by exact note, pitch class, channel, and velocity intensity ranges.
- `src/render/rpg/rpg-boss-midi-runtime.ts` loads/parses each boss MIDI file once, caches success/failure, and adapts note events into existing boss special attack spawners.
- A boss pattern may define multiple phrases; Quartz boss uses `ASSETS/bossMidi/1-QuartzBoss/wave1.mid` through `wave6.mid` as sequential boss attack phrases and plays the matching `waveN.ogg` as each phrase begins.
- Optional boss music loops use the same ModSynth-style split between `beatLoop.ogg` and background layer OGGs while the boss fight is active.
- Missing, invalid, unsupported, or still-loading MIDI files fail closed: existing boss-wave stage director/projectile behavior continues unchanged.

To add a new MIDI-backed boss pattern, put the MIDI file in `ASSETS/bossMidi/`, add a `BOSS_MIDI_PATTERNS` entry for that boss id, and map notes/channels/velocity ranges to existing boss attack families. Keep parsing out of per-frame code; the scheduler should only walk already-normalized events.

