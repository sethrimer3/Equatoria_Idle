# Equatoria Idle — Technical Decisions

## Internal Render Resolution

**Decision**: Render the game canvas at 320px internal width, with height calculated from container aspect ratio.

**Rationale**: 320px provides a good balance between the retro-pixel aesthetic and readability of mathematical expressions. CSS `image-rendering: pixelated` handles the upscaling cleanly. This keeps particle counts and drawing operations low on mobile.

## Math Notation Rendering

**Decision**: Use structured `EquationTermView` objects rendered directly on canvas via `fillText`.

**Rationale**: For the current complexity level (additive terms with numbers), canvas text rendering is sufficient and fast. The view model is structured as typed objects rather than raw strings, making it straightforward to evolve toward an expression tree model (power notation, functions, nested expressions) as complexity grows.

**Future**: When expressions become deeply nested, consider migrating to a proper expression tree with layout algorithms (like TeX-style box model), or integrate a lightweight math rendering library.

## Big Number Strategy

**Decision**: Use native JavaScript `number` type for now, with `formatNumber()` helper for display.

**Rationale**: Early-game values stay well within safe integer range. The formatting utility supports K/M/B/T suffixes. When late-game scaling requires it, introduce a big-number library or logarithmic helper layer. The authoritative state uses `number` everywhere, making it a clean swap point.

## Particle Authority Model

**Decision**: Particles are purely visual — they do not represent authoritative economic state.

**Rationale**: Motes are added to `ResourceState` immediately on tap. Particles are cosmetic feedback. This avoids coupling visual performance to economic correctness, simplifies save/load (no need to persist particles), and allows particle count caps without affecting gameplay.

## Save Format Strategy

**Decision**: JSON in `localStorage` with a `version` field. Current version: **7**. Versions 1–7 are accepted; older saves apply defaults for missing fields.

**Rationale**: Simple and sufficient for early development. The version field enables future migration logic. The save structure mirrors game state closely for easy serialization.

**Mote persistence (v7+)**: `resources.moteSizeCounts` stores per-tier mote counts encoded in base-100 (MERGE_THRESHOLD). The key is `tierId`; the value is `{ sizeIndex: count }`. For example, 350 sand motes is stored as `{ "0": 50, "1": 3 }`. On load the total is reconstructed as `sum(count × 100^sizeIndex)`. This allows idle rewards to be applied at size-0 with cascade merging before re-encoding to the compacted form. Saves from v1–6 used a flat `moteTotals: Record<string, number>` which is still decoded correctly.

## Canvas / UI Layering

**Decision**: Single low-resolution canvas for game visuals, separate DOM layer for UI panels and tab bar.

**Rationale**: The canvas handles the pixel-art aesthetic (equation, particles, background). DOM handles readable text UI (upgrade buttons, resource lists, settings). This separation keeps each layer optimized for its purpose.

## Forge System

**Decision**: Forge crunch state lives in `GameState` (sim layer), with physics and rendering separated into `sim/forge/` and `render/forge/`.

**Rationale**: The forge crunch timer and progress are authoritative game state and must be serializable. Physics logic (`checkForgeCrunch`, `updateForgeCrunch`) is pure and takes the state as a parameter. Rendering reads crunch state but never mutates it directly.

**Forge crunch flow**: Eligible particles (medium+, with valid output tier) near the forge center start a `FORGE_VALID_WAIT_TIME_MS` countdown. When it expires, a `FORGE_CRUNCH_DURATION_MS` animation plays, consuming the particles and producing next-tier outputs. The forge spins up progressively as the timer counts down and spins down after completion.

## Particle Size Tier System

**Decision**: Four particle size tiers (small=0, medium=1, large=2, extra-large=3), with per-size modifiers for velocity, force, and visual scale.

**Rationale**: Merging 100 small particles produces 1 medium, providing a natural compression mechanic. Medium/large/extra-large particles are attracted to the forge for crunch. The `SizeIndex` type union (0|1|2|3) provides type-safe size arithmetic.

