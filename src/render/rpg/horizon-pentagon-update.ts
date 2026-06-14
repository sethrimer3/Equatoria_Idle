/**
 * horizon-pentagon-update.ts — Per-frame update for HorizonPentagonGroup entities.
 *
 * Responsibilities:
 *   - Patrol movement for the real body
 *   - Recompute shadow positions each frame
 *   - Attack scheduling (missile / laser / gatling) for real body and each shadow
 *   - Projectile physics + player-hit detection
 *   - Puff-particle animation
 *   - triggerHorizonPentagonSwap() — called by the damage function in rpg-damage.ts
 */

import type { HorizonPentagonGroup, HorizonMissile,
  HorizonBullet, HorizonLaserState, HorizonPuffParticle } from './horizon-pentagon-types';
import {
  PENTAGON_PATROL_SPEED, PENTAGON_PATROL_DAMPING,
  SWAP_CD_MS,
  MISSILE_CD_BASE_MS, MISSILE_CD_JITTER_MS, MISSILE_HP, MISSILE_ATK,
  MISSILE_SPEED, MISSILE_SEEK_STR, MISSILE_MAX_SPEED, MISSILE_LIFE_MS,
  MISSILE_TRAIL_CAP, MISSILE_EXPLODE_FLASH_MS, MISSILE_EXPLODE_RADIUS,
  LASER_CD_BASE_MS, LASER_CD_JITTER_MS, LASER_CHARGE_MS, LASER_FIRE_MS,
  LASER_HITBOX_PX, LASER_TRACK_SPEED_RAD,
  GATLING_CD_BASE_MS, GATLING_CD_JITTER_MS, GATLING_COUNT, GATLING_SPREAD_RAD,
  GATLING_ATK, GATLING_SPEED, GATLING_LIFE_MS,
  ATTACK_WEIGHT_MISSILE, ATTACK_WEIGHT_LASER, ATTACK_WEIGHT_GATLING,
  PUFF_COUNT, PUFF_SPEED_MAX, PUFF_LIFE_MS,
} from './horizon-pentagon-constants';
import { computeShadowPositions } from './horizon-mirror-system';
import { updateGalaxyGroup } from './true-galaxy-enemy';

// ── Minimal update context ────────────────────────────────────────────────────

