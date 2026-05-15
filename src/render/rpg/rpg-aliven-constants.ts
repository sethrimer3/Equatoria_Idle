/**
 * rpg-aliven-constants.ts — Tuning constants for the AlivenParticle enemy system.
 *
 * ALIVEN_VARIANT_PARAMS is the single source of truth for per-variant stats.
 * All other constants are physics/timer values shared across variants.
 */

import type { AlivenVariantParams } from './rpg-aliven-types';

// ── Variant IDs ────────────────────────────────────────────────────────────

export const ALIVEN_VARIANTS = [
  'aliven_spark_cluster',
  'aliven_shard_bloom',
  'aliven_pulse_swarm',
  'aliven_ember_ring',
  'aliven_void_splinters',
  'aliven_healer_nodes',
  'aliven_orbit_bloom',
  'aliven_quartz_ghost',
  'aliven_iolite_prism',
  'aliven_fracteryl_storm',
] as const satisfies readonly string[];

export type AlivenVariantId = typeof ALIVEN_VARIANTS[number];

// ── Safety caps ────────────────────────────────────────────────────────────

/** Maximum total particles a group can hold (guards splitter runaway). */
export const ALIVEN_MAX_PARTICLES = 24;

/**
 * Maximum number of active AlivenParticleGroups at any time.
 * Prevents unbounded group accumulation on late-game waves with many spawns.
 * Conservative default to protect mobile performance. Easy to tune.
 */
export const MAX_ACTIVE_ALIVEN_GROUPS = 8;

// ── Contact damage ─────────────────────────────────────────────────────────

/** Collision radius for player contact check (added to particle radiusPx). */
export const ALIVEN_CONTACT_EXTRA_RADIUS_PX = 2;

/** Cooldown between contact-damage hits per particle (ms). */
export const ALIVEN_CONTACT_CD_MS = 800;

// ── Visuals ────────────────────────────────────────────────────────────────

/** How long the white hit-flash lasts on a particle after dealing contact damage (ms). */
export const ALIVEN_HIT_FLASH_MS = 150;

/** Max trail points kept per particle. */
export const ALIVEN_TRAIL_CAP = 7;

/** Minimum squared distance between trail samples. */
export const ALIVEN_TRAIL_MIN_DIST_SQ = 6;

// ── Spitter ────────────────────────────────────────────────────────────────

/** Wind-up time before a spitter fires its bullet (ms). */
export const ALIVEN_SPITTER_WINDUP_MS = 400;

/** Pixels per ms for spitter bullets. */
export const ALIVEN_SPITTER_BULLET_SPEED = 0.09;

/** Collision radius of spitter bullets. */
export const ALIVEN_SPITTER_BULLET_RADIUS = 2.5;

/** Sentinel value for specialCdMs while the spitter is in windup.
 *  Must exceed any real cooldown; windup detection compares > ALIVEN_WINDUP_THRESHOLD. */
export const ALIVEN_WINDUP_SENTINEL = Number.MAX_SAFE_INTEGER / 2;

/** Threshold above which specialCdMs signals "in windup". */
export const ALIVEN_WINDUP_THRESHOLD = 10_000;

// ── Dasher ─────────────────────────────────────────────────────────────────

/** Speed (px/ms) applied during a dash toward the player. */
export const ALIVEN_DASH_SPEED = 0.35;

// ── Pulser ─────────────────────────────────────────────────────────────────

/** Radius of the shockwave that triggers player damage (px). */
export const ALIVEN_PULSE_RADIUS_PX = 28;

/** ATK multiplier for a pulse hit relative to contact ATK. */
export const ALIVEN_PULSE_ATK_MULT = 1.4;

// ── Healer ─────────────────────────────────────────────────────────────────

/** Fraction of maxHp healed per healer tick. */
export const ALIVEN_HEAL_FRACTION = 0.12;

/** Squared range for a healer to reach other particles. */
export const ALIVEN_HEALER_RANGE_SQ = 32 * 32;

// ── Orbiter ────────────────────────────────────────────────────────────────

/** Centripetal attraction strength toward the group centroid (added per ms). */
export const ALIVEN_ORBIT_STRENGTH = 0.00005;

// ── Ghost ──────────────────────────────────────────────────────────────────

/** How long each ghost phase (invulnerability) lasts on a ghost particle (ms). */
export const ALIVEN_GHOST_DURATION_MS = 900;

// ── Visual effects ─────────────────────────────────────────────────────────

/** Duration of the pulser shockwave ring visual after the pulse fires (ms). */
export const ALIVEN_PULSER_RING_DURATION_MS = 350;

/** Duration of the healer beam visual from healer to healed target (ms). */
export const ALIVEN_HEALER_BEAM_MS = 280;

/** Duration of the splitter-death burst ring visual (ms). */
export const ALIVEN_SPLIT_FLASH_MS = 300;

/**
 * Maximum group alive-count for which the O(n²) overlap-separation pass runs.
 * Skipped above this threshold to keep mobile frame cost bounded.
 */
export const ALIVEN_SEPARATION_MAX_COUNT = 16;

/** Repulsion strength applied per-ms during the overlap separation pass. */
export const ALIVEN_SEPARATION_STRENGTH = 0.00018;

// ── Movement physics ───────────────────────────────────────────────────────

/** Velocity friction applied every frame (multiplied into vx/vy). */
export const ALIVEN_FRICTION = 0.985;

/** Random wander noise strength (px/ms²). */
export const ALIVEN_WANDER_STRENGTH = 0.00015;

/** Player-seek bias strength (px/ms²). */
export const ALIVEN_SEEK_STRENGTH = 0.00025;

// ── Per-variant parameter table ────────────────────────────────────────────

