/**
 * rpg-equip-wiring.ts — Plug wiring system for the RPG stats panel.
 *
 * Manages drag-to-connect wires between plug elements in the stats panel:
 *   - Box 1: weapon source output plugs (weaponSourceOut)
 *   - Box 2: XP output plug (xpOut)
 *   - Boxes 3–5: modifier XP input (modifierXpIn) and output (modifierOut) plugs
 *   - Boxes 7–11: WEAP column inputs (weaponSlotIn) and stat inputs (statIn)
 *
 * Wires are rendered as Verlet-rope soft-body polylines via SoftWireRenderer.
 * Drag behaviour uses pointer events on the panel element for pointer capture.
 *
 * Allowed connection types:
 *   weaponSourceOut → weaponSlotIn
 *   xpOut           → modifierXpIn
 *   modifierOut     → statIn
 *
 * Types and pure helpers live in rpg-equip-wiring-types.ts.
 */

import { createSoftWireRenderer } from './rpg-soft-wire';
import type { SoftWireData } from './rpg-soft-wire';
import type {
  PlugType, EquipWiringCtx, EquipWiringHandle, PlugRecord, WireEntry,
} from './rpg-equip-wiring-types';
import {
  isCompatible, isOutputPlug, maxOutgoing, maxIncoming,
  wireColor, wireDstColor, createEquipWiringState,
} from './rpg-equip-wiring-types';

export type {
  PlugType,
  EquipWireConnection,
  EquipWiringState,
  EquipWiringCtx,
  EquipWiringHandle,
} from './rpg-equip-wiring-types';
export { createEquipWiringState } from './rpg-equip-wiring-types';

// ── System factory ────────────────────────────────────────────────────────────

