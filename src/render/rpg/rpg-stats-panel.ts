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
import { WEAPON_BY_ID, INFINITE_RANGE } from '../../data/rpg/weapon-definitions';
import { TIER_BY_ID } from '../../data/tiers';
import type { RpgPlayerStats } from './rpg-types';
import { BASE_ATTACK_TIMER_KEY } from './rpg-constants';
import type { NumberFormat } from '../../util/format';
import { createEquipWiringSystem } from './rpg-equip-wiring';
import { buildStatsPanelDom } from './rpg-stats-panel-dom';

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
    mod1XpIn, mod1Out, mod2XpIn, mod2Out, mod3XpIn, mod3Out,
    dpsLabelEl, dpsValueEl, dpsChartEl, dpsAxisEl, dpsAxisLowEl, dpsAxisHighEl,
  } = buildStatsPanelDom();

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
  for (let r = 0; r < weaponRowSpans.length; r++) {
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
    for (let r = 0; r < weaponRowSpans.length; r++) {
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
