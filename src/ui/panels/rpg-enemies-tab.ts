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
 *   • In normal mode: up to 2 locked future entries per zone (3 for ALL)
 *     are shown as dim teaser cards without revealing real stats/descriptions.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getCodexBonusPercent, getNextVisibleCodexMilestone } from '../../sim/rpg/rpg-codex';
import { TOTAL_BOSS_COUNT } from '../../sim/rpg/rpg-state';
import type { ActionHandler } from '../../input';
import {
  BOSS_NAMES, BOSS_HP_INIT, BOSS_ATK_INIT, BOSS_DEF_INIT, BOSS_GLOW_COLORS,
} from '../../render/rpg/rpg-constants';
import { type EnemyCatalogEntry, type EnemyZoneId, ENEMY_CATALOG, BOSS_DESCRIPTIONS } from './rpg-enemies-catalog';
import {
  ICON_SIZE,
  createAlivenIconCanvas, createProcIconCanvas, drawEnemyIcon, drawBossIcon,
} from './rpg-enemies-tab-icons';
import { getEnemyStatusAffinity } from '../../data/rpg/enemy-status-affinities';
import type { EnemyStatusKey } from '../../sim/rpg/enemy-status-effects';
import { ENEMY_STATUS_DEFS, PLAYER_STATUS_DEFS } from '../../data/rpg/status-effect-definitions';
import { ENEMY_STATUS_SOURCES } from '../../data/rpg/enemy-status-sources';

// ─── Types ────────────────────────────────────────────────────────

export interface RpgEnemiesTabPane {
  element: HTMLElement;
  update(rpgState: RpgSimState | null, isDevMode: boolean): void;
}

type EnemyZoneTabId = 'all' | EnemyZoneId;

const ENEMY_ZONE_TABS: ReadonlyArray<{ id: EnemyZoneTabId; label: string }> = [
  { id: 'all', label: 'ALL' },
  { id: 'euhedral', label: 'Euhedral' },
  { id: 'impetus', label: 'Impetus' },
  { id: 'caustics', label: 'Caustics' },
  { id: 'verdure', label: 'Verdure' },
  { id: 'horizon', label: 'Horizon' },
];

const ZONE_TAB_GLYPH: Record<EnemyZoneTabId, string> = {
  all:      '◇',
  euhedral: '◆',
  impetus:  '⊕',
  caustics: '≈',
  verdure:  '✿',
  horizon:  '✦',
};

function emptyZoneMessage(zoneId: EnemyZoneTabId): string {
  if (zoneId === 'horizon') return 'No Horizon enemies documented yet.';
  const zone = ENEMY_ZONE_TABS.find(tab => tab.id === zoneId);
  return zone ? `No ${zone.label} enemies documented yet.` : 'No enemies documented yet.';
}

// ─── Codex header ─────────────────────────────────────────────────

function buildCodexHeader(rpgState: RpgSimState, isDevMode: boolean): HTMLElement {
  const highestWave = rpgState.highestWaveReached;
  const totalEncountered = rpgState.encounteredEnemyTypes.size;
  const totalEntries = ENEMY_CATALOG.length;

  const header = document.createElement('div');
  header.className = 'rpg-codex-header';

  const title = document.createElement('div');
  title.className = 'rpg-codex-title';
  title.textContent = 'ENEMY CODEX';
  header.appendChild(title);

  const subtitle = document.createElement('div');
  subtitle.className = 'rpg-codex-subtitle';
  if (isDevMode) {
    subtitle.textContent = '🔧 Dev Mode — all entries visible';
  } else {
    subtitle.textContent = `${totalEncountered} encountered · Wave ${highestWave}`;
  }
  header.appendChild(subtitle);

  const progressWrap = document.createElement('div');
  progressWrap.className = 'rpg-codex-progress-wrap';
  const progressBar = document.createElement('div');
  progressBar.className = 'rpg-codex-progress-bar';
  const pct = totalEntries > 0 ? Math.min(100, (totalEncountered / totalEntries) * 100) : 0;
  progressBar.style.width = `${pct}%`;
  progressWrap.appendChild(progressBar);
  header.appendChild(progressWrap);

  return header;
}

