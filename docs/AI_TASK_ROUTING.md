# Equatoria Idle — AI Task Routing

Last verified: 2026-06-06 (build 230)

Routing guide for AI agents. Read `AGENTS.md` and `docs/REPO_MAP.md` first, then use this table to find the right files for your task.

---

## If asked to change UI / panels / tabs

**First inspect:** `src/ui/panels/`, `src/ui/tabs/tab-bar.ts`, `src/styles/panels.css`

**Search keywords:** `createPanel`, `dispatch`, `UIPanels`, `panelsContainer`, `setActiveTab`

**Related systems:**
- Tab switching: `src/app/app-actions.ts::setActiveTab()`
- Panel update throttle: `src/app/app-game-loop.ts` (100 ms interval check)
- DOM structure is built in `src/app/game-app.ts::startApp()`

**Common pitfalls:**
- Never mutate `GameState` from UI — dispatch a `GameAction` instead
- Panel updates are throttled to ~10 fps; HUD overlay updates every frame
- RPG tab has a separate container (`rpgContainer`) toggled by `setActiveTab`

**Verify:** `npm run typecheck` + visual inspection in browser via `npm run dev`

---

## If asked to change rendering / canvas / visual effects

**First inspect:** `src/render/` subdirectory matching the effect, `src/app/app-game-loop.ts` for render order

**Search keywords:** `drawParticles`, `clearCanvas`, `resetCanvasRenderState`, `drawBackground`, `CanvasContext`

**Related systems:**
- Idle canvas: `src/render/canvas/game-canvas.ts`, logical world 320×640
- Particle rendering: `src/render/particles/particle-renderer.ts`
- Background effects: `src/render/background/`
- Forge visuals: `src/render/forge/`
- RPG canvas: `src/render/rpg/rpg-render.ts` (fully independent canvas + loop)

**Common pitfalls:**
- Always call `resetCanvasRenderState()` after effects using transforms/alpha/blend modes
- Low-graphics mode (`settings.graphicsQuality === 'low'`) must disable glow and trails
- Idle canvas and RPG canvas have different resize paths — do not share `resizeCanvas()`
- Pixelated mode uses a low-resolution backing store; CSS `image-rendering: pixelated` is required

**Verify:** `npm run build` + live test in browser

---

## If asked to fix input / mouse / keyboard / touch behavior

**First inspect:** `src/app/game-app-canvas-input.ts`, `src/input/input-handler.ts`, `src/input/particle-drag.ts`

**Search keywords:** `wireCanvasPointerInput`, `pointermove`, `GameAction`, `flushParticleDragMove`, `DOUBLE_TAP_MAX_MS`

**Related systems:**
- Canvas input: `src/app/game-app-canvas-input.ts`
- Action dispatch: `src/app/app-actions.ts::handleAction()`
- RPG input: `src/render/rpg/rpg-input.ts`
- Particle drag: batched in `particle-drag.ts`, flushed once per frame in game loop

**Common pitfalls:**
- Pointer events use `setPointerCapture` for reliable drag tracking on mobile
- `pointermove` is batched and flushed once per frame for performance
- Double-tap detection uses `DOUBLE_TAP_MAX_MS = 350` and `DOUBLE_TAP_MAX_PX = 40`
- RPG tab has its own input handling separate from the idle canvas

**Verify:** `npm run typecheck` + test on both mouse and touch

---

## If asked to change save / load / persistence

**First inspect:** `src/settings/save-types.ts`, `src/settings/save-serialize.ts`, `src/settings/save-deserialize.ts`

**Search keywords:** `SAVE_VERSION`, `SAVE_KEY`, `SaveData`, `serializeGameState`, `deserializeGameState`

**Related systems:**
- Save trigger: `saveGame()` called in game loop (every 30s) and on visibility hidden
- Reset: `sessionStorage.setItem('equatoria_reset_pending', '1')` + `location.reload()`
- Settings: separate key `'equatoria_settings'` in `src/settings/settings-state.ts`
- Offline time: `readLastActiveTimestamp()` / `writeLastActiveTimestamp()` in `offline-time.ts`

**Common pitfalls:**
- Always increment `SAVE_VERSION` when changing `SaveData` shape
- New fields must be optional (`?`) in `SaveData` and default-safe in deserialize
- `loadGame()` returns `null` for unknown versions or parse failures — do not throw
- Crafted weapons require `registerCraftedWeapons()` call during deserialize

**Verify:** `npm run test` (save round-trip tests exist) + manual save/load test

---

## If asked to add assets / sprites / audio

**First inspect:** `src/render/assets/asset-paths.ts` (sprites), `src/audio/audio-paths.ts` (audio)

**Search keywords:** `loadImage`, `preloadAudioBuffers`, `ASSETS/`, `SPRITES/`, `sfx/`

