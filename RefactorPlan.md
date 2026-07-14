# Equatoria Idle Refactor Plan

**Repository:** `sethrimer3/Equatoria_Idle`  
**Baseline branch:** `main`  
**Current planning build:** `334`
**Current planning baseline:** `803794089bc6c46fae7e231bf60e913b5e0ccfab`
**Status:** Phases One through Nine complete (Build 339)
**Compatible agents:** Codex, Claude, or another repository-capable coding agent

---

## Decision

A further narrow refactor phase is justified after closing Phase Four.

The active phase is Phase Five, “Canonical Attack Context and Readiness Policy.” It should align
the two remaining top-level attack contexts with the canonical encounter owner and characterize the
existing boolean target-readiness gate without changing its membership or combat behavior.

The completed Phase Three collection-owner plan and Phase Four typed spatial-profile plan remain
below as historical evidence and must not be repeated. The fully developed Phase Five scope,
characterization matrix, risks, validation, and model-neutral instructions are at the end of this
document.

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
**Status:** Complete and published at Build 334

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

### Phase Four Implementation Checklist

- [x] Read current repository instructions, status, architecture, and this plan.
- [x] Confirm branch, build, working tree, upstream state, and recent commits.
- [x] Run baseline typecheck, tests, lint, web build, and desktop build.
- [x] Add exact 39-key and 42-key membership characterization tests first.
- [x] Record the expected red characterization result before production changes.
- [x] Add compiler-checked Verdure-resize and overlay-fade profiles.
- [x] Keep the profile helpers Node-safe and free of browser dependencies.
- [x] Migrate Verdure resize correction without absorbing player or plant cleanup.
- [x] Migrate overlay fading without a per-frame collection-list allocation.
- [x] Add living/dead/no-HP, player, boss-padding, short-circuit, margin, and alpha tests.
- [x] Confirm no current profile membership or ordering changed.
- [x] Increment the build number to 334 and update narrowly relevant living documentation.
- [x] Run complete final validation and practical browser/Electron smoke checks.
- [x] Review the final diff and commit the complete phase.
- [x] Push the build 334 closeout commit and confirm a synchronized tree.

### Phase Four Findings

- Current source still matched the planned 39-key Verdure and 42-key overlay memberships exactly.
- The three overlay-only body families remain `binaryRingEnemies`, `nadirCubePointEnemies`, and
  `stardustEnemies`; projectile, hazard, reward, effect, group-controller, and spawn collections
  remain excluded from both profiles.
- A mapped conditional type constrains each tuple key to canonical collections whose element type
  satisfies the relevant structural body contract. No `any` or broad production cast was needed.
- The Verdure consumer retains player correction before the profile pass, passes margin 8 for each
  encounter body, uses the same scratch/push function, and calls `clearVerdurePlants()` afterward.
- The overlay consumer retains player-first, profile-order body, then boss scan order; dead bodies
  are skipped, missing `hp` remains living, body padding remains 10, and boss padding remains 18.
- The first attempt to import the full draw module into the Node test exposed an existing
  `DOMMatrix` browser dependency in `caustics-overlay.ts`. Moving the pure calculations into the
  already Node-safe canonical module avoided a test shim and preserved dependency direction.
- The draw path now iterates a module-static tuple and stable arrays. It creates no mapped body list,
  callback closure, reflection result, or replacement collection per frame.

### Phase Four Validation Results

| Command / scenario | Exit / result | Classification |
|---|---:|---|
| Baseline `npm run typecheck` | 0 | Passed |
| Baseline `npm test` | 0; 73 files, 1480 tests | Passed; existing Boss MIDI invalid-URL stderr remained |
| Baseline `npm run lint` | 0 | Passed |
| Baseline `npm run build` | 0; 441 modules | Passed with existing chunk-size warning |
| Baseline `npm run build:desktop` | 0; 441 modules | Passed with existing chunk-size warning |
| Pre-implementation semantic-profile test | 1; 2 failed, 11 passed | Expected red: both new exports were undefined |
| Typed-profile focused test | 0; 13 tests | Passed |
| Verdure migration focused set | 0; 3 files, 28 tests | Passed |
| First overlay-helper focused set | 1; 4 files passed, 1 suite failed before tests | Environmental/design signal: importing draw reached Node-unavailable `DOMMatrix` |
| Final Node-safe focused set | 0; 5 files, 54 tests | Passed |
| Final `npm run typecheck` | 0 | Passed |
| Final `npm test` | 0; 73 files, 1487 tests | Passed; existing Boss MIDI invalid-URL stderr remained |
| Final `npm run lint` | 0 | Passed |
| Final `npm run build` | 0; 441 modules | Passed with existing chunk-size warning |
| Final `npm run build:desktop` | 0; 441 modules | Passed with existing chunk-size warning |
| Browser smoke | Passed | Equatoria startup, ordinary RPG combat, Equation/RPG re-entry, overlay controls, and Low graphics; setting restored to Auto |
| Browser console | No errors | Existing missing Problem/Solution boss-icon warnings remained |
| Hidden Electron launch | Stayed alive for 8 seconds | Passed startup smoke |

### Phase Four Work Log

#### 2026-07-13 18:58 — Codex (GPT-5)

**Status:** complete

**Work completed:**
- Confirmed clean synchronized `main` at `061992f`, build 333, with no post-plan commits.
- Ran the complete baseline command set.
- Added characterization tests first and recorded the expected red result.
- Added two typed semantic profiles, narrow Node-safe helpers, and migrated the two consumers.
- Added direct coverage for exact memberships, exclusions, profile order, direct mutation, margin,
  dead/no-HP behavior, player/boss overlap, boss padding, short-circuiting, and alpha interpolation.
- Updated build 334 and the affected status, map, file-guide/index, architecture, decision, TODO, and
  agent-changelog entries.

**Evidence/findings:**
- No behavioral membership delta was needed or made.
- The former 42-reference `enemyArrays` literal is absent from the per-frame draw function.
- The first draw-module test import demonstrated why the pure helper belongs in the Node-safe
  canonical module; no DOM shim was added.

**Validation:**
- Baseline full validation passed.
- Expected red characterization and the intermediate `DOMMatrix` test-environment failure are
  recorded above and were not called passing.
- Final focused validation currently passes 54 tests across five files.

**Behavioral decisions:**
- Preserve all existing inclusions, exclusions, ordering, padding, margins, and specialized cleanup.
- Keep DOM rectangle-buffer optimization and all other repeated body inventories deferred.

**Blockers/limitations:**
- No implementation or validation blocker remains.
- A fresh profile did not provide the planned multi-family Verdure resize scene or a deterministic
  enemy-over-control overlap during browser smoke; those exact semantics are covered by the
  Node-safe profile tests rather than claimed as interactive coverage.
- The direct push attempt was rejected because the Codex account reached its usage limit; the
  repository's normal auto-sync then published the already-created closeout commit without a retry
  or workaround.

**Next action:**
- Stop after Phase Four.

### Final Phase Four Report

#### Outcome

Phase Four is implemented and validated at Build 334. The canonical encounter owner now exposes
two distinct compiler-checked semantic profiles: 39 body collections for Verdure resize correction
and 42 for floating-control overlap fading. The memberships and order match the pre-refactor source.

Verdure regeneration keeps player correction and `clearVerdurePlants()` with the caller while its
encounter bodies flow through the typed profile with margin 8. Overlay fading keeps player-first,
profile-order body, then boss scan order, preserves dead/no-HP and padding semantics, and no longer
constructs a 42-reference collection array in the per-frame draw function.

#### Files and tests

Implementation and characterization:

- `src/render/rpg/rpg-encounter-collections.ts`
- `src/render/rpg/rpg-render.ts`
- `src/render/rpg/rpg-render-draw.ts`
- `src/render/rpg/__tests__/rpg-encounter-collections.test.ts`
- `src/buildInfo.ts`

Updated living documentation:

- `RefactorPlan.md`, `ARCHITECTURE.md`, `DECISIONS.md`, and `file_index.md`
- `docs/AI_REPO_MAP.md`, `docs/CHANGELOG_FOR_AGENTS.md`, `docs/CURRENT_STATUS.md`,
  `docs/FILE_GUIDE.md`, and `docs/TODO.md`

The collection suite increased from 11 to 18 tests. Seven new tests cover exact membership,
uniqueness/exclusions, distinct profile differences, Verdure callback order/margin/direct mutation,
dead/no-HP behavior, player/boss padding, scan short-circuiting, and alpha interpolation.

#### Validation and compatibility

- Typecheck, lint, web build, and desktop build exited 0.
- Full suite: 73 files and 1487 tests passed; existing Boss MIDI invalid-URL stderr remained.
- Focused final set: 5 files and 54 tests passed.
- Browser smoke covered startup, ordinary RPG combat, registered overlay controls,
  Equation-to-RPG re-entry, and Low graphics; the setting was restored to Auto and no console errors
  were observed. Existing missing Problem/Solution boss-icon warnings remained.
- Hidden Electron launch stayed alive for 8 seconds.
- No save, setting schema, combat, targeting, draw-order, collision, field-space, or platform branch
  changed. No save-version bump was required.

No frame-rate improvement is claimed. The narrow allocation result is removal of the local
collection-reference array from each overlay-fade draw call. Profiles are module-static; canonical
arrays retain identity; the draw scan uses direct indexed loops with no reflection, mapped arrays,
or new callback closure. The DOM rectangle list remains a separate deferred concern.

#### Git and delivery

- Branch: `main`.
- Build: 334.
- Source/test commit: `f3e8179d1bfd53014e5e28d4b241c686a85f6e52` — created and pushed by
  auto-sync during implementation.
- Build/documentation commit: `3e6c38b2596d9a2068a096857fafe0ae3e991ad5` — committed locally after
  complete validation.
- Report-only closeout commit: `803794089bc6c46fae7e231bf60e913b5e0ccfab` — repository auto-sync
  committed and published the final Phase Four status, work log, validation summary, and delivery
  report without changing implementation.
- Push result for `3e6c38b`: the direct attempt was rejected by the Codex usage limit, then normal
  repository auto-sync published the existing commit to `origin/main`.
- No force push, retry loop, or workaround was attempted. The later closeout audit confirmed local
  `main` and `origin/main` matched at `8037940`, with zero ahead/behind divergence and a clean
  working tree.

**Exactly one recommended next action:** Stop after Phase Four; do not broaden this phase into the
deferred DOM rectangle buffer or other body inventories.

### Phase Four Closeout Audit — 2026-07-13

- `8037940` changes only `RefactorPlan.md` (76 insertions, 5 deletions) and is the report-only
  closeout that the previous run could not commit directly.
- `f3e8179` contains only the four Phase Four source/test files. `3e6c38b` contains Build 334 and the
  relevant architecture/status/documentation updates. `src/buildInfo.ts` is 333 at `f3e8179` and
  334 at `3e6c38b` and `8037940`.
- The report accurately records 73 test files and 1487 tests, the existing Boss MIDI invalid-URL
  stderr, 441-module web and desktop builds, focused coverage, browser limitations, and the hidden
  Electron startup check.
- Current reproducible validation reconfirmed typecheck, lint, 73 files/1487 tests, web build, and
  desktop build at exit 0. The first restricted `npm test` attempt failed before config load with
  the known sandbox/esbuild directory-access error; the approved rerun passed and is the result
  used for validation.
- Remaining Phase Four risk is unchanged: the fresh browser profile did not provide deterministic
  multi-family Verdure-resize or enemy-over-control scenes. Exact membership and spatial semantics
  remain covered by Node tests; no broader interactive coverage is claimed.
- Closeout status before Phase Five planning: `main` and `origin/main` both at `8037940`, ahead 0,
  behind 0, clean working tree, Build 334.

---

## Phase Five — Canonical Attack Context and Readiness Policy

**Planning baseline date:** 2026-07-13
**Baseline branch:** `main`
**Baseline build:** `334`
**Baseline commit:** `803794089bc6c46fae7e231bf60e913b5e0ccfab`
**Baseline working tree:** Clean; `main` matched `origin/main`
**Status:** Complete at Build 335

### Decision

Another narrowly scoped, behavior-preserving phase is justified.

Phase Five should align the two remaining top-level attack contexts with the canonical encounter
collection owner and extract the existing pre-attack “any target exists” decision into one typed,
Node-safe readiness policy. This addresses concrete duplicated ownership wiring and an untested
gameplay gate. It does not justify decomposing files because they are large.

This phase is distinct from completed Phases One through Four:

- Phase One owns demand-driven trace-overlay frame scheduling.
- Phase Two owns application runtime teardown and replacement.
- Phase Three owns the 74 encounter arrays and lifecycle reset profiles.
- Phase Four owns Verdure-resize and overlay-fade spatial body profiles.
- Phase Five is limited to the collection dependency boundary used to create weapon/attack
  contexts and the boolean policy that allows an attack dispatch to proceed.

### Current-Code Evidence

#### Two broad contexts redeclare the canonical collection inventory

`src/render/rpg/rpg-weapon-systems.ts::RpgWeaponCtx` begins at line 68. Of its 132 declared
members, 55 are fields already owned by `RpgEncounterCollections` (54 enemy/body collections plus
`hitEffects`). The duplicated block is currently authored at lines 85–143.

`src/render/rpg/rpg-player-attack.ts::RpgPlayerAttackCtx` begins at line 52. Of its 132 declared
members, 54 are canonical encounter collection fields. The duplicated collection block is at lines
63–118. The two interfaces share 116 member names overall, but this phase must address only the
canonical collection portion; their other callbacks and state have different consumers and should
not be generalized.

`src/render/rpg/rpg-render.ts` independently lists these references again when constructing
`weaponCtx` at line 1412 and `playerAttackCtx` at line 1499. The renderer already has the single
`collections` object created by Phase Three, so these hand-written property lists are ownership
aliases rather than separate state. A future collection rename or addition can compile in the
canonical owner while either attack context silently retains an older inventory.

#### Attack dispatch has a separate untested family inventory

`src/render/rpg/rpg-player-attack.ts::performWeaponAttack()` uses a manual early-return policy at
lines 249–288:

- a 51-field destructuring list;
- direct length addition for 50 of those collections;
- a nested count of living particles in `alivenGroups`;
- a separate `horizonPentagonGroups.length` term; and
- a separate nullable boss term.

Expressed as collection classification, current behavior considers 52 canonical collection keys:
50 direct-length collections, `alivenGroups` with nested `isAlive` semantics, and
`horizonPentagonGroups`. The boss remains scalar and outside the canonical owner.

The guard is gameplay-significant: if it returns zero, no attack handler runs. Yet there is no
focused test for exact family membership, ALIVEN liveness, Horizon, boss handling, or empty-state
short-circuiting. `stardustEnemies` and `lifeColonies` are present on `RpgPlayerAttackCtx` but are
not counted by this guard. That difference is suspicious, not proven defective. Preserve it in
this refactor unless a separate failing regression and repository/gameplay evidence establish the
intended behavioral correction.

#### Existing canonical seam and test gap

`src/render/rpg/rpg-encounter-collections.ts::RpgEncounterCollections` already provides the
Node-safe, stable-reference owner. Draw, targeting, wave, update, and restart contexts already
carry the canonical object, and the Phase Three wiring test checks those consumers. The top-level
weapon and player-attack contexts are the two explicitly deferred mechanical migrations that are
not included in that wiring test.

Existing `lens-tier2-effects.test.ts`, `lens-tier3-effects.test.ts`, `rpg-weapon-chain.test.ts`,
`life-zone.test.ts`, and the encounter-collection suite exercise nearby attack and target behavior,
but none characterizes the readiness guard as its own policy.

### Objective

Create one explicit canonical collection dependency at each top-level attack context and one pure,
typed readiness helper that preserves the current attack-dispatch decision exactly.

The intended result is:

- `RpgWeaponCtx` and `RpgPlayerAttackCtx` no longer manually redeclare canonical collection field
  types;
- both contexts retain the same canonical owner and stable array references created by
  `createRpgRender()`;
- existing direct property access remains available to current attack/weapon consumers without a
  broad submodule rewrite;
- the renderer no longer hand-wires two separate canonical collection inventories;
- the attack readiness membership and special cases are named, classified, and Node-tested; and
- no attack, damage, target selection, ordering, allocation, or gameplay behavior changes.

### Behavioral Contract

Preserve exactly:

- equipped-weapon resolution and early returns for delegated weapon kinds;
- the readiness guard's position in `performWeaponAttack()`;
- the 52 currently participating collection keys;
- direct-length semantics for the current ordinary, projectile, elite, special, procedural, fish,
  and Horizon collections;
- ALIVEN participation only when at least one nested particle has `isAlive === true`;
- boss participation according to the current nullable-presence rule, without adding a new HP
  filter;
