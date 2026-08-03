# Equatoria Idle Operational Todo Queue

Queue protocol updated: 2026-07-25  
Task list last reviewed: 2026-06-03  
Build observed while updating this protocol: 347

This is the canonical operational task queue for AI coding agents. Its exact path and capitalization are `docs/Todo.md`. Keep detailed build history and incomplete-work handoffs in `nextSteps.md`; keep this file focused on actionable tasks.

## Agent queue protocol

When the user says **“Do a task from Todo.md,” “Do the next task from Todo.md,”** or equivalent:

1. **Choose the task.** Work on the first unchecked top-level task (`- [ ]`) in file order unless the user names a different item. Do not skip an inconvenient item merely because another task is easier.
2. **Check current context before editing.** Follow the read order in `AGENTS.md`, inspect `docs/CURRENT_STATUS.md` and the relevant route in `docs/AI_TASK_ROUTING.md`, search `nextSteps.md` for related implementation history or unfinished work, and inspect the current relevant source/tests. Current code overrides stale notes.
3. **Implement the task as fully as reasonably possible.** Keep scope narrow, preserve repository architecture, add or update focused tests, run the relevant validation commands, update required documentation, and increment `src/buildInfo.ts::BUILD_NUMBER` for implemented code changes. Documentation-only queue maintenance does not require a build bump.
4. **Handle stale or already-complete tasks honestly.** If current code already satisfies the item, verify it with code/tests, mark it complete with a concise evidence note, and do not invent unnecessary changes.
5. **Update the queue.** Mark an item complete only when the requested work is genuinely complete and committed. Leave partially completed or blocked work unchecked.
6. **Record unfinished work in `nextSteps.md`.** Add a concise handoff containing the task title, date/build, what was changed, files touched, validation results, exact blocker or remaining work, and the next concrete action. Never hide a failure by checking off the task.
7. **Report the result.** Tell the user what was changed, what validation ran and its result, whether anything remains unfinished, and the commit/branch when available.
8. **Report the exact remaining count.** Recount the unchecked checklist entries after editing and state: **“TODO items remaining: N.”** Count only lines beginning with `- [ ]`; do not estimate and do not count explanatory sub-bullets.

If a task is too broad for one safe change, complete the largest coherent, validated portion; keep the item unchecked; document the remaining implementation-ready steps in `nextSteps.md`; and report that it is incomplete.

## High priority

- [x] Design Eigenstein crafted weapon behavior deliberately before implementation. Completed in Build #207: Eigenstein-dominant crafted weapons use the dimensional sword family, with a stable hilt/crossguard, shifting blade polygons, localized rift slashes, and per-enemy capped rift-damage accumulation isolated by weapon and enemy identity.

- [ ] Implement Eigenstein crafted weapon first pass after design is confirmed in code comments/docs.
  - Add data modifier(s), resolver support, combat hook, visuals, tests, UI lines, and save-safe behavior.

- [ ] Centralize crafted post-hit modifier handling.
  - Current issue: Nullstone pull and Fracteryl recursive strikes are first-pass and mostly wired through the single-target path.
  - Target: one safe helper/hook that can be called by single-target, piercing, multi-target, AoE, laser, projectile, poison, missile, mine, companion ship, sword, and chain families where appropriate.
  - Must include recursion/reentrancy guards.

- [ ] Improve Nullstone crafted pull.
  - Replace or supplement instant nudge with a short visible black-hole/vortex effect.
  - Consider multi-frame force with capped radius, duration, strength, affected target count, and simultaneous active pulls.
  - Add tests or simulation checks for inside/outside radius and invalid/dead target safety.

- [ ] Improve Fracteryl crafted recursive strike feedback and safety.
  - Add visual/audio feedback so recursion is readable.
  - Add guard preventing recursive strikes from recursively spawning unlimited new recursive chains unless explicitly intended.
  - Decide whether repeats continue on original target, retarget nearest enemies, or branch visually.
  - Recent user direction: Fracteryl may eventually have spears that appear around the player, point at the target, fly one by one, then form an easy-to-render fractal on impact that damages repeatedly.

- [ ] Add broader crafted modifier combat tests.
  - Iolite poison bonus increases poison tick damage.
  - Emerald bonus detect range is used in missile acquisition.
  - Nullstone pull affects only valid enemies inside capped radius.
  - Fracteryl follow-ups cap at 10 and decay damage correctly.
  - Crafted resolver works for every equipped-weapon path that can accept crafted ids.

## Balance and playtesting

- [ ] Playtest crafted weapon coefficients and caps.
  - Base stat multiplier coefficient.
  - Cooldown/range/damage application fractions.
  - Sapphire crit chance and crit damage cap.
  - Diamond armor ignore cap.
  - Iolite poison scaling.
  - Emerald acquisition range scaling.
  - Nullstone pull radius/force/duration.
  - Fracteryl repeat count and damage decay.
  - Refined crystal threshold and forge capacity pacing.

