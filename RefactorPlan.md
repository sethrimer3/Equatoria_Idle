# Equatoria Idle Refactor Plan

**Repository:** `sethrimer3/Equatoria_Idle`  
**Baseline branch:** `main`  
**Baseline build:** `332`  
**Baseline lifecycle commit:** `938315712323aeedbe957a92fac7647eff8670c3`  
**Status:** Phase Three complete; Phase Four proposed (planning only)
**Compatible agents:** Codex, Claude, or another repository-capable coding agent

---

## Decision

A further refactor phase is productive.

The next phase should establish a canonical owner for the RPG combat encounter's mutable entity collections and replace independently maintained reset lists with explicit, tested reset profiles.

Tentative module:

`src/render/rpg/rpg-encounter-collections.ts`

The active RPG renderer owns many separate arrays for enemies, projectiles, procedural creatures, special encounters, boss effects, spawn entries, drops, and combat transients. Those collections are repeated independently across update, draw, targeting, wave, boss-entry, zone-switch, and death/restart contracts.

This creates a concrete maintenance risk: adding an enemy or projectile family requires remembering every declaration, context, updater, renderer, targeting path, completion check, and reset path. Existing reset paths already differ in ways that may be intentional or may represent drift. Characterize those differences before normalizing them.

This phase is an ownership and correctness refactor. It is not a combat redesign, performance rewrite, ECS conversion, or broad `rpg-render.ts` decomposition.

---

## Work Completed So Far

### Phase One — Demand-driven trace-overlay lifecycle

**Build:** 331  
**Primary commit:** `d2eeb7bc72012cd3aacc3f5a35e724a485f3b8ec`

Completed:

- Replaced the trace overlay's permanent animation loop with demand-driven scheduling.
- Ensured no frame is owned while no targets are active.
- Ensured at most one frame is scheduled while active.
- Clearing the final target cancels the frame and clears the overlay.
- Added idempotent disposal and focused lifecycle tests.

### Phase Two — Owned application runtime lifecycle

**Build:** 332  
**Completion commit:** `938315712323aeedbe957a92fac7647eff8670c3`  
**Supporting auto-sync commits:** `c30905b1`, `dfd23f5d`, `ba9c08ca`

Completed:

- Changed `startApp()` to return an explicit `AppRuntime`.
- Added idempotent reverse-order application cleanup.
- Converted the main loop to a `start()` / `stop()` / `dispose()` controller.
- Made canvas input removable.
- Put visibility, focus, resize, polling, panels, audio-owned work, effects, achievements, RPG resources, and app DOM under explicit ownership.
- Added partial-startup cleanup and `RpgRender.dispose()`.
- Added teardown for transient Lens overlays, drag listeners, boss-audio fallback callbacks, and discovered child resources.
- Preserved page reload as the intentional full-reset path.
- Added fake-RAF, timer, listener, input-unwiring, runtime-replacement, and disposal tests.

Primary result:

- One runtime owns one active application instance, preventing intentional duplication of loops, timers, listeners, input, and callbacks after replacement.

---

## Evidence for the Next Phase

### Encounter collections are independently declared

`createRpgRender()` declares many stable arrays for:

- standard and gemstone enemies;
- shards, bolts, spikes, tendrils, beams, mines, missiles, and decoys;
- elites and polyomino variants;
- procedural creatures and fish families;
- ALIVEN groups and Life colonies;
- Binary Ring, Nadir cube, Stardust, and Horizon Pentagon encounters;
- boss projectiles and teleport particles;
- spawn queue, lucky motes, and selected visual transients.

Stable in-place arrays are a sound runtime model, but their ownership is implicit rather than represented by one canonical interface and factory.

### The inventory is repeated across subsystem contracts

Large overlapping lists appear in:

- `rpg-render.ts`;
- `RpgEnemyUpdateArrays` in `rpg-render-update.ts`;
- `RpgDrawCtx` in `rpg-render-draw.ts`;
- `RpgTargetingCtx` in `rpg-targeting-types.ts`;
- `WaveManagerCtx` in `rpg-wave-manager.ts`;
- `RpgDeathRestartCtx` in `rpg-death-restart.ts`;
- player-attack and weapon contexts;
- movement and orbit-projectile contexts;
- manual body lists used for overlay fading and Verdure resize correction.

These lists encode gameplay membership: which entities update, draw, target, collide, count toward completion, or clear during lifecycle transitions.

### Reset membership is independently maintained

At least three paths keep separate clearing policies:

1. `clearStageForBossFight()`;
2. `resetActiveEncounterForZoneSwitch()`;
3. `doRestart()`.

Investigate before changing:

- Zone switching clears `teleportParticles`; boss entry does not.
- Death/restart explicitly clears Nadir cube collections.
- Boss-entry and zone-switch blocks do not enumerate Nadir collections identically.
- `RpgDeathRestartCtx` includes `stardustEnemies`; verify whether `doRestart()` clears them.
- `comboEffects`, `wardEffects`, afterimages, orbit projectiles, and weapon-owned arrays have separate owners.
- Verdure plants use `clearVerdurePlants()` rather than bare truncation, implying specialized cleanup.

These differences may be deliberate. Preserve current semantics until intent is demonstrated.

### Existing migration seam

`RpgEnemyUpdateArrays` already bundles many collections for the update loop. Evolve that concept into a neutral canonical definition rather than introducing a generic framework.

Expected value:

- lower risk of stale enemies after restart or zone switching;
- explicit, testable reset differences;
- smaller broad context contracts;
- stable array identity;
- easier addition of future enemy families;
- compiler pressure when a new collection is not classified.

---

## Phase Three Objective

Create one Node-safe canonical definition and factory for active RPG encounter collections, then migrate the major reset paths and broad subsystem contexts to use it.

The module should define:

- `RpgEncounterCollections`;
- `createRpgEncounterCollections()`;
- typed collection subsets or views;
- explicit reset profiles;
- helpers that truncate arrays in place without replacing references.

The module must not own:

- scalar wave or player state;
- the boss object;
- `BossAttackState` or boss MIDI state;
- terrain or navigation state;
- background instances;
- audio, DOM, timers, or animation frames;
- weapon-system internal collections;
- save state or zone-selection UI.

---

## Architectural Target

### Canonical collections

Include only collections genuinely owned by one RPG encounter/runtime instance. Likely categories:

- spawn queue;
- ordinary and gemstone enemies;
- enemy projectiles and sub-entities;
- elites and polyomino variants;
- procedural creatures and fish families;
- Stardust, Binary Ring, Nadir cube, Horizon Pentagon, ALIVEN, and Life encounters;
- boss projectiles and teleport particles.

Evaluate carefully before including:

- lucky motes and popups;
- hit effects, shot lines, damage numbers, and death particles.

Keep `comboEffects`, `wardEffects`, afterimages, orbit projectiles, and weapon-owned state outside unless evidence establishes encounter ownership.

### Factory requirements

`createRpgEncounterCollections()` must:

- return fresh arrays on every call;
- share no arrays between renderer instances;
- preserve array references for the instance lifetime;
- have no browser dependency;
- avoid proxies, reflection-heavy abstractions, or lazy per-frame allocation.

### Typed subsets

Use compiler-checked key tuples or equivalent narrow views for:

- update collections;
- drawable collections;
- targetable body collections;
- movable bodies used during Verdure correction;
- boss-entry reset;
- zone-switch reset;
- death/restart reset.

Example:

```ts
const BOSS_ENTRY_CLEAR_KEYS = [
  // ...
] as const satisfies readonly (keyof RpgEncounterCollections)[];
```

Do not use untyped string lists or runtime object-key iteration to define gameplay ordering.

### Stable identity

All reset helpers must use in-place clearing:

```ts
collection.length = 0;
```

Never replace an array after subsystem contexts have captured its reference.

### Explicit reset profiles

Prefer named functions such as:

- `clearForBossEntry(collections)`;
- `clearForZoneSwitch(collections)`;
- `clearForDeathRestart(collections)`.

Each profile must document:

- which collections it clears;
- which collections it intentionally retains;
- why it differs from other profiles;
- which specialized non-array cleanup remains with the caller.

