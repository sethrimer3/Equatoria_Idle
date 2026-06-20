import type { BossMidiNoteEvent } from './boss-midi-parser';

export type BossMidiAttackKind =
  | 'grav'
  | 'hexTrail'
  | 'mandala'
  | 'vermiculate'
  | 'missileRing'
  | 'motherSwarm';

export interface BossMidiPatternConfig {
  bossId: number;
  music?: BossMidiMusicConfig;
  phrases: BossMidiPhraseConfig[];
  phraseGapMs: number;
  mapping: BossMidiMappingConfig;
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

export interface MappedBossMidiAttack {
  kindConfig: {
    kind: BossMidiAttackKind;
    cooldownMs: number;
    pressureScore: number;
    durationMs: number;
    params: Record<string, number | boolean | string>;
  };
  intensity: number;
}

const DEFAULT_DURATION_MS = 5200;

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
  },
];

export function getBossMidiPattern(bossId: number): BossMidiPatternConfig | null {
  return BOSS_MIDI_PATTERNS.find((pattern) => pattern.bossId === bossId) ?? null;
}

export function mapBossMidiNote(event: BossMidiNoteEvent, mapping: BossMidiMappingConfig): MappedBossMidiAttack {
  const pitchClass = ((event.note % 12) + 12) % 12;
  const kind =
    mapping.exactNotes?.[event.note] ??
    mapping.channels?.[event.channel] ??
    mapping.pitchClasses?.[pitchClass] ??
    (event.note < 48 ? mapping.lowNote : event.note < 72 ? mapping.midNote : mapping.highNote) ??
    'mandala';
  const intensity = mapping.velocityRanges?.find((range) => event.velocity >= range.min && event.velocity <= range.max)?.intensity ?? 1;
  return {
    intensity,
    kindConfig: {
      kind,
      cooldownMs: 0,
      pressureScore: Math.max(1, Math.round(intensity)),
      durationMs: Math.max(1800, DEFAULT_DURATION_MS * intensity),
      params: paramsForKind(kind, intensity),
    },
  };
}

function paramsForKind(kind: BossMidiAttackKind, intensity: number): Record<string, number | boolean | string> {
  switch (kind) {
    case 'hexTrail':
      return { boltCount: Math.max(1, Math.round(intensity)), warnMs: Math.max(450, 900 / intensity), cellSize: 26, hazardMode: 'headOnly' };
    case 'missileRing':
      return { maxMissiles: Math.max(1, Math.round(2 * intensity)), spawnInterval: Math.max(900, 2200 / intensity), explosionRadius: 32 * intensity, hazardMode: 'ringEdgeHazard' };
    case 'vermiculate':
      return { wormCount: Math.max(1, Math.round(1 + intensity)), speed: 58 + 20 * intensity, maxTurnRate: 1.2 + intensity * 0.25, hazardMode: 'headOnly' };
    case 'grav':
      return { bodyCount: Math.max(2, Math.round(3 * intensity)), wellCount: 1, strength: 0.002 * intensity, moving: intensity > 1, hazardMode: 'visualOnly' };
    case 'motherSwarm':
      return { followerCount: Math.round(20 + 20 * intensity), hazardMode: 'headOnly' };
    case 'mandala':
    default:
      return { radialCount: Math.max(5, Math.round(6 * intensity)), safeGaps: 2, waveInterval: Math.max(900, 1900 / intensity), speed: 65 + 20 * intensity };
  }
}
