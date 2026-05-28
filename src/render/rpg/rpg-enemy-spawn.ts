/**
 * rpg-enemy-spawn.ts — Enemy placement logic for the RPG tab.
 *
 * Contains `spawnEnemyById`, which places a single enemy of the given type at
 * a valid random position on the canvas.  Extracted from rpg-wave-manager.ts
 * to keep that module focused on wave lifecycle (XP/kill sweeping, queue
 * ticking, inter-wave timing) rather than spawn positioning.
 *
 * Usage:
 *   import { spawnEnemyById } from './rpg-enemy-spawn';
 *   spawnEnemyById(ctx, enemyTypeId);
 */

import type { LaserEnemy, SapphireEnemy } from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy,
  VoidEnemy, QuartzEnemy,
  RubyEnemy, SunstoneEnemy, CitrineEnemy,
  IoliteEnemy, AmethystEnemy, DiamondEnemy,
  NullstoneEnemy, FracterylEnemy, EigensteinEnemy,
  BossEnemy, EliteEnemy, EliteTier,
} from './rpg-enemy-types';
import type {
  DustWispEnemy, RibbonWormEnemy, LanternMothEnemy, EyeStalkEnemy,
  JellyfishEnemy, ClothGhostEnemy, PlantTurretEnemy, GearInsectEnemy,
  SpiderCrawlerEnemy, MoteSwarmEnemy, ShadowHandEnemy,
  SandFishEnemy, QuartzFishEnemy, RubyFishEnemy, SunstoneFishEnemy,
  EmeraldFishEnemy, SapphireFishEnemy, AmethystFishEnemy, DiamondFishEnemy,
} from './rpg-procedural-types';
import type {
  PolyominoEnemy, FissilePolyominoEnemy, RefractorPolyominoEnemy,
} from './polyomino-enemy-types';
import {
  LASER_ENEMY_SIZE, SAPPHIRE_ENEMY_SIZE,
} from './rpg-constants';
import {
  EMERALD_ENEMY_SIZE, AMBER_ENEMY_SIZE,
  QUARTZ_ENEMY_SIZE, RUBY_ENEMY_SIZE, SUNSTONE_ENEMY_SIZE,
  CITRINE_ENEMY_SIZE, IOLITE_ENEMY_SIZE, AMETHYST_ENEMY_SIZE,
  DIAMOND_ENEMY_SIZE,
  FRACTERYL_ENEMY_SIZE, EIGENSTEIN_ENEMY_SIZE,
  STARDUST_SIZE,
} from './rpg-enemy-constants';
import {
  DUSTWISP_SIZE, RIBBONWORM_SIZE, LANTERNMOTH_SIZE, EYESTALK_SIZE,
  JELLYFISH_SIZE, CLOTHGHOST_SIZE, PLANTTURRET_SIZE, GEARINSECT_SIZE,
  SPIDERCRAWLER_SIZE, MOTESWARM_SIZE, SHADOWHAND_SIZE,
  SANDFISH_SIZE, QUARTZFISH_SIZE, RUBYFISH_SIZE, SUNSTONEFISH_SIZE,
  EMERALDFISH_SIZE, SAPPHIREFISH_SIZE, AMETHYSTFISH_SIZE, DIAMONDFISH_SIZE,
} from './rpg-procedural-constants';
import {
  makeLaserEnemy, makeSapphireEnemy,
  makeEmeraldEnemy, makeAmberEnemy, makeVoidEnemy,
  makeQuartzEnemy, makeRubyEnemy,
  makeSunstoneEnemy, makeCitrineEnemy, makeIoliteEnemy,
  makeAmethystEnemy, makeDiamondEnemy,
  makeNullstoneEnemy,
  makeFracterylEnemy,
  makeEigensteinEnemy, makeBossEnemy,
  makeEliteEnemy,
} from './rpg-factories';
import { makeStardustEnemy } from './rpg-stardust-factories';
import {
  makePolyominoEnemy,
  makeFissilePolyominoEnemy,
  makeRefractorPolyominoEnemy,
} from './polyomino-enemy-factories';
import {
  makeDustWispEnemy, makeRibbonWormEnemy, makeLanternMothEnemy, makeEyeStalkEnemy,
  makeJellyfishEnemy, makeClothGhostEnemy, makePlantTurretEnemy, makeGearInsectEnemy,
  makeSpiderCrawlerEnemy, makeMoteSwarmEnemy, makeShadowHandEnemy,
  makeSandFishEnemy, makeQuartzFishEnemy, makeRubyFishEnemy, makeSunstoneFishEnemy,
  makeEmeraldFishEnemy, makeSapphireFishEnemy, makeAmethystFishEnemy, makeDiamondFishEnemy,
} from './rpg-procedural-factories';
import { makeAlivenGroup } from './rpg-aliven-factories';
import { ALIVEN_VARIANTS, MAX_ACTIVE_ALIVEN_GROUPS } from './rpg-aliven-constants';
import {
  recordAlivenSpawn,
  recordAlivenCapSkip,
} from '../../dev/session-telemetry';
import {
  isPointInsideTopographicTerrain,
  type TopographicTerrainState,
} from './terrain/topographic-terrain';
import { isVerdureSpawnRejected, getVerdureSafeFallbackSpawnPos } from './terrain/verdure-cave-walls';
import {
  registerNonEliteEnemy, applyBuffToEnemy, recalcAllNonEliteBuffs,
  type BuffableEnemy,
} from './rpg-elite-buff';
import { spawnEmpowerParticles } from './rpg-elite-empower-particles';

