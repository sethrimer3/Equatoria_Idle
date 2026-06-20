# Equatoria Idle — File Guide

Last verified: 2026-06-06 (build 230)

Per-file responsibilities grouped by system. For full-size file index see `file_index.md` at repo root. For folder-level map see `docs/REPO_MAP.md`.

Legend: **CAUTION** = many dependents or fragile; **SAFE** = low blast radius; **IGNORE** = generated/asset/legacy

---

## src/app/ — Orchestration

| File | Responsibility | Edit risk |
|---|---|---|
| `game-app.ts` | `startApp()` — full bootstrap: DOM, audio, loop, panels | CAUTION — very large, many wiring paths |
| `app-game-loop.ts` | `createGameLoop()` — per-frame sim+render+autosave | CAUTION — update order matters |
| `app-actions.ts` | `handleAction()` + `setActiveTab()` + `updateVisiblePanels()` | CAUTION — central dispatch |
| `app-types.ts` | `AppState`, `UIPanels` interfaces | CAUTION — shape used in loop and actions |
| `render/legacy/forge-equation-preview-legacy.ts` | Retired forge equation-preview bridge | Never import at runtime |
| `game-app-canvas-input.ts` | `wireCanvasPointerInput()` — pointer/touch input wiring | Medium |
| `game-app-idle.ts` | `applyIdleRewardsIfEligible()` — offline reward queue | SAFE |

## src/sim/ — Simulation State

| File | Responsibility | Key exports |
|---|---|---|
| `game-state.ts` | `GameState`, `createGameState()`, `simTick()`, all action helpers | CAUTION |
| `equation/equation-state.ts` | Equation segment state, tap counters | `EquationState`, `createEquationState` |
| `equation/equation-logic.ts` | Tap gain calculation, upgrade application | `computeTapGains`, `applyEquationUpgrade` |
| `equation/equation-eval.ts` | `getEquivalence()` | score from resources |
| `render/legacy/equation-term-view-legacy.ts` | Retired `EquationTermView` and structured equation display | Never import at runtime |
| `resources/resource-state.ts` | `ResourceState`, mote add/spend/get | `addMotes`, `spendMotes`, `getMotes` |
| `progression/progression-state.ts` | Upgrade levels, auto-tap, global multiplier | `purchaseUpgrade`, `getAutoTapIntervalMs` |
| `forge/forge-state.ts` | `ForgeCrunchState`, heat taps, warm-up timer | `tapForgeHeat`, `tickForgeWarmup` |
| `forge/forge-logic.ts` | `updateForgeCrunch()` — crunch trigger logic | Used by particle-forge.ts |
| `looms/loom-state.ts` | `LoomState`, passive production, capture conversion | `tickLooms`, `applyLoomCapture` |
| `achievements/achievement-state.ts` | `AchievementState`, unlocked/claimed sets | `checkAndUnlockAchievements` |
| `achievements/achievement-conditions.ts` | Per-achievement check logic | SAFE — add new conditions here |
| `aliven/aliven-state.ts` | `AlivenState` — alivened tiers, interaction matrix | `tryAliven` |
| `rpg/rpg-state.ts` | `RpgSimState` — persistent RPG progression, weapons, XP | CAUTION — large, drives save |
| `particles/generator-state.ts` | `GeneratorState`, generator positions | `createGeneratorState`, `computeGeneratorPositions` |
| `idle/apply-idle-rewards.ts` | Offline mote batching and queue population | Called by `game-app-idle.ts` |

## src/data/ — Static Definitions

| File | Responsibility | Key exports |
|---|---|---|
| `tiers/tier-definitions.ts` | 13-tier enum, colors, order | `TierId`, `TIERS`, `TIER_BY_ID` |
| `balance/balance-constants.ts` | All game-feel tuning constants | `BASE_TAP_VALUE`, `MAX_OFFLINE_HOURS`, etc. |
| `particles/particle-config.ts` | Physics constants, forge radii, particle cap | `FORGE_RADIUS`, `MAX_PARTICLES_FULL` |
| `particles/size-tiers.ts` | Size index helpers, `MERGE_THRESHOLD` | `getSizeSmallEquivalent`, `SMALL_SIZE_INDEX` |
| `particles/interaction-matrix.ts` | Default Particle Life matrix | `createDefaultInteractionMatrix` |
| `upgrades/upgrade-catalog.ts` | All equation/idle upgrade definitions | `UPGRADE_BY_ID` |
| `looms/loom-definitions.ts` | Loom cost/rate formulas | `getLoomRate`, `getLoomCost` |
| `equation/equation-tier-roles.ts` | Maps `TierId` → equation role | Drives equation structure |
| `rpg/weapon-definitions.ts` | Base weapon catalog | `WEAPON_BY_ID` — CAUTION: crafted weapons registered here too |
| `rpg/rpg-upgrade-definitions.ts` | RPG upgrade catalog | `RPG_UPGRADE_BY_ID` |
| `rpg/boss-midi-parser.ts` | Pure Type-0/Type-1 MIDI note normalization for boss attack schedules | SAFE |
| `rpg/boss-midi-scheduler.ts` | Deterministic elapsed-time note scheduler with reset/seek helpers | SAFE |
| `rpg/boss-midi-config.ts` | Boss MIDI asset and note/channel/velocity mapping config | SAFE |
| `rpg/crafted-weapon-helpers.ts` | Crafted weapon creation, registration, resolver | `registerCraftedWeapons()`, `resolveWeaponDefinition()` |
| `rpg/equipment-modifiers.ts` | Pure lens/weave combat-facing aggregation | No DOM/render imports |
| `rpg/equipment-rewards.ts` | Zone-aware lens/weave drop tables and reward roll constants | Pure helper; keep drop rates here |
| `achievements/achievement-definitions.ts` | All achievement definitions | `ACHIEVEMENT_BY_ID` |

