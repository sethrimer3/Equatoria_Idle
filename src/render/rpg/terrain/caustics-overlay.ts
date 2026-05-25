/**
 * caustics-overlay.ts — Animated underwater visual overlay for the Caustics RPG zone.
 *
 * Visual pipeline (drawn in this order by rpg-render-draw.ts):
 *   1. drawCausticsBackground()   — deep-water atmosphere + floor glow pool; before fluid/terrain
 *   2. drawCausticsFloorEffects() — caustic light network, shimmer bands, rising bubbles
 *
 * ── Caustic light network (build 149) ─────────────────────────────────────────
 *   Three drifting layers of a Voronoi cell-boundary (Worley F2−F1) caustic
 *   texture tile, composited with globalCompositeOperation = 'screen'.
 *
 *   Each layer uses the same tiled caustic canvas (generated once in
 *   caustics-texture.ts) but with a different CanvasPattern transform:
 *     Layer A: scale 1.00×, slow rightward+downward drift  (~8.5 / 6.0 px/s)
 *     Layer B: scale 1.28×, leftward+downward drift        (~6.2 / 4.5 px/s)  [high only]
 *     Layer C: scale 0.78×, rightward+upward drift         (~4.2 / 5.8 px/s)  [high only]
 *
 *   Because each layer drifts at a different speed and scale, the crossing
 *   intersection zones change continuously — naturally producing bright,
 *   slow-shifting caustic knots wherever two layers overlap.
 *
 *   Physics: real caustics are bright at Voronoi cell boundaries because that
 *   is where refracted ray bundles converge.  The Worley F2−F1 field reproduces
 *   this directly.  'screen' compositing makes overlapping bright regions
 *   accumulate toward white, mimicking multiple convergent ray bundles.
 *
 * No per-frame pixel operations:
 *   The tile is generated once (putImageData at init) and cached in caustics-texture.ts.
 *   Per-frame work is: three CanvasPattern.setTransform calls + three fillRect calls.
 *   CanvasPattern objects are cached and reused across frames.
 *
 * Low-graphics mode:
 *   One cached layer at reduced alpha.  No expensive glow pass.
 *   Still reads as aquarium-floor caustics, not fading ovals.
 *
 * Draw order:
 *   drawCausticsBackground()   — after '#0a0a12' base fill, before fluid/terrain
 *   drawCausticsFloorEffects() — after terrain render, before enemies/player
 */

import { getCausticsTextureTile } from './caustics-texture';

// ── Pre-baked bubble data ──────────────────────────────────────────────────────

/**
 * Bubble parameter table.
 * Layout per row: [baseXFrac, periodSec, xWobbleAmpPx, xWobbleFreq, radiusPx, alphaBase, phaseOffset]
 */
const _BUBBLE_DATA: readonly (readonly number[])[] = [
  //  baseX  period  wobAmp  wobFreq  r    alpha  phase
  [   0.12,   8.3,   7.0,   0.90,   2.0,  0.20,  0.00 ],
  [   0.28,   6.7,   5.0,   1.10,   1.5,  0.22,  0.07 ],
  [   0.43,   9.1,   9.0,   0.70,   1.8,  0.16,  0.14 ],
  [   0.57,   7.4,   6.0,   1.30,   2.5,  0.21,  0.21 ],
  [   0.71,  10.2,   4.0,   0.80,   1.2,  0.24,  0.29 ],
  [   0.85,   6.0,   8.0,   1.50,   2.0,  0.19,  0.36 ],
  [   0.18,  11.5,   5.0,   0.60,   1.5,  0.15,  0.43 ],
  [   0.35,   8.8,   7.0,   1.00,   1.8,  0.20,  0.50 ],
  [   0.50,   7.2,   3.0,   1.20,   2.2,  0.22,  0.57 ],
  [   0.65,   9.6,   6.0,   0.90,   1.6,  0.18,  0.64 ],
  [   0.78,   6.5,   9.0,   1.40,   1.3,  0.23,  0.71 ],
  [   0.92,   8.0,   5.0,   0.80,   2.4,  0.17,  0.79 ],
  [   0.22,  10.8,   7.0,   1.10,   1.7,  0.21,  0.86 ],
  [   0.47,   7.9,   4.0,   1.30,   2.1,  0.19,  0.93 ],
];

const _HIGH_BUBBLE_COUNT = 14;
const _LOW_BUBBLE_COUNT  = 6;

const _SHIMMER_COLOR = '#6ad8e0';

// ── CanvasPattern cache ────────────────────────────────────────────────────────
// Patterns are cached and reused across frames to avoid per-frame allocations.
// Invalidated when the rendering context changes or the tile is regenerated.

