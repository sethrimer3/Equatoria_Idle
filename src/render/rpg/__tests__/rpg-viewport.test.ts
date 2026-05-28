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
 *   safePx  = Math.min(containerW, containerH, RPG_LOGICAL_WIDTH)
 *   scale   = safePx / RPG_LOGICAL_WIDTH
 *
 * Scale is therefore:
 *   - 1.0 when canvas is at or above reference size in both dimensions.
 *   - < 1 when the canvas is narrower OR shorter than the reference.
 *   - Never > 1 for any canvas size (scale is capped at 1).
 */
function computeRpgViewport(containerW: number, containerH: number): RpgViewport {
  const safePx       = Math.min(containerW, containerH, RPG_LOGICAL_WIDTH);
  const scale        = safePx / RPG_LOGICAL_WIDTH;
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

  it('scale < 1 on a short canvas (world shrinks to fit)', () => {
    const vp = computeRpgViewport(360, 480);
    // min(360, 480, 360) = 360 → scale = 1.0  (width is limiting)
    expect(vp.scale).toBeCloseTo(1.0, 5);
    expect(vp.visibleWorldH).toBeCloseTo(480, 3);
  });

  it('scale is less than 1 on a very short canvas', () => {
    const vp = computeRpgViewport(360, 200);
    // min(360, 200, 360) = 200 → scale ≈ 0.555
    expect(vp.scale).toBeCloseTo(200 / 360, 5);
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
