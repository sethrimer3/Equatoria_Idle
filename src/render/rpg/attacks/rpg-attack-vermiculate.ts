/**
 * rpg-attack-vermiculate.ts — Sinuous worm / vermiculate entity simulation.
 *
 * Each worm steers using deterministic sin-based angular noise combined with
 * a mild bias toward the player. Worms bounce off arena boundaries.
 * Trail history is kept as a Float64Array ring buffer.
 */

import type { VermiculateAttackInstance, WormHead } from '../rpg-boss-attack-types';
import { createTrailRing, trailPush, createPrng } from '../rpg-boss-attack-types';

const TRAIL_CAP    = 80;
const TRAIL_STRIDE = 6; // ms between trail pushes

// ── Spawn ─────────────────────────────────────────────────────────────────────

export function spawnVermiculateAttack(
  bossX: number,
  bossY: number,
  _dim: { w: number; h: number },
  params: Record<string, number | boolean | string>,
  difficulty: number,
): VermiculateAttackInstance {
  const wormCount  = Math.min(6, (params.wormCount  as number | undefined) ?? 2);
  const speed      = (params.speed      as number | undefined) ?? 65;
  const maxTurn    = (params.maxTurn    as number | undefined) ?? 2.5;
  const durationMs = 14000 + difficulty * 600;

  const seed = Math.floor(Math.random() * 0xFFFFFF);
  const rng  = createPrng(seed);

  const worms: WormHead[] = [];
  for (let i = 0; i < wormCount; i++) {
    const angle  = (i / wormCount) * Math.PI * 2 + rng() * 0.5;
    const startR = 25 + rng() * 20;
    const hue    = Math.round(60 + i * 55) % 360;
    const color  = `hsl(${hue}, 100%, 65%)`;
    const glow   = `hsl(${hue}, 100%, 82%)`;
    worms.push({
      x:               bossX + Math.cos(angle) * startR,
      y:               bossY + Math.sin(angle) * startR,
      angle,
      speed,
      maxTurnRate:     maxTurn,
      angularVelocity: 0,
      noisePhase:      rng() * Math.PI * 2,
      trail:           createTrailRing(TRAIL_CAP),
      color,
      glowColor: glow,
      hazardMode: 'headOnly',
      radius:    4 + difficulty * 0.25,
    });
  }

  return {
    kind: 'vermiculate',
    ageMs: 0,
    durationMs,
    worms,
    trailPersistenceMs: 1000,
    difficulty,
    rng,
  };
}

// ── Update ────────────────────────────────────────────────────────────────────

export function updateVermiculateAttack(
  atk: VermiculateAttackInstance,
  playerX: number,
  playerY: number,
  dim: { w: number; h: number },
  deltaMs: number,
): void {
  atk.ageMs += deltaMs;
  const dtSec = deltaMs / 1000;

  for (const worm of atk.worms) {
    // Deterministic sinusoidal angular noise
    worm.noisePhase += 0.7 * dtSec;
    const playerBias = _calcPlayerBias(worm, playerX, playerY) * 0.6;
    const targetAngV = Math.sin(worm.noisePhase) * worm.maxTurnRate + playerBias;
    worm.angularVelocity += (targetAngV - worm.angularVelocity) * 3 * dtSec;

    worm.angle += worm.angularVelocity * dtSec;

    worm.x += Math.cos(worm.angle) * worm.speed * dtSec;
    worm.y += Math.sin(worm.angle) * worm.speed * dtSec;

    // Bounce off bounds
    const margin = 6;
    if (worm.x < margin) {
      worm.x = margin;
      worm.angle = Math.atan2(Math.sin(worm.angle), Math.abs(Math.cos(worm.angle)));
    } else if (worm.x > dim.w - margin) {
      worm.x = dim.w - margin;
      worm.angle = Math.atan2(Math.sin(worm.angle), -Math.abs(Math.cos(worm.angle)));
    }
    if (worm.y < margin) {
      worm.y = margin;
      worm.angle = Math.atan2(Math.abs(Math.sin(worm.angle)), Math.cos(worm.angle));
    } else if (worm.y > dim.h - margin) {
      worm.y = dim.h - margin;
      worm.angle = Math.atan2(-Math.abs(Math.sin(worm.angle)), Math.cos(worm.angle));
    }

    // Trail stride
    const strideNow  = Math.floor(atk.ageMs / TRAIL_STRIDE);
    const stridePrev = Math.floor((atk.ageMs - deltaMs) / TRAIL_STRIDE);
    if (strideNow > stridePrev) trailPush(worm.trail, worm.x, worm.y);
  }
}

/** Returns a signed angular rate nudging the worm toward the player. */
function _calcPlayerBias(
  worm: WormHead,
  playerX: number,
  playerY: number,
): number {
  const dx = playerX - worm.x;
  const dy = playerY - worm.y;
  const target = Math.atan2(dy, dx);
  let diff = target - worm.angle;
  diff = ((diff + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return diff * 1.2;
}

// ── Hazard circles ────────────────────────────────────────────────────────────

export function getVermiculateHazardCircles(
  atk: VermiculateAttackInstance,
): Array<{ x: number; y: number; r: number; atk: number }> {
  const result: Array<{ x: number; y: number; r: number; atk: number }> = [];
  for (const worm of atk.worms) {
    result.push({ x: worm.x, y: worm.y, r: worm.radius + 2, atk: 9 });
  }
  return result;
}