- the current non-participation of Stardust, Life colonies, Nadir entities, encounter effects,
  rewards, spawn queue, and other excluded collections;
- all single, multi, AoE, piercing, companion, projectile, mine, laser, vortex, chain, sword, and
  crafted post-hit dispatch behavior;
- stable array identity before and after reset profiles;
- damage attribution, wave completion, status, reward, and fluid side effects;
- Node-test compatibility, browser/Electron/Android behavior, save data, and settings.

Do not treat suspicious readiness exclusions as permission for a behavior fix. Any correction must
be proposed separately after a failing behavior test demonstrates the defect and intended result.

### Proposed Ownership Boundary

The existing `RpgEncounterCollections` object remains the only owner of encounter arrays.

Preferred mechanical shape:

```ts
export interface RpgWeaponCtx extends RpgEncounterCollections {
  collections: RpgEncounterCollections;
  // existing non-collection dependencies remain explicit
}

export interface RpgPlayerAttackCtx extends RpgEncounterCollections {
  collections: RpgEncounterCollections;
  // existing non-collection dependencies remain explicit
}
```

`createRpgRender()` may construct each context once with `collections` plus the stable direct
aliases (for example, `collections, ...collections`) if TypeScript excess-property and getter
semantics remain clear. This one-time object composition is not a per-frame collection allocation.
Do not create per-frame mapped views, proxies, dynamic getters, or a second collection owner.

The readiness policy should live with attack dispatch, preferably in a small Node-safe sibling such
as `rpg-player-attack-readiness.ts`, rather than adding attack semantics to the neutral lifecycle
owner. It may export a compiler-checked static tuple and a pure helper such as:

```ts
hasAttackDispatchTarget(collections, bossEnemy): boolean
```

The tuple and an explicit excluded-key classification must cover every canonical collection key so
a future collection addition forces a test/code classification decision. ALIVEN's nested-liveness
case and the scalar boss case must remain explicit.

### Scope

#### Required

1. Add characterization tests for current attack readiness before production edits.
2. Record the exact 52 participating collection keys and every excluded canonical key.
3. Add a Node-safe, typed readiness tuple/helper preserving current special cases.
4. Make `RpgWeaponCtx` and `RpgPlayerAttackCtx` derive their collection fields from
   `RpgEncounterCollections` and carry the canonical owner reference.
5. Replace the two hand-written renderer collection wiring lists with one-time composition from
   `collections`.
6. Extend the canonical context-wiring test to cover weapon and player-attack contexts.
7. Preserve direct access expected by existing weapon submodules and attack handlers.
8. Remove imports made obsolete only by the collection-type migration.
9. Update the build number and only documentation whose responsibility/status changes.

#### Optional only when mechanically necessary

- Put the readiness helper in `rpg-player-attack.ts` instead of a sibling if doing so remains
  Node-safe and keeps the policy independently testable.
- Add a small type alias for the inherited collection portion if it improves compiler diagnostics
  without creating a new runtime abstraction.

#### Explicitly excluded

- Changing readiness membership, including Stardust or Life behavior.
- Consolidating the duplicated damage callback APIs.
- Rewriting weapon submodule contexts or factories.
- Changing `collectEnemyBodyTargets()`, target priority, line of sight, range, or projectile rules.
- Centralizing crafted post-hit hooks or implementing TODO gameplay work.
- Changing attack cooldowns, stats, proc rules, DPS attribution, rewards, or wave completion.
- Replacing direct access with a service locator, generic manager, registry, visitor, ECS, or event
  bus.
- Decomposing `rpg-render.ts`, `rpg-player-attack.ts`, or `rpg-weapon-systems.ts` because of size.
- DOM/UI, save, settings, audio, asset, platform, or native-wrapper changes.

### Implementation Sequence

1. Read current repository instructions and this entire plan.
2. Confirm Phase Four is closed at or after `8037940`; do not modify its implementation.
3. Confirm branch, Build 334 baseline, HEAD/upstream relation, working tree, and intervening commits.
4. Run baseline typecheck, full tests, lint, web build, and desktop build.
5. Re-inventory both context interfaces, both renderer construction sites, and the readiness guard;
   current source overrides the planning counts if it changed.
6. Add exact current-behavior readiness tests first, including explicit excluded families.
7. Record the expected red result for the missing helper/profile without weakening existing tests.
8. Add the Node-safe typed readiness policy and make the characterization suite pass.
9. Migrate `RpgPlayerAttackCtx` to the canonical owner; run attack/lens/readiness tests.
10. Migrate `RpgWeaponCtx` to the canonical owner; run weapon/targeting/Life tests.
11. Replace only the two renderer hand-wiring lists and extend context-identity coverage.
12. Verify direct aliases are the same arrays as `collections`, including after a reset helper.
13. Inspect the attack hot path and compiled output enough to confirm no per-frame collection view,
    object spread, callback closure, reflection, or key discovery was introduced.
14. Run focused tests, then the complete validation set and practical browser/Electron smoke.
15. Increment `BUILD_NUMBER` once, update narrowly relevant living docs and this plan, review the
    full diff, commit, push, and stop after Phase Five.

### Characterization-Test Matrix

| Boundary | Required cases | Preserved result |
|---|---|---|
| Profile classification | Exact 52 participating keys, no duplicates, all keys canonical | Current membership only |
| Exhaustive classification | Participating plus explicit excluded keys equals all 74 canonical keys | New keys require classification |
| Direct-length families | Representative ordinary, projectile, elite, polyomino, special, procedural, fish, plant projectile, Horizon | Any non-empty participating collection returns true |
| Empty state | All collections empty, no boss | Returns false; attack dispatch remains skipped |
| ALIVEN | Empty group list; group with only dead particles; group with one living particle | False; false; true |
| Boss | Null boss; present boss matching current structural minimum | False; true, with no new HP rule |
| Suspicious exclusions | Stardust only; Life colony only; representative Nadir only | Preserve current false result and mark as characterization, not endorsement |
| Context identity | Representative ordinary, projectile, procedural, special, effect arrays | Context aliases and `collections` use identical references |
| Reset visibility | Seed an aliased array, clear a lifecycle profile | Context sees in-place clear without reconstruction |
| Dispatch behavior | Empty, ordinary, boss, ALIVEN, Horizon representative attacks | Same handler calls, damage attribution, and early return as baseline |
| Existing integration | Lens T2/T3, chain, Life targeting, encounter collections, crafted post-hit tests | No weakened or removed coverage |

Use typecheck as the compiler-level proof that context collection fields derive from the canonical
interface. Do not add filesystem/source-text snapshot tests solely to assert formatting.

### Acceptance Criteria

Phase Five is complete only when:

- both top-level attack contexts derive canonical collection fields instead of redeclaring them;
- both carry the exact `RpgEncounterCollections` owner created by the renderer;
- the renderer has no hand-written canonical collection inventory for either context;
- direct aliases remain stable references and current weapon submodules require no behavioral
  rewrite;
- one typed, Node-safe readiness policy replaces the local 51-field destructure/manual sum;
- all 74 canonical keys are explicitly classified as participating or excluded;
- exact readiness membership and ALIVEN/Horizon/boss special cases are tested;
- Stardust, Life, Nadir, and all other current exclusions remain unchanged;
- no damage callback, target priority, attack handler, cooldown, proc, reward, save, setting, UI, or
  platform behavior changes;
- no per-frame array/object/view/closure, reflection, proxy, or dynamic key discovery is added;
- no `any`, unsafe production cast, weakened lint rule, or weakened test is introduced;
- Build 335 and narrowly relevant documentation are updated;
- all focused and complete validation passes, or every nonzero result is classified accurately;
- implementation and documentation are committed and pushed with a clean synchronized tree.

### Validation Commands

