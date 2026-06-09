/**
 * Boss dialogue director. Boss writing is data-only in src/data/boss-dialogue.ts.
 * This system is intentionally separate from normal enemy barks.
 */
import {
  BOSS_DIALOGUE,
  getBossDialogueKey,
  type BossDialogueEvent,
  type BossDialogueEntry,
} from '../../data/boss-dialogue';
import { DAMAGE_NUM_FONT_FAMILY } from './rpg-constants';
import type { BossEnemy } from './rpg-enemy-types';

const LINE_DURATION_MS = 3600;
const MINOR_COOLDOWN_MS = 5000;
const MAJOR_COOLDOWN_MS = 900;
const DEFAULT_THRESHOLDS = [
  { ratio: 0.75, once: true, lines: BOSS_DIALOGUE.defaults.HP_THRESHOLD ?? [] },
  { ratio: 0.5, once: true, lines: BOSS_DIALOGUE.defaults.HP_THRESHOLD ?? [] },
  { ratio: 0.25, once: true, lines: BOSS_DIALOGUE.defaults.HP_THRESHOLD ?? [] },
  { ratio: 0.1, once: true, lines: BOSS_DIALOGUE.defaults.BOSS_NEAR_DEATH ?? [] },
] as const;

export interface BossDialogueContext {
  phaseIndex?: 0 | 1 | 2;
  hpRatio?: number;
}

interface BossDialogueState {
  boss: BossEnemy | null;
  previousPhaseIndex: 0 | 1 | 2;
  introPlayed: boolean;
  triggeredThresholds: Set<number>;
  activeLine: string | null;
  activeLineTimerMs: number;
  cooldownMs: number;
  priority: number;
  defeated: boolean;
}

const state: BossDialogueState = {
  boss: null,
  previousPhaseIndex: 0,
  introPlayed: false,
  triggeredThresholds: new Set<number>(),
  activeLine: null,
  activeLineTimerMs: 0,
  cooldownMs: 0,
  priority: 0,
  defeated: false,
};

function getEntry(boss: BossEnemy): BossDialogueEntry | undefined {
  return BOSS_DIALOGUE.bosses[getBossDialogueKey(boss.bossId)];
}

function pick(lines: readonly string[] | undefined): string | null {
  if (!lines || lines.length === 0) return null;
  return lines[Math.floor(Math.random() * lines.length)] ?? null;
}

function resolveEventLine(boss: BossEnemy, eventType: BossDialogueEvent): string | null {
  return pick(getEntry(boss)?.events?.[eventType]) ?? pick(BOSS_DIALOGUE.defaults[eventType]);
}

function showLine(boss: BossEnemy, line: string | null, priority: number, major = false): void {
  if (!line || (boss.hp <= 0 && priority < 100) || priority < state.priority) return;
  if (!major && state.cooldownMs > 0) return;
  state.activeLine = line;
  state.activeLineTimerMs = LINE_DURATION_MS;
  state.cooldownMs = major ? MAJOR_COOLDOWN_MS : MINOR_COOLDOWN_MS;
  state.priority = priority;
}

export function initBossDialogueSystem(): void {
  state.boss = null;
  state.activeLine = null;
  state.activeLineTimerMs = 0;
  state.cooldownMs = 0;
  state.priority = 0;
  state.defeated = false;
  state.triggeredThresholds.clear();
}

export function resetBossDialogueForNewBoss(boss: BossEnemy): void {
  state.boss = boss;
  state.previousPhaseIndex = boss.phaseIndex;
  state.introPlayed = false;
  state.triggeredThresholds.clear();
  state.activeLine = null;
  state.activeLineTimerMs = 0;
  state.cooldownMs = 0;
  state.priority = 0;
  state.defeated = false;
}

export function notifyBossSpawned(boss: BossEnemy): void {
  resetBossDialogueForNewBoss(boss);
  const intro = getEntry(boss)?.intro;
  showLine(boss, pick(intro) ?? resolveEventLine(boss, 'BOSS_SPAWNED'), 80, true);
  state.introPlayed = true;
}

