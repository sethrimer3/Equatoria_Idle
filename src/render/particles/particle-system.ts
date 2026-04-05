import type { CanvasContext } from '../canvas';
import { MAX_PARTICLE_COUNT, PARTICLE_LIFETIME_MS } from '../../data/balance';

// ─── Types ──────────────────────────────────────────────────────

export interface Particle {
  /** Is this slot currently in use? (pool pattern) */
  isActive: boolean;
  posXPx: number;
  posYPx: number;
  velXPxPerSec: number;
  velYPxPerSec: number;
  color: string;
  glowColor: string;
  radiusPx: number;
  lifetimeMs: number;
  elapsedMs: number;
  /** Trail positions (recent history). */
  trailX: number[];
  trailY: number[];
}

// ─── Pool ───────────────────────────────────────────────────────

const TRAIL_LENGTH = 6;

function createEmptyParticle(): Particle {
  return {
    isActive: false,
    posXPx: 0,
    posYPx: 0,
    velXPxPerSec: 0,
    velYPxPerSec: 0,
    color: '#fff',
    glowColor: '#fff',
    radiusPx: 2,
    lifetimeMs: PARTICLE_LIFETIME_MS,
    elapsedMs: 0,
    trailX: new Array<number>(TRAIL_LENGTH).fill(0),
    trailY: new Array<number>(TRAIL_LENGTH).fill(0),
  };
}

export class ParticleSystem {
  private readonly pool: Particle[];
  private activeCount = 0;

  constructor() {
    this.pool = [];
    for (let i = 0; i < MAX_PARTICLE_COUNT; i++) {
      this.pool.push(createEmptyParticle());
    }
  }

  /** Emit a burst of particles at a position. */
  emit(
    centerXPx: number,
    centerYPx: number,
    count: number,
    color: string,
    glowColor: string,
  ): void {
    for (let i = 0; i < count; i++) {
      const p = this.acquireParticle();
      if (!p) return; // pool full
      p.posXPx = centerXPx;
      p.posYPx = centerYPx;
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 60;
      p.velXPxPerSec = Math.cos(angle) * speed;
      p.velYPxPerSec = Math.sin(angle) * speed - 30; // bias upward
      p.color = color;
      p.glowColor = glowColor;
      p.radiusPx = 1.5 + Math.random() * 1.5;
      p.lifetimeMs = PARTICLE_LIFETIME_MS * (0.7 + Math.random() * 0.6);
      p.elapsedMs = 0;
      for (let t = 0; t < TRAIL_LENGTH; t++) {
        p.trailX[t] = centerXPx;
        p.trailY[t] = centerYPx;
      }
    }
  }

  /** Update all active particles. */
  update(deltaMs: number, canvasWidth: number, canvasHeight: number): void {
    const deltaSec = deltaMs / 1000;
    const gravity = 80; // px/s²

    for (const p of this.pool) {
      if (!p.isActive) continue;
      p.elapsedMs += deltaMs;
      if (p.elapsedMs >= p.lifetimeMs) {
        p.isActive = false;
        this.activeCount--;
        continue;
      }

      // Shift trail
      for (let t = TRAIL_LENGTH - 1; t > 0; t--) {
        p.trailX[t] = p.trailX[t - 1];
        p.trailY[t] = p.trailY[t - 1];
      }
      p.trailX[0] = p.posXPx;
      p.trailY[0] = p.posYPx;

      // Physics
      p.velYPxPerSec += gravity * deltaSec;
      p.posXPx += p.velXPxPerSec * deltaSec;
      p.posYPx += p.velYPxPerSec * deltaSec;

      // Bounce off walls
      if (p.posXPx < 0) { p.posXPx = 0; p.velXPxPerSec *= -0.6; }
      if (p.posXPx > canvasWidth) { p.posXPx = canvasWidth; p.velXPxPerSec *= -0.6; }
      if (p.posYPx > canvasHeight) { p.posYPx = canvasHeight; p.velYPxPerSec *= -0.6; }
      if (p.posYPx < 0) { p.posYPx = 0; p.velYPxPerSec *= -0.3; }
    }
  }

  /** Render all active particles to the canvas. */
  draw(cc: CanvasContext): void {
    const ctx = cc.ctx;
    for (const p of this.pool) {
      if (!p.isActive) continue;

      const life = 1 - p.elapsedMs / p.lifetimeMs;
      const alpha = Math.max(0, life);

      // Trail
      ctx.strokeStyle = p.glowColor;
      ctx.lineWidth = 1;
      ctx.globalAlpha = alpha * 0.3;
      ctx.beginPath();
      ctx.moveTo(p.posXPx, p.posYPx);
      for (let t = 0; t < TRAIL_LENGTH; t++) {
        ctx.lineTo(p.trailX[t], p.trailY[t]);
      }
      ctx.stroke();

      // Main dot
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.posXPx, p.posYPx, p.radiusPx * life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  get particleCount(): number {
    return this.activeCount;
  }

  private acquireParticle(): Particle | null {
    for (const p of this.pool) {
      if (!p.isActive) {
        p.isActive = true;
        this.activeCount++;
        return p;
      }
    }
    return null;
  }
}
