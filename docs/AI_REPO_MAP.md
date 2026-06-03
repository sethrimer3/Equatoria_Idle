# Equatoria Idle AI Repo Map

Last verified: 2026-06-03
Current build at verification: 206

Purpose: help AI agents orient quickly without scanning the entire repository. Use this file to choose the smallest relevant source set before reading code.

## Project summary

Equatoria Idle is a Vite + TypeScript mobile-first web game with Electron desktop support. It combines:

- an idle/equation progression layer with motes, tiers, looms, forge behavior, achievements, and save/load;
- a visual particle simulation around the equation forge and loom fields;
- an RPG combat mode with zones, enemies, weapons, crafted weapons, terrain, field-space scaling, and visual effects;
- DOM-based menus, tabs, settings, and upgrade panels over low-resolution canvas rendering.

## Validation commands

Declared in `package.json`:

| Command | Purpose |
|---|---|
| `npm run dev` | Vite development server |
| `npm run typecheck` | TypeScript check only |
| `npm run build` | TypeScript check plus production Vite build |
| `npm run build:desktop` | TypeScript check plus desktop-mode Vite build |
| `npm run desktop` | Build desktop output and launch Electron |
| `npm run test` | Vitest test run |
| `npm run lint` | ESLint over `src` |
| `npm run preview` | Vite preview |

## Fast read guide by task type

| Task type | Start here | Then read |
|---|---|---|
| General repo orientation | `AGENTS.md`, this file, `docs/CURRENT_STATUS.md` | `file_index.md`, root `ARCHITECTURE.md` |
| Build/test/lint failures | `package.json`, exact failing file | nearby imports and changed files |
| Idle/equation progression | `src/sim/equation/`, `src/data/equation/`, `src/ui/` equation panels | `src/app/app-actions.ts`, `src/app/app-game-loop.ts` |
| Motes/resources/save | `src/sim/resources/`, `src/settings/`, `src/sim/game-state.ts` | `DECISIONS.md` save section |
| Looms | `src/sim/looms/`, `src/data/looms/`, loom UI panel | particle loom-capture files |
| Equation forge | `src/sim/forge/`, `src/render/forge/`, `src/render/particles/particle-forge.ts` | `src/app/app-forge-preview.ts` |
| Particle simulation | `src/render/particles/`, `src/data/particles/` | canvas/render loop files |
| RPG combat | `src/render/rpg/`, `src/data/rpg/`, `src/sim/rpg/` | `docs/CURRENT_STATUS.md` for recent crafted-weapon context |
| Crafted weapons | `src/data/rpg/crafted-weapons*`, RPG weapons UI, RPG player attack files | save/load and resolver registration files |
| RPG field-space/viewport bugs | `src/render/rpg/rpg-field-space.ts`, RPG render/input files, CSS canvas rules | `DECISIONS.md` coordinate sections |
| Zone backgrounds/terrain | `src/render/background/`, RPG terrain modules, zone selection logic | specific zone enemy/spawn files |
| UI layout/tab work | `src/ui/`, `src/styles/`, `src/app/app-actions.ts` | settings/persistence if adding toggles |
| Electron/desktop | `electron/main.cjs`, `ELECTRON.md`, `vite.config.ts`, batch scripts | asset copy script |
| Google Play readiness | `package.json`, `vite.config.ts`, manifests/icons, `public/`, save/privacy docs | Capacitor wrapper does not exist yet |

## Root files and docs

| File | Purpose | Read when |
|---|---|---|
| `AGENTS.md` | Short required entry point for agents | Always before editing |
| `agents.md` | Long-standing agent rules and coding standards | When planning or validating implementation work |
| `README.md` | Quick start, project summary, deployment notes | First orientation pass |
| `ARCHITECTURE.md` | Detailed architecture and runtime flow | Durable architecture, coordinate, rendering, sim changes |
| `DECISIONS.md` | Historical technical decisions | Save formats, coordinate systems, render strategy, big numbers |
| `file_index.md` | Detailed per-file map | When selecting exact files to inspect |
| `nextSteps.md` | Historical/current build notes | Current implementation status and deferred items |
| `ELECTRON.md` | Desktop launch and troubleshooting | Electron changes |
| `package.json` | Scripts and toolchain | Validation, dependencies, scripts |
| `vite.config.ts` | Vite build config | Deployment/base path/build behavior |
| `src/buildInfo.ts` | Displayed build number | Any code-change PR |

## Main source regions

### `src/app/`

Application orchestration. Read for bootstrap, resize wiring, action dispatch, game-loop integration, active-tab switching, UI refresh, and bridges between sim/render/UI.

Key files:

- `game-app.ts`: starts the app, wires DOM, panels, canvas input, resize, loop.
- `app-actions.ts`: central `handleAction()` dispatcher and tab switching.
- `app-game-loop.ts`: frame loop and cross-system update/render order.
- `app-forge-preview.ts`: pure forge warm-up equation preview bridge between render particles and sim equation state.
- `game-app-canvas-input.ts`: pointer input wiring for tap, drag, hover, forge/equation actions.
- `game-app-idle.ts`: offline/idle reward eligibility and queueing helper.

Risks:

- Do not bury progression logic inside UI or DOM handlers.
- Tab switches often need both DOM panel refresh and canvas/render lifecycle updates.
- Resize behavior differs between idle canvas and RPG canvas.

### `src/sim/`

Authoritative gameplay state and deterministic rules.

Important subareas:

- `game-state.ts`: aggregate state, tap actions, forge sacrifice, loom capture, dev bypasses, tick integration.
- `equation/`: equation state, tap gains, structured equation views, output evaluation.
- `resources/`: mote totals, lifetime totals, equivalence score, base-100 size count encode/decode.
- `progression/`: upgrade levels, costs, auto-tap, global multiplier.
- `forge/`: forge crunch/warm-up state, heat taps, timers, crunch lifecycle.
- `looms/`: loom state, passive production, capture conversion, efficiency upgrades.
- `particles/`: sim-facing particle/generator state helpers.
- `rpg/`: persistent RPG progression, equipped weapons, upgrades, crafted weapons, XP/levels.

Risks:

- `sim/` should not depend on DOM, canvas, CSS, audio, or render-only state.
- Save/load versioning must be explicit when persistent shapes change.
- Large-number behavior still relies on JavaScript numbers in many places; avoid accidental overflow-prone comparisons without checking current helpers.

### `src/data/`

Static definitions, constants, tuning, tier metadata, upgrade catalogs, and data-driven behavior.

Important subareas:

- `tiers/`: canonical tier definitions and ordering.
- `equation/`: tier-to-equation-role mapping.
- `looms/`: loom definitions and cost/rate helpers.
- `particles/`: particle physics config, Particle Life matrix, size-tier helpers, mutable dev tweaks.
- `upgrades/`: equation/idle upgrade catalog and formulas.
- `balance/`: global idle balance constants.
- `rpg/`: RPG weapon definitions, upgrade definitions, crafted weapon logic, weapon resolvers.

Risks:

- Do not scatter tier colors, ids, or ordering across unrelated files.
- Crafted weapons depend on tier weight/composition math; avoid hardcoded per-tier assumptions outside the canonical helpers.

### `src/render/canvas/`

Canvas creation, resize, render-state reset, and idle viewport debug.

Key concepts:

- Idle/equation view uses a 320 × 640 logical coordinate space.
- Pixelated idle canvas mode uses a low backing resolution and CSS upscaling.
- Crisp mode uses CSS × DPR backing.
- DOM HUD overlays must map to the same logical coordinate assumptions.

Risks:

- Avoid mixing CSS pixels, backing pixels, and logical pixels.
- Always reset canvas state after effects that use transforms, global alpha, filters, or blend modes.

### `src/render/particles/`

Visual particle system for the idle/equation mode. It owns transient particles, particle pooling, Particle Life forces, forge/loom field forces, merges, shockwaves, trails, glow fields, and debug overlays.

High-value files:

- `particle-system.ts`: orchestrator and owner of particle arrays, pool, matrix, callbacks, debug state.
- `particle-types.ts`: particle interfaces and effect types.
- `particle-pool.ts`: allocation control.
- `particle-physics.ts`: per-particle movement and trails.
- `particle-life.ts`: pairwise Particle Life force calculation.
- `particle-merge.ts`: generator and procedural merge logic.
- `particle-forge.ts`: crunch completion and particle-to-mass conversion.
- `forge-field-forces.ts`: forge and loom capture fields.
- `particle-renderer.ts`: batched draw pipeline.
- `particle-glow-field.ts`: high-graphics nebula-style glow field.

Risks:

- Hot path. Avoid object allocation, array recreation, and callback-heavy designs in per-frame loops.
- 1×1 motes are intentionally inert in Particle Life.
- Non-alivened particles should not participate in Particle Life forces.
- Visual particles are not the sole authority for economy.

### `src/render/forge/`

Equation Forge rendering and ring visuals.

Key files:

- `forge-renderer.ts`: public forge draw API, crunch visuals, loom auras, sacrifice flash.
- `forge-renderer-draw.ts`: private helper implementation.
- `forge-ring-renderer.ts`: five decorative ring sprites, active ring count, spin multipliers.

Risks:

- Forge state belongs to `sim/forge`; render reads state and visual time only.
- Visual ring changes should not affect crunch/crafting economy.

