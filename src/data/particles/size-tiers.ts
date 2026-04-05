export type SizeIndex = 0 | 1 | 2 | 3;
export type SizeName = 'small' | 'medium' | 'large' | 'extra-large';

export const MERGE_THRESHOLD = 100;
export const SIZE_NAMES: readonly SizeName[] = ['small', 'medium', 'large', 'extra-large'];
export const SMALL_SIZE_INDEX: SizeIndex = 0;
export const MEDIUM_SIZE_INDEX: SizeIndex = 1;
export const LARGE_SIZE_INDEX: SizeIndex = 2;
export const EXTRA_LARGE_SIZE_INDEX: SizeIndex = 3;

export const SIZE_SCALE_MULTIPLIERS: readonly number[] = [1.0, 2.5, 6.25, 9.375];
export const SIZE_MIN_VELOCITY_MODIFIERS: readonly number[] = [1.0, 0.8, 0.64, 0.15];
export const SIZE_MAX_VELOCITY_MODIFIERS: readonly number[] = [1.0, 0.85, 0.7, 1.6];
export const SIZE_FORCE_MODIFIERS: readonly number[] = [1.0, 0.85, 0.7, 0.12];
export const SIZE_SMALL_EQUIVALENTS: readonly number[] = [1, 100, 10000, 1000000];
