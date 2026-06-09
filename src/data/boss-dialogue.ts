/**
 * Boss dialogue data. Add or customize boss writing here; runtime wiring belongs
 * in rpg-boss-dialogue.ts.
 */
export type BossDialogueEvent =
  | 'BOSS_SPAWNED' | 'BOSS_INTRO_COMPLETE'
  | 'PHASE_STARTED' | 'PHASE_CHANGED' | 'HP_THRESHOLD'
  | 'BOSS_SHIELD_BROKEN' | 'BOSS_INVULN_STARTED' | 'BOSS_ABSORB_STARTED'
  | 'BOSS_DANMAKU_STARTED' | 'BOSS_SPECIAL_ATTACK_CHARGING' | 'BOSS_SPECIAL_ATTACK_FIRED'
  | 'BOSS_HIT_PLAYER_HARD' | 'PLAYER_BLOCKED_BOSS_ATTACK' | 'PLAYER_NEAR_DEATH'
  | 'BOSS_NEAR_DEATH' | 'BOSS_KILLED_PLAYER' | 'BOSS_DEFEATED';

export interface BossHpThresholdDialogue {
  ratio: number;
  once: boolean;
  lines: readonly string[];
}

export interface BossDialogueEntry {
  name?: string;
  intro?: readonly string[];
  phaseStart?: Partial<Record<0 | 1 | 2, readonly string[]>>;
  hpThresholds?: readonly BossHpThresholdDialogue[];
  events?: Partial<Record<BossDialogueEvent, readonly string[]>>;
}

export interface BossDialogueTable {
  defaults: Partial<Record<BossDialogueEvent, readonly string[]>>;
  bosses: Record<string, BossDialogueEntry>;
}

export const BOSS_DIALOGUE: BossDialogueTable = {
  defaults: {
    BOSS_SPAWNED: ['You have come far enough.'],
    PHASE_STARTED: ['Begin.'],
    PHASE_CHANGED: ['The pattern changes.'],
    HP_THRESHOLD: ['You press onward.'],
    BOSS_SHIELD_BROKEN: ['The ward falls.'],
    BOSS_INVULN_STARTED: ['You cannot touch this state.'],
    BOSS_ABSORB_STARTED: ['Your force becomes mine.'],
    BOSS_DANMAKU_STARTED: ['Find the gap.'],
    BOSS_SPECIAL_ATTACK_CHARGING: ['Observe carefully.'],
    BOSS_SPECIAL_ATTACK_FIRED: ['Now, endure.'],
    BOSS_HIT_PLAYER_HARD: ['Your orbit collapses.'],
    PLAYER_BLOCKED_BOSS_ATTACK: ['A useful defense.'],
    PLAYER_NEAR_DEATH: ['One term remains.'],
    BOSS_NEAR_DEATH: ['The final term approaches.'],
    BOSS_KILLED_PLAYER: ['The equation balances.'],
    BOSS_DEFEATED: ['This is not the end.'],
  },
  bosses: {
    boss_1: {
      name: 'The First Axiom',
      intro: ['So. The little mote arrives.', 'Let us see what your motion means.'],
      phaseStart: {
        0: ['Begin.'],
        1: ['You learned one pattern. Learn another.'],
        2: ['Now the proof closes.'],
      },
      hpThresholds: [
        { ratio: 0.75, once: true, lines: ['A shallow mark.'] },
        { ratio: 0.50, once: true, lines: ['Half is not defeat.'] },
        { ratio: 0.25, once: true, lines: ['You press against the final term.'] },
      ],
      events: {
        BOSS_DANMAKU_STARTED: ['Find the gap.'],
        BOSS_HIT_PLAYER_HARD: ['Your orbit collapses.'],
        PLAYER_BLOCKED_BOSS_ATTACK: ['A useful defense.'],
        BOSS_KILLED_PLAYER: ['The equation balances.'],
        BOSS_DEFEATED: ['Unsolved... still...'],
      },
    },
  },
};

export function getBossDialogueKey(bossId: number): string {
  return `boss_${bossId}`;
}

