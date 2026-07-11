/**
 * render-resolution-policy.ts — Authoritative render-resolution policy.
 *
 * ── Problem this solves ──────────────────────────────────────────────────────
 * Both the RPG renderer and the Equation/Idle "crisp" canvas historically sized
 * their backing store to `cssWidth * devicePixelRatio × cssHeight *
 * devicePixelRatio`.  On a high-DPI 4K display (e.g. a fitted 1215×2160 CSS
 * area at DPR 2) that produces a 2430×4320 = 10.5-megapixel backing store that
 * the game re-rasterizes every frame — Canvas 2D paths, gradients, shadowBlur,
 * alpha blending, terrain and particles all scale with the *physical* pixel
 * count, so cost grows roughly with `devicePixelRatio²` and with monitor
 * resolution, even though the RPG logical world stays a fixed 360×640.
 *
 * ── What this module does ────────────────────────────────────────────────────
 * It decouples the render (backing-store) resolution from the monitor's full
 * physical pixel resolution by computing a *capped* effective device-pixel
 * ratio from a pixel budget.  The browser then scales the smaller backing store
 * up to the CSS display size (smoothly for reduced-resolution modes), so the
 * world stays the same size, visibility is unchanged, and input math — which
 * lives entirely in CSS space — is untouched.
 *
 * This is a PURE, DETERMINISTIC function: it never reads `window`,
 * `devicePixelRatio`, `Date`, or any other global.  Callers pass the native
 * device-pixel ratio in explicitly.  This makes it trivially testable and keeps
 * a single source of truth reusable by the RPG canvas, the Equation/Idle world
 * canvas, and overlay canvases.
 */

/** User-facing render-resolution quality tiers. */
export type RenderResolutionQuality = 'auto' | 'high' | 'balanced' | 'performance';

export interface RenderResolutionPolicyInput {
  /** CSS (display) width of the canvas in logical pixels. */
  cssWidth: number;
  /** CSS (display) height of the canvas in logical pixels. */
  cssHeight: number;
  /** The browser's real `window.devicePixelRatio` (>0, may be fractional). */
  nativeDevicePixelRatio: number;
  /** Selected quality tier. */
  quality: RenderResolutionQuality;
  /**
   * Optional explicit backing pixel-count budget (physical pixels).  When
   * omitted, the budget for `quality` is used.  Overlay canvases pass a larger
   * budget than the world canvas.
   */
  maxPixelBudget?: number;
}

export interface RenderResolutionPolicyResult {
  /** Backing-store width in physical pixels (≥1, integer). */
  backingWidth: number;
  /** Backing-store height in physical pixels (≥1, integer). */
  backingHeight: number;
  /** The native device-pixel ratio, echoed back (sanitized). */
  nativeDevicePixelRatio: number;
  /**
   * The *effective* device-pixel ratio actually used for the backing store.
   * `effectiveDevicePixelRatio ≤ nativeDevicePixelRatio`.  Draw transforms must
   * use THIS value, never the native DPR.
   */
  effectiveDevicePixelRatio: number;
  /** `effectiveDevicePixelRatio / nativeDevicePixelRatio`, in (0, 1]. */
  resolutionScale: number;
  /** Physical pixel count of the resulting backing store (`backingW*backingH`). */
  physicalPixelCount: number;
  /** True when the pixel budget forced a reduction below native resolution. */
  wasCapped: boolean;
}

// ── Pixel budgets (physical backing pixels) ─────────────────────────────────
// Starting values chosen so that on a reference 360×640 phone (≈230k px at
// DPR 1, ≈920k at DPR 2) nothing is capped in High/Auto/Balanced, while a
// fullscreen 4K RPG area (a fitted ~1215×2160 = 2.6MP CSS area, 10.5MP at
// DPR 2) is pulled down to roughly:
//   High        → 3.0MP  (≈ effective DPR 1.07 on the 4K area)
//   Auto/Bal    → 1.5MP  (≈ effective DPR 0.76)
//   Performance → 0.75MP (≈ effective DPR 0.54)
// The RPG logical world is only 360×640, so even 0.75MP is a large oversample
// of the world and preserves smoothness while cutting per-frame raster cost by
// several ×.  Tune here — see docs/render-resolution-performance.md.
export const AUTO_MAX_BACKING_PIXELS = 1_500_000;
export const HIGH_MAX_BACKING_PIXELS = 3_000_000;
export const BALANCED_MAX_BACKING_PIXELS = 1_500_000;
export const PERFORMANCE_MAX_BACKING_PIXELS = 750_000;

/**
 * A larger budget for overlay/HUD canvases, where crisp text matters more than
 * per-frame fill cost (overlays are usually cleared+redrawn only when active).
 */
export const OVERLAY_MAX_BACKING_PIXELS = 4_000_000;

