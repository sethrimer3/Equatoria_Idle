/**
 * rpg-player-attack.ts — Player auto-attack dispatch for the RPG tab.
 *
 * Contains `performWeaponAttack`, which fires the player's equipped weapon at
 * enemies once per cooldown tick.  Extracted from rpg-render.ts to reduce file
 * size.  The function is pure given its context object; all mutable state comes
 * in via `RpgPlayerAttackCtx`.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getScaledWeaponDamage } from '../../sim/rpg/rpg-state';
import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import {
  PLAYER_BASE_RANGE_PX,
  FLUID_EXPLOSION_STRENGTH, FLUID_PLAYER_R, FLUID_PLAYER_G, FLUID_PLAYER_B,
  BOSS_GLOW_COLORS,
  SAPPHIRE_ENEMY_GLOW,
} from './rpg-constants';
import {
  EMERALD_ENEMY_GLOW, AMBER_ENEMY_GLOW, VOID_ENEMY_GLOW,
  QUARTZ_ENEMY_GLOW, RUBY_ENEMY_GLOW, SUNSTONE_ENEMY_GLOW, CITRINE_ENEMY_GLOW,
  IOLITE_ENEMY_GLOW, AMETHYST_ENEMY_GLOW, DIAMOND_ENEMY_GLOW, NULLSTONE_ENEMY_GLOW,
  FRACTERYL_ENEMY_GLOW, EIGENSTEIN_ENEMY_GLOW,
} from './rpg-enemy-constants';
import type { LaserEnemy, SapphireMissile, RpgPlayerStats, SapphireEnemy } from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy, AmberShard,
  VoidEnemy, QuartzEnemy, QuartzSpike,
  RubyEnemy, RubyBolt, SunstoneEnemy,
  CitrineEnemy, CitrineBolt, IoliteEnemy,
  AmethystEnemy, AmethystShard, DiamondEnemy, DiamondShard,
  NullstoneEnemy, VoidTendril, FracterylEnemy, FracterylShard,
  EigensteinEnemy, BossEnemy, EliteEnemy,
} from './rpg-enemy-types';
import type { ClosestTarget } from './rpg-types';

// ── Dependency-injection context ──────────────────────────────────────────────

export interface RpgPlayerAttackCtx {
  // Player mote (live reference)
  mote: { x: number; y: number };

  // Live getter — bossEnemy changes during gameplay
  readonly bossEnemy: BossEnemy | null;

  // Sim state and player stats
  rpgSimState: RpgSimState;
  playerStats: RpgPlayerStats;

  // All enemy arrays (live references)
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
  eliteEnemies: EliteEnemy[];

  // Per-enemy damage functions
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
  damageEliteEnemy: (enemy: EliteEnemy, dmg: number, armorMult: number) => number;
  damageBossEnemy: (rawDamage: number, defPierceRatio: number, fromDiamondBlade?: boolean) => number;

  // Visual spawners
  spawnHitVisuals: (enemy: LaserEnemy, dmg: number, color: string) => void;
  spawnHitVisualsAt: (x: number, y: number, maxHp: number, dmg: number, color: string) => void;

  // Fluid explosion
  fluid: {
    addExplosion(x: number, y: number, strength: number, r: number, g: number, b: number): void;
  };

  // Targeting
  findClosestTarget: (rangeSq: number) => ClosestTarget | null;

  // Weapon spawn callbacks (from weaponSystems handle)
  spawnSandProjectile: (targetX: number, targetY: number, damage: number) => void;
  spawnPoisonBolt: (targetX: number, targetY: number, weaponId: string, tier: number, damage: number) => void;
  spawnEmeraldMissile: (targetX: number, targetY: number, damage: number, tier: number) => void;
  fireLaserBeam: (targetX: number, targetY: number, weaponId: string) => void;
  layMine: (damage: number, tier: number) => void;
}

// ── Attack dispatch ───────────────────────────────────────────────────────────

/**
 * Fires the player's equipped weapon at enemies once per cooldown tick.
 * Dispatches to the appropriate weapon-effect handler based on the weapon's
 * effect kind (single, multi, aoe, piercing, gatling, poisonBolt, etc.).
 */
