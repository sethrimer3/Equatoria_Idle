# Equatoria Idle — Changelog for Agents

Lightweight log of architectural facts discovered and major structural changes. Future agents should append significant architectural changes here. Keep entries short and factual.

---

## 2026-07-13 — Canonical attack context and readiness policy (build 335)

**Agent:** Codex Phase Five implementation

**Changed:**
- `RpgPlayerAttackCtx` and `RpgWeaponCtx` now inherit the canonical encounter collection contract,
  carry its exact owner, and receive stable direct aliases through one-time renderer composition.
- Added a Node-safe readiness policy with explicit 52-key participating and 22-key excluded
  classifications while preserving ALIVEN, Horizon, and boss special cases.

**New invariants:**
- Attack/weapon contexts do not redeclare or hand-wire parallel collection inventories.
- Readiness classification covers every canonical key and does not automatically include new
  collections or currently excluded Stardust, Life, Nadir, effect, reward, or spawn families.

---

## 2026-07-13 — Typed RPG encounter body profiles (build 334)

**Agent:** Codex Phase Four implementation

**Changed:**
- Added distinct typed Verdure-resize and overlay-fade key profiles to the canonical encounter
  collection module.
- Verdure resize correction consumes the 39-key profile while retaining player and plant handling.
- Overlay fading consumes the 42-key profile and no longer allocates a collection list per frame.

**New invariants:**
- Semantic profiles remain separate and preserve their exact characterized memberships and order.
- Body-profile helpers are Node-safe; the hot draw path uses static keys and stable arrays without
  reflection, mapped arrays, or callback allocation.

---

## 2026-07-12 — Canonical RPG encounter collections (build 333)

**Agent:** Codex Phase Three implementation

**Changed:**
- Added the Node-safe `rpg-encounter-collections.ts` interface/factory and typed lifecycle profiles.
- `createRpgRender()` creates one collection owner; update, draw, targeting, wave/dead-sweep, and
  death/restart contexts retain its object and exact array references.
- Replaced the boss-entry, zone-switch, and restart collection clear inventories with in-place
  profile helpers. Normal restart intentionally now clears stale Stardust enemies.

**New invariants:**
- Every RPG renderer instance receives fresh arrays, and no canonical collection property or array
  reference is replaced during its lifetime.
- Reset helpers may iterate static typed key tuples only at lifecycle boundaries; per-frame update,
  draw, targeting, and wave order remains direct and unchanged.
- Verdure, Nadir, spawn-flash, dying-enemy, elite-buff, boss/MIDI, fluid, path, weapon, combo, and
  ward cleanup remains with the specialized owner where truncation alone is insufficient.

---

## 2026-07-12 — Owned application runtime lifecycle (build 332)

**Agent:** Codex architectural audit

**Changed:**
- `startApp()` returns an `AppRuntime`; `main.ts` retains and replaces the active runtime safely.
- `createGameLoop()` returns an explicit start/stop/dispose controller, and canvas pointer wiring returns an idempotent cleanup.
- App listeners, unread polling, achievement registration, audio, effects, panels, RPG resources, callbacks, and DOM now compose under one reverse-order cleanup owner.
- Transient Lens overlays/document drag handlers and boss-audio fallback callbacks are child-owned and are cancelled during disposal.

**New invariants:**
- One app runtime owns at most one main RAF, one unread interval, and one app-level global-listener set.
- Disposal is idempotent, stops active work before root DOM removal, and prevents disposed callbacks from mutating live runtime state.
- Page-reload reset remains intentional; runtime disposal is not an in-process gameplay reset.

---

## 2026-07-11 — Demand-driven trace overlay lifecycle (build 331)

**Agent:** Codex architectural audit

**Changed:**
- `src/render/ui/trace-effect.ts` no longer runs a permanent fullscreen animation loop while it has no targets.
- Target setters now wake or stop the loop, and `dispose()` is idempotent.
- Lifecycle coverage lives in `src/render/ui/__tests__/trace-effect.test.ts`.

**New invariants:**
- The trace overlay must own at most one scheduled animation frame and zero while target-free.

---

## 2026-06-06 — Documentation pass (build 230)

**Agent:** codebase cartographer

**Architecture facts confirmed:**
- Entry: `index.html` → `src/main.ts` → `src/app/game-app.ts::startApp()`
- Game loop: `requestAnimationFrame` at 60 fps target via `createGameLoop()` in `app-game-loop.ts`
- Save format: localStorage key `'equatoria_save'`, `SAVE_VERSION = 32`
- Settings: localStorage key `'equatoria_settings'`, separate from save
- Tiers: 13 total (sand → eigenstein), all non-secret (no isSecret=true tiers active)
- Tabs: `'equation' | 'resources' | 'rpg' | 'achievements' | 'settings'`
- Idle canvas logical world: 320 × 640 px
- RPG safe core: 360 × 640 px
- Particle system is visual-only and not persisted (transient on page load)
- Audio: Web Audio API, no-op graceful fallback, requires user gesture to resume
- Build system: Vite 8, TypeScript 6, Vitest 3 (node env tests), ESLint 10
- Electron: wrapper only, `electron/main.cjs`, custom `equatoria://app/` protocol
- Post-build: `scripts/copy-assets.mjs` copies ASSETS/ to dist/assets/
- `GameState` is the authority for save-relevant state; `AppState` is transient runtime glue
- `sim/` layer must not import from `render/`, `ui/`, or `app/`
- Crafted weapons use `registerCraftedWeapons()` to populate `WEAPON_BY_ID` at runtime

**New docs created:**
- `docs/REPO_MAP.md`
- `docs/FILE_GUIDE.md`
- `docs/CONVENTIONS.md`
- `docs/AI_TASK_ROUTING.md`
- `docs/DEPENDENCY_MAP.md`
- `docs/CHANGELOG_FOR_AGENTS.md` (this file)
- `AGENTS.md` updated with new read order

**Uncertain areas (not fully inspected):**
- `src/render/rpg/rpg-fluid.ts` and fluid render pipeline — not traced in this pass
- `src/render/rpg/terrain/` — terrain system partially inspected; zone-specific interactions unclear
- `src/render/rpg/rpg-boss-stage-director.ts` — boss stage progression not traced
- `src/ui/panels/balance-forecast/` — balance forecast panel purpose not fully verified
- `src/render/ui/trace-effect.ts` — golden outline trace effect; not inspected

---

## Template for future entries

```
## YYYY-MM-DD — Brief description (build NNN)

**Agent:** (agent description)

**Changed:**
- What changed and why (architectural impact only)

**New invariants:**
- Any new constraints other agents must respect

**Broken invariants:**
- Any previously documented rules that no longer apply

**Uncertain:**
- Anything touched but not fully verified
```
