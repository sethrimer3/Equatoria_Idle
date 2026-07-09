/**
 * rpgFieldSpace.test.ts — Regression tests for the RpgFieldSpace abstraction.
 *
 * Core invariants verified here (post-fit-scale fix):
 *   1. doResize() always feeds computeRpgFieldSpace a canvasCssW/canvasCssH with
 *      the exact 360:640 safe-core aspect ratio (the fitted letterbox/pillarbox
 *      area), so visibleBounds/activeBounds/safeCoreBounds/spawnBounds are always
 *      the fixed 360×640 world rect regardless of container size.
 *   2. Only scale, canvasCssW, canvasCssH, backingW, backingH differ between a
 *      small and a large/tall container.
 *   3. worldToScreen / screenToWorld are mutual inverses at multiple sizes.
 *   4. paddedEffectBounds correctly wraps visibleBounds.
 */

import { describe, it, expect } from 'vitest';
import { computeRpgFieldSpace, computeRpgSafeCoreScale } from '../rpgFieldSpace';

/** Reference safe-core dimensions (mirrors RPG_LOGICAL_WIDTH / HEIGHT). */
const SAFE_W = 360;
const SAFE_H = 640;

/** Default camera centre = centre of the safe core. */
const camCenter = { x: SAFE_W / 2, y: SAFE_H / 2 };

/**
 * Mirrors doResize(): computes the fitted (letterboxed/pillarboxed) area for a
 * given container size, then builds the field space from that fitted area —
 * exactly what the fixed rpg-render.ts doResize() now does.
 */
function makeSpaceForContainer(containerW: number, containerH: number, dpr = 1) {
  const fitScale = computeRpgSafeCoreScale(containerW, containerH, SAFE_W, SAFE_H);
  const areaW = Math.floor(SAFE_W * fitScale);
  const areaH = Math.floor(SAFE_H * fitScale);
  return computeRpgFieldSpace({
    canvasCssW:     areaW,
    canvasCssH:     areaH,
    backingW:       Math.round(areaW * dpr),
    backingH:       Math.round(areaH * dpr),
    dpr,
    stableScale:    fitScale,
    cameraCenter:   camCenter,
    safeCoreWorldW: SAFE_W,
    safeCoreWorldH: SAFE_H,
  });
}

// ── Fit-scale invariant: fixed bounds regardless of container size ────────────

describe('computeRpgSafeCoreScale — uncapped fit scale', () => {
  it('is uncapped: a large window scales up past 1.0', () => {
    const s = computeRpgSafeCoreScale(1280, 2000, SAFE_W, SAFE_H);
    expect(s).toBeGreaterThan(1);
    expect(s).toBeCloseTo(2000 / SAFE_H, 5); // height is the limiting dimension
  });

  it('scales down to fit a small container', () => {
    const s = computeRpgSafeCoreScale(320, 640, SAFE_W, SAFE_H);
    expect(s).toBeCloseTo(320 / SAFE_W, 5);
  });
});

