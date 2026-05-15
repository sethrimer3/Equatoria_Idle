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

  const cards: Map<string, HTMLElement> = new Map();
  const upgradeButtons: Map<string, HTMLButtonElement> = new Map();

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
    effBtn.style.marginTop = '4px';
    effBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      dispatch({ kind: 'upgrade_loom_efficiency', tierId: def.tierId });
    });
    card.appendChild(effBtn);

    pane.appendChild(card);
    cards.set(def.tierId, card);
    upgradeButtons.set(def.tierId, btn);
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

  const specialCards: Map<string, HTMLElement> = new Map();
  const specialButtons: Map<string, HTMLButtonElement> = new Map();

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
    specialCards.set(def.tierId, card);
    specialButtons.set(def.tierId, btn);
  }

  // Small page break after special upgrades section
  pane.appendChild(makePageBreak('small'));

  // ─── Update ───────────────────────────────────────────────────

  function update(state: GameState, numberFormat: NumberFormat): void {
    // Loom cards
    for (const def of LOOM_DEFINITIONS) {
      const card = cards.get(def.tierId);
      const btn = upgradeButtons.get(def.tierId);
      if (!card || !btn) continue;

      const loom = getLoom(state.looms, def.tierId);
      const isUnlocked = loom?.isUnlocked ?? false;

      card.style.display = isUnlocked ? '' : 'none';
      if (!isUnlocked) continue;

      const level = loom!.level;
      const rate = getLoomRate(def.tierId, level);
      const cost = getLoomCost(def.tierId, level);
      const currentMotes = getMotes(state.resources, def.tierId);
      const canAfford = cost !== null && currentMotes >= cost;
      const tier = TIER_BY_ID.get(def.tierId);

      const statsEl = card.querySelector('.loom-stats');
      if (statsEl) {
        const effectiveRate = rate * state.achievements.loomMultiplierBonus;
        const { sizeLabel, emitRatePerSec } = computeOutputCompression(effectiveRate);
        const inputTierId = getLoomInputTierId(def.tierId);
        const inputTier = inputTierId ? TIER_BY_ID.get(inputTierId) : null;
        const convProg = loom!.conversionProgress ?? 0;
        const convThreshold = getLoomConversionThreshold(loom!.conversionEfficiencyLevel ?? 0);
        const effLevel = loom!.conversionEfficiencyLevel ?? 0;
        let conversionHtml = '';
        if (inputTier) {
          conversionHtml = `
            <span class="loom-stat loom-conv">⚗ Converts <span style="color:${inputTier.color}">${inputTier.displayName}</span> → ${tier?.displayName ?? ''}: ${convProg.toFixed(0)}/${convThreshold.toFixed(0)}</span>
            <span class="loom-stat loom-conv">Efficiency Lv ${effLevel}/${MAX_LOOM_EFFICIENCY_LEVEL}</span>
          `;
        }
        statsEl.innerHTML = `
          <span class="loom-stat">Lv ${level}</span>
          <span class="loom-stat">${formatNumberAs(effectiveRate, numberFormat)}/s raw</span>
          <span class="loom-stat loom-emit-size">Particle size: ${sizeLabel}</span>
          <span class="loom-stat">Rate: ${formatNumberAs(emitRatePerSec, numberFormat)}/s</span>
          <span class="loom-stat">${formatNumberAs(currentMotes, numberFormat)} motes</span>
          ${conversionHtml}
        `;
      }

      if (cost !== null) {
        btn.textContent = `⬆ Upgrade — ${formatNumberAs(cost, numberFormat)} ${tier?.displayName ?? ''}`;
        btn.disabled = !canAfford;
      } else {
        btn.textContent = '⬆ MAX';
        btn.disabled = true;
      }

      // Update efficiency upgrade button
      const effBtn = card.querySelector('.loom-efficiency-btn') as HTMLButtonElement | null;
      if (effBtn) {
        const inputTierId = getLoomInputTierId(def.tierId);
        if (!inputTierId) {
          effBtn.style.display = 'none';
        } else {
          effBtn.style.display = '';
          const effLevel = loom!.conversionEfficiencyLevel ?? 0;
          if (effLevel >= MAX_LOOM_EFFICIENCY_LEVEL) {
            effBtn.textContent = '✦ Efficiency MAX';
            effBtn.disabled = true;
          } else {
            const effCost = getLoomEfficiencyUpgradeCost(def.tierId, effLevel);
            const inputTier = TIER_BY_ID.get(inputTierId);
            const inputBalance = getMotes(state.resources, inputTierId);
            effBtn.textContent = `⚗ Efficiency +1 — ${formatNumberAs(effCost, numberFormat)} ${inputTier?.displayName ?? ''}`;
            effBtn.disabled = inputBalance < effCost;
          }
        }
      }
    }

    // Special upgrade cards
    const unlockedCount = state.progression.unlockedTierCount;

    for (const def of SPECIAL_LOOM_DEFINITIONS) {
      const card = specialCards.get(def.tierId);
      const btn = specialButtons.get(def.tierId);
      if (!card || !btn) continue;

      const tier = TIER_BY_ID.get(def.tierId);
      const loom = getLoom(state.looms, def.tierId);
      const isUnlocked = loom?.isUnlocked ?? false;
      const tierOrderOk = tier ? tier.unlockOrder < unlockedCount : false;

      card.style.display = isUnlocked && tierOrderOk ? '' : 'none';
      if (!isUnlocked || !tierOrderOk) continue;

      const purchased = isSpecialLoomPurchased(state.looms, def.tierId);
      const currentMotes = getMotes(state.resources, def.tierId);
      const canAfford = currentMotes >= def.cost;

      const statsEl = card.querySelector('.loom-stats');
      if (statsEl) {
        statsEl.innerHTML = `
          <span class="loom-stat">${formatNumberAs(currentMotes, numberFormat)} / ${formatNumberAs(def.cost, numberFormat)} ${tier?.displayName ?? ''}</span>
        `;
      }

      if (purchased) {
        btn.textContent = '✦ Purchased';
        btn.disabled = true;
      } else {
        btn.textContent = `✦ Purchase — ${formatNumberAs(def.cost, numberFormat)} ${tier?.displayName ?? ''}`;
        btn.disabled = !canAfford;
      }
    }
  }

  return { element: pane, update };
}
