import type { BossMidiNoteEvent } from './boss-midi-parser';
import { getBossBeatMs } from './boss-bpm';

export type BossMidiAttackKind =
  | 'grav'
  | 'hexTrail'
  | 'mandala'
  | 'vermiculate'
  | 'missileRing'
  | 'motherSwarm'
  | 'quartzSignature';

/** Beat-authored signature attack that fires on a fixed rhythmic interval. */
export interface BossMidiSignatureAttackConfig {
  /** How many beats between signature attack firings. */
  intervalBeats: number;
  /** Beat-authored config; resolved to ms by resolveAttackConfig() at spawn time. */
  config: {
    kind: BossMidiAttackKind;
    cooldownBeats: number;
    pressureScore: number;
    durationBeats: number;
    params: Record<string, number | boolean | string>;
  };
}

export interface BossMidiPatternConfig {
  bossId: number;
  music?: BossMidiMusicConfig;
  phrases: BossMidiPhraseConfig[];
  phraseGapMs: number;
  mapping: BossMidiMappingConfig;
  /** Optional beat-locked signature attack that fires independently of MIDI events. */
  signatureAttack?: BossMidiSignatureAttackConfig;
}

export interface BossMidiMusicConfig {
  beatLoop: string;
  bgLayers: string[];
}

export interface BossMidiPhraseConfig {
  midiUrl: string;
  introOgg?: string;
}

export interface BossMidiMappingConfig {
  exactNotes?: Record<number, BossMidiAttackKind>;
  pitchClasses?: Record<number, BossMidiAttackKind>;
  channels?: Record<number, BossMidiAttackKind>;
  lowNote?: BossMidiAttackKind;
  midNote?: BossMidiAttackKind;
  highNote?: BossMidiAttackKind;
  velocityRanges?: Array<{ min: number; max: number; intensity: number }>;
}

/** Beat-authored attack config returned from mapBossMidiNote. */
export interface MappedBossMidiAttack {
  kindConfig: {
    kind: BossMidiAttackKind;
    cooldownBeats: number;
    pressureScore: number;
    /** Derived from event.durationBeats, clamped to [0.25, 20]. */
    durationBeats: number;
    params: Record<string, number | boolean | string>;
  };
  intensity: number;
}

export const BOSS_MIDI_PATTERNS: BossMidiPatternConfig[] = [
  {
    bossId: 1,
    music: {
      beatLoop: 'ASSETS/bossMidi/1-QuartzBoss/beatLoop.ogg',
      bgLayers: [
        'ASSETS/bossMidi/1-QuartzBoss/backgroundLoop_layer_1.ogg',
        'ASSETS/bossMidi/1-QuartzBoss/backgroundLoop_layer_2.ogg',
      ],
    },
    phrases: [
      { midiUrl: 'ASSETS/bossMidi/1-QuartzBoss/wave1.mid', introOgg: 'ASSETS/bossMidi/1-QuartzBoss/wave1.ogg' },
      { midiUrl: 'ASSETS/bossMidi/1-QuartzBoss/wave2.mid', introOgg: 'ASSETS/bossMidi/1-QuartzBoss/wave2.ogg' },
      { midiUrl: 'ASSETS/bossMidi/1-QuartzBoss/wave3.mid', introOgg: 'ASSETS/bossMidi/1-QuartzBoss/wave3.ogg' },
      { midiUrl: 'ASSETS/bossMidi/1-QuartzBoss/wave4.mid', introOgg: 'ASSETS/bossMidi/1-QuartzBoss/wave4.ogg' },
      { midiUrl: 'ASSETS/bossMidi/1-QuartzBoss/wave5.mid', introOgg: 'ASSETS/bossMidi/1-QuartzBoss/wave5.ogg' },
      { midiUrl: 'ASSETS/bossMidi/1-QuartzBoss/wave6.mid', introOgg: 'ASSETS/bossMidi/1-QuartzBoss/wave6.ogg' },
    ],
    phraseGapMs: 1000,
    mapping: {
      exactNotes: { 36: 'hexTrail', 48: 'mandala', 72: 'missileRing' },
      pitchClasses: { 0: 'mandala', 7: 'vermiculate' },
      channels: { 1: 'hexTrail', 2: 'missileRing' },
      lowNote: 'hexTrail',
      midNote: 'mandala',
      highNote: 'vermiculate',
      velocityRanges: [
        { min: 0, max: 63, intensity: 0.75 },
        { min: 64, max: 99, intensity: 1 },
        { min: 100, max: 127, intensity: 1.35 },
      ],
    },
    signatureAttack: {
      intervalBeats: 5,
      config: {
        kind: 'quartzSignature',
        cooldownBeats: 0,
        pressureScore: 2,
        durationBeats: 5.5,
        params: { stepDistance: 112, maxIteration: 3, trailHazardBeats: 2, trailFadeBeats: 0.5 },
      },
    },
  },
];

