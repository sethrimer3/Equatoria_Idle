/**
 * audio-system.ts — Main AudioSystem orchestrator.
 *
 * Creates and wires MusicPlayer, AmbiancePlayer, and SfxPlayer.
 * Falls back to a no-op implementation when Web Audio is unavailable.
 *
 * All methods are safe to call before the audio context is resumed —
 * they will queue or silently skip until the context is running.
 */

import { resumeAudioContext, getAudioContext } from './audio-context';
import { preloadAudioBuffers } from './audio-loader';
import { MusicPlayer } from './music-player';
import { AmbiancePlayer } from './ambiance-player';
import { SfxPlayer } from './sfx-player';
import { BossMusicPlayer } from './boss-music-player';
import {
  MUSIC_PATHS,
  AMBIANCE_PATH,
  ACHIEVEMENT_EARNED_PATH,
  SECRET_ACHIEVEMENT_EARNED_PATH,
  ACHIEVEMENT_CLAIM_PATH,
  BUY_EQUATION_UPGRADE_PATH,
  BUY_LOOM_UPGRADE_PATH,
  ERROR_PATH,
  SWITCHING_TABS_PATH,
  MOTES_MERGING_PATHS,
  MOTES_MERGING_DROPLET_PATH,
  SETTINGS_CHANGE_PATHS,
  FORGE_CHARGING_PATHS,
  FORGE_CRUNCH_PATHS,
  FORGE_CRUNCH_BOOM_PATH,
} from './audio-paths';

// ─── Public interface ────────────────────────────────────────────

export interface AudioSystem {
  /** Resume a suspended AudioContext after a user gesture. */
  resumeContext(): Promise<void>;
  setMusicVolume(v: number): void;
  setSfxVolume(v: number): void;

  /**
   * Suspend or resume audio based on window focus state.
   * Call with `false` when the window/tab loses focus, `true` when it regains it.
   * Has no effect until the AudioContext has been started by a user gesture.
   */
  setFocused(focused: boolean): void;

  // Achievement events
  onAchievementUnlocked(isSecret: boolean): void;
  onAchievementClaimed(): void;

  // Menu navigation events
  onBuyEquationUpgrade(): void;
  onBuyLoomUpgrade(): void;
  onError(): void;
  onTabChange(tabId: string): void;

  // Particle/forge events
  onMotesMerged(count: number): void;
  onForgeSpinUpBegan(): void;
  onForgeCrunchStarted(): void;
  onForgeCrunchCompleted(): void;
  onForgeSpinUpCancelled(): void;

  // Boss MIDI/music events
  bossCassetteStart(path: string, onDone: () => void): void;
  startBossMusic(beatLoop: string, bgLayers: readonly string[], onPrimaryTrackReady?: (durationMs: number) => void): void;
  startBossMusicWithCassette(cassetteStart: string, beatLoop: string, bgLayers: readonly string[], onPrimaryTrackReady?: (durationMs: number) => void): void;
  stopBossMusic(): void;
  stopBossMusicWithCassette(cassetteEnd: string, onDone: () => void): void;
  playBossMusicPhrase(path: string): void;

  // Settings events
  onSettingsChanged(): void;

  // Ambiance update (call every frame or on tab change)
  updateAmbianceForTab(tabId: string): void;
}

// ─── No-op fallback ──────────────────────────────────────────────

function createNoOpAudioSystem(): AudioSystem {
  return {
    resumeContext:          async () => {},
    setMusicVolume:         () => {},
    setSfxVolume:           () => {},
    setFocused:             () => {},
    onAchievementUnlocked:  () => {},
    onAchievementClaimed:   () => {},
    onBuyEquationUpgrade:   () => {},
    onBuyLoomUpgrade:       () => {},
    onError:                () => {},
    onTabChange:            () => {},
    onMotesMerged:          () => {},
    onForgeSpinUpBegan:     () => {},
    onForgeCrunchStarted:   () => {},
    onForgeCrunchCompleted: () => {},
    onForgeSpinUpCancelled: () => {},
    bossCassetteStart:            (_p, onDone) => { onDone(); },
    startBossMusic:               () => {},
    startBossMusicWithCassette:   () => {},
    stopBossMusic:                () => {},
    stopBossMusicWithCassette:    (_ce, onDone) => { onDone(); },
    playBossMusicPhrase:          () => {},
    onSettingsChanged:      () => {},
    updateAmbianceForTab:   () => {},
  };
}

// ─── Factory ─────────────────────────────────────────────────────

/**
 * Create the audio system.
 * Pass initial volumes from SettingsState so levels are correct before
 * any slider interaction.
 */
