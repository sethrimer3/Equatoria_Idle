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
} from '../../sim/rpg/rpg-state';
import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import type { NumberFormat } from '../../util/format';
import { createRpgFluid } from './rpg-fluid';
import { createDamageFns } from './rpg-damage';
import { createRpgStatsPanel, type RpgStatsPanelHandle } from './rpg-stats-panel';
import {
  RPG_TRAIL_CAPACITY, RPG_MOTE_SIZE,
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
} from './rpg-enemy-types';
import type {
  DustWispEnemy, RibbonWormEnemy, LanternMothEnemy, EyeStalkEnemy,
  JellyfishEnemy, ClothGhostEnemy, PlantTurretEnemy, GearInsectEnemy,
  SpiderCrawlerEnemy, MoteSwarmEnemy, ShadowHandEnemy, PlantProjectile,
} from './rpg-procedural-types';
import { createBossWaveManager, type BossWaveHandle } from './rpg-boss-wave';
import { createWaveManager, type WaveManagerHandle } from './rpg-wave-manager';
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
  setAllDrawLowGraphics,
  type RpgDrawCtx, createRpgDrawFrameState,
} from './rpg-render-draw';
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

export type { RpgRender, RpgRenderOptions } from './rpg-render-types';

// ── Dynamic internal resolution ───────────────────────────────────
// These are updated by resize() to match the container's client dimensions.
// The default values kick in before the first resize() call.
let INTERNAL_WIDTH  = 320;
let INTERNAL_HEIGHT = 568;

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
  const plantProjectiles: PlantProjectile[]          = [];

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
    damageEliteEnemy,
    damageDustWispEnemy, damageRibbonWormEnemy, damageLanternMothEnemy, damageEyeStalkEnemy,
    damageJellyfishEnemy, damageClothGhostEnemy, damagePlantTurretEnemy, damageGearInsectEnemy,
    damageSpiderCrawlerEnemy, damageMoteSwarmEnemy, damageShadowHandEnemy, damagePlantProjectile,
  } = createDamageFns({ recordDps });

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

  function collectEnemyBodyTargets(): ClosestTarget[] { return targeting.collectEnemyBodyTargets(); }

  function findClosestEnemyFrom(x: number, y: number, rangeSq: number): ClosestTarget | null { return targeting.findClosestEnemyFrom(x, y, rangeSq); }

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
    eliteEnemies,
    alivenGroups,
    dustWispEnemies, ribbonWormEnemies, lanternMothEnemies, eyeStalkEnemies,
    jellyfishEnemies, clothGhostEnemies, plantTurretEnemies, gearInsectEnemies,
    spiderCrawlerEnemies, moteSwarmEnemies, shadowHandEnemies, plantProjectiles,
    damageEnemy, damageSapphireEnemy, damageMissile,
    damageEmeraldEnemy, damageAmberEnemy, damageAmberShard,
    damageVoidEnemy, damageQuartzEnemy, damageQuartzSpike,
    damageRubyEnemy, damageRubyBolt, damageSunstoneEnemy,
    damageCitrineEnemy, damageCitrineBolt, damageIoliteEnemy,
    damageAmethystEnemy, damageAmethystShard, damageDiamondEnemy,
    damageDiamondShard, damageNullstoneEnemy, damageVoidTendril,
    damageFracterylEnemy, damageFracterylShard, damageEigensteinEnemy,
    damageEliteEnemy,
    damageDustWispEnemy, damageRibbonWormEnemy, damageLanternMothEnemy, damageEyeStalkEnemy,
    damageJellyfishEnemy, damageClothGhostEnemy, damagePlantTurretEnemy, damageGearInsectEnemy,
    damageSpiderCrawlerEnemy, damageMoteSwarmEnemy, damageShadowHandEnemy, damagePlantProjectile,
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
    dustWispEnemies, ribbonWormEnemies, lanternMothEnemies, eyeStalkEnemies,
    jellyfishEnemies, clothGhostEnemies, plantTurretEnemies, gearInsectEnemies,
    spiderCrawlerEnemies, moteSwarmEnemies, shadowHandEnemies, plantProjectiles,
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
    damageDustWispEnemy, damageRibbonWormEnemy, damageLanternMothEnemy, damageEyeStalkEnemy,
    damageJellyfishEnemy, damageClothGhostEnemy, damagePlantTurretEnemy, damageGearInsectEnemy,
    damageSpiderCrawlerEnemy, damageMoteSwarmEnemy, damageShadowHandEnemy, damagePlantProjectile,
    findClosestTarget:       (rangeSq) => findClosestTarget(rangeSq),
    findClosestEnemy:        (rangeSq) => findClosestEnemy(rangeSq),
    collectEnemyBodyTargets: () => collectEnemyBodyTargets(),
    findClosestEnemyFrom:    (px, py, rangeSq) => findClosestEnemyFrom(px, py, rangeSq),
    getTargetedEnemy:        () => getTargetedEnemy(),
    damageBodyTarget:        (t, raw, pierce, bypass) => damageBodyTarget(t, raw, pierce, bypass),
    spawnDamageNumber:       (x, y, vx, vy, text, ratio, color) => spawnDamageNumber(x, y, vx, vy, text, ratio, color),
    spawnHitVisuals:         (enemy, dmg, color) => spawnHitVisuals(enemy, dmg, color),
    spawnHitVisualsAt:       (tx, ty, maxHp, dmg, color) => spawnHitVisualsAt(tx, ty, maxHp, dmg, color),
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
    eliteEnemies,
    alivenGroups,
    dustWispEnemies, ribbonWormEnemies, lanternMothEnemies, eyeStalkEnemies,
    jellyfishEnemies, clothGhostEnemies, plantTurretEnemies, gearInsectEnemies,
    spiderCrawlerEnemies, moteSwarmEnemies, shadowHandEnemies, plantProjectiles,
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
    eliteEnemies, alivenGroups,
    dustWispEnemies, ribbonWormEnemies, lanternMothEnemies, eyeStalkEnemies,
    jellyfishEnemies, clothGhostEnemies, plantTurretEnemies, gearInsectEnemies,
    spiderCrawlerEnemies, moteSwarmEnemies, shadowHandEnemies, plantProjectiles,
    damageEnemy, damageSapphireEnemy, damageMissile,
    damageEmeraldEnemy, damageAmberEnemy, damageAmberShard,
    damageVoidEnemy, damageQuartzEnemy, damageQuartzSpike,
    damageRubyEnemy, damageRubyBolt, damageSunstoneEnemy,
    damageCitrineEnemy, damageCitrineBolt, damageIoliteEnemy,
    damageAmethystEnemy, damageAmethystShard, damageDiamondEnemy,
    damageDiamondShard, damageNullstoneEnemy, damageVoidTendril,
    damageFracterylEnemy, damageFracterylShard, damageEigensteinEnemy,
    damageEliteEnemy,
    damageBossEnemy:        (raw, pierce, fromDiamond) => bossWave.damageBossEnemy(raw, pierce, fromDiamond),
    damageAlivenParticle:   (p, g, raw) => damageAlivenParticle(p, g, raw, recordDps),
    damageDustWispEnemy, damageRibbonWormEnemy, damageLanternMothEnemy, damageEyeStalkEnemy,
    damageJellyfishEnemy, damageClothGhostEnemy, damagePlantTurretEnemy, damageGearInsectEnemy,
    damageSpiderCrawlerEnemy, damageMoteSwarmEnemy, damageShadowHandEnemy, damagePlantProjectile,
    spawnHitVisuals:      (enemy, dmg, color) => spawnHitVisuals(enemy, dmg, color),
    spawnHitVisualsAt:    (x, y, maxHp, dmg, color) => spawnHitVisualsAt(x, y, maxHp, dmg, color),
    fluid,
    findClosestTarget:    (rangeSq) => findClosestTarget(rangeSq),
    spawnSandProjectile:  (tx, ty, dmg) => weaponSystems.spawnSandProjectile(tx, ty, dmg),
    spawnPoisonBolt:      (tx, ty, wid, tier, dmg) => weaponSystems.spawnPoisonBolt(tx, ty, wid, tier, dmg),
    spawnEmeraldMissile:  (tx, ty, dmg, tier) => weaponSystems.spawnEmeraldMissile(tx, ty, dmg, tier),
    fireLaserBeam:        (tx, ty, wid) => weaponSystems.fireLaserBeam(tx, ty, wid),
    layMine:              (dmg, tier) => weaponSystems.layMine(dmg, tier),
    getWeaponAtkMultiplier,
    getWeaponRngMultiplier,
    getWeaponPrcMultiplier,
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

  function clampEnemyToBounds(enemy: { x: number; y: number; vx: number; vy: number }): void {
    clampEnemyToBoundsHelper(enemy, widthPx, heightPx);
  }

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
    dustWispEnemies, ribbonWormEnemies, lanternMothEnemies, eyeStalkEnemies,
    jellyfishEnemies, clothGhostEnemies, plantTurretEnemies, gearInsectEnemies,
    spiderCrawlerEnemies, moteSwarmEnemies, shadowHandEnemies, plantProjectiles,
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
    eigensteinEnemies, eigensteinBeams, eliteEnemies, alivenGroups,
    dustWispEnemies, ribbonWormEnemies, lanternMothEnemies, eyeStalkEnemies,
    jellyfishEnemies, clothGhostEnemies, plantTurretEnemies, gearInsectEnemies,
    spiderCrawlerEnemies, moteSwarmEnemies, shadowHandEnemies, plantProjectiles,
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

  // ── Update context (wired to runRpgUpdate in rpg-render-update.ts) ───────────
  const enemyArrays: RpgEnemyUpdateArrays = {
    enemies, sapphireEnemies, sapphireMissiles, emeraldEnemies,
    amberEnemies, amberShards, voidEnemies, quartzEnemies, quartzSpikes,
    rubyEnemies, rubyBolts, sunstoneEnemies, citrineEnemies, citrineBolts,
    ioliteEnemies, amethystEnemies, amethystShards, diamondEnemies, diamondShards,
    nullstoneEnemies, voidTendrils, fracterylEnemies, fracterylShards,
    eigensteinEnemies, eigensteinBeams, eliteEnemies, alivenGroups,
    dustWispEnemies, ribbonWormEnemies, lanternMothEnemies, eyeStalkEnemies,
    jellyfishEnemies, clothGhostEnemies, plantTurretEnemies, gearInsectEnemies,
    spiderCrawlerEnemies, moteSwarmEnemies, shadowHandEnemies, plantProjectiles,
    teleportParticles, bossProjectiles, luckyMotes, luckyMotePopups,
  };
  const updateCtx: RpgUpdateCtx = {
    arrays: enemyArrays,
    getRpgPhase:            () => rpgPhase,
    getGlowTimeS:           () => glowTimeS,
    addGlowTimeS:           (v) => { glowTimeS += v; },
    setAutoMoveEnabled:     (v) => { _autoMoveEnabled = v; },
    deathRestartCtx,
    getIsInterWave:         () => isInterWave,
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
    weaponOrbitCtx,
    getOrbitProjectile:     () => orbitProjectile,
    orbitProjectileCtx,
    weaponTickCtx,
    updateShotVisuals,
    updateDamageNumbers,
    mote,
    rpgSimState,
    onLuckyMoteCollected:   options.onLuckyMoteCollected,
    playerStats,
    triggerDeath:           () => _triggerDeath(deathRestartCtx),
    statsPanel,
    fluid,
    drawCtx,
    drawFrameState,
  };

  return {
    canvas,
    statsPanel: statsPanel.element,
    menuButtonContainer: statsPanel.menuButtonContainer,

    update(deltaMs: number, autoMoveEnabled = false): void {
      runRpgUpdate(updateCtx, deltaMs, autoMoveEnabled);
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

    devSpawnAliven(variantId: string): void {
      if (alivenGroups.length >= MAX_ACTIVE_ALIVEN_GROUPS) return;
      const vid = (ALIVEN_VARIANTS as readonly string[]).includes(variantId)
        ? variantId as AlivenVariantId
        : 'aliven_spark_cluster';
      const margin = 30;
      const edge = Math.floor(Math.random() * 4);
      let spawnX = 0, spawnY = 0;
      if      (edge === 0) { spawnX = margin + Math.random() * (widthPx  - margin * 2); spawnY = margin; }
      else if (edge === 1) { spawnX = margin + Math.random() * (widthPx  - margin * 2); spawnY = heightPx - margin; }
      else if (edge === 2) { spawnX = margin; spawnY = margin + Math.random() * (heightPx - margin * 2); }
      else                 { spawnX = widthPx - margin; spawnY = margin + Math.random() * (heightPx - margin * 2); }
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
