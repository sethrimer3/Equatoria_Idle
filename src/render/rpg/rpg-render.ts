/**
 * rpg-render.ts — RPG tab rendering system.
 *
 * Manages an independent canvas that dynamically fills its container with:
 *   - A player-controllable sand mote (3x3 pixels, always-glowing)
 *   - Touch joystick (mobile) and WASD / Arrow key (desktop) controls
 *   - Auto-move mode: player moves toward nearest enemy when enabled
 *   - A smoothly interpolated comet-glow effect behind the player mote
 *   - Laser enemies (2x2 red motes) with patrol, attack-detect, dash, and cooldown phases
 *   - A bezier lineDash attack-trail effect during the enemy dash
 *   - A DOM stats panel (HP / ATK / DEF / WAVE / BOOST / XP / DPS) above the navigation bar
 *   - A data-driven wave system (see src/data/rpg/wave-definitions.ts)
 *   - A smooth death to restart loop with visual transition effects
 *   - Player auto-attack: shoots the closest enemy each cooldown tick.
 *     Weapon effects: single (closest), multi (N closest), aoe (all in radius),
 *     piercing (closest, partial DEF bypass).
 *   - Equipped-weapon visual particle: a mote of the weapon's tier color
 *     perpetually orbits the player to communicate the equipped weapon.
 *   - Orbiting projectile upgrade: a comet projectile orbits the player,
 *     damaging enemies on contact (requires 'orbit_projectile' upgrade).
 *
 * Internal resolution is computed dynamically from the container at each
 * resize() call so the canvas fills the full gameplay area without
 * pillarboxing/letterboxing, matching the width of the stats bar.
 */


import type { RpgSimState } from '../../sim/rpg/rpg-state';
import {
  getEffectiveXpAtkBonus, getEffectiveXpDefBonus,
  getEffectiveXpHpBonus,
  getPlayerLevelAtkBonus, getPlayerLevelDefBonus, getPlayerLevelHpBonus,
} from '../../sim/rpg/rpg-state';
import { resolveWeaponDefinition } from '../../data/rpg/crafted-weapon-helpers';
import type { NumberFormat } from '../../util/format';
import { createRpgFluid } from './rpg-fluid';
import { createDamageFns } from './rpg-damage';
import type { NadirCubePointEnemy, NadirCubeMine, NadirCubeTrailSegment, NadirCubeTurretBolt, NadirCubeLinkLaser } from './nadir-cube-point-types';
import { createRpgStatsPanel, type RpgStatsPanelHandle } from './rpg-stats-panel';
import {
  RPG_TRAIL_CAPACITY, RPG_MOTE_SIZE,
  RPG_LOGICAL_WIDTH, RPG_LOGICAL_HEIGHT,
  PLAYER_HP_INIT, PLAYER_ATK_INIT, PLAYER_DEF_INIT, PLAYER_REGEN_INIT,
  INTER_WAVE_DELAY_MS,
} from './rpg-constants';
import {
  setBossAttacksLowGraphics, type BossAttackUpdateCtx,
} from './rpg-boss-attack-update';
import { createBossAttackState, type BossAttackState } from './rpg-boss-attack-types';
import type {
  RpgMote, RpgJoystick, RpgKeyState, RpgPlayerStats,
  LaserEnemy,
  RpgPhase, DeathParticle, SpawnEntry, HitEffect, ShotLine, DamageNumber,
  WeaponOrbitParticle, OrbitProjectile,
  SapphireEnemy, SapphireMissile,
  ClosestTarget, SwordComboPhase,
} from './rpg-types';
import { createRpgWeaponSystems, type RpgWeaponCtx, type RpgWeaponHandle } from './rpg-weapon-systems';
import { createRpgTargeting, type RpgTargetingHandle } from './rpg-targeting';
import { performWeaponAttack as _performWeaponAttack, type RpgPlayerAttackCtx } from './rpg-player-attack';
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
  DanmakuSafeZone,
  TeleportParticle,
  LuckyMote, LuckyMotePopup,
  EliteEnemy,
  StardustEnemy,
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
import { createBossWaveManager, type BossWaveHandle } from './rpg-boss-wave';
import { createWaveManager, type WaveManagerHandle } from './rpg-wave-manager';
import {
  createBossStageDirectorState,
  resetBossStageDirector,
  advanceBossStage,
  deactivateBossStageDirector,
  type BossStageDirectorState,
  type BossStageDirectorCtx,
} from './rpg-boss-stage-director';
import { type AlivenUpdateCtx } from './rpg-aliven-updates';
import { damageAlivenParticle } from './rpg-damage';
import type { AlivenParticleGroup } from './rpg-aliven-types';
import { makeAlivenGroup } from './rpg-aliven-factories';
import { ALIVEN_VARIANTS, MAX_ACTIVE_ALIVEN_GROUPS, type AlivenVariantId } from './rpg-aliven-constants';
import { type RpgEnemyCtx } from './rpg-enemy-updates';
import { type EliteEnemyCtx } from './rpg-elite-enemy-updates';
import { type BossUpdateCtx } from './rpg-boss-update';
import { type OrbitProjectileCtx } from './rpg-orbit-projectile';
import {
  type PlayerMovementCtx,
  type PlayerMovementState,
} from './rpg-player-movement';
import { createRpgInput } from './rpg-input';
import { createPlayerDamageFns, type PlayerDamageCtx } from './rpg-player-damage';
import {
  initEnemyBarkSystem,
  notifyEnemyHit,
  notifyPlayerDamaged,
} from './rpg-enemy-barks';
import {
  setAllDrawLowGraphics,
  type RpgDrawCtx, createRpgDrawFrameState,
} from './rpg-render-draw';
import {
  computeRpgFieldSpace, computeRpgSafeCoreScale, type RpgFieldSpace,
} from './rpgFieldSpace';
import {
  triggerDeath as _triggerDeath, doRestart as _doRestart,
  type RpgDeathRestartCtx,
} from './rpg-death-restart';
import {
  buildWeaponOrbitParticle as _buildWeaponOrbitParticle,
  buildOrbitProjectile as _buildOrbitProjectile,
  type WeaponOrbitCtx,
} from './rpg-weapon-orbit';
import { type WeaponTickCtx } from './rpg-weapon-tick';
import {
  runRpgUpdate, type RpgEnemyUpdateArrays, type RpgUpdateCtx,
} from './rpg-render-update';
import type { RpgRender, RpgRenderOptions } from './rpg-render-types';
import {
  clampEnemyToBounds as clampEnemyToBoundsHelper,
  createCachedLuckPercentGetter,
  findEquippedWeaponIdByEffect as findEquippedWeaponIdByEffectHelper,
} from './rpg-render-helpers';
import {
  beginWaveTerrain,
  beginTopographicTerrainShrink,
  isTopographicTerrainReadyForEnemySpawns,
  isTopographicTerrainGone,
  setTopographicTerrainDevMode,
  type TopographicTerrainState,
} from './terrain/topographic-terrain';
import { setTopographyLightingDevMode, setTopographyShadowMode } from './terrain/topographic-lighting';
import {
  buildRpgNavigationGrid,
  applyCircleSoftObstacles,
  type RpgNavGrid,
} from './terrain/rpg-pathfinding';
import { createRpgZoneSelectPanel } from './rpg-zone-select';
import { createZenithBinaryHorizon, type ZenithBinaryHorizon } from '../background/zenith-binary-horizon';
import { createTrueBinaryHorizon, type TrueBinaryHorizon } from '../background/true-binary-horizon';
import { createNadirSubstrateEffect, type NadirSubstrateEffect } from '../background/nadir-substrate-effect';
import {
  createNadirCubicGridBackground,
  type NadirCubicGridBackground,
} from '../background/nadir-cubic-grid-background';
import type { NadirCubeProjectionState } from '../background/nadir-cube-projection';
import {
  type BinaryRingEnemy,
  type BinaryRingMissile,
  type BinaryLaserSweep,
  drawBinaryRingEncounter,
} from './rpg-binary-ring-encounter';
import {
  createZenithBinaryRingBackground,
  type ZenithBinaryRingBackground,
} from '../background/zenith-binary-ring-background';
import { getRpgZoneDisplayName, type RpgZoneId } from '../../data/rpg/rpg-zone-definitions';
import {
  clearVerdurePlants,
  tickVerdurePlantSpawn,
  updateVerdurePlants as _updateVerdurePlants,
  damageVerdurePlant as _damageVerdurePlant,
} from './terrain/rpg-verdure-growth';
import { prewarmCausticsTextures } from './terrain/caustics-texture';
import { generateVerdureCaveWalls, applyVerdureWallsToNavGrid, pushPointOutsideVerdureWall } from './terrain/verdure-cave-walls';
import { getImpetusAsteroidObstacles } from './terrain/impetus-overlay';
import { showWeapInventoryPicker } from '../../ui/panels/weap-inventory-picker';

export type { RpgRender, RpgRenderOptions } from './rpg-render-types';

