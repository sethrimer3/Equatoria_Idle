/**
 * rpg-jellyfish-elite-draw.ts — Canvas rendering for all four elite
 * jellyfish variants.
 *
 * Visual identity:
 *   Bell — translucent caustic-blue semi-dome, scales with bellPhase.
 *   Tentacles — tapered polylines from bell rim through Verlet segment chain.
 *   Telegraph — slight bright-pulse glow when a burst is imminent (whiplash).
 *
 * Low-graphics mode: glow and alpha effects are suppressed.
 */
import type { EliteJellyfishEnemy } from './rpg-jellyfish-elite-types';
import {
  ELITE_JELLYFISH_COLOR, ELITE_JELLYFISH_GLOW, ELITE_JELLYFISH_INNER_COLOR,
  ELITE_JELLYFISH_BASE_SIZE,
} from './rpg-jellyfish-elite-constants';
import { enemyHealthFraction, shouldDrawEnemyHealthBar } from './rpg-health-bar';

let _lowGfx = false;
export function setEliteJellyfishLowGraphics(enabled: boolean): void { _lowGfx = enabled; }

function applyGlow(ctx: CanvasRenderingContext2D, color: string, blur: number): void {
  if (_lowGfx) return;
  ctx.shadowBlur = blur;
  ctx.shadowColor = color;
}
function clearGlow(ctx: CanvasRenderingContext2D): void { ctx.shadowBlur = 0; }

function drawHitFlash(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ms: number): void {
  if (ms <= 0 || _lowGfx) return;
  ctx.save();
  ctx.globalAlpha = Math.min(ms / 80, 1) * 0.7;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x, y, r * 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, frac: number): void {
  const w = r * 2.5, h = 2, bx = x - w / 2, by = y + r + 2;
  ctx.fillStyle = '#333';
  ctx.fillRect(bx, by, w, h);
  ctx.fillStyle = frac > 0.5 ? '#44ff44' : frac > 0.25 ? '#ffaa00' : '#ff3333';
  ctx.fillRect(bx, by, w * frac, h);
}

export function drawEliteJellyfishEnemies(
  canvas: CanvasRenderingContext2D,
  enemies: EliteJellyfishEnemy[],
): void {
  for (const e of enemies) {
    const bellScale = 0.72 + 0.28 * Math.sin(e.bellPhase * 2.8);
    const size = ELITE_JELLYFISH_BASE_SIZE;

    // ── Whiplash burst telegraph: flash brighter when burst is near ──────────
    let glowExtra = 0;
    if (e.variant === 'whiplash' && e.burstCdMs < 800 && e.burstCdMs > 0) {
      glowExtra = (1 - e.burstCdMs / 800) * 10;
    }

    canvas.save();

    // ── Tentacles ────────────────────────────────────────────────────────────
    const { tailCount, segmentsPerTail, segX, segY } = e;
    canvas.lineCap = 'round';
    canvas.lineJoin = 'round';

    for (let t = 0; t < tailCount; t++) {
      const base = t * segmentsPerTail;
      canvas.beginPath();
      canvas.moveTo(segX[base], segY[base]);
      for (let s = 1; s < segmentsPerTail; s++) {
        canvas.lineTo(segX[base + s], segY[base + s]);
      }
      // Tapered alpha and width: base is wider, tip is thinner
      canvas.globalAlpha = 0.55;
      applyGlow(canvas, ELITE_JELLYFISH_GLOW, 5 + glowExtra * 0.5);
      canvas.strokeStyle = ELITE_JELLYFISH_COLOR;
      canvas.lineWidth = 2.0;
      canvas.stroke();
    }

    clearGlow(canvas);

    // ── Bell ─────────────────────────────────────────────────────────────────
    applyGlow(canvas, ELITE_JELLYFISH_GLOW, 14 + glowExtra);
    canvas.globalAlpha = 0.70;
    canvas.fillStyle = ELITE_JELLYFISH_COLOR;

    canvas.save();
    canvas.translate(e.x, e.y);
    canvas.scale(bellScale, 1);
    canvas.beginPath();
    canvas.arc(0, 0, size, Math.PI, 0, false);
    canvas.closePath();
    canvas.fill();
    canvas.restore();

    // Inner highlight dome
    canvas.globalAlpha = 0.30;
    canvas.fillStyle = ELITE_JELLYFISH_INNER_COLOR;
    canvas.save();
    canvas.translate(e.x, e.y);
    canvas.scale(bellScale * 0.6, 0.55);
    canvas.beginPath();
    canvas.arc(0, -size * 0.1, size * 0.65, Math.PI, 0, false);
    canvas.closePath();
    canvas.fill();
    canvas.restore();

    clearGlow(canvas);
    canvas.globalAlpha = 1;

    drawHitFlash(canvas, e.x, e.y, size, e.hitFlashMs);

    const hpFrac = enemyHealthFraction(e);
    if (shouldDrawEnemyHealthBar(e)) drawHpBar(canvas, e.x, e.y, size, hpFrac);

    canvas.restore();
  }
}
