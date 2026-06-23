/**
 * rpg-boss-attack-update.ts — Scheduler and update orchestrator for boss special attacks.
 *
 * Manages spawning, ticking, expiry of all BossAttackInstance variants.
 * Player collision detection is applied here and delegated back via context callbacks.
 *
 * Context object (BossAttackUpdateCtx) follows the getter/setter lambda pattern used
 * throughout rpg-boss-update.ts so mutable closure state in rpg-render.ts is updated
 * without rebuilding the context object each frame.
 */

import type { BossEnemy } from './rpg-enemy-types';
import type {
  BossAttackInstance,
  BossAttackState,
  GravAttackInstance,
  HexAttackInstance,
  MandalaAttackInstance,
  MissileAttackInstance,
  QuartzSignatureAttackInstance,
  SwarmAttackInstance,
  VermiculateAttackInstance,
} from './rpg-boss-attack-types';
import { getBossAttackProfile } from './rpg-boss-attack-config';
import { spawnGravAttack,        updateGravAttack,        getGravHazardCircles        } from './attacks/rpg-attack-grav';
import { spawnHexAttack,         updateHexAttack,         getHexHazardCapsules, getHexHeadCircles } from './attacks/rpg-attack-hex';
import { spawnMandalaAttack,     updateMandalaAttack,     getMandalaHazardCircles     } from './attacks/rpg-attack-mandala';
import { spawnVermiculateAttack, updateVermiculateAttack, getVermiculateHazardCircles } from './attacks/rpg-attack-vermiculate';
import { spawnMissileAttack,     updateMissileAttack,     getMissileHazardCircles     } from './attacks/rpg-attack-missile';
import { spawnSwarmAttack,       updateSwarmAttack,       getSwarmHazardCircles       } from './attacks/rpg-attack-swarm';
import {
  spawnQuartzSignatureAttack,
  updateQuartzSignatureAttack,
  getQuartzSignatureHazardCapsules,
  getQuartzSignatureHazardCircles,
} from './attacks/rpg-attack-quartz-signature';
import { PLAYER_HIT_RADIUS, PLAYER_IFRAME_MIN_MS, PLAYER_IFRAME_MAX_ADD_MS } from './rpg-constants';
import { isPlayerInStageDirectorSafeZone } from './rpg-boss-stage-director';
import { getBossTempoSyncedLegacyIntervalMs } from '../../data/rpg/boss-tempo-config';
import { isPlayerInBossAttackVoid } from './rpg-boss-attack-void';

// ── Caps ──────────────────────────────────────────────────────────────────────

const MAX_ACTIVE_ATTACKS      = 6;
const SCHEDULER_COOLDOWN_BEATS = 1; // minimum gap between any two scheduler decisions

// ── Context interface ─────────────────────────────────────────────────────────

export interface BossAttackUpdateCtx {
  readonly dim: { w: number; h: number };
  get playerX(): number;
  get playerY(): number;
  readonly playerStats: { hp: number; maxHp: number; def: number };
  getPlayerIFramesMs(): number;
  setPlayerIFramesMs(ms: number): void;
  getIsBossWaveActive(): boolean;
  spawnDamageNumber(x: number, y: number, dirX: number, dirY: number, text: string, ratio: number, color: string): void;
  setPlayerHp(hp: number): void;
}

// ── Main update entry point ───────────────────────────────────────────────────

export function updateBossAttacks(
  state: BossAttackState,
  ctx: BossAttackUpdateCtx,
  bossEnemy: BossEnemy | null,
  deltaMs: number,
): void {
  // ── Tick scheduler cooldown ──────────────────────────────────────────────
  for (const [key, remaining] of state.schedulerCooldowns) {
    const next = remaining - deltaMs;
    if (next <= 0) {
      state.schedulerCooldowns.delete(key);
    } else {
      state.schedulerCooldowns.set(key, next);
    }
  }

  // ── Update and expire existing attacks ───────────────────────────────────
  state.activePressure = 0;
  for (let i = state.attacks.length - 1; i >= 0; i--) {
    const atk = state.attacks[i];
    _dispatchUpdate(atk, ctx, deltaMs);
    if (atk.ageMs >= atk.durationMs) {
      state.attacks.splice(i, 1);
    }
  }

  // Recompute pressure from survivors
  const profile = bossEnemy ? getBossAttackProfile(bossEnemy.bossId) : null;
  if (profile) {
    for (const atk of state.attacks) {
      const phaseAttacks = _getPhaseAttacks(profile, bossEnemy!.phaseIndex);
      const kindCfg = phaseAttacks.find(c => c.kind === atk.kind);
      if (kindCfg) state.activePressure += kindCfg.pressureScore;
    }
  }

  // ── Spawn new attacks ────────────────────────────────────────────────────
  if (bossEnemy && !bossEnemy.isFiringPaused && profile) {
    if (state.attacks.length < MAX_ACTIVE_ATTACKS) {
      const phaseAttacks = _getPhaseAttacks(profile, bossEnemy.phaseIndex);
      if (state.activePressure < profile.maxPressure) {
        _tryScheduleAttack(state, ctx, bossEnemy, phaseAttacks, deltaMs);
      }
    }
  }

  // ── Collision detection ──────────────────────────────────────────────────
  if (ctx.getPlayerIFramesMs() <= 0) {
    applyBossAttackCollision(state, ctx, bossEnemy);
  }
}