let _patternA: CanvasPattern | null = null;  // layer A (always drawn)
let _patternB: CanvasPattern | null = null;  // layer B (high-graphics)
let _patternC: CanvasPattern | null = null;  // layer C (high-graphics)
let _patternCtx:  CanvasRenderingContext2D | null = null;
let _patternTile: HTMLCanvasElement | null = null;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Draw the deep-water atmosphere tint + floor glow pool behind the battlefield.
 *
 * Call immediately after the initial background fill, before fluid and terrain,
 * so it sits at the very bottom of the visual stack.
 */
export function drawCausticsBackground(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  lowGraphics: boolean,
): void {
  canvas2d.save();

  // ── Main atmosphere gradient ──────────────────────────────────────────────
  // Near-black navy at the top (deep open water) transitioning to murky
  // seafloor teal at the bottom — the ground receives more scattered light.
  const atmoGrad = canvas2d.createLinearGradient(0, 0, 0, heightPx);
  atmoGrad.addColorStop(0,   '#010d1a');  // near-black navy (deep water column)
  atmoGrad.addColorStop(0.5, '#011e1e');  // dark teal (mid-water)
  atmoGrad.addColorStop(1,   '#023028');  // murky seafloor teal
  canvas2d.fillStyle = atmoGrad;
  canvas2d.globalAlpha = lowGraphics ? 0.30 : 0.40;
  canvas2d.fillRect(0, 0, widthPx, heightPx);

  // ── Floor glow pool (high-graphics only) ─────────────────────────────────
  // A soft warm-teal radial gradient pooled at the seabed, representing
  // diffuse ambient light that accumulates on a sandy/rocky substrate.
  if (!lowGraphics) {
    const poolGrad = canvas2d.createRadialGradient(
      widthPx * 0.5, heightPx,        0,
      widthPx * 0.5, heightPx * 0.88, widthPx * 0.70,
    );
    poolGrad.addColorStop(0,    'rgba(42, 170, 148, 0.13)');
    poolGrad.addColorStop(0.55, 'rgba(18, 105, 105, 0.05)');
    poolGrad.addColorStop(1,    'rgba(0,   0,   0,  0)');
    canvas2d.fillStyle = poolGrad;
    canvas2d.globalAlpha = 1;
    canvas2d.fillRect(0, heightPx * 0.68, widthPx, heightPx * 0.32);
  }

  canvas2d.restore();
}

/**
 * Draw the animated caustic light network, shimmer bands, and rising bubbles
 * on top of the terrain but below enemies and the player.
 *
 * The main visual identity comes from three drifting layers of a cached Voronoi
 * caustic texture composited with 'screen' blending — not from alpha-pulsing
 * ovals or simple sine-wave bands.
 *
 * Call after terrain rendering and before the first enemy draw call.
 */
