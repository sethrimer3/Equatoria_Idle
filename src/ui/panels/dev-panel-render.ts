import type { GameState } from '../../sim';
import {
  ALIVEN_VARIANTS,
  ALIVEN_VARIANT_PARAMS,
} from '../../render/rpg/rpg-aliven-constants';
import {
  getSessionTelemetrySnapshot,
  getAvgSacrificePerCrunch,
} from '../../dev/session-telemetry';
import { el } from './dev-panel-dom';

export function refreshForgeStateLines(
  game: GameState,
  forgeHeatLine: HTMLElement,
  forgeCrunchLine: HTMLElement,
  forgeSacrText: HTMLElement,
): void {
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

export function refreshLoomStateTable(game: GameState, loomTableWrap: HTMLElement): void {
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

export function refreshTelemetryTables(
  telemetryForgeWrap: HTMLElement,
  telemetryLoomWrap: HTMLElement,
  telemetryAlivenWrap: HTMLElement,
): void {
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

// ─── Aliven balance table (static — built once from constants) ───

export function buildAlivenBalanceTable(): HTMLElement {
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
