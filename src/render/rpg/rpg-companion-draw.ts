/**
 * rpg-companion-draw.ts — Draw functions for Sapphire and Amethyst companion ships
 * and their associated lasers.
 *
 * Extracted from rpg-entity-draw.ts to keep that file focused on player-side and
 * general weapon-projectile rendering.  All functions are pure: they take an
 * explicit `ctx: CanvasRenderingContext2D` and entity arrays, with no closure
 * dependencies.
 */

import type {
  SapphireShip, SapphireLaser,
  AmethystShip, AmethystLaser,
} from './rpg-enemy-types';
import {
  SAPPHIRE_SHIP_SIZE, SAPPHIRE_SHIP_TRAIL_CAP,
  SAPPHIRE_SHIP_TRAIL_CORE_HEAD_W, SAPPHIRE_SHIP_TRAIL_CORE_TAIL_W,
  SAPPHIRE_SHIP_TRAIL_GLOW_W, SAPPHIRE_SHIP_TRAIL_TAPER,
  SAPPHIRE_LASER_SIZE, SAPPHIRE_LASER_COLOR, SAPPHIRE_LASER_GLOW, SAPPHIRE_LASER_TRAIL_CAP,
  SAPPHIRE_LASER_LIFE_MS,
  SAPPHIRE_LASER_TRAIL_CORE_HEAD_W, SAPPHIRE_LASER_TRAIL_CORE_TAIL_W,
  SAPPHIRE_LASER_TRAIL_GLOW_W, SAPPHIRE_LASER_TRAIL_TAPER,
  AMETHYST_SHIP_SIZE, AMETHYST_SHIP_TRAIL_CAP,
  AMETHYST_LASER_SIZE, AMETHYST_LASER_COLOR, AMETHYST_LASER_GLOW, AMETHYST_LASER_TRAIL_CAP,
  AMETHYST_LASER_TRAIL_CORE_HEAD_W, AMETHYST_LASER_TRAIL_CORE_TAIL_W,
  AMETHYST_LASER_TRAIL_GLOW_W, AMETHYST_LASER_TRAIL_TAPER,
  AMETHYST_LASER_DURATION_MS,
} from './rpg-weapon-constants';
import {
  beginNeonGlowBatch, endNeonGlowBatch,
  drawNeonTrailGlow, drawNeonTrailCore,
  type NeonTrailConfig,
} from './neon-trail-draw';

// ── Module-level cached neon trail configs (no per-frame allocation) ─────────

const _sapphireShipTrailCfg: NeonTrailConfig = {
  coreColor:      SAPPHIRE_LASER_COLOR,
  glowColor:      SAPPHIRE_LASER_GLOW,
  coreHeadWidth:  SAPPHIRE_SHIP_TRAIL_CORE_HEAD_W,
  coreTailWidth:  SAPPHIRE_SHIP_TRAIL_CORE_TAIL_W,
  glowWidth:      SAPPHIRE_SHIP_TRAIL_GLOW_W,
  taperSegments:  SAPPHIRE_SHIP_TRAIL_TAPER,
};

const _sapphireLaserTrailCfg: NeonTrailConfig = {
  coreColor:      SAPPHIRE_LASER_COLOR,
  glowColor:      SAPPHIRE_LASER_GLOW,
  coreHeadWidth:  SAPPHIRE_LASER_TRAIL_CORE_HEAD_W,
  coreTailWidth:  SAPPHIRE_LASER_TRAIL_CORE_TAIL_W,
  glowWidth:      SAPPHIRE_LASER_TRAIL_GLOW_W,
  taperSegments:  SAPPHIRE_LASER_TRAIL_TAPER,
};

const _amethystLaserTrailCfg: NeonTrailConfig = {
  coreColor:      AMETHYST_LASER_COLOR,
  glowColor:      AMETHYST_LASER_GLOW,
  coreHeadWidth:  AMETHYST_LASER_TRAIL_CORE_HEAD_W,
  coreTailWidth:  AMETHYST_LASER_TRAIL_CORE_TAIL_W,
  glowWidth:      AMETHYST_LASER_TRAIL_GLOW_W,
  taperSegments:  AMETHYST_LASER_TRAIL_TAPER,
};

// ── Low-graphics mode flag ────────────────────────────────────────────────────
let isLowGraphicsMode = false;

