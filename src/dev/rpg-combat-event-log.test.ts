import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordComboEvent,
  getRecentComboEvents,
  clearComboEventLog,
  type CombatComboEvent,
} from './rpg-combat-event-log';

const makeEvent = (overrides: Partial<CombatComboEvent> = {}): CombatComboEvent => ({
  timeMs: performance.now(),
  comboId: 'steamBurst',
  comboLabel: 'STEAM',
  enemyTypeId: 'ruby',
  primaryDamage: 100,
  aoeDamage: 50,
  triggerKind: 'aoeHit',
  ...overrides,
});

describe('rpg-combat-event-log', () => {
  beforeEach(() => {
    clearComboEventLog();
  });

  it('starts empty after clear', () => {
    expect(getRecentComboEvents()).toHaveLength(0);
  });

  it('records an event with all fields', () => {
    const ev = makeEvent({ comboId: 'shatter', comboLabel: 'SHATTER', primaryDamage: 200, aoeDamage: 0 });
    recordComboEvent(ev);
    const events = getRecentComboEvents();
    expect(events).toHaveLength(1);
    expect(events[0].comboId).toBe('shatter');
    expect(events[0].comboLabel).toBe('SHATTER');
    expect(events[0].primaryDamage).toBe(200);
    expect(events[0].aoeDamage).toBe(0);
    expect(events[0].enemyTypeId).toBe('ruby');
  });

  it('appends events newest-last', () => {
    recordComboEvent(makeEvent({ comboId: 'steamBurst' }));
    recordComboEvent(makeEvent({ comboId: 'shatter' }));
    recordComboEvent(makeEvent({ comboId: 'toxicRupture' }));
    const events = getRecentComboEvents();
    expect(events[0].comboId).toBe('steamBurst');
    expect(events[1].comboId).toBe('shatter');
    expect(events[2].comboId).toBe('toxicRupture');
  });

  it('caps at MAX_EVENTS (20) by dropping the oldest', () => {
    for (let i = 0; i < 25; i++) {
      recordComboEvent(makeEvent({ comboId: `combo_${i}`, primaryDamage: i }));
    }
    const events = getRecentComboEvents();
    expect(events).toHaveLength(20);
    expect(events[0].primaryDamage).toBe(5);
    expect(events[19].primaryDamage).toBe(24);
  });

  it('clearComboEventLog removes all events', () => {
    recordComboEvent(makeEvent());
    recordComboEvent(makeEvent());
    clearComboEventLog();
    expect(getRecentComboEvents()).toHaveLength(0);
  });

  it('returns a readonly view (reference stable after record)', () => {
    recordComboEvent(makeEvent({ comboId: 'steamBurst' }));
    const before = getRecentComboEvents();
    recordComboEvent(makeEvent({ comboId: 'shatter' }));
    const after = getRecentComboEvents();
    expect(after).toHaveLength(2);
    expect(before).toBe(after);
  });

  it('records triggerKind field', () => {
    recordComboEvent(makeEvent({ triggerKind: 'craftedNullstone' }));
    expect(getRecentComboEvents()[0].triggerKind).toBe('craftedNullstone');
  });

  it('triggerKind is optional (undefined allowed)', () => {
    const ev = makeEvent();
    delete ev.triggerKind;
    recordComboEvent(ev);
    expect(getRecentComboEvents()[0].triggerKind).toBeUndefined();
  });
});
