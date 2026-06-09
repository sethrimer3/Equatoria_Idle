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
  drawFracterylSpears, drawFracterylBlooms,
  setFracterylLowGraphicsMode,
} from './rpg-weapon-draw-fracteryl';
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
import { renderEnemySpeechBubbles } from './rpg-enemy-barks';
import { drawProceduralEnemies } from './rpg-procedural-draw';
import {
  drawEliteEnemies,
  setLowGraphicsMode as setEliteDrawLowGraphics,
} from './rpg-elite-enemy-draw';
import { drawStardustEnemies, setLowGraphicsMode as setStardustDrawLowGraphics } from './rpg-stardust-draw';
import { drawHorizonPentagonGroups } from './horizon-pentagon-draw';
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
import { JOYSTICK_OUTER_RADIUS, JOYSTICK_THUMB_RADIUS, BASE_ATTACK_TIMER_KEY, RPG_LOGICAL_WIDTH, RPG_LOGICAL_HEIGHT } from './rpg-constants';
import { resolveWeaponDefinition } from '../../data/rpg/crafted-weapon-helpers';
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
  drawImpetusSunLight,
  drawImpetusFloorEffects,
  getImpetusDevLine,
} from './terrain/impetus-overlay';
import { getImpetusDustDevLine } from './terrain/impetus-space-dust';
import {
  drawImpetusParticleLifeMatrix,
  getParticleLifeTelemetry,
} from './terrain/impetus-particle-life';
import { getAlivenGroupTelemetry } from './rpg-aliven-updates';
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
import { getSpawnDebugLog } from './rpg-enemy-spawn';
import type { RpgFieldSpace } from './rpgFieldSpace';
import { renderEnemyStatusLabels } from './enemy-status-render';
import { getCachedImage, loadImage } from '../assets/asset-loader';

const RPG_ZONE_LABEL_ICON_PATH = 'ASSETS/SPRITES/menuElements/icons/rpgTab/rpgTab_icon_selected.png';

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
  horizonPentagonGroups: import('./horizon-pentagon-types').HorizonPentagonGroup[];
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
  getSoftImpetusAsteroidShadowsEnabled(): boolean;
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
  /** Returns true when pixelated RPG rendering is active (dev mode only). */
  getRpgPixelatedRenderEnabled(): boolean;
  /** Returns the current CSS display size of the #rpg-area wrapper (for dev overlay). */
  getCssDisplaySize(): { w: number; h: number };
  /** Returns the full canvas CSS width (may be wider than the 360×640 safe core). */
  getFullW?(): number;
  /** Returns the full canvas CSS height (may be taller than the 360×640 safe core). */
  getFullH?(): number;
  /** Returns the X offset (CSS px) that centres the safe core within the full canvas. */
  getSafeOffsetX?(): number;
  /** Returns the Y offset (CSS px) that centres the safe core within the full canvas. */
  getSafeOffsetY?(): number;
  /** Returns the uniform scale applied to map the 360×640 world into the full canvas. */
  getSafeScale?(): number;
  /** Returns the expanded world-space width visible through the full canvas. */
  getWorldViewW?(): number;
  /** Returns the expanded world-space height visible through the full canvas. */
  getWorldViewH?(): number;
  /** Returns the authoritative field-space snapshot for this frame. */
  getFieldSpace(): RpgFieldSpace;
  /** Returns the current navigation grid for pathfinding debug draw. */
  getNavGrid(): import('./terrain/rpg-pathfinding').RpgNavGrid | null;
  /** Returns true when pathfinding debug visualization should be drawn. */
  getPathfindingDebugEnabled(): boolean;
  /** Returns true when the viewport/field-space diagnostic overlay should be drawn. */
  getViewportDebugEnabled(): boolean;
  /** Returns true when Verdure cave wall debug guides should be drawn. */
  getVerdureWallDebugEnabled(): boolean;
  /** Returns true when Nadir cube anchor/projection debug guides should be drawn. */
  getNadirAnchorDebugEnabled(): boolean;
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
  codexNotificationStartedMs: number;
}

