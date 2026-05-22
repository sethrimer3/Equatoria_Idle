# Next Steps — Equatoria Idle

Current build: **#82**

---

## Build History Summary

### Build #82 — Cleanup and stability pass: save v25, terrain test fix, catalog coverage, encounter tracking

**Problem addressed:**
Four small, high-confidence improvements to save consistency, test accuracy, catalog coverage, and bestiary quality.

**1. Save version bumped to v25 (`save-types.ts`)**

`SAVE_VERSION` was 24 but `sandBladeEnabled` was already documented as a v25+ field.
Bumped to 25 to make the version and comments internally consistent.
Old saves still load correctly via `?? true` default.

**2. Terrain test assertion fixed (`topographic-terrain.ts`, `topographic-terrain.test.ts`)**

- Exported `RING_POINTS = 64` from `topographic-terrain.ts`.
- Updated the test: `solidOuterPolygon.length >= RING_POINTS` instead of the weaker `>= 32`.
- The file header comment ("at least RING_POINTS vertices") now matches the assertion.

**3. Enemy catalog coverage test added (`enemy-catalog-coverage.test.ts`)**

- Exported `STANDARD_WAVE_ENEMY_IDS`, `PROCEDURAL_WAVE_ENEMY_IDS`, and `ELITE_WAVE_ENEMY_IDS`
  from `wave-definitions.ts`.
- New test file covers: hand-authored WAVE_DEFINITIONS, all standard/procedural/elite/aliven IDs.
- `boss` is the only intentional exclusion (lives in BOSS_DESCRIPTIONS).
- Fails loudly with the wave number and ID if a real enemy type is missing from the catalog.

**4. Explicit encounter tracking added (`rpg-state.ts`, save pipeline, `rpg-wave-manager.ts`, `rpg-enemies-tab.ts`)**

- Added `encounteredEnemyTypes: Set<string>` to `RpgSimState`.
- Persisted as `rpg.encounteredEnemyTypes?: string[]` (v25+ optional field).
- Recorded in `tickSpawnQueue` (wave manager) each time an enemy spawns.
- Bestiary uses the explicit set when non-empty; falls back to `highestWaveReached`-based
  visibility for old saves (empty set, wave > 0). New games start fresh as expected.
- Developer mode still shows all entries.

**5. DECISIONS.md updated** — save version corrected to 25; v25 RPG save fields documented.

**All tests pass. Typecheck clean. Build passes.**

---

### Remaining terrain limitations

1. **`terrainAwareDirection`** — Still local steering only. Concave island bays can still
   occasionally slow an enemy, though oscillation is reduced. Full path-following is deferred:
   - Options: waypoint graph, coarse flow field, or short-lived path cache.
   - Any solution should be stateless per-frame or use a bounded precomputed structure.
   - Do not implement in the same PR as visual or balance changes.

2. **Topographic polish ideas (cosmetic):**
   - Add occasional "ridge" islands: elongated with a high elongationAmount value forced.
   - Try a two-island "mountain range" cluster where islands share a nearby center.
   - Experiment with a very subtle background fill gradient (dark center) for depth.
   - Experiment with different alpha/transparency for the terrain area fill.

---



**Problem addressed:**
Completed the remaining terrain gameplay consistency gaps identified in Build #80:
vortex pull and damage acting through terrain, sunstone mines triggering/damaging through
terrain, enemy oscillation at concave corners, and weak ring-ordering test coverage.

**Vortex terrain LOS (`rpg-weapon-vortex.ts`):**

- Imported `hasTopographicTerrainLineOfSight`.
- In `applyPull`: before nudging an enemy toward the vortex, check LOS from vortex centre to
  enemy. Enemies behind a terrain island are neither pulled nor receive the post-pull push-out.
  The post-pull `pushPointOutsideTopographicTerrain` safety fallback remains for edge cases.
- In `applyVortexTickToEnemy`: requires LOS before dealing periodic damage. Added `terrain`
  parameter to the function signature; all call-sites updated.
- Boss damage: requires LOS before dealing damage.

**Sunstone mine terrain LOS (`rpg-weapon-sunstone.ts`):**

- Imported `hasTopographicTerrainLineOfSight`.
- Mine placement push-out was already in place; the new changes cover LOS for all interactive
  paths:
  - `detonateMine` → `applyAoe`: requires mine-to-target LOS before dealing blast damage.
  - `detonateMine` → boss check: requires mine-to-boss LOS.
  - `checkEnemyContact`: requires mine-to-enemy LOS before subtracting mine HP.
  - `inProximity`: requires mine-to-enemy LOS before setting `triggered = true`.
- Terrain is obtained once per mine update tick to avoid redundant calls.

**Improved `terrainAwareDirection` (`rpg-enemy-updates.ts`):**

- Replaced the simple left/right ±90° probe with a multi-angle steering probe.
- Candidate angles (relative to direct vector): ±30°, ±60°, ±90°, ±120°, 180°.
- Each candidate probes `PROBE_DIST=40 px` and is scored by:
  1. Clear probe path (unblocked beats blocked).
  2. Positive dot product with direct direction (progress toward target).
  3. Lower angular deviation (less detour).
- Returns the best candidate; if all are blocked returns least-bad so enemies do not freeze.
- Stops early once a clear path with positive progress is found (typical case: one iteration).
- This is still local steering, NOT pathfinding — stateless, cheap, no graph construction.

**Stricter ring ordering tests (`__tests__/topographic-terrain.test.ts`):**

- Added 'ring radii are monotonically increasing point-by-point across adjacent rings':
  for every seed, every island, every adjacent ring pair, every point index, `outer[j].radius ≥ inner[j].radius - 0.5 px`.
- Added 'finds an island with at least 7 rings and validates point-by-point ordering':
  searches up to 200 seeds for a 7+ ring island and validates it. Skips gracefully if none found.
- Both new tests pass for all seeds in [1, 42, 137, 999, 0xdeadbeef].

**Ruby laser terrain truncation regression (`__tests__/topographic-terrain.test.ts`):**

- New describe block: 'applyLaserBeamHitSweep — terrain truncation regression'.
- Creates a horizontal beam from (0, 100) with an island at (150, 100) half-size=30.
- Uses `terrainFirstIntersectionT` to compute truncated `tMax` (≈120 px).
- Verifies: enemy at (80, 100) receives damage; enemy at (400, 100) does NOT.
- Confirms the existing `tMax` / `isWithinBeam(tProj > tMax)` path correctly gates damage.

**All tests pass. Build passes.**

---

### Build #80 — Topographic terrain visual generation pass: shared island profiles

**Problem addressed:**
The terrain looked like glowing flower/atom doodles instead of topographic map contours.
Each ring was independently generated with its own random frequencies, phases, and center
offsets, causing rings to cross and look unrelated. Palettes were too neon, the outermost
ring was given a special thick green-style border, and islands were small with high-frequency
deformation.

**Key generation change — shared `IslandShapeProfile` per island:**

- Each island now generates one `IslandShapeProfile` (2–3 harmonics, frequencies 1–4,
  low amplitudes 0.08–0.18 / 0.03–0.08 / 0.01–0.04) plus optional elongation (0–0.28).
- All rings for the island are derived from the **same** profile: `radius(θ) = outerRadius × ringScale × shapeMultiplier(θ) × tinyPerturb`.
- Per-ring perturbation is capped at 1–2.5%, well below the radial gap between adjacent
  rings, guaranteeing **no ring crossings**.
- Removed per-ring independent `freq1/freq2/freq3` and `centerOffsetX/Y` jitter that caused
  rings to wander and cross.

**Line hierarchy (index contours):**
- Every 3rd ring (from innermost) is an **index contour**: lineWidth 1.2–1.5 px, alpha 0.70–0.88.
- Normal rings: lineWidth 0.65–1.0 px, alpha 0.42–0.70.
- Outermost ring no longer gets a special thick treatment — it's just another contour.

**Palette update (less neon, more topographic):**
- `mono`: neutral grays #c8c8c8→#585858, no glow.
- `copper`: muted warm tones #a06030→#955028, very subtle glow (4% alpha).
- `cyanTactical`: dark teal #186880→#127888, subtle glow (5% alpha) — no more bright cyan/green borders.
- Glow width reduced from 3× to 2.5× line width.

**Island sizing:**
- `outerRadius` range increased from [25, 55] to [35, 80] px for more map-like scale.
- Ring count range increased from [3, 7] to [2, 9].

**Center dots:**
- Center dots already existed only in dev mode (`terrainDevMode === true`) — confirmed dev-only.

**New tests added (all pass):**
- Rings have monotonically increasing average radii across multiple seeds.
- No NaN or negative radius values in any ring.
- Solid outer polygon has ≥ 32 points.
- At least one island is generated per call.