// ─── Icon helpers ─────────────────────────────────────────────────

function makeStatIconSvg(type: 'hp' | 'atk' | 'def'): string {
  if (type === 'hp') {
    return `<svg width="11" height="10" viewBox="0 0 11 10" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M5.5 9S1 5.9 1 3.4C1 2 2.1 1 3.4 1c.7 0 1.4.4 2.1 1.1C6.2 1.4 6.9 1 7.6 1 8.9 1 10 2 10 3.4 10 5.9 5.5 9 5.5 9Z"/></svg>`;
  } else if (type === 'atk') {
    return `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><line x1="2" y1="8" x2="8" y2="2"/><polyline points="5.5,2 8,2 8,4.5"/></svg>`;
  } else {
    return `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.3" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M5 1L1.5 3V6C1.5 7.9 3.1 9.3 5 9.3S8.5 7.9 8.5 6V3Z"/></svg>`;
  }
}

const STATUS_ICON_GLYPH: Record<string, string> = {
  burning:      '♨',
  poisoned:     '☠',
  chilled:      '❄',
  frozen:       '✦',
  timeWarped:   '⏱',
  slowed:       '⧖',
  abraded:      '⚙',
  refracted:    '◈',
  radiant:      '☀',
  echoMarked:   '◎',
  cracked:      '✕',
  gravitized:   '⊙',
  fractalWound: '✿',
  riftScarred:  '◆',
};

const ZONE_ICON_GLYPH: Record<string, string> = {
  euhedral: '◆',
  impetus:  '⊕',
  caustics: '≈',
  verdure:  '✿',
  horizon:  '✦',
};

const ZONE_COLOR: Record<string, string> = {
  euhedral: '#74c0fc',
  impetus:  '#ffe066',
  caustics: '#55e0c0',
  verdure:  '#69db7c',
  horizon:  '#cc99ff',
};

