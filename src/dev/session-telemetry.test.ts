/**
 * session-telemetry.test.ts — Unit tests for the session telemetry module.
 *
 * Tests cover: reset, forge crunch recording, forge sacrifice recording,
 * loom capture recording, Aliven spawn/kill/bullet tracking, unknown-key
 * robustness, and derived metric `getAvgSacrificePerCrunch`.
 *
 * All tests are pure and do not depend on any browser APIs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetSessionTelemetry,
  getSessionTelemetrySnapshot,
  getAvgSacrificePerCrunch,
  recordForgeCrunch,
  recordForgeSacrifice,
  recordLoomCapture,
  recordLoomEfficiencyUpgrade,
  recordLoomPassiveMotes,
  recordAlivenSpawn,
  recordAlivenKill,
  recordAlivenCapSkip,
  recordPlayerDamageFromContact,
  recordPlayerDamageFromBullet,
  recordAlivenBulletFired,
} from './session-telemetry';

// ─── Reset before each test to ensure isolation ────────────────────────────

beforeEach(() => {
  resetSessionTelemetry();
});

// ─── Reset ────────────────────────────────────────────────────────────────

describe('resetSessionTelemetry', () => {
  it('clears forge counters', () => {
    recordForgeCrunch(500);
    recordForgeSacrifice('sand', 100, 1);
    resetSessionTelemetry();
    const snap = getSessionTelemetrySnapshot();
    expect(snap.forge.crunchesCompleted).toBe(0);
    expect(snap.forge.crunchesWithZeroParticles).toBe(0);
    expect(Object.keys(snap.forge.sacrificedMassByTier)).toHaveLength(0);
    expect(Object.keys(snap.forge.equationUpgradesFromSacrificeByTier)).toHaveLength(0);
  });

  it('clears loom counters', () => {
    recordLoomCapture('sand', 50, 'quartz', 2);
    recordLoomEfficiencyUpgrade();
    resetSessionTelemetry();
    const snap = getSessionTelemetrySnapshot();
    expect(snap.loom.efficiencyUpgradesPurchased).toBe(0);
    expect(Object.keys(snap.loom.capturesByInputTier)).toHaveLength(0);
  });

  it('clears Aliven counters', () => {
    recordAlivenSpawn('aliven_spark_cluster', 1);
    recordAlivenKill('aliven_spark_cluster');
    recordAlivenCapSkip();
    resetSessionTelemetry();
    const snap = getSessionTelemetrySnapshot();
    expect(snap.aliven.capSkips).toBe(0);
    expect(snap.aliven.peakActiveGroups).toBe(0);
    expect(Object.keys(snap.aliven.spawnedByVariant)).toHaveLength(0);
    expect(Object.keys(snap.aliven.killedByVariant)).toHaveLength(0);
  });
});

// ─── Forge telemetry ──────────────────────────────────────────────────────

describe('recordForgeCrunch', () => {
  it('increments crunchesCompleted', () => {
    recordForgeCrunch(1000);
    recordForgeCrunch(500);
    expect(getSessionTelemetrySnapshot().forge.crunchesCompleted).toBe(2);
  });

  it('increments crunchesWithZeroParticles when mass is 0', () => {
    recordForgeCrunch(0);
    const snap = getSessionTelemetrySnapshot();
    expect(snap.forge.crunchesCompleted).toBe(1);
    expect(snap.forge.crunchesWithZeroParticles).toBe(1);
  });

  it('does not count as zero-particle when mass > 0', () => {
    recordForgeCrunch(100);
    expect(getSessionTelemetrySnapshot().forge.crunchesWithZeroParticles).toBe(0);
  });

  it('counts negative mass as zero-particle crunch', () => {
    recordForgeCrunch(-1);
    expect(getSessionTelemetrySnapshot().forge.crunchesWithZeroParticles).toBe(1);
  });
});

describe('recordForgeSacrifice', () => {
  it('accumulates sacrificedMassByTier', () => {
    recordForgeSacrifice('sand', 100, 0);
    recordForgeSacrifice('sand', 200, 0);
    expect(getSessionTelemetrySnapshot().forge.sacrificedMassByTier['sand']).toBe(300);
  });

  it('accumulates equationUpgradesFromSacrificeByTier', () => {
    recordForgeSacrifice('quartz', 2000, 1);
    recordForgeSacrifice('quartz', 4000, 2);
    expect(getSessionTelemetrySnapshot().forge.equationUpgradesFromSacrificeByTier['quartz']).toBe(3);
  });

  it('does not create upgrade entry when upgradesGained is 0', () => {
    recordForgeSacrifice('sand', 500, 0);
    expect(getSessionTelemetrySnapshot().forge.equationUpgradesFromSacrificeByTier['sand']).toBeUndefined();
  });

  it('handles unknown tier keys without throwing', () => {
    expect(() => recordForgeSacrifice('unknown_tier_xyz', 100, 0)).not.toThrow();
    expect(getSessionTelemetrySnapshot().forge.sacrificedMassByTier['unknown_tier_xyz']).toBe(100);
  });
});

// ─── Loom telemetry ───────────────────────────────────────────────────────

describe('recordLoomCapture', () => {
  it('increments capturesByInputTier', () => {
    recordLoomCapture('sand', 50, 'quartz', 0);
    recordLoomCapture('sand', 30, 'quartz', 0);
    expect(getSessionTelemetrySnapshot().loom.capturesByInputTier['sand']).toBe(2);
  });

  it('accumulates capturedMassByInputTier', () => {
    recordLoomCapture('sand', 50, 'quartz', 0);
    recordLoomCapture('sand', 30, 'quartz', 0);
    expect(getSessionTelemetrySnapshot().loom.capturedMassByInputTier['sand']).toBe(80);
  });

  it('accumulates outputMotesProducedByTier when motesProduced > 0', () => {
    recordLoomCapture('sand', 50, 'quartz', 2);
    recordLoomCapture('sand', 50, 'quartz', 1);
    expect(getSessionTelemetrySnapshot().loom.outputMotesProducedByTier['quartz']).toBe(3);
  });

  it('does not create outputMotes entry when motesProduced is 0', () => {
    recordLoomCapture('sand', 10, 'quartz', 0);
    expect(getSessionTelemetrySnapshot().loom.outputMotesProducedByTier['quartz']).toBeUndefined();
  });

  it('handles unknown tier IDs without throwing', () => {
    expect(() => recordLoomCapture('nope', 10, 'also_nope', 1)).not.toThrow();
  });
});

describe('recordLoomEfficiencyUpgrade', () => {
  it('increments efficiencyUpgradesPurchased', () => {
    recordLoomEfficiencyUpgrade();
    recordLoomEfficiencyUpgrade();
    expect(getSessionTelemetrySnapshot().loom.efficiencyUpgradesPurchased).toBe(2);
  });
});

describe('recordLoomPassiveMotes', () => {
  it('accumulates passive motes per tier', () => {
    recordLoomPassiveMotes('quartz', 0.5);
    recordLoomPassiveMotes('quartz', 0.3);
    expect(getSessionTelemetrySnapshot().loom.passiveMotesProduced['quartz']).toBeCloseTo(0.8);
  });

  it('does not create an entry when motes is 0', () => {
    recordLoomPassiveMotes('quartz', 0);
    expect(getSessionTelemetrySnapshot().loom.passiveMotesProduced['quartz']).toBeUndefined();
  });
});

// ─── Aliven telemetry ─────────────────────────────────────────────────────

describe('recordAlivenSpawn', () => {
  it('increments spawnedByVariant', () => {
    recordAlivenSpawn('aliven_spark_cluster', 1);
    recordAlivenSpawn('aliven_spark_cluster', 2);
    expect(getSessionTelemetrySnapshot().aliven.spawnedByVariant['aliven_spark_cluster']).toBe(2);
  });

  it('updates peakActiveGroups to max observed', () => {
    recordAlivenSpawn('aliven_spark_cluster', 3);
    recordAlivenSpawn('aliven_shard_bloom', 5);
    recordAlivenSpawn('aliven_ember_ring', 4);
    expect(getSessionTelemetrySnapshot().aliven.peakActiveGroups).toBe(5);
  });

  it('does not decrease peakActiveGroups', () => {
    recordAlivenSpawn('aliven_spark_cluster', 8);
    recordAlivenSpawn('aliven_spark_cluster', 2);
    expect(getSessionTelemetrySnapshot().aliven.peakActiveGroups).toBe(8);
  });

  it('handles unknown variant IDs without throwing', () => {
    expect(() => recordAlivenSpawn('unknown_variant', 1)).not.toThrow();
  });
});

describe('recordAlivenKill', () => {
  it('increments killedByVariant', () => {
    recordAlivenKill('aliven_spark_cluster');
    recordAlivenKill('aliven_spark_cluster');
    expect(getSessionTelemetrySnapshot().aliven.killedByVariant['aliven_spark_cluster']).toBe(2);
  });

  it('handles unknown variant IDs without throwing', () => {
    expect(() => recordAlivenKill('unknown_variant_abc')).not.toThrow();
    expect(getSessionTelemetrySnapshot().aliven.killedByVariant['unknown_variant_abc']).toBe(1);
  });
});

describe('recordAlivenCapSkip', () => {
  it('increments capSkips', () => {
    recordAlivenCapSkip();
    recordAlivenCapSkip();
    expect(getSessionTelemetrySnapshot().aliven.capSkips).toBe(2);
  });
});

describe('recordPlayerDamageFromContact', () => {
  it('accumulates playerDamageFromContact', () => {
    recordPlayerDamageFromContact(10);
    recordPlayerDamageFromContact(5);
    expect(getSessionTelemetrySnapshot().aliven.playerDamageFromContact).toBe(15);
  });
});

describe('recordPlayerDamageFromBullet', () => {
  it('accumulates playerDamageFromBullets', () => {
    recordPlayerDamageFromBullet(8);
    recordPlayerDamageFromBullet(3);
    expect(getSessionTelemetrySnapshot().aliven.playerDamageFromBullets).toBe(11);
  });
});

describe('recordAlivenBulletFired', () => {
  it('increments bulletsFiredByVariant', () => {
    recordAlivenBulletFired('aliven_spark_cluster');
    recordAlivenBulletFired('aliven_spark_cluster');
    recordAlivenBulletFired('aliven_shard_bloom');
    const snap = getSessionTelemetrySnapshot();
    expect(snap.aliven.bulletsFiredByVariant['aliven_spark_cluster']).toBe(2);
    expect(snap.aliven.bulletsFiredByVariant['aliven_shard_bloom']).toBe(1);
  });
});

// ─── Derived metrics ──────────────────────────────────────────────────────

describe('getAvgSacrificePerCrunch', () => {
  it('returns 0 when no crunches recorded', () => {
    expect(getAvgSacrificePerCrunch()).toBe(0);
  });

  it('returns correct average after one crunch with one tier', () => {
    recordForgeCrunch(2000);
    recordForgeSacrifice('sand', 2000, 1);
    expect(getAvgSacrificePerCrunch()).toBe(2000);
  });

  it('averages across multiple crunches', () => {
    recordForgeCrunch(1000);
    recordForgeSacrifice('sand', 1000, 0);
    recordForgeCrunch(3000);
    recordForgeSacrifice('sand', 3000, 1);
    // avg = (1000 + 3000) / 2 = 2000
    expect(getAvgSacrificePerCrunch()).toBe(2000);
  });

  it('includes all tiers in the total', () => {
    recordForgeCrunch(3000);
    recordForgeSacrifice('sand', 1000, 0);
    recordForgeSacrifice('quartz', 2000, 1);
    // total = 3000, crunches = 1
    expect(getAvgSacrificePerCrunch()).toBe(3000);
  });

  it('returns 0 after reset even if crunches were recorded before', () => {
    recordForgeCrunch(500);
    recordForgeSacrifice('sand', 500, 0);
    resetSessionTelemetry();
    expect(getAvgSacrificePerCrunch()).toBe(0);
  });
});

// ─── Snapshot isolation ──────────────────────────────────────────────────

describe('getSessionTelemetrySnapshot', () => {
  it('returns a deep copy that does not mutate internal state', () => {
    recordForgeCrunch(100);
    const snap = getSessionTelemetrySnapshot();
    snap.forge.crunchesCompleted = 9999;
    // Internal state should be unchanged
    expect(getSessionTelemetrySnapshot().forge.crunchesCompleted).toBe(1);
  });
});
