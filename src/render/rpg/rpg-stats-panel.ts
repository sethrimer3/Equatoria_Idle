/**
 * rpg-stats-panel.ts — RPG stats panel, DPS tracker, and XP-wire UI.
 *
 * Owns the DPS tracking state, equip-wiring registrations, and all update
 * logic for the stats panel.  DOM element construction has been extracted to
 * rpg-stats-panel-dom.ts via `buildStatsPanelDom()`.
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
import {
  getMultiplierXpCost, tickMultiplierXpProgress, tickPlayerXpProgress,
} from '../../sim/rpg/rpg-state-xp';
import { INFINITE_RANGE } from '../../data/rpg/weapon-definitions';
import { resolveWeaponDefinition } from '../../data/rpg/crafted-weapon-helpers';
import { TIER_BY_ID } from '../../data/tiers';
import type { RpgPlayerStats } from './rpg-types';
import { BASE_ATTACK_TIMER_KEY, DIAMOND_BLADE_ID } from './rpg-constants';
import type { NumberFormat } from '../../util/format';
import { createEquipWiringSystem } from './rpg-equip-wiring';
import { buildStatsPanelDom } from './rpg-stats-panel-dom';
import { createItemIconCanvas, stringToIconSeed } from '../assets/item-icon-renderer';

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
  /** Called after each tick in which the player gained one or more levels. */
  onPlayerLevelUp?(): void;
  /**
   * Called when the player taps the WEAP column header (slotIdx = null) or
   * any WEAP data-row cell (slotIdx = 0–4).  anchorEl is the tapped DOM cell.
   */
  onWeapCellTap?(slotIdx: number | null, anchorEl: HTMLElement): void;
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
  /**
   * Returns true if the given weapon-slot index (0-based) has a Box 1 wire
   * connected to it.  When no Box 1 wires exist at all, returns true for all
   * slots (legacy fallback — preserves existing saves).
   */
  isSlotEquippedByWire(slotIdx: number): boolean;
  /** Returns true if at least one Box 1 → weapon-slot wire exists. */
  hasAnyEquipWire(): boolean;
  /**
   * Returns the current multiplier level (1-based) for a given weapon slot and
   * stat column key ('atkIn' | 'spdIn' | 'rngIn' | 'prcIn').
   * Returns 1 (no multiplier) if no modifier box is connected to that slot/stat.
   */
  getWeaponStatMultiplier(slotIdx: number, statKey: 'atkIn' | 'spdIn' | 'rngIn' | 'prcIn'): number;
  /** Returns the five WEAP column cell elements (one per weapon row) for drag-drop targeting. */
  getWeapSlotCells(): HTMLElement[];
}

