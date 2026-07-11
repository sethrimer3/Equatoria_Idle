import { describe, expect, it } from 'vitest';
import { canLeaveLoadingScreen } from '../loading-gate';

describe('loading screen gate', () => {
  it.each([
    [true, 0, false], [true, 1, false], [true, 2, true], [true, 4, true], [false, 4, false],
  ])('loading=%s loops=%s => %s', (isLoadingComplete, completedLoops, expected) => {
    expect(canLeaveLoadingScreen({ isLoadingComplete, completedLoops, hasFailed: false })).toBe(expected);
  });

  it('fail-opens when animation initialization fails', () => {
    expect(canLeaveLoadingScreen({ isLoadingComplete: false, completedLoops: 0, hasFailed: true })).toBe(true);
  });
});
