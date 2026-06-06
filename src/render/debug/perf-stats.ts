/**
 * Lightweight per-frame performance counters — only meaningful when isDevMode is on.
 *
 * Usage:
 *   // record:
 *   perfStats.updateMs = t1 - t0;
 *   perfStats.particleCount = particles.length;
 *   // draw overlay:
 *   drawPerfStats(ctx, widthPx, heightPx);
 *
 * All fields are reset to 0 at the start of each frame by resetPerfStats().
 * Nothing in this module runs unless the caller explicitly records values,
 * so it has zero cost in production when the caller is gated behind isDevMode.
 */

export interface PerfStats {
  updateMs: number;
  renderMs: number;
  dragFlushMs: number;
  mergeCheckCount: number;
  mergesPerFrame: number;
  trailDrawCalls: number;
  particleCount: number;
}

export const perfStats: PerfStats = {
  updateMs: 0,
  renderMs: 0,
  dragFlushMs: 0,
  mergeCheckCount: 0,
  mergesPerFrame: 0,
  trailDrawCalls: 0,
  particleCount: 0,
};

export function resetPerfStats(): void {
  perfStats.updateMs = 0;
  perfStats.renderMs = 0;
  perfStats.dragFlushMs = 0;
  perfStats.mergeCheckCount = 0;
  perfStats.mergesPerFrame = 0;
  perfStats.trailDrawCalls = 0;
  perfStats.particleCount = 0;
}

/** Draw perf stats as a small text block in the bottom-right corner of the canvas. */
export function drawPerfStats(
  ctx: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
): void {
  const lines = [
    `update ${perfStats.updateMs.toFixed(1)} ms`,
    `render ${perfStats.renderMs.toFixed(1)} ms`,
    `drag   ${perfStats.dragFlushMs.toFixed(2)} ms`,
    `motes  ${perfStats.particleCount}`,
    `mergeC ${perfStats.mergeCheckCount}`,
    `merges ${perfStats.mergesPerFrame}`,
    `trails ${perfStats.trailDrawCalls}`,
  ];

  const fontSize = 6;
  ctx.save();
  ctx.font = `${fontSize}px monospace`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';

  const lineH = fontSize + 1;
  const x = widthPx - 3;
  let y = heightPx - 3;

  for (let i = lines.length - 1; i >= 0; i--) {
    ctx.fillStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000';
    ctx.strokeText(lines[i], x, y);
    ctx.fillStyle = '#0f0';
    ctx.fillText(lines[i], x, y);
    y -= lineH;
  }
  ctx.restore();
}
