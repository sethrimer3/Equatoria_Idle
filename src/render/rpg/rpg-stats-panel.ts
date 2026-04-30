/**
 * rpg-stats-panel.ts — RPG stats panel, DPS tracker, and XP-wire UI.
 *
 * Owns the DOM elements for the stats panel together with the Verlet-rope
 * XP-wire interaction.
 *
 * Wire mechanic:
 *   - Drag from the XP node to ATK / DEF / LUCK / MAXHP to allocate future XP.
 *   - Tap the XP node while wired to "slurp" the wire back (undo wiring).
 *   - Grab the wire's tip handle and drag it to a different stat to re-attach.
 *
 * Created via `createRpgStatsPanel(ctx)`.  The caller is responsible for
 * appending `handle.element` to the document and calling `handle.update()`
 * each frame.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import {
  formatXp, formatLuckPercent, getEffectiveXpDefBonus,
  getLuckPercent, getEffectiveXpLuckBonus, getEffectiveXpHpBonus,
} from '../../sim/rpg/rpg-state';
import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import { TIER_BY_ID } from '../../data/tiers';
import type { RpgPlayerStats } from './rpg-types';
import { PLAYER_ATK_INIT } from './rpg-constants';

// ── Public API ────────────────────────────────────────────────────────────────

export interface RpgStatsPanelCtx {
  rpgSimState: RpgSimState;
  playerStats: RpgPlayerStats;
  getCurrentWave(): number;
  getEffectiveEquippedIds(): Set<string>;
  onXpWireLock(stat: 'atk' | 'def' | 'luck' | 'hp'): void;
}

export interface RpgStatsPanelHandle {
  element: HTMLElement;
  recordDps(dmg: number, _legacyColor?: string): void;
  withDamageSource<T>(weaponId: string | null, fn: () => T): T;
  update(): void;
}

// ── Wire colour map ───────────────────────────────────────────────────────────

const STAT_WIRE_COLOR: Record<'atk' | 'def' | 'luck' | 'hp', string> = {
  atk:  '#fca5a5', // light red
  def:  '#93c5fd', // light blue
  luck: '#86efac', // light green
  hp:   '#fde68a', // light yellow
};

const SLURP_DURATION_MS = 400;
const BLEED_RATE        = 0.0015; // wireColorBleedT advance per ms (reaches 0.5 in ~333 frames @ 60fps)

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
      dpsWindow.push({ t: Date.now(), dmg, weaponId: activeDamageWeaponId });
    }
  }

  // ── DOM element creation ──────────────────────────────────────────
  const statsPanel = document.createElement('div');
  statsPanel.id = 'rpg-stats-panel';
  statsPanel.style.display = 'none';

  // HP fraction row — sits just to the left of the XP box, outside it
  const hpFractionEl = document.createElement('div');
  hpFractionEl.style.cssText = [
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'gap:2px',
    'flex:0 0 auto',
  ].join(';');
  const hpFractionLabel = document.createElement('span');
  hpFractionLabel.className = 'rpg-stat-label';
  hpFractionLabel.textContent = 'HP';
  const hpFractionValue = document.createElement('span');
  hpFractionValue.className = 'rpg-stat-value rpg-stat-value--hp';
  hpFractionValue.style.fontSize = '13px';
  hpFractionEl.appendChild(hpFractionLabel);
  hpFractionEl.appendChild(hpFractionValue);
  statsPanel.appendChild(hpFractionEl);

  // Player stats box (XP box — ATK / DEF / LUCK / MAXHP + XP node)
  const playerStatsBox = document.createElement('div');
  playerStatsBox.className = 'rpg-player-stats-box';
  // Make the XP box match the DPS box height.
  playerStatsBox.style.alignSelf = 'stretch';

  // XP node — the draggable source at the top of the player stats box
  const xpNodeEl = document.createElement('div');
  xpNodeEl.className = 'rpg-xp-node';
  xpNodeEl.textContent = 'XP';
  xpNodeEl.title = 'Drag to ATK / DEF / LUCK / MAXHP to allocate future XP to that stat. Tap to retract wire.';
  playerStatsBox.appendChild(xpNodeEl);

  // Stats row 1: ATK | DEF
  const playerStatsRow1 = document.createElement('div');
  playerStatsRow1.className = 'rpg-player-stats-row';
  playerStatsBox.appendChild(playerStatsRow1);

  // Stats row 2: MAXHP | LUCK
  const playerStatsRow2 = document.createElement('div');
  playerStatsRow2.className = 'rpg-player-stats-row';
  playerStatsBox.appendChild(playerStatsRow2);

  function makeStatWidget(
    label: string,
    extraClass: string,
    container: HTMLElement,
  ): { root: HTMLElement; labelEl: HTMLSpanElement; valueEl: HTMLSpanElement } {
    const root = document.createElement('div');
    root.className = 'rpg-stat';
    const labelEl = document.createElement('span');
    labelEl.className = 'rpg-stat-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'rpg-stat-value' + (extraClass ? (' ' + extraClass) : '');
    root.appendChild(labelEl);
    root.appendChild(valueEl);
    container.appendChild(root);
    return { root, labelEl, valueEl };
  }

  const atkWidget  = makeStatWidget('ATK',   '', playerStatsRow1);
  const defWidget  = makeStatWidget('DEF',   '', playerStatsRow1);
  const maxHpWidget = makeStatWidget('MAXHP', '', playerStatsRow2);
  const luckWidget  = makeStatWidget('LUCK',  'rpg-stat-value--luck', playerStatsRow2);

  // Apply stat colors inline so they persist regardless of the wired-glow CSS.
  atkWidget.labelEl.style.color  = '#fca5a5';
  atkWidget.valueEl.style.color  = '#fca5a5';
  defWidget.labelEl.style.color  = '#93c5fd';
  defWidget.valueEl.style.color  = '#93c5fd';
  maxHpWidget.labelEl.style.color = '#fde68a';
  maxHpWidget.valueEl.style.color = '#fde68a';
  maxHpWidget.valueEl.style.fontSize = '14px';
  luckWidget.labelEl.style.color  = '#86efac';
  luckWidget.valueEl.style.color  = '#86efac';

  // Sub-texts under ATK and DEF (base value + allocated XP counter)
  const atkBaseEl  = document.createElement('span');
  atkBaseEl.className = 'rpg-stat-sub rpg-stat-sub--base';
  atkWidget.root.appendChild(atkBaseEl);
  const atkAllocEl = document.createElement('span');
  atkAllocEl.className = 'rpg-stat-sub rpg-stat-sub--alloc';
  atkWidget.root.appendChild(atkAllocEl);

  const defBaseEl  = document.createElement('span');
  defBaseEl.className = 'rpg-stat-sub rpg-stat-sub--base';
  defWidget.root.appendChild(defBaseEl);
  const defAllocEl = document.createElement('span');
  defAllocEl.className = 'rpg-stat-sub rpg-stat-sub--alloc';
  defWidget.root.appendChild(defAllocEl);

  const maxHpAllocEl = document.createElement('span');
  maxHpAllocEl.className = 'rpg-stat-sub rpg-stat-sub--alloc';
  maxHpWidget.root.appendChild(maxHpAllocEl);

  const luckAllocEl = document.createElement('span');
  luckAllocEl.className = 'rpg-stat-sub rpg-stat-sub--alloc';
  luckWidget.root.appendChild(luckAllocEl);

  statsPanel.appendChild(playerStatsBox);

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
  statsPanel.appendChild(dpsWidget);

  // ── Wire SVG overlay (sits above all panel content) ───────────────
  const wireSvgNS = 'http://www.w3.org/2000/svg';
  const wireSvg = document.createElementNS(wireSvgNS, 'svg') as SVGSVGElement;
  wireSvg.setAttribute('class', 'rpg-wire-svg');
  wireSvg.setAttribute('aria-hidden', 'true');

  // Gradient definition for wire colour bleed
  const wireDefs = document.createElementNS(wireSvgNS, 'defs') as SVGDefsElement;
  const wireGrad = document.createElementNS(wireSvgNS, 'linearGradient') as SVGLinearGradientElement;
  wireGrad.setAttribute('id', 'rpg-wire-gradient');
  wireGrad.setAttribute('gradientUnits', 'userSpaceOnUse');
  const gradStop0 = document.createElementNS(wireSvgNS, 'stop') as SVGStopElement;
  gradStop0.setAttribute('offset', '0%');
  gradStop0.setAttribute('stop-color', '#a78bfa'); // XP purple (always at XP end)
  const gradStop1 = document.createElementNS(wireSvgNS, 'stop') as SVGStopElement;
  gradStop1.setAttribute('offset', '100%');         // transition midpoint (bleeds inward)
  gradStop1.setAttribute('stop-color', '#a78bfa');
  const gradStop2 = document.createElementNS(wireSvgNS, 'stop') as SVGStopElement;
  gradStop2.setAttribute('offset', '100%');
  gradStop2.setAttribute('stop-color', '#a78bfa'); // stat color (always at stat end)
  wireGrad.appendChild(gradStop0);
  wireGrad.appendChild(gradStop1);
  wireGrad.appendChild(gradStop2);
  wireDefs.appendChild(wireGrad);
  wireSvg.appendChild(wireDefs);

  const wirePolyline = document.createElementNS(wireSvgNS, 'polyline') as SVGPolylineElement;
  wirePolyline.setAttribute('class', 'rpg-wire-rope');
  wirePolyline.setAttribute('fill', 'none');
  wirePolyline.setAttribute('stroke', 'url(#rpg-wire-gradient)');
  wirePolyline.setAttribute('stroke-width', '2');
  wirePolyline.setAttribute('stroke-linecap', 'round');
  wirePolyline.setAttribute('stroke-linejoin', 'round');
  wirePolyline.style.display = 'none';
  wireSvg.appendChild(wirePolyline);
  statsPanel.appendChild(wireSvg);

  // Invisible wire-tip drag handle (positioned over the locked rope tip)
  const wireTipHandle = document.createElement('div');
  wireTipHandle.style.cssText = [
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
  statsPanel.appendChild(wireTipHandle);

  // ── Verlet rope state ─────────────────────────────────────────────
  const ROPE_N       = 12;
  const ROPE_GRAVITY = 0.35;
  const ROPE_DAMPING = 0.97;
  const ROPE_ITERS   = 5;
  const ROPE_SLACK   = 1.25;

  interface RopeNode { x: number; y: number; px: number; py: number; }
  let ropeNodes: RopeNode[] = [];
  let ropeSegLen = 1;

  function initRope(x0: number, y0: number, x1: number, y1: number): void {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    ropeSegLen = (dist * ROPE_SLACK) / (ROPE_N - 1);
    ropeNodes = [];
    for (let i = 0; i < ROPE_N; i++) {
      const t = i / (ROPE_N - 1);
      ropeNodes.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t,
                       px: x0 + (x1 - x0) * t, py: y0 + (y1 - y0) * t });
    }
  }

  function updateRope(x0: number, y0: number, x1: number, y1: number): void {
    if (ropeNodes.length !== ROPE_N) { initRope(x0, y0, x1, y1); return; }
    for (let i = 1; i < ROPE_N - 1; i++) {
      const n = ropeNodes[i];
      const vx = (n.x - n.px) * ROPE_DAMPING;
      const vy = (n.y - n.py) * ROPE_DAMPING;
      n.px = n.x; n.py = n.y;
      n.x += vx; n.y += vy + ROPE_GRAVITY;
    }
    const a = ropeNodes[0];
    a.x = x0; a.y = y0; a.px = x0; a.py = y0;
    const b = ropeNodes[ROPE_N - 1];
    b.x = x1; b.y = y1; b.px = x1; b.py = y1;
    for (let iter = 0; iter < ROPE_ITERS; iter++) {
      for (let i = 0; i < ROPE_N - 1; i++) {
        const na = ropeNodes[i], nb = ropeNodes[i + 1];
        const dx = nb.x - na.x, dy = nb.y - na.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.001) continue;
        const diff = ((dist - ropeSegLen) / dist) * 0.5;
        const cx = dx * diff, cy = dy * diff;
        if (i > 0)           { na.x += cx; na.y += cy; }
        if (i < ROPE_N - 2)  { nb.x -= cx; nb.y -= cy; }
      }
    }
  }

  // ── Wire drag / lock state ────────────────────────────────────────
  type WireState = 'idle' | 'dragging' | 'locked' | 'dragging-end' | 'slurping';
  let wireState: WireState = rpgSimState.xpAllocatedStat ? 'locked' : 'idle';
  let wireDragClientX = 0;
  let wireDragClientY = 0;
  let slurpMs = 0;           // elapsed ms in slurp animation
  let slurpFromX = 0;        // stat centre x at slurp start
  let slurpFromY = 0;        // stat centre y at slurp start
  let wireColorBleedT = rpgSimState.xpAllocatedStat ? 0.5 : 0; // gradient bleed progress
  let lastFrameTime = 0;     // for delta-time on gradient lerp

  function toPanelCoords(clientX: number, clientY: number): { x: number; y: number } {
    const r = statsPanel.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  function elementCentreInPanel(el: HTMLElement): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    const p = statsPanel.getBoundingClientRect();
    return { x: r.left + r.width / 2 - p.left, y: r.top + r.height / 2 - p.top };
  }

  function lockedStatRoot(): HTMLElement | null {
    const s = rpgSimState.xpAllocatedStat;
    if (s === 'atk')  return atkWidget.root;
    if (s === 'def')  return defWidget.root;
    if (s === 'luck') return luckWidget.root;
    if (s === 'hp')   return maxHpWidget.root;
    return null;
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

  function startSlurp(): void {
    if (ropeNodes.length > 0) {
      slurpFromX = ropeNodes[ROPE_N - 1].x;
      slurpFromY = ropeNodes[ROPE_N - 1].y;
    } else {
      const target = lockedStatRoot();
      const sc = target ? elementCentreInPanel(target) : { x: 0, y: 0 };
      slurpFromX = sc.x; slurpFromY = sc.y;
    }
    slurpMs = 0;
    wireState = 'slurping';
  }

  function lockToStat(stat: 'atk' | 'def' | 'luck' | 'hp'): void {
    rpgSimState.xpAllocatedStat = stat;
    wireColorBleedT = 0;
    wireState = 'locked';
    ctx.onXpWireLock(stat);
    const target = lockedStatRoot()!;
    const xpC   = elementCentreInPanel(xpNodeEl);
    const statC = elementCentreInPanel(target);
    initRope(xpC.x, xpC.y, statC.x, statC.y);
  }

  // ── XP node events (drag to stat, or tap to retract) ─────────────
  let xpTapStartX = 0, xpTapStartY = 0, xpTapMoved = false;

  xpNodeEl.addEventListener('pointerdown', (e: PointerEvent) => {
    e.stopPropagation();
    if (wireState === 'locked') {
      // Start tap tracking — move will cancel tap
      xpTapStartX = e.clientX; xpTapStartY = e.clientY; xpTapMoved = false;
      xpNodeEl.setPointerCapture(e.pointerId);
      return;
    }
    if (wireState !== 'idle') return;
    wireState = 'dragging';
    wireDragClientX = e.clientX;
    wireDragClientY = e.clientY;
    const xpC = elementCentreInPanel(xpNodeEl);
    const dragP = toPanelCoords(e.clientX, e.clientY);
    initRope(xpC.x, xpC.y, dragP.x, dragP.y);
    xpNodeEl.setPointerCapture(e.pointerId);
  }, { passive: true });

  xpNodeEl.addEventListener('pointermove', (e: PointerEvent) => {
    if (wireState === 'locked') {
      if (Math.hypot(e.clientX - xpTapStartX, e.clientY - xpTapStartY) > 6) {
        xpTapMoved = true;
      }
      return;
    }
    if (wireState !== 'dragging') return;
    wireDragClientX = e.clientX;
    wireDragClientY = e.clientY;
  }, { passive: true });

  xpNodeEl.addEventListener('pointerup', (e: PointerEvent) => {
    if (wireState === 'locked') {
      // Tap without drag → slurp retract
      if (!xpTapMoved) {
        startSlurp();
      }
      return;
    }
    if (wireState !== 'dragging') return;
    const stat = landedStat(e.clientX, e.clientY);
    if (stat) {
      lockToStat(stat);
    } else {
      wireState = 'idle';
      ropeNodes = [];
    }
  }, { passive: true });

  xpNodeEl.addEventListener('pointercancel', () => {
    if (wireState === 'dragging') { wireState = 'idle'; ropeNodes = []; }
    xpTapMoved = true; // cancel any pending tap
  }, { passive: true });

  // ── Wire-tip drag handle events ───────────────────────────────────
  wireTipHandle.addEventListener('pointerdown', (e: PointerEvent) => {
    if (wireState !== 'locked') return;
    e.stopPropagation();
    wireState = 'dragging-end';
    wireDragClientX = e.clientX;
    wireDragClientY = e.clientY;
    wireTipHandle.setPointerCapture(e.pointerId);
  }, { passive: true });

  wireTipHandle.addEventListener('pointermove', (e: PointerEvent) => {
    if (wireState !== 'dragging-end') return;
    wireDragClientX = e.clientX;
    wireDragClientY = e.clientY;
  }, { passive: true });

  wireTipHandle.addEventListener('pointerup', (e: PointerEvent) => {
    if (wireState !== 'dragging-end') return;
    const stat = landedStat(e.clientX, e.clientY);
    if (stat) {
      lockToStat(stat);
    } else {
      startSlurp();
    }
  }, { passive: true });

  wireTipHandle.addEventListener('pointercancel', () => {
    if (wireState === 'dragging-end') startSlurp();
  }, { passive: true });

  // ── Wire rendering (called each frame from updateStatsPanelDom) ───
  function updateWireVisual(nowMs: number): void {
    const deltaMs = lastFrameTime > 0 ? Math.min(nowMs - lastFrameTime, 100) : 16;
    lastFrameTime = nowMs;

    // Handle slurp animation
    if (wireState === 'slurping') {
      slurpMs += deltaMs;
      const t = Math.min(slurpMs / SLURP_DURATION_MS, 1);
      // ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3);
      const xpC = elementCentreInPanel(xpNodeEl);
      const tipX = slurpFromX + (xpC.x - slurpFromX) * ease;
      const tipY = slurpFromY + (xpC.y - slurpFromY) * ease;
      updateRope(xpC.x, xpC.y, tipX, tipY);
      if (t >= 1) {
        // Animation complete — unlock
        rpgSimState.xpAllocatedStat = null;
        wireState = 'idle';
        ropeNodes = [];
        wireColorBleedT = 0;
      }
    }

    if (wireState === 'idle') {
      wirePolyline.style.display = 'none';
      wireTipHandle.style.display = 'none';
      return;
    }

    // Sync SVG viewport to panel size
    const panelW = statsPanel.clientWidth;
    const panelH = statsPanel.clientHeight;
    wireSvg.setAttribute('viewBox', `0 0 ${panelW} ${panelH}`);

    const xpC = elementCentreInPanel(xpNodeEl);
    let tipX: number, tipY: number;

    if (wireState === 'dragging') {
      const p = toPanelCoords(wireDragClientX, wireDragClientY);
      tipX = p.x; tipY = p.y;
    } else if (wireState === 'dragging-end') {
      const p = toPanelCoords(wireDragClientX, wireDragClientY);
      tipX = p.x; tipY = p.y;
    } else if (wireState === 'locked') {
      const target = lockedStatRoot();
      if (!target) { wirePolyline.style.display = 'none'; wireTipHandle.style.display = 'none'; return; }
      const statC = elementCentreInPanel(target);
      tipX = statC.x; tipY = statC.y;
    } else {
      // slurping — tip was already set above
      if (ropeNodes.length < ROPE_N) {
        wirePolyline.style.display = 'none'; wireTipHandle.style.display = 'none'; return;
      }
      tipX = ropeNodes[ROPE_N - 1].x;
      tipY = ropeNodes[ROPE_N - 1].y;
    }

    if (wireState !== 'slurping') {
      updateRope(xpC.x, xpC.y, tipX, tipY);
    }

    if (ropeNodes.length < ROPE_N) {
      wirePolyline.style.display = 'none'; wireTipHandle.style.display = 'none'; return;
    }

    const pts = ropeNodes.map(n => `${n.x.toFixed(1)},${n.y.toFixed(1)}`).join(' ');
    wirePolyline.setAttribute('points', pts);
    wirePolyline.style.display = '';

    // Update gradient direction to match rope endpoints
    const r0 = ropeNodes[0];
    const r1 = ropeNodes[ROPE_N - 1];
    wireGrad.setAttribute('x1', r0.x.toFixed(1));
    wireGrad.setAttribute('y1', r0.y.toFixed(1));
    wireGrad.setAttribute('x2', r1.x.toFixed(1));
    wireGrad.setAttribute('y2', r1.y.toFixed(1));

    // Determine stat colour for the bleed
    let statColor = '#a78bfa';
    if (wireState === 'locked' || wireState === 'dragging-end' || wireState === 'slurping') {
      const s = rpgSimState.xpAllocatedStat;
      if (s) statColor = STAT_WIRE_COLOR[s];
    }

    // Advance colour bleed when locked (toward equilibrium at 0.5)
    if (wireState === 'locked') {
      wireColorBleedT = Math.min(0.5, wireColorBleedT + BLEED_RATE * deltaMs);
    }

    // Update gradient stops:
    //   stop0 at 0%  = purple (XP end always purple)
    //   stop1 at (1-bleedT)*100% = purple (where colour starts bleeding in)
    //   stop2 at 100% = stat colour
    const bleedPct = ((1 - wireColorBleedT) * 100).toFixed(1);
    gradStop0.setAttribute('stop-color', '#a78bfa');
    gradStop1.setAttribute('offset', bleedPct + '%');
    gradStop1.setAttribute('stop-color', '#a78bfa');
    gradStop2.setAttribute('stop-color', statColor);

    // Tip handle position — only visible while locked or dragging-end
    if (wireState === 'locked') {
      wireTipHandle.style.display = 'block';
      wireTipHandle.style.left = r1.x.toFixed(1) + 'px';
      wireTipHandle.style.top  = r1.y.toFixed(1) + 'px';
    } else {
      wireTipHandle.style.display = 'none';
    }
  }

  function weaponAbbrev(weaponId: string): string {
    const tierId = WEAPON_BY_ID.get(weaponId)?.costTierId ?? 'sand';
    return tierId.slice(0, 3).toUpperCase();
  }

  function weaponColor(weaponId: string): string {
    const tierId = WEAPON_BY_ID.get(weaponId)?.costTierId;
    return (tierId ? TIER_BY_ID.get(tierId)?.color : null) ?? '#ffd764';
  }

  function formatDpsAxis(value: number): string {
    return value >= 1000 ? formatXp(value) : Math.round(value).toString();
  }

  function rebuildDpsRows(equippedIds: string[]): void {
    dpsChartEl.textContent = '';
    dpsLabelEl.textContent = equippedIds.length > 0 ? '' : 'DPS';
    dpsValueEl.textContent = '';
    dpsAxisEl.hidden = equippedIds.length === 0;
    for (const weaponId of equippedIds) {
      const row = document.createElement('div');
      row.className = 'rpg-dps-row';
      row.dataset.weaponId = weaponId;
      const label = document.createElement('span');
      label.className = 'rpg-dps-label';
      label.textContent = weaponAbbrev(weaponId);
      const track = document.createElement('div');
      track.className = 'rpg-dps-track';
      const bar = document.createElement('div');
      bar.className = 'rpg-dps-bar';
      bar.style.background = weaponColor(weaponId);
      track.appendChild(bar);
      row.appendChild(label);
      row.appendChild(track);
      dpsChartEl.appendChild(row);
    }
  }

  function updateStatsPanelDom(): void {
    const nowMs = performance.now();

    // HP fraction (outside the box)
    hpFractionValue.textContent = Math.max(0, Math.ceil(playerStats.hp)) + ' / ' + playerStats.maxHp;

    // XP node label
    xpNodeEl.textContent = 'XP  ' + formatXp(rpgSimState.xp);

    // ATK
    atkWidget.valueEl.textContent = String(playerStats.atk);
    atkBaseEl.textContent  = '(' + PLAYER_ATK_INIT + ')';
    atkAllocEl.textContent = rpgSimState.xpAllocatedToAtk > 0
      ? formatXp(rpgSimState.xpAllocatedToAtk) + ' xp' : '';

    // DEF
    defWidget.valueEl.textContent = String(playerStats.def);
    const defXpContrib = getEffectiveXpDefBonus(rpgSimState);
    const baseDef = playerStats.def - defXpContrib;
    defBaseEl.textContent  = '(' + baseDef + ')';
    defAllocEl.textContent = rpgSimState.xpAllocatedToDef > 0
      ? formatXp(rpgSimState.xpAllocatedToDef) + ' xp' : '';

    // MAXHP
    maxHpWidget.valueEl.textContent = String(playerStats.maxHp);
    const hpBonus = getEffectiveXpHpBonus(rpgSimState);
    maxHpAllocEl.textContent = hpBonus > 0
      ? '+' + hpBonus + ' bonus' : (rpgSimState.xpAllocatedToHp > 0 ? formatXp(rpgSimState.xpAllocatedToHp) + ' xp' : '');

    // LUCK — display the full effective luck (base + bonus), may exceed 100%
    const baseLuck = getLuckPercent(rpgSimState.xp);
    const luckBonus = getEffectiveXpLuckBonus(rpgSimState);
    const totalLuck = baseLuck + luckBonus;
    luckWidget.valueEl.textContent = formatLuckPercent(totalLuck);
    luckAllocEl.textContent = rpgSimState.xpAllocatedToLuck > 0
      ? formatXp(rpgSimState.xpAllocatedToLuck) + ' xp' : '';

    // Glow on the wired stat widget
    atkWidget.root.classList.toggle('rpg-stat--wired',    rpgSimState.xpAllocatedStat === 'atk');
    defWidget.root.classList.toggle('rpg-stat--wired',    rpgSimState.xpAllocatedStat === 'def');
    luckWidget.root.classList.toggle('rpg-stat--wired',   rpgSimState.xpAllocatedStat === 'luck');
    maxHpWidget.root.classList.toggle('rpg-stat--wired',  rpgSimState.xpAllocatedStat === 'hp');

    // XP node locked indicator
    xpNodeEl.classList.toggle('rpg-xp-node--locked', wireState === 'locked' || wireState === 'slurping' || wireState === 'dragging-end');

    // Wire visual update (rope physics + SVG redraw + gradient)
    updateWireVisual(nowMs);

    // ── DPS chart update ──────────────────────────────────────────
    const now = Date.now();
    while (dpsWindow.length > 0 && now - dpsWindow[0].t > DPS_WINDOW_MS) {
      dpsWindow.shift();
    }
    const equippedIds = Array.from(ctx.getEffectiveEquippedIds());
    const equipKey = equippedIds.join('|');
    if (equipKey !== lastDpsEquipKey) {
      lastDpsEquipKey = equipKey;
      rebuildDpsRows(equippedIds);
    }
    if (now - lastDpsDomUpdateMs < DPS_DOM_UPDATE_MS && equipKey !== '') return;
    lastDpsDomUpdateMs = now;

    const dpsByWeapon = new Map<string, number>();
    for (const weaponId of equippedIds) dpsByWeapon.set(weaponId, 0);
    for (const e of dpsWindow) {
      if (dpsByWeapon.has(e.weaponId)) {
        dpsByWeapon.set(e.weaponId, (dpsByWeapon.get(e.weaponId) ?? 0) + e.dmg / (DPS_WINDOW_MS / 1000));
      }
    }
    const dpsValues = equippedIds.map(id => dpsByWeapon.get(id) ?? 0);
    const rawMin = dpsValues.length > 0 ? Math.min(...dpsValues) : 0;
    const rawMax = Math.max(1, ...(dpsValues.length > 0 ? dpsValues : [1]));
    dpsAxisMin += (rawMin - dpsAxisMin) * DPS_AXIS_LERP;
    dpsAxisMax += (rawMax - dpsAxisMax) * DPS_AXIS_LERP;
    if (dpsAxisMax <= dpsAxisMin + 0.001) dpsAxisMax = dpsAxisMin + 1;
    dpsAxisLowEl.textContent  = formatDpsAxis(dpsAxisMin);
    dpsAxisHighEl.textContent = formatDpsAxis(dpsAxisMax);
    for (const weaponId of equippedIds) {
      const row = dpsChartEl.querySelector<HTMLElement>(`.rpg-dps-row[data-weapon-id="${weaponId}"]`);
      const bar = row?.querySelector<HTMLElement>('.rpg-dps-bar');
      if (!bar || !row) continue;
      const dps = dpsByWeapon.get(weaponId) ?? 0;
      const pct = dps <= 0 ? 0 : Math.max(8, Math.min(100, ((dps - dpsAxisMin) / (dpsAxisMax - dpsAxisMin)) * 100));
      bar.style.width = pct + '%';
      row.title = `${weaponAbbrev(weaponId)} ${dps.toFixed(1)} DPS`;
    }
  }

  return {
    element: statsPanel,
    recordDps,
    withDamageSource,
    update(): void {
      updateStatsPanelDom();
    },
  };
}