// ── Dependency-injection context ──────────────────────────────────────────────

/**
 * Minimal context required by `spawnEnemyById`.
 * `WaveManagerCtx` (rpg-wave-manager.ts) is a structural superset of this
 * interface, so it can be passed directly.
 */
export interface EnemySpawnCtx {
  dim: { w: number; h: number };
  mote: { x: number; y: number };
  getCurrentWave(): number;
  setBossEnemy(boss: BossEnemy | null): void;
  enterBossWave(): void;
  /** Returns the current topographic terrain state, or null if none is active. */
  getTopographicTerrainState(): TopographicTerrainState | null;
  /** Returns the current Verdure cave wall state, or null if not in Verdure zone. */
  getVerdureCaveWallState?(): import('./terrain/verdure-cave-walls').VerdureCaveWallState | null;

  // Enemy body arrays that receive newly spawned entities
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
  polyominoEnemies: PolyominoEnemy[];
  fissilePolyominoEnemies: FissilePolyominoEnemy[];
  refractorPolyominoEnemies: RefractorPolyominoEnemy[];
  alivenGroups: import('./rpg-aliven-types').AlivenParticleGroup[];
  // ── Procedural creature arrays ──────────────────────────────────────────────
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
  stardustEnemies: import('./rpg-enemy-types').StardustEnemy[];
}

// ── Spawn helper ──────────────────────────────────────────────────────────────

/**
 * Returns all non-elite, non-projectile enemy arrays from the context as a
 * flat array of BuffableEnemy arrays, suitable for passing to
 * `recalcAllNonEliteBuffs`.
 */
function _getNonEliteArrays(ctx: EnemySpawnCtx): ReadonlyArray<ReadonlyArray<BuffableEnemy>> {
  return [
    ctx.enemies as ReadonlyArray<BuffableEnemy>,
    ctx.sapphireEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.emeraldEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.amberEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.voidEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.quartzEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.rubyEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.sunstoneEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.citrineEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.ioliteEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.amethystEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.diamondEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.nullstoneEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.fracterylEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.eigensteinEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.polyominoEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.fissilePolyominoEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.refractorPolyominoEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.stardustEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.dustWispEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.ribbonWormEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.lanternMothEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.eyeStalkEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.jellyfishEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.clothGhostEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.plantTurretEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.gearInsectEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.spiderCrawlerEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.moteSwarmEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.shadowHandEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.sandFishEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.quartzFishEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.rubyFishEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.sunstoneFishEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.emeraldFishEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.sapphireFishEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.amethystFishEnemies as ReadonlyArray<BuffableEnemy>,
    ctx.diamondFishEnemies as ReadonlyArray<BuffableEnemy>,
  ];
}

