/**
 * rpg-soft-wire.ts — Shared soft-body wire renderer for the RPG stats panel.
 *
 * Provides Verlet-rope physics and SVG rendering used by rpg-equip-wiring.ts.
 * All visible wires in the stats panel (weapon, XP, modifier) go through
 * this single renderer, which owns one shared SVG overlay element.
 *
 * Factory: createSoftWireRenderer(panelEl) → SoftWireRenderer
 *
 * Typical per-frame usage:
 *   renderer.setViewBox(w, h);
 *   renderer.updateDragPreviewPhysics(ax, ay, bx, by);   // if dragging
 *   renderer.updateLockedWire(wire, ax, ay, bx, by, dt);  // per connected wire
 *   renderer.updateSlurpingWire(wire, ax, ay, dt);         // per retracting wire
 */

// ── Rope constants ────────────────────────────────────────────────────────────

const ROPE_N            = 24;
const ROPE_GRAVITY      = 0.35;
const ROPE_DAMPING      = 0.97;
const ROPE_ITERS        = 5;
const ROPE_SLACK        = 1.25;
const SLURP_MS_PER_LINK = 20;   // ms to retract one rope link during slurp animation
const SLURP_TOTAL_MS    = SLURP_MS_PER_LINK * ROPE_N;  // total retraction duration in ms
const SLURP_RATE        = 1 / SLURP_TOTAL_MS;           // pre-computed progress per ms (avoids division in hot path)
const BLEED_RATE        = 0.0015; // colorBleedT advance per ms (controls gradient colour transition speed)

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface RopeNode {
  x: number; y: number;
  px: number; py: number;
}

export interface SoftWireData {
  nodes:       RopeNode[];
  segLen:      number;
  polyline:    SVGPolylineElement;
  gradient:    SVGLinearGradientElement;
  gradStop0:   SVGStopElement;
  gradStop1:   SVGStopElement;
  gradStop2:   SVGStopElement;
  tipHandle:   HTMLDivElement;
  srcColor:    string;
  dstColor:    string;
  colorBleedT: number;
  isSlurping:  boolean;
  slurpMs:     number;
}

export interface SoftWireRenderer {
  /** The SVG overlay element — append to the panel once after creation. */
  svgEl: SVGSVGElement;
  /** Resize the SVG coordinate space to match the panel dimensions. */
  setViewBox(w: number, h: number): void;
  /** Allocate SVG elements and tip handle div for a new wire. */
  createWire(srcColor: string, dstColor: string): SoftWireData;
  /** Remove SVG elements and tip handle after a wire fully retracts. */
  finalizeWireRemoval(wire: SoftWireData): void;
  /** Advance physics and render a connected (non-slurping) wire. */
  updateLockedWire(
    wire: SoftWireData,
    ax: number, ay: number,
    bx: number, by: number,
    deltaMs: number,
  ): void;
  /**
   * Advance slurp animation toward (ax, ay).
   * Returns true once the wire has fully retracted.
   */
  updateSlurpingWire(
    wire: SoftWireData,
    ax: number, ay: number,
    deltaMs: number,
  ): boolean;
  /** Initialise (if not already) and show the drag-preview rope. */
  setDragPreview(ax: number, ay: number, bx: number, by: number, color: string): void;
  /** Advance drag-preview rope physics and update its polyline. */
  updateDragPreviewPhysics(ax: number, ay: number, bx: number, by: number): void;
  /** Hide and reset the drag-preview rope. */
  hideDragPreview(): void;
}

