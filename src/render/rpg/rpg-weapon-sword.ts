/**
 * rpg-weapon-sword.ts — Diamond sword combo weapon system for the RPG tab.
 *
 * Extracted from rpg-weapon-systems.ts. Owns the full lifecycle of the
 * diamond sword (and sand blade) combo state machine:
 *
 *   • Per-weapon SwordComboState including hinge physics, shard chain, and
 *     phase transitions (idle → swing → combo_window → spin_combo).
 *   • Arc-based hit detection across all enemy types.
 *   • Prismatic beam effects spawned on each hit.
 *   • Fluid injection during swing and spin.
 *
 * The factory `createSwordWeaponSystem(ctx)` receives a `SwordWeaponCtx`
 * dependency-injection object and returns a `SwordWeaponHandle` exposing the
 * combo-state map (consumed by rpg-weapon-draw.ts) and `updateSwordCombo`.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getScaledWeaponDamage, getScaledWeaponCooldown } from '../../sim/rpg/rpg-state';
import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import {
  SWORD_SWING_MS, SWORD_COLOR, SWORD_PRISMATIC_COLORS, SAND_BLADE_COLORS,
  SWORD_SHARD_COUNT, SWORD_HINGE_SPRING_K, SWORD_HINGE_DAMPING,
  SWORD_SHARD_FOLLOW_BASE, SWORD_SHARD_FOLLOW_DECAY,
  SWORD_BEAM_DURATION_MS, SWORD_SWIPE_VISUAL_MS,
  SWORD_FLUID_DRAG_STR, SWORD_FLUID_SWIPE_STR, SWORD_DEFAULT_COOLDOWN_MS,
  SWORD_COMBO_THRESHOLD, SWORD_COMBO_WINDOW_MS, SWORD_COMBO_MIN_SWIPE_DELAY_MS,
  SWORD_COMBO_SPIN_TURNS, SWORD_COMBO_SPIN_MS, SWORD_COMBO_DAMAGE_MULT,
} from './rpg-weapon-constants';
import {
  HIT_EFFECT_DURATION_MS,
  FLUID_VEL_FRAME_TO_PX_S, FLUID_PROJECTILE_STRENGTH,
  BASE_ATTACK_TIMER_KEY,
} from './rpg-constants';
import { getSwordLength, getShardDistances, wrapAngleDiff } from './rpg-helpers';
import type { FluidImpulse } from './rpg-fluid';
import type { RpgPlayerStats, SwordComboState, HitEffect, LaserEnemy, SapphireEnemy } from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy, VoidEnemy, QuartzEnemy, RubyEnemy,
  SunstoneEnemy, CitrineEnemy, IoliteEnemy, AmethystEnemy,
  DiamondEnemy, NullstoneEnemy, FracterylEnemy, EigensteinEnemy, EliteEnemy, BossEnemy,
} from './rpg-enemy-types';

// ── Dependency-injection context ──────────────────────────────────────────

/** Structural subset of RpgWeaponCtx containing only what the sword system needs. */
export interface SwordWeaponCtx {
  mote: { x: number; y: number };
  fluid: { addForce(impulse: FluidImpulse): void };
  readonly playerAimAngle: number;
  readonly bossEnemy: BossEnemy | null;
  hitEffects: HitEffect[];
  playerStats: RpgPlayerStats;
  rpgSimState: RpgSimState;
  enemies: LaserEnemy[];
  sapphireEnemies: SapphireEnemy[];
  emeraldEnemies: EmeraldEnemy[];
  amberEnemies: AmberEnemy[];
  voidEnemies: VoidEnemy[];
  quartzEnemies: QuartzEnemy[];
  rubyEnemies: RubyEnemy[];
  sunstoneEnemies: SunstoneEnemy[];
  citrineEnemies: CitrineEnemy[];
  ioliteEnemies: IoliteEnemy[];
  amethystEnemies: AmethystEnemy[];
  diamondEnemies: DiamondEnemy[];
  nullstoneEnemies: NullstoneEnemy[];
  fracterylEnemies: FracterylEnemy[];
  eigensteinEnemies: EigensteinEnemy[];
  eliteEnemies: EliteEnemy[];
  damageEnemy: (enemy: LaserEnemy, dmg: number, armorMult: number) => number;
  damageSapphireEnemy: (enemy: SapphireEnemy, dmg: number, armorMult: number, isImpact: boolean) => number;
  damageEmeraldEnemy: (enemy: EmeraldEnemy, dmg: number, armorMult: number) => number;
  damageAmberEnemy: (enemy: AmberEnemy, dmg: number, armorMult: number) => number;
  damageVoidEnemy: (enemy: VoidEnemy, dmg: number, armorMult: number) => number;
  damageQuartzEnemy: (enemy: QuartzEnemy, dmg: number, armorMult: number) => number;
  damageRubyEnemy: (enemy: RubyEnemy, dmg: number, armorMult: number) => number;
  damageSunstoneEnemy: (enemy: SunstoneEnemy, dmg: number, armorMult: number) => number;
  damageCitrineEnemy: (enemy: CitrineEnemy, dmg: number, armorMult: number) => number;
  damageIoliteEnemy: (enemy: IoliteEnemy, dmg: number, armorMult: number) => number;
  damageAmethystEnemy: (enemy: AmethystEnemy, dmg: number, armorMult: number, isImpact: boolean) => number;
  damageDiamondEnemy: (enemy: DiamondEnemy, dmg: number, armorMult: number) => number;
  damageNullstoneEnemy: (enemy: NullstoneEnemy, dmg: number, armorMult: number) => number;
  damageFracterylEnemy: (enemy: FracterylEnemy, dmg: number, armorMult: number) => number;
  damageEigensteinEnemy: (enemy: EigensteinEnemy, dmg: number, armorMult: number) => number;
  damageEliteEnemy: (enemy: EliteEnemy, dmg: number, armorMult: number) => number;
  damageBossEnemy: (rawDamage: number, defPierceRatio: number, fromDiamondBlade?: boolean) => number;
  spawnDamageNumber: (x: number, y: number, vx: number, vy: number, text: string, healthFraction: number, color: string) => void;
  removeDeadEnemies: () => void;
  checkWaveCompletion: () => void;
}

