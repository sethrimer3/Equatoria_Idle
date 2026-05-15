/**
 * balance-forecast-panel.ts — Developer-only Balance Forecast panel.
 *
 * Accessible only when isDevMode is true.
 * Shows three analyses:
 *   1. Static ETA analysis (current state → all targets)
 *   2. Fresh-run milestone timeline
 *   3. Strategy-comparison table
 *
 * Plus pacing warnings.
 *
 * Performance: runs simulation lazily (on open / on refresh button click),
 * never on every frame.
 */

import type { GameState } from '../../../sim';
import type { ForecastResult, ForecastTarget, Milestone, StrategyResult, StrategyId } from './balance-forecast-types';
import { formatDuration } from './balance-forecast-types';
import { runBalanceForecast, type ForecastOptions } from './balance-forecast-engine';

// ─── Panel interface ──────────────────────────────────────────────

export interface BalanceForecastPanel {
  element: HTMLElement;
  /** Call when dev mode is toggled — shows/hides the panel. */
  setDevMode(isDevMode: boolean): void;
  /** Call with latest game state when the panel is opened or refreshed. */
  update(game: GameState): void;
}

// ─── Max simulation time options ─────────────────────────────────

const MAX_SIM_OPTIONS: Array<{ label: string; seconds: number }> = [
  { label: '1 hour',  seconds: 3600 },
  { label: '8 hours', seconds: 28800 },
  { label: '1 day',   seconds: 86400 },
  { label: '1 week',  seconds: 604800 },
];

/** Default simulation time in seconds (8 hours). */
const DEFAULT_MAX_SIM_SECONDS = 28800;

// ─── CSS class helpers ────────────────────────────────────────────

function statusClass(status: ForecastTarget['overallStatus']): string {
  switch (status) {
    case 'available':   return 'bf-status-available';
    case 'reachable':   return 'bf-status-reachable';
    case 'blocked':     return 'bf-status-blocked';
    case 'unavailable': return 'bf-status-unavailable';
    case 'maxed':       return 'bf-status-maxed';
    default:            return '';
  }
}

function categoryLabel(cat: ForecastTarget['category']): string {
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

// ─── DOM helpers ──────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function makeSection(title: string): { section: HTMLElement; body: HTMLElement } {
  const section = el('div', 'bf-section');
  const header = el('div', 'bf-section-header', title);
  const body = el('div', 'bf-section-body');
  section.appendChild(header);
  section.appendChild(body);
  return { section, body };
}

// ─── Rendering helpers ────────────────────────────────────────────

