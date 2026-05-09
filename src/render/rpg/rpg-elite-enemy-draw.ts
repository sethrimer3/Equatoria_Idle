/**
 * rpg-elite-enemy-draw.ts — Draw functions for elite polygon enemies.
 *
 * Each elite is rendered as a regular polygon (3 sides for quartz, 4 for ruby,
 * ..., 10 for nullstone) with a bright glow, slow spin, HP bar, and a special
 * visual indicator (star crown) above it.
 *
 * drawEliteEnemies() is called from rpg-render.ts after the standard enemy draw
 * calls so elites are always rendered on top of regular enemies.
 */

import type { EliteEnemy, EliteTier } from './rpg-enemy-types';
import {
  ELITE_QUARTZ_RADIUS,  ELITE_QUARTZ_COLOR,  ELITE_QUARTZ_GLOW,
  ELITE_RUBY_RADIUS,    ELITE_RUBY_COLOR,    ELITE_RUBY_GLOW,
  ELITE_SUNSTONE_RADIUS,ELITE_SUNSTONE_COLOR,ELITE_SUNSTONE_GLOW,
  ELITE_CITRINE_RADIUS, ELITE_CITRINE_COLOR, ELITE_CITRINE_GLOW,
  ELITE_IOLITE_RADIUS,  ELITE_IOLITE_COLOR,  ELITE_IOLITE_GLOW,
  ELITE_AMETHYST_RADIUS,ELITE_AMETHYST_COLOR,ELITE_AMETHYST_GLOW,
  ELITE_DIAMOND_RADIUS, ELITE_DIAMOND_COLOR, ELITE_DIAMOND_GLOW,
  ELITE_NULLSTONE_RADIUS,ELITE_NULLSTONE_COLOR,ELITE_NULLSTONE_GLOW,
  ELITE_DIAMOND_INVULN_MS,
} from './rpg-enemy-constants';

// ── Low-graphics mode flag ────────────────────────────────────────
let isLowGraphicsMode = false;

export function setLowGraphicsMode(enabled: boolean): void {
  isLowGraphicsMode = enabled;
}

// ── Static lookup tables ─────────────────────────────────────────

const TIER_SIDES: Record<EliteTier, number> = {
  quartz: 3, ruby: 4, sunstone: 5, citrine: 6,
  iolite: 7, amethyst: 8, diamond: 9, nullstone: 10,
};

const TIER_RADIUS: Record<EliteTier, number> = {
  quartz:   ELITE_QUARTZ_RADIUS,
  ruby:     ELITE_RUBY_RADIUS,
  sunstone: ELITE_SUNSTONE_RADIUS,
  citrine:  ELITE_CITRINE_RADIUS,
  iolite:   ELITE_IOLITE_RADIUS,
  amethyst: ELITE_AMETHYST_RADIUS,
  diamond:  ELITE_DIAMOND_RADIUS,
  nullstone:ELITE_NULLSTONE_RADIUS,
};

const TIER_COLOR: Record<EliteTier, string> = {
  quartz:   ELITE_QUARTZ_COLOR,
  ruby:     ELITE_RUBY_COLOR,
  sunstone: ELITE_SUNSTONE_COLOR,
  citrine:  ELITE_CITRINE_COLOR,
  iolite:   ELITE_IOLITE_COLOR,
  amethyst: ELITE_AMETHYST_COLOR,
  diamond:  ELITE_DIAMOND_COLOR,
  nullstone:ELITE_NULLSTONE_COLOR,
};

const TIER_GLOW: Record<EliteTier, string> = {
  quartz:   ELITE_QUARTZ_GLOW,
  ruby:     ELITE_RUBY_GLOW,
  sunstone: ELITE_SUNSTONE_GLOW,
  citrine:  ELITE_CITRINE_GLOW,
  iolite:   ELITE_IOLITE_GLOW,
  amethyst: ELITE_AMETHYST_GLOW,
  diamond:  ELITE_DIAMOND_GLOW,
  nullstone:ELITE_NULLSTONE_GLOW,
};

// Rotation speed (radians per ms) per tier — slower for more complex polygons.
const TIER_ROT_SPEED: Record<EliteTier, number> = {
  quartz:    0.00060,
  ruby:      0.00050,
  sunstone:  0.00042,
  citrine:   0.00035,
  iolite:    0.00028,
  amethyst:  0.00022,
  diamond:   0.00018,
  nullstone: 0.00014,
};

// ── Polygon helpers ──────────────────────────────────────────────

