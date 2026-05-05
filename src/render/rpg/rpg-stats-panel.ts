/**
 * rpg-stats-panel.ts — RPG stats panel, DPS tracker, and XP-wire UI.
 *
 * Owns the DOM elements for the stats panel together with the Verlet-rope
 * XP-wire interaction.
 *
 * Wire mechanic:
 *   - Drag from the XP node to ATK / DEF / LUCK / MAXHP to allocate future XP.
 *   - Up to 3 wires can be active simultaneously; XP efficacy is split evenly.
 *   - Tap the XP node while wired to "slurp" all wires back (undo wiring).
 *   - Grab a wire's tip handle and drag it to a different stat to re-attach.
 *   - Attempting a 4th wire triggers error feedback on the XP node.
 *
 * Created via `createRpgStatsPanel(ctx)`.  The caller is responsible for
 * appending `handle.element` to the document and calling `handle.update()`
 * each frame.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import {
  formatXp, getMaxEquippedWeapons,
} from '../../sim/rpg/rpg-state';
import { WEAPON_BY_ID, INFINITE_RANGE } from '../../data/rpg/weapon-definitions';
import { TIER_BY_ID } from '../../data/tiers';
import type { RpgPlayerStats } from './rpg-types';
import { BASE_ATTACK_TIMER_KEY, GLOW_PULSE_SPEED, RPG_MOTE_COLOR, RPG_MOTE_GLOW } from './rpg-constants';
import type { NumberFormat } from '../../util/format';
import {
  createEquipWiringSystem,
} from './rpg-equip-wiring';

// ── DPS slot grouping ─────────────────────────────────────────────────────────
// Sand blade (base attack) and sand gatling share a single "SAN" DPS slot so
// that transitioning between the two doesn't change the chart layout.
const SAND_SLOT_KEY = '__sand__';
/**
 * All weapon IDs that belong to the unified "sand" DPS slot.
 * Update this set whenever a new sand-tier weapon is added to weapon-definitions.ts.
 */
const SAND_SLOT_MEMBERS = new Set<string>(['sand_blade', BASE_ATTACK_TIMER_KEY]);

