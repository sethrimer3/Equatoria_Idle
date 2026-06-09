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
  FLUID_PROC_R, FLUID_PROC_G, FLUID_PROC_B,
} from './rpg-constants';
import {
  LASER_XP_MULT, SAPPHIRE_XP_MULT, EMERALD_XP_MULT, AMBER_XP_MULT, VOID_XP_MULT,
  QUARTZ_XP_MULT, RUBY_XP_MULT, SUNSTONE_XP_MULT, CITRINE_XP_MULT,
  IOLITE_XP_MULT, AMETHYST_XP_MULT, DIAMOND_XP_MULT, NULLSTONE_XP_MULT,
  FRACTERYL_XP_MULT, EIGENSTEIN_XP_MULT,
} from './rpg-enemy-constants';
import { PENTAGON_XP_MULT, FLUID_PENTAGON_R, FLUID_PENTAGON_G, FLUID_PENTAGON_B } from './horizon-pentagon-constants';
import {
  DUSTWISP_XP_MULT, RIBBONWORM_XP_MULT, LANTERNMOTH_XP_MULT, EYESTALK_XP_MULT,
  JELLYFISH_XP_MULT, CLOTHGHOST_XP_MULT, PLANTTURRET_XP_MULT, GEARINSECT_XP_MULT,
  SPIDERCRAWLER_XP_MULT, MOTESWARM_XP_MULT, SHADOWHAND_XP_MULT,
  SANDFISH_XP_MULT, QUARTZFISH_XP_MULT, RUBYFISH_XP_MULT, SUNSTONEFISH_XP_MULT,
  EMERALDFISH_XP_MULT, SAPPHIREFISH_XP_MULT, AMETHYSTFISH_XP_MULT, DIAMONDFISH_XP_MULT,
} from './rpg-procedural-constants';
import {
  BASIC_JELLYFISH_XP_MULT, LONGTAIL_JELLYFISH_XP_MULT,
  WHIPLASH_JELLYFISH_XP_MULT, ENCIRCLING_JELLYFISH_XP_MULT,
  FLUID_ELITE_JELLYFISH_R, FLUID_ELITE_JELLYFISH_G, FLUID_ELITE_JELLYFISH_B,
} from './rpg-jellyfish-elite-constants';
import { trySpawnLuckyMote } from './rpg-lucky-motes';
import { pushDyingEnemy } from './rpg-death-fade';
import { makeEmeraldFishMini } from './rpg-procedural-factories';
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
    polyominoEnemies, fissilePolyominoEnemies, refractorPolyominoEnemies,
    dustWispEnemies, ribbonWormEnemies, lanternMothEnemies, eyeStalkEnemies,
    jellyfishEnemies, eliteJellyfishEnemies, clothGhostEnemies, plantTurretEnemies, gearInsectEnemies,
    spiderCrawlerEnemies, moteSwarmEnemies, shadowHandEnemies,
    sandFishEnemies, quartzFishEnemies, rubyFishEnemies, sunstoneFishEnemies,
    emeraldFishEnemies, sapphireFishEnemies, amethystFishEnemies, diamondFishEnemies,
    plantProjectiles, fishMines, fishSpikes, fishBolts, fishDecoys,
    horizonPentagonGroups,
    luckyMotes, fluid, getCachedLuckPercent,
  } = ctx;

  let totalXpFromKills = 0;

  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].hp <= 0) {
      pushDyingEnemy(enemies[i].x, enemies[i].y, FLUID_LASER_R, FLUID_LASER_G, FLUID_LASER_B, 4);
      fluid.addExplosion(enemies[i].x, enemies[i].y, FLUID_EXPLOSION_STRENGTH, FLUID_LASER_R, FLUID_LASER_G, FLUID_LASER_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * LASER_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'laser', enemies[i].x, enemies[i].y, getCachedLuckPercent());
      addKill('laser');
      enemies.splice(i, 1);
    }
  }
  for (let i = sapphireEnemies.length - 1; i >= 0; i--) {
    if (sapphireEnemies[i].hp <= 0) {
      pushDyingEnemy(sapphireEnemies[i].x, sapphireEnemies[i].y, FLUID_SAPPH_R, FLUID_SAPPH_G, FLUID_SAPPH_B, 5);
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
      pushDyingEnemy(emeraldEnemies[i].x, emeraldEnemies[i].y, FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B, 6);
      fluid.addExplosion(emeraldEnemies[i].x, emeraldEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.1, FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * EMERALD_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'emerald', emeraldEnemies[i].x, emeraldEnemies[i].y, getCachedLuckPercent());
      addKill('emerald');
      emeraldEnemies.splice(i, 1);
    }
  }
  for (let i = amberEnemies.length - 1; i >= 0; i--) {
    if (amberEnemies[i].hp <= 0) {
      pushDyingEnemy(amberEnemies[i].x, amberEnemies[i].y, FLUID_AMBER_R, FLUID_AMBER_G, FLUID_AMBER_B, 6);
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
      pushDyingEnemy(voidEnemies[i].x, voidEnemies[i].y, FLUID_VOID_R, FLUID_VOID_G, FLUID_VOID_B, 6);
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
  for (let i = polyominoEnemies.length - 1; i >= 0; i--) {
    if (polyominoEnemies[i].hp <= 0) {
      fluid.addExplosion(polyominoEnemies[i].x, polyominoEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.7, FLUID_PROC_R, FLUID_PROC_G, FLUID_PROC_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * 2.2;
      trySpawnLuckyMote(luckyMotes, 'verdure_polyomino', polyominoEnemies[i].x, polyominoEnemies[i].y, getCachedLuckPercent());
      addKill('verdure_polyomino');
      polyominoEnemies.splice(i, 1);
    }
  }
  for (let i = fissilePolyominoEnemies.length - 1; i >= 0; i--) {
    if (fissilePolyominoEnemies[i].hp <= 0) {
      fluid.addExplosion(fissilePolyominoEnemies[i].x, fissilePolyominoEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.9, FLUID_PROC_R, FLUID_PROC_G, FLUID_PROC_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * 2.6;
      trySpawnLuckyMote(luckyMotes, 'verdure_polyomino_fissile', fissilePolyominoEnemies[i].x, fissilePolyominoEnemies[i].y, getCachedLuckPercent());
      addKill('verdure_polyomino_fissile');
      fissilePolyominoEnemies.splice(i, 1);
    }
  }
  for (let i = refractorPolyominoEnemies.length - 1; i >= 0; i--) {
    if (refractorPolyominoEnemies[i].hp <= 0) {
      fluid.addExplosion(refractorPolyominoEnemies[i].x, refractorPolyominoEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 2.0, FLUID_PROC_R, FLUID_PROC_G, FLUID_PROC_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * 2.8;
      trySpawnLuckyMote(luckyMotes, 'verdure_polyomino_refractor', refractorPolyominoEnemies[i].x, refractorPolyominoEnemies[i].y, getCachedLuckPercent());
      addKill('verdure_polyomino_refractor');
      refractorPolyominoEnemies.splice(i, 1);
    }
  }

  // ── Procedural creature dead-enemy sweeps ────────────────────────────────────
  for (let i = dustWispEnemies.length - 1; i >= 0; i--) {
    if (dustWispEnemies[i].hp <= 0) {
      fluid.addExplosion(dustWispEnemies[i].x, dustWispEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.0, FLUID_PROC_R, FLUID_PROC_G, FLUID_PROC_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * DUSTWISP_XP_MULT;
      addKill('proc_dustwisp'); dustWispEnemies.splice(i, 1);
    }
  }
  for (let i = ribbonWormEnemies.length - 1; i >= 0; i--) {
    if (ribbonWormEnemies[i].hp <= 0) {
      fluid.addExplosion(ribbonWormEnemies[i].x, ribbonWormEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.2, FLUID_PROC_R, FLUID_PROC_G, FLUID_PROC_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * RIBBONWORM_XP_MULT;
      addKill('proc_ribbonworm'); ribbonWormEnemies.splice(i, 1);
    }
  }
  for (let i = lanternMothEnemies.length - 1; i >= 0; i--) {
    if (lanternMothEnemies[i].hp <= 0) {
      fluid.addExplosion(lanternMothEnemies[i].x, lanternMothEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.1, FLUID_PROC_R, FLUID_PROC_G, FLUID_PROC_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * LANTERNMOTH_XP_MULT;
      addKill('proc_lanternmoth'); lanternMothEnemies.splice(i, 1);
    }
  }
  for (let i = eyeStalkEnemies.length - 1; i >= 0; i--) {
    if (eyeStalkEnemies[i].hp <= 0) {
      fluid.addExplosion(eyeStalkEnemies[i].x, eyeStalkEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.3, FLUID_PROC_R, FLUID_PROC_G, FLUID_PROC_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * EYESTALK_XP_MULT;
      addKill('proc_eyestalk'); eyeStalkEnemies.splice(i, 1);
    }
  }
  for (let i = jellyfishEnemies.length - 1; i >= 0; i--) {
    if (jellyfishEnemies[i].hp <= 0) {
      fluid.addExplosion(jellyfishEnemies[i].x, jellyfishEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.4, FLUID_PROC_R, FLUID_PROC_G, FLUID_PROC_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * JELLYFISH_XP_MULT;
      addKill('proc_jellyfish'); jellyfishEnemies.splice(i, 1);
    }
  }
  for (let i = eliteJellyfishEnemies.length - 1; i >= 0; i--) {
    if (eliteJellyfishEnemies[i].hp <= 0) {
      const e = eliteJellyfishEnemies[i];
      fluid.addExplosion(e.x, e.y, FLUID_EXPLOSION_STRENGTH * 2.0, FLUID_ELITE_JELLYFISH_R, FLUID_ELITE_JELLYFISH_G, FLUID_ELITE_JELLYFISH_B);
      const xpMult = e.variant === 'longtail' ? LONGTAIL_JELLYFISH_XP_MULT
        : e.variant === 'whiplash' ? WHIPLASH_JELLYFISH_XP_MULT
        : e.variant === 'encircling' ? ENCIRCLING_JELLYFISH_XP_MULT
        : BASIC_JELLYFISH_XP_MULT;
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * xpMult;
      trySpawnLuckyMote(luckyMotes, `proc_jellyfish_elite_${e.variant}`, e.x, e.y, getCachedLuckPercent());
      addKill(`proc_jellyfish_elite_${e.variant}`); eliteJellyfishEnemies.splice(i, 1);
    }
  }
  for (let i = clothGhostEnemies.length - 1; i >= 0; i--) {
    if (clothGhostEnemies[i].hp <= 0) {
      fluid.addExplosion(clothGhostEnemies[i].x, clothGhostEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.2, FLUID_PROC_R, FLUID_PROC_G, FLUID_PROC_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * CLOTHGHOST_XP_MULT;
      addKill('proc_clothghost'); clothGhostEnemies.splice(i, 1);
    }
  }
  for (let i = plantTurretEnemies.length - 1; i >= 0; i--) {
    if (plantTurretEnemies[i].hp <= 0) {
      fluid.addExplosion(plantTurretEnemies[i].x, plantTurretEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.6, FLUID_PROC_R, FLUID_PROC_G, FLUID_PROC_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * PLANTTURRET_XP_MULT;
      addKill('proc_plantturret'); plantTurretEnemies.splice(i, 1);
    }
  }
  for (let i = plantProjectiles.length - 1; i >= 0; i--) {
    if (plantProjectiles[i].hp <= 0 || plantProjectiles[i].lifeMs <= 0) plantProjectiles.splice(i, 1);
  }
  for (let i = gearInsectEnemies.length - 1; i >= 0; i--) {
    if (gearInsectEnemies[i].hp <= 0) {
      fluid.addExplosion(gearInsectEnemies[i].x, gearInsectEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.8, FLUID_PROC_R, FLUID_PROC_G, FLUID_PROC_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * GEARINSECT_XP_MULT;
      addKill('proc_gearinsect'); gearInsectEnemies.splice(i, 1);
    }
  }
  for (let i = spiderCrawlerEnemies.length - 1; i >= 0; i--) {
    if (spiderCrawlerEnemies[i].hp <= 0) {
      fluid.addExplosion(spiderCrawlerEnemies[i].x, spiderCrawlerEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.6, FLUID_PROC_R, FLUID_PROC_G, FLUID_PROC_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * SPIDERCRAWLER_XP_MULT;
      addKill('proc_spidercrawler'); spiderCrawlerEnemies.splice(i, 1);
    }
  }
  for (let i = moteSwarmEnemies.length - 1; i >= 0; i--) {
    if (moteSwarmEnemies[i].hp <= 0) {
      fluid.addExplosion(moteSwarmEnemies[i].x, moteSwarmEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.4, FLUID_PROC_R, FLUID_PROC_G, FLUID_PROC_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * MOTESWARM_XP_MULT;
      addKill('proc_moteswarm'); moteSwarmEnemies.splice(i, 1);
    }
  }
  for (let i = shadowHandEnemies.length - 1; i >= 0; i--) {
    if (shadowHandEnemies[i].hp <= 0) {
      fluid.addExplosion(shadowHandEnemies[i].x, shadowHandEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 2.2, FLUID_PROC_R, FLUID_PROC_G, FLUID_PROC_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * SHADOWHAND_XP_MULT;
      addKill('proc_shadowhand'); shadowHandEnemies.splice(i, 1);
    }
  }
  for (let i = sandFishEnemies.length - 1; i >= 0; i--) {
    if (sandFishEnemies[i].hp <= 0) {
      fluid.addExplosion(sandFishEnemies[i].x, sandFishEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.1, FLUID_PROC_R, FLUID_PROC_G, FLUID_PROC_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * SANDFISH_XP_MULT;
      addKill('proc_sandfish'); sandFishEnemies.splice(i, 1);
    }
  }
  for (let i = quartzFishEnemies.length - 1; i >= 0; i--) {
    if (quartzFishEnemies[i].hp <= 0) {
      fluid.addExplosion(quartzFishEnemies[i].x, quartzFishEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.3, FLUID_PROC_R, FLUID_PROC_G, FLUID_PROC_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * QUARTZFISH_XP_MULT;
      addKill('proc_quartzfish'); quartzFishEnemies.splice(i, 1);
    }
  }
  for (let i = rubyFishEnemies.length - 1; i >= 0; i--) {
    if (rubyFishEnemies[i].hp <= 0) {
      fluid.addExplosion(rubyFishEnemies[i].x, rubyFishEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.4, FLUID_PROC_R, FLUID_PROC_G, FLUID_PROC_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * RUBYFISH_XP_MULT;
      addKill('proc_rubyfish'); rubyFishEnemies.splice(i, 1);
    }
  }
  for (let i = sunstoneFishEnemies.length - 1; i >= 0; i--) {
    if (sunstoneFishEnemies[i].hp <= 0) {
      fluid.addExplosion(sunstoneFishEnemies[i].x, sunstoneFishEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.5, FLUID_PROC_R, FLUID_PROC_G, FLUID_PROC_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * SUNSTONEFISH_XP_MULT;
      addKill('proc_sunstonefish'); sunstoneFishEnemies.splice(i, 1);
    }
  }
  for (let i = emeraldFishEnemies.length - 1; i >= 0; i--) {
    if (emeraldFishEnemies[i].hp <= 0) {
      const fish = emeraldFishEnemies[i];
      fluid.addExplosion(fish.x, fish.y, FLUID_EXPLOSION_STRENGTH * 1.25, FLUID_PROC_R, FLUID_PROC_G, FLUID_PROC_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * EMERALDFISH_XP_MULT;
      addKill('proc_emeraldfish');
      if (!fish.isMini && !fish.splitDone) {
        for (let s = 0; s < 2; s++) {
          const angle = (s / 2) * Math.PI + Math.random() * 0.35;
          emeraldFishEnemies.push(makeEmeraldFishMini(fish.x + Math.cos(angle) * 8, fish.y + Math.sin(angle) * 8, ctx.getCurrentWave(), angle));
        }
      }
      emeraldFishEnemies.splice(i, 1);
    }
  }
  for (let i = sapphireFishEnemies.length - 1; i >= 0; i--) {
    if (sapphireFishEnemies[i].hp <= 0) {
      fluid.addExplosion(sapphireFishEnemies[i].x, sapphireFishEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.35, FLUID_PROC_R, FLUID_PROC_G, FLUID_PROC_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * SAPPHIREFISH_XP_MULT;
      addKill('proc_sapphirefish'); sapphireFishEnemies.splice(i, 1);
    }
  }
  for (let i = amethystFishEnemies.length - 1; i >= 0; i--) {
    if (amethystFishEnemies[i].hp <= 0) {
      fluid.addExplosion(amethystFishEnemies[i].x, amethystFishEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.35, FLUID_PROC_R, FLUID_PROC_G, FLUID_PROC_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * AMETHYSTFISH_XP_MULT;
      addKill('proc_amethystfish'); amethystFishEnemies.splice(i, 1);
    }
  }
  for (let i = diamondFishEnemies.length - 1; i >= 0; i--) {
    if (diamondFishEnemies[i].hp <= 0) {
      fluid.addExplosion(diamondFishEnemies[i].x, diamondFishEnemies[i].y, FLUID_EXPLOSION_STRENGTH * 1.8, FLUID_PROC_R, FLUID_PROC_G, FLUID_PROC_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * DIAMONDFISH_XP_MULT;
      addKill('proc_diamondfish'); diamondFishEnemies.splice(i, 1);
    }
  }
  for (let i = fishMines.length - 1; i >= 0; i--) {
    if (fishMines[i].lifeMs <= 0) fishMines.splice(i, 1);
  }
  for (let i = fishSpikes.length - 1; i >= 0; i--) {
    if (fishSpikes[i].lifeMs <= 0 || fishSpikes[i].hasHit) fishSpikes.splice(i, 1);
  }
  for (let i = fishBolts.length - 1; i >= 0; i--) {
    if (fishBolts[i].lifeMs <= 0 || fishBolts[i].hasHit) fishBolts.splice(i, 1);
  }
  for (let i = fishDecoys.length - 1; i >= 0; i--) {
    if (fishDecoys[i].lifeMs <= 0) fishDecoys.splice(i, 1);
  }

  for (let i = horizonPentagonGroups.length - 1; i >= 0; i--) {
    const g = horizonPentagonGroups[i]!;
    if (g.hp <= 0) {
      fluid.addExplosion(g.x, g.y, FLUID_EXPLOSION_STRENGTH * 3.0, FLUID_PENTAGON_R, FLUID_PENTAGON_G, FLUID_PENTAGON_B);
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * PENTAGON_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'horizon_pentagon', g.x, g.y, getCachedLuckPercent());
      addKill('horizon_pentagon');
      rpgSimState.lifetimeLateEnemyKills++;
      horizonPentagonGroups.splice(i, 1);
    }
  }
  return totalXpFromKills;
}