function renderStaticEtaTable(targets: ForecastTarget[], body: HTMLElement): void {
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

function renderNextMeaningfulTargets(targets: ForecastTarget[], body: HTMLElement): void {
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

function renderFreshRunTimeline(milestones: Milestone[], body: HTMLElement): void {
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

/** Collect the union of all milestone IDs across all strategies. */
function collectMilestoneIds(results: StrategyResult[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const r of results) {
    for (const m of r.milestones) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        order.push(m.id);
      }
    }
  }
  return order;
}

function renderStrategyComparison(results: StrategyResult[], body: HTMLElement): void {
  body.innerHTML = '';

  if (results.length === 0) {
    body.appendChild(el('div', 'bf-empty', 'No strategy results.'));
    return;
  }

  const milestoneIds = collectMilestoneIds(results);

  if (milestoneIds.length === 0) {
    body.appendChild(el('div', 'bf-empty', 'No milestones reached in any simulation.'));
    return;
  }

  // Build a lookup: strategy → milestone id → time
  const lookup = new Map<StrategyId, Map<string, number>>();
  const nameMap = new Map<string, string>();
  for (const r of results) {
    const m = new Map<string, number>();
    for (const milestone of r.milestones) {
      m.set(milestone.id, milestone.reachedAtSeconds);
      nameMap.set(milestone.id, milestone.displayName);
    }
    lookup.set(r.strategyId, m);
  }

  const table = el('table', 'bf-table bf-strategy-table');
  const thead = el('thead');
  const headerRow = el('tr');
  headerRow.appendChild(el('th', undefined, 'Milestone'));
  for (const r of results) {
    const th = el('th', undefined, r.strategyName);
    if (r.wasStuck) th.title = 'Simulation got stuck';
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  for (const milestoneId of milestoneIds) {
    const row = el('tr');
    row.appendChild(el('td', 'bf-milestone-name', nameMap.get(milestoneId) ?? milestoneId));

    let bestTime = Infinity;
    for (const r of results) {
      const t = lookup.get(r.strategyId)?.get(milestoneId);
      if (t !== undefined && t < bestTime) bestTime = t;
    }

    for (const r of results) {
      const t = lookup.get(r.strategyId)?.get(milestoneId);
      const td = el('td', 'bf-eta-cell');
      if (t === undefined) {
        td.textContent = '—';
        td.className += ' bf-not-reached';
      } else {
        td.textContent = formatDuration(t);
        if (t === bestTime) td.className += ' bf-best';
      }
      row.appendChild(td);
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  body.appendChild(table);

  // Stuck warnings
  for (const r of results) {
    if (r.wasStuck) {
      const warn = el('div', 'bf-warning', `⚠ "${r.strategyName}" simulation was stuck or hit iteration limit after ${formatDuration(r.totalSimulatedSeconds)}`);
      body.appendChild(warn);
    }
  }
}

function renderStrategyTimeline(results: StrategyResult[], body: HTMLElement): void {
  body.innerHTML = '';

  if (results.length === 0) {
    body.appendChild(el('div', 'bf-empty', 'No strategy results available.'));
    return;
  }

  const milestoneIds = collectMilestoneIds(results);
  if (milestoneIds.length === 0) {
    body.appendChild(el('div', 'bf-empty', 'No milestones in any strategy run.'));
    return;
  }

  // Compute the max time across all strategies for the X axis
  let maxTimeSec = 0;
  for (const r of results) {
    for (const m of r.milestones) {
      if (m.reachedAtSeconds > maxTimeSec) maxTimeSec = m.reachedAtSeconds;
    }
  }
  if (maxTimeSec <= 0) {
    body.appendChild(el('div', 'bf-empty', 'All milestones at time 0 — nothing to display.'));
    return;
  }

  // ── SVG layout constants ──
  const SVG_W         = 520;
  const ROW_H         = 18;
  const LABEL_W       = 120;
  const CHART_W       = SVG_W - LABEL_W - 10;
  const HEADER_H      = 24;   // space for strategy legend at the top
  const SVG_H         = HEADER_H + milestoneIds.length * ROW_H + 20;

  // Strategy dot colours (cycle through a fixed palette)
  const STRATEGY_COLORS = ['#7ab4ff', '#44ee88', '#f0d060', '#cc88ee', '#ff8c3c'];

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${SVG_W} ${SVG_H}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', String(SVG_H));
  svg.style.display = 'block';
  svg.style.maxWidth = '100%';
  svg.style.overflow = 'visible';

  // ── Background ──
  const bg = document.createElementNS(svgNS, 'rect');
  bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
  bg.setAttribute('width', String(SVG_W)); bg.setAttribute('height', String(SVG_H));
  bg.setAttribute('fill', 'rgba(0,0,0,0.25)');
  bg.setAttribute('rx', '4');
  svg.appendChild(bg);

  // ── Strategy legend ──
  let legendX = LABEL_W;
  for (let si = 0; si < results.length; si++) {
    const color = STRATEGY_COLORS[si % STRATEGY_COLORS.length];
    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('cx', String(legendX + 6)); dot.setAttribute('cy', '12');
    dot.setAttribute('r', '5'); dot.setAttribute('fill', color);
    svg.appendChild(dot);
    const lbl = document.createElementNS(svgNS, 'text');
    lbl.setAttribute('x', String(legendX + 15)); lbl.setAttribute('y', '16');
    lbl.setAttribute('font-size', '9'); lbl.setAttribute('fill', '#ccc');
    lbl.setAttribute('font-family', 'monospace');
    lbl.textContent = results[si].strategyName;
    svg.appendChild(lbl);
    legendX += Math.max(90, results[si].strategyName.length * 7 + 20);
  }

  // ── Rows for each milestone ──
  const lookup = new Map<string, Map<string, number>>();
  for (const r of results) {
    const m = new Map<string, number>();
    for (const milestone of r.milestones) m.set(milestone.id, milestone.reachedAtSeconds);
    lookup.set(r.strategyId, m);
  }

  const nameMap = new Map<string, string>();
  for (const r of results) {
    for (const m of r.milestones) nameMap.set(m.id, m.displayName);
  }

  for (let mi = 0; mi < milestoneIds.length; mi++) {
    const milestoneId = milestoneIds[mi];
    const rowY = HEADER_H + mi * ROW_H;

    // Alternating row background
    if (mi % 2 === 0) {
      const rowBg = document.createElementNS(svgNS, 'rect');
      rowBg.setAttribute('x', '0'); rowBg.setAttribute('y', String(rowY));
      rowBg.setAttribute('width', String(SVG_W)); rowBg.setAttribute('height', String(ROW_H));
      rowBg.setAttribute('fill', 'rgba(255,255,255,0.04)');
      svg.appendChild(rowBg);
    }

    // Milestone label
    const labelText = document.createElementNS(svgNS, 'text');
    labelText.setAttribute('x', String(LABEL_W - 4));
    labelText.setAttribute('y', String(rowY + ROW_H / 2 + 3));
    labelText.setAttribute('font-size', '8');
    labelText.setAttribute('fill', '#aaa');
    labelText.setAttribute('text-anchor', 'end');
    labelText.setAttribute('font-family', 'monospace');
    const rawLabel = nameMap.get(milestoneId) ?? milestoneId;
    labelText.textContent = rawLabel.length > 18 ? rawLabel.slice(0, 17) + '…' : rawLabel;
    svg.appendChild(labelText);

    // Baseline grid line
    const gridLine = document.createElementNS(svgNS, 'line');
    gridLine.setAttribute('x1', String(LABEL_W)); gridLine.setAttribute('y1', String(rowY + ROW_H - 1));
    gridLine.setAttribute('x2', String(LABEL_W + CHART_W)); gridLine.setAttribute('y2', String(rowY + ROW_H - 1));
    gridLine.setAttribute('stroke', 'rgba(255,255,255,0.06)'); gridLine.setAttribute('stroke-width', '0.5');
    svg.appendChild(gridLine);

    // Dots per strategy
    for (let si = 0; si < results.length; si++) {
      const r = results[si];
      const t = lookup.get(r.strategyId)?.get(milestoneId);
      if (t === undefined) continue;
      const cx = LABEL_W + (t / maxTimeSec) * CHART_W;
      const cy = rowY + ROW_H / 2;
      const color = STRATEGY_COLORS[si % STRATEGY_COLORS.length];

      const dot = document.createElementNS(svgNS, 'circle');
      dot.setAttribute('cx', String(Math.round(cx)));
      dot.setAttribute('cy', String(Math.round(cy)));
      dot.setAttribute('r', '4');
      dot.setAttribute('fill', color);
      dot.setAttribute('opacity', '0.85');
      const tooltip = document.createElementNS(svgNS, 'title');
      tooltip.textContent = `${r.strategyName}: ${formatDuration(t)}`;
      dot.appendChild(tooltip);
      svg.appendChild(dot);
    }
  }

  // ── X-axis time labels ──
  const axisY = HEADER_H + milestoneIds.length * ROW_H + 14;
  const TICK_COUNT = 5;
  for (let ti = 0; ti <= TICK_COUNT; ti++) {
    const t = (ti / TICK_COUNT) * maxTimeSec;
    const x = LABEL_W + (ti / TICK_COUNT) * CHART_W;
    const tick = document.createElementNS(svgNS, 'text');
    tick.setAttribute('x', String(Math.round(x)));
    tick.setAttribute('y', String(axisY));
    tick.setAttribute('font-size', '8');
    tick.setAttribute('fill', '#888');
    tick.setAttribute('text-anchor', 'middle');
    tick.setAttribute('font-family', 'monospace');
    tick.textContent = formatDuration(t);
    svg.appendChild(tick);
  }

  body.appendChild(svg);

  const note = el('div', 'bf-notes-cell', '↑ Each dot = milestone reached at that time. Hover for exact value.');
  note.style.fontSize = '10px';
  note.style.color = '#666';
  note.style.marginTop = '4px';
  body.appendChild(note);
}

function renderPacingWarnings(result: ForecastResult, body: HTMLElement): void {
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

// ─── Safe number formatter ────────────────────────────────────────

function safeNum(n: number): string {
  if (!isFinite(n) || isNaN(n)) return '?';
  if (n >= 1e9)  return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3)  return `${(n / 1e3).toFixed(2)}K`;
  return `${+n.toFixed(3)}`;
}

// ─── Panel factory ────────────────────────────────────────────────

export function createBalanceForecastPanel(): BalanceForecastPanel {
  const wrapper = el('div', 'bf-panel');
  wrapper.style.display = 'none';

  // ── Header ──
  const header = el('div', 'bf-header');
  const title  = el('h3', 'bf-title', '⚖ Balance Forecast');
  const subtitle = el('div', 'bf-subtitle', 'Developer tool — not visible to players');
  header.appendChild(title);
  header.appendChild(subtitle);
  wrapper.appendChild(header);

  // ── Controls ──
  const controls = el('div', 'bf-controls');

  const maxSimLabel = el('label', 'bf-ctrl-label', 'Max sim time:');
  const maxSimSelect = el('select', 'bf-ctrl-select');
  for (const opt of MAX_SIM_OPTIONS) {
    const option = document.createElement('option');
    option.value = String(opt.seconds);
    option.textContent = opt.label;
    if (opt.seconds === DEFAULT_MAX_SIM_SECONDS) option.selected = true;
    maxSimSelect.appendChild(option);
  }
  maxSimLabel.appendChild(maxSimSelect);
  controls.appendChild(maxSimLabel);

  const fromCurrentLabel = el('label', 'bf-ctrl-label bf-ctrl-toggle');
  const fromCurrentChk   = el('input');
  fromCurrentChk.type    = 'checkbox';
  fromCurrentChk.title   = 'Start strategy simulations from your current resources/unlocks instead of a fresh run';
  fromCurrentLabel.appendChild(fromCurrentChk);
  fromCurrentLabel.appendChild(document.createTextNode(' Simulate from current state'));
  controls.appendChild(fromCurrentLabel);

  const refreshBtn = el('button', 'bf-refresh-btn', '↺ Run Analysis');
  controls.appendChild(refreshBtn);

  const copyBtn = el('button', 'bf-copy-btn', '📋 Copy Results');
  controls.appendChild(copyBtn);

  const statusLine = el('div', 'bf-status-line', 'Click "Run Analysis" to start.');
  controls.appendChild(statusLine);

  wrapper.appendChild(controls);

  // ── Sections ──
  const { section: nextSection, body: nextBody } = makeSection('⚡ Next Meaningful Events');
  const { section: etaSection, body: etaBody }   = makeSection('📊 Static ETA Analysis');
  const { section: timelineSection, body: timelineBody } = makeSection('🕐 Fresh-Run Milestone Timeline (Cheapest First)');
  const stratHeader = el('div', 'bf-section-header', '🔀 Strategy Comparison (Fresh Run)');
  const stratSection = el('div', 'bf-section');
  const stratBody = el('div', 'bf-section-body');
  stratSection.appendChild(stratHeader);
  stratSection.appendChild(stratBody);
  const { section: svgSection, body: svgBody }       = makeSection('📈 Strategy Timeline (Approximate)');
  const { section: warnSection, body: warnBody }     = makeSection('⚠ Pacing Warnings');

  wrapper.appendChild(nextSection);
  wrapper.appendChild(etaSection);
  wrapper.appendChild(timelineSection);
  wrapper.appendChild(stratSection);
  wrapper.appendChild(svgSection);
  wrapper.appendChild(warnSection);

  // ── State ──
  let lastGame: GameState | null = null;
  let lastResult: ForecastResult | null = null;
  let isRunning = false;

  function getMaxSimSeconds(): number {
    return parseInt(maxSimSelect.value, 10) || DEFAULT_MAX_SIM_SECONDS;
  }

  function renderResult(result: ForecastResult, durationMs: number): void {
    lastResult = result;

    renderNextMeaningfulTargets(result.nextMeaningfulTargets, nextBody);
    renderStaticEtaTable(result.staticTargets, etaBody);
    renderFreshRunTimeline(result.freshRunMilestones, timelineBody);
    renderStrategyComparison(result.strategyResults, stratBody);
    renderStrategyTimeline(result.strategyResults, svgBody);
    renderPacingWarnings(result, warnBody);

    statusLine.textContent = `Analysis complete in ${durationMs}ms. Warnings: ${result.pacingWarnings.length}`;
  }

  function runAnalysis(game: GameState): void {
    if (isRunning) return;
    isRunning = true;
    statusLine.textContent = '⏳ Running simulation…';
    refreshBtn.disabled = true;
    const fromCurrent = fromCurrentChk.checked;
    stratHeader.textContent = fromCurrent
      ? '🔀 Strategy Comparison (From Current State)'
      : '🔀 Strategy Comparison (Fresh Run)';

    // Use a minimal setTimeout so the UI updates before the blocking computation
    setTimeout(() => {
      try {
        const opts: ForecastOptions = {
          maxSimSeconds: getMaxSimSeconds(),
          simulateFromCurrentState: fromCurrent,
        };
        const startMs = Date.now();
        const result = runBalanceForecast(game, opts);
        const durationMs = Date.now() - startMs;
        renderResult(result, durationMs);
      } catch (err) {
        statusLine.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
        console.error('[BalanceForecast]', err);
      } finally {
        isRunning = false;
        refreshBtn.disabled = false;
      }
    }, 10);
  }

  refreshBtn.addEventListener('pointerdown', e => e.stopPropagation());
  refreshBtn.addEventListener('click', () => {
    if (lastGame) runAnalysis(lastGame);
  });

  copyBtn.addEventListener('pointerdown', e => e.stopPropagation());
  copyBtn.addEventListener('click', () => {
    if (!lastResult) return;
    const text = buildTextReport(lastResult);
    navigator.clipboard?.writeText(text).then(() => {
      copyBtn.textContent = '✓ Copied!';
      setTimeout(() => { copyBtn.textContent = '📋 Copy Results'; }, 2000);
    }).catch(() => {
      statusLine.textContent = 'Clipboard unavailable — see console.';
      console.log('[BalanceForecast results]\n', text);
    });
  });

  fromCurrentChk.addEventListener('pointerdown', e => e.stopPropagation());
  fromCurrentChk.addEventListener('change', () => {
    if (lastGame) runAnalysis(lastGame);
  });

  maxSimSelect.addEventListener('pointerdown', e => e.stopPropagation());
  maxSimSelect.addEventListener('change', () => {
    if (lastGame) runAnalysis(lastGame);
  });

  return {
    element: wrapper,

    setDevMode(isDevMode: boolean): void {
      wrapper.style.display = isDevMode ? '' : 'none';
    },

    update(game: GameState): void {
      lastGame = game;
      // Auto-run when first opened (no result yet)
      if (!lastResult) {
        runAnalysis(game);
      }
    },
  };
}

// ─── Plain-text report for copy ──────────────────────────────────

function buildTextReport(result: ForecastResult): string {
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
