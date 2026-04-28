/**
 * rpg-bosses-tab.ts — Bosses sub-tab for the RPG overlay panel.
 *
 * Shows the boss list with lock/completion status and a speed selector.
 * Each boss is unlocked when the player reaches wave N*100.
 * The speed control adjusts bossSpeedPct (10–100, steps of 10).
 * On each unlocked boss entry shows completion status, best speed, and XP multiplier.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import {
  isBossUnlocked, getBossXpMultiplier,
  TOTAL_BOSS_COUNT, MIN_BOSS_SPEED_PCT, MAX_BOSS_SPEED_PCT, BOSS_SPEED_STEP,
} from '../../sim/rpg/rpg-state';
import type { ActionHandler } from '../../input';
import { BOSS_NAMES, BOSS_GLOW_COLORS } from '../../render/rpg/rpg-constants';

export interface RpgBossesTabPane {
  element: HTMLElement;
  update(rpgState: RpgSimState | null): void;
}

export function createRpgBossesTabPane(dispatch: ActionHandler): RpgBossesTabPane {
  const element = document.createElement('div');
  element.className = 'rpg-bosses-tab';
  element.style.cssText = 'display:flex;flex-direction:column;gap:10px;padding:6px 0;';

  function update(rpgState: RpgSimState | null): void {
    element.innerHTML = '';
    if (!rpgState) return;

    // ── Speed control ──────────────────────────────────────────
    const speedSection = document.createElement('div');
    speedSection.style.cssText = 'background:rgba(20,20,40,0.7);border:1px solid rgba(255,241,114,0.25);border-radius:6px;padding:10px 12px;';

    const speedHeader = document.createElement('div');
    speedHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';

    const speedLabel = document.createElement('span');
    speedLabel.className = 'rpg-menu__setting-label';
    speedLabel.textContent = '⚡ Boss Speed';
    speedHeader.appendChild(speedLabel);

    const speedValue = document.createElement('span');
    speedValue.style.cssText = 'color:#fff172;font-weight:700;font-size:1em;';
    speedValue.textContent = `${rpgState.bossSpeedPct}%`;
    speedHeader.appendChild(speedValue);
    speedSection.appendChild(speedHeader);

    const speedDesc = document.createElement('span');
    speedDesc.className = 'rpg-menu__setting-desc';
    speedDesc.style.display = 'block';
    speedDesc.style.marginBottom = '8px';
    speedDesc.textContent = `XP multiplier: ${getBossXpMultiplier(rpgState.bossSpeedPct).toFixed(0)}x — Lower speed = easier dodging, less XP.`;
    speedSection.appendChild(speedDesc);

    const speedRow = document.createElement('div');
    speedRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';
    for (let pct = MIN_BOSS_SPEED_PCT; pct <= MAX_BOSS_SPEED_PCT; pct += BOSS_SPEED_STEP) {
      const btn = document.createElement('button');
      btn.textContent = `${pct}%`;
      const isActive = rpgState.bossSpeedPct === pct;
      btn.style.cssText = `padding:4px 6px;border-radius:4px;font-size:0.78em;font-weight:600;cursor:pointer;touch-action:manipulation;background:${isActive ? 'rgba(255,241,114,0.25)' : 'rgba(20,20,40,0.9)'};color:${isActive ? '#fff172' : '#aaa'};border:1px solid ${isActive ? 'rgba(255,241,114,0.6)' : 'rgba(255,255,255,0.1)'};`;
      btn.addEventListener('click', () => dispatch({ kind: 'set_boss_speed', pct }));
      speedRow.appendChild(btn);
    }
    speedSection.appendChild(speedRow);
    element.appendChild(speedSection);

    // ── Next unlock hint ──
    let nextBossId: number | null = null;
    for (let id = 1; id <= TOTAL_BOSS_COUNT; id++) {
      if (!isBossUnlocked(id, rpgState.highestWaveReached)) { nextBossId = id; break; }
    }
    if (nextBossId !== null) {
      const hint = document.createElement('div');
      hint.style.cssText = 'text-align:center;font-size:0.78em;color:#888;padding:2px 0;';
      hint.textContent = `Next boss unlocks at wave ${nextBossId * 100} (highest: wave ${rpgState.highestWaveReached})`;
      element.appendChild(hint);
    }

    // ── Boss list ──
    const listContainer = document.createElement('div');
    listContainer.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

    for (let bossId = 1; bossId <= TOTAL_BOSS_COUNT; bossId++) {
      const unlocked = isBossUnlocked(bossId, rpgState.highestWaveReached);
      const bestSpeed = rpgState.bossCompletions.get(bossId) ?? 0;
      const isCompleted = bestSpeed > 0;
      const glowColor = BOSS_GLOW_COLORS[Math.min(bossId, BOSS_GLOW_COLORS.length - 1)];
      const bossName = BOSS_NAMES[Math.min(bossId, BOSS_NAMES.length - 1)];

      const entry = document.createElement('div');
      entry.style.cssText = `background:${unlocked ? 'rgba(20,20,45,0.85)' : 'rgba(15,15,25,0.6)'};border:1px solid ${unlocked ? (isCompleted ? glowColor + '55' : 'rgba(255,255,255,0.15)') : 'rgba(255,255,255,0.06)'};border-radius:6px;padding:10px 12px;opacity:${unlocked ? '1' : '0.5'};`;

      const topRow = document.createElement('div');
      topRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;';

      const nameSpan = document.createElement('span');
      nameSpan.style.cssText = `font-weight:700;font-size:0.9em;color:${unlocked ? (isCompleted ? glowColor : '#ccc') : '#666'};`;
      nameSpan.textContent = unlocked
        ? `${isCompleted ? '✦ ' : ''}Boss ${bossId}: ${bossName}`
        : `🔒 Boss ${bossId}: ${bossName}`;
      topRow.appendChild(nameSpan);

      if (unlocked && isCompleted) {
        const badge = document.createElement('span');
        badge.style.cssText = 'font-size:0.78em;color:#69db7c;font-weight:600;white-space:nowrap;';
        badge.textContent = `Best: ${bestSpeed}% (${getBossXpMultiplier(bestSpeed).toFixed(0)}x XP)`;
        topRow.appendChild(badge);
      }
      entry.appendChild(topRow);

      const subRow = document.createElement('div');
      subRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

      const waveReq = document.createElement('span');
      waveReq.style.cssText = 'font-size:0.75em;color:#666;';
      waveReq.textContent = `Unlocks at wave ${bossId * 100}`;
      subRow.appendChild(waveReq);

      if (unlocked) {
        const fightBtn = document.createElement('button');
        fightBtn.textContent = `⚔ Fight (${rpgState.bossSpeedPct}% · ${getBossXpMultiplier(rpgState.bossSpeedPct).toFixed(0)}x)`;
        fightBtn.style.cssText = `padding:5px 10px;border-radius:4px;font-size:0.78em;font-weight:600;cursor:pointer;touch-action:manipulation;background:rgba(60,20,80,0.8);color:${glowColor};border:1px solid ${glowColor}66;`;
        fightBtn.addEventListener('click', () => dispatch({ kind: 'start_boss_fight', bossId }));
        subRow.appendChild(fightBtn);
      }
      entry.appendChild(subRow);
      listContainer.appendChild(entry);
    }
    element.appendChild(listContainer);
  }

  const pane: RpgBossesTabPane = { element, update };
  return pane;
}
