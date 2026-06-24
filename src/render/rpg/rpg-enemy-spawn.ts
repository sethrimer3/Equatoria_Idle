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
import { makeHorizonPentagonGroup, makeTrueGalaxyGroup } from './horizon-pentagon-factories';
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
import type { EliteJellyfishEnemy } from './rpg-jellyfish-elite-types';
import {
  makeBasicJellyfishEnemy, makeLongtailJellyfishEnemy,
  makeWhiplashJellyfishEnemy, makeEncirclingJellyfishEnemy,
} from './rpg-jellyfish-elite-factories';
import { ELITE_JELLYFISH_BASE_SIZE } from './rpg-jellyfish-elite-constants';
import { makeAlivenGroup } from './rpg-aliven-factories';
import { pushSpawnFlash } from './rpg-spawn-flash';
import { ALIVEN_VARIANTS, ALIVEN_ELITE_VARIANTS, MAX_ACTIVE_ALIVEN_GROUPS } from './rpg-aliven-constants';
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
import type { RpgFieldSpace } from './rpgFieldSpace';

// ── Dependency-injection context ──────────────────────────────────────────────

/**
 * Minimal context required by `spawnEnemyById`.
 * `WaveManagerCtx` (rpg-wave-manager.ts) is a structural superset of this
 * interface, so it can be passed directly.
 */
export interface EnemySpawnCtx {
  /**
   * Authoritative field-space snapshot — provides `spawnBounds` for random
   * placement and `safeCoreBounds` for intentional central positioning (bosses).
   * Updated on every canvas resize via the shared closure in rpg-render.ts.
   */
  getFieldSpace(): RpgFieldSpace;
  mote: { x: number; y: number };
  getCurrentWave(): number;
  setBossEnemy(boss: BossEnemy | null): void;
  enterBossWave(): void;
  /** Returns the current topographic terrain state, or null if none is active. */
  getTopographicTerrainState(): TopographicTerrainState | null;
  /** Returns the current Verdure cave wall state, or null if not in Verdure zone. */
  getVerdureCaveWallState?(): import('./terrain/verdure-cave-walls').VerdureCaveWallState | null;
  /** Returns true when dev/diagnostic mode is active (spawn debug overlay recording). */
  getIsDevMode?(): boolean;

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
  stardustEnemies: import('./rpg-enemy-types').StardustEnemy[];
  horizonPentagonGroups: import('./horizon-pentagon-types').HorizonPentagonGroup[];
}

// ── Dev-mode spawn-candidate debug log ───────────────────────────────────────

/** Kind of spawn outcome recorded for the debug overlay. */
export type SpawnDebugKind = 'accepted' | 'rejected' | 'fallback';

/** One recorded spawn candidate position (ring-buffer entry). */
export interface SpawnDebugEntry { x: number; y: number; kind: SpawnDebugKind }

/** How many entries to keep in the ring buffer. */
const SPAWN_DEBUG_CAP = 64;

/** Circular ring-buffer of recent spawn candidate positions. */
const _spawnDebugLog: SpawnDebugEntry[] = [];

/**
 * Returns a read-only view of the recent spawn-candidate debug log.
 * Only populated when dev mode is active (callers pass `devMode = true`).
 */
export function getSpawnDebugLog(): readonly SpawnDebugEntry[] {
  return _spawnDebugLog;
}

/** Clears the spawn debug log (call between waves to avoid stale dots). */
export function clearSpawnDebugLog(): void {
  _spawnDebugLog.length = 0;
}

