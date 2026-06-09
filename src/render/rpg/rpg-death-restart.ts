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

import type {
  RpgMote, RpgPhase, DeathParticle, HitEffect, ShotLine, DamageNumber,
  RpgPlayerStats, SpawnEntry, LaserEnemy, SapphireEnemy, SapphireMissile,
} from './rpg-types';
import type { PlayerMovementState } from './rpg-player-movement';
import type { BinaryRingEnemy, BinaryRingMissile } from './rpg-binary-ring-encounter';
import type { NadirCubePointEnemy, NadirCubeMine, NadirCubeTrailSegment, NadirCubeTurretBolt, NadirCubeLinkLaser } from './nadir-cube-point-types';
import type {
  EmeraldEnemy,
  AmberEnemy, AmberShard,
  VoidEnemy, QuartzEnemy, QuartzSpike,
  RubyEnemy, RubyBolt,
  SunstoneEnemy, CitrineEnemy, CitrineBolt,
  IoliteEnemy, AmethystEnemy, AmethystShard,
  DiamondEnemy, DiamondShard,
  NullstoneEnemy, VoidTendril,
  BossEnemy, BossProjectile,
  FracterylEnemy, FracterylShard,
  EigensteinEnemy, EigensteinBeam,
  LuckyMote, LuckyMotePopup,
  EliteEnemy,
} from './rpg-enemy-types';
import type {
  PolyominoEnemy, FissilePolyominoEnemy, RefractorPolyominoEnemy,
} from './polyomino-enemy-types';
import type { AlivenParticleGroup } from './rpg-aliven-types';
import type { BossAttackState } from './rpg-boss-attack-types';
import type { RpgWeaponHandle } from './rpg-weapon-systems';
import type {
  DustWispEnemy, RibbonWormEnemy, LanternMothEnemy, EyeStalkEnemy,
  JellyfishEnemy, ClothGhostEnemy, PlantTurretEnemy, GearInsectEnemy,
  SpiderCrawlerEnemy, MoteSwarmEnemy, ShadowHandEnemy, PlantProjectile,
  SandFishEnemy, QuartzFishEnemy, RubyFishEnemy, SunstoneFishEnemy,
  EmeraldFishEnemy, SapphireFishEnemy, AmethystFishEnemy, DiamondFishEnemy,
  FishMine, FishSpike, FishBolt, FishDecoy,
} from './rpg-procedural-types';
import {
  DEATH_BURST_COUNT, DEATH_PARTICLE_COLORS,
  DEATH_ANIM_DURATION_MS, DEATH_HOLD_DURATION_MS, RESTART_FADE_IN_MS,
  INTER_WAVE_DELAY_MS,
} from './rpg-constants';
import { clearSpawnFlashes } from './rpg-spawn-flash';
import { clearDyingEnemies } from './rpg-death-fade';

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

  // ── Particle arrays ─────────────────────────────────────────────
  deathParticles: DeathParticle[];

  // ── Player / physics ────────────────────────────────────────────
  mote: RpgMote;
  playerStats: RpgPlayerStats;
  playerMovementState: PlayerMovementState;

  // ── Entity arrays (cleared on restart) ──────────────────────────
  enemies: LaserEnemy[];
  spawnQueue: SpawnEntry[];
  sapphireEnemies: SapphireEnemy[];
  sapphireMissiles: SapphireMissile[];
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
  eigensteinBeams: EigensteinBeam[];
  eliteEnemies: EliteEnemy[];
  polyominoEnemies: PolyominoEnemy[];
  fissilePolyominoEnemies: FissilePolyominoEnemy[];
  refractorPolyominoEnemies: RefractorPolyominoEnemy[];
  binaryRingEnemies: BinaryRingEnemy[];
  binaryRingMissiles: BinaryRingMissile[];
  nadirCubePointEnemies: NadirCubePointEnemy[];
  nadirCubeMines: NadirCubeMine[];
  nadirCubeTrailSegments: NadirCubeTrailSegment[];
  nadirCubeTurretBolts: NadirCubeTurretBolt[];
  nadirCubeLinkLasers: NadirCubeLinkLaser[];
  stardustEnemies: import('./rpg-enemy-types').StardustEnemy[];
  horizonPentagonGroups: import('./horizon-pentagon-types').HorizonPentagonGroup[];
  alivenGroups: AlivenParticleGroup[];
  // ── Procedural creature arrays (cleared on restart) ──────────────────────────
  dustWispEnemies: DustWispEnemy[];
  ribbonWormEnemies: RibbonWormEnemy[];
  lanternMothEnemies: LanternMothEnemy[];
  eyeStalkEnemies: EyeStalkEnemy[];
  jellyfishEnemies: JellyfishEnemy[];
  eliteJellyfishEnemies: import('./rpg-jellyfish-elite-types').EliteJellyfishEnemy[];
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
  bossProjectiles: BossProjectile[];
  luckyMotes: LuckyMote[];
  luckyMotePopups: LuckyMotePopup[];
  hitEffects: HitEffect[];
  shotLines: ShotLine[];
  damageNumbers: DamageNumber[];

  // ── Systems cleared on restart ───────────────────────────────────
  bossAttackState: BossAttackState;
  weaponSystems: RpgWeaponHandle;
  weaponAttackTimers: Map<string, number>;
  fluid: { reset(): void };
  bossWave: { exitBossWave(): void };

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
  ctx.setRpgPhase('dying');
  ctx.setPhaseTimerMs(0);
  ctx.setDeathAlpha(1);
  ctx.deathParticles.length = 0;
  for (let i = 0; i < DEATH_BURST_COUNT; i++) {
    const angle = (i / DEATH_BURST_COUNT) * Math.PI * 2 + Math.random() * 0.35;
    const speed = 0.8 + Math.random() * 1.8;
    ctx.deathParticles.push({
      x: ctx.mote.x, y: ctx.mote.y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      alpha: 1, size: 1.5 + Math.random() * 2,
      color: DEATH_PARTICLE_COLORS[Math.floor(Math.random() * DEATH_PARTICLE_COLORS.length)],
    });
  }
}

