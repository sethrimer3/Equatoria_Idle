/**
 * rpg-menu-tab.ts — Menu sub-tab for the RPG overlay panel.
 *
 * Renders the "Menu" sub-tab content:
 *   • Auto Move toggle checkbox
 *   • Respawn Wave checkpoint selector (visible once waves have been cleared)
 *   • Dev Mode: Jump to Wave selector (visible only when isDevMode is true)
 *
 * Extracted from rpg-menu-panel.ts to keep each sub-tab in its own module.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import type { ActionHandler } from '../../input';
import { makePageBreak } from '../ui-helpers';

// ─── Constants ─────────────────────────────────────────────────────

/** Highest wave available in the dev "Jump to Wave" selector. */
const DEV_WAVE_JUMP_MAX = 1000;

// ─── Types ─────────────────────────────────────────────────────────

export interface RpgMenuTabPane {
  element: HTMLElement;
  /** Whether auto-move is currently enabled. Updated immediately on checkbox change. */
  isAutoMoveEnabled: boolean;
  /** Re-render the menu tab with fresh RPG state. */
  update(rpgState: RpgSimState | null, isDevMode?: boolean): void;
}

// ─── Factory ───────────────────────────────────────────────────────

export function createRpgMenuTabPane(
  dispatch: ActionHandler,
  onAutoMoveChange: (enabled: boolean) => void,
): RpgMenuTabPane {
  const element = document.createElement('div');

  let isAutoMoveEnabled = false;
  let isConfirmingRespawn = false;

  function update(rpgState: RpgSimState | null, isDevMode = false): void {
    element.innerHTML = '';

    // ── Auto Move row ──
    const row = document.createElement('div');
    row.className = 'rpg-menu__setting-row';

    const labelGroup = document.createElement('div');
    labelGroup.className = 'rpg-menu__setting-label-group';
    const labelEl = document.createElement('span');
    labelEl.className = 'rpg-menu__setting-label';
    labelEl.textContent = 'Auto Move';
    const descEl = document.createElement('span');
    descEl.className = 'rpg-menu__setting-desc';
    descEl.textContent = 'Automatically move toward the nearest enemy. Manual joystick overrides while active.';
    labelGroup.appendChild(labelEl);
    labelGroup.appendChild(descEl);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'settings-checkbox';
    checkbox.checked = isAutoMoveEnabled;
    checkbox.addEventListener('change', () => {
      isAutoMoveEnabled = checkbox.checked;
      pane.isAutoMoveEnabled = isAutoMoveEnabled;
      onAutoMoveChange(isAutoMoveEnabled);
    });

    row.appendChild(labelGroup);
    row.appendChild(checkbox);
    element.appendChild(row);

    // ── Checkpoint selector ──
    const checkpointCount = rpgState ? Math.floor(rpgState.highestWaveReached / 10) : 0;
    if (checkpointCount > 0) {
      element.appendChild(makePageBreak('small'));

      const cpSection = document.createElement('div');
      cpSection.className = 'rpg-menu__setting-row';
      cpSection.style.flexDirection = 'column';
      cpSection.style.alignItems = 'flex-start';
      cpSection.style.gap = '6px';

      const cpLabel = document.createElement('span');
      cpLabel.className = 'rpg-menu__setting-label';
      cpLabel.textContent = 'Respawn Wave';
      cpSection.appendChild(cpLabel);

      const cpDesc = document.createElement('span');
      cpDesc.className = 'rpg-menu__setting-desc';
      cpDesc.textContent = 'Choose which checkpoint to restart from on death. Unlocked every 10 waves cleared.';
      cpSection.appendChild(cpDesc);

      const cpSelect = document.createElement('select');
      cpSelect.className = 'settings-select';
      cpSelect.style.cssText = 'background:#1a1a2e;color:#fff172;border:1px solid rgba(255, 241, 114,0.4);padding:4px 8px;border-radius:4px;font-size:0.85em;width:100%;';

      const opt0 = document.createElement('option');
      opt0.value = '0';
      opt0.textContent = 'Wave 1 (default)';
      if (rpgState?.respawnWave === 0) opt0.selected = true;
      cpSelect.appendChild(opt0);

      for (let i = 1; i <= checkpointCount; i++) {
        const waveNum = i * 10;
        const opt = document.createElement('option');
        opt.value = String(waveNum);
        opt.textContent = `Wave ${waveNum}`;
        if (rpgState?.respawnWave === waveNum) opt.selected = true;
        cpSelect.appendChild(opt);
      }

      cpSelect.addEventListener('change', () => {
        isConfirmingRespawn = false;
        dispatch({ kind: 'set_respawn_wave', wave: parseInt(cpSelect.value, 10) });
      });

      cpSection.appendChild(cpSelect);

      // ── Respawn button ──
      const respawnBtn = document.createElement('button');
      respawnBtn.style.cssText = 'margin-top:6px;width:100%;padding:8px 0;border-radius:4px;font-size:0.9em;font-weight:600;cursor:pointer;touch-action:manipulation;';

      function applyRespawnBtnState(confirming: boolean): void {
        respawnBtn.textContent = confirming ? 'Confirm?' : 'Respawn';
        respawnBtn.style.background  = confirming ? '#4a0000' : '#2a0a0a';
        respawnBtn.style.color       = confirming ? '#ff4444' : '#ff6666';
        respawnBtn.style.border      = confirming ? '1px solid rgba(255,68,68,0.7)' : '1px solid rgba(255,100,100,0.4)';
      }

      applyRespawnBtnState(isConfirmingRespawn);
      respawnBtn.addEventListener('click', () => {
        if (!isConfirmingRespawn) {
          isConfirmingRespawn = true;
          applyRespawnBtnState(true);
        } else {
          isConfirmingRespawn = false;
          dispatch({ kind: 'respawn_now' });
        }
      });

      cpSection.appendChild(respawnBtn);
      element.appendChild(cpSection);
    }

    // ── Dev Mode: Jump to Wave ──
    if (isDevMode) {
      element.appendChild(makePageBreak('small'));

      const devSection = document.createElement('div');
      devSection.className = 'rpg-menu__setting-row';
      devSection.style.flexDirection = 'column';
      devSection.style.alignItems = 'flex-start';
      devSection.style.gap = '6px';

      const devLabel = document.createElement('span');
      devLabel.className = 'rpg-menu__setting-label';
      devLabel.style.color = '#ffcc44';
      devLabel.textContent = '⚙ Dev: Jump to Wave';
      devSection.appendChild(devLabel);

      const devDesc = document.createElement('span');
      devDesc.className = 'rpg-menu__setting-desc';
      devDesc.textContent = 'Immediately start at any wave (dev mode only). No save required.';
      devSection.appendChild(devDesc);

      const devSelect = document.createElement('select');
      devSelect.className = 'settings-select';
      devSelect.style.cssText = 'background:#1a1a2e;color:#ffcc44;border:1px solid rgba(255,204,68,0.4);padding:4px 8px;border-radius:4px;font-size:0.85em;width:100%;';

      // Offer waves 1, 10, 20, … up to dev-accessible ceiling.
      const devOpt1 = document.createElement('option');
      devOpt1.value = '1';
      devOpt1.textContent = 'Wave 1';
      devSelect.appendChild(devOpt1);
      for (let w = 10; w <= DEV_WAVE_JUMP_MAX; w += 10) {
        const o = document.createElement('option');
        o.value = String(w);
        o.textContent = `Wave ${w}`;
        devSelect.appendChild(o);
      }

      const jumpBtn = document.createElement('button');
      jumpBtn.textContent = 'Jump';
      jumpBtn.style.cssText = 'background:#2a1a00;color:#ffcc44;border:1px solid rgba(255,204,68,0.5);padding:4px 10px;border-radius:4px;font-size:0.85em;cursor:pointer;';
      jumpBtn.addEventListener('click', () => {
        dispatch({ kind: 'dev_jump_wave', wave: parseInt(devSelect.value, 10) });
      });

      const devRow = document.createElement('div');
      devRow.style.cssText = 'display:flex;gap:6px;align-items:center;width:100%;';
      devRow.appendChild(devSelect);
      devRow.appendChild(jumpBtn);
      devSection.appendChild(devRow);
      element.appendChild(devSection);
    }
  }

  const pane: RpgMenuTabPane = {
    element,
    isAutoMoveEnabled,
    update,
  };

  return pane;
}
