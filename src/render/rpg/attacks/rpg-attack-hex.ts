/**
 * rpg-attack-hex.ts — Hex-grid crawling lightning bolt attack simulation.
 *
 * Bolts travel along a flat-top hexagonal grid. Before moving to the next cell
 * the bolt enters a warning phase (isWarning=true) showing the target segment
 * as a thin dim line. After the warning countdown the bolt commits and starts
 * travelling. Old segments fade and become non-hazardous after segmentHazardMs.
 */

import type {
  HexAttackInstance, HexBolt,
} from '../rpg-boss-attack-types';
import { createPrng } from '../rpg-boss-attack-types';

// ── Hex grid helpers ──────────────────────────────────────────────────────────

/** Convert flat-top axial hex coordinates to world pixels. */
export function hexToWorld(
  q: number, r: number,
  cellSize: number,
  originX: number, originY: number,
): { x: number; y: number } {
  const x = originX + cellSize * (1.5 * q);
  const y = originY + cellSize * (Math.sqrt(3) * (r + q * 0.5));
  return { x, y };
}

/** Returns the (dq, dr) offset for hex direction 0–5 (flat-top layout). */
export function hexNeighborDir(dir: number): { dq: number; dr: number } {
  const dirs: Array<{ dq: number; dr: number }> = [
    { dq: 1, dr: 0 }, { dq: 1, dr: -1 }, { dq: 0, dr: -1 },
    { dq: -1, dr: 0 }, { dq: -1, dr: 1 }, { dq: 0, dr: 1 },
  ];
  return dirs[((dir % 6) + 6) % 6];
}

// ── Spawn ─────────────────────────────────────────────────────────────────────

export function spawnHexAttack(
  bossX: number,
  _bossY: number,
  dim: { w: number; h: number },
  params: Record<string, number | boolean | string>,
  difficulty: number,
): HexAttackInstance {
  const boltCount  = Math.min(6, (params.boltCount  as number | undefined) ?? 1);
  const cellSize   = (params.cellSize as number | undefined) ?? 26;
  const durationMs = 12000 + difficulty * 400;

  const seed = Math.floor(Math.random() * 0xFFFFFF);
  const rng  = createPrng(seed);

  const originX = dim.w / 2;
  const originY = dim.h / 2;

  const bolts: HexBolt[] = [];
  for (let i = 0; i < boltCount; i++) {
    const hue   = 160 + i * 40;
    const color = `hsl(${hue}, 100%, 70%)`;
    const glow  = `hsl(${hue}, 100%, 85%)`;
    bolts.push({
      qNow: Math.round((bossX - originX) / (cellSize * 1.5)),
      rNow: 0,
      qNext: 0,
      rNext: 0,
      progress: 1,       // start at end of segment → immediately pick next
      speed: 0.0008 + difficulty * 0.00006,
      color,
      glowColor: glow,
      warnTimerMs: 0,
      segments: [],
      isWarning: false,
    });
  }

  return {
    kind: 'hexTrail',
    ageMs: 0,
    durationMs,
    cellSize,
    originX,
    originY,
    bolts,
    maxSegments: 18,
    segmentHazardMs: 1500,
    lingeringTrailMs: 5000,
    difficulty,
    rng,
  };
}

// ── Update ────────────────────────────────────────────────────────────────────

