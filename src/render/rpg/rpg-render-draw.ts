/**
 * rpg-render-draw.ts — Per-frame canvas drawing for the RPG tab.
 *
 * Extracted from rpg-render.ts to keep that file under a manageable size.
 *
 * Exports:
 *   - `RpgDrawCtx`       — dependency-injection context passed once at setup time.
 *   - `RpgDrawFrameState`— small mutable object that survives between frames
 *                          (currently only `waveOverlapAlpha`).
 *   - `drawRpgFrame(ctx, state, nowMs)` — renders one frame to the canvas.
 *   - `setAllDrawLowGraphics(enabled)` — forwards the low-graphics flag to all
 *                          draw-side modules; call from RpgRender.setLowGraphicsMode().
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import {
  drawSapphireEnemies, drawSapphireMissiles,
  drawEmeraldEnemies,
  drawAmberEnemies, drawAmberShards,
  drawVoidEnemies,
  drawLaserEnemies, drawEnemyIndicators,
  setLowGraphicsMode as setEnemyLowGraphics,
} from './rpg-enemy-draw';
import {
  drawQuartzEnemies, drawQuartzSpikes,
  drawRubyEnemies, drawRubyBolts,
  drawSunstoneEnemies,
  drawCitrineEnemies, drawCitrineBolts,
  drawIoliteEnemies,
  drawAmethystEnemies, drawAmethystShards,
  drawDiamondEnemies, drawDiamondShards,
  drawNullstoneEnemies, drawVoidTendrils,
  drawFracterylEnemies,
  drawEigensteinEnemies, drawEigensteinBeams,
  drawTeleportParticles,
} from './rpg-enemy-draw-adv';
import { drawBossAttacks, setDrawBossAttacksLowGraphics } from './rpg-boss-attacks-draw';
import {
  drawBossStageDirector,
  setStageDirLowGraphics,
} from './rpg-boss-stage-draw';
import type { BossStageDirectorState } from './rpg-boss-stage-director';
import {
  drawBossProjectiles,
  drawSandProjectiles,
  drawPoisonBolts,
  drawLaserBeamEffect,
  drawEmeraldPlayerMissiles, drawEmeraldSubMissiles, drawEmeraldSwirlParticles, drawSunstoneMines,
  setLowGraphicsMode as setEntityLowGraphics,
} from './rpg-entity-draw';
import {
  drawWeaponOrbitParticle, drawOrbitProjectile,
  drawTargetReticle,
  drawPlayerMote,
  setLowGraphicsMode as setPlayerDrawLowGraphics,
} from './rpg-player-draw';
import {
  drawDeathParticles, drawShotLines, drawHitEffects, drawDamageNumbers,
  setLowGraphicsMode as setCombatEffectsLowGraphics,
} from './rpg-combat-effects-draw';
import {
  drawSapphireShips, drawSapphireLasers,
  drawAmethystShips, drawAmethystLasers,
  setLowGraphicsMode as setCompanionLowGraphics,
} from './rpg-companion-draw';
import { drawChainWhip, drawVortexes, setLowGraphicsMode as setWeaponChainLowGraphics } from './rpg-weapon-draw';
import { drawSwordCombos, drawSandBladeCombo, drawSandDriftPixels, setLowGraphicsMode as setWeaponSwordLowGraphics } from './rpg-weapon-draw-sword';
import { drawLuckyMotes, drawLuckyMotePopups } from './rpg-lucky-motes';
import { drawBossEnemy, drawBottomSafeZone, drawDanmakuSafeZone, drawWaveClearBanner, setLowGraphicsMode as setBossLowGraphics } from './rpg-boss-draw';
import { drawAlivenGroups, setAlivenLowGraphics } from './rpg-aliven-draw';
import { drawProceduralEnemies } from './rpg-procedural-draw';
import {
  drawEliteEnemies,
  setLowGraphicsMode as setEliteDrawLowGraphics,
} from './rpg-elite-enemy-draw';
import { drawStardustEnemies, setLowGraphicsMode as setStardustDrawLowGraphics } from './rpg-stardust-draw';
import {
  drawPolyominoEnemies,
  drawFissilePolyominoEnemies,
  drawRefractorPolyominoEnemies,
} from './polyomino-enemy-draw';
import type {
  RpgMote, RpgJoystick, RpgPhase,
  HitEffect, ShotLine, DamageNumber, DeathParticle,
  WeaponOrbitParticle, OrbitProjectile,
  SapphireEnemy, SapphireMissile, LaserEnemy,
  ClosestTarget,
} from './rpg-types';
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
  DanmakuSafeZone, TeleportParticle,
  LuckyMote, LuckyMotePopup, EliteEnemy,
} from './rpg-enemy-types';
import type {
  DustWispEnemy, RibbonWormEnemy, LanternMothEnemy, EyeStalkEnemy,
  JellyfishEnemy, ClothGhostEnemy, PlantTurretEnemy, GearInsectEnemy,
  SpiderCrawlerEnemy, MoteSwarmEnemy, ShadowHandEnemy, PlantProjectile,
  SandFishEnemy, QuartzFishEnemy, RubyFishEnemy, SunstoneFishEnemy,
  EmeraldFishEnemy, SapphireFishEnemy, AmethystFishEnemy, DiamondFishEnemy,
  FishMine, FishSpike, FishBolt, FishDecoy,
} from './rpg-procedural-types';
import type { BossAttackState } from './rpg-boss-attack-types';
import type { BinaryRingEnemy, BinaryRingMissile } from './rpg-binary-ring-encounter';
import type {
  PolyominoEnemy, FissilePolyominoEnemy, RefractorPolyominoEnemy,
} from './polyomino-enemy-types';
import { drawNadirCubeEncounter, setNadirCubeLowGraphics } from './nadir-cube-point-draw';
import type { NadirCubePointEnemy, NadirCubeMine, NadirCubeTrailSegment, NadirCubeTurretBolt, NadirCubeLinkLaser } from './nadir-cube-point-types';
import type { NadirCubeProjectionState } from '../background/nadir-cube-projection';
import type { RpgWeaponHandle } from './rpg-weapon-systems';
import type { AlivenParticleGroup } from './rpg-aliven-types';
import { JOYSTICK_OUTER_RADIUS, JOYSTICK_THUMB_RADIUS, BASE_ATTACK_TIMER_KEY, DIAMOND_BLADE_ID, RPG_LOGICAL_WIDTH, RPG_LOGICAL_HEIGHT } from './rpg-constants';
import { renderTopographicTerrain } from './terrain/topographic-terrain';
import type { EnemyInfluencePoint } from './terrain/topographic-terrain';
import { renderPersistentTopographySunlight, renderTopographyLighting } from './terrain/topographic-lighting';
import type { TopographicTerrainState } from './terrain/topographic-terrain';
import { drawRpgPathfindingDebug } from './terrain/rpg-pathfinding';
import {
  drawCausticsBackground,
  drawCausticsFloorEffects,
} from './terrain/caustics-overlay';
import {
  drawVerdureBackground,
  drawVerdureFloorEffects,
} from './terrain/verdure-overlay';
import {
  drawImpetusBackground,
  drawImpetusFloorEffects,
  getImpetusDevLine,
} from './terrain/impetus-overlay';
import {
  drawVerdureEdgeRocks,
  drawVerdurePlants,
  drawVerdureFragments,
} from './terrain/rpg-verdure-render';
import {
  drawVerdureCaveWalls,
  drawVerdureFloor,
  drawVerdureWallDebug,
} from './terrain/verdure-cave-walls';
import {
  drawVerdureFloorSegmented,
  drawVerdureWallsSegmented,
  type VerdureInfluenceObj,
} from './terrain/verdure-segmented-surface';
import { verdureFragments } from './terrain/rpg-verdure-growth';
import type { VerdurePlant } from './terrain/rpg-verdure-growth';
import {
  LASER_ENEMY_COLOR, SAPPHIRE_ENEMY_COLOR,
  FLUID_SAND_R, FLUID_SAND_G, FLUID_SAND_B,
} from './rpg-constants';
import {
  EMERALD_ENEMY_COLOR, AMBER_ENEMY_COLOR, VOID_ENEMY_COLOR,
  QUARTZ_ENEMY_COLOR, RUBY_ENEMY_COLOR, SUNSTONE_ENEMY_COLOR,
  CITRINE_ENEMY_COLOR, IOLITE_ENEMY_COLOR, AMETHYST_ENEMY_COLOR,
  DIAMOND_ENEMY_COLOR, FRACTERYL_ENEMY_COLOR, EIGENSTEIN_ENEMY_COLOR,
  ELITE_QUARTZ_COLOR, ELITE_RUBY_COLOR, ELITE_SUNSTONE_COLOR,
  ELITE_CITRINE_COLOR, ELITE_IOLITE_COLOR, ELITE_AMETHYST_COLOR,
  ELITE_DIAMOND_COLOR,
} from './rpg-enemy-constants';
import { LASER_BEAM_COLOR } from './rpg-weapon-constants';
import type { TerrainLightEmitter } from './terrain/terrain-lighting';
import { MAX_TERRAIN_LIGHT_EMITTERS } from './terrain/terrain-lighting';
import { drawEuhedralHexFloor } from './terrain/euhedral-hex-floor';
import { drawEmpowerParticles } from './rpg-elite-empower-particles';

// ── Context passed once at setup time ─────────────────────────────────────────

/**
 * All the arrays/objects that drawRpgFrame needs, passed once when the system
 * is constructed (arrays are always mutated in place, so references stay valid).
 */
