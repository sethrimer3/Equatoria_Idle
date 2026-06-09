/**
 * rpg-jellyfish-elite-factories.ts — Factory functions for the four elite
 * jellyfish variants.
 *
 * Each factory pre-allocates tentacle segment arrays (Float64Array) so no
 * per-frame heap allocations are needed during gameplay.
 */
import { getWaveStatScale } from '../../sim/rpg/rpg-state';
import type { EliteJellyfishEnemy } from './rpg-jellyfish-elite-types';
import {
  BASIC_JELLYFISH_HP_INIT, BASIC_JELLYFISH_ATK_INIT, BASIC_JELLYFISH_DEF_INIT,
  BASIC_JELLYFISH_TAIL_COUNT, BASIC_JELLYFISH_SEGS_PER_TAIL,
  BASIC_JELLYFISH_SEG_MAX_LEN, BASIC_JELLYFISH_SEG_DAMPING,
  BASIC_JELLYFISH_PULSE_FORCE, BASIC_JELLYFISH_PULSE_CD_MS,
  BASIC_JELLYFISH_PULSE_DUR_MS, BASIC_JELLYFISH_DRIFT_DRAG,

  LONGTAIL_JELLYFISH_HP_INIT, LONGTAIL_JELLYFISH_ATK_INIT, LONGTAIL_JELLYFISH_DEF_INIT,
  LONGTAIL_JELLYFISH_TAIL_COUNT, LONGTAIL_JELLYFISH_SEGS_PER_TAIL,
  LONGTAIL_JELLYFISH_SEG_MAX_LEN, LONGTAIL_JELLYFISH_SEG_DAMPING,
  LONGTAIL_JELLYFISH_PULSE_FORCE, LONGTAIL_JELLYFISH_PULSE_CD_MS,
  LONGTAIL_JELLYFISH_PULSE_DUR_MS, LONGTAIL_JELLYFISH_DRIFT_DRAG,

  WHIPLASH_JELLYFISH_HP_INIT, WHIPLASH_JELLYFISH_ATK_INIT, WHIPLASH_JELLYFISH_DEF_INIT,
  WHIPLASH_JELLYFISH_TAIL_COUNT, WHIPLASH_JELLYFISH_SEGS_PER_TAIL,
  WHIPLASH_JELLYFISH_SEG_MAX_LEN, WHIPLASH_JELLYFISH_SEG_DAMPING,
  WHIPLASH_JELLYFISH_PULSE_FORCE, WHIPLASH_JELLYFISH_PULSE_CD_MS,
  WHIPLASH_JELLYFISH_PULSE_DUR_MS, WHIPLASH_JELLYFISH_DRIFT_DRAG,
  WHIPLASH_JELLYFISH_BURST_CD_MS,

  ENCIRCLING_JELLYFISH_HP_INIT, ENCIRCLING_JELLYFISH_ATK_INIT, ENCIRCLING_JELLYFISH_DEF_INIT,
  ENCIRCLING_JELLYFISH_TAIL_COUNT, ENCIRCLING_JELLYFISH_SEGS_PER_TAIL,
  ENCIRCLING_JELLYFISH_SEG_MAX_LEN, ENCIRCLING_JELLYFISH_SEG_DAMPING,
  ENCIRCLING_JELLYFISH_PULSE_FORCE, ENCIRCLING_JELLYFISH_PULSE_CD_MS,
  ENCIRCLING_JELLYFISH_PULSE_DUR_MS, ENCIRCLING_JELLYFISH_DRIFT_DRAG,
} from './rpg-jellyfish-elite-constants';

function makeBase(
  x: number, y: number, wave: number,
  hp0: number, atk0: number, def0: number,
  tailCount: number, segsPerTail: number,
  segMaxLen: number, segDamping: number,
  pulseForce: number, pulseCdMs: number,
  _pulseDurMs: number, driftDrag: number,
): Omit<EliteJellyfishEnemy, 'kind' | 'variant' | 'burstCdMs' | 'orbitAngle' | 'flankSign'> {
  const s = getWaveStatScale(wave);
  const total = tailCount * segsPerTail;
  const segX   = new Float64Array(total).fill(x);
  const segY   = new Float64Array(total).fill(y);
  const segPvX = new Float64Array(total).fill(x);
  const segPvY = new Float64Array(total).fill(y);
  return {
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(hp0 * s), maxHp: Math.ceil(hp0 * s),
    atk: Math.ceil(atk0 * s), def: Math.ceil(def0 * s),
    animPhase: Math.random() * Math.PI * 2,
    hitFlashMs: 0,
    contactCdMs: 0,
    bellPhase: Math.random() * Math.PI * 2,
    pulseCdMs: pulseCdMs * (0.8 + Math.random() * 0.4),
    pulseActiveMs: 0,
    pulseForce,
    driftDrag,
    tailCount,
    segmentsPerTail: segsPerTail,
    segX, segY, segPvX, segPvY,
    segMaxLen,
    segDamping,
  };
}

