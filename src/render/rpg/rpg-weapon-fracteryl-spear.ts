/**
 * rpg-weapon-fracteryl-spear.ts — Fracteryl Spear Array weapon system.
 *
 * Each spear is a jagged living thunderbolt in flight. On impact, one of three
 * seeded fractal bloom variants spawns and grows outward from the hit point.
 *
 * Design constraints (no runaway state):
 *   - Hard cap on active spears (SPEAR_MAX_ACTIVE)
 *   - Hard cap on active blooms (BLOOM_MAX_ACTIVE)
 *   - Hard cap on branches per bloom (BLOOM_MAX_BRANCHES)
 *   - Damage decays geometrically per generation (BLOOM_DMG_MULT)
 *   - No recursion in branch building (iterative loops)
 *   - Hit set cleared per damage tick; same enemy can be hit each tick
 */

import type { ClosestTarget } from './rpg-types';

// ── Constants ─────────────────────────────────────────────────────────────────

const SPEAR_SPEED              = 5.0;
const SPEAR_HIT_RADIUS         = 9;
const SPEAR_ORBIT_RADIUS       = 30;
const SPEAR_STAGGER_MS         = 110;
const SPEAR_MAX_LIFE_MS        = 2500;
const SPEAR_MAX_ACTIVE         = 30;

export const SPEAR_SPINE_POINTS      = 6;    // internal jagged spine points (normal graphics)
export const SPEAR_NOISE_AMPLITUDE   = 3.5;  // px max perpendicular bolt displacement
export const SPEAR_FORK_CHANCE       = 0.30; // unused directly; fork count derived from seed
export const SPEAR_VISUAL_REFRESH_MS = 80;   // ms between spine re-randomizations (flicker rate)

const BLOOM_LIFE_MS            = 900;
const BLOOM_DAMAGE_INTERVAL    = 200;
const BLOOM_BASE_LEN           = 20;
const BLOOM_ANGLE_SPREAD       = 35 * (Math.PI / 180);
const BLOOM_LEN_MULT           = 0.65;
const BLOOM_DMG_MULT           = 0.55;
const BLOOM_MAX_BRANCHES       = 64;
const BLOOM_MAX_ACTIVE         = 10;
const BLOOM_HIT_RADIUS_SQ      = 12 * 12;

export const BLOOM_GROW_MS               = 220;  // base grow time for gen-0 elements
export const BLOOM_BRANCH_DELAY_MS       = 90;   // additional delay per generation cascade
export const BLOOM_VARIANT_COUNT         = 3;    // number of distinct bloom kinds
export const BLOOM_TRIANGLE_DEPTH        = 2;    // sierpinskiShard recursion depth (0=just outer tri)
export const BLOOM_LOW_GRAPHICS_BRANCH_MULT = 0.5; // fraction of generations drawn in low graphics

export const FRACTERYL_SPEAR_COLOR = '#c8f0ff';
export const FRACTERYL_BLOOM_CORE  = '#ffffff';
export const FRACTERYL_BLOOM_COLOR = '#a0d8ef';

// ── Types ─────────────────────────────────────────────────────────────────────

export type FracterylBloomKind = 'crackBloom' | 'lightningFlower' | 'sierpinskiShard';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface FracterylSpear {
  x: number; y: number;
  vx: number; vy: number;
  /** Forward direction angle (radians). */
  angle: number;
  /** Radial slot angle during forming phase. */
  orbitAngle: number;
  damage: number;
  weaponId: string;
  state: 'forming' | 'flying';
  delayMs: number;
  lifeMs: number;
  targetX: number;
  targetY: number;
  // ── Visual fields ─────────────────────────────────────────────────
  seed: number;
  /** Slowly oscillating phase [0..1) used to vary spine shape over time. */
  visualPhase: number;
  /** Cached perpendicular offsets (px) at each internal spine point. Updated throttled. */
  spineOffsets: number[];
  spineRefreshMs: number;
}

export interface FracterylBranch {
  x1: number; y1: number;
  x2: number; y2: number;
  /** Third vertex for 'tri' kind. */
  x3?: number; y3?: number;
  kind: 'line' | 'tri';
  generation: number;
  damage: number;
  /** Milliseconds after bloom spawn before this element starts growing. */
  delayMs: number;
  /** Milliseconds to grow from 0 to full size. */
  growMs: number;
}