Do not collapse profiles unless tests prove their differences are accidental and the intended behavior is clear.

---

## Required Behavioral Preservation

Preserve:

- collection identity;
- update and draw order;
- target-selection and damage rules;
- wave spawning, completion, kills, XP, and rewards;
- boss entry, progression, victory, death, and restart;
- zone switching;
- Nadir and True special encounters;
- ALIVEN and Life behavior;
- procedural enemies;
- low-graphics behavior;
- save and settings compatibility;
- browser, Electron, and Android behavior.

Specialized cleanup should remain specialized when it performs more than truncation, including:

- `clearVerdurePlants()`;
- Nadir encounter cleanup if it has additional effects;
- spawn-flash and dying-enemy cleanup;
- elite-buff and empower-particle registries;
- boss-stage and MIDI reset;
- fluid and pathfinding reset;
- weapon-system reset.

Do not silently add a suspiciously omitted collection to a reset profile. To make a behavioral correction:

1. reproduce the stale-state behavior;
2. add a failing regression test;
3. establish intended behavior from code or gameplay;
4. implement the correction;
5. report it as an intentional behavioral delta.

---

## Recommended Scope

### Required

1. Add the canonical collection module and tests.
2. Instantiate it once in `createRpgRender()`.
3. Replace independent array construction with references from the canonical owner.
4. Replace boss-entry and zone-switch clear lists with tested profiles.
5. Change death/restart to receive the canonical collections or a typed restart view.
6. Replace the manual restart clearing sequence.
7. Align `RpgEnemyUpdateArrays` with the canonical definition.
8. Migrate broad collection-only contracts where mechanical:
   - update;
   - draw;
   - targeting;
   - wave manager.
9. Update architecture and routing documentation.

### Optional when low-risk

- Canonical Verdure movable-body subset.
- Canonical overlay-fade body subset.
- Mechanical migration of player-attack and top-level weapon contexts.

### Deferred

- Rewriting all weapon submodule contexts.
- Generic entity registries.
- Moving scalar state into the collection owner.
- Combining boss, wave, player, terrain, and draw state.
- Broad renderer decomposition.
- Target-priority or draw-order changes.
- ECS conversion.

---

## Required Tests

Add characterization tests before replacing existing reset logic.

### Factory

Verify:

- separate factory calls return separate objects and arrays;
- all arrays start empty;
- mutation does not leak between instances.

### Stable identity

For representative ordinary, projectile, procedural, special, boss-associated, and transient collections:

- retain the original reference;
- seed a sentinel;
- run a reset profile;
- verify the reference is unchanged;
- verify expected retained or cleared content.

### Reset profiles

Seed every canonical collection and test exact membership for:

- boss entry;
- zone switch;
- normal death/restart;
- boss death/restart.

Pay special attention to:

- teleport particles;
- Nadir cube collections;
- Stardust;
- lucky motes/popups;
- hit, shot, damage, and death visuals;
- spawn queue.

Test every profile for idempotency.

### Context wiring

Verify update, draw, targeting, wave, and restart consumers observe the same array references and that clearing them does not require rebuilding contexts.

### Existing integration coverage

Run tests covering targeting, waves, death/restart, boss waves, Horizon special encounters, procedural enemies, statuses, and weapon targeting. Do not weaken tests to fit the refactor.

---

## Investigation Questions

Record answers with code references in this document:

1. Should boss entry clear teleport particles?
2. Are Nadir collections cleared indirectly before boss entry or zone switch?
3. Should restart clear Stardust?
4. Should restart clear teleport particles?
5. Should combo and ward effects survive any reset path?
6. Which visual arrays are encounter-owned?
7. Does `clearVerdurePlants()` perform extra cleanup?
8. Which consumers retain stable array references?
9. Does any subsystem replace collection properties rather than mutate contents?
10. Can broad contexts migrate without circular imports?

---

## Implementation Sequence

1. Read repository and agent instructions.
2. Inspect current `main`; current code overrides this plan's assumptions.
3. Confirm branch, build, working tree, unrelated changes, and auto-sync activity.
4. Inspect commits after Build 332.
5. Run baseline typecheck, tests, lint, browser build, and desktop build.
6. Inventory every collection and consumer.
7. Build a membership matrix covering update, draw, target, wave/dead sweep, reset profiles, Verdure correction, overlay fade, and specialized consumers.
8. Add current-behavior characterization tests.
9. Resolve the investigation questions.
10. Add the canonical interface and factory.
11. Instantiate it once in `createRpgRender()`.
12. Preserve local aliases initially when that makes migration safer.
13. Replace boss-entry reset logic.
14. Replace zone-switch reset logic.
15. Migrate death/restart.
16. Align update collections.
17. Migrate draw, targeting, and wave contexts incrementally.
18. Run focused tests after each migration.
19. Remove duplicate inventories only after consumers compile.
20. Inspect hot paths for new allocation or reflection.
21. Update documentation and build number.
22. Run complete validation and smoke tests.
23. Update this document's checklist, findings, validation, work log, ideas, and final report.
24. Review the complete diff.
25. Commit and push according to repository instructions.
26. Stop after this phase.

---

## Constraints and Performance Discipline

Do not:

- change balance, enemy types, stats, waves, targeting, collision, or draw order;
- change reset membership without evidence;
- introduce an ECS, service locator, generic manager, or event bus;
- allocate lists or result objects per frame;
- use per-frame `Object.keys()`, flattening, proxies, or dynamic string lookup;
- replace stable arrays;
- add `any` or weaken types;
- silence lint or tests;
- reformat unrelated files;
- modify the separate inactive Equatoria RPG project;
- overwrite user changes or rewrite auto-sync commits.

Do not claim a frame-rate improvement. Expected gains are correctness, maintainability, and testability.

Reset helpers may iterate static key tuples during infrequent lifecycle events. Hot update/draw paths should retain direct property access and current iteration order.

---

## Validation

Run and report exact exit codes:

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run build:desktop
```

Classify failures as introduced, pre-existing, environmental, unrelated but newly discovered, or intentionally deferred. Never report a nonzero command as passing.

Browser smoke-test:

- startup and RPG entry;
- ordinary wave and completion;
- normal death/restart;
- boss entry, boss death/restart, and victory;
- zone switching with active entities;
- Horizon/Nadir and True-surface switching;
- ALIVEN, Life, and procedural waves;
- return to Equation and back;
- available disposal/replacement path.

Verify no stale enemies, old projectiles, duplicated collections, missing rendering, targeting regressions, stuck completion, or console errors.

Run available Electron checks. Run web/Capacitor checks that do not require unavailable local SDKs. Do not claim native-device validation unless it occurred.

---

## Acceptance Criteria

Phase Three is complete only when:

- one canonical factory creates encounter collections;
- arrays remain stable references;
- boss-entry, zone-switch, and restart profiles are explicit and tested;
- current differences are preserved or intentionally corrected with regression evidence;
- update collections no longer independently define a drifting inventory;
- major broad contexts consume typed collection views;
- all major consumers observe the same references;
- no per-frame allocation or reflection is introduced;
- gameplay and serialization remain compatible;
- documentation and this plan are updated;
- exact validation, limitations, commits, push status, and final working tree are reported.

---

## AI Agent Instructions

These instructions are model-neutral and apply equally to Codex and Claude.

### Before work

- Read this document completely.
- Read `agents.md`, `CLAUDE.md`, current architecture/status documents, and repository workflow instructions.
- Treat current source as authoritative.
- Inspect commits after the baseline.
- Preserve unrelated work.
- Do not reset or force-checkout auto-sync changes.
- Record baseline commands and exact results in this document.

### During investigation

- Build the collection membership matrix before coding.
- Identify every stable-reference consumer.
- Record reset-profile differences with exact file/function evidence.
- Distinguish confirmed defects from suspicious differences.
- Do not clean up uncertain behavior.

### During implementation

- Add characterization tests first.
- Work incrementally.
- Keep the module Node-safe.
- Avoid hot-path allocation.
- Preserve direct property access and ordering.
- Run focused tests after each context migration.
- Add improvement ideas to this document instead of silently expanding scope.

### Required document updates

Update throughout the work:

1. Implementation Checklist
2. Collection Membership Matrix
3. Reset Profile Findings
4. Validation Results
5. Agent Work Log
6. Ideas for Improvement
7. Final Phase Report

Append work-log entries; do not erase earlier entries.

### Work-log format

```markdown
### YYYY-MM-DD HH:MM — Agent/model

