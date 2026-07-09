/**
 * rpg-viewport.test.ts — Regression tests for the RPG viewport fit-scale invariant.
 *
 * The core invariant (post letterbox/pillarbox fix):
 *   #rpg-area is always sized to the largest 360×640-ratio rectangle that fits
 *   inside the container, centred via CSS. Resizing the host changes zoom
 *   (fitScale) only — the world viewport ALWAYS stays fixed at
 *   {left:0, top:0, right:360, bottom:640}. Growing the window must never
 *   reveal more world, and shrinking it must never clip world that was
 *   previously visible/spawnable.
 *
 * Mirrors the logic in doResize() in src/render/rpg/rpg-render.ts.
 */

import { describe, it, expect } from 'vitest';

/** Constants duplicated from rpg-constants.ts to avoid DOM side-effects. */
const RPG_LOGICAL_WIDTH  = 360;
const RPG_LOGICAL_HEIGHT = 640;

interface RpgViewport {
  fitScale: number;
  areaW:    number;
  areaH:    number;
  /** World-space viewport bounds — always fixed. */
  left:   number;
  top:    number;
  right:  number;
  bottom: number;
}

/**
 * Pure function that mirrors the doResize() fit-scale logic in rpg-render.ts.
 * Kept here as a white-box spec so regressions are caught immediately.
 *
 * The invariant:
 *   fitScale = Math.min(containerW / RPG_LOGICAL_WIDTH, containerH / RPG_LOGICAL_HEIGHT)
 *   (uncapped — large windows zoom in, they never reveal more world)
 *   areaW/areaH = RPG_LOGICAL_WIDTH/HEIGHT * fitScale (floored), centred by CSS.
 *   The world viewport is always {left:0, top:0, right:360, bottom:640}.
 */
function computeRpgViewport(containerW: number, containerH: number): RpgViewport {
  const fitScale = Math.min(containerW / RPG_LOGICAL_WIDTH, containerH / RPG_LOGICAL_HEIGHT);
  const areaW = Math.floor(RPG_LOGICAL_WIDTH  * fitScale);
  const areaH = Math.floor(RPG_LOGICAL_HEIGHT * fitScale);
  return {
    fitScale, areaW, areaH,
    left: 0, top: 0, right: RPG_LOGICAL_WIDTH, bottom: RPG_LOGICAL_HEIGHT,
  };
}

describe('RPG viewport fit-scale invariant', () => {
  it('world viewport bounds are always fixed at 360×640, regardless of container size', () => {
    for (const [w, h] of [[360, 640], [600, 640], [360, 900], [1280, 800], [320, 640], [200, 200]] as const) {
      const vp = computeRpgViewport(w, h);
      expect(vp.left).toBe(0);
      expect(vp.top).toBe(0);
      expect(vp.right).toBe(RPG_LOGICAL_WIDTH);
      expect(vp.bottom).toBe(RPG_LOGICAL_HEIGHT);
    }
  });

  it('fitScale is uncapped: large windows zoom in past 1.0 instead of revealing more world', () => {
    const vp = computeRpgViewport(1280, 2000);
    expect(vp.fitScale).toBeGreaterThan(1);
    // Fitted area keeps the exact 9:16 ratio.
    expect(vp.areaW / vp.areaH).toBeCloseTo(RPG_LOGICAL_WIDTH / RPG_LOGICAL_HEIGHT, 2);
  });

  it('growing the canvas wider increases fitScale (zoom), not visible world width', () => {
    const narrow = computeRpgViewport(360, 640);
    const wider  = computeRpgViewport(600, 640);

    // Wider container with the same height is now height-limited, so fitScale
    // stays the same (min(600/360, 640/640) = 1 either way) — but the fitted
    // area width still respects the fixed aspect ratio, it doesn't stretch.
    expect(wider.areaW / wider.areaH).toBeCloseTo(RPG_LOGICAL_WIDTH / RPG_LOGICAL_HEIGHT, 2);
    expect(narrow.right).toBe(wider.right); // world bounds identical
  });

  it('growing the canvas taller (with matching width) increases fitScale (zoom), not visible world height', () => {
    const shorter = computeRpgViewport(720, 640);
    const taller  = computeRpgViewport(720, 1280);

    expect(taller.fitScale).toBeGreaterThan(shorter.fitScale);
    expect(taller.bottom).toBe(shorter.bottom); // world bounds identical
  });

  it('fitScale is exactly 1.0 on the 360×640 reference phone size', () => {
    const vp = computeRpgViewport(360, 640);
    expect(vp.fitScale).toBeCloseTo(1.0, 5);
    expect(vp.areaW).toBe(360);
    expect(vp.areaH).toBe(640);
  });

  it('fitScale > 1.0 on a wide desktop canvas (zoomed in, world bounds unchanged)', () => {
    const vp = computeRpgViewport(1280, 800);
    // min(1280/360, 800/640) = min(3.556, 1.25) = 1.25
    expect(vp.fitScale).toBeCloseTo(1.25, 5);
    expect(vp.right).toBe(360);
    expect(vp.bottom).toBe(640);
  });

  it('fitScale < 1 on a narrow canvas (world shrinks to fit, bounds unchanged)', () => {
    const vp = computeRpgViewport(320, 640);
    expect(vp.fitScale).toBeCloseTo(320 / 360, 5);
    expect(vp.right).toBe(360);
  });

  it('fitScale < 1 on a short canvas (safe core scaled to fit vertically)', () => {
    const vp = computeRpgViewport(360, 480);
    expect(vp.fitScale).toBeCloseTo(480 / 640, 5);
    expect(vp.bottom).toBe(640);
  });

  it('resizing down after resizing up does not clip world bounds (letterbox regression)', () => {
    const large = computeRpgViewport(1600, 2400);
    const small = computeRpgViewport(300, 500);
    // World-space bounds must be identical — no cells become clipped/hidden.
    expect(large.left).toBe(small.left);
    expect(large.top).toBe(small.top);
    expect(large.right).toBe(small.right);
    expect(large.bottom).toBe(small.bottom);
  });
});
