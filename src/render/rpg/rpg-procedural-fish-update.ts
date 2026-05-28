/**
 * rpg-procedural-fish-update.ts — Per-frame update logic for the 8 fish
 * creature types and fish-related projectiles/hazards.
 *
 * Fish use Boids-style schooling (swimSchoolStep) layered on top of the shared
 * contact-damage model.  Species-specific behaviours (lunge, dash, teleport,
 * diamond armour) are implemented per function.
 *
 * Extracted from rpg-procedural-update.ts to keep that file manageable.
 */

import { type RpgEnemyCtx, applyEnemyTerrainPushOut } from './rpg-enemy-updates';
import type {
  SandFishEnemy, QuartzFishEnemy, RubyFishEnemy, SunstoneFishEnemy,
  EmeraldFishEnemy, SapphireFishEnemy, AmethystFishEnemy, DiamondFishEnemy,
  FishMine, FishSpike, FishBolt, FishDecoy,
  SchoolableFish,
} from './rpg-procedural-types';
import {
  PROC_CONTACT_RADIUS, PROC_CONTACT_CD_MS, PROC_PATROL_SPEED,
  SANDFISH_SIZE, QUARTZFISH_SIZE, RUBYFISH_SIZE, SUNSTONEFISH_SIZE,
  EMERALDFISH_SIZE, EMERALDFISH_MINI_SIZE, SAPPHIREFISH_SIZE, AMETHYSTFISH_SIZE, DIAMONDFISH_SIZE,
  SANDFISH_LUNGE_CD_MS, RUBYFISH_DASH_WINDUP_MS, RUBYFISH_DASH_MS, RUBYFISH_RECOVERY_MS,
  SUNSTONEFISH_MINE_CD_MS, SUNSTONEFISH_MINE_COUNT, SAPPHIREFISH_BOLT_CD_MS,
  AMETHYSTFISH_TELEPORT_CD_MS, DIAMONDFISH_ARMOR_ON_MS, DIAMONDFISH_ARMOR_OFF_MS,
  FISH_SCHOOL_SEPARATION_RADIUS, FISH_SCHOOL_ALIGNMENT_RADIUS, FISH_SCHOOL_COHESION_RADIUS,
  FISH_SCHOOL_SEPARATION_WEIGHT, FISH_SCHOOL_ALIGNMENT_WEIGHT, FISH_SCHOOL_COHESION_WEIGHT,
  FISH_SCHOOL_PLAYER_SEEK_WEIGHT, FISH_SCHOOL_TERRAIN_AVOID_WEIGHT, FISH_SCHOOL_EDGE_AVOID_WEIGHT,
  FISH_SCHOOL_MAX_TURN_RATE, FISH_SCHOOL_MAX_SPEED, FISH_SCHOOL_PROBE_DIST, FISH_SCHOOL_EDGE_MARGIN,
} from './rpg-procedural-constants';
import { makeFishMine, makeFishSpike, makeFishBolt, makeFishDecoy } from './rpg-procedural-factories';
import { TARGET_FRAME_MS, PLAYER_HIT_RADIUS } from './rpg-constants';
import { segmentIntersectsTopographicTerrain } from './terrain/topographic-terrain';

/** Check contact damage (mirrors the same helper in rpg-procedural-update.ts). */
function contactDamage(
  e: { x: number; y: number; atk: number; contactCdMs: number; hitFlashMs: number },
  dt: number,
  ctx: RpgEnemyCtx,
): void {
  if (e.contactCdMs > 0) {
    e.contactCdMs -= dt * TARGET_FRAME_MS;
    return;
  }
  const dx = ctx.mote.x - e.x, dy = ctx.mote.y - e.y;
  if (dx * dx + dy * dy <= (PROC_CONTACT_RADIUS + PLAYER_HIT_RADIUS) ** 2) {
    ctx.dealDamageToPlayer(e.atk);
    e.contactCdMs = PROC_CONTACT_CD_MS;
  }
}

