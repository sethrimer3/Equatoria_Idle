/**
 * rpgFieldSpace.test.ts — Regression tests for the RpgFieldSpace abstraction.
 *
 * Core invariants verified here:
 *   1. Scale does not increase when only canvas width grows.
 *   2. Scale does not increase when only canvas height grows.
 *   3. visibleBounds.width  increases when canvas grows wider.
 *   4. visibleBounds.height increases when canvas grows taller.
 *   5. safeCoreBounds always equals the fixed safeCoreWorldW × safeCoreWorldH.
 *   6. paddedEffectBounds correctly wraps visibleBounds.
 *   7. worldToScreen / screenToWorld are mutual inverses.
 *   8. activeBounds preserves the safe-core aspect ratio inside visibleBounds.
 *   9. spawnBounds equals activeBounds (current policy).
 *
 * These tests mirror the scale invariant checked in rpg-viewport.test.ts but
 * operate on the higher-level RpgFieldSpace type.
 */

import { describe, it, expect } from 'vitest';
import { computeRpgFieldSpace } from '../rpgFieldSpace';

/** Reference safe-core dimensions (mirrors RPG_LOGICAL_WIDTH / HEIGHT). */
const SAFE_W = 360;
const SAFE_H = 640;

/**
 * Computes the stable RPG scale from container dimensions.
 * Mirrors `computeRpgSafeCoreScale()` and the `doResize()` formula in rpg-render.ts.
 */
function stableScale(containerW: number, containerH: number): number {
  return Math.min(containerW / SAFE_W, containerH / SAFE_H, 1);
}

/** Default camera centre = centre of the safe core. */
const camCenter = { x: SAFE_W / 2, y: SAFE_H / 2 };

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSpace(cssW: number, cssH: number, dpr = 1) {
  const s = stableScale(cssW, cssH);
  return computeRpgFieldSpace({
    canvasCssW:     cssW,
    canvasCssH:     cssH,
    backingW:       Math.round(cssW * dpr),
    backingH:       Math.round(cssH * dpr),
    dpr,
    stableScale:    s,
    cameraCenter:   camCenter,
    safeCoreWorldW: SAFE_W,
    safeCoreWorldH: SAFE_H,
  });
}

// ── Scale-invariant tests ─────────────────────────────────────────────────────

describe('computeRpgFieldSpace — scale invariant', () => {
  it('scale does not increase when canvas grows wider', () => {
    const narrow = makeSpace(360, 640);
    const wide   = makeSpace(760, 640);
    expect(wide.scale).toBeCloseTo(narrow.scale, 5);
    expect(wide.visibleBounds.width).toBeGreaterThan(narrow.visibleBounds.width);
    expect(wide.visibleBounds.height).toBeCloseTo(narrow.visibleBounds.height, 3);
  });

  it('scale does not increase when canvas grows taller', () => {
    const short = makeSpace(360, 640);
    const tall  = makeSpace(360, 900);
    expect(tall.scale).toBeCloseTo(short.scale, 5);
    expect(tall.visibleBounds.height).toBeGreaterThan(short.visibleBounds.height);
    expect(tall.visibleBounds.width).toBeCloseTo(short.visibleBounds.width, 3);
  });

  it('scale is exactly 1.0 on the reference 360×640 phone', () => {
    const fs = makeSpace(360, 640);
    expect(fs.scale).toBeCloseTo(1.0, 5);
  });

  it('scale is exactly 1.0 on a wide desktop canvas', () => {
    const fs = makeSpace(1280, 800);
    // min(1280, 800, 360) = 360 → scale = 1.0
    expect(fs.scale).toBeCloseTo(1.0, 5);
  });

  it('scale < 1 on a narrow canvas', () => {
    const fs = makeSpace(320, 640);
    // min(320/360, 640/640, 1) = min(0.888, 1, 1) = 320/360
    expect(fs.scale).toBeCloseTo(320 / 360, 5);
  });

  it('scale < 1 on a short canvas (height now limits scale)', () => {
    const fs = makeSpace(360, 480);
    // min(360/360, 480/640, 1) = min(1, 0.75, 1) = 480/640
    expect(fs.scale).toBeCloseTo(480 / 640, 5);
  });
});