/** Map a weapon ID to its canonical DPS slot key. */
function dpsSlotKey(weaponId: string): string {
  return SAND_SLOT_MEMBERS.has(weaponId) ? SAND_SLOT_KEY : weaponId;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface RpgStatsPanelCtx {
  rpgSimState: RpgSimState;
  playerStats: RpgPlayerStats;
  getCurrentWave(): number;
  getEffectiveEquippedIds(): Set<string>;
  getNumberFormat(): NumberFormat;
  /** Called when the player attempts an invalid wire action. */
  onError(): void;
}

export interface RpgStatsPanelHandle {
  element: HTMLElement;
  /** Container inside the right column where the RPG menu button should be appended. */
  menuButtonContainer: HTMLElement;
  recordDps(dmg: number, _legacyColor?: string): void;
  withDamageSource<T>(weaponId: string | null, fn: () => T): T;
  update(): void;
  /** Show or hide the dev-mode numerical designators on each panel box. */
  setDevMode(enabled: boolean): void;
}

export function createRpgStatsPanel(ctx: RpgStatsPanelCtx): RpgStatsPanelHandle {
  const { rpgSimState, playerStats } = ctx;
  const MAX_DPS_SLOTS = 5;   // maximum DPS bars shown in the chart

  // ── DPS tracking state ────────────────────────────────────────────
  const dpsWindow: Array<{ t: number; dmg: number; weaponId: string }> = [];
  const DPS_WINDOW_MS = 10000;
  const DPS_DOM_UPDATE_MS = 1000;
  const DPS_AXIS_LERP = 0.18;
  let activeDamageWeaponId: string | null = null;
  let lastDpsDomUpdateMs = 0;
  let lastDpsEquipKey = '';
  let dpsAxisMin = 0;
  let dpsAxisMax = 1;

  function withDamageSource<T>(weaponId: string | null, fn: () => T): T {
    const previous = activeDamageWeaponId;
    activeDamageWeaponId = weaponId;
    try {
      return fn();
    } finally {
      activeDamageWeaponId = previous;
    }
  }

  function recordDps(dmg: number, _legacyColor = '#fff'): void {
    void _legacyColor;
    if (dmg > 0 && activeDamageWeaponId !== null) {
      dpsWindow.push({ t: Date.now(), dmg, weaponId: dpsSlotKey(activeDamageWeaponId) });
    }
  }

  // ── DOM element creation ──────────────────────────────────────────
  const statsPanel = document.createElement('div');
  statsPanel.id = 'rpg-stats-panel';
  statsPanel.style.display = 'none';

  // ── Box 1 (thin) — animated idle-state player icon + 5 sand-coloured plug slots ──
  const xpBox1 = document.createElement('div');
  xpBox1.className = 'rpg-xp-box rpg-xp-box-1';

  // Player icon: an animated canvas rendering the player mote idle state (pulsing glow)
  const playerIconEl = document.createElement('div');
  playerIconEl.className = 'rpg-player-icon';

  // Use a 2× resolution canvas for crispness (44×44 drawn into 22×22 CSS pixels)
  const ICON_CANVAS_SIZE = 44;
  const iconCanvas = document.createElement('canvas');
  iconCanvas.width  = ICON_CANVAS_SIZE;
  iconCanvas.height = ICON_CANVAS_SIZE;
  iconCanvas.style.width  = '22px';
  iconCanvas.style.height = '22px';
  playerIconEl.appendChild(iconCanvas);

  const iconCtx2d = iconCanvas.getContext('2d');
  const ICON_SCALE    = 2;            // upscale factor matching the 2× canvas
  const ICON_MOTE_PX  = 3 * ICON_SCALE; // body is 6px on the 44px canvas
  const ICON_CX       = ICON_CANVAS_SIZE / 2;
  const ICON_CY       = ICON_CANVAS_SIZE / 2;
  let iconAnimTs      = 0;            // accumulated seconds

  /** Draw one frame of the player idle animation onto iconCanvas. */
  function drawPlayerIdleFrame(deltaMs: number): void {
    if (!iconCtx2d) return;
    iconAnimTs += Math.min(deltaMs, 100) / 1000;
    const pulseT  = (Math.sin(iconAnimTs * GLOW_PULSE_SPEED) + 1) * 0.5; // 0–1

    iconCtx2d.clearRect(0, 0, ICON_CANVAS_SIZE, ICON_CANVAS_SIZE);

    // Outer soft glow — pulsing size
    const glowSize = ICON_MOTE_PX * (2.2 + pulseT * 1.4);
    const glowHalf = glowSize / 2;
    iconCtx2d.globalAlpha = 0.18 + pulseT * 0.22;
    iconCtx2d.shadowBlur  = glowSize * 3;
    iconCtx2d.shadowColor = RPG_MOTE_GLOW;
    iconCtx2d.fillStyle   = RPG_MOTE_GLOW;
    iconCtx2d.fillRect(
      Math.floor(ICON_CX - glowHalf), Math.floor(ICON_CY - glowHalf),
      Math.ceil(glowSize), Math.ceil(glowSize),
    );
    iconCtx2d.globalAlpha = 1;
    iconCtx2d.shadowBlur  = 0;

    // Body square with inner glow
    iconCtx2d.shadowBlur  = ICON_MOTE_PX * 5;
    iconCtx2d.shadowColor = RPG_MOTE_GLOW;
    iconCtx2d.fillStyle   = RPG_MOTE_COLOR;
    const bh = ICON_MOTE_PX / 2;
    iconCtx2d.fillRect(
      Math.floor(ICON_CX - bh), Math.floor(ICON_CY - bh),
      ICON_MOTE_PX, ICON_MOTE_PX,
    );
    iconCtx2d.shadowBlur = 0;
  }

  // Lightweight RAF loop for the player icon animation.
  // Skips drawing while the stats panel is hidden (display:none) to avoid
  // unnecessary GPU work when the RPG tab is not active.
  let iconPrevMs = 0;
  function iconAnimLoop(ms: number): void {
    if (statsPanel.style.display !== 'none') {
      drawPlayerIdleFrame(ms - iconPrevMs);
    }
    iconPrevMs = ms;
    requestAnimationFrame(iconAnimLoop);
  }
  requestAnimationFrame((ms) => { iconPrevMs = ms; requestAnimationFrame(iconAnimLoop); });

  xpBox1.appendChild(playerIconEl);

  // Plug container — holds 5 weapon source output plugs.
  // Slot 1 starts unlocked; slots 2–5 unlock as getMaxEquippedWeapons increases.
  const plugContainerEl = document.createElement('div');
  plugContainerEl.className = 'rpg-plug-container';
  xpBox1.appendChild(plugContainerEl);

  // Weapon source plugs (box 1 — 5 circle plugs, slot 1 unlocked initially)
  const weaponSourcePlugEls: HTMLDivElement[] = [];
  for (let i = 0; i < 5; i++) {
    const plug = document.createElement('div');
    plug.className = 'rpg-plug-slot rpg-weapon-source-plug';
    if (i > 0) plug.classList.add('rpg-plug--locked');
    plugContainerEl.appendChild(plug);
    weaponSourcePlugEls.push(plug);
  }

  // ── Boxes 2–5 — 4 separate boxes: XP box + roman-numeral boxes I/II/III ──
  // Box 2: label (XP node) on left + one xpOut plug on the right.
  // Boxes 3–5: label (I/II/III) on left + two modifier plugs stacked on right
  //            (top = modifierXpIn, bottom = modifierOut).
  const xpBox2 = document.createElement('div');
  xpBox2.className = 'rpg-box5-wrapper';

  // Helper: build box 2 row (xpNodeEl + single xpOut plug)
  function makeBox5Row(label: string | HTMLElement): {
    box: HTMLDivElement;
    xpOutPlug: HTMLDivElement;
  } {
    const box = document.createElement('div');
    box.className = 'rpg-xp-box rpg-box5-cell';
    if (typeof label === 'string') {
      const span = document.createElement('span');
      span.className = 'rpg-box5-label';
      span.textContent = label;
      box.appendChild(span);
    } else {
      box.appendChild(label);
    }
    const xpOutPlug = document.createElement('div');
    xpOutPlug.className = 'rpg-plug-slot rpg-plug-slot--sand';
    box.appendChild(xpOutPlug);
    return { box, xpOutPlug };
  }

  // Helper: build a modifier box row (boxes 3–5) with two plugs stacked on the right.
  function makeModifierBox5Row(label: string): {
    box: HTMLDivElement;
    xpInPlug: HTMLDivElement;
    outPlug: HTMLDivElement;
  } {
    const box = document.createElement('div');
    box.className = 'rpg-xp-box rpg-box5-cell';
    const span = document.createElement('span');
    span.className = 'rpg-box5-label';
    span.textContent = label;
    box.appendChild(span);

    const plugStack = document.createElement('div');
    plugStack.style.cssText = 'display:flex;flex-direction:column;gap:2px;flex-shrink:0;';

    const xpInPlug = document.createElement('div');
    xpInPlug.className = 'rpg-modifier-plug rpg-modifier-plug--xp-in';

    const outPlug = document.createElement('div');
    outPlug.className = 'rpg-modifier-plug rpg-modifier-plug--out';

    plugStack.appendChild(xpInPlug);
    plugStack.appendChild(outPlug);
    box.appendChild(plugStack);
    return { box, xpInPlug, outPlug };
  }

  // XP node — compact two-line display widget
  const xpNodeEl = document.createElement('div');
  xpNodeEl.className = 'rpg-xp-node';
  xpNodeEl.title = 'Current XP';
  xpNodeEl.style.flex = '1 1 0';
  xpNodeEl.style.width = 'auto';
  const xpLabelTextEl = document.createElement('span');
  xpLabelTextEl.className = 'rpg-xp-label-text';
  xpLabelTextEl.textContent = 'XP';
  const xpAmountEl = document.createElement('span');
  xpAmountEl.className = 'rpg-xp-amount-text';
  xpAmountEl.textContent = '0';
  xpNodeEl.appendChild(xpLabelTextEl);
  xpNodeEl.appendChild(xpAmountEl);

  const { box: box5Cell2, xpOutPlug: xpOutPlugEl } = makeBox5Row(xpNodeEl); // box 2
  const { box: box5Cell3, xpInPlug: mod1XpIn, outPlug: mod1Out } = makeModifierBox5Row('I');    // box 3
  const { box: box5Cell4, xpInPlug: mod2XpIn, outPlug: mod2Out } = makeModifierBox5Row('II');   // box 4
  const { box: box5Cell5, xpInPlug: mod3XpIn, outPlug: mod3Out } = makeModifierBox5Row('III');  // box 5
  xpBox2.appendChild(box5Cell2);
  xpBox2.appendChild(box5Cell3);
  xpBox2.appendChild(box5Cell4);
  xpBox2.appendChild(box5Cell5);

  // ── Boxes 6–11 — 6 separate wide short row-boxes ───────────────────────
  // Layout:
  //   Row 0 (box 6):  column headers: Weap | ATK | Spd | Rng | Prc
  //   Rows 1–5 (boxes 7–11): one row per equipped weapon, showing base stats
  //   Each cell in rows 7–11 has a circle plug on the left + value on the right.
  const xpBox3 = document.createElement('div');
  xpBox3.className = 'rpg-box4-wrapper';

  const box4RowEls: HTMLDivElement[] = []; // row elements in order; used for badges 6–11

  function makeBox4Row(): HTMLDivElement[] {
    const rowBox = document.createElement('div');
    rowBox.className = 'rpg-xp-box rpg-box4-row';
    box4RowEls.push(rowBox);
    const cells: HTMLDivElement[] = [];
    for (let c = 0; c < 5; c++) {
      const cell = document.createElement('div');
      cell.className = 'rpg-box4-cell';
      rowBox.appendChild(cell);
      cells.push(cell);
    }
    xpBox3.appendChild(rowBox);
    return cells;
  }

  /** Build one weapon-data cell with a circle plug on the left and a span on the right.
   *  Returns the plugElement (circle) and the valueSpan (stat display). */
  function makeWeaponCell(cell: HTMLDivElement): { plugElement: HTMLSpanElement; valueSpan: HTMLSpanElement } {
    cell.classList.add('rpg-box4-cell--weapon');
    const plugElement = document.createElement('span');
    plugElement.className = 'rpg-box4-circle-plug';
    const valueSpan = document.createElement('span');
    valueSpan.className = 'rpg-stat-value rpg-box4-weapon-stat';
    valueSpan.style.color = 'rgba(255,255,255,0.18)';
    valueSpan.textContent = '—';
    cell.appendChild(plugElement);
    cell.appendChild(valueSpan);
    return { plugElement, valueSpan };
  }

  // Row 0 — header labels: Weap | ATK | Spd | Rng | Prc
  const box4LabelsRow = makeBox4Row();
  const weaponColDefs: Array<[string, string]> = [
    ['Weap', 'rgba(255,255,255,0.5)'],
    ['ATK',  '#fca5a5'],
    ['Spd',  '#86efac'],
    ['Rng',  '#93c5fd'],
    ['Prc',  '#fde68a'],
  ];
  weaponColDefs.forEach(([text, color], i) => {
    const span = document.createElement('span');
    span.className = 'rpg-stat-label';
    span.textContent = text;
    span.style.color = color;
    box4LabelsRow[i].appendChild(span);
  });

  // Rows 1–5 — weapon data rows (boxes 7–11)
  // Each row holds 5 span references for live updates.
  // Each cell has a circle plug on the left and the value on the right.
  const WEAPON_ROW_COUNT = 5;
  const weaponRowSpans: Array<HTMLSpanElement[]> = [];
  // Plug elements for each weapon row — indexed [row][col] where col 0=WEAP, 1=ATK, 2=SPD, 3=RNG, 4=PRC
  const weaponRowPlugEls: Array<HTMLSpanElement[]> = [];
  for (let r = 0; r < WEAPON_ROW_COUNT; r++) {
    const cells = makeBox4Row();
    const spans: HTMLSpanElement[] = [];
    const plugElsRow: HTMLSpanElement[] = [];
    for (const cell of cells) {
      const { plugElement, valueSpan } = makeWeaponCell(cell);
      spans.push(valueSpan);
      plugElsRow.push(plugElement);
    }
    weaponRowSpans.push(spans);
    weaponRowPlugEls.push(plugElsRow);
  }

  // Append the three layout groups to the panel
  statsPanel.appendChild(xpBox1);
  statsPanel.appendChild(xpBox2);
  statsPanel.appendChild(xpBox3);

  // ── Right column — DPS + HP + menu area ───────────────────────────
  const rightColumn = document.createElement('div');
  rightColumn.className = 'rpg-right-column';

  // ── DPS Chart Widget ──────────────────────────────────────────────
  const dpsWidget = document.createElement('div');
  dpsWidget.className = 'rpg-dps-widget';
  const dpsLabelEl = document.createElement('span');
  dpsLabelEl.className = 'rpg-stat-label';
  dpsLabelEl.textContent = 'DPS';
  const dpsValueEl = document.createElement('span');
  dpsValueEl.className = 'rpg-stat-value rpg-stat-value--dps';
  dpsValueEl.textContent = '';
  const dpsChartEl = document.createElement('div');
  dpsChartEl.className = 'rpg-dps-chart';
  const dpsAxisEl = document.createElement('div');
  dpsAxisEl.className = 'rpg-dps-axis';
  const dpsAxisLowEl = document.createElement('span');
  dpsAxisLowEl.textContent = '0';
  const dpsAxisHighEl = document.createElement('span');
  dpsAxisHighEl.textContent = '0';
  dpsAxisEl.appendChild(dpsAxisLowEl);
  dpsAxisEl.appendChild(dpsAxisHighEl);
  dpsWidget.appendChild(dpsLabelEl);
  dpsWidget.appendChild(dpsValueEl);
  dpsWidget.appendChild(dpsChartEl);
  dpsWidget.appendChild(dpsAxisEl);

  // ── HP box — current hit-points, regen %, and defence %, below DPS ────
  // Layout: top half = HP label + current/max value;
  //         bottom half = Reg% (left) and Def% (right) side by side.
  const hpFractionEl = document.createElement('div');
  hpFractionEl.className = 'rpg-hp-box';

  // Top section — HP label + fraction value
  const hpTopSection = document.createElement('div');
  hpTopSection.className = 'rpg-hp-top';
  const hpFractionLabel = document.createElement('span');
  hpFractionLabel.className = 'rpg-stat-label';
  hpFractionLabel.textContent = 'HP';
  const hpFractionValue = document.createElement('span');
  hpFractionValue.className = 'rpg-stat-value rpg-stat-value--hp';
  hpTopSection.appendChild(hpFractionLabel);
  hpTopSection.appendChild(hpFractionValue);
  hpFractionEl.appendChild(hpTopSection);

  // Bottom section — Reg and Def side by side
  const hpBottomSection = document.createElement('div');
  hpBottomSection.className = 'rpg-hp-bottom';

  // Reg (regen %) — bottom left
  const regSubEl = document.createElement('div');
  regSubEl.className = 'rpg-hp-sub';
  const regLabel = document.createElement('span');
  regLabel.className = 'rpg-stat-label';
  regLabel.textContent = 'Reg';
  const regValue = document.createElement('span');
  regValue.className = 'rpg-stat-value rpg-hp-sub-value';
  regSubEl.appendChild(regLabel);
  regSubEl.appendChild(regValue);

  // Def (defence %) — bottom right
  const defSubEl = document.createElement('div');
  defSubEl.className = 'rpg-hp-sub';
  const defLabel = document.createElement('span');
  defLabel.className = 'rpg-stat-label';
  defLabel.textContent = 'Def';
  const defValue = document.createElement('span');
  defValue.className = 'rpg-stat-value rpg-hp-sub-value';
  defSubEl.appendChild(defLabel);
  defSubEl.appendChild(defValue);

  hpBottomSection.appendChild(regSubEl);
  hpBottomSection.appendChild(defSubEl);
  hpFractionEl.appendChild(hpBottomSection);

  // ── Menu area — RPG menu button lives here ─────────────────────────
  const menuArea = document.createElement('div');
  menuArea.className = 'rpg-menu-area';

  rightColumn.appendChild(dpsWidget);
  rightColumn.appendChild(hpFractionEl);
  rightColumn.appendChild(menuArea);
  statsPanel.appendChild(rightColumn);

  // ── Dev mode box number badges ────────────────────────────────────
  // 14 boxes total:
  //   1  = box 1 (plug column, leftmost)
  //   2–5 = boxes 2–5 (XP column sub-cells: XP, I, II, III)
  //   6–11 = boxes 6–11 (wide stats area row sub-cells)
  //   12 = DPS widget, 13 = HP box, 14 = menu area
  function makeBoxBadge(container: HTMLElement, num: number): HTMLSpanElement {
    const badge = document.createElement('span');
    badge.className = 'rpg-dev-box-num';
    badge.textContent = String(num);
    container.appendChild(badge);
    return badge;
  }
  makeBoxBadge(xpBox1, 1);
  makeBoxBadge(box5Cell2, 2);
  makeBoxBadge(box5Cell3, 3);
  makeBoxBadge(box5Cell4, 4);
  makeBoxBadge(box5Cell5, 5);
  box4RowEls.forEach((row, i) => makeBoxBadge(row, 6 + i));
  makeBoxBadge(dpsWidget, 12);
  makeBoxBadge(hpFractionEl, 13);
  makeBoxBadge(menuArea, 14);

  // ── Equip wiring system ───────────────────────────────────────────
  // Manages drag-to-connect soft-body wires for all visible plugs.
  // State is ephemeral (reset on page load) — not persisted in sim state.
  const equipWiring = createEquipWiringSystem({
    panelEl:           statsPanel,
    getMaxWeaponSlots: () => getMaxEquippedWeapons(rpgSimState),
    onWireConnect:     (_from, _to) => { /* ephemeral */ },
    onWireDisconnect:  (_from, _to) => { /* ephemeral */ },
  });

  // Register box 1 weapon source plugs
  for (let i = 0; i < weaponSourcePlugEls.length; i++) {
    equipWiring.registerPlug(`weaponSource:${i + 1}`, 'weaponSourceOut', weaponSourcePlugEls[i]);
    equipWiring.setPlugLocked(`weaponSource:${i + 1}`, i > 0);
  }

  // Register box 2 xpOut plug
  equipWiring.registerPlug('xp:out', 'xpOut', xpOutPlugEl);

  // Register boxes 3–5 modifier plugs
  equipWiring.registerPlug('modifier:1:xpIn', 'modifierXpIn', mod1XpIn);
  equipWiring.registerPlug('modifier:1:out',  'modifierOut',  mod1Out);
  equipWiring.registerPlug('modifier:2:xpIn', 'modifierXpIn', mod2XpIn);
  equipWiring.registerPlug('modifier:2:out',  'modifierOut',  mod2Out);
  equipWiring.registerPlug('modifier:3:xpIn', 'modifierXpIn', mod3XpIn);
  equipWiring.registerPlug('modifier:3:out',  'modifierOut',  mod3Out);

  // Register boxes 7–11 weapon row plugs
  const weaponSlotColIds = ['weapIn', 'atkIn', 'spdIn', 'rngIn', 'prcIn'] as const;
  const weaponSlotColTypes = ['weaponSlotIn', 'statIn', 'statIn', 'statIn', 'statIn'] as const;
  for (let r = 0; r < WEAPON_ROW_COUNT; r++) {
    for (let c = 0; c < 5; c++) {
      const plugId = `weaponSlot:${r + 1}:${weaponSlotColIds[c]}`;
      equipWiring.registerPlug(plugId, weaponSlotColTypes[c], weaponRowPlugEls[r][c]);
    }
  }

    function weaponAbbrev(weaponId: string): string {
    if (weaponId === SAND_SLOT_KEY) return 'SAN';
    const tierId = WEAPON_BY_ID.get(weaponId)?.costTierId ?? 'sand';
    return tierId.slice(0, 3).toUpperCase();
  }

  function weaponColor(weaponId: string): string {
    if (weaponId === SAND_SLOT_KEY) return TIER_BY_ID.get('sand')?.color ?? '#ffd764';
    const tierId = WEAPON_BY_ID.get(weaponId)?.costTierId;
    return (tierId ? TIER_BY_ID.get(tierId)?.color : null) ?? '#ffd764';
  }

  function formatDpsAxis(value: number): string {
    return value >= 1000 ? formatXp(value) : Math.round(value).toString();
  }

  /** Format weapon cooldown for compact display: sub-second → "Xms", longer → "X.Xs". */
  function formatWeaponSpd(cooldownMs: number): string {
    if (cooldownMs < 1000) return cooldownMs + 'ms';
    const secs = cooldownMs / 1000;
    return (Number.isInteger(secs) ? secs.toString() : secs.toFixed(1)) + 's';
  }

  /** Format weapon range: INFINITE_RANGE (unlimited) → "∞", otherwise raw value. */
  function formatWeaponRng(range: number): string {
    return range >= INFINITE_RANGE ? '∞' : String(range);
  }

  /** Return the pierce percentage (0-100) for a weapon, or 0 for non-piercing weapons. */
  function weaponPiercePercent(weaponId: string): number {
    const effect = WEAPON_BY_ID.get(weaponId)?.stats.effect;
    if (!effect || effect.kind !== 'piercing') return 0;
    return Math.round(effect.defPierceRatio * 100);
  }

  /**
   * Compute the ordered list of DPS display slots from the currently equipped
   * weapon IDs.  Sand weapons (sand_blade, __base__) are collapsed into a
   * single SAND_SLOT_KEY entry that always appears first.
   *
   * The sand slot is shown only when no non-sand weapon is equipped, or when
   * the sand gatling (sand_blade) is explicitly one of the equipped weapons.
   * If other weapons are equipped without sand_blade, the sand slot is hidden
   * because the base sand attack is superseded.
   */
  function buildDisplaySlots(equippedIds: string[]): string[] {
    const slots: string[] = [];
    let hasSandSlot = false;
    for (const id of equippedIds) {
      const slot = dpsSlotKey(id);
      if (slot === SAND_SLOT_KEY) {
        if (!hasSandSlot) {
          hasSandSlot = true;
          slots.push(SAND_SLOT_KEY);
        }
      } else {
        slots.push(slot);
      }
    }
    // Show the sand slot only when there are no non-sand weapons equipped
    // (i.e. the base sand attack is the only source of damage), or when the
    // sand gatling is itself the equipped weapon (sand_blade in equippedIds).
    if (!hasSandSlot) {
      const allWeaponsAreSand = equippedIds.every(id => SAND_SLOT_MEMBERS.has(id));
      if (allWeaponsAreSand) {
        slots.unshift(SAND_SLOT_KEY);
      }
    }
    // Cap to maximum number of DPS slots shown in the chart.
    if (slots.length > MAX_DPS_SLOTS) slots.length = MAX_DPS_SLOTS;
    return slots;
  }

  function rebuildDpsRows(displaySlots: string[]): void {
    dpsChartEl.textContent = '';
    dpsLabelEl.textContent = '';
    dpsValueEl.textContent = '';
    dpsAxisEl.hidden = false;
    for (const slotId of displaySlots) {
      const row = document.createElement('div');
      row.className = 'rpg-dps-row';
      row.dataset.weaponId = slotId;
      const label = document.createElement('span');
      label.className = 'rpg-dps-label';
      label.textContent = weaponAbbrev(slotId);
      const track = document.createElement('div');
      track.className = 'rpg-dps-track';
      const bar = document.createElement('div');
      bar.className = 'rpg-dps-bar';
      bar.style.background = weaponColor(slotId);
      track.appendChild(bar);
      row.appendChild(label);
      row.appendChild(track);
      dpsChartEl.appendChild(row);
    }
  }

  function updateStatsPanelDom(): void {
    const nowMs = performance.now();

    // ── Box 13: HP / Reg / Def ────────────────────────────────────
    hpFractionValue.textContent = Math.max(0, Math.ceil(playerStats.hp)) + ' / ' + playerStats.maxHp;
    regValue.textContent = (Number.isInteger(playerStats.regen) ? playerStats.regen.toString() : playerStats.regen.toFixed(1)) + '%';
    defValue.textContent = Math.round(Math.min(100, playerStats.def)) + '%';

    // XP amount — update the value span inside the XP node
    xpAmountEl.textContent = formatXp(rpgSimState.xp);

    // Update weapon source plug lock states based on current max slots
    const maxWeaponSlots = getMaxEquippedWeapons(rpgSimState);
    for (let i = 0; i < weaponSourcePlugEls.length; i++) {
      equipWiring.setPlugLocked(`weaponSource:${i + 1}`, i >= maxWeaponSlots);
    }

    // Equip wiring: advance rope physics and redraw all wires
    equipWiring.update(nowMs);

    // ── DPS chart update ──────────────────────────────────────────
    const now = Date.now();
    while (dpsWindow.length > 0 && now - dpsWindow[0].t > DPS_WINDOW_MS) {
      dpsWindow.shift();
    }
    const equippedIds = Array.from(ctx.getEffectiveEquippedIds());
    const displaySlots = buildDisplaySlots(equippedIds);
    const slotsKey = displaySlots.join('|');
    if (slotsKey !== lastDpsEquipKey) {
      lastDpsEquipKey = slotsKey;
      rebuildDpsRows(displaySlots);
    }
    if (now - lastDpsDomUpdateMs < DPS_DOM_UPDATE_MS && slotsKey !== '') return;
    lastDpsDomUpdateMs = now;

    // ── Boxes 7–11: weapon stat rows ─────────────────────────────
    // Show the weapon assigned to each slot (0–4); empty slots show dashes.
    for (let r = 0; r < WEAPON_ROW_COUNT; r++) {
      const spans = weaponRowSpans[r];
      const weaponId = rpgSimState.equippedWeaponSlots.get(r);
      if (!weaponId) {
        // Empty slot
        for (const sp of spans) {
          sp.style.color = 'rgba(255,255,255,0.18)';
          sp.textContent = '—';
        }
        continue;
      }
      const def = WEAPON_BY_ID.get(weaponId);
      const color = weaponColor(weaponId);
      // WEAP column: show the tier abbreviation (short name)
      spans[0].style.color = color;
      spans[0].textContent = weaponAbbrev(weaponId);
      if (def) {
        const dim = 'rgba(255,255,255,0.7)';
        spans[1].style.color = dim;
        spans[1].textContent = String(def.stats.damage);
        spans[2].style.color = dim;
        spans[2].textContent = formatWeaponSpd(def.stats.cooldownMs);
        spans[3].style.color = dim;
        spans[3].textContent = formatWeaponRng(def.stats.range);
        spans[4].style.color = dim;
        spans[4].textContent = weaponPiercePercent(weaponId) + '%';
      } else {
        for (let c = 1; c < 5; c++) {
          spans[c].style.color = 'rgba(255,255,255,0.18)';
          spans[c].textContent = '—';
        }
      }
    }

    const dpsBySlot = new Map<string, number>();
    for (const slotId of displaySlots) dpsBySlot.set(slotId, 0);
    for (const e of dpsWindow) {
      if (dpsBySlot.has(e.weaponId)) {
        dpsBySlot.set(e.weaponId, (dpsBySlot.get(e.weaponId) ?? 0) + e.dmg / (DPS_WINDOW_MS / 1000));
      }
    }
    const dpsValues = displaySlots.map(id => dpsBySlot.get(id) ?? 0);
    const rawMin = dpsValues.length > 0 ? Math.min(...dpsValues) : 0;
    const rawMax = Math.max(1, ...(dpsValues.length > 0 ? dpsValues : [1]));
    dpsAxisMin += (rawMin - dpsAxisMin) * DPS_AXIS_LERP;
    dpsAxisMax += (rawMax - dpsAxisMax) * DPS_AXIS_LERP;
    if (dpsAxisMax <= dpsAxisMin + 0.001) dpsAxisMax = dpsAxisMin + 1;
    dpsAxisLowEl.textContent  = formatDpsAxis(dpsAxisMin);
    dpsAxisHighEl.textContent = formatDpsAxis(dpsAxisMax);
    for (const slotId of displaySlots) {
      const row = dpsChartEl.querySelector<HTMLElement>(`.rpg-dps-row[data-weapon-id="${slotId}"]`);
      const bar = row?.querySelector<HTMLElement>('.rpg-dps-bar');
      if (!bar || !row) continue;
      const dps = dpsBySlot.get(slotId) ?? 0;
      const pct = dps <= 0 ? 0 : Math.max(8, Math.min(100, ((dps - dpsAxisMin) / (dpsAxisMax - dpsAxisMin)) * 100));
      bar.style.width = pct + '%';
      row.title = `${weaponAbbrev(slotId)} ${dps.toFixed(1)} DPS`;
    }
  }

  return {
    element: statsPanel,
    menuButtonContainer: menuArea,
    recordDps,
    withDamageSource,
    update(): void {
      updateStatsPanelDom();
    },
    setDevMode(enabled: boolean): void {
      if (enabled) statsPanel.classList.add('rpg-dev-mode');
      else statsPanel.classList.remove('rpg-dev-mode');
    },
  };
}
