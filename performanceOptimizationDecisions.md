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