export interface RpgDrawCtx {
  canvas2d: CanvasRenderingContext2D;
  fluid: { render(ctx: CanvasRenderingContext2D): void };
  getWidthPx(): number;
  getHeightPx(): number;

  // ── Enemy arrays (all mutated in-place by update loops) ───
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
  alivenGroups: AlivenParticleGroup[];
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
  plantProjectiles: PlantProjectile[];
  fishMines: FishMine[];
  fishSpikes: FishSpike[];
  fishBolts: FishBolt[];
  fishDecoys: FishDecoy[];
  /** Verdure zone environmental plants — empty when not in Verdure zone. */
  verdurePlants: VerdurePlant[];

  // ── Boss & projectile state ───────────────────────────────
  getBossEnemy(): BossEnemy | null;
  getDanmakuSafeZone(): DanmakuSafeZone | null;
  bossProjectiles: BossProjectile[];
  bossAttackState: BossAttackState;
  teleportParticles: TeleportParticle[];
  bossStageDirectorState: BossStageDirectorState;

  // ── Weapon systems handle (exposes all weapon arrays) ─────
  weaponSystems: RpgWeaponHandle;

  // ── Player & input state ──────────────────────────────────
  mote: RpgMote;
  joystick: RpgJoystick;

  // ── Visual effect arrays ──────────────────────────────────
  hitEffects: HitEffect[];
  shotLines: ShotLine[];
  damageNumbers: DamageNumber[];
  luckyMotes: LuckyMote[];
  luckyMotePopups: LuckyMotePopup[];
  deathParticles: DeathParticle[];
  weaponOrbitParticles: WeaponOrbitParticle[];
  getOrbitProjectile(): OrbitProjectile | null;

  // ── Scalar getters (mutated elsewhere, so read via function) ─
  getGlowMovementIntensity(): number;
  getRpgPhase(): RpgPhase;
  getDeathAlpha(): number;
  getGlowTimeS(): number;
  getPlayerIFramesMs(): number;
  getIsInterWave(): boolean;
  getCurrentWave(): number;
  getInterWaveTimerMs(): number;
  getIsBossWaveActive(): boolean;
  getScreenDarken(): number;
  getRestartFadeAlpha(): number;
  getIsLowGraphicsMode(): boolean;
  getEnemyIndicatorStyle(): 'triangle' | 'outline' | 'off';
  getTopographicTerrainState(): TopographicTerrainState | null;
  getVerdureCaveWallState?(): import('./terrain/verdure-cave-walls').VerdureCaveWallState | null;
  /** Returns the display name for the currently active zone (e.g. "Euhedral"). */
  getActiveZoneDisplayName(): string;

  // ── Callbacks & shared context ────────────────────────────
  getEffectiveEquippedIds(): Set<string>;
  getTargetedEnemy(): ClosestTarget | null;
  rpgSimState: RpgSimState;
  /** Returns true when developer-mode diagnostics should be rendered. */
  getIsDevMode(): boolean;
  /** Returns the current CSS display size of the #rpg-area wrapper (for dev overlay). */
  getCssDisplaySize(): { w: number; h: number };
  /** Returns the current navigation grid for pathfinding debug draw. */
  getNavGrid(): import('./terrain/rpg-pathfinding').RpgNavGrid | null;
  /** Returns true when pathfinding debug visualization should be drawn. */
  getPathfindingDebugEnabled(): boolean;
  /** Optional zone-specific stateful background draw (e.g. substrate for Horizon). */
  drawZoneBgOverlay?: (canvas2d: CanvasRenderingContext2D, w: number, h: number, nowMs: number) => void;
  /** Returns the latest shared Nadir cube projection state for dev overlays. */
  getNadirCubeProjectionState?(): NadirCubeProjectionState | null;
  /** Returns the current Zenith Binary Horizon screen-shake offset in logical px (0,0 when inactive). */
  getZenithShakeOffset?(): { x: number; y: number };
}

// ── Small mutable state that persists across frames ───────────────────────────

/**
 * Mutable state owned by the draw system.
 * Create once and pass to every drawRpgFrame call.
 */
export interface RpgDrawFrameState {
  /** Smoothly interpolated alpha for the top-left wave number; dims when entities overlap it. */
  waveOverlapAlpha: number;
}

/** Creates the initial draw frame state. */
export function createRpgDrawFrameState(): RpgDrawFrameState {
  return { waveOverlapAlpha: 1.0 };
}

