# Boss Attack System — Implementation Notes

## Status: Complete (all 6 attack families implemented, build passing)

---

## What Was Completed

### New files created

| File | Purpose |
|---|---|
| `src/render/rpg/rpg-boss-attack-types.ts` | All type interfaces, TrailRing helper, mulberry32 PRNG, `BossAttackState` |
| `src/render/rpg/rpg-boss-attack-config.ts` | Data-driven `BossAttackProfileConfig` table for bosses 1–10 (3 phases each) |
| `src/render/rpg/rpg-boss-attack-update.ts` | Scheduler, update dispatch, pressure tracking, player collision + damage |
| `src/render/rpg/rpg-boss-attacks-draw.ts` | Neon rendering for all 6 families, uses existing `beginNeonGlowBatch/endNeonGlowBatch` |
| `src/render/rpg/attacks/rpg-attack-grav.ts` | Grav orbital bodies simulation (softened gravity, bounce, ring-buffer trails) |
| `src/render/rpg/attacks/rpg-attack-hex.ts` | Hex-lattice bolt simulation (flat-top grid, warning phase, segment trail) |
| `src/render/rpg/attacks/rpg-attack-mandala.ts` | Radial wave burst simulation (safe-gap omission, angular drift, trail) |
| `src/render/rpg/attacks/rpg-attack-vermiculate.ts` | Sinuous worm simulation (deterministic sin-noise steering, bounce) |
| `src/render/rpg/attacks/rpg-attack-missile.ts` | Homing missile + explosion ring state machine (flying→exploding→lingering→fading) |
| `src/render/rpg/attacks/rpg-attack-swarm.ts` | Mother + follower swarm (attraction, damping, deterministic noise) |

### Modified files

- `src/render/rpg/rpg-render.ts` — added import/state/context/update/draw/lowGraphics/doRestart wiring
- `file_index.md` — added entries for all 10 new files

---

## Boss Attack Assignments

| Boss ID | Name | Phase 0 | Phase 1 | Phase 2 |
|---|---|---|---|---|
| 1 | Quartz Sovereign | vermiculate (1 worm) | +hexTrail | vermiculate (2 worms) |
| 2 | Ruby King | hexTrail (1 bolt) | hexTrail (2 bolts) | +missileRing |
| 3 | Sunstone Herald | missileRing (1-2) | missileRing (3) | +vermiculate |
| 4 | Citrine Weaver | grav (2 bodies) | grav (3 bodies, moving wells) | +mandala |
| 5 | Iolite Colossus | mandala (8 spokes) | mandala (12 spokes) | mandala (16 spokes) |
| 6 | Amethyst Breaker | hexTrail + vermiculate | denser combo | +missileRing |
| 7 | Diamond Eternal | motherSwarm + missileRing | denser swarm | high-pressure combo |
| 8 | Nullstone Devourer | grav (4 bodies) + mandala | more bodies + spokes | max grav + mandala |
| 9 | Void Nexus | hexTrail + motherSwarm + missiles | faster/denser | full pressure |
| 10 | Equation Incarnate | all 6 families (lower pressure each) | increased pressure | max difficulty |

---

## Architecture Overview

### How attacks are spawned

1. Each frame `updateBossAttacks()` is called from `rpg-render.ts` (after the existing `updateBossEnemy`).
2. The **pressure-gated scheduler** checks:
   - `state.activePressure < profile.maxPressure`
   - `state.attacks.length < MAX_ACTIVE_ATTACKS`
   - Per-kind cooldown not active (`schedulerCooldowns` map)
   - `boss.isFiringPaused` is false
3. A random eligible attack kind is chosen (only this scheduling choice uses `Math.random()`).
4. The spawn function creates the instance with a deterministic mulberry32 PRNG seeded from `Date.now() ^ boss.bossId`.
5. The attack runs for `cfg.durationMs` ms then is removed.

### How attacks deal damage

`applyBossAttackCollision()` collects hazard circles from each active attack and tests them against the player position (simple `dx²+dy² < r²` for circles; capsule test for hex segments). One hit per frame, then iframes kick in via the existing `playerIFramesMs` mechanism.

