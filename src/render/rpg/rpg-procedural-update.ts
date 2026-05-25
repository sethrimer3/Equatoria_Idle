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

import { type RpgEnemyCtx, applyEnemyTerrainPushOut } from './rpg-enemy-updates';
import type {
  DustWispEnemy, RibbonWormEnemy, LanternMothEnemy, EyeStalkEnemy,
  JellyfishEnemy, ClothGhostEnemy, PlantTurretEnemy, GearInsectEnemy,
  SpiderCrawlerEnemy, MoteSwarmEnemy, ShadowHandEnemy, PlantProjectile,
  SandFishEnemy, QuartzFishEnemy, RubyFishEnemy, SunstoneFishEnemy,
  EmeraldFishEnemy, SapphireFishEnemy, AmethystFishEnemy, DiamondFishEnemy,
  FishMine, FishSpike, FishBolt, FishDecoy,
} from './rpg-procedural-types';
import {
  PROC_PATROL_SPEED, PROC_PATROL_TURN_MS, PROC_PATROL_DAMPING,
  PROC_CONTACT_RADIUS, PROC_CONTACT_CD_MS,
  RIBBONWORM_SEG_DIST,
  PLANTTURRET_FIRE_CD_MS, PLANTTURRET_FIRE_JITTER,
  PLANT_PROJ_SPEED,
  MOTESWARM_ORBIT_DIST,
  DUSTWISP_SIZE, RIBBONWORM_SIZE, LANTERNMOTH_SIZE, EYESTALK_SIZE, JELLYFISH_SIZE,
  CLOTHGHOST_SIZE, GEARINSECT_SIZE, SPIDERCRAWLER_SIZE, MOTESWARM_SIZE, SHADOWHAND_SIZE,
  SANDFISH_SIZE, QUARTZFISH_SIZE, RUBYFISH_SIZE, SUNSTONEFISH_SIZE,
  EMERALDFISH_SIZE, EMERALDFISH_MINI_SIZE, SAPPHIREFISH_SIZE, AMETHYSTFISH_SIZE, DIAMONDFISH_SIZE,
  SANDFISH_LUNGE_CD_MS, RUBYFISH_DASH_WINDUP_MS, RUBYFISH_DASH_MS, RUBYFISH_RECOVERY_MS,
  SUNSTONEFISH_MINE_CD_MS, SUNSTONEFISH_MINE_COUNT, SAPPHIREFISH_BOLT_CD_MS,
  AMETHYSTFISH_TELEPORT_CD_MS, DIAMONDFISH_ARMOR_ON_MS, DIAMONDFISH_ARMOR_OFF_MS,
} from './rpg-procedural-constants';
import { makePlantProjectile, makeFishMine, makeFishSpike, makeFishBolt, makeFishDecoy } from './rpg-procedural-factories';
import { TARGET_FRAME_MS, PLAYER_HIT_RADIUS } from './rpg-constants';
import { segmentIntersectsTopographicTerrain } from './terrain/topographic-terrain';

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
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), DUSTWISP_SIZE / 2);
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
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), RIBBONWORM_SIZE / 2);
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
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), LANTERNMOTH_SIZE / 2);
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
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), EYESTALK_SIZE / 2);
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
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), JELLYFISH_SIZE / 2);
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
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), CLOTHGHOST_SIZE / 2);
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
  const terrain = ctx.getTerrainState();
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.lifeMs -= deltaMs;
    if (p.lifeMs <= 0 || p.hp <= 0) { projectiles.splice(i, 1); continue; }
    const prevX = p.x, prevY = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (terrain && segmentIntersectsTopographicTerrain(terrain, prevX, prevY, p.x, p.y)) {
      projectiles.splice(i, 1); continue;
    }
    if (p.hasHitPlayer) continue;
    const dx = ctx.mote.x - p.x, dy = ctx.mote.y - p.y;
    if (dx * dx + dy * dy <= (PLAYER_HIT_RADIUS + 3) ** 2) {
      ctx.dealDamageToPlayerKnockback(p.atk, p.vx, p.vy);
      p.hasHitPlayer = true;
      p.hp = 0;
      projectiles.splice(i, 1);
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
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), GEARINSECT_SIZE / 2);
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
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), SPIDERCRAWLER_SIZE / 2);
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
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), MOTESWARM_SIZE / 2);
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
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), SHADOWHAND_SIZE / 2);
    contactDamage(e, dt, ctx);
  }
}


// ── Fish helpers ────────────────────────────────────────────────────────────────

type SwimEntity = {
  x: number; y: number; vx: number; vy: number;
  swimAngle: number; turnPhase: number; animPhase: number;
};

function swimStep(e: SwimEntity, dt: number, ctx: RpgEnemyCtx, speedMul = 1): void {
  // Advance wander phase
  e.turnPhase += dt * 0.04;

  // Target angle toward player plus a small sinusoidal wander offset
  const dx = ctx.mote.x - e.x;
  const dy = ctx.mote.y - e.y;
  const targetAngle = Math.atan2(dy, dx) + Math.sin(e.turnPhase) * 0.35;

  // Smooth turn toward target — clamp max turn per frame for fish-like steering
  let delta = targetAngle - e.swimAngle;
  while (delta > Math.PI)  delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const maxTurn = 0.10 * dt;
  e.swimAngle += Math.max(-maxTurn, Math.min(maxTurn, delta * 0.14));

  // Tail-kick thrust pulse: fish accelerate more strongly on the power-stroke
  const kick  = 0.65 + 0.35 * Math.max(0, Math.sin(e.animPhase * 2.8));
  const speed = PROC_PATROL_SPEED * 0.85 * speedMul;

  e.vx += Math.cos(e.swimAngle) * speed * kick * 0.09;
  e.vy += Math.sin(e.swimAngle) * speed * kick * 0.09;

  // Smooth velocity damping
  e.vx *= 0.91;
  e.vy *= 0.91;

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

export function updateSandFishEnemies(enemies: SandFishEnemy[], ctx: RpgEnemyCtx, deltaMs: number): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    e.lungeTimerMs -= deltaMs;
    swimStep(e, dt, ctx, 1.15);
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

export function updateQuartzFishEnemies(enemies: QuartzFishEnemy[], ctx: RpgEnemyCtx, deltaMs: number): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    e.shieldBroken = e.shieldHp <= 0;
    swimStep(e, dt, ctx, e.shieldBroken ? 1.05 : 0.85);
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), QUARTZFISH_SIZE / 2);
    contactDamage(e, dt, ctx);
  }
}