// ── Enemy-influence point collection ──────────────────────────────────────────

/**
 * Pre-parsed RGB values for the standard enemy colour palette.
 * Hex strings are pre-computed as integer tuples to avoid per-frame parsing.
 */
function hexRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

const _LASER_RGB    = hexRgb(LASER_ENEMY_COLOR);
const _SAPPHIRE_RGB = hexRgb(SAPPHIRE_ENEMY_COLOR);
const _EMERALD_RGB  = hexRgb(EMERALD_ENEMY_COLOR);
const _AMBER_RGB    = hexRgb(AMBER_ENEMY_COLOR);
const _VOID_RGB     = hexRgb(VOID_ENEMY_COLOR);
const _QUARTZ_RGB   = hexRgb(QUARTZ_ENEMY_COLOR);
const _RUBY_RGB     = hexRgb(RUBY_ENEMY_COLOR);
const _SUNSTONE_RGB = hexRgb(SUNSTONE_ENEMY_COLOR);
const _CITRINE_RGB  = hexRgb(CITRINE_ENEMY_COLOR);
const _IOLITE_RGB   = hexRgb(IOLITE_ENEMY_COLOR);
const _AMETHYST_RGB = hexRgb(AMETHYST_ENEMY_COLOR);
const _DIAMOND_RGB  = hexRgb(DIAMOND_ENEMY_COLOR);
const _FRACTERYL_RGB  = hexRgb(FRACTERYL_ENEMY_COLOR);
const _EIGENSTEIN_RGB = hexRgb(EIGENSTEIN_ENEMY_COLOR);
/** Ruby laser beam (ruby red). Used for the beam terrain emitter. */
const _LASER_BEAM_RGB = hexRgb(LASER_BEAM_COLOR);

/** Map from EliteEnemy tier to pre-parsed RGB. */
const _ELITE_RGB: Record<string, [number, number, number]> = {
  quartz:    hexRgb(ELITE_QUARTZ_COLOR),
  ruby:      hexRgb(ELITE_RUBY_COLOR),
  sunstone:  hexRgb(ELITE_SUNSTONE_COLOR),
  citrine:   hexRgb(ELITE_CITRINE_COLOR),
  iolite:    hexRgb(ELITE_IOLITE_COLOR),
  amethyst:  hexRgb(ELITE_AMETHYST_COLOR),
  diamond:   hexRgb(ELITE_DIAMOND_COLOR),
  nullstone: hexRgb('#4444aa'), // nullstone colour is nearly black — use a visible stand-in
};

/**
 * Collects all currently-alive enemy positions together with their RGB colours
 * into a flat `EnemyInfluencePoint[]`.  Only called when the terrain is the
 * recursiveSquares variant so it is never executed on non-square wave rounds.
 */
function collectEnemyInfluencePoints(ctx: RpgDrawCtx): EnemyInfluencePoint[] {
  const pts: EnemyInfluencePoint[] = [];

  function push(x: number, y: number, rgb: [number, number, number]): void {
    pts.push({ x, y, r: rgb[0], g: rgb[1], b: rgb[2] });
  }

  for (const e of ctx.enemies)          push(e.x, e.y, _LASER_RGB);
  for (const e of ctx.sapphireEnemies)  push(e.x, e.y, _SAPPHIRE_RGB);
  for (const e of ctx.emeraldEnemies)   push(e.x, e.y, _EMERALD_RGB);
  for (const e of ctx.amberEnemies)     push(e.x, e.y, _AMBER_RGB);
  for (const e of ctx.voidEnemies)      push(e.x, e.y, _VOID_RGB);
  for (const e of ctx.quartzEnemies)    push(e.x, e.y, _QUARTZ_RGB);
  for (const e of ctx.rubyEnemies)      push(e.x, e.y, _RUBY_RGB);
  for (const e of ctx.sunstoneEnemies)  push(e.x, e.y, _SUNSTONE_RGB);
  for (const e of ctx.citrineEnemies)   push(e.x, e.y, _CITRINE_RGB);
  for (const e of ctx.ioliteEnemies)    push(e.x, e.y, _IOLITE_RGB);
  for (const e of ctx.amethystEnemies)  push(e.x, e.y, _AMETHYST_RGB);
  for (const e of ctx.diamondEnemies)   push(e.x, e.y, _DIAMOND_RGB);
  for (const e of ctx.nullstoneEnemies) push(e.x, e.y, _VOID_RGB);    // dark void stand-in
  for (const e of ctx.fracterylEnemies) push(e.x, e.y, _FRACTERYL_RGB);
  for (const e of ctx.eigensteinEnemies) push(e.x, e.y, _EIGENSTEIN_RGB);
  for (const e of ctx.eliteEnemies) {
    const rgb = _ELITE_RGB[e.tier] ?? _QUARTZ_RGB;
    push(e.x, e.y, rgb);
  }
  const boss = ctx.getBossEnemy();
  if (boss) push(boss.x, boss.y, _FRACTERYL_RGB); // boss uses a bright purple as stand-in

  return pts;
}

// ── Verdure influence collector ────────────────────────────────────────────────

/**
 * Collects nearby combat objects as VerdureInfluenceObj entries for the segmented
 * surface dynamic-tint system.  Includes the player and all active enemies.
 */
