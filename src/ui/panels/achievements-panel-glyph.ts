/**
 * achievements-panel-glyph.ts — Per-character scrambled glyph animation for
 * secret / hidden-criteria achievement cards.
 *
 * Manages a list of GlyphEntry objects (one per animated text element) and
 * drives a requestAnimationFrame loop that mutates one random character per
 * entry each few frames, creating a "random alien text" effect.
 *
 * Extracted from achievements-panel.ts to keep that module focused on state
 * management and the main update loop.
 *
 * Usage:
 *   const glyph = createGlyphSystem({ getCardRefs, getFilterShowHidden });
 *   glyph.rebuildGlyphEntries();   // call after filter/unlock state changes
 *   glyph.startGlyphAnimation();   // idempotent — safe to call multiple times
 *   glyph.stopGlyphAnimation();    // call on destroy()
 */

import { ACHIEVEMENT_DEFINITIONS } from '../../data/achievements';
import { randomGlyphChar } from './achievements-panel-dom';
import type { CardRefs } from './achievements-panel-dom';

// ── Types ─────────────────────────────────────────────────────────

interface GlyphEntry {
  /** Element whose textContent is updated with scrambled text. */
  el: HTMLElement;
  /** Length of the original text (number of characters to scramble). */
  len: number;
  /** Current scrambled characters, one per position. */
  chars: string[];
  /** Frames until next character mutation. Randomised per-entry for variety. */
  frameCountdown: number;
}

// ── Context injected by the panel ─────────────────────────────────

export interface GlyphSystemDeps {
  getCardRefs(): Map<string, CardRefs>;
  getFilterShowHidden(): boolean;
}

// ── Handle returned to callers ────────────────────────────────────

export interface GlyphSystemHandle {
  rebuildGlyphEntries(): void;
  startGlyphAnimation(): void;
  stopGlyphAnimation(): void;
}

// ── Factory ───────────────────────────────────────────────────────

export function createGlyphSystem(deps: GlyphSystemDeps): GlyphSystemHandle {
  const glyphEntries: GlyphEntry[] = [];
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let glyphRafId: number | null = null;
  let glyphAnimating = false;

  function buildGlyphEntry(element: HTMLElement, length: number): GlyphEntry {
    const chars = Array.from({ length }, () => randomGlyphChar());
    element.textContent = chars.join('');
    const frameCountdown = 1 + Math.floor(Math.random() * 5);
    return { el: element, len: length, chars, frameCountdown };
  }

  function cardIsVisible(refs: CardRefs): boolean {
    return refs.card.style.display !== 'none';
  }

  function rebuildGlyphEntries(): void {
    glyphEntries.length = 0;
    if (!deps.getFilterShowHidden()) return;
    const cardRefs = deps.getCardRefs();
    for (const def of ACHIEVEMENT_DEFINITIONS) {
      if (!def.isSecret && !def.isHiddenCriteria) continue;
      const refs = cardRefs.get(def.id);
      if (!refs) continue;
      if (!cardIsVisible(refs)) continue;
      const isUnlocked = refs.card.classList.contains('achievement-unlocked') ||
                         refs.card.classList.contains('achievement-earned-unclaimed');
      if (isUnlocked) continue;
      if (def.isSecret) {
        glyphEntries.push(buildGlyphEntry(refs.nameEl, def.displayName.length));
        glyphEntries.push(buildGlyphEntry(refs.descEl, def.description.length));
      }
      if (def.isHiddenCriteria) {
        glyphEntries.push(buildGlyphEntry(refs.progressEl, 12));
      }
    }
    startGlyphAnimation();
  }

  function glyphFrame(): void {
    if (glyphEntries.length === 0) {
      glyphAnimating = false;
      glyphRafId = null;
      return;
    }
    const skipProbability = prefersReducedMotion ? 0.98 : 0;
    for (const entry of glyphEntries) {
      if (prefersReducedMotion && Math.random() < skipProbability) continue;
      entry.frameCountdown--;
      if (entry.frameCountdown <= 0) {
        const idx = Math.floor(Math.random() * entry.len);
        entry.chars[idx] = randomGlyphChar();
        entry.el.textContent = entry.chars.join('');
        entry.frameCountdown = 1 + Math.floor(Math.random() * 5);
      }
    }
    glyphRafId = requestAnimationFrame(glyphFrame);
  }

  function startGlyphAnimation(): void {
    if (glyphAnimating || glyphEntries.length === 0) return;
    glyphAnimating = true;
    glyphRafId = requestAnimationFrame(glyphFrame);
  }

  function stopGlyphAnimation(): void {
    if (glyphRafId !== null) cancelAnimationFrame(glyphRafId);
    glyphRafId = null;
    glyphAnimating = false;
  }

  return { rebuildGlyphEntries, startGlyphAnimation, stopGlyphAnimation };
}
