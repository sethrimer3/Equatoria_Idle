# Equatoria Idle — Changelog for Agents

Lightweight log of architectural facts discovered and major structural changes. Future agents should append significant architectural changes here. Keep entries short and factual.

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
