# Particle System Refactor Plan

## Overview

The particle system (`src/render/particles/particle-system.ts`) was a **1112-line monolithic file** responsible for particle lifecycle, physics simulation, two merge systems, forge crunch integration, shockwave management, trail capture, and rendering. This refactor splits it into focused, single-responsibility modules and applies targeted performance optimizations.

## Files Created

### 1. `particle-types.ts` — Type Definitions
All shared interfaces and type aliases extracted to a single file, eliminating circular import risks between physics, merge, rendering, and orchestration modules.

- `EquatoriaParticle` — core particle interface (now uses ring-buffer trails)
- `ActiveMerge`, `ProceduralMerge` — merge tracking types
- `Shockwave` — visual shockwave effect type
- `ParticleRenderOptions` — glow/trail toggle flags

### 2. `particle-pool.ts` — Object Pool & Lifecycle
Particle creation, initialisation, and recycling logic.

- `ParticlePool` class — acquire/release with internal free list
- `initParticle()` — sets all particle fields on spawn
- Pre-computed `TIER_INDEX_MAP` replaces per-init `TIERS.findIndex()` calls

### 3. `particle-physics.ts` — Physics Engine
Per-particle physics update, edge forces, and trail management.

- `updateParticlePhysics()` — gravity, veer, velocity clamping, bounce
- `applyEdgeRepulsion()` — boundary push forces
- `updateTrails()` / `clearTrails()` — ring-buffer trail management
- `getTrailPosition()` — zero-allocation trail position reading

### 4. `particle-merge.ts` — Merge Systems
Traditional merge at generators and procedural seek-merge anywhere.

- `attemptMerge()` — detects same-tier/size clusters near generators
- `processActiveMerges()` — advances merge animations, completes merges
- `enforceParticleLimit()` — auto-merges excess small particles
- `attemptProceduralMerge()` — triggers seek-and-combine for 100+ same particles
- `updateProceduralMerges()` — ramping centroid seek with timeout
- Module-level reusable `Map` for grouping (cleared, not recreated)
- Fisher-Yates partial shuffle replaces O(n²) splice-based selection

### 5. `particle-forge.ts` — Forge Crunch Integration
Bridge between authoritative forge-logic (sim layer) and visual particles.

- `checkAndStartForgeCrunch()` — identifies forge-eligible particles
- `completeForgeCrunch()` — converts particles to higher tier/size

### 6. `particle-shockwave.ts` — Shockwave Effects
Expanding shockwave update and particle impulse application.

- `updateShockwaves()` — progress, fade, spatial-grid force application
- `getShockwaveScaleForSize()` — size-dependent shockwave scaling

### 7. `particle-renderer.ts` — Batched Draw Calls
All canvas rendering for particles, trails, and shockwaves.

- `drawParticles()` — unified render function
- Numeric batch keys `(tierIndex << 8 | sizeIndex)` instead of string concatenation
- `Float64Array` position buffers that grow-only (no per-frame allocation)
- Ring-buffer trail reading with zero-allocation `_trailPos` out-parameter

### 8. `spatial-grid.ts` — Spatial Hash Grid
Shared spatial acceleration structure for collision queries.

- Numeric keys via `gridKey()` (bit-interleaved cell coordinates)
- `forEachNearby()` callback pattern eliminates result array allocation
- Used by shockwave system (and available for future uses)

### 9. `particle-system.ts` — Slim Orchestrator (rewritten)
Reduced from 1112 to ~200 lines. Only orchestrates the per-frame pipeline:

1. Spawner/forge rotation
2. Physics step (conditional frame skip at high counts)
3. Trail capture
4. Euler fluid dynamics
5. Merge detection and processing
6. Procedural merge updates
7. Forge crunch check/complete
8. Shockwave updates

## Performance Optimizations

### Allocation Reduction
| Before | After | Impact |
|--------|-------|--------|
| `new Map<string, ...>()` every 10–15 frames in merge detection | Module-level `Map` cleared and reused | Eliminates GC pressure from merge grouping |
| `Array.splice()` in loop for random selection (O(n·k)) | Fisher-Yates partial shuffle (O(k)) | 5000→100 array ops per merge |
| `p.trail.push()` + `p.trail.shift()` every 2 frames | `Float64Array` ring buffer with head/count | Zero allocation, O(1) insert |
| `{x, y}` trail objects allocated per capture | Typed array positions read via out-parameter | No per-frame object creation |
| `queryNearby()` returns new array per call | `forEachNearby()` callback pattern | No intermediate array allocation |
| String keys `"${cx},${cy}"` in spatial grid | Numeric keys via bit-interleaving | No string allocation in hot path |
| `batches.get("${color}|${glow}|${size}")` per particle | Numeric key `(tierIndex << 8 \| sizeIndex)` | No string concatenation in draw loop |
| `queryEulerNearby()` allocates result array per particle | Inlined neighbour iteration in euler-fluid.ts | Eliminates n result arrays per Euler pass |

### Loop Optimization
- Replaced `for-of` with indexed `for` loops in all hot paths
- In-place array compaction (`particles[wp++] = p; particles.length = wp`) instead of `filter()` + new array allocation
- Pre-computed `TIER_INDEX_MAP` replaces `TIERS.findIndex()` on every particle spawn
- Pre-computed `INV_CELL_SIZE` and `R2` constants in euler-fluid.ts

### Rendering Optimization
- Draw batch positions stored in grow-only `Float64Array` buffers
- `Math.ceil(batch.size)` computed once per batch instead of per particle
- Batch map retained across frames (only counts reset)

