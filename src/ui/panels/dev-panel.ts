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
import {
  getSessionTelemetrySnapshot,
  getAvgSacrificePerCrunch,
  resetSessionTelemetry,
} from '../../dev/session-telemetry';

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

  // ── 6. Session Telemetry ───────────────────────────────────────
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

  function refreshTelemetry(): void {
    const snap = getSessionTelemetrySnapshot();
    const avg  = getAvgSacrificePerCrunch();

    // ── Forge telemetry table ──────────────────────────────
    telemetryForgeWrap.innerHTML = '';
    const forgeTitle = el('div', 'dev-panel-info-line');
    forgeTitle.textContent = `⚗ Forge — crunches: ${snap.forge.crunchesCompleted} (${snap.forge.crunchesWithZeroParticles} zero-particle) · avg mass/crunch: ${avg.toFixed(1)}`;
    telemetryForgeWrap.appendChild(forgeTitle);

    const allForgeTiers = new Set([
      ...Object.keys(snap.forge.sacrificedMassByTier),
      ...Object.keys(snap.forge.equationUpgradesFromSacrificeByTier),
    ]);
    if (allForgeTiers.size > 0) {
      const ft = el('table', 'dev-panel-table dev-panel-table-dense');
      const fth = el('thead');
      const fhr = el('tr');
      for (const col of ['Tier', 'Mass Sacrificed', 'Upgrades Gained']) {
        fhr.appendChild(el('th', undefined, col));
      }
      fth.appendChild(fhr);
      ft.appendChild(fth);
      const ftb = el('tbody');
      for (const tier of Array.from(allForgeTiers).sort()) {
        const row = el('tr');
        row.appendChild(el('td', undefined, tier));
        row.appendChild(el('td', undefined, Math.round(snap.forge.sacrificedMassByTier[tier] ?? 0).toString()));
        row.appendChild(el('td', undefined, String(snap.forge.equationUpgradesFromSacrificeByTier[tier] ?? 0)));
        ftb.appendChild(row);
      }
      ft.appendChild(ftb);
      telemetryForgeWrap.appendChild(ft);
    } else {
      telemetryForgeWrap.appendChild(el('div', 'dev-panel-info-line', '(no forge sacrifices this session)'));
    }

    // ── Loom telemetry table ───────────────────────────────
    telemetryLoomWrap.innerHTML = '';
    const loomTitle = el('div', 'dev-panel-info-line');
    loomTitle.textContent = `🔗 Loom — eff. upgrades: ${snap.loom.efficiencyUpgradesPurchased}`;
    telemetryLoomWrap.appendChild(loomTitle);

    const allLoomInputTiers = Object.keys(snap.loom.capturesByInputTier).sort();
    if (allLoomInputTiers.length > 0) {
      const lt = el('table', 'dev-panel-table dev-panel-table-dense');
      const lth = el('thead');
      const lhr = el('tr');
      for (const col of ['Input Tier', 'Captures', 'Mass In', 'Output Tier', 'Motes Out']) {
        lhr.appendChild(el('th', undefined, col));
      }
      lth.appendChild(lhr);
      lt.appendChild(lth);
      const ltb = el('tbody');
      for (const tier of allLoomInputTiers) {
        const row = el('tr');
        row.appendChild(el('td', undefined, tier));
        row.appendChild(el('td', undefined, String(snap.loom.capturesByInputTier[tier] ?? 0)));
        row.appendChild(el('td', undefined, Math.round(snap.loom.capturedMassByInputTier[tier] ?? 0).toString()));
        // Find the output tier that produced motes for this input (next tier)
        const outTiers = Object.keys(snap.loom.outputMotesProducedByTier);
        row.appendChild(el('td', undefined, outTiers.length > 0 ? outTiers.join(',') : '—'));
        const totalOut = Object.values(snap.loom.outputMotesProducedByTier).reduce((a, b) => a + b, 0);
        row.appendChild(el('td', undefined, String(totalOut)));
        ltb.appendChild(row);
        break; // one row with aggregate — per-tier breakdown in second loop
      }
      // Per output-tier passive motes
      const passiveTiers = Object.keys(snap.loom.passiveMotesProduced).sort();
      if (passiveTiers.length > 0) {
        const passRow = el('tr');
        passRow.appendChild(el('td', undefined, 'passive'));
        passRow.appendChild(el('td', undefined, '—'));
        passRow.appendChild(el('td', undefined, '—'));
        passRow.appendChild(el('td', undefined, passiveTiers.join(',')));
        const passTotal = passiveTiers.reduce((a, t) => a + (snap.loom.passiveMotesProduced[t] ?? 0), 0);
        passRow.appendChild(el('td', undefined, passTotal.toFixed(2)));
        ltb.appendChild(passRow);
      }
      lt.appendChild(ltb);
      telemetryLoomWrap.appendChild(lt);
    } else {
      telemetryLoomWrap.appendChild(el('div', 'dev-panel-info-line', '(no loom captures this session)'));
    }

    // ── Aliven telemetry table ─────────────────────────────
    telemetryAlivenWrap.innerHTML = '';
    const alivenTitle = el('div', 'dev-panel-info-line');
    alivenTitle.textContent = `👾 Aliven — cap skips: ${snap.aliven.capSkips} · peak groups: ${snap.aliven.peakActiveGroups} · contact dmg: ${Math.round(snap.aliven.playerDamageFromContact)} · bullet dmg: ${Math.round(snap.aliven.playerDamageFromBullets)}`;
    telemetryAlivenWrap.appendChild(alivenTitle);

    const allVariants = new Set([
      ...Object.keys(snap.aliven.spawnedByVariant),
      ...Object.keys(snap.aliven.killedByVariant),
      ...Object.keys(snap.aliven.bulletsFiredByVariant),
    ]);
    if (allVariants.size > 0) {
      const at = el('table', 'dev-panel-table dev-panel-table-dense');
      const ath = el('thead');
      const ahr = el('tr');
      for (const col of ['Variant', 'Spawned', 'Killed', 'Bullets Fired']) {
        ahr.appendChild(el('th', undefined, col));
      }
      ath.appendChild(ahr);
      at.appendChild(ath);
      const atb = el('tbody');
      for (const variant of Array.from(allVariants).sort()) {
        const params = ALIVEN_VARIANT_PARAMS[variant as keyof typeof ALIVEN_VARIANT_PARAMS];
        const row = el('tr');
        const nameCell = el('td', undefined, variant.replace('aliven_', ''));
        if (params) nameCell.style.color = params.color;
        row.appendChild(nameCell);
        row.appendChild(el('td', undefined, String(snap.aliven.spawnedByVariant[variant] ?? 0)));
        row.appendChild(el('td', undefined, String(snap.aliven.killedByVariant[variant] ?? 0)));
        row.appendChild(el('td', undefined, String(snap.aliven.bulletsFiredByVariant[variant] ?? 0)));
        atb.appendChild(row);
      }
      at.appendChild(atb);
      telemetryAlivenWrap.appendChild(at);
    } else {
      telemetryAlivenWrap.appendChild(el('div', 'dev-panel-info-line', '(no Aliven events this session)'));
    }
  }

  function refresh(): void {
    if (!hooks) return;
    refreshAlivenCount();
    const game = hooks.getGame();
    refreshForgeState(game);
    refreshLoomState(game);
    refreshTelemetry();
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
