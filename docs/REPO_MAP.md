# Equatoria Idle — Repo Map

Last verified: 2026-06-06 (build 230)

Compact folder/file map for fast agent orientation. For per-file detail see `file_index.md`. For task routing see `docs/AI_TASK_ROUTING.md`.

## Ignore unless specifically relevant

| Path | Reason |
|---|---|
| `node_modules/` | External packages |
| `dist/` | Build output |
| `.git/` | Version control |
| `ASSETS/music/`, `ASSETS/sfx/` | Binary audio — read paths only via `src/audio/audio-paths.ts` |
| `ASSETS/SPRITES/` | Binary sprites — read paths only via `src/render/assets/asset-paths.ts` |
| `ASSETS/sfx/*/OLD/` | Unused legacy audio |
| `desktop-bat-smoke.*`, `vite-preview.*`, `electron-runtime.log` | Runtime logs |

## Top-level layout

```
equatoria_idle/
├── index.html              ← HTML shell, mounts #app, loads /src/main.ts
├── src/                    ← ALL source (HIGH VALUE)
├── ASSETS/                 ← Binary assets (sprites, audio, fonts)
├── electron/               ← Desktop wrapper
├── scripts/                ← Build post-processing
├── docs/                   ← Agent-facing docs (HIGH VALUE)
├── dist/                   ← Build output (IGNORE USUALLY)
└── node_modules/           ← Dependencies (IGNORE USUALLY)
```

## src/ folder map

| Folder | Responsibility | Signal |
|---|---|---|
| `src/app/` | Bootstrap, game loop, action dispatch, tab switching, resize | HIGH VALUE — read for any cross-system wiring |
| `src/sim/` | Authoritative game state, progression rules, sim tick | HIGH VALUE — read for any economy/state change |
| `src/data/` | Static definitions: tiers, upgrades, balance, RPG data, particle config | HIGH VALUE — read when adding content |
| `src/render/` | Canvas rendering: particles, forge, background, RPG combat, generators | HIGH VALUE for visual changes |
| `src/ui/` | DOM panels, tabs, HUD overlays, settings controls | HIGH VALUE for UI changes |
| `src/input/` | Event types (`GameAction`, `TabId`), pointer/touch wiring | Read for input changes |
| `src/audio/` | Web Audio system, music/sfx/ambiance players | Read for audio changes |
| `src/settings/` | Save/load (localStorage), offline time, settings persistence | HIGH VALUE for save/settings changes |
| `src/util/` | Number formatting, particle compression helpers | Low signal unless formatting |
| `src/dev/` | Session telemetry (dev only) | Low signal |
| `src/styles/` | CSS: layout, canvas, panels, tabs, responsive | Read for layout/style changes |

## Key source files at a glance

| File | One-line purpose |
|---|---|
| `src/main.ts` | DOM-ready → `startApp()` |
| `src/app/game-app.ts` | Full bootstrap: DOM, state, audio, loop, panels — CAUTION (very large) |
| `src/app/app-game-loop.ts` | `createGameLoop()` — per-frame sim+render pipeline |
| `src/app/app-actions.ts` | `handleAction()` — all user action routing |
| `src/app/app-types.ts` | `AppState`, `UIPanels` interfaces |
| `src/sim/game-state.ts` | `GameState`, `createGameState()`, `simTick()` — central state |
| `src/data/tiers/tier-definitions.ts` | 13 `TierId` values, `TIERS[]`, `TIER_BY_ID` |
| `src/data/balance/balance-constants.ts` | Game-feel tuning constants |
| `src/settings/save-types.ts` | `SaveData` interface, `SAVE_VERSION = 32`, `SAVE_KEY` |
| `src/settings/save-load.ts` | `saveGame()`, `loadGame()`, `deleteSave()` |
| `src/settings/settings-state.ts` | `SettingsState`, `loadSettings()`, `saveSettings()` |
| `src/render/particles/particle-system.ts` | `ParticleSystem` — idle particle orchestrator |
| `src/render/rpg/rpg-render.ts` | `createRpgRender()` — entire RPG combat canvas |
| `src/input/input-handler.ts` | `GameAction` union type, `TabId` |

## "Start here" paths by task

| Task | First file(s) |
|---|---|
| Understand game flow | `src/app/game-app.ts`, `src/app/app-game-loop.ts` |
| Add a tier | `src/data/tiers/tier-definitions.ts`, `src/data/equation/equation-tier-roles.ts` |
| Change balance | `src/data/balance/balance-constants.ts` |
| Change save format | `src/settings/save-types.ts`, `save-serialize.ts`, `save-deserialize.ts` |
| Add an upgrade | `src/data/upgrades/upgrade-catalog.ts`, `src/sim/game-state.ts::tryPurchaseUpgrade` |
| Add an achievement | `src/data/achievements/achievement-definitions.ts`, `src/sim/achievements/achievement-conditions.ts` |
| Change particle behavior | `src/data/particles/particle-config.ts`, `src/render/particles/particle-physics.ts` |
| Add RPG content | `src/data/rpg/`, `src/render/rpg/rpg-enemy-types.ts`, relevant `rpg-factories-*.ts` |
| Change UI layout | `src/ui/panels/`, `src/styles/panels.css` |

See `docs/AI_TASK_ROUTING.md` for expanded routing with pitfalls per task type.
