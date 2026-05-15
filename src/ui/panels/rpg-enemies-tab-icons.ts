/**
 * rpg-enemies-tab-icons.ts — Icon rendering helpers for the RPG enemies bestiary tab.
 *
 * Provides:
 *   - createAlivenIconCanvas: animated mini-sim canvas for swarm-type enemies.
 *   - drawEnemyIcon: static icon for regular enemies.
 *   - drawBossIcon: static icon for boss entries.
 *   - drawPolygonPath: utility for polygon rendering.
 *
 * All functions are used by rpg-enemies-tab.ts to build enemy entry cards.
 */

import {
  BOSS_COLORS, BOSS_GLOW_COLORS, BOSS_SIZE_BASE,
} from '../../render/rpg/rpg-constants';
import type { EnemyCatalogEntry } from './rpg-enemies-catalog';

// ─── Icon canvas size ─────────────────────────────────────────────

export const ICON_SIZE = 40;

// ─── Animated aliven mini-sim ─────────────────────────────────────

interface MiniParticle {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  color: string;
  glowColor: string;
  phase: number;
}

/**
 * Creates an animated canvas that simulates a small cluster of aliven
 * particles bouncing inside the icon box. The RAF loop stops automatically
 * once the canvas is removed from the DOM.
 */
export function createAlivenIconCanvas(entry: EnemyCatalogEntry): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width  = ICON_SIZE;
  canvas.height = ICON_SIZE;
  canvas.style.cssText = 'flex-shrink:0;border-radius:4px;background:rgba(0,0,0,0.5);';

  // Cache the context once — it remains valid for the canvas's lifetime.
  const ctx2 = canvas.getContext('2d');
  if (!ctx2) return canvas;
  // ctx2 is guaranteed non-null here; use non-null assertion inside the RAF closure.
  const drawCtx = ctx2;

  // Use 6 particles for the mini-sim regardless of actual count.
  const count   = 6;
  const iconR   = Math.max(1.5, Math.min(entry.size / 2, 4));
  const margin  = iconR + 3;
  const particles: MiniParticle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x:        margin + Math.random() * (ICON_SIZE - margin * 2),
      y:        margin + Math.random() * (ICON_SIZE - margin * 2),
      vx:       (Math.random() - 0.5) * 0.08,
      vy:       (Math.random() - 0.5) * 0.08,
      r:        iconR,
      color:    entry.color,
      glowColor: entry.glowColor,
      phase:    Math.random() * Math.PI * 2,
    });
  }

  let lastTime = performance.now();
  let rafId = 0;

  function frame(t: number): void {
    if (!canvas.isConnected) {
      cancelAnimationFrame(rafId);
      return;
    }
    const dt = Math.min(t - lastTime, 50);
    lastTime = t;

    drawCtx.clearRect(0, 0, ICON_SIZE, ICON_SIZE);
    drawCtx.fillStyle = 'rgba(0,0,0,0.55)';
    drawCtx.fillRect(0, 0, ICON_SIZE, ICON_SIZE);

    for (const p of particles) {
      // Wander noise
      p.vx += (Math.random() - 0.5) * 0.0001 * dt;
      p.vy += (Math.random() - 0.5) * 0.0001 * dt;
      // Gentle pull toward centre
      const dcx = ICON_SIZE / 2 - p.x;
      const dcy = ICON_SIZE / 2 - p.y;
      const dist = Math.sqrt(dcx * dcx + dcy * dcy);
      if (dist > 3) {
        p.vx += (dcx / dist) * 0.00008 * dt;
        p.vy += (dcy / dist) * 0.00008 * dt;
      }
      // Speed cap + friction
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > 0.12) { p.vx *= 0.12 / speed; p.vy *= 0.12 / speed; }
      p.vx *= 0.985; p.vy *= 0.985;
      // Integrate
      p.x += p.vx * dt; p.y += p.vy * dt;
      // Bounce
      const m = p.r + 2;
      if (p.x < m)              { p.x = m;              p.vx =  Math.abs(p.vx); }
      if (p.x > ICON_SIZE - m)  { p.x = ICON_SIZE - m;  p.vx = -Math.abs(p.vx); }
      if (p.y < m)              { p.y = m;              p.vy =  Math.abs(p.vy); }
      if (p.y > ICON_SIZE - m)  { p.y = ICON_SIZE - m;  p.vy = -Math.abs(p.vy); }
      // Advance phase
      p.phase += dt * 0.003;
      // Draw
      const pf = 0.8 + 0.2 * Math.sin(p.phase);
      drawCtx.save();
      drawCtx.shadowBlur  = p.r * 3.5;
      drawCtx.shadowColor = p.glowColor;
      drawCtx.globalAlpha = 0.90;
      drawCtx.fillStyle   = p.color;
      drawCtx.beginPath();
      drawCtx.arc(p.x, p.y, p.r * pf, 0, Math.PI * 2);
      drawCtx.fill();
      drawCtx.restore();
    }

    rafId = requestAnimationFrame(frame);
  }

  rafId = requestAnimationFrame(frame);
  return canvas;
}

