/**
 * rpg-equip-wiring-types.ts — Type definitions and pure helpers for the
 * RPG plug wiring system.
 *
 * Contains:
 *   - PlugType union and connection-compatibility helpers
 *   - Wire colour helpers
 *   - EquipWireConnection / EquipWiringState data model
 *   - EquipWiringCtx / EquipWiringHandle public interfaces
 *   - Internal PlugRecord / WireEntry types
 *
 * All helpers are pure functions — no DOM access.
 * Used by rpg-equip-wiring.ts (factory implementation).
 */

import type { SoftWireData } from './rpg-soft-wire';

// ── Plug types ────────────────────────────────────────────────────────────────

export type PlugType =
  | 'weaponSourceOut'
  | 'weaponSlotIn'
  | 'xpOut'
  | 'modifierXpIn'
  | 'modifierOut'
  | 'statIn';

// ── Connection compatibility ──────────────────────────────────────────────────

/** Returns true when fromType → toType is a valid directed connection. */
export function isCompatible(fromType: PlugType, toType: PlugType): boolean {
  if (fromType === 'weaponSourceOut' && toType === 'weaponSlotIn') return true;
  if (fromType === 'xpOut'           && toType === 'modifierXpIn') return true;
  if (fromType === 'modifierOut'     && toType === 'statIn')       return true;
  return false;
}

/** Returns true when `type` is an output (drag source). */
export function isOutputPlug(type: PlugType): boolean {
  return type === 'weaponSourceOut' || type === 'xpOut' || type === 'modifierOut';
}

/** Max outgoing connections for an output plug type (Infinity = unlimited). */
export function maxOutgoing(type: PlugType): number {
  if (type === 'weaponSourceOut') return 1;
  if (type === 'xpOut')           return 1;
  if (type === 'modifierOut')     return 1;
  return Infinity;
}

/** Max incoming connections for an input plug type (Infinity = unlimited). */
export function maxIncoming(type: PlugType): number {
  if (type === 'weaponSlotIn')  return 1;
  if (type === 'modifierXpIn')  return 1;
  if (type === 'statIn')        return Infinity;
  return 1;
}

// ── Wire colours ──────────────────────────────────────────────────────────────

/** Source colour for a given output plug type. */
export function wireColor(fromType: PlugType): string {
  if (fromType === 'weaponSourceOut') return '#ffc896'; // warm orange
  if (fromType === 'xpOut')           return '#a78bfa'; // purple
  if (fromType === 'modifierOut')     return '#64dc96'; // green
  return '#ffffff';
}

/** Destination colour for a given input plug type. */
export function wireDstColor(toType: PlugType): string {
  if (toType === 'weaponSlotIn')  return '#ffc896'; // warm orange
  if (toType === 'modifierXpIn')  return '#a78bfa'; // purple
  if (toType === 'statIn')        return '#93c5fd'; // light blue-grey
  return '#ffffff';
}

// ── Data model ────────────────────────────────────────────────────────────────

export interface EquipWireConnection {
  fromPlugId: string;
  toPlugId: string;
}

export interface EquipWiringState {
  connections: EquipWireConnection[];
}

export function createEquipWiringState(): EquipWiringState {
  return { connections: [] };
}

// ── Context and handle ────────────────────────────────────────────────────────

export interface EquipWiringCtx {
  panelEl: HTMLElement;
  getMaxWeaponSlots(): number;
  onWireConnect(from: string, to: string): void;
  onWireDisconnect(from: string, to: string): void;
}

export interface EquipWiringHandle {
  registerPlug(plugId: string, type: PlugType, el: HTMLElement): void;
  unregisterPlug(plugId: string): void;
  setPlugLocked(plugId: string, locked: boolean): void;
  /**
   * Set an extended hit element for an output plug so the player can start
   * dragging from anywhere inside `hitEl`, not just the small plug circle.
   * Pass `null` to remove the extended hit area.
   */
  setPlugHitElement(plugId: string, hitEl: HTMLElement | null): void;
  /**
   * Set an extended drop zone for an input plug so that releasing a cable
   * anywhere inside `dropHitEl` connects to this plug, not just on the small
   * plug circle itself.  Used for mobile-friendly drop targets.
   * Pass `null` to remove the drop zone.
   */
  setPlugDropHitElement(plugId: string, dropHitEl: HTMLElement | null): void;
  /** Call once per frame; advances rope physics and re-renders all wires. */
  update(nowMs: number): void;
}

// ── Internal types (used only by rpg-equip-wiring.ts) ────────────────────────

export interface PlugRecord {
  plugId: string;
  type: PlugType;
  el: HTMLElement;
  /** Optional extended hit area for drag-start detection (output plugs only). */
  hitEl: HTMLElement | null;
  /** Optional extended drop zone for drag-end detection (input plugs). */
  dropHitEl: HTMLElement | null;
  locked: boolean;
}

export interface WireEntry {
  wire:       SoftWireData;
  fromPlugId: string;
  toPlugId:   string;
}