function _logSpawn(x: number, y: number, kind: SpawnDebugKind, devMode: boolean): void {
  if (!devMode) return;
  if (_spawnDebugLog.length >= SPAWN_DEBUG_CAP) _spawnDebugLog.shift();
  _spawnDebugLog.push({ x, y, kind });
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
    ctx.eliteJellyfishEnemies as ReadonlyArray<BuffableEnemy>,
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
  const { mote } = ctx;
  const _devMode = ctx.getIsDevMode?.() ?? false;
  let _usedFallback = false;
  const fieldSpace = ctx.getFieldSpace();
  // Use the full visible spawn bounds so enemies don't appear off-screen on
  // wide/short canvases.  spawnBounds == activeBounds == visibleBounds under
  // current policy; future waves may narrow it independently.
  const { left: spawnLeft, top: spawnTop, right: spawnRight, bottom: spawnBottom,
          width: spawnW, height: spawnH } = fieldSpace.spawnBounds;
  const minDist  = 80;
  let spawnX = 0, spawnY = 0, attempts = 0;
  const wn = ctx.getCurrentWave();
  const terrain = ctx.getTopographicTerrainState();
  const wallState = ctx.getVerdureCaveWallState?.() ?? null;

  if (enemyTypeId === 'laser') {
    const half = LASER_ENEMY_SIZE / 2;
    do {
      spawnX = spawnLeft + half + Math.random() * (spawnW - LASER_ENEMY_SIZE);
      spawnY = spawnTop  + half + Math.random() * (spawnH - LASER_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y; _usedFallback = true;
    }
    const _laser = makeLaserEnemy(spawnX, spawnY, wn);
    ctx.enemies.push(_laser);
    _onNonEliteSpawned(ctx, _laser, spawnX, spawnY);
  } else if (enemyTypeId === 'sapphire') {
    const half = SAPPHIRE_ENEMY_SIZE / 2;
    do {
      spawnX = spawnLeft + half + Math.random() * (spawnW - SAPPHIRE_ENEMY_SIZE);
      spawnY = spawnTop  + half + Math.random() * (spawnH - SAPPHIRE_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y; _usedFallback = true;
    }
    const _sapphire = makeSapphireEnemy(spawnX, spawnY, wn);
    ctx.sapphireEnemies.push(_sapphire);
    _onNonEliteSpawned(ctx, _sapphire, spawnX, spawnY);
  } else if (enemyTypeId === 'emerald') {
    const half = EMERALD_ENEMY_SIZE / 2;
    do {
      spawnX = spawnLeft + half + Math.random() * (spawnW - EMERALD_ENEMY_SIZE);
      spawnY = spawnTop  + half + Math.random() * (spawnH - EMERALD_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y; _usedFallback = true;
    }
    const _emerald = makeEmeraldEnemy(spawnX, spawnY, wn);
    ctx.emeraldEnemies.push(_emerald);
    _onNonEliteSpawned(ctx, _emerald, spawnX, spawnY);
  } else if (enemyTypeId === 'amber') {
    const half = AMBER_ENEMY_SIZE / 2;
    do {
      spawnX = spawnLeft + half + Math.random() * (spawnW - AMBER_ENEMY_SIZE);
      spawnY = spawnTop + half + Math.random() * (spawnH - AMBER_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y; _usedFallback = true;
    }
    const _amber = makeAmberEnemy(spawnX, spawnY, wn);
    ctx.amberEnemies.push(_amber);
    _onNonEliteSpawned(ctx, _amber, spawnX, spawnY);
  } else if (enemyTypeId === 'void') {
    // Void enemies spawn at edges so they approach from a distance.
    const edge = Math.floor(Math.random() * 4);
    if      (edge === 0) { spawnX = spawnLeft + Math.random() * spawnW; spawnY = spawnTop; }
    else if (edge === 1) { spawnX = spawnLeft + Math.random() * spawnW; spawnY = spawnBottom; }
    else if (edge === 2) { spawnX = spawnLeft; spawnY = spawnTop + Math.random() * spawnH; }
    else                 { spawnX = spawnRight; spawnY = spawnTop + Math.random() * spawnH; }
    const _void = makeVoidEnemy(spawnX, spawnY, wn);
    ctx.voidEnemies.push(_void);
    _onNonEliteSpawned(ctx, _void, spawnX, spawnY);
  } else if (enemyTypeId === 'quartz') {
    const half = QUARTZ_ENEMY_SIZE / 2;
    do {
      spawnX = spawnLeft + half + Math.random() * (spawnW - QUARTZ_ENEMY_SIZE);
      spawnY = spawnTop + half + Math.random() * (spawnH - QUARTZ_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y; _usedFallback = true;
    }
    const _quartz = makeQuartzEnemy(spawnX, spawnY, wn);
    ctx.quartzEnemies.push(_quartz);
    _onNonEliteSpawned(ctx, _quartz, spawnX, spawnY);
  } else if (enemyTypeId === 'ruby') {
    const half = RUBY_ENEMY_SIZE / 2;
    do {
      spawnX = spawnLeft + half + Math.random() * (spawnW - RUBY_ENEMY_SIZE);
      spawnY = spawnTop + half + Math.random() * (spawnH - RUBY_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y; _usedFallback = true;
    }
    const _ruby = makeRubyEnemy(spawnX, spawnY, wn);
    ctx.rubyEnemies.push(_ruby);
    _onNonEliteSpawned(ctx, _ruby, spawnX, spawnY);
  } else if (enemyTypeId === 'sunstone') {
    const half = SUNSTONE_ENEMY_SIZE / 2;
    do {
      spawnX = spawnLeft + half + Math.random() * (spawnW - SUNSTONE_ENEMY_SIZE);
      spawnY = spawnTop + half + Math.random() * (spawnH - SUNSTONE_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y; _usedFallback = true;
    }
    const _sunstone = makeSunstoneEnemy(spawnX, spawnY, wn);
    ctx.sunstoneEnemies.push(_sunstone);
    _onNonEliteSpawned(ctx, _sunstone, spawnX, spawnY);
  } else if (enemyTypeId === 'citrine') {
    const half = CITRINE_ENEMY_SIZE / 2;
    do {
      spawnX = spawnLeft + half + Math.random() * (spawnW - CITRINE_ENEMY_SIZE);
      spawnY = spawnTop + half + Math.random() * (spawnH - CITRINE_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y; _usedFallback = true;
    }
    const _citrine = makeCitrineEnemy(spawnX, spawnY, wn);
    ctx.citrineEnemies.push(_citrine);
    _onNonEliteSpawned(ctx, _citrine, spawnX, spawnY);
  } else if (enemyTypeId === 'iolite') {
    const half = IOLITE_ENEMY_SIZE / 2;
    do {
      spawnX = spawnLeft + half + Math.random() * (spawnW - IOLITE_ENEMY_SIZE);
      spawnY = spawnTop + half + Math.random() * (spawnH - IOLITE_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y; _usedFallback = true;
    }
    const _iolite = makeIoliteEnemy(spawnX, spawnY, wn);
    ctx.ioliteEnemies.push(_iolite);
    _onNonEliteSpawned(ctx, _iolite, spawnX, spawnY);
  } else if (enemyTypeId === 'amethyst') {
    const half = AMETHYST_ENEMY_SIZE / 2;
    do {
      spawnX = spawnLeft + half + Math.random() * (spawnW - AMETHYST_ENEMY_SIZE);
      spawnY = spawnTop + half + Math.random() * (spawnH - AMETHYST_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y; _usedFallback = true;
    }
    const _amethyst = makeAmethystEnemy(spawnX, spawnY, wn);
    ctx.amethystEnemies.push(_amethyst);
    _onNonEliteSpawned(ctx, _amethyst, spawnX, spawnY);
  } else if (enemyTypeId === 'diamond') {
    const half = DIAMOND_ENEMY_SIZE / 2;
    do {
      spawnX = spawnLeft + half + Math.random() * (spawnW - DIAMOND_ENEMY_SIZE);
      spawnY = spawnTop + half + Math.random() * (spawnH - DIAMOND_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y; _usedFallback = true;
    }
    const _diamond = makeDiamondEnemy(spawnX, spawnY, wn);
    ctx.diamondEnemies.push(_diamond);
    _onNonEliteSpawned(ctx, _diamond, spawnX, spawnY);
  } else if (enemyTypeId === 'nullstone') {
    // Nullstone spawns at edges to approach from a distance.
    const edge = Math.floor(Math.random() * 4);
    if      (edge === 0) { spawnX = spawnLeft + Math.random() * spawnW; spawnY = spawnTop; }
    else if (edge === 1) { spawnX = spawnLeft + Math.random() * spawnW; spawnY = spawnBottom; }
    else if (edge === 2) { spawnX = spawnLeft; spawnY = spawnTop + Math.random() * spawnH; }
    else                 { spawnX = spawnRight; spawnY = spawnTop + Math.random() * spawnH; }
    const _nullstone = makeNullstoneEnemy(spawnX, spawnY, wn);
    ctx.nullstoneEnemies.push(_nullstone);
    _onNonEliteSpawned(ctx, _nullstone, spawnX, spawnY);
  } else if (enemyTypeId === 'fracteryl') {
    const half = FRACTERYL_ENEMY_SIZE / 2;
    do {
      spawnX = spawnLeft + half + Math.random() * (spawnW - FRACTERYL_ENEMY_SIZE);
      spawnY = spawnTop + half + Math.random() * (spawnH - FRACTERYL_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y; _usedFallback = true;
    }
    const _fracteryl = makeFracterylEnemy(spawnX, spawnY, wn);
    ctx.fracterylEnemies.push(_fracteryl);
    _onNonEliteSpawned(ctx, _fracteryl, spawnX, spawnY);
  } else if (enemyTypeId === 'eigenstein') {
    const half = EIGENSTEIN_ENEMY_SIZE / 2;
    do {
      spawnX = spawnLeft + half + Math.random() * (spawnW - EIGENSTEIN_ENEMY_SIZE);
      spawnY = spawnTop + half + Math.random() * (spawnH - EIGENSTEIN_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y; _usedFallback = true;
    }
    const _eigenstein = makeEigensteinEnemy(spawnX, spawnY, wn);
    ctx.eigensteinEnemies.push(_eigenstein);
    _onNonEliteSpawned(ctx, _eigenstein, spawnX, spawnY);
  } else if (enemyTypeId === 'stardust') {
    const half = STARDUST_SIZE;
    do {
      spawnX = spawnLeft + half + Math.random() * (spawnW - STARDUST_SIZE * 2);
      spawnY = spawnTop + half + Math.random() * (spawnH - STARDUST_SIZE * 2);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y; _usedFallback = true;
    }
    const _stardust = makeStardustEnemy(spawnX, spawnY, wn, spawnW, spawnH);
    ctx.stardustEnemies.push(_stardust);
    _onNonEliteSpawned(ctx, _stardust, spawnX, spawnY);
  } else if (enemyTypeId === 'verdure_polyomino') {
    const half = 20;
    do {
      spawnX = spawnLeft + half + Math.random() * (spawnW - half * 2);
      spawnY = spawnTop + half + Math.random() * (spawnH - half * 2);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y; _usedFallback = true;
    }
    const e = makePolyominoEnemy(spawnX, spawnY, wn);
    ctx.polyominoEnemies.push(e);
    _onNonEliteSpawned(ctx, e, spawnX, spawnY);
  } else if (enemyTypeId === 'verdure_polyomino_fissile') {
    const half = 20;
    do {
      spawnX = spawnLeft + half + Math.random() * (spawnW - half * 2);
      spawnY = spawnTop + half + Math.random() * (spawnH - half * 2);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y; _usedFallback = true;
    }
    const e = makeFissilePolyominoEnemy(spawnX, spawnY, wn);
    ctx.fissilePolyominoEnemies.push(e);
    _onNonEliteSpawned(ctx, e, spawnX, spawnY);
  } else if (enemyTypeId === 'verdure_polyomino_refractor') {
    const half = 20;
    do {
      spawnX = spawnLeft + half + Math.random() * (spawnW - half * 2);
      spawnY = spawnTop + half + Math.random() * (spawnH - half * 2);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y; _usedFallback = true;
    }
    const e = makeRefractorPolyominoEnemy(spawnX, spawnY, wn);
    ctx.refractorPolyominoEnemies.push(e);
    _onNonEliteSpawned(ctx, e, spawnX, spawnY);
  } else if (enemyTypeId === 'boss') {
    // Boss is positioned relative to the stable safe-core area so its composition
    // remains centred on all canvas sizes.
    const sc = fieldSpace.safeCoreBounds;
    const rawBossId = wn === 50 ? 0 : Math.ceil(wn / 100);
    ctx.setBossEnemy(makeBossEnemy(rawBossId, wn, sc.width, sc.height));
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
    if      (edge === 0) { spawnX = spawnLeft + Math.random() * spawnW; spawnY = spawnTop; }
    else if (edge === 1) { spawnX = spawnLeft + Math.random() * spawnW; spawnY = spawnBottom; }
    else if (edge === 2) { spawnX = spawnLeft; spawnY = spawnTop + Math.random() * spawnH; }
    else                 { spawnX = spawnRight; spawnY = spawnTop + Math.random() * spawnH; }
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
    if      (edge === 0) { spawnX = spawnLeft + margin + Math.random() * (spawnW - margin * 2); spawnY = spawnTop + margin; }
    else if (edge === 1) { spawnX = spawnLeft + margin + Math.random() * (spawnW - margin * 2); spawnY = spawnBottom - margin; }
    else if (edge === 2) { spawnX = spawnLeft + margin; spawnY = spawnTop + margin + Math.random() * (spawnH - margin * 2); }
    else                 { spawnX = spawnRight - margin; spawnY = spawnTop + margin + Math.random() * (spawnH - margin * 2); }
    ctx.alivenGroups.push(makeAlivenGroup(
      enemyTypeId as typeof ALIVEN_VARIANTS[number],
      spawnX, spawnY, wn,
    ));
    recordAlivenSpawn(enemyTypeId, ctx.alivenGroups.length);
  } else if (ALIVEN_ELITE_VARIANTS.includes(enemyTypeId as typeof ALIVEN_ELITE_VARIANTS[number])) {
    // Elite aliven: strip the 'elite_' segment to get the base variant ID, then
    // spawn as an isElite group — retaining the player-seeking movement bias.
    const baseId = enemyTypeId.replace('aliven_elite_', 'aliven_') as typeof ALIVEN_VARIANTS[number];
    if (!(ALIVEN_VARIANTS as readonly string[]).includes(baseId)) return;
    if (ctx.alivenGroups.length >= MAX_ACTIVE_ALIVEN_GROUPS) {
      recordAlivenCapSkip();
      return;
    }
    const margin = 30;
    const edge = Math.floor(Math.random() * 4);
    if      (edge === 0) { spawnX = spawnLeft + margin + Math.random() * (spawnW - margin * 2); spawnY = spawnTop + margin; }
    else if (edge === 1) { spawnX = spawnLeft + margin + Math.random() * (spawnW - margin * 2); spawnY = spawnBottom - margin; }
    else if (edge === 2) { spawnX = spawnLeft + margin; spawnY = spawnTop + margin + Math.random() * (spawnH - margin * 2); }
    else                 { spawnX = spawnRight - margin; spawnY = spawnTop + margin + Math.random() * (spawnH - margin * 2); }
    ctx.alivenGroups.push(makeAlivenGroup(baseId, spawnX, spawnY, wn, true));
    recordAlivenSpawn(enemyTypeId, ctx.alivenGroups.length);
  } else {
    // ── Procedural creature spawns ────────────────────────────────
    const procSizeMap: Record<string, number> = {
      'proc_dustwisp': DUSTWISP_SIZE, 'proc_ribbonworm': RIBBONWORM_SIZE,
      'proc_lanternmoth': LANTERNMOTH_SIZE, 'proc_eyestalk': EYESTALK_SIZE,
      'proc_jellyfish': JELLYFISH_SIZE,
      'proc_jellyfish_elite_basic': ELITE_JELLYFISH_BASE_SIZE,
      'proc_jellyfish_elite_longtail': ELITE_JELLYFISH_BASE_SIZE,
      'proc_jellyfish_elite_whiplash': ELITE_JELLYFISH_BASE_SIZE,
      'proc_jellyfish_elite_encircling': ELITE_JELLYFISH_BASE_SIZE,
      'proc_clothghost': CLOTHGHOST_SIZE,
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
        spawnX = spawnLeft + half + Math.random() * (spawnW - procSize * 2);
        spawnY = spawnTop + half + Math.random() * (spawnH - procSize * 2);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist
            && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))
          && !(wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY))) break;
        attempts++;
      } while (attempts < 20);
    if (wallState && isVerdureSpawnRejected(wallState, spawnX, spawnY)) {
      const safe = getVerdureSafeFallbackSpawnPos(wallState);
      spawnX = safe.x; spawnY = safe.y; _usedFallback = true;
    }
      let _proc: BuffableEnemy | null = null;
      if (enemyTypeId === 'proc_dustwisp')        { const e = makeDustWispEnemy(spawnX, spawnY, wn);       ctx.dustWispEnemies.push(e);       _proc = e; }
      else if (enemyTypeId === 'proc_ribbonworm')  { const e = makeRibbonWormEnemy(spawnX, spawnY, wn);    ctx.ribbonWormEnemies.push(e);      _proc = e; }
      else if (enemyTypeId === 'proc_lanternmoth') { const e = makeLanternMothEnemy(spawnX, spawnY, wn);   ctx.lanternMothEnemies.push(e);     _proc = e; }
      else if (enemyTypeId === 'proc_eyestalk')    { const e = makeEyeStalkEnemy(spawnX, spawnY, wn);      ctx.eyeStalkEnemies.push(e);        _proc = e; }
      else if (enemyTypeId === 'proc_jellyfish')            { const e = makeJellyfishEnemy(spawnX, spawnY, wn);           ctx.jellyfishEnemies.push(e);            _proc = e; }
      else if (enemyTypeId === 'proc_jellyfish_elite_basic')     { const e = makeBasicJellyfishEnemy(spawnX, spawnY, wn);     ctx.eliteJellyfishEnemies.push(e);       _proc = e; }
      else if (enemyTypeId === 'proc_jellyfish_elite_longtail')  { const e = makeLongtailJellyfishEnemy(spawnX, spawnY, wn);  ctx.eliteJellyfishEnemies.push(e);       _proc = e; }
      else if (enemyTypeId === 'proc_jellyfish_elite_whiplash')  { const e = makeWhiplashJellyfishEnemy(spawnX, spawnY, wn);  ctx.eliteJellyfishEnemies.push(e);       _proc = e; }
      else if (enemyTypeId === 'proc_jellyfish_elite_encircling') { const e = makeEncirclingJellyfishEnemy(spawnX, spawnY, wn); ctx.eliteJellyfishEnemies.push(e);      _proc = e; }
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
  // ── Horizon pentagon ───────────────────────────────────────────────────────
  if (enemyTypeId === 'horizon_pentagon' || enemyTypeId === 'true_galaxy') {
    do {
      spawnX = spawnLeft + 30 + Math.random() * (spawnW - 60);
      spawnY = spawnTop  + 30 + Math.random() * (spawnH - 60);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist) break;
      attempts++;
    } while (attempts < 20);
    const g = enemyTypeId === 'true_galaxy'
      ? makeTrueGalaxyGroup(spawnX, spawnY, wn)
      : makeHorizonPentagonGroup(spawnX, spawnY, wn, spawnTop, spawnTop + spawnH);
    ctx.horizonPentagonGroups.push(g);
  }
  // Spawn flash — visual only, skipped for boss (whose spawn coords aren't meaningful here).
  if (enemyTypeId !== 'boss') pushSpawnFlash(spawnX, spawnY);
  // Record final spawn position for the dev overlay (no-op outside dev mode).
  _logSpawn(spawnX, spawnY, _usedFallback ? 'fallback' : 'accepted', _devMode);
}
