/**
 * rpg-attack-missile.ts — Guided missile attack with ring explosion simulation.
 *
 * State machine per missile: flying → exploding → lingering → fading.
 * Missiles home on the player; once the ring radius reaches its maximum the
 * missile enters the lingering hazard phase before fully disappearing.
 */

import type { BossAttackMissile, MissileAttackInstance, MissileState } from '../rpg-boss-attack-types';
import { createTrailRing, trailPush, createPrng } from '../rpg-boss-attack-types';

const TRAIL_CAP    = 56;
const TRAIL_STRIDE = 9; // ms between trail points

// ── Spawn ─────────────────────────────────────────────────────────────────────

export function spawnMissileAttack(
  bossX: number,
  bossY: number,
  params: Record<string, number | boolean | string>,
  difficulty: number,
): MissileAttackInstance {
  const count      = Math.min(8, (params.count      as number | undefined) ?? 2);
  const speed      = (params.speed      as number | undefined) ?? 80;
  const ringRadius = (params.ringRadius as number | undefined) ?? 18;
  const durationMs = 12000 + difficulty * 500;

  const seed = Math.floor(Math.random() * 0xFFFFFF);
  const rng  = createPrng(seed);

  const hue    = Math.round(rng() * 40 + 200);
  const color  = `hsl(${hue}, 90%, 70%)`;
  const glow   = `hsl(${hue}, 100%, 85%)`;

  const missiles: BossAttackMissile[] = [];
  for (let i = 0; i < count; i++) {
    const spread = (i - (count - 1) / 2) * 18;
    const startX = bossX + spread;
    const startY = bossY + 4;
    missiles.push({
      x: startX,
      y: startY,
      vx: 0,
      vy: 0,
      angle: Math.PI / 2,
      speed,
      state: 'flying' as MissileState,
      stateTimerMs: 0,
      explodeRingRadius: 0,
      explodeRingMax: ringRadius,
      trail: createTrailRing(TRAIL_CAP),
      color,
      glowColor: glow,
      ageMs: i * 600, // staggered launch delay handled via ageMs offset
      hasFired: i === 0, // first missile launches immediately
    });
  }

  return {
    kind: 'missileRing',
    ageMs: 0,
    durationMs,
    missiles,
    launchIntervalMs: (params.launchInterval as number | undefined) ?? 800,
    launchTimerMs: (params.launchInterval as number | undefined) ?? 800,
    nextLaunchIndex: 1,
    difficulty,
    rng,
  };
}

// ── Update ────────────────────────────────────────────────────────────────────

export function updateMissileAttack(
  atk: MissileAttackInstance,
  playerX: number,
  playerY: number,
  dim: { w: number; h: number },
  deltaMs: number,
): void {
  atk.ageMs += deltaMs;

  // Staggered launches
  if (atk.nextLaunchIndex < atk.missiles.length) {
    atk.launchTimerMs -= deltaMs;
    if (atk.launchTimerMs <= 0) {
      atk.missiles[atk.nextLaunchIndex].hasFired = true;
      atk.nextLaunchIndex++;
      atk.launchTimerMs = atk.launchIntervalMs;
    }
  }

  const dtSec  = deltaMs / 1000;
  const margin = 20;

  for (const m of atk.missiles) {
    if (!m.hasFired) continue;
    m.ageMs += deltaMs;
    m.stateTimerMs += deltaMs;

    if (m.state === 'flying') {
      _guideMissile(m, playerX, playerY, dtSec);

      m.x += m.vx * dtSec;
      m.y += m.vy * dtSec;

      // Trail
      const strideNow  = Math.floor(m.ageMs / TRAIL_STRIDE);
      const stridePrev = Math.floor((m.ageMs - deltaMs) / TRAIL_STRIDE);
      if (strideNow > stridePrev) trailPush(m.trail, m.x, m.y);

      // Detonate when hitting arena edge
      const hitEdge = m.x < margin || m.x > dim.w - margin ||
                      m.y < margin || m.y > dim.h - margin;
      const hitPlayer = Math.hypot(playerX - m.x, playerY - m.y) < 6;
      if (hitEdge || hitPlayer) {
        m.state = 'exploding';
        m.stateTimerMs = 0;
        m.explodeRingRadius = 0;
      }
    } else if (m.state === 'exploding') {
      const expandSpeed = m.explodeRingMax / 0.35;
      m.explodeRingRadius += expandSpeed * dtSec;
      if (m.explodeRingRadius >= m.explodeRingMax) {
        m.explodeRingRadius = m.explodeRingMax;
        m.state = 'lingering';
        m.stateTimerMs = 0;
      }
    } else if (m.state === 'lingering') {
      if (m.stateTimerMs >= 600) {
        m.state = 'fading';
        m.stateTimerMs = 0;
      }
    }
    // 'fading' state is just draw-side — no further physics
  }
}

function _guideMissile(
  m: BossAttackMissile,
  playerX: number,
  playerY: number,
  dtSec: number,
): void {
  const turnRate  = 2.0;
  const targetAng = Math.atan2(playerY - m.y, playerX - m.x);
  let   diff      = targetAng - m.angle;
  diff = ((diff + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  m.angle += Math.sign(diff) * Math.min(Math.abs(diff), turnRate * dtSec);
  m.vx = Math.cos(m.angle) * m.speed;
  m.vy = Math.sin(m.angle) * m.speed;
}

// ── Hazard circles ────────────────────────────────────────────────────────────

export function getMissileHazardCircles(
  atk: MissileAttackInstance,
): Array<{ x: number; y: number; r: number; damage: number }> {
  const result: Array<{ x: number; y: number; r: number; damage: number }> = [];
  for (const m of atk.missiles) {
    if (!m.hasFired) continue;
    if (m.state === 'flying') {
      result.push({ x: m.x, y: m.y, r: 5, damage: 11 });
    } else if (m.state === 'exploding' || m.state === 'lingering') {
      // Ring-edge collision — check if player is on the ring
      result.push({ x: m.x, y: m.y, r: m.explodeRingRadius + 4, damage: 14 });
    }
  }
  return result;
}
