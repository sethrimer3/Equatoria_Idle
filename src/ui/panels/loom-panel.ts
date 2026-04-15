import type { GameState } from '../../sim';
import type { ActionHandler } from '../../input';
import type { TierId } from '../../data/tiers';
import { TIER_BY_ID, TIERS } from '../../data/tiers';
import { LOOM_DEFINITIONS, SPECIAL_LOOM_DEFINITIONS } from '../../data/looms';
import { getLoom, getLoomRate, getLoomCost, isSpecialLoomPurchased } from '../../sim/looms';
import { getMotes } from '../../sim/resources';
import { formatNumberAs, computeOutputCompression, type NumberFormat } from '../../util';
import { getGeneratorSpritePath } from '../../render/assets/asset-paths';
import { loadImage } from '../../render/assets/asset-loader';
import { createTintedCanvas } from '../../render/assets/sprite-tint';
import {
  isAlivened,
  isTierAliveneable,
  canAffordAliven,
  getAlivenedTiersOrdered,
  ALIVEN_COST,
  MATRIX_EDIT_STEP,
} from '../../sim/aliven';
import type { TraceEffect } from '../../render/ui/trace-effect';

/**
 * Looms panel — shows passive production Looms (Upgrades sub-tab) and
 * the Particle Life Aliven matrix (Aliven sub-tab).
 */
export interface LoomPanel {
  element: HTMLElement;
  update(state: GameState, numberFormat: NumberFormat): void;
}

/** Minimum pointer travel (px) before a pointerdown on a cell switches from tap to drag. */
const DRAG_THRESHOLD_PX = 12;

/** Pixels of vertical drag needed to advance one MATRIX_EDIT_STEP. Drag up = increase. */
const DRAG_PX_PER_STEP = 20;

/** Draw the tinted generator sprite onto a small icon canvas. */
function renderLoomIconCanvas(canvas: HTMLCanvasElement, spritePath: string, color: string): void {
  loadImage(spritePath).then((sprite) => {
    const tinted = createTintedCanvas(sprite, color);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tinted, 0, 0, canvas.width, canvas.height);
  }).catch(() => { /* sprite not available — leave canvas blank */ });
}

/** Update a matrix cell element's text and background colour to reflect `val`. */
function updateCellDisplay(cell: HTMLElement, val: number): void {
  const absVal = Math.abs(val);
  if (val > 0.01) {
    cell.style.background = `rgba(80, 200, 120, ${Math.min(absVal * 2, 0.85)})`;
    cell.style.color = '#c8ffd8';
  } else if (val < -0.01) {
    cell.style.background = `rgba(220, 50, 50, ${Math.min(absVal * 2, 0.85)})`;
    cell.style.color = '#ffc8c8';
  } else {
    cell.style.background = 'rgba(80,80,100,0.25)';
    cell.style.color = '#888';
  }
  cell.textContent = val.toFixed(2);
}