// ── Visible bounds shape ──────────────────────────────────────────────────────

describe('computeRpgFieldSpace — visibleBounds', () => {
  it('visibleBounds covers exactly the CSS canvas size at scale 1', () => {
    const fs = makeSpace(600, 800);
    expect(fs.visibleBounds.width).toBeCloseTo(600, 3);
    expect(fs.visibleBounds.height).toBeCloseTo(800, 3);
  });

  it('visibleBounds is centred on cameraCenter', () => {
    const fs = makeSpace(600, 640);
    const midX = (fs.visibleBounds.left + fs.visibleBounds.right) / 2;
    const midY = (fs.visibleBounds.top + fs.visibleBounds.bottom) / 2;
    expect(midX).toBeCloseTo(camCenter.x, 3);
    expect(midY).toBeCloseTo(camCenter.y, 3);
  });

  it('visibleBounds.left < 0 when canvas is wider than safeCore at scale 1', () => {
    const fs = makeSpace(760, 640);
    expect(fs.visibleBounds.left).toBeLessThan(0);
    expect(fs.visibleBounds.right).toBeGreaterThan(SAFE_W);
  });

  it('reference device: visibleBounds == safeCoreBounds', () => {
    const fs = makeSpace(360, 640);
    expect(fs.visibleBounds.left).toBeCloseTo(fs.safeCoreBounds.left, 3);
    expect(fs.visibleBounds.right).toBeCloseTo(fs.safeCoreBounds.right, 3);
    expect(fs.visibleBounds.top).toBeCloseTo(fs.safeCoreBounds.top, 3);
    expect(fs.visibleBounds.bottom).toBeCloseTo(fs.safeCoreBounds.bottom, 3);
  });
});

// ── safeCoreBounds is always fixed ────────────────────────────────────────────

describe('computeRpgFieldSpace — safeCoreBounds', () => {
  it('safeCoreBounds width is always safeCoreWorldW regardless of canvas size', () => {
    for (const [w, h] of [[360, 640], [600, 640], [1280, 800], [320, 480]] as const) {
      const fs = makeSpace(w, h);
      expect(fs.safeCoreBounds.width).toBeCloseTo(SAFE_W, 3);
      expect(fs.safeCoreBounds.height).toBeCloseTo(SAFE_H, 3);
    }
  });

  it('safeCoreBounds is centred on cameraCenter', () => {
    const fs = makeSpace(1280, 800);
    expect((fs.safeCoreBounds.left + fs.safeCoreBounds.right) / 2).toBeCloseTo(camCenter.x, 3);
    expect((fs.safeCoreBounds.top + fs.safeCoreBounds.bottom) / 2).toBeCloseTo(camCenter.y, 3);
  });
});

// ── activeBounds and spawnBounds follow current policy ────────────────────────

describe('computeRpgFieldSpace — activeBounds and spawnBounds', () => {
  it('activeBounds equals visibleBounds when the visible world has the safe-core ratio', () => {
    const fs = makeSpace(360, 640);
    expect(fs.activeBounds.left).toBeCloseTo(fs.visibleBounds.left, 5);
    expect(fs.activeBounds.right).toBeCloseTo(fs.visibleBounds.right, 5);
    expect(fs.activeBounds.top).toBeCloseTo(fs.visibleBounds.top, 5);
    expect(fs.activeBounds.bottom).toBeCloseTo(fs.visibleBounds.bottom, 5);
  });

  it('activeBounds grows to the largest safe-core-ratio arena inside a wide desktop view', () => {
    const fs = makeSpace(1280, 800);
    expect(fs.activeBounds.height).toBeCloseTo(800, 3);
    expect(fs.activeBounds.width).toBeCloseTo(450, 3);
    expect(fs.activeBounds.width / fs.activeBounds.height).toBeCloseTo(SAFE_W / SAFE_H, 5);
    expect(fs.activeBounds.left).toBeGreaterThan(fs.visibleBounds.left);
    expect(fs.activeBounds.right).toBeLessThan(fs.visibleBounds.right);
    expect(fs.activeBounds.top).toBeCloseTo(fs.visibleBounds.top, 3);
    expect(fs.activeBounds.bottom).toBeCloseTo(fs.visibleBounds.bottom, 3);
  });

  it('activeBounds grows to the largest safe-core-ratio arena inside a tall view', () => {
    const fs = makeSpace(760, 900);
    expect(fs.activeBounds.width).toBeCloseTo(506.25, 3);
    expect(fs.activeBounds.height).toBeCloseTo(900, 3);
    expect(fs.activeBounds.width / fs.activeBounds.height).toBeCloseTo(SAFE_W / SAFE_H, 5);
    expect(fs.activeBounds.left).toBeGreaterThan(fs.visibleBounds.left);
    expect(fs.activeBounds.right).toBeLessThan(fs.visibleBounds.right);
  });

  it('spawnBounds equals activeBounds', () => {
    const fs = makeSpace(760, 900);
    expect(fs.spawnBounds.left).toBeCloseTo(fs.activeBounds.left, 5);
    expect(fs.spawnBounds.right).toBeCloseTo(fs.activeBounds.right, 5);
    expect(fs.spawnBounds.top).toBeCloseTo(fs.activeBounds.top, 5);
    expect(fs.spawnBounds.bottom).toBeCloseTo(fs.activeBounds.bottom, 5);
  });
});

