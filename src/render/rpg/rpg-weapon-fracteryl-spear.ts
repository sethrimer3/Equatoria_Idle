/**
 * rpg-weapon-fracteryl-spear.ts — Fracteryl Spear Array weapon system.
 *
 * When a fracterylSpear weapon fires, a volley of crystalline spears spawns
 * around the player in radial slots. Each spear orbits briefly, then launches
 * one by one toward the nearest target. On impact each spear spawns a fractal
 * bloom: a recursive tree of line segments that deals decaying damage across
 * up to BLOOM_MAX_GEN branch generations.
 *
 * Design constraints (no runaway state):
 *   - Hard cap on active spears (SPEAR_MAX_ACTIVE)
 *   - Hard cap on active blooms (BLOOM_MAX_ACTIVE)
 *   - Hard cap on branches per bloom (BLOOM_MAX_BRANCHES)
 *   - Damage decays geometrically per generation (BLOOM_DMG_MULT)
 *   - No recursion in branch building (iterative BFS)
 *   - Hit set cleared per damage tick; same enemy can be hit each tick
 */

import type { ClosestTarget } from './rpg-types';

// ── Constants ─────────────────────────────────────────────────────────────────

const SPEAR_SPEED           = 5.0;   // px per frame (at 60fps ≈ 300 px/s)
const SPEAR_HIT_RADIUS      = 9;     // px — spear tip collision
const SPEAR_ORBIT_RADIUS    = 30;    // px from player center during forming
const SPEAR_STAGGER_MS      = 110;   // ms between successive launches
const SPEAR_MAX_LIFE_MS     = 2500;  // ms before a flying spear self-destructs
const SPEAR_MAX_ACTIVE      = 30;    // hard cap on total live spears

const BLOOM_LIFE_MS         = 900;   // total bloom duration
const BLOOM_DAMAGE_INTERVAL = 200;   // ms between bloom damage ticks
const BLOOM_BASE_LEN        = 20;    // px for generation-0 branches
const BLOOM_ANGLE_SPREAD    = 35 * (Math.PI / 180); // child branch angle offset
const BLOOM_LEN_MULT        = 0.65;  // length ratio per generation
const BLOOM_DMG_MULT        = 0.55;  // damage ratio per generation
const BLOOM_MAX_GEN         = 5;     // deepest branch generation
const BLOOM_MAX_BRANCHES    = 64;    // hard cap per bloom
const BLOOM_MAX_ACTIVE      = 10;    // hard cap on simultaneous blooms
const BLOOM_HIT_RADIUS_SQ   = 12 * 12; // endpoint proximity for hit detection (px²)

export const FRACTERYL_SPEAR_COLOR = '#c8f0ff';
export const FRACTERYL_BLOOM_CORE  = '#ffffff';
export const FRACTERYL_BLOOM_COLOR = '#a0d8ef';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface FracterylSpear {
  x: number; y: number;
  vx: number; vy: number;
  /** Current pointing angle (radians) — used for draw. */
  angle: number;
  /** Orbit slot angle (radians) during forming phase. */
  orbitAngle: number;
  damage: number;
  weaponId: string;
  state: 'forming' | 'flying';
  /** Remaining ms before this spear launches. */
  delayMs: number;
  /** Remaining lifetime (ms) while flying. */
  lifeMs: number;
  /** Last-known aim target position. */
  targetX: number;
  targetY: number;
}

export interface FracterylBranch {
  x1: number; y1: number;
  x2: number; y2: number;
  generation: number;
  damage: number;
}

export interface FracterylBloom {
  x: number; y: number;
  weaponId: string;
  baseDamage: number;
  lifeMs: number;
  maxLifeMs: number;
  damageTimerMs: number;
  branches: FracterylBranch[];
  /** Approximate string keys of targets hit this tick; cleared each tick. */
  hitKeysThisTick: Set<string>;
}

// ── Dependency-injection context ──────────────────────────────────────────────

export interface FracterylSpearCtx {
  mote: { x: number; y: number };
  findClosestTarget: (rangeSq: number) => ClosestTarget | null;
  collectEnemyBodyTargets: () => ClosestTarget[];
  damageBodyTarget: (target: ClosestTarget, rawDamage: number, defPierceRatio: number, bypassShield: boolean) => number;
  spawnHitVisualsAt: (x: number, y: number, maxHp: number, dmg: number, color: string) => void;
}

// ── Handle ────────────────────────────────────────────────────────────────────

