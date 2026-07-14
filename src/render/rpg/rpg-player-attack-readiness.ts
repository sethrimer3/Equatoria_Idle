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
  if (
    collections.enemies.length > 0
    || collections.sapphireEnemies.length > 0
    || collections.sapphireMissiles.length > 0
    || collections.emeraldEnemies.length > 0
    || collections.amberEnemies.length > 0
    || collections.amberShards.length > 0
    || collections.voidEnemies.length > 0
    || collections.quartzEnemies.length > 0
    || collections.quartzSpikes.length > 0
    || collections.rubyEnemies.length > 0
    || collections.rubyBolts.length > 0
    || collections.sunstoneEnemies.length > 0
    || collections.citrineEnemies.length > 0
    || collections.citrineBolts.length > 0
    || collections.ioliteEnemies.length > 0
    || collections.amethystEnemies.length > 0
    || collections.amethystShards.length > 0
    || collections.diamondEnemies.length > 0
    || collections.diamondShards.length > 0
    || collections.nullstoneEnemies.length > 0
    || collections.voidTendrils.length > 0
    || collections.fracterylEnemies.length > 0
    || collections.fracterylShards.length > 0
    || collections.eigensteinEnemies.length > 0
    || collections.polyominoEnemies.length > 0
    || collections.fissilePolyominoEnemies.length > 0
    || collections.refractorPolyominoEnemies.length > 0
    || collections.eliteEnemies.length > 0
    || collections.binaryRingEnemies.length > 0
    || collections.dustWispEnemies.length > 0
    || collections.ribbonWormEnemies.length > 0
    || collections.lanternMothEnemies.length > 0
    || collections.eyeStalkEnemies.length > 0
    || collections.jellyfishEnemies.length > 0
    || collections.eliteJellyfishEnemies.length > 0
    || collections.clothGhostEnemies.length > 0
    || collections.plantTurretEnemies.length > 0
    || collections.gearInsectEnemies.length > 0
    || collections.spiderCrawlerEnemies.length > 0
    || collections.moteSwarmEnemies.length > 0
    || collections.shadowHandEnemies.length > 0
    || collections.sandFishEnemies.length > 0
    || collections.quartzFishEnemies.length > 0
    || collections.rubyFishEnemies.length > 0
    || collections.sunstoneFishEnemies.length > 0
    || collections.emeraldFishEnemies.length > 0
    || collections.sapphireFishEnemies.length > 0
    || collections.amethystFishEnemies.length > 0
    || collections.diamondFishEnemies.length > 0
    || collections.plantProjectiles.length > 0
    || collections.horizonPentagonGroups.length > 0
  ) return true;

  for (const group of collections.alivenGroups) {
    for (const particle of group.particles) {
      if (particle.isAlive === true) return true;
    }
  }

  return bossEnemy !== null;
}
