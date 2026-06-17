/**
 * rpg-status-glossary-tab.ts — Status Glossary tab for the RPG menu panel.
 *
 * Lists all enemy-applied and player-received statuses with their names,
 * colors, descriptions, and source crystals.
 */

import { ENEMY_STATUS_DEFS, PLAYER_STATUS_DEFS } from '../../data/rpg/status-effect-definitions';

export interface RpgStatusGlossaryTabPane {
  element: HTMLElement;
}

export function createRpgStatusGlossaryTabPane(): RpgStatusGlossaryTabPane {
  const element = document.createElement('div');
  element.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:4px 0;';

  // ── Section: Lens statuses (applied to enemies) ────────────────────────────
  const enemyHeading = document.createElement('div');
  enemyHeading.style.cssText =
    'font-size:0.8em;font-weight:700;color:#aaa;letter-spacing:0.05em;' +
    'padding:4px 0 2px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:4px;';
  enemyHeading.textContent = '🔮 Lens Status Effects (applied to enemies)';
  element.appendChild(enemyHeading);

  for (const def of Object.values(ENEMY_STATUS_DEFS)) {
    const row = document.createElement('div');
    row.style.cssText =
      'display:flex;align-items:flex-start;gap:8px;' +
      'background:rgba(20,15,35,0.7);border-radius:5px;padding:7px 10px;' +
      `border-left:3px solid ${def.color};`;

    const label = document.createElement('span');
    label.style.cssText =
      `font-size:0.7em;font-weight:700;padding:1px 5px;border-radius:3px;` +
      `background:${def.color}33;color:${def.color};white-space:nowrap;flex-shrink:0;min-width:2.8em;text-align:center;`;
    label.textContent = def.label;
    row.appendChild(label);

    const textCol = document.createElement('div');
    textCol.style.cssText = 'flex:1;min-width:0;';

    const nameLine = document.createElement('div');
    nameLine.style.cssText = 'display:flex;align-items:baseline;gap:6px;';
    const nameSpan = document.createElement('span');
    nameSpan.style.cssText = `font-size:0.82em;font-weight:700;color:${def.color};`;
    nameSpan.textContent = def.name;
    nameLine.appendChild(nameSpan);
    if (def.sourceTier) {
      const src = document.createElement('span');
      src.style.cssText = 'font-size:0.68em;color:#666;';
      src.textContent = `via ${def.sourceTier}`;
      nameLine.appendChild(src);
    }
    textCol.appendChild(nameLine);

    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:0.74em;color:#99a;margin-top:1px;line-height:1.35;';
    desc.textContent = def.description;
    textCol.appendChild(desc);

    row.appendChild(textCol);
    element.appendChild(row);
  }

  // ── Section: Player-received statuses ──────────────────────────────────────
  const playerHeading = document.createElement('div');
  playerHeading.style.cssText =
    'font-size:0.8em;font-weight:700;color:#aaa;letter-spacing:0.05em;' +
    'padding:8px 0 2px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:4px;margin-top:6px;';
  playerHeading.textContent = '🛡 Player Status Effects (inflicted by enemies)';
  element.appendChild(playerHeading);

  for (const def of Object.values(PLAYER_STATUS_DEFS)) {
    const row = document.createElement('div');
    row.style.cssText =
      'display:flex;align-items:flex-start;gap:8px;' +
      'background:rgba(20,15,35,0.7);border-radius:5px;padding:7px 10px;' +
      `border-left:3px solid ${def.color};`;

    const label = document.createElement('span');
    label.style.cssText =
      `font-size:0.7em;font-weight:700;padding:1px 5px;border-radius:3px;` +
      `background:${def.color}33;color:${def.color};white-space:nowrap;flex-shrink:0;min-width:2.8em;text-align:center;`;
    label.textContent = def.label;
    row.appendChild(label);

    const textCol = document.createElement('div');
    textCol.style.cssText = 'flex:1;min-width:0;';

    const nameSpan = document.createElement('span');
    nameSpan.style.cssText = `font-size:0.82em;font-weight:700;color:${def.color};`;
    nameSpan.textContent = def.name;
    textCol.appendChild(nameSpan);

    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:0.74em;color:#99a;margin-top:1px;line-height:1.35;';
    desc.textContent = def.description;
    textCol.appendChild(desc);

    row.appendChild(textCol);
    element.appendChild(row);
  }

  return { element };
}
