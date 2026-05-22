/**
 * rpg-enemies-tab.ts — Enemies sub-tab for the RPG overlay panel.
 *
 * Shows a bestiary of all enemy types the player has encountered, plus any
 * bosses they have defeated. Each entry displays:
 *   • A small canvas icon showing the enemy's in-game appearance.
 *   • The enemy's name and base stats (HP, ATK, DEF).
 *   • A one-sentence description.
 *
 * Visibility rules:
 *   • Regular enemies: visible once the player has reached the wave where
 *     the enemy first appears (highestWaveReached >= firstWave).
 *   • Bosses: visible once the boss has been beaten (bossCompletions has
 *     a non-zero entry for the boss ID).
 *   • In developer mode: ALL entries are visible regardless of progress.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { TOTAL_BOSS_COUNT } from '../../sim/rpg/rpg-state';
import type { ActionHandler } from '../../input';
import {
  BOSS_NAMES, BOSS_HP_INIT, BOSS_ATK_INIT, BOSS_DEF_INIT, BOSS_GLOW_COLORS,
} from '../../render/rpg/rpg-constants';
import { type EnemyCatalogEntry, ENEMY_CATALOG, BOSS_DESCRIPTIONS } from './rpg-enemies-catalog';
import {
  ICON_SIZE,
  createAlivenIconCanvas, createProcIconCanvas, drawEnemyIcon, drawBossIcon,
} from './rpg-enemies-tab-icons';

// ─── Types ────────────────────────────────────────────────────────

export interface RpgEnemiesTabPane {
  element: HTMLElement;
  update(rpgState: RpgSimState | null, isDevMode: boolean): void;
}

// ─── Entry builders ───────────────────────────────────────────────

function buildEnemyEntry(
  entry: EnemyCatalogEntry,
  isLocked: boolean,
  isDevMode: boolean,
): HTMLElement {
  const box = document.createElement('div');
  box.style.cssText =
    `display:flex;gap:10px;align-items:flex-start;` +
    `background:${isLocked && !isDevMode ? 'rgba(15,10,20,0.5)' : 'rgba(20,15,35,0.85)'};` +
    `border:1px solid ${isLocked && !isDevMode ? 'rgba(255,255,255,0.07)' : entry.glowColor + '44'};` +
    `border-radius:6px;padding:10px 12px;opacity:${isLocked && !isDevMode ? '0.45' : '1'};`;

  // Icon canvas — aliven entries get an animated mini-sim; proc entries get an
  // animated procedural preview; others get a static icon.
  const isAliven = entry.id.startsWith('aliven_');
  const isProc   = entry.id.startsWith('proc_');
  const showLocked = isLocked && !isDevMode;
  let canvas: HTMLCanvasElement;

  if ((isAliven || isProc) && !showLocked) {
    canvas = isAliven ? createAlivenIconCanvas(entry) : createProcIconCanvas(entry);
  } else {
    canvas = document.createElement('canvas');
    canvas.width  = ICON_SIZE;
    canvas.height = ICON_SIZE;
    canvas.style.cssText = 'flex-shrink:0;border-radius:4px;background:rgba(0,0,0,0.35);';
    if (!showLocked) {
      drawEnemyIcon(canvas, entry);
    } else {
      // Draw a question mark for undiscovered entries
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = `bold ${ICON_SIZE * 0.5}px sans-serif`;
        ctx.fillStyle = '#555';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', ICON_SIZE / 2, ICON_SIZE / 2);
      }
    }
  }
  box.appendChild(canvas);

  // Text area
  const textArea = document.createElement('div');
  textArea.style.cssText = 'flex:1;min-width:0;';

  // Name row
  const nameRow = document.createElement('div');
  nameRow.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;';

  const nameEl = document.createElement('span');
  nameEl.style.cssText = `font-weight:700;font-size:0.88em;color:${isLocked && !isDevMode ? '#555' : entry.glowColor};`;
  nameEl.textContent = isLocked && !isDevMode ? `🔒 ??? (wave ${entry.firstWave}+)` : entry.name;
  nameRow.appendChild(nameEl);

  if (isDevMode && isLocked) {
    const devBadge = document.createElement('span');
    devBadge.style.cssText = 'font-size:0.68em;color:#ff8844;font-weight:600;margin-left:6px;white-space:nowrap;';
    devBadge.textContent = `wave ${entry.firstWave}+`;
    nameRow.appendChild(devBadge);
  }
  textArea.appendChild(nameRow);

  if (!isLocked || isDevMode) {
    // Stats row
    const statsRow = document.createElement('div');
    statsRow.style.cssText = 'display:flex;gap:8px;margin-bottom:4px;flex-wrap:wrap;';
    const stats: Array<[string, number, string]> = [
      ['HP', entry.hp, '#69db7c'],
      ['ATK', entry.atk, '#ff6b6b'],
      ['DEF', entry.def, '#74c0fc'],
    ];
    for (const [label, val, col] of stats) {
      const chip = document.createElement('span');
      chip.style.cssText = `font-size:0.72em;color:${col};white-space:nowrap;`;
      chip.textContent = `${label} ${val}`;
      statsRow.appendChild(chip);
    }
    textArea.appendChild(statsRow);

    // Description
    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:0.75em;color:#99a;line-height:1.35;';
    desc.textContent = entry.description;
    textArea.appendChild(desc);
  }

  box.appendChild(textArea);
  return box;
}

function buildBossEntry(
  bossId: number,
  isLocked: boolean,
  isDevMode: boolean,
  bestSpeed: number,
): HTMLElement {
  const glowColor = BOSS_GLOW_COLORS[Math.min(bossId, BOSS_GLOW_COLORS.length - 1)];
  const bossName = BOSS_NAMES[Math.min(bossId, BOSS_NAMES.length - 1)];
  const description = BOSS_DESCRIPTIONS[Math.min(bossId, BOSS_DESCRIPTIONS.length - 1)] ?? '';

  const box = document.createElement('div');
  box.style.cssText =
    `display:flex;gap:10px;align-items:flex-start;` +
    `background:${isLocked && !isDevMode ? 'rgba(15,10,20,0.5)' : 'rgba(25,10,40,0.9)'};` +
    `border:1px solid ${isLocked && !isDevMode ? 'rgba(255,255,255,0.07)' : glowColor + '55'};` +
    `border-radius:6px;padding:10px 12px;opacity:${isLocked && !isDevMode ? '0.4' : '1'};`;

  // Icon canvas
  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  canvas.style.cssText = 'flex-shrink:0;border-radius:4px;background:rgba(0,0,0,0.45);';
  if (!isLocked || isDevMode) {
    drawBossIcon(canvas, bossId);
  } else {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = `bold ${ICON_SIZE * 0.5}px sans-serif`;
      ctx.fillStyle = '#444';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', ICON_SIZE / 2, ICON_SIZE / 2);
    }
  }
  box.appendChild(canvas);

  // Text area
  const textArea = document.createElement('div');
  textArea.style.cssText = 'flex:1;min-width:0;';

  // Name row
  const nameRow = document.createElement('div');
  nameRow.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;';

  const nameEl = document.createElement('span');
  nameEl.style.cssText = `font-weight:700;font-size:0.88em;color:${isLocked && !isDevMode ? '#555' : glowColor};`;
  if (isLocked && !isDevMode) {
    nameEl.textContent = `🔒 Boss ${bossId} (wave ${bossId * 100})`;
  } else {
    nameEl.textContent = `${bestSpeed > 0 ? '✦ ' : ''}Boss ${bossId}: ${bossName}`;
  }
  nameRow.appendChild(nameEl);

  if (isDevMode && isLocked) {
    const devBadge = document.createElement('span');
    devBadge.style.cssText = 'font-size:0.68em;color:#ff8844;font-weight:600;margin-left:6px;white-space:nowrap;';
    devBadge.textContent = `wave ${bossId * 100}`;
    nameRow.appendChild(devBadge);
  }
  textArea.appendChild(nameRow);

  if (!isLocked || isDevMode) {
    // Stats row
    const statsRow = document.createElement('div');
    statsRow.style.cssText = 'display:flex;gap:8px;margin-bottom:4px;flex-wrap:wrap;';
    const stats: Array<[string, number, string]> = [
      ['HP', BOSS_HP_INIT, '#69db7c'],
      ['ATK', BOSS_ATK_INIT, '#ff6b6b'],
      ['DEF', BOSS_DEF_INIT, '#74c0fc'],
    ];
    for (const [label, val, col] of stats) {
      const chip = document.createElement('span');
      chip.style.cssText = `font-size:0.72em;color:${col};white-space:nowrap;`;
      chip.textContent = `${label} ${val}`;
      statsRow.appendChild(chip);
    }
    if (bestSpeed > 0) {
      const beatChip = document.createElement('span');
      beatChip.style.cssText = 'font-size:0.72em;color:#69db7c;white-space:nowrap;';
      beatChip.textContent = `Best: ${bestSpeed}% speed`;
      statsRow.appendChild(beatChip);
    }
    textArea.appendChild(statsRow);

    // Description
    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:0.75em;color:#99a;line-height:1.35;';
    desc.textContent = description;
    textArea.appendChild(desc);
  }

  box.appendChild(textArea);
  return box;
}

// ─── Factory ─────────────────────────────────────────────────────

export function createRpgEnemiesTabPane(_dispatch: ActionHandler): RpgEnemiesTabPane {
  const element = document.createElement('div');
  element.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:4px 0;';

  function update(rpgState: RpgSimState | null, isDevMode: boolean): void {
    element.innerHTML = '';
    if (!rpgState) return;

    const highestWave = rpgState.highestWaveReached;

    // ── Section heading ───────────────────────────────────────
    const heading = document.createElement('div');
    heading.style.cssText = 'font-size:0.78em;color:#888;text-align:center;margin-bottom:2px;';
    heading.textContent = isDevMode
      ? '🔧 Dev Mode — all entries visible'
      : `Encountered through wave ${highestWave}`;
    element.appendChild(heading);

    // ── Regular enemies ───────────────────────────────────────
    const enemiesHeading = document.createElement('div');
    enemiesHeading.style.cssText =
      'font-size:0.8em;font-weight:700;color:#aaa;letter-spacing:0.05em;' +
      'padding:4px 0 2px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:4px;';
    enemiesHeading.textContent = '⚔ Enemies';
    element.appendChild(enemiesHeading);

    for (const entry of ENEMY_CATALOG) {
      const isLocked = highestWave < entry.firstWave;
      // Skip locked entries unless in dev mode
      if (isLocked && !isDevMode) continue;
      element.appendChild(buildEnemyEntry(entry, isLocked, isDevMode));
    }

    // ── Bosses ────────────────────────────────────────────────
    const bossesHeading = document.createElement('div');
    bossesHeading.style.cssText =
      'font-size:0.8em;font-weight:700;color:#aaa;letter-spacing:0.05em;' +
      'padding:8px 0 2px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:4px;';
    bossesHeading.textContent = '👑 Bosses';
    element.appendChild(bossesHeading);

    let anyBossVisible = false;
    for (let bossId = 1; bossId <= TOTAL_BOSS_COUNT; bossId++) {
      const bestSpeed = rpgState.bossCompletions.get(bossId) ?? 0;
      const isBeaten = bestSpeed > 0;
      // Locked = not yet beaten
      if (!isBeaten && !isDevMode) continue;
      anyBossVisible = true;
      element.appendChild(buildBossEntry(bossId, !isBeaten, isDevMode, bestSpeed));
    }

    if (!anyBossVisible) {
      const noBosses = document.createElement('div');
      noBosses.style.cssText = 'font-size:0.78em;color:#666;text-align:center;padding:6px 0;';
      noBosses.textContent = 'No bosses defeated yet.';
      element.appendChild(noBosses);
    }
  }

  const pane: RpgEnemiesTabPane = { element, update };
  return pane;
}
