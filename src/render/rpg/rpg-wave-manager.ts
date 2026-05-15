/**
 * rpg-wave-manager.ts — Wave lifecycle management for the RPG tab.
 *
 * Extracted from rpg-render.ts to keep that module focused on orchestration
 * and drawing. This module owns the full lifecycle of enemy waves:
 *
 *   • removeDeadEnemies — sweeps dead enemies, awards XP, handles boss defeat
 *   • startNextWave     — increments wave counter and builds the spawn queue
 *   • checkWaveCompletion — detects all-clear and starts the inter-wave delay
 *   • tickSpawnQueue    — drains the timed spawn queue each frame
 *
 * Enemy placement logic (spawnEnemyById) has been extracted to rpg-enemy-spawn.ts.
 * Dead-enemy sweep logic has been extracted to rpg-wave-dead-enemies.ts.
 *
 * The factory `createWaveManager(ctx)` receives a `WaveManagerCtx`
 * dependency-injection object and returns a `WaveManagerHandle` exposing the
 * four public functions called by rpg-render.ts.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getWaveDefinition } from '../../data/rpg/wave-definitions';
import { INTER_WAVE_DELAY_MS } from './rpg-constants';
import { spawnEnemyById } from './rpg-enemy-spawn';
import { removeDeadEnemiesImpl } from './rpg-wave-dead-enemies';
import type {
  LaserEnemy, SapphireEnemy, SapphireMissile, SpawnEntry,
} from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy, AmberShard,
  VoidEnemy, QuartzEnemy, QuartzSpike,
  RubyEnemy, RubyBolt, SunstoneEnemy, CitrineEnemy, CitrineBolt,
  IoliteEnemy, AmethystEnemy, AmethystShard,
  DiamondEnemy, DiamondShard, NullstoneEnemy, VoidTendril,
  FracterylEnemy, FracterylShard, EigensteinEnemy,
  BossEnemy, BossProjectile,
  LuckyMote, EliteEnemy,
} from './rpg-enemy-types';

// ── Dependency-injection context ──────────────────────────────────────────

export interface WaveManagerCtx {
  dim: { w: number; h: number };
  mote: { x: number; y: number };
  rpgSimState: RpgSimState;

  // Enemy arrays — passed by reference; module pushes to and splices from these
  enemies: LaserEnemy[];
  sapphireMissiles: SapphireMissile[];
  sapphireEnemies: SapphireEnemy[];
  emeraldEnemies: EmeraldEnemy[];
  amberEnemies: AmberEnemy[];
  amberShards: AmberShard[];
  voidEnemies: VoidEnemy[];
  quartzEnemies: QuartzEnemy[];
  quartzSpikes: QuartzSpike[];
  rubyEnemies: RubyEnemy[];
  rubyBolts: RubyBolt[];
  sunstoneEnemies: SunstoneEnemy[];
  citrineEnemies: CitrineEnemy[];
  citrineBolts: CitrineBolt[];
  ioliteEnemies: IoliteEnemy[];
  amethystEnemies: AmethystEnemy[];
  amethystShards: AmethystShard[];
  diamondEnemies: DiamondEnemy[];
  diamondShards: DiamondShard[];
  nullstoneEnemies: NullstoneEnemy[];
  voidTendrils: VoidTendril[];
  fracterylEnemies: FracterylEnemy[];
  fracterylShards: FracterylShard[];
  eigensteinEnemies: EigensteinEnemy[];
  eliteEnemies: EliteEnemy[];
  alivenGroups: import('./rpg-aliven-types').AlivenParticleGroup[];
  bossProjectiles: BossProjectile[];
  spawnQueue: SpawnEntry[];
  luckyMotes: LuckyMote[];

  fluid: {
    addExplosion(x: number, y: number, strength: number, r: number, g: number, b: number): void;
  };

  getCachedLuckPercent(): number;
  applyEquipmentStats(): void;
  spawnDamageNumber(x: number, y: number, vx: number, vy: number, text: string, ratio: number, color: string): void;
  /** Returns the current player HP ratio (0–1). Used for HP-based secret achievement flags. */
  getPlayerHpRatio(): number;

  // Scalar state — accessed via getter/setter lambdas to allow write-back
  getBossEnemy(): BossEnemy | null;
  setBossEnemy(boss: BossEnemy | null): void;
  getIsBossFightFromMenu(): boolean;
  setIsBossFightFromMenu(b: boolean): void;
  getCurrentWave(): number;
  setCurrentWave(wave: number): void;
  getIsInterWave(): boolean;
  setIsInterWave(b: boolean): void;
  setInterWaveTimerMs(ms: number): void;
  enterBossWave(): void;
  exitBossWave(): void;
}

// ── Handle returned to rpg-render.ts ─────────────────────────────────────

export interface WaveManagerHandle {
  removeDeadEnemies(): void;
  startNextWave(): void;
  checkWaveCompletion(): void;
  tickSpawnQueue(deltaMs: number): void;
  /** Called each frame when the player's HP decreases (not from regen loss). */
  onPlayerHit(): void;
}

// ── Factory ───────────────────────────────────────────────────────────────