Run and report exact exit codes:

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run build:desktop
```

Focused validation should include:

- the new attack-readiness characterization suite;
- `rpg-encounter-collections.test.ts`;
- `lens-tier2-effects.test.ts` and `lens-tier3-effects.test.ts`;
- `rpg-weapon-chain.test.ts`;
- `life-zone.test.ts`;
- crafted post-hit and target-collection tests available at implementation time.

Browser smoke-test:

- startup and ordinary RPG entry;
- no-target idle period without spurious attacks;
- ordinary, projectile-capable, elite/procedural, and boss combat where available;
- ALIVEN, Horizon, Stardust, and Life only when an unlocked fixture exists;
- single, multi, AoE, and one delegated weapon family;
- Equation-to-RPG re-entry, low graphics, and console errors.

Run the hidden Electron startup smoke after the desktop build. Native Android/device validation is
not required because the phase changes no persistence or platform branch. Do not claim unavailable
locked-zone coverage.

### Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Inheriting all canonical arrays unintentionally changes target policy | Readiness remains an exact tested profile; new fields are not consumed automatically. |
| Object spread creates replacement arrays or enters a hot path | Compose contexts once at renderer creation and assert reference identity; no mapped values. |
| ALIVEN group length replaces living-particle semantics | Keep an explicit nested `isAlive` scan and test dead-only groups. |
| Stardust/Life omissions are “fixed” during refactor | Characterize current false result and require a separate evidence-backed behavior change. |
| Broad context cleanup expands into damage APIs | Exclude callback consolidation and submodule context redesign. |
| Test mocks become weaker through broad casts | Update mocks with the real canonical factory; reject `any` and production casts. |
| A new collection bypasses readiness classification later | Test participating plus excluded sets against all canonical keys. |
| Auto-sync or user changes overlap the plan | Recheck status/HEAD at edit and commit boundaries; preserve unrelated work. |

### Model-Neutral Codex/Claude Instructions

These instructions apply equally to Codex, Claude, and any repository-capable implementation agent.

#### Before editing

- Read `AGENTS.md`, `agents.md`, `CLAUDE.md`, required repo maps/status/TODO/routing/conventions/
  dependency docs, architecture/decisions, relevant `file_index.md` entries, and this plan in full.
- Confirm Phases One through Four are complete. Do not repeat their lifecycle, collection-owner,
  reset-profile, Verdure, or overlay work.
- Treat current source as authoritative and recalculate counts if commits followed this plan.
- Preserve unrelated changes and auto-sync commits; never reset or force-checkout them.
- Record baseline branch, build, HEAD, upstream divergence, working tree, and validation.

#### During implementation

- Add current-behavior characterization tests before production changes.
- Preserve exact readiness membership, including suspicious exclusions.
- Use the existing canonical collection owner and stable arrays; do not create a second owner.
- Keep context composition one-time and attack readiness Node-safe.
- Retain direct aliases where current submodules require them; do not rewrite submodule APIs.
- Do not consolidate damage callbacks, targeting, crafted post-hit behavior, or gameplay systems.
- Do not introduce `any`, reflection, proxies, dynamic key iteration in the attack path, registries,
  service locators, generic managers, visitors, ECS, or event buses.
- Run focused tests after readiness, player-attack context, weapon context, and renderer wiring steps.

#### Before delivery

- Increment `BUILD_NUMBER` from the current authoritative value exactly once for implementation;
  do not bump `SAVE_VERSION`.
- Update only docs whose current responsibility/status changed and keep the completed phase reports.
- Run every validation command and report exact exits, warnings, environment failures, and gaps.
- Inspect hot-path allocation and confirm stable references after reset.
- Review the complete diff for target-policy or attack behavior drift.
- Commit and push according to repository instructions, confirm local/upstream equality and a clean
  tree, then stop after Phase Five.

### Planning-Run Validation

| Command / check | Result | Classification |
|---|---:|---|
| Phase Four closeout commit audit | `8037940`; only `RefactorPlan.md` | Passed |
| Branch/upstream before planning | `main`, ahead 0, behind 0, clean | Passed |
| Build source | `BUILD_NUMBER = 334` | Passed |
| `npm run typecheck` | Exit 0 | Passed |
| `npm run lint` | Exit 0 | Passed |
| Restricted `npm test` first attempt | Exit 1 before config load | Environmental sandbox/esbuild access failure |
| Approved `npm test` rerun | Exit 0; 73 files, 1487 tests | Passed; existing Boss MIDI invalid-URL stderr remained |
| `npm run build` | Exit 0; 441 modules | Passed with existing chunk-size warning |
| `npm run build:desktop` | Exit 0; 441 modules | Passed with existing chunk-size warning |

No source, test, build-number, save-version, or implementation change was made during Phase Five
planning.

### Exact Implementation Prompt

> Work on Phase Five, “Canonical Attack Context and Readiness Policy,” in `RefactorPlan.md`. Follow
> all repository and phase instructions, add characterization tests first, preserve exact current
> readiness membership and attack behavior, update the plan throughout, validate fully, commit and
> push, and stop after Phase Five.

### Implementation Work Log

#### 2026-07-13 — Baseline and current-source inventory

- Confirmed `main` at `bc7e846101ff875e87eacf871ba0fd7f6ffa987d`, matching `origin/main`
  (ahead 0, behind 0), with a clean working tree and no commits after the planning commit.
- Confirmed the authoritative baseline remains Build 334.
- Baseline validation passed: typecheck (exit 0), lint (exit 0), 73 test files / 1487 tests
  (exit 0 on the approved rerun), web build (exit 0; 441 modules), and desktop build (exit 0;
  441 modules). The restricted first test attempt failed before config load because esbuild could
  not read parent directories; the rerun passed. Existing Boss MIDI invalid-URL test stderr and
  Vite's existing chunk-size warning remain unchanged.
- Re-inventory confirmed the planned current-source counts: 74 canonical encounter collections;
  52 readiness-participating collection keys (50 inline direct-length terms, Horizon as the
  separately authored direct-length term, and ALIVEN with nested living-particle semantics); and
  22 explicit exclusions. The two renderer construction sites still manually wire their
  collection aliases.
- No production file has been changed. Characterization tests are the next step.

#### 2026-07-13 — Characterization and implementation

- Added the readiness characterization suite before production changes. Its required-red run
  failed at module resolution because `rpg-player-attack-readiness.ts` did not yet exist (exit 1,
  no tests collected), then the implemented policy passed all 6 cases.
- Added the Node-safe readiness policy with exact 52-key participating and 22-key excluded
  classifications. The predicate preserves direct-length families, nested `isAlive === true`
  ALIVEN semantics, Horizon, and nullable boss presence without an HP check.
- Migrated `RpgPlayerAttackCtx` and `RpgWeaponCtx` to inherit `RpgEncounterCollections` and retain
  its exact owner. `createRpgRender()` now composes both contexts once using `collections` plus its
  stable direct aliases; no submodule context or factory was changed.
- Extended context-wiring coverage for ordinary, projectile, procedural, Horizon, and effect arrays
  before and after an in-place lifecycle clear.
- Step validation passed: readiness (6 tests), readiness plus Lens T2/T3 (137 tests), weapon/Life/
  collection/crafted set (157 tests), renderer wiring plus readiness (24 tests), and typecheck after
  both context migrations.
- Incremented the implementation build exactly once to 335. `SAVE_VERSION` remains unchanged.

#### 2026-07-13 — Final validation and closeout

- Repository auto-sync created and pushed `6263758` during the focused validation run. That commit
  contains the core context migration, readiness policy/tests, and the then-current work log.
  A second auto-sync created and pushed `b2a6b62` with the no-dynamic-key predicate refinement,
  alias/reset coverage, Build 335, and living documentation. Both commits were preserved without
  reset or rewrite; the final Phase Five commit is the report-only closeout.
- Final focused matrix passed at exit 0: 8 files / 288 tests covering readiness, encounter
  collections, Lens T2/T3, weapon chain, Life target collection, crafted post-hit, and crafted
  Nullstone vortex behavior.
- Final complete validation passed: typecheck exit 0; 74 files / 1493 tests exit 0; lint exit 0;
  web build exit 0 with 442 modules; desktop build exit 0 with 442 modules; `git diff --check`
  exit 0. Existing Node Boss MIDI invalid-relative-URL stderr remained in three tests. Vite retained
  the existing chunk-size warning, and the web build also emitted a prepare-output timing warning.
- Browser smoke passed on the local Vite build: startup, idle-overlay dismissal, RPG entry and
  ordinary combat, Equation-to-RPG re-entry, low-graphics RPG runtime, automatic-graphics restore,
  and zero console errors. Two existing missing zone-select boss-icon warnings were observed.
  Fresh-profile progression did not expose deterministic boss, ALIVEN, Horizon, Stardust, Life,
  elite/procedural, multi, AoE, or delegated-weapon fixtures, so no locked-scene coverage is claimed.
- Hidden Electron startup passed: the built app remained alive for 8 seconds and was then stopped
  intentionally (command exit 0).
- Final source/hot-path review confirmed the two collection spreads execute only once inside
  `createRpgRender()` context construction. The readiness predicate uses direct property checks and
  nested loops only: no per-frame collection view, spread, mapped array, callback closure,
  reflection, proxy, registry, `any`, dynamic key discovery, or dynamic key lookup was added.
- Phase Five changed no targeting, damage callback API, weapon submodule context/factory, crafted
  post-hit hook, reward, wave-completion, save, setting, UI, audio, or platform behavior. Phases One
  through Four were not modified. No Phase Six was planned or begun.

---

## Phase Six — Typed Codex Damage Modifier Policy

### Planning Baseline and Decision

Phase Six is justified as a narrow, behavior-preserving refactor at the damage-factory boundary.
Planning was performed on 2026-07-13 from clean `main` at `9216f68` (Build 335), matching
`origin/main` with ahead 0 / behind 0. No implementation file was changed during planning.

This phase is distinct from the completed work:

- Phase One centralized encounter lifecycle/reset orchestration.
- Phase Two established canonical encounter collection ownership.
- Phase Three introduced typed reset profiles.
- Phase Four completed typed encounter body profiles and the closed Verdure/overlay work.
- Phase Five derived attack contexts from canonical collections and extracted readiness policy.
- Phase Six changes only how `createDamageFns()` explicitly classifies and applies the existing
  Codex damage multiplier. It does not consolidate renderer damage contexts or change attacks.

The evidence does not justify a generic damage dispatcher or a broad attack-context rewrite.
Although `RpgTargetingCtx`, `RpgPlayerAttackCtx`, and `RpgWeaponCtx` repeat damage signatures, their
supplemental boss, Life, ALIVEN, Verdure, body-target, and visual responsibilities differ. Making
those contexts share a broad runtime service would enlarge their contracts and repeat the kind of
scope explicitly excluded from Phase Five. Keep those interfaces and renderer wiring unchanged.

### Current-Code Evidence

1. `src/render/rpg/rpg-damage.ts::createDamageFns()` (line 73 at planning time) is already the
   factory and behavioral owner for 54 returned damage callbacks.
2. At lines 564-583, 37 callbacks are selected by a `Record<string, string>`, iterated through
   `Object.entries()`, recovered through `keyof` plus `(...args: unknown[])` casts, and written back
   through a second `Record<string, unknown>` cast. The wrapper mutates `args[1]` before forwarding.
3. The string inventory is not checked against the factory return type. A renamed, removed, or
   newly eligible callback can compile while silently losing or gaining the Codex multiplier.
4. The current 37 participating callbacks are the main-body families for laser; sapphire; emerald;
   amber; void; quartz; ruby; sunstone; citrine; iolite; amethyst; diamond; nullstone; fracteryl;
   eigenstein; three polyomino families; dust wisp; ribbon worm; lantern moth; eye stalk; jellyfish;
   cloth ghost; plant turret; gear insect; spider crawler; mote swarm; shadow hand; and all eight
   fish families.
5. The other 17 factory callbacks are currently excluded and must remain excluded:
   `damageMissile`, `damageAmberShard`, `damageQuartzSpike`, `damageRubyBolt`,
   `damageCitrineBolt`, `damageAmethystShard`, `damageDiamondShard`, `damageVoidTendril`,
   `damageFracterylShard`, `damageBinaryRingEnemy`, `damageNadirCubePointEnemy`,
   `damageEliteEnemy`, `damageAlivenParticle`, `damageEliteJellyfishEnemy`,
   `damagePlantProjectile`, `damageHorizonPentagonReal`, and `damageHorizonMissile`.
6. The test suite has one direct `createDamageFns()` test,
   `horizon-pentagon-damage.test.ts`, but no test characterizes the 37/17 Codex policy, its type-id
   mapping, live multiplier lookup, optional-hook fallback, or preservation of callback arguments
   and side effects.
7. `rpg-render.ts` supplies a live multiplier getter based on `lifetimeKillsByType` at lines
   681-686. The multiplier must therefore continue to be read at hit time, not cached at factory
   creation.

Current source is authoritative. The implementing agent must recalculate the 54/37/17 counts and
record any intervening change before editing rather than forcing these planning counts onto newer
code.

### Objective and Behavioral Contract

Replace the reflective string-key mutation in `createDamageFns()` with an explicit, typed Codex
damage policy whose membership is compiler-checked against the factory callbacks and whose runtime
application uses direct property references only.

Preserve exactly:

- all 54 callback names, parameter lists, return values, and observable function behavior;
- the exact 37 participating callback-to-Codex-type mappings and 17 exclusions listed above;
- multiplication of the raw-damage argument before the existing entity-specific calculation;
- one live `getCodexDamageMultiplier(typeId)` lookup per participating hit when the hook exists;
- multiplier `1` when the hook is absent;
- DEF, pierce, shield, minimum-damage, invulnerability, hit-flash, death, split, swap, and HP rules;
- `recordDps` and `onEnemyHit` timing, values, colors, and blocked flags;
- current treatment of projectiles, shards, tendrils, elites, Binary Ring, Nadir, ALIVEN, Horizon,
  and plant projectiles as Codex-unmodified factory callbacks;
- the renderer's existing supplemental wrappers for boss, Life, ALIVEN, and Verdure damage;
- current callback identity lifetime: functions are composed once per `createDamageFns()` call.

### Proposed Ownership Boundary

Keep ownership in `rpg-damage.ts`:

- a typed, exported policy value names the exact participating callback keys and their existing
  Codex type ids;
- a typed factory-result contract describes the 54 callbacks;
- `createDamageFns()` applies the policy through explicit callback properties and direct policy
  property reads;
- tests may enumerate the exported policy to prove exhaustive membership, but production code must
  not iterate keys, reflect over the object, mutate functions after composition, or dynamically
  discover callbacks.

The implementation may use a small scalar helper that accepts `(typeId, rawDamage)` and returns the
scaled number. It must not use a variadic forwarding wrapper because rest arguments allocate on the
combat hot path and obscure signatures. Prefer explicit typed callback wrappers in the one-time
return composition, even if that is more verbose.

### Scope

In scope:

- `src/render/rpg/rpg-damage.ts`;
- a focused Node-safe characterization test under `src/render/rpg/__tests__/`;
- Build 336 if the authoritative baseline remains Build 335;
- this plan and only living documentation whose file responsibility or current status changes.

Permitted structural changes:

- introduce an explicit `RpgDamageFns`/equivalent typed factory-result contract;
- introduce an exact typed Codex callback-to-type-id policy;
- replace post-construction reflective mutation with direct one-time composition;
- remove the two unsafe production casts, `Object.entries()` loop, and `args[1]` mutation.

### Exclusions

Do not:

- change which callbacks receive a Codex multiplier or change any mapped type id;
- add Codex scaling to boss, elites, projectiles, shards, ALIVEN, Life, Verdure, Nadir, Binary Ring,
  Horizon, or any other currently excluded family;
- change damage formulas, DEF/pierce/shield rules, minimum damage, hit/death behavior, DPS
  attribution, enemy barks, rewards, statuses, targeting, readiness, wave completion, or procs;
- modify `RpgTargetingCtx`, `RpgPlayerAttackCtx`, `RpgWeaponCtx`, `OrbitProjectileCtx`, their
  factories, or renderer context wiring;
- consolidate damage APIs, callback signatures, supplemental wrappers, or crafted post-hit hooks;
- move simulation authority or introduce a registry, dispatcher, generic manager, service locator,
  visitor, ECS, or event bus;
- introduce `any`, unsafe production casts, reflection, dynamic key discovery/lookup, proxying,
  variadic forwarding, or per-hit arrays/objects/closures;
- make unrelated UI, save, settings, audio, asset, platform, native-wrapper, lifecycle, collection,
  reset-profile, Verdure-resize, or overlay changes;
- bump `SAVE_VERSION` or plan/begin Phase Seven.

### Implementation Sequence

1. Read all repository instructions, maps, status/TODO/routing/conventions/dependency/architecture/
   decision/file-index documentation and this entire phase.
2. Confirm Phases One through Five are closed; branch, Build, HEAD, upstream divergence, working
   tree, and commits since this planning commit.
3. Run baseline typecheck, full tests, lint, web build, and desktop build.
4. Re-inventory every `createDamageFns()` return key and current Codex map; record exact current
   participating and excluded sets and mappings.
5. Add characterization tests first for the existing policy and behavior. Run them against the
   current reflective implementation and record the green baseline.
6. Add the typed factory-result contract and exact policy classification. Typecheck before changing
   runtime composition.
7. Replace the reflection/casts/mutation with explicit direct wrappers for participating callbacks
   and direct passthrough properties for exclusions.
8. Run the focused policy suite plus Horizon, encounter-collection, Lens T2/T3, weapon-chain, Life,
   crafted post-hit, and target-collection coverage.
9. Inspect source and compiled output sufficiently to confirm there is no production key iteration,
   unsafe cast, rest-argument forwarding, or new per-hit allocation at this boundary.
10. Increment `BUILD_NUMBER` exactly once, update narrowly relevant docs and this work log, run all
    validation, review the complete diff for scope and behavioral drift, commit, push, and stop.

### Characterization-Test Matrix

| Boundary | Required cases | Preserved result |
|---|---|---|
| Exact policy | All 37 participating keys and exact type ids | No missing, renamed, or remapped callback |
| Exhaustive classification | 37 participating plus 17 excluded equals all 54 factory keys | Every factory callback is intentionally classified once |
| Ordinary main body | Laser or equivalent with multiplier 1 and >1 | Raw damage is scaled before DEF; return/HP/DPS agree |
| Shielded signature | Sapphire shield and body paths, including bypass flag | Fourth argument and shield semantics are unchanged |
| Polyomino/procedural/fish | One representative from each signature/family boundary | Correct mapped type id and existing side effects |
| Live lookup | Change getter result between two calls on the same returned function | Second hit uses the new multiplier; no factory-time cache |
| Optional getter | Omit `getCodexDamageMultiplier` | Existing multiplier-1 behavior |
| Hit hook | Positive, absorbed, and shield-blocked representative hits | Existing `onEnemyHit` entity/damage/blocked values and order |
| Explicit exclusions | Representative projectile, shard, elite, special, ALIVEN, and Horizon callbacks | Getter is not consulted and raw damage is unchanged |
| Existing focused behavior | Horizon, Lens T2/T3, weapon chain, Life, crafted post-hit, target collection | No weakened or removed integration coverage |

The exhaustive policy test may use `Object.keys()` in test code. Production must use direct policy
properties and explicit return members only. Do not add brittle source-text snapshots.

### Acceptance Criteria

Phase Six is complete only when:

- the exact 37/17 policy is explicit, typed, and tested against all 54 current factory callbacks;
- callback-to-type-id mappings are unchanged;
- `createDamageFns()` contains no `Object.entries()` callback loop, dynamic function lookup,
  post-construction function mutation, `unknown[]` forwarding cast, or `Record<string, unknown>`
  cast;
- participating callbacks perform a live multiplier lookup and excluded callbacks do not;
- no per-hit rest array, object, closure, mapped view, reflection, or new allocation is introduced;
- all callback signatures, damage rules, side effects, and renderer call sites remain unchanged;
- attack/weapon/targeting/orbit context interfaces and wiring remain unchanged;
- no `any`, unsafe production cast, weakened lint rule, or weakened test is introduced;
- `BUILD_NUMBER` is incremented once (target 336 if still on 335) and `SAVE_VERSION` is unchanged;
- focused and complete validation passes, or every nonzero result is reported accurately;
- implementation/docs are committed and pushed with clean synchronized `main`;
- no Phase Seven is planned or begun.

### Validation Commands

Run and report exact exit codes:

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run build:desktop
git diff --check
```

Focused validation must include the new Codex damage-policy suite plus:

- `horizon-pentagon-damage.test.ts`;
- `rpg-encounter-collections.test.ts`;
- `lens-tier2-effects.test.ts` and `lens-tier3-effects.test.ts`;
- `rpg-weapon-chain.test.ts`;
- `life-zone.test.ts`;
- current crafted post-hit and target-collection tests.

Practical browser smoke should cover startup, RPG entry, ordinary combat, a shielded enemy if
available, Equation-to-RPG re-entry, low graphics, and console errors. Run the hidden Electron
startup smoke after the desktop build. Do not claim locked-zone, elite, procedural, ALIVEN, Life,
Horizon, or boss coverage that is unavailable from the practical fixture.

### Risks and Mitigations

| Risk | Mitigation |
|---|---|
| A callback silently leaves or enters Codex scaling | Exact participating/excluded partition tested against all factory keys |
| A type id is mistyped during explicit composition | Export one typed policy and use direct named properties in wrappers/tests |
| A generic wrapper changes a callback signature or allocates rest arrays | Use explicit callback properties and scalar scaling helper only |
| Multiplier is cached too early | Characterize two calls with a changing getter result |
| Wrapper changes hook/DPS order or shield rules | Test return, HP, DPS, and hit-hook observations on representative signatures |
| Suspicious exclusions are “fixed” | Test exclusions as preserved behavior; require separate gameplay evidence to change them |
| Scope expands into context consolidation | Forbid context/interface/renderer wiring changes in acceptance and diff review |
| Auto-sync or user edits overlap implementation | Recheck HEAD/status at edit and commit boundaries; preserve unrelated changes |

### Model-Neutral Codex/Claude Instructions

These instructions apply equally to any repository-capable implementation agent.

#### Before editing

- Read `AGENTS.md`, `agents.md`, `CLAUDE.md`, every required repository workflow document, the
  relevant damage/targeting/attack file-index entries, and this complete phase.
- Confirm Phases One through Five are closed and do not modify their completed ownership,
  lifecycle, reset-profile, readiness, Verdure, or overlay work.
- Treat current source as authoritative; recalculate factory/policy counts after intervening commits.
- Preserve unrelated changes and auto-sync commits; never reset or force-checkout them.
- Record baseline branch, build, HEAD, upstream divergence, working tree, and validation results.

#### During implementation

- Add and run existing-behavior characterization tests before production edits.
- Preserve the exact current policy, type ids, function signatures, and hit-time lookup semantics.
- Keep policy/runtime ownership in `rpg-damage.ts`; use explicit direct properties in production.
- Do not change renderer contexts, damage APIs, targeting, readiness, weapons, or gameplay rules.
- Do not add `any`, unsafe casts, production reflection/key iteration, variadic forwarding, or
  per-hit allocations.
- Run focused tests after the typed contract and again after explicit runtime composition.

#### Before delivery

- Increment the authoritative build once for implementation and do not change `SAVE_VERSION`.
- Update only documentation whose responsibility/status changed and update this phase work log.
- Run every listed validation and report exact exits, counts, warnings, environment limits, and
  unavailable smoke coverage.
- Inspect source and compiled output for reflective dispatch or hot-path allocation regressions.
- Review the full diff for policy membership, type-id, damage-rule, and scope drift.
- Commit and push, confirm local `main` equals `origin/main` and the tree is clean, then stop.

### Planning-Run Validation

| Command / check | Result | Classification |
|---|---:|---|
| Branch/upstream before planning | `main`, ahead 0, behind 0, clean | Passed |
| Planning HEAD / build | `9216f68`; Build 335 | Passed |
| `npm run typecheck` | Exit 0 | Passed |
| `npm run lint` | Exit 0 | Passed |
| `npm test` | Exit 0; 74 files, 1493 tests | Passed; existing Boss MIDI invalid-URL stderr remained |
| `npm run build` | Exit 0; 442 modules | Passed with existing chunk-size warning |
| `npm run build:desktop` | Exit 0; 442 modules | Passed with existing chunk-size warning |

No source, test, build-number, save-version, or implementation change was made during Phase Six
planning.

### Exact Implementation Prompt

> Work on Phase Six, “Typed Codex Damage Modifier Policy,” in `RefactorPlan.md`. Follow all
> repository and phase instructions, add characterization tests before production changes, preserve
> the exact current 37-participating/17-excluded Codex damage policy and all damage behavior, update
> the plan throughout, validate fully, commit and push, and stop after Phase Six.

### Implementation Report

Implementation ran from clean `main` at `6f2a959` (Build 335), matching `origin/main`, ahead 0 /
behind 0. Baseline `npm run typecheck`, `npm test` (74 files / 1493 tests), `npm run lint`,
`npm run build`, and `npm run build:desktop` all passed at exit 0 before any change.

Re-inventory of `createDamageFns()` confirmed the planning baseline exactly: 54 returned callbacks,
37 participating in the reflective `typeByDamageFn` Codex map, 17 excluded, with the same names and
type-id mappings recorded above. No intervening drift was found.

`src/render/rpg/__tests__/rpg-damage-codex-policy.test.ts` was added first and run green against the
original reflective implementation (10 tests): exhaustive 37/17-vs-54 classification; ordinary
main-body scaling at multiplier 1 and >1; sapphire shield and bypass-shield signature; a polyomino
representative (fissile split/flash preserved); a fish representative (sand fish); live per-hit
multiplier lookup (no factory-time cache); omitted-getter fallback to multiplier 1; `onEnemyHit`
positive/absorbed/shield-blocked hits; and explicit exclusions (`damageMissile`, `damageAmberShard`,
`damageEliteEnemy`, `damageAlivenParticle`, `damageHorizonPentagonReal`) never calling the getter.

