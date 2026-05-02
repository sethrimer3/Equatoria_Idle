/**
 * rpg-stats-panel.ts — RPG stats panel, DPS tracker, and XP-wire UI.
 *
 * Owns the DOM elements for the stats panel together with the Verlet-rope
 * XP-wire interaction.
 *
 * Wire mechanic:
 *   - Drag from the XP node to ATK / DEF / LUCK / MAXHP to allocate future XP.
 *   - Up to 3 wires can be active simultaneously; XP efficacy is split evenly.
 *   - Tap the XP node while wired to "slurp" all wires back (undo wiring).
 *   - Grab a wire's tip handle and drag it to a different stat to re-attach.
 *   - Attempting a 4th wire triggers error feedback on the XP node.
 *
 * Created via `createRpgStatsPanel(ctx)`.  The caller is responsible for
 * appending `handle.element` to the document and calling `handle.update()`
 * each frame.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import {
  formatXp, formatLuckPercent,
  getLuckPercent, getEffectiveXpLuckBonus,
} from '../../sim/rpg/rpg-state';
import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import { TIER_BY_ID } from '../../data/tiers';
import type { RpgPlayerStats } from './rpg-types';
import { BASE_ATTACK_TIMER_KEY } from './rpg-constants';
import { formatNumberAs, type NumberFormat } from '../../util/format';

// ── DPS slot grouping ─────────────────────────────────────────────────────────
// Sand blade (base attack) and sand gatling share a single "SAN" DPS slot so
// that transitioning between the two doesn't change the chart layout.
const SAND_SLOT_KEY = '__sand__';
/**
 * All weapon IDs that belong to the unified "sand" DPS slot.
 * Update this set whenever a new sand-tier weapon is added to weapon-definitions.ts.
 */
const SAND_SLOT_MEMBERS = new Set<string>(['sand_blade', BASE_ATTACK_TIMER_KEY]);

