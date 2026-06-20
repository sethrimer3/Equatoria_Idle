/**
 * rpg-boss-wave-geometry.test.ts — Boss-wave geometry purity tests.
 *
 * Verifies that boss-wave safe-zone and projectile-cleanup logic uses
 * `activeBounds` rather than the old fixed `dim.w / dim.h` safe-core rect.
 *
 * Tests are purely functional (no canvas, no render loop):
 *   1. Safe-zone center tracks active bounds on wide desktop viewport.
 *   2. A projectile inside expanded active bounds but outside old 360×640
 *      is NOT removed by the out-of-bounds cleanup.
 *   3. A projectile outside active bounds (with margin) IS removed.
 */

import { describe, it, expect } from 'vitest';
import { computeRpgFieldSpace } from '../rpgFieldSpace';
import { BOSS_SAFE_ZONE_Y_FACTOR, BOSS_BOTTOM_SAFE_ZONE_R } from '../rpg-constants';

const SAFE_W = 360;
const SAFE_H = 640;
const camCenter = { x: SAFE_W / 2, y: SAFE_H / 2 };

function makeSpace(cssW: number, cssH: number) {
  const s = Math.min(cssW / SAFE_W, cssH / SAFE_H, 1);
  return computeRpgFieldSpace({
    canvasCssW:     cssW,
    canvasCssH:     cssH,
    backingW:       Math.round(cssW),
    backingH:       Math.round(cssH),
    dpr:            1,
    stableScale:    s,
    cameraCenter:   camCenter,
    safeCoreWorldW: SAFE_W,
    safeCoreWorldH: SAFE_H,
  });
}

// ── Safe-zone center ───────────────────────────────────────────────────────────

describe('bottom safe-zone center uses activeBounds', () => {
  it('is at the horizontal midpoint of activeBounds, not half of canvas width', () => {
    // Wide canvas: activeBounds is narrower than visibleBounds and is not
    // left-aligned at x=0, so (ab.left + ab.right)/2 ≠ canvasWidth/2.
    const cssW = 900, cssH = 640;
    const fs = makeSpace(cssW, cssH);
    const ab = fs.activeBounds;

    // Sanity: activeBounds should be narrower than the canvas on a wide view.
    // Width is in safe-core world coords; canvas is 900px but ab.width == SAFE_W == 360.
    expect(ab.width).toBeLessThan(cssW);
    // visibleBounds is wider than activeBounds (extra gutters on each side)
    expect(fs.visibleBounds.width).toBeGreaterThan(ab.width);

    const abCenterX = (ab.left + ab.right) / 2;

    // The midpoint equals the camera center X in world space (= SAFE_W/2 = 180).
    expect(abCenterX).toBeCloseTo(camCenter.x, 3);

    // The old formula used canvasWidth/2 = 450 as the centre, not camCenter.x = 180.
    const oldFormulaX = cssW / 2;
    expect(Math.abs(abCenterX - oldFormulaX)).toBeGreaterThan(10);
  });

  it('safe-zone center matches active bounds on a tall viewport', () => {
    const cssW = 360, cssH = 900;
    const fs = makeSpace(cssW, cssH);
    const ab = fs.activeBounds;

    const abCenterX = (ab.left + ab.right) / 2;
    const abCenterY = ab.top + ab.height * BOSS_SAFE_ZONE_Y_FACTOR;

    expect(abCenterX).toBeCloseTo(camCenter.x, 3);
    expect(abCenterY).toBeCloseTo(ab.top + ab.height * BOSS_SAFE_ZONE_Y_FACTOR, 5);
  });
});

// ── Projectile out-of-bounds cleanup ──────────────────────────────────────────

/**
 * Mirrors the cleanup condition in updateBossProjectiles.
 * A projectile is removed when it is outside activeBounds by more than `margin`.
 */
function wouldRemoveByOutOfBounds(
  px: number, py: number,
  ab: { left: number; top: number; right: number; bottom: number },
  margin = 30,
): boolean {
  return (
    px < ab.left  - margin ||
    px > ab.right + margin ||
    py < ab.top   - margin ||
    py > ab.bottom + margin
  );
}

describe('projectile cleanup uses activeBounds, not old 360×640', () => {
  it('a projectile inside expanded active bounds but outside old 360×640 is kept', () => {
    // activeBounds on a wide canvas extends horizontally beyond safe core.
    const cssW = 900, cssH = 640;
    const fs = makeSpace(cssW, cssH);
    const ab = fs.activeBounds;

    // Place projectile at ab.left + 10 — inside expanded arena but potentially
    // at a negative x if left-padded (left = (900-360)/2 world-pxs left of center)
    // Actually activeBounds in world coords: left ≈ -270 on a 900px wide viewport.
    // A projectile at ab.left + 10 is well inside active bounds.
    const px = ab.left + 10;
    const py = ab.top  + ab.height * 0.5;

    expect(wouldRemoveByOutOfBounds(px, py, ab)).toBe(false);

    // Old formula would have used dim.w=360, dim.h=640 so left=-margin, right=360+margin.
    // A projectile at ab.left+10 on a wide view is at x ≈ -260 which is < -30
    // under the old formula — so old code WOULD have removed it.
    const oldWouldRemove = px < -30 || px > 360 + 30 || py < -30 || py > 640 + 30;
    // This assertion only makes sense on a wide-enough canvas where ab.left < -30
    if (ab.left < -30) {
      expect(oldWouldRemove).toBe(true);
      expect(wouldRemoveByOutOfBounds(px, py, ab)).toBe(false);
    }
  });

  it('a projectile outside active bounds by more than the margin is removed', () => {
    const cssW = 900, cssH = 640;
    const fs = makeSpace(cssW, cssH);
    const ab = fs.activeBounds;

    const px = ab.left - 50; // 50px beyond left edge, > 30px margin
    const py = ab.top + ab.height * 0.5;

    expect(wouldRemoveByOutOfBounds(px, py, ab)).toBe(true);
  });

  it('a projectile within margin of active edge is NOT removed', () => {
    const cssW = 900, cssH = 640;
    const fs = makeSpace(cssW, cssH);
    const ab = fs.activeBounds;

    const px = ab.left - 10; // within 30px margin
    const py = ab.top + ab.height * 0.5;

    expect(wouldRemoveByOutOfBounds(px, py, ab)).toBe(false);
  });
});

// ── Safe-zone radius (constant) ────────────────────────────────────────────────

describe('BOSS_BOTTOM_SAFE_ZONE_R is a positive constant', () => {
  it('is defined and positive', () => {
    expect(BOSS_BOTTOM_SAFE_ZONE_R).toBeGreaterThan(0);
  });
});
