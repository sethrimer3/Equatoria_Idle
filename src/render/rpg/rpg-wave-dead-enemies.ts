/**
 * rpg-wave-dead-enemies.ts — Dead enemy sweep logic for the RPG wave system.
 *
 * Extracted from rpg-wave-manager.ts to keep that module focused on wave lifecycle
 * orchestration. This module owns the full dead-enemy sweep pass:
 *
 *   • Loops backward over every enemy array
 *   • Triggers fluid explosion at death position
 *   • Accumulates XP from kills
 *   • Attempts lucky-mote spawn for main enemy types
 *   • Increments per-type kill counters
 *   • Handles elite enemy death with secret achievement flags
 *   • Handles aliven group defeat
 *   • Handles boss defeat (XP, completion tracking, secret flags)
 *   • Applies accumulated XP and refreshes equipment stats
 *
 * The single exported function `removeDeadEnemiesImpl` receives the full
 * WaveManagerCtx and an `addKill` callback (owned by rpg-wave-manager.ts).
 */

import {
  getXpPerKill, formatXp, addXpWithAllocation,
  getBossXpMultiplier, getWaveStatScale,
} from '../../sim/rpg/rpg-state';
import {
  BOSS_GLOW_COLORS,
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
  ELITE_QUARTZ_XP_MULT, ELITE_RUBY_XP_MULT, ELITE_SUNSTONE_XP_MULT,
  ELITE_CITRINE_XP_MULT, ELITE_IOLITE_XP_MULT, ELITE_AMETHYST_XP_MULT,
  ELITE_DIAMOND_XP_MULT, ELITE_NULLSTONE_XP_MULT,
} from './rpg-enemy-constants';
import { trySpawnLuckyMote } from './rpg-lucky-motes';
import { ALIVEN_FLUID_COLORS } from './rpg-aliven-constants';
import type { WaveManagerCtx } from './rpg-wave-manager';
import { recordAlivenKill } from '../../dev/session-telemetry';

/** All elite type IDs used for the "killed all elite types" secret achievement. */
const ALL_ELITE_TYPE_IDS = [
  'elite_quartz', 'elite_ruby', 'elite_sunstone', 'elite_citrine',
  'elite_iolite', 'elite_amethyst', 'elite_diamond', 'elite_nullstone',
] as const;

/**
 * Sweep all enemy arrays for dead entities, award XP, handle boss defeat, and
 * apply equipment stat refresh if any XP was earned.
 *
 * @param ctx       Full WaveManagerCtx dependency-injection object.
 * @param addKill   Callback that increments the per-type lifetime kill counter.
 */
