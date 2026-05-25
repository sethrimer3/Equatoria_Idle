/**
 * rpg-verdure-render.ts — Visual rendering for the Verdure zone hazard system.
 *
 * Renders two distinct layers:
 *   1. Edge rock formations (drawVerdureEdgeRocks)
 *      Natural-looking rocky frames around the perimeter of the Verdure arena.
 *      Generated deterministically from module-level seed data — call once and
 *      cache; geometry is the same every frame.
 *
 *   2. Procedural plant visuals (drawVerdurePlants)
 *      Renders each active VerdurePlant with its type-specific visual:
 *        vine    — curved stem with branches
 *        spiral  — curling tendril with flower at tip
 *        flower  — vine with bioluminescent flower nodes
 *        leafy   — thick stem with leaf ellipses along the body
 *        thorn   — angular stem with small spike protrusions
 *      Plants render only their grown portion (0..growthProgress).
 *      Dead plants fade out.
 *      Targetable plants receive a subtle highlight glow.
 *
 *   3. Death fragments (drawVerdureFragments)
 *      Leaf/petal particles ejected on plant destruction.
 *
 * All canvas state changes are wrapped in save/restore.
 * shadowBlur is always reset before returning to avoid expensive bleed.
 */

import type { VerdurePlant, VerdureBranch, VerdureFragment } from './rpg-verdure-growth';
import { _evalPathAt, _evalTangentAt } from './rpg-verdure-growth';

// ── Rock formation seed data ───────────────────────────────────────────────────

/**
 * Pre-baked seeds for edge rock polygon generation.
 * One row per rock: [edgeFrac, perpOffset, sizeW, sizeH, rotAngle, alpha, edgeId].
 * edgeId: 0=top 1=bottom 2=left 3=right
 */
const _ROCK_DATA: readonly (readonly number[])[] = [
  // Top edge rocks
  [ 0.04, 0.65,  28, 18, 0.20, 0.85, 0 ],
  [ 0.12, 0.50,  22, 14, 0.45, 0.80, 0 ],
  [ 0.20, 0.80,  32, 20, 0.10, 0.82, 0 ],
  [ 0.32, 0.55,  18, 12, 0.60, 0.78, 0 ],
  [ 0.44, 0.70,  25, 16, 0.30, 0.84, 0 ],
  [ 0.58, 0.60,  30, 19, 0.55, 0.81, 0 ],
  [ 0.70, 0.75,  21, 13, 0.15, 0.79, 0 ],
  [ 0.82, 0.50,  27, 17, 0.40, 0.83, 0 ],
  [ 0.92, 0.65,  23, 15, 0.25, 0.80, 0 ],
  // Bottom edge rocks
  [ 0.06, 0.60,  26, 17, 0.35, 0.85, 1 ],
  [ 0.18, 0.75,  30, 20, 0.50, 0.82, 1 ],
  [ 0.30, 0.55,  20, 13, 0.20, 0.80, 1 ],
  [ 0.42, 0.80,  34, 22, 0.65, 0.83, 1 ],
  [ 0.55, 0.60,  24, 16, 0.10, 0.81, 1 ],
  [ 0.68, 0.70,  28, 18, 0.45, 0.84, 1 ],
  [ 0.80, 0.55,  22, 14, 0.30, 0.79, 1 ],
  [ 0.91, 0.65,  19, 12, 0.55, 0.82, 1 ],
  // Left edge rocks
  [ 0.08, 0.70,  17, 26, 0.15, 0.83, 2 ],
  [ 0.20, 0.55,  14, 22, 0.50, 0.81, 2 ],
  [ 0.34, 0.75,  20, 30, 0.30, 0.84, 2 ],
  [ 0.50, 0.60,  15, 24, 0.60, 0.80, 2 ],
  [ 0.65, 0.80,  18, 28, 0.20, 0.82, 2 ],
  [ 0.78, 0.55,  13, 21, 0.45, 0.79, 2 ],
  [ 0.90, 0.70,  16, 25, 0.35, 0.83, 2 ],
  // Right edge rocks
  [ 0.10, 0.65,  18, 27, 0.40, 0.84, 3 ],
  [ 0.24, 0.75,  15, 23, 0.55, 0.80, 3 ],
  [ 0.38, 0.60,  21, 32, 0.25, 0.83, 3 ],
  [ 0.52, 0.80,  16, 25, 0.15, 0.81, 3 ],
  [ 0.66, 0.55,  19, 29, 0.50, 0.84, 3 ],
  [ 0.79, 0.70,  14, 22, 0.35, 0.80, 3 ],
  [ 0.92, 0.65,  17, 26, 0.60, 0.82, 3 ],
];

