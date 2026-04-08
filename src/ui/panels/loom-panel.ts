import type { GameState } from '../../sim';
import type { ActionHandler } from '../../input';
import { TIER_BY_ID } from '../../data/tiers';
import { LOOM_DEFINITIONS } from '../../data/looms';
import { getLoom, getLoomRate, getLoomCost } from '../../sim/looms';
import { getMotes } from '../../sim/resources';
import { formatNumber } from '../../util';
import { getGeneratorSpritePath } from '../../render/assets/asset-paths';
import { loadImage } from '../../render/assets/asset-loader';
import { createTintedCanvas } from '../../render/assets/sprite-tint';

/**
 * Looms panel — shows passive production Looms for each unlocked tier.
 * Each Loom card displays: tier name, production rate, level, upgrade cost.
 */
export interface LoomPanel {
  element: HTMLElement;
  update(state: GameState): void;
}

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
export function createLoomPanel(dispatch: ActionHandler): LoomPanel {
  const panel = document.createElement('div');
  panel.className = 'panel loom-panel';

  const title = document.createElement('h3');
  title.className = 'panel-title';
  title.textContent = 'Looms';
  panel.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'panel-subtitle';
  subtitle.textContent = 'Passive mote production';
  panel.appendChild(subtitle);

  // Create a card for each Loom
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

    // Use a small canvas showing the tinted generator sprite
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

    panel.appendChild(card);
    cards.set(def.tierId, card);
    upgradeButtons.set(def.tierId, btn);
  }

  function update(state: GameState): void {
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

      // Update stats display
      const statsEl = card.querySelector('.loom-stats');
      if (statsEl) {
        statsEl.innerHTML = `
          <span class="loom-stat">Lv ${level}</span>
          <span class="loom-stat">${formatNumber(rate)}/s</span>
          <span class="loom-stat">${formatNumber(currentMotes)} motes</span>
        `;
      }

      // Update upgrade button
      const tier = TIER_BY_ID.get(def.tierId);
      if (cost !== null) {
        btn.textContent = `⬆ Upgrade — ${formatNumber(cost)} ${tier?.displayName ?? ''}`;
        btn.disabled = !canAfford;
      } else {
        btn.textContent = '⬆ MAX';
        btn.disabled = true;
      }
    }
  }

  return { element: panel, update };
}
