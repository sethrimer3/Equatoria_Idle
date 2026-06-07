import { GLOW_PULSE_SPEED, RPG_MOTE_COLOR, RPG_MOTE_GLOW } from './rpg-constants';

export interface StatsPanelPrimaryColumnRefs {
  xpBox1: HTMLDivElement;
  xpBox2: HTMLDivElement;
  xpBox3: HTMLDivElement;
  box5Cell2: HTMLDivElement;
  box5Cell3: HTMLDivElement;
  box5Cell4: HTMLDivElement;
  box5Cell5: HTMLDivElement;
  box4RowEls: HTMLDivElement[];
  xpAmountEl: HTMLSpanElement;
  weaponRowSpans: HTMLSpanElement[][];
  weaponRowPlugEls: HTMLSpanElement[][];
  weaponSourcePlugEls: HTMLDivElement[];
  xpOutPlugEl: HTMLDivElement;
  /** Square purple XP input socket at the bottom of Box 1. */
  playerXpInEl: HTMLDivElement;
  mod1XpIn: HTMLDivElement;
  mod1Out: HTMLDivElement;
  mod2XpIn: HTMLDivElement;
  mod2Out: HTMLDivElement;
  mod3XpIn: HTMLDivElement;
  mod3Out: HTMLDivElement;
  /** Progress bar fill elements for modifier boxes [0]=Box3, [1]=Box4, [2]=Box5. */
  modProgressFills: HTMLDivElement[];
  /** Level text elements for modifier boxes [0]=Box3, [1]=Box4, [2]=Box5. */
  modLevelTexts: HTMLSpanElement[];
  /** "Lv.N" label shown above the player icon. Updated on level-up. */
  playerLevelEl: HTMLSpanElement;
  /** XP progress bar fill element below the player icon. Width updated each frame. */
  playerXpBarFill: HTMLDivElement;
  /** The 5 cell divs in the header label row (Weap / ATK / Spd / Rng / Prc). */
  box4LabelCells: HTMLDivElement[];
}

export interface StatsPanelRightColumnRefs {
  rightColumn: HTMLDivElement;
  dpsWidget: HTMLDivElement;
  hpFractionEl: HTMLDivElement;
  menuArea: HTMLDivElement;
  hpFractionValue: HTMLSpanElement;
  regValue: HTMLSpanElement;
  defValue: HTMLSpanElement;
  dpsLabelEl: HTMLSpanElement;
  dpsValueEl: HTMLSpanElement;
  dpsChartEl: HTMLDivElement;
  dpsAxisEl: HTMLDivElement;
  dpsAxisLowEl: HTMLSpanElement;
  dpsAxisHighEl: HTMLSpanElement;
}

