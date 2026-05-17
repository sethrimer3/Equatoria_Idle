import type { StrategyResult } from './balance-forecast-types';
import { formatDuration } from './balance-forecast-types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Collect the union of all milestone IDs across all strategies. */
export function collectMilestoneIds(results: StrategyResult[]): string[] {
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

export function renderStrategyComparison(results: StrategyResult[], body: HTMLElement): void {
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

  const lookup = new Map<string, Map<string, number>>();
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

  for (const r of results) {
    if (r.wasStuck) {
      const warn = el('div', 'bf-warning', `⚠ "${r.strategyName}" simulation was stuck or hit iteration limit after ${formatDuration(r.totalSimulatedSeconds)}`);
      body.appendChild(warn);
    }
  }
}

export function renderStrategyTimeline(results: StrategyResult[], body: HTMLElement): void {
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

  const SVG_W = 520;
  const ROW_H = 18;
  const LABEL_W = 120;
  const CHART_W = SVG_W - LABEL_W - 10;
  const HEADER_H = 24;
  const SVG_H = HEADER_H + milestoneIds.length * ROW_H + 20;

  const STRATEGY_COLORS = ['#7ab4ff', '#44ee88', '#f0d060', '#cc88ee', '#ff8c3c'];

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${SVG_W} ${SVG_H}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', String(SVG_H));
  svg.style.display = 'block';
  svg.style.maxWidth = '100%';
  svg.style.overflow = 'visible';

  const bg = document.createElementNS(svgNS, 'rect');
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '0');
  bg.setAttribute('width', String(SVG_W));
  bg.setAttribute('height', String(SVG_H));
  bg.setAttribute('fill', 'rgba(0,0,0,0.25)');
  bg.setAttribute('rx', '4');
  svg.appendChild(bg);

  let legendX = LABEL_W;
  for (let si = 0; si < results.length; si++) {
    const color = STRATEGY_COLORS[si % STRATEGY_COLORS.length];
    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('cx', String(legendX + 6));
    dot.setAttribute('cy', '12');
    dot.setAttribute('r', '5');
    dot.setAttribute('fill', color);
    svg.appendChild(dot);
    const lbl = document.createElementNS(svgNS, 'text');
    lbl.setAttribute('x', String(legendX + 15));
    lbl.setAttribute('y', '16');
    lbl.setAttribute('font-size', '9');
    lbl.setAttribute('fill', '#ccc');
    lbl.setAttribute('font-family', 'monospace');
    lbl.textContent = results[si].strategyName;
    svg.appendChild(lbl);
    legendX += Math.max(90, results[si].strategyName.length * 7 + 20);
  }

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

    if (mi % 2 === 0) {
      const rowBg = document.createElementNS(svgNS, 'rect');
      rowBg.setAttribute('x', '0');
      rowBg.setAttribute('y', String(rowY));
      rowBg.setAttribute('width', String(SVG_W));
      rowBg.setAttribute('height', String(ROW_H));
      rowBg.setAttribute('fill', 'rgba(255,255,255,0.04)');
      svg.appendChild(rowBg);
    }

    const labelText = document.createElementNS(svgNS, 'text');
    labelText.setAttribute('x', String(LABEL_W - 4));
    labelText.setAttribute('y', String(rowY + ROW_H / 2 + 3));
    labelText.setAttribute('font-size', '8');
    labelText.setAttribute('fill', '#aaa');
    labelText.setAttribute('text-anchor', 'end');
    labelText.setAttribute('font-family', 'monospace');
    const rawLabel = nameMap.get(milestoneId) ?? milestoneId;
    labelText.textContent = rawLabel.length > 18 ? `${rawLabel.slice(0, 17)}…` : rawLabel;
    svg.appendChild(labelText);

    const gridLine = document.createElementNS(svgNS, 'line');
    gridLine.setAttribute('x1', String(LABEL_W));
    gridLine.setAttribute('y1', String(rowY + ROW_H - 1));
    gridLine.setAttribute('x2', String(LABEL_W + CHART_W));
    gridLine.setAttribute('y2', String(rowY + ROW_H - 1));
    gridLine.setAttribute('stroke', 'rgba(255,255,255,0.06)');
    gridLine.setAttribute('stroke-width', '0.5');
    svg.appendChild(gridLine);

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