export function createRpgRender(container: HTMLElement, rpgSimState: RpgSimState, options: RpgRenderOptions = {}): RpgRender {

  // ── RPG area wrapper (aspect-ratio-preserving letterbox / pillarbox) ───────
  // `#rpg-area` is sized in CSS pixels by resizeRpgArea() to be the largest
  // rectangle that fits `container` while preserving the RPG_LOGICAL aspect ratio.
  // The canvas lives inside this wrapper and fills it 100%×100%.
  const rpgArea = document.createElement('div');
  rpgArea.id = 'rpg-area';
  container.appendChild(rpgArea);

  const canvas = document.createElement('canvas');
  canvas.id = 'rpg-canvas';
  // Backing store is initialised to logical size and updated by doResize.
  canvas.width  = RPG_LOGICAL_WIDTH;
  canvas.height = RPG_LOGICAL_HEIGHT;
  // No pixelated upscaling — the backing now matches CSS size × DPR.
  canvas.style.touchAction = 'none';
  rpgArea.appendChild(canvas);

  // ── Zone select overlay (DOM, inside rpgArea) ──────────────────
  const zoneSelectPanel = createRpgZoneSelectPanel(rpgSimState, (newZoneId: RpgZoneId) => {
    // Save the current zone's wave before switching so we can resume it later.
    rpgSimState.currentWaveByZone[rpgSimState.activeZoneId] = currentWave;
    if (newZoneId === rpgSimState.activeZoneId) return;
    // Pre-generate caustics tiles before the first Caustics frame to avoid stutter.
    if (newZoneId === 'caustics') prewarmCausticsTextures();
    resetActiveEncounterForZoneSwitch();
    rpgSimState.activeZoneId = newZoneId;
    // Restore the new zone's previously-saved wave (0 if never visited).
    currentWave = rpgSimState.currentWaveByZone[newZoneId] ?? 0;
    rpgSimState.currentWaveByZone[newZoneId] = currentWave;
    isInterWave = true;
    interWaveTimerMs = INTER_WAVE_DELAY_MS * 0.4;
    rpgPhase = 'alive';
  }, (newSubzoneId) => {
    // Subzone selection — only meaningful for Horizon; safe to set for other zones too.
    rpgSimState.activeSubzoneId = newSubzoneId;
    // Reset background instances so they rebuild with the correct effect.
    zenithBinaryHorizon = null;
    trueBinaryHorizon = null;
    zenithBinaryRingBg = null;
    nadirSubstrate = null;
    nadirCubicGrid = null;
    isNadirEliteWave = false;
  });
  rpgArea.appendChild(zoneSelectPanel.element);

  const ctx = canvas.getContext('2d')!;
  // World coordinate bounds — ALWAYS RPG_LOGICAL_WIDTH × RPG_LOGICAL_HEIGHT.
  // These are intentionally `const` (or equivalent): they MUST NOT be mutated
  // by resize events, browser zoom changes, or devicePixelRatio changes.
  const widthPx  = RPG_LOGICAL_WIDTH;
  const heightPx = RPG_LOGICAL_HEIGHT;
  let isLowGraphicsMode = false;
  let enemyIndicatorStyle: 'triangle' | 'outline' | 'off' = 'triangle';
  let currentNumberFormat: NumberFormat = 'letters';
  let isInvincibilityMode = false;
  /** Tracks the last-computed CSS display size of #rpg-area (for dev overlay). */
  let rpgCssW = widthPx;
  let rpgCssH = heightPx;
  /** Full canvas CSS dimensions after the last doResize (may exceed safe-core). */
  let rpgFullW = widthPx;
  let rpgFullH = heightPx;
  /**
   * Safe-core transform: scale + offsets to centre the 360×360 safe core within
   * the full canvas.  The world (360×640) may extend beyond the canvas edges in
   * the shorter dimension, revealing extra world space instead of letterboxing.
   */
  let rpgSafeScale  = 1;
  let rpgSafeOffsetX = 0;
  let rpgSafeOffsetY = 0;
  /** Expanded world-space dimensions visible through the full canvas. */
  let rpgWorldViewW = RPG_LOGICAL_WIDTH;
  let rpgWorldViewH = RPG_LOGICAL_HEIGHT;
  /** Set to true when dev mode is active (controls diagnostic overlay). */
  let _isDevMode = false;
  const developerVisuals = {
    viewport: false,
    pathfinding: false,
    verdureWalls: false,
    nadirAnchors: false,
    bossStage: false,
    topographyLighting: false,
    softImpetusAsteroidShadows: false,
    rpgPixelatedRender: false,
  };
  /** Authoritative field-space snapshot — recomputed by doResize() on every resize. */
  let rpgFieldSpace: RpgFieldSpace = computeRpgFieldSpace({
    canvasCssW:     RPG_LOGICAL_WIDTH,
    canvasCssH:     RPG_LOGICAL_HEIGHT,
    backingW:       RPG_LOGICAL_WIDTH,
    backingH:       RPG_LOGICAL_HEIGHT,
    dpr:            1,
    stableScale:    1,
    cameraCenter:   { x: RPG_LOGICAL_WIDTH / 2, y: RPG_LOGICAL_HEIGHT / 2 },
    safeCoreWorldW: RPG_LOGICAL_WIDTH,
    safeCoreWorldH: RPG_LOGICAL_HEIGHT,
  });

  // ── Shared dimensions box — always the fixed logical size ──────
  // Passed to rpg-enemy-updates functions via RpgEnemyCtx so they always see
  // world bounds without requiring a closure rebuild.
  // dim.w and dim.h are NEVER updated: they represent the fixed world size (safe core).
  const dim = { w: widthPx, h: heightPx };

  // ── Live viewport world-space bounds — updated on every resize ──
  // Represents the full *visible* gameplay area in world coordinates.
  // On a 360×640 reference device: left=0, top=0, right=360, bottom=640.
  // On a 600×640 wider canvas (scale=1.0): left=-120, top=0, right=480, bottom=640.
  // On a 760×400 landscape canvas (scale=1.0): left=-200, top=120, right=560, bottom=520.
  // The safe core (dim.w × dim.h = 360×640) is always centred within this rect.
  const viewport = {
    left:   0,
    top:    0,
    right:  RPG_LOGICAL_WIDTH,
    bottom: RPG_LOGICAL_HEIGHT,
  };

  // ── Euler fluid background ─────────────────────────────────────
  const fluid = createRpgFluid();
  let zenithBinaryHorizon: ZenithBinaryHorizon | null = null;
  let trueBinaryHorizon: TrueBinaryHorizon | null = null;
  const binaryRingEnemies: BinaryRingEnemy[] = [];
  const binaryRingMissiles: BinaryRingMissile[] = [];
  const nadirCubePointEnemies: NadirCubePointEnemy[] = [];
  const nadirCubeMines: NadirCubeMine[] = [];
  const nadirCubeTrailSegments: NadirCubeTrailSegment[] = [];
  const nadirCubeTurretBolts: NadirCubeTurretBolt[] = [];
  const nadirCubeLinkLasers: NadirCubeLinkLaser[] = [];
  let binaryLaserSweep: BinaryLaserSweep | null = null;
  let zenithBinaryRingBg: ZenithBinaryRingBackground | null = null;
  let nadirSubstrate: NadirSubstrateEffect | null = null;
  let nadirCubicGrid: NadirCubicGridBackground | null = null;
  /** True while the current wave is an elite wave in the Nadir subzone (every 10th wave). */
  let isNadirEliteWave = false;

  function drawZoneBgOverlay(c2d: CanvasRenderingContext2D, w: number, h: number, nowMs: number): void {
    if (rpgSimState.activeZoneId !== 'horizon') return;
    const isNadir = rpgSimState.activeSubzoneId === 'nadir';
    if (isNadir) {
      if (!nadirSubstrate) nadirSubstrate = createNadirSubstrateEffect({ quality: isLowGraphicsMode ? 'low' : 'medium' });
      nadirSubstrate.update(nowMs, w, h);
      nadirSubstrate.draw(c2d);
      nadirCubicGrid?.draw(c2d);
    } else {
      const isTrue = rpgSimState.activeSubzoneId === 'true';
      if (binaryRingEnemies.length > 0) {
        if (!zenithBinaryRingBg) zenithBinaryRingBg = createZenithBinaryRingBackground({ quality: isLowGraphicsMode ? 'low' : 'medium' });
        const ringAge = binaryRingEnemies[0]?.age ?? 'light';
        zenithBinaryRingBg.update(nowMs, w, h, ringAge);
        zenithBinaryRingBg.draw(c2d);
        drawBinaryRingEncounter(c2d, binaryRingEnemies[0]!, binaryRingMissiles, binaryLaserSweep, nowMs, isLowGraphicsMode);
      } else if (isTrue) {
        // True subzone: uses the preserved legacy Binary Horizon effect.
        if (!trueBinaryHorizon) trueBinaryHorizon = createTrueBinaryHorizon({ quality: isLowGraphicsMode ? 'low' : 'medium' });
        trueBinaryHorizon.update(nowMs, w, h);
        trueBinaryHorizon.draw(c2d);
      } else {
        // Zenith subzone: path-accumulation Binary Horizon with randomised divider line.
        if (!zenithBinaryHorizon) zenithBinaryHorizon = createZenithBinaryHorizon({ quality: isLowGraphicsMode ? 'low' : 'medium' });
        zenithBinaryHorizon.update(nowMs, w, h, currentWave);
        zenithBinaryHorizon.draw(c2d);
      }
    }
  }

  function updateAndGetNadirCubeProjectionState(nowMs: number): NadirCubeProjectionState | null {
    if (rpgSimState.activeZoneId !== 'horizon' || rpgSimState.activeSubzoneId !== 'nadir') return null;
    if (!nadirCubicGrid) nadirCubicGrid = createNadirCubicGridBackground();
    const isEliteWaveActive = isNadirEliteWave && !isInterWave;
    nadirCubicGrid.update(nowMs, rpgWorldViewW, rpgWorldViewH, isEliteWaveActive, isLowGraphicsMode);
    return nadirCubicGrid.getProjectionState();
  }

  /**
   * Expand #rpg-area to fill the full container and update the canvas backing
   * store to containerW×DPR by containerH×DPR physical pixels.
   *
   * World coordinates (widthPx × heightPx = 360 × 640) are NEVER changed —
   * all game-entity positions stay in the fixed logical space.  Instead, a
   * safe-core transform is stored (rpgSafeScale / rpgSafeOffsetX/Y) that
   * drawRpgFrame applies each frame to centre the 360×640 world within the
   * full canvas.  Extra space beyond the world reveals additional world area
   * (extended background) rather than zooming in.
   *
   * Scale invariant:
   *   - Scale = min(containerW / RPG_LOGICAL_WIDTH, containerH / RPG_LOGICAL_HEIGHT, 1).
   *   - The full 360×640 safe core is always fully visible.
   *   - Growing the canvas beyond the safe core reveals more world without zooming in.
   *   - Shortening the host below 640 px reduces scale so the safe core remains visible.
   *   - On a reference 360×640 phone:  scale = 1.0 (1 px per world unit).
   *   - On a wider canvas (e.g. 600×640): scale = 1.0, worldViewW = 600
   *     (more world visible, same zoom).
   *   - On a 480×415 host: scale ≈ 415/640 ≈ 0.648 (full safe core still fits).
   */
  function doResize(cont: HTMLElement): void {
    const containerW = cont.clientWidth  || widthPx;
    const containerH = cont.clientHeight || heightPx;

    // Expand #rpg-area to fill the entire container.
    rpgArea.style.width  = `${containerW}px`;
    rpgArea.style.height = `${containerH}px`;

    // CSS display size (== container size now).
    rpgCssW = containerW;
    rpgCssH = containerH;

    // Full canvas dimensions for diagnostics and clear pass.
    rpgFullW = containerW;
    rpgFullH = containerH;

    // Stable RPG scale: fit the full 360×640 safe core inside the container,
    // capped at 1 so the world never zooms in beyond 1 px-per-world-unit.
    // Growing the canvas beyond the safe core reveals more world, not more zoom.
    rpgSafeScale   = computeRpgSafeCoreScale(containerW, containerH, RPG_LOGICAL_WIDTH, RPG_LOGICAL_HEIGHT);
    rpgSafeOffsetX = (containerW - RPG_LOGICAL_WIDTH  * rpgSafeScale) / 2;
    rpgSafeOffsetY = (containerH - RPG_LOGICAL_HEIGHT * rpgSafeScale) / 2;

    // Visible world-space dimensions: canvas CSS size divided by the stable scale.
    // When the canvas grows, worldViewW/H grow; the scale stays the same.
    rpgWorldViewW = containerW / rpgSafeScale;
    rpgWorldViewH = containerH / rpgSafeScale;

    // Update the live viewport bounds in world coordinates.
    // These define the full *visible* gameplay area.  The safe core (360×640) is
    // always centred inside them.
    viewport.left   = -rpgSafeOffsetX / rpgSafeScale;
    viewport.top    = -rpgSafeOffsetY / rpgSafeScale;
    viewport.right  = (containerW - rpgSafeOffsetX) / rpgSafeScale;
    viewport.bottom = (containerH - rpgSafeOffsetY) / rpgSafeScale;

    // Update the physical backing store (DPR-scaled full-container size).
    const dpr = window.devicePixelRatio || 1;
    const backingW = Math.round(containerW * dpr);
    const backingH = Math.round(containerH * dpr);
    if (canvas.width  !== backingW) canvas.width  = backingW;
    if (canvas.height !== backingH) canvas.height = backingH;

    // Recompute the authoritative field-space snapshot so all subsystems that
    // consume rpgFieldSpace (draw, spawn, effects) share the same bounds.
    rpgFieldSpace = computeRpgFieldSpace({
      canvasCssW:     containerW,
      canvasCssH:     containerH,
      backingW,
      backingH,
      dpr,
      stableScale:    rpgSafeScale,
      cameraCenter:   { x: RPG_LOGICAL_WIDTH / 2, y: RPG_LOGICAL_HEIGHT / 2 },
      safeCoreWorldW: RPG_LOGICAL_WIDTH,
      safeCoreWorldH: RPG_LOGICAL_HEIGHT,
    });

    // Fluid maps world positions to a fixed grid; its cell size is derived from
    // the logical (not CSS) dimensions.  Call resize() once to initialise if the
    // internal state has not yet synced to the logical world size.
    fluid.resize(widthPx, heightPx);
  }
  doResize(container);

  const mote: RpgMote = {
    x: widthPx / 2, y: heightPx / 2, vx: 0, vy: 0,
    trailX: new Float64Array(RPG_TRAIL_CAPACITY),
    trailY: new Float64Array(RPG_TRAIL_CAPACITY),
    trailHead: 0, trailCount: 0,
  };

  const joystick: RpgJoystick = { isActive: false, pointerId: -1, baseX: 0, baseY: 0, thumbX: 0, thumbY: 0 };
  const keys: RpgKeyState = { left: false, right: false, up: false, down: false };
  const playerStats: RpgPlayerStats = { hp: PLAYER_HP_INIT, maxHp: PLAYER_HP_INIT, atk: PLAYER_ATK_INIT, def: PLAYER_DEF_INIT, regen: PLAYER_REGEN_INIT };

  // ── Player movement state (managed by rpg-player-movement.ts) ──
  const playerMovementState: PlayerMovementState = {
    glowMovementIntensity: 0,
    playerAimAngle: -Math.PI / 2,  // default: upward
  };

  // Restore the active zone's last current wave from saved state (0 if new save).
  let currentWave      = rpgSimState.currentWaveByZone[rpgSimState.activeZoneId] ?? 0;
  let interWaveTimerMs = 0;
  let isInterWave      = true;
  /**
   * Per-zone current wave is now stored in rpgSimState.currentWaveByZone so it
   * persists across page reloads.  The local `currentWave` variable is the
   * in-flight copy; it is synced back to rpgSimState.currentWaveByZone whenever
   * setCurrentWave is called or when zones are switched.
   */
  let topographicTerrainState: TopographicTerrainState | null = null;
  /** Nav grid for pathfinding — rebuilt when terrain or canvas dimensions change. */
  let rpgNavGrid: RpgNavGrid | null = null;
  const enemies: LaserEnemy[]    = [];
  const spawnQueue: SpawnEntry[] = [];
  let glowTimeS = 0;
  let _isActive = false;
  let rpgPhase: RpgPhase = 'alive';
  let phaseTimerMs     = 0;
  let deathAlpha       = 1;
  let screenDarken     = 0;
  let restartFadeAlpha = 0;
  const deathParticles: DeathParticle[] = [];

  // ── Player attack state ────────────────────────────────────────
  const hitEffects: HitEffect[] = [];
  const shotLines:  ShotLine[]  = [];
  const damageNumbers: DamageNumber[] = [];
  let playerIFramesMs = 0;

  // ── Sand blade swing tracking (for sand drift pixel spawning) ──
  /** Phase of the sand blade from the previous frame — used to detect new swing starts. */
  let prevSandBladePhase: SwordComboPhase = 'idle';

  // ── Sapphire enemies, missiles, and new weapon state ──────────
  const sapphireEnemies: SapphireEnemy[]  = [];
  const sapphireMissiles: SapphireMissile[] = [];
  // ── New enemy type arrays ──────────────────────────────────────
  const emeraldEnemies: EmeraldEnemy[] = [];
  const amberEnemies: AmberEnemy[]     = [];
  const amberShards: AmberShard[]      = [];
  const voidEnemies: VoidEnemy[]       = [];

  // ── Crystal hierarchy enemy arrays ────────────────────────────
  const quartzEnemies: QuartzEnemy[]       = [];
  const quartzSpikes: QuartzSpike[]        = [];
  const rubyEnemies: RubyEnemy[]           = [];
  const rubyBolts: RubyBolt[]              = [];
  const sunstoneEnemies: SunstoneEnemy[]   = [];
  const citrineEnemies: CitrineEnemy[]     = [];
  const citrineBolts: CitrineBolt[]        = [];
  const ioliteEnemies: IoliteEnemy[]       = [];
  const amethystEnemies: AmethystEnemy[]   = [];
  const amethystShards: AmethystShard[]    = [];
  const diamondEnemies: DiamondEnemy[]     = [];
  const diamondShards: DiamondShard[]      = [];
  const nullstoneEnemies: NullstoneEnemy[] = [];
  const voidTendrils: VoidTendril[]        = [];
  const fracterylEnemies: FracterylEnemy[] = [];
  const fracterylShards: FracterylShard[]  = [];
  const eigensteinEnemies: EigensteinEnemy[] = [];
  const eigensteinBeams: EigensteinBeam[]  = [];
  const eliteEnemies: EliteEnemy[]         = [];
  const polyominoEnemies: PolyominoEnemy[] = [];
  const fissilePolyominoEnemies: FissilePolyominoEnemy[] = [];
  const refractorPolyominoEnemies: RefractorPolyominoEnemy[] = [];
  const stardustEnemies: StardustEnemy[]   = [];
  const horizonPentagonGroups: import('./horizon-pentagon-types').HorizonPentagonGroup[] = [];
  const alivenGroups: AlivenParticleGroup[] = [];

  // ── Procedural creature arrays ─────────────────────────────────
  const dustWispEnemies: DustWispEnemy[]             = [];
  const ribbonWormEnemies: RibbonWormEnemy[]         = [];
  const lanternMothEnemies: LanternMothEnemy[]       = [];
  const eyeStalkEnemies: EyeStalkEnemy[]             = [];
  const jellyfishEnemies: JellyfishEnemy[]           = [];
  const clothGhostEnemies: ClothGhostEnemy[]         = [];
  const plantTurretEnemies: PlantTurretEnemy[]       = [];
  const gearInsectEnemies: GearInsectEnemy[]         = [];
  const spiderCrawlerEnemies: SpiderCrawlerEnemy[]   = [];
  const moteSwarmEnemies: MoteSwarmEnemy[]           = [];
  const shadowHandEnemies: ShadowHandEnemy[]         = [];
  const sandFishEnemies: SandFishEnemy[]             = [];
  const quartzFishEnemies: QuartzFishEnemy[]         = [];
  const rubyFishEnemies: RubyFishEnemy[]             = [];
  const sunstoneFishEnemies: SunstoneFishEnemy[]     = [];
  const emeraldFishEnemies: EmeraldFishEnemy[]       = [];
  const sapphireFishEnemies: SapphireFishEnemy[]     = [];
  const amethystFishEnemies: AmethystFishEnemy[]     = [];
  const diamondFishEnemies: DiamondFishEnemy[]       = [];
  const plantProjectiles: PlantProjectile[]          = [];
  const fishMines: FishMine[]                        = [];
  const fishSpikes: FishSpike[]                      = [];
  const fishBolts: FishBolt[]                        = [];
  const fishDecoys: FishDecoy[]                      = [];

  // ── Verdure zone environmental plants ──────────────────────────
  const verdurePlants: import('./terrain/rpg-verdure-growth').VerdurePlant[] = [];

  // ── Verdure cave wall state (regenerated on zone/wave start) ─────
  let verdureCaveWallState: import('./terrain/verdure-cave-walls').VerdureCaveWallState | null = null;

  // ── Lucky mote drops (luck mechanic) ─────────────────────────
  const luckyMotes: LuckyMote[] = [];
  const luckyMotePopups: LuckyMotePopup[] = [];

  /** Cached luck percentage getter; updated only when XP changes. */
  const getCachedLuckPercent = createCachedLuckPercentGetter(rpgSimState);

  /** The currently targeted enemy object, or null for automatic targeting.
   *  State is now private to `createRpgTargeting` (rpg-targeting.ts).
   *  Access via `targeting.getTargetedEnemy()` — never read directly here. */
  // targetedEnemy state has moved into createRpgTargeting (rpg-targeting.ts).

  // ── DPS tracking ── forwarded to statsPanel after it is created below
  // These use `let x!: T` (TypeScript definite-assignment assertion) because each
  // is initialized during factory setup but depends on other systems being created
  // first.  ESLint's prefer-const rule cannot model this deferred-init pattern.
  // eslint-disable-next-line prefer-const
  let statsPanel!: RpgStatsPanelHandle;
  // eslint-disable-next-line prefer-const
  let weaponSystems!: RpgWeaponHandle;
  // eslint-disable-next-line prefer-const
  let waveManager!: WaveManagerHandle;
  // eslint-disable-next-line prefer-const
  let bossWave!: BossWaveHandle;
  let _forwardRecordDps: (dmg: number, _legacyColor?: string) => void = () => {};
  function recordDps(dmg: number, _legacyColor?: string): void {
    _forwardRecordDps(dmg, _legacyColor);
  }

  function findEquippedWeaponIdByEffect(effectKind: string): string | null {
    return findEquippedWeaponIdByEffectHelper(effectKind, getEffectiveEquippedIds());
  }

  const {
    damageEnemy, damageSapphireEnemy, damageMissile,
    damageEmeraldEnemy, damageAmberEnemy, damageAmberShard,
    damageVoidEnemy, damageQuartzEnemy, damageQuartzSpike,
    damageRubyEnemy, damageRubyBolt, damageSunstoneEnemy,
    damageCitrineEnemy, damageCitrineBolt, damageIoliteEnemy,
    damageAmethystEnemy, damageAmethystShard, damageDiamondEnemy,
    damageDiamondShard, damageNullstoneEnemy, damageVoidTendril,
    damageFracterylEnemy, damageFracterylShard, damageEigensteinEnemy,
    damagePolyominoEnemy, damageFissilePolyominoEnemy, damageRefractorPolyominoEnemy,
    damageBinaryRingEnemy, damageNadirCubePointEnemy, damageEliteEnemy,
    damageDustWispEnemy, damageRibbonWormEnemy, damageLanternMothEnemy, damageEyeStalkEnemy,
    damageJellyfishEnemy, damageClothGhostEnemy, damagePlantTurretEnemy, damageGearInsectEnemy,
    damageSpiderCrawlerEnemy, damageMoteSwarmEnemy, damageShadowHandEnemy,
    damageSandFishEnemy, damageQuartzFishEnemy, damageRubyFishEnemy, damageSunstoneFishEnemy,
    damageEmeraldFishEnemy, damageSapphireFishEnemy, damageAmethystFishEnemy, damageDiamondFishEnemy,
    damagePlantProjectile,
    damageHorizonPentagonReal,
    damageHorizonMissile,
  } = createDamageFns({
    recordDps,
    onEnemyHit: (enemy, dmg, blocked) => notifyEnemyHit(enemy, dmg, blocked),
  });

  // eslint-disable-next-line prefer-const
  let targeting!: RpgTargetingHandle;
  // eslint-disable-next-line prefer-const
  let playerAttackCtx!: RpgPlayerAttackCtx;

  let bossEnemy: BossEnemy | null = null;
  let danmakuSafeZone: DanmakuSafeZone | null = null;
  const bossProjectiles: BossProjectile[] = [];
  const teleportParticles: TeleportParticle[] = [];
  const bossAttackState: BossAttackState = createBossAttackState();
  /** Counts successive diamond-blade hits on the boss; resets to 0 after every teleport. */
  let bossHitsInRound = 0;
  /** True when the current boss fight was launched from the RPG menu. */
  let isBossFightFromMenu = false;

  // ── Boss stage director state ──────────────────────────────────
  const bossStageDirectorState: BossStageDirectorState = createBossStageDirectorState();

  // ── Pathfinding debug flag ─────────────────────────────────────

  // ── Boss wave management ───────────────────────────────────────
  /** True while a boss wave is active (from spawn until defeat or death). */
  let isBossWaveActive = false;
  /**
   * Temporary equipped-weapon override used only during boss waves.
   * The player's actual rpgSimState.equippedWeaponIds is never mutated by boss
   * wave logic, so equip/unequip actions and saves always reflect real equipment.
   */
  let bossActiveEquipIds: Set<string> | null = null;
  /** Saved weapon tiers before boss wave (so temp tier-1 forced on diamond_bastion). */
  let bossPreWaveWeaponTiers: Map<string, number> = new Map();

  /**
   * Returns the weapon IDs that are "active" for combat/rendering purposes.
   * During a boss wave this is the boss override set (always {diamond_bastion});
   * otherwise it is filtered by Box 1 wire connections.
   *
   * Legacy fallback: if no Box 1 wires exist, all equipped weapons are active.
   * This preserves existing saves where the wire system has not been used yet.
   */
  function getEffectiveEquippedIds(): Set<string> {
    if (isBossWaveActive && bossActiveEquipIds !== null) {
      return bossActiveEquipIds;
    }
    // Legacy fallback: if no Box 1 wires exist, return all equipped weapons.
    if (!statsPanel.hasAnyEquipWire()) {
      return rpgSimState.equippedWeaponIds;
    }
    // Filter equipped weapons to those whose slot has a Box 1 wire.
    const result = new Set<string>();
    for (const [slotIdx, weaponId] of rpgSimState.equippedWeaponSlots) {
      if (statsPanel.isSlotEquippedByWire(slotIdx)) {
        result.add(weaponId);
      }
    }
    return result;
  }

  // ── Equipped weapon visual particles (one per equipped weapon) ────
  const weaponOrbitParticles: WeaponOrbitParticle[] = [];

  // ── Per-weapon attack timers ───────────────────────────────────
  const weaponAttackTimers: Map<string, number> = new Map();

  // ── Orbiting projectile upgrade ───────────────────────────────
  let orbitProjectile: OrbitProjectile | null = null;

  // Shared context for weapon orbit particle helpers.
  const weaponOrbitCtx: WeaponOrbitCtx = { mote, weaponOrbitParticles, rpgSimState };

  function applyEquipmentStats(): void {
    const effectiveIds = getEffectiveEquippedIds();
    // Aggregate DEF from all equipped weapons.
    let totalDefBonus = 0;
    for (const weaponId of effectiveIds) {
      const weaponDef = resolveWeaponDefinition(weaponId);
      if (weaponDef) totalDefBonus += weaponDef.stats.defBonus;
    }
    playerStats.def = PLAYER_DEF_INIT + totalDefBonus + getEffectiveXpDefBonus(rpgSimState) + getPlayerLevelDefBonus(rpgSimState.playerLevel);
    // Regen is a fixed base value (weapon/XP bonuses can be added here in future).
    playerStats.regen = PLAYER_REGEN_INIT;
    // Player ATK is the base multiplier (not including per-weapon tier damage).
    playerStats.atk = PLAYER_ATK_INIT + getEffectiveXpAtkBonus(rpgSimState) + getPlayerLevelAtkBonus(rpgSimState.playerLevel) + (options.getAchievementAtkBonus?.() ?? 0);
    // Bonus max-HP from XP wired to HP stat, plus level-up HP gains.
    const hpBonus = getEffectiveXpHpBonus(rpgSimState) + getPlayerLevelHpBonus(rpgSimState.playerLevel);
    const newMaxHp = PLAYER_HP_INIT + hpBonus;
    if (newMaxHp !== playerStats.maxHp) {
      const delta = newMaxHp - playerStats.maxHp;
      playerStats.maxHp = newMaxHp;
      // Also adjust current HP proportionally so the bar doesn't jump.
      if (delta > 0) playerStats.hp = Math.min(playerStats.hp + delta, newMaxHp);
      else playerStats.hp = Math.min(playerStats.hp, newMaxHp);
    }

    // Rebuild weapon orbit particles (one per equipped weapon, evenly spaced).
    weaponOrbitParticles.length = 0;
    const equippedIds = Array.from(effectiveIds);
    const angleStep = equippedIds.length > 0 ? (2 * Math.PI) / equippedIds.length : 0;
    for (let i = 0; i < equippedIds.length; i++) {
      const p = _buildWeaponOrbitParticle(weaponOrbitCtx, equippedIds[i], i * angleStep);
      if (p) weaponOrbitParticles.push(p);
    }

    // Remove chain whip states for weapons that are no longer effectively equipped.
    for (const weaponId of Array.from(weaponSystems.chainWhipStates.keys())) {
      if (!effectiveIds.has(weaponId)) weaponSystems.chainWhipStates.delete(weaponId);
    }
    // Remove vortex weapon states for unequipped weapons.
    for (const weaponId of Array.from(weaponSystems.vortexWeaponStates.keys())) {
      if (!effectiveIds.has(weaponId)) weaponSystems.vortexWeaponStates.delete(weaponId);
    }
    // Remove sword combo states for unequipped weapons.
    for (const weaponId of Array.from(weaponSystems.swordComboStates.keys())) {
      if (!effectiveIds.has(weaponId)) weaponSystems.swordComboStates.delete(weaponId);
    }
    // Remove attack timers for unequipped weapons.
    for (const weaponId of Array.from(weaponAttackTimers.keys())) {
      if (!effectiveIds.has(weaponId)) weaponAttackTimers.delete(weaponId);
    }

    orbitProjectile = _buildOrbitProjectile(weaponOrbitCtx);
    weaponSystems.syncSapphireShips();
    weaponSystems.syncAmethystShips();
  }

  /**
   * Clears any active wave terrain and rebuilds the nav grid with no terrain.
   *
   * Must be called when a boss fight begins (via onEnterBossWave) and whenever
   * a boss wave starts, so that:
   * - Player movement, enemy pathfinding, LOS, and weapon systems all treat the
   *   arena as fully open (no terrain obstacles) during boss fights.
   * - Any terrain that was generating or visible from the previous normal wave
   *   is immediately removed rather than lingering into the boss fight.
   *
   * Boss waves must never call beginWaveTerrain(); this function is the explicit
   * guard that enforces that contract even if timing races occur.
   */
  function clearWaveTerrainForBossFight(): void {
    topographicTerrainState = null;
    rpgNavGrid = buildRpgNavigationGrid(null, widthPx, heightPx);
  }

  function clearArrays(...arrays: Array<{ length: number }>): void {
    for (const array of arrays) array.length = 0;
  }

  const verdureResizePushScratch = { x: 0, y: 0 };

  function rebuildVerdureBoundsForResize(): void {
    if (rpgSimState.activeZoneId !== 'verdure' || !verdureCaveWallState) return;
    const ab = rpgFieldSpace.activeBounds;
    const prev = verdureCaveWallState;
    const changed =
      Math.abs(prev.originX - ab.left) > 0.5 ||
      Math.abs(prev.originY - ab.top) > 0.5 ||
      Math.abs(prev.widthPx - ab.width) > 0.5 ||
      Math.abs(prev.heightPx - ab.height) > 0.5;
    if (!changed) return;

    verdureCaveWallState.edgePoints.forEach((p) => { p.isOccupied = false; });
    const seed = currentWave > 0 ? currentWave : prev.seed;
    verdureCaveWallState = generateVerdureCaveWalls(seed, ab);
    rpgNavGrid = buildRpgNavigationGrid(topographicTerrainState, ab.width, ab.height, undefined, ab.left, ab.top);
    applyVerdureWallsToNavGrid(verdureCaveWallState, rpgNavGrid);

    const pushEntity = (entity: { x: number; y: number; vx?: number; vy?: number }, margin: number): void => {
      if (!verdureCaveWallState) return;
      if (!pushPointOutsideVerdureWall(verdureCaveWallState, entity.x, entity.y, verdureResizePushScratch, margin)) return;
      entity.x = verdureResizePushScratch.x;
      entity.y = verdureResizePushScratch.y;
      if (typeof entity.vx === 'number') entity.vx = 0;
      if (typeof entity.vy === 'number') entity.vy = 0;
    };

    pushEntity(mote, RPG_MOTE_SIZE * 0.5 + 2);
    for (const arrays of [
      enemies, sapphireEnemies, emeraldEnemies, amberEnemies, voidEnemies, quartzEnemies,
      rubyEnemies, sunstoneEnemies, citrineEnemies, ioliteEnemies, amethystEnemies,
      diamondEnemies, nullstoneEnemies, fracterylEnemies, eigensteinEnemies, eliteEnemies,
      polyominoEnemies, fissilePolyominoEnemies, refractorPolyominoEnemies, dustWispEnemies,
      ribbonWormEnemies, lanternMothEnemies, eyeStalkEnemies, jellyfishEnemies,
      clothGhostEnemies, plantTurretEnemies, gearInsectEnemies, spiderCrawlerEnemies,
      moteSwarmEnemies, shadowHandEnemies, sandFishEnemies, quartzFishEnemies,
      rubyFishEnemies, sunstoneFishEnemies, emeraldFishEnemies, sapphireFishEnemies,
      amethystFishEnemies, diamondFishEnemies,
    ] as Array<Array<{ x: number; y: number; vx?: number; vy?: number }>>) {
      for (const entity of arrays) pushEntity(entity, 8);
    }
    clearVerdurePlants(verdurePlants);
  }

  function resetActiveEncounterForZoneSwitch(): void {
    if (isBossWaveActive) bossWave.exitBossWave();

    clearArrays(
      spawnQueue,
      enemies, sapphireEnemies, sapphireMissiles, emeraldEnemies,
      amberEnemies, amberShards, voidEnemies, quartzEnemies, quartzSpikes,
      rubyEnemies, rubyBolts, sunstoneEnemies, citrineEnemies, citrineBolts,
      ioliteEnemies, amethystEnemies, amethystShards, diamondEnemies, diamondShards,
      nullstoneEnemies, voidTendrils, fracterylEnemies, fracterylShards, eigensteinEnemies, eigensteinBeams,
      eliteEnemies, polyominoEnemies, fissilePolyominoEnemies, refractorPolyominoEnemies,
      binaryRingEnemies, binaryRingMissiles, stardustEnemies, horizonPentagonGroups, alivenGroups,
      dustWispEnemies, ribbonWormEnemies, lanternMothEnemies, eyeStalkEnemies,
      jellyfishEnemies, clothGhostEnemies, plantTurretEnemies, gearInsectEnemies,
      spiderCrawlerEnemies, moteSwarmEnemies, shadowHandEnemies,
      sandFishEnemies, quartzFishEnemies, rubyFishEnemies, sunstoneFishEnemies,
      emeraldFishEnemies, sapphireFishEnemies, amethystFishEnemies, diamondFishEnemies,
      plantProjectiles, fishMines, fishSpikes, fishBolts, fishDecoys,
      bossProjectiles, teleportParticles,
      hitEffects, shotLines, damageNumbers, deathParticles,
      luckyMotes, luckyMotePopups,
    );
    binaryLaserSweep = null;
    zenithBinaryRingBg = null;
    nadirCubicGrid = null;
    isNadirEliteWave = false;

    bossEnemy = null;
    danmakuSafeZone = null;
    bossAttackState.attacks.length = 0;
    bossAttackState.schedulerCooldowns.clear();
    bossAttackState.activePressure = 0;
    bossHitsInRound = 0;
    isBossFightFromMenu = false;
    isBossWaveActive = false;
    bossActiveEquipIds = null;
    bossPreWaveWeaponTiers.clear();
    deactivateBossStageDirector(bossStageDirectorState);

    topographicTerrainState = null;
    rpgNavGrid = buildRpgNavigationGrid(null, widthPx, heightPx);

    // Clear Verdure zone plants whenever the encounter resets.
    clearVerdurePlants(verdurePlants);
    verdureCaveWallState?.edgePoints.forEach((p) => { p.isOccupied = false; });
    verdureCaveWallState = null;

    isInterWave = true;
    interWaveTimerMs = INTER_WAVE_DELAY_MS * 0.4;
    rpgPhase = 'alive';
    phaseTimerMs = 0;
    deathAlpha = 1;
    screenDarken = 0;
    restartFadeAlpha = 0;
    playerIFramesMs = 0;
    prevSandBladePhase = 'idle';

    mote.x = widthPx / 2;
    mote.y = heightPx / 2;
    mote.vx = 0;
    mote.vy = 0;
    mote.trailHead = 0;
    mote.trailCount = 0;
    playerMovementState.glowMovementIntensity = 0;
    if (playerStats.hp <= 0) playerStats.hp = playerStats.maxHp;

    targeting.tryTargetEnemyAt(0, 0);
    weaponSystems.reset();
    applyEquipmentStats();
    orbitProjectile = _buildOrbitProjectile(weaponOrbitCtx);
  }

  /**
   * Recomputes `isNadirEliteWave` from the given wave number and current zone/subzone.
   * Called whenever the wave counter changes (wave start or death/restart).
   */
  function syncNadirEliteWave(wave: number): void {
    isNadirEliteWave =
      rpgSimState.activeZoneId === 'horizon' &&
      rpgSimState.activeSubzoneId === 'nadir' &&
      wave % 10 === 0 &&
      wave > 0;
  }

  // ── Player damage helpers (extracted to rpg-player-damage.ts) ──────
  const playerDamageCtx: PlayerDamageCtx = {
    mote,
    playerStats,
    getPlayerIFramesMs:  () => playerIFramesMs,
    setPlayerIFramesMs:  (ms) => { playerIFramesMs = ms; },
    hitEffects,
    shotLines,
    damageNumbers,
    getDim:              () => dim,
    getViewport:         () => viewport,
    isInvincibilityMode: () => isInvincibilityMode,
    onPlayerHit: () => { waveManager?.onPlayerHit(); },
    onPlayerDamaged: (dmg, blocked, playerDied, playerMaxHp) => {
      notifyPlayerDamaged(dmg, blocked, playerDied, playerMaxHp);
    },
  };
  const {
    spawnDamageNumber,
    spawnHitVisualsAt,
    spawnHitVisuals,
    dealDamageToPlayer,
    dealDamageToPlayerKnockback,
    updateShotVisuals,
    updateDamageNumbers,
  } = createPlayerDamageFns(playerDamageCtx);

  // ── Closest-target helpers ─────────────────────────────────────

  /**
   * Returns the closest targetable entity within rangeSq squared distance.
   * Returns null if nothing is in range.
   */
  function findClosestTarget(rangeSq: number): ClosestTarget | null { return targeting.findClosestTarget(rangeSq); }

  /** Returns the closest enemy body (not projectiles) within rangeSq. */
  function findClosestEnemy(rangeSq: number): ReturnType<typeof import('./rpg-targeting-nearest').findClosestEnemy> { return targeting.findClosestEnemy(rangeSq); }

  // ── Tap-to-target system ───────────────────────────────────────

  /**
   * Given a tap position, finds the closest enemy body (not projectile) within
   * Manual targeting is currently disabled by design; sapphire ships use
   * nearest-enemy targeting.
   */
  function tryTargetEnemyAt(tapX: number, tapY: number): void { targeting.tryTargetEnemyAt(tapX, tapY); }

  /**
   * Returns the currently targeted enemy if it's still alive, or falls back to
   * closest enemy from player. Automatically clears stale targets.
   */
  function getTargetedEnemy(): ClosestTarget | null { return targeting.getTargetedEnemy(); }

  function collectEnemyBodyTargets(opts?: import('./rpg-targeting-types').TargetCollectionOptions): ClosestTarget[] { return targeting.collectEnemyBodyTargets(opts); }

  function findClosestEnemyFrom(x: number, y: number, rangeSq: number, opts?: import('./rpg-targeting-types').TargetCollectionOptions): ClosestTarget | null { return targeting.findClosestEnemyFrom(x, y, rangeSq, opts); }

  function damageBodyTarget(target: ClosestTarget, rawDamage: number, defPierceRatio: number, bypassShield: boolean): number { return targeting.damageBodyTarget(target, rawDamage, defPierceRatio, bypassShield); }

  // ── Weapon systems (extracted to rpg-weapon-systems.ts) ──────────
  // weaponCtx and weaponSystems are initialized below after all helper
  // functions have been defined (see "Create weapon systems" section).


  function performWeaponAttack(weaponId: string): void {
    _performWeaponAttack(playerAttackCtx, weaponId);
  }

  // ── Create targeting system ───────────────────────────────────
  targeting = createRpgTargeting({
    mote,
    get bossEnemy() { return bossEnemy; },
    enemies, sapphireEnemies, sapphireMissiles, emeraldEnemies,
    amberEnemies, amberShards, voidEnemies, quartzEnemies, quartzSpikes,
    rubyEnemies, rubyBolts, sunstoneEnemies, citrineEnemies, citrineBolts,
    ioliteEnemies, amethystEnemies, amethystShards, diamondEnemies, diamondShards,
    nullstoneEnemies, voidTendrils, fracterylEnemies, fracterylShards, eigensteinEnemies,
    eliteEnemies, polyominoEnemies, fissilePolyominoEnemies, refractorPolyominoEnemies,
    binaryRingEnemies,
    nadirCubePointEnemies,
    horizonPentagonGroups,
    stardustEnemies,
    alivenGroups,
    dustWispEnemies, ribbonWormEnemies, lanternMothEnemies, eyeStalkEnemies,
    jellyfishEnemies, clothGhostEnemies, plantTurretEnemies, gearInsectEnemies,
    spiderCrawlerEnemies, moteSwarmEnemies, shadowHandEnemies,
    sandFishEnemies, quartzFishEnemies, rubyFishEnemies, sunstoneFishEnemies,
    emeraldFishEnemies, sapphireFishEnemies, amethystFishEnemies, diamondFishEnemies,
    plantProjectiles,
    verdurePlants,
    damageEnemy, damageSapphireEnemy, damageMissile,
    damageEmeraldEnemy, damageAmberEnemy, damageAmberShard,
    damageVoidEnemy, damageQuartzEnemy, damageQuartzSpike,
    damageRubyEnemy, damageRubyBolt, damageSunstoneEnemy,
    damageCitrineEnemy, damageCitrineBolt, damageIoliteEnemy,
    damageAmethystEnemy, damageAmethystShard, damageDiamondEnemy,
    damageDiamondShard, damageNullstoneEnemy, damageVoidTendril,
    damageFracterylEnemy, damageFracterylShard, damageEigensteinEnemy,
    damagePolyominoEnemy, damageFissilePolyominoEnemy, damageRefractorPolyominoEnemy,
    damageBinaryRingEnemy, damageNadirCubePointEnemy, damageHorizonPentagonReal, damageHorizonMissile, damageEliteEnemy,
    damageDustWispEnemy, damageRibbonWormEnemy, damageLanternMothEnemy, damageEyeStalkEnemy,
    damageJellyfishEnemy, damageClothGhostEnemy, damagePlantTurretEnemy, damageGearInsectEnemy,
    damageSpiderCrawlerEnemy, damageMoteSwarmEnemy, damageShadowHandEnemy,
    damageSandFishEnemy, damageQuartzFishEnemy, damageRubyFishEnemy, damageSunstoneFishEnemy,
    damageEmeraldFishEnemy, damageSapphireFishEnemy, damageAmethystFishEnemy, damageDiamondFishEnemy,
    damagePlantProjectile,
    damageVerdurePlant: (plant, raw) => _damageVerdurePlant(plant, raw),
    damageAlivenParticle: (p, g, raw) => damageAlivenParticle(p, g, raw, recordDps),
    damageBossEnemy: (raw, pierce, fromDiamond) => bossWave.damageBossEnemy(raw, pierce, fromDiamond),
    getTerrainState: () => topographicTerrainState,
  });

  // ── Enemy bark system (speech bubbles) ────────────────────────
  initEnemyBarkSystem({
    // findClosestEnemy returns the enemy object directly (union type); cast to the bark
    // system's minimal BarkableEnemy shape (all enemy types in the union have these fields).
    getClosestLivingEnemy: () => {
      const t = targeting.findClosestEnemy(Infinity);
      if (!t || t.hp <= 0) return null;
      return t as unknown as { x: number; y: number; hp: number; maxHp: number };
    },
  });

  // ── Create wave manager ────────────────────────────────────────
  // All helper functions referenced in waveManagerCtx are function declarations
  // and are hoisted, so this is safe even though they appear later in the file.
  waveManager = createWaveManager({
    getFieldSpace: () => rpgFieldSpace,
    mote,
    rpgSimState,
    enemies, sapphireMissiles, sapphireEnemies, emeraldEnemies,
    amberEnemies, amberShards, voidEnemies, quartzEnemies, quartzSpikes,
    rubyEnemies, rubyBolts, sunstoneEnemies, citrineEnemies, citrineBolts,
    ioliteEnemies, amethystEnemies, amethystShards, diamondEnemies, diamondShards,
    nullstoneEnemies, voidTendrils, fracterylEnemies, fracterylShards, eigensteinEnemies,
    eliteEnemies, polyominoEnemies, fissilePolyominoEnemies, refractorPolyominoEnemies,
    stardustEnemies, alivenGroups, horizonPentagonGroups,
    dustWispEnemies, ribbonWormEnemies, lanternMothEnemies, eyeStalkEnemies,
    jellyfishEnemies, clothGhostEnemies, plantTurretEnemies, gearInsectEnemies,
    spiderCrawlerEnemies, moteSwarmEnemies, shadowHandEnemies,
    sandFishEnemies, quartzFishEnemies, rubyFishEnemies, sunstoneFishEnemies,
    emeraldFishEnemies, sapphireFishEnemies, amethystFishEnemies, diamondFishEnemies,
    plantProjectiles, fishMines, fishSpikes, fishBolts, fishDecoys,
    bossProjectiles, spawnQueue, luckyMotes,
    nadirCubePointEnemies, nadirCubeMines, nadirCubeTrailSegments,
    nadirCubeTurretBolts, nadirCubeLinkLasers,
    fluid,
    getCachedLuckPercent,
    applyEquipmentStats: () => applyEquipmentStats(),
    spawnDamageNumber:   (x, y, vx, vy, text, ratio, color) => spawnDamageNumber(x, y, vx, vy, text, ratio, color),
    getBossEnemy:            () => bossEnemy,
    setBossEnemy:            (b) => { bossEnemy = b; },
    getIsBossFightFromMenu:  () => isBossFightFromMenu,
    setIsBossFightFromMenu:  (b) => { isBossFightFromMenu = b; },
    getCurrentWave:          () => currentWave,
    setCurrentWave:          (w) => { currentWave = w; rpgSimState.currentWaveByZone[rpgSimState.activeZoneId] = w; syncNadirEliteWave(w); },
    getIsInterWave:          () => isInterWave,
    setIsInterWave:          (b) => {
      const prevIsInterWave = isInterWave;
      isInterWave = b;
      // Zenith Binary Horizon lifecycle: active→inter-wave means wave ended.
      if (!prevIsInterWave && b &&
          rpgSimState.activeZoneId === 'horizon' &&
          rpgSimState.activeSubzoneId === 'zenith' &&
          binaryRingEnemies.length === 0) {
        zenithBinaryHorizon?.endZenithBinaryHorizonWave();
      }
    },
    setInterWaveTimerMs:     (ms) => { interWaveTimerMs = ms; },
    enterBossWave:           () => bossWave.enterBossWave(),
    exitBossWave:            () => bossWave.exitBossWave(),
    beginWaveTerrain:        (wave) => {
      topographicTerrainState = beginWaveTerrain(wave, widthPx, heightPx, performance.now(), rpgSimState.activeZoneId);
      if (rpgSimState.activeZoneId === 'verdure') {
        const ab = rpgFieldSpace.activeBounds;
        verdureCaveWallState = generateVerdureCaveWalls(wave, ab);
        rpgNavGrid = buildRpgNavigationGrid(topographicTerrainState, ab.width, ab.height, undefined, ab.left, ab.top);
      } else {
        verdureCaveWallState = null;
        rpgNavGrid = buildRpgNavigationGrid(topographicTerrainState, widthPx, heightPx);
      }
      // Apply zone-specific soft/hard obstacles to the nav grid immediately
      // after building it so enemies path around them from wave start.
      if (rpgSimState.activeZoneId === 'impetus') {
        applyCircleSoftObstacles(rpgNavGrid, getImpetusAsteroidObstacles(widthPx, heightPx));
      }
      if (rpgSimState.activeZoneId === 'verdure' && verdureCaveWallState) {
        applyVerdureWallsToNavGrid(verdureCaveWallState, rpgNavGrid);
      }
      // Zenith Binary Horizon lifecycle: trigger cut sequence for new wave.
      if (rpgSimState.activeZoneId === 'horizon' &&
          rpgSimState.activeSubzoneId === 'zenith' &&
          binaryRingEnemies.length === 0) {
        zenithBinaryHorizon?.beginZenithBinaryHorizonWave(wave);
      }
    },
    beginTopographicTerrainShrink: () => {
      if (topographicTerrainState) beginTopographicTerrainShrink(topographicTerrainState, performance.now());
    },
    isTopographicTerrainReadyForEnemySpawns: () => {
      if (!topographicTerrainState) return true;
      if (isTopographicTerrainGone(topographicTerrainState)) return true;
      return isTopographicTerrainReadyForEnemySpawns(topographicTerrainState);
    },
    getTopographicTerrainState: () => topographicTerrainState,
    getPlayerHpRatio:        () => playerStats.maxHp > 0 ? playerStats.hp / playerStats.maxHp : 0,
    getVerdureCaveWallState: () => verdureCaveWallState,
    getIsDevMode:            () => _isDevMode,
  });

  // ── Create weapon systems ──────────────────────────────────────
  // All helper functions referenced in weaponCtx are function declarations
  // and are hoisted, so this is safe even though they appear later in the file.

  // ── Stat multiplier helpers (depend on statsPanel, which is created below) ──
  // These are declared before weaponCtx/playerAttackCtx so they can be passed
  // in, even though statsPanel itself is initialised after those contexts.
  // By the time any of these functions is actually called (during update loops),
  // statsPanel will have been initialised.

  /** Returns the 0-based slot index for the given weapon ID, or null. */
  function getSlotIdxForWeapon(weaponId: string): number | null {
    for (const [slotIdx, wid] of rpgSimState.equippedWeaponSlots) {
      if (wid === weaponId) return slotIdx;
    }
    return null;
  }

  function getWeaponAtkMultiplier(weaponId: string): number {
    const slotIdx = getSlotIdxForWeapon(weaponId);
    if (slotIdx === null) return 1;
    return statsPanel.getWeaponStatMultiplier(slotIdx, 'atkIn');
  }

  function getWeaponSpdMultiplier(weaponId: string): number {
    const slotIdx = getSlotIdxForWeapon(weaponId);
    if (slotIdx === null) return 1;
    return statsPanel.getWeaponStatMultiplier(slotIdx, 'spdIn');
  }

  function getWeaponRngMultiplier(weaponId: string): number {
    const slotIdx = getSlotIdxForWeapon(weaponId);
    if (slotIdx === null) return 1;
    return statsPanel.getWeaponStatMultiplier(slotIdx, 'rngIn');
  }

  function getWeaponPrcMultiplier(weaponId: string): number {
    const slotIdx = getSlotIdxForWeapon(weaponId);
    if (slotIdx === null) return 1;
    return statsPanel.getWeaponStatMultiplier(slotIdx, 'prcIn');
  }

  const weaponCtx: RpgWeaponCtx = {
    dim,
    viewport,
    mote,
    get bossEnemy()       { return bossEnemy; },
    get playerAimAngle()  { return playerMovementState.playerAimAngle; },
    hitEffects,
    rpgSimState,
    playerStats,
    fluid,
    getEffectiveEquippedIds,
    findEquippedWeaponIdByEffect,
    getCachedLuckPercent,
    getTerrainState: () => topographicTerrainState,
    damageEnemy, damageSapphireEnemy, damageMissile,
    damageEmeraldEnemy, damageAmberEnemy, damageAmberShard,
    damageVoidEnemy, damageQuartzEnemy, damageQuartzSpike,
    damageRubyEnemy, damageRubyBolt, damageSunstoneEnemy,
    damageCitrineEnemy, damageCitrineBolt, damageIoliteEnemy,
    damageAmethystEnemy, damageAmethystShard, damageDiamondEnemy,
    damageDiamondShard, damageNullstoneEnemy, damageVoidTendril,
    damageFracterylEnemy, damageFracterylShard, damageEigensteinEnemy,
    damagePolyominoEnemy, damageFissilePolyominoEnemy, damageRefractorPolyominoEnemy,
    damageEliteEnemy,
    damageBossEnemy:         (raw, pierce, fromDiamond) => bossWave.damageBossEnemy(raw, pierce, fromDiamond),
    damageDustWispEnemy, damageRibbonWormEnemy, damageLanternMothEnemy, damageEyeStalkEnemy,
    damageJellyfishEnemy, damageClothGhostEnemy, damagePlantTurretEnemy, damageGearInsectEnemy,
    damageSpiderCrawlerEnemy, damageMoteSwarmEnemy, damageShadowHandEnemy,
    damageSandFishEnemy, damageQuartzFishEnemy, damageRubyFishEnemy, damageSunstoneFishEnemy,
    damageEmeraldFishEnemy, damageSapphireFishEnemy, damageAmethystFishEnemy, damageDiamondFishEnemy,
    damagePlantProjectile,
    findClosestTarget:       (rangeSq) => findClosestTarget(rangeSq),
    findClosestEnemy:        (rangeSq) => findClosestEnemy(rangeSq),
    collectEnemyBodyTargets: (opts?: import('./rpg-targeting-types').TargetCollectionOptions) => collectEnemyBodyTargets(opts),
    findClosestEnemyFrom:    (px: number, py: number, rangeSq: number, opts?: import('./rpg-targeting-types').TargetCollectionOptions) => findClosestEnemyFrom(px, py, rangeSq, opts),
    getTargetedEnemy:        () => getTargetedEnemy(),
    damageBodyTarget:        (t, raw, pierce, bypass) => damageBodyTarget(t, raw, pierce, bypass),
    spawnDamageNumber:       (x, y, vx, vy, text, ratio, color, sourceColor) => spawnDamageNumber(x, y, vx, vy, text, ratio, color, sourceColor),
    spawnHitVisuals:         (enemy, dmg, color, sourceColor) => spawnHitVisuals(enemy, dmg, color, sourceColor),
    spawnHitVisualsAt:       (tx, ty, maxHp, dmg, color, sourceColor) => spawnHitVisualsAt(tx, ty, maxHp, dmg, color, sourceColor),
    removeDeadEnemies:       () => waveManager.removeDeadEnemies(),
    checkWaveCompletion:     () => waveManager.checkWaveCompletion(),
    withDamageSource:        (id, fn) => statsPanel.withDamageSource(id, fn),
    enemies,
    sapphireEnemies,
    sapphireMissiles,
    emeraldEnemies,
    amberEnemies,
    amberShards,
    voidEnemies,
    quartzEnemies,
    quartzSpikes,
    rubyEnemies,
    rubyBolts,
    sunstoneEnemies,
    citrineEnemies,
    citrineBolts,
    ioliteEnemies,
    amethystEnemies,
    amethystShards,
    diamondEnemies,
    diamondShards,
    nullstoneEnemies,
    voidTendrils,
    fracterylEnemies,
    fracterylShards,
    eigensteinEnemies,
    polyominoEnemies,
    fissilePolyominoEnemies,
    refractorPolyominoEnemies,
    eliteEnemies,
    binaryRingEnemies,
    stardustEnemies,
    horizonPentagonGroups,
    alivenGroups,
    dustWispEnemies, ribbonWormEnemies, lanternMothEnemies, eyeStalkEnemies,
    jellyfishEnemies, clothGhostEnemies, plantTurretEnemies, gearInsectEnemies,
    spiderCrawlerEnemies, moteSwarmEnemies, shadowHandEnemies,
    sandFishEnemies, quartzFishEnemies, rubyFishEnemies, sunstoneFishEnemies,
    emeraldFishEnemies, sapphireFishEnemies, amethystFishEnemies, diamondFishEnemies,
    plantProjectiles,
    damageAlivenParticle: (p, g, raw) => damageAlivenParticle(p, g, raw, recordDps),
  };
  weaponSystems = createRpgWeaponSystems(weaponCtx);

  playerAttackCtx = {
    mote,
    get bossEnemy() { return bossEnemy; },
    rpgSimState,
    playerStats,
    enemies, sapphireEnemies, sapphireMissiles, emeraldEnemies,
    amberEnemies, amberShards, voidEnemies, quartzEnemies, quartzSpikes,
    rubyEnemies, rubyBolts, sunstoneEnemies, citrineEnemies, citrineBolts,
    ioliteEnemies, amethystEnemies, amethystShards, diamondEnemies, diamondShards,
    nullstoneEnemies, voidTendrils, fracterylEnemies, fracterylShards, eigensteinEnemies,
    polyominoEnemies, fissilePolyominoEnemies, refractorPolyominoEnemies,
    eliteEnemies, binaryRingEnemies, stardustEnemies, horizonPentagonGroups, alivenGroups,
    dustWispEnemies, ribbonWormEnemies, lanternMothEnemies, eyeStalkEnemies,
    jellyfishEnemies, clothGhostEnemies, plantTurretEnemies, gearInsectEnemies,
    spiderCrawlerEnemies, moteSwarmEnemies, shadowHandEnemies,
    sandFishEnemies, quartzFishEnemies, rubyFishEnemies, sunstoneFishEnemies,
    emeraldFishEnemies, sapphireFishEnemies, amethystFishEnemies, diamondFishEnemies,
    plantProjectiles,
    damageHorizonPentagonReal, damageHorizonMissile,
    damageEnemy, damageSapphireEnemy, damageMissile,
    damageEmeraldEnemy, damageAmberEnemy, damageAmberShard,
    damageVoidEnemy, damageQuartzEnemy, damageQuartzSpike,
    damageRubyEnemy, damageRubyBolt, damageSunstoneEnemy,
    damageCitrineEnemy, damageCitrineBolt, damageIoliteEnemy,
    damageAmethystEnemy, damageAmethystShard, damageDiamondEnemy,
    damageDiamondShard, damageNullstoneEnemy, damageVoidTendril,
    damageFracterylEnemy, damageFracterylShard, damageEigensteinEnemy,
    damagePolyominoEnemy, damageFissilePolyominoEnemy, damageRefractorPolyominoEnemy,
    damageEliteEnemy,
    damageBossEnemy:        (raw, pierce, fromDiamond) => bossWave.damageBossEnemy(raw, pierce, fromDiamond),
    damageAlivenParticle:   (p, g, raw) => damageAlivenParticle(p, g, raw, recordDps),
    damageDustWispEnemy, damageRibbonWormEnemy, damageLanternMothEnemy, damageEyeStalkEnemy,
    damageJellyfishEnemy, damageClothGhostEnemy, damagePlantTurretEnemy, damageGearInsectEnemy,
    damageSpiderCrawlerEnemy, damageMoteSwarmEnemy, damageShadowHandEnemy,
    damageSandFishEnemy, damageQuartzFishEnemy, damageRubyFishEnemy, damageSunstoneFishEnemy,
    damageEmeraldFishEnemy, damageSapphireFishEnemy, damageAmethystFishEnemy, damageDiamondFishEnemy,
    damagePlantProjectile,
    spawnHitVisuals:      (enemy, dmg, color, sourceColor) => spawnHitVisuals(enemy, dmg, color, sourceColor),
    spawnHitVisualsAt:    (x, y, maxHp, dmg, color, sourceColor) => spawnHitVisualsAt(x, y, maxHp, dmg, color, sourceColor),
    fluid,
    findClosestTarget:    (rangeSq) => findClosestTarget(rangeSq),
    spawnSandProjectile:  (tx, ty, dmg) => weaponSystems.spawnSandProjectile(tx, ty, dmg),
    spawnPoisonBolt:      (tx, ty, wid, tier, dmg) => weaponSystems.spawnPoisonBolt(tx, ty, wid, tier, dmg),
    spawnEmeraldMissile:  (tx, ty, dmg, tier, bonusPx) => weaponSystems.spawnEmeraldMissile(tx, ty, dmg, tier, bonusPx),
    fireLaserBeam:        (tx, ty, wid) => weaponSystems.fireLaserBeam(tx, ty, wid),
    layMine:              (dmg, tier) => weaponSystems.layMine(dmg, tier),
    spawnFracterylSpearVolley: (wid, dmg, tier) => weaponSystems.spawnFracterylSpearVolley(wid, dmg, tier),
    getWeaponAtkMultiplier,
    getWeaponRngMultiplier,
    getWeaponPrcMultiplier,
    applyNullstonePull(hitX: number, hitY: number, radius: number): void {
      const r2 = radius * radius;
      const PULL_FRAC = 0.35;
      const nudge = (e: { x: number; y: number }) => {
        const dx = hitX - e.x, dy = hitY - e.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= 0 || d2 > r2) return;
        const dist = Math.sqrt(d2);
        const move = Math.min(dist * PULL_FRAC, dist);
        e.x += (dx / dist) * move;
        e.y += (dy / dist) * move;
      };
      for (const e of enemies)            nudge(e);
      for (const e of sapphireEnemies)    nudge(e);
      for (const e of emeraldEnemies)     nudge(e);
      for (const e of amberEnemies)       nudge(e);
      for (const e of voidEnemies)        nudge(e);
      for (const e of quartzEnemies)      nudge(e);
      for (const e of rubyEnemies)        nudge(e);
      for (const e of sunstoneEnemies)    nudge(e);
      for (const e of citrineEnemies)     nudge(e);
      for (const e of ioliteEnemies)      nudge(e);
      for (const e of amethystEnemies)    nudge(e);
      for (const e of diamondEnemies)     nudge(e);
      for (const e of nullstoneEnemies)   nudge(e);
      for (const e of fracterylEnemies)   nudge(e);
      for (const e of eigensteinEnemies)  nudge(e);
      for (const e of eliteEnemies)       nudge(e);
      if (bossEnemy) nudge(bossEnemy);
    },
  };

  statsPanel = createRpgStatsPanel({
    rpgSimState,
    playerStats,
    getCurrentWave: () => currentWave,
    getEffectiveEquippedIds,
    getNumberFormat: () => currentNumberFormat,
    onError: () => { options.onError?.(); },
    onPlayerLevelUp: () => {
      applyEquipmentStats();
      spawnDamageNumber(mote.x, mote.y - 10, 0, -1, 'Level Up!', 1, '#a78bfa');
    },
    onWeapCellTap: options.dispatch ? (slotIdx, anchorEl) => {
      showWeapInventoryPicker({
        anchor: anchorEl,
        slotIdx,
        rpgSimState,
        dispatch: options.dispatch!,
        weapSlotCells: statsPanel.getWeapSlotCells(),
      });
    } : undefined,
  });
  _forwardRecordDps = (dmg, color) => statsPanel.recordDps(dmg, color);

  // ── Boss wave manager (depends on spawnDamageNumber, recordDps, applyEquipmentStats) ──
  bossWave = createBossWaveManager({
    mote,
    dim,
    rpgSimState,
    teleportParticles,
    getIsBossWaveActive:        () => isBossWaveActive,
    setIsBossWaveActive:        (v) => { isBossWaveActive = v; },
    getBossActiveEquipIds:      () => bossActiveEquipIds,
    setBossActiveEquipIds:      (v) => { bossActiveEquipIds = v; },
    getBossPreWaveWeaponTiers:  () => bossPreWaveWeaponTiers,
    setBossPreWaveWeaponTiers:  (v) => { bossPreWaveWeaponTiers = v; },
    getBossHitsInRound:         () => bossHitsInRound,
    setBossHitsInRound:         (v) => { bossHitsInRound = v; },
    getBossEnemy:               () => bossEnemy,
    setBossEnemy:               (v) => { bossEnemy = v; },
    getPlayerIFramesMs:         () => playerIFramesMs,
    setPlayerIFramesMs:         (v) => { playerIFramesMs = v; },
    setIsBossFightFromMenu:     (v) => { isBossFightFromMenu = v; },
    applyEquipmentStats:        () => applyEquipmentStats(),
    spawnDamageNumber:          (x, y, vx, vy, text, ratio, color) => spawnDamageNumber(x, y, vx, vy, text, ratio, color),
    recordDps:                  (dmg, color) => recordDps(dmg, color),
    onEnterBossWave:            () => {
      // Boss fights must not have random wave terrain.  Clear any existing terrain
      // and rebuild the nav grid with null so pathfinding treats the arena as open.
      clearWaveTerrainForBossFight();
      resetBossStageDirector(bossStageDirectorState);
    },
    onExitBossWave:             () => { deactivateBossStageDirector(bossStageDirectorState); },
    onTeleportToSafeZone:       () => { advanceBossStage(bossStageDirectorState); },
  });

  // ── Boss stage director context ────────────────────────────────
  const bossStageDirectorCtx: BossStageDirectorCtx = {
    dim,
    playerStats,
    getPlayerIFramesMs: () => playerIFramesMs,
    setPlayerIFramesMs: (ms) => { playerIFramesMs = ms; },
    setPlayerHp: (hp) => { playerStats.hp = hp; },
    spawnDamageNumber: (x, y, vx, vy, text, ratio, color) =>
      spawnDamageNumber(x, y, vx, vy, text, ratio, color),
  };

  // ── Player movement context (wired to rpg-player-movement.ts) ───
  const movementCtx: PlayerMovementCtx = {
    mote,
    joystick,
    keys,
    dim,
    getFieldSpace: () => rpgFieldSpace,
    enemies, sapphireEnemies, emeraldEnemies, amberEnemies,
    voidEnemies, quartzEnemies, rubyEnemies, sunstoneEnemies,
    citrineEnemies, ioliteEnemies, amethystEnemies, diamondEnemies,
    nullstoneEnemies, fracterylEnemies, eigensteinEnemies, eliteEnemies,
    get bossEnemy()         { return bossEnemy; },
    get isBossWaveActive()  { return isBossWaveActive; },
    get autoMoveEnabled()   { return _autoMoveEnabled; },
    rpgSimState,
    getEffectiveEquippedIds,
    fluid,
    getTerrainState: () => topographicTerrainState,
    getNavGrid: () => rpgNavGrid,
    getVerdureCaveWallState: () => verdureCaveWallState,
  };
  const orbitProjectileCtx: OrbitProjectileCtx = {
    mote,
    get bossEnemy() { return bossEnemy; },
    enemies, sapphireEnemies, sapphireMissiles, emeraldEnemies,
    amberEnemies, amberShards, voidEnemies, quartzEnemies,
    rubyEnemies, sunstoneEnemies, citrineEnemies, ioliteEnemies,
    amethystEnemies, diamondEnemies, nullstoneEnemies,
    fracterylEnemies, eigensteinEnemies,
    eliteEnemies,
    hitEffects,
    damageEnemy, damageSapphireEnemy, damageMissile,
    damageEmeraldEnemy, damageAmberEnemy, damageAmberShard,
    damageVoidEnemy, damageQuartzEnemy, damageRubyEnemy,
    damageSunstoneEnemy, damageCitrineEnemy, damageIoliteEnemy,
    damageAmethystEnemy, damageDiamondEnemy, damageNullstoneEnemy,
    damageFracterylEnemy, damageEigensteinEnemy,
    damageEliteEnemy,
    damageBossEnemy: (raw, pierce) => bossWave.damageBossEnemy(raw, pierce),
    collectEnemyBodyTargets: () => collectEnemyBodyTargets(),
    damageBodyTarget: (target, raw, pierce, bypass) => damageBodyTarget(target, raw, pierce, bypass),
    spawnDamageNumber: (x, y, vx, vy, text, ratio, color) => spawnDamageNumber(x, y, vx, vy, text, ratio, color),
  };

  createRpgInput({
    canvas,
    dim,
    joystick,
    keys,
    getIsActive: () => _isActive,
    tryTargetEnemyAt,
    onZoneLabelTap: () => { zoneSelectPanel.open(); },
    getFieldSpace:  () => rpgFieldSpace,
    getSafeScale:   () => rpgSafeScale,
    getSafeOffsetX: () => rpgSafeOffsetX,
    getSafeOffsetY: () => rpgSafeOffsetY,
  });

  function clampEnemyToBounds(enemy: { x: number; y: number; vx: number; vy: number }): void {
    const ab = rpgFieldSpace.activeBounds;
    clampEnemyToBoundsHelper(enemy, ab.left, ab.top, ab.right, ab.bottom);
  }

  /** Flag set at the start of each update() call; drives auto-move logic. */
  let _autoMoveEnabled = false;

  // ── Enemy update context (shared reference object for rpg-enemy-updates) ──
  const enemyCtx: RpgEnemyCtx = {
    mote,
    dim,
    viewport,
    fluid,
    hitEffects,
    shotLines,
    dealDamageToPlayer,
    dealDamageToPlayerKnockback,
    clampEnemyToBounds,
    getFieldSpace: () => rpgFieldSpace,
    getTerrainState: () => topographicTerrainState,
    getNavGrid: () => rpgNavGrid,
    getVerdureCaveWallState: () => verdureCaveWallState,
  };

  // EliteEnemyCtx extends RpgEnemyCtx with the projectile arrays elites fire into.
  const eliteEnemyCtx: EliteEnemyCtx = {
    ...enemyCtx,
    quartzSpikes,
    rubyBolts,
    citrineBolts,
    amethystShards,
    diamondShards,
    voidTendrils,
  };

  // AlivenUpdateCtx: used each frame to update all aliven particle groups.
  const alivenUpdateCtx: AlivenUpdateCtx = {
    get playerX()         { return mote.x; },
    get playerY()         { return mote.y; },
    get playerRadius()    { return RPG_MOTE_SIZE / 2 + 1; },
    get playerIFramesMs() { return playerIFramesMs; },
    setPlayerIFramesMs(ms: number) { playerIFramesMs = ms; },
    get canvasW()         { return dim.w; },
    get canvasH()         { return dim.h; },
    get arenaLeft()       { return rpgFieldSpace.activeBounds.left; },
    get arenaTop()        { return rpgFieldSpace.activeBounds.top; },
    get arenaRight()      { return rpgFieldSpace.activeBounds.right; },
    get arenaBottom()     { return rpgFieldSpace.activeBounds.bottom; },
    dealContactDamageToPlayer(atk: number) {
      dealDamageToPlayerKnockback(atk, 0, 0);
    },
  };

  const bossCtx: BossUpdateCtx = {
    mote,
    dim,
    fluid,
    playerStats,
    bossProjectiles,
    getIsBossWaveActive: () => isBossWaveActive,
    getDanmakuSafeZone:  () => danmakuSafeZone,
    setDanmakuSafeZone:  (dz) => { danmakuSafeZone = dz; },
    getPlayerIFramesMs:  () => playerIFramesMs,
    setPlayerIFramesMs:  (n) => { playerIFramesMs = n; },
    spawnDamageNumber,
  };

  const bossAttackCtx: BossAttackUpdateCtx = {
    dim,
    get playerX() { return mote.x; },
    get playerY() { return mote.y; },
    playerStats,
    getPlayerIFramesMs:  () => playerIFramesMs,
    setPlayerIFramesMs:  (n) => { playerIFramesMs = n; },
    getIsBossWaveActive: () => isBossWaveActive,
    spawnDamageNumber: (x, y, dirX, dirY, text, ratio, color) =>
      spawnDamageNumber(x, y, dirX, dirY, text, ratio, color),
    setPlayerHp: (hp) => { playerStats.hp = hp; },
  };

  // ── Death / restart context ────────────────────────────────────
  const deathRestartCtx: RpgDeathRestartCtx = {
    getRpgPhase:       () => rpgPhase,
    setRpgPhase:       (p) => { rpgPhase = p; },
    getPhaseTimerMs:   () => phaseTimerMs,
    setPhaseTimerMs:   (ms) => { phaseTimerMs = ms; },
    getDeathAlpha:     () => deathAlpha,
    setDeathAlpha:     (v) => { deathAlpha = v; },
    getScreenDarken:   () => screenDarken,
    setScreenDarken:   (v) => { screenDarken = v; },
    getRestartFadeAlpha:   () => restartFadeAlpha,
    setRestartFadeAlpha:   (v) => { restartFadeAlpha = v; },
    setPlayerIFramesMs:    (ms) => { playerIFramesMs = ms; },
    deathParticles,
    mote, playerStats, playerMovementState,
    enemies, spawnQueue, sapphireEnemies, sapphireMissiles,
    emeraldEnemies, amberEnemies, amberShards, voidEnemies,
    quartzEnemies, quartzSpikes, rubyEnemies, rubyBolts,
    sunstoneEnemies, citrineEnemies, citrineBolts, ioliteEnemies,
    amethystEnemies, amethystShards, diamondEnemies, diamondShards,
    nullstoneEnemies, voidTendrils, fracterylEnemies, fracterylShards,
    eigensteinEnemies, eigensteinBeams, eliteEnemies, polyominoEnemies, fissilePolyominoEnemies, refractorPolyominoEnemies,
    binaryRingEnemies, binaryRingMissiles,
    nadirCubePointEnemies, nadirCubeMines, nadirCubeTrailSegments, nadirCubeTurretBolts, nadirCubeLinkLasers,
    stardustEnemies, horizonPentagonGroups, alivenGroups,
    dustWispEnemies, ribbonWormEnemies, lanternMothEnemies, eyeStalkEnemies,
    jellyfishEnemies, clothGhostEnemies, plantTurretEnemies, gearInsectEnemies,
    spiderCrawlerEnemies, moteSwarmEnemies, shadowHandEnemies,
    sandFishEnemies, quartzFishEnemies, rubyFishEnemies, sunstoneFishEnemies,
    emeraldFishEnemies, sapphireFishEnemies, amethystFishEnemies, diamondFishEnemies,
    plantProjectiles, fishMines, fishSpikes, fishBolts, fishDecoys,
    bossProjectiles, luckyMotes, luckyMotePopups, hitEffects, shotLines, damageNumbers,
    bossAttackState, weaponSystems, weaponAttackTimers,
    fluid: { reset: () => fluid.reset() },
    bossWave: { exitBossWave: () => bossWave.exitBossWave() },
    setBossEnemy:            (b) => { bossEnemy = b; },
    setBinaryLaserSweep:     (_sweep) => { binaryLaserSweep = null; },
    setDanmakuSafeZone:      (_dz) => { danmakuSafeZone = null; },
    setIsBossFightFromMenu:  (b) => { isBossFightFromMenu = b; },
    setBossHitsInRound:      (v) => { bossHitsInRound = v; },
    setCurrentWave:          (w) => { currentWave = w; rpgSimState.currentWaveByZone[rpgSimState.activeZoneId] = w; syncNadirEliteWave(w); },
    setIsInterWave:          (b) => { isInterWave = b; },
    setInterWaveTimerMs:     (ms) => { interWaveTimerMs = ms; },
    getWidthPx:              () => widthPx,
    getHeightPx:             () => heightPx,
    rpgSimState,
    applyEquipmentStats:     () => applyEquipmentStats(),
  };

  // ── Weapon tick context (wired to rpg-weapon-tick.ts) ──────────────
  const weaponTickCtx: WeaponTickCtx = {
    weaponSystems,
    statsPanel,
    rpgSimState,
    weaponAttackTimers,
    mote,
    getEffectiveEquippedIds,
    findEquippedWeaponIdByEffect,
    getWeaponSpdMultiplier,
    performWeaponAttack: (weaponId) => performWeaponAttack(weaponId),
    removeDeadEnemies:   () => waveManager.removeDeadEnemies(),
    checkWaveCompletion: () => waveManager.checkWaveCompletion(),
    getPrevSandBladePhase: () => prevSandBladePhase,
    setPrevSandBladePhase: (phase) => { prevSandBladePhase = phase; },
  };

  // ── Draw context (built once; getters always return current closure values) ─
  const drawFrameState = createRpgDrawFrameState();
  const drawCtx: RpgDrawCtx = {
    canvas2d: ctx,
    fluid: { render: (c) => fluid.render(c) },
    getWidthPx:   () => widthPx,
    getHeightPx:  () => heightPx,
    enemies, sapphireEnemies, sapphireMissiles, emeraldEnemies,
    amberEnemies, amberShards, voidEnemies, quartzEnemies, quartzSpikes,
    rubyEnemies, rubyBolts, sunstoneEnemies, citrineEnemies, citrineBolts,
    ioliteEnemies, amethystEnemies, amethystShards, diamondEnemies, diamondShards,
    nullstoneEnemies, voidTendrils, fracterylEnemies, fracterylShards,
    eigensteinEnemies, eigensteinBeams, eliteEnemies,
    polyominoEnemies, fissilePolyominoEnemies, refractorPolyominoEnemies,
    binaryRingEnemies, binaryRingMissiles,
    nadirCubePointEnemies, nadirCubeMines, nadirCubeTrailSegments, nadirCubeTurretBolts, nadirCubeLinkLasers,
    stardustEnemies, horizonPentagonGroups, alivenGroups,
    dustWispEnemies, ribbonWormEnemies, lanternMothEnemies, eyeStalkEnemies,
    jellyfishEnemies, clothGhostEnemies, plantTurretEnemies, gearInsectEnemies,
    spiderCrawlerEnemies, moteSwarmEnemies, shadowHandEnemies,
    sandFishEnemies, quartzFishEnemies, rubyFishEnemies, sunstoneFishEnemies,
    emeraldFishEnemies, sapphireFishEnemies, amethystFishEnemies, diamondFishEnemies,
    plantProjectiles, fishMines, fishSpikes, fishBolts, fishDecoys,
    verdurePlants,
    getBossEnemy:         () => bossEnemy,
    getDanmakuSafeZone:   () => danmakuSafeZone,
    bossProjectiles, bossAttackState, teleportParticles,
    bossStageDirectorState,
    weaponSystems, mote, joystick,
    hitEffects, shotLines, damageNumbers, luckyMotes, luckyMotePopups,
    deathParticles, weaponOrbitParticles,
    getOrbitProjectile:           () => orbitProjectile,
    getGlowMovementIntensity:     () => playerMovementState.glowMovementIntensity,
    getRpgPhase:                  () => rpgPhase,
    getDeathAlpha:                () => deathAlpha,
    getGlowTimeS:                 () => glowTimeS,
    getPlayerIFramesMs:           () => playerIFramesMs,
    getIsInterWave:               () => isInterWave,
    getCurrentWave:               () => currentWave,
    getInterWaveTimerMs:          () => interWaveTimerMs,
    getIsBossWaveActive:          () => isBossWaveActive,
    getScreenDarken:              () => screenDarken,
    getRestartFadeAlpha:          () => restartFadeAlpha,
    getIsLowGraphicsMode:         () => isLowGraphicsMode,
    getSoftImpetusAsteroidShadowsEnabled: () => _isDevMode && developerVisuals.softImpetusAsteroidShadows,
    getEnemyIndicatorStyle:       () => enemyIndicatorStyle,
    getTopographicTerrainState:   () => topographicTerrainState,
    getVerdureCaveWallState:      () => verdureCaveWallState,
    getEffectiveEquippedIds,
    getTargetedEnemy:             () => targeting.getTargetedEnemy(),
    rpgSimState,
    getNavGrid:                   () => rpgNavGrid,
    getPathfindingDebugEnabled:   () => _isDevMode && developerVisuals.pathfinding,
    getViewportDebugEnabled:      () => _isDevMode && developerVisuals.viewport,
    getVerdureWallDebugEnabled:   () => _isDevMode && developerVisuals.verdureWalls,
    getNadirAnchorDebugEnabled:   () => _isDevMode && developerVisuals.nadirAnchors,
    drawZoneBgOverlay:            (c2d, w, h, nowMs) => drawZoneBgOverlay(c2d, w, h, nowMs),
    getNadirCubeProjectionState:  () => nadirCubicGrid?.getProjectionState() ?? null,
    getZenithShakeOffset:         () => {
      if (rpgSimState.activeZoneId !== 'horizon' || rpgSimState.activeSubzoneId !== 'zenith') {
        return { x: 0, y: 0 };
      }
      return zenithBinaryHorizon?.getShakeOffset() ?? { x: 0, y: 0 };
    },
    getIsDevMode:                 () => _isDevMode,
    getRpgPixelatedRenderEnabled: () => _isDevMode && developerVisuals.rpgPixelatedRender,
    getCssDisplaySize:            () => ({ w: rpgCssW, h: rpgCssH }),
    getFullW:                     () => rpgFullW,
    getFullH:                     () => rpgFullH,
    getSafeOffsetX:               () => rpgSafeOffsetX,
    getSafeOffsetY:               () => rpgSafeOffsetY,
    getSafeScale:                 () => rpgSafeScale,
    getActiveZoneDisplayName:     () => getRpgZoneDisplayName(rpgSimState.activeZoneId),
    getWorldViewW:                () => rpgWorldViewW,
    getWorldViewH:                () => rpgWorldViewH,
    getFieldSpace:                () => rpgFieldSpace,
  };

  // ── Update context (wired to runRpgUpdate in rpg-render-update.ts) ───────────
  const enemyArrays: RpgEnemyUpdateArrays = {
    enemies, sapphireEnemies, sapphireMissiles, emeraldEnemies,
    amberEnemies, amberShards, voidEnemies, quartzEnemies, quartzSpikes,
    rubyEnemies, rubyBolts, sunstoneEnemies, citrineEnemies, citrineBolts,
    ioliteEnemies, amethystEnemies, amethystShards, diamondEnemies, diamondShards,
    nullstoneEnemies, voidTendrils, fracterylEnemies, fracterylShards,
    eigensteinEnemies, eigensteinBeams, eliteEnemies,
    polyominoEnemies, fissilePolyominoEnemies, refractorPolyominoEnemies,
    binaryRingEnemies, binaryRingMissiles,
    nadirCubePointEnemies, nadirCubeMines, nadirCubeTrailSegments, nadirCubeTurretBolts, nadirCubeLinkLasers,
    stardustEnemies, horizonPentagonGroups, alivenGroups,
    dustWispEnemies, ribbonWormEnemies, lanternMothEnemies, eyeStalkEnemies,
    jellyfishEnemies, clothGhostEnemies, plantTurretEnemies, gearInsectEnemies,
    spiderCrawlerEnemies, moteSwarmEnemies, shadowHandEnemies,
    sandFishEnemies, quartzFishEnemies, rubyFishEnemies, sunstoneFishEnemies,
    emeraldFishEnemies, sapphireFishEnemies, amethystFishEnemies, diamondFishEnemies,
    plantProjectiles, fishMines, fishSpikes, fishBolts, fishDecoys,
    teleportParticles, bossProjectiles, luckyMotes, luckyMotePopups,
  };
  const updateCtx: RpgUpdateCtx = {
    arrays: enemyArrays,
    getRpgPhase:            () => rpgPhase,
    getGlowTimeS:           () => glowTimeS,
    addGlowTimeS:           (v) => { glowTimeS += v; },
    setAutoMoveEnabled:     (v) => { _autoMoveEnabled = v; },
    getTopographicTerrainState: () => topographicTerrainState,
    deathRestartCtx,
    getIsInterWave:         () => isInterWave,
    getCurrentWave:         () => currentWave,
    getInterWaveTimerMs:    () => interWaveTimerMs,
    setInterWaveTimerMs:    (v) => { interWaveTimerMs = v; },
    startNextWave:          () => waveManager.startNextWave(),
    tickSpawnQueue:         (ms) => waveManager.tickSpawnQueue(ms),
    checkWaveCompletion:    () => waveManager.checkWaveCompletion(),
    movementCtx,
    playerMovementState,
    enemyCtx,
    eliteEnemyCtx,
    alivenUpdateCtx,
    getBossEnemy:           () => bossEnemy,
    getIsBossWaveActive:    () => isBossWaveActive,
    bossCtx,
    bossAttackState,
    bossAttackCtx,
    bossStageDirectorState,
    bossStageDirectorCtx,
    weaponOrbitCtx,
    getOrbitProjectile:     () => orbitProjectile,
    orbitProjectileCtx,
    weaponTickCtx,
    updateShotVisuals,
    updateDamageNumbers,
    spawnDamageNumber:      (x, y, vx, vy, text, ratio, color, sourceColor) => {
      spawnDamageNumber(x, y, vx, vy, text, ratio, color, sourceColor);
    },
    mote,
    rpgSimState,
    onLuckyMoteCollected:   options.onLuckyMoteCollected,
    playerStats,
    dealDamageToPlayer:     (damage) => { dealDamageToPlayer(damage); },
    triggerDeath:           () => _triggerDeath(deathRestartCtx),
    getPlayerIFramesMs:     () => playerIFramesMs,
    setPlayerIFramesMs:     (ms) => { playerIFramesMs = ms; },
    statsPanel,
    fluid,
    drawCtx,
    drawFrameState,
    getBinaryLaserSweep:    () => binaryLaserSweep,
    setBinaryLaserSweep:    (sweep) => { binaryLaserSweep = sweep; },
    updateAndGetNadirCubeProjectionState: (nowMs) => updateAndGetNadirCubeProjectionState(nowMs),
    getNadirCubeProjectionState: () => {
      const state = nadirCubicGrid?.getProjectionState();
      return state ?? null;
    },
    updateVerdurePlants(deltaMs: number): void {
      if (rpgSimState.activeZoneId !== 'verdure') return;
      // Tick spawn (only during active combat, not during inter-wave or boss phases)
      if (!isInterWave && rpgPhase === 'alive') {
        tickVerdurePlantSpawn(
          verdurePlants, deltaMs, currentWave,
          widthPx, heightPx, isLowGraphicsMode, verdureCaveWallState,
        );
      }
      _updateVerdurePlants(verdurePlants, mote.x, mote.y, deltaMs);
    },
  };

  // ── Deferred caustics prewarm ─────────────────────────────────────────────
  // If the active zone at startup is already 'caustics', pre-generate all
  // caustic tiles before the first rendered frame.  A zero-delay timeout
  // defers the ~10–60 ms generation work until after the current synchronous
  // init path completes, keeping startup fast.
  if (rpgSimState.activeZoneId === 'caustics') {
    setTimeout(() => prewarmCausticsTextures(), 0);
  }

  return {
    canvas,
    statsPanel: statsPanel.element,
    menuButtonContainer: statsPanel.menuButtonContainer,

    update(deltaMs: number, autoMoveEnabled = false): void {
      runRpgUpdate(updateCtx, deltaMs, autoMoveEnabled);
    },

    resize(cont: HTMLElement): void {
      doResize(cont);
      rebuildVerdureBoundsForResize();
      const half = RPG_MOTE_SIZE / 2;
      const ab = rpgFieldSpace.activeBounds;
      mote.x = Math.max(ab.left + half, Math.min(ab.right  - half, mote.x));
      mote.y = Math.max(ab.top  + half, Math.min(ab.bottom - half, mote.y));
    },

    setActive(active: boolean): void {
      _isActive = active;
      if (!active) { keys.left = keys.right = keys.up = keys.down = false; }
      if (active) {
        applyEquipmentStats();
        if (currentWave === 0 && rpgPhase === 'alive') {
          isInterWave = true;
          interWaveTimerMs = INTER_WAVE_DELAY_MS * 0.4;
        }
      }
    },

    notifyEquip(): void {
      applyEquipmentStats();
      // Sync companion ships to match equipped weapon tiers
      weaponSystems.syncSapphireShips();
      weaponSystems.syncAmethystShips();
    },

    devJumpToWave(wave: number): void {
      const savedRespawnWave = rpgSimState.respawnWave;
      rpgSimState.respawnWave = Math.max(0, wave - 1);
      _doRestart(deathRestartCtx);
      rpgSimState.respawnWave = savedRespawnWave;
      interWaveTimerMs = 0;
    },

    respawnNow(): void {
      _doRestart(deathRestartCtx);
      rpgPhase = 'restarting'; phaseTimerMs = 0; restartFadeAlpha = 0;
    },

    setLowGraphicsMode(enabled: boolean): void {
      isLowGraphicsMode = enabled;
      fluid.setLowGraphicsMode(enabled);
      setBossAttacksLowGraphics(enabled);
      setAllDrawLowGraphics(enabled);
    },

    setScreenShakeEnabled(enabled: boolean): void {
      zenithBinaryHorizon?.setScreenShakeEnabled(enabled);
    },

    setEnemyIndicatorStyle(style: 'triangle' | 'outline' | 'off'): void {
      enemyIndicatorStyle = style;
    },

    startBossFight(bossId: number): void {
      bossWave.startBossFight(bossId);
    },

    setNumberFormat(format: NumberFormat): void {
      currentNumberFormat = format;
    },

    setDevMode(enabled: boolean): void {
      _isDevMode = enabled;
      statsPanel.setDevMode(enabled);
      setTopographyLightingDevMode(enabled && developerVisuals.topographyLighting);
      bossStageDirectorState.isDevMode = enabled && developerVisuals.bossStage;
    },

    setInvincibilityMode(enabled: boolean): void {
      isInvincibilityMode = enabled;
    },

    setTopographicTerrainDebugEnabled(enabled: boolean): void {
      setTopographicTerrainDevMode(enabled);
    },

    setDeveloperVisuals(options): void {
      developerVisuals.viewport = options.viewport;
      developerVisuals.pathfinding = options.pathfinding;
      developerVisuals.verdureWalls = options.verdureWalls;
      developerVisuals.nadirAnchors = options.nadirAnchors;
      developerVisuals.bossStage = options.bossStage;
      developerVisuals.topographyLighting = options.topographyLighting;
      developerVisuals.softImpetusAsteroidShadows = options.softImpetusAsteroidShadows;
      developerVisuals.rpgPixelatedRender = options.rpgPixelatedRender;
      bossStageDirectorState.isDevMode = _isDevMode && developerVisuals.bossStage;
      setTopographyLightingDevMode(_isDevMode && developerVisuals.topographyLighting);
    },

    setSharpTopographyShadows(enabled: boolean): void {
      // Switching mode invalidates the terrain lighting cache on next render.
      setTopographyShadowMode(enabled ? 'sharpCylinder' : 'smoothGradient');
    },

    devSpawnAliven(variantId: string): void {
      if (alivenGroups.length >= MAX_ACTIVE_ALIVEN_GROUPS) return;
      const vid = (ALIVEN_VARIANTS as readonly string[]).includes(variantId)
        ? variantId as AlivenVariantId
        : 'aliven_spark_cluster';
      const margin = 30;
      const edge = Math.floor(Math.random() * 4);
      const sb = rpgFieldSpace.spawnBounds;
      let spawnX = 0, spawnY = 0;
      if      (edge === 0) { spawnX = sb.left + margin + Math.random() * (sb.width  - margin * 2); spawnY = sb.top + margin; }
      else if (edge === 1) { spawnX = sb.left + margin + Math.random() * (sb.width  - margin * 2); spawnY = sb.bottom - margin; }
      else if (edge === 2) { spawnX = sb.left + margin; spawnY = sb.top + margin + Math.random() * (sb.height - margin * 2); }
      else                 { spawnX = sb.right - margin; spawnY = sb.top + margin + Math.random() * (sb.height - margin * 2); }
      alivenGroups.push(makeAlivenGroup(vid, spawnX, spawnY, currentWave));
    },

    devClearAliven(): void {
      alivenGroups.length = 0;
    },

    getAlivenGroupCount(): number {
      return alivenGroups.length;
    },
  };
}
