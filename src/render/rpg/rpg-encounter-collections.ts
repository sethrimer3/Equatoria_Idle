/**
 * Canonical per-renderer ownership for encounter entities and short-lived
 * encounter visuals. Collections are created once and retain their identity
 * for the renderer lifetime; lifecycle resets only truncate them in place.
 */

import type {
  DamageNumber,
  DeathParticle,
  HitEffect,
  LaserEnemy,
  SapphireEnemy,
  SapphireMissile,
  ShotLine,
  SpawnEntry,
} from './rpg-types';
import type {
  AmberEnemy,
  AmberShard,
  AmethystEnemy,
  AmethystShard,
  BossProjectile,
  CitrineBolt,
  CitrineEnemy,
  DiamondEnemy,
  DiamondShard,
  EigensteinBeam,
  EigensteinEnemy,
  EliteEnemy,
  EmeraldEnemy,
  FracterylEnemy,
  FracterylShard,
  IoliteEnemy,
  LuckyMote,
  LuckyMotePopup,
  NullstoneEnemy,
  QuartzEnemy,
  QuartzSpike,
  RubyBolt,
  RubyEnemy,
  StardustEnemy,
  SunstoneEnemy,
  TeleportParticle,
  VoidEnemy,
  VoidTendril,
} from './rpg-enemy-types';
import type {
  AmethystFishEnemy,
  ClothGhostEnemy,
  DiamondFishEnemy,
  DustWispEnemy,
  EmeraldFishEnemy,
  EyeStalkEnemy,
  FishBolt,
  FishDecoy,
  FishMine,
  FishSpike,
  GearInsectEnemy,
  JellyfishEnemy,
  LanternMothEnemy,
  MoteSwarmEnemy,
  PlantProjectile,
  PlantTurretEnemy,
  QuartzFishEnemy,
  RibbonWormEnemy,
  RubyFishEnemy,
  SandFishEnemy,
  SapphireFishEnemy,
  ShadowHandEnemy,
  SpiderCrawlerEnemy,
  SunstoneFishEnemy,
} from './rpg-procedural-types';
import type {
  FissilePolyominoEnemy,
  PolyominoEnemy,
  RefractorPolyominoEnemy,
} from './polyomino-enemy-types';
import type { BinaryRingEnemy, BinaryRingMissile } from './rpg-binary-ring-encounter';
import type {
  NadirCubeLinkLaser,
  NadirCubeMine,
  NadirCubePointEnemy,
  NadirCubeTrailSegment,
  NadirCubeTurretBolt,
} from './nadir-cube-point-types';
import type { HorizonPentagonGroup } from './horizon-pentagon-types';
import type { AlivenParticleGroup } from './rpg-aliven-types';
import type { LifeColonyController } from './life-types';
import type { EliteJellyfishEnemy } from './rpg-jellyfish-elite-types';

export interface RpgEncounterCollections {
  spawnQueue: SpawnEntry[];
  enemies: LaserEnemy[];
  sapphireEnemies: SapphireEnemy[];
  sapphireMissiles: SapphireMissile[];
  emeraldEnemies: EmeraldEnemy[];
  amberEnemies: AmberEnemy[];
  amberShards: AmberShard[];
  voidEnemies: VoidEnemy[];
  quartzEnemies: QuartzEnemy[];
  quartzSpikes: QuartzSpike[];
  rubyEnemies: RubyEnemy[];
  rubyBolts: RubyBolt[];
  sunstoneEnemies: SunstoneEnemy[];
  citrineEnemies: CitrineEnemy[];
  citrineBolts: CitrineBolt[];
  ioliteEnemies: IoliteEnemy[];
  amethystEnemies: AmethystEnemy[];
  amethystShards: AmethystShard[];
  diamondEnemies: DiamondEnemy[];
  diamondShards: DiamondShard[];
  nullstoneEnemies: NullstoneEnemy[];
  voidTendrils: VoidTendril[];
  fracterylEnemies: FracterylEnemy[];
  fracterylShards: FracterylShard[];
  eigensteinEnemies: EigensteinEnemy[];
  eigensteinBeams: EigensteinBeam[];
  eliteEnemies: EliteEnemy[];
  polyominoEnemies: PolyominoEnemy[];
  fissilePolyominoEnemies: FissilePolyominoEnemy[];
  refractorPolyominoEnemies: RefractorPolyominoEnemy[];
  binaryRingEnemies: BinaryRingEnemy[];
  binaryRingMissiles: BinaryRingMissile[];
  nadirCubePointEnemies: NadirCubePointEnemy[];
  nadirCubeMines: NadirCubeMine[];
  nadirCubeTrailSegments: NadirCubeTrailSegment[];
  nadirCubeTurretBolts: NadirCubeTurretBolt[];
  nadirCubeLinkLasers: NadirCubeLinkLaser[];
  stardustEnemies: StardustEnemy[];
  horizonPentagonGroups: HorizonPentagonGroup[];
  alivenGroups: AlivenParticleGroup[];
  lifeColonies: LifeColonyController[];
  dustWispEnemies: DustWispEnemy[];
  ribbonWormEnemies: RibbonWormEnemy[];
  lanternMothEnemies: LanternMothEnemy[];
  eyeStalkEnemies: EyeStalkEnemy[];
  jellyfishEnemies: JellyfishEnemy[];
  eliteJellyfishEnemies: EliteJellyfishEnemy[];
  clothGhostEnemies: ClothGhostEnemy[];
  plantTurretEnemies: PlantTurretEnemy[];
  gearInsectEnemies: GearInsectEnemy[];
  spiderCrawlerEnemies: SpiderCrawlerEnemy[];
  moteSwarmEnemies: MoteSwarmEnemy[];
  shadowHandEnemies: ShadowHandEnemy[];
  sandFishEnemies: SandFishEnemy[];
  quartzFishEnemies: QuartzFishEnemy[];
  rubyFishEnemies: RubyFishEnemy[];
  sunstoneFishEnemies: SunstoneFishEnemy[];
  emeraldFishEnemies: EmeraldFishEnemy[];
  sapphireFishEnemies: SapphireFishEnemy[];
  amethystFishEnemies: AmethystFishEnemy[];
  diamondFishEnemies: DiamondFishEnemy[];
  plantProjectiles: PlantProjectile[];
  fishMines: FishMine[];
  fishSpikes: FishSpike[];
  fishBolts: FishBolt[];
  fishDecoys: FishDecoy[];
  bossProjectiles: BossProjectile[];
  teleportParticles: TeleportParticle[];
  luckyMotes: LuckyMote[];
  luckyMotePopups: LuckyMotePopup[];
  hitEffects: HitEffect[];
  shotLines: ShotLine[];
  damageNumbers: DamageNumber[];
  deathParticles: DeathParticle[];
}