/** Sets low-graphics mode for companion-ship draw functions (skips glow & trails). */
export function setLowGraphicsMode(enabled: boolean): void {
  isLowGraphicsMode = enabled;
}

// ── Sapphire companion ship draw functions ────────────────────────────────────

export function drawSapphireShips(
  ctx: CanvasRenderingContext2D,
  ships: SapphireShip[],
): void {
  if (ships.length === 0) return;
  ctx.save();

  if (!isLowGraphicsMode) {
    // ── Neon trail glow pass (accumulated on offscreen canvas, then composited) ──
    beginNeonGlowBatch(ctx);
    for (const ship of ships) {
      if (ship.trailCount >= 2) {
        drawNeonTrailGlow(ship.trailX, ship.trailY, ship.trailHead, ship.trailCount, SAPPHIRE_SHIP_TRAIL_CAP, _sapphireShipTrailCfg, 1.0);
      }
    }
    endNeonGlowBatch(ctx);

    // ── Neon trail core pass (drawn directly on main canvas) ──
    for (const ship of ships) {
      if (ship.trailCount >= 2) {
        drawNeonTrailCore(ctx, ship.trailX, ship.trailY, ship.trailHead, ship.trailCount, SAPPHIRE_SHIP_TRAIL_CAP, _sapphireShipTrailCfg, 1.0);
      }
    }
  }

  // ── Ship body — triangle rotated to face direction of travel ──
  for (const ship of ships) {
    ctx.globalAlpha = 1;
    if (!isLowGraphicsMode) {
      ctx.shadowBlur = SAPPHIRE_SHIP_SIZE * 3; ctx.shadowColor = SAPPHIRE_LASER_GLOW;
    }
    ctx.fillStyle = SAPPHIRE_LASER_COLOR;
    const radius  = SAPPHIRE_SHIP_SIZE + 0.5;
    const speed   = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
    const heading = speed > 0.05 ? Math.atan2(ship.vy, ship.vx) : -Math.PI / 2;
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(heading + Math.PI / 2); // rotate so tip faces direction of motion
    ctx.beginPath();
    ctx.moveTo(0, -radius);
    ctx.lineTo(-radius, radius * 0.8);
    ctx.lineTo(radius, radius * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawSapphireLasers(
  ctx: CanvasRenderingContext2D,
  lasers: SapphireLaser[],
): void {
  if (lasers.length === 0) return;
  ctx.save();

  if (!isLowGraphicsMode) {
    // ── Neon trail glow pass ──
    beginNeonGlowBatch(ctx);
    for (const laser of lasers) {
      if (laser.trailCount >= 2) {
        const lifeFraction = laser.lifeMs / SAPPHIRE_LASER_LIFE_MS;
        drawNeonTrailGlow(laser.trailX, laser.trailY, laser.trailHead, laser.trailCount, SAPPHIRE_LASER_TRAIL_CAP, _sapphireLaserTrailCfg, lifeFraction);
      }
    }
    endNeonGlowBatch(ctx);

    // ── Neon trail core pass ──
    for (const laser of lasers) {
      if (laser.trailCount >= 2) {
        const lifeFraction = laser.lifeMs / SAPPHIRE_LASER_LIFE_MS;
        drawNeonTrailCore(ctx, laser.trailX, laser.trailY, laser.trailHead, laser.trailCount, SAPPHIRE_LASER_TRAIL_CAP, _sapphireLaserTrailCfg, lifeFraction);
      }
    }
  }

  // ── Laser head ──
  for (const laser of lasers) {
    const alpha = laser.lifeMs / SAPPHIRE_LASER_LIFE_MS;
    ctx.globalAlpha = alpha * 0.9;
    if (!isLowGraphicsMode) {
      ctx.shadowBlur = SAPPHIRE_LASER_SIZE * 4; ctx.shadowColor = SAPPHIRE_LASER_GLOW;
      ctx.fillStyle  = SAPPHIRE_LASER_GLOW;
      const gr = SAPPHIRE_LASER_SIZE * 1.5;
      ctx.fillRect(Math.floor(laser.x - gr), Math.floor(laser.y - gr), Math.ceil(gr * 2), Math.ceil(gr * 2));
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = SAPPHIRE_LASER_COLOR;
    ctx.fillRect(Math.floor(laser.x - SAPPHIRE_LASER_SIZE / 2), Math.floor(laser.y - SAPPHIRE_LASER_SIZE / 2), SAPPHIRE_LASER_SIZE, SAPPHIRE_LASER_SIZE);
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

// ── Amethyst companion ship draw functions ────────────────────────────────────

export function drawAmethystShips(
  ctx: CanvasRenderingContext2D,
  ships: AmethystShip[],
): void {
  if (ships.length === 0) return;
  ctx.save();
  for (const ship of ships) {
    // Trail (skip in low-graphics mode)
    if (!isLowGraphicsMode && ship.trailCount >= 2) {
      for (let i = 0; i < ship.trailCount; i++) {
        const idx = (ship.trailHead - ship.trailCount + i + AMETHYST_SHIP_TRAIL_CAP) % AMETHYST_SHIP_TRAIL_CAP;
        const t   = i / ship.trailCount;
        const r   = AMETHYST_SHIP_SIZE * t * 0.6;
        if (r < 0.3) continue;
        ctx.globalAlpha = t * 0.4;
        ctx.fillStyle = AMETHYST_LASER_COLOR;
        ctx.fillRect(Math.floor(ship.trailX[idx] - r), Math.floor(ship.trailY[idx] - r), Math.ceil(r * 2), Math.ceil(r * 2));
      }
    }
    // Ship body — triangle rotated to face direction of travel
    ctx.globalAlpha = 1;
    if (!isLowGraphicsMode) {
      ctx.shadowBlur = AMETHYST_SHIP_SIZE * 3; ctx.shadowColor = AMETHYST_LASER_GLOW;
    }
    ctx.fillStyle = AMETHYST_LASER_COLOR;
    const radius  = AMETHYST_SHIP_SIZE + 0.5;
    const speed   = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
    const heading = speed > 0.05 ? Math.atan2(ship.vy, ship.vx) : -Math.PI / 2;
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(heading + Math.PI / 2); // rotate so tip faces direction of motion
    ctx.beginPath();
    ctx.moveTo(0, -radius);
    ctx.lineTo(-radius, radius * 0.8);
    ctx.lineTo(radius, radius * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawAmethystLasers(
  ctx: CanvasRenderingContext2D,
  lasers: AmethystLaser[],
): void {
  if (lasers.length === 0) return;
  ctx.save();

  if (!isLowGraphicsMode) {
    // ── Neon trail glow pass (accumulated on offscreen canvas, then composited) ──
    beginNeonGlowBatch(ctx);
    for (const laser of lasers) {
      if (laser.trailCount >= 2) {
        drawNeonTrailGlow(laser.trailX, laser.trailY, laser.trailHead, laser.trailCount, AMETHYST_LASER_TRAIL_CAP, _amethystLaserTrailCfg, laser.lifeMs / AMETHYST_LASER_DURATION_MS);
      }
    }
    endNeonGlowBatch(ctx);

    // ── Neon trail core pass (tapered, shrinks from tail to tip as life drops) ──
    for (const laser of lasers) {
      if (laser.trailCount >= 2) {
        drawNeonTrailCore(ctx, laser.trailX, laser.trailY, laser.trailHead, laser.trailCount, AMETHYST_LASER_TRAIL_CAP, _amethystLaserTrailCfg, laser.lifeMs / AMETHYST_LASER_DURATION_MS);
      }
    }
  }

  // ── Laser head ──
  for (const laser of lasers) {
    const alpha = laser.lifeMs / AMETHYST_LASER_DURATION_MS;
    ctx.globalAlpha = alpha * 0.9;
    if (!isLowGraphicsMode) {
      ctx.shadowBlur = AMETHYST_LASER_SIZE * 5; ctx.shadowColor = AMETHYST_LASER_GLOW;
      ctx.fillStyle  = AMETHYST_LASER_GLOW;
      const gr = AMETHYST_LASER_SIZE * 1.5;
      ctx.fillRect(Math.floor(laser.x - gr), Math.floor(laser.y - gr), Math.ceil(gr * 2), Math.ceil(gr * 2));
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = AMETHYST_LASER_COLOR;
    ctx.fillRect(Math.floor(laser.x - AMETHYST_LASER_SIZE / 2), Math.floor(laser.y - AMETHYST_LASER_SIZE / 2), AMETHYST_LASER_SIZE, AMETHYST_LASER_SIZE);
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}
