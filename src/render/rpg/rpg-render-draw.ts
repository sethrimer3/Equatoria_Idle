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
import { getActivePlayerStatuses } from '../../sim/rpg/player-status-effects';
import { getCachedImage, loadImage } from '../assets/asset-loader';
import {
  ENEMY_CODEX_TAB_GLOW_ICON_PATH,
  ZONE_SELECTION_BAR_OVERLAY_PATHS,
  ZONE_SELECTION_GLOW_OVERLAY_PATHS,
  ZONE_SELECTION_ICON_PATH,
  ZONE_SELECTION_SHEEN_OVERLAY_PATHS,
} from '../assets/asset-paths';
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
import { getBossBeatVisualState, type BossBeatVisualState } from './rpg-boss-beat-visuals';
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
  drawPlayerMote, drawAfterimages, drawPlayerStatusVFX,
  setLowGraphicsMode as setPlayerDrawLowGraphics,
} from './rpg-player-draw';
import {
  drawDeathParticles, drawShotLines, drawHitEffects, drawDamageNumbers, drawComboEffects, drawWardEffects,
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
import { drawBossEnemy, drawBottomSafeZone, drawDanmakuSafeZone, drawWaveClearBanner, drawBossArenaWalls, setLowGraphicsMode as setBossLowGraphics } from './rpg-boss-draw';
import { drawAlivenGroups, setAlivenLowGraphics } from './rpg-aliven-draw';
import { drawLifeColonies } from './life-draw';
import { renderEnemySpeechBubbles } from './rpg-enemy-barks';
import { renderBossDialogue } from './rpg-boss-dialogue';
import { drawProceduralEnemies } from './rpg-procedural-draw';
import {
  drawEliteEnemies,
  setLowGraphicsMode as setEliteDrawLowGraphics,
} from './rpg-elite-enemy-draw';
import { drawStardustEnemies, setLowGraphicsMode as setStardustDrawLowGraphics } from './rpg-stardust-draw';
import { drawHorizonPentagonGroups } from './horizon-pentagon-draw';
import { drawSpawnFlashes } from './rpg-spawn-flash';
import { drawBossSpawnCircles } from './rpg-boss-spawn-circle';
import { getBossIntroDrawState } from './boss-intro-director';
import { drawDyingEnemies } from './rpg-death-fade';
import {
  drawPolyominoEnemies,
  drawFissilePolyominoEnemies,
  drawRefractorPolyominoEnemies,
} from './polyomino-enemy-draw';
import type {
  RpgMote, RpgJoystick, RpgPhase,
  HitEffect, ShotLine, DamageNumber, DeathParticle, ComboEffect, WardEffect,
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
import { drawTrueSurfaceElite } from './true-surface-elite';
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
import { drawTargetNamePopup } from './rpg-target-popup';

type ZoneIconLayerTiming = {
  readonly cycleMs: number;
  readonly fadeInMs: number;
  readonly holdMs: number;
  readonly fadeOutMs: number;
  readonly offsetMs: number;
  readonly alpha: number;
};

const ZONE_ICON_GLOW_TIMINGS: readonly ZoneIconLayerTiming[] = [
  { cycleMs: 18_700, fadeInMs: 1_800, holdMs: 1_100, fadeOutMs: 2_200, offsetMs: 1_300, alpha: 0.78 },
  { cycleMs: 24_900, fadeInMs: 2_200, holdMs: 1_500, fadeOutMs: 2_600, offsetMs: 7_900, alpha: 0.70 },
  { cycleMs: 31_400, fadeInMs: 1_500, holdMs: 900, fadeOutMs: 2_100, offsetMs: 12_600, alpha: 0.74 },
  { cycleMs: 27_300, fadeInMs: 2_500, holdMs: 1_300, fadeOutMs: 2_900, offsetMs: 18_200, alpha: 0.66 },
  { cycleMs: 36_800, fadeInMs: 1_900, holdMs: 1_800, fadeOutMs: 2_400, offsetMs: 23_700, alpha: 0.72 },
];

const ZONE_ICON_BAR_TIMINGS: readonly ZoneIconLayerTiming[] = [
  { cycleMs: 9_600, fadeInMs: 95, holdMs: 1_850, fadeOutMs: 140, offsetMs: 850, alpha: 0.88 },
  { cycleMs: 13_400, fadeInMs: 120, holdMs: 2_350, fadeOutMs: 150, offsetMs: 5_400, alpha: 0.82 },
];

const ZONE_ICON_SHEEN_TIMINGS: readonly ZoneIconLayerTiming[] = ZONE_SELECTION_SHEEN_OVERLAY_PATHS.map((_, index) => ({
  cycleMs: 7_800 + ((index * 1_937) % 8_600),
  fadeInMs: 650 + ((index * 173) % 700),
  holdMs: 1_900 + ((index * 467) % 3_200),
  fadeOutMs: 700 + ((index * 211) % 900),
  offsetMs: (index * 2_711) % 19_000,
  alpha: 0.38 + ((index * 37) % 30) / 100,
}));

const ZONE_SELECTION_ICON_CROP_FRACTION = 0.10;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getZoneIconLayerAlpha(nowMs: number, timing: ZoneIconLayerTiming): number {
  const phaseMs = (nowMs + timing.offsetMs) % timing.cycleMs;
  if (phaseMs < timing.fadeInMs) return clamp01(phaseMs / timing.fadeInMs) * timing.alpha;
  if (phaseMs < timing.fadeInMs + timing.holdMs) return timing.alpha;
  const fadeOutStartMs = timing.fadeInMs + timing.holdMs;
  if (phaseMs < fadeOutStartMs + timing.fadeOutMs) {
    return (1 - clamp01((phaseMs - fadeOutStartMs) / timing.fadeOutMs)) * timing.alpha;
  }
  return 0;
}

function drawZoneIconLayer(
  ctx: CanvasRenderingContext2D,
  path: string,
  x: number,
  y: number,
  size: number,
  alpha: number,
): void {
  if (alpha <= 0.01) return;
  const image = getCachedImage(path);
  if (image) {
    ctx.globalAlpha = alpha;
    const cropX = image.width * ZONE_SELECTION_ICON_CROP_FRACTION;
    const cropY = image.height * ZONE_SELECTION_ICON_CROP_FRACTION;
    ctx.drawImage(image, cropX, cropY, image.width - cropX * 2, image.height - cropY * 2, x, y, size, size);
  } else {
    loadImage(path).catch(() => {});
  }
}

function drawZoneSelectionLabelIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  nowMs: number,
  baseAlpha: number,
  isHighlighted: boolean,
): void {
  if (isHighlighted) {
    const image = getCachedImage(ZONE_SELECTION_ICON_PATH);
    if (image) {
      ctx.save();
      ctx.globalAlpha = baseAlpha * 0.9;
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#ffd34d';
      const cropX = image.width * ZONE_SELECTION_ICON_CROP_FRACTION;
      const cropY = image.height * ZONE_SELECTION_ICON_CROP_FRACTION;
      ctx.drawImage(image, cropX, cropY, image.width - cropX * 2, image.height - cropY * 2, x, y, size, size);
      ctx.restore();
    }
  }
  drawZoneIconLayer(ctx, ZONE_SELECTION_ICON_PATH, x, y, size, baseAlpha);
  for (let i = 0; i < ZONE_SELECTION_GLOW_OVERLAY_PATHS.length; i++) {
    drawZoneIconLayer(ctx, ZONE_SELECTION_GLOW_OVERLAY_PATHS[i], x, y, size, baseAlpha * getZoneIconLayerAlpha(nowMs, ZONE_ICON_GLOW_TIMINGS[i]));
  }
  for (let i = 0; i < ZONE_SELECTION_BAR_OVERLAY_PATHS.length; i++) {
    drawZoneIconLayer(ctx, ZONE_SELECTION_BAR_OVERLAY_PATHS[i], x, y, size, baseAlpha * getZoneIconLayerAlpha(nowMs, ZONE_ICON_BAR_TIMINGS[i]));
  }
  for (let i = 0; i < ZONE_SELECTION_SHEEN_OVERLAY_PATHS.length; i++) {
    drawZoneIconLayer(ctx, ZONE_SELECTION_SHEEN_OVERLAY_PATHS[i], x, y, size, baseAlpha * getZoneIconLayerAlpha(nowMs, ZONE_ICON_SHEEN_TIMINGS[i]));
  }
}

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
  lifeColonies: import('./life-types').LifeColonyController[];
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
  comboEffects: ComboEffect[];
  wardEffects: WardEffect[];
  luckyMotes: LuckyMote[];
  luckyMotePopups: LuckyMotePopup[];
  deathParticles: DeathParticle[];
  weaponOrbitParticles: WeaponOrbitParticle[];
  getOrbitProjectiles(): OrbitProjectile[];
  getAfterimages(): import('./rpg-types').AfterimageSnapshot[];

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
  getBossTrackDurationMs(): number;
  getBossTrackTitle(): string | null;
  getDeathBannerText(): string | null;
  getScreenDarken(): number;
  getRestartFadeAlpha(): number;
  getIsLowGraphicsMode(): boolean;
  getSoftImpetusAsteroidShadowsEnabled(): boolean;
  getEnemyIndicatorStyle(): 'triangle' | 'outline' | 'off';
  getTopographicTerrainState(): TopographicTerrainState | null;
  getVerdureCaveWallState?(): import('./terrain/verdure-cave-walls').VerdureCaveWallState | null;
  /** Returns the display name for the currently active zone (e.g. "Euhedral"). */
  getActiveZoneDisplayName(): string;
  /** Returns the configured vertical position for the zone label. */
  getZonePosition(): 'top' | 'bottom';

  // ── Callbacks & shared context ────────────────────────────
  getEffectiveEquippedIds(): Set<string>;
  getTargetedEnemy(): ClosestTarget | null;
  getManualTargetedEnemy(): ClosestTarget | null;
  getTargetSelectedAtMs(): number;
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
  /** Returns floating overlay button rects in #rpg-area CSS coordinates. */
  getOverlayFadeRects?(): readonly { left: number; top: number; right: number; bottom: number }[];
  /** Applies the current fade alpha to registered floating overlay buttons. */
  setOverlayFadeAlpha?(alpha: number): void;
}

