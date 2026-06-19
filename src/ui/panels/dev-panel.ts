/**
 * dev-panel.ts — Developer-mode playtesting and telemetry panel.
 *
 * Shown only when Developer Mode is enabled. Contains:
 *   1. RPG wave-jump buttons (waves 2, 5, 8, 12, 15, 18, 22, 25, 26+)
 *   2. Aliven spawn controls (by variant, all-8, clear) + live count display
 *   3. Forge state snapshot (heat tap count, crunch active, sacrifice progress)
 *   4. Loom state snapshot (conversionProgress, efficiencyLevel per tier)
 *   5. Aliven balance validation table (hpBase, atkBase, xpMult, specialCd, warnings)
 *   6. Session telemetry tables (forge, loom, aliven counters + Reset button)
 *
 * All state is read on demand from game/rpgRender via the DevPanelHooks callback
 * object provided at registration time.  Nothing here is persisted.
 */

import type { GameState } from '../../sim';
import type { RpgRender } from '../../render/rpg/rpg-render';
import {
  ALIVEN_VARIANTS,
  ALIVEN_VARIANT_PARAMS,
  MAX_ACTIVE_ALIVEN_GROUPS,
} from '../../render/rpg/rpg-aliven-constants';
import { resetSessionTelemetry } from '../../dev/session-telemetry';
import { WAVE_JUMP_TARGETS, el, makeSubTitle } from './dev-panel-dom';
import {
  buildAlivenBalanceTable,
  refreshForgeStateLines,
  refreshLoomStateTable,
  refreshTelemetryTables,
} from './dev-panel-render';
import { getEquippedWeaveModifiers } from '../../data/rpg/equipment-modifiers';
import { getTotalActiveWeaveBuffDefPct, getTotalActiveWeaveBuffCooldownPct, getTotalActiveWeaveBuffWeaponDamagePct } from '../../data/rpg/weave-proc-effects';

// ─── Public interface ────────────────────────────────────────────

export interface DevPanelHooks {
  rpgRender: RpgRender;
  getGame: () => GameState;
}

export interface DevPanel {
  element: HTMLElement;
  /** Provide the hooks needed to drive the panel. Called once after rpgRender is ready. */
  setHooks(hooks: DevPanelHooks): void;
  /** Refresh displayed state values (call when the Settings tab becomes visible). */
  refresh(): void;
}

// ─── Factory ────────────────────────────────────────────────────

