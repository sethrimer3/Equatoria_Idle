/**
 * rpg-stardust-update.ts — Per-frame update logic for StardustEnemy.
 *
 * State machine: drifting → warning → frozen → laser → resuming → drifting
 *
 * During laser phase, builds a laser chain that bounces between all active
 * Stardust particles in the arena (across all Stardust enemies on screen).
 *
 * Uses topographic terrain LOS checks to build realistic bounce chains.
 */

import type { StardustEnemy } from './rpg-enemy-types';
import type { TopographicTerrainState } from './terrain/topographic-terrain';
import { segmentIntersectsTopographicTerrain } from './terrain/topographic-terrain';
import {
  STARDUST_DRIFT_DAMPING, STARDUST_BOUNCE_DAMPING, STARDUST_COHESION_STRENGTH,
  STARDUST_MAX_CENTER_DIST, STARDUST_WARNING_MS, STARDUST_FROZEN_MS,
  STARDUST_LASER_MS, STARDUST_RESUMING_MS, STARDUST_CYCLE_MS,
  STARDUST_LASER_BOUNCE_MULT, STARDUST_LASER_MAX_BOUNCES,
  STARDUST_LASER_HIT_CD_MS,
} from './rpg-enemy-constants';

// ── Context interface ─────────────────────────────────────────────────────────

export interface StardustUpdateCtx {
  mote: { x: number; y: number };
  dim: { w: number; h: number };
  playerStats: { hp: number; maxHp: number; atk: number; def: number };
  getTopographicTerrainState(): TopographicTerrainState | null;
  dealDamageToPlayer(dmg: number): void;
  spawnDamageNumber(x: number, y: number, vx: number, vy: number, text: string, ratio: number, color: string): void;
  fluid: { addExplosion(x: number, y: number, strength: number, r: number, g: number, b: number): void };
}

// ── Main update function ──────────────────────────────────────────────────────

export function updateStardustEnemies(
  enemies: StardustEnemy[],
  ctx: StardustUpdateCtx,
  deltaMs: number
): void {
  for (const e of enemies) {
    e.pulseMs += deltaMs;
    
    switch (e.phase) {
      case 'drifting':
        updateDriftingPhase(e, ctx, deltaMs);
        break;
      case 'warning':
        updateWarningPhase(e, deltaMs);
        break;
      case 'frozen':
        updateFrozenPhase(e, ctx, deltaMs);
        break;
      case 'laser':
        updateLaserPhase(e, ctx, deltaMs);
        break;
      case 'resuming':
        updateResumingPhase(e, deltaMs);
        break;
    }
    
    // Update center position (average of particles)
    updateCenterPosition(e);
  }
}

// ── Phase update functions ────────────────────────────────────────────────────

function updateDriftingPhase(e: StardustEnemy, _ctx: StardustUpdateCtx, deltaMs: number): void {
  // Move particles with gentle cohesion toward center
  for (const p of e.particles) {
    // Apply velocity
    p.x += p.vx;
    p.y += p.vy;
    
    // Damping
    p.vx *= STARDUST_DRIFT_DAMPING;
    p.vy *= STARDUST_DRIFT_DAMPING;
    
    // Bounce off walls
    if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx) * STARDUST_BOUNCE_DAMPING; }
    if (p.x > e.arenaW) { p.x = e.arenaW; p.vx = -Math.abs(p.vx) * STARDUST_BOUNCE_DAMPING; }
    if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy) * STARDUST_BOUNCE_DAMPING; }
    if (p.y > e.arenaH) { p.y = e.arenaH; p.vy = -Math.abs(p.vy) * STARDUST_BOUNCE_DAMPING; }
    
    // Cohesion toward center
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > STARDUST_MAX_CENTER_DIST) {
      p.vx += (dx / dist) * STARDUST_COHESION_STRENGTH * deltaMs;
      p.vy += (dy / dist) * STARDUST_COHESION_STRENGTH * deltaMs;
    }
  }
  
  // Count down cycle timer
  e.cycleTimerMs -= deltaMs;
  if (e.cycleTimerMs <= 0) {
    e.phase = 'warning';
    e.phaseMs = 0;
    e.cycleTimerMs = STARDUST_CYCLE_MS * (0.8 + Math.random() * 0.4);
  }
}

function updateWarningPhase(e: StardustEnemy, deltaMs: number): void {
  // Particles slow down, brightness increases
  for (const p of e.particles) {
    p.vx *= 0.95;
    p.vy *= 0.95;
    p.x += p.vx;
    p.y += p.vy;
    p.brightness = Math.min(1, p.brightness + deltaMs * 0.0008);
  }
  
  e.phaseMs += deltaMs;
  if (e.phaseMs >= STARDUST_WARNING_MS) {
    e.phase = 'frozen';
    e.phaseMs = 0;
  }
}

function updateFrozenPhase(e: StardustEnemy, ctx: StardustUpdateCtx, deltaMs: number): void {
  // Particles frozen, brightness pulses high
  for (const p of e.particles) {
    p.brightness = 0.9 + 0.1 * Math.sin(e.pulseMs * 0.01);
  }
  
  e.phaseMs += deltaMs;
  if (e.phaseMs >= STARDUST_FROZEN_MS) {
    // Build laser chain
    buildLaserChain(ctx, [e]);
    e.phase = 'laser';
    e.phaseMs = 0;
    e.laserHitCdMs = 0;
  }
}

