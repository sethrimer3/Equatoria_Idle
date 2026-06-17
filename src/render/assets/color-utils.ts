/**
 * Shared color parsing utilities for the render layer.
 *
 * Exports:
 *  - `colorWithAlpha(color, alpha)` — converts a hex or rgb() color string
 *    to an rgba() string, used for canvas strokeStyle / fillStyle.
 *  - `parseHexToRgb(color)` — parses a hex color to a cached [r,g,b] tuple,
 *    used for direct canvas pixel manipulation (putImageData, etc.).
 */

// ─── colorWithAlpha ──────────────────────────────────────────────

/** Matches a hex color like #RRGGBB. */
const HEX_COLOR_RE = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
/** Matches rgb(r,g,b) or rgba(r,g,b,x). */
const RGB_COLOR_RE = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/;

const _colorAlphaCache = new Map<string, string>();

/**
 * Return an `rgba(...)` string for `color` with the given alpha.
 * Supports `#RRGGBB` hex and `rgb(r,g,b)` / `rgba(r,g,b,x)` inputs.
 * Falls back to returning the color unchanged when format is unrecognised.
 * Results are cached so repeated calls with the same arguments are O(1).
 */
export function colorWithAlpha(color: string, alpha: number): string {
  const key = `${color}|${alpha}`;
  const hit = _colorAlphaCache.get(key);
  if (hit !== undefined) return hit;

  let result: string;
  const hexMatch = HEX_COLOR_RE.exec(color);
  if (hexMatch) {
    const r = parseInt(hexMatch[1], 16);
    const g = parseInt(hexMatch[2], 16);
    const b = parseInt(hexMatch[3], 16);
    result = `rgba(${r},${g},${b},${alpha})`;
  } else {
    const rgbMatch = RGB_COLOR_RE.exec(color);
    result = rgbMatch ? `rgba(${rgbMatch[1]},${rgbMatch[2]},${rgbMatch[3]},${alpha})` : color;
  }
  _colorAlphaCache.set(key, result);
  return result;
}

// ─── parseHexToRgb ───────────────────────────────────────────────

/**
 * Module-level cache so each unique color string is only parsed once.
 * All tier colors are `#RRGGBB`; non-hex inputs fall back to white.
 */
const _rgbCache = new Map<string, [number, number, number]>();

/**
 * Parse a `#RRGGBB` hex color string to a cached `[r, g, b]` tuple.
 * Non-hex or malformed values fall back to `[255, 255, 255]`.
 */
export function parseHexToRgb(color: string): [number, number, number] {
  let rgb = _rgbCache.get(color);
  if (!rgb) {
    const h = color.startsWith('#') ? color.slice(1) : color;
    const r = parseInt(h.slice(0, 2), 16) || 255;
    const g = parseInt(h.slice(2, 4), 16) || 255;
    const b = parseInt(h.slice(4, 6), 16) || 255;
    rgb = [r, g, b];
    _rgbCache.set(color, rgb);
  }
  return rgb;
}
