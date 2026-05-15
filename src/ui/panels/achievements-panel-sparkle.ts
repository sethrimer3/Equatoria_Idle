/**
 * achievements-panel-sparkle.ts — Sparkle emitter system for achievement cards.
 *
 * Manages the per-card sparkle particle animation: creating, scheduling,
 * and cleaning up CSS-animated sparkle elements on earned-unclaimed cards.
 *
 * Extracted from achievements-panel.ts to keep that module focused on
 * state management and the main update loop.
 *
 * Usage:
 *   const sparkle = createSparkleSystem();
 *   sparkle.setSparkleEmitter(cardEl, true);   // start sparkles on this card
 *   sparkle.stopAllSparkles();                  // clean up all emitters
 */

import {
  INITIAL_SPARKLE_DELAY_MS,
  type SparkleEmitter,
  SPARKLE_DRIFT_X_RANGE,
  SPARKLE_DRIFT_Y_RANGE,
  SPARKLE_MAX_DELAY_MS,
  SPARKLE_MAX_DURATION_MS,
  SPARKLE_MIN_DELAY_MS,
  SPARKLE_MIN_DURATION_MS,
  SPARKLE_SCALE_MAX,
  SPARKLE_SCALE_MIN,
  SPARKLE_SIZE,
  SPARKLE_VERTICAL_BIAS_Y,
  randomInRange,
} from '../achievements/sparkle-shared';

// ── Handle returned to callers ────────────────────────────────────

export interface SparkleSystemHandle {
  setSparkleEmitter(host: HTMLElement, enabled: boolean): void;
  stopAllSparkles(): void;
}

// ── Factory ───────────────────────────────────────────────────────

export function createSparkleSystem(): SparkleSystemHandle {
  const sparkleEmitters: Map<HTMLElement, SparkleEmitter> = new Map();

  function createSparkle(host: HTMLElement): void {
    const sparkle = document.createElement('span');
    sparkle.className = 'achievement-sparkle';
    sparkle.style.width = `${SPARKLE_SIZE}px`;
    sparkle.style.height = `${SPARKLE_SIZE}px`;
    sparkle.style.left = `${Math.random() * 100}%`;
    sparkle.style.top = `${Math.random() * 100}%`;
    const driftX = randomInRange(-SPARKLE_DRIFT_X_RANGE / 2, SPARKLE_DRIFT_X_RANGE / 2);
    const driftY = randomInRange(-SPARKLE_DRIFT_Y_RANGE / 2, SPARKLE_DRIFT_Y_RANGE / 2) + SPARKLE_VERTICAL_BIAS_Y;
    const scale = randomInRange(SPARKLE_SCALE_MIN, SPARKLE_SCALE_MAX);
    const durationMs = randomInRange(SPARKLE_MIN_DURATION_MS, SPARKLE_MAX_DURATION_MS);
    sparkle.style.setProperty('--sparkle-dx', `${driftX.toFixed(2)}px`);
    sparkle.style.setProperty('--sparkle-dy', `${driftY.toFixed(2)}px`);
    sparkle.style.setProperty('--sparkle-scale', scale.toFixed(3));
    sparkle.style.setProperty('--sparkle-duration', `${durationMs.toFixed(0)}ms`);
    sparkle.addEventListener('animationend', () => sparkle.remove(), { once: true });
    host.appendChild(sparkle);
  }

  function scheduleSparkles(host: HTMLElement): void {
    const emitter = sparkleEmitters.get(host);
    if (!emitter) return;
    createSparkle(host);
    const delayMs = randomInRange(SPARKLE_MIN_DELAY_MS, SPARKLE_MAX_DELAY_MS);
    emitter.timeoutId = window.setTimeout(() => scheduleSparkles(host), delayMs);
  }

  function setSparkleEmitter(host: HTMLElement, enabled: boolean): void {
    const existing = sparkleEmitters.get(host);
    if (enabled) {
      if (existing) return;
      host.classList.add('achievement-sparkle-host');
      const timeoutId = window.setTimeout(() => scheduleSparkles(host), INITIAL_SPARKLE_DELAY_MS);
      sparkleEmitters.set(host, { timeoutId });
      return;
    }
    if (!existing) return;
    if (existing.timeoutId !== null) window.clearTimeout(existing.timeoutId);
    sparkleEmitters.delete(host);
    host.classList.remove('achievement-sparkle-host');
    for (const sparkle of host.querySelectorAll('.achievement-sparkle')) sparkle.remove();
  }

  function stopAllSparkles(): void {
    for (const host of sparkleEmitters.keys()) setSparkleEmitter(host, false);
  }

  return { setSparkleEmitter, stopAllSparkles };
}
