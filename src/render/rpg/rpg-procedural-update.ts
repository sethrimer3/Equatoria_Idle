/**
 * rpg-procedural-update.ts — Per-frame update logic for the 11 procedural
 * creature types.
 *
 * All proc enemies use a shared contact-damage model (deal damage when the
 * player mote overlaps within PROC_CONTACT_RADIUS) and a simple patrol/pursue
 * movement model.  Creature-specific fields (segment chains, flap phases, etc.)
 * are advanced here to drive the animation state consumed by rpg-procedural-draw.ts.
 *
 * PlantTurret is the exception: it fires PlantProjectile objects toward the
 * player; this file also owns updatePlantProjectiles.
 */

import type { RpgEnemyCtx } from './rpg-enemy-updates';
import type {
  DustWispEnemy, RibbonWormEnemy, LanternMothEnemy, EyeStalkEnemy,
  JellyfishEnemy, ClothGhostEnemy, PlantTurretEnemy, GearInsectEnemy,
  SpiderCrawlerEnemy, MoteSwarmEnemy, ShadowHandEnemy, PlantProjectile,
} from './rpg-procedural-types';
import {
  PROC_PATROL_SPEED, PROC_PATROL_TURN_MS, PROC_PATROL_DAMPING,
  PROC_CONTACT_RADIUS, PROC_CONTACT_CD_MS,
  RIBBONWORM_SEG_DIST,
  PLANTTURRET_FIRE_CD_MS, PLANTTURRET_FIRE_JITTER,
  PLANT_PROJ_SPEED,
  MOTESWARM_ORBIT_DIST,
} from './rpg-procedural-constants';
import { makePlantProjectile } from './rpg-procedural-factories';
import { TARGET_FRAME_MS, PLAYER_HIT_RADIUS } from './rpg-constants';

// ── Shared patrol helpers ──────────────────────────────────────────────────────

/** Random-walk patrol step shared by all proc enemies that move freely. */
function patrolStep(
  e: { x: number; y: number; vx: number; vy: number; patrolTimerMs?: number },
  dt: number,
  ctx: RpgEnemyCtx,
): void {
  const ent = e as { x: number; y: number; vx: number; vy: number; patrolTimerMs: number };
  if (ent.patrolTimerMs === undefined) return;
  ent.patrolTimerMs -= dt * TARGET_FRAME_MS;
  if (ent.patrolTimerMs <= 0) {
    const angle = Math.random() * Math.PI * 2;
    ent.vx += Math.cos(angle) * PROC_PATROL_SPEED;
    ent.vy += Math.sin(angle) * PROC_PATROL_SPEED;
    ent.patrolTimerMs = PROC_PATROL_TURN_MS * (0.8 + Math.random() * 0.4);
  }
  ent.vx *= PROC_PATROL_DAMPING;
  ent.vy *= PROC_PATROL_DAMPING;
  ent.x += ent.vx * dt;
  ent.y += ent.vy * dt;
  ctx.clampEnemyToBounds(ent);
}

/** Gentle homing step — moves toward the player at PROC_PATROL_SPEED. */
function pursueStep(
  e: { x: number; y: number; vx: number; vy: number },
  dt: number,
  ctx: RpgEnemyCtx,
): void {
  const dx = ctx.mote.x - e.x, dy = ctx.mote.y - e.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  e.vx = e.vx * PROC_PATROL_DAMPING + (dx / len) * PROC_PATROL_SPEED * (1 - PROC_PATROL_DAMPING);
  e.vy = e.vy * PROC_PATROL_DAMPING + (dy / len) * PROC_PATROL_SPEED * (1 - PROC_PATROL_DAMPING);
  e.x += e.vx * dt;
  e.y += e.vy * dt;
  ctx.clampEnemyToBounds(e);
}

/** Check contact damage. Returns true if damage was dealt this frame. */
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

// ── Dust Wisp ──────────────────────────────────────────────────────────────────

export function updateDustWispEnemies(
  enemies: DustWispEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    patrolStep(e as unknown as { x: number; y: number; vx: number; vy: number; patrolTimerMs: number }, dt, ctx);
    contactDamage(e, dt, ctx);
  }
}

// ── Ribbon Worm ────────────────────────────────────────────────────────────────

