/**
 * rpg-render-update.ts — Per-frame game loop extracted from createRpgRender.
 *
 * runRpgUpdate() performs one simulation step: advances wave state, updates all
 * enemy types, boss, weapons, lucky motes, survival tracking, HP regen, and
 * triggers a render pass.  It is called from the update() method of the
 * RpgRender handle returned by createRpgRender (rpg-render.ts).
 *
 * All mutable state is accessed through RpgUpdateCtx getters/setters so that
 * the closure variables remain the single source of truth inside rpg-render.ts.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import type { TierId } from '../../data/tiers';
import type {
  RpgMote, RpgPhase, RpgPlayerStats,
  LaserEnemy, SapphireEnemy, SapphireMissile,
} from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy, AmberShard, VoidEnemy,
  QuartzEnemy, QuartzSpike, RubyEnemy, RubyBolt,
  SunstoneEnemy, CitrineEnemy, CitrineBolt,
  IoliteEnemy, AmethystEnemy, AmethystShard,
  DiamondEnemy, DiamondShard, NullstoneEnemy, VoidTendril,
  FracterylEnemy, FracterylShard, EigensteinEnemy, EigensteinBeam,
  BossEnemy, BossProjectile,
  TeleportParticle, LuckyMote, LuckyMotePopup, EliteEnemy,
} from './rpg-enemy-types';
import type {
  DustWispEnemy, RibbonWormEnemy, LanternMothEnemy, EyeStalkEnemy,
  JellyfishEnemy, ClothGhostEnemy, PlantTurretEnemy, GearInsectEnemy,
  SpiderCrawlerEnemy, MoteSwarmEnemy, ShadowHandEnemy, PlantProjectile,
  SandFishEnemy, QuartzFishEnemy, RubyFishEnemy, SunstoneFishEnemy,
  EmeraldFishEnemy, SapphireFishEnemy, AmethystFishEnemy, DiamondFishEnemy,
  FishMine, FishSpike, FishBolt, FishDecoy,
} from './rpg-procedural-types';
import type {
  PolyominoEnemy, FissilePolyominoEnemy, RefractorPolyominoEnemy,
} from './polyomino-enemy-types';
import type { AlivenParticleGroup } from './rpg-aliven-types';
import type { RpgEnemyCtx } from './rpg-enemy-updates';
import type { EliteEnemyCtx } from './rpg-elite-enemy-updates';
import type { AlivenUpdateCtx } from './rpg-aliven-updates';
import type { BossUpdateCtx } from './rpg-boss-update';
import type { BossAttackUpdateCtx } from './rpg-boss-attack-update';
import type { BossAttackState } from './rpg-boss-attack-types';
import type { WeaponOrbitCtx } from './rpg-weapon-orbit';
import type { OrbitProjectileCtx } from './rpg-orbit-projectile';
import type { OrbitProjectile } from './rpg-types';
import type { BinaryRingEnemy, BinaryRingMissile, BinaryLaserSweep } from './rpg-binary-ring-encounter';
import type { WeaponTickCtx } from './rpg-weapon-tick';
import type { PlayerMovementCtx, PlayerMovementState } from './rpg-player-movement';
import type { RpgDeathRestartCtx } from './rpg-death-restart';
import type { RpgDrawCtx, RpgDrawFrameState } from './rpg-render-draw';
import {
  updateLuckyMotes, updateLuckyMotePopups,
} from './rpg-lucky-motes';
import {
  updateAlivenGroups,
} from './rpg-aliven-updates';
import { tickParticleLifeMatrix } from './terrain/impetus-particle-life';
import { updateImpetusDust } from './terrain/impetus-space-dust';
import {
  updateEmeraldEnemies, updateAmberEnemies, updateAmberShards, updateVoidEnemies,
  applyEnemyVerdureWallPushOut,
} from './rpg-enemy-updates';
import type { VerdureCaveWallState } from './terrain/verdure-cave-walls';
import {
  updateQuartzEnemies, updateQuartzSpikes,
  updateRubyEnemies, updateRubyBolts,
  updateSunstoneEnemies,
  updateCitrineEnemies, updateCitrineBolts,
} from './rpg-enemy-updates-mid';
import {
  updateLaserEnemies, updateSapphireEnemies, updateSapphireMissiles,
} from './rpg-enemy-updates-basic';
import {
  updateIoliteEnemies,
  updateAmethystEnemies, updateAmethystShards,
  updateDiamondEnemies, updateDiamondShards,
  updateNullstoneEnemies, updateVoidTendrils,
  updateFracterylEnemies,
  updateEigensteinEnemies, updateEigensteinBeams,
  updateTeleportParticles,
} from './rpg-enemy-updates-adv';
import { updateEliteEnemies } from './rpg-elite-enemy-updates';
import {
  createBinaryRingEnemy,
  updateBinaryRingEnemy,
  updateBinaryRingMissiles,
  updateBinaryLaserSweep,
} from './rpg-binary-ring-encounter';
import { updateStardustEnemies } from './rpg-stardust-update';
import { updateHorizonPentagonGroups } from './horizon-pentagon-update';
import { updateSpawnFlashes } from './rpg-spawn-flash';
import { updateDyingEnemies } from './rpg-death-fade';
import {
  updatePolyominoEnemies,
  updateFissilePolyominoEnemies,
  updateRefractorPolyominoEnemies,
} from './polyomino-enemy-update';
import { updateBossEnemy, updateBossProjectiles } from './rpg-boss-update';
import { updateBossAttacks } from './rpg-boss-attack-update';
import { updateOrbitProjectile } from './rpg-orbit-projectile';
import { updatePlayerMovement } from './rpg-player-movement';
import {
  updateDying as _updateDying, updateRestarting as _updateRestarting,
  triggerDeath as _triggerDeath,
} from './rpg-death-restart';
import { updateWeaponOrbitParticles as _updateWeaponOrbitParticles } from './rpg-weapon-orbit';
import { tickWeaponSystems } from './rpg-weapon-tick';
import { drawRpgFramePixelated } from './rpg-pixel-backbuffer';
import { updateProceduralEnemies } from './rpg-procedural-update';
import { updateTopographicTerrain } from './terrain/topographic-terrain';
import type { TopographicTerrainState } from './terrain/topographic-terrain';
import {
  updateBossStageDirector,
  type BossStageDirectorState,
  type BossStageDirectorCtx,
} from './rpg-boss-stage-director';
import { updateEmpowerParticles } from './rpg-elite-empower-particles';
import { spawnNadirCubeEncounter, updateNadirCubePointEnemies, clearNadirCubeEncounter } from './nadir-cube-point-update';
import { tickEnemySpeechBubbles, tickNoDamageBarks } from './rpg-enemy-barks';
import { tickBossDialogue } from './rpg-boss-dialogue';
import type { NadirCubePointEnemy, NadirCubeMine, NadirCubeTrailSegment, NadirCubeTurretBolt, NadirCubeLinkLaser } from './nadir-cube-point-types';
import { tickLensStatuses } from '../../sim/rpg/enemy-status-effects';
import { tickPlayerStatuses, getPlayerAttackSpeedStatusMultiplier } from '../../sim/rpg/player-status-effects';
import { tickLensTier2DelayedEffects } from './lens-tier2-effects';
import { tickLensTier3Effects } from './lens-tier3-effects';
import { createTrueSurfaceElite, TRUE_SURFACE_ROTATION, updateTrueSurfaceElite } from './true-surface-elite';

// ── Enemy array bundle ────────────────────────────────────────────────────────

/**
 * All enemy and projectile arrays needed by a single update tick, bundled so
 * that RpgUpdateCtx doesn't need ~30 individual array fields.
 */
