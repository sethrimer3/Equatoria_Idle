/**
 * audio-paths.ts — All audio asset paths, URL-encoded for special characters.
 *
 * Files with spaces (e.g. "pluck A1.m4a") and hash chars ("C#5.mp3")
 * must be encoded per URL segment so browsers can fetch them correctly.
 */

function encodePath(rawPath: string): string {
  return rawPath.split('/').map(seg => encodeURIComponent(seg)).join('/');
}

export const MUSIC_PATHS: readonly string[] = [
  encodePath('ASSETS/music/stubMusic (1).mp3'),
  encodePath('ASSETS/music/stubMusic (2).mp3'),
  encodePath('ASSETS/music/stubMusic (3).mp3'),
];

export const AMBIANCE_PATH = encodePath('ASSETS/sfx/ambiance/lowRumble.mp3');

export const ACHIEVEMENT_EARNED_PATH     = encodePath('ASSETS/sfx/achievements/achievementEarned.mp3');
export const SECRET_ACHIEVEMENT_EARNED_PATH = encodePath('ASSETS/sfx/achievements/secretAchievementEarned.mp3');
export const ACHIEVEMENT_CLAIM_PATH      = encodePath('ASSETS/sfx/achievements/achievementClaim.mp3');

export const BUY_EQUATION_UPGRADE_PATH = encodePath('ASSETS/sfx/menuNavigation/buyEquationUpgrade.mp3');
export const BUY_LOOM_UPGRADE_PATH     = encodePath('ASSETS/sfx/menuNavigation/buyLoomUpgrade.mp3');
export const ERROR_PATH                = encodePath('ASSETS/sfx/menuNavigation/error.mp3');
export const SWITCHING_TABS_PATH       = encodePath('ASSETS/sfx/menuNavigation/switchingTabs.mp3');

export const MOTES_MERGING_PATHS: readonly string[] = [];

export const MOTES_MERGING_DROPLET_PATH = encodePath('ASSETS/sfx/motesMerging/dropletC4.mp3');

export const SETTINGS_CHANGE_PATHS: readonly string[] = [
  encodePath('ASSETS/sfx/settingsChange/pluck A1.m4a'),
  encodePath('ASSETS/sfx/settingsChange/pluck A2.m4a'),
  encodePath('ASSETS/sfx/settingsChange/pluck D2.m4a'),
  encodePath('ASSETS/sfx/settingsChange/pluck D3.m4a'),
  encodePath('ASSETS/sfx/settingsChange/pluck F2.m4a'),
];

export const FORGE_CHARGING_PATHS: readonly string[] = [
  encodePath('ASSETS/sfx/equationForge/chargingUp/bassHum_A1.m4a'),
  encodePath('ASSETS/sfx/equationForge/chargingUp/bassHum_A2.m4a'),
  encodePath('ASSETS/sfx/equationForge/chargingUp/bassHum_D2.m4a'),
  encodePath('ASSETS/sfx/equationForge/chargingUp/bassHum_D3.m4a'),
  encodePath('ASSETS/sfx/equationForge/chargingUp/bassHum_F2.m4a'),
];

export const FORGE_CRUNCH_PATHS: readonly string[] = [
  encodePath('ASSETS/sfx/equationForge/crunch/tower_shot_kalimba_A4.m4a'),
  encodePath('ASSETS/sfx/equationForge/crunch/tower_shot_kalimba_B3.m4a'),
  encodePath('ASSETS/sfx/equationForge/crunch/tower_shot_kalimba_B4.m4a'),
  encodePath('ASSETS/sfx/equationForge/crunch/tower_shot_kalimba_C#5.mp3'),
  encodePath('ASSETS/sfx/equationForge/crunch/tower_shot_kalimba_C4.m4a'),
  encodePath('ASSETS/sfx/equationForge/crunch/tower_shot_kalimba_D4.m4a'),
  encodePath('ASSETS/sfx/equationForge/crunch/tower_shot_kalimba_D5.mp3'),
  encodePath('ASSETS/sfx/equationForge/crunch/tower_shot_kalimba_E4.m4a'),
  encodePath('ASSETS/sfx/equationForge/crunch/tower_shot_kalimba_E5.mp3'),
  encodePath('ASSETS/sfx/equationForge/crunch/tower_shot_kalimba_F4.m4a'),
  encodePath('ASSETS/sfx/equationForge/crunch/tower_shot_kalimba_F5.mp3'),
  encodePath('ASSETS/sfx/equationForge/crunch/tower_shot_kalimba_G4.m4a'),
];

export const FORGE_CRUNCH_BOOM_PATH = encodePath('ASSETS/sfx/equationForge/forgeCrunchBoom.ogg');

export const CASSETTE_START_PATH = encodePath('ASSETS/music/BossMusic/CassetteStart.ogg');
export const CASSETTE_END_PATH   = encodePath('ASSETS/music/BossMusic/CassetteEnd.ogg');

const _BEAT_LOOP_BPMS = [40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200] as const;

export function getBossBeatLoopPath(bpm: number): string {
  const snapped = _BEAT_LOOP_BPMS.reduce((a, b) => Math.abs(b - bpm) < Math.abs(a - bpm) ? b : a);
  return encodePath(`ASSETS/music/BossMusic/BeatLoops/${snapped}BPMBeatLoop.ogg`);
}