/** Map a weapon ID to its canonical DPS slot key. */
function dpsSlotKey(weaponId: string): string {
  return SAND_SLOT_MEMBERS.has(weaponId) ? SAND_SLOT_KEY : weaponId;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface RpgStatsPanelCtx {
  rpgSimState: RpgSimState;
  playerStats: RpgPlayerStats;
  getCurrentWave(): number;
  getEffectiveEquippedIds(): Set<string>;
  getNumberFormat(): NumberFormat;
  /** Called when a wire is newly connected to a stat. */
  onXpWireConnect(stat: 'atk' | 'def' | 'luck' | 'hp'): void;
  /** Called whenever the set of wired stats changes (wire removed or added). */
  onXpWireDisconnect(): void;
  /** Called when the player attempts an invalid wire action (too many wires). */
  onError(): void;
}

export interface RpgStatsPanelHandle {
  element: HTMLElement;
  /** Container inside the right column where the RPG menu button should be appended. */
  menuButtonContainer: HTMLElement;
  recordDps(dmg: number, _legacyColor?: string): void;
  withDamageSource<T>(weaponId: string | null, fn: () => T): T;
  update(): void;
  /** Show or hide the dev-mode numerical designators on each panel box. */
  setDevMode(enabled: boolean): void;
}

// ── Wire colour map ───────────────────────────────────────────────────────────

const STAT_WIRE_COLOR: Record<'atk' | 'def' | 'luck' | 'hp', string> = {
  atk:  '#fca5a5', // light red
  def:  '#93c5fd', // light blue
  luck: '#86efac', // light green
  hp:   '#fde68a', // light yellow
};

const MAX_WIRES              = 3;
const MAX_DPS_SLOTS          = 5;   // maximum DPS bars shown in the chart
const ROPE_N                 = 24;   // doubled for smoother wire appearance
const ROPE_GRAVITY           = 0.35;
const ROPE_DAMPING           = 0.97;
const ROPE_ITERS             = 5;
const ROPE_SLACK             = 1.25;
// How long in ms to slurp one link; total slurp = SLURP_MS_PER_LINK * ROPE_N
const SLURP_MS_PER_LINK      = 20;
const SLURP_TOTAL_MS         = SLURP_MS_PER_LINK * ROPE_N;
const SLURP_RATE             = 1 / SLURP_TOTAL_MS; // pre-computed for hot-path division avoidance
const BLEED_RATE             = 0.0015; // wireColorBleedT advance per ms
const TAP_MOVEMENT_THRESHOLD = 8;     // px — move beyond this to distinguish drag from tap

export function createRpgStatsPanel(ctx: RpgStatsPanelCtx): RpgStatsPanelHandle {
  const { rpgSimState, playerStats } = ctx;

  // ── DPS tracking state ────────────────────────────────────────────
  const dpsWindow: Array<{ t: number; dmg: number; weaponId: string }> = [];
  const DPS_WINDOW_MS = 10000;
  const DPS_DOM_UPDATE_MS = 1000;
  const DPS_AXIS_LERP = 0.18;
  let activeDamageWeaponId: string | null = null;
  let lastDpsDomUpdateMs = 0;
  let lastDpsEquipKey = '';
  let dpsAxisMin = 0;
  let dpsAxisMax = 1;

  function withDamageSource<T>(weaponId: string | null, fn: () => T): T {
    const previous = activeDamageWeaponId;
    activeDamageWeaponId = weaponId;
    try {
      return fn();
    } finally {
      activeDamageWeaponId = previous;
    }
  }

  function recordDps(dmg: number, _legacyColor = '#fff'): void {
    void _legacyColor;
    if (dmg > 0 && activeDamageWeaponId !== null) {
      dpsWindow.push({ t: Date.now(), dmg, weaponId: dpsSlotKey(activeDamageWeaponId) });
    }
  }

  // ── DOM element creation ──────────────────────────────────────────
  const statsPanel = document.createElement('div');
  statsPanel.id = 'rpg-stats-panel';
  statsPanel.style.display = 'none';

  // ── Box 6 (thin) — glowing sand-grain player icon + 5 sand-coloured plug slots ──
  const xpBox1 = document.createElement('div');
  xpBox1.className = 'rpg-xp-box rpg-xp-box-1';

  // Player icon: a glowing sand grain matching the actual RPG player mote
  const playerIconEl = document.createElement('div');
  playerIconEl.className = 'rpg-player-icon';
  playerIconEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">'
    + '<defs><radialGradient id="rpg-sg-grad" cx="40%" cy="35%" r="60%">'
    + '<stop offset="0%" stop-color="#fff8d0"/>'
    + '<stop offset="45%" stop-color="#ffd764"/>'
    + '<stop offset="100%" stop-color="#e8a820" stop-opacity="0.7"/>'
    + '</radialGradient></defs>'
    + '<circle cx="10" cy="10" r="9" fill="#ffd764" opacity="0.07"/>'
    + '<circle cx="10" cy="10" r="7" fill="#ffd764" opacity="0.13"/>'
    + '<circle cx="10" cy="10" r="5.5" fill="url(#rpg-sg-grad)"/>'
    + '<circle cx="8.5" cy="8" r="1.4" fill="#fffde0" opacity="0.65"/>'
    + '</svg>';
  xpBox1.appendChild(playerIconEl);

  // Plug container — holds 5 sand-coloured rounded-square slots.
  // These plugs are visual stubs (not wired to stats for now).
  // The first 4 also contain the functional wire-anchor elements used by the XP wire system.
  const plugContainerEl = document.createElement('div');
  plugContainerEl.className = 'rpg-plug-container';
  xpBox1.appendChild(plugContainerEl);

  function makePlugSlot(extraClass: string): HTMLDivElement {
    const slot = document.createElement('div');
    slot.className = `rpg-plug-slot rpg-plug-slot--sand${extraClass ? ' ' + extraClass : ''}`;
    plugContainerEl.appendChild(slot);
    return slot;
  }

  const atkPlugSlot  = makePlugSlot('');
  const defPlugSlot  = makePlugSlot('');
  const hpPlugSlot   = makePlugSlot('');
  const luckPlugSlot = makePlugSlot('');
  makePlugSlot(''); // 5th stub plug slot

  const atkPlugAnchor  = document.createElement('div');
  atkPlugAnchor.className = 'rpg-stat-plug-anchor';
  atkPlugSlot.appendChild(atkPlugAnchor);

  const defPlugAnchor  = document.createElement('div');
  defPlugAnchor.className = 'rpg-stat-plug-anchor';
  defPlugSlot.appendChild(defPlugAnchor);

  const hpPlugAnchor  = document.createElement('div');
  hpPlugAnchor.className = 'rpg-stat-plug-anchor';
  hpPlugSlot.appendChild(hpPlugAnchor);

  const luckPlugAnchor  = document.createElement('div');
  luckPlugAnchor.className = 'rpg-stat-plug-anchor';
  luckPlugSlot.appendChild(luckPlugAnchor);

  // ── Box 5 — 4 separate boxes: XP box + roman-numeral boxes I/II/III ──
  // Each box is a row containing a label on the left and a plug slot on the right.
  const xpBox2 = document.createElement('div');
  xpBox2.className = 'rpg-box5-wrapper';

  // Helper: build one Box-5 row box
  function makeBox5Row(label: string | HTMLElement): HTMLDivElement {
    const box = document.createElement('div');
    box.className = 'rpg-xp-box rpg-box5-cell';
    if (typeof label === 'string') {
      const span = document.createElement('span');
      span.className = 'rpg-box5-label';
      span.textContent = label;
      box.appendChild(span);
    } else {
      box.appendChild(label);
    }
    // Plug slot (square with rounded corners)
    const plugSlot = document.createElement('div');
    plugSlot.className = 'rpg-plug-slot rpg-plug-slot--sand';
    box.appendChild(plugSlot);
    return box;
  }

  // XP node — compact two-line widget (remains the drag source for wires)
  const xpNodeEl = document.createElement('div');
  xpNodeEl.className = 'rpg-xp-node';
  xpNodeEl.title = 'Drag to ATK / DEF / LUCK / MAXHP (up to 3 wires). Tap to retract all wires.';
  xpNodeEl.style.flex = '1 1 0';
  xpNodeEl.style.width = 'auto';
  const xpLabelTextEl = document.createElement('span');
  xpLabelTextEl.className = 'rpg-xp-label-text';
  xpLabelTextEl.textContent = 'XP';
  const xpAmountEl = document.createElement('span');
  xpAmountEl.className = 'rpg-xp-amount-text';
  xpAmountEl.textContent = '0';
  xpNodeEl.appendChild(xpLabelTextEl);
  xpNodeEl.appendChild(xpAmountEl);

  xpBox2.appendChild(makeBox5Row(xpNodeEl));
  xpBox2.appendChild(makeBox5Row('I'));
  xpBox2.appendChild(makeBox5Row('II'));
  xpBox2.appendChild(makeBox5Row('III'));

  // ── Box 4 — 6 separate wide short row-boxes ───────────────────────
  // Layout:
  //   Row 0 (labels): ATK | DEF | MAXHP | LUCK | STR | AGI
  //   Row 1 (values): live stat values for first 4, stub "0" for last 2
  //   Rows 2–5:       all stub "0" values
  const xpBox3 = document.createElement('div');
  xpBox3.className = 'rpg-box4-wrapper';

  function makeBox4Row(): HTMLDivElement[] {
    const rowBox = document.createElement('div');
    rowBox.className = 'rpg-xp-box rpg-box4-row';
    const cells: HTMLDivElement[] = [];
    for (let c = 0; c < 6; c++) {
      const cell = document.createElement('div');
      cell.className = 'rpg-box4-cell' + (c === 5 ? ' rpg-box4-cell--last' : '');
      rowBox.appendChild(cell);
      cells.push(cell);
    }
    xpBox3.appendChild(rowBox);
    return cells;
  }

  // Row 0 — label cells
  const box4LabelsRow = makeBox4Row();
  const statLabelDefs: Array<[string, string]> = [
    ['ATK', '#fca5a5'], ['DEF', '#93c5fd'], ['MAXHP', '#fde68a'],
    ['LUCK', '#86efac'], ['STR', 'rgba(255,255,255,0.3)'], ['AGI', 'rgba(255,255,255,0.3)'],
  ];
  statLabelDefs.forEach(([text, color], i) => {
    const span = document.createElement('span');
    span.className = 'rpg-stat-label';
    span.textContent = text;
    span.style.color = color;
    box4LabelsRow[i].appendChild(span);
  });

  // Row 1 — value cells (live stat values + stubs)
  const box4ValuesRow = makeBox4Row();

  // Build stat widget references so the rest of the file can update them
  // root = value cell (used for pointer-over and rpg-stat--wired glow)
  function makeStatWidget(
    extraClass: string,
    valueCell: HTMLDivElement,
  ): { root: HTMLElement; labelEl: HTMLSpanElement; valueEl: HTMLSpanElement } {
    const valueEl = document.createElement('span');
    valueEl.className = 'rpg-stat-value' + (extraClass ? ' ' + extraClass : '');
    valueCell.appendChild(valueEl);
    // labelEl placeholder — label text is rendered separately in the labels row
    const labelEl = document.createElement('span');
    return { root: valueCell, labelEl, valueEl };
  }

  const atkWidget   = makeStatWidget('', box4ValuesRow[0]);
  const defWidget   = makeStatWidget('', box4ValuesRow[1]);
  const maxHpWidget = makeStatWidget('', box4ValuesRow[2]);
  const luckWidget  = makeStatWidget('rpg-stat-value--luck', box4ValuesRow[3]);

  // Apply stat colors to value elements
  atkWidget.valueEl.style.color   = '#fca5a5';
  defWidget.valueEl.style.color   = '#93c5fd';
  maxHpWidget.valueEl.style.color = '#fde68a';
  maxHpWidget.valueEl.style.fontSize = '14px';
  luckWidget.valueEl.style.color  = '#86efac';

  // Stub value elements for columns 4–5 of the values row
  for (let c = 4; c < 6; c++) {
    const stub = document.createElement('span');
    stub.className = 'rpg-stat-value';
    stub.style.color = 'rgba(255,255,255,0.25)';
    stub.textContent = '0';
    box4ValuesRow[c].appendChild(stub);
  }

  // Stub rows 2–5
  for (let r = 0; r < 4; r++) {
    const cells = makeBox4Row();
    for (const cell of cells) {
      const stub = document.createElement('span');
      stub.className = 'rpg-stat-value';
      stub.style.color = 'rgba(255,255,255,0.18)';
      stub.textContent = '0';
      cell.appendChild(stub);
    }
  }

  // Append the three layout groups to the panel
  statsPanel.appendChild(xpBox1);
  statsPanel.appendChild(xpBox2);
  statsPanel.appendChild(xpBox3);

  // ── Right column — DPS + HP + menu area ───────────────────────────
  const rightColumn = document.createElement('div');
  rightColumn.className = 'rpg-right-column';

  // ── DPS Chart Widget ──────────────────────────────────────────────
  const dpsWidget = document.createElement('div');
  dpsWidget.className = 'rpg-dps-widget';
  const dpsLabelEl = document.createElement('span');
  dpsLabelEl.className = 'rpg-stat-label';
  dpsLabelEl.textContent = 'DPS';
  const dpsValueEl = document.createElement('span');
  dpsValueEl.className = 'rpg-stat-value rpg-stat-value--dps';
  dpsValueEl.textContent = '';
  const dpsChartEl = document.createElement('div');
  dpsChartEl.className = 'rpg-dps-chart';
  const dpsAxisEl = document.createElement('div');
  dpsAxisEl.className = 'rpg-dps-axis';
  const dpsAxisLowEl = document.createElement('span');
  dpsAxisLowEl.textContent = '0';
  const dpsAxisHighEl = document.createElement('span');
  dpsAxisHighEl.textContent = '0';
  dpsAxisEl.appendChild(dpsAxisLowEl);
  dpsAxisEl.appendChild(dpsAxisHighEl);
  dpsWidget.appendChild(dpsLabelEl);
  dpsWidget.appendChild(dpsValueEl);
  dpsWidget.appendChild(dpsChartEl);
  dpsWidget.appendChild(dpsAxisEl);

  // ── HP box — current hit-points, below DPS in the right column ────
  const hpFractionEl = document.createElement('div');
  hpFractionEl.className = 'rpg-hp-box';
  const hpFractionLabel = document.createElement('span');
  hpFractionLabel.className = 'rpg-stat-label';
  hpFractionLabel.textContent = 'HP';
  const hpFractionValue = document.createElement('span');
  hpFractionValue.className = 'rpg-stat-value rpg-stat-value--hp';
  hpFractionEl.appendChild(hpFractionLabel);
  hpFractionEl.appendChild(hpFractionValue);

  // ── Menu area — RPG menu button lives here ─────────────────────────
  const menuArea = document.createElement('div');
  menuArea.className = 'rpg-menu-area';

  rightColumn.appendChild(dpsWidget);
  rightColumn.appendChild(hpFractionEl);
  rightColumn.appendChild(menuArea);
  statsPanel.appendChild(rightColumn);

  // ── Dev mode box number badges ────────────────────────────────────
  // Numbered top-to-bottom, right-to-left:
  //   1=DPS widget, 2=HP box, 3=menu area (right column, top→bottom)
  //   4=box 3 (wide stats area), 5=box 2 (XP column), 6=box 1 (plug column)
  function makeBoxBadge(container: HTMLElement, num: number): HTMLSpanElement {
    const badge = document.createElement('span');
    badge.className = 'rpg-dev-box-num';
    badge.textContent = String(num);
    container.appendChild(badge);
    return badge;
  }
  makeBoxBadge(xpBox1, 6);
  makeBoxBadge(xpBox2, 5);
  makeBoxBadge(xpBox3, 4);
  makeBoxBadge(dpsWidget, 1);
  makeBoxBadge(hpFractionEl, 2);
  makeBoxBadge(menuArea, 3);

  // ── Wire SVG overlay (sits above all panel content) ───────────────
  const wireSvgNS = 'http://www.w3.org/2000/svg';
  const wireSvg = document.createElementNS(wireSvgNS, 'svg') as SVGSVGElement;
  wireSvg.setAttribute('class', 'rpg-wire-svg');
  wireSvg.setAttribute('aria-hidden', 'true');

  const wireDefs = document.createElementNS(wireSvgNS, 'defs') as SVGDefsElement;
  wireSvg.appendChild(wireDefs);

  // Plug socket circles — one for XP node, one per stat
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

  statsPanel.appendChild(wireSvg);

  // ── Rope physics helpers ──────────────────────────────────────────
  interface RopeNode { x: number; y: number; px: number; py: number; }

  function initRope(
    nodes: RopeNode[],
    x0: number, y0: number,
    x1: number, y1: number,
  ): number /* segLen */ {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const segLen = (dist * ROPE_SLACK) / (ROPE_N - 1);
    nodes.length = 0;
    for (let i = 0; i < ROPE_N; i++) {
      const t = i / (ROPE_N - 1);
      const xi = x0 + (x1 - x0) * t;
      const yi = y0 + (y1 - y0) * t;
      nodes.push({ x: xi, y: yi, px: xi, py: yi });
    }
    return segLen;
  }

  function updateRope(
    nodes: RopeNode[],
    segLen: number,
    x0: number, y0: number,
    x1: number, y1: number,
    visibleCount = ROPE_N,
  ): void {
    if (nodes.length !== ROPE_N) return;
    const lastIdx = visibleCount - 1;
    for (let i = 1; i < lastIdx; i++) {
      const n = nodes[i];
      const vx = (n.x - n.px) * ROPE_DAMPING;
      const vy = (n.y - n.py) * ROPE_DAMPING;
      n.px = n.x; n.py = n.y;
      n.x += vx; n.y += vy + ROPE_GRAVITY;
    }
    nodes[0].x = x0; nodes[0].y = y0; nodes[0].px = x0; nodes[0].py = y0;
    nodes[lastIdx].x = x1; nodes[lastIdx].y = y1;
    nodes[lastIdx].px = x1; nodes[lastIdx].py = y1;
    for (let iter = 0; iter < ROPE_ITERS; iter++) {
      for (let i = 0; i < lastIdx; i++) {
        const na = nodes[i], nb = nodes[i + 1];
        const dx = nb.x - na.x, dy = nb.y - na.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.001) continue;
        const diff = ((dist - segLen) / dist) * 0.5;
        const cx = dx * diff, cy = dy * diff;
        if (i > 0)            { na.x += cx; na.y += cy; }
        if (i < lastIdx - 1)  { nb.x -= cx; nb.y -= cy; }
      }
    }
  }

  // ── Per-wire data ─────────────────────────────────────────────────
  interface WireData {
    stat: 'atk' | 'def' | 'luck' | 'hp';
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

  function createWireData(stat: 'atk' | 'def' | 'luck' | 'hp'): WireData {
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
    statsPanel.appendChild(tipHandle);

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
      // Switch to dragging-tip mode for this wire
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
        // Reconnect to new stat
        disconnectWire(data);
        addWireToStat(targetStat);
      } else if (targetStat === data.stat) {
        // Dropped back on same stat — no change
        dragKind = 'none';
        dragSourceWire = null;
      } else {
        // Dropped nowhere valid — slurp this wire
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

  // Drag state (new wire from XP, or re-dragging a tip)
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

  // ── Wire management helpers ───────────────────────────────────────
  function isStatWired(stat: 'atk' | 'def' | 'luck' | 'hp'): boolean {
    return lockedWires.some(w => w.stat === stat && !w.isSlurping);
  }

  function disconnectWire(wire: WireData): void {
    wire.isSlurping = true;
    wire.slurpMs = 0;
    dragKind = 'none';
    dragSourceWire = null;
    // Remove from rpgSimState immediately so XP stops flowing to it
    const idx = rpgSimState.xpAllocatedStats.indexOf(wire.stat);
    if (idx !== -1) {
      rpgSimState.xpAllocatedStats.splice(idx, 1);
      ctx.onXpWireDisconnect();
    }
  }

  function finalizeWireRemoval(wire: WireData): void {
    const idx = lockedWires.indexOf(wire);
    if (idx !== -1) lockedWires.splice(idx, 1);
    wire.polyline.remove();
    wire.gradient.remove();
    wire.tipHandle.remove();
  }

  function addWireToStat(stat: 'atk' | 'def' | 'luck' | 'hp'): WireData {
    const wire = createWireData(stat);
    lockedWires.push(wire);
    // Initialize rope anchored at the stat's plug anchor element
    const xpC     = elementCentreInPanel(xpNodeEl);
    const statC   = elementCentreInPanel(statPlugAnchor(stat));
    wire.segLen   = initRope(wire.nodes, xpC.x, xpC.y, statC.x, statC.y);
    wire.colorBleedT = 0;
    // Update sim state
    rpgSimState.xpAllocatedStats.push(stat);
    ctx.onXpWireConnect(stat);
    dragKind = 'none';
    dragSourceWire = null;
    return wire;
  }

  // ── Restore wires from saved state ─────────────────────────────────
  for (const stat of rpgSimState.xpAllocatedStats) {
    const wire = createWireData(stat);
    wire.colorBleedT = 0.5; // already blended
    lockedWires.push(wire);
    // Rope will be initialized on first updateWireVisual call once DOM is ready
  }

  // ── Coordinate helpers ────────────────────────────────────────────
  function toPanelCoords(clientX: number, clientY: number): { x: number; y: number } {
    const r = statsPanel.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  function elementCentreInPanel(el: HTMLElement): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    const p = statsPanel.getBoundingClientRect();
    return { x: r.left + r.width / 2 - p.left, y: r.top + r.height / 2 - p.top };
  }

  function statPlugAnchor(stat: 'atk' | 'def' | 'luck' | 'hp'): HTMLElement {
    if (stat === 'atk')  return atkPlugAnchor;
    if (stat === 'def')  return defPlugAnchor;
    if (stat === 'luck') return luckPlugAnchor;
    return hpPlugAnchor;
  }

  function pointerOverElement(el: HTMLElement, clientX: number, clientY: number): boolean {
    const r = el.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }

  function landedStat(clientX: number, clientY: number): 'atk' | 'def' | 'luck' | 'hp' | null {
    if (pointerOverElement(atkWidget.root,   clientX, clientY)) return 'atk';
    if (pointerOverElement(defWidget.root,   clientX, clientY)) return 'def';
    if (pointerOverElement(luckWidget.root,  clientX, clientY)) return 'luck';
    if (pointerOverElement(maxHpWidget.root, clientX, clientY)) return 'hp';
    return null;
  }

  // ── XP node events ────────────────────────────────────────────────
  // xpPointerIsDown tracks whether a pointerdown has been received on the XP
  // node without a corresponding pointerup/cancel.  This guards the pointermove
  // handler so that simply hovering over the XP node cannot accidentally start
  // a wire drag without an explicit click/tap.
  let xpPointerIsDown = false;
  let xpTapStartX = 0, xpTapStartY = 0, xpTapMoved = false;

  xpNodeEl.addEventListener('pointerdown', (e: PointerEvent) => {
    e.stopPropagation();
    xpPointerIsDown = true;
    if (dragKind !== 'none') return;
    const activeWireCount = lockedWires.filter(w => !w.isSlurping).length;
    if (activeWireCount >= MAX_WIRES) {
      // At max wires — track for tap-to-slurp; block new drags
      xpTapStartX = e.clientX; xpTapStartY = e.clientY; xpTapMoved = false;
      xpNodeEl.setPointerCapture(e.pointerId);
      return;
    }
    if (activeWireCount > 0) {
      // Has wires but not at max — track for tap-to-slurp OR new drag
      xpTapStartX = e.clientX; xpTapStartY = e.clientY; xpTapMoved = false;
      xpNodeEl.setPointerCapture(e.pointerId);
      // Will switch to new-drag mode in pointermove if user moves enough
      return;
    }
    // No wires — start drag immediately
    dragKind = 'new';
    wireDragClientX = e.clientX;
    wireDragClientY = e.clientY;
    const xpC = elementCentreInPanel(xpNodeEl);
    const dragP = toPanelCoords(e.clientX, e.clientY);
    dragSegLen = initRope(dragNodes, xpC.x, xpC.y, dragP.x, dragP.y);
    xpNodeEl.setPointerCapture(e.pointerId);
  }, { passive: true });

  xpNodeEl.addEventListener('pointermove', (e: PointerEvent) => {
    // Only process movement when a pointerdown was received first.
    // Without this guard, hovering over the XP node (without clicking) would
    // inadvertently start a drag because xpTapStartX/Y default to 0,0.
    if (!xpPointerIsDown) return;
    if (dragKind === 'new') {
      wireDragClientX = e.clientX;
      wireDragClientY = e.clientY;
      return;
    }
    // Has wires — detect tap vs. drag
    const moved = Math.hypot(e.clientX - xpTapStartX, e.clientY - xpTapStartY) > TAP_MOVEMENT_THRESHOLD;
    if (!moved) return;
    xpTapMoved = true;
    const activeWireCount = lockedWires.filter(w => !w.isSlurping).length;
    if (activeWireCount >= MAX_WIRES) {
      // Max wires — can't start new drag; show error if this is first big move
      // (only once per gesture)
      return;
    }
    // Has wires but not max — start a new drag
    dragKind = 'new';
    wireDragClientX = e.clientX;
    wireDragClientY = e.clientY;
    const xpC = elementCentreInPanel(xpNodeEl);
    const dragP = toPanelCoords(e.clientX, e.clientY);
    dragSegLen = initRope(dragNodes, xpC.x, xpC.y, dragP.x, dragP.y);
  }, { passive: true });

  xpNodeEl.addEventListener('pointerup', (e: PointerEvent) => {
    xpPointerIsDown = false;
    if (dragKind === 'new') {
      const stat = landedStat(e.clientX, e.clientY);
      if (stat && !isStatWired(stat)) {
        dragPolylineSvg.style.display = 'none';
        addWireToStat(stat);
      } else if (stat && isStatWired(stat)) {
        // Already wired to this stat — treat as error
        triggerErrorFeedback();
        dragKind = 'none';
        dragPolylineSvg.style.display = 'none';
      } else {
        dragKind = 'none';
        dragPolylineSvg.style.display = 'none';
      }
      return;
    }
    // Check for tap-to-slurp-all
    if (!xpTapMoved) {
      const activeWireCount = lockedWires.filter(w => !w.isSlurping).length;
      if (activeWireCount >= MAX_WIRES && Math.hypot(e.clientX - xpTapStartX, e.clientY - xpTapStartY) > TAP_MOVEMENT_THRESHOLD) {
        // They tried to drag from max wires — show error
        triggerErrorFeedback();
        return;
      }
      // Tap — slurp all active wires
      const hadWires = lockedWires.some(w => !w.isSlurping);
      if (hadWires) {
        for (const wire of lockedWires) {
          if (!wire.isSlurping) disconnectWire(wire);
        }
      }
    } else {
      // They moved while at max — show error
      const activeWireCount = lockedWires.filter(w => !w.isSlurping).length;
      if (activeWireCount >= MAX_WIRES) {
        triggerErrorFeedback();
      }
    }
  }, { passive: true });

  xpNodeEl.addEventListener('pointercancel', () => {
    xpPointerIsDown = false;
    if (dragKind === 'new') {
      dragKind = 'none';
      dragPolylineSvg.style.display = 'none';
    }
    xpTapMoved = true;
  }, { passive: true });

  // ── Error feedback ─────────────────────────────────────────────────
  let errorAnimTimeout: ReturnType<typeof setTimeout> | null = null;

  function triggerErrorFeedback(): void {
    ctx.onError();
    xpNodeEl.classList.add('rpg-xp-node--error');
    if (errorAnimTimeout !== null) clearTimeout(errorAnimTimeout);
    errorAnimTimeout = setTimeout(() => {
      xpNodeEl.classList.remove('rpg-xp-node--error');
      errorAnimTimeout = null;
    }, 600);
  }

  // ── Wire rendering (called each frame from updateStatsPanelDom) ───
  function updateWireVisual(nowMs: number): void {
    const deltaMs = lastFrameTime > 0 ? Math.min(nowMs - lastFrameTime, 100) : 16;
    lastFrameTime = nowMs;

    // Sync SVG viewport to panel size
    const panelW = statsPanel.clientWidth;
    const panelH = statsPanel.clientHeight;
    wireSvg.setAttribute('viewBox', `0 0 ${panelW} ${panelH}`);

    // Update plug socket positions — circles sit at the plug anchor of each stat
    const xpC = elementCentreInPanel(xpNodeEl);
    updatePlugCircle(plugXpCircle, xpC.x, xpC.y, false);
    updatePlugCircle(plugAtkCircle,  elementCentreInPanel(atkPlugAnchor).x,  elementCentreInPanel(atkPlugAnchor).y,  isStatWired('atk'));
    updatePlugCircle(plugDefCircle,  elementCentreInPanel(defPlugAnchor).x,  elementCentreInPanel(defPlugAnchor).y,  isStatWired('def'));
    updatePlugCircle(plugLuckCircle, elementCentreInPanel(luckPlugAnchor).x, elementCentreInPanel(luckPlugAnchor).y, isStatWired('luck'));
    updatePlugCircle(plugHpCircle,   elementCentreInPanel(hpPlugAnchor).x,   elementCentreInPanel(hpPlugAnchor).y,   isStatWired('hp'));

    // Update locked wires
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

    // Update drag wire
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
    // Initialize rope if not yet done (e.g. just restored from save)
    if (wire.nodes.length !== ROPE_N) {
      const anchorEl = statPlugAnchor(wire.stat);
      const statC = elementCentreInPanel(anchorEl);
      wire.segLen = initRope(wire.nodes, xpC.x, xpC.y, statC.x, statC.y);
    }
    const isDraggingTip = dragKind === 'tip' && dragSourceWire === wire;
    let tipX: number, tipY: number;
    if (isDraggingTip) {
      const p = toPanelCoords(wireDragClientX, wireDragClientY);
      tipX = p.x; tipY = p.y;
    } else {
      const anchorEl = statPlugAnchor(wire.stat);
      const statC = elementCentreInPanel(anchorEl);
      tipX = statC.x; tipY = statC.y;
    }
    updateRope(wire.nodes, wire.segLen, xpC.x, xpC.y, tipX, tipY);

    // Advance colour bleed
    wire.colorBleedT = Math.min(0.5, wire.colorBleedT + BLEED_RATE * deltaMs);

    renderWirePolyline(wire, xpC.x, xpC.y, tipX, tipY, ROPE_N);

    // Tip handle (only visible when locked and not dragging-tip)
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
    // Compute how many links have been consumed from the stat end
    const slurpProgress = wire.slurpMs * SLURP_RATE;
    const slurpedLinks = Math.floor(slurpProgress * ROPE_N);
    if (slurpedLinks >= ROPE_N) {
      // All links consumed — mark done
      wire.polyline.style.display = 'none';
      wire.tipHandle.style.display = 'none';
      wire.nodes.length = 0; // signal for removal
      return;
    }
    const visibleCount = ROPE_N - slurpedLinks;
    // Pull the visible tip progressively toward XP
    const tipProgress = slurpProgress * ROPE_N - slurpedLinks; // 0..1 within current link
    const tipLerpEase = 1 - Math.pow(1 - tipProgress, 2);
    const lastVisible = wire.nodes[visibleCount - 1];
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

    // Gradient from XP end (purple) to stat end (stat color)
    wire.gradient.setAttribute('x1', x0.toFixed(1));
    wire.gradient.setAttribute('y1', y0.toFixed(1));
    wire.gradient.setAttribute('x2', x1.toFixed(1));
    wire.gradient.setAttribute('y2', y1.toFixed(1));
    const statColor = wire.isSlurping ? '#a78bfa' : STAT_WIRE_COLOR[wire.stat];
    const bleedPct = ((1 - wire.colorBleedT) * 100).toFixed(1);
    wire.gradStop0.setAttribute('stop-color', '#a78bfa');
    wire.gradStop1.setAttribute('offset', bleedPct + '%');
    wire.gradStop1.setAttribute('stop-color', '#a78bfa');
    wire.gradStop2.setAttribute('stop-color', statColor);
  }

  function weaponAbbrev(weaponId: string): string {
    if (weaponId === SAND_SLOT_KEY) return 'SAN';
    const tierId = WEAPON_BY_ID.get(weaponId)?.costTierId ?? 'sand';
    return tierId.slice(0, 3).toUpperCase();
  }

  function weaponColor(weaponId: string): string {
    if (weaponId === SAND_SLOT_KEY) return TIER_BY_ID.get('sand')?.color ?? '#ffd764';
    const tierId = WEAPON_BY_ID.get(weaponId)?.costTierId;
    return (tierId ? TIER_BY_ID.get(tierId)?.color : null) ?? '#ffd764';
  }

  function formatDpsAxis(value: number): string {
    return value >= 1000 ? formatXp(value) : Math.round(value).toString();
  }

  /**
   * Format a stat value (ATK, DEF, MAXHP) using the player's selected notation.
   * Values under 1000 are shown as integers; larger values use the number format.
   */
  function formatStatValue(value: number, fmt: NumberFormat): string {
    if (value < 1000) return Math.floor(value).toString();
    return formatNumberAs(value, fmt);
  }

  /**
   * Compute the ordered list of DPS display slots from the currently equipped
   * weapon IDs.  Sand weapons (sand_blade, __base__) are collapsed into a
   * single SAND_SLOT_KEY entry that always appears first.
   *
   * The sand slot is shown only when no non-sand weapon is equipped, or when
   * the sand gatling (sand_blade) is explicitly one of the equipped weapons.
   * If other weapons are equipped without sand_blade, the sand slot is hidden
   * because the base sand attack is superseded.
   */
  function buildDisplaySlots(equippedIds: string[]): string[] {
    const slots: string[] = [];
    let hasSandSlot = false;
    for (const id of equippedIds) {
      const slot = dpsSlotKey(id);
      if (slot === SAND_SLOT_KEY) {
        if (!hasSandSlot) {
          hasSandSlot = true;
          slots.push(SAND_SLOT_KEY);
        }
      } else {
        slots.push(slot);
      }
    }
    // Show the sand slot only when there are no non-sand weapons equipped
    // (i.e. the base sand attack is the only source of damage), or when the
    // sand gatling is itself the equipped weapon (sand_blade in equippedIds).
    if (!hasSandSlot) {
      const allWeaponsAreSand = equippedIds.every(id => SAND_SLOT_MEMBERS.has(id));
      if (allWeaponsAreSand) {
        slots.unshift(SAND_SLOT_KEY);
      }
    }
    // Cap to maximum number of DPS slots shown in the chart.
    if (slots.length > MAX_DPS_SLOTS) slots.length = MAX_DPS_SLOTS;
    return slots;
  }

  function rebuildDpsRows(displaySlots: string[]): void {
    dpsChartEl.textContent = '';
    dpsLabelEl.textContent = '';
    dpsValueEl.textContent = '';
    dpsAxisEl.hidden = false;
    for (const slotId of displaySlots) {
      const row = document.createElement('div');
      row.className = 'rpg-dps-row';
      row.dataset.weaponId = slotId;
      const label = document.createElement('span');
      label.className = 'rpg-dps-label';
      label.textContent = weaponAbbrev(slotId);
      const track = document.createElement('div');
      track.className = 'rpg-dps-track';
      const bar = document.createElement('div');
      bar.className = 'rpg-dps-bar';
      bar.style.background = weaponColor(slotId);
      track.appendChild(bar);
      row.appendChild(label);
      row.appendChild(track);
      dpsChartEl.appendChild(row);
    }
  }

  function updateStatsPanelDom(): void {
    const nowMs = performance.now();
    // Read number format once per frame to avoid repeated calls
    const numFmt = ctx.getNumberFormat();

    // HP fraction (outside the box)
    hpFractionValue.textContent = Math.max(0, Math.ceil(playerStats.hp)) + ' / ' + playerStats.maxHp;

    // XP amount — update the value span inside the XP node
    xpAmountEl.textContent = formatXp(rpgSimState.xp);

    // ATK
    atkWidget.valueEl.textContent = formatStatValue(playerStats.atk, numFmt);

    // DEF
    defWidget.valueEl.textContent = formatStatValue(playerStats.def, numFmt);

    // MAXHP
    maxHpWidget.valueEl.textContent = formatStatValue(playerStats.maxHp, numFmt);

    // LUCK — display the full effective luck (base + XP-allocation bonus), may exceed 100%
    const baseLuck  = getLuckPercent(rpgSimState.xp);
    const luckBonus = getEffectiveXpLuckBonus(rpgSimState);
    luckWidget.valueEl.textContent = formatLuckPercent(baseLuck + luckBonus);

    // Glow on the wired stat widgets
    atkWidget.root.classList.toggle('rpg-stat--wired',    isStatWired('atk'));
    defWidget.root.classList.toggle('rpg-stat--wired',    isStatWired('def'));
    luckWidget.root.classList.toggle('rpg-stat--wired',   isStatWired('luck'));
    maxHpWidget.root.classList.toggle('rpg-stat--wired',  isStatWired('hp'));

    // XP node locked indicator (any active wire)
    const hasActiveWire = lockedWires.some(w => !w.isSlurping);
    xpNodeEl.classList.toggle('rpg-xp-node--locked', hasActiveWire || dragKind !== 'none');

    // Wire visual update (rope physics + SVG redraw + gradient)
    updateWireVisual(nowMs);

    // ── DPS chart update ──────────────────────────────────────────
    const now = Date.now();
    while (dpsWindow.length > 0 && now - dpsWindow[0].t > DPS_WINDOW_MS) {
      dpsWindow.shift();
    }
    const equippedIds = Array.from(ctx.getEffectiveEquippedIds());
    const displaySlots = buildDisplaySlots(equippedIds);
    const slotsKey = displaySlots.join('|');
    if (slotsKey !== lastDpsEquipKey) {
      lastDpsEquipKey = slotsKey;
      rebuildDpsRows(displaySlots);
    }
    if (now - lastDpsDomUpdateMs < DPS_DOM_UPDATE_MS && slotsKey !== '') return;
    lastDpsDomUpdateMs = now;

    const dpsBySlot = new Map<string, number>();
    for (const slotId of displaySlots) dpsBySlot.set(slotId, 0);
    for (const e of dpsWindow) {
      if (dpsBySlot.has(e.weaponId)) {
        dpsBySlot.set(e.weaponId, (dpsBySlot.get(e.weaponId) ?? 0) + e.dmg / (DPS_WINDOW_MS / 1000));
      }
    }
    const dpsValues = displaySlots.map(id => dpsBySlot.get(id) ?? 0);
    const rawMin = dpsValues.length > 0 ? Math.min(...dpsValues) : 0;
    const rawMax = Math.max(1, ...(dpsValues.length > 0 ? dpsValues : [1]));
    dpsAxisMin += (rawMin - dpsAxisMin) * DPS_AXIS_LERP;
    dpsAxisMax += (rawMax - dpsAxisMax) * DPS_AXIS_LERP;
    if (dpsAxisMax <= dpsAxisMin + 0.001) dpsAxisMax = dpsAxisMin + 1;
    dpsAxisLowEl.textContent  = formatDpsAxis(dpsAxisMin);
    dpsAxisHighEl.textContent = formatDpsAxis(dpsAxisMax);
    for (const slotId of displaySlots) {
      const row = dpsChartEl.querySelector<HTMLElement>(`.rpg-dps-row[data-weapon-id="${slotId}"]`);
      const bar = row?.querySelector<HTMLElement>('.rpg-dps-bar');
      if (!bar || !row) continue;
      const dps = dpsBySlot.get(slotId) ?? 0;
      const pct = dps <= 0 ? 0 : Math.max(8, Math.min(100, ((dps - dpsAxisMin) / (dpsAxisMax - dpsAxisMin)) * 100));
      bar.style.width = pct + '%';
      row.title = `${weaponAbbrev(slotId)} ${dps.toFixed(1)} DPS`;
    }
  }

  return {
    element: statsPanel,
    menuButtonContainer: menuArea,
    recordDps,
    withDamageSource,
    update(): void {
      updateStatsPanelDom();
    },
    setDevMode(enabled: boolean): void {
      if (enabled) statsPanel.classList.add('rpg-dev-mode');
      else statsPanel.classList.remove('rpg-dev-mode');
    },
  };
}
