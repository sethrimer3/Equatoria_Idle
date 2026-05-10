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
