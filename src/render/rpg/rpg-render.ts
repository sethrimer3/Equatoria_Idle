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
 *   - A DOM stats panel (HP / ATK / DEF / WAVE / BOOST / weapon) above the navigation bar
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
  getXpPerKill, getXpAtkBonus, getXpDefBonus, formatXp, getRpgSpeedMultiplier, getRpgUpgradeLevel,
  getScaledWeaponDamage, getScaledWeaponCooldown, getWaveStatScale,
} from '../../sim/rpg/rpg-state';
import { getWaveDefinition } from '../../data/rpg/wave-definitions';
import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import { TIER_BY_ID } from '../../data/tiers';
import { createRpgFluid } from './rpg-fluid';
import {
  RPG_TRAIL_CAPACITY, MAX_RPG_SPEED, RPG_VELOCITY_DAMPING, RPG_MOTE_SIZE, RPG_MOTE_COLOR, RPG_MOTE_GLOW,
  TRAIL_SPEED_THRESHOLD, GLOW_PULSE_SPEED, GLOW_MOVE_RAMP_UP, GLOW_MOVE_RAMP_DOWN,
  PLAYER_HP_INIT, PLAYER_ATK_INIT, PLAYER_DEF_INIT,
  JOYSTICK_OUTER_RADIUS, JOYSTICK_THUMB_RADIUS,
  LASER_ENEMY_SIZE, LASER_ENEMY_COLOR, LASER_ENEMY_GLOW,
  LASER_ATTACK_RADIUS, LASER_DECEL_DURATION_MS, LASER_DASH_SPEED, LASER_DASH_DISTANCE,
  LASER_COOLDOWN_MS, LASER_OVERSHOOT_DAMPING, LASER_OVERSHOOT_STOP, LASER_PATROL_SPEED_MAX, LASER_PATROL_DAMPING, LASER_PATROL_TURN_MS,
  PLAYER_HIT_RADIUS,
  LASER_DECEL_FACTOR, ATTACK_TRAIL_CURVE_VARIATION, PATROL_TURN_DELAY_MIN_FACTOR, PATROL_TURN_DELAY_RANGE_FACTOR,
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
  SAPPHIRE_SHIELD_RADIUS, SAPPHIRE_PATROL_SPEED,
  SAPPHIRE_PATROL_TURN_MS, SAPPHIRE_MISSILE_CD_MS, SAPPHIRE_MISSILE_JITTER,
  MISSILE_SIZE, MISSILE_SPEED, MISSILE_SEEK_STR, MISSILE_MAX_SPEED,
  MISSILE_TRAIL_CAP, MINIMUM_SHIELD_DAMAGE, SPEED_EPSILON,
  SAND_PROJ_SPEED, SAND_PROJ_SIZE, SAND_PROJ_LIFE_MS, SAND_PROJ_COLOR, CHAIN_NODES, CHAIN_MIN_RADIUS, CHAIN_MAX_RADIUS, CHAIN_NODE_COLOR, CHAIN_NODE_GLOW,
  CHAIN_LINE_COLOR, CHAIN_LASH_MS, CHAIN_RETRACT_MS, CHAIN_HIT_CD_MS,
  CHAIN_REST_LENGTH, CHAIN_SPRING_K, CHAIN_ANCHOR_K, CHAIN_RETRACT_ANCHOR_K,
  CHAIN_DAMPING, CHAIN_LASH_SPEED, CHAIN_MIN_INERTIA, CHAIN_MAX_INERTIA,
  LASER_BEAM_VISIBLE_MS, LASER_BEAM_COLOR, LASER_BEAM_GLOW, VORTEX_PULL_STRENGTH, VORTEX_DAMAGE_INTERVAL_MS, VORTEX_SPAWN_DIST,
  VORTEX_COLOR, VORTEX_GLOW, VORTEX_SPIN_RATE,
  SWORD_SWING_MS, SWORD_COLOR, SWORD_PRISMATIC_COLORS,
  SWORD_SHARD_COUNT, SWORD_SHARD_SIZE_BASE, SWORD_HINGE_SPRING_K, SWORD_HINGE_DAMPING,
  SWORD_SHARD_FOLLOW_BASE, SWORD_SHARD_FOLLOW_DECAY, SWORD_SHARD_SHAPES,
  SWORD_BEAM_DURATION_MS, SWORD_SWIPE_VISUAL_MS, SWORD_SWIPE_ARC_HALF_RAD,
  SWORD_FLUID_DRAG_STR, SWORD_FLUID_SWIPE_STR, SWORD_DEFAULT_COOLDOWN_MS,
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
  BOSS_SIZE_BASE, BOSS_HP_INIT, BOSS_ATK_INIT, BOSS_DEF_INIT, BOSS_SHIELD_INIT,
  BOSS_PROJ_LIFE_MS, BOSS_PROJ_SIZE,
  BOSS_PHASE2_HP_RATIO, BOSS_PHASE3_HP_RATIO, BOSS_PHASE_TRANSITION_MS,
  BOSS_ATTACK1_CD_BASE, BOSS_ATTACK1_CD_P1, BOSS_ATTACK1_CD_P2,
  BOSS_ATTACK2_CD_BASE, BOSS_ATTACK2_CD_P1, BOSS_ATTACK2_CD_P2,
  BOSS_PROJ_SPEED, BOSS_PROJ_SPEED_FAST,
  BOSS_GRAV_STRENGTH, BOSS_GRAV_RADIUS,
  BOSS_INVULN_ON_MS, BOSS_INVULN_OFF_MS, BOSS_INVULN_ON_P1, BOSS_INVULN_OFF_P1,
  BOSS_INVULN_ON_P2, BOSS_INVULN_OFF_P2,
  BOSS_COLORS, BOSS_GLOW_COLORS, BOSS_NAMES,
  FLUID_VEL_FRAME_TO_PX_S, FLUID_PLAYER_STRENGTH, FLUID_ENEMY_STRENGTH,
  FLUID_PROJECTILE_STRENGTH, FLUID_MISSILE_STRENGTH, FLUID_LASER_BEAM_STRENGTH,
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
  DANMAKU_BULLET_SPEED, DANMAKU_SAFE_ANGLE_WIDTH,
  DANMAKU_RING_COUNT, DANMAKU_TELEPORT_MARGIN,
  FRACTERYL_XP_MULT, EIGENSTEIN_XP_MULT
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
  drawBossProjectiles,
  drawSandProjectiles,
  drawPoisonBolts,
  drawLaserBeamEffect,
  drawTeleportParticles,
  drawDeathParticles, drawShotLines, drawHitEffects, drawDamageNumbers,
  drawAttackTrail,
  drawWeaponOrbitParticle, drawOrbitProjectile,
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
} from './rpg-types';
import {
  makeLaserEnemy, makeSapphireEnemy, makeSapphireMissile,
  makeEmeraldEnemy, makeAmberEnemy, makeVoidEnemy,
  makeQuartzEnemy, makeRubyEnemy,
  makeSunstoneEnemy, makeCitrineEnemy, makeIoliteEnemy,
  makeAmethystEnemy, makeDiamondEnemy,
  makeNullstoneEnemy,
  makeFracterylEnemy,
  makeEigensteinEnemy, makeDanmakuSafeZone,
} from './rpg-factories';
import {
  type RpgEnemyCtx,
  updateEmeraldEnemies,
  updateAmberEnemies, updateAmberShards,
  updateVoidEnemies,
  updateQuartzEnemies, updateQuartzSpikes,
  updateRubyEnemies, updateRubyBolts,
  updateSunstoneEnemies,
  updateCitrineEnemies, updateCitrineBolts,
  updateIoliteEnemies,
  updateAmethystEnemies, updateAmethystShards,
  updateDiamondEnemies, updateDiamondShards,
  updateNullstoneEnemies, updateVoidTendrils,
  updateFracterylEnemies,
  updateEigensteinEnemies, updateEigensteinBeams,
  updateTeleportParticles,
} from './rpg-enemy-updates';

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
}

