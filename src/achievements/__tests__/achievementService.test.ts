/**
 * achievementService.test.ts — Coverage for the platform achievement sync framework.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AchievementService, createAchievementServiceState } from '../achievementService';
import { NoopAchievementAdapter } from '../adapters/noopAdapter';
import type { AchievementDef, AchievementPlatformAdapter } from '../achievementTypes';

class FakeAdapter implements AchievementPlatformAdapter {
  readonly name = 'fake';
  ready = false;
  unlocked: string[] = [];
  progressCalls: Array<{ id: string; current: number; target: number }> = [];

  isReady(): boolean {
    return this.ready;
  }

  async unlock(def: AchievementDef): Promise<void> {
    this.unlocked.push(def.id);
  }

  async setProgress(def: AchievementDef, current: number, target: number): Promise<void> {
    this.progressCalls.push({ id: def.id, current, target });
  }
}

describe('AchievementService', () => {
  let service: AchievementService;
  let adapter: FakeAdapter;

  beforeEach(() => {
    adapter = new FakeAdapter();
    adapter.ready = true;
    service = new AchievementService(createAchievementServiceState(), adapter);
  });

  it('unlocks idempotently — a second unlock call is a no-op', async () => {
    service.unlock('FIRST_BLOOD');
    service.unlock('FIRST_BLOOD');
    await service.syncAll();
    expect(service.isUnlocked('FIRST_BLOOD')).toBe(true);
    expect(adapter.unlocked.filter(id => id === 'FIRST_BLOOD')).toHaveLength(1);
  });

  it('crosses an incremental threshold exactly once', async () => {
    for (let i = 0; i < 105; i++) service.increment('ENEMY_COUNT_100', 1);
    await service.syncAll();
    expect(service.isUnlocked('ENEMY_COUNT_100')).toBe(true);
    expect(adapter.unlocked.filter(id => id === 'ENEMY_COUNT_100')).toHaveLength(1);
    // Further increments after unlock must not change progress or re-unlock.
    service.increment('ENEMY_COUNT_100', 50);
    expect(adapter.unlocked.filter(id => id === 'ENEMY_COUNT_100')).toHaveLength(1);
  });

  it('reveals a hidden achievement without unlocking it', () => {
    expect(service.isRevealed('GLASS_CANNON')).toBe(false);
    service.reveal('GLASS_CANNON');
    expect(service.isRevealed('GLASS_CANNON')).toBe(true);
    expect(service.isUnlocked('GLASS_CANNON')).toBe(false);
  });

  it('queues sync when the adapter is not ready, and syncs once ready', async () => {
    adapter.ready = false;
    service.unlock('BOSS_SLAYER');
    expect(adapter.unlocked).toHaveLength(0);
    expect(service.getPendingSyncIds()).toContain('BOSS_SLAYER');

    adapter.ready = true;
    await service.syncAll();
    expect(adapter.unlocked).toContain('BOSS_SLAYER');
    expect(service.getPendingSyncIds()).toHaveLength(0);
  });

  it('syncs unlocked achievements only once the adapter becomes available', async () => {
    adapter.ready = false;
    service.setProgress('MOTE_COUNT_50', 10);
    expect(adapter.progressCalls).toHaveLength(0);

    adapter.ready = true;
    await service.syncAll();
    expect(adapter.progressCalls.some(c => c.id === 'MOTE_COUNT_50' && c.current === 10)).toBe(true);
  });

  it('is safe with the Noop adapter — never throws, never blocks', async () => {
    const noopService = new AchievementService(createAchievementServiceState(), new NoopAchievementAdapter());
    noopService.unlock('FIRST_BLOOD');
    await expect(noopService.syncAll()).resolves.toBeUndefined();
    expect(noopService.isUnlocked('FIRST_BLOOD')).toBe(true);
  });

  it('round-trips through local persistence (state object)', () => {
    service.unlock('FIRST_BLOOD');
    service.increment('MOTE_COUNT_50', 12);
    const persisted = JSON.parse(JSON.stringify(service.getState())) as ReturnType<typeof createAchievementServiceState>;

    const restoredService = new AchievementService(persisted, new NoopAchievementAdapter());
    expect(restoredService.isUnlocked('FIRST_BLOOD')).toBe(true);
    expect(restoredService.getProgress('MOTE_COUNT_50')).toBe(12);
  });
});
