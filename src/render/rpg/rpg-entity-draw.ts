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
  WeaponOrbitParticle, OrbitProjectile,
  RpgMote, RpgPhase,
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
  WEAPON_ORBIT_TRAIL_CAP, ORBIT_PROJ_TRAIL_CAP, ORBIT_PROJ_SIZE,
  EMERALD_MISSILE_SIZE, EMERALD_MISSILE_COLOR, EMERALD_MISSILE_GLOW, EMERALD_MISSILE_TRAIL_CAP,
  EMERALD_SUB_MISSILE_SIZE, EMERALD_SUB_MISSILE_TRAIL_CAP, EMERALD_SUB_MISSILE_DECEL_START_MS,
  EMERALD_SWIRL_LIFE_MS, EMERALD_SWIRL_SIZE,
  SUNSTONE_MINE_FUSE_MS, SUNSTONE_MINE_SIZE, SUNSTONE_MINE_COLOR, SUNSTONE_MINE_GLOW,
  SUNSTONE_MINE_DANGER_COLOR,
  RPG_TRAIL_CAPACITY, RPG_MOTE_SIZE, RPG_MOTE_COLOR, RPG_MOTE_GLOW,
  GLOW_PULSE_SPEED, IFRAME_FLICKER_INTERVAL_MS,
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

// ── Player mote draw ──────────────────────────────────────────────────────────

/**
 * Draws the player mote: comet trail (shrinks when stationary) and the pulsing
 * glow + body square.  During iframes the glow/body tints blue and flickers.
 *
 * @param mote                   Player position and trail ring-buffer.
 * @param glowMovementIntensity  0–1 motion scalar from PlayerMovementState.
 * @param rpgPhase               Current game phase ('alive' | 'dying' | 'restarting').
 * @param deathAlpha             Alpha multiplier during the death animation (1 when alive).
 * @param glowTimeS              Accumulated seconds since game start, used for the pulse sine.
 * @param playerIFramesMs        Remaining invincibility-frame milliseconds; 0 = not in iframes.
 */
export function drawPlayerMote(
  ctx: CanvasRenderingContext2D,
  mote: RpgMote,
  glowMovementIntensity: number,
  rpgPhase: RpgPhase,
  deathAlpha: number,
  glowTimeS: number,
  playerIFramesMs: number,
): void {
  // Player comet trail — shrinks from tail to tip as movement intensity drops,
  // so the trail vanishes by retreating toward the player rather than fading in place.
  if (!isLowGraphicsMode && glowMovementIntensity > 0.02 && mote.trailCount >= 2) {
    const trailLen = Math.max(0, Math.floor(mote.trailCount * glowMovementIntensity));
    for (let i = 0; i < trailLen; i++) {
      const t      = i / trailLen;
      const bufIdx = (mote.trailHead - trailLen + i + RPG_TRAIL_CAPACITY) % RPG_TRAIL_CAPACITY;
      const trailSize = RPG_MOTE_SIZE * t * 1.3;
      if (trailSize < 0.3) continue;
      const half = trailSize / 2;
      ctx.globalAlpha = t * 0.45;
      ctx.shadowBlur  = trailSize * 6; ctx.shadowColor = RPG_MOTE_GLOW; ctx.fillStyle = RPG_MOTE_GLOW;
      const gh = half * 2.2;
      ctx.fillRect(Math.floor(mote.trailX[bufIdx] - gh), Math.floor(mote.trailY[bufIdx] - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
      ctx.shadowBlur = 0;
      ctx.globalAlpha = t * 0.7;
      ctx.fillStyle   = RPG_MOTE_COLOR;
      ctx.fillRect(Math.floor(mote.trailX[bufIdx] - half), Math.floor(mote.trailY[bufIdx] - half), Math.ceil(trailSize), Math.ceil(trailSize));
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }

  const playerVisible = rpgPhase === 'alive' || rpgPhase === 'dying';
  if (!playerVisible) return;

  const pa = rpgPhase === 'dying' ? deathAlpha : 1;
  const pulseT   = (Math.sin(glowTimeS * GLOW_PULSE_SPEED) + 1) * 0.5;
  // Dampen the stationary glow while the player is moving — the comet
  // trail already gives strong visual feedback during motion.
  const glowDampeningFactor = 1 - glowMovementIntensity * 0.65;
  // During iframes: tint the glow blue and flicker the sprite at ~8 Hz.
  const inIFrames = playerIFramesMs > 0;
  const iFrameFlicker = inIFrames && (Math.floor(playerIFramesMs / IFRAME_FLICKER_INTERVAL_MS) % 2 === 0);
  const moteGlowColor  = inIFrames ? '#74c0fc' : RPG_MOTE_GLOW;
  const moteBodyColor  = inIFrames ? '#b0d4ff' : RPG_MOTE_COLOR;
  const glowSize = RPG_MOTE_SIZE * (2.2 + pulseT * 1.4 * glowDampeningFactor);
  const glowHalf = glowSize / 2;
  if (!isLowGraphicsMode) {
    ctx.globalAlpha = (0.18 + pulseT * 0.22) * glowDampeningFactor * pa;
    ctx.shadowBlur  = glowSize * 3; ctx.shadowColor = moteGlowColor; ctx.fillStyle = moteGlowColor;
    ctx.fillRect(Math.floor(mote.x - glowHalf), Math.floor(mote.y - glowHalf), Math.ceil(glowSize), Math.ceil(glowSize));
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
  if (!iFrameFlicker) {
    ctx.globalAlpha = pa;
    if (!isLowGraphicsMode) {
      ctx.shadowBlur  = RPG_MOTE_SIZE * 5; ctx.shadowColor = moteGlowColor;
    }
    ctx.fillStyle = moteBodyColor;
    const mh = RPG_MOTE_SIZE / 2;
    ctx.fillRect(Math.floor(mote.x - mh), Math.floor(mote.y - mh), RPG_MOTE_SIZE, RPG_MOTE_SIZE);
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
}