## Generator Ring Layout

**Decision**: Generators are arranged in a ring centered on the equation, with radius proportional to `min(canvasWidth, canvasHeight) * 0.35`. Angles are evenly distributed.

**Rationale**: Ring layout naturally accommodates 1–9 tiers without overlap. The radius fraction was chosen to keep generators visible without crowding the equation display. Positions are recomputed on resize and tier unlock.

## Particle Drag Interaction

**Decision**: Pointer events on the canvas can grab nearby particles. Dragged particles follow the pointer; releasing with velocity imparts momentum.

**Rationale**: Gives players a tactile interaction with the simulation that doesn't affect economic state. The interaction radius scales with canvas size for consistent mobile feel. Stationary releases slow particles to minimum velocity to avoid leaving dead particles.

## Particle Physics Model

**Decision**: Frame-rate-normalized physics using `deltaRatio = deltaMs / (1000/60)`. All forces and velocities are expressed in units-per-frame at 60fps and scaled by `clampedDelta`.

**Rationale**: Keeps physics intuitive to tune (constants feel like "per frame at 60fps") while remaining stable at lower frame rates. Delta is clamped to [0.01, 3] to prevent tunneling and wild behaviour after tab switches.

## Particle Life Interaction System (replaced Euler Fluid Dynamics)

**Decision**: Replace the Euler fluid-dynamics inter-particle force model with a Particle Life pairwise interaction system governed by a 13×13 asymmetric interaction matrix.

**Key design choices**:
- **13×13 interaction matrix**: Entry `matrix[a][b]` determines how type `a` affects type `b`. Positive = attraction, negative = repulsion. Asymmetry enables chasing, orbiting, and layered-cluster emergence.
- **1×1 inert rule**: Any mote with size 1×1 (sizeIndex 0) is fully inert — it applies no forces, receives no forces, and is skipped during neighbour queries. This saves computation and creates decorative drift particles.
- **Size-force bias**: When `enableSizeForceBias` is true, forces are scaled by `sqrt(sizeA) * sqrt(sizeB)`. Square-root scaling was chosen over linear (too aggressive) or squared (unstable). Toggle defaults to true.
- **Two force zones**: Protected radius (always repulsion, prevents collapse) and matrix-controlled region (cosine taper to zero at outer radius). No inverse-square forces — all bounded.
- **Toroidal wraparound**: Positions wrap at canvas edges; distance calculations use shortest wrapped distance.
- **Spatial hash grid**: O(n·k) complexity with cell size = interaction radius. Reusable grid/cell arrays to avoid per-frame allocation.
- **Velocity damping**: 0.96 per frame at 60fps (adjusts for variable timestep). Max velocity clamped at 2.5 px/frame.

**Rationale**: Particle Life produces emergent behaviour (swarms, streams, orbiting structures, buffer shells) that is visually richer than the one-directional Euler repulsion model. The asymmetric matrix allows 13 types to exhibit meaningfully different relationships. The system remains performant through spatial partitioning and the inert-mote optimization.

**Tuning**: Modify `src/data/particles/interaction-matrix.ts` for type relationships. Modify `src/data/particles/particle-life-config.ts` for radii, strengths, and damping. The matrix is serializable for future save/randomization support.

## Cost Scaling Formula

**Decision**: `cost = baseCost × scaleFactor^level` with per-upgrade base costs and scale factors.

**Rationale**: Standard idle game exponential scaling. Each upgrade definition specifies its own base cost and scale factor, allowing fine-grained balance tuning without code changes.

## Equation Progression Model

**Decision**: Use a structured slot-and-wrapper equation model where each gemstone tier either modifies a specific slot value or wraps the entire expression in a new mathematical layer. The equation is a single coherent nested mathematical object, NOT a flat chain of appended fragments.