export function updateHexAttack(
  atk: HexAttackInstance,
  playerX: number,
  playerY: number,
  dim: { w: number; h: number },
  deltaMs: number,
): void {
  atk.ageMs += deltaMs;

  for (const bolt of atk.bolts) {
    // Age all segments
    for (const seg of bolt.segments) {
      seg.ageMs      += deltaMs;
      seg.lingeringMs += deltaMs;
    }
    // Remove segments that have lingered too long
    while (bolt.segments.length > 0 && bolt.segments[0].lingeringMs > atk.lingeringTrailMs) {
      bolt.segments.shift();
    }
    // Cap total segments
    while (bolt.segments.length > atk.maxSegments) {
      bolt.segments.shift();
    }

    if (bolt.isWarning) {
      bolt.warnTimerMs -= deltaMs;
      if (bolt.warnTimerMs <= 0) {
        // Commit the move
        bolt.qNow = bolt.qNext;
        bolt.rNow = bolt.rNext;
        bolt.progress = 0;
        bolt.isWarning = false;
      }
      continue;
    }

    bolt.progress += bolt.speed * deltaMs;

    if (bolt.progress >= 1) {
      // Record the completed segment
      const from = hexToWorld(bolt.qNow, bolt.rNow, atk.cellSize, atk.originX, atk.originY);
      const hasNext = bolt.qNext !== bolt.qNow || bolt.rNext !== bolt.rNow;
      const toQ = hasNext ? bolt.qNext : bolt.qNow;
      const toR = hasNext ? bolt.rNext : bolt.rNow;
      const to  = hexToWorld(toQ, toR, atk.cellSize, atk.originX, atk.originY);
      if (bolt.segments.length > 0 || hasNext) {
        bolt.segments.push({
          x1: from.x, y1: from.y,
          x2: to.x,   y2: to.y,
          ageMs: 0,
          hazardMs: atk.segmentHazardMs,
          color: bolt.color,
          lingeringMs: 0,
        });
      }

      // Choose next direction: avoid backtrack, bias toward player
      const playerHex = worldToHex(playerX, playerY, atk.cellSize, atk.originX, atk.originY);
      const dqPlayer  = playerHex.q - bolt.qNow;
      const drPlayer  = playerHex.r - bolt.rNow;
      let bestDir = -1;
      let bestScore = -Infinity;
      for (let d = 0; d < 6; d++) {
        const { dq, dr } = hexNeighborDir(d);
        const nq = bolt.qNow + dq;
        const nr = bolt.rNow + dr;
        // Reject if it would leave a large margin of the screen
        const pos = hexToWorld(nq, nr, atk.cellSize, atk.originX, atk.originY);
        if (pos.x < -atk.cellSize * 2 || pos.x > dim.w + atk.cellSize * 2) continue;
        if (pos.y < -atk.cellSize * 2 || pos.y > dim.h + atk.cellSize * 2) continue;
        const score = (dq * dqPlayer + dr * drPlayer) + atk.rng() * 2.5;
        if (score > bestScore) { bestScore = score; bestDir = d; }
      }
      if (bestDir === -1) bestDir = Math.floor(atk.rng() * 6);
      const { dq, dr } = hexNeighborDir(bestDir);
      bolt.qNext = bolt.qNow + dq;
      bolt.rNext = bolt.rNow + dr;
      bolt.progress = 0;
      bolt.isWarning = true;
      const warnBase = 600;
      bolt.warnTimerMs = warnBase + (1 - Math.min(1, atk.difficulty / 5)) * 400;
    }
  }
}

function worldToHex(
  wx: number, wy: number,
  cellSize: number,
  originX: number, originY: number,
): { q: number; r: number } {
  const q = (wx - originX) / (cellSize * 1.5);
  const r = (wy - originY) / (cellSize * Math.sqrt(3)) - q * 0.5;
  return { q: Math.round(q), r: Math.round(r) };
}

// ── Hazard queries ────────────────────────────────────────────────────────────

export function getHexHazardCapsules(
  atk: HexAttackInstance,
): Array<{ x1: number; y1: number; x2: number; y2: number; r: number; damage: number }> {
  const result: Array<{ x1: number; y1: number; x2: number; y2: number; r: number; damage: number }> = [];
  for (const bolt of atk.bolts) {
    for (const seg of bolt.segments) {
      if (seg.ageMs < seg.hazardMs) {
        result.push({ x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2, r: 4, damage: 10 });
      }
    }
  }
  return result;
}

export function getHexHeadCircles(
  atk: HexAttackInstance,
): Array<{ x: number; y: number; r: number; damage: number }> {
  const result: Array<{ x: number; y: number; r: number; damage: number }> = [];
  for (const bolt of atk.bolts) {
    const pos = hexToWorld(bolt.qNow, bolt.rNow, atk.cellSize, atk.originX, atk.originY);
    result.push({ x: pos.x, y: pos.y, r: 6, damage: 10 });
  }
  return result;
}