export function createRpgRender(container: HTMLElement, rpgSimState: RpgSimState): RpgRender {

  const canvas = document.createElement('canvas');
  canvas.id = 'rpg-canvas';
  canvas.style.imageRendering = 'pixelated';
  canvas.style.touchAction = 'none';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d')!;
  let widthPx  = INTERNAL_WIDTH;
  let heightPx = INTERNAL_HEIGHT;

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

  // ── Aim direction tracker (updated each physics frame) ────────
  let playerAimAngle = -Math.PI / 2;  // default: upward

  let bossEnemy: BossEnemy | null = null;
  let danmakuSafeZone: DanmakuSafeZone | null = null;
  const bossProjectiles: BossProjectile[] = [];

  // ── Boss wave management ───────────────────────────────────────
  /** True while a boss wave is active (from spawn until defeat or death). */
  let isBossWaveActive = false;
  /** Saved set of weapon IDs before boss wave; restored on exit. */
  let bossPreWaveEquippedIds: Set<string> = new Set();
  /** Saved weapon tiers before boss wave (so temp tier-1 forced on diamond_bastion). */
  let bossPreWaveWeaponTiers: Map<string, number> = new Map();

  const teleportParticles: TeleportParticle[] = [];

  /** Safe zone position: bottom-middle of playing field. */
  function getSafeZoneX(): number { return widthPx / 2; }
  function getSafeZoneY(): number { return heightPx * 0.85; }

  const BOSS_BOTTOM_SAFE_ZONE_R = 22;
  const TELEPORT_PRISMATIC_COLORS = ['#e8f0fa', '#ffffff', '#b0c8ff', '#d6aaff', '#a0f0d0', '#fff4a0'];

  function isInBottomSafeZone(px: number, py: number): boolean {
    const dx = px - getSafeZoneX(), dy = py - getSafeZoneY();
    return dx * dx + dy * dy <= BOSS_BOTTOM_SAFE_ZONE_R * BOSS_BOTTOM_SAFE_ZONE_R;
  }

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
  }

  function enterBossWave(): void {
    if (isBossWaveActive) return;
    isBossWaveActive = true;
    // Save equipped weapon state
    bossPreWaveEquippedIds = new Set(rpgSimState.equippedWeaponIds);
    bossPreWaveWeaponTiers = new Map(rpgSimState.weaponTiersByWeaponId);
    // Temporarily equip only diamond_bastion at tier 1
    rpgSimState.equippedWeaponIds = new Set(['diamond_bastion']);
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
    // Restore pre-boss equipped weapons and tiers
    rpgSimState.equippedWeaponIds = bossPreWaveEquippedIds;
    for (const [id, tier] of bossPreWaveWeaponTiers) {
      rpgSimState.weaponTiersByWeaponId.set(id, tier);
    }
    bossPreWaveEquippedIds = new Set();
    bossPreWaveWeaponTiers = new Map();
    teleportParticles.length = 0;
    applyEquipmentStats();
  }

  const BOSS_GLYPH_LABEL = String.fromCodePoint(0x1469, 0x14B1, 0x1553, 0x140A); // ᑩᒱᕓᐊ — UCAS characters chosen for aesthetic angular appearance

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
    // Aggregate DEF from all equipped weapons.
    let totalDefBonus = 0;
    for (const weaponId of rpgSimState.equippedWeaponIds) {
      const weaponDef = WEAPON_BY_ID.get(weaponId);
      if (weaponDef) totalDefBonus += weaponDef.stats.defBonus;
    }
    playerStats.def = PLAYER_DEF_INIT + totalDefBonus + getXpDefBonus(rpgSimState.xp);
    // Player ATK is the base multiplier (not including per-weapon tier damage).
    playerStats.atk = PLAYER_ATK_INIT + getXpAtkBonus(rpgSimState.xp);

    // Rebuild weapon orbit particles (one per equipped weapon, evenly spaced).
    weaponOrbitParticles.length = 0;
    const equippedIds = Array.from(rpgSimState.equippedWeaponIds);
    const angleStep = equippedIds.length > 0 ? (2 * Math.PI) / equippedIds.length : 0;
    for (let i = 0; i < equippedIds.length; i++) {
      const p = buildWeaponOrbitParticle(equippedIds[i], i * angleStep);
      if (p) weaponOrbitParticles.push(p);
    }

    // Remove chain whip states for weapons that are no longer equipped.
    for (const weaponId of Array.from(chainWhipStates.keys())) {
      if (!rpgSimState.equippedWeaponIds.has(weaponId)) chainWhipStates.delete(weaponId);
    }
    // Remove vortex weapon states for unequipped weapons.
    for (const weaponId of Array.from(vortexWeaponStates.keys())) {
      if (!rpgSimState.equippedWeaponIds.has(weaponId)) vortexWeaponStates.delete(weaponId);
    }
    // Remove sword combo states for unequipped weapons.
    for (const weaponId of Array.from(swordComboStates.keys())) {
      if (!rpgSimState.equippedWeaponIds.has(weaponId)) swordComboStates.delete(weaponId);
    }
    // Remove attack timers for unequipped weapons.
    for (const weaponId of Array.from(weaponAttackTimers.keys())) {
      if (!rpgSimState.equippedWeaponIds.has(weaponId)) weaponAttackTimers.delete(weaponId);
    }

    orbitProjectile = buildOrbitProjectile();
  }

  // ── Player attack helpers ──────────────────────────────────────

  /** Deals damage from the player to one laser enemy, respecting DEF and a DEF pierce ratio.
   *  Returns the actual damage dealt (0 if DEF fully absorbed the hit). */
  function damageEnemy(enemy: LaserEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  /**
   * Deals damage to a sapphire enemy, handling the shield.
   * bypassShield = true means the ruby laser is firing — ignore the shield.
   * Returns { dmg, wasShield } where dmg is the effective damage applied.
   */
  function damageSapphireEnemy(
    enemy: SapphireEnemy,
    rawDamage: number,
    defPierceRatio: number,
    bypassShield: boolean,
  ): number {
    if (!bypassShield && enemy.shieldHp > 0) {
      // Shields always absorb at least MINIMUM_SHIELD_DAMAGE, making chip damage possible.
      const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
      enemy.shieldHp = Math.max(0, enemy.shieldHp - dmg);
      return dmg;
    }
    // Hit the enemy body.
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  /** Deals damage to a missile (no DEF, no shield). Returns actual damage dealt. */
  function damageMissile(missile: SapphireMissile, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    missile.hp = Math.max(0, missile.hp - dmg);
    return dmg;
  }

  /** Deals damage to an emerald enemy. Returns actual damage dealt. */
  function damageEmeraldEnemy(enemy: EmeraldEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  /** Deals damage to an amber enemy. Returns actual damage dealt. */
  function damageAmberEnemy(enemy: AmberEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  /** Deals damage to an amber shard (no DEF). Returns actual damage dealt. */
  function damageAmberShard(shard: AmberShard, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    shard.hp = Math.max(0, shard.hp - dmg);
    return dmg;
  }

  /** Deals damage to a void enemy (high DEF). Returns actual damage dealt. */
  function damageVoidEnemy(enemy: VoidEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  function damageQuartzEnemy(enemy: QuartzEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  function damageQuartzSpike(spike: QuartzSpike, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    spike.hp = Math.max(0, spike.hp - dmg);
    return dmg;
  }

  function damageRubyEnemy(enemy: RubyEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  function damageRubyBolt(bolt: RubyBolt, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    bolt.hp = Math.max(0, bolt.hp - dmg);
    return dmg;
  }

  function damageSunstoneEnemy(enemy: SunstoneEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  function damageCitrineEnemy(enemy: CitrineEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  function damageCitrineBolt(bolt: CitrineBolt, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    bolt.hp = Math.max(0, bolt.hp - dmg);
    return dmg;
  }

  function damageIoliteEnemy(enemy: IoliteEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  function damageAmethystEnemy(enemy: AmethystEnemy, rawDamage: number, defPierceRatio: number, bypassShield: boolean): number {
    if (!bypassShield && enemy.shieldHp > 0) {
      const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
      enemy.shieldHp = Math.max(0, enemy.shieldHp - dmg);
      return dmg;
    }
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  function damageAmethystShard(shard: AmethystShard, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    shard.hp = Math.max(0, shard.hp - dmg);
    return dmg;
  }

  function damageDiamondEnemy(enemy: DiamondEnemy, rawDamage: number, defPierceRatio: number): number {
    if (enemy.phaseInvuln) return 0;
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  function damageDiamondShard(shard: DiamondShard, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    shard.hp = Math.max(0, shard.hp - dmg);
    return dmg;
  }

  function damageNullstoneEnemy(enemy: NullstoneEnemy, rawDamage: number, defPierceRatio: number): number {
    if (enemy.isAbsorbing) return 0;
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  function damageVoidTendril(tendril: VoidTendril, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    tendril.hp = Math.max(0, tendril.hp - dmg);
    return dmg;
  }

  function damageFracterylEnemy(enemy: FracterylEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  function damageFracterylShard(shard: FracterylShard, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    shard.hp = Math.max(0, shard.hp - dmg);
    return dmg;
  }

  function damageEigensteinEnemy(enemy: EigensteinEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
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
      return shieldDmg;
    }
    const effectiveDef = boss.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    boss.hp = Math.max(0, boss.hp - dmg);
    if (dmg > 0 && isBossWaveActive) {
      // Each successful hit teleports player to safe zone and ups difficulty
      boss.danmakuLevel += 1;
      teleportPlayerToSafeZone();
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

  /**
   * Returns the radius of chain node at index i.
   * i=0 (closest to player) is smallest; i=CHAIN_NODES-1 (tip) is largest.
   */
  function chainNodeRadius(i: number): number {
    return CHAIN_MIN_RADIUS + (CHAIN_MAX_RADIUS - CHAIN_MIN_RADIUS) * i / (CHAIN_NODES - 1);
  }

  /**
   * Returns 1/inertia for node at index i.
   * Higher inverseMass = more responsive to forces.
   * i=0 (closest to player) has lowest inertia → most responsive (highest inverseMass).
   * i=CHAIN_NODES-1 (tip) has highest inertia → least responsive (lowest inverseMass).
   */
  function chainNodeInvMass(i: number): number {
    const inertia = CHAIN_MIN_INERTIA + (CHAIN_MAX_INERTIA - CHAIN_MIN_INERTIA) * i / (CHAIN_NODES - 1);
    return 1.0 / inertia;
  }

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

  function drawChainWhip(ws: ChainWhipState): void {
    if (ws.phase === 'idle' && ws.phaseMs < ws.cooldownMs * 0.1) return;
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.lineCap   = 'round';
    ctx.lineJoin  = 'round';
    // Draw chain links (lines between nodes)
    ctx.strokeStyle = CHAIN_LINE_COLOR;
    ctx.shadowBlur  = 4; ctx.shadowColor = CHAIN_NODE_GLOW;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(ws.nodesX[0], ws.nodesY[0]);
    for (let i = 1; i < CHAIN_NODES; i++) ctx.lineTo(ws.nodesX[i], ws.nodesY[i]);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Draw node circles with graduated sizes
    for (let i = 0; i < CHAIN_NODES; i++) {
      const r = chainNodeRadius(i);
      ctx.globalAlpha = 0.9;
      ctx.shadowBlur  = r * 3; ctx.shadowColor = CHAIN_NODE_GLOW;
      ctx.fillStyle   = CHAIN_NODE_GLOW;
      ctx.beginPath();
      ctx.arc(ws.nodesX[i], ws.nodesY[i], r * 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle  = CHAIN_NODE_COLOR;
      ctx.beginPath();
      ctx.arc(ws.nodesX[i], ws.nodesY[i], r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ── Nullstone vortex system ────────────────────────────────────

  function getVortexTierRadius(tier: number): number  { return 40 + (tier - 1) * 10; }
  function getVortexTierDurationMs(tier: number): number { return 3000 + (tier - 1) * 200; }
  function getVortexCount(tier: number): number        { return tier >= 7 ? 3 : tier >= 4 ? 2 : 1; }

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

  function drawVortexes(): void {
    if (activeVortexes.length === 0) return;
    ctx.save();
    for (const v of activeVortexes) {
      const alpha = v.durationMs / v.maxDurationMs;
      const r = v.radiusPx;
      // Outer ring glow
      ctx.globalAlpha = alpha * 0.6;
      ctx.shadowBlur = r * 0.5; ctx.shadowColor = VORTEX_GLOW;
      ctx.strokeStyle = VORTEX_COLOR; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(v.x, v.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
      // Rotating concentric arcs showing spin
      const arcCount = 5;
      for (let j = 0; j < arcCount; j++) {
        const baseAngle = v.spinAngle + (j / arcCount) * Math.PI * 2;
        const scale     = 0.25 + j * 0.16;
        ctx.globalAlpha = alpha * 0.4 * (1 - j / arcCount);
        ctx.beginPath();
        ctx.arc(v.x, v.y, r * scale, baseAngle, baseAngle + Math.PI * 0.8);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.lineWidth = 1;
    ctx.restore();
  }

  // ── Diamond sword system ───────────────────────────────────────

  function getSwordLength(tier: number): number { return 30 + (tier - 1) * 8; }

  /** Returns an array of evenly-spaced distances from handle to tip for the shards. */
  function getShardDistances(swordLength: number): number[] {
    const handleDist = 5;
    const dists: number[] = [];
    for (let i = 0; i < SWORD_SHARD_COUNT; i++) {
      dists.push(handleDist + (swordLength - handleDist) * (i / (SWORD_SHARD_COUNT - 1)));
    }
    return dists;
  }

  /** Wrap angle delta to [-π, π]. */
  function wrapAngleDiff(a: number): number {
    while (a >  Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function buildSwordCombo(weaponId: string): SwordComboState {
    const weaponDef  = WEAPON_BY_ID.get(weaponId);
    const tier       = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const cooldownMs = getScaledWeaponCooldown(weaponDef?.stats.cooldownMs ?? SWORD_DEFAULT_COOLDOWN_MS, tier);
    const initAngle  = playerAimAngle;
    return {
      phase: 'idle', phaseMs: 0, cooldownMs,
      hitThisSwing: new Set(),
      swordAngle: initAngle, swordAngularVel: 0,
      shardAngles: Array.from({ length: SWORD_SHARD_COUNT }, () => initAngle),
      swipeArcStart: 0, swipeArcEnd: 0,
      swipeEffects: [], beamEffects: [],
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

    // ── 1. Update hinge physics: angular velocity updated every frame;
    //       angle integration is skipped during the swing animation (which drives angle directly). ──
    const angleDiff = wrapAngleDiff(playerAimAngle - state.swordAngle);
    state.swordAngularVel += angleDiff * SWORD_HINGE_SPRING_K;
    state.swordAngularVel *= SWORD_HINGE_DAMPING;
    // During swing, override with the animated arc angle.
    if (state.phase !== 'swing') {
      state.swordAngle += state.swordAngularVel;
    }

    // ── 2. Update shard chain (each shard lags the previous) ──
    const followBase = SWORD_SHARD_FOLLOW_BASE;
    const followDecay = SWORD_SHARD_FOLLOW_DECAY;
    if (state.phase !== 'swing') {
      // Shard 0 follows the main hinge angle.
      const d0 = wrapAngleDiff(state.swordAngle - state.shardAngles[0]);
      state.shardAngles[0] += d0 * followBase;
      for (let i = 1; i < SWORD_SHARD_COUNT; i++) {
        const followRate = Math.max(0.08, followBase - i * followDecay);
        const di = wrapAngleDiff(state.shardAngles[i - 1] - state.shardAngles[i]);
        state.shardAngles[i] += di * followRate;
      }
    } else {
      // During swing: drive the blade through the arc; shards follow with their chain lag.
      const t = Math.min(1, state.phaseMs / SWORD_SWING_MS);
      const swingAngle = state.swipeArcStart + wrapAngleDiff(state.swipeArcEnd - state.swipeArcStart) * t;
      state.swordAngle = swingAngle;
      state.shardAngles[0] = swingAngle;
      for (let i = 1; i < SWORD_SHARD_COUNT; i++) {
        const followRate = Math.max(0.08, followBase - i * followDecay);
        const di = wrapAngleDiff(state.shardAngles[i - 1] - state.shardAngles[i]);
        state.shardAngles[i] += di * followRate;
      }
    }

    // ── 3. Add fluid forces from sword drag (each shard per frame) ──
    if (state.phase !== 'cooldown') {
      const dists = getShardDistances(swordLength);
      const colIdx = Math.floor(nowMs / 80) % SWORD_PRISMATIC_COLORS.length;
      const hexColor = SWORD_PRISMATIC_COLORS[colIdx];
      const pr = parseInt(hexColor.slice(1, 3), 16);
      const pg = parseInt(hexColor.slice(3, 5), 16);
      const pb = parseInt(hexColor.slice(5, 7), 16);
      for (let i = 0; i < SWORD_SHARD_COUNT; i++) {
        const sx = mote.x + Math.cos(state.shardAngles[i]) * dists[i];
        const sy = mote.y + Math.sin(state.shardAngles[i]) * dists[i];
        // Push perpendicular to blade direction.
        const perpX = -Math.sin(state.shardAngles[i]);
        const perpY =  Math.cos(state.shardAngles[i]);
        fluid.addForce({
          x: sx, y: sy,
          vx: perpX * SWORD_FLUID_DRAG_STR * FLUID_VEL_FRAME_TO_PX_S,
          vy: perpY * SWORD_FLUID_DRAG_STR * FLUID_VEL_FRAME_TO_PX_S,
          r: pr, g: pg, b: pb,
          strength: FLUID_PROJECTILE_STRENGTH * 0.5,
        });
      }
    }

    // ── 4. Phase state machine ──
    state.phaseMs += deltaMs;

    if (state.phase === 'idle') {
      if (state.phaseMs >= state.cooldownMs) {
        // Find closest enemy within sword range.
        const rangeSq = swordLength * swordLength;
        let bestDist = Infinity;
        let bestAngle = playerAimAngle;
        const checkEnemy = (e: { x: number; y: number }) => {
          const dx = e.x - mote.x, dy = e.y - mote.y;
          const d = dx * dx + dy * dy;
          if (d < bestDist && d <= rangeSq) { bestDist = d; bestAngle = Math.atan2(dy, dx); }
        };
        for (const e of enemies)          checkEnemy(e);
        for (const e of sapphireEnemies)  checkEnemy(e);
        for (const e of emeraldEnemies)   checkEnemy(e);
        for (const e of amberEnemies)     checkEnemy(e);
        for (const e of voidEnemies)      checkEnemy(e);
        for (const e of quartzEnemies)    checkEnemy(e);
        for (const e of rubyEnemies)      checkEnemy(e);
        for (const e of sunstoneEnemies)  checkEnemy(e);
        for (const e of citrineEnemies)   checkEnemy(e);
        for (const e of ioliteEnemies)    checkEnemy(e);
        for (const e of amethystEnemies)  checkEnemy(e);
        for (const e of diamondEnemies)   checkEnemy(e);
        for (const e of nullstoneEnemies) checkEnemy(e);
        if (bossEnemy) checkEnemy(bossEnemy);

        if (bestDist <= rangeSq) {
          // Enemy in range — trigger a swipe centered on that enemy.
          const half = SWORD_SWIPE_ARC_HALF_RAD;
          state.swipeArcStart = bestAngle - half;
          state.swipeArcEnd   = bestAngle + half;
          state.phase = 'swing'; state.phaseMs = 0; state.hitThisSwing.clear();
          // Spawn disconnected swipe visual.
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
      // Hit detection during the swing.
      swordHitInArc(state, swordLength, rawDamage, state.swipeArcStart, state.swipeArcEnd, weaponId);

      // Add stronger crescent fluid forces during the swipe.
      const numSamples = 6;
      const colIdx2 = Math.floor(nowMs / 60) % SWORD_PRISMATIC_COLORS.length;
      const hexC2 = SWORD_PRISMATIC_COLORS[colIdx2];
      const sr = parseInt(hexC2.slice(1, 3), 16);
      const sg = parseInt(hexC2.slice(3, 5), 16);
      const sb = parseInt(hexC2.slice(5, 7), 16);
      const t2 = Math.min(1, state.phaseMs / SWORD_SWING_MS);
      const arcSpan = wrapAngleDiff(state.swipeArcEnd - state.swipeArcStart);
      for (let s = 0; s < numSamples; s++) {
        const frac = s / (numSamples - 1);
        const angle = state.swipeArcStart + arcSpan * frac;
        // Use the tip position for maximum reach.
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

  /** Assign a deterministic shape and size to each shard index. */
  function getShardStyle(index: number): { shapeIdx: number; radius: number } {
    // Vary size slightly along the blade: tip shards slightly larger.
    const radius = SWORD_SHARD_SIZE_BASE * (0.85 + 0.3 * (index / (SWORD_SHARD_COUNT - 1)));
    const shapeIdx = index % SWORD_SHARD_SHAPES.length;
    return { shapeIdx, radius };
  }

  function drawSwordCombos(): void {
    for (const [weaponId, state] of swordComboStates) {
      const tier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
      const swordLength = getSwordLength(tier);
      const dists = getShardDistances(swordLength);
      const nowMs = Date.now();

      ctx.save();

      // ── A. Draw prismatic polygon shards ──────────────────────
      for (let i = 0; i < SWORD_SHARD_COUNT; i++) {
        const sx = mote.x + Math.cos(state.shardAngles[i]) * dists[i];
        const sy = mote.y + Math.sin(state.shardAngles[i]) * dists[i];
        const colorIdx = (i + Math.floor(nowMs / 80)) % SWORD_PRISMATIC_COLORS.length;
        const color = SWORD_PRISMATIC_COLORS[colorIdx];
        const { shapeIdx, radius } = getShardStyle(i);
        const verts = SWORD_SHARD_SHAPES[shapeIdx];
        // Rotate the shard polygon to align with the blade angle.
        const cosA = Math.cos(state.shardAngles[i]);
        const sinA = Math.sin(state.shardAngles[i]);

        ctx.globalAlpha = state.phase === 'swing' ? 1.0 : 0.85;
        ctx.fillStyle = color;
        ctx.shadowBlur = 5 + (state.phase === 'swing' ? 4 : 0);
        ctx.shadowColor = color;
        ctx.beginPath();
        for (let v = 0; v < verts.length; v++) {
          const [cu, su] = verts[v];
          // Rotate local vertex by blade angle.
          const vx = sx + (cu * cosA - su * sinA) * radius;
          const vy = sy + (cu * sinA + su * cosA) * radius;
          if (v === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        // White core highlight for each shard.
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(sx, sy, radius * 0.3, 0, Math.PI * 2); ctx.fill();
      }

      // ── B. Draw disconnected swipe-arc visuals ─────────────────
      for (const fx of state.swipeEffects) {
        const elapsed = fx.maxTimerMs - fx.timerMs;
        const lifeRatio = elapsed / fx.maxTimerMs;           // 0→1 as effect ages
        const alpha = (1 - lifeRatio) * 0.85;
        const arcSpan = wrapAngleDiff(fx.arcEnd - fx.arcStart);
        const numArcs = SWORD_PRISMATIC_COLORS.length;
        ctx.lineWidth = 2;
        ctx.globalAlpha = alpha;
        for (let ci = 0; ci < numArcs; ci++) {
          const angOffset = (ci / numArcs) * arcSpan;
          const segStart = fx.arcStart + angOffset;
          const segEnd   = segStart + arcSpan / numArcs;
          ctx.strokeStyle = SWORD_PRISMATIC_COLORS[ci];
          ctx.shadowBlur  = 8; ctx.shadowColor = SWORD_PRISMATIC_COLORS[ci];
          ctx.beginPath();
          ctx.arc(fx.x, fx.y, fx.swordLength, segStart, segEnd);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        ctx.lineWidth = 1;
      }

      // ── C. Draw prismatic beam effects ─────────────────────────
      for (const beam of state.beamEffects) {
        const prog = beam.progress;
        if (prog >= 2) continue;

        let drawTailX: number, drawTailY: number;
        let drawTipX:  number, drawTipY:  number;
        let alpha: number;

        if (prog < 1) {
          // Appearing: beam draws from tail toward tip.
          drawTailX = beam.tailX;
          drawTailY = beam.tailY;
          drawTipX  = beam.tailX + (beam.tipX - beam.tailX) * prog;
          drawTipY  = beam.tailY + (beam.tipY - beam.tailY) * prog;
          alpha = 0.95;
        } else {
          // Fading: beam erases from tail toward tip.
          const fadeT = prog - 1;
          drawTailX = beam.tailX + (beam.tipX - beam.tailX) * fadeT;
          drawTailY = beam.tailY + (beam.tipY - beam.tailY) * fadeT;
          drawTipX  = beam.tipX;
          drawTipY  = beam.tipY;
          alpha = 1 - fadeT * 0.9;
        }

        const dx = drawTipX - drawTailX, dy = drawTipY - drawTailY;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.1) continue;
        const nx = dx / len, ny = dy / len; // unit along beam
        const px = -ny, py = nx;            // perpendicular

        // Draw as a thin diamond (rhombus): 4 vertices.
        const halfWidth = 1.0; // px half-width at centre
        const cx = (drawTailX + drawTipX) * 0.5;
        const cy = (drawTailY + drawTipY) * 0.5;

        const colorIdx3 = Math.floor(nowMs / 50) % SWORD_PRISMATIC_COLORS.length;
        const bColor = SWORD_PRISMATIC_COLORS[colorIdx3];

        ctx.globalAlpha = alpha;
        ctx.fillStyle = bColor;
        ctx.shadowBlur = 10; ctx.shadowColor = bColor;
        ctx.beginPath();
        ctx.moveTo(drawTailX, drawTailY);
        ctx.lineTo(cx + px * halfWidth, cy + py * halfWidth);
        ctx.lineTo(drawTipX, drawTipY);
        ctx.lineTo(cx - px * halfWidth, cy - py * halfWidth);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        // Bright white core.
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(drawTailX, drawTailY);
        ctx.lineTo(cx + px * halfWidth * 0.4, cy + py * halfWidth * 0.4);
        ctx.lineTo(drawTipX, drawTipY);
        ctx.lineTo(cx - px * halfWidth * 0.4, cy - py * halfWidth * 0.4);
        ctx.closePath();
        ctx.fill();
      }

      ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.lineWidth = 1;
      ctx.restore();
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


  // ── Sapphire enemy system ──────────────────────────────────────

  function spawnMissileFromEnemy(enemy: SapphireEnemy): void {
    const dx = mote.x - enemy.x, dy = mote.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dirX = dist > 0.01 ? dx / dist : 0;
    const dirY = dist > 0.01 ? dy / dist : 1;
    sapphireMissiles.push(makeSapphireMissile(
      enemy.x, enemy.y,
      dirX * MISSILE_SPEED, dirY * MISSILE_SPEED,
    ));
    // Inject a gun-fire impulse in the launch direction.
    fluid.addForce({
      x: enemy.x, y: enemy.y,
      vx: dirX * FLUID_VEL_FRAME_TO_PX_S * 2.0,
      vy: dirY * FLUID_VEL_FRAME_TO_PX_S * 2.0,
      r: FLUID_MISSILE_R, g: FLUID_MISSILE_G, b: FLUID_MISSILE_B,
      strength: FLUID_PROJECTILE_STRENGTH * 1.5,
    });
  }

  function updateSapphireEnemies(deltaMs: number, _nowMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (const enemy of sapphireEnemies) {
      // Patrol
      enemy.patrolTimerMs -= deltaMs;
      if (enemy.patrolTimerMs <= 0) {
        const angle = Math.random() * Math.PI * 2;
        enemy.vx = Math.cos(angle) * SAPPHIRE_PATROL_SPEED;
        enemy.vy = Math.sin(angle) * SAPPHIRE_PATROL_SPEED;
        enemy.patrolTimerMs = SAPPHIRE_PATROL_TURN_MS * (0.5 + Math.random() * 0.8);
      }
      enemy.vx *= Math.pow(LASER_PATROL_DAMPING, dt);
      enemy.vy *= Math.pow(LASER_PATROL_DAMPING, dt);
      enemy.x  += enemy.vx * dt; enemy.y += enemy.vy * dt;
      // Clamp to bounds
      const half = SAPPHIRE_ENEMY_SIZE / 2;
      if (enemy.x < half)             { enemy.x = half;             enemy.vx =  Math.abs(enemy.vx) * 0.5; }
      if (enemy.x > widthPx  - half)  { enemy.x = widthPx  - half;  enemy.vx = -Math.abs(enemy.vx) * 0.5; }
      if (enemy.y < half)             { enemy.y = half;             enemy.vy =  Math.abs(enemy.vy) * 0.5; }
      if (enemy.y > heightPx - half)  { enemy.y = heightPx - half;  enemy.vy = -Math.abs(enemy.vy) * 0.5; }

      // Inject sapphire-enemy movement into fluid.
      const sespd = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
      if (sespd > 0.04) {
        fluid.addForce({
          x: enemy.x, y: enemy.y,
          vx: enemy.vx * FLUID_VEL_FRAME_TO_PX_S,
          vy: enemy.vy * FLUID_VEL_FRAME_TO_PX_S,
          r: FLUID_SAPPH_R, g: FLUID_SAPPH_G, b: FLUID_SAPPH_B,
          strength: FLUID_ENEMY_STRENGTH,
        });
      }

      // Missile firing
      enemy.missileTimerMs -= deltaMs;
      if (enemy.missileTimerMs <= 0) {
        spawnMissileFromEnemy(enemy);
        enemy.missileTimerMs = SAPPHIRE_MISSILE_CD_MS + (Math.random() - 0.5) * SAPPHIRE_MISSILE_JITTER;
      }
    }
  }

  function updateSapphireMissiles(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (let i = sapphireMissiles.length - 1; i >= 0; i--) {
      const m = sapphireMissiles[i];
      if (m.hp <= 0) { sapphireMissiles.splice(i, 1); continue; }

      // Heat-seeking toward player
      const dx = mote.x - m.x, dy = mote.y - m.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.01) {
        const seekDirX = dx / dist, seekDirY = dy / dist;
        m.vx += seekDirX * MISSILE_SEEK_STR;
        m.vy += seekDirY * MISSILE_SEEK_STR;
      }
      // Cap speed
      const speed = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
      if (speed > MISSILE_MAX_SPEED) {
        m.vx = (m.vx / speed) * MISSILE_MAX_SPEED;
        m.vy = (m.vy / speed) * MISSILE_MAX_SPEED;
      }

      m.x += m.vx * dt; m.y += m.vy * dt;

      // Inject missile motion into fluid every frame — produces the curved
      // heat-seeker trail required by the acceptance criteria.
      fluid.addForce({
        x: m.x, y: m.y,
        vx: m.vx * FLUID_VEL_FRAME_TO_PX_S,
        vy: m.vy * FLUID_VEL_FRAME_TO_PX_S,
        r: FLUID_MISSILE_R, g: FLUID_MISSILE_G, b: FLUID_MISSILE_B,
        strength: FLUID_MISSILE_STRENGTH,
      });

      // Record trail
      m.trailX[m.trailHead] = m.x; m.trailY[m.trailHead] = m.y;
      m.trailHead = (m.trailHead + 1) % MISSILE_TRAIL_CAP;
      if (m.trailCount < MISSILE_TRAIL_CAP) m.trailCount++;

      // Hit player
      if (!m.hasHitPlayer) {
        const pdx = mote.x - m.x, pdy = mote.y - m.y;
        if (pdx * pdx + pdy * pdy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
          m.hasHitPlayer = true;
          if (playerIFramesMs <= 0) {
            const rawDmg = m.atk - playerStats.def;
            const dmg = Math.max(0, rawDmg);
            if (dmg <= 0) {
              spawnDamageNumber(mote.x, mote.y, 0, -1, 'BLOCKED', 0.25, '#74c0fc');
            } else {
              playerStats.hp = Math.max(0, playerStats.hp - dmg);
              const ratio = Math.min(1, dmg / playerStats.maxHp);
              const dirX = m.vx / (speed + SPEED_EPSILON), dirY = m.vy / (speed + SPEED_EPSILON);
              mote.vx += dirX * PLAYER_KNOCKBACK_MAX * ratio;
              mote.vy += dirY * PLAYER_KNOCKBACK_MAX * ratio;
              playerIFramesMs = PLAYER_IFRAME_MIN_MS + ratio * PLAYER_IFRAME_MAX_ADD_MS;
              spawnDamageNumber(mote.x, mote.y, dirX, dirY, String(Math.round(dmg)), ratio, '#ff6666');
            }
          }
          sapphireMissiles.splice(i, 1);
        }
      }

      // Despawn if far out of bounds
      const margin = 20;
      if (m.x < -margin || m.x > widthPx + margin || m.y < -margin || m.y > heightPx + margin) {
        sapphireMissiles.splice(i, 1);
      }
    }
  }



  /**
   * Fires the specified weapon at the nearest enemy within range.
   * Handles all WeaponEffect variants. Call removeDeadEnemies() after this.
   */
  function performWeaponAttack(weaponId: string): void {
    const totalTargets = enemies.length + sapphireEnemies.length + sapphireMissiles.length
      + emeraldEnemies.length + amberEnemies.length + amberShards.length + voidEnemies.length
      + quartzEnemies.length + quartzSpikes.length + rubyEnemies.length + rubyBolts.length
      + sunstoneEnemies.length + citrineEnemies.length + citrineBolts.length
      + ioliteEnemies.length + amethystEnemies.length + amethystShards.length
      + diamondEnemies.length + diamondShards.length + nullstoneEnemies.length + voidTendrils.length
      + fracterylEnemies.length + fracterylShards.length + eigensteinEnemies.length
      + (bossEnemy ? 1 : 0);
    if (totalTargets === 0) return;
    const weaponDef  = WEAPON_BY_ID.get(weaponId);
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
        eigensteinEnemies.splice(i, 1);
      }
    }
    // Boss defeat
    if (bossEnemy && bossEnemy.hp <= 0) {
      const bossXp = Math.ceil(getXpPerKill(currentWave) * getWaveStatScale(currentWave) * 5.0);
      rpgSimState.xp += bossXp;
      exitBossWave();
      const glowC = BOSS_GLOW_COLORS[Math.min(bossEnemy.bossId, BOSS_GLOW_COLORS.length - 1)];
      spawnDamageNumber(bossEnemy.x, bossEnemy.y, 0, -1, `BOSS! +${formatXp(bossXp)} XP`, 1.0, glowC);
      fluid.addExplosion(bossEnemy.x, bossEnemy.y, FLUID_EXPLOSION_STRENGTH * 2.5, FLUID_VOID_R, FLUID_VOID_G, FLUID_VOID_B);
      bossEnemy = null;
      bossProjectiles.length = 0;
    }
    if (totalXpFromKills > 0) {
      rpgSimState.xp += totalXpFromKills;
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

  function makeStatWidget(label: string, extraClass: string): { root: HTMLElement; labelEl: HTMLSpanElement; valueEl: HTMLSpanElement } {
    const root = document.createElement('div');
    root.className = 'rpg-stat';
    const labelEl = document.createElement('span');
    labelEl.className = 'rpg-stat-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'rpg-stat-value' + (extraClass ? (' ' + extraClass) : '');
    root.appendChild(labelEl);
    root.appendChild(valueEl);
    statsPanel.appendChild(root);
    return { root, labelEl, valueEl };
  }

  const hpWidget      = makeStatWidget('HP',     'rpg-stat-value--hp');
  const atkWidget     = makeStatWidget('ATK',    '');
  const defWidget     = makeStatWidget('DEF',    '');
  const waveWidget    = makeStatWidget('WAVE',   'rpg-stat-value--wave');
  const boostWidget   = makeStatWidget('BOOST',  'rpg-stat-value--boost');
  const xpWidget      = makeStatWidget('XP',     'rpg-stat-value--xp');
  const weaponWidget  = makeStatWidget('WEAPON', 'rpg-stat-value--weapon');

  function updateStatsPanelDom(): void {
    hpWidget.valueEl.textContent   = Math.max(0, Math.ceil(playerStats.hp)) + ' / ' + playerStats.maxHp;
    atkWidget.valueEl.textContent  = String(playerStats.atk);
    defWidget.valueEl.textContent  = String(playerStats.def);
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
    xpWidget.valueEl.textContent   = formatXp(rpgSimState.xp);

    const equippedIds = Array.from(rpgSimState.equippedWeaponIds);
    if (equippedIds.length > 0) {
      const labels = equippedIds.map(id => {
        const wd = WEAPON_BY_ID.get(id);
        const tier = rpgSimState.weaponTiersByWeaponId.get(id) ?? 1;
        return wd ? `${wd.name} T${tier}` : id;
      });
      weaponWidget.valueEl.textContent = labels.join(', ');
      const firstDef = WEAPON_BY_ID.get(equippedIds[0]);
      const tierDef = firstDef ? TIER_BY_ID.get(firstDef.costTierId) : undefined;
      weaponWidget.valueEl.style.color = tierDef?.color ?? '#fff172';
    } else {
      weaponWidget.valueEl.textContent = 'None';
      weaponWidget.valueEl.style.color = '';
    }
  }
  updateStatsPanelDom();

  function toCanvasCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width  > 0 ? widthPx  / rect.width  : 1;
    const scaleY = rect.height > 0 ? heightPx / rect.height : 1;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    canvas.setPointerCapture(e.pointerId);
    const pos = toCanvasCoords(e.clientX, e.clientY);
    joystick.isActive = true; joystick.pointerId = e.pointerId;
    joystick.baseX = pos.x; joystick.baseY = pos.y;
    joystick.thumbX = pos.x; joystick.thumbY = pos.y;
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

  function endJoystick(pointerId: number): void {
    if (pointerId !== joystick.pointerId) return;
    joystick.isActive = false; joystick.pointerId = -1;
  }
  canvas.addEventListener('pointerup',     (e: PointerEvent) => endJoystick(e.pointerId));
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
      bossEnemy = makeBossEnemy(Math.ceil(wn / 100), wn);
      enterBossWave();
    }
  }

  function startNextWave(): void {
    currentWave += 1;
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

  function updateEnemyIdle(enemy: LaserEnemy, dt: number, deltaMs: number): void {
    enemy.patrolTimerMs -= deltaMs;
    if (enemy.patrolTimerMs <= 0) {
      const angle = Math.random() * Math.PI * 2;
      enemy.vx = Math.cos(angle) * LASER_PATROL_SPEED_MAX;
      enemy.vy = Math.sin(angle) * LASER_PATROL_SPEED_MAX;
      enemy.patrolTimerMs = LASER_PATROL_TURN_MS * (PATROL_TURN_DELAY_MIN_FACTOR + Math.random() * PATROL_TURN_DELAY_RANGE_FACTOR);
    }
    const dampFactor = Math.pow(LASER_PATROL_DAMPING, dt);
    enemy.vx *= dampFactor; enemy.vy *= dampFactor;
    enemy.x  += enemy.vx * dt; enemy.y += enemy.vy * dt;
    clampEnemyToBounds(enemy);
    const dx = mote.x - enemy.x; const dy = mote.y - enemy.y;
    if (dx * dx + dy * dy < LASER_ATTACK_RADIUS * LASER_ATTACK_RADIUS) {
      enemy.lockedTargetX = mote.x; enemy.lockedTargetY = mote.y;
      enemy.phase = 'decelerate'; enemy.phaseElapsedMs = 0;
    }
  }

  function updateEnemyDecelerate(enemy: LaserEnemy, dt: number, deltaMs: number): void {
    enemy.phaseElapsedMs += deltaMs;
    const dampFactor = Math.pow(LASER_DECEL_FACTOR, dt);
    enemy.vx *= dampFactor; enemy.vy *= dampFactor;
    enemy.x  += enemy.vx * dt; enemy.y += enemy.vy * dt;
    clampEnemyToBounds(enemy);
    if (enemy.phaseElapsedMs >= LASER_DECEL_DURATION_MS) {
      enemy.vx = 0; enemy.vy = 0;
      const dx = enemy.lockedTargetX - enemy.x; const dy = enemy.lockedTargetY - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.1) { enemy.dashDirX = dx / dist; enemy.dashDirY = dy / dist; }
      else { const a = Math.random() * Math.PI * 2; enemy.dashDirX = Math.cos(a); enemy.dashDirY = Math.sin(a); }
      enemy.dashTraveled = 0; enemy.hasHitPlayer = false;
      enemy.phase = 'dash'; enemy.phaseElapsedMs = 0;
      enemy.attackTrail = {
        active: true,
        startX: enemy.x, startY: enemy.y,
        endX: enemy.x + enemy.dashDirX * LASER_DASH_DISTANCE,
        endY: enemy.y + enemy.dashDirY * LASER_DASH_DISTANCE,
        controlAngle: (Math.random() - 0.5) * ATTACK_TRAIL_CURVE_VARIATION,
        trailStartMs: performance.now(), trailEndMs: Infinity,
      };
    }
  }

  function updateEnemyDash(enemy: LaserEnemy, dt: number, nowMs: number): void {
    const stepDist = LASER_DASH_SPEED * dt;
    enemy.x += enemy.dashDirX * stepDist; enemy.y += enemy.dashDirY * stepDist;
    enemy.dashTraveled += stepDist;
    clampEnemyToBounds(enemy);
    if (!enemy.hasHitPlayer) {
      const dx = enemy.x - mote.x; const dy = enemy.y - mote.y;
      if (dx * dx + dy * dy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
        enemy.hasHitPlayer = true;
        if (playerIFramesMs <= 0) {
          const rawDmg = enemy.atk - playerStats.def;
          const dmg = Math.max(0, rawDmg);
          if (dmg <= 0) {
            // DEF fully absorbed the hit — show "BLOCKED", no HP loss.
            spawnDamageNumber(mote.x, mote.y, enemy.dashDirX, enemy.dashDirY, 'BLOCKED', 0.25, '#74c0fc');
          } else {
            playerStats.hp = Math.max(0, playerStats.hp - dmg);
            const ratio = Math.min(1, dmg / playerStats.maxHp);
            // Knockback: push player in the direction the attack came from.
            mote.vx += enemy.dashDirX * PLAYER_KNOCKBACK_MAX * ratio;
            mote.vy += enemy.dashDirY * PLAYER_KNOCKBACK_MAX * ratio;
            // Invincibility frames scale with relative damage.
            playerIFramesMs = PLAYER_IFRAME_MIN_MS + ratio * PLAYER_IFRAME_MAX_ADD_MS;
            // Damage number floats in attack direction (opposite side from attacker).
            spawnDamageNumber(mote.x, mote.y, enemy.dashDirX, enemy.dashDirY,
              String(Math.round(dmg)), ratio, '#ff6666');
          }
        }
      }
    }
    if (enemy.dashTraveled >= LASER_DASH_DISTANCE) {
      enemy.attackTrail.trailEndMs = nowMs;
      enemy.vx = enemy.dashDirX * LASER_DASH_SPEED;
      enemy.vy = enemy.dashDirY * LASER_DASH_SPEED;
      enemy.phase = 'overshoot'; enemy.phaseElapsedMs = 0;
    }
  }

  function updateEnemyOvershoot(enemy: LaserEnemy, dt: number): void {
    const dampFactor = Math.pow(LASER_OVERSHOOT_DAMPING, dt);
    enemy.vx *= dampFactor; enemy.vy *= dampFactor;
    enemy.x  += enemy.vx * dt; enemy.y += enemy.vy * dt;
    clampEnemyToBounds(enemy);
    if (Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy) < LASER_OVERSHOOT_STOP) {
      enemy.vx = 0; enemy.vy = 0;
      enemy.phase = 'cooldown'; enemy.phaseElapsedMs = 0;
    }
  }

  function updateEnemyCooldown(enemy: LaserEnemy, deltaMs: number): void {
    enemy.phaseElapsedMs += deltaMs;
    if (enemy.phaseElapsedMs >= LASER_COOLDOWN_MS) { enemy.phase = 'idle'; enemy.phaseElapsedMs = 0; }
  }

  function updateEnemies(deltaMs: number, nowMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (const enemy of enemies) {
      switch (enemy.phase) {
        case 'idle':       updateEnemyIdle(enemy, dt, deltaMs);       break;
        case 'decelerate': updateEnemyDecelerate(enemy, dt, deltaMs); break;
        case 'dash':       updateEnemyDash(enemy, dt, nowMs);         break;
        case 'overshoot':  updateEnemyOvershoot(enemy, dt);           break;
        case 'cooldown':   updateEnemyCooldown(enemy, deltaMs);       break;
      }
      // Inject laser-enemy movement into fluid.
      const espd = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
      if (espd > 0.05) {
        fluid.addForce({
          x: enemy.x, y: enemy.y,
          vx: enemy.vx * FLUID_VEL_FRAME_TO_PX_S,
          vy: enemy.vy * FLUID_VEL_FRAME_TO_PX_S,
          r: FLUID_LASER_R, g: FLUID_LASER_G, b: FLUID_LASER_B,
          strength: FLUID_ENEMY_STRENGTH,
        });
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
        for (const weaponId of rpgSimState.equippedWeaponIds) {
          const wd = WEAPON_BY_ID.get(weaponId);
          if (wd) {
            autoMoveStopRange = hasWeapon ? Math.min(autoMoveStopRange, wd.stats.range) : wd.stats.range;
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
    mote.trailX[mote.trailHead] = mote.x;
    mote.trailY[mote.trailHead] = mote.y;
    mote.trailHead = (mote.trailHead + 1) % RPG_TRAIL_CAPACITY;
    if (mote.trailCount < RPG_TRAIL_CAPACITY) mote.trailCount++;
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
      p.trailX[p.trailHead] = p.x;
      p.trailY[p.trailHead] = p.y;
      p.trailHead = (p.trailHead + 1) % WEAPON_ORBIT_TRAIL_CAP;
      if (p.trailCount < WEAPON_ORBIT_TRAIL_CAP) p.trailCount++;
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
    op.trailX[op.trailHead] = op.x;
    op.trailY[op.trailHead] = op.y;
    op.trailHead = (op.trailHead + 1) % ORBIT_PROJ_TRAIL_CAP;
    if (op.trailCount < ORBIT_PROJ_TRAIL_CAP) op.trailCount++;

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
    bossEnemy = null;
    bossProjectiles.length = 0;
    sandProjectiles.length = 0;
    chainWhipStates.clear();
    activeVortexes.length = 0; vortexWeaponStates.clear();
    swordComboStates.clear();
    poisonBolts.length = 0; poisonDebuffs.clear();
    laserBeamEffect = null;
    mote.x = widthPx / 2; mote.y = heightPx / 2;
    mote.vx = mote.vy = 0; mote.trailHead = 0; mote.trailCount = 0;
    deathParticles.length = 0; glowMovementIntensity = 0;
    currentWave = rpgSimState.respawnWave; isInterWave = true;
    interWaveTimerMs = INTER_WAVE_DELAY_MS * 0.4;
    screenDarken = 0;
    weaponAttackTimers.clear();
    hitEffects.length = 0; shotLines.length = 0;
    damageNumbers.length = 0; playerIFramesMs = 0;
    fluid.reset();
    applyEquipmentStats();
  }

  // ── Enemy update systems ──────────────────────────────────────
  // All per-frame enemy update functions below are implemented in
  // rpg-enemy-updates.ts and called via the enemyCtx object.
  // updateEmeraldEnemies, updateAmberEnemies, updateAmberShards,
  // updateVoidEnemies, updateQuartzEnemies, updateQuartzSpikes,
  // updateRubyEnemies, updateRubyBolts, updateSunstoneEnemies,
  // updateCitrineEnemies, updateCitrineBolts, updateIoliteEnemies,
  // updateAmethystEnemies, updateAmethystShards,
  // updateDiamondEnemies, updateDiamondShards,
  // updateNullstoneEnemies, updateVoidTendrils,
  // updateFracterylEnemies, updateEigensteinEnemies, updateEigensteinBeams,
  // updateTeleportParticles

  // ── Boss safe-zone draw helpers ───────────────────────────────

  function drawDanmakuSafeZone(): void {
    const boss = bossEnemy;
    if (!boss || !danmakuSafeZone || boss.danmakuLevel === 0) return;
    const sz = danmakuSafeZone;
    const halfAngle = sz.width / 2;
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#00ff88';
    ctx.beginPath();
    ctx.moveTo(sz.x, sz.y);
    ctx.arc(sz.x, sz.y, 80, sz.angle - halfAngle, sz.angle + halfAngle);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    const warnProgress = 1 - Math.min(1, sz.timerMs / sz.maxTimerMs);
    if (warnProgress < 1) {
      ctx.globalAlpha = 0.7 * (1 - warnProgress);
      ctx.fillStyle = '#00ff88';
      ctx.font = '6px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SAFE', Math.round(sz.x + Math.cos(sz.angle) * 50), Math.round(sz.y + Math.sin(sz.angle) * 50));
      ctx.globalAlpha = 1;
    }
  }

  /** Draws the prismatic bottom-safe-zone circle (visible during boss waves). */
  function drawBottomSafeZone(): void {
    if (!isBossWaveActive) return;
    const szX = getSafeZoneX(), szY = getSafeZoneY();
    const hue = (glowTimeS * 60) % 360;
    ctx.save();
    ctx.globalAlpha = 0.30 + Math.sin(glowTimeS * 3) * 0.08;
    ctx.shadowBlur = 16; ctx.shadowColor = `hsl(${hue}, 100%, 80%)`;
    ctx.strokeStyle = `hsl(${hue}, 80%, 75%)`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(szX, szY, BOSS_BOTTOM_SAFE_ZONE_R, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = `hsl(${hue}, 80%, 75%)`;
    ctx.beginPath(); ctx.arc(szX, szY, BOSS_BOTTOM_SAFE_ZONE_R, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.restore();
  }

  /** Draws comet-trail teleport particles. */


  function drawEnemies(nowMs: number): void {
    for (const enemy of enemies) {
      drawAttackTrail(ctx, enemy, nowMs);
      const half = LASER_ENEMY_SIZE / 2;
      ctx.shadowBlur = LASER_ENEMY_SIZE * 5; ctx.shadowColor = LASER_ENEMY_GLOW;
      ctx.fillStyle = LASER_ENEMY_COLOR;
      ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), LASER_ENEMY_SIZE, LASER_ENEMY_SIZE);
      ctx.shadowBlur = 0;
    }
  }


  /** Draws thin tracer lines from the player toward each recently struck enemy. */

  /** Draws a small expanding square flash at each recently hit enemy position. */

  /** Draws floating damage numbers and "BLOCKED" labels. */

  /** Draws one equipped-weapon visual orbit particle with comet trail. */

  /** Draws the orbiting projectile with comet trail. */

  // ── Boss enemy system ──────────────────────────────────────────

  function makeBossEnemy(rawBossId: number, waveNumber: number): BossEnemy {
    const bossScale = getWaveStatScale(waveNumber) * 4.0;
    const bossNum = ((rawBossId - 1) % 12) + 1;
    const extraScale = Math.floor((rawBossId - 1) / 12) + 1;
    const hp = Math.ceil(BOSS_HP_INIT * bossScale * extraScale);
    const atk = Math.ceil(BOSS_ATK_INIT * getWaveStatScale(waveNumber) * extraScale);
    const def = Math.ceil(BOSS_DEF_INIT * getWaveStatScale(waveNumber) * extraScale);
    const shieldHp = bossNum === 6 ? Math.ceil(BOSS_SHIELD_INIT * bossScale * extraScale) : 0;
    return {
      kind: 'boss',
      bossId: bossNum,
      phaseIndex: 0,
      x: widthPx / 2, y: heightPx * 0.25,
      vx: 0, vy: 0,
      hp, maxHp: hp,
      atk, def,
      attackTimerMs: 1000,
      secondaryTimerMs: 2000,
      orbitAngle: 0,
      pulseMs: 0,
      shieldHp, maxShieldHp: shieldHp,
      isInvuln: false, invulnTimerMs: 0,
      isAbsorbing: false, absorbTimerMs: 0,
      contactCdMs: 0,
      phaseTransitionMs: 0,
      danmakuLevel: 0,
    };
  }

  function updateBossEnemy(deltaMs: number): void {
    const boss = bossEnemy;
    if (!boss) return;
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    boss.pulseMs = (boss.pulseMs + deltaMs) % 3000;
    if (boss.contactCdMs > 0) boss.contactCdMs = Math.max(0, boss.contactCdMs - deltaMs);

    const hpRatio = boss.hp / boss.maxHp;
    const targetPhase: 0|1|2 = hpRatio <= BOSS_PHASE3_HP_RATIO ? 2 : hpRatio <= BOSS_PHASE2_HP_RATIO ? 1 : 0;
    if (targetPhase > boss.phaseIndex) {
      boss.phaseIndex = targetPhase;
      boss.phaseTransitionMs = BOSS_PHASE_TRANSITION_MS;
      // Activate danmaku for phases 1 and 2
      boss.danmakuLevel = targetPhase;
      // Teleport for danmaku phases — pick a random edge position, announce safe zone
      if (boss.danmakuLevel > 0) {
        boss.x = DANMAKU_TELEPORT_MARGIN + Math.random() * (widthPx - DANMAKU_TELEPORT_MARGIN * 2);
        boss.y = DANMAKU_TELEPORT_MARGIN + Math.random() * (heightPx * 0.5);
        boss.vx = 0; boss.vy = 0;
        const safeAngle = Math.random() * Math.PI * 2;
        danmakuSafeZone = makeDanmakuSafeZone(boss.x, boss.y, safeAngle, DANMAKU_SAFE_ANGLE_WIDTH);
      }
      const blastCount = 8;
      for (let i = 0; i < blastCount; i++) {
        const angle = (i / blastCount) * Math.PI * 2;
        fluid.addForce({
          x: boss.x, y: boss.y,
          vx: Math.cos(angle) * FLUID_VEL_FRAME_TO_PX_S * 5,
          vy: Math.sin(angle) * FLUID_VEL_FRAME_TO_PX_S * 5,
          r: FLUID_VOID_R, g: FLUID_VOID_G, b: FLUID_VOID_B,
          strength: 2.5,
        });
      }
    }
    if (boss.phaseTransitionMs > 0) boss.phaseTransitionMs = Math.max(0, boss.phaseTransitionMs - deltaMs);

    const atk1Cd = boss.phaseIndex === 2 ? BOSS_ATTACK1_CD_P2 : boss.phaseIndex === 1 ? BOSS_ATTACK1_CD_P1 : BOSS_ATTACK1_CD_BASE;
    const atk2Cd = boss.phaseIndex === 2 ? BOSS_ATTACK2_CD_P2 : boss.phaseIndex === 1 ? BOSS_ATTACK2_CD_P1 : BOSS_ATTACK2_CD_BASE;
    boss.attackTimerMs -= deltaMs;
    boss.secondaryTimerMs -= deltaMs;

    const bossId = boss.bossId;
    const dx = mote.x - boss.x, dy = mote.y - boss.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dirX = dist > 0.01 ? dx / dist : 0;
    const dirY = dist > 0.01 ? dy / dist : 0;
    const bossSize = BOSS_SIZE_BASE + bossId * 1.5;
    const half = bossSize / 2;

    // During a boss wave the boss is pinned to top-middle with gentle side drift
    if (isBossWaveActive) {
      const targetX = widthPx / 2 + Math.sin(boss.orbitAngle) * widthPx * 0.18;
      const targetY = heightPx * 0.12;
      boss.orbitAngle += 0.006 * dt;
      boss.vx += (targetX - boss.x) * 0.06;
      boss.vy += (targetY - boss.y) * 0.10;
      boss.vx *= 0.82; boss.vy *= 0.82;
      boss.x = Math.max(half, Math.min(widthPx - half, boss.x + boss.vx * dt));
      boss.y = Math.max(half, Math.min(heightPx * 0.30, boss.y + boss.vy * dt));
      // Danmaku attack patterns — scale with danmakuLevel
      const dl = boss.danmakuLevel;
      const bulletSpeed = BOSS_PROJ_SPEED * (1.0 + dl * 0.12);
      const bulletSpeedFast = BOSS_PROJ_SPEED_FAST * (1.0 + dl * 0.08);
      const bossColor = BOSS_COLORS[Math.min(bossId, BOSS_COLORS.length - 1)];
      const bossGlow  = BOSS_GLOW_COLORS[Math.min(bossId, BOSS_GLOW_COLORS.length - 1)];
      const seekStr = Math.min(0.025, 0.002 + dl * 0.003);

      if (boss.attackTimerMs <= 0) {
        boss.attackTimerMs = atk1Cd;
        // Ring burst: number of bullets grows with danmakuLevel
        const ringCount = 6 + dl * 2 + boss.phaseIndex * 4;
        const rotOffset = boss.orbitAngle;
        for (let i = 0; i < ringCount; i++) {
          const a = rotOffset + (i / ringCount) * Math.PI * 2;
          bossProjectiles.push({
            x: boss.x, y: boss.y,
            vx: Math.cos(a) * bulletSpeed, vy: Math.sin(a) * bulletSpeed,
            atk: boss.atk, hasHitPlayer: false,
            lifeMs: BOSS_PROJ_LIFE_MS, maxLifeMs: BOSS_PROJ_LIFE_MS,
            color: bossColor, glowColor: bossGlow,
            size: BOSS_PROJ_SIZE, seekStr: 0,
          });
        }
        // Second offset ring at danmakuLevel 3+
        if (dl >= 3) {
          const ring2 = 8 + dl;
          const offset2 = Math.PI / ring2;
          for (let i = 0; i < ring2; i++) {
            const a = rotOffset + offset2 + (i / ring2) * Math.PI * 2;
            bossProjectiles.push({
              x: boss.x, y: boss.y,
              vx: Math.cos(a) * bulletSpeed * 0.8, vy: Math.sin(a) * bulletSpeed * 0.8,
              atk: boss.atk, hasHitPlayer: false,
              lifeMs: BOSS_PROJ_LIFE_MS, maxLifeMs: BOSS_PROJ_LIFE_MS,
              color: bossColor, glowColor: bossGlow,
              size: BOSS_PROJ_SIZE - 1, seekStr: 0,
            });
          }
        }
        // Spiral burst at danmakuLevel 5+
        if (dl >= 5) {
          const spiralCount = 12 + boss.phaseIndex * 3;
          for (let i = 0; i < spiralCount; i++) {
            const a = rotOffset * 2 + (i / spiralCount) * Math.PI * 2;
            const spd = bulletSpeed * (0.7 + (i / spiralCount) * 0.6);
            bossProjectiles.push({
              x: boss.x, y: boss.y,
              vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
              atk: boss.atk, hasHitPlayer: false,
              lifeMs: BOSS_PROJ_LIFE_MS * 0.9, maxLifeMs: BOSS_PROJ_LIFE_MS * 0.9,
              color: bossGlow, glowColor: bossColor,
              size: BOSS_PROJ_SIZE, seekStr: seekStr * 0.5,
            });
          }
        }
      }

      if (boss.secondaryTimerMs <= 0) {
        boss.secondaryTimerMs = atk2Cd;
        // Aimed cluster toward player
        const aimAngle = Math.atan2(dy, dx);
        const spread = 3 + Math.floor(dl * 0.8);
        for (let i = 0; i < spread; i++) {
          const offset = (i - (spread - 1) / 2) * (0.18 + dl * 0.015);
          const a = aimAngle + offset;
          bossProjectiles.push({
            x: boss.x, y: boss.y,
            vx: Math.cos(a) * bulletSpeedFast, vy: Math.sin(a) * bulletSpeedFast,
            atk: boss.atk, hasHitPlayer: false,
            lifeMs: BOSS_PROJ_LIFE_MS * 0.7, maxLifeMs: BOSS_PROJ_LIFE_MS * 0.7,
            color: bossGlow, glowColor: bossColor,
            size: BOSS_PROJ_SIZE - 1, seekStr,
          });
        }
      }
      return; // skip the non-boss-wave movement/attack code below
    }


    if (bossId === 1) {
      const preferredDist = 100 + boss.phaseIndex * 20;
      const approachSpd = 0.5 + boss.phaseIndex * 0.15;
      if (dist > preferredDist + 20) { boss.vx += dirX * approachSpd * 0.15; boss.vy += dirY * approachSpd * 0.15; }
      else if (dist < preferredDist - 20) { boss.vx -= dirX * approachSpd * 0.1; boss.vy -= dirY * approachSpd * 0.1; }
      boss.orbitAngle += 0.008 * dt * (1 + boss.phaseIndex * 0.5);
      boss.vx += Math.cos(boss.orbitAngle) * 0.05;
      boss.vy += Math.sin(boss.orbitAngle) * 0.05;
      boss.vx *= 0.95; boss.vy *= 0.95;
      if (boss.attackTimerMs <= 0) {
        boss.attackTimerMs = atk1Cd;
        const count = 6 + boss.phaseIndex * 3;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          const spd = BOSS_PROJ_SPEED * (1 + boss.phaseIndex * 0.3);
          bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
            atk: boss.atk, hasHitPlayer: false, lifeMs: BOSS_PROJ_LIFE_MS, maxLifeMs: BOSS_PROJ_LIFE_MS,
            color: BOSS_COLORS[1], glowColor: BOSS_GLOW_COLORS[1], size: BOSS_PROJ_SIZE, seekStr: 0 });
        }
      }
      if (boss.secondaryTimerMs <= 0) {
        boss.secondaryTimerMs = atk2Cd;
        if (boss.phaseIndex >= 1) {
          for (let i = -1; i <= 1; i++) {
            const a = Math.atan2(dirY, dirX) + i * 0.25;
            const life = BOSS_PROJ_LIFE_MS;
            bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED_FAST, vy: Math.sin(a) * BOSS_PROJ_SPEED_FAST,
              atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
              color: '#f0e8d8', glowColor: BOSS_GLOW_COLORS[1], size: BOSS_PROJ_SIZE - 1, seekStr: 0 });
          }
        }
      }
    } else if (bossId === 2) {
      const preferredDist = 60 + boss.phaseIndex * 10;
      const speed = 0.9 + boss.phaseIndex * 0.35;
      if (dist > preferredDist) { boss.vx += dirX * speed * 0.25; boss.vy += dirY * speed * 0.25; }
      boss.vx *= 0.92; boss.vy *= 0.92;
      if (boss.attackTimerMs <= 0) {
        boss.attackTimerMs = atk1Cd;
        const burstCount = 1 + boss.phaseIndex;
        for (let b = 0; b < burstCount; b++) {
          const spread = (b - (burstCount - 1) / 2) * 0.22;
          const a = Math.atan2(dirY, dirX) + spread;
          const spd = BOSS_PROJ_SPEED_FAST * (1 + boss.phaseIndex * 0.2);
          const life = BOSS_PROJ_LIFE_MS * 0.6;
          bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
            atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
            color: BOSS_COLORS[2], glowColor: BOSS_GLOW_COLORS[2], size: BOSS_PROJ_SIZE - 1, seekStr: 0.012 });
        }
      }
      if (boss.secondaryTimerMs <= 0) {
        boss.secondaryTimerMs = atk2Cd;
        if (boss.phaseIndex >= 1 && dist > 30) {
          boss.vx = dirX * (8 + boss.phaseIndex * 4);
          boss.vy = dirY * (8 + boss.phaseIndex * 4);
        }
      }
    } else if (bossId === 3) {
      const targetDist = 120 - boss.phaseIndex * 20;
      const orbitSpd = 0.006 + boss.phaseIndex * 0.003;
      boss.orbitAngle += orbitSpd * dt * (2 + boss.phaseIndex);
      const targetX = mote.x + Math.cos(boss.orbitAngle) * targetDist;
      const targetY = mote.y + Math.sin(boss.orbitAngle) * targetDist;
      const tdx = targetX - boss.x, tdy = targetY - boss.y;
      const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
      if (tdist > 2) { boss.vx += (tdx / tdist) * 0.6; boss.vy += (tdy / tdist) * 0.6; }
      boss.vx *= 0.88; boss.vy *= 0.88;
      if (boss.attackTimerMs <= 0) {
        boss.attackTimerMs = atk1Cd;
        const ringCount = 8 + boss.phaseIndex * 4;
        for (let i = 0; i < ringCount; i++) {
          const a = (i / ringCount) * Math.PI * 2;
          const spd = BOSS_PROJ_SPEED * (1.2 + boss.phaseIndex * 0.4);
          const life = BOSS_PROJ_LIFE_MS * 0.8;
          bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
            atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
            color: BOSS_COLORS[3], glowColor: BOSS_GLOW_COLORS[3], size: BOSS_PROJ_SIZE, seekStr: 0 });
        }
      }
      if (boss.secondaryTimerMs <= 0) {
        boss.secondaryTimerMs = atk2Cd;
        if (boss.phaseIndex >= 1) {
          const ringCount = 8 + boss.phaseIndex * 4;
          for (let i = 0; i < ringCount; i++) {
            const a = (i / ringCount) * Math.PI * 2 + Math.PI / ringCount;
            const life = BOSS_PROJ_LIFE_MS * 0.7;
            bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED * 1.4, vy: Math.sin(a) * BOSS_PROJ_SPEED * 1.4,
              atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
              color: '#ffcc88', glowColor: '#ffe0aa', size: BOSS_PROJ_SIZE - 1, seekStr: 0 });
          }
        }
      }
    } else if (bossId === 4) {
      boss.orbitAngle += 0.015 * dt;
      boss.vx += Math.cos(boss.orbitAngle) * 0.3 + dirX * 0.1;
      boss.vy += Math.sin(boss.orbitAngle) * 0.3 + dirY * 0.1;
      boss.vx *= 0.93; boss.vy *= 0.93;
      if (boss.attackTimerMs <= 0) {
        boss.attackTimerMs = atk1Cd;
        const count = 2 + boss.phaseIndex * 2;
        for (let i = 0; i < count; i++) {
          const spread = (Math.random() - 0.5) * 0.6;
          const a = Math.atan2(dirY, dirX) + spread;
          bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED * 1.2, vy: Math.sin(a) * BOSS_PROJ_SPEED * 1.2,
            atk: boss.atk, hasHitPlayer: false, lifeMs: BOSS_PROJ_LIFE_MS, maxLifeMs: BOSS_PROJ_LIFE_MS,
            color: BOSS_COLORS[4], glowColor: BOSS_GLOW_COLORS[4], size: BOSS_PROJ_SIZE - 1, seekStr: 0.03 + boss.phaseIndex * 0.01 });
        }
      }
      if (boss.secondaryTimerMs <= 0) {
        boss.secondaryTimerMs = atk2Cd;
        if (boss.phaseIndex >= 1) {
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const life = BOSS_PROJ_LIFE_MS * 0.7;
            bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED_FAST, vy: Math.sin(a) * BOSS_PROJ_SPEED_FAST,
              atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
              color: '#f0d870', glowColor: BOSS_GLOW_COLORS[4], size: BOSS_PROJ_SIZE, seekStr: 0 });
          }
        }
      }
    } else if (bossId === 5) {
      const speed5 = (0.25 + boss.phaseIndex * 0.3) * (boss.phaseIndex >= 2 ? 2.0 : 1.0);
      if (dist > 40) { boss.vx += dirX * speed5 * 0.2; boss.vy += dirY * speed5 * 0.2; }
      boss.vx *= 0.94; boss.vy *= 0.94;
      if (boss.attackTimerMs <= 0) {
        boss.attackTimerMs = atk1Cd;
        const fanCount = 5 + boss.phaseIndex * 2;
        const angleToPlayer = Math.atan2(dirY, dirX);
        const fanSpread = Math.PI / 2.5;
        for (let i = 0; i < fanCount; i++) {
          const a = angleToPlayer - fanSpread / 2 + (i / (fanCount - 1)) * fanSpread;
          const life = BOSS_PROJ_LIFE_MS * 0.5;
          bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED_FAST * 1.3, vy: Math.sin(a) * BOSS_PROJ_SPEED_FAST * 1.3,
            atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
            color: BOSS_COLORS[5], glowColor: BOSS_GLOW_COLORS[5], size: BOSS_PROJ_SIZE + 1, seekStr: 0 });
        }
      }
      if (boss.secondaryTimerMs <= 0) {
        boss.secondaryTimerMs = atk2Cd;
        if (boss.phaseIndex >= 2) {
          boss.vx = dirX * 12; boss.vy = dirY * 12;
        }
      }
    } else if (bossId === 6) {
      const preferredDist6 = 90 + boss.phaseIndex * 15;
      const speed6 = 0.5 + boss.phaseIndex * 0.15;
      if (dist > preferredDist6 + 20) { boss.vx += dirX * speed6 * 0.2; boss.vy += dirY * speed6 * 0.2; }
      else if (dist < preferredDist6 - 20) { boss.vx -= dirX * speed6 * 0.15; boss.vy -= dirY * speed6 * 0.15; }
      boss.vx *= 0.93; boss.vy *= 0.93;
      if (boss.attackTimerMs <= 0) {
        boss.attackTimerMs = atk1Cd;
        const count6 = 8 + boss.phaseIndex * 4;
        for (let i = 0; i < count6; i++) {
          const a = (i / count6) * Math.PI * 2;
          const life = BOSS_PROJ_LIFE_MS * 0.9;
          bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED * 1.3, vy: Math.sin(a) * BOSS_PROJ_SPEED * 1.3,
            atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
            color: BOSS_COLORS[6], glowColor: BOSS_GLOW_COLORS[6], size: BOSS_PROJ_SIZE, seekStr: 0 });
        }
      }
      if (boss.phaseIndex >= 1 && boss.shieldHp < boss.maxShieldHp) {
        boss.shieldHp = Math.min(boss.maxShieldHp, boss.shieldHp + deltaMs * 0.8);
      }
    } else if (bossId === 7) {
      const onTime  = boss.phaseIndex === 2 ? BOSS_INVULN_ON_P2  : boss.phaseIndex === 1 ? BOSS_INVULN_ON_P1  : BOSS_INVULN_ON_MS;
      const offTime = boss.phaseIndex === 2 ? BOSS_INVULN_OFF_P2 : boss.phaseIndex === 1 ? BOSS_INVULN_OFF_P1 : BOSS_INVULN_OFF_MS;
      boss.invulnTimerMs -= deltaMs;
      if (boss.invulnTimerMs <= 0) {
        boss.isInvuln = !boss.isInvuln;
        boss.invulnTimerMs = boss.isInvuln ? onTime : offTime;
      }
      if (boss.isInvuln) {
        boss.orbitAngle += 0.01 * dt * (1 + boss.phaseIndex * 0.5);
        const orbitDist = 110;
        const tx7 = mote.x + Math.cos(boss.orbitAngle) * orbitDist;
        const ty7 = mote.y + Math.sin(boss.orbitAngle) * orbitDist;
        const tdx7 = tx7 - boss.x, tdy7 = ty7 - boss.y;
        const td7 = Math.sqrt(tdx7 * tdx7 + tdy7 * tdy7);
        if (td7 > 2) { boss.vx += (tdx7 / td7) * 0.7; boss.vy += (tdy7 / td7) * 0.7; }
      } else {
        if (dist > 40) { boss.vx += dirX * 0.5; boss.vy += dirY * 0.5; }
      }
      boss.vx *= 0.9; boss.vy *= 0.9;
      if (!boss.isInvuln && boss.attackTimerMs <= 0) {
        boss.attackTimerMs = atk1Cd;
        const count7 = 6 + boss.phaseIndex * 3;
        for (let i = 0; i < count7; i++) {
          const a = (i / count7) * Math.PI * 2;
          bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED * 1.5, vy: Math.sin(a) * BOSS_PROJ_SPEED * 1.5,
            atk: boss.atk, hasHitPlayer: false, lifeMs: BOSS_PROJ_LIFE_MS, maxLifeMs: BOSS_PROJ_LIFE_MS,
            color: BOSS_COLORS[7], glowColor: BOSS_GLOW_COLORS[7], size: BOSS_PROJ_SIZE, seekStr: 0 });
        }
      }
    } else if (bossId === 8) {
      if (dist > 0 && dist < BOSS_GRAV_RADIUS) {
        const gravStr = BOSS_GRAV_STRENGTH * (1 + boss.phaseIndex * 0.5) * (boss.isAbsorbing ? 2.5 : 1.0);
        mote.vx -= dirX * gravStr * dist;
        mote.vy -= dirY * gravStr * dist;
      }
      if (boss.phaseIndex >= 2 && !boss.isAbsorbing && dist < BOSS_GRAV_RADIUS) {
        mote.vx += dirX * BOSS_GRAV_STRENGTH * 0.7 * dist;
        mote.vy += dirY * BOSS_GRAV_STRENGTH * 0.7 * dist;
      }
      boss.orbitAngle += 0.003 * dt;
      boss.vx += Math.cos(boss.orbitAngle) * 0.08;
      boss.vy += Math.sin(boss.orbitAngle) * 0.08;
      boss.vx *= 0.97; boss.vy *= 0.97;
      boss.absorbTimerMs -= deltaMs;
      if (boss.absorbTimerMs <= 0) {
        boss.isAbsorbing = !boss.isAbsorbing;
        boss.absorbTimerMs = boss.isAbsorbing ? 2500 : 5000;
      }
      if (boss.attackTimerMs <= 0) {
        boss.attackTimerMs = atk1Cd;
        const count8 = 3 + boss.phaseIndex * 2;
        for (let i = 0; i < count8; i++) {
          const spread = (i - (count8 - 1) / 2) * 0.3;
          const a = Math.atan2(dirY, dirX) + spread;
          const life = BOSS_PROJ_LIFE_MS * 1.2;
          bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED, vy: Math.sin(a) * BOSS_PROJ_SPEED,
            atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
            color: '#4d2280', glowColor: BOSS_GLOW_COLORS[8], size: BOSS_PROJ_SIZE + 1, seekStr: 0.008 });
        }
      }
    } else if (bossId === 9) {
      boss.orbitAngle += 0.012 * dt * (1 + boss.phaseIndex * 0.4);
      boss.vx += Math.cos(boss.orbitAngle) * 0.25 + dirX * 0.15 * boss.phaseIndex;
      boss.vy += Math.sin(boss.orbitAngle) * 0.25 + dirY * 0.15 * boss.phaseIndex;
      boss.vx *= 0.92; boss.vy *= 0.92;
      if (boss.phaseIndex >= 2 && dist < BOSS_GRAV_RADIUS) {
        const gravStr9 = BOSS_GRAV_STRENGTH * 0.8;
        mote.vx -= dirX * gravStr9 * dist;
        mote.vy -= dirY * gravStr9 * dist;
      }
      if (boss.attackTimerMs <= 0) {
        boss.attackTimerMs = atk1Cd;
        const count9 = 10 + boss.phaseIndex * 4;
        for (let i = 0; i < count9; i++) {
          const a = (i / count9) * Math.PI * 2;
          const spd9 = i % 2 === 0 ? BOSS_PROJ_SPEED : BOSS_PROJ_SPEED_FAST;
          bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * spd9, vy: Math.sin(a) * spd9,
            atk: boss.atk, hasHitPlayer: false, lifeMs: BOSS_PROJ_LIFE_MS, maxLifeMs: BOSS_PROJ_LIFE_MS,
            color: BOSS_COLORS[9], glowColor: BOSS_GLOW_COLORS[9], size: BOSS_PROJ_SIZE, seekStr: 0.005 });
        }
      }
      if (boss.secondaryTimerMs <= 0) {
        boss.secondaryTimerMs = atk2Cd;
        const cnt9b = 4 + boss.phaseIndex * 2;
        for (let i = 0; i < cnt9b; i++) {
          const spread = (i - (cnt9b - 1) / 2) * 0.2;
          const a = Math.atan2(dirY, dirX) + spread;
          const life = BOSS_PROJ_LIFE_MS * 0.8;
          bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED_FAST, vy: Math.sin(a) * BOSS_PROJ_SPEED_FAST,
            atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
            color: '#c090ff', glowColor: '#e0c0ff', size: BOSS_PROJ_SIZE - 1, seekStr: 0.02 });
        }
      }
    } else if (bossId === 10) {
      // The Equation Incarnate — multi-ring spiral
      boss.orbitAngle += 0.01 * dt * (1 + boss.phaseIndex * 0.6);
      boss.vx += Math.cos(boss.orbitAngle) * 0.2 + dirX * 0.2;
      boss.vy += Math.sin(boss.orbitAngle) * 0.2 + dirY * 0.2;
      boss.vx *= 0.91; boss.vy *= 0.91;
      if (boss.phaseIndex >= 1 && dist < BOSS_GRAV_RADIUS) {
        mote.vx -= dirX * BOSS_GRAV_STRENGTH * 0.6 * dist;
        mote.vy -= dirY * BOSS_GRAV_STRENGTH * 0.6 * dist;
      }
      if (boss.attackTimerMs <= 0) {
        boss.attackTimerMs = atk1Cd;
        for (let ring = 0; ring < 1 + boss.phaseIndex; ring++) {
          const count10 = 8 + ring * 4;
          const offset = ring * (Math.PI / count10);
          for (let i = 0; i < count10; i++) {
            const a = (i / count10) * Math.PI * 2 + offset;
            const spd10 = BOSS_PROJ_SPEED * (1 + ring * 0.3);
            bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * spd10, vy: Math.sin(a) * spd10,
              atk: boss.atk, hasHitPlayer: false, lifeMs: BOSS_PROJ_LIFE_MS, maxLifeMs: BOSS_PROJ_LIFE_MS,
              color: BOSS_COLORS[10] ?? '#ffd764', glowColor: BOSS_GLOW_COLORS[10] ?? '#ffe599', size: BOSS_PROJ_SIZE, seekStr: 0.006 });
          }
        }
      }
      if (boss.secondaryTimerMs <= 0) {
        boss.secondaryTimerMs = atk2Cd;
        const cnt10b = 5 + boss.phaseIndex * 3;
        for (let i = 0; i < cnt10b; i++) {
          const a = Math.atan2(dirY, dirX) + (i - (cnt10b - 1) / 2) * 0.18;
          const life = BOSS_PROJ_LIFE_MS * 0.6;
          bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED_FAST * 1.3, vy: Math.sin(a) * BOSS_PROJ_SPEED_FAST * 1.3,
            atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
            color: '#ffe599', glowColor: '#ffffff', size: BOSS_PROJ_SIZE, seekStr: 0.015 });
        }
      }
    } else if (bossId === 11) {
      // Fracteryl Manifestation — fractal burst danmaku with teleport on phase transitions
      boss.orbitAngle += 0.015 * dt * (1 + boss.phaseIndex * 0.5);
      boss.vx += Math.cos(boss.orbitAngle) * 0.3 + dirX * 0.1;
      boss.vy += Math.sin(boss.orbitAngle) * 0.3 + dirY * 0.1;
      boss.vx *= 0.90; boss.vy *= 0.90;
      if (boss.attackTimerMs <= 0) {
        boss.attackTimerMs = atk1Cd;
        const ringCount = DANMAKU_RING_COUNT + boss.phaseIndex * 8;
        const safeAngle = danmakuSafeZone ? danmakuSafeZone.angle : Math.random() * Math.PI * 2;
        const halfSafe = DANMAKU_SAFE_ANGLE_WIDTH / 2;
        for (let i = 0; i < ringCount; i++) {
          const a = (i / ringCount) * Math.PI * 2;
          const aRel = ((a - safeAngle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          if (aRel < halfSafe || aRel > Math.PI * 2 - halfSafe) continue;
          const spd = DANMAKU_BULLET_SPEED * (1 + boss.phaseIndex * 0.2);
          bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
            atk: boss.atk, hasHitPlayer: false, lifeMs: BOSS_PROJ_LIFE_MS * 1.5, maxLifeMs: BOSS_PROJ_LIFE_MS * 1.5,
            color: BOSS_COLORS[11], glowColor: BOSS_GLOW_COLORS[11], size: BOSS_PROJ_SIZE - 1, seekStr: 0 });
        }
        // After firing, update safe zone for next burst
        danmakuSafeZone = makeDanmakuSafeZone(boss.x, boss.y, safeAngle + Math.PI * 0.6, DANMAKU_SAFE_ANGLE_WIDTH);
      }
    } else {
      // bossId === 12: Eigenstein Entity — perpendicular beam walls + danmaku
      boss.orbitAngle += 0.008 * dt * (1 + boss.phaseIndex * 0.4);
      boss.vx += Math.cos(boss.orbitAngle + Math.PI / 2) * 0.25 + dirX * 0.12;
      boss.vy += Math.sin(boss.orbitAngle + Math.PI / 2) * 0.25 + dirY * 0.12;
      boss.vx *= 0.91; boss.vy *= 0.91;
      if (boss.attackTimerMs <= 0) {
        boss.attackTimerMs = atk1Cd;
        const ringCount12 = DANMAKU_RING_COUNT + boss.phaseIndex * 6;
        const safeAngle12 = danmakuSafeZone ? danmakuSafeZone.angle : Math.random() * Math.PI * 2;
        const halfSafe12 = DANMAKU_SAFE_ANGLE_WIDTH / 2;
        for (let i = 0; i < ringCount12; i++) {
          const a = (i / ringCount12) * Math.PI * 2;
          const aRel = ((a - safeAngle12) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          if (aRel < halfSafe12 || aRel > Math.PI * 2 - halfSafe12) continue;
          const spd12 = DANMAKU_BULLET_SPEED * (1.2 + boss.phaseIndex * 0.15);
          bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * spd12, vy: Math.sin(a) * spd12,
            atk: boss.atk, hasHitPlayer: false, lifeMs: BOSS_PROJ_LIFE_MS, maxLifeMs: BOSS_PROJ_LIFE_MS,
            color: BOSS_COLORS[12], glowColor: BOSS_GLOW_COLORS[12], size: BOSS_PROJ_SIZE - 1, seekStr: 0 });
        }
        danmakuSafeZone = makeDanmakuSafeZone(boss.x, boss.y, safeAngle12 + Math.PI * 0.7, DANMAKU_SAFE_ANGLE_WIDTH);
      }
      // Second attack: aim at player
      if (boss.secondaryTimerMs <= 0) {
        boss.secondaryTimerMs = atk2Cd;
        const aimCount = 3 + boss.phaseIndex * 2;
        for (let i = 0; i < aimCount; i++) {
          const spread = (i - (aimCount - 1) / 2) * 0.22;
          const a = Math.atan2(dirY, dirX) + spread;
          const life = BOSS_PROJ_LIFE_MS * 0.7;
          bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED_FAST, vy: Math.sin(a) * BOSS_PROJ_SPEED_FAST,
            atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
            color: BOSS_COLORS[12], glowColor: BOSS_GLOW_COLORS[12], size: BOSS_PROJ_SIZE, seekStr: 0.01 });
        }
      }
    }

    // Contact damage
    if (dist < bossSize + PLAYER_HIT_RADIUS + 2 && playerIFramesMs <= 0 && boss.contactCdMs <= 0) {
      const rawDmg = boss.atk - playerStats.def;
      const dmg = Math.max(0, rawDmg);
      if (dmg > 0) {
        playerStats.hp = Math.max(0, playerStats.hp - dmg);
        const ratio = Math.min(1, dmg / playerStats.maxHp);
        playerIFramesMs = PLAYER_IFRAME_MIN_MS + ratio * PLAYER_IFRAME_MAX_ADD_MS;
        boss.contactCdMs = 800;
        spawnDamageNumber(mote.x, mote.y, -dirX, -dirY, String(Math.round(dmg)), ratio, '#ff6666');
      }
    }

    // Movement clamp + fluid
    boss.x += boss.vx * dt; boss.y += boss.vy * dt;
    if (boss.x < half)            { boss.x = half;            boss.vx =  Math.abs(boss.vx) * 0.5; }
    if (boss.x > widthPx  - half) { boss.x = widthPx  - half; boss.vx = -Math.abs(boss.vx) * 0.5; }
    if (boss.y < half)            { boss.y = half;             boss.vy =  Math.abs(boss.vy) * 0.5; }
    if (boss.y > heightPx - half) { boss.y = heightPx - half; boss.vy = -Math.abs(boss.vy) * 0.5; }
    const espd = Math.sqrt(boss.vx * boss.vx + boss.vy * boss.vy);
    if (espd > 0.04) {
      fluid.addForce({
        x: boss.x, y: boss.y,
        vx: boss.vx * FLUID_VEL_FRAME_TO_PX_S,
        vy: boss.vy * FLUID_VEL_FRAME_TO_PX_S,
        r: 0.4, g: 0.2, b: 0.8,
        strength: FLUID_ENEMY_STRENGTH * 2.0,
      });
    }
  }

  function updateBossProjectiles(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (let i = bossProjectiles.length - 1; i >= 0; i--) {
      const p = bossProjectiles[i];
      p.lifeMs -= deltaMs;
      if (p.lifeMs <= 0) { bossProjectiles.splice(i, 1); continue; }

      if (p.seekStr > 0) {
        const sdx = mote.x - p.x, sdy = mote.y - p.y;
        const sd = Math.sqrt(sdx * sdx + sdy * sdy);
        if (sd > 0.01) { p.vx += (sdx / sd) * p.seekStr; p.vy += (sdy / sd) * p.seekStr; }
        const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const maxSpd = BOSS_PROJ_SPEED_FAST * 1.5;
        if (spd > maxSpd) { p.vx = (p.vx / spd) * maxSpd; p.vy = (p.vy / spd) * maxSpd; }
      }

      p.x += p.vx * dt; p.y += p.vy * dt;

      // Boss projectiles are destroyed when they enter the bottom safe zone
      if (isBossWaveActive && isInBottomSafeZone(p.x, p.y)) {
        bossProjectiles.splice(i, 1); continue;
      }

      fluid.addForce({
        x: p.x, y: p.y,
        vx: p.vx * FLUID_VEL_FRAME_TO_PX_S,
        vy: p.vy * FLUID_VEL_FRAME_TO_PX_S,
        r: 0.4, g: 0.2, b: 0.8,
        strength: FLUID_MISSILE_STRENGTH * 0.8,
      });

      if (!p.hasHitPlayer) {
        // Player is immune inside the bottom safe zone
        if (isBossWaveActive && isInBottomSafeZone(mote.x, mote.y)) continue;
        const pdx = mote.x - p.x, pdy = mote.y - p.y;
        if (pdx * pdx + pdy * pdy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
          p.hasHitPlayer = true;
          if (playerIFramesMs <= 0) {
            const rawDmg = p.atk - playerStats.def;
            const dmg = Math.max(0, rawDmg);
            if (dmg <= 0) {
              spawnDamageNumber(mote.x, mote.y, 0, -1, 'BLOCKED', 0.25, '#74c0fc');
            } else {
              playerStats.hp = Math.max(0, playerStats.hp - dmg);
              const ratio = Math.min(1, dmg / playerStats.maxHp);
              const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy) + 0.01;
              mote.vx += (p.vx / spd) * PLAYER_KNOCKBACK_MAX * ratio * 0.6;
              mote.vy += (p.vy / spd) * PLAYER_KNOCKBACK_MAX * ratio * 0.6;
              playerIFramesMs = PLAYER_IFRAME_MIN_MS + ratio * PLAYER_IFRAME_MAX_ADD_MS;
              spawnDamageNumber(mote.x, mote.y, p.vx / spd, p.vy / spd, String(Math.round(dmg)), ratio, '#ff6666');
            }
          }
          bossProjectiles.splice(i, 1); continue;
        }
      }

      const margin = 30;
      if (p.x < -margin || p.x > widthPx + margin || p.y < -margin || p.y > heightPx + margin) {
        bossProjectiles.splice(i, 1);
      }
    }
  }


  function drawBossEnemy(): void {
    const boss = bossEnemy;
    if (!boss) return;
    const bossSize = BOSS_SIZE_BASE + boss.bossId * 1.5;
    const half = bossSize / 2;
    const pulseT = boss.pulseMs / 3000;
    const pulseFactor = (Math.sin(pulseT * Math.PI * 2) + 1) * 0.5;
    const color     = BOSS_COLORS[Math.min(boss.bossId, BOSS_COLORS.length - 1)];
    const glowColor = BOSS_GLOW_COLORS[Math.min(boss.bossId, BOSS_GLOW_COLORS.length - 1)];

    ctx.save();

    if (boss.phaseTransitionMs > 0) {
      const flashT = boss.phaseTransitionMs / BOSS_PHASE_TRANSITION_MS;
      ctx.globalAlpha = flashT * 0.6;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, widthPx, heightPx);
      ctx.globalAlpha = 1;
    }

    let drawColor   = color;
    let drawGlow    = glowColor;
    if (boss.bossId === 7 && boss.isInvuln) {
      const hue = (glowTimeS * 120) % 360;
      drawColor = `hsl(${hue}, 90%, 80%)`;
      drawGlow  = `hsl(${hue}, 100%, 90%)`;
    }
    if (boss.bossId === 8 && boss.isAbsorbing) {
      drawGlow = '#d090ff';
    }

    const ringCount = 1 + boss.phaseIndex;
    for (let r = 0; r < ringCount; r++) {
      const ringR = bossSize * (1.5 + r * 0.7 + pulseFactor * 0.4);
      ctx.globalAlpha = (0.15 - r * 0.04) * (0.6 + pulseFactor * 0.4);
      ctx.shadowBlur = ringR * 2; ctx.shadowColor = drawGlow;
      ctx.strokeStyle = drawGlow; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(boss.x, boss.y, ringR, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;

    const barW = bossSize * 5;
    const barH = 4;
    const barX = boss.x - barW / 2;
    const barY = boss.y - bossSize - 12;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#111'; ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = drawColor; ctx.fillRect(barX, barY, barW * (boss.hp / boss.maxHp), barH);
    ctx.globalAlpha = 0.5; ctx.fillStyle = '#ffffff';
    ctx.fillRect(barX + barW * BOSS_PHASE2_HP_RATIO - 0.5, barY, 1.5, barH);
    ctx.fillRect(barX + barW * BOSS_PHASE3_HP_RATIO - 0.5, barY, 1.5, barH);
    ctx.globalAlpha = 1;

    if (boss.maxShieldHp > 0) {
      const sBarY = barY - 6;
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#111'; ctx.fillRect(barX, sBarY, barW, 3);
      ctx.fillStyle = '#74c0fc'; ctx.fillRect(barX, sBarY, barW * (boss.shieldHp / boss.maxShieldHp), 3);
      ctx.globalAlpha = 1;
    }

    ctx.shadowBlur = bossSize * (4 + pulseFactor * 4); ctx.shadowColor = drawGlow;
    if (boss.bossId === 7 || boss.bossId === 10) {
      ctx.save();
      ctx.translate(boss.x, boss.y);
      ctx.rotate(Math.PI / 4 + glowTimeS * 0.3);
      ctx.fillStyle = drawColor;
      ctx.fillRect(-half * 0.85, -half * 0.85, bossSize * 0.85, bossSize * 0.85);
      ctx.restore();
    } else if (boss.bossId === 8) {
      ctx.fillStyle = drawColor;
      ctx.fillRect(Math.floor(boss.x - half), Math.floor(boss.y - half), Math.ceil(bossSize), Math.ceil(bossSize));
      ctx.shadowBlur = 0;
      for (let r = 1; r <= 3; r++) {
        const ringAlpha = boss.isAbsorbing ? 0.5 - r * 0.1 : 0.2 - r * 0.04;
        ctx.globalAlpha = Math.max(0, ringAlpha) * (0.7 + pulseFactor * 0.3);
        ctx.shadowBlur = 6; ctx.shadowColor = drawGlow;
        ctx.strokeStyle = drawGlow; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(boss.x, boss.y, bossSize * (0.9 + r * 0.55), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = drawColor;
      ctx.fillRect(Math.floor(boss.x - half), Math.floor(boss.y - half), Math.ceil(bossSize), Math.ceil(bossSize));
    }
    ctx.shadowBlur = 0;

    const pipRadius = 2;
    const pipSpacing = 8;
    const totalPips = 3;
    const pipsStartX = boss.x - (totalPips - 1) * pipSpacing / 2;
    const pipY = boss.y + half + 8;
    for (let p = 0; p < totalPips; p++) {
      const filled = p <= boss.phaseIndex;
      ctx.globalAlpha = filled ? 0.95 : 0.25;
      ctx.shadowBlur = filled ? 5 : 0; ctx.shadowColor = drawGlow;
      ctx.fillStyle = filled ? drawGlow : '#444';
      ctx.beginPath(); ctx.arc(pipsStartX + p * pipSpacing, pipY, pipRadius, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;

    if (boss.bossId === 7 && boss.isInvuln) {
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = drawGlow;
      ctx.font = '7px "Poiret One", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowBlur = 4; ctx.shadowColor = drawGlow;
      ctx.fillText('INVULN', boss.x, boss.y - half - 20);
      ctx.shadowBlur = 0; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function drawWaveClearBanner(): void {
    if (!isInterWave || currentWave === 0) return;
    const t = 1 - interWaveTimerMs / INTER_WAVE_DELAY_MS;
    const fadeIn  = Math.min(t / 0.15, 1);
    const fadeOut = t > 0.75 ? Math.max(0, 1 - (t - 0.75) / 0.15) : 1;
    const alpha   = fadeIn * fadeOut * 0.85;
    if (alpha < 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(10, 10, 18, 0.75)';
    ctx.fillRect(0, heightPx / 2 - 32, widthPx, 64);
    ctx.fillStyle = '#ffd764'; ctx.font = 'bold 14px "Poiret One", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowBlur = 8; ctx.shadowColor = '#ffe599';
    const isBoss = currentWave > 0 && currentWave % 100 === 0;
    const bannerText = isBoss
      ? `${BOSS_GLYPH_LABEL} ${currentWave / 100} Cleared!`
      : `Wave ${currentWave} Cleared!`;
    ctx.fillText(bannerText, widthPx / 2, heightPx / 2 - 8);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff172'; ctx.font = '10px "Poiret One", sans-serif';
    ctx.fillText('Next wave incoming\u2026', widthPx / 2, heightPx / 2 + 10);
    if (currentWave > 0 && currentWave % 10 === 0) {
      ctx.fillStyle = '#69db7c'; ctx.font = '9px "Poiret One", sans-serif';
      ctx.shadowBlur = 6; ctx.shadowColor = '#69db7c';
      ctx.fillText('✦ Checkpoint unlocked! See RPG Menu.', widthPx / 2, heightPx / 2 + 22);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

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
    drawBottomSafeZone();
    drawDanmakuSafeZone();
    drawBossProjectiles(ctx, bossProjectiles);
    drawBossEnemy();
    drawTeleportParticles(ctx, teleportParticles);
    drawShotLines(ctx, shotLines);
    drawVortexes();
    drawSandProjectiles(ctx, sandProjectiles);
    drawPoisonBolts(ctx, poisonBolts);
    drawLaserBeamEffect(ctx, laserBeamEffect);

    // Player comet trail — smoothly gated by glowMovementIntensity
    if (glowMovementIntensity > 0.02 && mote.trailCount >= 2) {
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
      ctx.globalAlpha = (0.18 + pulseT * 0.22) * glowDampeningFactor * pa;
      ctx.shadowBlur  = glowSize * 3; ctx.shadowColor = moteGlowColor; ctx.fillStyle = moteGlowColor;
      ctx.fillRect(Math.floor(mote.x - glowHalf), Math.floor(mote.y - glowHalf), Math.ceil(glowSize), Math.ceil(glowSize));
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      if (!iFrameFlicker) {
        ctx.globalAlpha = pa;
        ctx.shadowBlur  = RPG_MOTE_SIZE * 5; ctx.shadowColor = moteGlowColor; ctx.fillStyle = moteBodyColor;
        const mh = RPG_MOTE_SIZE / 2;
        ctx.fillRect(Math.floor(mote.x - mh), Math.floor(mote.y - mh), RPG_MOTE_SIZE, RPG_MOTE_SIZE);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
    }

    drawHitEffects(ctx, hitEffects);
    drawDamageNumbers(ctx, damageNumbers);
    if (deathParticles.length > 0) drawDeathParticles(ctx, deathParticles);

    // Draw weapon orbit particles, orbit projectile, and special weapon visuals above the player.
    if (rpgPhase === 'alive') {
      for (const p of weaponOrbitParticles) drawWeaponOrbitParticle(ctx, p);
      drawOrbitProjectile(ctx, orbitProjectile);
      for (const ws of chainWhipStates.values()) drawChainWhip(ws);
      drawSwordCombos();
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

    if (rpgPhase === 'alive') drawWaveClearBanner();

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
      updateEnemies(deltaMs, nowMs);
      updateSapphireEnemies(deltaMs, nowMs);
      updateSapphireMissiles(deltaMs);
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
      updateBossEnemy(deltaMs);
      updateBossProjectiles(deltaMs);
      updateTeleportParticles(teleportParticles, deltaMs);
      updateWeaponOrbitParticles(deltaMs);
      updateOrbitProjectile(deltaMs);
      updateSandProjectiles(deltaMs);
      // Update chain whip for all equipped chainWhip weapons
      for (const weaponId of rpgSimState.equippedWeaponIds) {
        const wd = WEAPON_BY_ID.get(weaponId);
        if (wd?.stats.effect?.kind === 'chainWhip') updateChainWhip(weaponId, deltaMs);
      }
      // Update vortex and sword combo systems
      for (const weaponId of rpgSimState.equippedWeaponIds) {
        const wd = WEAPON_BY_ID.get(weaponId);
        if (wd?.stats.effect?.kind === 'vortex')    updateVortexWeapon(weaponId, deltaMs);
        if (wd?.stats.effect?.kind === 'swordCombo') updateSwordCombo(weaponId, deltaMs);
      }
      updateVortexes(deltaMs);
      updatePoisonBolts(deltaMs);
      updatePoisonDebuffs(deltaMs);
      updateLaserBeamEffect(deltaMs);
      removeDeadEnemies();
      checkWaveCompletion();

      // ── Per-weapon auto-attack timers ─────────────────────────────
      for (const weaponId of rpgSimState.equippedWeaponIds) {
        const weaponDef = WEAPON_BY_ID.get(weaponId);
        // These weapon kinds manage their own timing.
        if (weaponDef?.stats.effect?.kind === 'chainWhip'  ||
            weaponDef?.stats.effect?.kind === 'vortex'     ||
            weaponDef?.stats.effect?.kind === 'swordCombo') continue;
        const tier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
        const cooldownMs = weaponDef
          ? getScaledWeaponCooldown(weaponDef.stats.cooldownMs, tier)
          : PLAYER_BASE_COOLDOWN_MS;
        const current = weaponAttackTimers.get(weaponId) ?? 0;
        const next = current - deltaMs;
        if (next <= 0) {
          weaponAttackTimers.set(weaponId, cooldownMs);
          performWeaponAttack(weaponId);
          removeDeadEnemies();
          checkWaveCompletion();
        } else {
          weaponAttackTimers.set(weaponId, next);
        }
      }
      // If no weapons equipped, use base attack with default cooldown
      if (rpgSimState.equippedWeaponIds.size === 0) {
        const current = weaponAttackTimers.get(BASE_ATTACK_TIMER_KEY) ?? 0;
        const next = current - deltaMs;
        if (next <= 0) {
          weaponAttackTimers.set(BASE_ATTACK_TIMER_KEY, PLAYER_BASE_COOLDOWN_MS);
          performWeaponAttack(BASE_ATTACK_TIMER_KEY);
          removeDeadEnemies();
          checkWaveCompletion();
        } else {
          weaponAttackTimers.set(BASE_ATTACK_TIMER_KEY, next);
        }
      }
      updateShotVisuals(deltaMs);
      updateDamageNumbers(deltaMs);

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
    },
  };
}
