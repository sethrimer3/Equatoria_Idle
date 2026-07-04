/**
 * rpg-entity-draw.ts — Pure entity draw functions extracted from rpg-render.ts.
 *
 * Covers weapon projectiles (sand, poison, laser beam, boss projectiles, emerald
 * missiles, sunstone mines), player/orbit visuals, and the target reticle.
 * Companion ship draw has moved to rpg-companion-draw.ts.
 * Combat feedback visuals (death particles, shot lines, hit effects, damage
 * numbers) have moved to rpg-combat-effects-draw.ts.
 *
 * Each function takes an explicit `ctx: CanvasRenderingContext2D` as its first
 * parameter, plus the entity array(s) it needs, instead of capturing them from
 * a closure.  This lets callers (including tests) use these functions without
 * constructing the entire rpg-render closure.
 */

import type {
  SandProjectile,
  IolitePoisonBolt,
  LaserBeamEffect,
} from './rpg-types';
import type {
  BossProjectile,
  EmeraldPlayerMissile, EmeraldSubMissile, EmeraldSwirlParticle,
  SunstoneMine,
} from './rpg-enemy-types';

import {
  SAND_PROJ_LIFE_MS, SAND_PROJ_SIZE, SAND_PROJ_GLOW, SAND_PROJ_COLOR,
  POISON_BOLT_LIFE_MS, POISON_BOLT_TRAIL_CAP, POISON_BOLT_SIZE, POISON_BOLT_COLOR, POISON_BOLT_GLOW,
  LASER_BEAM_VISIBLE_MS, LASER_BEAM_GLOW, LASER_BEAM_COLOR, LASER_BEAM_WIDTH,
  EMERALD_MISSILE_SIZE, EMERALD_MISSILE_COLOR, EMERALD_MISSILE_GLOW, EMERALD_MISSILE_TRAIL_CAP,
  EMERALD_SUB_MISSILE_SIZE, EMERALD_SUB_MISSILE_TRAIL_CAP, EMERALD_SUB_MISSILE_DECEL_START_MS,
  EMERALD_SWIRL_LIFE_MS, EMERALD_SWIRL_SIZE,
  SUNSTONE_MINE_FUSE_MS, SUNSTONE_MINE_SIZE, SUNSTONE_MINE_COLOR, SUNSTONE_MINE_GLOW,
  SUNSTONE_MINE_DANGER_COLOR,
} from './rpg-weapon-constants';

// ── Low-graphics mode flag ────────────────────────────────────
let isLowGraphicsMode = false;

/** Sets low-graphics mode for RPG entity draw functions (skips glow & trails). */
export function setLowGraphicsMode(enabled: boolean): void {
  isLowGraphicsMode = enabled;
}

type DrawBounds = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

const DENSE_PROJECTILE_COUNT = 96;
const VERY_DENSE_PROJECTILE_COUNT = 180;

function isCircleVisible(x: number, y: number, radius: number, bounds?: DrawBounds): boolean {
  return !bounds || (
    x + radius >= bounds.left &&
    x - radius <= bounds.right &&
    y + radius >= bounds.top &&
    y - radius <= bounds.bottom
  );
}

function denseTrailStep(count: number): number {
  if (count >= VERY_DENSE_PROJECTILE_COUNT) return 3;
  if (count >= DENSE_PROJECTILE_COUNT) return 2;
  return 1;
}

function canDrawProjectileGlow(count: number): boolean {
  return !isLowGraphicsMode && count < VERY_DENSE_PROJECTILE_COUNT;
}