**Status:** investigating | testing | implementing | validating | blocked | complete

**Work completed:**
- ...

**Evidence/findings:**
- ...

**Validation:**
- `command` — exit code — result

**Behavioral decisions:**
- ...

**Blockers/limitations:**
- ...

**Next action:**
- ...
```

### Improvement-idea format

Each idea must include:

- evidence;
- expected value;
- risk;
- whether it belongs in this phase;
- status: `candidate`, `accepted`, `deferred`, or `rejected`.

Do not implement deferred work without authorization.

### Final report

Append:

- baseline architecture;
- collection inventory;
- reset profiles characterized;
- behavioral deltas;
- module/interfaces added;
- contexts migrated;
- files and tests changed;
- exact validation commands and exit codes;
- browser, desktop, and mobile checks;
- performance/allocation and compatibility assessments;
- remaining risks;
- exactly one recommended next action;
- build, branch, commit hashes, auto-sync involvement, push result, and working-tree status.

---

## Implementation Checklist

- [x] Read repository and agent instructions.
- [x] Confirm branch, build, working tree, and auto-sync state.
- [x] Inspect commits after Build 332.
- [x] Run baseline typecheck, tests, lint, browser build, and desktop build.
- [x] Inventory collections and consumers.
- [x] Build the collection membership matrix.
- [x] Characterize boss-entry, zone-switch, normal-restart, and boss-restart behavior.
- [x] Investigate teleport, Nadir, Stardust, and transient ownership differences.
- [x] Add factory and stable-reference tests.
- [x] Add exact reset-profile and idempotency tests.
- [x] Add context-wiring tests.
- [x] Implement canonical interface and factory.
- [x] Implement typed subsets and reset profiles.
- [x] Instantiate collections once in `createRpgRender()`.
- [x] Replace boss-entry and zone-switch clear lists.
- [x] Migrate death/restart.
- [x] Align update, draw, targeting, and wave contexts.
- [x] Review optional movable-body and overlay-fade subsets.
- [x] Confirm no circular imports or hot-path allocation.
- [x] Update documentation and build number.
- [x] Run focused and complete validation.
- [x] Perform available browser and desktop smoke tests.
- [x] Record limitations, work log, ideas, and final report.
- [x] Review the diff, commit, push, and confirm final status.

---

## Collection Membership Matrix

Recorded from `rpg-render-update.ts`, `rpg-render-draw.ts`, `rpg-targeting-*`,
`rpg-wave-manager.ts`, `rpg-wave-dead-enemies-*`, and the three reset call sites before migration.
`Y` means direct participation or direct clearing; `-` means no direct participation. `N` is
normal restart and `BR` is the effective boss-restart result after boss exit and re-entry. `V` is
Verdure resize correction and `O` is overlay fading.

| Collection | U | D | T | W/dead | Boss | Zone | N | BR | V | O | Specialized evidence |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `spawnQueue` | Y | - | - | Y | Y | Y | Y | Y | - | - | Wave spawning and completion gate |
| `enemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Ordinary laser enemy |
| `sapphireEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Gem enemy |
| `sapphireMissiles` | Y | Y | Y | Y | Y | Y | Y | Y | - | - | Targetable projectile |
| `emeraldEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Gem enemy |
| `amberEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Gem enemy |
| `amberShards` | Y | Y | Y | Y | Y | Y | Y | Y | - | - | Targetable sub-entity |
| `voidEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Gem enemy |
| `quartzEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Gem enemy |
| `quartzSpikes` | Y | Y | Y | Y | Y | Y | Y | Y | - | - | Targetable sub-entity |
| `rubyEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Gem enemy |
| `rubyBolts` | Y | Y | Y | Y | Y | Y | Y | Y | - | - | Targetable sub-entity |
| `sunstoneEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Gem enemy |
| `citrineEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Gem enemy |
| `citrineBolts` | Y | Y | Y | Y | Y | Y | Y | Y | - | - | Targetable sub-entity |
| `ioliteEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Gem enemy |
| `amethystEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Gem enemy |
| `amethystShards` | Y | Y | Y | Y | Y | Y | Y | Y | - | - | Targetable sub-entity |
| `diamondEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Gem enemy |
| `diamondShards` | Y | Y | Y | Y | Y | Y | Y | Y | - | - | Targetable sub-entity |
| `nullstoneEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Gem enemy |
| `voidTendrils` | Y | Y | Y | Y | Y | Y | Y | Y | - | - | Targetable sub-entity |
| `fracterylEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Gem enemy |
| `fracterylShards` | Y | Y | Y | Y | Y | Y | Y | Y | - | - | Targetable sub-entity |
| `eigensteinEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Gem enemy |
| `eigensteinBeams` | Y | Y | - | - | Y | Y | Y | Y | - | - | Beam lifetime is owned by Eigenstein update |
| `eliteEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Elite sweep, buff registry |
| `polyominoEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Verdure polyomino |
| `fissilePolyominoEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Verdure polyomino |
| `refractorPolyominoEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Verdure polyomino |
| `binaryRingEnemies` | Y | Y | Y | - | Y | Y | Y | Y | - | Y | Binary Ring special encounter |
| `binaryRingMissiles` | Y | Y | - | - | Y | Y | Y | Y | - | - | Binary Ring special encounter |
| `nadirCubePointEnemies` | Y | Y | Y | Y | - | - | Y | Y | - | Y | Nadir cube and True-surface entities; indirect transition cleanup |
| `nadirCubeMines` | Y | Y | - | Y | - | - | Y | Y | - | - | Nadir cleanup helper |
| `nadirCubeTrailSegments` | Y | Y | - | Y | - | - | Y | Y | - | - | Nadir cleanup helper |
| `nadirCubeTurretBolts` | Y | Y | - | Y | - | - | Y | Y | - | - | Nadir cleanup helper |
| `nadirCubeLinkLasers` | Y | Y | - | Y | - | - | Y | Y | - | - | Nadir cleanup helper |
| `stardustEnemies` | Y | Y | - | Y | Y | Y | Y* | Y | - | Y | `Y*` is the evidenced normal-restart correction |
| `horizonPentagonGroups` | Y | Y | Y | Y | Y | Y | Y | Y | - | - | Horizon/True group owns shadows and missiles |
| `alivenGroups` | Y | Y | Y | Y | Y | Y | Y | Y | - | - | ALIVEN particle groups |
| `lifeColonies` | Y | Y | Y | Y | Y | Y | Y | Y | - | - | Life colony controllers |
| `dustWispEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Procedural body |
| `ribbonWormEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Procedural body |
| `lanternMothEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Procedural body |
| `eyeStalkEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Procedural body |
| `jellyfishEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Procedural body |
| `eliteJellyfishEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Procedural elite body |
| `clothGhostEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Procedural body |
| `plantTurretEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Procedural body |
| `gearInsectEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Procedural body |
| `spiderCrawlerEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Procedural body |
| `moteSwarmEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Procedural body |
| `shadowHandEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Procedural body |
| `sandFishEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Procedural fish body |
| `quartzFishEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Procedural fish body |
| `rubyFishEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Procedural fish body |
| `sunstoneFishEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Procedural fish body |
| `emeraldFishEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Procedural fish body |
| `sapphireFishEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Procedural fish body |
| `amethystFishEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Procedural fish body |
| `diamondFishEnemies` | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Procedural fish body |
| `plantProjectiles` | Y | Y | Y | Y | Y | Y | Y | Y | - | - | Targetable procedural projectile |
| `fishMines` | Y | Y | - | Y | Y | Y | Y | Y | - | - | Procedural hazard |
| `fishSpikes` | Y | Y | - | Y | Y | Y | Y | Y | - | - | Procedural hazard |
| `fishBolts` | Y | Y | - | Y | Y | Y | Y | Y | - | - | Procedural hazard |
| `fishDecoys` | Y | Y | - | Y | Y | Y | Y | Y | - | - | Procedural hazard |
| `bossProjectiles` | Y | Y | - | Y | Y | Y | Y | Y | - | - | Boss attack and boss-defeat cleanup |
| `teleportParticles` | Y | Y | - | - | - | Y | - | Y | - | - | Boss teleport; boss exit supplies BR clear |
| `luckyMotes` | Y | Y | - | Y | Y | Y | Y | Y | - | - | Reward output of dead-enemy sweep |
| `luckyMotePopups` | Y | Y | - | - | Y | Y | Y | Y | - | - | Lucky-mote collection feedback |
| `hitEffects` | Y | Y | - | - | Y | Y | Y | Y | - | - | Encounter-scoped combat visual |
| `shotLines` | Y | Y | - | - | Y | Y | Y | Y | - | - | Encounter-scoped combat visual |
| `damageNumbers` | Y | Y | - | - | Y | Y | Y | Y | - | - | Encounter-scoped combat visual |
| `deathParticles` | Y | Y | - | - | Y | Y | Y | Y | - | - | Player-death burst; trigger/reset mutate in place |

---

## Reset Profile Findings

### Boss entry

**Current clear membership:** Every canonical collection except the five Nadir arrays and
`teleportParticles`, in `rpg-render.ts::clearStageForBossFight()`.  
**Intent evidence:** Boss entry originates outside an active boss wave; teleport particles are
only created by the boss teleport system and are cleared by boss exit. Nadir arrays are
specialized and are cleared by `rpg-render-update.ts::clearNadirCubeEncounter()` on the next
non-Nadir/boss update.  
**Retained collections:** `nadirCubePointEnemies`, `nadirCubeMines`,
`nadirCubeTrailSegments`, `nadirCubeTurretBolts`, `nadirCubeLinkLasers`, and
`teleportParticles`.  
**Potential defects:** None proven. Preserve the direct profile and its deferred Nadir seam.

### Zone switch

**Current clear membership:** Every canonical collection except the five Nadir arrays in
`rpg-render.ts::resetActiveEncounterForZoneSwitch()`.  
**Intent evidence:** Teleport particles are cleared directly (and also by boss exit when leaving
an active boss). The update loop clears non-applicable Nadir/True cube entities after the active
zone/subzone changes.  
**Retained collections:** The five Nadir arrays until the next update.  
**Potential defects:** None proven. Preserve the specialized deferred cleanup and update order.

### Death/restart

**Current clear membership:** Direct `doRestart()` clears every canonical collection except
`stardustEnemies` and `teleportParticles`. On boss restart, `exitBossWave()` clears teleport
particles and synchronous boss re-entry clears Stardust, so the effective boss profile clears all
canonical collections.  
**Intent evidence:** `rpg-death-restart.ts` documents restart as clearing entity arrays and resetting
within-run combat state. Stardust participates in update, draw, dead sweeping, and wave completion;
retaining a live Stardust enemy across normal restart leaves an entity from the abandoned encounter
and can block the respawned wave. Normal gameplay cannot create boss teleport particles, while boss
restart already clears them through the boss owner.  
**Retained collections:** Normal restart retains `teleportParticles`; the pre-refactor code also
retains `stardustEnemies`. Boss restart retains none after its full exit/re-entry sequence.  
**Potential defects:** The normal-restart Stardust omission is a confirmed ownership/reset defect.

**Approved behavioral deltas:** Add `stardustEnemies` to normal death/restart clearing after a
focused failing regression test. Preserve teleport and Nadir profile differences.

### Investigation-question answers

1. **Boss entry and teleport particles:** No direct clear. Boss entry cannot overlap an existing
   boss (`rpg-boss-wave.ts::startBossFight()` guard), and the boss teleport owner clears particles
   on boss exit. Preserve current membership.
2. **Indirect Nadir cleanup:** Yes. `runRpgUpdate()` calls `clearNadirCubeEncounter()` when the
   Nadir tenth-wave condition is false; this happens on the next update after boss entry or a zone
   change. True-surface entities share `nadirCubePointEnemies` and are distinguished by
   `surfaceKind`.
3. **Restart and Stardust:** Yes. Normal restart must clear it; otherwise the old target remains
   update/draw/wave-owned after scalar wave state resets.
4. **Restart and teleport particles:** Preserve the current split: normal restart does not clear
   them directly; boss restart clears them through `exitBossWave()`.
5. **Combo and ward effects:** Neither belongs to encounter collections. `comboEffects` currently
   survives all three encounter resets and expires through its own timer. `wardEffects` survives
   boss entry and zone switching but is cleared with player statuses by the restart callback.
6. **Encounter-owned visuals:** `teleportParticles`, `luckyMotes`, `luckyMotePopups`, `hitEffects`,
   `shotLines`, `damageNumbers`, and `deathParticles` are per-renderer, mutate in place, and share
   the encounter reset boundary. Weapon visuals, orbit projectiles/particles, afterimages, combo,
   and ward effects retain their existing owners.
7. **Verdure cleanup:** `clearVerdurePlants()` also clears module-owned `verdureFragments` and
   resets the module spawn timer to 1500 ms; it must remain specialized.
8. **Stable-reference consumers:** Targeting, wave/dead sweep, movement, orbit-projectile,
   player-attack/weapon systems, death/restart, draw, and update contexts are constructed once and
   retain direct references. `createWaveManager()` additionally destructures those references once.
9. **Property replacement:** No canonical candidate array is replaced; renderer bindings are
   `const` and consumers use push/splice/in-place length truncation. Separately owned values such as
   `orbitProjectiles` and the weapon laser-beam object can be replaced and are intentionally out.
10. **Circular imports:** Broad contexts can migrate safely. The canonical module imports only leaf
    entity types with `import type`; update, draw, targeting, wave, and restart import the canonical
    type/helper, and the canonical module imports none of those consumers.

---

## Validation Results

| Command / Scenario | Exit / Result | Classification | Notes |
|---|---:|---|---|
| Baseline `npm run typecheck` | 0 | Passed | `npm.cmd run typecheck` |
| Baseline `npm test` (restricted first attempt) | 1 | Environmental | Vitest/esbuild could not load the config because the wrapper was denied directory access; not described as passing |
| Baseline `npm test` (approved rerun) | 0 | Passed | 72 files and 1469 tests passed; expected invalid-URL Boss MIDI stderr remained |
| Baseline `npm run lint` | 0 | Passed | `npm.cmd run lint` |
| Baseline `npm run build` | 0 | Passed | TypeScript + Vite; existing chunk-size warning |
| Baseline `npm run build:desktop` | 0 | Passed | TypeScript + Vite; existing chunk-size warning |
| Focused collection tests | 0 | Passed | 11 tests; exact factory/profile/reference/context/restart coverage |
| Pre-fix Stardust regression | 1 | Expected red | 7 passed, 1 failed because normal restart retained the seeded Stardust enemy; passed after the one-key profile correction |
| RPG renderer test directory | 0 | Passed | 21 files and 348 tests during migration |
| Final `npm run typecheck` | 0 | Passed | `npm.cmd run typecheck` |
| Final `npm test` | 0 | Passed | 73 files and 1480 tests; expected Boss MIDI invalid-URL stderr remained |
| Final `npm run lint` | 0 | Passed | `npm.cmd run lint` |
| Final `npm run build` | 0 | Passed | 441 modules; existing chunk-size warning |
| Final `npm run build:desktop` | 0 | Passed | 441 modules; existing chunk-size warning |
| Browser RPG smoke | Passed | Passed | Startup, RPG entry, ordinary combat/update/draw/targeting, Wave 100 jump, and Equation-to-RPG re-entry remained responsive |
| Death/restart smoke | Passed | Passed | Player HP fell from 100 to 48 during the Wave 100 run and later returned to 100 without manual restart input, with the RPG view active; collection reset behavior is also directly covered by Node tests |
| Boss entry/restart smoke | Partial | Limited | Wave 100 transition exercised; boss death/restart and boss victory were not completed interactively and are covered only by focused restart and existing boss tests |
| Zone-switch smoke | Not run | Limited | Fresh profile had no unlocked Horizon/Nadir/True/ALIVEN/Life surfaces; no claim of interactive coverage |
| Electron smoke | 0 | Passed with warnings | Hidden launch stayed alive for 8 seconds and logged `Renderer finished loading`; existing missing menu-background frame warnings remained, with no load failure or uncaught exception in the captured tail |
| Capacitor doctor | Terminated | Environmental | Both `npx.cmd cap doctor` and the direct local CLI produced no output and were terminated rather than called passing |
| Capacitor Android sync | 0 | Passed | Local Capacitor 8.4.0 copied the built web assets and updated Android plugins; no native device run |

---

## Agent Work Log

### 2026-07-12 — Planning review

**Status:** plan created

**Work completed:**

- Verified Build 332 completed the application-runtime lifecycle phase.
- Reviewed the RPG renderer composition root and broad subsystem contracts.
- Compared boss-entry, zone-switch, and death/restart clearing behavior.
- Evaluated general renderer decomposition, a full state store, ECS conversion, campaign initialization cleanup, and collection ownership.

**Evidence/findings:**

- Encounter arrays are individually owned and repeatedly enumerated.
- The update loop already provides a viable bundle seam.
- Reset paths maintain overlapping lists with unresolved differences.
- A collection-only owner improves correctness without centralizing scalar or service state.

**Validation:**

- Current source and recent commits were inspected through the connected GitHub repository.
- No source code was modified during planning.
- No repository commands or runtime smoke tests were executed during planning.

**Behavioral decisions:**

- No reset difference is classified as a defect at planning time.
- Preserve behavior first; correct only demonstrated defects.

**Limitations:**

- Browser, Electron, and Capacitor runtime behavior was not exercised.
- Historical renderer line counts are not a success metric.

**Next action:**

- Implement Phase Three according to this document.

### 2026-07-12 23:18 — Codex (GPT-5)

**Status:** investigating

**Work completed:**

- Fast-forwarded local `main` to `origin/main` and preserved the committed Phase Three plan.
- Read the required repository, architecture, status, routing, convention, decision, and file-guide documents.
- Inspected the only commit after Build 332 and the update, draw, targeting, wave/dead-sweep,
  death/restart, boss, movement, weapon, procedural, and special-encounter ownership paths.
- Recorded the full 74-collection membership matrix and resolved all ten investigation questions.

**Evidence/findings:**

- Baseline HEAD is `3b9c5ef39ca6a0290116e6038f42666a9aa91e5a`; Build 332 phase baseline is
  `938315712323aeedbe957a92fac7647eff8670c3`.
- Baseline branch was clean `main`, synchronized with `origin/main`, at build 332 with no unrelated
  user changes.
- Multiple Git processes were active; process inspection was partially access-limited, so HEAD and
  status will be rechecked at edit and commit boundaries rather than treating auto-sync as absent.
- Boss-entry and zone-switch Nadir omissions are followed by specialized next-update cleanup.
- Normal restart omits Stardust even though Stardust remains update/draw/wave-owned, making the stale
  entity observable and capable of blocking completion after respawn.

**Validation:**

- `npm.cmd run typecheck` — exit 0 — passed.
- `npm.cmd test` — exit 1 — environmental restricted-wrapper failure loading Vitest config.
- `npm.cmd test` (approved rerun) — exit 0 — 72 files and 1469 tests passed.
- `npm.cmd run lint` — exit 0 — passed.
- `npm.cmd run build` — exit 0 — passed with the existing chunk-size warning.
- `npm.cmd run build:desktop` — exit 0 — passed with the existing chunk-size warning.

**Behavioral decisions:**

- Preserve boss-entry teleport retention, deferred Nadir cleanup, normal teleport retention, and
  player-owned combo/ward behavior.
- Add a focused failing regression before correcting normal-restart Stardust retention.
- Keep Verdure, weapon, orbit, afterimage, combo, and ward cleanup with their current owners.

**Blockers/limitations:**

- Runtime smoke testing has not yet been performed.
- Native Android device validation is not available from the baseline command set.

**Next action:**

- Add the Node-safe canonical factory and current-profile characterization tests without removing
  the existing reset lists.

### 2026-07-12 23:55 - Codex (GPT-5)

**Status:** complete

**Work completed:**

- Added `rpg-encounter-collections.ts` with the canonical 74-array interface, a fresh-array
  factory, typed membership tuples, and in-place boss-entry, zone-switch, normal-restart, and
  boss-restart profiles.
- Added the factory, exact-membership, idempotency, stable-reference, shared-context, and
  `doRestart()` characterization suite before removing the old duplicated clear inventories.
- Instantiated the owner once in `createRpgRender()` and migrated update, draw, targeting, wave,
  and restart contexts without changing their direct frame-path access or ordering.
- Replaced the boss-entry, zone-switch, and death/restart clear lists while leaving Verdure,
  Nadir transition cleanup, weapon reset, dying-enemy cleanup, elite registries, boss/MIDI,
  fluid, auto-move, combo, and ward cleanup with their existing owners.
- Updated the repository maps, status, changelog, file guide/index, architecture, decisions, TODO,
  and build number from 332 to 333.

**Evidence/findings:**

- Each factory call owns 74 fresh arrays, and every profile truncates in place.
- The old normal-restart Stardust omission was reproduced by a focused test: the first run exited
  1 with 7 tests passing and the seeded Stardust array still populated. Adding only
  `stardustEnemies` to the normal profile made the regression and full exact-profile test pass.
- `rg` found no production assignment to a canonical collection property. The only
  `Object.keys()` completeness check is test-only; lifecycle profiles use typed static tuples.
- The canonical module imports only entity types and imports no consumer, so the migrated type-only
  dependency direction does not introduce a cycle.
- Auto-sync preserved and pushed the work in four commits; the temporary Vite log content captured
  by one commit was restored exactly by the subsequent housekeeping commit, leaving no net log diff
  from the phase baseline.

**Validation:**

- Focused collection suite: exit 0, 11 tests passed.
- RPG renderer test directory during migration: exit 0, 21 files and 348 tests passed.
- Final typecheck, lint, full tests, browser build, and desktop build all exited 0.
- Full suite: 73 files and 1480 tests passed.
- Browser smoke covered startup, RPG entry, ordinary combat, Wave 100, the observed automatic HP
  reset consistent with death/restart, and
  Equation-to-RPG re-entry.
- Hidden Electron launch stayed alive for 8 seconds and reached `Renderer finished loading`.
- Direct `cap sync android` exited 0 after copying the final build and updating Android plugins.

**Behavioral decisions:**

- Corrected normal death/restart to clear stale Stardust enemies.
- Preserved boss-entry teleport retention, normal-restart teleport retention, deferred Nadir
  transition cleanup, all ordering, and every specialized cleanup boundary.
- Deferred Verdure movable-body, overlay-fade, and weapon-context compaction because none was needed
  to establish the canonical encounter owner and each would broaden the mechanical surface.

**Blockers/limitations:**

- Locked zones prevented interactive Horizon, Nadir, True, ALIVEN, and Life switching checks.
- Boss death/restart and boss victory were not completed interactively; focused and existing test
  coverage passed.
- Electron emitted existing missing menu-background-frame warnings, although the renderer loaded and
  the captured log tail contained no load failure or uncaught exception.
- Capacitor doctor produced no output and was terminated; Android sync passed, but no native device
  or release bundle was run.

**Next action:**

- Stop after Phase Three.

---

## Ideas for Improvement

### Canonical movable-body subset

- **Evidence:** Verdure resize correction manually enumerates body arrays.
- **Expected value:** New enemy families cannot accidentally remain embedded after regeneration.
- **Risk:** Medium; some families may require specialized correction.
- **Phase Three:** Optional when mechanically characterizable.
- **Status:** Deferred. The membership matrix was characterized, but introducing the subset is not
  required for reset ownership and would mix resize-specific semantics into this phase.

### Canonical overlay-fade body subset

- **Evidence:** Overlay fading manually enumerates body arrays behind floating UI.
- **Expected value:** New bodies participate consistently.
- **Risk:** Low to medium; projectiles must remain excluded.
- **Phase Three:** Optional.
- **Status:** Deferred. Existing order and membership remain explicit; no reproduced overlay defect
  justified another shared subset.

### Weapon-context compaction

- **Evidence:** Player-attack and weapon contexts repeat broad collection inventories.
- **Expected value:** Smaller interfaces and easier enemy additions.
- **Risk:** Medium to high due to specialized callbacks and rules.
- **Phase Three:** Only when mechanical.
- **Status:** Deferred by default.

### Campaign starting-options helper

- **Evidence:** Official and custom campaign startup paths duplicate starting-state application.
- **Expected value:** Prevents initialization drift.
- **Risk:** Low to medium.
- **Phase Three:** No.
- **Status:** Deferred.

### Centralized scalar encounter lifecycle

- **Evidence:** Boss, wave, phase, terrain, and player-reset state remains distributed.
- **Expected value:** Potentially simpler coordination.
- **Risk:** High; likely god object.
- **Phase Three:** No.
- **Status:** Rejected until a narrower boundary is demonstrated.

---

## Final Phase Report

### Outcome

Phase Three is complete at Build 333 on `main`. The renderer now creates one
`RpgEncounterCollections` object per `createRpgRender()` call. Its 74 arrays are fresh per factory
call, retain identity for that renderer's lifetime, and are shared by the major update, draw,
targeting, wave/dead-sweep, and restart contexts. Reset helpers truncate static typed profiles in
place; no combat, draw, targeting, or wave order was changed.

### Baseline architecture and full inventory

Build 332 allocated encounter arrays independently in `rpg-render.ts`, passed repeated inventories
to broad contexts, and maintained overlapping clear lists in boss entry, zone switching, and
death/restart. The complete 74-collection inventory and consumer/reset membership is the matrix in
this document. Scalar wave/phase state, the player, boss objects and attack/MIDI state, terrain,
backgrounds, weapon internals, orbit projectiles, afterimages, combo/ward effects, audio, DOM, and
saves remain outside the collection owner.

### Reset profiles characterized

- Boss entry directly clears 68 collections and retains the five Nadir arrays plus
  `teleportParticles`; Nadir cleanup remains with the next-update specialized helper.
- Zone switching directly clears 69 collections and retains only the five Nadir arrays until the
  next update.
- Normal death/restart clears 73 collections and retains `teleportParticles`.
- Effective boss death/restart clears all 74 collections, including teleport particles through the
  boss lifecycle/profile.
- All profiles are exact-membership tested, idempotent, and preserve every array reference.

The ten investigation questions are answered in `Reset Profile Findings`. In summary: boss entry
does not directly clear teleport particles; Nadir arrays are cleared indirectly on transitions;
normal restart now clears Stardust; normal restart retains teleport; combo/ward effects retain
their separate owners; seven visual/reward families are encounter-owned; Verdure's helper also
clears fragments and resets its timer; broad consumers retain stable references; no canonical
property replacement was found; and type-only leaf imports avoided circular dependencies.

### Canonical module, migration, and behavioral delta

`src/render/rpg/rpg-encounter-collections.ts` provides `RpgEncounterCollections`,
`createRpgEncounterCollections()`, the canonical key tuple, four typed profile tuples, and the
three lifecycle helpers. `createRpgRender()` instantiates it once. `RpgUpdateCtx`/the aligned
`RpgEnemyUpdateArrays`, `RpgDrawCtx`, `RpgTargetingCtx`, `WaveManagerCtx`, and
`RpgDeathRestartCtx` all retain that same owner and its stable arrays. Existing local aliases remain
only where they reduce call-site churn; they point to canonical arrays.

The only intentional gameplay delta is that normal death/restart now clears `stardustEnemies`.
The omission was reproduced first: a seeded Stardust entity survived the abandoned encounter while
remaining update/draw/wave-owned. The correction added exactly that key; no other profile was made
symmetrical.

### Files and tests

Added:

- `src/render/rpg/rpg-encounter-collections.ts`
- `src/render/rpg/__tests__/rpg-encounter-collections.test.ts`

Migrated or adapted:

- `src/render/rpg/rpg-render.ts`
- `src/render/rpg/rpg-render-update.ts`
- `src/render/rpg/rpg-render-draw.ts`
- `src/render/rpg/rpg-targeting-types.ts`
- `src/render/rpg/rpg-wave-manager.ts`
- `src/render/rpg/rpg-death-restart.ts`
- `src/render/rpg/__tests__/life-zone.test.ts`
- `src/buildInfo.ts`

Updated living documentation:

- `RefactorPlan.md`, `ARCHITECTURE.md`, `DECISIONS.md`, and `file_index.md`
- `docs/AI_REPO_MAP.md`, `docs/CHANGELOG_FOR_AGENTS.md`, `docs/CURRENT_STATUS.md`,
  `docs/FILE_GUIDE.md`, and `docs/TODO.md`

The new 11-test suite covers factory isolation/emptiness, mutation isolation, exact reset
membership, stable identities, idempotency, Stardust regression behavior, representative ordinary,
projectile, procedural, special, boss, reward, and visual collections, shared update/draw/targeting/
wave/restart references, and normal/boss `doRestart()` integration. No test was weakened.

### Final validation and runtime checks

- `npm.cmd run typecheck` - exit 0.
- `npm.cmd test` - exit 0; 73 files and 1480 tests passed. The existing Boss MIDI invalid-URL
  diagnostic remained on stderr.
- `npm.cmd run lint` - exit 0.
- `npm.cmd run build` - exit 0; 441 modules, with the existing chunk-size warning.
- `npm.cmd run build:desktop` - exit 0; 441 modules, with the existing chunk-size warning.
- Focused collection suite - exit 0; 11 tests passed.
- Browser smoke - startup, RPG entry, ordinary combat, Wave 100, an automatic HP reset from 48 to
  100 without manual restart input, and Equation-to-RPG re-entry completed. The console showed only
  the existing missing Problem and Solution boss-icon warnings during the captured session.
- Electron smoke - exit 0 for the harness; the hidden app stayed alive for 8 seconds and logged
  `Renderer finished loading`. Existing missing menu-background-frame warnings remained.
- Capacitor - local CLI 8.4.0; `cap sync android` exited 0. Capacitor doctor did not complete and was
  terminated. No Android device, emulator, or release bundle validation was performed.
- Locked-zone switching, boss death/restart, and boss victory were not claimed as interactive
  coverage; the focused reset suite and existing Horizon, True, ALIVEN, Life, procedural, status,
  weapon, boss, zone-isolation, and lifecycle tests passed in the full suite.

### Performance, compatibility, and remaining risk

No performance improvement is claimed. Review found no new per-frame collection allocation,
reflection, dynamic key scan, target scan, or update/draw/targeting ordering change. The factory
allocates once per renderer; profile key iteration occurs only at lifecycle resets. Hot paths retain
direct property access. There is no module-level mutable state, DOM dependency, proxy, `any`, save
format change, setting change, or native-platform branch.

Compatibility is expected to remain intact across browser, Electron, Android/Capacitor, saves,
settings, rewards, boss lifecycle, special encounters, procedural enemies, and low-graphics mode
because the refactor preserves the same entity objects and array identities. The remaining risk is
limited to interactive paths not available in the fresh smoke profile: locked special-zone
transitions, a complete boss loss/restart, and boss victory. Electron's pre-existing missing
menu-background-frame warnings and the non-responsive doctor command are separate validation
limitations, not attributed to this phase.

### Git and delivery

- Branch: `main`.
- Build: 333.
- Phase delivery commits through the closeout report:
  - `f05af0af7fe3af30d88f3159e830541b6aeea0ce` - canonical module, initial tests, matrix/findings.
  - `e09c43f8e6be12bc3d376e5845b93947d807b649` - context/reset migration and Stardust correction.
  - `674ea79fd7ef383fbe9040636c04d1562f51492d` - documentation, build bump, final context/test cleanup.
  - `9eac55b34b238c53c15ce922c2c213b8fea2c3a7` - restore the tracked Vite smoke log exactly.
  - `5661a2db88927f29d6677caf962544b548c47868` - complete the living plan, validation record, and
    final phase report.
- Auto-sync involvement: the first four commits were created and pushed by auto-sync; none was
  reset, amended, or rewritten. The closeout report was committed and pushed intentionally.
- Push result: `5661a2db88927f29d6677caf962544b548c47868` pushed successfully to `origin/main`.
- Final status after that push: local `main` matched `origin/main` (`ahead 0`, `behind 0`) and the
  working tree was clean.

**Exactly one recommended next action:** Run one manual smoke session with an unlocked test save to
exercise boss loss/restart, boss victory, and Horizon/Nadir/True/ALIVEN/Life zone switching before
starting any separate refactor phase.

Do not remove the planning, evidence, checklist, matrix, findings, validation, ideas, or work-log sections above.

---

## Phase Four — Typed Encounter Body Profiles

**Planning baseline date:** 2026-07-13
**Baseline branch:** `main`
**Baseline build:** `333`
**Baseline commit:** `18d1f5c865a60c2db1157af2e7f62fcf3cc2aff5`
**Baseline working tree:** Clean; `main` matched `origin/main`
**Status:** Proposed; do not implement during the planning run

### Decision

Another narrowly scoped refactor phase is justified.

Phase Four should add two explicit, compiler-checked semantic body profiles to the existing
`RpgEncounterCollections` owner:

- bodies corrected when Verdure walls are regenerated after a resize; and
- living bodies considered when floating RPG overlay controls decide whether to fade.

This is not a continuation of Phase Three's ownership or reset migration. Phase Three is complete:
the 74 arrays already have one owner, stable identity, shared broad contexts, and tested reset
profiles. Phase Four should use that completed owner to remove two remaining local membership lists
whose semantics are narrower than update, draw, targeting, wave, or reset membership.

The strongest reason to proceed is the overlay-fade path. `updateOverlayFadeAlpha()` currently
constructs a new 42-entry `enemyArrays` array on every draw call. The Verdure resize path separately
maintains a 39-entry list and casts the complete nested list to a broad structural array type. Both
lists are correct enough to preserve first, but neither gives the compiler a named place to require
classification when a new positioned enemy family is added.

### Current-State Confirmation

The planning run confirmed:

- branch: `main`;
- build: `333` from `src/buildInfo.ts`;
- baseline commit: `18d1f5c` (`Auto-sync 2026-07-13 14:58:04`), containing only the updated
  application icon;
- recent refactor commits: `f8d227c` marked Phase Three delivery complete, and `5661a2d` recorded
  the completed encounter-collection phase report;
- local `main` and `origin/main` had no ahead/behind divergence;
- the working tree was clean before and after baseline validation;
- no source or build-number change is part of this planning run.

Phase Three's unlocked-save manual checks remain unavailable from the clean checkout. Do not
reinterpret that missing fixture as incomplete Phase Three implementation. The reproducible test,
build, and desktop checks below are the practical validation completed during this planning run.

### Evidence

#### Per-frame overlay membership allocation

`src/render/rpg/rpg-render-draw.ts::updateOverlayFadeAlpha()` declares `enemyArrays` inside the
per-frame function. The literal currently contains 42 canonical body collections, then performs a
nested scan until an overlap is found.

Consequences:

- one temporary array is allocated on every draw call whenever this function runs;
- membership is maintained independently from the canonical encounter owner;
- a newly added living body can update and draw correctly yet fail to fade a control that it
  visually overlaps;
- the body filter (`hp ?? 1`) and the separate player/boss handling are behavior that must be
  characterized before migration.

The overlay rectangle list returned by the DOM bridge is a separate concern. Phase Four must not
claim that the whole overlay path becomes allocation-free; its narrow performance result is removal
of the redundant per-frame collection-list allocation.

#### Verdure resize membership is independently maintained

`src/render/rpg/rpg-render.ts::rebuildVerdureBoundsForResize()` declares a separate 39-collection
body list. It pushes the player first, then repositions each listed enemy outside regenerated walls,
zeros optional velocity components, and finally calls specialized `clearVerdurePlants()` cleanup.

Consequences:

- the list is manually synchronized with the enemy inventory;
- the broad `as Array<Array<{ x; y; vx?; vy? }>>` cast weakens compiler pressure at the point where
  membership is authored;
- omission of a future Verdure-capable positioned family can leave it embedded in regenerated wall
  geometry;
- this list intentionally differs from the overlay profile and must not be replaced by one generic
  “all enemies” list.

#### The canonical owner is now a safe seam

`src/render/rpg/rpg-encounter-collections.ts` already provides:

- the canonical `RpgEncounterCollections` interface;
- one factory with stable renderer-local arrays;
- compiler-checked collection and reset-profile key tuples;
- a Node-safe module with type-only entity imports;
- focused tests for exact membership, identity, and context wiring.

This makes static semantic key tuples a smaller change than introducing a registry, manager,
visitor framework, or another collection owner.

### Phase Four Objective

Represent the two current body classifications as distinct typed profiles and migrate only their
existing consumers, preserving exact membership and behavior while removing the overlay path's
per-frame `enemyArrays` construction.

Tentative exports:

```ts
export const RPG_VERDURE_RESIZE_BODY_KEYS = [/* exact current membership */] as const;
export const RPG_OVERLAY_FADE_BODY_KEYS = [/* exact current membership */] as const;
```

Use a compile-time constraint derived from `RpgEncounterCollections` so:

- Verdure keys can only name collections whose elements have `x`, `y`, and optional `vx`/`vy`;
- overlay keys can only name collections whose elements have `x`, `y`, and an optional or required
  numeric `hp` compatible with the existing living-body rule;
- duplicate keys are rejected by tests;
- the profiles do not create renderer-instance arrays or per-frame views.

If TypeScript cannot express the heterogeneous indexed access cleanly without an unsafe production
cast, prefer a small Node-safe helper with an explicit structural contract. Do not add `any`, a
generic registry, reflection, or a callback abstraction that allocates closures in the draw loop.

### Scope Boundaries

#### Required

1. Add exact typed profiles for current Verdure-resize and overlay-fade membership.
2. Add characterization tests before changing either consumer.
3. Migrate `rebuildVerdureBoundsForResize()` to the Verdure profile.
4. Migrate `updateOverlayFadeAlpha()` to the overlay profile.
5. Remove the per-frame `enemyArrays` literal and preserve short-circuit scan order.
6. Preserve separate player and boss handling.
7. Preserve the overlay living-body rule, interpolation constant, padding, and alpha bounds.
8. Preserve Verdure push margins, velocity zeroing, wall regeneration order, player correction,
   and specialized plant cleanup.
9. Update the build number and only the repository maps/architecture documents whose stated
   responsibilities actually change.

#### Optional only when proven mechanical

- Move a small pure overlap predicate into a Node-safe helper to make behavior directly testable.
- Add a compile-time utility type for “collection keys whose element satisfies shape T” if it stays
  local, readable, and produces no runtime code.

#### Deferred

- Other repeated draw inventories such as terrain lighting, influence points, wave-label overlap,
  enemy barks, targeting, or weapon contexts.
- Replacing `getOverlayFadeRects()` with a reusable DOM rectangle buffer.
- General-purpose body iterators or visitors.
- Unifying the two profiles.
- Adding or removing any body family from current behavior without a reproduced defect.
- Renderer decomposition, ECS conversion, generic registries, or changes to collection ownership.
- Combat, targeting, draw-order, collision, field-space, wall-generation, or UI-design changes.

### Required Characterization Tests

Add tests before consumer migration.

#### Profile membership

- Assert the Verdure profile contains exactly the 39 collections currently listed in
  `rebuildVerdureBoundsForResize()`.
- Assert the overlay profile contains exactly the 42 collections currently listed in
  `updateOverlayFadeAlpha()`.
- Assert both profiles contain no duplicate keys.
- Assert every key exists in `RPG_ENCOUNTER_COLLECTION_KEYS`.
- Assert intentional differences explicitly, including Binary Ring, Nadir cube-point, and Stardust
  membership in overlay fade but not Verdure resize.
- Assert projectile, hazard, reward, visual-effect, spawn-queue, ALIVEN-group, Life-colony, and
  Horizon-group collections remain excluded unless current source evidence says otherwise.

#### Verdure behavior

- Seed representative ordinary, gemstone, elite, polyomino, procedural, and fish bodies.
- Verify every currently listed body is offered to the existing wall-push operation.
- Verify an adjusted body receives the scratch output and optional `vx`/`vy` are zeroed.
- Verify an unaffected body retains position and velocity.
- Verify the player remains handled separately with the existing larger margin expression.
- Verify `clearVerdurePlants()` remains caller-owned and is invoked after body correction.
- Characterize that the function is a resize/regeneration path, not a per-frame update.

#### Overlay behavior

- Seed one representative body from each membership category and verify overlap selects the faded
  target alpha.
- Verify dead bodies (`hp <= 0`) do not trigger fading.
- Verify bodies without an `hp` field retain the current `hp ?? 1` living behavior.
- Verify player overlap and boss overlap remain separate and preserve their existing padding.
- Verify no overlap returns the unfaded target.
- Verify scan short-circuits after the first live overlap.
- Verify the interpolation factor and 0.30 minimum alpha are unchanged.
- Add a structural test or review assertion that the consumer no longer creates a local
  collection-reference array each frame.

#### Existing coverage

Do not weaken the Phase Three collection tests. Run the encounter-collection, field-space,
viewport, expanded-bounds, Verdure, draw, zone-isolation, and renderer lifecycle tests that exist at
implementation time.

### Implementation Sequence

1. Read all current repository instructions and this entire plan.
2. Confirm branch, build, working tree, upstream divergence, and commits after `18d1f5c`.
3. Treat current source as authoritative if line numbers or memberships have changed.
4. Run baseline typecheck, full tests, lint, web build, and desktop build.
5. Copy the two current memberships into tests as explicit characterization expectations.
6. Record every intentional inclusion and exclusion before editing production code.
7. Add narrow structural utility types and the two static key tuples to the canonical collection
   module, or a sibling Node-safe semantic-profile module if import direction requires it.
8. Run the profile tests.
9. Migrate only Verdure resize correction; run focused Verdure and collection tests.
10. Migrate only overlay fading; verify no per-call collection-list literal remains and run focused
    draw/field-space tests.
11. Inspect generated JavaScript or the production source path enough to confirm the profiles are
    module-static and no replacement allocation/callback closure was introduced in the draw loop.
12. Run complete validation and practical browser/Electron smoke checks.
13. Update build number and narrowly relevant living documentation.
14. Review the full diff for behavior, ordering, allocations, casts, and unrelated changes.
15. Record exact commands, exit codes, limitations, commit, push, and final tree status.
16. Commit and push the implementation as one coherent phase, then stop.

### Acceptance Criteria

Phase Four is complete only when:

- both semantic profiles have exact, named, tested membership;
- the profiles are distinct and their differences are documented;
- every profile key is compiler-checked against compatible canonical collection element shapes;
- Verdure resize correction uses the canonical owner plus its named profile;
- overlay fading uses the canonical owner plus its named profile;
- no local per-frame array of encounter collection references remains in
  `updateOverlayFadeAlpha()`;
- current scan order and short-circuit behavior are preserved;
- player, boss, dead-body, no-`hp`, padding, interpolation, and alpha semantics are preserved;
- Verdure player margin, body margin, position correction, velocity reset, and plant cleanup are
  preserved;
- no canonical array is replaced and no new per-frame collection, object, closure, reflection, or
  dynamic key discovery is introduced;
- no collection is newly included or excluded without a failing regression and documented intended
  behavior;
- no save, settings, combat, target, draw-order, collision, field-space, or platform behavior
  changes;
- build number and relevant documentation are updated;
- complete validation passes or every nonzero result is accurately classified;
- the implementation is committed and pushed with a clean final working tree.

### Validation Commands

Run and report exact exit codes:

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run build:desktop
```