/** Pre-baked seed values used for organic cave wall contour generation. */
const _SEEDS: readonly number[] = [
  0.137, 0.462, 0.718, 0.293, 0.851,
  0.574, 0.039, 0.926, 0.381, 0.665,
  0.208, 0.743, 0.517, 0.084, 0.953,
  0.671, 0.342, 0.119, 0.889, 0.456,
];

// Pre-baked 8-gon offsets (2 sets of slightly different irregular polygons)
const _POLY_ANGLES_A = [0, 0.85, 1.72, 2.48, 3.30, 4.20, 5.10, 5.90];
const _POLY_RADII_A  = [1.00, 0.82, 0.95, 0.78, 1.05, 0.88, 0.92, 0.85];
const _POLY_ANGLES_B = [0, 0.78, 1.60, 2.55, 3.45, 4.15, 5.00, 6.00];
const _POLY_RADII_B  = [0.95, 1.05, 0.80, 0.98, 0.85, 1.02, 0.88, 0.78];

// ── Rock colour palette (mossy browns / dark earthy greens) ───────────────────

const _ROCK_FILL_COLORS: readonly string[] = [
  '#2c2417',  // dark earthy brown
  '#1e1a10',  // very dark forest floor
  '#31280e',  // mossy brown
  '#1a2210',  // dark mossy green
  '#252015',  // warm dark brown
];

const _ROCK_MOSS_COLORS: readonly string[] = [
  '#223318',   // dark moss
  '#1a2b10',   // deep moss
  '#2a4020',   // mid moss
  '#182a10',   // forest moss
];

const _ROCK_HIGHLIGHT_COLOR = 'rgba(80,70,50,0.35)';

// ── Plant colour palettes ──────────────────────────────────────────────────────

const _VINE_COLORS: readonly string[] = [
  '#2d6628',   // mid forest green
  '#1e4d1b',   // deep forest
  '#3a7832',   // brighter green
  '#245020',   // muted green
  '#1a3d18',   // dark forest
];

const _LEAF_COLORS: readonly string[] = [
  '#2a5c22',
  '#3a7828',
  '#1e4a18',
  '#306030',
];

const _FLOWER_COLORS: readonly string[] = [
  '#55ff80',   // bioluminescent green
  '#90ff60',   // chartreuse
  '#50ffcc',   // teal glow
  '#ffcc55',   // warm yellow
  '#ff88aa',   // pale rose
];

const _FRAGMENT_COLORS: readonly string[] = [
  '#3a6e28',
  '#2a5420',
  '#4a8830',
  '#55aa38',
];

const _THORN_COLOR       = '#4a3820';
const _SPIRAL_TIP_COLOR  = '#44dd60';
const _TARGETABLE_GLOW   = '#80ff80';

// ── Edge rock rendering ────────────────────────────────────────────────────────

/**
 * Draw connected cave wall masses around all four arena edges.
 *
 * Replaces the isolated small rock approach with overlapping filled bands
 * that look like natural cave/rock walls.
 *
 * Call once per frame before enemies and player are drawn.
 */
