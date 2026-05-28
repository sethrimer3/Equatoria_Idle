/**
 * rpg-stats-panel-dom.ts — DOM element construction for the RPG stats panel.
 *
 * Builds every HTML element in the stats panel (player icon, XP column,
 * weapon rows, DPS chart, HP box, menu area, dev-mode badges) and starts
 * the player-icon idle animation RAF loop.
 *
 * All element references required by the update/logic layer are returned in
 * `StatsPanelDomRefs`.  Logic, state, DPS tracking, and equip-wiring
 * registration remain in rpg-stats-panel.ts.
 *
 * Called once via `buildStatsPanelDom()` from `createRpgStatsPanel`.
 */

import {
  addStatsPanelDevBadges,
  createStatsPanelPrimaryColumn,
  createStatsPanelRightColumn,
} from './rpg-stats-panel-dom-sections';

/** All live element references the stats-panel logic layer needs. */
export interface StatsPanelDomRefs {
  // Root element
  statsPanel: HTMLDivElement;

  // Menu button mount point (exposed as menuButtonContainer)
  menuArea: HTMLElement;

  // XP node amount text
  xpAmountEl: HTMLSpanElement;

  // HP box value elements
  hpFractionValue: HTMLSpanElement;
  regValue: HTMLSpanElement;
  defValue: HTMLSpanElement;

  // Weapon row data spans [row 0–4][col 0–4]
  weaponRowSpans: HTMLSpanElement[][];
  // Weapon row plug circle elements [row 0–4][col 0–4]
  weaponRowPlugEls: HTMLSpanElement[][];

  // Box 1 — weapon source output plugs (5 total)
  weaponSourcePlugEls: HTMLDivElement[];

  // Box 2 — XP node output plug
  xpOutPlugEl: HTMLDivElement;

  // Box 1 — square purple XP input socket (playerXpIn)
  playerXpInEl: HTMLDivElement;

  // Boxes 3–5 — modifier XP-in and output plugs
  mod1XpIn: HTMLDivElement;
  mod1Out: HTMLDivElement;
  mod2XpIn: HTMLDivElement;
  mod2Out: HTMLDivElement;
  mod3XpIn: HTMLDivElement;
  mod3Out: HTMLDivElement;
  /** Progress bar fill elements for modifier boxes [0]=Box3, [1]=Box4, [2]=Box5. */
  modProgressFills: HTMLDivElement[];
  /** Level text elements for modifier boxes [0]=Box3, [1]=Box4, [2]=Box5. */
  modLevelTexts: HTMLSpanElement[];

  /** "Lv.N" label shown above the player icon. Updated on level-up. */
  playerLevelEl: HTMLSpanElement;
  /** XP progress bar fill element below the player icon. Width updated each frame. */
  playerXpBarFill: HTMLDivElement;

  // DPS chart elements
  dpsLabelEl: HTMLSpanElement;
  dpsValueEl: HTMLSpanElement;
  dpsChartEl: HTMLDivElement;
  dpsAxisEl: HTMLDivElement;
  dpsAxisLowEl: HTMLSpanElement;
  dpsAxisHighEl: HTMLSpanElement;
}

/**
 * Creates and assembles all DOM elements for the stats panel.
 * Side-effect: starts a `requestAnimationFrame` loop for the player-icon
 * idle animation (same behaviour as before the extraction).
 */
export function buildStatsPanelDom(): StatsPanelDomRefs {
  const WEAPON_ROW_COUNT = 5;

  const statsPanel = document.createElement('div');
  statsPanel.id = 'rpg-stats-panel';
  statsPanel.style.display = 'none';

  const primary = createStatsPanelPrimaryColumn(WEAPON_ROW_COUNT, () => statsPanel.style.display !== 'none');
  statsPanel.appendChild(primary.xpBox1);
  statsPanel.appendChild(primary.xpBox2);
  statsPanel.appendChild(primary.xpBox3);

  const right = createStatsPanelRightColumn();
  statsPanel.appendChild(right.rightColumn);

  addStatsPanelDevBadges(
    primary.xpBox1,
    primary.box5Cell2,
    primary.box5Cell3,
    primary.box5Cell4,
    primary.box5Cell5,
    primary.box4RowEls,
    right.dpsWidget,
    right.hpFractionEl,
    right.menuArea,
  );

  return {
    statsPanel,
    menuArea: right.menuArea,
    xpAmountEl: primary.xpAmountEl,
    hpFractionValue: right.hpFractionValue,
    regValue: right.regValue,
    defValue: right.defValue,
    weaponRowSpans: primary.weaponRowSpans,
    weaponRowPlugEls: primary.weaponRowPlugEls,
    weaponSourcePlugEls: primary.weaponSourcePlugEls,
    xpOutPlugEl: primary.xpOutPlugEl,
    playerXpInEl: primary.playerXpInEl,
    mod1XpIn: primary.mod1XpIn,
    mod1Out: primary.mod1Out,
    mod2XpIn: primary.mod2XpIn,
    mod2Out: primary.mod2Out,
    mod3XpIn: primary.mod3XpIn,
    mod3Out: primary.mod3Out,
    modProgressFills: primary.modProgressFills,
    modLevelTexts: primary.modLevelTexts,
    playerLevelEl: primary.playerLevelEl,
    playerXpBarFill: primary.playerXpBarFill,
    dpsLabelEl: right.dpsLabelEl,
    dpsValueEl: right.dpsValueEl,
    dpsChartEl: right.dpsChartEl,
    dpsAxisEl: right.dpsAxisEl,
    dpsAxisLowEl: right.dpsAxisLowEl,
    dpsAxisHighEl: right.dpsAxisHighEl,
  };
}
