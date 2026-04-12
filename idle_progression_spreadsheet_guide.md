# Idle Progression Spreadsheet Guide

This file captures the simulation formulas and constants needed to model pacing in a spreadsheet.

## Core progression gates

- Starting state:
  - Sand Loom starts unlocked at level 1.
  - Only Sand tier is unlocked initially.
  - Equation Forge starts locked.
- Equation Forge unlock cost: **50 Sand**.
- Tier unlock cost formula for next tier at index `i` (0-based):
  - `floor(50 * 10^i)`
- Tier unlock payment currency:
  - Unlocking tier `i` is paid using motes from tier `i-1`.

## Tier order

1. sand
2. quartz
3. ruby
4. sunstone
5. citrine
6. emerald
7. sapphire
8. iolite
9. amethyst
10. diamond
11. nullstone
12. fracteryl
13. eigenstein

## Loom production (passive)

For each tier:

- Production rate at level `L`:
  - If `L <= 0`, rate is `0`
  - Else `baseRate + (L - 1) * ratePerLevel`
- Upgrade cost to buy next Loom level from current `L`:
  - `floor(baseCost * costScaleFactor^L)`
- Tick production over elapsed milliseconds `dtMs`:
  - `produced = ratePerSec * dtMs / 1000`
  - Simulation tracks fractional accumulation continuously.
- Loom production receives multiplicative achievement bonus:
  - `effectiveRate = rawRate * loomMultiplierBonus`

Tier loom definition table:

| tier | baseRate | ratePerLevel | baseCost | costScaleFactor |
|---|---:|---:|---:|---:|
| sand | 1 | 1 | 5 | 1.25 |
| quartz | 0.8 | 0.8 | 25 | 1.3 |
| ruby | 0.6 | 0.6 | 100 | 1.35 |
| sunstone | 0.5 | 0.5 | 500 | 1.4 |
| citrine | 0.4 | 0.4 | 2500 | 1.45 |
| emerald | 0.3 | 0.3 | 12500 | 1.5 |
| sapphire | 0.25 | 0.25 | 60000 | 1.55 |
| iolite | 0.2 | 0.2 | 300000 | 1.6 |
| amethyst | 0.15 | 0.15 | 1500000 | 1.65 |
| diamond | 0.1 | 0.1 | 8000000 | 1.7 |
| nullstone | 0.05 | 0.05 | 50000000 | 1.8 |
| fracteryl | 0.03 | 0.03 | 250000000 | 1.9 |
| eigenstein | 0.02 | 0.02 | 1000000000 | 2 |

## Equation tap income (active + auto)

Taps only generate resources after Forge unlock.

For unlocked non-foundation tiers, per-tap gain is:

- Segment base: `segmentTapValue = BASE_TAP_VALUE + segmentLevel * UPGRADE_TAP_MULTIPLIER`
- Current constants:
  - `BASE_TAP_VALUE = 1`
  - `UPGRADE_TAP_MULTIPLIER = 1.0`
- Final per-tier tap gain:
  - `segmentTapValue * progression.globalMultiplier * achievements.tapMultiplierBonus`

Notes:

- Sand is foundation role and is skipped for tap gains.
- Each tier's equation-part upgrade spends that same tier's motes.

## Equation-part upgrade costs

For upgrade at level `L`:

- `floor(baseCost * 1.15^L)`

Per-tier base costs are generated as:

- `BASE_UPGRADE_COST * 5^i`
- with `BASE_UPGRADE_COST = 10`
- and `i` counting visible, non-sand tiers in order (quartz first).

So starting base costs are:

- quartz 10
- ruby 50
- sunstone 250
- citrine 1250
- emerald 6250
- sapphire 31250
- iolite 156250
- amethyst 781250
- diamond 3906250
- nullstone 19531250

## Auto-tap pacing

- `autoTapLevel <= 0` means disabled.
- Interval formula:
  - `max(5000 - (autoTapLevel - 1) * 400, 200)` ms
- Auto-taps call the same tap pipeline as manual taps (same gains formula).

## Equivalence score model

- Equivalence is product of all strictly positive per-tier mote totals.
- If no tier has positive motes, equivalence is `0`.

Spreadsheet note:

- Since costs spend down individual tiers, track each tier's wallet over time.
- Equivalence should be computed from current balances, not lifetime earned values.

## Achievement multiplier effects

- Unlock condition checks lifetime motes of a required tier.
- Bonuses apply only after claim.
- Claimed tap achievements multiply together into `tapMultiplierBonus`.
- Claimed loom achievements multiply together into `loomMultiplierBonus`.

Defined multipliers (all 1-lifetime-mote thresholds):

- Tap: 1.05 (sand), 1.10 (ruby), 1.15 (citrine), 1.25 (sapphire), 1.50 (amethyst), 2.0 (diamond secret)
- Loom: 1.05 (quartz), 1.10 (sunstone), 1.15 (emerald), 1.25 (iolite), 2.0 (nullstone secret)

## Offline/idle rewards

On app start, if away time `elapsedMs > 60,000`:

- Offline rewards are computed from Loom rates only.
- Auto-tap is **not** simulated offline.
- Formula per unlocked loom tier:
  - `offlineMotes = getLoomRate(tier, level) * loomMultiplierBonus * elapsedMs / 1000`
- Rewards are then added to live resources.

Important implementation note:

- A constant `MAX_OFFLINE_HOURS = 24` exists, but current bootstrap path does not clamp elapsed offline time before reward calculation.

## Equation output evaluator (display/scoring side model)

The equation evaluator computes a nested expression from unlocked tier role parameters:

- Parameter value for each role:
  - `baseValue + level * valuePerLevel`
- Core expression:
  - `((base + additive) * multiplier) ^ exponent`
- Wrapper transforms currently applied:
  - multiply by `sumCount`
  - multiply by `productCount`
  - factorial multiplier from `factorialBase` (capped at 20)
  - integral additive term: `integralFactor * min(elapsedSec, 3600) * 0.01`
  - recursion multiplier: `1 + recursionFactor * 0.1`
  - final quartz time scale multiplier
  - final global multiplier

Caveat for spreadsheet modeling:

- Fracteryl and Eigenstein have defined equation roles/data, but no corresponding switch cases in the current evaluator, so they do not currently alter evaluated output.
