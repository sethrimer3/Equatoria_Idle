/**
 * rpg-entity-draw.ts — Pure entity draw functions extracted from rpg-render.ts.
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
  DeathParticle, ShotLine, HitEffect, DamageNumber,
  LaserEnemy,
  WeaponOrbitParticle, OrbitProjectile,
} from './rpg-types';
import type {
  BossProjectile,
  EmeraldPlayerMissile, EmeraldSubMissile, EmeraldSwirlParticle,
  SunstoneMine,
  SapphireShip, SapphireLaser,
  AmethystShip, AmethystLaser,
} from './rpg-enemy-types';

import {
  SAND_PROJ_LIFE_MS, SAND_PROJ_SIZE, SAND_PROJ_GLOW, SAND_PROJ_COLOR,
  POISON_BOLT_LIFE_MS, POISON_BOLT_TRAIL_CAP, POISON_BOLT_SIZE, POISON_BOLT_COLOR, POISON_BOLT_GLOW,
  LASER_BEAM_VISIBLE_MS, LASER_BEAM_GLOW, LASER_BEAM_COLOR, LASER_BEAM_WIDTH,
  SHOT_LINE_DURATION_MS, HIT_EFFECT_DURATION_MS,
  DAMAGE_NUM_DURATION_MS, DAMAGE_NUM_FONT_FAMILY,
  WEAPON_ORBIT_TRAIL_CAP, ORBIT_PROJ_TRAIL_CAP, ORBIT_PROJ_SIZE,
  LASER_DASH_DISTANCE, LASER_TRAIL_ERASE_MS, ATTACK_TRAIL_LENGTH_SCALE,
  ATTACK_TRAIL_ALPHA, ATTACK_TRAIL_ERASE_FADE, LASER_ENEMY_GLOW, LASER_ENEMY_COLOR,
  EMERALD_MISSILE_SIZE, EMERALD_MISSILE_COLOR, EMERALD_MISSILE_GLOW, EMERALD_MISSILE_TRAIL_CAP,
  EMERALD_SUB_MISSILE_SIZE, EMERALD_SUB_MISSILE_TRAIL_CAP, EMERALD_SUB_MISSILE_DECEL_START_MS,
  EMERALD_SWIRL_LIFE_MS, EMERALD_SWIRL_SIZE,
  SUNSTONE_MINE_FUSE_MS, SUNSTONE_MINE_SIZE, SUNSTONE_MINE_COLOR, SUNSTONE_MINE_GLOW,
  SUNSTONE_MINE_DANGER_COLOR,
  SAPPHIRE_SHIP_SIZE, SAPPHIRE_SHIP_TRAIL_CAP,
  SAPPHIRE_LASER_SIZE, SAPPHIRE_LASER_COLOR, SAPPHIRE_LASER_GLOW, SAPPHIRE_LASER_TRAIL_CAP,
  AMETHYST_SHIP_SIZE, AMETHYST_SHIP_TRAIL_CAP,
  AMETHYST_LASER_SIZE, AMETHYST_LASER_COLOR, AMETHYST_LASER_GLOW, AMETHYST_LASER_TRAIL_CAP,
} from './rpg-constants';

// ── Low-graphics mode flag ────────────────────────────────────
let isLowGraphicsMode = false;

/** Sets low-graphics mode for RPG entity draw functions (skips glow & trails). */
export function setLowGraphicsMode(enabled: boolean): void {
  isLowGraphicsMode = enabled;
}

