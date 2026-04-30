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
  getLuckPercent,
  addXpWithAllocation, getEffectiveXpAtkBonus, getEffectiveXpDefBonus,
} from '../../sim/rpg/rpg-state';
import { getWaveDefinition } from '../../data/rpg/wave-definitions';
import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import { TIER_BY_ID } from '../../data/tiers';
import type { TierId } from '../../data/tiers';
import { createRpgFluid } from './rpg-fluid';
import { createDamageFns } from './rpg-damage';
import { createRpgStatsPanel, type RpgStatsPanelHandle } from './rpg-stats-panel';
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
  SWORD_COMBO_THRESHOLD,
  BOSS_SIZE_BASE,
  BOSS_GLOW_COLORS,
  FLUID_VEL_FRAME_TO_PX_S, FLUID_PLAYER_STRENGTH,
  FLUID_EXPLOSION_STRENGTH,
  FLUID_LASER_R, FLUID_LASER_G, FLUID_LASER_B,
  FLUID_SAPPH_R, FLUID_SAPPH_G, FLUID_SAPPH_B,
  FLUID_PLAYER_R, FLUID_PLAYER_G, FLUID_PLAYER_B,
  FLUID_MISSILE_R, FLUID_MISSILE_G, FLUID_MISSILE_B,
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
} from './rpg-constants';
import {
  EMERALD_ENEMY_SIZE, EMERALD_ENEMY_GLOW,
  AMBER_ENEMY_SIZE, AMBER_ENEMY_GLOW,
  VOID_ENEMY_SIZE, VOID_ENEMY_GLOW,
  QUARTZ_ENEMY_SIZE, QUARTZ_ENEMY_GLOW,
  RUBY_ENEMY_SIZE, RUBY_ENEMY_GLOW,
  SUNSTONE_ENEMY_SIZE, SUNSTONE_ENEMY_GLOW,
  CITRINE_ENEMY_SIZE, CITRINE_ENEMY_GLOW,
  IOLITE_ENEMY_SIZE, IOLITE_ENEMY_GLOW,
  AMETHYST_ENEMY_SIZE, AMETHYST_ENEMY_GLOW,
  DIAMOND_ENEMY_SIZE, DIAMOND_ENEMY_GLOW,
  NULLSTONE_ENEMY_SIZE, NULLSTONE_ENEMY_GLOW,
  LASER_XP_MULT, SAPPHIRE_XP_MULT, EMERALD_XP_MULT, AMBER_XP_MULT, VOID_XP_MULT,
  QUARTZ_XP_MULT, RUBY_XP_MULT, SUNSTONE_XP_MULT, CITRINE_XP_MULT,
  IOLITE_XP_MULT, AMETHYST_XP_MULT, DIAMOND_XP_MULT, NULLSTONE_XP_MULT,
  FRACTERYL_ENEMY_GLOW,
  FRACTERYL_ENEMY_SIZE,
  EIGENSTEIN_ENEMY_GLOW,
  EIGENSTEIN_ENEMY_SIZE,
  FRACTERYL_XP_MULT, EIGENSTEIN_XP_MULT,
} from './rpg-enemy-constants';
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
  SapphireEnemy, SapphireMissile,
  ClosestTarget, TargetKind,
} from './rpg-types';
import { createRpgWeaponSystems, type RpgWeaponCtx, type RpgWeaponHandle } from './rpg-weapon-systems';
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
} from './rpg-enemy-types';
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
import { getSwordLength } from './rpg-helpers';
import { drawChainWhip, drawVortexes, drawSwordCombos, drawSandBladeCombo, setLowGraphicsMode as setWeaponLowGraphics } from './rpg-weapon-draw';
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

  // ── DPS tracking ── forwarded to statsPanel after it is created below
  // statsPanel is declared with ! assertion; initialized during setup before any call-site runs.
  let statsPanel!: RpgStatsPanelHandle;
  let weaponSystems!: RpgWeaponHandle;
  let _forwardRecordDps: (dmg: number, _legacyColor?: string) => void = () => {};
  function recordDps(dmg: number, _legacyColor?: string): void {
    _forwardRecordDps(dmg, _legacyColor);
  }

  function findEquippedWeaponIdByEffect(effectKind: string): string | null {
    for (const weaponId of getEffectiveEquippedIds()) {
      const wd = WEAPON_BY_ID.get(weaponId);
      if (wd?.stats.effect?.kind === effectKind) return weaponId;
    }
    return null;
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

    orbitProjectile = buildOrbitProjectile();
    weaponSystems.syncSapphireShips();
    weaponSystems.syncAmethystShips();
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

  // ── Weapon systems (extracted to rpg-weapon-systems.ts) ──────────
  // weaponCtx and weaponSystems are initialized below after all helper
  // functions have been defined (see "Create weapon systems" section).


  function performWeaponAttack(weaponId: string): void {
    const weaponDef  = WEAPON_BY_ID.get(weaponId);

    // Sunstone mines can always be placed (no target needed).
    if (weaponDef?.stats.effect?.kind === 'sunstoneMine') {
      const tier       = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
      const rawDamage  = weaponDef
        ? getScaledWeaponDamage(weaponDef.stats.damage, tier, playerStats.atk)
        : playerStats.atk;
      weaponSystems.layMine(rawDamage, tier);
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
      if (target) weaponSystems.spawnSandProjectile(target.x, target.y, rawDamage);
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
      if (target) weaponSystems.spawnPoisonBolt(target.x, target.y, weaponId, tier, rawDamage);
      return;
    }

    // ── Emerald heat-seeking missile ───────────────────────────
    if (effect.kind === 'emeraldMissile') {
      const target = findClosestTarget(range * range);
      if (target) weaponSystems.spawnEmeraldMissile(target.x, target.y, rawDamage, tier);
      return;
    }

    // ── Ruby laser beam ────────────────────────────────────────
    if (effect.kind === 'laserBeam') {
      const target = findClosestTarget(range * range);
      if (target) weaponSystems.fireLaserBeam(target.x, target.y, weaponId);
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

  // ── Create weapon systems ──────────────────────────────────────
  // All helper functions referenced in weaponCtx are function declarations
  // and are hoisted, so this is safe even though they appear later in the file.
  const weaponCtx: RpgWeaponCtx = {
    dim,
    mote,
    get bossEnemy()       { return bossEnemy; },
    get playerAimAngle()  { return playerAimAngle; },
    hitEffects,
    rpgSimState,
    playerStats,
    fluid,
    getEffectiveEquippedIds,
    findEquippedWeaponIdByEffect,
    getCachedLuckPercent,
    damageEnemy, damageSapphireEnemy, damageMissile,
    damageEmeraldEnemy, damageAmberEnemy, damageAmberShard,
    damageVoidEnemy, damageQuartzEnemy, damageQuartzSpike,
    damageRubyEnemy, damageRubyBolt, damageSunstoneEnemy,
    damageCitrineEnemy, damageCitrineBolt, damageIoliteEnemy,
    damageAmethystEnemy, damageAmethystShard, damageDiamondEnemy,
    damageDiamondShard, damageNullstoneEnemy, damageVoidTendril,
    damageFracterylEnemy, damageFracterylShard, damageEigensteinEnemy,
    damageBossEnemy:         (raw, pierce, fromDiamond) => damageBossEnemy(raw, pierce, fromDiamond),
    findClosestTarget:       (rangeSq) => findClosestTarget(rangeSq),
    findClosestEnemy:        (rangeSq) => findClosestEnemy(rangeSq),
    collectEnemyBodyTargets: () => collectEnemyBodyTargets(),
    findClosestEnemyFrom:    (px, py, rangeSq) => findClosestEnemyFrom(px, py, rangeSq),
    getTargetedEnemy:        () => getTargetedEnemy(),
    damageBodyTarget:        (t, raw, pierce, bypass) => damageBodyTarget(t, raw, pierce, bypass),
    spawnDamageNumber:       (x, y, vx, vy, text, ratio, color) => spawnDamageNumber(x, y, vx, vy, text, ratio, color),
    spawnHitVisuals:         (enemy, dmg, color) => spawnHitVisuals(enemy, dmg, color),
    spawnHitVisualsAt:       (tx, ty, maxHp, dmg, color) => spawnHitVisualsAt(tx, ty, maxHp, dmg, color),
    removeDeadEnemies:       () => removeDeadEnemies(),
    checkWaveCompletion:     () => checkWaveCompletion(),
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
  };
  weaponSystems = createRpgWeaponSystems(weaponCtx);

  statsPanel = createRpgStatsPanel({
    rpgSimState,
    playerStats,
    getCurrentWave: () => currentWave,
    getEffectiveEquippedIds,
    onXpWireLock: (stat) => {
      if (stat === 'atk') rpgSimState.xpAllocatedToAtk = rpgSimState.xp;
      else                rpgSimState.xpAllocatedToDef = rpgSimState.xp;
      applyEquipmentStats();
    },
  });
  _forwardRecordDps = (dmg, color) => statsPanel.recordDps(dmg, color);

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
    weaponSystems.reset();
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
    drawVortexes(ctx, weaponSystems.activeVortexes);
    drawSandProjectiles(ctx, weaponSystems.sandProjectiles);
    drawPoisonBolts(ctx, weaponSystems.poisonBolts);
    drawEmeraldPlayerMissiles(ctx, weaponSystems.emeraldPlayerMissiles);
    drawEmeraldSubMissiles(ctx, weaponSystems.emeraldSubMissiles);
    drawEmeraldSwirlParticles(ctx, weaponSystems.emeraldSwirlParticles);
    drawSunstoneMines(ctx, weaponSystems.sunstoneMines);
    drawLaserBeamEffect(ctx, weaponSystems.laserBeamEffect);
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
      for (const ws of weaponSystems.chainWhipStates.values()) drawChainWhip(ctx, ws);
      drawSwordCombos(ctx, weaponSystems.swordComboStates, mote, rpgSimState.weaponTiersByWeaponId);
      // Draw the sand blade when no weapon is equipped.
      if (getEffectiveEquippedIds().size === 0) {
        drawSandBladeCombo(ctx, weaponSystems.swordComboStates.get(BASE_ATTACK_TIMER_KEY), mote);
      }
      // ── Companion ships and lasers ────────────────────────────────
      drawSapphireShips(ctx, weaponSystems.sapphireShips);
      drawSapphireLasers(ctx, weaponSystems.sapphireLasers);
      drawAmethystShips(ctx, weaponSystems.amethystShips);
      drawAmethystLasers(ctx, weaponSystems.amethystLasers);
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
    statsPanel: statsPanel.element,

    update(deltaMs: number, autoMoveEnabled = false): void {
      const nowMs = performance.now();
      glowTimeS += deltaMs / 1000;
      _autoMoveEnabled = autoMoveEnabled;

      if (rpgPhase === 'dying') {
        updateDying(deltaMs);
        fluid.step(deltaMs);
        draw(nowMs);
        statsPanel.update();
        return;
      }
      if (rpgPhase === 'restarting') {
        updateRestarting(deltaMs);
        fluid.step(deltaMs);
        draw(nowMs);
        statsPanel.update();
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
      statsPanel.withDamageSource(findEquippedWeaponIdByEffect('gatling'), () => weaponSystems.updateSandProjectiles(deltaMs));
      // Update chain whip for all equipped chainWhip weapons
      for (const weaponId of getEffectiveEquippedIds()) {
        const wd = WEAPON_BY_ID.get(weaponId);
        if (wd?.stats.effect?.kind === 'chainWhip') statsPanel.withDamageSource(weaponId, () => weaponSystems.updateChainWhip(weaponId, deltaMs));
      }
      // Update vortex and sword combo systems
      for (const weaponId of getEffectiveEquippedIds()) {
        const wd = WEAPON_BY_ID.get(weaponId);
        if (wd?.stats.effect?.kind === 'vortex')    statsPanel.withDamageSource(weaponId, () => weaponSystems.updateVortexWeapon(weaponId, deltaMs));
        if (wd?.stats.effect?.kind === 'swordCombo') statsPanel.withDamageSource(weaponId, () => weaponSystems.updateSwordCombo(weaponId, deltaMs));
      }
      statsPanel.withDamageSource(findEquippedWeaponIdByEffect('vortex'), () => weaponSystems.updateVortexes(deltaMs));
      statsPanel.withDamageSource(findEquippedWeaponIdByEffect('poisonBolt'), () => {
        weaponSystems.updatePoisonBolts(deltaMs);
        weaponSystems.updatePoisonDebuffs(deltaMs);
      });
      statsPanel.withDamageSource(findEquippedWeaponIdByEffect('emeraldMissile'), () => {
        weaponSystems.updateEmeraldPlayerMissiles(deltaMs);
        weaponSystems.updateEmeraldSubMissiles(deltaMs);
      });
      weaponSystems.updateEmeraldSwirlParticles(deltaMs);
      statsPanel.withDamageSource(findEquippedWeaponIdByEffect('sunstoneMine'), () => weaponSystems.updateSunstoneMines(deltaMs));
      weaponSystems.updateLaserBeamEffect(deltaMs);
      // ── Companion ship systems ────────────────────────────────────
      weaponSystems.updateSapphireShips(deltaMs);
      weaponSystems.updateSapphireLasers(deltaMs);
      weaponSystems.updateAmethystShips(deltaMs);
      weaponSystems.updateAmethystLasers(deltaMs);
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
          statsPanel.withDamageSource(weaponId, () => performWeaponAttack(weaponId));
          removeDeadEnemies();
          checkWaveCompletion();
        } else {
          weaponAttackTimers.set(weaponId, next);
        }
      }
      // If no weapons equipped, the sand blade handles its own swing timing.
      if (getEffectiveEquippedIds().size === 0) {
        weaponSystems.updateSandBlade(deltaMs);
      }
      updateShotVisuals(deltaMs);
      updateDamageNumbers(deltaMs);
      updateLuckyMotes(luckyMotes, luckyMotePopups, mote.x, mote.y, deltaMs, options.onLuckyMoteCollected ?? (() => {}));
      updateLuckyMotePopups(luckyMotePopups, deltaMs);

      if (playerStats.hp <= 0) triggerDeath();
      statsPanel.update();
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
      weaponSystems.syncSapphireShips();
      weaponSystems.syncAmethystShips();
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