## Architecture Diagram

```
ParticleSystem (orchestrator)
├── ParticlePool          — object lifecycle
├── updateParticlePhysics — per-particle forces
├── applyEdgeRepulsion    — boundary forces
├── updateTrails          — ring-buffer trail capture
├── applyEulerFluidForces — inter-particle tier repulsion
├── attemptMerge          — generator merge detection
├── processActiveMerges   — merge completion
├── enforceParticleLimit  — auto-merge overflow
├── attemptProceduralMerge — anywhere merge detection
├── updateProceduralMerges — seek-merge updates
├── checkAndStartForgeCrunch — forge integration
├── completeForgeCrunch   — forge output
├── updateShockwaves      — shockwave physics
└── drawParticles         — batched canvas rendering
```

---

## Phase 2: Additional Monolithic File Splits

### equation-logic.ts (329 → 3 files)

The equation logic file contained three distinct concerns: tap value computation, view model/HTML building, and equation evaluation. Split into:

| File | Purpose | Key exports |
|------|---------|-------------|
| `equation-tap.ts` | Tap value computation | `segmentTapValue()`, `computeTapGains()` |
| `equation-view.ts` | View model + HTML builder | `buildEquationView()`, `buildStructuredEquationHtml()`, `EquationTermView` |
| `equation-eval.ts` | Equation output evaluator | `computeEquationOutput()` |

The original `equation-logic.ts` is now a re-export barrel for backward compatibility. No barrel imports (`index.ts`) or consumer code needed changes.

### game-app.ts (458 → 4 files)

The main application file handled bootstrap, action dispatch, game loop, rendering, and UI management. Split into:

| File | Purpose | Key exports |
|------|---------|-------------|
| `app-types.ts` | Shared interfaces | `AppState`, `UIPanels` |
| `app-actions.ts` | Action dispatch + tab switching | `handleAction()`, `setActiveTab()`, `updateVisiblePanels()` |
| `app-game-loop.ts` | Frame-by-frame game loop | `createGameLoop()`, `GameLoopContext` |
| `game-app.ts` | Slim bootstrap | `startApp()` |

The game loop is created via a factory function that receives all dependencies through `GameLoopContext`, keeping the loop itself pure of startup concerns. Save/reset actions use local closures in game-app.ts since they need `deleteSave()` and `createGameState()`.

### styles.css (709 → 6 files)

The monolithic CSS was split by concern into focused stylesheets:

| File | Purpose | Approx lines |
|------|---------|-------------|
| `base.css` | Reset, CSS variables, font-face, app layout | 65 |
| `canvas.css` | Background canvases, game canvas container | 55 |
| `panels.css` | Panel overlay, upgrades, resources, settings | 230 |
| `tabs.css` | Bottom tab bar | 55 |
| `components.css` | Loading, looms, equation display, achievements | 265 |
| `responsive.css` | Media queries for landscape/desktop | 20 |

The original `styles.css` now contains only `@import` directives in the correct cascade order. Vite handles CSS `@import` natively during bundling.

---

## Phase 3: rpg-render.ts (7,328 → 4 files)

The RPG rendering file was the largest remaining monolithic file at 7,328 lines. It contained constants, type/interface definitions, factory functions, and the main `createRpgRender` rendering closure. The module-level declarations have been split by concern:

| File | Purpose | Lines |
|------|---------|-------|
| `rpg-constants.ts` | All numeric/string constants for every RPG entity, weapon, and fluid | 551 |
| `rpg-types.ts` | All interfaces and type aliases (enemy, projectile, weapon-state, visual-effect) | 496 |
| `rpg-factories.ts` | `make*` factory functions for every RPG entity type | 305 |
| `rpg-render.ts` | `RpgRender` interface + `createRpgRender()` closure (all update/draw logic) | 6,183 |

**Why `createRpgRender` was not split further:** every update/draw function inside the closure shares mutable local state (player mote, enemy arrays, canvas context, fluid instance, dimension variables, etc.) via JavaScript closure. Extracting individual enemy systems would require threading a large context object through all call sites — a change with significant regression risk and no performance benefit. The 6,183-line closure is self-contained and coherent; the three extracted files give future agents a clean, navigable entry point to constants and types without touching the rendering logic.

**No logic changes.** This refactor is a purely mechanical extraction: `tsc --noEmit` passes with zero errors before and after.

---

## Phase 4: loom-panel.ts (713 → 3 files)

The combined Upgrades panel contained three distinct sub-tab concerns in a single factory function. Split into focused sub-pane modules:

| File | Purpose | Lines |
|------|---------|-------|
| `loom-upgrades-pane.ts` | "Loom" sub-tab: passive Loom cards + special upgrade cards | 263 |
| `aliven-pane.ts` | "Aliven" sub-tab: aliven rows + interactive NxN interaction-matrix | 428 |
| `loom-panel.ts` | Outer shell: sub-tab bar + switching + sub-pane wiring | 106 |

Each sub-pane exports a factory: `create*Pane(dispatch, ...) → { element, update(state, fmt) }`. The outer `loom-panel.ts` calls `update()` on the active sub-pane only (preserving the existing lazy-update optimisation). The `updateCellDisplay` helper and matrix drag constants (`DRAG_THRESHOLD_PX`, `DRAG_PX_PER_STEP`) moved to `aliven-pane.ts`; the `renderLoomIconCanvas` helper moved to `loom-upgrades-pane.ts`.

**No logic changes.** `tsc --noEmit` passes with zero errors before and after.