// ─── Icon drawing ─────────────────────────────────────────────────

export function drawPolygonPath(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  radius: number, sides: number,
): void {
  ctx.beginPath();
  for (let i = 0; i <= sides; i++) {
    // Start at the top (-π/2) so the first vertex points up for all polygons.
    const angle = -Math.PI / 2 + (i / sides) * Math.PI * 2;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function drawEnemyIcon(canvas: HTMLCanvasElement, entry: EnemyCatalogEntry): void {
  // Aliven entries get an animated mini-sim — callers handle this separately.
  // This function only handles static icons.
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, ICON_SIZE, ICON_SIZE);

  const cx = ICON_SIZE / 2;
  const cy = ICON_SIZE / 2;
  const s = entry.size;
  const half = s / 2;

  // Glow / aura
  if (entry.auraRadius) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = entry.glowColor;
    ctx.beginPath();
    ctx.arc(cx, cy, entry.auraRadius + s, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Shield ring
  if (entry.hasShield && entry.shieldRadius) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = entry.shieldColor ?? entry.glowColor;
    ctx.lineWidth = 1.2;
    ctx.shadowBlur = 6;
    ctx.shadowColor = entry.shieldColor ?? entry.glowColor;
    ctx.beginPath();
    ctx.arc(cx, cy, entry.shieldRadius * (ICON_SIZE / (ICON_SIZE * 1.6)), 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Main body
  ctx.save();
  ctx.shadowBlur = s * 3.5;
  ctx.shadowColor = entry.glowColor;
  ctx.fillStyle = entry.color;

  if (entry.shape === 'polygon' && entry.sides) {
    drawPolygonPath(ctx, cx, cy, half, entry.sides);
    ctx.fill();
    // Stroke the edge brighter
    ctx.shadowBlur  = 0;
    ctx.strokeStyle = entry.glowColor;
    ctx.lineWidth   = 1;
    drawPolygonPath(ctx, cx, cy, half, entry.sides);
    ctx.stroke();
  } else if (entry.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(cx, cy, half, 0, Math.PI * 2);
    ctx.fill();
  } else if (entry.shape === 'diamond') {
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-half, -half, s, s);
  } else {
    ctx.fillRect(cx - half, cy - half, s, s);
  }
  ctx.restore();
}

export function drawBossIcon(canvas: HTMLCanvasElement, bossId: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, ICON_SIZE, ICON_SIZE);

  const color = BOSS_COLORS[Math.min(bossId, BOSS_COLORS.length - 1)];
  const glowColor = BOSS_GLOW_COLORS[Math.min(bossId, BOSS_GLOW_COLORS.length - 1)];
  const bossSize = Math.min(BOSS_SIZE_BASE + bossId * 1.2, ICON_SIZE * 0.6);
  const half = bossSize / 2;
  const cx = ICON_SIZE / 2;
  const cy = ICON_SIZE / 2;

  // Outer glow ring
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = glowColor;
  ctx.beginPath();
  ctx.arc(cx, cy, half + 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Phase rings (3 rings for visual complexity)
  for (let r = 0; r < 3; r++) {
    const ringR = half * (0.55 + r * 0.2);
    ctx.save();
    ctx.globalAlpha = 0.35 - r * 0.08;
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Body (rotated diamond for distinctive boss look)
  ctx.save();
  ctx.shadowBlur = half * 3;
  ctx.shadowColor = glowColor;
  ctx.fillStyle = color;
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-half, -half, bossSize, bossSize);
  ctx.restore();
}