// ── Fish helpers ────────────────────────────────────────────────────────────────

// SwimEntity is structurally compatible with SchoolableFish (BaseFishEnemy satisfies both).
type SwimEntity = SchoolableFish;

// Pre-computed squared radii — avoids repeated ** in the per-entity inner loop.
const _SEP_R2 = FISH_SCHOOL_SEPARATION_RADIUS ** 2;
const _ALI_R2 = FISH_SCHOOL_ALIGNMENT_RADIUS  ** 2;
const _COH_R2 = FISH_SCHOOL_COHESION_RADIUS   ** 2;
// Tighter separation radius for mini fish (squared).
const _MINI_SEP_R2 = (FISH_SCHOOL_SEPARATION_RADIUS * 0.65) ** 2;

/**
 * Fish locomotion step that incorporates Boids-style schooling.
 *
 * Extends the original swimStep with:
 *  1. Separation   — steer away from close neighbours.
 *  2. Alignment    — match the heading of nearby neighbours.
 *  3. Cohesion     — steer toward the local group centre of mass.
 *  4. Player seek  — maintain pressure toward the player (blended, not dominant).
 *  5. Edge avoidance — soft push inward before hard clamp.
 *  6. Terrain anticipation — probe ahead along current heading; turn away before
 *     pressing into terrain (applyEnemyTerrainPushOut still corrects any miss).
 *
 * All steering forces are blended into a single desired heading; the fish then
 * turns toward that heading at the existing clamped rate, and propels itself via
 * the animPhase-driven tail-kick thrust exactly as before.
 *
 * @param e        — mutable fish entity (satisfies SchoolableFish / SwimEntity)
 * @param dt       — frame delta (1 = one target frame)
 * @param ctx      — shared enemy update context
 * @param speedMul — per-fish speed multiplier (unchanged from original swimStep)
 * @param school   — read-only list of ALL active fish this frame (self excluded inside)
 */
