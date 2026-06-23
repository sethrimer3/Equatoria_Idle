# Equatoria Idle Current Status

Last updated: 2026-06-18
Current build: 299

This file is the concise current-status layer for AI agents. It intentionally summarizes what matters for near-term work and should be kept more current than root historical docs.

## Product shape

Equatoria Idle is a Vite/TypeScript web game with Electron desktop support, GitHub Pages deployment, and an Android Capacitor shell targeting Google Play. The Android wrapper (Capacitor 8.4.0, package `com.sethrimer.equatoriaidle`, targetSdk 36 / Android 16) has been scaffolded and synced; a signed .aab can be produced once the developer installs JDK 17 and the Android SDK locally. See `docs/ANDROID_RELEASE.md` for full setup steps. Remaining gaps before first Play submission: launcher icons, splash screen, privacy policy URL, and Play Console Data Safety declaration.

## Current core pillars

1. Idle/equation progression with tiered motes, equation upgrades, passive looms, achievements, and a central Equation Forge.
2. Visual particle simulation with merge, forge/loom capture fields, Particle Life behavior, alivened motes, trails, glow fields, and dev diagnostics.
3. RPG combat mode with field-space scaling, zones/subzones, procedural enemies, elite/boss systems, many weapon families, XP/levels, upgrades, and low-graphics handling.
4. Crafted weapon system using refined crystals derived from forge/mote progression.

## Latest verified build notes

### Build 299: BPM-synced boss attacks and boss sanctuary

Completed:

- Added a central per-boss BPM configuration. Existing boss projectile and special-attack intervals now snap to musical half-beat subdivisions derived from each boss BPM; Quartz's signature missile remains every five beats.
- Added a 68 px boss-centered attack void. Boss projectiles, stage hazards, and special attacks do not render inside it, and the player takes no boss-attack damage while inside.

### Build 298: Quartz boss signature beat missile

Completed:

- Added a Quartz boss signature attack that fires every 5 beats of boss-wave simulation time.
- The attack launches a diamond missile from the top of the field, then splits on each 60 BPM beat into two -45/+45 degree branches for three split iterations.
- Missiles ease into each beat stop, and their thick solid trails remain damaging for two beats before fading.

### Build 297: Quartz boss MIDI phrase assets

Completed:

- Replaced the temporary Boss 1 demo MIDI with the real `ASSETS/bossMidi/1-QuartzBoss/` asset folder.
- Quartz boss now treats the six ModSynth level-1 `waveN.mid` files as six boss attack phrases.
- Boss music uses the folder's beat/background OGG loops during the boss fight and plays each matching `waveN.ogg` as its phrase starts.
- MIDI timing remains boss-wave simulation-time based and continues to fall back safely if assets fail to load.

### Build 296: boss MIDI attack scheduler

Completed:

- Added a lightweight Type-0/Type-1 MIDI note parser for boss-only attack scheduling.
- Added boss MIDI mapping config for exact notes, pitch classes, channels, and velocity intensity scaling.
- Boss 1 can opt into MIDI-backed boss attack patterns; missing or invalid MIDI leaves the existing boss behavior intact.
- MIDI boss timing advances on boss-wave simulation time, including boss speed scaling, and resets on boss wave start/end.
- Dev RPG debug overlay now includes compact boss MIDI load/time/last-note diagnostics.

### Build 280: lens/weave acquisition and reward presentation

Completed:

- Added centralized zone-aware lens/weave reward roll helpers with conservative normal, elite, boss, and milestone drop rates.
- RPG enemy kills, elite defeats, boss defeats, and 10-wave milestones can now add lens/weave rewards to the existing inventories.
- Added compact dark/gold reward toasts for lens/weave drops with fallback Lens/Weave icons.
- Added dev-mode RPG menu controls to grant an eligible lens/weave and simulate 100 reward rolls.
- Lens and weave inventory displays now sort new entries by tier/rarity/power while keeping duplicate copies as separate items.

### Build 279: lens/weave itemization helper pass

Completed:

- Added centralized lens and weave item metadata plus a pure equipment modifier aggregation layer.
- Generic RPG attacks now consume combined equipment modifiers for damage, crit, and status routing.
- Single-target, multi-target, and AoE lens status application share the status helper path.
- Equipped weaves can provide bounded combat passives such as damage, cooldown, crit, status, and defense bonuses.
- Lens/weave inventory cards show compact stat previews and safe unknown-item fallbacks.

### Build 272: long-range gently homing Horizon shots

Completed:

- Extended Pentagon missile, Pentagon gatling, and Galaxy stream range to roughly four times their previous travel duration.
- Added very slight homing to Pentagon gatling rounds and Galaxy streams while preserving Pentagon missile homing.

### Build 271: lively Horizon projectiles

Completed:

- Added trails and cached radial glow sprites to Pentagon missiles, Pentagon gatling rounds, and Galaxy streams.
- Added controlled per-shot speed and spread variation to Pentagon and Galaxy projectiles.

### Build 270: True Galaxy normal enemies

Completed:

- Added rotating Galaxy particle-cloud enemies to ordinary True-subzone waves.
- Galaxies fire particle streams whose wave-shared hit damage starts at 2 and doubles after every hit.

### Build 269: Bohemian Dome True super elite

Completed:

- Added a dense Bohemian Dome super elite to every tenth True-subzone wave.
- Bohemian Dome particles retain long motion trails and protect a substantially tougher core.
- Existing True surface elites now rotate on the intervening fifth-wave cadence.

### Build 268: expanded True surface elite rotation

Completed:

- Added Henneberg's Minimal Surface, Seashell, and Enneper surface elites.
- True elite waves now rotate through five parametric surface forms.

### Build 267: True parametric surface elites

Completed:

- Added Corkscrew and Dini surface elite encounters to True-subzone elite waves.
- Added screen-spanning parametric scaffold rendering.
- Dini scaffold points must all be struck and activated before its core can take damage.

### Build 265: visible equation and equivalence retirement

Completed:

- Removed the visible equation, forge-preview equation, and equivalence score from the active idle HUD.
- Removed the visible equation formula from the Equation Forge upgrade panel.
- Removed equivalence from the idle reward overlay while preserving reward calculation and application.
- Archived the retired display implementations under non-runtime legacy folders.

### Build 264: normal mote attraction reset

Completed:

- Removed normal equation-render mote attraction, steering, and containment toward looms and the forge.
- Preserved natural drift, pointer dragging, Particle Life, merges, and capture-only loom/forge transactions.
- Archived the removed movement implementation in a non-runtime legacy file.

### Build 230: achievement pacing cleanup

Completed:

- Replaced the automatic first-tap Sand achievement with a 25 lifetime Sand milestone.
- Removed the redundant 100 lifetime Sand milestone.
- Repurposed three duplicate long-term Equivalence achievements into distinct long-term tap-count goals while preserving their save IDs.

### Build 206: crafted weapon base level system

Completed:

- Total weighted mote value for crafted ingredients.
- Base level calculation from weighted value.
- Base stat multiplier calculation.
- Stat application to damage, cooldown, range, and defense bonus.
- Crafted crit damage multiplier.
- `CraftedWeaponData` fields for total weighted value, base level, and base stat multiplier.
- UI row showing level, base multiplier, and mote-weight.
- Tests for weighted value math, monotonicity, stat floors, and round-trip field presence.

Balance caution:

- Deep-tier single crystals can produce very high weighted values. Playtest and clamp if needed.

### Build 205: Amethyst companion ships for crafted weapons

Completed:

- `amethystShipCount` modifier.
- Modifier display for furthest-target ships.
- Crafted weapons can allocate companion ships in equip order.
- Total ship cap exists.
- Damage attribution stores `sourceWeaponId` for crafted ships/lasers.
- Tests cover share and cap behavior.

Known limitations:

- Crafted Amethyst ships still use static Amethyst ship visuals.
- Ships target furthest enemies but do not fully mirror every crafted weapon's primary attack family.
- Balance needs playtesting.

### Build 204: first-pass crafted combat modifier hooks

Completed:

- Iolite poison bonus.
- Emerald acquisition range bonus.
- Nullstone pull through single-target hit path.
- Fracteryl recursive follow-up strikes through single-target hit path.

Known limitations:

- Nullstone pull is currently closer to an instant positional nudge than a visible black-hole field.
- Fracteryl needs clearer visual/audio feedback and recursion safety guards.
- Hooks are not yet centralized across every attack family.

### Build 203: crafted modifier data, crit, armor ignore, tests

Completed:

- `CraftedWeaponModifiers` and resolver lookup.
- Sand fire-rate/damage divisor.
- Sapphire crit chance.
- Diamond armor ignore.
- Tests for tier-weighted composition, forge capacity, caps, floors, and round-trip.

### Build 202: forge capacity upgrade and crafted weapon UI polish

Completed:

- `forge_craft_level` RPG upgrade.
- Refined crystal feedback after forge sacrifice.
- Static gradient diamond crafted weapon icon.
- Percent-based modifier display lines.

### Build 201: crafted weapons initial integration

Completed:

- Save/load v30-era crafted weapon fields.
- Dynamic weapon resolver integration for crafted ids.
- `craft_weapon` action.
- Forge capacity mapping.
- Weapons tab crafting panel and crafted weapon cards.

## Recent RPG field-space status

Recent builds before the crafted-weapon work completed major field-space adoption:

- RPG safe core remains stable and readable.
- Expanded host size reveals more real RPG world space instead of zooming in; the hard-clamped active arena now expands at the fixed 9:16 RPG aspect ratio until it hits the visible world.
- Verdure cave/stone walls, collision, floor texture, spawn rejection, plant anchors, and nav-grid integration now account for expanded active bounds.
- Caustics fish enemies use terrain-aware pathfinding.
- Topographic lighting coverage across the full visible world is marked complete in `nextSteps.md`.

Intentional safe-core elements:

- Bottom safe zone banner.
- Boss stage director.
- Wave-clear banner.

## Important current known limitations

1. Eigenstein crafted weapon behavior is intentionally unresolved and should not be invented casually.
2. Nullstone crafted pull needs visible black-hole/vortex feedback and likely multi-frame force behavior.
3. Fracteryl crafted recursive strikes need visual feedback, safety guards, and a deliberate retargeting/branching decision.
4. Crafted post-hit hooks are not centralized across all attack families.
5. Crafted weapon balance is not playtested enough.
6. `forge.forgeCraftLevel` remains in v30 saves but is no longer authoritative; true capacity comes from the `forge_craft_level` RPG upgrade.
7. Crafted weapon card icon is still a static gradient diamond silhouette, not a procedural weapon-form sprite.
8. Optional Caustics fish debug visualization and per-species tuning remain deferred.
9. Some root docs may contain older save-version or architecture details; verify current source before changing persistence.

## Current near-term priorities

1. Design and implement Eigenstein as a deliberate endgame crafted weapon behavior.
2. Centralize crafted post-hit modifier handling so Nullstone/Fracteryl and future modifiers can apply safely across weapon families.
3. Improve Nullstone pull visuals and force behavior with strict caps.
4. Improve Fracteryl visuals/safety and decide whether repeats retarget, stay on target, or branch.
5. Add broader combat tests for crafted modifier hooks.
6. Playtest crafted weapon coefficients, caps, capacity, refined crystal threshold, and high-tier weight scaling.
7. Clean up stale `forge.forgeCraftLevel` save field in a future migration.
8. Continue Google Play readiness work only after deciding native-wrapper approach.

## Agent cautions

- Do not assume old root documentation is fully current for save versions or latest build status.
- Do not bypass dynamic weapon resolution when crafted weapon ids may be equipped.
- Do not broaden a crafted modifier into every attack path without tests/guards.
- Do not change field-space scaling without checking aspect-preserved active bounds, safe core, spawn bounds, and terrain/collision users.
- Do not mix Equatoria Idle with the separate Equatoria RPG project.

## Update rule

Update this file whenever a build completes a major feature, a limitation is resolved, a new limitation is discovered, or a high-priority direction changes.