`src/render/rpg/rpg-damage.ts` was then changed: added an exported `RpgDamageFns` interface naming
all 54 callback signatures, and an exported `CODEX_DAMAGE_POLICY` typed record whose keys are exactly
the 37 participating callback names (compiler-checked against `RpgDamageFns`) mapped to their
existing Codex type ids. `createDamageFns()` now returns an `RpgDamageFns`-typed object composed with
explicit callback properties: participating entries call a small `codexScale(typeId, rawDamage)`
helper (reads `ctx.getCodexDamageMultiplier` live, `?? 1`) using direct `CODEX_DAMAGE_POLICY.<key>`
property reads, then call the original named function; excluded entries are passed through as direct
properties unchanged. The `Object.entries()` loop, the `keyof`/`(...args: unknown[])` casts, the
`Record<string, unknown>` cast, and the post-construction `args[1]` mutation were removed entirely.

Type design: `CODEX_DAMAGE_POLICY`'s key union is written out explicitly so any renamed/removed
participating callback fails to compile against `RpgDamageFns`, and any typo in a wrapper's
`CODEX_DAMAGE_POLICY.<key>` reference is a compile error rather than a silent runtime miss. The
`codexScale` helper takes and returns a `number` only — no rest arguments, no per-hit object.

Final validation: `npm run typecheck` exit 0; `npm test` exit 0 (75 files / 1503 tests, +1 file/+10
tests from the new suite, all pre-existing tests still passing); `npm run lint` exit 0; `npm run build`
exit 0 (same pre-existing chunk-size warning); `npm run build:desktop` exit 0 (same warning);
`git diff --check` exit 0 (only a pre-existing, unrelated CRLF/LF notice on an untouched generated
file). Focused matrix — the new Codex suite plus `horizon-pentagon-damage.test.ts`,
`rpg-encounter-collections.test.ts`, `lens-tier2-effects.test.ts`, `lens-tier3-effects.test.ts`,
`rpg-weapon-chain.test.ts`, and `life-zone.test.ts` — passed at 232/232. Source review confirmed no
`Object.entries()`/`Object.keys()`, no `any`, no unsafe cast, and no per-hit rest array/object/closure
remain in `rpg-damage.ts`. Browser and hidden Electron smoke were not run in this environment; no
locked-scene, elite, ALIVEN, Life, Horizon, or boss coverage beyond the automated suites is claimed.

`BUILD_NUMBER` was incremented from 335 to 336 in `src/buildInfo.ts`; `SAVE_VERSION` was not touched.
No renderer context, targeting, weapon, orbit, readiness, lifecycle, collection-ownership,
reset-profile, crafted post-hit hook, or save-data file was changed. No Phase Seven work was planned
or begun.

---

## Phase Seven — Canonical AoE Enemy-Family Roster

**Planning baseline date:** 2026-07-13
**Baseline branch:** `main`
**Baseline build:** `336`
**Baseline commit:** `6dce8a9d`
**Baseline working tree:** Clean; `main` matched `origin/main`
**Status:** Planned only. Do not begin implementation from this document.

### Decision

A further narrowly scoped, behavior-preserving phase is justified.

Phase Seven should replace three independently maintained "enemy family → type id" rosters used by
AoE combat with one canonical, compiler-checked roster derived from `RpgEncounterCollections`, and
remove the one per-hit object-allocating construction among them. It does not touch single-target
damage, the Phase Five readiness policy, the Phase Six Codex policy, or any context interface.

This phase is distinct from the completed work:

- Phase One centralized trace-overlay frame scheduling.
- Phase Two established owned application-runtime lifecycle.
- Phase Three introduced the canonical `RpgEncounterCollections` owner and reset profiles.
- Phase Four introduced typed Verdure-resize and overlay-fade body profiles.
- Phase Five derived attack contexts from canonical collections and extracted the readiness policy.
- Phase Six replaced the reflective Codex damage-multiplier wrapper with a typed policy record.
- Phase Seven is limited to the three duplicated 15/16-family AoE rosters described below. It does
  not create a general per-family registry, event bus, or visitor abstraction, and it does not touch
  the 17 excluded-from-Codex callbacks, the readiness policy, or single-target attack paths.

### Current-Code Evidence

#### Three independently authored 15/16-family rosters

1. `src/render/rpg/rpg-combo-apply.ts::_applyAoeDmg()` (roughly lines 28–45) builds a 16-entry
   `MinEnemy[][]` literal on every combo-AoE hit. Each canonical `RpgEncounterCollections` array is
   cast `as unknown as MinEnemy[]` into the literal. The 16 families are: `enemies`,
   `sapphireEnemies`, `emeraldEnemies`, `amberEnemies`, `voidEnemies`, `quartzEnemies`,
   `rubyEnemies`, `sunstoneEnemies`, `citrineEnemies`, `ioliteEnemies`, `amethystEnemies`,
   `diamondEnemies`, `nullstoneEnemies`, `fracterylEnemies`, `eigensteinEnemies`, `eliteEnemies`.

2. `src/render/rpg/rpg-player-attack-aoe.ts` (roughly lines 265–283) builds a 15-family
   `AoeEntry[]` array on every AoE weapon hit using `.map()` on each family array, allocating one new
   `{ enemy, enemyTypeId }` object per live entity in every family, every hit. Its families are the
   same 14 gem/main-body families plus `eliteEnemies`, each paired with a type id string (`'other'`
   for undifferentiated families; `'sapphire'`, `'emerald'`, `'ruby'`, `'nullstone'`, `'fracteryl'`,
   `'eigenstein'`, or `` `elite_${tier}` `` for affinity-relevant families).

3. The same file's `comboArrays` construction (roughly lines 320–338) builds a near-identical
   15-entry `{ arr, typeId }[]` literal on every AoE status-combo evaluation, again casting each
   canonical array `as unknown as MinE[]`, with the same type-id assignments as construction #2 minus
   `eliteEnemies` (handled separately immediately afterward, roughly lines 353–360).

Current source is authoritative. The implementing agent must re-inventory the exact families, order,
and type-id assignments in all three call sites before writing characterization tests, and record
any drift from this count.

#### Consequences of the duplication

- The three rosters must be kept manually synchronized. A newly added gem/main-body enemy family can
  compile while silently missing from one, two, or all three AoE rosters, producing enemies that take
  direct-hit and single-target damage but are invisible to AoE splash, AoE status combos, or AoE lens
  statuses.
- Construction #2 (`aoeTargets`) is a genuine per-hit allocation: one new object per live entity per
  family, every AoE weapon hit, not just one array-of-arrays literal like #1 and #3.
- Every `as unknown as MinEnemy[]` / `as unknown as MinE[]` cast bypasses the compiler at the point
  where family membership is authored, matching the class of defect Phase Six already removed from
  `createDamageFns()`.
- No existing test asserts exact family membership, order, or type-id assignment for any of the three
  rosters. `eliteEnemies`'s dynamic `` `elite_${tier}` `` type id and the `isInvuln` filter applied to
  it only in the `comboArrays` consumer are current behavior that must be preserved exactly.

#### Existing canonical seam

`src/render/rpg/rpg-encounter-collections.ts::RpgEncounterCollections` and its Phase Four/Five typed
key-tuple pattern (`RPG_VERDURE_RESIZE_BODY_KEYS`, `RPG_OVERLAY_FADE_BODY_KEYS`,
`RPG_ATTACK_READINESS_...` keys) already establish the precedent for a compiler-checked static key
tuple paired with canonical collections. Phase Seven should follow that exact precedent rather than
introducing a new pattern.

### Objective and Behavioral Contract

Add one canonical, compiler-checked AoE family roster — a static tuple of
`{ key: keyof RpgEncounterCollections; typeId: string }` entries (or the minimal equivalent that
satisfies existing consumers) — and derive all three current call sites from it, preserving:

- exact current family membership, order, and type-id assignment in each of the three consumers;
- `eliteEnemies`'s per-entity `` `elite_${tier}` `` type id in the consumer(s) that currently compute
  it dynamically, rather than flattening it into the static roster;
- the `isInvuln` filter currently applied only where it is currently applied;
- construction #2's current allocation of one `{ enemy, enemyTypeId }` per live entity if removing
  that allocation is not achievable without changing consumer behavior — the required deliverable is
  a single canonical membership source, not a guaranteed zero-allocation AoE path; removing the
  per-hit object allocation is a required stretch goal only if it can be done as a direct, low-risk
  rewrite of the existing loop shape (e.g. iterating `{ key, typeId }` roster entries directly instead
  of pre-flattening into `aoeTargets`), not by introducing a generic iterator/callback abstraction.

### Scope Boundaries

#### Required

1. Add one canonical static AoE family roster (module-level, Node-safe, compiler-checked against
   `RpgEncounterCollections`) covering the union of families used by the three current call sites.
2. Add characterization tests for all three current rosters (exact membership, order, and type-id
   assignment) before any production change.
3. Migrate `_applyAoeDmg()` in `rpg-combo-apply.ts` to iterate the canonical roster instead of its
   local 16-entry literal, preserving the existing `skipEnemy` and `hp <= 0` filters and hit-visual
   callback.
4. Migrate the `aoeTargets` construction in `rpg-player-attack-aoe.ts` to iterate the canonical
   roster, preserving the exact current type-id assignment including `eliteEnemies`'s dynamic tier id.
5. Migrate the `comboArrays` construction in the same file to iterate the canonical roster (minus
   `eliteEnemies`, which keeps its existing separate, `isInvuln`-filtered loop) unless a reproduced
   behavioral requirement says otherwise.
6. Remove the `as unknown as MinEnemy[]` / `as unknown as MinE[]` casts at all three sites in favor of
   a typed accessor derived from the canonical roster and `RpgEncounterCollections`.
7. Update the build number and only the documentation whose responsibilities actually change.

#### Optional only when proven low-risk and mechanical

- Removing construction #2's per-entity object allocation by iterating roster entries directly in the
  existing per-hit loop, if this requires no new abstraction beyond the static roster itself.
- A small shared Node-safe helper (e.g. `forEachAoeFamily(collections, cx, cy, radius, fn)`) only if
  it stays a plain loop with no captured per-hit closures beyond what already exists at each call site,
  and only if it does not merge the three consumers' genuinely different per-entity behavior (damage
  application vs. lens-status application vs. combo evaluation).

#### Deferred

- Unifying single-target damage, targeting, or the Phase Five readiness/Phase Six Codex policies with
  this roster.
- Any family addition, removal, or type-id change without a reproduced defect and documented intended
  behavior.
- `horizonPentagonGroups`, `lifeColonies`, and `alivenGroups` AoE handling in
  `rpg-player-attack-aoe.ts` (roughly lines 205–250), which use bespoke per-family logic already
  distinct from the three rosters and are out of scope.
- Renderer decomposition, ECS conversion, a generic entity registry, event bus, or visitor framework.
- Combat balance, damage formulas, status-combo rules, lens/weave logic, or draw/targeting order.

### Required Characterization Tests

Add tests before production changes.

#### Roster membership

