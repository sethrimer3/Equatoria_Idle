/**
 * rpg-player-draw.ts — Player mote, orbit-projectile, weapon-orbit particle,
 * and target-reticle draw functions.
 *
 * Extracted from rpg-entity-draw.ts to keep that file focused on weapon
 * projectile rendering (sand, poison, laser beam, emerald missiles, sunstone
 * mines, boss projectiles).
 *
 * Each function takes explicit parameters instead of capturing them from a
 * closure, consistent with the rest of the draw-module family.
 */

import type {
  WeaponOrbitParticle, OrbitProjectile,
  RpgMote, RpgPhase, AfterimageSnapshot,
} from './rpg-types';
import {
  WEAPON_ORBIT_TRAIL_CAP, ORBIT_PROJ_TRAIL_CAP, ORBIT_PROJ_SIZE,
  RPG_TRAIL_CAPACITY, RPG_MOTE_SIZE, RPG_MOTE_COLOR, RPG_MOTE_GLOW,
  GLOW_PULSE_SPEED, IFRAME_FLICKER_INTERVAL_MS,
} from './rpg-constants';

// ── Low-graphics mode flag ─────────────────────────────────────────────────────
let isLowGraphicsMode = false;

/** Sets low-graphics mode for player draw functions (skips glow & trails). */
export function setLowGraphicsMode(enabled: boolean): void {
  isLowGraphicsMode = enabled;
}

// ── Weapon orbit particle ──────────────────────────────────────────────────────

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
  // Draw main particle at 25% opacity
  const half = p.size / 2;
  ctx.globalAlpha = 0.25;
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

// ── Orbit projectile ───────────────────────────────────────────────────────────

export function drawOrbitProjectile(ctx: CanvasRenderingContext2D, op: OrbitProjectile | null): void {
  if (!op) return;
  if (op.reformMs > 0) return;
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

// ── Target reticle ─────────────────────────────────────────────────────────────

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

// ── Afterimage snapshots ──────────────────────────────────────────────────────

/**
 * Draws translucent player-silhouette afterimages spawned on dash.
 * Called before drawPlayerMote so images appear behind the player.
 */
export function drawAfterimages(ctx: CanvasRenderingContext2D, afterimages: AfterimageSnapshot[]): void {
  if (isLowGraphicsMode || afterimages.length === 0) return;
  const half = RPG_MOTE_SIZE / 2;
  for (const img of afterimages) {
    ctx.save();
    ctx.globalAlpha = img.alpha;
    ctx.shadowBlur = RPG_MOTE_SIZE * 3;
    ctx.shadowColor = RPG_MOTE_GLOW;
    ctx.fillStyle = RPG_MOTE_COLOR;
    ctx.fillRect(Math.floor(img.x - half), Math.floor(img.y - half), RPG_MOTE_SIZE, RPG_MOTE_SIZE);
    ctx.restore();
  }
}

// ── Player mote ────────────────────────────────────────────────────────────────

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
      ctx.globalAlpha = t * 0.15;
      ctx.shadowBlur  = trailSize * 6; ctx.shadowColor = RPG_MOTE_GLOW; ctx.fillStyle = RPG_MOTE_GLOW;
      const gh = half * 2.2;
      ctx.fillRect(Math.floor(mote.trailX[bufIdx] - gh), Math.floor(mote.trailY[bufIdx] - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
      ctx.shadowBlur = 0;
      ctx.globalAlpha = t * 0.30;
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
