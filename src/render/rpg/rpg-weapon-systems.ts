/**
 * rpg-weapon-systems.ts — All player weapon update logic for the RPG tab.
 *
 * Extracted from rpg-render.ts to keep the render module focused on
 * orchestration and drawing. Each weapon system (sand gatling, chain whip,
 * vortex, sword combo, poison bolt, emerald missile, sunstone mine, ruby laser
 * beam) is self-contained here.  Companion ship weapons (sapphire, amethyst)
 * are implemented in rpg-weapon-ships.ts and composed in via
 * createShipWeaponSystems().
 *
 * The factory function `createRpgWeaponSystems(ctx)` receives a
 * `RpgWeaponCtx` dependency-injection object that provides all external
 * state and callbacks needed by the weapon functions. It returns a
 * `RpgWeaponHandle` exposing weapon state arrays (for drawing) and
 * per-frame update functions (called by the main update loop).
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getScaledWeaponDamage } from '../../sim/rpg/rpg-state';
import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import {
  HIT_EFFECT_DURATION_MS, TARGET_FRAME_MS,
  CHAIN_NODES, CHAIN_NODE_COLOR,
  CHAIN_LASH_MS, CHAIN_RETRACT_MS, CHAIN_HIT_CD_MS,
  CHAIN_REST_LENGTH, CHAIN_SPRING_K, CHAIN_ANCHOR_K, CHAIN_RETRACT_ANCHOR_K,
  CHAIN_DAMPING_COEFF,
  CHAIN_DAMPING_SPEED_SCALE,
  VORTEX_PULL_STRENGTH, VORTEX_DAMAGE_INTERVAL_MS, VORTEX_SPAWN_DIST,
  VORTEX_COLOR, VORTEX_SPIN_RATE,
  POISON_ARMOR_IGNORE_PER_TIER, POISON_DURATION_BASE_TIER, POISON_DURATION_MS_PER_TIER,
  POISON_TOTAL_MULTIPLIER, POISON_BOLT_SPEED, POISON_BOLT_SIZE, POISON_BOLT_COLOR,
  POISON_BOLT_LIFE_MS, POISON_BOLT_TRAIL_CAP, POISON_TICK_INTERVAL_MS,
  BOSS_SIZE_BASE,
  FLUID_EXPLOSION_STRENGTH,
  FLUID_CHAIN_R, FLUID_CHAIN_G, FLUID_CHAIN_B,
  SUNSTONE_MINE_FUSE_MS, SUNSTONE_MINE_PROXIMITY_PX, SUNSTONE_MINE_AOE_BASE_PX,
  SUNSTONE_MINE_AOE_PER_TIER_PX, SUNSTONE_MINE_HP, SUNSTONE_MINE_SIZE,
  FLUID_VEL_FRAME_TO_PX_S,
  LASER_ENEMY_SIZE,
  BASE_ATTACK_TIMER_KEY,
} from './rpg-constants';
import {
  chainNodeRadius, chainNodeInvMass,
  getVortexTierRadius, getVortexTierDurationMs, getVortexCount,
} from './rpg-helpers';
import type { FluidImpulse } from './rpg-fluid';
import type { RpgPlayerStats } from './rpg-types';
import type {
  SandProjectile, ChainWhipState,
  LaserBeamEffect, NullstoneVortex, VortexWeaponState,
  SwordComboState,
  IolitePoisonBolt, PoisonDebuff,
  LaserEnemy, SapphireEnemy, SapphireMissile, HitEffect,
} from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy, AmberShard,
  VoidEnemy, QuartzEnemy, QuartzSpike,
  RubyEnemy, RubyBolt, SunstoneEnemy, CitrineEnemy, CitrineBolt,
  IoliteEnemy, AmethystEnemy, AmethystShard,
  DiamondEnemy, DiamondShard, NullstoneEnemy, VoidTendril,
  FracterylEnemy, FracterylShard, EigensteinEnemy,
  BossEnemy,
  EmeraldPlayerMissile, EmeraldSubMissile, EmeraldSwirlParticle,
  SunstoneMine,
  SapphireShip, SapphireLaser,
  AmethystShip, AmethystLaser,
} from './rpg-enemy-types';
import type { ClosestTarget } from './rpg-types';
import { createShipWeaponSystems } from './rpg-weapon-ships';
import { createSandWeaponSystem } from './rpg-weapon-sand';
import { createSwordWeaponSystem } from './rpg-weapon-sword';
import { createEmeraldWeaponSystem } from './rpg-weapon-emerald';
import { createLaserBeamWeaponSystem } from './rpg-weapon-laser-beam';

// ── Dependency-injection context passed in from rpg-render.ts ─────────────

export interface RpgWeaponCtx {
  // Viewport dimensions (updated on resize)
  dim: { w: number; h: number };

  // Player mote (live object reference — x/y are mutated by physics)
  mote: { x: number; y: number };

  // Live getter properties (values change each frame)
  readonly bossEnemy: BossEnemy | null;
  readonly playerAimAngle: number;

  // Player and sim state
  playerStats: RpgPlayerStats;
  rpgSimState: RpgSimState;

  // Enemy arrays (live references — mutations via damage functions, removals via removeDeadEnemies)
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

  // Hit effects array (weapon functions push directly into this array)
  hitEffects: HitEffect[];

  // Per-enemy damage functions (from createDamageFns)
  damageEnemy: (enemy: LaserEnemy, dmg: number, armorMult: number) => number;
  damageSapphireEnemy: (enemy: SapphireEnemy, dmg: number, armorMult: number, isImpact: boolean) => number;
  damageMissile: (missile: SapphireMissile, dmg: number) => number;
  damageEmeraldEnemy: (enemy: EmeraldEnemy, dmg: number, armorMult: number) => number;
  damageAmberEnemy: (enemy: AmberEnemy, dmg: number, armorMult: number) => number;
  damageAmberShard: (shard: AmberShard, dmg: number) => number;
  damageVoidEnemy: (enemy: VoidEnemy, dmg: number, armorMult: number) => number;
  damageQuartzEnemy: (enemy: QuartzEnemy, dmg: number, armorMult: number) => number;
  damageQuartzSpike: (spike: QuartzSpike, dmg: number) => number;
  damageRubyEnemy: (enemy: RubyEnemy, dmg: number, armorMult: number) => number;
  damageRubyBolt: (bolt: RubyBolt, dmg: number) => number;
  damageSunstoneEnemy: (enemy: SunstoneEnemy, dmg: number, armorMult: number) => number;
  damageCitrineEnemy: (enemy: CitrineEnemy, dmg: number, armorMult: number) => number;
  damageCitrineBolt: (bolt: CitrineBolt, dmg: number) => number;
  damageIoliteEnemy: (enemy: IoliteEnemy, dmg: number, armorMult: number) => number;
  damageAmethystEnemy: (enemy: AmethystEnemy, dmg: number, armorMult: number, isImpact: boolean) => number;
  damageAmethystShard: (shard: AmethystShard, dmg: number) => number;
  damageDiamondEnemy: (enemy: DiamondEnemy, dmg: number, armorMult: number) => number;
  damageDiamondShard: (shard: DiamondShard, dmg: number) => number;
  damageNullstoneEnemy: (enemy: NullstoneEnemy, dmg: number, armorMult: number) => number;
  damageVoidTendril: (tendril: VoidTendril, dmg: number) => number;
  damageFracterylEnemy: (enemy: FracterylEnemy, dmg: number, armorMult: number) => number;
  damageFracterylShard: (shard: FracterylShard, dmg: number) => number;
  damageEigensteinEnemy: (enemy: EigensteinEnemy, dmg: number, armorMult: number) => number;
  damageBossEnemy: (rawDamage: number, defPierceRatio: number, fromDiamondBlade?: boolean) => number;

  // Generic multi-type targeting and damage
  damageBodyTarget: (target: ClosestTarget, rawDamage: number, defPierceRatio: number, bypassShield: boolean) => number;
  findClosestTarget: (rangeSq: number) => ClosestTarget | null;
  findClosestEnemy: (rangeSq: number) => { x: number; y: number } | null;
  collectEnemyBodyTargets: () => ClosestTarget[];
  findClosestEnemyFrom: (x: number, y: number, rangeSq: number) => ClosestTarget | null;
  getTargetedEnemy: () => ClosestTarget | null;

  // Visual spawners
  spawnDamageNumber: (x: number, y: number, vx: number, vy: number, text: string, healthFraction: number, color: string) => void;
  spawnHitVisuals: (enemy: LaserEnemy, dmg: number, color: string) => void;
  spawnHitVisualsAt: (x: number, y: number, maxHp: number, dmg: number, color: string) => void;

  // Fluid simulation
  fluid: {
    addForce(impulse: FluidImpulse): void;
    addExplosion(x: number, y: number, strength: number, r: number, g: number, b: number): void;
  };

  // Game-flow callbacks
  removeDeadEnemies: () => void;
  checkWaveCompletion: () => void;

  // Stats-panel damage attribution wrapper (wraps a block so DPS is attributed to a weapon)
  withDamageSource: (weaponId: string | null, fn: () => void) => void;

  // Weapon utility
  findEquippedWeaponIdByEffect: (effectKind: string) => string | null;
  getCachedLuckPercent: () => number;
  getEffectiveEquippedIds: () => Set<string>;
}

// ── Weapon system handle returned to rpg-render.ts ────────────────────────

export interface RpgWeaponHandle {
  // Weapon state arrays — exposed for draw calls and applyEquipmentStats
  readonly sandProjectiles: SandProjectile[];
  readonly chainWhipStates: Map<string, ChainWhipState>;
  readonly activeVortexes: NullstoneVortex[];
  readonly vortexWeaponStates: Map<string, VortexWeaponState>;
  readonly swordComboStates: Map<string, SwordComboState>;
  readonly poisonBolts: IolitePoisonBolt[];
  readonly emeraldPlayerMissiles: EmeraldPlayerMissile[];
  readonly emeraldSubMissiles: EmeraldSubMissile[];
  readonly emeraldSwirlParticles: EmeraldSwirlParticle[];
  readonly sunstoneMines: SunstoneMine[];
  readonly laserBeamEffect: LaserBeamEffect | null;
  readonly sapphireShips: SapphireShip[];
  readonly sapphireLasers: SapphireLaser[];
  readonly amethystShips: AmethystShip[];
  readonly amethystLasers: AmethystLaser[];

  // Per-frame update functions called by the main update loop
  updateSandProjectiles: (deltaMs: number) => void;
  updateChainWhip: (weaponId: string, deltaMs: number) => void;
  updateVortexWeapon: (weaponId: string, deltaMs: number) => void;
  updateVortexes: (deltaMs: number) => void;
  updateSwordCombo: (weaponId: string, deltaMs: number) => void;
  updatePoisonBolts: (deltaMs: number) => void;
  updatePoisonDebuffs: (deltaMs: number) => void;
  updateEmeraldPlayerMissiles: (deltaMs: number) => void;
  updateEmeraldSubMissiles: (deltaMs: number) => void;
  updateEmeraldSwirlParticles: (deltaMs: number) => void;
  updateSunstoneMines: (deltaMs: number) => void;
  updateLaserBeamEffect: (deltaMs: number) => void;
  updateSapphireShips: (deltaMs: number) => void;
  updateSapphireLasers: (deltaMs: number) => void;
  updateAmethystShips: (deltaMs: number) => void;
  updateAmethystLasers: (deltaMs: number) => void;
  /** Updates the sand blade when no weapon is equipped. */
  updateSandBlade: (deltaMs: number) => void;

  // Companion ship sync (called by applyEquipmentStats and notifyEquip)
  syncSapphireShips: () => void;
  syncAmethystShips: () => void;

  // Attack spawn functions called from performWeaponAttack in rpg-render.ts
  spawnSandProjectile: (targetX: number, targetY: number, damage: number) => void;
  spawnPoisonBolt: (targetX: number, targetY: number, weaponId: string, tier: number, damage: number) => void;
  spawnEmeraldMissile: (targetX: number, targetY: number, damage: number, tier: number) => void;
  fireLaserBeam: (targetX: number, targetY: number, weaponId: string) => void;
  layMine: (damage: number, tier: number) => void;

  // Reset all weapon state (called by doRestart in rpg-render.ts)
  reset: () => void;
}