// ── paddedEffectBounds ────────────────────────────────────────────────────────

describe('computeRpgFieldSpace — paddedEffectBounds', () => {
  it('paddedEffectBounds is larger than visibleBounds by effectPadding on each edge', () => {
    const pad = 96;
    const fs = makeSpace(360, 640);
    expect(fs.paddedEffectBounds.left).toBeCloseTo(fs.visibleBounds.left - pad, 3);
    expect(fs.paddedEffectBounds.top).toBeCloseTo(fs.visibleBounds.top - pad, 3);
    expect(fs.paddedEffectBounds.right).toBeCloseTo(fs.visibleBounds.right + pad, 3);
    expect(fs.paddedEffectBounds.bottom).toBeCloseTo(fs.visibleBounds.bottom + pad, 3);
  });

  it('custom effectPaddingWorld is honoured', () => {
    const customPad = 50;
    const s = stableScale(360, 640);
    const fs = computeRpgFieldSpace({
      canvasCssW: 360, canvasCssH: 640,
      backingW: 360, backingH: 640, dpr: 1,
      stableScale: s,
      cameraCenter: camCenter,
      safeCoreWorldW: SAFE_W,
      safeCoreWorldH: SAFE_H,
      effectPaddingWorld: customPad,
    });
    expect(fs.paddedEffectBounds.left).toBeCloseTo(fs.visibleBounds.left - customPad, 3);
    expect(fs.paddedEffectBounds.right).toBeCloseTo(fs.visibleBounds.right + customPad, 3);
  });
});

// ── Coordinate helpers ────────────────────────────────────────────────────────

describe('computeRpgFieldSpace — worldToScreen / screenToWorld', () => {
  it('worldToScreen maps visibleBounds top-left to screen origin (0,0)', () => {
    const fs = makeSpace(600, 640);
    const screen = fs.worldToScreen({ x: fs.visibleBounds.left, y: fs.visibleBounds.top });
    expect(screen.x).toBeCloseTo(0, 3);
    expect(screen.y).toBeCloseTo(0, 3);
  });

  it('worldToScreen maps visibleBounds bottom-right to (canvasCssW, canvasCssH)', () => {
    const fs = makeSpace(600, 640);
    const screen = fs.worldToScreen({ x: fs.visibleBounds.right, y: fs.visibleBounds.bottom });
    expect(screen.x).toBeCloseTo(fs.canvasCssW, 3);
    expect(screen.y).toBeCloseTo(fs.canvasCssH, 3);
  });

  it('screenToWorld is the inverse of worldToScreen', () => {
    const fs = makeSpace(760, 800);
    const worldPt = { x: 123.4, y: 456.7 };
    const screen  = fs.worldToScreen(worldPt);
    const back    = fs.screenToWorld(screen);
    expect(back.x).toBeCloseTo(worldPt.x, 5);
    expect(back.y).toBeCloseTo(worldPt.y, 5);
  });

  it('screenToWorld(0, 0) == visibleBounds top-left', () => {
    const fs = makeSpace(760, 800);
    const world = fs.screenToWorld({ x: 0, y: 0 });
    expect(world.x).toBeCloseTo(fs.visibleBounds.left, 5);
    expect(world.y).toBeCloseTo(fs.visibleBounds.top, 5);
  });
});