**Tier roles**:
- Sand: foundation (pre-equation, forge unlock)
- Quartz: time argument modifier f(t) → f(2t) → f(3t)
- Ruby: base value slot (first additive number)
- Sunstone: additive slot (second additive number: base + additive)
- Citrine: multiplier slot wrapping addition: (base + additive) × m
- Emerald: exponent slot wrapping multiplication: ((base + additive) × m)^p
- Sapphire: summation wrapper Σ
- Iolite: product wrapper Π
- Amethyst: factorial/gamma wrapper Γ(…)!
- Diamond: integration wrapper ∫
- Nullstone: recursion/limit wrapper lim

**Visual progression**: The equation evolves from inside out:
- `f(t) = …` (just Quartz)
- `f(t) = 1` (Ruby adds base)
- `f(t) = 1 + 1` (Sunstone adds additive)
- `f(t) = (1 + 1) × 1` (Citrine wraps with multiplication)
- `f(t) = ((1 + 1) × 1)^1` (Emerald wraps with exponentiation)
- Higher tiers wrap further

**Rationale**: The structured slot-and-wrapper model produces a tight, elegant nested equation that reads as one coherent mathematical expression. Each tier has clear ownership of exactly one part of the equation. The data-driven `EquationTierRole` in `data/equation/equation-tier-roles.ts` defines each tier's `role`, `interaction` (slot/wrapper/argument/foundation), `symbol`, `baseValue`, and `valuePerLevel`. HTML rendering uses `buildStructuredEquationHtml()` which builds from innermost to outermost. This replaces the previous flat-append model where each tier was concatenated with `+` signs.

## Save Format Version 4

**Decision**: Bump save version to 4 to reflect the equation architecture redesign. Accept versions 1-3 with graceful fallback.

**Rationale**: The equation state structure (segments with levels and unlock flags) hasn't changed at the persistence level — only the interpretation of tier roles has changed. Old saves can load correctly because segment data maps to the same tier IDs.

## Loom System

**Decision**: Introduce passive production Looms as a parallel progression system alongside the equation. Each tier has its own Loom that generates motes per second. Sand Loom starts unlocked; other Looms unlock when their tier unlocks.

**Rationale**: Provides continuous resource income even when the player isn't tapping. Creates a two-axis progression (passive Looms + active equation) that keeps both idle and active play viable. Loom definitions are data-driven in `data/looms/loom-definitions.ts` for easy balance tuning.

## Equation Forge Gate

**Decision**: The equation is not available at game start. The player must accumulate 50 Sand (via the Sand Loom) to unlock the Equation Forge. Only then does the equation appear and become tappable.

**Rationale**: Creates a meaningful early-game progression moment. The player starts by understanding passive Loom production, then "forges" the equation into existence — reinforcing the theme that math is built from raw materials. The 50 Sand cost is low enough to reach quickly but high enough to feel like a milestone.

## Separate Looms and Equation Tabs

**Decision**: Split passive Loom upgrades and equation-specific upgrades into separate tabs (Looms tab and Equation tab) rather than combining them into one screen.

**Rationale**: Reduces UI clutter and makes the two progression systems clearly distinguishable. The Looms tab focuses on passive production rates, while the Equation tab focuses on the mathematical artifact. This mirrors the two-pillar design of the game.

## Save Format Version 2 (superseded by v4)

**Decision**: Originally bumped save version to 2 to include Loom state and `isForgeUnlocked`. Now at v4 after equation redesign.

## Dual Background System

**Decision**: Keep both background effects (Vermiculate and Substrate) simultaneously instantiated. A `backgroundStyle` setting (`'vermiculate' | 'substrate' | 'none'`) selects which one is drawn in the game loop. The inactive effect is simply skipped, not destroyed.

**Rationale**: Both effects were ported from Thero Idle TD (Vermiculate from Chapter 1, Substrate from Chapter 6 / Shin Spire). Keeping both alive avoids a cold-start rebuild cost when switching back. A player-facing **Background Style** dropdown in the Settings panel exposes all three options. `'vermiculate'` is the default to preserve existing player experience. The setting is persisted in `localStorage` via `saveSettings`.

