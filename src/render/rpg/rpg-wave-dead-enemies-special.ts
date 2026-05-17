import {
  getXpPerKill, formatXp, addXpWithAllocation,
  getBossXpMultiplier, getWaveStatScale,
} from '../../sim/rpg/rpg-state';
import {
  BOSS_GLOW_COLORS,
  FLUID_EXPLOSION_STRENGTH,
  FLUID_QUARTZ_R, FLUID_QUARTZ_G, FLUID_QUARTZ_B,
  FLUID_RUBY_R, FLUID_RUBY_G, FLUID_RUBY_B,
  FLUID_SUNSTONE_R, FLUID_SUNSTONE_G, FLUID_SUNSTONE_B,
  FLUID_CITRINE_R, FLUID_CITRINE_G, FLUID_CITRINE_B,
  FLUID_IOLITE_R, FLUID_IOLITE_G, FLUID_IOLITE_B,
  FLUID_AMETHYST_R, FLUID_AMETHYST_G, FLUID_AMETHYST_B,
  FLUID_DIAMOND_R, FLUID_DIAMOND_G, FLUID_DIAMOND_B,
  FLUID_NULLSTONE_R, FLUID_NULLSTONE_G, FLUID_NULLSTONE_B,
  FLUID_VOID_R, FLUID_VOID_G, FLUID_VOID_B,
} from './rpg-constants';
import {
  ELITE_QUARTZ_XP_MULT, ELITE_RUBY_XP_MULT, ELITE_SUNSTONE_XP_MULT,
  ELITE_CITRINE_XP_MULT, ELITE_IOLITE_XP_MULT, ELITE_AMETHYST_XP_MULT,
  ELITE_DIAMOND_XP_MULT, ELITE_NULLSTONE_XP_MULT,
} from './rpg-enemy-constants';
import { trySpawnLuckyMote } from './rpg-lucky-motes';
import { ALIVEN_FLUID_COLORS } from './rpg-aliven-constants';
import type { WaveManagerCtx } from './rpg-wave-manager';
import { recordAlivenKill } from '../../dev/session-telemetry';

const ALL_ELITE_TYPE_IDS = [
  'elite_quartz', 'elite_ruby', 'elite_sunstone', 'elite_citrine',
  'elite_iolite', 'elite_amethyst', 'elite_diamond', 'elite_nullstone',
] as const;

const ELITE_FLUID: Record<string, [number, number, number]> = {
  quartz: [FLUID_QUARTZ_R, FLUID_QUARTZ_G, FLUID_QUARTZ_B],
  ruby: [FLUID_RUBY_R, FLUID_RUBY_G, FLUID_RUBY_B],
  sunstone: [FLUID_SUNSTONE_R, FLUID_SUNSTONE_G, FLUID_SUNSTONE_B],
  citrine: [FLUID_CITRINE_R, FLUID_CITRINE_G, FLUID_CITRINE_B],
  iolite: [FLUID_IOLITE_R, FLUID_IOLITE_G, FLUID_IOLITE_B],
  amethyst: [FLUID_AMETHYST_R, FLUID_AMETHYST_G, FLUID_AMETHYST_B],
  diamond: [FLUID_DIAMOND_R, FLUID_DIAMOND_G, FLUID_DIAMOND_B],
  nullstone: [FLUID_NULLSTONE_R, FLUID_NULLSTONE_G, FLUID_NULLSTONE_B],
};

const ELITE_XP_MAP: Record<string, number> = {
  quartz: ELITE_QUARTZ_XP_MULT,
  ruby: ELITE_RUBY_XP_MULT,
  sunstone: ELITE_SUNSTONE_XP_MULT,
  citrine: ELITE_CITRINE_XP_MULT,
  iolite: ELITE_IOLITE_XP_MULT,
  amethyst: ELITE_AMETHYST_XP_MULT,
  diamond: ELITE_DIAMOND_XP_MULT,
  nullstone: ELITE_NULLSTONE_XP_MULT,
};

