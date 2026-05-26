/**
 * rpg-weapon-sword-combo-helpers.ts — Internal helpers and context type for
 * the diamond sword / sand blade combo state machine.
 *
 * Extracted from rpg-weapon-sword-combo.ts to keep that file focused on the
 * updateSwordComboForWeapon export. All helpers here are consumed only by
 * rpg-weapon-sword-combo.ts.
 *
 * Exports:
 *   SwordWeaponCtx         — DI context type (re-exported from rpg-weapon-sword-combo.ts)
 *   SPIN_TICK_THRESHOLDS   — progress thresholds for spin-combo damage ticks
 *   buildSwordCombo        — initialise a fresh SwordComboState
 *   angleInArc             — test whether an angle lies in a swept arc
 *   spawnSwordBeam         — create a prismatic beam effect at an enemy position
 *   swordHitInArc          — arc hit detection across all enemy types
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getScaledWeaponCooldown } from '../../sim/rpg/rpg-state';
import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import {
  SWORD_COLOR,
  SWORD_SHARD_COUNT,
  SWORD_BEAM_DURATION_MS,
  SWORD_DEFAULT_COOLDOWN_MS,
} from './rpg-weapon-constants';
import { HIT_EFFECT_DURATION_MS } from './rpg-constants';
import { wrapAngleDiff } from './rpg-helpers';
import type { FluidImpulse } from './rpg-fluid';
import type { ClosestTarget, RpgPlayerStats, SwordComboState, HitEffect, LaserEnemy, SapphireEnemy } from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy, VoidEnemy, QuartzEnemy, RubyEnemy,
  SunstoneEnemy, CitrineEnemy, IoliteEnemy, AmethystEnemy,
  DiamondEnemy, NullstoneEnemy, FracterylEnemy, EigensteinEnemy, EliteEnemy, BossEnemy,
} from './rpg-enemy-types';
import type { AlivenParticle, AlivenParticleGroup } from './rpg-aliven-types';
import { segmentIntersectsTopographicTerrain, type TopographicTerrainState } from './terrain/topographic-terrain';
import type { TargetCollectionOptions } from './rpg-targeting-types';

// ── Dependency-injection context ──────────────────────────────────────────
// Defined here (where it is used by helpers) and re-exported from
// rpg-weapon-sword-combo.ts for backwards compatibility with existing importers.

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
  alivenGroups: AlivenParticleGroup[];
  damageAlivenParticle: (particle: AlivenParticle, group: AlivenParticleGroup, rawDamage: number) => number;
  collectEnemyBodyTargets: (opts?: TargetCollectionOptions) => ClosestTarget[];
  damageBodyTarget: (target: ClosestTarget, rawDamage: number, defPierceRatio: number, bypassShield: boolean) => number;
  spawnDamageNumber: (x: number, y: number, vx: number, vy: number, text: string, healthFraction: number, color: string, sourceColor?: string) => void;
  removeDeadEnemies: () => void;
  checkWaveCompletion: () => void;
  /** Returns current terrain state, or null if terrain is not active. */
  getTerrainState?: () => TopographicTerrainState | null;
}

// ── Progress thresholds (0–1) at which the spin combo deals a damage tick. ──
export const SPIN_TICK_THRESHOLDS = [0, 0.5, 1.0] as const;

// ── Build initial combo state ─────────────────────────────────────────────

