/**
 * rpg-weapon-draw-fracteryl.ts — Canvas draw functions for the Fracteryl Spear Array.
 *
 * Draws:
 *   - Crystalline spears orbiting/flying toward targets
 *   - Fractal bloom line-trees at impact points
 */

import type { FracterylSpear, FracterylBloom } from './rpg-weapon-fracteryl-spear';
import { FRACTERYL_SPEAR_COLOR, FRACTERYL_BLOOM_CORE, FRACTERYL_BLOOM_COLOR } from './rpg-weapon-fracteryl-spear';

let isLowGraphics = false;

export function setFracterylLowGraphicsMode(enabled: boolean): void {
  isLowGraphics = enabled;
}

// ── Spear draw ────────────────────────────────────────────────────────────────

const SHAFT_LEN   = 14;
const SHAFT_W     = 2.2;
const HEAD_LEN    = 7;
const HEAD_W      = 4;

export function drawFracterylSpears(canvas2d: CanvasRenderingContext2D, spears: FracterylSpear[]): void {
  if (spears.length === 0) return;
  canvas2d.save();

  for (const s of spears) {
    const alpha = s.state === 'forming'
      ? 0.55 + 0.45 * Math.max(0, 1 - s.delayMs / 400)
      : Math.min(1, s.lifeMs / 120);
    canvas2d.globalAlpha = alpha;

    const cos = Math.cos(s.angle);
    const sin = Math.sin(s.angle);
    const perCos = -sin;
    const perSin = cos;

    // Glow
    if (!isLowGraphics) {
      canvas2d.shadowBlur = 8;
      canvas2d.shadowColor = FRACTERYL_SPEAR_COLOR;
    }

    // Shaft
    canvas2d.fillStyle = FRACTERYL_SPEAR_COLOR;
    canvas2d.beginPath();
    canvas2d.moveTo(s.x - cos * SHAFT_LEN / 2 + perCos * SHAFT_W / 2,
                    s.y - sin * SHAFT_LEN / 2 + perSin * SHAFT_W / 2);
    canvas2d.lineTo(s.x + cos * SHAFT_LEN / 2 + perCos * SHAFT_W / 2,
                    s.y + sin * SHAFT_LEN / 2 + perSin * SHAFT_W / 2);
    canvas2d.lineTo(s.x + cos * SHAFT_LEN / 2 - perCos * SHAFT_W / 2,
                    s.y + sin * SHAFT_LEN / 2 - perSin * SHAFT_W / 2);
    canvas2d.lineTo(s.x - cos * SHAFT_LEN / 2 - perCos * SHAFT_W / 2,
                    s.y - sin * SHAFT_LEN / 2 - perSin * SHAFT_W / 2);
    canvas2d.closePath();
    canvas2d.fill();

    // Diamond spearhead at tip
    const tipX = s.x + cos * (SHAFT_LEN / 2);
    const tipY = s.y + sin * (SHAFT_LEN / 2);
    canvas2d.fillStyle = '#ffffff';
    canvas2d.beginPath();
    canvas2d.moveTo(tipX + cos * HEAD_LEN,            tipY + sin * HEAD_LEN);
    canvas2d.lineTo(tipX + perCos * HEAD_W / 2,       tipY + perSin * HEAD_W / 2);
    canvas2d.lineTo(tipX - cos * HEAD_LEN * 0.3,      tipY - sin * HEAD_LEN * 0.3);
    canvas2d.lineTo(tipX - perCos * HEAD_W / 2,       tipY - perSin * HEAD_W / 2);
    canvas2d.closePath();
    canvas2d.fill();
  }

  canvas2d.shadowBlur = 0;
  canvas2d.restore();
}

// ── Bloom draw ────────────────────────────────────────────────────────────────

const GEN_WIDTHS = [2.0, 1.4, 1.0, 0.7, 0.5, 0.4];

export function drawFracterylBlooms(canvas2d: CanvasRenderingContext2D, blooms: FracterylBloom[]): void {
  if (blooms.length === 0) return;
  canvas2d.save();

  for (const bloom of blooms) {
    const lifeFrac = bloom.lifeMs / bloom.maxLifeMs;

    for (const branch of bloom.branches) {
      const genFrac = 1 - branch.generation * 0.15;
      const alpha = lifeFrac * genFrac * 0.85;
      if (alpha <= 0.02) continue;

      canvas2d.globalAlpha = alpha;
      canvas2d.lineWidth = GEN_WIDTHS[Math.min(branch.generation, GEN_WIDTHS.length - 1)] ?? 0.4;

      if (!isLowGraphics && branch.generation === 0) {
        canvas2d.shadowBlur = 6;
        canvas2d.shadowColor = FRACTERYL_BLOOM_CORE;
      } else {
        canvas2d.shadowBlur = 0;
      }

      canvas2d.strokeStyle = branch.generation === 0 ? FRACTERYL_BLOOM_CORE : FRACTERYL_BLOOM_COLOR;
      canvas2d.beginPath();
      canvas2d.moveTo(branch.x1, branch.y1);
      canvas2d.lineTo(branch.x2, branch.y2);
      canvas2d.stroke();

      // Small mote at tip for gen 0 and gen 1
      if (!isLowGraphics && branch.generation <= 1) {
        const size = branch.generation === 0 ? 2.5 : 1.5;
        canvas2d.fillStyle = FRACTERYL_BLOOM_CORE;
        canvas2d.globalAlpha = alpha * 0.9;
        canvas2d.beginPath();
        canvas2d.rect(branch.x2 - size / 2, branch.y2 - size / 2, size, size);
        canvas2d.fill();
      }
    }
  }

  canvas2d.shadowBlur = 0;
  canvas2d.restore();
}