export interface RpgEnemyUpdateArrays {
  enemies: LaserEnemy[];
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
  // ── Procedural creature arrays ──────────────────────────────────────────────
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
  teleportParticles: TeleportParticle[];
  bossProjectiles: BossProjectile[];
  luckyMotes: LuckyMote[];
  luckyMotePopups: LuckyMotePopup[];
}

// ── Update context interface ──────────────────────────────────────────────────

/**
 * All inputs required by one call to runRpgUpdate.
 * Pre-built sub-system contexts are passed by reference; mutable closure
 * variables are accessed through named getters / setters.
 */
export interface RpgUpdateCtx {
  arrays: RpgEnemyUpdateArrays;

  // Mutable render-loop state
  getRpgPhase(): RpgPhase;
  getGlowTimeS(): number;
  addGlowTimeS(v: number): void;
  setAutoMoveEnabled(v: boolean): void;
  getTopographicTerrainState(): TopographicTerrainState | null;

  // Death / restart subsystem
  deathRestartCtx: RpgDeathRestartCtx;

  // Wave management
  getIsInterWave(): boolean;
  getCurrentWave(): number;
  getInterWaveTimerMs(): number;
  setInterWaveTimerMs(v: number): void;
  startNextWave(): void;
  tickSpawnQueue(deltaMs: number): void;
  checkWaveCompletion(): void;