export function drawVerdureEdgeRocks(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  lowGraphics: boolean,
): void {
  canvas2d.save();

  // ── Step 1: Solid base wall bands (connected silhouettes) ────────────────
  // Each edge gets a solid dark band that is the foundation of the cave wall.
  // Band depth varies with a pre-baked profile to create an organic silhouette.

  const BASE_DEPTH = 22;

  // Top wall
  canvas2d.fillStyle = _ROCK_FILL_COLORS[1];
  canvas2d.globalAlpha = 0.92;
  canvas2d.beginPath();
  canvas2d.moveTo(0, 0);
  // Irregular inward contour using pre-baked seeds
  for (let xi = 0; xi <= widthPx; xi += 8) {
    const frac = xi / widthPx;
    const idx  = Math.floor(frac * (_SEEDS.length - 1));
    const s    = _SEEDS[idx % _SEEDS.length];
    const depth = BASE_DEPTH + s * 14;
    canvas2d.lineTo(xi, depth);
  }
  canvas2d.lineTo(widthPx, 0);
  canvas2d.closePath();
  canvas2d.fill();

  // Bottom wall
  canvas2d.fillStyle = _ROCK_FILL_COLORS[2];
  canvas2d.globalAlpha = 0.92;
  canvas2d.beginPath();
  canvas2d.moveTo(0, heightPx);
  for (let xi = 0; xi <= widthPx; xi += 8) {
    const frac = xi / widthPx;
    const idx  = Math.floor(frac * (_SEEDS.length - 1));
    const s    = _SEEDS[(idx + 5) % _SEEDS.length];
    const depth = BASE_DEPTH + s * 14;
    canvas2d.lineTo(xi, heightPx - depth);
  }
  canvas2d.lineTo(widthPx, heightPx);
  canvas2d.closePath();
  canvas2d.fill();

  // Left wall
  canvas2d.fillStyle = _ROCK_FILL_COLORS[0];
  canvas2d.globalAlpha = 0.92;
  canvas2d.beginPath();
  canvas2d.moveTo(0, 0);
  for (let yi = 0; yi <= heightPx; yi += 8) {
    const frac = yi / heightPx;
    const idx  = Math.floor(frac * (_SEEDS.length - 1));
    const s    = _SEEDS[(idx + 10) % _SEEDS.length];
    const depth = BASE_DEPTH + s * 12;
    canvas2d.lineTo(depth, yi);
  }
  canvas2d.lineTo(0, heightPx);
  canvas2d.closePath();
  canvas2d.fill();

  // Right wall
  canvas2d.fillStyle = _ROCK_FILL_COLORS[3];
  canvas2d.globalAlpha = 0.92;
  canvas2d.beginPath();
  canvas2d.moveTo(widthPx, 0);
  for (let yi = 0; yi <= heightPx; yi += 8) {
    const frac = yi / heightPx;
    const idx  = Math.floor(frac * (_SEEDS.length - 1));
    const s    = _SEEDS[(idx + 15) % _SEEDS.length];
    const depth = BASE_DEPTH + s * 12;
    canvas2d.lineTo(widthPx - depth, yi);
  }
  canvas2d.lineTo(widthPx, heightPx);
  canvas2d.closePath();
  canvas2d.fill();

  // ── Step 2: Individual rock protrusions on top of the base bands ─────────
  // Use the original rock data but with increased depth and larger sizes.
  const PROTRUSION_DEPTH = 36;
  const rockCount = lowGraphics ? Math.floor(_ROCK_DATA.length * 0.6) : _ROCK_DATA.length;

  for (let r = 0; r < rockCount; r++) {
    const row    = _ROCK_DATA[r];
    const frac   = row[0];
    const perp   = row[1];
    const sizeW  = row[2] * 1.6;  // 60% larger than original
    const sizeH  = row[3] * 1.6;
    const rot    = row[4];
    const alpha  = row[5];
    const edgeId = row[6];

    let cx = 0, cy = 0;
    switch (edgeId) {
      case 0: cx = frac * widthPx;           cy = perp * PROTRUSION_DEPTH;              break;
      case 1: cx = frac * widthPx;           cy = heightPx - perp * PROTRUSION_DEPTH;   break;
      case 2: cx = perp * PROTRUSION_DEPTH;  cy = frac * heightPx;                       break;
      default: cx = widthPx - perp * PROTRUSION_DEPTH; cy = frac * heightPx;            break;
    }

    const angles = r % 2 === 0 ? _POLY_ANGLES_A : _POLY_ANGLES_B;
    const radii  = r % 2 === 0 ? _POLY_RADII_A  : _POLY_RADII_B;

    canvas2d.save();
    canvas2d.translate(cx, cy);
    canvas2d.rotate(rot);

    // Main rock fill
    canvas2d.globalAlpha = alpha;
    canvas2d.fillStyle   = _ROCK_FILL_COLORS[r % _ROCK_FILL_COLORS.length];
    canvas2d.beginPath();
    for (let v = 0; v < angles.length; v++) {
      const a  = angles[v];
      const wr = sizeW * 0.5 * radii[v];
      const hr = sizeH * 0.5 * radii[v];
      const vx = Math.cos(a) * wr;
      const vy = Math.sin(a) * hr;
      if (v === 0) canvas2d.moveTo(vx, vy);
      else canvas2d.lineTo(vx, vy);
    }
    canvas2d.closePath();
    canvas2d.fill();

    if (!lowGraphics) {
      // Moss accent
      canvas2d.globalAlpha = alpha * 0.50;
      canvas2d.fillStyle   = _ROCK_MOSS_COLORS[r % _ROCK_MOSS_COLORS.length];
      canvas2d.beginPath();
      for (let v = 0; v < angles.length; v++) {
        const a  = angles[v];
        const wr = sizeW * 0.40 * radii[v];
        const hr = sizeH * 0.40 * radii[v];
        const vx = Math.cos(a) * wr;
        const vy = Math.sin(a) * hr;
        if (v === 0) canvas2d.moveTo(vx - 1, vy - 2);
        else canvas2d.lineTo(vx - 1, vy - 2);
      }
      canvas2d.closePath();
      canvas2d.fill();

      // Crevice line (dark crack detail)
      canvas2d.globalAlpha = alpha * 0.30;
      canvas2d.strokeStyle = '#111008';
      canvas2d.lineWidth   = 0.7;
      canvas2d.beginPath();
      const cr1 = sizeW * 0.18, cr2 = sizeH * 0.25;
      canvas2d.moveTo(-cr1, -cr2);
      canvas2d.lineTo( cr1 * 0.6,  cr2 * 0.8);
      canvas2d.stroke();

      // Highlight
      canvas2d.globalAlpha = alpha * 0.22;
      canvas2d.fillStyle   = _ROCK_HIGHLIGHT_COLOR;
      canvas2d.beginPath();
      canvas2d.ellipse(-sizeW * 0.12, -sizeH * 0.22, sizeW * 0.28, sizeH * 0.18, 0, 0, Math.PI * 2);
      canvas2d.fill();
    }

    canvas2d.restore();
  }

  canvas2d.restore();
}

