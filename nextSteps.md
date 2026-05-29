# Next Steps — Equatoria Idle

Current build: **#191**

---

## Build #191 — RPG desktop zoom/cropping fix

### Problem fixed

On desktop, the RPG view was too zoomed in vertically. The 360×640 safe core
was cropped at the top and bottom when the render host was shorter than 640 CSS px
(e.g. a typical 480×415 host showed `scale: 1.0`, cutting off the safe core).

### Root cause

`doResize()` computed scale as:
```ts
const safePx = Math.min(containerW, containerH, RPG_LOGICAL_WIDTH);
rpgSafeScale = safePx / RPG_LOGICAL_WIDTH;
```
This only fit the 360 px **width**, not the 640 px **height**.

### Fix

Scale is now derived from fitting the full safe core rectangle:
```ts
rpgSafeScale = Math.min(containerW / RPG_LOGICAL_WIDTH, containerH / RPG_LOGICAL_HEIGHT, 1);
```

A pure `computeRpgSafeCoreScale(w, h, sw, sh)` helper was added to
`rpgFieldSpace.ts` and used in `doResize()` so the formula cannot drift.

### Invariants

- The full 360×640 safe core is always fully visible.
- Scale = `min(containerW/360, containerH/640, 1)`.
- Widening the host beyond 360 px (at the correct scale) reveals more horizontal world.
- Shortening the host below 640 px reduces scale so the safe core remains visible.
- `visibleBounds`, `activeBounds`, `spawnBounds`, and `paddedEffectBounds` are
  unchanged in concept; they still fill the entire canvas in world coords.

### Tests updated

- `rpg-viewport.test.ts`: formula updated; two tests corrected; four new
  regression cases added (reference, wide+tall, wide-too-short 480×415,
  narrow phone, very short host).
- `rpgFieldSpace.test.ts`: `stableScale` helper updated; one new scale test
  added; three new safe-core-fit regression tests added.

---

## Build #190 — Caustics fish terrain-aware pathfinding

### Status

Caustics fish enemies now navigate around Caustics topology instead of pressing
straight into terrain. They use A*-guided path steering layered on top of the
existing Boids schooling system, with multi-angle terrain probes and stuck
detection/recovery.

### Approach: Hybrid steering + A* path following

Fish pathfinding uses a **hybrid** approach:

1. **A* path steering (primary seek force)** — when a nav grid is available
   (Caustics and any zone with topographic terrain), `computePathSteeredDirection`
   is called each frame to follow the pre-computed A* path to the player.  The A*
   grid is built once when the wave starts (existing infrastructure, no new cost).
   Repathing is throttled to `DEFAULT_REPATH_MS` (600 ms) with a ±20% stagger so
   all fish don't repath on the same frame.

2. **Multi-angle terrain probe fan (local avoidance)** — when the forward probe
   hits terrain, six candidate escape angles (±45°, ±90°, ±135° from current
   heading) are tried in preference order biased toward the player direction.  The
   first clear direction is chosen rather than defaulting to a fixed perpendicular.

3. **Stuck detection and recovery** — if a fish's speed drops below
   `FISH_STUCK_SPEED_THRESHOLD` (0.25 px/frame) for more than
   `FISH_STUCK_THRESHOLD_MS` (700 ms), a stuck event fires:
   - The fish's path state is forced to repath immediately.
   - `stuckRecoveryMs` is set to `FISH_STUCK_RECOVERY_MS` (900 ms).
   - During recovery the terrain-avoidance weight is boosted ×2.5.
   - A small random perpendicular nudge prevents all fish in a group from
     choosing the same escape vector.

4. **Smooth fish-like motion** — the existing clamped turn rate, sinusoidal wander,
   tail-kick thrust, and velocity damping are preserved unchanged.

### Changes in this build

- **`src/render/rpg/rpg-procedural-types.ts`** — Added `pathState: RpgPathState`,
  `stuckMs: number`, `stuckRecoveryMs: number` to `BaseFishEnemy`.  All 8 fish
  types inherit these automatically.

- **`src/render/rpg/rpg-procedural-factories.ts`** — `makeFishBase` now initialises
  `pathState: createRpgPathState(), stuckMs: 0, stuckRecoveryMs: 0`.

- **`src/render/rpg/rpg-procedural-constants.ts`** — `FISH_SCHOOL_PROBE_DIST`
  increased 20 → 28 for earlier avoidance; three new stuck-detection constants
  added: `FISH_STUCK_SPEED_THRESHOLD`, `FISH_STUCK_THRESHOLD_MS`,
  `FISH_STUCK_RECOVERY_MS`.

- **`src/render/rpg/rpg-procedural-fish-update.ts`** — `schoolSwimStep` rewritten:
  - A*-guided seek via `computePathSteeredDirection` when terrain + nav grid present.
  - Multi-angle fan probe with player-biased escape direction selection.
  - Stuck detection and recovery with boosted avoidance + random nudge.
  - `_tryEscape` helper to short-circuit probe fan evaluation.
  - `SwimEntity` type updated to include the three new pathfinding fields.

- **`src/ui/panels/rpg-enemies-tab-icons.ts`** — All 8 inline fish icon stubs
  updated to include `pathState`, `stuckMs`, `stuckRecoveryMs`.

### Known limitations

- **Debug visualisation not wired** — `drawRpgPathfindingDebug` in
  `rpg-render-draw.ts` currently passes `[]` for enemy path states.  Fish path
  state arrays would need to be collected and passed through draw context to show
  fish paths in the debug overlay.  Deferred to a follow-up build.

- **No per-type turn-rate difference** — All 8 fish species use the same
  `FISH_SCHOOL_MAX_TURN_RATE`.  Smaller fish could in principle use a higher rate
  and larger fish a lower one, but the current constants are shared across species.
  The Boids `isMini` flag already adjusts separation radius.

- **Nav grid availability** — On zones without a nav grid (non-topographic zones),
  fish fall back gracefully to direct seek.  This is correct since non-Caustics
  zones generally lack complex topology.

### Follow-up recommendations

1. **Wire fish path states into the debug overlay** so that per-fish A* paths,
   lookahead probes, and stuck state are visible during playtesting.

2. **Per-species turn rates** — Differentiate `FISH_SCHOOL_MAX_TURN_RATE` by
   species size (e.g., diamond fish turns wider than sand fish).

3. **Monitor narrow-passage edge cases** — Large fish approaching single-cell
   passages in dense topology may still get temporarily stuck; further tuning of
   the avoidance weight or a larger probe distance for large fish could help.

4. **A* soft obstacles for fish spawn zones** — Caustics fish spawns at formation
   edges could optionally register as soft obstacles so fish are nudged away from
   walls at spawn rather than waiting for a stuck event.

---



### Status

All field-space adoption tasks from builds #185–#188 are now complete, including
the last remaining item: topographic lighting now covers the full visible world.

### Changes in this build

- **`renderTopographyLighting` now accepts a world-space bounds rect.**
  Signature changed from `(ctx, state, canvasW, canvasH)` to
  `(ctx, state, bounds: { left, top, width, height })`.  The cache is built at
  `bounds.width × bounds.height` and placed at world origin `(bounds.left, bounds.top)`.
  The cache is drawn with `ctx.drawImage(cache.canvas, cache.originX, cache.originY, ...)`.

- **`buildTopographyLightCache` is world-origin-aware.**
  Accepts two new optional parameters `originX = 0, originY = 0`.  Height-grid
  sampling now uses world coordinates:
  `wx = originX + ix * LIGHT_GRID_CELL_SIZE_PX`, `wy = originY + iy * LIGHT_GRID_CELL_SIZE_PX`.
  The baked cache stores `originX` and `originY`.

- **`ensureTopographyLightCache` invalidates on origin changes.**
  Added `originX` and `originY` to invalidation checks alongside width, height,
  palette, growth, config, and shadow mode.

- **`TopographyLightCache` interface updated.**
  Added `readonly originX: number` and `readonly originY: number` fields to the
  public type in `topographic-lighting-types.ts`.

- **Call site updated in `rpg-render-draw.ts`.**
  `renderTopographyLighting(canvas2d, terrainState, widthPx, heightPx)` replaced
  with `renderTopographyLighting(canvas2d, terrainState, fs.visibleBounds)`.
  The lighting overlay now covers the same world area as all other visible-bounds
  effects (empower particles, caustics, euhedral hex floor, etc.).

### Field-space adoption status (post-build #189)

| Feature | Status |
|---|---|
| Player movement clamps to `activeBounds` | ✅ Complete |
| Enemy context uses `RpgFieldSpace` / documented compat wrapper | ✅ Complete |
| Empower particles cover `visibleBounds` | ✅ Complete |
| Caustics floor effects cover `visibleBounds` | ✅ Complete |
| Spawn-candidate debug overlay | ✅ Complete |
| Topographic lighting covers `visibleBounds` | ✅ Complete |

### Intentional safe-core uses (unchanged)

- `drawBottomSafeZone` / `drawBossStageDirector` / `drawWaveClearBanner` — boss
  composition and HUD are centred on the stable 360×640 core for readability.

### Remaining work

None. All RPG field-space adoption items from the build #185 audit are resolved.

---

## Build #188 — RPG responsive field-space issues (player bounds, particles, caustics, spawn overlay)

### Status

All six field-space adoption tasks from the build #187 audit are now resolved.

### Changes in this build

- **Player movement clamps to `fieldSpace.activeBounds`.**
  `PlayerMovementCtx` now has a `getFieldSpace(): RpgFieldSpace` method.
  `updatePlayerMovement()` replaces the old `dim.w / dim.h` safe-core clamp with
  `activeBounds.left/right/top/bottom`, so the player can move into the full
  visible world without being pushed back by each frame's movement update.
  `getFieldSpace: () => rpgFieldSpace` is wired in `movementCtx` in `rpg-render.ts`.

- **Enemy context source of truth is `RpgFieldSpace`.**
  `RpgEnemyCtx` gains `getFieldSpace(): RpgFieldSpace`.  The misleading JSDoc on
  `dim` (implied it tracked the current canvas) is corrected — `dim` is the fixed
  safe-core `{ w: 360, h: 640 }` and is never updated.  `clampEnemyToBounds` in
  `rpg-render.ts` now reads `rpgFieldSpace.activeBounds` directly instead of
  `viewport`.  `viewport` is retained as a compatibility alias (it already equals
  `activeBounds` since both equal `visibleBounds` under current policy).
  `getFieldSpace: () => rpgFieldSpace` is wired in both `movementCtx` and `enemyCtx`.

- **Empower particles cover the full visible world.**
  `drawEmpowerParticles` signature changed from `(ctx, widthPx, heightPx)` to
  `(ctx, bounds: { left, top, width, height })`.  The offscreen glow canvas is now
  sized to `bounds.width/2 × bounds.height/2`.  The glow draw pass applies
  `translate(-bounds.left, -bounds.top)` so world coordinates map into the glow
  canvas.  The composite is drawn back at `(bounds.left, bounds.top, bounds.width,
  bounds.height)` in world space.  Call site in `rpg-render-draw.ts` passes
  `fieldSpace.visibleBounds`.

- **Caustics floor effects cover the full visible world (Option A).**
  `drawCausticsFloorEffects` now accepts `worldOffX = 0, worldOffY = 0` params.
  These are forwarded to `_drawCausticsHeightAwarePass` and
  `_drawCausticsElevationBrightness`.  `_traceRidgePolygon` accepts `originX = 0,
  originY = 0` and subtracts them from ridge point coordinates before scaling.
  `_drawCausticsElevationBrightness` subtracts the offset from ridge stroke coords.
  The call site in `rpg-render-draw.ts` now wraps the call with
  `canvas2d.save() / translate(vwX, vwY) / restore()` and passes `(vwW, vwH)` as
  dimensions plus `vwX, vwY` as the world offset — ridge geometry aligns correctly
  with the translated frame.

- **Spawn-candidate debug overlay added.**
  `rpg-enemy-spawn.ts` maintains a 64-entry ring buffer (`_spawnDebugLog`) of
  accepted and fallback spawn positions.  Populated only when `ctx.getIsDevMode()`
  returns true (optional field on `EnemySpawnCtx` and `WaveManagerCtx`).
  `_drawFieldSpaceOverlay` in `rpg-render-draw.ts` reads `getSpawnDebugLog()` and
  draws coloured dots: green for accepted, orange for verdure fallback.  A small
  legend is rendered near the top-left of `spawnBounds`.  No per-frame work outside
  dev mode.

### Field-space adoption status (post-build #188)

| Feature | Status |
|---|---|
| Player movement clamps to `activeBounds` | ✅ Complete |
| Enemy context uses `RpgFieldSpace` / documented compat wrapper | ✅ Complete |
| Empower particles cover `visibleBounds` | ✅ Complete |
| Caustics floor effects cover `visibleBounds` (Option A) | ✅ Complete |
| Spawn-candidate debug overlay | ✅ Complete |

### Intentional safe-core uses (still unchanged)

- `drawBottomSafeZone` / `drawBossStageDirector` / `drawWaveClearBanner` — boss
  composition and HUD are centred on the stable 360×640 core for readability.
- `renderTopographyLighting` — terrain topology only exists within
  `[0, widthPx] × [0, heightPx]`; expanding requires regenerating the height map
  for the full visible area.

### Remaining work