export function updateRubyFishEnemies(enemies: RubyFishEnemy[], ctx: RpgEnemyCtx, deltaMs: number): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    e.dashTimerMs -= deltaMs;
    if (e.dashState === 'idle') {
      swimStep(e, dt, ctx, 1.1);
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
      swimStep(e, dt, ctx, 0.75);
      if (e.dashTimerMs <= 0) {
        e.dashState = 'idle';
        e.dashTimerMs = RUBYFISH_DASH_WINDUP_MS + RUBYFISH_RECOVERY_MS;
      }
    }
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), RUBYFISH_SIZE / 2);
    contactDamage(e, dt, ctx);
  }
}

export function updateSunstoneFishEnemies(enemies: SunstoneFishEnemy[], mines: FishMine[], ctx: RpgEnemyCtx, deltaMs: number): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    e.mineTimerMs -= deltaMs;
    swimStep(e, dt, ctx, 0.95);
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

export function updateEmeraldFishEnemies(enemies: EmeraldFishEnemy[], ctx: RpgEnemyCtx, deltaMs: number): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    swimStep(e, dt, ctx, e.isMini ? 1.25 : 1.0);
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), (e.isMini ? EMERALDFISH_MINI_SIZE : EMERALDFISH_SIZE) / 2);
    contactDamage(e, dt, ctx);
  }
}

export function updateSapphireFishEnemies(enemies: SapphireFishEnemy[], bolts: FishBolt[], ctx: RpgEnemyCtx, deltaMs: number): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    e.boltTimerMs -= deltaMs;
    swimStep(e, dt, ctx, 0.9);
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

export function updateAmethystFishEnemies(enemies: AmethystFishEnemy[], decoys: FishDecoy[], ctx: RpgEnemyCtx, deltaMs: number): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    e.teleportCdMs -= deltaMs;
    swimStep(e, dt, ctx, 1.0);
    if (e.teleportCdMs <= 0) {
      decoys.push(makeFishDecoy(e.x, e.y, e.swimAngle, e.animPhase));
      const angle = Math.random() * Math.PI * 2;
      const dist = 48 + Math.random() * 28;
      e.x = Math.max(10, Math.min(ctx.dim.w - 10, ctx.mote.x + Math.cos(angle) * dist));
      e.y = Math.max(10, Math.min(ctx.dim.h - 10, ctx.mote.y + Math.sin(angle) * dist));
      e.teleportCdMs = AMETHYSTFISH_TELEPORT_CD_MS;
    }
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), AMETHYSTFISH_SIZE / 2);
    contactDamage(e, dt, ctx);
  }
}

export function updateDiamondFishEnemies(enemies: DiamondFishEnemy[], ctx: RpgEnemyCtx, deltaMs: number): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    e.armorTimerMs -= deltaMs;
    if (e.armorTimerMs <= 0) {
      e.armorActive = !e.armorActive;
      e.armorTimerMs = e.armorActive ? DIAMONDFISH_ARMOR_ON_MS : DIAMONDFISH_ARMOR_OFF_MS;
    }
    swimStep(e, dt, ctx, e.armorActive ? 0.8 : 1.05);
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
    sandFishEnemies: SandFishEnemy[];
    quartzFishEnemies: QuartzFishEnemy[];
    rubyFishEnemies: RubyFishEnemy[];
    sunstoneFishEnemies: SunstoneFishEnemy[];
    emeraldFishEnemies: EmeraldFishEnemy[];
    sapphireFishEnemies: SapphireFishEnemy[];
    amethystFishEnemies: AmethystFishEnemy[];
    diamondFishEnemies: DiamondFishEnemy[];
    plantProjectiles: PlantProjectile[];
    fishMines: FishMine[];
    fishSpikes: FishSpike[];
    fishBolts: FishBolt[];
    fishDecoys: FishDecoy[];
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
  updateSandFishEnemies(arrays.sandFishEnemies, ctx, deltaMs);
  updateQuartzFishEnemies(arrays.quartzFishEnemies, ctx, deltaMs);
  updateRubyFishEnemies(arrays.rubyFishEnemies, ctx, deltaMs);
  updateSunstoneFishEnemies(arrays.sunstoneFishEnemies, arrays.fishMines, ctx, deltaMs);
  updateEmeraldFishEnemies(arrays.emeraldFishEnemies, ctx, deltaMs);
  updateSapphireFishEnemies(arrays.sapphireFishEnemies, arrays.fishBolts, ctx, deltaMs);
  updateAmethystFishEnemies(arrays.amethystFishEnemies, arrays.fishDecoys, ctx, deltaMs);
  updateDiamondFishEnemies(arrays.diamondFishEnemies, ctx, deltaMs);
  updateFishMines(arrays.fishMines, arrays.fishSpikes, ctx, deltaMs);
  updateFishSpikes(arrays.fishSpikes, ctx, deltaMs);
  updateFishBolts(arrays.fishBolts, ctx, deltaMs);
  updateFishDecoys(arrays.fishDecoys, deltaMs);
}
