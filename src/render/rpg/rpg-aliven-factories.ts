/**
 * rpg-aliven-factories.ts — Factory functions for the AlivenParticle enemy system.
 */

import { getWaveStatScale } from '../../sim/rpg/rpg-state';
import type { AlivenParticle, AlivenParticleGroup, AlivenVariantParams } from './rpg-aliven-types';
import { ALIVEN_VARIANT_PARAMS, type AlivenVariantId } from './rpg-aliven-constants';

/** Creates a single AlivenParticle (not yet alive; activated one-per-frame during spawning). */
export function makeAlivenParticle(
  params: AlivenVariantParams,
  waveStatScale: number,
): AlivenParticle {
  const hp = Math.ceil(params.hpBase * waveStatScale);
  // Stagger initial cooldowns so particles do not all attack simultaneously.
  const cdRange = params.specialCdMax - params.specialCdMin;
  return {
    x: 0, y: 0,
    vx: (Math.random() - 0.5) * 0.06,
    vy: (Math.random() - 0.5) * 0.06,
    isAlive: false,
    hp,
    maxHp: hp,
    radiusPx:     params.radiusPx,
    color:        params.color,
    glowColor:    params.glowColor,
    pulseMs:      Math.random() * 2000,
    hitFlashMs:   0,
    contactCdMs:  0,
    specialKind:  params.specialKind,
    specialCdMs:  params.specialCdMin + Math.random() * cdRange,
    specialCdMin: params.specialCdMin,
    specialCdMax: params.specialCdMax,
    windupMs:     0,
    ghostMs:      0,
    trail:        [],
  };
}

/** Creates an AlivenParticleGroup at (spawnX, spawnY) for the given wave. */
export function makeAlivenGroup(
  variantId: AlivenVariantId,
  spawnX: number,
  spawnY: number,
  waveNumber: number,
): AlivenParticleGroup {
  const params = ALIVEN_VARIANT_PARAMS[variantId];
  const waveStatScale = getWaveStatScale(waveNumber);
  const particles: AlivenParticle[] = [];
  for (let i = 0; i < params.particleCount; i++) {
    particles.push(makeAlivenParticle(params, waveStatScale));
  }
  return {
    kind:         'aliven',
    variantId,
    tierId:       params.tierId,
    xpMult:       params.xpMult,
    cx:           spawnX,
    cy:           spawnY,
    x:            spawnX,
    y:            spawnY,
    particles,
    bullets:      [],
    spawnedCount: 0,
    targetCount:  params.particleCount,
    spawnCdMs:    0,
    aliveCount:   0,
  };
}
