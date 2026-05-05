/**
 * rpg-equip-wiring.ts — Plug wiring system for the RPG stats panel.
 *
 * Manages drag-to-connect wires between plug elements in the stats panel:
 *   - Box 1: weapon source output plugs (weaponSourceOut)
 *   - Box 2: XP output plug (xpOut)
 *   - Boxes 3–5: modifier XP input (modifierXpIn) and output (modifierOut) plugs
 *   - Boxes 7–11: WEAP column inputs (weaponSlotIn) and stat inputs (statIn)
 *
 * Wires are drawn as SVG lines overlaid on the stats panel. Drag behaviour
 * uses pointer events on the panel element for pointer capture.
 *
 * Allowed connection types:
 *   weaponSourceOut → weaponSlotIn
 *   xpOut           → modifierXpIn
 *   modifierOut     → statIn
 */

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
function isCompatible(fromType: PlugType, toType: PlugType): boolean {
  if (fromType === 'weaponSourceOut' && toType === 'weaponSlotIn') return true;
  if (fromType === 'xpOut'           && toType === 'modifierXpIn') return true;
  if (fromType === 'modifierOut'     && toType === 'statIn')       return true;
  return false;
}

/** Returns true when `type` is an output (drag source). */
function isOutputPlug(type: PlugType): boolean {
  return type === 'weaponSourceOut' || type === 'xpOut' || type === 'modifierOut';
}

/** Max outgoing connections for an output plug type (Infinity = unlimited). */
function maxOutgoing(type: PlugType): number {
  if (type === 'weaponSourceOut') return 1;
  if (type === 'xpOut')           return 1;
  if (type === 'modifierOut')     return 1;
  return Infinity;
}

/** Max incoming connections for an input plug type (Infinity = unlimited). */
function maxIncoming(type: PlugType): number {
  if (type === 'weaponSlotIn')  return 1;
  if (type === 'modifierXpIn')  return 1;
  if (type === 'statIn')        return Infinity;
  return 1;
}

// ── Wire colours ──────────────────────────────────────────────────────────────

function wireColor(fromType: PlugType): string {
  if (fromType === 'weaponSourceOut') return 'rgba(255, 200, 150, 0.7)';
  if (fromType === 'xpOut')           return 'rgba(167, 139, 250, 0.7)';
  if (fromType === 'modifierOut')     return 'rgba(100, 220, 150, 0.7)';
  return 'rgba(255, 255, 255, 0.5)';
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
  wiringState: EquipWiringState;
  onWireConnect(from: string, to: string): void;
  onWireDisconnect(from: string, to: string): void;
}

export interface EquipWiringHandle {
  registerPlug(plugId: string, type: PlugType, el: HTMLElement): void;
  unregisterPlug(plugId: string): void;
  setPlugLocked(plugId: string, locked: boolean): void;
  update(): void;
}

// ── Internal plug record ──────────────────────────────────────────────────────

interface PlugRecord {
  plugId: string;
  type: PlugType;
  el: HTMLElement;
  locked: boolean;
}

// ── System factory ────────────────────────────────────────────────────────────