## Auto-Tap System

**Decision**: Auto-tap is a purchasable upgrade with decreasing interval per level, hard-floored at 200ms.

**Rationale**: Gives players a meaningful upgrade path. The hard floor prevents degenerate rapid tapping. The auto-tap triggers the same `tapEquation()` function as manual taps, keeping the code path unified.


## Font Replacement: Poiret One

**Decision**: Replaced Pixelify Sans with Poiret One as the primary UI font (`--font-primary`), used in all canvas labels (score, mote count, tap hint) and as the body font for DOM panels.

**Rationale**: Per project specification. Poiret One has a more elegant, art-deco character while still being readable at small sizes.

## BJ Cree Font for Secret Achievements

**Decision**: Added BJ Cree as a secondary font used exclusively for the name and description of locked secret achievements. Letters are scrambled ASCII characters rendered in BJ Cree (which makes them look like cryptic symbols) and replaced every 600ms via `setInterval`.

**Rationale**: Creates a mysterious, unreadable appearance for secret achievements before they are unlocked. The scramble changes letter identity but not count, preserving spatial layout while maximising visual crypticism.

## Click-to-Claim Achievement System (Save Version 5)

**Decision**: Achievements are now earned (unlock condition met) and claimed (player taps the glowing card) separately. Bonuses only apply once claimed. A `claimedIds` set was added to `AchievementState`. Save format bumped to v5; older saves auto-claim all previously-unlocked non-secret achievements on first load.

**Rationale**: Adds a satisfying tactile moment to achievement rewards. The golden rotating sheen on unclaimed cards draws attention and communicates "something to do here". Old saves are migrated gracefully so no progress is lost.

## Audio System

**Decision**: Use the Web Audio API exclusively for all audio playback (music, ambiance, SFX). All audio is routed through `GainNode` chains so volumes can be adjusted in real-time without restarting sources.

**Rationale**: The Web Audio API allows sample-accurate scheduling (crossfades, fade-ins), gain automation (ramps), and efficient polyphony without DOM overhead. This is necessary for the 8-second music crossfade, the forge charging fade-in, and the −10 dB ambiance offset.

**Music crossfade approach**: Two alternating `GainNode` "slots" share a master music gain. When a new track starts, its slot fades in (0→1 over 8 s) while the previous slot fades out (1→0 over 8 s). A `setTimeout` scheduled `(duration − 8 s)` after each track starts triggers the next crossfade. The random play order is determined once via Fisher-Yakes shuffle at startup, then cycles forever.

**Ambiance**: A single looping `AudioBufferSourceNode` runs continuously once started. The `AmbiancePlayer` fades the gain in/out (over 1 s) when the player enters/leaves the `equation` tab. Target gain is `sfxVolume × 10^(−10/20) ≈ sfxVolume × 0.316` (−10 dB offset).

**Forge charging**: A randomly selected charging hum from `equationForge/chargingUp/` is started with loop=true at gain 0, then ramped to 1 over `FORGE_SPIN_UP_DURATION_MS` (4 s). When the crunch animation begins, the gain is ramped to 0 over 200 ms and the source is stopped. If the spin-up is aborted, the gain is ramped to 0 over 500 ms.

**Forge audio transition detection**: `ParticleSystem.update()` now returns `ParticleAudioEvents` with `forgeCrunchStarted`, `forgeSpinUpBegan`, and `forgeSpinUpCancelled`. These are detected by tracking `_wasSpinningUp` and `_wasCrunchActive` across frames. The spin-up threshold is the named constant `FORGE_SPIN_UP_THRESHOLD_MS`.

**No-op fallback**: If `AudioContext` (and `webkitAudioContext`) are not available, `createAudioSystem()` returns a no-op implementation so the game runs silently without errors.