export const RPG_ENCOUNTER_COLLECTION_KEYS = [
  'spawnQueue',
  'enemies', 'sapphireEnemies', 'sapphireMissiles', 'emeraldEnemies',
  'amberEnemies', 'amberShards', 'voidEnemies', 'quartzEnemies', 'quartzSpikes',
  'rubyEnemies', 'rubyBolts', 'sunstoneEnemies', 'citrineEnemies', 'citrineBolts',
  'ioliteEnemies', 'amethystEnemies', 'amethystShards', 'diamondEnemies', 'diamondShards',
  'nullstoneEnemies', 'voidTendrils', 'fracterylEnemies', 'fracterylShards',
  'eigensteinEnemies', 'eigensteinBeams', 'eliteEnemies',
  'polyominoEnemies', 'fissilePolyominoEnemies', 'refractorPolyominoEnemies',
  'binaryRingEnemies', 'binaryRingMissiles',
  'nadirCubePointEnemies', 'nadirCubeMines', 'nadirCubeTrailSegments',
  'nadirCubeTurretBolts', 'nadirCubeLinkLasers',
  'stardustEnemies', 'horizonPentagonGroups', 'alivenGroups', 'lifeColonies',
  'dustWispEnemies', 'ribbonWormEnemies', 'lanternMothEnemies', 'eyeStalkEnemies',
  'jellyfishEnemies', 'eliteJellyfishEnemies', 'clothGhostEnemies', 'plantTurretEnemies',
  'gearInsectEnemies', 'spiderCrawlerEnemies', 'moteSwarmEnemies', 'shadowHandEnemies',
  'sandFishEnemies', 'quartzFishEnemies', 'rubyFishEnemies', 'sunstoneFishEnemies',
  'emeraldFishEnemies', 'sapphireFishEnemies', 'amethystFishEnemies', 'diamondFishEnemies',
  'plantProjectiles', 'fishMines', 'fishSpikes', 'fishBolts', 'fishDecoys',
  'bossProjectiles', 'teleportParticles', 'luckyMotes', 'luckyMotePopups',
  'hitEffects', 'shotLines', 'damageNumbers', 'deathParticles',
] as const satisfies readonly (keyof RpgEncounterCollections)[];

const COMMON_RESET_KEYS = [
  'spawnQueue',
  'enemies', 'sapphireEnemies', 'sapphireMissiles', 'emeraldEnemies',
  'amberEnemies', 'amberShards', 'voidEnemies', 'quartzEnemies', 'quartzSpikes',
  'rubyEnemies', 'rubyBolts', 'sunstoneEnemies', 'citrineEnemies', 'citrineBolts',
  'ioliteEnemies', 'amethystEnemies', 'amethystShards', 'diamondEnemies', 'diamondShards',
  'nullstoneEnemies', 'voidTendrils', 'fracterylEnemies', 'fracterylShards',
  'eigensteinEnemies', 'eigensteinBeams', 'eliteEnemies',
  'polyominoEnemies', 'fissilePolyominoEnemies', 'refractorPolyominoEnemies',
  'binaryRingEnemies', 'binaryRingMissiles',
  'horizonPentagonGroups', 'alivenGroups', 'lifeColonies',
  'dustWispEnemies', 'ribbonWormEnemies', 'lanternMothEnemies', 'eyeStalkEnemies',
  'jellyfishEnemies', 'eliteJellyfishEnemies', 'clothGhostEnemies', 'plantTurretEnemies',
  'gearInsectEnemies', 'spiderCrawlerEnemies', 'moteSwarmEnemies', 'shadowHandEnemies',
  'sandFishEnemies', 'quartzFishEnemies', 'rubyFishEnemies', 'sunstoneFishEnemies',
  'emeraldFishEnemies', 'sapphireFishEnemies', 'amethystFishEnemies', 'diamondFishEnemies',
  'plantProjectiles', 'fishMines', 'fishSpikes', 'fishBolts', 'fishDecoys',
  'bossProjectiles', 'luckyMotes', 'luckyMotePopups',
  'hitEffects', 'shotLines', 'damageNumbers', 'deathParticles',
] as const satisfies readonly (keyof RpgEncounterCollections)[];

