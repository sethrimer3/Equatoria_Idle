import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../audio-context', () => ({
  getAudioContext: () => null,
}));

import { BossMusicPlayer } from '../boss-music-player';

describe('BossMusicPlayer callback lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cancels the no-context completion callback when disposed', () => {
    const onDone = vi.fn();
    const player = new BossMusicPlayer(() => 0.5);

    player.playCassetteStart('cassette.ogg', onDone);
    player.dispose();
    player.dispose();
    vi.runAllTimers();

    expect(onDone).not.toHaveBeenCalled();
  });

  it('runs the no-context completion callback once while active', () => {
    const onDone = vi.fn();
    const player = new BossMusicPlayer(() => 0.5);

    player.playCassetteStart('cassette.ogg', onDone);
    vi.runAllTimers();

    expect(onDone).toHaveBeenCalledTimes(1);
    player.dispose();
  });
});