// ── Small mutable state that persists across frames ───────────────────────────

/**
 * Mutable state owned by the draw system.
 * Create once and pass to every drawRpgFrame call.
 */
export interface RpgDrawFrameState {
  /** Smoothly interpolated alpha for the top-left wave number; dims when entities overlap it. */
  waveOverlapAlpha: number;
  /** Smoothly interpolated alpha for floating menu shortcuts; dims when entities overlap them. */
  overlayFadeAlpha: number;
  codexNotificationStartedMs: number;
  /** True while the pointer is over or pressing the zone selection sprite. */
  zoneSelectionSpriteHovered: boolean;
}

/** Creates the initial draw frame state. */
export function createRpgDrawFrameState(): RpgDrawFrameState {
  return { waveOverlapAlpha: 1.0, overlayFadeAlpha: 1.0, codexNotificationStartedMs: 0, zoneSelectionSpriteHovered: false };
}

function pointOverlapsRect(
  x: number,
  y: number,
  rect: { left: number; top: number; right: number; bottom: number },
  padPx: number,
): boolean {
  return x >= rect.left - padPx && x <= rect.right + padPx && y >= rect.top - padPx && y <= rect.bottom + padPx;
}

function isWorldPointOverAnyOverlayRect(
  fs: RpgFieldSpace,
  xWorld: number,
  yWorld: number,
  rects: readonly { left: number; top: number; right: number; bottom: number }[],
  padPx = 10,
): boolean {
  const screen = fs.worldToScreen({ x: xWorld, y: yWorld });
  for (const rect of rects) {
    if (pointOverlapsRect(screen.x, screen.y, rect, padPx)) return true;
  }
  return false;
}