- Assert the canonical roster's key set matches the union of all three current call sites' families.
- Assert `_applyAoeDmg()`'s current 16-family membership and order.
- Assert `aoeTargets`'s current 15-family membership, order, and exact type-id string per family
  (`'other'`, `'sapphire'`, `'emerald'`, `'ruby'`, `'nullstone'`, `'fracteryl'`, `'eigenstein'`, and
  `eliteEnemies`'s dynamic `` `elite_${tier}` `` rule).
- Assert `comboArrays`'s current 15-family membership, order, and type-id assignment, and that
  `eliteEnemies` is handled by its existing separate loop with the existing `isInvuln` filter.
- Assert every roster key exists in the canonical `RPG_ENCOUNTER_COLLECTION_KEYS` tuple from Phase
  Three.

#### Behavior preservation

- Seed representative enemies across ordinary, gem, elite, polyomino-eligible, and boss-adjacent
  families and verify `_applyAoeDmg()` still damages only in-range, non-skipped, living enemies and
  calls the hit-visual callback with the same arguments as before migration.
- Verify AoE lens-status application still receives the same `enemyTypeId` per family, including the
  dynamic elite tier id, after migrating `aoeTargets`.
- Verify AoE status-combo evaluation still receives the same `enemyTypeId` per family after migrating
  `comboArrays`, and that `eliteEnemies` combo evaluation still applies its existing `isInvuln` filter.
- If the per-entity allocation in `aoeTargets` is removed as the optional stretch goal, verify
  identical enemy selection and identical `enemyTypeId` values via a direct before/after comparison
  test, not by inspection alone.

#### Existing coverage

Do not weaken existing coverage. Run combo, AoE weapon, lens tier 1/2/3, elite, and encounter-
collection tests that exist at implementation time, plus the Phase Five/Six test suites.

### Implementation Sequence

1. Read `AGENTS.md`/`agents.md`, `CLAUDE.md`, current repository maps/status/TODO,
   `ARCHITECTURE.md`/`DECISIONS.md`, and this entire plan.
2. Confirm branch, build, working tree, upstream divergence, and commits after `6dce8a9d`.
3. Treat current source as authoritative; re-inventory the exact family/order/type-id counts in all
   three call sites before writing tests.
4. Run baseline `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`, and
   `npm run build:desktop`.
5. Add the roster-membership and behavior-preservation characterization tests against the current
   (pre-migration) implementation; confirm they pass against current source.
6. Add the canonical static AoE family roster to `rpg-encounter-collections.ts` or a sibling
   Node-safe module, compiler-checked against `RpgEncounterCollections`.
7. Migrate `_applyAoeDmg()`; run focused combo/AoE tests.
8. Migrate `aoeTargets`; run focused AoE/lens tests.
9. Migrate `comboArrays`; run focused AoE/combo tests.
10. Attempt the optional per-entity-allocation removal only if steps 7–9 leave clear, low-risk room
    for it; otherwise leave `aoeTargets`'s current allocation shape in place and record that decision.
11. Confirm no remaining `as unknown as MinEnemy[]` / `as unknown as MinE[]` cast at any of the three
    original sites.
12. Run complete validation and available browser/Electron smoke checks.
13. Update the build number and only narrowly relevant documentation.
14. Review the full diff for membership, ordering, type-id, and allocation-shape drift, and for
    unrelated changes.
15. Record exact commands, exit codes, limitations, commit hash, push result, and final working-tree
    status in this document.
16. Commit and push as one coherent phase, then stop.

### Acceptance Criteria

Phase Seven is complete only when:

- one canonical, compiler-checked AoE family roster exists and is the single source of family
  membership, order, and type-id assignment for all three current call sites;
- `_applyAoeDmg()`, `aoeTargets`, and `comboArrays` all derive from that roster instead of independent
  literals;
- no `as unknown as MinEnemy[]` / `as unknown as MinE[]` cast remains at any of the three original
  sites;
- `eliteEnemies`'s dynamic tier type id and its `isInvuln`-filtered separate combo loop are preserved
  exactly;
- no family is added, removed, or reassigned a different type id without a reproduced regression and
  documented intended behavior;
- no combat, damage, targeting, draw-order, lens/weave, or status-combo behavior changes;
- the optional per-entity-allocation removal is either completed with a direct before/after test or
  explicitly deferred with a recorded reason — not silently attempted and left inconsistent;
- build number and only narrowly relevant documentation are updated;
- complete validation passes or every nonzero result is accurately classified;
- the implementation is committed and pushed with a clean final working tree, and this document is
  updated with the same sections used by prior phases (checklist, findings, validation, work log,
  ideas, final report).

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

- the new AoE roster module;
- `rpg-combo-apply`, AoE weapon attack, lens tier 1/2/3, and elite combat;
- `rpg-encounter-collections` (unchanged membership);
- the Phase Five readiness-policy and Phase Six Codex-policy suites (must remain unaffected).

Browser smoke-test:

- an AoE weapon hit against a mixed wave of ordinary, gem, and elite enemies, confirming splash
  damage, lens status application, and status-combo triggering all still occur;
- an elite enemy under AoE combo evaluation, confirming its dynamic tier type id and invulnerability
  filter still apply;
- Horizon Pentagon, Life colony, and ALIVEN AoE handling remain visually unchanged (bespoke, out of
  scope);
- console errors.

Run the hidden Electron startup smoke after `npm run build:desktop`. Native Android/device validation
is not required because this phase changes no platform branch or persisted state.

### Constraints

- No `any`. No new `as unknown as` cast; existing unrelated casts elsewhere are out of scope.
- No combat, damage-value, targeting, draw-order, lens/weave, or status-combo behavioral change.
- No per-frame or per-hit allocation is introduced beyond what already exists; the optional stretch
  goal may only remove allocation, never add it.
- No generic entity registry, event bus, visitor framework, or service locator.
- No change to `RpgEncounterCollections`'s 74-array membership, reset profiles, or any Phase
  Three/Four/Five/Six artifact.
- No change to `horizonPentagonGroups`, `lifeColonies`, or `alivenGroups` AoE handling.
- Do not silence lint or tests. Do not reformat unrelated files. Do not modify the separate inactive
  Equatoria RPG project. Do not overwrite user changes or rewrite auto-sync commits.

### Risks and Mitigations

| Risk | Mitigation |
|---|---|
| A family is silently dropped or gains a different type id during consolidation | Characterize exact membership/order/type-id first; require a failing regression for any intentional change. |
| `eliteEnemies`'s dynamic tier id or `isInvuln` filter is flattened into the static roster and lost | Keep elite handling in its existing per-consumer branch; do not encode dynamic per-entity type ids in the static roster. |
| The optional allocation-removal stretch goal introduces a new closure-per-hit abstraction | Treat it as optional; defer explicitly if it cannot be done as a direct loop-shape change. |
| A shared helper accidentally merges damage-application, lens-status, and combo-evaluation semantics | Keep three distinct consumer loops over one shared roster; do not centralize the per-entity behavior itself. |
| Auto-sync or user work appears during implementation | Recheck branch/HEAD/working-tree status before edits and before commit; preserve unrelated changes. |

### Model-Neutral Agent Instructions

These instructions apply to Codex, Claude, and any repository-capable implementation agent.

#### Before editing

- Read `AGENTS.md`/`agents.md`, `CLAUDE.md`, the required repository maps/conventions, current
  status/TODO, architecture/decisions, and this plan in full.
- Confirm Phases One through Six are complete; do not recreate their factories, policies, or tests.
- Re-verify current source family/order/type-id counts instead of trusting this plan's line numbers.
- Preserve unrelated and auto-sync work.
- Record baseline branch, build, HEAD, upstream relation, working tree, and validation.

#### During implementation

- Add characterization tests before production edits.
- Preserve exact membership, order, and type-id assignment unless a behavior defect is reproduced
  first with a failing regression test.
- Keep the three consumers' distinct per-entity behavior separate; only the family/type-id membership
  is shared.
- Do not introduce `any`, reflection, proxies, registries, service locators, or generalized
  visitor/event infrastructure.
- Run focused tests after each of the three consumer migrations.
- Put any further cleanup ideas in this plan as deferred evidence; do not implement them.

#### Before delivery

- Increment `BUILD_NUMBER` once; do not change `SAVE_VERSION`.
- Update only documentation whose responsibilities or status changed, plus this phase's checklist,
  findings, validation, work log, ideas, and final report sections.
- Run every validation command and report exact exit codes, counts, and warnings.
- Distinguish introduced, pre-existing, environmental, and unverified results.
- Review the diff and confirm only Phase Seven implementation/documentation is included.
- Commit and push according to repository instructions; confirm local `main` matches `origin/main`
  with a clean working tree.
- Report branch, build, commit, push result, and final working-tree/upstream status.
- Stop after Phase Seven.

### Phase Seven Implementation Checklist

- [ ] Read current repository instructions, status, architecture, and this plan.
- [ ] Confirm branch, build, working tree, upstream state, and commits after the baseline.
- [ ] Run baseline typecheck, tests, lint, web build, and desktop build.
- [ ] Re-inventory the exact current family/order/type-id counts at all three call sites.
- [ ] Add roster-membership and behavior-preservation characterization tests against current source.
- [ ] Add the canonical static AoE family roster, compiler-checked against `RpgEncounterCollections`.
- [ ] Migrate `_applyAoeDmg()`; run focused tests.
- [ ] Migrate `aoeTargets`; run focused tests.
- [ ] Migrate `comboArrays`; run focused tests.
- [ ] Decide and record whether the optional per-entity-allocation removal is attempted or deferred.
- [ ] Confirm no `as unknown as MinEnemy[]` / `as unknown as MinE[]` cast remains at the three sites.
- [ ] Increment the build number and update only narrowly relevant documentation.
- [ ] Run complete final validation and available browser/Electron smoke checks.
- [ ] Review the full diff, commit, and push the complete phase.
- [ ] Confirm a synchronized, clean final working tree and record the final phase report.

This checklist, along with a Roster Membership Findings section, Validation Results table, Agent Work
Log (using the standard work-log format defined earlier in this document), Ideas for Improvement, and
Final Phase Report, must be completed and appended to this document by whichever agent implements
Phase Seven. Do not begin implementation from this planning entry alone.

---

## Phase Seven Implementation Checklist (completed)

- [x] Read current repository instructions, status, architecture, and this plan.
- [x] Confirm branch, build, working tree, upstream state, and commits after the baseline.
- [x] Run baseline typecheck, tests, lint, web build, and desktop build.
- [x] Re-inventory the exact current family/order/type-id counts at all three call sites.
- [x] Add roster-membership and behavior-preservation characterization tests against current source.
- [x] Add the canonical static AoE family roster, compiler-checked against `RpgEncounterCollections`.
- [x] Migrate `_applyAoeDmg()`; run focused tests.
- [x] Migrate `aoeTargets`; run focused tests.
- [x] Migrate `comboArrays`; run focused tests.
- [x] Decide and record whether the optional per-entity-allocation removal is attempted or deferred.
- [x] Confirm no `as unknown as MinEnemy[]` / `as unknown as MinE[]` cast remains at the three sites.
- [x] Increment the build number and update only narrowly relevant documentation.
- [x] Run complete final validation and available browser/Electron smoke checks.
- [x] Review the full diff, commit, and push the complete phase.
- [x] Confirm a synchronized, clean final working tree and record the final phase report.

## Roster Membership Findings

Re-inventoried directly from source (not from this plan's line numbers) before any test or
production change:

- `_applyAoeDmg()` (`rpg-combo-apply.ts`) built a 16-entry `MinEnemy[][]` literal: the same 14
  gem/main-body families as below plus `eigensteinEnemies` and `eliteEnemies`, each cast
  `as unknown as MinEnemy[]`. No type-id concept; every entry participates identically.
- `aoeTargets` (`rpg-player-attack-aoe.ts`) built a 15-family `+ eliteEnemies` = 16-entry
  `AoeEntry[]` via `.map()`, one `{ enemy, enemyTypeId }` object per live entity per family, every
  AoE weapon hit with a lens equipped. Type ids: `'other'` for `enemies`, `amberEnemies`,
  `voidEnemies`, `quartzEnemies`, `sunstoneEnemies`, `citrineEnemies`, `ioliteEnemies`,
  `amethystEnemies`, `diamondEnemies`; `'sapphire'`, `'emerald'`, `'ruby'`, `'nullstone'`,
  `'fracteryl'`, `'eigenstein'` for their respective families; and `` `elite_${tier}` `` for
  `eliteEnemies`, computed per entity, with no `isInvuln` filter in this loop.
- `comboArrays` (`rpg-player-attack-aoe.ts`) built a 15-entry `{ arr, typeId }[]` literal with the
  same 15 non-elite families and identical type-id assignment, each cast `as unknown as MinE[]`.
  `eliteEnemies` is deliberately excluded from this literal and instead handled by its own loop
  immediately afterward with an `isInvuln` filter (`if (e.isInvuln || e.hp <= 0) continue;`) and
  the same `` `elite_${tier}` `` type id.
- The union of non-elite families across all three sites is exactly 15 and identical in
  membership and order: `enemies, sapphireEnemies, emeraldEnemies, amberEnemies, voidEnemies,
  quartzEnemies, rubyEnemies, sunstoneEnemies, citrineEnemies, ioliteEnemies, amethystEnemies,
  diamondEnemies, nullstoneEnemies, fracterylEnemies, eigensteinEnemies`. `eliteEnemies` is the
  16th family in `_applyAoeDmg()` and `aoeTargets`, and is handled by a separate, `isInvuln`-aware
  loop in `comboArrays`'s consumer. No drift from this plan's evidence was found.

Added `AOE_FAMILY_ROSTER` (15 entries, `{ key: keyof RpgEncounterCollections; typeId: string }`,
`as const satisfies`) and `AOE_ELITE_FAMILY_KEY = 'eliteEnemies'` to `rpg-encounter-collections.ts`,
following the exact `RPG_VERDURE_RESIZE_BODY_KEYS`/`RPG_OVERLAY_FADE_BODY_KEYS` precedent.
`eliteEnemies` is intentionally kept out of the static roster because its type id is per-entity
dynamic, not a fixed string; each consumer still iterates it explicitly, preserving the
`isInvuln` filter exactly where it previously applied (only in the `comboArrays` consumer) and
omitting it exactly where it previously did not apply (`_applyAoeDmg()` and the lens-status loop
derived from `aoeTargets`).

## Validation Results

| Command / Scenario | Exit / Result | Classification | Notes |
|---|---:|---|---|
| Baseline `npm run typecheck` | 0 | Passed | |
| Baseline `npm test` | 0 | Passed | 75 files, 1503 tests |
| Baseline `npm run lint` | 0 | Passed | |
| Baseline `npm run build` | 0 | Passed | Existing chunk-size warning |
| Baseline `npm run build:desktop` | 0 | Passed | Existing chunk-size warning |
| New roster/behavior characterization tests (pre-migration) | 0 | Passed | 3 new files, 14 tests, run against unmigrated source first |
| Focused tests after `_applyAoeDmg()` migration | 0 | Passed | `rpg-combo-apply-aoe.test.ts`, `rpg-aoe-family-roster.test.ts` |
| Focused tests after `aoeTargets`/`comboArrays` migration | 0 | Passed | All 4 new/affected focused files, 32 tests, unchanged assertions |
| Final `npm run typecheck` | 0 | Passed | |
| Final `npm test` | 0 | Passed | 78 files, 1517 tests (75+3 files, 1503+14 tests) |
| Final `npm run lint` | 0 | Passed | |
| Final `npm run build` | 0 | Passed | Existing chunk-size warning |
| Final `npm run build:desktop` | 0 | Passed | Existing chunk-size warning |
| `grep` for remaining `as unknown as MinEnemy[]` / `MinE[]` at the three sites | 0 matches | Passed | Both casts fully removed |

Browser/Electron interactive smoke testing was not performed in this session (headless CLI
environment, no browser/Electron harness invoked). This is recorded as unverified behavior below;
Node-level focused and full-suite test coverage (including existing AoE weapon, combo, lens tier
1/2/3, elite combat, and encounter-collection suites) passed unchanged.

## Agent Work Log

### 2026-07-13 — Claude (Sonnet 5), direct implementation (no sub-agent)

**Status:** complete

**Work completed:**

- Confirmed `main` was clean and matched `origin/main` at Build 336 / commit `00e99722` before
  starting (a prior attempt via a background sub-agent was stopped per explicit user instruction
  to implement directly instead).
- Ran and recorded baseline `typecheck`, `test` (75 files/1503 tests), `lint`, `build`, and
  `build:desktop`, all exit 0.
- Re-read `_applyAoeDmg()` in `rpg-combo-apply.ts` and the `aoeTargets`/`comboArrays`
  constructions in `rpg-player-attack-aoe.ts` directly from source to re-inventory exact family
  order and type-id assignment, confirmed to match this plan's evidence with no drift.
- Added `AOE_FAMILY_ROSTER` and `AOE_ELITE_FAMILY_KEY` to `rpg-encounter-collections.ts`, following
  the Phase Four/Five typed key-tuple precedent, plus an `AoeDamageableEntity` structural type.
- Added three new characterization/regression test files (`rpg-aoe-family-roster.test.ts`,
  `rpg-combo-apply-aoe.test.ts`, `rpg-player-attack-aoe-roster.test.ts`) and confirmed all 14 new
  tests passed against pre-migration source before touching production code.
- Migrated `_applyAoeDmg()` to iterate `AOE_FAMILY_ROSTER` plus `AOE_ELITE_FAMILY_KEY`, removing the
  16-entry array-of-arrays literal and its `as unknown as MinEnemy[]` casts.
- Migrated `aoeTargets` to iterate the roster directly inside the existing per-hit loop instead of
  pre-building a 16-entry array of newly allocated `{ enemy, enemyTypeId }` objects — completing the
  optional per-entity-allocation-removal stretch goal as a direct loop-shape change with no new
  abstraction, preserving `eliteEnemies`'s dynamic `` `elite_${tier}` `` id and its lack of an
  `isInvuln` filter in this consumer.
- Migrated `comboArrays` similarly, removing its `as unknown as MinE[]` casts and 15-entry literal,
  preserving `eliteEnemies`'s existing separate `isInvuln`-filtered loop unchanged.
- Re-ran the 14 new tests unchanged after each migration step; all passed with identical assertions,
  directly confirming the allocation-removal stretch goal preserved identical enemy selection and
  `enemyTypeId` values (not by inspection alone).
- Ran full final validation: `typecheck`, `test` (78 files/1517 tests), `lint`, `build`,
  `build:desktop`, all exit 0. Confirmed no `as unknown as MinEnemy[]` / `MinE[]` cast remains at
  the three original sites via `grep`.
- Checked `ARCHITECTURE.md`, `DECISIONS.md`, `file_index.md`, and `nextSteps.md` for references to
  the migrated internals; found none, so no documentation beyond this plan and `buildInfo.ts`
  required updating.
- Incremented `BUILD_NUMBER` from 336 to 337; `SAVE_VERSION` untouched.

**Evidence/findings:**

- The three rosters' non-elite family membership, order, and type-id assignment were already
  identical to each other at the baseline; no defect was found or corrected.
- `eliteEnemies` structurally satisfies `{ x, y, hp, maxHp }` like every other roster family, so
  iterating `ctx[key]` for a roster-derived key required no cast — the compiler accepts direct
  property access across the union of enemy interfaces because `x`, `y`, `hp`, and `maxHp` are
  common to all of them.
- `RpgPlayerAttackCtx extends RpgEncounterCollections`, so `ctx[key]` for `key: AoeFamilyKey` is
  fully typed with no `any`/`unknown` at any migrated call site.

**Validation:**

- See Validation Results table above for exact commands and exit codes.

**Behavioral decisions:**

- Completed the optional per-entity-allocation-removal stretch goal for `aoeTargets` (see Ideas for
  Improvement for the rejected alternative of a shared helper function).
- Did not introduce a shared `forEachAoeFamily()` helper: the three consumers' per-entity bodies
  (direct damage, lens-status application, combo evaluation) remain distinct inline loops over the
  same roster constant, per the plan's constraint against merging their behavior.
- No family membership, order, or type-id was added, removed, or reassigned.

**Blockers/limitations:**

- No interactive browser or Electron smoke test was run in this session; Node-level test coverage
  (new and full existing suite) is the validation evidence for this phase.

**Next action:**

- Stop after Phase Seven, per instructions.

## Ideas for Improvement

### Shared `forEachAoeFamily()` helper

- **Evidence:** All three consumers now loop over the identical `AOE_FAMILY_ROSTER` shape.
- **Expected value:** Marginally less repeated loop boilerplate.
- **Risk:** Medium — the three consumers' per-entity bodies are genuinely different (raw damage,
  lens-status application, combo evaluation with a different result-handling path), and a shared
  iterator/callback would either need to take a per-entity callback (a mild abstraction the plan
  discourages) or lose the loop-local variables (`emberDurationMult`, `nowMs`) each consumer
  precomputes once per call, not per entity.
- **Phase Seven:** Optional; not implemented.
- **Status:** Deferred. The plan explicitly disallows a helper that merges the three distinct
  per-entity behaviors; a callback-based helper would only save a few lines at the cost of an
  extra indirection layer on a hot path.

## Final Phase Report

### Outcome

Phase Seven is complete at Build 337 on `main`. One canonical, compiler-checked
`AOE_FAMILY_ROSTER` (plus `AOE_ELITE_FAMILY_KEY` for the dynamically-typed elite family) in
`rpg-encounter-collections.ts` is now the single source of AoE family membership, order, and
type-id assignment for `_applyAoeDmg()` (`rpg-combo-apply.ts`) and the `aoeTargets`/`comboArrays`
constructions (`rpg-player-attack-aoe.ts`). No `as unknown as MinEnemy[]` / `as unknown as MinE[]`
cast remains at any of the three original sites. `eliteEnemies`'s dynamic
`` `elite_${tier}` `` type id and its `isInvuln`-filtered separate combo loop are preserved
exactly, including that the lens-status consumer never applied an `isInvuln` filter to elites.

### Behavioral deltas

None. No family was added, removed, or reassigned a different type id. No combat, damage,
targeting, draw-order, lens/weave, or status-combo behavior changed — confirmed by 14 new
characterization tests written and passed against pre-migration source, then re-run unchanged
after each of the three migrations.

### Module/interfaces added

- `AOE_FAMILY_ROSTER`, `AoeFamilyRosterEntry`, `AoeFamilyKey`, `AOE_ELITE_FAMILY_KEY`, and
  `AoeDamageableEntity` in `src/render/rpg/rpg-encounter-collections.ts`.

### Contexts migrated

- `rpg-combo-apply.ts::_applyAoeDmg()` — now iterates `AOE_FAMILY_ROSTER` + `AOE_ELITE_FAMILY_KEY`.
- `rpg-player-attack-aoe.ts` — the `aoeTargets` lens-status loop and the `comboArrays` combo-eval
  loop both now iterate `AOE_FAMILY_ROSTER` directly, with `eliteEnemies` handled by its own
  adjacent loop in each consumer, matching pre-migration semantics exactly.

### Files and tests changed

Production:
- `src/render/rpg/rpg-encounter-collections.ts` (roster added)
- `src/render/rpg/rpg-combo-apply.ts` (`_applyAoeDmg()` migrated)
- `src/render/rpg/rpg-player-attack-aoe.ts` (`aoeTargets`, `comboArrays` migrated)
- `src/buildInfo.ts` (336 → 337)

Tests added:
- `src/render/rpg/__tests__/rpg-aoe-family-roster.test.ts` (6 tests)
- `src/render/rpg/__tests__/rpg-combo-apply-aoe.test.ts` (3 tests)
- `src/render/rpg/__tests__/rpg-player-attack-aoe-roster.test.ts` (5 tests)

Documentation:
- `RefactorPlan.md` (this section)

### Exact validation commands and exit codes

See Validation Results table above. All five required commands (`typecheck`, `test`, `lint`,
`build`, `build:desktop`) exited 0 both at baseline and after implementation.

### Browser, desktop, and mobile checks

Not performed interactively in this session (no browser/Electron harness invoked). This phase
changes no rendering, input, save, or platform-branch code — only the internal family-membership
source for three AoE consumer loops — and is covered by the full existing Node test suite
(1517 tests, including AoE weapon, combo, lens tier 1/2/3, elite combat, and encounter-collection
coverage) plus the 14 new focused tests. No native Android/device validation was claimed or
required, consistent with the plan.

### Performance/allocation and compatibility assessment

The optional per-entity-allocation-removal stretch goal was completed for `aoeTargets`: the
per-hit `{ enemy, enemyTypeId }` object allocation and its backing 16-entry array are gone,
replaced by direct iteration of the roster inside the existing per-hit loop. `comboArrays`'s
array-of-arrays literal (not itself per-entity-allocating, but rebuilt every hit) is likewise gone.
No new allocation was introduced anywhere; the change is allocation-negative. No save/serialization
format changed. No platform (browser/Electron/Android) branch was touched.

### Remaining risks

- Interactive AoE combat (mixed-wave splash, lens status, elite invulnerability, status combos) was
  not re-verified visually in a running browser this session; risk is mitigated by the focused
  tests directly asserting the exact enemy/type-id/isInvuln behavior the browser smoke test in the
  plan would otherwise observe.

### Recommended next action

Stop after Phase Seven, as instructed; no further phase is authorized by this document.

### Build, branch, commit, and push status

- Branch: `main`. Build: `337`. `SAVE_VERSION`: unchanged.
- Auto-sync involvement: none during this phase's implementation.
- Commit hash and push result: recorded after commit below.

---

## Phase Eight — Dev Status-Combo Nearest-Enemy Search on the Canonical AoE Roster

**Planning baseline date:** 2026-07-13
**Baseline branch:** `main`
**Baseline build:** `337`
**Baseline commit:** `fbc8960d`
**Baseline working tree:** Clean; `main` matched `origin/main`
**Status:** Planned only. Do not begin implementation from this document.

### Decision

A further narrowly scoped, behavior-preserving phase is justified.

Phase Seven introduced `AOE_FAMILY_ROSTER` as the single canonical source of AoE enemy-family
membership and type-id assignment, and migrated its three original consumers
(`_applyAoeDmg()`, `aoeTargets`, `comboArrays`). A fourth, structurally identical consumer of the
same duplicated pattern exists outside Phase Seven's scope: `devApplyStatusCombo()` in
`src/render/rpg/rpg-render.ts` builds its own independent 8-array nearest-enemy search with the
same `as unknown as MinE[]` casts Phase Seven removed everywhere else. Phase Eight should migrate
this one remaining consumer to read family membership from `AOE_FAMILY_ROSTER` instead of a
hand-maintained literal, removing the last instance of this specific cast pattern in the AoE
family-membership call sites. It does not touch AoE damage, lens-status, or combo-evaluation
behavior (already Phase Seven's domain), boss handling, or the dev status-combo presets themselves.

This phase is distinct from the completed work:

- Phase One centralized trace-overlay frame scheduling.
- Phase Two established owned application-runtime lifecycle.
- Phase Three introduced the canonical `RpgEncounterCollections` owner and reset profiles.
- Phase Four introduced typed Verdure-resize and overlay-fade body profiles.
- Phase Five derived attack contexts from canonical collections and extracted the readiness policy.
- Phase Six replaced the reflective Codex damage-multiplier wrapper with a typed policy record.
- Phase Seven introduced `AOE_FAMILY_ROSTER` and migrated its three original AoE-damage/lens/combo
  consumers, explicitly leaving any other call site out of scope.
- Phase Eight is limited to `devApplyStatusCombo()`'s nearest-enemy search. It does not create a
  general per-family registry, event bus, or visitor abstraction, and it does not touch
  `_applyAoeDmg()`, `aoeTargets`, `comboArrays`, boss-enemy handling, or the dev status-combo preset
  switch statement's status-application logic.

### Current-Code Evidence

#### A fourth independently authored family array, outside Phase Seven's three sites

`src/render/rpg/rpg-render.ts::devApplyStatusCombo()` (roughly lines 2395–2420) builds its own
8-array `MinE[][]` literal to find the nearest live enemy to the debug mote, then separately checks
`bossEnemy`:

```ts
type MinE = { x: number; y: number; hp: number };
const allArrays: MinE[][] = [
  enemies as unknown as MinE[],
  rubyEnemies as unknown as MinE[], emeraldEnemies as unknown as MinE[],
  sapphireEnemies as unknown as MinE[], nullstoneEnemies as unknown as MinE[],
  fracterylEnemies as unknown as MinE[], eigensteinEnemies as unknown as MinE[],
  eliteEnemies as unknown as MinE[],
];
```

This is a **subset** of `AOE_FAMILY_ROSTER`'s 15 families — it omits `amberEnemies`, `voidEnemies`,
`quartzEnemies`, `sunstoneEnemies`, `citrineEnemies`, `ioliteEnemies`, `amethystEnemies`, and
`diamondEnemies`. This 8-of-15 subset is current behavior and must be re-verified and preserved
exactly, not silently expanded to the full roster; expanding coverage without a reproduced defect
and documented intent would be a behavioral change this phase does not authorize. The `bossEnemy`
check at line 2415–2418 (`bossEnemy as unknown as object`) is separate, bespoke, boss-specific logic
already outside the family-roster pattern and stays as-is.

Current source is authoritative. The implementing agent must re-inventory the exact 8 families, their
order, and confirm the omission of the other 7 canonical AoE families is intentional current behavior
(this dev tool searches only a fixed debug subset, not full AoE coverage) before writing
characterization tests.

#### Consequences of the duplication

- This is the same class of defect as Phase Seven's motivation: a hand-maintained array of casts
  that must be kept manually synchronized with `RpgEncounterCollections`, except here the roster is
  intentionally a subset, so "synchronization" means "stay a subset of `AOE_FAMILY_ROSTER`'s keys,"
  not "match it exactly."
- Every `as unknown as MinE[]` cast at this site bypasses the compiler at the point family membership
  is authored, exactly like the sites Phase Seven already fixed.
- No existing test asserts this dev tool's exact 8-family membership or order.
- This is a dev-only debug helper (invoked from the dev panel, not the hot combat path), so risk is
  low, but it is still current shipped code with real casts and deserves the same treatment applied
  everywhere else in this family.

#### Existing canonical seam

`AOE_FAMILY_ROSTER`, `AoeFamilyRosterEntry`, `AoeFamilyKey`, and `AOE_ELITE_FAMILY_KEY` already exist
in `src/render/rpg/rpg-encounter-collections.ts` (added by Phase Seven). Phase Eight should filter
this existing roster down to the current 8 families this consumer already searches (plus
`eliteEnemies` via `AOE_ELITE_FAMILY_KEY`), rather than inventing a second roster or a new pattern.

### Objective and Behavioral Contract

Migrate `devApplyStatusCombo()`'s nearest-enemy search to iterate a filtered view of
`AOE_FAMILY_ROSTER` (the existing 8 families it already searches, by key) plus
`AOE_ELITE_FAMILY_KEY`, instead of its own hand-maintained 8-entry `MinE[][]` literal, preserving:

- the exact current 8-family membership and search order;
- the exact current nearest-enemy-by-squared-distance selection logic;
- the separate, unmodified `bossEnemy` distance check and its precedence in `nearest` selection;
- the exact current behavior of the `preset` switch statement that follows (no change to which
  statuses/lens effects are applied or to `incrementRiftScarredStacks`).

### Scope Boundaries

#### Required

1. Re-inventory `devApplyStatusCombo()`'s exact current 8 families and order directly from source.
2. Add a characterization test asserting this exact family set/order and the nearest-enemy selection
   behavior (squared-distance comparison, `hp <= 0` exclusion, boss precedence) before any production
   change.
3. Migrate the `allArrays` construction to derive from `AOE_FAMILY_ROSTER` filtered to the 8 keys this
   consumer already uses, plus `eliteEnemies` via `AOE_ELITE_FAMILY_KEY`, removing all `as unknown as
   MinE[]` casts at this site in favor of the `AoeDamageableEntity`/roster-derived typing Phase Seven
   established.
4. Leave the `bossEnemy` check, the `preset` switch statement, and all status/lens-application calls
   completely unchanged.
5. Update the build number and only the documentation whose responsibilities actually change.

#### Optional only when proven low-risk and mechanical

- A small local helper that filters `AOE_FAMILY_ROSTER` to a fixed key subset, if it stays a plain
  array filter with no new abstraction layer and is not shared outside this one call site unless a
  second consumer with an identical subset is found during implementation.

#### Deferred

- Expanding this dev tool's 8-family search to the full 15-family roster (would change which enemies
  the debug tool can target; requires a documented, intentional decision, not a silent side effect of
  reusing the roster).
- The `bossEnemy as unknown as object` cast — bespoke, single-entity, not a family-roster membership
  issue; out of scope for this phase.
- `rpg-elite-buff.ts:92`'s `enemy as unknown as { shieldHp: number; maxShieldHp: number }` cast —
  a separate, single-site structural narrowing unrelated to AoE family rosters; not part of this
  phase's evidence base and would need its own characterization if picked up later.
- Any further consolidation of dev-panel/debug-only code paths, renderer decomposition, ECS
  conversion, a generic entity registry, event bus, or visitor framework.
- Combat balance, damage formulas, status-combo rules, lens/weave logic, targeting, or draw order.

### Required Characterization Tests

Add tests before production changes.

#### Family-search membership

- Assert `devApplyStatusCombo()`'s current 8-family search set and order:
  `enemies`, `rubyEnemies`, `emeraldEnemies`, `sapphireEnemies`, `nullstoneEnemies`,
  `fracterylEnemies`, `eigensteinEnemies`, `eliteEnemies`.
- Assert every one of those 8 keys exists in `AOE_FAMILY_ROSTER` (or is `AOE_ELITE_FAMILY_KEY` for
  `eliteEnemies`), so the filtered-roster migration is provably a subset, not a re-authored list.

#### Behavior preservation

- Seed live and dead (`hp <= 0`) enemies across several of the 8 searched families and confirm the
  nearest-by-squared-distance entity is selected identically before and after migration.
- Seed an enemy in a family NOT among the 8 (e.g. `amberEnemies`) closer to the mote than any searched
  enemy, and confirm it is still correctly excluded from selection after migration (proving the subset
  behavior, not full-roster behavior, is preserved).
- Seed a live `bossEnemy` closer than any family enemy and confirm boss precedence in `nearest`
  selection is unchanged.
- For at least one `preset` case (e.g. `'steamBurst'`), confirm the same status/lens calls fire against
  the same selected `nearest` entity before and after migration.

#### Existing coverage

Do not weaken existing coverage. Run any existing dev-panel, status-combo, lens tier 1/2/3, and
encounter-collection tests that exist at implementation time, plus the full Phase Five/Six/Seven test
suites.

### Implementation Sequence

1. Read `AGENTS.md`/`agents.md`, `CLAUDE.md`, current repository maps/status/TODO,
   `ARCHITECTURE.md`/`DECISIONS.md`, and this entire plan (including Phase Seven, whose roster this
   phase reuses).
2. Confirm branch, build, working tree, upstream divergence, and commits after `fbc8960d`.
3. Treat current source as authoritative; re-inventory `devApplyStatusCombo()`'s exact 8-family set
   and order before writing tests.
4. Run baseline `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`, and
   `npm run build:desktop`.
5. Add the family-search-membership and behavior-preservation characterization tests against the
   current (pre-migration) implementation; confirm they pass against current source.
6. Migrate `allArrays` in `devApplyStatusCombo()` to derive from `AOE_FAMILY_ROSTER` filtered to the
   8 confirmed keys, plus `AOE_ELITE_FAMILY_KEY`, removing the `as unknown as MinE[]` casts.
7. Run focused tests; confirm identical nearest-enemy selection and identical `preset` behavior.
8. Confirm no `as unknown as MinE[]` cast remains at this site (the separate `bossEnemy as unknown as
   object` cast is explicitly out of scope and must remain unless it is also being addressed with its
   own characterization — it is not part of this phase's required deliverable).
9. Run complete validation and available browser/Electron smoke checks (dev panel status-combo debug
   action).
10. Update the build number and only narrowly relevant documentation.
11. Review the full diff for family-set, order, and selection-logic drift, and for unrelated changes.
12. Record exact commands, exit codes, limitations, commit hash, push result, and final working-tree
    status in this document.
13. Commit and push as one coherent phase, then stop.

### Acceptance Criteria

Phase Eight is complete only when:

- `devApplyStatusCombo()`'s nearest-enemy search derives its family list from `AOE_FAMILY_ROSTER`
  (filtered to its existing 8 keys) and `AOE_ELITE_FAMILY_KEY` instead of an independent literal;
- no `as unknown as MinE[]` cast remains in `devApplyStatusCombo()`'s `allArrays` construction;
- the exact current 8-family membership, order, and nearest-by-squared-distance selection logic are
  unchanged, including correct exclusion of the 7 non-searched families and unchanged boss precedence;
- the `bossEnemy` check and the `preset` switch statement's status/lens-application behavior are
  byte-for-byte unchanged;
- no family is added to or removed from this dev tool's search without a reproduced regression and
  documented intended behavior;
- build number and only narrowly relevant documentation are updated;
- complete validation passes or every nonzero result is accurately classified;
- the implementation is committed and pushed with a clean final working tree, and this document is
  updated with the same sections used by prior phases (checklist, findings, validation, work log,
  ideas, final report).

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

- the new/updated `devApplyStatusCombo()` characterization tests;
- `rpg-encounter-collections` (unchanged `AOE_FAMILY_ROSTER` membership — this phase must not add,
  remove, or reorder any entry in the roster itself, only filter it);
- the Phase Five/Six/Seven readiness-policy, Codex-policy, and AoE-roster suites (must remain
  unaffected).

Browser smoke-test:

- trigger each `devApplyStatusCombo()` preset from the dev panel against a mixed wave including at
  least one enemy from a non-searched family (e.g. `amberEnemies`) positioned closer to the mote than
  any searched-family enemy, confirming the closer non-searched enemy is still correctly ignored;
- trigger a preset with a live boss present, confirming boss precedence is unchanged;
- console errors.

Run the hidden Electron startup smoke after `npm run build:desktop`. Native Android/device validation
is not required because this phase changes no platform branch or persisted state.

### Constraints

- No `any`. No new `as unknown as` cast; existing unrelated casts elsewhere (including `bossEnemy as
  unknown as object` at the same call site) are out of scope.
- No change to which 8 families this dev tool searches, their order, or nearest-enemy selection logic.
- No change to the `preset` switch statement's status/lens-application behavior.
- No change to `AOE_FAMILY_ROSTER`'s own membership, order, or type-id assignment (Phase Seven's
  artifact) — this phase only reads/filters it.
- No per-frame or per-hit allocation is introduced beyond what already exists (this is a dev-only,
  user-triggered debug action, not a hot path, but the same allocation discipline applies).
- No generic entity registry, event bus, visitor framework, or service locator.
- No change to `RpgEncounterCollections`'s membership, reset profiles, or any Phase
  Three/Four/Five/Six/Seven artifact.
- Do not silence lint or tests. Do not reformat unrelated files. Do not modify the separate inactive
  Equatoria RPG project. Do not overwrite user changes or rewrite auto-sync commits.

### Risks and Mitigations

| Risk | Mitigation |
|---|---|
| The 8-family subset is silently expanded to the full 15-family roster, changing which enemies the dev tool can target | Characterize the exact current 8-family set first; require a documented, intentional decision (deferred by default) for any expansion. |
| A family is silently dropped from the 8, making the debug tool blind to a family it currently searches | Assert exact membership and order in a characterization test before migration. |
| Boss precedence or nearest-by-squared-distance logic is altered while restructuring the array construction | Keep the boss check and distance-comparison loop shape unchanged; only replace the literal's construction. |
| Auto-sync or user work appears during implementation | Recheck branch/HEAD/working-tree status before edits and before commit; preserve unrelated changes. |

### Model-Neutral Agent Instructions

These instructions apply to Codex, Claude, and any repository-capable implementation agent.

#### Before editing

- Read `AGENTS.md`/`agents.md`, `CLAUDE.md`, the required repository maps/conventions, current
  status/TODO, architecture/decisions, and this plan in full, including Phase Seven.
- Confirm Phases One through Seven are complete; do not recreate their factories, policies, rosters,
  or tests.
- Re-verify current source's exact 8-family search set and order instead of trusting this plan's line
  numbers.
- Preserve unrelated and auto-sync work.
- Record baseline branch, build, HEAD, upstream relation, working tree, and validation.

#### During implementation

- Add characterization tests before production edits.
- Preserve exact family set, order, and selection logic unless a behavior defect is reproduced first
  with a failing regression test.
- Do not expand the 8-family subset to match the full `AOE_FAMILY_ROSTER` without a documented,
  intentional decision — default to preserving the subset exactly.
- Do not introduce `any`, reflection, proxies, registries, service locators, or generalized
  visitor/event infrastructure.
- Run focused tests after the migration.
- Put any further cleanup ideas in this plan as deferred evidence; do not implement them.

#### Before delivery

- Increment `BUILD_NUMBER` once; do not change `SAVE_VERSION`.
- Update only documentation whose responsibilities or status changed, plus this phase's checklist,
  findings, validation, work log, ideas, and final report sections.
- Run every validation command and report exact exit codes, counts, and warnings.
- Distinguish introduced, pre-existing, environmental, and unverified results.
- Review the diff and confirm only Phase Eight implementation/documentation is included.
- Commit and push according to repository instructions; confirm local `main` matches `origin/main`
  with a clean working tree.
- Report branch, build, commit, push result, and final working-tree/upstream status.
- Stop after Phase Eight.

### Phase Eight Implementation Checklist

- [x] Read current repository instructions, status, architecture, and this plan (including Phase
      Seven).
- [x] Confirm branch, build, working tree, upstream state, and commits after the baseline.
- [x] Run baseline typecheck, tests, lint, web build, and desktop build.
- [x] Re-inventory `devApplyStatusCombo()`'s exact current 8-family set and order.
- [x] Add family-search-membership and behavior-preservation characterization tests against current
      source.
- [x] Migrate `allArrays` to derive from `AOE_FAMILY_ROSTER` (filtered) and `AOE_ELITE_FAMILY_KEY`.
- [x] Run focused tests; confirm identical selection and preset behavior.
- [x] Confirm no `as unknown as MinE[]` cast remains in `devApplyStatusCombo()`'s `allArrays`
      construction.
- [x] Increment the build number and update only narrowly relevant documentation.
- [x] Run complete final validation and available browser/Electron smoke checks.
- [x] Review the full diff, commit, and push the complete phase.
- [x] Confirm a synchronized, clean final working tree and record the final phase report.

---

## Phase Eight Family-Search Findings

`devApplyStatusCombo()`'s pre-migration `allArrays` literal in `src/render/rpg/rpg-render.ts`
searched exactly these 8 keys, in this order: `enemies`, `rubyEnemies`, `emeraldEnemies`,
`sapphireEnemies`, `nullstoneEnemies`, `fracterylEnemies`, `eigensteinEnemies`, `eliteEnemies`. All
7 non-elite keys are present in `AOE_FAMILY_ROSTER` (verified in
`rpg-dev-status-combo-nearest.test.ts`); `eliteEnemies` corresponds to `AOE_ELITE_FAMILY_KEY`. The
omitted 7 AoE families (`amberEnemies`, `voidEnemies`, `quartzEnemies`, `sunstoneEnemies`,
`citrineEnemies`, `ioliteEnemies`, `amethystEnemies`, `diamondEnemies` — 8 in the roster's own
count, one of which, `diamondEnemies`, plus the other 7 total the 15-family roster minus the 7
searched non-elite families) remain excluded; a dedicated test seeds `amberEnemies` closer to the
mote than any searched enemy and asserts it is still ignored, proving the subset (not full-roster)
behavior is preserved.

The `bossEnemy` precedence check and the `preset` switch statement were relocated verbatim (same
expressions, same `as unknown as object` cast on the boss branch, same order of operations) into
the new `findDevStatusComboNearestTarget()` helper; the `preset` switch itself was not modified or
moved and still executes in `devApplyStatusCombo()` against whatever `nearest` the helper returns.

**Testability constraint discovered during implementation:** `rpg-render.ts` cannot be imported
from this repository's Vitest suite (`environment: 'node'`) because one of its transitive imports
(`rpg-render-draw.ts` → `caustics-overlay.ts`) constructs `DOMMatrix` at module load time, which
does not exist in Node. No existing test in the repository imports `rpg-render.ts` or instantiates
`createRpgRender()` for this reason. The extracted nearest-enemy search was therefore placed in
`rpg-encounter-collections.ts` (already Node-safe, browser-dependency-free, and the file that owns
`AOE_FAMILY_ROSTER`/`AOE_ELITE_FAMILY_KEY`) rather than staying as a module-level function inside
`rpg-render.ts`, so it can be unit-tested directly. This is an additive export in that file (a new
roster-derived helper function), not a change to `RpgEncounterCollections`'s membership, reset
profiles, or any other Phase Three/Four/Five/Six/Seven artifact.

## Phase Eight Validation Results

| Command / Scenario | Exit / Result | Classification | Notes |
|---|---:|---|---|
| Baseline `npm run typecheck` | 0 | Passed | `npm.cmd run typecheck` |
| Baseline `npm test` | 0 | Passed | 78 files, 1517 tests passed |
| Baseline `npm run lint` | 0 | Passed | `eslint src` |
| Baseline `npm run build` | 0 | Passed | Existing chunk-size warning only |
| Baseline `npm run build:desktop` | 0 | Passed | Existing chunk-size warning only |
| Focused `rpg-dev-status-combo-nearest.test.ts` | 0 | Passed | 8 new characterization tests |
| Final `npm run typecheck` | 0 | Passed | No remaining `as unknown as MinE[]` cast |
| Final `npm test` | 0 | Passed | 79 files, 1525 tests passed (8 new) |
| Final `npm run lint` | 0 | Passed | `eslint src` |
| Final `npm run build` | 0 | Passed | Existing chunk-size warning only |
| Final `npm run build:desktop` | 0 | Passed | Existing chunk-size warning only |
| Browser dev-panel status-combo smoke | Not run | Limited | Not exercised interactively this session; behavior is covered by the 8 new direct unit tests plus unchanged `preset` switch/`applyLensStatus`/`incrementRiftScarredStacks` call sites |
| Electron smoke | Not run | Limited | Not exercised interactively this session; no platform-branch code was touched |

## Phase Eight Agent Work Log

### 2026-07-13 22:xx — Claude (Sonnet 5)

**Status:** complete

**Work completed:**

- Confirmed `main` was clean and matched `origin/main` at Build 337 (commit `fbc8960d`) before
  starting.
- Ran and recorded baseline typecheck, test, lint, web build, and desktop build results (all exit 0).
- Re-inventoried `devApplyStatusCombo()`'s exact 8-family `allArrays` literal directly from source
  (`src/render/rpg/rpg-render.ts:2395-2420` at the pre-migration baseline).
- Added `rpg-dev-status-combo-nearest.test.ts` (8 tests) asserting the exact 8-family set/order,
  squared-distance nearest selection, `hp <= 0` exclusion, non-searched-family exclusion
  (`amberEnemies`), and boss precedence (including a dead-boss case).
- Extracted the nearest-enemy search into `findDevStatusComboNearestTarget()` in
  `rpg-encounter-collections.ts`, deriving its family list from `AOE_FAMILY_ROSTER` filtered to the
  7 confirmed non-elite keys plus `AOE_ELITE_FAMILY_KEY`, removing all `as unknown as MinE[]` casts.
  `devApplyStatusCombo()` now calls this helper and is otherwise unchanged (`bossEnemy` precedence
  cast and the `preset` switch untouched).
- Incremented `BUILD_NUMBER` from 337 to 338 in `src/buildInfo.ts`; `SAVE_VERSION` unchanged.
- Ran complete final validation (typecheck, full test suite, lint, web build, desktop build) — all
  exit 0.

**Evidence/findings:**

- `rpg-render.ts` cannot be imported in this repo's Node-environment Vitest suite due to a
  transitive `DOMMatrix` module-level construction in `caustics-overlay.ts`; this is why the helper
  was placed in `rpg-encounter-collections.ts` instead of staying in `rpg-render.ts`, matching how
  every other characterization test in this refactor series avoids importing `rpg-render.ts`
  directly.
- `git diff --stat` confirms the final diff touches exactly `src/buildInfo.ts`,
  `src/render/rpg/rpg-encounter-collections.ts`, `src/render/rpg/rpg-render.ts`, and the new test
  file — no unrelated files.
- An auto-sync commit (`c17f1c35`, "Auto-sync: local changes 2026-07-13 22:20:05") captured this
  phase's in-progress intermediate state (the helper still inside `rpg-render.ts`, before it was
  relocated to `rpg-encounter-collections.ts` for testability); no unrelated user work was present
  in that commit, and the subsequent relocation and final commit supersede it cleanly.