export function createLoomPanel(dispatch: ActionHandler, traceEffect?: TraceEffect): LoomPanel {
  const panel = document.createElement('div');
  panel.className = 'panel loom-panel';

  // ── Sub-tab bar ──────────────────────────────────────────────

  const subTabBar = document.createElement('div');
  subTabBar.className = 'looms-sub-tab-bar';
  panel.appendChild(subTabBar);

  const upgradesTabBtn = document.createElement('button');
  upgradesTabBtn.className = 'looms-sub-tab-btn active';
  upgradesTabBtn.textContent = 'Upgrades';
  subTabBar.appendChild(upgradesTabBtn);

  const alivenTabBtn = document.createElement('button');
  alivenTabBtn.className = 'looms-sub-tab-btn';
  alivenTabBtn.textContent = 'Aliven';
  subTabBar.appendChild(alivenTabBtn);

  const specialTabBtn = document.createElement('button');
  specialTabBtn.className = 'looms-sub-tab-btn';
  specialTabBtn.textContent = 'Special';
  subTabBar.appendChild(specialTabBtn);

  // ── Upgrades pane ────────────────────────────────────────────

  const upgradesPane = document.createElement('div');
  upgradesPane.className = 'looms-sub-pane';

  const title = document.createElement('h3');
  title.className = 'panel-title';
  title.textContent = 'Looms';
  upgradesPane.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'panel-subtitle';
  subtitle.textContent = 'Passive mote production';
  upgradesPane.appendChild(subtitle);

  const cards: Map<string, HTMLElement> = new Map();
  const upgradeButtons: Map<string, HTMLButtonElement> = new Map();

  for (const def of LOOM_DEFINITIONS) {
    const tier = TIER_BY_ID.get(def.tierId);
    if (!tier) continue;

    const card = document.createElement('div');
    card.className = 'loom-card';
    card.style.borderLeftColor = tier.color;

    const header = document.createElement('div');
    header.className = 'loom-header';

    const spritePath = getGeneratorSpritePath(tier.unlockOrder);
    const iconCanvas = document.createElement('canvas');
    iconCanvas.className = 'loom-icon';
    iconCanvas.width = 32;
    iconCanvas.height = 32;
    renderLoomIconCanvas(iconCanvas, spritePath, tier.color);
    header.appendChild(iconCanvas);

    const nameEl = document.createElement('span');
    nameEl.className = 'loom-name';
    nameEl.style.color = tier.color;
    nameEl.textContent = def.displayName;
    header.appendChild(nameEl);

    card.appendChild(header);

    const desc = document.createElement('p');
    desc.className = 'loom-desc';
    desc.textContent = def.description;
    card.appendChild(desc);

    const stats = document.createElement('div');
    stats.className = 'loom-stats';
    card.appendChild(stats);

    const btn = document.createElement('button');
    btn.className = 'upgrade-btn loom-upgrade-btn';
    btn.style.borderColor = tier.color;
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      dispatch({ kind: 'upgrade_loom', tierId: def.tierId });
    });
    card.appendChild(btn);

    upgradesPane.appendChild(card);
    cards.set(def.tierId, card);
    upgradeButtons.set(def.tierId, btn);
  }

  panel.appendChild(upgradesPane);

  // ── Aliven pane ──────────────────────────────────────────────

  const alivenPane = document.createElement('div');
  alivenPane.className = 'looms-sub-pane';
  alivenPane.style.display = 'none';

  const alivenTitle = document.createElement('h3');
  alivenTitle.className = 'panel-title';
  alivenTitle.textContent = 'Aliven';
  alivenPane.appendChild(alivenTitle);

  const alivenSubtitle = document.createElement('p');
  alivenSubtitle.className = 'panel-subtitle';
  alivenSubtitle.textContent = 'Awaken motes to enable Particle Life interactions';
  alivenPane.appendChild(alivenSubtitle);

  // ── Matrix section (above aliven rows) ──────────────────────

  const matrixSection = document.createElement('div');
  matrixSection.className = 'aliven-matrix-section';
  alivenPane.appendChild(matrixSection);

  const matrixTitle = document.createElement('p');
  matrixTitle.className = 'aliven-matrix-title';
  matrixTitle.textContent = 'Interaction Matrix';
  matrixSection.appendChild(matrixTitle);

  const matrixNote = document.createElement('p');
  matrixNote.className = 'aliven-matrix-note';
  matrixNote.textContent = 'Row = source (exerts force) · Col = target (feels force) · Green = attraction · Red = repulsion';
  matrixSection.appendChild(matrixNote);

  // ── Matrix step controls ─────────────────────────────────────

  // selectedStep: which +/- button is active. null = neither.
  let selectedStep: number | null = null;

  const controlsRow = document.createElement('div');
  controlsRow.className = 'aliven-matrix-controls';
  matrixSection.appendChild(controlsRow);

  const addBtn = document.createElement('button');
  addBtn.className = 'aliven-matrix-step-btn aliven-matrix-step-btn--add';
  addBtn.textContent = '+0.05';
  addBtn.title = 'Select to add 0.05 when tapping a cell';

  const subBtn = document.createElement('button');
  subBtn.className = 'aliven-matrix-step-btn aliven-matrix-step-btn--sub';
  subBtn.textContent = '−0.05';
  subBtn.title = 'Select to subtract 0.05 when tapping a cell';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'aliven-matrix-step-btn aliven-matrix-reset-btn';
  resetBtn.textContent = '↺';
  resetBtn.title = 'Reset all values to defaults';

  function updateStepButtonHighlights(): void {
    addBtn.classList.toggle('selected', selectedStep === MATRIX_EDIT_STEP);
    subBtn.classList.toggle('selected', selectedStep === -MATRIX_EDIT_STEP);
  }

  addBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    selectedStep = selectedStep === MATRIX_EDIT_STEP ? null : MATRIX_EDIT_STEP;
    updateStepButtonHighlights();
  });

  subBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    selectedStep = selectedStep === -MATRIX_EDIT_STEP ? null : -MATRIX_EDIT_STEP;
    updateStepButtonHighlights();
  });

  let isResetConfirmOpen = false;
  resetBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isResetConfirmOpen) return;
    isResetConfirmOpen = true;
    const confirmed = confirm('Reset all interaction matrix values to defaults?');
    isResetConfirmOpen = false;
    if (confirmed) {
      dispatch({ kind: 'reset_interaction_matrix' });
    }
  });

  controlsRow.appendChild(addBtn);
  controlsRow.appendChild(subBtn);
  controlsRow.appendChild(resetBtn);

  // ── Matrix container ─────────────────────────────────────────

  const matrixContainer = document.createElement('div');
  matrixContainer.className = 'aliven-matrix-wrap';
  matrixSection.appendChild(matrixContainer);

  // Track last rendered aliven key to avoid unnecessary DOM rebuilds
  let lastMatrixKey = '';

  // Live reference to the most recently seen interaction matrix.
  // Set each update() call; read by pointer event handlers on cells.
  let latestMatrix: number[][] | null = null;

  // Map from "srcIdx,tgtIdx" → cell element for live value updates.
  const cellElements = new Map<string, HTMLElement>();

  // ── Drag state ───────────────────────────────────────────────

  let dragRow = -1;
  let dragCol = -1;
  let dragStartY = 0;
  let dragBaseValue = 0;
  let dragLastStepCount = 0;
  let dragHasDragged = false;

  function onCellDragMove(e: PointerEvent): void {
    if (dragRow < 0) return;
    const dy = dragStartY - e.clientY; // up = positive = increase value
    const totalMovement = Math.abs(e.clientY - dragStartY);
    if (!dragHasDragged && totalMovement >= DRAG_THRESHOLD_PX) {
      dragHasDragged = true;
    }
    if (!dragHasDragged) return;

    const stepCount = Math.trunc(dy / DRAG_PX_PER_STEP);
    if (stepCount !== dragLastStepCount) {
      dragLastStepCount = stepCount;
      const newValue = dragBaseValue + stepCount * MATRIX_EDIT_STEP;
      dispatch({
        kind: 'set_interaction_matrix_cell',
        row: dragRow,
        col: dragCol,
        value: newValue,
      });
    }
  }

  function onCellDragEnd(_e: PointerEvent, srcIdx: number, tgtIdx: number): void {
    if (dragRow < 0) return;
    const wasDrag = dragHasDragged;
    dragRow = -1;
    dragCol = -1;
    dragHasDragged = false;
    dragLastStepCount = 0;

    // If no meaningful drag, treat as a tap — apply selected step.
    if (!wasDrag && selectedStep !== null && latestMatrix !== null) {
      const currentVal = latestMatrix[srcIdx][tgtIdx];
      dispatch({
        kind: 'set_interaction_matrix_cell',
        row: srcIdx,
        col: tgtIdx,
        value: currentVal + selectedStep,
      });
    }
  }

  // ── Matrix rebuild ───────────────────────────────────────────

  function rebuildMatrix(alivenedTierIds: readonly string[], currentMatrix: number[][]): void {
    matrixContainer.innerHTML = '';
    cellElements.clear();

    if (alivenedTierIds.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'aliven-matrix-empty';
      empty.textContent = 'No motes alivened yet. Aliven a mote type above to begin.';
      matrixContainer.appendChild(empty);
      return;
    }

    const n = alivenedTierIds.length;
    const table = document.createElement('div');
    table.className = 'aliven-matrix';
    table.style.gridTemplateColumns = `auto repeat(${n}, 1fr)`;

    // Top-left corner cell
    const corner = document.createElement('div');
    corner.className = 'aliven-matrix-corner';
    corner.textContent = 'src \\ tgt';
    table.appendChild(corner);

    // Column headers
    for (const targetId of alivenedTierIds) {
      const tier = TIER_BY_ID.get(targetId as TierId);
      const colHead = document.createElement('div');
      colHead.className = 'aliven-matrix-col-head';
      colHead.textContent = tier?.displayName.slice(0, 3) ?? '?';
      colHead.title = tier?.displayName ?? targetId;
      colHead.style.color = tier?.color ?? '#fff';
      table.appendChild(colHead);
    }

    // Rows with interactive cells
    for (const sourceId of alivenedTierIds) {
      const sourceTier = TIER_BY_ID.get(sourceId as TierId);
      const rowHead = document.createElement('div');
      rowHead.className = 'aliven-matrix-row-head';
      rowHead.textContent = sourceTier?.displayName.slice(0, 3) ?? '?';
      rowHead.title = sourceTier?.displayName ?? sourceId;
      rowHead.style.color = sourceTier?.color ?? '#fff';
      table.appendChild(rowHead);

      const srcIdx = sourceTier?.unlockOrder ?? 0;

      for (const targetId of alivenedTierIds) {
        const targetTier = TIER_BY_ID.get(targetId as TierId);
        const tgtIdx = targetTier?.unlockOrder ?? 0;
        const val = currentMatrix[srcIdx][tgtIdx];

        const cell = document.createElement('div');
        cell.className = 'aliven-matrix-cell';
        // Base title stored in dataset so live updates can append the current value.
        const baseTitle = `${sourceTier?.displayName ?? ''} → ${targetTier?.displayName ?? ''}`;
        cell.dataset.baseTitle = baseTitle;
        cell.title = `${baseTitle}: ${val.toFixed(2)}`;
        updateCellDisplay(cell, val);

        // Pointer interaction — drag or tap
        cell.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          if (latestMatrix === null) return;
          dragRow = srcIdx;
          dragCol = tgtIdx;
          dragStartY = e.clientY;
          dragBaseValue = latestMatrix[srcIdx][tgtIdx];
          dragLastStepCount = 0;
          dragHasDragged = false;
          cell.setPointerCapture(e.pointerId);
          if (traceEffect) traceEffect.setMatrixTarget(cell);
        });

        cell.addEventListener('pointermove', (e) => {
          if (dragRow !== srcIdx || dragCol !== tgtIdx) return;
          onCellDragMove(e);
        });

        cell.addEventListener('pointerup', (e) => {
          if (dragRow !== srcIdx || dragCol !== tgtIdx) return;
          onCellDragEnd(e, srcIdx, tgtIdx);
          if (traceEffect) traceEffect.setMatrixTarget(null);
        });

        cell.addEventListener('pointercancel', (_e) => {
          if (dragRow !== srcIdx || dragCol !== tgtIdx) return;
          dragRow = -1;
          dragCol = -1;
          dragHasDragged = false;
          dragLastStepCount = 0;
          if (traceEffect) traceEffect.setMatrixTarget(null);
        });

        cellElements.set(`${srcIdx},${tgtIdx}`, cell);
        table.appendChild(cell);
      }
    }

    matrixContainer.appendChild(table);
  }

  // ── Aliven upgrade rows (below matrix) ───────────────────────

  const alivenRows: Map<string, HTMLElement> = new Map();
  const alivenButtons: Map<string, HTMLButtonElement> = new Map();
  const alivenRowsContainer = document.createElement('div');
  alivenRowsContainer.className = 'aliven-rows';
  alivenPane.appendChild(alivenRowsContainer);

  for (const tier of TIERS) {
    if (!isTierAliveneable(tier.id)) continue;

    const row = document.createElement('div');
    row.className = 'aliven-tier-row';
    row.style.borderLeftColor = tier.color;

    const rowHeader = document.createElement('div');
    rowHeader.className = 'aliven-tier-row-header';

    const nameBadge = document.createElement('span');
    nameBadge.className = 'aliven-tier-name';
    nameBadge.style.color = tier.color;
    nameBadge.textContent = tier.displayName;
    rowHeader.appendChild(nameBadge);

    const statusBadge = document.createElement('span');
    statusBadge.className = 'aliven-status-badge';
    rowHeader.appendChild(statusBadge);

    row.appendChild(rowHeader);

    const btn = document.createElement('button');
    btn.className = 'upgrade-btn aliven-btn';
    btn.style.borderColor = tier.color;
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      dispatch({ kind: 'aliven_mote', tierId: tier.id });
    });
    row.appendChild(btn);

    alivenRowsContainer.appendChild(row);
    alivenRows.set(tier.id, row);
    alivenButtons.set(tier.id, btn);
  }

  panel.appendChild(alivenPane);

  // ── Special pane ─────────────────────────────────────────────

  const specialPane = document.createElement('div');
  specialPane.className = 'looms-sub-pane';
  specialPane.style.display = 'none';

  const specialTitle = document.createElement('h3');
  specialTitle.className = 'panel-title';
  specialTitle.textContent = 'Special Upgrades';
  specialPane.appendChild(specialTitle);

  const specialSubtitle = document.createElement('p');
  specialSubtitle.className = 'panel-subtitle';
  specialSubtitle.textContent = 'One-time upgrades that double Loom production';
  specialPane.appendChild(specialSubtitle);

  const specialCards: Map<string, HTMLElement> = new Map();
  const specialButtons: Map<string, HTMLButtonElement> = new Map();

  for (const def of SPECIAL_LOOM_DEFINITIONS) {
    const tier = TIER_BY_ID.get(def.tierId);
    if (!tier) continue;

    const card = document.createElement('div');
    card.className = 'loom-card';
    card.style.borderLeftColor = tier.color;

    const header = document.createElement('div');
    header.className = 'loom-header';

    const nameEl = document.createElement('span');
    nameEl.className = 'loom-name';
    nameEl.style.color = tier.color;
    nameEl.textContent = def.displayName;
    header.appendChild(nameEl);

    card.appendChild(header);

    const desc = document.createElement('p');
    desc.className = 'loom-desc';
    desc.textContent = def.description;
    card.appendChild(desc);

    const stats = document.createElement('div');
    stats.className = 'loom-stats';
    card.appendChild(stats);

    const btn = document.createElement('button');
    btn.className = 'upgrade-btn loom-upgrade-btn';
    btn.style.borderColor = tier.color;
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      dispatch({ kind: 'upgrade_special_loom', tierId: def.tierId });
    });
    card.appendChild(btn);

    specialPane.appendChild(card);
    specialCards.set(def.tierId, card);
    specialButtons.set(def.tierId, btn);
  }

  panel.appendChild(specialPane);

  // ── Sub-tab switching ────────────────────────────────────────

  let activeSubTab: 'upgrades' | 'aliven' | 'special' = 'upgrades';

  function setSubTab(tab: 'upgrades' | 'aliven' | 'special'): void {
    activeSubTab = tab;
    upgradesTabBtn.classList.toggle('active', tab === 'upgrades');
    alivenTabBtn.classList.toggle('active', tab === 'aliven');
    specialTabBtn.classList.toggle('active', tab === 'special');
    upgradesPane.style.display = tab === 'upgrades' ? '' : 'none';
    alivenPane.style.display = tab === 'aliven' ? '' : 'none';
    specialPane.style.display = tab === 'special' ? '' : 'none';
  }

  upgradesTabBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    setSubTab('upgrades');
  });
  alivenTabBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    setSubTab('aliven');
  });
  specialTabBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    setSubTab('special');
  });

  // ── Update ───────────────────────────────────────────────────

  function update(state: GameState, numberFormat: NumberFormat): void {
    // ── Upgrades pane update ──
    if (activeSubTab === 'upgrades') {
      for (const def of LOOM_DEFINITIONS) {
        const card = cards.get(def.tierId);
        const btn = upgradeButtons.get(def.tierId);
        if (!card || !btn) continue;

        const loom = getLoom(state.looms, def.tierId);
        const isUnlocked = loom?.isUnlocked ?? false;

        card.style.display = isUnlocked ? '' : 'none';
        if (!isUnlocked) continue;

        const level = loom!.level;
        const rate = getLoomRate(def.tierId, level);
        const cost = getLoomCost(def.tierId, level);
        const currentMotes = getMotes(state.resources, def.tierId);
        const canAfford = cost !== null && currentMotes >= cost;

        const statsEl = card.querySelector('.loom-stats');
        if (statsEl) {
          const effectiveRate = rate * state.achievements.loomMultiplierBonus;
          const { sizeLabel, emitRatePerSec } = computeOutputCompression(effectiveRate);
          statsEl.innerHTML = `
            <span class="loom-stat">Lv ${level}</span>
            <span class="loom-stat">${formatNumberAs(effectiveRate, numberFormat)}/s raw</span>
            <span class="loom-stat loom-emit-size">Particle size: ${sizeLabel}</span>
            <span class="loom-stat">Rate: ${formatNumberAs(emitRatePerSec, numberFormat)}/s</span>
            <span class="loom-stat">${formatNumberAs(currentMotes, numberFormat)} motes</span>
          `;
        }

        const tier = TIER_BY_ID.get(def.tierId);
        if (cost !== null) {
          btn.textContent = `⬆ Upgrade — ${formatNumberAs(cost, numberFormat)} ${tier?.displayName ?? ''}`;
          btn.disabled = !canAfford;
        } else {
          btn.textContent = '⬆ MAX';
          btn.disabled = true;
        }
      }
    }

    // ── Aliven pane update ──
    if (activeSubTab === 'aliven') {
      // Keep a live reference so pointer event handlers always see the latest values.
      latestMatrix = state.aliven.interactionMatrix;

      const unlockedCount = state.progression.unlockedTierCount;

      for (const tier of TIERS) {
        if (!isTierAliveneable(tier.id)) continue;
        const row = alivenRows.get(tier.id);
        const btn = alivenButtons.get(tier.id);
        if (!row || !btn) continue;

        const tierUnlocked = tier.unlockOrder < unlockedCount;
        row.style.display = tierUnlocked ? '' : 'none';
        if (!tierUnlocked) continue;

        const alive = isAlivened(state.aliven, tier.id);
        const affordable = canAffordAliven(state.resources, tier.id);

        const statusBadge = row.querySelector('.aliven-status-badge') as HTMLElement | null;
        if (statusBadge) {
          statusBadge.textContent = alive ? '✦ Alive' : '';
          statusBadge.style.color = tier.color;
        }

        row.classList.toggle('aliven-tier-row--alive', alive);

        if (alive) {
          btn.style.display = 'none';
        } else {
          btn.style.display = '';
          btn.textContent = `✦ Aliven — ${formatNumberAs(ALIVEN_COST, numberFormat)} ${tier.displayName}`;
          btn.disabled = !affordable;
          btn.style.opacity = affordable ? '1' : '0.5';
        }
      }

      // Rebuild matrix DOM only when the aliven set membership changes.
      const alivenedTierIds = getAlivenedTiersOrdered(state.aliven);
      const currentMatrixKey = alivenedTierIds.join(',');
      if (lastMatrixKey !== currentMatrixKey) {
        lastMatrixKey = currentMatrixKey;
        rebuildMatrix(alivenedTierIds, state.aliven.interactionMatrix);
      }

      // Refresh cell displays with latest matrix values every update cycle.
      for (const [key, cell] of cellElements) {
        const [r, c] = key.split(',').map(Number);
        const val = state.aliven.interactionMatrix[r][c];
        updateCellDisplay(cell, val);
        cell.title = `${cell.dataset.baseTitle ?? key}: ${val.toFixed(2)}`;
      }
    }

    // ── Special pane update ──
    if (activeSubTab === 'special') {
      const unlockedCount = state.progression.unlockedTierCount;

      for (const def of SPECIAL_LOOM_DEFINITIONS) {
        const card = specialCards.get(def.tierId);
        const btn = specialButtons.get(def.tierId);
        if (!card || !btn) continue;

        const tier = TIER_BY_ID.get(def.tierId);
        const loom = getLoom(state.looms, def.tierId);
        const isUnlocked = loom?.isUnlocked ?? false;
        const tierOrderOk = tier ? tier.unlockOrder < unlockedCount : false;

        card.style.display = isUnlocked && tierOrderOk ? '' : 'none';
        if (!isUnlocked || !tierOrderOk) continue;

        const purchased = isSpecialLoomPurchased(state.looms, def.tierId);
        const currentMotes = getMotes(state.resources, def.tierId);
        const canAfford = currentMotes >= def.cost;

        const statsEl = card.querySelector('.loom-stats');
        if (statsEl) {
          statsEl.innerHTML = `
            <span class="loom-stat">${formatNumberAs(currentMotes, numberFormat)} / ${formatNumberAs(def.cost, numberFormat)} ${tier?.displayName ?? ''}</span>
          `;
        }

        if (purchased) {
          btn.textContent = '✦ Purchased';
          btn.disabled = true;
        } else {
          btn.textContent = `✦ Purchase — ${formatNumberAs(def.cost, numberFormat)} ${tier?.displayName ?? ''}`;
          btn.disabled = !canAfford;
        }
      }
    }
  }

  return { element: panel, update };
}
