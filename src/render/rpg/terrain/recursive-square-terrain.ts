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
  /** HSL hue (0–360), stored for enemy-proximity gradient blending. */
  strokeHue: number;
  /** HSL saturation (0–100), stored for enemy-proximity gradient blending. */
  strokeSat: number;
  /** HSL lightness (0–100), stored for enemy-proximity gradient blending. */
  strokeLit: number;
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

// ── Enemy-proximity gradient types ───────────────────────────────────────────

/**
 * A single enemy position and its RGB colour, used by the proximity-gradient
 * edge rendering system to tint square edges when enemies are nearby.
 */
export interface EnemyInfluencePoint {
  x: number;
  y: number;
  /** Red channel 0–255. */
  r: number;
  /** Green channel 0–255. */
  g: number;
  /** Blue channel 0–255. */
  b: number;
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

// ── Enemy-proximity gradient helpers ─────────────────────────────────────────

/**
 * Distance within which an enemy influences square edge colours.
 * Covers a root square's full extent (halfSize up to 55, bounding radius ~78)
 * plus enough margin so enemies approaching from off-screen tint edges early.
 */
const ENEMY_INFLUENCE_RADIUS_PX = 120;

/**
 * Multiplier applied to total enemy weight before clamping to [0, 1].
 * >1 makes the colour shift respond faster as enemies approach.
 */
const ENEMY_INFLUENCE_AMPLIFY = 1.8;

/** Number of colour stops per edge when rendering proximity gradients (odd → symmetric). */
const GRADIENT_STOPS = 5;

/** Pre-computed t-positions for gradient stops. */
const GRADIENT_T: readonly number[] = [0, 0.25, 0.5, 0.75, 1.0];

/**
 * Converts HSL (h 0-360, s 0-100, l 0-100) to integer RGB [0-255].
 * Standard algorithm, no external dependencies.
 */
function hslToRgb255(h: number, s: number, l: number): [number, number, number] {
  const sn = s / 100;
  const ln = l / 100;
  const C = (1 - Math.abs(2 * ln - 1)) * sn;
  const X = C * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - C / 2;
  let r = 0, g = 0, b = 0;
  if      (h < 60)  { r = C; g = X; }
  else if (h < 120) { r = X; g = C; }
  else if (h < 180) { g = C; b = X; }
  else if (h < 240) { g = X; b = C; }
  else if (h < 300) { r = X; b = C; }
  else              { r = C; b = X; }
  return [((r + m) * 255 + 0.5) | 0, ((g + m) * 255 + 0.5) | 0, ((b + m) * 255 + 0.5) | 0];
}

/**
 * Computes the enemy-influenced RGBA colour string at world position (px, py).
 *
 * @param origR/G/B  Original square-edge RGB (from its HSL stroke colour).
 * @param nodeAlpha  The per-node global alpha (growth animation + depth fade).
 * @param enemies    Nearby enemy influence points.
 */
function influencedColorAt(
  px: number, py: number,
  origR: number, origG: number, origB: number,
  nodeAlpha: number,
  enemies: EnemyInfluencePoint[],
): string {
  const radiusPx = ENEMY_INFLUENCE_RADIUS_PX;
  let totalW = 0;
  let sumR = 0, sumG = 0, sumB = 0;
  for (let ei = 0; ei < enemies.length; ei++) {
    const e = enemies[ei];
    const dx = px - e.x, dy = py - e.y;
    const distSq = dx * dx + dy * dy;
    if (distSq >= radiusPx * radiusPx) continue;
    const w = (1 - Math.sqrt(distSq) / radiusPx) ** 2;
    totalW += w;
    sumR += w * e.r;
    sumG += w * e.g;
    sumB += w * e.b;
  }
  let r = origR, g = origG, b = origB;
  if (totalW > 0) {
    const blend = clamp01(totalW * ENEMY_INFLUENCE_AMPLIFY);
    const invW = 1 / totalW;
    r = (origR + blend * (sumR * invW - origR) + 0.5) | 0;
    g = (origG + blend * (sumG * invW - origG) + 0.5) | 0;
    b = (origB + blend * (sumB * invW - origB) + 0.5) | 0;
  }
  // Use 2-decimal alpha to avoid creating too many unique strings.
  return `rgba(${r},${g},${b},${nodeAlpha.toFixed(2)})`;
}

/**
 * Draws a single edge (ax,ay)→(bx,by) with a multi-stop linear gradient
 * that blends the square's original HSL colour with nearby enemy colours.
 */
function renderEdgeGradient(
  ctx: CanvasRenderingContext2D,
  ax: number, ay: number, bx: number, by: number,
  origR: number, origG: number, origB: number,
  nodeAlpha: number,
  lineWidth: number,
  enemies: EnemyInfluencePoint[],
): void {
  const grad = ctx.createLinearGradient(ax, ay, bx, by);
  for (let si = 0; si < GRADIENT_STOPS; si++) {
    const t = GRADIENT_T[si];
    const px = ax + t * (bx - ax);
    const py = ay + t * (by - ay);
    grad.addColorStop(t, influencedColorAt(px, py, origR, origG, origB, nodeAlpha, enemies));
  }
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = grad;
  ctx.stroke();
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

  function makeStrokeColor(depth: number, hueJitter: number): { color: string; hue: number; sat: number; lit: number } {
    const hue = (((baseHue + hueJitter) % 360) + 360) % 360;
    const sat = baseSat;
    const lit = DEPTH_LIGHTNESS_PERCENT[Math.min(depth, DEPTH_LIGHTNESS_PERCENT.length - 1)];
    return { color: `hsl(${hue | 0}, ${sat}%, ${lit}%)`, hue, sat, lit };
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
    const sc = makeStrokeColor(depth, hueJitter);
    const node: RecursiveSquareNode = {
      id, cx, cy, halfSize, angleRad, depth,
      strokeColor: sc.color,
      strokeHue: sc.hue,
      strokeSat: sc.sat,
      strokeLit: sc.lit,
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
 * When `enemies` is provided and non-empty, each square edge is drawn with a
 * multi-stop linear gradient that blends the edge's original colour toward the
 * colours of nearby enemies, creating smooth proximity-based glow effects.
 * When no enemies are supplied (or the array is empty) the original solid-
 * colour rendering path is used unchanged.
 *
 * Assumes the terrain is NOT in 'hidden' phase (caller's responsibility).
 */
export function renderRecursiveSquareTerrain(
  ctx: CanvasRenderingContext2D,
  squareNodes: RecursiveSquareNode[],
  squareMaxDepth: number,
  growth01: number,
  enemies?: EnemyInfluencePoint[],
): void {
  ctx.save();
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'square';

  const useGradients = enemies !== undefined && enemies.length > 0;

  for (const node of squareNodes) {
    const alpha01 = getSquareNodeGrowthAlpha01(node.depth, squareMaxDepth, growth01);
    if (alpha01 <= 0) continue;

    const corners = node.corners;

    // ── Interior fill (dark tint) — same regardless of gradient mode. ─────────
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.closePath();
    ctx.globalAlpha = node.fillAlpha * alpha01;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fill();

    if (!useGradients) {
      // ── Original solid-colour rendering path ─────────────────────────────────

      // Glow pass (wider, low alpha) for shallow nodes.
      if (node.depth <= 1) {
        ctx.globalAlpha = 0.06 * alpha01;
        ctx.lineWidth = node.lineWidth * 3;
        ctx.strokeStyle = node.strokeColor;
        ctx.stroke();
      }

      // Crisp outline.
      ctx.globalAlpha = (0.75 + 0.25 * (1 - node.depth / (squareMaxDepth || 1))) * alpha01;
      ctx.lineWidth = node.lineWidth;
      ctx.strokeStyle = node.strokeColor;
      ctx.stroke();

      // Corner accent dots on root squares.
      if (node.depth === 0) {
        ctx.globalAlpha = 0.5 * alpha01;
        ctx.fillStyle = node.strokeColor;
        for (const corner of corners) {
          ctx.beginPath();
          ctx.arc(corner.x, corner.y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      // ── Gradient-edge rendering path ─────────────────────────────────────────
      const [origR, origG, origB] = hslToRgb255(node.strokeHue, node.strokeSat, node.strokeLit);
      const outlineAlpha = (0.75 + 0.25 * (1 - node.depth / (squareMaxDepth || 1))) * alpha01;

      // Glow pass (wider, low alpha) for shallow nodes — also gradient.
      if (node.depth <= 1) {
        ctx.globalAlpha = 1; // alpha baked into gradient stop colours
        const glowAlpha = 0.06 * alpha01;
        const glowLw = node.lineWidth * 3;
        for (let ci = 0; ci < 4; ci++) {
          const a = corners[ci];
          const b = corners[(ci + 1) % 4];
          renderEdgeGradient(ctx, a.x, a.y, b.x, b.y, origR, origG, origB, glowAlpha, glowLw, enemies!);
        }
      }

      // Crisp gradient outline — one gradient per edge.
      ctx.globalAlpha = 1; // alpha baked into gradient stop colours
      for (let ci = 0; ci < 4; ci++) {
        const a = corners[ci];
        const b = corners[(ci + 1) % 4];
        renderEdgeGradient(ctx, a.x, a.y, b.x, b.y, origR, origG, origB, outlineAlpha, node.lineWidth, enemies!);
      }

      // Corner accent dots on root squares — influenced colour at each corner.
      if (node.depth === 0) {
        ctx.globalAlpha = 1;
        for (const corner of corners) {
          const dotColor = influencedColorAt(corner.x, corner.y, origR, origG, origB, 0.5 * alpha01, enemies!);
          ctx.fillStyle = dotColor;
          ctx.beginPath();
          ctx.arc(corner.x, corner.y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  ctx.restore();
}
