/**
 * balance-forecast-render.ts — Pure DOM-rendering helpers for the Balance
 * Forecast panel.
 *
 * All functions here take only data + a container element; none depend on
 * closure state from the panel factory.  Extracted from balance-forecast-panel.ts
 * to keep that file focused on wiring, state management, and event handlers.
 *
 * Exports:
 *   el, makeSection
 *   statusClass, categoryLabel, safeNum
 *   collectMilestoneIds
 *   renderStaticEtaTable, renderNextMeaningfulTargets
 *   renderFreshRunTimeline, renderStrategyComparison
 *   renderStrategyTimeline, renderPacingWarnings
 *   buildTextReport
 */

import type { ForecastTarget, ForecastResult, Milestone } from './balance-forecast-types';
import { formatDuration } from './balance-forecast-types';
export {
  collectMilestoneIds,
  renderStrategyComparison,
  renderStrategyTimeline,
} from './balance-forecast-render-strategies';

// ─── Generic DOM helper ───────────────────────────────────────────

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function makeSection(title: string): { section: HTMLElement; body: HTMLElement } {
  const section = el('div', 'bf-section');
  const header = el('div', 'bf-section-header', title);
  const body = el('div', 'bf-section-body');
  section.appendChild(header);
  section.appendChild(body);
  return { section, body };
}

// ─── CSS class helpers ────────────────────────────────────────────

export function statusClass(status: ForecastTarget['overallStatus']): string {
  switch (status) {
    case 'available':   return 'bf-status-available';
    case 'reachable':   return 'bf-status-reachable';
    case 'blocked':     return 'bf-status-blocked';
    case 'unavailable': return 'bf-status-unavailable';
    case 'maxed':       return 'bf-status-maxed';
    default:            return '';
  }
}

export function categoryLabel(cat: ForecastTarget['category']): string {
  switch (cat) {
    case 'equation_forge':    return 'Forge';
    case 'tier_unlock':       return 'Tier';
    case 'loom_upgrade':      return 'Loom';
    case 'special_loom':      return 'Resonance';
    case 'equation_upgrade':  return 'Equation';
    case 'achievement':       return 'Achievement';
    default:                  return '?';
  }
}

// ─── Safe number formatter ────────────────────────────────────────

export function safeNum(n: number): string {
  if (!isFinite(n) || isNaN(n)) return '?';
  if (n >= 1e9)  return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3)  return `${(n / 1e3).toFixed(2)}K`;
  return `${+n.toFixed(3)}`;
}

// ─── Rendering functions ──────────────────────────────────────────