function schoolSwimStep(
  e: SwimEntity,
  dt: number,
  ctx: RpgEnemyCtx,
  speedMul: number,
  school: readonly SchoolableFish[],
): void {
  // ── 1–3. Boids neighbour scan ─────────────────────────────────────────────
  let sepX = 0, sepY = 0;
  let aliVx = 0, aliVy = 0, aliCount = 0;
  let cohSumX = 0, cohSumY = 0, cohCount = 0;

  // Mini fish school tighter.
  const sepR2 = e.isMini ? _MINI_SEP_R2 : _SEP_R2;

  for (const n of school) {
    if (n === e) continue;
    const ndx = e.x - n.x;
    const ndy = e.y - n.y;
    const dsq = ndx * ndx + ndy * ndy;

    // Separation (close neighbours)
    if (dsq < sepR2 && dsq > 0) {
      const dist = Math.sqrt(dsq);
      sepX += ndx / dist;
      sepY += ndy / dist;
    }
    // Alignment (medium range)
    if (dsq < _ALI_R2) {
      aliVx += n.vx;
      aliVy += n.vy;
      aliCount++;
    }
    // Cohesion (wider range)
    if (dsq < _COH_R2) {
      cohSumX += n.x;
      cohSumY += n.y;
      cohCount++;
    }
  }

  // Normalise alignment vector
  let aliX = 0, aliY = 0;
  if (aliCount > 0) {
    aliX = aliVx / aliCount;
    aliY = aliVy / aliCount;
    const aliLen = Math.sqrt(aliX * aliX + aliY * aliY);
    if (aliLen > 0.001) { aliX /= aliLen; aliY /= aliLen; }
  }

  // Cohesion: direction toward centre of mass
  let cohX = 0, cohY = 0;
  if (cohCount > 0) {
    cohX = cohSumX / cohCount - e.x;
    cohY = cohSumY / cohCount - e.y;
    const cohLen = Math.sqrt(cohX * cohX + cohY * cohY);
    if (cohLen > 0.001) { cohX /= cohLen; cohY /= cohLen; }
  }

  // ── 4. Player seek ────────────────────────────────────────────────────────
  const pdx = ctx.mote.x - e.x;
  const pdy = ctx.mote.y - e.y;
  const pLen = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
  const seekX = pdx / pLen;
  const seekY = pdy / pLen;

  // ── 5. Edge avoidance ─────────────────────────────────────────────────────
  let edgeX = 0, edgeY = 0;
  const em = FISH_SCHOOL_EDGE_MARGIN;
  if (e.x < ctx.viewport.left + em) {
    edgeX += (ctx.viewport.left + em - e.x) / em;
  } else if (e.x > ctx.viewport.right - em) {
    edgeX -= (e.x - (ctx.viewport.right - em)) / em;
  }
  if (e.y < ctx.viewport.top + em) {
    edgeY += (ctx.viewport.top + em - e.y) / em;
  } else if (e.y > ctx.viewport.bottom - em) {
    edgeY -= (e.y - (ctx.viewport.bottom - em)) / em;
  }

  // ── 6. Terrain anticipation ───────────────────────────────────────────────
  let terrX = 0, terrY = 0;
  const terrain = ctx.getTerrainState();
  if (terrain) {
    const probeX = e.x + Math.cos(e.swimAngle) * FISH_SCHOOL_PROBE_DIST;
    const probeY = e.y + Math.sin(e.swimAngle) * FISH_SCHOOL_PROBE_DIST;
    if (segmentIntersectsTopographicTerrain(terrain, e.x, e.y, probeX, probeY)) {
      // Try perpendicular escape directions; prefer the clear one.
      const perpA = e.swimAngle + Math.PI / 2;
      const perpB = e.swimAngle - Math.PI / 2;
      const paX = e.x + Math.cos(perpA) * FISH_SCHOOL_PROBE_DIST;
      const paY = e.y + Math.sin(perpA) * FISH_SCHOOL_PROBE_DIST;
      const pbX = e.x + Math.cos(perpB) * FISH_SCHOOL_PROBE_DIST;
      const pbY = e.y + Math.sin(perpB) * FISH_SCHOOL_PROBE_DIST;
      const clearA = !segmentIntersectsTopographicTerrain(terrain, e.x, e.y, paX, paY);
      const clearB = !segmentIntersectsTopographicTerrain(terrain, e.x, e.y, pbX, pbY);
      if (clearA && !clearB) {
        terrX = Math.cos(perpA); terrY = Math.sin(perpA);
      } else if (!clearA && clearB) {
        terrX = Math.cos(perpB); terrY = Math.sin(perpB);
      } else {
        // Both blocked or both clear — default nudge to perpA.
        terrX = Math.cos(perpA); terrY = Math.sin(perpA);
      }
    }
  }

  // ── Blend all steering forces ─────────────────────────────────────────────
  const desX = sepX  * FISH_SCHOOL_SEPARATION_WEIGHT
             + aliX  * FISH_SCHOOL_ALIGNMENT_WEIGHT
             + cohX  * FISH_SCHOOL_COHESION_WEIGHT
             + seekX * FISH_SCHOOL_PLAYER_SEEK_WEIGHT
             + edgeX * FISH_SCHOOL_EDGE_AVOID_WEIGHT
             + terrX * FISH_SCHOOL_TERRAIN_AVOID_WEIGHT;
  const desY = sepY  * FISH_SCHOOL_SEPARATION_WEIGHT
             + aliY  * FISH_SCHOOL_ALIGNMENT_WEIGHT
             + cohY  * FISH_SCHOOL_COHESION_WEIGHT
             + seekY * FISH_SCHOOL_PLAYER_SEEK_WEIGHT
             + edgeY * FISH_SCHOOL_EDGE_AVOID_WEIGHT
             + terrY * FISH_SCHOOL_TERRAIN_AVOID_WEIGHT;

  // Derive target angle from the blended heading.
  const desLen = Math.sqrt(desX * desX + desY * desY);
  let targetAngle: number;
  if (desLen < 0.001) {
    targetAngle = Math.atan2(ctx.mote.y - e.y, ctx.mote.x - e.x);
  } else {
    targetAngle = Math.atan2(desY / desLen, desX / desLen);
  }

  // Add sinusoidal wander (reduced amplitude since schooling shapes the path).
  e.turnPhase += dt * 0.04;
  targetAngle  += Math.sin(e.turnPhase) * 0.20;

  // Clamp turn rate — same style as original swimStep.
  let delta = targetAngle - e.swimAngle;
  while (delta >  Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const maxTurn = FISH_SCHOOL_MAX_TURN_RATE * dt;
  e.swimAngle += Math.max(-maxTurn, Math.min(maxTurn, delta * 0.14));

  // ── Tail-kick thrust (preserved from original swimStep) ───────────────────
  const kick  = 0.65 + 0.35 * Math.max(0, Math.sin(e.animPhase * 2.8));
  const speed = PROC_PATROL_SPEED * 0.85 * speedMul;
  e.vx += Math.cos(e.swimAngle) * speed * kick * 0.09;
  e.vy += Math.sin(e.swimAngle) * speed * kick * 0.09;

  // ── Velocity damping ──────────────────────────────────────────────────────
  e.vx *= 0.91;
  e.vy *= 0.91;

  // ── Speed clamp (prevent runaway from accumulated boids forces) ───────────
  const spd2 = e.vx * e.vx + e.vy * e.vy;
  if (spd2 > FISH_SCHOOL_MAX_SPEED * FISH_SCHOOL_MAX_SPEED) {
    const spd = Math.sqrt(spd2);
    e.vx = (e.vx / spd) * FISH_SCHOOL_MAX_SPEED;
    e.vy = (e.vy / spd) * FISH_SCHOOL_MAX_SPEED;
  }

  // ── Move + clamp ──────────────────────────────────────────────────────────
  e.x += e.vx * dt;
  e.y += e.vy * dt;
  ctx.clampEnemyToBounds(e);
}

function hitPlayerProjectile(
  p: { x: number; y: number; atk: number; hasHit?: boolean },
  ctx: RpgEnemyCtx,
  radius: number,
): boolean {
  const dx = ctx.mote.x - p.x;
  const dy = ctx.mote.y - p.y;
  if (dx * dx + dy * dy <= (PLAYER_HIT_RADIUS + radius) ** 2) {
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    ctx.dealDamageToPlayerKnockback(p.atk, -dx / len, -dy / len);
    if ('hasHit' in p) p.hasHit = true;
    return true;
  }
  return false;
}

export function updateSandFishEnemies(
  enemies: SandFishEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
  school: readonly SchoolableFish[] = [],
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    e.lungeTimerMs -= deltaMs;
    schoolSwimStep(e, dt, ctx, 1.15, school);
    if (e.lungeTimerMs <= 0) {
      const dx = ctx.mote.x - e.x, dy = ctx.mote.y - e.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      e.vx += (dx / len) * 1.8;
      e.vy += (dy / len) * 1.8;
      e.lungeTimerMs = SANDFISH_LUNGE_CD_MS;
    }
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), SANDFISH_SIZE / 2);
    contactDamage(e, dt, ctx);
  }
}