export function getBossMidiPattern(bossId: number): BossMidiPatternConfig | null {
  return BOSS_MIDI_PATTERNS.find((pattern) => pattern.bossId === bossId) ?? null;
}

/**
 * Map a raw MIDI note event to a beat-authored attack config.
 * Uses event.durationBeats (clamped to [0.25, 20]) for the attack duration.
 * Timing params in the returned `params` use *Beats names, resolved by resolveAttackConfig().
 */
export function mapBossMidiNote(
  event: BossMidiNoteEvent,
  mapping: BossMidiMappingConfig,
  bossId: number,
): MappedBossMidiAttack {
  const pitchClass = ((event.note % 12) + 12) % 12;
  const kind =
    mapping.exactNotes?.[event.note] ??
    mapping.channels?.[event.channel] ??
    mapping.pitchClasses?.[pitchClass] ??
    (event.note < 48 ? mapping.lowNote : event.note < 72 ? mapping.midNote : mapping.highNote) ??
    'mandala';
  const intensity =
    mapping.velocityRanges?.find((range) => event.velocity >= range.min && event.velocity <= range.max)?.intensity ?? 1;
  const durationBeats = Math.min(20, Math.max(0.25, event.durationBeats));
  return {
    intensity,
    kindConfig: {
      kind,
      cooldownBeats: 0,
      pressureScore: Math.max(1, Math.round(intensity)),
      durationBeats,
      params: paramsForKind(kind, intensity, bossId),
    },
  };
}

function paramsForKind(
  kind: BossMidiAttackKind,
  intensity: number,
  bossId: number,
): Record<string, number | boolean | string> {
  const beatMs = getBossBeatMs(bossId);
  switch (kind) {
    case 'hexTrail':
      return {
        boltCount: Math.max(1, Math.round(intensity)),
        warnBeats: Math.max(0.25, 900 / intensity / beatMs),
        cellSize: 26,
        hazardMode: 'headOnly',
      };
    case 'missileRing':
      return {
        maxMissiles: Math.max(1, Math.round(2 * intensity)),
        spawnIntervalBeats: Math.max(0.5, 2200 / intensity / beatMs),
        explosionRadius: 32 * intensity,
        hazardMode: 'ringEdgeHazard',
      };
    case 'vermiculate':
      return {
        wormCount: Math.max(1, Math.round(1 + intensity)),
        speed: 58 + 20 * intensity,
        maxTurnRate: 1.2 + intensity * 0.25,
        hazardMode: 'headOnly',
      };
    case 'grav':
      return {
        bodyCount: Math.max(2, Math.round(3 * intensity)),
        wellCount: 1,
        strength: 0.002 * intensity,
        moving: intensity > 1,
        hazardMode: 'visualOnly',
      };
    case 'motherSwarm':
      return { followerCount: Math.round(20 + 20 * intensity), hazardMode: 'headOnly' };
    case 'quartzSignature':
      return {
        stepDistance: 112,
        maxIteration: 3,
        trailHazardBeats: 2000 / beatMs,
        trailFadeBeats: 450 / beatMs,
      };
    case 'mandala':
    default:
      return {
        radialCount: Math.max(5, Math.round(6 * intensity)),
        safeGaps: 2,
        waveIntervalBeats: Math.max(0.5, 1900 / intensity / beatMs),
        speed: 65 + 20 * intensity,
      };
  }
}
