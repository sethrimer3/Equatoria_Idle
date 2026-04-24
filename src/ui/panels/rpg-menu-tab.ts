/**
 * rpg-menu-tab.ts — Menu sub-tab for the RPG overlay panel.
 *
 * Renders the "Menu" sub-tab content:
 *   • Auto Move toggle checkbox
 *   • Respawn Wave checkpoint selector (visible once waves have been cleared)
 *
 * Extracted from rpg-menu-panel.ts to keep each sub-tab in its own module.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import type { ActionHandler } from '../../input';

// ─── Types ─────────────────────────────────────────────────────────

export interface RpgMenuTabPane {
  element: HTMLElement;
  /** Whether auto-move is currently enabled. Updated immediately on checkbox change. */
  isAutoMoveEnabled: boolean;
  /** Re-render the menu tab with fresh RPG state. */
  update(rpgState: RpgSimState | null): void;
}

// ─── Factory ───────────────────────────────────────────────────────

export function createRpgMenuTabPane(
  dispatch: ActionHandler,
  onAutoMoveChange: (enabled: boolean) => void,
): RpgMenuTabPane {
  const element = document.createElement('div');

  let isAutoMoveEnabled = false;

  function update(rpgState: RpgSimState | null): void {
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
      const sep = document.createElement('hr');
      sep.style.cssText = 'border:none;border-top:1px solid rgba(255,255,255,0.1);margin:8px 0;';
      element.appendChild(sep);

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
        dispatch({ kind: 'set_respawn_wave', wave: parseInt(cpSelect.value, 10) });
      });

      cpSection.appendChild(cpSelect);
      element.appendChild(cpSection);
    }
  }

  const pane: RpgMenuTabPane = {
    element,
    isAutoMoveEnabled,
    update,
  };

  return pane;
}
