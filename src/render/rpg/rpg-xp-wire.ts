/**
 * rpg-xp-wire.ts — XP wire interaction system for the RPG stats panel.
 *
 * Manages the Verlet-rope wires that connect the XP node to stat sockets
 * (ATK / DEF / LUCK / MAXHP), including:
 *   - SVG overlay, plug socket circles, and wire polylines
 *   - Rope physics (Verlet integration with constraint solving)
 *   - Drag-to-connect (from XP node) and drag-tip-to-reconnect gestures
 *   - Tap-to-slurp-all shortcut
 *   - Slurp (retract) animation when a wire is disconnected
 *   - Colour bleed transition (wire gradually blends to stat colour)
 *   - Error feedback animation on invalid gestures
 *
 * Extracted from rpg-stats-panel.ts so that file stays under ~700 lines.
 *
 * Usage:
 *   const xpWire = createXpWireSystem(ctx);
 *   // Call once per frame from the stats-panel update function:
 *   xpWire.update(performance.now());
 */

// ── Wire constants ────────────────────────────────────────────────────────────

export const STAT_WIRE_COLOR: Record<'atk' | 'def' | 'luck' | 'hp', string> = {
  atk:  '#fca5a5', // light red
  def:  '#93c5fd', // light blue
  luck: '#86efac', // light green
  hp:   '#fde68a', // light yellow
};

const MAX_WIRES              = 3;
const ROPE_N                 = 24;   // nodes per rope (doubled for smoother appearance)
const ROPE_GRAVITY           = 0.35;
const ROPE_DAMPING           = 0.97;
const ROPE_ITERS             = 5;
const ROPE_SLACK             = 1.25;
// Slurp timing: SLURP_MS_PER_LINK ms to consume one link; total = SLURP_MS_PER_LINK * ROPE_N
const SLURP_MS_PER_LINK      = 20;
const SLURP_TOTAL_MS         = SLURP_MS_PER_LINK * ROPE_N;
const SLURP_RATE             = 1 / SLURP_TOTAL_MS; // pre-computed for hot-path division avoidance
const BLEED_RATE             = 0.0015; // colorBleedT advance per ms
const TAP_MOVEMENT_THRESHOLD = 8;     // px — beyond this distinguishes drag from tap

// Valid stat identifiers for wire connections
export type WireStat = 'atk' | 'def' | 'luck' | 'hp';
const WIRE_STATS = new Set<string>(['atk', 'def', 'luck', 'hp']);

// ── Public API ────────────────────────────────────────────────────────────────

/** Context object that rpg-stats-panel.ts provides to createXpWireSystem. */
export interface XpWireCtx {
  /** The stats panel root element (tip handles and the SVG overlay are appended here). */
  panelEl: HTMLElement;
  /** The XP node element — source of wire drags and tap-to-slurp. */
  xpNodeEl: HTMLElement;
  /** Centre anchor elements for each stat (wire endpoints are centred on these). */
  statPlugAnchors: Record<WireStat, HTMLElement>;
  /** Slot elements used for hit-testing where a drag lands. */
  statPlugSlots:   Record<WireStat, HTMLElement>;
  /**
   * Direct reference to the sim-state array so the wire system can sync
   * allocations when wires connect or disconnect.
   */
  rpgSimState: { xpAllocatedStats: string[] };
  /** Called when a wire is newly connected to a stat. */
  onWireConnect(stat: WireStat): void;
  /** Called whenever a wire is removed. */
  onWireDisconnect(): void;
  /** Called when the player attempts an invalid wire action (e.g. too many wires). */
  onError(): void;
}

