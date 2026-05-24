/**
 * recursive-square-terrain.ts — Procedural recursive-square terrain variant.
 *
 * Generates chains of branching rotated squares that partially protrude from
 * each other's sides, creating a crystalline geometric terrain effect.
 *
 * A "node" is one rotated square.  Root nodes are large; children grow
 * progressively smaller and dimmer with increasing depth.  All corners are
 * precomputed in world space at generation time — no per-frame geometry work.
 *
 * Integration notes:
 * - Generation is seeded and deterministic per wave/canvas size.
 * - Animation: squares pop in depth-by-depth as the terrain's growth01 increases.
 *   There is no radial centroid scaling — squares appear at full size and
 *   fade in via canvas globalAlpha.
 * - Collision: a square is active when its depth-adjusted growth fraction > 0.
 *   See getSquareNodeGrowthAlpha01() and getActiveSquarePolygons().
 * - Boss waves must never generate this (or any) wave terrain; see rpg-render.ts.
 */

import { createSeededRng } from './topographic-terrain';
import type { TopographicTerrainPoint } from './topographic-terrain';

// ── Node definition ───────────────────────────────────────────────────────────

/**
 * One rotated square in the terrain.  Squares form a tree (root → children)
 * but are also stored as a flat array for efficient collision iteration.
 */
