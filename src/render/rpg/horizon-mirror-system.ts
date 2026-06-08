/**
 * horizon-mirror-system.ts — Mirror-line geometry for the Horizon zone.
 *
 * Reusable by any future Horizon enemy that needs reflection mechanics.
 *
 * Convention: mirror lines are HORIZONTAL (constant Y).  Reflecting across
 * a horizontal line at Y = lineY:
 *   reflectedX = realX          (unchanged)
 *   reflectedY = 2 * lineY - realY
 */

/** Reflects a point across a horizontal line at the given Y position. */
export function reflectAcrossHorizontalLine(
  x: number,
  y: number,
  lineY: number,
): { rx: number; ry: number } {
  return { rx: x, ry: 2 * lineY - y };
}

/**
 * Given a real position and a list of mirror-line Y coordinates, returns
 * the reflected position for each line.
 * Output array is ordered to match the input lineYs array.
 */
export function computeShadowPositions(
  realX: number,
  realY: number,
  lineYs: readonly number[],
): Array<{ rx: number; ry: number }> {
  return lineYs.map(lineY => reflectAcrossHorizontalLine(realX, realY, lineY));
}

/**
 * Converts abstract line-Y fractions (0–1) to canvas coordinates given
 * arena top/bottom bounds.  Call once on spawn or when bounds change.
 */
export function fractionToLineY(
  fraction: number,
  arenaTop: number,
  arenaBottom: number,
): number {
  return arenaTop + fraction * (arenaBottom - arenaTop);
}