/**
 * Absolute clamp on either backing dimension.  Guards against pathological
 * inputs (e.g. a 1×100000 canvas) where the area budget alone would still allow
 * one axis to explode.  4096 comfortably exceeds any real display axis after
 * capping and is a safe Canvas 2D / WebGL texture size.
 */
const MAX_BACKING_DIMENSION = 4096;

/**
 * Floor on the effective DPR so reduced-resolution modes never dip into an
 * unreadable mush.  0.5 keeps at least half-resolution per axis (quarter the
 * pixels) relative to CSS size.
 */
const MIN_EFFECTIVE_DPR = 0.5;

/** Returns the default backing pixel budget for a quality tier. */
export function pixelBudgetForQuality(quality: RenderResolutionQuality): number {
  switch (quality) {
    case 'high':        return HIGH_MAX_BACKING_PIXELS;
    case 'balanced':    return BALANCED_MAX_BACKING_PIXELS;
    case 'performance': return PERFORMANCE_MAX_BACKING_PIXELS;
    case 'auto':
    default:            return AUTO_MAX_BACKING_PIXELS;
  }
}

/** Clamps a value to a finite positive number, falling back to `fallback`. */
function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Computes the capped backing-store dimensions and effective device-pixel ratio
 * for a canvas.  Pure and deterministic — no browser globals are read.
 *
 * Aspect ratio is always preserved because both axes are scaled by the same
 * `effectiveDevicePixelRatio`.
 */
export function computeRenderResolution(
  input: RenderResolutionPolicyInput,
): RenderResolutionPolicyResult {
  // ── Sanitize inputs ──────────────────────────────────────────────────────
  // Never allow zero/negative/NaN through; degenerate sizes fall back to 1px so
  // we never produce a zero-sized (and thus unusable) canvas.
  const cssW = Math.max(1, finitePositive(input.cssWidth, 1));
  const cssH = Math.max(1, finitePositive(input.cssHeight, 1));
  // DPR is clamped to a sane [0.5, 4] window; browsers report 1–3 in practice.
  const nativeDpr = Math.min(4, Math.max(0.5, finitePositive(input.nativeDevicePixelRatio, 1)));
  const budget = Math.max(1, finitePositive(input.maxPixelBudget ?? pixelBudgetForQuality(input.quality), pixelBudgetForQuality('auto')));

  // ── Budget scale (fraction of native resolution) ─────────────────────────
  // nativePixels = the full-native backing pixel count we would have produced.
  const nativePixels = cssW * nativeDpr * cssH * nativeDpr;
  // How much we must shrink each axis so the area fits the budget.
  const budgetScale = Math.sqrt(budget / nativePixels);

  // We keep native resolution (scale 1) unless the budget forces a reduction.
  let finalScale = Math.min(1, budgetScale);

  // Effective DPR, floored so we never go below MIN_EFFECTIVE_DPR (but never
  // above native — a small canvas already under budget stays at native).
  let effectiveDpr = nativeDpr * finalScale;
  effectiveDpr = Math.min(nativeDpr, Math.max(MIN_EFFECTIVE_DPR, effectiveDpr));

  // ── Backing dimensions ───────────────────────────────────────────────────
  let backingWidth  = Math.max(1, Math.round(cssW * effectiveDpr));
  let backingHeight = Math.max(1, Math.round(cssH * effectiveDpr));

  // Absolute per-axis clamp for pathological aspect ratios.  Reducing one axis
  // to the cap and rescaling the other preserves aspect ratio.
  const maxDim = Math.max(backingWidth, backingHeight);
  if (maxDim > MAX_BACKING_DIMENSION) {
    const clampScale = MAX_BACKING_DIMENSION / maxDim;
    backingWidth  = Math.max(1, Math.round(backingWidth  * clampScale));
    backingHeight = Math.max(1, Math.round(backingHeight * clampScale));
    effectiveDpr  = effectiveDpr * clampScale;
    finalScale    = finalScale * clampScale;
  }

  const resolutionScale = effectiveDpr / nativeDpr;
  const wasCapped = effectiveDpr < nativeDpr - 1e-6;

  return {
    backingWidth,
    backingHeight,
    nativeDevicePixelRatio: nativeDpr,
    effectiveDevicePixelRatio: effectiveDpr,
    resolutionScale,
    physicalPixelCount: backingWidth * backingHeight,
    wasCapped,
  };
}

/**
 * Reads the current native device-pixel ratio from the browser.  Isolated here
 * so the pure `computeRenderResolution` never touches globals; callers combine
 * the two.  Returns 1 in non-DOM contexts.
 */
export function readNativeDevicePixelRatio(): number {
  if (typeof window === 'undefined') return 1;
  return window.devicePixelRatio || 1;
}