function _dispatchUpdate(
  atk: BossAttackInstance,
  ctx: BossAttackUpdateCtx,
  deltaMs: number,
): void {
  switch (atk.kind) {
    case 'grav':        updateGravAttack(atk as GravAttackInstance, ctx.playerX, ctx.playerY, ctx.dim, deltaMs); break;
    case 'hexTrail':    updateHexAttack(atk as HexAttackInstance, ctx.playerX, ctx.playerY, ctx.dim, deltaMs); break;
    case 'mandala':     updateMandalaAttack(atk as MandalaAttackInstance, ctx.playerX, ctx.playerY, ctx.dim, deltaMs); break;
    case 'vermiculate': updateVermiculateAttack(atk as VermiculateAttackInstance, ctx.playerX, ctx.playerY, ctx.dim, deltaMs); break;
    case 'missileRing': updateMissileAttack(atk as MissileAttackInstance, ctx.playerX, ctx.playerY, ctx.dim, deltaMs); break;
    case 'motherSwarm': updateSwarmAttack(atk as SwarmAttackInstance, ctx.playerX, ctx.playerY, ctx.dim, deltaMs); break;
    case 'quartzSignature': updateQuartzSignatureAttack(atk as QuartzSignatureAttackInstance, ctx.playerX, ctx.playerY, ctx.dim, deltaMs); break;
  }
}

function _tryScheduleAttack(
  state: BossAttackState,
  ctx: BossAttackUpdateCtx,
  boss: BossEnemy,
  phaseAttacks: ReturnType<typeof _getPhaseAttacks>,
  _deltaMs: number,
): void {
  // Filter to kinds that are off cooldown and not currently active
  const candidates = phaseAttacks.filter(cfg => {
    const key = `${boss.bossId}_${cfg.kind}`;
    return !state.schedulerCooldowns.has(key);
  });
  if (candidates.length === 0) return;

  // Random selection (Math.random only used for scheduler choice)
  const cfg = candidates[Math.floor(Math.random() * candidates.length)];
  spawnBossAttackFromConfig(state, ctx, boss, cfg, true);
}

export function spawnBossAttackFromConfig(
  state: BossAttackState,
  ctx: BossAttackUpdateCtx,
  boss: BossEnemy,
  cfg: BossAttackKindConfig,
  applyCooldown = false,
): boolean {
  const key = `${boss.bossId}_${cfg.kind}`;
  const difficulty = Math.max(0, boss.phaseIndex);
  const bossX = boss.x;
  const bossY = boss.y;

  let instance: BossAttackInstance | null = null;
  switch (cfg.kind) {
    case 'grav':
      instance = spawnGravAttack(bossX, bossY, ctx.dim, cfg.params, difficulty);
      break;
    case 'hexTrail':
      instance = spawnHexAttack(bossX, bossY, ctx.dim, cfg.params, difficulty);
      break;
    case 'mandala':
      instance = spawnMandalaAttack(bossX, bossY, cfg.params, difficulty);
      break;
    case 'vermiculate':
      instance = spawnVermiculateAttack(bossX, bossY, ctx.dim, cfg.params, difficulty);
      break;
    case 'missileRing':
      instance = spawnMissileAttack(bossX, bossY, cfg.params, difficulty);
      break;
    case 'motherSwarm':
      instance = spawnSwarmAttack(bossX, bossY, cfg.params, difficulty);
      break;
    case 'quartzSignature':
      instance = spawnQuartzSignatureAttack(bossX, bossY, ctx.dim, cfg.params, difficulty);
      break;
  }

  if (instance) {
    state.attacks.push(instance);
    if (applyCooldown) {
      // Total cooldown = per-kind musical interval + one beat gap to prevent
      // rapid re-firing of the same kind immediately after it expires.
      state.schedulerCooldowns.set(
        key,
        getBossTempoSyncedLegacyIntervalMs(boss.bossId, cfg.cooldownMs) +
          getBossTempoSyncedLegacyIntervalMs(boss.bossId, SCHEDULER_COOLDOWN_BEATS * 1000),
      );
    }
    return true;
  }
  return false;
}

import type { BossAttackKindConfig, BossAttackProfileConfig } from './rpg-boss-attack-config';

function _getPhaseAttacks(
  profile: BossAttackProfileConfig,
  phaseIndex: number,
): BossAttackKindConfig[] {
  if (phaseIndex >= 2) return profile.phase2Attacks;
  if (phaseIndex >= 1) return profile.phase1Attacks;
  return profile.phase0Attacks;
}