// ── Plant rendering ────────────────────────────────────────────────────────────

/**
 * Render all active VerdurePlant instances.
 *
 * Each plant is drawn up to its current growthProgress. Dead plants
 * fade out using their fadeAlpha.  Targetable plants receive a glow outline.
 */
export function drawVerdurePlants(
  canvas2d: CanvasRenderingContext2D,
  plants: VerdurePlant[],
  lowGraphics: boolean,
): void {
  if (plants.length === 0) return;

  canvas2d.save();

  for (const plant of plants) {
    if (plant.isDead && plant.fadeAlpha <= 0) continue;
    const alpha = plant.isDead ? plant.fadeAlpha : 1.0;
    _drawPlant(canvas2d, plant, alpha, lowGraphics);
  }

  canvas2d.restore();
}

/**
 * Render death fragment particles.
 */
export function drawVerdureFragments(
  canvas2d: CanvasRenderingContext2D,
  fragments: VerdureFragment[],
): void {
  if (fragments.length === 0) return;

  canvas2d.save();

  for (const f of fragments) {
    if (f.life <= 0) continue;
    canvas2d.globalAlpha = Math.min(1, f.life * 2.0) * 0.9;
    canvas2d.fillStyle   = _FRAGMENT_COLORS[f.colorIdx % _FRAGMENT_COLORS.length];
    canvas2d.save();
    canvas2d.translate(f.x, f.y);
    canvas2d.rotate(f.angle);
    canvas2d.beginPath();
    canvas2d.ellipse(0, 0, f.size, f.size * 0.5, 0, 0, Math.PI * 2);
    canvas2d.fill();
    canvas2d.restore();
  }

  canvas2d.restore();
}

// ── Private: per-plant dispatch ────────────────────────────────────────────────

function _drawPlant(
  canvas2d: CanvasRenderingContext2D,
  plant: VerdurePlant,
  alpha: number,
  lowGraphics: boolean,
): void {
  canvas2d.save();
  canvas2d.globalAlpha = alpha;

  // Targetable glow (high-graphics only, wraps the main stem)
  if (plant.isTargetable && !lowGraphics) {
    canvas2d.save();
    canvas2d.shadowBlur  = 6;
    canvas2d.shadowColor = _TARGETABLE_GLOW;
    _drawMainStem(canvas2d, plant, lowGraphics);
    canvas2d.shadowBlur  = 0;
    canvas2d.shadowColor = 'transparent';
    canvas2d.restore();
  }

  // Draw based on type
  switch (plant.type) {
    case 'vine':   _drawVinePlant(canvas2d, plant, lowGraphics);   break;
    case 'spiral': _drawSpiralPlant(canvas2d, plant, lowGraphics); break;
    case 'flower': _drawFlowerPlant(canvas2d, plant, lowGraphics); break;
    case 'leafy':  _drawLeafyPlant(canvas2d, plant, lowGraphics);  break;
    case 'thorn':  _drawThornPlant(canvas2d, plant, lowGraphics);  break;
  }

  canvas2d.restore();
}