// ── Factory ───────────────────────────────────────────────────────────────

export function createRpgWeaponSystems(ctx: RpgWeaponCtx): RpgWeaponHandle {
  // Unpack stable references from ctx (arrays are live because objects are references).
  // For scalar live values (bossEnemy, playerAimAngle), access via ctx.xxx each call.
  const {
    enemies, sapphireEnemies,
    emeraldEnemies, amberEnemies,
    voidEnemies, quartzEnemies,
    rubyEnemies, sunstoneEnemies,
    citrineEnemies, ioliteEnemies,
    amethystEnemies, diamondEnemies,
    nullstoneEnemies, fracterylEnemies, eigensteinEnemies,
    damageEnemy, damageSapphireEnemy,
    damageEmeraldEnemy, damageAmberEnemy,
    damageVoidEnemy, damageQuartzEnemy,
    damageRubyEnemy, damageSunstoneEnemy,
    damageCitrineEnemy, damageIoliteEnemy,
    damageAmethystEnemy, damageDiamondEnemy,
    damageNullstoneEnemy,
    damageFracterylEnemy, damageEigensteinEnemy,
    damageBossEnemy,
    findClosestEnemy,
    spawnDamageNumber, spawnHitVisualsAt,
    hitEffects, fluid, rpgSimState, playerStats, mote, dim,
    removeDeadEnemies, checkWaveCompletion,
  } = ctx;

  // ── Sub-system modules ─────────────────────────────────────────
  const ships = createShipWeaponSystems(ctx);
  const sand = createSandWeaponSystem(ctx);
  const sword = createSwordWeaponSystem(ctx);
  const emerald = createEmeraldWeaponSystem(ctx);
  const laserBeam = createLaserBeamWeaponSystem(ctx);

  // ── Weapon state ───────────────────────────────────────────────
  const chainWhipStates: Map<string, ChainWhipState> = new Map();
  const activeVortexes: NullstoneVortex[] = [];
  const vortexWeaponStates: Map<string, VortexWeaponState> = new Map();
  const poisonBolts: IolitePoisonBolt[] = [];
  const poisonDebuffs: Map<object, PoisonDebuff> = new Map();
  const sunstoneMines: SunstoneMine[] = [];

  // ── Quartz chain whip system ───────────────────────────────────

  function buildChainWhip(weaponId: string): ChainWhipState {
    const nodesX  = new Float64Array(CHAIN_NODES);
    const nodesY  = new Float64Array(CHAIN_NODES);
    const nodesVx = new Float64Array(CHAIN_NODES);
    const nodesVy = new Float64Array(CHAIN_NODES);
    const linkSides = new Uint8Array(CHAIN_NODES);
    for (let i = 0; i < CHAIN_NODES; i++) { nodesX[i] = mote.x; nodesY[i] = mote.y; }
    for (let i = 0; i < CHAIN_NODES; i++) linkSides[i] = 3 + Math.floor(Math.random() * 5);
    const weaponDef = WEAPON_BY_ID.get(weaponId);
    return {
      phase: 'idle',
      phaseMs: 0,
      cooldownMs: weaponDef?.stats.cooldownMs ?? 2500,
      targetX: mote.x, targetY: mote.y,
      nodesX, nodesY, nodesVx, nodesVy, linkSides,
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
   *
   * Force asymmetry: the force an inner node exerts on the outer node it is
   * connected to is 2.2x as strong as the force the outer node exerts back on
   * the inner node.  This propagates energy outward like a real whip crack.
   */
  function stepChainPhysics(ws: ChainWhipState, dt: number, anchorK: number): void {
    // Node 0: spring anchor toward player (rest length 0)
    ws.nodesVx[0] += (mote.x - ws.nodesX[0]) * anchorK * chainNodeInvMass(0) * dt;
    ws.nodesVy[0] += (mote.y - ws.nodesY[0]) * anchorK * chainNodeInvMass(0) * dt;

    // Asymmetric spring forces between adjacent pairs.
    // The inner node (i) exerts 2.2× force on the outer node (i+1), while the
    // outer node exerts only 1× force back on the inner node.
    for (let i = 0; i < CHAIN_NODES - 1; i++) {
      const sdx = ws.nodesX[i + 1] - ws.nodesX[i];
      const sdy = ws.nodesY[i + 1] - ws.nodesY[i];
      const sdist = Math.sqrt(sdx * sdx + sdy * sdy);
      if (sdist < 0.001) continue;
      const stretch = sdist - CHAIN_REST_LENGTH;
      const fx = (sdx / sdist) * stretch * CHAIN_SPRING_K;
      const fy = (sdy / sdist) * stretch * CHAIN_SPRING_K;
      // Outer node pulled/pushed by inner with 2.2× force
      ws.nodesVx[i + 1] -= fx * 2.2 * chainNodeInvMass(i + 1) * dt;
      ws.nodesVy[i + 1] -= fy * 2.2 * chainNodeInvMass(i + 1) * dt;
      // Inner node pulled/pushed by outer with 1× force
      ws.nodesVx[i]     += fx * chainNodeInvMass(i)     * dt;
      ws.nodesVy[i]     += fy * chainNodeInvMass(i)     * dt;
    }

    // Integrate positions + apply damping that rises linearly with node speed.
    for (let i = 0; i < CHAIN_NODES; i++) {
      const vx = ws.nodesVx[i];
      const vy = ws.nodesVy[i];
      const speed = Math.hypot(vx, vy);
      const linearDamp = Math.min(0.98, CHAIN_DAMPING_COEFF * (1 + CHAIN_DAMPING_SPEED_SCALE * speed) * dt);
      const retain = 1 - linearDamp;
      ws.nodesVx[i] *= retain;
      ws.nodesVy[i] *= retain;
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
      if (ctx.bossEnemy) {
        const bossHitR = BOSS_SIZE_BASE + ctx.bossEnemy.bossId * 1.5 + chainNodeRadius(CHAIN_NODES - 1);
        for (let ni = 0; ni < CHAIN_NODES; ni++) {
          const nx = ws.nodesX[ni], ny = ws.nodesY[ni];
          if (ws.hitCooldowns.has(ctx.bossEnemy)) break;
          const dx = nx - ctx.bossEnemy.x, dy = ny - ctx.bossEnemy.y;
          if (dx * dx + dy * dy < bossHitR * bossHitR) {
            const dmg = damageBossEnemy(contactDamage, 0);
            ws.hitCooldowns.set(ctx.bossEnemy, CHAIN_HIT_CD_MS);
            hitEffects.push({ x: ctx.bossEnemy.x, y: ctx.bossEnemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: CHAIN_NODE_COLOR });
            if (dmg > 0) spawnDamageNumber(ctx.bossEnemy.x, ctx.bossEnemy.y, 0, -1, String(Math.round(dmg)), dmg / ctx.bossEnemy.maxHp, CHAIN_NODE_COLOR);
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
      const angle = ctx.playerAimAngle + (i / count) * Math.PI * 2;
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
      if (ctx.bossEnemy) applyPull(ctx.bossEnemy);

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
        if (ctx.bossEnemy) {
          const bx = ctx.bossEnemy.x - v.x, by = ctx.bossEnemy.y - v.y;
          if (bx * bx + by * by <= v.radiusPx * v.radiusPx) {
            const dmg = damageBossEnemy(v.scaledDamage, 0);
            if (dmg > 0) spawnDamageNumber(ctx.bossEnemy.x, ctx.bossEnemy.y, 0, -1, String(Math.round(dmg)), dmg / ctx.bossEnemy.maxHp, VORTEX_COLOR);
          }
        }
        removeDeadEnemies();
        checkWaveCompletion();
      }
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

      if (p.x < 0 || p.x > dim.w || p.y < 0 || p.y > dim.h) {
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
      if (!hit && ctx.bossEnemy) {
        const boss = ctx.bossEnemy;
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
    if (ctx.bossEnemy) {
      const dx = ctx.bossEnemy.x - mine.x, dy = ctx.bossEnemy.y - mine.y;
      if (dx * dx + dy * dy <= r2) {
        const dmg = damageBossEnemy(mine.scaledDamage, 0);
        if (dmg > 0) spawnHitVisualsAt(ctx.bossEnemy.x, ctx.bossEnemy.y, ctx.bossEnemy.maxHp, dmg, col);
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


  // ── Sand blade (starter weapon, no weapon equipped) ───────────────

  /**
   * Updates the sand blade combo state when no weapon is equipped.
   * Reuses the sword combo state machine under the sentinel key __base__.
   */
  function updateSandBlade(deltaMs: number): void {
    ctx.withDamageSource(BASE_ATTACK_TIMER_KEY, () => sword.updateSwordCombo(BASE_ATTACK_TIMER_KEY, deltaMs));
  }

  // ── Expose laserBeamEffect as getter so handle stays in sync ──
  // (laserBeamEffect is a let variable that gets replaced, not mutated)
  return {
    get sandProjectiles() { return sand.sandProjectiles; },
    get chainWhipStates() { return chainWhipStates; },
    get activeVortexes() { return activeVortexes; },
    get vortexWeaponStates() { return vortexWeaponStates; },
    get swordComboStates() { return sword.swordComboStates; },
    get poisonBolts() { return poisonBolts; },
    get emeraldPlayerMissiles() { return emerald.emeraldPlayerMissiles; },
    get emeraldSubMissiles() { return emerald.emeraldSubMissiles; },
    get emeraldSwirlParticles() { return emerald.emeraldSwirlParticles; },
    get sunstoneMines() { return sunstoneMines; },
    get laserBeamEffect() { return laserBeam.laserBeamEffect; },
    get sapphireShips() { return ships.sapphireShips; },
    get sapphireLasers() { return ships.sapphireLasers; },
    get amethystShips() { return ships.amethystShips; },
    get amethystLasers() { return ships.amethystLasers; },

    updateSandProjectiles: (deltaMs: number) => sand.updateSandProjectiles(deltaMs),
    updateChainWhip,
    updateVortexWeapon,
    updateVortexes,
    updateSwordCombo: (weaponId: string, deltaMs: number) => sword.updateSwordCombo(weaponId, deltaMs),
    updatePoisonBolts,
    updatePoisonDebuffs,
    updateEmeraldPlayerMissiles: (deltaMs: number) => emerald.updateEmeraldPlayerMissiles(deltaMs),
    updateEmeraldSubMissiles: (deltaMs: number) => emerald.updateEmeraldSubMissiles(deltaMs),
    updateEmeraldSwirlParticles: (deltaMs: number) => emerald.updateEmeraldSwirlParticles(deltaMs),
    updateSunstoneMines,
    updateLaserBeamEffect: (deltaMs: number) => laserBeam.updateLaserBeamEffect(deltaMs),
    updateSapphireShips: (deltaMs: number) => ships.updateSapphireShips(deltaMs),
    updateSapphireLasers: (deltaMs: number) => ships.updateSapphireLasers(deltaMs),
    updateAmethystShips: (deltaMs: number) => ships.updateAmethystShips(deltaMs),
    updateAmethystLasers: (deltaMs: number) => ships.updateAmethystLasers(deltaMs),
    updateSandBlade,

    syncSapphireShips: () => ships.syncSapphireShips(),
    syncAmethystShips: () => ships.syncAmethystShips(),

    spawnSandProjectile: (targetX: number, targetY: number, damage: number) => sand.spawnSandProjectile(targetX, targetY, damage),
    spawnPoisonBolt,
    spawnEmeraldMissile: (targetX: number, targetY: number, damage: number, tier: number) => emerald.spawnEmeraldMissile(targetX, targetY, damage, tier),
    fireLaserBeam: (targetX: number, targetY: number, weaponId: string) => laserBeam.fireLaserBeam(targetX, targetY, weaponId),
    layMine,

    reset(): void {
      sand.reset();
      chainWhipStates.clear();
      activeVortexes.length = 0;
      vortexWeaponStates.clear();
      sword.reset();
      poisonBolts.length = 0;
      poisonDebuffs.clear();
      emerald.reset();
      sunstoneMines.length = 0;
      laserBeam.reset();
      ships.reset();
    },
  };
}