**All 86 tests pass. Build passes. CodeQL clean.**

---

### Remaining terrain gaps

1. **`terrainAwareDirection`** — The left/right tangent probe steer avoids direct collision but can cause oscillation at concave corners. A path-following probe would be more stable.

2. **Sunstone mines** — Mine placement and persistence are not terrain-checked (mines can be placed on terrain).

3. **Ruby laser hit sweep** — `applyLaserBeamHitSweep` uses `terrainFirstIntersectionT` for beam truncation but damage eligibility still uses a simple distance check rather than verifying the target is before the truncated endpoint.

4. **Further topographic polish ideas:**
   - Add occasional "ridge" islands: elongated with a high elongationAmount value forced.
   - Try a two-island "mountain range" cluster where islands share a nearby center.
   - Experiment with a very subtle background fill gradient (dark center) for depth.
   - Experiment with different alpha/transparency for the terrain area fill.

---

### Build #79 — Terrain consistency pass: LOS API, elite/proc push-out, blink, vortex pull

**Problem addressed:**
Completed the remaining terrain gameplay consistency gaps identified in Build #78:
centralized LOS-aware targeting, wired push-out for all elite and procedural enemy bodies,
corrected the emerald blink destination, and fixed vortex-pulled enemies entering terrain.

**LOS-aware targeting API (`rpg-targeting-types.ts`, `rpg-targeting-targets.ts`, `rpg-targeting.ts`, `rpg-render.ts`):**

- Added `TargetCollectionOptions` interface (exported from `rpg-targeting-types.ts`) with fields:
  - `originX?/originY?` — LOS check origin (defaults to mote for `collectEnemyBodyTargets`, to `(x,y)` for `findClosestEnemyFrom`)
  - `requireLineOfSight?: boolean` — when true, targets blocked by terrain are excluded
  - `includeProjectiles?: boolean` — when true, also includes flying projectiles in the target list
- Updated `collectEnemyBodyTargets(opts?)` — applies `hasTopographicTerrainLineOfSight` filter per-target when `requireLineOfSight: true`. Also handles aliven-particle LOS. When `includeProjectiles: true`, appends all projectile bodies (missiles, bolts, spikes, shards, tendrils) to the list.
- Updated `findClosestEnemyFrom(x, y, rangeSq, opts?)` — passes opts to `collectEnemyBodyTargets` with origin defaulting to `(x,y)` for LOS checks.
- Wrappers in `rpg-targeting.ts` and `rpg-render.ts` updated to pass opts through.

**Elite enemy body terrain push-out (`rpg-elite-enemy-updates-early.ts`, `rpg-elite-enemy-updates-late.ts`):**

- Added `ELITE_*_RADIUS` constants to imports.
- Added `applyEnemyTerrainPushOut(enemy, ctx.getTerrainState(), ELITE_*_RADIUS)` after every `clampEnemyToBounds` call for: Quartz, Ruby, Sunstone, Citrine (early file), and Iolite, Amethyst, Diamond (both orbit and patrol branches), Nullstone (late file).

**Procedural enemy body terrain push-out (`rpg-procedural-update.ts`):**

- Added `applyEnemyTerrainPushOut` after each movement step for:
  DustWisp, RibbonWorm (head), LanternMoth, EyeStalk, Jellyfish, ClothGhost, GearInsect, SpiderCrawler, MoteSwarm, ShadowHand.
- PlantTurret is anchored to its root position and requires no push-out.
- Imported `applyEnemyTerrainPushOut` and per-type `SIZE` constants.

**Emerald blink terrain check (`rpg-enemy-updates.ts`):**

- After the blink destination is computed and arena-clamped, `applyEnemyTerrainPushOut` is called so the enemy materialises outside any island rather than inside it.

**Vortex pull terrain fix (`rpg-weapon-vortex.ts`):**

- In `updateVortexes`, terrain is obtained once per frame.
- `applyPull` now calls `pushPointOutsideTopographicTerrain` (using a module-level scratch object to avoid per-frame allocation) to push any enemy that the gravity pull has moved into terrain back to the surface.

---

### Remaining terrain gaps

1. **`terrainAwareDirection`** — The left/right tangent probe steer avoids direct collision but can cause oscillation at concave corners. A path-following probe would be more stable.

2. **Sunstone mines** — Mine placement and persistence are not terrain-checked (mines can be placed on terrain).

3. **Ruby laser hit sweep** — `applyLaserBeamHitSweep` uses `terrainFirstIntersectionT` for beam truncation but damage eligibility still uses a simple distance check rather than verifying the target is before the truncated endpoint.

---

### Build #78 — Terrain repair and consistency pass

**Problem addressed:**
A focused repair pass on the topographic terrain integration to make collision, LOS, and weapon terrain interactions behave correctly and consistently.

**Critical bug fixed:**

- **`applyEnemyTerrainPushOut` velocity correction** (`rpg-enemy-updates.ts`) — The function was overwriting `entity.x/entity.y` with the pushed-out position before computing the push vector used to zero velocity. This made the push vector zero, so the velocity correction never ran. Fixed by capturing `oldX/oldY` before the position update and using `(newX - oldX, newY - oldY)` as the outward normal direction.

**Terrain helper improvements:**

- **`circleIntersectsTopographicTerrain`** (`terrain/topographic-terrain.ts`) — Replaced the incorrect edge-proximity check (which used `pushPointOutsideTopographicTerrain` and only caught center-inside cases) with a proper per-edge distance check using a new `pointToSegmentDistSq` helper. The test in inverse-scaled space uses `radiusPx / g` as the equivalent radius. Now correctly detects a circle that overlaps an island even when the circle centre is outside the polygon.

- **`hasTopographicTerrainLineOfSight`** (`terrain/topographic-terrain.ts`) — New exported helper: returns `true` when the straight line from `(fromX, fromY)` to `(toX, toY)` is unobstructed by terrain, and `true` when terrain is null. Used instead of repeating raw `segmentIntersectsTopographicTerrain` negation everywhere.

**Weapon terrain integration:**

- **Poison bolts** (`rpg-weapon-poison.ts`) — Added `getTerrainState?` to `PoisonWeaponCtx`. Bolt is destroyed when its movement segment intersects terrain (before enemy collision check). Track `prevX/prevY` before each step.

- **Emerald primary missiles** (`rpg-weapon-emerald.ts`) — Added `getTerrainState?` to `EmeraldWeaponCtx`. Missile fizzles (spawns equidistant sub-missiles) when movement segment crosses terrain. Homing now skips enemies with terrain between the missile and the target (LOS-aware target selection in `checkTarget`).

- **Emerald sub-missiles** (`rpg-weapon-emerald-subs.ts`) — Added `getTerrainState?` to `EmeraldSubsCtx`. Sub-missile is destroyed when movement segment crosses terrain. **AOE explosions now respect terrain LOS**: enemies with terrain between the explosion point and themselves are not damaged. Boss AOE also respects terrain LOS.

- **Chain whip** (`rpg-weapon-chain.ts`) — Added `getTerrainState?` to `ChainWeaponCtx`. Before applying contact damage from a chain node, checks that the player-to-node segment does not cross terrain. If the chain has passed through terrain, it cannot deal damage. Applies to both enemy array iteration and boss hit check.

- **Sword / sand blade** (`rpg-weapon-sword-combo-helpers.ts`) — Added `getTerrainState?` to `SwordWeaponCtx`. In `swordHitInArc`, all enemies (including boss and aliven particles) are skipped if terrain blocks the player-to-target segment. Exceptions: targets within `MELEE_TOUCH_SQ` (16px) are never blocked by terrain.

- **Sapphire companion lasers** (`rpg-weapon-ships.ts`) — Added `getTerrainState?` to `ShipWeaponCtx`. Track `prevX/prevY` before each step; destroy laser if movement segment crosses terrain.

- **Amethyst companion lasers** (`rpg-weapon-amethyst-ships.ts`) — Added `getTerrainState?` to `AmethystShipCtx`. Track `prevX/prevY` before each step; destroy laser if movement segment crosses terrain.

**Unit tests:**

- **`src/render/rpg/__tests__/topographic-terrain.test.ts`** — New test file covering:
  - `isPointInsideTopographicTerrain` with full and half growth01
  - `segmentIntersectsTopographicTerrain` crossing, missing, and growth01 cases
  - `circleIntersectsTopographicTerrain` edge-proximity detection (the previously broken case)
  - `terrainFirstIntersectionT` < 1 for a blocking ray
  - `hasTopographicTerrainLineOfSight` for blocked and clear paths



### Build #76 — Terrain integration: enemy spawn exclusion, player push-out, projectile blocking, LOS

**Problem addressed:**
The topographic terrain geometry helpers (`isPointInsideTopographicTerrain`, `segmentIntersectsTopographicTerrain`, `pushPointOutsideTopographicTerrain`) existed but were not yet wired into the live game systems.

