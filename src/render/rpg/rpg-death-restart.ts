/**
 * rpg-death-restart.ts — Player death and level-restart lifecycle for the RPG tab.
 *
 * Extracted from rpg-render.ts to reduce that file's size.
 *
 * Exports:
 *   - `RpgDeathRestartCtx`  — dependency-injection context.
 *   - `triggerDeath(ctx)`   — transitions to 'dying' phase and spawns burst particles.
 *   - `doRestart(ctx)`      — resets all entity arrays and restarts from respawn wave.
 *   - `updateDying(ctx, deltaMs)` — advances death animation; triggers doRestart when done.
 *   - `updateRestarting(ctx, deltaMs)` — fade-in after restart; transitions to 'alive'.
 */

import type { RpgMote, RpgPhase, RpgPlayerStats } from './rpg-types';
import type { PlayerMovementState } from './rpg-player-movement';
import type { BossEnemy } from './rpg-enemy-types';
import type { BossAttackState } from './rpg-boss-attack-types';
import type { RpgWeaponHandle } from './rpg-weapon-systems';
import {
  DEATH_BURST_COUNT, DEATH_PARTICLE_COLORS,
  DEATH_ANIM_DURATION_MS, DEATH_HOLD_DURATION_MS, RESTART_FADE_IN_MS,
  INTER_WAVE_DELAY_MS,
} from './rpg-constants';
import { clearSpawnFlashes } from './rpg-spawn-flash';
import { clearDyingEnemies } from './rpg-death-fade';
import {
  clearForDeathRestart,
  type RpgEncounterCollections,
} from './rpg-encounter-collections';

// ── Context ──────────────────────────────────────────────────────────────────

export interface RpgDeathRestartCtx {
  // ── Phase state setters/getters ─────────────────────────────────
  getRpgPhase(): RpgPhase;
  setRpgPhase(p: RpgPhase): void;
  getPhaseTimerMs(): number;
  setPhaseTimerMs(ms: number): void;

  getDeathAlpha(): number;
  setDeathAlpha(v: number): void;

  getScreenDarken(): number;
  setScreenDarken(v: number): void;

  getRestartFadeAlpha(): number;
  setRestartFadeAlpha(v: number): void;

  setPlayerIFramesMs(ms: number): void;
  collections: RpgEncounterCollections;

  // ── Player / physics ────────────────────────────────────────────
  mote: RpgMote;
  playerStats: RpgPlayerStats;
  playerMovementState: PlayerMovementState;

  // ── Systems cleared on restart ───────────────────────────────────
  bossAttackState: BossAttackState;
  weaponSystems: RpgWeaponHandle;
  weaponAttackTimers: Map<string, number>;
  fluid: { reset(): void };
  bossWave: { exitBossWave(): void; startBossFight(bossId: number): void };
  getBossEnemy(): BossEnemy | null;
  /** Optional: clear ephemeral player status effects on restart. */
  onRestart?(): void;

  // ── Scalar setters (bossEnemy/zone need setters since they're nullables) ─
  setBossEnemy(b: BossEnemy | null): void;
  setBinaryLaserSweep(sweep: null): void;
  setDanmakuSafeZone(dz: null): void;
  setIsBossFightFromMenu(b: boolean): void;
  setBossHitsInRound(v: number): void;

  // ── Wave state setters ───────────────────────────────────────────
  setCurrentWave(w: number): void;
  setIsInterWave(b: boolean): void;
  setInterWaveTimerMs(ms: number): void;

  // ── Dimension getters ────────────────────────────────────────────
  getWidthPx(): number;
  getHeightPx(): number;

  // ── RPG sim state (respawnWave for restart target) ───────────────
  rpgSimState: {
    respawnWave: number;
    consecutiveWaveStreak: number;
    damageFreeWaveStreak: number;
    tookDamageThisWave: boolean;
  };

  // ── Post-restart callback ────────────────────────────────────────
  applyEquipmentStats(): void;
}

// ── Exported lifecycle functions ──────────────────────────────────────────────