// ── Handle returned to the caller ─────────────────────────────────────────

export interface SwordWeaponHandle {
  readonly swordComboStates: Map<string, SwordComboState>;
  updateSwordCombo: (weaponId: string, deltaMs: number) => void;
  reset: () => void;
}

// ── Progress thresholds (0–1) at which the spin combo deals a damage tick. ──
const SPIN_TICK_THRESHOLDS = [0, 0.5, 1.0] as const;

// ── Factory ───────────────────────────────────────────────────────────────

export function createSwordWeaponSystem(ctx: SwordWeaponCtx): SwordWeaponHandle {
  const {
    mote, fluid, hitEffects,
    playerStats, rpgSimState,
    enemies, sapphireEnemies, emeraldEnemies, amberEnemies,
    voidEnemies, quartzEnemies, rubyEnemies, sunstoneEnemies,
    citrineEnemies, ioliteEnemies, amethystEnemies, diamondEnemies,
    nullstoneEnemies, fracterylEnemies, eigensteinEnemies, eliteEnemies,
    damageEnemy, damageSapphireEnemy, damageEmeraldEnemy, damageAmberEnemy,
    damageVoidEnemy, damageQuartzEnemy, damageRubyEnemy, damageSunstoneEnemy,
    damageCitrineEnemy, damageIoliteEnemy, damageAmethystEnemy, damageDiamondEnemy,
    damageNullstoneEnemy, damageFracterylEnemy, damageEigensteinEnemy, damageEliteEnemy, damageBossEnemy,
    spawnDamageNumber,
    removeDeadEnemies, checkWaveCompletion,
  } = ctx;

  // ── Diamond sword system ─────────────────────────────────────────

  const swordComboStates: Map<string, SwordComboState> = new Map();

  function buildSwordCombo(weaponId: string): SwordComboState {
    const weaponDef  = WEAPON_BY_ID.get(weaponId);
    const tier       = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const cooldownMs = getScaledWeaponCooldown(weaponDef?.stats.cooldownMs ?? SWORD_DEFAULT_COOLDOWN_MS, tier);
    const initAngle  = ctx.playerAimAngle + Math.PI / 2;
    return {
      phase: 'idle', phaseMs: 0, cooldownMs,
      hitThisSwing: new Set(),
      swordAngle: initAngle, swordAngularVel: 0,
      shardAngles: Array.from({ length: SWORD_SHARD_COUNT }, () => initAngle),
      swipeArcStart: 0, swipeArcEnd: 0,
      swipeEffects: [], beamEffects: [],
      swingIsRightToLeft: true,
      comboCount: 0,
      spinComboAngle: 0,
      spinComboDamageTicks: 0,
    };
  }

  /**
   * Returns true if angle `a` lies within the arc swept from `start` toward `end`
   * in the short (≤ 2π) direction.
   */
  function angleInArc(a: number, start: number, end: number): boolean {
    const diff = ((a - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const span = ((end - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    return diff <= span;
  }

  function swordHitInArc(
    state: SwordComboState,
    swordLength: number,
    rawDamage: number,
    arcStart: number,
    arcEnd: number,
    weaponId: string,
  ): void {
    const hitColor = SWORD_COLOR;
    const isDiamondBlade = weaponId === 'diamond_bastion';
    const check = <T extends { x: number; y: number; maxHp: number }>(
      e: T,
      damageFn: (enemy: T, dmg: number, pierce: number) => number,
    ) => {
      if (state.hitThisSwing.has(e)) return;
      const dx = e.x - mote.x, dy = e.y - mote.y;
      if (dx * dx + dy * dy > swordLength * swordLength) return;
      if (!angleInArc(Math.atan2(dy, dx), arcStart, arcEnd)) return;
      const dmg = damageFn(e, rawDamage, 1.0);
      state.hitThisSwing.add(e);
      hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: hitColor });
      spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, hitColor);
      // Spawn prismatic beam through the hit enemy.
      spawnSwordBeam(state, e.x, e.y, arcStart, arcEnd, swordLength);
    };
    for (const e of enemies)          check(e, damageEnemy);
    for (const e of sapphireEnemies)  check(e, (en, d, p) => damageSapphireEnemy(en, d, p, false));
    for (const e of emeraldEnemies)   check(e, damageEmeraldEnemy);
    for (const e of amberEnemies)     check(e, damageAmberEnemy);
    for (const e of voidEnemies)      check(e, damageVoidEnemy);
    for (const e of quartzEnemies)    check(e, damageQuartzEnemy);
    for (const e of rubyEnemies)      check(e, damageRubyEnemy);
    for (const e of sunstoneEnemies)  check(e, damageSunstoneEnemy);
    for (const e of citrineEnemies)   check(e, damageCitrineEnemy);
    for (const e of ioliteEnemies)    check(e, damageIoliteEnemy);
    for (const e of amethystEnemies)  check(e, (en, d, p) => damageAmethystEnemy(en, d, p, false));
    for (const e of diamondEnemies)   check(e, damageDiamondEnemy);
    for (const e of nullstoneEnemies) check(e, damageNullstoneEnemy);
    for (const e of fracterylEnemies) check(e, (en, d, p) => damageFracterylEnemy(en, d, p));
    for (const e of eigensteinEnemies) check(e, (en, d, p) => damageEigensteinEnemy(en, d, p));
    for (const e of eliteEnemies) { if (e.isInvuln) continue; check(e, (en, d, p) => damageEliteEnemy(en, d, p)); }
    if (ctx.bossEnemy && !state.hitThisSwing.has(ctx.bossEnemy)) {
      const dx = ctx.bossEnemy.x - mote.x, dy = ctx.bossEnemy.y - mote.y;
      if (dx * dx + dy * dy <= swordLength * swordLength &&
          angleInArc(Math.atan2(dy, dx), arcStart, arcEnd)) {
        const dmg = damageBossEnemy(rawDamage, 1.0, isDiamondBlade);
        state.hitThisSwing.add(ctx.bossEnemy);
        if (dmg > 0) {
          hitEffects.push({ x: ctx.bossEnemy.x, y: ctx.bossEnemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: hitColor });
          spawnDamageNumber(ctx.bossEnemy.x, ctx.bossEnemy.y, 0, -1, String(Math.round(dmg)), dmg / ctx.bossEnemy.maxHp, hitColor);
          spawnSwordBeam(state, ctx.bossEnemy.x, ctx.bossEnemy.y, arcStart, arcEnd, swordLength);
        }
      }
    }
  }

  /**
   * Spawn a prismatic beam effect cutting across the enemy position.
   * The beam originates "out of thin air" beside the player, in the swipe direction.
   */
  function spawnSwordBeam(
    state: SwordComboState,
    enemyX: number, enemyY: number,
    arcStart: number, arcEnd: number,
    swordLength: number,
  ): void {
    // Direction of the cut: midpoint of the swipe arc.
    const midAngle = arcStart + wrapAngleDiff(arcEnd - arcStart) * 0.5;
    const dirX = Math.cos(midAngle);
    const dirY = Math.sin(midAngle);
    // Perpendicular offset so the beam appears slightly beside the player.
    const perpX = -dirY; const perpY = dirX;
    const perpOffset = 4; // px perpendicular offset
    // Position the beam so it passes through the enemy, extending from tail to past it.
    const beamLen = swordLength * 1.5;
    const halfLen = beamLen * 0.5;
    const beamCx = enemyX + perpX * perpOffset;
    const beamCy = enemyY + perpY * perpOffset;
    state.beamEffects.push({
      tailX: beamCx - dirX * halfLen,
      tailY: beamCy - dirY * halfLen,
      tipX:  beamCx + dirX * halfLen,
      tipY:  beamCy + dirY * halfLen,
      progress: 0,
      maxTimerMs: SWORD_BEAM_DURATION_MS,
    });
  }

  function updateSwordCombo(weaponId: string, deltaMs: number): void {
    if (!swordComboStates.has(weaponId)) swordComboStates.set(weaponId, buildSwordCombo(weaponId));
    const state      = swordComboStates.get(weaponId)!;
    const weaponDef  = WEAPON_BY_ID.get(weaponId);
    const tier       = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const rawDamage  = weaponDef
      ? getScaledWeaponDamage(weaponDef.stats.damage, tier, playerStats.atk)
      : playerStats.atk;
    const swordLength    = getSwordLength(tier);
    const fullCooldownMs = getScaledWeaponCooldown(weaponDef?.stats.cooldownMs ?? SWORD_DEFAULT_COOLDOWN_MS, tier);
    const nowMs = Date.now();

    // ── 1. Update hinge physics: spring pulls toward right-hand rest angle based on
    //       last movement facing (ctx.playerAimAngle). Overridden during swing/spin.
    const restAngle = ctx.playerAimAngle + Math.PI / 2;
    const angleDiff = wrapAngleDiff(restAngle - state.swordAngle);
    state.swordAngularVel += angleDiff * SWORD_HINGE_SPRING_K;
    state.swordAngularVel *= SWORD_HINGE_DAMPING;
    if (state.phase !== 'swing' && state.phase !== 'spin_combo' && state.phase !== 'combo_window') {
      state.swordAngle += state.swordAngularVel;
    }

    // ── 2. Update shard chain (each shard lags the previous) ──
    const followBase = SWORD_SHARD_FOLLOW_BASE;
    const followDecay = SWORD_SHARD_FOLLOW_DECAY;
    if (state.phase !== 'swing' && state.phase !== 'spin_combo') {
      // Shard 0 follows the main hinge angle.
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
        // R→L: drive from arcStart → arcEnd. L→R: drive from arcEnd → arcStart.
        if (state.swingIsRightToLeft) {
          driveAngle = state.swipeArcStart + (state.swipeArcEnd - state.swipeArcStart) * t;
        } else {
          driveAngle = state.swipeArcEnd + (state.swipeArcStart - state.swipeArcEnd) * t;
        }
      } else {
        // spin_combo: direct drive
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

    // ── 3. Add fluid forces from sword drag (each shard per frame) ──
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

    // ── 4. Phase state machine ──
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

          // Arc is centered on the enemy; half-width = π/2 gives a 180° sweep.
          // arcStart = left side (start for R→L drive), arcEnd = right side.
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
      swordHitInArc(state, swordLength, rawDamage, state.swipeArcStart, state.swipeArcEnd, weaponId);

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
          // The spin starts from the endpoint of the last swing.
          const spinStartAngle = state.swipeArcStart;
          state.phase = 'spin_combo';
          state.phaseMs = 0;
          state.spinComboAngle = spinStartAngle;
          // swipeArcEnd stores the spin start angle (reuse to avoid adding a field).
          state.swipeArcEnd = spinStartAngle;
          state.spinComboDamageTicks = 0;
          state.hitThisSwing.clear();
        } else {
          // Enter the 1-second combo window — sword held in place, waiting for next slash.
          state.phase = 'combo_window';
          state.phaseMs = 0;
          state.swordAngularVel = 0; // freeze sword at its current end-of-swing position
        }
      }
    } else if (state.phase === 'spin_combo') {
      // ── Spin combo: 3 rapid full rotations, damage at beginning/middle/end ──
      const spinProgress = state.phaseMs / SWORD_COMBO_SPIN_MS; // 0 → 1
      const totalSpin = SWORD_COMBO_SPIN_TURNS * Math.PI * 2;   // 6π
      // swipeArcEnd stores the spin start angle (set when combo was triggered).
      state.spinComboAngle = state.swipeArcEnd + totalSpin * Math.min(spinProgress, 1);

      // Apply damage at 3 fixed checkpoints: beginning (0%), middle (50%), end (100%).
      // The hit-set is cleared before each tick so every enemy can be struck each time.
      for (let tick = state.spinComboDamageTicks; tick < SPIN_TICK_THRESHOLDS.length; tick++) {
        if (spinProgress < SPIN_TICK_THRESHOLDS[tick]) break;
        state.spinComboDamageTicks = tick + 1;
        state.hitThisSwing.clear();
        // Hitbox radius = sword length (same as the visible ring).
        const comboRange = swordLength;
        swordHitInArc(state, comboRange, rawDamage * SWORD_COMBO_DAMAGE_MULT, 0, Math.PI * 2, weaponId);
        // Wide fluid burst for each tick.
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
        const restAngle = ctx.playerAimAngle + Math.PI / 2;
        state.swordAngle = restAngle;
        for (let i = 0; i < SWORD_SHARD_COUNT; i++) state.shardAngles[i] = restAngle;
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
        state.swingIsRightToLeft = true; // reset to default starting direction
        state.phase = 'idle'; state.phaseMs = 0;
        state.cooldownMs = fullCooldownMs;
      }
    }

    // ── 5. Age swipe and beam effects (unconditional) ──
    for (let i = state.swipeEffects.length - 1; i >= 0; i--) {
      state.swipeEffects[i].timerMs -= deltaMs;
      if (state.swipeEffects[i].timerMs <= 0) state.swipeEffects.splice(i, 1);
    }
    for (let i = state.beamEffects.length - 1; i >= 0; i--) {
      state.beamEffects[i].progress += deltaMs / (state.beamEffects[i].maxTimerMs * 0.5);
      if (state.beamEffects[i].progress >= 2) state.beamEffects.splice(i, 1);
    }
  }

  return {
    get swordComboStates() { return swordComboStates; },
    updateSwordCombo,
    reset(): void {
      swordComboStates.clear();
    },
  };
}
