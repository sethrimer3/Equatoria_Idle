import type { ActionHandler } from '../../input';
import type { GameState } from '../../sim';
import { ALIVEN_ELIGIBLE_TIERS, MATRIX_EDIT_STEP } from '../../sim/aliven';
import type { TraceEffect } from '../../render/ui/trace-effect';

const DRAG_THRESHOLD_PX = 12;
const DRAG_PX_PER_STEP = 20;
const CONFIRM_TIMEOUT_MS = 4000;

export function canEditAlivenMatrix(state: GameState): boolean {
  return !state.aliven.matrixLocked && state.aliven.manualModeEnabled;
}

function updateCellDisplay(cell: HTMLElement, val: number): void {
  const absVal = Math.abs(val);
  cell.style.background = val > 0.01
    ? `rgba(80, 200, 120, ${Math.min(absVal * 2, 0.85)})`
    : val < -0.01 ? `rgba(220, 50, 50, ${Math.min(absVal * 2, 0.85)})` : 'rgba(80,80,100,0.25)';
  cell.style.color = val > 0.01 ? '#c8ffd8' : val < -0.01 ? '#ffc8c8' : '#888';
  cell.textContent = val.toFixed(2);
}

function lockSvg(open: boolean): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 10V7a5 5 0 0 1 ${open ? '9-3' : '10 0v3'}"/><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M12 14v3"/></svg>`;
}

function setAvailable(element: HTMLElement, available: boolean): void {
  element.classList.toggle('is-available', available);
  element.setAttribute('aria-hidden', String(!available));
  for (const button of element.querySelectorAll('button')) button.tabIndex = available ? 0 : -1;
}

export interface AlivenPaneMatrixSection {
  element: HTMLElement;
  update(state: GameState): void;
  cancelTransient(): void;
}

export function createAlivenPaneMatrixSection(dispatch: ActionHandler, traceEffect?: TraceEffect): AlivenPaneMatrixSection {
  const section = document.createElement('div');
  section.className = 'aliven-matrix-section';
  section.innerHTML = '<p class="aliven-matrix-title">Interaction Matrix</p><p class="aliven-matrix-note">Row = source (exerts force) · Col = target (feels force) · Green = attraction · Red = repulsion</p>';

  const controls = document.createElement('div');
  controls.className = 'aliven-matrix-primary-controls';
  section.appendChild(controls);

  const lockBtn = document.createElement('button');
  lockBtn.className = 'aliven-control-btn aliven-lock-btn';
  lockBtn.type = 'button';
  controls.appendChild(lockBtn);

  const unlockedControls = document.createElement('div');
  unlockedControls.className = 'aliven-unlocked-controls';
  controls.appendChild(unlockedControls);

  const manualBtn = document.createElement('button');
  manualBtn.className = 'aliven-control-btn aliven-manual-btn';
  manualBtn.type = 'button';
  manualBtn.innerHTML = '<span class="aliven-check" aria-hidden="true">✓</span><span>Manual</span>';
  unlockedControls.appendChild(manualBtn);

  function actionButton(label: string, className: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `aliven-control-btn aliven-confirm-btn ${className}`;
    button.textContent = label;
    unlockedControls.appendChild(button);
    return button;
  }
  const resetBtn = actionButton('Reset to Default', 'aliven-reset-btn');
  const randomBtn = actionButton('Randomize', 'aliven-random-btn');

  const stepControls = document.createElement('div');
  stepControls.className = 'aliven-matrix-step-controls';
  section.appendChild(stepControls);
  const addBtn = actionButton.call(null, '+0.05', 'aliven-matrix-step-btn aliven-matrix-step-btn--add');
  const subBtn = actionButton.call(null, '−0.05', 'aliven-matrix-step-btn aliven-matrix-step-btn--sub');
  unlockedControls.removeChild(addBtn); unlockedControls.removeChild(subBtn);
  stepControls.append(addBtn, subBtn);

  const matrixWrap = document.createElement('div');
  matrixWrap.className = 'aliven-matrix-wrap';
  section.appendChild(matrixWrap);
  const overlay = document.createElement('div');
  overlay.className = 'aliven-lock-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  matrixWrap.appendChild(overlay);

  let latestState: GameState | null = null;
  let selectedStep: number | null = null;
  let armed: 'reset' | 'random' | null = null;
  let confirmTimer: ReturnType<typeof setTimeout> | null = null;
  let overlayTimer: ReturnType<typeof setTimeout> | null = null;
  let previousLocked: boolean | null = null;
  const cells = new Map<string, HTMLElement>();

  function cancelTransient(): void {
    armed = null;
    if (confirmTimer) clearTimeout(confirmTimer);
    confirmTimer = null;
    if (overlayTimer) clearTimeout(overlayTimer);
    overlayTimer = null;
    overlay.classList.remove('is-playing');
    resetBtn.textContent = 'Reset to Default';
    randomBtn.textContent = 'Randomize';
    resetBtn.setAttribute('aria-pressed', 'false');
    randomBtn.setAttribute('aria-pressed', 'false');
  }

  function arm(kind: 'reset' | 'random'): void {
    if (!latestState || latestState.aliven.matrixLocked) return;
    if (armed === kind) {
      dispatch({ kind: kind === 'reset' ? 'reset_interaction_matrix' : 'randomize_interaction_matrix' });
      cancelTransient();
      return;
    }
    cancelTransient();
    armed = kind;
    const button = kind === 'reset' ? resetBtn : randomBtn;
    button.textContent = 'Confirm?';
    button.setAttribute('aria-pressed', 'true');
    confirmTimer = setTimeout(cancelTransient, CONFIRM_TIMEOUT_MS);
  }

  function playOverlay(locked: boolean): void {
    if (overlayTimer) clearTimeout(overlayTimer);
    overlay.className = `aliven-lock-overlay ${locked ? 'is-locked' : 'is-unlocked'}`;
    overlay.innerHTML = lockSvg(!locked);
    void overlay.offsetWidth;
    overlay.classList.add('is-playing');
    overlayTimer = setTimeout(() => overlay.classList.remove('is-playing'), 1050);
  }

  lockBtn.addEventListener('click', () => {
    if (!latestState) return;
    dispatch({ kind: 'set_aliven_matrix_locked', locked: !latestState.aliven.matrixLocked });
  });
  manualBtn.addEventListener('click', () => {
    if (!latestState || latestState.aliven.matrixLocked) return;
    dispatch({ kind: 'set_aliven_manual_mode', enabled: !latestState.aliven.manualModeEnabled });
  });
  resetBtn.addEventListener('click', () => arm('reset'));
  randomBtn.addEventListener('click', () => arm('random'));
  addBtn.addEventListener('click', () => { if (latestState && canEditAlivenMatrix(latestState)) selectedStep = selectedStep === MATRIX_EDIT_STEP ? null : MATRIX_EDIT_STEP; });
  subBtn.addEventListener('click', () => { if (latestState && canEditAlivenMatrix(latestState)) selectedStep = selectedStep === -MATRIX_EDIT_STEP ? null : -MATRIX_EDIT_STEP; });

  let dragRow = -1, dragCol = -1, dragStartY = 0, dragBaseValue = 0, dragLastSteps = 0;
  let dragHasMoved = false;
  function stopDrag(): void { dragRow = dragCol = -1; dragHasMoved = false; dragLastSteps = 0; traceEffect?.setMatrixTarget(null); }

  function rebuild(): void {
    matrixWrap.querySelector('.aliven-matrix')?.remove();
    cells.clear();
    const table = document.createElement('div');
    table.className = 'aliven-matrix';
    table.style.gridTemplateColumns = `auto repeat(${ALIVEN_ELIGIBLE_TIERS.length}, minmax(44px, 1fr))`;
    const corner = document.createElement('div'); corner.className = 'aliven-matrix-corner'; corner.textContent = 'src \\ tgt'; table.appendChild(corner);
    for (const tier of ALIVEN_ELIGIBLE_TIERS) {
      const head = document.createElement('div'); head.className = 'aliven-matrix-col-head'; head.textContent = tier.displayName; head.style.color = tier.color; table.appendChild(head);
    }
    for (const source of ALIVEN_ELIGIBLE_TIERS) {
      const row = document.createElement('div'); row.className = 'aliven-matrix-row-head'; row.textContent = source.displayName; row.style.color = source.color; table.appendChild(row);
      for (const target of ALIVEN_ELIGIBLE_TIERS) {
        const src = source.unlockOrder, tgt = target.unlockOrder;
        const cell = document.createElement('div'); cell.className = 'aliven-matrix-cell'; cell.tabIndex = -1;
        cell.dataset.baseTitle = `${source.displayName} → ${target.displayName}`;
        cell.addEventListener('pointerdown', e => {
          if (!latestState || !canEditAlivenMatrix(latestState)) return;
          e.preventDefault(); dragRow = src; dragCol = tgt; dragStartY = e.clientY; dragBaseValue = latestState.aliven.interactionMatrix[src][tgt]; dragLastSteps = 0; dragHasMoved = false; cell.setPointerCapture(e.pointerId); traceEffect?.setMatrixTarget(cell);
        });
        cell.addEventListener('pointermove', e => {
          if (!latestState || !canEditAlivenMatrix(latestState) || dragRow !== src || dragCol !== tgt) { if (dragRow >= 0) stopDrag(); return; }
          const distance = Math.abs(e.clientY - dragStartY); if (distance >= DRAG_THRESHOLD_PX) dragHasMoved = true; if (!dragHasMoved) return;
          const steps = Math.trunc((dragStartY - e.clientY) / DRAG_PX_PER_STEP);
          if (steps !== dragLastSteps) { dragLastSteps = steps; dispatch({ kind: 'set_interaction_matrix_cell', row: src, col: tgt, value: dragBaseValue + steps * MATRIX_EDIT_STEP }); }
        });
        cell.addEventListener('pointerup', () => {
          if (dragRow !== src || dragCol !== tgt) return;
          if (!dragHasMoved && selectedStep !== null && latestState && canEditAlivenMatrix(latestState)) dispatch({ kind: 'set_interaction_matrix_cell', row: src, col: tgt, value: latestState.aliven.interactionMatrix[src][tgt] + selectedStep });
          stopDrag();
        });
        cell.addEventListener('pointercancel', stopDrag);
        cells.set(`${src},${tgt}`, cell); table.appendChild(cell);
      }
    }
    matrixWrap.appendChild(table);
  }

  function update(state: GameState): void {
    latestState = state;
    const locked = state.aliven.matrixLocked;
    if (previousLocked !== null && previousLocked !== locked) playOverlay(locked);
    previousLocked = locked;
    if (locked) { cancelTransient(); selectedStep = null; stopDrag(); }
    lockBtn.innerHTML = `${lockSvg(!locked)}<span>${locked ? 'Locked' : 'Unlocked'}</span>`;
    lockBtn.classList.toggle('is-locked', locked); lockBtn.classList.toggle('is-unlocked', !locked);
    lockBtn.setAttribute('aria-label', locked ? 'Unlock interaction matrix' : 'Lock interaction matrix');
    lockBtn.setAttribute('aria-pressed', String(locked));
    setAvailable(unlockedControls, !locked);
    manualBtn.classList.toggle('is-checked', state.aliven.manualModeEnabled);
    manualBtn.setAttribute('aria-checked', String(state.aliven.manualModeEnabled));
    manualBtn.setAttribute('role', 'checkbox');
    setAvailable(stepControls, canEditAlivenMatrix(state));
    addBtn.classList.toggle('selected', selectedStep === MATRIX_EDIT_STEP);
    subBtn.classList.toggle('selected', selectedStep === -MATRIX_EDIT_STEP);
    section.classList.toggle('is-matrix-locked', locked);
    if (cells.size === 0) rebuild();
    for (const [key, cell] of cells) {
      const [r, c] = key.split(',').map(Number); const value = state.aliven.interactionMatrix[r][c]; updateCellDisplay(cell, value); cell.title = `${cell.dataset.baseTitle}: ${value.toFixed(2)}`;
    }
  }

  return { element: section, update, cancelTransient };
}