export function removeDeadEnemiesImpl(
  ctx: WaveManagerCtx,
  addKill: (typeId: string) => void,
): void {
  const {
    rpgSimState,
    enemies, sapphireMissiles, sapphireEnemies, emeraldEnemies,
    amberEnemies, amberShards, voidEnemies, quartzEnemies, quartzSpikes,
    rubyEnemies, rubyBolts, sunstoneEnemies, citrineEnemies, citrineBolts,
    ioliteEnemies, amethystEnemies, amethystShards, diamondEnemies, diamondShards,
    nullstoneEnemies, voidTendrils, fracterylEnemies, fracterylShards, eigensteinEnemies,
    eliteEnemies, alivenGroups,
    bossProjectiles, luckyMotes, fluid,
    getCachedLuckPercent, applyEquipmentStats, spawnDamageNumber, getPlayerHpRatio,
  } = ctx;

  let totalXpFromKills = 0;

  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].hp <= 0) {
      fluid.addExplosion(
        enemies[i].x, enemies[i].y,
        FLUID_EXPLOSION_STRENGTH,
        FLUID_LASER_R, FLUID_LASER_G, FLUID_LASER_B,
      );
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * LASER_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'laser', enemies[i].x, enemies[i].y, getCachedLuckPercent());
      addKill('laser');
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
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * SAPPHIRE_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'sapphire', sapphireEnemies[i].x, sapphireEnemies[i].y, getCachedLuckPercent());
      addKill('sapphire');
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
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * EMERALD_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'emerald', emeraldEnemies[i].x, emeraldEnemies[i].y, getCachedLuckPercent());
      addKill('emerald');
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
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * AMBER_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'amber', amberEnemies[i].x, amberEnemies[i].y, getCachedLuckPercent());
      addKill('amber');
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
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * VOID_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'void', voidEnemies[i].x, voidEnemies[i].y, getCachedLuckPercent());
      addKill('void');
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
      fluid.addExplosion(
        rubyEnemies[i].x, rubyEnemies[i].y,
        FLUID_EXPLOSION_STRENGTH * 1.2,
        FLUID_RUBY_R, FLUID_RUBY_G, FLUID_RUBY_B,
      );
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
      fluid.addExplosion(
        sunstoneEnemies[i].x, sunstoneEnemies[i].y,
        FLUID_EXPLOSION_STRENGTH * 1.6,
        FLUID_SUNSTONE_R, FLUID_SUNSTONE_G, FLUID_SUNSTONE_B,
      );
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * SUNSTONE_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'sunstone', sunstoneEnemies[i].x, sunstoneEnemies[i].y, getCachedLuckPercent());
      addKill('sunstone');
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
      fluid.addExplosion(
        ioliteEnemies[i].x, ioliteEnemies[i].y,
        FLUID_EXPLOSION_STRENGTH * 2.2,
        FLUID_IOLITE_R, FLUID_IOLITE_G, FLUID_IOLITE_B,
      );
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * IOLITE_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'iolite', ioliteEnemies[i].x, ioliteEnemies[i].y, getCachedLuckPercent());
      addKill('iolite');
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
      fluid.addExplosion(
        diamondEnemies[i].x, diamondEnemies[i].y,
        FLUID_EXPLOSION_STRENGTH * 3.0,
        FLUID_DIAMOND_R, FLUID_DIAMOND_G, FLUID_DIAMOND_B,
      );
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
      fluid.addExplosion(
        nullstoneEnemies[i].x, nullstoneEnemies[i].y,
        FLUID_EXPLOSION_STRENGTH * 4.0,
        FLUID_NULLSTONE_R, FLUID_NULLSTONE_G, FLUID_NULLSTONE_B,
      );
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
      fluid.addExplosion(
        fracterylEnemies[i].x, fracterylEnemies[i].y,
        FLUID_EXPLOSION_STRENGTH * 3.5,
        FLUID_FRACTERYL_R, FLUID_FRACTERYL_G, FLUID_FRACTERYL_B,
      );
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
      fluid.addExplosion(
        eigensteinEnemies[i].x, eigensteinEnemies[i].y,
        FLUID_EXPLOSION_STRENGTH * 4.5,
        FLUID_EIGENSTEIN_R, FLUID_EIGENSTEIN_G, FLUID_EIGENSTEIN_B,
      );
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * EIGENSTEIN_XP_MULT;
      trySpawnLuckyMote(luckyMotes, 'eigenstein', eigensteinEnemies[i].x, eigensteinEnemies[i].y, getCachedLuckPercent());
      addKill('eigenstein');
      rpgSimState.lifetimeLateEnemyKills++;
      eigensteinEnemies.splice(i, 1);
    }
  }
  for (let i = eliteEnemies.length - 1; i >= 0; i--) {
    if (eliteEnemies[i].hp <= 0) {
      const elite = eliteEnemies[i];
      const ELITE_FLUID: Record<string, [number, number, number]> = {
        quartz:    [FLUID_QUARTZ_R,    FLUID_QUARTZ_G,    FLUID_QUARTZ_B],
        ruby:      [FLUID_RUBY_R,      FLUID_RUBY_G,      FLUID_RUBY_B],
        sunstone:  [FLUID_SUNSTONE_R,  FLUID_SUNSTONE_G,  FLUID_SUNSTONE_B],
        citrine:   [FLUID_CITRINE_R,   FLUID_CITRINE_G,   FLUID_CITRINE_B],
        iolite:    [FLUID_IOLITE_R,    FLUID_IOLITE_G,    FLUID_IOLITE_B],
        amethyst:  [FLUID_AMETHYST_R,  FLUID_AMETHYST_G,  FLUID_AMETHYST_B],
        diamond:   [FLUID_DIAMOND_R,   FLUID_DIAMOND_G,   FLUID_DIAMOND_B],
        nullstone: [FLUID_NULLSTONE_R, FLUID_NULLSTONE_G, FLUID_NULLSTONE_B],
      };
      const ELITE_XP_MAP: Record<string, number> = {
        quartz: ELITE_QUARTZ_XP_MULT, ruby: ELITE_RUBY_XP_MULT,
        sunstone: ELITE_SUNSTONE_XP_MULT, citrine: ELITE_CITRINE_XP_MULT,
        iolite: ELITE_IOLITE_XP_MULT, amethyst: ELITE_AMETHYST_XP_MULT,
        diamond: ELITE_DIAMOND_XP_MULT, nullstone: ELITE_NULLSTONE_XP_MULT,
      };
      const [fr, fg, fb] = ELITE_FLUID[elite.tier] ?? [255, 255, 255];
      fluid.addExplosion(elite.x, elite.y, FLUID_EXPLOSION_STRENGTH * 5.0, fr, fg, fb);
      // Second colorful burst for spectacle
      fluid.addExplosion(elite.x, elite.y, FLUID_EXPLOSION_STRENGTH * 2.5, fb, fr, fg);
      const xpMult = ELITE_XP_MAP[elite.tier] ?? 10;
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * xpMult;
      trySpawnLuckyMote(luckyMotes, elite.tier, elite.x, elite.y, getCachedLuckPercent() * 2.5, true);
      spawnDamageNumber(elite.x, elite.y, 0, -1.2, `ELITE! +${formatXp(getXpPerKill(ctx.getCurrentWave()) * xpMult)} XP`, 1.0, '#ffe060');
      rpgSimState.lifetimeEliteKills++;
      addKill(`elite_${elite.tier}`);
      // Secret flags: elite_kill_no_wave_damage, elite_kill_within_10s, killed_all_elite_types
      if (!rpgSimState.tookDamageThisWave) {
        rpgSimState.secretAchievementFlags.add('elite_kill_no_wave_damage');
      }
      const eliteAgeMs = performance.now() - elite.spawnTimeMs;
      if (eliteAgeMs <= 10_000) {
        rpgSimState.secretAchievementFlags.add('elite_kill_within_10s');
      }
      // Check if all 8 elite types have now been killed
      if (ALL_ELITE_TYPE_IDS.every(t => (rpgSimState.lifetimeKillsByType.get(t) ?? 0) >= 1)) {
        rpgSimState.secretAchievementFlags.add('killed_all_elite_types');
      }
      eliteEnemies.splice(i, 1);
    }
  }
  // Aliven group defeat: award XP when all spawned particles are dead
  for (let i = alivenGroups.length - 1; i >= 0; i--) {
    const group = alivenGroups[i];
    if (group.spawnedCount < group.targetCount) continue;
    if (group.aliveCount > 0) continue;
    const [fr, fg, fb] = ALIVEN_FLUID_COLORS[group.tierId] ?? [180, 180, 255];
    fluid.addExplosion(group.x, group.y, FLUID_EXPLOSION_STRENGTH * 1.5, fr, fg, fb);
    const groupXp = getXpPerKill(ctx.getCurrentWave()) * group.xpMult;
    totalXpFromKills += groupXp;
    trySpawnLuckyMote(luckyMotes, group.tierId, group.x, group.y, getCachedLuckPercent());
    spawnDamageNumber(group.x, group.y, 0, -0.8, `+${formatXp(groupXp)} XP`, 0.8, '#aaeeff');
    rpgSimState.lifetimeAlivenKills++;
    recordAlivenKill(group.variantId);
    // Secret flag: aliven_below_25pct_hp
    if (getPlayerHpRatio() < 0.25) {
      rpgSimState.secretAchievementFlags.add('aliven_below_25pct_hp');
    }
    alivenGroups.splice(i, 1);
  }
  // Boss defeat
  const bossEnemy = ctx.getBossEnemy();
  if (bossEnemy && bossEnemy.hp <= 0) {
    const speedPct = rpgSimState.bossSpeedPct;
    const xpMult = getBossXpMultiplier(speedPct);
    const bossXp = Math.ceil(getXpPerKill(ctx.getCurrentWave()) * getWaveStatScale(ctx.getCurrentWave()) * 5.0 * xpMult);
    addXpWithAllocation(rpgSimState, bossXp);
    if (ctx.getIsBossFightFromMenu()) {
      const prevBest = rpgSimState.bossCompletions.get(bossEnemy.bossId) ?? 0;
      if (speedPct > prevBest) {
        rpgSimState.bossCompletions.set(bossEnemy.bossId, speedPct);
      }
      // Track boss defeated with only 1 weapon equipped
      if (rpgSimState.equippedWeaponIds.size === 1) {
        rpgSimState.bossDefeated1Weapon = true;
      }
      // Secret flags for boss defeats
      const hpRatio = getPlayerHpRatio();
      if (hpRatio < 0.1) {
        rpgSimState.secretAchievementFlags.add('boss_below_10pct_hp');
      }
      if (speedPct >= 100 && !rpgSimState.tookDamageThisWave) {
        rpgSimState.secretAchievementFlags.add('boss_100_no_damage');
      }
      if (bossEnemy.bossId === 1 && speedPct >= 100 && rpgSimState.highestWaveReached < 150) {
        rpgSimState.secretAchievementFlags.add('boss1_before_wave150');
      }
      // boss_no_rpg_upgrades: no RPG upgrade levels at all
      if (rpgSimState.rpgUpgradeLevels.size === 0 ||
          Array.from(rpgSimState.rpgUpgradeLevels.values()).every(v => v <= 0)) {
        rpgSimState.secretAchievementFlags.add('boss_no_rpg_upgrades');
      }
      // xp_3stats_boss: XP wired to 3 stats when boss is defeated
      if (rpgSimState.xpAllocatedStats.length >= 3) {
        rpgSimState.secretAchievementFlags.add('xp_3stats_boss');
      }
      // boss_all_weapons_tier1: all equipped weapons are tier 1
      const allTier1 = Array.from(rpgSimState.equippedWeaponIds).every(
        wid => (rpgSimState.weaponTiersByWeaponId.get(wid) ?? 1) <= 1,
      );
      if (allTier1 && rpgSimState.equippedWeaponIds.size > 0) {
        rpgSimState.secretAchievementFlags.add('boss_all_weapons_tier1');
      }
    }
    ctx.setIsBossFightFromMenu(false);
    ctx.exitBossWave();
    const glowC = BOSS_GLOW_COLORS[Math.min(bossEnemy.bossId, BOSS_GLOW_COLORS.length - 1)];
    spawnDamageNumber(bossEnemy.x, bossEnemy.y, 0, -1, `BOSS! +${formatXp(bossXp)} XP (${xpMult.toFixed(0)}x)`, 1.0, glowC);
    fluid.addExplosion(bossEnemy.x, bossEnemy.y, FLUID_EXPLOSION_STRENGTH * 2.5, FLUID_VOID_R, FLUID_VOID_G, FLUID_VOID_B);
    ctx.setBossEnemy(null);
    bossProjectiles.length = 0;
  }
  if (totalXpFromKills > 0) {
    addXpWithAllocation(rpgSimState, totalXpFromKills);
    applyEquipmentStats();
  }
}
