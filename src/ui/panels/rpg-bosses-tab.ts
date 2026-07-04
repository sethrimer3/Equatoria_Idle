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
import {
  BOSS_NAMES, BOSS_GLOW_COLORS,
  BOSS_ATTACK1_CD_BASE, BOSS_ATTACK1_CD_P1, BOSS_ATTACK1_CD_P2,
  BOSS_ATTACK2_CD_BASE, BOSS_ATTACK2_CD_P1, BOSS_ATTACK2_CD_P2,
} from '../../render/rpg/rpg-constants';
import { isSuperSecretBoss } from '../../data/rpg/boss-metadata';
import { getBossAttackProfile, getBossAttackRhythmInfo } from '../../render/rpg/rpg-boss-attack-config';
import { getBossTempoSyncedLegacyIntervalMs } from '../../data/rpg/boss-tempo-config';
import { getBossLegacyProjectileRhythmLabel } from '../../render/rpg/rpg-boss-rhythm-timers';

export interface RpgBossesTabPane {
  element: HTMLElement;
  update(rpgState: RpgSimState | null, isDevMode?: boolean): void;
}

function getPrimaryLegacyCooldownMs(phaseIndex: 0 | 1 | 2): number {
  if (phaseIndex === 2) return BOSS_ATTACK1_CD_P2;
  if (phaseIndex === 1) return BOSS_ATTACK1_CD_P1;
  return BOSS_ATTACK1_CD_BASE;
}

function getSecondaryLegacyCooldownMs(phaseIndex: 0 | 1 | 2): number {
  if (phaseIndex === 2) return BOSS_ATTACK2_CD_P2;
  if (phaseIndex === 1) return BOSS_ATTACK2_CD_P1;
  return BOSS_ATTACK2_CD_BASE;
}