export function createDevPanel(): DevPanel {
  const section = el('div', 'settings-dev-section');

  let hooks: DevPanelHooks | null = null;

  // ── Title ──────────────────────────────────────────────────────
  const title = el('div', 'settings-dev-title');
  title.textContent = '🔬 Playtesting Tools';
  section.appendChild(title);

  // ── 1. RPG Wave Jump ──────────────────────────────────────────
  section.appendChild(makeSubTitle('RPG Wave Jump'));

  const waveRow = el('div', 'dev-panel-btn-row');
  for (const wave of WAVE_JUMP_TARGETS) {
    const btn = el('button', 'settings-dev-reset-btn');
    btn.textContent = `W${wave}`;
    btn.title = `Jump to wave ${wave}`;
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    btn.addEventListener('click', () => {
      hooks?.rpgRender.devJumpToWave(wave);
    });
    waveRow.appendChild(btn);
  }
  section.appendChild(waveRow);

  // ── 2. Aliven Spawn / Clear ────────────────────────────────────
  section.appendChild(makeSubTitle('Aliven Controls'));

  // Count display
  const alivenCountLine = el('div', 'dev-panel-info-line');
  alivenCountLine.textContent = `Active groups: — / ${MAX_ACTIVE_ALIVEN_GROUPS}`;
  section.appendChild(alivenCountLine);

  // Spawn-by-variant buttons
  const spawnByVariantWrap = el('div', 'dev-panel-btn-row');
  for (const variantId of ALIVEN_VARIANTS) {
    const params = ALIVEN_VARIANT_PARAMS[variantId];
    const shortName = variantId.replace('aliven_', '');
    const btn = el('button', 'settings-dev-reset-btn');
    btn.textContent = `+${shortName}`;
    btn.title = `Spawn one ${variantId} group`;
    btn.style.backgroundColor = params.color + '33';
    btn.style.borderColor = params.color;
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    btn.addEventListener('click', () => {
      hooks?.rpgRender.devSpawnAliven(variantId);
      refreshAlivenCount();
    });
    spawnByVariantWrap.appendChild(btn);
  }
  section.appendChild(spawnByVariantWrap);

  // Bulk + Clear buttons
  const alivenBulkRow = el('div', 'dev-panel-btn-row');

  const spawnCapBtn = el('button', 'settings-dev-reset-btn');
  spawnCapBtn.textContent = `⊕ Spawn ${MAX_ACTIVE_ALIVEN_GROUPS}`;
  spawnCapBtn.title = `Spawn ${MAX_ACTIVE_ALIVEN_GROUPS} groups across variants (cap test)`;
  spawnCapBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  spawnCapBtn.addEventListener('click', () => {
    if (!hooks) return;
    for (let i = 0; i < MAX_ACTIVE_ALIVEN_GROUPS; i++) {
      const variantId = ALIVEN_VARIANTS[i % ALIVEN_VARIANTS.length];
      hooks.rpgRender.devSpawnAliven(variantId);
    }
    refreshAlivenCount();
  });
  alivenBulkRow.appendChild(spawnCapBtn);

  const clearAlivenBtn = el('button', 'settings-dev-reset-btn');
  clearAlivenBtn.textContent = '✕ Clear Aliven';
  clearAlivenBtn.title = 'Remove all active Aliven groups';
  clearAlivenBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  clearAlivenBtn.addEventListener('click', () => {
    hooks?.rpgRender.devClearAliven();
    refreshAlivenCount();
  });
  alivenBulkRow.appendChild(clearAlivenBtn);

  section.appendChild(alivenBulkRow);

  // ── 3. Status Combo Testing ────────────────────────────────────
  section.appendChild(makeSubTitle('Status Combo Testing'));

  const comboPresets: Array<{ preset: string; label: string }> = [
    { preset: 'steamBurst',      label: '💨 Steam Burst'      },
    { preset: 'shatter',         label: '❄️ Shatter'           },
    { preset: 'toxicRupture',    label: '☠️ Toxic Rupture'     },
    { preset: 'gravityCollapse', label: '🌀 Gravity Collapse'  },
    { preset: 'riftDetonation',  label: '⚡ Rift Detonation'   },
  ];
  for (const { preset, label } of comboPresets) {
    const btn = el('button', 'settings-dev-btn');
    btn.textContent = label;
    btn.title = `Apply ${preset} statuses to nearest enemy`;
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    btn.addEventListener('click', () => { hooks?.rpgRender.devApplyStatusCombo(preset); });
    section.appendChild(btn);
  }

  // ── 5. Forge State Snapshot ────────────────────────────────────
  section.appendChild(makeSubTitle('Forge State'));

  const forgeHeatLine    = el('div', 'dev-panel-info-line');
  const forgeCrunchLine  = el('div', 'dev-panel-info-line');
  const forgeSacrText    = el('div', 'dev-panel-info-line');
  section.appendChild(forgeHeatLine);
  section.appendChild(forgeCrunchLine);
  section.appendChild(forgeSacrText);

  // ── 6. Loom State Snapshot ────────────────────────────────────
  section.appendChild(makeSubTitle('Loom States'));

  const loomTableWrap = el('div', 'dev-panel-table-wrap');
  section.appendChild(loomTableWrap);

  // ── 7. Aliven Balance Validation Table ────────────────────────
  section.appendChild(makeSubTitle('Aliven Balance Table'));
  section.appendChild(buildAlivenBalanceTable());

  // ── 8. Session Telemetry ───────────────────────────────────────
  section.appendChild(makeSubTitle('Session Telemetry'));

  // Reset button
  const resetTelemetryBtn = el('button', 'settings-dev-reset-btn');
  resetTelemetryBtn.textContent = '↺ Reset Session Telemetry';
  resetTelemetryBtn.title = 'Clear all session telemetry counters';
  resetTelemetryBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  resetTelemetryBtn.addEventListener('click', () => {
    resetSessionTelemetry();
    refreshTelemetry();
  });
  section.appendChild(resetTelemetryBtn);

  const telemetryForgeWrap  = el('div', 'dev-panel-table-wrap');
  const telemetryLoomWrap   = el('div', 'dev-panel-table-wrap');
  const telemetryAlivenWrap = el('div', 'dev-panel-table-wrap');
  section.appendChild(telemetryForgeWrap);
  section.appendChild(telemetryLoomWrap);
  section.appendChild(telemetryAlivenWrap);

  // ── 9. Weave Passive Totals ────────────────────────────────────
  section.appendChild(makeSubTitle('Weave Passive Totals'));

  const weaveDmgLine  = el('div', 'dev-panel-info-line');
  const weaveCdrLine  = el('div', 'dev-panel-info-line');
  const weaveDefLine  = el('div', 'dev-panel-info-line');
  section.appendChild(weaveDmgLine);
  section.appendChild(weaveCdrLine);
  section.appendChild(weaveDefLine);

  function refreshWeavePassives(): void {
    if (!hooks) return;
    const rpg = hooks.getGame().rpg;
    const mods = getEquippedWeaveModifiers(rpg.equippedWeaveSlots, rpg.craftedWeaves);
    weaveDmgLine.textContent = `Damage:  +${mods.weaponDamagePct.toFixed(2)}%`;
    weaveCdrLine.textContent = `Cooldown: -${mods.cooldownPct.toFixed(2)}%`;
    weaveDefLine.textContent = `DEF:     +${mods.playerDefensePct.toFixed(2)}%`;
  }

  // ── 10. Active Weave Buffs ─────────────────────────────────────
  section.appendChild(makeSubTitle('Active Weave Buffs'));

  const weaveBuffsLine = el('div', 'dev-panel-info-line');
  const weaveBuffTotalsLine = el('div', 'dev-panel-info-line');
  section.appendChild(weaveBuffsLine);
  section.appendChild(weaveBuffTotalsLine);

  function refreshWeaveBuffs(): void {
    if (!hooks) return;
    const rpg = hooks.getGame().rpg;
    const buffs = rpg.activeWeaveBuffs;
    if (buffs.length === 0) {
      weaveBuffsLine.textContent = 'No active weave buffs';
      weaveBuffTotalsLine.textContent = '';
    } else {
      weaveBuffsLine.textContent = buffs.map(b => {
        const sign = b.statKey === 'cooldownPct' ? '-' : '+';
        const label = b.statKey === 'cooldownPct' ? 'cooldown'
          : b.statKey === 'weaponDamagePct' ? 'weapon damage'
          : 'DEF';
        return `${b.effectId}: ${sign}${b.valuePct.toFixed(1)}% ${label}, ${(b.remainingMs / 1000).toFixed(1)}s`;
      }).join(' | ');
      const dmgPct = getTotalActiveWeaveBuffWeaponDamagePct(rpg);
      const cdrPct = getTotalActiveWeaveBuffCooldownPct(rpg);
      const defPct = getTotalActiveWeaveBuffDefPct(rpg);
      const parts: string[] = [];
      if (dmgPct > 0) parts.push(`DMG +${dmgPct.toFixed(2)}%`);
      if (cdrPct > 0) parts.push(`CDR -${cdrPct.toFixed(2)}%`);
      if (defPct > 0) parts.push(`DEF +${defPct.toFixed(2)}%`);
      weaveBuffTotalsLine.textContent = parts.length > 0 ? parts.join(' / ') : '';
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────

  function refreshAlivenCount(): void {
    if (!hooks) return;
    const count = hooks.rpgRender.getAlivenGroupCount();
    alivenCountLine.textContent = `Active groups: ${count} / ${MAX_ACTIVE_ALIVEN_GROUPS}`;
  }

  function refreshTelemetry(): void {
    refreshTelemetryTables(telemetryForgeWrap, telemetryLoomWrap, telemetryAlivenWrap);
  }

  function refresh(): void {
    if (!hooks) return;
    refreshAlivenCount();
    const game = hooks.getGame();
    refreshForgeStateLines(game, forgeHeatLine, forgeCrunchLine, forgeSacrText);
    refreshLoomStateTable(game, loomTableWrap);
    refreshTelemetry();
    refreshWeavePassives();
    refreshWeaveBuffs();
  }

  return {
    element: section,

    setHooks(h: DevPanelHooks): void {
      hooks = h;
      refresh();
    },

    refresh,
  };
}