export function updateRibbonWormEnemies(
  enemies: RibbonWormEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    pursueStep(e, dt, ctx);
    // Pull segments toward the one in front; index 0 is the head.
    e.segX[0] = e.x;
    e.segY[0] = e.y;
    for (let i = 1; i < e.segX.length; i++) {
      const sx = e.segX[i - 1] - e.segX[i];
      const sy = e.segY[i - 1] - e.segY[i];
      const len = Math.sqrt(sx * sx + sy * sy) || 1;
      if (len > RIBBONWORM_SEG_DIST) {
        e.segX[i] += (sx / len) * (len - RIBBONWORM_SEG_DIST);
        e.segY[i] += (sy / len) * (len - RIBBONWORM_SEG_DIST);
      }
    }
    contactDamage(e, dt, ctx);
  }
}

// ── Lantern Moth ───────────────────────────────────────────────────────────────

export function updateLanternMothEnemies(
  enemies: LanternMothEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    e.flapPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    // Weaving sine-wave pursuit
    const dx = ctx.mote.x - e.x, dy = ctx.mote.y - e.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const perpX = -dy / len, perpY = dx / len;
    const weave = Math.sin(e.flapPhase * 3.5) * PROC_PATROL_SPEED * 0.7;
    e.vx = e.vx * PROC_PATROL_DAMPING + (dx / len) * PROC_PATROL_SPEED * 0.5 * (1 - PROC_PATROL_DAMPING) + perpX * weave * 0.03;
    e.vy = e.vy * PROC_PATROL_DAMPING + (dy / len) * PROC_PATROL_SPEED * 0.5 * (1 - PROC_PATROL_DAMPING) + perpY * weave * 0.03;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    ctx.clampEnemyToBounds(e);
    contactDamage(e, dt, ctx);
  }
}

// ── Eye Stalk ──────────────────────────────────────────────────────────────────

export function updateEyeStalkEnemies(
  enemies: EyeStalkEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    e.stalkPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    pursueStep(e, dt, ctx);
    // Pupil tracks player
    const dx = ctx.mote.x - e.x, dy = ctx.mote.y - e.y;
    e.eyeAngle = Math.atan2(dy, dx);
    contactDamage(e, dt, ctx);
  }
}

// ── Floating Jellyfish ─────────────────────────────────────────────────────────

export function updateJellyfishEnemies(
  enemies: JellyfishEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    e.bellPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    // Slow pulsing drift toward player
    const dx = ctx.mote.x - e.x, dy = ctx.mote.y - e.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const pulse = (Math.sin(e.bellPhase * 2.5) * 0.5 + 0.5);
    e.vx = e.vx * PROC_PATROL_DAMPING + (dx / len) * PROC_PATROL_SPEED * 0.35 * pulse * (1 - PROC_PATROL_DAMPING);
    e.vy = e.vy * PROC_PATROL_DAMPING + (dy / len) * PROC_PATROL_SPEED * 0.35 * pulse * (1 - PROC_PATROL_DAMPING);
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    ctx.clampEnemyToBounds(e);
    contactDamage(e, dt, ctx);
  }
}

// ── Cloth Ghost ────────────────────────────────────────────────────────────────

export function updateClothGhostEnemies(
  enemies: ClothGhostEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    e.flutterPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    pursueStep(e, dt, ctx);
    contactDamage(e, dt, ctx);
  }
}

// ── Plant Turret ───────────────────────────────────────────────────────────────

export function updatePlantTurretEnemies(
  enemies: PlantTurretEnemy[],
  projectiles: PlantProjectile[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    e.stemPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    // Turret stays anchored to its root position
    e.x = e.rootX;
    e.y = e.rootY;
    e.vx = 0; e.vy = 0;
    // Fire countdown
    e.fireTimerMs -= deltaMs;
    if (e.fireTimerMs <= 0) {
      const dx = ctx.mote.x - e.x, dy = ctx.mote.y - e.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      projectiles.push(makePlantProjectile(
        e.x, e.y,
        (dx / len) * PLANT_PROJ_SPEED,
        (dy / len) * PLANT_PROJ_SPEED,
      ));
      e.fireTimerMs = PLANTTURRET_FIRE_CD_MS + Math.random() * PLANTTURRET_FIRE_JITTER;
    }
    contactDamage(e, dt, ctx);
  }
}

export function updatePlantProjectiles(
  projectiles: PlantProjectile[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const p of projectiles) {
    p.lifeMs -= deltaMs;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.hasHitPlayer) continue;
    const dx = ctx.mote.x - p.x, dy = ctx.mote.y - p.y;
    if (dx * dx + dy * dy <= (PLAYER_HIT_RADIUS + 3) ** 2) {
      ctx.dealDamageToPlayerKnockback(p.atk, p.vx, p.vy);
      p.hasHitPlayer = true;
      p.hp = 0;
    }
  }
}