export function performWeaponAttack(ctx: RpgPlayerAttackCtx, weaponId: string): void {
  const {
    mote, rpgSimState, playerStats,
    enemies, sapphireEnemies, sapphireMissiles,
    emeraldEnemies, amberEnemies, amberShards, voidEnemies,
    quartzEnemies, quartzSpikes, rubyEnemies, rubyBolts,
    sunstoneEnemies, citrineEnemies, citrineBolts,
    ioliteEnemies, amethystEnemies, amethystShards,
    diamondEnemies, diamondShards, nullstoneEnemies, voidTendrils,
    fracterylEnemies, fracterylShards, eigensteinEnemies,
    eliteEnemies,
    damageEnemy, damageSapphireEnemy, damageMissile,
    damageEmeraldEnemy, damageAmberEnemy, damageAmberShard,
    damageVoidEnemy, damageQuartzEnemy, damageQuartzSpike,
    damageRubyEnemy, damageRubyBolt, damageSunstoneEnemy,
    damageCitrineEnemy, damageCitrineBolt, damageIoliteEnemy,
    damageAmethystEnemy, damageAmethystShard,
    damageDiamondEnemy, damageDiamondShard,
    damageNullstoneEnemy, damageVoidTendril,
    damageFracterylEnemy, damageFracterylShard, damageEigensteinEnemy,
    damageEliteEnemy,
    damageBossEnemy,
    spawnHitVisuals, spawnHitVisualsAt, fluid, findClosestTarget,
    spawnSandProjectile, spawnPoisonBolt, spawnEmeraldMissile, fireLaserBeam, layMine,
  } = ctx;
  const bossEnemy = ctx.bossEnemy;

  const weaponDef = WEAPON_BY_ID.get(weaponId);

  // Sunstone mines can always be placed (no target needed).
  if (weaponDef?.stats.effect?.kind === 'sunstoneMine') {
    const tier      = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const rawDamage = weaponDef
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
    + eliteEnemies.length
    + (bossEnemy ? 1 : 0);
  if (totalTargets === 0) return;
  const range     = weaponDef?.stats.range ?? PLAYER_BASE_RANGE_PX;
  const tier      = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
  const rawDamage = weaponDef
    ? getScaledWeaponDamage(weaponDef.stats.damage, tier, playerStats.atk)
    : playerStats.atk;
  const effect    = weaponDef?.stats.effect ?? { kind: 'single' as const };
  const shotColor = '#ffd764';

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
    for (const enemy of eliteEnemies) {
      if (enemy.isInvuln) continue;
      const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
      if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
        const dmg = damageEliteEnemy(enemy, rawDamage, 0);
        spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#ffe060');
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
      elite?: import('./rpg-enemy-types').EliteEnemy;
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
    for (const e of eliteEnemies) {
      if (e.isInvuln) continue;
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= rangeSq) inRange.push({ distSq: d, elite: e });
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
      } else if (t.elite) {
        const dmg = damageEliteEnemy(t.elite, rawDamage, 0);
        spawnHitVisualsAt(t.elite.x, t.elite.y, t.elite.maxHp, dmg, '#ffe060');
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
  } else if (closestT.elite) {
    const dmg = damageEliteEnemy(closestT.elite, rawDamage, defPierceRatio);
    spawnHitVisualsAt(closestT.elite.x, closestT.elite.y, closestT.elite.maxHp, dmg,
      effect.kind === 'piercing' ? '#74c0fc' : '#ffe060');
  } else if (closestT.boss) {
    const dmg = damageBossEnemy(rawDamage, defPierceRatio);
    if (dmg > 0) spawnHitVisualsAt(closestT.boss.x, closestT.boss.y, closestT.boss.maxHp, dmg,
      effect.kind === 'piercing' ? '#74c0fc' : BOSS_GLOW_COLORS[Math.min(closestT.boss.bossId, BOSS_GLOW_COLORS.length - 1)]);
  }
}
