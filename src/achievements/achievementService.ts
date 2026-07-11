/**
 * achievementService.ts — platform-agnostic achievement tracking + sync queue.
 *
 * Tracks unlock/progress/reveal state for the achievements in
 * achievementRegistry.ts, independent of gameplay bonuses (see
 * src/sim/achievements for those). Syncs to whichever AchievementPlatformAdapter
 * is currently installed; if the adapter isn't ready, syncs are queued and
 * retried on the next syncAll() call (e.g. once the platform SDK finishes
 * initializing).
 */

import { ACHIEVEMENT_REGISTRY_BY_ID } from './achievementRegistry';
import type { AchievementPlatformAdapter } from './achievementTypes';
import { NoopAchievementAdapter } from './adapters/noopAdapter';

export interface AchievementRecord {
  unlocked: boolean;
  revealed: boolean;
  progress: number;
}

export interface AchievementServiceState {
  records: Record<string, AchievementRecord>;
}

export function createAchievementServiceState(): AchievementServiceState {
  return { records: {} };
}

function getOrCreateRecord(state: AchievementServiceState, id: string): AchievementRecord {
  let rec = state.records[id];
  if (!rec) {
    rec = { unlocked: false, revealed: false, progress: 0 };
    state.records[id] = rec;
  }
  return rec;
}

export class AchievementService {
  private adapter: AchievementPlatformAdapter;
  private readonly state: AchievementServiceState;
  private readonly pendingSyncIds = new Set<string>();
  private syncInFlight = false;

  constructor(state: AchievementServiceState = createAchievementServiceState(), adapter: AchievementPlatformAdapter = new NoopAchievementAdapter()) {
    this.state = state;
    this.adapter = adapter;
  }

  /** Swap the active platform adapter (e.g. once a platform SDK becomes available). */
  setAdapter(adapter: AchievementPlatformAdapter): void {
    this.adapter = adapter;
  }

  getState(): AchievementServiceState {
    return this.state;
  }

  isUnlocked(id: string): boolean {
    return this.state.records[id]?.unlocked ?? false;
  }

  getProgress(id: string): number {
    return this.state.records[id]?.progress ?? 0;
  }

  isRevealed(id: string): boolean {
    const def = ACHIEVEMENT_REGISTRY_BY_ID.get(id);
    if (!def) return false;
    return def.rarity !== 'hidden' || (this.state.records[id]?.revealed ?? false);
  }

  /** Reveal a hidden achievement (e.g. once its condition is first hinted at) without unlocking it. */
  reveal(id: string): void {
    if (!ACHIEVEMENT_REGISTRY_BY_ID.has(id)) return;
    const rec = getOrCreateRecord(this.state, id);
    rec.revealed = true;
  }

  /** Unlock an achievement. Idempotent — a second call is a no-op. */
  unlock(id: string): void {
    const def = ACHIEVEMENT_REGISTRY_BY_ID.get(id);
    if (!def) return;
    const rec = getOrCreateRecord(this.state, id);
    if (rec.unlocked) return;
    rec.unlocked = true;
    rec.revealed = true;
    if (def.targetCount !== undefined) {
      rec.progress = def.targetCount;
    }
    this.queueSync(id);
  }

  /** Increment progress toward an incremental achievement's target. Unlocks once the threshold is crossed, exactly once. */
  increment(id: string, amount: number): void {
    const def = ACHIEVEMENT_REGISTRY_BY_ID.get(id);
    if (!def || def.targetCount === undefined) return;
    const rec = getOrCreateRecord(this.state, id);
    if (rec.unlocked) return;
    rec.progress = Math.min(def.targetCount, rec.progress + amount);
    this.queueSync(id);
    if (rec.progress >= def.targetCount) {
      this.unlock(id);
    }
  }

  /** Set absolute progress toward an incremental achievement's target. Unlocks once the threshold is crossed, exactly once. */
  setProgress(id: string, value: number): void {
    const def = ACHIEVEMENT_REGISTRY_BY_ID.get(id);
    if (!def || def.targetCount === undefined) return;
    const rec = getOrCreateRecord(this.state, id);
    if (rec.unlocked) return;
    rec.progress = Math.min(def.targetCount, Math.max(rec.progress, value));
    this.queueSync(id);
    if (rec.progress >= def.targetCount) {
      this.unlock(id);
    }
  }

  private queueSync(id: string): void {
    this.pendingSyncIds.add(id);
    if (this.adapter.isReady()) {
      void this.syncAll();
    }
  }

  /**
   * Flush all pending syncs to the current adapter. Safe to call repeatedly
   * (e.g. once the adapter becomes ready) — reentrant calls while a sync is
   * already in flight are no-ops; the in-flight pass will pick up anything
   * queued in the meantime before it finishes.
   */
  async syncAll(): Promise<void> {
    if (this.syncInFlight) return;
    if (!this.adapter.isReady()) return;
    this.syncInFlight = true;
    try {
      while (this.pendingSyncIds.size > 0) {
        const id = this.pendingSyncIds.values().next().value as string;
        this.pendingSyncIds.delete(id);
        const def = ACHIEVEMENT_REGISTRY_BY_ID.get(id);
        const rec = this.state.records[id];
        if (!def || !rec) continue;
        if (rec.unlocked) {
          await this.adapter.unlock(def);
        } else if (def.targetCount !== undefined) {
          await this.adapter.setProgress(def, rec.progress, def.targetCount);
        }
      }
    } finally {
      this.syncInFlight = false;
    }
  }

  /** IDs still waiting to be synced to the active adapter. */
  getPendingSyncIds(): string[] {
    return Array.from(this.pendingSyncIds);
  }
}
