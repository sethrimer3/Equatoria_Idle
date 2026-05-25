/**
 * rpg-zone-select.ts — DOM overlay for RPG zone selection.
 *
 * Displayed as a modal-style panel inside `#rpg-area` when the player taps the
 * zone-name / wave label at the top-left of the RPG canvas.
 *
 * Responsibilities:
 *   - List all 5 zones with their display name and highest wave reached.
 *   - Highlight the currently active zone.
 *   - Call `onZoneSelect(zoneId)` when the player confirms a switch.
 *   - Provide a close button (or auto-close on same-zone tap).
 */

import type { RpgZoneId } from '../../data/rpg/rpg-zone-definitions';
import { RPG_ZONE_DEFINITIONS } from '../../data/rpg/rpg-zone-definitions';
import type { RpgSimState } from '../../sim/rpg/rpg-state';

// ─── Types ────────────────────────────────────────────────────────

export interface RpgZoneSelectPanel {
  /** Root element — appended to #rpg-area (the scaled RPG container). */
  element: HTMLElement;
  /** Show the panel and refresh zone stats from rpgSimState. */
  open(): void;
  /** Hide the panel. */
  close(): void;
  /** Whether the panel is currently visible. */
  isOpen: boolean;
}

// ─── Factory ─────────────────────────────────────────────────────

export function createRpgZoneSelectPanel(
  rpgSimState: RpgSimState,
  onZoneSelect: (zoneId: RpgZoneId) => void,
): RpgZoneSelectPanel {
  let _isOpen = false;

  // ── Root overlay ──
  const overlay = document.createElement('div');
  overlay.id = 'rpg-zone-select';
  overlay.style.cssText = [
    'display:none',
    'position:absolute',
    'inset:0',
    'background:rgba(4,4,12,0.88)',
    'z-index:20',
    'display:none',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'font-family:monospace',
    'color:#e8dfc0',
  ].join(';');

  // ── Header row ──
  const header = document.createElement('div');
  header.style.cssText = [
    'display:flex',
    'align-items:center',
    'justify-content:space-between',
    'width:88%',
    'margin-bottom:10px',
  ].join(';');

  const title = document.createElement('span');
  title.textContent = '⬡ Select Zone';
  title.style.cssText = 'font-size:13px;font-weight:bold;color:#fff172;letter-spacing:1px';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Close zone selection');
  closeBtn.style.cssText = [
    'background:none',
    'border:1px solid #555',
    'color:#aaa',
    'font-size:13px',
    'padding:2px 7px',
    'cursor:pointer',
    'border-radius:3px',
  ].join(';');
  closeBtn.addEventListener('click', () => handle.close());

  header.appendChild(title);
  header.appendChild(closeBtn);
  overlay.appendChild(header);

  // ── Zone list ──
  const list = document.createElement('div');
  list.style.cssText = 'width:88%;display:flex;flex-direction:column;gap:7px';
  overlay.appendChild(list);

  // ── Build zone rows ──
  function buildRows(): void {
    list.innerHTML = '';
    for (const zoneDef of RPG_ZONE_DEFINITIONS) {
      const isActive = rpgSimState.activeZoneId === zoneDef.id;
      const bestWave  = rpgSimState.highestWaveReachedByZone[zoneDef.id] ?? 0;

      const row = document.createElement('button');
      row.style.cssText = [
        'display:flex',
        'align-items:center',
        'justify-content:space-between',
        'padding:8px 12px',
        'border-radius:5px',
        'cursor:pointer',
        'font-family:monospace',
        'font-size:11px',
        'text-align:left',
        'transition:background 0.15s',
        isActive
          ? 'background:#1e1a08;border:1.5px solid #fff172;color:#fff172'
          : 'background:#0e0e18;border:1px solid #333;color:#b0a880',
      ].join(';');

      const nameSpan = document.createElement('span');
      nameSpan.textContent = (isActive ? '▶ ' : '  ') + zoneDef.displayName;
      nameSpan.style.cssText = 'font-weight:bold;font-size:12px';

      const infoSpan = document.createElement('span');
      infoSpan.style.cssText = 'font-size:10px;opacity:0.75;text-align:right';
      infoSpan.textContent = bestWave > 0 ? `Best: x${bestWave}` : 'Not reached';

      row.appendChild(nameSpan);
      row.appendChild(infoSpan);

      row.addEventListener('click', () => {
        if (!isActive) {
          onZoneSelect(zoneDef.id);
        }
        handle.close();
      });

      // Hover effect
      row.addEventListener('mouseenter', () => {
        if (!isActive) row.style.background = '#181820';
      });
      row.addEventListener('mouseleave', () => {
        if (!isActive) row.style.background = '#0e0e18';
      });

      list.appendChild(row);
    }
  }

  // ── Public handle ──
  const handle: RpgZoneSelectPanel = {
    element: overlay,

    open(): void {
      buildRows();
      overlay.style.display = 'flex';
      _isOpen = true;
    },

    close(): void {
      overlay.style.display = 'none';
      _isOpen = false;
    },

    get isOpen(): boolean {
      return _isOpen;
    },
  };

  return handle;
}