**Changes made:**

1. **Enemy spawn exclusion** (`rpg-enemy-spawn.ts`) — already connected in a prior build via `getTopographicTerrainState()`. Verified that all spawn rejection loops call `isPointInsideTopographicTerrain`.

2. **Player push-out** (`rpg-player-movement.ts`) — After position integration and arena clamping, call `pushPointOutsideTopographicTerrain` with a margin of `half + 2` px. Growth-aware (uses `growth01` scale). Velocity component toward the island is zeroed on collision to prevent sticking. Wired via new `getTerrainState()` on `PlayerMovementCtx`.

3. **Projectile blocking** (9 files) — `segmentIntersectsTopographicTerrain` is now called after each projectile movement step. Any projectile whose segment from `(prevX, prevY)` to `(newX, newY)` crosses or enters terrain is immediately destroyed. Covered types:
   - `SapphireMissile` (`rpg-enemy-updates-basic.ts`)
   - `AmberShard` (`rpg-enemy-updates.ts`)
   - `QuartzSpike`, `RubyBolt`, `CitrineBolt` (`rpg-enemy-updates-mid.ts`)
   - `AmethystShard`, `DiamondShard`, `VoidTendril` (`rpg-enemy-updates-adv-early.ts`)
   - `FracterylShard` (`rpg-enemy-updates-adv-late.ts`)
   - `PlantProjectile` (`rpg-procedural-update.ts`) — loop converted from for-of to indexed for proper splice support

