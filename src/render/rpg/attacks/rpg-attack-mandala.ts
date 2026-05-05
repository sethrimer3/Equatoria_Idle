/**
 * rpg-attack-mandala.ts — Radial wave projectile burst attack simulation.
 *
 * Fires evenly-spaced projectiles in radial waves from the boss origin.
 * Safe gaps are left near the player direction so the attack is dodge-able.
 * Each wave rotates by angularDrift from the previous one.
 */

import type { MandalaAttackInstance, MandalaProjectile } from '../rpg-boss-attack-types';
import { createTrailRing, trailPush, createPrng } from '../rpg-boss-attack-types';

const TRAIL_CAP    = 32;
const TRAIL_STRIDE = 10; // ms between trail points

const MAX_PROJECTILES = 48;

// ── Spawn ─────────────────────────────────────────────────────────────────────

export function spawnMandalaAttack(
  originX: number,
  originY: number,
  params: Record<string, number | boolean | string>,
  difficulty: number,
): MandalaAttackInstance {
  const radialCount  = Math.min(16, (params.radialCount  as number | undefined) ?? 8);
  const safeGaps     = (params.safeGaps     as number | undefined) ?? 2;
  const waveInterval = (params.waveInterval as number | undefined) ?? 2000;
  const speed        = (params.speed        as number | undefined) ?? 75;
  const durationMs   = 14000 + difficulty * 400;

  const seed = Math.floor(Math.random() * 0xFFFFFF);
  const rng  = createPrng(seed);

  return {
    kind: 'mandala',
    ageMs: 0,
    durationMs,
    originX,
    originY,
    projectiles: [],
    waveTimerMs: waveInterval * 0.3,
    waveInterval,
    radialCount,
    waveAngle: rng() * Math.PI * 2,
    angularDrift: 0.18 + difficulty * 0.02,
    trailPersistenceMs: 800,
    projectileSpeed: speed,
    safeGapCount: Math.max(1, safeGaps),
    safeGapWidth: 0.32,
    difficulty,
    rng,
  };
}

// ── Update ────────────────────────────────────────────────────────────────────

export function updateMandalaAttack(
  atk: MandalaAttackInstance,
  playerX: number,
  playerY: number,
  dim: { w: number; h: number },
  deltaMs: number,
): void {
  atk.ageMs += deltaMs;
  atk.waveTimerMs -= deltaMs;

  if (atk.waveTimerMs <= 0) {
    _fireWave(atk, playerX, playerY);
    atk.waveTimerMs = atk.waveInterval;
  }

  const dtSec = deltaMs / 1000;
  const margin = 30;

  for (let i = atk.projectiles.length - 1; i >= 0; i--) {
    const p = atk.projectiles[i];
    p.ageMs += deltaMs;

    // Move
    p.x += p.vx * dtSec;
    p.y += p.vy * dtSec;

    // Slight angular drift rotation of velocity
    const drift = atk.angularDrift * 0.08 * dtSec;
    const cos = Math.cos(drift), sin = Math.sin(drift);
    const nvx = p.vx * cos - p.vy * sin;
    const nvy = p.vx * sin + p.vy * cos;
    p.vx = nvx; p.vy = nvy;

    // Trail
    const strideCount = Math.floor(p.ageMs / TRAIL_STRIDE);
    const prevCount   = Math.floor((p.ageMs - deltaMs) / TRAIL_STRIDE);
    if (strideCount > prevCount) trailPush(p.trail, p.x, p.y);

    // Remove out-of-bounds
    if (p.x < -margin || p.x > dim.w + margin ||
        p.y < -margin || p.y > dim.h + margin) {
      atk.projectiles.splice(i, 1);
    }
  }
}

function _fireWave(
  atk: MandalaAttackInstance,
  playerX: number,
  playerY: number,
): void {
  if (atk.projectiles.length >= MAX_PROJECTILES) return;

  const angleToPlayer = Math.atan2(playerY - atk.originY, playerX - atk.originX);
  const speedPxSec    = atk.projectileSpeed;
  const step          = (Math.PI * 2) / atk.radialCount;

  for (let i = 0; i < atk.radialCount; i++) {
    if (atk.projectiles.length >= MAX_PROJECTILES) break;
    const angle = atk.waveAngle + i * step;

    // Check safe gaps around player direction
    let inGap = false;
    for (let g = 0; g < atk.safeGapCount; g++) {
      const gapAngle = angleToPlayer + (g - (atk.safeGapCount - 1) / 2) * (atk.safeGapWidth * 1.8);
      let diff = Math.abs(((angle - gapAngle) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      if (diff < atk.safeGapWidth) { inGap = true; break; }
    }
    if (inGap) continue;

    const hue   = Math.round(atk.waveAngle * 57.3 + i * 15) % 360;
    const color = `hsl(${hue}, 90%, 65%)`;
    const glow  = `hsl(${hue}, 100%, 80%)`;

    const proj: MandalaProjectile = {
      x: atk.originX,
      y: atk.originY,
      vx: Math.cos(angle) * speedPxSec,
      vy: Math.sin(angle) * speedPxSec,
      trail: createTrailRing(TRAIL_CAP),
      color,
      glowColor: glow,
      ageMs: 0,
      hazardMode: 'headOnly',
    };
    atk.projectiles.push(proj);
  }

  atk.waveAngle += atk.angularDrift;
}

// ── Hazard circles ────────────────────────────────────────────────────────────

export function getMandalaHazardCircles(
  atk: MandalaAttackInstance,
): Array<{ x: number; y: number; r: number; atk: number }> {
  const result: Array<{ x: number; y: number; r: number; atk: number }> = [];
  for (const p of atk.projectiles) {
    result.push({ x: p.x, y: p.y, r: 4, atk: 9 });
  }
  return result;
}