// ── Gear Insect ────────────────────────────────────────────────────────────────

export function updateGearInsectEnemies(
  enemies: GearInsectEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    e.gearAngle += (deltaMs / 1000) * 3.5;
    e.legPhase  += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    pursueStep(e, dt, ctx);
    contactDamage(e, dt, ctx);
  }
}

// ── Spider Crawler ─────────────────────────────────────────────────────────────

export function updateSpiderCrawlerEnemies(
  enemies: SpiderCrawlerEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    e.legPhase  += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    pursueStep(e, dt, ctx);
    contactDamage(e, dt, ctx);
  }
}

// ── Magnetic Mote Swarm ────────────────────────────────────────────────────────

export function updateMoteSwarmEnemies(
  enemies: MoteSwarmEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase  += deltaMs / 1000;
    e.swarmAngle += (deltaMs / 1000) * 2.0;
    for (let i = 0; i < e.moteAngles.length; i++) {
      e.moteAngles[i] += (deltaMs / 1000) * (1.5 + i * 0.3);
    }
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    pursueStep(e, dt, ctx);
    // Contact damage from the swarm core
    contactDamage(e, dt, ctx);
    // Also contact damage from each orbiting mote
    for (let i = 0; i < e.moteAngles.length; i++) {
      const mx = e.x + Math.cos(e.moteAngles[i]) * MOTESWARM_ORBIT_DIST;
      const my = e.y + Math.sin(e.moteAngles[i]) * MOTESWARM_ORBIT_DIST;
      const dx = ctx.mote.x - mx, dy = ctx.mote.y - my;
      if (e.contactCdMs <= 0 && dx * dx + dy * dy <= (4 + PLAYER_HIT_RADIUS) ** 2) {
        ctx.dealDamageToPlayer(e.atk);
        e.contactCdMs = PROC_CONTACT_CD_MS;
        break;
      }
    }
  }
}

// ── Shadow Hand ────────────────────────────────────────────────────────────────

export function updateShadowHandEnemies(
  enemies: ShadowHandEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase   += deltaMs / 1000;
    e.graspPhase  += (deltaMs / 1000) * 0.8;
    e.reachFraction = (Math.sin(e.graspPhase) * 0.5 + 0.5);
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    pursueStep(e, dt, ctx);
    contactDamage(e, dt, ctx);
  }
}

/**
 * Convenience umbrella: updates all proc creature arrays in one call.
 * Called from rpg-render-update.ts runRpgUpdate.
 */
export function updateProceduralEnemies(
  arrays: {
    dustWispEnemies: DustWispEnemy[];
    ribbonWormEnemies: RibbonWormEnemy[];
    lanternMothEnemies: LanternMothEnemy[];
    eyeStalkEnemies: EyeStalkEnemy[];
    jellyfishEnemies: JellyfishEnemy[];
    clothGhostEnemies: ClothGhostEnemy[];
    plantTurretEnemies: PlantTurretEnemy[];
    gearInsectEnemies: GearInsectEnemy[];
    spiderCrawlerEnemies: SpiderCrawlerEnemy[];
    moteSwarmEnemies: MoteSwarmEnemy[];
    shadowHandEnemies: ShadowHandEnemy[];
    plantProjectiles: PlantProjectile[];
  },
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  updateDustWispEnemies(arrays.dustWispEnemies, ctx, deltaMs);
  updateRibbonWormEnemies(arrays.ribbonWormEnemies, ctx, deltaMs);
  updateLanternMothEnemies(arrays.lanternMothEnemies, ctx, deltaMs);
  updateEyeStalkEnemies(arrays.eyeStalkEnemies, ctx, deltaMs);
  updateJellyfishEnemies(arrays.jellyfishEnemies, ctx, deltaMs);
  updateClothGhostEnemies(arrays.clothGhostEnemies, ctx, deltaMs);
  updatePlantTurretEnemies(arrays.plantTurretEnemies, arrays.plantProjectiles, ctx, deltaMs);
  updatePlantProjectiles(arrays.plantProjectiles, ctx, deltaMs);
  updateGearInsectEnemies(arrays.gearInsectEnemies, ctx, deltaMs);
  updateSpiderCrawlerEnemies(arrays.spiderCrawlerEnemies, ctx, deltaMs);
  updateMoteSwarmEnemies(arrays.moteSwarmEnemies, ctx, deltaMs);
  updateShadowHandEnemies(arrays.shadowHandEnemies, ctx, deltaMs);
}
