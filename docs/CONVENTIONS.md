# Equatoria Idle — Conventions

Last verified: 2026-06-06 (build 230)

## Naming

| Convention | Rule | Example |
|---|---|---|
| Files | kebab-case, descriptive prefix matching its system | `rpg-enemy-updates-adv.ts`, `particle-merge.ts` |
| Interfaces | PascalCase, no `I` prefix | `GameState`, `AppState`, `EquationState` |
| Functions | camelCase verb | `createGameState`, `simTick`, `handleAction` |
| Constants | UPPER_SNAKE_CASE | `SAVE_KEY`, `MERGE_THRESHOLD`, `TIERS` |
| Type aliases | PascalCase | `TierId`, `TabId`, `SizeIndex` |
| Coordinate suffixes | append unit to variable names | `canvasWidthPx`, `deltaMs`, `angleRad`, `worldX` |
| ID string literals | lowercase-hyphen | `'sand'`, `'rpg-render'`, `'forge'` |

## Folder conventions

- `src/app/` — orchestration only; no domain logic
- `src/sim/` — pure state mutation; no DOM, canvas, audio
- `src/render/` — visual state and draw calls; no save-relevant state
- `src/ui/` — DOM panels; dispatch via `GameAction`, never mutate `GameState` directly
- `src/data/` — pure static definitions and constants; no runtime side effects
- `src/settings/` — localStorage I/O for game save and settings; no simulation logic
- Test files live alongside source as `__tests__/` subdirectories or `*.test.ts` co-located

## State/data conventions

- `GameState` is the single source of truth for all save-relevant state
- Rendering may hold transient visual state (particles, animations) that is NOT persisted
- Split large state into sub-states; aggregate in `GameState` via named fields
- New save fields must increment `SAVE_VERSION` and add optional typed field to `SaveData`
- Old saves must deserialize without crash; use `?? default` in `save-deserialize.ts`
- Settings persist separately under `'equatoria_settings'` key, not in save data

## Rendering conventions

- Idle canvas logical world: 320 × 640 px
- RPG safe core: 360 × 640 px (larger viewports reveal more, never zoom)
- Always call `resetCanvasRenderState()` after effects using transforms, alpha, or blend modes
- Prefer batched draw calls in particle and RPG renderers (one `fill()` per color group)
- Avoid per-frame object allocation in hot paths (`forgeFieldsBuffer`, `generatorRatesPerSec` are reused)
- Low-graphics mode (`settings.graphicsQuality === 'low'`) must disable glow, trails, and costly effects

## UI conventions

- All user intent flows through `dispatch(GameAction)` — never mutate `GameState` from UI directly
- Tab IDs: `'equation' | 'resources' | 'rpg' | 'achievements' | 'settings'`
- DOM panels update at ~10 fps (throttled in game loop via 100 ms interval check)
- HUD overlay updates every frame (live equation, mote count, score)
- RPG stats panel is DOM (not canvas) and updates inside `rpgRender.update()`

## Asset conventions

- Audio file paths are declared in `src/audio/audio-paths.ts` — do not hardcode paths in players
- Sprite paths are declared in `src/render/assets/asset-paths.ts` — do not hardcode in renderers
- Binary assets live under `ASSETS/` (dev source); `scripts/copy-assets.mjs` copies them to `dist/` post-build
- `ASSETS/sfx/*/OLD/` = legacy unused audio; do not reference

## Testing conventions

- Test runner: Vitest with `environment: 'node'`
- Test files match `src/**/*.test.ts` or live in `src/**/__tests__/`
- Tests cover: sim logic, save round-trips, data integrity, RPG stat math, terrain geometry
- No DOM or canvas APIs in tests (node environment)
- Run with `npm run test`

## Performance conventions

- No `new Array()`, `new Map()`, or spread operators inside per-frame loops
- Pool or pre-allocate buffers (see `ParticlePool`, `forgeFieldsBuffer`)
- Batch pointer events: buffer `pointermove` in `particle-drag.ts`, flush once per frame
- Cache locked-particle lookups; avoid linear scans of the full particle array per event
- RPG: avoid allocating new arrays inside `rpg-enemy-updates-*.ts` update loops

## Error handling conventions

- Audio failures are silently ignored (graceful degradation — no-op fallback)
- `loadGame()` returns `null` on failure; caller creates fresh state
- `saveGame()` returns `boolean`; callers may ignore failures (non-critical)
- No `throw` in save/load paths — use `try/catch` returning `null`/`false`

## Common mistakes to avoid

- Putting progression or economy logic in `render/` or `ui/` — always in `sim/`
- Adding fields to `GameState` without updating `SaveData` in `save-types.ts`
- Using `Date.now()` in per-frame code where `performance.now()` is more accurate
- Mixing CSS pixels, backing pixels, and logical game pixels without clear naming
- Calling `resizeCanvas()` in RPG mode (RPG has its own resize path via `rpgRender.resize()`)
- Forgetting to register crafted weapons via `registerCraftedWeapons()` on load
- Adding state to `AppState` that should be in `GameState` (AppState is not persisted)
