/**
 * rpg-stardust-draw.ts — Draw functions for Stardust enemies.
 *
 * Each Stardust enemy is rendered as a cloud of prismatic particles with
 * hue-cycling edges. During the laser phase, renders bright laser chains
 * bouncing between particles.
 *
 * Visual identity: pale gold (#f5e8a0), glassy white (#fffcf0), diamond-like.
 */

import type { StardustEnemy } from './rpg-enemy-types';
import { STARDUST_COLOR, STARDUST_GLOW } from './rpg-enemy-constants';

// ── Low-graphics mode flag ────────────────────────────────────────
let isLowGraphicsMode = false;

export function setLowGraphicsMode(enabled: boolean): void {
  isLowGraphicsMode = enabled;
}

// ── Main draw function ─────────────────────────────────────────────

export function drawStardustEnemies(
  ctx: CanvasRenderingContext2D,
  enemies: StardustEnemy[],
): void {
  for (const e of enemies) {
    drawStardustEnemy(ctx, e);
  }
}

function drawStardustEnemy(ctx: CanvasRenderingContext2D, e: StardustEnemy): void {
  const isFrozen = e.phase === 'frozen' || e.phase === 'laser';
  const isWarning = e.phase === 'warning';
  
  // Draw laser chain if active
  if (e.phase === 'laser' && e.laserChain.length > 0) {
    drawLaserChain(ctx, e);
  }
  
  // Draw each particle
  for (let i = 0; i < e.particles.length; i++) {
    const p = e.particles[i];
    drawParticle(ctx, p, e.pulseMs, isFrozen, isWarning);
  }
  
  // Draw HP bar below center
  drawHpBar(ctx, e);
}

function drawParticle(
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number; hueOffset: number; size: number; brightness: number },
  pulseMs: number,
  isFrozen: boolean,
  isWarning: boolean,
): void {
  const pulse = 0.7 + 0.3 * Math.sin(pulseMs * 0.003 + p.hueOffset * 0.1);
  const radius = p.size * (isFrozen ? 1.5 : 1.0) * (isWarning ? 1.2 : 1.0);
  const hue = (p.hueOffset + pulseMs * 0.05) % 360;
  const brightness = p.brightness * pulse;
  
  // Outer glow (rainbow prismatic edge)
  if (!isLowGraphicsMode) {
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 2.5);
    grad.addColorStop(0, `hsla(${hue}, 80%, 75%, ${brightness * 0.6})`);
    grad.addColorStop(0.5, `hsla(${hue}, 70%, 65%, ${brightness * 0.3})`);
    grad.addColorStop(1, `hsla(${hue}, 60%, 55%, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Core body (pale gold/white)
  ctx.fillStyle = isFrozen ? STARDUST_GLOW : STARDUST_COLOR;
  ctx.globalAlpha = brightness;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  
  // Inner bright core
  if (isFrozen) {
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = brightness * 0.8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawLaserChain(ctx: CanvasRenderingContext2D, e: StardustEnemy): void {
  // Draw each laser segment with glow passes
  for (let i = 0; i < e.laserChain.length; i++) {
    const seg = e.laserChain[i];
    const hue = (i * 30 + e.pulseMs * 0.1) % 360;
    
    // Outer glow pass (rainbow)
    if (!isLowGraphicsMode) {
      ctx.strokeStyle = `hsla(${hue}, 70%, 60%, 0.3)`;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
    }
    
    // Middle glow pass
    ctx.strokeStyle = `hsla(${hue}, 80%, 75%, 0.6)`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
    ctx.stroke();
    
    // Core beam (bright white/gold)
    ctx.strokeStyle = '#fffce8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
    ctx.stroke();
  }
  
  // Draw spark bursts at bounce nodes
  if (!isLowGraphicsMode) {
    for (const nodeIdx of e.laserNodes) {
      // Find particle by index (across all particles in this enemy)
      if (nodeIdx < e.particles.length) {
        const p = e.particles[nodeIdx];
        drawSparkBurst(ctx, p.x, p.y, e.pulseMs);
      }
    }
  }
}

function drawSparkBurst(ctx: CanvasRenderingContext2D, x: number, y: number, pulseMs: number): void {
  const spokes = 8;
  const baseLen = 6;
  const pulse = 0.7 + 0.3 * Math.sin(pulseMs * 0.008);
  
  ctx.strokeStyle = '#fff8e0';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.7 * pulse;
  
  for (let i = 0; i < spokes; i++) {
    const angle = (i / spokes) * Math.PI * 2 + pulseMs * 0.002;
    const len = baseLen * (0.8 + Math.random() * 0.4) * pulse;
    const x2 = x + Math.cos(angle) * len;
    const y2 = y + Math.sin(angle) * len;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  
  ctx.globalAlpha = 1;
}

function drawHpBar(ctx: CanvasRenderingContext2D, e: StardustEnemy): void {
  const barWidth = 60;
  const barHeight = 3;
  const barX = e.x - barWidth / 2;
  const barY = e.y + 25;
  const hpRatio = Math.max(0, Math.min(1, e.hp / e.maxHp));
  
  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(barX, barY, barWidth, barHeight);
  
  // HP fill (gradient from gold to white)
  const grad = ctx.createLinearGradient(barX, barY, barX + barWidth * hpRatio, barY);
  grad.addColorStop(0, STARDUST_COLOR);
  grad.addColorStop(1, STARDUST_GLOW);
  ctx.fillStyle = grad;
  ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);
  
  // Border
  ctx.strokeStyle = STARDUST_GLOW;
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barWidth, barHeight);
}
