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
  SchoolableFish,
} from './rpg-procedural-types';
import type { EliteJellyfishEnemy } from './rpg-jellyfish-elite-types';
import { updateEliteJellyfishEnemies } from './rpg-jellyfish-elite-update';
import {
  PROC_PATROL_SPEED, PROC_PATROL_TURN_MS, PROC_PATROL_DAMPING,
  PROC_CONTACT_RADIUS, PROC_CONTACT_CD_MS,
  RIBBONWORM_SEG_DIST,
  PLANTTURRET_FIRE_CD_MS, PLANTTURRET_FIRE_JITTER,
  PLANT_PROJ_SPEED,
  MOTESWARM_ORBIT_DIST,
  DUSTWISP_SIZE, RIBBONWORM_SIZE, LANTERNMOTH_SIZE, EYESTALK_SIZE, JELLYFISH_SIZE,
  CLOTHGHOST_SIZE, GEARINSECT_SIZE, SPIDERCRAWLER_SIZE, MOTESWARM_SIZE, SHADOWHAND_SIZE,
  RIBBONWORM_COIL_MS, RIBBONWORM_LUNGE_MS, RIBBONWORM_RECOVER_MS, RIBBONWORM_LUNGE_SPEED,
  RIBBONWORM_COIL_RANGE, RIBBONWORM_SEG_CONTACT_CD_MS,
  LANTERNMOTH_CHARGE_MS, LANTERNMOTH_PULSE_MS, LANTERNMOTH_IDLE_MS,
  LANTERNMOTH_PULSE_RADIUS, LANTERNMOTH_PULSE_STRENGTH,
  EYESTALK_CHARGE_MS, EYESTALK_FIRE_MS, EYESTALK_BLINK_MS, EYESTALK_IDLE_MS,
  EYESTALK_BEAM_HALFWIDTH_RAD, EYESTALK_BEAM_RANGE,
  CLOTHGHOST_SOLID_MS, CLOTHGHOST_INTANGIBLE_MS, CLOTHGHOST_WRAP_MS,
  CLOTHGHOST_INTANGIBLE_SPEED_MULT, CLOTHGHOST_WRAP_RANGE,
  PLANTTURRET_BUD_OPEN_MS, PLANTTURRET_BUD_OPEN_HOLD_MS, PLANTTURRET_RECOIL_MS,
  PLANTTURRET_BURST_COUNT, PLANT_PROJ_ARC_SPEED_MULT,
  GEARINSECT_SCUTTLE_MS, GEARINSECT_PAUSE_MS, GEARINSECT_CHARGE_MS, GEARINSECT_RICOCHET_MS,
  GEARINSECT_SCUTTLE_SPEED, GEARINSECT_RICOCHET_SPEED,
  SPIDERCRAWLER_STALK_MS, SPIDERCRAWLER_SIDESTEP_MS, SPIDERCRAWLER_CROUCH_MS,
  SPIDERCRAWLER_POUNCE_MS, SPIDERCRAWLER_RECOVER_MS, SPIDERCRAWLER_POUNCE_SPEED,
  SPIDERCRAWLER_POUNCE_RANGE, SPIDERCRAWLER_FOOT_STRETCH,
  SPIDERCRAWLER_WEB_CD_MS, SPIDERCRAWLER_WEB_ACTIVE_MS, SPIDERCRAWLER_WEB_HALFWIDTH_RAD,
  SPIDERCRAWLER_WEB_RANGE, SPIDERCRAWLER_WEB_SLOW_MULT,
} from './rpg-procedural-constants';
import { makePlantProjectile } from './rpg-procedural-factories';
import { TARGET_FRAME_MS, PLAYER_HIT_RADIUS } from './rpg-constants';
import { segmentIntersectsTopographicTerrain } from './terrain/topographic-terrain';