function buildPolygon(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  radius: number, sides: number, rotation: number,
): void {
  ctx.beginPath();
  for (let i = 0; i <= sides; i++) {
    const angle = rotation + (i / sides) * Math.PI * 2;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// ── Main draw function ───────────────────────────────────────────

export function drawEliteEnemies(
  ctx: CanvasRenderingContext2D,
  eliteEnemies: EliteEnemy[],
): void {
  for (const enemy of eliteEnemies) {
    const tier   = enemy.tier;
    const sides  = TIER_SIDES[tier];
    const radius = TIER_RADIUS[tier];
    const color  = TIER_COLOR[tier];
    const glow   = TIER_GLOW[tier];
    const rotSpeed = TIER_ROT_SPEED[tier];
    const rotation = enemy.pulseMs * rotSpeed;

    const cx = Math.round(enemy.x);
    const cy = Math.round(enemy.y);

    ctx.save();

    // ── Outer glow ring (skip in low-graphics mode) ──────────────
    if (!isLowGraphicsMode) {
      const pulse = 0.5 + 0.5 * Math.sin(enemy.pulseMs * 0.004);
      ctx.shadowBlur = radius * 4 + pulse * radius;
      ctx.shadowColor = glow;
    }

    // ── Draw polygon body ────────────────────────────────────────
    ctx.fillStyle = color;
    buildPolygon(ctx, cx, cy, radius, sides, rotation);
    ctx.fill();

    ctx.shadowBlur = 0;

    // ── Polygon stroke (brighter inner edge) ─────────────────────
    ctx.strokeStyle = glow;
    ctx.lineWidth = 1.2;
    buildPolygon(ctx, cx, cy, radius, sides, rotation);
    ctx.stroke();

    // ── Amethyst elite: shield ring ──────────────────────────────
    if (tier === 'amethyst' && enemy.shieldHp > 0) {
      const shieldFrac = enemy.shieldHp / enemy.maxShieldHp;
      ctx.save();
      ctx.globalAlpha = 0.35 + shieldFrac * 0.35;
      ctx.strokeStyle = glow;
      ctx.lineWidth = 1.5;
      if (!isLowGraphicsMode) {
        ctx.shadowBlur = 8;
        ctx.shadowColor = glow;
      }
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ── Diamond elite: extra outer ring during invuln phase ──────
    if (tier === 'diamond' && enemy.isInvuln) {
      const f = enemy.invulnTimerMs / ELITE_DIAMOND_INVULN_MS;
      ctx.save();
      ctx.globalAlpha = 0.45 * f;
      ctx.strokeStyle = ELITE_DIAMOND_GLOW;
      ctx.lineWidth = 2;
      if (!isLowGraphicsMode) { ctx.shadowBlur = 10; ctx.shadowColor = ELITE_DIAMOND_GLOW; }
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ── Nullstone elite: gravity-well halo ───────────────────────
    if (tier === 'nullstone') {
      const pulse = 0.5 + 0.5 * Math.sin(enemy.pulseMs * 0.003);
      ctx.save();
      ctx.globalAlpha = 0.12 + pulse * 0.08;
      ctx.strokeStyle = ELITE_NULLSTONE_GLOW;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 6 + pulse * radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ── Iolite elite: gravity-pull pulsing ring ──────────────────
    if (tier === 'iolite' && enemy.gravityTimerMs > 0) {
      ctx.save();
      ctx.globalAlpha = 0.4 * (enemy.gravityTimerMs / 2500);
      ctx.strokeStyle = ELITE_IOLITE_GLOW;
      ctx.lineWidth = 1.5;
      if (!isLowGraphicsMode) { ctx.shadowBlur = 8; ctx.shadowColor = ELITE_IOLITE_GLOW; }
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ── "ELITE" crown mark (small ★ above the enemy) ─────────────
    if (!isLowGraphicsMode) {
      const crownY = cy - radius - 7;
      ctx.save();
      ctx.fillStyle = glow;
      ctx.shadowBlur = 4;
      ctx.shadowColor = glow;
      ctx.font = `${radius}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', cx, crownY);
      ctx.restore();
    }

    ctx.restore();

    // ── HP bar (always drawn, outside save/restore for clarity) ──
    const barW = radius * 3.5;
    const barH = 2;
    const barX = cx - barW / 2;
    const barY = cy + radius + 3;
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#222';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = color;
    ctx.fillRect(barX, barY, barW * Math.max(0, enemy.hp / enemy.maxHp), barH);
    if (tier === 'amethyst' && enemy.maxShieldHp > 0) {
      // Thin cyan overlay for shield fraction
      ctx.fillStyle = ELITE_AMETHYST_GLOW;
      ctx.globalAlpha = 0.4;
      ctx.fillRect(barX, barY, barW * Math.max(0, enemy.shieldHp / enemy.maxShieldHp), barH);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