### How attacks render

`drawBossAttacks()` is called once per frame, between `drawBossProjectiles` and `drawBossEnemy`. It calls `beginNeonGlowBatch`, renders all attack families, then calls `endNeonGlowBatch` — batching all glow compositing into one `drawImage` call.

---

## How to Add a New Attack Type

1. Add a new interface to `rpg-boss-attack-types.ts` (state fields, trail, hazard mode).
2. Add the new kind string to `BossAttackKind` union in `rpg-boss-attack-config.ts`.
3. Create `src/render/rpg/attacks/rpg-attack-mytype.ts` with `spawnMyTypeAttack`, `updateMyTypeAttack`, `getMyTypeHazardCircles`.
4. Add the `case` to `_dispatchUpdate` and `_tryScheduleAttack` in `rpg-boss-attack-update.ts`.
5. Add collision handling in `_checkAttackHitsPlayer`.
6. Add a draw function in `rpg-boss-attacks-draw.ts` and call it from `drawBossAttacks`.
7. Add config entries in `rpg-boss-attack-config.ts` for whichever bosses should use the new attack.
8. Update `file_index.md`.

---

## Performance Characteristics

- **TrailRing**: `Float64Array`-backed ring buffers — zero allocation per frame during update.
- **NeonTrailConfig**: Module-level constants, never reallocated.
- **Glow batch**: All 6 families composited with one `drawImage` per frame.
- **Follower drawing**: All followers rendered in a single batched `ctx.fill()` path. No per-follower `shadowBlur`.
- **Mandala trail segments**: Batch-drawn by color group (one `ctx.stroke()` per wave color).
- **Caps**:
  - `MAX_ACTIVE_ATTACKS = 6` — total concurrent special attacks
  - Grav: max 12 orbital bodies
  - Hex: max 6 simultaneous bolts, max 32 trail segments per bolt
  - Mandala: max 48 projectiles
  - Worms: max 6 simultaneous worms
  - Missiles: max 8 simultaneous missiles
  - Followers: max 120 total followers across all swarm instances

---

## Known Gameplay Tuning Notes

- Boss 10 (Equation Incarnate) uses all 6 families simultaneously at reduced pressure. The `maxPressure: 14` cap prevents visual unreadability but gameplay balance may need tuning.
- The `missileRing` attack for boss 3 uses ring-edge damage by default (`ringEdgeHazard`). The ring thickness for collision is ±8px which is generous — consider tightening for higher difficulty bosses.
- Worm `playerBiasStrength` is intentionally low (0.1–0.3) to keep the attack readable. Increasing beyond 0.5 creates unavoidable patterns.
- Grav body `softeningSquared = 1200` prevents singularity at well center. Bodies may still clump near wells — consider adding inter-body repulsion for late bosses.
- Mandala safe-gap angles are computed relative to current player position at wave fire time. The gap tracks the player's position at that moment, not predictively, which is intentional (fair but not trivially avoidable).

---

## Files Touched

**Created:**
- `src/render/rpg/rpg-boss-attack-types.ts`
- `src/render/rpg/rpg-boss-attack-config.ts`
- `src/render/rpg/rpg-boss-attack-update.ts`
- `src/render/rpg/rpg-boss-attacks-draw.ts`
- `src/render/rpg/attacks/rpg-attack-grav.ts`
- `src/render/rpg/attacks/rpg-attack-hex.ts`
- `src/render/rpg/attacks/rpg-attack-mandala.ts`
- `src/render/rpg/attacks/rpg-attack-vermiculate.ts`
- `src/render/rpg/attacks/rpg-attack-missile.ts`
- `src/render/rpg/attacks/rpg-attack-swarm.ts`
- `boss_attack_implementation_notes.md`

**Modified:**
- `src/render/rpg/rpg-render.ts` (import, state, context, update, draw, low-graphics, doRestart)
- `file_index.md` (added entries for all new files)