export function notifyBossPhaseChanged(boss: BossEnemy, _oldPhase: 0 | 1 | 2, newPhase: 0 | 1 | 2): void {
  const line = pick(getEntry(boss)?.phaseStart?.[newPhase])
    ?? resolveEventLine(boss, newPhase === 0 ? 'PHASE_STARTED' : 'PHASE_CHANGED');
  showLine(boss, line, 85, true);
}

export function notifyBossDamaged(boss: BossEnemy, _damageAmount: number): void {
  if (boss.hp <= 0 || state.defeated) return;
  const ratio = boss.hp / Math.max(1, boss.maxHp);
  const thresholds = getEntry(boss)?.hpThresholds ?? DEFAULT_THRESHOLDS;
  for (const threshold of thresholds) {
    if (ratio <= threshold.ratio && (!threshold.once || !state.triggeredThresholds.has(threshold.ratio))) {
      state.triggeredThresholds.add(threshold.ratio);
      const event = threshold.ratio <= 0.1 ? 'BOSS_NEAR_DEATH' : 'HP_THRESHOLD';
      showLine(boss, pick(threshold.lines) ?? resolveEventLine(boss, event), threshold.ratio <= 0.1 ? 90 : 70, true);
      break;
    }
  }
}

export function notifyBossEvent(boss: BossEnemy, eventType: BossDialogueEvent, _context?: BossDialogueContext): void {
  if (state.defeated || boss.hp <= 0) return;
  const priority = eventType === 'BOSS_HIT_PLAYER_HARD' || eventType === 'PLAYER_NEAR_DEATH' ? 65 : 45;
  showLine(boss, resolveEventLine(boss, eventType), priority);
}

export function notifyBossDefeated(boss: BossEnemy): void {
  state.boss = boss;
  state.defeated = true;
  showLine(boss, resolveEventLine(boss, 'BOSS_DEFEATED'), 100, true);
}

export function notifyBossKilledPlayer(boss: BossEnemy): void {
  showLine(boss, resolveEventLine(boss, 'BOSS_KILLED_PLAYER'), 100, true);
}

export function tickBossDialogue(deltaMs: number, boss: BossEnemy | null): void {
  if (state.activeLineTimerMs > 0) {
    state.activeLineTimerMs = Math.max(0, state.activeLineTimerMs - deltaMs);
    if (state.activeLineTimerMs === 0) {
      state.activeLine = null;
      state.priority = 0;
    }
  }
  if (state.cooldownMs > 0) state.cooldownMs = Math.max(0, state.cooldownMs - deltaMs);
  if (!boss || state.defeated) return;
  if (state.boss !== boss) notifyBossSpawned(boss);
  if (boss.phaseIndex !== state.previousPhaseIndex) {
    const oldPhase = state.previousPhaseIndex;
    state.previousPhaseIndex = boss.phaseIndex;
    notifyBossPhaseChanged(boss, oldPhase, boss.phaseIndex);
  }
  notifyBossDamaged(boss, 0);
}

export function renderBossDialogue(
  ctx: CanvasRenderingContext2D,
  viewport: { left: number; top: number; right: number; bottom: number },
  boss: BossEnemy | null,
): void {
  if (!state.activeLine || state.activeLineTimerMs <= 0 || (!boss && !state.defeated)) return;
  const width = Math.min(300, viewport.right - viewport.left - 20);
  const x = viewport.left + (viewport.right - viewport.left) / 2;
  const y = viewport.top + 24;
  const alpha = Math.min(1, state.activeLineTimerMs / 350);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(5, 5, 14, 0.88)';
  ctx.strokeStyle = '#d8c6ff';
  ctx.lineWidth = 1;
  ctx.fillRect(x - width / 2, y - 12, width, 25);
  ctx.strokeRect(x - width / 2, y - 12, width, 25);
  ctx.font = `bold 8px ${DAMAGE_NUM_FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(state.activeLine, x, y + 1, width - 12);
  ctx.restore();
}
