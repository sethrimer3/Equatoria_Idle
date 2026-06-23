/**
 * equipment-debug-overlay.ts — Dev-only panel showing live equipment state.
 *
 * Shows:
 *   - Equipped lenses and their effects
 *   - Equipped weaves and their effects
 *   - Combined equipment combat modifiers
 *   - Active weave buffs with remaining duration
 *   - Recent lens/weave proc events (last 20)
 *   - Current reward drop chances and eligible tiers
 *
 * Only mount this panel when settings.isDevMode is true.
 * The element is not created until mountEquipmentDebugOverlay() is called,
 * so it has zero cost in production.
 */

import type { RpgSimState } from '../sim/rpg/rpg-state';
import type { EquipmentRewardRollContext } from '../data/rpg/equipment-rewards';
import { getEquippedLensModifiers, getEquippedWeaveModifiers } from '../data/rpg/equipment-modifiers';
import { getTotalActiveWeaveBuffPct } from '../data/rpg/weave-proc-effects';
import { getRecentEquipmentProcEvents, type EquipmentProcKind } from './equipment-proc-log';
import { getRewardTuningInfo } from '../data/rpg/equipment-rewards';
import { TIER_BY_ID } from '../data/tiers';

// ── Helpers ───────────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  css: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

function sectionHeader(label: string): HTMLElement {
  return el('div',
    'font-size:0.65em;color:#6a5aff;letter-spacing:0.08em;text-transform:uppercase;' +
    'margin:6px 0 2px;border-bottom:1px solid rgba(100,80,255,0.2);padding-bottom:2px;',
    label,
  );
}

const PROC_KIND_COLOR: Record<EquipmentProcKind, string> = {
  lens_status:      '#aaa',
  lens_t2_proc:     '#f9a',
  lens_t3_proc:     '#fc8',
  weave_proc:       '#8df',
  weave_buff_start: '#5f5',
  weave_buff_expire:'#f88',
};

// ── Overlay builder ───────────────────────────────────────────────────────────

export interface EquipmentDebugOverlay {
  element: HTMLElement;
  /** Call each frame (or on state change) to refresh the displayed data. */
  update(state: RpgSimState, rewardCtx?: EquipmentRewardRollContext): void;
}