// ── Main stem drawing helper ───────────────────────────────────────────────────

function _drawMainStem(
  canvas2d: CanvasRenderingContext2D,
  plant: VerdurePlant,
  lowGraphics: boolean,
): void {
  const { ctrlX, ctrlY, segCount, growthProgress, type, seed } = plant;

  const color = _VINE_COLORS[seed % _VINE_COLORS.length];
  const baseThick = type === 'leafy' ? 2.2 : type === 'thorn' ? 1.6 : 1.4;

  canvas2d.strokeStyle = color;
  canvas2d.lineCap     = 'round';
  canvas2d.lineJoin    = 'round';

  // Draw the grown portion segment by segment
  const totalSegs    = segCount;
  const grownSegs    = growthProgress * totalSegs;

  for (let s = 0; s < totalSegs; s++) {
    const segStart = s;
    const segEnd   = s + 1;
    if (segStart >= grownSegs) break;

    const tStart = segStart / totalSegs;
    const tEnd   = Math.min(segEnd, grownSegs) / totalSegs;

    // Taper: thick at root, thinner at tip
    const tMid  = (tStart + tEnd) * 0.5;
    const taper = 1 - tMid * 0.72;
    canvas2d.lineWidth = Math.max(0.4, baseThick * taper);

    // Build a short partial cubic for this grown segment
    _drawPartialCubic(canvas2d, ctrlX, ctrlY, segCount, tStart, tEnd, lowGraphics);
  }
}

/**
 * Draw a portion of the cubic Bézier composite path using moveTo + bezierCurveTo.
 * The subsegment from tStart to tEnd is extracted via de Casteljau subdivision.
 */
function _drawPartialCubic(
  canvas2d: CanvasRenderingContext2D,
  ctrlX: Float32Array,
  ctrlY: Float32Array,
  segCount: number,
  tStart: number,
  tEnd: number,
  _lowGraphics: boolean,
): void {
  // Sample a few intermediate points for a reasonable visual
  const STEPS = 4;
  const { x: startX, y: startY } = _evalPathAt(ctrlX, ctrlY, segCount, tStart);
  canvas2d.beginPath();
  canvas2d.moveTo(startX, startY);

  for (let k = 1; k <= STEPS; k++) {
    const t = tStart + (tEnd - tStart) * (k / STEPS);
    const { x, y } = _evalPathAt(ctrlX, ctrlY, segCount, t);
    canvas2d.lineTo(x, y);
  }
  canvas2d.stroke();
}

// ── Vine plant ─────────────────────────────────────────────────────────────────

function _drawVinePlant(
  canvas2d: CanvasRenderingContext2D,
  plant: VerdurePlant,
  lowGraphics: boolean,
): void {
  _drawMainStem(canvas2d, plant, lowGraphics);

  // Draw branches (only those whose split point has been grown past)
  for (const branch of plant.branches) {
    const splitT = branch.startNode / plant.segCount;
    if (plant.growthProgress < splitT + 0.05) continue;

    // Branch grows proportionally after the main stem passes its split point
    const branchGrowth = Math.min(1, (plant.growthProgress - splitT) / 0.4);
    _drawBranch(canvas2d, branch, branchGrowth, plant.seed, lowGraphics);
  }
}

// ── Spiral plant ───────────────────────────────────────────────────────────────

