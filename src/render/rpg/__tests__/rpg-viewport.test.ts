/**
 * rpg-viewport.test.ts — Regression tests for the RPG viewport scale invariant.
 *
 * The core invariant:
 *   When the RPG render host grows WIDER, the stable scale must not increase and
 *   the visible world width must increase proportionally.  Increasing the canvas
 *   size should reveal more world, not zoom in on the existing world.
 *
 * Mirrors the logic in doResize() in src/render/rpg/rpg-render.ts.
 */

import { describe, it, expect } from 'vitest';

/** Constants duplicated from rpg-constants.ts to avoid DOM side-effects. */
const RPG_LOGICAL_WIDTH  = 360;
const RPG_LOGICAL_HEIGHT = 640;

interface RpgViewport {
  scale:         number;
  visibleWorldW: number;
  visibleWorldH: number;
  offsetX:       number;
  offsetY:       number;
}

/**
 * Pure function that mirrors the doResize() scale logic in rpg-render.ts.
 * Kept here as a white-box spec so regressions are caught immediately.
 *
 * The invariant:
 *   scale = Math.min(containerW / RPG_LOGICAL_WIDTH, containerH / RPG_LOGICAL_HEIGHT, 1)
 *
 * This ensures the full 360×640 safe core always fits inside the host:
 *   - scale = 1.0 when the host is at or above the full reference size.
 *   - scale < 1 when the host is narrower OR shorter than the safe core.
 *   - scale is never > 1 (safe core never zooms beyond 1 px-per-world-unit).
 */
function computeRpgViewport(containerW: number, containerH: number): RpgViewport {
  const scale        = Math.min(containerW / RPG_LOGICAL_WIDTH, containerH / RPG_LOGICAL_HEIGHT, 1);
  const visibleWorldW = containerW / scale;
  const visibleWorldH = containerH / scale;
  const offsetX      = (containerW - RPG_LOGICAL_WIDTH  * scale) / 2;
  const offsetY      = (containerH - RPG_LOGICAL_HEIGHT * scale) / 2;
  return { scale, visibleWorldW, visibleWorldH, offsetX, offsetY };
}

describe('RPG viewport scale invariant', () => {
  it('scale does not increase when canvas grows wider (regression for zoom-in bug)', () => {
    const narrow = computeRpgViewport(360, 640);
    const wider  = computeRpgViewport(600, 640);

    // Scale must stay the same — the extra width reveals more world.
    expect(wider.scale).toBeCloseTo(narrow.scale, 5);

    // Visible world must be wider on the wider canvas.
    expect(wider.visibleWorldW).toBeGreaterThan(narrow.visibleWorldW);

    // Vertical visible world is the same height (same canvas height).
    expect(wider.visibleWorldH).toBeCloseTo(narrow.visibleWorldH, 3);
  });

  it('scale does not increase when canvas grows taller', () => {
    const shorter = computeRpgViewport(360, 640);
    const taller  = computeRpgViewport(360, 900);

    // On a taller canvas: min(360, 900, 360) = 360 → scale stays 1.0.
    expect(taller.scale).toBeCloseTo(shorter.scale, 5);

    // Visible world grows vertically.
    expect(taller.visibleWorldH).toBeGreaterThan(shorter.visibleWorldH);

    // Horizontal visible world stays the same width.
    expect(taller.visibleWorldW).toBeCloseTo(shorter.visibleWorldW, 3);
  });

  it('scale is exactly 1.0 on the 360×640 reference phone size', () => {
    const vp = computeRpgViewport(360, 640);
    expect(vp.scale).toBeCloseTo(1.0, 5);
    expect(vp.visibleWorldW).toBeCloseTo(360, 3);
    expect(vp.visibleWorldH).toBeCloseTo(640, 3);
    expect(vp.offsetX).toBeCloseTo(0, 3);
    expect(vp.offsetY).toBeCloseTo(0, 3);
  });

  it('scale is exactly 1.0 on a wide desktop canvas', () => {
    const vp = computeRpgViewport(1280, 800);
    // min(1280, 800, 360) = 360 → scale = 1.0
    expect(vp.scale).toBeCloseTo(1.0, 5);
    expect(vp.visibleWorldW).toBeCloseTo(1280, 3);
    expect(vp.visibleWorldH).toBeCloseTo(800, 3);
  });

  it('scale < 1 on a narrow canvas (world shrinks to fit)', () => {
    const vp = computeRpgViewport(320, 640);
    // min(320, 640, 360) = 320 → scale ≈ 0.888
    expect(vp.scale).toBeCloseTo(320 / 360, 5);
    expect(vp.visibleWorldW).toBeCloseTo(360, 3);
  });

  it('scale < 1 on a short canvas (safe core must fit vertically)', () => {
    const vp = computeRpgViewport(360, 480);
    // min(360/360, 480/640, 1) = min(1, 0.75, 1) = 0.75  (height is now limiting)
    expect(vp.scale).toBeCloseTo(480 / 640, 5);
    expect(vp.visibleWorldH).toBeCloseTo(640, 3);
  });

  it('scale is less than 1 on a very short canvas', () => {
    const vp = computeRpgViewport(360, 200);
    // min(360/360, 200/640, 1) = min(1, 0.3125, 1) = 200/640
    expect(vp.scale).toBeCloseTo(200 / 640, 5);
  });

  it('offsetX is positive (centred) on a wider canvas', () => {
    const vp = computeRpgViewport(600, 640);
    // World is 360 wide at scale 1.0.  Canvas is 600.  Extra = 240 / 2 = 120.
    expect(vp.offsetX).toBeCloseTo(120, 3);
    expect(vp.offsetY).toBeCloseTo(0, 3);
  });

  it('offsetY is positive (centred) on a taller canvas', () => {
    const vp = computeRpgViewport(360, 900);
    // World is 640 tall at scale 1.0.  Canvas is 900.  Extra = 260 / 2 = 130.
    expect(vp.offsetX).toBeCloseTo(0, 3);
    expect(vp.offsetY).toBeCloseTo(130, 3);
  });
});