export interface FracterylSpearHandle {
  readonly fracterylSpears: FracterylSpear[];
  readonly fracterylBlooms: FracterylBloom[];
  spawnFracterylSpearVolley(weaponId: string, damage: number, tier: number): void;
  updateFracterylSpears(deltaMs: number): void;
  updateFracterylBlooms(deltaMs: number): void;
  reset(): void;
}

// ── Branch generation (iterative BFS) ────────────────────────────────────────

function buildBranches(
  impactX: number, impactY: number,
  damage: number,
  branches: FracterylBranch[],
): void {
  interface QEntry { x: number; y: number; angle: number; len: number; gen: number; dmg: number }
  const queue: QEntry[] = [];

  // Three symmetrical seed directions
  for (let i = 0; i < 3; i++) {
    queue.push({
      x: impactX, y: impactY,
      angle: (i / 3) * Math.PI * 2,
      len: BLOOM_BASE_LEN,
      gen: 0,
      dmg: damage,
    });
  }

  let head = 0;
  while (head < queue.length && branches.length < BLOOM_MAX_BRANCHES) {
    const e = queue[head++]!;
    if (e.gen > BLOOM_MAX_GEN) continue;

    const x2 = e.x + Math.cos(e.angle) * e.len;
    const y2 = e.y + Math.sin(e.angle) * e.len;
    branches.push({ x1: e.x, y1: e.y, x2, y2, generation: e.gen, damage: Math.max(1, Math.round(e.dmg)) });

    if (e.gen < BLOOM_MAX_GEN && branches.length < BLOOM_MAX_BRANCHES - 1) {
      const newLen = e.len * BLOOM_LEN_MULT;
      const newDmg = e.dmg * BLOOM_DMG_MULT;
      queue.push({ x: x2, y: y2, angle: e.angle + BLOOM_ANGLE_SPREAD, len: newLen, gen: e.gen + 1, dmg: newDmg });
      queue.push({ x: x2, y: y2, angle: e.angle - BLOOM_ANGLE_SPREAD, len: newLen, gen: e.gen + 1, dmg: newDmg });
    }
  }
}

// ── Target key for per-tick deduplication ─────────────────────────────────────