export function createEquipWiringSystem(ctx: EquipWiringCtx): EquipWiringHandle {
  const { panelEl } = ctx;

  // Internal wiring state (ephemeral — not persisted)
  const wiringState = createEquipWiringState();

  // ── Plug registry ─────────────────────────────────────────────────
  const plugs = new Map<string, PlugRecord>();

  // ── Soft-wire renderer ────────────────────────────────────────────
  const softRenderer = createSoftWireRenderer(panelEl);
  panelEl.appendChild(softRenderer.svgEl);

  // ── Wire tracking ─────────────────────────────────────────────────
  // Active (locked) wires keyed by "fromPlugId|toPlugId"
  const wireEntries = new Map<string, WireEntry>();
  // Wires that have been disconnected and are retracting toward their source
  const slurpingEntries: Array<{ wire: SoftWireData; fromPlugId: string }> = [];

  function wireKey(fromId: string, toId: string): string {
    return fromId + '|' + toId;
  }

  // ── Drag state ────────────────────────────────────────────────────
  interface DragState {
    fromPlugId:       string;
    fromType:         PlugType;
    /** Plug that was disconnected to start this drag (if any). */
    disconnectedFrom: string | null;
    startX:   number;
    startY:   number;
    currentX: number;
    currentY: number;
  }
  let drag: DragState | null = null;

  // ── Per-frame timing ──────────────────────────────────────────────
  let lastUpdateMs = 0;

  // ── Utility helpers ───────────────────────────────────────────────

  /** Returns the centre of an element in panel-local coordinates. */
  function plugCenter(el: HTMLElement): { x: number; y: number } {
    const panelRect = panelEl.getBoundingClientRect();
    const plugRect  = el.getBoundingClientRect();
    return {
      x: plugRect.left + plugRect.width  / 2 - panelRect.left,
      y: plugRect.top  + plugRect.height / 2 - panelRect.top,
    };
  }

  /** Count outgoing connections from a plug. */
  function outgoingCount(plugId: string): number {
    return wiringState.connections.filter(c => c.fromPlugId === plugId).length;
  }

  /** Count incoming connections to a plug. */
  function incomingCount(plugId: string): number {
    return wiringState.connections.filter(c => c.toPlugId === plugId).length;
  }

  /** Trigger slurp on the visual wire for a connection (does NOT remove from wiringState). */
  function triggerSlurp(fromId: string, toId: string): void {
    const key = wireKey(fromId, toId);
    const entry = wireEntries.get(key);
    if (entry) {
      wireEntries.delete(key);
      entry.wire.isSlurping = true;
      entry.wire.slurpMs = 0;
      slurpingEntries.push({ wire: entry.wire, fromPlugId: fromId });
    }
  }

  /** Remove all connections involving a plug ID, fire callbacks, and trigger slurps. */
  function disconnectPlug(plugId: string): void {
    const toRemove = wiringState.connections.filter(
      c => c.fromPlugId === plugId || c.toPlugId === plugId,
    );
    for (const conn of toRemove) {
      const idx = wiringState.connections.indexOf(conn);
      if (idx !== -1) wiringState.connections.splice(idx, 1);
      ctx.onWireDisconnect(conn.fromPlugId, conn.toPlugId);
      triggerSlurp(conn.fromPlugId, conn.toPlugId);
    }
  }

  /** Remove a specific connection, fire callback, and trigger slurp. */
  function disconnectPair(fromId: string, toId: string): void {
    const idx = wiringState.connections.findIndex(
      c => c.fromPlugId === fromId && c.toPlugId === toId,
    );
    if (idx !== -1) {
      wiringState.connections.splice(idx, 1);
      ctx.onWireDisconnect(fromId, toId);
      triggerSlurp(fromId, toId);
    }
  }

  // ── Valid target highlighting ─────────────────────────────────────

  function setValidTargetHighlights(fromType: PlugType | null): void {
    for (const record of plugs.values()) {
      if (fromType !== null && isCompatible(fromType, record.type) && !record.locked) {
        // statIn accepts unlimited connections; other input types need a free slot
        const hasRoom = record.type === 'statIn' || incomingCount(record.plugId) < maxIncoming(record.type);
        if (hasRoom) {
          record.el.classList.add('rpg-plug--valid-target');
        } else {
          record.el.classList.remove('rpg-plug--valid-target');
        }
      } else {
        record.el.classList.remove('rpg-plug--valid-target');
      }
    }
  }

  // ── Tip handle listeners ──────────────────────────────────────────

  /**
   * Attach pointer listeners to a wire's tip handle so the user can drag the
   * tip to reconnect the wire to a different target plug.
   */
  function attachTipHandleListeners(
    wire: SoftWireData,
    fromPlugId: string,
    toPlugId: string,
  ): void {
    wire.tipHandle.addEventListener('pointerdown', (e: PointerEvent) => {
      if (drag !== null) return; // another drag already in progress
      e.stopPropagation();

      const fromRecord = plugs.get(fromPlugId);
      if (!fromRecord) return;

      // Disconnect the current connection and start a fresh drag from the same source
      disconnectPair(fromPlugId, toPlugId);

      panelEl.setPointerCapture(e.pointerId);

      const local = toLocalCoords(e.clientX, e.clientY);
      drag = {
        fromPlugId,
        fromType:         fromRecord.type,
        disconnectedFrom: toPlugId,
        startX:   local.x,
        startY:   local.y,
        currentX: local.x,
        currentY: local.y,
      };

      const from = plugCenter(fromRecord.el);
      softRenderer.setDragPreview(from.x, from.y, local.x, local.y, wireColor(fromRecord.type));
      setValidTargetHighlights(fromRecord.type);
    });
    // pointermove / pointerup / pointercancel are handled by panelEl listeners
  }

  // ── Pointer event handlers ────────────────────────────────────────

  function toLocalCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = panelEl.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  /**
   * Finds the best compatible input-plug drop target at (clientX, clientY)
   * for a cable being dragged from `fromType`.
   *
   * Three-pass strategy (priority order):
   *   1. Exact input-plug element bounds
   *   2. Extended drop-hit zones (dropHitEl) — for mobile-friendly large targets
   */
  function findCompatibleDropTarget(
    clientX: number,
    clientY: number,
    fromType: PlugType,
  ): PlugRecord | null {
    // Pass 1: exact plug element bounds (any compatible input plug)
    for (const record of plugs.values()) {
      if (!isCompatible(fromType, record.type)) continue;
      if (record.locked) continue;
      const hasRoom = record.type === 'statIn' || incomingCount(record.plugId) < maxIncoming(record.type);
      if (!hasRoom) continue;
      const rect = record.el.getBoundingClientRect();
      if (
        clientX >= rect.left && clientX <= rect.right &&
        clientY >= rect.top  && clientY <= rect.bottom
      ) {
        return record;
      }
    }
    // Pass 2: extended drop-hit zones (compatible input plugs with a dropHitEl)
    for (const record of plugs.values()) {
      if (!record.dropHitEl) continue;
      if (!isCompatible(fromType, record.type)) continue;
      if (record.locked) continue;
      const hasRoom = record.type === 'statIn' || incomingCount(record.plugId) < maxIncoming(record.type);
      if (!hasRoom) continue;
      const hitRect = record.dropHitEl.getBoundingClientRect();
      if (
        clientX >= hitRect.left && clientX <= hitRect.right &&
        clientY >= hitRect.top  && clientY <= hitRect.bottom
      ) {
        return record;
      }
    }
    return null;
  }

  /**
   * Like findPlugUnderPointer, but only returns output plugs and also checks
   * extended hit elements (hitEl).  Used during pointerdown so that clicking
   * anywhere inside a larger box (e.g. the full XP node row or a multiplier
   * box) starts a cable drag from the output plug visually anchored to that box.
   *
   * Two-pass strategy:
   *   1. Exact element bounds — output plugs only (fast path, no false positives)
   *   2. Extended hit elements — output plugs only (expanded touch targets)
   */
  function findOutputPlugUnderPointer(clientX: number, clientY: number): PlugRecord | null {
    // Pass 1: exact plug element bounds
    for (const record of plugs.values()) {
      if (!isOutputPlug(record.type)) continue;
      const rect = record.el.getBoundingClientRect();
      if (
        clientX >= rect.left && clientX <= rect.right &&
        clientY >= rect.top  && clientY <= rect.bottom
      ) {
        return record;
      }
    }
    // Pass 2: extended hit areas (output plugs only)
    for (const record of plugs.values()) {
      if (!record.hitEl || !isOutputPlug(record.type)) continue;
      const hitRect = record.hitEl.getBoundingClientRect();
      if (
        clientX >= hitRect.left && clientX <= hitRect.right &&
        clientY >= hitRect.top  && clientY <= hitRect.bottom
      ) {
        return record;
      }
    }
    return null;
  }

  panelEl.addEventListener('pointerdown', (e: PointerEvent) => {
    const target = findOutputPlugUnderPointer(e.clientX, e.clientY);
    if (!target) return;
    if (target.locked) return;

    e.preventDefault();
    panelEl.setPointerCapture(e.pointerId);

    const local = toLocalCoords(e.clientX, e.clientY);
    let disconnectedFrom: string | null = null;

    // If already at max connections, disconnect the oldest and start a fresh drag.
    if (outgoingCount(target.plugId) >= maxOutgoing(target.type)) {
      const existing = wiringState.connections.find(c => c.fromPlugId === target.plugId);
      if (existing) {
        disconnectedFrom = existing.toPlugId;
        disconnectPair(target.plugId, existing.toPlugId);
      }
    }

    drag = {
      fromPlugId:       target.plugId,
      fromType:         target.type,
      disconnectedFrom,
      startX:   local.x,
      startY:   local.y,
      currentX: local.x,
      currentY: local.y,
    };

    const from = plugCenter(target.el);
    softRenderer.setDragPreview(from.x, from.y, local.x, local.y, wireColor(target.type));
    setValidTargetHighlights(target.type);
  });

  panelEl.addEventListener('pointermove', (e: PointerEvent) => {
    if (!drag) return;
    const local = toLocalCoords(e.clientX, e.clientY);
    drag.currentX = local.x;
    drag.currentY = local.y;
  });

  panelEl.addEventListener('pointerup', (e: PointerEvent) => {
    if (!drag) return;

    // Use findCompatibleDropTarget which checks exact plug bounds first, then
    // expanded drop-hit zones, for mobile-friendly connections.
    const dropTarget = findCompatibleDropTarget(e.clientX, e.clientY, drag.fromType);

    if (dropTarget) {
      const key = wireKey(drag.fromPlugId, dropTarget.plugId);
      const srcColor = wireColor(drag.fromType);
      const dstColor = wireDstColor(dropTarget.type);
      const wire = softRenderer.createWire(srcColor, dstColor);
      attachTipHandleListeners(wire, drag.fromPlugId, dropTarget.plugId);
      wireEntries.set(key, { wire, fromPlugId: drag.fromPlugId, toPlugId: dropTarget.plugId });
      wiringState.connections.push({ fromPlugId: drag.fromPlugId, toPlugId: dropTarget.plugId });
      ctx.onWireConnect(drag.fromPlugId, dropTarget.plugId);
    }

    drag = null;
    softRenderer.hideDragPreview();
    setValidTargetHighlights(null);

    if (panelEl.hasPointerCapture(e.pointerId)) {
      panelEl.releasePointerCapture(e.pointerId);
    }
  });

  panelEl.addEventListener('pointercancel', (e: PointerEvent) => {
    if (!drag) return;
    drag = null;
    softRenderer.hideDragPreview();
    setValidTargetHighlights(null);
    if (panelEl.hasPointerCapture(e.pointerId)) {
      panelEl.releasePointerCapture(e.pointerId);
    }
  });

  // ── Handle implementation ─────────────────────────────────────────

  function registerPlug(plugId: string, type: PlugType, el: HTMLElement): void {
    plugs.set(plugId, { plugId, type, el, hitEl: null, dropHitEl: null, locked: false });
  }

  function unregisterPlug(plugId: string): void {
    disconnectPlug(plugId);
    plugs.delete(plugId);
  }

  function setPlugLocked(plugId: string, locked: boolean): void {
    const record = plugs.get(plugId);
    if (!record) return;
    record.locked = locked;
    if (locked) {
      record.el.classList.add('rpg-plug--locked');
    } else {
      record.el.classList.remove('rpg-plug--locked');
    }
  }

  function setPlugHitElement(plugId: string, hitEl: HTMLElement | null): void {
    const record = plugs.get(plugId);
    if (!record) return;
    record.hitEl = hitEl;
  }

  function setPlugDropHitElement(plugId: string, dropHitEl: HTMLElement | null): void {
    const record = plugs.get(plugId);
    if (!record) return;
    record.dropHitEl = dropHitEl;
  }

  function update(nowMs: number): void {
    // Cap at 100ms to prevent physics instability after tab switches or long pauses;
    // default to ~16ms (one frame at 60 fps) on the very first update.
    const deltaMs = lastUpdateMs > 0 ? Math.min(nowMs - lastUpdateMs, 100) : 16;
    lastUpdateMs = nowMs;

    softRenderer.setViewBox(panelEl.clientWidth, panelEl.clientHeight);

    // Advance drag-preview rope physics while dragging
    if (drag) {
      const fromRecord = plugs.get(drag.fromPlugId);
      if (fromRecord) {
        const from = plugCenter(fromRecord.el);
        softRenderer.updateDragPreviewPhysics(from.x, from.y, drag.currentX, drag.currentY);
      }
    }

    // Update all active (connected) wires
    for (const entry of wireEntries.values()) {
      const fromRecord = plugs.get(entry.fromPlugId);
      const toRecord   = plugs.get(entry.toPlugId);
      if (!fromRecord || !toRecord) continue;
      const from = plugCenter(fromRecord.el);
      const to   = plugCenter(toRecord.el);
      softRenderer.updateLockedWire(entry.wire, from.x, from.y, to.x, to.y, deltaMs);
    }

    // Update slurping (retracting) wires
    for (let i = slurpingEntries.length - 1; i >= 0; i--) {
      const { wire, fromPlugId } = slurpingEntries[i];
      const fromRecord = plugs.get(fromPlugId);
      let ax: number, ay: number;
      if (fromRecord) {
        const from = plugCenter(fromRecord.el);
        ax = from.x; ay = from.y;
      } else {
        // Source plug was unregistered during slurp — retract toward last known node position.
        const lastNode = wire.nodes[0];
        ax = lastNode ? lastNode.x : 0;
        ay = lastNode ? lastNode.y : 0;
      }
      const done = softRenderer.updateSlurpingWire(wire, ax, ay, deltaMs);
      if (done) {
        softRenderer.finalizeWireRemoval(wire);
        slurpingEntries.splice(i, 1);
      }
    }
  }

  return { registerPlug, unregisterPlug, setPlugLocked, setPlugHitElement, setPlugDropHitElement, update };
}