export function updateQuartzFishEnemies(
  enemies: QuartzFishEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
  school: readonly SchoolableFish[] = [],
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    e.shieldBroken = e.shieldHp <= 0;
    schoolSwimStep(e, dt, ctx, e.shieldBroken ? 1.05 : 0.85, school);
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), QUARTZFISH_SIZE / 2);
    contactDamage(e, dt, ctx);
  }
}

export function updateRubyFishEnemies(
  enemies: RubyFishEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
  school: readonly SchoolableFish[] = [],
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    e.dashTimerMs -= deltaMs;
    if (e.dashState === 'idle') {
      schoolSwimStep(e, dt, ctx, 1.1, school);
      if (e.dashTimerMs <= 0) {
        e.dashState = 'windup';
        e.dashTimerMs = RUBYFISH_DASH_WINDUP_MS;
      }
    } else if (e.dashState === 'windup') {
      const dx = ctx.mote.x - e.x, dy = ctx.mote.y - e.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      e.dashVx = (dx / len) * 3.4;
      e.dashVy = (dy / len) * 3.4;
      if (e.dashTimerMs <= 0) {
        e.dashState = 'dash';
        e.dashTimerMs = RUBYFISH_DASH_MS;
      }
    } else if (e.dashState === 'dash') {
      e.swimAngle = Math.atan2(e.dashVy, e.dashVx); // face the dash direction
      e.vx = e.dashVx; e.vy = e.dashVy;
      e.x += e.vx * dt; e.y += e.vy * dt;
      ctx.clampEnemyToBounds(e);
      if (e.dashTimerMs <= 0) {
        e.dashState = 'recovery';
        e.dashTimerMs = RUBYFISH_RECOVERY_MS;
      }
    } else {
      schoolSwimStep(e, dt, ctx, 0.75, school);
      if (e.dashTimerMs <= 0) {
        e.dashState = 'idle';
        e.dashTimerMs = RUBYFISH_DASH_WINDUP_MS + RUBYFISH_RECOVERY_MS;
      }
    }
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), RUBYFISH_SIZE / 2);
    contactDamage(e, dt, ctx);
  }
}