export function drawCausticsFloorEffects(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  nowMs: number,
  lowGraphics: boolean,
): void {
  const tS = nowMs * 0.001;
  _drawCausticsTileLayers(canvas2d, widthPx, heightPx, tS, lowGraphics);
  if (!lowGraphics) {
    _drawCausticsShimmer(canvas2d, widthPx, heightPx, tS);
  }
  _drawCausticsBubbles(canvas2d, widthPx, heightPx, tS, lowGraphics);
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Draw the caustic light network using drifting CanvasPattern layers.
 *
 * The source tile (from caustics-texture.ts) contains a Voronoi cell-boundary
 * pattern with thin bright filaments and soft aqua halos.  Drawing multiple
 * copies at different scales and drift vectors creates convincing intersection
 * hot-spots and a slow, evolving watery shimmer.
 *
 * All three CanvasPattern objects are cached module-level and reused each frame.
 * Per-frame work is limited to three setTransform calls and three fillRect calls.
 *
 * Layer parameters (drift speeds in canvas pixels per second):
 *   A: scale 1.00×, (+8.5, +6.0) px/s — main caustic weave
 *   B: scale 1.28×, (−6.2, +4.5) px/s — larger cells, opposing X drift  [high only]
 *   C: scale 0.78×, (+4.2, −5.8) px/s — finer detail, upward bias        [high only]
 */
function _drawCausticsTileLayers(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  tS: number,
  lowGraphics: boolean,
): void {
  const tile = getCausticsTextureTile(lowGraphics);

  // Refresh cached CanvasPattern objects if the context or source tile changed.
  if (_patternCtx !== canvas2d || _patternTile !== tile) {
    _patternA = canvas2d.createPattern(tile, 'repeat');
    _patternB = canvas2d.createPattern(tile, 'repeat');
    _patternC = canvas2d.createPattern(tile, 'repeat');
    _patternCtx  = canvas2d;
    _patternTile = tile;
  }
  if (!_patternA) return;

  const tileW = tile.width;
  const tileH = tile.height;

  canvas2d.save();
  canvas2d.globalCompositeOperation = 'screen';

  // ── Layer A: main caustic weave, slow rightward + downward drift ──────────
  const txA = (tS * 8.5) % tileW;
  const tyA = (tS * 6.0) % tileH;
  _patternA.setTransform({ a: 1, b: 0, c: 0, d: 1, e: txA, f: tyA });
  canvas2d.globalAlpha = lowGraphics ? 0.33 : 0.40;
  canvas2d.fillStyle = _patternA;
  canvas2d.fillRect(0, 0, widthPx, heightPx);

  if (!lowGraphics) {
    if (_patternB) {
      // ── Layer B: scale 1.28×, leftward + slow downward drift ─────────────
      const scaleB   = 1.28;
      const periodBx = tileW * scaleB;
      const periodBy = tileH * scaleB;
      const txB = (((-(tS * 6.2)) % periodBx) + periodBx) % periodBx;
      const tyB = (tS * 4.5) % periodBy;
      _patternB.setTransform({ a: scaleB, b: 0, c: 0, d: scaleB, e: txB, f: tyB });
      canvas2d.globalAlpha = 0.28;
      canvas2d.fillStyle = _patternB;
      canvas2d.fillRect(0, 0, widthPx, heightPx);
    }

    if (_patternC) {
      // ── Layer C: scale 0.78×, rightward + upward drift (fine shimmer) ────
      const scaleC   = 0.78;
      const periodCx = tileW * scaleC;
      const periodCy = tileH * scaleC;
      const txC = (tS * 4.2) % periodCx;
      const tyC = (((-(tS * 5.8)) % periodCy) + periodCy) % periodCy;
      _patternC.setTransform({ a: scaleC, b: 0, c: 0, d: scaleC, e: txC, f: tyC });
      canvas2d.globalAlpha = 0.18;
      canvas2d.fillStyle = _patternC;
      canvas2d.fillRect(0, 0, widthPx, heightPx);
    }
  }

  canvas2d.restore();
}

/**
 * Draw faint horizontal shimmer bands simulating light ripples on the water
 * surface seen from below.  High-graphics only.
 *
 * Kept deliberately subtle (3 bands, very low alpha) so the caustic tile
 * network remains the dominant visual identity.
 */
function _drawCausticsShimmer(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  tS: number,
): void {
  const bandCount = 3;
  canvas2d.save();
  canvas2d.strokeStyle = _SHIMMER_COLOR;
  canvas2d.lineWidth = 1.0;

  for (let b = 0; b < bandCount; b++) {
    const yBase = heightPx * (0.05 + b * 0.060);
    const alpha = 0.012 + 0.007 * Math.sin(tS * 0.55 + b * 1.5708);
    canvas2d.globalAlpha = alpha;

    canvas2d.beginPath();
    canvas2d.moveTo(0, yBase);
    for (let x = 8; x <= widthPx; x += 8) {
      const y = yBase + 2.5 * Math.sin(x * 0.068 + tS * (0.65 + b * 0.15));
      canvas2d.lineTo(x, y);
    }
    canvas2d.stroke();
  }

  canvas2d.restore();
}

/**
 * Draw sparse rising bubble particles.  Each bubble cycles continuously from
 * the bottom of the arena to the top with a gentle horizontal wobble.
 * All parameters are pre-baked — no per-frame allocations.
 */
function _drawCausticsBubbles(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  tS: number,
  lowGraphics: boolean,
): void {
  const bubbleCount = lowGraphics ? _LOW_BUBBLE_COUNT : _HIGH_BUBBLE_COUNT;
  canvas2d.save();
  canvas2d.strokeStyle = 'rgba(160, 230, 255, 0.85)';
  canvas2d.lineWidth = 0.6;

  for (let i = 0; i < bubbleCount; i++) {
    const row       = _BUBBLE_DATA[i];
    const baseXFrac = row[0];
    const period    = row[1];
    const wobAmp    = row[2];
    const wobFreq   = row[3];
    const radius    = row[4];
    const alphaBase = row[5];
    const phaseOff  = row[6];

    // phase 0 = just appeared at bottom; phase 1 = reached top
    const phase = ((tS / period) + phaseOff) % 1.0;

    const y = heightPx * (1.0 - phase);
    const x = widthPx * baseXFrac + wobAmp * Math.sin(tS * wobFreq + phaseOff * 6.283);

    // Fade in from bottom and fade out near the top.
    const fadeEdge = Math.min(phase * 8.0, (1.0 - phase) * 6.0, 1.0);
    const alpha = alphaBase * fadeEdge;

    canvas2d.globalAlpha = alpha;
    canvas2d.beginPath();
    canvas2d.arc(x, y, radius, 0, Math.PI * 2);
    canvas2d.stroke();
  }

  canvas2d.restore();
}