export function doRestart(ctx: RpgDeathRestartCtx): void {
  ctx.playerStats.hp = ctx.playerStats.maxHp;
  ctx.enemies.length = 0; ctx.spawnQueue.length = 0;
  ctx.sapphireEnemies.length = 0; ctx.sapphireMissiles.length = 0;
  ctx.emeraldEnemies.length = 0;
  ctx.amberEnemies.length = 0; ctx.amberShards.length = 0;
  ctx.voidEnemies.length = 0;
  ctx.quartzEnemies.length = 0; ctx.quartzSpikes.length = 0;
  ctx.rubyEnemies.length = 0; ctx.rubyBolts.length = 0;
  ctx.sunstoneEnemies.length = 0;
  ctx.citrineEnemies.length = 0; ctx.citrineBolts.length = 0;
  ctx.ioliteEnemies.length = 0;
  ctx.amethystEnemies.length = 0; ctx.amethystShards.length = 0;
  ctx.diamondEnemies.length = 0; ctx.diamondShards.length = 0;
  ctx.nullstoneEnemies.length = 0; ctx.voidTendrils.length = 0;
  ctx.fracterylEnemies.length = 0; ctx.fracterylShards.length = 0;
  ctx.eigensteinEnemies.length = 0; ctx.eigensteinBeams.length = 0;
  ctx.eliteEnemies.length = 0;
  ctx.polyominoEnemies.length = 0;
  ctx.fissilePolyominoEnemies.length = 0;
  ctx.refractorPolyominoEnemies.length = 0;
  ctx.binaryRingEnemies.length = 0;
  ctx.binaryRingMissiles.length = 0;
  ctx.nadirCubePointEnemies.length = 0;
  ctx.nadirCubeMines.length = 0;
  ctx.nadirCubeTrailSegments.length = 0;
  ctx.nadirCubeTurretBolts.length = 0;
  ctx.nadirCubeLinkLasers.length = 0;
  ctx.horizonPentagonGroups.length = 0;
  ctx.alivenGroups.length = 0;
  ctx.dustWispEnemies.length = 0; ctx.ribbonWormEnemies.length = 0;
  ctx.lanternMothEnemies.length = 0; ctx.eyeStalkEnemies.length = 0;
  ctx.jellyfishEnemies.length = 0; ctx.eliteJellyfishEnemies.length = 0; ctx.clothGhostEnemies.length = 0;
  ctx.plantTurretEnemies.length = 0; ctx.gearInsectEnemies.length = 0;
  ctx.spiderCrawlerEnemies.length = 0; ctx.moteSwarmEnemies.length = 0;
  ctx.shadowHandEnemies.length = 0;
  ctx.sandFishEnemies.length = 0; ctx.quartzFishEnemies.length = 0;
  ctx.rubyFishEnemies.length = 0; ctx.sunstoneFishEnemies.length = 0;
  ctx.emeraldFishEnemies.length = 0; ctx.sapphireFishEnemies.length = 0;
  ctx.amethystFishEnemies.length = 0; ctx.diamondFishEnemies.length = 0;
  ctx.plantProjectiles.length = 0; ctx.fishMines.length = 0;
  ctx.fishSpikes.length = 0; ctx.fishBolts.length = 0; ctx.fishDecoys.length = 0;
  ctx.setDanmakuSafeZone(null);
  ctx.bossWave.exitBossWave();
  ctx.setIsBossFightFromMenu(false);
  ctx.setBossEnemy(null);
  ctx.setBinaryLaserSweep(null);
  ctx.bossProjectiles.length = 0;
  ctx.bossAttackState.attacks.length = 0;
  ctx.bossAttackState.schedulerCooldowns.clear();
  ctx.bossAttackState.activePressure = 0;
  ctx.weaponSystems.reset();
  ctx.mote.x = ctx.getWidthPx() / 2; ctx.mote.y = ctx.getHeightPx() / 2;
  ctx.mote.vx = ctx.mote.vy = 0; ctx.mote.trailHead = 0; ctx.mote.trailCount = 0;
  ctx.deathParticles.length = 0;
  ctx.playerMovementState.glowMovementIntensity = 0;
  ctx.setBossHitsInRound(0);
  ctx.setCurrentWave(ctx.rpgSimState.respawnWave);
  ctx.setIsInterWave(true);
  ctx.setInterWaveTimerMs(INTER_WAVE_DELAY_MS * 0.4);
  ctx.setScreenDarken(0);
  ctx.weaponAttackTimers.clear();
  ctx.hitEffects.length = 0; ctx.shotLines.length = 0;
  ctx.damageNumbers.length = 0;
  clearSpawnFlashes();
  clearDyingEnemies();
  ctx.setPlayerIFramesMs(0);
  ctx.luckyMotes.length = 0; ctx.luckyMotePopups.length = 0;
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
  for (const p of ctx.deathParticles) {
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