function _drawSpiralPlant(
  canvas2d: CanvasRenderingContext2D,
  plant: VerdurePlant,
  lowGraphics: boolean,
): void {
  _drawMainStem(canvas2d, plant, lowGraphics);

  if (plant.growthProgress < 0.9) return;

  // Draw a spiral/curl at the tip
  const tipT = plant.growthProgress;
  const { x: tipX, y: tipY } = _evalPathAt(plant.ctrlX, plant.ctrlY, plant.segCount, tipT);
  const { tx, ty } = _evalTangentAt(plant.ctrlX, plant.ctrlY, plant.segCount, Math.min(0.99, tipT));

  const tipAngle = Math.atan2(ty, tx);
  const spiralR  = 4 + (plant.seed % 3) * 1.5;
  const turns    = 1.5 + (plant.seed % 2) * 0.5;

  canvas2d.strokeStyle = _VINE_COLORS[(plant.seed + 2) % _VINE_COLORS.length];
  canvas2d.lineWidth   = 0.8;
  canvas2d.lineCap     = 'round';
  canvas2d.beginPath();

  const steps = lowGraphics ? 16 : 32;
  let firstPt = true;
  for (let i = 0; i <= steps; i++) {
    const t   = i / steps;
    const a   = tipAngle + t * turns * Math.PI * 2;
    const r   = spiralR * (1 - t * 0.7);  // spiral inward
    const px  = tipX + Math.cos(a) * r;
    const py  = tipY + Math.sin(a) * r;
    if (firstPt) { canvas2d.moveTo(px, py); firstPt = false; }
    else canvas2d.lineTo(px, py);
  }
  canvas2d.stroke();

  // Glowing flower at spiral tip (high-graphics only)
  if (!lowGraphics && plant.flowers.length > 0) {
    const fl = plant.flowers[0];
    canvas2d.save();
    canvas2d.shadowBlur  = 5;
    canvas2d.shadowColor = _SPIRAL_TIP_COLOR;
    canvas2d.fillStyle   = _FLOWER_COLORS[fl.colorIdx % _FLOWER_COLORS.length];
    canvas2d.globalAlpha = 0.85;
    canvas2d.beginPath();
    canvas2d.arc(tipX, tipY, fl.radius, 0, Math.PI * 2);
    canvas2d.fill();
    canvas2d.shadowBlur  = 0;
    canvas2d.shadowColor = 'transparent';
    canvas2d.restore();
  }
}

// ── Flower plant ───────────────────────────────────────────────────────────────

function _drawFlowerPlant(
  canvas2d: CanvasRenderingContext2D,
  plant: VerdurePlant,
  lowGraphics: boolean,
): void {
  _drawMainStem(canvas2d, plant, lowGraphics);

  // Draw branches
  for (const branch of plant.branches) {
    const splitT = branch.startNode / plant.segCount;
    if (plant.growthProgress < splitT + 0.05) continue;
    const branchGrowth = Math.min(1, (plant.growthProgress - splitT) / 0.4);
    _drawBranch(canvas2d, branch, branchGrowth, plant.seed, lowGraphics);
  }

  // Draw flower nodes along grown path
  for (const fl of plant.flowers) {
    if (plant.growthProgress < fl.tParam - 0.05) continue;

    const { x, y } = _evalPathAt(plant.ctrlX, plant.ctrlY, plant.segCount,
      Math.min(fl.tParam, plant.growthProgress));

    if (!lowGraphics) {
      canvas2d.save();
      canvas2d.shadowBlur  = 6;
      canvas2d.shadowColor = _FLOWER_COLORS[fl.colorIdx % _FLOWER_COLORS.length];
      canvas2d.fillStyle   = _FLOWER_COLORS[fl.colorIdx % _FLOWER_COLORS.length];
      canvas2d.globalAlpha = 0.90;
      canvas2d.beginPath();
      canvas2d.arc(x, y, fl.radius, 0, Math.PI * 2);
      canvas2d.fill();
      canvas2d.shadowBlur  = 0;
      canvas2d.shadowColor = 'transparent';
      canvas2d.restore();
    } else {
      canvas2d.fillStyle   = _FLOWER_COLORS[fl.colorIdx % _FLOWER_COLORS.length];
      canvas2d.globalAlpha = 0.75;
      canvas2d.beginPath();
      canvas2d.arc(x, y, fl.radius * 0.8, 0, Math.PI * 2);
      canvas2d.fill();
    }
  }
}

// ── Leafy plant ────────────────────────────────────────────────────────────────