// ── Collision detection ───────────────────────────────────────────────────────

export function applyBossAttackCollision(
  state: BossAttackState,
  ctx: BossAttackUpdateCtx,
  bossEnemy: BossEnemy | null,
): void {
  const px = ctx.playerX;
  const py = ctx.playerY;
  const pr = PLAYER_HIT_RADIUS;

  // During boss waves, the bottom safe zone protects the player from all special attacks.
  if (ctx.getIsBossWaveActive() && isPlayerInStageDirectorSafeZone(px, py, ctx.dim)) return;
  if (isPlayerInBossAttackVoid(px, py, bossEnemy)) return;

  for (const atk of state.attacks) {
    if (_checkAttackHitsPlayer(atk, px, py, pr)) {
      _applyDamageToPlayer(atk, ctx);
      return; // one hit per frame
    }
  }
}

function _checkAttackHitsPlayer(
  atk: BossAttackInstance,
  px: number, py: number, pr: number,
): boolean {
  switch (atk.kind) {
    case 'grav': {
      for (const { x, y, r } of getGravHazardCircles(atk as GravAttackInstance)) {
        if (_circlesOverlap(px, py, pr, x, y, r)) return true;
      }
      break;
    }
    case 'hexTrail': {
      for (const { x1, y1, x2, y2, r } of getHexHazardCapsules(atk as HexAttackInstance)) {
        if (_pointNearSegment(px, py, x1, y1, x2, y2, r + pr)) return true;
      }
      for (const { x, y, r } of getHexHeadCircles(atk as HexAttackInstance)) {
        if (_circlesOverlap(px, py, pr, x, y, r)) return true;
      }
      break;
    }
    case 'mandala': {
      for (const { x, y, r } of getMandalaHazardCircles(atk as MandalaAttackInstance)) {
        if (_circlesOverlap(px, py, pr, x, y, r)) return true;
      }
      break;
    }
    case 'vermiculate': {
      for (const { x, y, r } of getVermiculateHazardCircles(atk as VermiculateAttackInstance)) {
        if (_circlesOverlap(px, py, pr, x, y, r)) return true;
      }
      break;
    }
    case 'missileRing': {
      for (const { x, y, r } of getMissileHazardCircles(atk as MissileAttackInstance)) {
        if (_circlesOverlap(px, py, pr, x, y, r)) return true;
      }
      break;
    }
    case 'motherSwarm': {
      for (const { x, y, r } of getSwarmHazardCircles(atk as SwarmAttackInstance)) {
        if (_circlesOverlap(px, py, pr, x, y, r)) return true;
      }
      break;
    }
    case 'quartzSignature': {
      for (const { x1, y1, x2, y2, r } of getQuartzSignatureHazardCapsules(atk as QuartzSignatureAttackInstance)) {
        if (_pointNearSegment(px, py, x1, y1, x2, y2, r + pr)) return true;
      }
      for (const { x, y, r } of getQuartzSignatureHazardCircles(atk as QuartzSignatureAttackInstance)) {
        if (_circlesOverlap(px, py, pr, x, y, r)) return true;
      }
      break;
    }
  }
  return false;
}

function _applyDamageToPlayer(
  atk: BossAttackInstance,
  ctx: BossAttackUpdateCtx,
): void {
  // Base damage per attack family — can be tuned in config later
  const BASE_DMG: Record<string, number> = {
    grav: 8, hexTrail: 10, mandala: 9, vermiculate: 9, missileRing: 12, motherSwarm: 7, quartzSignature: 13,
  };
  const raw = BASE_DMG[atk.kind] ?? 8;
  const defPct = Math.min(80, ctx.playerStats.def) / 100;
  const dmg    = Math.max(1, Math.round(raw * (1 - defPct)));
  const newHp  = Math.max(0, ctx.playerStats.hp - dmg);
  ctx.setPlayerHp(newHp);
  const ratio = dmg / ctx.playerStats.maxHp;
  ctx.spawnDamageNumber(ctx.playerX, ctx.playerY, 0, -1, String(dmg), ratio, '#ff6666');

  const iframes = PLAYER_IFRAME_MIN_MS + Math.random() * PLAYER_IFRAME_MAX_ADD_MS;
  ctx.setPlayerIFramesMs(iframes);
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

function _circlesOverlap(
  ax: number, ay: number, ar: number,
  bx: number, by: number, br: number,
): boolean {
  const d2 = (ax - bx) ** 2 + (ay - by) ** 2;
  const r  = ar + br;
  return d2 < r * r;
}

function _pointNearSegment(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
  r: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((px - x1) * dx + (py - y1) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  return (px - closestX) ** 2 + (py - closestY) ** 2 < r * r;
}

// ── Low-graphics mode ─────────────────────────────────────────────────────────

/** Exported so rpg-render.ts can forward setLowGraphicsMode calls. */
export function setBossAttacksLowGraphics(_enabled: boolean): void {
  // Reserved for future per-system low-graphics reductions.
}