function _collectVerdureInfluences(ctx: RpgDrawCtx): VerdureInfluenceObj[] {
  const pts: VerdureInfluenceObj[] = [];

  // Player (green presence)
  pts.push({ x: ctx.mote.x, y: ctx.mote.y, r: 80, g: 220, b: 100, radiusPx: 75, intensity: 0.5 });

  function pushEnemy(x: number, y: number, rgb: [number, number, number]): void {
    pts.push({ x, y, r: rgb[0], g: rgb[1], b: rgb[2], radiusPx: 100, intensity: 0.62 });
  }

  for (const e of ctx.enemies)           pushEnemy(e.x, e.y, _LASER_RGB);
  for (const e of ctx.sapphireEnemies)   pushEnemy(e.x, e.y, _SAPPHIRE_RGB);
  for (const e of ctx.emeraldEnemies)    pushEnemy(e.x, e.y, _EMERALD_RGB);
  for (const e of ctx.amberEnemies)      pushEnemy(e.x, e.y, _AMBER_RGB);
  for (const e of ctx.voidEnemies)       pushEnemy(e.x, e.y, _VOID_RGB);
  for (const e of ctx.quartzEnemies)     pushEnemy(e.x, e.y, _QUARTZ_RGB);
  for (const e of ctx.rubyEnemies)       pushEnemy(e.x, e.y, _RUBY_RGB);
  for (const e of ctx.sunstoneEnemies)   pushEnemy(e.x, e.y, _SUNSTONE_RGB);
  for (const e of ctx.citrineEnemies)    pushEnemy(e.x, e.y, _CITRINE_RGB);
  for (const e of ctx.ioliteEnemies)     pushEnemy(e.x, e.y, _IOLITE_RGB);
  for (const e of ctx.amethystEnemies)   pushEnemy(e.x, e.y, _AMETHYST_RGB);
  for (const e of ctx.diamondEnemies)    pushEnemy(e.x, e.y, _DIAMOND_RGB);
  for (const e of ctx.fracterylEnemies)  pushEnemy(e.x, e.y, _FRACTERYL_RGB);
  for (const e of ctx.eigensteinEnemies) pushEnemy(e.x, e.y, _EIGENSTEIN_RGB);
  for (const e of ctx.eliteEnemies) {
    const rgb = _ELITE_RGB[e.tier] ?? _QUARTZ_RGB;
    pushEnemy(e.x, e.y, rgb);
  }
  const boss = ctx.getBossEnemy();
  if (boss) pushEnemy(boss.x, boss.y, _FRACTERYL_RGB);

  // Attacks — ruby laser beam (decomposed into 3 point emitters for Verdure)
  const lb = ctx.weaponSystems.laserBeamEffect;
  if (lb?.active) {
    for (let t = 0.2; t <= 0.8; t += 0.3) {
      const ax = lb.startX + (lb.endX - lb.startX) * t;
      const ay = lb.startY + (lb.endY - lb.startY) * t;
      pts.push({ x: ax, y: ay, r: _LASER_BEAM_RGB[0], g: _LASER_BEAM_RGB[1], b: _LASER_BEAM_RGB[2], radiusPx: 70, intensity: 0.85 });
    }
  }
  // Sapphire / amethyst lasers are moving point projectiles
  for (const p of ctx.weaponSystems.sapphireLasers ?? []) {
    pts.push({ x: p.x, y: p.y, r: _SAPPHIRE_RGB[0], g: _SAPPHIRE_RGB[1], b: _SAPPHIRE_RGB[2], radiusPx: 55, intensity: 0.55 });
  }
  for (const p of ctx.weaponSystems.amethystLasers ?? []) {
    pts.push({ x: p.x, y: p.y, r: _AMETHYST_RGB[0], g: _AMETHYST_RGB[1], b: _AMETHYST_RGB[2], radiusPx: 55, intensity: 0.55 });
  }
  // Emerald missiles
  for (const p of ctx.weaponSystems.emeraldPlayerMissiles) {
    pts.push({ x: p.x, y: p.y, r: _EMERALD_RGB[0], g: _EMERALD_RGB[1], b: _EMERALD_RGB[2], radiusPx: 48, intensity: 0.45 });
  }

  return pts;
}

// ── Terrain light emitter collector ───────────────────────────────────────────

/**
 * Collects TerrainLightEmitter entries for Euhedral zone terrain (both the
 * full-screen hex floor and basalt formations).  Also reused for Verdure
 * terrain lighting when the caller needs the richer emitter format.
 *
 * Priority order (high → low): laser beam, boss, elite enemies, regular
 * enemies, projectiles.  Total capped at MAX_TERRAIN_LIGHT_EMITTERS.
 */
function _collectTerrainLightEmitters(
  ctx: RpgDrawCtx,
  canvasW: number,
  canvasH: number,
): TerrainLightEmitter[] {
  const margin = 120;
  const inView = (x: number, y: number) =>
    x >= -margin && x <= canvasW + margin &&
    y >= -margin && y <= canvasH + margin;

  const emitters: TerrainLightEmitter[] = [];

  // Helper — push a point emitter
  const pushPoint = (
    x: number, y: number,
    r: number, g: number, b: number,
    radiusPx: number, intensity: number,
  ) => {
    if (!inView(x, y)) return;
    if (emitters.length >= MAX_TERRAIN_LIGHT_EMITTERS) return;
    emitters.push({ type: 'point', x, y, x2: 0, y2: 0, r, g, b, radiusPx, intensity });
  };

  // 1. Ruby laser beam — highest priority, single beam emitter
  const lb = ctx.weaponSystems.laserBeamEffect;
  if (lb?.active) {
    if (emitters.length < MAX_TERRAIN_LIGHT_EMITTERS) {
      emitters.push({
        type: 'beam',
        x: lb.startX, y: lb.startY,
        x2: lb.endX,  y2: lb.endY,
        r: _LASER_BEAM_RGB[0], g: _LASER_BEAM_RGB[1], b: _LASER_BEAM_RGB[2],
        radiusPx: 65, intensity: 0.85,
      });
    }
  }

  // 2. Boss
  const boss = ctx.getBossEnemy();
  if (boss) pushPoint(boss.x, boss.y, _FRACTERYL_RGB[0], _FRACTERYL_RGB[1], _FRACTERYL_RGB[2], 130, 0.55);

  // 3. Elite enemies
  for (const e of ctx.eliteEnemies) {
    const rgb = _ELITE_RGB[e.tier] ?? _QUARTZ_RGB;
    pushPoint(e.x, e.y, rgb[0], rgb[1], rgb[2], 115, 0.50);
  }

  // 4. Player — sand-colored glow so nearby Euhedral structures are tinted warm
  pushPoint(ctx.mote.x, ctx.mote.y, FLUID_SAND_R, FLUID_SAND_G, FLUID_SAND_B, 100, 0.45);

  // 5. Regular enemies (all types)
  function pushEnemy(x: number, y: number, rgb: [number, number, number]): void {
    pushPoint(x, y, rgb[0], rgb[1], rgb[2], 100, 0.45);
  }
  for (const e of ctx.enemies)           pushEnemy(e.x, e.y, _LASER_RGB);
  for (const e of ctx.sapphireEnemies)   pushEnemy(e.x, e.y, _SAPPHIRE_RGB);
  for (const e of ctx.emeraldEnemies)    pushEnemy(e.x, e.y, _EMERALD_RGB);
  for (const e of ctx.amberEnemies)      pushEnemy(e.x, e.y, _AMBER_RGB);
  for (const e of ctx.voidEnemies)       pushEnemy(e.x, e.y, _VOID_RGB);
  for (const e of ctx.quartzEnemies)     pushEnemy(e.x, e.y, _QUARTZ_RGB);
  for (const e of ctx.rubyEnemies)       pushEnemy(e.x, e.y, _RUBY_RGB);
  for (const e of ctx.sunstoneEnemies)   pushEnemy(e.x, e.y, _SUNSTONE_RGB);
  for (const e of ctx.citrineEnemies)    pushEnemy(e.x, e.y, _CITRINE_RGB);
  for (const e of ctx.ioliteEnemies)     pushEnemy(e.x, e.y, _IOLITE_RGB);
  for (const e of ctx.amethystEnemies)   pushEnemy(e.x, e.y, _AMETHYST_RGB);
  for (const e of ctx.diamondEnemies)    pushEnemy(e.x, e.y, _DIAMOND_RGB);
  for (const e of ctx.nullstoneEnemies)  pushEnemy(e.x, e.y, _VOID_RGB);
  for (const e of ctx.fracterylEnemies)  pushEnemy(e.x, e.y, _FRACTERYL_RGB);
  for (const e of ctx.eigensteinEnemies) pushEnemy(e.x, e.y, _EIGENSTEIN_RGB);

  // 6. Projectiles
  for (const p of ctx.weaponSystems.sapphireLasers ?? []) {
    pushPoint(p.x, p.y, _SAPPHIRE_RGB[0], _SAPPHIRE_RGB[1], _SAPPHIRE_RGB[2], 50, 0.50);
  }
  for (const p of ctx.weaponSystems.amethystLasers ?? []) {
    pushPoint(p.x, p.y, _AMETHYST_RGB[0], _AMETHYST_RGB[1], _AMETHYST_RGB[2], 50, 0.50);
  }
  for (const p of ctx.weaponSystems.emeraldPlayerMissiles) {
    pushPoint(p.x, p.y, _EMERALD_RGB[0], _EMERALD_RGB[1], _EMERALD_RGB[2], 45, 0.40);
  }

  return emitters;
}

