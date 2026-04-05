import type { CanvasContext } from '../canvas';
import type { ForgeCrunchState } from '../../sim/forge/forge-state';
import { getForgeRotationMultiplier } from '../../sim/forge/forge-state';
import {
  FORGE_RADIUS,
  MAX_FORGE_ATTRACTION_DISTANCE,
  FORGE_VALID_WAIT_TIME_MS,
  FORGE_SPIN_UP_DURATION_MS,
  FORGE_SPIN_DOWN_DURATION_MS,
} from '../../data/particles/particle-config';

export function drawForge(
  cc: CanvasContext,
  forgeX: number,
  forgeY: number,
  forgeRotation: number,
  crunchState: ForgeCrunchState,
  nowMs: number,
): void {
  const ctx = cc.ctx;
  const forgeSize = FORGE_RADIUS;
  const halfPi6 = Math.PI / 6;
  const spinMult = getForgeRotationMultiplier(
    crunchState, nowMs,
    FORGE_VALID_WAIT_TIME_MS, FORGE_SPIN_UP_DURATION_MS, FORGE_SPIN_DOWN_DURATION_MS,
  );
  const effectiveRotation = forgeRotation * spinMult;

  ctx.save();
  ctx.translate(forgeX, forgeY);

  ctx.rotate(-effectiveRotation);
  ctx.strokeStyle = 'rgba(200,200,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, forgeSize);
  ctx.lineTo(forgeSize * Math.cos(halfPi6), -forgeSize * Math.sin(halfPi6));
  ctx.lineTo(-forgeSize * Math.cos(halfPi6), -forgeSize * Math.sin(halfPi6));
  ctx.closePath();
  ctx.stroke();

  ctx.rotate(effectiveRotation * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -forgeSize);
  ctx.lineTo(forgeSize * Math.cos(halfPi6), forgeSize * Math.sin(halfPi6));
  ctx.lineTo(-forgeSize * Math.cos(halfPi6), forgeSize * Math.sin(halfPi6));
  ctx.closePath();
  ctx.stroke();

  ctx.rotate(-effectiveRotation);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, forgeSize);
  gradient.addColorStop(0, 'rgba(255,255,255,0.25)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, forgeSize, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(150,150,200,0.1)';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(forgeX, forgeY, MAX_FORGE_ATTRACTION_DISTANCE, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

export function drawForgeCrunch(
  cc: CanvasContext,
  forgeX: number,
  forgeY: number,
  crunchState: ForgeCrunchState,
): void {
  if (!crunchState.isActive) return;
  const ctx = cc.ctx;
  const progress = crunchState.progress;
  const currentRadius = FORGE_RADIUS * (1 - progress);
  const alphaCurve = Math.sin(progress * Math.PI);
  const alpha = alphaCurve * 0.8;

  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(forgeX, forgeY, currentRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(200,200,255,${alpha * 0.5})`;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(forgeX, forgeY, currentRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