export function createWaveManager(ctx: WaveManagerCtx): WaveManagerHandle {
  const {
    rpgSimState,
    enemies, sapphireEnemies, emeraldEnemies,
    amberEnemies, voidEnemies, quartzEnemies,
    rubyEnemies, sunstoneEnemies, citrineEnemies,
    ioliteEnemies, amethystEnemies, diamondEnemies,
    nullstoneEnemies, fracterylEnemies, eigensteinEnemies,
    eliteEnemies, alivenGroups,
    spawnQueue,
    getPlayerHpRatio,
  } = ctx;

  /** Increments the per-type kill counter in lifetimeKillsByType. */
  function addKill(typeId: string): void {
    rpgSimState.lifetimeKillsByType.set(typeId, (rpgSimState.lifetimeKillsByType.get(typeId) ?? 0) + 1);
  }

  function removeDeadEnemies(): void {
    removeDeadEnemiesImpl(ctx, addKill);
  }

  function startNextWave(): void {
    let wave = ctx.getCurrentWave() + 1;
    // Boss waves (multiples of 100) are fought via the RPG menu, not auto-progression.
    while (wave > 0 && wave % 100 === 0) {
      wave += 1;
    }
    ctx.setCurrentWave(wave);
    if (wave > rpgSimState.highestWaveReached) {
      rpgSimState.highestWaveReached = wave;
    }
    // Reset per-wave state
    rpgSimState.equipChangedDuringInterwave = false;
    const waveDef = getWaveDefinition(wave);
    spawnQueue.length = 0;
    for (const spawn of waveDef.spawns) {
      for (let i = 0; i < spawn.count; i++) {
        spawnQueue.push({ enemyTypeId: spawn.enemyTypeId, timerMs: spawn.spawnDelay * i });
      }
    }
    ctx.setIsInterWave(false);
  }

  function checkWaveCompletion(): void {
    if (ctx.getIsInterWave() || spawnQueue.length > 0
        || enemies.length > 0 || sapphireEnemies.length > 0
        || emeraldEnemies.length > 0 || amberEnemies.length > 0 || voidEnemies.length > 0
        || quartzEnemies.length > 0 || rubyEnemies.length > 0 || sunstoneEnemies.length > 0
        || citrineEnemies.length > 0 || ioliteEnemies.length > 0 || amethystEnemies.length > 0
        || diamondEnemies.length > 0 || nullstoneEnemies.length > 0
        || fracterylEnemies.length > 0 || eigensteinEnemies.length > 0
        || eliteEnemies.length > 0
        || ctx.getBossEnemy() !== null) return;
    // Aliven groups alive: either still partially spawned or still have live particles
    for (const group of alivenGroups) {
      if (group.spawnedCount < group.targetCount || group.aliveCount > 0) return;
    }
    ctx.setIsInterWave(true);
    ctx.setInterWaveTimerMs(INTER_WAVE_DELAY_MS);
    // Wave completed — update tracking counters
    rpgSimState.totalWavesCompleted++;
    rpgSimState.consecutiveWaveStreak++;
    if (!rpgSimState.tookDamageThisWave) {
      rpgSimState.damageFreeWaveStreak++;
      if (rpgSimState.damageFreeWaveStreak > rpgSimState.bestDamageFreeWaveStreak) {
        rpgSimState.bestDamageFreeWaveStreak = rpgSimState.damageFreeWaveStreak;
      }
    } else {
      rpgSimState.damageFreeWaveStreak = 0;
    }
    // Secret flags for wave completion
    const hpRatio = getPlayerHpRatio();
    if (hpRatio > 0 && hpRatio < 0.05) {
      rpgSimState.secretAchievementFlags.add('wave_clear_1hp');
    }
    if (rpgSimState.equippedWeaponIds.size === 1) {
      rpgSimState.secretAchievementFlags.add('wave_clear_1_weapon');
    }
    if (rpgSimState.equipChangedDuringInterwave) {
      rpgSimState.secretAchievementFlags.add('wave_clear_after_equip_swap');
    }
    // wave_clear_all_diff_weapon_tiers: all equipped weapons at different tiers
    if (rpgSimState.equippedWeaponIds.size >= 2) {
      const tiers = Array.from(rpgSimState.equippedWeaponIds).map(
        wid => rpgSimState.weaponTiersByWeaponId.get(wid) ?? 1,
      );
      const tierSet = new Set(tiers);
      if (tierSet.size === tiers.length) {
        rpgSimState.secretAchievementFlags.add('wave_clear_all_diff_weapon_tiers');
      }
    }
    rpgSimState.tookDamageThisWave = false;
  }

  function tickSpawnQueue(deltaMs: number): void {
    if (ctx.getIsInterWave()) return;
    for (let i = spawnQueue.length - 1; i >= 0; i--) {
      spawnQueue[i].timerMs -= deltaMs;
      if (spawnQueue[i].timerMs <= 0) {
        spawnEnemyById(ctx, spawnQueue[i].enemyTypeId);
        spawnQueue.splice(i, 1);
      }
    }
  }

  function onPlayerHit(): void {
    rpgSimState.tookDamageThisWave = true;
  }

  return { removeDeadEnemies, startNextWave, checkWaveCompletion, tickSpawnQueue, onPlayerHit };
}