// ── Topography sunlight gate ───────────────────────────────────────────────────

/**
 * Returns true only when the persistent topography sunlight fill should be
 * drawn.  This prevents the light wash from contaminating zones that do not
 * use topographic terrain (Impetus, Verdure, Caustics, Horizon).
 *
 * Rules:
 *  - Must have an active terrain state (non-null).
 *  - Only 'topographic' and 'recursiveSquares' terrain kinds benefit from the
 *    sunlight fill; 'basalt' manages its own shading.
 *  - Zones with their own dedicated background (impetus, caustics, verdure,
 *    horizon) are excluded entirely.
 */
function shouldDrawPersistentTopographySunlight(
  activeZoneId: string,
  terrainState: import('./terrain/topographic-terrain').TopographicTerrainState | null,
): boolean {
  if (!terrainState) return false;
  const excluded = new Set(['impetus', 'caustics', 'verdure', 'horizon']);
  if (excluded.has(activeZoneId)) return false;
  // Basalt handles its own lighting; sunlight fill doesn't help there.
  if (terrainState.terrainKind === 'basalt') return false;
  return true;
}

// ── Main draw function ─────────────────────────────────────────────────────────

export function drawRpgFrame(
  ctx: RpgDrawCtx,
  state: RpgDrawFrameState,
  nowMs: number,
): void {
  const canvas2d   = ctx.canvas2d;
  const widthPx    = ctx.getWidthPx();
  const heightPx   = ctx.getHeightPx();
  const rpgPhase   = ctx.getRpgPhase();
  const glowTimeS  = ctx.getGlowTimeS();
  const bossEnemy  = ctx.getBossEnemy();

  canvas2d.clearRect(0, 0, widthPx, heightPx);
  canvas2d.fillStyle = '#0a0a12';
  canvas2d.fillRect(0, 0, widthPx, heightPx);

  // Apply Zenith Binary Horizon screen-shake offset (0,0 when inactive).
  const shakeOff = ctx.getZenithShakeOffset?.() ?? { x: 0, y: 0 };
  const hasShake = shakeOff.x !== 0 || shakeOff.y !== 0;
  if (hasShake) {
    canvas2d.save();
    canvas2d.translate(shakeOff.x, shakeOff.y);
  }

  // Zone atmosphere tints — rendered immediately after the background fill so
  // they sit behind fluid, terrain, and all gameplay elements.
  const isCausticsZone  = ctx.rpgSimState.activeZoneId === 'caustics';
  const isVerdureZone   = ctx.rpgSimState.activeZoneId === 'verdure';
  const isImpetusZone   = ctx.rpgSimState.activeZoneId === 'impetus';
  const isHorizonZone   = ctx.rpgSimState.activeZoneId === 'horizon';
  const isEuhedralZone  = ctx.rpgSimState.activeZoneId === 'euhedral';
  if (isCausticsZone) {
    drawCausticsBackground(canvas2d, widthPx, heightPx, ctx.getIsLowGraphicsMode());
  }
  // Verdure zone: dark forest-green / bioluminescent atmosphere tint.
  if (isVerdureZone) {
    drawVerdureBackground(canvas2d, widthPx, heightPx, ctx.getIsLowGraphicsMode());
    const wState = ctx.getVerdureCaveWallState?.();
    if (wState) {
      // Elite waves are every multiple of 10 (wave 10, 20, 30, …).
      // They use the existing pixelated/blocky Voronoi look.
      // Non-elite waves use the crisp segmented surface system.
      const verdureWave = ctx.getCurrentWave();
      const isEliteVerdureWave = verdureWave > 0 && verdureWave % 10 === 0;
      if (isEliteVerdureWave) {
        drawVerdureFloor(canvas2d, wState, ctx.getIsLowGraphicsMode());
        drawVerdureCaveWalls(canvas2d, wState, ctx.getIsLowGraphicsMode());
      } else {
        // Segmented surface: static base + dynamic tint from nearby combat objects.
        const influences = ctx.getIsLowGraphicsMode()
          ? ([] as VerdureInfluenceObj[])
          : _collectVerdureInfluences(ctx);
        drawVerdureFloorSegmented(canvas2d, wState, ctx.getIsLowGraphicsMode());
        drawVerdureWallsSegmented(canvas2d, wState, ctx.getIsLowGraphicsMode(), influences);
      }
    } else {
      drawVerdureEdgeRocks(canvas2d, widthPx, heightPx, ctx.getIsLowGraphicsMode());
    }
  }
  if (isImpetusZone) {
    drawImpetusBackground(canvas2d, widthPx, heightPx, nowMs, ctx.getIsLowGraphicsMode());
  }
  if (isHorizonZone) {
    ctx.drawZoneBgOverlay?.(canvas2d, widthPx, heightPx, nowMs);
  }

  // Fluid background — rendered first so all gameplay elements appear above it.
  // Skipped for Impetus (space has no fluid; it would obscure the starfield).
  if (!isImpetusZone) {
    ctx.fluid.render(canvas2d);
  }

  const terrainState = ctx.getTopographicTerrainState();
  // For Euhedral: collect terrain light emitters once per frame and reuse for
  // both the hex floor and the basalt formation renderer.
  const euhedralLights: TerrainLightEmitter[] | undefined = (isEuhedralZone && !ctx.getIsLowGraphicsMode())
    ? _collectTerrainLightEmitters(ctx, widthPx, heightPx)
    : undefined;

  // Euhedral full-screen hex floor — drawn after the background fill and before
  // the fluid/terrain so it sits as ground-level atmosphere.
  if (isEuhedralZone && !ctx.getIsLowGraphicsMode()) {
    drawEuhedralHexFloor(canvas2d, widthPx, heightPx, euhedralLights ?? [], false);
  }

  if (shouldDrawPersistentTopographySunlight(ctx.rpgSimState.activeZoneId, terrainState)) {
    renderPersistentTopographySunlight(canvas2d, widthPx, heightPx, terrainState!.paletteId);
  }
  if (terrainState) {
    // For recursive-square and basalt terrain, collect enemy positions for
    // proximity-gradient colouring.  This is skipped for other terrain variants.
    const squareEnemies =
      (terrainState.terrainKind === 'recursiveSquares' || terrainState.terrainKind === 'basalt')
        ? collectEnemyInfluencePoints(ctx)
        : undefined;
    renderTopographicTerrain(canvas2d, terrainState, nowMs, squareEnemies, ctx.getIsLowGraphicsMode(), euhedralLights);
    // Topographic lighting overlay is only applicable to the organic contour variant;
    // skip it for recursive-square terrain which has its own visual style.
    if (terrainState.terrainKind === 'topographic') {
      renderTopographyLighting(canvas2d, terrainState, widthPx, heightPx);
    }
  }

  // Zone floor effects — rendered after terrain so they sit above the floor, below enemies.
  if (isCausticsZone) {
    drawCausticsFloorEffects(
      canvas2d, widthPx, heightPx, nowMs, ctx.getIsLowGraphicsMode(),
      terrainState?.seafloor,
    );
  }
  if (isImpetusZone) {
    drawImpetusFloorEffects(canvas2d, widthPx, heightPx, nowMs, ctx.getIsLowGraphicsMode());
  }
  // Verdure zone: floor plant decoration, procedural vines, pollen particles.
  if (isVerdureZone) {
    drawVerdureFloorEffects(
      canvas2d, widthPx, heightPx, nowMs,
      ctx.mote.x, ctx.mote.y,
      ctx.getIsLowGraphicsMode(),
    );
    // Procedural hazard plants (grow inward from rocks during combat).
    drawVerdurePlants(canvas2d, ctx.verdurePlants, ctx.getIsLowGraphicsMode());
    drawVerdureFragments(canvas2d, verdureFragments);
  }

  // Pathfinding debug overlay (dev mode only — no-op otherwise).
  drawRpgPathfindingDebug(
    canvas2d,
    ctx.getPathfindingDebugEnabled(),
    ctx.getNavGrid(),
    null,  // player path state not exposed here; could be wired later if desired
    [],    // enemy path states — not collected here; kept lightweight
  );
  if (ctx.getIsDevMode() && isVerdureZone) {
    const wState = ctx.getVerdureCaveWallState?.();
    if (wState) drawVerdureWallDebug(canvas2d, wState);
  }

  if (ctx.nadirCubePointEnemies.length > 0 || ctx.nadirCubeMines.length > 0 ||
      ctx.nadirCubeTrailSegments.length > 0 || ctx.nadirCubeTurretBolts.length > 0 ||
      ctx.nadirCubeLinkLasers.length > 0) {
    drawNadirCubeEncounter(
      canvas2d,
      ctx.nadirCubePointEnemies,
      ctx.nadirCubeMines,
      ctx.nadirCubeTrailSegments,
      ctx.nadirCubeTurretBolts,
      ctx.nadirCubeLinkLasers,
      ctx.getIsDevMode() ? (ctx.getNadirCubeProjectionState?.() ?? null) : null,
      ctx.getIsDevMode(),
    );
  }

  drawLaserEnemies(canvas2d, ctx.enemies, nowMs);
  drawSapphireEnemies(canvas2d, ctx.sapphireEnemies);
  drawSapphireMissiles(canvas2d, ctx.sapphireMissiles);
  drawEmeraldEnemies(canvas2d, ctx.emeraldEnemies);
  drawAmberEnemies(canvas2d, ctx.amberEnemies);
  drawAmberShards(canvas2d, ctx.amberShards);
  drawVoidEnemies(canvas2d, ctx.voidEnemies);
  drawQuartzEnemies(canvas2d, ctx.quartzEnemies);
  drawQuartzSpikes(canvas2d, ctx.quartzSpikes);
  drawRubyEnemies(canvas2d, ctx.rubyEnemies);
  drawRubyBolts(canvas2d, ctx.rubyBolts);
  drawSunstoneEnemies(canvas2d, ctx.sunstoneEnemies);
  drawCitrineEnemies(canvas2d, ctx.citrineEnemies);
  drawCitrineBolts(canvas2d, ctx.citrineBolts);
  drawIoliteEnemies(canvas2d, ctx.ioliteEnemies);
  drawAmethystEnemies(canvas2d, ctx.amethystEnemies);
  drawAmethystShards(canvas2d, ctx.amethystShards);
  drawDiamondEnemies(canvas2d, ctx.diamondEnemies);
  drawDiamondShards(canvas2d, ctx.diamondShards);
  drawNullstoneEnemies(canvas2d, ctx.nullstoneEnemies);
  drawVoidTendrils(canvas2d, ctx.voidTendrils);
  drawFracterylEnemies(canvas2d, ctx.fracterylEnemies, ctx.fracterylShards);
  drawEigensteinEnemies(canvas2d, ctx.eigensteinEnemies);
  drawEigensteinBeams(canvas2d, ctx.eigensteinBeams, widthPx, heightPx);
  drawEliteEnemies(canvas2d, ctx.eliteEnemies);
  drawPolyominoEnemies(canvas2d, ctx.polyominoEnemies, nowMs);
  drawFissilePolyominoEnemies(canvas2d, ctx.fissilePolyominoEnemies, nowMs);
  drawRefractorPolyominoEnemies(canvas2d, ctx.refractorPolyominoEnemies, nowMs);
  drawEmpowerParticles(canvas2d, widthPx, heightPx);
  drawStardustEnemies(canvas2d, ctx.stardustEnemies);
  drawAlivenGroups(canvas2d, ctx.alivenGroups);
  drawProceduralEnemies(canvas2d, ctx, nowMs);
  drawBottomSafeZone(canvas2d, ctx.getIsBossWaveActive(), widthPx, heightPx, glowTimeS);
  drawDanmakuSafeZone(canvas2d, bossEnemy, ctx.getDanmakuSafeZone());
  drawBossProjectiles(canvas2d, ctx.bossProjectiles);
  if (ctx.getIsBossWaveActive() && bossEnemy) {
    drawBossStageDirector(
      canvas2d,
      ctx.bossStageDirectorState,
      bossEnemy,
      { w: widthPx, h: heightPx },
      glowTimeS,
      ctx.getIsLowGraphicsMode(),
    );
  }
  drawBossAttacks(canvas2d, ctx.bossAttackState);
  drawBossEnemy(canvas2d, bossEnemy, glowTimeS);
  drawTeleportParticles(canvas2d, ctx.teleportParticles);
  drawShotLines(canvas2d, ctx.shotLines);
  drawVortexes(canvas2d, ctx.weaponSystems.activeVortexes);
  drawSandProjectiles(canvas2d, ctx.weaponSystems.sandProjectiles);
  drawPoisonBolts(canvas2d, ctx.weaponSystems.poisonBolts);
  drawEmeraldPlayerMissiles(canvas2d, ctx.weaponSystems.emeraldPlayerMissiles);
  drawEmeraldSubMissiles(canvas2d, ctx.weaponSystems.emeraldSubMissiles);
  drawEmeraldSwirlParticles(canvas2d, ctx.weaponSystems.emeraldSwirlParticles);
  drawSunstoneMines(canvas2d, ctx.weaponSystems.sunstoneMines);
  drawLaserBeamEffect(canvas2d, ctx.weaponSystems.laserBeamEffect);
  drawEnemyIndicators(canvas2d, ctx.getEnemyIndicatorStyle(),
    ctx.enemies, ctx.sapphireEnemies, ctx.emeraldEnemies, ctx.amberEnemies, ctx.voidEnemies,
    ctx.quartzEnemies, ctx.rubyEnemies, ctx.sunstoneEnemies, ctx.citrineEnemies, ctx.ioliteEnemies,
    ctx.amethystEnemies, ctx.diamondEnemies, ctx.nullstoneEnemies, ctx.fracterylEnemies, ctx.eigensteinEnemies,
    bossEnemy, ctx.alivenGroups);

  drawPlayerMote(canvas2d, ctx.mote, ctx.getGlowMovementIntensity(), rpgPhase, ctx.getDeathAlpha(), glowTimeS, ctx.getPlayerIFramesMs());

  drawHitEffects(canvas2d, ctx.hitEffects);
  drawLuckyMotes(canvas2d, ctx.luckyMotes, ctx.getIsLowGraphicsMode());
  drawDamageNumbers(canvas2d, ctx.damageNumbers);
  drawLuckyMotePopups(canvas2d, ctx.luckyMotePopups, ctx.getIsLowGraphicsMode());
  if (ctx.deathParticles.length > 0) drawDeathParticles(canvas2d, ctx.deathParticles);

  // Draw weapon orbit particles, orbit projectile, and special weapon visuals above the player.
  if (rpgPhase === 'alive') {
    for (const p of ctx.weaponOrbitParticles) drawWeaponOrbitParticle(canvas2d, p);
    drawOrbitProjectile(canvas2d, ctx.getOrbitProjectile());
    for (const ws of ctx.weaponSystems.chainWhipStates.values()) drawChainWhip(canvas2d, ws);
    const effectiveEquippedIds = ctx.getEffectiveEquippedIds();
    // Draw prismatic diamond sword combos only when Diamond Blade is equipped.
    if (effectiveEquippedIds.has(DIAMOND_BLADE_ID)) {
      drawSwordCombos(canvas2d, ctx.weaponSystems.swordComboStates, ctx.mote, ctx.rpgSimState.weaponTiersByWeaponId);
    }
    // Draw the Sand Blade when Diamond Blade is not equipped.
    // Sand Blade is the permanent default melee weapon; it is only suppressed
    // by Diamond Blade, not by any other equipped weapon.
    if (!effectiveEquippedIds.has(DIAMOND_BLADE_ID)) {
      drawSandBladeCombo(canvas2d, ctx.weaponSystems.swordComboStates.get(BASE_ATTACK_TIMER_KEY), ctx.mote);
      drawSandDriftPixels(canvas2d);
    }
    // ── Companion ships and lasers ────────────────────────────────
    drawSapphireShips(canvas2d, ctx.weaponSystems.sapphireShips);
    drawSapphireLasers(canvas2d, ctx.weaponSystems.sapphireLasers);
    drawAmethystShips(canvas2d, ctx.weaponSystems.amethystShips);
    drawAmethystLasers(canvas2d, ctx.weaponSystems.amethystLasers);
    // ── Target reticle ────────────────────────────────────────────
    const te = ctx.getTargetedEnemy();
    if (te) {
      drawTargetReticle(canvas2d, te.x, te.y, 10, performance.now());
    }
  }

  if (ctx.joystick.isActive && rpgPhase === 'alive') {
    canvas2d.save();
    canvas2d.globalAlpha = 0.35; canvas2d.strokeStyle = '#fff172'; canvas2d.lineWidth = 1;
    canvas2d.beginPath(); canvas2d.arc(ctx.joystick.baseX, ctx.joystick.baseY, JOYSTICK_OUTER_RADIUS, 0, Math.PI * 2); canvas2d.stroke();
    canvas2d.globalAlpha = 0.55; canvas2d.fillStyle = '#fff172';
    canvas2d.shadowBlur = JOYSTICK_THUMB_RADIUS * 2; canvas2d.shadowColor = 'rgba(255, 241, 114, 0.6)';
    canvas2d.beginPath(); canvas2d.arc(ctx.joystick.thumbX, ctx.joystick.thumbY, JOYSTICK_THUMB_RADIUS, 0, Math.PI * 2); canvas2d.fill();
    canvas2d.shadowBlur = 0; canvas2d.restore();
  }

  if (rpgPhase === 'alive') drawWaveClearBanner(canvas2d, ctx.getIsInterWave(), ctx.getCurrentWave(), ctx.getInterWaveTimerMs(), widthPx, heightPx);

  // ── Top-left zone + wave number overlay ──────────────────────────
  const currentWave = ctx.getCurrentWave();
  if (currentWave > 0) {
    // Check if any enemy or player is near the top-left corner region
    const TL_X = 210, TL_Y = 55;
    let anyOverlap = false;
    const moteNear = ctx.mote.x < TL_X && ctx.mote.y < TL_Y;
    if (moteNear) {
      anyOverlap = true;
    } else {
      for (const e of ctx.enemies) {
        if (e.x < TL_X && e.y < TL_Y) { anyOverlap = true; break; }
      }
      if (!anyOverlap) {
        for (const e of ctx.sapphireEnemies) {
          if (e.x < TL_X && e.y < TL_Y) { anyOverlap = true; break; }
        }
      }
      if (!anyOverlap) {
        for (const e of ctx.emeraldEnemies) {
          if (e.x < TL_X && e.y < TL_Y) { anyOverlap = true; break; }
        }
      }
    }
    const targetAlpha = anyOverlap ? 0.30 : 1.0;
    state.waveOverlapAlpha += (targetAlpha - state.waveOverlapAlpha) * 0.1;

    const zoneName = ctx.getActiveZoneDisplayName();
    const label = `${zoneName} - x${currentWave}`;

    canvas2d.save();
    canvas2d.globalAlpha = state.waveOverlapAlpha;
    canvas2d.font = 'bold 14px monospace';
    canvas2d.fillStyle = '#fff172';
    canvas2d.fillText(label, 8, 22);
    // Subtle underline hint to indicate tappability
    const textW = canvas2d.measureText(label).width;
    canvas2d.globalAlpha = state.waveOverlapAlpha * 0.45;
    canvas2d.strokeStyle = '#fff172';
    canvas2d.lineWidth = 0.5;
    canvas2d.beginPath();
    canvas2d.moveTo(8, 24);
    canvas2d.lineTo(8 + textW, 24);
    canvas2d.stroke();
    canvas2d.restore();
  }

  const screenDarken = ctx.getScreenDarken();
  if (screenDarken > 0) {
    canvas2d.globalAlpha = screenDarken; canvas2d.fillStyle = '#000000';
    canvas2d.fillRect(0, 0, widthPx, heightPx); canvas2d.globalAlpha = 1;
  }
  if (rpgPhase === 'restarting') {
    canvas2d.globalAlpha = 1 - ctx.getRestartFadeAlpha(); canvas2d.fillStyle = '#000000';
    canvas2d.fillRect(0, 0, widthPx, heightPx); canvas2d.globalAlpha = 1;
  }

  // ── Developer-mode viewport diagnostics ──────────────────────
  if (ctx.getIsDevMode()) {
    drawRpgViewportDiagnostics(canvas2d, widthPx, heightPx, ctx);
  }

  // Close the screen-shake translate if one was opened.
  if (hasShake) canvas2d.restore();
}