- **`renderTopographyLighting`**: Expand cached lighting overlay to cover
  `paddedEffectBounds` — requires generating terrain topology for extended area.
  *(Resolved in build #189.)*

---

## Build #187 — RPG responsive field-space migration (continued)

### Status

`RpgFieldSpace` in `src/render/rpg/rpgFieldSpace.ts` is the single authoritative
source for RPG sizing, bounds, coordinate conversion, and spawn areas.  All
high-priority adoption gaps from the build #185 audit have been closed.

### Changes in this build

- **Floor effects now cover the full visible world.**
  `drawImpetusFloorEffects`, `drawVerdureFloorEffects`, and `drawVerdureEdgeRocks`
  are wrapped with `translate(vwX, vwY)` and receive `(vwW, vwH)` so they fill the
  entire visible canvas rather than only the safe core.

- **Persistent topographic sunlight fills the visible world.**
  `renderPersistentTopographySunlight` is wrapped with `translate(vwX, vwY)` and
  receives `(vwW, vwH)`.

- **Terrain light emitter culling uses `paddedEffectBounds`.**
  `_collectTerrainLightEmitters` now calls `ctx.getFieldSpace().paddedEffectBounds`
  instead of accepting `canvasW/canvasH` parameters, so Euhedral light emitters
  outside the old safe-core boundary are no longer incorrectly culled.

- **Eigenstein beam length uses visible world diagonal.**
  `drawEigensteinBeams` now receives `(vwW, vwH)` instead of `(widthPx, heightPx)`,
  so beams extend across the full visible canvas.

- **Player mote clamping uses `fieldSpace.activeBounds`.**
  After resize, the player mote is clamped to the active world bounds rather than
  to the fixed safe-core dimensions.

- **Dev aliven spawn uses `fieldSpace.spawnBounds`.**
  `devSpawnAliven` now spawns on the edge ring of `spawnBounds` rather than the
  edge ring of the safe core.

- **Nadir cubic grid update uses visible world dimensions.**
  `nadirCubicGrid.update` now receives `(rpgWorldViewW, rpgWorldViewH)` so the
  lattice fills the full visible canvas.

### Intentional safe-core uses (unchanged in build #187, resolved in #188)

These were still scoped to the safe core in build #187:

- `drawCausticsFloorEffects` — migrated in build #188.
- `drawEmpowerParticles` — migrated in build #188.



## Build #178 — Height-aware caustics (seafloor depth parallax)

### What was implemented

- **`seafloor-terrain.ts`**: Added `sampleSeafloorElevation(x, y, data)` — returns a normalised
  elevation (0–1) at any world position by measuring distance from each ridge's
  centerline polyline and normalising against the ridge's half-width.  Backed by
  private `_distToPolyline` / `_distToSegmentPt` helpers.  No allocations; callable
  per-pixel for diagnostics.

- **`caustics-overlay.ts`**:
  - Added tuning constants:
    - `CAUSTIC_HEIGHT_SHIFT_PX = 2.0` — main-canvas pixels of parallax per unit
      normalised ridge elevation.
    - `CAUSTIC_ELEVATION_BRIGHTNESS_PER_LAYER = 0.08` — screen-blend alpha
      increment per unit elevation (maps `1 + e × 0.08` brightness formula).
    - `CAUSTIC_MAX_ELEVATION_BRIGHTNESS = 1.35` — brightness multiplier cap.
    - `_CAUSTIC_LIGHT_DIR_X = 0.25, _CAUSTIC_LIGHT_DIR_Y = -1.0` — implied light
      direction for parallax offset.
  - `drawCausticsFloorEffects` now accepts an optional `seafloorData?: SeafloorTerrainData`
    parameter.
  - Added `_drawCausticsHeightAwarePass`: draws each ridge's footprint area into the
    light buffer using the caustic pattern with a parallax-shifted transform offset.
    Each ridge receives a shift of `normElev × CAUSTIC_HEIGHT_SHIFT_PX × bufScale`
    in the `(_CAUSTIC_LIGHT_DIR_X, _CAUSTIC_LIGHT_DIR_Y)` direction.  Clipping uses
    `_traceRidgePolygon`.  Reuses module-level `_matHeightAware` — zero new allocations.
  - Added `_drawCausticsElevationBrightness`: screen-blend aqua stroke (`#58d8e4`)
    along each ridge crest, alpha = `clamp(normElev × 0.08, 0, 0.35)`.
  - Added `_traceRidgePolygon`: builds a filled polygon matching a ridge's body stroke
    by walking the centerline twice (forward on the left perpendicular, backward on
    the right), using inline averaged tangent computation — no array allocations.
  - Added module-level `_matHeightAware` DOMMatrix (reused per ridge per frame).

- **`rpg-render-draw.ts`**:
  - `drawCausticsFloorEffects` call now passes `terrainState?.seafloor` so the
    height-aware passes activate whenever seafloor ridge terrain is present.
  - Dev-mode diagnostics block extended with:
    - `heightAwareCaustics: on/off`
    - `causticHeightShiftPx: 2.0`
    - `ridgeElevRange: 0.0–1.0 (N ridges)`
    - `maxRidgeWidth: Xpx`

- **`buildInfo.ts`**: bumped 177 → 178.

### Elevation lookup location

`sampleSeafloorElevation()` in `src/render/rpg/terrain/seafloor-terrain.ts`.
The Caustics zone uses `terrainKind === 'seafloorRidges'`, and the ridge data lives
in `TopographicTerrainState.seafloor` (type `SeafloorTerrainData`).  Ridge elevation
is normalised by the widest ridge in the current wave's dataset.

### Where the caustic sampling offset is applied

`_drawCausticsHeightAwarePass()` in `src/render/rpg/terrain/caustics-overlay.ts`.
The offset is applied per ridge by shifting `_matHeightAware.e` / `.f` (the pattern
translation) before calling `_patternA.setTransform()` and then `fillRect`.  The ridge
area is isolated by clipping to the polygon produced by `_traceRidgePolygon`.

### Constants that control the effect

| Constant | Location | Purpose |
|---|---|---|
| `CAUSTIC_HEIGHT_SHIFT_PX` | caustics-overlay.ts | Parallax offset magnitude (px, main-canvas) |
| `CAUSTIC_ELEVATION_BRIGHTNESS_PER_LAYER` | caustics-overlay.ts | Brightness alpha increment per elevation unit |
| `CAUSTIC_MAX_ELEVATION_BRIGHTNESS` | caustics-overlay.ts | Maximum brightness multiplier cap |
| `_CAUSTIC_LIGHT_DIR_X / _Y` | caustics-overlay.ts | Implied light direction for offset vector |

### Slope-aware lighting

Intentionally deferred.  The ridge polyline data could support a simple
`(hL − hR, hU − hD)` slope estimate via `sampleSeafloorElevation` calls at
neighbouring positions, but the effect would be subtle given the low ridge
elevation contrast.  Implement if playtesting reveals the brightness pass looks
too uniform across steep vs. flat ridge sections.

### Remaining visual tuning notes

- `CAUSTIC_HEIGHT_SHIFT_PX = 2.0` is conservatively small.  Raise to 3–4 for a
  more pronounced parallax without visible detachment.
- `CAUSTIC_ELEVATION_BRIGHTNESS_PER_LAYER = 0.08` produces a very subtle highlight.
  0.12–0.18 is safe if the current result feels too faint after playtesting.
- The height-aware pass alpha is `(0.32 or 0.22) × normElev`; the `0.32` multiplier
  can be raised to 0.40–0.45 if ridges need more visual weight.
- Slope-aware caustic brightness (per-ridge surface normal dot light-direction) is
  the natural next step if the ridge depth still feels flat after the above tuning.

---

## Build #177 — Verdure polyomino elite enemies

### What was implemented

- Added `src/render/rpg/polyomino-enemy-types.ts` — `PolyominoCell`, `PolyominoEnemy`, `FissilePolyominoEnemy`, `RefractorPolyominoEnemy` interfaces; `PolyominoEnemyKind` union type.
- Added `src/render/rpg/polyomino-enemy-factories.ts` — `makePolyominoEnemy`, `makeFissilePolyominoEnemy`, `makeRefractorPolyominoEnemy` factory functions; `buildPolyominoSeedCells` (random growing BFS); `advancePolyominoStep` (block-at-a-time expansion); shared `_buildBaseStats` formula.
- Added `src/render/rpg/polyomino-enemy-draw.ts` — `drawPolyominoEnemies`, `drawFissilePolyominoEnemies`, `drawRefractorPolyominoEnemies`; per-cell fill/stroke with glow; HP bar overlay; refractor laser beam rendering.
- Added `src/render/rpg/polyomino-enemy-update.ts` — update functions for all three variants; fissile split-on-contact logic; refractor periodic laser fire; cardinal-step drift movement.
- Wired all three enemy types into `rpg-render.ts`, `rpg-render-draw.ts`, `rpg-render-update.ts`, and `rpg-wave-manager.ts` for full game-loop integration.
- Modified `src/data/rpg/wave-definitions.ts`: every 10th wave in the Verdure zone (`waveNumber % 10 === 0`) spawns a polyomino elite squad instead of regular enemies.
- Added bestiary entries for all three polyomino types to `src/ui/panels/rpg-enemies-catalog-entries.ts`.
- Bumped `src/buildInfo.ts` from 175 → 176.

---

## Build #175 — Nadir cube-point/cubic-grid projection lockstep fix

### What was implemented

- Added `src/render/background/nadir-cube-projection.ts` as the shared Nadir cube projection source of truth (constants, rotation, projection state, world→game projection, game→offscreen conversion helper).
- Refactored `src/render/background/nadir-cubic-grid-background.ts` to use the shared projection helpers and to project points in game-space first, then convert to offscreen pixels (`sx/sy` → `px/py`) so background and gameplay now use matching coordinates in both normal and low graphics modes.
- Refactored `src/render/rpg/nadir-cube-point-types.ts` to forward `projectNadirAnchor()` through the same shared world→game projection function used by the background.
- Changed frame order wiring so Nadir cubic-grid projection is now advanced in `runRpgUpdate()` via `updateAndGetNadirCubeProjectionState(nowMs)` before cube-point enemy spawn/update logic runs; draw now consumes already-updated background state instead of advancing it.
- Removed active-enemy zero-angle fallback projection usage in `rpg-render-update.ts`; encounter spawn/update now waits for real shared projection state.
- Added a dev-only anchor verification overlay in `nadir-cube-point-draw.ts` that draws tiny projected anchor crosses and a short offset line if an enemy center diverges by more than 1 px.
- Bumped `src/buildInfo.ts` from 174 → 175.

### Root cause and fix summary

- The mismatch came from two independent projection paths: gameplay projected directly to game-space, but the cubic-grid background used a separate offscreen projection formula with non-uniform scaling behavior on Y, then upscaled.
- A second mismatch came from frame timing: gameplay read projection state before draw advanced the cubic-grid state, creating one-frame phase offset.
- The fix unifies projection math in one module and advances the shared projection state during update before gameplay and rendering consume it.

### Remaining limitations / notes

- Dev anchor verification markers are only drawn when dev mode is enabled.
- If Nadir projection state is unavailable for a tick, cube-point spawn/update is skipped for that tick instead of using a fabricated zero-angle fallback.

---

## Build #174 — Nadir cube-point encounter

### What was implemented

- Added `src/render/rpg/nadir-cube-point-types.ts`, `nadir-cube-point-update.ts`, and `nadir-cube-point-draw.ts` for the new Horizon → Nadir awakened lattice-node encounter.
- Extended `src/render/background/nadir-cubic-grid-background.ts` with `getProjectionState()` so the encounter uses the same live cube rotation/projection math as the background effect.
- Integrated the encounter into targeting, damage routing, wave completion, draw/update contexts, and death/restart cleanup so every 10th Nadir wave now uses cube-point enemies and hazards instead of the old single-elite spawn.
- Bumped `src/buildInfo.ts` from 173 → 174.

### Validation

- Run `npm run typecheck && npm run build` after dependencies are installed.
- Baseline validation initially failed in this environment because `vitest` type declarations were unavailable before installing project dependencies.

---

## Build #172 — Verdure wall/plant/enemy placement coherence

### What was implemented

**`src/render/rpg/terrain/verdure-cave-walls.ts`** (modified):
- Added `VERDURE_SPAWN_MARGIN = 10` constant — the minimum inward clearance that must be preserved around wall boundaries when placing enemy spawns. 10 px covers the 4 px `RIM_WIDTH_PX` visual rim strip plus 6 px additional safety.
- Added `isVerdureSpawnRejected(state, px, py): boolean` — returns `true` if the candidate point is inside the wall **or** within `VERDURE_SPAWN_MARGIN` pixels of the boundary. Wraps the existing private `_isPointInVerdureWallWithMargin`. All spawn-validation callers should use this instead of the zero-margin `isPointInVerdureWall`.
- Added `getVerdureSafeFallbackSpawnPos(state): { x, y }` — returns the arena centre as a guaranteed walkable fallback position for use after spawn-retry exhaustion.
- Fixed `_buildEdgePoints` left/right edge pass: added `cornerExclusionPx` guard (`if (yn < 80 || yn > state.heightPx - 80) continue`) mirroring the already-present guard on the top/bottom pass. This prevents plant anchors from piling up in corner regions where both horizontal and vertical edges previously contributed simultaneously.

**`src/render/rpg/rpg-enemy-spawn.ts`** (modified):
- Replaced `import { isPointInVerdureWall }` with `import { isVerdureSpawnRejected, getVerdureSafeFallbackSpawnPos }`.
- Replaced every in-loop spawn-check `isPointInVerdureWall(wallState, spawnX, spawnY)` with `isVerdureSpawnRejected(wallState, spawnX, spawnY)` across all 15 enemy-type spawn retry loops, so that enemies are rejected from the visual rim zone (0–4 px from boundary) and a safety buffer (4–10 px from boundary).
- Added a post-loop fallback guard after each of the 15 `do { } while (attempts < 20)` loops:
  ```ts
  if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
    const safe = getVerdureSafeFallbackSpawnPos(wallState);
    spawnX = safe.x; spawnY = safe.y;
  }
  ```
  This prevents the previous behaviour where an exhausted loop would silently use its last (possibly wall-clipping) candidate position.

### Root causes addressed

| Problem | Root cause | Fix |
|---|---|---|
| Enemies spawning inside visual walls | Spawn validation used `isPointInVerdureWall` (margin = 0), allowing placement inside the 4 px visual rim strip | `isVerdureSpawnRejected` with 10 px margin |
| Enemies at wall after retry exhaustion | Exhausted loop used last-sampled invalid position | Fallback to arena centre after each loop |
| Plant/vine corner pile-up | Left/right edge anchor pass had no corner exclusion unlike top/bottom pass | Added `cornerExclusionPx` guard to left/right pass in `_buildEdgePoints` |

### Remaining known issues / cosmetic notes

- **Rim strip cosmetic gap**: The 4 px `RIM_WIDTH_PX` gradient rim strip (`verdure-cave-walls.ts`, drawn in `_drawWallRimStrip`) is rendered just inside the visual boundary and contributes to the perception that the wall extends inward. The collision boundary itself matches the `topDepths`/`bottomDepths`/`leftDepths`/`rightDepths` raw depth values; the rim is purely cosmetic. `pushPointOutsideVerdureWall` already accounts for this via the `halfSize + 2` margin applied to player/enemy push-out. The spawn system now also accounts for it via `VERDURE_SPAWN_MARGIN`. No visual change is needed unless the design intent changes.
- **Spawn debug overlay**: A `drawVerdureWallDebug` export exists in `verdure-cave-walls.ts` for visualising wall boundaries. A spawn-candidate overlay (showing accepted/rejected candidates) has not been added as part of this build; the structure for it is in place and can be wired alongside `drawVerdureWallDebug` when needed.

---

## Build #171 — Elite enemy empowerment buff + wave-start particles

### What was implemented

**`src/render/rpg/rpg-elite-buff.ts`** (new):
- `BuffableEnemy` interface: minimum stat shape (`x, y, hp, maxHp, atk, def`) satisfied structurally by every non-elite enemy type.
- `BaseStats` stored once per enemy in a `WeakMap` at spawn time; entries auto-GC when enemies are removed from arrays.
- `registerNonEliteEnemy(enemy)` — snapshots base stats on spawn.
- `applyBuffToEnemy(enemy, eliteCount)` — idempotent; always re-derives from base stats so double-application is impossible.
- `recalcAllNonEliteBuffs(arrays, eliteCount)` — batch re-apply over all non-elite arrays; preserves HP percentage across max-HP changes.
- `clearEliteBuffRegistry()` — replaces the WeakMap reference; called at wave end.
- Formula: `activeStat = Math.ceil(baseStat * (1 + eliteCount * 0.25))`. Movement speed not touched.
- Shield stats (`maxShieldHp`, `shieldHp`) buffed for SapphireEnemy and AmethystEnemy.

**`src/render/rpg/rpg-elite-empower-particles.ts`** (new):
- `spawnEmpowerParticles(eliteX, eliteY, targets[])` — spawns velocity-aligned glowing capsule particles from an elite position toward a list of non-elite positions.
- `updateEmpowerParticles(deltaMs)` — advances particle positions; despawns at 88% of travel distance.
- `clearEmpowerParticles()` — called at wave end.
- `drawEmpowerParticles(ctx, w, h)` — two-pass rendering: half-res offscreen glow canvas composited back, then crisp core pass. Velocity-aligned gradient trails (transparent tail → amber body → white head). Additive blending. `MAX_PARTICLES = 48` cap.

**`src/render/rpg/rpg-enemy-spawn.ts`** (modified):
- Added `_getNonEliteArrays`, `_collectNonElitePositions`, `_onNonEliteSpawned`, `_onEliteSpawned` helpers.
- Every non-elite `push()` in `spawnEnemyById` now calls `_onNonEliteSpawned` — registers the enemy and applies the current elite count buff immediately.
- Elite `push()` calls `_onEliteSpawned` — recalcs all alive non-elites and emits particles toward each.
- All 18 standard types + 18 procedural types wired. Boss and alivenGroups intentionally excluded.

**`src/render/rpg/rpg-wave-dead-enemies-special.ts`** (modified):
- Added `_getNonEliteArrays(ctx)` helper.
- `sweepEliteAndAlivenDefeats`: calls `recalcAllNonEliteBuffs` immediately after each `eliteEnemies.splice`, so surviving non-elites are downscaled the moment an elite dies.

**`src/render/rpg/rpg-wave-manager.ts`** (modified):
- Calls `clearEliteBuffRegistry()` + `clearEmpowerParticles()` when a wave completes (`setIsInterWave(true)`).

**`src/render/rpg/rpg-render-update.ts`** (modified):
- Calls `updateEmpowerParticles(deltaMs)` each frame after `updateProceduralEnemies`.

**`src/render/rpg/rpg-render-draw.ts`** (modified):
- Calls `drawEmpowerParticles(canvas2d, widthPx, heightPx)` after `drawEliteEnemies`, before `drawStardustEnemies`.

**`src/ui/panels/rpg-enemies-tab.ts`** (modified):
- In `buildEnemyEntry`: appends an orange italic blurb div after the description for all entries whose `id.startsWith('elite_')`.
- Text: *"While alive, this elite empowers all non-elite enemies by +25%."*
- Style: `color:#ff8c00; font-size:0.72em; font-style:italic; margin-top:4px`.

**`src/ui/panels/rpg-enemies-catalog-entries.ts`** (modified):
- Added `category: 'elite'` to all 8 elite catalog entries for consistent filtering.

**`src/buildInfo.ts`** (modified):
- `BUILD_NUMBER` incremented from 170 → 171.

### Known limitations / deferred work

- **AlivenParticleGroup** not buffed: aliven HP is distributed across individual `AlivenParticle` objects inside the group; the group-level object doesn't expose a single `hp`/`maxHp`. Buffing individual particles would require iterating them at spawn time and tracking per-particle base stats. Deferred to a future pass.
- **Buff not applied to projectile stats**: enemy projectiles (e.g. `SapphireMissile`, `RubyBolt`, `CitrineBolt`) are spawned with stats baked in at fire time. If the elite buff is active at fire time the projectile will reflect buffed `atk`, but projectiles that are already in flight when an elite dies won't be retroactively downscaled. This matches most bullet-hell conventions but is worth noting.
- **QuartzFishEnemy shield**: `QuartzFishEnemy` has `shieldHp` but the base type in `rpg-enemy-types.ts` does not expose `maxShieldHp`; only `SapphireEnemy` and `AmethystEnemy` do. The fish shield is therefore not scaled by the buff. A future pass can add `maxShieldHp` to `QuartzFishEnemy`.
- **Particle direction**: empower particles travel toward their target in a straight line. They don't follow enemy movement after spawn, so a fast-moving non-elite may have already relocated by the time the particle fades out. This is acceptable for a purely cosmetic effect.
- **Particle count at very high wave counts**: the 48-particle hard cap prevents lag but may cause visible particle drop when many elite→non-elite pairs need to be covered simultaneously (e.g. 3 elites × 20 non-elites at once). A future pass could prioritise nearest-enemy pairs or batch them across several frames.

---

## Build #169 — Impetus asteroid pathfinding, Verdure wall collision fix, corner overlap cleanup

### What was implemented

**`src/render/rpg/terrain/rpg-pathfinding.ts`** (modified):
- Added `SOFT_OBSTACLE_COST = 8` constant and `moveCost: Uint8Array` field to `RpgNavGrid`.
- `moveCost` is initialized to all-1s by `buildRpgNavigationGrid`; a value of 8 means strong
  avoidance but not a hard block — enemies can still cross in tight corridors.
- New `applyCircleSoftObstacles(navGrid, circles)` export: marks all cells within each circle's
  radius as high-cost. Safe to call once per wave; no per-frame rebuild needed.
- A* loop updated: edge cost now multiplied by `moveCost[nidx]`, so soft-obstacle cells are
  8× more expensive to traverse.
- Debug overlay extended to show soft-obstacle cells in yellow when debug mode is active.

**`src/render/rpg/terrain/impetus-overlay.ts`** (modified):
- New `getImpetusAsteroidObstacles(widthPx, heightPx)` export: maps `_ASTEROID_DATA` base
  positions to `{x, y, radiusPx}` obstacle circles (radius = `size * 2.5`). Called once when
  building the Impetus nav grid.

**`src/render/rpg/terrain/verdure-cave-walls.ts`** (modified):
- **Corner overlap fix** in `_buildEdgePoints()`: top and bottom edge anchor points are now
  suppressed within 80 px of the left/right canvas edges. Left and right edges own the corners,
  preventing dual-strip stacking in corner regions.
- New `applyVerdureWallsToNavGrid(state, navGrid)` export: iterates every nav-grid cell and
  marks cells whose centre falls inside the wall band (with `margin = halfCell + 2` inward) as
  `blocked = 1`. Uses the same `_isPointInVerdureWallWithMargin` spatial query as collision,
  so the nav grid and collision geometry are identical.
- Added `import type { RpgNavGrid }` at file top (type-only, no runtime circular dep).

**`src/render/rpg/rpg-enemy-updates.ts`** (modified):
- Added `getVerdureCaveWallState?(): VerdureCaveWallState | null` to `RpgEnemyCtx` interface.
- Imported `computeVerdureWallRepulsion` and `pushPointOutsideVerdureWall` from
  `verdure-cave-walls`.
- Added module-level scratch objects `_wallRepForce` and `_wallPushScratch` (no per-frame alloc).
- New `applyEnemyVerdureWallPushOut(entity, wallState, halfSize)` export: applies soft wall
  repulsion (velocity nudge away from boundary) followed by a hard snap-out fail-safe, mirroring
  the player-movement wall-handling in `rpg-player-movement.ts`.

**`src/render/rpg/rpg-render-update.ts`** (modified):
- Imported `applyEnemyVerdureWallPushOut` from `rpg-enemy-updates` and `VerdureCaveWallState`
  type from `verdure-cave-walls`.
- Added `_applyVerdureWallPassToArray` helper (generic over any `{x,y,vx,vy}` array).
- Added centralized Verdure wall push-out pass at the end of `runRpgUpdate`, after all enemy
  update functions: when `getVerdureCaveWallState?.()` returns a state, iterates all 26 mobile
  enemy arrays and calls `applyEnemyVerdureWallPushOut` on each. Only runs in Verdure zone.
  Nav-grid integration is the primary protection; this is a per-frame fail-safe.

**`src/render/rpg/rpg-render.ts`** (modified):
- Fixed the **primary Verdure wall collision bug**: added `getVerdureCaveWallState: () =>
  verdureCaveWallState` to `movementCtx` (`PlayerMovementCtx`). Previously this method was
  absent so `ctx.getVerdureCaveWallState?.()` silently returned `undefined` in
  `rpg-player-movement.ts`, making all wall collision code dead. Player can no longer walk
  through Verdure walls.
- Added `getVerdureCaveWallState: () => verdureCaveWallState` to `enemyCtx` (`RpgEnemyCtx`)
  so the per-frame wall push-out pass has access to wall state.
- In `beginWaveTerrain` callback, after `buildRpgNavigationGrid`: applies Impetus asteroid soft
  obstacles (`applyCircleSoftObstacles + getImpetusAsteroidObstacles`) and Verdure wall hard
  blocks (`applyVerdureWallsToNavGrid`). Both are zone-gated and run once per wave.
- Added imports: `applyCircleSoftObstacles` from `rpg-pathfinding`, `applyVerdureWallsToNavGrid`
  from `verdure-cave-walls`, `getImpetusAsteroidObstacles` from `impetus-overlay`.

### Bugs fixed

- **Verdure player wall pass-through** (regression from build #162): `movementCtx` in
  `rpg-render.ts` was missing `getVerdureCaveWallState`, making the wall collision code in
  `rpg-player-movement.ts` completely inert. Fixed.

### Deferred / Out-of-Scope

- **Horizon True subzone — additional mechanics**: Visual effect is intentional as-is. Future
  mechanics to be designed by the developer.
- **Impetus gravity wells — gameplay force fields**: Visual-only by design. No global force fields.
- **Asteroid drift vs. nav grid**: Asteroid visuals drift slowly over time but the nav grid uses
  base positions (deterministic, no per-frame rebuild). This is an acceptable approximation.
- **Per-enemy halfSize in Verdure wall pass**: Centralized pass uses a fixed 6 px half-size for
  all enemy types. For best accuracy, individual update functions could pass their own half-size.
  The nav-grid integration is the primary protection, so this is a low-priority refinement.



### What was implemented

- **`src/render/rpg/terrain/terrain-lighting.ts`** (NEW, ~110 lines):
  - `TerrainLightEmitter` interface: `type` ('point'|'beam'), `x/y`, `x2/y2` (beam end), `r/g/b`, `radiusPx`, `intensity`.
  - `distToSegmentSq(px, py, ax, ay, bx, by)` — correct segment distance for beam emitters.
  - `sampleTerrainLightAt(cx, cy, emitters[])` — accumulates RGBA tint from all emitters with smooth distance falloff; returns `{r, g, b, a}`.
  - `MAX_TERRAIN_LIGHT_EMITTERS = 40` — hard cap to keep performance bounded.

- **`src/render/rpg/terrain/euhedral-hex-floor.ts`** (NEW, ~230 lines):
  - Full-screen pointy-top hex grid for Euhedral zone (FLOOR_HEX_RADIUS = 19 px, ~210 cells on 360×640).
  - Geometry cached in a module-level object; invalidated only on canvas size change — no per-frame rebuild.
  - Base pass: very dim fill + thin stroke (base alpha 0.13 / 0.20) with per-hex noise variation (±15 %).
  - Lit tint overlay pass: samples `sampleTerrainLightAt()` per cell; max overlay alpha 0.22.
  - `drawEuhedralHexFloor(ctx, w, h, emitters, lowGraphics)` and `invalidateEuhedralHexFloorCache()` exports.
  - Skipped entirely in low-graphics mode.

- **`src/render/rpg/terrain/basalt-terrain.ts`** (modified):
  - `renderBasaltTerrain()` accepts optional `lights?: TerrainLightEmitter[]`.
  - `influencedHexColor()` now accepts both `EnemyInfluencePoint[] | undefined` and `TerrainLightEmitter[] | undefined` — accumulates contributions from both.
  - Formation outline `lineWidth` changed **0.8 → 2.5 px** — formations are now clearly distinct from the thin floor hex grid.

- **`src/render/rpg/terrain/topographic-terrain.ts`** (modified):
  - `renderTopographicTerrain()` accepts optional `lightEmitters?: TerrainLightEmitter[]` parameter.
  - Threads it to `renderBasaltTerrain()` only; recursiveSquares ignores it (not applicable).

- **`src/render/rpg/rpg-render-draw.ts`** (modified):
  - Added `isEuhedralZone` flag alongside other zone flags.
  - New `_collectTerrainLightEmitters(ctx, w, h)` function: collects priority-ordered emitters (ruby laser beam → boss → elites → player → enemies → projectiles); capped at `MAX_TERRAIN_LIGHT_EMITTERS`; spatially culled to viewport + 120 px margin.
  - Euhedral hex floor drawn after fluid and before persistent sunlight/terrain.
  - `euhedralLights` collected once per frame and reused for both the floor and formations.
  - `_collectVerdureInfluences()` extended to include ruby laser beam (3 decomposed point emitters), sapphire/amethyst laser projectiles, and emerald missiles — Verdure stones now react to attacks.

### Deferred / follow-up

- **Euhedral hex floor in low-graphics mode**: currently disabled entirely. A very reduced (no tint, 30 % fewer cells) path could be added if needed.
- **Visual tuning constants** that may need adjustment:
  - `FLOOR_HEX_RADIUS = 19` — change to adjust hex cell size on screen.
  - `BASE_FILL_ALPHA = 0.13`, `BASE_STROKE_ALPHA = 0.20` — floor brightness.
  - `MAX_TINT_ALPHA = 0.22` — ceiling for per-hex colored light.
  - `NOISE_SCALE = 0.15` — per-hex brightness variation.
  - Basalt formation `lineWidth = 2.5` — formation outline thickness.
  - Enemy emitter `intensity = 0.45`, player `intensity = 0.35`, laser beam `intensity = 0.85`.
  - `MAX_TERRAIN_LIGHT_EMITTERS = 40` — raise/lower to trade fidelity vs. cost.
- **Other attack types not yet connected**:
  - Sand Blade / Sword Combo sweeps: melee only, no persistent position to emit light from.
  - Poison Bolts: no color constant pre-parsed; could be added (green tint) in a future pass.
  - Sunstone mines: stationary emitters would be easy to add (amber color at placed positions).
  - Vortexes: position available; could be wired as swirling point emitters.
  - Chain Whip: has a tip position; could be wired as a small bright point.
- **Verdure plants/vines**: not relit (stones only). Architecture supports it — `VerdureInfluenceObj` already flows to the segmented surface; extending to a separate vine overlay would require adding an influence parameter to `drawVerdureFloorEffects`.
- **Performance caveat**: `_collectTerrainLightEmitters` allocates a new array each frame. For very large enemy counts the push loop still iterates all enemies even after the cap is hit. A future optimization could early-exit the enemy loops once the cap is reached.

---


- **Visual tuning**: profile amplitude, waveTravel, bodyWidth, and tailSpread values are first-pass; in-game play may reveal fish that look too similar or oscillate too fast/slow for their archetype. Tunable via the constants at the top of the file.
- **File**: `src/render/rpg/rpg-procedural-fish-draw.ts`, functions `buildFishSpine`, `appendTailSection`, `drawFishPectoralFins`.

---

## Build #166 - Caustics terrain routing and procedural enemy damage

### What was fixed

- **Caustics terrain routing** (`topographic-terrain.ts`): `terrainProfile === 'seafloor'` now returns `terrainKind: 'topographic'` and begins classic contour/island terrain with the `cyanTactical` palette. The reserved `seafloorRidges` generator remains in the codebase but is not used for Caustics right now.
- **Procedural enemy direct hits** (`rpg-weapon-sand-collision.ts`, `rpg-weapon-sword-combo.ts`, `rpg-weapon-sword-combo-helpers.ts`, `rpg-weapon-chain.ts`, `rpg-weapon-vortex.ts`, `rpg-weapon-poison.ts`, `rpg-weapon-emerald.ts`, `rpg-weapon-sunstone.ts`, `rpg-orbit-projectile.ts`): sand gatling, sand blade/diamond sword, chain whip, nullstone vortex, poison bolts, emerald primary missiles, sunstone mines, and orbit projectiles now route procedural/Verdure bodies through `collectEnemyBodyTargets` + `damageBodyTarget`.
- **Manual/stale target reconstruction** (`rpg-targeting-targets.ts`): `getTargetedEnemy` now validates targets against the centralized body target list before the older explicit fallback, covering all procedural enemy families.
- **Build metadata/docs**: `BUILD_NUMBER` is now 166 and `file_index.md` was updated for the changed terrain and weapon modules.

### Deferred follow-up

- No known TypeScript/build-blocking follow-up from this pass. Manual in-game verification should still spot-check Caustics contour terrain and the listed Verdure/Caustics procedural enemies against the fixed direct weapon paths.

---

## Current Remaining Work

The following items are genuinely unresolved and ready for a future agent pass:

*(No unresolved items remain as of build #169. See the deferred section below for items that are
intentionally out of scope for now.)*

---

## Deferred / Out-of-Scope Items

These items are intentionally not implemented and should not be treated as bugs or agent tasks
unless the designer explicitly revisits them:

- **Horizon True subzone — additional mechanics**: The current True Binary Horizon visual effect
  is the intended final look. Additional True-specific gameplay mechanics may be added later by
  the designer. No agent work needed.

- **Impetus gravity wells — gameplay force fields**: Gravity wells remain visual-only by design.
  Individual enemies may have gravity-like mechanics in the future, but global well force fields
  are not planned. No agent work needed.

---

## Build #161 — Modular refactor: terrain collision and fish systems extracted

### What was implemented

**Terrain collision extraction** (`topographic-terrain.ts` → `topographic-terrain-collision.ts`):
- All spatial query helpers (point-inside, segment/circle intersection, line-of-sight, ray-march, solid-polygon export, signed-distance, push-out, repulsion force) extracted to a dedicated module.
- `topographic-terrain.ts` reduced from ~1832 lines to ~963 lines.
- All public APIs re-exported from `topographic-terrain.ts` via `export *` — zero import changes needed at call sites.

**Fish draw extraction** (`rpg-procedural-draw.ts` → `rpg-procedural-fish-draw.ts`):
- All fish drawing code (8 species + FishMine/FishSpike/FishBolt/FishDecoy) extracted (~400 lines).
- `rpg-procedural-draw.ts` reduced from ~967 lines to ~570 lines.
- Fish draw functions re-exported from main file for backward compat.
- `setProcLowGraphicsMode` now also delegates to `setFishDrawLowGraphics`.

**Fish update extraction** (`rpg-procedural-update.ts` → `rpg-procedural-fish-update.ts`):
- All fish update code (Boids schooling + 8 species + fish projectiles/hazards) extracted (~471 lines).
- `rpg-procedural-update.ts` reduced from ~935 lines to ~462 lines.
- Fish update functions re-exported from main file for backward compat.

### Behavior-preserving assumptions
- All collision functions are mathematically identical (identical bodies copied verbatim from original).
- The `contactDamage` helper is duplicated in `rpg-procedural-fish-update.ts` — both copies are identical.
- `isLowGraphicsMode` in fish draw/update files defaults to `false` (same as before); now correctly forwarded via `setProcLowGraphicsMode`.

### Remaining refactor opportunities (deferred)

- **`rpg-render.ts`** (~1500 lines): Still a large orchestration file. The zone-switch logic, wave-manager wiring, and inter-wave state transitions could be split into a `rpg-render-lifecycle.ts`. Risky without a larger test harness — defer.
- **`rpg-render-draw.ts`** (~800 lines): `drawRpgFrame` iterates through all entity arrays. Individual zone-layer draw calls could be delegated to zone-specific render modules, but the tight inter-layer ordering makes this refactor non-trivial.
- **`rpg-wave-manager.ts`**: Contains spawn tables, timing, and state transitions. Spawn definitions could be separated into data files. Low priority since behavior is stable.
- **`topographic-terrain-field.ts`**: Still ~700 lines; mergedContour building is complex and likely correct — no safe split candidate without extensive testing.
- **Fish shared helpers** (`contactDamage`, `applyGlow`, etc.) are duplicated across proc draw/update files. A future `rpg-procedural-shared.ts` could deduplicate these if both files need to evolve.

---

## Build #160 — Zenith Binary Horizon wave presentation overhaul

### What was implemented

1. **Files changed**
   - `src/render/background/zenith-binary-horizon.ts` — full rewrite; ~1160 lines
   - `src/render/rpg/rpg-render.ts` — lifecycle wiring + shake getter + `setScreenShakeEnabled`
   - `src/render/rpg/rpg-render-types.ts` — added `setScreenShakeEnabled` to `RpgRender` interface
   - `src/render/rpg/rpg-render-draw.ts` — added `getZenithShakeOffset?` to `RpgDrawCtx`; shake translate in `drawRpgFrame`
   - `src/app/app-game-loop.ts` — forwards `isScreenShakeEnabled` setting to `rpgRender`
   - `src/buildInfo.ts` — build number incremented to 160
   - `file_index.md` — updated zenith-binary-horizon and rpg-render-draw entries

2. **How cut lines are generated**
   - `generateMultipleValidLines(IW, IH, waveSeed, count)` uses a single mulberry32 PRNG.
   - Each candidate line is validated: both perimeter points, length ≥ 20% of min(IW,IH), Shoelace area ≥ 10% on both sides.
   - Lines are similarity-rejected: if nearly parallel (|dot| > threshold) AND positionally close (centre-to-line distance < threshold), the candidate is discarded and another is tried.
   - Up to `lineReseedMaxAttempts` (64) attempts per line; accepts fewer lines if budget runs out rather than stalling.

3. **How the 1–5 cut sequence works**
   - At `beginZenithBinaryHorizonWave(waveNumber)`: seeded PRNG determines `cutCount ∈ [1,5]`; `generateMultipleValidLines` generates the lines; they go into `pendingCuts`.
   - `tickCutSequence(deltaMs)` advances one cut at a time: animates the head from A→B over `cutDurationMs`, then pauses for `gapDurationMs` before starting the next.
   - When a cut completes: `storeLine` writes to flat typed arrays, `bakeCompletedLine` draws a faint accent on the offscreen canvas, and `triggerShake` fires.
   - After the last cut, a short prewarm pass runs then the phase transitions to `'active'`.

4. **How screen shake is triggered**
   - Each completed cut calls `triggerShake(amplitude)` where amplitude is random in `[cutShakeMinAmplitude, cutShakeMaxAmplitude]`.
   - `tickShake(deltaMs)` produces a decaying cosine oscillator: `amp * t * cos(freq * t * 2π)` for X, similar for Y with a different frequency.
   - `getShakeOffset()` returns `{x, y}` in logical canvas pixels; applied in `drawRpgFrame` as a `canvas2d.translate(shakeX, shakeY)` wrapped in save/restore.
   - Disabled when `setScreenShakeEnabled(false)` (forwarded from `settings.isScreenShakeEnabled`).

5. **How particles emit from multiple source lines**
   - Each particle carries a `psrcLine: Int8Array` index referencing its source line in flat arrays `lineAx/Ay/Bx/By/Dx/Dy/Nx/Ny`.
   - `spawnParticle(i, scatter)` picks `li = random(0, completedLineCount-1)`, samples a point on that line, and stores `li` in `psrcLine[i]`.
   - `tickParticlesActive` uses `signedDistToLine(x, y, li)` for per-particle line-local physics.

6. **How the reverse collapse works**
   - `endZenithBinaryHorizonWave()` sets phase to `'collapsing'` and respawns all particles near their source lines.
   - `tickParticlesCollapse(dt, collapseRatio)` applies a strong attraction force toward the nearest point on each particle's source line.
   - The offscreen fade alpha increases to `collapseFadeAlpha` (0.035 vs normal 0.007) so the accumulated field drains faster.
   - Stroke alpha decreases linearly as `collapseRatio` rises (particles fade as they converge).
   - Source-line accents fade when `collapseRatio > collapseLineFadeStartRatio` (0.72).
   - When `collapseRatio ≥ 1`: `clearOffscreen()` wipes the buffer; phase → `'cleared'`.

7. **How low graphics mode changes the effect**
   - 1600 particles (vs 5200), 0.35× internal scale (vs 0.50×), 24 prewarm steps (vs 80).
   - Collapse duration is 60% of normal.
   - Cut-head glow is skipped entirely.
   - Trail alpha is slightly higher to compensate for lower particle density.

8. **`npm run build` status**: ✅ passes (see dist output above).

---


## Build #154 — Zenith Binary Ring elite encounter

### What was implemented

- **`src/render/background/zenith-binary-ring-background.ts`** (new file):
  - Added a persistent offscreen-canvas Binary Ring encounter background for Horizon → Zenith.
  - Uses preallocated `Float32Array`/`Uint8Array` particle state, translucent-black trail fading, deterministic radial+tangential ring flow, breathing ring radius, and 8 bucket-batched colour passes.
  - Supports Age of Light / Age of Darkness palettes with smooth ~1.5s palette lerp on age changes.

- **`src/render/rpg/rpg-binary-ring-encounter.ts`** (new file):
  - Added the Binary Ring elite encounter state, factories, per-frame phase machine, homing missiles, spinning laser sweep, and self-contained draw routine.
  - Encounter phases cycle through evolve → laser telegraph/attack → recover → missile telegraph/attack → age transition.
  - Missiles use preallocated `Float32Array` trail buffers; laser and missile attacks apply player damage during the Zenith fight.

- **Targeting + damage wiring** (`rpg-types.ts`, `rpg-damage.ts`, `rpg-targeting-types.ts`, `rpg-targeting-targets.ts`, `rpg-targeting-nearest.ts`, `rpg-targeting.ts`):
  - Added `binary_ring` target support, `ClosestTarget.binaryRing`, Binary Ring damage dispatch, and Binary Ring inclusion in nearest-target/body-target queries.

- **`src/render/rpg/rpg-render.ts` / `src/render/rpg/rpg-render-update.ts`**:
  - Added Binary Ring encounter state ownership (`binaryRingEnemies`, missiles, laser sweep, Binary Ring background instance).
  - Horizon Zenith now swaps from Binary Horizon to the Binary Ring background while the encounter is active.
  - Encounter state is updated in the extracted RPG update loop and fully cleared on zone switch / restart.

- **Docs + metadata**:
  - `src/buildInfo.ts`: BUILD_NUMBER → 154.
  - `file_index.md`: added entries for the Binary Ring background + encounter modules.
  - `nextSteps.md`: documented this build.

### Remaining follow-up

- **Binary Ring weapon-specific collision integration**: the generic targeting path can hit the Binary Ring, but some older weapon modules still use direct per-enemy array sweeps. A future pass should teach those direct-collision weapon modules to include `binaryRingEnemies` so every weapon family can damage the encounter uniformly.

---

## Build #157 — Nadir elite-wave CubicGrid background effect

### What was implemented

- **`src/render/background/nadir-cubic-grid-background.ts`** (new file):
  - "CubicGrid" rotating 3D dotted lattice background effect for Horizon → Nadir elite waves.
  - Precomputes world-space lattice point coordinates once (`buildLatticePoints`) into preallocated
    `Float32Array` / `Uint8Array` buffers — zero per-frame heap allocation.
  - Per-frame: combined Rx·Ry·Rz rotation, perspective projection (depth-faded dots), written
    directly into a persistent `ImageData` buffer and flushed with a single `putImageData`.
  - Renders to an offscreen canvas at `RENDER_SCALE = 0.5` then `drawImage`-upscaled into the
    main RPG canvas (`imageSmoothingEnabled = false` for pixel-crisp look).
  - Three axis colour families: X-lines = blue-white, Y-lines = red-magenta, Z-lines = cyan-green.
  - Smooth fade-in (1.2 s) when `isEliteWaveActive` becomes true; smooth fade-out (0.8 s) when
    the wave ends or the player leaves Nadir. No-ops once `masterAlpha` reaches 0.
  - Low-graphics mode: halved lattice half-cells (5 vs 7), fewer samples (28 vs 42), smaller
    offscreen resolution (0.35× vs 0.5×).
  - Effect is fully self-contained; no changes to the main renderer outside wiring points.

- **`src/render/rpg/rpg-wave-manager.ts`** (updated):
  - Added `getNadirEliteTierForWave(wave)` — selects the highest available elite tier scaling with
    the Nadir wave number (same unlocks as standard elite progression).
  - In `startNextWave()`: when `activeZoneId === 'horizon'`, `activeSubzoneId === 'nadir'`, and
    `wave % 10 === 0`, an elite spawn entry is injected into the spawn queue with a 1200 ms delay.

- **`src/render/rpg/rpg-render.ts`** (updated):
  - Imports `createNadirCubicGridBackground`.
  - Added `nadirCubicGrid: NadirCubicGridBackground | null` instance (lazy-created on first Nadir
    elite frame).
  - Added `isNadirEliteWave: boolean` closure flag (updated via `syncNadirEliteWave(wave)`).
  - `syncNadirEliteWave(wave)` is called from both `setCurrentWave` callbacks (wave manager and
    death-restart context) to keep the elite-wave flag in sync.
  - `drawZoneBgOverlay` now also creates / updates / draws `nadirCubicGrid` when in Nadir.
    `isEliteWaveActive = isNadirEliteWave && !isInterWave` drives the fade-in/out.
  - The substrate is always drawn first in Nadir; the CubicGrid overlays it (with its own alpha).
  - `nadirCubicGrid` and `isNadirEliteWave` are cleared in both `resetActiveEncounterForZoneSwitch`
    (zone switches and death resets) and the subzone-select callback (subzone switches).

### State management notes

- `isNadirEliteWave` is recomputed every time the wave counter changes (start of a new wave or
  death-restart). It is `true` iff `activeZoneId === 'horizon'`, `activeSubzoneId === 'nadir'`,
  and the wave number is a positive multiple of 10.
- During the inter-wave period after an elite wave, `isEliteWaveActive = false` so the CubicGrid
  fades out before the next wave begins.
- Non-Nadir zones never see the effect because `drawZoneBgOverlay` early-exits for non-Nadir paths.

### Intentionally deferred

- **Nadir elite drop / reward**: no special XP or mote bonus for killing the Nadir elite yet.
  A future pass can check `eliteEnemies.length === 0` with `isNadirEliteWave` to award bonuses.
- **Elite tier difficulty tuning**: `getNadirEliteTierForWave` uses standard elite unlock thresholds.
  Nadir-specific scaling (HP multipliers, faster projectiles) can be added later.
- **CubicGrid on/off debug flag**: the existing `_isDevMode` flag in `rpg-render.ts` could be used
  to force `isNadirEliteWave = true` for testing without advancing to wave 10. Not wired yet.

---

## Build #153 — Zenith Binary Horizon background effect

### What was implemented

- **`src/render/background/zenith-binary-horizon.ts`** (new file):
  - "Binary Horizon" ambient background for the Zenith sublevel.
  - Black void with a thin luminous horizontal horizon near the vertical centre.
  - Dense faint particle trails originating from the horizon, growing upward/downward.
  - Centre zone bright white/silver; outer regions graduate through cyan → teal → blue → violet → magenta.
  - Animated with a deterministic curl-like flow field (superposed sine/cosine terms, no external libraries).
  - Subtle bilateral symmetry with asymmetric perturbation to avoid perfect mirroring.
  - Breathing intensity pulse on horizon line and central glow.
  - Performance: offscreen canvas, preallocated `Float32Array`/`Uint8Array`, particle batching by colour bucket (8 state-changes per frame), quality-scaled internal resolution and particle count.

- **`src/render/rpg/rpg-render.ts`** (updated):
  - Replaced `zenithSubstrate: SubstrateEffect` with `zenithBinaryHorizon: ZenithBinaryHorizon`.
  - `drawZoneBgOverlay` now uses Binary Horizon for `activeSubzoneId === 'zenith'` and `'true'`.
  - Subzone-switch reset correctly nulls `zenithBinaryHorizon`.
  - `createSubstrateEffect` import removed (only used for Zenith; Nadir substrate unchanged).

- **`src/render/background/index.ts`** (updated): exports `ZenithBinaryHorizon` and `createZenithBinaryHorizon`.

- **`src/buildInfo.ts`**: BUILD_NUMBER → 153.

### How Zenith is detected

`rpg-render.ts → drawZoneBgOverlay` checks `rpgSimState.activeZoneId === 'horizon'` and then `rpgSimState.activeSubzoneId !== 'nadir'` to select the Binary Horizon effect.

### Performance controls

Quality is set at instance creation time (inherits `isLowGraphicsMode` from `rpg-render.ts`):
- **Low**: 110 particles, 0.032 fade, 0.5× resolution → very light.
- **Medium**: 280 particles, 0.018 fade, 0.75× resolution.
- **High**: 600 particles, 0.010 fade, full resolution.

---

## Build #151 — Caustics correctness pass

### What was fixed

- **Unreachable startup prewarm block** (`rpg-render.ts`):
  - The `setTimeout(() => prewarmCausticsTextures(), 0)` startup check was placed *after* the
    `return { ... }` object in `createRpgRender()`, making it unreachable dead code.
  - Moved it to immediately *before* the `return` statement so players who load directly into
    the Caustics zone from saved state now correctly prewarm tiles before the first render frame.
  - The zone-switch prewarm call (in the zone-select callback) is unchanged.

- **Low-graphics tile B generation eliminated** (`caustics-overlay.ts`):
  - `_drawCausticsTileLayers()` previously called `getCausticsTextureTile2()` unconditionally,
    generating the alternate B tile even in low-graphics mode where Layer B is never drawn.
  - `tileB` is now set to `null` when `lowGraphics` is true; `getCausticsTextureTile2()` is
    only called in high-graphics mode.
  - `_patternB` and `_patternC` are set to `null` in low-graphics mode; pattern cache tracks
    `_patternTileB` as `null` so a switch from low→high graphics correctly rebuilds all patterns.

---

## Build #150 — Caustics texture polish

### What was implemented

- **Second Voronoi tile variant** (`caustics-texture.ts`):
  - Added `_SEED_A` / `_SEED_B` constants (different xorshift seeds → distinct Voronoi topologies).
  - `_generateTile(size, nSeeds, seed)` now accepts an explicit seed parameter.
  - Module-level cache extended: `_tileHighA/B`, `_tileLowA/B` — four cached canvases total.
  - New exports: `getCausticsTextureTile2(lowGraphics)` — returns the alternate (B) tile.
  - New export: `prewarmCausticsTextures()` — eagerly pre-generates all four tiles before the
    first Caustics render, eliminating first-frame stutter.
  - `invalidateCausticsTextureCache()` updated to discard all four tiles.

- **Prewarm calls wired** (`rpg-render.ts`):
  - Zone-switch callback now calls `prewarmCausticsTextures()` immediately when switching to
    `'caustics'`, before the first Caustics frame is rendered.
  - A `setTimeout(..., 0)` deferred call was intended at the end of `createRpgRender()` to also
    prewarm tiles if the player starts in the Caustics zone (restored from save data).
    **Note:** this call was placed after the `return` statement and was unreachable; fixed in
    Build #151.

- **Per-frame allocations reduced** (`caustics-overlay.ts`):
  - Three module-level `DOMMatrix` instances (`_matA`, `_matB`, `_matC`) replace new object
    literal creation on every `setTransform()` call.
  - Layer A and C: only `e`/`f` (translation) mutated per frame; scale components initialized
    once (`a=1/0.78`, `d=1/0.78`).
  - Layer B: `a/b/c/d` updated with rotation components each frame; no new DOMMatrix allocated.
  - `drawCausticsBackground()` gradients (`_atmoGrad`, `_poolGrad`) are now cached by context +
    dimensions + quality tier.  Recreated only when those change — never during normal play on
    the fixed 360×640 RPG canvas.

- **Reduced visual tiling / wallpaper effect** (`caustics-overlay.ts`):
  - Layer B now sources from tile variant B (`getCausticsTextureTile2`) instead of reusing
    tile A.  Different Voronoi seed means a completely different cell network.
  - `_patternTileA` / `_patternTileB` track the two source tiles separately; pattern cache
    is invalidated when either changes.
  - Layer B has a very slow rotation (≈0.015 rad/s ≈ 1 full turn per 420 s) applied via the
    DOMMatrix, introducing domain skew so the tile never reads as a static wallpaper.

- **Intensity/projection mask** (`caustics-overlay.ts`):
  - `_drawCausticsIntensityMask()` draws a cached linear gradient that darkens the top 30% of
    the canvas by up to 16% alpha.  Makes the caustic network feel concentrated on the seafloor
    rather than uniformly lit.
  - Gradient cached by context + height; recreated only when those change.
  - Uses `source-over` composite at `globalAlpha = 1` — drawn after tile layers, before
    shimmer and bubbles.  Does not obscure enemies or player (those are drawn later).

- **Comments corrected** (`caustics-overlay.ts`):
  - Module header now accurately describes which allocations occur per frame (DOMMatrix field
    mutations only for patterns; shimmer still uses canvas path calls).

---

## Build #149 — Caustics cached Voronoi texture system

### What was implemented

- **Caustics texture generator** (`caustics-texture.ts` — new file):
  - Generates one tileable caustic texture per quality tier using Voronoi cell-boundary
    (Worley F2−F1) noise, baked once into `ImageData` via `putImageData`.
  - High-quality tile: 256×256 px, 5×5 jittered-grid seeds (25 total) — cell size ≈ 51 px.
  - Low-quality tile: 128×128 px, 4×4 jittered-grid seeds (16 total) — cell size ≈ 32 px.
  - Seamlessly tileable via toroidal (periodic) boundary conditions on seed distances.
  - Two-component brightness formula:
    - Sharp core: `exp(−edge² × 0.50)` — thin ~2–3 px bright filament line.
    - Soft glow: `exp(−edge² × 0.025)` — 10–15 px aqua halo around each filament.
  - Color: aqua (#8CD8FF range) in glow halo, cool white-blue (#D8F5FF range) on filament.
  - Max pixel alpha 190 — filaments translucent individually; bright knots emerge from
    screen-blended layer overlap only.
  - Module-level cache (`_tileHigh`, `_tileLow`); exports `getCausticsTextureTile(lowGraphics)`
    and `invalidateCausticsTextureCache()`.

- **Caustics overlay rebuilt** (`caustics-overlay.ts`):
  - Removed the old 22-cell Bézier loop system (`_drawCausticsLightNet`,  `_CELL_DATA`,
    `_CELL_COLORS`, `_CVX`/`_CVY`, `_HIGH_CELL_COUNT`/`_LOW_CELL_COUNT`).
  - New `_drawCausticsTileLayers()`: draws 2–3 drifting `CanvasPattern` layers with
    `globalCompositeOperation = 'screen'`.
    - Layer A (always): scale 1.00×, drift (+8.5, +6.0) px/s — main caustic weave.
    - Layer B (high only): scale 1.28×, drift (−6.2, +4.5) px/s — larger cells, opposing X.
    - Layer C (high only): scale 0.78×, drift (+4.2, −5.8) px/s — finer detail, upward bias.
  - CanvasPattern objects cached module-level (`_patternA/B/C`) and reused each frame —
    no per-frame allocations in the hot draw loop.
  - Low-graphics: one layer at alpha 0.33.  High-graphics: three layers at 0.40 / 0.28 / 0.18.
  - Shimmer bands reduced to 3 (was 5) with lower alpha — kept as subtle accent only.
  - Bubbles unchanged.
  - `drawCausticsBackground` unchanged (atmosphere gradient + floor glow pool).

- **Dev overlay updated** (`rpg-render-draw.ts`):
  - Caustics route label changed from `'causticsFilaments'` to
    `'causticsCachedTileLayers(High|Low)'`.

---

## Build #148 — Caustics light network visual upgrade (superseded)

### What was implemented (now replaced by build #149)

The build #148 Bézier-loop approach has been replaced.  See build #149 above for the
current caustics implementation.

---

- **Caustics light network rebuilt** (`caustics-overlay.ts`):
  - Replaced the old sine-wave filament approach (`_drawCausticsFilaments`) with a new
    `_drawCausticsLightNet` that renders 22 closed organic loop cells covering the full arena.
  - Each cell is a smooth 5-vertex closed Bézier polygon (midpoint quadratic technique) with
    independently oscillating vertex radii — continuously morphing organic shapes.
  - Drawn with `globalCompositeOperation = 'lighter'` (additive blending) so overlapping loop
    edges naturally produce bright hot-spots, matching real caustic physics where multiple
    refracted ray bundles converge on the seafloor.
  - 4-colour pale-cool palette (aquamarine, sky-blue, pale mint, cerulean) at conservative
    per-cell alpha (0.055–0.082 × brightness pulse), so gameplay remains readable.
  - Each cell has a pre-baked Y-stretch (0.75–1.25) for shape variety — some loops are flat
    like sandbars, others are taller.
  - A slow global sinusoidal drift (±15 px X, ±10 px Y, ~12 s period) simulates the water
    surface rolling above the arena.  Each cell also drifts individually at its own frequency.
  - Low-graphics mode: 11 cells (every other index); shimmer bands skipped.
  - No per-frame allocations — all 22 cell params in `_CELL_DATA` constant; `_CVX`/`_CVY`
    are module-level `Float32Array` buffers reused each frame.

- **Background upgraded** (`caustics-overlay.ts`):
  - Richer three-stop atmosphere gradient: near-black navy → dark teal → murky seafloor green.
  - Floor glow pool: soft warm-teal radial gradient pooled at the seabed (high-graphics only).
    Simulates diffuse ambient light accumulating on the sandy/rocky substrate.

- **Shimmer bands tuned** (`caustics-overlay.ts`):
  - 5 bands (was 4), slightly higher base alpha (0.018, was 0.013) for better visibility
    against the brighter caustic background.

---

## Build #147 — Caustics seafloor collision and pathfinding

### What was implemented

- **Caustics seafloor collision geometry** (`seafloor-terrain.ts`):
  - Added `SeafloorCollisionSegment` type: capsule (start point, end point, radius) representing
    a hard-blocking section of a ridge crest.
  - Added `collisionSegments: SeafloorCollisionSegment[]` to `SeafloorRidge` and
    `allCollisionSegments: SeafloorCollisionSegment[]` to `SeafloorTerrainData` for fast iteration.
  - `generateSeafloorTerrain()` now calls `_generateRidgeCollisionSegments()` for each ridge:
    - 25–45% of each ridge's usable x-range becomes hard-blocking.
    - Blocked sections are split into 1–3 non-contiguous spans per ridge.
    - Edge exclusion zones (left/right 10% of arena) are never blocked.
    - Minimum gap constant (`_MIN_GAP_PX = 55 px`) enforced between blocked spans.
    - Capsule radius = 38% of body width — tighter than the visual stroke, so ridges look wider
      than their hard obstacle, giving a "sandbar" not "brick wall" feel.
    - Fully deterministic from the same seed as ridge generation.

- **Terrain collision helpers updated** (`topographic-terrain.ts`):
  - `isPointInsideTopographicTerrain`: new `seafloorRidges` branch — tests each capsule via
    `pointToSegmentDistSq(px, py, ...) <= radius²`.
  - `circleIntersectsTopographicTerrain`: new `seafloorRidges` branch — tests each capsule with
    combined radius `(seg.radius + queryRadius)`.
  - `segmentIntersectsTopographicTerrain`: new `seafloorRidges` branch — uses
    `_segmentIntersectsCapsule()` helper (4 endpoint distance checks + `segmentsIntersect` guard).
  - `terrainFirstIntersectionT`: new `seafloorRidges` branch — steps along the ray at 5 px intervals
    to find the first capsule entry (used for projectile/laser truncation).
  - `signedDistanceToTerrainBoundary`: new `seafloorRidges` branch — returns signed distance from
    query point to nearest capsule surface (negative inside, positive outside).
  - Added private capsule helpers `_pointInCapsule()` and `_segmentIntersectsCapsule()`.

- **Nav grid picks up seafloor collision** (`rpg-pathfinding.ts`):
  - No changes needed: `buildRpgNavigationGrid()` already calls
    `isPointInsideTopographicTerrain` + `circleIntersectsTopographicTerrain`, which now handle
    `seafloorRidges`. Hard crest segments are marked blocked; gaps remain walkable.
  - Path funnel `_funnelPath()` uses `segmentIntersectsTopographicTerrain` which now handles
    `seafloorRidges`, so waypoints route around blocked crest segments.

- **Visual clarity: hard-crest markers** (`seafloor-terrain.ts`):
  - `renderSeafloorTerrain()` draws a brighter teal stroke over each blocked capsule section,
    at 55% of the body width, using `lineCap = 'butt'` for crisp segment ends.
  - Low-graphics mode uses a slightly lower alpha marker; high-graphics uses a stronger marker.
  - Gives players a readable signal that certain parts of each ridge are solid obstacles.

- **Dev overlay enhanced** (`rpg-render-draw.ts`):
  - Caustics zone overlay now appends:
    - `seafloorSegments: N` — total collision capsules across all ridges.
    - `seafloorCollision: on/off` — quick diagnostic for whether any capsules were generated.

- **LOS/projectile blocking** (`topographic-terrain.ts`):
  - `terrainFirstIntersectionT` and `segmentIntersectsTopographicTerrain` now work for
    `seafloorRidges`, so lasers and projectiles are blocked by hard crest segments.
  - Targets behind hard segments lose LOS — `hasTopographicTerrainLineOfSight` returns false
    for obstructed paths.
  - Conservative step-based ray test (5 px) is accurate to within half a step; suitable for
    the visual-effect use case (laser truncation). Documented in `DECISIONS.md` if needed.

### Remaining work (future tasks)

- **Horizon True subzone**: Currently shows the Zenith substrate with a placeholder label in the
  dev overlay. A distinct visual effect needs to be designed and implemented.

- **Impetus gravity wells — gameplay force fields**: Gravity wells are visual-only. Future pass:
  apply radial force to enemy positions and player position when within well radius.

- **Impetus asteroid field — collision/pathfinding**: Asteroid visuals are decorative.
  Future pass: register asteroid positions in the nav grid as soft obstacles.

- **Verdure rock collision**: Edge cave walls are visual-only. Future pass: integrate wall
  boundary polygons into the nav grid.

*(These items were still unresolved as of build #147; see "Current Remaining Work" at the top
of this document for the live tracking list.)*

---

## Build #145 — Zone effects visibility cleanup, Horizon subzone wiring, dev overlay improvements

### What was implemented

- **Impetus gravity wells visible in low-graphics mode** (`impetus-overlay.ts`):
  - `drawImpetusFloorEffects()` now calls `_drawGravityWellsSimple()` in low-graphics mode
    instead of skipping gravity wells entirely.
  - `_drawGravityWellsSimple()`: cheap two-ring + solid dark center approach — no gradients,
    no arcs. Rings are more opaque (`1.5× rAlpha`) for contrast on mobile screens.
  - Star brightness boosted in low-graphics mode (`alphaBoost = 1.4`).
  - Background base alpha raised from `0.38` to `0.50` in low-graphics mode.
  - Added `getImpetusDevLine(lowGraphics)` export for the dev overlay.

- **Topography sunlight wash gating** (`rpg-render-draw.ts`):
  - Added `shouldDrawPersistentTopographySunlight(activeZoneId, terrainState)` helper.
  - `renderPersistentTopographySunlight()` is now only called when the helper returns true.
  - Excluded zones: `impetus`, `caustics`, `verdure`, `horizon`.
  - Also excluded: `basalt` terrain kind (manages its own shading).
  - Impetus, Verdure, Caustics, and Horizon no longer receive the topography light wash.

- **Fluid skipped for Impetus** (`rpg-render-draw.ts`):
  - `ctx.fluid.render(canvas2d)` is now gated by `!isImpetusZone` so the fluid overlay does
    not sit between the space starfield and floor effects.

- **Horizon subzone state wired** (`rpg-state.ts`, `save-types.ts`, `save-serialize.ts`,
  `save-deserialize.ts`, `rpg-render.ts`):
  - `RpgSimState.activeSubzoneId: string` added, defaults to `'zenith'`.
  - Persisted in save data at version 28; migrates to `'zenith'` for older saves.
  - `isNadir = false` hard-code removed from `rpg-render.ts`; now reads
    `rpgSimState.activeSubzoneId === 'nadir'`.
  - Subzone select callback added to `createRpgZoneSelectPanel`.

- **Horizon subzone UI** (`rpg-zone-select.ts`):
  - `createRpgZoneSelectPanel` now accepts an optional `onSubzoneSelect` callback.
  - When Horizon is active or selected, a subzone panel appears below the zone list showing
    Zenith / Nadir / True cards.
  - Tapping a subzone card calls `onSubzoneSelect` and rebuilds the subzone UI to reflect the
    new selection.  Zone substrate instances are reset so the new effect builds correctly.

- **Improved dev overlay** (`rpg-render-draw.ts` `drawRpgViewportDiagnostics`):
  - Now reports: `zone`, `subzone`, `terrainKind`, `lowGraphics`, `bg` route, `sunlightWash`.
  - `bg` shows the actual runtime route (e.g. `horizonNadirSubstrate`, `impetusStars+gravityWellsLow`).
  - Impetus-specific line appended when in Impetus zone (`getImpetusDevLine`).
  - Box width widened to 220 px to fit longer route strings.

### Remaining work (future tasks)

- **Impetus gravity wells — gameplay force fields**: Gravity wells are visual-only. Future pass:
  apply radial force to enemy positions and player position when within well radius.

- **Impetus asteroid field — collision/pathfinding**: Asteroid visuals are decorative.
  Future pass: register asteroid positions in the nav grid as soft obstacles.

- **Verdure rock collision**: Edge cave walls are visual-only. Future pass: integrate wall
  boundary polygons into the nav grid.

- **Horizon True subzone**: Currently uses Zenith substrate as placeholder. A distinct effect
  needs to be designed.

*(Note: "Caustics seafloor terrain" was listed here in build #145 as remaining work — this was
completed in build #147 with the `seafloorRidges` terrain variant and capsule collision system.)*

---

---

## Build #144 — Zone terrain routing overhaul, Impetus starfield/gravity wells, caustic filaments, Verdure cave walls, Horizon substrate

### What was implemented

- **Zone-based terrain dispatch** (`topographic-terrain.ts`):
  - `getTerrainKindForZone(zoneId, seed)` — new exported helper that returns the correct
    terrain kind for a zone without consulting the old 20-wave rotation. Used by dev overlay.
  - **Euhedral** (`crystalline`): Now uses `recursiveSquares` (75%) or `basalt` (25%) based on
    seed parity. Never uses topographic terrain by default.
  - **Impetus** (`asteroids`): Returns `null` — no terrain obstacles. Visual space effects are
    handled by `impetus-overlay.ts`.
  - **Verdure** (`overgrowth`): Returns `null` — no topographic mountains. Cave wall and vine
    visuals are handled by `verdure-overlay.ts` and `rpg-verdure-render.ts`.
  - **Caustics** (`seafloor`): Unchanged — topographic terrain with `cyanTactical` palette.
  - **Horizon**: Unchanged — returns `null`.
  - The old 20-wave rotation remains as a fallback for unknown terrain profiles only.

- **Impetus starfield + gravity well + asteroid effects** (`impetus-overlay.ts` — new file):
  - `drawImpetusBackground()`: Deep space gradient, multi-layer parallax starfield (44 pre-baked
    stars across 3 distance layers) with per-star twinkle animation. Faint nebula haze radial
    gradient in high-graphics mode.
  - `drawImpetusFloorEffects()`: Visual asteroid drift field (7 pre-baked asteroids on looping
    drift paths, irregular polygon shape) and gravity well visualizations (3 pre-baked wells with
    pulsing outer rings, swirl arcs, and dark central voids). Gravity wells are visual-only.
  - Wired in `rpg-render-draw.ts` gated on `activeZoneId === 'impetus'`.

- **Caustics filament lighting** (`caustics-overlay.ts`):
  - Replaced oval-patch `_drawCausticsPatches` with `_drawCausticsFilaments`.
  - Filaments use two interfering sine waves to generate thin branching light lines resembling
    real underwater caustic patterns. 10 primary filaments (5 in low-graphics), each with a
    slow-moving cross-filament in high-graphics mode. Concentrated in the lower 55% of the arena.

- **Verdure connected cave walls** (`rpg-verdure-render.ts`):
  - Replaced isolated small rocks with connected cave wall masses.
  - New approach: solid base wall bands with organic irregular contour profiles drawn along all
    four arena edges (depth 22+14 px), then enlarged rock protrusion polygons (1.6× larger than
    before, depth up to 36 px) layered on top. Added crevice line details and moss accents.
  - Added `_SEEDS` constant for organic contour generation.

- **Horizon Zenith/Nadir substrate backgrounds**:
  - `nadir-substrate-effect-internals.ts` — forked copy of substrate internals for Nadir zone.
  - `nadir-substrate-effect.ts` — structurally independent substrate factory (`createNadirSubstrateEffect`,
    `NadirSubstrateEffect` interface). Initialized separately from Zenith so future drastic visual
    changes to Nadir will not affect Zenith or the idle-game substrate effect.
  - Lazy-init substrate instances in `rpg-render.ts` (`zenithSubstrate`, `nadirSubstrate`).
  - `drawZoneBgOverlay` callback wired into `RpgDrawCtx`; called for Horizon zone.
  - Currently defaults to Zenith substrate. Nadir branch is wired but defers to `activeSubzoneId`
    which is not yet exposed in state (see remaining work below).

- **Dev overlay zone/terrain routing info** (`rpg-render-draw.ts` `drawRpgViewportDiagnostics`):
  - Dev overlay now shows: `zone`, `terrainKind`, `zoneProfile`, `bgEffects` routing for the
    currently active zone, so routing can be verified visually in-game.

### Remaining work (future tasks) — carried forward to build #145

- **Horizon subzone selection**: ✅ Completed in build #145.

- **Impetus gravity wells — gameplay force fields**: Gravity wells are visual-only. Future pass:
  apply radial force to enemy positions and player position when within well radius. Integrate
  with `rpg-player-movement.ts` (player deflection) and `rpg-enemy-updates.ts` (enemy drift).

- **Impetus asteroid field — collision/pathfinding**: Asteroid visuals are decorative.
  Future pass: register asteroid positions in the nav grid as soft obstacles so enemies and
  the player avoid them. Requires choosing a lifecycle model (per-wave static vs. drifting).

- **Caustics seafloor terrain**: The current topographic terrain for Caustics uses the standard
  contour generator with cyan palette. A dedicated seafloor ridge generator (elongated ridges,
  channels, underwater silhouettes) would improve zone identity.

- **Verdure rock collision**: Edge cave walls are visual-only. Future pass: integrate wall
  boundary polygons into the nav grid as impassable cells.

- **Impetus asteroid field at low-graphics**: Currently uses 50% of asteroids. Could use a
  simpler point/dot representation in low-graphics mode for better performance.

---

---

## Build #143 — Verdure zone environmental hazard system (edge rocks + growing plants)

### What was implemented

- **Edge rock formations** (`rpg-verdure-render.ts`): 31 pre-baked rock clusters frame all
  four arena edges with earthy-brown / dark-moss polygon shapes and subtle highlights (high-gfx).
  Geometry is fully deterministic — no per-frame RNG. Rendered immediately after the Verdure
  background tint, below fluid and enemies.

- **Procedural growing plants** (`rpg-verdure-growth.ts` + `rpg-verdure-render.ts`):
  Five plant types — `vine`, `spiral`, `flower`, `leafy`, `thorn` — each with:
  - Pre-computed cubic Bézier path cached at spawn (no per-frame geometry rebuild).
  - `growthProgress` 0→1 that advances at a per-plant speed (≈1–4 s to fully grow).
  - Branches, leaves, and flowers built once at spawn from deterministic seeded RNG.
  - Spawn interval ≈ 2–5 s during active combat, scaling down with wave number.
  - Active plant cap: 16 (high) / 8 (low-graphics).
  - Growth only ticks during active combat (not inter-wave, not boss fights).
  - Scale with wave: early waves lean vine/flower; mid+ add spirals/leafy; later add thorns.

- **Player targeting** (integration into existing targeting pipeline):
  - `VerdurePlant` added to `ClosestTarget` + `TargetKind` (`'verdure_plant'`) in `rpg-types.ts`.
  - `verdurePlants` array and `damageVerdurePlant` callback added to `RpgTargetingCtx`.
  - `findClosestTarget` (nearest.ts) checks `verdurePlants` using pre-cached
    `nearestSegDistPx` for broadphase, no new per-frame path sampling.
  - `damageBodyTarget` (rpg-targeting.ts) dispatches to `damageVerdurePlant`.
  - Close-range targeting only: plants are only `isTargetable` when the player is within
    `PLANT_TARGET_RANGE_SQ` (45 px) of a grown segment.
  - Targeting highlight: subtle green glow rendered around the main stem when targetable
    (high-graphics only).

- **Plant destruction**:
  - Plants have HP (base 35 + wave scaling). A few melee hits destroy them.
  - On death: growth and targeting stop, plant fades out, leaf/petal fragment particles burst.
  - Fragments handled in `verdureFragments` (module-level, max 60, no per-destroy alloc spike).

- **Zone isolation**:
  - All rock/plant rendering is gated on `activeZoneId === 'verdure'` in `rpg-render-draw.ts`.
  - Plants are cleared via `clearVerdurePlants()` in `resetActiveEncounterForZoneSwitch()`,
    which fires on zone switch, wave reset, and RPG restart.
  - `updateVerdurePlants` hook is an optional field on `RpgUpdateCtx` so other zones get no overhead.

- **New files**:
  - `src/render/rpg/terrain/rpg-verdure-growth.ts` (~450 lines): types, spawn, update, damage.
  - `src/render/rpg/terrain/rpg-verdure-render.ts` (~420 lines): rock + plant rendering.

- **Modified files**:
  - `src/render/rpg/rpg-types.ts` — `TargetKind` + `ClosestTarget`
  - `src/render/rpg/rpg-targeting-types.ts` — `RpgTargetingCtx`
  - `src/render/rpg/rpg-targeting-nearest.ts` — verdure plant check
  - `src/render/rpg/rpg-targeting.ts` — damage dispatch
  - `src/render/rpg/rpg-render-draw.ts` — `RpgDrawCtx`, rock/plant render calls
  - `src/render/rpg/rpg-render-update.ts` — optional `updateVerdurePlants` hook
  - `src/render/rpg/rpg-render.ts` — array creation, wiring, clear on reset

### Remaining Verdure hazard work (future tasks)

- **Obstacle avoidance for plant growth**: Plants currently grow through terrain obstacles.
  Future pass: query `rpgNavGrid` during path generation and deflect segments around walls.

- **Rock collision**: Rocks are visual only. Future pass: integrate the rock-boundary polygons
  into the nav grid as impassable cells so players and enemies are deflected by them.

- **Player damage from thorn vines**: Thorn plants don't yet deal damage to the player.
  Future pass: query `nearestSegDistPx` each frame; if player overlaps a thorn plant segment,
  deal small periodic damage (requires wiring into `dealDamageToPlayer`).

- **Debug UI controls**: No dev-mode toggles were added for rocks/plants/plant-hitboxes.
  Future pass: add toggles to the RPG dev overlay (`getIsDevMode()` path in `rpg-render-draw.ts`).

- **Wave-scaling density refinement**: Current scaling is linear per wave.
  Future pass: step-function at wave thresholds for a more noticeable mid/late density jump.

- **Seeded determinism across waves**: Currently plants use `Math.random()` at spawn time.
  Future pass: seed spawn from `rpgSimState.activeZoneId + currentWave + spawnIndex` for
  reproducible layouts in the same wave session.

---

## Build #142 - RPG zone switch encounter cleanup and terrain routing

### What was implemented

- **Zone-switch encounter cleanup**: Switching to a different RPG zone now clears active enemies,
  aliven groups, procedural enemies, boss state, boss projectiles, enemy hazards, transient hit
  effects, and player weapon projectiles/mines before the new zone resumes.
- **Spawn queue cancellation**: Pending wave spawns are cleared on zone switch so old-zone enemies
  cannot spawn after the selector changes zones.
- **Terrain clearing on switch**: Active terrain is removed immediately and the RPG nav grid is
  rebuilt as an open arena when the active zone changes.
- **First pass active-zone terrain routing**: `beginWaveTerrain()` now receives the active zone.
  Euhedral/crystalline keeps the old 20-wave terrain scheduler. Impetus/asteroids uses recursive
  squares as a temporary asteroid-like stand-in. Caustics/seafloor uses cyan topographic terrain.
  Verdure/overgrowth uses a named topographic branch. Horizon currently returns no terrain.

### Remaining terrain work (future tasks)

- Replace Impetus recursive-square stand-in with a real asteroid-field generator.
- ~~Add Caustics-specific seafloor ridges and water-shaped obstacle silhouettes.~~ *(Completed in build #147 — `seafloorRidges` terrain variant with capsule collision.)*
- Add Verdure-specific dense vine/root terrain and optional destructible root walls.
- Add Horizon terrain/mechanics once Horizon enemies and subzone behavior exist.

---
## Build #141 — Verdure zone first visual/environment pass

### What was implemented

- **Verdure atmosphere tint**: When `activeZoneId === 'verdure'`, a dark forest-green gradient
  overlay (`#040e04` → `#091208` → `#0b1a08`) is rendered immediately after the background fill
  (before fluid and terrain). A faint bioluminescent radial accent glows near the arena floor
  in high-graphics mode.
- **Procedural floor plant decoration**: 16 (8 in low-graphics) deterministic plant sprites are
  scattered across the lower half of the arena — four types: grass tufts (curved blades), sprouts
  (stem + leaf ellipse), moss patches (flat filled ellipses), and tiny bioluminescent flowers.
  All positions are seed-driven (no per-frame RNG). Each plant has a gentle time-driven bob.
- **Procedural vines with sway and player disturbance**: 12 (6 in low-graphics) vines grow inward
  from the bottom, left, and right arena edges. Each vine is a tapered segment chain (4–6 segments)
  with:
  - Natural curvature from pre-baked per-segment angle deviations stored in `Float32Array`.
  - Gentle sinusoidal sway driven by time + per-vine phase offset.
  - Spring-damped bend physics: player proximity within 52 px applies an outward velocity
    impulse; bend springs back to rest with `VINE_SPRING_K = 4.5` and `VINE_DAMPING_BASE = 0.91`.
  - Tapering line width (thick root → thin tip) and bioluminescent green shadow blur (high-gfx).
  - All bend state lives in module-level `Float32Array`s — no per-frame object allocation.
- **Drifting pollen particles** (high-graphics only): 16 tiny bioluminescent motes drift in slow
  2-D oscillation. All parameters are pre-baked as compile-time constants — no per-frame alloc.
- **Zone isolation**: All Verdure effects are strictly gated by `activeZoneId === 'verdure'`
  in `rpg-render-draw.ts`. No other zone is affected.
- New module: `src/render/rpg/terrain/verdure-overlay.ts`.

### Remaining Verdure work (future tasks)

- **Vine destruction / health**: Vine segments have no health yet. Future pass: expose a
  `damageVerdureVineAt(x, y, radius)` function in `verdure-overlay.ts`; projectile/AoE hit
  callbacks in `rpg-damage.ts` can call it. Destroyed segments should fade out and spawn tiny
  leaf/spore particles. Segment health could live in a `Float32Array`.
- **Enemy vine disturbance**: Currently only the player disturbs vines. Future pass: pass
  nearby enemy positions (or a lightweight snapshot) to `drawVerdureFloorEffects()` and apply
  smaller disturbance impulses per enemy type. Spider Crawler and Ribbon Worm should have
  stronger disturbance; Cloth Ghost minimal.
- **Custom overgrowth terrain generator**: Verdure now routes through an overgrowth branch in
  `beginWaveTerrain()`, but it still uses the topographic generator as a first pass. Future work
  should replace it with denser vine/root terrain.
- **Vine regrowth between waves**: Vines could slowly regenerate at wave-clear, providing
  visual feedback for the inter-wave break.
- **Plant Turret root integration**: The Plant Turret enemy could visually root into a nearby
  vine — draw a short curved line from its base to the nearest vine root when Verdure is active.
- **Spider Crawler vine pathing**: Spider Crawlers could prefer to stay near vine edges (use
  vine root positions as soft waypoints).
- **Ribbon Worm flattened trail**: Temporary vine/plant bend trail behind the Ribbon Worm as
  it moves through the arena.
- **Destructible root wall hazards**: Blocking vine clumps that can be destroyed by player
  attacks but slow enemy movement until cleared.
- **Hazard plants**: Stationary thorns or pollen burst plants that deal damage to the player
  on contact — separate from decorative floor plants.
- **Vine collision (player/enemy push-out)**: Not implemented in first pass — decorative
  vines pass through entities. Future: add vine segment AABBs to the nav grid obstacle list.
- **Stronger bioluminescent effects**: Per-vine animated glow pulses keyed to sway phase;
  blinking spore capsule bulbs on vine tips.

---
## Build #140 — Caustics zone first visual/environment pass

### What was implemented

- **Caustics underwater atmosphere tint**: When `activeZoneId === 'caustics'`, a dark teal/navy
  gradient overlay is rendered immediately after the background fill (before fluid and terrain),
  adding a submerged underwater feel without obscuring any gameplay elements.
- **Animated caustic floor light**: Eight (four in low-graphics mode) slowly-drifting, pulsing
  translucent ellipses are rendered on top of terrain but below enemies/player, simulating
  light refracted through water onto a seafloor. Each patch moves on an independent
  Lissajous-like trajectory; all parameters are pre-baked constants (no per-frame allocation).
- **Water shimmer bands** (high-graphics only): Four faint sine-wave bands across the upper
  arena simulate light shimmer visible from underwater.
- **Rising bubble particles**: 14 (6 in low-graphics mode) small translucent circles drift
  upward in a continuous cycle with gentle horizontal wobble. All parameters are baked into
  `caustics-overlay.ts` as a module-level constant table.
- **Zone isolation**: All Caustics effects are strictly gated by `activeZoneId === 'caustics'`
  in `rpg-render-draw.ts`. No other zone is affected.
- New module: `src/render/rpg/terrain/caustics-overlay.ts`.

### Remaining Caustics work as of build #140 (superseded notes)

The following items from the original build #140 Caustics pass have since been addressed:

- ~~**Custom seafloor terrain generator**~~ — Completed in build #147: `seafloorRidges` terrain
  with sinuous ridge shapes, capsule collision, nav grid integration, and hard-crest markers.
- ~~**Stronger caustic pattern quality**~~ — Completed in builds #148 and #149: replaced ellipses
  with Bézier loops (#148), then replaced those with the cached Voronoi/Worley F2−F1 tile system
  (#149). Two distinct tile variants and intensity mask added in build #150.

The following remain as optional future enhancements (not blocking):

- **Optional water-distortion postprocess**: A subtle per-row pixel shift (readback) could
  produce a convincing water distortion effect, but requires `getImageData`/`putImageData`
  and must be carefully profiled on mobile before enabling.
- **Fish movement refinements**: Fish schools in `rpg-procedural-update.ts` could have
  Caustics-specific boid parameters (slower drift, more separation near seafloor terrain).
- **Jellyfish-specific behavior**: A Caustics-specific bell-pulse and tentacle draw pass could
  improve Jellyfish visual identity in the zone.
- **Underwater current lanes**: Environmental flow mechanics that push fish/bullets in a slow
  horizontal current when Caustics is active.

---



### What was implemented

- **Per-zone current wave persisted**: `currentWaveByZone: Record<RpgZoneId, number>` added to
  `RpgSimState` and saved to save data (v27+). `currentWaveByZone` is now owned by
  `rpgSimState` (not a local variable in `rpg-render.ts`). `setCurrentWave` syncs back to
  `rpgSimState` on every wave transition. Switching zones saves/restores each zone's wave.
  Reloading the page resumes from the last active wave per zone. Backward-compatible: old
  saves default all zones to wave 0.
- **Zone terrain/visual profile hooks**: `getRpgZoneTerrainProfile(zoneId)` helper added to
  `rpg-zone-definitions.ts`. Returns `{ terrainProfile, visualProfile }` from the zone
  definition. Future zone-rendering code should call this to dispatch terrain and background
  generation by zone without hard-coding zone ids.
- **SAVE_VERSION**: bumped from 26 → 27.
- **Docs updated**: `docs/rpg-zone-plan.md` now includes an Implementation Status section
  reflecting the current implemented state of the zone system.

### Remaining zone work as of build #143 (superseded notes)

- **Custom zone terrain generators**: Terrain now routes by `terrainProfile`, but Impetus
  and Verdure still use first-pass stand-ins. *(Caustics was completed in build #147.)*
- **Zone-specific backgrounds/visual effects**: `visualProfile` field exists on each zone
  definition. Not yet used for rendering.
- **Horizon enemies**: Horizon has no enemies — waves complete instantly. Future task: design
  and assign Horizon-specific enemies to `rpg-zone-definitions.ts`.
- **Non-Euhedral hand-authored waves**: Impetus, Caustics, and Verdure use the procedural
  zone generator only. They do not share Euhedral's hand-authored waves 1–25.
  This is intentional — but future zones may want their own authored tutorial progressions.
- ~~**Impetus gravity fields, Caustics water distortion**~~: Caustics visuals upgraded in
  builds #148–150. Impetus gravity fields remain visual-only (force-field gameplay pending).
- **Horizon special mechanics**: Zenith, Nadir, and True subzone mechanics from the design
  doc are not yet implemented.

---

## Build #138 — Zone-aware RPG enemy spawning

### What was implemented

- **Zone-aware wave generation**: `getZoneWaveDefinition(waveNumber, zoneId)` added to
  `wave-definitions.ts`. Euhedral delegates to the existing `getWaveDefinition` (full
  roster unchanged). Other zones build waves from their zone's `enemyIds` list with
  progressive type introduction (ceil(W/3) types unlocked by wave W) and
  wave-number-scaled counts.
- **Horizon safe fallback**: Horizon has no enemies assigned yet. `getZoneWaveDefinition`
  returns empty spawns for Horizon and logs a one-time dev-mode warning to the console.
  Waves complete immediately; no crash.
- **stardust added to Euhedral**: The `stardust` enemy (prismatic cloud) was not in any
  zone definition. It has been added to Euhedral's `enemyIds` since it fits the
  mineral/crystalline theme.
- **Per-zone current wave**: Each zone now tracks its own current wave. Switching away from
  a zone saves its wave; switching back restores it. `highestWaveReachedByZone` tracking is
  unchanged.
- **Zone label format**: Fixed from `ZoneName  xWave` to `ZoneName - xWave`.



## Build #125 — Deterministic 5-biome scheduler + basalt hex terrain

### What was implemented

**Part 1: Deterministic terrain scheduler**
- `RpgTerrainKind` now includes `'none' | 'topographic' | 'recursiveSquares' | 'basalt' | 'reserved4' | 'reserved5'`.
- Added `getTerrainKindForWave(waveNumber, isBossWave)` with fixed 20-wave biome slots across each 100-wave block:
  1–20 topographic, 21–40 recursiveSquares, 41–60 basalt, 61–80 reserved4, 81–99 reserved5, 100 boss/none.
- `beginWaveTerrain()` now returns `TopographicTerrainState | null` and dispatches deterministically by wave number instead of 50/50 RNG.
- Boss waves (and any explicit `isBossWave` call sites) resolve to `'none'`, so the arena stays open and the nav grid rebuild path uses `null` terrain.
- `reserved4` and `reserved5` currently fall back to topographic terrain with an inline TODO.

**Part 2: Basalt terrain module** (`src/render/rpg/terrain/basalt-terrain.ts`)
- New deterministic basalt biome using pointy-top hex columns with seeded organic cluster boundaries.
- Each `BasaltHexCell` stores center, radius, 6 world-space corners, height, colors, appear delay, and cluster id.
- `generateBasaltTerrain(seed, waveNumber, canvasW, canvasH)` builds 1–2 offset clusters away from the player safe zone, caps total cells at 200, assigns basalt HSL fills/outlines, and precomputes shadow direction.
- `renderBasaltTerrain(ctx, basalt, growth01)` draws per-cell shadows, fills, and outlines with staggered growth alpha so taller columns appear first.

**Part 3: Terrain collision / LOS dispatch** (`topographic-terrain.ts`)
- Added optional `basalt?: BasaltTerrainState` to `TopographicTerrainState`.
- All terrain geometry helpers now dispatch basalt correctly, treating each active hex's `corners` as a solid polygon:
  - `isPointInsideTopographicTerrain`
  - `segmentIntersectsTopographicTerrain`
  - `circleIntersectsTopographicTerrain`
  - `terrainFirstIntersectionT`
  - `getTopographicTerrainSolidPolygons`
  - `signedDistanceToTerrainBoundary`
  - `pushPointOutsideTopographicTerrain`
- Basalt circle tests use a cell-center bounding-circle pre-reject before polygon-edge checks.

### Known limitations / follow-up

- **reserved4 / reserved5**: still placeholders. Waves 61–80 and 81–99 currently reuse topographic terrain. Next step: implement dedicated terrain generators/renderers for those biome slots.
- **Basalt lighting**: basalt intentionally skips the existing topographic lighting overlay. If desired later, add a dedicated basalt ambient/shadow treatment rather than reusing contour lighting.
- **Basalt debug overlay**: terrain dev mode still reports the shared topographic summary only. A basalt-specific overlay (cluster bounds, active-cell count, per-cell alpha) would help future tuning.

---

## Build #124 — Boss terrain clearing + Recursive-square terrain variant

### What was implemented

**Part 1: Boss terrain clearing (rpg-render.ts)**
- Added `clearWaveTerrainForBossFight()` — sets `topographicTerrainState = null` and rebuilds the nav grid to all-walkable. This ensures player movement, enemy pathfinding, LOS checks, weapons, and all collision code treat the arena as fully open during boss fights.
- Wired `clearWaveTerrainForBossFight()` to the `onEnterBossWave` callback in the `createBossWaveManager` call, so it fires for both normal boss-wave progression and menu-triggered boss fights.
- Normal-wave progression already skips waves divisible by 100 (boss waves) via `while (wave % 100 === 0) wave++` in `startNextWave()`. The new guard is an additional explicit layer for robustness.

**Part 2: Recursive-square terrain variant (src/render/rpg/terrain/recursive-square-terrain.ts)**
- New module: `generateRecursiveSquareTerrain(seed, waveNumber, canvasW, canvasH)` — produces a flat list of `RecursiveSquareNode[]` (parent-before-children) from seeded deterministic RNG.
- Each `RecursiveSquareNode` stores: centre, half-size, rotation angle, depth, HSL stroke color, fill alpha, line width, bounding radius, and precomputed world-space corners.
- Up to `MAX_DEPTH=4` levels of recursion.  Child squares attach to random sides of parents with configurable overlap (35–85%).  Attachment position along each side is randomised.
- Player safe-zone exclusion (70 px radius around canvas centre) and canvas-edge margin respected.
- `getSquareNodeGrowthAlpha01(depth, squareMaxDepth, growth01)` — staggered animation: root squares appear first, children follow depth-by-depth.
- `renderRecursiveSquareTerrain()` — dark fill, crisp outline with depth-scaled line width, faint glow on root/depth-1 squares, corner accent dots on root squares.

**Terrain-kind dispatch (topographic-terrain.ts)**
- Added `RpgTerrainKind = 'topographic' | 'recursiveSquares'` discriminant type.
- Added `terrainKind`, `squareNodes`, `squareMaxDepth` fields to `TopographicTerrainState`.
- `beginWaveTerrain()` picks variant 50/50 from seeded RNG — deterministic per wave/canvas size.
- All collision, LOS, and pathfinding functions dispatch on `terrainKind`:
  - `isPointInsideTopographicTerrain`
  - `segmentIntersectsTopographicTerrain`
  - `circleIntersectsTopographicTerrain` (uses bounding-circle pre-reject)
  - `terrainFirstIntersectionT`
  - `getTopographicTerrainSolidPolygons`
  - `signedDistanceToTerrainBoundary`
  - `pushPointOutsideTopographicTerrain`
  - `computeTerrainRepulsionForce` (delegates to `signedDistanceToTerrainBoundary`, no change needed)
- Recursive-square polygons use world-space corners directly (no centroid inverse-scaling).
- Topographic lighting overlay (`renderTopographyLighting`) is now skipped for `recursiveSquares` terrain.

### Known limitations / follow-up

- **Canvas coverage guard**: A `CANVAS_COVERAGE_MAX` constant is defined but not enforced. Very rarely, many large root squares + children could cover a large portion of the screen. Future improvement: count total covered area and prune trees if coverage exceeds ~35%.
- **Terrain dev overlay**: the existing `drawTerrainDevOverlay` only shows topographic data; a recursive-squares equivalent showing node bounding circles and depth labels would be useful for debugging.
- **topographic-lighting for recursiveSquares**: currently completely skipped. A future pass could add a custom lighting or ambient-shadow effect for square terrain.
- **Pathfinding grid quality**: The nav grid is built using `circleIntersectsTopographicTerrain` which now correctly handles recursive squares, but the cell size (20 px default) may be too coarse for very small child squares (halfSize < 15 px). Those squares may be passable for A* purposes even though they block collision. Not a safety issue but worth tuning.

---

## Build #123 — Obstacle-aware A* pathfinding (player auto-move + Void enemies)

### What was implemented

**New pathfinding module** (`src/render/rpg/terrain/rpg-pathfinding.ts`):
- `buildRpgNavigationGrid(terrain, widthPx, heightPx, cellSizePx?)` — builds a flat Uint8Array blocked/walkable grid once per terrain/canvas change.  Cell is blocked if its centre is inside terrain or a 12 px clearance circle overlaps it.  Default cell size 20 px.
- `findRpgPath(navGrid, startX, startY, goalX, goalY, terrain)` — 8-directional A* with binary min-heap.  No diagonal corner-cutting through blocked cells.  Blocked start/goal cells snap to nearest walkable.  Path is post-processed with a line-of-sight string-pull funnel to reduce grid zigzag.
- `getPathSteeringDirection(path, idxRef, x, y, lookaheadPx?)` — steers toward a look-ahead point along the path for smooth cornering.
- `computePathSteeredDirection(pathState, ...)` — one-call helper that manages path state + steering.
- `RpgPathState` / `createRpgPathState()` — per-entity mutable path state with throttled repathing (jitter ±20 %), stuck detection, and target-moved early repath.
- `drawRpgPathfindingDebug(ctx, enabled, navGrid, playerPath, enemyPaths)` — dev-mode overlay: blocked cells in translucent red, paths in cyan/orange, waypoint dots.

**Nav grid lifecycle** (`rpg-render.ts`):
- Grid is created on `beginWaveTerrain` (after terrain is generated) and on canvas resize.
- Stored as `rpgNavGrid` in the closure; passed to player movement and enemy update contexts via `getNavGrid()` callbacks on `PlayerMovementCtx` and `RpgEnemyCtx`.

**Player auto-move** (`rpg-player-movement.ts`):
- If there is direct line-of-sight to the nearest enemy, the player steers directly toward a goal point that respects the weapon stop range.
- If terrain blocks the direct path, `computePathSteeredDirection` is used to follow an A* path to the goal.
- Manual joystick or keyboard input clears the cached path state so A* re-runs cleanly when auto-move resumes.
- Player repathing interval: ~300 ms (`PLAYER_REPATH_MS`).

**Void enemy pathfinding** (`rpg-enemy-updates.ts`):
- `updateVoidEnemies` now uses `computePathSteeredDirection` from the pathfinding module.
- Per-enemy path states stored in `WeakMap<VoidEnemy, RpgPathState>` for automatic GC on despawn.
- Repath interval: ~600 ms default ±20 % jitter.
- Falls back to direct direction if no path is found.

**Debug visualization** (`rpg-render-draw.ts`, `rpg-render.ts`):
- Pathfinding debug is toggled with the same dev-mode toggle that controls the existing terrain debug.
- `_pathfindingDebugEnabled` flag set in `setDevMode()`.
- `drawRpgPathfindingDebug` called in `drawRpgFrame` after terrain rendering — no-op when disabled.

### What remains / follow-up

1. **More enemy types with pathfinding**: Quartz (orbiter), Ruby (fast patrol), Sunstone (orbiter), Citrine (homing), Nullstone (gravity well), Fracteryl, and all procedural enemies that directly chase the player still use `terrainAwareDirection` local steering or raw direct movement.  Each is relatively straightforward to upgrade: add a `WeakMap` path state + call `computePathSteeredDirection`.

2. **Quartz / Sunstone orbit pathfinding**: These orbit-at-range enemies would benefit from pathfinding to reach their preferred orbit radius when terrain is in the way, then revert to normal orbit behaviour once clear.

3. **Path debug improvements**: The debug view currently shows only the nav grid blocked cells — player and enemy path lines would require exposing path states through the draw context (a minor wiring change).

4. **NavGrid rebuild on terrain phase changes**: Currently the grid rebuilds on `beginWaveTerrain` and canvas resize.  If a mid-wave terrain phase change (e.g. partially grown terrain) causes noticeable AI misbehaviour, consider also rebuilding when `growth01` crosses a threshold (e.g. 0.5, 1.0).  This is not necessary today because terrain grows before enemies spawn.

5. **Cell clearance tuning**: The 12 px clearance radius is a first-pass value; adjust if enemies are routed too far from terrain edges or clip through them.

---

## Build #110 — Boss-wave stage director (bullet-hell traversal loop)

### What was implemented

**Boss stage director system** (`rpg-boss-stage-director.ts`, `rpg-boss-stage-draw.ts`):

- New `BossStageDirectorState` tracks: stage index (0–2), stage timer, corridor half-width, hazard list, wisp particles, boss-contact flash, dev-mode flag, stages-completed counter.
- `resetBossStageDirector()` called on `enterBossWave`; `advanceBossStage()` called on `teleportPlayerToSafeZone`; `deactivateBossStageDirector()` called on `exitBossWave`.
- Corridor route functions: `centerVertical` (stage 0), `sCurveRight` (stage 1), `sCurveLeft` (stage 2). Corridor narrows each stage.
- Two hazard types: `VerticalRainHazard` (streams that avoid the corridor) and `SweepBarHazard` (downward-sweeping bar with a gap that tracks the corridor).
- Hazards progress through **telegraph → active → fading** phases; telegraph flickers before becoming dangerous.
- Collision with hazards applies damage only when: player is not in the bottom safe zone, not near the boss, and not i-framing.
- `isPlayerInStageDirectorSafeZone()` is also applied to `rpg-boss-attack-update.ts` to guard special-attack collision during boss waves.
- Boss-contact flash (`BOSS_CONNECT_FLASH_MS = 500 ms`) fires on first entry into `BOSS_DAMAGE_WINDOW_RADIUS`.
- Wisp particles float along the corridor as a readable magical path guide.

**Speed scaling fix** (`rpg-render-update.ts`):
- `updateBossAttacks` now receives `deltaMs * bossSpeedMult` during boss waves, so all special-attack timers scale with the boss-speed setting.
- During boss waves the random special-attack scheduler is suppressed (boss passed as `null`); existing attacks still expire normally.

**Draw integration** (`rpg-render-draw.ts`):
- `drawBossStageDirector()` called between `drawBossProjectiles` and `drawBossAttacks`.
- Draws corridor glow fill + pulsing edge lines, wisps, rain streams, sweep bars, and boss-contact flash.
- `setStageDirLowGraphics()` registered in `setAllDrawLowGraphics()`.

**Developer debug overlay**:
- Activate with the existing dev-mode toggle in the RPG menu.
- Shows: corridor left/right bounds (green dashes), boss damage window (yellow circle), safe-zone circle (cyan), active hazard hitboxes (red), stage info text.

### What remains to tune / implement next

1. **More hazard pattern types**: rotating mandala walls, slow sine-wave bullet streams, hex-grid bolt patterns, warning lasers/gates. Framework is in place; add new `StageHazard` union members.
2. **More corridor route types**: diagonal weave, pulsing width oscillation, figure-8 patterns.
3. **Per-boss-ID stage sequences**: currently all boss IDs use the same 3-stage loop. Add a `getBossStageSequence(bossId)` lookup to vary patterns by boss.
4. **Stage-clear visual effect**: a brief screen flash / particle burst when `advanceBossStage` fires.
5. **Visible boss-HP stage chunks**: show HP bar segments aligned to stage-clear thresholds so the player can see how many traversals remain.
6. **Balanced tuning pass**: corridor widths, hazard speed per stage, rain stream count, hazard interval — these are first-pass values and may need gameplay feedback.
7. **Old boss-wave danmaku behaviour (`rpg-boss-behaviors-wave.ts`)**: the old projectile system still fires during boss waves as it is controlled by `rpg-boss-update.ts` separately. Consider whether it should be suppressed or integrated with the stage director's telegraph timing.

---


**Boss stage director system** (`rpg-boss-stage-director.ts`, `rpg-boss-stage-draw.ts`):

- New `BossStageDirectorState` tracks: stage index (0–2), stage timer, corridor half-width, hazard list, wisp particles, boss-contact flash, dev-mode flag, stages-completed counter.
- `resetBossStageDirector()` called on `enterBossWave`; `advanceBossStage()` called on `teleportPlayerToSafeZone`; `deactivateBossStageDirector()` called on `exitBossWave`.
- Corridor route functions: `centerVertical` (stage 0), `sCurveRight` (stage 1), `sCurveLeft` (stage 2). Corridor narrows each stage.
- Two hazard types: `VerticalRainHazard` (streams that avoid the corridor) and `SweepBarHazard` (downward-sweeping bar with a gap that tracks the corridor).
- Hazards progress through **telegraph → active → fading** phases; telegraph flickers before becoming dangerous.
- Collision with hazards applies damage only when: player is not in the bottom safe zone, not near the boss, and not i-framing.
- `isPlayerInStageDirectorSafeZone()` is also applied to `rpg-boss-attack-update.ts` to guard special-attack collision during boss waves.
- Boss-contact flash (`BOSS_CONNECT_FLASH_MS = 500 ms`) fires on first entry into `BOSS_DAMAGE_WINDOW_RADIUS`.
- Wisp particles float along the corridor as a readable magical path guide.

**Speed scaling fix** (`rpg-render-update.ts`):
- `updateBossAttacks` now receives `deltaMs * bossSpeedMult` during boss waves, so all special-attack timers scale with the boss-speed setting.
- During boss waves the random special-attack scheduler is suppressed (boss passed as `null`); existing attacks still expire normally.

**Draw integration** (`rpg-render-draw.ts`):
- `drawBossStageDirector()` called between `drawBossProjectiles` and `drawBossAttacks`.
- Draws corridor glow fill + pulsing edge lines, wisps, rain streams, sweep bars, and boss-contact flash.
- `setStageDirLowGraphics()` registered in `setAllDrawLowGraphics()`.

**Developer debug overlay**:
- Activate with the existing dev-mode toggle in the RPG menu.
- Shows: corridor left/right bounds (green dashes), boss damage window (yellow circle), safe-zone circle (cyan), active hazard hitboxes (red), stage info text.

### What remains to tune / implement next

1. **More hazard pattern types**: rotating mandala walls, slow sine-wave bullet streams, hex-grid bolt patterns, warning lasers/gates. Framework is in place; add new `StageHazard` union members.
2. **More corridor route types**: diagonal weave, pulsing width oscillation, figure-8 patterns.
3. **Per-boss-ID stage sequences**: currently all boss IDs use the same 3-stage loop. Add a `getBossStageSequence(bossId)` lookup to vary patterns by boss.
4. **Stage-clear visual effect**: a brief screen flash / particle burst when `advanceBossStage` fires.
5. **Visible boss-HP stage chunks**: show HP bar segments aligned to stage-clear thresholds so the player can see how many traversals remain.
6. **Balanced tuning pass**: corridor widths, hazard speed per stage, rain stream count, hazard interval — these are first-pass values and may need gameplay feedback.
7. **Old boss-wave danmaku behaviour (`rpg-boss-behaviors-wave.ts`)**: the old projectile system still fires during boss waves as it is controlled by `rpg-boss-update.ts` separately. Consider whether it should be suppressed or integrated with the stage director's telegraph timing.

---

## Build #107 — RPG wiring/plug/multiplier fixes

### Issues addressed:

**1. Additive multiplier stacking**
- `statModifiers` changed from `Map<string, number>` to `Map<string, number[]>` — multiple modifier boxes can now connect to the same weapon stat.
- `getWeaponStatMultiplier` sums all connected box levels additively: x3 + x4 = x7.
- `handleWireConnect` pushes each new modifier index into the per-stat array; `handleWireDisconnect` removes only the disconnected modifier, leaving others intact.
- Single canonical function — no duplicate connection-lookup logic elsewhere.

**2. Smaller plug circles**
- `rpg-box4-circle-plug` reduced from 12 px + 3 px padding to 6 px + 4 px padding (14 px hit area, 6 px visual).
- `rpg-weapon-source-plug` reduced from 20 px to 12 px.
- `rpg-modifier-plug` reduced from 14 px to 8 px.
- `rpg-plug-slot` reduced from 20 px to 14 px.
- Drop zones are the full stat cell (already registered via `setPlugDropHitElement`), so the smaller visual does not reduce usability.

**3. Mobile wire drag fix**
- Added `touch-action: none` to `.rpg-xp-box`, `.rpg-box5-cell`, `.rpg-box4-cell`, and `.rpg-xp-box-1`. This prevents the browser from stealing pointer events as scroll/pan gestures before `setPointerCapture` is established, which was the root cause of the "wire appears and immediately retracts" bug on touch devices.

**4. Box 1 XP input socket**
- New `playerXpIn` PlugType added to `rpg-equip-wiring-types.ts`. Accepts `xpOut` connections (max 1).
- Square purple `rpg-player-xp-in` element added at the bottom of Box 1. CSS uses 10 px visual with 2 px border-radius (square) and purple colouring to distinguish it from round plugs.
- Registered as `player:xpIn` in `rpg-stats-panel.ts`. Drop zone: the whole Box 1 element.
- When connected: `xpTargetPlayer = true` — XP reservoir drains at the same rate as modifier boxes.
- **TODO**: wire `drainAmount` into a concrete player-level or stat-boost mechanic once that system is designed. Currently acts as a valid XP sink.

### Known remaining items / optional polish:

- `xpTargetPlayer` drain currently just empties the reservoir without a player-side effect. Once a player-levelling system is designed, connect `drainAmount` to it in the `else if (xpTargetPlayer)` branch of `updateStatsPanelDom`.
- `maxOutgoing('xpOut') === 1` means the XP wire can only go to ONE target at a time. If the design intent changes to allow wiring XP to both a modifier box AND Box 1 simultaneously, `maxOutgoing` and the `xpTargetModifier`/`xpTargetPlayer` state would need updating.
- The `rpg-stats-panel.ts` `statsPanel.querySelector('.rpg-xp-box-1')` used to set the Box 1 drop zone is slightly fragile. If box 1's class name changes, update the selector or pass `xpBox1` directly through `StatsPanelDomRefs`.
- Pre-existing TypeScript errors (`Cannot find module 'vitest'`) in test files are unrelated to this build and block `tsc --noEmit`. They do not block `vite build`. No fix attempted here.

---

## Build #106 — Sharp terrace shadow fix: true layer-edge cast shadows

**Problem addressed:**
The existing `sharpCylinder` topography shadow mode was producing a quantized
blob shadow because it cast rays from every elevated cell, not just the terrace
edges.  The result was the old smooth hill shading with integer-snapped heights,
not the crisp per-layer directional shadows that reveal the stacked cylinder
structure.

**Root cause:**
`buildSharpCylinderShadowGrid` iterated all grid cells above a height threshold
and cast shadow rays from each one.  This means the entire mountain body was
participating in shadow casting, not just the cliff walls between height levels.

**Fix applied — `src/render/rpg/terrain/topographic-lighting.ts`:**

*Algorithm changed to true terrace-edge casting:*
1. Process each integer height level L from highest (`CONTOUR_LEVEL_COUNT`) to lowest (1).
2. For each cell where `Math.ceil(height) === L` (cell belongs to layer L):
   - Check the adjacent cell in the **shadow direction** (away from light).
   - If `Math.ceil(adjH) < L` → this cell is on the **shadow-side cliff edge** of terrace L.
   - If the adjacent cell is at the same or higher layer, this is interior terrain — skip it.
3. Cast a shadow ray from the cliff edge cell in the shadow direction for `ceil(heightPerLayer × shadowLengthMult × L / cellSizePx)` steps.
4. Apply shadow only to cells where `receiverH < L` (lower terrain or ground).
5. Stop the ray when it hits terrain at height ≥ L (hard occlusion by higher terrain).
6. No Gaussian blur — crisp edges are preserved.

*Tuning constants added near the function (easy to adjust):*
- `TERRACE_SHADOW_OPACITY_BASE = 0.84` — base shadow opacity, scales with `lightIntensity`.
- `TERRACE_SHADOW_TIP_OPACITY_FRAC = 0.62` — opacity fraction at the shadow tip (1.0 = no taper).

*Debug stats tracking added:*
- `sharpTerraceDebug.edgeCellsFound` — number of cliff-edge cells detected in the last build.
- `sharpTerraceDebug.rebuilds` — total number of shadow grid rebuilds.
- These are displayed in the dev overlay panel (top-left, when dev mode + lighting dev mode are active).

*Dev overlay updated:*
- New stats panel next to the light-arrow panel.
- Shows active shadow mode label (amber = sharp terrace, blue = smooth gradient).
- Shows height level count, edge cell count, rebuild count, and grid dimensions.

**Preserved behaviors:**
- `smoothGradient` mode is completely unchanged.
- UI checkbox, dispatch pipeline, settings persistence all unchanged.
- Cache invalidation triggers unchanged (mode switch, light config, canvas size, wave/seed).
- The `buildShadowGrid` smooth-mode function is untouched.

**Visual acceptance (what to expect):**
- Individual contour rings cast their own directional shadow bands.
- Shadows begin at the terrace boundary on the shadow side of the mountain.
- Shadows extend across lower terraces and the flat ground.
- Multiple overlapping bands visible (level 9 shadow is longest, level 1 is shortest).
- The mountain's lit tops are bright; only the lower terrain in each shadow cone is dark.
- No mere blocky version of the old smooth mode.

---

## Limitations and follow-up work

### 1. Edge thickness
The cliff-edge detection uses a single-pixel (1-cell) probe in the shadow direction.
On coarse grids (`LIGHT_GRID_CELL_SIZE_PX = 8`) some edges may be thin.  If individual
shadow bands are too narrow to read visually, consider also checking ±1 perpendicular cells
to widen the edge detection footprint (`edgeThickness` option requested in spec).

### 2. Sub-cell height precision
Heights are continuous floats; the edge detection uses `Math.ceil(h)` to assign integer
layers.  Cells very close to a layer boundary (e.g. `2.999` vs `3.001`) may flip between
levels frame to frame if the heightGrid is ever recalculated with minor float variation.
Currently the grid is baked once per wave so this is not a problem, but if live terrain
editing is added, consider snapping the height grid to integer layers once on build.

### 3. Light beam compatibility in sharp mode
The `drawLightBeams` function reads from the same `heightGrid` and runs for both modes.
In sharp mode the beams look reasonable but they were tuned for smooth terrain.  Once the
sharp mode is accepted as production-ready, consider a beam configuration pass for sharp mode.

### 4. Performance at very high resolution
With a `LIGHT_GRID_CELL_SIZE_PX` of 4 or smaller, the inner loop (`CONTOUR_LEVEL_COUNT ×
gridW × gridH`) grows quickly.  The current value of 8 px/cell keeps rebuild times fast.
If the grid is made finer, consider adding a coarser edge-only pre-pass or spatial hashing
to skip non-edge cells faster.

### 5. Shadow opacity at low layer numbers
Layer 1 shadows use `TERRACE_SHADOW_OPACITY_BASE × (0.5 + 1/9 × 0.5) ≈ 0.46`.  This is
intentionally softer for the lowest terrace but may be hard to read.  Increasing
`TERRACE_SHADOW_TIP_OPACITY_FRAC` or the base opacity formula can make all bands equally
vivid at the cost of contrast.

---



## Build History Summary

### Build #84 — Terrain rendering: merged contours, smooth collision, removed center dots

**Problem addressed:**
Three terrain rendering and collision quality issues were fixed:
1. Center dots removed from normal gameplay terrain rendering (dev-only toggle preserved).
2. Overlapping terrain islands now merge smoothly using a shared scalar field and
   Marching Squares contour extraction instead of separate per-island ring polygons.
3. Player and enemy terrain collision is now robust: nearest-boundary push-out
   replaces radial push, plus a new soft repulsion barrier (quadratic with depth)
   applied before the hard fail-safe prevents tunnelling and inner-ring artifacts.

**Changes made:**

**1. `src/render/rpg/terrain/topographic-terrain-field.ts` (new file)**
- Scalar field computation over the arena grid.
- Each island contributes a smooth height blob; overlapping islands combine additively.
- Marching Squares contour extraction at 9 threshold levels.
- Polyline stitching (segment graph walk) to form closed contour polylines.
- `buildMergedContours()` public API: called once per wave at generation time.
- Returns `MergedTopographicContours` with outermost `solidBoundaries` used for collision.

**2. `src/render/rpg/terrain/topographic-terrain.ts`**
- Added `IslandShapeProfile` as an exported type; `profile` field added to `TopographicTerrainIsland`.
- `computeShapeMultiplier` exported (shared between per-island ring building and field code).
- Added `MergedTopographicContours` re-export and `mergedContours` field to `TopographicTerrainState`.
- `renderTopographicTerrain` now uses merged scalar-field contours when available; falls back
  to per-island rings for legacy test states that set `mergedContours: null`.
- Center dots are only drawn inside `drawTerrainDevOverlay`, behind `terrainDevMode` flag.
- Reduced island minimum separation factor from 1.2 to 0.55 so islands can overlap and merge.
- All collision helpers updated to use merged outer boundaries:
  - `isPointInsideTopographicTerrain`
  - `segmentIntersectsTopographicTerrain`
  - `circleIntersectsTopographicTerrain`
  - `terrainFirstIntersectionT`
- New exports: `signedDistanceToTerrainBoundary`, `computeTerrainRepulsionForce`.
- `pushPointOutsideTopographicTerrain` now uses nearest-point-on-boundary logic instead of
  radial push from island centre (works correctly for concave and elongated shapes).

**3. `src/render/rpg/rpg-player-movement.ts`**
- Added soft repulsion via `computeTerrainRepulsionForce` before the existing hard push-out.
- Inward velocity component is damped when repulsion force is applied.
- Hard push-out fail-safe retained to guarantee robustness.

**4. `src/render/rpg/rpg-enemy-updates.ts`**
- `applyEnemyTerrainPushOut` now applies soft repulsion + hard fail-safe (same pattern as player).

**5. `src/render/rpg/__tests__/topographic-terrain.test.ts`**
- 28 new tests added (total 123, up from 95):
  - `generateTopographicTerrain — merged contours` (8 tests)
  - `isPointInsideTopographicTerrain — with merged contours` (3 tests)
  - `pushPointOutsideTopographicTerrain — nearest-boundary logic` (5 tests)
  - `computeTerrainRepulsionForce` (4 tests)
  - `signedDistanceToTerrainBoundary` (4 tests)
  - `terrain rendering — center dots are dev-only` (1 test)
  - `collision guarantee — no tunnelling into terrain interior` (2 tests)
- Existing tests updated: `buildSquareTerrain` now includes `mergedContours: null` and `profile`.

**Known limitations / future polish:**
- Marching Squares produces straight-line segments between grid cells; polylines are smoothed
  only by the field's continuous nature, not by explicit Bezier smoothing. Future: apply
  Catmull-Rom or cubic Bezier smoothing to contour polylines for a rounder look.
- `circleIntersectsTopographicTerrain` still uses per-island radial pre-reject before
  the polygon edge test. With merged boundaries this is a slight overestimate, but
  always conservative (no false negatives).
- Soft repulsion strength constants (0.22 for player, 0.18 for enemies) were chosen
  empirically; adjust in `rpg-player-movement.ts` / `rpg-enemy-updates.ts` for gameplay feel.
- `FIELD_CELL_SIZE = 4` produces good quality at low cost; reduce for smoother contours on
  faster hardware.


### Build #82 — Cleanup and stability pass: save v25, terrain test fix, catalog coverage, encounter tracking

**Problem addressed:**
Four small, high-confidence improvements to save consistency, test accuracy, catalog coverage, and bestiary quality.

**1. Save version bumped to v25 (`save-types.ts`)**

`SAVE_VERSION` was 24 but `sandBladeEnabled` was already documented as a v25+ field.
Bumped to 25 to make the version and comments internally consistent.
Old saves still load correctly via `?? true` default.

**2. Terrain test assertion fixed (`topographic-terrain.ts`, `topographic-terrain.test.ts`)**

- Exported `RING_POINTS = 64` from `topographic-terrain.ts`.
- Updated the test: `solidOuterPolygon.length >= RING_POINTS` instead of the weaker `>= 32`.
- The file header comment ("at least RING_POINTS vertices") now matches the assertion.

**3. Enemy catalog coverage test added (`enemy-catalog-coverage.test.ts`)**

- Exported `STANDARD_WAVE_ENEMY_IDS`, `PROCEDURAL_WAVE_ENEMY_IDS`, and `ELITE_WAVE_ENEMY_IDS`
  from `wave-definitions.ts`.
- New test file covers: hand-authored WAVE_DEFINITIONS, all standard/procedural/elite/aliven IDs.
- `boss` is the only intentional exclusion (lives in BOSS_DESCRIPTIONS).
- Fails loudly with the wave number and ID if a real enemy type is missing from the catalog.

**4. Explicit encounter tracking added (`rpg-state.ts`, save pipeline, `rpg-wave-manager.ts`, `rpg-enemies-tab.ts`)**

- Added `encounteredEnemyTypes: Set<string>` to `RpgSimState`.
- Persisted as `rpg.encounteredEnemyTypes?: string[]` (v25+ optional field).
- Recorded in `tickSpawnQueue` (wave manager) each time an enemy spawns.
- Bestiary uses the explicit set when non-empty; falls back to `highestWaveReached`-based
  visibility for old saves (empty set, wave > 0). New games start fresh as expected.
- Developer mode still shows all entries.

**5. DECISIONS.md updated** — save version corrected to 25; v25 RPG save fields documented.

**All tests pass. Typecheck clean. Build passes.**

---

### Remaining terrain limitations

1. **`terrainAwareDirection`** — Still local steering only. Concave island bays can still
   occasionally slow an enemy, though oscillation is reduced. Full path-following is deferred:
   - Options: waypoint graph, coarse flow field, or short-lived path cache.
   - Any solution should be stateless per-frame or use a bounded precomputed structure.
   - Do not implement in the same PR as visual or balance changes.

2. **Topographic polish ideas (cosmetic):**
   - Add occasional "ridge" islands: elongated with a high elongationAmount value forced.
   - Try a two-island "mountain range" cluster where islands share a nearby center.
   - Experiment with a very subtle background fill gradient (dark center) for depth.
   - Experiment with different alpha/transparency for the terrain area fill.

---



**Problem addressed:**
Completed the remaining terrain gameplay consistency gaps identified in Build #80:
vortex pull and damage acting through terrain, sunstone mines triggering/damaging through
terrain, enemy oscillation at concave corners, and weak ring-ordering test coverage.

**Vortex terrain LOS (`rpg-weapon-vortex.ts`):**

- Imported `hasTopographicTerrainLineOfSight`.
- In `applyPull`: before nudging an enemy toward the vortex, check LOS from vortex centre to
  enemy. Enemies behind a terrain island are neither pulled nor receive the post-pull push-out.
  The post-pull `pushPointOutsideTopographicTerrain` safety fallback remains for edge cases.
- In `applyVortexTickToEnemy`: requires LOS before dealing periodic damage. Added `terrain`
  parameter to the function signature; all call-sites updated.
- Boss damage: requires LOS before dealing damage.

**Sunstone mine terrain LOS (`rpg-weapon-sunstone.ts`):**

- Imported `hasTopographicTerrainLineOfSight`.
- Mine placement push-out was already in place; the new changes cover LOS for all interactive
  paths:
  - `detonateMine` → `applyAoe`: requires mine-to-target LOS before dealing blast damage.
  - `detonateMine` → boss check: requires mine-to-boss LOS.
  - `checkEnemyContact`: requires mine-to-enemy LOS before subtracting mine HP.
  - `inProximity`: requires mine-to-enemy LOS before setting `triggered = true`.
- Terrain is obtained once per mine update tick to avoid redundant calls.

**Improved `terrainAwareDirection` (`rpg-enemy-updates.ts`):**

- Replaced the simple left/right ±90° probe with a multi-angle steering probe.
- Candidate angles (relative to direct vector): ±30°, ±60°, ±90°, ±120°, 180°.
- Each candidate probes `PROBE_DIST=40 px` and is scored by:
  1. Clear probe path (unblocked beats blocked).
  2. Positive dot product with direct direction (progress toward target).
  3. Lower angular deviation (less detour).
- Returns the best candidate; if all are blocked returns least-bad so enemies do not freeze.
- Stops early once a clear path with positive progress is found (typical case: one iteration).
- This is still local steering, NOT pathfinding — stateless, cheap, no graph construction.

**Stricter ring ordering tests (`__tests__/topographic-terrain.test.ts`):**

- Added 'ring radii are monotonically increasing point-by-point across adjacent rings':
  for every seed, every island, every adjacent ring pair, every point index, `outer[j].radius ≥ inner[j].radius - 0.5 px`.
- Added 'finds an island with at least 7 rings and validates point-by-point ordering':
  searches up to 200 seeds for a 7+ ring island and validates it. Skips gracefully if none found.
- Both new tests pass for all seeds in [1, 42, 137, 999, 0xdeadbeef].

**Ruby laser terrain truncation regression (`__tests__/topographic-terrain.test.ts`):**

- New describe block: 'applyLaserBeamHitSweep — terrain truncation regression'.
- Creates a horizontal beam from (0, 100) with an island at (150, 100) half-size=30.
- Uses `terrainFirstIntersectionT` to compute truncated `tMax` (≈120 px).
- Verifies: enemy at (80, 100) receives damage; enemy at (400, 100) does NOT.
- Confirms the existing `tMax` / `isWithinBeam(tProj > tMax)` path correctly gates damage.

**All tests pass. Build passes.**

---

### Build #80 — Topographic terrain visual generation pass: shared island profiles

**Problem addressed:**
The terrain looked like glowing flower/atom doodles instead of topographic map contours.
Each ring was independently generated with its own random frequencies, phases, and center
offsets, causing rings to cross and look unrelated. Palettes were too neon, the outermost
ring was given a special thick green-style border, and islands were small with high-frequency
deformation.

**Key generation change — shared `IslandShapeProfile` per island:**

- Each island now generates one `IslandShapeProfile` (2–3 harmonics, frequencies 1–4,
  low amplitudes 0.08–0.18 / 0.03–0.08 / 0.01–0.04) plus optional elongation (0–0.28).
- All rings for the island are derived from the **same** profile: `radius(θ) = outerRadius × ringScale × shapeMultiplier(θ) × tinyPerturb`.
- Per-ring perturbation is capped at 1–2.5%, well below the radial gap between adjacent
  rings, guaranteeing **no ring crossings**.
- Removed per-ring independent `freq1/freq2/freq3` and `centerOffsetX/Y` jitter that caused
  rings to wander and cross.

**Line hierarchy (index contours):**
- Every 3rd ring (from innermost) is an **index contour**: lineWidth 1.2–1.5 px, alpha 0.70–0.88.
- Normal rings: lineWidth 0.65–1.0 px, alpha 0.42–0.70.
- Outermost ring no longer gets a special thick treatment — it's just another contour.

**Palette update (less neon, more topographic):**
- `mono`: neutral grays #c8c8c8→#585858, no glow.
- `copper`: muted warm tones #a06030→#955028, very subtle glow (4% alpha).
- `cyanTactical`: dark teal #186880→#127888, subtle glow (5% alpha) — no more bright cyan/green borders.
- Glow width reduced from 3× to 2.5× line width.

**Island sizing:**
- `outerRadius` range increased from [25, 55] to [35, 80] px for more map-like scale.
- Ring count range increased from [3, 7] to [2, 9].

**Center dots:**
- Center dots already existed only in dev mode (`terrainDevMode === true`) — confirmed dev-only.

**New tests added (all pass):**
- Rings have monotonically increasing average radii across multiple seeds.
- No NaN or negative radius values in any ring.
- Solid outer polygon has ≥ 32 points.
- At least one island is generated per call.

**All 86 tests pass. Build passes. CodeQL clean.**

---

### Remaining terrain gaps

1. **`terrainAwareDirection`** — The left/right tangent probe steer avoids direct collision but can cause oscillation at concave corners. A path-following probe would be more stable.

2. **Sunstone mines** — Mine placement and persistence are not terrain-checked (mines can be placed on terrain).

3. **Ruby laser hit sweep** — `applyLaserBeamHitSweep` uses `terrainFirstIntersectionT` for beam truncation but damage eligibility still uses a simple distance check rather than verifying the target is before the truncated endpoint.

4. **Further topographic polish ideas:**
   - Add occasional "ridge" islands: elongated with a high elongationAmount value forced.
   - Try a two-island "mountain range" cluster where islands share a nearby center.
   - Experiment with a very subtle background fill gradient (dark center) for depth.
   - Experiment with different alpha/transparency for the terrain area fill.

---

### Build #79 — Terrain consistency pass: LOS API, elite/proc push-out, blink, vortex pull

**Problem addressed:**
Completed the remaining terrain gameplay consistency gaps identified in Build #78:
centralized LOS-aware targeting, wired push-out for all elite and procedural enemy bodies,
corrected the emerald blink destination, and fixed vortex-pulled enemies entering terrain.

**LOS-aware targeting API (`rpg-targeting-types.ts`, `rpg-targeting-targets.ts`, `rpg-targeting.ts`, `rpg-render.ts`):**

- Added `TargetCollectionOptions` interface (exported from `rpg-targeting-types.ts`) with fields:
  - `originX?/originY?` — LOS check origin (defaults to mote for `collectEnemyBodyTargets`, to `(x,y)` for `findClosestEnemyFrom`)
  - `requireLineOfSight?: boolean` — when true, targets blocked by terrain are excluded
  - `includeProjectiles?: boolean` — when true, also includes flying projectiles in the target list
- Updated `collectEnemyBodyTargets(opts?)` — applies `hasTopographicTerrainLineOfSight` filter per-target when `requireLineOfSight: true`. Also handles aliven-particle LOS. When `includeProjectiles: true`, appends all projectile bodies (missiles, bolts, spikes, shards, tendrils) to the list.
- Updated `findClosestEnemyFrom(x, y, rangeSq, opts?)` — passes opts to `collectEnemyBodyTargets` with origin defaulting to `(x,y)` for LOS checks.
- Wrappers in `rpg-targeting.ts` and `rpg-render.ts` updated to pass opts through.

**Elite enemy body terrain push-out (`rpg-elite-enemy-updates-early.ts`, `rpg-elite-enemy-updates-late.ts`):**

- Added `ELITE_*_RADIUS` constants to imports.
- Added `applyEnemyTerrainPushOut(enemy, ctx.getTerrainState(), ELITE_*_RADIUS)` after every `clampEnemyToBounds` call for: Quartz, Ruby, Sunstone, Citrine (early file), and Iolite, Amethyst, Diamond (both orbit and patrol branches), Nullstone (late file).

**Procedural enemy body terrain push-out (`rpg-procedural-update.ts`):**

- Added `applyEnemyTerrainPushOut` after each movement step for:
  DustWisp, RibbonWorm (head), LanternMoth, EyeStalk, Jellyfish, ClothGhost, GearInsect, SpiderCrawler, MoteSwarm, ShadowHand.
- PlantTurret is anchored to its root position and requires no push-out.
- Imported `applyEnemyTerrainPushOut` and per-type `SIZE` constants.

**Emerald blink terrain check (`rpg-enemy-updates.ts`):**

- After the blink destination is computed and arena-clamped, `applyEnemyTerrainPushOut` is called so the enemy materialises outside any island rather than inside it.

**Vortex pull terrain fix (`rpg-weapon-vortex.ts`):**

- In `updateVortexes`, terrain is obtained once per frame.
- `applyPull` now calls `pushPointOutsideTopographicTerrain` (using a module-level scratch object to avoid per-frame allocation) to push any enemy that the gravity pull has moved into terrain back to the surface.

---

### Remaining terrain gaps

1. **`terrainAwareDirection`** — The left/right tangent probe steer avoids direct collision but can cause oscillation at concave corners. A path-following probe would be more stable.

2. **Sunstone mines** — Mine placement and persistence are not terrain-checked (mines can be placed on terrain).

3. **Ruby laser hit sweep** — `applyLaserBeamHitSweep` uses `terrainFirstIntersectionT` for beam truncation but damage eligibility still uses a simple distance check rather than verifying the target is before the truncated endpoint.

---

### Build #78 — Terrain repair and consistency pass

**Problem addressed:**
A focused repair pass on the topographic terrain integration to make collision, LOS, and weapon terrain interactions behave correctly and consistently.

**Critical bug fixed:**

- **`applyEnemyTerrainPushOut` velocity correction** (`rpg-enemy-updates.ts`) — The function was overwriting `entity.x/entity.y` with the pushed-out position before computing the push vector used to zero velocity. This made the push vector zero, so the velocity correction never ran. Fixed by capturing `oldX/oldY` before the position update and using `(newX - oldX, newY - oldY)` as the outward normal direction.

**Terrain helper improvements:**

- **`circleIntersectsTopographicTerrain`** (`terrain/topographic-terrain.ts`) — Replaced the incorrect edge-proximity check (which used `pushPointOutsideTopographicTerrain` and only caught center-inside cases) with a proper per-edge distance check using a new `pointToSegmentDistSq` helper. The test in inverse-scaled space uses `radiusPx / g` as the equivalent radius. Now correctly detects a circle that overlaps an island even when the circle centre is outside the polygon.

- **`hasTopographicTerrainLineOfSight`** (`terrain/topographic-terrain.ts`) — New exported helper: returns `true` when the straight line from `(fromX, fromY)` to `(toX, toY)` is unobstructed by terrain, and `true` when terrain is null. Used instead of repeating raw `segmentIntersectsTopographicTerrain` negation everywhere.

**Weapon terrain integration:**

- **Poison bolts** (`rpg-weapon-poison.ts`) — Added `getTerrainState?` to `PoisonWeaponCtx`. Bolt is destroyed when its movement segment intersects terrain (before enemy collision check). Track `prevX/prevY` before each step.

- **Emerald primary missiles** (`rpg-weapon-emerald.ts`) — Added `getTerrainState?` to `EmeraldWeaponCtx`. Missile fizzles (spawns equidistant sub-missiles) when movement segment crosses terrain. Homing now skips enemies with terrain between the missile and the target (LOS-aware target selection in `checkTarget`).

- **Emerald sub-missiles** (`rpg-weapon-emerald-subs.ts`) — Added `getTerrainState?` to `EmeraldSubsCtx`. Sub-missile is destroyed when movement segment crosses terrain. **AOE explosions now respect terrain LOS**: enemies with terrain between the explosion point and themselves are not damaged. Boss AOE also respects terrain LOS.

- **Chain whip** (`rpg-weapon-chain.ts`) — Added `getTerrainState?` to `ChainWeaponCtx`. Before applying contact damage from a chain node, checks that the player-to-node segment does not cross terrain. If the chain has passed through terrain, it cannot deal damage. Applies to both enemy array iteration and boss hit check.

- **Sword / sand blade** (`rpg-weapon-sword-combo-helpers.ts`) — Added `getTerrainState?` to `SwordWeaponCtx`. In `swordHitInArc`, all enemies (including boss and aliven particles) are skipped if terrain blocks the player-to-target segment. Exceptions: targets within `MELEE_TOUCH_SQ` (16px) are never blocked by terrain.

- **Sapphire companion lasers** (`rpg-weapon-ships.ts`) — Added `getTerrainState?` to `ShipWeaponCtx`. Track `prevX/prevY` before each step; destroy laser if movement segment crosses terrain.

- **Amethyst companion lasers** (`rpg-weapon-amethyst-ships.ts`) — Added `getTerrainState?` to `AmethystShipCtx`. Track `prevX/prevY` before each step; destroy laser if movement segment crosses terrain.

**Unit tests:**

- **`src/render/rpg/__tests__/topographic-terrain.test.ts`** — New test file covering:
  - `isPointInsideTopographicTerrain` with full and half growth01
  - `segmentIntersectsTopographicTerrain` crossing, missing, and growth01 cases
  - `circleIntersectsTopographicTerrain` edge-proximity detection (the previously broken case)
  - `terrainFirstIntersectionT` < 1 for a blocking ray
  - `hasTopographicTerrainLineOfSight` for blocked and clear paths



### Build #76 — Terrain integration: enemy spawn exclusion, player push-out, projectile blocking, LOS

**Problem addressed:**
The topographic terrain geometry helpers (`isPointInsideTopographicTerrain`, `segmentIntersectsTopographicTerrain`, `pushPointOutsideTopographicTerrain`) existed but were not yet wired into the live game systems.

**Changes made:**

1. **Enemy spawn exclusion** (`rpg-enemy-spawn.ts`) — already connected in a prior build via `getTopographicTerrainState()`. Verified that all spawn rejection loops call `isPointInsideTopographicTerrain`.

2. **Player push-out** (`rpg-player-movement.ts`) — After position integration and arena clamping, call `pushPointOutsideTopographicTerrain` with a margin of `half + 2` px. Growth-aware (uses `growth01` scale). Velocity component toward the island is zeroed on collision to prevent sticking. Wired via new `getTerrainState()` on `PlayerMovementCtx`.

3. **Projectile blocking** (9 files) — `segmentIntersectsTopographicTerrain` is now called after each projectile movement step. Any projectile whose segment from `(prevX, prevY)` to `(newX, newY)` crosses or enters terrain is immediately destroyed. Covered types:
   - `SapphireMissile` (`rpg-enemy-updates-basic.ts`)
   - `AmberShard` (`rpg-enemy-updates.ts`)
   - `QuartzSpike`, `RubyBolt`, `CitrineBolt` (`rpg-enemy-updates-mid.ts`)
   - `AmethystShard`, `DiamondShard`, `VoidTendril` (`rpg-enemy-updates-adv-early.ts`)
   - `FracterylShard` (`rpg-enemy-updates-adv-late.ts`)
   - `PlantProjectile` (`rpg-procedural-update.ts`) — loop converted from for-of to indexed for proper splice support

4. **Line-of-sight blocking** (`rpg-targeting-nearest.ts`) — All enemy-body targets in `findClosestTarget` and `findClosestEnemy` are now filtered through a `isLosBlocked(terrain, mx, my, ex, ey)` helper. Projectile/shard/bolt targets remain always targetable (they're flying at the player and need to be destroyable regardless of terrain position). Wired via `getTerrainState()` on `RpgTargetingCtx`.

5. **Context wiring** (`rpg-render.ts`, `rpg-targeting-types.ts`, `rpg-player-movement.ts`, `rpg-enemy-updates.ts`, `rpg-wave-manager.ts`) — Added `getTerrainState(): TopographicTerrainState | null` method to the relevant context interfaces; rpg-render.ts provides `() => topographicTerrainState` for each.

---

### Build #75 — Topographic terrain geometry helpers and refactor


**Problem addressed:**
The enemy bestiary (Enemies tab in the RPG overlay) was missing all 11 procedurally-animated enemy types. This build adds them to the catalog and renders them with animated previews.

**Changes made:**

1. **`rpg-enemies-catalog-types.ts`** — Added optional `category: EnemyCategory` field (`'standard' | 'elite' | 'aliven' | 'procedural' | 'boss'`) to `EnemyCatalogEntry`.

2. **`rpg-enemies-catalog-entries.ts`** — Added all 11 proc enemy entries to `ENEMY_CATALOG`:
   - `proc_dustwisp`, `proc_ribbonworm`, `proc_lanternmoth`, `proc_eyestalk`, `proc_jellyfish`
   - `proc_clothghost`, `proc_plantturret`, `proc_gearinsect`, `proc_spidercrawler`
   - `proc_moteswarm`, `proc_shadowhand`
   - All have `firstWave: 26` except `proc_shadowhand` (firstWave: 32), reflecting actual first encounter in procedural waves.

3. **`rpg-enemies-tab-icons.ts`** — Added `createProcIconCanvas(entry)` function that reuses the real gameplay draw functions (`drawDustWispEnemies`, etc.) to render animated previews in the 40×40 icon box. Each proc type gets a lightweight preview state object with advancing animation phases via RAF.

4. **`rpg-enemies-tab.ts`** — Updated `buildEnemyEntry` to detect `proc_*` entries and use `createProcIconCanvas` instead of the static icon renderer.

5. **`wave-definitions.ts`** — Replaced the stale 13-enemy comment block with a comprehensive listing of all enemy categories (standard, elite, aliven, procedural, boss) with accurate wave thresholds.

6. **`rpg-procedural-types.ts`** — Fixed stale wave comments: the per-type "wave N+" figures now note the generator threshold vs actual first-encounter wave (26 for all except shadowhand at 32).

**Encounter tracking decision:**
The existing passive system (`highestWaveReached >= entry.firstWave`) is retained. It works correctly now that all proc enemies have accurate `firstWave` values:
- Proc enemies with firstWave=26 become visible once the player reaches wave 26.
- Proc enemies only spawn in procedural waves (26+), so highestWaveReached=26 correctly coincides with first encounter.
- No risk of showing enemies the player hasn't actually seen.

**Projectiles not added:**
`PlantProjectile` (the only projectile emitted by proc creatures) is intentionally excluded from the encounter list. It is a transient combat hazard, not a named enemy the player would track in a bestiary. This matches the design intent of all other projectile types (sapphire missiles, amber shards, nullstone tendrils, etc.), none of which appear in the catalog.

---

## Open / Remaining Work

### Encounter tracking — explicit markEnemyEncountered
The current passive system unlocks enemy catalog entries once `highestWaveReached >= firstWave`. This works correctly for the current set of enemies.

A more explicit `markEnemyEncountered(enemyTypeId: string)` approach (stored in rpgState, called from `spawnEnemyById`) would allow:
- Showing only enemies the player has literally seen in this playthrough.
- Richer per-type unlock data (first-seen wave, kill count, etc.).

To implement:
1. Add `encounteredEnemyTypes: Set<string>` to `RpgSimState` (default: empty set).
2. Serialize it in save-types.ts (bump save version).
3. In `rpg-enemy-spawn.ts / spawnEnemyById`, call `ctx.markEncountered(enemyTypeId)`.
4. In `rpg-enemies-tab.ts`, replace the `highestWaveReached >= firstWave` check with `encounteredEnemyTypes.has(entry.id)`.
5. Dev mode: show all entries regardless.

### Pre-defined waves vs proc creature thresholds
The procedural generator introduces proc_dustwisp at waveNumber >= 5, but pre-defined waves 1–25 don't include any proc creatures. This means proc creatures effectively start at wave 26.

Options:
- **Status quo (current)**: Accept that proc creatures start at wave 26. Bestiary correctly reflects this.
- **Add proc creatures to pre-defined waves**: Could add 1× proc_dustwisp to wave 5, 1× proc_ribbonworm to wave 7, etc. This would expose players to proc creatures earlier and match the generator intent. Would require gameplay testing to ensure difficulty curve is acceptable.

If taking the second option: update the `firstWave` values in ENEMY_CATALOG accordingly and add entries to WAVE_DEFINITIONS.

### Validation / test assertion
A lightweight dev-time assertion could check that every `enemyTypeId` used in `WAVE_DEFINITIONS` and in the procedural generator has a corresponding `ENEMY_CATALOG` entry. Example:

```ts
// In a dev build or test file:
import { WAVE_DEFINITIONS, getWaveDefinition } from './wave-definitions';
import { ENEMY_CATALOG } from '../../ui/panels/rpg-enemies-catalog';

const catalogIds = new Set(ENEMY_CATALOG.map(e => e.id));
for (const wave of WAVE_DEFINITIONS) {
  for (const spawn of wave.spawns) {
    if (!catalogIds.has(spawn.enemyTypeId) && spawn.enemyTypeId !== 'boss') {
      console.warn(`Missing catalog entry for: ${spawn.enemyTypeId}`);
    }
  }
}
```

This could be added as a dev-mode startup check in `rpg-enemies-tab.ts` or as a unit test.

---

**Auto-move melee range bug fix:**
- `PLAYER_BASE_RANGE_PX=50` was used as the default stop distance even though the sand blade only reaches 30px (getSwordLength(1)).
- New policy: when `sandBladeEnabled` and no diamond blade equipped, auto-move stops at `getSwordLength(1) × AUTO_MOVE_MELEE_STOP_MARGIN (0.82) ≈ 24.6px`, well inside actual swing reach.
- Added `AUTO_MOVE_MELEE_STOP_MARGIN` and `AUTO_MOVE_CHAIN_WHIP_STOP_PX` constants to `rpg-constants.ts`.
- Added detailed comments in `rpg-player-movement.ts` explaining the stop-distance policy.

**Quartz whip auto-move:**
- Quartz whip now uses `AUTO_MOVE_CHAIN_WHIP_STOP_PX = 10px` as its stop range, making the player advance very close to the enemy for reliable whip contact.

**Sand blade Enable/Disable toggle:**
- Added `sandBladeEnabled: boolean` to `RpgSimState` (defaults to `true`).
- Added `toggle_sand_blade` action, handled in `app-actions.ts`.
- Sand blade card now appears at the top of the RPG weapons tab with Enable/Disable toggle.
- When disabled: sand blade does not auto-attack and auto-move does not use melee stop distance.
- Save/load: persisted as `sandBladeEnabled` (v25+ optional field, defaults to `true` on old saves).

**Ruby enemy damage-number coloring fix:**
- `spawnHitVisualsAt` previously hardcoded `'#ffffff'` for all damage numbers.
- Now passes the `color` parameter (enemy glow color, e.g., `RUBY_ENEMY_GLOW`) through to the damage number.
- Ruby enemy hits now correctly show pale ruby-colored damage numbers.

**Gradient damage numbers:**
- Added optional `sourceColor?: string` to `DamageNumber` interface.
- `spawnDamageNumber`, `spawnHitVisualsAt`, `spawnHitVisuals` all accept optional `sourceColor`.
- `drawDamageNumbers` creates a `CanvasGradient` from `sourceColor` (weapon/top) to `color` (enemy/bottom) when `sourceColor` is present.
- `performSingleAttack` uses `effectiveSourceColor` = weapon tier color (from `TIER_BY_ID`) to enable gradient.
- Gradient reads: sand/gold → ruby for sand blade hits on ruby enemies; ruby red → quartz blue for ruby laser on quartz enemies; etc.

**Save version note:**
- `sandBladeEnabled` added as optional v25+ field. Save version constant not bumped (backward-compatible via `?? true`).

---

### Build #65 — RPG wiring, XP reservoir, multiplier boxes, stat multipliers

**Box 1 — Equipment by wire:**
- Weapons placed in weapon slots are now only **active in combat if a Box 1 wire connects to that slot**.
- Legacy fallback: if no Box 1 wires exist, all equipped weapons remain active (backward-compatible with existing saves).
- `RpgStatsPanelHandle` exposes `isSlotEquippedByWire(slotIdx)` and `hasAnyEquipWire()`.
- `getEffectiveEquippedIds()` in `rpg-render.ts` filters by wire state.

**Box 2 — XP reservoir:**
- Newly-earned XP now accumulates in `rpgSimState.xpReservoir` (Box 2 display).
- Box 2 shows reservoir XP (unallocated), not total lifetime XP.
- When Box 2 is connected to a modifier box, XP drains each frame at `max(50, reservoir × 1.5)` XP/sec.

**Boxes 3/4/5 — Multiplier boxes:**
- Each has Roman numeral (I/II/III) in the top-left corner, a progress bar, and level text (x1, x2, etc.).
- XP cost: `50 × 5^(level − 1)` — level 1→2: 50 XP, level 2→3: 250 XP, etc.
- `tickMultiplierXpProgress` in `rpg-state-xp.ts` handles overflow levelling.
- Progress bars and level text update in the stats panel each second.

**Stat multipliers in combat:**
- Modifier out → weapon stat socket wires tracked in stats panel `statModifiers` map.
- `getWeaponStatMultiplier(slotIdx, statKey)` returns the box level (1 = no effect).
- `rpg-render.ts` exposes `getWeaponAtkMultiplier/SpdMultiplier/RngMultiplier/PrcMultiplier(weaponId)`.
- `WeaponTickCtx.getWeaponSpdMultiplier` divides scaled cooldown by SPD multiplier.
- `RpgPlayerAttackCtx` applies ATK × damage, RNG × range, PRC × pierce ratio (clamped to 1).
- Stat cells in Boxes 7–11 display effective (multiplied) values in purple when boosted.

**Save/load:**
- `SAVE_VERSION` bumped to 24.
- New optional fields `xpReservoir` and `multiplierBoxes` in `SaveData.rpg`.
- Defaults on old saves: `xpReservoir = 0`, `multiplierBoxes = [{level:1, progressXp:0} × 3]`.

**Wire state note:**
Wire connections are **ephemeral** (reset on page load). They are not currently persisted.
The player must reconnect wires after a page reload. Future work could persist wire state.

---

### Build #59 — Achievement system audit & repair
Added 4 new equation mastery achievements; fixed all_bosses_at_speed to require all 10 bosses; added kills_all_regular_types condition; renamed sec_first_blood_max displayName; fixed RPG comment ranges; added 5 consistency audit tests; corrected VISIBLE_TIER_COUNT comment; renamed full_spectrum and eq_tier_13 displayNames; added policy and intentional-duplicate comments throughout.

### Build #4 — AlivenParticle enemy system
Implemented the full AlivenParticle swarm-enemy system: 7 variants (spark_cluster, shard_bloom, ember_drift, dasher, ghost, pulser, healer, splitter, spitter, orbiter), per-group lifecycle, specials, ghost phase, trails, and initial draw.

### Build #11 — Balance Forecast dev panel
Implemented the dev-only ⚖ Balance Forecast panel (Settings tab, dev mode). Static ETA analysis, fresh-run milestone simulation, four strategy comparisons (wait_only / cheapest_first / best_efficiency / rush_next_tier), and pacing warnings.

### Build #24 — Forge/Loom capture economy
3-tap heat system for the equation forge (`ForgeCrunchState`, `tapForgeHeat`), sacrifice pathway (`applyForgeSacrifice` at 10,000 mass/upgrade), loom capture conversion (`applyLoomCapture`, `getLoomInputTierId`, `tryUpgradeLoomEfficiency`), `ForgeFieldInfo`/`applyForgeFieldForces`, particle `isCaptured` field, save-version 23.

### Build #25 — Economy balance pass + polish
Lowered sacrifice threshold (10,000→2,000), loom conversion cost (100→50), efficiency scaling (5ˣ→3ˣ); non-sand looms now produce 10% passive motes. Added forge heat UI row, loom field aura visuals.

### Build #26 — Forge/Loom economy polish
- Verified and documented the forge sacrifice pathway vs legacy crunch pathway (no conflict).
- Fixed loom efficiency button showing wrong tier's mote balance.
- Added forge sacrifice flash (`drawForgeSacrificeFlash`, 600ms shockwave ring).
- Expanded forge tap radius for touch input (1.5× via `isTouchInput` flag).
- Added loom capture audio feedback (400ms cooldown gate on `onMotesMerged`).
- Cleaned loom button inline styles → CSS classes.
- Added Vitest; 18 unit tests for forge/loom economy logic.

### Build #27 — Aliven polish, architecture cleanup, forecast improvements
- **Removed** dead `tap_equation_forge` action type and no-op dispatch case.
- **Extracted** `FORGE_TOUCH_TAP_MULTIPLIER = 1.5` constant to `particle-config.ts`.
- **Aliven — overlap separation**: lightweight O(n²) repulsion pass (capped at `ALIVEN_SEPARATION_MAX_COUNT = 16`).
- **Aliven — pulser shockwave ring**: expanding ring visual for 350ms when pulser fires (`pulserFlashMs` on particle).
- **Aliven — splitter burst**: flash ring at split position for 300ms (`splitFlashMs/X/Y` on group).
- **Aliven — healer beam**: dashed faint line from healer to healed target for 280ms (`healBeamMs/TargetX/Y` on particle).
- **Aliven — centroid glow**: subtle glow behind the group centroid (proportional to health ratio).
- **Aliven — spitter bullet highlight**: white center dot on bullets for dodge readability.
- **Aliven — group health bar**: thin 22px bar above centroid showing aliveCount/targetCount.
- **Lucky mote fallback**: `trySpawnLuckyMote` now falls back to direct `TIER_BY_ID` lookup if `enemyTypeId` is not in `ENEMY_TYPE_TO_TIER` (handles Aliven groups using tier IDs directly). 6 new unit tests added.
- **Balance Forecast — cost-growth warnings**: `generatePacingWarnings` now flags loom upgrade cost jumps > `suspiciousCostGrowthMultiplier` (25×) between adjacent levels.
- **Balance Forecast — simulate from current state**: toggle checkbox in the panel; when checked, strategy runs start from the player's current resources/unlocks instead of a fresh run.

### Build #28 — Aliven indicator, wave pacing, group cap, performance
- **Aliven i-frame interface**: added `setPlayerIFramesMs(ms)` to `AlivenUpdateCtx` interface and wired the setter in `rpg-render.ts`. Spitter bullet hits already granted i-frames via `dealContactDamageToPlayer`; the setter makes the contract explicit and enables future callers to grant i-frames without triggering damage.
- **Aliven indicator integration**: `drawEnemyIndicators` now accepts an `alivenGroups` parameter and draws a tier-colored marker at each living group's centroid. Updated call site in `rpg-render-draw.ts`.
- **Hand-authored early Aliven wave appearances**: added Aliven spawns to `WAVE_DEFINITIONS` waves 2–25, introducing variants one at a time:
  - Wave 2–4: `aliven_spark_cluster` (spitter swarm, first encounter)
  - Wave 5–6: `aliven_quartz_ghost` (ghost/invulnerability mechanic)
  - Wave 7–10: `aliven_shard_bloom` (dasher aggression)
  - Wave 12–13: `aliven_pulse_swarm` (AoE shockwave mechanic)
  - Wave 15–16: `aliven_ember_ring` (trail-emitting movement reading)
  - Wave 18–19: `aliven_void_splinters` (splitter death cascade)
  - Wave 22–23: `aliven_healer_nodes` (teach prioritising healers)
  - Waves 24–25: mixed spark_cluster / void_splinters (combined challenge)
  - Procedural generator (wave 26+) continues to mix all unlocked variants.
- **Global Aliven group cap**: added `MAX_ACTIVE_ALIVEN_GROUPS = 8` to `rpg-aliven-constants.ts`; `spawnEnemyById` skips the spawn if the cap is reached, protecting mobile performance.
- **`applyForgeFieldForces` optimization**: pre-computed per-field squared radii and forge-check flags outside the particle loop; switched inner-loop distance comparison to squared-distance to avoid `Math.sqrt` for most particles.

### Build #29 — Dev playtesting panel, auto-tap upgrades, SVG forecast timeline
- **Dev playtesting panel** (`src/ui/panels/dev-panel.ts`): added a new "🔬 Playtesting Tools" section in Settings (visible only when Developer Mode is on):
  - RPG wave-jump buttons for waves 2, 5, 8, 12, 15, 18, 22, 25, 26.
  - Aliven spawn controls: per-variant spawn buttons, spawn-cap-count (8 groups) bulk button, clear-all button, live active group count display.
  - Forge state snapshot: heat tap count, crunch active flag, sacrifice progress per tier.
  - Loom state table: level, efficiency level, conversion progress, and special-purchased status for each unlocked loom.
  - Aliven balance validation table: hpBase, atkBase, xpMult, particleCount, specialKind, cooldown range for every variant; warns on bad constants (negative HP/ATK/XP, specialCdMin > specialCdMax).
- **Dev hooks wiring**: `RpgRender` gained `devSpawnAliven(variantId)`, `devClearAliven()`, `getAlivenGroupCount()`; `SettingsPanel` gained `registerDevHooks(hooks)`; game-app.ts wires hooks immediately after rpgRender is created.
- **Auto-tap upgrade** (`upgrade-catalog.ts`): added `AUTO_TAP_UPGRADE` (`id: 'auto_tap_speed'`, `tierId: 'sand'`, `baseCost: 50`, `costScaleFactor: 3`, `maxLevel: 13`). Level 1 unlocks auto-tap at 5 000 ms; each subsequent level reduces the interval by 400 ms down to the 200 ms hard floor. Compatible with existing saves (no prior catalog entry, so autoTapLevel was always 0). Balance Forecast picks it up automatically via `ALL_UPGRADES`.
- **Balance Forecast — SVG strategy timeline**: added `renderStrategyTimeline` function and a "📈 Strategy Timeline (Approximate)" section below the Strategy Comparison table. Renders each milestone as a dot on a shared time axis, one color per strategy. Tooltips show exact time. No extra dependencies.

### Build #30 — Session telemetry for dev playtesting
- **Session telemetry module** (`src/dev/session-telemetry.ts`): new pure-TypeScript module with no browser dependencies. Tracks session-level counters for forge, loom, and Aliven economies. Displayed only in the dev panel (Developer Mode on). Never persisted.
  - Forge: crunches completed, zero-particle crunches, mass sacrificed by tier, equation upgrades from sacrifice by tier, derived avg mass/crunch.
  - Loom: captures by input tier, captured mass by tier, output motes produced by tier, efficiency upgrades purchased, passive motes produced by non-sand tiers.
  - Aliven: spawned/killed by variant, cap skips, peak simultaneous group count, player damage from contact (including pulser AoE), player damage from bullets, bullets fired by variant.
- **Telemetry wiring**: counters are incremented at the actual call sites, not inferred from UI:
  - `game-state.ts` → `applyForgeSacrifice` (crunch + per-tier mass + upgrades gained), `processLoomCapture` (captures + mass + motes out), `tryUpgradeLoomEfficiencyAction` (efficiency upgrade), `simTick` (non-sand passive motes).
  - `loom-state.ts` → `applyLoomCapture` now returns `number` (motes produced) instead of `void`.
  - `rpg-enemy-spawn.ts` → Aliven group push (spawn + peak count) and cap-guard early-return (cap skip).
  - `rpg-aliven-updates.ts` → `tickContact` (contact damage), `tickPulser` (AoE contact damage), `tickSpitter` (bullet fired), `tickBullets` bullet-hit branch (bullet damage).
  - `rpg-wave-dead-enemies.ts` → Aliven group removal loop (kill by variant).
- **Dev panel update** (`src/ui/panels/dev-panel.ts`): added a "Session Telemetry" section after the Aliven Balance Table containing a "Reset Session Telemetry" button and three compact tables (forge, loom, Aliven). Telemetry refreshes whenever the dev panel refreshes.
- **Tests** (`src/dev/session-telemetry.test.ts`): 35 new Vitest unit tests covering reset, counter increments, unknown-key robustness, snapshot isolation, and `getAvgSacrificePerCrunch` edge cases. All 59 tests pass (35 new + 24 pre-existing).

---

## Current Remaining Work

### Build #73 follow-up — Remaining RPG polish items

**Auto-move edge cases still to verify:**
- Wall/corner enemy scenarios: manual verification recommended on enemies pinned to the arena boundary or a corner. The margin should absorb most cases but extreme corner pinning may need additional path-seeking if issues persist.
- The `_findNearestEnemy` implementation returns the closest enemy regardless of whether the player can reach it. If a wall prevents approach to that enemy, no pathfinding correction currently exists. A potential future improvement: fall back to the second-nearest enemy if movement doesn't reduce distance to the nearest for several frames.

**Gradient damage numbers — partial coverage:**
- The `spawnHitVisualsAt` / `performSingleAttack` path supports gradients fully.
- The following weapon paths use solid color only (no gradient) because enemy type is not readily accessible at the call site:
  - `performMultiAttack` — uses hardcoded `'#50b464'` as both fill and hit color.
  - `performAoeAttack` — uses fixed aoe color.
  - Sand gatling collisions (`rpg-weapon-sand-collision.ts`) — uses `SAND_PROJ_COLOR`.
  - Emerald missile, poison bolt, sunstone mine — use weapon-specific colors.
  - Sword combo direct hits (`swordHitInArc`) — use `SWORD_COLOR` or `SAND_BLADE_COLORS`.
- Future improvement: thread per-enemy glow colors through weapon-specific collision handlers or use a centralized `getEnemyGlowColor(enemy)` helper.

**Sand blade — diamond blade interaction:**
- When `diamond_bastion` is equipped, the sand blade is automatically suppressed. The sand blade card in the weapons tab does not explicitly call this out. Future UX: show a small label "Suppressed by Diamond Blade" when diamond_bastion is equipped.

**Sand blade tier:**
- The sand blade is always tier 1 in the auto-move stop calculation. If a future mechanic upgrades the sand blade's reach, `getSwordLength(1)` should be updated to reflect the current sand blade tier.

**Multi-attack sourceColor:**
- `performMultiAttack` was not updated with per-enemy `sourceColor`. All multi-attack numbers show solid `'#50b464'`. To fix: add an `shotColor` parameter to `performMultiAttack` and look up per-enemy glow colors (or accept it per call from `performWeaponAttack`).


- **Manual verification recommended:** Run a gameplay session that includes normal movement, heavy combat, and explosion-rich waves to confirm fluid wake/fade behavior is visually identical before/after the extraction.
- **Deferred low-risk optimization:** Consider squared-distance comparisons in some fluid speed checks only if profiling indicates `Math.sqrt` cost is meaningful on target mobile devices.
- **Deferred structural refactor candidates:** `src/render/rpg/rpg-render.ts` (~991 LOC) and `src/render/particles/particle-system.ts` (~503 LOC) remain large and should be split further in focused passes.
- **Validation caveat:** Repository lint still reports pre-existing `prefer-const` errors in `src/render/rpg/rpg-render.ts` (lines 252, 253, 254, 255, 277, 278) unrelated to this fluid extraction.

### Build #51 follow-up (wave dead-enemy modularization pass)
- **Manual verification recommended:** Play a run with standard enemies, elite enemies, Aliven groups, and a boss defeat to confirm XP, lucky-mote drops, secret flags, and cleanup timing remain identical.
- **Deferred structural refactor candidates:** `src/render/rpg/rpg-render.ts`, `src/render/particles/particle-system.ts`, and `src/render/background/substrate-effect.ts` remain high-size files for future safe extraction passes.

### Build #52 follow-up (laser beam modularization pass)
- **Manual verification recommended:** Test ruby laser beam against early, advanced, elite, and boss targets to confirm beam-hit thresholds, damage numbers, and hit effects remain unchanged.
- **Deferred structural refactor candidates:** `src/render/rpg/rpg-render.ts`, `src/render/particles/particle-system.ts`, and `src/render/background/substrate-effect.ts` remain high-size files for future safe extraction passes.

### Build #53 — Forge renderer extraction + rpg-render lint fixes
- Fixed 6 pre-existing `prefer-const` lint errors in `rpg-render.ts` (added `eslint-disable-next-line` for the `let x!: T` definite-assignment idiom where TypeScript does not allow `const`).
- Extracted private draw helpers from `forge-renderer.ts` (431 lines) to `forge-renderer-draw.ts` (~230 lines), reducing main file to ~200 lines. Helpers moved: `drawForgeBackgroundGlow`, `drawForgeHeatRings`, `drawForgeInfluenceSwirl`, `drawForgeSprite`, `drawForgeFallback`, `drawLoomAura` (renamed from `_drawLoomAura`), plus `FORGE_FIRE_COLORS`.
- Updated `file_index.md` with new `forge-renderer-draw.ts` entry.

### Build #54 — Achievement condition extraction
- Extracted `isConditionMet` (~260 lines, 35 condition cases) from `achievement-state.ts` to `achievement-conditions.ts`.
- `achievement-state.ts` reduced from 421 → ~160 lines; focuses on state types, factory, and claim/bonus API.
- `achievement-conditions.ts` is ~270 lines: pure condition evaluation, no state mutation.
- Updated `file_index.md`.

### Build #55 — Enemy indicator extraction
- Extracted `drawEnemyIndicators` from `rpg-enemy-draw.ts` to new `rpg-enemy-indicators.ts` (~130 lines).
- Kept `rpg-render.ts` call sites unchanged by re-exporting `drawEnemyIndicators` from `rpg-enemy-draw.ts`.
- Added indicator-specific low-graphics mode setter (`setEnemyIndicatorLowGraphicsMode`) and wired it into `setLowGraphicsMode` fan-out.
- `rpg-enemy-draw.ts` reduced from ~440 → ~370 lines.
- Updated `file_index.md`.

### Build #56 — Particle system helper extraction
- Extracted loom-capture cleanup from `particle-system.ts` to `src/render/particles/particle-system-loom-capture.ts` (`processLoomCaptures`).
- Extracted forge audio-transition edge detection from `particle-system.ts` to `src/render/particles/particle-system-audio.ts` (`computeForgeAudioTransitions`).
- Preserved runtime behavior; update pipeline ordering, callback behavior, and forge event semantics remain unchanged.
- Added a reusable capture scratch `Set` in `ParticleSystem` to avoid per-frame `new Set(...)` allocation on loom-capture frames.
- Updated `file_index.md` and `performanceOptimizationDecisions.md`.

### Build #55 follow-up
- **Deferred structural refactor candidates:** `src/render/rpg/rpg-render.ts` (999 lines, mostly DI wiring), `src/render/particles/particle-glow-field.ts` (444 lines), `src/render/rpg/rpg-enemy-draw-adv.ts` (376 lines).

### Build #56 follow-up
- **Deferred structural refactor candidates:** `src/render/rpg/rpg-render.ts` (999 lines, mostly DI wiring), `src/render/background/substrate-effect.ts` (465 lines), `src/render/particles/particle-glow-field.ts` (444 lines), `src/render/rpg/rpg-enemy-draw-adv.ts` (376 lines).
- **Manual verification recommended:** During a play session with active loom fields and forge activity, confirm capture callbacks and forge audio transitions feel identical before/after extraction.

### Needs manual playtesting before claiming done
- Balance values: sacrifice threshold (2,000), loom conversion base cost (50), efficiency scaling (3ˣ), 10% passive non-sand production rate. Needs real playtesting.
- **Auto-tap upgrade feel**: first level at 50 sand motes, scaling by 3× per level — does the pacing feel right? Is 13 levels the right depth?
- **Forge 3-tap heat sequence**: does the heat UI row feel responsive? Is 3 taps the right number?
- **Forge capture and sacrifice flash timing**: does the 600ms shockwave feel satisfying?
- **Loom capture audio cooldown**: does 400ms cooldown feel right at various particle densities?
- **Loom efficiency upgrade UX**: verify the button deducts the correct tier's motes and the UI reflects it correctly.
- **Early game conversion pacing**: with a fresh save, does the sand→quartz loom feel achievable?
- **Non-sand 10% passive production feel**: does non-sand progression feel too slow without active captures?
- **Aliven group readability with new visuals**: healer beam, pulser ring, splitter burst — are they legible and not cluttered?
- **Aliven early wave pacing**: play waves 2–25 and verify each variant introduction feels readable and not overwhelming.
- **Aliven performance**: verify frame rate stays stable when 8 groups (the cap) are alive simultaneously on a mid-tier device. Use the dev panel "Spawn 8" button to test.
- **Aliven indicator markers**: verify tier-colored markers appear for Aliven group centroids (requires playing to wave 2+).
- **Aliven balance values**: `hpBase`, `atkBase`, `xpMult`, `specialCdMin/Max` values are starting points — needs real playtesting. Use the dev panel's Aliven Balance Table and Session Telemetry for reference.
- **Session telemetry panel**: verify the telemetry tables populate correctly during a real play session, and that the "Reset" button clears all counters.

### Balance Forecast — still deferred
- **RPG milestone simulation**: the engine cannot simulate RPG combat loop (wave/XP progression). Requires: player base DPS from `playerStats`, enemy HP formula per wave tier, XP per kill constant, and wave-boost multiplier growth curve. Until these values stabilise, a labeled "RPG estimate" section is deferred.
- **Timeline chart enhancements**: the SVG timeline renders dots but has no click-through or zoom. If axis labelling is hard to read at high milestone counts, consider collapsing rows to category headers. Deferred until needed.

---

## Manual Playtesting Checklist

Use this when doing a manual playtesting session. Check off what you tested.

### Dev Panel
- [ ] "🔬 Playtesting Tools" section appears in Settings only when Developer Mode is on
- [ ] Wave-jump buttons (W2 … W26) teleport the RPG to the correct wave
- [ ] Aliven spawn buttons add the correct variant; count display updates
- [ ] Spawn-8 button adds up to 8 groups (capped); cap does not overflow
- [ ] Clear Aliven button removes all active groups
- [ ] Forge state shows correct heat tap count and crunch active flag
- [ ] Loom table shows correct level and conversion progress per tier
- [ ] Aliven balance table shows all 7 variants with no unexpected warnings
- [ ] Session Telemetry section is visible below the balance table
- [ ] After a forge crunch, forge telemetry counters increment
- [ ] After capturing particles via a loom, loom capture counters increment
- [ ] After Aliven groups are spawned/killed, Aliven counters increment
- [ ] "Reset Session Telemetry" button clears all counters immediately

### Forge
- [ ] Forge 3-tap heat sequence: tapping three times triggers crunch (particles captured, sacrifice flash shown)
- [ ] Forge tap on mobile: is the touch hit area large enough?
- [ ] Forge sacrifice flash: 600ms shockwave ring visible and feels satisfying
- [ ] Forge heat UI row (equation panel): shows ● dots and count, disappears after crunch

### Looms
- [ ] Loom capture: particles sucked into loom, progress bar increments toward output mote
- [ ] Loom audio cooldown: a sound plays when particles are captured; not overwhelming
- [ ] Loom efficiency upgrade: button shows correct tier mote cost; pressing deducts and increments level
- [ ] Loom conversion threshold drops with efficiency upgrades
- [ ] Non-sand passive production: Quartz+ looms trickle motes slowly even without captures

### Auto-Tap Upgrade
- [ ] "Auto-Tap Speed" upgrade appears in the upgrades panel when sand motes ≥ 50
- [ ] Buying level 1 enables auto-tap at 5 000 ms interval (visible from equation timer)
- [ ] Each subsequent level reduces interval by 400 ms
- [ ] At level 13, auto-tap interval is at the 200 ms hard floor and the upgrade is maxed

### Aliven Enemies
- [ ] Wave 2 introduction: a `spark_cluster` group appears after the laser/quartz enemies — player can learn the swarm pattern
- [ ] Wave 5 introduction: a `quartz_ghost` group appears — ghost invulnerability is readable
- [ ] Wave 8 introduction: a `shard_bloom` group appears — dasher aggression is distinct from earlier variants
- [ ] Wave 12 introduction: a `pulse_swarm` group appears — AoE shockwave ring is visible and communicates range
- [ ] Wave 15 introduction: an `ember_ring` group appears — trail patterns are visible
- [ ] Wave 18 introduction: a `void_splinters` group appears — splitter burst visual fires on death
- [ ] Wave 22 introduction: a `healer_nodes` group appears — healer beam draws attention to the healer particle
- [ ] Overlap separation: alive particles within a group stay visually separated (not piled up)
- [ ] Pulser ring visual: a ring expands outward when a pulser fires its shockwave
- [ ] Splitter burst: a brief flash ring appears at the particle position when a splitter dies and splits
- [ ] Healer beam: a faint dashed line connects healer to the particle it just healed
- [ ] Group cap: when 8 groups are alive, no new groups spawn (wave 26+ procedural)
- [ ] Performance: frame rate stable with 8 Aliven groups alive simultaneously on a mid-tier device

### General
- [ ] Save/load: existing save (v23+) loads without errors or lost progress
- [ ] Desktop mouse: forge tap, loom interaction, equation tap all work with mouse
- [ ] Mobile touch: same flows work on a real phone (portrait and landscape)
- [ ] Tab switching: switching between Equation / Resources / Settings preserves all UI state
- [ ] Settings persistence: dev mode, visual options, sound volume all persist across reload

---

## Balance Forecast Panel Reference

Accessible only in dev mode (Settings → Developer Mode ON).

| File | Purpose |
|---|---|
| `balance-forecast-types.ts` | Shared types, `formatDuration`, warning thresholds |
| `balance-forecast-engine.ts` | Core analysis/simulation engine |
| `balance-forecast-panel.ts` | DOM panel rendering (includes SVG timeline) |
| `balance-forecast-sim.ts` | Strategy simulation runner |
| `balance-forecast-state.ts` | SimState, `createFreshSimState`, `simStateFromGame` |
| `balance-forecast-purchases.ts` | Available-purchase enumeration |
| `balance-forecast-strategies.ts` | Strategy function definitions |

**"Simulate from current state" toggle**: when checked, the Strategy Comparison table starts from your current resources/unlocks rather than a fresh game. Useful for planning which strategy would be most efficient from your current position.

**Cost-growth warnings**: the pacing warnings section now includes flags when adjacent loom upgrade costs jump by more than 25× (configurable via `BALANCE_WARNING_THRESHOLDS.suspiciousCostGrowthMultiplier`).

**SVG strategy timeline**: a simple dot-chart below the Strategy Comparison table showing when each milestone is reached per strategy. Hover a dot to see the exact time. No zoom or interactivity beyond tooltips.


---

## Build History Summary

### Build #4 — AlivenParticle enemy system
Implemented the full AlivenParticle swarm-enemy system: 7 variants (spark_cluster, shard_bloom, ember_drift, dasher, ghost, pulser, healer, splitter, spitter, orbiter), per-group lifecycle, specials, ghost phase, trails, and initial draw.

### Build #11 — Balance Forecast dev panel
Implemented the dev-only ⚖ Balance Forecast panel (Settings tab, dev mode). Static ETA analysis, fresh-run milestone simulation, four strategy comparisons (wait_only / cheapest_first / best_efficiency / rush_next_tier), and pacing warnings.

### Build #24 — Forge/Loom capture economy
3-tap heat system for the equation forge (`ForgeCrunchState`, `tapForgeHeat`), sacrifice pathway (`applyForgeSacrifice` at 10,000 mass/upgrade), loom capture conversion (`applyLoomCapture`, `getLoomInputTierId`, `tryUpgradeLoomEfficiency`), `ForgeFieldInfo`/`applyForgeFieldForces`, particle `isCaptured` field, save-version 23.

### Build #25 — Economy balance pass + polish
Lowered sacrifice threshold (10,000→2,000), loom conversion cost (100→50), efficiency scaling (5ˣ→3ˣ); non-sand looms now produce 10% passive motes. Added forge heat UI row, loom field aura visuals.

### Build #26 — Forge/Loom economy polish
- Verified and documented the forge sacrifice pathway vs legacy crunch pathway (no conflict).
- Fixed loom efficiency button showing wrong tier's mote balance.
- Added forge sacrifice flash (`drawForgeSacrificeFlash`, 600ms shockwave ring).
- Expanded forge tap radius for touch input (1.5× via `isTouchInput` flag).
- Added loom capture audio feedback (400ms cooldown gate on `onMotesMerged`).
- Cleaned loom button inline styles → CSS classes.
- Added Vitest; 18 unit tests for forge/loom economy logic.

### Build #27 — Aliven polish, architecture cleanup, forecast improvements
- **Removed** dead `tap_equation_forge` action type and no-op dispatch case.
- **Extracted** `FORGE_TOUCH_TAP_MULTIPLIER = 1.5` constant to `particle-config.ts`.
- **Aliven — overlap separation**: lightweight O(n²) repulsion pass (capped at `ALIVEN_SEPARATION_MAX_COUNT = 16`).
- **Aliven — pulser shockwave ring**: expanding ring visual for 350ms when pulser fires (`pulserFlashMs` on particle).
- **Aliven — splitter burst**: flash ring at split position for 300ms (`splitFlashMs/X/Y` on group).
- **Aliven — healer beam**: dashed faint line from healer to healed target for 280ms (`healBeamMs/TargetX/Y` on particle).
- **Aliven — centroid glow**: subtle glow behind the group centroid (proportional to health ratio).
- **Aliven — spitter bullet highlight**: white center dot on bullets for dodge readability.
- **Aliven — group health bar**: thin 22px bar above centroid showing aliveCount/targetCount.
- **Lucky mote fallback**: `trySpawnLuckyMote` now falls back to direct `TIER_BY_ID` lookup if `enemyTypeId` is not in `ENEMY_TYPE_TO_TIER` (handles Aliven groups using tier IDs directly). 6 new unit tests added.
- **Balance Forecast — cost-growth warnings**: `generatePacingWarnings` now flags loom upgrade cost jumps > `suspiciousCostGrowthMultiplier` (25×) between adjacent levels.
- **Balance Forecast — simulate from current state**: toggle checkbox in the panel; when checked, strategy runs start from the player's current resources/unlocks instead of a fresh run.

### Build #28 — Aliven indicator, wave pacing, group cap, performance
- **Aliven i-frame interface**: added `setPlayerIFramesMs(ms)` to `AlivenUpdateCtx` interface and wired the setter in `rpg-render.ts`. Spitter bullet hits already granted i-frames via `dealContactDamageToPlayer`; the setter makes the contract explicit and enables future callers to grant i-frames without triggering damage.
- **Aliven indicator integration**: `drawEnemyIndicators` now accepts an `alivenGroups` parameter and draws a tier-colored marker at each living group's centroid. Updated call site in `rpg-render-draw.ts`.
- **Hand-authored early Aliven wave appearances**: added Aliven spawns to `WAVE_DEFINITIONS` waves 2–25, introducing variants one at a time:
  - Wave 2–4: `aliven_spark_cluster` (spitter swarm, first encounter)
  - Wave 5–6: `aliven_quartz_ghost` (ghost/invulnerability mechanic)
  - Wave 7–10: `aliven_shard_bloom` (dasher aggression)
  - Wave 12–13: `aliven_pulse_swarm` (AoE shockwave mechanic)
  - Wave 15–16: `aliven_ember_ring` (trail-emitting movement reading)
  - Wave 18–19: `aliven_void_splinters` (splitter death cascade)
  - Wave 22–23: `aliven_healer_nodes` (teach prioritising healers)
  - Waves 24–25: mixed spark_cluster / void_splinters (combined challenge)
  - Procedural generator (wave 26+) continues to mix all unlocked variants.
- **Global Aliven group cap**: added `MAX_ACTIVE_ALIVEN_GROUPS = 8` to `rpg-aliven-constants.ts`; `spawnEnemyById` skips the spawn if the cap is reached, protecting mobile performance.
- **`applyForgeFieldForces` optimization**: pre-computed per-field squared radii and forge-check flags outside the particle loop; switched inner-loop distance comparison to squared-distance to avoid `Math.sqrt` for most particles.

### Build #29 — Dev playtesting panel, auto-tap upgrades, SVG forecast timeline
- **Dev playtesting panel** (`src/ui/panels/dev-panel.ts`): added a new "🔬 Playtesting Tools" section in Settings (visible only when Developer Mode is on):
  - RPG wave-jump buttons for waves 2, 5, 8, 12, 15, 18, 22, 25, 26.
  - Aliven spawn controls: per-variant spawn buttons, spawn-cap-count (8 groups) bulk button, clear-all button, live active group count display.
  - Forge state snapshot: heat tap count, crunch active flag, sacrifice progress per tier.
  - Loom state table: level, efficiency level, conversion progress, and special-purchased status for each unlocked loom.
  - Aliven balance validation table: hpBase, atkBase, xpMult, particleCount, specialKind, cooldown range for every variant; warns on bad constants (negative HP/ATK/XP, specialCdMin > specialCdMax).
- **Dev hooks wiring**: `RpgRender` gained `devSpawnAliven(variantId)`, `devClearAliven()`, `getAlivenGroupCount()`; `SettingsPanel` gained `registerDevHooks(hooks)`; game-app.ts wires hooks immediately after rpgRender is created.
- **Auto-tap upgrade** (`upgrade-catalog.ts`): added `AUTO_TAP_UPGRADE` (`id: 'auto_tap_speed'`, `tierId: 'sand'`, `baseCost: 50`, `costScaleFactor: 3`, `maxLevel: 13`). Level 1 unlocks auto-tap at 5 000 ms; each subsequent level reduces the interval by 400 ms down to the 200 ms hard floor. Compatible with existing saves (no prior catalog entry, so autoTapLevel was always 0). Balance Forecast picks it up automatically via `ALL_UPGRADES`.
- **Balance Forecast — SVG strategy timeline**: added `renderStrategyTimeline` function and a "📈 Strategy Timeline (Approximate)" section below the Strategy Comparison table. Renders each milestone as a dot on a shared time axis, one color per strategy. Tooltips show exact time. No extra dependencies.

---

## Current Remaining Work

### Needs manual playtesting before claiming done
- Balance values: sacrifice threshold (2,000), loom conversion base cost (50), efficiency scaling (3ˣ), 10% passive non-sand production rate. Needs real playtesting.
- **Auto-tap upgrade feel**: first level at 50 sand motes, scaling by 3× per level — does the pacing feel right? Is 13 levels the right depth?
- **Forge 3-tap heat sequence**: does the heat UI row feel responsive? Is 3 taps the right number?
- **Forge capture and sacrifice flash timing**: does the 600ms shockwave feel satisfying?
- **Loom capture audio cooldown**: does 400ms cooldown feel right at various particle densities?
- **Loom efficiency upgrade UX**: verify the button deducts the correct tier's motes and the UI reflects it correctly.
- **Early game conversion pacing**: with a fresh save, does the sand→quartz loom feel achievable?
- **Non-sand 10% passive production feel**: does non-sand progression feel too slow without active captures?
- **Aliven group readability with new visuals**: healer beam, pulser ring, splitter burst — are they legible and not cluttered?
- **Aliven early wave pacing**: play waves 2–25 and verify each variant introduction feels readable and not overwhelming.
- **Aliven performance**: verify frame rate stays stable when 8 groups (the cap) are alive simultaneously on a mid-tier device. Use the dev panel "Spawn 8" button to test.
- **Aliven indicator markers**: verify tier-colored markers appear for Aliven group centroids (requires playing to wave 2+).
- **Aliven balance values**: `hpBase`, `atkBase`, `xpMult`, `specialCdMin/Max` values are starting points — needs real playtesting. Use the dev panel's Aliven Balance Table for reference.

### Balance Forecast — still deferred
- **RPG milestone simulation**: the engine cannot simulate RPG combat loop (wave/XP progression). A stub DPS model needs: player base DPS from playerStats, enemy HP formula per wave tier, XP per kill constant, and how wave-boost multiplier grows. Once those numbers stabilise, add a labeled "RPG estimate" section to balance-forecast-engine.ts.
- **Timeline chart enhancements**: the SVG timeline renders dots but has no click-through or zoom. If axis labelling is hard to read at high milestone counts, consider collapsing rows to category headers.

### Telemetry (not yet implemented)
Session-counters for forge crunches, mass sacrificed by tier, loom captures by tier, Aliven spawns/kills by variant were noted as useful for balancing (Priority 2 in the original spec) but are not yet tracked. The dev panel currently shows current state, not session totals. Tracking these requires incrementing counters at call sites (`startEquationForgeCrunch`, `applyLoomCapture`, `removeDeadEnemiesImpl`). Consider adding them when balance questions become concrete enough to need data.

---

## Manual Playtesting Checklist

Use this when doing a manual playtesting session. Check off what you tested.

### Dev Panel
- [ ] "🔬 Playtesting Tools" section appears in Settings only when Developer Mode is on
- [ ] Wave-jump buttons (W2 … W26) teleport the RPG to the correct wave
- [ ] Aliven spawn buttons add the correct variant; count display updates
- [ ] Spawn-8 button adds up to 8 groups (capped); cap does not overflow
- [ ] Clear Aliven button removes all active groups
- [ ] Forge state shows correct heat tap count and crunch active flag
- [ ] Loom table shows correct level and conversion progress per tier
- [ ] Aliven balance table shows all 7 variants with no unexpected warnings

### Forge
- [ ] Forge 3-tap heat sequence: tapping three times triggers crunch (particles captured, sacrifice flash shown)
- [ ] Forge tap on mobile: is the touch hit area large enough?
- [ ] Forge sacrifice flash: 600ms shockwave ring visible and feels satisfying
- [ ] Forge heat UI row (equation panel): shows ● dots and count, disappears after crunch

### Looms
- [ ] Loom capture: particles sucked into loom, progress bar increments toward output mote
- [ ] Loom audio cooldown: a sound plays when particles are captured; not overwhelming
- [ ] Loom efficiency upgrade: button shows correct tier mote cost; pressing deducts and increments level
- [ ] Loom conversion threshold drops with efficiency upgrades
- [ ] Non-sand passive production: Quartz+ looms trickle motes slowly even without captures

### Auto-Tap Upgrade
- [ ] "Auto-Tap Speed" upgrade appears in the upgrades panel when sand motes ≥ 50
- [ ] Buying level 1 enables auto-tap at 5 000 ms interval (visible from equation timer)
- [ ] Each subsequent level reduces interval by 400 ms
- [ ] At level 13, auto-tap interval is at the 200 ms hard floor and the upgrade is maxed

### Aliven Enemies
- [ ] Wave 2 introduction: a `spark_cluster` group appears after the laser/quartz enemies — player can learn the swarm pattern
- [ ] Wave 5 introduction: a `quartz_ghost` group appears — ghost invulnerability is readable
- [ ] Wave 8 introduction: a `shard_bloom` group appears — dasher aggression is distinct from earlier variants
- [ ] Wave 12 introduction: a `pulse_swarm` group appears — AoE shockwave ring is visible and communicates range
- [ ] Wave 15 introduction: an `ember_ring` group appears — trail patterns are visible
- [ ] Wave 18 introduction: a `void_splinters` group appears — splitter burst visual fires on death
- [ ] Wave 22 introduction: a `healer_nodes` group appears — healer beam draws attention to the healer particle
- [ ] Overlap separation: alive particles within a group stay visually separated (not piled up)
- [ ] Pulser ring visual: a ring expands outward when a pulser fires its shockwave
- [ ] Splitter burst: a brief flash ring appears at the particle position when a splitter dies and splits
- [ ] Healer beam: a faint dashed line connects healer to the particle it just healed
- [ ] Group cap: when 8 groups are alive, no new groups spawn (wave 26+ procedural)
- [ ] Performance: frame rate stable with 8 Aliven groups alive simultaneously on a mid-tier device

### General
- [ ] Save/load: existing save (v23+) loads without errors or lost progress
- [ ] Desktop mouse: forge tap, loom interaction, equation tap all work with mouse
- [ ] Mobile touch: same flows work on a real phone (portrait and landscape)
- [ ] Tab switching: switching between Equation / Resources / Settings preserves all UI state
- [ ] Settings persistence: dev mode, visual options, sound volume all persist across reload

---

## Balance Forecast Panel Reference

Accessible only in dev mode (Settings → Developer Mode ON).

| File | Purpose |
|---|---|
| `balance-forecast-types.ts` | Shared types, `formatDuration`, warning thresholds |
| `balance-forecast-engine.ts` | Core analysis/simulation engine |
| `balance-forecast-panel.ts` | DOM panel rendering (includes SVG timeline) |
| `balance-forecast-sim.ts` | Strategy simulation runner |
| `balance-forecast-state.ts` | SimState, `createFreshSimState`, `simStateFromGame` |
| `balance-forecast-purchases.ts` | Available-purchase enumeration |
| `balance-forecast-strategies.ts` | Strategy function definitions |

**"Simulate from current state" toggle**: when checked, the Strategy Comparison table starts from your current resources/unlocks rather than a fresh game. Useful for planning which strategy would be most efficient from your current position.

**Cost-growth warnings**: the pacing warnings section now includes flags when adjacent loom upgrade costs jump by more than 25× (configurable via `BALANCE_WARNING_THRESHOLDS.suspiciousCostGrowthMultiplier`).

**SVG strategy timeline**: a simple dot-chart below the Strategy Comparison table showing when each milestone is reached per strategy. Hover a dot to see the exact time. No zoom or interactivity beyond tooltips.

---

## Build #86 — Topographic lighting cleanup (PR #205 follow-up)

### What was wrong

1. **`TopographicTerrainState.lightCache` typed as `object | null`** — the field was introduced but never used because the cache was stored in a module-level variable instead.  The vague `object` type gave no IDE guidance and the field was always `null`.

2. **`TopographyLightCache` did not expose grid data** — the internal `BakedTopographyLightCache` held `heightGrid`, `shadowGrid`, `lightGrid`, `cellSizePx`, `gridW`, `gridH` needed for future entity shadows, but these were private and inaccessible.

3. **`blurScalarGrid` was a box blur, not a Gaussian blur** — the PR description and comments claimed Gaussian filtering, but the implementation used uniform averaging (equal weight per tap), which is a box blur.

4. **Cache invalidation missed `paletteId`** — the palette controls the highlight/shadow/beam colours; if it ever changed without a wave reset the stale cache would render with wrong colours.

### What changed

- **New file `src/render/rpg/terrain/topographic-lighting-types.ts`**: holds `TopographyLightConfig`, `TopographyLightCache` (public surface), and `TopographyLightSamplingData` (future entity-shadow interface).  Kept separate to break the potential circular-import between `topographic-terrain.ts` and `topographic-lighting.ts`.

- **`topographic-terrain.ts`**: `lightCache?: object | null` → `lightCache: TopographyLightCache | null` (concrete type, required, initialised to `null` at construction).

- **`topographic-lighting.ts`**:
  - Removed module-level `topographyLightCache` variable; cache is now stored on `state.lightCache`.
  - `ensureTopographyLightCache` reads and writes `state.lightCache`; rebuilds on canvas-size, palette, or config change.
  - Added `paletteId` field to cache and invalidation check.
  - Added exported `getActiveTopographyLightSamplingData(state)` returning `TopographyLightSamplingData | null`.
  - Replaced `blurScalarGrid` (box blur) with `blurScalarGridGaussian` (separable Gaussian, two-pass).  Added `buildGaussianKernel(radius, sigma?)` helper.  Returns a new `Float32Array` copy even when `radius ≤ 0`.
  - Re-exports `TopographyLightConfig`, `TopographyLightCache`, `TopographyLightSamplingData` from the types file so existing callers need no import changes.

- **`file_index.md`**: updated topographic-terrain and topographic-lighting entries; added entry for new types file.

### How cache invalidation works now

| Trigger | Mechanism |
|---|---|
| New wave | New `TopographicTerrainState` object, `lightCache` starts `null` |
| Canvas resize | `existing.width/height !== targetWidth/Height` |
| Light config change | `configsMatch(existing.config, activeLightConfig)` fails |
| Palette change | `existing.paletteId !== state.paletteId` |
| Island geometry change | Handled by wave boundary (new state object) |

The cache is never rebuilt mid-frame during stable gameplay.

### What future entity shadows can safely use

Call `getActiveTopographyLightSamplingData(terrainState)` after at least one render frame to obtain a `TopographyLightSamplingData` object with:
- `lightAngle` — world-space angle the light arrives from
- `heightGrid`, `shadowGrid`, `lightGrid` — Float32Arrays (row-major, `gridW × gridH`)
- `cellSizePx`, `gridW`, `gridH` — grid geometry

Convert a world position `(wx, wy)` to grid coords with `gx = wx / cellSizePx`, `gy = wy / cellSizePx`, then bilinear-sample the relevant grid.  The arrays are the same instances held by the cache; do not mutate them.

### Remaining limitations

- The Gaussian kernel sigma is fixed at `radius * 0.5` (minimum 0.3).  Expose `shadowBlurSigma` and `heightBlurSigma` in `TopographyLightConfig` if finer control is needed.
- Entity-shadow projection itself is not yet implemented.  The architecture is ready; see `TopographyLightSamplingData` above.
- The cache signature does not track individual island IDs — if islands were ever mutated in-place within a wave (which does not happen today) the cache could go stale.  If in-wave island mutation ever becomes possible, add a `terrainRevision` counter to `TopographicTerrainState` and include it in the cache's invalidation check.


---

## Build 108 — Files Changed and Follow-up Notes

### Files changed

| File | Change |
|---|---|
| `src/buildInfo.ts` | BUILD_NUMBER 107 → 108 |
| `src/styles/canvas.css` | Added `touch-action: none` to `#canvas-container` |
| `src/app/game-app-canvas-input.ts` | Added `dispatch: ActionHandler` param; moved tap dispatch here from `setupInputListeners`; added `preventDefault` + `{ passive: false }` on `pointerdown` |
| `src/app/game-app.ts` | Removed `setupInputListeners(canvasContainer, dispatch)` call; passes `dispatch` to `wireCanvasPointerInput`; passes `settings.skipIdlePopupAtStart` to `applyIdleRewardsIfEligible` |
| `src/app/game-app-idle.ts` | Added optional `skipPopup` parameter to `applyIdleRewardsIfEligible` |
| `src/settings/settings-state.ts` | Added `skipIdlePopupAtStart: boolean` field (default `false`) |
| `src/ui/panels/settings-panel.ts` | Added "Skip idle pop up at start" toggle row |
| `src/render/rpg/terrain/topographic-terrain.ts` | `_renderMergedContours` and `_renderPerIslandRings` use opacity-only reveal (no scale) during `growing` phase |
| `DECISIONS.md` | Documented all three decisions |
| `file_index.md` | Updated affected file entries |

### Why mobile forge tapping failed

The `tap` action was dispatched from `setupInputListeners`, which listened for `pointerdown` on `canvasContainer` (a plain `<div>`). The canvas element inside it had `touch-action: none` set inline by JS and `setPointerCapture` called on `pointerdown`. On some mobile browsers, the browser's touch routing logic inspects the target element's (and its ancestors') `touch-action` before handing the touch to JS. The container div did not have `touch-action: none`, so on certain devices/browsers the touch gesture could be claimed by the browser for scroll/pan before bubbling to the container's listener, silently dropping the forge tap.

The fix: moved the dispatch inside `wireCanvasPointerInput` which already listens on `cc.canvas` itself. The canvas has `touch-action: none` and immediately calls `setPointerCapture`, making it the most reliable surface for pointer events on all platforms. Added `event.preventDefault()` to suppress synthetic mouse events that mobile browsers emit after touch (which would otherwise trigger a second tap dispatch). Also added `touch-action: none` to `#canvas-container` in CSS as a belt-and-suspenders guard.

### How topography rings now reveal

The stagger timing (`getRingGrowth01`) is unchanged — innermost ring (index 0) begins fading in as soon as `g > 0`, outermost ring (index `n-1`) completes at `g = 1`. The change: rings are now rendered at their full final geometry throughout the growing phase; `levelGrowth` is used for `globalAlpha` only, not for scaling. The result: rings pop up from the ground, innermost first, with a quick opacity transition rather than expanding outward from the centroid.

### How the skip idle popup setting is stored

Stored in `localStorage` under `equatoria_settings` (same key as all other settings). The field is `skipIdlePopupAtStart: boolean`. Default is `false`, so existing players see no behavior change. Serialised by `saveSettings(settings)` on every toggle. Loaded via `loadSettings()` → spread onto `createDefaultSettings()`, so older saves that don't include the field automatically get `false`.

### Optional polish / known open items

- **`setupInputListeners` dead code**: The function is still exported from `src/input/input-handler.ts` and `src/input/index.ts` but is no longer called anywhere. It could be removed in a future cleanup PR to avoid confusion.
- **Shrinking animation**: The mountain shrink still uses the old scale-down-from-centroid approach. The problem statement only flagged the grow direction, so this was left as-is. If the shrink should also use opacity-only, `_renderMergedContours` and `_renderPerIslandRings` would need `state.phase === 'shrinking'` branches mirroring the growing fix.
- **Mid-session idle popup**: The `skipIdlePopupAtStart` setting only suppresses the overlay at app startup. Mid-session visibility-change events (tab hidden → shown) still show the popup regardless of the setting. If the user wants to suppress ALL idle popups (not just the startup one), the setting name and logic should be revisited.
- **Pre-existing vitest typecheck failures**: `npm run typecheck` and `npm run build` both exit with code 2 due to 6 pre-existing `Cannot find module 'vitest'` errors in test files. These are not caused by build 108 changes. `vite build` itself succeeds with 293 modules transformed.


---

## Build #162 — Verdure cave walls, collision, and wall-anchored growth

### What was implemented

- Added `src/render/rpg/terrain/verdure-cave-walls.ts` with deterministic organic wall-depth generation, cached Voronoi-style rock texturing, debug drawing, wall collision queries, hard push-out, and soft repulsion.
- Wired Verdure cave wall state into `rpg-render.ts` so walls regenerate on Verdure wave start, feed the draw pipeline, and are exposed to movement/spawn systems.
- Updated `rpg-render-draw.ts` to render the new cave wall pass in Verdure and show wall debug overlays in dev mode.
- Updated `rpg-player-movement.ts` and `rpg-enemy-spawn.ts` so the player and newly spawned enemies respect Verdure wall collision.
- Updated `rpg-verdure-growth.ts` so plant roots can anchor to precomputed wall boundary points instead of only the old rectangular frame.
- Incremented `BUILD_NUMBER` to 162 and updated file index metadata.

### Deferred / follow-up notes

- **Plant anchor occupancy recycling**: anchor points are marked occupied when a plant claims them, but the occupancy is only fully reset on encounter/wave reset. A future pass can store anchor references per plant and release them immediately when plants fade out.
- **Resize/state invalidation**: Verdure wall textures are regenerated on zone/wave start and when the cached size key changes, but there is no dedicated mid-encounter resize invalidation path because the RPG arena is normally fixed-size.

---

## Build #173 — Custom gold scrollbar (global CSS)

### What was implemented

- Added global gold scrollbar styles to `src/styles/base.css` using both WebKit pseudo-elements and the Firefox `scrollbar-width` / `scrollbar-color` properties.
  - Thumb: amber/gold gradient (`rgba(255,220,120,0.9)` → `rgba(191,137,35,0.85)`), 8 px wide, fully rounded (`border-radius: 999px`), transparent 2 px padding border so the track shows through.
  - Track: transparent.
  - Hover state brightens the thumb slightly but stays muted.
  - Corner: transparent.
- Removed the "Hide scrollbars while keeping scroll functionality" block from `src/styles/panels.css` that was setting `scrollbar-width: none` / `display: none` on `#panels-container`, `#weapon-store-panel`, and `#rpg-menu-panel .rpg-menu__content`. Those containers now show the gold thumb instead of hiding scrollbars entirely.

### Deferred / future improvements

- **iOS Safari**: WebKit scrollbar pseudo-elements (`::webkit-scrollbar`) are not supported on iOS Safari; the browser always renders its own thin overlay scrollbars. No CSS-only workaround exists without a JS scroll-shadow library.
- **Tailwind/utility overflow classes**: if Tailwind is added later, `overflow-auto` / `overflow-y-auto` utility classes will also inherit the global rule automatically — no extra work needed.
- **Horizontal scrollbars** (`height: 8px`) are styled by the same rule; any element that gains `overflow-x: auto` will show a gold horizontal thumb consistently.
- **`.gold-scrollbar` utility class**: not currently needed because the `*` universal selector covers all scrollable containers. Add a `.gold-scrollbar` local class if a third-party widget ever injects its own scrollbar reset.


---

## Build #186 — RpgFieldSpace adopted in draw, spawn, wave, and input contexts

### What was implemented

- **`rpg-constants.ts`**: Updated JSDoc for `RPG_LOGICAL_WIDTH` and `RPG_LOGICAL_HEIGHT` — removed stale "letterbox/pillarbox" and "canvas backing store is always this width" language; now accurately describes the safe-core concept and extra world space behavior.

- **`rpg-enemy-spawn.ts`**:
  - Removed `dim` and `viewport` from `EnemySpawnCtx`.
  - Added `getFieldSpace(): RpgFieldSpace` to `EnemySpawnCtx`.
  - `spawnEnemyById` now derives spawn bounds from `fieldSpace.spawnBounds` for all normal/elite/procedural/polyomino enemies.
  - Boss spawning uses `fieldSpace.safeCoreBounds` with an explicit comment.

- **`rpg-wave-manager.ts`**:
  - Removed `dim` and `viewport` from `WaveManagerCtx`.
  - Added `getFieldSpace(): RpgFieldSpace`.

- **`rpg-render.ts`**:
  - `createWaveManager` call passes `getFieldSpace: () => rpgFieldSpace` instead of `dim`/`viewport`.
  - `createRpgInput` call receives `getFieldSpace: () => rpgFieldSpace`.

- **`rpg-input.ts`**:
  - Added `getFieldSpace?(): RpgFieldSpace` to `RpgInputCtx`.
  - `toCanvasCoords` now prefers `fieldSpace.screenToWorld()`, falling back to legacy getters for compatibility.

- **`rpg-render-draw.ts`**:
  - `getFieldSpace()` made required in `RpgDrawCtx` (removed `?`).
  - `drawRpgFrame` now derives all sizing (`backingW/H`, transform, `vwX/Y/W/H`) from `ctx.getFieldSpace()` — replacing legacy `getFullW/H`, `getSafeOffsetX/Y`, `getSafeScale`, and manual `safeScaleNz`/`vwX/Y` derivations.
  - Screen-darken and restart-fade overlays now fill `vwX, vwY, vwW, vwH` (full visible world) instead of the safe-core region only.
  - `drawRpgViewportDiagnostics` rewritten to derive all values from `ctx.getFieldSpace()` directly; legacy optional getters no longer needed.
  - Added `_drawFieldSpaceOverlay`: draws labelled dashed rectangle outlines in world-space coordinates for `paddedEffectBounds`, `visibleBounds`, `activeBounds`, `safeCoreBounds`, and `spawnBounds`; gated by dev mode.

- **`rpg-render-update.ts`**:
  - Binary ring enemy creation and update now uses `ctx.drawCtx.getFieldSpace().safeCoreBounds` for center position and world dimensions — instead of `ctx.enemyCtx.dim.w/h`.

- **`buildInfo.ts`**: bumped 185 → 186.

### Still deferred

The following systems still use legacy `widthPx`/`heightPx` fixed-dimension calls and should be migrated in a follow-up build:

- **`rpg-render.ts` `beginWaveTerrain()`**: passes 360×640 to terrain builders. Should use `rpgFieldSpace.visibleBounds`.
- **Terrain modules** (`topographic-terrain.ts`, `topographic-lighting.ts`, `caustics-overlay.ts`, `euhedral-hex-floor.ts`, `verdure-cave-walls.ts`): bake sizes derived from `widthPx`/`heightPx`; should accept `WorldRect` from `rpgFieldSpace`.
- **`RpgEnemyCtx`** (in `rpg-enemy-updates.ts`): still has `dim` and `viewport` fields used by `clampEnemyToBounds` and all enemy update functions. Migration requires updating the entire enemy update pipeline.
- **Terrain draw calls in `rpg-render-draw.ts`**: `renderTopographyLighting`, `drawImpetusFloorEffects`, `drawEmpowerParticles`, `drawBottomSafeZone`, `drawWaveClearBanner` still pass `widthPx`/`heightPx` (intentionally: these are safe-core UI/overlay elements or terrain already sized to the logical canvas).

## Build #185 — RpgFieldSpace centralized field-space abstraction

### What was implemented

- Added `src/render/rpg/rpgFieldSpace.ts`: the new authoritative field-space module.
  - Exports `WorldRect`, `Vec2`, `RpgFieldSpace` types.
  - Exports `computeRpgFieldSpace(args)` factory that derives all bounds from canvas CSS size, DPR, and a stable pre-computed scale. Scale is _passed in_; it does not zoom when the canvas grows.
  - Exports helpers: `rectCenteredOn`, `padRect`, `makeSpawnBounds`.
  - `worldToScreen` / `screenToWorld` closures included on the returned object.
  - Bounds produced: `visibleBounds`, `activeBounds` (= `visibleBounds`), `safeCoreBounds`, `spawnBounds` (= `activeBounds`), `paddedEffectBounds` (= `visibleBounds` + 96 world units each edge).
- Added `src/render/rpg/__tests__/rpgFieldSpace.test.ts`: regression tests for scale invariant, bounds, and coordinate helpers.
- Updated `rpg-render.ts`:
  - Imports `computeRpgFieldSpace` and `RpgFieldSpace`.
  - Declares `let rpgFieldSpace: RpgFieldSpace` initialized from the logical safe-core dimensions.
  - `doResize()` recomputes `rpgFieldSpace` at the end of every resize, using the live `containerW/H`, `rpgSafeScale`, and DPR.
  - `drawCtx` exposes `getFieldSpace: () => rpgFieldSpace` so all draw subsystems can read it.
- Updated `rpg-render-draw.ts`:
  - Imports `RpgFieldSpace` type.
  - `RpgDrawCtx` gains optional `getFieldSpace?(): RpgFieldSpace`.
  - `drawRpgViewportDiagnostics` now shows all five field-space bound rects plus the new `activeSmallerThanVisible` warning.

### Remaining legacy-bounds migration (deferred)

The field-space abstraction is wired and visible to all draw subsystems via `ctx.getFieldSpace()`. The following systems still use legacy `widthPx`/`heightPx` fixed-dimension calls and should be migrated in a follow-up build:

- **`rpg-render.ts` `beginWaveTerrain()`** (`src/render/rpg/rpg-render.ts`): passes `widthPx` / `heightPx` (360 × 640) to `buildTopographicTerrain`, `buildEuhedralTerrain`, `buildVerdureTerrain`, `buildImpetus*`, `buildNadir*`, `buildHorizonTerrain`, etc. These should receive `visibleBounds.width / height` from `rpgFieldSpace` so terrain is generated over the full visible area.
- **`topographic-terrain.ts`** (`src/render/rpg/terrain/topographic-terrain.ts`): terrain bake sizes derived from passed-in `widthPx`/`heightPx`. Should accept a `WorldRect` from `rpgFieldSpace.visibleBounds`.
- **`topographic-lighting.ts`** (`src/render/rpg/terrain/topographic-lighting.ts`): cached lighting overlay sized to `widthPx × heightPx`. Cache invalidation key should include visible bounds.
- **`caustics-overlay.ts`** (`src/render/rpg/terrain/caustics-overlay.ts`): tile grid/background layers implicitly assume 360 × 640 canvas. Should use `paddedEffectBounds`.
- **`euhedral-hex-floor.ts`** (`src/render/rpg/terrain/euhedral-hex-floor.ts`): hex floor cache sized to canvas backing store; may clip on expanded canvases. Should use `visibleBounds`.
- **`verdure-cave-walls.ts`** (`src/render/rpg/terrain/verdure-cave-walls.ts`): `_buildEdgePoints` / wall generation keyed on `widthPx × heightPx`. Should use `activeBounds`.
- **`rpg-render-draw.ts` terrain draw calls**: `drawCausticsBackground`, `drawEuhedralHexFloor`, `drawVerdureCaveWalls`, etc. pass legacy dimension arguments. Should pass field-space bounds.

Priority order for migration: terrain generation → caustics/euhedral → verdure walls → lighting cache.