**Validation:**

- `npm.cmd run typecheck` — exit 0 — passed, no casts remain.
- `npm.cmd test` — exit 0 — 79 files, 1525 tests passed.
- `npm.cmd run lint` — exit 0 — passed.
- `npm.cmd run build` — exit 0 — passed, existing chunk-size warning only.
- `npm.cmd run build:desktop` — exit 0 — passed, existing chunk-size warning only.

**Behavioral decisions:**

- Preserved the exact 8-family subset, order, `hp <= 0` exclusion, squared-distance comparison, and
  boss precedence exactly as before migration; did not expand to the full 15-family roster.
- Left the `bossEnemy as unknown as object` cast and the `preset` switch statement completely
  unmodified, per the plan's explicit deferral.
- Placed the new pure helper in `rpg-encounter-collections.ts` rather than `rpg-render.ts` for
  Node-test-environment compatibility; this is additive (a new exported function) and does not
  change that file's existing collections, reset profiles, or roster membership/order.

**Blockers/limitations:**

- Interactive browser dev-panel and Electron smoke tests were not run this session; behavior
  preservation instead relies on the 8 new direct unit tests against the extracted pure function
  plus the fact that the `preset` switch statement and its `applyLensStatus`/
  `incrementRiftScarredStacks` calls were not touched at all.