export function sweepEliteAndAlivenDefeats(
  ctx: WaveManagerCtx,
  addKill: (typeId: string) => void,
): number {
  const {
    rpgSimState,
    eliteEnemies,
    alivenGroups,
    luckyMotes,
    fluid,
    getCachedLuckPercent,
    spawnDamageNumber,
    getPlayerHpRatio,
  } = ctx;

  let totalXpFromKills = 0;

  for (let i = eliteEnemies.length - 1; i >= 0; i--) {
    if (eliteEnemies[i].hp <= 0) {
      const elite = eliteEnemies[i];
      const [fr, fg, fb] = ELITE_FLUID[elite.tier] ?? [255, 255, 255];
      fluid.addExplosion(elite.x, elite.y, FLUID_EXPLOSION_STRENGTH * 5.0, fr, fg, fb);
      fluid.addExplosion(elite.x, elite.y, FLUID_EXPLOSION_STRENGTH * 2.5, fb, fr, fg);
      const xpMult = ELITE_XP_MAP[elite.tier] ?? 10;
      totalXpFromKills += getXpPerKill(ctx.getCurrentWave()) * xpMult;
      trySpawnLuckyMote(luckyMotes, elite.tier, elite.x, elite.y, getCachedLuckPercent() * 2.5, true);
      spawnDamageNumber(elite.x, elite.y, 0, -1.2, `ELITE! +${formatXp(getXpPerKill(ctx.getCurrentWave()) * xpMult)} XP`, 1.0, '#ffe060');
      rpgSimState.lifetimeEliteKills++;
      addKill(`elite_${elite.tier}`);
      if (!rpgSimState.tookDamageThisWave) {
        rpgSimState.secretAchievementFlags.add('elite_kill_no_wave_damage');
      }
      const eliteAgeMs = performance.now() - elite.spawnTimeMs;
      if (eliteAgeMs <= 10_000) {
        rpgSimState.secretAchievementFlags.add('elite_kill_within_10s');
      }
      if (ALL_ELITE_TYPE_IDS.every(t => (rpgSimState.lifetimeKillsByType.get(t) ?? 0) >= 1)) {
        rpgSimState.secretAchievementFlags.add('killed_all_elite_types');
      }
      eliteEnemies.splice(i, 1);
    }
  }

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
    if (getPlayerHpRatio() < 0.25) {
      rpgSimState.secretAchievementFlags.add('aliven_below_25pct_hp');
    }
    alivenGroups.splice(i, 1);
  }

  return totalXpFromKills;
}

export function handleBossDefeat(ctx: WaveManagerCtx): void {
  const {
    rpgSimState,
    bossProjectiles,
    fluid,
    spawnDamageNumber,
    getPlayerHpRatio,
  } = ctx;
  const bossEnemy = ctx.getBossEnemy();
  if (!bossEnemy || bossEnemy.hp > 0) return;

  const speedPct = rpgSimState.bossSpeedPct;
  const xpMult = getBossXpMultiplier(speedPct);
  const bossXp = Math.ceil(getXpPerKill(ctx.getCurrentWave()) * getWaveStatScale(ctx.getCurrentWave()) * 5.0 * xpMult);
  addXpWithAllocation(rpgSimState, bossXp);

  if (ctx.getIsBossFightFromMenu()) {
    const prevBest = rpgSimState.bossCompletions.get(bossEnemy.bossId) ?? 0;
    if (speedPct > prevBest) {
      rpgSimState.bossCompletions.set(bossEnemy.bossId, speedPct);
    }
    if (rpgSimState.equippedWeaponIds.size === 1) {
      rpgSimState.bossDefeated1Weapon = true;
    }
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
    if (rpgSimState.rpgUpgradeLevels.size === 0 ||
        Array.from(rpgSimState.rpgUpgradeLevels.values()).every(v => v <= 0)) {
      rpgSimState.secretAchievementFlags.add('boss_no_rpg_upgrades');
    }
    if (rpgSimState.xpAllocatedStats.length >= 3) {
      rpgSimState.secretAchievementFlags.add('xp_3stats_boss');
    }
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
