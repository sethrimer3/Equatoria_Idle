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
 *
 * Pure rendering helpers (render* functions, DOM utilities, text report) have
 * been extracted to balance-forecast-render.ts.
 */

import type { GameState } from '../../../sim';
import type { ForecastResult } from './balance-forecast-types';
import { runBalanceForecast, type ForecastOptions } from './balance-forecast-engine';
import {
  el, makeSection,
  renderStaticEtaTable, renderNextMeaningfulTargets,
  renderFreshRunTimeline, renderStrategyComparison,
  renderStrategyTimeline, renderPacingWarnings,
  buildTextReport,
} from './balance-forecast-render';

// ─── Panel interface ──────────────────────────────────────────────

export interface BalanceForecastPanel {
  element: HTMLElement;
  /** Call when dev mode is toggled — shows/hides the panel. */
  setDevMode(isDevMode: boolean): void;
  /** Call with latest game state when the panel is opened or refreshed. */
  update(game: GameState): void;
  dispose(): void;
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
  let isDisposed = false;
  const ownedTimeoutIds = new Set<ReturnType<typeof setTimeout>>();

  function scheduleTimeout(callback: () => void, delayMs: number): void {
    const id = setTimeout(() => {
      ownedTimeoutIds.delete(id);
      if (!isDisposed) callback();
    }, delayMs);
    ownedTimeoutIds.add(id);
  }

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
    if (isDisposed || isRunning) return;
    isRunning = true;
    statusLine.textContent = '⏳ Running simulation…';
    refreshBtn.disabled = true;
    const fromCurrent = fromCurrentChk.checked;
    stratHeader.textContent = fromCurrent
      ? '🔀 Strategy Comparison (From Current State)'
      : '🔀 Strategy Comparison (Fresh Run)';

    // Use a minimal setTimeout so the UI updates before the blocking computation
    scheduleTimeout(() => {
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
      if (isDisposed) return;
      copyBtn.textContent = '✓ Copied!';
      scheduleTimeout(() => { copyBtn.textContent = '📋 Copy Results'; }, 2000);
    }).catch(() => {
      if (isDisposed) return;
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
      if (isDisposed) return;
      lastGame = game;
      // Auto-run when first opened (no result yet)
      if (!lastResult) {
        runAnalysis(game);
      }
    },
    dispose(): void {
      if (isDisposed) return;
      isDisposed = true;
      for (const timeoutId of ownedTimeoutIds) clearTimeout(timeoutId);
      ownedTimeoutIds.clear();
      lastGame = null;
      lastResult = null;
    },
  };
}