// Import fish update functions and re-export for backward compat.
import {
  updateSandFishEnemies, updateQuartzFishEnemies, updateRubyFishEnemies,
  updateSunstoneFishEnemies, updateEmeraldFishEnemies, updateSapphireFishEnemies,
  updateAmethystFishEnemies, updateDiamondFishEnemies,
  updateFishMines, updateFishSpikes, updateFishBolts, updateFishDecoys,
} from './rpg-procedural-fish-update';
export * from './rpg-procedural-fish-update';

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
    e.stateTimerMs -= deltaMs;

    const dx = ctx.mote.x - e.x, dy = ctx.mote.y - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    if (e.wormState === 'pursue') {
      e.coilAmount = Math.max(0, e.coilAmount - deltaMs * 0.004);
      pursueStep(e, dt, ctx);
      if (e.stateTimerMs <= 0) {
        if (dist <= RIBBONWORM_COIL_RANGE) {
          e.wormState = 'coil';
          e.stateTimerMs = RIBBONWORM_COIL_MS;
        } else {
          e.stateTimerMs = 300 + Math.random() * 500;
        }
      }
    } else if (e.wormState === 'coil') {
      // Curl in place — telegraph the lunge with an eased-in coil amount.
      e.coilAmount = Math.min(1, e.coilAmount + deltaMs * 0.003);
      e.vx *= Math.pow(PROC_PATROL_DAMPING, dt);
      e.vy *= Math.pow(PROC_PATROL_DAMPING, dt);
      e.x += e.vx * dt; e.y += e.vy * dt;
      ctx.clampEnemyToBounds(e);
      if (e.stateTimerMs <= 0) {
        e.lungeDirX = dx / dist; e.lungeDirY = dy / dist;
        e.wormState = 'lunge';
        e.stateTimerMs = RIBBONWORM_LUNGE_MS;
      }
    } else if (e.wormState === 'lunge') {
      e.coilAmount = Math.max(0, e.coilAmount - deltaMs * 0.006);
      e.vx = e.lungeDirX * RIBBONWORM_LUNGE_SPEED;
      e.vy = e.lungeDirY * RIBBONWORM_LUNGE_SPEED;
      e.x += e.vx * dt; e.y += e.vy * dt;
      ctx.clampEnemyToBounds(e);
      if (e.stateTimerMs <= 0) {
        e.wormState = 'recover';
        e.stateTimerMs = RIBBONWORM_RECOVER_MS;
      }
    } else {
      e.vx *= Math.pow(0.9, dt); e.vy *= Math.pow(0.9, dt);
      e.x += e.vx * dt; e.y += e.vy * dt;
      ctx.clampEnemyToBounds(e);
      if (e.stateTimerMs <= 0) {
        e.wormState = 'pursue';
        e.stateTimerMs = 500 + Math.random() * 700;
      }
    }

    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), RIBBONWORM_SIZE / 2);
    // Pull segments toward the one in front; index 0 is the head.
    // Coiling biases the desired segment spacing tighter, curling the body.
    e.segX[0] = e.x;
    e.segY[0] = e.y;
    const segDist = RIBBONWORM_SEG_DIST * (1 - e.coilAmount * 0.4);
    for (let i = 1; i < e.segX.length; i++) {
      const sx = e.segX[i - 1] - e.segX[i];
      const sy = e.segY[i - 1] - e.segY[i];
      const len = Math.sqrt(sx * sx + sy * sy) || 1;
      if (len > segDist) {
        e.segX[i] += (sx / len) * (len - segDist);
        e.segY[i] += (sy / len) * (len - segDist);
      }
    }
    contactDamage(e, dt, ctx);
    // Body segments deal reduced contact damage independently of the head.
    for (let i = 1; i < e.segX.length; i++) {
      if (e.segContactCdMs[i] > 0) { e.segContactCdMs[i] -= deltaMs; continue; }
      const sdx = ctx.mote.x - e.segX[i], sdy = ctx.mote.y - e.segY[i];
      if (sdx * sdx + sdy * sdy <= (PROC_CONTACT_RADIUS + PLAYER_HIT_RADIUS) ** 2) {
        ctx.dealDamageToPlayer(Math.round(e.atk * 0.6));
        e.segContactCdMs[i] = RIBBONWORM_SEG_CONTACT_CD_MS;
      }
    }
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
    e.hoverPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    e.lureTimerMs -= deltaMs;

    if (e.lureState === 'idle') {
      e.chargeGlow = Math.max(0, e.chargeGlow - deltaMs * 0.003);
      if (e.lureTimerMs <= 0) { e.lureState = 'charge'; e.lureTimerMs = LANTERNMOTH_CHARGE_MS; }
    } else if (e.lureState === 'charge') {
      e.chargeGlow = Math.min(1, e.chargeGlow + deltaMs / LANTERNMOTH_CHARGE_MS);
      if (e.lureTimerMs <= 0) { e.lureState = 'pulse'; e.lureTimerMs = LANTERNMOTH_PULSE_MS; }
    } else {
      e.chargeGlow = 1;
      // Light-lure: gently nudges the player's velocity toward the moth while pulsing.
      const ldx = e.x - ctx.mote.x, ldy = e.y - ctx.mote.y;
      const d2 = ldx * ldx + ldy * ldy;
      if (d2 <= LANTERNMOTH_PULSE_RADIUS * LANTERNMOTH_PULSE_RADIUS) {
        const d = Math.sqrt(d2) || 1;
        ctx.mote.vx += (ldx / d) * LANTERNMOTH_PULSE_STRENGTH * dt;
        ctx.mote.vy += (ldy / d) * LANTERNMOTH_PULSE_STRENGTH * dt;
      }
      if (e.lureTimerMs <= 0) {
        e.lureState = 'idle';
        e.lureTimerMs = LANTERNMOTH_IDLE_MS + Math.random() * 800;
        e.chargeGlow = 0;
      }
    }

    // Weaving sine-wave pursuit with a gentle hover bob; slows while charging/pulsing.
    const dx = ctx.mote.x - e.x, dy = ctx.mote.y - e.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const perpX = -dy / len, perpY = dx / len;
    const weave = Math.sin(e.flapPhase * 3.5) * PROC_PATROL_SPEED * 0.7;
    const slow = e.lureState === 'idle' ? 1 : 0.35;
    e.vx = e.vx * PROC_PATROL_DAMPING + (dx / len) * PROC_PATROL_SPEED * 0.5 * slow * (1 - PROC_PATROL_DAMPING) + perpX * weave * 0.03;
    e.vy = e.vy * PROC_PATROL_DAMPING + (dy / len) * PROC_PATROL_SPEED * 0.5 * slow * (1 - PROC_PATROL_DAMPING) + perpY * weave * 0.03;
    e.x += e.vx * dt;
    e.y += (e.vy + Math.sin(e.hoverPhase * 2.2) * 0.05) * dt;
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
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 2.5);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    e.bellPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    e.stateTimerMs -= deltaMs;
    e.wanderPhase += deltaMs * 0.00035;
    if (e.stateTimerMs <= 0) {
      if (e.movementState === 'drift') { e.movementState = 'compress'; e.stateTimerMs = 330; }
      else if (e.movementState === 'compress') { e.movementState = 'pulse'; e.stateTimerMs = 180; e.targetX = ctx.mote.x + Math.cos(e.wanderPhase) * 45; e.targetY = ctx.mote.y + Math.sin(e.wanderPhase * 0.73) * 45; }
      else if (e.movementState === 'pulse') { e.movementState = 'coast'; e.stateTimerMs = 720; }
      else if (e.movementState === 'coast') { e.movementState = 'recover'; e.stateTimerMs = 420; }
      else { e.movementState = 'drift'; e.stateTimerMs = e.pulseCadenceMs; }
    }
    const desired = Math.atan2(e.targetY - e.y, e.targetX - e.x);
    let turn = Math.atan2(Math.sin(desired - e.facingRad), Math.cos(desired - e.facingRad));
    turn = Math.max(-0.018 * dt, Math.min(0.018 * dt, turn));
    e.facingRad += turn;
    const thrust = e.movementState === 'pulse' ? 0.13 : e.movementState === 'compress' ? 0.025 : e.movementState === 'drift' ? 0.008 : 0;
    e.vx += (Math.cos(e.facingRad) * thrust + Math.cos(e.wanderPhase) * 0.002) * dt;
    e.vy += (Math.sin(e.facingRad) * thrust + Math.sin(e.wanderPhase * 0.73) * 0.002) * dt;
    const drag = e.movementState === 'coast' ? 0.992 : 0.982;
    e.vx *= Math.pow(drag, dt); e.vy *= Math.pow(drag, dt);
    const speed = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
    if (speed > 1.45) { e.vx *= 1.45 / speed; e.vy *= 1.45 / speed; }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    ctx.clampEnemyToBounds(e);
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), JELLYFISH_SIZE / 2);
    for (let t = 0; t < e.tailCount; t++) {
      const base = t * e.segmentsPerTail, spread = (t / (e.tailCount - 1 || 1) - 0.5) * 1.25;
      e.segX[base] = e.x + Math.cos(e.facingRad + Math.PI / 2) * spread * e.bellSize;
      e.segY[base] = e.y + Math.sin(e.facingRad + Math.PI / 2) * spread * e.bellSize;
      e.segPrevX[base] = e.segX[base]; e.segPrevY[base] = e.segY[base];
      for (let s = 1; s < e.segmentsPerTail; s++) {
        const i = base + s, ox = e.segX[i], oy = e.segY[i];
        e.segX[i] += (e.segX[i] - e.segPrevX[i]) * 0.88 * dt;
        e.segY[i] += (e.segY[i] - e.segPrevY[i]) * 0.88 * dt + 0.012 * dt;
        e.segPrevX[i] = ox; e.segPrevY[i] = oy;
      }
      for (let iter = 0; iter < 3; iter++) for (let s = 1; s < e.segmentsPerTail; s++) {
        const i = base + s, p = i - 1, dx = e.segX[i] - e.segX[p], dy = e.segY[i] - e.segY[p], d = Math.sqrt(dx * dx + dy * dy);
        if (!Number.isFinite(d) || d > 200) { e.segX[i] = e.segX[p]; e.segY[i] = e.segY[p]; e.segPrevX[i] = e.segX[i]; e.segPrevY[i] = e.segY[i]; }
        else if (d > e.segLength) { const k = (d - e.segLength) / (d || 1); e.segX[i] -= dx * k; e.segY[i] -= dy * k; }
      }
    }
    if (e.contactCdMs > 0) e.contactCdMs -= deltaMs;
    else {
      const r2 = (PLAYER_HIT_RADIUS + 1.4) ** 2;
      outer: for (let i = 1; i < e.segX.length; i++) {
        const dx = ctx.mote.x - e.segX[i], dy = ctx.mote.y - e.segY[i];
        if (dx * dx + dy * dy <= r2) { ctx.dealDamageToPlayer(e.atk); e.contactCdMs = PROC_CONTACT_CD_MS; break outer; }
      }
      if (e.contactCdMs <= 0) contactDamage(e, dt, ctx);
    }
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
    eliteJellyfishEnemies: EliteJellyfishEnemy[];
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
  updateEliteJellyfishEnemies(arrays.eliteJellyfishEnemies, ctx, deltaMs);
  updateClothGhostEnemies(arrays.clothGhostEnemies, ctx, deltaMs);
  updatePlantTurretEnemies(arrays.plantTurretEnemies, arrays.plantProjectiles, ctx, deltaMs);
  updatePlantProjectiles(arrays.plantProjectiles, ctx, deltaMs);
  updateGearInsectEnemies(arrays.gearInsectEnemies, ctx, deltaMs);
  updateSpiderCrawlerEnemies(arrays.spiderCrawlerEnemies, ctx, deltaMs);
  updateMoteSwarmEnemies(arrays.moteSwarmEnemies, ctx, deltaMs);
  updateShadowHandEnemies(arrays.shadowHandEnemies, ctx, deltaMs);

  // Build a shared school list from all active fish — snapshot their positions
  // before any updates this frame so boids neighbour reads are consistent.
  const school: SchoolableFish[] = [
    ...arrays.sandFishEnemies,
    ...arrays.quartzFishEnemies,
    ...arrays.rubyFishEnemies,
    ...arrays.sunstoneFishEnemies,
    ...arrays.emeraldFishEnemies,
    ...arrays.sapphireFishEnemies,
    ...arrays.amethystFishEnemies,
    ...arrays.diamondFishEnemies,
  ];

  updateSandFishEnemies(arrays.sandFishEnemies, ctx, deltaMs, school);
  updateQuartzFishEnemies(arrays.quartzFishEnemies, ctx, deltaMs, school);
  updateRubyFishEnemies(arrays.rubyFishEnemies, ctx, deltaMs, school);
  updateSunstoneFishEnemies(arrays.sunstoneFishEnemies, arrays.fishMines, ctx, deltaMs, school);
  updateEmeraldFishEnemies(arrays.emeraldFishEnemies, ctx, deltaMs, school);
  updateSapphireFishEnemies(arrays.sapphireFishEnemies, arrays.fishBolts, ctx, deltaMs, school);
  updateAmethystFishEnemies(arrays.amethystFishEnemies, arrays.fishDecoys, ctx, deltaMs, school);
  updateDiamondFishEnemies(arrays.diamondFishEnemies, ctx, deltaMs, school);
  updateFishMines(arrays.fishMines, arrays.fishSpikes, ctx, deltaMs);
  updateFishSpikes(arrays.fishSpikes, ctx, deltaMs);
  updateFishBolts(arrays.fishBolts, ctx, deltaMs);
  updateFishDecoys(arrays.fishDecoys, deltaMs);
}
