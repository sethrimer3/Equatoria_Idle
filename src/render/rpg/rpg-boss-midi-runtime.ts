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
import { getBossBeatMs, getBossTempoIntervalMs } from '../../data/rpg/boss-tempo-config';

interface CachedPattern {
  status: 'idle' | 'loading' | 'ready' | 'failed';
  events: BossMidiNoteEvent[];
  phrases: Array<{ startMs: number; introOgg?: string }>;
  error?: string;
  promise?: Promise<void>;
}

const MAX_MIDI_ACTIVE_ATTACKS = 6;
const QUARTZ_SIGNATURE_INTERVAL_BEATS = 5;

export interface BossMidiRuntimeState {
  scheduler: BossMidiSchedulerState;
  activeBossId: number | null;
  loadedBossId: number | null;
  lastTriggered: BossMidiNoteEvent | null;
  lastAttackKind: string | null;
  nextPhraseIndex: number;
  nextQuartzSignatureMs: number;
  readonly cache: Map<number, CachedPattern>;
}

export function createBossMidiRuntimeState(): BossMidiRuntimeState {
  return {
    scheduler: createBossMidiSchedulerState(),
    activeBossId: null,
    loadedBossId: null,
    lastTriggered: null,
    lastAttackKind: null,
    nextPhraseIndex: 0,
    nextQuartzSignatureMs: getBossTempoIntervalMs(1, QUARTZ_SIGNATURE_INTERVAL_BEATS),
    cache: new Map(),
  };
}

export function resetBossMidiRuntime(state: BossMidiRuntimeState): void {
  resetBossMidiScheduler(state.scheduler);
  state.activeBossId = null;
  state.lastTriggered = null;
  state.lastAttackKind = null;
  state.nextPhraseIndex = 0;
  state.nextQuartzSignatureMs = getBossTempoIntervalMs(1, QUARTZ_SIGNATURE_INTERVAL_BEATS);
}

export function ensureBossMidiLoaded(state: BossMidiRuntimeState, bossId: number): void {
  const pattern = getBossMidiPattern(bossId);
  if (!pattern || state.cache.has(bossId)) return;
  const cached: CachedPattern = { status: 'loading', events: [], phrases: [] };
  cached.promise = Promise.all(pattern.phrases.map((phrase) =>
    fetch(phrase.midiUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`${phrase.midiUrl}: HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) => ({ phrase, events: parseBossMidi(buffer) })),
  ))
    .then((loaded) => {
      let offsetMs = 0;
      const allEvents: BossMidiNoteEvent[] = [];
      const phrases: Array<{ startMs: number; introOgg?: string }> = [];
      for (const item of loaded) {
        phrases.push({ startMs: offsetMs, introOgg: item.phrase.introOgg });
        for (const event of item.events) {
          allEvents.push({ ...event, timeMs: event.timeMs + offsetMs });
        }
        const phraseEndMs = item.events.reduce((max, event) => Math.max(max, event.timeMs + event.durationMs), 0);
        offsetMs += phraseEndMs + pattern.phraseGapMs;
      }
      cached.events = allEvents.sort((a, b) => a.timeMs - b.timeMs || a.note - b.note);
      cached.phrases = phrases;
      cached.status = cached.events.length > 0 ? 'ready' : 'failed';
      if (cached.events.length === 0) cached.error = 'No MIDI notes found';
    })
    .catch((err: unknown) => {
      cached.status = 'failed';
      cached.events = [];
      cached.error = err instanceof Error ? err.message : String(err);
      console.warn('[BossMidi] Failed to load MIDI pattern for boss', bossId, err);
    });
  state.cache.set(bossId, cached);
}

export function beginBossMidiRuntime(state: BossMidiRuntimeState, bossId: number): void {
  state.activeBossId = bossId;
  state.loadedBossId = bossId;
  state.lastTriggered = null;
  state.lastAttackKind = null;
  state.nextPhraseIndex = 0;
  state.nextQuartzSignatureMs = getBossTempoIntervalMs(1, QUARTZ_SIGNATURE_INTERVAL_BEATS);
  resetBossMidiScheduler(state.scheduler);
  ensureBossMidiLoaded(state, bossId);
}

export function updateBossMidiRuntime(
  state: BossMidiRuntimeState,
  boss: BossEnemy,
  attackState: BossAttackState,
  attackCtx: BossAttackUpdateCtx,
  deltaMs: number,
  onPhraseStart?: (oggPath: string) => void,
): void {
  const pattern = getBossMidiPattern(boss.bossId);
  if (!pattern || state.activeBossId !== boss.bossId) return;
  const cached = state.cache.get(boss.bossId);
  if (!cached || cached.status !== 'ready') return;
  const previousMs = state.scheduler.elapsedMs;
  const nextMs = previousMs + deltaMs;
  if (boss.bossId === 1) {
    triggerQuartzSignatureOnBeat(state, attackState, attackCtx, boss, nextMs);
  }
  while (state.nextPhraseIndex < cached.phrases.length) {
    const phrase = cached.phrases[state.nextPhraseIndex];
    if (phrase.startMs > nextMs) break;
    if ((phrase.startMs > previousMs || previousMs === 0) && phrase.introOgg) onPhraseStart?.(phrase.introOgg);
    state.nextPhraseIndex++;
  }
  advanceBossMidiScheduler(state.scheduler, cached.events, deltaMs, (event) => {
    const mapped = mapBossMidiNote(event, pattern.mapping);
    const spawned = triggerBossMidiAttack(attackState, attackCtx, boss, event, pattern, mapped.kindConfig);
    if (spawned) {
      state.lastTriggered = event;
      state.lastAttackKind = mapped.kindConfig.kind;
    }
  });
}

function triggerQuartzSignatureOnBeat(
  state: BossMidiRuntimeState,
  attackState: BossAttackState,
  attackCtx: BossAttackUpdateCtx,
  boss: BossEnemy,
  nextMs: number,
): void {
  while (nextMs >= state.nextQuartzSignatureMs) {
    const spawned = triggerBossMidiAttack(
      attackState,
      attackCtx,
      boss,
      {
        timeMs: state.nextQuartzSignatureMs,
        durationMs: 0,
        beat: state.nextQuartzSignatureMs / getBossBeatMs(boss.bossId),
        durationBeats: 0,
        note: 0,
        velocity: 96,
        channel: 0,
      },
      getBossMidiPattern(1)!,
      {
        kind: 'quartzSignature',
        cooldownMs: 0,
        pressureScore: 2,
        durationMs: 5450,
        params: { stepDistance: 112, maxIteration: 3, trailHazardMs: 2000, trailFadeMs: 450 },
      },
    );
    if (spawned) state.lastAttackKind = 'quartzSignature';
    state.nextQuartzSignatureMs += getBossTempoIntervalMs(boss.bossId, QUARTZ_SIGNATURE_INTERVAL_BEATS);
  }
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
  const phrase = cached ? `${Math.min(state.nextPhraseIndex, cached.phrases.length)}/${cached.phrases.length}` : '-';
  return `midi:${status} notes:${count} phrase:${phrase} t:${Math.round(state.scheduler.elapsedMs)} last:${note} atk:${state.lastAttackKind ?? '-'}`;
}