// ── Rope physics helpers ──────────────────────────────────────────────────────

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
  // Verlet integration
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
  nodes[count - 1].x = bx; nodes[count - 1].y = by;
  nodes[count - 1].px = bx; nodes[count - 1].py = by;
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
    nodes[0].x = ax; nodes[0].y = ay;
    nodes[count - 1].x = bx; nodes[count - 1].y = by;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createSoftWireRenderer(panelEl: HTMLElement): SoftWireRenderer {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const svgEl = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svgEl.setAttribute('class', 'rpg-equip-wire-svg');
  svgEl.setAttribute('aria-hidden', 'true');

  const defs = document.createElementNS(SVG_NS, 'defs') as SVGDefsElement;
  svgEl.appendChild(defs);

  // Shared drag-preview polyline (one per renderer; shown only while dragging)
  const dragPreviewPolyline = document.createElementNS(SVG_NS, 'polyline') as SVGPolylineElement;
  dragPreviewPolyline.setAttribute('class', 'rpg-wire-rope');
  dragPreviewPolyline.setAttribute('fill', 'none');
  dragPreviewPolyline.setAttribute('stroke-width', '2');
  dragPreviewPolyline.setAttribute('stroke-linecap', 'round');
  dragPreviewPolyline.setAttribute('stroke-linejoin', 'round');
  dragPreviewPolyline.setAttribute('stroke-dasharray', '4 4');
  dragPreviewPolyline.style.display = 'none';
  svgEl.appendChild(dragPreviewPolyline);

  const dragNodes: RopeNode[] = [];
  let dragSegLen = 1;

  let gradIdSeq = 0;

  // ── Internal rendering helper ─────────────────────────────────────────────

  function renderWirePolyline(
    wire: SoftWireData,
    x0: number, y0: number,
    x1: number, y1: number,
    visibleCount: number,
  ): void {
    if (wire.nodes.length < ROPE_N) { wire.polyline.style.display = 'none'; return; }

    const pts = wire.nodes
      .slice(0, visibleCount)
      .map(n => `${n.x.toFixed(1)},${n.y.toFixed(1)}`)
      .join(' ');
    wire.polyline.setAttribute('points', pts);
    wire.polyline.style.display = '';

    wire.gradient.setAttribute('x1', x0.toFixed(1));
    wire.gradient.setAttribute('y1', y0.toFixed(1));
    wire.gradient.setAttribute('x2', x1.toFixed(1));
    wire.gradient.setAttribute('y2', y1.toFixed(1));

    const bleedPct = ((1 - wire.colorBleedT) * 100).toFixed(1);
    wire.gradStop0.setAttribute('stop-color', wire.srcColor);
    wire.gradStop1.setAttribute('offset', bleedPct + '%');
    wire.gradStop1.setAttribute('stop-color', wire.srcColor);
    wire.gradStop2.setAttribute('stop-color', wire.isSlurping ? wire.srcColor : wire.dstColor);
  }

  // ── Public methods ────────────────────────────────────────────────────────

  function setViewBox(w: number, h: number): void {
    svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }

  function createWire(srcColor: string, dstColor: string): SoftWireData {
    const gradId = `rpg-soft-wire-grad-${gradIdSeq++}`;
    const gradient = document.createElementNS(SVG_NS, 'linearGradient') as SVGLinearGradientElement;
    gradient.setAttribute('id', gradId);
    gradient.setAttribute('gradientUnits', 'userSpaceOnUse');

    const gs0 = document.createElementNS(SVG_NS, 'stop') as SVGStopElement;
    gs0.setAttribute('offset', '0%');
    gs0.setAttribute('stop-color', srcColor);

    const gs1 = document.createElementNS(SVG_NS, 'stop') as SVGStopElement;
    gs1.setAttribute('offset', '100%');
    gs1.setAttribute('stop-color', srcColor);

    const gs2 = document.createElementNS(SVG_NS, 'stop') as SVGStopElement;
    gs2.setAttribute('offset', '100%');
    gs2.setAttribute('stop-color', dstColor);

    gradient.appendChild(gs0);
    gradient.appendChild(gs1);
    gradient.appendChild(gs2);
    defs.appendChild(gradient);

    const polyline = document.createElementNS(SVG_NS, 'polyline') as SVGPolylineElement;
    polyline.setAttribute('class', 'rpg-wire-rope');
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', `url(#${gradId})`);
    polyline.setAttribute('stroke-width', '2');
    polyline.setAttribute('stroke-linecap', 'round');
    polyline.setAttribute('stroke-linejoin', 'round');
    polyline.style.display = 'none';
    svgEl.appendChild(polyline);

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
    panelEl.appendChild(tipHandle);

    return {
      nodes:       [],
      segLen:      1,
      polyline,
      gradient,
      gradStop0:   gs0,
      gradStop1:   gs1,
      gradStop2:   gs2,
      tipHandle,
      srcColor,
      dstColor,
      colorBleedT: 0,
      isSlurping:  false,
      slurpMs:     0,
    };
  }

  function finalizeWireRemoval(wire: SoftWireData): void {
    wire.polyline.remove();
    wire.gradient.remove();
    wire.tipHandle.remove();
  }

  function updateLockedWire(
    wire: SoftWireData,
    ax: number, ay: number,
    bx: number, by: number,
    deltaMs: number,
  ): void {
    if (wire.nodes.length !== ROPE_N) {
      wire.segLen = initRope(wire.nodes, ax, ay, bx, by);
    }
    updateRope(wire.nodes, wire.segLen, ax, ay, bx, by);

    wire.colorBleedT = Math.min(0.5, wire.colorBleedT + BLEED_RATE * deltaMs);
    renderWirePolyline(wire, ax, ay, bx, by, ROPE_N);

    const tip = wire.nodes[ROPE_N - 1];
    wire.tipHandle.style.display = 'block';
    wire.tipHandle.style.left = tip.x.toFixed(1) + 'px';
    wire.tipHandle.style.top  = tip.y.toFixed(1) + 'px';
  }

  function updateSlurpingWire(
    wire: SoftWireData,
    ax: number, ay: number,
    deltaMs: number,
  ): boolean {
    wire.slurpMs += deltaMs;
    const slurpProgress = wire.slurpMs * SLURP_RATE;
    const slurpedLinks  = Math.floor(slurpProgress * ROPE_N);

    if (slurpedLinks >= ROPE_N) {
      wire.polyline.style.display = 'none';
      wire.tipHandle.style.display = 'none';
      wire.nodes.length = 0;
      return true;
    }

    const visibleCount = ROPE_N - slurpedLinks;
    const tipProgress  = slurpProgress * ROPE_N - slurpedLinks;
    const tipLerpEase  = 1 - Math.pow(1 - tipProgress, 2);
    const lastVisible  = wire.nodes[visibleCount - 1];
    const pullX = lastVisible.x + (ax - lastVisible.x) * tipLerpEase * 0.15; // 0.15 = gentle pull strength
    const pullY = lastVisible.y + (ay - lastVisible.y) * tipLerpEase * 0.15;

    updateRope(wire.nodes, wire.segLen, ax, ay, pullX, pullY, visibleCount);
    renderWirePolyline(wire, ax, ay, pullX, pullY, visibleCount);
    wire.tipHandle.style.display = 'none';
    return false;
  }

  function setDragPreview(
    ax: number, ay: number,
    bx: number, by: number,
    color: string,
  ): void {
    if (dragNodes.length !== ROPE_N) {
      dragSegLen = initRope(dragNodes, ax, ay, bx, by);
    }
    dragPreviewPolyline.setAttribute('stroke', color);
    const pts = dragNodes
      .map(n => `${n.x.toFixed(1)},${n.y.toFixed(1)}`)
      .join(' ');
    dragPreviewPolyline.setAttribute('points', pts);
    dragPreviewPolyline.style.display = '';
  }

  function updateDragPreviewPhysics(
    ax: number, ay: number,
    bx: number, by: number,
  ): void {
    if (dragNodes.length !== ROPE_N) return;
    updateRope(dragNodes, dragSegLen, ax, ay, bx, by);
    const pts = dragNodes
      .map(n => `${n.x.toFixed(1)},${n.y.toFixed(1)}`)
      .join(' ');
    dragPreviewPolyline.setAttribute('points', pts);
  }

  function hideDragPreview(): void {
    dragPreviewPolyline.style.display = 'none';
    dragNodes.length = 0;
  }

  return {
    svgEl,
    setViewBox,
    createWire,
    finalizeWireRemoval,
    updateLockedWire,
    updateSlurpingWire,
    setDragPreview,
    updateDragPreviewPhysics,
    hideDragPreview,
  };
}