export interface FracterylBloom {
  x: number; y: number;
  weaponId: string;
  baseDamage: number;
  lifeMs: number;
  maxLifeMs: number;
  damageTimerMs: number;
  branches: FracterylBranch[];
  hitKeysThisTick: Set<string>;
  kind: FracterylBloomKind;
  seed: number;
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

// ── Seeded RNG (LCG) ──────────────────────────────────────────────────────────

function seededRng(seed: number): () => number {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

// ── Spine helpers ─────────────────────────────────────────────────────────────

function refreshSpineOffsets(spear: FracterylSpear): void {
  const rng = seededRng((spear.seed * 7 + (Math.floor(spear.visualPhase * 63) | 0)) | 0);
  for (let i = 0; i < spear.spineOffsets.length; i++) {
    spear.spineOffsets[i] = (rng() * 2 - 1) * SPEAR_NOISE_AMPLITUDE;
  }
}

function makeSeedForSpear(x: number, y: number, index: number): number {
  return (Math.round(x) * 7 + Math.round(y) * 13 + index * 97) | 0;
}

// ── Bloom variant builders ────────────────────────────────────────────────────

/** 5 radial jagged cracks, each splitting into 2 sub-branches per generation. */
function buildCrackBloom(
  cx: number, cy: number,
  damage: number,
  branches: FracterylBranch[],
  rng: () => number,
): void {
  const crackCount = 5;
  const baseAngle  = rng() * Math.PI * 2;
  const grow0  = BLOOM_GROW_MS;
  const grow1  = BLOOM_GROW_MS * 0.70;
  const grow2  = BLOOM_GROW_MS * 0.50;
  const delay1 = grow0 * 0.65;
  const delay2 = delay1 + grow1 * 0.65;

  for (let i = 0; i < crackCount; i++) {
    if (branches.length >= BLOOM_MAX_BRANCHES) break;
    const a0 = baseAngle + (i / crackCount) * Math.PI * 2 + (rng() - 0.5) * 0.5;
    const len0 = BLOOM_BASE_LEN * (1.3 + rng() * 0.7);
    const x2 = cx + Math.cos(a0) * len0;
    const y2 = cy + Math.sin(a0) * len0;
    branches.push({ x1: cx, y1: cy, x2, y2, kind: 'line', generation: 0, damage: Math.max(1, Math.round(damage)), delayMs: 0, growMs: grow0 });

    for (let j = 0; j < 2 && branches.length < BLOOM_MAX_BRANCHES; j++) {
      const a1 = a0 + (j === 0 ? 1 : -1) * (BLOOM_ANGLE_SPREAD + rng() * 0.3);
      const len1 = len0 * BLOOM_LEN_MULT;
      const x2b = x2 + Math.cos(a1) * len1;
      const y2b = y2 + Math.sin(a1) * len1;
      const dmg1 = Math.max(1, Math.round(damage * BLOOM_DMG_MULT));
      branches.push({ x1: x2, y1: y2, x2: x2b, y2: y2b, kind: 'line', generation: 1, damage: dmg1, delayMs: delay1, growMs: grow1 });

      if (branches.length < BLOOM_MAX_BRANCHES) {
        const a2 = a1 + (rng() - 0.5) * 0.6;
        const len2 = len1 * BLOOM_LEN_MULT;
        branches.push({ x1: x2b, y1: y2b, x2: x2b + Math.cos(a2) * len2, y2: y2b + Math.sin(a2) * len2, kind: 'line', generation: 2, damage: Math.max(1, Math.round(damage * BLOOM_DMG_MULT * BLOOM_DMG_MULT)), delayMs: delay2, growMs: grow2 });
      }
    }
  }
}

/** 4–5 radial lightning stems that zig-zag forward, each forking as they grow. */
function buildLightningFlower(
  cx: number, cy: number,
  damage: number,
  branches: FracterylBranch[],
  rng: () => number,
): void {
  const stemCount  = 4 + (rng() < 0.4 ? 1 : 0);
  const baseAngle  = rng() * Math.PI * 2;
  const growStep   = BLOOM_GROW_MS * 0.85;
  const MAX_GEN    = 4;

  for (let i = 0; i < stemCount; i++) {
    if (branches.length >= BLOOM_MAX_BRANCHES) break;
    const stemAngle = baseAngle + (i / stemCount) * Math.PI * 2;
    let x = cx, y = cy;
    let a = stemAngle;
    let len = BLOOM_BASE_LEN * (1.1 + rng() * 0.4);
    let dmg = damage;
    let delay = 0;

    for (let gen = 0; gen <= MAX_GEN && branches.length < BLOOM_MAX_BRANCHES; gen++) {
      a += (rng() - 0.5) * 0.6; // zig-zag deviation
      const nx = x + Math.cos(a) * len;
      const ny = y + Math.sin(a) * len;
      branches.push({ x1: x, y1: y, x2: nx, y2: ny, kind: 'line', generation: gen, damage: Math.max(1, Math.round(dmg)), delayMs: delay, growMs: growStep });

      // One side fork from this segment's endpoint
      if (gen < MAX_GEN - 1 && branches.length < BLOOM_MAX_BRANCHES) {
        const fa  = a + (rng() < 0.5 ? 1 : -1) * (BLOOM_ANGLE_SPREAD * 1.2 + rng() * 0.3);
        const fl  = len * BLOOM_LEN_MULT;
        const fd  = delay + growStep * 0.4;
        branches.push({ x1: nx, y1: ny, x2: nx + Math.cos(fa) * fl, y2: ny + Math.sin(fa) * fl, kind: 'line', generation: gen + 1, damage: Math.max(1, Math.round(dmg * BLOOM_DMG_MULT)), delayMs: fd, growMs: growStep * 0.7 });
      }

      delay += growStep * 0.6;
      x = nx; y = ny;
      len *= BLOOM_LEN_MULT;
      dmg *= BLOOM_DMG_MULT;
    }
  }
}

/** Outward-expanding Sierpinski-inspired triangles. */
function buildSierpinskiShard(
  ox: number, oy: number,
  damage: number,
  branches: FracterylBranch[],
  rng: () => number,
): void {
  const R     = BLOOM_BASE_LEN * 2.0;
  const rot   = rng() * Math.PI * 2;
  const grow0 = BLOOM_GROW_MS;
  const grow1 = BLOOM_GROW_MS * 0.75;
  const grow2 = BLOOM_GROW_MS * 0.60;
  const delay1 = grow0 * 0.5;
  const delay2 = delay1 + grow1 * 0.5;

  function triVerts(tcx: number, tcy: number, r: number, a: number): [number, number, number, number, number, number] {
    return [
      tcx + Math.cos(a)                    * r, tcy + Math.sin(a)                    * r,
      tcx + Math.cos(a + Math.PI * 2 / 3) * r, tcy + Math.sin(a + Math.PI * 2 / 3) * r,
      tcx + Math.cos(a + Math.PI * 4 / 3) * r, tcy + Math.sin(a + Math.PI * 4 / 3) * r,
    ];
  }

  // Generation 0 — single outer triangle
  const [ax, ay, bx, by, cx2, cy2] = triVerts(ox, oy, R, rot);
  if (branches.length < BLOOM_MAX_BRANCHES) {
    branches.push({ x1: ax, y1: ay, x2: bx, y2: by, x3: cx2, y3: cy2, kind: 'tri', generation: 0, damage: Math.max(1, Math.round(damage)), delayMs: 0, growMs: grow0 });
  }

  if (BLOOM_TRIANGLE_DEPTH < 1) return;

  // Generation 1 — 3 child triangles at each parent vertex
  const verts0: [number, number, number][] = [[ax, ay, rot], [bx, by, rot + Math.PI * 2 / 3], [cx2, cy2, rot + Math.PI * 4 / 3]];
  for (let i = 0; i < 3; i++) {
    if (branches.length >= BLOOM_MAX_BRANCHES) break;
    const [vx, vy, va] = verts0[i]!;
    const [ax1, ay1, bx1, by1, cx21, cy21] = triVerts(vx, vy, R * 0.5, va);
    branches.push({ x1: ax1, y1: ay1, x2: bx1, y2: by1, x3: cx21, y3: cy21, kind: 'tri', generation: 1, damage: Math.max(1, Math.round(damage * BLOOM_DMG_MULT)), delayMs: delay1, growMs: grow1 });

    if (BLOOM_TRIANGLE_DEPTH < 2) continue;

    // Generation 2 — 3 child triangles per gen-1
    const verts1: [number, number, number][] = [[ax1, ay1, va], [bx1, by1, va + Math.PI * 2 / 3], [cx21, cy21, va + Math.PI * 4 / 3]];
    for (let j = 0; j < 3; j++) {
      if (branches.length >= BLOOM_MAX_BRANCHES) break;
      const [vx2, vy2, va2] = verts1[j]!;
      const [ax2, ay2, bx2, by2, cx22, cy22] = triVerts(vx2, vy2, R * 0.25, va2);
      branches.push({ x1: ax2, y1: ay2, x2: bx2, y2: by2, x3: cx22, y3: cy22, kind: 'tri', generation: 2, damage: Math.max(1, Math.round(damage * BLOOM_DMG_MULT * BLOOM_DMG_MULT)), delayMs: delay2, growMs: grow2 });
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

  const BLOOM_KINDS: FracterylBloomKind[] = ['crackBloom', 'lightningFlower', 'sierpinskiShard'];

  function spawnBloom(x: number, y: number, weaponId: string, damage: number): void {
    if (fracterylBlooms.length >= BLOOM_MAX_ACTIVE) {
      fracterylBlooms.shift();
    }
    const seed = (Math.round(x) * 7 + Math.round(y) * 13 + fracterylBlooms.length * 31) | 0;
    const kind = BLOOM_KINDS[((seed >>> 0) % BLOOM_VARIANT_COUNT)]!;
    const rng  = seededRng(seed);
    const branches: FracterylBranch[] = [];

    if (kind === 'crackBloom')       buildCrackBloom(x, y, damage * 0.5, branches, rng);
    else if (kind === 'lightningFlower') buildLightningFlower(x, y, damage * 0.5, branches, rng);
    else                             buildSierpinskiShard(x, y, damage * 0.5, branches, rng);

    fracterylBlooms.push({
      x, y, weaponId,
      baseDamage: damage,
      lifeMs: BLOOM_LIFE_MS,
      maxLifeMs: BLOOM_LIFE_MS,
      damageTimerMs: BLOOM_DAMAGE_INTERVAL,
      branches,
      hitKeysThisTick: new Set(),
      kind,
      seed,
    });
  }

  function spawnFracterylSpearVolley(weaponId: string, damage: number, tier: number): void {
    const count = Math.min(10, 3 + Math.floor((Math.max(1, tier) - 1) / 2));
    if (fracterylSpears.length + count > SPEAR_MAX_ACTIVE) return;

    const initialTarget = ctx.findClosestTarget(Infinity);
    const tx = initialTarget?.x ?? ctx.mote.x;
    const ty = initialTarget?.y ?? (ctx.mote.y - 60);

    for (let i = 0; i < count; i++) {
      const orbitAngle = (i / count) * Math.PI * 2;
      const ox = ctx.mote.x + Math.cos(orbitAngle) * SPEAR_ORBIT_RADIUS;
      const oy = ctx.mote.y + Math.sin(orbitAngle) * SPEAR_ORBIT_RADIUS;
      const angle = Math.atan2(ty - oy, tx - ox);
      const seed = makeSeedForSpear(ox, oy, i);
      const spear: FracterylSpear = {
        x: ox, y: oy,
        vx: 0, vy: 0,
        angle, orbitAngle, damage, weaponId,
        state: 'forming',
        delayMs: i * SPEAR_STAGGER_MS,
        lifeMs: SPEAR_MAX_LIFE_MS,
        targetX: tx, targetY: ty,
        seed,
        visualPhase: 0,
        spineOffsets: new Array(SPEAR_SPINE_POINTS).fill(0) as number[],
        spineRefreshMs: 0,
      };
      refreshSpineOffsets(spear);
      fracterylSpears.push(spear);
    }
  }

  function updateFracterylSpears(deltaMs: number): void {
    const currentTarget = ctx.findClosestTarget(Infinity);
    const currentTx = currentTarget?.x ?? ctx.mote.x;
    const currentTy = currentTarget?.y ?? (ctx.mote.y - 60);

    const toRemove: number[] = [];

    for (let i = 0; i < fracterylSpears.length; i++) {
      const s = fracterylSpears[i]!;

      // Update spine flicker
      s.visualPhase = (s.visualPhase + deltaMs * 0.004) % 1.0;
      s.spineRefreshMs -= deltaMs;
      if (s.spineRefreshMs <= 0) {
        s.spineRefreshMs = SPEAR_VISUAL_REFRESH_MS;
        refreshSpineOffsets(s);
      }

      if (s.state === 'forming') {
        s.x = ctx.mote.x + Math.cos(s.orbitAngle) * SPEAR_ORBIT_RADIUS;
        s.y = ctx.mote.y + Math.sin(s.orbitAngle) * SPEAR_ORBIT_RADIUS;
        s.targetX = currentTx;
        s.targetY = currentTy;
        s.angle = Math.atan2(s.targetY - s.y, s.targetX - s.x);
        s.delayMs -= deltaMs;
        if (s.delayMs <= 0) {
          s.state = 'flying';
          const dx = s.targetX - s.x;
          const dy = s.targetY - s.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0.001) {
            s.vx = (dx / dist) * SPEAR_SPEED;
            s.vy = (dy / dist) * SPEAR_SPEED;
          } else {
            s.vx = 0; s.vy = -SPEAR_SPEED;
          }
          s.angle = Math.atan2(s.vy, s.vx);
        }
      } else {
        s.x += s.vx;
        s.y += s.vy;
        s.lifeMs -= deltaMs;

        if (s.lifeMs <= 0) { toRemove.push(i); continue; }

        const hitRadSq = SPEAR_HIT_RADIUS * SPEAR_HIT_RADIUS;
        const targets  = ctx.collectEnemyBodyTargets();
        let hit = false;
        for (const t of targets) {
          const ddx = t.x - s.x;
          const ddy = t.y - s.y;
          if (ddx * ddx + ddy * ddy <= hitRadSq) {
            const dmg = ctx.damageBodyTarget(t, s.damage, 0, false);
            if (dmg > 0) ctx.spawnHitVisualsAt(t.x, t.y, 9999, dmg, FRACTERYL_SPEAR_COLOR);
            spawnBloom(s.x, s.y, s.weaponId, s.damage);
            hit = true;
            break;
          }
        }
        if (hit) toRemove.push(i);
      }
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      fracterylSpears.splice(toRemove[i]!, 1);
    }
  }

  function updateFracterylBlooms(deltaMs: number): void {
    const toRemove: number[] = [];

    for (let i = 0; i < fracterylBlooms.length; i++) {
      const bloom = fracterylBlooms[i]!;
      bloom.lifeMs -= deltaMs;
      if (bloom.lifeMs <= 0) { toRemove.push(i); continue; }

      bloom.damageTimerMs -= deltaMs;
      if (bloom.damageTimerMs <= 0) {
        bloom.damageTimerMs = BLOOM_DAMAGE_INTERVAL;
        bloom.hitKeysThisTick.clear();

        const targets = ctx.collectEnemyBodyTargets();
        for (const t of targets) {
          const key = targetKey(t);
          if (bloom.hitKeysThisTick.has(key)) continue;

          for (const branch of bloom.branches) {
            let hit = false;
            if (branch.kind === 'tri') {
              // Check proximity to all three triangle vertices
              const x3 = branch.x3 ?? branch.x1;
              const y3 = branch.y3 ?? branch.y1;
              for (const [vx, vy] of [[branch.x1, branch.y1], [branch.x2, branch.y2], [x3, y3]] as [number, number][]) {
                const dx = t.x - vx, dy = t.y - vy;
                if (dx * dx + dy * dy <= BLOOM_HIT_RADIUS_SQ) { hit = true; break; }
              }
            } else {
              const dx2 = t.x - branch.x2, dy2 = t.y - branch.y2;
              if (dx2 * dx2 + dy2 * dy2 <= BLOOM_HIT_RADIUS_SQ) hit = true;
            }
            if (hit) {
              const dmg = ctx.damageBodyTarget(t, branch.damage, 0, false);
              if (dmg > 0) ctx.spawnHitVisualsAt(t.x, t.y, 9999, dmg, FRACTERYL_BLOOM_COLOR);
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