function createPlayerIconWidget(getIsStatsPanelVisible: () => boolean): {
  wrapperEl: HTMLDivElement;
  levelLabelEl: HTMLSpanElement;
  xpBarFill: HTMLDivElement;
} {
  const wrapperEl = document.createElement('div');
  wrapperEl.className = 'rpg-player-icon-widget';

  // "Lv.N" label above the player icon canvas.
  const levelLabelEl = document.createElement('span');
  levelLabelEl.className = 'rpg-player-level-label';
  levelLabelEl.textContent = 'Lv.1';
  wrapperEl.appendChild(levelLabelEl);

  // Player icon canvas (existing logic, unchanged).
  const playerIconEl = document.createElement('div');
  playerIconEl.className = 'rpg-player-icon';

  const ICON_CANVAS_SIZE = 44;
  const iconCanvas = document.createElement('canvas');
  iconCanvas.width = ICON_CANVAS_SIZE;
  iconCanvas.height = ICON_CANVAS_SIZE;
  iconCanvas.style.width = '22px';
  iconCanvas.style.height = '22px';
  playerIconEl.appendChild(iconCanvas);

  const iconCtx2d = iconCanvas.getContext('2d');
  const ICON_SCALE = 2;
  const ICON_MOTE_PX = 3 * ICON_SCALE;
  const ICON_CX = ICON_CANVAS_SIZE / 2;
  const ICON_CY = ICON_CANVAS_SIZE / 2;
  let iconAnimTs = 0;

  function drawPlayerIdleFrame(deltaMs: number): void {
    if (!iconCtx2d) return;
    iconAnimTs += Math.min(deltaMs, 100) / 1000;
    const pulseT = (Math.sin(iconAnimTs * GLOW_PULSE_SPEED) + 1) * 0.5;

    iconCtx2d.clearRect(0, 0, ICON_CANVAS_SIZE, ICON_CANVAS_SIZE);

    const glowSize = ICON_MOTE_PX * (2.2 + pulseT * 1.4);
    const glowHalf = glowSize / 2;
    iconCtx2d.globalAlpha = 0.18 + pulseT * 0.22;
    iconCtx2d.shadowBlur = glowSize * 3;
    iconCtx2d.shadowColor = RPG_MOTE_GLOW;
    iconCtx2d.fillStyle = RPG_MOTE_GLOW;
    iconCtx2d.fillRect(
      Math.floor(ICON_CX - glowHalf), Math.floor(ICON_CY - glowHalf),
      Math.ceil(glowSize), Math.ceil(glowSize),
    );
    iconCtx2d.globalAlpha = 1;
    iconCtx2d.shadowBlur = 0;

    iconCtx2d.shadowBlur = ICON_MOTE_PX * 5;
    iconCtx2d.shadowColor = RPG_MOTE_GLOW;
    iconCtx2d.fillStyle = RPG_MOTE_COLOR;
    const bh = ICON_MOTE_PX / 2;
    iconCtx2d.fillRect(
      Math.floor(ICON_CX - bh), Math.floor(ICON_CY - bh),
      ICON_MOTE_PX, ICON_MOTE_PX,
    );
    iconCtx2d.shadowBlur = 0;
  }

  let iconPrevMs = 0;
  function iconAnimLoop(ms: number): void {
    if (getIsStatsPanelVisible()) {
      drawPlayerIdleFrame(ms - iconPrevMs);
    }
    iconPrevMs = ms;
    requestAnimationFrame(iconAnimLoop);
  }
  requestAnimationFrame((ms) => { iconPrevMs = ms; requestAnimationFrame(iconAnimLoop); });

  wrapperEl.appendChild(playerIconEl);

  // XP progress bar below the player icon — mirrors the modifier box progress track style.
  const xpBarTrack = document.createElement('div');
  xpBarTrack.className = 'rpg-player-xp-bar-track';
  const xpBarFill = document.createElement('div');
  xpBarFill.className = 'rpg-player-xp-bar-fill';
  xpBarFill.style.width = '0%';
  xpBarTrack.appendChild(xpBarFill);
  wrapperEl.appendChild(xpBarTrack);

  return { wrapperEl, levelLabelEl, xpBarFill };
}

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