export function makeBasicJellyfishEnemy(x: number, y: number, wave: number): EliteJellyfishEnemy {
  return {
    ...makeBase(x, y, wave,
      BASIC_JELLYFISH_HP_INIT, BASIC_JELLYFISH_ATK_INIT, BASIC_JELLYFISH_DEF_INIT,
      BASIC_JELLYFISH_TAIL_COUNT, BASIC_JELLYFISH_SEGS_PER_TAIL,
      BASIC_JELLYFISH_SEG_MAX_LEN, BASIC_JELLYFISH_SEG_DAMPING,
      BASIC_JELLYFISH_PULSE_FORCE, BASIC_JELLYFISH_PULSE_CD_MS,
      BASIC_JELLYFISH_PULSE_DUR_MS, BASIC_JELLYFISH_DRIFT_DRAG,
    ),
    kind: 'proc_jellyfish_elite',
    variant: 'basic',
    orbitAngle: 0,
    flankSign: 1,
    burstCdMs: 0,
  };
}

export function makeLongtailJellyfishEnemy(x: number, y: number, wave: number): EliteJellyfishEnemy {
  return {
    ...makeBase(x, y, wave,
      LONGTAIL_JELLYFISH_HP_INIT, LONGTAIL_JELLYFISH_ATK_INIT, LONGTAIL_JELLYFISH_DEF_INIT,
      LONGTAIL_JELLYFISH_TAIL_COUNT, LONGTAIL_JELLYFISH_SEGS_PER_TAIL,
      LONGTAIL_JELLYFISH_SEG_MAX_LEN, LONGTAIL_JELLYFISH_SEG_DAMPING,
      LONGTAIL_JELLYFISH_PULSE_FORCE, LONGTAIL_JELLYFISH_PULSE_CD_MS,
      LONGTAIL_JELLYFISH_PULSE_DUR_MS, LONGTAIL_JELLYFISH_DRIFT_DRAG,
    ),
    kind: 'proc_jellyfish_elite',
    variant: 'longtail',
    orbitAngle: 0,
    flankSign: Math.random() < 0.5 ? 1 : -1,
    burstCdMs: 0,
  };
}

export function makeWhiplashJellyfishEnemy(x: number, y: number, wave: number): EliteJellyfishEnemy {
  return {
    ...makeBase(x, y, wave,
      WHIPLASH_JELLYFISH_HP_INIT, WHIPLASH_JELLYFISH_ATK_INIT, WHIPLASH_JELLYFISH_DEF_INIT,
      WHIPLASH_JELLYFISH_TAIL_COUNT, WHIPLASH_JELLYFISH_SEGS_PER_TAIL,
      WHIPLASH_JELLYFISH_SEG_MAX_LEN, WHIPLASH_JELLYFISH_SEG_DAMPING,
      WHIPLASH_JELLYFISH_PULSE_FORCE, WHIPLASH_JELLYFISH_PULSE_CD_MS,
      WHIPLASH_JELLYFISH_PULSE_DUR_MS, WHIPLASH_JELLYFISH_DRIFT_DRAG,
    ),
    kind: 'proc_jellyfish_elite',
    variant: 'whiplash',
    orbitAngle: 0,
    flankSign: 1,
    burstCdMs: WHIPLASH_JELLYFISH_BURST_CD_MS * (0.5 + Math.random() * 0.5),
  };
}

export function makeEncirclingJellyfishEnemy(x: number, y: number, wave: number): EliteJellyfishEnemy {
  return {
    ...makeBase(x, y, wave,
      ENCIRCLING_JELLYFISH_HP_INIT, ENCIRCLING_JELLYFISH_ATK_INIT, ENCIRCLING_JELLYFISH_DEF_INIT,
      ENCIRCLING_JELLYFISH_TAIL_COUNT, ENCIRCLING_JELLYFISH_SEGS_PER_TAIL,
      ENCIRCLING_JELLYFISH_SEG_MAX_LEN, ENCIRCLING_JELLYFISH_SEG_DAMPING,
      ENCIRCLING_JELLYFISH_PULSE_FORCE, ENCIRCLING_JELLYFISH_PULSE_CD_MS,
      ENCIRCLING_JELLYFISH_PULSE_DUR_MS, ENCIRCLING_JELLYFISH_DRIFT_DRAG,
    ),
    kind: 'proc_jellyfish_elite',
    variant: 'encircling',
    orbitAngle: Math.random() * Math.PI * 2,
    flankSign: Math.random() < 0.5 ? 1 : -1,
    burstCdMs: 0,
  };
}
