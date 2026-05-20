/**
 * rpg-weapon-sword-combo.ts — Per-frame combo state machine for the diamond sword / sand blade.
 *
 * Extracted from rpg-weapon-sword.ts to keep that file focused on interface definitions
 * and factory setup. This module owns all phase logic:
 *
 *   idle → swing → combo_window → spin_combo
 *
 * Internal helpers (buildSwordCombo, angleInArc, swordHitInArc, spawnSwordBeam)
 * and SwordWeaponCtx are defined in rpg-weapon-sword-combo-helpers.ts.
 * Only updateSwordComboForWeapon is consumed by the factory in
 * rpg-weapon-sword.ts.
 *
 * SwordWeaponCtx is re-exported here for backwards compatibility with existing importers.
 */

import { getScaledWeaponDamage, getScaledWeaponCooldown } from '../../sim/rpg/rpg-state';
import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import {
  SWORD_SWING_MS, SWORD_PRISMATIC_COLORS, SAND_BLADE_COLORS,
  SWORD_SHARD_COUNT, SWORD_HINGE_SPRING_K, SWORD_HINGE_DAMPING,
  SWORD_SHARD_FOLLOW_BASE, SWORD_SHARD_FOLLOW_DECAY,
  SWORD_FLUID_DRAG_STR, SWORD_FLUID_SWIPE_STR, SWORD_DEFAULT_COOLDOWN_MS,
  SWORD_COMBO_MIN_SWIPE_DELAY_MS, SWORD_SWIPE_VISUAL_MS,
  SWORD_COMBO_THRESHOLD, SWORD_COMBO_WINDOW_MS,
  SWORD_COMBO_SPIN_TURNS, SWORD_COMBO_SPIN_MS, SWORD_COMBO_DAMAGE_MULT,
} from './rpg-weapon-constants';
import {
  FLUID_VEL_FRAME_TO_PX_S, FLUID_PROJECTILE_STRENGTH,
  BASE_ATTACK_TIMER_KEY,
} from './rpg-constants';
import { getSwordLength, getShardDistances, wrapAngleDiff } from './rpg-helpers';
import type { SwordComboState } from './rpg-types';
import {
  type SwordWeaponCtx,
  SPIN_TICK_THRESHOLDS,
  buildSwordCombo,
  swordHitInArc,
} from './rpg-weapon-sword-combo-helpers';

// Re-export SwordWeaponCtx for existing importers (rpg-weapon-sword.ts etc.)
export type { SwordWeaponCtx };

// ── Main export: per-frame combo state machine ────────────────────────────

/**
 * Advance the sword combo state machine for one weapon by one frame.
 * Initialises the combo state lazily on first call.
 * Called from the SwordWeaponHandle returned by createSwordWeaponSystem().
 */