export function createAudioSystem(musicVolume = 0.5, sfxVolume = 0.7): AudioSystem {
  // Guard against environments without Web Audio
  const w = window as unknown as { webkitAudioContext?: typeof AudioContext };
  if (typeof AudioContext === 'undefined' && typeof w.webkitAudioContext === 'undefined') {
    return createNoOpAudioSystem();
  }

  const music   = new MusicPlayer(musicVolume);
  const ambiance = new AmbiancePlayer(sfxVolume);
  const sfx     = new SfxPlayer(sfxVolume);
  const bossMusic = new BossMusicPlayer(() => musicVolume);

  let _contextStarted = false;
  let _isFocused = true;

  return {
    async resumeContext(): Promise<void> {
      await resumeAudioContext();
      if (!_contextStarted) {
        _contextStarted = true;
        music.start();
        // Preload all SFX buffers now that we have a running context
        const ctx = getAudioContext();
        if (ctx) {
          preloadAudioBuffers(ctx, [
            ...MUSIC_PATHS,
            AMBIANCE_PATH,
            ACHIEVEMENT_EARNED_PATH,
            SECRET_ACHIEVEMENT_EARNED_PATH,
            ACHIEVEMENT_CLAIM_PATH,
            BUY_EQUATION_UPGRADE_PATH,
            BUY_LOOM_UPGRADE_PATH,
            ERROR_PATH,
            SWITCHING_TABS_PATH,
            ...MOTES_MERGING_PATHS,
            MOTES_MERGING_DROPLET_PATH,
            ...SETTINGS_CHANGE_PATHS,
            ...FORGE_CHARGING_PATHS,
            ...FORGE_CRUNCH_PATHS,
            FORGE_CRUNCH_BOOM_PATH,
          ]);
        }
      }
    },

    setMusicVolume(v: number): void {
      musicVolume = v;
      music.setVolume(v);
      bossMusic.setVolume(v);
    },

    setSfxVolume(v: number): void {
      sfx.setVolume(v);
      ambiance.setSfxVolume(v);
    },

    setFocused(focused: boolean): void {
      _isFocused = focused;
      sfx.setEnabled(focused);
      // No-op until the context has been started by a user gesture.
      if (!_contextStarted) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      if (focused) {
        void ctx.resume();
      } else {
        void ctx.suspend();
      }
    },

    onAchievementUnlocked(isSecret: boolean): void {
      if (!_isFocused) return;
      const path = isSecret ? SECRET_ACHIEVEMENT_EARNED_PATH : ACHIEVEMENT_EARNED_PATH;
      void sfx.play(path);
    },

    onAchievementClaimed(): void {
      if (!_isFocused) return;
      void sfx.play(ACHIEVEMENT_CLAIM_PATH);
    },

    onBuyEquationUpgrade(): void {
      if (!_isFocused) return;
      void sfx.play(BUY_EQUATION_UPGRADE_PATH);
    },

    onBuyLoomUpgrade(): void {
      if (!_isFocused) return;
      void sfx.play(BUY_LOOM_UPGRADE_PATH);
    },

    onError(): void {
      if (!_isFocused) return;
      void sfx.play(ERROR_PATH);
    },

    onTabChange(_tabId: string): void {
      if (!_isFocused) return;
      void sfx.play(SWITCHING_TABS_PATH);
    },

    onMotesMerged(count: number): void {
      if (!_isFocused) return;
      for (let i = 0; i < count; i++) {
        sfx.playMotesMerge(MOTES_MERGING_PATHS, MOTES_MERGING_DROPLET_PATH);
      }
    },

    onForgeSpinUpBegan(): void {
      if (!_isFocused) return;
      sfx.startForgeCharging(FORGE_CHARGING_PATHS);
    },

    onForgeCrunchStarted(): void {
      if (!_isFocused) return;
      sfx.onForgeCrunch(FORGE_CRUNCH_PATHS);
    },

    onForgeCrunchCompleted(): void {
      if (!_isFocused) return;
      sfx.onForgeCrunchCompleted(FORGE_CRUNCH_BOOM_PATH);
    },

    onForgeSpinUpCancelled(): void {
      if (!_isFocused) return;
      sfx.onForgeChargingCancelled();
    },

    startBossMusic(beatLoop: string, bgLayers: readonly string[], onPrimaryTrackReady?: (durationMs: number) => void): void {
      if (!_isFocused) return;
      bossMusic.start(beatLoop, bgLayers, onPrimaryTrackReady);
    },

    startBossMusicWithCassette(cassetteStart: string, beatLoop: string, bgLayers: readonly string[], onPrimaryTrackReady?: (durationMs: number) => void): void {
      if (!_isFocused) return;
      bossMusic.startWithCassette(cassetteStart, beatLoop, bgLayers, onPrimaryTrackReady);
    },

    stopBossMusic(): void {
      bossMusic.stop();
    },

    stopBossMusicWithCassette(cassetteEnd: string, onDone: () => void): void {
      bossMusic.stopWithCassette(cassetteEnd, onDone);
    },

    playBossMusicPhrase(path: string): void {
      if (!_isFocused) return;
      bossMusic.playPhrase(path);
    },

    onSettingsChanged(): void {
      if (!_isFocused) return;
      sfx.playRandom(SETTINGS_CHANGE_PATHS);
    },

    updateAmbianceForTab(tabId: string): void {
      ambiance.setActive(tabId === 'equation');
    },
  };
}
