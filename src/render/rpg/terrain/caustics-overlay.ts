/**
 * caustics-overlay.ts — Animated underwater visual overlay for the Caustics RPG zone.
 *
 * Renders when activeZoneId === 'caustics':
 *   1. Underwater background tint  (dark teal/navy wash behind the battlefield)
 *   2. Animated caustic light patches on the arena floor  (slow, organic, pulsing ellipses)
 *   3. Faint wave-shimmer bands across the arena          (high-graphics only)
 *   4. Sparse rising bubble particles                     (decorative, no collision)
 *
 * All rendering is time-based and fully deterministic; there are no per-frame
 * object allocations — all patch seeds and bubble parameters are baked into
 * module-level constants.
 *
 * Draw order expected by the caller (rpg-render-draw.ts):
 *   drawCausticsBackground()    — after the initial background fill, before fluid/terrain
 *   drawCausticsFloorEffects()  — after terrain rendering, before enemies/player
 */

// ── Pre-baked seed data (avoids per-frame RNG) ────────────────────────────────

/** Twelve deterministic values used to spread and phase-shift caustic patches. */
const _SEEDS: readonly number[] = [
  0.173, 0.431, 0.617, 0.295,
  0.772, 0.511, 0.884, 0.128,
  0.659, 0.374, 0.054, 0.938,
];

/**
 * Bubble parameter table — one flat row per bubble.
 * Layout: [baseXFrac, periodSec, xWobbleAmpPx, xWobbleFreq, radiusPx, alphaBase, phaseOffset]
 *
 * All values are compile-time constants so accessing them in the render loop
 * does not allocate.
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

// ── Visual constants ──────────────────────────────────────────────────────────

const _CAUSTIC_COLORS: readonly string[] = ['#4af0cc', '#5ac8f0', '#78e8b8'];
const _SHIMMER_COLOR = '#6ad8e0';

const _HIGH_PATCH_COUNT  = 8;
const _LOW_PATCH_COUNT   = 4;
const _HIGH_BUBBLE_COUNT = 14;
const _LOW_BUBBLE_COUNT  = 6;

/** Background tint opacity.  Kept subtle so terrain/enemies remain readable. */
const _TINT_ALPHA_HIGH = 0.26;
const _TINT_ALPHA_LOW  = 0.18;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Draw the underwater atmosphere tint behind the entire battlefield.
 *
 * Call immediately after the initial background fill (`fillRect('#0a0a12')`),
 * before fluid and terrain rendering, so it sits at the very bottom of the
 * visual stack.
 */
export function drawCausticsBackground(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  lowGraphics: boolean,
): void {
  canvas2d.save();
  const grad = canvas2d.createLinearGradient(0, 0, 0, heightPx);
  grad.addColorStop(0, '#011828');  // deep navy at the top
  grad.addColorStop(1, '#023028');  // dark seafloor teal at the bottom
  canvas2d.fillStyle = grad;
  canvas2d.globalAlpha = lowGraphics ? _TINT_ALPHA_LOW : _TINT_ALPHA_HIGH;
  canvas2d.fillRect(0, 0, widthPx, heightPx);
  canvas2d.restore();
}

/**
 * Draw animated caustic light patches, shimmer bands, and rising bubble particles
 * on top of the terrain but below enemies and player.
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
  const tS = nowMs * 0.001;  // seconds
  _drawCausticsPatches(canvas2d, widthPx, heightPx, tS, lowGraphics);
  if (!lowGraphics) {
    _drawCausticsShimmer(canvas2d, widthPx, heightPx, tS);
  }
  _drawCausticsBubbles(canvas2d, widthPx, heightPx, tS, lowGraphics);
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Draw organic, slowly-drifting light ellipses concentrated on the lower arena.
 * Each patch pulses gently and moves on a Lissajous-like trajectory to mimic
 * light refracted through moving water onto a seafloor.
 */
function _drawCausticsPatches(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  tS: number,
  lowGraphics: boolean,
): void {
  const patchCount = lowGraphics ? _LOW_PATCH_COUNT : _HIGH_PATCH_COUNT;
  canvas2d.save();

  for (let i = 0; i < patchCount; i++) {
    const s0 = _SEEDS[i % 12];
    const s1 = _SEEDS[(i + 4) % 12];
    const s2 = _SEEDS[(i + 8) % 12];

    // Slow sinusoidal drift — each patch moves independently
    const driftX = Math.sin(tS * (0.07 + s0 * 0.04) + s0 * 6.283) * widthPx  * 0.07;
    const driftY = Math.cos(tS * (0.05 + s1 * 0.03) + s1 * 4.712) * heightPx * 0.04;

    // Concentrated in the lower 45% of the arena (seafloor feel)
    const cx = widthPx  * (0.10 + s0 * 0.80) + driftX;
    const cy = heightPx * (0.55 + s1 * 0.36) + driftY;

    // Elongated ellipses at varied angles to look like caustic ribbons
    const rx = 18 + s2 * 36;
    const ry =  9 + s0 * 17;
    const angle = s1 * Math.PI;

    // Pulsing brightness — slow and organic
    const pulse = 0.5 + 0.5 * Math.sin(tS * (0.35 + s0 * 0.25) + s2 * 3.14159);
    const alpha = (0.042 + s2 * 0.028) * pulse;

    canvas2d.globalAlpha = alpha;
    canvas2d.fillStyle = _CAUSTIC_COLORS[i % 3];
    canvas2d.beginPath();
    canvas2d.ellipse(cx, cy, rx, ry, angle, 0, Math.PI * 2);
    canvas2d.fill();
  }

  canvas2d.restore();
}

/**
 * Draw faint horizontal wave bands that simulate light shimmer on the water
 * surface seen from below.  Skipped in low-graphics mode.
 *
 * Each band is a sine-wave polyline with very low opacity — visible as a
 * subtle ripple in the upper-to-middle portion of the arena.
 */
function _drawCausticsShimmer(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  tS: number,
): void {
  const bandCount = 4;
  canvas2d.save();
  canvas2d.strokeStyle = _SHIMMER_COLOR;
  canvas2d.lineWidth = 1.0;

  for (let b = 0; b < bandCount; b++) {
    const yBase = heightPx * (0.08 + b * 0.07);
    const alpha = 0.013 + 0.008 * Math.sin(tS * 0.55 + b * 1.5708);
    canvas2d.globalAlpha = alpha;

    canvas2d.beginPath();
    canvas2d.moveTo(0, yBase);
    // 46 segments across the 360-wide logical canvas — lightweight
    for (let x = 8; x <= widthPx; x += 8) {
      const y = yBase + 2.5 * Math.sin(x * 0.07 + tS * (0.70 + b * 0.18));
      canvas2d.lineTo(x, y);
    }
    canvas2d.stroke();
  }

  canvas2d.restore();
}

/**
 * Draw sparse rising bubble particles.  Each bubble cycles continuously from
 * the bottom of the arena to the top over its individual period, with a gentle
 * horizontal wobble.  All parameters are pre-baked — no per-frame allocations.
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

    // Fade in from bottom and fade out near the top
    const fadeEdge = Math.min(phase * 8.0, (1.0 - phase) * 6.0, 1.0);
    const alpha = alphaBase * fadeEdge;

    canvas2d.globalAlpha = alpha;
    canvas2d.beginPath();
    canvas2d.arc(x, y, radius, 0, Math.PI * 2);
    canvas2d.stroke();
  }

  canvas2d.restore();
}