function makeModifierBox5Row(romanNumeral: string): {
  box: HTMLDivElement;
  xpInPlug: HTMLDivElement;
  outPlug: HTMLDivElement;
  progressBarFill: HTMLDivElement;
  levelText: HTMLSpanElement;
} {
  const box = document.createElement('div');
  box.className = 'rpg-xp-box rpg-box5-cell';

  // Roman numeral — absolute top-left corner
  const romanSpan = document.createElement('span');
  romanSpan.className = 'rpg-modifier-roman';
  romanSpan.textContent = romanNumeral;
  box.appendChild(romanSpan);

  // Content column: progress bar + level text
  const contentEl = document.createElement('div');
  contentEl.className = 'rpg-modifier-content';

  const progressTrack = document.createElement('div');
  progressTrack.className = 'rpg-modifier-progress-track';

  const progressBarFill = document.createElement('div');
  progressBarFill.className = 'rpg-modifier-progress-fill';
  progressBarFill.style.width = '0%';
  progressTrack.appendChild(progressBarFill);
  contentEl.appendChild(progressTrack);

  const levelText = document.createElement('span');
  levelText.className = 'rpg-modifier-level-text';
  levelText.textContent = 'x1';
  contentEl.appendChild(levelText);

  box.appendChild(contentEl);

  // Plug stack (xpIn on top, out on bottom)
  const plugStack = document.createElement('div');
  plugStack.style.cssText = 'display:flex;flex-direction:column;gap:2px;flex-shrink:0;';

  const xpInPlug = document.createElement('div');
  xpInPlug.className = 'rpg-modifier-plug rpg-modifier-plug--xp-in';

  const outPlug = document.createElement('div');
  outPlug.className = 'rpg-modifier-plug rpg-modifier-plug--out';

  plugStack.appendChild(xpInPlug);
  plugStack.appendChild(outPlug);
  box.appendChild(plugStack);

  return { box, xpInPlug, outPlug, progressBarFill, levelText };
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

export function createStatsPanelPrimaryColumn(
  weaponRowCount: number,
  getIsStatsPanelVisible: () => boolean,
): StatsPanelPrimaryColumnRefs {
  const xpBox1 = document.createElement('div');
  xpBox1.className = 'rpg-xp-box rpg-xp-box-1';
  const {
    wrapperEl: playerIconWidget,
    levelLabelEl: playerLevelEl,
    xpBarFill: playerXpBarFill,
  } = createPlayerIconWidget(getIsStatsPanelVisible);
  xpBox1.appendChild(playerIconWidget);

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

  // Square purple XP input socket at the bottom of Box 1.
  // Accepts an XP wire to give the player direct XP.
  const playerXpInEl = document.createElement('div');
  playerXpInEl.className = 'rpg-player-xp-in';
  xpBox1.appendChild(playerXpInEl);

  const xpBox2 = document.createElement('div');
  xpBox2.className = 'rpg-box5-wrapper';

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
  const { box: box5Cell3, xpInPlug: mod1XpIn, outPlug: mod1Out, progressBarFill: mod1Fill, levelText: mod1Level } = makeModifierBox5Row('I');
  const { box: box5Cell4, xpInPlug: mod2XpIn, outPlug: mod2Out, progressBarFill: mod2Fill, levelText: mod2Level } = makeModifierBox5Row('II');
  const { box: box5Cell5, xpInPlug: mod3XpIn, outPlug: mod3Out, progressBarFill: mod3Fill, levelText: mod3Level } = makeModifierBox5Row('III');
  xpBox2.appendChild(box5Cell2);
  xpBox2.appendChild(box5Cell3);
  xpBox2.appendChild(box5Cell4);
  xpBox2.appendChild(box5Cell5);

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

  const box4LabelsRow = makeBox4Row();
  const weaponColDefs: Array<[string, string]> = [
    ['Weap', 'rgba(255,255,255,0.5)'],
    ['ATK', '#fca5a5'],
    ['Spd', '#86efac'],
    ['Rng', '#93c5fd'],
    ['Prc', '#fde68a'],
  ];
  weaponColDefs.forEach(([text, color], i) => {
    const span = document.createElement('span');
    span.className = 'rpg-stat-label';
    span.textContent = text;
    span.style.color = color;
    box4LabelsRow[i].appendChild(span);
  });

  const weaponRowSpans: HTMLSpanElement[][] = [];
  const weaponRowPlugEls: HTMLSpanElement[][] = [];
  for (let r = 0; r < weaponRowCount; r++) {
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

  return {
    xpBox1,
    xpBox2,
    xpBox3,
    box5Cell2,
    box5Cell3,
    box5Cell4,
    box5Cell5,
    box4RowEls,
    xpAmountEl,
    weaponRowSpans,
    weaponRowPlugEls,
    weaponSourcePlugEls,
    xpOutPlugEl,
    playerXpInEl,
    mod1XpIn,
    mod1Out,
    mod2XpIn,
    mod2Out,
    mod3XpIn,
    mod3Out,
    modProgressFills: [mod1Fill, mod2Fill, mod3Fill],
    modLevelTexts: [mod1Level, mod2Level, mod3Level],
    playerLevelEl,
    playerXpBarFill,
    box4LabelCells: box4LabelsRow,
  };
}

export function createStatsPanelRightColumn(): StatsPanelRightColumnRefs {
  const rightColumn = document.createElement('div');
  rightColumn.className = 'rpg-right-column';

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

  const menuArea = document.createElement('div');
  menuArea.className = 'rpg-menu-area';

  rightColumn.appendChild(dpsWidget);
  rightColumn.appendChild(hpFractionEl);
  rightColumn.appendChild(menuArea);

  return {
    rightColumn,
    dpsWidget,
    hpFractionEl,
    menuArea,
    hpFractionValue,
    regValue,
    defValue,
    dpsLabelEl,
    dpsValueEl,
    dpsChartEl,
    dpsAxisEl,
    dpsAxisLowEl,
    dpsAxisHighEl,
  };
}

function makeBoxBadge(container: HTMLElement, num: number): void {
  const badge = document.createElement('span');
  badge.className = 'rpg-dev-box-num';
  badge.textContent = String(num);
  container.appendChild(badge);
}

export function addStatsPanelDevBadges(
  xpBox1: HTMLDivElement,
  box5Cell2: HTMLDivElement,
  box5Cell3: HTMLDivElement,
  box5Cell4: HTMLDivElement,
  box5Cell5: HTMLDivElement,
  box4RowEls: HTMLDivElement[],
  dpsWidget: HTMLDivElement,
  hpFractionEl: HTMLDivElement,
  menuArea: HTMLDivElement,
): void {
  makeBoxBadge(xpBox1, 1);
  makeBoxBadge(box5Cell2, 2);
  makeBoxBadge(box5Cell3, 3);
  makeBoxBadge(box5Cell4, 4);
  makeBoxBadge(box5Cell5, 5);
  box4RowEls.forEach((row, i) => makeBoxBadge(row, 6 + i));
  makeBoxBadge(dpsWidget, 12);
  makeBoxBadge(hpFractionEl, 13);
  makeBoxBadge(menuArea, 14);
}
