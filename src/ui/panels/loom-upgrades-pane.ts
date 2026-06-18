/**
 * loom-upgrades-pane.ts — Loom sub-tab content.
 *
 * Renders the "Loom" sub-tab within the combined Upgrades panel:
 *   • Passive-production Loom upgrade cards (one per colour tier)
 *   • Special one-time upgrade cards
 *
 * Extracted from loom-panel.ts to keep each sub-tab in its own focused module.
 */

import type { GameState } from '../../sim';
import type { ActionHandler } from '../../input';
import type { NumberFormat } from '../../util';
import { LOOM_DEFINITIONS, SPECIAL_LOOM_DEFINITIONS } from '../../data/looms';
import { TIER_BY_ID } from '../../data/tiers';
import { getLoom, getLoomRate, getLoomCost, isSpecialLoomPurchased } from '../../sim/looms';
import {
  getLoomInputTierId,
  getLoomConversionThreshold,
  getLoomEfficiencyUpgradeCost,
  MAX_LOOM_EFFICIENCY_LEVEL,
} from '../../sim/looms';
import { getMotes } from '../../sim/resources';
import { formatNumberAs, computeOutputCompression } from '../../util';
import { getGeneratorSpritePath } from '../../render/assets/asset-paths';
import { loadImage } from '../../render/assets/asset-loader';
import { createTintedCanvas } from '../../render/assets/sprite-tint';
import { makePageBreak } from '../ui-helpers';

// ─── Types ────────────────────────────────────────────────────────

export interface LoomUpgradesPane {
  element: HTMLElement;
  update(state: GameState, numberFormat: NumberFormat): void;
}

// ─── Helpers ─────────────────────────────────────────────────────

/** Draw the tinted generator sprite onto a small icon canvas. */
function renderLoomIconCanvas(canvas: HTMLCanvasElement, spritePath: string, color: string): void {
  loadImage(spritePath).then((sprite) => {
    const tinted = createTintedCanvas(sprite, color);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tinted, 0, 0, canvas.width, canvas.height);
  }).catch(() => { /* sprite not available — leave canvas blank */ });
}

// ─── Factory ─────────────────────────────────────────────────────

