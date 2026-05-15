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
  getLuckPercent,
  getEffectiveXpAtkBonus, getEffectiveXpDefBonus,
  getEffectiveXpLuckBonus, getEffectiveXpHpBonus,
} from '../../sim/rpg/rpg-state';
import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import type { NumberFormat } from '../../util/format';
import type { TierId } from '../../data/tiers';
import { createRpgFluid } from './rpg-fluid';
import { createDamageFns } from './rpg-damage';
import { createRpgStatsPanel, type RpgStatsPanelHandle } from './rpg-stats-panel';
import {
  RPG_TRAIL_CAPACITY, RPG_MOTE_SIZE,
  PLAYER_HP_INIT, PLAYER_ATK_INIT, PLAYER_DEF_INIT, PLAYER_REGEN_INIT,
  INTER_WAVE_DELAY_MS,
} from './rpg-constants';
import {
  updateBossAttacks, setBossAttacksLowGraphics, type BossAttackUpdateCtx,
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
} from './rpg-enemy-types';
import { createBossWaveManager, type BossWaveHandle } from './rpg-boss-wave';
import { createWaveManager, type WaveManagerHandle } from './rpg-wave-manager';
import {
  updateLuckyMotes, updateLuckyMotePopups,
} from './rpg-lucky-motes';
import {
  updateAlivenGroups, type AlivenUpdateCtx,
} from './rpg-aliven-updates';
import { damageAlivenParticle } from './rpg-damage';
import type { AlivenParticleGroup } from './rpg-aliven-types';
import {
  type RpgEnemyCtx,
  updateEmeraldEnemies,
  updateAmberEnemies, updateAmberShards,
  updateVoidEnemies,
} from './rpg-enemy-updates';
import {
  updateQuartzEnemies, updateQuartzSpikes,
  updateRubyEnemies, updateRubyBolts,
  updateSunstoneEnemies,
  updateCitrineEnemies, updateCitrineBolts,
} from './rpg-enemy-updates-mid';
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
  updateEliteEnemies, type EliteEnemyCtx,
} from './rpg-elite-enemy-updates';
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
import { createPlayerDamageFns, type PlayerDamageCtx } from './rpg-player-damage';
import {
  drawRpgFrame, setAllDrawLowGraphics,
  type RpgDrawCtx, createRpgDrawFrameState,
} from './rpg-render-draw';
import {
  triggerDeath as _triggerDeath, doRestart as _doRestart,
  updateDying as _updateDying, updateRestarting as _updateRestarting,
  type RpgDeathRestartCtx,
} from './rpg-death-restart';
import {
  buildWeaponOrbitParticle as _buildWeaponOrbitParticle,
  buildOrbitProjectile as _buildOrbitProjectile,
  updateWeaponOrbitParticles as _updateWeaponOrbitParticles,
  type WeaponOrbitCtx,
} from './rpg-weapon-orbit';
import { tickWeaponSystems, type WeaponTickCtx } from './rpg-weapon-tick';

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
  /** Enable/disable invincibility mode — player takes no damage (dev mode only). */
  setInvincibilityMode(enabled: boolean): void;
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
   * Returns the flat base ATK bonus from claimed achievements.
   * Called inside applyEquipmentStats each time stats are refreshed.
   */
  getAchievementAtkBonus?: () => number;
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
  let isInvincibilityMode = false;

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
  const eliteEnemies: EliteEnemy[]         = [];
  const alivenGroups: AlivenParticleGroup[] = [];

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
  let bossWave!: BossWaveHandle;
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
    damageEliteEnemy,
  } = createDamageFns({ recordDps });

  let targeting!: RpgTargetingHandle;
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
      const weaponDef = WEAPON_BY_ID.get(weaponId);
      if (weaponDef) totalDefBonus += weaponDef.stats.defBonus;
    }
    playerStats.def = PLAYER_DEF_INIT + totalDefBonus + getEffectiveXpDefBonus(rpgSimState);
    // Regen is a fixed base value (weapon/XP bonuses can be added here in future).
    playerStats.regen = PLAYER_REGEN_INIT;
    // Player ATK is the base multiplier (not including per-weapon tier damage).
    playerStats.atk = PLAYER_ATK_INIT + getEffectiveXpAtkBonus(rpgSimState) + (options.getAchievementAtkBonus?.() ?? 0);
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

  // ── Player damage helpers (extracted to rpg-player-damage.ts) ──────
  const playerDamageCtx: PlayerDamageCtx = {
    mote,
    playerStats,
    getPlayerIFramesMs:  () => playerIFramesMs,
    setPlayerIFramesMs:  (ms) => { playerIFramesMs = ms; },
    hitEffects,
    shotLines,
    damageNumbers,
    isInvincibilityMode: () => isInvincibilityMode,
    onPlayerHit: () => { waveManager?.onPlayerHit(); },
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
  function findClosestEnemy(rangeSq: number): LaserEnemy | SapphireEnemy | EmeraldEnemy | AmberEnemy | VoidEnemy
    | QuartzEnemy | RubyEnemy | SunstoneEnemy | CitrineEnemy | IoliteEnemy | AmethystEnemy | DiamondEnemy | NullstoneEnemy
    | FracterylEnemy | EigensteinEnemy | EliteEnemy | BossEnemy | null { return targeting.findClosestEnemy(rangeSq); }

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

  // ── Create targeting system ───────────────────────────────────
  targeting = createRpgTargeting({
    mote,
    get bossEnemy() { return bossEnemy; },
    enemies, sapphireEnemies, sapphireMissiles, emeraldEnemies,
    amberEnemies, amberShards, voidEnemies, quartzEnemies, quartzSpikes,
    rubyEnemies, rubyBolts, sunstoneEnemies, citrineEnemies, citrineBolts,
    ioliteEnemies, amethystEnemies, amethystShards, diamondEnemies, diamondShards,
    nullstoneEnemies, voidTendrils, fracterylEnemies, fracterylShards, eigensteinEnemies,
    eliteEnemies,
    alivenGroups,
    damageEnemy, damageSapphireEnemy, damageMissile,
    damageEmeraldEnemy, damageAmberEnemy, damageAmberShard,
    damageVoidEnemy, damageQuartzEnemy, damageQuartzSpike,
    damageRubyEnemy, damageRubyBolt, damageSunstoneEnemy,
    damageCitrineEnemy, damageCitrineBolt, damageIoliteEnemy,
    damageAmethystEnemy, damageAmethystShard, damageDiamondEnemy,
    damageDiamondShard, damageNullstoneEnemy, damageVoidTendril,
    damageFracterylEnemy, damageFracterylShard, damageEigensteinEnemy,
    damageEliteEnemy,
    damageAlivenParticle: (p, g, raw) => damageAlivenParticle(p, g, raw, recordDps),
    damageBossEnemy: (raw, pierce, fromDiamond) => bossWave.damageBossEnemy(raw, pierce, fromDiamond),
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
    eliteEnemies, alivenGroups,
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
    enterBossWave:           () => bossWave.enterBossWave(),
    exitBossWave:            () => bossWave.exitBossWave(),
    getPlayerHpRatio:        () => playerStats.maxHp > 0 ? playerStats.hp / playerStats.maxHp : 0,
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
    damageEliteEnemy,
    damageBossEnemy:         (raw, pierce, fromDiamond) => bossWave.damageBossEnemy(raw, pierce, fromDiamond),
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
    eliteEnemies,
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
    eliteEnemies,
    damageEnemy, damageSapphireEnemy, damageMissile,
    damageEmeraldEnemy, damageAmberEnemy, damageAmberShard,
    damageVoidEnemy, damageQuartzEnemy, damageQuartzSpike,
    damageRubyEnemy, damageRubyBolt, damageSunstoneEnemy,
    damageCitrineEnemy, damageCitrineBolt, damageIoliteEnemy,
    damageAmethystEnemy, damageAmethystShard, damageDiamondEnemy,
    damageDiamondShard, damageNullstoneEnemy, damageVoidTendril,
    damageFracterylEnemy, damageFracterylShard, damageEigensteinEnemy,
    damageEliteEnemy,
    damageBossEnemy:      (raw, pierce, fromDiamond) => bossWave.damageBossEnemy(raw, pierce, fromDiamond),
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
    onError: () => { options.onError?.(); },
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
  });

  // ── Player movement context (wired to rpg-player-movement.ts) ───
  const movementCtx: PlayerMovementCtx = {
    mote,
    joystick,
    keys,
    dim,
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
    eigensteinEnemies, eigensteinBeams, eliteEnemies, alivenGroups,
    bossProjectiles, luckyMotes, luckyMotePopups, hitEffects, shotLines, damageNumbers,
    bossAttackState, weaponSystems, weaponAttackTimers,
    fluid: { reset: () => fluid.reset() },
    bossWave: { exitBossWave: () => bossWave.exitBossWave() },
    setBossEnemy:            (b) => { bossEnemy = b; },
    setDanmakuSafeZone:      (_dz) => { danmakuSafeZone = null; },
    setIsBossFightFromMenu:  (b) => { isBossFightFromMenu = b; },
    setBossHitsInRound:      (v) => { bossHitsInRound = v; },
    setCurrentWave:          (w) => { currentWave = w; },
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
    performWeaponAttack: (weaponId) => performWeaponAttack(weaponId),
    removeDeadEnemies:   () => removeDeadEnemies(),
    checkWaveCompletion: () => checkWaveCompletion(),
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
    eigensteinEnemies, eigensteinBeams, eliteEnemies, alivenGroups,
    getBossEnemy:         () => bossEnemy,
    getDanmakuSafeZone:   () => danmakuSafeZone,
    bossProjectiles, bossAttackState, teleportParticles,
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
    getEnemyIndicatorStyle:       () => enemyIndicatorStyle,
    getEffectiveEquippedIds,
    getTargetedEnemy:             () => targeting.getTargetedEnemy(),
    rpgSimState,
  };

  return {
    canvas,
    statsPanel: statsPanel.element,
    menuButtonContainer: statsPanel.menuButtonContainer,

    update(deltaMs: number, autoMoveEnabled = false): void {
      const nowMs = performance.now();
      glowTimeS += deltaMs / 1000;
      _autoMoveEnabled = autoMoveEnabled;

      if (rpgPhase === 'dying') {
        _updateDying(deathRestartCtx, deltaMs);
        fluid.step(deltaMs);
        drawRpgFrame(drawCtx, drawFrameState, nowMs);
        statsPanel.update();
        return;
      }
      if (rpgPhase === 'restarting') {
        _updateRestarting(deathRestartCtx, deltaMs);
        fluid.step(deltaMs);
        drawRpgFrame(drawCtx, drawFrameState, nowMs);
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
      updateEliteEnemies(eliteEnemies, eliteEnemyCtx, deltaMs);
      // AlivenParticle group updates (contact damage, particle-life physics, special abilities)
      updateAlivenGroups(alivenGroups, alivenUpdateCtx, deltaMs);
      if (bossEnemy) {
        const bossSpeedMult = isBossWaveActive ? (rpgSimState.bossSpeedPct / 100) : 1;
        updateBossEnemy(bossEnemy, bossCtx, deltaMs * bossSpeedMult);
        updateBossProjectiles(bossProjectiles, bossCtx, deltaMs * bossSpeedMult);
      } else {
        updateBossProjectiles(bossProjectiles, bossCtx, deltaMs);
      }
      updateBossAttacks(bossAttackState, bossAttackCtx, bossEnemy, deltaMs);
      updateTeleportParticles(teleportParticles, deltaMs);
      _updateWeaponOrbitParticles(weaponOrbitCtx, deltaMs);
      updateOrbitProjectile(orbitProjectileCtx, orbitProjectile, deltaMs);
      tickWeaponSystems(weaponTickCtx, deltaMs);
      updateShotVisuals(deltaMs);
      updateDamageNumbers(deltaMs);
      // Track lucky motes collected for achievements
      const luckyMoteCallback = (tierId: TierId, bonusPct: number, ageMs: number, fromElite: boolean) => {
        rpgSimState.lifetimeLuckyMotesCollected++;
        // Timing-based secret flags
        const nowTs = performance.now();
        // lucky_mote_within_1s: collected within 1 second of spawning
        if (ageMs <= 1000) rpgSimState.secretAchievementFlags.add('lucky_mote_within_1s');
        // lucky_mote_during_boss_fight: boss was active when collected
        if (bossEnemy !== null) rpgSimState.secretAchievementFlags.add('lucky_mote_during_boss_fight');
        // lucky_mote_from_elite
        if (fromElite) rpgSimState.secretAchievementFlags.add('lucky_mote_from_elite');
        // lucky_mote_triple_10s: 3 motes collected within 10 seconds
        rpgSimState.luckyMoteCollectedTimestampsMs.push(nowTs);
        const MAX_LUCKY_MOTE_TIMESTAMPS = 20;
        if (rpgSimState.luckyMoteCollectedTimestampsMs.length > MAX_LUCKY_MOTE_TIMESTAMPS) {
          rpgSimState.luckyMoteCollectedTimestampsMs.shift();
        }
        const tenSecondsAgo = nowTs - 10_000;
        let recentCount = 0;
        for (const ts of rpgSimState.luckyMoteCollectedTimestampsMs) {
          if (ts >= tenSecondsAgo) recentCount++;
        }
        if (recentCount >= 3) rpgSimState.secretAchievementFlags.add('lucky_mote_triple_10s');
        if (options.onLuckyMoteCollected) options.onLuckyMoteCollected(tierId, bonusPct);
      };
      updateLuckyMotes(luckyMotes, luckyMotePopups, mote.x, mote.y, deltaMs, luckyMoteCallback);
      updateLuckyMotePopups(luckyMotePopups, deltaMs);

      // Accumulate survival time
      rpgSimState.totalRpgSurvivalMs += deltaMs;

      // Track low-HP survival time for secret achievement
      if (playerStats.maxHp > 0 && playerStats.hp > 0 && playerStats.hp / playerStats.maxHp <= 0.10) {
        rpgSimState.lowHpAccumulatedMs += deltaMs;
        if (rpgSimState.lowHpAccumulatedMs >= 60_000) {
          rpgSimState.secretAchievementFlags.add('survived_60s_low_hp');
        }
      } else {
        rpgSimState.lowHpAccumulatedMs = 0;
      }

      // Track if player took damage this wave (compare HP before/after physics updates)
      // (hp tracking is done in the wave manager via onPlayerHit)

      // Apply HP regen: regenerate regen% of maxHp per second when alive.
      if (rpgPhase === 'alive' && playerStats.hp > 0 && playerStats.hp < playerStats.maxHp) {
        playerStats.hp = Math.min(
          playerStats.maxHp,
          playerStats.hp + (playerStats.regen / 100) * playerStats.maxHp * (deltaMs / 1000),
        );
      }

      if (playerStats.hp <= 0) _triggerDeath(deathRestartCtx);
      statsPanel.update();
      fluid.step(deltaMs);
      drawRpgFrame(drawCtx, drawFrameState, nowMs);
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
      statsPanel.setDevMode(enabled);
    },

    setInvincibilityMode(enabled: boolean): void {
      isInvincibilityMode = enabled;
    },
  };
}
