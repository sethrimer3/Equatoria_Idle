/**
 * rpg-weapon-sand-collision.ts — Per-projectile hit detection for sand gatling projectiles.
 *
 * Extracted from rpg-weapon-sand.ts to reduce that file's size.
 * The single export `checkSandProjectileHit(p, ctx)` tests one sand projectile
 * against every enemy type in the `SandWeaponCtx` and returns `true` when a
 * hit was registered (projectile consumed); the caller handles removal.
 *
 * Hit sequence matches the damage priority in rpg-weapon-sand.ts:
 *   laser → sapphire enemies → sapphire missiles →
 *   emerald → amber enemies → amber shards →
 *   void → quartz enemies → quartz spikes →
 *   ruby enemies → ruby bolts →
 *   sunstone → citrine enemies → citrine bolts →
 *   iolite → amethyst enemies → amethyst shards →
 *   diamond enemies → diamond shards →
 *   nullstone → void tendrils →
 *   fracteryl enemies → fracteryl shards →
 *   eigenstein →
 *   elite enemies →
 *   boss
 */

import { SAND_PROJ_COLOR, SAND_PROJ_SIZE } from './rpg-weapon-constants';
import {
  LASER_ENEMY_SIZE, SAPPHIRE_ENEMY_SIZE, MISSILE_SIZE, BOSS_SIZE_BASE,
} from './rpg-constants';
import {
  EMERALD_ENEMY_SIZE, AMBER_ENEMY_SIZE, AMBER_SHARD_SIZE,
  VOID_ENEMY_SIZE, QUARTZ_ENEMY_SIZE, QUARTZ_SPIKE_SIZE,
  RUBY_ENEMY_SIZE, RUBY_BOLT_SIZE,
  SUNSTONE_ENEMY_SIZE, CITRINE_ENEMY_SIZE, CITRINE_BOLT_SIZE,
  IOLITE_ENEMY_SIZE, AMETHYST_ENEMY_SIZE, AMETHYST_SHARD_SIZE,
  DIAMOND_ENEMY_SIZE, DIAMOND_SHARD_SIZE,
  NULLSTONE_ENEMY_SIZE, VOID_TENDRIL_SIZE,
  FRACTERYL_ENEMY_SIZE, EIGENSTEIN_ENEMY_SIZE,
  ELITE_NULLSTONE_RADIUS,
} from './rpg-enemy-constants';
import type { SandProjectile } from './rpg-types';
import type { SandWeaponCtx } from './rpg-weapon-sand';

const PROCEDURAL_SAND_HIT_RADIUS_PX = 16;

/**
 * Test `p` against every enemy type available in `ctx`.
 * Returns `true` if the projectile hit something and should be removed.
 * Damage, hit-visual spawning, and dead-entity cleanup are triggered internally.
 */
