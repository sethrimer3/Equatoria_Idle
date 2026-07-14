# Equatoria Idle — Dependency Map

Last verified: 2026-06-06 (build 230)

## Module dependency hierarchy

```
data/          ← no internal dependencies (leaf layer)
  ↓
sim/           ← depends on data/ only
  ↓
render/        ← depends on sim/, data/
settings/      ← depends on sim/ (GameState type)
util/          ← standalone
audio/         ← standalone (Web Audio API only)
input/         ← standalone (DOM events + GameAction types)
  ↓
ui/            ← depends on sim/, data/, input/, render/ (RpgRender type)
  ↓
app/           ← depends on everything
```

## Critical shared modules (edit with caution)

These modules are imported widely. A signature change will cascade.

| Module | Imported by | Risk |
|---|---|---|
| `src/data/tiers/tier-definitions.ts` | sim, render, ui, data, settings | CAUTION — TierId is referenced everywhere |
| `src/sim/game-state.ts` | app, sim, settings, render/rpg | CAUTION — GameState shape drives save format |
| `src/input/input-handler.ts` (GameAction) | app, ui, render/rpg | CAUTION — union type; adding a case breaks dispatch |
| `src/render/particles/particle-system.ts` | app | Medium — only app imports it directly |
| `src/settings/save-types.ts` | settings (serialize/deserialize) | CAUTION — save format versioning |
| `src/data/particles/particle-config.ts` | render/particles, app | Medium — physics constants |
| `src/data/balance/balance-constants.ts` | sim, app | Medium — game tuning |

## sim/ internal dependencies

```
game-state.ts
  ├── equation/equation-state.ts, equation-logic.ts, equation-eval.ts
  ├── resources/resource-state.ts
  ├── progression/progression-state.ts
  ├── forge/forge-state.ts, forge-logic.ts
  ├── looms/loom-state.ts
  ├── achievements/achievement-state.ts, achievement-conditions.ts
  ├── aliven/aliven-state.ts
  └── rpg/rpg-state.ts, rpg-state-xp.ts, rpg-state-upgrades.ts
```

## render/ internal dependencies

```
render/particles/particle-system.ts
  ├── particle-types.ts, particle-pool.ts, particle-physics.ts
  ├── particle-life.ts, particle-merge.ts, particle-forge.ts
  ├── particle-shockwave.ts, particle-renderer.ts
  ├── spatial-grid.ts, particle-glow-field.ts
  └── forge-field-forces.ts

render/rpg/rpg-render.ts  (large orchestrator)
  ├── rpg-types.ts, rpg-constants.ts
  ├── rpg-encounter-collections.ts (canonical owner)
  ├── rpg-enemy-*.ts, rpg-boss-*.ts
  ├── rpg-weapon-*.ts, rpg-player-*.ts
  ├── rpg-targeting*.ts, rpg-damage.ts
  ├── rpg-wave-manager.ts
  └── terrain/*, attacks/*
```

## External libraries

| Library | Version | Purpose |
|---|---|---|
| `vite` | ^8.0.3 | Dev server + build bundler |
| `typescript` | ^6.0.2 | Type checking |
| `vitest` | ^3.2.4 | Test runner (node env) |
| `eslint` + `typescript-eslint` | ^10/^8 | Linting |
| `electron` | ^38.5.0 | Desktop wrapper (devDep; not bundled in web build) |

No runtime npm dependencies — the game uses only browser APIs (Canvas 2D, Web Audio, localStorage, requestAnimationFrame, DOM).

## Known non-circular but surprising dependencies

- `src/sim/game-state.ts` imports `src/dev/session-telemetry.ts` — telemetry is embedded in sim tick, not app layer
- `src/render/rpg/rpg-render.ts` does NOT import `src/sim/game-state.ts` directly; it receives `RpgSimState` as a parameter via `createRpgRender(container, rpgState, callbacks)`
- `src/app/game-app.ts` imports `src/render/assets/refined-gem-preload.ts` for eager sprite loading before the game loop starts
- `src/data/rpg/crafted-weapon-helpers.ts` maintains a runtime `WEAPON_BY_ID` registry that must be populated via `registerCraftedWeapons()` after loading saves

## Circular dependency risk areas

No confirmed circular dependencies found. Potential risk:
- `sim/looms/loom-state.ts` ↔ `sim/resources/resource-state.ts` (both import each other's types) — currently resolved by importing only functions, not the module itself
- RPG weapon systems: `rpg-weapon-systems.ts` aggregates many weapon modules; adding cross-weapon imports there would risk cycles
- `rpg-player-attack.ts` and `rpg-weapon-systems.ts` inherit `RpgEncounterCollections`; the renderer
  supplies the same owner and one-time direct aliases, while readiness remains a separate Node-safe
  policy in `rpg-player-attack-readiness.ts`.