Also run focused tests for:

- `rpg-encounter-collections`;
- Verdure mechanics/geometry;
- RPG field space, viewport, and expanded bounds;
- any new pure overlay-profile helper.

Browser smoke-test:

- ordinary, elite, procedural, and fish bodies crossing registered floating controls;
- a dead body under a control;
- player and boss overlap behavior;
- Verdure resize with active ordinary, polyomino, procedural, and fish enemies;
- repeated resize without embedded bodies, stuck navigation, or plant-state leakage;
- low-graphics mode and Equation-to-RPG re-entry;
- console errors.

Run the hidden Electron startup smoke after `npm run build:desktop`. Native Android/device
validation is not required because this phase changes no platform branch or persistent state. Do
not claim unavailable locked-zone or device coverage.

### Risks and Mitigations

| Risk | Mitigation |
|---|---|
| A “shared” profile accidentally unifies different semantics | Keep two named tuples and test exact differences. |
| A body family is added or removed during migration | Characterize current membership first; require a failing regression for behavioral changes. |
| Heterogeneous array typing leads to `any` or broad casts | Use constrained key types or one narrow reviewed helper; reject `any`. |
| Overlay scan order or early exit changes | Preserve tuple order and add short-circuit tests. |
| Per-frame allocation is moved rather than removed | Inspect the draw path and keep profiles module-static; avoid mapped arrays and inline callback visitors. |
| Verdure specialized cleanup is absorbed into a generic helper | Leave player correction, wall scratch state, and `clearVerdurePlants()` with the caller. |
| Phase expands into every repeated enemy list | Enforce the required/deferred boundaries and stop after the two consumers. |
| Auto-sync or user work appears during implementation | Recheck status/HEAD before edits and commit; preserve unrelated changes and never reset them. |

