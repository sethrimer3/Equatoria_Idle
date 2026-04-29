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
  getXpPerKill, formatXp, getRpgSpeedMultiplier, getRpgUpgradeLevel,
  getScaledWeaponDamage, getScaledWeaponCooldown, getWaveStatScale, getBossXpMultiplier,
  getLuckPercent, formatLuckPercent,
  addXpWithAllocation, getEffectiveXpAtkBonus, getEffectiveXpDefBonus,
} from '../../sim/rpg/rpg-state';
import { getWaveDefinition } from '../../data/rpg/wave-definitions';
import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import { TIER_BY_ID } from '../../data/tiers';
import type { TierId } from '../../data/tiers';
import { createRpgFluid } from './rpg-fluid';
import { createDamageFns } from './rpg-damage';
import {
  RPG_TRAIL_CAPACITY, MAX_RPG_SPEED, RPG_VELOCITY_DAMPING, RPG_MOTE_SIZE, RPG_MOTE_COLOR, RPG_MOTE_GLOW,
  TRAIL_SPEED_THRESHOLD, GLOW_PULSE_SPEED, GLOW_MOVE_RAMP_UP, GLOW_MOVE_RAMP_DOWN, MIN_TRAIL_DISTANCE,
  PLAYER_HP_INIT, PLAYER_ATK_INIT, PLAYER_DEF_INIT,
  JOYSTICK_OUTER_RADIUS, JOYSTICK_THUMB_RADIUS,
  LASER_ENEMY_SIZE, LASER_ENEMY_COLOR, LASER_ENEMY_GLOW,
  INTER_WAVE_DELAY_MS, DEATH_ANIM_DURATION_MS, DEATH_HOLD_DURATION_MS, RESTART_FADE_IN_MS,
  DEATH_BURST_COUNT, DEATH_PARTICLE_COLORS,
  PLAYER_BASE_COOLDOWN_MS, PLAYER_BASE_RANGE_PX, HIT_EFFECT_DURATION_MS,
  BASE_ATTACK_TIMER_KEY, SHOT_LINE_DURATION_MS, TARGET_FRAME_MS, IFRAME_FLICKER_INTERVAL_MS,
  DAMAGE_NUM_DURATION_MS, DAMAGE_NUM_MIN_FONT_PX, DAMAGE_NUM_MAX_FONT_PX,
  DAMAGE_NUM_INITIAL_SPEED, DAMAGE_NUM_DECEL, PLAYER_IFRAME_MIN_MS, PLAYER_IFRAME_MAX_ADD_MS, PLAYER_KNOCKBACK_MAX,
  AUTO_MOVE_JOYSTICK_DEAD_ZONE,
  WEAPON_PARTICLE_ORBIT_SPEED, WEAPON_PARTICLE_ORBIT_RADIUS, WEAPON_PARTICLE_MIN_SPEED,
  ORBIT_PROJ_SPEED_RAD, ORBIT_PROJ_RADIUS, ORBIT_PROJ_TRAIL_CAP,
  WEAPON_ORBIT_TRAIL_CAP, ORBIT_PROJ_HIT_RADIUS, ORBIT_PROJ_DAMAGE, ORBIT_PROJ_HIT_CD_MS,
  SAPPHIRE_ENEMY_SIZE, SAPPHIRE_ENEMY_GLOW,
  SAPPHIRE_SHIELD_RADIUS,
  MISSILE_SIZE,
  SAND_PROJ_SPEED, SAND_PROJ_SIZE, SAND_PROJ_LIFE_MS, SAND_PROJ_COLOR, CHAIN_NODES, CHAIN_NODE_COLOR,
  CHAIN_LASH_MS, CHAIN_RETRACT_MS, CHAIN_HIT_CD_MS,
  CHAIN_REST_LENGTH, CHAIN_SPRING_K, CHAIN_ANCHOR_K, CHAIN_RETRACT_ANCHOR_K,
  CHAIN_DAMPING, CHAIN_LASH_SPEED,
  LASER_BEAM_VISIBLE_MS, LASER_BEAM_COLOR, LASER_BEAM_GLOW, VORTEX_PULL_STRENGTH, VORTEX_DAMAGE_INTERVAL_MS, VORTEX_SPAWN_DIST,
  VORTEX_COLOR, VORTEX_SPIN_RATE,
  SWORD_SWING_MS, SWORD_COLOR, SWORD_PRISMATIC_COLORS,
  SWORD_SHARD_COUNT, SWORD_HINGE_SPRING_K, SWORD_HINGE_DAMPING,
  SWORD_SHARD_FOLLOW_BASE, SWORD_SHARD_FOLLOW_DECAY,
  SWORD_BEAM_DURATION_MS, SWORD_SWIPE_VISUAL_MS,
  SWORD_FLUID_DRAG_STR, SWORD_FLUID_SWIPE_STR, SWORD_DEFAULT_COOLDOWN_MS,
  SWORD_COMBO_THRESHOLD, SWORD_COMBO_SPIN_TURNS,
  SWORD_COMBO_SPIN_MS, SWORD_COMBO_DAMAGE_MULT, SWORD_COMBO_RANGE_MULT,
  POISON_ARMOR_IGNORE_PER_TIER, POISON_DURATION_BASE_TIER, POISON_DURATION_MS_PER_TIER,
  POISON_TOTAL_MULTIPLIER, POISON_BOLT_SPEED, POISON_BOLT_SIZE, POISON_BOLT_COLOR,
  POISON_BOLT_LIFE_MS, POISON_BOLT_TRAIL_CAP, POISON_TICK_INTERVAL_MS,
  EMERALD_ENEMY_SIZE, EMERALD_ENEMY_GLOW,
  AMBER_ENEMY_SIZE, AMBER_ENEMY_GLOW,
  AMBER_SHARD_SIZE,
  VOID_ENEMY_SIZE, VOID_ENEMY_GLOW,
  QUARTZ_ENEMY_SIZE, QUARTZ_ENEMY_GLOW,
  QUARTZ_SPIKE_SIZE,
  RUBY_ENEMY_SIZE, RUBY_ENEMY_GLOW,
  RUBY_BOLT_SIZE,
  SUNSTONE_ENEMY_SIZE, SUNSTONE_ENEMY_GLOW,
  CITRINE_ENEMY_SIZE, CITRINE_ENEMY_GLOW,
  CITRINE_BOLT_SIZE,
  IOLITE_ENEMY_SIZE, IOLITE_ENEMY_GLOW,
  AMETHYST_ENEMY_SIZE, AMETHYST_ENEMY_GLOW,
  AMETHYST_SHARD_SIZE,
  DIAMOND_ENEMY_SIZE, DIAMOND_ENEMY_GLOW,
  DIAMOND_SHARD_SIZE,
  NULLSTONE_ENEMY_SIZE, NULLSTONE_ENEMY_GLOW,
  VOID_TENDRIL_SIZE,
  LASER_XP_MULT, SAPPHIRE_XP_MULT, EMERALD_XP_MULT, AMBER_XP_MULT, VOID_XP_MULT,
  QUARTZ_XP_MULT, RUBY_XP_MULT, SUNSTONE_XP_MULT, CITRINE_XP_MULT,
  IOLITE_XP_MULT, AMETHYST_XP_MULT, DIAMOND_XP_MULT, NULLSTONE_XP_MULT,
  BOSS_SIZE_BASE,
  BOSS_GLOW_COLORS, BOSS_NAMES,
  BOSS_GLYPH_LABEL,
  FLUID_VEL_FRAME_TO_PX_S, FLUID_PLAYER_STRENGTH,
  FLUID_PROJECTILE_STRENGTH, FLUID_LASER_BEAM_STRENGTH,
  FLUID_EXPLOSION_STRENGTH,
  FLUID_LASER_R, FLUID_LASER_G, FLUID_LASER_B,
  FLUID_SAPPH_R, FLUID_SAPPH_G, FLUID_SAPPH_B,
  FLUID_PLAYER_R, FLUID_PLAYER_G, FLUID_PLAYER_B,
  FLUID_MISSILE_R, FLUID_MISSILE_G, FLUID_MISSILE_B,
  FLUID_SAND_R, FLUID_SAND_G, FLUID_SAND_B,
  FLUID_CHAIN_R, FLUID_CHAIN_G, FLUID_CHAIN_B,
  FLUID_BEAM_R, FLUID_BEAM_G, FLUID_BEAM_B,
  FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B,
  FLUID_AMBER_R, FLUID_AMBER_G, FLUID_AMBER_B,
  FLUID_VOID_R, FLUID_VOID_G, FLUID_VOID_B,
  FLUID_QUARTZ_R, FLUID_QUARTZ_G, FLUID_QUARTZ_B,
  FLUID_RUBY_R, FLUID_RUBY_G, FLUID_RUBY_B,
  FLUID_SUNSTONE_R, FLUID_SUNSTONE_G, FLUID_SUNSTONE_B,
  FLUID_CITRINE_R, FLUID_CITRINE_G, FLUID_CITRINE_B,
  FLUID_IOLITE_R, FLUID_IOLITE_G, FLUID_IOLITE_B,
  FLUID_AMETHYST_R, FLUID_AMETHYST_G, FLUID_AMETHYST_B,
  FLUID_DIAMOND_R, FLUID_DIAMOND_G, FLUID_DIAMOND_B,
  FLUID_NULLSTONE_R, FLUID_NULLSTONE_G, FLUID_NULLSTONE_B,
  FLUID_FRACTERYL_R, FLUID_FRACTERYL_G, FLUID_FRACTERYL_B,
  FLUID_EIGENSTEIN_R, FLUID_EIGENSTEIN_G, FLUID_EIGENSTEIN_B,
  FRACTERYL_ENEMY_GLOW,
  FRACTERYL_ENEMY_SIZE,
  EIGENSTEIN_ENEMY_GLOW,
  EIGENSTEIN_ENEMY_SIZE,
  FRACTERYL_XP_MULT, EIGENSTEIN_XP_MULT,
  EMERALD_MISSILE_SPEED, EMERALD_MISSILE_MAX_SPEED, EMERALD_MISSILE_SEEK_STR,
  EMERALD_MISSILE_TRAIL_CAP, EMERALD_MISSILE_COLOR, EMERALD_MISSILE_HIT_RADIUS,
  EMERALD_MISSILE_PROXIMITY_PX, EMERALD_MISSILE_DETECT_PX, EMERALD_MISSILE_NO_TARGET_MS,
  EMERALD_MISSILE_FIZZLE_DRAG, EMERALD_MISSILE_STOP_SPEED,
  EMERALD_MISSILE_SUB_BASE, EMERALD_MISSILE_SUB_PER_TIER,
  EMERALD_SUB_MISSILE_SPEED, EMERALD_SUB_MISSILE_MAX_SPEED, EMERALD_SUB_MISSILE_SEEK_STR,
  EMERALD_SUB_MISSILE_TRAIL_CAP, EMERALD_SUB_MISSILE_HIT_RADIUS,
  EMERALD_SUB_MISSILE_SQUIGGLE, EMERALD_SUB_MISSILE_SQUIGGLE_HZ,
  EMERALD_SUB_MISSILE_DETECT_PX,
  EMERALD_SUB_MISSILE_FUEL_MS, EMERALD_SUB_MISSILE_DECEL_START_MS,
  EMERALD_SUB_MISSILE_FIZZLE_DRAG, EMERALD_SUB_MISSILE_STOP_SPEED,
  EMERALD_SUB_MISSILE_POST_STOP_DELAY_MS,
  EMERALD_SUB_MISSILE_AOE_PX, EMERALD_SUB_MISSILE_DAMAGE_MULT,
  EMERALD_SUB_MISSILE_CONE_SPREAD,
  EMERALD_SWIRL_COUNT, EMERALD_SWIRL_LIFE_MS, EMERALD_SWIRL_SPEED, EMERALD_SWIRL_DRAG,
  SUNSTONE_MINE_FUSE_MS, SUNSTONE_MINE_PROXIMITY_PX, SUNSTONE_MINE_AOE_BASE_PX,
  SUNSTONE_MINE_AOE_PER_TIER_PX, SUNSTONE_MINE_HP, SUNSTONE_MINE_SIZE,
  SAPPHIRE_SHIP_FIRE_MS, SAPPHIRE_SHIP_ORBIT_RADIUS, SAPPHIRE_SHIP_MAX_SPEED,
  SAPPHIRE_SHIP_LASER_RANGE, SAPPHIRE_SHIP_TRAIL_CAP,
  SAPPHIRE_LASER_SPEED, SAPPHIRE_LASER_LIFE_MS, SAPPHIRE_LASER_HIT_RADIUS,
  SAPPHIRE_LASER_TRAIL_CAP, SAPPHIRE_LASER_COLOR, SAPPHIRE_LASER_GLOW, SAPPHIRE_LASER_SPREAD_RAD,
  SAPPHIRE_LASER_CURVE_RATE, SAPPHIRE_LASER_LATERAL_VEL, SAPPHIRE_LASER_LATERAL_DECAY,
  AMETHYST_SHIP_FIRE_MS, AMETHYST_SHIP_ORBIT_RADIUS, AMETHYST_SHIP_MAX_SPEED, AMETHYST_SHIP_TRAIL_CAP,
  AMETHYST_LASER_DAMAGE_MULT, AMETHYST_LASER_INITIAL_RADIUS,
  AMETHYST_LASER_ANGULAR_SPEED, AMETHYST_LASER_DURATION_MS, AMETHYST_LASER_HIT_RADIUS, AMETHYST_LASER_TRAIL_CAP,
  AMETHYST_LASER_COLOR, AMETHYST_LASER_GLOW,
} from './rpg-constants';
import {
  drawSapphireEnemies, drawSapphireMissiles,
  drawEmeraldEnemies,
  drawAmberEnemies, drawAmberShards,
  drawVoidEnemies,
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
  setLowGraphicsMode as setEnemyLowGraphics,
} from './rpg-enemy-draw';
import {
  drawBossProjectiles,
  drawSandProjectiles,
  drawPoisonBolts,
  drawLaserBeamEffect,
  drawDeathParticles, drawShotLines, drawHitEffects, drawDamageNumbers,
  drawAttackTrail,
  drawWeaponOrbitParticle, drawOrbitProjectile,
  drawEmeraldPlayerMissiles, drawEmeraldSubMissiles, drawEmeraldSwirlParticles, drawSunstoneMines,
  drawSapphireShips, drawSapphireLasers,
  drawAmethystShips, drawAmethystLasers,
  drawTargetReticle,
  setLowGraphicsMode as setEntityLowGraphics,
} from './rpg-entity-draw';
import type {
  RpgMote, RpgJoystick, RpgKeyState, RpgPlayerStats,
  LaserEnemy,
  RpgPhase, DeathParticle, SpawnEntry, HitEffect, ShotLine, DamageNumber,
  WeaponOrbitParticle, OrbitProjectile,
  SapphireEnemy, SapphireMissile, SandProjectile,
  ChainWhipState, LaserBeamEffect,
  NullstoneVortex, VortexWeaponState,
  SwordComboState,
  IolitePoisonBolt, PoisonDebuff,
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
  EmeraldPlayerMissile, EmeraldSubMissile, EmeraldSwirlParticle,
  SunstoneMine,
  SapphireShip, SapphireLaser,
  AmethystShip, AmethystLaser,
  LuckyMote, LuckyMotePopup,
} from './rpg-types';
import {
  makeLaserEnemy, makeSapphireEnemy,
  makeEmeraldEnemy, makeAmberEnemy, makeVoidEnemy,
  makeQuartzEnemy, makeRubyEnemy,
  makeSunstoneEnemy, makeCitrineEnemy, makeIoliteEnemy,
  makeAmethystEnemy, makeDiamondEnemy,
  makeNullstoneEnemy,
  makeFracterylEnemy,
  makeEigensteinEnemy, makeBossEnemy,
} from './rpg-factories';
import {
  chainNodeRadius, chainNodeInvMass,
  getSwordLength, getShardDistances, wrapAngleDiff,
  getVortexTierRadius, getVortexTierDurationMs, getVortexCount,
} from './rpg-helpers';
import { drawChainWhip, drawVortexes, drawSwordCombos, setLowGraphicsMode as setWeaponLowGraphics } from './rpg-weapon-draw';
import {
  trySpawnLuckyMote, updateLuckyMotes, updateLuckyMotePopups,
  drawLuckyMotes, drawLuckyMotePopups,
} from './rpg-lucky-motes';
import { drawBossEnemy, drawBottomSafeZone, drawDanmakuSafeZone, drawWaveClearBanner, setLowGraphicsMode as setBossLowGraphics } from './rpg-boss-draw';
import {
  type RpgEnemyCtx,
  updateEmeraldEnemies,
  updateAmberEnemies, updateAmberShards,
  updateVoidEnemies,
  updateQuartzEnemies, updateQuartzSpikes,
  updateRubyEnemies, updateRubyBolts,
  updateSunstoneEnemies,
  updateCitrineEnemies, updateCitrineBolts,
} from './rpg-enemy-updates';
import {
  updateLaserEnemies,
  updateSapphireEnemies, updateSapphireMissiles,
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
import {
  type BossUpdateCtx,
  updateBossEnemy,
  updateBossProjectiles,
} from './rpg-boss-update';

// ── Dynamic internal resolution ───────────────────────────────────
// These are updated by resize() to match the container's client dimensions.
// The default values kick in before the first resize() call.
let INTERNAL_WIDTH  = 320;
let INTERNAL_HEIGHT = 568;

export interface RpgRender {
  canvas: HTMLCanvasElement;
  statsPanel: HTMLElement;
  update(deltaMs: number, autoMoveEnabled?: boolean): void;
  resize(container: HTMLElement): void;
  setActive(active: boolean): void;
  /** Re-reads rpgSimState.equippedWeaponIds and immediately updates playerStats ATK/DEF + weapon particles. */
  notifyEquip(): void;
  /** Dev-mode only: immediately jump to the given wave number (must be multiple of 10). */
  devJumpToWave(wave: number): void;
  /** Immediately restart at the current respawnWave with the visual restart transition. */
  respawnNow(): void;
  /** Enable/disable low graphics mode (skips glows and expensive effects). */
  setLowGraphicsMode(enabled: boolean): void;
  /** Sets enemy indicator style for RPG enemies. */
  setEnemyIndicatorStyle(style: 'triangle' | 'outline' | 'off'): void;
  /** Launch a boss fight for the given 1-based bossId from the RPG menu. */
  startBossFight(bossId: number): void;
}

/** Options passed to createRpgRender. */
export interface RpgRenderOptions {
  /**
   * Called when the player collects a lucky mote drop.
   * @param tierId  The mote tier that was collected.
   * @param bonusPct  The percentage bonus to apply to that tier's mote total (e.g. 0.5 = +0.5%).
   */
  onLuckyMoteCollected?: (tierId: TierId, bonusPct: number) => void;
}

export function createRpgRender(container: HTMLElement, rpgSimState: RpgSimState, options: RpgRenderOptions = {}): RpgRender {

  const canvas = document.createElement('canvas');
  canvas.id = 'rpg-canvas';
  canvas.style.imageRendering = 'pixelated';
  canvas.style.touchAction = 'none';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d')!;
  let widthPx  = INTERNAL_WIDTH;
  let heightPx = INTERNAL_HEIGHT;
  let isLowGraphicsMode = false;
  let enemyIndicatorStyle: 'triangle' | 'outline' | 'off' = 'triangle';

  // ── Shared dimensions box (kept in sync with widthPx/heightPx on resize) ──
  // Passed to rpg-enemy-updates functions via RpgEnemyCtx so they always see
  // current canvas bounds without requiring a closure rebuild.
  const dim = { w: widthPx, h: heightPx };

  // ── Euler fluid background ─────────────────────────────────────
  const fluid = createRpgFluid();

  function doResize(cont: HTMLElement): void {
    const w = cont.clientWidth  || INTERNAL_WIDTH;
    const h = cont.clientHeight || INTERNAL_HEIGHT;
    if (w !== widthPx || h !== heightPx) {
      // Update module-level defaults so newly spawned entities use correct bounds.
      INTERNAL_WIDTH  = w;
      INTERNAL_HEIGHT = h;
      widthPx  = w;
      heightPx = h;
      dim.w = w;
      dim.h = h;
    }
    canvas.width  = widthPx;
    canvas.height = heightPx;
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
  const playerStats: RpgPlayerStats = { hp: PLAYER_HP_INIT, maxHp: PLAYER_HP_INIT, atk: PLAYER_ATK_INIT, def: PLAYER_DEF_INIT };

  let glowMovementIntensity = 0;
  let currentWave      = 0;
  let interWaveTimerMs = 0;
  let isInterWave      = true;
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

  // ── Sapphire enemies, missiles, and new weapon state ──────────
  const sapphireEnemies: SapphireEnemy[]  = [];
  const sapphireMissiles: SapphireMissile[] = [];
  const sandProjectiles: SandProjectile[] = [];
  /** Chain whip states keyed by weaponId (for each equipped chainWhip weapon). */
  const chainWhipStates: Map<string, ChainWhipState> = new Map();
  let laserBeamEffect: LaserBeamEffect | null = null;

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

  // ── Vortex weapon state ────────────────────────────────────────
  const activeVortexes: NullstoneVortex[]                = [];
  const vortexWeaponStates: Map<string, VortexWeaponState> = new Map();

  // ── Diamond sword combo state ──────────────────────────────────
  const swordComboStates: Map<string, SwordComboState> = new Map();

  // ── Iolite poison bolt state ───────────────────────────────────
  const poisonBolts: IolitePoisonBolt[]            = [];
  const poisonDebuffs: Map<object, PoisonDebuff>   = new Map();

  // ── Emerald player missiles (heat-seeking) ─────────────────────
  const emeraldPlayerMissiles: EmeraldPlayerMissile[] = [];
  const emeraldSubMissiles: EmeraldSubMissile[]       = [];
  const emeraldSwirlParticles: EmeraldSwirlParticle[] = [];

  // ── Sunstone mines ─────────────────────────────────────────────
  const sunstoneMines: SunstoneMine[] = [];

  // ── Sapphire companion ships and lasers ───────────────────────
  const sapphireShips: SapphireShip[] = [];
  const sapphireLasers: SapphireLaser[] = [];

  // ── Amethyst companion ships and lasers ───────────────────────
  const amethystShips: AmethystShip[] = [];
  const amethystLasers: AmethystLaser[] = [];

  // ── Lucky mote drops (luck mechanic) ─────────────────────────
  const luckyMotes: LuckyMote[] = [];
  const luckyMotePopups: LuckyMotePopup[] = [];

  /**
   * Cached luck percentage — updated whenever XP changes.
   * Avoids calling Math.log10 on every enemy death in hot combat.
   */
  let _cachedLuckXp = -1;
  let _cachedLuckPct = 0;

  function getCachedLuckPercent(): number {
    if (rpgSimState.xp !== _cachedLuckXp) {
      _cachedLuckXp = rpgSimState.xp;
      _cachedLuckPct = getLuckPercent(rpgSimState.xp);
    }
    return _cachedLuckPct;
  }

  /** The currently targeted enemy object, or null for automatic targeting. */
  let targetedEnemy: object | null = null;

  // ── DPS tracking state ────────────────────────────────────────
  /** Sliding window of damage events for per-equipped-weapon DPS calculation. */
  const dpsWindow: Array<{ t: number; dmg: number; weaponId: string }> = [];
  const DPS_WINDOW_MS = 10000;
  const DPS_DOM_UPDATE_MS = 1000;
  const DPS_AXIS_LERP = 0.18;
  let activeDamageWeaponId: string | null = null;
  let lastDpsDomUpdateMs = 0;
  let lastDpsEquipKey = '';
  let dpsAxisMin = 0;
  let dpsAxisMax = 1;

  function findEquippedWeaponIdByEffect(effectKind: string): string | null {
    for (const weaponId of getEffectiveEquippedIds()) {
      const wd = WEAPON_BY_ID.get(weaponId);
      if (wd?.stats.effect?.kind === effectKind) return weaponId;
    }
    return null;
  }

  function withDamageSource<T>(weaponId: string | null, fn: () => T): T {
    const previous = activeDamageWeaponId;
    activeDamageWeaponId = weaponId;
    try {
      return fn();
    } finally {
      activeDamageWeaponId = previous;
    }
  }

  /** Records a damage event for DPS tracking. */
  function recordDps(dmg: number, _legacyColor = '#fff'): void {
    void _legacyColor;
    if (dmg > 0 && activeDamageWeaponId !== null) {
      dpsWindow.push({ t: Date.now(), dmg, weaponId: activeDamageWeaponId });
    }
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
  } = createDamageFns({ recordDps });

  // ── Aim direction tracker (updated each physics frame) ────────
  let playerAimAngle = -Math.PI / 2;  // default: upward

  let bossEnemy: BossEnemy | null = null;
  let danmakuSafeZone: DanmakuSafeZone | null = null;
  const bossProjectiles: BossProjectile[] = [];
  /** Counts successive diamond-blade hits on the boss; resets to 0 after every teleport. */
  let bossHitsInRound = 0;
  /** True when the current boss fight was launched from the RPG menu. */
  let isBossFightFromMenu = false;

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
   * otherwise it is the player's actual equipped set.
   */
  function getEffectiveEquippedIds(): Set<string> {
    return (isBossWaveActive && bossActiveEquipIds !== null)
      ? bossActiveEquipIds
      : rpgSimState.equippedWeaponIds;
  }

  const teleportParticles: TeleportParticle[] = [];

  /** Safe zone position: bottom-middle of playing field. */
  function getSafeZoneX(): number { return widthPx / 2; }
  function getSafeZoneY(): number { return heightPx * 0.85; }

  const TELEPORT_PRISMATIC_COLORS = ['#e8f0fa', '#ffffff', '#b0c8ff', '#d6aaff', '#a0f0d0', '#fff4a0'];

  function teleportPlayerToSafeZone(): void {
    const tx = getSafeZoneX(), ty = getSafeZoneY();
    // Spawn comet trail particles fanning from current player position toward the safe zone
    for (let i = 0; i < 20; i++) {
      const t = i / 20;
      const px = mote.x + (tx - mote.x) * t + (Math.random() - 0.5) * 14;
      const py = mote.y + (ty - mote.y) * t + (Math.random() - 0.5) * 14;
      const angle = Math.atan2(ty - mote.y, tx - mote.x) + (Math.random() - 0.5) * 0.7;
      const spd = 1.2 + Math.random() * 2.5;
      teleportParticles.push({
        x: px, y: py,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        alpha: 0.85 + Math.random() * 0.15,
        color: TELEPORT_PRISMATIC_COLORS[Math.floor(Math.random() * TELEPORT_PRISMATIC_COLORS.length)],
      });
    }
    mote.x = tx; mote.y = ty;
    mote.vx = 0; mote.vy = 0;
    mote.trailHead = 0; mote.trailCount = 0;
    playerIFramesMs = 1400; // brief invulnerability after teleport
    bossHitsInRound = 0; // reset hit counter for the next engagement
    if (bossEnemy) {
      bossEnemy.isFiringPaused = false;
      bossEnemy.attackTimerMs = Math.max(bossEnemy.attackTimerMs, 450);
      bossEnemy.secondaryTimerMs = Math.max(bossEnemy.secondaryTimerMs, 650);
    }
  }

  function enterBossWave(): void {
    if (isBossWaveActive) return;
    isBossWaveActive = true;
    // Save weapon tiers so we can restore them after the boss fight.
    bossPreWaveWeaponTiers = new Map(rpgSimState.weaponTiersByWeaponId);
    // Override active weapons to diamond_bastion at tier 1 for boss combat.
    // The player's rpgSimState.equippedWeaponIds is intentionally NOT modified,
    // so equip actions, saves, and the weapons UI are unaffected.
    bossActiveEquipIds = new Set(['diamond_bastion']);
    rpgSimState.weaponTiersByWeaponId.set('diamond_bastion', 1);
    // Move player to safe zone at bottom-middle
    mote.x = getSafeZoneX(); mote.y = getSafeZoneY();
    mote.vx = 0; mote.vy = 0;
    mote.trailHead = 0; mote.trailCount = 0;
    playerIFramesMs = 1000;
    applyEquipmentStats();
  }

  function exitBossWave(): void {
    if (!isBossWaveActive) return;
    isBossWaveActive = false;
    // Clear the boss-fight weapon override before rebuilding stats.
    bossActiveEquipIds = null;
    // Restore weapon tiers that may have been overridden during the boss fight.
    for (const [id, tier] of bossPreWaveWeaponTiers) {
      rpgSimState.weaponTiersByWeaponId.set(id, tier);
    }
    bossPreWaveWeaponTiers = new Map();
    teleportParticles.length = 0;
    applyEquipmentStats();
  }

  function startBossFight(bossId: number): void {
    if (isBossWaveActive) return;
    const waveForScaling = Math.max(bossId * 100, rpgSimState.highestWaveReached);
    bossEnemy = makeBossEnemy(bossId, waveForScaling, widthPx, heightPx);
    isBossFightFromMenu = true;
    enterBossWave();
  }

  // ── Equipped weapon visual particles (one per equipped weapon) ────
  const weaponOrbitParticles: WeaponOrbitParticle[] = [];

  // ── Per-weapon attack timers ───────────────────────────────────
  const weaponAttackTimers: Map<string, number> = new Map();

  function buildWeaponOrbitParticle(weaponId: string, startAngle: number): WeaponOrbitParticle | null {
    const weaponDef = WEAPON_BY_ID.get(weaponId);
    if (!weaponDef) return null;
    const tierDef = TIER_BY_ID.get(weaponDef.costTierId);
    const color     = tierDef?.color     ?? '#ffd764';
    const glowColor = tierDef?.glowColor ?? '#ffe599';
    const tier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const size = Math.max(1, tier);
    return {
      angle: startAngle,
      x: mote.x + Math.cos(startAngle) * WEAPON_PARTICLE_ORBIT_RADIUS,
      y: mote.y + Math.sin(startAngle) * WEAPON_PARTICLE_ORBIT_RADIUS,
      trailX: new Float64Array(WEAPON_ORBIT_TRAIL_CAP),
      trailY: new Float64Array(WEAPON_ORBIT_TRAIL_CAP),
      trailHead: 0, trailCount: 0,
      color, glowColor, size,
    };
  }

  // ── Orbiting projectile upgrade ───────────────────────────────
  let orbitProjectile: OrbitProjectile | null = null;

  function buildOrbitProjectile(): OrbitProjectile | null {
    const hasUpgrade = getRpgUpgradeLevel(rpgSimState, 'orbit_projectile') >= 1;
    if (!hasUpgrade) return null;
    return {
      angle: Math.PI,   // start on the opposite side from weapon particle
      x: mote.x - ORBIT_PROJ_RADIUS,
      y: mote.y,
      trailX: new Float64Array(ORBIT_PROJ_TRAIL_CAP),
      trailY: new Float64Array(ORBIT_PROJ_TRAIL_CAP),
      trailHead: 0, trailCount: 0,
      hitCooldowns: new Map(),
    };
  }

  function applyEquipmentStats(): void {
    const effectiveIds = getEffectiveEquippedIds();
    // Aggregate DEF from all equipped weapons.
    let totalDefBonus = 0;
    for (const weaponId of effectiveIds) {
      const weaponDef = WEAPON_BY_ID.get(weaponId);
      if (weaponDef) totalDefBonus += weaponDef.stats.defBonus;
    }
    playerStats.def = PLAYER_DEF_INIT + totalDefBonus + getEffectiveXpDefBonus(rpgSimState);
    // Player ATK is the base multiplier (not including per-weapon tier damage).
    playerStats.atk = PLAYER_ATK_INIT + getEffectiveXpAtkBonus(rpgSimState);

    // Rebuild weapon orbit particles (one per equipped weapon, evenly spaced).
    weaponOrbitParticles.length = 0;
    const equippedIds = Array.from(effectiveIds);
    const angleStep = equippedIds.length > 0 ? (2 * Math.PI) / equippedIds.length : 0;
    for (let i = 0; i < equippedIds.length; i++) {
      const p = buildWeaponOrbitParticle(equippedIds[i], i * angleStep);
      if (p) weaponOrbitParticles.push(p);
    }

    // Remove chain whip states for weapons that are no longer effectively equipped.
    for (const weaponId of Array.from(chainWhipStates.keys())) {
      if (!effectiveIds.has(weaponId)) chainWhipStates.delete(weaponId);
    }
    // Remove vortex weapon states for unequipped weapons.
    for (const weaponId of Array.from(vortexWeaponStates.keys())) {
      if (!effectiveIds.has(weaponId)) vortexWeaponStates.delete(weaponId);
    }
    // Remove sword combo states for unequipped weapons.
    for (const weaponId of Array.from(swordComboStates.keys())) {
      if (!effectiveIds.has(weaponId)) swordComboStates.delete(weaponId);
    }
    // Remove attack timers for unequipped weapons.
    for (const weaponId of Array.from(weaponAttackTimers.keys())) {
      if (!effectiveIds.has(weaponId)) weaponAttackTimers.delete(weaponId);
    }

    orbitProjectile = buildOrbitProjectile();
    syncSapphireShips();
    syncAmethystShips();
  }

  function damageBossEnemy(rawDamage: number, defPierceRatio: number, fromDiamondBlade = false): number {
    const boss = bossEnemy;
    if (!boss) return 0;
    if (boss.isInvuln || (boss.bossId === 8 && boss.isAbsorbing)) return 0;
    // During a boss wave only the diamond_bastion (swordCombo blade) can deal damage
    if (isBossWaveActive && !fromDiamondBlade) {
      const glowC = BOSS_GLOW_COLORS[Math.min(boss.bossId, BOSS_GLOW_COLORS.length - 1)];
      spawnDamageNumber(boss.x, boss.y, 0, -1, '∞', 0.3, glowC);
      return 0;
    }
    if (boss.shieldHp > 0) {
      const shieldDmg = Math.min(boss.shieldHp, rawDamage);
      boss.shieldHp -= shieldDmg;
      recordDps(shieldDmg, '#ffd700');
      return shieldDmg;
    }
    const effectiveDef = boss.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    boss.hp = Math.max(0, boss.hp - dmg);
    if (dmg > 0) {
      recordDps(dmg, '#ffd700');
      boss.isFiringPaused = true;
      if (isBossWaveActive) {
        // Allow SWORD_COMBO_THRESHOLD hits before teleporting — gives the player
        // exactly enough hits to build up and complete the 4-hit spin combo.
        bossHitsInRound += 1;
        if (bossHitsInRound >= SWORD_COMBO_THRESHOLD) {
          boss.danmakuLevel += 1;
          teleportPlayerToSafeZone(); // resets bossHitsInRound to 0
        }
      }
    }
    return dmg;
  }

  /**
   * Spawns a floating damage/blocked number at (x, y) travelling in (dirX, dirY).
   * `ratio` is dmg / maxHp clamped to [0, 1] and controls font size.
   */
  function spawnDamageNumber(
    x: number, y: number,
    dirX: number, dirY: number,
    text: string,
    ratio: number,
    color: string,
  ): void {
    const clampedRatio = Math.min(1, Math.max(0, ratio));
    const fontPx = DAMAGE_NUM_MIN_FONT_PX + clampedRatio * (DAMAGE_NUM_MAX_FONT_PX - DAMAGE_NUM_MIN_FONT_PX);
    const initialSpeed  = DAMAGE_NUM_INITIAL_SPEED * (0.5 + clampedRatio * 0.5);
    damageNumbers.push({
      x, y,
      vx: dirX * initialSpeed,
      vy: dirY * initialSpeed,
      text,
      fontPx: Math.max(DAMAGE_NUM_MIN_FONT_PX, fontPx),
      color,
      timerMs: DAMAGE_NUM_DURATION_MS,
    });
  }

  /** Registers a hit-flash and shot-line visual for one target position, and spawns a damage number. */
  function spawnHitVisualsAt(tx: number, ty: number, maxHp: number, dmg: number, color: string): void {
    hitEffects.push({ x: tx, y: ty, timerMs: HIT_EFFECT_DURATION_MS, color });
    shotLines.push({ x1: mote.x, y1: mote.y, x2: tx, y2: ty, timerMs: SHOT_LINE_DURATION_MS, color });
    const dx = tx - mote.x, dy = ty - mote.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let dirX = dist > 0.01 ? dx / dist : 0;
    let dirY = dist > 0.01 ? dy / dist : -1;
    // Apply ±15° random angle deviation with triangular distribution (lower probability at extremes).
    // Summing two uniform [0,1] random numbers and subtracting 1 gives a triangular distribution
    // on [-1, 1], making extreme angles (±15°) less likely than small deviations near 0.
    const deviation = (Math.random() + Math.random() - 1) * (Math.PI / 12);
    const cosD = Math.cos(deviation), sinD = Math.sin(deviation);
    const rotX = dirX * cosD - dirY * sinD;
    const rotY = dirX * sinD + dirY * cosD;
    dirX = rotX; dirY = rotY;
    if (dmg <= 0) {
      spawnDamageNumber(tx, ty, dirX, dirY, 'BLOCKED', 0.25, '#74c0fc');
    } else {
      spawnDamageNumber(tx, ty, dirX, dirY, String(Math.round(dmg)), dmg / maxHp, '#ffffff');
    }
  }

  /** Registers a hit-flash and shot-line visual for one laser enemy, and spawns a damage number. */
  function spawnHitVisuals(enemy: LaserEnemy, dmg: number, color: string): void {
    spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, color);
  }

  // ── Closest-target helpers ─────────────────────────────────────

  /** Represents any targetable entity. */
  type TargetKind = 'laser' | 'sapphire' | 'missile' | 'emerald' | 'amber' | 'ambershard' | 'void'
    | 'quartz' | 'quartzspike' | 'ruby' | 'rubybolt' | 'sunstone' | 'citrine' | 'citrinebolt'
    | 'iolite' | 'amethyst' | 'amethystshard' | 'diamond' | 'diamondshard' | 'nullstone' | 'voidtendril'
    | 'fracteryl' | 'fracterylshard' | 'eigenstein'
    | 'boss';
  interface ClosestTarget {
    kind: TargetKind;
    x: number; y: number;
    distSq: number;
    laser?: LaserEnemy;
    sapphire?: SapphireEnemy;
    missile?: SapphireMissile;
    emerald?: EmeraldEnemy;
    amber?: AmberEnemy;
    ambershard?: AmberShard;
    void?: VoidEnemy;
    quartz?: QuartzEnemy;
    quartzspike?: QuartzSpike;
    ruby?: RubyEnemy;
    rubybolt?: RubyBolt;
    sunstone?: SunstoneEnemy;
    citrine?: CitrineEnemy;
    citrinebolt?: CitrineBolt;
    iolite?: IoliteEnemy;
    amethyst?: AmethystEnemy;
    amethystshard?: AmethystShard;
    diamond?: DiamondEnemy;
    diamondshard?: DiamondShard;
    nullstone?: NullstoneEnemy;
    voidtendril?: VoidTendril;
    fracteryl?: FracterylEnemy;
    fracterylshard?: FracterylShard;
    eigenstein?: EigensteinEnemy;
    boss?: BossEnemy;
  }

  /**
   * Returns the closest targetable entity within rangeSq squared distance.
   * Returns null if nothing is in range.
   */
  function findClosestTarget(rangeSq: number): ClosestTarget | null {
    let best: ClosestTarget | null = null;
    let bestSq = rangeSq;

    for (const e of enemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'laser', x: e.x, y: e.y, distSq: d, laser: e }; }
    }
    for (const e of sapphireEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'sapphire', x: e.x, y: e.y, distSq: d, sapphire: e }; }
    }
    for (const m of sapphireMissiles) {
      const dx = m.x - mote.x, dy = m.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'missile', x: m.x, y: m.y, distSq: d, missile: m }; }
    }
    for (const e of emeraldEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'emerald', x: e.x, y: e.y, distSq: d, emerald: e }; }
    }
    for (const e of amberEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'amber', x: e.x, y: e.y, distSq: d, amber: e }; }
    }
    for (const s of amberShards) {
      const dx = s.x - mote.x, dy = s.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'ambershard', x: s.x, y: s.y, distSq: d, ambershard: s }; }
    }
    for (const e of voidEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'void', x: e.x, y: e.y, distSq: d, void: e }; }
    }
    for (const e of quartzEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'quartz', x: e.x, y: e.y, distSq: d, quartz: e }; }
    }
    for (const s of quartzSpikes) {
      const dx = s.x - mote.x, dy = s.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'quartzspike', x: s.x, y: s.y, distSq: d, quartzspike: s }; }
    }
    for (const e of rubyEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'ruby', x: e.x, y: e.y, distSq: d, ruby: e }; }
    }
    for (const b of rubyBolts) {
      const dx = b.x - mote.x, dy = b.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'rubybolt', x: b.x, y: b.y, distSq: d, rubybolt: b }; }
    }
    for (const e of sunstoneEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'sunstone', x: e.x, y: e.y, distSq: d, sunstone: e }; }
    }
    for (const e of citrineEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'citrine', x: e.x, y: e.y, distSq: d, citrine: e }; }
    }
    for (const b of citrineBolts) {
      const dx = b.x - mote.x, dy = b.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'citrinebolt', x: b.x, y: b.y, distSq: d, citrinebolt: b }; }
    }
    for (const e of ioliteEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'iolite', x: e.x, y: e.y, distSq: d, iolite: e }; }
    }
    for (const e of amethystEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'amethyst', x: e.x, y: e.y, distSq: d, amethyst: e }; }
    }
    for (const s of amethystShards) {
      const dx = s.x - mote.x, dy = s.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'amethystshard', x: s.x, y: s.y, distSq: d, amethystshard: s }; }
    }
    for (const e of diamondEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'diamond', x: e.x, y: e.y, distSq: d, diamond: e }; }
    }
    for (const s of diamondShards) {
      const dx = s.x - mote.x, dy = s.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'diamondshard', x: s.x, y: s.y, distSq: d, diamondshard: s }; }
    }
    for (const e of nullstoneEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'nullstone', x: e.x, y: e.y, distSq: d, nullstone: e }; }
    }
    for (const t of voidTendrils) {
      const dx = t.x - mote.x, dy = t.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'voidtendril', x: t.x, y: t.y, distSq: d, voidtendril: t }; }
    }
    for (const e of fracterylEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'fracteryl', x: e.x, y: e.y, distSq: d, fracteryl: e }; }
    }
    for (const s of fracterylShards) {
      const dx = s.x - mote.x, dy = s.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'fracterylshard', x: s.x, y: s.y, distSq: d, fracterylshard: s }; }
    }
    for (const e of eigensteinEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'eigenstein', x: e.x, y: e.y, distSq: d, eigenstein: e }; }
    }
    if (bossEnemy) {
      const dx = bossEnemy.x - mote.x, dy = bossEnemy.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'boss', x: bossEnemy.x, y: bossEnemy.y, distSq: d, boss: bossEnemy }; }
    }
    return best;
  }

  /** Returns the closest enemy body (not projectiles) within rangeSq. */
  function findClosestEnemy(rangeSq: number): LaserEnemy | SapphireEnemy | EmeraldEnemy | AmberEnemy | VoidEnemy
    | QuartzEnemy | RubyEnemy | SunstoneEnemy | CitrineEnemy | IoliteEnemy | AmethystEnemy | DiamondEnemy | NullstoneEnemy
    | FracterylEnemy | EigensteinEnemy | BossEnemy | null {
    let bestSq = rangeSq;
    let best: LaserEnemy | SapphireEnemy | EmeraldEnemy | AmberEnemy | VoidEnemy
      | QuartzEnemy | RubyEnemy | SunstoneEnemy | CitrineEnemy | IoliteEnemy | AmethystEnemy | DiamondEnemy | NullstoneEnemy
      | FracterylEnemy | EigensteinEnemy | BossEnemy | null = null;
    for (const e of enemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of sapphireEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of emeraldEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of amberEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of voidEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of quartzEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of rubyEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of sunstoneEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of citrineEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of ioliteEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of amethystEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of diamondEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of nullstoneEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of fracterylEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of eigensteinEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    if (bossEnemy) {
      const dx = bossEnemy.x - mote.x, dy = bossEnemy.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = bossEnemy; }
    }
    return best;
  }

  // ── Tap-to-target system ───────────────────────────────────────

  /**
   * Given a tap position, finds the closest enemy body (not projectile) within
   * Manual targeting is currently disabled by design; sapphire ships use
   * nearest-enemy targeting.
   */
  function tryTargetEnemyAt(tapX: number, tapY: number): void {
    void tapX;
    void tapY;
    targetedEnemy = null;
  }

  /**
   * Returns the currently targeted enemy if it's still alive, or falls back to
   * closest enemy from player. Automatically clears stale targets.
   */
  function getTargetedEnemy(): ClosestTarget | null {
    // Validate existing target is still alive
    if (targetedEnemy) {
      // Check all enemy arrays to see if target still exists
      const isAlive =
        enemies.includes(targetedEnemy as LaserEnemy) ||
        sapphireEnemies.includes(targetedEnemy as SapphireEnemy) ||
        emeraldEnemies.includes(targetedEnemy as EmeraldEnemy) ||
        amberEnemies.includes(targetedEnemy as AmberEnemy) ||
        voidEnemies.includes(targetedEnemy as VoidEnemy) ||
        quartzEnemies.includes(targetedEnemy as QuartzEnemy) ||
        rubyEnemies.includes(targetedEnemy as RubyEnemy) ||
        sunstoneEnemies.includes(targetedEnemy as SunstoneEnemy) ||
        citrineEnemies.includes(targetedEnemy as CitrineEnemy) ||
        ioliteEnemies.includes(targetedEnemy as IoliteEnemy) ||
        amethystEnemies.includes(targetedEnemy as AmethystEnemy) ||
        diamondEnemies.includes(targetedEnemy as DiamondEnemy) ||
        nullstoneEnemies.includes(targetedEnemy as NullstoneEnemy) ||
        fracterylEnemies.includes(targetedEnemy as FracterylEnemy) ||
        eigensteinEnemies.includes(targetedEnemy as EigensteinEnemy) ||
        (bossEnemy === targetedEnemy);

      if (!isAlive) {
        targetedEnemy = null;
      } else {
        // Build a ClosestTarget from the targeted enemy
        const e = targetedEnemy as { x: number; y: number };
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const distSq = dx * dx + dy * dy;

        if (enemies.includes(targetedEnemy as LaserEnemy)) {
          return { kind: 'laser', x: e.x, y: e.y, distSq, laser: targetedEnemy as LaserEnemy };
        }
        if (sapphireEnemies.includes(targetedEnemy as SapphireEnemy)) {
          return { kind: 'sapphire', x: e.x, y: e.y, distSq, sapphire: targetedEnemy as SapphireEnemy };
        }
        if (emeraldEnemies.includes(targetedEnemy as EmeraldEnemy)) {
          return { kind: 'emerald', x: e.x, y: e.y, distSq, emerald: targetedEnemy as EmeraldEnemy };
        }
        if (amberEnemies.includes(targetedEnemy as AmberEnemy)) {
          return { kind: 'amber', x: e.x, y: e.y, distSq, amber: targetedEnemy as AmberEnemy };
        }
        if (voidEnemies.includes(targetedEnemy as VoidEnemy)) {
          return { kind: 'void', x: e.x, y: e.y, distSq, void: targetedEnemy as VoidEnemy };
        }
        if (quartzEnemies.includes(targetedEnemy as QuartzEnemy)) {
          return { kind: 'quartz', x: e.x, y: e.y, distSq, quartz: targetedEnemy as QuartzEnemy };
        }
        if (rubyEnemies.includes(targetedEnemy as RubyEnemy)) {
          return { kind: 'ruby', x: e.x, y: e.y, distSq, ruby: targetedEnemy as RubyEnemy };
        }
        if (sunstoneEnemies.includes(targetedEnemy as SunstoneEnemy)) {
          return { kind: 'sunstone', x: e.x, y: e.y, distSq, sunstone: targetedEnemy as SunstoneEnemy };
        }
        if (citrineEnemies.includes(targetedEnemy as CitrineEnemy)) {
          return { kind: 'citrine', x: e.x, y: e.y, distSq, citrine: targetedEnemy as CitrineEnemy };
        }
        if (ioliteEnemies.includes(targetedEnemy as IoliteEnemy)) {
          return { kind: 'iolite', x: e.x, y: e.y, distSq, iolite: targetedEnemy as IoliteEnemy };
        }
        if (amethystEnemies.includes(targetedEnemy as AmethystEnemy)) {
          return { kind: 'amethyst', x: e.x, y: e.y, distSq, amethyst: targetedEnemy as AmethystEnemy };
        }
        if (diamondEnemies.includes(targetedEnemy as DiamondEnemy)) {
          return { kind: 'diamond', x: e.x, y: e.y, distSq, diamond: targetedEnemy as DiamondEnemy };
        }
        if (nullstoneEnemies.includes(targetedEnemy as NullstoneEnemy)) {
          return { kind: 'nullstone', x: e.x, y: e.y, distSq, nullstone: targetedEnemy as NullstoneEnemy };
        }
        if (fracterylEnemies.includes(targetedEnemy as FracterylEnemy)) {
          return { kind: 'fracteryl', x: e.x, y: e.y, distSq, fracteryl: targetedEnemy as FracterylEnemy };
        }
        if (eigensteinEnemies.includes(targetedEnemy as EigensteinEnemy)) {
          return { kind: 'eigenstein', x: e.x, y: e.y, distSq, eigenstein: targetedEnemy as EigensteinEnemy };
        }
        if (bossEnemy === targetedEnemy) {
          return { kind: 'boss', x: e.x, y: e.y, distSq, boss: bossEnemy };
        }
      }
    }

    // Fallback to closest enemy body from the player.
    return findClosestEnemyFrom(mote.x, mote.y, Infinity);
  }

  function collectEnemyBodyTargets(): ClosestTarget[] {
    const targets: ClosestTarget[] = [];
    const addTarget = <T extends { x: number; y: number }>(
      kind: TargetKind,
      enemy: T,
      key: keyof ClosestTarget,
    ) => {
      const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
      targets.push({ kind, x: enemy.x, y: enemy.y, distSq: dx * dx + dy * dy, [key]: enemy } as ClosestTarget);
    };
    for (const e of enemies) addTarget('laser', e, 'laser');
    for (const e of sapphireEnemies) addTarget('sapphire', e, 'sapphire');
    for (const e of emeraldEnemies) addTarget('emerald', e, 'emerald');
    for (const e of amberEnemies) addTarget('amber', e, 'amber');
    for (const e of voidEnemies) addTarget('void', e, 'void');
    for (const e of quartzEnemies) addTarget('quartz', e, 'quartz');
    for (const e of rubyEnemies) addTarget('ruby', e, 'ruby');
    for (const e of sunstoneEnemies) addTarget('sunstone', e, 'sunstone');
    for (const e of citrineEnemies) addTarget('citrine', e, 'citrine');
    for (const e of ioliteEnemies) addTarget('iolite', e, 'iolite');
    for (const e of amethystEnemies) addTarget('amethyst', e, 'amethyst');
    for (const e of diamondEnemies) addTarget('diamond', e, 'diamond');
    for (const e of nullstoneEnemies) addTarget('nullstone', e, 'nullstone');
    for (const e of fracterylEnemies) addTarget('fracteryl', e, 'fracteryl');
    for (const e of eigensteinEnemies) addTarget('eigenstein', e, 'eigenstein');
    if (bossEnemy) addTarget('boss', bossEnemy, 'boss');
    return targets;
  }

  function findClosestEnemyFrom(x: number, y: number, rangeSq: number): ClosestTarget | null {
    let best: ClosestTarget | null = null;
    let bestSq = rangeSq;
    for (const target of collectEnemyBodyTargets()) {
      const dx = target.x - x, dy = target.y - y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) {
        bestSq = d;
        best = { ...target, distSq: d };
      }
    }
    return best;
  }

  function damageBodyTarget(target: ClosestTarget, rawDamage: number, defPierceRatio: number, bypassShield: boolean): number {
    if (target.laser) return damageEnemy(target.laser, rawDamage, defPierceRatio);
    if (target.sapphire) return damageSapphireEnemy(target.sapphire, rawDamage, defPierceRatio, bypassShield);
    if (target.emerald) return damageEmeraldEnemy(target.emerald, rawDamage, defPierceRatio);
    if (target.amber) return damageAmberEnemy(target.amber, rawDamage, defPierceRatio);
    if (target.void) return damageVoidEnemy(target.void, rawDamage, defPierceRatio);
    if (target.quartz) return damageQuartzEnemy(target.quartz, rawDamage, defPierceRatio);
    if (target.ruby) return damageRubyEnemy(target.ruby, rawDamage, defPierceRatio);
    if (target.sunstone) return damageSunstoneEnemy(target.sunstone, rawDamage, defPierceRatio);
    if (target.citrine) return damageCitrineEnemy(target.citrine, rawDamage, defPierceRatio);
    if (target.iolite) return damageIoliteEnemy(target.iolite, rawDamage, defPierceRatio);
    if (target.amethyst) return damageAmethystEnemy(target.amethyst, rawDamage, defPierceRatio, bypassShield);
    if (target.diamond) return damageDiamondEnemy(target.diamond, rawDamage, defPierceRatio);
    if (target.nullstone) return damageNullstoneEnemy(target.nullstone, rawDamage, defPierceRatio);
    if (target.fracteryl) return damageFracterylEnemy(target.fracteryl, rawDamage, defPierceRatio);
    if (target.eigenstein) return damageEigensteinEnemy(target.eigenstein, rawDamage, defPierceRatio);
    if (target.boss) return damageBossEnemy(rawDamage, defPierceRatio);
    return 0;
  }

  // ── Sand gatling projectile system ─────────────────────────────

  function spawnSandProjectile(targetX: number, targetY: number, damage: number): void {
    const dx = targetX - mote.x, dy = targetY - mote.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) return;
    sandProjectiles.push({
      x: mote.x, y: mote.y,
      vx: (dx / dist) * SAND_PROJ_SPEED,
      vy: (dy / dist) * SAND_PROJ_SPEED,
      lifeMs: SAND_PROJ_LIFE_MS,
      scaledDamage: damage,
    });
  }

  function updateSandProjectiles(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);

    for (let i = sandProjectiles.length - 1; i >= 0; i--) {
      const p = sandProjectiles[i];
      const damage = p.scaledDamage;
      p.lifeMs -= deltaMs;
      if (p.lifeMs <= 0) { sandProjectiles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;

      // Inject sand-projectile motion into fluid.
      fluid.addForce({
        x: p.x, y: p.y,
        vx: p.vx * FLUID_VEL_FRAME_TO_PX_S,
        vy: p.vy * FLUID_VEL_FRAME_TO_PX_S,
        r: FLUID_SAND_R, g: FLUID_SAND_G, b: FLUID_SAND_B,
        strength: FLUID_PROJECTILE_STRENGTH,
      });

      // Bounds check
      if (p.x < 0 || p.x > widthPx || p.y < 0 || p.y > heightPx) {
        sandProjectiles.splice(i, 1); continue;
      }

      // Collision with laser enemies
      let hit = false;
      for (const e of enemies) {
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < (LASER_ENEMY_SIZE * 2) ** 2) {
          const dmg = damageEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with sapphire enemies
      for (const e of sapphireEnemies) {
        const hitR = SAPPHIRE_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageSapphireEnemy(e, damage, 0, false);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with missiles
      for (const m of sapphireMissiles) {
        const dx = p.x - m.x, dy = p.y - m.y;
        if (dx * dx + dy * dy < (MISSILE_SIZE * 2.5) ** 2) {
          const dmg = damageMissile(m, damage);
          spawnHitVisualsAt(m.x, m.y, m.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); break;
        }
      }
      if (hit) continue;

      // Collision with emerald enemies
      for (const e of emeraldEnemies) {
        const hitR = EMERALD_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageEmeraldEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with amber enemies
      for (const e of amberEnemies) {
        const hitR = AMBER_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageAmberEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with amber shards
      for (const s of amberShards) {
        const dx = p.x - s.x, dy = p.y - s.y;
        if (dx * dx + dy * dy < (AMBER_SHARD_SIZE * 2.5) ** 2) {
          const dmg = damageAmberShard(s, damage);
          spawnHitVisualsAt(s.x, s.y, s.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with void enemies
      for (const e of voidEnemies) {
        const hitR = VOID_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageVoidEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); break;
        }
      }
      if (hit) continue;

      // Collision with quartz enemies
      for (const e of quartzEnemies) {
        const hitR = QUARTZ_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageQuartzEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with quartz spikes
      for (const s of quartzSpikes) {
        const dx = p.x - s.x, dy = p.y - s.y;
        if (dx * dx + dy * dy < (QUARTZ_SPIKE_SIZE * 2.5) ** 2) {
          damageQuartzSpike(s, damage);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with ruby enemies
      for (const e of rubyEnemies) {
        const hitR = RUBY_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageRubyEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with ruby bolts
      for (const b of rubyBolts) {
        const dx = p.x - b.x, dy = p.y - b.y;
        if (dx * dx + dy * dy < (RUBY_BOLT_SIZE * 2.5) ** 2) {
          damageRubyBolt(b, damage);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with sunstone enemies
      for (const e of sunstoneEnemies) {
        const hitR = SUNSTONE_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageSunstoneEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with citrine enemies
      for (const e of citrineEnemies) {
        const hitR = CITRINE_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageCitrineEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with citrine bolts
      for (const b of citrineBolts) {
        const dx = p.x - b.x, dy = p.y - b.y;
        if (dx * dx + dy * dy < (CITRINE_BOLT_SIZE * 2.5) ** 2) {
          damageCitrineBolt(b, damage);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with iolite enemies
      for (const e of ioliteEnemies) {
        const hitR = IOLITE_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageIoliteEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with amethyst enemies
      for (const e of amethystEnemies) {
        const hitR = AMETHYST_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageAmethystEnemy(e, damage, 0, false);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with amethyst shards
      for (const s of amethystShards) {
        const dx = p.x - s.x, dy = p.y - s.y;
        if (dx * dx + dy * dy < (AMETHYST_SHARD_SIZE * 2.5) ** 2) {
          damageAmethystShard(s, damage);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with diamond enemies
      for (const e of diamondEnemies) {
        const hitR = DIAMOND_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageDiamondEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with diamond shards
      for (const s of diamondShards) {
        const dx = p.x - s.x, dy = p.y - s.y;
        if (dx * dx + dy * dy < (DIAMOND_SHARD_SIZE * 2.5) ** 2) {
          damageDiamondShard(s, damage);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with nullstone enemies
      for (const e of nullstoneEnemies) {
        const hitR = NULLSTONE_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageNullstoneEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with void tendrils
      for (const t of voidTendrils) {
        const dx = p.x - t.x, dy = p.y - t.y;
        if (dx * dx + dy * dy < (VOID_TENDRIL_SIZE * 2.5) ** 2) {
          damageVoidTendril(t, damage);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with fracteryl enemies and shards
      for (const e of fracterylEnemies) {
        const hitR = FRACTERYL_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageFracterylEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;
      for (const s of fracterylShards) {
        const dx = p.x - s.x, dy = p.y - s.y;
        if (dx * dx + dy * dy < (FRACTERYL_ENEMY_SIZE * 0.5 + SAND_PROJ_SIZE) ** 2) {
          damageFracterylShard(s, damage);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with eigenstein enemies
      for (const e of eigensteinEnemies) {
        const hitR = EIGENSTEIN_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageEigensteinEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with boss
      if (bossEnemy) {
        const bossHitSize = BOSS_SIZE_BASE + bossEnemy.bossId * 1.5;
        const hitR = bossHitSize / 2 + SAND_PROJ_SIZE;
        const dx = p.x - bossEnemy.x, dy = p.y - bossEnemy.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageBossEnemy(damage, 0);
          if (dmg > 0) spawnHitVisualsAt(bossEnemy.x, bossEnemy.y, bossEnemy.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1);
        }
      }
    }
  }


  // ── Quartz chain whip system ───────────────────────────────────

  function buildChainWhip(weaponId: string): ChainWhipState {
    const nodesX  = new Float64Array(CHAIN_NODES);
    const nodesY  = new Float64Array(CHAIN_NODES);
    const nodesVx = new Float64Array(CHAIN_NODES);
    const nodesVy = new Float64Array(CHAIN_NODES);
    for (let i = 0; i < CHAIN_NODES; i++) { nodesX[i] = mote.x; nodesY[i] = mote.y; }
    const weaponDef = WEAPON_BY_ID.get(weaponId);
    return {
      phase: 'idle',
      phaseMs: 0,
      cooldownMs: weaponDef?.stats.cooldownMs ?? 2500,
      targetX: mote.x, targetY: mote.y,
      nodesX, nodesY, nodesVx, nodesVy,
      hitCooldowns: new Map(),
    };
  }

  function updateChainWhipCooldowns(ws: ChainWhipState, deltaMs: number): void {
    for (const [key, cd] of ws.hitCooldowns) {
      const next = cd - deltaMs;
      if (next <= 0) ws.hitCooldowns.delete(key);
      else ws.hitCooldowns.set(key, next);
    }
  }

  /**
   * Advances the softbody spring physics for all chain nodes.
   * anchorK controls how strongly node 0 is pulled toward the player.
   */
  function stepChainPhysics(ws: ChainWhipState, dt: number, anchorK: number): void {
    // Node 0: spring anchor toward player (rest length 0)
    ws.nodesVx[0] += (mote.x - ws.nodesX[0]) * anchorK * chainNodeInvMass(0) * dt;
    ws.nodesVy[0] += (mote.y - ws.nodesY[0]) * anchorK * chainNodeInvMass(0) * dt;

    // Spring forces between adjacent pairs
    for (let i = 0; i < CHAIN_NODES - 1; i++) {
      const sdx = ws.nodesX[i + 1] - ws.nodesX[i];
      const sdy = ws.nodesY[i + 1] - ws.nodesY[i];
      const sdist = Math.sqrt(sdx * sdx + sdy * sdy);
      if (sdist < 0.001) continue;
      const stretch = sdist - CHAIN_REST_LENGTH;
      const fx = (sdx / sdist) * stretch * CHAIN_SPRING_K;
      const fy = (sdy / sdist) * stretch * CHAIN_SPRING_K;
      ws.nodesVx[i]     += fx * chainNodeInvMass(i)     * dt;
      ws.nodesVy[i]     += fy * chainNodeInvMass(i)     * dt;
      ws.nodesVx[i + 1] -= fx * chainNodeInvMass(i + 1) * dt;
      ws.nodesVy[i + 1] -= fy * chainNodeInvMass(i + 1) * dt;
    }

    // Integrate positions + apply damping
    const dampFactor = Math.pow(CHAIN_DAMPING, dt);
    for (let i = 0; i < CHAIN_NODES; i++) {
      ws.nodesVx[i] *= dampFactor;
      ws.nodesVy[i] *= dampFactor;
      ws.nodesX[i] += ws.nodesVx[i] * dt;
      ws.nodesY[i] += ws.nodesVy[i] * dt;
    }
  }

  function updateChainWhip(weaponId: string, deltaMs: number): void {
    const weaponDef = WEAPON_BY_ID.get(weaponId);
    if (!weaponDef || weaponDef.stats.effect?.kind !== 'chainWhip') {
      chainWhipStates.delete(weaponId);
      return;
    }
    if (!chainWhipStates.has(weaponId)) chainWhipStates.set(weaponId, buildChainWhip(weaponId));
    const ws = chainWhipStates.get(weaponId)!;
    const range = weaponDef.stats.range;
    const tier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const contactDamage = getScaledWeaponDamage(weaponDef.stats.damage, tier, playerStats.atk);

    updateChainWhipCooldowns(ws, deltaMs);

    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);

    if (ws.phase === 'idle') {
      // Soft anchor during idle — nodes settle back toward player
      stepChainPhysics(ws, dt, CHAIN_ANCHOR_K);
      ws.phaseMs += deltaMs;
      if (ws.phaseMs >= ws.cooldownMs) {
        const target = findClosestEnemy(range * range);
        if (target) {
          ws.targetX = target.x; ws.targetY = target.y;
          // Give the tip (CHAIN_NODES-1) a sudden velocity toward the target
          const tipX = ws.nodesX[CHAIN_NODES - 1], tipY = ws.nodesY[CHAIN_NODES - 1];
          const tdx = ws.targetX - tipX, tdy = ws.targetY - tipY;
          const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
          if (tdist > 0.01) {
            ws.nodesVx[CHAIN_NODES - 1] = (tdx / tdist) * CHAIN_LASH_SPEED;
            ws.nodesVy[CHAIN_NODES - 1] = (tdy / tdist) * CHAIN_LASH_SPEED;
          }
          ws.phase = 'lashing'; ws.phaseMs = 0;
        } else {
          ws.phaseMs = ws.cooldownMs;
        }
      }
    } else if (ws.phase === 'lashing') {
      ws.phaseMs += deltaMs;
      stepChainPhysics(ws, dt, CHAIN_ANCHOR_K);

      // Contact damage: check all nodes against all enemies
      const applyContactDamage = (tx: number, ty: number, target: LaserEnemy | SapphireEnemy | EmeraldEnemy | AmberEnemy | VoidEnemy | QuartzEnemy | RubyEnemy | SunstoneEnemy | CitrineEnemy | IoliteEnemy | AmethystEnemy | DiamondEnemy | NullstoneEnemy | FracterylEnemy | EigensteinEnemy): void => {
        const nodeR = chainNodeRadius(CHAIN_NODES - 1); // use tip radius for hit detection
        const r = nodeR + LASER_ENEMY_SIZE;
        const dx = tx - target.x, dy = ty - target.y;
        if (dx * dx + dy * dy < r * r) {
          if (!ws.hitCooldowns.has(target)) {
            let dmg = 0;
            // Sapphire is the only enemy type with `shieldHp` but without a `kind` discriminator.
            // Amethyst also has `shieldHp` but carries `kind: 'amethyst'`, so the `!('kind' in target)` check correctly excludes it.
            if ('shieldHp' in target && !('kind' in target)) {
              dmg = damageSapphireEnemy(target as SapphireEnemy, contactDamage, 0, false);
            } else if ('kind' in target) {
              const t = target as EmeraldEnemy | AmberEnemy | VoidEnemy | QuartzEnemy | RubyEnemy | SunstoneEnemy | CitrineEnemy | IoliteEnemy | AmethystEnemy | DiamondEnemy | NullstoneEnemy | FracterylEnemy | EigensteinEnemy;
              switch (t.kind) {
                case 'emerald':    dmg = damageEmeraldEnemy(t, contactDamage, 0); break;
                case 'amber':      dmg = damageAmberEnemy(t, contactDamage, 0); break;
                case 'void':       dmg = damageVoidEnemy(t, contactDamage, 0); break;
                case 'quartz':     dmg = damageQuartzEnemy(t, contactDamage, 0); break;
                case 'ruby':       dmg = damageRubyEnemy(t, contactDamage, 0); break;
                case 'sunstone':   dmg = damageSunstoneEnemy(t, contactDamage, 0); break;
                case 'citrine':    dmg = damageCitrineEnemy(t, contactDamage, 0); break;
                case 'iolite':     dmg = damageIoliteEnemy(t, contactDamage, 0); break;
                case 'amethyst':   dmg = damageAmethystEnemy(t, contactDamage, 0, false); break;
                case 'diamond':    dmg = damageDiamondEnemy(t, contactDamage, 0); break;
                case 'nullstone':  dmg = damageNullstoneEnemy(t, contactDamage, 0); break;
                case 'fracteryl':  dmg = damageFracterylEnemy(t, contactDamage, 0); break;
                case 'eigenstein': dmg = damageEigensteinEnemy(t, contactDamage, 0); break;
              }
            } else {
              dmg = damageEnemy(target as LaserEnemy, contactDamage, 0);
            }
            ws.hitCooldowns.set(target, CHAIN_HIT_CD_MS);
            hitEffects.push({ x: target.x, y: target.y, timerMs: HIT_EFFECT_DURATION_MS, color: CHAIN_NODE_COLOR });
            spawnDamageNumber(target.x, target.y, 0, -1, String(Math.round(dmg)), dmg / target.maxHp, CHAIN_NODE_COLOR);
          }
        }
      };
      for (let ni = 0; ni < CHAIN_NODES; ni++) {
        const nx = ws.nodesX[ni], ny = ws.nodesY[ni];
        for (const e of enemies)          applyContactDamage(nx, ny, e);
        for (const e of sapphireEnemies)  applyContactDamage(nx, ny, e);
        for (const e of emeraldEnemies)   applyContactDamage(nx, ny, e);
        for (const e of amberEnemies)     applyContactDamage(nx, ny, e);
        for (const e of voidEnemies)      applyContactDamage(nx, ny, e);
        for (const e of quartzEnemies)    applyContactDamage(nx, ny, e);
        for (const e of rubyEnemies)      applyContactDamage(nx, ny, e);
        for (const e of sunstoneEnemies)  applyContactDamage(nx, ny, e);
        for (const e of citrineEnemies)   applyContactDamage(nx, ny, e);
        for (const e of ioliteEnemies)    applyContactDamage(nx, ny, e);
        for (const e of amethystEnemies)  applyContactDamage(nx, ny, e);
        for (const e of diamondEnemies)   applyContactDamage(nx, ny, e);
        for (const e of nullstoneEnemies) applyContactDamage(nx, ny, e);
        for (const e of fracterylEnemies) applyContactDamage(nx, ny, e);
        for (const e of eigensteinEnemies) applyContactDamage(nx, ny, e);
      }
      // Apply chain whip damage to boss
      if (bossEnemy) {
        const bossHitR = BOSS_SIZE_BASE + bossEnemy.bossId * 1.5 + chainNodeRadius(CHAIN_NODES - 1);
        for (let ni = 0; ni < CHAIN_NODES; ni++) {
          const nx = ws.nodesX[ni], ny = ws.nodesY[ni];
          if (ws.hitCooldowns.has(bossEnemy)) break;
          const dx = nx - bossEnemy.x, dy = ny - bossEnemy.y;
          if (dx * dx + dy * dy < bossHitR * bossHitR) {
            const dmg = damageBossEnemy(contactDamage, 0);
            ws.hitCooldowns.set(bossEnemy, CHAIN_HIT_CD_MS);
            hitEffects.push({ x: bossEnemy.x, y: bossEnemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: CHAIN_NODE_COLOR });
            if (dmg > 0) spawnDamageNumber(bossEnemy.x, bossEnemy.y, 0, -1, String(Math.round(dmg)), dmg / bossEnemy.maxHp, CHAIN_NODE_COLOR);
          }
        }
      }

      // Inject fluid force along the chain length
      const tipDx = ws.targetX - mote.x;
      const tipDy = ws.targetY - mote.y;
      const tipDist = Math.sqrt(tipDx * tipDx + tipDy * tipDy);
      if (tipDist > 0.1) {
        for (let ni = 0; ni < CHAIN_NODES; ni++) {
          fluid.addForce({
            x: ws.nodesX[ni], y: ws.nodesY[ni],
            vx: (tipDx / tipDist) * FLUID_VEL_FRAME_TO_PX_S * 1.5,
            vy: (tipDy / tipDist) * FLUID_VEL_FRAME_TO_PX_S * 1.5,
            r: FLUID_CHAIN_R, g: FLUID_CHAIN_G, b: FLUID_CHAIN_B,
            strength: 1.2,
          });
        }
      }

      if (ws.phaseMs >= CHAIN_LASH_MS) { ws.phase = 'retracting'; ws.phaseMs = 0; }
    } else if (ws.phase === 'retracting') {
      ws.phaseMs += deltaMs;
      // Use stronger anchor spring to pull nodes back toward player
      stepChainPhysics(ws, dt, CHAIN_RETRACT_ANCHOR_K);
      if (ws.phaseMs >= CHAIN_RETRACT_MS) { ws.phase = 'idle'; ws.phaseMs = 0; }
    }
  }

  // ── Nullstone vortex system ────────────────────────────────────

  function fireVortex(weaponId: string, tier: number): void {
    const weaponDef = WEAPON_BY_ID.get(weaponId);
    const rawDamage = weaponDef
      ? getScaledWeaponDamage(weaponDef.stats.damage, tier, playerStats.atk)
      : playerStats.atk;
    const radiusPx    = getVortexTierRadius(tier);
    const durationMs  = getVortexTierDurationMs(tier);
    const count       = getVortexCount(tier);
    // Set the per-weapon cooldown to 2× duration before spawning vortexes.
    vortexWeaponStates.set(weaponId, { cooldownMs: durationMs * 2 });
    for (let i = 0; i < count; i++) {
      const angle = playerAimAngle + (i / count) * Math.PI * 2;
      activeVortexes.push({
        x: mote.x + Math.cos(angle) * VORTEX_SPAWN_DIST,
        y: mote.y + Math.sin(angle) * VORTEX_SPAWN_DIST,
        radiusPx,
        durationMs,
        maxDurationMs: durationMs,
        spinAngle: 0,
        damageTimerMs: VORTEX_DAMAGE_INTERVAL_MS,
        scaledDamage: rawDamage / 3,
        weaponId,
      });
    }
  }

  function updateVortexWeapon(weaponId: string, deltaMs: number): void {
    const tier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    if (!vortexWeaponStates.has(weaponId)) vortexWeaponStates.set(weaponId, { cooldownMs: 0 });
    const state = vortexWeaponStates.get(weaponId)!;
    state.cooldownMs -= deltaMs;
    if (state.cooldownMs <= 0) fireVortex(weaponId, tier);
  }

  /** Applies vortex damage to one enemy; shows a damage number if any dealt. */
  function applyVortexTickToEnemy<T extends { x: number; y: number; maxHp: number }>(
    vortex: NullstoneVortex,
    e: T,
    damageFn: (enemy: T, dmg: number, pierce: number) => number,
  ): void {
    const dx = e.x - vortex.x, dy = e.y - vortex.y;
    if (dx * dx + dy * dy > vortex.radiusPx * vortex.radiusPx) return;
    const dmg = damageFn(e, vortex.scaledDamage, 0);
    if (dmg > 0) spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, VORTEX_COLOR);
  }

  function updateVortexes(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const pull = VORTEX_PULL_STRENGTH * dt;

    for (let i = activeVortexes.length - 1; i >= 0; i--) {
      const v = activeVortexes[i];
      v.durationMs -= deltaMs;
      if (v.durationMs <= 0) { activeVortexes.splice(i, 1); continue; }

      v.spinAngle += VORTEX_SPIN_RATE * deltaMs / 1000;

      // Gravity pull — nudge each enemy toward the vortex center.
      const applyPull = (e: { x: number; y: number }) => {
        const dx = v.x - e.x, dy = v.y - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.01 && dist <= v.radiusPx) {
          e.x += (dx / dist) * pull;
          e.y += (dy / dist) * pull;
        }
      };
      for (const e of enemies)          applyPull(e);
      for (const e of sapphireEnemies)  applyPull(e);
      for (const e of emeraldEnemies)   applyPull(e);
      for (const e of amberEnemies)     applyPull(e);
      for (const e of voidEnemies)      applyPull(e);
      for (const e of quartzEnemies)    applyPull(e);
      for (const e of rubyEnemies)      applyPull(e);
      for (const e of sunstoneEnemies)  applyPull(e);
      for (const e of citrineEnemies)   applyPull(e);
      for (const e of ioliteEnemies)    applyPull(e);
      for (const e of amethystEnemies)  applyPull(e);
      for (const e of diamondEnemies)   applyPull(e);
      for (const e of nullstoneEnemies) applyPull(e);
      for (const e of fracterylEnemies) applyPull(e);
      for (const e of eigensteinEnemies) applyPull(e);
      if (bossEnemy) applyPull(bossEnemy);

      // Fluid inward swirl
      fluid.addForce({
        x: v.x, y: v.y, vx: 0, vy: 0,
        r: 150, g: 100, b: 200,
        strength: 0.4,
      });

      // Damage ticks
      v.damageTimerMs -= deltaMs;
      if (v.damageTimerMs <= 0) {
        v.damageTimerMs += VORTEX_DAMAGE_INTERVAL_MS;
        for (const e of enemies)          applyVortexTickToEnemy(v, e, damageEnemy);
        for (const e of sapphireEnemies)  applyVortexTickToEnemy(v, e, (en, dmg, p) => damageSapphireEnemy(en, dmg, p, false));
        for (const e of emeraldEnemies)   applyVortexTickToEnemy(v, e, damageEmeraldEnemy);
        for (const e of amberEnemies)     applyVortexTickToEnemy(v, e, damageAmberEnemy);
        for (const e of voidEnemies)      applyVortexTickToEnemy(v, e, damageVoidEnemy);
        for (const e of quartzEnemies)    applyVortexTickToEnemy(v, e, damageQuartzEnemy);
        for (const e of rubyEnemies)      applyVortexTickToEnemy(v, e, damageRubyEnemy);
        for (const e of sunstoneEnemies)  applyVortexTickToEnemy(v, e, damageSunstoneEnemy);
        for (const e of citrineEnemies)   applyVortexTickToEnemy(v, e, damageCitrineEnemy);
        for (const e of ioliteEnemies)    applyVortexTickToEnemy(v, e, damageIoliteEnemy);
        for (const e of amethystEnemies)  applyVortexTickToEnemy(v, e, (en, dmg, p) => damageAmethystEnemy(en, dmg, p, false));
        for (const e of diamondEnemies)   applyVortexTickToEnemy(v, e, damageDiamondEnemy);
        for (const e of nullstoneEnemies) applyVortexTickToEnemy(v, e, damageNullstoneEnemy);
        for (const e of fracterylEnemies) applyVortexTickToEnemy(v, e, (en, dmg, p) => damageFracterylEnemy(en, dmg, p));
        for (const e of eigensteinEnemies) applyVortexTickToEnemy(v, e, (en, dmg, p) => damageEigensteinEnemy(en, dmg, p));
        if (bossEnemy) {
          const bx = bossEnemy.x - v.x, by = bossEnemy.y - v.y;
          if (bx * bx + by * by <= v.radiusPx * v.radiusPx) {
            const dmg = damageBossEnemy(v.scaledDamage, 0);
            if (dmg > 0) spawnDamageNumber(bossEnemy.x, bossEnemy.y, 0, -1, String(Math.round(dmg)), dmg / bossEnemy.maxHp, VORTEX_COLOR);
          }
        }
        removeDeadEnemies();
        checkWaveCompletion();
      }
    }
  }

  // ── Diamond sword system ───────────────────────────────────────

  function buildSwordCombo(weaponId: string): SwordComboState {
    const weaponDef  = WEAPON_BY_ID.get(weaponId);
    const tier       = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const cooldownMs = getScaledWeaponCooldown(weaponDef?.stats.cooldownMs ?? SWORD_DEFAULT_COOLDOWN_MS, tier);
    const initAngle  = playerAimAngle + Math.PI / 2;
    return {
      phase: 'idle', phaseMs: 0, cooldownMs,
      hitThisSwing: new Set(),
      swordAngle: initAngle, swordAngularVel: 0,
      shardAngles: Array.from({ length: SWORD_SHARD_COUNT }, () => initAngle),
      swipeArcStart: 0, swipeArcEnd: 0,
      swipeEffects: [], beamEffects: [],
      swingIsRightToLeft: true,
      lastHitEntity: null,
      consecHitsOnSameEnemy: 0,
      spinComboAngle: 0,
      spinComboDamageTicks: 0,
    };
  }

  /**
   * Returns true if angle `a` lies within the arc swept from `start` toward `end`
   * in the short (≤ 2π) direction.
   */
  function angleInArc(a: number, start: number, end: number): boolean {
    const diff = ((a - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const span = ((end - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    return diff <= span;
  }

  function swordHitInArc(
    state: SwordComboState,
    swordLength: number,
    rawDamage: number,
    arcStart: number,
    arcEnd: number,
    weaponId: string,
  ): void {
    const hitColor = SWORD_COLOR;
    const isDiamondBlade = weaponId === 'diamond_bastion';
    const check = <T extends { x: number; y: number; maxHp: number }>(
      e: T,
      damageFn: (enemy: T, dmg: number, pierce: number) => number,
    ) => {
      if (state.hitThisSwing.has(e)) return;
      const dx = e.x - mote.x, dy = e.y - mote.y;
      if (dx * dx + dy * dy > swordLength * swordLength) return;
      if (!angleInArc(Math.atan2(dy, dx), arcStart, arcEnd)) return;
      const dmg = damageFn(e, rawDamage, 1.0);
      state.hitThisSwing.add(e);
      hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: hitColor });
      spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, hitColor);
      // Spawn prismatic beam through the hit enemy.
      spawnSwordBeam(state, e.x, e.y, arcStart, arcEnd, swordLength);
    };
    for (const e of enemies)          check(e, damageEnemy);
    for (const e of sapphireEnemies)  check(e, (en, d, p) => damageSapphireEnemy(en, d, p, false));
    for (const e of emeraldEnemies)   check(e, damageEmeraldEnemy);
    for (const e of amberEnemies)     check(e, damageAmberEnemy);
    for (const e of voidEnemies)      check(e, damageVoidEnemy);
    for (const e of quartzEnemies)    check(e, damageQuartzEnemy);
    for (const e of rubyEnemies)      check(e, damageRubyEnemy);
    for (const e of sunstoneEnemies)  check(e, damageSunstoneEnemy);
    for (const e of citrineEnemies)   check(e, damageCitrineEnemy);
    for (const e of ioliteEnemies)    check(e, damageIoliteEnemy);
    for (const e of amethystEnemies)  check(e, (en, d, p) => damageAmethystEnemy(en, d, p, false));
    for (const e of diamondEnemies)   check(e, damageDiamondEnemy);
    for (const e of nullstoneEnemies) check(e, damageNullstoneEnemy);
    for (const e of fracterylEnemies) check(e, (en, d, p) => damageFracterylEnemy(en, d, p));
    for (const e of eigensteinEnemies) check(e, (en, d, p) => damageEigensteinEnemy(en, d, p));
    if (bossEnemy && !state.hitThisSwing.has(bossEnemy)) {
      const dx = bossEnemy.x - mote.x, dy = bossEnemy.y - mote.y;
      if (dx * dx + dy * dy <= swordLength * swordLength &&
          angleInArc(Math.atan2(dy, dx), arcStart, arcEnd)) {
        const dmg = damageBossEnemy(rawDamage, 1.0, isDiamondBlade);
        state.hitThisSwing.add(bossEnemy);
        if (dmg > 0) {
          hitEffects.push({ x: bossEnemy.x, y: bossEnemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: hitColor });
          spawnDamageNumber(bossEnemy.x, bossEnemy.y, 0, -1, String(Math.round(dmg)), dmg / bossEnemy.maxHp, hitColor);
          spawnSwordBeam(state, bossEnemy.x, bossEnemy.y, arcStart, arcEnd, swordLength);
        }
      }
    }
  }

  /**
   * Spawn a prismatic beam effect cutting across the enemy position.
   * The beam originates "out of thin air" beside the player, in the swipe direction.
   */
  function spawnSwordBeam(
    state: SwordComboState,
    enemyX: number, enemyY: number,
    arcStart: number, arcEnd: number,
    swordLength: number,
  ): void {
    // Direction of the cut: midpoint of the swipe arc.
    const midAngle = arcStart + wrapAngleDiff(arcEnd - arcStart) * 0.5;
    const dirX = Math.cos(midAngle);
    const dirY = Math.sin(midAngle);
    // Perpendicular offset so the beam appears slightly beside the player.
    const perpX = -dirY; const perpY = dirX;
    const perpOffset = 4; // px perpendicular offset
    // Position the beam so it passes through the enemy, extending from tail to past it.
    const beamLen = swordLength * 1.5;
    const halfLen = beamLen * 0.5;
    const beamCx = enemyX + perpX * perpOffset;
    const beamCy = enemyY + perpY * perpOffset;
    state.beamEffects.push({
      tailX: beamCx - dirX * halfLen,
      tailY: beamCy - dirY * halfLen,
      tipX:  beamCx + dirX * halfLen,
      tipY:  beamCy + dirY * halfLen,
      progress: 0,
      maxTimerMs: SWORD_BEAM_DURATION_MS,
    });
  }

  function updateSwordCombo(weaponId: string, deltaMs: number): void {
    if (!swordComboStates.has(weaponId)) swordComboStates.set(weaponId, buildSwordCombo(weaponId));
    const state      = swordComboStates.get(weaponId)!;
    const weaponDef  = WEAPON_BY_ID.get(weaponId);
    const tier       = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const rawDamage  = weaponDef
      ? getScaledWeaponDamage(weaponDef.stats.damage, tier, playerStats.atk)
      : playerStats.atk;
    const swordLength    = getSwordLength(tier);
    const fullCooldownMs = getScaledWeaponCooldown(weaponDef?.stats.cooldownMs ?? SWORD_DEFAULT_COOLDOWN_MS, tier);
    const nowMs = Date.now();

    // ── 1. Update hinge physics: spring pulls toward right-hand rest angle based on
    //       last movement facing (playerAimAngle). Overridden during swing/spin.
    const restAngle = playerAimAngle + Math.PI / 2;
    const angleDiff = wrapAngleDiff(restAngle - state.swordAngle);
    state.swordAngularVel += angleDiff * SWORD_HINGE_SPRING_K;
    state.swordAngularVel *= SWORD_HINGE_DAMPING;
    if (state.phase !== 'swing' && state.phase !== 'spin_combo') {
      state.swordAngle += state.swordAngularVel;
    }

    // ── 2. Update shard chain (each shard lags the previous) ──
    const followBase = SWORD_SHARD_FOLLOW_BASE;
    const followDecay = SWORD_SHARD_FOLLOW_DECAY;
    if (state.phase !== 'swing' && state.phase !== 'spin_combo') {
      // Shard 0 follows the main hinge angle.
      const d0 = wrapAngleDiff(state.swordAngle - state.shardAngles[0]);
      state.shardAngles[0] += d0 * followBase;
      for (let i = 1; i < SWORD_SHARD_COUNT; i++) {
        const followRate = Math.max(0.08, followBase - i * followDecay);
        const di = wrapAngleDiff(state.shardAngles[i - 1] - state.shardAngles[i]);
        state.shardAngles[i] += di * followRate;
      }
    } else {
      // During swing/spin: drive the blade through the arc; shards follow with chain lag.
      let driveAngle: number;
      if (state.phase === 'swing') {
        const t = Math.min(1, state.phaseMs / SWORD_SWING_MS);
        // R→L: drive from arcStart → arcEnd. L→R: drive from arcEnd → arcStart.
        if (state.swingIsRightToLeft) {
          driveAngle = state.swipeArcStart + (state.swipeArcEnd - state.swipeArcStart) * t;
        } else {
          driveAngle = state.swipeArcEnd + (state.swipeArcStart - state.swipeArcEnd) * t;
        }
      } else {
        // spin_combo: direct drive
        driveAngle = state.spinComboAngle;
      }
      state.swordAngle = driveAngle;
      state.shardAngles[0] = driveAngle;
      for (let i = 1; i < SWORD_SHARD_COUNT; i++) {
        const followRate = Math.max(0.08, followBase - i * followDecay);
        const di = wrapAngleDiff(state.shardAngles[i - 1] - state.shardAngles[i]);
        state.shardAngles[i] += di * followRate;
      }
    }

    // ── 3. Add fluid forces from sword drag (each shard per frame) ──
    const comboLength = state.phase === 'spin_combo' ? swordLength * SWORD_COMBO_RANGE_MULT : swordLength;
    if (state.phase !== 'cooldown') {
      const dists = getShardDistances(comboLength);
      const colIdx = Math.floor(nowMs / 60) % SWORD_PRISMATIC_COLORS.length;
      const hexColor = SWORD_PRISMATIC_COLORS[colIdx];
      const pr = parseInt(hexColor.slice(1, 3), 16);
      const pg = parseInt(hexColor.slice(3, 5), 16);
      const pb = parseInt(hexColor.slice(5, 7), 16);
      for (let i = 0; i < SWORD_SHARD_COUNT; i++) {
        const sx = mote.x + Math.cos(state.shardAngles[i]) * dists[i];
        const sy = mote.y + Math.sin(state.shardAngles[i]) * dists[i];
        const perpX = -Math.sin(state.shardAngles[i]);
        const perpY =  Math.cos(state.shardAngles[i]);
        fluid.addForce({
          x: sx, y: sy,
          vx: perpX * SWORD_FLUID_DRAG_STR * FLUID_VEL_FRAME_TO_PX_S,
          vy: perpY * SWORD_FLUID_DRAG_STR * FLUID_VEL_FRAME_TO_PX_S,
          r: pr, g: pg, b: pb,
          strength: FLUID_PROJECTILE_STRENGTH * (state.phase === 'spin_combo' ? 1.5 : 0.5),
        });
      }
    }

    // ── 4. Phase state machine ──
    state.phaseMs += deltaMs;

    if (state.phase === 'idle') {
      if (state.phaseMs >= state.cooldownMs) {
        // Trigger a swing if any enemy is within sword range.
        const rangeSq = swordLength * swordLength;
        let anyInRange = false;
        const checkEnemy = (e: { x: number; y: number }) => {
          if (anyInRange) return;
          const dx = e.x - mote.x, dy = e.y - mote.y;
          if (dx * dx + dy * dy <= rangeSq) anyInRange = true;
        };
        for (const e of enemies)           checkEnemy(e);
        for (const e of sapphireEnemies)   checkEnemy(e);
        for (const e of emeraldEnemies)    checkEnemy(e);
        for (const e of amberEnemies)      checkEnemy(e);
        for (const e of voidEnemies)       checkEnemy(e);
        for (const e of quartzEnemies)     checkEnemy(e);
        for (const e of rubyEnemies)       checkEnemy(e);
        for (const e of sunstoneEnemies)   checkEnemy(e);
        for (const e of citrineEnemies)    checkEnemy(e);
        for (const e of ioliteEnemies)     checkEnemy(e);
        for (const e of amethystEnemies)   checkEnemy(e);
        for (const e of diamondEnemies)    checkEnemy(e);
        for (const e of nullstoneEnemies)  checkEnemy(e);
        for (const e of fracterylEnemies)  checkEnemy(e);
        for (const e of eigensteinEnemies) checkEnemy(e);
        if (bossEnemy) checkEnemy(bossEnemy);

        if (anyInRange) {
          // Find the nearest enemy angle to center the 180° arc on.
          let bestDistSq = Infinity;
          let bestAngle  = 0;
          const findNearest = (e: { x: number; y: number }) => {
            const dx = e.x - mote.x, dy = e.y - mote.y;
            const d = dx * dx + dy * dy;
            if (d < bestDistSq) { bestDistSq = d; bestAngle = Math.atan2(dy, dx); }
          };
          for (const e of enemies)           findNearest(e);
          for (const e of sapphireEnemies)   findNearest(e);
          for (const e of emeraldEnemies)    findNearest(e);
          for (const e of amberEnemies)      findNearest(e);
          for (const e of voidEnemies)       findNearest(e);
          for (const e of quartzEnemies)     findNearest(e);
          for (const e of rubyEnemies)       findNearest(e);
          for (const e of sunstoneEnemies)   findNearest(e);
          for (const e of citrineEnemies)    findNearest(e);
          for (const e of ioliteEnemies)     findNearest(e);
          for (const e of amethystEnemies)   findNearest(e);
          for (const e of diamondEnemies)    findNearest(e);
          for (const e of nullstoneEnemies)  findNearest(e);
          for (const e of fracterylEnemies)  findNearest(e);
          for (const e of eigensteinEnemies) findNearest(e);
          if (bossEnemy) findNearest(bossEnemy);

          // Arc is centered on the enemy; half-width = π/2 gives a 180° sweep.
          // arcStart = left side (start for R→L drive), arcEnd = right side.
          state.swipeArcStart = bestAngle - Math.PI / 2;
          state.swipeArcEnd   = bestAngle + Math.PI / 2;
          state.phase = 'swing'; state.phaseMs = 0; state.hitThisSwing.clear();
          state.swipeEffects.push({
            x: mote.x, y: mote.y,
            arcStart: state.swipeArcStart, arcEnd: state.swipeArcEnd,
            swordLength,
            timerMs: SWORD_SWIPE_VISUAL_MS,
            maxTimerMs: SWORD_SWIPE_VISUAL_MS,
          });
        }
      }
    } else if (state.phase === 'swing') {
      // Hit detection during the swing (full 180° arc).
      swordHitInArc(state, swordLength, rawDamage, state.swipeArcStart, state.swipeArcEnd, weaponId);

      // Add stronger crescent fluid forces during the swipe.
      const numSamples = 6;
      const colIdx2 = Math.floor(nowMs / 60) % SWORD_PRISMATIC_COLORS.length;
      const hexC2 = SWORD_PRISMATIC_COLORS[colIdx2];
      const sr = parseInt(hexC2.slice(1, 3), 16);
      const sg = parseInt(hexC2.slice(3, 5), 16);
      const sb = parseInt(hexC2.slice(5, 7), 16);
      const t2 = Math.min(1, state.phaseMs / SWORD_SWING_MS);
      const arcSpan = state.swipeArcEnd - state.swipeArcStart;
      for (let s = 0; s < numSamples; s++) {
        const frac = s / (numSamples - 1);
        const angle = state.swipeArcStart + arcSpan * frac;
        fluid.addForce({
          x: mote.x + Math.cos(angle) * swordLength,
          y: mote.y + Math.sin(angle) * swordLength,
          vx: Math.cos(angle) * SWORD_FLUID_SWIPE_STR * FLUID_VEL_FRAME_TO_PX_S * t2,
          vy: Math.sin(angle) * SWORD_FLUID_SWIPE_STR * FLUID_VEL_FRAME_TO_PX_S * t2,
          r: sr, g: sg, b: sb,
          strength: FLUID_PROJECTILE_STRENGTH * 2.0,
        });
      }

      if (state.phaseMs >= SWORD_SWING_MS) {
        // Update consecutive-hit tracking before flipping direction.
        // 'justFinishedLeftToRight' = the swing that just completed was L→R (swingIsRightToLeft=false).
        const justFinishedLeftToRight = !state.swingIsRightToLeft;
        if (state.hitThisSwing.size > 0) {
          const hitEntity = state.hitThisSwing.values().next().value as object;
          if (hitEntity === state.lastHitEntity) {
            state.consecHitsOnSameEnemy += 1;
          } else {
            state.lastHitEntity = hitEntity;
            state.consecHitsOnSameEnemy = 1;
          }
        } else {
          state.consecHitsOnSameEnemy = 0;
          state.lastHitEntity = null;
        }

        // Flip swing direction for next swing.
        state.swingIsRightToLeft = !state.swingIsRightToLeft;

        // Check for spin combo: triggered on the 4th consecutive hit ending on a L→R swing.
        // L→R swings end at arcStart (enemy center − π/2), which is the natural starting
        // position for spinning clockwise back through arcEnd and beyond.
        if (justFinishedLeftToRight && state.consecHitsOnSameEnemy >= SWORD_COMBO_THRESHOLD) {
          // Enter the spin combo — 3 rapid 360° rotations.
          // The sword is at swipeArcStart at the end of a L→R swing (drive ends at arcStart).
          const spinStartAngle = state.swipeArcStart;
          state.phase = 'spin_combo';
          state.phaseMs = 0;
          state.spinComboAngle = spinStartAngle;
          // swipeArcEnd is reused to store the spin start angle (semantic overload for
          // efficiency — avoids adding a new field to SwordComboState).
          state.swipeArcEnd = spinStartAngle;
          state.spinComboDamageTicks = 0;
          state.hitThisSwing.clear();
          state.consecHitsOnSameEnemy = 0;
          state.lastHitEntity = null;
        } else {
          state.phase = 'cooldown'; state.phaseMs = 0;
          state.cooldownMs = Math.max(0, fullCooldownMs - SWORD_SWING_MS);
          state.hitThisSwing.clear();
          removeDeadEnemies(); checkWaveCompletion();
        }
      }
    } else if (state.phase === 'spin_combo') {
      // ── Spin combo: 3 rapid full rotations, triple damage at 2× range ──
      const spinProgress = state.phaseMs / SWORD_COMBO_SPIN_MS; // 0 → 1
      const totalSpin = SWORD_COMBO_SPIN_TURNS * Math.PI * 2;   // 6π
      // swipeArcEnd stores the spin start angle (set when combo was triggered).
      state.spinComboAngle = state.swipeArcEnd + totalSpin * Math.min(spinProgress, 1);

      // Apply one damage tick per completed full rotation.
      const rotationsDone = Math.floor(spinProgress * SWORD_COMBO_SPIN_TURNS);
      if (rotationsDone > state.spinComboDamageTicks) {
        state.spinComboDamageTicks = rotationsDone;
        // Clear hit-set so the same enemy can be struck on each rotation.
        state.hitThisSwing.clear();
        // Deal damage in a full 360° arc at 2× range.
        const comboRange = swordLength * SWORD_COMBO_RANGE_MULT;
        swordHitInArc(state, comboRange, rawDamage * SWORD_COMBO_DAMAGE_MULT, 0, Math.PI * 2, weaponId);
        // Wide fluid burst for the combo.
        const numS = 12;
        const hexC3 = SWORD_PRISMATIC_COLORS[Math.floor(nowMs / 40) % SWORD_PRISMATIC_COLORS.length];
        const crr = parseInt(hexC3.slice(1, 3), 16);
        const crg = parseInt(hexC3.slice(3, 5), 16);
        const crb = parseInt(hexC3.slice(5, 7), 16);
        for (let s = 0; s < numS; s++) {
          const a = (s / numS) * Math.PI * 2;
          fluid.addForce({
            x: mote.x + Math.cos(a) * comboRange,
            y: mote.y + Math.sin(a) * comboRange,
            vx: Math.cos(a) * SWORD_FLUID_SWIPE_STR * 2.0 * FLUID_VEL_FRAME_TO_PX_S,
            vy: Math.sin(a) * SWORD_FLUID_SWIPE_STR * 2.0 * FLUID_VEL_FRAME_TO_PX_S,
            r: crr, g: crg, b: crb,
            strength: FLUID_PROJECTILE_STRENGTH * 4.0,
          });
        }
      }

      if (state.phaseMs >= SWORD_COMBO_SPIN_MS) {
        // Snap sword back to right-hand rest position based on current facing.
        const restAngle = playerAimAngle + Math.PI / 2;
        state.swordAngle = restAngle;
        for (let i = 0; i < SWORD_SHARD_COUNT; i++) state.shardAngles[i] = restAngle;
        state.swingIsRightToLeft = true; // next swing is R→L
        state.phase = 'cooldown'; state.phaseMs = 0;
        state.cooldownMs = Math.max(0, fullCooldownMs - SWORD_SWING_MS);
        state.hitThisSwing.clear();
        removeDeadEnemies(); checkWaveCompletion();
      }
    } else if (state.phase === 'cooldown') {
      if (state.phaseMs >= state.cooldownMs) {
        state.phase = 'idle'; state.phaseMs = 0; state.cooldownMs = fullCooldownMs;
      }
    }

    // ── 5. Age swipe and beam effects (unconditional) ──
    for (let i = state.swipeEffects.length - 1; i >= 0; i--) {
      state.swipeEffects[i].timerMs -= deltaMs;
      if (state.swipeEffects[i].timerMs <= 0) state.swipeEffects.splice(i, 1);
    }
    for (let i = state.beamEffects.length - 1; i >= 0; i--) {
      state.beamEffects[i].progress += deltaMs / (state.beamEffects[i].maxTimerMs * 0.5);
      if (state.beamEffects[i].progress >= 2) state.beamEffects.splice(i, 1);
    }
  }

  // ── Iolite poison bolt system ──────────────────────────────────

  function spawnPoisonBolt(targetX: number, targetY: number, weaponId: string, tier: number, rawDamage: number): void {
    const dx = targetX - mote.x, dy = targetY - mote.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) return;
    poisonBolts.push({
      x: mote.x, y: mote.y,
      vx: (dx / dist) * POISON_BOLT_SPEED,
      vy: (dy / dist) * POISON_BOLT_SPEED,
      lifeMs: POISON_BOLT_LIFE_MS,
      scaledDamage: rawDamage,
      tier, weaponId,
      trailX: new Float64Array(POISON_BOLT_TRAIL_CAP),
      trailY: new Float64Array(POISON_BOLT_TRAIL_CAP),
      trailHead: 0, trailCount: 0,
    });
  }

  /** Attaches or refreshes a poison debuff on a target, using a closure for typed damage dispatch. */
  function attachPoisonDebuff<T extends { x: number; y: number; hp: number; maxHp: number }>(
    target: T,
    rawDamage: number,
    tier: number,
    damageFn: (enemy: T, dmg: number, pierce: number) => number,
  ): void {
    const armorIgnore   = Math.min(1, tier * POISON_ARMOR_IGNORE_PER_TIER);
    const clampedTier   = Math.min(tier, POISON_DURATION_BASE_TIER - 1);
    const durationMs    = (POISON_DURATION_BASE_TIER - clampedTier) * POISON_DURATION_MS_PER_TIER;
    const poisonTotal   = rawDamage * tier * POISON_TOTAL_MULTIPLIER;
    const damagePerTick = poisonTotal / (durationMs / POISON_TICK_INTERVAL_MS);
    poisonDebuffs.set(target, {
      remainingDamage: poisonTotal,
      damagePerTick,
      tickTimerMs: POISON_TICK_INTERVAL_MS,
      maxHp: target.maxHp,
      isAlive: () => target.hp > 0,
      applyTick:  (tick: number) => target.hp > 0 ? damageFn(target, tick, armorIgnore) : 0,
      getPos: () => ({ x: target.x, y: target.y }),
    });
  }

  function updatePoisonBolts(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const hitR = POISON_BOLT_SIZE * 3;

    for (let i = poisonBolts.length - 1; i >= 0; i--) {
      const p = poisonBolts[i];
      p.lifeMs -= deltaMs;
      if (p.lifeMs <= 0) { poisonBolts.splice(i, 1); continue; }

      p.x += p.vx * dt; p.y += p.vy * dt;

      // Trail ring buffer
      p.trailX[p.trailHead] = p.x; p.trailY[p.trailHead] = p.y;
      p.trailHead = (p.trailHead + 1) % POISON_BOLT_TRAIL_CAP;
      if (p.trailCount < POISON_BOLT_TRAIL_CAP) p.trailCount++;

      // Fluid injection
      fluid.addForce({
        x: p.x, y: p.y,
        vx: p.vx * FLUID_VEL_FRAME_TO_PX_S * 0.4,
        vy: p.vy * FLUID_VEL_FRAME_TO_PX_S * 0.4,
        r: 136, g: 68, b: 255,
        strength: 0.1,
      });

      if (p.x < 0 || p.x > widthPx || p.y < 0 || p.y > heightPx) {
        poisonBolts.splice(i, 1); continue;
      }

      // Collision — first hit ends the bolt.
      let hit = false;
      const tryHit = <T extends { x: number; y: number; hp: number; maxHp: number }>(
        e: T,
        damageFn: (enemy: T, dmg: number, pierce: number) => number,
      ): boolean => {
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy >= hitR * hitR) return false;
        const dmg = damageFn(e, p.scaledDamage, 0);
        spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, POISON_BOLT_COLOR);
        attachPoisonDebuff(e, p.scaledDamage, p.tier, damageFn);
        return true;
      };

      for (const e of enemies)          { if (tryHit(e, damageEnemy))                                         { hit = true; break; } }
      if (!hit) for (const e of sapphireEnemies)  { if (tryHit(e, (en, d, r) => damageSapphireEnemy(en, d, r, false))) { hit = true; break; } }
      if (!hit) for (const e of emeraldEnemies)   { if (tryHit(e, damageEmeraldEnemy))                        { hit = true; break; } }
      if (!hit) for (const e of amberEnemies)     { if (tryHit(e, damageAmberEnemy))                          { hit = true; break; } }
      if (!hit) for (const e of voidEnemies)      { if (tryHit(e, damageVoidEnemy))                           { hit = true; break; } }
      if (!hit) for (const e of quartzEnemies)    { if (tryHit(e, damageQuartzEnemy))                         { hit = true; break; } }
      if (!hit) for (const e of rubyEnemies)      { if (tryHit(e, damageRubyEnemy))                           { hit = true; break; } }
      if (!hit) for (const e of sunstoneEnemies)  { if (tryHit(e, damageSunstoneEnemy))                       { hit = true; break; } }
      if (!hit) for (const e of citrineEnemies)   { if (tryHit(e, damageCitrineEnemy))                        { hit = true; break; } }
      if (!hit) for (const e of ioliteEnemies)    { if (tryHit(e, damageIoliteEnemy))                         { hit = true; break; } }
      if (!hit) for (const e of amethystEnemies)  { if (tryHit(e, (en, d, r) => damageAmethystEnemy(en, d, r, false))) { hit = true; break; } }
      if (!hit) for (const e of diamondEnemies)   { if (tryHit(e, damageDiamondEnemy))                        { hit = true; break; } }
      if (!hit) for (const e of nullstoneEnemies) { if (tryHit(e, damageNullstoneEnemy))                      { hit = true; break; } }
      if (!hit) for (const e of fracterylEnemies) { if (tryHit(e, (en, d, r) => damageFracterylEnemy(en, d, r))) { hit = true; break; } }
      if (!hit) for (const e of eigensteinEnemies) { if (tryHit(e, (en, d, r) => damageEigensteinEnemy(en, d, r))) { hit = true; break; } }
      if (!hit && bossEnemy) {
        const boss = bossEnemy;
        const dx = p.x - boss.x, dy = p.y - boss.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageBossEnemy(p.scaledDamage, 0);
          if (dmg > 0) spawnHitVisualsAt(boss.x, boss.y, boss.maxHp, dmg, POISON_BOLT_COLOR);
          attachPoisonDebuff(boss, p.scaledDamage, p.tier, (_b, d, r) => damageBossEnemy(d, r));
          hit = true;
        }
      }

      if (hit) {
        poisonBolts.splice(i, 1);
        removeDeadEnemies(); checkWaveCompletion();
      }
    }
  }

  function updatePoisonDebuffs(deltaMs: number): void {
    for (const [target, debuff] of poisonDebuffs) {
      if (debuff.remainingDamage <= 0) { poisonDebuffs.delete(target); continue; }
      // Remove the debuff if the target has already been killed.
      if (!debuff.isAlive()) { poisonDebuffs.delete(target); continue; }

      debuff.tickTimerMs -= deltaMs;
      if (debuff.tickTimerMs <= 0) {
        debuff.tickTimerMs += POISON_TICK_INTERVAL_MS;
        const tick = Math.min(debuff.damagePerTick, debuff.remainingDamage);
        debuff.remainingDamage -= tick;
        const dmg = debuff.applyTick(tick);
        if (dmg > 0) {
          const pos = debuff.getPos();
          spawnDamageNumber(pos.x, pos.y, 0, -1, String(Math.round(dmg)), dmg / debuff.maxHp, POISON_BOLT_COLOR);
        }
        if (debuff.remainingDamage <= 0) poisonDebuffs.delete(target);
      }
    }
    removeDeadEnemies();
    checkWaveCompletion();
  }


  // ── Emerald heat-seeking missile system ───────────────────────

  function spawnEmeraldMissile(targetX: number, targetY: number, scaledDamage: number, tier: number): void {
    const dx = targetX - mote.x, dy = targetY - mote.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) return;
    emeraldPlayerMissiles.push({
      x: mote.x, y: mote.y,
      vx: (dx / dist) * EMERALD_MISSILE_SPEED,
      vy: (dy / dist) * EMERALD_MISSILE_SPEED,
      scaledDamage,
      tier,
      noTargetMs: 0,
      isFizzling: false,
      trailX: new Float64Array(EMERALD_MISSILE_TRAIL_CAP),
      trailY: new Float64Array(EMERALD_MISSILE_TRAIL_CAP),
      trailHead: 0, trailCount: 0,
    });
  }

  /** Spawn sub-missiles from (ox, oy), scattered in a cone or equidistantly. */
  function spawnEmeraldSubMissiles(
    ox: number, oy: number,
    scaledDamage: number,
    tier: number,
    coneAngle: number | null,   // null → equidistant 360° spread
  ): void {
    const count = EMERALD_MISSILE_SUB_BASE + (tier - 1) * EMERALD_MISSILE_SUB_PER_TIER;
    for (let k = 0; k < count; k++) {
      let angle: number;
      if (coneAngle === null) {
        // Equidistant full-circle spread.
        angle = (k / count) * Math.PI * 2;
      } else {
        // Random within the configured half-angle of the cone direction.
        angle = coneAngle + (Math.random() - 0.5) * 2 * EMERALD_SUB_MISSILE_CONE_SPREAD;
      }
      emeraldSubMissiles.push({
        x: ox, y: oy,
        vx: Math.cos(angle) * EMERALD_SUB_MISSILE_SPEED,
        vy: Math.sin(angle) * EMERALD_SUB_MISSILE_SPEED,
        scaledDamage: scaledDamage * EMERALD_SUB_MISSILE_DAMAGE_MULT,
        squigglePhase: Math.random() * Math.PI * 2,
        lifetimeMs: 0,
        stoppedMs: 0,
        trailX: new Float32Array(EMERALD_SUB_MISSILE_TRAIL_CAP),
        trailY: new Float32Array(EMERALD_SUB_MISSILE_TRAIL_CAP),
        trailHead: 0, trailCount: 0,
      });
    }
  }

  function updateEmeraldPlayerMissiles(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const hitR        = EMERALD_MISSILE_HIT_RADIUS;
    const proxR2      = EMERALD_MISSILE_PROXIMITY_PX * EMERALD_MISSILE_PROXIMITY_PX;
    const detectR2    = EMERALD_MISSILE_DETECT_PX * EMERALD_MISSILE_DETECT_PX;
    const fizzleDrag  = Math.pow(EMERALD_MISSILE_FIZZLE_DRAG, dt);

    for (let i = emeraldPlayerMissiles.length - 1; i >= 0; i--) {
      const m = emeraldPlayerMissiles[i];

      // Find nearest enemy and its distance.
      let nearestEnemyX: number | null = null;
      let nearestEnemyY: number | null = null;
      let nearestDistSq = Infinity;
      const checkTarget = (ex: number, ey: number) => {
        const d = (ex - m.x) * (ex - m.x) + (ey - m.y) * (ey - m.y);
        if (d < nearestDistSq) { nearestDistSq = d; nearestEnemyX = ex; nearestEnemyY = ey; }
      };
      for (const e of enemies)          checkTarget(e.x, e.y);
      for (const e of sapphireEnemies)  checkTarget(e.x, e.y);
      for (const e of emeraldEnemies)   checkTarget(e.x, e.y);
      for (const e of amberEnemies)     checkTarget(e.x, e.y);
      for (const e of voidEnemies)      checkTarget(e.x, e.y);
      for (const e of quartzEnemies)    checkTarget(e.x, e.y);
      for (const e of rubyEnemies)      checkTarget(e.x, e.y);
      for (const e of sunstoneEnemies)  checkTarget(e.x, e.y);
      for (const e of citrineEnemies)   checkTarget(e.x, e.y);
      for (const e of ioliteEnemies)    checkTarget(e.x, e.y);
      for (const e of amethystEnemies)  checkTarget(e.x, e.y);
      for (const e of diamondEnemies)   checkTarget(e.x, e.y);
      for (const e of nullstoneEnemies) checkTarget(e.x, e.y);
      for (const e of fracterylEnemies) checkTarget(e.x, e.y);
      for (const e of eigensteinEnemies) checkTarget(e.x, e.y);
      if (bossEnemy) checkTarget(bossEnemy.x, bossEnemy.y);

      // If an enemy is close enough to detect, reset fizzle timer and home toward it.
      if (nearestDistSq <= detectR2 && nearestEnemyX !== null && nearestEnemyY !== null) {
        m.noTargetMs = 0;
        m.isFizzling = false;

        const ex = nearestEnemyX - m.x, ey = nearestEnemyY - m.y;
        const eDist = Math.sqrt(ex * ex + ey * ey);
        if (eDist > 0.01) {
          m.vx += (ex / eDist) * EMERALD_MISSILE_SEEK_STR * dt;
          m.vy += (ey / eDist) * EMERALD_MISSILE_SEEK_STR * dt;
        }

        // Proximity explosion — burst into sub-missiles in a cone toward enemy.
        if (nearestDistSq <= proxR2) {
          const coneAngle = Math.atan2(nearestEnemyY - m.y, nearestEnemyX - m.x);
          spawnEmeraldSubMissiles(m.x, m.y, m.scaledDamage, m.tier, coneAngle);
          fluid.addExplosion(m.x, m.y, FLUID_EXPLOSION_STRENGTH * 0.5,
            FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
          emeraldPlayerMissiles.splice(i, 1);
          continue;
        }
      } else {
        // No enemy in detection range — accumulate no-target time.
        m.noTargetMs += deltaMs;
        if (m.noTargetMs >= EMERALD_MISSILE_NO_TARGET_MS) {
          m.isFizzling = true;
        }
      }

      // Fizzle drag decelerates the missile.
      if (m.isFizzling) {
        m.vx *= fizzleDrag;
        m.vy *= fizzleDrag;
      } else {
        // Normal speed clamp.
        const spd = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
        if (spd > EMERALD_MISSILE_MAX_SPEED) {
          const s = EMERALD_MISSILE_MAX_SPEED / spd;
          m.vx *= s; m.vy *= s;
        }
      }

      m.x += m.vx * dt; m.y += m.vy * dt;

      // Wall bounce — reflect off all four edges.
      if (m.x < 0)         { m.x = 0;         m.vx =  Math.abs(m.vx); }
      else if (m.x > widthPx)  { m.x = widthPx;  m.vx = -Math.abs(m.vx); }
      if (m.y < 0)         { m.y = 0;         m.vy =  Math.abs(m.vy); }
      else if (m.y > heightPx) { m.y = heightPx; m.vy = -Math.abs(m.vy); }

      // Trail update.
      m.trailX[m.trailHead] = m.x; m.trailY[m.trailHead] = m.y;
      m.trailHead = (m.trailHead + 1) % EMERALD_MISSILE_TRAIL_CAP;
      if (m.trailCount < EMERALD_MISSILE_TRAIL_CAP) m.trailCount++;

      // Fluid injection — emerald comet sweep.
      fluid.addForce({
        x: m.x, y: m.y,
        vx: m.vx * FLUID_VEL_FRAME_TO_PX_S * 0.5,
        vy: m.vy * FLUID_VEL_FRAME_TO_PX_S * 0.5,
        r: FLUID_EMERALD_R, g: FLUID_EMERALD_G, b: FLUID_EMERALD_B,
        strength: FLUID_PROJECTILE_STRENGTH * 0.8,
      });

      // Fully stopped while fizzling — explode into equidistant sub-missiles.
      if (m.isFizzling && Math.sqrt(m.vx * m.vx + m.vy * m.vy) < EMERALD_MISSILE_STOP_SPEED) {
        spawnEmeraldSubMissiles(m.x, m.y, m.scaledDamage, m.tier, null);
        fluid.addExplosion(m.x, m.y, FLUID_EXPLOSION_STRENGTH * 0.5,
          FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
        emeraldPlayerMissiles.splice(i, 1);
        continue;
      }

      // Collision detection — hit first matching enemy.
      let hit = false;
      const tryHit = <T extends { x: number; y: number; hp: number; maxHp: number }>(
        e: T,
        damageFn: (enemy: T, dmg: number, pierce: number) => number,
      ): boolean => {
        const dx = m.x - e.x, dy = m.y - e.y;
        if (dx * dx + dy * dy >= hitR * hitR) return false;
        const dmg = damageFn(e, m.scaledDamage, 0);
        spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, EMERALD_MISSILE_COLOR);
        fluid.addExplosion(e.x, e.y, FLUID_EXPLOSION_STRENGTH * 0.35,
          FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
        return true;
      };

      for (const e of enemies)          { if (tryHit(e, damageEnemy))                                          { hit = true; break; } }
      if (!hit) for (const e of sapphireEnemies)  { if (tryHit(e, (en, d, p) => damageSapphireEnemy(en, d, p, false))) { hit = true; break; } }
      if (!hit) for (const e of emeraldEnemies)   { if (tryHit(e, damageEmeraldEnemy))                         { hit = true; break; } }
      if (!hit) for (const e of amberEnemies)     { if (tryHit(e, damageAmberEnemy))                           { hit = true; break; } }
      if (!hit) for (const e of voidEnemies)      { if (tryHit(e, damageVoidEnemy))                            { hit = true; break; } }
      if (!hit) for (const e of quartzEnemies)    { if (tryHit(e, damageQuartzEnemy))                          { hit = true; break; } }
      if (!hit) for (const e of rubyEnemies)      { if (tryHit(e, damageRubyEnemy))                            { hit = true; break; } }
      if (!hit) for (const e of sunstoneEnemies)  { if (tryHit(e, damageSunstoneEnemy))                        { hit = true; break; } }
      if (!hit) for (const e of citrineEnemies)   { if (tryHit(e, damageCitrineEnemy))                         { hit = true; break; } }
      if (!hit) for (const e of ioliteEnemies)    { if (tryHit(e, damageIoliteEnemy))                          { hit = true; break; } }
      if (!hit) for (const e of amethystEnemies)  { if (tryHit(e, (en, d, p) => damageAmethystEnemy(en, d, p, false))) { hit = true; break; } }
      if (!hit) for (const e of diamondEnemies)   { if (tryHit(e, damageDiamondEnemy))                         { hit = true; break; } }
      if (!hit) for (const e of nullstoneEnemies) { if (tryHit(e, damageNullstoneEnemy))                       { hit = true; break; } }
      if (!hit) for (const e of fracterylEnemies) { if (tryHit(e, (en, d, p) => damageFracterylEnemy(en, d, p))) { hit = true; break; } }
      if (!hit) for (const e of eigensteinEnemies) { if (tryHit(e, (en, d, p) => damageEigensteinEnemy(en, d, p))) { hit = true; break; } }
      if (!hit && bossEnemy) {
        const boss = bossEnemy;
        const dx = m.x - boss.x, dy = m.y - boss.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageBossEnemy(m.scaledDamage, 0);
          if (dmg > 0) {
            spawnHitVisualsAt(boss.x, boss.y, boss.maxHp, dmg, EMERALD_MISSILE_COLOR);
            fluid.addExplosion(boss.x, boss.y, FLUID_EXPLOSION_STRENGTH * 0.35,
              FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
          }
          hit = true;
        }
      }

      if (hit) {
        emeraldPlayerMissiles.splice(i, 1);
        removeDeadEnemies(); checkWaveCompletion();
      }
    }
  }

  function spawnEmeraldSwirlExplosion(ox: number, oy: number): void {
    for (let k = 0; k < EMERALD_SWIRL_COUNT; k++) {
      // Equidistant angles with a random offset for visual variety.
      const baseAngle = (k / EMERALD_SWIRL_COUNT) * Math.PI * 2 + Math.random() * 0.3;
      // Tangential component creates the swirl; outward component spreads the ring.
      const outward   = EMERALD_SWIRL_SPEED * (0.6 + Math.random() * 0.4);
      const tangential = EMERALD_SWIRL_SPEED * (0.5 + Math.random() * 0.5);
      const outX = Math.cos(baseAngle), outY = Math.sin(baseAngle);
      const tanX = -outY, tanY =  outX;
      emeraldSwirlParticles.push({
        x: ox, y: oy,
        vx: outX * outward + tanX * tangential,
        vy: outY * outward + tanY * tangential,
        lifeMs: EMERALD_SWIRL_LIFE_MS,
      });
    }
  }

  function updateEmeraldSubMissiles(deltaMs: number): void {
    const dt          = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const hitR2       = EMERALD_SUB_MISSILE_HIT_RADIUS * EMERALD_SUB_MISSILE_HIT_RADIUS;
    const detectR2    = EMERALD_SUB_MISSILE_DETECT_PX * EMERALD_SUB_MISSILE_DETECT_PX;
    const decelDrag   = Math.pow(EMERALD_SUB_MISSILE_FIZZLE_DRAG, dt);

    for (let i = emeraldSubMissiles.length - 1; i >= 0; i--) {
      const s = emeraldSubMissiles[i];

      // Advance total lifetime.
      s.lifetimeMs += deltaMs;

      // Fuel phase: homing active while lifetime < DECEL_START_MS.
      // Hard cutoff: if lifetime exceeds FUEL_MS, force stopped to trigger explosion.
      const isDecelerating = s.lifetimeMs >= EMERALD_SUB_MISSILE_DECEL_START_MS;
      if (s.lifetimeMs >= EMERALD_SUB_MISSILE_FUEL_MS) {
        s.vx = 0; s.vy = 0;
      }

      if (!isDecelerating) {
        // Still has fuel — seek nearest enemy within detection range.
        let nearestX: number | null = null;
        let nearestY: number | null = null;
        let nearestDist2 = Infinity;
        const checkTarget = (ex: number, ey: number) => {
          const d = (ex - s.x) * (ex - s.x) + (ey - s.y) * (ey - s.y);
          if (d < nearestDist2) { nearestDist2 = d; nearestX = ex; nearestY = ey; }
        };
        for (const e of enemies)           checkTarget(e.x, e.y);
        for (const e of sapphireEnemies)   checkTarget(e.x, e.y);
        for (const e of emeraldEnemies)    checkTarget(e.x, e.y);
        for (const e of amberEnemies)      checkTarget(e.x, e.y);
        for (const e of voidEnemies)       checkTarget(e.x, e.y);
        for (const e of quartzEnemies)     checkTarget(e.x, e.y);
        for (const e of rubyEnemies)       checkTarget(e.x, e.y);
        for (const e of sunstoneEnemies)   checkTarget(e.x, e.y);
        for (const e of citrineEnemies)    checkTarget(e.x, e.y);
        for (const e of ioliteEnemies)     checkTarget(e.x, e.y);
        for (const e of amethystEnemies)   checkTarget(e.x, e.y);
        for (const e of diamondEnemies)    checkTarget(e.x, e.y);
        for (const e of nullstoneEnemies)  checkTarget(e.x, e.y);
        for (const e of fracterylEnemies)  checkTarget(e.x, e.y);
        for (const e of eigensteinEnemies) checkTarget(e.x, e.y);
        if (bossEnemy) checkTarget(bossEnemy.x, bossEnemy.y);

        if (nearestDist2 <= detectR2 && nearestX !== null && nearestY !== null) {
          const ex = nearestX - s.x, ey = nearestY - s.y;
          const eDist = Math.sqrt(ex * ex + ey * ey);
          if (eDist > 0.01) {
            s.vx += (ex / eDist) * EMERALD_SUB_MISSILE_SEEK_STR * dt;
            s.vy += (ey / eDist) * EMERALD_SUB_MISSILE_SEEK_STR * dt;
          }
        }

        // Speed clamp while powered.
        const spd = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
        if (spd > EMERALD_SUB_MISSILE_MAX_SPEED) {
          const scale = EMERALD_SUB_MISSILE_MAX_SPEED / spd;
          s.vx *= scale; s.vy *= scale;
        }
      } else {
        // Fuel ran out — apply drag to gradually stop between seconds 2 and 4.
        s.vx *= decelDrag;
        s.vy *= decelDrag;
      }

      // Squiggle wobble while still powered.
      if (!isDecelerating) {
        s.squigglePhase += EMERALD_SUB_MISSILE_SQUIGGLE_HZ * dt;
        const spd0 = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
        if (spd0 > 0.01) {
          const perpX = -s.vy / spd0;
          const perpY =  s.vx / spd0;
          const wobble = Math.sin(s.squigglePhase) * EMERALD_SUB_MISSILE_SQUIGGLE * dt;
          s.vx += perpX * wobble;
          s.vy += perpY * wobble;
        }
      }

      s.x += s.vx * dt; s.y += s.vy * dt;

      // Wall bounce.
      if (s.x < 0)              { s.x = 0;          s.vx =  Math.abs(s.vx); }
      else if (s.x > widthPx)   { s.x = widthPx;    s.vx = -Math.abs(s.vx); }
      if (s.y < 0)              { s.y = 0;           s.vy =  Math.abs(s.vy); }
      else if (s.y > heightPx)  { s.y = heightPx;    s.vy = -Math.abs(s.vy); }

      // Trail update.
      s.trailX[s.trailHead] = s.x; s.trailY[s.trailHead] = s.y;
      s.trailHead = (s.trailHead + 1) % EMERALD_SUB_MISSILE_TRAIL_CAP;
      if (s.trailCount < EMERALD_SUB_MISSILE_TRAIL_CAP) s.trailCount++;

      // Fluid injection.
      fluid.addForce({
        x: s.x, y: s.y,
        vx: s.vx * FLUID_VEL_FRAME_TO_PX_S * 0.3,
        vy: s.vy * FLUID_VEL_FRAME_TO_PX_S * 0.3,
        r: FLUID_EMERALD_R, g: FLUID_EMERALD_G, b: FLUID_EMERALD_B,
        strength: FLUID_PROJECTILE_STRENGTH * 0.4,
      });

      // Post-stop delay: once decelerated and nearly stopped, count down then explode.
      if (isDecelerating && Math.sqrt(s.vx * s.vx + s.vy * s.vy) < EMERALD_SUB_MISSILE_STOP_SPEED) {
        s.stoppedMs += deltaMs;
        if (s.stoppedMs >= EMERALD_SUB_MISSILE_POST_STOP_DELAY_MS) {
          // AOE explosion with swirling green particles.
          const aoeR2 = EMERALD_SUB_MISSILE_AOE_PX * EMERALD_SUB_MISSILE_AOE_PX;
          fluid.addExplosion(s.x, s.y, FLUID_EXPLOSION_STRENGTH * 0.4,
            FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
          spawnEmeraldSwirlExplosion(s.x, s.y);
          const applyAoe = <T extends { x: number; y: number; hp: number; maxHp: number }>(
            arr: T[], damageFn: (e: T, dmg: number, pierce: number) => number,
          ) => {
            for (const e of arr) {
              const ddx = e.x - s.x, ddy = e.y - s.y;
              if (ddx * ddx + ddy * ddy <= aoeR2) {
                const dmg = damageFn(e, s.scaledDamage, 0);
                if (dmg > 0) spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, EMERALD_MISSILE_COLOR);
              }
            }
          };
          applyAoe(enemies,          damageEnemy);
          applyAoe(sapphireEnemies,  (e, d, p) => damageSapphireEnemy(e, d, p, false));
          applyAoe(emeraldEnemies,   damageEmeraldEnemy);
          applyAoe(amberEnemies,     damageAmberEnemy);
          applyAoe(voidEnemies,      damageVoidEnemy);
          applyAoe(quartzEnemies,    damageQuartzEnemy);
          applyAoe(rubyEnemies,      damageRubyEnemy);
          applyAoe(sunstoneEnemies,  damageSunstoneEnemy);
          applyAoe(citrineEnemies,   damageCitrineEnemy);
          applyAoe(ioliteEnemies,    damageIoliteEnemy);
          applyAoe(amethystEnemies,  (e, d, p) => damageAmethystEnemy(e, d, p, false));
          applyAoe(diamondEnemies,   damageDiamondEnemy);
          applyAoe(nullstoneEnemies, damageNullstoneEnemy);
          applyAoe(fracterylEnemies, (e, d, p) => damageFracterylEnemy(e, d, p));
          applyAoe(eigensteinEnemies,(e, d, p) => damageEigensteinEnemy(e, d, p));
          if (bossEnemy) {
            const bdx = bossEnemy.x - s.x, bdy = bossEnemy.y - s.y;
            if (bdx * bdx + bdy * bdy <= aoeR2) {
              const dmg = damageBossEnemy(s.scaledDamage, 0);
              if (dmg > 0) spawnHitVisualsAt(bossEnemy.x, bossEnemy.y, bossEnemy.maxHp, dmg, EMERALD_MISSILE_COLOR);
            }
          }
          emeraldSubMissiles.splice(i, 1);
          removeDeadEnemies(); checkWaveCompletion();
          continue;
        }
        // Still in post-stop delay — skip collision detection (missile is inert).
        continue;
      }

      // Collision detection — direct hit (only while in motion).
      let hit = false;
      const tryHitSub = <T extends { x: number; y: number; hp: number; maxHp: number }>(
        e: T,
        damageFn: (enemy: T, dmg: number, pierce: number) => number,
      ): boolean => {
        const dx = s.x - e.x, dy = s.y - e.y;
        if (dx * dx + dy * dy >= hitR2) return false;
        const dmg = damageFn(e, s.scaledDamage, 0);
        spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, EMERALD_MISSILE_COLOR);
        fluid.addExplosion(e.x, e.y, FLUID_EXPLOSION_STRENGTH * 0.2,
          FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
        return true;
      };
      for (const e of enemies)           { if (tryHitSub(e, damageEnemy))                                           { hit = true; break; } }
      if (!hit) for (const e of sapphireEnemies)  { if (tryHitSub(e, (en, d, p) => damageSapphireEnemy(en, d, p, false))) { hit = true; break; } }
      if (!hit) for (const e of emeraldEnemies)   { if (tryHitSub(e, damageEmeraldEnemy))                          { hit = true; break; } }
      if (!hit) for (const e of amberEnemies)     { if (tryHitSub(e, damageAmberEnemy))                            { hit = true; break; } }
      if (!hit) for (const e of voidEnemies)      { if (tryHitSub(e, damageVoidEnemy))                             { hit = true; break; } }
      if (!hit) for (const e of quartzEnemies)    { if (tryHitSub(e, damageQuartzEnemy))                           { hit = true; break; } }
      if (!hit) for (const e of rubyEnemies)      { if (tryHitSub(e, damageRubyEnemy))                             { hit = true; break; } }
      if (!hit) for (const e of sunstoneEnemies)  { if (tryHitSub(e, damageSunstoneEnemy))                         { hit = true; break; } }
      if (!hit) for (const e of citrineEnemies)   { if (tryHitSub(e, damageCitrineEnemy))                          { hit = true; break; } }
      if (!hit) for (const e of ioliteEnemies)    { if (tryHitSub(e, damageIoliteEnemy))                           { hit = true; break; } }
      if (!hit) for (const e of amethystEnemies)  { if (tryHitSub(e, (en, d, p) => damageAmethystEnemy(en, d, p, false))) { hit = true; break; } }
      if (!hit) for (const e of diamondEnemies)   { if (tryHitSub(e, damageDiamondEnemy))                          { hit = true; break; } }
      if (!hit) for (const e of nullstoneEnemies) { if (tryHitSub(e, damageNullstoneEnemy))                        { hit = true; break; } }
      if (!hit) for (const e of fracterylEnemies) { if (tryHitSub(e, (en, d, p) => damageFracterylEnemy(en, d, p))) { hit = true; break; } }
      if (!hit) for (const e of eigensteinEnemies) { if (tryHitSub(e, (en, d, p) => damageEigensteinEnemy(en, d, p))) { hit = true; break; } }
      if (!hit && bossEnemy) {
        const boss = bossEnemy;
        const dx = s.x - boss.x, dy = s.y - boss.y;
        if (dx * dx + dy * dy < hitR2) {
          const dmg = damageBossEnemy(s.scaledDamage, 0);
          if (dmg > 0) {
            spawnHitVisualsAt(boss.x, boss.y, boss.maxHp, dmg, EMERALD_MISSILE_COLOR);
            fluid.addExplosion(boss.x, boss.y, FLUID_EXPLOSION_STRENGTH * 0.2,
              FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
          }
          hit = true;
        }
      }
      if (hit) {
        emeraldSubMissiles.splice(i, 1);
        removeDeadEnemies(); checkWaveCompletion();
      }
    }
  }

  function updateEmeraldSwirlParticles(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const drag = Math.pow(EMERALD_SWIRL_DRAG, dt);
    for (let i = emeraldSwirlParticles.length - 1; i >= 0; i--) {
      const p = emeraldSwirlParticles[i];
      p.lifeMs -= deltaMs;
      if (p.lifeMs <= 0) { emeraldSwirlParticles.splice(i, 1); continue; }
      p.vx *= drag; p.vy *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }


  // ── Sunstone mine system ───────────────────────────────────────

  function layMine(scaledDamage: number, tier: number): void {
    const aoeRadius = SUNSTONE_MINE_AOE_BASE_PX + (tier - 1) * SUNSTONE_MINE_AOE_PER_TIER_PX;
    sunstoneMines.push({
      x: mote.x, y: mote.y,
      fuseMs: SUNSTONE_MINE_FUSE_MS,
      maxFuseMs: SUNSTONE_MINE_FUSE_MS,
      hp: SUNSTONE_MINE_HP,
      maxHp: SUNSTONE_MINE_HP,
      scaledDamage,
      aoeRadius,
      proximityRadius: SUNSTONE_MINE_PROXIMITY_PX,
    });
  }

  /**
   * Detonates a mine at the given index (removes it and applies AOE damage
   * to all enemies in aoeRadius).
   */
  function detonateMine(index: number): void {
    const mine = sunstoneMines[index];
    sunstoneMines.splice(index, 1);

    fluid.addExplosion(mine.x, mine.y, FLUID_EXPLOSION_STRENGTH * 1.4,
      255, 140, 40);

    const r2 = mine.aoeRadius * mine.aoeRadius;
    const applyAoe = <T extends { x: number; y: number; hp: number; maxHp: number }>(
      arr: T[],
      damageFn: (e: T, dmg: number, pierce: number) => number,
      color: string,
    ) => {
      for (const e of arr) {
        const dx = e.x - mine.x, dy = e.y - mine.y;
        if (dx * dx + dy * dy <= r2) {
          const dmg = damageFn(e, mine.scaledDamage, 0);
          if (dmg > 0) spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, color);
        }
      }
    };
    const col = '#ffaa22';
    applyAoe(enemies,          damageEnemy, col);
    applyAoe(sapphireEnemies,  (e, d, p) => damageSapphireEnemy(e, d, p, false), col);
    applyAoe(emeraldEnemies,   damageEmeraldEnemy, col);
    applyAoe(amberEnemies,     damageAmberEnemy, col);
    applyAoe(voidEnemies,      damageVoidEnemy, col);
    applyAoe(quartzEnemies,    damageQuartzEnemy, col);
    applyAoe(rubyEnemies,      damageRubyEnemy, col);
    applyAoe(sunstoneEnemies,  damageSunstoneEnemy, col);
    applyAoe(citrineEnemies,   damageCitrineEnemy, col);
    applyAoe(ioliteEnemies,    damageIoliteEnemy, col);
    applyAoe(amethystEnemies,  (e, d, p) => damageAmethystEnemy(e, d, p, false), col);
    applyAoe(diamondEnemies,   damageDiamondEnemy, col);
    applyAoe(nullstoneEnemies, damageNullstoneEnemy, col);
    applyAoe(fracterylEnemies, (e, d, p) => damageFracterylEnemy(e, d, p), col);
    applyAoe(eigensteinEnemies,(e, d, p) => damageEigensteinEnemy(e, d, p), col);
    if (bossEnemy) {
      const dx = bossEnemy.x - mine.x, dy = bossEnemy.y - mine.y;
      if (dx * dx + dy * dy <= r2) {
        const dmg = damageBossEnemy(mine.scaledDamage, 0);
        if (dmg > 0) spawnHitVisualsAt(bossEnemy.x, bossEnemy.y, bossEnemy.maxHp, dmg, col);
      }
    }
    removeDeadEnemies(); checkWaveCompletion();
  }

  function updateSunstoneMines(deltaMs: number): void {
    for (let i = sunstoneMines.length - 1; i >= 0; i--) {
      const mine = sunstoneMines[i];

      // Fuse countdown.
      mine.fuseMs -= deltaMs;

      // Apply incoming damage from enemies that overlap the mine.
      const mineHitR = SUNSTONE_MINE_SIZE + 2;
      const mineHitR2 = mineHitR * mineHitR;
      const checkEnemyContact = (ex: number, ey: number, atk: number) => {
        const dx = ex - mine.x, dy = ey - mine.y;
        if (dx * dx + dy * dy <= mineHitR2) {
          mine.hp -= atk;
        }
      };
      for (const e of enemies)          checkEnemyContact(e.x, e.y, e.atk);
      for (const e of sapphireEnemies)  checkEnemyContact(e.x, e.y, e.atk);
      for (const e of emeraldEnemies)   checkEnemyContact(e.x, e.y, e.atk);
      for (const e of amberEnemies)     checkEnemyContact(e.x, e.y, e.atk);
      for (const e of voidEnemies)      checkEnemyContact(e.x, e.y, e.atk);
      for (const e of quartzEnemies)    checkEnemyContact(e.x, e.y, e.atk);
      for (const e of rubyEnemies)      checkEnemyContact(e.x, e.y, e.atk);
      for (const e of sunstoneEnemies)  checkEnemyContact(e.x, e.y, e.atk);
      for (const e of citrineEnemies)   checkEnemyContact(e.x, e.y, e.atk);
      for (const e of ioliteEnemies)    checkEnemyContact(e.x, e.y, e.atk);
      for (const e of amethystEnemies)  checkEnemyContact(e.x, e.y, e.atk);
      for (const e of diamondEnemies)   checkEnemyContact(e.x, e.y, e.atk);
      for (const e of nullstoneEnemies) checkEnemyContact(e.x, e.y, e.atk);
      for (const e of fracterylEnemies) checkEnemyContact(e.x, e.y, e.atk);
      for (const e of eigensteinEnemies) checkEnemyContact(e.x, e.y, e.atk);

      // Proximity check — detonate if any enemy enters trigger radius.
      let triggered = false;
      const prox2 = mine.proximityRadius * mine.proximityRadius;
      const inProximity = (ex: number, ey: number) => {
        const dx = ex - mine.x, dy = ey - mine.y;
        return dx * dx + dy * dy <= prox2;
      };
      if (!triggered) for (const e of enemies)          { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of sapphireEnemies)  { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of emeraldEnemies)   { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of amberEnemies)     { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of voidEnemies)      { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of quartzEnemies)    { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of rubyEnemies)      { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of sunstoneEnemies)  { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of citrineEnemies)   { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of ioliteEnemies)    { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of amethystEnemies)  { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of diamondEnemies)   { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of nullstoneEnemies) { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of fracterylEnemies) { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of eigensteinEnemies) { if (inProximity(e.x, e.y)) { triggered = true; break; } }

      // Detonate if fuse expired, proximity triggered, or HP depleted by incoming damage.
      if (mine.fuseMs <= 0 || triggered || mine.hp <= 0) {
        detonateMine(i);
      }
    }
  }


  // ── Ruby laser beam system ─────────────────────────────────────

  function fireLaserBeam(targetX: number, targetY: number, weaponId: string): void {
    const dx = targetX - mote.x, dy = targetY - mote.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) return;
    const dirX = dx / dist, dirY = dy / dist;
    laserBeamEffect = { active: true, startX: mote.x, startY: mote.y, dirX, dirY, timerMs: LASER_BEAM_VISIBLE_MS, endX: 0, endY: 0 };

    // Compute the endpoint (extend to canvas edge)
    let tMax = Infinity;
    if (dirX > 0)  tMax = Math.min(tMax, (widthPx  - mote.x) / dirX);
    if (dirX < 0)  tMax = Math.min(tMax, -mote.x / dirX);
    if (dirY > 0)  tMax = Math.min(tMax, (heightPx - mote.y) / dirY);
    if (dirY < 0)  tMax = Math.min(tMax, -mote.y / dirY);
    const endX = mote.x + dirX * tMax;
    const endY = mote.y + dirY * tMax;

    const weaponDef = WEAPON_BY_ID.get(weaponId);
    const tier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const baseDamage = getScaledWeaponDamage(weaponDef?.stats.damage ?? 80, tier, playerStats.atk);

    // Hit every laser enemy on the beam path
    for (const e of enemies) {
      // Point-to-line distance
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= LASER_ENEMY_SIZE * 2) {
        const dmg = damageEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit every sapphire enemy on the beam path (bypasses shield)
    for (const e of sapphireEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= SAPPHIRE_SHIELD_RADIUS + 2) {
        const dmg = damageSapphireEnemy(e, baseDamage, 1.0, true);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit missiles on the beam path
    for (const m of sapphireMissiles) {
      const ex = m.x - mote.x, ey = m.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= MISSILE_SIZE * 2) {
        damageMissile(m, baseDamage);
      }
    }

    // Hit emerald enemies on the beam path
    for (const e of emeraldEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= EMERALD_ENEMY_SIZE * 2) {
        const dmg = damageEmeraldEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit amber enemies on the beam path
    for (const e of amberEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= AMBER_ENEMY_SIZE * 2) {
        const dmg = damageAmberEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit amber shards on the beam path
    for (const s of amberShards) {
      const ex = s.x - mote.x, ey = s.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= AMBER_SHARD_SIZE * 2) {
        damageAmberShard(s, baseDamage);
      }
    }

    // Hit void enemies on the beam path
    for (const e of voidEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= VOID_ENEMY_SIZE * 2) {
        const dmg = damageVoidEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit quartz enemies on the beam path
    for (const e of quartzEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= QUARTZ_ENEMY_SIZE * 2) {
        const dmg = damageQuartzEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit ruby enemies on the beam path
    for (const e of rubyEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= RUBY_ENEMY_SIZE * 2) {
        const dmg = damageRubyEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit sunstone enemies on the beam path
    for (const e of sunstoneEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= SUNSTONE_ENEMY_SIZE * 2) {
        const dmg = damageSunstoneEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit citrine enemies on the beam path
    for (const e of citrineEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= CITRINE_ENEMY_SIZE * 2) {
        const dmg = damageCitrineEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit iolite enemies on the beam path
    for (const e of ioliteEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= IOLITE_ENEMY_SIZE * 2) {
        const dmg = damageIoliteEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit amethyst enemies on the beam path (bypasses shield)
    for (const e of amethystEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= AMETHYST_ENEMY_SIZE * 2) {
        const dmg = damageAmethystEnemy(e, baseDamage, 1.0, true);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit diamond enemies on the beam path
    for (const e of diamondEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= DIAMOND_ENEMY_SIZE * 2) {
        const dmg = damageDiamondEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit nullstone enemies on the beam path
    for (const e of nullstoneEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= NULLSTONE_ENEMY_SIZE * 2) {
        const dmg = damageNullstoneEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit fracteryl enemies on the beam path
    for (const e of fracterylEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= FRACTERYL_ENEMY_SIZE * 2) {
        const dmg = damageFracterylEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit eigenstein enemies on the beam path
    for (const e of eigensteinEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= EIGENSTEIN_ENEMY_SIZE * 2) {
        const dmg = damageEigensteinEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit boss on the beam path
    if (bossEnemy) {
      const bossSize = BOSS_SIZE_BASE + bossEnemy.bossId * 1.5;
      const ex = bossEnemy.x - mote.x, ey = bossEnemy.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj >= 0 && tProj <= tMax) {
        const perpDist = Math.abs(ex * dirY - ey * dirX);
        if (perpDist <= bossSize) {
          const dmg = damageBossEnemy(baseDamage, 1.0);
          if (dmg > 0) {
            hitEffects.push({ x: bossEnemy.x, y: bossEnemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
            spawnDamageNumber(bossEnemy.x, bossEnemy.y, 0, -1, String(Math.round(dmg)), dmg / bossEnemy.maxHp, LASER_BEAM_COLOR);
          }
        }
      }
    }

    // Store end coords for drawing
    laserBeamEffect.startX = mote.x; laserBeamEffect.startY = mote.y;
    laserBeamEffect.endX = endX;
    laserBeamEffect.endY = endY;

    // Inject beam force along its length: sample multiple points from muzzle
    // to edge, creating a strong directional fluid channel in the beam color.
    const beamLen = tMax;
    const beamSteps = Math.max(4, Math.floor(beamLen / 20));
    for (let k = 0; k <= beamSteps; k++) {
      const t = k / beamSteps;
      fluid.addForce({
        x: mote.x + dirX * beamLen * t,
        y: mote.y + dirY * beamLen * t,
        vx: dirX * FLUID_VEL_FRAME_TO_PX_S * 3.0,
        vy: dirY * FLUID_VEL_FRAME_TO_PX_S * 3.0,
        r: FLUID_BEAM_R, g: FLUID_BEAM_G, b: FLUID_BEAM_B,
        strength: FLUID_LASER_BEAM_STRENGTH,
      });
    }
  }

  function updateLaserBeamEffect(deltaMs: number): void {
    if (!laserBeamEffect || !laserBeamEffect.active) return;
    laserBeamEffect.timerMs -= deltaMs;
    if (laserBeamEffect.timerMs <= 0) laserBeamEffect.active = false;
  }

  // ── Sapphire / Amethyst Companion Ship Systems ────────────────

  /**
   * Syncs sapphire ships to match equipped weapon tier.
   * Call when weapon equip state changes.
   */
  function syncSapphireShips(): void {
    let equippedTier = 0;
    let baseDamage = 0;
    for (const weaponId of getEffectiveEquippedIds()) {
      const wd = WEAPON_BY_ID.get(weaponId);
      if (wd?.stats.effect?.kind === 'sapphireShip') {
        equippedTier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
        baseDamage = wd.stats.damage;
        break;
      }
    }

    while (sapphireShips.length > equippedTier) sapphireShips.pop();
    while (sapphireShips.length < equippedTier) {
      const angle = (sapphireShips.length / equippedTier) * Math.PI * 2;
      sapphireShips.push({
        x: mote.x + Math.cos(angle) * SAPPHIRE_SHIP_ORBIT_RADIUS,
        y: mote.y + Math.sin(angle) * SAPPHIRE_SHIP_ORBIT_RADIUS,
        vx: 0,
        vy: 0,
        orbitAngle: angle,
        fireCooldownMs: Math.random() * SAPPHIRE_SHIP_FIRE_MS,
        baseDamage,
        trailX: new Float64Array(SAPPHIRE_SHIP_TRAIL_CAP),
        trailY: new Float64Array(SAPPHIRE_SHIP_TRAIL_CAP),
        trailHead: 0,
        trailCount: 0,
      });
    }
    for (const ship of sapphireShips) ship.baseDamage = baseDamage;
  }

  /**
   * Syncs amethyst ships to match equipped weapon tier.
   * Call when weapon equip state changes.
   */
  function syncAmethystShips(): void {
    let equippedTier = 0;
    let baseDamage = 0;
    for (const weaponId of getEffectiveEquippedIds()) {
      const wd = WEAPON_BY_ID.get(weaponId);
      if (wd?.stats.effect?.kind === 'amethystShip') {
        equippedTier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
        baseDamage = wd.stats.damage;
        break;
      }
    }

    while (amethystShips.length > equippedTier) amethystShips.pop();
    while (amethystShips.length < equippedTier) {
      const angle = (amethystShips.length / equippedTier) * Math.PI * 2;
      amethystShips.push({
        x: mote.x + Math.cos(angle) * AMETHYST_SHIP_ORBIT_RADIUS,
        y: mote.y + Math.sin(angle) * AMETHYST_SHIP_ORBIT_RADIUS,
        vx: 0,
        vy: 0,
        orbitAngle: angle,
        fireCooldownMs: Math.random() * AMETHYST_SHIP_FIRE_MS,
        baseDamage,
        trailX: new Float64Array(AMETHYST_SHIP_TRAIL_CAP),
        trailY: new Float64Array(AMETHYST_SHIP_TRAIL_CAP),
        trailHead: 0,
        trailCount: 0,
      });
    }
    for (const ship of amethystShips) ship.baseDamage = baseDamage;
  }

  function updateShipTrail(
    x: number,
    y: number,
    trailX: Float64Array,
    trailY: Float64Array,
    state: { trailHead: number; trailCount: number },
  ): void {
    trailX[state.trailHead] = x;
    trailY[state.trailHead] = y;
    state.trailHead = (state.trailHead + 1) % trailX.length;
    if (state.trailCount < trailX.length) state.trailCount++;
  }

  /**
   * Updates sapphire ships: orbit around targeted enemy (or player),
   * fire curving lasers at nearby enemies.
   */
  function updateSapphireShips(deltaMs: number): void {
    if (sapphireShips.length === 0) return;
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const effectiveTarget = getTargetedEnemy();
    const targetX = effectiveTarget ? effectiveTarget.x : mote.x;
    const targetY = effectiveTarget ? effectiveTarget.y : mote.y;

    for (let i = 0; i < sapphireShips.length; i++) {
      const ship = sapphireShips[i];
      ship.orbitAngle += 2.6 * (deltaMs / 1000);
      const angleOffset = (i / sapphireShips.length) * Math.PI * 2;
      const desiredX = targetX + Math.cos(ship.orbitAngle + angleOffset) * SAPPHIRE_SHIP_ORBIT_RADIUS;
      const desiredY = targetY + Math.sin(ship.orbitAngle + angleOffset) * SAPPHIRE_SHIP_ORBIT_RADIUS;

      const dx = desiredX - ship.x;
      const dy = desiredY - ship.y;
      const moveSpeed = SAPPHIRE_SHIP_MAX_SPEED * dt;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > moveSpeed) {
        ship.vx = (dx / dist) * moveSpeed;
        ship.vy = (dy / dist) * moveSpeed;
        ship.x += ship.vx;
        ship.y += ship.vy;
      } else {
        ship.vx = desiredX - ship.x;
        ship.vy = desiredY - ship.y;
        ship.x = desiredX;
        ship.y = desiredY;
      }
      updateShipTrail(ship.x, ship.y, ship.trailX, ship.trailY, ship);

      const nearestEnemy = findClosestEnemyFrom(ship.x, ship.y, SAPPHIRE_SHIP_LASER_RANGE * SAPPHIRE_SHIP_LASER_RANGE);
      ship.fireCooldownMs -= deltaMs;
      if (ship.fireCooldownMs <= 0 && nearestEnemy) {
        ship.fireCooldownMs += SAPPHIRE_SHIP_FIRE_MS;
        spawnSapphireLaser(ship, nearestEnemy);
      }
    }
  }

  /**
   * Spawns a sapphire laser from a ship toward a target enemy.
   */
  function spawnSapphireLaser(ship: SapphireShip, target: ClosestTarget): void {
    const weaponId = findEquippedWeaponIdByEffect('sapphireShip');
    const tier = weaponId ? (rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1) : 1;
    const scaledDamage = getScaledWeaponDamage(ship.baseDamage, tier, playerStats.atk);
    const baseAngle = Math.atan2(target.y - ship.y, target.x - ship.x);
    const angle = baseAngle + (Math.random() * 2 - 1) * SAPPHIRE_LASER_SPREAD_RAD;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const lateralDir = Math.random() > 0.5 ? 1 : -1;
    sapphireLasers.push({
      x: ship.x,
      y: ship.y,
      vx: dirX * SAPPHIRE_LASER_SPEED,
      vy: dirY * SAPPHIRE_LASER_SPEED,
      lateralVx: -dirY * SAPPHIRE_LASER_LATERAL_VEL * lateralDir,
      lateralVy: dirX * SAPPHIRE_LASER_LATERAL_VEL * lateralDir,
      curveDir: lateralDir,
      lifeMs: SAPPHIRE_LASER_LIFE_MS,
      scaledDamage,
      trailX: new Float64Array(SAPPHIRE_LASER_TRAIL_CAP),
      trailY: new Float64Array(SAPPHIRE_LASER_TRAIL_CAP),
      trailHead: 0,
      trailCount: 0,
    });
  }

  /**
   * Updates sapphire lasers: move with curve, check collisions, despawn.
   */
  function updateSapphireLasers(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const weaponId = findEquippedWeaponIdByEffect('sapphireShip');
    withDamageSource(weaponId, () => {
      for (let i = sapphireLasers.length - 1; i >= 0; i--) {
        const laser = sapphireLasers[i];
        laser.lifeMs -= deltaMs;
        const speed = Math.sqrt(laser.vx * laser.vx + laser.vy * laser.vy);
        if (speed > 0.001) {
          const angle = Math.atan2(laser.vy, laser.vx) + SAPPHIRE_LASER_CURVE_RATE * laser.curveDir * dt;
          laser.vx = Math.cos(angle) * speed;
          laser.vy = Math.sin(angle) * speed;
        }
        laser.x += (laser.vx + laser.lateralVx) * dt;
        laser.y += (laser.vy + laser.lateralVy) * dt;
        laser.lateralVx *= Math.pow(SAPPHIRE_LASER_LATERAL_DECAY, dt);
        laser.lateralVy *= Math.pow(SAPPHIRE_LASER_LATERAL_DECAY, dt);
        updateShipTrail(laser.x, laser.y, laser.trailX, laser.trailY, laser);

        const hitTarget = findClosestEnemyFrom(laser.x, laser.y, SAPPHIRE_LASER_HIT_RADIUS * SAPPHIRE_LASER_HIT_RADIUS);
        if (hitTarget) {
          const dmg = damageBodyTarget(hitTarget, laser.scaledDamage, 0.2, false);
          if (dmg > 0) {
            spawnDamageNumber(hitTarget.x, hitTarget.y, 0, -1, String(Math.round(dmg)), dmg / Math.max(1, getTargetMaxHp(hitTarget)), SAPPHIRE_LASER_COLOR);
            hitEffects.push({ x: hitTarget.x, y: hitTarget.y, timerMs: HIT_EFFECT_DURATION_MS, color: SAPPHIRE_LASER_GLOW });
          }
          sapphireLasers.splice(i, 1);
          continue;
        }

        if (laser.lifeMs <= 0 || laser.x < -50 || laser.x > widthPx + 50 || laser.y < -50 || laser.y > heightPx + 50) {
          sapphireLasers.splice(i, 1);
        }
      }
    });
  }

  function getTargetMaxHp(target: ClosestTarget): number {
    return target.laser?.maxHp ?? target.sapphire?.maxHp ?? target.emerald?.maxHp ?? target.amber?.maxHp
      ?? target.void?.maxHp ?? target.quartz?.maxHp ?? target.ruby?.maxHp ?? target.sunstone?.maxHp
      ?? target.citrine?.maxHp ?? target.iolite?.maxHp ?? target.amethyst?.maxHp ?? target.diamond?.maxHp
      ?? target.nullstone?.maxHp ?? target.fracteryl?.maxHp ?? target.eigenstein?.maxHp ?? target.boss?.maxHp ?? 1;
  }

  /**
   * Updates amethyst ships: orbit around furthest enemy (or player),
   * fire spiraling pierce lasers every 3 seconds.
   */
  function updateAmethystShips(deltaMs: number): void {
    if (amethystShips.length === 0) return;
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const targets = collectEnemyBodyTargets().sort((a, b) => b.distSq - a.distSq);

    for (let i = 0; i < amethystShips.length; i++) {
      const ship = amethystShips[i];
      const target = targets.length > 0 ? targets[i % targets.length] : null;
      const targetX = target ? target.x : mote.x;
      const targetY = target ? target.y : mote.y;
      ship.orbitAngle += 1.7 * (deltaMs / 1000);
      const angleOffset = (i / amethystShips.length) * Math.PI * 2;
      const desiredX = targetX + Math.cos(ship.orbitAngle + angleOffset) * AMETHYST_SHIP_ORBIT_RADIUS;
      const desiredY = targetY + Math.sin(ship.orbitAngle + angleOffset) * AMETHYST_SHIP_ORBIT_RADIUS;

      const dx = desiredX - ship.x;
      const dy = desiredY - ship.y;
      const moveSpeed = AMETHYST_SHIP_MAX_SPEED * dt;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > moveSpeed) {
        ship.vx = (dx / dist) * moveSpeed;
        ship.vy = (dy / dist) * moveSpeed;
        ship.x += ship.vx;
        ship.y += ship.vy;
      } else {
        ship.vx = desiredX - ship.x;
        ship.vy = desiredY - ship.y;
        ship.x = desiredX;
        ship.y = desiredY;
      }
      updateShipTrail(ship.x, ship.y, ship.trailX, ship.trailY, ship);

      ship.fireCooldownMs -= deltaMs;
      if (ship.fireCooldownMs <= 0 && target) {
        ship.fireCooldownMs += AMETHYST_SHIP_FIRE_MS;
        spawnAmethystLaser(ship, target);
      }
    }
  }

  /**
   * Spawns an amethyst laser from a ship toward a target enemy.
   */
  function spawnAmethystLaser(ship: AmethystShip, target: ClosestTarget): void {
    const angle = Math.atan2(ship.y - target.y, ship.x - target.x);

    // Calculate damage based on weapon tier (30× base damage)
    const weaponId = findEquippedWeaponIdByEffect('amethystShip');
    const tier = weaponId ? (rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1) : 1;
    const scaledDamage = getScaledWeaponDamage(ship.baseDamage, tier, playerStats.atk) * AMETHYST_LASER_DAMAGE_MULT;

    amethystLasers.push({
      x: target.x + Math.cos(angle) * AMETHYST_LASER_INITIAL_RADIUS,
      y: target.y + Math.sin(angle) * AMETHYST_LASER_INITIAL_RADIUS,
      centerX: target.x,
      centerY: target.y,
      radius: AMETHYST_LASER_INITIAL_RADIUS,
      angle,
      lifeMs: AMETHYST_LASER_DURATION_MS,
      scaledDamage,
      piercedEnemies: new Set(),
      targetEnemy: target.boss ?? target.eigenstein ?? target.fracteryl ?? target.nullstone ?? target.diamond
        ?? target.amethyst ?? target.iolite ?? target.citrine ?? target.sunstone ?? target.ruby
        ?? target.quartz ?? target.void ?? target.amber ?? target.emerald ?? target.sapphire ?? target.laser ?? null,
      trailX: new Float64Array(AMETHYST_LASER_TRAIL_CAP),
      trailY: new Float64Array(AMETHYST_LASER_TRAIL_CAP),
      trailHead: 0,
      trailCount: 0,
    });
  }

  /**
   * Updates amethyst lasers: move with spiral, pierce through enemies.
   */
  function updateAmethystLasers(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const weaponId = findEquippedWeaponIdByEffect('amethystShip');
    withDamageSource(weaponId, () => {
      const liveTargets = collectEnemyBodyTargets();
      for (let i = amethystLasers.length - 1; i >= 0; i--) {
        const laser = amethystLasers[i];
        laser.lifeMs -= deltaMs;
        const targetStillAlive = laser.targetEnemy === null || liveTargets.some(t =>
          t.laser === laser.targetEnemy || t.sapphire === laser.targetEnemy || t.emerald === laser.targetEnemy ||
          t.amber === laser.targetEnemy || t.void === laser.targetEnemy || t.quartz === laser.targetEnemy ||
          t.ruby === laser.targetEnemy || t.sunstone === laser.targetEnemy || t.citrine === laser.targetEnemy ||
          t.iolite === laser.targetEnemy || t.amethyst === laser.targetEnemy || t.diamond === laser.targetEnemy ||
          t.nullstone === laser.targetEnemy || t.fracteryl === laser.targetEnemy || t.eigenstein === laser.targetEnemy ||
          t.boss === laser.targetEnemy
        );
        if (!targetStillAlive) {
          amethystLasers.splice(i, 1);
          continue;
        }

        if (laser.targetEnemy && 'x' in laser.targetEnemy && 'y' in laser.targetEnemy) {
          const targetPos = laser.targetEnemy as { x: number; y: number };
          laser.centerX = targetPos.x;
          laser.centerY = targetPos.y;
        }
        laser.angle += AMETHYST_LASER_ANGULAR_SPEED * dt;
        laser.radius = Math.max(0, laser.radius - (AMETHYST_LASER_INITIAL_RADIUS / (AMETHYST_LASER_DURATION_MS / TARGET_FRAME_MS)) * dt);
        laser.x = laser.centerX + Math.cos(laser.angle) * laser.radius;
        laser.y = laser.centerY + Math.sin(laser.angle) * laser.radius;
        updateShipTrail(laser.x, laser.y, laser.trailX, laser.trailY, laser);

        let hitIntendedTarget = false;
        for (const target of liveTargets) {
          const targetObj = target.boss ?? target.eigenstein ?? target.fracteryl ?? target.nullstone ?? target.diamond
            ?? target.amethyst ?? target.iolite ?? target.citrine ?? target.sunstone ?? target.ruby
            ?? target.quartz ?? target.void ?? target.amber ?? target.emerald ?? target.sapphire ?? target.laser ?? null;
          if (targetObj !== laser.targetEnemy && targetObj !== null && laser.piercedEnemies.has(targetObj)) continue;
          const dx = target.x - laser.x, dy = target.y - laser.y;
          if (dx * dx + dy * dy > AMETHYST_LASER_HIT_RADIUS * AMETHYST_LASER_HIT_RADIUS) continue;
          if (targetObj !== null) laser.piercedEnemies.add(targetObj);
          const dmg = damageBodyTarget(target, laser.scaledDamage, 0.5, true);
          if (dmg > 0) {
            spawnDamageNumber(target.x, target.y, 0, -1, String(Math.round(dmg)), dmg / Math.max(1, getTargetMaxHp(target)), AMETHYST_LASER_COLOR);
            hitEffects.push({ x: target.x, y: target.y, timerMs: HIT_EFFECT_DURATION_MS, color: AMETHYST_LASER_GLOW });
          }
          if (targetObj === laser.targetEnemy) hitIntendedTarget = true;
        }

        if (hitIntendedTarget || laser.lifeMs <= 0 || laser.radius <= 0) {
          amethystLasers.splice(i, 1);
        }
      }
    });
  }



  /**
   * Fires the specified weapon at the nearest enemy within range.
   * Handles all WeaponEffect variants. Call removeDeadEnemies() after this.
   */
  function performWeaponAttack(weaponId: string): void {
    const weaponDef  = WEAPON_BY_ID.get(weaponId);

    // Sunstone mines can always be placed (no target needed).
    if (weaponDef?.stats.effect?.kind === 'sunstoneMine') {
      const tier       = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
      const rawDamage  = weaponDef
        ? getScaledWeaponDamage(weaponDef.stats.damage, tier, playerStats.atk)
        : playerStats.atk;
      layMine(rawDamage, tier);
      return;
    }

    const totalTargets = enemies.length + sapphireEnemies.length + sapphireMissiles.length
      + emeraldEnemies.length + amberEnemies.length + amberShards.length + voidEnemies.length
      + quartzEnemies.length + quartzSpikes.length + rubyEnemies.length + rubyBolts.length
      + sunstoneEnemies.length + citrineEnemies.length + citrineBolts.length
      + ioliteEnemies.length + amethystEnemies.length + amethystShards.length
      + diamondEnemies.length + diamondShards.length + nullstoneEnemies.length + voidTendrils.length
      + fracterylEnemies.length + fracterylShards.length + eigensteinEnemies.length
      + (bossEnemy ? 1 : 0);
    if (totalTargets === 0) return;
    const range      = weaponDef?.stats.range ?? PLAYER_BASE_RANGE_PX;
    const tier       = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const rawDamage  = weaponDef
      ? getScaledWeaponDamage(weaponDef.stats.damage, tier, playerStats.atk)
      : playerStats.atk;
    const effect     = weaponDef?.stats.effect ?? { kind: 'single' as const };
    const shotColor  = '#ffd764';

    // ── Gatling gun ────────────────────────────────────────────
    if (effect.kind === 'gatling') {
      const target = findClosestTarget(range * range);
      if (target) spawnSandProjectile(target.x, target.y, rawDamage);
      return;
    }

    // ── Chain whip ─────────────────────────────────────────────
    if (effect.kind === 'chainWhip') {
      // The chain whip handles its own lash triggering in updateChainWhip().
      return;
    }

    // ── Vortex / sword combo — self-managed, never called here ─
    if (effect.kind === 'vortex' || effect.kind === 'swordCombo') return;

    // ── Poison bolt ────────────────────────────────────────────
    if (effect.kind === 'poisonBolt') {
      const target = findClosestTarget(range * range);
      if (target) spawnPoisonBolt(target.x, target.y, weaponId, tier, rawDamage);
      return;
    }

    // ── Emerald heat-seeking missile ───────────────────────────
    if (effect.kind === 'emeraldMissile') {
      const target = findClosestTarget(range * range);
      if (target) spawnEmeraldMissile(target.x, target.y, rawDamage, tier);
      return;
    }

    // ── Ruby laser beam ────────────────────────────────────────
    if (effect.kind === 'laserBeam') {
      const target = findClosestTarget(range * range);
      if (target) fireLaserBeam(target.x, target.y, weaponId);
      return;
    }

    if (effect.kind === 'aoe') {
      const aoeRadius = effect.aoeRadius;
      for (const enemy of enemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageEnemy(enemy, rawDamage, 0);
          spawnHitVisuals(enemy, dmg, '#e6c850');
        }
      }
      for (const enemy of sapphireEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageSapphireEnemy(enemy, rawDamage, 0, false);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of emeraldEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageEmeraldEnemy(enemy, rawDamage, 0);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of amberEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageAmberEnemy(enemy, rawDamage, 0);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of voidEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageVoidEnemy(enemy, rawDamage, 0);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of quartzEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageQuartzEnemy(enemy, rawDamage, 0);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of rubyEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageRubyEnemy(enemy, rawDamage, 0);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of sunstoneEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageSunstoneEnemy(enemy, rawDamage, 0);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of citrineEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageCitrineEnemy(enemy, rawDamage, 0);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of ioliteEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageIoliteEnemy(enemy, rawDamage, 0);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of amethystEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageAmethystEnemy(enemy, rawDamage, 0, false);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of diamondEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageDiamondEnemy(enemy, rawDamage, 0);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of nullstoneEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageNullstoneEnemy(enemy, rawDamage, 0);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of fracterylEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageFracterylEnemy(enemy, rawDamage, 0);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of eigensteinEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageEigensteinEnemy(enemy, rawDamage, 0);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      if (bossEnemy) {
        const dx = bossEnemy.x - mote.x, dy = bossEnemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageBossEnemy(rawDamage, 0);
          if (dmg > 0) spawnHitVisualsAt(bossEnemy.x, bossEnemy.y, bossEnemy.maxHp, dmg, '#e6c850');
        }
      }
      fluid.addExplosion(mote.x, mote.y, FLUID_EXPLOSION_STRENGTH,
        FLUID_PLAYER_R, FLUID_PLAYER_G, FLUID_PLAYER_B);
      return;
    }

    if (effect.kind === 'multi') {
      type SortEntry = {
        distSq: number;
        laser?: LaserEnemy; sapphire?: SapphireEnemy; missile?: SapphireMissile;
        emerald?: EmeraldEnemy; amber?: AmberEnemy; ambershard?: AmberShard; void?: VoidEnemy;
        quartz?: QuartzEnemy; quartzspike?: QuartzSpike; ruby?: RubyEnemy; rubybolt?: RubyBolt;
        sunstone?: SunstoneEnemy; citrine?: CitrineEnemy; citrinebolt?: CitrineBolt;
        iolite?: IoliteEnemy; amethyst?: AmethystEnemy; amethystshard?: AmethystShard;
        diamond?: DiamondEnemy; diamondshard?: DiamondShard; nullstone?: NullstoneEnemy; voidtendril?: VoidTendril;
        fracteryl?: FracterylEnemy; fracterylshard?: FracterylShard; eigenstein?: EigensteinEnemy;
        boss?: BossEnemy;
      };
      const rangeSq = range * range;
      const inRange: SortEntry[] = [];
      for (const e of enemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, laser: e });
      }
      for (const e of sapphireEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, sapphire: e });
      }
      for (const m of sapphireMissiles) {
        const dx = m.x - mote.x, dy = m.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, missile: m });
      }
      for (const e of emeraldEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, emerald: e });
      }
      for (const e of amberEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, amber: e });
      }
      for (const s of amberShards) {
        const dx = s.x - mote.x, dy = s.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, ambershard: s });
      }
      for (const e of voidEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, void: e });
      }
      for (const e of quartzEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, quartz: e });
      }
      for (const s of quartzSpikes) {
        const dx = s.x - mote.x, dy = s.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, quartzspike: s });
      }
      for (const e of rubyEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, ruby: e });
      }
      for (const b of rubyBolts) {
        const dx = b.x - mote.x, dy = b.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, rubybolt: b });
      }
      for (const e of sunstoneEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, sunstone: e });
      }
      for (const e of citrineEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, citrine: e });
      }
      for (const b of citrineBolts) {
        const dx = b.x - mote.x, dy = b.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, citrinebolt: b });
      }
      for (const e of ioliteEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, iolite: e });
      }
      for (const e of amethystEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, amethyst: e });
      }
      for (const s of amethystShards) {
        const dx = s.x - mote.x, dy = s.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, amethystshard: s });
      }
      for (const e of diamondEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, diamond: e });
      }
      for (const s of diamondShards) {
        const dx = s.x - mote.x, dy = s.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, diamondshard: s });
      }
      for (const e of nullstoneEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, nullstone: e });
      }
      for (const t of voidTendrils) {
        const dx = t.x - mote.x, dy = t.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, voidtendril: t });
      }
      for (const e of fracterylEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, fracteryl: e });
      }
      for (const s of fracterylShards) {
        const dx = s.x - mote.x, dy = s.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, fracterylshard: s });
      }
      for (const e of eigensteinEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, eigenstein: e });
      }
      if (bossEnemy) {
        const dx = bossEnemy.x - mote.x, dy = bossEnemy.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, boss: bossEnemy });
      }
      inRange.sort((a, b) => a.distSq - b.distSq);
      const targets = inRange.slice(0, effect.targetCount);
      for (const t of targets) {
        if (t.laser) {
          const dmg = damageEnemy(t.laser, rawDamage, 0);
          spawnHitVisuals(t.laser, dmg, '#50b464');
        } else if (t.sapphire) {
          const dmg = damageSapphireEnemy(t.sapphire, rawDamage, 0, false);
          spawnHitVisualsAt(t.sapphire.x, t.sapphire.y, t.sapphire.maxHp, dmg, '#50b464');
        } else if (t.missile) {
          damageMissile(t.missile, rawDamage);
        } else if (t.emerald) {
          const dmg = damageEmeraldEnemy(t.emerald, rawDamage, 0);
          spawnHitVisualsAt(t.emerald.x, t.emerald.y, t.emerald.maxHp, dmg, '#50b464');
        } else if (t.amber) {
          const dmg = damageAmberEnemy(t.amber, rawDamage, 0);
          spawnHitVisualsAt(t.amber.x, t.amber.y, t.amber.maxHp, dmg, '#50b464');
        } else if (t.ambershard) {
          damageAmberShard(t.ambershard, rawDamage);
        } else if (t.void) {
          const dmg = damageVoidEnemy(t.void, rawDamage, 0);
          spawnHitVisualsAt(t.void.x, t.void.y, t.void.maxHp, dmg, '#50b464');
        } else if (t.quartz) {
          const dmg = damageQuartzEnemy(t.quartz, rawDamage, 0);
          spawnHitVisualsAt(t.quartz.x, t.quartz.y, t.quartz.maxHp, dmg, '#50b464');
        } else if (t.quartzspike) {
          damageQuartzSpike(t.quartzspike, rawDamage);
        } else if (t.ruby) {
          const dmg = damageRubyEnemy(t.ruby, rawDamage, 0);
          spawnHitVisualsAt(t.ruby.x, t.ruby.y, t.ruby.maxHp, dmg, '#50b464');
        } else if (t.rubybolt) {
          damageRubyBolt(t.rubybolt, rawDamage);
        } else if (t.sunstone) {
          const dmg = damageSunstoneEnemy(t.sunstone, rawDamage, 0);
          spawnHitVisualsAt(t.sunstone.x, t.sunstone.y, t.sunstone.maxHp, dmg, '#50b464');
        } else if (t.citrine) {
          const dmg = damageCitrineEnemy(t.citrine, rawDamage, 0);
          spawnHitVisualsAt(t.citrine.x, t.citrine.y, t.citrine.maxHp, dmg, '#50b464');
        } else if (t.citrinebolt) {
          damageCitrineBolt(t.citrinebolt, rawDamage);
        } else if (t.iolite) {
          const dmg = damageIoliteEnemy(t.iolite, rawDamage, 0);
          spawnHitVisualsAt(t.iolite.x, t.iolite.y, t.iolite.maxHp, dmg, '#50b464');
        } else if (t.amethyst) {
          const dmg = damageAmethystEnemy(t.amethyst, rawDamage, 0, false);
          spawnHitVisualsAt(t.amethyst.x, t.amethyst.y, t.amethyst.maxHp, dmg, '#50b464');
        } else if (t.amethystshard) {
          damageAmethystShard(t.amethystshard, rawDamage);
        } else if (t.diamond) {
          const dmg = damageDiamondEnemy(t.diamond, rawDamage, 0);
          spawnHitVisualsAt(t.diamond.x, t.diamond.y, t.diamond.maxHp, dmg, '#50b464');
        } else if (t.diamondshard) {
          damageDiamondShard(t.diamondshard, rawDamage);
        } else if (t.nullstone) {
          const dmg = damageNullstoneEnemy(t.nullstone, rawDamage, 0);
          spawnHitVisualsAt(t.nullstone.x, t.nullstone.y, t.nullstone.maxHp, dmg, '#50b464');
        } else if (t.voidtendril) {
          damageVoidTendril(t.voidtendril, rawDamage);
        } else if (t.fracteryl) {
          const dmg = damageFracterylEnemy(t.fracteryl, rawDamage, 0);
          spawnHitVisualsAt(t.fracteryl.x, t.fracteryl.y, t.fracteryl.maxHp, dmg, '#50b464');
        } else if (t.fracterylshard) {
          damageFracterylShard(t.fracterylshard, rawDamage);
        } else if (t.eigenstein) {
          const dmg = damageEigensteinEnemy(t.eigenstein, rawDamage, 0);
          spawnHitVisualsAt(t.eigenstein.x, t.eigenstein.y, t.eigenstein.maxHp, dmg, '#50b464');
        } else if (t.boss) {
          const dmg = damageBossEnemy(rawDamage, 0);
          if (dmg > 0) spawnHitVisualsAt(t.boss.x, t.boss.y, t.boss.maxHp, dmg, '#50b464');
        }
      }
      return;
    }

    // single / piercing
    const defPierceRatio = effect.kind === 'piercing' ? effect.defPierceRatio : 0;
    const closestT = findClosestTarget(range * range);
    if (!closestT) return;
    if (closestT.laser) {
      const dmg = damageEnemy(closestT.laser, rawDamage, defPierceRatio);
      spawnHitVisuals(closestT.laser, dmg, effect.kind === 'piercing' ? '#74c0fc' : shotColor);
    } else if (closestT.sapphire) {
      const dmg = damageSapphireEnemy(closestT.sapphire, rawDamage, defPierceRatio, false);
      spawnHitVisualsAt(closestT.sapphire.x, closestT.sapphire.y, closestT.sapphire.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : SAPPHIRE_ENEMY_GLOW);
    } else if (closestT.missile) {
      damageMissile(closestT.missile, rawDamage);
    } else if (closestT.emerald) {
      const dmg = damageEmeraldEnemy(closestT.emerald, rawDamage, defPierceRatio);
      spawnHitVisualsAt(closestT.emerald.x, closestT.emerald.y, closestT.emerald.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : EMERALD_ENEMY_GLOW);
    } else if (closestT.amber) {
      const dmg = damageAmberEnemy(closestT.amber, rawDamage, defPierceRatio);
      spawnHitVisualsAt(closestT.amber.x, closestT.amber.y, closestT.amber.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : AMBER_ENEMY_GLOW);
    } else if (closestT.ambershard) {
      damageAmberShard(closestT.ambershard, rawDamage);
    } else if (closestT.void) {
      const dmg = damageVoidEnemy(closestT.void, rawDamage, defPierceRatio);
      spawnHitVisualsAt(closestT.void.x, closestT.void.y, closestT.void.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : VOID_ENEMY_GLOW);
    } else if (closestT.quartz) {
      const dmg = damageQuartzEnemy(closestT.quartz, rawDamage, defPierceRatio);
      spawnHitVisualsAt(closestT.quartz.x, closestT.quartz.y, closestT.quartz.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : QUARTZ_ENEMY_GLOW);
    } else if (closestT.quartzspike) {
      damageQuartzSpike(closestT.quartzspike, rawDamage);
    } else if (closestT.ruby) {
      const dmg = damageRubyEnemy(closestT.ruby, rawDamage, defPierceRatio);
      spawnHitVisualsAt(closestT.ruby.x, closestT.ruby.y, closestT.ruby.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : RUBY_ENEMY_GLOW);
    } else if (closestT.rubybolt) {
      damageRubyBolt(closestT.rubybolt, rawDamage);
    } else if (closestT.sunstone) {
      const dmg = damageSunstoneEnemy(closestT.sunstone, rawDamage, defPierceRatio);
      spawnHitVisualsAt(closestT.sunstone.x, closestT.sunstone.y, closestT.sunstone.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : SUNSTONE_ENEMY_GLOW);
    } else if (closestT.citrine) {
      const dmg = damageCitrineEnemy(closestT.citrine, rawDamage, defPierceRatio);
      spawnHitVisualsAt(closestT.citrine.x, closestT.citrine.y, closestT.citrine.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : CITRINE_ENEMY_GLOW);
    } else if (closestT.citrinebolt) {
      damageCitrineBolt(closestT.citrinebolt, rawDamage);
    } else if (closestT.iolite) {
      const dmg = damageIoliteEnemy(closestT.iolite, rawDamage, defPierceRatio);
      spawnHitVisualsAt(closestT.iolite.x, closestT.iolite.y, closestT.iolite.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : IOLITE_ENEMY_GLOW);
    } else if (closestT.amethyst) {
      const dmg = damageAmethystEnemy(closestT.amethyst, rawDamage, defPierceRatio, false);
      spawnHitVisualsAt(closestT.amethyst.x, closestT.amethyst.y, closestT.amethyst.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : AMETHYST_ENEMY_GLOW);
    } else if (closestT.amethystshard) {
      damageAmethystShard(closestT.amethystshard, rawDamage);
    } else if (closestT.diamond) {
      const dmg = damageDiamondEnemy(closestT.diamond, rawDamage, defPierceRatio);
      spawnHitVisualsAt(closestT.diamond.x, closestT.diamond.y, closestT.diamond.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : DIAMOND_ENEMY_GLOW);
    } else if (closestT.diamondshard) {
      damageDiamondShard(closestT.diamondshard, rawDamage);
    } else if (closestT.nullstone) {
      const dmg = damageNullstoneEnemy(closestT.nullstone, rawDamage, defPierceRatio);
      spawnHitVisualsAt(closestT.nullstone.x, closestT.nullstone.y, closestT.nullstone.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : NULLSTONE_ENEMY_GLOW);
    } else if (closestT.voidtendril) {
      damageVoidTendril(closestT.voidtendril, rawDamage);
    } else if (closestT.fracteryl) {
      const dmg = damageFracterylEnemy(closestT.fracteryl, rawDamage, defPierceRatio);
      spawnHitVisualsAt(closestT.fracteryl.x, closestT.fracteryl.y, closestT.fracteryl.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : FRACTERYL_ENEMY_GLOW);
    } else if (closestT.fracterylshard) {
      damageFracterylShard(closestT.fracterylshard, rawDamage);
    } else if (closestT.eigenstein) {
      const dmg = damageEigensteinEnemy(closestT.eigenstein, rawDamage, defPierceRatio);
      spawnHitVisualsAt(closestT.eigenstein.x, closestT.eigenstein.y, closestT.eigenstein.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : EIGENSTEIN_ENEMY_GLOW);
    } else if (closestT.boss) {
      const dmg = damageBossEnemy(rawDamage, defPierceRatio);
      if (dmg > 0) spawnHitVisualsAt(closestT.boss.x, closestT.boss.y, closestT.boss.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : BOSS_GLOW_COLORS[Math.min(closestT.boss.bossId, BOSS_GLOW_COLORS.length - 1)]);
    }
  }

  /** Removes any enemies whose HP has reached zero or below, awarding XP for each. */
  function removeDeadEnemies(): void {
    let totalXpFromKills = 0;
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].hp <= 0) {
        fluid.addExplosion(
          enemies[i].x, enemies[i].y,
          FLUID_EXPLOSION_STRENGTH,
          FLUID_LASER_R, FLUID_LASER_G, FLUID_LASER_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * LASER_XP_MULT;
        trySpawnLuckyMote(luckyMotes, 'laser', enemies[i].x, enemies[i].y, getCachedLuckPercent());
        enemies.splice(i, 1);
      }
    }
    for (let i = sapphireEnemies.length - 1; i >= 0; i--) {
      if (sapphireEnemies[i].hp <= 0) {
        fluid.addExplosion(
          sapphireEnemies[i].x, sapphireEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 1.4,
          FLUID_SAPPH_R, FLUID_SAPPH_G, FLUID_SAPPH_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * SAPPHIRE_XP_MULT;
        trySpawnLuckyMote(luckyMotes, 'sapphire', sapphireEnemies[i].x, sapphireEnemies[i].y, getCachedLuckPercent());
        sapphireEnemies.splice(i, 1);
      }
    }
    for (let i = sapphireMissiles.length - 1; i >= 0; i--) {
      if (sapphireMissiles[i].hp <= 0) {
        fluid.addExplosion(
          sapphireMissiles[i].x, sapphireMissiles[i].y,
          FLUID_EXPLOSION_STRENGTH * 0.6,
          FLUID_MISSILE_R, FLUID_MISSILE_G, FLUID_MISSILE_B,
        );
        sapphireMissiles.splice(i, 1);
      }
    }
    for (let i = emeraldEnemies.length - 1; i >= 0; i--) {
      if (emeraldEnemies[i].hp <= 0) {
        fluid.addExplosion(
          emeraldEnemies[i].x, emeraldEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 1.1,
          FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * EMERALD_XP_MULT;
        trySpawnLuckyMote(luckyMotes, 'emerald', emeraldEnemies[i].x, emeraldEnemies[i].y, getCachedLuckPercent());
        emeraldEnemies.splice(i, 1);
      }
    }
    for (let i = amberEnemies.length - 1; i >= 0; i--) {
      if (amberEnemies[i].hp <= 0) {
        fluid.addExplosion(
          amberEnemies[i].x, amberEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 1.5,
          FLUID_AMBER_R, FLUID_AMBER_G, FLUID_AMBER_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * AMBER_XP_MULT;
        trySpawnLuckyMote(luckyMotes, 'amber', amberEnemies[i].x, amberEnemies[i].y, getCachedLuckPercent());
        amberEnemies.splice(i, 1);
      }
    }
    for (let i = amberShards.length - 1; i >= 0; i--) {
      if (amberShards[i].hp <= 0) {
        fluid.addExplosion(
          amberShards[i].x, amberShards[i].y,
          FLUID_EXPLOSION_STRENGTH * 0.5,
          FLUID_AMBER_R, FLUID_AMBER_G, FLUID_AMBER_B,
        );
        amberShards.splice(i, 1);
      }
    }
    for (let i = voidEnemies.length - 1; i >= 0; i--) {
      if (voidEnemies[i].hp <= 0) {
        fluid.addExplosion(
          voidEnemies[i].x, voidEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 2.0,
          FLUID_VOID_R, FLUID_VOID_G, FLUID_VOID_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * VOID_XP_MULT;
        trySpawnLuckyMote(luckyMotes, 'void', voidEnemies[i].x, voidEnemies[i].y, getCachedLuckPercent());
        voidEnemies.splice(i, 1);
      }
    }
    for (let i = quartzEnemies.length - 1; i >= 0; i--) {
      if (quartzEnemies[i].hp <= 0) {
        fluid.addExplosion(
          quartzEnemies[i].x, quartzEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH,
          FLUID_QUARTZ_R, FLUID_QUARTZ_G, FLUID_QUARTZ_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * QUARTZ_XP_MULT;
        trySpawnLuckyMote(luckyMotes, 'quartz', quartzEnemies[i].x, quartzEnemies[i].y, getCachedLuckPercent());
        quartzEnemies.splice(i, 1);
      }
    }
    for (let i = quartzSpikes.length - 1; i >= 0; i--) {
      if (quartzSpikes[i].hp <= 0 || quartzSpikes[i].lifeMs <= 0) quartzSpikes.splice(i, 1);
    }
    for (let i = rubyEnemies.length - 1; i >= 0; i--) {
      if (rubyEnemies[i].hp <= 0) {
        fluid.addExplosion(
          rubyEnemies[i].x, rubyEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 1.2,
          FLUID_RUBY_R, FLUID_RUBY_G, FLUID_RUBY_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * RUBY_XP_MULT;
        trySpawnLuckyMote(luckyMotes, 'ruby', rubyEnemies[i].x, rubyEnemies[i].y, getCachedLuckPercent());
        rubyEnemies.splice(i, 1);
      }
    }
    for (let i = rubyBolts.length - 1; i >= 0; i--) {
      if (rubyBolts[i].hp <= 0 || rubyBolts[i].lifeMs <= 0) rubyBolts.splice(i, 1);
    }
    for (let i = sunstoneEnemies.length - 1; i >= 0; i--) {
      if (sunstoneEnemies[i].hp <= 0) {
        fluid.addExplosion(
          sunstoneEnemies[i].x, sunstoneEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 1.6,
          FLUID_SUNSTONE_R, FLUID_SUNSTONE_G, FLUID_SUNSTONE_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * SUNSTONE_XP_MULT;
        trySpawnLuckyMote(luckyMotes, 'sunstone', sunstoneEnemies[i].x, sunstoneEnemies[i].y, getCachedLuckPercent());
        sunstoneEnemies.splice(i, 1);
      }
    }
    for (let i = citrineEnemies.length - 1; i >= 0; i--) {
      if (citrineEnemies[i].hp <= 0) {
        fluid.addExplosion(
          citrineEnemies[i].x, citrineEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 1.8,
          FLUID_CITRINE_R, FLUID_CITRINE_G, FLUID_CITRINE_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * CITRINE_XP_MULT;
        trySpawnLuckyMote(luckyMotes, 'citrine', citrineEnemies[i].x, citrineEnemies[i].y, getCachedLuckPercent());
        citrineEnemies.splice(i, 1);
      }
    }
    for (let i = citrineBolts.length - 1; i >= 0; i--) {
      if (citrineBolts[i].hp <= 0) citrineBolts.splice(i, 1);
    }
    for (let i = ioliteEnemies.length - 1; i >= 0; i--) {
      if (ioliteEnemies[i].hp <= 0) {
        fluid.addExplosion(
          ioliteEnemies[i].x, ioliteEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 2.2,
          FLUID_IOLITE_R, FLUID_IOLITE_G, FLUID_IOLITE_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * IOLITE_XP_MULT;
        trySpawnLuckyMote(luckyMotes, 'iolite', ioliteEnemies[i].x, ioliteEnemies[i].y, getCachedLuckPercent());
        ioliteEnemies.splice(i, 1);
      }
    }
    for (let i = amethystEnemies.length - 1; i >= 0; i--) {
      if (amethystEnemies[i].hp <= 0) {
        fluid.addExplosion(
          amethystEnemies[i].x, amethystEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 2.5,
          FLUID_AMETHYST_R, FLUID_AMETHYST_G, FLUID_AMETHYST_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * AMETHYST_XP_MULT;
        trySpawnLuckyMote(luckyMotes, 'amethyst', amethystEnemies[i].x, amethystEnemies[i].y, getCachedLuckPercent());
        amethystEnemies.splice(i, 1);
      }
    }
    for (let i = amethystShards.length - 1; i >= 0; i--) {
      if (amethystShards[i].hp <= 0 || amethystShards[i].lifeMs <= 0) amethystShards.splice(i, 1);
    }
    for (let i = diamondEnemies.length - 1; i >= 0; i--) {
      if (diamondEnemies[i].hp <= 0) {
        fluid.addExplosion(
          diamondEnemies[i].x, diamondEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 3.0,
          FLUID_DIAMOND_R, FLUID_DIAMOND_G, FLUID_DIAMOND_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * DIAMOND_XP_MULT;
        trySpawnLuckyMote(luckyMotes, 'diamond', diamondEnemies[i].x, diamondEnemies[i].y, getCachedLuckPercent());
        diamondEnemies.splice(i, 1);
      }
    }
    for (let i = diamondShards.length - 1; i >= 0; i--) {
      if (diamondShards[i].hp <= 0 || diamondShards[i].lifeMs <= 0) diamondShards.splice(i, 1);
    }
    for (let i = nullstoneEnemies.length - 1; i >= 0; i--) {
      if (nullstoneEnemies[i].hp <= 0) {
        fluid.addExplosion(
          nullstoneEnemies[i].x, nullstoneEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 4.0,
          FLUID_NULLSTONE_R, FLUID_NULLSTONE_G, FLUID_NULLSTONE_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * NULLSTONE_XP_MULT;
        trySpawnLuckyMote(luckyMotes, 'nullstone', nullstoneEnemies[i].x, nullstoneEnemies[i].y, getCachedLuckPercent());
        nullstoneEnemies.splice(i, 1);
      }
    }
    for (let i = voidTendrils.length - 1; i >= 0; i--) {
      if (voidTendrils[i].hp <= 0 || voidTendrils[i].lifeMs <= 0) voidTendrils.splice(i, 1);
    }
    for (let i = fracterylEnemies.length - 1; i >= 0; i--) {
      if (fracterylEnemies[i].hp <= 0) {
        fluid.addExplosion(
          fracterylEnemies[i].x, fracterylEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 3.5,
          FLUID_FRACTERYL_R, FLUID_FRACTERYL_G, FLUID_FRACTERYL_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * FRACTERYL_XP_MULT;
        trySpawnLuckyMote(luckyMotes, 'fracteryl', fracterylEnemies[i].x, fracterylEnemies[i].y, getCachedLuckPercent());
        fracterylEnemies.splice(i, 1);
      }
    }
    for (let i = fracterylShards.length - 1; i >= 0; i--) {
      if (fracterylShards[i].hp <= 0 || fracterylShards[i].lifeMs <= 0) fracterylShards.splice(i, 1);
    }
    for (let i = eigensteinEnemies.length - 1; i >= 0; i--) {
      if (eigensteinEnemies[i].hp <= 0) {
        fluid.addExplosion(
          eigensteinEnemies[i].x, eigensteinEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 4.5,
          FLUID_EIGENSTEIN_R, FLUID_EIGENSTEIN_G, FLUID_EIGENSTEIN_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * EIGENSTEIN_XP_MULT;
        trySpawnLuckyMote(luckyMotes, 'eigenstein', eigensteinEnemies[i].x, eigensteinEnemies[i].y, getCachedLuckPercent());
        eigensteinEnemies.splice(i, 1);
      }
    }
    // Boss defeat
    if (bossEnemy && bossEnemy.hp <= 0) {
      const speedPct = rpgSimState.bossSpeedPct;
      const xpMult = getBossXpMultiplier(speedPct);
      const bossXp = Math.ceil(getXpPerKill(currentWave) * getWaveStatScale(currentWave) * 5.0 * xpMult);
      addXpWithAllocation(rpgSimState, bossXp);
      if (isBossFightFromMenu) {
        const prevBest = rpgSimState.bossCompletions.get(bossEnemy.bossId) ?? 0;
        if (speedPct > prevBest) {
          rpgSimState.bossCompletions.set(bossEnemy.bossId, speedPct);
        }
      }
      isBossFightFromMenu = false;
      exitBossWave();
      const glowC = BOSS_GLOW_COLORS[Math.min(bossEnemy.bossId, BOSS_GLOW_COLORS.length - 1)];
      spawnDamageNumber(bossEnemy.x, bossEnemy.y, 0, -1, `BOSS! +${formatXp(bossXp)} XP (${xpMult.toFixed(0)}x)`, 1.0, glowC);
      fluid.addExplosion(bossEnemy.x, bossEnemy.y, FLUID_EXPLOSION_STRENGTH * 2.5, FLUID_VOID_R, FLUID_VOID_G, FLUID_VOID_B);
      bossEnemy = null;
      bossProjectiles.length = 0;
    }
    if (totalXpFromKills > 0) {
      addXpWithAllocation(rpgSimState, totalXpFromKills);
      applyEquipmentStats();
    }
  }

  /** Advances hit-flash and shot-line timers, pruning expired entries. */
  function updateShotVisuals(deltaMs: number): void {
    for (let i = hitEffects.length - 1; i >= 0; i--) {
      hitEffects[i].timerMs -= deltaMs;
      if (hitEffects[i].timerMs <= 0) hitEffects.splice(i, 1);
    }
    for (let i = shotLines.length - 1; i >= 0; i--) {
      shotLines[i].timerMs -= deltaMs;
      if (shotLines[i].timerMs <= 0) shotLines.splice(i, 1);
    }
  }

  /** Advances damage-number positions (decelerating velocity) and iframes timer. */
  function updateDamageNumbers(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const decelFactor = Math.pow(DAMAGE_NUM_DECEL, dt);
    for (let i = damageNumbers.length - 1; i >= 0; i--) {
      const dn = damageNumbers[i];
      dn.timerMs -= deltaMs;
      if (dn.timerMs <= 0) { damageNumbers.splice(i, 1); continue; }
      dn.x += dn.vx * dt;
      dn.y += dn.vy * dt;
      dn.vx *= decelFactor;
      dn.vy *= decelFactor;
    }
    if (playerIFramesMs > 0) playerIFramesMs = Math.max(0, playerIFramesMs - deltaMs);
  }

  const statsPanel = document.createElement('div');
  statsPanel.id = 'rpg-stats-panel';
  statsPanel.style.display = 'none';

  // ── Player stats box (HP / ATK / DEF grouped with XP node at top) ────
  const playerStatsBox = document.createElement('div');
  playerStatsBox.className = 'rpg-player-stats-box';

  // XP node — the draggable source at the top of the player stats box
  const xpNodeEl = document.createElement('div');
  xpNodeEl.className = 'rpg-xp-node';
  xpNodeEl.textContent = 'XP';
  xpNodeEl.title = 'Drag to ATK or DEF to allocate future XP to that stat';
  playerStatsBox.appendChild(xpNodeEl);

  // Stats row within the box
  const playerStatsRow = document.createElement('div');
  playerStatsRow.className = 'rpg-player-stats-row';
  playerStatsBox.appendChild(playerStatsRow);

  // Helper: creates a stat widget and appends it to a given container.
  function makeStatWidget(
    label: string,
    extraClass: string,
    container: HTMLElement,
  ): { root: HTMLElement; labelEl: HTMLSpanElement; valueEl: HTMLSpanElement } {
    const root = document.createElement('div');
    root.className = 'rpg-stat';
    const labelEl = document.createElement('span');
    labelEl.className = 'rpg-stat-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'rpg-stat-value' + (extraClass ? (' ' + extraClass) : '');
    root.appendChild(labelEl);
    root.appendChild(valueEl);
    container.appendChild(root);
    return { root, labelEl, valueEl };
  }

  const hpWidget  = makeStatWidget('HP',  'rpg-stat-value--hp', playerStatsRow);
  const atkWidget = makeStatWidget('ATK', '',                   playerStatsRow);
  const defWidget = makeStatWidget('DEF', '',                   playerStatsRow);

  // Sub-texts under ATK and DEF: base value (no XP) + allocated XP counter
  const atkBaseEl  = document.createElement('span');
  atkBaseEl.className = 'rpg-stat-sub rpg-stat-sub--base';
  atkWidget.root.appendChild(atkBaseEl);
  const atkAllocEl = document.createElement('span');
  atkAllocEl.className = 'rpg-stat-sub rpg-stat-sub--alloc';
  atkWidget.root.appendChild(atkAllocEl);

  const defBaseEl  = document.createElement('span');
  defBaseEl.className = 'rpg-stat-sub rpg-stat-sub--base';
  defWidget.root.appendChild(defBaseEl);
  const defAllocEl = document.createElement('span');
  defAllocEl.className = 'rpg-stat-sub rpg-stat-sub--alloc';
  defWidget.root.appendChild(defAllocEl);

  statsPanel.appendChild(playerStatsBox);

  // Remaining stat widgets appended directly to the panel
  const waveWidget  = makeStatWidget('WAVE',  'rpg-stat-value--wave',  statsPanel);
  const boostWidget = makeStatWidget('BOOST', 'rpg-stat-value--boost', statsPanel);
  const luckWidget  = makeStatWidget('LUCK',  'rpg-stat-value--luck',  statsPanel);

  // ── DPS Chart Widget ────────────────────────────────────────────
  const dpsWidget = document.createElement('div');
  dpsWidget.className = 'rpg-dps-widget';
  const dpsLabelEl = document.createElement('span');
  dpsLabelEl.className = 'rpg-stat-label';
  dpsLabelEl.textContent = 'DPS';
  const dpsValueEl = document.createElement('span');
  dpsValueEl.className = 'rpg-stat-value rpg-stat-value--dps';
  dpsValueEl.textContent = '';
  const dpsChartEl = document.createElement('div');
  dpsChartEl.className = 'rpg-dps-chart';
  const dpsAxisEl = document.createElement('div');
  dpsAxisEl.className = 'rpg-dps-axis';
  const dpsAxisLowEl = document.createElement('span');
  dpsAxisLowEl.textContent = '0';
  const dpsAxisHighEl = document.createElement('span');
  dpsAxisHighEl.textContent = '0';
  dpsAxisEl.appendChild(dpsAxisLowEl);
  dpsAxisEl.appendChild(dpsAxisHighEl);
  dpsWidget.appendChild(dpsLabelEl);
  dpsWidget.appendChild(dpsValueEl);
  dpsWidget.appendChild(dpsChartEl);
  dpsWidget.appendChild(dpsAxisEl);
  statsPanel.appendChild(dpsWidget);

  // ── Wire SVG overlay (sits above all panel content) ─────────────
  const wireSvgNS = 'http://www.w3.org/2000/svg';
  const wireSvg = document.createElementNS(wireSvgNS, 'svg') as SVGSVGElement;
  wireSvg.setAttribute('class', 'rpg-wire-svg');
  wireSvg.setAttribute('aria-hidden', 'true');
  const wirePolyline = document.createElementNS(wireSvgNS, 'polyline') as SVGPolylineElement;
  wirePolyline.setAttribute('class', 'rpg-wire-rope');
  wirePolyline.setAttribute('fill', 'none');
  wirePolyline.setAttribute('stroke', '#a78bfa');
  wirePolyline.setAttribute('stroke-width', '2');
  wirePolyline.setAttribute('stroke-linecap', 'round');
  wirePolyline.setAttribute('stroke-linejoin', 'round');
  wirePolyline.style.display = 'none';
  wireSvg.appendChild(wirePolyline);
  statsPanel.appendChild(wireSvg);

  // ── Verlet rope state ────────────────────────────────────────────
  const ROPE_N         = 12;   // number of nodes
  const ROPE_GRAVITY   = 0.35; // px added to vy per frame (gravity acceleration)
  const ROPE_DAMPING   = 0.97; // velocity retention per frame
  const ROPE_ITERS     = 5;    // constraint relaxation iterations per frame
  const ROPE_SLACK     = 1.25; // rest length = slack × euclidean-distance / (N-1)

  interface RopeNode { x: number; y: number; px: number; py: number; }
  let ropeNodes: RopeNode[] = [];
  let ropeSegLen = 1; // updated when rope is initialised

  function initRope(x0: number, y0: number, x1: number, y1: number): void {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    ropeSegLen = (dist * ROPE_SLACK) / (ROPE_N - 1);
    ropeNodes = [];
    for (let i = 0; i < ROPE_N; i++) {
      const t = i / (ROPE_N - 1);
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      ropeNodes.push({ x, y, px: x, py: y });
    }
  }

  function updateRope(x0: number, y0: number, x1: number, y1: number): void {
    if (ropeNodes.length !== ROPE_N) { initRope(x0, y0, x1, y1); return; }

    // Verlet integration (interior nodes only)
    for (let i = 1; i < ROPE_N - 1; i++) {
      const n = ropeNodes[i];
      const vx = (n.x - n.px) * ROPE_DAMPING;
      const vy = (n.y - n.py) * ROPE_DAMPING;
      n.px = n.x; n.py = n.y;
      n.x += vx;
      n.y += vy + ROPE_GRAVITY;
    }

    // Pin endpoints
    const a = ropeNodes[0];
    a.x = x0; a.y = y0; a.px = x0; a.py = y0;
    const b = ropeNodes[ROPE_N - 1];
    b.x = x1; b.y = y1; b.px = x1; b.py = y1;

    // Constraint relaxation
    for (let iter = 0; iter < ROPE_ITERS; iter++) {
      for (let i = 0; i < ROPE_N - 1; i++) {
        const na = ropeNodes[i];
        const nb = ropeNodes[i + 1];
        const dx = nb.x - na.x;
        const dy = nb.y - na.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.001) continue;
        const diff = ((dist - ropeSegLen) / dist) * 0.5;
        const cx = dx * diff;
        const cy = dy * diff;
        if (i > 0)            { na.x += cx; na.y += cy; }
        if (i < ROPE_N - 2)   { nb.x -= cx; nb.y -= cy; }
      }
    }
  }

  // ── Wire drag / lock state ───────────────────────────────────────
  type WireState = 'idle' | 'dragging' | 'locked';
  let wireState: WireState = rpgSimState.xpAllocatedStat ? 'locked' : 'idle';
  let wireDragClientX = 0;
  let wireDragClientY = 0;

  /** Convert client coords to stats-panel-relative coords. */
  function toPanelCoords(clientX: number, clientY: number): { x: number; y: number } {
    const r = statsPanel.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  /** Centre of an element in panel-relative coords. */
  function elementCentreInPanel(el: HTMLElement): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    const p = statsPanel.getBoundingClientRect();
    return { x: r.left + r.width / 2 - p.left, y: r.top + r.height / 2 - p.top };
  }

  /** Returns the target stat widget root given the xpAllocatedStat value. */
  function lockedStatRoot(): HTMLElement | null {
    if (rpgSimState.xpAllocatedStat === 'atk') return atkWidget.root;
    if (rpgSimState.xpAllocatedStat === 'def') return defWidget.root;
    return null;
  }

  /** True while the pointer is over a given element. */
  function pointerOverElement(el: HTMLElement, clientX: number, clientY: number): boolean {
    const r = el.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }

  // Pointer events for drag-to-wire (XP node has pointer-events: auto via CSS)
  xpNodeEl.addEventListener('pointerdown', (e: PointerEvent) => {
    if (wireState === 'locked') return; // already wired, cannot change
    e.stopPropagation();
    wireState = 'dragging';
    wireDragClientX = e.clientX;
    wireDragClientY = e.clientY;
    const xpC = elementCentreInPanel(xpNodeEl);
    const dragP = toPanelCoords(e.clientX, e.clientY);
    initRope(xpC.x, xpC.y, dragP.x, dragP.y);
    xpNodeEl.setPointerCapture(e.pointerId);
  }, { passive: true });

  xpNodeEl.addEventListener('pointermove', (e: PointerEvent) => {
    if (wireState !== 'dragging') return;
    wireDragClientX = e.clientX;
    wireDragClientY = e.clientY;
  }, { passive: true });

  xpNodeEl.addEventListener('pointerup', (e: PointerEvent) => {
    if (wireState !== 'dragging') return;
    // Check if pointer lands on ATK or DEF widget
    let landed: 'atk' | 'def' | null = null;
    if (pointerOverElement(atkWidget.root, e.clientX, e.clientY)) landed = 'atk';
    else if (pointerOverElement(defWidget.root, e.clientX, e.clientY)) landed = 'def';

    if (landed) {
      // Lock the wire permanently
      rpgSimState.xpAllocatedStat = landed;
      wireState = 'locked';
      // Seed the per-stat counter to the current total XP so the wired stat
      // continues from the same bonus value it had before wiring, rather than
      // dropping to 0 and slowly recovering.  Future XP increments flow on top.
      if (landed === 'atk') rpgSimState.xpAllocatedToAtk = rpgSimState.xp;
      else                   rpgSimState.xpAllocatedToDef = rpgSimState.xp;
      applyEquipmentStats();
      const target = lockedStatRoot()!;
      const xpC   = elementCentreInPanel(xpNodeEl);
      const statC = elementCentreInPanel(target);
      initRope(xpC.x, xpC.y, statC.x, statC.y);
    } else {
      // Cancel drag
      wireState = 'idle';
      ropeNodes = [];
    }
  }, { passive: true });

  xpNodeEl.addEventListener('pointercancel', () => {
    if (wireState === 'dragging') { wireState = 'idle'; ropeNodes = []; }
  }, { passive: true });

  // ── Wire rendering (called each frame from updateStatsPanelDom) ──
  function updateWireVisual(): void {
    if (wireState === 'idle') {
      wirePolyline.style.display = 'none';
      return;
    }

    // Sync SVG viewport to panel size
    const panelW = statsPanel.clientWidth;
    const panelH = statsPanel.clientHeight;
    wireSvg.setAttribute('viewBox', `0 0 ${panelW} ${panelH}`);

    const xpC = elementCentreInPanel(xpNodeEl);
    let tipX: number, tipY: number;

    if (wireState === 'dragging') {
      const p = toPanelCoords(wireDragClientX, wireDragClientY);
      tipX = p.x; tipY = p.y;
    } else {
      // locked — tip is the centre of the wired stat
      const target = lockedStatRoot();
      if (!target) { wirePolyline.style.display = 'none'; return; }
      const statC = elementCentreInPanel(target);
      tipX = statC.x; tipY = statC.y;
    }

    updateRope(xpC.x, xpC.y, tipX, tipY);

    const pts = ropeNodes.map(n => `${n.x.toFixed(1)},${n.y.toFixed(1)}`).join(' ');
    wirePolyline.setAttribute('points', pts);
    wirePolyline.style.display = '';

    // Pulse the stroke colour: dragging = neutral purple, locked = stat colour
    if (wireState === 'locked') {
      const colour = rpgSimState.xpAllocatedStat === 'atk' ? '#c4b5fd' : '#67e8f9';
      wirePolyline.setAttribute('stroke', colour);
    } else {
      wirePolyline.setAttribute('stroke', '#a78bfa');
    }
  }

  function weaponAbbrev(weaponId: string): string {
    const tierId = WEAPON_BY_ID.get(weaponId)?.costTierId ?? 'sand';
    return tierId.slice(0, 3).toUpperCase();
  }

  function weaponColor(weaponId: string): string {
    const tierId = WEAPON_BY_ID.get(weaponId)?.costTierId;
    return (tierId ? TIER_BY_ID.get(tierId)?.color : null) ?? '#ffd764';
  }

  function formatDpsAxis(value: number): string {
    return value >= 1000 ? formatXp(value) : Math.round(value).toString();
  }

  function rebuildDpsRows(equippedIds: string[]): void {
    dpsChartEl.textContent = '';
    dpsLabelEl.textContent = equippedIds.length > 0 ? '' : 'DPS';
    dpsValueEl.textContent = '';
    dpsAxisEl.hidden = equippedIds.length === 0;
    for (const weaponId of equippedIds) {
      const row = document.createElement('div');
      row.className = 'rpg-dps-row';
      row.dataset.weaponId = weaponId;
      const label = document.createElement('span');
      label.className = 'rpg-dps-label';
      label.textContent = weaponAbbrev(weaponId);
      const track = document.createElement('div');
      track.className = 'rpg-dps-track';
      const bar = document.createElement('div');
      bar.className = 'rpg-dps-bar';
      bar.style.background = weaponColor(weaponId);
      track.appendChild(bar);
      row.appendChild(label);
      row.appendChild(track);
      dpsChartEl.appendChild(row);
    }
  }

  function updateStatsPanelDom(): void {
    hpWidget.valueEl.textContent   = Math.max(0, Math.ceil(playerStats.hp)) + ' / ' + playerStats.maxHp;
    atkWidget.valueEl.textContent  = String(playerStats.atk);
    defWidget.valueEl.textContent  = String(playerStats.def);

    // XP node label — always shows total XP
    xpNodeEl.textContent = 'XP  ' + formatXp(rpgSimState.xp);

    // Sub-texts: base stat (no XP bonus) + per-stat allocated XP counter
    const baseAtk = PLAYER_ATK_INIT;
    atkBaseEl.textContent  = '(' + baseAtk + ')';
    atkAllocEl.textContent = rpgSimState.xpAllocatedToAtk > 0
      ? formatXp(rpgSimState.xpAllocatedToAtk) + ' xp'
      : '';

    // Base DEF = current DEF minus the XP contribution
    const defXpContrib = getEffectiveXpDefBonus(rpgSimState);
    const baseDef = playerStats.def - defXpContrib;
    defBaseEl.textContent  = '(' + baseDef + ')';
    defAllocEl.textContent = rpgSimState.xpAllocatedToDef > 0
      ? formatXp(rpgSimState.xpAllocatedToDef) + ' xp'
      : '';

    // Glow on the wired stat widget
    const isAtkWired = rpgSimState.xpAllocatedStat === 'atk';
    const isDefWired = rpgSimState.xpAllocatedStat === 'def';
    atkWidget.root.classList.toggle('rpg-stat--wired', isAtkWired);
    defWidget.root.classList.toggle('rpg-stat--wired', isDefWired);

    // XP node: show locked indicator once wired
    xpNodeEl.classList.toggle('rpg-xp-node--locked', wireState === 'locked');

    const isBossWave = currentWave > 0 && currentWave % 100 === 0;
    waveWidget.labelEl.textContent = isBossWave ? BOSS_GLYPH_LABEL : 'WAVE';
    if (isBossWave) {
      waveWidget.labelEl.style.fontFamily = 'monospace';
    } else {
      waveWidget.labelEl.style.removeProperty('fontFamily');
    }
    waveWidget.valueEl.textContent = isBossWave ? String(Math.ceil(currentWave / 100)) : String(currentWave);
    if (isBossWave) {
      const rawBossId = Math.ceil(currentWave / 100);
      const bossId = ((rawBossId - 1) % 12) + 1;
      waveWidget.valueEl.title = BOSS_NAMES[bossId] ?? 'Boss';
    } else {
      waveWidget.valueEl.title = '';
    }
    boostWidget.valueEl.textContent = rpgSimState.highestWaveReached > 0
      ? '+' + Math.pow(rpgSimState.highestWaveReached, 1.2).toFixed(1) + '%'
      : '+0.0%';
    luckWidget.valueEl.textContent = formatLuckPercent(rpgSimState.xp);

    // Wire visual update (rope physics + SVG redraw)
    updateWireVisual();

    // ── DPS chart update ──────────────────────────────────────────
    const now = Date.now();
    while (dpsWindow.length > 0 && now - dpsWindow[0].t > DPS_WINDOW_MS) {
      dpsWindow.shift();
    }
    const equippedIds = Array.from(getEffectiveEquippedIds());
    const equipKey = equippedIds.join('|');
    if (equipKey !== lastDpsEquipKey) {
      lastDpsEquipKey = equipKey;
      rebuildDpsRows(equippedIds);
    }
    if (now - lastDpsDomUpdateMs < DPS_DOM_UPDATE_MS && equipKey !== '') return;
    lastDpsDomUpdateMs = now;

    const dpsByWeapon = new Map<string, number>();
    for (const weaponId of equippedIds) dpsByWeapon.set(weaponId, 0);
    for (const e of dpsWindow) {
      if (dpsByWeapon.has(e.weaponId)) {
        dpsByWeapon.set(e.weaponId, (dpsByWeapon.get(e.weaponId) ?? 0) + e.dmg / (DPS_WINDOW_MS / 1000));
      }
    }
    const dpsValues = equippedIds.map(id => dpsByWeapon.get(id) ?? 0);
    const rawMin = dpsValues.length > 0 ? Math.min(...dpsValues) : 0;
    const rawMax = Math.max(1, ...(dpsValues.length > 0 ? dpsValues : [1]));
    dpsAxisMin += (rawMin - dpsAxisMin) * DPS_AXIS_LERP;
    dpsAxisMax += (rawMax - dpsAxisMax) * DPS_AXIS_LERP;
    if (dpsAxisMax <= dpsAxisMin + 0.001) dpsAxisMax = dpsAxisMin + 1;
    dpsAxisLowEl.textContent = formatDpsAxis(dpsAxisMin);
    dpsAxisHighEl.textContent = formatDpsAxis(dpsAxisMax);
    for (const weaponId of equippedIds) {
      const row = dpsChartEl.querySelector<HTMLElement>(`.rpg-dps-row[data-weapon-id="${weaponId}"]`);
      const bar = row?.querySelector<HTMLElement>('.rpg-dps-bar');
      if (!bar || !row) continue;
      const dps = dpsByWeapon.get(weaponId) ?? 0;
      const pct = dps <= 0 ? 0 : Math.max(8, Math.min(100, ((dps - dpsAxisMin) / (dpsAxisMax - dpsAxisMin)) * 100));
      bar.style.width = pct + '%';
      row.title = `${weaponAbbrev(weaponId)} ${dps.toFixed(1)} DPS`;
    }
  }
  updateStatsPanelDom();

  function toCanvasCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width  > 0 ? widthPx  / rect.width  : 1;
    const scaleY = rect.height > 0 ? heightPx / rect.height : 1;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  // ── Tap-to-target tracking ──────────────────────────────────────
  let pointerDownTime = 0;
  let pointerDownX = 0;
  let pointerDownY = 0;
  const TAP_MAX_MS = 250;       // max duration for a tap
  const TAP_MAX_MOVE_PX = 10;   // max movement for a tap

  canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    canvas.setPointerCapture(e.pointerId);
    const pos = toCanvasCoords(e.clientX, e.clientY);
    joystick.isActive = true; joystick.pointerId = e.pointerId;
    joystick.baseX = pos.x; joystick.baseY = pos.y;
    joystick.thumbX = pos.x; joystick.thumbY = pos.y;
    // Record for tap detection
    pointerDownTime = Date.now();
    pointerDownX = pos.x;
    pointerDownY = pos.y;
  }, { passive: false });

  canvas.addEventListener('pointermove', (e: PointerEvent) => {
    if (!joystick.isActive || e.pointerId !== joystick.pointerId) return;
    e.preventDefault();
    const pos = toCanvasCoords(e.clientX, e.clientY);
    const dx = pos.x - joystick.baseX;
    const dy = pos.y - joystick.baseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > JOYSTICK_OUTER_RADIUS) {
      joystick.thumbX = joystick.baseX + (dx / dist) * JOYSTICK_OUTER_RADIUS;
      joystick.thumbY = joystick.baseY + (dy / dist) * JOYSTICK_OUTER_RADIUS;
    } else {
      joystick.thumbX = pos.x; joystick.thumbY = pos.y;
    }
  }, { passive: false });

  function endJoystick(pointerId: number, pos?: { x: number; y: number }): void {
    if (pointerId !== joystick.pointerId) return;
    // Check for tap-to-target
    if (pos) {
      const elapsed = Date.now() - pointerDownTime;
      const dx = pos.x - pointerDownX;
      const dy = pos.y - pointerDownY;
      const moveDist = Math.sqrt(dx * dx + dy * dy);
      if (elapsed <= TAP_MAX_MS && moveDist <= TAP_MAX_MOVE_PX) {
        // This is a tap — find enemy at tap location
        tryTargetEnemyAt(pos.x, pos.y);
      }
    }
    joystick.isActive = false; joystick.pointerId = -1;
  }
  canvas.addEventListener('pointerup', (e: PointerEvent) => {
    const pos = toCanvasCoords(e.clientX, e.clientY);
    endJoystick(e.pointerId, pos);
  });
  canvas.addEventListener('pointercancel', (e: PointerEvent) => endJoystick(e.pointerId));

  function handleKeyDown(e: KeyboardEvent): void {
    if (!_isActive) return;
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA':  keys.left  = true; break;
      case 'ArrowRight': case 'KeyD': keys.right = true; break;
      case 'ArrowUp': case 'KeyW':    keys.up    = true; break;
      case 'ArrowDown': case 'KeyS':  keys.down  = true; break;
      default: return;
    }
    if (e.code.startsWith('Arrow')) e.preventDefault();
  }
  function handleKeyUp(e: KeyboardEvent): void {
    if (!_isActive) return;
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA':  keys.left  = false; break;
      case 'ArrowRight': case 'KeyD': keys.right = false; break;
      case 'ArrowUp': case 'KeyW':    keys.up    = false; break;
      case 'ArrowDown': case 'KeyS':  keys.down  = false; break;
    }
  }
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup',   handleKeyUp);

  /** Keeps an enemy within the arena, bouncing velocity. Uses a fixed margin of 2.5px. */
  function clampEnemyToBounds(enemy: { x: number; y: number; vx: number; vy: number }): void {
    const half = 2.5; // Conservative margin that works for all enemy sizes
    if (enemy.x < half)            { enemy.x = half;            enemy.vx =  Math.abs(enemy.vx) * 0.5; }
    if (enemy.x > widthPx  - half) { enemy.x = widthPx  - half; enemy.vx = -Math.abs(enemy.vx) * 0.5; }
    if (enemy.y < half)            { enemy.y = half;            enemy.vy =  Math.abs(enemy.vy) * 0.5; }
    if (enemy.y > heightPx - half) { enemy.y = heightPx - half; enemy.vy = -Math.abs(enemy.vy) * 0.5; }
  }

  function spawnEnemyById(enemyTypeId: string): void {
    const minDist = 80;
    let spawnX = 0, spawnY = 0, attempts = 0;
    const wn = currentWave;
    if (enemyTypeId === 'laser') {
      const half = LASER_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - LASER_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - LASER_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      enemies.push(makeLaserEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'sapphire') {
      const half = SAPPHIRE_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - SAPPHIRE_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - SAPPHIRE_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      sapphireEnemies.push(makeSapphireEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'emerald') {
      const half = EMERALD_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - EMERALD_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - EMERALD_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      emeraldEnemies.push(makeEmeraldEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'amber') {
      const half = AMBER_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - AMBER_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - AMBER_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      amberEnemies.push(makeAmberEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'void') {
      // Void enemies spawn at edges so they approach from a distance.
      const edge = Math.floor(Math.random() * 4);
      if      (edge === 0) { spawnX = Math.random() * widthPx;  spawnY = 0; }
      else if (edge === 1) { spawnX = Math.random() * widthPx;  spawnY = heightPx; }
      else if (edge === 2) { spawnX = 0;        spawnY = Math.random() * heightPx; }
      else                 { spawnX = widthPx;  spawnY = Math.random() * heightPx; }
      voidEnemies.push(makeVoidEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'quartz') {
      const half = QUARTZ_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - QUARTZ_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - QUARTZ_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      quartzEnemies.push(makeQuartzEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'ruby') {
      const half = RUBY_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - RUBY_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - RUBY_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      rubyEnemies.push(makeRubyEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'sunstone') {
      const half = SUNSTONE_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - SUNSTONE_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - SUNSTONE_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      sunstoneEnemies.push(makeSunstoneEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'citrine') {
      const half = CITRINE_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - CITRINE_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - CITRINE_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      citrineEnemies.push(makeCitrineEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'iolite') {
      const half = IOLITE_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - IOLITE_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - IOLITE_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      ioliteEnemies.push(makeIoliteEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'amethyst') {
      const half = AMETHYST_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - AMETHYST_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - AMETHYST_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      amethystEnemies.push(makeAmethystEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'diamond') {
      const half = DIAMOND_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - DIAMOND_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - DIAMOND_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      diamondEnemies.push(makeDiamondEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'nullstone') {
      // Nullstone spawns at edges to approach from a distance.
      const edge = Math.floor(Math.random() * 4);
      if      (edge === 0) { spawnX = Math.random() * widthPx;  spawnY = 0; }
      else if (edge === 1) { spawnX = Math.random() * widthPx;  spawnY = heightPx; }
      else if (edge === 2) { spawnX = 0;       spawnY = Math.random() * heightPx; }
      else                 { spawnX = widthPx; spawnY = Math.random() * heightPx; }
      nullstoneEnemies.push(makeNullstoneEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'fracteryl') {
      const half = FRACTERYL_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - FRACTERYL_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - FRACTERYL_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      fracterylEnemies.push(makeFracterylEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'eigenstein') {
      const half = EIGENSTEIN_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - EIGENSTEIN_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - EIGENSTEIN_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      eigensteinEnemies.push(makeEigensteinEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'boss') {
      bossEnemy = makeBossEnemy(Math.ceil(wn / 100), wn, widthPx, heightPx);
      enterBossWave();
    }
  }

  function startNextWave(): void {
    currentWave += 1;
    // Boss waves (multiples of 100) are fought via the RPG menu, not auto-progression.
    while (currentWave > 0 && currentWave % 100 === 0) {
      currentWave += 1;
    }
    if (currentWave > rpgSimState.highestWaveReached) {
      rpgSimState.highestWaveReached = currentWave;
    }
    const waveDef = getWaveDefinition(currentWave);
    spawnQueue.length = 0;
    for (const spawn of waveDef.spawns) {
      for (let i = 0; i < spawn.count; i++) {
        spawnQueue.push({ enemyTypeId: spawn.enemyTypeId, timerMs: spawn.spawnDelay * i });
      }
    }
    isInterWave = false;
  }

  function checkWaveCompletion(): void {
    if (isInterWave || spawnQueue.length > 0
        || enemies.length > 0 || sapphireEnemies.length > 0
        || emeraldEnemies.length > 0 || amberEnemies.length > 0 || voidEnemies.length > 0
        || quartzEnemies.length > 0 || rubyEnemies.length > 0 || sunstoneEnemies.length > 0
        || citrineEnemies.length > 0 || ioliteEnemies.length > 0 || amethystEnemies.length > 0
        || diamondEnemies.length > 0 || nullstoneEnemies.length > 0
        || fracterylEnemies.length > 0 || eigensteinEnemies.length > 0
        || bossEnemy !== null) return;
    isInterWave = true;
    interWaveTimerMs = INTER_WAVE_DELAY_MS;
  }

  function tickSpawnQueue(deltaMs: number): void {
    if (isInterWave) return;
    for (let i = spawnQueue.length - 1; i >= 0; i--) {
      spawnQueue[i].timerMs -= deltaMs;
      if (spawnQueue[i].timerMs <= 0) {
        spawnEnemyById(spawnQueue[i].enemyTypeId);
        spawnQueue.splice(i, 1);
      }
    }
  }

  /** Flag set at the start of each update() call; drives auto-move logic. */
  let _autoMoveEnabled = false;

  function updatePhysics(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const speedMul = getRpgSpeedMultiplier(rpgSimState);
    const effectiveMaxSpeed = MAX_RPG_SPEED * speedMul;

    if (joystick.isActive) {
      const dx = joystick.thumbX - joystick.baseX;
      const dy = joystick.thumbY - joystick.baseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > AUTO_MOVE_JOYSTICK_DEAD_ZONE) {
        // Manual joystick input overrides auto-move.
        const speed = (dist / JOYSTICK_OUTER_RADIUS) * effectiveMaxSpeed;
        mote.vx = (dx / dist) * speed;
        mote.vy = (dy / dist) * speed;
      } else {
        mote.vx *= RPG_VELOCITY_DAMPING;
        mote.vy *= RPG_VELOCITY_DAMPING;
      }
    } else {
      const dirX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const dirY = (keys.down  ? 1 : 0) - (keys.up   ? 1 : 0);
      const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
      const hasKeyInput = dirLen > 0;
      if (hasKeyInput) {
        // Keyboard input also overrides auto-move while held.
        mote.vx = (dirX / dirLen) * effectiveMaxSpeed;
        mote.vy = (dirY / dirLen) * effectiveMaxSpeed;
      } else if (_autoMoveEnabled && !isBossWaveActive && (enemies.length > 0 || sapphireEnemies.length > 0
          || emeraldEnemies.length > 0 || amberEnemies.length > 0 || voidEnemies.length > 0
          || quartzEnemies.length > 0 || rubyEnemies.length > 0 || sunstoneEnemies.length > 0
          || citrineEnemies.length > 0 || ioliteEnemies.length > 0 || amethystEnemies.length > 0
          || diamondEnemies.length > 0 || nullstoneEnemies.length > 0
          || fracterylEnemies.length > 0 || eigensteinEnemies.length > 0)) {
        // Auto-move: find nearest enemy and steer toward it, stopping when
        // the player is within the shortest range of any equipped weapon.
        let autoMoveStopRange = PLAYER_BASE_RANGE_PX;
        let hasWeapon = false;
        for (const weaponId of getEffectiveEquippedIds()) {
          const wd = WEAPON_BY_ID.get(weaponId);
          if (wd) {
            // For the diamond sword (swordCombo), the actual attack range is determined
            // by the blade length which grows with tier — not the static stats.range.
            // Use getSwordLength(tier) so auto-move keeps the player close enough to swing.
            let effectiveRange: number;
            if (wd.stats.effect?.kind === 'swordCombo') {
              const t = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
              effectiveRange = getSwordLength(t);
            } else {
              effectiveRange = wd.stats.range;
            }
            autoMoveStopRange = hasWeapon ? Math.min(autoMoveStopRange, effectiveRange) : effectiveRange;
            hasWeapon = true;
          }
        }

        let nearestDistSq = Infinity;
        let nearestX = 0, nearestY = 0;
        for (const enemy of enemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of sapphireEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of emeraldEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of amberEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of voidEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of quartzEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of rubyEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of sunstoneEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of citrineEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of ioliteEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of amethystEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of diamondEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of nullstoneEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of fracterylEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of eigensteinEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        if (nearestDistSq < Infinity) {
          const ex = nearestX - mote.x, ey = nearestY - mote.y;
          const d = Math.sqrt(ex * ex + ey * ey);
          if (d > autoMoveStopRange) {
            mote.vx = (ex / d) * effectiveMaxSpeed;
            mote.vy = (ey / d) * effectiveMaxSpeed;
          } else {
            mote.vx *= RPG_VELOCITY_DAMPING;
            mote.vy *= RPG_VELOCITY_DAMPING;
          }
        }
      } else {
        mote.vx *= RPG_VELOCITY_DAMPING;
        mote.vy *= RPG_VELOCITY_DAMPING;
      }
    }

    mote.x += mote.vx * dt; mote.y += mote.vy * dt;
    const half = RPG_MOTE_SIZE / 2;
    if (mote.x < half)            { mote.x = half;            mote.vx = 0; }
    if (mote.x > widthPx  - half) { mote.x = widthPx  - half; mote.vx = 0; }
    if (mote.y < half)            { mote.y = half;            mote.vy = 0; }
    if (mote.y > heightPx - half) { mote.y = heightPx - half; mote.vy = 0; }

    // Distance-based trail update: only add a trail point if player moved far enough.
    // This prevents trail bunching at high refresh rates (e.g. 144 Hz).
    const MIN_TRAIL_DISTANCE_SQ = MIN_TRAIL_DISTANCE * MIN_TRAIL_DISTANCE;
    const lastTrailIdx = (mote.trailHead - 1 + RPG_TRAIL_CAPACITY) % RPG_TRAIL_CAPACITY;
    const dx = mote.x - mote.trailX[lastTrailIdx];
    const dy = mote.y - mote.trailY[lastTrailIdx];
    const distSq = dx * dx + dy * dy;

    if (mote.trailCount === 0 || distSq >= MIN_TRAIL_DISTANCE_SQ) {
      mote.trailX[mote.trailHead] = mote.x;
      mote.trailY[mote.trailHead] = mote.y;
      mote.trailHead = (mote.trailHead + 1) % RPG_TRAIL_CAPACITY;
      if (mote.trailCount < RPG_TRAIL_CAPACITY) mote.trailCount++;
    }
    // Movement glow smoothing via LERP
    const speed = Math.sqrt(mote.vx * mote.vx + mote.vy * mote.vy);
    if (speed > TRAIL_SPEED_THRESHOLD) {
      glowMovementIntensity = Math.min(1, glowMovementIntensity + GLOW_MOVE_RAMP_UP * deltaMs);
    } else {
      glowMovementIntensity = Math.max(0, glowMovementIntensity - GLOW_MOVE_RAMP_DOWN * deltaMs);
    }
    // Track aim direction for vortex / sword weapons.
    if (speed > 0.1) {
      playerAimAngle = Math.atan2(mote.vy, mote.vx);
    } else {
      // Fallback: aim toward nearest visible enemy.
      let nearestAimDistSq = Infinity;
      const checkAimEnemy = (e: { x: number; y: number }) => {
        const ax = e.x - mote.x, ay = e.y - mote.y;
        const d = ax * ax + ay * ay;
        if (d < nearestAimDistSq) { nearestAimDistSq = d; playerAimAngle = Math.atan2(ay, ax); }
      };
      for (const e of enemies)          checkAimEnemy(e);
      for (const e of sapphireEnemies)  checkAimEnemy(e);
      for (const e of emeraldEnemies)   checkAimEnemy(e);
      for (const e of amberEnemies)     checkAimEnemy(e);
      for (const e of voidEnemies)      checkAimEnemy(e);
      for (const e of quartzEnemies)    checkAimEnemy(e);
      for (const e of rubyEnemies)      checkAimEnemy(e);
      for (const e of sunstoneEnemies)  checkAimEnemy(e);
      for (const e of citrineEnemies)   checkAimEnemy(e);
      for (const e of ioliteEnemies)    checkAimEnemy(e);
      for (const e of amethystEnemies)  checkAimEnemy(e);
      for (const e of diamondEnemies)   checkAimEnemy(e);
      for (const e of nullstoneEnemies) checkAimEnemy(e);
      for (const e of fracterylEnemies) checkAimEnemy(e);
      for (const e of eigensteinEnemies) checkAimEnemy(e);
      if (bossEnemy) checkAimEnemy(bossEnemy);
    }
    // Inject player movement into the fluid (only when meaningfully moving).
    if (speed > TRAIL_SPEED_THRESHOLD) {
      fluid.addForce({
        x: mote.x, y: mote.y,
        vx: mote.vx * FLUID_VEL_FRAME_TO_PX_S,
        vy: mote.vy * FLUID_VEL_FRAME_TO_PX_S,
        r: FLUID_PLAYER_R, g: FLUID_PLAYER_G, b: FLUID_PLAYER_B,
        strength: FLUID_PLAYER_STRENGTH,
      });
    }
  }

  /** Updates all equipped-weapon visual orbit particles. */
  function updateWeaponOrbitParticles(deltaMs: number): void {
    if (weaponOrbitParticles.length === 0) return;
    const dt = deltaMs / 1000;
    const angleStep = weaponOrbitParticles.length > 0 ? (2 * Math.PI) / weaponOrbitParticles.length : 0;
    for (let idx = 0; idx < weaponOrbitParticles.length; idx++) {
      const p = weaponOrbitParticles[idx];
      p.angle += WEAPON_PARTICLE_ORBIT_SPEED * dt;
      // Keep evenly spaced when multiple weapons are equipped
      const targetAngle = idx * angleStep + (Date.now() / 1000) * WEAPON_PARTICLE_ORBIT_SPEED;
      const angleDelta = ((targetAngle - p.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      p.angle += angleDelta * 0.05;
      const newX = mote.x + Math.cos(p.angle) * WEAPON_PARTICLE_ORBIT_RADIUS;
      const newY = mote.y + Math.sin(p.angle) * WEAPON_PARTICLE_ORBIT_RADIUS;
      const dx = newX - p.x, dy = newY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < WEAPON_PARTICLE_MIN_SPEED * dt) p.angle += 0.05;
      p.x = newX; p.y = newY;

      // Distance-based trail update for weapon particles to prevent jittering at high refresh rates.
      const MIN_TRAIL_DISTANCE_SQ = MIN_TRAIL_DISTANCE * MIN_TRAIL_DISTANCE;
      const lastTrailIdx = (p.trailHead - 1 + WEAPON_ORBIT_TRAIL_CAP) % WEAPON_ORBIT_TRAIL_CAP;
      const trailDx = p.x - p.trailX[lastTrailIdx];
      const trailDy = p.y - p.trailY[lastTrailIdx];
      const trailDistSq = trailDx * trailDx + trailDy * trailDy;

      if (p.trailCount === 0 || trailDistSq >= MIN_TRAIL_DISTANCE_SQ) {
        p.trailX[p.trailHead] = p.x;
        p.trailY[p.trailHead] = p.y;
        p.trailHead = (p.trailHead + 1) % WEAPON_ORBIT_TRAIL_CAP;
        if (p.trailCount < WEAPON_ORBIT_TRAIL_CAP) p.trailCount++;
      }
    }
  }

  /** Updates the orbiting projectile: angle, trail, and enemy collision. */
  function updateOrbitProjectile(deltaMs: number): void {
    const op = orbitProjectile;
    if (!op) return;
    const dt = deltaMs / 1000;
    op.angle -= ORBIT_PROJ_SPEED_RAD * dt;  // counter-clockwise, doubled speed
    op.x = mote.x + Math.cos(op.angle) * ORBIT_PROJ_RADIUS;
    op.y = mote.y + Math.sin(op.angle) * ORBIT_PROJ_RADIUS;

    // Distance-based trail update for orbit projectile to prevent jittering at high refresh rates.
    const MIN_TRAIL_DISTANCE_SQ = MIN_TRAIL_DISTANCE * MIN_TRAIL_DISTANCE;
    const lastTrailIdx = (op.trailHead - 1 + ORBIT_PROJ_TRAIL_CAP) % ORBIT_PROJ_TRAIL_CAP;
    const trailDx = op.x - op.trailX[lastTrailIdx];
    const trailDy = op.y - op.trailY[lastTrailIdx];
    const trailDistSq = trailDx * trailDx + trailDy * trailDy;

    if (op.trailCount === 0 || trailDistSq >= MIN_TRAIL_DISTANCE_SQ) {
      op.trailX[op.trailHead] = op.x;
      op.trailY[op.trailHead] = op.y;
      op.trailHead = (op.trailHead + 1) % ORBIT_PROJ_TRAIL_CAP;
      if (op.trailCount < ORBIT_PROJ_TRAIL_CAP) op.trailCount++;
    }

    // Advance per-enemy hit cooldowns.
    for (const [enemy, cdMs] of op.hitCooldowns) {
      const newCd = cdMs - deltaMs;
      if (newCd <= 0) op.hitCooldowns.delete(enemy);
      else            op.hitCooldowns.set(enemy, newCd);
    }

    // Collision detection with laser enemies.
    for (const enemy of enemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x;
      const dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = Math.max(0, ORBIT_PROJ_DAMAGE - enemy.def);
        if (dmg > 0) enemy.hp -= dmg;
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        const ratio = dmg / enemy.maxHp;
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), ratio, '#ffaa44');
      }
    }
    // Collision detection with sapphire enemies (hits shield first).
    for (const enemy of sapphireEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageSapphireEnemy(enemy, ORBIT_PROJ_DAMAGE, 0, false);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with missiles.
    for (const m of sapphireMissiles) {
      if (op.hitCooldowns.has(m)) continue;
      const dx = op.x - m.x, dy = op.y - m.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        damageMissile(m, ORBIT_PROJ_DAMAGE);
        op.hitCooldowns.set(m, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: m.x, y: m.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
      }
    }
    // Collision detection with emerald enemies.
    for (const enemy of emeraldEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageEmeraldEnemy(enemy, ORBIT_PROJ_DAMAGE, 0);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with amber enemies.
    for (const enemy of amberEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageAmberEnemy(enemy, ORBIT_PROJ_DAMAGE, 0);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with amber shards.
    for (const s of amberShards) {
      if (op.hitCooldowns.has(s)) continue;
      const dx = op.x - s.x, dy = op.y - s.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        damageAmberShard(s, ORBIT_PROJ_DAMAGE);
        op.hitCooldowns.set(s, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: s.x, y: s.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
      }
    }
    // Collision detection with void enemies.
    for (const enemy of voidEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageVoidEnemy(enemy, ORBIT_PROJ_DAMAGE, 0);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with quartz enemies.
    for (const enemy of quartzEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageQuartzEnemy(enemy, ORBIT_PROJ_DAMAGE, 0);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with ruby enemies.
    for (const enemy of rubyEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageRubyEnemy(enemy, ORBIT_PROJ_DAMAGE, 0);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with sunstone enemies.
    for (const enemy of sunstoneEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageSunstoneEnemy(enemy, ORBIT_PROJ_DAMAGE, 0);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with citrine enemies.
    for (const enemy of citrineEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageCitrineEnemy(enemy, ORBIT_PROJ_DAMAGE, 0);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with iolite enemies.
    for (const enemy of ioliteEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageIoliteEnemy(enemy, ORBIT_PROJ_DAMAGE, 0);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with amethyst enemies.
    for (const enemy of amethystEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageAmethystEnemy(enemy, ORBIT_PROJ_DAMAGE, 0, false);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with diamond enemies.
    for (const enemy of diamondEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageDiamondEnemy(enemy, ORBIT_PROJ_DAMAGE, 0);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with nullstone enemies.
    for (const enemy of nullstoneEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageNullstoneEnemy(enemy, ORBIT_PROJ_DAMAGE, 0);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with fracteryl enemies.
    for (const enemy of fracterylEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageFracterylEnemy(enemy, ORBIT_PROJ_DAMAGE, 0);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with eigenstein enemies.
    for (const enemy of eigensteinEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageEigensteinEnemy(enemy, ORBIT_PROJ_DAMAGE, 0);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with boss.
    if (bossEnemy && !op.hitCooldowns.has(bossEnemy)) {
      const dx = op.x - bossEnemy.x, dy = op.y - bossEnemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageBossEnemy(ORBIT_PROJ_DAMAGE, 0);
        op.hitCooldowns.set(bossEnemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: bossEnemy.x, y: bossEnemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        if (dmg > 0) spawnDamageNumber(bossEnemy.x, bossEnemy.y, 0, -1, String(Math.round(dmg)), dmg / bossEnemy.maxHp, '#ffaa44');
      }
    }
  }

  /**
   * Applies raw enemy ATK damage to the player after subtracting player DEF,
   * subject to iframes. Mutates playerStats.hp and playerIFramesMs.
   */
  function dealDamageToPlayer(atkValue: number): void {
    if (playerIFramesMs > 0) return;
    const rawDmg = atkValue - playerStats.def;
    const dmg = Math.max(0, rawDmg);
    if (dmg <= 0) {
      spawnDamageNumber(mote.x, mote.y, 0, -1, 'BLOCKED', 0.25, '#74c0fc');
    } else {
      playerStats.hp = Math.max(0, playerStats.hp - dmg);
      const ratio = Math.min(1, dmg / playerStats.maxHp);
      playerIFramesMs = PLAYER_IFRAME_MIN_MS + ratio * PLAYER_IFRAME_MAX_ADD_MS;
      spawnDamageNumber(mote.x, mote.y, 0, -1, String(Math.round(dmg)), ratio, '#ff6666');
    }
  }

  /**
   * Applies damage to the player with a directional knockback impulse.
   * Used exclusively by Amber shards which carry velocity-based knockback.
   * Prefer `dealDamageToPlayer` for all other enemy contact/projectile damage.
   * @param atkValue - raw attack value (defence subtracted internally)
   * @param normDirX - normalised knockback / damage-number direction X
   * @param normDirY - normalised knockback / damage-number direction Y
   */
  function dealDamageToPlayerKnockback(atkValue: number, normDirX: number, normDirY: number): void {
    if (playerIFramesMs > 0) return;
    const rawDmg = atkValue - playerStats.def;
    const dmg = Math.max(0, rawDmg);
    if (dmg <= 0) {
      spawnDamageNumber(mote.x, mote.y, normDirX, normDirY, 'BLOCKED', 0.25, '#74c0fc');
    } else {
      playerStats.hp = Math.max(0, playerStats.hp - dmg);
      const ratio = Math.min(1, dmg / playerStats.maxHp);
      mote.vx += normDirX * PLAYER_KNOCKBACK_MAX * ratio;
      mote.vy += normDirY * PLAYER_KNOCKBACK_MAX * ratio;
      playerIFramesMs = PLAYER_IFRAME_MIN_MS + ratio * PLAYER_IFRAME_MAX_ADD_MS;
      spawnDamageNumber(mote.x, mote.y, normDirX, normDirY, String(Math.round(dmg)), ratio, '#ff6666');
    }
  }

  // ── Enemy update context (shared reference object for rpg-enemy-updates) ──
  const enemyCtx: RpgEnemyCtx = {
    mote,
    dim,
    fluid,
    hitEffects,
    shotLines,
    dealDamageToPlayer,
    dealDamageToPlayerKnockback,
    clampEnemyToBounds,
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

  function triggerDeath(): void {
    rpgPhase = 'dying'; phaseTimerMs = 0; deathAlpha = 1;
    deathParticles.length = 0;
    for (let i = 0; i < DEATH_BURST_COUNT; i++) {
      const angle = (i / DEATH_BURST_COUNT) * Math.PI * 2 + Math.random() * 0.35;
      const speed = 0.8 + Math.random() * 1.8;
      deathParticles.push({
        x: mote.x, y: mote.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        alpha: 1, size: 1.5 + Math.random() * 2,
        color: DEATH_PARTICLE_COLORS[Math.floor(Math.random() * DEATH_PARTICLE_COLORS.length)],
      });
    }
  }

  function doRestart(): void {
    playerStats.hp = playerStats.maxHp;
    enemies.length = 0; spawnQueue.length = 0;
    sapphireEnemies.length = 0; sapphireMissiles.length = 0;
    emeraldEnemies.length = 0;
    amberEnemies.length = 0; amberShards.length = 0;
    voidEnemies.length = 0;
    quartzEnemies.length = 0; quartzSpikes.length = 0;
    rubyEnemies.length = 0; rubyBolts.length = 0;
    sunstoneEnemies.length = 0;
    citrineEnemies.length = 0; citrineBolts.length = 0;
    ioliteEnemies.length = 0;
    amethystEnemies.length = 0; amethystShards.length = 0;
    diamondEnemies.length = 0; diamondShards.length = 0;
    nullstoneEnemies.length = 0; voidTendrils.length = 0;
    fracterylEnemies.length = 0; fracterylShards.length = 0;
    eigensteinEnemies.length = 0; eigensteinBeams.length = 0;
    danmakuSafeZone = null;
    exitBossWave();
    isBossFightFromMenu = false;
    bossEnemy = null;
    bossProjectiles.length = 0;
    sandProjectiles.length = 0;
    chainWhipStates.clear();
    activeVortexes.length = 0; vortexWeaponStates.clear();
    swordComboStates.clear();
    poisonBolts.length = 0; poisonDebuffs.clear();
    emeraldPlayerMissiles.length = 0;
    emeraldSubMissiles.length = 0;
    sunstoneMines.length = 0;
    laserBeamEffect = null;
    mote.x = widthPx / 2; mote.y = heightPx / 2;
    mote.vx = mote.vy = 0; mote.trailHead = 0; mote.trailCount = 0;
    deathParticles.length = 0; glowMovementIntensity = 0;
    bossHitsInRound = 0;
    currentWave = rpgSimState.respawnWave; isInterWave = true;
    interWaveTimerMs = INTER_WAVE_DELAY_MS * 0.4;
    screenDarken = 0;
    weaponAttackTimers.clear();
    hitEffects.length = 0; shotLines.length = 0;
    damageNumbers.length = 0; playerIFramesMs = 0;
    luckyMotes.length = 0; luckyMotePopups.length = 0;
    fluid.reset();
    applyEquipmentStats();
  }

  // ── Enemy update systems ──────────────────────────────────────
  // All per-frame enemy update functions are implemented in
  // rpg-enemy-updates.ts (and rpg-enemy-updates-adv.ts) and called via enemyCtx.
  // updateLaserEnemies, updateSapphireEnemies, updateSapphireMissiles,
  // updateEmeraldEnemies, updateAmberEnemies, updateAmberShards,
  // updateVoidEnemies, updateQuartzEnemies, updateQuartzSpikes,
  // updateRubyEnemies, updateRubyBolts, updateSunstoneEnemies,
  // updateCitrineEnemies, updateCitrineBolts, updateIoliteEnemies,
  // updateAmethystEnemies, updateAmethystShards,
  // updateDiamondEnemies, updateDiamondShards,
  // updateNullstoneEnemies, updateVoidTendrils,
  // updateFracterylEnemies, updateEigensteinEnemies, updateEigensteinBeams,
  // updateTeleportParticles

  function drawEnemies(nowMs: number): void {
    for (const enemy of enemies) {
      drawAttackTrail(ctx, enemy, nowMs);
      const half = LASER_ENEMY_SIZE / 2;
      if (!isLowGraphicsMode) {
        ctx.shadowBlur = LASER_ENEMY_SIZE * 5; ctx.shadowColor = LASER_ENEMY_GLOW;
      }
      ctx.fillStyle = LASER_ENEMY_COLOR;
      ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), LASER_ENEMY_SIZE, LASER_ENEMY_SIZE);
      ctx.shadowBlur = 0;
    }
  }

  function drawEnemyIndicators(): void {
    if (enemyIndicatorStyle === 'off') return;
    const drawMarker = (x: number, y: number, size: number): void => {
      if (enemyIndicatorStyle === 'outline') {
        ctx.save();
        ctx.strokeStyle = '#ff3b30';
        ctx.lineWidth = 1.5;
        if (!isLowGraphicsMode) {
          ctx.shadowBlur = 6;
          ctx.shadowColor = '#ff3b30';
        }
        ctx.strokeRect(x - size / 2 - 2, y - size / 2 - 2, size + 4, size + 4);
        ctx.restore();
        return;
      }
      ctx.save();
      const markerY = y - size * 0.9 - 5;
      ctx.fillStyle = '#ff3b30';
      if (!isLowGraphicsMode) {
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#ff3b30';
      }
      ctx.beginPath();
      ctx.moveTo(x, markerY);
      ctx.lineTo(x - 3, markerY - 5);
      ctx.lineTo(x + 3, markerY - 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    for (const enemy of enemies) drawMarker(enemy.x, enemy.y, LASER_ENEMY_SIZE);
    for (const enemy of sapphireEnemies) drawMarker(enemy.x, enemy.y, SAPPHIRE_ENEMY_SIZE);
    for (const enemy of emeraldEnemies) drawMarker(enemy.x, enemy.y, EMERALD_ENEMY_SIZE);
    for (const enemy of amberEnemies) drawMarker(enemy.x, enemy.y, AMBER_ENEMY_SIZE);
    for (const enemy of voidEnemies) drawMarker(enemy.x, enemy.y, VOID_ENEMY_SIZE);
    for (const enemy of quartzEnemies) drawMarker(enemy.x, enemy.y, QUARTZ_ENEMY_SIZE);
    for (const enemy of rubyEnemies) drawMarker(enemy.x, enemy.y, RUBY_ENEMY_SIZE);
    for (const enemy of sunstoneEnemies) drawMarker(enemy.x, enemy.y, SUNSTONE_ENEMY_SIZE);
    for (const enemy of citrineEnemies) drawMarker(enemy.x, enemy.y, CITRINE_ENEMY_SIZE);
    for (const enemy of ioliteEnemies) drawMarker(enemy.x, enemy.y, IOLITE_ENEMY_SIZE);
    for (const enemy of amethystEnemies) drawMarker(enemy.x, enemy.y, AMETHYST_ENEMY_SIZE);
    for (const enemy of diamondEnemies) drawMarker(enemy.x, enemy.y, DIAMOND_ENEMY_SIZE);
    for (const enemy of nullstoneEnemies) drawMarker(enemy.x, enemy.y, NULLSTONE_ENEMY_SIZE);
    for (const enemy of fracterylEnemies) drawMarker(enemy.x, enemy.y, FRACTERYL_ENEMY_SIZE);
    for (const enemy of eigensteinEnemies) drawMarker(enemy.x, enemy.y, EIGENSTEIN_ENEMY_SIZE);
    if (bossEnemy) drawMarker(bossEnemy.x, bossEnemy.y, BOSS_SIZE_BASE * 2);
  }


  /** Draws thin tracer lines from the player toward each recently struck enemy. */

  /** Draws a small expanding square flash at each recently hit enemy position. */

  /** Draws floating damage numbers and "BLOCKED" labels. */

  /** Draws one equipped-weapon visual orbit particle with comet trail. */

  /** Draws the orbiting projectile with comet trail. */


  function draw(nowMs: number): void {
    ctx.clearRect(0, 0, widthPx, heightPx);
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, widthPx, heightPx);

    // Fluid background — rendered first so all gameplay elements appear above it.
    fluid.render(ctx);

    drawEnemies(nowMs);
    drawSapphireEnemies(ctx, sapphireEnemies);
    drawSapphireMissiles(ctx, sapphireMissiles);
    drawEmeraldEnemies(ctx, emeraldEnemies);
    drawAmberEnemies(ctx, amberEnemies);
    drawAmberShards(ctx, amberShards);
    drawVoidEnemies(ctx, voidEnemies);
    drawQuartzEnemies(ctx, quartzEnemies);
    drawQuartzSpikes(ctx, quartzSpikes);
    drawRubyEnemies(ctx, rubyEnemies);
    drawRubyBolts(ctx, rubyBolts);
    drawSunstoneEnemies(ctx, sunstoneEnemies);
    drawCitrineEnemies(ctx, citrineEnemies);
    drawCitrineBolts(ctx, citrineBolts);
    drawIoliteEnemies(ctx, ioliteEnemies);
    drawAmethystEnemies(ctx, amethystEnemies);
    drawAmethystShards(ctx, amethystShards);
    drawDiamondEnemies(ctx, diamondEnemies);
    drawDiamondShards(ctx, diamondShards);
    drawNullstoneEnemies(ctx, nullstoneEnemies);
    drawVoidTendrils(ctx, voidTendrils);
    drawFracterylEnemies(ctx, fracterylEnemies, fracterylShards);
    drawEigensteinEnemies(ctx, eigensteinEnemies);
    drawEigensteinBeams(ctx, eigensteinBeams, widthPx, heightPx);
    drawBottomSafeZone(ctx, isBossWaveActive, widthPx, heightPx, glowTimeS);
    drawDanmakuSafeZone(ctx, bossEnemy, danmakuSafeZone);
    drawBossProjectiles(ctx, bossProjectiles);
    drawBossEnemy(ctx, bossEnemy, glowTimeS);
    drawTeleportParticles(ctx, teleportParticles);
    drawShotLines(ctx, shotLines);
    drawVortexes(ctx, activeVortexes);
    drawSandProjectiles(ctx, sandProjectiles);
    drawPoisonBolts(ctx, poisonBolts);
    drawEmeraldPlayerMissiles(ctx, emeraldPlayerMissiles);
    drawEmeraldSubMissiles(ctx, emeraldSubMissiles);
    drawEmeraldSwirlParticles(ctx, emeraldSwirlParticles);
    drawSunstoneMines(ctx, sunstoneMines);
    drawLaserBeamEffect(ctx, laserBeamEffect);
    drawEnemyIndicators();

    // Player comet trail — smoothly gated by glowMovementIntensity
    if (!isLowGraphicsMode && glowMovementIntensity > 0.02 && mote.trailCount >= 2) {
      const trailLen = mote.trailCount;
      for (let i = 0; i < trailLen; i++) {
        const t      = i / trailLen;
        const bufIdx = (mote.trailHead - trailLen + i + RPG_TRAIL_CAPACITY) % RPG_TRAIL_CAPACITY;
        const trailSize = RPG_MOTE_SIZE * t * 1.3;
        if (trailSize < 0.3) continue;
        const half = trailSize / 2;
        ctx.globalAlpha = t * 0.45 * glowMovementIntensity;
        ctx.shadowBlur  = trailSize * 6; ctx.shadowColor = RPG_MOTE_GLOW; ctx.fillStyle = RPG_MOTE_GLOW;
        const gh = half * 2.2;
        ctx.fillRect(Math.floor(mote.trailX[bufIdx] - gh), Math.floor(mote.trailY[bufIdx] - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
        ctx.shadowBlur = 0;
        ctx.globalAlpha = t * 0.7 * glowMovementIntensity;
        ctx.fillStyle   = RPG_MOTE_COLOR;
        ctx.fillRect(Math.floor(mote.trailX[bufIdx] - half), Math.floor(mote.trailY[bufIdx] - half), Math.ceil(trailSize), Math.ceil(trailSize));
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    const playerVisible = rpgPhase === 'alive' || rpgPhase === 'dying';
    if (playerVisible) {
      const pa = rpgPhase === 'dying' ? deathAlpha : 1;
      const pulseT   = (Math.sin(glowTimeS * GLOW_PULSE_SPEED) + 1) * 0.5;
      // Dampen the stationary glow while the player is moving — the comet
      // trail already gives strong visual feedback during motion.
      const glowDampeningFactor = 1 - glowMovementIntensity * 0.65;
      // During iframes: tint the glow blue and flicker the sprite at ~8 Hz.
      const inIFrames = playerIFramesMs > 0;
      const iFrameFlicker = inIFrames && (Math.floor(playerIFramesMs / IFRAME_FLICKER_INTERVAL_MS) % 2 === 0);
      const moteGlowColor  = inIFrames ? '#74c0fc' : RPG_MOTE_GLOW;
      const moteBodyColor  = inIFrames ? '#b0d4ff' : RPG_MOTE_COLOR;
      const glowSize = RPG_MOTE_SIZE * (2.2 + pulseT * 1.4 * glowDampeningFactor);
      const glowHalf = glowSize / 2;
      if (!isLowGraphicsMode) {
        ctx.globalAlpha = (0.18 + pulseT * 0.22) * glowDampeningFactor * pa;
        ctx.shadowBlur  = glowSize * 3; ctx.shadowColor = moteGlowColor; ctx.fillStyle = moteGlowColor;
        ctx.fillRect(Math.floor(mote.x - glowHalf), Math.floor(mote.y - glowHalf), Math.ceil(glowSize), Math.ceil(glowSize));
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      }
      if (!iFrameFlicker) {
        ctx.globalAlpha = pa;
        if (!isLowGraphicsMode) {
          ctx.shadowBlur  = RPG_MOTE_SIZE * 5; ctx.shadowColor = moteGlowColor;
        }
        ctx.fillStyle = moteBodyColor;
        const mh = RPG_MOTE_SIZE / 2;
        ctx.fillRect(Math.floor(mote.x - mh), Math.floor(mote.y - mh), RPG_MOTE_SIZE, RPG_MOTE_SIZE);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
    }

    drawHitEffects(ctx, hitEffects);
    drawLuckyMotes(ctx, luckyMotes, isLowGraphicsMode);
    drawDamageNumbers(ctx, damageNumbers);
    drawLuckyMotePopups(ctx, luckyMotePopups, isLowGraphicsMode);
    if (deathParticles.length > 0) drawDeathParticles(ctx, deathParticles);

    // Draw weapon orbit particles, orbit projectile, and special weapon visuals above the player.
    if (rpgPhase === 'alive') {
      for (const p of weaponOrbitParticles) drawWeaponOrbitParticle(ctx, p);
      drawOrbitProjectile(ctx, orbitProjectile);
      for (const ws of chainWhipStates.values()) drawChainWhip(ctx, ws);
      drawSwordCombos(ctx, swordComboStates, mote, rpgSimState.weaponTiersByWeaponId);
      // ── Companion ships and lasers ────────────────────────────────
      drawSapphireShips(ctx, sapphireShips);
      drawSapphireLasers(ctx, sapphireLasers);
      drawAmethystShips(ctx, amethystShips);
      drawAmethystLasers(ctx, amethystLasers);
      // ── Target reticle ────────────────────────────────────────────
      if (targetedEnemy) {
        const te = targetedEnemy as { x: number; y: number };
        drawTargetReticle(ctx, te.x, te.y, 10, performance.now());
      }
    }

    if (joystick.isActive && rpgPhase === 'alive') {
      ctx.save();
      ctx.globalAlpha = 0.35; ctx.strokeStyle = '#fff172'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(joystick.baseX, joystick.baseY, JOYSTICK_OUTER_RADIUS, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.55; ctx.fillStyle = '#fff172';
      ctx.shadowBlur = JOYSTICK_THUMB_RADIUS * 2; ctx.shadowColor = 'rgba(255, 241, 114, 0.6)';
      ctx.beginPath(); ctx.arc(joystick.thumbX, joystick.thumbY, JOYSTICK_THUMB_RADIUS, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.restore();
    }

    if (rpgPhase === 'alive') drawWaveClearBanner(ctx, isInterWave, currentWave, interWaveTimerMs, widthPx, heightPx);

    if (screenDarken > 0) {
      ctx.globalAlpha = screenDarken; ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, widthPx, heightPx); ctx.globalAlpha = 1;
    }
    if (rpgPhase === 'restarting') {
      ctx.globalAlpha = 1 - restartFadeAlpha; ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, widthPx, heightPx); ctx.globalAlpha = 1;
    }
  }

  function updateDying(deltaMs: number): void {
    phaseTimerMs += deltaMs;
    const t = Math.min(phaseTimerMs / DEATH_ANIM_DURATION_MS, 1);
    deathAlpha   = Math.max(0, 1 - t * 1.25);
    screenDarken = Math.min(t * 0.85, 0.85);
    for (const p of deathParticles) {
      p.x += p.vx * deltaMs * 0.06; p.y += p.vy * deltaMs * 0.06;
      p.alpha = Math.max(0, 1 - t * 1.5);
      p.vx *= 0.97; p.vy *= 0.97;
    }
    if (phaseTimerMs >= DEATH_ANIM_DURATION_MS + DEATH_HOLD_DURATION_MS) {
      screenDarken = 1;
      doRestart();
      rpgPhase = 'restarting'; phaseTimerMs = 0; restartFadeAlpha = 0;
    }
  }

  function updateRestarting(deltaMs: number): void {
    phaseTimerMs    += deltaMs;
    restartFadeAlpha = Math.min(1, phaseTimerMs / RESTART_FADE_IN_MS);
    screenDarken     = 0;
    if (phaseTimerMs >= RESTART_FADE_IN_MS) rpgPhase = 'alive';
  }

  return {
    canvas,
    statsPanel,

    update(deltaMs: number, autoMoveEnabled = false): void {
      const nowMs = performance.now();
      glowTimeS += deltaMs / 1000;
      _autoMoveEnabled = autoMoveEnabled;

      if (rpgPhase === 'dying') {
        updateDying(deltaMs);
        fluid.step(deltaMs);
        draw(nowMs);
        updateStatsPanelDom();
        return;
      }
      if (rpgPhase === 'restarting') {
        updateRestarting(deltaMs);
        fluid.step(deltaMs);
        draw(nowMs);
        updateStatsPanelDom();
        return;
      }

      if (isInterWave) {
        interWaveTimerMs -= deltaMs;
        if (interWaveTimerMs <= 0) startNextWave();
      } else {
        tickSpawnQueue(deltaMs);
        checkWaveCompletion();
      }

      updatePhysics(deltaMs);
      updateLaserEnemies(enemies, enemyCtx, deltaMs, nowMs);
      updateSapphireEnemies(sapphireEnemies, sapphireMissiles, enemyCtx, deltaMs);
      updateSapphireMissiles(sapphireMissiles, enemyCtx, deltaMs);
      updateEmeraldEnemies(emeraldEnemies, enemyCtx, deltaMs);
      updateAmberEnemies(amberEnemies, amberShards, enemyCtx, deltaMs);
      updateAmberShards(amberShards, enemyCtx, deltaMs);
      updateVoidEnemies(voidEnemies, enemyCtx, deltaMs);
      updateQuartzEnemies(quartzEnemies, quartzSpikes, enemyCtx, deltaMs);
      updateQuartzSpikes(quartzSpikes, enemyCtx, deltaMs);
      updateRubyEnemies(rubyEnemies, rubyBolts, enemyCtx, deltaMs);
      updateRubyBolts(rubyBolts, enemyCtx, deltaMs);
      updateSunstoneEnemies(sunstoneEnemies, enemyCtx, deltaMs);
      updateCitrineEnemies(citrineEnemies, citrineBolts, enemyCtx, deltaMs);
      updateCitrineBolts(citrineBolts, enemyCtx, deltaMs);
      updateIoliteEnemies(ioliteEnemies, enemyCtx, deltaMs);
      updateAmethystEnemies(amethystEnemies, amethystShards, enemyCtx, deltaMs);
      updateAmethystShards(amethystShards, enemyCtx, deltaMs);
      updateDiamondEnemies(diamondEnemies, diamondShards, enemyCtx, deltaMs);
      updateDiamondShards(diamondShards, enemyCtx, deltaMs);
      updateNullstoneEnemies(nullstoneEnemies, voidTendrils, enemyCtx, deltaMs);
      updateVoidTendrils(voidTendrils, enemyCtx, deltaMs);
      updateFracterylEnemies(fracterylEnemies, fracterylShards, enemyCtx, deltaMs);
      updateEigensteinEnemies(eigensteinEnemies, eigensteinBeams, enemyCtx, deltaMs);
      updateEigensteinBeams(eigensteinBeams, enemyCtx, deltaMs);
      if (bossEnemy) {
        const bossSpeedMult = isBossWaveActive ? (rpgSimState.bossSpeedPct / 100) : 1;
        updateBossEnemy(bossEnemy, bossCtx, deltaMs * bossSpeedMult);
        updateBossProjectiles(bossProjectiles, bossCtx, deltaMs * bossSpeedMult);
      } else {
        updateBossProjectiles(bossProjectiles, bossCtx, deltaMs);
      }
      updateTeleportParticles(teleportParticles, deltaMs);
      updateWeaponOrbitParticles(deltaMs);
      updateOrbitProjectile(deltaMs);
      withDamageSource(findEquippedWeaponIdByEffect('gatling'), () => updateSandProjectiles(deltaMs));
      // Update chain whip for all equipped chainWhip weapons
      for (const weaponId of getEffectiveEquippedIds()) {
        const wd = WEAPON_BY_ID.get(weaponId);
        if (wd?.stats.effect?.kind === 'chainWhip') withDamageSource(weaponId, () => updateChainWhip(weaponId, deltaMs));
      }
      // Update vortex and sword combo systems
      for (const weaponId of getEffectiveEquippedIds()) {
        const wd = WEAPON_BY_ID.get(weaponId);
        if (wd?.stats.effect?.kind === 'vortex')    withDamageSource(weaponId, () => updateVortexWeapon(weaponId, deltaMs));
        if (wd?.stats.effect?.kind === 'swordCombo') withDamageSource(weaponId, () => updateSwordCombo(weaponId, deltaMs));
      }
      withDamageSource(findEquippedWeaponIdByEffect('vortex'), () => updateVortexes(deltaMs));
      withDamageSource(findEquippedWeaponIdByEffect('poisonBolt'), () => {
        updatePoisonBolts(deltaMs);
        updatePoisonDebuffs(deltaMs);
      });
      withDamageSource(findEquippedWeaponIdByEffect('emeraldMissile'), () => {
        updateEmeraldPlayerMissiles(deltaMs);
        updateEmeraldSubMissiles(deltaMs);
      });
      updateEmeraldSwirlParticles(deltaMs);
      withDamageSource(findEquippedWeaponIdByEffect('sunstoneMine'), () => updateSunstoneMines(deltaMs));
      updateLaserBeamEffect(deltaMs);
      // ── Companion ship systems ────────────────────────────────────
      updateSapphireShips(deltaMs);
      updateSapphireLasers(deltaMs);
      updateAmethystShips(deltaMs);
      updateAmethystLasers(deltaMs);
      removeDeadEnemies();
      checkWaveCompletion();

      // ── Per-weapon auto-attack timers ─────────────────────────────
      for (const weaponId of getEffectiveEquippedIds()) {
        const weaponDef = WEAPON_BY_ID.get(weaponId);
        // These weapon kinds manage their own timing.
        if (weaponDef?.stats.effect?.kind === 'chainWhip'  ||
            weaponDef?.stats.effect?.kind === 'vortex'     ||
            weaponDef?.stats.effect?.kind === 'swordCombo' ||
            weaponDef?.stats.effect?.kind === 'sapphireShip' ||
            weaponDef?.stats.effect?.kind === 'amethystShip') continue;
        const tier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
        const cooldownMs = weaponDef
          ? getScaledWeaponCooldown(weaponDef.stats.cooldownMs, tier)
          : PLAYER_BASE_COOLDOWN_MS;
        const current = weaponAttackTimers.get(weaponId) ?? 0;
        const next = current - deltaMs;
        if (next <= 0) {
          weaponAttackTimers.set(weaponId, cooldownMs);
          withDamageSource(weaponId, () => performWeaponAttack(weaponId));
          removeDeadEnemies();
          checkWaveCompletion();
        } else {
          weaponAttackTimers.set(weaponId, next);
        }
      }
      // If no weapons equipped, use base attack with default cooldown
      if (getEffectiveEquippedIds().size === 0) {
        const current = weaponAttackTimers.get(BASE_ATTACK_TIMER_KEY) ?? 0;
        const next = current - deltaMs;
        if (next <= 0) {
          weaponAttackTimers.set(BASE_ATTACK_TIMER_KEY, PLAYER_BASE_COOLDOWN_MS);
          withDamageSource(null, () => performWeaponAttack(BASE_ATTACK_TIMER_KEY));
          removeDeadEnemies();
          checkWaveCompletion();
        } else {
          weaponAttackTimers.set(BASE_ATTACK_TIMER_KEY, next);
        }
      }
      updateShotVisuals(deltaMs);
      updateDamageNumbers(deltaMs);
      updateLuckyMotes(luckyMotes, luckyMotePopups, mote.x, mote.y, deltaMs, options.onLuckyMoteCollected ?? (() => {}));
      updateLuckyMotePopups(luckyMotePopups, deltaMs);

      if (playerStats.hp <= 0) triggerDeath();
      updateStatsPanelDom();
      fluid.step(deltaMs);
      draw(nowMs);
    },

    resize(cont: HTMLElement): void {
      doResize(cont);
      const half = RPG_MOTE_SIZE / 2;
      mote.x = Math.max(half, Math.min(widthPx  - half, mote.x));
      mote.y = Math.max(half, Math.min(heightPx - half, mote.y));
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
      syncSapphireShips();
      syncAmethystShips();
    },

    devJumpToWave(wave: number): void {
      // Treat as a full restart but jump directly to the requested wave.
      const savedRespawnWave = rpgSimState.respawnWave;
      rpgSimState.respawnWave = Math.max(0, wave - 1);
      doRestart();
      rpgSimState.respawnWave = savedRespawnWave;
      // Immediately advance past the inter-wave delay so the wave starts quickly.
      interWaveTimerMs = 0;
    },

    respawnNow(): void {
      doRestart();
      rpgPhase = 'restarting'; phaseTimerMs = 0; restartFadeAlpha = 0;
    },

    setLowGraphicsMode(enabled: boolean): void {
      isLowGraphicsMode = enabled;
      setEntityLowGraphics(enabled);
      setEnemyLowGraphics(enabled);
      setWeaponLowGraphics(enabled);
      setBossLowGraphics(enabled);
    },

    setEnemyIndicatorStyle(style: 'triangle' | 'outline' | 'off'): void {
      enemyIndicatorStyle = style;
    },

    startBossFight(bossId: number): void {
      startBossFight(bossId);
    },
  };
}