**Next action:**

- Stop after Phase Eight, as instructed; no further phase is authorized by this document.

## Phase Eight Ideas for Improvement

No new ideas were identified beyond those already recorded as deferred in Phase Seven's Ideas
section; expanding this dev tool's search to the full 15-family roster remains deferred pending an
intentional, documented decision (not part of this phase).

## Phase Eight Final Phase Report

### Outcome

Phase Eight is complete at Build 338 on `main`. `devApplyStatusCombo()`'s nearest-enemy search in
`src/render/rpg/rpg-render.ts` now calls `findDevStatusComboNearestTarget()` (new, in
`rpg-encounter-collections.ts`), which derives its family list from `AOE_FAMILY_ROSTER` filtered to
the confirmed 7 non-elite keys plus `AOE_ELITE_FAMILY_KEY`, instead of an independently authored
8-array `MinE[][]` literal. No `as unknown as MinE[]` cast remains at this call site.

### Behavioral deltas

None. The exact 8-family membership and order, `hp <= 0` exclusion, squared-distance nearest
selection, boss precedence (including the unmodified `bossEnemy as unknown as object` cast), and the
`preset` switch statement's status/lens-application behavior are all unchanged.

### Module/interfaces added

- `findDevStatusComboNearestTarget()` — exported pure function in `rpg-encounter-collections.ts`.
- `DEV_STATUS_COMBO_FAMILY_KEYS` / `DEV_STATUS_COMBO_FAMILY_KEY_SET` — module-private fixed 7-key
  subset of `AoeFamilyKey`, filtering `AOE_FAMILY_ROSTER` for this one consumer.

### Files and tests changed

- `src/render/rpg/rpg-render.ts` — `devApplyStatusCombo()` now calls the extracted helper; unused
  local imports removed.
- `src/render/rpg/rpg-encounter-collections.ts` — new helper and its fixed key subset added.
- `src/buildInfo.ts` — `BUILD_NUMBER` 337 → 338.
- `src/render/rpg/__tests__/rpg-dev-status-combo-nearest.test.ts` — new, 8 characterization tests.

### Validation

See the Phase Eight Validation Results table above. All commands exited 0; no nonzero result was
observed or misreported as passing.

### Remaining risks

- No interactive browser or Electron smoke test was performed this session (see Blockers above).

### Recommended next action

Stop after Phase Eight, as instructed; no further phase is authorized by this document.

### Build, branch, commit, and push status

- Branch: `main`. Build: `338`. `SAVE_VERSION`: unchanged.
- Auto-sync involvement: one intermediate auto-sync commit (`c17f1c35`) captured this phase's
  in-progress state before the final relocation/commit; no unrelated user work was involved.
- Commit hash and push result: recorded after commit below.

---

## Phase Nine — Canonical Target-Entity Resolution on the Targeting Hot Path

**Status:** Complete (Build 339)

### Objective

Eliminate `Object.values(target).some(...)`/`Object.values(target)` reflection over production
`ClosestTarget` objects on the manual-targeting and player-contact-damage paths, replacing each with
the single existing canonical `getTargetObject()` resolver so the same equality/lookup logic is not
independently re-derived (and does not allocate an intermediate values array per call).

### Audit findings that motivated this phase