export function createRpgStatsPanel(ctx: RpgStatsPanelCtx): RpgStatsPanelHandle {
  const { rpgSimState, playerStats } = ctx;
  const MAX_DPS_SLOTS = 5;

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

  // ── DOM elements (construction delegated to rpg-stats-panel-dom.ts) ──────────
  const {
    statsPanel,
    menuArea,
    xpAmountEl,
    hpFractionValue, regValue, defValue,
    weaponRowSpans, weaponRowPlugEls,
    weaponSourcePlugEls,
    xpOutPlugEl,
    playerXpInEl,
    mod1XpIn, mod1Out, mod2XpIn, mod2Out, mod3XpIn, mod3Out,
    modProgressFills, modLevelTexts,
    playerLevelEl, playerXpBarFill,
    weapHeaderCell,
    dpsLabelEl, dpsValueEl, dpsChartEl, dpsAxisEl, dpsAxisLowEl, dpsAxisHighEl,
  } = buildStatsPanelDom();

  // ── WEAP column tap handling ───────────────────────────────────────────────
  // Collect the WEAP cell elements (col 0 of each weapon data row) for later.
  const weapSlotCells: HTMLElement[] = [];
  if (ctx.onWeapCellTap) {
    // Header: "Weap" label cell
    weapHeaderCell.style.cursor = 'pointer';
    weapHeaderCell.addEventListener('click', () => ctx.onWeapCellTap!(null, weapHeaderCell));

    // Data rows: col 0 of each weapon row
    for (let r = 0; r < weaponRowPlugEls.length; r++) {
      const cell = weaponRowPlugEls[r][0].parentElement as HTMLElement;
      if (cell) {
        cell.dataset.weapSlotIdx = String(r);
        cell.style.cursor = 'pointer';
        const slotIdx = r;
        cell.addEventListener('click', () => ctx.onWeapCellTap!(slotIdx, cell));
        weapSlotCells.push(cell);
      }
    }
  } else {
    // Still collect cells for getWeapSlotCells() even without a tap callback
    for (let r = 0; r < weaponRowPlugEls.length; r++) {
      const cell = weaponRowPlugEls[r][0].parentElement as HTMLElement;
      if (cell) {
        cell.dataset.weapSlotIdx = String(r);
        weapSlotCells.push(cell);
      }
    }
  }

  // ── Wire connection state (ephemeral — resets on page load) ──────────────────
  //
  // equippedByWire: set of slot indices (0-4) wired to Box 1.
  // xpTargetModifier: index (0/1/2) of the modifier box Box 2 is connected to,
  //   or null if no connection.
  // xpTargetPlayer: true when the XP wire is connected to Box 1's XP input socket.
  // statModifiers: maps "slotIdx:statKey" → array of modifierIdx values (0/1/2).
  //   Multiple modifier boxes can connect to the same stat; their levels are
  //   summed additively (e.g. x3 + x4 = x7) rather than multiplied.
  const equippedByWire = new Set<number>();
  let xpTargetModifier: number | null = null;
  let xpTargetPlayer = false;
  const statModifiers = new Map<string, number[]>();

  /** Parse 'weaponSource:N' → N-1 (0-based slot index), or null. */
  function parseWeaponSourceId(plugId: string): number | null {
    const m = plugId.match(/^weaponSource:(\d+)$/);
    return m ? parseInt(m[1], 10) - 1 : null;
  }
  /** Parse 'weaponSlot:R:weapIn' → R-1 (0-based slot index), or null. */
  function parseWeaponSlotWeapIn(plugId: string): number | null {
    const m = plugId.match(/^weaponSlot:(\d+):weapIn$/);
    return m ? parseInt(m[1], 10) - 1 : null;
  }
  /** Parse 'modifier:N:out' → N-1 (0-based modifier index), or null. */
  function parseModifierOutId(plugId: string): number | null {
    const m = plugId.match(/^modifier:(\d+):out$/);
    return m ? parseInt(m[1], 10) - 1 : null;
  }
  /** Parse 'modifier:N:xpIn' → N-1 (0-based modifier index), or null. */
  function parseModifierXpInId(plugId: string): number | null {
    const m = plugId.match(/^modifier:(\d+):xpIn$/);
    return m ? parseInt(m[1], 10) - 1 : null;
  }
  /** Parse 'weaponSlot:R:statKey' → { slotIdx, statKey }, or null. */
  function parseStatInId(plugId: string): { slotIdx: number; statKey: string } | null {
    const m = plugId.match(/^weaponSlot:(\d+):(atkIn|spdIn|rngIn|prcIn)$/);
    if (!m) return null;
    return { slotIdx: parseInt(m[1], 10) - 1, statKey: m[2] };
  }

  function handleWireConnect(fromPlugId: string, toPlugId: string): void {
    // Box 1 weapon source → weapon slot equip
    const srcSlot = parseWeaponSourceId(fromPlugId);
    if (srcSlot !== null) {
      const destSlot = parseWeaponSlotWeapIn(toPlugId);
      if (destSlot !== null) equippedByWire.add(destSlot);
      return;
    }
    // Box 2 XP out → modifier xpIn
    if (fromPlugId === 'xp:out') {
      const modIdx = parseModifierXpInId(toPlugId);
      if (modIdx !== null) {
        xpTargetModifier = modIdx;
        return;
      }
      // Box 2 XP out → Box 1 player XP input socket
      if (toPlugId === 'player:xpIn') {
        xpTargetPlayer = true;
        return;
      }
      return;
    }
    // Modifier out → stat socket
    // Multiplier boxes stack additively: connecting x3 and x4 to the same stat
    // gives an effective multiplier of x7 (sum of levels, not product).
    const modOutIdx = parseModifierOutId(fromPlugId);
    if (modOutIdx !== null) {
      const statIn = parseStatInId(toPlugId);
      if (statIn !== null) {
        const mapKey = `${statIn.slotIdx}:${statIn.statKey}`;
        const existing = statModifiers.get(mapKey);
        if (existing) {
          existing.push(modOutIdx);
        } else {
          statModifiers.set(mapKey, [modOutIdx]);
        }
      }
    }
  }

  function handleWireDisconnect(fromPlugId: string, toPlugId: string): void {
    // Box 1 disconnect
    const srcSlot = parseWeaponSourceId(fromPlugId);
    if (srcSlot !== null) {
      const destSlot = parseWeaponSlotWeapIn(toPlugId);
      if (destSlot !== null) equippedByWire.delete(destSlot);
      return;
    }
    // Box 2 disconnect
    if (fromPlugId === 'xp:out') {
      const modIdx = parseModifierXpInId(toPlugId);
      if (modIdx !== null) {
        xpTargetModifier = null;
        return;
      }
      if (toPlugId === 'player:xpIn') {
        xpTargetPlayer = false;
        return;
      }
      return;
    }
    // Modifier out disconnect — remove just this modifier index from the stat's list.
    // Remaining connected modifiers continue to apply their levels additively.
    const modOutIdx = parseModifierOutId(fromPlugId);
    if (modOutIdx !== null) {
      const statIn = parseStatInId(toPlugId);
      if (statIn !== null) {
        const mapKey = `${statIn.slotIdx}:${statIn.statKey}`;
        const arr = statModifiers.get(mapKey);
        if (arr) {
          const i = arr.indexOf(modOutIdx);
          if (i !== -1) arr.splice(i, 1);
          if (arr.length === 0) statModifiers.delete(mapKey);
        }
      }
    }
  }

  // ── Equip wiring system ───────────────────────────────────────────
  // Manages drag-to-connect soft-body wires for all visible plugs.
  // State is ephemeral (reset on page load) — not persisted in sim state.
  const equipWiring = createEquipWiringSystem({
    panelEl:           statsPanel,
    getMaxWeaponSlots: () => getMaxEquippedWeapons(rpgSimState),
    onWireConnect:     (from, to) => handleWireConnect(from, to),
    onWireDisconnect:  (from, to) => handleWireDisconnect(from, to),
  });

  // Register box 1 weapon source plugs
  for (let i = 0; i < weaponSourcePlugEls.length; i++) {
    equipWiring.registerPlug(`weaponSource:${i + 1}`, 'weaponSourceOut', weaponSourcePlugEls[i]);
    equipWiring.setPlugLocked(`weaponSource:${i + 1}`, i > 0);
  }

  // Register box 2 xpOut plug
  equipWiring.registerPlug('xp:out', 'xpOut', xpOutPlugEl);
  // Expand the drag-start hit area: clicking anywhere in the XP node row cell
  // starts the XP cable drag, not just the small plug circle.
  if (xpOutPlugEl.parentElement) {
    equipWiring.setPlugHitElement('xp:out', xpOutPlugEl.parentElement as HTMLElement);
  }

  // Register boxes 3–5 modifier plugs
  equipWiring.registerPlug('modifier:1:xpIn', 'modifierXpIn', mod1XpIn);
  equipWiring.registerPlug('modifier:1:out',  'modifierOut',  mod1Out);
  equipWiring.registerPlug('modifier:2:xpIn', 'modifierXpIn', mod2XpIn);
  equipWiring.registerPlug('modifier:2:out',  'modifierOut',  mod2Out);
  equipWiring.registerPlug('modifier:3:xpIn', 'modifierXpIn', mod3XpIn);
  equipWiring.registerPlug('modifier:3:out',  'modifierOut',  mod3Out);
  // Expand the drag-start hit area for each modifier output: clicking anywhere
  // in the modifier box cell starts the cable drag toward a stat.
  // DOM structure: outPlug → plugStack → modifierBoxCell
  const mod1Cell = mod1Out.parentElement?.parentElement as HTMLElement | null;
  const mod2Cell = mod2Out.parentElement?.parentElement as HTMLElement | null;
  const mod3Cell = mod3Out.parentElement?.parentElement as HTMLElement | null;
  if (mod1Cell) equipWiring.setPlugHitElement('modifier:1:out', mod1Cell);
  if (mod2Cell) equipWiring.setPlugHitElement('modifier:2:out', mod2Cell);
  if (mod3Cell) equipWiring.setPlugHitElement('modifier:3:out', mod3Cell);
  // Expand the drop zone for each modifier xpIn: dropping an XP cable anywhere
  // inside the modifier box connects to the xpIn plug of that box (mobile-friendly).
  // DOM structure: xpInPlug → plugStack → modifierBoxCell (same as mod*Cell above)
  const mod1XpInCell = mod1XpIn.parentElement?.parentElement as HTMLElement | null;
  const mod2XpInCell = mod2XpIn.parentElement?.parentElement as HTMLElement | null;
  const mod3XpInCell = mod3XpIn.parentElement?.parentElement as HTMLElement | null;
  if (mod1XpInCell) equipWiring.setPlugDropHitElement('modifier:1:xpIn', mod1XpInCell);
  if (mod2XpInCell) equipWiring.setPlugDropHitElement('modifier:2:xpIn', mod2XpInCell);
  if (mod3XpInCell) equipWiring.setPlugDropHitElement('modifier:3:xpIn', mod3XpInCell);

  // Register Box 1 player XP input socket (square purple plug at the bottom).
  // Accepts the XP wire so that XP reservoir can be routed to direct player progression.
  // The entire Box 1 container acts as the drop zone (generous mobile target).
  equipWiring.registerPlug('player:xpIn', 'playerXpIn', playerXpInEl);
  equipWiring.setPlugDropHitElement('player:xpIn', statsPanel.querySelector('.rpg-xp-box-1') as HTMLElement ?? playerXpInEl);

  // Register boxes 7–11 weapon row plugs
  const weaponSlotColIds = ['weapIn', 'atkIn', 'spdIn', 'rngIn', 'prcIn'] as const;
  const weaponSlotColTypes = ['weaponSlotIn', 'statIn', 'statIn', 'statIn', 'statIn'] as const;
  for (let r = 0; r < weaponRowSpans.length; r++) {
    for (let c = 0; c < 5; c++) {
      const plugId = `weaponSlot:${r + 1}:${weaponSlotColIds[c]}`;
      equipWiring.registerPlug(plugId, weaponSlotColTypes[c], weaponRowPlugEls[r][c]);
      // Dropping a compatible cable anywhere inside the destination cell
      // connects to its plug, rather than requiring the small circle.
      const destinationCell = weaponRowPlugEls[r][c].parentElement as HTMLElement | null;
      if (destinationCell) equipWiring.setPlugDropHitElement(plugId, destinationCell);
    }
  }

  function weaponAbbrev(weaponId: string): string {
    if (weaponId === SAND_SLOT_KEY) return 'SAN';
    const tierId = resolveWeaponDefinition(weaponId)?.costTierId ?? 'sand';
    return tierId.slice(0, 3).toUpperCase();
  }

  function weaponColor(weaponId: string): string {
    if (weaponId === SAND_SLOT_KEY) return TIER_BY_ID.get('sand')?.color ?? '#ffd764';
    const tierId = resolveWeaponDefinition(weaponId)?.costTierId;
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
    const effect = resolveWeaponDefinition(weaponId)?.stats.effect;
    if (!effect || effect.kind !== 'piercing') return 0;
    return Math.round(effect.defPierceRatio * 100);
  }

  /**
   * Compute the ordered list of DPS display slots from the currently equipped
   * weapon IDs.  Sand weapons (sand_blade, __base__) are collapsed into a
   * single SAND_SLOT_KEY entry that always appears first.
   *
   * The sand slot is shown whenever the Sand Blade is active, which is always
   * EXCEPT when Diamond Blade (diamond_bastion) is equipped.  Diamond Blade
   * replaces Sand Blade in the melee slot, so when it is equipped the sand
   * slot is hidden and Diamond Blade's own slot takes over.
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
    // Show the sand slot unless Diamond Blade is equipped (Diamond Blade
    // replaces Sand Blade in the melee slot).  For all other equipment
    // combinations the Sand Blade is always active alongside other weapons.
    if (!hasSandSlot) {
      const hasDiamondBlade = equippedIds.includes(DIAMOND_BLADE_ID);
      if (!hasDiamondBlade) {
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

  let lastStatsPanelUpdateCallMs = 0;

  function updateStatsPanelDom(): void {
    const nowMs = performance.now();
    const drainDeltaMs = lastStatsPanelUpdateCallMs > 0
      ? Math.min(nowMs - lastStatsPanelUpdateCallMs, 100)
      : 0;
    lastStatsPanelUpdateCallMs = nowMs;

    // ── Box 13: HP / Reg / Def ────────────────────────────────────
    hpFractionValue.textContent = Math.max(0, Math.ceil(playerStats.hp)) + ' / ' + playerStats.maxHp;
    regValue.textContent = (Number.isInteger(playerStats.regen) ? playerStats.regen.toString() : playerStats.regen.toFixed(1)) + '%';
    defValue.textContent = Math.round(Math.min(100, playerStats.def)) + '%';

    // Box 2 XP node: show the reservoir (unallocated XP), not total XP.
    xpAmountEl.textContent = formatXp(rpgSimState.xpReservoir);

    // Update weapon source plug lock states based on current max slots
    const maxWeaponSlots = getMaxEquippedWeapons(rpgSimState);
    for (let i = 0; i < weaponSourcePlugEls.length; i++) {
      equipWiring.setPlugLocked(`weaponSource:${i + 1}`, i >= maxWeaponSlots);
    }

    // Equip wiring: advance rope physics and redraw all wires
    equipWiring.update(nowMs);

    // ── XP reservoir drain (every frame, before DPS throttle) ────
    if (rpgSimState.xpReservoir > 0 && drainDeltaMs > 0) {
      if (xpTargetModifier !== null) {
        const drainRate = Math.max(50, rpgSimState.xpReservoir * 1.5);
        let drainAmount = drainRate * (drainDeltaMs / 1000);
        drainAmount = Math.min(drainAmount, rpgSimState.xpReservoir);
        rpgSimState.xpReservoir -= drainAmount;
        if (rpgSimState.xpReservoir < 0) rpgSimState.xpReservoir = 0;
        tickMultiplierXpProgress(rpgSimState, xpTargetModifier, drainAmount);
      } else if (xpTargetPlayer) {
        // XP wire connected to Box 1 player XP input socket.
        // Drain the reservoir and advance the player's level progress.
        const drainRate = Math.max(50, rpgSimState.xpReservoir * 1.5);
        let drainAmount = drainRate * (drainDeltaMs / 1000);
        drainAmount = Math.min(drainAmount, rpgSimState.xpReservoir);
        rpgSimState.xpReservoir -= drainAmount;
        if (rpgSimState.xpReservoir < 0) rpgSimState.xpReservoir = 0;
        const levelsGained = tickPlayerXpProgress(rpgSimState, drainAmount);
        if (levelsGained > 0) {
          ctx.onPlayerLevelUp?.();
        }
      }
    }

    // ── DPS chart update ──────────────────────────────────────────
    const now = Date.now();
    while (dpsWindow.length > 0 && now - dpsWindow[0].t > DPS_WINDOW_MS) {
      dpsWindow.shift();
    }

    // ── Box 1: player level label + XP bar (every frame) ─────────
    playerLevelEl.textContent = 'Lv.' + rpgSimState.playerLevel;
    const xpPct = rpgSimState.playerXpToNextLevel > 0
      ? Math.min(1, rpgSimState.playerXp / rpgSimState.playerXpToNextLevel)
      : 0;
    playerXpBarFill.style.width = (xpPct * 100).toFixed(1) + '%';

    const equippedIds = Array.from(ctx.getEffectiveEquippedIds());
    const displaySlots = buildDisplaySlots(equippedIds);
    const slotsKey = displaySlots.join('|');
    if (slotsKey !== lastDpsEquipKey) {
      lastDpsEquipKey = slotsKey;
      rebuildDpsRows(displaySlots);
    }
    if (now - lastDpsDomUpdateMs < DPS_DOM_UPDATE_MS && slotsKey !== '') return;
    lastDpsDomUpdateMs = now;

    // ── Boxes 3–5: multiplier box UI (progress bar + level text) ─
    for (let i = 0; i < 3; i++) {
      const box = rpgSimState.multiplierBoxes[i];
      const cost = getMultiplierXpCost(box.level);
      const pct = cost > 0 ? Math.min(100, (box.progressXp / cost) * 100) : 0;
      modProgressFills[i].style.width = pct.toFixed(1) + '%';
      modLevelTexts[i].textContent = 'x' + box.level;
    }

    // ── Boxes 7–11: weapon stat rows ─────────────────────────────
    // Show the weapon assigned to each slot (0–4); empty slots show dashes.
    for (let r = 0; r < weaponRowSpans.length; r++) {
      const spans = weaponRowSpans[r];
      const weaponId = rpgSimState.equippedWeaponSlots.get(r);
      if (!weaponId) {
        // Empty slot
        for (let c = 0; c < spans.length; c++) {
          const sp = spans[c];
          sp.style.color = 'rgba(255,255,255,0.18)';
          sp.textContent = '—';
          if (c === 0) delete sp.dataset.weaponIconId;
        }
        continue;
      }
      const def = resolveWeaponDefinition(weaponId);
      const color = weaponColor(weaponId);
      // WEAP column: mirror the inventory icon with the weapon tier in its corner.
      const weaponTier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
      const iconKey = `${weaponId}:${weaponTier}`;
      if (spans[0].dataset.weaponIconId !== iconKey) {
        const craftedWeapon = rpgSimState.craftedWeapons.find(weapon => weapon.id === weaponId);
        const tierId = craftedWeapon?.dominantTierId ?? def?.costTierId ?? 'sand';
        const composition = craftedWeapon?.composition.map(entry => ({
          tierId: entry.tierId,
          share: entry.share,
        })) ?? [{ tierId, share: 1 }];
        const iconCanvas = createItemIconCanvas({
          itemType: 'weapon',
          tierId,
          composition,
          width: 28,
          height: 28,
          seed: stringToIconSeed(weaponId),
        });
        iconCanvas.className = 'rpg-box4-weapon-icon-canvas';
        const tierBadge = document.createElement('span');
        tierBadge.className = 'rpg-box4-weapon-tier';
        tierBadge.textContent = String(weaponTier);
        spans[0].textContent = '';
        spans[0].append(iconCanvas, tierBadge);
        spans[0].dataset.weaponIconId = iconKey;
      }
      spans[0].style.color = color;
      if (def) {
        const dim = 'rgba(255,255,255,0.7)';
        // Show effective stats including multipliers where a modifier is wired.
        const atkMult = getWeaponStatMultiplier(r, 'atkIn');
        const spdMult = getWeaponStatMultiplier(r, 'spdIn');
        const rngMult = getWeaponStatMultiplier(r, 'rngIn');
        const prcMult = getWeaponStatMultiplier(r, 'prcIn');
        spans[1].style.color = atkMult > 1 ? '#c4b5fd' : dim;
        spans[1].textContent = atkMult > 1 ? String(Math.round(def.stats.damage * atkMult)) : String(def.stats.damage);
        const effectiveCooldownMs = Math.round(def.stats.cooldownMs / spdMult);
        spans[2].style.color = spdMult > 1 ? '#c4b5fd' : dim;
        spans[2].textContent = formatWeaponSpd(effectiveCooldownMs);
        spans[3].style.color = rngMult > 1 ? '#c4b5fd' : dim;
        spans[3].textContent = formatWeaponRng(def.stats.range * rngMult);
        const basePrc = weaponPiercePercent(weaponId);
        const effectivePrc = Math.min(100, Math.round(basePrc * prcMult));
        spans[4].style.color = prcMult > 1 ? '#c4b5fd' : dim;
        spans[4].textContent = effectivePrc + '%';
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

  // ── Wire state public helpers ─────────────────────────────────────

  function isSlotEquippedByWire(slotIdx: number): boolean {
    return equippedByWire.has(slotIdx);
  }

  function hasAnyEquipWire(): boolean {
    return equippedByWire.size > 0;
  }

  /**
   * Returns the effective multiplier for a weapon stat by summing all connected
   * modifier box levels additively.
   *
   * Additive stacking rule:
   *   - No modifier connected         → 1  (baseline, unmodified)
   *   - One modifier at level 3       → 3  (x3)
   *   - Two modifiers at level 3 + 4  → 7  (x3 + x4 = x7)
   *   - Three at 3 + 4 + 2            → 9  (x9)
   *
   * This function is the single source of truth for all stat multiplier
   * calculations — do not duplicate the connection-lookup logic elsewhere.
   */
  function getWeaponStatMultiplier(slotIdx: number, statKey: 'atkIn' | 'spdIn' | 'rngIn' | 'prcIn'): number {
    const mapKey = `${slotIdx}:${statKey}`;
    const modIndices = statModifiers.get(mapKey);
    if (!modIndices || modIndices.length === 0) return 1;
    // Sum the levels of all connected modifier boxes (additive stacking).
    let total = 0;
    for (const idx of modIndices) {
      total += rpgSimState.multiplierBoxes[idx]?.level ?? 1;
    }
    return total;
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
    isSlotEquippedByWire,
    hasAnyEquipWire,
    getWeaponStatMultiplier,
    getWeapSlotCells(): HTMLElement[] { return weapSlotCells; },
  };
}
