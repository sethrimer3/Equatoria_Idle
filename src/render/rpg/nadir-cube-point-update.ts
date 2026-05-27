/**
 * nadir-cube-point-update.ts — Spawn and per-frame update for Nadir cube-point enemies.
 */

import type { NadirCubeProjectionState } from './nadir-cube-point-types';
import {
  NADIR_CUBE_HALF_CELLS,
  NADIR_CUBE_CELL_SIZE,
  projectNadirAnchor,
  type NadirCubePointEnemy,
  type NadirCubePointBehavior,
  type NadirCubeMine,
  type NadirCubeTrailSegment,
  type NadirCubeTurretBolt,
  type NadirCubeLinkLaser,
} from './nadir-cube-point-types';

// ── Tuning constants ──────────────────────────────────────────────────────────

/** Hitbox radius for point enemy collision (px). */
export const NADIR_CUBE_POINT_RADIUS = 12;

// mine_layer tuning
const MINE_COOLDOWN_MS = 4000;
const MINE_LIFE_MS = 7000;
const MINE_RADIUS = 18;

// laser_trail tuning
const TRAIL_COOLDOWN_MS = 0;
const TRAIL_LIFE_MS = 900;
const TRAIL_MIN_DIST_SQ = 100;

// turret tuning
const TURRET_COOLDOWN_MS = 2800;
const TURRET_BOLT_SPEED = 130;
const TURRET_BOLT_LIFE_MS = 4000;
const TURRET_BOLT_RADIUS = 6;

// link_laser tuning
const LINK_LASER_COOLDOWN_MS = 5500;
const LINK_LASER_WARNING_MS = 700;
const LINK_LASER_ACTIVE_MS = 1000;
const LINK_LASER_WIDTH = 8;

// caps
export const MAX_NADIR_MINES = 16;
export const MAX_NADIR_TRAIL_SEGMENTS = 32;
export const MAX_NADIR_TURRET_BOLTS = 24;
export const MAX_NADIR_LINK_LASERS = 8;

// ── Anchor generation ──────────────────────────────────────────────────────────

function buildCandidateAnchors(): { wx: number; wy: number; wz: number }[] {
  const result: { wx: number; wy: number; wz: number }[] = [];
  const hc = NADIR_CUBE_HALF_CELLS;
  const cs = NADIR_CUBE_CELL_SIZE;
  for (let ix = -hc; ix <= hc; ix++) {
    for (let iy = -hc; iy <= hc; iy++) {
      for (let iz = -hc; iz <= hc; iz++) {
        const atEdge = Math.abs(ix) === hc || Math.abs(iy) === hc || Math.abs(iz) === hc;
        const atMid = Math.abs(ix) <= 2 && Math.abs(iy) <= 2 && Math.abs(iz) <= 2;
        if (atEdge || atMid) {
          result.push({ wx: ix * cs, wy: iy * cs, wz: iz * cs });
        }
      }
    }
  }
  return result;
}

const CANDIDATE_ANCHORS = buildCandidateAnchors();

function nadirRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function getNadirCubePointCount(wave: number): number {
  if (wave >= 40) return Math.min(8, 5 + Math.floor((wave - 40) / 20));
  if (wave >= 30) return 5;
  if (wave >= 20) return 4;
  return 3;
}

function getBehaviorForIndex(wave: number, index: number, total: number): NadirCubePointBehavior {
  if (wave >= 40 && index === total - 1) return 'link_laser';
  const base: NadirCubePointBehavior[] = ['turret', 'mine_layer', 'laser_trail'];
  return base[index % base.length]!;
}

let nextId = 1;

export function spawnNadirCubeEncounter(
  wave: number,
  projState: NadirCubeProjectionState,
  playerX: number,
  playerY: number,
): NadirCubePointEnemy[] {
  const count = getNadirCubePointCount(wave);
  const rng = nadirRng(wave * 31337 + 0xBEEF);

  const { gameW, gameH } = projState;
  const margin = 40;
  const minPlayerDistSq = 80 * 80;

  const candidates = CANDIDATE_ANCHORS.slice();
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = candidates[i]!;
    candidates[i] = candidates[j]!;
    candidates[j] = tmp;
  }

  const selected: NadirCubePointEnemy[] = [];
  for (const anchor of candidates) {
    if (selected.length >= count) break;
    const proj = projectNadirAnchor(anchor.wx, anchor.wy, anchor.wz, projState);
    if (!proj) continue;
    if (proj.sx < margin || proj.sx > gameW - margin || proj.sy < margin || proj.sy > gameH - margin) continue;
    const dx = proj.sx - playerX;
    const dy = proj.sy - playerY;
    if (dx * dx + dy * dy < minPlayerDistSq) continue;

    const behavior = getBehaviorForIndex(wave, selected.length, count);
    const baseHp = 200 + wave * 20;
    const atk = 15 + wave * 2;
    const cooldown = behavior === 'mine_layer'
      ? MINE_COOLDOWN_MS * (0.5 + rng() * 0.5)
      : behavior === 'turret'
        ? TURRET_COOLDOWN_MS * (0.5 + rng() * 0.5)
        : behavior === 'link_laser'
          ? LINK_LASER_COOLDOWN_MS * (0.3 + rng() * 0.5)
          : TRAIL_COOLDOWN_MS;

    selected.push({
      kind: 'nadir_cube_point',
      id: nextId++,
      anchorX: anchor.wx,
      anchorY: anchor.wy,
      anchorZ: anchor.wz,
      x: proj.sx,
      y: proj.sy,
      prevX: proj.sx,
      prevY: proj.sy,
      hp: baseHp,
      maxHp: baseHp,
      atk,
      def: 10,
      behavior,
      cooldownMs: cooldown,
      pulseMs: rng() * 1000,
      hitFlashMs: 0,
      projectedVisible: true,
      depthAlpha: proj.depthAlpha,
    });
  }

  for (const p of selected) {
    if (p.behavior === 'link_laser') {
      p.linkedIds = selected.filter((q) => q.id !== p.id).slice(0, 2).map((q) => q.id);
    }
  }

  return selected;
}