// ── Developer-mode viewport diagnostics ───────────────────────────────────────

/**
 * Draws a small diagnostic overlay in the bottom-left corner of the RPG canvas
 * showing the current viewport state.  Visible only when dev mode is enabled.
 *
 * Information displayed:
 *   - RPG world (logical) size — the fixed coordinate space all entities live in
 *   - Canvas backing store size — always equal to the world size
 *   - CSS display size — the rendered size in CSS pixels (may differ due to scaling)
 *   - devicePixelRatio — current browser DPR (may change with zoom)
 *   - Render scale — CSS-to-world scale factor (cssWidth / worldWidth)
 *   - Player world position — verifiable via resize stability check
 */
function drawRpgViewportDiagnostics(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  ctx: RpgDrawCtx,
): void {
  const css = ctx.getCssDisplaySize();
  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  const scaleX = css.w > 0 ? (css.w / widthPx).toFixed(3) : '—';
  const scaleY = css.h > 0 ? (css.h / heightPx).toFixed(3) : '—';
  const mx = ctx.mote.x.toFixed(1);
  const my = ctx.mote.y.toFixed(1);
  const terrainState = ctx.getTopographicTerrainState();
  const lowG = ctx.getIsLowGraphicsMode();
  const activeZone = ctx.rpgSimState.activeZoneId;
  const activeSubzone = ctx.rpgSimState.activeSubzoneId;

  // ── Background/effect route label ────────────────────────────────
  let bgRoute: string;
  if (activeZone === 'impetus') {
    bgRoute = `impetusStars+gravityWells${lowG ? 'Low' : 'High'}`;
  } else if (activeZone === 'caustics') {
    bgRoute = `causticsCachedTileLayers2tile${lowG ? 'Low' : 'High'}`;
  } else if (activeZone === 'verdure') {
    bgRoute = 'verdureWallsPlants';
  } else if (activeZone === 'horizon') {
    if (activeSubzone === 'nadir') bgRoute = 'horizonNadirSubstrate';
    else if (activeSubzone === 'true') bgRoute = 'horizonTruePlaceholder(zenithSubstrate)';
    else bgRoute = 'horizonZenithSubstrate';
  } else {
    bgRoute = 'none';
  }

  const sunlightOn = shouldDrawPersistentTopographySunlight(activeZone, terrainState);

  const lines = [
    `RPG world:  ${RPG_LOGICAL_WIDTH} × ${RPG_LOGICAL_HEIGHT}`,
    `Canvas backing: ${widthPx} × ${heightPx}`,
    `CSS display: ${css.w} × ${css.h}`,
    `devicePixelRatio: ${dpr.toFixed(2)}`,
    `render scale X/Y: ${scaleX} / ${scaleY}`,
    `player world: (${mx}, ${my})`,
    `zone: ${activeZone}  subzone: ${activeSubzone}`,
    `terrainKind: ${terrainState?.terrainKind ?? 'none'}`,
    `lowGraphics: ${lowG}`,
    `bg: ${bgRoute}`,
    `sunlightWash: ${sunlightOn ? 'on' : 'off'}`,
  ];

  // Append Impetus-specific diagnostic if in Impetus zone.
  if (activeZone === 'impetus') {
    lines.push(getImpetusDevLine(lowG));
  }

  // Append Caustics seafloor diagnostics.
  if (activeZone === 'caustics' && terrainState?.terrainKind === 'seafloorRidges') {
    const sfData = terrainState.seafloor;
    const segCount = sfData?.allCollisionSegments.length ?? 0;
    lines.push(`seafloorSegments: ${segCount}`);
    lines.push(`seafloorCollision: ${segCount > 0 ? 'on' : 'off'}`);
    // Height-aware caustics diagnostics.
    const ridgeCount = sfData?.ridges.length ?? 0;
    lines.push(`heightAwareCaustics: ${ridgeCount > 0 ? 'on' : 'off'}`);
    lines.push(`causticHeightShiftPx: 2.0`);
    if (sfData && ridgeCount > 0) {
      let maxW = 1;
      for (const r of sfData.ridges) if (r.width > maxW) maxW = r.width;
      lines.push(`ridgeElevRange: 0.0–1.0 (${ridgeCount} ridges)`);
      lines.push(`maxRidgeWidth: ${maxW.toFixed(1)}px`);
    }
  }

  canvas2d.save();
  canvas2d.font = '8px monospace';
  const lineH = 10;
  const pad = 4;
  const boxW = 220;  // widened for subzone + bg route lines
  const boxH = lines.length * lineH + pad * 2;
  const boxY = heightPx - boxH - 2;

  canvas2d.globalAlpha = 0.72;
  canvas2d.fillStyle = '#000000';
  canvas2d.fillRect(1, boxY, boxW, boxH);
  canvas2d.globalAlpha = 1;

  canvas2d.fillStyle = '#00ff88';
  for (let i = 0; i < lines.length; i++) {
    canvas2d.fillText(lines[i], 1 + pad, boxY + pad + (i + 1) * lineH - 2);
  }
  canvas2d.restore();
}

// ── Low-graphics mode forwarding ──────────────────────────────────────────────

/**
 * Propagates the low-graphics flag to every draw-side module.
 * Call from `RpgRender.setLowGraphicsMode()`.
 */
export function setAllDrawLowGraphics(enabled: boolean): void {
  setEnemyLowGraphics(enabled);
  setEntityLowGraphics(enabled);
  setPlayerDrawLowGraphics(enabled);
  setCombatEffectsLowGraphics(enabled);
  setCompanionLowGraphics(enabled);
  setWeaponChainLowGraphics(enabled);
  setWeaponSwordLowGraphics(enabled);
  setBossLowGraphics(enabled);
  setEliteDrawLowGraphics(enabled);
  setStardustDrawLowGraphics(enabled);
  setNadirCubeLowGraphics(enabled);
  setAlivenLowGraphics(enabled);
  setDrawBossAttacksLowGraphics(enabled);
  setStageDirLowGraphics(enabled);
  // No per-module low-graphics for terrain (it already skips when hidden)
}
