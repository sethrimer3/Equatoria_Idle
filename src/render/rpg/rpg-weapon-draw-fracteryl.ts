/**
 * rpg-weapon-draw-fracteryl.ts — Canvas draw functions for the Fracteryl Spear Array.
 *
 * Spears: jagged thunderbolt polyline shaft with forklets + bright diamond tip.
 * Blooms: three fractal variants, each growing outward from the impact point.
 */

import type { FracterylSpear, FracterylBloom, FracterylBranch } from './rpg-weapon-fracteryl-spear';
import {
  FRACTERYL_SPEAR_COLOR,
  FRACTERYL_BLOOM_CORE,
  FRACTERYL_BLOOM_COLOR,
  SPEAR_SPINE_POINTS,
} from './rpg-weapon-fracteryl-spear';

let isLowGraphics = false;

export function setFracterylLowGraphicsMode(enabled: boolean): void {
  isLowGraphics = enabled;
}

// ── Spear constants ────────────────────────────────────────────────────────────

const SHAFT_LEN = 22;  // full shaft length tail→spearhead junction
const HEAD_LEN  = 7;
const HEAD_W    = 4;

// ── Spear draw ────────────────────────────────────────────────────────────────

export function drawFracterylSpears(canvas2d: CanvasRenderingContext2D, spears: FracterylSpear[]): void {
  if (spears.length === 0) return;
  canvas2d.save();

  for (const s of spears) {
    const alpha = s.state === 'forming'
      ? 0.55 + 0.45 * Math.max(0, 1 - s.delayMs / 400)
      : Math.min(1, s.lifeMs / 120);

    const cos    = Math.cos(s.angle);
    const sin    = Math.sin(s.angle);
    const perCos = -sin;
    const perSin = cos;

    const tailX  = s.x - cos * SHAFT_LEN / 2;
    const tailY  = s.y - sin * SHAFT_LEN / 2;
    const juncX  = s.x + cos * SHAFT_LEN / 2;
    const juncY  = s.y + sin * SHAFT_LEN / 2;

    const spineCount = isLowGraphics ? 3 : SPEAR_SPINE_POINTS;

    // ── Outer glow ──────────────────────────────────────────────────────────
    if (!isLowGraphics) {
      canvas2d.globalAlpha = alpha * 0.35;
      canvas2d.strokeStyle = '#4080ff';
      canvas2d.lineWidth   = 5.5;
      canvas2d.shadowBlur  = 12;
      canvas2d.shadowColor = '#60a0ff';
      canvas2d.beginPath();
      canvas2d.moveTo(tailX, tailY);
      for (let i = 0; i < spineCount; i++) {
        const t      = (i + 1) / (spineCount + 1);
        const offset = s.spineOffsets[i] ?? 0;
        canvas2d.lineTo(
          tailX + cos * SHAFT_LEN * t + perCos * offset,
          tailY + sin * SHAFT_LEN * t + perSin * offset,
        );
      }
      canvas2d.lineTo(juncX, juncY);
      canvas2d.stroke();
      canvas2d.shadowBlur = 0;
    }

    // ── Core bolt ───────────────────────────────────────────────────────────
    canvas2d.globalAlpha = alpha;
    canvas2d.strokeStyle = '#e8f8ff';
    canvas2d.lineWidth   = 1.6;
    canvas2d.beginPath();
    canvas2d.moveTo(tailX, tailY);
    for (let i = 0; i < spineCount; i++) {
      const t      = (i + 1) / (spineCount + 1);
      const offset = s.spineOffsets[i] ?? 0;
      canvas2d.lineTo(
        tailX + cos * SHAFT_LEN * t + perCos * offset,
        tailY + sin * SHAFT_LEN * t + perSin * offset,
      );
    }
    canvas2d.lineTo(juncX, juncY);
    canvas2d.stroke();

    // ── Forklets (seeded, no runtime Random) ────────────────────────────────
    const forkCount = isLowGraphics ? (s.seed & 1) : 1 + ((s.seed >> 2) % 3); // 1–3 forks normal
    canvas2d.strokeStyle = '#80c8ff';
    canvas2d.lineWidth   = 0.9;
    for (let f = 0; f < forkCount; f++) {
      const ptIdx  = 1 + ((s.seed * (f + 3)) % Math.max(1, spineCount - 1)); // internal pt
      const t      = ptIdx / (spineCount + 1);
      const offset = s.spineOffsets[ptIdx - 1] ?? 0;
      const px     = tailX + cos * SHAFT_LEN * t + perCos * offset;
      const py     = tailY + sin * SHAFT_LEN * t + perSin * offset;
      const side   = ((s.seed >> (f * 3 + 1)) & 1) ? 1 : -1;
      const fa     = s.angle + side * (0.45 + ((s.seed >> (f * 5 + 2)) & 0x3) * 0.12);
      const fl     = 4.5 + ((s.seed >> (f * 7)) & 0x3) * 1.5;
      canvas2d.globalAlpha = alpha * 0.55;
      canvas2d.beginPath();
      canvas2d.moveTo(px, py);
      canvas2d.lineTo(px + Math.cos(fa) * fl, py + Math.sin(fa) * fl);
      canvas2d.stroke();
    }

    // ── Spearhead (bright stable diamond tip) ───────────────────────────────
    canvas2d.globalAlpha = alpha;
    const tipX = juncX + cos * HEAD_LEN;
    const tipY = juncY + sin * HEAD_LEN;
    if (!isLowGraphics) {
      canvas2d.shadowBlur  = 8;
      canvas2d.shadowColor = '#ffffff';
    }
    canvas2d.fillStyle = '#ffffff';
    canvas2d.beginPath();
    canvas2d.moveTo(tipX,                              tipY);
    canvas2d.lineTo(juncX + perCos * HEAD_W / 2,      juncY + perSin * HEAD_W / 2);
    canvas2d.lineTo(juncX - cos * HEAD_LEN * 0.3,     juncY - sin * HEAD_LEN * 0.3);
    canvas2d.lineTo(juncX - perCos * HEAD_W / 2,      juncY - perSin * HEAD_W / 2);
    canvas2d.closePath();
    canvas2d.fill();
    canvas2d.shadowBlur = 0;

    // Small cyan halo at tip
    if (!isLowGraphics) {
      canvas2d.fillStyle  = FRACTERYL_SPEAR_COLOR;
      canvas2d.globalAlpha = alpha * 0.5;
      canvas2d.beginPath();
      canvas2d.arc(tipX, tipY, 2.5, 0, Math.PI * 2);
      canvas2d.fill();
    }
  }

  canvas2d.shadowBlur  = 0;
  canvas2d.globalAlpha = 1;
  canvas2d.restore();
}