const NADIR_COLLECTION_KEYS = [
  'nadirCubePointEnemies',
  'nadirCubeMines',
  'nadirCubeTrailSegments',
  'nadirCubeTurretBolts',
  'nadirCubeLinkLasers',
] as const satisfies readonly (keyof RpgEncounterCollections)[];

export const BOSS_ENTRY_CLEAR_KEYS = [
  ...COMMON_RESET_KEYS,
  'stardustEnemies',
] as const satisfies readonly (keyof RpgEncounterCollections)[];

export const ZONE_SWITCH_CLEAR_KEYS = [
  ...COMMON_RESET_KEYS,
  'stardustEnemies',
  'teleportParticles',
] as const satisfies readonly (keyof RpgEncounterCollections)[];

export const NORMAL_DEATH_RESTART_CLEAR_KEYS = [
  ...COMMON_RESET_KEYS,
  ...NADIR_COLLECTION_KEYS,
  'stardustEnemies',
] as const satisfies readonly (keyof RpgEncounterCollections)[];

export const BOSS_DEATH_RESTART_CLEAR_KEYS = [
  ...COMMON_RESET_KEYS,
  ...NADIR_COLLECTION_KEYS,
  'stardustEnemies',
  'teleportParticles',
] as const satisfies readonly (keyof RpgEncounterCollections)[];

export function createRpgEncounterCollections(): RpgEncounterCollections {
  return {
    spawnQueue: [],
    enemies: [], sapphireEnemies: [], sapphireMissiles: [], emeraldEnemies: [],
    amberEnemies: [], amberShards: [], voidEnemies: [], quartzEnemies: [], quartzSpikes: [],
    rubyEnemies: [], rubyBolts: [], sunstoneEnemies: [], citrineEnemies: [], citrineBolts: [],
    ioliteEnemies: [], amethystEnemies: [], amethystShards: [], diamondEnemies: [], diamondShards: [],
    nullstoneEnemies: [], voidTendrils: [], fracterylEnemies: [], fracterylShards: [],
    eigensteinEnemies: [], eigensteinBeams: [], eliteEnemies: [],
    polyominoEnemies: [], fissilePolyominoEnemies: [], refractorPolyominoEnemies: [],
    binaryRingEnemies: [], binaryRingMissiles: [],
    nadirCubePointEnemies: [], nadirCubeMines: [], nadirCubeTrailSegments: [],
    nadirCubeTurretBolts: [], nadirCubeLinkLasers: [],
    stardustEnemies: [], horizonPentagonGroups: [], alivenGroups: [], lifeColonies: [],
    dustWispEnemies: [], ribbonWormEnemies: [], lanternMothEnemies: [], eyeStalkEnemies: [],
    jellyfishEnemies: [], eliteJellyfishEnemies: [], clothGhostEnemies: [], plantTurretEnemies: [],
    gearInsectEnemies: [], spiderCrawlerEnemies: [], moteSwarmEnemies: [], shadowHandEnemies: [],
    sandFishEnemies: [], quartzFishEnemies: [], rubyFishEnemies: [], sunstoneFishEnemies: [],
    emeraldFishEnemies: [], sapphireFishEnemies: [], amethystFishEnemies: [], diamondFishEnemies: [],
    plantProjectiles: [], fishMines: [], fishSpikes: [], fishBolts: [], fishDecoys: [],
    bossProjectiles: [], teleportParticles: [], luckyMotes: [], luckyMotePopups: [],
    hitEffects: [], shotLines: [], damageNumbers: [], deathParticles: [],
  };
}

function clearCollections(
  collections: RpgEncounterCollections,
  keys: readonly (keyof RpgEncounterCollections)[],
): void {
  for (const key of keys) collections[key].length = 0;
}

export function clearForBossEntry(collections: RpgEncounterCollections): void {
  clearCollections(collections, BOSS_ENTRY_CLEAR_KEYS);
}

export function clearForZoneSwitch(collections: RpgEncounterCollections): void {
  clearCollections(collections, ZONE_SWITCH_CLEAR_KEYS);
}

export function clearForDeathRestart(
  collections: RpgEncounterCollections,
  profile: 'normal' | 'boss',
): void {
  clearCollections(
    collections,
    profile === 'boss' ? BOSS_DEATH_RESTART_CLEAR_KEYS : NORMAL_DEATH_RESTART_CLEAR_KEYS,
  );
}