function updateLaserPhase(e: StardustEnemy, ctx: StardustUpdateCtx, deltaMs: number): void {
  // Particles frozen, laser active
  e.phaseMs += deltaMs;
  e.laserHitCdMs = Math.max(0, e.laserHitCdMs - deltaMs);
  
  // Check player intersection with laser segments
  if (e.laserHitCdMs <= 0 && e.laserChain.length > 0) {
    const hit = checkPlayerLaserIntersection(e, ctx.mote.x, ctx.mote.y, 6);
    if (hit) {
      ctx.dealDamageToPlayer(e.atk);
      e.laserHitCdMs = STARDUST_LASER_HIT_CD_MS;
      ctx.fluid.addExplosion(ctx.mote.x, ctx.mote.y, 0.5, 255, 240, 200);
    }
  }
  
  if (e.phaseMs >= STARDUST_LASER_MS) {
    e.phase = 'resuming';
    e.phaseMs = 0;
    e.laserChain = [];
    e.laserNodes = [];
  }
}

function updateResumingPhase(e: StardustEnemy, deltaMs: number): void {
  // Particles gradually resume movement
  for (const p of e.particles) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.05;
    p.vx += Math.cos(angle) * speed;
    p.vy += Math.sin(angle) * speed;
    p.x += p.vx;
    p.y += p.vy;
    p.brightness = Math.max(0.6, p.brightness - deltaMs * 0.0005);
  }
  
  e.phaseMs += deltaMs;
  if (e.phaseMs >= STARDUST_RESUMING_MS) {
    e.phase = 'drifting';
    e.phaseMs = 0;
  }
}

// ── Helper functions ──────────────────────────────────────────────────────────

function updateCenterPosition(e: StardustEnemy): void {
  if (e.particles.length === 0) return;
  let sumX = 0;
  let sumY = 0;
  for (const p of e.particles) {
    sumX += p.x;
    sumY += p.y;
  }
  e.x = sumX / e.particles.length;
  e.y = sumY / e.particles.length;
}

function buildLaserChain(ctx: StardustUpdateCtx, enemies: StardustEnemy[]): void {
  // Collect all particles from all Stardust enemies
  const allParticles: Array<{ x: number; y: number; enemyIdx: number; particleIdx: number }> = [];
  for (let ei = 0; ei < enemies.length; ei++) {
    for (let pi = 0; pi < enemies[ei].particles.length; pi++) {
      const p = enemies[ei].particles[pi];
      allParticles.push({ x: p.x, y: p.y, enemyIdx: ei, particleIdx: pi });
    }
  }
  
  const maxBounces = Math.min(allParticles.length * STARDUST_LASER_BOUNCE_MULT, STARDUST_LASER_MAX_BOUNCES);
  const terrain = ctx.getTopographicTerrainState();
  
  // For each Stardust enemy, build its laser chain
  for (const enemy of enemies) {
    enemy.laserChain = [];
    enemy.laserNodes = [];
    if (allParticles.length < 2) continue;
    
    // Pick random starting particle from this enemy's particles
    const myParticles = allParticles.filter(ap => ap.enemyIdx === enemies.indexOf(enemy));
    if (myParticles.length === 0) continue;
    
    let currentIdx = allParticles.indexOf(myParticles[Math.floor(Math.random() * myParticles.length)]);
    const usedRecently: number[] = [currentIdx];
    
    for (let bounce = 0; bounce < maxBounces; bounce++) {
      // Find valid targets with LOS
      const validTargets: number[] = [];
      for (let ti = 0; ti < allParticles.length; ti++) {
        if (ti === currentIdx) continue;
        const a = allParticles[currentIdx];
        const b = allParticles[ti];
        const hasLOS = !terrain || !segmentIntersectsTopographicTerrain(terrain, a.x, a.y, b.x, b.y);
        if (hasLOS) validTargets.push(ti);
      }
      if (validTargets.length === 0) break;
      
      // Prefer not-recently-used targets
      const notRecent = validTargets.filter(t => !usedRecently.includes(t));
      const pool = notRecent.length > 0 ? notRecent : validTargets;
      const nextIdx = pool[Math.floor(Math.random() * pool.length)];
      
      const a = allParticles[currentIdx];
      const b = allParticles[nextIdx];
      enemy.laserChain.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      enemy.laserNodes.push(nextIdx);
      
      usedRecently.push(nextIdx);
      if (usedRecently.length > 5) usedRecently.shift();
      currentIdx = nextIdx;
    }
  }
}

function checkPlayerLaserIntersection(e: StardustEnemy, px: number, py: number, radius: number): boolean {
  // Check if player (circle) intersects any laser segment
  for (const seg of e.laserChain) {
    if (segmentCircleIntersect(seg.x1, seg.y1, seg.x2, seg.y2, px, py, radius)) {
      return true;
    }
  }
  return false;
}

function segmentCircleIntersect(
  x1: number, y1: number, x2: number, y2: number,
  cx: number, cy: number, r: number
): boolean {
  // Vector from seg start to circle center
  const dx = cx - x1;
  const dy = cy - y1;
  // Segment vector
  const sx = x2 - x1;
  const sy = y2 - y1;
  const segLen2 = sx * sx + sy * sy;
  if (segLen2 === 0) {
    // Degenerate segment
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist <= r;
  }
  // Project circle center onto segment
  const t = Math.max(0, Math.min(1, (dx * sx + dy * sy) / segLen2));
  const closestX = x1 + t * sx;
  const closestY = y1 + t * sy;
  const distX = cx - closestX;
  const distY = cy - closestY;
  const dist = Math.sqrt(distX * distX + distY * distY);
  return dist <= r;
}
