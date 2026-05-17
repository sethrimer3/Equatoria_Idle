import type { ActionHandler } from '../../input';
import type { GameState } from '../../sim';
import type { TierId } from '../../data/tiers';
import { TIER_BY_ID } from '../../data/tiers';
import { getAlivenedTiersOrdered, MATRIX_EDIT_STEP } from '../../sim/aliven';
import type { TraceEffect } from '../../render/ui/trace-effect';

/** Minimum pointer travel (px) before a pointerdown on a cell switches from tap to drag. */
const DRAG_THRESHOLD_PX = 12;

/** Pixels of vertical drag needed to advance one MATRIX_EDIT_STEP. Drag up = increase. */
const DRAG_PX_PER_STEP = 20;

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

export interface AlivenPaneMatrixSection {
  element: HTMLElement;
  update(state: GameState): void;
}

export function createAlivenPaneMatrixSection(
  dispatch: ActionHandler,
  traceEffect?: TraceEffect,
): AlivenPaneMatrixSection {
  const matrixSection = document.createElement('div');
  matrixSection.className = 'aliven-matrix-section';

  const matrixTitle = document.createElement('p');
  matrixTitle.className = 'aliven-matrix-title';
  matrixTitle.textContent = 'Interaction Matrix';
  matrixSection.appendChild(matrixTitle);

  const matrixNote = document.createElement('p');
  matrixNote.className = 'aliven-matrix-note';
  matrixNote.textContent = 'Row = source (exerts force) · Col = target (feels force) · Green = attraction · Red = repulsion';
  matrixSection.appendChild(matrixNote);

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

  const matrixContainer = document.createElement('div');
  matrixContainer.className = 'aliven-matrix-wrap';
  matrixSection.appendChild(matrixContainer);

  let lastMatrixKey = '';
  let latestMatrix: number[][] | null = null;
  const cellElements = new Map<string, HTMLElement>();

  let dragRow = -1;
  let dragCol = -1;
  let dragStartY = 0;
  let dragBaseValue = 0;
  let dragLastStepCount = 0;
  let dragHasDragged = false;

  function onCellDragMove(e: PointerEvent): void {
    if (dragRow < 0) return;
    const dy = dragStartY - e.clientY;
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

    const corner = document.createElement('div');
    corner.className = 'aliven-matrix-corner';
    corner.textContent = 'src \\ tgt';
    table.appendChild(corner);

    for (const targetId of alivenedTierIds) {
      const tier = TIER_BY_ID.get(targetId as TierId);
      const colHead = document.createElement('div');
      colHead.className = 'aliven-matrix-col-head';
      colHead.textContent = tier?.displayName.slice(0, 3) ?? '?';
      colHead.title = tier?.displayName ?? targetId;
      colHead.style.color = tier?.color ?? '#fff';
      table.appendChild(colHead);
    }

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
        const baseTitle = `${sourceTier?.displayName ?? ''} → ${targetTier?.displayName ?? ''}`;
        cell.dataset.baseTitle = baseTitle;
        cell.title = `${baseTitle}: ${val.toFixed(2)}`;
        updateCellDisplay(cell, val);

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

  function update(state: GameState): void {
    latestMatrix = state.aliven.interactionMatrix;

    const alivenedTierIds = getAlivenedTiersOrdered(state.aliven);
    const currentMatrixKey = alivenedTierIds.join(',');
    if (lastMatrixKey !== currentMatrixKey) {
      lastMatrixKey = currentMatrixKey;
      rebuildMatrix(alivenedTierIds, state.aliven.interactionMatrix);
    }

    for (const [key, cell] of cellElements) {
      const [r, c] = key.split(',').map(Number);
      const val = state.aliven.interactionMatrix[r][c];
      updateCellDisplay(cell, val);
      cell.title = `${cell.dataset.baseTitle ?? key}: ${val.toFixed(2)}`;
    }
  }

  return { element: matrixSection, update };
}