### `src/render/background/`

Decorative and zone-specific background effects.

Important effects:

- `background-animation.ts`: menu/idle frame-sequence background.
- `vermiculate-effect.ts`: worm-line decorative effect.
- `substrate-effect.ts`: crystalline crack effect.
- `nadir-substrate-effect.ts`: Nadir variant.
- `true-binary-horizon.ts`: preserved original True subzone Binary Horizon.
- `zenith-binary-horizon.ts`: Zenith wave/cut/collapse Binary Horizon lifecycle.
- `zenith-binary-ring-background.ts`: elite Binary Ring background.
- `nadir-cubic-grid-background.ts`: CubicGrid-style rotating lattice, exposes projection state for gameplay anchoring.

Risks:

- Many effects rely on offscreen canvases or typed arrays for performance.
- Internal helper modules marked as internals should generally be imported only by their owning effect.
- Nadir cube-point gameplay must share projection math with the background, not approximate separately.

### `src/render/rpg/`

Large RPG combat/render subsystem. Use `file_index.md` for exact file-level details before editing.

Major clusters:

- constants and types: `rpg-constants.ts`, `rpg-weapon-constants.ts`, `rpg-enemy-constants.ts`, `rpg-types.ts`, `rpg-enemy-types.ts`, `rpg-entity-types.ts`.
- factories: `rpg-factories.ts`, `rpg-factories-early.ts`, `rpg-factories-mid.ts`, `rpg-factories-late.ts`.
- enemies: enemy update/draw modules, elite update/draw modules, Aliven modules.
- player/weapons: player attack, projectiles, chain whip, sword, lasers, poison, missiles, mines, companion ships.
- combat feedback: death particles, hit effects, damage numbers, shot lines.
- fluid/field: `rpg-fluid*` and field-space modules.
- zones/terrain: zone-specific backgrounds, cave walls, Caustics topology/fish pathing, Verdure walls/plants, Horizon subzones.
- UI: RPG menu, weapons tab, upgrades/stats panels.

Risks:

- RPG code is broad. Do not read all of it for every task; choose a cluster first.
- Keep weapon resolver support for crafted weapons. Static catalog lookups are not enough when equipped ids may be crafted.
- Low-graphics mode should reduce visual load without changing combat state.
- Field-space changes must preserve stable safe-core readability while expanded active bounds reveal real gameplay space rather than zooming.

### `src/ui/`

DOM panels, tabs, settings, upgrade views, resources, achievements, RPG menu and weapon crafting UI.

Risks:

- UI should dispatch typed actions rather than directly mutating arbitrary game state.
- Important actions must remain mobile-tappable and not hover-only.
- If adding settings, update defaults, persistence, and UI display together.

### `src/styles/`

CSS is split by base/canvas/panels/tabs/components/responsive/idle overlay. Read `src/styles/canvas.css` for idle and RPG canvas/container sizing.

Risks:

- Canvas CSS can change gameplay perception through scaling, not just presentation.
- RPG canvas host expansion is intentionally live world area, not zoom-in behavior.

### `src/settings/`

Settings state and save/load. Read before adding persisted settings, save fields, migration behavior, or reset semantics.

Risks:

- Browser and Electron saves use different localStorage profiles.
- Save migrations must default old data safely.
- Do not silently destroy user progression.

### `electron/`, scripts, and public assets

- `electron/main.cjs`: hardened desktop launcher, custom `equatoria://app/` protocol, CSP behavior, separate profile/cache.
- `scripts/copy-assets.mjs`: copies runtime asset directories into `dist/ASSETS` after builds.
- Batch scripts provide Windows-friendly launch/build workflows.
- `public/assets/` and `ASSETS/` contain sprites, animations, sounds, icons, and runtime media.

Risks:

- Asset path changes can break GitHub Pages, Electron, or desktop mode differently.
- Avoid relying on external network fonts/assets for store readiness.

## Current high-value architecture invariants

1. Idle/equation canvas logical space is 320 × 640.
2. RPG safe core is 360 × 640, with expanded active/visible bounds for larger hosts.
3. Simulation state is authoritative; render state is transient unless explicitly persisted.
4. Tier identity and order must remain canonical and data-driven.
5. Crafted weapon ids must resolve through the dynamic resolver, not only static maps.
6. Particle, RPG, background, and fluid hot paths should avoid per-frame allocation.
7. Mobile-first usability and desktop support must both remain valid.
8. Build #206 is the latest verified build note when this file was created.

## When this map is stale

Update this file when:

- a new subsystem or major file is added;
- files are split, merged, or moved;
- validation commands change;
- a major architectural invariant changes;
- new agent workflow rules are added.