export function createEquipWiringSystem(ctx: EquipWiringCtx): EquipWiringHandle {
  const { panelEl, wiringState } = ctx;

  // ── Plug registry ─────────────────────────────────────────────────
  const plugs = new Map<string, PlugRecord>();

  // ── SVG overlay ───────────────────────────────────────────────────
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.className.baseVal = 'rpg-equip-wire-svg';
  panelEl.appendChild(svg);

  // Group for committed wire lines
  const wireGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  svg.appendChild(wireGroup);

  // Single element for the drag-preview line
  const dragPreviewLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  dragPreviewLine.className.baseVal = 'rpg-equip-wire-drag-preview';
  dragPreviewLine.style.display = 'none';
  svg.appendChild(dragPreviewLine);

  // ── Drag state ────────────────────────────────────────────────────
  interface DragState {
    fromPlugId: string;
    fromType: PlugType;
    /** Plug that was disconnected to start this drag (if any). */
    disconnectedFrom: string | null;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  }
  let drag: DragState | null = null;

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

  /** Remove all connections involving a plug ID and fire callbacks. */
  function disconnectPlug(plugId: string): void {
    const toRemove = wiringState.connections.filter(
      c => c.fromPlugId === plugId || c.toPlugId === plugId,
    );
    for (const conn of toRemove) {
      const idx = wiringState.connections.indexOf(conn);
      if (idx !== -1) wiringState.connections.splice(idx, 1);
      ctx.onWireDisconnect(conn.fromPlugId, conn.toPlugId);
    }
  }

  /** Remove a specific connection and fire callback. */
  function disconnectPair(fromId: string, toId: string): void {
    const idx = wiringState.connections.findIndex(
      c => c.fromPlugId === fromId && c.toPlugId === toId,
    );
    if (idx !== -1) {
      wiringState.connections.splice(idx, 1);
      ctx.onWireDisconnect(fromId, toId);
    }
  }

  // ── Wire rendering ────────────────────────────────────────────────

  function redrawWires(): void {
    wireGroup.textContent = '';
    for (const conn of wiringState.connections) {
      const fromRecord = plugs.get(conn.fromPlugId);
      const toRecord   = plugs.get(conn.toPlugId);
      if (!fromRecord || !toRecord) continue;

      const from = plugCenter(fromRecord.el);
      const to   = plugCenter(toRecord.el);
      const color = wireColor(fromRecord.type);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.className.baseVal = 'rpg-equip-wire-line';
      line.setAttribute('x1', String(from.x));
      line.setAttribute('y1', String(from.y));
      line.setAttribute('x2', String(to.x));
      line.setAttribute('y2', String(to.y));
      line.setAttribute('stroke', color);
      wireGroup.appendChild(line);
    }
  }

  function updateDragPreview(): void {
    if (!drag) {
      dragPreviewLine.style.display = 'none';
      return;
    }
    const fromRecord = plugs.get(drag.fromPlugId);
    if (!fromRecord) {
      dragPreviewLine.style.display = 'none';
      return;
    }
    const from = plugCenter(fromRecord.el);
    const color = wireColor(drag.fromType);

    dragPreviewLine.style.display = '';
    dragPreviewLine.setAttribute('x1', String(from.x));
    dragPreviewLine.setAttribute('y1', String(from.y));
    dragPreviewLine.setAttribute('x2', String(drag.currentX));
    dragPreviewLine.setAttribute('y2', String(drag.currentY));
    dragPreviewLine.setAttribute('stroke', color);
  }

  // ── Valid target highlighting ─────────────────────────────────────

  function setValidTargetHighlights(fromType: PlugType | null): void {
    for (const record of plugs.values()) {
      if (fromType !== null && isCompatible(fromType, record.type) && !record.locked) {
        // statIn accepts unlimited connections — always highlight
        // other input types only highlight when they have room
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

  // ── Pointer event handlers ────────────────────────────────────────

  function toLocalCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = panelEl.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function findPlugUnderPointer(clientX: number, clientY: number): PlugRecord | null {
    for (const record of plugs.values()) {
      const rect = record.el.getBoundingClientRect();
      if (
        clientX >= rect.left && clientX <= rect.right &&
        clientY >= rect.top  && clientY <= rect.bottom
      ) {
        return record;
      }
    }
    return null;
  }

  panelEl.addEventListener('pointerdown', (e: PointerEvent) => {
    const target = findPlugUnderPointer(e.clientX, e.clientY);
    if (!target) return;
    if (!isOutputPlug(target.type)) return;
    if (target.locked) return;

    e.preventDefault();
    panelEl.setPointerCapture(e.pointerId);

    const local = toLocalCoords(e.clientX, e.clientY);
    let disconnectedFrom: string | null = null;

    // If already at max connections, disconnect first then start fresh drag
    if (outgoingCount(target.plugId) >= maxOutgoing(target.type)) {
      // Find the first existing connection and disconnect it
      const existing = wiringState.connections.find(c => c.fromPlugId === target.plugId);
      if (existing) {
        disconnectedFrom = existing.toPlugId;
        disconnectPair(target.plugId, existing.toPlugId);
        redrawWires();
      }
    }

    drag = {
      fromPlugId: target.plugId,
      fromType: target.type,
      disconnectedFrom,
      startX: local.x,
      startY: local.y,
      currentX: local.x,
      currentY: local.y,
    };

    setValidTargetHighlights(target.type);
    updateDragPreview();
  });

  panelEl.addEventListener('pointermove', (e: PointerEvent) => {
    if (!drag) return;
    const local = toLocalCoords(e.clientX, e.clientY);
    drag.currentX = local.x;
    drag.currentY = local.y;
    updateDragPreview();
  });

  panelEl.addEventListener('pointerup', (e: PointerEvent) => {
    if (!drag) return;

    const dropTarget = findPlugUnderPointer(e.clientX, e.clientY);

    if (dropTarget &&
        isCompatible(drag.fromType, dropTarget.type) &&
        !dropTarget.locked &&
        (dropTarget.type === 'statIn' || incomingCount(dropTarget.plugId) < maxIncoming(dropTarget.type))
    ) {
      // Successful connection
      wiringState.connections.push({ fromPlugId: drag.fromPlugId, toPlugId: dropTarget.plugId });
      ctx.onWireConnect(drag.fromPlugId, dropTarget.plugId);
    }

    drag = null;
    dragPreviewLine.style.display = 'none';
    setValidTargetHighlights(null);
    redrawWires();

    if (panelEl.hasPointerCapture(e.pointerId)) {
      panelEl.releasePointerCapture(e.pointerId);
    }
  });

  panelEl.addEventListener('pointercancel', (e: PointerEvent) => {
    if (!drag) return;
    drag = null;
    dragPreviewLine.style.display = 'none';
    setValidTargetHighlights(null);
    redrawWires();
    if (panelEl.hasPointerCapture(e.pointerId)) {
      panelEl.releasePointerCapture(e.pointerId);
    }
  });

  // ── Handle implementation ─────────────────────────────────────────

  function registerPlug(plugId: string, type: PlugType, el: HTMLElement): void {
    plugs.set(plugId, { plugId, type, el, locked: false });
  }

  function unregisterPlug(plugId: string): void {
    disconnectPlug(plugId);
    plugs.delete(plugId);
    redrawWires();
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

  function update(): void {
    redrawWires();
  }

  return { registerPlug, unregisterPlug, setPlugLocked, update };
}
