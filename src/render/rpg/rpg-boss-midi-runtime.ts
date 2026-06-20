import { parseBossMidi, type BossMidiNoteEvent } from '../../data/rpg/boss-midi-parser';
import {
  advanceBossMidiScheduler,
  createBossMidiSchedulerState,
  resetBossMidiScheduler,
  type BossMidiSchedulerState,
} from '../../data/rpg/boss-midi-scheduler';
import { getBossMidiPattern, mapBossMidiNote, type BossMidiPatternConfig } from '../../data/rpg/boss-midi-config';
import type { BossEnemy } from './rpg-enemy-types';
import type { BossAttackState } from './rpg-boss-attack-types';
import type { BossAttackUpdateCtx } from './rpg-boss-attack-update';
import type { BossAttackKindConfig } from './rpg-boss-attack-config';
import { spawnBossAttackFromConfig } from './rpg-boss-attack-update';

interface CachedPattern {
  status: 'idle' | 'loading' | 'ready' | 'failed';
  events: BossMidiNoteEvent[];
  error?: string;
  promise?: Promise<void>;
}

const MAX_MIDI_ACTIVE_ATTACKS = 6;

export interface BossMidiRuntimeState {
  scheduler: BossMidiSchedulerState;
  activeBossId: number | null;
  loadedBossId: number | null;
  lastTriggered: BossMidiNoteEvent | null;
  lastAttackKind: string | null;
  readonly cache: Map<number, CachedPattern>;
}

export function createBossMidiRuntimeState(): BossMidiRuntimeState {
  return {
    scheduler: createBossMidiSchedulerState(),
    activeBossId: null,
    loadedBossId: null,
    lastTriggered: null,
    lastAttackKind: null,
    cache: new Map(),
  };
}

export function resetBossMidiRuntime(state: BossMidiRuntimeState): void {
  resetBossMidiScheduler(state.scheduler);
  state.activeBossId = null;
  state.lastTriggered = null;
  state.lastAttackKind = null;
}

export function ensureBossMidiLoaded(state: BossMidiRuntimeState, bossId: number): void {
  const pattern = getBossMidiPattern(bossId);
  if (!pattern || state.cache.has(bossId)) return;
  const cached: CachedPattern = { status: 'loading', events: [] };
  cached.promise = fetch(pattern.midiUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((buffer) => {
      cached.events = parseBossMidi(buffer);
      cached.status = cached.events.length > 0 ? 'ready' : 'failed';
      if (cached.events.length === 0) cached.error = 'No MIDI notes found';
    })
    .catch((err: unknown) => {
      cached.status = 'failed';
      cached.events = [];
      cached.error = err instanceof Error ? err.message : String(err);
      console.warn('[BossMidi] Failed to load MIDI pattern', pattern.midiUrl, err);
    });
  state.cache.set(bossId, cached);
}

export function beginBossMidiRuntime(state: BossMidiRuntimeState, bossId: number): void {
  state.activeBossId = bossId;
  state.loadedBossId = bossId;
  state.lastTriggered = null;
  state.lastAttackKind = null;
  resetBossMidiScheduler(state.scheduler);
  ensureBossMidiLoaded(state, bossId);
}

export function updateBossMidiRuntime(
  state: BossMidiRuntimeState,
  boss: BossEnemy,
  attackState: BossAttackState,
  attackCtx: BossAttackUpdateCtx,
  deltaMs: number,
): void {
  const pattern = getBossMidiPattern(boss.bossId);
  if (!pattern || state.activeBossId !== boss.bossId) return;
  const cached = state.cache.get(boss.bossId);
  if (!cached || cached.status !== 'ready') return;
  advanceBossMidiScheduler(state.scheduler, cached.events, deltaMs, (event) => {
    const mapped = mapBossMidiNote(event, pattern.mapping);
    const spawned = triggerBossMidiAttack(attackState, attackCtx, boss, event, pattern, mapped.kindConfig);
    if (spawned) {
      state.lastTriggered = event;
      state.lastAttackKind = mapped.kindConfig.kind;
    }
  });
}

export function triggerBossMidiAttack(
  attackState: BossAttackState,
  attackCtx: BossAttackUpdateCtx,
  boss: BossEnemy,
  _event: BossMidiNoteEvent,
  _pattern: BossMidiPatternConfig,
  kindConfig: ReturnType<typeof mapBossMidiNote>['kindConfig'],
): boolean {
  if (attackState.attacks.length >= MAX_MIDI_ACTIVE_ATTACKS) return false;
  return spawnBossAttackFromConfig(attackState, attackCtx, boss, kindConfig as BossAttackKindConfig);
}

export function getBossMidiDebugText(state: BossMidiRuntimeState): string {
  if (state.activeBossId === null) return 'midi:off';
  const cached = state.cache.get(state.activeBossId);
  const status = cached?.status ?? 'idle';
  const count = cached?.events.length ?? 0;
  const note = state.lastTriggered ? `${state.lastTriggered.note}@${Math.round(state.lastTriggered.timeMs)}ms` : '-';
  return `midi:${status} notes:${count} t:${Math.round(state.scheduler.elapsedMs)} last:${note} atk:${state.lastAttackKind ?? '-'}`;
}
