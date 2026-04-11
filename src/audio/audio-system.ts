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
  SETTINGS_CHANGE_PATHS,
  FORGE_CHARGING_PATHS,
  FORGE_CRUNCH_PATHS,
} from './audio-paths';

// ─── Public interface ────────────────────────────────────────────

export interface AudioSystem {
  /** Resume a suspended AudioContext after a user gesture. */
  resumeContext(): Promise<void>;
  setMusicVolume(v: number): void;
  setSfxVolume(v: number): void;

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
  onForgeSpinUpCancelled(): void;

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
    onAchievementUnlocked:  () => {},
    onAchievementClaimed:   () => {},
    onBuyEquationUpgrade:   () => {},
    onBuyLoomUpgrade:       () => {},
    onError:                () => {},
    onTabChange:            () => {},
    onMotesMerged:          () => {},
    onForgeSpinUpBegan:     () => {},
    onForgeCrunchStarted:   () => {},
    onForgeSpinUpCancelled: () => {},
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

  let _contextStarted = false;

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
            ...SETTINGS_CHANGE_PATHS,
            ...FORGE_CHARGING_PATHS,
            ...FORGE_CRUNCH_PATHS,
          ]);
        }
      }
    },

    setMusicVolume(v: number): void {
      music.setVolume(v);
    },

    setSfxVolume(v: number): void {
      sfx.setVolume(v);
      ambiance.setSfxVolume(v);
    },

    onAchievementUnlocked(isSecret: boolean): void {
      const path = isSecret ? SECRET_ACHIEVEMENT_EARNED_PATH : ACHIEVEMENT_EARNED_PATH;
      void sfx.play(path);
    },

    onAchievementClaimed(): void {
      void sfx.play(ACHIEVEMENT_CLAIM_PATH);
    },

    onBuyEquationUpgrade(): void {
      void sfx.play(BUY_EQUATION_UPGRADE_PATH);
    },

    onBuyLoomUpgrade(): void {
      void sfx.play(BUY_LOOM_UPGRADE_PATH);
    },

    onError(): void {
      void sfx.play(ERROR_PATH);
    },

    onTabChange(_tabId: string): void {
      void sfx.play(SWITCHING_TABS_PATH);
    },

    onMotesMerged(count: number): void {
      for (let i = 0; i < count; i++) {
        sfx.playMotesMerge(MOTES_MERGING_PATHS);
      }
    },

    onForgeSpinUpBegan(): void {
      sfx.startForgeCharging(FORGE_CHARGING_PATHS);
    },

    onForgeCrunchStarted(): void {
      sfx.onForgeCrunch(FORGE_CRUNCH_PATHS);
    },

    onForgeSpinUpCancelled(): void {
      sfx.onForgeChargingCancelled();
    },

    onSettingsChanged(): void {
      sfx.playRandom(SETTINGS_CHANGE_PATHS);
    },

    updateAmbianceForTab(tabId: string): void {
      ambiance.setActive(tabId === 'equation');
    },
  };
}