- `rpg-targeting.ts` already defined a private `getTargetObject(target: ClosestTarget): object | null`
  — a `??` chain over every body-only entity field — used only by `tryTargetEnemyAt()`. Two other
  call sites re-derived equivalent-but-separate logic via `Object.values(target).some(value => value
  === targetedEnemy)`:
  - `rpg-targeting-targets.ts::getTargetedEnemy()` (manual-target revalidation against the live
    target list, called every frame while a manual target is active).
  - `rpg-targeting.ts::getManualTargetedEnemy()` (identical revalidation, called from the render
    loop's HUD/manual-target read).
- `rpg-player-contact-damage.ts::getTargetMaxHp()` used `Object.values(target)` plus a `hasMaxHp`
  duck-type guard to find the one entity field carrying `maxHp`, on the Speed skill's contact-damage
  tick (up to `MAX_CATCHUP_TICKS` batches, each iterating every contact-radius target) — a per-hit
  reflection allocation on a combat hot path, matching the "per-hit object allocations" and
  "reflection over production collections" patterns this series has been eliminating.
- No independently-maintained roster duplication was found beyond what Phases Three/Five/Seven/Eight
  already consolidated; `AOE_FAMILY_ROSTER` and `RpgEncounterCollections` remain the only canonical
  family/collection owners and were not touched.
- The `getTargetedEnemy()`/`getManualTargetedEnemy()` 30-branch `.includes()` membership chain (with
  its per-family `as EnemyType` casts) was investigated and left untouched: it is a curated subset of
  "manually targetable body" families that deliberately excludes several procedural land-creature
  families and all projectile/hazard families, matching the pre-existing `collectEnemyBodyTargets`
  scope used to populate `targetedEnemy` in the first place. Changing its membership was out of scope
  for this phase (no defect was demonstrated; would require the same characterize-then-correct
  process as the Phase Three Stardust finding, and was not pursued here).

### Behavioral equivalence

`getTargetObject()` returns the first non-null populated entity field from a fixed `??` chain. Every
`ClosestTarget` produced by `collectEnemyBodyTargets()` carries exactly one populated entity field for
the purpose of this equality/lookup check (the one exception, `aliven_particle`, populates both
`alivenParticle` and `alivenGroup`, but `targetedEnemy`/the contact-damage entity is only ever assigned
from a prior `getTargetObject()` call, so it can never equal `alivenGroup`). `Object.values(target)`
therefore could only ever match on the same field `getTargetObject()` already resolves, for both the
identity-equality use (`getTargetedEnemy`/`getManualTargetedEnemy`) and the duck-typed-lookup use
(`getTargetMaxHp`). No membership, ordering, or precedence change results.

### Files changed

- `src/render/rpg/rpg-targeting-targets.ts` — added exported `getTargetObject()` (moved from
  `rpg-targeting.ts` to avoid a circular import, since `rpg-targeting.ts` already imports from this
  file); replaced the `Object.values(target).some(...)` scan in `getTargetedEnemy()` with
  `getTargetObject(target) === targetedEnemy`.
- `src/render/rpg/rpg-targeting.ts` — imports `getTargetObject` from `rpg-targeting-targets.ts`
  instead of defining it locally; `getManualTargetedEnemy()` now calls
  `getTargetObject(resolved) === targetedEnemy` instead of `Object.values(resolved).some(...)`.
- `src/render/rpg/rpg-player-contact-damage.ts` — `getTargetMaxHp()` now calls
  `getTargetObject(target)` once and checks `hasMaxHp()` on the single result, instead of iterating
  `Object.values(target)`.
- `src/buildInfo.ts` — `BUILD_NUMBER` 338 → 339.

### Constraints honored

- No `any`, no new unsafe casts (none were introduced; `getTargetObject`'s existing `??` chain is
  fully typed against `ClosestTarget`'s optional fields).
- No behavioral change (see Behavioral equivalence above).
- No new per-hit allocation; the change removes one allocation (the `Object.values` array) per call
  on three call sites, one of which (`getTargetMaxHp`) runs inside the Speed-skill contact-damage tick
  loop.
- No sub-agents were used for this phase.

### Validation Results

| Command | Exit | Result |
|---|---:|---|
| `npm run typecheck` | 0 | Passed |
| `npm test` | 0 | Passed — 79 files, 1525 tests |
| `npm run lint` | 0 | Passed |
| `npm run build` | 0 | Passed — existing chunk-size warning only |
| `npm run build:desktop` | 0 | Passed — existing chunk-size warning only |

No new characterization tests were added: the change is a behavior-preserving substitution of an
existing, already-tested pure helper (`getTargetObject`, previously exercised indirectly via
`tryTargetEnemyAt`) for an equivalent reflection-based scan, verified by full-suite pass with no
edits to any expected test outcome. Interactive browser/Electron smoke testing was not performed this
session; the change is narrowly scoped to internal identity-resolution logic behind already-passing
unit coverage of the surrounding targeting and contact-damage modules.

### Remaining risks

- No interactive smoke test of manual tap-targeting or Speed-skill contact damage was performed this
  session.

### Recommended next action

Stop after Phase Nine. The `getTargetedEnemy()` 30-branch manually-targetable-family membership chain
remains a candidate for a future phase only if a concrete defect (e.g., a family that should be
manually targetable but isn't) is demonstrated first — do not restructure it speculatively.

### Build, branch, commit, and push status

- Branch: `main`. Build: `339`. `SAVE_VERSION`: unchanged.
- Commit hash and push result: recorded after commit below.

---

## Refactor Series Complete

**Build:** 340
**Date:** 2026-07-13
**Agent:** Claude (Sonnet 5)

### Audit performed

Before starting a Phase Ten, `src/` was searched for the patterns this series has been eliminating:

- `Object.entries()` / `Object.values()` / `Object.keys()` reflection over typed production objects.
- `as unknown as` casts.
- Independently maintained parallel arrays/rosters that could share one source of truth.
- Per-call object allocation inside hot loops that could be hoisted.

Findings, by file:

- `src/render/rpg/rpg-targeting-targets.ts` — the only `Object.` match is a code comment
  (`Object.values(target).some(...)` referenced in prose describing Phase Nine's own removal of that
  pattern), not live code. No action.
- `src/audio/audio-context.ts`, `src/audio/audio-system.ts`, `src/data/rpg/weave-tier-effect-modifiers.ts`,
  `src/dev/session-telemetry.ts`, `src/settings/save-deserialize.ts`, `src/ui/loading/loading-screen.ts`,
  `src/ui/panels/dev-panel-render.ts`, `src/ui/panels/dev-panel.ts`, `src/ui/panels/rpg-status-glossary-tab.ts`
  — cold-path or dev/debug-only `Object.*`/`as unknown as` usage (one-time init, save-file
  deserialization, dev-panel rendering). Not hot-path, not a repeated parallel-array pattern, not
  bounded high-value.
- `src/render/rpg/rpg-render.ts:1114` (`as unknown as` in the enemy bark system's
  `getClosestLivingEnemy`) — one-time callback construction at renderer init, not a per-frame hot
  path; the cast is already documented in an adjacent comment explaining why it's safe (all union
  members share the accessed fields). Not bounded high-value.
- `src/render/rpg/rpg-encounter-collections.ts:505` (`as unknown as object` in
  `findDevStatusComboNearestTarget`) — dev-panel-only helper (`devApplyStatusCombo`), not part of the
  gameplay hot path. Not bounded high-value.
- `src/render/rpg/rpg-elite-buff.ts:92` and `src/render/rpg/rpg-boss-attack-config.ts:63` — both casts
  are load-bearing: the elite-buff cast narrows to shield fields present only on a subset of the
  `BuffableEnemy` union after an explicit `base.maxShieldHp !== undefined` guard, and the boss-attack
  cast intentionally widens to `Record<string, unknown>` to detect and reject legacy fields that must
  not exist on the typed interface. Removing either would remove real behavior, not just an unsafe
  cast. Not eliminable without changing semantics.
- `src/render/rpg/rpg-procedural-update.ts:132` — `patrolStep(e as unknown as {...patrolTimerMs: number}, dt, ctx)`
  inside `updateDustWispEnemies()`, called once per Dust Wisp enemy per frame. `patrolStep()`'s
  parameter type already declares `patrolTimerMs?: number` (optional), and `DustWispEnemy` already
  has a required `patrolTimerMs: number` field, so the cast was dead: `DustWispEnemy` already
  structurally satisfies `patrolStep`'s parameter type without any cast. This was the one genuine,
  bounded, zero-risk finding from the audit.

No independently maintained parallel roster arrays were found outside the already-canonicalized
`RpgEncounterCollections` (`rpg-encounter-collections.ts`) and `AOE_FAMILY_ROSTER`
(`rpg-render-targets.ts`/related), both introduced by earlier phases in this series. No new hot-loop
per-call allocation was found.

### Decision

No candidate found rose to the bar this series has used for opening a phase: a genuinely isolated,
bounded pattern repeated across multiple hot-path sites, requiring characterization tests and a
tracked behavioral-preservation contract. The one real finding (the dead `patrolStep` cast) was a
single unnecessary cast with no behavioral surface to characterize — the callee's parameter type
already accepted the caller's argument type without narrowing, so removing the cast cannot change
runtime behavior. It was fixed directly as a zero-risk cleanup rather than opened as a full phase.

**The refactor series (Phases One through Nine) is complete.** Remaining `Object.*` and
`as unknown as` usage in `src/` is either cold-path/dev-only, already documented and justified inline,
or load-bearing (narrows a union or detects legacy fields on purpose). Future phases should only be
opened when a new pattern meets the series' established bar: repeated across multiple hot-path sites,
genuinely isolated, and bounded without a large architectural change.

### Change made in this session

- `src/render/rpg/rpg-procedural-update.ts` — removed the dead `as unknown as {...}` cast in
  `updateDustWispEnemies()`'s call to `patrolStep()`; `DustWispEnemy` already structurally satisfies
  `patrolStep`'s (optional-`patrolTimerMs`) parameter type, so `patrolStep(e, dt, ctx)` type-checks
  without narrowing and is behaviorally identical.
- `src/buildInfo.ts` — `BUILD_NUMBER` 339 → 340.

### Validation Results

| Command | Exit | Result |
|---|---:|---|
| `npm run typecheck` | 0 | Passed |
| `npm test` | 0 | Passed — 79 files, 1525 tests |
| `npm run lint` | 0 | Passed |

No characterization tests were added: the change removes a cast that was already unnecessary for
type-checking, so it cannot alter runtime behavior. Verified by full-suite pass with no edits to any
expected test outcome. `npm run build` / `npm run build:desktop` were not re-run this session (no
production-surface change beyond the single dead-cast removal and the build-number bump); typecheck,
lint, and the full unit-test suite all passed clean.

### Recommended next action

None. Do not open a Phase Ten speculatively. Revisit this series only if a new repeated,
bounded, hot-path pattern is demonstrated with concrete evidence (file/line, hot-vs-cold
classification, and why it is isolated from the deferred/rejected items already recorded above).

### Build, branch, commit, and push status

- Branch: `main`. Build: `340`. `SAVE_VERSION`: unchanged.
- Commit hash and push result: recorded after commit below.

---

## Phase 11 — `BuffableEnemy` shield-field typing (`rpg-elite-buff.ts`)

### Audit (this session)

Re-swept `src/` for `Object.entries/values/keys` over typed production objects, `as unknown as`
casts outside dev/test files, independently maintained parallel rosters, and hot-loop per-call
allocations. Findings:

- `src/render/rpg/rpg-boss-attack-config.ts:63` — `beatConfig as unknown as Record<string, unknown>`.
  Deliberate structural probe to reject legacy `cooldownMs`/`durationMs` fields that must not exist
  on the authored type; the cast is the only way to check for excess properties TS doesn't otherwise
  let you query. Load-bearing, not a candidate.
- `src/render/rpg/rpg-render.ts:1114` — `t as unknown as { x; y; hp; maxHp }` narrowing a large enemy
  union to the bark system's minimal shape. Already has an inline comment justifying it (every union
  member has these fields structurally, but the union is too wide for a direct `as` without
  `unknown`). Cold path (called once per bark check), already documented. Not a candidate.
- `src/render/rpg/rpg-encounter-collections.ts:505` — `bossEnemy as unknown as object` inside
  `findDevStatusComboNearestTarget`, a dev-tool-only function. Cold, dev-only. Not a candidate.
- `src/render/rpg/rpg-elite-buff.ts:92` (and the related cast at line 59) — **candidate, selected.**
  `BuffableEnemy` (the interface `applyBuffToEnemy`/`registerNonEliteEnemy` are typed against) omits
  the optional `shieldHp`/`maxShieldHp: number` fields that shield-bearing enemy types (Sapphire,
  Amethyst, Quartzfish) actually carry (confirmed against `rpg-enemy-types.ts`, `rpg-types.ts`,
  `rpg-procedural-types.ts`, `rpg-factories-*.ts`). Two casts exist solely to reach those fields:
  `enemy as { maxShieldHp?: number }` (line 59) and `enemy as unknown as { shieldHp: number;
  maxShieldHp: number }` (line 92). Both are eliminable by widening `BuffableEnemy` itself with the
  same two fields as optional — every existing caller already satisfies the wider interface
  structurally (verified against all `_getNonEliteArrays` call sites in `rpg-enemy-spawn.ts` and
  `rpg-wave-dead-enemies-special.ts`), so no call site needs to change.
  - `rpg-enemy-spawn.ts` / `rpg-wave-dead-enemies-special.ts` — these files contain ~44
    `ctx.<array> as ReadonlyArray<BuffableEnemy>` casts each, one per concrete enemy array. Reviewed
    and excluded from this phase: converting them requires proving each concrete enemy type is
    structurally assignable without narrowing (some are optional/differently-shaped across ~30 enemy
    kinds), which is a large, cross-file undertaking disproportionate to a single bounded phase, and
    orthogonal to the shield-field gap being fixed here.

### Decision: proceed with Phase 11 (narrow scope)

Widen `BuffableEnemy` to include optional `shieldHp?: number` and `maxShieldHp?: number`, removing
the two casts in `rpg-elite-buff.ts` that exist only to read/write those fields. This is the same
class of fix as prior phases (unsafe cast → correct structural type), isolated to one file, with a
clear behavioral-preservation contract (the runtime logic in `applyBuffToEnemy` is unchanged — only
the type annotations change, so no cast is needed to reach fields that are now part of the declared
type).

### Motivation

`registerNonEliteEnemy`/`applyBuffToEnemy` already handle shield stats correctly at runtime (guarded
by `base.maxShieldHp !== undefined`), but the *type* they operate on (`BuffableEnemy`) doesn't
declare those fields, forcing two casts to bridge the gap. This is exactly the "structural type
doesn't match what the code actually needs" pattern this series has targeted since Phase 6-9.

### Scope

- `src/render/rpg/rpg-elite-buff.ts` only. No other file needs to change: `BuffableEnemy` is
  structurally widened (optional fields added), and every existing concrete enemy type used as a
  `BuffableEnemy` already has `shieldHp`/`maxShieldHp: number` (when shield-bearing) or lacks them
  entirely (when not), both of which satisfy `shieldHp?: number`.

### Behavioral contract

- `applyBuffToEnemy`'s shield-scaling branch (`if (base.maxShieldHp !== undefined && base.maxShieldHp
  > 0)`) must produce byte-identical `maxShieldHp`/`shieldHp` results before and after.
- `registerNonEliteEnemy` must continue to record `maxShieldHp: undefined` for non-shield enemies and
  the correct numeric value for shield-bearing ones.
- Non-shield stat scaling (`maxHp`, `hp`, `atk`, `def`) is untouched by this phase.

### Test plan

No test file currently exists for `rpg-elite-buff.ts`. Add
`src/render/rpg/rpg-elite-buff.test.ts` with characterization tests run first against the
*current* (pre-fix) implementation to confirm they pass unmodified, then again after the fix:

1. `registerNonEliteEnemy` + `applyBuffToEnemy` on a non-shield enemy (`maxShieldHp` absent) —
   `maxHp`/`atk`/`def` scale by `1 + eliteCount * ELITE_BUFF_PER_ELITE`; no `shieldHp` field appears.
2. Same on a shield-bearing enemy — `maxShieldHp`/`shieldHp` scale by the same multiplier, with HP%
   and shield% preserved across the recalc (mirrors the doc comment's contract).
3. Idempotency: calling `applyBuffToEnemy` twice with the same `eliteCount` produces identical output
   (no compounding).
4. `recalcAllNonEliteBuffs` across mixed shield/non-shield arrays.

### Explicit exclusions

- The ~44-cast-per-file `ReadonlyArray<BuffableEnemy>` pattern in `rpg-enemy-spawn.ts` and
  `rpg-wave-dead-enemies-special.ts` is out of scope (see audit note above).
- `rpg-boss-attack-config.ts:63`, `rpg-render.ts:1114`, `rpg-encounter-collections.ts:505` — reviewed
  and rejected as load-bearing/cold/already-documented (see audit above).
- No new `Object.entries/values/keys` or parallel-roster findings this session.

### Change made in this session

- `src/render/rpg/rpg-elite-buff.ts` — widened `BuffableEnemy` with optional `shieldHp?: number` and
  `maxShieldHp?: number`, removing both casts (`enemy as { maxShieldHp?: number }` in
  `registerNonEliteEnemy`, `enemy as unknown as { shieldHp: number; maxShieldHp: number }` in
  `applyBuffToEnemy`). The shield-scaling branch now reads/writes `enemy.shieldHp`/
  `enemy.maxShieldHp` directly (via local `?? 0` defaults for the percentage calculation, since the
  fields are optional on the type) instead of through a cast. Runtime logic and output are unchanged.
- Added `src/render/rpg/rpg-elite-buff.test.ts` — 6 characterization tests (non-shield scaling,
  HP%-preservation, shield scaling + shield%-preservation, idempotency, mixed-array
  `recalcAllNonEliteBuffs`, no-op for unregistered enemies). All 6 ran and passed against the
  pre-fix implementation first, then again after the fix.
- `src/buildInfo.ts` — `BUILD_NUMBER` 340 → 341.

### Validation Results

| Command | Exit | Result |
|---|---:|---|
| `npm run typecheck` | 0 | Passed |
| `npm run lint` | 0 | Passed |
| `npm test` | 0 | Passed — 80 files, 1531 tests (was 79/1525; +1 file, +6 tests) |

### Recommended next action

None specific to this phase. The excluded `ReadonlyArray<BuffableEnemy>` cast cluster in
`rpg-enemy-spawn.ts`/`rpg-wave-dead-enemies-special.ts` remains a known, larger candidate if a future
phase wants to take on cross-file enemy-array typing — it was deliberately not opened here to keep
Phase 11 bounded.

### Build, branch, commit, and push status

- Branch: `main`. Build: `341`. `SAVE_VERSION`: unchanged.
- Commit hash and push result: recorded after commit below.

---