export function buildSwordCombo(weaponId: string, ctx: SwordWeaponCtx): SwordComboState {
  const weaponDef  = WEAPON_BY_ID.get(weaponId);
  const tier       = ctx.rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
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

// ── Arc geometry ──────────────────────────────────────────────────────────

/**
 * Returns true if angle `a` lies within the arc swept from `start` toward `end`
 * in the short (≤ 2π) direction.
 */
export function angleInArc(a: number, start: number, end: number): boolean {
  const diff = ((a - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  const span = ((end - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  return diff <= span;
}

// ── Prismatic beam effect ─────────────────────────────────────────────────

/**
 * Spawn a prismatic beam effect cutting across the enemy position.
 * The beam originates "out of thin air" beside the player, in the swipe direction.
 */
export function spawnSwordBeam(
  state: SwordComboState,
  enemyX: number, enemyY: number,
  arcStart: number, arcEnd: number,
  swordLength: number,
): void {
  const midAngle = arcStart + wrapAngleDiff(arcEnd - arcStart) * 0.5;
  const dirX = Math.cos(midAngle);
  const dirY = Math.sin(midAngle);
  const perpX = -dirY; const perpY = dirX;
  const perpOffset = 4;
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

// ── Arc hit detection across all enemy types ──────────────────────────────

export function swordHitInArc(
  state: SwordComboState,
  ctx: SwordWeaponCtx,
  swordLength: number,
  rawDamage: number,
  arcStart: number,
  arcEnd: number,
  weaponId: string,
): void {
  const { mote, hitEffects, spawnDamageNumber } = ctx;
  const hitColor = SWORD_COLOR;
  const isDiamondBlade = weaponId === 'diamond_bastion';
  const terrain = ctx.getTerrainState ? ctx.getTerrainState() : null;
  // Minimum distance (px) at which a target is considered "touching" the player
  // and should not be blocked by terrain (prevents edge-case situations where
  // an enemy pushed right next to the player cannot be hit).
  const MELEE_TOUCH_SQ = 16 * 16;
  const check = (
    target: ClosestTarget,
    e: { x: number; y: number; maxHp: number },
  ) => {
    if (state.hitThisSwing.has(e)) return;
    const dx = e.x - mote.x, dy = e.y - mote.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > swordLength * swordLength) return;
    if (!angleInArc(Math.atan2(dy, dx), arcStart, arcEnd)) return;
    // LOS check: skip enemies behind terrain unless they are within touch range.
    if (terrain && distSq > MELEE_TOUCH_SQ && segmentIntersectsTopographicTerrain(terrain, mote.x, mote.y, e.x, e.y)) return;
    const dmg = ctx.damageBodyTarget(target, rawDamage, 1.0, false);
    state.hitThisSwing.add(e);
    if (dmg > 0) {
      hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: hitColor });
      spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, hitColor);
      spawnSwordBeam(state, e.x, e.y, arcStart, arcEnd, swordLength);
    }
  };
  const damageBossEnemy = ctx.damageBossEnemy;
  for (const target of ctx.collectEnemyBodyTargets()) {
    if (target.alivenParticle || target.boss) continue;
    const body = getClosestTargetBody(target);
    if (!body) continue;
    if (target.elite?.isInvuln) continue;
    check(target, body);
  }
  if (ctx.bossEnemy && !state.hitThisSwing.has(ctx.bossEnemy)) {
    const dx = ctx.bossEnemy.x - mote.x, dy = ctx.bossEnemy.y - mote.y;
    const bossDist2 = dx * dx + dy * dy;
    if (bossDist2 <= swordLength * swordLength &&
        angleInArc(Math.atan2(dy, dx), arcStart, arcEnd) &&
        !(terrain && bossDist2 > MELEE_TOUCH_SQ && segmentIntersectsTopographicTerrain(terrain, mote.x, mote.y, ctx.bossEnemy.x, ctx.bossEnemy.y))) {
      const dmg = damageBossEnemy(rawDamage, 1.0, isDiamondBlade);
      state.hitThisSwing.add(ctx.bossEnemy);
      if (dmg > 0) {
        hitEffects.push({ x: ctx.bossEnemy.x, y: ctx.bossEnemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: hitColor });
        spawnDamageNumber(ctx.bossEnemy.x, ctx.bossEnemy.y, 0, -1, String(Math.round(dmg)), dmg / ctx.bossEnemy.maxHp, hitColor);
        spawnSwordBeam(state, ctx.bossEnemy.x, ctx.bossEnemy.y, arcStart, arcEnd, swordLength);
      }
    }
  }

  // Aliven particle groups
  for (const group of ctx.alivenGroups) {
    for (const p of group.particles) {
      if (!p.isAlive) continue;
      if (state.hitThisSwing.has(p)) continue;
      const dx = p.x - mote.x, dy = p.y - mote.y;
      const pDistSq = dx * dx + dy * dy;
      if (pDistSq > swordLength * swordLength) continue;
      if (!angleInArc(Math.atan2(dy, dx), arcStart, arcEnd)) continue;
      // LOS check for aliven particles.
      if (terrain && pDistSq > MELEE_TOUCH_SQ && segmentIntersectsTopographicTerrain(terrain, mote.x, mote.y, p.x, p.y)) continue;
      const dmg = ctx.damageAlivenParticle(p, group, rawDamage);
      state.hitThisSwing.add(p);
      if (dmg > 0) {
        hitEffects.push({ x: p.x, y: p.y, timerMs: HIT_EFFECT_DURATION_MS, color: p.glowColor });
        spawnDamageNumber(p.x, p.y, 0, -1, String(Math.round(dmg)), dmg / p.maxHp, p.glowColor);
        spawnSwordBeam(state, p.x, p.y, arcStart, arcEnd, swordLength);
      }
    }
  }
}

// Nothing further — all exports from this module are listed above.
function getClosestTargetBody(target: ClosestTarget): { x: number; y: number; maxHp: number } | null {
  const body =
    target.laser ?? target.sapphire ?? target.emerald ?? target.amber ?? target.void ??
    target.quartz ?? target.ruby ?? target.sunstone ?? target.citrine ?? target.iolite ??
    target.amethyst ?? target.diamond ?? target.nullstone ?? target.fracteryl ??
    target.eigenstein ?? target.elite ?? target.binaryRing ?? target.dustWisp ??
    target.ribbonWorm ?? target.lanternMoth ?? target.eyeStalk ?? target.jellyfish ??
    target.clothGhost ?? target.plantTurret ?? target.gearInsect ?? target.spiderCrawler ??
    target.moteSwarm ?? target.shadowHand ?? target.sandFish ?? target.quartzFish ??
    target.rubyFish ?? target.sunstoneFish ?? target.emeraldFish ?? target.sapphireFish ??
    target.amethystFish ?? target.diamondFish ?? target.plantProj ?? target.verdurePlant;
  return typeof body === 'object' && body !== null && 'maxHp' in body && typeof body.maxHp === 'number'
    ? { x: target.x, y: target.y, maxHp: body.maxHp }
    : null;
}
