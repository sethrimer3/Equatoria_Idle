/**
 * dev-panel.ts — Developer-mode playtesting and telemetry panel.
 *
 * Shown only when Developer Mode is enabled. Contains:
 *   1. RPG wave-jump buttons (waves 2, 5, 8, 12, 15, 18, 22, 25, 26+)
 *   2. Aliven spawn controls (by variant, all-8, clear) + live count display
 *   3. Forge state snapshot (heat tap count, crunch active, sacrifice progress)
 *   4. Loom state snapshot (conversionProgress, efficiencyLevel per tier)
 *   5. Aliven balance validation table (hpBase, atkBase, xpMult, specialCd, warnings)
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

// ─── Wave jump targets ───────────────────────────────────────────

const WAVE_JUMP_TARGETS = [2, 5, 8, 12, 15, 18, 22, 25, 26] as const;

// ─── DOM helpers ────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function makeSubTitle(text: string): HTMLElement {
  const h = el('div', 'settings-dev-title');
  h.textContent = text;
  return h;
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

  // ── 3. Forge State Snapshot ────────────────────────────────────
  section.appendChild(makeSubTitle('Forge State'));

  const forgeHeatLine    = el('div', 'dev-panel-info-line');
  const forgeCrunchLine  = el('div', 'dev-panel-info-line');
  const forgeSacrText    = el('div', 'dev-panel-info-line');
  section.appendChild(forgeHeatLine);
  section.appendChild(forgeCrunchLine);
  section.appendChild(forgeSacrText);

  // ── 4. Loom State Snapshot ────────────────────────────────────
  section.appendChild(makeSubTitle('Loom States'));

  const loomTableWrap = el('div', 'dev-panel-table-wrap');
  section.appendChild(loomTableWrap);

  // ── 5. Aliven Balance Validation Table ────────────────────────
  section.appendChild(makeSubTitle('Aliven Balance Table'));
  section.appendChild(buildAlivenBalanceTable());

  // ─── Helpers ─────────────────────────────────────────────────

  function refreshAlivenCount(): void {
    if (!hooks) return;
    const count = hooks.rpgRender.getAlivenGroupCount();
    alivenCountLine.textContent = `Active groups: ${count} / ${MAX_ACTIVE_ALIVEN_GROUPS}`;
  }

  function refreshForgeState(game: GameState): void {
    const forge = game.forge;
    forgeHeatLine.textContent   = `Heat taps: ${forge.heatTapCount} / 3`;
    forgeCrunchLine.textContent = `Crunch active: ${forge.isActive ? '✓ YES' : '—'}`;

    const sacr = forge.sacrificeProgressByTierId;
    if (sacr.size > 0) {
      const parts: string[] = [];
      for (const [tier, mass] of sacr) {
        parts.push(`${tier}: ${Math.round(mass)}`);
      }
      forgeSacrText.textContent = `Sacrifice progress: ${parts.join(', ')}`;
    } else {
      forgeSacrText.textContent = 'Sacrifice progress: (none)';
    }
  }

  function refreshLoomState(game: GameState): void {
    loomTableWrap.innerHTML = '';
    const unlockedLooms = game.looms.looms.filter(l => l.isUnlocked);
    if (unlockedLooms.length === 0) {
      loomTableWrap.appendChild(el('div', 'dev-panel-info-line', 'No looms unlocked.'));
      return;
    }

    const table = el('table', 'dev-panel-table');
    const thead = el('thead');
    const headerRow = el('tr');
    for (const col of ['Tier', 'Lvl', 'EffLvl', 'Progress', 'Special']) {
      headerRow.appendChild(el('th', undefined, col));
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = el('tbody');
    for (const loom of unlockedLooms) {
      const row = el('tr');
      row.appendChild(el('td', undefined, loom.tierId));
      row.appendChild(el('td', undefined, String(loom.level)));
      row.appendChild(el('td', undefined, String(loom.conversionEfficiencyLevel)));
      row.appendChild(el('td', undefined, `${loom.conversionProgress.toFixed(1)}`));
      const hasSpecial = game.looms.specialPurchased.has(loom.tierId);
      row.appendChild(el('td', undefined, hasSpecial ? '✓' : '—'));
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    loomTableWrap.appendChild(table);
  }

  function refresh(): void {
    if (!hooks) return;
    refreshAlivenCount();
    const game = hooks.getGame();
    refreshForgeState(game);
    refreshLoomState(game);
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

// ─── Aliven balance table (static — built once from constants) ───

function buildAlivenBalanceTable(): HTMLElement {
  const wrap = el('div', 'dev-panel-table-wrap');

  // Collect validation warnings first
  const warnings: string[] = [];
  for (const variantId of ALIVEN_VARIANTS) {
    const p = ALIVEN_VARIANT_PARAMS[variantId];
    const sentinel = 9999;
    if (p.hpBase <= 0)   warnings.push(`${variantId}: hpBase is ≤ 0`);
    if (p.atkBase <= 0)  warnings.push(`${variantId}: atkBase is ≤ 0`);
    if (p.xpMult <= 0)   warnings.push(`${variantId}: xpMult is ≤ 0`);
    // specialCdMin > specialCdMax is a bug unless both equal the sentinel (passive)
    const isPassive = p.specialCdMin >= sentinel && p.specialCdMax >= sentinel;
    if (!isPassive && p.specialCdMin > p.specialCdMax) {
      warnings.push(`${variantId}: specialCdMin (${p.specialCdMin}) > specialCdMax (${p.specialCdMax})`);
    }
  }

  if (warnings.length > 0) {
    const warnBox = el('div', 'dev-panel-warning-box');
    warnBox.textContent = '⚠ ' + warnings.join(' | ');
    wrap.appendChild(warnBox);
  } else {
    const okLine = el('div', 'dev-panel-info-line');
    okLine.textContent = '✓ No balance issues detected.';
    wrap.appendChild(okLine);
  }

  const table = el('table', 'dev-panel-table dev-panel-table-dense');
  const thead = el('thead');
  const headerRow = el('tr');
  for (const col of ['Variant', 'Tier', 'HP', 'ATK', 'XP×', 'Count', 'Spcl', 'CdMin', 'CdMax']) {
    headerRow.appendChild(el('th', undefined, col));
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  for (const variantId of ALIVEN_VARIANTS) {
    const p = ALIVEN_VARIANT_PARAMS[variantId];
    const shortName = variantId.replace('aliven_', '');
    const row = el('tr');
    const nameCell = el('td', undefined, shortName);
    nameCell.style.color = p.color;
    row.appendChild(nameCell);
    row.appendChild(el('td', undefined, p.tierId));
    row.appendChild(el('td', undefined, String(p.hpBase)));
    row.appendChild(el('td', undefined, String(p.atkBase)));
    row.appendChild(el('td', undefined, String(p.xpMult)));
    row.appendChild(el('td', undefined, String(p.particleCount)));
    row.appendChild(el('td', undefined, p.specialKind));
    const isPassive = p.specialCdMin >= 9999;
    row.appendChild(el('td', undefined, isPassive ? '—' : String(p.specialCdMin)));
    row.appendChild(el('td', undefined, isPassive ? '—' : String(p.specialCdMax)));
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);

  return wrap;
}
