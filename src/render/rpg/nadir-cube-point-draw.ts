/**
 * nadir-cube-point-draw.ts — Draw functions for Nadir cube-point enemies and hazards.
 */

import { NADIR_CUBE_POINT_RADIUS } from './nadir-cube-point-update';
import type {
  NadirCubePointEnemy,
  NadirCubeMine,
  NadirCubeTrailSegment,
  NadirCubeTurretBolt,
  NadirCubeLinkLaser,
} from './nadir-cube-point-types';
import {
  projectNadirWorldPointToGame,
  type NadirCubeProjectionState,
} from '../background/nadir-cube-projection';

let isLowGraphics = false;
export function setNadirCubeLowGraphics(enabled: boolean): void {
  isLowGraphics = enabled;
}

const NADIR_NODE_COLOR = '#ffffff';
const NADIR_NODE_GLOW = 'rgba(80,255,255,0.85)';
const NADIR_MINE_COLOR = '#cc44ff';
const NADIR_MINE_GLOW = 'rgba(160,40,255,0.7)';
const NADIR_TRAIL_COLOR = 'rgba(80,255,200,0.75)';
const NADIR_BOLT_COLOR = '#ff8844';
const NADIR_BOLT_GLOW = 'rgba(255,120,40,0.8)';
const NADIR_WARN_COLOR = 'rgba(255,230,80,0.55)';
const NADIR_LASER_COLOR = 'rgba(80,200,255,0.85)';
const NADIR_HP_BG = 'rgba(0,0,0,0.6)';
const NADIR_HP_FG = '#00ffcc';
const NADIR_HP_FLASH = '#ffffff';

export function drawNadirCubePointEnemies(
  c2d: CanvasRenderingContext2D,
  enemies: NadirCubePointEnemy[],
): void {
  for (const e of enemies) {
    if (!e.projectedVisible || e.hp <= 0) continue;
    drawCubePointNode(c2d, e);
  }
  c2d.globalAlpha = 1;
}

function drawCubePointNode(c2d: CanvasRenderingContext2D, e: NadirCubePointEnemy): void {
  const { x, y, hp, maxHp, hitFlashMs, pulseMs, depthAlpha } = e;
  const pulse = 0.7 + 0.3 * Math.sin(pulseMs / 200);
  const r = NADIR_CUBE_POINT_RADIUS * pulse;
  const alpha = Math.max(0.5, depthAlpha) * pulse;
  const isFlash = hitFlashMs > 0;

  c2d.globalAlpha = alpha;
  if (!isLowGraphics) { c2d.shadowBlur = 18; c2d.shadowColor = isFlash ? '#ffffff' : NADIR_NODE_GLOW; }
  const coreSize = r * 0.55;
  c2d.fillStyle = isFlash ? '#ffffff' : NADIR_NODE_COLOR;
  c2d.fillRect(x - coreSize, y - coreSize, coreSize * 2, coreSize * 2);
  c2d.shadowBlur = 0;
  c2d.strokeStyle = isFlash ? '#ffffff' : NADIR_NODE_GLOW;
  c2d.lineWidth = 1.5;
  c2d.beginPath();
  c2d.arc(x, y, r, 0, Math.PI * 2);
  c2d.stroke();

  const frac = Math.max(0, hp / maxHp);
  const barW = 28; const barH = 4;
  const bx = x - barW / 2;
  const by = y - NADIR_CUBE_POINT_RADIUS - 10;
  c2d.globalAlpha = 0.85;
  c2d.fillStyle = NADIR_HP_BG;
  c2d.fillRect(bx, by, barW, barH);
  c2d.fillStyle = isFlash ? NADIR_HP_FLASH : NADIR_HP_FG;
  c2d.fillRect(bx, by, barW * frac, barH);
  c2d.globalAlpha = 1;
}

export function drawNadirCubeMines(
  c2d: CanvasRenderingContext2D,
  mines: NadirCubeMine[],
): void {
  if (mines.length === 0) return;
  if (!isLowGraphics) { c2d.shadowBlur = 12; c2d.shadowColor = NADIR_MINE_GLOW; }
  c2d.fillStyle = NADIR_MINE_COLOR;
  for (const mine of mines) {
    const lifeFrac = mine.lifeMs / mine.maxLifeMs;
    const pulse = 0.7 + 0.3 * Math.sin(mine.lifeMs / 180);
    c2d.globalAlpha = Math.min(1, lifeFrac * 3) * 0.85 * pulse;
    const s = mine.radius * 0.7 * pulse;
    c2d.beginPath();
    c2d.moveTo(mine.x, mine.y - s);
    c2d.lineTo(mine.x + s, mine.y);
    c2d.lineTo(mine.x, mine.y + s);
    c2d.lineTo(mine.x - s, mine.y);
    c2d.closePath();
    c2d.fill();
  }
  c2d.shadowBlur = 0; c2d.globalAlpha = 1;
}

