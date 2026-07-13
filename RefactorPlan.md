# Equatoria Idle Refactor Plan

**Repository:** `sethrimer3/Equatoria_Idle`  
**Baseline branch:** `main`  
**Baseline build:** `332`  
**Baseline lifecycle commit:** `938315712323aeedbe957a92fac7647eff8670c3`  
**Status:** Active implementation plan  
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

- [ ] Read repository and agent instructions.
- [ ] Confirm branch, build, working tree, and auto-sync state.
- [ ] Inspect commits after Build 332.
- [ ] Run baseline typecheck, tests, lint, browser build, and desktop build.
- [ ] Inventory collections and consumers.
- [ ] Build the collection membership matrix.
- [ ] Characterize boss-entry, zone-switch, normal-restart, and boss-restart behavior.
- [ ] Investigate teleport, Nadir, Stardust, and transient ownership differences.
- [ ] Add factory and stable-reference tests.
- [ ] Add exact reset-profile and idempotency tests.
- [ ] Add context-wiring tests.
- [ ] Implement canonical interface and factory.
- [ ] Implement typed subsets and reset profiles.
- [ ] Instantiate collections once in `createRpgRender()`.
- [ ] Replace boss-entry and zone-switch clear lists.
- [ ] Migrate death/restart.
- [ ] Align update, draw, targeting, and wave contexts.
- [ ] Review optional movable-body and overlay-fade subsets.
- [ ] Confirm no circular imports or hot-path allocation.
- [ ] Update documentation and build number.
- [ ] Run focused and complete validation.
- [ ] Perform available browser and desktop smoke tests.
- [ ] Record limitations, work log, ideas, and final report.
- [ ] Review the diff, commit, push, and confirm final status.

---

## Collection Membership Matrix

Complete during implementation.

| Collection | Update | Draw | Target | Wave/dead sweep | Boss entry | Zone switch | Death/restart | Notes |
|---|---|---|---|---|---|---|---|---|
| `enemies` | Pending | Pending | Pending | Pending | Pending | Pending | Pending | |
| `sapphireEnemies` | Pending | Pending | Pending | Pending | Pending | Pending | Pending | |
| `sapphireMissiles` | Pending | Pending | Pending | Pending | Pending | Pending | Pending | |
| `stardustEnemies` | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Verify restart |
| `nadirCubePointEnemies` | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Verify indirect clears |
| `teleportParticles` | Pending | Pending | N/A | N/A | Pending | Pending | Pending | Profile difference |
| `luckyMotes` | Pending | Pending | N/A | Pending | Pending | Pending | Pending | |
| `hitEffects` | Pending | Pending | N/A | N/A | Pending | Pending | Pending | Evaluate ownership |
| Additional collections | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Expand inventory |

---

## Reset Profile Findings

### Boss entry

**Current clear membership:** Pending  
**Intent evidence:** Pending  
**Retained collections:** Pending  
**Potential defects:** Pending

### Zone switch

**Current clear membership:** Pending  
**Intent evidence:** Pending  
**Retained collections:** Pending  
**Potential defects:** Pending

### Death/restart

**Current clear membership:** Pending  
**Intent evidence:** Pending  
**Retained collections:** Pending  
**Potential defects:** Pending

**Approved behavioral deltas:** None at planning time.

---

## Validation Results

| Command / Scenario | Exit / Result | Classification | Notes |
|---|---:|---|---|
| Baseline `npm run typecheck` | Pending | Pending | |
| Baseline `npm test` | Pending | Pending | |
| Baseline `npm run lint` | Pending | Pending | |
| Baseline `npm run build` | Pending | Pending | |
| Baseline `npm run build:desktop` | Pending | Pending | |
| Focused collection tests | Pending | Pending | |
| Final `npm run typecheck` | Pending | Pending | |
| Final `npm test` | Pending | Pending | |
| Final `npm run lint` | Pending | Pending | |
| Final `npm run build` | Pending | Pending | |
| Final `npm run build:desktop` | Pending | Pending | |
| Browser RPG smoke | Pending | Pending | |
| Death/restart smoke | Pending | Pending | |
| Boss entry/restart smoke | Pending | Pending | |
| Zone-switch smoke | Pending | Pending | |
| Electron smoke | Pending | Pending | |
| Capacitor/web check | Pending | Pending | |

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

---

## Ideas for Improvement

### Canonical movable-body subset

- **Evidence:** Verdure resize correction manually enumerates body arrays.
- **Expected value:** New enemy families cannot accidentally remain embedded after regeneration.
- **Risk:** Medium; some families may require specialized correction.
- **Phase Three:** Optional when mechanically characterizable.
- **Status:** Candidate.

### Canonical overlay-fade body subset

- **Evidence:** Overlay fading manually enumerates body arrays behind floating UI.
- **Expected value:** New bodies participate consistently.
- **Risk:** Low to medium; projectiles must remain excluded.
- **Phase Three:** Optional.
- **Status:** Candidate.

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

To be appended by the implementing agent after Phase Three is complete.

Do not remove the planning, evidence, checklist, matrix, findings, validation, ideas, or work-log sections above.
