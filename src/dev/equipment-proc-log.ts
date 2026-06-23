/**
 * equipment-proc-log.ts — Ring-buffer for recent lens/weave proc events.
 *
 * Safe in production: all recording calls are cheap (push + conditional shift).
 * Never persisted. Purely for real-time observation in the debug overlay.
 */

const MAX_PROC_EVENTS = 20;

export type EquipmentProcKind =
  | 'lens_status'      // T1 status applied to enemy
  | 'lens_t2_proc'     // T2 cascade triggered
  | 'lens_t3_proc'     // T3 chain triggered
  | 'weave_proc'       // weave proc effect triggered
  | 'weave_buff_start' // weave buff began
  | 'weave_buff_expire'; // weave buff expired

export interface EquipmentProcEvent {
  /** performance.now() timestamp when the event occurred. */
  timeMs: number;
  kind: EquipmentProcKind;
  /** Display name of the source item or effect. */
  sourceName: string;
  /** Enemy type/id that was targeted, if available. */
  targetType?: string;
  /** Short summary of what happened (e.g. "Burning x18.0", "-4.5% cooldown 2.0s"). */
  summary: string;
}

const _procEvents: EquipmentProcEvent[] = [];

export function recordEquipmentProcEvent(e: EquipmentProcEvent): void {
  _procEvents.push(e);
  if (_procEvents.length > MAX_PROC_EVENTS) _procEvents.shift();
}

/** Returns a read-only view of recent events, newest last. */
export function getRecentEquipmentProcEvents(): readonly EquipmentProcEvent[] {
  return _procEvents;
}

export function clearEquipmentProcLog(): void {
  _procEvents.length = 0;
}