export interface HorizonPentagonUpdateCtx {
  mote: { x: number; y: number };
  dim: { w: number; h: number };
  /** Deal standard (no-knockback) damage to the player. */
  dealDamageToPlayer(atk: number): void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _randomAttack(): 'missile' | 'laser' | 'gatling' {
  const total = ATTACK_WEIGHT_MISSILE + ATTACK_WEIGHT_LASER + ATTACK_WEIGHT_GATLING;
  const r = Math.random() * total;
  if (r < ATTACK_WEIGHT_MISSILE) return 'missile';
  if (r < ATTACK_WEIGHT_MISSILE + ATTACK_WEIGHT_LASER) return 'laser';
  return 'gatling';
}

function _fireMissile(
  fromX: number, fromY: number,
  group: HorizonPentagonGroup,
  moteX: number, moteY: number,
): void {
  const dx = moteX - fromX, dy = moteY - fromY;
  const trailX = new Float64Array(MISSILE_TRAIL_CAP);
  const trailY = new Float64Array(MISSILE_TRAIL_CAP);
  const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.12;
  const speed = MISSILE_SPEED * (0.9 + Math.random() * 0.22);
  const m: HorizonMissile = {
    x: fromX, y: fromY,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    hp: MISSILE_HP, maxHp: MISSILE_HP,
    atk: MISSILE_ATK,
    hasHitPlayer: false,
    lifeMs: MISSILE_LIFE_MS,
    explodeFlashMs: 0,
    trailX, trailY, trailHead: 0, trailCount: 0,
  };
  group.missiles.push(m);
}

function _fireGatling(
  fromX: number, fromY: number,
  group: HorizonPentagonGroup,
  moteX: number, moteY: number,
): void {
  const dx = moteX - fromX, dy = moteY - fromY;
  const baseAngle = Math.atan2(dy, dx);
  for (let i = 0; i < GATLING_COUNT; i++) {
    const spread = (i / (GATLING_COUNT - 1) - 0.5) * 2 * GATLING_SPREAD_RAD + (Math.random() - 0.5) * 0.1;
    const angle = baseAngle + spread;
    const speed = GATLING_SPEED * (0.84 + Math.random() * 0.34);
    const b: HorizonBullet = {
      x: fromX, y: fromY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      atk: GATLING_ATK,
      hasHitPlayer: false,
      lifeMs: GATLING_LIFE_MS,
      trailX: new Float32Array(20), trailY: new Float32Array(20),
      trailHead: 0, trailCount: 0,
    };
    group.bullets.push(b);
  }
}

function _startLaser(
  fromX: number, fromY: number,
  atk: number,
  moteX: number, moteY: number,
): HorizonLaserState {
  const dx = moteX - fromX, dy = moteY - fromY;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  return {
    originX: fromX, originY: fromY,
    dirX: dx / dist, dirY: dy / dist,
    phase: 'charging',
    timerMs: LASER_CHARGE_MS,
    atk,
  };
}

function _emitPuffsAt(group: HorizonPentagonGroup, px: number, py: number): void {
  for (let i = 0; i < PUFF_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.3 + Math.random() * PUFF_SPEED_MAX;
    const p: HorizonPuffParticle = {
      x: px, y: py,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      lifeMs: PUFF_LIFE_MS * (0.6 + Math.random() * 0.4),
      maxLifeMs: PUFF_LIFE_MS,
    };
    group.puffs.push(p);
  }
}

/** Recomputes all shadow positions from current real body position. */
function _updateShadowPositions(group: HorizonPentagonGroup): void {
  const reflected = computeShadowPositions(group.x, group.y, group.mirrorLineYs);
  for (let i = 0; i < group.shadows.length; i++) {
    const s = group.shadows[i]!;
    s.x = reflected[i]!.rx;
    s.y = reflected[i]!.ry;
    // Keep laser origin in sync
    if (s.activeLaser) {
      s.activeLaser.originX = s.x;
      s.activeLaser.originY = s.y;
    }
  }
}

// ── Swap — triggered by damage function ─────────────────────────────────────

/**
 * Swaps the real pentagon body into one of its shadow positions.
 * Called from damageHorizonPentagonReal in rpg-damage.ts.
 */
export function triggerHorizonPentagonSwap(group: HorizonPentagonGroup): void {
  if (group.swapCdMs > 0 || group.shadows.length === 0) return;

  // Puffs at all old positions
  _emitPuffsAt(group, group.x, group.y);
  for (const s of group.shadows) _emitPuffsAt(group, s.x, s.y);

  // Choose a random shadow to become the new real body
  const idx = Math.floor(Math.random() * group.shadows.length);
  const chosen = group.shadows[idx]!;
  group.x = chosen.x;
  group.y = chosen.y;
  group.vx = 0; group.vy = 0;

  // Cancel any active real laser
  group.activeLaser = null;

  // Recompute shadow positions around the new real location
  _updateShadowPositions(group);

  // Stagger shadow attack timers to avoid instant burst
  for (const s of group.shadows) {
    s.missileTimerMs = Math.max(s.missileTimerMs, 1200 + Math.random() * 1800);
    s.laserTimerMs   = Math.max(s.laserTimerMs,   2000 + Math.random() * 2000);
    s.gatlingTimerMs = Math.max(s.gatlingTimerMs, 800  + Math.random() * 1200);
  }

  group.swapCdMs = SWAP_CD_MS;
}

// ── Body attack helper ────────────────────────────────────────────────────────

function _tickBodyAttacks(
  bodyX: number, bodyY: number,
  bodyAtk: number,
  missileTimerRef: { v: number },
  laserTimerRef: { v: number },
  gatlingTimerRef: { v: number },
  laserRef: { v: HorizonLaserState | null },
  group: HorizonPentagonGroup,
  moteX: number, moteY: number,
  deltaMs: number,
): void {
  // Tick attack cooldowns
  missileTimerRef.v -= deltaMs;
  laserTimerRef.v   -= deltaMs;
  gatlingTimerRef.v -= deltaMs;

  // Choose random attack when any timer expires
  const anyReady = missileTimerRef.v <= 0 || laserTimerRef.v <= 0 || gatlingTimerRef.v <= 0;
  if (anyReady && laserRef.v === null) {
    const choice = _randomAttack();
    if (choice === 'missile' && missileTimerRef.v <= 0) {
      _fireMissile(bodyX, bodyY, group, moteX, moteY);
      missileTimerRef.v = MISSILE_CD_BASE_MS + Math.random() * MISSILE_CD_JITTER_MS;
    } else if (choice === 'laser' && laserTimerRef.v <= 0) {
      laserRef.v = _startLaser(bodyX, bodyY, bodyAtk, moteX, moteY);
      laserTimerRef.v = LASER_CD_BASE_MS + Math.random() * LASER_CD_JITTER_MS;
    } else if (choice === 'gatling' && gatlingTimerRef.v <= 0) {
      _fireGatling(bodyX, bodyY, group, moteX, moteY);
      gatlingTimerRef.v = GATLING_CD_BASE_MS + Math.random() * GATLING_CD_JITTER_MS;
    } else {
      // Reset whichever timer tripped (none fired due to ordering)
      if (missileTimerRef.v <= 0) missileTimerRef.v = MISSILE_CD_BASE_MS + Math.random() * MISSILE_CD_JITTER_MS;
      if (laserTimerRef.v <= 0)   laserTimerRef.v   = LASER_CD_BASE_MS   + Math.random() * LASER_CD_JITTER_MS;
      if (gatlingTimerRef.v <= 0) gatlingTimerRef.v = GATLING_CD_BASE_MS + Math.random() * GATLING_CD_JITTER_MS;
    }
  }
}

// ── Laser update ──────────────────────────────────────────────────────────────

function _updateLaser(
  laser: HorizonLaserState,
  moteX: number, moteY: number,
  ctx: HorizonPentagonUpdateCtx,
  deltaMs: number,
): boolean {
  // Returns false when the laser is done (should be set to null by caller).
  laser.timerMs -= deltaMs;

  if (laser.phase === 'charging') {
    // Slowly rotate toward the player
    const tdx = moteX - laser.originX, tdy = moteY - laser.originY;
    const tdist = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
    const targetAngle = Math.atan2(tdy / tdist, tdx / tdist);
    const curAngle    = Math.atan2(laser.dirY, laser.dirX);
    let   delta       = targetAngle - curAngle;
    // Wrap to [-π, π]
    while (delta > Math.PI)  delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const maxRot = LASER_TRACK_SPEED_RAD * deltaMs;
    const rot    = Math.min(Math.abs(delta), maxRot) * Math.sign(delta);
    const newAngle = curAngle + rot;
    laser.dirX = Math.cos(newAngle);
    laser.dirY = Math.sin(newAngle);

    if (laser.timerMs <= 0) {
      // Transition to firing (direction locks mostly)
      laser.phase   = 'firing';
      laser.timerMs = LASER_FIRE_MS;
    }
    return true;
  }

  if (laser.phase === 'firing') {
    // Slightly track during fire
    const tdx = moteX - laser.originX, tdy = moteY - laser.originY;
    const tdist = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
    const targetAngle = Math.atan2(tdy / tdist, tdx / tdist);
    const curAngle    = Math.atan2(laser.dirY, laser.dirX);
    let   delta       = targetAngle - curAngle;
    while (delta > Math.PI)  delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const rot = Math.min(Math.abs(delta), LASER_TRACK_SPEED_RAD * 0.3 * deltaMs) * Math.sign(delta);
    const newAngle = curAngle + rot;
    laser.dirX = Math.cos(newAngle);
    laser.dirY = Math.sin(newAngle);

    // Check player hit (perpendicular distance from mote to beam line)
    const ox = moteX - laser.originX, oy = moteY - laser.originY;
    // Project onto beam direction
    const proj = ox * laser.dirX + oy * laser.dirY;
    if (proj > 0) {
      const perpDist = Math.abs(-ox * laser.dirY + oy * laser.dirX);
      if (perpDist <= LASER_HITBOX_PX) {
        ctx.dealDamageToPlayer(laser.atk * (deltaMs / 1000));
      }
    }

    return laser.timerMs > 0;
  }

  return false;
}

// ── Missile update ────────────────────────────────────────────────────────────

function _updateMissiles(
  group: HorizonPentagonGroup,
  moteX: number, moteY: number,
  dimW: number, dimH: number,
  ctx: HorizonPentagonUpdateCtx,
  deltaMs: number,
): void {
  for (let i = group.missiles.length - 1; i >= 0; i--) {
    const m = group.missiles[i]!;

    // Flash phase (pre-explosion)
    if (m.explodeFlashMs > 0) {
      m.explodeFlashMs -= deltaMs;
      if (m.explodeFlashMs <= 0) {
        // Explode: deal damage if player is in radius
        const dx = moteX - m.x, dy = moteY - m.y;
        if (dx * dx + dy * dy <= MISSILE_EXPLODE_RADIUS * MISSILE_EXPLODE_RADIUS) {
          ctx.dealDamageToPlayer(m.atk);
        }
        group.missiles.splice(i, 1);
        continue;
      }
      continue; // don't move during flash
    }

    // Life tick
    m.lifeMs -= deltaMs;
    if (m.lifeMs <= 0 || m.hp <= 0) {
      // Destroyed by player or expired — trigger explosion flash
      m.explodeFlashMs = MISSILE_EXPLODE_FLASH_MS;
      m.vx = 0; m.vy = 0;
      continue;
    }

    // Homing toward player
    const dx = moteX - m.x, dy = moteY - m.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    m.vx += (dx / dist) * MISSILE_SEEK_STR * deltaMs * 0.06;
    m.vy += (dy / dist) * MISSILE_SEEK_STR * deltaMs * 0.06;
    const spd = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
    if (spd > MISSILE_MAX_SPEED) {
      const inv = MISSILE_MAX_SPEED / spd;
      m.vx *= inv; m.vy *= inv;
    }
    m.x += m.vx * (deltaMs * 0.06);
    m.y += m.vy * (deltaMs * 0.06);

    // Trail
    const tIdx = m.trailHead;
    m.trailX[tIdx] = m.x; m.trailY[tIdx] = m.y;
    m.trailHead = (m.trailHead + 1) % MISSILE_TRAIL_CAP;
    if (m.trailCount < MISSILE_TRAIL_CAP) m.trailCount++;

    // Out of bounds
    if (m.x < -dimW * 3 || m.x > dimW * 4 || m.y < -dimH * 3 || m.y > dimH * 4) {
      group.missiles.splice(i, 1);
      continue;
    }

    // Player collision
    if (!m.hasHitPlayer) {
      const ddx = moteX - m.x, ddy = moteY - m.y;
      if (ddx * ddx + ddy * ddy <= (MISSILE_EXPLODE_RADIUS * 0.6) * (MISSILE_EXPLODE_RADIUS * 0.6)) {
        m.hasHitPlayer = true;
        m.explodeFlashMs = MISSILE_EXPLODE_FLASH_MS;
        m.vx = 0; m.vy = 0;
      }
    }
  }
}

// ── Bullet update ─────────────────────────────────────────────────────────────

function _updateBullets(
  group: HorizonPentagonGroup,
  moteX: number, moteY: number,
  dimW: number, dimH: number,
  ctx: HorizonPentagonUpdateCtx,
  deltaMs: number,
): void {
  const fr = deltaMs * 0.06;
  for (let i = group.bullets.length - 1; i >= 0; i--) {
    const b = group.bullets[i]!;
    b.lifeMs -= deltaMs;
    b.trailX[b.trailHead] = b.x; b.trailY[b.trailHead] = b.y;
    b.trailHead = (b.trailHead + 1) % b.trailX.length;
    b.trailCount = Math.min(b.trailX.length, b.trailCount + 1);
    if (b.lifeMs <= 0) { group.bullets.splice(i, 1); continue; }
    const seekDx = moteX - b.x, seekDy = moteY - b.y;
    const seekDist = Math.sqrt(seekDx * seekDx + seekDy * seekDy) || 1;
    b.vx += (seekDx / seekDist) * 0.00042 * deltaMs;
    b.vy += (seekDy / seekDist) * 0.00042 * deltaMs;
    b.x += b.vx * fr;
    b.y += b.vy * fr;
    if (b.x < -dimW * 3 || b.x > dimW * 4 || b.y < -dimH * 3 || b.y > dimH * 4) {
      group.bullets.splice(i, 1); continue;
    }
    if (!b.hasHitPlayer) {
      const dx = moteX - b.x, dy = moteY - b.y;
      if (dx * dx + dy * dy <= 8 * 8) {
        b.hasHitPlayer = true;
        ctx.dealDamageToPlayer(b.atk);
        group.bullets.splice(i, 1);
      }
    }
  }
}

// ── Puff update ───────────────────────────────────────────────────────────────

function _updatePuffs(group: HorizonPentagonGroup, deltaMs: number): void {
  const fr = deltaMs * 0.06;
  for (let i = group.puffs.length - 1; i >= 0; i--) {
    const p = group.puffs[i]!;
    p.lifeMs -= deltaMs;
    if (p.lifeMs <= 0) { group.puffs.splice(i, 1); continue; }
    p.x += p.vx * fr;
    p.y += p.vy * fr;
    p.vx *= 0.94;
    p.vy *= 0.94;
  }
}

// ── Main update ───────────────────────────────────────────────────────────────

export function updateHorizonPentagonGroups(
  groups: HorizonPentagonGroup[],
  ctx: HorizonPentagonUpdateCtx,
  deltaMs: number,
): void {
  const { mote, dim } = ctx;
  const moteX = mote.x, moteY = mote.y;
  const fr = deltaMs * 0.06;

  for (const g of groups) {
    if (updateGalaxyGroup(g, moteX, moteY, deltaMs, ctx.dealDamageToPlayer)) continue;
    g.pulseMs += deltaMs;

    // ── Swap cooldown ──────────────────────────────────────────────
    if (g.swapCdMs > 0) g.swapCdMs = Math.max(0, g.swapCdMs - deltaMs);

    // ── Real body patrol ──────────────────────────────────────────
    // Simple random-walk toward/away from player with slow wander
    if (g.missileTimerMs > MISSILE_CD_BASE_MS * 0.8) {
      // Normal patrol wander
      const wanderT = Math.sin(g.pulseMs * 0.00065) * 0.5 + Math.sin(g.pulseMs * 0.00091) * 0.5;
      const angle = wanderT * Math.PI * 2;
      const kp = PENTAGON_PATROL_SPEED * 0.018;
      g.vx += Math.cos(angle) * kp;
      g.vy += Math.sin(angle) * kp;
    }
    g.vx *= PENTAGON_PATROL_DAMPING;
    g.vy *= PENTAGON_PATROL_DAMPING;
    g.x  += g.vx * fr;
    g.y  += g.vy * fr;

    // Keep real body on screen (soft bounce off edges)
    const pad = 20;
    if (g.x < pad)        { g.x = pad;         g.vx = Math.abs(g.vx) * 0.6; }
    if (g.x > dim.w - pad){ g.x = dim.w - pad;  g.vx = -Math.abs(g.vx) * 0.6; }
    if (g.y < pad)        { g.y = pad;          g.vy = Math.abs(g.vy) * 0.6; }
    if (g.y > dim.h - pad){ g.y = dim.h - pad;  g.vy = -Math.abs(g.vy) * 0.6; }

    // ── Update shadow positions ───────────────────────────────────
    _updateShadowPositions(g);

    // ── Real body attacks ─────────────────────────────────────────
    {
      const mr = { v: g.missileTimerMs };
      const lr = { v: g.laserTimerMs };
      const gr = { v: g.gatlingTimerMs };
      const al = { v: g.activeLaser };
      _tickBodyAttacks(g.x, g.y, g.atk, mr, lr, gr, al, g, moteX, moteY, deltaMs);
      g.missileTimerMs = mr.v;
      g.laserTimerMs   = lr.v;
      g.gatlingTimerMs = gr.v;
      g.activeLaser    = al.v;
    }

    // Update real laser
    if (g.activeLaser !== null) {
      const alive = _updateLaser(g.activeLaser, moteX, moteY, ctx, deltaMs);
      if (!alive) g.activeLaser = null;
    }

    // ── Shadow body attacks ────────────────────────────────────────
    for (const s of g.shadows) {
      const mr = { v: s.missileTimerMs };
      const lr = { v: s.laserTimerMs };
      const gr = { v: s.gatlingTimerMs };
      const al = { v: s.activeLaser };
      _tickBodyAttacks(s.x, s.y, g.atk, mr, lr, gr, al, g, moteX, moteY, deltaMs);
      s.missileTimerMs = mr.v;
      s.laserTimerMs   = lr.v;
      s.gatlingTimerMs = gr.v;
      s.activeLaser    = al.v;

      if (s.activeLaser !== null) {
        // Keep origin in sync with shadow position
        s.activeLaser.originX = s.x;
        s.activeLaser.originY = s.y;
        const alive = _updateLaser(s.activeLaser, moteX, moteY, ctx, deltaMs);
        if (!alive) s.activeLaser = null;
      }
    }

    // ── Projectile updates ────────────────────────────────────────
    _updateMissiles(g, moteX, moteY, dim.w, dim.h, ctx, deltaMs);
    _updateBullets(g, moteX, moteY, dim.w, dim.h, ctx, deltaMs);

    // ── Puff particles ─────────────────────────────────────────────
    _updatePuffs(g, deltaMs);
  }
}