export const ALIVEN_VARIANT_PARAMS: Record<AlivenVariantId, AlivenVariantParams> = {
  /** A – Aliven Spark Cluster: basic early-game spitter swarm. */
  aliven_spark_cluster: {
    tierId:          'sapphire',
    color:           '#7ab4ff',
    glowColor:       '#4488ee',
    particleCount:   8,
    radiusPx:        2.5,
    hpBase:          18,
    atkBase:         8,
    xpMult:          2.5,
    spawnIntervalMs: 480,
    specialKind:     'spitter',
    specialCdMin:    3000,
    specialCdMax:    5000,
  },
  /** B – Aliven Shard Bloom: dasher swarm. */
  aliven_shard_bloom: {
    tierId:          'emerald',
    color:           '#44ee88',
    glowColor:       '#22bb66',
    particleCount:   10,
    radiusPx:        3.0,
    hpBase:          28,
    atkBase:         12,
    xpMult:          4,
    spawnIntervalMs: 440,
    specialKind:     'dasher',
    specialCdMin:    2500,
    specialCdMax:    4500,
  },
  /** C – Aliven Pulse Swarm: pulsers. */
  aliven_pulse_swarm: {
    tierId:          'citrine',
    color:           '#f0d060',
    glowColor:       '#c8a020',
    particleCount:   10,
    radiusPx:        2.8,
    hpBase:          38,
    atkBase:         14,
    xpMult:          5.5,
    spawnIntervalMs: 360,
    specialKind:     'pulser',
    specialCdMin:    3500,
    specialCdMax:    5500,
  },
  /** D – Aliven Ember Ring: ember-trail particles. */
  aliven_ember_ring: {
    tierId:          'sunstone',
    color:           '#ff8c3c',
    glowColor:       '#dd4400',
    particleCount:   10,
    radiusPx:        3.5,
    hpBase:          50,
    atkBase:         14,
    xpMult:          6,
    spawnIntervalMs: 400,
    specialKind:     'ember',
    specialCdMin:    9999,
    specialCdMax:    9999,
  },
  /** E – Aliven Void Splinters: splitter-on-death particles. */
  aliven_void_splinters: {
    tierId:          'nullstone',
    color:           '#9966bb',
    glowColor:       '#6633aa',
    particleCount:   12,
    radiusPx:        2.2,
    hpBase:          65,
    atkBase:         16,
    xpMult:          12,
    spawnIntervalMs: 290,
    specialKind:     'splitter',
    specialCdMin:    9999,
    specialCdMax:    9999,
  },
  /** F – Aliven Healer Nodes: healer swarm with target-priority decisions. */
  aliven_healer_nodes: {
    tierId:          'amethyst',
    color:           '#cc88ee',
    glowColor:       '#aa55cc',
    particleCount:   9,
    radiusPx:        3.5,
    hpBase:          80,
    atkBase:         14,
    xpMult:          10,
    spawnIntervalMs: 510,
    specialKind:     'healer',
    specialCdMin:    2800,
    specialCdMax:    4500,
  },
  /** G – Aliven Orbit Bloom: orbital-motion swarm. */
  aliven_orbit_bloom: {
    tierId:          'ruby',
    color:           '#ff5050',
    glowColor:       '#cc1111',
    particleCount:   12,
    radiusPx:        3.2,
    hpBase:          95,
    atkBase:         18,
    xpMult:          8,
    spawnIntervalMs: 390,
    specialKind:     'orbiter',
    specialCdMin:    9999,
    specialCdMax:    9999,
  },
  /** H – Aliven Quartz Ghost: ghost particles that periodically phase (invulnerable). */
  aliven_quartz_ghost: {
    tierId:          'quartz',
    color:           '#d8e8f0',
    glowColor:       '#aaccee',
    particleCount:   10,
    radiusPx:        2.8,
    hpBase:          22,
    atkBase:         10,
    xpMult:          3.5,
    spawnIntervalMs: 450,
    specialKind:     'ghost',
    specialCdMin:    3500,
    specialCdMax:    5500,
  },
  /** I – Aliven Iolite Prism: heavy iolite pulsers in a dense cluster. */
  aliven_iolite_prism: {
    tierId:          'iolite',
    color:           '#6464b4',
    glowColor:       '#8888cc',
    particleCount:   14,
    radiusPx:        3.0,
    hpBase:          80,
    atkBase:         18,
    xpMult:          7,
    spawnIntervalMs: 320,
    specialKind:     'pulser',
    specialCdMin:    3000,
    specialCdMax:    5000,
  },
  /** J – Aliven Fracteryl Storm: swarm of fractal splitters that cascade on death. */
  aliven_fracteryl_storm: {
    tierId:          'fracteryl',
    color:           '#cc44ff',
    glowColor:       '#ee88ff',
    particleCount:   18,
    radiusPx:        2.0,
    hpBase:          120,
    atkBase:         22,
    xpMult:          14,
    spawnIntervalMs: 250,
    specialKind:     'splitter',
    specialCdMin:    9999,
    specialCdMax:    9999,
  },
};

/** Fluid explosion colour per aliven tierId.
 *  Defined at module scope so it is allocated once, not on every enemy defeat. */
export const ALIVEN_FLUID_COLORS: Record<string, [number, number, number]> = {
  sapphire:  [ 91, 154, 255],
  emerald:   [ 34, 221, 102],
  citrine:   [230, 200,  80],
  sunstone:  [255, 140,  60],
  nullstone: [ 30,  30,  40],
  amethyst:  [180, 100, 200],
  ruby:      [255,  51,  51],
  quartz:    [216, 232, 240],
  iolite:    [100, 100, 180],
  fracteryl: [200,  68, 255],
};
