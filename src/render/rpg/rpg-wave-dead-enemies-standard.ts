import { getXpPerKill } from '../../sim/rpg/rpg-state';
import {
  FLUID_EXPLOSION_STRENGTH,
  FLUID_LASER_R, FLUID_LASER_G, FLUID_LASER_B,
  FLUID_SAPPH_R, FLUID_SAPPH_G, FLUID_SAPPH_B,
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
  LASER_XP_MULT, SAPPHIRE_XP_MULT, EMERALD_XP_MULT, AMBER_XP_MULT, VOID_XP_MULT,
  QUARTZ_XP_MULT, RUBY_XP_MULT, SUNSTONE_XP_MULT, CITRINE_XP_MULT,
  IOLITE_XP_MULT, AMETHYST_XP_MULT, DIAMOND_XP_MULT, NULLSTONE_XP_MULT,
  FRACTERYL_XP_MULT, EIGENSTEIN_XP_MULT,
} from './rpg-enemy-constants';
import { trySpawnLuckyMote } from './rpg-lucky-motes';
import type { WaveManagerCtx } from './rpg-wave-manager';

export function sweepStandardDeadEnemies(
  ctx: WaveManagerCtx,
  addKill: (typeId: string) => void,
): number {
  const {
    rpgSimState,
    enemies, sapphireMissiles, sapphireEnemies, emeraldEnemies,
    amberEnemies, amberShards, voidEnemies, quartzEnemies, quartzSpikes,
    rubyEnemies, rubyBolts, sunstoneEnemies, citrineEnemies, citrineBolts,
    ioliteEnemies, amethystEnemies, amethystShards, diamondEnemies, diamondShards,
    nullstoneEnemies, voidTendrils, fracterylEnemies, fracterylShards, eigensteinEnemies,
    luckyMotes, fluid, getCachedLuckPercent,
  } = ctx;

  let totalXpFromKills = 0;

  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].hp <= 0) {
      fluid.addExplosion(enemies[i].x, enemies[i].y, FLUID_EXPLOSION_STRENGTH, FLUID_LASER_R, FLUID_LASER_G, FLUID_LASER_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * LASER_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'laser', enemies[i].x, enemies[i].y, getCachedLuckPercent());
      addKill('laser');
      enemies.splice(i, 1);
    }
  }
  for (let i = sapphireEnemies.length - 1; i >= 0; i--) {
    if (sapphireEnemies[i].hp <= 0) {
      fluid.addExplosion(sapphireEnemies[i].x, sapphireEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.4, FLUID_SAPPH_R, FLUID_SAPPH_G, FLUID_SAPPH_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * SAPPHIRE_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'sapphire', sapphireEnemies[i].x, sapphireEnemies[i].y, getCachedLuckPercent());
      addKill('sapphire');
      sapphireEnemies.splice(i, 1);
    }
  }
  for (let i = sapphireMissiles.length - 1; i >= 0; i--) {
    if (sapphireMissiles[i].hp <= 0) {
      fluid.addExplosion(sapphireMissiles[i].x, sapphireMissiles[i].y, FLUID_EXPLOSION_STRENGTH * 0.6, FLUID_MISSILE_R, FLUID_MISSILE_G, FLUID_MISSILE_B);
      sapphireMissiles.splice(i, 1);
    }
  }
  for (let i = emeraldEnemies.length - 1; i >= 0; i--) {
    if (emeraldEnemies[i].hp <= 0) {
      fluid.addExplosion(emeraldEnemies[i].x, emeraldEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.1, FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * EMERALD_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'emerald', emeraldEnemies[i].x, emeraldEnemies[i].y, getCachedLuckPercent());
      addKill('emerald');
      emeraldEnemies.splice(i, 1);
    }
  }
  for (let i = amberEnemies.length - 1; i >= 0; i--) {
    if (amberEnemies[i].hp <= 0) {
      fluid.addExplosion(amberEnemies[i].x, amberEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.5, FLUID_AMBER_R, FLUID_AMBER_G, FLUID_AMBER_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * AMBER_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'amber', amberEnemies[i].x, amberEnemies[i].y, getCachedLuckPercent());
      addKill('amber');
      amberEnemies.splice(i, 1);
    }
  }
  for (let i = amberShards.length - 1; i >= 0; i--) {
    if (amberShards[i].hp <= 0) {
      fluid.addExplosion(amberShards[i].x, amberShards[i].y, FLUID_EXPLOSION_STRENGTH * 0.5, FLUID_AMBER_R, FLUID_AMBER_G, FLUID_AMBER_B);
      amberShards.splice(i, 1);
    }
  }
  for (let i = voidEnemies.length - 1; i >= 0; i--) {
    if (voidEnemies[i].hp <= 0) {
      fluid.addExplosion(voidEnemies[i].x, voidEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 2.0, FLUID_VOID_R, FLUID_VOID_G, FLUID_VOID_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * VOID_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'void', voidEnemies[i].x, voidEnemies[i].y, getCachedLuckPercent());
      addKill('void');
      voidEnemies.splice(i, 1);
    }
  }
  for (let i = quartzEnemies.length - 1; i >= 0; i--) {
    if (quartzEnemies[i].hp <= 0) {
      fluid.addExplosion(quartzEnemies[i].x, quartzEnemies[i].y, FLUID_EXPLOSION_STRENGTH, FLUID_QUARTZ_R, FLUID_QUARTZ_G, FLUID_QUARTZ_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * QUARTZ_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'quartz', quartzEnemies[i].x, quartzEnemies[i].y, getCachedLuckPercent());
      addKill('quartz');
      quartzEnemies.splice(i, 1);
    }
  }
  for (let i = quartzSpikes.length - 1; i >= 0; i--) {
    if (quartzSpikes[i].hp <= 0 || quartzSpikes[i].lifeMs <= 0) quartzSpikes.splice(i, 1);
  }
  for (let i = rubyEnemies.length - 1; i >= 0; i--) {
    if (rubyEnemies[i].hp <= 0) {
      fluid.addExplosion(rubyEnemies[i].x, rubyEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.2, FLUID_RUBY_R, FLUID_RUBY_G, FLUID_RUBY_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * RUBY_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'ruby', rubyEnemies[i].x, rubyEnemies[i].y, getCachedLuckPercent());
      addKill('ruby');
      rubyEnemies.splice(i, 1);
    }
  }
  for (let i = rubyBolts.length - 1; i >= 0; i--) {
    if (rubyBolts[i].hp <= 0 || rubyBolts[i].lifeMs <= 0) rubyBolts.splice(i, 1);
  }
  for (let i = sunstoneEnemies.length - 1; i >= 0; i--) {
    if (sunstoneEnemies[i].hp <= 0) {
      fluid.addExplosion(sunstoneEnemies[i].x, sunstoneEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.6, FLUID_SUNSTONE_R, FLUID_SUNSTONE_G, FLUID_SUNSTONE_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * SUNSTONE_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'sunstone', sunstoneEnemies[i].x, sunstoneEnemies[i].y, getCachedLuckPercent());
      addKill('sunstone');
      sunstoneEnemies.splice(i, 1);
    }
  }
  for (let i = citrineEnemies.length - 1; i >= 0; i--) {
    if (citrineEnemies[i].hp <= 0) {
      fluid.addExplosion(citrineEnemies[i].x, citrineEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.8, FLUID_CITRINE_R, FLUID_CITRINE_G, FLUID_CITRINE_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * CITRINE_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'citrine', citrineEnemies[i].x, citrineEnemies[i].y, getCachedLuckPercent());
      addKill('citrine');
      citrineEnemies.splice(i, 1);
    }
  }
  for (let i = citrineBolts.length - 1; i >= 0; i--) {
    if (citrineBolts[i].hp <= 0) citrineBolts.splice(i, 1);
  }
  for (let i = ioliteEnemies.length - 1; i >= 0; i--) {
    if (ioliteEnemies[i].hp <= 0) {
      fluid.addExplosion(ioliteEnemies[i].x, ioliteEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 2.2, FLUID_IOLITE_R, FLUID_IOLITE_G, FLUID_IOLITE_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * IOLITE_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'iolite', ioliteEnemies[i].x, ioliteEnemies[i].y, getCachedLuckPercent());
      addKill('iolite');
      ioliteEnemies.splice(i, 1);
    }
  }
  for (let i = amethystEnemies.length - 1; i >= 0; i--) {
    if (amethystEnemies[i].hp <= 0) {
      fluid.addExplosion(amethystEnemies[i].x, amethystEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 2.5, FLUID_AMETHYST_R, FLUID_AMETHYST_G, FLUID_AMETHYST_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * AMETHYST_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'amethyst', amethystEnemies[i].x, amethystEnemies[i].y, getCachedLuckPercent());
      addKill('amethyst');
      amethystEnemies.splice(i, 1);
    }
  }
  for (let i = amethystShards.length - 1; i >= 0; i--) {
    if (amethystShards[i].hp <= 0 || amethystShards[i].lifeMs <= 0) amethystShards.splice(i, 1);
  }
  for (let i = diamondEnemies.length - 1; i >= 0; i--) {
    if (diamondEnemies[i].hp <= 0) {
      fluid.addExplosion(diamondEnemies[i].x, diamondEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 3.0, FLUID_DIAMOND_R, FLUID_DIAMOND_G, FLUID_DIAMOND_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * DIAMOND_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'diamond', diamondEnemies[i].x, diamondEnemies[i].y, getCachedLuckPercent());
      addKill('diamond');
      rpgSimState.lifetimeLateEnemyKills++;
      diamondEnemies.splice(i, 1);
    }
  }
  for (let i = diamondShards.length - 1; i >= 0; i--) {
    if (diamondShards[i].hp <= 0 || diamondShards[i].lifeMs <= 0) diamondShards.splice(i, 1);
  }
  for (let i = nullstoneEnemies.length - 1; i >= 0; i--) {
    if (nullstoneEnemies[i].hp <= 0) {
      fluid.addExplosion(nullstoneEnemies[i].x, nullstoneEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 4.0, FLUID_NULLSTONE_R, FLUID_NULLSTONE_G, FLUID_NULLSTONE_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * NULLSTONE_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'nullstone', nullstoneEnemies[i].x, nullstoneEnemies[i].y, getCachedLuckPercent());
      addKill('nullstone');
      rpgSimState.lifetimeLateEnemyKills++;
      nullstoneEnemies.splice(i, 1);
    }
  }
  for (let i = voidTendrils.length - 1; i >= 0; i--) {
    if (voidTendrils[i].hp <= 0 || voidTendrils[i].lifeMs <= 0) voidTendrils.splice(i, 1);
  }
  for (let i = fracterylEnemies.length - 1; i >= 0; i--) {
    if (fracterylEnemies[i].hp <= 0) {
      fluid.addExplosion(fracterylEnemies[i].x, fracterylEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 3.5, FLUID_FRACTERYL_R, FLUID_FRACTERYL_G, FLUID_FRACTERYL_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * FRACTERYL_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'fracteryl', fracterylEnemies[i].x, fracterylEnemies[i].y, getCachedLuckPercent());
      addKill('fracteryl');
      rpgSimState.lifetimeLateEnemyKills++;
      fracterylEnemies.splice(i, 1);
    }
  }
  for (let i = fracterylShards.length - 1; i >= 0; i--) {
    if (fracterylShards[i].hp <= 0 || fracterylShards[i].lifeMs <= 0) fracterylShards.splice(i, 1);
  }
  for (let i = eigensteinEnemies.length - 1; i >= 0; i--) {
    if (eigensteinEnemies[i].hp <= 0) {
      fluid.addExplosion(eigensteinEnemies[i].x, eigensteinEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 4.5, FLUID_EIGENSTEIN_R, FLUID_EIGENSTEIN_G, FLUID_EIGENSTEIN_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * EIGENSTEIN_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'eigenstein', eigensteinEnemies[i].x, eigensteinEnemies[i].y, getCachedLuckPercent());
      addKill('eigenstein');
      rpgSimState.lifetimeLateEnemyKills++;
      eigensteinEnemies.splice(i, 1);
    }
  }

  return totalXpFromKills;
}