export function createRpgBossesTabPane(dispatch: ActionHandler): RpgBossesTabPane {
  const element = document.createElement('div');
  element.className = 'rpg-bosses-tab';
  element.style.cssText = 'display:flex;flex-direction:column;gap:10px;padding:6px 0;';

  function update(rpgState: RpgSimState | null, isDevMode = false): void {
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
    if (!isDevMode) {
      let nextBossId: number | null = null;
      for (let id = 0; id <= TOTAL_BOSS_COUNT; id++) {
        if (!isBossUnlocked(id, rpgState.highestWaveReached)) { nextBossId = id; break; }
      }
      if (nextBossId !== null) {
        const hint = document.createElement('div');
        hint.style.cssText = 'text-align:center;font-size:0.78em;color:#888;padding:2px 0;';
        const unlockWave = nextBossId === 0 ? 50 : nextBossId * 100;
        hint.textContent = `Next boss unlocks at wave ${unlockWave} (highest: wave ${rpgState.highestWaveReached})`;
        element.appendChild(hint);
      }
    }

    // ── Boss list ──
    const listContainer = document.createElement('div');
    listContainer.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

    for (let bossId = 0; bossId <= TOTAL_BOSS_COUNT; bossId++) {
      const unlocked = isDevMode || isBossUnlocked(bossId, rpgState.highestWaveReached);
      const bestSpeed = rpgState.bossCompletions.get(bossId) ?? 0;
      const isCompleted = bestSpeed > 0;
      const glowColor = BOSS_GLOW_COLORS[Math.min(bossId, BOSS_GLOW_COLORS.length - 1)];
      const bossName = !unlocked && isSuperSecretBoss(bossId)
        ? '???'
        : BOSS_NAMES[Math.min(bossId, BOSS_NAMES.length - 1)];

      const entry = document.createElement('div');
      entry.style.cssText = `background:${unlocked ? 'rgba(20,20,45,0.85)' : 'rgba(15,15,25,0.6)'};border:1px solid ${unlocked ? (isCompleted ? glowColor + '55' : 'rgba(255,255,255,0.15)') : 'rgba(255,255,255,0.06)'};border-radius:6px;padding:10px 12px;opacity:${unlocked ? '1' : '0.5'};`;

      const topRow = document.createElement('div');
      topRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;';

      const nameSpan = document.createElement('span');
      nameSpan.style.cssText = `font-weight:700;font-size:0.9em;color:${unlocked ? (isCompleted ? glowColor : '#ccc') : '#666'};`;
      const reallyUnlocked = isBossUnlocked(bossId, rpgState.highestWaveReached);
      nameSpan.textContent = reallyUnlocked || isDevMode
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
      waveReq.textContent = `Unlocks at wave ${bossId === 0 ? 50 : bossId * 100}`;
      subRow.appendChild(waveReq);

      if (unlocked) {
        const fightBtn = document.createElement('button');
        fightBtn.textContent = `⚔ Fight (${rpgState.bossSpeedPct}% · ${getBossXpMultiplier(rpgState.bossSpeedPct).toFixed(0)}x)`;
        fightBtn.style.cssText = `padding:5px 10px;border-radius:4px;font-size:0.78em;font-weight:600;cursor:pointer;touch-action:manipulation;background:rgba(60,20,80,0.8);color:${glowColor};border:1px solid ${glowColor}66;`;
        fightBtn.addEventListener('click', () => dispatch({ kind: 'start_boss_fight', bossId }));
        subRow.appendChild(fightBtn);
      }
      entry.appendChild(subRow);

      if (unlocked) {
        const attackProfile = getBossAttackProfile(bossId);
        if (attackProfile) {
          const attackRows = document.createElement('div');
          attackRows.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;margin-top:8px;';
          const phases = [
            ['P1', attackProfile.phase0Attacks],
            ['P2', attackProfile.phase1Attacks],
            ['P3', attackProfile.phase2Attacks],
          ] as const;
          for (const [phaseLabel, attacks] of phases) {
            const cell = document.createElement('div');
            cell.style.cssText = 'min-width:0;background:rgba(0,0,0,0.18);border:1px solid rgba(255,255,255,0.06);border-radius:4px;padding:4px 5px;';

            const title = document.createElement('div');
            title.style.cssText = 'font-size:0.66em;color:#888;margin-bottom:2px;';
            title.textContent = phaseLabel;
            cell.appendChild(title);

            const phaseIndex = phaseLabel === 'P3' ? 2 : phaseLabel === 'P2' ? 1 : 0;
            const legacyRows = [
              ['primary', getPrimaryLegacyCooldownMs(phaseIndex)],
              ['secondary', getSecondaryLegacyCooldownMs(phaseIndex)],
            ] as const;
            for (const [label, legacyMs] of legacyRows) {
              const intervalMs = getBossTempoSyncedLegacyIntervalMs(bossId, legacyMs);
              const line = document.createElement('div');
              line.style.cssText = 'display:flex;justify-content:space-between;gap:4px;font-size:0.68em;line-height:1.25;min-width:0;';

              const kind = document.createElement('span');
              kind.style.cssText = 'color:#aaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
              kind.textContent = label;
              line.appendChild(kind);

              const note = document.createElement('span');
              note.style.cssText = 'color:#fff172;font-weight:700;white-space:nowrap;';
              note.textContent = getBossLegacyProjectileRhythmLabel(bossId, intervalMs);
              line.appendChild(note);
              cell.appendChild(line);
            }

            for (const attack of attacks) {
              const rhythm = getBossAttackRhythmInfo(bossId, attack);
              const line = document.createElement('div');
              line.style.cssText = 'display:flex;justify-content:space-between;gap:4px;font-size:0.68em;line-height:1.25;min-width:0;';

              const kind = document.createElement('span');
              kind.style.cssText = 'color:#aaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
              kind.textContent = attack.kind;
              line.appendChild(kind);

              const note = document.createElement('span');
              note.style.cssText = `color:${rhythm.label === 'Atonal' ? '#b9a6ff' : '#fff172'};font-weight:700;white-space:nowrap;`;
              note.textContent = rhythm.label;
              line.appendChild(note);
              cell.appendChild(line);
            }

            attackRows.appendChild(cell);
          }
          entry.appendChild(attackRows);
        }
      }
      listContainer.appendChild(entry);
    }
    element.appendChild(listContainer);
  }

  const pane: RpgBossesTabPane = { element, update };
  return pane;
}