/** Handle returned by createXpWireSystem. */
export interface XpWireHandle {
  /**
   * Update rope physics, SVG rendering, and the `rpg-xp-node--locked` class.
   * Must be called once per frame from the stats-panel update function.
   */
  update(nowMs: number): void;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createXpWireSystem(ctx: XpWireCtx): XpWireHandle {
  const wireSvgNS = 'http://www.w3.org/2000/svg';

  // ── Wire SVG overlay ──────────────────────────────────────────────────────
  const wireSvg = document.createElementNS(wireSvgNS, 'svg') as SVGSVGElement;
  wireSvg.setAttribute('class', 'rpg-wire-svg');
  wireSvg.setAttribute('aria-hidden', 'true');

  const wireDefs = document.createElementNS(wireSvgNS, 'defs') as SVGDefsElement;
  wireSvg.appendChild(wireDefs);

  // Plug socket circles — one for the XP node and one per stat
  let _plugGradIdSeq = 0;
  function createPlugCircle(color: string): SVGCircleElement {
    const radGradId = `rpg-plug-radgrad-${_plugGradIdSeq++}`;
    const radGrad = document.createElementNS(wireSvgNS, 'radialGradient') as SVGRadialGradientElement;
    radGrad.setAttribute('id', radGradId);
    const rs0 = document.createElementNS(wireSvgNS, 'stop') as SVGStopElement;
    rs0.setAttribute('offset', '0%');
    rs0.setAttribute('stop-color', color);
    rs0.setAttribute('stop-opacity', '0.5');
    const rs1 = document.createElementNS(wireSvgNS, 'stop') as SVGStopElement;
    rs1.setAttribute('offset', '100%');
    rs1.setAttribute('stop-color', color);
    rs1.setAttribute('stop-opacity', '0');
    radGrad.appendChild(rs0);
    radGrad.appendChild(rs1);
    wireDefs.appendChild(radGrad);

    const circle = document.createElementNS(wireSvgNS, 'circle') as SVGCircleElement;
    circle.setAttribute('r', '5');
    circle.setAttribute('fill', `url(#${radGradId})`);
    circle.setAttribute('stroke', color);
    circle.setAttribute('stroke-width', '1.5');
    circle.setAttribute('stroke-opacity', '0.6');
    circle.setAttribute('class', 'rpg-plug-socket');
    wireSvg.appendChild(circle);
    return circle;
  }

  const plugXpCircle   = createPlugCircle('#a78bfa');
  const plugAtkCircle  = createPlugCircle(STAT_WIRE_COLOR.atk);
  const plugDefCircle  = createPlugCircle(STAT_WIRE_COLOR.def);
  const plugLuckCircle = createPlugCircle(STAT_WIRE_COLOR.luck);
  const plugHpCircle   = createPlugCircle(STAT_WIRE_COLOR.hp);

  ctx.panelEl.appendChild(wireSvg);

  // ── Rope physics ──────────────────────────────────────────────────────────
  interface RopeNode { x: number; y: number; px: number; py: number; }

  function initRope(
    nodes: RopeNode[],
    x0: number, y0: number,
    x1: number, y1: number,
  ): number {
    nodes.length = 0;
    for (let i = 0; i < ROPE_N; i++) {
      const t = i / (ROPE_N - 1);
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      nodes.push({ x, y, px: x, py: y });
    }
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return (dist * ROPE_SLACK) / (ROPE_N - 1);
  }

  function updateRope(
    nodes: RopeNode[],
    segLen: number,
    ax: number, ay: number,
    bx: number, by: number,
    count: number = ROPE_N,
  ): void {
    if (nodes.length < count) return;
    // Verlet integrate
    for (let i = 1; i < count - 1; i++) {
      const n = nodes[i];
      const vx = (n.x - n.px) * ROPE_DAMPING;
      const vy = (n.y - n.py) * ROPE_DAMPING;
      n.px = n.x; n.py = n.y;
      n.x += vx;
      n.y += vy + ROPE_GRAVITY;
    }
    // Anchor endpoints
    nodes[0].x = ax; nodes[0].y = ay; nodes[0].px = ax; nodes[0].py = ay;
    nodes[count - 1].x = bx; nodes[count - 1].y = by; nodes[count - 1].px = bx; nodes[count - 1].py = by;
    // Constraint solving
    for (let iter = 0; iter < ROPE_ITERS; iter++) {
      for (let i = 0; i < count - 1; i++) {
        const a = nodes[i], b = nodes[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 0.001) continue;
        const diff = (d - segLen) / d * 0.5;
        const ox = dx * diff, oy = dy * diff;
        if (i > 0)         { a.x += ox;  a.y += oy;  }
        if (i < count - 2) { b.x -= ox;  b.y -= oy;  }
      }
      // Re-anchor after each constraint pass
      nodes[0].x = ax; nodes[0].y = ay;
      nodes[count - 1].x = bx; nodes[count - 1].y = by;
    }
  }

  // ── Per-wire data ─────────────────────────────────────────────────────────
  interface WireData {
    stat: WireStat;
    nodes: RopeNode[];
    segLen: number;
    polyline: SVGPolylineElement;
    gradient: SVGLinearGradientElement;
    gradStop0: SVGStopElement;
    gradStop1: SVGStopElement;
    gradStop2: SVGStopElement;
    tipHandle: HTMLDivElement;
    colorBleedT: number;
    isSlurping: boolean;
    slurpMs: number;
  }

  let _wireGradSeq = 0;

  function createWireData(stat: WireStat): WireData {
    const gradId = `rpg-wire-grad-${_wireGradSeq++}`;
    const gradient = document.createElementNS(wireSvgNS, 'linearGradient') as SVGLinearGradientElement;
    gradient.setAttribute('id', gradId);
    gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
    const gs0 = document.createElementNS(wireSvgNS, 'stop') as SVGStopElement;
    gs0.setAttribute('offset', '0%');
    gs0.setAttribute('stop-color', '#a78bfa');
    const gs1 = document.createElementNS(wireSvgNS, 'stop') as SVGStopElement;
    gs1.setAttribute('offset', '100%');
    gs1.setAttribute('stop-color', '#a78bfa');
    const gs2 = document.createElementNS(wireSvgNS, 'stop') as SVGStopElement;
    gs2.setAttribute('offset', '100%');
    gs2.setAttribute('stop-color', '#a78bfa');
    gradient.appendChild(gs0);
    gradient.appendChild(gs1);
    gradient.appendChild(gs2);
    wireDefs.appendChild(gradient);

    const polyline = document.createElementNS(wireSvgNS, 'polyline') as SVGPolylineElement;
    polyline.setAttribute('class', 'rpg-wire-rope');
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', `url(#${gradId})`);
    polyline.setAttribute('stroke-width', '2');
    polyline.setAttribute('stroke-linecap', 'round');
    polyline.setAttribute('stroke-linejoin', 'round');
    polyline.style.display = 'none';
    wireSvg.appendChild(polyline);

    const tipHandle = document.createElement('div') as HTMLDivElement;
    tipHandle.style.cssText = [
      'position:absolute',
      'width:18px',
      'height:18px',
      'border-radius:50%',
      'transform:translate(-50%,-50%)',
      'pointer-events:auto',
      'cursor:grab',
      'display:none',
      'z-index:6',
      'touch-action:none',
    ].join(';');
    ctx.panelEl.appendChild(tipHandle);

    // Create the WireData object first so event listeners can reference it directly.
    const data: WireData = {
      stat,
      nodes: [],
      segLen: 1,
      polyline,
      gradient,
      gradStop0: gs0,
      gradStop1: gs1,
      gradStop2: gs2,
      tipHandle,
      colorBleedT: 0,
      isSlurping: false,
      slurpMs: 0,
    };

    // Attach tip-drag listeners (close over `data` directly)
    tipHandle.addEventListener('pointerdown', (e: PointerEvent) => {
      if (!lockedWires.includes(data)) return;
      e.stopPropagation();
      if (dragKind !== 'none') return;
      dragKind = 'tip';
      dragSourceWire = data;
      wireDragClientX = e.clientX;
      wireDragClientY = e.clientY;
      tipHandle.setPointerCapture(e.pointerId);
    }, { passive: true });

    tipHandle.addEventListener('pointermove', (e: PointerEvent) => {
      if (dragKind !== 'tip' || dragSourceWire !== data) return;
      wireDragClientX = e.clientX;
      wireDragClientY = e.clientY;
    }, { passive: true });

    tipHandle.addEventListener('pointerup', (e: PointerEvent) => {
      if (dragKind !== 'tip' || dragSourceWire !== data) return;
      const targetStat = landedStat(e.clientX, e.clientY);
      if (targetStat && targetStat !== data.stat && !isStatWired(targetStat)) {
        disconnectWire(data);
        addWireToStat(targetStat);
      } else if (targetStat === data.stat) {
        dragKind = 'none';
        dragSourceWire = null;
      } else {
        data.isSlurping = true;
        data.slurpMs = 0;
        dragKind = 'none';
        dragSourceWire = null;
      }
    }, { passive: true });

    tipHandle.addEventListener('pointercancel', () => {
      if (dragKind === 'tip' && dragSourceWire === data) {
        data.isSlurping = true;
        data.slurpMs = 0;
        dragKind = 'none';
        dragSourceWire = null;
      }
    }, { passive: true });

    return data;
  }

  // Active locked wires (up to MAX_WIRES)
  const lockedWires: WireData[] = [];

  // Drag state (new wire from XP node, or re-dragging a tip)
  type DragKind = 'none' | 'new' | 'tip';
  let dragKind: DragKind = 'none';
  let dragSourceWire: WireData | null = null; // set when dragKind === 'tip'
  let wireDragClientX = 0, wireDragClientY = 0;
  // Drag rope (shared — only one drag at a time)
  const dragNodes: RopeNode[] = [];
  let dragSegLen = 1;
  const dragPolylineSvg = document.createElementNS(wireSvgNS, 'polyline') as SVGPolylineElement;
  dragPolylineSvg.setAttribute('class', 'rpg-wire-rope');
  dragPolylineSvg.setAttribute('fill', 'none');
  dragPolylineSvg.setAttribute('stroke', '#a78bfa');
  dragPolylineSvg.setAttribute('stroke-width', '2');
  dragPolylineSvg.setAttribute('stroke-linecap', 'round');
  dragPolylineSvg.setAttribute('stroke-linejoin', 'round');
  dragPolylineSvg.style.display = 'none';
  wireSvg.appendChild(dragPolylineSvg);

  let lastFrameTime = 0;

  // ── Wire management helpers ───────────────────────────────────────────────
  function isStatWired(stat: WireStat): boolean {
    return lockedWires.some(w => w.stat === stat && !w.isSlurping);
  }

  function disconnectWire(wire: WireData): void {
    wire.isSlurping = true;
    wire.slurpMs = 0;
    dragKind = 'none';
    dragSourceWire = null;
    const idx = ctx.rpgSimState.xpAllocatedStats.indexOf(wire.stat);
    if (idx !== -1) {
      ctx.rpgSimState.xpAllocatedStats.splice(idx, 1);
      ctx.onWireDisconnect();
    }
  }

  function finalizeWireRemoval(wire: WireData): void {
    const idx = lockedWires.indexOf(wire);
    if (idx !== -1) lockedWires.splice(idx, 1);
    wire.polyline.remove();
    wire.gradient.remove();
    wire.tipHandle.remove();
  }

  function addWireToStat(stat: WireStat): WireData {
    const wire = createWireData(stat);
    lockedWires.push(wire);
    const xpC   = elementCentreInPanel(ctx.xpNodeEl);
    const statC = elementCentreInPanel(ctx.statPlugAnchors[stat]);
    wire.segLen = initRope(wire.nodes, xpC.x, xpC.y, statC.x, statC.y);
    wire.colorBleedT = 0;
    ctx.rpgSimState.xpAllocatedStats.push(stat);
    ctx.onWireConnect(stat);
    dragKind = 'none';
    dragSourceWire = null;
    return wire;
  }

  // ── Restore wires from saved state ───────────────────────────────────────
  for (const stat of ctx.rpgSimState.xpAllocatedStats) {
    if (!WIRE_STATS.has(stat)) continue;
    const wire = createWireData(stat as WireStat);
    wire.colorBleedT = 0.5; // already blended
    lockedWires.push(wire);
    // Rope is initialised on the first updateWireVisual call once DOM is laid out
  }

  // ── Coordinate helpers ────────────────────────────────────────────────────
  function toPanelCoords(clientX: number, clientY: number): { x: number; y: number } {
    const r = ctx.panelEl.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  function elementCentreInPanel(el: HTMLElement): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    const p = ctx.panelEl.getBoundingClientRect();
    return { x: r.left + r.width / 2 - p.left, y: r.top + r.height / 2 - p.top };
  }

  function pointerOverElement(el: HTMLElement, clientX: number, clientY: number): boolean {
    const r = el.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }

  function landedStat(clientX: number, clientY: number): WireStat | null {
    if (pointerOverElement(ctx.statPlugSlots.atk,  clientX, clientY)) return 'atk';
    if (pointerOverElement(ctx.statPlugSlots.def,  clientX, clientY)) return 'def';
    if (pointerOverElement(ctx.statPlugSlots.luck, clientX, clientY)) return 'luck';
    if (pointerOverElement(ctx.statPlugSlots.hp,   clientX, clientY)) return 'hp';
    return null;
  }

  // ── XP node events ────────────────────────────────────────────────────────
  // xpPointerIsDown guards the pointermove handler so hovering without clicking
  // cannot accidentally start a wire drag.
  let xpPointerIsDown = false;
  let xpTapStartX = 0, xpTapStartY = 0, xpTapMoved = false;

  ctx.xpNodeEl.addEventListener('pointerdown', (e: PointerEvent) => {
    e.stopPropagation();
    xpPointerIsDown = true;
    if (dragKind !== 'none') return;
    const activeWireCount = lockedWires.filter(w => !w.isSlurping).length;
    if (activeWireCount >= MAX_WIRES) {
      xpTapStartX = e.clientX; xpTapStartY = e.clientY; xpTapMoved = false;
      ctx.xpNodeEl.setPointerCapture(e.pointerId);
      return;
    }
    if (activeWireCount > 0) {
      xpTapStartX = e.clientX; xpTapStartY = e.clientY; xpTapMoved = false;
      ctx.xpNodeEl.setPointerCapture(e.pointerId);
      return;
    }
    // No wires — start drag immediately
    dragKind = 'new';
    wireDragClientX = e.clientX;
    wireDragClientY = e.clientY;
    const xpC  = elementCentreInPanel(ctx.xpNodeEl);
    const dragP = toPanelCoords(e.clientX, e.clientY);
    dragSegLen  = initRope(dragNodes, xpC.x, xpC.y, dragP.x, dragP.y);
    ctx.xpNodeEl.setPointerCapture(e.pointerId);
  }, { passive: true });

  ctx.xpNodeEl.addEventListener('pointermove', (e: PointerEvent) => {
    if (!xpPointerIsDown) return;
    if (dragKind === 'new') {
      wireDragClientX = e.clientX;
      wireDragClientY = e.clientY;
      return;
    }
    const moved = Math.hypot(e.clientX - xpTapStartX, e.clientY - xpTapStartY) > TAP_MOVEMENT_THRESHOLD;
    if (!moved) return;
    xpTapMoved = true;
    const activeWireCount = lockedWires.filter(w => !w.isSlurping).length;
    if (activeWireCount >= MAX_WIRES) return;
    // Has wires but not at max — start a new drag
    dragKind = 'new';
    wireDragClientX = e.clientX;
    wireDragClientY = e.clientY;
    const xpC  = elementCentreInPanel(ctx.xpNodeEl);
    const dragP = toPanelCoords(e.clientX, e.clientY);
    dragSegLen  = initRope(dragNodes, xpC.x, xpC.y, dragP.x, dragP.y);
  }, { passive: true });

  ctx.xpNodeEl.addEventListener('pointerup', (e: PointerEvent) => {
    xpPointerIsDown = false;
    if (dragKind === 'new') {
      const stat = landedStat(e.clientX, e.clientY);
      if (stat && !isStatWired(stat)) {
        dragPolylineSvg.style.display = 'none';
        addWireToStat(stat);
      } else if (stat && isStatWired(stat)) {
        triggerErrorFeedback();
        dragKind = 'none';
        dragPolylineSvg.style.display = 'none';
      } else {
        dragKind = 'none';
        dragPolylineSvg.style.display = 'none';
      }
      return;
    }
    if (!xpTapMoved) {
      const activeWireCount = lockedWires.filter(w => !w.isSlurping).length;
      if (activeWireCount >= MAX_WIRES && Math.hypot(e.clientX - xpTapStartX, e.clientY - xpTapStartY) > TAP_MOVEMENT_THRESHOLD) {
        triggerErrorFeedback();
        return;
      }
      const hadWires = lockedWires.some(w => !w.isSlurping);
      if (hadWires) {
        for (const wire of lockedWires) {
          if (!wire.isSlurping) disconnectWire(wire);
        }
      }
    } else {
      const activeWireCount = lockedWires.filter(w => !w.isSlurping).length;
      if (activeWireCount >= MAX_WIRES) {
        triggerErrorFeedback();
      }
    }
  }, { passive: true });

  ctx.xpNodeEl.addEventListener('pointercancel', () => {
    xpPointerIsDown = false;
    if (dragKind === 'new') {
      dragKind = 'none';
      dragPolylineSvg.style.display = 'none';
    }
    xpTapMoved = true;
  }, { passive: true });

  // ── Error feedback ────────────────────────────────────────────────────────
  let errorAnimTimeout: ReturnType<typeof setTimeout> | null = null;

  function triggerErrorFeedback(): void {
    ctx.onError();
    ctx.xpNodeEl.classList.add('rpg-xp-node--error');
    if (errorAnimTimeout !== null) clearTimeout(errorAnimTimeout);
    errorAnimTimeout = setTimeout(() => {
      ctx.xpNodeEl.classList.remove('rpg-xp-node--error');
      errorAnimTimeout = null;
    }, 600);
  }

  // ── Wire rendering ────────────────────────────────────────────────────────
  function updateWireVisual(nowMs: number): void {
    const deltaMs = lastFrameTime > 0 ? Math.min(nowMs - lastFrameTime, 100) : 16;
    lastFrameTime = nowMs;

    const panelW = ctx.panelEl.clientWidth;
    const panelH = ctx.panelEl.clientHeight;
    wireSvg.setAttribute('viewBox', `0 0 ${panelW} ${panelH}`);

    const xpC = elementCentreInPanel(ctx.xpNodeEl);
    updatePlugCircle(plugXpCircle, xpC.x, xpC.y, false);
    updatePlugCircle(plugAtkCircle,  elementCentreInPanel(ctx.statPlugAnchors.atk).x,  elementCentreInPanel(ctx.statPlugAnchors.atk).y,  isStatWired('atk'));
    updatePlugCircle(plugDefCircle,  elementCentreInPanel(ctx.statPlugAnchors.def).x,  elementCentreInPanel(ctx.statPlugAnchors.def).y,  isStatWired('def'));
    updatePlugCircle(plugLuckCircle, elementCentreInPanel(ctx.statPlugAnchors.luck).x, elementCentreInPanel(ctx.statPlugAnchors.luck).y, isStatWired('luck'));
    updatePlugCircle(plugHpCircle,   elementCentreInPanel(ctx.statPlugAnchors.hp).x,   elementCentreInPanel(ctx.statPlugAnchors.hp).y,   isStatWired('hp'));

    for (let i = lockedWires.length - 1; i >= 0; i--) {
      const wire = lockedWires[i];
      if (wire.isSlurping) {
        updateSlurpingWire(wire, xpC, deltaMs);
        if (wire.nodes.length === 0) {
          finalizeWireRemoval(wire);
        }
      } else {
        updateLockedWire(wire, xpC, deltaMs);
      }
    }

    if (dragKind === 'new' && dragNodes.length === ROPE_N) {
      const dragP = toPanelCoords(wireDragClientX, wireDragClientY);
      updateRope(dragNodes, dragSegLen, xpC.x, xpC.y, dragP.x, dragP.y);
      const pts = dragNodes.map(n => `${n.x.toFixed(1)},${n.y.toFixed(1)}`).join(' ');
      dragPolylineSvg.setAttribute('points', pts);
      dragPolylineSvg.style.display = '';
    } else if (dragKind !== 'new') {
      dragPolylineSvg.style.display = 'none';
    }
  }

  function updatePlugCircle(
    circle: SVGCircleElement,
    cx: number,
    cy: number,
    isActive: boolean,
  ): void {
    circle.setAttribute('cx', cx.toFixed(1));
    circle.setAttribute('cy', cy.toFixed(1));
    circle.setAttribute('stroke-opacity', isActive ? '1' : '0.45');
    circle.setAttribute('r', isActive ? '6' : '5');
  }

  function updateLockedWire(wire: WireData, xpC: { x: number; y: number }, deltaMs: number): void {
    if (wire.nodes.length !== ROPE_N) {
      const statC = elementCentreInPanel(ctx.statPlugAnchors[wire.stat]);
      wire.segLen = initRope(wire.nodes, xpC.x, xpC.y, statC.x, statC.y);
    }
    const isDraggingTip = dragKind === 'tip' && dragSourceWire === wire;
    let tipX: number, tipY: number;
    if (isDraggingTip) {
      const p = toPanelCoords(wireDragClientX, wireDragClientY);
      tipX = p.x; tipY = p.y;
    } else {
      const statC = elementCentreInPanel(ctx.statPlugAnchors[wire.stat]);
      tipX = statC.x; tipY = statC.y;
    }
    updateRope(wire.nodes, wire.segLen, xpC.x, xpC.y, tipX, tipY);

    wire.colorBleedT = Math.min(0.5, wire.colorBleedT + BLEED_RATE * deltaMs);

    renderWirePolyline(wire, xpC.x, xpC.y, tipX, tipY, ROPE_N);

    if (!isDraggingTip) {
      const r1 = wire.nodes[ROPE_N - 1];
      wire.tipHandle.style.display = 'block';
      wire.tipHandle.style.left = r1.x.toFixed(1) + 'px';
      wire.tipHandle.style.top  = r1.y.toFixed(1) + 'px';
    } else {
      wire.tipHandle.style.display = 'none';
    }
  }

  function updateSlurpingWire(wire: WireData, xpC: { x: number; y: number }, deltaMs: number): void {
    wire.slurpMs += deltaMs;
    const slurpProgress  = wire.slurpMs * SLURP_RATE;
    const slurpedLinks   = Math.floor(slurpProgress * ROPE_N);
    if (slurpedLinks >= ROPE_N) {
      wire.polyline.style.display = 'none';
      wire.tipHandle.style.display = 'none';
      wire.nodes.length = 0; // signal for removal
      return;
    }
    const visibleCount = ROPE_N - slurpedLinks;
    const tipProgress  = slurpProgress * ROPE_N - slurpedLinks; // 0..1 within current link
    const tipLerpEase  = 1 - Math.pow(1 - tipProgress, 2);
    const lastVisible  = wire.nodes[visibleCount - 1];
    const pullX = lastVisible.x + (xpC.x - lastVisible.x) * tipLerpEase * 0.15;
    const pullY = lastVisible.y + (xpC.y - lastVisible.y) * tipLerpEase * 0.15;
    updateRope(wire.nodes, wire.segLen, xpC.x, xpC.y, pullX, pullY, visibleCount);
    renderWirePolyline(wire, xpC.x, xpC.y, pullX, pullY, visibleCount);
    wire.tipHandle.style.display = 'none';
  }

  function renderWirePolyline(
    wire: WireData,
    x0: number, y0: number,
    x1: number, y1: number,
    visibleCount: number,
  ): void {
    if (wire.nodes.length < ROPE_N) { wire.polyline.style.display = 'none'; return; }
    const pts = wire.nodes.slice(0, visibleCount).map(n => `${n.x.toFixed(1)},${n.y.toFixed(1)}`).join(' ');
    wire.polyline.setAttribute('points', pts);
    wire.polyline.style.display = '';

    wire.gradient.setAttribute('x1', x0.toFixed(1));
    wire.gradient.setAttribute('y1', y0.toFixed(1));
    wire.gradient.setAttribute('x2', x1.toFixed(1));
    wire.gradient.setAttribute('y2', y1.toFixed(1));
    const statColor  = wire.isSlurping ? '#a78bfa' : STAT_WIRE_COLOR[wire.stat];
    const bleedPct   = ((1 - wire.colorBleedT) * 100).toFixed(1);
    wire.gradStop0.setAttribute('stop-color', '#a78bfa');
    wire.gradStop1.setAttribute('offset', bleedPct + '%');
    wire.gradStop1.setAttribute('stop-color', '#a78bfa');
    wire.gradStop2.setAttribute('stop-color', statColor);
  }

  // ── Public handle ─────────────────────────────────────────────────────────
  return {
    update(nowMs: number): void {
      const hasActiveWire = lockedWires.some(w => !w.isSlurping);
      ctx.xpNodeEl.classList.toggle('rpg-xp-node--locked', hasActiveWire || dragKind !== 'none');
      updateWireVisual(nowMs);
    },
  };
}