export function checkSandProjectileHit(p: SandProjectile, ctx: SandWeaponCtx): boolean {
  const {
    enemies, sapphireEnemies, sapphireMissiles,
    emeraldEnemies, amberEnemies, amberShards,
    voidEnemies, quartzEnemies, quartzSpikes,
    rubyEnemies, rubyBolts, sunstoneEnemies,
    citrineEnemies, citrineBolts, ioliteEnemies,
    amethystEnemies, amethystShards, diamondEnemies, diamondShards,
    nullstoneEnemies, voidTendrils, fracterylEnemies, fracterylShards, eigensteinEnemies, eliteEnemies,
    damageEnemy, damageSapphireEnemy, damageMissile,
    damageEmeraldEnemy, damageAmberEnemy, damageAmberShard,
    damageVoidEnemy, damageQuartzEnemy, damageQuartzSpike,
    damageRubyEnemy, damageRubyBolt, damageSunstoneEnemy,
    damageCitrineEnemy, damageCitrineBolt, damageIoliteEnemy,
    damageAmethystEnemy, damageAmethystShard, damageDiamondEnemy,
    damageDiamondShard, damageNullstoneEnemy, damageVoidTendril,
    damageFracterylEnemy, damageFracterylShard, damageEigensteinEnemy, damageEliteEnemy,
    damageBossEnemy,
    spawnHitVisualsAt,
  } = ctx;
  const damage = p.scaledDamage;

  // Laser enemies
  for (const e of enemies) {
    const dx = p.x - e.x, dy = p.y - e.y;
    if (dx * dx + dy * dy < (LASER_ENEMY_SIZE * 2) ** 2) {
      const dmg = damageEnemy(e, damage, 0);
      spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
      return true;
    }
  }

  // Sapphire enemies
  for (const e of sapphireEnemies) {
    const hitR = SAPPHIRE_ENEMY_SIZE + SAND_PROJ_SIZE;
    const dx = p.x - e.x, dy = p.y - e.y;
    if (dx * dx + dy * dy < hitR * hitR) {
      const dmg = damageSapphireEnemy(e, damage, 0, false);
      spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
      return true;
    }
  }

  // Sapphire missiles
  for (const m of sapphireMissiles) {
    const dx = p.x - m.x, dy = p.y - m.y;
    if (dx * dx + dy * dy < (MISSILE_SIZE * 2.5) ** 2) {
      damageMissile(m, damage);
      return true;
    }
  }

  // Emerald enemies
  for (const e of emeraldEnemies) {
    const hitR = EMERALD_ENEMY_SIZE + SAND_PROJ_SIZE;
    const dx = p.x - e.x, dy = p.y - e.y;
    if (dx * dx + dy * dy < hitR * hitR) {
      const dmg = damageEmeraldEnemy(e, damage, 0);
      spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
      return true;
    }
  }

  // Amber enemies
  for (const e of amberEnemies) {
    const hitR = AMBER_ENEMY_SIZE + SAND_PROJ_SIZE;
    const dx = p.x - e.x, dy = p.y - e.y;
    if (dx * dx + dy * dy < hitR * hitR) {
      const dmg = damageAmberEnemy(e, damage, 0);
      spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
      return true;
    }
  }

  // Amber shards
  for (const s of amberShards) {
    const dx = p.x - s.x, dy = p.y - s.y;
    if (dx * dx + dy * dy < (AMBER_SHARD_SIZE * 2.5) ** 2) {
      const dmg = damageAmberShard(s, damage);
      spawnHitVisualsAt(s.x, s.y, s.maxHp, dmg, SAND_PROJ_COLOR);
      return true;
    }
  }

  // Void enemies
  for (const e of voidEnemies) {
    const hitR = VOID_ENEMY_SIZE + SAND_PROJ_SIZE;
    const dx = p.x - e.x, dy = p.y - e.y;
    if (dx * dx + dy * dy < hitR * hitR) {
      damageVoidEnemy(e, damage, 0);
      return true;
    }
  }

  // Quartz enemies
  for (const e of quartzEnemies) {
    const hitR = QUARTZ_ENEMY_SIZE + SAND_PROJ_SIZE;
    const dx = p.x - e.x, dy = p.y - e.y;
    if (dx * dx + dy * dy < hitR * hitR) {
      const dmg = damageQuartzEnemy(e, damage, 0);
      spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
      return true;
    }
  }

  // Quartz spikes
  for (const s of quartzSpikes) {
    const dx = p.x - s.x, dy = p.y - s.y;
    if (dx * dx + dy * dy < (QUARTZ_SPIKE_SIZE * 2.5) ** 2) {
      damageQuartzSpike(s, damage);
      return true;
    }
  }

  // Ruby enemies
  for (const e of rubyEnemies) {
    const hitR = RUBY_ENEMY_SIZE + SAND_PROJ_SIZE;
    const dx = p.x - e.x, dy = p.y - e.y;
    if (dx * dx + dy * dy < hitR * hitR) {
      const dmg = damageRubyEnemy(e, damage, 0);
      spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
      return true;
    }
  }

  // Ruby bolts
  for (const b of rubyBolts) {
    const dx = p.x - b.x, dy = p.y - b.y;
    if (dx * dx + dy * dy < (RUBY_BOLT_SIZE * 2.5) ** 2) {
      damageRubyBolt(b, damage);
      return true;
    }
  }

  // Sunstone enemies
  for (const e of sunstoneEnemies) {
    const hitR = SUNSTONE_ENEMY_SIZE + SAND_PROJ_SIZE;
    const dx = p.x - e.x, dy = p.y - e.y;
    if (dx * dx + dy * dy < hitR * hitR) {
      const dmg = damageSunstoneEnemy(e, damage, 0);
      spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
      return true;
    }
  }

  // Citrine enemies
  for (const e of citrineEnemies) {
    const hitR = CITRINE_ENEMY_SIZE + SAND_PROJ_SIZE;
    const dx = p.x - e.x, dy = p.y - e.y;
    if (dx * dx + dy * dy < hitR * hitR) {
      const dmg = damageCitrineEnemy(e, damage, 0);
      spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
      return true;
    }
  }

  // Citrine bolts
  for (const b of citrineBolts) {
    const dx = p.x - b.x, dy = p.y - b.y;
    if (dx * dx + dy * dy < (CITRINE_BOLT_SIZE * 2.5) ** 2) {
      damageCitrineBolt(b, damage);
      return true;
    }
  }

  // Iolite enemies
  for (const e of ioliteEnemies) {
    const hitR = IOLITE_ENEMY_SIZE + SAND_PROJ_SIZE;
    const dx = p.x - e.x, dy = p.y - e.y;
    if (dx * dx + dy * dy < hitR * hitR) {
      const dmg = damageIoliteEnemy(e, damage, 0);
      spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
      return true;
    }
  }

  // Amethyst enemies
  for (const e of amethystEnemies) {
    const hitR = AMETHYST_ENEMY_SIZE + SAND_PROJ_SIZE;
    const dx = p.x - e.x, dy = p.y - e.y;
    if (dx * dx + dy * dy < hitR * hitR) {
      const dmg = damageAmethystEnemy(e, damage, 0, false);
      spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
      return true;
    }
  }

  // Amethyst shards
  for (const s of amethystShards) {
    const dx = p.x - s.x, dy = p.y - s.y;
    if (dx * dx + dy * dy < (AMETHYST_SHARD_SIZE * 2.5) ** 2) {
      damageAmethystShard(s, damage);
      return true;
    }
  }

  // Diamond enemies
  for (const e of diamondEnemies) {
    const hitR = DIAMOND_ENEMY_SIZE + SAND_PROJ_SIZE;
    const dx = p.x - e.x, dy = p.y - e.y;
    if (dx * dx + dy * dy < hitR * hitR) {
      const dmg = damageDiamondEnemy(e, damage, 0);
      spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
      return true;
    }
  }

  // Diamond shards
  for (const s of diamondShards) {
    const dx = p.x - s.x, dy = p.y - s.y;
    if (dx * dx + dy * dy < (DIAMOND_SHARD_SIZE * 2.5) ** 2) {
      damageDiamondShard(s, damage);
      return true;
    }
  }

  // Nullstone enemies
  for (const e of nullstoneEnemies) {
    const hitR = NULLSTONE_ENEMY_SIZE + SAND_PROJ_SIZE;
    const dx = p.x - e.x, dy = p.y - e.y;
    if (dx * dx + dy * dy < hitR * hitR) {
      const dmg = damageNullstoneEnemy(e, damage, 0);
      spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
      return true;
    }
  }

  // Void tendrils
  for (const t of voidTendrils) {
    const dx = p.x - t.x, dy = p.y - t.y;
    if (dx * dx + dy * dy < (VOID_TENDRIL_SIZE * 2.5) ** 2) {
      damageVoidTendril(t, damage);
      return true;
    }
  }

  // Fracteryl enemies
  for (const e of fracterylEnemies) {
    const hitR = FRACTERYL_ENEMY_SIZE + SAND_PROJ_SIZE;
    const dx = p.x - e.x, dy = p.y - e.y;
    if (dx * dx + dy * dy < hitR * hitR) {
      const dmg = damageFracterylEnemy(e, damage, 0);
      spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
      return true;
    }
  }

  // Fracteryl shards
  for (const s of fracterylShards) {
    const dx = p.x - s.x, dy = p.y - s.y;
    if (dx * dx + dy * dy < (FRACTERYL_ENEMY_SIZE * 0.5 + SAND_PROJ_SIZE) ** 2) {
      damageFracterylShard(s, damage);
      return true;
    }
  }

  // Eigenstein enemies
  for (const e of eigensteinEnemies) {
    const hitR = EIGENSTEIN_ENEMY_SIZE + SAND_PROJ_SIZE;
    const dx = p.x - e.x, dy = p.y - e.y;
    if (dx * dx + dy * dy < hitR * hitR) {
      const dmg = damageEigensteinEnemy(e, damage, 0);
      spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
      return true;
    }
  }

  // Elite enemies
  for (const e of eliteEnemies) {
    if (e.isInvuln) continue;
    const hitR = ELITE_NULLSTONE_RADIUS + SAND_PROJ_SIZE;
    const dx = p.x - e.x, dy = p.y - e.y;
    if (dx * dx + dy * dy < hitR * hitR) {
      const dmg = damageEliteEnemy(e, damage, 0);
      spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
      return true;
    }
  }

  // Boss
  if (ctx.bossEnemy) {
    const bossHitSize = BOSS_SIZE_BASE + ctx.bossEnemy.bossId * 1.5;
    const hitR = bossHitSize / 2 + SAND_PROJ_SIZE;
    const dx = p.x - ctx.bossEnemy.x, dy = p.y - ctx.bossEnemy.y;
    if (dx * dx + dy * dy < hitR * hitR) {
      const dmg = damageBossEnemy(damage, 0);
      if (dmg > 0) spawnHitVisualsAt(ctx.bossEnemy.x, ctx.bossEnemy.y, ctx.bossEnemy.maxHp, dmg, SAND_PROJ_COLOR);
      return true;
    }
  }

  for (const target of ctx.collectEnemyBodyTargets()) {
    if (!target.kind.startsWith('proc_') && target.kind !== 'verdure_plant') continue;
    const hitR = PROCEDURAL_SAND_HIT_RADIUS_PX + SAND_PROJ_SIZE;
    const dx = p.x - target.x, dy = p.y - target.y;
    if (dx * dx + dy * dy >= hitR * hitR) continue;
    const dmg = ctx.damageBodyTarget(target, damage, 0, false);
    if (dmg > 0) {
      const maxHp = getTargetMaxHp(target);
      ctx.spawnHitVisualsAt(target.x, target.y, maxHp, dmg, SAND_PROJ_COLOR);
    }
    return true;
  }

  return false;
}

function getTargetMaxHp(target: ReturnType<SandWeaponCtx['collectEnemyBodyTargets']>[number]): number {
  const body =
    target.dustWisp ?? target.ribbonWorm ?? target.lanternMoth ?? target.eyeStalk ??
    target.jellyfish ?? target.clothGhost ?? target.plantTurret ?? target.gearInsect ??
    target.spiderCrawler ?? target.moteSwarm ?? target.shadowHand ?? target.sandFish ??
    target.quartzFish ?? target.rubyFish ?? target.sunstoneFish ?? target.emeraldFish ??
    target.sapphireFish ?? target.amethystFish ?? target.diamondFish ?? target.plantProj ??
    target.verdurePlant;
  return typeof body === 'object' && body !== null && 'maxHp' in body && typeof body.maxHp === 'number'
    ? body.maxHp
    : 1;
}
