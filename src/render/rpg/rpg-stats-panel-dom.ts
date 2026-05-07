/**
 * rpg-stats-panel-dom.ts — DOM element construction for the RPG stats panel.
 *
 * Builds every HTML element in the stats panel (player icon, XP column,
 * weapon rows, DPS chart, HP box, menu area, dev-mode badges) and starts
 * the player-icon idle animation RAF loop.
 *
 * All element references required by the update/logic layer are returned in
 * `StatsPanelDomRefs`.  Logic, state, DPS tracking, and equip-wiring
 * registration remain in rpg-stats-panel.ts.
 *
 * Called once via `buildStatsPanelDom()` from `createRpgStatsPanel`.
 */

import { GLOW_PULSE_SPEED, RPG_MOTE_COLOR, RPG_MOTE_GLOW } from './rpg-constants';

// ── Return type ───────────────────────────────────────────────────────────────

/** All live element references the stats-panel logic layer needs. */
export interface StatsPanelDomRefs {
  // Root element
  statsPanel: HTMLDivElement;

  // Menu button mount point (exposed as menuButtonContainer)
  menuArea: HTMLElement;

  // XP node amount text
  xpAmountEl: HTMLSpanElement;

  // HP box value elements
  hpFractionValue: HTMLSpanElement;
  regValue: HTMLSpanElement;
  defValue: HTMLSpanElement;

  // Weapon row data spans [row 0–4][col 0–4]
  weaponRowSpans: HTMLSpanElement[][];
  // Weapon row plug circle elements [row 0–4][col 0–4]
  weaponRowPlugEls: HTMLSpanElement[][];

  // Box 1 — weapon source output plugs (5 total)
  weaponSourcePlugEls: HTMLDivElement[];

  // Box 2 — XP node output plug
  xpOutPlugEl: HTMLDivElement;

  // Boxes 3–5 — modifier XP-in and output plugs
  mod1XpIn: HTMLDivElement; mod1Out: HTMLDivElement;
  mod2XpIn: HTMLDivElement; mod2Out: HTMLDivElement;
  mod3XpIn: HTMLDivElement; mod3Out: HTMLDivElement;

  // DPS chart elements
  dpsLabelEl: HTMLSpanElement;
  dpsValueEl: HTMLSpanElement;
  dpsChartEl: HTMLDivElement;
  dpsAxisEl: HTMLDivElement;
  dpsAxisLowEl: HTMLSpanElement;
  dpsAxisHighEl: HTMLSpanElement;
}

// ── DOM builder ───────────────────────────────────────────────────────────────

/**
 * Creates and assembles all DOM elements for the stats panel.
 * Side-effect: starts a `requestAnimationFrame` loop for the player-icon
 * idle animation (same behaviour as before the extraction).
 */
