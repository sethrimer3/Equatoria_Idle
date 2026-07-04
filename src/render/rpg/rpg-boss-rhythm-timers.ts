/**
 * rpg-boss-rhythm-timers.ts - Beat-grid scheduling for legacy boss projectiles.
 *
 * Older boss projectile behaviors still use BossEnemy.attackTimerMs and
 * secondaryTimerMs as countdowns. These helpers keep that contract while making
 * every reset land on the boss BPM beat grid.
 */

import type { BossEnemy } from './rpg-enemy-types';
import { getBossBeatMs, msToBeats } from '../../data/rpg/boss-bpm';

const MIN_BEAT_GRID = 0.25;

function _getIntervalBeats(bossId: number, intervalMs: number): number {
  return Math.max(MIN_BEAT_GRID, msToBeats(bossId, intervalMs));
}

function _getGridBeats(intervalBeats: number): number {
  if (intervalBeats <= 0.25) return 0.25;
  if (intervalBeats <= 0.5) return 0.5;
  return 1;
}

export function getBossLegacyProjectileRhythmLabel(bossId: number, intervalMs: number): string {
  const beats = _getIntervalBeats(bossId, intervalMs);
  if (Math.abs(beats - 4) < 0.0001) return 'WholeNote';
  if (Math.abs(beats - 2) < 0.0001) return 'HalfNote';
  if (Math.abs(beats - 1) < 0.0001) return 'QuarterNote';
  if (Math.abs(beats - 0.5) < 0.0001) return 'EighthNote';
  if (Math.abs(beats - 0.25) < 0.0001) return 'SixteenthNote';
  return `${beats}-Beat`;
}

export function scheduleBossRhythmTimer(boss: BossEnemy, intervalMs: number): number {
  const intervalBeats = _getIntervalBeats(boss.bossId, intervalMs);
  const gridBeats = _getGridBeats(intervalBeats);
  const beatMs = getBossBeatMs(boss.bossId);
  const elapsedBeats = boss.rhythmClockMs / beatMs;
  const lastGridBeat = Math.floor(elapsedBeats / gridBeats + 1e-9) * gridBeats;
  const targetMs = (lastGridBeat + intervalBeats) * beatMs;
  return Math.max(0, targetMs - boss.rhythmClockMs);
}

export function initializeBossRhythmTimers(boss: BossEnemy, primaryIntervalMs: number, secondaryIntervalMs: number): void {
  boss.attackTimerMs = scheduleBossRhythmTimer(boss, primaryIntervalMs);
  boss.secondaryTimerMs = scheduleBossRhythmTimer(boss, secondaryIntervalMs);
  boss.areRhythmTimersInitialized = true;
}
