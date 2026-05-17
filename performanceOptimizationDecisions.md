# Performance Optimization Decisions

## This pass (Build #50) — RPG fluid refactor

### 1) Preserved allocation-free hot path during file split
- **Change made:** Extracted per-frame simulation logic from `src/render/rpg/rpg-fluid.ts` into `src/render/rpg/rpg-fluid-step.ts`, and trail batching/render loop into `src/render/rpg/rpg-fluid-render.ts`.
- **Why safe:** Public API (`createRpgFluid`, `RpgFluid`, `FluidImpulse`) and state ownership remain unchanged; extracted code uses the same loops and math with the same constants.
- **System affected:** RPG fluid background simulation and rendering.
- **Performance impact type:** Prevents regression by preserving existing no-allocation frame update behavior.

### 2) Kept pre-allocated buffers and batch arrays unchanged
- **Change made:** Continued to mutate existing `Float32Array` field buffers (`vxGrid`, `vyGrid`, `dye*`, `tmp*`), sparse occupancy array, and shared draw `_batches`.
- **Why safe:** Avoids per-frame object/array churn and keeps the same memory reuse strategy as before refactor.
- **System affected:** Fluid solver and trail renderer internals.
- **Performance impact type:** Reduces allocations / preserves GC profile.

## Performance opportunities noticed but not implemented
- `src/render/rpg/rpg-fluid-step.ts`: could replace some `Math.sqrt` comparisons with squared-magnitude checks in clamp/wake branches, but this was intentionally deferred to avoid subtle tuning shifts in activation behavior.
- `src/render/rpg/rpg-fluid-render.ts`: could cache strokeStyle strings for hue/alpha buckets, but impact is likely minor versus readability and was deferred.

## Risky optimizations intentionally avoided
- Did **not** change diffusion mix, decay constants, wake thresholds, lifetime math, or respawn distribution logic.
- Did **not** alter hue/alpha bucketing strategy or batch structure.
- Did **not** change particle counts, trail length, or quality mode behavior.

## This pass (Build #51) — RPG dead-enemy sweep modularization

### 1) Preserved sweep-order and in-place mutation behavior while splitting
- **Change made:** Split `src/render/rpg/rpg-wave-dead-enemies.ts` into an orchestrator plus `rpg-wave-dead-enemies-standard.ts` and `rpg-wave-dead-enemies-special.ts`.
- **Why safe:** Backward loop order, `splice` removal semantics, XP/lucky-mote/secret-flag side effects, and boss-resolution sequence are preserved.
- **System affected:** RPG wave dead-enemy cleanup pipeline.
- **Performance impact type:** Prevents regression by preserving existing array-mutation and traversal characteristics.

### 2) Avoided new per-frame allocations in high-frequency cleanup path
- **Change made:** Kept direct array traversal and retained module-level elite maps/constants instead of rebuilding maps in loops.
- **Why safe:** Equivalent logic with less repeated object creation potential inside elite death handling.
- **System affected:** Elite-death branch in the wave cleanup pass.
- **Performance impact type:** Reduces repeated work / avoids unnecessary allocation churn.

## Additional opportunities noticed but not implemented
- The standard dead-enemy sweep still repeats similar loop structures per enemy type; a data-driven sweep table could reduce code size further, but was deferred to avoid introducing generic indirection risk in a combat hot path.

## This pass (Build #52) — Ruby laser beam hit-sweep modularization

### 1) Preserved hit semantics while extracting repeated beam collision loops
- **Change made:** Moved the per-enemy/boss beam collision + damage sweep from `src/render/rpg/rpg-weapon-laser-beam.ts` to `src/render/rpg/rpg-weapon-laser-beam-hits.ts`.
- **Why safe:** Beam geometry (projection/perpendicular distance), damage callbacks, and hit-effect/spawn-number side effects are unchanged; only module ownership changed.
- **System affected:** RPG ruby laser-beam weapon hit resolution.
- **Performance impact type:** Preserves existing runtime characteristics while improving maintainability.

### 2) Centralized beam inclusion math into a single helper
- **Change made:** Introduced `isWithinBeam` helper in the extracted module to keep repeated projection checks consistent across enemy families.
- **Why safe:** Uses identical formulas previously copied inline, reducing drift risk without changing thresholds or constants.
- **System affected:** Laser-beam target inclusion checks.
- **Performance impact type:** Neutral to slightly positive by avoiding duplicate inline math blocks and reducing accidental future divergence.
