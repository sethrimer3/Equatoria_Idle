# Next Steps — AlivenParticle Enemy System

The AlivenParticle enemy system (Build #4) is complete and builds without errors. These notes capture suggested follow-up work.

## Immediate follow-up
- **Hand-author waves 2–28 appearances** — currently the procedural generator adds every aliven variant starting from its `firstWave`. Consider adjusting hand-authored waves 2–25 to introduce variants one at a time with tighter framing (e.g. wave 2 has only spark_cluster, wave 5 adds shard_bloom, etc.).
- **Balance pass** — `hpBase`, `atkBase`, `xpMult`, and `specialCdMin/Max` values in `rpg-aliven-constants.ts` were chosen as starting points. A real balance pass after playtesting is needed.
- **Particle collision separation** — currently particles can overlap each other. A cheap separation repulsion loop would improve visual readability.

## Visual improvements
- **Pulser shockwave ring** — the pulser special fires invisibly today. Adding a brief ring animation at the pulse radius would communicate intent to the player.
- **Splitter particle spawn burst** — add a small flash or particle spray at the death/split position.
- **Healer beam visual** — a faint line from healer to healed target when healing activates would make the heal special more legible.
- **Group centroid glow** — drawing a faint ambient glow at the group centroid would help communicate group cohesion.

## Gameplay depth
- **Aliven bullet color variation** — spitter bullets currently use the particle color. Distinguishing them from the particle itself (e.g. slightly brighter) would make them easier to dodge.
- **Group-level health bar** — a thin group HP bar above the centroid (counting alive / total particles) would help players gauge kill progress.
- **Wave indicator integration** — add aliven variant icons to the enemy-indicators system so the player knows what's off-screen.
- **Lucky mote tier mapping** — currently uses the group's `tierId` directly. If new tier IDs are added that don't map to lucky mote drop tables, add a fallback.

## Code quality
- **Particle overlap separation** — add a lightweight O(n²) separation pass among alive particles within a group (capped at small group sizes).
- **AlivenUpdateCtx `playerIFramesMs`** — currently just reads the value; a setter would enable i-frames from spitter bullet hits and not just contact damage.
- **Test with >28 aliven groups alive simultaneously** — stress-test frame rate on mobile hardware; if needed, add a global cap on simultaneous aliven groups.

---

# Balance Forecast / Progression Analysis Panel (Build #11)

The Balance Forecast dev panel is implemented and accessible from the Settings tab when Developer Mode is enabled.

## Where it lives

| File | Purpose |
|---|---|
| `src/ui/panels/balance-forecast/balance-forecast-types.ts` | Shared types, `formatDuration`, warning thresholds |
| `src/ui/panels/balance-forecast/balance-forecast-engine.ts` | Core analysis/simulation engine |
| `src/ui/panels/balance-forecast/balance-forecast-panel.ts` | DOM panel rendering |
| `src/styles/panels.css` | `.bf-*` CSS classes appended at bottom |

## How to open

1. Open the game → Settings tab.
2. Toggle **Developer Mode** ON.
3. The **⚖ Balance Forecast** panel appears below the Particle Tweaks section.
4. Click **↺ Run Analysis** (runs automatically on first open).
5. Select different max simulation times with the dropdown; analysis re-runs automatically.

## What each section means

- **Next Meaningful Events** — top 8 reachable targets sorted by ETA from the current state.
- **Static ETA Analysis** — full table of every known target, grouped by status (available / reachable / blocked).
- **Fresh-Run Milestone Timeline** — starting from a new game, using Cheapest First strategy, when each major milestone is reached.
- **Strategy Comparison** — four strategies simulated in parallel, showing milestone times side-by-side.
- **Pacing Warnings** — automated balance issue flags (long gaps, clusters, extreme ETAs, etc.).

## Strategy approximations

All four strategies are approximations that work well for rough balance comparison but are not optimal solvers:

- **Wait Only** — pure baseline; no purchases ever.
- **Cheapest First** — always buys the cheapest currently affordable item. Good for casual play simulation.
- **Best Efficiency** — rates candidates by `productionGain / cost` with a bonus weight for tier unlocks and the forge. Production gain for equation upgrades is an approximation (0.01 abstract units).
- **Rush Next Tier** — prioritises the forge, then tier unlocks, then loom upgrades for the pay tier, then falls back to cheapest.

## Systems not yet fully covered by the forecast

- RPG-related achievements (wave_reached, weapon_purchased, boss_defeated, xp_reached) — these are not simulatable by the balance engine, since it doesn't run the RPG combat loop.
- Auto-tap unlock (progression `autoTapLevel`) — the engine upgrades loom/equation items but does not simulate auto-tap purchase upgrades yet (no such upgrade definition in the catalog currently).
- Achievement bonuses for claimed achievements — the simulation grants bonuses immediately on unlock (not on claim), which slightly overestimates bonuses compared to real play.

## Possible future improvements

- Add RPG milestone simulation (stub wave progression based on a simple DPS model).
- Add auto-tap upgrade purchases to the strategy candidates when those upgrade definitions exist.
- Add per-upgrade cost growth warnings (comparing adjacent loom upgrade costs).
- Add a "simulate from current state" mode for strategy comparison (rather than fresh-run only).
- Add a timeline chart (canvas or SVG) to visualise progression curves.
