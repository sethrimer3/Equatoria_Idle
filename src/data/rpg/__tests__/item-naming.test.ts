/**
 * item-naming.test.ts — Tests for flavor-aware lens and weave name generation.
 *
 * All tests are deterministic. Names must be concise and readable.
 */

import { describe, it, expect } from 'vitest';
import { getLensName, LENS_ZONE_ADJECTIVES, LENS_EFFECT_NOUNS } from '../lens-rolling';
import { getWeaveName, WEAVE_ZONE_ADJECTIVES, WEAVE_EFFECT_PHRASES } from '../weave-rolling';

// ─── Lens naming ──────────────────────────────────────────────────────────────

describe('getLensName', () => {
  it('no tiers → Null Lens', () => {
    expect(getLensName([])).toBe('Null Lens');
  });

  it('single tier, no zone, no boss → "{Tier} Lens of {EffectNoun}"', () => {
    const name = getLensName(['ruby']);
    expect(name).toContain('Ruby');
    expect(name).toContain('Lens');
    expect(name).toContain('Ignition');
  });

  it('single tier with zone → "{ZoneAdj} {Tier} Lens"', () => {
    const name = getLensName(['sapphire'], { zoneId: 'caustics' });
    expect(name).toBe('Caustic Sapphire Lens');
  });

  it('single tier with boss (no zone) → "Grand {Tier} Lens"', () => {
    const name = getLensName(['ruby'], { isBoss: true });
    expect(name).toBe('Grand Ruby Lens');
  });

  it('single tier with boss AND zone → "Apex {Tier} Lens"', () => {
    const name = getLensName(['eigenstein'], { isBoss: true, zoneId: 'horizon' });
    expect(name).toBe('Apex Eigenstein Lens');
  });

  it('two tiers, no zone → "{Dom}-{Sec} Compound Lens"', () => {
    // eigenstein has higher unlockOrder than sand, so it is dominant
    const name = getLensName(['sand', 'eigenstein']);
    expect(name).toContain('Compound Lens');
    expect(name).toContain('Eigenstein');
  });

  it('two tiers with zone → "{ZoneAdj} Compound Lens"', () => {
    const name = getLensName(['sand', 'quartz'], { zoneId: 'euhedral' });
    expect(name).toContain('Euhedral');
    expect(name).toContain('Compound Lens');
  });

  it('three or more tiers → "{DomTier} Composite Lens"', () => {
    const name = getLensName(['sand', 'ruby', 'sapphire']);
    expect(name).toContain('Composite Lens');
  });

  it('all 5 zones produce distinct adjectives', () => {
    const adjectives = Object.values(LENS_ZONE_ADJECTIVES);
    const uniqueAdj = new Set(adjectives);
    expect(uniqueAdj.size).toBe(adjectives.length);
  });

  it('each zone adjective appears in a single-tier zone-specific name', () => {
    for (const [zoneId, adj] of Object.entries(LENS_ZONE_ADJECTIVES)) {
      const name = getLensName(['sand'], { zoneId });
      expect(name).toContain(adj);
    }
  });

  it('effect nouns are defined for all 12 tiers', () => {
    const tiers = [
      'sand', 'quartz', 'ruby', 'citrine', 'emerald', 'sapphire',
      'iolite', 'amethyst', 'diamond', 'nullstone', 'fracteryl', 'eigenstein',
    ] as const;
    for (const tier of tiers) {
      expect(LENS_EFFECT_NOUNS[tier]).toBeTruthy();
    }
  });
});

// ─── Weave naming ─────────────────────────────────────────────────────────────

describe('getWeaveName', () => {
  it('no tiers → Null Thread', () => {
    expect(getWeaveName([])).toBe('Null Thread');
  });

  it('single tier, no zone → "{Tier} Weave of {EffectPhrase}"', () => {
    const name = getWeaveName(['emerald']);
    expect(name).toContain('Emerald');
    expect(name).toContain('Weave');
    expect(name).toContain('Echoing Growth');
  });

  it('single tier with zone → "{ZoneAdj} Weave of {EffectPhrase}"', () => {
    const name = getWeaveName(['emerald'], { zoneId: 'verdure' });
    expect(name).toBe('Verdant Weave of Echoing Growth');
  });

  it('nullstone with zone → contains "Hollow Orbit"', () => {
    const name = getWeaveName(['nullstone'], { zoneId: 'impetus' });
    expect(name).toContain('Hollow Orbit');
  });

  it('single tier with boss (no zone) → "Grand {Tier} Weave"', () => {
    const name = getWeaveName(['nullstone'], { isBoss: true });
    expect(name).toBe('Grand Nullstone Weave');
  });

  it('single tier with boss AND zone → "Apex {ZoneAdj} Weave"', () => {
    const name = getWeaveName(['eigenstein'], { isBoss: true, zoneId: 'horizon' });
    expect(name).toBe('Apex Liminal Weave');
  });

  it('two tiers, no zone → "{Dom}-{Sec} Weave"', () => {
    const name = getWeaveName(['sand', 'diamond']);
    expect(name).toContain('Weave');
    expect(name).toContain('Diamond');
  });

  it('two tiers with zone → "{ZoneAdj} {Dom}-{Sec} Weave"', () => {
    const name = getWeaveName(['citrine', 'sapphire'], { zoneId: 'caustics' });
    expect(name).toContain('Caustic');
    expect(name).toContain('Weave');
  });

  it('three tiers → "{DomTier} Composite Weave"', () => {
    const name = getWeaveName(['sand', 'emerald', 'iolite']);
    expect(name).toContain('Composite Weave');
  });

  it('all 5 zones produce distinct adjectives for weaves', () => {
    const adjectives = Object.values(WEAVE_ZONE_ADJECTIVES);
    const uniqueAdj = new Set(adjectives);
    expect(uniqueAdj.size).toBe(adjectives.length);
  });

  it('effect phrases are defined for all 12 tiers', () => {
    const tiers = [
      'sand', 'quartz', 'ruby', 'citrine', 'emerald', 'sapphire',
      'iolite', 'amethyst', 'diamond', 'nullstone', 'fracteryl', 'eigenstein',
    ] as const;
    for (const tier of tiers) {
      expect(WEAVE_EFFECT_PHRASES[tier]).toBeTruthy();
    }
  });
});