export function createLoomUpgradesPane(dispatch: ActionHandler): LoomUpgradesPane {
  const pane = document.createElement('div');
  pane.className = 'looms-sub-pane';

  // ── Title & subtitle ─────────────────────────────────────────

  const title = document.createElement('h3');
  title.className = 'panel-title';
  title.textContent = 'Looms';
  pane.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'panel-subtitle';
  subtitle.textContent = 'Passive mote production';
  pane.appendChild(subtitle);

  // ── Loom cards ───────────────────────────────────────────────

  // Persistent per-card element refs so update() can set textContent on
  // existing nodes instead of re-parsing innerHTML every tick (~10x/sec).
  interface LoomCardRefs {
    card: HTMLElement;
    btn: HTMLButtonElement;
    effBtn: HTMLButtonElement;
    lvSpan: HTMLElement;
    rawSpan: HTMLElement;
    sizeSpan: HTMLElement;
    rateSpan: HTMLElement;
    motesSpan: HTMLElement;
    convSpan: HTMLElement;
    convInputSpan: HTMLElement;
    convEffSpan: HTMLElement;
  }
  const cards: Map<string, LoomCardRefs> = new Map();

  function makeStat(parent: HTMLElement, className = 'loom-stat'): HTMLElement {
    const el = document.createElement('span');
    el.className = className;
    parent.appendChild(el);
    return el;
  }

  for (const def of LOOM_DEFINITIONS) {
    const tier = TIER_BY_ID.get(def.tierId);
    if (!tier) continue;

    const card = document.createElement('div');
    card.className = 'loom-card';
    card.style.borderLeftColor = tier.color;

    const header = document.createElement('div');
    header.className = 'loom-header';

    const spritePath = getGeneratorSpritePath(tier.unlockOrder);
    const iconCanvas = document.createElement('canvas');
    iconCanvas.className = 'loom-icon';
    iconCanvas.width = 32;
    iconCanvas.height = 32;
    renderLoomIconCanvas(iconCanvas, spritePath, tier.color);
    header.appendChild(iconCanvas);

    const nameEl = document.createElement('span');
    nameEl.className = 'loom-name';
    nameEl.style.color = tier.color;
    nameEl.textContent = def.displayName;
    header.appendChild(nameEl);

    card.appendChild(header);

    const desc = document.createElement('p');
    desc.className = 'loom-desc';
    desc.textContent = def.description;
    card.appendChild(desc);

    const stats = document.createElement('div');
    stats.className = 'loom-stats';
    const lvSpan = makeStat(stats);
    const rawSpan = makeStat(stats);
    const sizeSpan = makeStat(stats, 'loom-stat loom-emit-size');
    const rateSpan = makeStat(stats);
    const motesSpan = makeStat(stats);
    // Conversion stats: a wrapper holding the input-progress and efficiency
    // lines, toggled as a unit for looms that consume an input tier.
    const convSpan = document.createElement('span');
    const convInputSpan = makeStat(convSpan, 'loom-stat loom-conv');
    const convEffSpan = makeStat(convSpan, 'loom-stat loom-conv');
    stats.appendChild(convSpan);
    card.appendChild(stats);

    const btn = document.createElement('button');
    btn.className = 'upgrade-btn loom-upgrade-btn';
    btn.style.borderColor = tier.color;
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      dispatch({ kind: 'upgrade_loom', tierId: def.tierId });
    });
    card.appendChild(btn);

    // Efficiency upgrade button (shown for looms that have an input tier)
    const effBtn = document.createElement('button');
    effBtn.className = 'upgrade-btn loom-upgrade-btn loom-efficiency-btn';
    effBtn.style.borderColor = tier.color;
    effBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      dispatch({ kind: 'upgrade_loom_efficiency', tierId: def.tierId });
    });
    card.appendChild(effBtn);

    pane.appendChild(card);
    cards.set(def.tierId, {
      card, btn, effBtn,
      lvSpan, rawSpan, sizeSpan, rateSpan, motesSpan,
      convSpan, convInputSpan, convEffSpan,
    });
  }

  // Small page break after loom cards section
  pane.appendChild(makePageBreak('small'));

  // ── Special upgrades section ─────────────────────────────────

  const specialSeparator = document.createElement('h3');
  specialSeparator.className = 'panel-title';
  specialSeparator.style.marginTop = '16px';
  specialSeparator.textContent = 'Special Upgrades';
  pane.appendChild(specialSeparator);

  const specialSubtitle = document.createElement('p');
  specialSubtitle.className = 'panel-subtitle';
  specialSubtitle.textContent = 'One-time upgrades that double Loom production';
  pane.appendChild(specialSubtitle);

  interface SpecialCardRefs {
    card: HTMLElement;
    btn: HTMLButtonElement;
    statSpan: HTMLElement;
  }
  const specialCards: Map<string, SpecialCardRefs> = new Map();

  for (const def of SPECIAL_LOOM_DEFINITIONS) {
    const tier = TIER_BY_ID.get(def.tierId);
    if (!tier) continue;

    const card = document.createElement('div');
    card.className = 'loom-card';
    card.style.borderLeftColor = tier.color;

    const header = document.createElement('div');
    header.className = 'loom-header';

    const nameEl = document.createElement('span');
    nameEl.className = 'loom-name';
    nameEl.style.color = tier.color;
    nameEl.textContent = def.displayName;
    header.appendChild(nameEl);

    card.appendChild(header);

    const desc = document.createElement('p');
    desc.className = 'loom-desc';
    desc.textContent = def.description;
    card.appendChild(desc);

    const stats = document.createElement('div');
    stats.className = 'loom-stats';
    const statSpan = makeStat(stats);
    card.appendChild(stats);

    const btn = document.createElement('button');
    btn.className = 'upgrade-btn loom-upgrade-btn';
    btn.style.borderColor = tier.color;
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      dispatch({ kind: 'upgrade_special_loom', tierId: def.tierId });
    });
    card.appendChild(btn);

    pane.appendChild(card);
    specialCards.set(def.tierId, { card, btn, statSpan });
  }

  // Small page break after special upgrades section
  pane.appendChild(makePageBreak('small'));

  // ─── Update ───────────────────────────────────────────────────

  function update(state: GameState, numberFormat: NumberFormat): void {
    // Loom cards
    for (const def of LOOM_DEFINITIONS) {
      const refs = cards.get(def.tierId);
      if (!refs) continue;

      const loom = getLoom(state.looms, def.tierId);
      const isUnlocked = loom?.isUnlocked ?? false;

      refs.card.style.display = isUnlocked ? '' : 'none';
      if (!isUnlocked) continue;

      const level = loom!.level;
      const rate = getLoomRate(def.tierId, level);
      const cost = getLoomCost(def.tierId, level);
      const currentMotes = getMotes(state.resources, def.tierId);
      const canAfford = cost !== null && currentMotes >= cost;
      const tier = TIER_BY_ID.get(def.tierId);

      const effectiveRate = rate * state.achievements.loomMultiplierBonus;
      const { sizeLabel, emitRatePerSec } = computeOutputCompression(effectiveRate);
      const inputTierId = getLoomInputTierId(def.tierId);
      const inputTier = inputTierId ? TIER_BY_ID.get(inputTierId) : null;

      refs.lvSpan.textContent = `Lv ${level}`;
      refs.rawSpan.textContent = `${formatNumberAs(effectiveRate, numberFormat)}/s raw`;
      refs.sizeSpan.textContent = `Particle size: ${sizeLabel}`;
      refs.rateSpan.textContent = `Rate: ${formatNumberAs(emitRatePerSec, numberFormat)}/s`;
      refs.motesSpan.textContent = `${formatNumberAs(currentMotes, numberFormat)} motes`;

      if (inputTier) {
        const convProg = loom!.conversionProgress ?? 0;
        const convThreshold = getLoomConversionThreshold(loom!.conversionEfficiencyLevel ?? 0);
        const effLevel = loom!.conversionEfficiencyLevel ?? 0;
        refs.convSpan.style.display = '';
        refs.convInputSpan.innerHTML = `⚗ Converts <span style="color:${inputTier.color}">${inputTier.displayName}</span> → ${tier?.displayName ?? ''}: ${convProg.toFixed(0)}/${convThreshold.toFixed(0)}`;
        refs.convEffSpan.textContent = `Efficiency Lv ${effLevel}/${MAX_LOOM_EFFICIENCY_LEVEL}`;
      } else {
        refs.convSpan.style.display = 'none';
      }

      if (cost !== null) {
        refs.btn.textContent = `⬆ Upgrade — ${formatNumberAs(cost, numberFormat)} ${tier?.displayName ?? ''}`;
        refs.btn.disabled = !canAfford;
      } else {
        refs.btn.textContent = '⬆ MAX';
        refs.btn.disabled = true;
      }

      // Update efficiency upgrade button
      refs.effBtn.classList.toggle('loom-efficiency-btn--hidden', !inputTierId);
      if (inputTierId) {
        const effLevel = loom!.conversionEfficiencyLevel ?? 0;
        if (effLevel >= MAX_LOOM_EFFICIENCY_LEVEL) {
          refs.effBtn.textContent = '✦ Efficiency MAX';
          refs.effBtn.disabled = true;
        } else {
          const effCost = getLoomEfficiencyUpgradeCost(def.tierId, effLevel);
          // Cost is paid in the loom's own output-tier motes (same tier as this loom).
          const ownBalance = getMotes(state.resources, def.tierId);
          refs.effBtn.textContent = `⚗ Efficiency +1 — ${formatNumberAs(effCost, numberFormat)} ${tier?.displayName ?? ''}`;
          refs.effBtn.disabled = ownBalance < effCost;
        }
      }
    }

    // Special upgrade cards
    const unlockedCount = state.progression.unlockedTierCount;

    for (const def of SPECIAL_LOOM_DEFINITIONS) {
      const refs = specialCards.get(def.tierId);
      if (!refs) continue;

      const tier = TIER_BY_ID.get(def.tierId);
      const loom = getLoom(state.looms, def.tierId);
      const isUnlocked = loom?.isUnlocked ?? false;
      const tierOrderOk = tier ? tier.unlockOrder < unlockedCount : false;

      refs.card.style.display = isUnlocked && tierOrderOk ? '' : 'none';
      if (!isUnlocked || !tierOrderOk) continue;

      const purchased = isSpecialLoomPurchased(state.looms, def.tierId);
      const currentMotes = getMotes(state.resources, def.tierId);
      const canAfford = currentMotes >= def.cost;

      refs.statSpan.textContent = `${formatNumberAs(currentMotes, numberFormat)} / ${formatNumberAs(def.cost, numberFormat)} ${tier?.displayName ?? ''}`;

      if (purchased) {
        refs.btn.textContent = '✦ Purchased';
        refs.btn.disabled = true;
      } else {
        refs.btn.textContent = `✦ Purchase — ${formatNumberAs(def.cost, numberFormat)} ${tier?.displayName ?? ''}`;
        refs.btn.disabled = !canAfford;
      }
    }
  }

  return { element: pane, update };
}