// ── Per-frame update ───────────────────────────────────────────────────────────

export interface NadirCubeUpdateCtx {
  enemies: NadirCubePointEnemy[];
  mines: NadirCubeMine[];
  trailSegments: NadirCubeTrailSegment[];
  turretBolts: NadirCubeTurretBolt[];
  linkLasers: NadirCubeLinkLaser[];
  projState: NadirCubeProjectionState;
  playerX: number;
  playerY: number;
  playerRadius: number;
  getPlayerIFramesMs(): number;
  setPlayerIFramesMs(ms: number): void;
  dealDamageToPlayer(dmg: number): void;
  spawnDamageNumber(x: number, y: number, vx: number, vy: number, text: string, ratio: number, color: string): void;
  deltaMs: number;
}

function distToSegSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 0.0001) {
    const dx = px - ax;
    const dy = py - ay;
    return dx * dx + dy * dy;
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
  const nx = ax + t * abx - px;
  const ny = ay + t * aby - py;
  return nx * nx + ny * ny;
}

export function updateNadirCubePointEnemies(ctx: NadirCubeUpdateCtx): void {
  const {
    enemies,
    mines,
    trailSegments,
    turretBolts,
    linkLasers,
    projState,
    playerX,
    playerY,
    playerRadius,
    deltaMs,
  } = ctx;

  for (const e of enemies) {
    e.prevX = e.x;
    e.prevY = e.y;
    const proj = projectNadirAnchor(e.anchorX, e.anchorY, e.anchorZ, projState);
    if (proj) {
      e.x = proj.sx;
      e.y = proj.sy;
      e.projectedVisible = true;
      e.depthAlpha = proj.depthAlpha;
    } else {
      e.projectedVisible = false;
    }
    e.pulseMs += deltaMs;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    if (e.cooldownMs > 0) e.cooldownMs -= deltaMs;
  }

  for (const e of enemies) {
    if (!e.projectedVisible || e.hp <= 0) continue;

    if (e.behavior === 'mine_layer' && e.cooldownMs <= 0) {
      if (mines.length < MAX_NADIR_MINES) {
        mines.push({
          x: e.x,
          y: e.y,
          lifeMs: MINE_LIFE_MS,
          maxLifeMs: MINE_LIFE_MS,
          radius: MINE_RADIUS,
          damage: e.atk,
          triggered: false,
        });
      }
      e.cooldownMs = MINE_COOLDOWN_MS;
    }

    if (e.behavior === 'laser_trail') {
      const dx = e.x - e.prevX;
      const dy = e.y - e.prevY;
      if (dx * dx + dy * dy > TRAIL_MIN_DIST_SQ && trailSegments.length < MAX_NADIR_TRAIL_SEGMENTS) {
        trailSegments.push({
          x1: e.prevX,
          y1: e.prevY,
          x2: e.x,
          y2: e.y,
          lifeMs: TRAIL_LIFE_MS,
          maxLifeMs: TRAIL_LIFE_MS,
          damage: e.atk * 0.6,
          hit: false,
        });
      }
    }

    if (e.behavior === 'turret' && e.cooldownMs <= 0) {
      if (turretBolts.length < MAX_NADIR_TURRET_BOLTS) {
        const dx = playerX - e.x;
        const dy = playerY - e.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        turretBolts.push({
          x: e.x,
          y: e.y,
          vx: (dx / len) * TURRET_BOLT_SPEED,
          vy: (dy / len) * TURRET_BOLT_SPEED,
          lifeMs: TURRET_BOLT_LIFE_MS,
          damage: e.atk,
          radius: TURRET_BOLT_RADIUS,
        });
      }
      e.cooldownMs = TURRET_COOLDOWN_MS;
    }

    if (e.behavior === 'link_laser' && e.cooldownMs <= 0 && e.linkedIds && e.linkedIds.length > 0) {
      if (linkLasers.length < MAX_NADIR_LINK_LASERS) {
        const targetId = e.linkedIds[Math.floor(((e.pulseMs / 251) % 1) * e.linkedIds.length)]!;
        const target = enemies.find((t) => t.id === targetId && t.hp > 0);
        if (target) {
          linkLasers.push({
            sourceId: e.id,
            targetId: target.id,
            warningMs: LINK_LASER_WARNING_MS,
            activeMs: LINK_LASER_ACTIVE_MS,
            damage: e.atk * 1.5,
            x1: e.x,
            y1: e.y,
            x2: target.x,
            y2: target.y,
          });
        }
      }
      e.cooldownMs = LINK_LASER_COOLDOWN_MS;
    }
  }

  for (let i = linkLasers.length - 1; i >= 0; i--) {
    const ll = linkLasers[i]!;
    const src = enemies.find((e) => e.id === ll.sourceId && e.hp > 0 && e.projectedVisible);
    const tgt = enemies.find((e) => e.id === ll.targetId && e.hp > 0 && e.projectedVisible);
    if (!src || !tgt) {
      linkLasers.splice(i, 1);
      continue;
    }
    ll.x1 = src.x;
    ll.y1 = src.y;
    ll.x2 = tgt.x;
    ll.y2 = tgt.y;

    if (ll.warningMs > 0) {
      ll.warningMs -= deltaMs;
    } else {
      ll.activeMs -= deltaMs;
      if (ll.activeMs <= 0) {
        linkLasers.splice(i, 1);
        continue;
      }
      if (ctx.getPlayerIFramesMs() <= 0) {
        const dSq = distToSegSq(playerX, playerY, ll.x1, ll.y1, ll.x2, ll.y2);
        const hitRadius = LINK_LASER_WIDTH + playerRadius;
        if (dSq <= hitRadius * hitRadius) {
          ctx.dealDamageToPlayer(ll.damage);
          ctx.setPlayerIFramesMs(800);
        }
      }
    }
  }

  for (let i = mines.length - 1; i >= 0; i--) {
    const mine = mines[i]!;
    mine.lifeMs -= deltaMs;
    if (mine.lifeMs <= 0 || mine.triggered) {
      mines.splice(i, 1);
      continue;
    }
    if (ctx.getPlayerIFramesMs() <= 0) {
      const dx = playerX - mine.x;
      const dy = playerY - mine.y;
      const hitRadius = mine.radius + playerRadius;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        ctx.dealDamageToPlayer(mine.damage);
        ctx.setPlayerIFramesMs(600);
        mine.triggered = true;
      }
    }
  }

  for (let i = trailSegments.length - 1; i >= 0; i--) {
    const seg = trailSegments[i]!;
    seg.lifeMs -= deltaMs;
    if (seg.lifeMs <= 0) {
      trailSegments.splice(i, 1);
      continue;
    }
    if (!seg.hit && seg.lifeMs > seg.maxLifeMs * 0.4 && ctx.getPlayerIFramesMs() <= 0) {
      const dSq = distToSegSq(playerX, playerY, seg.x1, seg.y1, seg.x2, seg.y2);
      const hitRadius = 10 + playerRadius;
      if (dSq <= hitRadius * hitRadius) {
        ctx.dealDamageToPlayer(seg.damage);
        ctx.setPlayerIFramesMs(500);
        seg.hit = true;
      }
    }
  }

  const deltaS = deltaMs / 1000;
  for (let i = turretBolts.length - 1; i >= 0; i--) {
    const bolt = turretBolts[i]!;
    bolt.x += bolt.vx * deltaS;
    bolt.y += bolt.vy * deltaS;
    bolt.lifeMs -= deltaMs;
    if (bolt.lifeMs <= 0) {
      turretBolts.splice(i, 1);
      continue;
    }
    const { gameW, gameH } = projState;
    if (bolt.x < -50 || bolt.x > gameW + 50 || bolt.y < -50 || bolt.y > gameH + 50) {
      turretBolts.splice(i, 1);
      continue;
    }
    if (ctx.getPlayerIFramesMs() <= 0) {
      const dx = playerX - bolt.x;
      const dy = playerY - bolt.y;
      const hitRadius = bolt.radius + playerRadius;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        ctx.dealDamageToPlayer(bolt.damage);
        ctx.setPlayerIFramesMs(500);
        turretBolts.splice(i, 1);
      }
    }
  }
}

export function clearNadirCubeEncounter(
  enemies: NadirCubePointEnemy[],
  mines: NadirCubeMine[],
  trailSegments: NadirCubeTrailSegment[],
  turretBolts: NadirCubeTurretBolt[],
  linkLasers: NadirCubeLinkLaser[],
): void {
  enemies.length = 0;
  mines.length = 0;
  trailSegments.length = 0;
  turretBolts.length = 0;
  linkLasers.length = 0;
}
