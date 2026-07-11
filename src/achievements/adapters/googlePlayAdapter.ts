import type { AchievementDef, AchievementPlatformAdapter } from '../achievementTypes';

/**
 * Guarded stub for a future Google Play Games Services integration. No Play
 * Games package is imported here or anywhere else in the codebase today, so
 * this adapter is never ready — it activates only once a real integration
 * exists and this file is updated to detect it. Import nothing outside this file.
 */
export class GooglePlayAchievementAdapter implements AchievementPlatformAdapter {
  readonly name = 'googlePlay';

  isReady(): boolean {
    const globalWithPlayGames = globalThis as { playGamesServices?: unknown };
    return typeof globalWithPlayGames.playGamesServices !== 'undefined';
  }

  async unlock(_def: AchievementDef): Promise<void> {
    if (!this.isReady()) return;
    // TODO: wire to Play Games Services unlock API once integrated.
  }

  async setProgress(_def: AchievementDef, _current: number, _target: number): Promise<void> {
    if (!this.isReady()) return;
    // TODO: wire to Play Games Services incremental achievement API once integrated.
  }
}
