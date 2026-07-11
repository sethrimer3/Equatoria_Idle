import type { AchievementDef, AchievementPlatformAdapter } from '../achievementTypes';

/**
 * Guarded stub for a future Steamworks integration. No Steamworks package is
 * imported here or anywhere else in the codebase today, so this adapter is
 * never ready — it activates only once a real Steam integration exists and
 * this file is updated to detect it. Import nothing outside this file.
 */
export class SteamAchievementAdapter implements AchievementPlatformAdapter {
  readonly name = 'steam';

  isReady(): boolean {
    const globalWithSteam = globalThis as { steamworks?: unknown };
    return typeof globalWithSteam.steamworks !== 'undefined';
  }

  async unlock(_def: AchievementDef): Promise<void> {
    if (!this.isReady()) return;
    // TODO: wire to Steamworks SetAchievement/StoreStats once integrated.
  }

  async setProgress(_def: AchievementDef, _current: number, _target: number): Promise<void> {
    if (!this.isReady()) return;
    // TODO: wire to Steamworks stat/progress APIs once integrated.
  }
}