export function buildStatsPanelDom(): StatsPanelDomRefs {
  const WEAPON_ROW_COUNT = 5;

  const statsPanel = document.createElement('div');
  statsPanel.id = 'rpg-stats-panel';
  statsPanel.style.display = 'none';

  // ── Box 1 (thin) — animated idle-state player icon + 5 weapon source plug slots ──

  const xpBox1 = document.createElement('div');
  xpBox1.className = 'rpg-xp-box rpg-xp-box-1';

  // Player icon: animated canvas rendering the player mote idle state (pulsing glow).
  // Use a 2× resolution canvas for crispness (44×44 drawn into 22×22 CSS pixels).
  const playerIconEl = document.createElement('div');
  playerIconEl.className = 'rpg-player-icon';

  const ICON_CANVAS_SIZE = 44;
  const iconCanvas = document.createElement('canvas');
  iconCanvas.width  = ICON_CANVAS_SIZE;
  iconCanvas.height = ICON_CANVAS_SIZE;
  iconCanvas.style.width  = '22px';
  iconCanvas.style.height = '22px';
  playerIconEl.appendChild(iconCanvas);

  const iconCtx2d = iconCanvas.getContext('2d');
  const ICON_SCALE   = 2;
  const ICON_MOTE_PX = 3 * ICON_SCALE;
  const ICON_CX      = ICON_CANVAS_SIZE / 2;
  const ICON_CY      = ICON_CANVAS_SIZE / 2;
  let iconAnimTs     = 0;

  function drawPlayerIdleFrame(deltaMs: number): void {
    if (!iconCtx2d) return;
    iconAnimTs += Math.min(deltaMs, 100) / 1000;
    const pulseT = (Math.sin(iconAnimTs * GLOW_PULSE_SPEED) + 1) * 0.5;

    iconCtx2d.clearRect(0, 0, ICON_CANVAS_SIZE, ICON_CANVAS_SIZE);

    const glowSize = ICON_MOTE_PX * (2.2 + pulseT * 1.4);
    const glowHalf = glowSize / 2;
    iconCtx2d.globalAlpha = 0.18 + pulseT * 0.22;
    iconCtx2d.shadowBlur  = glowSize * 3;
    iconCtx2d.shadowColor = RPG_MOTE_GLOW;
    iconCtx2d.fillStyle   = RPG_MOTE_GLOW;
    iconCtx2d.fillRect(
      Math.floor(ICON_CX - glowHalf), Math.floor(ICON_CY - glowHalf),
      Math.ceil(glowSize), Math.ceil(glowSize),
    );
    iconCtx2d.globalAlpha = 1;
    iconCtx2d.shadowBlur  = 0;

    iconCtx2d.shadowBlur  = ICON_MOTE_PX * 5;
    iconCtx2d.shadowColor = RPG_MOTE_GLOW;
    iconCtx2d.fillStyle   = RPG_MOTE_COLOR;
    const bh = ICON_MOTE_PX / 2;
    iconCtx2d.fillRect(
      Math.floor(ICON_CX - bh), Math.floor(ICON_CY - bh),
      ICON_MOTE_PX, ICON_MOTE_PX,
    );
    iconCtx2d.shadowBlur = 0;
  }

  // Lightweight RAF loop for the player icon animation.
  // Skips drawing while the stats panel is hidden to avoid unnecessary GPU work.
  let iconPrevMs = 0;
  function iconAnimLoop(ms: number): void {
    if (statsPanel.style.display !== 'none') {
      drawPlayerIdleFrame(ms - iconPrevMs);
    }
    iconPrevMs = ms;
    requestAnimationFrame(iconAnimLoop);
  }
  requestAnimationFrame((ms) => { iconPrevMs = ms; requestAnimationFrame(iconAnimLoop); });

  xpBox1.appendChild(playerIconEl);

  // Plug container — holds 5 weapon source output plugs.
  const plugContainerEl = document.createElement('div');
  plugContainerEl.className = 'rpg-plug-container';
  xpBox1.appendChild(plugContainerEl);

  const weaponSourcePlugEls: HTMLDivElement[] = [];
  for (let i = 0; i < 5; i++) {
    const plug = document.createElement('div');
    plug.className = 'rpg-plug-slot rpg-weapon-source-plug';
    if (i > 0) plug.classList.add('rpg-plug--locked');
    plugContainerEl.appendChild(plug);
    weaponSourcePlugEls.push(plug);
  }

  // ── Boxes 2–5 — XP node + modifier boxes I/II/III ───────────────────────────

  const xpBox2 = document.createElement('div');
  xpBox2.className = 'rpg-box5-wrapper';

  function makeBox5Row(label: string | HTMLElement): { box: HTMLDivElement; xpOutPlug: HTMLDivElement } {
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
    const xpOutPlug = document.createElement('div');
    xpOutPlug.className = 'rpg-plug-slot rpg-plug-slot--sand';
    box.appendChild(xpOutPlug);
    return { box, xpOutPlug };
  }

  function makeModifierBox5Row(label: string): {
    box: HTMLDivElement;
    xpInPlug: HTMLDivElement;
    outPlug: HTMLDivElement;
  } {
    const box = document.createElement('div');
    box.className = 'rpg-xp-box rpg-box5-cell';
    const span = document.createElement('span');
    span.className = 'rpg-box5-label';
    span.textContent = label;
    box.appendChild(span);

    const plugStack = document.createElement('div');
    plugStack.style.cssText = 'display:flex;flex-direction:column;gap:2px;flex-shrink:0;';

    const xpInPlug = document.createElement('div');
    xpInPlug.className = 'rpg-modifier-plug rpg-modifier-plug--xp-in';

    const outPlug = document.createElement('div');
    outPlug.className = 'rpg-modifier-plug rpg-modifier-plug--out';

    plugStack.appendChild(xpInPlug);
    plugStack.appendChild(outPlug);
    box.appendChild(plugStack);
    return { box, xpInPlug, outPlug };
  }

  // XP node — compact two-line display widget
  const xpNodeEl = document.createElement('div');
  xpNodeEl.className = 'rpg-xp-node';
  xpNodeEl.title = 'Current XP';
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

  const { box: box5Cell2, xpOutPlug: xpOutPlugEl } = makeBox5Row(xpNodeEl);
  const { box: box5Cell3, xpInPlug: mod1XpIn, outPlug: mod1Out } = makeModifierBox5Row('I');
  const { box: box5Cell4, xpInPlug: mod2XpIn, outPlug: mod2Out } = makeModifierBox5Row('II');
  const { box: box5Cell5, xpInPlug: mod3XpIn, outPlug: mod3Out } = makeModifierBox5Row('III');
  xpBox2.appendChild(box5Cell2);
  xpBox2.appendChild(box5Cell3);
  xpBox2.appendChild(box5Cell4);
  xpBox2.appendChild(box5Cell5);

  // ── Boxes 6–11 — weapon stat rows ───────────────────────────────────────────

  const xpBox3 = document.createElement('div');
  xpBox3.className = 'rpg-box4-wrapper';

  const box4RowEls: HTMLDivElement[] = [];

  function makeBox4Row(): HTMLDivElement[] {
    const rowBox = document.createElement('div');
    rowBox.className = 'rpg-xp-box rpg-box4-row';
    box4RowEls.push(rowBox);
    const cells: HTMLDivElement[] = [];
    for (let c = 0; c < 5; c++) {
      const cell = document.createElement('div');
      cell.className = 'rpg-box4-cell';
      rowBox.appendChild(cell);
      cells.push(cell);
    }
    xpBox3.appendChild(rowBox);
    return cells;
  }

  function makeWeaponCell(cell: HTMLDivElement): { plugElement: HTMLSpanElement; valueSpan: HTMLSpanElement } {
    cell.classList.add('rpg-box4-cell--weapon');
    const plugElement = document.createElement('span');
    plugElement.className = 'rpg-box4-circle-plug';
    const valueSpan = document.createElement('span');
    valueSpan.className = 'rpg-stat-value rpg-box4-weapon-stat';
    valueSpan.style.color = 'rgba(255,255,255,0.18)';
    valueSpan.textContent = '—';
    cell.appendChild(plugElement);
    cell.appendChild(valueSpan);
    return { plugElement, valueSpan };
  }

  // Row 0 — header labels: Weap | ATK | Spd | Rng | Prc
  const box4LabelsRow = makeBox4Row();
  const weaponColDefs: Array<[string, string]> = [
    ['Weap', 'rgba(255,255,255,0.5)'],
    ['ATK',  '#fca5a5'],
    ['Spd',  '#86efac'],
    ['Rng',  '#93c5fd'],
    ['Prc',  '#fde68a'],
  ];
  weaponColDefs.forEach(([text, color], i) => {
    const span = document.createElement('span');
    span.className = 'rpg-stat-label';
    span.textContent = text;
    span.style.color = color;
    box4LabelsRow[i].appendChild(span);
  });

  // Rows 1–5 — weapon data rows (boxes 7–11)
  const weaponRowSpans: HTMLSpanElement[][] = [];
  const weaponRowPlugEls: HTMLSpanElement[][] = [];
  for (let r = 0; r < WEAPON_ROW_COUNT; r++) {
    const cells = makeBox4Row();
    const spans: HTMLSpanElement[] = [];
    const plugElsRow: HTMLSpanElement[] = [];
    for (const cell of cells) {
      const { plugElement, valueSpan } = makeWeaponCell(cell);
      spans.push(valueSpan);
      plugElsRow.push(plugElement);
    }
    weaponRowSpans.push(spans);
    weaponRowPlugEls.push(plugElsRow);
  }

  statsPanel.appendChild(xpBox1);
  statsPanel.appendChild(xpBox2);
  statsPanel.appendChild(xpBox3);

  // ── Right column — DPS + HP + menu area ─────────────────────────────────────

  const rightColumn = document.createElement('div');
  rightColumn.className = 'rpg-right-column';

  // DPS chart widget
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

  // HP box — current hit-points, regen %, and defence %
  const hpFractionEl = document.createElement('div');
  hpFractionEl.className = 'rpg-hp-box';

  const hpTopSection = document.createElement('div');
  hpTopSection.className = 'rpg-hp-top';
  const hpFractionLabel = document.createElement('span');
  hpFractionLabel.className = 'rpg-stat-label';
  hpFractionLabel.textContent = 'HP';
  const hpFractionValue = document.createElement('span');
  hpFractionValue.className = 'rpg-stat-value rpg-stat-value--hp';
  hpTopSection.appendChild(hpFractionLabel);
  hpTopSection.appendChild(hpFractionValue);
  hpFractionEl.appendChild(hpTopSection);

  const hpBottomSection = document.createElement('div');
  hpBottomSection.className = 'rpg-hp-bottom';

  const regSubEl = document.createElement('div');
  regSubEl.className = 'rpg-hp-sub';
  const regLabel = document.createElement('span');
  regLabel.className = 'rpg-stat-label';
  regLabel.textContent = 'Reg';
  const regValue = document.createElement('span');
  regValue.className = 'rpg-stat-value rpg-hp-sub-value';
  regSubEl.appendChild(regLabel);
  regSubEl.appendChild(regValue);

  const defSubEl = document.createElement('div');
  defSubEl.className = 'rpg-hp-sub';
  const defLabel = document.createElement('span');
  defLabel.className = 'rpg-stat-label';
  defLabel.textContent = 'Def';
  const defValue = document.createElement('span');
  defValue.className = 'rpg-stat-value rpg-hp-sub-value';
  defSubEl.appendChild(defLabel);
  defSubEl.appendChild(defValue);

  hpBottomSection.appendChild(regSubEl);
  hpBottomSection.appendChild(defSubEl);
  hpFractionEl.appendChild(hpBottomSection);

  // Menu area — RPG menu button is appended here by the caller
  const menuArea = document.createElement('div');
  menuArea.className = 'rpg-menu-area';

  rightColumn.appendChild(dpsWidget);
  rightColumn.appendChild(hpFractionEl);
  rightColumn.appendChild(menuArea);
  statsPanel.appendChild(rightColumn);

  // ── Dev-mode box number badges (14 boxes total) ──────────────────────────────
  // 1  = box 1 (plug column, leftmost)
  // 2–5 = boxes 2–5 (XP column sub-cells: XP, I, II, III)
  // 6–11 = boxes 6–11 (wide stats area row sub-cells)
  // 12 = DPS widget, 13 = HP box, 14 = menu area
  function makeBoxBadge(container: HTMLElement, num: number): void {
    const badge = document.createElement('span');
    badge.className = 'rpg-dev-box-num';
    badge.textContent = String(num);
    container.appendChild(badge);
  }
  makeBoxBadge(xpBox1, 1);
  makeBoxBadge(box5Cell2, 2);
  makeBoxBadge(box5Cell3, 3);
  makeBoxBadge(box5Cell4, 4);
  makeBoxBadge(box5Cell5, 5);
  box4RowEls.forEach((row, i) => makeBoxBadge(row, 6 + i));
  makeBoxBadge(dpsWidget, 12);
  makeBoxBadge(hpFractionEl, 13);
  makeBoxBadge(menuArea, 14);

  return {
    statsPanel,
    menuArea,
    xpAmountEl,
    hpFractionValue,
    regValue,
    defValue,
    weaponRowSpans,
    weaponRowPlugEls,
    weaponSourcePlugEls,
    xpOutPlugEl,
    mod1XpIn, mod1Out,
    mod2XpIn, mod2Out,
    mod3XpIn, mod3Out,
    dpsLabelEl,
    dpsValueEl,
    dpsChartEl,
    dpsAxisEl,
    dpsAxisLowEl,
    dpsAxisHighEl,
  };
}
