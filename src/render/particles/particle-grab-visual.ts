/**
 * Grab-radius visual overlay.
 *
 * When the player holds down on the canvas to grab particles, this module
 * draws:
 *  - A subtle dashed circle showing the grab radius.
 *  - One small comet-like orb per unique tier/color of grabbed mote,
 *    spinning counterclockwise along the circumference with an additive-
 *    blended trail.  Each orb is equidistant from the others.
 */

import type { CanvasContext } from '../canvas';
import type { EquatoriaParticle } from './particle-types';
import type { ParticleDragState } from '../../input/particle-drag';
import { INTERACTION_RADIUS_FRACTION } from '../../data/particles/particle-config';
import { parseHexToRgb } from '../assets/color-utils';

// ─── Tuning constants ────────────────────────────────────────────

/** Counterclockwise spin speed in radians per millisecond. */
const ORB_SPIN_SPEED_RAD_PER_MS = 0.00085;

/** Radius of the orb dot at its brightest tip (canvas px). */
const ORB_TIP_RADIUS = 1.4;

/** Number of arc-segment steps drawn behind the orb head to form the comet tail. */
const TRAIL_STEPS = 20;

/**
 * Total angular spread of the comet trail behind the head (radians).
 * Larger = longer tail arc.
 */
const TRAIL_ANGLE_SPREAD = Math.PI * 0.55;

// ─── Main draw function ──────────────────────────────────────────

/**
 * Draw the grab-radius circle and spinning comet orbs.
 * Call this once per frame after the main particle draw, only when
 * `dragState.isDown` is true.
 */
export function drawGrabVisual(
  cc: CanvasContext,
  dragState: ParticleDragState,
  particles: readonly EquatoriaParticle[],
  canvasWidth: number,
  canvasHeight: number,
  animTimeMs: number,
): void {
  if (!dragState.isDown) return;

  const ctx = cc.ctx;
  const cx = dragState.canvasX;
  const cy = dragState.canvasY;
  const radius = Math.min(canvasWidth, canvasHeight) * INTERACTION_RADIUS_FRACTION;

  // ── Grab circle ──────────────────────────────────────────────
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 0.5;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // ── Collect unique tiers from grabbed particles ───────────────
  const tierColors: string[] = [];
  const seen = new Set<string>();
  for (let i = 0, len = particles.length; i < len; i++) {
    const p = particles[i];
    if (p.isLockedToPointer && !seen.has(p.tierId)) {
      seen.add(p.tierId);
      tierColors.push(p.colorString);
    }
  }

  if (tierColors.length === 0) return;

  const orbCount = tierColors.length;
  const spinAngle = ORB_SPIN_SPEED_RAD_PER_MS * animTimeMs;

  ctx.save();
  // Additive blending makes overlapping trails brighten, giving a glowing comet look.
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < orbCount; i++) {
    const color = tierColors[i];
    const [r, g, b] = parseHexToRgb(color);

    // Each orb is evenly spaced and all rotate together counterclockwise.
    // Counterclockwise in canvas coords = decreasing angle over time.
    const phaseOffset = (2 * Math.PI * i) / orbCount;
    const headAngle = phaseOffset - spinAngle;

    // Draw trail from tail to head so the head renders on top.
    for (let step = TRAIL_STEPS - 1; step >= 0; step--) {
      // trailFrac: 0 = head (current position), 1 = oldest tail point
      const trailFrac = step / TRAIL_STEPS;

      // The tail lies clockwise behind the head (orb moves counterclockwise).
      const angle = headAngle + TRAIL_ANGLE_SPREAD * trailFrac;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;

      const alpha = (1 - trailFrac) * 0.9;
      const dotRadius = ORB_TIP_RADIUS * (1 - trailFrac * 0.72);
      if (dotRadius < 0.1) continue;

      const fill = `rgb(${r},${g},${b})`;

      // Glow for the front portion of the trail. Instead of ctx.shadowBlur
      // (an offscreen blur pass per fill — catastrophic when this runs every
      // frame while dragging), fake the glow with a single larger, faint
      // additive circle underneath the core dot. The 'lighter' composite mode
      // makes overlapping fills brighten, giving the same comet-glow look at a
      // fraction of the cost.
      if (trailFrac < 0.35) {
        ctx.globalAlpha = alpha * 0.35;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(x, y, dotRadius * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}
