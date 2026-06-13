/**
 * LEGACY/HISTORY ONLY: intentionally no longer imported by runtime systems.
 * The visible equation display was retired; these display segments are
 * preserved only for historical/reference purposes.
 *
 * equation-segments.ts — Flat coloured text-segment builder for the pixel equation renderer.
 *
 * Mirrors the structure of `buildStructuredEquationHtml` but produces a plain array of
 * `{ text, color }` pairs instead of HTML.  Wrappers (Σ, Π, Γ, ∫, lim, ℱ, λ) are
 * represented in compact bracket notation so that the full equation fits on a single
 * low-resolution canvas row.
 *
 * Used exclusively by `pixel-equation-renderer.ts`.  The smooth DOM path continues to
 * use `buildStructuredEquationHtml` from `equation-view.ts` unchanged.
 */

import type { EquationTermView } from '../../render/legacy/equation-term-view-legacy';
import type { EquationRole } from '../../data/equation';

// ─── Types ───────────────────────────────────────────────────────

/** A single coloured piece of flat equation text. */
export interface EqSegment {
  text: string;
  color: string;
}

// ─── Helpers ─────────────────────────────────────────────────────

/** Muted colour used for structural punctuation and the f(t)= prefix. */
const DIM = 'rgba(200,200,200,0.55)';

/** Build an index of terms keyed by their equation role. */
function byRoleMap(terms: EquationTermView[]): Map<EquationRole, EquationTermView> {
  const m = new Map<EquationRole, EquationTermView>();
  for (const t of terms) m.set(t.operator, t);
  return m;
}

/** Wrap a mutable segment array with a prefix string and optional suffix. */
function wrapSegs(
  core: EqSegment[],
  prefix: string,
  prefixColor: string,
  suffix?: string,
): EqSegment[] {
  const out: EqSegment[] = [{ text: prefix, color: prefixColor }, ...core];
  if (suffix) out.push({ text: suffix, color: prefixColor });
  return out;
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Build a flat list of coloured text segments representing the given equation terms.
 *
 * Returns an empty array when `terms` is empty.
 * Returns a single "…" segment when the forge is unlocked but the core is blank.
 */
export function buildEquationSegments(terms: EquationTermView[]): EqSegment[] {
  if (terms.length === 0) return [];

  const byRole = byRoleMap(terms);

  // ── Prefix: f(t) = ───────────────────────────────────────────
  const prefixSegs: EqSegment[] = [];
  const qt = byRole.get('time_argument');
  if (qt) {
    prefixSegs.push(
      { text: 'f(', color: DIM },
      { text: qt.paramValue === 1 ? 't' : `${Math.floor(qt.paramValue)}t`, color: qt.color },
      { text: ') = ', color: DIM },
    );
  } else {
    prefixSegs.push({ text: 'f(t) = ', color: DIM });
  }

  // ── Core: Ruby base, Sunstone additive, Citrine ×, Emerald ^ ─
  let core: EqSegment[] = [];

  const ruby = byRole.get('base_value');
  if (ruby) core.push({ text: String(Math.floor(ruby.paramValue)), color: ruby.color });

  const sunstone = byRole.get('additive_slot');
  if (sunstone && core.length > 0) {
    core.push(
      { text: ' + ', color: sunstone.color },
      { text: String(Math.floor(sunstone.paramValue)), color: sunstone.color },
    );
  }

  const citrine = byRole.get('multiplier_slot');
  if (citrine && core.length > 0) {
    if (sunstone) {
      core = [{ text: '(', color: DIM }, ...core, { text: ')', color: DIM }];
    }
    core.push(
      { text: ' \u00d7 ', color: citrine.color },   // ×
      { text: String(Math.floor(citrine.paramValue)), color: citrine.color },
    );
  }

  const emerald = byRole.get('exponent_slot');
  if (emerald && core.length > 0) {
    if (citrine || sunstone) {
      core = [{ text: '(', color: DIM }, ...core, { text: ')', color: DIM }];
    }
    core.push({ text: `^${Math.floor(emerald.paramValue)}`, color: emerald.color });
  }

  if (core.length === 0) {
    // Forge unlocked but no displayable core yet
    return [...prefixSegs, { text: '\u2026', color: 'rgba(150,150,150,0.5)' }];
  }

  // ── Wrappers (innermost first, same order as buildStructuredEquationHtml) ──

  const sapphire = byRole.get('summation_wrap');
  if (sapphire) {
    const n = Math.floor(sapphire.paramValue);
    core = wrapSegs(core, `\u03a3[${n}](`, sapphire.color, ')');   // Σ
  }

  const iolite = byRole.get('product_wrap');
  if (iolite) {
    const n = Math.floor(iolite.paramValue);
    core = wrapSegs(core, `\u03a0[${n}](`, iolite.color, ')');     // Π
  }

  const amethyst = byRole.get('factorial_wrap');
  if (amethyst) {
    core = wrapSegs(core, '\u0393(', amethyst.color, ')!');         // Γ
  }

  const diamond = byRole.get('integral_wrap');
  if (diamond) {
    const v = Math.round(diamond.paramValue * 100) / 100;
    core = wrapSegs(core, `\u222b[${v}](`, diamond.color, ')dt');   // ∫
  }

  const nullstone = byRole.get('recursion_wrap');
  if (nullstone) {
    const v = Math.round(nullstone.paramValue * 100) / 100;
    core = wrapSegs(core, `lim[${v}](`, nullstone.color, ')');
  }

  const fracteryl = byRole.get('fracture_wrap');
  if (fracteryl) {
    const v = Math.round(fracteryl.paramValue * 100) / 100;
    core = wrapSegs(core, `\u2131[d=${v}](`, fracteryl.color, ')'); // ℱ
  }

  const eigenstein = byRole.get('spectral_wrap');
  if (eigenstein) {
    const v = Math.round(eigenstein.paramValue * 100) / 100;
    core = wrapSegs(core, `\u03bb[${v}](`, eigenstein.color, ')'); // λ
  }

  return [...prefixSegs, ...core];
}
