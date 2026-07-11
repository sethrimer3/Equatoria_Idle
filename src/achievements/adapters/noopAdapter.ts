import type { AchievementDef, AchievementPlatformAdapter } from '../achievementTypes';

/** Always-available fallback adapter. Used whenever no platform SDK is present. */
export class NoopAchievementAdapter implements AchievementPlatformAdapter {
  readonly name = 'noop';

  isReady(): boolean {
    return true;
  }

  async unlock(_def: AchievementDef): Promise<void> {
    // Intentionally does nothing.
  }

  async setProgress(_def: AchievementDef, _current: number, _target: number): Promise<void> {
    // Intentionally does nothing.
  }
}