export function updateSunstoneFishEnemies(
  enemies: SunstoneFishEnemy[],
  mines: FishMine[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
  school: readonly SchoolableFish[] = [],
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    e.mineTimerMs -= deltaMs;
    schoolSwimStep(e, dt, ctx, 0.95, school);
    if (e.mineTimerMs <= 0) {
      for (let i = 0; i < SUNSTONEFISH_MINE_COUNT; i++) {
        const a = e.animPhase + (i / SUNSTONEFISH_MINE_COUNT) * Math.PI * 2;
        mines.push(makeFishMine(e.x, e.y, Math.cos(a) * 0.35, Math.sin(a) * 0.35, e.atk));
      }
      e.mineTimerMs = SUNSTONEFISH_MINE_CD_MS;
    }
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), SUNSTONEFISH_SIZE / 2);
    contactDamage(e, dt, ctx);
  }
}

export function updateEmeraldFishEnemies(
  enemies: EmeraldFishEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
  school: readonly SchoolableFish[] = [],
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    schoolSwimStep(e, dt, ctx, e.isMini ? 1.25 : 1.0, school);
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), (e.isMini ? EMERALDFISH_MINI_SIZE : EMERALDFISH_SIZE) / 2);
    contactDamage(e, dt, ctx);
  }
}

export function updateSapphireFishEnemies(
  enemies: SapphireFishEnemy[],
  bolts: FishBolt[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
  school: readonly SchoolableFish[] = [],
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    e.boltTimerMs -= deltaMs;
    schoolSwimStep(e, dt, ctx, 0.9, school);
    if (e.boltTimerMs <= 0) {
      const dx = ctx.mote.x - e.x, dy = ctx.mote.y - e.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      bolts.push(makeFishBolt(e.x, e.y, (dx / len) * 1.9, (dy / len) * 1.9, e.atk));
      e.boltTimerMs = SAPPHIREFISH_BOLT_CD_MS;
    }
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), SAPPHIREFISH_SIZE / 2);
    contactDamage(e, dt, ctx);
  }
}