export function updateSwordComboForWeapon(
  swordComboStates: Map<string, SwordComboState>,
  ctx: SwordWeaponCtx,
  weaponId: string,
  deltaMs: number,
): void {
  if (!swordComboStates.has(weaponId)) swordComboStates.set(weaponId, buildSwordCombo(weaponId, ctx));
  const state      = swordComboStates.get(weaponId)!;
  const weaponDef  = WEAPON_BY_ID.get(weaponId);
  const tier       = ctx.rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
  const rawDamage  = weaponDef
    ? getScaledWeaponDamage(weaponDef.stats.damage, tier, ctx.playerStats.atk)
    : ctx.playerStats.atk;
  const swordLength    = getSwordLength(tier);
  const fullCooldownMs = getScaledWeaponCooldown(weaponDef?.stats.cooldownMs ?? SWORD_DEFAULT_COOLDOWN_MS, tier);
  const nowMs = Date.now();
  const { mote, fluid } = ctx;
  const {
    enemies, sapphireEnemies, emeraldEnemies, amberEnemies,
    voidEnemies, quartzEnemies, rubyEnemies, sunstoneEnemies,
    citrineEnemies, ioliteEnemies, amethystEnemies, diamondEnemies,
    nullstoneEnemies, fracterylEnemies, eigensteinEnemies, eliteEnemies,
    alivenGroups,
    removeDeadEnemies, checkWaveCompletion,
  } = ctx;

  // ── 1. Update hinge physics: spring pulls toward right-hand rest angle. ──
  const restAngle = ctx.playerAimAngle + Math.PI / 2;
  const angleDiff = wrapAngleDiff(restAngle - state.swordAngle);
  state.swordAngularVel += angleDiff * SWORD_HINGE_SPRING_K;
  state.swordAngularVel *= SWORD_HINGE_DAMPING;
  if (state.phase !== 'swing' && state.phase !== 'spin_combo' && state.phase !== 'combo_window') {
    state.swordAngle += state.swordAngularVel;
  }

  // ── 2. Update shard chain (each shard lags the previous). ────────────────
  const followBase  = SWORD_SHARD_FOLLOW_BASE;
  const followDecay = SWORD_SHARD_FOLLOW_DECAY;
  if (state.phase !== 'swing' && state.phase !== 'spin_combo') {
    const d0 = wrapAngleDiff(state.swordAngle - state.shardAngles[0]);
    state.shardAngles[0] += d0 * followBase;
    for (let i = 1; i < SWORD_SHARD_COUNT; i++) {
      const followRate = Math.max(0.08, followBase - i * followDecay);
      const di = wrapAngleDiff(state.shardAngles[i - 1] - state.shardAngles[i]);
      state.shardAngles[i] += di * followRate;
    }
  } else {
    // During swing/spin: drive the blade through the arc; shards follow with chain lag.
    let driveAngle: number;
    if (state.phase === 'swing') {
      const t = Math.min(1, state.phaseMs / SWORD_SWING_MS);
      if (state.swingIsRightToLeft) {
        driveAngle = state.swipeArcStart + (state.swipeArcEnd - state.swipeArcStart) * t;
      } else {
        driveAngle = state.swipeArcEnd + (state.swipeArcStart - state.swipeArcEnd) * t;
      }
    } else {
      driveAngle = state.spinComboAngle;
    }
    state.swordAngle = driveAngle;
    state.shardAngles[0] = driveAngle;
    for (let i = 1; i < SWORD_SHARD_COUNT; i++) {
      const followRate = Math.max(0.08, followBase - i * followDecay);
      const di = wrapAngleDiff(state.shardAngles[i - 1] - state.shardAngles[i]);
      state.shardAngles[i] += di * followRate;
    }
  }

  // ── 3. Add fluid forces from sword drag (each shard per frame). ──────────
  const isSandBlade = weaponId === BASE_ATTACK_TIMER_KEY;
  const comboLength = swordLength;
  if (state.phase !== 'combo_window') {
    const dists = getShardDistances(comboLength);
    const colorPaletteDrag = isSandBlade ? SAND_BLADE_COLORS : SWORD_PRISMATIC_COLORS;
    const colIdx = Math.floor(nowMs / 60) % colorPaletteDrag.length;
    const hexColor = colorPaletteDrag[colIdx];
    let pr = parseInt(hexColor.slice(1, 3), 16);
    let pg = parseInt(hexColor.slice(3, 5), 16);
    let pb = parseInt(hexColor.slice(5, 7), 16);
    if (isSandBlade) {
      const bright = 0.7 + 0.3 * (1 + Math.sin(nowMs * 0.007));
      pr = Math.min(255, Math.round(pr * bright));
      pg = Math.min(255, Math.round(pg * bright));
      pb = Math.min(255, Math.round(pb * bright));
    }
    for (let i = 0; i < SWORD_SHARD_COUNT; i++) {
      const sx = mote.x + Math.cos(state.shardAngles[i]) * dists[i];
      const sy = mote.y + Math.sin(state.shardAngles[i]) * dists[i];
      const perpX = -Math.sin(state.shardAngles[i]);
      const perpY =  Math.cos(state.shardAngles[i]);
      fluid.addForce({
        x: sx, y: sy,
        vx: perpX * SWORD_FLUID_DRAG_STR * FLUID_VEL_FRAME_TO_PX_S,
        vy: perpY * SWORD_FLUID_DRAG_STR * FLUID_VEL_FRAME_TO_PX_S,
        r: pr, g: pg, b: pb,
        strength: FLUID_PROJECTILE_STRENGTH * (state.phase === 'spin_combo' ? 1.5 : 0.5),
      });
    }
  }

  // ── 4. Phase state machine. ───────────────────────────────────────────────
  state.phaseMs += deltaMs;

  if (state.phase === 'idle') {
    if (state.phaseMs >= state.cooldownMs) {
      // Trigger a swing if any enemy is within sword range.
      const rangeSq = swordLength * swordLength;
      let anyInRange = false;
      const checkEnemy = (e: { x: number; y: number }) => {
        if (anyInRange) return;
        const dx = e.x - mote.x, dy = e.y - mote.y;
        if (dx * dx + dy * dy <= rangeSq) anyInRange = true;
      };
      for (const e of enemies)           checkEnemy(e);
      for (const e of sapphireEnemies)   checkEnemy(e);
      for (const e of emeraldEnemies)    checkEnemy(e);
      for (const e of amberEnemies)      checkEnemy(e);
      for (const e of voidEnemies)       checkEnemy(e);
      for (const e of quartzEnemies)     checkEnemy(e);
      for (const e of rubyEnemies)       checkEnemy(e);
      for (const e of sunstoneEnemies)   checkEnemy(e);
      for (const e of citrineEnemies)    checkEnemy(e);
      for (const e of ioliteEnemies)     checkEnemy(e);
      for (const e of amethystEnemies)   checkEnemy(e);
      for (const e of diamondEnemies)    checkEnemy(e);
      for (const e of nullstoneEnemies)  checkEnemy(e);
      for (const e of fracterylEnemies)  checkEnemy(e);
      for (const e of eigensteinEnemies) checkEnemy(e);
      for (const e of eliteEnemies) { if (!e.isInvuln) checkEnemy(e); }
      if (ctx.bossEnemy) checkEnemy(ctx.bossEnemy);
      for (const g of alivenGroups) { for (const p of g.particles) { if (p.isAlive) checkEnemy(p); } }

      if (anyInRange) {
        // Find the nearest enemy angle to center the 180° arc on.
        let bestDistSq = Infinity;
        let bestAngle  = 0;
        const findNearest = (e: { x: number; y: number }) => {
          const dx = e.x - mote.x, dy = e.y - mote.y;
          const d = dx * dx + dy * dy;
          if (d < bestDistSq) { bestDistSq = d; bestAngle = Math.atan2(dy, dx); }
        };
        for (const e of enemies)           findNearest(e);
        for (const e of sapphireEnemies)   findNearest(e);
        for (const e of emeraldEnemies)    findNearest(e);
        for (const e of amberEnemies)      findNearest(e);
        for (const e of voidEnemies)       findNearest(e);
        for (const e of quartzEnemies)     findNearest(e);
        for (const e of rubyEnemies)       findNearest(e);
        for (const e of sunstoneEnemies)   findNearest(e);
        for (const e of citrineEnemies)    findNearest(e);
        for (const e of ioliteEnemies)     findNearest(e);
        for (const e of amethystEnemies)   findNearest(e);
        for (const e of diamondEnemies)    findNearest(e);
        for (const e of nullstoneEnemies)  findNearest(e);
        for (const e of fracterylEnemies)  findNearest(e);
        for (const e of eigensteinEnemies) findNearest(e);
        for (const e of eliteEnemies) { if (!e.isInvuln) findNearest(e); }
        if (ctx.bossEnemy) findNearest(ctx.bossEnemy);
        for (const g of alivenGroups) { for (const p of g.particles) { if (p.isAlive) findNearest(p); } }

        state.swipeArcStart = bestAngle - Math.PI / 2;
        state.swipeArcEnd   = bestAngle + Math.PI / 2;
        state.phase = 'swing'; state.phaseMs = 0; state.hitThisSwing.clear();
        state.swipeEffects.push({
          x: mote.x, y: mote.y,
          arcStart: state.swipeArcStart, arcEnd: state.swipeArcEnd,
          swordLength,
          timerMs: SWORD_SWIPE_VISUAL_MS,
          maxTimerMs: SWORD_SWIPE_VISUAL_MS,
        });
      }
    }
  } else if (state.phase === 'swing') {
    // Hit detection during the swing (full 180° arc).
    swordHitInArc(state, ctx, swordLength, rawDamage, state.swipeArcStart, state.swipeArcEnd, weaponId);

    // Add stronger crescent fluid forces during the swipe.
    const numSamples = 6;
    const colorPaletteSwing = isSandBlade ? SAND_BLADE_COLORS : SWORD_PRISMATIC_COLORS;
    const colIdx2 = Math.floor(nowMs / 60) % colorPaletteSwing.length;
    const hexC2 = colorPaletteSwing[colIdx2];
    let sr = parseInt(hexC2.slice(1, 3), 16);
    let sg = parseInt(hexC2.slice(3, 5), 16);
    let sb = parseInt(hexC2.slice(5, 7), 16);
    if (isSandBlade) {
      const bright = 0.7 + 0.3 * (1 + Math.sin(nowMs * 0.007 + 1.0));
      sr = Math.min(255, Math.round(sr * bright));
      sg = Math.min(255, Math.round(sg * bright));
      sb = Math.min(255, Math.round(sb * bright));
    }
    const t2 = Math.min(1, state.phaseMs / SWORD_SWING_MS);
    const arcSpan = state.swipeArcEnd - state.swipeArcStart;
    for (let s = 0; s < numSamples; s++) {
      const frac = s / (numSamples - 1);
      const angle = state.swipeArcStart + arcSpan * frac;
      fluid.addForce({
        x: mote.x + Math.cos(angle) * swordLength,
        y: mote.y + Math.sin(angle) * swordLength,
        vx: Math.cos(angle) * SWORD_FLUID_SWIPE_STR * FLUID_VEL_FRAME_TO_PX_S * t2,
        vy: Math.sin(angle) * SWORD_FLUID_SWIPE_STR * FLUID_VEL_FRAME_TO_PX_S * t2,
        r: sr, g: sg, b: sb,
        strength: FLUID_PROJECTILE_STRENGTH * 2.0,
      });
    }

    if (state.phaseMs >= SWORD_SWING_MS) {
      // Flip swing direction for next slash and count this completed slash.
      state.swingIsRightToLeft = !state.swingIsRightToLeft;
      state.comboCount += 1;
      state.hitThisSwing.clear();
      removeDeadEnemies(); checkWaveCompletion();

      if (state.comboCount >= SWORD_COMBO_THRESHOLD) {
        // 4 slashes complete — enter the 360° spinning 5th attack.
        const spinStartAngle = state.swipeArcStart;
        state.phase = 'spin_combo';
        state.phaseMs = 0;
        state.spinComboAngle = spinStartAngle;
        state.swipeArcEnd = spinStartAngle;
        state.spinComboDamageTicks = 0;
        state.hitThisSwing.clear();
      } else {
        // Enter the 1-second combo window.
        state.phase = 'combo_window';
        state.phaseMs = 0;
        state.swordAngularVel = 0;
      }
    }
  } else if (state.phase === 'spin_combo') {
    // ── Spin combo: 3 rapid full rotations, damage at beginning/middle/end ──
    const spinProgress = state.phaseMs / SWORD_COMBO_SPIN_MS;
    const totalSpin = SWORD_COMBO_SPIN_TURNS * Math.PI * 2;
    state.spinComboAngle = state.swipeArcEnd + totalSpin * Math.min(spinProgress, 1);

    for (let tick = state.spinComboDamageTicks; tick < SPIN_TICK_THRESHOLDS.length; tick++) {
      if (spinProgress < SPIN_TICK_THRESHOLDS[tick]) break;
      state.spinComboDamageTicks = tick + 1;
      state.hitThisSwing.clear();
      const comboRange = swordLength;
      swordHitInArc(state, ctx, comboRange, rawDamage * SWORD_COMBO_DAMAGE_MULT, 0, Math.PI * 2, weaponId);
      const numS = 12;
      const colorPaletteSpin = isSandBlade ? SAND_BLADE_COLORS : SWORD_PRISMATIC_COLORS;
      const hexC3 = colorPaletteSpin[Math.floor(nowMs / 40) % colorPaletteSpin.length];
      let crr = parseInt(hexC3.slice(1, 3), 16);
      let crg = parseInt(hexC3.slice(3, 5), 16);
      let crb = parseInt(hexC3.slice(5, 7), 16);
      if (isSandBlade) {
        const bright = 0.7 + 0.3 * (1 + Math.sin(nowMs * 0.011));
        crr = Math.min(255, Math.round(crr * bright));
        crg = Math.min(255, Math.round(crg * bright));
        crb = Math.min(255, Math.round(crb * bright));
      }
      for (let s = 0; s < numS; s++) {
        const a = (s / numS) * Math.PI * 2;
        fluid.addForce({
          x: mote.x + Math.cos(a) * comboRange,
          y: mote.y + Math.sin(a) * comboRange,
          vx: Math.cos(a) * SWORD_FLUID_SWIPE_STR * 2.0 * FLUID_VEL_FRAME_TO_PX_S,
          vy: Math.sin(a) * SWORD_FLUID_SWIPE_STR * 2.0 * FLUID_VEL_FRAME_TO_PX_S,
          r: crr, g: crg, b: crb,
          strength: FLUID_PROJECTILE_STRENGTH * 4.0,
        });
      }
    }

    if (state.phaseMs >= SWORD_COMBO_SPIN_MS) {
      // Snap sword back to right-hand rest position and reset combo.
      const restAngle2 = ctx.playerAimAngle + Math.PI / 2;
      state.swordAngle = restAngle2;
      for (let i = 0; i < SWORD_SHARD_COUNT; i++) state.shardAngles[i] = restAngle2;
      state.swingIsRightToLeft = true;
      state.comboCount = 0;
      state.phase = 'idle'; state.phaseMs = 0;
      state.cooldownMs = fullCooldownMs;
      state.hitThisSwing.clear();
      removeDeadEnemies(); checkWaveCompletion();
    }
  } else if (state.phase === 'combo_window') {
    // ── Combo window: immediately start next slash if enemy in range; break combo on timeout ──
    const rangeSq = swordLength * swordLength;
    let anyInRange = false;
    const checkCombo = (e: { x: number; y: number }) => {
      if (anyInRange) return;
      const dx = e.x - mote.x, dy = e.y - mote.y;
      if (dx * dx + dy * dy <= rangeSq) anyInRange = true;
    };
    for (const e of enemies)           checkCombo(e);
    for (const e of sapphireEnemies)   checkCombo(e);
    for (const e of emeraldEnemies)    checkCombo(e);
    for (const e of amberEnemies)      checkCombo(e);
    for (const e of voidEnemies)       checkCombo(e);
    for (const e of quartzEnemies)     checkCombo(e);
    for (const e of rubyEnemies)       checkCombo(e);
    for (const e of sunstoneEnemies)   checkCombo(e);
    for (const e of citrineEnemies)    checkCombo(e);
    for (const e of ioliteEnemies)     checkCombo(e);
    for (const e of amethystEnemies)   checkCombo(e);
    for (const e of diamondEnemies)    checkCombo(e);
    for (const e of nullstoneEnemies)  checkCombo(e);
    for (const e of fracterylEnemies)  checkCombo(e);
    for (const e of eigensteinEnemies) checkCombo(e);
    for (const e of eliteEnemies) checkCombo(e);
    if (ctx.bossEnemy) checkCombo(ctx.bossEnemy);
    for (const g of alivenGroups) { for (const p of g.particles) { if (p.isAlive) checkCombo(p); } }

    if (anyInRange && state.phaseMs >= SWORD_COMBO_MIN_SWIPE_DELAY_MS) {
      // Enemy in range and minimum inter-swipe delay elapsed — start the next slash.
      let bestDistSq = Infinity;
      let bestAngle  = 0;
      const findNearest = (e: { x: number; y: number }) => {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d < bestDistSq) { bestDistSq = d; bestAngle = Math.atan2(dy, dx); }
      };
      for (const e of enemies)           findNearest(e);
      for (const e of sapphireEnemies)   findNearest(e);
      for (const e of emeraldEnemies)    findNearest(e);
      for (const e of amberEnemies)      findNearest(e);
      for (const e of voidEnemies)       findNearest(e);
      for (const e of quartzEnemies)     findNearest(e);
      for (const e of rubyEnemies)       findNearest(e);
      for (const e of sunstoneEnemies)   findNearest(e);
      for (const e of citrineEnemies)    findNearest(e);
      for (const e of ioliteEnemies)     findNearest(e);
      for (const e of amethystEnemies)   findNearest(e);
      for (const e of diamondEnemies)    findNearest(e);
      for (const e of nullstoneEnemies)  findNearest(e);
      for (const e of fracterylEnemies)  findNearest(e);
      for (const e of eigensteinEnemies) findNearest(e);
      for (const e of eliteEnemies) { if (!e.isInvuln) findNearest(e); }
      if (ctx.bossEnemy) findNearest(ctx.bossEnemy);
      for (const g of alivenGroups) { for (const p of g.particles) { if (p.isAlive) findNearest(p); } }

      state.swipeArcStart = bestAngle - Math.PI / 2;
      state.swipeArcEnd   = bestAngle + Math.PI / 2;
      state.phase = 'swing'; state.phaseMs = 0; state.hitThisSwing.clear();
      state.swipeEffects.push({
        x: mote.x, y: mote.y,
        arcStart: state.swipeArcStart, arcEnd: state.swipeArcEnd,
        swordLength,
        timerMs: SWORD_SWIPE_VISUAL_MS,
        maxTimerMs: SWORD_SWIPE_VISUAL_MS,
      });
    } else if (state.phaseMs >= SWORD_COMBO_WINDOW_MS) {
      // Combo window expired — break the combo and return to idle.
      state.comboCount = 0;
      state.swingIsRightToLeft = true;
      state.phase = 'idle'; state.phaseMs = 0;
      state.cooldownMs = fullCooldownMs;
    }
  }

  // ── 5. Age swipe and beam effects (unconditional). ───────────────────────
  for (let i = state.swipeEffects.length - 1; i >= 0; i--) {
    state.swipeEffects[i].timerMs -= deltaMs;
    if (state.swipeEffects[i].timerMs <= 0) state.swipeEffects.splice(i, 1);
  }
  for (let i = state.beamEffects.length - 1; i >= 0; i--) {
    state.beamEffects[i].progress += deltaMs / (state.beamEffects[i].maxTimerMs * 0.5);
    if (state.beamEffects[i].progress >= 2) state.beamEffects.splice(i, 1);
  }
}