### Model-Neutral Agent Instructions

These instructions apply to Codex, Claude, and any repository-capable implementation agent.

#### Before editing

- Read `AGENTS.md`/`agents.md`, `CLAUDE.md`, the required repository maps and conventions, current
  status/TODO, architecture/decisions, relevant `file_index.md` entries, and this plan in full.
- Confirm Phase Three is complete. Do not recreate its factory, ownership migration, reset profiles,
  matrix, or tests.
- Verify current code instead of trusting the planning line numbers or counts.
- Preserve unrelated and auto-sync work.
- Record baseline branch, build, HEAD, upstream relation, working tree, and validation.

#### During implementation

- Add characterization tests before production edits.
- Keep the profiles semantic and separate; do not invent “all bodies.”
- Use the existing canonical collections object and stable array identities.
- Preserve exact membership unless a behavior defect is reproduced first.
- Keep the per-frame loop direct and allocation-conscious.
- Do not introduce `any`, reflection, proxies, object-key discovery, registries, service locators, or
  generalized visitor infrastructure.
- Do not alter combat, targeting, draw order, wall geometry, save data, settings, or UI appearance.
- Run focused tests after each consumer migration.
- Put broader cleanup ideas in this plan as deferred evidence; do not implement them.

#### Before delivery

- Increment `BUILD_NUMBER` once because implementation will change code; do not bump save version.
- Update only documentation whose responsibilities or status changed.
- Run every validation command and report exact exit codes.
- Distinguish introduced, pre-existing, environmental, and unverified results.
- Review the diff and confirm only Phase Four implementation/documentation is included.
- Commit and push according to repository instructions.
- Report branch, build, commit, push result, and final working-tree/upstream status.
- Stop after Phase Four.

### Planning-Run Validation

| Command / check | Result | Classification |
|---|---:|---|
| `npm run typecheck` | Exit 0 | Passed |
| `npm test` (restricted first attempt) | Exit 1 | Environmental: Vitest/esbuild could not read `vitest.config.ts` through the sandbox wrapper |
| `npm test` (approved rerun) | Exit 0; 73 files, 1480 tests | Passed; existing Boss MIDI invalid-URL stderr remained |
| `npm run lint` | Exit 0 | Passed |
| `npm run build` | Exit 0; 441 modules | Passed with existing chunk-size warning |
| `npm run build:desktop` | Exit 0; 441 modules | Passed with existing chunk-size and plugin-timing warnings |
| Hidden Electron launch | Stayed alive for 8 seconds | Passed startup smoke; the tailed runtime log contained older 2026-06-29 missing-frame warnings, not fresh failure evidence |
| Unlocked special-zone/boss manual smoke | Not run | Fixture unavailable from clean checkout; not claimed |

No implementation from Phase Four was performed during this planning run.