export function drawNadirCubeTrailSegments(
  c2d: CanvasRenderingContext2D,
  segments: NadirCubeTrailSegment[],
): void {
  if (segments.length === 0) return;
  if (!isLowGraphics) { c2d.shadowBlur = 8; c2d.shadowColor = NADIR_TRAIL_COLOR; }
  c2d.strokeStyle = NADIR_TRAIL_COLOR;
  c2d.lineCap = 'round';
  for (const seg of segments) {
    const lifeFrac = seg.lifeMs / seg.maxLifeMs;
    const alpha = lifeFrac * 0.8;
    if (alpha <= 0) continue;
    c2d.globalAlpha = alpha;
    c2d.lineWidth = 3 * lifeFrac + 1;
    c2d.beginPath();
    c2d.moveTo(seg.x1, seg.y1);
    c2d.lineTo(seg.x2, seg.y2);
    c2d.stroke();
  }
  c2d.shadowBlur = 0; c2d.globalAlpha = 1;
}

export function drawNadirCubeTurretBolts(
  c2d: CanvasRenderingContext2D,
  bolts: NadirCubeTurretBolt[],
): void {
  if (bolts.length === 0) return;
  c2d.globalAlpha = 0.9;
  if (!isLowGraphics) { c2d.shadowBlur = 10; c2d.shadowColor = NADIR_BOLT_GLOW; }
  c2d.fillStyle = NADIR_BOLT_COLOR;
  c2d.beginPath();
  for (const bolt of bolts) {
    c2d.arc(bolt.x, bolt.y, bolt.radius, 0, Math.PI * 2);
  }
  c2d.fill();
  c2d.shadowBlur = 0; c2d.globalAlpha = 1;
}

export function drawNadirCubeLinkLasers(
  c2d: CanvasRenderingContext2D,
  lasers: NadirCubeLinkLaser[],
): void {
  if (lasers.length === 0) return;
  c2d.lineCap = 'round';
  // Active lasers — fixed alpha, same style → batch into one stroke call
  let hasActive = false;
  for (const ll of lasers) { if (ll.warningMs <= 0) { hasActive = true; break; } }
  if (hasActive) {
    c2d.globalAlpha = 0.85;
    if (!isLowGraphics) { c2d.shadowBlur = 14; c2d.shadowColor = NADIR_LASER_COLOR; }
    c2d.strokeStyle = NADIR_LASER_COLOR;
    c2d.lineWidth = 5;
    c2d.beginPath();
    for (const ll of lasers) {
      if (ll.warningMs > 0) continue;
      c2d.moveTo(ll.x1, ll.y1);
      c2d.lineTo(ll.x2, ll.y2);
    }
    c2d.stroke();
    c2d.shadowBlur = 0;
  }
  // Warning lasers — alpha varies per laser, per-laser stroke
  c2d.strokeStyle = NADIR_WARN_COLOR;
  c2d.lineWidth = 2;
  for (const ll of lasers) {
    if (ll.warningMs <= 0) continue;
    c2d.globalAlpha = 0.35 + 0.25 * Math.sin(ll.warningMs / 80);
    c2d.beginPath();
    c2d.moveTo(ll.x1, ll.y1);
    c2d.lineTo(ll.x2, ll.y2);
    c2d.stroke();
  }
  c2d.globalAlpha = 1;
}

export function drawNadirCubeEncounter(
  c2d: CanvasRenderingContext2D,
  enemies: NadirCubePointEnemy[],
  mines: NadirCubeMine[],
  trailSegments: NadirCubeTrailSegment[],
  turretBolts: NadirCubeTurretBolt[],
  linkLasers: NadirCubeLinkLaser[],
  projectionState: NadirCubeProjectionState | null = null,
  drawDebugAnchors = false,
): void {
  if (mines.length > 0) drawNadirCubeMines(c2d, mines);
  if (trailSegments.length > 0) drawNadirCubeTrailSegments(c2d, trailSegments);
  if (linkLasers.length > 0) drawNadirCubeLinkLasers(c2d, linkLasers);
  if (turretBolts.length > 0) drawNadirCubeTurretBolts(c2d, turretBolts);
  if (enemies.length > 0) drawNadirCubePointEnemies(c2d, enemies);
  if (drawDebugAnchors && projectionState) drawNadirCubeAnchorDebug(c2d, enemies, projectionState);
}

function drawNadirCubeAnchorDebug(
  c2d: CanvasRenderingContext2D,
  enemies: NadirCubePointEnemy[],
  projectionState: NadirCubeProjectionState,
): void {
  c2d.save();
  c2d.lineWidth = 1;
  for (const e of enemies) {
    if (!e.projectedVisible || e.hp <= 0) continue;
    const projected = projectNadirWorldPointToGame(e.anchorX, e.anchorY, e.anchorZ, projectionState);
    if (!projected) continue;
    const x = projected.sx;
    const y = projected.sy;

    c2d.strokeStyle = 'rgba(255,255,255,0.9)';
    c2d.beginPath();
    c2d.moveTo(x - 2, y);
    c2d.lineTo(x + 2, y);
    c2d.moveTo(x, y - 2);
    c2d.lineTo(x, y + 2);
    c2d.stroke();

    const dx = e.x - x;
    const dy = e.y - y;
    if (dx * dx + dy * dy > 1) {
      c2d.strokeStyle = 'rgba(255,80,80,0.85)';
      c2d.beginPath();
      c2d.moveTo(x, y);
      c2d.lineTo(e.x, e.y);
      c2d.stroke();
    }
  }
  c2d.restore();
}
