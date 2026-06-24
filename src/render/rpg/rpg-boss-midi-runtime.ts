import { parseBossMidi, type BossMidiNoteEvent } from '../../data/rpg/boss-midi-parser';
import {
  advanceBossMidiScheduler,
  computeBossOnsetMs,
  createBossMidiSchedulerState,
  resetBossMidiScheduler,
  type BossMidiSchedulerState,
} from '../../data/rpg/boss-midi-scheduler';
import { getBossMidiPattern, mapBossMidiNote, type BossMidiPatternConfig } from '../../data/rpg/boss-midi-config';
import { getBossBeatMs } from '../../data/rpg/boss-bpm';
import type { BossEnemy } from './rpg-enemy-types';
import type { BossAttackState } from './rpg-boss-attack-types';
import type { BossAttackUpdateCtx } from './rpg-boss-attack-update';
import type { BossAttackKindConfig } from './rpg-boss-attack-config';
import { spawnBossAttackFromConfig } from './rpg-boss-attack-update';

interface CachedPattern {
  status: 'idle' | 'loading' | 'ready' | 'failed';
  events: BossMidiNoteEvent[];
  phrases: Array<{ startMs: number; introOgg?: string }>;
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
  nextPhraseIndex: number;
  /** Next elapsed-ms value at which the signature attack should fire (Infinity = disabled). */
  nextSignatureMs: number;
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
    nextSignatureMs: Infinity,
    cache: new Map(),
  };
}

export function resetBossMidiRuntime(state: BossMidiRuntimeState): void {
  resetBossMidiScheduler(state.scheduler);
  state.activeBossId = null;
  state.lastTriggered = null;
  state.lastAttackKind = null;
  state.nextPhraseIndex = 0;
  state.nextSignatureMs = Infinity;
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
      const beatMs = getBossBeatMs(bossId);
      for (const item of loaded) {
        phrases.push({ startMs: offsetMs, introOgg: item.phrase.introOgg });
        for (const event of item.events) {
          // Override embedded-MIDI-tempo timing with boss BPM so every note onset
          // is exactly event.beat × boss-ms-per-beat, regardless of MIDI tempo.
          const bossOnsetMs = computeBossOnsetMs(event, bossId);
          const bossDurationMs = event.durationBeats * beatMs;
          allEvents.push({ ...event, timeMs: bossOnsetMs + offsetMs, durationMs: bossDurationMs });
        }
        const phraseEndMs = item.events.reduce((max, event) => {
          const bossOnsetMs = computeBossOnsetMs(event, bossId);
          const bossDurationMs = event.durationBeats * beatMs;
          return Math.max(max, bossOnsetMs + bossDurationMs);
        }, 0);
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
  // Derive signature attack interval from the pattern's beat config, not a hardcoded constant.
  const pattern = getBossMidiPattern(bossId);
  const beatMs = getBossBeatMs(bossId);
  state.nextSignatureMs = pattern?.signatureAttack
    ? beatMs * pattern.signatureAttack.intervalBeats
    : Infinity;
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
  if (pattern.signatureAttack) {
    _triggerSignatureAttackOnBeat(state, attackState, attackCtx, boss, pattern, nextMs);
  }
  while (state.nextPhraseIndex < cached.phrases.length) {
    const phrase = cached.phrases[state.nextPhraseIndex];
    if (phrase.startMs > nextMs) break;
    if ((phrase.startMs > previousMs || previousMs === 0) && phrase.introOgg) onPhraseStart?.(phrase.introOgg);
    state.nextPhraseIndex++;
  }
  advanceBossMidiScheduler(state.scheduler, cached.events, deltaMs, (event) => {
    const mapped = mapBossMidiNote(event, pattern.mapping, boss.bossId);
    const spawned = triggerBossMidiAttack(attackState, attackCtx, boss, event, pattern, mapped.kindConfig);
    if (spawned) {
      state.lastTriggered = event;
      state.lastAttackKind = mapped.kindConfig.kind;
    }
  });
}

function _triggerSignatureAttackOnBeat(
  state: BossMidiRuntimeState,
  attackState: BossAttackState,
  attackCtx: BossAttackUpdateCtx,
  boss: BossEnemy,
  pattern: BossMidiPatternConfig,
  nextMs: number,
): void {
  if (!pattern.signatureAttack) return;
  const beatMs = getBossBeatMs(boss.bossId);
  const intervalMs = pattern.signatureAttack.intervalBeats * beatMs;
  while (nextMs >= state.nextSignatureMs) {
    const spawned = triggerBossMidiAttack(
      attackState,
      attackCtx,
      boss,
      {
        timeMs: state.nextSignatureMs,
        durationMs: 0,
        beat: state.nextSignatureMs / beatMs,
        durationBeats: 0,
        note: 0,
        velocity: 96,
        channel: 0,
      },
      pattern,
      pattern.signatureAttack.config,
    );
    if (spawned) state.lastAttackKind = pattern.signatureAttack.config.kind;
    state.nextSignatureMs += intervalMs;
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
