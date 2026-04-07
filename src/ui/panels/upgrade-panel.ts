import type { GameState } from '../../sim';
import type { ActionHandler } from '../../input';
import { ALL_UPGRADES } from '../../data/upgrades';
import { TIER_BY_ID, TIERS, type TierId } from '../../data/tiers';
import { tierUnlockCost } from '../../data/balance';
import { getUpgradeLevel, getUpgradeCost } from '../../sim/progression';
import { getMotes } from '../../sim/resources';
import { formatNumber } from '../../util';
import { getGemIconPath } from '../../render/assets/asset-paths';

/**
 * Upgrade panel — DOM-based panel listing available upgrades.
 */
export interface UpgradePanel {
  element: HTMLElement;
  update(state: GameState): void;
}

export function createUpgradePanel(dispatch: ActionHandler): UpgradePanel {
  const panel = document.createElement('div');
  panel.className = 'panel upgrade-panel';

  const title = document.createElement('h3');
  title.className = 'panel-title';
  title.textContent = 'Upgrades';
  panel.appendChild(title);

  // Tier unlock button
  const unlockSection = document.createElement('div');
  unlockSection.className = 'upgrade-section';
  const unlockBtn = document.createElement('button');
  unlockBtn.className = 'upgrade-btn unlock-btn';
  unlockBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    dispatch({ kind: 'unlock_next_tier' });
  });
  unlockSection.appendChild(unlockBtn);
  panel.appendChild(unlockSection);

  // Upgrade buttons
  const upgradeButtons: Map<string, HTMLButtonElement> = new Map();

  for (const def of ALL_UPGRADES) {
    const btn = document.createElement('button');
    btn.className = 'upgrade-btn';
    btn.dataset['upgradeId'] = def.id;
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      dispatch({ kind: 'purchase_upgrade', upgradeId: def.id });
    });
    panel.appendChild(btn);
    upgradeButtons.set(def.id, btn);
  }

  function update(state: GameState): void {
    // Update unlock button
    const nextIndex = state.progression.unlockedTierCount;
    if (nextIndex < TIERS.length && !TIERS[nextIndex].isSecret) {
      const nextTier = TIERS[nextIndex];
      const cost = tierUnlockCost(nextIndex);
      const payTierId = TIERS[nextIndex - 1]?.id ?? 'sand';
      const canAfford = getMotes(state.resources, payTierId) >= cost;
      unlockBtn.textContent = `🔓 Unlock ${nextTier.displayName} — ${formatNumber(cost)} ${TIER_BY_ID.get(payTierId)?.displayName ?? ''} motes`;
      unlockBtn.disabled = !canAfford;
      unlockBtn.style.borderColor = nextTier.color;
      unlockSection.style.display = '';
    } else {
      unlockSection.style.display = 'none';
    }

    // Update upgrade buttons
    for (const def of ALL_UPGRADES) {
      const btn = upgradeButtons.get(def.id)!;
      const level = getUpgradeLevel(state.progression, def.id);
      const cost = getUpgradeCost(state.progression, def.id);
      const isMaxed = cost === null;

      // Determine which tier's motes to check affordability
      const costTierId: TierId = def.tierId ?? 'sand';
      const canAfford = cost !== null && getMotes(state.resources, costTierId) >= cost;

      // Check if upgrade is visible (tier must be unlocked for tier upgrades)
      const isVisible = def.tierId === null ||
        state.equation.segments.some(s => s.tierId === def.tierId && s.isUnlocked);
      btn.style.display = isVisible ? '' : 'none';

      const tierColor = def.tierId ? TIER_BY_ID.get(def.tierId)?.color ?? '#888' : '#ecf0f1';
      btn.style.borderColor = tierColor;

      // Build button content with gem icon
      const iconSrc = def.tierId ? getGemIconPath(def.tierId) : '';
      const iconHtml = def.tierId
        ? `<img class="gem-icon" src="${iconSrc}" alt="" />`
        : '';

      if (isMaxed) {
        btn.innerHTML = `${iconHtml}<span class="upgrade-text">${def.icon} ${def.displayName} — MAX (Lv ${level})</span>`;
        btn.disabled = true;
      } else {
        btn.innerHTML = `${iconHtml}<span class="upgrade-text">${def.icon} ${def.displayName} Lv ${level} — ${formatNumber(cost!)} motes</span>`;
        btn.disabled = !canAfford;
      }
    }
  }

  return { element: panel, update };
}