/** Creates the initial draw frame state. */
export function createRpgDrawFrameState(): RpgDrawFrameState {
  return { waveOverlapAlpha: 1.0, codexNotificationStartedMs: 0 };
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
 * Collects the player and all currently-alive enemy positions together with
 * their RGB colours into a flat `EnemyInfluencePoint[]`. Only called for
 * terrain variants that use proximity-gradient colouring.
 */
function collectEnemyInfluencePoints(ctx: RpgDrawCtx): EnemyInfluencePoint[] {
  const pts: EnemyInfluencePoint[] = [];

  function push(x: number, y: number, rgb: [number, number, number]): void {
    pts.push({ x, y, r: rgb[0], g: rgb[1], b: rgb[2] });
  }

  push(ctx.mote.x, ctx.mote.y, [FLUID_SAND_R, FLUID_SAND_G, FLUID_SAND_B]);

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
): TerrainLightEmitter[] {
  const pb = ctx.getFieldSpace().paddedEffectBounds;
  const inView = (x: number, y: number) =>
    x >= pb.left && x <= pb.right &&
    y >= pb.top && y <= pb.bottom;

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

  // ── Step 1: clear the full physical backing at identity transform ─────────
  // The canvas fills the full container; all areas (including those beyond the
  // safe-core world) must be explicitly cleared before the world transform is
  // applied.  Use fieldSpace as the authoritative source for all sizing.
  const fs = ctx.getFieldSpace();
  const dpr = fs.dpr;

  canvas2d.setTransform(1, 0, 0, 1, 0, 0);
  canvas2d.clearRect(0, 0, fs.backingW, fs.backingH);
  canvas2d.fillStyle = '#0a0a12';
  canvas2d.fillRect(0, 0, fs.backingW, fs.backingH);

  // ── Step 2: apply world transform (world → full canvas) ───────────────────
  // All subsequent draw calls use world coordinates.
  // The transform maps world origin to (offsetX*dpr, offsetY*dpr) in physical pixels.
  canvas2d.setTransform(fs.scale * dpr, 0, 0, fs.scale * dpr, fs.offsetX * dpr, fs.offsetY * dpr);

  // Visible-world rect: the entire canvas area expressed in world coordinates.
  // On a 360×640 reference device: left=0, top=0, width=360, height=640.
  // On a 600×640 wider canvas (scale=1.0): left=-120, width=600.
  const vwX = fs.visibleBounds.left;
  const vwY = fs.visibleBounds.top;
  const vwW = fs.visibleBounds.width;
  const vwH = fs.visibleBounds.height;

  // Clear and fill the full visible world area (covers extra space when canvas > safe-core).
  canvas2d.clearRect(vwX, vwY, vwW, vwH);
  canvas2d.fillStyle = '#0a0a12';
  canvas2d.fillRect(vwX, vwY, vwW, vwH);

  // Apply Zenith Binary Horizon screen-shake offset (0,0 when inactive).
  const shakeOff = ctx.getZenithShakeOffset?.() ?? { x: 0, y: 0 };
  const hasShake = shakeOff.x !== 0 || shakeOff.y !== 0;
  if (hasShake) {
    canvas2d.save();
    canvas2d.translate(shakeOff.x, shakeOff.y);
  }

  // Zone atmosphere tints — rendered immediately after the background fill so
  // they sit behind fluid, terrain, and all gameplay elements.
  // Each zone background is drawn with translate(vwX, vwY) so that the
  // background fills the full visible canvas area (including extra space when the
  // canvas is wider/taller than the safe-core world).
  const isCausticsZone  = ctx.rpgSimState.activeZoneId === 'caustics';
  const isVerdureZone   = ctx.rpgSimState.activeZoneId === 'verdure';
  const isImpetusZone   = ctx.rpgSimState.activeZoneId === 'impetus';
  const isHorizonZone   = ctx.rpgSimState.activeZoneId === 'horizon';
  const isEuhedralZone  = ctx.rpgSimState.activeZoneId === 'euhedral';
  if (isCausticsZone) {
    canvas2d.save();
    canvas2d.translate(vwX, vwY);
    drawCausticsBackground(canvas2d, vwW, vwH, ctx.getIsLowGraphicsMode());
    canvas2d.restore();
  }
  // Verdure zone: dark forest-green / bioluminescent atmosphere tint.
  // drawVerdureBackground — LOCAL coords (drawn after translate(vwX, vwY), fills 0..vwW × 0..vwH).
  if (isVerdureZone) {
    canvas2d.save();
    canvas2d.translate(vwX, vwY);
    drawVerdureBackground(canvas2d, vwW, vwH, ctx.getIsLowGraphicsMode());
    canvas2d.restore();
    const wState = ctx.getVerdureCaveWallState?.();
    if (wState) {
      // Elite waves are every multiple of 10 (wave 10, 20, 30, …).
      // They use the existing pixelated/blocky Voronoi look.
      // Non-elite waves use the crisp segmented surface system.
      const verdureWave = ctx.getCurrentWave();
      const isEliteVerdureWave = verdureWave > 0 && verdureWave % 10 === 0;
      if (isEliteVerdureWave) {
        // drawVerdureFloor / drawVerdureCaveWalls — WORLD coords (drawn at wState.originX/Y, no translate).
        drawVerdureFloor(canvas2d, wState, ctx.getIsLowGraphicsMode());
        drawVerdureCaveWalls(canvas2d, wState, ctx.getIsLowGraphicsMode());
      } else {
        // Segmented surface: static base + dynamic tint from nearby combat objects.
        // drawVerdureFloorSegmented / drawVerdureWallsSegmented — WORLD coords
        // (static canvas drawn at wState.originX/Y; dynamic tint translates internally).
        const influences = ctx.getIsLowGraphicsMode()
          ? ([] as VerdureInfluenceObj[])
          : _collectVerdureInfluences(ctx);
        drawVerdureFloorSegmented(canvas2d, wState, ctx.getIsLowGraphicsMode());
        drawVerdureWallsSegmented(canvas2d, wState, ctx.getIsLowGraphicsMode(), influences);
      }
    } else {
      // Fallback before wState is ready (first frame of wave): LOCAL coords.
      canvas2d.save();
      canvas2d.translate(vwX, vwY);
      drawVerdureEdgeRocks(canvas2d, vwW, vwH, ctx.getIsLowGraphicsMode());
      canvas2d.restore();
    }
  }
  if (isImpetusZone) {
    canvas2d.save();
    canvas2d.translate(vwX, vwY);
    drawImpetusBackground(canvas2d, vwW, vwH, nowMs, ctx.getIsLowGraphicsMode());
    drawImpetusParticleLifeMatrix(canvas2d, vwW, vwH);
    drawImpetusSunLight(canvas2d, vwW, vwH, ctx.getIsLowGraphicsMode());
    canvas2d.restore();
  }
  if (isHorizonZone) {
    canvas2d.save();
    canvas2d.translate(vwX, vwY);
    ctx.drawZoneBgOverlay?.(canvas2d, vwW, vwH, nowMs);
    canvas2d.restore();
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
    ? _collectTerrainLightEmitters(ctx)
    : undefined;

  // Euhedral full-screen hex floor — drawn after the background fill and before
  // the fluid/terrain so it sits as ground-level atmosphere.
  // Canvas is translated to (vwX, vwY) so hexes fill the full visible canvas in
  // local draw coords.  vwX/vwY are passed as worldOriginX/Y so the function can
  // convert local cell centers to world space before sampling terrain light emitters
  // (which always carry world-space coordinates).
  if (isEuhedralZone && !ctx.getIsLowGraphicsMode()) {
    canvas2d.save();
    canvas2d.translate(vwX, vwY);
    drawEuhedralHexFloor(canvas2d, vwW, vwH, euhedralLights ?? [], false, vwX, vwY);
    canvas2d.restore();
  }

  if (shouldDrawPersistentTopographySunlight(ctx.rpgSimState.activeZoneId, terrainState)) {
    canvas2d.save();
    canvas2d.translate(vwX, vwY);
    renderPersistentTopographySunlight(canvas2d, vwW, vwH, terrainState!.paletteId);
    canvas2d.restore();
  }
  if (terrainState) {
    // For recursive-square and basalt terrain, collect nearby actor positions for
    // proximity-gradient colouring.  This is skipped for other terrain variants.
    const squareEnemies =
      (terrainState.terrainKind === 'recursiveSquares' || terrainState.terrainKind === 'basalt')
        ? collectEnemyInfluencePoints(ctx)
        : undefined;
    renderTopographicTerrain(canvas2d, terrainState, nowMs, squareEnemies, ctx.getIsLowGraphicsMode(), euhedralLights);
    // Topographic lighting overlay is only applicable to the organic contour variant;
    // skip it for recursive-square terrain which has its own visual style.
    // Rendered over the full visible world via fs.visibleBounds so lighting extends
    // beyond the safe core and aligns with the world-space terrain.
    if (terrainState.terrainKind === 'topographic') {
      renderTopographyLighting(canvas2d, terrainState, fs.visibleBounds);
    }
  }

  // Caustics floor effects cover the full visible world.
  // The context is translated by (vwX, vwY) so the light-buffer tiles and
  // geometry fill the entire visible canvas.  Ridge world coordinates are
  // offset by (-vwX, -vwY) inside the function to align with the translated frame.
  if (isCausticsZone) {
    canvas2d.save();
    canvas2d.translate(vwX, vwY);
    drawCausticsFloorEffects(
      canvas2d, vwW, vwH, nowMs, ctx.getIsLowGraphicsMode(),
      terrainState?.seafloor,
      vwX, vwY,
    );
    canvas2d.restore();
  }
  if (isImpetusZone) {
    canvas2d.save();
    canvas2d.translate(vwX, vwY);
    drawImpetusFloorEffects(
      canvas2d, vwW, vwH, nowMs, ctx.getIsLowGraphicsMode(),
      ctx.getSoftImpetusAsteroidShadowsEnabled(),
    );
    canvas2d.restore();
  }
  // Verdure zone: floor plant decoration, procedural vines, pollen particles.
  // drawVerdureFloorEffects — LOCAL coords (drawn after translate(vwX, vwY); purely atmospheric).
  // drawVerdurePlants / drawVerdureFragments — WORLD coords (plant positions are world-space; no translate).
  if (isVerdureZone) {
    canvas2d.save();
    canvas2d.translate(vwX, vwY);
    drawVerdureFloorEffects(
      canvas2d, vwW, vwH, nowMs,
      // Player position in local (translated) space so proximity physics align correctly.
      ctx.mote.x - vwX, ctx.mote.y - vwY,
      ctx.getIsLowGraphicsMode(),
    );
    canvas2d.restore();
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
  if (ctx.getVerdureWallDebugEnabled() && isVerdureZone) {
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
      ctx.getNadirAnchorDebugEnabled() ? (ctx.getNadirCubeProjectionState?.() ?? null) : null,
      ctx.getNadirAnchorDebugEnabled(),
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
  drawEigensteinBeams(canvas2d, ctx.eigensteinBeams, vwW, vwH);
  drawEliteEnemies(canvas2d, ctx.eliteEnemies);
  drawPolyominoEnemies(canvas2d, ctx.polyominoEnemies, nowMs);
  drawFissilePolyominoEnemies(canvas2d, ctx.fissilePolyominoEnemies, nowMs);
  drawRefractorPolyominoEnemies(canvas2d, ctx.refractorPolyominoEnemies, nowMs);
  drawEmpowerParticles(canvas2d, fs.visibleBounds);
  drawStardustEnemies(canvas2d, ctx.stardustEnemies);
  drawHorizonPentagonGroups(canvas2d, ctx.horizonPentagonGroups, widthPx);
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
  drawFracterylSpears(canvas2d, ctx.weaponSystems.fracterylSpears);
  drawFracterylBlooms(canvas2d, ctx.weaponSystems.fracterylBlooms);
  drawLaserBeamEffect(canvas2d, ctx.weaponSystems.laserBeamEffect);
  drawEnemyIndicators(canvas2d, ctx.getEnemyIndicatorStyle(),
    ctx.enemies, ctx.sapphireEnemies, ctx.emeraldEnemies, ctx.amberEnemies, ctx.voidEnemies,
    ctx.quartzEnemies, ctx.rubyEnemies, ctx.sunstoneEnemies, ctx.citrineEnemies, ctx.ioliteEnemies,
    ctx.amethystEnemies, ctx.diamondEnemies, ctx.nullstoneEnemies, ctx.fracterylEnemies, ctx.eigensteinEnemies,
    bossEnemy, ctx.alivenGroups);

  drawPlayerMote(canvas2d, ctx.mote, ctx.getGlowMovementIntensity(), rpgPhase, ctx.getDeathAlpha(), glowTimeS, ctx.getPlayerIFramesMs());

  renderEnemyStatusLabels(canvas2d, ctx);
  drawHitEffects(canvas2d, ctx.hitEffects);
  drawLuckyMotes(canvas2d, ctx.luckyMotes, ctx.getIsLowGraphicsMode());
  drawDamageNumbers(canvas2d, ctx.damageNumbers);
  renderEnemySpeechBubbles(canvas2d, fs.visibleBounds);
  drawLuckyMotePopups(canvas2d, ctx.luckyMotePopups, ctx.getIsLowGraphicsMode());
  if (ctx.deathParticles.length > 0) drawDeathParticles(canvas2d, ctx.deathParticles);

  // Draw weapon orbit particles, orbit projectile, and special weapon visuals above the player.
  if (rpgPhase === 'alive') {
    for (const p of ctx.weaponOrbitParticles) drawWeaponOrbitParticle(canvas2d, p);
    drawOrbitProjectile(canvas2d, ctx.getOrbitProjectile());
    for (const ws of ctx.weaponSystems.chainWhipStates.values()) drawChainWhip(canvas2d, ws);
    const effectiveEquippedIds = ctx.getEffectiveEquippedIds();
    // Build the set of equipped swordCombo weapons. This excludes BASE_ATTACK_TIMER_KEY
    // (__base__ / Sand Blade) and any weapon that isn't effect.kind === 'swordCombo'.
    const equippedSwordComboIds = new Set<string>();
    for (const wid of effectiveEquippedIds) {
      if (resolveWeaponDefinition(wid)?.stats.effect?.kind === 'swordCombo') {
        equippedSwordComboIds.add(wid);
      }
    }
    // Draw swordCombo blades (Diamond, Eigenstein, or any future swordCombo weapon).
    if (equippedSwordComboIds.size > 0) {
      drawSwordCombos(canvas2d, ctx.weaponSystems.swordComboStates, ctx.mote, ctx.rpgSimState.weaponTiersByWeaponId, equippedSwordComboIds);
    }
    // Sand Blade: active only when no weapon is equipped and sandBladeEnabled is true.
    if (effectiveEquippedIds.size === 0 && ctx.rpgSimState.sandBladeEnabled) {
      drawSandBladeCombo(canvas2d, ctx.weaponSystems.swordComboStates.get(BASE_ATTACK_TIMER_KEY), ctx.mote);
      drawSandDriftPixels(canvas2d);
    }
    if (ctx.getIsDevMode()) {
      console.debug('[sword-render]', {
        effectiveEquippedIds: [...effectiveEquippedIds],
        swordComboStateKeys: [...ctx.weaponSystems.swordComboStates.keys()],
        equippedSwordComboIds: [...equippedSwordComboIds],
        sandBladeActive: effectiveEquippedIds.size === 0 && ctx.rpgSimState.sandBladeEnabled,
      });
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
    const overlayLeft = fs.visibleBounds.left + 8;
    const overlayTop = fs.visibleBounds.top + 8;
    const overlapRight = overlayLeft + 210;
    const overlapBottom = overlayTop + 55;

    // Check if any enemy or player is near the top-left overlay region.
    let anyOverlap = false;
    const moteNear = ctx.mote.x < overlapRight && ctx.mote.y < overlapBottom;
    if (moteNear) {
      anyOverlap = true;
    } else {
      for (const e of ctx.enemies) {
        if (e.x < overlapRight && e.y < overlapBottom) { anyOverlap = true; break; }
      }
      if (!anyOverlap) {
        for (const e of ctx.sapphireEnemies) {
          if (e.x < overlapRight && e.y < overlapBottom) { anyOverlap = true; break; }
        }
      }
      if (!anyOverlap) {
        for (const e of ctx.emeraldEnemies) {
          if (e.x < overlapRight && e.y < overlapBottom) { anyOverlap = true; break; }
        }
      }
    }
    const targetAlpha = anyOverlap ? 0.30 : 1.0;
    state.waveOverlapAlpha += (targetAlpha - state.waveOverlapAlpha) * 0.1;

    const zoneName = ctx.getActiveZoneDisplayName();
    const label = `${zoneName} - x${currentWave}`;

    const iconSize = 20;
    const iconGap = 5;
    const textX = overlayLeft + iconSize + iconGap;

    canvas2d.save();
    canvas2d.globalAlpha = state.waveOverlapAlpha;
    canvas2d.font = 'bold 14px monospace';
    canvas2d.fillStyle = '#fff172';
    canvas2d.textAlign = 'left';
    canvas2d.textBaseline = 'top';
    canvas2d.fillText(label, textX, overlayTop + 2);
    const textW = canvas2d.measureText(label).width;
    const icon = getCachedImage(RPG_ZONE_LABEL_ICON_PATH);
    if (icon) {
      canvas2d.drawImage(icon, overlayLeft, overlayTop, iconSize, iconSize);
    } else {
      loadImage(RPG_ZONE_LABEL_ICON_PATH).catch(() => {});
    }
    // Underline
    canvas2d.globalAlpha = state.waveOverlapAlpha * 0.45;
    canvas2d.strokeStyle = '#fff172';
    canvas2d.lineWidth = 0.5;
    canvas2d.beginPath();
    canvas2d.moveTo(textX, overlayTop + 18);
    canvas2d.lineTo(textX + textW, overlayTop + 18);
    canvas2d.stroke();
    // Upward-pointing golden triangle — tap affordance below the zone title group
    const groupWidth = iconSize + iconGap + textW;
    const triCx = overlayLeft + groupWidth / 2;
    const triY = overlayTop + 23;
    const triHalfW = 5;
    const triH = 4;
    canvas2d.globalAlpha = state.waveOverlapAlpha * 0.55;
    canvas2d.fillStyle = '#fff172';
    canvas2d.beginPath();
    canvas2d.moveTo(triCx, triY);
    canvas2d.lineTo(triCx - triHalfW, triY + triH);
    canvas2d.lineTo(triCx + triHalfW, triY + triH);
    canvas2d.closePath();
    canvas2d.fill();
    canvas2d.restore();
    if (state.codexNotificationStartedMs > 0) {
      const elapsedMs = nowMs - state.codexNotificationStartedMs;
      if (elapsedMs < 2_200) {
        const alpha = Math.min(1, elapsedMs / 180) * Math.min(1, (2_200 - elapsedMs) / 450);
        canvas2d.save();
        canvas2d.globalAlpha = alpha;
        canvas2d.font = 'bold 12px monospace';
        canvas2d.fillStyle = '#fff172';
        canvas2d.textAlign = 'left';
        canvas2d.textBaseline = 'top';
        canvas2d.fillText('New Codex Entry!', textX, overlayTop + 30 + Math.min(24, elapsedMs * 0.025));
        canvas2d.restore();
      }
    }
  }

  const screenDarken = ctx.getScreenDarken();
  if (screenDarken > 0) {
    canvas2d.globalAlpha = screenDarken; canvas2d.fillStyle = '#000000';
    canvas2d.fillRect(vwX, vwY, vwW, vwH); canvas2d.globalAlpha = 1;
  }
  if (rpgPhase === 'restarting') {
    canvas2d.globalAlpha = 1 - ctx.getRestartFadeAlpha(); canvas2d.fillStyle = '#000000';
    canvas2d.fillRect(vwX, vwY, vwW, vwH); canvas2d.globalAlpha = 1;
  }

  // ── Developer-mode viewport diagnostics ──────────────────────
  if (ctx.getViewportDebugEnabled()) {
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
 *   - Render host CSS size — actual on-screen size of the render area
 *   - Canvas CSS size — should match render host
 *   - Backing size — canvas CSS size × DPR (physical pixels)
 *   - devicePixelRatio
 *   - Stable RPG scale — pixels per world unit (must not increase when canvas grows)
 *   - Visible world width/height — canvas CSS / scale (increases as canvas grows)
 *   - Core gameplay size — the fixed 360×640 world
 *   - Camera offset — how the world origin is shifted within the canvas
 *   - Player world position — verifiable via resize stability check
 *
 * Warnings:
 *   - Scale changed significantly when only canvas width changed
 *   - visibleWorldW did not increase when canvas grew wider
 *   - Canvas is narrower than container (rpg-area layout bug)
 *   - Cover-style scaling detected (scale > 1 on a reference-sized canvas)
 */
function drawRpgViewportDiagnostics(
  canvas2d: CanvasRenderingContext2D,
  _widthPx: number,
  _heightPx: number,
  ctx: RpgDrawCtx,
): void {
  const fs = ctx.getFieldSpace();
  const css = ctx.getCssDisplaySize();
  const dpr = fs.dpr;

  // Derive legacy-compatible values from fieldSpace for display.
  const fullW     = fs.canvasCssW;
  const fullH     = fs.canvasCssH;
  const safeOffX  = fs.offsetX;
  const safeOffY  = fs.offsetY;
  const safeScl   = fs.scale;
  const backingW  = fs.backingW;
  const backingH  = fs.backingH;
  const worldViewW = fs.visibleBounds.width;
  const worldViewH = fs.visibleBounds.height;
  const safePx    = Math.round(Math.min(fullW, fullH, RPG_LOGICAL_WIDTH));

  const mx = ctx.mote.x.toFixed(1);
  const my = ctx.mote.y.toFixed(1);
  const terrainState = ctx.getTopographicTerrainState();
  const lowG = ctx.getIsLowGraphicsMode();
  const activeZone = ctx.rpgSimState.activeZoneId;
  const activeSubzone = ctx.rpgSimState.activeSubzoneId;

  // Warn if rpg-area is narrower than expected (full container).
  const widthMismatch = css.w > 0 && Math.abs(css.w - fullW) > 2;
  // Warn if world view is still not wider on a wider canvas (cover-style scaling bug).
  const stillNarrow = fullW > RPG_LOGICAL_WIDTH * safeScl + 4 && worldViewW < RPG_LOGICAL_WIDTH + 1;
  // Warn if the scale is greater than 1 on a canvas at or below reference size
  // (indicates cover-style zoom was applied).
  const scaleTooLarge = safeScl > 1.001 && fullW <= RPG_LOGICAL_WIDTH && fullH <= RPG_LOGICAL_HEIGHT;
  // Warn if activeBounds is smaller than visibleBounds (field-space invariant check).
  const activeSmallerThanVisible =
    fs.activeBounds.width < fs.visibleBounds.width - 1 ||
    fs.activeBounds.height < fs.visibleBounds.height - 1;

  // World-space visible bounds for camera info display.
  const camLeft    = fs.visibleBounds.left.toFixed(1);
  const camTop     = fs.visibleBounds.top.toFixed(1);
  const camRight   = fs.visibleBounds.right.toFixed(1);
  const camBottom  = fs.visibleBounds.bottom.toFixed(1);
  const camCenterX = (fs.visibleBounds.left + fs.visibleBounds.width  * 0.5).toFixed(1);
  const camCenterY = (fs.visibleBounds.top  + fs.visibleBounds.height * 0.5).toFixed(1);

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

  const lines: Array<{ text: string; warn?: boolean }> = [
    { text: `RPG world:  ${RPG_LOGICAL_WIDTH} × ${RPG_LOGICAL_HEIGHT}  (core gameplay)` },
    { text: `render host: ${css.w} × ${css.h}  canvas CSS: ${fullW} × ${fullH}`, warn: widthMismatch },
    { text: `backing: ${backingW} × ${backingH}  dpr: ${dpr.toFixed(2)}` },
    { text: `stable scale: ${safeScl.toFixed(3)}  safePx: ${safePx}`, warn: scaleTooLarge },
    { text: `visibleWorld: ${worldViewW.toFixed(1)} × ${worldViewH.toFixed(1)}`, warn: stillNarrow },
    { text: `cam offset: (${safeOffX.toFixed(1)}, ${safeOffY.toFixed(1)})` },
    { text: `cam bounds L/R: ${camLeft} / ${camRight}` },
    { text: `cam bounds T/B: ${camTop} / ${camBottom}` },
    { text: `cam center: (${camCenterX}, ${camCenterY})` },
  ];

  // ── Field-space block ─────────────────────────────────────────────
  {
    const vb = fs.visibleBounds;
    const ab = fs.activeBounds;
    const sb = fs.safeCoreBounds;
    const sp = fs.spawnBounds;
    const pb = fs.paddedEffectBounds;
    lines.push(
      { text: `── RpgFieldSpace ──────────────────────` },
      { text: `canvas CSS: ${fs.canvasCssW.toFixed(0)} × ${fs.canvasCssH.toFixed(0)}  dpr: ${fs.dpr.toFixed(2)}` },
      { text: `backing: ${fs.backingW} × ${fs.backingH}` },
      { text: `scale: ${fs.scale.toFixed(4)}`, warn: scaleTooLarge },
      { text: `cameraCenter: (${fs.cameraCenterX.toFixed(1)}, ${fs.cameraCenterY.toFixed(1)})` },
      { text: `visibleBounds: L${vb.left.toFixed(1)} T${vb.top.toFixed(1)} R${vb.right.toFixed(1)} B${vb.bottom.toFixed(1)}` },
      { text: `  w=${vb.width.toFixed(1)} h=${vb.height.toFixed(1)}`, warn: stillNarrow },
      { text: `activeBounds:  L${ab.left.toFixed(1)} T${ab.top.toFixed(1)} R${ab.right.toFixed(1)} B${ab.bottom.toFixed(1)}`, warn: activeSmallerThanVisible },
      { text: `safeCoreBounds:L${sb.left.toFixed(1)} T${sb.top.toFixed(1)} R${sb.right.toFixed(1)} B${sb.bottom.toFixed(1)}` },
      { text: `spawnBounds:   L${sp.left.toFixed(1)} T${sp.top.toFixed(1)} R${sp.right.toFixed(1)} B${sp.bottom.toFixed(1)}` },
      { text: `paddedEffectB: L${pb.left.toFixed(1)} T${pb.top.toFixed(1)} R${pb.right.toFixed(1)} B${pb.bottom.toFixed(1)}` },
      { text: `── end FieldSpace ─────────────────────` },
    );
  }

  lines.push(
    { text: `player world: (${mx}, ${my})` },
    { text: `zone: ${activeZone}  subzone: ${activeSubzone}` },
    { text: `terrainKind: ${terrainState?.terrainKind ?? 'none'}` },
    { text: `lowGraphics: ${lowG}` },
    { text: `bg: ${bgRoute}` },
    { text: `sunlightWash: ${sunlightOn ? 'on' : 'off'}` },
  );
  if (widthMismatch) {
    lines.push({ text: `⚠ area < container!`, warn: true });
  }
  if (stillNarrow) {
    lines.push({ text: `⚠ worldView still narrow!`, warn: true });
  }
  if (activeSmallerThanVisible) {
    lines.push({ text: `⚠ activeBounds < visibleBounds!`, warn: true });
  }

  // Append Impetus-specific diagnostics if in Impetus zone.
  if (activeZone === 'impetus') {
    lines.push({ text: getImpetusDevLine(lowG) });
    lines.push({ text: getImpetusDustDevLine() });
    const { activeGroups, totalAliveParticles } = getAlivenGroupTelemetry(ctx.alivenGroups);
    const { pairChecks, frameMs, profileName, coeffMin, coeffMax } = getParticleLifeTelemetry();
    lines.push({
      text: `aliven: ${activeGroups}g ${totalAliveParticles}p  plPairs:${pairChecks}  plMs:${frameMs.toFixed(1)}`,
    });
    lines.push({
      text: `plProfile:${profileName}  coeff:${coeffMin.toFixed(2)}..${coeffMax.toFixed(2)}`,
    });
  }

  // Append Caustics seafloor diagnostics.
  if (activeZone === 'caustics' && terrainState?.terrainKind === 'seafloorRidges') {
    const sfData = terrainState.seafloor;
    const segCount = sfData?.allCollisionSegments.length ?? 0;
    lines.push({ text: `seafloorSegments: ${segCount}` });
    lines.push({ text: `seafloorCollision: ${segCount > 0 ? 'on' : 'off'}` });
    // Height-aware caustics diagnostics.
    const ridgeCount = sfData?.ridges.length ?? 0;
    lines.push({ text: `heightAwareCaustics: ${ridgeCount > 0 ? 'on' : 'off'}` });
    lines.push({ text: `causticHeightShiftPx: 2.0` });
    if (sfData && ridgeCount > 0) {
      let maxW = 1;
      for (const r of sfData.ridges) if (r.width > maxW) maxW = r.width;
      lines.push({ text: `ridgeElevRange: 0.0–1.0 (${ridgeCount} ridges)` });
      lines.push({ text: `maxRidgeWidth: ${maxW.toFixed(1)}px` });
    }
  }

  canvas2d.save();
  canvas2d.font = '8px monospace';
  const lineH = 10;
  const pad = 4;
  const boxW = 220;  // widened for subzone + bg route lines
  const boxH = lines.length * lineH + pad * 2;
  // Anchor the text box to the bottom of the safe-core region so it stays
  // inside the stable composition area regardless of canvas height.
  const boxY = fs.safeCoreBounds.bottom - boxH - 2;

  canvas2d.globalAlpha = 0.72;
  canvas2d.fillStyle = '#000000';
  canvas2d.fillRect(1, boxY, boxW, boxH);
  canvas2d.globalAlpha = 1;

  for (let i = 0; i < lines.length; i++) {
    canvas2d.fillStyle = lines[i].warn ? '#ff4444' : '#00ff88';
    canvas2d.fillText(lines[i].text, 1 + pad, boxY + pad + (i + 1) * lineH - 2);
  }
  canvas2d.restore();

  // ── Field-space rectangle overlays ────────────────────────────────
  // Draw labelled outlines for each RpgFieldSpace bound so the active world
  // viewport is immediately visible in dev mode.
  _drawFieldSpaceOverlay(canvas2d, fs);
}

/**
 * Draws labelled rectangle outlines for each RpgFieldSpace bound, plus
 * spawn-candidate dots recorded since the last wave start.
 * Called only in dev mode from within the world-coordinate transform.
 */
function _drawFieldSpaceOverlay(
  c2d: CanvasRenderingContext2D,
  fs: RpgFieldSpace,
): void {
  c2d.save();
  c2d.lineWidth = 1 / fs.scale;  // 1 physical pixel regardless of zoom

  const rects: Array<{ rect: import('./rpgFieldSpace').WorldRect; color: string; label: string }> = [
    { rect: fs.paddedEffectBounds, color: 'rgba(128,128,255,0.4)',  label: 'paddedEffect' },
    { rect: fs.visibleBounds,      color: 'rgba(0,255,255,0.7)',    label: 'visible' },
    { rect: fs.activeBounds,       color: 'rgba(0,255,128,0.5)',    label: 'active' },
    { rect: fs.safeCoreBounds,     color: 'rgba(255,220,0,0.5)',    label: 'safeCore' },
    { rect: fs.spawnBounds,        color: 'rgba(255,80,80,0.5)',    label: 'spawn' },
  ];

  c2d.font = `${Math.round(8 / fs.scale)}px monospace`;

  for (const { rect, color, label } of rects) {
    c2d.strokeStyle = color;
    c2d.setLineDash([4 / fs.scale, 3 / fs.scale]);
    c2d.strokeRect(rect.left, rect.top, rect.width, rect.height);
    c2d.setLineDash([]);

    // Label near the top-left corner of each rect
    c2d.fillStyle = color;
    c2d.globalAlpha = 0.9;
    c2d.fillText(label, rect.left + 2 / fs.scale, rect.top + 10 / fs.scale);
    c2d.globalAlpha = 1;
  }

  // ── Spawn-candidate dots ───────────────────────────────────────────
  // Dot colours: green = accepted spawn, orange = verdure fallback.
  const spawnLog = getSpawnDebugLog();
  if (spawnLog.length > 0) {
    const dotR = 3 / fs.scale;
    for (const entry of spawnLog) {
      c2d.beginPath();
      c2d.arc(entry.x, entry.y, dotR, 0, Math.PI * 2);
      c2d.fillStyle = entry.kind === 'fallback' ? 'rgba(255,160,0,0.85)' : 'rgba(80,255,80,0.8)';
      c2d.fill();
    }
    // Legend in top-left of spawnBounds
    const sp = fs.spawnBounds;
    c2d.font = `${Math.round(7 / fs.scale)}px monospace`;
    c2d.fillStyle = 'rgba(80,255,80,0.9)';
    c2d.fillText('● accepted', sp.left + 4 / fs.scale, sp.top + 18 / fs.scale);
    c2d.fillStyle = 'rgba(255,160,0,0.9)';
    c2d.fillText('● fallback',  sp.left + 4 / fs.scale, sp.top + 28 / fs.scale);
  }

  c2d.restore();
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
  setFracterylLowGraphicsMode(enabled);
  // No per-module low-graphics for terrain (it already skips when hidden)
}