function targetKey(t: ClosestTarget): string {
  return `${t.kind}|${Math.round(t.x)}|${Math.round(t.y)}`;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createFracterylSpearSystem(ctx: FracterylSpearCtx): FracterylSpearHandle {
  const fracterylSpears: FracterylSpear[] = [];
  const fracterylBlooms: FracterylBloom[] = [];

  function spawnBloom(x: number, y: number, weaponId: string, damage: number): void {
    if (fracterylBlooms.length >= BLOOM_MAX_ACTIVE) {
      // Evict the oldest bloom to stay under cap
      fracterylBlooms.shift();
    }
    const branches: FracterylBranch[] = [];
    buildBranches(x, y, damage * 0.5, branches);
    fracterylBlooms.push({
      x, y, weaponId,
      baseDamage: damage,
      lifeMs: BLOOM_LIFE_MS,
      maxLifeMs: BLOOM_LIFE_MS,
      damageTimerMs: BLOOM_DAMAGE_INTERVAL,
      branches,
      hitKeysThisTick: new Set(),
    });
  }

  function spawnFracterylSpearVolley(weaponId: string, damage: number, tier: number): void {
    // Conservative spear count scaling
    const count = Math.min(10, 3 + Math.floor((Math.max(1, tier) - 1) / 2));
    // If we'd exceed the active cap, drop the volley (safety guard)
    if (fracterylSpears.length + count > SPEAR_MAX_ACTIVE) return;

    // Find the current nearest target for initial aim
    const initialTarget = ctx.findClosestTarget(Infinity);
    const tx = initialTarget?.x ?? ctx.mote.x;
    const ty = initialTarget?.y ?? (ctx.mote.y - 60);

    for (let i = 0; i < count; i++) {
      const orbitAngle = (i / count) * Math.PI * 2;
      const ox = ctx.mote.x + Math.cos(orbitAngle) * SPEAR_ORBIT_RADIUS;
      const oy = ctx.mote.y + Math.sin(orbitAngle) * SPEAR_ORBIT_RADIUS;
      const angle = Math.atan2(ty - oy, tx - ox);
      fracterylSpears.push({
        x: ox, y: oy,
        vx: 0, vy: 0,
        angle,
        orbitAngle,
        damage,
        weaponId,
        state: 'forming',
        delayMs: i * SPEAR_STAGGER_MS,
        lifeMs: SPEAR_MAX_LIFE_MS,
        targetX: tx,
        targetY: ty,
      });
    }
  }

  function updateFracterylSpears(deltaMs: number): void {
    // Update aim target once per frame (cheaply reuse last findClosestTarget call)
    const currentTarget = ctx.findClosestTarget(Infinity);
    const currentTx = currentTarget?.x ?? ctx.mote.x;
    const currentTy = currentTarget?.y ?? (ctx.mote.y - 60);

    const toRemove: number[] = [];

    for (let i = 0; i < fracterylSpears.length; i++) {
      const s = fracterylSpears[i]!;

      if (s.state === 'forming') {
        // Update orbit position to follow the player
        s.x = ctx.mote.x + Math.cos(s.orbitAngle) * SPEAR_ORBIT_RADIUS;
        s.y = ctx.mote.y + Math.sin(s.orbitAngle) * SPEAR_ORBIT_RADIUS;
        // Keep aiming at current target
        s.targetX = currentTx;
        s.targetY = currentTy;
        s.angle = Math.atan2(s.targetY - s.y, s.targetX - s.x);

        s.delayMs -= deltaMs;
        if (s.delayMs <= 0) {
          // Launch!
          s.state = 'flying';
          const dx = s.targetX - s.x;
          const dy = s.targetY - s.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0.001) {
            s.vx = (dx / dist) * SPEAR_SPEED;
            s.vy = (dy / dist) * SPEAR_SPEED;
          } else {
            s.vx = 0;
            s.vy = -SPEAR_SPEED;
          }
          s.angle = Math.atan2(s.vy, s.vx);
        }
      } else {
        // Flying
        s.x += s.vx;
        s.y += s.vy;
        s.lifeMs -= deltaMs;

        if (s.lifeMs <= 0) {
          toRemove.push(i);
          continue;
        }

        // Hit detection against all body targets
        const hitRadSq = SPEAR_HIT_RADIUS * SPEAR_HIT_RADIUS;
        const targets = ctx.collectEnemyBodyTargets();
        let hit = false;
        for (const t of targets) {
          const ddx = t.x - s.x;
          const ddy = t.y - s.y;
          if (ddx * ddx + ddy * ddy <= hitRadSq) {
            const dmg = ctx.damageBodyTarget(t, s.damage, 0, false);
            if (dmg > 0) {
              ctx.spawnHitVisualsAt(t.x, t.y, 9999, dmg, FRACTERYL_SPEAR_COLOR);
            }
            spawnBloom(s.x, s.y, s.weaponId, s.damage);
            hit = true;
            break;
          }
        }
        if (hit) toRemove.push(i);
      }
    }

    // Remove in reverse order to preserve indices
    for (let i = toRemove.length - 1; i >= 0; i--) {
      fracterylSpears.splice(toRemove[i]!, 1);
    }
  }

  function updateFracterylBlooms(deltaMs: number): void {
    const toRemove: number[] = [];

    for (let i = 0; i < fracterylBlooms.length; i++) {
      const bloom = fracterylBlooms[i]!;
      bloom.lifeMs -= deltaMs;
      if (bloom.lifeMs <= 0) {
        toRemove.push(i);
        continue;
      }

      bloom.damageTimerMs -= deltaMs;
      if (bloom.damageTimerMs <= 0) {
        bloom.damageTimerMs = BLOOM_DAMAGE_INTERVAL;
        bloom.hitKeysThisTick.clear();

        const targets = ctx.collectEnemyBodyTargets();
        for (const t of targets) {
          const key = targetKey(t);
          if (bloom.hitKeysThisTick.has(key)) continue;

          // Check proximity to any branch endpoint
          for (const branch of bloom.branches) {
            const dx2 = t.x - branch.x2;
            const dy2 = t.y - branch.y2;
            if (dx2 * dx2 + dy2 * dy2 <= BLOOM_HIT_RADIUS_SQ) {
              const dmg = ctx.damageBodyTarget(t, branch.damage, 0, false);
              if (dmg > 0) {
                ctx.spawnHitVisualsAt(t.x, t.y, 9999, dmg, FRACTERYL_BLOOM_COLOR);
              }
              bloom.hitKeysThisTick.add(key);
              break;
            }
          }
        }
      }
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      fracterylBlooms.splice(toRemove[i]!, 1);
    }
  }

  function reset(): void {
    fracterylSpears.length = 0;
    fracterylBlooms.length = 0;
  }

  return {
    get fracterylSpears() { return fracterylSpears; },
    get fracterylBlooms() { return fracterylBlooms; },
    spawnFracterylSpearVolley,
    updateFracterylSpears,
    updateFracterylBlooms,
    reset,
  };
}
