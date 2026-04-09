import type { GameState } from '../../sim';
import type { ActionHandler } from '../../input';
import { TIER_BY_ID, TIERS } from '../../data/tiers';
import { tierUnlockCost } from '../../data/balance';
import { getMotes } from '../../sim/resources';
import { formatNumber } from '../../util';

/**
 * Upgrade panel — now shows only tier unlock progression.
 * Equation upgrades have moved to the Equation tab.
 * Forge unlock has moved to the Equation tab.
 */
export interface UpgradePanel {
  element: HTMLElement;
  update(state: GameState, isDevMode?: boolean): void;
}

export function createUpgradePanel(dispatch: ActionHandler): UpgradePanel {
  const panel = document.createElement('div');
  panel.className = 'panel upgrade-panel';

  const title = document.createElement('h3');
  title.className = 'panel-title';
  title.textContent = 'Tier Progression';
  panel.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'panel-subtitle';
  subtitle.textContent = 'Unlock new gemstone tiers to expand the equation';
  panel.appendChild(subtitle);

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

  function update(state: GameState, isDevMode = false): void {
    // Update unlock button
    const nextIndex = state.progression.unlockedTierCount;
    if (nextIndex < TIERS.length && !TIERS[nextIndex].isSecret) {
      const nextTier = TIERS[nextIndex];
      const cost = tierUnlockCost(nextIndex);
      const payTierId = TIERS[nextIndex - 1]?.id ?? 'sand';
      const canAfford = isDevMode || getMotes(state.resources, payTierId) >= cost;
      unlockBtn.textContent = `🔓 Unlock ${nextTier.displayName} — ${formatNumber(cost)} ${TIER_BY_ID.get(payTierId)?.displayName ?? ''} motes`;
      unlockBtn.disabled = !canAfford;
      unlockBtn.style.borderColor = nextTier.color;
      unlockSection.style.display = '';
    } else {
      unlockSection.style.display = 'none';
    }
  }

  return { element: panel, update };
}