describe('doResize-style fitted field space — fixed world bounds', () => {
  it('a small container and a large/tall container yield identical visible/active/safeCore/spawn bounds', () => {
    const small = makeSpaceForContainer(360, 640);
    const large = makeSpaceForContainer(1600, 2400);

    for (const key of ['visibleBounds', 'activeBounds', 'safeCoreBounds', 'spawnBounds'] as const) {
      expect(large[key].left).toBeCloseTo(small[key].left, 1);
      expect(large[key].top).toBeCloseTo(small[key].top, 1);
      expect(large[key].right).toBeCloseTo(small[key].right, 1);
      expect(large[key].bottom).toBeCloseTo(small[key].bottom, 1);
      expect(large[key].width).toBeCloseTo(SAFE_W, 1);
      expect(large[key].height).toBeCloseTo(SAFE_H, 1);
    }
  });

  it('a wide-but-short container and a narrow-but-tall container also yield identical fixed bounds', () => {
    const wideShort = makeSpaceForContainer(1200, 500);
    const tallNarrow = makeSpaceForContainer(300, 1000);

    for (const key of ['visibleBounds', 'activeBounds', 'safeCoreBounds', 'spawnBounds'] as const) {
      expect(wideShort[key].left).toBeCloseTo(tallNarrow[key].left, 0);
      expect(wideShort[key].right).toBeCloseTo(tallNarrow[key].right, 0);
      expect(wideShort[key].top).toBeCloseTo(tallNarrow[key].top, 0);
      expect(wideShort[key].bottom).toBeCloseTo(tallNarrow[key].bottom, 0);
    }
  });

  it('only scale/canvasCssW/canvasCssH/backingW/backingH differ between a small and large container', () => {
    const small = makeSpaceForContainer(360, 640);
    const large = makeSpaceForContainer(1440, 2560);

    expect(large.scale).toBeGreaterThan(small.scale);
    expect(large.canvasCssW).toBeGreaterThan(small.canvasCssW);
    expect(large.canvasCssH).toBeGreaterThan(small.canvasCssH);
    expect(large.backingW).toBeGreaterThan(small.backingW);
    expect(large.backingH).toBeGreaterThan(small.backingH);

    // Fixed regardless of size:
    expect(large.cameraCenterX).toBeCloseTo(small.cameraCenterX, 5);
    expect(large.cameraCenterY).toBeCloseTo(small.cameraCenterY, 5);
    expect(large.visibleBounds.width).toBeCloseTo(small.visibleBounds.width, 1);
    expect(large.visibleBounds.height).toBeCloseTo(small.visibleBounds.height, 1);
  });

  it('reference device: visibleBounds == safeCoreBounds == activeBounds == spawnBounds', () => {
    const fs = makeSpaceForContainer(360, 640);
    for (const key of ['activeBounds', 'safeCoreBounds', 'spawnBounds'] as const) {
      expect(fs[key].left).toBeCloseTo(fs.visibleBounds.left, 3);
      expect(fs[key].right).toBeCloseTo(fs.visibleBounds.right, 3);
      expect(fs[key].top).toBeCloseTo(fs.visibleBounds.top, 3);
      expect(fs[key].bottom).toBeCloseTo(fs.visibleBounds.bottom, 3);
    }
  });
});

// ── paddedEffectBounds ────────────────────────────────────────────────────────

describe('computeRpgFieldSpace — paddedEffectBounds', () => {
  it('paddedEffectBounds is larger than visibleBounds by effectPadding on each edge', () => {
    const pad = 96;
    const fs = makeSpaceForContainer(360, 640);
    expect(fs.paddedEffectBounds.left).toBeCloseTo(fs.visibleBounds.left - pad, 3);
    expect(fs.paddedEffectBounds.top).toBeCloseTo(fs.visibleBounds.top - pad, 3);
    expect(fs.paddedEffectBounds.right).toBeCloseTo(fs.visibleBounds.right + pad, 3);
    expect(fs.paddedEffectBounds.bottom).toBeCloseTo(fs.visibleBounds.bottom + pad, 3);
  });

  it('custom effectPaddingWorld is honoured', () => {
    const customPad = 50;
    const fs = computeRpgFieldSpace({
      canvasCssW: 360, canvasCssH: 640,
      backingW: 360, backingH: 640, dpr: 1,
      stableScale: 1,
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
    const fs = makeSpaceForContainer(600, 640);
    const screen = fs.worldToScreen({ x: fs.visibleBounds.left, y: fs.visibleBounds.top });
    expect(screen.x).toBeCloseTo(0, 3);
    expect(screen.y).toBeCloseTo(0, 3);
  });

  it('worldToScreen maps visibleBounds bottom-right to (canvasCssW, canvasCssH)', () => {
    const fs = makeSpaceForContainer(600, 640);
    const screen = fs.worldToScreen({ x: fs.visibleBounds.right, y: fs.visibleBounds.bottom });
    expect(screen.x).toBeCloseTo(fs.canvasCssW, 3);
    expect(screen.y).toBeCloseTo(fs.canvasCssH, 3);
  });

  it('screenToWorld is the inverse of worldToScreen at multiple container sizes', () => {
    for (const [w, h] of [[360, 640], [760, 800], [1600, 2400], [300, 1000]] as const) {
      const fs = makeSpaceForContainer(w, h);
      const worldPt = { x: 123.4, y: 456.7 };
      const screen  = fs.worldToScreen(worldPt);
      const back    = fs.screenToWorld(screen);
      expect(back.x).toBeCloseTo(worldPt.x, 4);
      expect(back.y).toBeCloseTo(worldPt.y, 4);
    }
  });

  it('screenToWorld(0, 0) == visibleBounds top-left', () => {
    const fs = makeSpaceForContainer(760, 800);
    const world = fs.screenToWorld({ x: 0, y: 0 });
    expect(world.x).toBeCloseTo(fs.visibleBounds.left, 5);
    expect(world.y).toBeCloseTo(fs.visibleBounds.top, 5);
  });
});