export function triggerDeath(ctx: RpgDeathRestartCtx): void {
  const { deathParticles } = ctx.collections;
  ctx.setRpgPhase('dying');
  ctx.setPhaseTimerMs(0);
  ctx.setDeathAlpha(1);
  deathParticles.length = 0;
  for (let i = 0; i < DEATH_BURST_COUNT; i++) {
    const angle = (i / DEATH_BURST_COUNT) * Math.PI * 2 + Math.random() * 0.35;
    const speed = 0.8 + Math.random() * 1.8;
    deathParticles.push({
      x: ctx.mote.x, y: ctx.mote.y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      alpha: 1, size: 1.5 + Math.random() * 2,
      color: DEATH_PARTICLE_COLORS[Math.floor(Math.random() * DEATH_PARTICLE_COLORS.length)],
    });
  }
}

export function doRestart(ctx: RpgDeathRestartCtx): void {
  const restartBossId = ctx.getBossEnemy()?.bossId ?? null;
  ctx.playerStats.hp = ctx.playerStats.maxHp;
  ctx.onRestart?.();
  clearForDeathRestart(ctx.collections, restartBossId === null ? 'normal' : 'boss');
  ctx.setDanmakuSafeZone(null);
  ctx.bossWave.exitBossWave();
  ctx.setIsBossFightFromMenu(false);
  ctx.setBossEnemy(null);
  ctx.setBinaryLaserSweep(null);
  ctx.bossAttackState.attacks.length = 0;
  ctx.bossAttackState.schedulerCooldowns.clear();
  ctx.bossAttackState.activePressure = 0;
  ctx.weaponSystems.reset();
  ctx.mote.x = ctx.getWidthPx() / 2; ctx.mote.y = ctx.getHeightPx() / 2;
  ctx.mote.vx = ctx.mote.vy = 0; ctx.mote.trailHead = 0; ctx.mote.trailCount = 0;
  ctx.playerMovementState.glowMovementIntensity = 0;
  ctx.setBossHitsInRound(0);
  if (restartBossId !== null) {
    ctx.bossWave.startBossFight(restartBossId);
  } else {
    ctx.setCurrentWave(ctx.rpgSimState.respawnWave);
    ctx.setIsInterWave(true);
    ctx.setInterWaveTimerMs(INTER_WAVE_DELAY_MS * 0.4);
  }
  ctx.setScreenDarken(0);
  ctx.weaponAttackTimers.clear();
  clearSpawnFlashes();
  clearDyingEnemies();
  ctx.setPlayerIFramesMs(0);
  ctx.fluid.reset();
  ctx.applyEquipmentStats();
  // Reset per-run tracking counters
  ctx.rpgSimState.consecutiveWaveStreak = 0;
  ctx.rpgSimState.damageFreeWaveStreak = 0;
  ctx.rpgSimState.tookDamageThisWave = false;
}

export function updateDying(ctx: RpgDeathRestartCtx, deltaMs: number): void {
  const phaseMs = ctx.getPhaseTimerMs() + deltaMs;
  ctx.setPhaseTimerMs(phaseMs);
  const t = Math.min(phaseMs / DEATH_ANIM_DURATION_MS, 1);
  ctx.setDeathAlpha(Math.max(0, 1 - t * 1.25));
  ctx.setScreenDarken(Math.min(t * 0.85, 0.85));
  for (const p of ctx.collections.deathParticles) {
    p.x += p.vx * deltaMs * 0.06; p.y += p.vy * deltaMs * 0.06;
    p.alpha = Math.max(0, 1 - t * 1.5);
    p.vx *= 0.97; p.vy *= 0.97;
  }
  if (phaseMs >= DEATH_ANIM_DURATION_MS + DEATH_HOLD_DURATION_MS) {
    ctx.setScreenDarken(1);
    doRestart(ctx);
    ctx.setRpgPhase('restarting');
    ctx.setPhaseTimerMs(0);
    ctx.setRestartFadeAlpha(0);
  }
}

export function updateRestarting(ctx: RpgDeathRestartCtx, deltaMs: number): void {
  const phaseMs = ctx.getPhaseTimerMs() + deltaMs;
  ctx.setPhaseTimerMs(phaseMs);
  ctx.setRestartFadeAlpha(Math.min(1, phaseMs / RESTART_FADE_IN_MS));
  ctx.setScreenDarken(0);
  if (phaseMs >= RESTART_FADE_IN_MS) ctx.setRpgPhase('alive');
}