  // Player movement
  movementCtx: PlayerMovementCtx;
  playerMovementState: PlayerMovementState;

  // Enemy update contexts
  enemyCtx: RpgEnemyCtx;
  eliteEnemyCtx: EliteEnemyCtx;
  alivenUpdateCtx: AlivenUpdateCtx;

  // Boss state
  getBossEnemy(): BossEnemy | null;
  getIsBossWaveActive(): boolean;
  bossCtx: BossUpdateCtx;
  bossAttackState: BossAttackState;
  bossAttackCtx: BossAttackUpdateCtx;

  // Boss stage director
  bossStageDirectorState: BossStageDirectorState;
  bossStageDirectorCtx: BossStageDirectorCtx;

  // Weapon systems
  weaponOrbitCtx: WeaponOrbitCtx;
  getOrbitProjectiles(): OrbitProjectile[];
  orbitProjectileCtx: OrbitProjectileCtx;
  weaponTickCtx: WeaponTickCtx;

  // Player damage visuals
  updateShotVisuals(deltaMs: number): void;
  updateDamageNumbers(deltaMs: number): void;
  spawnDamageNumber(x: number, y: number, vx: number, vy: number, text: string, ratio: number, color: string, sourceColor?: string): void;

  // Lucky motes and achievement state
  mote: RpgMote;
  rpgSimState: RpgSimState;
  onLuckyMoteCollected?(tierId: TierId, bonusPct: number): void;

  // Player life
  playerStats: RpgPlayerStats;
  dealDamageToPlayer(damage: number): void;
  triggerDeath(): void;
  getPlayerIFramesMs(): number;
  setPlayerIFramesMs(ms: number): void;

  // Rendering
  statsPanel: { update(): void };
  fluid: { step(deltaMs: number): void };
  drawCtx: RpgDrawCtx;
  drawFrameState: RpgDrawFrameState;
  getBinaryLaserSweep(): BinaryLaserSweep | null;
  setBinaryLaserSweep(sweep: BinaryLaserSweep | null): void;
  /** Updates the Nadir cubic-grid projection for this frame and returns current state. */
  updateAndGetNadirCubeProjectionState?(nowMs: number): import('../background/nadir-cube-projection').NadirCubeProjectionState | null;
  /** Returns the Nadir cube projection state, or null if the background isn't active. */
  getNadirCubeProjectionState?(): import('./nadir-cube-point-types').NadirCubeProjectionState | null;
  /** Optional hook called once per frame to update Verdure zone plants. */
  updateVerdurePlants?(deltaMs: number): void;
}

// ── Per-frame simulation step ─────────────────────────────────────────────────

/**
 * Applies Verdure cave-wall repulsion and push-out to all mobile enemies.
 * Called once per tick when `activeZoneId === 'verdure'`.
 * This is a fail-safe; the primary protection is the nav-grid wall integration.
 */
function _applyVerdureWallPassToArray<T extends { x: number; y: number; vx: number; vy: number }>(
  arr: T[],
  wallState: VerdureCaveWallState,
  halfSize: number,
): void {
  for (let i = 0; i < arr.length; i++) {
    applyEnemyVerdureWallPushOut(arr[i]!, wallState, halfSize);
  }
}

/**
 * Runs one simulation tick: advances all game systems, then renders the frame.
 * Called from the update() method of the RpgRender handle (rpg-render.ts).
 */