export function drawSandProjectiles(ctx: CanvasRenderingContext2D, sandProjectiles: SandProjectile[]): void {
  if (sandProjectiles.length === 0) return;
  ctx.save();
  for (const p of sandProjectiles) {
    const alpha = p.lifeMs / SAND_PROJ_LIFE_MS;
    ctx.globalAlpha = alpha * 0.9;
    if (!isLowGraphicsMode) {
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

export function drawPoisonBolts(ctx: CanvasRenderingContext2D, poisonBolts: IolitePoisonBolt[]): void {
  if (poisonBolts.length === 0) return;
  ctx.save();
  for (const p of poisonBolts) {
    const alpha = p.lifeMs / POISON_BOLT_LIFE_MS;
    // Trail (skip in low-graphics mode)
    if (!isLowGraphicsMode && p.trailCount >= 2) {
      for (let i = 0; i < p.trailCount; i++) {
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
    if (!isLowGraphicsMode) {
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

export function drawAttackTrail(ctx: CanvasRenderingContext2D, enemy: LaserEnemy, nowMs: number): void {
  const trail = enemy.attackTrail;
  if (!trail.active) return;
  const isDashing = trail.trailEndMs === Infinity;
  let drawProgress: number, eraseProgress: number;
  if (isDashing) {
    drawProgress = Math.min(enemy.dashTraveled / LASER_DASH_DISTANCE, 1.0);
    eraseProgress = 0;
  } else {
    drawProgress = 1.0;
    eraseProgress = Math.min((nowMs - trail.trailEndMs) / LASER_TRAIL_ERASE_MS, 1.0);
    if (eraseProgress >= 1.0) { trail.active = false; return; }
  }
  const sx = trail.startX, sy = trail.startY, tx = trail.endX, ty = trail.endY;
  const ddx = tx - sx, ddy = ty - sy;
  const L = Math.sqrt(ddx * ddx + ddy * ddy);
  if (L < 1) return;
  const midX = (sx + tx) * 0.5, midY = (sy + ty) * 0.5;
  const perpX = -ddy / L, perpY = ddx / L;
  const curveOffset = L * Math.tan(trail.controlAngle);
  const controlX = midX + perpX * curveOffset, controlY = midY + perpY * curveOffset;
  const dashLen    = L * ATTACK_TRAIL_LENGTH_SCALE;
  const dashOffset = isDashing ? dashLen * (1 - drawProgress) : -(dashLen * eraseProgress);
  const alpha = isDashing ? ATTACK_TRAIL_ALPHA : ATTACK_TRAIL_ALPHA * (1 - eraseProgress * ATTACK_TRAIL_ERASE_FADE);
  ctx.save();
  ctx.setLineDash([dashLen, dashLen]);
  ctx.lineDashOffset = dashOffset;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = alpha;
  ctx.shadowBlur = isLowGraphicsMode ? 0 : 5; ctx.shadowColor = LASER_ENEMY_GLOW;
  ctx.strokeStyle = LASER_ENEMY_GLOW; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(controlX, controlY, tx, ty); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = LASER_ENEMY_COLOR; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(controlX, controlY, tx, ty); ctx.stroke();
  ctx.restore();
}

export function drawDeathParticles(ctx: CanvasRenderingContext2D, particles: DeathParticle[]): void {
  for (const p of particles) {
    ctx.globalAlpha = p.alpha; ctx.shadowBlur = isLowGraphicsMode ? 0 : p.size * 3; ctx.shadowColor = p.color;
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.floor(p.x - p.size / 2), Math.floor(p.y - p.size / 2), Math.ceil(p.size), Math.ceil(p.size));
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

export function drawShotLines(ctx: CanvasRenderingContext2D, lines: ShotLine[]): void {
  if (lines.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (const line of lines) {
    const t = line.timerMs / SHOT_LINE_DURATION_MS;
    ctx.globalAlpha = t * 0.7;
    ctx.strokeStyle = line.color;
    ctx.shadowBlur  = isLowGraphicsMode ? 0 : 3; ctx.shadowColor = line.color;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
  }
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  ctx.restore();
}

export function drawHitEffects(ctx: CanvasRenderingContext2D, effects: HitEffect[]): void {
  if (effects.length === 0) return;
  ctx.save();
  for (const h of effects) {
    const t    = h.timerMs / HIT_EFFECT_DURATION_MS;
    const size = 3 + (1 - t) * 5;
    const half = size / 2;
    ctx.globalAlpha = t * 0.9;
    ctx.shadowBlur  = isLowGraphicsMode ? 0 : size * 3; ctx.shadowColor = h.color; ctx.fillStyle = h.color;
    ctx.fillRect(Math.floor(h.x - half), Math.floor(h.y - half), Math.ceil(size), Math.ceil(size));
  }
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  ctx.restore();
}

export function drawDamageNumbers(ctx: CanvasRenderingContext2D, numbers: DamageNumber[]): void {
  if (numbers.length === 0) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const dn of numbers) {
    const t = dn.timerMs / DAMAGE_NUM_DURATION_MS;
    // Fade in sharply, then hold, then fade out in the last third.
    const alpha = t > 0.33 ? 1.0 : t / 0.33;
    ctx.globalAlpha = alpha;
    const fontPx = Math.max(1, Math.round(dn.fontPx));
    ctx.font = `bold ${fontPx}px ${DAMAGE_NUM_FONT_FAMILY}`;
    ctx.shadowBlur  = isLowGraphicsMode ? 0 : fontPx * 2;
    ctx.shadowColor = dn.color;
    ctx.fillStyle   = dn.color;
    ctx.fillText(dn.text, Math.round(dn.x), Math.round(dn.y));
  }
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  ctx.restore();
}

export function drawWeaponOrbitParticle(ctx: CanvasRenderingContext2D, p: WeaponOrbitParticle): void {
  ctx.save();
  // Draw trail first
  if (!isLowGraphicsMode && p.trailCount >= 2) {
    for (let i = 0; i < p.trailCount; i++) {
      const t      = i / p.trailCount;
      const bufIdx = (p.trailHead - p.trailCount + i + WEAPON_ORBIT_TRAIL_CAP) % WEAPON_ORBIT_TRAIL_CAP;
      const trailSize = p.size * t * 1.2;
      if (trailSize < 0.3) continue;
      const half = trailSize / 2;
      ctx.globalAlpha = t * 0.5;
      ctx.shadowBlur = isLowGraphicsMode ? 0 : trailSize * 5; ctx.shadowColor = p.glowColor; ctx.fillStyle = p.glowColor;
      ctx.fillRect(Math.floor(p.trailX[bufIdx] - half), Math.floor(p.trailY[bufIdx] - half), Math.ceil(trailSize), Math.ceil(trailSize));
      ctx.shadowBlur = 0;
    }
  }
  // Draw main particle
  const half = p.size / 2;
  ctx.globalAlpha = 0.9;
  if (!isLowGraphicsMode) {
    ctx.shadowBlur = p.size * 5; ctx.shadowColor = p.glowColor; ctx.fillStyle = p.glowColor;
    ctx.fillRect(Math.floor(p.x - half * 1.8), Math.floor(p.y - half * 1.8), Math.ceil(p.size * 1.8), Math.ceil(p.size * 1.8));
    ctx.shadowBlur = 0;
  }
  ctx.fillStyle = p.color;
  ctx.fillRect(Math.floor(p.x - half), Math.floor(p.y - half), Math.ceil(p.size), Math.ceil(p.size));
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawOrbitProjectile(ctx: CanvasRenderingContext2D, op: OrbitProjectile | null): void {
  if (!op) return;
  const projColor   = '#ffaa44';
  const projGlow    = '#ffcc88';
  ctx.save();
  // Trail
  if (!isLowGraphicsMode && op.trailCount >= 2) {
    for (let i = 0; i < op.trailCount; i++) {
      const t      = i / op.trailCount;
      const bufIdx = (op.trailHead - op.trailCount + i + ORBIT_PROJ_TRAIL_CAP) % ORBIT_PROJ_TRAIL_CAP;
      const trailSize = ORBIT_PROJ_SIZE * t * 1.3;
      if (trailSize < 0.3) continue;
      const half = trailSize / 2;
      ctx.globalAlpha = t * 0.45;
      ctx.shadowBlur = isLowGraphicsMode ? 0 : trailSize * 6; ctx.shadowColor = projGlow; ctx.fillStyle = projGlow;
      const gh = half * 2.2;
      ctx.fillRect(Math.floor(op.trailX[bufIdx] - gh), Math.floor(op.trailY[bufIdx] - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
      ctx.shadowBlur = 0;
      ctx.globalAlpha = t * 0.7;
      ctx.fillStyle = projColor;
      ctx.fillRect(Math.floor(op.trailX[bufIdx] - half), Math.floor(op.trailY[bufIdx] - half), Math.ceil(trailSize), Math.ceil(trailSize));
    }
  }
  // Main projectile body
  const half = ORBIT_PROJ_SIZE / 2;
  ctx.globalAlpha = 1;
  if (!isLowGraphicsMode) {
    ctx.shadowBlur = ORBIT_PROJ_SIZE * 5; ctx.shadowColor = projGlow; ctx.fillStyle = projGlow;
    const gh = half * 2.2;
    ctx.fillRect(Math.floor(op.x - gh), Math.floor(op.y - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
    ctx.shadowBlur = 0;
  }
  ctx.fillStyle = projColor;
  ctx.fillRect(Math.floor(op.x - half), Math.floor(op.y - half), ORBIT_PROJ_SIZE, ORBIT_PROJ_SIZE);
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawBossProjectiles(ctx: CanvasRenderingContext2D, projectiles: BossProjectile[]): void {
  if (projectiles.length === 0) return;
  ctx.save();
  for (const p of projectiles) {
    const lifeRatio = p.lifeMs / p.maxLifeMs;
    const alpha = Math.min(1, lifeRatio * 3.0);
    const ph = p.size / 2;
    ctx.globalAlpha = alpha;
    if (!isLowGraphicsMode) {
      ctx.shadowBlur = p.size * 5; ctx.shadowColor = p.glowColor; ctx.fillStyle = p.glowColor;
      const gh = ph * 2.2;
      ctx.fillRect(Math.floor(p.x - gh), Math.floor(p.y - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.floor(p.x - ph), Math.floor(p.y - ph), p.size, p.size);
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}


// ── Emerald player missiles (heat-seeking, gorgeous comet trails) ──────────────

export function drawEmeraldPlayerMissiles(
  ctx: CanvasRenderingContext2D,
  missiles: EmeraldPlayerMissile[],
): void {
  if (missiles.length === 0) return;
  const now = performance.now();
  ctx.save();
  for (const m of missiles) {
    // Flickering alpha for fizzling missiles.
    const baseAlpha = m.isFizzling
      ? 0.5 + 0.5 * Math.abs(Math.sin(now * 0.015))
      : 1;

    // Comet trail — layered glow fading from bright tip to dark tail.
    // Glow is 25% smaller: shadowBlur and outer glow rect reduced by factor 0.75.
    if (!isLowGraphicsMode && m.trailCount >= 2) {
      for (let i = 0; i < m.trailCount; i++) {
        const t      = i / m.trailCount;
        const bufIdx = (m.trailHead - m.trailCount + i + EMERALD_MISSILE_TRAIL_CAP) % EMERALD_MISSILE_TRAIL_CAP;
        const trailSize = EMERALD_MISSILE_SIZE * t * 1.8;
        if (trailSize < 0.2) continue;
        const half = trailSize / 2;
        // Outer glow layer (glow radius reduced 25%).
        ctx.globalAlpha = t * 0.5 * baseAlpha;
        ctx.shadowBlur  = trailSize * 5.25; ctx.shadowColor = EMERALD_MISSILE_GLOW;
        ctx.fillStyle   = EMERALD_MISSILE_GLOW;
        const gh = half * 1.875;
        ctx.fillRect(Math.floor(m.trailX[bufIdx] - gh), Math.floor(m.trailY[bufIdx] - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
        ctx.shadowBlur = 0;
        // Inner core layer.
        ctx.globalAlpha = t * 0.75 * baseAlpha;
        ctx.fillStyle   = EMERALD_MISSILE_COLOR;
        ctx.fillRect(Math.floor(m.trailX[bufIdx] - half), Math.floor(m.trailY[bufIdx] - half), Math.ceil(trailSize), Math.ceil(trailSize));
      }
    }
    // Missile body — bright emerald core (glow 25% smaller).
    const half = EMERALD_MISSILE_SIZE / 2;
    ctx.globalAlpha = baseAlpha;
    if (!isLowGraphicsMode) {
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
): void {
  if (missiles.length === 0) return;
  const now = performance.now();
  ctx.save();
  for (const s of missiles) {
    const isDecelerating = s.lifetimeMs >= EMERALD_SUB_MISSILE_DECEL_START_MS;
    const baseAlpha = isDecelerating
      ? 0.4 + 0.6 * Math.abs(Math.sin(now * 0.018))
      : 1;

    // Short comet trail.
    if (!isLowGraphicsMode && s.trailCount >= 2) {
      for (let i = 0; i < s.trailCount; i++) {
        const t      = i / s.trailCount;
        const bufIdx = (s.trailHead - s.trailCount + i + EMERALD_SUB_MISSILE_TRAIL_CAP) % EMERALD_SUB_MISSILE_TRAIL_CAP;
        const trailSize = EMERALD_SUB_MISSILE_SIZE * t * 1.6;
        if (trailSize < 0.15) continue;
        const half = trailSize / 2;
        ctx.globalAlpha = t * 0.45 * baseAlpha;
        ctx.shadowBlur  = trailSize * 5; ctx.shadowColor = EMERALD_MISSILE_GLOW;
        ctx.fillStyle   = EMERALD_MISSILE_GLOW;
        const gh = half * 1.8;
        ctx.fillRect(Math.floor(s.trailX[bufIdx] - gh), Math.floor(s.trailY[bufIdx] - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
        ctx.shadowBlur = 0;
        ctx.globalAlpha = t * 0.65 * baseAlpha;
        ctx.fillStyle   = EMERALD_MISSILE_COLOR;
        ctx.fillRect(Math.floor(s.trailX[bufIdx] - half), Math.floor(s.trailY[bufIdx] - half), Math.ceil(trailSize), Math.ceil(trailSize));
      }
    }
    // Sub-missile body.
    const half = EMERALD_SUB_MISSILE_SIZE / 2;
    ctx.globalAlpha = baseAlpha;
    if (!isLowGraphicsMode) {
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
): void {
  if (particles.length === 0) return;
  ctx.save();
  for (const p of particles) {
    const alpha = Math.max(0, p.lifeMs / EMERALD_SWIRL_LIFE_MS);
    const half  = EMERALD_SWIRL_SIZE / 2;
    ctx.globalAlpha = alpha * 0.85;
    if (!isLowGraphicsMode) {
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
): void {
  if (mines.length === 0) return;
  const nowMs = Date.now();
  ctx.save();
  for (const mine of mines) {
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
    if (!isLowGraphicsMode) {
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

// ── Sapphire companion ship draw functions ────────────────────

export function drawSapphireShips(
  ctx: CanvasRenderingContext2D,
  ships: SapphireShip[],
): void {
  if (ships.length === 0) return;
  ctx.save();
  for (const ship of ships) {
    // Trail (skip in low-graphics mode)
    if (!isLowGraphicsMode && ship.trailCount >= 2) {
      for (let i = 0; i < ship.trailCount; i++) {
        const idx = (ship.trailHead - ship.trailCount + i + SAPPHIRE_SHIP_TRAIL_CAP) % SAPPHIRE_SHIP_TRAIL_CAP;
        const t   = i / ship.trailCount;
        const r   = SAPPHIRE_SHIP_SIZE * t * 0.6;
        if (r < 0.3) continue;
        ctx.globalAlpha = t * 0.4;
        ctx.fillStyle = SAPPHIRE_LASER_COLOR;
        ctx.fillRect(Math.floor(ship.trailX[idx] - r), Math.floor(ship.trailY[idx] - r), Math.ceil(r * 2), Math.ceil(r * 2));
      }
    }
    // Ship body — triangle rotated to face direction of travel
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
  for (const laser of lasers) {
    const alpha = laser.lifeMs / 700;
    // Trail (skip in low-graphics mode)
    if (!isLowGraphicsMode && laser.trailCount >= 2) {
      for (let i = 0; i < laser.trailCount; i++) {
        const idx = (laser.trailHead - laser.trailCount + i + SAPPHIRE_LASER_TRAIL_CAP) % SAPPHIRE_LASER_TRAIL_CAP;
        const t   = i / laser.trailCount;
        const r   = SAPPHIRE_LASER_SIZE * t * 0.8;
        if (r < 0.3) continue;
        ctx.globalAlpha = t * alpha * 0.5;
        ctx.fillStyle = SAPPHIRE_LASER_COLOR;
        ctx.fillRect(Math.floor(laser.trailX[idx] - r), Math.floor(laser.trailY[idx] - r), Math.ceil(r * 2), Math.ceil(r * 2));
      }
    }
    // Laser core
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

// ── Amethyst companion ship draw functions ────────────────────

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
  for (const laser of lasers) {
    const alpha = laser.lifeMs / 1500;
    // Trail (skip in low-graphics mode)
    if (!isLowGraphicsMode && laser.trailCount >= 2) {
      const oldestIdx = (laser.trailHead - laser.trailCount + AMETHYST_LASER_TRAIL_CAP) % AMETHYST_LASER_TRAIL_CAP;
      ctx.globalAlpha = alpha * 0.45;
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = AMETHYST_LASER_COLOR;
      ctx.shadowBlur = 10;
      ctx.shadowColor = AMETHYST_LASER_GLOW;
      ctx.beginPath();
      ctx.moveTo(laser.trailX[oldestIdx], laser.trailY[oldestIdx]);
      for (let i = 1; i < laser.trailCount; i++) {
        const idx = (oldestIdx + i) % AMETHYST_LASER_TRAIL_CAP;
        ctx.lineTo(laser.trailX[idx], laser.trailY[idx]);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      for (let i = 0; i < laser.trailCount; i++) {
        const idx = (laser.trailHead - laser.trailCount + i + AMETHYST_LASER_TRAIL_CAP) % AMETHYST_LASER_TRAIL_CAP;
        const t   = i / laser.trailCount;
        const r   = AMETHYST_LASER_SIZE * t * 1.6;
        if (r < 0.3) continue;
        ctx.globalAlpha = t * alpha * 0.8;
        ctx.fillStyle = AMETHYST_LASER_COLOR;
        ctx.fillRect(Math.floor(laser.trailX[idx] - r), Math.floor(laser.trailY[idx] - r), Math.ceil(r * 2), Math.ceil(r * 2));
      }
    }
    // Laser core
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

// ── Target reticle draw function ──────────────────────────────

/**
 * Draws a targeting reticle around the specified enemy position.
 * Used to show which enemy is currently being targeted by the player.
 */
export function drawTargetReticle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  nowMs: number,
): void {
  ctx.save();
  // Pulsing animation
  const pulse = 0.5 + 0.5 * Math.sin(nowMs / 200);
  const outerR = radius + 4 + pulse * 2;
  const innerR = radius + 2;
  ctx.globalAlpha = 0.7 + pulse * 0.3;
  ctx.strokeStyle = '#ffdd44';
  if (!isLowGraphicsMode) {
    ctx.shadowBlur = 6; ctx.shadowColor = '#ffee88';
  }
  ctx.lineWidth = 1.5;
  // Draw corner brackets
  const arcLen = Math.PI / 6;
  for (let i = 0; i < 4; i++) {
    const baseAngle = i * Math.PI / 2 - Math.PI / 4;
    ctx.beginPath();
    ctx.arc(x, y, outerR, baseAngle - arcLen / 2, baseAngle + arcLen / 2);
    ctx.stroke();
  }
  // Draw inner ring
  ctx.globalAlpha = 0.4 + pulse * 0.2;
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#ffcc33';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(x, y, innerR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  ctx.restore();
}
