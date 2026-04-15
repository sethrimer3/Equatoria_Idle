export interface SparkleEmitter {
  timeoutId: number | null;
}

export const SPARKLE_MIN_DURATION_MS = 3000;
export const SPARKLE_MAX_DURATION_MS = 5000;
export const SPARKLE_MIN_DELAY_MS = 1400;
export const SPARKLE_MAX_DELAY_MS = 2600;
export const INITIAL_SPARKLE_DELAY_MS = 1000;
export const SPARKLE_SIZE = 6;
export const SPARKLE_DRIFT_X_RANGE = 32;
export const SPARKLE_DRIFT_Y_RANGE = 26;
export const SPARKLE_VERTICAL_BIAS_Y = -8;
export const SPARKLE_SCALE_MIN = 0.6;
export const SPARKLE_SCALE_MAX = 1.3;

export function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
