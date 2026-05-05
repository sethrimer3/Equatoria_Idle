/**
 * rpg-attack-grav.ts — Gravitational orbital body attack simulation.
 *
 * Bodies are attracted to one or more wells using softened Newtonian gravity.
 * Wells can orbit a fixed centre point. Bodies bounce off arena bounds.
 * Trails use Float64Array ring buffers for neon-trail-draw compatibility.
 */

import type {
  GravAttackInstance, GravBody, GravWell,
} from '../rpg-boss-attack-types';
import { createTrailRing, trailPush } from '../rpg-boss-attack-types';
import { BOSS_COLORS, BOSS_GLOW_COLORS } from '../rpg-constants';

const TRAIL_CAP = 64;
const TRAIL_STRIDE_MS = 8;

// ── Spawn ─────────────────────────────────────────────────────────────────────

export function spawnGravAttack(
  bossX: number,
  bossY: number,
  dim: { w: number; h: number },
  params: Record<string, number | boolean | string>,
  difficulty: number,
): GravAttackInstance {
  const bodyCount  = Math.min(12, (params.bodyCount  as number | undefined) ?? 3);
  const wellCount  = Math.min(4,  (params.wellCount  as number | undefined) ?? 1);
  const strength   = (params.strength  as number | undefined) ?? 0.0022;
  const durationMs = 14000 + difficulty * 500;

  const wells: GravWell[] = [];
  for (let i = 0; i < wellCount; i++) {
    wells.push({
      x: bossX + (Math.random() - 0.5) * dim.w * 0.4,
      y: bossY + (Math.random() - 0.5) * dim.h * 0.4,
      strength: strength,
      movingAngle: (i / wellCount) * Math.PI * 2,
    });
  }

  const bodies: GravBody[] = [];
  const colorBase = BOSS_COLORS[Math.min(6, Math.ceil(difficulty))];
  const glowBase  = BOSS_GLOW_COLORS[Math.min(6, Math.ceil(difficulty))];
  for (let i = 0; i < bodyCount; i++) {
    const angle = (i / bodyCount) * Math.PI * 2;
    const r = 30 + Math.random() * 60;
    const vAngle = angle + Math.PI / 2;
    const speed = 0.4 + Math.random() * 0.4;
    bodies.push({
      x:    bossX + Math.cos(angle) * r,
      y:    bossY + Math.sin(angle) * r,
      vx:   Math.cos(vAngle) * speed,
      vy:   Math.sin(vAngle) * speed,
      trail: createTrailRing(TRAIL_CAP),
      color:    colorBase ?? '#aaccff',
      glowColor: glowBase ?? '#6699ff',
      radius: 3 + difficulty * 0.3,
      hazardMode: (params.hazardMode as string | undefined) === 'headOnly' ? 'headOnly' : 'visualOnly',
      ageMs: 0,
    });
  }

  return {
    kind: 'grav',
    ageMs: 0,
    durationMs,
    wells,
    bodies,
    softeningSquared: 400,
    velocityCap: 3.5 + difficulty * 0.2,
    trailPersistenceMs: 1200,
    difficulty,
  };
}

// ── Update ────────────────────────────────────────────────────────────────────

export function updateGravAttack(
  atk: GravAttackInstance,
  _playerX: number,
  _playerY: number,
  dim: { w: number; h: number },
  deltaMs: number,
): void {
  atk.ageMs += deltaMs;

  const dtSec  = deltaMs / 1000;
  const velCap = atk.velocityCap;

  // Advance well orbits when moving
  const wellOrbitR = Math.min(dim.w, dim.h) * 0.18;
  const wellCx     = dim.w / 2;
  const wellCy     = dim.h * 0.35;

  for (const well of atk.wells) {
    well.movingAngle += 0.55 * dtSec;
    well.x = wellCx + Math.cos(well.movingAngle) * wellOrbitR;
    well.y = wellCy + Math.sin(well.movingAngle) * wellOrbitR * 0.6;
  }

  for (const body of atk.bodies) {
    body.ageMs += deltaMs;

    // Gravity from each well
    let ax = 0, ay = 0;
    for (const well of atk.wells) {
      const dx = well.x - body.x;
      const dy = well.y - body.y;
      const distSq = dx * dx + dy * dy;
      const softened = Math.max(distSq, atk.softeningSquared);
      const dist = Math.sqrt(softened);
      const acc = well.strength * 60 / softened;
      ax += (dx / dist) * acc;
      ay += (dy / dist) * acc;
    }

    body.vx += ax;
    body.vy += ay;

    const spd = Math.sqrt(body.vx * body.vx + body.vy * body.vy);
    if (spd > velCap) {
      body.vx = (body.vx / spd) * velCap;
      body.vy = (body.vy / spd) * velCap;
    }

    // Velocity is in px/frame at 60fps; convert to px/sec for dtSec integration.
    const dtSec = deltaMs / 1000;
    body.x += body.vx * dtSec * 60;
    body.y += body.vy * dtSec * 60;

    // Bounce off bounds
    const margin = 4;
    if (body.x < margin)            { body.x = margin;            body.vx =  Math.abs(body.vx); }
    if (body.x > dim.w - margin)    { body.x = dim.w - margin;    body.vx = -Math.abs(body.vx); }
    if (body.y < margin)            { body.y = margin;             body.vy =  Math.abs(body.vy); }
    if (body.y > dim.h - margin)    { body.y = dim.h - margin;    body.vy = -Math.abs(body.vy); }

    // Push trail point on stride
    const strideCount = Math.floor(body.ageMs / TRAIL_STRIDE_MS);
    const prevCount   = Math.floor((body.ageMs - deltaMs) / TRAIL_STRIDE_MS);
    if (strideCount > prevCount) {
      trailPush(body.trail, body.x, body.y);
    }
  }
}

// ── Hazard circles ────────────────────────────────────────────────────────────

export function getGravHazardCircles(
  atk: GravAttackInstance,
): Array<{ x: number; y: number; r: number; damage: number }> {
  const result: Array<{ x: number; y: number; r: number; damage: number }> = [];
  for (const body of atk.bodies) {
    if (body.hazardMode === 'headOnly') {
      result.push({ x: body.x, y: body.y, r: body.radius + 2, damage: 8 });
    }
  }
  return result;
}


