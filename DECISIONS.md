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

**Decision**: JSON in `localStorage` with a `version` field. On version mismatch, start fresh.

**Rationale**: Simple and sufficient for early development. The version field enables future migration logic. The save structure mirrors game state closely for easy serialization.

**Future**: Add migration functions when the save format changes.

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


## Cost Scaling Formula

**Decision**: `cost = baseCost × scaleFactor^level` with per-upgrade base costs and scale factors.

**Rationale**: Standard idle game exponential scaling. Each upgrade definition specifies its own base cost and scale factor, allowing fine-grained balance tuning without code changes.

## Equation Progression Model

**Decision**: Use a tier-based structured equation system where each gemstone tier adds a specific mathematical operator to the central equation f(t). The progression is: foundation (Sand) → passive time r·t (Quartz) → manual input x (Ruby) → addition (Sunstone) → multiplication (Citrine) → exponentiation (Emerald) → summation Σ (Sapphire) → product Π (Iolite) → factorial (Amethyst) → integration ∫ (Diamond) → recursion/self-reference (Nullstone).

**Rationale**: Each tier has a clear, data-driven role defined in `data/equation/equation-tier-roles.ts`. The equation builds gradually from simple to complex, giving the player a visual sense of mathematical progression. The structured approach (vs. string concatenation) makes it easy to:
- Render each tier's contribution in its gemstone color
- Compute equation output from the structured model
- Add new tiers or modify existing ones without rewiring rendering

## Loom System

**Decision**: Introduce passive production Looms as a parallel progression system alongside the equation. Each tier has its own Loom that generates motes per second. Sand Loom starts unlocked; other Looms unlock when their tier unlocks.

**Rationale**: Provides continuous resource income even when the player isn't tapping. Creates a two-axis progression (passive Looms + active equation) that keeps both idle and active play viable. Loom definitions are data-driven in `data/looms/loom-definitions.ts` for easy balance tuning.

## Equation Forge Gate

**Decision**: The equation is not available at game start. The player must accumulate 50 Sand (via the Sand Loom) to unlock the Equation Forge. Only then does the equation appear and become tappable.

**Rationale**: Creates a meaningful early-game progression moment. The player starts by understanding passive Loom production, then "forges" the equation into existence — reinforcing the theme that math is built from raw materials. The 50 Sand cost is low enough to reach quickly but high enough to feel like a milestone.

## Separate Looms and Equation Tabs

**Decision**: Split passive Loom upgrades and equation-specific upgrades into separate tabs (Looms tab and Equation tab) rather than combining them into one screen.

**Rationale**: Reduces UI clutter and makes the two progression systems clearly distinguishable. The Looms tab focuses on passive production rates, while the Equation tab focuses on the mathematical artifact. This mirrors the two-pillar design of the game.

## Save Format Version 2

**Decision**: Bump save version to 2 to include Loom state and `isForgeUnlocked` in saved data. Accept version 1 saves with graceful fallback (missing Loom data uses defaults).

**Rationale**: Backward compatibility prevents save loss during development. New state fields have sensible defaults, so v1 saves just start with Sand Loom at level 1 and forge locked.

## Dual Background System

**Decision**: Keep both background effects (Vermiculate and Substrate) simultaneously instantiated. A `backgroundStyle` setting (`'vermiculate' | 'substrate' | 'none'`) selects which one is drawn in the game loop. The inactive effect is simply skipped, not destroyed.

**Rationale**: Both effects were ported from Thero Idle TD (Vermiculate from Chapter 1, Substrate from Chapter 6 / Shin Spire). Keeping both alive avoids a cold-start rebuild cost when switching back. A player-facing **Background Style** dropdown in the Settings panel exposes all three options. `'vermiculate'` is the default to preserve existing player experience. The setting is persisted in `localStorage` via `saveSettings`.

## Auto-Tap System

**Decision**: Auto-tap is a purchasable upgrade with decreasing interval per level, hard-floored at 200ms.

**Rationale**: Gives players a meaningful upgrade path. The hard floor prevents degenerate rapid tapping. The auto-tap triggers the same `tapEquation()` function as manual taps, keeping the code path unified.