function formatBonus(bonus: number): string {
  const rounded = Math.round(bonus * 10) / 10;
  return `+${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function makeStatChip(label: string, val: number | string, type: string): HTMLElement {
  const chip = document.createElement('span');
  chip.className = `rpg-codex-stat-chip rpg-codex-stat-chip--${type}`;
  chip.innerHTML = `${makeStatIconSvg(type as 'hp' | 'atk' | 'def')}<span class="rpg-codex-stat-label">${label}</span><span class="rpg-codex-stat-val">${val}</span>`;
  return chip;
}

function makeLockedStatChip(label: string): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'rpg-codex-stat-chip rpg-codex-stat-chip--locked';
  chip.innerHTML = `<span class="rpg-codex-stat-icon-stub">–</span><span class="rpg-codex-stat-label">${label}</span><span class="rpg-codex-stat-val">???</span>`;
  return chip;
}

function makeStatusIconChip(statusKey: string, modifier: string, color: string, defName: string): HTMLElement {
  const chip = document.createElement('span');
  chip.className = `rpg-codex-status-icon-chip rpg-codex-status-icon-chip--${modifier}`;
  chip.style.setProperty('--chip-color', color);
  chip.setAttribute('title', `${defName}: ${modifier.toUpperCase()}`);
  chip.setAttribute('aria-label', `${defName}: ${modifier.toUpperCase()}`);
  const glyph = STATUS_ICON_GLYPH[statusKey] ?? '?';
  chip.textContent = glyph;
  return chip;
}

function makeZoneIconChip(zone: string): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'rpg-codex-zone-icon-chip';
  const color = ZONE_COLOR[zone] ?? '#aaa';
  chip.style.setProperty('--chip-color', color);
  chip.setAttribute('title', zone.charAt(0).toUpperCase() + zone.slice(1));
  chip.textContent = ZONE_ICON_GLYPH[zone] ?? '◈';
  return chip;
}

// ─── Entry builders ───────────────────────────────────────────────

function buildEnemyEntry(
  entry: EnemyCatalogEntry,
  isLocked: boolean,
  isDevMode: boolean,
  isHighlighted: boolean,
  kills: number,
  bonus: number,
  nextMilestone: number | null,
): HTMLElement {
  const showLocked = isLocked && !isDevMode;

  const box = document.createElement('div');
  box.className = [
    'rpg-codex-card',
    showLocked ? 'rpg-codex-card--locked' : '',
    isHighlighted ? 'rpg-codex-card--selected' : '',
  ].filter(Boolean).join(' ');

  // Icon frame
  const iconFrame = document.createElement('div');
  iconFrame.className = 'rpg-codex-icon-frame';
  if (!showLocked) {
    iconFrame.style.borderColor = entry.glowColor + '55';
  }

  const isAliven = entry.id.startsWith('aliven_');
  const isProc   = entry.id.startsWith('proc_');
  let canvas: HTMLCanvasElement;

  if ((isAliven || isProc) && !showLocked) {
    canvas = isAliven ? createAlivenIconCanvas(entry) : createProcIconCanvas(entry);
  } else {
    canvas = document.createElement('canvas');
    canvas.width  = ICON_SIZE;
    canvas.height = ICON_SIZE;
    if (!showLocked) {
      drawEnemyIcon(canvas, entry);
    } else {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = `bold ${ICON_SIZE * 0.5}px sans-serif`;
        ctx.fillStyle = '#3a3050';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', ICON_SIZE / 2, ICON_SIZE / 2);
      }
    }
  }
  canvas.className = 'rpg-codex-icon-canvas';
  iconFrame.appendChild(canvas);
  box.appendChild(iconFrame);

  // Body
  const body = document.createElement('div');
  body.className = 'rpg-codex-body';

  // Name row
  const nameRow = document.createElement('div');
  nameRow.className = 'rpg-codex-name-row';

  const nameEl = document.createElement('span');
  nameEl.className = 'rpg-codex-name' + (showLocked ? ' rpg-codex-name--locked' : '');
  if (showLocked) {
    const zoneLabel = entry.zone
      ? entry.zone.charAt(0).toUpperCase() + entry.zone.slice(1)
      : 'Enemy';
    nameEl.textContent = `Unknown ${zoneLabel}`;
  } else {
    nameEl.style.color = entry.glowColor;
    nameEl.textContent = entry.name;
  }
  nameRow.appendChild(nameEl);

  if (isDevMode && isLocked) {
    const devBadge = document.createElement('span');
    devBadge.className = 'rpg-codex-dev-badge';
    devBadge.textContent = `wave ${entry.firstWave}+`;
    nameRow.appendChild(devBadge);
  }
  body.appendChild(nameRow);

  if (!showLocked) {
    // Stats row with icon chips
    const statsRow = document.createElement('div');
    statsRow.className = 'rpg-codex-stat-row';
    statsRow.appendChild(makeStatChip('HP', entry.hp, 'hp'));
    statsRow.appendChild(makeStatChip('ATK', entry.atk, 'atk'));
    statsRow.appendChild(makeStatChip('DEF', entry.def, 'def'));
    body.appendChild(statsRow);

    // Description
    const desc = document.createElement('div');
    desc.className = 'rpg-codex-desc';
    desc.textContent = entry.description;
    body.appendChild(desc);

    // Elite empower blurb
    if (entry.id.startsWith('elite_')) {
      const blurb = document.createElement('div');
      blurb.className = 'rpg-codex-elite-blurb';
      blurb.textContent = 'While alive, this elite empowers all non-elite enemies by +25%.';
      body.appendChild(blurb);
    }
  } else {
    // Locked teaser: ??? stats + wave requirement
    const lockedStats = document.createElement('div');
    lockedStats.className = 'rpg-codex-stat-row';
    lockedStats.appendChild(makeLockedStatChip('HP'));
    lockedStats.appendChild(makeLockedStatChip('ATK'));
    lockedStats.appendChild(makeLockedStatChip('DEF'));
    body.appendChild(lockedStats);

    const waveReq = document.createElement('div');
    waveReq.className = 'rpg-codex-desc rpg-codex-desc--locked';
    waveReq.textContent = 'Not yet encountered.';
    body.appendChild(waveReq);
  }

  box.appendChild(body);

  // Symbol cluster: zone icon + affinity/inflict status icons
  const symbolCluster = document.createElement('div');
  symbolCluster.className = 'rpg-codex-symbol-cluster';

  if (!showLocked) {
    if (entry.zone) {
      symbolCluster.appendChild(makeZoneIconChip(entry.zone));
    }

    const ALL_ENEMY_STATUS_KEYS: EnemyStatusKey[] = [
      'burning', 'poisoned', 'chilled', 'frozen', 'timeWarped',
      'abraded', 'refracted', 'radiant', 'echoMarked', 'cracked',
      'gravitized', 'fractalWound', 'riftScarred',
    ];
    const immune: EnemyStatusKey[]    = [];
    const resistant: EnemyStatusKey[] = [];
    const weak: EnemyStatusKey[]      = [];
    for (const sk of ALL_ENEMY_STATUS_KEYS) {
      const aff = getEnemyStatusAffinity(entry.id, sk);
      if (aff === 'immune')         immune.push(sk);
      else if (aff === 'resistant') resistant.push(sk);
      else if (aff === 'weak')      weak.push(sk);
    }
    for (const k of weak) {
      const def = ENEMY_STATUS_DEFS[k];
      symbolCluster.appendChild(makeStatusIconChip(k, 'weak', def?.color ?? '#88cc44', def?.name ?? k));
    }
    for (const k of immune) {
      const def = ENEMY_STATUS_DEFS[k];
      symbolCluster.appendChild(makeStatusIconChip(k, 'immune', def?.color ?? '#888', def?.name ?? k));
    }
    for (const k of resistant) {
      const def = ENEMY_STATUS_DEFS[k];
      symbolCluster.appendChild(makeStatusIconChip(k, 'resistant', def?.color ?? '#4488cc', def?.name ?? k));
    }

    const inflicts = ENEMY_STATUS_SOURCES[entry.id] ?? ENEMY_STATUS_SOURCES[entry.id.replace(/^elite_/, 'elite')];
    if (inflicts) {
      for (const pk of inflicts) {
        const def = PLAYER_STATUS_DEFS[pk];
        const chip = document.createElement('span');
        chip.className = 'rpg-codex-status-icon-chip rpg-codex-status-icon-chip--inflict';
        chip.style.setProperty('--chip-color', def?.color ?? '#aaa');
        chip.setAttribute('title', `Inflicts: ${def?.name ?? pk}`);
        chip.setAttribute('aria-label', `Inflicts: ${def?.name ?? pk}`);
        chip.textContent = STATUS_ICON_GLYPH[pk] ?? '?';
        symbolCluster.appendChild(chip);
      }
    }
  }

  box.appendChild(symbolCluster);

  // Mastery column
  const masteryCol = document.createElement('div');
  masteryCol.className = 'rpg-codex-mastery-col';

  if (showLocked) {
    const lockIcon = document.createElement('div');
    lockIcon.className = 'rpg-codex-mastery-lock';
    lockIcon.textContent = '🔒';
    masteryCol.appendChild(lockIcon);
    const waveHint = document.createElement('div');
    waveHint.className = 'rpg-codex-mastery-wave-hint';
    waveHint.textContent = `WAVE ${entry.firstWave}`;
    masteryCol.appendChild(waveHint);
  } else {
    const killsLabel = document.createElement('div');
    killsLabel.className = 'rpg-codex-mastery-label';
    killsLabel.textContent = 'KILLS';
    masteryCol.appendChild(killsLabel);

    const killsVal = document.createElement('div');
    killsVal.className = 'rpg-codex-mastery-value';
    killsVal.textContent = kills.toLocaleString();
    masteryCol.appendChild(killsVal);

    const bonusLabel = document.createElement('div');
    bonusLabel.className = 'rpg-codex-mastery-label';
    bonusLabel.textContent = 'BONUS';
    masteryCol.appendChild(bonusLabel);

    const bonusVal = document.createElement('div');
    bonusVal.className = 'rpg-codex-mastery-value rpg-codex-mastery-value--bonus';
    bonusVal.textContent = formatBonus(bonus);
    if (nextMilestone !== null) {
      bonusVal.setAttribute('title', `Next milestone: ${nextMilestone.toLocaleString()} kills`);
    }
    masteryCol.appendChild(bonusVal);
  }

  box.appendChild(masteryCol);
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
  const showLocked = isLocked && !isDevMode;

  const box = document.createElement('div');
  box.className = [
    'rpg-codex-card',
    'rpg-codex-card--boss',
    showLocked ? 'rpg-codex-card--locked' : '',
  ].filter(Boolean).join(' ');

  // Icon frame
  const iconFrame = document.createElement('div');
  iconFrame.className = 'rpg-codex-icon-frame';
  if (!showLocked) {
    iconFrame.style.borderColor = glowColor + '66';
  }

  const canvas = document.createElement('canvas');
  canvas.width  = ICON_SIZE;
  canvas.height = ICON_SIZE;
  canvas.className = 'rpg-codex-icon-canvas';
  if (!showLocked) {
    drawBossIcon(canvas, bossId);
  } else {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = `bold ${ICON_SIZE * 0.5}px sans-serif`;
      ctx.fillStyle = '#3a2050';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', ICON_SIZE / 2, ICON_SIZE / 2);
    }
  }
  iconFrame.appendChild(canvas);
  box.appendChild(iconFrame);

  // Body
  const body = document.createElement('div');
  body.className = 'rpg-codex-body';

  // Name row
  const nameRow = document.createElement('div');
  nameRow.className = 'rpg-codex-name-row';

  const nameEl = document.createElement('span');
  nameEl.className = 'rpg-codex-name' + (showLocked ? ' rpg-codex-name--locked' : '');
  if (showLocked) {
    nameEl.textContent = `Unknown Boss ${bossId}`;
  } else {
    nameEl.style.color = glowColor;
    nameEl.textContent = `${bestSpeed > 0 ? '✦ ' : ''}Boss ${bossId}: ${bossName}`;
  }
  nameRow.appendChild(nameEl);

  if (isDevMode && isLocked) {
    const devBadge = document.createElement('span');
    devBadge.className = 'rpg-codex-dev-badge';
    devBadge.textContent = `wave ${bossId * 100}`;
    nameRow.appendChild(devBadge);
  }
  body.appendChild(nameRow);

  if (!showLocked) {
    const statsRow = document.createElement('div');
    statsRow.className = 'rpg-codex-stat-row';
    statsRow.appendChild(makeStatChip('HP', BOSS_HP_INIT, 'hp'));
    statsRow.appendChild(makeStatChip('ATK', BOSS_ATK_INIT, 'atk'));
    statsRow.appendChild(makeStatChip('DEF', BOSS_DEF_INIT, 'def'));
    if (bestSpeed > 0) {
      const beatChip = document.createElement('span');
      beatChip.className = 'rpg-codex-stat-chip rpg-codex-stat-chip--beat';
      beatChip.innerHTML = `<span aria-hidden="true">⚡</span><span class="rpg-codex-stat-label">Best</span><span class="rpg-codex-stat-val">${bestSpeed}%</span>`;
      statsRow.appendChild(beatChip);
    }
    body.appendChild(statsRow);

    const desc = document.createElement('div');
    desc.className = 'rpg-codex-desc';
    desc.textContent = description;
    body.appendChild(desc);
  } else {
    const lockedStats = document.createElement('div');
    lockedStats.className = 'rpg-codex-stat-row';
    lockedStats.appendChild(makeLockedStatChip('HP'));
    lockedStats.appendChild(makeLockedStatChip('ATK'));
    lockedStats.appendChild(makeLockedStatChip('DEF'));
    body.appendChild(lockedStats);

    const waveReq = document.createElement('div');
    waveReq.className = 'rpg-codex-desc rpg-codex-desc--locked';
    waveReq.textContent = 'Not yet encountered.';
    body.appendChild(waveReq);
  }

  box.appendChild(body);

  // Symbol cluster for bosses (horizon zone icon only)
  const symbolCluster = document.createElement('div');
  symbolCluster.className = 'rpg-codex-symbol-cluster';
  if (!showLocked) {
    symbolCluster.appendChild(makeZoneIconChip('horizon'));
  }
  box.appendChild(symbolCluster);

  // Mastery column
  const masteryCol = document.createElement('div');
  masteryCol.className = 'rpg-codex-mastery-col';

  if (showLocked) {
    const lockIcon = document.createElement('div');
    lockIcon.className = 'rpg-codex-mastery-lock';
    lockIcon.textContent = '🔒';
    masteryCol.appendChild(lockIcon);
    const waveHint = document.createElement('div');
    waveHint.className = 'rpg-codex-mastery-wave-hint';
    waveHint.textContent = `WAVE ${bossId * 100}`;
    masteryCol.appendChild(waveHint);
  } else if (bestSpeed > 0) {
    const killsLabel = document.createElement('div');
    killsLabel.className = 'rpg-codex-mastery-label';
    killsLabel.textContent = 'BEST';
    masteryCol.appendChild(killsLabel);
    const killsVal = document.createElement('div');
    killsVal.className = 'rpg-codex-mastery-value';
    killsVal.textContent = `${bestSpeed}%`;
    masteryCol.appendChild(killsVal);
    const bonusLabel = document.createElement('div');
    bonusLabel.className = 'rpg-codex-mastery-label';
    bonusLabel.textContent = 'SPEED';
    masteryCol.appendChild(bonusLabel);
  } else {
    const defeatedLabel = document.createElement('div');
    defeatedLabel.className = 'rpg-codex-mastery-label';
    defeatedLabel.textContent = 'BOSS';
    masteryCol.appendChild(defeatedLabel);
  }

  box.appendChild(masteryCol);
  return box;
}

// ─── Factory ─────────────────────────────────────────────────────

export function createRpgEnemiesTabPane(_dispatch: ActionHandler): RpgEnemiesTabPane {
  const element = document.createElement('div');
  element.className = 'rpg-enemies-pane';
  let selectedZoneTab: EnemyZoneTabId = 'all';
  let latestRpgState: RpgSimState | null = null;
  let latestIsDevMode = false;

  function buildZoneTabs(): HTMLElement {
    const tabBar = document.createElement('div');
    tabBar.className = 'rpg-codex-zone-tabs';

    for (const tab of ENEMY_ZONE_TABS) {
      const isSelected = selectedZoneTab === tab.id;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = tab.label;
      button.setAttribute('aria-pressed', String(isSelected));
      button.className = 'rpg-codex-zone-tab' + (isSelected ? ' rpg-codex-zone-tab--active' : '');
      button.addEventListener('click', () => {
        selectedZoneTab = tab.id;
        update(latestRpgState, latestIsDevMode);
      });
      tabBar.appendChild(button);
    }

    return tabBar;
  }

  function update(rpgState: RpgSimState | null, isDevMode: boolean): void {
    latestRpgState = rpgState;
    latestIsDevMode = isDevMode;
    element.innerHTML = '';
    if (!rpgState) return;

    const highestWave = rpgState.highestWaveReached;
    const useEncounterSet = rpgState.encounteredEnemyTypes.size > 0 || highestWave === 0;

    // ── Codex header + zone tabs ──────────────────────────────────
    element.appendChild(buildCodexHeader(rpgState, isDevMode));
    element.appendChild(buildZoneTabs());

    // ── Regular enemies ───────────────────────────────────────────
    const enemiesHeading = document.createElement('div');
    enemiesHeading.className = 'rpg-codex-section-heading';
    enemiesHeading.textContent = '⚔ Enemies';
    element.appendChild(enemiesHeading);

    const visibleEnemyCatalog = selectedZoneTab === 'all'
      ? ENEMY_CATALOG
      : ENEMY_CATALOG.filter(entry => entry.zone === selectedZoneTab);

    const unlockedEntries: Array<{ entry: EnemyCatalogEntry; isLocked: boolean }> = [];
    const lockedEntries: EnemyCatalogEntry[] = [];

    for (const entry of visibleEnemyCatalog) {
      const isLocked = useEncounterSet
        ? !rpgState.encounteredEnemyTypes.has(entry.id)
        : highestWave < entry.firstWave;
      if (isLocked && !isDevMode) {
        lockedEntries.push(entry);
      } else {
        unlockedEntries.push({ entry, isLocked });
      }
    }

    // Render unlocked/dev-visible entries; highlight the first one
    let firstHighlight = true;
    for (const { entry, isLocked } of unlockedEntries) {
      const isHighlighted = firstHighlight;
      firstHighlight = false;
      const kills = rpgState.lifetimeKillsByType.get(entry.id) ?? 0;
      const bonus = getCodexBonusPercent(kills);
      const next = getNextVisibleCodexMilestone(kills);
      const enemyEntry = buildEnemyEntry(entry, isLocked, isDevMode, isHighlighted, kills, bonus, next);
      element.appendChild(enemyEntry);
    }

    // Locked teaser cards: up to 3 in ALL mode, up to 2 per specific zone
    const maxTeasers = selectedZoneTab === 'all' ? 3 : 2;
    for (let i = 0; i < Math.min(lockedEntries.length, maxTeasers); i++) {
      element.appendChild(buildEnemyEntry(lockedEntries[i], true, false, false, 0, 0, null));
    }

    if (unlockedEntries.length === 0 && Math.min(lockedEntries.length, maxTeasers) === 0) {
      const noEnemies = document.createElement('div');
      noEnemies.className = 'rpg-codex-empty-msg';
      noEnemies.textContent = emptyZoneMessage(selectedZoneTab);
      element.appendChild(noEnemies);
    }

    // ── Bosses ────────────────────────────────────────────────────
    const bossesHeading = document.createElement('div');
    bossesHeading.className = 'rpg-codex-boss-section-heading';
    bossesHeading.textContent = '👑 Boss Archives';
    element.appendChild(bossesHeading);

    let anyBossVisible = false;
    const lockedBossIds: number[] = [];

    for (let bossId = 1; bossId <= TOTAL_BOSS_COUNT; bossId++) {
      const bestSpeed = rpgState.bossCompletions.get(bossId) ?? 0;
      const isBeaten = bestSpeed > 0;
      if (!isBeaten && !isDevMode) {
        lockedBossIds.push(bossId);
        continue;
      }
      anyBossVisible = true;
      element.appendChild(buildBossEntry(bossId, !isBeaten, isDevMode, bestSpeed));
    }

    // Show up to 2 locked boss teasers
    for (let i = 0; i < Math.min(lockedBossIds.length, 2); i++) {
      anyBossVisible = true;
      element.appendChild(buildBossEntry(lockedBossIds[i], true, false, 0));
    }

    if (!anyBossVisible) {
      const noBosses = document.createElement('div');
      noBosses.className = 'rpg-codex-empty-msg';
      noBosses.textContent = 'No bosses defeated yet.';
      element.appendChild(noBosses);
    }
  }

  const pane: RpgEnemiesTabPane = { element, update };
  return pane;
}
