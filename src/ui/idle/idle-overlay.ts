/**
 * idle-overlay.ts — DOM overlay shown when the player returns after being idle.
 *
 * Displays:
 *  - total time away
 *  - Equivalence gained (always shown)
 *  - Per-tier Motes earned (hidden if that tier's Loom is not unlocked)
 *
 * Numbers animate from 0 → target over ~600 ms using requestAnimationFrame.
 * Tap/click anywhere on the overlay to dismiss it.
 */

import type { IdleRewardSummary } from '../../sim/idle/idle-reward';
import { formatNumber } from '../../util';

// ─── Types ────────────────────────────────────────────────────────

export interface IdleOverlay {
  element: HTMLElement;
  show(summary: IdleRewardSummary): void;
  hide(): void;
}

// ─── Constants ────────────────────────────────────────────────────

const ANIMATE_DURATION_MS = 600;

// ─── Factory ──────────────────────────────────────────────────────

export function createIdleOverlay(): IdleOverlay {
  // ── Backdrop ──
  const overlay = document.createElement('div');
  overlay.className = 'idle-overlay';
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Idle rewards');

  // ── Card ──
  const card = document.createElement('div');
  card.className = 'idle-overlay__card';

  // ── Heading ──
  const heading = document.createElement('div');
  heading.className = 'idle-overlay__heading';

  const title = document.createElement('div');
  title.className = 'idle-overlay__title';
  title.textContent = 'While you were away…';

  const durationEl = document.createElement('div');
  durationEl.className = 'idle-overlay__duration';

  heading.appendChild(title);
  heading.appendChild(durationEl);

  // ── Divider ──
  const divider1 = document.createElement('hr');
  divider1.className = 'idle-overlay__divider';

  // ── Row container ──
  const rows = document.createElement('div');
  rows.className = 'idle-overlay__rows';

  // ── Equivalence row ──
  const equivRow = document.createElement('div');
  equivRow.className = 'idle-overlay__row idle-overlay__row--equivalence';

  const equivIcon = document.createElement('span');
  equivIcon.textContent = '≡';
  equivIcon.style.cssText = 'color:var(--accent);font-size:16px;font-weight:700;flex-shrink:0;';

  const equivName = document.createElement('span');
  equivName.className = 'idle-overlay__row-name';
  equivName.textContent = 'Equivalence';

  const equivTotal = document.createElement('span');
  equivTotal.className = 'idle-overlay__row-total';

  equivRow.appendChild(equivIcon);
  equivRow.appendChild(equivName);
  equivRow.appendChild(equivTotal);

  // ── Divider 2 ──
  const divider2 = document.createElement('hr');
  divider2.className = 'idle-overlay__divider';

  // ── Tier rows (one per tier, hidden if locked) ──
  const tierTotalEls: HTMLElement[] = [];

  // We create rows dynamically from the summary on show()
  // but we need a container ready.
  const tierRowsContainer = document.createElement('div');
  tierRowsContainer.className = 'idle-overlay__rows';

  // ── Dismiss hint ──
  const dismissEl = document.createElement('div');
  dismissEl.className = 'idle-overlay__dismiss';
  dismissEl.textContent = 'Tap to continue';

  // ── Assemble ──
  rows.appendChild(equivRow);

  card.appendChild(heading);
  card.appendChild(divider1);
  card.appendChild(rows);
  card.appendChild(divider2);
  card.appendChild(tierRowsContainer);
  card.appendChild(dismissEl);
  overlay.appendChild(card);

  // ── Animation state ──
  let animationId = 0;

  // ── Dismiss on tap/click ──
  overlay.addEventListener('pointerdown', () => {
    hide();
  });

  // ── show ──
  function show(summary: IdleRewardSummary): void {
    // Duration text
    const mins = Math.round(summary.minutesAway);
    durationEl.textContent = mins === 1 ? '1 minute' : `${mins} minutes`;

    // Build / rebuild tier rows
    tierRowsContainer.innerHTML = '';
    tierTotalEls.length = 0;

    for (const reward of summary.tierRewards) {
      const row = document.createElement('div');
      row.className = 'idle-overlay__row';
      row.style.borderLeftColor = reward.color;

      if (!reward.isUnlocked) {
        row.hidden = true;
        row.setAttribute('aria-hidden', 'true');
      }

      const dot = document.createElement('span');
      dot.className = 'idle-overlay__tier-dot';
      dot.style.background = reward.color;

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

    // Reset animated values to 0
    equivTotal.textContent = '+0';
    for (const el of tierTotalEls) el.textContent = '0';

    // Show overlay
    overlay.classList.add('idle-overlay--visible');

    // Animate numbers
    cancelAnimationFrame(animationId);
    const startTime = performance.now();

    function step(now: number): void {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / ANIMATE_DURATION_MS, 1);
      // ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3);

      const currentEquiv = summary.equivalenceGained * ease;
      equivTotal.textContent = '+' + formatNumber(currentEquiv);

      for (let i = 0; i < summary.tierRewards.length; i++) {
        const reward = summary.tierRewards[i];
        if (!reward.isUnlocked) continue;
        const el = tierTotalEls[i];
        if (el) {
          el.textContent = formatNumber(reward.totalMotes * ease);
        }
      }

      if (t < 1) {
        animationId = requestAnimationFrame(step);
      } else {
        // Snap to final values
        equivTotal.textContent = '+' + formatNumber(summary.equivalenceGained);
        for (let i = 0; i < summary.tierRewards.length; i++) {
          const reward = summary.tierRewards[i];
          if (!reward.isUnlocked) continue;
          const el = tierTotalEls[i];
          if (el) el.textContent = formatNumber(reward.totalMotes);
        }
      }
    }

    animationId = requestAnimationFrame(step);
  }

  // ── hide ──
  function hide(): void {
    cancelAnimationFrame(animationId);
    overlay.classList.remove('idle-overlay--visible');
  }

  return { element: overlay, show, hide };
}