/**
 * Collects the current positions of all non-elite enemies from the context.
 * Used to determine empower-particle targets when an elite spawns.
 */
function _collectNonElitePositions(ctx: EnemySpawnCtx): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  const arrays = _getNonEliteArrays(ctx);
  for (let a = 0; a < arrays.length; a++) {
    const arr = arrays[a]!;
    for (let i = 0; i < arr.length; i++) {
      positions.push({ x: arr[i]!.x, y: arr[i]!.y });
    }
  }
  return positions;
}

/**
 * Registers a newly-spawned non-elite enemy with the buff system and applies
 * the current elite buff immediately.  Also emits empower particles from every
 * alive elite toward the new enemy's spawn position.
 */
function _onNonEliteSpawned(
  ctx: EnemySpawnCtx,
  enemy: BuffableEnemy,
  spawnX: number,
  spawnY: number,
): void {
  registerNonEliteEnemy(enemy);
  applyBuffToEnemy(enemy, ctx.eliteEnemies.length);
  if (ctx.eliteEnemies.length > 0) {
    const target = [{ x: spawnX, y: spawnY }];
    for (let i = 0; i < ctx.eliteEnemies.length; i++) {
      const e = ctx.eliteEnemies[i]!;
      spawnEmpowerParticles(e.x, e.y, target);
    }
  }
}

/**
 * Called after an elite enemy has been pushed onto ctx.eliteEnemies.
 * Recalculates buffs for all live non-elite enemies and emits particles toward
 * each of them from the elite's spawn position.
 */
function _onEliteSpawned(ctx: EnemySpawnCtx, spawnX: number, spawnY: number): void {
  recalcAllNonEliteBuffs(_getNonEliteArrays(ctx), ctx.eliteEnemies.length);
  const nonElitePositions = _collectNonElitePositions(ctx);
  if (nonElitePositions.length > 0) {
    spawnEmpowerParticles(spawnX, spawnY, nonElitePositions);
  }
}

/**
 * Places a single enemy of the given `enemyTypeId` at a valid random position
 * on the canvas, then pushes it to the appropriate array on `ctx`.
 *
 * Void-type and Nullstone enemies spawn at canvas edges (so they approach from
 * a distance); all others use rejection sampling to avoid spawning on top of
 * the player mote.
 */
