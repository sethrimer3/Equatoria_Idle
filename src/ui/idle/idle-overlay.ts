/**
 * DOM overlay shown when the player returns after being idle.
 *
 * Equivalence is intentionally not shown. Reward calculation and application
 * remain unchanged; the overlay presents time away and unlocked mote rewards.
 */

import type { IdleRewardSummary } from '../../sim/idle/idle-reward';
import { formatNumber } from '../../util';
import { getMoteIconPath } from '../../render/assets/asset-paths';

export interface IdleOverlay {
  element: HTMLElement;
  show(summary: IdleRewardSummary): void;
  hide(): void;
  dispose(): void;
}

const ANIMATE_DURATION_MS = 600;

export function createIdleOverlay(): IdleOverlay {
  const overlay = document.createElement('div');
  overlay.className = 'idle-overlay';
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Idle rewards');

  const card = document.createElement('div');
  card.className = 'idle-overlay__card';

  const heading = document.createElement('div');
  heading.className = 'idle-overlay__heading';

  const title = document.createElement('div');
  title.className = 'idle-overlay__title';
  title.textContent = 'While you were away…';

  const durationEl = document.createElement('div');
  durationEl.className = 'idle-overlay__duration';
  heading.appendChild(title);
  heading.appendChild(durationEl);

  const divider = document.createElement('hr');
  divider.className = 'idle-overlay__divider';

  const tierRowsContainer = document.createElement('div');
  tierRowsContainer.className = 'idle-overlay__rows';

  const dismissEl = document.createElement('div');
  dismissEl.className = 'idle-overlay__dismiss';
  dismissEl.textContent = 'Tap to continue';

  card.appendChild(heading);
  card.appendChild(divider);
  card.appendChild(tierRowsContainer);
  card.appendChild(dismissEl);
  overlay.appendChild(card);

  const tierTotalEls: HTMLElement[] = [];
  let visibleTierRewards: IdleRewardSummary['tierRewards'] = [];
  let animationId = 0;

  function onPointerDown(): void {
    hide();
  }
  overlay.addEventListener('pointerdown', onPointerDown);

  function show(summary: IdleRewardSummary): void {
    const mins = Math.round(summary.minutesAway);
    durationEl.textContent = mins === 1 ? '1 minute' : `${mins} minutes`;

    tierRowsContainer.innerHTML = '';
    tierTotalEls.length = 0;
    visibleTierRewards = summary.tierRewards.filter(reward => reward.isUnlocked);

    for (const reward of visibleTierRewards) {
      const row = document.createElement('div');
      row.className = 'idle-overlay__row';
      row.style.borderLeftColor = reward.color;

      const dot = document.createElement('img');
      dot.className = 'idle-overlay__tier-dot';
      dot.src = getMoteIconPath(reward.tierId);
      dot.alt = reward.displayName;

      const name = document.createElement('span');
      name.className = 'idle-overlay__row-name';
      name.textContent = reward.displayName;

      const formula = document.createElement('span');
      formula.className = 'idle-overlay__row-formula';
      formula.textContent = `×${formatNumber(reward.ratePerMinute)}/min`;

      const total = document.createElement('span');
      total.className = 'idle-overlay__row-total';
      total.style.color = reward.color;
      total.textContent = '0';

      row.appendChild(dot);
      row.appendChild(name);
      row.appendChild(formula);
      row.appendChild(total);
      tierRowsContainer.appendChild(row);
      tierTotalEls.push(total);
    }

    overlay.classList.add('idle-overlay--visible');
    cancelAnimationFrame(animationId);
    const startTime = performance.now();

    function step(now: number): void {
      const t = Math.min((now - startTime) / ANIMATE_DURATION_MS, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      for (let i = 0; i < visibleTierRewards.length; i++) {
        const el = tierTotalEls[i];
        if (el) el.textContent = formatNumber(visibleTierRewards[i].totalMotes * ease);
      }
      if (t < 1) {
        animationId = requestAnimationFrame(step);
      } else {
        for (let i = 0; i < visibleTierRewards.length; i++) {
          const el = tierTotalEls[i];
          if (el) el.textContent = formatNumber(visibleTierRewards[i].totalMotes);
        }
      }
    }

    animationId = requestAnimationFrame(step);
  }

  function hide(): void {
    cancelAnimationFrame(animationId);
    overlay.classList.remove('idle-overlay--visible');
  }

  function dispose(): void {
    hide();
    overlay.removeEventListener('pointerdown', onPointerDown);
  }

  return { element: overlay, show, hide, dispose };
}
