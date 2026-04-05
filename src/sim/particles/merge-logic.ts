import type { TierId } from '../../data/tiers';
import type { SizeIndex } from '../../data/particles/size-tiers';

export interface ActiveMergeInfo {
  readonly outputTierId: TierId;
  readonly outputSizeIndex: SizeIndex;
  readonly targetX: number;
  readonly targetY: number;
  readonly startTimeMs: number;
  readonly isTierConversion: boolean;
  readonly conversionCount: number;
}
