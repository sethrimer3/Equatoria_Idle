/**
 * rpg-attack-swarm.ts — Mother + follower swarm attack simulation.
 *
 * One MotherParticle steers toward the player with gentle homing.
 * FollowerParticles are attracted to the mother, with index-based deterministic
 * angular noise to prevent clumping. Followers also lightly home on the player.
 */

import type {
  FollowerParticle, MotherParticle, SwarmAttackInstance,
} from '../rpg-boss-attack-types';
import { createTrailRing, trailPush, createPrng } from '../rpg-boss-attack-types';

const MOTHER_TRAIL_CAP   = 64;
const FOLLOWER_TRAIL_CAP = 32;
const TRAIL_STRIDE_MS    = 8;
const MAX_FOLLOWERS      = 120;

// ── Spawn ─────────────────────────────────────────────────────────────────────

export function spawnSwarmAttack(
  bossX: number,
  bossY: number,
  params: Record<string, number | boolean | string>,
  difficulty: number,
): SwarmAttackInstance {
  const followerCount = Math.min(MAX_FOLLOWERS, (params.followerCount as number | undefined) ?? 20);
  const motherSpeed   = (params.motherSpeed   as number | undefined) ?? 70;
  const followerSpeed = (params.followerSpeed as number | undefined) ?? 55;
  const durationMs    = 14000 + difficulty * 600;

  const seed = Math.floor(Math.random() * 0xFFFFFF);
  const rng  = createPrng(seed);

  const motherHue   = Math.round(rng() * 360);
  const motherColor = `hsl(${motherHue}, 100%, 72%)`;
  const motherGlow  = `hsl(${motherHue}, 100%, 88%)`;

  const mother: MotherParticle = {
    x: bossX,
    y: bossY,
    vx: (rng() - 0.5) * 40,
    vy: (rng() - 0.5) * 40,
    speed: motherSpeed,
    trail: createTrailRing(MOTHER_TRAIL_CAP),
    color: motherColor,
    glowColor: motherGlow,
    ageMs: 0,
    radius: 5 + difficulty * 0.3,
    noisePhase: rng() * Math.PI * 2,
    angularVelocity: 0,
  };

  const followers: FollowerParticle[] = [];
  for (let i = 0; i < followerCount; i++) {
    const angle  = (i / followerCount) * Math.PI * 2;
    const r      = 5 + rng() * 12;
    const hue    = (motherHue + 30 + i * 7) % 360;
    const color  = `hsl(${hue}, 80%, 65%)`;
    const glow   = `hsl(${hue}, 100%, 80%)`;
    followers.push({
      x: bossX + Math.cos(angle) * r,
      y: bossY + Math.sin(angle) * r,
      vx: 0, vy: 0,
      speed: followerSpeed,
      trail: createTrailRing(FOLLOWER_TRAIL_CAP),
      color,
      glowColor: glow,
      ageMs: 0,
      radius: 2.5 + difficulty * 0.1,
      index: i,
      noiseOffset: rng() * Math.PI * 2,
    });
  }

  return {
    kind: 'motherSwarm',
    ageMs: 0,
    durationMs,
    mother,
    followers,
    trailPersistenceMs: 700,
    difficulty,
    rng,
  };
}

// ── Update ────────────────────────────────────────────────────────────────────

export function updateSwarmAttack(
  atk: SwarmAttackInstance,
  playerX: number,
  playerY: number,
  dim: { w: number; h: number },
  deltaMs: number,
): void {
  atk.ageMs += deltaMs;
  const dtSec = deltaMs / 1000;
  const margin = 6;

  // ── Update mother ──────────────────────────────────────────────────────────
  const m = atk.mother;
  m.ageMs += deltaMs;
  m.noisePhase += 0.5 * dtSec;

  const toPlayerAngle = Math.atan2(playerY - m.y, playerX - m.x);
  const targetAngV    = Math.sin(m.noisePhase) * 1.5;
  m.angularVelocity  += (targetAngV - m.angularVelocity) * 2.5 * dtSec;

  const currentAngle = Math.atan2(m.vy, m.vx) || 0;
  const steerAngle   = toPlayerAngle + m.angularVelocity;
  const blendedAngle = _blendAngles(currentAngle, steerAngle, 2.0 * dtSec);

  m.vx = Math.cos(blendedAngle) * m.speed;
  m.vy = Math.sin(blendedAngle) * m.speed;

  m.x += m.vx * dtSec;
  m.y += m.vy * dtSec;

  _bouncePoint(m, dim, margin);

  const strideNow  = Math.floor(m.ageMs / TRAIL_STRIDE_MS);
  const stridePrev = Math.floor((m.ageMs - deltaMs) / TRAIL_STRIDE_MS);
  if (strideNow > stridePrev) trailPush(m.trail, m.x, m.y);

  // ── Update followers ──────────────────────────────────────────────────────
  for (const f of atk.followers) {
    f.ageMs += deltaMs;

    // Attract to mother
    const dxM = m.x - f.x;
    const dyM = m.y - f.y;
    const distM = Math.sqrt(dxM * dxM + dyM * dyM) + 0.001;

    // Weak additional attraction to player
    const dxP = playerX - f.x;
    const dyP = playerY - f.y;
    const distP = Math.sqrt(dxP * dxP + dyP * dyP) + 0.001;

    // Deterministic angular noise per follower index
    const noisePeriod = 0.6 + (f.index % 5) * 0.07;
    const noise = Math.sin(atk.ageMs * 0.001 * noisePeriod + f.noiseOffset);

    const rawAngle  = Math.atan2(dyM / distM + (dyP / distP) * 0.15, dxM / distM + (dxP / distP) * 0.15);
    const finalAngle = rawAngle + noise * 0.4;

    f.vx = Math.cos(finalAngle) * f.speed;
    f.vy = Math.sin(finalAngle) * f.speed;

    f.x += f.vx * dtSec;
    f.y += f.vy * dtSec;

    _bouncePoint(f, dim, margin);

    const fsNow  = Math.floor(f.ageMs / TRAIL_STRIDE_MS);
    const fsPrev = Math.floor((f.ageMs - deltaMs) / TRAIL_STRIDE_MS);
    if (fsNow > fsPrev) trailPush(f.trail, f.x, f.y);
  }
}

function _blendAngles(a: number, b: number, t: number): number {
  let diff = b - a;
  diff = ((diff + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + diff * Math.min(1, t);
}

function _bouncePoint(
  p: { x: number; y: number; vx: number; vy: number },
  dim: { w: number; h: number },
  margin: number,
): void {
  if (p.x < margin)            { p.x = margin;          p.vx =  Math.abs(p.vx); }
  if (p.x > dim.w - margin)    { p.x = dim.w - margin;  p.vx = -Math.abs(p.vx); }
  if (p.y < margin)            { p.y = margin;           p.vy =  Math.abs(p.vy); }
  if (p.y > dim.h - margin)    { p.y = dim.h - margin;  p.vy = -Math.abs(p.vy); }
}

// ── Hazard circles ────────────────────────────────────────────────────────────

export function getSwarmHazardCircles(
  atk: SwarmAttackInstance,
): Array<{ x: number; y: number; r: number; damage: number }> {
  const result: Array<{ x: number; y: number; r: number; damage: number }> = [];
  result.push({ x: atk.mother.x, y: atk.mother.y, r: atk.mother.radius + 3, damage: 12 });
  for (const f of atk.followers) {
    result.push({ x: f.x, y: f.y, r: f.radius + 1, damage: 7 });
  }
  return result;
}