- [ ] Specifically test high-risk crafted combinations.
  - Sand + Fracteryl.
  - Sapphire + Fracteryl.
  - Diamond + Ruby.
  - Nullstone + AoE.
  - High-tier single-crystal recipes such as Amethyst+ because tier weights scale by 100x.

- [ ] Decide whether to clamp `baseStatMultiplier` for deep-tier single crystals.

## Save/load and persistence

- [ ] Clean up stale `forge.forgeCraftLevel` in a future save migration.
  - It remains present in v30-era saves but is no longer authoritative.
  - True capacity comes from the `forge_craft_level` RPG upgrade.
  - Future migration likely v31 or later.

- [ ] Verify current save version documentation.
  - Some root docs contain older save-version notes.
  - Source code should be treated as authoritative before editing save/load.

## UI and visual polish

- [ ] Replace static crafted weapon card icon with procedural weapon-form visuals.
  - Future goal: silhouette based on weapon form.
  - Fill/gradient should be based on up to six ingredient tier colors.

- [ ] Give crafted Amethyst ships procedural/composition-based visuals or another clear source indicator.

- [ ] Improve UI visibility for crafted pros/cons and dominant ingredient tradeoffs.

- [ ] Consider a dedicated weapon-crafting page when the Forge/Weapons UI becomes too dense.
  - Recent user direction: a new crafting page can live under the Upgrades tab temporarily.
  - Desired input style: multi-thumb/percentage allocation slider for mote-type ingredient percentages.

## RPG field-space and zones

- [ ] Keep monitoring expanded RPG field-space edge cases.
  - Verify enemies, terrain, glows, lasers, pickups, and background effects all use active/visible bounds correctly.
  - Safe-core UI/readability elements may remain centered intentionally.

- [ ] Optional: add Caustics fish path/stuck debug overlay.

- [ ] Optional: tune fish turn rate per species and narrow-passage behavior.

- [ ] Verify Verdure expanded walls stay aligned after future viewport/render-space changes.

## Google Play readiness

- [x] Decide native wrapper approach — Capacitor chosen.
- [x] Scaffold Android project with Capacitor 8.4.0 (package `com.sethrimer.equatoriaidle`, targetSdk 36).
- [x] Add `android:sync`, `android:open`, `android:build` npm scripts.
- [x] Document local setup in `docs/ANDROID_RELEASE.md`.

Remaining before first Play submission (see `docs/ANDROID_RELEASE.md`):

- [ ] Install JDK 17 and Android SDK 36 locally to enable `npm run android:build`.
- [ ] Add launcher icons (replace default Capacitor mipmap images via Android Studio Image Asset wizard).
- [ ] Add splash screen (`@capacitor/splash-screen`) or remove the need for one.
- [ ] Add privacy policy URL in Play Console.
- [ ] Complete Play Console Data Safety declaration (localStorage, no external sharing).
- [ ] Remove or localize any external CDN font/asset dependency before store release.
- [ ] Validate save behavior and localStorage assumptions in the native WebView wrapper.

## Documentation maintenance

- [ ] Keep `docs/AI_REPO_MAP.md` current when files move or major subsystems are added.

- [ ] Keep `docs/CURRENT_STATUS.md` current when major builds land.

- [ ] Keep `file_index.md` current when important file responsibilities change.

- [ ] Update root `ARCHITECTURE.md`/`DECISIONS.md` for durable architecture changes, not every small implementation detail.

## Completed or superseded references

- [x] Build 334: typed canonical Verdure-resize and overlay-fade body profiles, with the overlay collection inventory moved out of the per-frame draw path.
- [x] Build 333: canonical renderer-local RPG encounter collections, explicit typed boss/zone/restart profiles, shared broad-context references, and stale-Stardust restart correction.
- [x] Build 332: one explicit `AppRuntime` owns loop, listeners, interval, input, callbacks, audio/effects, panels, RPG teardown, and DOM cleanup.
- [x] Build 298: Quartz boss signature beat missile with three beat-locked split iterations and damaging thick trails.
- [x] Build 297: Quartz boss now uses the real `ASSETS/bossMidi/1-QuartzBoss/` MIDI/OGG phrase folder instead of the temporary demo MIDI.
- [x] Build 296: boss MIDI attack scheduler with demo Boss 1 pattern, mapping config, fallback behavior, dev diagnostics, and scheduler/parser tests.
- [x] Build 201: initial crafted weapon save/load, resolver, action, UI.
- [x] Build 202: forge capacity upgrade, refined crystal feedback, first crafted icon/modifier display.
- [x] Build 203: crafted modifier data, crit, armor ignore, tests.
- [x] Build 204: first-pass Iolite/Emerald/Nullstone/Fracteryl combat hooks.
- [x] Build 205: first-pass crafted Amethyst ships.
- [x] Build 206: crafted weapon base level/stat multiplier system.
- [x] RPG field-space adoption through builds 185–188 is marked complete in `nextSteps.md`.
- [x] Verdure cave walls expanded with active bounds in build 194.
- [x] Caustics fish terrain-aware pathfinding landed in build 190.