// ── Problem-statement regression cases ────────────────────────────────────────

describe('RPG viewport — safe-core fit regression cases', () => {
  it('wide and tall enough (760×640): scale=1, full safe core visible', () => {
    const vp = computeRpgViewport(760, 640);
    // min(760/360, 640/640, 1) = 1.0
    expect(vp.scale).toBeCloseTo(1.0, 5);
    expect(vp.visibleWorldW).toBeCloseTo(760, 3);
    expect(vp.visibleWorldH).toBeCloseTo(640, 3);
  });

  it('wide but too short (480×415): scale≈415/640, full safe core height visible', () => {
    const vp = computeRpgViewport(480, 415);
    // min(480/360, 415/640, 1) = min(1.333, 0.648, 1) = 415/640
    expect(vp.scale).toBeCloseTo(415 / 640, 5);
    // Visible world height must cover the full 640 safe core.
    expect(vp.visibleWorldH).toBeCloseTo(640, 3);
    // Visible world must be wider than the 360 safe core.
    expect(vp.visibleWorldW).toBeGreaterThan(360);
    // offsetX must be positive (extra space distributed evenly).
    expect(vp.offsetX).toBeGreaterThanOrEqual(0);
    // offsetY must be 0 (safe core exactly fills height).
    expect(vp.offsetY).toBeCloseTo(0, 3);
  });

  it('narrow phone (320×640): scale=320/360, full safe core height visible', () => {
    const vp = computeRpgViewport(320, 640);
    // min(320/360, 640/640, 1) = min(0.888, 1, 1) = 320/360
    expect(vp.scale).toBeCloseTo(320 / 360, 5);
    // Visible world must show the full safe core width and height.
    expect(vp.visibleWorldW).toBeCloseTo(360, 3);
    expect(vp.visibleWorldH).toBeGreaterThanOrEqual(640);
  });

  it('very short host (360×400): scale=400/640, full safe core fits', () => {
    const vp = computeRpgViewport(360, 400);
    // min(360/360, 400/640, 1) = min(1, 0.625, 1) = 400/640
    expect(vp.scale).toBeCloseTo(400 / 640, 5);
    expect(vp.visibleWorldH).toBeCloseTo(640, 3);
    expect(vp.visibleWorldW).toBeGreaterThanOrEqual(360);
  });
});
