/**
 * achievementHooks.ts — thin call sites for the rest of the game to report
 * gameplay events to the platform achievement framework. Callers only ever
 * pass internal ids/facts about what happened — never platform ids.
 */

import { AchievementService } from './achievementService';

let service: AchievementService | null = null;

/** Wire up the singleton service instance used by the hooks below. */
export function setAchievementService(instance: AchievementService | null): void {
  service = instance;
}

/** Clear a registration only if it still belongs to the disposing runtime. */
export function clearAchievementService(instance: AchievementService): void {
  if (service === instance) service = null;
}

export function getAchievementService(): AchievementService | null {
  return service;
}

export function onEnemyDefeated(): void {
  if (!service) return;
  service.unlock('FIRST_BLOOD');
  service.increment('ENEMY_COUNT_100', 1);
  service.increment('ENEMY_COUNT_1000', 1);
}

export function onBossDefeated(): void {
  if (!service) return;
  service.unlock('BOSS_SLAYER');
  service.increment('BOSS_COUNT_10', 1);
}

export function onMoteForged(): void {
  if (!service) return;
  service.unlock('MOTE_AWAKENED');
  service.increment('MOTE_COUNT_50', 1);
}

export function onSkillUnlocked(): void {
  if (!service) return;
  service.unlock('SKILL_UNLOCKED');
}

export function onZoneEntered(zoneId: string): void {
  if (!service) return;
  if (zoneId === 'life') {
    service.unlock('LIFE_DISCOVERED');
    return;
  }
  if (zoneId !== 'euhedral') {
    service.unlock('ZONE_EXPLORER');
  }
}

export function onWaveClearedWithSingleWeapon(): void {
  if (!service) return;
  service.unlock('GLASS_CANNON');
}

export function onWaveClearedAt1Hp(): void {
  if (!service) return;
  service.unlock('NEAR_DEATH_CLEAR');
}
