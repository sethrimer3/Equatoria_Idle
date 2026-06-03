# Equatoria Idle Current Status

Last updated: 2026-06-03
Current build: 206

This file is the concise current-status layer for AI agents. It intentionally summarizes what matters for near-term work and should be kept more current than root historical docs.

## Product shape

Equatoria Idle is currently a Vite/TypeScript web game with Electron desktop support and GitHub Pages deployment. It is not yet an Android/Google Play project. A future mobile store release would need a native wrapper such as Capacitor, store assets, manifest/icon cleanup, privacy/data-safety documentation, and validation against current Android target/API requirements.

## Current core pillars

1. Idle/equation progression with tiered motes, equation upgrades, passive looms, achievements, and a central Equation Forge.
2. Visual particle simulation with merge, forge/loom capture fields, Particle Life behavior, alivened motes, trails, glow fields, and dev diagnostics.
3. RPG combat mode with field-space scaling, zones/subzones, procedural enemies, elite/boss systems, many weapon families, XP/levels, upgrades, and low-graphics handling.
4. Crafted weapon system using refined crystals derived from forge/mote progression.

## Latest verified build notes

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
- Expanded host size reveals more real RPG world space instead of zooming in.
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
- Do not change field-space scaling without checking expanded active bounds, safe core, spawn bounds, and terrain/collision users.
- Do not mix Equatoria Idle with the separate Equatoria RPG project.

## Update rule

Update this file whenever a build completes a major feature, a limitation is resolved, a new limitation is discovered, or a high-priority direction changes.
