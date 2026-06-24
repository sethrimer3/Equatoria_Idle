import { getBossTempoBpm } from './boss-tempo-config';

export type BossVisibility = 'normal' | 'secret' | 'superSecret';

/** Canonical 1-based boss roster. Index zero is intentionally unused. */
export const BOSS_NAMES: readonly string[] = [
  '', 'Quartz Sovereign', 'Ruby King', 'Sunstone Herald', 'Citrine Weaver',
  'Iolite Colossus', 'Amethyst Breaker', 'Diamond Eternal', 'Nullstone Devourer',
  'Fracteryl Manifestation', 'Eigenstein Entity', 'Void Nexus', 'The Problem', 'The Solution',
];

export const BOSS_VISIBILITY: Readonly<Record<number, BossVisibility>> = {
  8: 'secret', 9: 'secret', 10: 'secret', 12: 'superSecret', 13: 'superSecret',
};

export function getBossDisplayName(bossId: number): string {
  return BOSS_NAMES[bossId] ?? 'Unknown Boss';
}

export function getBossBpm(bossId: number): number {
  return getBossTempoBpm(bossId);
}

export function getBossVisibility(bossId: number): BossVisibility {
  return BOSS_VISIBILITY[bossId] ?? 'normal';
}

export function isSecretBoss(bossId: number): boolean {
  return getBossVisibility(bossId) === 'secret';
}

export function isSuperSecretBoss(bossId: number): boolean {
  return getBossVisibility(bossId) === 'superSecret';
}
