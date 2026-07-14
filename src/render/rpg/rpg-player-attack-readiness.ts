import type { RpgEncounterCollections } from './rpg-encounter-collections';

export const RPG_ATTACK_READINESS_PARTICIPATING_KEYS = [
  'enemies', 'sapphireEnemies', 'sapphireMissiles', 'emeraldEnemies',
  'amberEnemies', 'amberShards', 'voidEnemies', 'quartzEnemies', 'quartzSpikes',
  'rubyEnemies', 'rubyBolts', 'sunstoneEnemies', 'citrineEnemies', 'citrineBolts',
  'ioliteEnemies', 'amethystEnemies', 'amethystShards', 'diamondEnemies', 'diamondShards',
  'nullstoneEnemies', 'voidTendrils', 'fracterylEnemies', 'fracterylShards',
  'eigensteinEnemies', 'polyominoEnemies', 'fissilePolyominoEnemies',
  'refractorPolyominoEnemies', 'eliteEnemies', 'binaryRingEnemies', 'alivenGroups',
  'dustWispEnemies', 'ribbonWormEnemies', 'lanternMothEnemies', 'eyeStalkEnemies',
  'jellyfishEnemies', 'eliteJellyfishEnemies', 'clothGhostEnemies', 'plantTurretEnemies',
  'gearInsectEnemies', 'spiderCrawlerEnemies', 'moteSwarmEnemies', 'shadowHandEnemies',
  'sandFishEnemies', 'quartzFishEnemies', 'rubyFishEnemies', 'sunstoneFishEnemies',
  'emeraldFishEnemies', 'sapphireFishEnemies', 'amethystFishEnemies', 'diamondFishEnemies',
  'plantProjectiles', 'horizonPentagonGroups',
] as const satisfies readonly (keyof RpgEncounterCollections)[];

export const RPG_ATTACK_READINESS_EXCLUDED_KEYS = [
  'spawnQueue', 'eigensteinBeams', 'binaryRingMissiles',
  'nadirCubePointEnemies', 'nadirCubeMines', 'nadirCubeTrailSegments',
  'nadirCubeTurretBolts', 'nadirCubeLinkLasers', 'stardustEnemies', 'lifeColonies',
  'fishMines', 'fishSpikes', 'fishBolts', 'fishDecoys', 'bossProjectiles',
  'teleportParticles', 'luckyMotes', 'luckyMotePopups', 'hitEffects', 'shotLines',
  'damageNumbers', 'deathParticles',
] as const satisfies readonly (keyof RpgEncounterCollections)[];

/** Preserves the pre-attack target-existence gate without changing target selection. */
export function hasAttackDispatchTarget(
  collections: RpgEncounterCollections,
  bossEnemy: object | null,
): boolean {
  for (const key of RPG_ATTACK_READINESS_PARTICIPATING_KEYS) {
    if (key === 'alivenGroups') {
      for (const group of collections.alivenGroups) {
        for (const particle of group.particles) {
          if (particle.isAlive === true) return true;
        }
      }
    } else if (collections[key].length > 0) {
      return true;
    }
  }

  return bossEnemy !== null;
}