export function runRpgUpdate(ctx: RpgUpdateCtx, deltaMs: number, autoMoveEnabled: boolean): void {
  const nowMs = performance.now();
  const nadirProjectionState = ctx.updateAndGetNadirCubeProjectionState?.(nowMs)
    ?? ctx.getNadirCubeProjectionState?.()
    ?? null;
  ctx.addGlowTimeS(deltaMs / 1000);
  const terrainState = ctx.getTopographicTerrainState();
  if (terrainState) updateTopographicTerrain(terrainState, nowMs);
  ctx.setAutoMoveEnabled(autoMoveEnabled);

  const phase = ctx.getRpgPhase();
  if (phase === 'dying') {
    _updateDying(ctx.deathRestartCtx, deltaMs);
    ctx.fluid.step(deltaMs);
    drawRpgFramePixelated(ctx.drawCtx, ctx.drawFrameState, nowMs);
    ctx.statsPanel.update();
    return;
  }
  if (phase === 'restarting') {
    _updateRestarting(ctx.deathRestartCtx, deltaMs);
    ctx.fluid.step(deltaMs);
    drawRpgFramePixelated(ctx.drawCtx, ctx.drawFrameState, nowMs);
    ctx.statsPanel.update();
    return;
  }

  if (ctx.getIsInterWave()) {
    ctx.setInterWaveTimerMs(ctx.getInterWaveTimerMs() - deltaMs);
    if (ctx.getInterWaveTimerMs() <= 0) ctx.startNextWave();
  } else {
    ctx.tickSpawnQueue(deltaMs);
    ctx.checkWaveCompletion();
  }

  const a = ctx.arrays;
  updatePlayerMovement(ctx.movementCtx, ctx.playerMovementState, deltaMs);
  updateLaserEnemies(a.enemies, ctx.enemyCtx, deltaMs, nowMs);
  updateSapphireEnemies(a.sapphireEnemies, a.sapphireMissiles, ctx.enemyCtx, deltaMs);
  updateSapphireMissiles(a.sapphireMissiles, ctx.enemyCtx, deltaMs);
  updateEmeraldEnemies(a.emeraldEnemies, ctx.enemyCtx, deltaMs);
  updateAmberEnemies(a.amberEnemies, a.amberShards, ctx.enemyCtx, deltaMs);
  updateAmberShards(a.amberShards, ctx.enemyCtx, deltaMs);
  updateVoidEnemies(a.voidEnemies, ctx.enemyCtx, deltaMs);
  updateQuartzEnemies(a.quartzEnemies, a.quartzSpikes, ctx.enemyCtx, deltaMs);
  updateQuartzSpikes(a.quartzSpikes, ctx.enemyCtx, deltaMs);
  updateRubyEnemies(a.rubyEnemies, a.rubyBolts, ctx.enemyCtx, deltaMs);
  updateRubyBolts(a.rubyBolts, ctx.enemyCtx, deltaMs);
  updateSunstoneEnemies(a.sunstoneEnemies, ctx.enemyCtx, deltaMs);
  updateCitrineEnemies(a.citrineEnemies, a.citrineBolts, ctx.enemyCtx, deltaMs);
  updateCitrineBolts(a.citrineBolts, ctx.enemyCtx, deltaMs);
  updateIoliteEnemies(a.ioliteEnemies, ctx.enemyCtx, deltaMs);
  updateAmethystEnemies(a.amethystEnemies, a.amethystShards, ctx.enemyCtx, deltaMs);
  updateAmethystShards(a.amethystShards, ctx.enemyCtx, deltaMs);
  updateDiamondEnemies(a.diamondEnemies, a.diamondShards, ctx.enemyCtx, deltaMs);
  updateDiamondShards(a.diamondShards, ctx.enemyCtx, deltaMs);
  updateNullstoneEnemies(a.nullstoneEnemies, a.voidTendrils, ctx.enemyCtx, deltaMs);
  updateVoidTendrils(a.voidTendrils, ctx.enemyCtx, deltaMs);
  updateFracterylEnemies(a.fracterylEnemies, a.fracterylShards, ctx.enemyCtx, deltaMs);
  updateEigensteinEnemies(a.eigensteinEnemies, a.eigensteinBeams, ctx.enemyCtx, deltaMs);
  updateEigensteinBeams(a.eigensteinBeams, ctx.enemyCtx, deltaMs);
  updateEliteEnemies(a.eliteEnemies, ctx.eliteEnemyCtx, deltaMs);
  updatePolyominoEnemies(a.polyominoEnemies, ctx.enemyCtx, deltaMs, nowMs);
  updateFissilePolyominoEnemies(a.fissilePolyominoEnemies, ctx.enemyCtx, deltaMs, nowMs);
  updateRefractorPolyominoEnemies(a.refractorPolyominoEnemies, ctx.enemyCtx, deltaMs, nowMs);

  if (ctx.rpgSimState.activeZoneId === 'horizon' && ctx.rpgSimState.activeSubzoneId === 'zenith' && !ctx.getIsBossWaveActive()) {
    if (a.binaryRingEnemies.length === 0 && ctx.getCurrentWave() % 10 === 0 && !ctx.getIsInterWave()) {
      // Binary ring orbits the safe-core centre (stable under any canvas size).
      const scb = ctx.drawCtx.getFieldSpace().safeCoreBounds;
      a.binaryRingEnemies.push(createBinaryRingEnemy(
        scb.left + scb.width * 0.5,
        scb.top + scb.height * 0.5,
        ctx.getCurrentWave(),
      ));
    }
    if (a.binaryRingEnemies.length > 0) {
      const ring = a.binaryRingEnemies[0]!;
      const scb = ctx.drawCtx.getFieldSpace().safeCoreBounds;
      const result = updateBinaryRingEnemy(
        ring,
        a.binaryRingMissiles,
        ctx.getBinaryLaserSweep(),
        deltaMs,
        ctx.mote.x,
        ctx.mote.y,
        scb.width,
        scb.height,
      );
      ctx.setBinaryLaserSweep(result.setLaserSweep);
      for (let i = 0; i < result.newMissiles.length; i++) a.binaryRingMissiles.push(result.newMissiles[i]!);

      const missileDamage = updateBinaryRingMissiles(a.binaryRingMissiles, deltaMs, ctx.mote.x, ctx.mote.y);
      if (missileDamage > 0) ctx.dealDamageToPlayer(missileDamage);

      const sweep = ctx.getBinaryLaserSweep();
      if (sweep) {
        const laserDamage = updateBinaryLaserSweep(sweep, deltaMs, ctx.mote.x, ctx.mote.y, ring.x, ring.y);
        if (laserDamage > 0) ctx.dealDamageToPlayer(laserDamage);
        if (sweep.lifeMs <= 0) ctx.setBinaryLaserSweep(null);
      }

      if (ring.hp <= 0) {
        a.binaryRingEnemies.length = 0;
        a.binaryRingMissiles.length = 0;
        ctx.setBinaryLaserSweep(null);
      }
    }
  } else if (a.binaryRingEnemies.length > 0 || a.binaryRingMissiles.length > 0 || ctx.getBinaryLaserSweep()) {
    a.binaryRingEnemies.length = 0;
    a.binaryRingMissiles.length = 0;
    ctx.setBinaryLaserSweep(null);
  }

  {
    const isNadirTenthWave =
      ctx.rpgSimState.activeZoneId === 'horizon' &&
      ctx.rpgSimState.activeSubzoneId === 'nadir' &&
      ctx.getCurrentWave() % 10 === 0 &&
      !ctx.getIsBossWaveActive();

    if (isNadirTenthWave) {
      if (a.nadirCubePointEnemies.length === 0 && !ctx.getIsInterWave()) {
        if (nadirProjectionState && nadirProjectionState.gameW > 0) {
          const newEnemies = spawnNadirCubeEncounter(ctx.getCurrentWave(), nadirProjectionState, ctx.mote.x, ctx.mote.y);
          for (const e of newEnemies) a.nadirCubePointEnemies.push(e);
        }
      }

      if (a.nadirCubePointEnemies.length > 0 && nadirProjectionState) {
        updateNadirCubePointEnemies({
          enemies: a.nadirCubePointEnemies,
          mines: a.nadirCubeMines,
          trailSegments: a.nadirCubeTrailSegments,
          turretBolts: a.nadirCubeTurretBolts,
          linkLasers: a.nadirCubeLinkLasers,
          projState: nadirProjectionState,
          playerX: ctx.mote.x,
          playerY: ctx.mote.y,
          playerRadius: 7,
          getPlayerIFramesMs: ctx.getPlayerIFramesMs,
          setPlayerIFramesMs: ctx.setPlayerIFramesMs,
          dealDamageToPlayer: ctx.dealDamageToPlayer,
          spawnDamageNumber: ctx.spawnDamageNumber,
          deltaMs,
        });
        for (let i = a.nadirCubePointEnemies.length - 1; i >= 0; i--) {
          if (a.nadirCubePointEnemies[i]!.hp <= 0) a.nadirCubePointEnemies.splice(i, 1);
        }
      }
    } else if (a.nadirCubePointEnemies.some(p => !p.surfaceKind) || a.nadirCubeMines.length > 0 ||
               a.nadirCubeTrailSegments.length > 0 || a.nadirCubeTurretBolts.length > 0 ||
               a.nadirCubeLinkLasers.length > 0) {
      clearNadirCubeEncounter(
        a.nadirCubePointEnemies,
        a.nadirCubeMines,
        a.nadirCubeTrailSegments,
        a.nadirCubeTurretBolts,
        a.nadirCubeLinkLasers,
      );
    }
  }
  {
    const isTrueZone = ctx.rpgSimState.activeZoneId === 'horizon'
      && ctx.rpgSimState.activeSubzoneId === 'true'
      && !ctx.getIsBossWaveActive();
    const isTrueSuperElite = isTrueZone && ctx.getCurrentWave() % 10 === 0;
    const isTrueElite = isTrueZone && ctx.getCurrentWave() % 10 === 5;
    const hasSurface = a.nadirCubePointEnemies.some(p => p.surfaceKind);
    if ((isTrueElite || isTrueSuperElite) && !ctx.getIsInterWave() && !hasSurface) {
      const eliteIndex = Math.floor(ctx.getCurrentWave() / 10) % TRUE_SURFACE_ROTATION.length;
      const kind = isTrueSuperElite ? 'bohemian_dome' : TRUE_SURFACE_ROTATION[eliteIndex]!;
      a.nadirCubePointEnemies.push(...createTrueSurfaceElite(kind, ctx.getCurrentWave()));
    }
    if (hasSurface || a.nadirCubePointEnemies.some(p => p.surfaceKind)) {
      updateTrueSurfaceElite(a.nadirCubePointEnemies, ctx.enemyCtx.dim.w, ctx.enemyCtx.dim.h, nowMs);
      const deadSurfaceKinds = new Set(
        a.nadirCubePointEnemies.filter(p => p.surfaceCore && p.hp <= 0).map(p => p.surfaceKind),
      );
      for (let i = a.nadirCubePointEnemies.length - 1; i >= 0; i--) {
        const p = a.nadirCubePointEnemies[i]!;
        if (p.surfaceKind && deadSurfaceKinds.has(p.surfaceKind)) a.nadirCubePointEnemies.splice(i, 1);
      }
    }
  }
  // Stardust enemy update (prismatic particle cloud + laser bounce)
  if (a.stardustEnemies.length > 0) {
    const stardustCtx = {
      mote: ctx.mote,
      dim: { w: ctx.enemyCtx.dim.w, h: ctx.enemyCtx.dim.h },
      playerStats: ctx.playerStats,
      getTopographicTerrainState: ctx.getTopographicTerrainState.bind(ctx),
      dealDamageToPlayer: ctx.enemyCtx.dealDamageToPlayer.bind(ctx.enemyCtx),
      spawnDamageNumber: ctx.spawnDamageNumber.bind(ctx),
      fluid: ctx.fluid as any,
    };
    updateStardustEnemies(a.stardustEnemies, stardustCtx, deltaMs);
  }
  // Horizon pentagon mirror-enemy update
  if (a.horizonPentagonGroups.length > 0) {
    updateHorizonPentagonGroups(a.horizonPentagonGroups, {
      mote: ctx.mote,
      dim: { w: ctx.enemyCtx.dim.w, h: ctx.enemyCtx.dim.h },
      dealDamageToPlayer: (atk) => ctx.enemyCtx.dealDamageToPlayer(atk),
    }, deltaMs);
  }
  // AlivenParticle group updates (contact damage, particle-life physics, special abilities)
  updateAlivenGroups(a.alivenGroups, ctx.alivenUpdateCtx, deltaMs);
  // Impetus zone: advance the wave-intro particle-life matrix animation clock
  if (ctx.rpgSimState.activeZoneId === 'impetus') {
    tickParticleLifeMatrix(deltaMs);
    const _fs = ctx.drawCtx.getFieldSpace();
    const _vb = _fs.visibleBounds;
    updateImpetusDust(
      deltaMs,
      _vb.left, _vb.top, _vb.width, _vb.height,
      ctx.mote.x, ctx.mote.y, ctx.mote.vx, ctx.mote.vy,
      a.alivenGroups,
      ctx.drawCtx.weaponSystems,
      ctx.drawCtx.getIsLowGraphicsMode(),
      nowMs,
    );
  }
  // Procedural creatures
  updateProceduralEnemies(a, ctx.enemyCtx, deltaMs);
  // Empower particles (elite-to-non-elite visual effect)
  updateEmpowerParticles(deltaMs);

  // ── Tick lens status effects ─────────────────────────────────────────────────
  tickLensStatuses(a, deltaMs, ctx.mote.x, ctx.mote.y);
  tickPlayerStatuses(ctx.rpgSimState, ctx.playerStats, deltaMs);
  tickLensTier2DelayedEffects(deltaMs);
  tickLensTier3Effects(a, deltaMs);

  // ── Enemy speech bubble barks ────────────────────────────────────────────────
  tickEnemySpeechBubbles(deltaMs);
  tickNoDamageBarks(deltaMs,
    a.enemies, a.sapphireEnemies, a.emeraldEnemies, a.amberEnemies,
    a.voidEnemies, a.quartzEnemies, a.rubyEnemies, a.sunstoneEnemies,
    a.citrineEnemies, a.ioliteEnemies, a.amethystEnemies,
    a.diamondEnemies, a.nullstoneEnemies, a.fracterylEnemies, a.eigensteinEnemies,
    a.eliteEnemies, a.polyominoEnemies, a.fissilePolyominoEnemies, a.refractorPolyominoEnemies,
    a.dustWispEnemies, a.ribbonWormEnemies, a.lanternMothEnemies, a.eyeStalkEnemies,
    a.jellyfishEnemies, a.eliteJellyfishEnemies, a.clothGhostEnemies, a.plantTurretEnemies, a.gearInsectEnemies,
    a.spiderCrawlerEnemies, a.moteSwarmEnemies, a.shadowHandEnemies,
    a.sandFishEnemies, a.quartzFishEnemies, a.rubyFishEnemies, a.sunstoneFishEnemies,
    a.emeraldFishEnemies, a.sapphireFishEnemies, a.amethystFishEnemies, a.diamondFishEnemies,
  );

  const bossEnemy = ctx.getBossEnemy();
  tickBossDialogue(deltaMs, bossEnemy);
  if (bossEnemy) {
    const bossSpeedMult = ctx.getIsBossWaveActive() ? (ctx.rpgSimState.bossSpeedPct / 100) : 1;
    updateBossEnemy(bossEnemy, ctx.bossCtx, deltaMs * bossSpeedMult);
    updateBossProjectiles(a.bossProjectiles, ctx.bossCtx, deltaMs * bossSpeedMult);
    if (ctx.getIsBossWaveActive()) {
      // Stage director owns the hazard schedule during boss-wave fights.
      // Tick existing special attacks (so they expire) but pass null boss to
      // prevent spawning new ones; stage director generates corridor-safe hazards.
      updateBossAttacks(ctx.bossAttackState, ctx.bossAttackCtx, null, deltaMs * bossSpeedMult);
      updateBossStageDirector(
        ctx.bossStageDirectorState,
        ctx.bossStageDirectorCtx,
        ctx.mote.x,
        ctx.mote.y,
        bossEnemy.x,
        bossEnemy.y,
        deltaMs * bossSpeedMult,
      );
    } else {
      updateBossAttacks(ctx.bossAttackState, ctx.bossAttackCtx, bossEnemy, deltaMs * bossSpeedMult);
    }
  } else {
    updateBossProjectiles(a.bossProjectiles, ctx.bossCtx, deltaMs);
    updateBossAttacks(ctx.bossAttackState, ctx.bossAttackCtx, null, deltaMs);
  }
  updateTeleportParticles(a.teleportParticles, deltaMs);
  _updateWeaponOrbitParticles(ctx.weaponOrbitCtx, deltaMs);
  for (const op of ctx.getOrbitProjectiles()) {
    updateOrbitProjectile(ctx.orbitProjectileCtx, op, deltaMs);
  }
  tickWeaponSystems(ctx.weaponTickCtx, deltaMs);
  ctx.updateShotVisuals(deltaMs);
  ctx.updateDamageNumbers(deltaMs);
  updateSpawnFlashes(deltaMs);
  updateDyingEnemies(deltaMs);

  // Track lucky motes collected for achievements
  const luckyMoteCallback = (tierId: TierId, bonusPct: number, ageMs: number, fromElite: boolean) => {
    ctx.rpgSimState.lifetimeLuckyMotesCollected++;
    const nowTs = performance.now();
    // lucky_mote_within_1s: collected within 1 second of spawning
    if (ageMs <= 1000) ctx.rpgSimState.secretAchievementFlags.add('lucky_mote_within_1s');
    // lucky_mote_during_boss_fight: boss was active when collected
    if (bossEnemy !== null) ctx.rpgSimState.secretAchievementFlags.add('lucky_mote_during_boss_fight');
    // lucky_mote_from_elite
    if (fromElite) ctx.rpgSimState.secretAchievementFlags.add('lucky_mote_from_elite');
    // lucky_mote_triple_10s: 3 motes collected within 10 seconds
    ctx.rpgSimState.luckyMoteCollectedTimestampsMs.push(nowTs);
    const MAX_LUCKY_MOTE_TIMESTAMPS = 20;
    if (ctx.rpgSimState.luckyMoteCollectedTimestampsMs.length > MAX_LUCKY_MOTE_TIMESTAMPS) {
      ctx.rpgSimState.luckyMoteCollectedTimestampsMs.shift();
    }
    const tenSecondsAgo = nowTs - 10_000;
    let recentCount = 0;
    for (const ts of ctx.rpgSimState.luckyMoteCollectedTimestampsMs) {
      if (ts >= tenSecondsAgo) recentCount++;
    }
    if (recentCount >= 3) ctx.rpgSimState.secretAchievementFlags.add('lucky_mote_triple_10s');
    if (ctx.onLuckyMoteCollected) ctx.onLuckyMoteCollected(tierId, bonusPct);
  };
  const moteMagnetRank = ctx.rpgSimState ? (ctx.rpgSimState.rpgUpgradeLevels.get('mote_magnetism') ?? 0) : 0;
  const motePickupMult = 1 + moteMagnetRank * 0.3;
  updateLuckyMotes(a.luckyMotes, a.luckyMotePopups, ctx.mote.x, ctx.mote.y, deltaMs, luckyMoteCallback, motePickupMult);
  updateLuckyMotePopups(a.luckyMotePopups, deltaMs);

  // Accumulate survival time
  ctx.rpgSimState.totalRpgSurvivalMs += deltaMs;

  // Track low-HP survival time for secret achievement
  if (ctx.playerStats.maxHp > 0 && ctx.playerStats.hp > 0 && ctx.playerStats.hp / ctx.playerStats.maxHp <= 0.10) {
    ctx.rpgSimState.lowHpAccumulatedMs += deltaMs;
    if (ctx.rpgSimState.lowHpAccumulatedMs >= 60_000) {
      ctx.rpgSimState.secretAchievementFlags.add('survived_60s_low_hp');
    }
  } else {
    ctx.rpgSimState.lowHpAccumulatedMs = 0;
  }

  // Apply HP regen: regenerate regen% of maxHp per second when alive.
  if (ctx.getRpgPhase() === 'alive' && ctx.playerStats.hp > 0 && ctx.playerStats.hp < ctx.playerStats.maxHp) {
    ctx.playerStats.hp = Math.min(
      ctx.playerStats.maxHp,
      ctx.playerStats.hp + (ctx.playerStats.regen / 100) * ctx.playerStats.maxHp * (deltaMs / 1000),
    );
  }

  if (ctx.playerStats.hp <= 0) ctx.triggerDeath();
  ctx.statsPanel.update();

  // Verdure cave-wall enemy push-out pass: ensure all mobile enemies remain
  // outside the organic wall band.  The nav-grid integration is the primary
  // protection; this is a per-frame fail-safe for any that slip through.
  const _verdureWallState = ctx.enemyCtx.getVerdureCaveWallState?.();
  if (_verdureWallState) {
    const _HW = 6; // conservative half-size default for all enemy types (px)
    _applyVerdureWallPassToArray(a.enemies,          _verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.sapphireEnemies,  _verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.emeraldEnemies,   _verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.amberEnemies,     _verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.voidEnemies,      _verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.quartzEnemies,    _verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.rubyEnemies,      _verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.sunstoneEnemies,  _verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.citrineEnemies,   _verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.ioliteEnemies,    _verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.amethystEnemies,  _verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.diamondEnemies,   _verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.nullstoneEnemies, _verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.fracterylEnemies, _verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.eigensteinEnemies,_verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.eliteEnemies,     _verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.dustWispEnemies,  _verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.ribbonWormEnemies,_verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.lanternMothEnemies,_verdureWallState,_HW);
    _applyVerdureWallPassToArray(a.eyeStalkEnemies,  _verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.jellyfishEnemies,      _verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.eliteJellyfishEnemies, _verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.clothGhostEnemies,     _verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.gearInsectEnemies,_verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.spiderCrawlerEnemies,_verdureWallState,_HW);
    _applyVerdureWallPassToArray(a.moteSwarmEnemies, _verdureWallState, _HW);
    _applyVerdureWallPassToArray(a.shadowHandEnemies,_verdureWallState, _HW);
  }

  ctx.updateVerdurePlants?.(deltaMs);
  ctx.fluid.step(deltaMs);
  drawRpgFramePixelated(ctx.drawCtx, ctx.drawFrameState, nowMs);
}
