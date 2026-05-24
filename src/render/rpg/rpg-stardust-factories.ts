/**
 * rpg-stardust-factories.ts — Factory for StardustEnemy instances.
 */
import type { StardustEnemy, StardustParticle } from './rpg-enemy-types';
import {
  STARDUST_PARTICLE_MIN, STARDUST_PARTICLE_MAX, STARDUST_PARTICLE_WAVE_SCALE,
  STARDUST_HP_BASE, STARDUST_HP_SCALE,
  STARDUST_ATK_BASE, STARDUST_ATK_SCALE,
  STARDUST_DEF_BASE, STARDUST_DEF_SCALE,
  STARDUST_CYCLE_MS, STARDUST_DRIFT_SPEED,
} from './rpg-enemy-constants';

export function getStardustParticleCount(waveNumber: number): number {
  const t = Math.min(1, Math.max(0, (waveNumber - 1) / STARDUST_PARTICLE_WAVE_SCALE));
  return Math.round(STARDUST_PARTICLE_MIN + (STARDUST_PARTICLE_MAX - STARDUST_PARTICLE_MIN) * t);
}

export function makeStardustEnemy(
  cx: number, cy: number, waveNumber: number, arenaW: number, arenaH: number
): StardustEnemy {
  const particleCount = getStardustParticleCount(waveNumber);
  const particles: StardustParticle[] = [];
  const spread = 40;
  for (let i = 0; i < particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * spread;
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist;
    const pa = Math.random() * Math.PI * 2;
    particles.push({
      x: px, y: py,
      vx: Math.cos(pa) * STARDUST_DRIFT_SPEED * (0.5 + Math.random()),
      vy: Math.sin(pa) * STARDUST_DRIFT_SPEED * (0.5 + Math.random()),
      hueOffset: Math.random() * 360,
      size: 2.5 + Math.random() * 2.5,
      brightness: 0.6 + Math.random() * 0.4,
    });
  }
  const hp = Math.round(STARDUST_HP_BASE + STARDUST_HP_SCALE * waveNumber);
  return {
    kind: 'stardust',
    x: cx, y: cy,
    hp, maxHp: hp,
    atk: Math.round(STARDUST_ATK_BASE + STARDUST_ATK_SCALE * waveNumber),
    def: Math.round(STARDUST_DEF_BASE + STARDUST_DEF_SCALE * waveNumber),
    particles,
    particleCount,
    phase: 'drifting',
    phaseMs: 0,
    cycleTimerMs: STARDUST_CYCLE_MS * (0.5 + Math.random()),
    pulseMs: 0,
    laserChain: [],
    laserNodes: [],
    laserHitCdMs: 0,
    arenaW, arenaH,
    xpMult: 1,
  };
}