// ── Bloom draw helpers ─────────────────────────────────────────────────────────

const GEN_WIDTHS = [2.0, 1.4, 1.0, 0.7, 0.5, 0.4];

function lineWidth(gen: number): number {
  return GEN_WIDTHS[Math.min(gen, GEN_WIDTHS.length - 1)] ?? 0.4;
}

function drawLineBranch(
  ctx: CanvasRenderingContext2D,
  branch: FracterylBranch,
  progress: number,
  alpha: number,
): void {
  const ex = branch.x1 + (branch.x2 - branch.x1) * progress;
  const ey = branch.y1 + (branch.y2 - branch.y1) * progress;
  ctx.globalAlpha  = alpha;
  ctx.lineWidth    = lineWidth(branch.generation);
  ctx.strokeStyle  = branch.generation === 0 ? FRACTERYL_BLOOM_CORE : FRACTERYL_BLOOM_COLOR;
  ctx.beginPath();
  ctx.moveTo(branch.x1, branch.y1);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  // Small mote at growing tip for gen 0–1 (normal graphics only)
  if (!isLowGraphics && branch.generation <= 1 && progress > 0.5) {
    const size = branch.generation === 0 ? 2.5 : 1.5;
    ctx.fillStyle   = FRACTERYL_BLOOM_CORE;
    ctx.globalAlpha = alpha * 0.85;
    ctx.beginPath();
    ctx.rect(ex - size / 2, ey - size / 2, size, size);
    ctx.fill();
  }
}

function drawTriBranch(
  ctx: CanvasRenderingContext2D,
  branch: FracterylBranch,
  progress: number,
  alpha: number,
): void {
  const x3 = branch.x3 ?? branch.x1;
  const y3 = branch.y3 ?? branch.y1;
  // Scale all vertices from centroid by progress
  const ccx = (branch.x1 + branch.x2 + x3) / 3;
  const ccy = (branch.y1 + branch.y2 + y3) / 3;
  const ax  = ccx + (branch.x1 - ccx) * progress;
  const ay  = ccy + (branch.y1 - ccy) * progress;
  const bx  = ccx + (branch.x2 - ccx) * progress;
  const by  = ccy + (branch.y2 - ccy) * progress;
  const cx  = ccx + (x3 - ccx) * progress;
  const cy  = ccy + (y3 - ccy) * progress;

  ctx.globalAlpha = alpha;
  ctx.lineWidth   = lineWidth(branch.generation);
  ctx.strokeStyle = branch.generation === 0 ? FRACTERYL_BLOOM_CORE : FRACTERYL_BLOOM_COLOR;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.stroke();
}

// ── Bloom draw ────────────────────────────────────────────────────────────────

export function drawFracterylBlooms(canvas2d: CanvasRenderingContext2D, blooms: FracterylBloom[]): void {
  if (blooms.length === 0) return;
  canvas2d.save();

  // Max generation drawn in low graphics (drops fine detail)
  const maxGenDraw = isLowGraphics ? 1 : 99;

  for (const bloom of blooms) {
    const ageMs    = bloom.maxLifeMs - bloom.lifeMs;
    const lifeFrac = bloom.lifeMs / bloom.maxLifeMs;

    if (!isLowGraphics) {
      canvas2d.shadowBlur  = 5;
      canvas2d.shadowColor = FRACTERYL_BLOOM_CORE;
    }

    for (const branch of bloom.branches) {
      if (branch.generation > maxGenDraw) continue;

      const localAge = ageMs - branch.delayMs;
      if (localAge <= 0) continue;

      const progress  = Math.min(1, localAge / branch.growMs);
      const genFrac   = 1 - branch.generation * 0.15;
      const alpha     = lifeFrac * genFrac * 0.9;
      if (alpha <= 0.02) continue;

      // Disable glow for generations > 0 (cost saving)
      if (!isLowGraphics) {
        canvas2d.shadowBlur = branch.generation === 0 ? 6 : 0;
      }

      if (branch.kind === 'tri') {
        drawTriBranch(canvas2d, branch, progress, alpha);
      } else {
        drawLineBranch(canvas2d, branch, progress, alpha);
      }
    }
  }

  canvas2d.shadowBlur  = 0;
  canvas2d.globalAlpha = 1;
  canvas2d.restore();
}
