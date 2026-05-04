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
  getRpgUpgradeLevel,
  getScaledWeaponCooldown,
  getLuckPercent,
  getEffectiveXpAtkBonus, getEffectiveXpDefBonus,
  getEffectiveXpLuckBonus, getEffectiveXpHpBonus,
} from '../../sim/rpg/rpg-state';
import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import { TIER_BY_ID } from '../../data/tiers';
import type { TierId } from '../../data/tiers';
import type { NumberFormat } from '../../util/format';
import { createRpgFluid } from './rpg-fluid';
import { createDamageFns } from './rpg-damage';
import { createRpgStatsPanel, type RpgStatsPanelHandle } from './rpg-stats-panel';
import {
  RPG_TRAIL_CAPACITY, RPG_MOTE_SIZE,
  MIN_TRAIL_DISTANCE,
  PLAYER_HP_INIT, PLAYER_ATK_INIT, PLAYER_DEF_INIT, PLAYER_REGEN_INIT,
  JOYSTICK_OUTER_RADIUS, JOYSTICK_THUMB_RADIUS,
  INTER_WAVE_DELAY_MS, DEATH_ANIM_DURATION_MS, DEATH_HOLD_DURATION_MS, RESTART_FADE_IN_MS,
  DEATH_BURST_COUNT, DEATH_PARTICLE_COLORS,
  PLAYER_BASE_COOLDOWN_MS, HIT_EFFECT_DURATION_MS,
  BASE_ATTACK_TIMER_KEY, SHOT_LINE_DURATION_MS, TARGET_FRAME_MS,
  DAMAGE_NUM_DURATION_MS, DAMAGE_NUM_MIN_FONT_PX, DAMAGE_NUM_MAX_FONT_PX,
  DAMAGE_NUM_INITIAL_SPEED, DAMAGE_NUM_DECEL, PLAYER_IFRAME_MIN_MS, PLAYER_IFRAME_MAX_ADD_MS, PLAYER_KNOCKBACK_MAX,
  WEAPON_PARTICLE_ORBIT_SPEED, WEAPON_PARTICLE_ORBIT_RADIUS, WEAPON_PARTICLE_MIN_SPEED,
  ORBIT_PROJ_RADIUS, ORBIT_PROJ_TRAIL_CAP,
  WEAPON_ORBIT_TRAIL_CAP,
  SWORD_COMBO_THRESHOLD,
  MAX_DANMAKU_LEVEL,
  BOSS_GLOW_COLORS,
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
  drawLaserEnemies, drawEnemyIndicators,
  setLowGraphicsMode as setEnemyLowGraphics,
} from './rpg-enemy-draw';
import {
  drawBossProjectiles,
  drawSandProjectiles,
  drawPoisonBolts,
  drawLaserBeamEffect,
  drawDeathParticles, drawShotLines, drawHitEffects, drawDamageNumbers,
  drawWeaponOrbitParticle, drawOrbitProjectile,
  drawEmeraldPlayerMissiles, drawEmeraldSubMissiles, drawEmeraldSwirlParticles, drawSunstoneMines,
  drawSapphireShips, drawSapphireLasers,
  drawAmethystShips, drawAmethystLasers,
  drawTargetReticle,
  drawPlayerMote,
  setLowGraphicsMode as setEntityLowGraphics,
} from './rpg-entity-draw';
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
} from './rpg-enemy-types';
import { makeBossEnemy } from './rpg-factories';
import { getSwordLength } from './rpg-helpers';
import { drawChainWhip, drawVortexes, drawSwordCombos, drawSandBladeCombo, spawnSandSwingPixels, updateSandDriftPixels, drawSandDriftPixels, setLowGraphicsMode as setWeaponLowGraphics } from './rpg-weapon-draw';
import { createWaveManager, type WaveManagerHandle } from './rpg-wave-manager';
import {
  updateLuckyMotes, updateLuckyMotePopups,
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
import { updateOrbitProjectile, type OrbitProjectileCtx } from './rpg-orbit-projectile';
import {
  updatePlayerMovement,
  type PlayerMovementCtx,
  type PlayerMovementState,
} from './rpg-player-movement';
import { createRpgInput } from './rpg-input';

// ── Dynamic internal resolution ───────────────────────────────────
// These are updated by resize() to match the container's client dimensions.
// The default values kick in before the first resize() call.
let INTERNAL_WIDTH  = 320;
let INTERNAL_HEIGHT = 568;

export interface RpgRender {
  canvas: HTMLCanvasElement;
  statsPanel: HTMLElement;
  /** Container inside the right column of the stats panel where the RPG menu button should be appended. */
  menuButtonContainer: HTMLElement;
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
  /** Update the number-format setting used to render stat values in the stats panel. */
  setNumberFormat(format: NumberFormat): void;
  /** Show or hide dev-mode numerical designators on each RPG stats panel box. */
  setDevMode(enabled: boolean): void;
}

/** Options passed to createRpgRender. */
export interface RpgRenderOptions {
  /**
   * Called when the player collects a lucky mote drop.
   * @param tierId  The mote tier that was collected.
   * @param bonusPct  The percentage bonus to apply to that tier's mote total (e.g. 0.5 = +0.5%).
   */
  onLuckyMoteCollected?: (tierId: TierId, bonusPct: number) => void;
  /**
   * Called when the player triggers an error interaction (e.g. attempting
   * to add a 4th XP wire).  Callers should play the error SFX.
   */
  onError?: () => void;
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
  let currentNumberFormat: NumberFormat = 'letters';

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
  const playerStats: RpgPlayerStats = { hp: PLAYER_HP_INIT, maxHp: PLAYER_HP_INIT, atk: PLAYER_ATK_INIT, def: PLAYER_DEF_INIT, regen: PLAYER_REGEN_INIT };

  // ── Player movement state (managed by rpg-player-movement.ts) ──
  const playerMovementState: PlayerMovementState = {
    glowMovementIntensity: 0,
    playerAimAngle: -Math.PI / 2,  // default: upward
  };

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

  // ── Lucky mote drops (luck mechanic) ─────────────────────────
  const luckyMotes: LuckyMote[] = [];
  const luckyMotePopups: LuckyMotePopup[] = [];

  // ── Wave canvas overlay (top-left wave number display) ────────
  /** Alpha for the top-left wave text; dims toward 0.30 when entities overlap it. */
  let waveOverlapAlpha = 1.0;

  /**
   * Cached luck percentage — updated whenever XP changes.
   * Avoids calling Math.log10 on every enemy death in hot combat.
   */
  let _cachedLuckXp = -1;
  let _cachedLuckPct = 0;

  function getCachedLuckPercent(): number {
    if (rpgSimState.xp !== _cachedLuckXp) {
      _cachedLuckXp = rpgSimState.xp;
      _cachedLuckPct = getLuckPercent(rpgSimState.xp) + getEffectiveXpLuckBonus(rpgSimState);
    }
    return _cachedLuckPct;
  }

  /** The currently targeted enemy object, or null for automatic targeting.
   *  State is now private to `createRpgTargeting` (rpg-targeting.ts).
   *  Access via `targeting.getTargetedEnemy()` — never read directly here. */
  // targetedEnemy state has moved into createRpgTargeting (rpg-targeting.ts).

  // ── DPS tracking ── forwarded to statsPanel after it is created below
  // statsPanel is declared with ! assertion; initialized during setup before any call-site runs.
  let statsPanel!: RpgStatsPanelHandle;
  let weaponSystems!: RpgWeaponHandle;
  let waveManager!: WaveManagerHandle;
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

  let targeting!: RpgTargetingHandle;
  let playerAttackCtx!: RpgPlayerAttackCtx;

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
    // Remove any entry that was injected by enterBossWave but was not in the
    // pre-fight snapshot (e.g. the temporary diamond_bastion tier-1 entry added
    // for bosses the player has never purchased).
    for (const id of Array.from(rpgSimState.weaponTiersByWeaponId.keys())) {
      if (!bossPreWaveWeaponTiers.has(id)) rpgSimState.weaponTiersByWeaponId.delete(id);
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
    // Regen is a fixed base value (weapon/XP bonuses can be added here in future).
    playerStats.regen = PLAYER_REGEN_INIT;
    // Player ATK is the base multiplier (not including per-weapon tier damage).
    playerStats.atk = PLAYER_ATK_INIT + getEffectiveXpAtkBonus(rpgSimState);
    // Bonus max-HP from XP wired to HP stat.
    const hpBonus = getEffectiveXpHpBonus(rpgSimState);
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
          boss.danmakuLevel = Math.min(boss.danmakuLevel + 1, MAX_DANMAKU_LEVEL);
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
  function findClosestTarget(rangeSq: number): ClosestTarget | null { return targeting.findClosestTarget(rangeSq); }

  /** Returns the closest enemy body (not projectiles) within rangeSq. */
  function findClosestEnemy(rangeSq: number): LaserEnemy | SapphireEnemy | EmeraldEnemy | AmberEnemy | VoidEnemy
    | QuartzEnemy | RubyEnemy | SunstoneEnemy | CitrineEnemy | IoliteEnemy | AmethystEnemy | DiamondEnemy | NullstoneEnemy
    | FracterylEnemy | EigensteinEnemy | BossEnemy | null { return targeting.findClosestEnemy(rangeSq); }

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

  function collectEnemyBodyTargets(): ClosestTarget[] { return targeting.collectEnemyBodyTargets(); }

  function findClosestEnemyFrom(x: number, y: number, rangeSq: number): ClosestTarget | null { return targeting.findClosestEnemyFrom(x, y, rangeSq); }

  function damageBodyTarget(target: ClosestTarget, rawDamage: number, defPierceRatio: number, bypassShield: boolean): number { return targeting.damageBodyTarget(target, rawDamage, defPierceRatio, bypassShield); }

  // ── Weapon systems (extracted to rpg-weapon-systems.ts) ──────────
  // weaponCtx and weaponSystems are initialized below after all helper
  // functions have been defined (see "Create weapon systems" section).


  function performWeaponAttack(weaponId: string): void {
    _performWeaponAttack(playerAttackCtx, weaponId);
  }

  /** Removes any enemies whose HP has reached zero or below, awarding XP for each. */
  function removeDeadEnemies(): void { waveManager.removeDeadEnemies(); }
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

  // ── Create targeting system ───────────────────────────────────
  targeting = createRpgTargeting({
    mote,
    get bossEnemy() { return bossEnemy; },
    enemies, sapphireEnemies, sapphireMissiles, emeraldEnemies,
    amberEnemies, amberShards, voidEnemies, quartzEnemies, quartzSpikes,
    rubyEnemies, rubyBolts, sunstoneEnemies, citrineEnemies, citrineBolts,
    ioliteEnemies, amethystEnemies, amethystShards, diamondEnemies, diamondShards,
    nullstoneEnemies, voidTendrils, fracterylEnemies, fracterylShards, eigensteinEnemies,
    damageEnemy, damageSapphireEnemy, damageMissile,
    damageEmeraldEnemy, damageAmberEnemy, damageAmberShard,
    damageVoidEnemy, damageQuartzEnemy, damageQuartzSpike,
    damageRubyEnemy, damageRubyBolt, damageSunstoneEnemy,
    damageCitrineEnemy, damageCitrineBolt, damageIoliteEnemy,
    damageAmethystEnemy, damageAmethystShard, damageDiamondEnemy,
    damageDiamondShard, damageNullstoneEnemy, damageVoidTendril,
    damageFracterylEnemy, damageFracterylShard, damageEigensteinEnemy,
    damageBossEnemy: (raw, pierce, fromDiamond) => damageBossEnemy(raw, pierce, fromDiamond),
  });

  // ── Create wave manager ────────────────────────────────────────
  // All helper functions referenced in waveManagerCtx are function declarations
  // and are hoisted, so this is safe even though they appear later in the file.
  waveManager = createWaveManager({
    dim,
    mote,
    rpgSimState,
    enemies, sapphireMissiles, sapphireEnemies, emeraldEnemies,
    amberEnemies, amberShards, voidEnemies, quartzEnemies, quartzSpikes,
    rubyEnemies, rubyBolts, sunstoneEnemies, citrineEnemies, citrineBolts,
    ioliteEnemies, amethystEnemies, amethystShards, diamondEnemies, diamondShards,
    nullstoneEnemies, voidTendrils, fracterylEnemies, fracterylShards, eigensteinEnemies,
    bossProjectiles, spawnQueue, luckyMotes, fluid,
    getCachedLuckPercent,
    applyEquipmentStats: () => applyEquipmentStats(),
    spawnDamageNumber:   (x, y, vx, vy, text, ratio, color) => spawnDamageNumber(x, y, vx, vy, text, ratio, color),
    getBossEnemy:            () => bossEnemy,
    setBossEnemy:            (b) => { bossEnemy = b; },
    getIsBossFightFromMenu:  () => isBossFightFromMenu,
    setIsBossFightFromMenu:  (b) => { isBossFightFromMenu = b; },
    getCurrentWave:          () => currentWave,
    setCurrentWave:          (w) => { currentWave = w; },
    getIsInterWave:          () => isInterWave,
    setIsInterWave:          (b) => { isInterWave = b; },
    setInterWaveTimerMs:     (ms) => { interWaveTimerMs = ms; },
    enterBossWave:           () => enterBossWave(),
    exitBossWave:            () => exitBossWave(),
  });

  // ── Create weapon systems ──────────────────────────────────────
  // All helper functions referenced in weaponCtx are function declarations
  // and are hoisted, so this is safe even though they appear later in the file.
  const weaponCtx: RpgWeaponCtx = {
    dim,
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
    damageEnemy, damageSapphireEnemy, damageMissile,
    damageEmeraldEnemy, damageAmberEnemy, damageAmberShard,
    damageVoidEnemy, damageQuartzEnemy, damageQuartzSpike,
    damageRubyEnemy, damageRubyBolt, damageSunstoneEnemy,
    damageCitrineEnemy, damageCitrineBolt, damageIoliteEnemy,
    damageAmethystEnemy, damageAmethystShard, damageDiamondEnemy,
    damageDiamondShard, damageNullstoneEnemy, damageVoidTendril,
    damageFracterylEnemy, damageFracterylShard, damageEigensteinEnemy,
    damageBossEnemy:      (raw, pierce, fromDiamond) => damageBossEnemy(raw, pierce, fromDiamond),
    spawnHitVisuals:      (enemy, dmg, color) => spawnHitVisuals(enemy, dmg, color),
    spawnHitVisualsAt:    (x, y, maxHp, dmg, color) => spawnHitVisualsAt(x, y, maxHp, dmg, color),
    fluid,
    findClosestTarget:    (rangeSq) => findClosestTarget(rangeSq),
    spawnSandProjectile:  (tx, ty, dmg) => weaponSystems.spawnSandProjectile(tx, ty, dmg),
    spawnPoisonBolt:      (tx, ty, wid, tier, dmg) => weaponSystems.spawnPoisonBolt(tx, ty, wid, tier, dmg),
    spawnEmeraldMissile:  (tx, ty, dmg, tier) => weaponSystems.spawnEmeraldMissile(tx, ty, dmg, tier),
    fireLaserBeam:        (tx, ty, wid) => weaponSystems.fireLaserBeam(tx, ty, wid),
    layMine:              (dmg, tier) => weaponSystems.layMine(dmg, tier),
  };

  statsPanel = createRpgStatsPanel({
    rpgSimState,
    playerStats,
    getCurrentWave: () => currentWave,
    getEffectiveEquippedIds,
    getNumberFormat: () => currentNumberFormat,
    onXpWireConnect: (stat) => {
      // Seed the stat's XP pool with the current total so the bonus starts
      // from the player's accumulated XP rather than 0.
      if (stat === 'atk')       rpgSimState.xpAllocatedToAtk  = rpgSimState.xp;
      else if (stat === 'def')  rpgSimState.xpAllocatedToDef  = rpgSimState.xp;
      else if (stat === 'luck') rpgSimState.xpAllocatedToLuck = rpgSimState.xp;
      else if (stat === 'hp')   rpgSimState.xpAllocatedToHp   = rpgSimState.xp;
      // Wiring changes xpAllocatedStats (and possibly luck),
      // so the cached luck % is stale even though rpgSimState.xp didn't change.
      _cachedLuckXp = -1;
      applyEquipmentStats();
    },
    onXpWireDisconnect: () => {
      _cachedLuckXp = -1;
      applyEquipmentStats();
    },
    onError: () => { options.onError?.(); },
  });
  _forwardRecordDps = (dmg, color) => statsPanel.recordDps(dmg, color);

  // ── Player movement context (wired to rpg-player-movement.ts) ───
  const movementCtx: PlayerMovementCtx = {
    mote,
    joystick,
    keys,
    dim,
    enemies, sapphireEnemies, emeraldEnemies, amberEnemies,
    voidEnemies, quartzEnemies, rubyEnemies, sunstoneEnemies,
    citrineEnemies, ioliteEnemies, amethystEnemies, diamondEnemies,
    nullstoneEnemies, fracterylEnemies, eigensteinEnemies,
    get bossEnemy()         { return bossEnemy; },
    get isBossWaveActive()  { return isBossWaveActive; },
    get autoMoveEnabled()   { return _autoMoveEnabled; },
    rpgSimState,
    getEffectiveEquippedIds,
    fluid,
  };

  // ── Orbit projectile context (wired to rpg-orbit-projectile.ts) ─
  const orbitProjectileCtx: OrbitProjectileCtx = {
    mote,
    get bossEnemy() { return bossEnemy; },
    enemies, sapphireEnemies, sapphireMissiles, emeraldEnemies,
    amberEnemies, amberShards, voidEnemies, quartzEnemies,
    rubyEnemies, sunstoneEnemies, citrineEnemies, ioliteEnemies,
    amethystEnemies, diamondEnemies, nullstoneEnemies,
    fracterylEnemies, eigensteinEnemies,
    hitEffects,
    damageEnemy, damageSapphireEnemy, damageMissile,
    damageEmeraldEnemy, damageAmberEnemy, damageAmberShard,
    damageVoidEnemy, damageQuartzEnemy, damageRubyEnemy,
    damageSunstoneEnemy, damageCitrineEnemy, damageIoliteEnemy,
    damageAmethystEnemy, damageDiamondEnemy, damageNullstoneEnemy,
    damageFracterylEnemy, damageEigensteinEnemy,
    damageBossEnemy: (raw, pierce) => damageBossEnemy(raw, pierce),
    spawnDamageNumber: (x, y, vx, vy, text, ratio, color) => spawnDamageNumber(x, y, vx, vy, text, ratio, color),
  };

  createRpgInput({
    canvas,
    dim,
    joystick,
    keys,
    getIsActive: () => _isActive,
    tryTargetEnemyAt,
  });

  /** Keeps an enemy within the arena, bouncing velocity. Uses a fixed margin of 2.5px. */
  function clampEnemyToBounds(enemy: { x: number; y: number; vx: number; vy: number }): void {
    const half = 2.5; // Conservative margin that works for all enemy sizes
    if (enemy.x < half)            { enemy.x = half;            enemy.vx =  Math.abs(enemy.vx) * 0.5; }
    if (enemy.x > widthPx  - half) { enemy.x = widthPx  - half; enemy.vx = -Math.abs(enemy.vx) * 0.5; }
    if (enemy.y < half)            { enemy.y = half;            enemy.vy =  Math.abs(enemy.vy) * 0.5; }
    if (enemy.y > heightPx - half) { enemy.y = heightPx - half; enemy.vy = -Math.abs(enemy.vy) * 0.5; }
  }

  function startNextWave(): void { waveManager.startNextWave(); }
  function checkWaveCompletion(): void { waveManager.checkWaveCompletion(); }
  function tickSpawnQueue(deltaMs: number): void { waveManager.tickSpawnQueue(deltaMs); }
  /** Flag set at the start of each update() call; drives auto-move logic. */
  let _autoMoveEnabled = false;

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

  /**
   * Applies raw enemy ATK damage to the player after blocking a percentage equal
   * to playerStats.def (e.g. def=5 blocks 5 % of incoming damage),
   * subject to iframes. Mutates playerStats.hp and playerIFramesMs.
   */
  function dealDamageToPlayer(atkValue: number): void {
    if (playerIFramesMs > 0) return;
    const dmg = Math.max(0, atkValue * (1 - Math.min(100, playerStats.def) / 100));
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
   * @param atkValue - raw attack value (defence percentage applied internally)
   * @param normDirX - normalised knockback / damage-number direction X
   * @param normDirY - normalised knockback / damage-number direction Y
   */
  function dealDamageToPlayerKnockback(atkValue: number, normDirX: number, normDirY: number): void {
    if (playerIFramesMs > 0) return;
    const dmg = Math.max(0, atkValue * (1 - Math.min(100, playerStats.def) / 100));
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
    deathParticles.length = 0; playerMovementState.glowMovementIntensity = 0;
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

    drawLaserEnemies(ctx, enemies, nowMs);
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
    drawEnemyIndicators(ctx, enemyIndicatorStyle,
      enemies, sapphireEnemies, emeraldEnemies, amberEnemies, voidEnemies,
      quartzEnemies, rubyEnemies, sunstoneEnemies, citrineEnemies, ioliteEnemies,
      amethystEnemies, diamondEnemies, nullstoneEnemies, fracterylEnemies, eigensteinEnemies,
      bossEnemy);

    drawPlayerMote(ctx, mote, playerMovementState.glowMovementIntensity, rpgPhase, deathAlpha, glowTimeS, playerIFramesMs);

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
      const effectiveEquippedIds = getEffectiveEquippedIds();
      // Only draw equipped weapon combos with prismatic colors when weapons are present.
      if (effectiveEquippedIds.size > 0) {
        drawSwordCombos(ctx, weaponSystems.swordComboStates, mote, rpgSimState.weaponTiersByWeaponId);
      }
      // Draw the sand blade when no weapon is equipped.
      if (effectiveEquippedIds.size === 0) {
        drawSandBladeCombo(ctx, weaponSystems.swordComboStates.get(BASE_ATTACK_TIMER_KEY), mote);
        drawSandDriftPixels(ctx);
      }
      // ── Companion ships and lasers ────────────────────────────────
      drawSapphireShips(ctx, weaponSystems.sapphireShips);
      drawSapphireLasers(ctx, weaponSystems.sapphireLasers);
      drawAmethystShips(ctx, weaponSystems.amethystShips);
      drawAmethystLasers(ctx, weaponSystems.amethystLasers);
      // ── Target reticle ────────────────────────────────────────────
      const te = targeting.getTargetedEnemy();
      if (te) {
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

    // ── Top-left wave number overlay ──────────────────────────────
    if (currentWave > 0) {
      // Check if any enemy or player is near the top-left corner region
      const TL_X = 190, TL_Y = 55;
      let anyOverlap = false;
      const moteNear = mote.x < TL_X && mote.y < TL_Y;
      if (moteNear) {
        anyOverlap = true;
      } else {
        for (const e of enemies) {
          if (e.x < TL_X && e.y < TL_Y) { anyOverlap = true; break; }
        }
        if (!anyOverlap) {
          for (const e of sapphireEnemies) {
            if (e.x < TL_X && e.y < TL_Y) { anyOverlap = true; break; }
          }
        }
        if (!anyOverlap) {
          for (const e of emeraldEnemies) {
            if (e.x < TL_X && e.y < TL_Y) { anyOverlap = true; break; }
          }
        }
      }
      const targetAlpha = anyOverlap ? 0.30 : 1.0;
      waveOverlapAlpha += (targetAlpha - waveOverlapAlpha) * 0.1;

      ctx.save();
      ctx.globalAlpha = waveOverlapAlpha;
      ctx.font = 'bold 22px monospace';
      ctx.fillStyle = '#fff172';
      ctx.fillText('Wave: x' + currentWave, 8, 30);
      ctx.restore();
    }

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
    menuButtonContainer: statsPanel.menuButtonContainer,

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

      updatePlayerMovement(movementCtx, playerMovementState, deltaMs);
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
      updateOrbitProjectile(orbitProjectileCtx, orbitProjectile, deltaMs);
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
        // Detect new sand blade swing start and spawn drift pixels.
        const sandState = weaponSystems.swordComboStates.get(BASE_ATTACK_TIMER_KEY);
        if (sandState) {
          if (sandState.phase === 'swing' && prevSandBladePhase !== 'swing') {
            spawnSandSwingPixels(mote.x, mote.y, sandState.swipeArcStart, sandState.swipeArcEnd, getSwordLength(1));
          }
          prevSandBladePhase = sandState.phase;
        }
        updateSandDriftPixels(deltaMs);
      }
      updateShotVisuals(deltaMs);
      updateDamageNumbers(deltaMs);
      updateLuckyMotes(luckyMotes, luckyMotePopups, mote.x, mote.y, deltaMs, options.onLuckyMoteCollected ?? (() => {}));
      updateLuckyMotePopups(luckyMotePopups, deltaMs);

      // Apply HP regen: regenerate regen% of maxHp per second when alive.
      if (rpgPhase === 'alive' && playerStats.hp > 0 && playerStats.hp < playerStats.maxHp) {
        playerStats.hp = Math.min(
          playerStats.maxHp,
          playerStats.hp + (playerStats.regen / 100) * playerStats.maxHp * (deltaMs / 1000),
        );
      }

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

    setNumberFormat(format: NumberFormat): void {
      currentNumberFormat = format;
    },

    setDevMode(enabled: boolean): void {
      statsPanel.setDevMode(enabled);
    },
  };
}