// ── Problem-statement regression example ─────────────────────────────────────

describe('computeRpgFieldSpace — problem-statement regression', () => {
  /**
   * Mirrors the explicit example given in the problem statement:
   *   narrow vs wide canvas — scale must stay stable, visible width must grow.
   */
  it('wide canvas reveals more world without zooming in', () => {
    const narrow = computeRpgFieldSpace({
      canvasCssW:     360,
      canvasCssH:     640,
      backingW:       360,
      backingH:       640,
      dpr:            1,
      stableScale:    1,
      cameraCenter:   { x: 0, y: 0 },
      safeCoreWorldW: 360,
      safeCoreWorldH: 640,
    });

    const wide = computeRpgFieldSpace({
      canvasCssW:     760,
      canvasCssH:     640,
      backingW:       760,
      backingH:       640,
      dpr:            1,
      stableScale:    1,
      cameraCenter:   { x: 0, y: 0 },
      safeCoreWorldW: 360,
      safeCoreWorldH: 640,
    });

    expect(wide.scale).toBeCloseTo(narrow.scale, 5);
    expect(wide.visibleBounds.width).toBeGreaterThan(narrow.visibleBounds.width);
    expect(wide.visibleBounds.height).toBeCloseTo(narrow.visibleBounds.height, 3);
    expect(wide.visibleBounds.left).toBeLessThan(narrow.visibleBounds.left);
    expect(wide.visibleBounds.right).toBeGreaterThan(narrow.visibleBounds.right);
  });
});

// ── Safe-core fit regression cases (from problem statement) ───────────────────

describe('computeRpgFieldSpace — safe-core fit regression cases', () => {
  it('wide but too short (480×415): safeCoreBounds fully inside visibleBounds', () => {
    const fs = makeSpace(480, 415);
    // min(480/360, 415/640, 1) = 415/640 ≈ 0.648
    expect(fs.scale).toBeCloseTo(415 / 640, 5);
    // visibleBounds must fully contain the safe core.
    expect(fs.visibleBounds.height).toBeCloseTo(640, 2);
    expect(fs.visibleBounds.width).toBeGreaterThan(360);
    expect(fs.visibleBounds.left).toBeLessThanOrEqual(fs.safeCoreBounds.left + 0.01);
    expect(fs.visibleBounds.right).toBeGreaterThanOrEqual(fs.safeCoreBounds.right - 0.01);
    expect(fs.visibleBounds.top).toBeLessThanOrEqual(fs.safeCoreBounds.top + 0.01);
    expect(fs.visibleBounds.bottom).toBeGreaterThanOrEqual(fs.safeCoreBounds.bottom - 0.01);
  });

  it('narrow phone (320×640): safeCoreBounds fully inside visibleBounds', () => {
    const fs = makeSpace(320, 640);
    expect(fs.scale).toBeCloseTo(320 / 360, 5);
    expect(fs.visibleBounds.width).toBeCloseTo(360, 2);
    expect(fs.visibleBounds.height).toBeGreaterThanOrEqual(640 - 0.01);
    expect(fs.visibleBounds.left).toBeLessThanOrEqual(fs.safeCoreBounds.left + 0.01);
    expect(fs.visibleBounds.top).toBeLessThanOrEqual(fs.safeCoreBounds.top + 0.01);
  });

  it('very short host (360×400): safeCoreBounds fully inside visibleBounds', () => {
    const fs = makeSpace(360, 400);
    expect(fs.scale).toBeCloseTo(400 / 640, 5);
    expect(fs.visibleBounds.height).toBeCloseTo(640, 2);
    expect(fs.visibleBounds.width).toBeGreaterThanOrEqual(360 - 0.01);
    expect(fs.visibleBounds.top).toBeLessThanOrEqual(fs.safeCoreBounds.top + 0.01);
    expect(fs.visibleBounds.bottom).toBeGreaterThanOrEqual(fs.safeCoreBounds.bottom - 0.01);
  });
});