export function createEquipmentDebugOverlay(): EquipmentDebugOverlay {
  const root = document.createElement('div');
  root.style.cssText =
    'position:fixed;top:8px;right:8px;width:320px;max-height:80vh;overflow-y:auto;' +
    'background:rgba(6,4,22,0.93);border:1px solid rgba(100,80,255,0.35);border-radius:6px;' +
    'padding:8px 10px;font-size:0.72em;font-family:monospace;color:#bbb;z-index:19999;' +
    'pointer-events:none;';

  const titleBar = el('div',
    'color:#9af;font-weight:700;font-size:1.1em;margin-bottom:4px;',
    '⚙ Equipment Debug',
  );
  root.appendChild(titleBar);

  const body = document.createElement('div');
  root.appendChild(body);

  function update(state: RpgSimState, rewardCtx?: EquipmentRewardRollContext): void {
    body.innerHTML = '';

    // ── Equipped Lenses ────────────────────────────────────────────────────────
    body.appendChild(sectionHeader('Equipped Lenses'));
    const weaponsWithLens = state.craftedWeapons.filter(w => w.attachedLens != null);
    if (weaponsWithLens.length === 0) {
      body.appendChild(el('div', 'color:#555;margin:1px 0;', 'none'));
    }
    for (const weapon of weaponsWithLens) {
      const lens = weapon.attachedLens!;
      const wRow = el('div', 'margin:2px 0;');
      wRow.innerHTML =
        `<span style="color:#c8b4ff">${weapon.name}</span>` +
        ` → <span style="color:#adf">${lens.name}</span>` +
        ` <span style="color:#555">(${lens.totalWeightedMoteValue} mote-wt)</span>`;
      body.appendChild(wRow);
      for (const eff of lens.effects) {
        const tierColor = TIER_BY_ID.get(eff.tierId)?.color ?? '#aaa';
        const typeLabel = eff.effectTier === 1 ? 'STATUS' : eff.effectTier === 2 ? 'PROC' : 'CHAIN';
        const typeColor = eff.effectTier === 1 ? '#888' : eff.effectTier === 2 ? '#f9a' : '#fc8';
        const effRow = el('div', 'margin:1px 0 1px 10px;');
        effRow.innerHTML =
          `<span style="color:${typeColor};font-size:0.85em">${typeLabel}</span> ` +
          `<span style="background:${tierColor};color:#000;padding:0 2px;border-radius:2px">${eff.tierId}</span> ` +
          `<span style="color:#ccc">${eff.name}</span> ` +
          `<span style="color:#999">×${eff.magnitude.toFixed(1)}</span>` +
          (!eff.isApplied ? ' <span style="color:#555">(inactive)</span>' : '');
        body.appendChild(effRow);
      }
    }

    // ── Equipped Weaves ────────────────────────────────────────────────────────
    body.appendChild(sectionHeader('Equipped Weaves'));
    const equippedWeaveIds = state.equippedWeaveSlots.filter((id): id is string => id !== null);
    const weaveById = new Map(state.craftedWeaves.map(w => [w.id, w]));
    if (equippedWeaveIds.length === 0) {
      body.appendChild(el('div', 'color:#555;margin:1px 0;', 'none'));
    }
    for (const id of equippedWeaveIds) {
      const weave = weaveById.get(id);
      if (!weave) continue;
      const wRow = el('div', 'margin:2px 0;');
      const domColor = TIER_BY_ID.get(weave.ingredients[0]?.tierId ?? 'sand')?.color ?? '#aaa';
      wRow.innerHTML = `<span style="color:${domColor}">${weave.name}</span>`;
      body.appendChild(wRow);
      for (const eff of weave.effects ?? []) {
        const effRow = el('div', 'margin:1px 0 1px 10px;color:#adf;', eff.id + ` ×${eff.value.toFixed(1)}`);
        body.appendChild(effRow);
      }
      for (const te of weave.tierEffects) {
        const effRow = el('div', 'margin:1px 0 1px 10px;');
        effRow.innerHTML =
          `<span style="color:#888;font-size:0.85em">T${te.effectTier} PASSIVE</span> ` +
          `<span style="color:#ccc">${te.name}</span>` +
          (!te.isApplied ? ' <span style="color:#555">(inactive)</span>' : '');
        body.appendChild(effRow);
      }
    }

    // ── Combined Modifiers ─────────────────────────────────────────────────────
    body.appendChild(sectionHeader('Combined Modifiers'));
    const lensesForMods = weaponsWithLens.map(w => w.attachedLens!);
    const weaveMods = getEquippedWeaveModifiers(equippedWeaveIds, state.craftedWeaves);
    const modLines: string[] = [];
    if (weaveMods.weaponDamagePct > 0)  modLines.push(`+${weaveMods.weaponDamagePct.toFixed(1)}% DMG`);
    if (weaveMods.cooldownPct > 0)      modLines.push(`-${weaveMods.cooldownPct.toFixed(1)}% CD`);
    if (weaveMods.critChancePct > 0)    modLines.push(`+${weaveMods.critChancePct.toFixed(1)}% CRIT`);
    if (weaveMods.critDamagePct > 0)    modLines.push(`+${weaveMods.critDamagePct.toFixed(1)}% CRIT DMG`);
    if (weaveMods.statusChancePct > 0)  modLines.push(`+${weaveMods.statusChancePct.toFixed(1)}% STATUS`);
    if (weaveMods.playerDefensePct > 0) modLines.push(`+${weaveMods.playerDefensePct.toFixed(1)}% DEF`);

    // Add lens modifiers per weapon
    for (const lens of lensesForMods) {
      const lm = getEquippedLensModifiers(lens, 'equipped', 1);
      if (lm.weaponDamagePct > 0)  modLines.push(`+${lm.weaponDamagePct.toFixed(1)}% DMG (lens)`);
      if (lm.statusChancePct > 0)  modLines.push(`+${lm.statusChancePct.toFixed(1)}% STATUS (lens)`);
    }

    if (modLines.length === 0) {
      body.appendChild(el('div', 'color:#555;', 'no modifiers active'));
    } else {
      const modEl = el('div', 'color:#9cf;line-height:1.6;', modLines.join('  '));
      body.appendChild(modEl);
    }

    // ── Active Weave Buffs ─────────────────────────────────────────────────────
    body.appendChild(sectionHeader('Active Weave Buffs'));
    const buffs = state.activeWeaveBuffs;
    if (buffs.length === 0) {
      body.appendChild(el('div', 'color:#555;', 'none'));
    }
    for (const buff of buffs) {
      const buffRow = el('div', 'margin:1px 0;');
      buffRow.innerHTML =
        `<span style="color:#5f5">${buff.effectId}</span> ` +
        `<span style="color:#9cf">${buff.valuePct.toFixed(1)}% ${buff.statKey}</span> ` +
        `<span style="color:#888">${(buff.remainingMs / 1000).toFixed(1)}s left</span>`;
      body.appendChild(buffRow);
    }

    // Active buff totals
    const dmgBuff = getTotalActiveWeaveBuffPct(state, 'weaponDamagePct');
    const cdBuff  = getTotalActiveWeaveBuffPct(state, 'cooldownPct');
    const defBuff = getTotalActiveWeaveBuffPct(state, 'playerDefensePct');
    if (dmgBuff > 0 || cdBuff > 0 || defBuff > 0) {
      const totals = [
        dmgBuff > 0 ? `+${dmgBuff.toFixed(1)}% DMG` : '',
        cdBuff > 0  ? `-${cdBuff.toFixed(1)}% CD` : '',
        defBuff > 0 ? `+${defBuff.toFixed(1)}% DEF` : '',
      ].filter(Boolean).join('  ');
      body.appendChild(el('div', 'color:#9cf;margin-top:2px;', `Total: ${totals}`));
    }

    // ── Reward Tuning ─────────────────────────────────────────────────────────
    if (rewardCtx) {
      body.appendChild(sectionHeader('Reward Tuning'));
      const info = getRewardTuningInfo(rewardCtx);

      const chanceRow = el('div', 'margin:1px 0;');
      chanceRow.innerHTML =
        `<span style="color:#aaa">source: </span><span style="color:#fa0">${info.source}</span>  ` +
        `<span style="color:#aaa">lens: </span><span style="color:#5f5">${(info.lensDropChance * 100).toFixed(1)}%</span>  ` +
        `<span style="color:#aaa">weave: </span><span style="color:#5f5">${(info.weaveDropChance * 100).toFixed(1)}%</span>`;
      body.appendChild(chanceRow);

      const waveRow = el('div', 'color:#888;margin:1px 0;',
        `wave ${info.wave} · depth cap ${info.depthCap} · zone ${info.zoneId}`);
      body.appendChild(waveRow);

      const lensRow = el('div', 'margin:2px 0;');
      lensRow.innerHTML = `<span style="color:#aaa">lens tiers: </span>` +
        info.eligibleLensTiers.map(tid => {
          const c = TIER_BY_ID.get(tid)?.color ?? '#aaa';
          return `<span style="background:${c};color:#000;padding:0 2px;border-radius:2px;margin:0 1px">${tid}</span>`;
        }).join('');
      body.appendChild(lensRow);

      const weaveRow2 = el('div', 'margin:2px 0;');
      weaveRow2.innerHTML = `<span style="color:#aaa">weave tiers: </span>` +
        info.eligibleWeaveTiers.map(tid => {
          const c = TIER_BY_ID.get(tid)?.color ?? '#aaa';
          return `<span style="background:${c};color:#000;padding:0 2px;border-radius:2px;margin:0 1px">${tid}</span>`;
        }).join('');
      body.appendChild(weaveRow2);
    }

    // ── Recent Proc Events ────────────────────────────────────────────────────
    body.appendChild(sectionHeader('Recent Proc Events'));
    const events = [...getRecentEquipmentProcEvents()].reverse();
    if (events.length === 0) {
      body.appendChild(el('div', 'color:#555;', 'no events yet'));
    }
    const now = performance.now();
    for (const evt of events.slice(0, 15)) {
      const ageS = ((now - evt.timeMs) / 1000).toFixed(1);
      const kindColor = PROC_KIND_COLOR[evt.kind] ?? '#aaa';
      const evtRow = el('div', 'margin:1px 0;line-height:1.4;');
      evtRow.innerHTML =
        `<span style="color:#555">${ageS}s</span> ` +
        `<span style="color:${kindColor}">[${evt.kind}]</span> ` +
        `<span style="color:#ccc">${evt.sourceName}</span>` +
        (evt.targetType ? ` <span style="color:#888">→${evt.targetType}</span>` : '') +
        ` <span style="color:#99b">${evt.summary}</span>`;
      body.appendChild(evtRow);
    }
  }

  return { element: root, update };
}