export interface RecursiveSquareNode {
  id: string;
  /** World-space centre. */
  cx: number;
  cy: number;
  /** Half side-length in pixels. */
  halfSize: number;
  /** Rotation in radians. */
  angleRad: number;
  /** Tree depth (0 = root square). */
  depth: number;
  /** Pre-computed HSL stroke color string. */
  strokeColor: string;
  /** Fill alpha (0–1).  Decreases with depth for readability. */
  fillAlpha: number;
  /** Stroke line width in pixels. */
  lineWidth: number;
  /**
   * Bounding radius for fast collision pre-reject.
   * Equals halfSize * √2 (the circumscribed circle of the square).
   */
  boundingRadius: number;
  /** Four corners in world space (clockwise), precomputed at generation. */
  corners: TopographicTerrainPoint[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ROOT_HALF_SIZE_MIN = 28;
const ROOT_HALF_SIZE_MAX = 55;
/** Maximum recursion depth.  0 = root only. */
const MAX_DEPTH = 4;
const CHILD_SIZE_RATIO_MIN = 0.42;
const CHILD_SIZE_RATIO_MAX = 0.72;
/**
 * How far the child centre is from the parent edge, expressed as a fraction
 * of childHalfSize.  Range [0.35, 0.85]: 0.35 = heavily overlapping, 0.85 =
 * mostly detached.  Matches the problem specification.
 */
const OVERLAP_MIN = 0.35;
const OVERLAP_MAX = 0.85;
/** Maximum ±angle difference of a child relative to its parent. */
const CHILD_ANGLE_JITTER_RAD = 0.65;
/** Attachment parameter along parent side: ±fraction of parentHalfSize. */
const SIDE_PARAM_MIN = -0.35;
const SIDE_PARAM_MAX = 0.35;
const MAX_ROOT_SQUARES = 3;
/** Exclusion radius around the player start position (canvas centre). */
const PLAYER_SAFE_RADIUS = 70;
const EDGE_MARGIN = 30;
const MAX_ROOT_PLACEMENT_ATTEMPTS = 15;

/** HSL lightness decreases with depth: [root, d1, d2, d3, d4]. */
const DEPTH_LIGHTNESS_PERCENT = [70, 58, 47, 38, 30];
/** Fill alpha (interior tint) decreases with depth. */
const DEPTH_FILL_ALPHA = [0.22, 0.16, 0.12, 0.09, 0.07];
/** Stroke line width decreases with depth. */
const DEPTH_LINE_WIDTH = [1.8, 1.4, 1.1, 0.9, 0.75];

/**
 * Base hues used for square terrain.  Selected per-wave via
 * waveNumber % BASE_HUES.length.
 */
const BASE_HUES = [260, 200, 280, 40, 160, 340];

// ── Geometry helpers (local to this module) ───────────────────────────────────

function computeCorners(
  cx: number,
  cy: number,
  halfSize: number,
  angle: number,
): TopographicTerrainPoint[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // Local corner offsets: ±halfSize on both axes
  const signs: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const corners: TopographicTerrainPoint[] = new Array(4);
  for (let i = 0; i < 4; i++) {
    const [sx, sy] = signs[i];
    const lx = sx * halfSize;
    const ly = sy * halfSize;
    corners[i] = {
      x: cx + lx * cos - ly * sin,
      y: cy + lx * sin + ly * cos,
    };
  }
  return corners;
}

/**
 * Computes a child square's world-space centre given the parent node, which
 * side the child attaches to, attachment position along the side, child half-
 * size, and overlap factor.
 *
 * The child centre is placed at:
 *   parentCentre + N * (parentHalfSize + childHalfSize * overlapFactor)
 *                + T * (sideParam * parentHalfSize)
 *
 * where N is the outward normal and T is the along-edge tangent of the chosen
 * side, expressed in the PARENT's rotated frame.
 *
 * overlapFactor ∈ [0.35, 0.85]:
 *   0.35 → child is 35% outside parent edge (heavy overlap)
 *   0.85 → child is 85% outside parent edge (light overlap)
 */
function computeChildCentre(
  parent: RecursiveSquareNode,
  side: number,          // 0=top, 1=right, 2=bottom, 3=left (parent-local)
  sideParam: number,     // attachment pos along side: ±fraction of parentHalfSize
  childHalfSize: number,
  overlapFactor: number, // 0.35–0.85
): { cx: number; cy: number } {
  const phs = parent.halfSize;
  const cos = Math.cos(parent.angleRad);
  const sin = Math.sin(parent.angleRad);

  // Parent-local outward normal and along-edge tangent for each side:
  let nx: number, ny: number, tx: number, ty: number;
  switch (side) {
    case 0: nx = 0;  ny = -1; tx = 1;  ty = 0;  break;   // top
    case 1: nx = 1;  ny = 0;  tx = 0;  ty = 1;  break;   // right
    case 2: nx = 0;  ny = 1;  tx = -1; ty = 0;  break;   // bottom
    default: nx = -1; ny = 0;  tx = 0;  ty = -1; break;  // left
  }

  // Child centre in parent-local space:
  const localX = nx * (phs + childHalfSize * overlapFactor) + tx * (sideParam * phs);
  const localY = ny * (phs + childHalfSize * overlapFactor) + ty * (sideParam * phs);

  // Transform to world space using parent's rotation:
  return {
    cx: parent.cx + localX * cos - localY * sin,
    cy: parent.cy + localX * sin + localY * cos,
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ── Generation ────────────────────────────────────────────────────────────────

/**
 * Generates a tree of recursive squares for one wave.  Returns a flat array
 * of all nodes (parent before children) for easy collision iteration.
 *
 * Deterministic: given the same seed, waveNumber, and canvas size, the output
 * is identical.
 */
export function generateRecursiveSquareTerrain(
  seed: number,
  waveNumber: number,
  canvasW: number,
  canvasH: number,
): RecursiveSquareNode[] {
  const rng = createSeededRng((seed ^ 0xfade5678) >>> 0);

  const hueIdx = Math.abs(waveNumber) % BASE_HUES.length;
  const baseHue = BASE_HUES[hueIdx];
  const baseSat = 55 + Math.floor(rng() * 26); // 55–80 %

  const playerSafeX = canvasW * 0.5;
  const playerSafeY = canvasH * 0.5;

  const allNodes: RecursiveSquareNode[] = [];
  let nodeIdCounter = 0;

  function makeStrokeColor(depth: number, hueJitter: number): string {
    const hue = (((baseHue + hueJitter) % 360) + 360) % 360;
    const sat = baseSat;
    const lit = DEPTH_LIGHTNESS_PERCENT[Math.min(depth, DEPTH_LIGHTNESS_PERCENT.length - 1)];
    return `hsl(${hue | 0}, ${sat}%, ${lit}%)`;
  }

  function buildNode(
    cx: number,
    cy: number,
    halfSize: number,
    angleRad: number,
    depth: number,
    blockedSide: number, // side opposite to parent attachment (avoid going back)
  ): RecursiveSquareNode {
    const id = `sq-${nodeIdCounter++}`;
    const hueJitter = (rng() - 0.5) * 20; // ±10 degrees
    const corners = computeCorners(cx, cy, halfSize, angleRad);
    const node: RecursiveSquareNode = {
      id, cx, cy, halfSize, angleRad, depth,
      strokeColor: makeStrokeColor(depth, hueJitter),
      fillAlpha: DEPTH_FILL_ALPHA[Math.min(depth, DEPTH_FILL_ALPHA.length - 1)],
      lineWidth: DEPTH_LINE_WIDTH[Math.min(depth, DEPTH_LINE_WIDTH.length - 1)],
      boundingRadius: halfSize * Math.SQRT2,
      corners,
    };
    allNodes.push(node);

    if (depth >= MAX_DEPTH) return node;

    // Available sides: exclude the side the parent attached from (goes backward).
    const availableSides = [0, 1, 2, 3].filter(s => s !== blockedSide);

    // Child count: fewer at deeper levels for a tree-like taper.
    const maxChildren = depth === 0 ? 3 : depth === 1 ? 2 : 1;
    const childCount = Math.floor(rng() * (maxChildren + 1));

    // Shuffle available sides so child assignments are varied.
    for (let k = availableSides.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [availableSides[k], availableSides[j]] = [availableSides[j], availableSides[k]];
    }

    for (let i = 0; i < childCount && i < availableSides.length; i++) {
      const side = availableSides[i];
      const sideParam = SIDE_PARAM_MIN + rng() * (SIDE_PARAM_MAX - SIDE_PARAM_MIN);
      const childHalfSize = halfSize * (CHILD_SIZE_RATIO_MIN + rng() * (CHILD_SIZE_RATIO_MAX - CHILD_SIZE_RATIO_MIN));
      const overlapFactor = OVERLAP_MIN + rng() * (OVERLAP_MAX - OVERLAP_MIN);
      const childAngle = angleRad + (rng() - 0.5) * 2 * CHILD_ANGLE_JITTER_RAD;

      const { cx: ccx, cy: ccy } = computeChildCentre(node, side, sideParam, childHalfSize, overlapFactor);

      // Reject child positions too close to player safe zone.
      const pdx = ccx - playerSafeX, pdy = ccy - playerSafeY;
      if (pdx * pdx + pdy * pdy < PLAYER_SAFE_RADIUS * PLAYER_SAFE_RADIUS) continue;

      // Reject child positions out of canvas bounds (bounding-circle check).
      if (ccx - childHalfSize < EDGE_MARGIN || ccx + childHalfSize > canvasW - EDGE_MARGIN ||
          ccy - childHalfSize < EDGE_MARGIN || ccy + childHalfSize > canvasH - EDGE_MARGIN) continue;

      // The child's side that faces back toward the parent is the opposite side.
      const oppositeSide = (side + 2) % 4;
      buildNode(ccx, ccy, childHalfSize, childAngle, depth + 1, oppositeSide);
    }

    return node;
  }

  const rootCount = 1 + Math.floor(rng() * MAX_ROOT_SQUARES);
  for (let ri = 0; ri < rootCount; ri++) {
    const halfSize = ROOT_HALF_SIZE_MIN + rng() * (ROOT_HALF_SIZE_MAX - ROOT_HALF_SIZE_MIN);
    for (let attempt = 0; attempt < MAX_ROOT_PLACEMENT_ATTEMPTS; attempt++) {
      const cx = EDGE_MARGIN + halfSize + rng() * (canvasW - 2 * (EDGE_MARGIN + halfSize));
      const cy = EDGE_MARGIN + halfSize + rng() * (canvasH - 2 * (EDGE_MARGIN + halfSize));
      // Reject root inside player safe zone.
      const pdx = cx - playerSafeX, pdy = cy - playerSafeY;
      if (pdx * pdx + pdy * pdy < PLAYER_SAFE_RADIUS * PLAYER_SAFE_RADIUS) continue;
      const angle = rng() * Math.PI * 2;
      buildNode(cx, cy, halfSize, angle, 0, -1);
      break;
    }
  }

  return allNodes;
}

// ── Growth animation ──────────────────────────────────────────────────────────

/**
 * Returns the animation alpha (0–1) for a single node given the terrain's
 * current growth01 value.
 *
 * Deeper nodes appear later in the animation sequence (parent before children),
 * giving a "branching growth" effect.  During shrink, deeper nodes disappear
 * first.
 *
 * @param depth        The node's depth (0 = root).
 * @param squareMaxDepth  The maximum depth in the entire tree.
 * @param growth01     The terrain's current growth01 (0 = new, 1 = fully grown).
 */
export function getSquareNodeGrowthAlpha01(
  depth: number,
  squareMaxDepth: number,
  growth01: number,
): number {
  // Each depth level activates over a fraction of the total grow duration.
  const steps = squareMaxDepth + 2;  // +2 so the last depth has room to fade in
  const stepSize = 1 / steps;
  const startFrac = depth * stepSize;
  return clamp01((growth01 - startFrac) / stepSize);
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * Renders all nodes in the terrain's squareNodes array.
 *
 * Assumes the terrain is NOT in 'hidden' phase (caller's responsibility).
 */
export function renderRecursiveSquareTerrain(
  ctx: CanvasRenderingContext2D,
  squareNodes: RecursiveSquareNode[],
  squareMaxDepth: number,
  growth01: number,
): void {
  ctx.save();
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'square';

  for (const node of squareNodes) {
    const alpha01 = getSquareNodeGrowthAlpha01(node.depth, squareMaxDepth, growth01);
    if (alpha01 <= 0) continue;

    const corners = node.corners;

    // Draw interior fill (dark tint).
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.closePath();
    ctx.globalAlpha = node.fillAlpha * alpha01;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fill();

    // Optional: very subtle glow pass (wider, low alpha).
    if (node.depth <= 1) {
      ctx.globalAlpha = 0.06 * alpha01;
      ctx.lineWidth = node.lineWidth * 3;
      ctx.strokeStyle = node.strokeColor;
      ctx.stroke();
    }

    // Draw crisp outline.
    ctx.globalAlpha = (0.75 + 0.25 * (1 - node.depth / (squareMaxDepth || 1))) * alpha01;
    ctx.lineWidth = node.lineWidth;
    ctx.strokeStyle = node.strokeColor;
    ctx.stroke();

    // Tiny corner accent dots on root and depth-1 squares.
    if (node.depth === 0) {
      ctx.globalAlpha = 0.5 * alpha01;
      ctx.fillStyle = node.strokeColor;
      for (const corner of corners) {
        ctx.beginPath();
        ctx.arc(corner.x, corner.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();
}
