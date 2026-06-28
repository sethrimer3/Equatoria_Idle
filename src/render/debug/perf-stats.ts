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
  /** Time spent inside particles.draw() only (subset of renderMs). */
  particleDrawMs: number;
  /** Time spent inside the fixed-timestep simulation substep loop (subset of updateMs). */
  particleTickMs: number;
  dragFlushMs: number;
  mergeCheckCount: number;
  mergesPerFrame: number;
  trailDrawCalls: number;
  particleCount: number;
  /** Number of visually active merges this frame (animation window not yet elapsed). */
  activeMergeCount: number;
}

export const perfStats: PerfStats = {
  updateMs: 0,
  renderMs: 0,
  particleDrawMs: 0,
  particleTickMs: 0,
  dragFlushMs: 0,
  mergeCheckCount: 0,
  mergesPerFrame: 0,
  trailDrawCalls: 0,
  particleCount: 0,
  activeMergeCount: 0,
};

export function resetPerfStats(): void {
  perfStats.updateMs = 0;
  perfStats.renderMs = 0;
  perfStats.particleDrawMs = 0;
  perfStats.particleTickMs = 0;
  perfStats.dragFlushMs = 0;
  perfStats.mergeCheckCount = 0;
  perfStats.mergesPerFrame = 0;
  perfStats.trailDrawCalls = 0;
  perfStats.particleCount = 0;
  perfStats.activeMergeCount = 0;
}

/**
 * Draw perf stats as a sharp text block in the bottom-right corner.
 * Uses the crisp overlay canvas (cc.overlayCtx) so the text is never
 * pixelated, regardless of the main canvas render style.
 * widthCSS / heightCSS are the container dimensions in CSS pixels.
 * dpr is used to scale the overlay canvas backing to physical pixels.
 */
export function drawPerfStats(
  overlayCtx: CanvasRenderingContext2D,
  widthCSS: number,
  heightCSS: number,
  dpr: number,
): void {
  const lines = [
    `update  ${perfStats.updateMs.toFixed(1)} ms`,
    `render  ${perfStats.renderMs.toFixed(1)} ms`,
    `ptcDraw ${perfStats.particleDrawMs.toFixed(1)} ms`,
    `ptcTick ${perfStats.particleTickMs.toFixed(1)} ms`,
    `drag    ${perfStats.dragFlushMs.toFixed(2)} ms`,
    `motes  ${perfStats.particleCount}`,
    `mergeC ${perfStats.mergeCheckCount}`,
    `merges ${perfStats.mergesPerFrame}`,
    `actMrg ${perfStats.activeMergeCount}`,
    `mrgRay ${perfStats.trailDrawCalls}`,
  ];

  // Clear overlay then draw text at CSS-pixel coordinates (DPR scale applied below).
  overlayCtx.clearRect(0, 0, widthCSS * dpr, heightCSS * dpr);

  const fontSize = 11; // CSS pixels — readable at all DPR values
  overlayCtx.save();
  overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  overlayCtx.font = `${fontSize}px monospace`;
  overlayCtx.textAlign = 'right';
  overlayCtx.textBaseline = 'bottom';

  const lineH = fontSize + 2;
  const x = widthCSS - 4;
  let y = heightCSS - 4;

  for (let i = lines.length - 1; i >= 0; i--) {
    overlayCtx.fillStyle = 'rgba(0,0,0,0.6)';
    overlayCtx.lineWidth = 3;
    overlayCtx.strokeStyle = 'rgba(0,0,0,0.6)';
    overlayCtx.strokeText(lines[i], x, y);
    overlayCtx.fillStyle = '#00ff44';
    overlayCtx.fillText(lines[i], x, y);
    y -= lineH;
  }
  overlayCtx.restore();
}
