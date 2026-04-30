/**
 * rpg-stats-panel.ts — RPG stats panel, DPS tracker, and XP-wire UI.
 *
 * Owns the DOM elements for the stats panel (HP / ATK / DEF / WAVE / BOOST /
 * LUCK / DPS) together with the Verlet-rope XP-wire interaction.
 *
 * Created via `createRpgStatsPanel(ctx)`.  The caller is responsible for
 * appending `handle.element` to the document and calling `handle.update()`
 * each frame.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { formatXp, formatLuckPercent, getEffectiveXpDefBonus } from '../../sim/rpg/rpg-state';
import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import { TIER_BY_ID } from '../../data/tiers';
import type { RpgPlayerStats } from './rpg-types';
import { BOSS_GLYPH_LABEL, BOSS_NAMES, PLAYER_ATK_INIT } from './rpg-constants';

// ── Public API ────────────────────────────────────────────────────────────────

export interface RpgStatsPanelCtx {
  rpgSimState: RpgSimState;
  playerStats: RpgPlayerStats;
  getCurrentWave(): number;
  getEffectiveEquippedIds(): Set<string>;
  onXpWireLock(stat: 'atk' | 'def'): void;
}

export interface RpgStatsPanelHandle {
  element: HTMLElement;
  recordDps(dmg: number, _legacyColor?: string): void;
  withDamageSource<T>(weaponId: string | null, fn: () => T): T;
  update(): void;
}

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

  // Player stats box (HP / ATK / DEF grouped with XP node at top)
  const playerStatsBox = document.createElement('div');
  playerStatsBox.className = 'rpg-player-stats-box';

  // XP node — the draggable source at the top of the player stats box
  const xpNodeEl = document.createElement('div');
  xpNodeEl.className = 'rpg-xp-node';
  xpNodeEl.textContent = 'XP';
  xpNodeEl.title = 'Drag to ATK or DEF to allocate future XP to that stat';
  playerStatsBox.appendChild(xpNodeEl);

  // Stats row within the box
  const playerStatsRow = document.createElement('div');
  playerStatsRow.className = 'rpg-player-stats-row';
  playerStatsBox.appendChild(playerStatsRow);

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

  const hpWidget  = makeStatWidget('HP',  'rpg-stat-value--hp', playerStatsRow);
  const atkWidget = makeStatWidget('ATK', '',                   playerStatsRow);
  const defWidget = makeStatWidget('DEF', '',                   playerStatsRow);

  // Sub-texts under ATK and DEF: base value (no XP) + allocated XP counter
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

  statsPanel.appendChild(playerStatsBox);

  // Remaining stat widgets appended directly to the panel
  const waveWidget  = makeStatWidget('WAVE',  'rpg-stat-value--wave',  statsPanel);
  const boostWidget = makeStatWidget('BOOST', 'rpg-stat-value--boost', statsPanel);
  const luckWidget  = makeStatWidget('LUCK',  'rpg-stat-value--luck',  statsPanel);

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
  const wirePolyline = document.createElementNS(wireSvgNS, 'polyline') as SVGPolylineElement;
  wirePolyline.setAttribute('class', 'rpg-wire-rope');
  wirePolyline.setAttribute('fill', 'none');
  wirePolyline.setAttribute('stroke', '#a78bfa');
  wirePolyline.setAttribute('stroke-width', '2');
  wirePolyline.setAttribute('stroke-linecap', 'round');
  wirePolyline.setAttribute('stroke-linejoin', 'round');
  wirePolyline.style.display = 'none';
  wireSvg.appendChild(wirePolyline);
  statsPanel.appendChild(wireSvg);

  // ── Verlet rope state ─────────────────────────────────────────────
  const ROPE_N         = 12;   // number of nodes
  const ROPE_GRAVITY   = 0.35; // px added to vy per frame (gravity acceleration)
  const ROPE_DAMPING   = 0.97; // velocity retention per frame
  const ROPE_ITERS     = 5;    // constraint relaxation iterations per frame
  const ROPE_SLACK     = 1.25; // rest length = slack × euclidean-distance / (N-1)

  interface RopeNode { x: number; y: number; px: number; py: number; }
  let ropeNodes: RopeNode[] = [];
  let ropeSegLen = 1;

  function initRope(x0: number, y0: number, x1: number, y1: number): void {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    ropeSegLen = (dist * ROPE_SLACK) / (ROPE_N - 1);
    ropeNodes = [];
    for (let i = 0; i < ROPE_N; i++) {
      const t = i / (ROPE_N - 1);
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      ropeNodes.push({ x, y, px: x, py: y });
    }
  }

  function updateRope(x0: number, y0: number, x1: number, y1: number): void {
    if (ropeNodes.length !== ROPE_N) { initRope(x0, y0, x1, y1); return; }

    // Verlet integration (interior nodes only)
    for (let i = 1; i < ROPE_N - 1; i++) {
      const n = ropeNodes[i];
      const vx = (n.x - n.px) * ROPE_DAMPING;
      const vy = (n.y - n.py) * ROPE_DAMPING;
      n.px = n.x; n.py = n.y;
      n.x += vx;
      n.y += vy + ROPE_GRAVITY;
    }

    // Pin endpoints
    const a = ropeNodes[0];
    a.x = x0; a.y = y0; a.px = x0; a.py = y0;
    const b = ropeNodes[ROPE_N - 1];
    b.x = x1; b.y = y1; b.px = x1; b.py = y1;

    // Constraint relaxation
    for (let iter = 0; iter < ROPE_ITERS; iter++) {
      for (let i = 0; i < ROPE_N - 1; i++) {
        const na = ropeNodes[i];
        const nb = ropeNodes[i + 1];
        const dx = nb.x - na.x;
        const dy = nb.y - na.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.001) continue;
        const diff = ((dist - ropeSegLen) / dist) * 0.5;
        const cx = dx * diff;
        const cy = dy * diff;
        if (i > 0)            { na.x += cx; na.y += cy; }
        if (i < ROPE_N - 2)   { nb.x -= cx; nb.y -= cy; }
      }
    }
  }

  // ── Wire drag / lock state ────────────────────────────────────────
  type WireState = 'idle' | 'dragging' | 'locked';
  let wireState: WireState = rpgSimState.xpAllocatedStat ? 'locked' : 'idle';
  let wireDragClientX = 0;
  let wireDragClientY = 0;

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
    if (rpgSimState.xpAllocatedStat === 'atk') return atkWidget.root;
    if (rpgSimState.xpAllocatedStat === 'def') return defWidget.root;
    return null;
  }

  function pointerOverElement(el: HTMLElement, clientX: number, clientY: number): boolean {
    const r = el.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }

  // Pointer events for drag-to-wire (XP node has pointer-events: auto via CSS)
  xpNodeEl.addEventListener('pointerdown', (e: PointerEvent) => {
    if (wireState === 'locked') return;
    e.stopPropagation();
    wireState = 'dragging';
    wireDragClientX = e.clientX;
    wireDragClientY = e.clientY;
    const xpC = elementCentreInPanel(xpNodeEl);
    const dragP = toPanelCoords(e.clientX, e.clientY);
    initRope(xpC.x, xpC.y, dragP.x, dragP.y);
    xpNodeEl.setPointerCapture(e.pointerId);
  }, { passive: true });

  xpNodeEl.addEventListener('pointermove', (e: PointerEvent) => {
    if (wireState !== 'dragging') return;
    wireDragClientX = e.clientX;
    wireDragClientY = e.clientY;
  }, { passive: true });

  xpNodeEl.addEventListener('pointerup', (e: PointerEvent) => {
    if (wireState !== 'dragging') return;
    let landed: 'atk' | 'def' | null = null;
    if (pointerOverElement(atkWidget.root, e.clientX, e.clientY)) landed = 'atk';
    else if (pointerOverElement(defWidget.root, e.clientX, e.clientY)) landed = 'def';

    if (landed) {
      // Lock the wire permanently; seed the per-stat counter before notifying
      // the caller so applyEquipmentStats sees the updated allocation.
      rpgSimState.xpAllocatedStat = landed;
      wireState = 'locked';
      ctx.onXpWireLock(landed);
      const target = lockedStatRoot()!;
      const xpC   = elementCentreInPanel(xpNodeEl);
      const statC = elementCentreInPanel(target);
      initRope(xpC.x, xpC.y, statC.x, statC.y);
    } else {
      wireState = 'idle';
      ropeNodes = [];
    }
  }, { passive: true });

  xpNodeEl.addEventListener('pointercancel', () => {
    if (wireState === 'dragging') { wireState = 'idle'; ropeNodes = []; }
  }, { passive: true });

  // ── Wire rendering (called each frame from updateStatsPanelDom) ───
  function updateWireVisual(): void {
    if (wireState === 'idle') {
      wirePolyline.style.display = 'none';
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
    } else {
      // locked — tip is the centre of the wired stat
      const target = lockedStatRoot();
      if (!target) { wirePolyline.style.display = 'none'; return; }
      const statC = elementCentreInPanel(target);
      tipX = statC.x; tipY = statC.y;
    }

    updateRope(xpC.x, xpC.y, tipX, tipY);

    const pts = ropeNodes.map(n => `${n.x.toFixed(1)},${n.y.toFixed(1)}`).join(' ');
    wirePolyline.setAttribute('points', pts);
    wirePolyline.style.display = '';

    // Pulse the stroke colour: dragging = neutral purple, locked = stat colour
    if (wireState === 'locked') {
      const colour = rpgSimState.xpAllocatedStat === 'atk' ? '#c4b5fd' : '#67e8f9';
      wirePolyline.setAttribute('stroke', colour);
    } else {
      wirePolyline.setAttribute('stroke', '#a78bfa');
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
    hpWidget.valueEl.textContent   = Math.max(0, Math.ceil(playerStats.hp)) + ' / ' + playerStats.maxHp;
    atkWidget.valueEl.textContent  = String(playerStats.atk);
    defWidget.valueEl.textContent  = String(playerStats.def);

    // XP node label — always shows total XP
    xpNodeEl.textContent = 'XP  ' + formatXp(rpgSimState.xp);

    // Sub-texts: base stat (no XP bonus) + per-stat allocated XP counter
    const baseAtk = PLAYER_ATK_INIT;
    atkBaseEl.textContent  = '(' + baseAtk + ')';
    atkAllocEl.textContent = rpgSimState.xpAllocatedToAtk > 0
      ? formatXp(rpgSimState.xpAllocatedToAtk) + ' xp'
      : '';

    // Base DEF = current DEF minus the XP contribution
    const defXpContrib = getEffectiveXpDefBonus(rpgSimState);
    const baseDef = playerStats.def - defXpContrib;
    defBaseEl.textContent  = '(' + baseDef + ')';
    defAllocEl.textContent = rpgSimState.xpAllocatedToDef > 0
      ? formatXp(rpgSimState.xpAllocatedToDef) + ' xp'
      : '';

    // Glow on the wired stat widget
    const isAtkWired = rpgSimState.xpAllocatedStat === 'atk';
    const isDefWired = rpgSimState.xpAllocatedStat === 'def';
    atkWidget.root.classList.toggle('rpg-stat--wired', isAtkWired);
    defWidget.root.classList.toggle('rpg-stat--wired', isDefWired);

    // XP node: show locked indicator once wired
    xpNodeEl.classList.toggle('rpg-xp-node--locked', wireState === 'locked');

    const currentWave = ctx.getCurrentWave();
    const isBossWave = currentWave > 0 && currentWave % 100 === 0;
    waveWidget.labelEl.textContent = isBossWave ? BOSS_GLYPH_LABEL : 'WAVE';
    if (isBossWave) {
      waveWidget.labelEl.style.fontFamily = 'monospace';
    } else {
      waveWidget.labelEl.style.removeProperty('fontFamily');
    }
    waveWidget.valueEl.textContent = isBossWave ? String(Math.ceil(currentWave / 100)) : String(currentWave);
    if (isBossWave) {
      const rawBossId = Math.ceil(currentWave / 100);
      const bossId = ((rawBossId - 1) % 12) + 1;
      waveWidget.valueEl.title = BOSS_NAMES[bossId] ?? 'Boss';
    } else {
      waveWidget.valueEl.title = '';
    }
    boostWidget.valueEl.textContent = rpgSimState.highestWaveReached > 0
      ? '+' + Math.pow(rpgSimState.highestWaveReached, 1.2).toFixed(1) + '%'
      : '+0.0%';
    luckWidget.valueEl.textContent = formatLuckPercent(rpgSimState.xp);

    // Wire visual update (rope physics + SVG redraw)
    updateWireVisual();

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
    dpsAxisLowEl.textContent = formatDpsAxis(dpsAxisMin);
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