export function spawnEnemyById(ctx: EnemySpawnCtx, enemyTypeId: string): void {
  const { dim, mote } = ctx;
  const widthPx  = dim.w;
  const heightPx = dim.h;
  const minDist  = 80;
  let spawnX = 0, spawnY = 0, attempts = 0;
  const wn = ctx.getCurrentWave();
  const terrain = ctx.getTopographicTerrainState();
  const wallState = ctx.getVerdureCaveWallState?.() ?? null;

  if (enemyTypeId === 'laser') {
    const half = LASER_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - LASER_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - LASER_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y;
    }
    const _laser = makeLaserEnemy(spawnX, spawnY, wn);
    ctx.enemies.push(_laser);
    _onNonEliteSpawned(ctx, _laser, spawnX, spawnY);
  } else if (enemyTypeId === 'sapphire') {
    const half = SAPPHIRE_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - SAPPHIRE_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - SAPPHIRE_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y;
    }
    const _sapphire = makeSapphireEnemy(spawnX, spawnY, wn);
    ctx.sapphireEnemies.push(_sapphire);
    _onNonEliteSpawned(ctx, _sapphire, spawnX, spawnY);
  } else if (enemyTypeId === 'emerald') {
    const half = EMERALD_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - EMERALD_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - EMERALD_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y;
    }
    const _emerald = makeEmeraldEnemy(spawnX, spawnY, wn);
    ctx.emeraldEnemies.push(_emerald);
    _onNonEliteSpawned(ctx, _emerald, spawnX, spawnY);
  } else if (enemyTypeId === 'amber') {
    const half = AMBER_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - AMBER_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - AMBER_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y;
    }
    const _amber = makeAmberEnemy(spawnX, spawnY, wn);
    ctx.amberEnemies.push(_amber);
    _onNonEliteSpawned(ctx, _amber, spawnX, spawnY);
  } else if (enemyTypeId === 'void') {
    // Void enemies spawn at edges so they approach from a distance.
    const edge = Math.floor(Math.random() * 4);
    if      (edge === 0) { spawnX = Math.random() * widthPx;  spawnY = 0; }
    else if (edge === 1) { spawnX = Math.random() * widthPx;  spawnY = heightPx; }
    else if (edge === 2) { spawnX = 0;        spawnY = Math.random() * heightPx; }
    else                 { spawnX = widthPx;  spawnY = Math.random() * heightPx; }
    const _void = makeVoidEnemy(spawnX, spawnY, wn);
    ctx.voidEnemies.push(_void);
    _onNonEliteSpawned(ctx, _void, spawnX, spawnY);
  } else if (enemyTypeId === 'quartz') {
    const half = QUARTZ_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - QUARTZ_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - QUARTZ_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y;
    }
    const _quartz = makeQuartzEnemy(spawnX, spawnY, wn);
    ctx.quartzEnemies.push(_quartz);
    _onNonEliteSpawned(ctx, _quartz, spawnX, spawnY);
  } else if (enemyTypeId === 'ruby') {
    const half = RUBY_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - RUBY_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - RUBY_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y;
    }
    const _ruby = makeRubyEnemy(spawnX, spawnY, wn);
    ctx.rubyEnemies.push(_ruby);
    _onNonEliteSpawned(ctx, _ruby, spawnX, spawnY);
  } else if (enemyTypeId === 'sunstone') {
    const half = SUNSTONE_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - SUNSTONE_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - SUNSTONE_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y;
    }
    const _sunstone = makeSunstoneEnemy(spawnX, spawnY, wn);
    ctx.sunstoneEnemies.push(_sunstone);
    _onNonEliteSpawned(ctx, _sunstone, spawnX, spawnY);
  } else if (enemyTypeId === 'citrine') {
    const half = CITRINE_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - CITRINE_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - CITRINE_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y;
    }
    const _citrine = makeCitrineEnemy(spawnX, spawnY, wn);
    ctx.citrineEnemies.push(_citrine);
    _onNonEliteSpawned(ctx, _citrine, spawnX, spawnY);
  } else if (enemyTypeId === 'iolite') {
    const half = IOLITE_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - IOLITE_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - IOLITE_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y;
    }
    const _iolite = makeIoliteEnemy(spawnX, spawnY, wn);
    ctx.ioliteEnemies.push(_iolite);
    _onNonEliteSpawned(ctx, _iolite, spawnX, spawnY);
  } else if (enemyTypeId === 'amethyst') {
    const half = AMETHYST_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - AMETHYST_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - AMETHYST_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y;
    }
    const _amethyst = makeAmethystEnemy(spawnX, spawnY, wn);
    ctx.amethystEnemies.push(_amethyst);
    _onNonEliteSpawned(ctx, _amethyst, spawnX, spawnY);
  } else if (enemyTypeId === 'diamond') {
    const half = DIAMOND_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - DIAMOND_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - DIAMOND_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y;
    }
    const _diamond = makeDiamondEnemy(spawnX, spawnY, wn);
    ctx.diamondEnemies.push(_diamond);
    _onNonEliteSpawned(ctx, _diamond, spawnX, spawnY);
  } else if (enemyTypeId === 'nullstone') {
    // Nullstone spawns at edges to approach from a distance.
    const edge = Math.floor(Math.random() * 4);
    if      (edge === 0) { spawnX = Math.random() * widthPx;  spawnY = 0; }
    else if (edge === 1) { spawnX = Math.random() * widthPx;  spawnY = heightPx; }
    else if (edge === 2) { spawnX = 0;       spawnY = Math.random() * heightPx; }
    else                 { spawnX = widthPx; spawnY = Math.random() * heightPx; }
    const _nullstone = makeNullstoneEnemy(spawnX, spawnY, wn);
    ctx.nullstoneEnemies.push(_nullstone);
    _onNonEliteSpawned(ctx, _nullstone, spawnX, spawnY);
  } else if (enemyTypeId === 'fracteryl') {
    const half = FRACTERYL_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - FRACTERYL_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - FRACTERYL_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y;
    }
    const _fracteryl = makeFracterylEnemy(spawnX, spawnY, wn);
    ctx.fracterylEnemies.push(_fracteryl);
    _onNonEliteSpawned(ctx, _fracteryl, spawnX, spawnY);
  } else if (enemyTypeId === 'eigenstein') {
    const half = EIGENSTEIN_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - EIGENSTEIN_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - EIGENSTEIN_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y;
    }
    const _eigenstein = makeEigensteinEnemy(spawnX, spawnY, wn);
    ctx.eigensteinEnemies.push(_eigenstein);
    _onNonEliteSpawned(ctx, _eigenstein, spawnX, spawnY);
  } else if (enemyTypeId === 'stardust') {
    const half = STARDUST_SIZE;
    do {
      spawnX = half + Math.random() * (widthPx - STARDUST_SIZE * 2);
      spawnY = half + Math.random() * (heightPx - STARDUST_SIZE * 2);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y;
    }
    const _stardust = makeStardustEnemy(spawnX, spawnY, wn, widthPx, heightPx);
    ctx.stardustEnemies.push(_stardust);
    _onNonEliteSpawned(ctx, _stardust, spawnX, spawnY);
  } else if (enemyTypeId === 'verdure_polyomino') {
    const half = 20;
    do {
      spawnX = half + Math.random() * (widthPx - half * 2);
      spawnY = half + Math.random() * (heightPx - half * 2);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y;
    }
    const e = makePolyominoEnemy(spawnX, spawnY, wn);
    ctx.polyominoEnemies.push(e);
    _onNonEliteSpawned(ctx, e, spawnX, spawnY);
  } else if (enemyTypeId === 'verdure_polyomino_fissile') {
    const half = 20;
    do {
      spawnX = half + Math.random() * (widthPx - half * 2);
      spawnY = half + Math.random() * (heightPx - half * 2);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y;
    }
    const e = makeFissilePolyominoEnemy(spawnX, spawnY, wn);
    ctx.fissilePolyominoEnemies.push(e);
    _onNonEliteSpawned(ctx, e, spawnX, spawnY);
  } else if (enemyTypeId === 'verdure_polyomino_refractor') {
    const half = 20;
    do {
      spawnX = half + Math.random() * (widthPx - half * 2);
      spawnY = half + Math.random() * (heightPx - half * 2);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y;
    }
    const e = makeRefractorPolyominoEnemy(spawnX, spawnY, wn);
    ctx.refractorPolyominoEnemies.push(e);
    _onNonEliteSpawned(ctx, e, spawnX, spawnY);
  } else if (enemyTypeId === 'boss') {
    ctx.setBossEnemy(makeBossEnemy(Math.ceil(wn / 100), wn, widthPx, heightPx));
    ctx.enterBossWave();
  } else if (
    enemyTypeId === 'elite_quartz' || enemyTypeId === 'elite_ruby'   ||
    enemyTypeId === 'elite_sunstone' || enemyTypeId === 'elite_citrine' ||
    enemyTypeId === 'elite_iolite'  || enemyTypeId === 'elite_amethyst' ||
    enemyTypeId === 'elite_diamond' || enemyTypeId === 'elite_nullstone'
  ) {
    // Elite enemies spawn at canvas edges so the player sees them approaching.
    const tier = enemyTypeId.slice(6) as EliteTier; // strip "elite_"
    const edge = Math.floor(Math.random() * 4);
    if      (edge === 0) { spawnX = Math.random() * widthPx;  spawnY = 0; }
    else if (edge === 1) { spawnX = Math.random() * widthPx;  spawnY = heightPx; }
    else if (edge === 2) { spawnX = 0;        spawnY = Math.random() * heightPx; }
    else                 { spawnX = widthPx;  spawnY = Math.random() * heightPx; }
    ctx.eliteEnemies.push(makeEliteEnemy(tier, spawnX, spawnY, wn));
    _onEliteSpawned(ctx, spawnX, spawnY);
  } else if (ALIVEN_VARIANTS.includes(enemyTypeId as typeof ALIVEN_VARIANTS[number])) {
    // Guard: skip spawning if the active group count is at the cap.
    if (ctx.alivenGroups.length >= MAX_ACTIVE_ALIVEN_GROUPS) {
      recordAlivenCapSkip();
      return;
    }
    // Aliven particle groups spawn near the edge, away from the player.
    const margin = 30;
    const edge = Math.floor(Math.random() * 4);
    if      (edge === 0) { spawnX = margin + Math.random() * (widthPx  - margin * 2); spawnY = margin; }
    else if (edge === 1) { spawnX = margin + Math.random() * (widthPx  - margin * 2); spawnY = heightPx - margin; }
    else if (edge === 2) { spawnX = margin; spawnY = margin + Math.random() * (heightPx - margin * 2); }
    else                 { spawnX = widthPx - margin; spawnY = margin + Math.random() * (heightPx - margin * 2); }
    ctx.alivenGroups.push(makeAlivenGroup(
      enemyTypeId as typeof ALIVEN_VARIANTS[number],
      spawnX, spawnY, wn,
    ));
    recordAlivenSpawn(enemyTypeId, ctx.alivenGroups.length);
  } else {
    // ── Procedural creature spawns ────────────────────────────────
    const procSizeMap: Record<string, number> = {
      'proc_dustwisp': DUSTWISP_SIZE, 'proc_ribbonworm': RIBBONWORM_SIZE,
      'proc_lanternmoth': LANTERNMOTH_SIZE, 'proc_eyestalk': EYESTALK_SIZE,
      'proc_jellyfish': JELLYFISH_SIZE, 'proc_clothghost': CLOTHGHOST_SIZE,
      'proc_plantturret': PLANTTURRET_SIZE, 'proc_gearinsect': GEARINSECT_SIZE,
      'proc_spidercrawler': SPIDERCRAWLER_SIZE, 'proc_moteswarm': MOTESWARM_SIZE,
      'proc_shadowhand': SHADOWHAND_SIZE,
      'proc_sandfish': SANDFISH_SIZE, 'proc_quartzfish': QUARTZFISH_SIZE,
      'proc_rubyfish': RUBYFISH_SIZE, 'proc_sunstonefish': SUNSTONEFISH_SIZE,
      'proc_emeraldfish': EMERALDFISH_SIZE, 'proc_sapphirefish': SAPPHIREFISH_SIZE,
      'proc_amethystfish': AMETHYSTFISH_SIZE, 'proc_diamondfish': DIAMONDFISH_SIZE,
    };
    const procSize = procSizeMap[enemyTypeId];
    if (procSize !== undefined) {
      const half = procSize;
      do {
        spawnX = half + Math.random() * (widthPx  - procSize * 2);
        spawnY = half + Math.random() * (heightPx - procSize * 2);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist
            && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
        attempts++;
      } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y;
    }
      let _proc: BuffableEnemy | null = null;
      if (enemyTypeId === 'proc_dustwisp')        { const e = makeDustWispEnemy(spawnX, spawnY, wn);       ctx.dustWispEnemies.push(e);       _proc = e; }
      else if (enemyTypeId === 'proc_ribbonworm')  { const e = makeRibbonWormEnemy(spawnX, spawnY, wn);    ctx.ribbonWormEnemies.push(e);      _proc = e; }
      else if (enemyTypeId === 'proc_lanternmoth') { const e = makeLanternMothEnemy(spawnX, spawnY, wn);   ctx.lanternMothEnemies.push(e);     _proc = e; }
      else if (enemyTypeId === 'proc_eyestalk')    { const e = makeEyeStalkEnemy(spawnX, spawnY, wn);      ctx.eyeStalkEnemies.push(e);        _proc = e; }
      else if (enemyTypeId === 'proc_jellyfish')   { const e = makeJellyfishEnemy(spawnX, spawnY, wn);     ctx.jellyfishEnemies.push(e);       _proc = e; }
      else if (enemyTypeId === 'proc_clothghost')  { const e = makeClothGhostEnemy(spawnX, spawnY, wn);    ctx.clothGhostEnemies.push(e);      _proc = e; }
      else if (enemyTypeId === 'proc_plantturret') { const e = makePlantTurretEnemy(spawnX, spawnY, wn);   ctx.plantTurretEnemies.push(e);     _proc = e; }
      else if (enemyTypeId === 'proc_gearinsect')  { const e = makeGearInsectEnemy(spawnX, spawnY, wn);    ctx.gearInsectEnemies.push(e);      _proc = e; }
      else if (enemyTypeId === 'proc_spidercrawler') { const e = makeSpiderCrawlerEnemy(spawnX, spawnY, wn); ctx.spiderCrawlerEnemies.push(e); _proc = e; }
      else if (enemyTypeId === 'proc_moteswarm')   { const e = makeMoteSwarmEnemy(spawnX, spawnY, wn);     ctx.moteSwarmEnemies.push(e);       _proc = e; }
      else if (enemyTypeId === 'proc_shadowhand')  { const e = makeShadowHandEnemy(spawnX, spawnY, wn);    ctx.shadowHandEnemies.push(e);      _proc = e; }
      else if (enemyTypeId === 'proc_sandfish')    { const e = makeSandFishEnemy(spawnX, spawnY, wn);      ctx.sandFishEnemies.push(e);        _proc = e; }
      else if (enemyTypeId === 'proc_quartzfish')  { const e = makeQuartzFishEnemy(spawnX, spawnY, wn);    ctx.quartzFishEnemies.push(e);      _proc = e; }
      else if (enemyTypeId === 'proc_rubyfish')    { const e = makeRubyFishEnemy(spawnX, spawnY, wn);      ctx.rubyFishEnemies.push(e);        _proc = e; }
      else if (enemyTypeId === 'proc_sunstonefish') { const e = makeSunstoneFishEnemy(spawnX, spawnY, wn); ctx.sunstoneFishEnemies.push(e);   _proc = e; }
      else if (enemyTypeId === 'proc_emeraldfish') { const e = makeEmeraldFishEnemy(spawnX, spawnY, wn);   ctx.emeraldFishEnemies.push(e);     _proc = e; }
      else if (enemyTypeId === 'proc_sapphirefish') { const e = makeSapphireFishEnemy(spawnX, spawnY, wn); ctx.sapphireFishEnemies.push(e);   _proc = e; }
      else if (enemyTypeId === 'proc_amethystfish') { const e = makeAmethystFishEnemy(spawnX, spawnY, wn); ctx.amethystFishEnemies.push(e);   _proc = e; }
      else if (enemyTypeId === 'proc_diamondfish') { const e = makeDiamondFishEnemy(spawnX, spawnY, wn);   ctx.diamondFishEnemies.push(e);     _proc = e; }
      if (_proc !== null) _onNonEliteSpawned(ctx, _proc, spawnX, spawnY);
    }
  }
}