## src/render/ — Rendering

| File | Responsibility | Notes |
|---|---|---|
| `canvas/game-canvas.ts` | `createGameCanvas()`, `resizeCanvas()` | Creates idle canvas element |
| `particles/particle-system.ts` | `ParticleSystem` class — idle particle orchestrator | CAUTION — many callbacks |
| `particles/particle-types.ts` | `EquatoriaParticle`, `ActiveMerge`, `Shockwave` | Type definitions |
| `particles/particle-renderer.ts` | `drawParticles()` — batched canvas draw | Hot path |
| `particles/forge-field-forces.ts` | `ForgeFieldInfo`, capture-only loom/forge field checks | No attraction or steering |
| `particles/legacy/loom-forge-attraction-legacy.ts` | Removed normal-mote loom/forge attraction history | Never import at runtime |
| `forge/forge-renderer.ts` | `drawForge()`, `drawForgeCrunch()` | Forge visual |
| `generators/generator-renderer.ts` | `drawGenerators()`, sprite management | Preloads sprites |
| `background/background-animation.ts` | `createBackgroundAnimation()` — ring animation | Non-idle, always-on |
| `background/vermiculate-effect.ts` | Vermiculate background pattern | Optional, high-perf |
| `background/substrate-effect.ts` | Substrate background pattern | Optional |
| `rpg/rpg-render.ts` | `createRpgRender()` — full RPG combat canvas | CAUTION — very large |
| `rpg/rpg-boss-midi-runtime.ts` | Boss-only MIDI asset loading/cache and adapter into existing boss attacks | Medium |
| `rpg/rpg-constants.ts` | RPG layout constants: logical size, player init | `RPG_LOGICAL_WIDTH/HEIGHT` |
| `rpg/rpg-types.ts` | RPG entity types: `RpgMote`, `LaserEnemy`, etc. | Type definitions |
| `rpg/rpg-wave-manager.ts` | Wave state machine | Drives enemy spawning |
| `rpg/terrain/topographic-terrain.ts` | Procedural terrain for topographic zones | Medium |
| `assets/asset-loader.ts` | `loadImage()`, sprite caching | Used by preload fns |
| `assets/asset-paths.ts` | Canonical sprite path constants | SAFE to extend |

## src/ui/ — DOM Panels

| File | Responsibility | Notes |
|---|---|---|
| `panels/loom-panel.ts` | Loom upgrade sub-tab (contains equation panel) | Medium |
| `panels/equation-panel.ts` | Equation upgrade panel | Medium |
| `panels/resource-panel.ts` | Mote resource display | SAFE |
| `panels/rpg-menu-panel.ts` | RPG menu (weapons/upgrades/crafting sub-tabs) | Large |
| `panels/settings-panel.ts` | Settings UI | Medium |
| `panels/achievements-panel.ts` | Achievement list + sparkle effects | Medium |
| `ui/hud/hud-overlay.ts` | `createHudOverlay()` — mote counts + loom rate labels | No equation/equivalence display |
| `tabs/tab-bar.ts` | `createTabBar()` — tab navigation | Dispatches `set_active_tab` |
| `ui/idle/idle-overlay.ts` | Idle reward popup with duration + mote rewards | Equivalence intentionally hidden |
| `ui/legacy/`, `render/legacy/` | Retired equation/equivalence display history | Never import at runtime |

## src/settings/ — Persistence

| File | Responsibility | Notes |
|---|---|---|
| `save-types.ts` | `SaveData` interface, `SAVE_VERSION = 32`, `SAVE_KEY` | CAUTION — version bump on shape change |
| `save-serialize.ts` | `serializeGameState()` → `SaveData` | Must match deserialize |
| `save-deserialize.ts` | `deserializeGameState()` → `GameState` | Must handle missing fields gracefully |
| `save-load.ts` | `saveGame()`, `loadGame()`, `deleteSave()` | Thin localStorage orchestration |
| `settings-state.ts` | `SettingsState`, `loadSettings()`, `saveSettings()` | Separate key: `'equatoria_settings'` |
| `offline-time.ts` | `readLastActiveTimestamp()`, `writeLastActiveTimestamp()` | Drives idle reward calculation |

## src/input/ — Input

| File | Responsibility | Notes |
|---|---|---|
| `input-handler.ts` | `GameAction` union type (all ~45 action kinds), `TabId` | CAUTION — union type |
| `particle-drag.ts` | `ParticleDragState`, batched pointermove flushing | Perf-sensitive |

## src/audio/ — Audio

| File | Responsibility |
|---|---|
| `audio-system.ts` | `AudioSystem` interface + `createAudioSystem()` — orchestrator |
| `audio-paths.ts` | All audio file paths as constants |
| `music-player.ts` | Background music loop, fade |
| `ambiance-player.ts` | Per-tab ambiance loop |
| `sfx-player.ts` | One-shot SFX playback |
| `audio-loader.ts` | `preloadAudioBuffers()` |
| `audio-context.ts` | `getAudioContext()`, `resumeAudioContext()` |

## Legacy / generated / low-value files

| File | Status |
|---|---|
| `dist/` | IGNORE — build output |
| `ASSETS/sfx/*/OLD/` | IGNORE — unused legacy audio |
| `src/render/rpg/__tests__/` | Low signal unless debugging specific RPG subsystem |
| `boss_attack_implementation_notes.md` | Informal dev notes, not authoritative |
| `idle_progression_spreadsheet_guide.md` | Progression planning doc, may be stale |
| `refactor_plan.md` | Historical, may not reflect current state |