export function renderStaticEtaTable(targets: ForecastTarget[], body: HTMLElement): void {
  body.innerHTML = '';

  if (targets.length === 0) {
    body.appendChild(el('div', 'bf-empty', 'No targets found.'));
    return;
  }

  // Group by status
  const groups: Array<{ label: string; statuses: ForecastTarget['overallStatus'][] }> = [
    { label: '✓ Available Now',  statuses: ['available'] },
    { label: '⏳ Reachable',     statuses: ['reachable'] },
    { label: '🚫 Blocked / Unavailable', statuses: ['blocked', 'unavailable'] },
  ];

  for (const group of groups) {
    const groupTargets = targets.filter(t => group.statuses.includes(t.overallStatus));
    if (groupTargets.length === 0) continue;

    const groupEl = el('div', 'bf-group');
    const groupLabel = el('div', 'bf-group-label', group.label);
    groupEl.appendChild(groupLabel);

    const table = el('table', 'bf-table');
    const thead = el('thead');
    const headerRow = el('tr');
    for (const col of ['Target', 'Category', 'ETA', 'Resource', 'Progress', 'Rate']) {
      const th = el('th', undefined, col);
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = el('tbody');
    for (const target of groupTargets) {
      const row = el('tr', statusClass(target.overallStatus));
      const bottleneck = target.bottleneck ?? target.requirements[0];

      const cells = [
        target.displayName,
        categoryLabel(target.category),
        target.etaLabel,
        bottleneck?.resourceName ?? '—',
        bottleneck
          ? `${safeNum(bottleneck.current)} / ${safeNum(bottleneck.required)}`
          : '—',
        bottleneck
          ? `${safeNum(bottleneck.productionPerSec)}/s`
          : '—',
      ];

      for (const text of cells) {
        const td = el('td', undefined, text);
        row.appendChild(td);
      }
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    groupEl.appendChild(table);
    body.appendChild(groupEl);
  }
}

export function renderNextMeaningfulTargets(targets: ForecastTarget[], body: HTMLElement): void {
  body.innerHTML = '';

  if (targets.length === 0) {
    body.appendChild(el('div', 'bf-empty', 'None reachable from current state.'));
    return;
  }

  const list = el('ul', 'bf-event-list');
  for (const t of targets) {
    const item = el('li', `bf-event-item ${statusClass(t.overallStatus)}`);
    const nameSpan = el('span', 'bf-event-name', t.displayName);
    const etaSpan  = el('span', 'bf-event-eta',  t.etaLabel);
    item.appendChild(nameSpan);
    item.appendChild(etaSpan);
    list.appendChild(item);
  }
  body.appendChild(list);
}

export function renderFreshRunTimeline(milestones: Milestone[], body: HTMLElement): void {
  body.innerHTML = '';

  if (milestones.length === 0) {
    body.appendChild(el('div', 'bf-empty', 'No milestones reached within max simulation time.'));
    return;
  }

  const table = el('table', 'bf-table');
  const thead = el('thead');
  const headerRow = el('tr');
  for (const col of ['Milestone', 'Time Reached', 'Notes']) {
    headerRow.appendChild(el('th', undefined, col));
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  for (const m of milestones) {
    const row = el('tr');
    row.appendChild(el('td', undefined, m.displayName));
    row.appendChild(el('td', 'bf-eta-cell', formatDuration(m.reachedAtSeconds)));
    row.appendChild(el('td', 'bf-notes-cell', m.notes ?? ''));
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  body.appendChild(table);
}

export function renderPacingWarnings(result: ForecastResult, body: HTMLElement): void {
  body.innerHTML = '';

  if (result.pacingWarnings.length === 0) {
    body.appendChild(el('div', 'bf-empty bf-ok', '✓ No pacing issues detected.'));
    return;
  }

  const list = el('ul', 'bf-warning-list');
  for (const w of result.pacingWarnings) {
    list.appendChild(el('li', 'bf-warning', `⚠ ${w.message}`));
  }
  body.appendChild(list);
}

// ─── Plain-text report for copy ──────────────────────────────────

export function buildTextReport(result: ForecastResult): string {
  const lines: string[] = ['=== BALANCE FORECAST ===', ''];

  lines.push('--- NEXT MEANINGFUL EVENTS ---');
  for (const t of result.nextMeaningfulTargets) {
    lines.push(`  ${t.displayName}: ${t.etaLabel}`);
  }
  lines.push('');

  lines.push('--- STATIC ETA (reachable) ---');
  for (const t of result.staticTargets.filter(x => x.overallStatus === 'available' || x.overallStatus === 'reachable')) {
    lines.push(`  [${t.category}] ${t.displayName}: ${t.etaLabel}`);
  }
  lines.push('');

  lines.push('--- FRESH-RUN TIMELINE ---');
  for (const m of result.freshRunMilestones) {
    lines.push(`  ${formatDuration(m.reachedAtSeconds).padEnd(8)} ${m.displayName}`);
  }
  lines.push('');

  lines.push('--- PACING WARNINGS ---');
  if (result.pacingWarnings.length === 0) {
    lines.push('  None');
  } else {
    for (const w of result.pacingWarnings) {
      lines.push(`  [${w.kind}] ${w.message}`);
    }
  }

  return lines.join('\n');
}