**Related systems:**
- Sprite loading: `src/render/assets/asset-loader.ts::loadImage()`
- Audio loading: `src/audio/audio-loader.ts::preloadAudioBuffers()`
- Asset copying: `scripts/copy-assets.mjs` (runs post-build via `postbuild` script)
- Asset source: `ASSETS/` folder (not `dist/` — that's generated)

**Common pitfalls:**
- Add path constants to `asset-paths.ts` or `audio-paths.ts` — never hardcode paths in modules
- Binary assets must be in `ASSETS/` so the post-build copy script can find them
- Audio uses Web Audio API; all files are preloaded as `AudioBuffer` on startup
- `ASSETS/sfx/*/OLD/` are legacy and unused — do not reference

**Verify:** `npm run build` (copy script runs) + verify asset appears in `dist/assets/`

---

## If asked to optimize performance

**First inspect:** `src/render/particles/particle-system.ts`, `src/render/rpg/rpg-render.ts`, `src/app/app-game-loop.ts`

**Search keywords:** `perfStats`, `performance.now()`, `MAX_PARTICLES_FULL`, `forgeFieldsBuffer`, `ParticlePool`

**Related systems:**
- Perf overlay: `src/render/debug/perf-stats.ts` (enabled by dev mode)
- Particle pooling: `src/render/particles/particle-pool.ts`
- Batched pointermove: `src/input/particle-drag.ts`
- Spatial grid: `src/render/particles/spatial-grid.ts`
- RPG perf: `src/render/rpg/` enemy update files

**Common pitfalls:**
- No new allocations in the particle update loop or RPG enemy update loops
- `forgeFieldsBuffer` and `generatorRatesPerSec` are reused each frame — clear, don't recreate
- Low-graphics mode must skip glow field and trails
- `flushParticleDragMove()` runs once per frame, not per event

**Verify:** `npm run build` + enable dev mode + enable perf overlay to check frame times

---

## If asked to fix build / deploy issues

**First inspect:** `package.json`, `vite.config.ts`, `tsconfig.json`, `electron/main.cjs`

**Search keywords:** `npm run build`, `outDir`, `base`, `GITHUB_REPOSITORY`, `resolveBasePath`

**Related systems:**
- Web deploy: GitHub Pages; base path auto-detected from `GITHUB_REPOSITORY` env var
- Desktop build: `npm run build:desktop` (mode=desktop, base=`./`) + `npm run electron`
- Asset copy: `scripts/copy-assets.mjs` runs after both build variants
- Electron CSP: `electron/main.cjs` defines `productionCsp`

**Common pitfalls:**
- `npm run build` runs `tsc --noEmit` first; typecheck failures fail the build
- Desktop mode sets `base: './'` so asset paths are relative (required by Electron file:// protocol)
- `EQUATORIA_DESKTOP=1` env var triggers desktop base path even without `--mode desktop`

**Verify:** `npm run build` + `npm run test` + `npm run lint`

---

## If asked to change gameplay / economy / progression

**First inspect:** `src/sim/game-state.ts`, `src/data/balance/balance-constants.ts`, relevant sim sub-module

**Search keywords:** `simTick`, `tryPurchaseUpgrade`, `tapEquation`, `tierUnlockCost`, `getLoomRate`

**Related systems:**
- Tier unlock cost: `src/data/balance/balance-constants.ts::tierUnlockCost()`
- Loom rates: `src/data/looms/loom-definitions.ts`
- Upgrade catalog: `src/data/upgrades/upgrade-catalog.ts`
- Achievement conditions: `src/sim/achievements/achievement-conditions.ts`
- Forge sacrifice: `src/sim/game-state.ts::applyForgeSacrifice()`

**Common pitfalls:**
- Economy changes affecting save format (e.g., new resource type) require `SAVE_VERSION` bump
- Achievement conditions are checked every simTick — keep them O(1)
- Loom rate changes affect both passive production (tickLooms) and particle emit rate (game loop)
- The `bypassCost` parameter on action helpers enables dev-mode free purchases

**Verify:** `npm run test` (balance/logic tests) + `npm run typecheck`

---

## If asked to write tests

**First inspect:** `vitest.config.ts`, existing `__tests__/` folders, `src/**/*.test.ts` files

**Search keywords:** `describe`, `it`, `expect`, `vitest`, `test`

**Related systems:**
- Test runner: Vitest with node environment
- Pattern: `src/**/__tests__/*.test.ts` or `src/**/*.test.ts`
- No DOM or canvas in tests (node env only)

**Common pitfalls:**
- Do not use `document`, `window`, `HTMLElement`, or `CanvasRenderingContext2D` in tests
- Import only from `src/sim/`, `src/data/`, or `src/util/` in most tests
- RPG and UI tests that need rendering exist but are limited to pure logic helpers

**Verify:** `npm run test`

---

## If asked to add or change RPG content (enemies, weapons, zones, terrain)

**First inspect:** `src/data/rpg/`, `src/render/rpg/rpg-enemy-types.ts`, `src/render/rpg/rpg-factories*.ts`

**Search keywords:** `RpgZoneDefinition`, `WaveDefinition`, `rpg-wave-manager`, `createRpgRender`, `rpg-enemy-spawn`

**Related systems:**
- Zone definitions: `src/data/rpg/rpg-zone-definitions.ts`
- Wave definitions: `src/data/rpg/wave-definitions.ts`
- Enemy spawning: `src/render/rpg/rpg-enemy-spawn.ts`
- Factory pattern: `rpg-factories.ts` → `rpg-factories-early/mid/late.ts`
- Terrain per zone: `src/render/rpg/terrain/`
- Crafted weapons: `src/data/rpg/crafted-weapon-helpers.ts` + `crafted-weapon-types.ts`

**Common pitfalls:**
- RPG visual state is in `render/rpg/`; persistent RPG state is in `sim/rpg/rpg-state.ts`
- New persistent RPG fields require `SaveData.rpg` extension + `SAVE_VERSION` bump
- Enemy catalog (bestiary) tracks `encounteredEnemyTypes` in save data
- Boss IDs are numeric indices into the boss list, not string IDs

**Verify:** `npm run typecheck` + play-test in browser