function updateOverlayFadeAlpha(ctx: RpgDrawCtx, state: RpgDrawFrameState, fs: RpgFieldSpace): void {
  const rects = ctx.getOverlayFadeRects?.() ?? [];
  if (rects.length === 0) {
    state.overlayFadeAlpha += (1 - state.overlayFadeAlpha) * 0.16;
    ctx.setOverlayFadeAlpha?.(state.overlayFadeAlpha);
    return;
  }

  let anyOverlap = isWorldPointOverAnyOverlayRect(fs, ctx.mote.x, ctx.mote.y, rects);
  const enemyArrays: ReadonlyArray<ReadonlyArray<{ x: number; y: number; hp?: number }>> = [
    ctx.enemies, ctx.sapphireEnemies, ctx.emeraldEnemies, ctx.amberEnemies, ctx.voidEnemies,
    ctx.quartzEnemies, ctx.rubyEnemies, ctx.sunstoneEnemies, ctx.citrineEnemies, ctx.ioliteEnemies,
    ctx.amethystEnemies, ctx.diamondEnemies, ctx.nullstoneEnemies, ctx.fracterylEnemies,
    ctx.eigensteinEnemies, ctx.eliteEnemies, ctx.polyominoEnemies, ctx.fissilePolyominoEnemies,
    ctx.refractorPolyominoEnemies, ctx.binaryRingEnemies, ctx.nadirCubePointEnemies,
    ctx.stardustEnemies, ctx.dustWispEnemies, ctx.ribbonWormEnemies, ctx.lanternMothEnemies,
    ctx.eyeStalkEnemies, ctx.jellyfishEnemies, ctx.eliteJellyfishEnemies, ctx.clothGhostEnemies,
    ctx.plantTurretEnemies, ctx.gearInsectEnemies, ctx.spiderCrawlerEnemies, ctx.moteSwarmEnemies,
    ctx.shadowHandEnemies, ctx.sandFishEnemies, ctx.quartzFishEnemies, ctx.rubyFishEnemies,
    ctx.sunstoneFishEnemies, ctx.emeraldFishEnemies, ctx.sapphireFishEnemies, ctx.amethystFishEnemies,
    ctx.diamondFishEnemies,
  ];
  for (let i = 0; !anyOverlap && i < enemyArrays.length; i++) {
    const enemies = enemyArrays[i];
    for (let j = 0; j < enemies.length; j++) {
      const enemy = enemies[j];
      if ((enemy.hp ?? 1) <= 0) continue;
      if (isWorldPointOverAnyOverlayRect(fs, enemy.x, enemy.y, rects)) {
        anyOverlap = true;
        break;
      }
    }
  }
  const bossEnemy = ctx.getBossEnemy();
  if (!anyOverlap && bossEnemy && bossEnemy.hp > 0) {
    anyOverlap = isWorldPointOverAnyOverlayRect(fs, bossEnemy.x, bossEnemy.y, rects, 18);
  }

  const targetAlpha = anyOverlap ? 0.30 : 1.0;
  state.overlayFadeAlpha += (targetAlpha - state.overlayFadeAlpha) * 0.16;
  ctx.setOverlayFadeAlpha?.(state.overlayFadeAlpha);
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

// ── Boss intro background ──────────────────────────────────────────────────────

const NEBULAE_SHARP_PATH = 'ASSETS/SPRITES/backgrounds/nebulaeBackground.png';
const NEBULAE_BLUR_PATH  = 'ASSETS/SPRITES/backgrounds/nebulaeBackground_blur.png';

function drawBossIntroBackground(
  canvas2d: CanvasRenderingContext2D,
  vwX: number, vwY: number, vwW: number, vwH: number,
): void {
  const intro = getBossIntroDrawState();
  if (!intro.isActive) return;

  // Cover-fit helper: draw an image centred and scaled to cover the target rect.
  function drawCover(img: HTMLImageElement): void {
    const scaleX = vwW / img.naturalWidth;
    const scaleY = vwH / img.naturalHeight;
    const scale  = Math.max(scaleX, scaleY);
    const dw = img.naturalWidth  * scale;
    const dh = img.naturalHeight * scale;
    const dx = vwX + (vwW - dw) / 2;
    const dy = vwY + (vwH - dh) / 2;
    canvas2d.drawImage(img, dx, dy, dw, dh);
  }

  const sharp = getCachedImage(NEBULAE_SHARP_PATH);
  const blur  = getCachedImage(NEBULAE_BLUR_PATH);

  // Preload both images (no-op after first call).
  if (!sharp) loadImage(NEBULAE_SHARP_PATH).catch(() => {});
  if (!blur)  loadImage(NEBULAE_BLUR_PATH).catch(() => {});

  canvas2d.save();

  // Draw sharp nebulae base.
  if (sharp) drawCover(sharp);

  // Crossfade blur on top.
  if (blur && intro.bgBlend > 0) {
    canvas2d.globalAlpha = intro.bgBlend;
    drawCover(blur);
    canvas2d.globalAlpha = 1;
  }

  // Fade to black overlay.
  if (intro.bgBlackAlpha > 0) {
    canvas2d.globalAlpha = intro.bgBlackAlpha;
    canvas2d.fillStyle = '#000000';
    canvas2d.fillRect(vwX, vwY, vwW, vwH);
    canvas2d.globalAlpha = 1;
  }

  canvas2d.restore();
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
  const visibleDrawBounds = fs.visibleBounds;

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
  const isBossZone      = ctx.getIsBossWaveActive();
  if (isBossZone) {
    drawBossIntroBackground(canvas2d, vwX, vwY, vwW, vwH);
  }
  const isCausticsZone  = !isBossZone && ctx.rpgSimState.activeZoneId === 'caustics';
  const isVerdureZone   = !isBossZone && ctx.rpgSimState.activeZoneId === 'verdure';
  const isImpetusZone   = !isBossZone && ctx.rpgSimState.activeZoneId === 'impetus';
  const isHorizonZone   = !isBossZone && ctx.rpgSimState.activeZoneId === 'horizon';
  const isEuhedralZone  = !isBossZone && ctx.rpgSimState.activeZoneId === 'euhedral';
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

  if (!isBossZone && shouldDrawPersistentTopographySunlight(ctx.rpgSimState.activeZoneId, terrainState)) {
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

  if (ctx.nadirCubePointEnemies.some(p => p.surfaceKind)) {
    drawTrueSurfaceElite(canvas2d, ctx.nadirCubePointEnemies);
  } else if (ctx.nadirCubePointEnemies.length > 0 || ctx.nadirCubeMines.length > 0 ||
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

  drawLaserEnemies(canvas2d, ctx.enemies, nowMs, visibleDrawBounds);
  drawSapphireEnemies(canvas2d, ctx.sapphireEnemies, visibleDrawBounds);
  drawSapphireMissiles(canvas2d, ctx.sapphireMissiles, visibleDrawBounds);
  drawEmeraldEnemies(canvas2d, ctx.emeraldEnemies, visibleDrawBounds);
  drawAmberEnemies(canvas2d, ctx.amberEnemies, visibleDrawBounds);
  drawAmberShards(canvas2d, ctx.amberShards, visibleDrawBounds);
  drawVoidEnemies(canvas2d, ctx.voidEnemies, visibleDrawBounds);
  drawQuartzEnemies(canvas2d, ctx.quartzEnemies, visibleDrawBounds);
  drawQuartzSpikes(canvas2d, ctx.quartzSpikes, visibleDrawBounds);
  drawRubyEnemies(canvas2d, ctx.rubyEnemies, visibleDrawBounds);
  drawRubyBolts(canvas2d, ctx.rubyBolts, visibleDrawBounds);
  drawSunstoneEnemies(canvas2d, ctx.sunstoneEnemies, visibleDrawBounds);
  drawCitrineEnemies(canvas2d, ctx.citrineEnemies, visibleDrawBounds);
  drawCitrineBolts(canvas2d, ctx.citrineBolts, visibleDrawBounds);
  drawIoliteEnemies(canvas2d, ctx.ioliteEnemies, visibleDrawBounds);
  drawAmethystEnemies(canvas2d, ctx.amethystEnemies, visibleDrawBounds);
  drawAmethystShards(canvas2d, ctx.amethystShards, visibleDrawBounds);
  drawDiamondEnemies(canvas2d, ctx.diamondEnemies, visibleDrawBounds);
  drawDiamondShards(canvas2d, ctx.diamondShards, visibleDrawBounds);
  drawNullstoneEnemies(canvas2d, ctx.nullstoneEnemies, visibleDrawBounds);
  drawVoidTendrils(canvas2d, ctx.voidTendrils, visibleDrawBounds);
  drawFracterylEnemies(canvas2d, ctx.fracterylEnemies, ctx.fracterylShards, visibleDrawBounds);
  drawEigensteinEnemies(canvas2d, ctx.eigensteinEnemies, visibleDrawBounds);
  drawEigensteinBeams(canvas2d, ctx.eigensteinBeams, vwW, vwH);
  drawEliteEnemies(canvas2d, ctx.eliteEnemies);
  drawPolyominoEnemies(canvas2d, ctx.polyominoEnemies, nowMs);
  drawFissilePolyominoEnemies(canvas2d, ctx.fissilePolyominoEnemies, nowMs);
  drawRefractorPolyominoEnemies(canvas2d, ctx.refractorPolyominoEnemies, nowMs);
  drawEmpowerParticles(canvas2d, fs.visibleBounds);
  drawStardustEnemies(canvas2d, ctx.stardustEnemies);
  drawHorizonPentagonGroups(canvas2d, ctx.horizonPentagonGroups, widthPx);
  drawAlivenGroups(canvas2d, ctx.alivenGroups);
  drawLifeColonies(canvas2d, ctx.lifeColonies);
  drawProceduralEnemies(canvas2d, ctx, nowMs);
  const bossBeatVisual = bossEnemy && ctx.getIsBossWaveActive()
    ? getBossBeatVisualState(bossEnemy.bossId, ctx.bossAttackState.elapsedFightMs)
    : null;
  drawBossArenaWalls(canvas2d, ctx.getIsBossWaveActive(), fs.activeBounds, fs.visibleBounds, glowTimeS, bossBeatVisual);
  drawBottomSafeZone(canvas2d, ctx.getIsBossWaveActive(), fs.activeBounds, glowTimeS, bossBeatVisual);
  drawDanmakuSafeZone(canvas2d, bossEnemy, ctx.getDanmakuSafeZone());
  drawBossProjectiles(canvas2d, ctx.bossProjectiles, visibleDrawBounds);
  if (ctx.getIsBossWaveActive() && bossEnemy) {
    drawBossStageDirector(
      canvas2d,
      ctx.bossStageDirectorState,
      bossEnemy,
      { w: widthPx, h: heightPx },
      glowTimeS,
      ctx.getIsLowGraphicsMode(),
      ctx.bossAttackState.elapsedFightMs,
    );
  }
  drawBossAttacks(
    canvas2d,
    ctx.bossAttackState,
    bossEnemy?.bossId ?? -1,
    ctx.bossAttackState.elapsedFightMs,
  );
  drawBossSpawnCircles(canvas2d);
  const _introState = getBossIntroDrawState();
  drawBossEnemy(canvas2d, _introState.hideBoss ? null : bossEnemy, glowTimeS, bossBeatVisual);
  drawTeleportParticles(canvas2d, ctx.teleportParticles, visibleDrawBounds);
  drawShotLines(canvas2d, ctx.shotLines);
  drawVortexes(canvas2d, ctx.weaponSystems.activeVortexes);
  drawSandProjectiles(canvas2d, ctx.weaponSystems.sandProjectiles, visibleDrawBounds);
  drawPoisonBolts(canvas2d, ctx.weaponSystems.poisonBolts, visibleDrawBounds);
  drawEmeraldPlayerMissiles(canvas2d, ctx.weaponSystems.emeraldPlayerMissiles, visibleDrawBounds);
  drawEmeraldSubMissiles(canvas2d, ctx.weaponSystems.emeraldSubMissiles, visibleDrawBounds);
  drawEmeraldSwirlParticles(canvas2d, ctx.weaponSystems.emeraldSwirlParticles, visibleDrawBounds);
  drawSunstoneMines(canvas2d, ctx.weaponSystems.sunstoneMines, visibleDrawBounds);
  drawFracterylSpears(canvas2d, ctx.weaponSystems.fracterylSpears);
  drawFracterylBlooms(canvas2d, ctx.weaponSystems.fracterylBlooms);
  drawLaserBeamEffect(canvas2d, ctx.weaponSystems.laserBeamEffect);
  drawEnemyIndicators(canvas2d, ctx.getEnemyIndicatorStyle(),
    ctx.enemies, ctx.sapphireEnemies, ctx.emeraldEnemies, ctx.amberEnemies, ctx.voidEnemies,
    ctx.quartzEnemies, ctx.rubyEnemies, ctx.sunstoneEnemies, ctx.citrineEnemies, ctx.ioliteEnemies,
    ctx.amethystEnemies, ctx.diamondEnemies, ctx.nullstoneEnemies, ctx.fracterylEnemies, ctx.eigensteinEnemies,
    bossEnemy, ctx.alivenGroups);

  drawAfterimages(canvas2d, ctx.getAfterimages());
  drawPlayerMote(canvas2d, ctx.mote, ctx.getGlowMovementIntensity(), rpgPhase, ctx.getDeathAlpha(), glowTimeS, ctx.getPlayerIFramesMs());
  drawPlayerStatusVFX(canvas2d, ctx.mote.x, ctx.mote.y, getActivePlayerStatuses(ctx.rpgSimState), nowMs);
  drawWardEffects(canvas2d, ctx.wardEffects);

  renderEnemyStatusLabels(canvas2d, ctx, nowMs);
  drawSpawnFlashes(canvas2d, ctx.getIsLowGraphicsMode());
  drawDyingEnemies(canvas2d, ctx.getIsLowGraphicsMode());
  drawHitEffects(canvas2d, ctx.hitEffects);
  drawComboEffects(canvas2d, ctx.comboEffects);
  drawLuckyMotes(canvas2d, ctx.luckyMotes, ctx.getIsLowGraphicsMode());
  drawDamageNumbers(canvas2d, ctx.damageNumbers);
  renderEnemySpeechBubbles(canvas2d, fs.visibleBounds);
  renderBossDialogue(canvas2d, fs.visibleBounds, bossEnemy);
  drawBossTrackProgressBar(canvas2d, ctx, fs.activeBounds, bossEnemy, bossBeatVisual);
  drawLuckyMotePopups(canvas2d, ctx.luckyMotePopups, ctx.getIsLowGraphicsMode());
  if (ctx.deathParticles.length > 0) drawDeathParticles(canvas2d, ctx.deathParticles);

  // Draw weapon orbit particles, orbit projectile, and special weapon visuals above the player.
  if (rpgPhase === 'alive') {
    for (const p of ctx.weaponOrbitParticles) drawWeaponOrbitParticle(canvas2d, p);
    for (const op of ctx.getOrbitProjectiles()) drawOrbitProjectile(canvas2d, op);
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
      drawTargetNamePopup(canvas2d, ctx.getManualTargetedEnemy(), ctx.getTargetSelectedAtMs(), performance.now(), fs.visibleBounds);
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
  updateOverlayFadeAlpha(ctx, state, fs);
  if (currentWave > 0) {
    const iconSize = 120;
    const textFontSize = Math.round(14 * 0.7); // 30% smaller than base
    const textLineH = textFontSize + 5;
    const textBlockH = textLineH * 2;
    const totalH = iconSize + 6 + textBlockH + 8;

    const overlayLeft = fs.visibleBounds.left + 8;
    const overlayTop = ctx.getZonePosition() === 'bottom'
      ? fs.visibleBounds.bottom - totalH - 4
      : fs.visibleBounds.top + 8;
    const overlapRight = overlayLeft + 160;
    const overlapBottom = overlayTop + totalH;

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
    const textY = overlayTop + iconSize + 6;

    canvas2d.save();
    canvas2d.globalAlpha = state.waveOverlapAlpha;
    canvas2d.fillStyle = '#fff172';
    canvas2d.textAlign = 'left';
    canvas2d.textBaseline = 'top';

    // Zone name line
    canvas2d.font = `bold ${textFontSize}px monospace`;
    canvas2d.fillText(zoneName, overlayLeft, textY);
    const zoneNameW = canvas2d.measureText(zoneName).width;

    // Multiplier line
    const multLabel = `x${currentWave}`;
    canvas2d.fillText(multLabel, overlayLeft, textY + textLineH);
    const multW = canvas2d.measureText(multLabel).width;

    drawZoneSelectionLabelIcon(canvas2d, overlayLeft, overlayTop, iconSize, nowMs, state.waveOverlapAlpha, state.zoneSelectionSpriteHovered);

    // Underline under zone name
    canvas2d.globalAlpha = state.waveOverlapAlpha * 0.45;
    canvas2d.strokeStyle = '#fff172';
    canvas2d.lineWidth = 0.5;
    canvas2d.beginPath();
    canvas2d.moveTo(overlayLeft, textY + textFontSize + 1);
    canvas2d.lineTo(overlayLeft + zoneNameW, textY + textFontSize + 1);
    canvas2d.stroke();

    // Upward-pointing golden triangle — tap affordance below the full block
    const triCx = overlayLeft + Math.max(zoneNameW, multW) / 2;
    const triY = overlayTop + totalH;
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
        canvas2d.fillText('New Codex Entry!', overlayLeft + iconSize + 4, overlayTop + Math.min(24, elapsedMs * 0.025));
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
  drawDeathBanner(canvas2d, ctx, fs.visibleBounds);

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
  const activeAspect = fs.activeBounds.height > 0 ? fs.activeBounds.width / fs.activeBounds.height : 0;
  const safeAspect = RPG_LOGICAL_WIDTH / RPG_LOGICAL_HEIGHT;
  const activeAspectDrift = Math.abs(activeAspect - safeAspect) > 0.01;

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
      { text: `activeBounds:  L${ab.left.toFixed(1)} T${ab.top.toFixed(1)} R${ab.right.toFixed(1)} B${ab.bottom.toFixed(1)}`, warn: activeAspectDrift },
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
  if (activeAspectDrift) {
    lines.push({ text: `⚠ activeBounds aspect drift`, warn: true });
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

function drawBossTrackProgressBar(
  canvas2d: CanvasRenderingContext2D,
  ctx: RpgDrawCtx,
  activeBounds: { left: number; top: number; right: number; width: number },
  bossEnemy: BossEnemy | null,
  beatVisual: BossBeatVisualState | null,
): void {
  if (!bossEnemy || !ctx.getIsBossWaveActive()) return;
  const trackDurationMs = ctx.getBossTrackDurationMs();
  if (trackDurationMs <= 0) return;
  const elapsedMs = Math.min(ctx.bossAttackState.elapsedFightMs, trackDurationMs);
  const progress = clamp01(elapsedMs / trackDurationMs);
  const beatPulse = beatVisual?.beatPulse ?? 0;
  const barPulse = beatVisual?.barPulse ?? 0;
  const margin = 14;
  const iconSize = 24;
  const iconGap = 7;
  const reservedIconW = iconSize + iconGap;
  const barW = Math.max(80, activeBounds.width - margin * 2 - reservedIconW);
  const barH = 5 + beatPulse * 1.5 + barPulse * 1.5;
  const x = activeBounds.left + margin;
  const y = activeBounds.top + 6;
  const iconX = x + barW + iconGap;
  const iconY = y + barH * 0.5 - iconSize * 0.5;
  const hue = ((beatVisual?.beatIndex ?? 0) * 18 + beatPulse * 35) % 360;

  canvas2d.save();
  canvas2d.globalAlpha = 0.80;
  canvas2d.fillStyle = 'rgba(3, 4, 12, 0.72)';
  canvas2d.fillRect(x - 1, y - 1, barW + 2, barH + 2);
  canvas2d.globalAlpha = 0.35 + beatPulse * 0.25;
  canvas2d.strokeStyle = `hsl(${hue}, 100%, 78%)`;
  canvas2d.lineWidth = 1;
  if (!ctx.getIsLowGraphicsMode()) {
    canvas2d.shadowBlur = 7 + beatPulse * 10;
    canvas2d.shadowColor = `hsl(${hue}, 100%, 74%)`;
  }
  canvas2d.strokeRect(x - 1, y - 1, barW + 2, barH + 2);
  canvas2d.globalAlpha = 0.88;
  const gradient = canvas2d.createLinearGradient(x, y, x + barW, y);
  gradient.addColorStop(0, `hsl(${hue}, 100%, 68%)`);
  gradient.addColorStop(0.55, `hsl(${(hue + 95) % 360}, 100%, 70%)`);
  gradient.addColorStop(1, `hsl(${(hue + 190) % 360}, 100%, 72%)`);
  canvas2d.fillStyle = gradient;
  canvas2d.fillRect(x, y, barW * progress, barH);
  canvas2d.shadowBlur = 0;

  const icon = getCachedImage(ENEMY_CODEX_TAB_GLOW_ICON_PATH);
  if (icon) {
    canvas2d.globalAlpha = 0.78 + beatPulse * 0.18;
    if (!ctx.getIsLowGraphicsMode()) {
      canvas2d.shadowBlur = 10 + beatPulse * 8;
      canvas2d.shadowColor = '#ffe66a';
    }
    canvas2d.drawImage(icon, iconX, iconY, iconSize, iconSize);
    canvas2d.shadowBlur = 0;
  } else {
    loadImage(ENEMY_CODEX_TAB_GLOW_ICON_PATH).catch(() => {});
  }

  const title = ctx.getBossTrackTitle();
  if (title) {
    canvas2d.globalAlpha = 0.58;
    canvas2d.fillStyle = '#ffffff';
    canvas2d.font = '6px monospace';
    canvas2d.textAlign = 'right';
    canvas2d.textBaseline = 'top';
    canvas2d.fillText(title, x + barW, y + barH + 3);
  }
  canvas2d.restore();
}

function drawDeathBanner(canvas2d: CanvasRenderingContext2D, ctx: RpgDrawCtx, visibleBounds: { left: number; top: number; width: number; height: number }): void {
  const text = ctx.getDeathBannerText();
  if (!text) return;
  const cx = visibleBounds.left + visibleBounds.width * 0.5;
  const cy = visibleBounds.top + visibleBounds.height * 0.5;
  canvas2d.save();
  canvas2d.textAlign = 'center';
  canvas2d.textBaseline = 'middle';
  canvas2d.font = 'bold 28px serif';
  canvas2d.lineWidth = 4;
  canvas2d.strokeStyle = 'rgba(20, 0, 0, 0.95)';
  canvas2d.fillStyle = '#ff2020';
  if (!ctx.getIsLowGraphicsMode()) {
    canvas2d.shadowBlur = 18;
    canvas2d.shadowColor = 'rgba(255, 0, 0, 0.75)';
  }
  canvas2d.strokeText(text, cx, cy);
  canvas2d.fillText(text, cx, cy);
  canvas2d.restore();
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