function _drawLeafyPlant(
  canvas2d: CanvasRenderingContext2D,
  plant: VerdurePlant,
  lowGraphics: boolean,
): void {
  _drawMainStem(canvas2d, plant, lowGraphics);

  // Draw branch(es)
  for (const branch of plant.branches) {
    const splitT = branch.startNode / plant.segCount;
    if (plant.growthProgress < splitT + 0.05) continue;
    const branchGrowth = Math.min(1, (plant.growthProgress - splitT) / 0.4);
    _drawBranch(canvas2d, branch, branchGrowth, plant.seed, lowGraphics);
  }

  // Draw leaf ellipses along grown path
  const leafMax = lowGraphics ? Math.ceil(plant.leaves.length * 0.6) : plant.leaves.length;
  for (let li = 0; li < leafMax; li++) {
    const leaf = plant.leaves[li];
    if (plant.growthProgress < leaf.tParam - 0.04) continue;

    const tClamped = Math.min(leaf.tParam, plant.growthProgress);
    const { x, y } = _evalPathAt(plant.ctrlX, plant.ctrlY, plant.segCount, tClamped);
    const { tx, ty } = _evalTangentAt(plant.ctrlX, plant.ctrlY, plant.segCount, tClamped);

    const leafAngle = Math.atan2(ty, tx) + leaf.angleDelta;

    canvas2d.save();
    canvas2d.translate(x, y);
    canvas2d.rotate(leafAngle);
    canvas2d.fillStyle   = _LEAF_COLORS[li % _LEAF_COLORS.length];
    canvas2d.globalAlpha = 0.75;
    canvas2d.beginPath();
    canvas2d.ellipse(0, 0, leaf.radiusA, leaf.radiusB, 0, 0, Math.PI * 2);
    canvas2d.fill();
    canvas2d.restore();
  }
}

// ── Thorn plant ────────────────────────────────────────────────────────────────

function _drawThornPlant(
  canvas2d: CanvasRenderingContext2D,
  plant: VerdurePlant,
  lowGraphics: boolean,
): void {
  // Draw thorn main stem (slightly different colour — darker, more angular)
  const { ctrlX, ctrlY, segCount, growthProgress, seed } = plant;
  const grownSegs = growthProgress * segCount;

  canvas2d.strokeStyle = _THORN_COLOR;
  canvas2d.lineWidth   = 1.8;
  canvas2d.lineCap     = 'butt';
  canvas2d.lineJoin    = 'miter';

  for (let s = 0; s < segCount; s++) {
    if (s >= grownSegs) break;
    const tStart = s / segCount;
    const tEnd   = Math.min(s + 1, grownSegs) / segCount;
    _drawPartialCubic(canvas2d, ctrlX, ctrlY, segCount, tStart, tEnd, lowGraphics);
  }

  // Add spike protrusions at regular intervals
  const thornCount = lowGraphics ? 3 : 6;
  for (let t = 0; t < thornCount; t++) {
    const paramT = (t + 1) / (thornCount + 1);
    if (paramT > growthProgress) break;

    const { x, y } = _evalPathAt(ctrlX, ctrlY, segCount, paramT);
    const { tx, ty } = _evalTangentAt(ctrlX, ctrlY, segCount, paramT);

    const normalX = -ty;
    const normalY =  tx;
    const side    = (seed + t) % 2 === 0 ? 1 : -1;
    const len     = 3.5 + (seed * 0.017 + t) % 2.5;

    canvas2d.strokeStyle = _THORN_COLOR;
    canvas2d.lineWidth   = 1.0;
    canvas2d.beginPath();
    canvas2d.moveTo(x, y);
    canvas2d.lineTo(x + normalX * side * len, y + normalY * side * len);
    canvas2d.stroke();
  }
}

// ── Branch rendering ───────────────────────────────────────────────────────────

function _drawBranch(
  canvas2d: CanvasRenderingContext2D,
  branch: VerdureBranch,
  branchGrowth: number,
  seed: number,
  lowGraphics: boolean,
): void {
  if (branchGrowth <= 0) return;

  canvas2d.strokeStyle = _VINE_COLORS[(seed + 1) % _VINE_COLORS.length];
  canvas2d.lineWidth   = 0.9;
  canvas2d.lineCap     = 'round';

  const grownSegs = branchGrowth * branch.segCount;
  for (let s = 0; s < branch.segCount; s++) {
    if (s >= grownSegs) break;
    const tStart = s / branch.segCount;
    const tEnd   = Math.min(s + 1, grownSegs) / branch.segCount;
    _drawPartialCubic(canvas2d, branch.ctrlX, branch.ctrlY, branch.segCount, tStart, tEnd, lowGraphics);
  }
}