4. **Line-of-sight blocking** (`rpg-targeting-nearest.ts`) — All enemy-body targets in `findClosestTarget` and `findClosestEnemy` are now filtered through a `isLosBlocked(terrain, mx, my, ex, ey)` helper. Projectile/shard/bolt targets remain always targetable (they're flying at the player and need to be destroyable regardless of terrain position). Wired via `getTerrainState()` on `RpgTargetingCtx`.

5. **Context wiring** (`rpg-render.ts`, `rpg-targeting-types.ts`, `rpg-player-movement.ts`, `rpg-enemy-updates.ts`, `rpg-wave-manager.ts`) — Added `getTerrainState(): TopographicTerrainState | null` method to the relevant context interfaces; rpg-render.ts provides `() => topographicTerrainState` for each.

---

### Build #75 — Topographic terrain geometry helpers and refactor


**Problem addressed:**
The enemy bestiary (Enemies tab in the RPG overlay) was missing all 11 procedurally-animated enemy types. This build adds them to the catalog and renders them with animated previews.

**Changes made:**

1. **`rpg-enemies-catalog-types.ts`** — Added optional `category: EnemyCategory` field (`'standard' | 'elite' | 'aliven' | 'procedural' | 'boss'`) to `EnemyCatalogEntry`.

2. **`rpg-enemies-catalog-entries.ts`** — Added all 11 proc enemy entries to `ENEMY_CATALOG`:
   - `proc_dustwisp`, `proc_ribbonworm`, `proc_lanternmoth`, `proc_eyestalk`, `proc_jellyfish`
   - `proc_clothghost`, `proc_plantturret`, `proc_gearinsect`, `proc_spidercrawler`
   - `proc_moteswarm`, `proc_shadowhand`
   - All have `firstWave: 26` except `proc_shadowhand` (firstWave: 32), reflecting actual first encounter in procedural waves.

3. **`rpg-enemies-tab-icons.ts`** — Added `createProcIconCanvas(entry)` function that reuses the real gameplay draw functions (`drawDustWispEnemies`, etc.) to render animated previews in the 40×40 icon box. Each proc type gets a lightweight preview state object with advancing animation phases via RAF.

4. **`rpg-enemies-tab.ts`** — Updated `buildEnemyEntry` to detect `proc_*` entries and use `createProcIconCanvas` instead of the static icon renderer.

5. **`wave-definitions.ts`** — Replaced the stale 13-enemy comment block with a comprehensive listing of all enemy categories (standard, elite, aliven, procedural, boss) with accurate wave thresholds.

6. **`rpg-procedural-types.ts`** — Fixed stale wave comments: the per-type "wave N+" figures now note the generator threshold vs actual first-encounter wave (26 for all except shadowhand at 32).

**Encounter tracking decision:**
The existing passive system (`highestWaveReached >= entry.firstWave`) is retained. It works correctly now that all proc enemies have accurate `firstWave` values:
- Proc enemies with firstWave=26 become visible once the player reaches wave 26.
- Proc enemies only spawn in procedural waves (26+), so highestWaveReached=26 correctly coincides with first encounter.
- No risk of showing enemies the player hasn't actually seen.

**Projectiles not added:**
`PlantProjectile` (the only projectile emitted by proc creatures) is intentionally excluded from the encounter list. It is a transient combat hazard, not a named enemy the player would track in a bestiary. This matches the design intent of all other projectile types (sapphire missiles, amber shards, nullstone tendrils, etc.), none of which appear in the catalog.

---

## Open / Remaining Work

### Encounter tracking — explicit markEnemyEncountered
The current passive system unlocks enemy catalog entries once `highestWaveReached >= firstWave`. This works correctly for the current set of enemies.

A more explicit `markEnemyEncountered(enemyTypeId: string)` approach (stored in rpgState, called from `spawnEnemyById`) would allow:
- Showing only enemies the player has literally seen in this playthrough.
- Richer per-type unlock data (first-seen wave, kill count, etc.).

To implement:
1. Add `encounteredEnemyTypes: Set<string>` to `RpgSimState` (default: empty set).
2. Serialize it in save-types.ts (bump save version).
3. In `rpg-enemy-spawn.ts / spawnEnemyById`, call `ctx.markEncountered(enemyTypeId)`.
4. In `rpg-enemies-tab.ts`, replace the `highestWaveReached >= firstWave` check with `encounteredEnemyTypes.has(entry.id)`.
5. Dev mode: show all entries regardless.

### Pre-defined waves vs proc creature thresholds
The procedural generator introduces proc_dustwisp at waveNumber >= 5, but pre-defined waves 1–25 don't include any proc creatures. This means proc creatures effectively start at wave 26.

Options:
- **Status quo (current)**: Accept that proc creatures start at wave 26. Bestiary correctly reflects this.
- **Add proc creatures to pre-defined waves**: Could add 1× proc_dustwisp to wave 5, 1× proc_ribbonworm to wave 7, etc. This would expose players to proc creatures earlier and match the generator intent. Would require gameplay testing to ensure difficulty curve is acceptable.

If taking the second option: update the `firstWave` values in ENEMY_CATALOG accordingly and add entries to WAVE_DEFINITIONS.

### Validation / test assertion
A lightweight dev-time assertion could check that every `enemyTypeId` used in `WAVE_DEFINITIONS` and in the procedural generator has a corresponding `ENEMY_CATALOG` entry. Example:

```ts
// In a dev build or test file:
import { WAVE_DEFINITIONS, getWaveDefinition } from './wave-definitions';
import { ENEMY_CATALOG } from '../../ui/panels/rpg-enemies-catalog';

const catalogIds = new Set(ENEMY_CATALOG.map(e => e.id));
for (const wave of WAVE_DEFINITIONS) {
  for (const spawn of wave.spawns) {
    if (!catalogIds.has(spawn.enemyTypeId) && spawn.enemyTypeId !== 'boss') {
      console.warn(`Missing catalog entry for: ${spawn.enemyTypeId}`);
    }
  }
}
```

This could be added as a dev-mode startup check in `rpg-enemies-tab.ts` or as a unit test.

---

**Auto-move melee range bug fix:**
- `PLAYER_BASE_RANGE_PX=50` was used as the default stop distance even though the sand blade only reaches 30px (getSwordLength(1)).
- New policy: when `sandBladeEnabled` and no diamond blade equipped, auto-move stops at `getSwordLength(1) × AUTO_MOVE_MELEE_STOP_MARGIN (0.82) ≈ 24.6px`, well inside actual swing reach.
- Added `AUTO_MOVE_MELEE_STOP_MARGIN` and `AUTO_MOVE_CHAIN_WHIP_STOP_PX` constants to `rpg-constants.ts`.
- Added detailed comments in `rpg-player-movement.ts` explaining the stop-distance policy.

**Quartz whip auto-move:**
- Quartz whip now uses `AUTO_MOVE_CHAIN_WHIP_STOP_PX = 10px` as its stop range, making the player advance very close to the enemy for reliable whip contact.

**Sand blade Enable/Disable toggle:**
- Added `sandBladeEnabled: boolean` to `RpgSimState` (defaults to `true`).
- Added `toggle_sand_blade` action, handled in `app-actions.ts`.
- Sand blade card now appears at the top of the RPG weapons tab with Enable/Disable toggle.
- When disabled: sand blade does not auto-attack and auto-move does not use melee stop distance.
- Save/load: persisted as `sandBladeEnabled` (v25+ optional field, defaults to `true` on old saves).

**Ruby enemy damage-number coloring fix:**
- `spawnHitVisualsAt` previously hardcoded `'#ffffff'` for all damage numbers.
- Now passes the `color` parameter (enemy glow color, e.g., `RUBY_ENEMY_GLOW`) through to the damage number.
- Ruby enemy hits now correctly show pale ruby-colored damage numbers.

**Gradient damage numbers:**
- Added optional `sourceColor?: string` to `DamageNumber` interface.
- `spawnDamageNumber`, `spawnHitVisualsAt`, `spawnHitVisuals` all accept optional `sourceColor`.
- `drawDamageNumbers` creates a `CanvasGradient` from `sourceColor` (weapon/top) to `color` (enemy/bottom) when `sourceColor` is present.
- `performSingleAttack` uses `effectiveSourceColor` = weapon tier color (from `TIER_BY_ID`) to enable gradient.
- Gradient reads: sand/gold → ruby for sand blade hits on ruby enemies; ruby red → quartz blue for ruby laser on quartz enemies; etc.

**Save version note:**
- `sandBladeEnabled` added as optional v25+ field. Save version constant not bumped (backward-compatible via `?? true`).

---

### Build #65 — RPG wiring, XP reservoir, multiplier boxes, stat multipliers

**Box 1 — Equipment by wire:**
- Weapons placed in weapon slots are now only **active in combat if a Box 1 wire connects to that slot**.
- Legacy fallback: if no Box 1 wires exist, all equipped weapons remain active (backward-compatible with existing saves).
- `RpgStatsPanelHandle` exposes `isSlotEquippedByWire(slotIdx)` and `hasAnyEquipWire()`.
- `getEffectiveEquippedIds()` in `rpg-render.ts` filters by wire state.

**Box 2 — XP reservoir:**
- Newly-earned XP now accumulates in `rpgSimState.xpReservoir` (Box 2 display).
- Box 2 shows reservoir XP (unallocated), not total lifetime XP.
- When Box 2 is connected to a modifier box, XP drains each frame at `max(50, reservoir × 1.5)` XP/sec.

**Boxes 3/4/5 — Multiplier boxes:**
- Each has Roman numeral (I/II/III) in the top-left corner, a progress bar, and level text (x1, x2, etc.).
- XP cost: `50 × 5^(level − 1)` — level 1→2: 50 XP, level 2→3: 250 XP, etc.
- `tickMultiplierXpProgress` in `rpg-state-xp.ts` handles overflow levelling.
- Progress bars and level text update in the stats panel each second.

**Stat multipliers in combat:**
- Modifier out → weapon stat socket wires tracked in stats panel `statModifiers` map.
- `getWeaponStatMultiplier(slotIdx, statKey)` returns the box level (1 = no effect).
- `rpg-render.ts` exposes `getWeaponAtkMultiplier/SpdMultiplier/RngMultiplier/PrcMultiplier(weaponId)`.
- `WeaponTickCtx.getWeaponSpdMultiplier` divides scaled cooldown by SPD multiplier.
- `RpgPlayerAttackCtx` applies ATK × damage, RNG × range, PRC × pierce ratio (clamped to 1).
- Stat cells in Boxes 7–11 display effective (multiplied) values in purple when boosted.

**Save/load:**
- `SAVE_VERSION` bumped to 24.
- New optional fields `xpReservoir` and `multiplierBoxes` in `SaveData.rpg`.
- Defaults on old saves: `xpReservoir = 0`, `multiplierBoxes = [{level:1, progressXp:0} × 3]`.

**Wire state note:**
Wire connections are **ephemeral** (reset on page load). They are not currently persisted.
The player must reconnect wires after a page reload. Future work could persist wire state.

---

### Build #59 — Achievement system audit & repair
Added 4 new equation mastery achievements; fixed all_bosses_at_speed to require all 10 bosses; added kills_all_regular_types condition; renamed sec_first_blood_max displayName; fixed RPG comment ranges; added 5 consistency audit tests; corrected VISIBLE_TIER_COUNT comment; renamed full_spectrum and eq_tier_13 displayNames; added policy and intentional-duplicate comments throughout.

### Build #4 — AlivenParticle enemy system
Implemented the full AlivenParticle swarm-enemy system: 7 variants (spark_cluster, shard_bloom, ember_drift, dasher, ghost, pulser, healer, splitter, spitter, orbiter), per-group lifecycle, specials, ghost phase, trails, and initial draw.

### Build #11 — Balance Forecast dev panel
Implemented the dev-only ⚖ Balance Forecast panel (Settings tab, dev mode). Static ETA analysis, fresh-run milestone simulation, four strategy comparisons (wait_only / cheapest_first / best_efficiency / rush_next_tier), and pacing warnings.

### Build #24 — Forge/Loom capture economy
3-tap heat system for the equation forge (`ForgeCrunchState`, `tapForgeHeat`), sacrifice pathway (`applyForgeSacrifice` at 10,000 mass/upgrade), loom capture conversion (`applyLoomCapture`, `getLoomInputTierId`, `tryUpgradeLoomEfficiency`), `ForgeFieldInfo`/`applyForgeFieldForces`, particle `isCaptured` field, save-version 23.

### Build #25 — Economy balance pass + polish
Lowered sacrifice threshold (10,000→2,000), loom conversion cost (100→50), efficiency scaling (5ˣ→3ˣ); non-sand looms now produce 10% passive motes. Added forge heat UI row, loom field aura visuals.

### Build #26 — Forge/Loom economy polish
- Verified and documented the forge sacrifice pathway vs legacy crunch pathway (no conflict).
- Fixed loom efficiency button showing wrong tier's mote balance.
- Added forge sacrifice flash (`drawForgeSacrificeFlash`, 600ms shockwave ring).
- Expanded forge tap radius for touch input (1.5× via `isTouchInput` flag).
- Added loom capture audio feedback (400ms cooldown gate on `onMotesMerged`).
- Cleaned loom button inline styles → CSS classes.
- Added Vitest; 18 unit tests for forge/loom economy logic.

### Build #27 — Aliven polish, architecture cleanup, forecast improvements
- **Removed** dead `tap_equation_forge` action type and no-op dispatch case.
- **Extracted** `FORGE_TOUCH_TAP_MULTIPLIER = 1.5` constant to `particle-config.ts`.
- **Aliven — overlap separation**: lightweight O(n²) repulsion pass (capped at `ALIVEN_SEPARATION_MAX_COUNT = 16`).
- **Aliven — pulser shockwave ring**: expanding ring visual for 350ms when pulser fires (`pulserFlashMs` on particle).
- **Aliven — splitter burst**: flash ring at split position for 300ms (`splitFlashMs/X/Y` on group).
- **Aliven — healer beam**: dashed faint line from healer to healed target for 280ms (`healBeamMs/TargetX/Y` on particle).
- **Aliven — centroid glow**: subtle glow behind the group centroid (proportional to health ratio).
- **Aliven — spitter bullet highlight**: white center dot on bullets for dodge readability.
- **Aliven — group health bar**: thin 22px bar above centroid showing aliveCount/targetCount.
- **Lucky mote fallback**: `trySpawnLuckyMote` now falls back to direct `TIER_BY_ID` lookup if `enemyTypeId` is not in `ENEMY_TYPE_TO_TIER` (handles Aliven groups using tier IDs directly). 6 new unit tests added.
- **Balance Forecast — cost-growth warnings**: `generatePacingWarnings` now flags loom upgrade cost jumps > `suspiciousCostGrowthMultiplier` (25×) between adjacent levels.
- **Balance Forecast — simulate from current state**: toggle checkbox in the panel; when checked, strategy runs start from the player's current resources/unlocks instead of a fresh run.

### Build #28 — Aliven indicator, wave pacing, group cap, performance
- **Aliven i-frame interface**: added `setPlayerIFramesMs(ms)` to `AlivenUpdateCtx` interface and wired the setter in `rpg-render.ts`. Spitter bullet hits already granted i-frames via `dealContactDamageToPlayer`; the setter makes the contract explicit and enables future callers to grant i-frames without triggering damage.
- **Aliven indicator integration**: `drawEnemyIndicators` now accepts an `alivenGroups` parameter and draws a tier-colored marker at each living group's centroid. Updated call site in `rpg-render-draw.ts`.
- **Hand-authored early Aliven wave appearances**: added Aliven spawns to `WAVE_DEFINITIONS` waves 2–25, introducing variants one at a time:
  - Wave 2–4: `aliven_spark_cluster` (spitter swarm, first encounter)
  - Wave 5–6: `aliven_quartz_ghost` (ghost/invulnerability mechanic)
  - Wave 7–10: `aliven_shard_bloom` (dasher aggression)
  - Wave 12–13: `aliven_pulse_swarm` (AoE shockwave mechanic)
  - Wave 15–16: `aliven_ember_ring` (trail-emitting movement reading)
  - Wave 18–19: `aliven_void_splinters` (splitter death cascade)
  - Wave 22–23: `aliven_healer_nodes` (teach prioritising healers)
  - Waves 24–25: mixed spark_cluster / void_splinters (combined challenge)
  - Procedural generator (wave 26+) continues to mix all unlocked variants.
- **Global Aliven group cap**: added `MAX_ACTIVE_ALIVEN_GROUPS = 8` to `rpg-aliven-constants.ts`; `spawnEnemyById` skips the spawn if the cap is reached, protecting mobile performance.
- **`applyForgeFieldForces` optimization**: pre-computed per-field squared radii and forge-check flags outside the particle loop; switched inner-loop distance comparison to squared-distance to avoid `Math.sqrt` for most particles.

### Build #29 — Dev playtesting panel, auto-tap upgrades, SVG forecast timeline
- **Dev playtesting panel** (`src/ui/panels/dev-panel.ts`): added a new "🔬 Playtesting Tools" section in Settings (visible only when Developer Mode is on):
  - RPG wave-jump buttons for waves 2, 5, 8, 12, 15, 18, 22, 25, 26.
  - Aliven spawn controls: per-variant spawn buttons, spawn-cap-count (8 groups) bulk button, clear-all button, live active group count display.
  - Forge state snapshot: heat tap count, crunch active flag, sacrifice progress per tier.
  - Loom state table: level, efficiency level, conversion progress, and special-purchased status for each unlocked loom.
  - Aliven balance validation table: hpBase, atkBase, xpMult, particleCount, specialKind, cooldown range for every variant; warns on bad constants (negative HP/ATK/XP, specialCdMin > specialCdMax).
- **Dev hooks wiring**: `RpgRender` gained `devSpawnAliven(variantId)`, `devClearAliven()`, `getAlivenGroupCount()`; `SettingsPanel` gained `registerDevHooks(hooks)`; game-app.ts wires hooks immediately after rpgRender is created.
- **Auto-tap upgrade** (`upgrade-catalog.ts`): added `AUTO_TAP_UPGRADE` (`id: 'auto_tap_speed'`, `tierId: 'sand'`, `baseCost: 50`, `costScaleFactor: 3`, `maxLevel: 13`). Level 1 unlocks auto-tap at 5 000 ms; each subsequent level reduces the interval by 400 ms down to the 200 ms hard floor. Compatible with existing saves (no prior catalog entry, so autoTapLevel was always 0). Balance Forecast picks it up automatically via `ALL_UPGRADES`.
- **Balance Forecast — SVG strategy timeline**: added `renderStrategyTimeline` function and a "📈 Strategy Timeline (Approximate)" section below the Strategy Comparison table. Renders each milestone as a dot on a shared time axis, one color per strategy. Tooltips show exact time. No extra dependencies.

### Build #30 — Session telemetry for dev playtesting
- **Session telemetry module** (`src/dev/session-telemetry.ts`): new pure-TypeScript module with no browser dependencies. Tracks session-level counters for forge, loom, and Aliven economies. Displayed only in the dev panel (Developer Mode on). Never persisted.
  - Forge: crunches completed, zero-particle crunches, mass sacrificed by tier, equation upgrades from sacrifice by tier, derived avg mass/crunch.
  - Loom: captures by input tier, captured mass by tier, output motes produced by tier, efficiency upgrades purchased, passive motes produced by non-sand tiers.
  - Aliven: spawned/killed by variant, cap skips, peak simultaneous group count, player damage from contact (including pulser AoE), player damage from bullets, bullets fired by variant.
- **Telemetry wiring**: counters are incremented at the actual call sites, not inferred from UI:
  - `game-state.ts` → `applyForgeSacrifice` (crunch + per-tier mass + upgrades gained), `processLoomCapture` (captures + mass + motes out), `tryUpgradeLoomEfficiencyAction` (efficiency upgrade), `simTick` (non-sand passive motes).
  - `loom-state.ts` → `applyLoomCapture` now returns `number` (motes produced) instead of `void`.
  - `rpg-enemy-spawn.ts` → Aliven group push (spawn + peak count) and cap-guard early-return (cap skip).
  - `rpg-aliven-updates.ts` → `tickContact` (contact damage), `tickPulser` (AoE contact damage), `tickSpitter` (bullet fired), `tickBullets` bullet-hit branch (bullet damage).
  - `rpg-wave-dead-enemies.ts` → Aliven group removal loop (kill by variant).
- **Dev panel update** (`src/ui/panels/dev-panel.ts`): added a "Session Telemetry" section after the Aliven Balance Table containing a "Reset Session Telemetry" button and three compact tables (forge, loom, Aliven). Telemetry refreshes whenever the dev panel refreshes.
- **Tests** (`src/dev/session-telemetry.test.ts`): 35 new Vitest unit tests covering reset, counter increments, unknown-key robustness, snapshot isolation, and `getAvgSacrificePerCrunch` edge cases. All 59 tests pass (35 new + 24 pre-existing).

---

## Current Remaining Work

### Build #73 follow-up — Remaining RPG polish items

**Auto-move edge cases still to verify:**
- Wall/corner enemy scenarios: manual verification recommended on enemies pinned to the arena boundary or a corner. The margin should absorb most cases but extreme corner pinning may need additional path-seeking if issues persist.
- The `_findNearestEnemy` implementation returns the closest enemy regardless of whether the player can reach it. If a wall prevents approach to that enemy, no pathfinding correction currently exists. A potential future improvement: fall back to the second-nearest enemy if movement doesn't reduce distance to the nearest for several frames.

**Gradient damage numbers — partial coverage:**
- The `spawnHitVisualsAt` / `performSingleAttack` path supports gradients fully.
- The following weapon paths use solid color only (no gradient) because enemy type is not readily accessible at the call site:
  - `performMultiAttack` — uses hardcoded `'#50b464'` as both fill and hit color.
  - `performAoeAttack` — uses fixed aoe color.
  - Sand gatling collisions (`rpg-weapon-sand-collision.ts`) — uses `SAND_PROJ_COLOR`.
  - Emerald missile, poison bolt, sunstone mine — use weapon-specific colors.
  - Sword combo direct hits (`swordHitInArc`) — use `SWORD_COLOR` or `SAND_BLADE_COLORS`.
- Future improvement: thread per-enemy glow colors through weapon-specific collision handlers or use a centralized `getEnemyGlowColor(enemy)` helper.

**Sand blade — diamond blade interaction:**
- When `diamond_bastion` is equipped, the sand blade is automatically suppressed. The sand blade card in the weapons tab does not explicitly call this out. Future UX: show a small label "Suppressed by Diamond Blade" when diamond_bastion is equipped.

**Sand blade tier:**
- The sand blade is always tier 1 in the auto-move stop calculation. If a future mechanic upgrades the sand blade's reach, `getSwordLength(1)` should be updated to reflect the current sand blade tier.

**Multi-attack sourceColor:**
- `performMultiAttack` was not updated with per-enemy `sourceColor`. All multi-attack numbers show solid `'#50b464'`. To fix: add an `shotColor` parameter to `performMultiAttack` and look up per-enemy glow colors (or accept it per call from `performWeaponAttack`).


- **Manual verification recommended:** Run a gameplay session that includes normal movement, heavy combat, and explosion-rich waves to confirm fluid wake/fade behavior is visually identical before/after the extraction.
- **Deferred low-risk optimization:** Consider squared-distance comparisons in some fluid speed checks only if profiling indicates `Math.sqrt` cost is meaningful on target mobile devices.
- **Deferred structural refactor candidates:** `src/render/rpg/rpg-render.ts` (~991 LOC) and `src/render/particles/particle-system.ts` (~503 LOC) remain large and should be split further in focused passes.
- **Validation caveat:** Repository lint still reports pre-existing `prefer-const` errors in `src/render/rpg/rpg-render.ts` (lines 252, 253, 254, 255, 277, 278) unrelated to this fluid extraction.

### Build #51 follow-up (wave dead-enemy modularization pass)
- **Manual verification recommended:** Play a run with standard enemies, elite enemies, Aliven groups, and a boss defeat to confirm XP, lucky-mote drops, secret flags, and cleanup timing remain identical.
- **Deferred structural refactor candidates:** `src/render/rpg/rpg-render.ts`, `src/render/particles/particle-system.ts`, and `src/render/background/substrate-effect.ts` remain high-size files for future safe extraction passes.

### Build #52 follow-up (laser beam modularization pass)
- **Manual verification recommended:** Test ruby laser beam against early, advanced, elite, and boss targets to confirm beam-hit thresholds, damage numbers, and hit effects remain unchanged.
- **Deferred structural refactor candidates:** `src/render/rpg/rpg-render.ts`, `src/render/particles/particle-system.ts`, and `src/render/background/substrate-effect.ts` remain high-size files for future safe extraction passes.

### Build #53 — Forge renderer extraction + rpg-render lint fixes
- Fixed 6 pre-existing `prefer-const` lint errors in `rpg-render.ts` (added `eslint-disable-next-line` for the `let x!: T` definite-assignment idiom where TypeScript does not allow `const`).
- Extracted private draw helpers from `forge-renderer.ts` (431 lines) to `forge-renderer-draw.ts` (~230 lines), reducing main file to ~200 lines. Helpers moved: `drawForgeBackgroundGlow`, `drawForgeHeatRings`, `drawForgeInfluenceSwirl`, `drawForgeSprite`, `drawForgeFallback`, `drawLoomAura` (renamed from `_drawLoomAura`), plus `FORGE_FIRE_COLORS`.
- Updated `file_index.md` with new `forge-renderer-draw.ts` entry.

### Build #54 — Achievement condition extraction
- Extracted `isConditionMet` (~260 lines, 35 condition cases) from `achievement-state.ts` to `achievement-conditions.ts`.
- `achievement-state.ts` reduced from 421 → ~160 lines; focuses on state types, factory, and claim/bonus API.
- `achievement-conditions.ts` is ~270 lines: pure condition evaluation, no state mutation.
- Updated `file_index.md`.

### Build #55 — Enemy indicator extraction
- Extracted `drawEnemyIndicators` from `rpg-enemy-draw.ts` to new `rpg-enemy-indicators.ts` (~130 lines).
- Kept `rpg-render.ts` call sites unchanged by re-exporting `drawEnemyIndicators` from `rpg-enemy-draw.ts`.
- Added indicator-specific low-graphics mode setter (`setEnemyIndicatorLowGraphicsMode`) and wired it into `setLowGraphicsMode` fan-out.
- `rpg-enemy-draw.ts` reduced from ~440 → ~370 lines.
- Updated `file_index.md`.

### Build #56 — Particle system helper extraction
- Extracted loom-capture cleanup from `particle-system.ts` to `src/render/particles/particle-system-loom-capture.ts` (`processLoomCaptures`).
- Extracted forge audio-transition edge detection from `particle-system.ts` to `src/render/particles/particle-system-audio.ts` (`computeForgeAudioTransitions`).
- Preserved runtime behavior; update pipeline ordering, callback behavior, and forge event semantics remain unchanged.
- Added a reusable capture scratch `Set` in `ParticleSystem` to avoid per-frame `new Set(...)` allocation on loom-capture frames.
- Updated `file_index.md` and `performanceOptimizationDecisions.md`.

### Build #55 follow-up
- **Deferred structural refactor candidates:** `src/render/rpg/rpg-render.ts` (999 lines, mostly DI wiring), `src/render/particles/particle-glow-field.ts` (444 lines), `src/render/rpg/rpg-enemy-draw-adv.ts` (376 lines).

### Build #56 follow-up
- **Deferred structural refactor candidates:** `src/render/rpg/rpg-render.ts` (999 lines, mostly DI wiring), `src/render/background/substrate-effect.ts` (465 lines), `src/render/particles/particle-glow-field.ts` (444 lines), `src/render/rpg/rpg-enemy-draw-adv.ts` (376 lines).
- **Manual verification recommended:** During a play session with active loom fields and forge activity, confirm capture callbacks and forge audio transitions feel identical before/after extraction.

### Needs manual playtesting before claiming done
- Balance values: sacrifice threshold (2,000), loom conversion base cost (50), efficiency scaling (3ˣ), 10% passive non-sand production rate. Needs real playtesting.
- **Auto-tap upgrade feel**: first level at 50 sand motes, scaling by 3× per level — does the pacing feel right? Is 13 levels the right depth?
- **Forge 3-tap heat sequence**: does the heat UI row feel responsive? Is 3 taps the right number?
- **Forge capture and sacrifice flash timing**: does the 600ms shockwave feel satisfying?
- **Loom capture audio cooldown**: does 400ms cooldown feel right at various particle densities?
- **Loom efficiency upgrade UX**: verify the button deducts the correct tier's motes and the UI reflects it correctly.
- **Early game conversion pacing**: with a fresh save, does the sand→quartz loom feel achievable?
- **Non-sand 10% passive production feel**: does non-sand progression feel too slow without active captures?
- **Aliven group readability with new visuals**: healer beam, pulser ring, splitter burst — are they legible and not cluttered?
- **Aliven early wave pacing**: play waves 2–25 and verify each variant introduction feels readable and not overwhelming.
- **Aliven performance**: verify frame rate stays stable when 8 groups (the cap) are alive simultaneously on a mid-tier device. Use the dev panel "Spawn 8" button to test.
- **Aliven indicator markers**: verify tier-colored markers appear for Aliven group centroids (requires playing to wave 2+).
- **Aliven balance values**: `hpBase`, `atkBase`, `xpMult`, `specialCdMin/Max` values are starting points — needs real playtesting. Use the dev panel's Aliven Balance Table and Session Telemetry for reference.
- **Session telemetry panel**: verify the telemetry tables populate correctly during a real play session, and that the "Reset" button clears all counters.

### Balance Forecast — still deferred
- **RPG milestone simulation**: the engine cannot simulate RPG combat loop (wave/XP progression). Requires: player base DPS from `playerStats`, enemy HP formula per wave tier, XP per kill constant, and wave-boost multiplier growth curve. Until these values stabilise, a labeled "RPG estimate" section is deferred.
- **Timeline chart enhancements**: the SVG timeline renders dots but has no click-through or zoom. If axis labelling is hard to read at high milestone counts, consider collapsing rows to category headers. Deferred until needed.

---

## Manual Playtesting Checklist

Use this when doing a manual playtesting session. Check off what you tested.

### Dev Panel
- [ ] "🔬 Playtesting Tools" section appears in Settings only when Developer Mode is on
- [ ] Wave-jump buttons (W2 … W26) teleport the RPG to the correct wave
- [ ] Aliven spawn buttons add the correct variant; count display updates
- [ ] Spawn-8 button adds up to 8 groups (capped); cap does not overflow
- [ ] Clear Aliven button removes all active groups
- [ ] Forge state shows correct heat tap count and crunch active flag
- [ ] Loom table shows correct level and conversion progress per tier
- [ ] Aliven balance table shows all 7 variants with no unexpected warnings
- [ ] Session Telemetry section is visible below the balance table
- [ ] After a forge crunch, forge telemetry counters increment
- [ ] After capturing particles via a loom, loom capture counters increment
- [ ] After Aliven groups are spawned/killed, Aliven counters increment
- [ ] "Reset Session Telemetry" button clears all counters immediately

### Forge
- [ ] Forge 3-tap heat sequence: tapping three times triggers crunch (particles captured, sacrifice flash shown)
- [ ] Forge tap on mobile: is the touch hit area large enough?
- [ ] Forge sacrifice flash: 600ms shockwave ring visible and feels satisfying
- [ ] Forge heat UI row (equation panel): shows ● dots and count, disappears after crunch

### Looms
- [ ] Loom capture: particles sucked into loom, progress bar increments toward output mote
- [ ] Loom audio cooldown: a sound plays when particles are captured; not overwhelming
- [ ] Loom efficiency upgrade: button shows correct tier mote cost; pressing deducts and increments level
- [ ] Loom conversion threshold drops with efficiency upgrades
- [ ] Non-sand passive production: Quartz+ looms trickle motes slowly even without captures

### Auto-Tap Upgrade
- [ ] "Auto-Tap Speed" upgrade appears in the upgrades panel when sand motes ≥ 50
- [ ] Buying level 1 enables auto-tap at 5 000 ms interval (visible from equation timer)
- [ ] Each subsequent level reduces interval by 400 ms
- [ ] At level 13, auto-tap interval is at the 200 ms hard floor and the upgrade is maxed

### Aliven Enemies
- [ ] Wave 2 introduction: a `spark_cluster` group appears after the laser/quartz enemies — player can learn the swarm pattern
- [ ] Wave 5 introduction: a `quartz_ghost` group appears — ghost invulnerability is readable
- [ ] Wave 8 introduction: a `shard_bloom` group appears — dasher aggression is distinct from earlier variants
- [ ] Wave 12 introduction: a `pulse_swarm` group appears — AoE shockwave ring is visible and communicates range
- [ ] Wave 15 introduction: an `ember_ring` group appears — trail patterns are visible
- [ ] Wave 18 introduction: a `void_splinters` group appears — splitter burst visual fires on death
- [ ] Wave 22 introduction: a `healer_nodes` group appears — healer beam draws attention to the healer particle
- [ ] Overlap separation: alive particles within a group stay visually separated (not piled up)
- [ ] Pulser ring visual: a ring expands outward when a pulser fires its shockwave
- [ ] Splitter burst: a brief flash ring appears at the particle position when a splitter dies and splits
- [ ] Healer beam: a faint dashed line connects healer to the particle it just healed
- [ ] Group cap: when 8 groups are alive, no new groups spawn (wave 26+ procedural)
- [ ] Performance: frame rate stable with 8 Aliven groups alive simultaneously on a mid-tier device

### General
- [ ] Save/load: existing save (v23+) loads without errors or lost progress
- [ ] Desktop mouse: forge tap, loom interaction, equation tap all work with mouse
- [ ] Mobile touch: same flows work on a real phone (portrait and landscape)
- [ ] Tab switching: switching between Equation / Resources / Settings preserves all UI state
- [ ] Settings persistence: dev mode, visual options, sound volume all persist across reload

---

## Balance Forecast Panel Reference

Accessible only in dev mode (Settings → Developer Mode ON).

| File | Purpose |
|---|---|
| `balance-forecast-types.ts` | Shared types, `formatDuration`, warning thresholds |
| `balance-forecast-engine.ts` | Core analysis/simulation engine |
| `balance-forecast-panel.ts` | DOM panel rendering (includes SVG timeline) |
| `balance-forecast-sim.ts` | Strategy simulation runner |
| `balance-forecast-state.ts` | SimState, `createFreshSimState`, `simStateFromGame` |
| `balance-forecast-purchases.ts` | Available-purchase enumeration |
| `balance-forecast-strategies.ts` | Strategy function definitions |

**"Simulate from current state" toggle**: when checked, the Strategy Comparison table starts from your current resources/unlocks rather than a fresh game. Useful for planning which strategy would be most efficient from your current position.

**Cost-growth warnings**: the pacing warnings section now includes flags when adjacent loom upgrade costs jump by more than 25× (configurable via `BALANCE_WARNING_THRESHOLDS.suspiciousCostGrowthMultiplier`).

**SVG strategy timeline**: a simple dot-chart below the Strategy Comparison table showing when each milestone is reached per strategy. Hover a dot to see the exact time. No zoom or interactivity beyond tooltips.


---

## Build History Summary

### Build #4 — AlivenParticle enemy system
Implemented the full AlivenParticle swarm-enemy system: 7 variants (spark_cluster, shard_bloom, ember_drift, dasher, ghost, pulser, healer, splitter, spitter, orbiter), per-group lifecycle, specials, ghost phase, trails, and initial draw.

### Build #11 — Balance Forecast dev panel
Implemented the dev-only ⚖ Balance Forecast panel (Settings tab, dev mode). Static ETA analysis, fresh-run milestone simulation, four strategy comparisons (wait_only / cheapest_first / best_efficiency / rush_next_tier), and pacing warnings.

### Build #24 — Forge/Loom capture economy
3-tap heat system for the equation forge (`ForgeCrunchState`, `tapForgeHeat`), sacrifice pathway (`applyForgeSacrifice` at 10,000 mass/upgrade), loom capture conversion (`applyLoomCapture`, `getLoomInputTierId`, `tryUpgradeLoomEfficiency`), `ForgeFieldInfo`/`applyForgeFieldForces`, particle `isCaptured` field, save-version 23.

### Build #25 — Economy balance pass + polish
Lowered sacrifice threshold (10,000→2,000), loom conversion cost (100→50), efficiency scaling (5ˣ→3ˣ); non-sand looms now produce 10% passive motes. Added forge heat UI row, loom field aura visuals.

### Build #26 — Forge/Loom economy polish
- Verified and documented the forge sacrifice pathway vs legacy crunch pathway (no conflict).
- Fixed loom efficiency button showing wrong tier's mote balance.
- Added forge sacrifice flash (`drawForgeSacrificeFlash`, 600ms shockwave ring).
- Expanded forge tap radius for touch input (1.5× via `isTouchInput` flag).
- Added loom capture audio feedback (400ms cooldown gate on `onMotesMerged`).
- Cleaned loom button inline styles → CSS classes.
- Added Vitest; 18 unit tests for forge/loom economy logic.

### Build #27 — Aliven polish, architecture cleanup, forecast improvements
- **Removed** dead `tap_equation_forge` action type and no-op dispatch case.
- **Extracted** `FORGE_TOUCH_TAP_MULTIPLIER = 1.5` constant to `particle-config.ts`.
- **Aliven — overlap separation**: lightweight O(n²) repulsion pass (capped at `ALIVEN_SEPARATION_MAX_COUNT = 16`).
- **Aliven — pulser shockwave ring**: expanding ring visual for 350ms when pulser fires (`pulserFlashMs` on particle).
- **Aliven — splitter burst**: flash ring at split position for 300ms (`splitFlashMs/X/Y` on group).
- **Aliven — healer beam**: dashed faint line from healer to healed target for 280ms (`healBeamMs/TargetX/Y` on particle).
- **Aliven — centroid glow**: subtle glow behind the group centroid (proportional to health ratio).
- **Aliven — spitter bullet highlight**: white center dot on bullets for dodge readability.
- **Aliven — group health bar**: thin 22px bar above centroid showing aliveCount/targetCount.
- **Lucky mote fallback**: `trySpawnLuckyMote` now falls back to direct `TIER_BY_ID` lookup if `enemyTypeId` is not in `ENEMY_TYPE_TO_TIER` (handles Aliven groups using tier IDs directly). 6 new unit tests added.
- **Balance Forecast — cost-growth warnings**: `generatePacingWarnings` now flags loom upgrade cost jumps > `suspiciousCostGrowthMultiplier` (25×) between adjacent levels.
- **Balance Forecast — simulate from current state**: toggle checkbox in the panel; when checked, strategy runs start from the player's current resources/unlocks instead of a fresh run.

### Build #28 — Aliven indicator, wave pacing, group cap, performance
- **Aliven i-frame interface**: added `setPlayerIFramesMs(ms)` to `AlivenUpdateCtx` interface and wired the setter in `rpg-render.ts`. Spitter bullet hits already granted i-frames via `dealContactDamageToPlayer`; the setter makes the contract explicit and enables future callers to grant i-frames without triggering damage.
- **Aliven indicator integration**: `drawEnemyIndicators` now accepts an `alivenGroups` parameter and draws a tier-colored marker at each living group's centroid. Updated call site in `rpg-render-draw.ts`.
- **Hand-authored early Aliven wave appearances**: added Aliven spawns to `WAVE_DEFINITIONS` waves 2–25, introducing variants one at a time:
  - Wave 2–4: `aliven_spark_cluster` (spitter swarm, first encounter)
  - Wave 5–6: `aliven_quartz_ghost` (ghost/invulnerability mechanic)
  - Wave 7–10: `aliven_shard_bloom` (dasher aggression)
  - Wave 12–13: `aliven_pulse_swarm` (AoE shockwave mechanic)
  - Wave 15–16: `aliven_ember_ring` (trail-emitting movement reading)
  - Wave 18–19: `aliven_void_splinters` (splitter death cascade)
  - Wave 22–23: `aliven_healer_nodes` (teach prioritising healers)
  - Waves 24–25: mixed spark_cluster / void_splinters (combined challenge)
  - Procedural generator (wave 26+) continues to mix all unlocked variants.
- **Global Aliven group cap**: added `MAX_ACTIVE_ALIVEN_GROUPS = 8` to `rpg-aliven-constants.ts`; `spawnEnemyById` skips the spawn if the cap is reached, protecting mobile performance.
- **`applyForgeFieldForces` optimization**: pre-computed per-field squared radii and forge-check flags outside the particle loop; switched inner-loop distance comparison to squared-distance to avoid `Math.sqrt` for most particles.

### Build #29 — Dev playtesting panel, auto-tap upgrades, SVG forecast timeline
- **Dev playtesting panel** (`src/ui/panels/dev-panel.ts`): added a new "🔬 Playtesting Tools" section in Settings (visible only when Developer Mode is on):
  - RPG wave-jump buttons for waves 2, 5, 8, 12, 15, 18, 22, 25, 26.
  - Aliven spawn controls: per-variant spawn buttons, spawn-cap-count (8 groups) bulk button, clear-all button, live active group count display.
  - Forge state snapshot: heat tap count, crunch active flag, sacrifice progress per tier.
  - Loom state table: level, efficiency level, conversion progress, and special-purchased status for each unlocked loom.
  - Aliven balance validation table: hpBase, atkBase, xpMult, particleCount, specialKind, cooldown range for every variant; warns on bad constants (negative HP/ATK/XP, specialCdMin > specialCdMax).
- **Dev hooks wiring**: `RpgRender` gained `devSpawnAliven(variantId)`, `devClearAliven()`, `getAlivenGroupCount()`; `SettingsPanel` gained `registerDevHooks(hooks)`; game-app.ts wires hooks immediately after rpgRender is created.
- **Auto-tap upgrade** (`upgrade-catalog.ts`): added `AUTO_TAP_UPGRADE` (`id: 'auto_tap_speed'`, `tierId: 'sand'`, `baseCost: 50`, `costScaleFactor: 3`, `maxLevel: 13`). Level 1 unlocks auto-tap at 5 000 ms; each subsequent level reduces the interval by 400 ms down to the 200 ms hard floor. Compatible with existing saves (no prior catalog entry, so autoTapLevel was always 0). Balance Forecast picks it up automatically via `ALL_UPGRADES`.
- **Balance Forecast — SVG strategy timeline**: added `renderStrategyTimeline` function and a "📈 Strategy Timeline (Approximate)" section below the Strategy Comparison table. Renders each milestone as a dot on a shared time axis, one color per strategy. Tooltips show exact time. No extra dependencies.

---

## Current Remaining Work

### Needs manual playtesting before claiming done
- Balance values: sacrifice threshold (2,000), loom conversion base cost (50), efficiency scaling (3ˣ), 10% passive non-sand production rate. Needs real playtesting.
- **Auto-tap upgrade feel**: first level at 50 sand motes, scaling by 3× per level — does the pacing feel right? Is 13 levels the right depth?
- **Forge 3-tap heat sequence**: does the heat UI row feel responsive? Is 3 taps the right number?
- **Forge capture and sacrifice flash timing**: does the 600ms shockwave feel satisfying?
- **Loom capture audio cooldown**: does 400ms cooldown feel right at various particle densities?
- **Loom efficiency upgrade UX**: verify the button deducts the correct tier's motes and the UI reflects it correctly.
- **Early game conversion pacing**: with a fresh save, does the sand→quartz loom feel achievable?
- **Non-sand 10% passive production feel**: does non-sand progression feel too slow without active captures?
- **Aliven group readability with new visuals**: healer beam, pulser ring, splitter burst — are they legible and not cluttered?
- **Aliven early wave pacing**: play waves 2–25 and verify each variant introduction feels readable and not overwhelming.
- **Aliven performance**: verify frame rate stays stable when 8 groups (the cap) are alive simultaneously on a mid-tier device. Use the dev panel "Spawn 8" button to test.
- **Aliven indicator markers**: verify tier-colored markers appear for Aliven group centroids (requires playing to wave 2+).
- **Aliven balance values**: `hpBase`, `atkBase`, `xpMult`, `specialCdMin/Max` values are starting points — needs real playtesting. Use the dev panel's Aliven Balance Table for reference.

### Balance Forecast — still deferred
- **RPG milestone simulation**: the engine cannot simulate RPG combat loop (wave/XP progression). A stub DPS model needs: player base DPS from playerStats, enemy HP formula per wave tier, XP per kill constant, and how wave-boost multiplier grows. Once those numbers stabilise, add a labeled "RPG estimate" section to balance-forecast-engine.ts.
- **Timeline chart enhancements**: the SVG timeline renders dots but has no click-through or zoom. If axis labelling is hard to read at high milestone counts, consider collapsing rows to category headers.

### Telemetry (not yet implemented)
Session-counters for forge crunches, mass sacrificed by tier, loom captures by tier, Aliven spawns/kills by variant were noted as useful for balancing (Priority 2 in the original spec) but are not yet tracked. The dev panel currently shows current state, not session totals. Tracking these requires incrementing counters at call sites (`startEquationForgeCrunch`, `applyLoomCapture`, `removeDeadEnemiesImpl`). Consider adding them when balance questions become concrete enough to need data.

---

## Manual Playtesting Checklist

Use this when doing a manual playtesting session. Check off what you tested.

### Dev Panel
- [ ] "🔬 Playtesting Tools" section appears in Settings only when Developer Mode is on
- [ ] Wave-jump buttons (W2 … W26) teleport the RPG to the correct wave
- [ ] Aliven spawn buttons add the correct variant; count display updates
- [ ] Spawn-8 button adds up to 8 groups (capped); cap does not overflow
- [ ] Clear Aliven button removes all active groups
- [ ] Forge state shows correct heat tap count and crunch active flag
- [ ] Loom table shows correct level and conversion progress per tier
- [ ] Aliven balance table shows all 7 variants with no unexpected warnings

### Forge
- [ ] Forge 3-tap heat sequence: tapping three times triggers crunch (particles captured, sacrifice flash shown)
- [ ] Forge tap on mobile: is the touch hit area large enough?
- [ ] Forge sacrifice flash: 600ms shockwave ring visible and feels satisfying
- [ ] Forge heat UI row (equation panel): shows ● dots and count, disappears after crunch

### Looms
- [ ] Loom capture: particles sucked into loom, progress bar increments toward output mote
- [ ] Loom audio cooldown: a sound plays when particles are captured; not overwhelming
- [ ] Loom efficiency upgrade: button shows correct tier mote cost; pressing deducts and increments level
- [ ] Loom conversion threshold drops with efficiency upgrades
- [ ] Non-sand passive production: Quartz+ looms trickle motes slowly even without captures

### Auto-Tap Upgrade
- [ ] "Auto-Tap Speed" upgrade appears in the upgrades panel when sand motes ≥ 50
- [ ] Buying level 1 enables auto-tap at 5 000 ms interval (visible from equation timer)
- [ ] Each subsequent level reduces interval by 400 ms
- [ ] At level 13, auto-tap interval is at the 200 ms hard floor and the upgrade is maxed

### Aliven Enemies
- [ ] Wave 2 introduction: a `spark_cluster` group appears after the laser/quartz enemies — player can learn the swarm pattern
- [ ] Wave 5 introduction: a `quartz_ghost` group appears — ghost invulnerability is readable
- [ ] Wave 8 introduction: a `shard_bloom` group appears — dasher aggression is distinct from earlier variants
- [ ] Wave 12 introduction: a `pulse_swarm` group appears — AoE shockwave ring is visible and communicates range
- [ ] Wave 15 introduction: an `ember_ring` group appears — trail patterns are visible
- [ ] Wave 18 introduction: a `void_splinters` group appears — splitter burst visual fires on death
- [ ] Wave 22 introduction: a `healer_nodes` group appears — healer beam draws attention to the healer particle
- [ ] Overlap separation: alive particles within a group stay visually separated (not piled up)
- [ ] Pulser ring visual: a ring expands outward when a pulser fires its shockwave
- [ ] Splitter burst: a brief flash ring appears at the particle position when a splitter dies and splits
- [ ] Healer beam: a faint dashed line connects healer to the particle it just healed
- [ ] Group cap: when 8 groups are alive, no new groups spawn (wave 26+ procedural)
- [ ] Performance: frame rate stable with 8 Aliven groups alive simultaneously on a mid-tier device

### General
- [ ] Save/load: existing save (v23+) loads without errors or lost progress
- [ ] Desktop mouse: forge tap, loom interaction, equation tap all work with mouse
- [ ] Mobile touch: same flows work on a real phone (portrait and landscape)
- [ ] Tab switching: switching between Equation / Resources / Settings preserves all UI state
- [ ] Settings persistence: dev mode, visual options, sound volume all persist across reload

---

## Balance Forecast Panel Reference

Accessible only in dev mode (Settings → Developer Mode ON).

| File | Purpose |
|---|---|
| `balance-forecast-types.ts` | Shared types, `formatDuration`, warning thresholds |
| `balance-forecast-engine.ts` | Core analysis/simulation engine |
| `balance-forecast-panel.ts` | DOM panel rendering (includes SVG timeline) |
| `balance-forecast-sim.ts` | Strategy simulation runner |
| `balance-forecast-state.ts` | SimState, `createFreshSimState`, `simStateFromGame` |
| `balance-forecast-purchases.ts` | Available-purchase enumeration |
| `balance-forecast-strategies.ts` | Strategy function definitions |

**"Simulate from current state" toggle**: when checked, the Strategy Comparison table starts from your current resources/unlocks rather than a fresh game. Useful for planning which strategy would be most efficient from your current position.

**Cost-growth warnings**: the pacing warnings section now includes flags when adjacent loom upgrade costs jump by more than 25× (configurable via `BALANCE_WARNING_THRESHOLDS.suspiciousCostGrowthMultiplier`).

**SVG strategy timeline**: a simple dot-chart below the Strategy Comparison table showing when each milestone is reached per strategy. Hover a dot to see the exact time. No zoom or interactivity beyond tooltips.