export function updateAmethystFishEnemies(
  enemies: AmethystFishEnemy[],
  decoys: FishDecoy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
  school: readonly SchoolableFish[] = [],
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    e.teleportCdMs -= deltaMs;
    schoolSwimStep(e, dt, ctx, 1.0, school);
    if (e.teleportCdMs <= 0) {
      decoys.push(makeFishDecoy(e.x, e.y, e.swimAngle, e.animPhase));
      const angle = Math.random() * Math.PI * 2;
      const dist = 48 + Math.random() * 28;
      e.x = Math.max(ctx.viewport.left + 10, Math.min(ctx.viewport.right - 10, ctx.mote.x + Math.cos(angle) * dist));
      e.y = Math.max(ctx.viewport.top + 10, Math.min(ctx.viewport.bottom - 10, ctx.mote.y + Math.sin(angle) * dist));
      e.teleportCdMs = AMETHYSTFISH_TELEPORT_CD_MS;
    }
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), AMETHYSTFISH_SIZE / 2);
    contactDamage(e, dt, ctx);
  }
}

export function updateDiamondFishEnemies(
  enemies: DiamondFishEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
  school: readonly SchoolableFish[] = [],
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    e.armorTimerMs -= deltaMs;
    if (e.armorTimerMs <= 0) {
      e.armorActive = !e.armorActive;
      e.armorTimerMs = e.armorActive ? DIAMONDFISH_ARMOR_ON_MS : DIAMONDFISH_ARMOR_OFF_MS;
    }
    schoolSwimStep(e, dt, ctx, e.armorActive ? 0.8 : 1.05, school);
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), DIAMONDFISH_SIZE / 2);
    contactDamage(e, dt, ctx);
  }
}

export function updateFishMines(mines: FishMine[], spikes: FishSpike[], ctx: RpgEnemyCtx, deltaMs: number): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (let i = mines.length - 1; i >= 0; i--) {
    const m = mines[i];
    m.lifeMs -= deltaMs;
    m.armedMs -= deltaMs;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    if (m.lifeMs <= 0) { mines.splice(i, 1); continue; }
    if (m.armedMs <= 0 && hitPlayerProjectile({ x: m.x, y: m.y, atk: m.atk }, ctx, 6)) {
      for (let s = 0; s < 8; s++) {
        const a = (s / 8) * Math.PI * 2;
        spikes.push(makeFishSpike(m.x, m.y, Math.cos(a) * 2.4, Math.sin(a) * 2.4, Math.max(1, m.atk * 0.8)));
      }
      mines.splice(i, 1);
    }
  }
}

export function updateFishSpikes(spikes: FishSpike[], ctx: RpgEnemyCtx, deltaMs: number): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (let i = spikes.length - 1; i >= 0; i--) {
    const s = spikes[i];
    s.lifeMs -= deltaMs;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.lifeMs <= 0 || s.hasHit) { spikes.splice(i, 1); continue; }
    if (hitPlayerProjectile(s, ctx, 4)) spikes.splice(i, 1);
  }
}

export function updateFishBolts(bolts: FishBolt[], ctx: RpgEnemyCtx, deltaMs: number): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.lifeMs -= deltaMs;
    const dx = ctx.mote.x - b.x, dy = ctx.mote.y - b.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    b.vx = b.vx * 0.97 + (dx / len) * 0.08;
    b.vy = b.vy * 0.97 + (dy / len) * 0.08;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.lifeMs <= 0 || b.hasHit) { bolts.splice(i, 1); continue; }
    if (hitPlayerProjectile(b, ctx, 4)) bolts.splice(i, 1);
  }
}

export function updateFishDecoys(decoys: FishDecoy[], deltaMs: number): void {
  for (let i = decoys.length - 1; i >= 0; i--) {
    const d = decoys[i];
    d.lifeMs -= deltaMs;
    d.animPhase += deltaMs / 1000;
    if (d.lifeMs <= 0) decoys.splice(i, 1);
  }
}

