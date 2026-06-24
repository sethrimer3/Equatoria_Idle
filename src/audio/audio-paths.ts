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

export interface BossMusicTrack {
  path: string;
  title: string;
}

const BOSS_MUSIC_TRACKS_BY_BPM: Readonly<Record<number, readonly string[]>> = {
  50: ['BPM50-slimeyfox-midnight-high-score-487270.mp3'],
  60: ['BPM60-psyai-cinematic-atmosphere-ambient-background-for-film-and-video-462156.mp3'],
  70: ['BPM70-moodstrides-indigo-dusk-496853.mp3'],
  80: ['BPM80-verzand-horizon-99058.mp3'],
  90: ['BPM90-jim_combs-the-80s-called-they-want-their-synths-back-140535.mp3', 'BPM90-onesevenbeatxs-slow-westcoast-boombap-type-beat-359448.mp3'],
  100: ['BPM100-jasewhatson-void-protocol-473030.mp3', 'BPM100-leonarc-no-fearcinematic-hip-hop-beat-546425.mp3'],
  110: ['BPM110-slimeyfox-hyperwoofer-ghost-engine-541639.mp3', 'BPM110-thisisbeatkitchen-my-heartbeat-110-bpm-instrumental-235079.mp3', 'BPM110-thisisbeatkitchen-summer-110-bpm-dancehall-instrumental-233181.mp3'],
  120: ['BPM120-cekketto-enum3rato-469167.mp3', 'BPM120-erlanharmonies-heros-de-lx27ombre-290133.mp3', 'BPM120-keren_shteimberg-morning-drift-keren-shteimberg-547664.mp3', 'BPM120-trangiahung159-clockwork-pulse-536981.mp3'],
  130: ['BPM130-apoprtv-free-for-profit-hiphop-synth-background-beat-130-bpm-110001.mp3', 'BPM130-justchilling1991-black-mamba-243827.mp3', 'BPM130-u_kw4gx9l0hh-i-fell-asleep-130bpm-276466.mp3'],
  140: ['BPM140-cekketto-esper-451822.mp3', 'BPM140-kamhunt-trap-beat-1-140bpm-157804.mp3', 'BPM140-spyum-spyum-space-news-0x07-464642.mp3'],
  150: ['BPM150-erlanharmonies-heros-de-lx27ombre-290133.mp3', 'BPM150-psychronic-binary-battle-404700.mp3', 'BPM150-psychronic-data-spike-481774.mp3', 'BPM150-psychronic-infinite-cosmos-404709.mp3', 'BPM150-psychronic-rebel-frequency-454812.mp3', 'BPM150-psychronic-terminus-engine-481773.mp3', 'BPM150-psychronic-the-sky-remembers-521619.mp3', 'BPM150-yoshiyuki_tatsuya-i-donx27t-like-nights-429605.mp3'],
  160: ['BPM160-cg6-cyber-jump-499060.mp3', 'BPM160-mewwwwwww-angelic-frutiger-aero-554728.mp3', 'BPM160-quibsunmusic-tutur-donx27t-say-142792.mp3', 'BPM160-thisisbeatkitchen-beatkitchen-the-power-of-hope-160-bpm-377764.mp3'],
  170: ['BPM170-beatkitchen-evening-with-girlfriend-gt-hip-hop-rap-instrumental-170-bpm-223310.mp3', 'BPM170-looksmusic-170-bpm-happy_-hard-core_-dj_-music_-2025-352678.mp3', 'BPM170-melodyayresgriffiths-hummingbird-game-loop-hiphop-piano-beat-56-seconds-170-bpm-110882.mp3', 'BPM170-yoshiyuki_tatsuya-high-peek-429685.mp3'],
  180: ['BPM180-legendsquare-synthesis-287152.mp3'],
};

/** Picks a boss track whose authored tempo matches the supplied boss BPM. */
export function getRandomBossMusicTrack(bpm: number): BossMusicTrack | null {
  const tracks = BOSS_MUSIC_TRACKS_BY_BPM[bpm];
  if (!tracks || tracks.length === 0) return null;
  const filename = tracks[Math.floor(Math.random() * tracks.length)]!;
  return {
    path: encodePath(`ASSETS/music/BossMusic/${bpm}BPM/${filename}`),
    title: formatBossTrackTitle(filename),
  };
}

function formatBossTrackTitle(filename: string): string {
  return filename
    .replace(/^BPM\d+-/, '')
    .replace(/\.[^.]+$/, '')
    .replace(/^[^-]+-/, '') // asset author/handle
    .replace(/-\d+$/, '') // asset catalogue ID
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
