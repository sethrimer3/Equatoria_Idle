/**
 * rpg-combat-event-log.ts — Lightweight ring-buffer for recent status-combo events.
 *
 * Safe in production: recording is always cheap (array push + shift at most).
 * The log is purely in-memory and is never persisted or saved.
 */

const MAX_EVENTS = 20;

export interface CombatComboEvent {
  /** performance.now() timestamp when the combo fired. */
  timeMs: number;
  comboId: string;
  /** feedbackLabel from the combo definition (e.g. "STEAM"). */
  comboLabel: string;
  enemyTypeId: string;
  primaryDamage: number;
  aoeDamage: number;
  triggerKind?: string;
}

const _events: CombatComboEvent[] = [];

export function recordComboEvent(e: CombatComboEvent): void {
  _events.push(e);
  if (_events.length > MAX_EVENTS) _events.shift();
}

/** Returns a read-only view of recent events, newest last. */
export function getRecentComboEvents(): readonly CombatComboEvent[] {
  return _events;
}

export function clearComboEventLog(): void {
  _events.length = 0;
}