export function drawSandProjectiles(ctx: CanvasRenderingContext2D, sandProjectiles: SandProjectile[], bounds?: DrawBounds): void {
  if (sandProjectiles.length === 0) return;
  const drawGlow = canDrawProjectileGlow(sandProjectiles.length);
  ctx.save();
  for (const p of sandProjectiles) {
    if (!isCircleVisible(p.x, p.y, SAND_PROJ_SIZE * 2, bounds)) continue;
    const alpha = p.lifeMs / SAND_PROJ_LIFE_MS;
    ctx.globalAlpha = alpha * 0.9;
    if (drawGlow) {
      ctx.shadowBlur  = SAND_PROJ_SIZE * 4; ctx.shadowColor = SAND_PROJ_GLOW;
      ctx.fillStyle   = SAND_PROJ_GLOW;
      const gr = SAND_PROJ_SIZE * 1.5;
      ctx.fillRect(Math.floor(p.x - gr), Math.floor(p.y - gr), Math.ceil(gr * 2), Math.ceil(gr * 2));
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle  = SAND_PROJ_COLOR;
    ctx.fillRect(Math.floor(p.x - SAND_PROJ_SIZE / 2), Math.floor(p.y - SAND_PROJ_SIZE / 2), SAND_PROJ_SIZE, SAND_PROJ_SIZE);
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawPoisonBolts(ctx: CanvasRenderingContext2D, poisonBolts: IolitePoisonBolt[], bounds?: DrawBounds): void {
  if (poisonBolts.length === 0) return;
  const drawGlow = canDrawProjectileGlow(poisonBolts.length);
  const trailStep = denseTrailStep(poisonBolts.length);
  ctx.save();
  for (const p of poisonBolts) {
    if (!isCircleVisible(p.x, p.y, POISON_BOLT_SIZE * 2, bounds)) continue;
    const alpha = p.lifeMs / POISON_BOLT_LIFE_MS;
    // Trail (skip in low-graphics mode)
    if (drawGlow && p.trailCount >= 2) {
      for (let i = 0; i < p.trailCount; i += trailStep) {
        const idx = (p.trailHead - p.trailCount + i + POISON_BOLT_TRAIL_CAP) % POISON_BOLT_TRAIL_CAP;
        const t   = i / p.trailCount;
        const r   = POISON_BOLT_SIZE * t * 0.8;
        if (r < 0.3) continue;
        ctx.globalAlpha = t * alpha * 0.5;
        ctx.fillStyle = POISON_BOLT_COLOR;
        ctx.fillRect(Math.floor(p.trailX[idx] - r), Math.floor(p.trailY[idx] - r), Math.ceil(r * 2), Math.ceil(r * 2));
      }
    }
    // Bolt core
    ctx.globalAlpha = alpha * 0.9;
    if (drawGlow) {
      ctx.shadowBlur  = POISON_BOLT_SIZE * 4; ctx.shadowColor = POISON_BOLT_GLOW;
      ctx.fillStyle   = POISON_BOLT_GLOW;
      const gr = POISON_BOLT_SIZE * 1.5;
      ctx.fillRect(Math.floor(p.x - gr), Math.floor(p.y - gr), Math.ceil(gr * 2), Math.ceil(gr * 2));
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle  = POISON_BOLT_COLOR;
    ctx.fillRect(Math.floor(p.x - POISON_BOLT_SIZE / 2), Math.floor(p.y - POISON_BOLT_SIZE / 2), POISON_BOLT_SIZE, POISON_BOLT_SIZE);
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawLaserBeamEffect(ctx: CanvasRenderingContext2D, effect: LaserBeamEffect | null): void {
  if (!effect || !effect.active) return;
  const endX = effect.endX;
  const endY = effect.endY;
  const t = effect.timerMs / LASER_BEAM_VISIBLE_MS;
  ctx.save();
  ctx.globalAlpha = t * 0.9;
  ctx.lineCap = 'round';
  // Glow pass (skip in low-graphics mode)
  if (!isLowGraphicsMode) {
    ctx.shadowBlur = 12; ctx.shadowColor = LASER_BEAM_GLOW;
    ctx.strokeStyle = LASER_BEAM_GLOW; ctx.lineWidth = LASER_BEAM_WIDTH * 3;
    ctx.beginPath(); ctx.moveTo(effect.startX, effect.startY); ctx.lineTo(endX, endY); ctx.stroke();
    ctx.shadowBlur = 0;
  }
  // Core pass
  ctx.strokeStyle = LASER_BEAM_COLOR; ctx.lineWidth = LASER_BEAM_WIDTH;
  ctx.beginPath(); ctx.moveTo(effect.startX, effect.startY); ctx.lineTo(endX, endY); ctx.stroke();
  ctx.globalAlpha = 1; ctx.restore();
}

export function drawBossProjectiles(ctx: CanvasRenderingContext2D, projectiles: BossProjectile[], bounds?: DrawBounds): void {
  if (projectiles.length === 0) return;
  const drawGlow = canDrawProjectileGlow(projectiles.length);
  const denseBodies = projectiles.length >= DENSE_PROJECTILE_COUNT;
  ctx.save();
  for (const p of projectiles) {
    if (!isCircleVisible(p.x, p.y, p.size * Math.max(2, p.lengthScale ?? 1), bounds)) continue;
    const lifeRatio = p.lifeMs / p.maxLifeMs;
    const alpha = Math.min(1, lifeRatio * 3.0);
    const ph = p.size / 2;
    const ls = p.lengthScale ?? 1;

    ctx.globalAlpha = alpha;

    if (ls > 1 && !denseBodies) {
      // Elongated streak aligned to velocity direction
      const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      const angle = spd > 0.01 ? Math.atan2(p.vy, p.vx) : 0;
      const len = p.size * ls;
      ctx.save();
      ctx.translate(Math.round(p.x), Math.round(p.y));
      ctx.rotate(angle);
      if (drawGlow) {
        ctx.shadowBlur = p.size * 4; ctx.shadowColor = p.glowColor;
        ctx.fillStyle = p.glowColor;
        ctx.fillRect(-len / 2 - ph * 0.6, -ph * 1.8, len + ph * 1.2, ph * 3.6);
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = p.color;
      ctx.fillRect(-len / 2, -ph, len, p.size);
      ctx.restore();
    } else {
      if (drawGlow) {
        ctx.shadowBlur = p.size * 5; ctx.shadowColor = p.glowColor; ctx.fillStyle = p.glowColor;
        const gh = ph * 2.2;
        ctx.fillRect(Math.floor(p.x - gh), Math.floor(p.y - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.floor(p.x - ph), Math.floor(p.y - ph), p.size, p.size);
    }
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}


// ── Emerald player missiles (heat-seeking, gorgeous comet trails) ──────────────

export function drawEmeraldPlayerMissiles(
  ctx: CanvasRenderingContext2D,
  missiles: EmeraldPlayerMissile[],
  bounds?: DrawBounds,
): void {
  if (missiles.length === 0) return;
  const now = performance.now();
  const drawGlow = canDrawProjectileGlow(missiles.length);
  const trailStep = denseTrailStep(missiles.length);
  ctx.save();
  for (const m of missiles) {
    if (!isCircleVisible(m.x, m.y, EMERALD_MISSILE_SIZE * 4, bounds)) continue;
    // Flickering alpha for fizzling missiles.
    const baseAlpha = m.isFizzling
      ? 0.5 + 0.5 * Math.abs(Math.sin(now * 0.015))
      : 1;
    const proximityAlpha = m.proximityAlpha;

    // Comet trail — layered glow fading from bright tip to dark tail.
    // Glow is 25% smaller: shadowBlur and outer glow rect reduced by factor 0.75.
    if (!isLowGraphicsMode && m.trailCount >= 2) {
      for (let i = 0; i < m.trailCount; i += trailStep) {
        const t      = i / m.trailCount;
        const bufIdx = (m.trailHead - m.trailCount + i + EMERALD_MISSILE_TRAIL_CAP) % EMERALD_MISSILE_TRAIL_CAP;
        const trailSize = EMERALD_MISSILE_SIZE * t * 1.8;
        if (trailSize < 0.2) continue;
        const half = trailSize / 2;
        // Outer glow layer (glow radius reduced 25%).
        if (drawGlow) {
          ctx.globalAlpha = t * 0.5 * baseAlpha * proximityAlpha;
          ctx.shadowBlur  = trailSize * 5.25; ctx.shadowColor = EMERALD_MISSILE_GLOW;
          ctx.fillStyle   = EMERALD_MISSILE_GLOW;
          const gh = half * 1.875;
          ctx.fillRect(Math.floor(m.trailX[bufIdx] - gh), Math.floor(m.trailY[bufIdx] - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
          ctx.shadowBlur = 0;
        }
        // Inner core layer.
        ctx.globalAlpha = t * 0.75 * baseAlpha * proximityAlpha;
        ctx.fillStyle   = EMERALD_MISSILE_COLOR;
        ctx.fillRect(Math.floor(m.trailX[bufIdx] - half), Math.floor(m.trailY[bufIdx] - half), Math.ceil(trailSize), Math.ceil(trailSize));
      }
    }
    // Missile body — bright emerald core (glow 25% smaller).
    const half = EMERALD_MISSILE_SIZE / 2;
    ctx.globalAlpha = baseAlpha * proximityAlpha;
    if (drawGlow) {
      ctx.shadowBlur  = EMERALD_MISSILE_SIZE * 4.5; ctx.shadowColor = EMERALD_MISSILE_GLOW;
      ctx.fillStyle   = EMERALD_MISSILE_GLOW;
      const gh = half * 1.8;
      ctx.fillRect(Math.floor(m.x - gh), Math.floor(m.y - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle  = EMERALD_MISSILE_COLOR;
    ctx.fillRect(Math.floor(m.x - half), Math.floor(m.y - half), EMERALD_MISSILE_SIZE, EMERALD_MISSILE_SIZE);
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

// ── Emerald sub-missiles (tiny heat-seekers) ──────────────────────────────────

export function drawEmeraldSubMissiles(
  ctx: CanvasRenderingContext2D,
  missiles: EmeraldSubMissile[],
  bounds?: DrawBounds,
): void {
  if (missiles.length === 0) return;
  const now = performance.now();
  const drawGlow = canDrawProjectileGlow(missiles.length);
  const trailStep = denseTrailStep(missiles.length);
  ctx.save();
  for (const s of missiles) {
    if (!isCircleVisible(s.x, s.y, EMERALD_SUB_MISSILE_SIZE * 4, bounds)) continue;
    const isDecelerating = s.lifetimeMs >= EMERALD_SUB_MISSILE_DECEL_START_MS;
    const baseAlpha = isDecelerating
      ? 0.4 + 0.6 * Math.abs(Math.sin(now * 0.018))
      : 1;
    const proximityAlpha = s.proximityAlpha;

    // Short comet trail.
    if (!isLowGraphicsMode && s.trailCount >= 2) {
      for (let i = 0; i < s.trailCount; i += trailStep) {
        const t      = i / s.trailCount;
        const bufIdx = (s.trailHead - s.trailCount + i + EMERALD_SUB_MISSILE_TRAIL_CAP) % EMERALD_SUB_MISSILE_TRAIL_CAP;
        const trailSize = EMERALD_SUB_MISSILE_SIZE * t * 1.6;
        if (trailSize < 0.15) continue;
        const half = trailSize / 2;
        if (drawGlow) {
          ctx.globalAlpha = t * 0.45 * baseAlpha * proximityAlpha;
          ctx.shadowBlur  = trailSize * 5; ctx.shadowColor = EMERALD_MISSILE_GLOW;
          ctx.fillStyle   = EMERALD_MISSILE_GLOW;
          const gh = half * 1.8;
          ctx.fillRect(Math.floor(s.trailX[bufIdx] - gh), Math.floor(s.trailY[bufIdx] - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
          ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = t * 0.65 * baseAlpha * proximityAlpha;
        ctx.fillStyle   = EMERALD_MISSILE_COLOR;
        ctx.fillRect(Math.floor(s.trailX[bufIdx] - half), Math.floor(s.trailY[bufIdx] - half), Math.ceil(trailSize), Math.ceil(trailSize));
      }
    }
    // Sub-missile body.
    const half = EMERALD_SUB_MISSILE_SIZE / 2;
    ctx.globalAlpha = baseAlpha * proximityAlpha;
    if (drawGlow) {
      ctx.shadowBlur  = EMERALD_SUB_MISSILE_SIZE * 4; ctx.shadowColor = EMERALD_MISSILE_GLOW;
      ctx.fillStyle   = EMERALD_MISSILE_GLOW;
      const gh = half * 1.8;
      ctx.fillRect(Math.floor(s.x - gh), Math.floor(s.y - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle  = EMERALD_MISSILE_COLOR;
    ctx.fillRect(Math.floor(s.x - half), Math.floor(s.y - half), Math.ceil(EMERALD_SUB_MISSILE_SIZE), Math.ceil(EMERALD_SUB_MISSILE_SIZE));
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

// ── Emerald swirl particles (visual-only, spawned by sub-missile AOE explosion) ─

export function drawEmeraldSwirlParticles(
  ctx: CanvasRenderingContext2D,
  particles: EmeraldSwirlParticle[],
  bounds?: DrawBounds,
): void {
  if (particles.length === 0) return;
  const drawGlow = canDrawProjectileGlow(particles.length);
  ctx.save();
  for (const p of particles) {
    if (!isCircleVisible(p.x, p.y, EMERALD_SWIRL_SIZE * 3, bounds)) continue;
    const alpha = Math.max(0, p.lifeMs / EMERALD_SWIRL_LIFE_MS);
    const half  = EMERALD_SWIRL_SIZE / 2;
    ctx.globalAlpha = alpha * 0.85;
    if (drawGlow) {
      ctx.shadowBlur  = EMERALD_SWIRL_SIZE * 5; ctx.shadowColor = EMERALD_MISSILE_GLOW;
      ctx.fillStyle   = EMERALD_MISSILE_GLOW;
      const gh = half * 2;
      ctx.fillRect(Math.floor(p.x - gh), Math.floor(p.y - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = EMERALD_MISSILE_COLOR;
    ctx.fillRect(Math.floor(p.x - half), Math.floor(p.y - half), Math.ceil(EMERALD_SWIRL_SIZE), Math.ceil(EMERALD_SWIRL_SIZE));
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

// ── Sunstone mines ────────────────────────────────────────────────────────────

export function drawSunstoneMines(
  ctx: CanvasRenderingContext2D,
  mines: SunstoneMine[],
  bounds?: DrawBounds,
): void {
  if (mines.length === 0) return;
  const nowMs = Date.now();
  const drawGlow = canDrawProjectileGlow(mines.length);
  ctx.save();
  for (const mine of mines) {
    if (!isCircleVisible(mine.x, mine.y, SUNSTONE_MINE_SIZE * 4, bounds)) continue;
    const fuseRatio = mine.fuseMs / SUNSTONE_MINE_FUSE_MS;
    // Danger threshold: last 4 seconds the mine pulses red.
    const isDanger = mine.fuseMs <= 4000;
    const pulseT   = isDanger ? (Math.sin(nowMs / 120) + 1) * 0.5 : 0;
    const bodyColor = isDanger
      ? lerpColor(SUNSTONE_MINE_COLOR, SUNSTONE_MINE_DANGER_COLOR, pulseT)
      : SUNSTONE_MINE_COLOR;
    const glowColor = isDanger
      ? lerpColor(SUNSTONE_MINE_GLOW, '#ff6600', pulseT)
      : SUNSTONE_MINE_GLOW;

    const half = SUNSTONE_MINE_SIZE / 2;

    // Outer glow (skip in low-graphics mode).
    if (drawGlow) {
      ctx.globalAlpha = 0.7;
      ctx.shadowBlur  = SUNSTONE_MINE_SIZE * 5; ctx.shadowColor = glowColor;
      ctx.fillStyle   = glowColor;
      const gh = half * 2;
      ctx.fillRect(Math.floor(mine.x - gh), Math.floor(mine.y - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
      ctx.shadowBlur = 0;
    }

    // Mine body.
    ctx.globalAlpha = 1;
    ctx.fillStyle   = bodyColor;
    ctx.fillRect(Math.floor(mine.x - half), Math.floor(mine.y - half), SUNSTONE_MINE_SIZE, SUNSTONE_MINE_SIZE);

    // Fuse ring indicator: arc around mine showing remaining fuse time.
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = bodyColor;
    if (!isLowGraphicsMode) {
      ctx.shadowBlur  = 3; ctx.shadowColor = glowColor;
    }
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.arc(mine.x, mine.y, SUNSTONE_MINE_SIZE + 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fuseRatio);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

/**
 * Linearly interpolates between two CSS hex colours.
 * Both colors must be 7-character '#rrggbb' strings.
 */
function lerpColor(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r  = Math.round(ar + (br - ar) * t);
  const g  = Math.round(ag + (bg - ag) * t);
  const bv = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bv.toString(16).padStart(2, '0')}`;
}
