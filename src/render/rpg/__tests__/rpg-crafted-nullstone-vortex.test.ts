import { describe, expect, it } from 'vitest';
import type { NullstoneVortex } from '../rpg-types';
import { applyCraftedVortexPullStep } from '../rpg-weapon-vortex';
import {
  CRAFTED_VORTEX_DURATION_MS,
  CRAFTED_VORTEX_MAX_RADIUS_PX,
  CRAFTED_VORTEX_TOTAL_PULL_FRACTION,
} from '../rpg-weapon-constants';

function makeVortex(radiusPx = CRAFTED_VORTEX_MAX_RADIUS_PX): NullstoneVortex {
  return {
    x: 0,
    y: 0,
    radiusPx,
    durationMs: CRAFTED_VORTEX_DURATION_MS,
    maxDurationMs: CRAFTED_VORTEX_DURATION_MS,
    spinAngle: 0,
    damageTimerMs: Number.POSITIVE_INFINITY,
    scaledDamage: 0,
    weaponId: '__test__',
    isCraftedPull: true,
  };
}

describe('crafted Nullstone vortex pull', () => {
  it('pulls only living targets inside the capped radius', () => {
    const vortex = makeVortex(999);
    const inside = { x: CRAFTED_VORTEX_MAX_RADIUS_PX, y: 0, hp: 10 };
    const outside = { x: CRAFTED_VORTEX_MAX_RADIUS_PX + 1, y: 0, hp: 10 };

    applyCraftedVortexPullStep(vortex, [inside, outside], CRAFTED_VORTEX_DURATION_MS);

    expect(inside.x).toBeCloseTo(CRAFTED_VORTEX_MAX_RADIUS_PX * (1 - CRAFTED_VORTEX_TOTAL_PULL_FRACTION));
    expect(outside.x).toBe(CRAFTED_VORTEX_MAX_RADIUS_PX + 1);
  });

  it('does not move dead targets', () => {
    const vortex = makeVortex();
    const dead = { x: 40, y: 0, hp: 0 };

    const affected = applyCraftedVortexPullStep(vortex, [dead], CRAFTED_VORTEX_DURATION_MS);

    expect(affected).toBe(0);
    expect(dead.x).toBe(40);
  });

  it('distributes the old 35% nudge across the visible duration and stops afterward', () => {
    const vortex = makeVortex();
    const target = { x: 40, y: 0, hp: 10 };
    const halfDurationMs = CRAFTED_VORTEX_DURATION_MS / 2;

    applyCraftedVortexPullStep(vortex, [target], halfDurationMs);
    vortex.durationMs -= halfDurationMs;
    applyCraftedVortexPullStep(vortex, [target], halfDurationMs);
    vortex.durationMs = 0;
    const stoppedX = target.x;
    applyCraftedVortexPullStep(vortex, [target], halfDurationMs);

    expect(target.x).toBeCloseTo(40 * (1 - CRAFTED_VORTEX_TOTAL_PULL_FRACTION));
    expect(target.x).toBe(stoppedX);
  });
});
