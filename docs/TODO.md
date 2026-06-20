# Equatoria Idle Condensed TODO

Last updated: 2026-06-03
Current build: 298

This file is the condensed action list for AI agents. Keep detailed build history in `nextSteps.md`; keep this file short and current.

## Agent instructions

When completing or deferring work:

- Check off completed items only when the implementation is actually merged/committed and validation status is known.
- Add newly discovered work here if it is actionable and still relevant.
- Move stale or superseded items to the completed/superseded section with a short note.
- Add exact validation failures when a task cannot be finished.
- Do not delete important unresolved work just because it is inconvenient.

## High priority

- [ ] Design Eigenstein crafted weapon behavior deliberately before implementation.
  - Current direction: endgame/rule-altering mote, not a casually invented generic damage modifier.
  - Recent user direction: a larger unstable sword-family weapon can reuse Sand/Diamond sword architecture where possible, with stable hilt/crossguard, shifting blade polygons, and a localized Substrate-style slash/rift.
  - First gameplay effect under consideration: per-enemy compounding damage where each enemy tracks its own Eigenstein accumulation; accumulation resets on death/despawn and does not transfer between enemies.

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

Remaining before first Play submission (see ANDROID_RELEASE.md):

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

- [x] Build 298: Quartz boss signature beat missile with three beat-locked split iterations and damaging thick trails.
- [x] Build 297: Quartz boss now uses the real `ASSETS/bossMidi/1-QuartzBoss/` MIDI/OGG phrase folder instead of the temporary demo MIDI.
- [x] Build 296: boss MIDI attack scheduler with demo Boss 1 pattern, mapping config, fallback behavior, dev diagnostics, and scheduler/parser tests.
- [x] Build 201: initial crafted weapon save/load, resolver, action, UI.
- [x] Build 202: forge capacity upgrade, refined crystal feedback, first crafted icon/modifier display.
- [x] Build 203: crafted modifier data, crit, armor ignore, tests.
- [x] Build 204: first-pass Iolite/Emerald/Nullstone/Fracteryl combat hooks.
- [x] Build 205: first-pass crafted Amethyst ships.
- [x] Build 206: crafted weapon base level/stat multiplier system.
- [x] RPG field-space adoption through builds 185-188 is marked complete in `nextSteps.md`.
- [x] Verdure cave walls expanded with active bounds in build 194.
- [x] Caustics fish terrain-aware pathfinding landed in build 190.