**AudioContext resume**: `AudioContext` starts suspended due to browser autoplay policy. `resumeContext()` is called from the `dispatch` wrapper in `game-app.ts` on every user action, and separately from the canvas `pointerdown` handler (which handles drag interactions that don't go through `dispatch`).

**Path encoding**: Audio file names that contain spaces (e.g. `pluck A1.m4a`) or hash characters (e.g. `tower_shot_kalimba_C#5.mp3`) are encoded with `encodeURIComponent` per path segment in `audio-paths.ts` so `fetch()` requests succeed.


**Decision**: Diamond particles get a double-layer prismatic HSL overlay that cycles hues over time. The diamond generator gets a `screen`-mode radial gradient overlay plus cycling shadow glow. Nullstone generator has a dark purple (`#6a0dad`) radial glow and the influence-range circle is replaced with animated purple swirl arcs (`drawNullstoneRangeSwirl`).

**Rationale**: Visual distinctiveness for the two rarest tiers. Diamond is light-refracting so prismatic rainbow is appropriate. Nullstone is void/darkness so a moody deep purple glow fits. Effects are contained in the render layer and are not authoritative simulation state.

## Offline Progress Model

**Decision**: When the player returns after ≥ 1 minute away, show an animated overlay listing Equivalence gained and per-tier Mote gains. Only Loom passive production counts toward offline rewards (no auto-tap offline). Offline time is measured by a side-channel `localStorage` key (`equatoria_last_active`) written on app start and on `visibilitychange` (hidden).

**How it works**:
1. On app start, `readLastActiveTimestamp()` reads the stored timestamp, then `writeLastActiveTimestamp()` immediately updates it to now.
2. If `elapsed > 60 000 ms` and at least one tier has gains, `calculateIdleRewards()` computes a pure `IdleRewardSummary` (no state mutation).
3. `applyIdleRewards()` adds the motes to live `GameState`.
4. `idleOverlay.show(summary)` animates the results.
5. On `visibilitychange → hidden`, the timestamp is refreshed so partial idle sessions accumulate correctly.

**Scope**: Only Loom production is counted. Auto-tap does not fire offline. Achievement bonuses (`loomMultiplierBonus`) are applied.

**Threshold**: 1 minute minimum to avoid trivial rewards on quick tab switches.

**13-tier breakdown**: Each of the 13 tiers has its own row in the overlay (hidden with `hidden` + `aria-hidden="true"` if that tier's Loom is not yet unlocked).

## RPG Wave System

**Decision**: Enemy waves are defined as `WaveDefinition` data objects in `src/data/rpg/wave-definitions.ts`.  Waves 1–10 are hand-authored; waves beyond 10 are generated procedurally.  New enemy types register a new `enemyTypeId` in the data file and add a `spawnEnemyById` case in `rpg-render.ts` — no core logic changes required.

**Wave completion detection**: After the spawn queue empties and all enemies are dead, the wave is marked complete and an `INTER_WAVE_DELAY_MS` (2.5 s) pause begins before the next wave auto-starts.

**Persistence**: `highestWaveReached` lives in `RpgSimState` (part of `GameState`) and is persisted via save format v10.  It is updated immediately when a new highest wave begins.

## Wave Progression Loom Boost

**Decision**: `boostPercent = highestWaveReached ^ 1.2`.  Applied as a multiplicative bonus to loom production in `simTick`:  `loomBoostMultiplier = 1 + boostPercent / 100`.

**Rationale**: Superlinear exponent (1.2) ensures the boost accelerates meaningfully at high waves without being linear, rewarding player progression non-trivially.  Uses `highestWaveReached` (not current wave) so the bonus never regresses after a death.

**Display**: The BOOST stat in the RPG stats panel shows the current bonus as "+N.N%".

## Death / Restart Loop

**Decision**: Death triggers a phased visual transition managed by `rpgPhase: RpgPhase` (`alive | dying | restarting`).  Dying phase lasts `DEATH_ANIM_DURATION_MS` (1.8 s) plus `DEATH_HOLD_DURATION_MS` (0.4 s); restart fade-in takes `RESTART_FADE_IN_MS` (0.7 s).

**Visual effects**: On death, `DEATH_BURST_COUNT` radial gold/white particles are emitted; the player sprite fades from alpha 1 → 0 while the screen darkens (0 → 85 % black).  On restart, the reset state fades in from pure black.  Enemy actions and player input are suppressed during the dying and restarting phases.

**No wave counter reset on death**: Only the within-run combat state resets.  `highestWaveReached` in `RpgSimState` is never decremented.

## Movement Glow Smoothing

**Decision**: A `glowMovementIntensity` float (0–1) LERP-ramps toward 1 when `|velocity| > TRAIL_SPEED_THRESHOLD` at rate `GLOW_MOVE_RAMP_UP` per ms, and toward 0 at rate `GLOW_MOVE_RAMP_DOWN` per ms when the player stops.  All trail/halo alpha values are multiplied by this intensity.

**Rationale**: Eliminates the abrupt brightness jump that occurred when movement started.  The asymmetric ramp rates (ramp-up slightly faster than ramp-down) give a snappy start and a soft linger after stopping.

## Weapon Store

**Decision**: The store is a full-screen overlay (`#weapon-store-panel`) shown when the player taps the "🛒 Shop" button in the RPG stats panel.  Weapon data is defined in `src/data/rpg/weapon-definitions.ts`; new weapons are added there without touching store logic.

**Currency**: Weapons are purchased with refined motes of the tier specified by `WeaponDefinition.costTierId`.  `spendMotes()` deducts the cost from `GameState.resources` on purchase.

**Equipping**: Purchased weapons can be equipped via the `equip_weapon` action.  `rpg-render.ts` reads `rpgSimState.equippedWeaponId` and calls `applyEquipmentStats()` to add weapon ATK/DEF bonuses to the player stats.

**Save format v10**: `rpg.purchasedWeaponIds[]` and `rpg.equippedWeaponId` are persisted.  Older saves default to no purchases.

## Diamond Sword — Prismatic Shard Blade System (v2)

**Decision**: The Diamond Sword (`swordCombo` effect) was redesigned from its earlier single-swipe model into an alternating 180° arc system with a 4-hit spin combo.

**Idle position**: The sword rests to the RIGHT of the player (angle 0). The hinge spring pulls toward `SWORD_IDLE_ANGLE = 0` rather than the player's aim direction.

**Pastel colors**: `SWORD_PRISMATIC_COLORS` now uses 10 very light, pastel shades (light blue base with rainbow sheen) instead of saturated rainbow colors.

**Alternating arc swings**: Each swing covers a 180° arc (π radians) centered on the nearest enemy. Swings alternate direction each time:
- R→L (`swingIsRightToLeft=true`): sword drives from `arcStart` (enemyAngle − π/2) to `arcEnd` (enemyAngle + π/2).
- L→R (`swingIsRightToLeft=false`): sword drives from `arcEnd` back to `arcStart`.
Hit detection (`swordHitInArc`) always checks the same `arcStart→arcEnd` window, so the enemy is always hit.

**Faster swings**: `SWORD_SWING_MS` reduced from 160 ms to 60 ms. `SWORD_DEFAULT_COOLDOWN_MS` reduced from 900 ms to 220 ms.

**4-hit spin combo**: After 4 consecutive swings all hitting the same entity, if the 4th swing is a L→R motion, the sword enters `'spin_combo'` phase:
- Spins 3 × 360° (`SWORD_COMBO_SPIN_TURNS`) in 450 ms (`SWORD_COMBO_SPIN_MS`).
- Applies 1 damage tick per completed rotation (normal damage) across a full 360° arc at 2× range (`SWORD_COMBO_RANGE_MULT`).
- Ends with the sword snapped back to `SWORD_IDLE_ANGLE` (right), ready for R→L again.
- Visually: shards grow 1.5× and a glowing prismatic ring sweeps around the player.

**Boss engagement**: `damageBossEnemy` now uses a `bossHitsInRound` counter. The boss only increments danmaku difficulty and teleports the player back to the safe zone after every 4th hit (`SWORD_COMBO_THRESHOLD`), giving the player exactly enough hits to complete the spin combo before being teleported.

**Inertia physics**: Unchanged — spring/damping hinge + shard chain-lag from handle to tip.

**Effects on hit**: Same as before (SwipeEffect, PrismaticBeamEffect, fluid forces).

**Dev wave jump**: Dev mode now exposes a "Jump to Wave" control in the RPG Menu tab, dispatching `dev_jump_wave` to `RpgRender.devJumpToWave(wave)`. Waves 1 and 10, 20, 30, … up to 1000 are offered.


## Particle Glow Blending

**Decision**: Replace per-batch `shadowBlur` glow with cluster-based radial-gradient glows drawn using `screen` compositing (`src/render/particles/particle-glow.ts`).

**Problem**: The previous approach used `ctx.shadowBlur` on batched `fillRect` calls.  Shadows are drawn additively via `source-over`, so when two or more particles of different colours overlap their glows mixed towards grey/white rather than producing a pleasing colour blend.

**Approach**:
- A spatial grid (cell size 24 px) groups particles into clusters per colour per cell.  Same-colour particles in the same cell share one radial-gradient glow centred at their centroid, eliminating stacked halos.
- All glow draws use `globalCompositeOperation = 'screen'`.  Screen blending computes `result = 1 − (1−a)(1−b)`, so red + blue → magenta rather than grey.  Overlapping glows of different colours create visible gradient blends between them.
- When a cell contains N ≥ 2 distinct colours (co-located particles), each colour's glow centre is nudged `COLOCATION_OFFSET_FRACTION × glowRadius` (0.35) in its assigned angular direction.  The N directions are equidistant (360° / N apart) with a deterministic per-cell base angle derived from a cheap integer hash of the cell coordinates.  This makes each colour fan into its own visible sector while blending into neighbours at sector edges.

**Performance**: Inner Maps and `ColorAccum` accumulators are pooled across frames; the sorted-entry scratch buffer is fixed-size (16 slots, ≥ TIER_COUNT); sorting uses in-place insertion sort.  Worst-case draw calls = unique (colour × cell) combinations, far fewer than one `createRadialGradient` per particle.



**Context**: `rpg-render.ts` reached ~6,465 lines after previous extract phases (constants → `rpg-constants.ts`, types → `rpg-types.ts`, factories → `rpg-factories.ts`, draw functions → `rpg-entity-draw.ts`). The next largest block was the per-frame enemy update functions (~890 lines) for 13 non-boss enemy types.

**Decision**: Extract all enemy update functions into `rpg-enemy-updates.ts` (~1,048 lines) with an explicit `RpgEnemyCtx` interface as the shared-state boundary. `rpg-render.ts` reduced to ~5,666 lines.

**RpgEnemyCtx design**: The context object holds live references (`mote`, `dim`, `fluid`, `hitEffects`, `shotLines`) and two delegate callbacks (`dealDamageToPlayer`, `dealDamageToPlayerKnockback`). The `dim: { w, h }` box is a single shared mutable object updated on each `resize()` call, so enemy update functions always see current canvas bounds without requiring closures or getter functions.

**Function signatures**: Each update function takes its entity array(s) as explicit first parameters (`updateAmberEnemies(enemies, shards, ctx, deltaMs)`), making data flow visible at call sites and keeping the functions pure with respect to the closure.

**Knockback callback**: Amber shards are the only entity that applies velocity-based knockback to the player. A dedicated `dealDamageToPlayerKnockback(atk, normDirX, normDirY)` callback was added to `RpgEnemyCtx` to handle this without exposing `playerStats`, `playerIFramesMs`, or `spawnDamageNumber` to the external module.
