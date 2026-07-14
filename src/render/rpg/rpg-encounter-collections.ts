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

export interface RpgVerdureResizeBody {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
}

export interface RpgOverlayFadeBody {
  x: number;
  y: number;
  hp?: number;
}

export interface RpgOverlayFadeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface RpgOverlayFadeProjection {
  worldToScreen(point: { x: number; y: number }): { x: number; y: number };
}

type EncounterCollectionElement<Key extends keyof RpgEncounterCollections> =
  RpgEncounterCollections[Key][number];

type EncounterCollectionKeyFor<Body> = {
  [Key in keyof RpgEncounterCollections]: EncounterCollectionElement<Key> extends Body ? Key : never;
}[keyof RpgEncounterCollections];

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

export const RPG_VERDURE_RESIZE_BODY_KEYS = [
  'enemies', 'sapphireEnemies', 'emeraldEnemies', 'amberEnemies', 'voidEnemies',
  'quartzEnemies', 'rubyEnemies', 'sunstoneEnemies', 'citrineEnemies', 'ioliteEnemies',
  'amethystEnemies', 'diamondEnemies', 'nullstoneEnemies', 'fracterylEnemies',
  'eigensteinEnemies', 'eliteEnemies', 'polyominoEnemies', 'fissilePolyominoEnemies',
  'refractorPolyominoEnemies', 'dustWispEnemies', 'ribbonWormEnemies',
  'lanternMothEnemies', 'eyeStalkEnemies', 'jellyfishEnemies', 'eliteJellyfishEnemies',
  'clothGhostEnemies', 'plantTurretEnemies', 'gearInsectEnemies', 'spiderCrawlerEnemies',
  'moteSwarmEnemies', 'shadowHandEnemies', 'sandFishEnemies', 'quartzFishEnemies',
  'rubyFishEnemies', 'sunstoneFishEnemies', 'emeraldFishEnemies', 'sapphireFishEnemies',
  'amethystFishEnemies', 'diamondFishEnemies',
] as const satisfies readonly EncounterCollectionKeyFor<RpgVerdureResizeBody>[];

export const RPG_OVERLAY_FADE_BODY_KEYS = [
  'enemies', 'sapphireEnemies', 'emeraldEnemies', 'amberEnemies', 'voidEnemies',
  'quartzEnemies', 'rubyEnemies', 'sunstoneEnemies', 'citrineEnemies', 'ioliteEnemies',
  'amethystEnemies', 'diamondEnemies', 'nullstoneEnemies', 'fracterylEnemies',
  'eigensteinEnemies', 'eliteEnemies', 'polyominoEnemies', 'fissilePolyominoEnemies',
  'refractorPolyominoEnemies', 'binaryRingEnemies', 'nadirCubePointEnemies',
  'stardustEnemies', 'dustWispEnemies', 'ribbonWormEnemies', 'lanternMothEnemies',
  'eyeStalkEnemies', 'jellyfishEnemies', 'eliteJellyfishEnemies', 'clothGhostEnemies',
  'plantTurretEnemies', 'gearInsectEnemies', 'spiderCrawlerEnemies', 'moteSwarmEnemies',
  'shadowHandEnemies', 'sandFishEnemies', 'quartzFishEnemies', 'rubyFishEnemies',
  'sunstoneFishEnemies', 'emeraldFishEnemies', 'sapphireFishEnemies', 'amethystFishEnemies',
  'diamondFishEnemies',
] as const satisfies readonly EncounterCollectionKeyFor<RpgOverlayFadeBody>[];

export type RpgVerdureResizeBodyKey = typeof RPG_VERDURE_RESIZE_BODY_KEYS[number];
export type RpgOverlayFadeBodyKey = typeof RPG_OVERLAY_FADE_BODY_KEYS[number];

export function getVerdureResizeBodies(
  collections: RpgEncounterCollections,
  key: RpgVerdureResizeBodyKey,
): readonly RpgVerdureResizeBody[] {
  return collections[key];
}

export function applyVerdureResizeBodyProfile(
  collections: RpgEncounterCollections,
  applyBodyCorrection: (body: RpgVerdureResizeBody, margin: number) => void,
): void {
  for (const key of RPG_VERDURE_RESIZE_BODY_KEYS) {
    const bodies = getVerdureResizeBodies(collections, key);
    for (let i = 0; i < bodies.length; i++) applyBodyCorrection(bodies[i], 8);
  }
}

export function getOverlayFadeBodies(
  collections: RpgEncounterCollections,
  key: RpgOverlayFadeBodyKey,
): readonly RpgOverlayFadeBody[] {
  return collections[key];
}

function worldPointOverlapsOverlayRects(
  projection: RpgOverlayFadeProjection,
  xWorld: number,
  yWorld: number,
  rects: readonly RpgOverlayFadeRect[],
  padPx = 10,
): boolean {
  const screen = projection.worldToScreen({ x: xWorld, y: yWorld });
  for (const rect of rects) {
    if (
      screen.x >= rect.left - padPx && screen.x <= rect.right + padPx
      && screen.y >= rect.top - padPx && screen.y <= rect.bottom + padPx
    ) return true;
  }
  return false;
}

export function hasOverlayFadeOverlap(
  collections: RpgEncounterCollections,
  mote: { x: number; y: number },
  bossEnemy: { x: number; y: number; hp: number } | null,
  projection: RpgOverlayFadeProjection,
  rects: readonly RpgOverlayFadeRect[],
): boolean {
  if (worldPointOverlapsOverlayRects(projection, mote.x, mote.y, rects)) return true;

  for (const key of RPG_OVERLAY_FADE_BODY_KEYS) {
    const bodies = getOverlayFadeBodies(collections, key);
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      if ((body.hp ?? 1) <= 0) continue;
      if (worldPointOverlapsOverlayRects(projection, body.x, body.y, rects)) return true;
    }
  }

  return bossEnemy !== null && bossEnemy.hp > 0
    && worldPointOverlapsOverlayRects(projection, bossEnemy.x, bossEnemy.y, rects, 18);
}

export function stepOverlayFadeAlpha(currentAlpha: number, anyOverlap: boolean): number {
  const targetAlpha = anyOverlap ? 0.30 : 1.0;
  return currentAlpha + (targetAlpha - currentAlpha) * 0.16;
}

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

/**
 * Canonical AoE enemy-family roster (Phase Seven). Single source of family
 * membership, order, and type-id assignment for the three previously
 * independent AoE rosters in rpg-combo-apply.ts and rpg-player-attack-aoe.ts.
 * `eliteEnemies` is intentionally excluded: its type id is computed
 * per-entity from `tier` at each consumer, not a static string.
 */
export const AOE_FAMILY_ROSTER = [
  { key: 'enemies', typeId: 'other' },
  { key: 'sapphireEnemies', typeId: 'sapphire' },
  { key: 'emeraldEnemies', typeId: 'emerald' },
  { key: 'amberEnemies', typeId: 'other' },
  { key: 'voidEnemies', typeId: 'other' },
  { key: 'quartzEnemies', typeId: 'other' },
  { key: 'rubyEnemies', typeId: 'ruby' },
  { key: 'sunstoneEnemies', typeId: 'other' },
  { key: 'citrineEnemies', typeId: 'other' },
  { key: 'ioliteEnemies', typeId: 'other' },
  { key: 'amethystEnemies', typeId: 'other' },
  { key: 'diamondEnemies', typeId: 'other' },
  { key: 'nullstoneEnemies', typeId: 'nullstone' },
  { key: 'fracterylEnemies', typeId: 'fracteryl' },
  { key: 'eigensteinEnemies', typeId: 'eigenstein' },
] as const satisfies readonly { key: keyof RpgEncounterCollections; typeId: string }[];

export type AoeFamilyRosterEntry = typeof AOE_FAMILY_ROSTER[number];
export type AoeFamilyKey = AoeFamilyRosterEntry['key'];

/** Elite enemies participate in all three AoE rosters but keep a dynamic, per-entity type id. */
export const AOE_ELITE_FAMILY_KEY = 'eliteEnemies' as const satisfies keyof RpgEncounterCollections;

/** Minimal structural shape every AoE-roster family member satisfies. */
export interface AoeDamageableEntity {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
}

/**
 * Fixed subset of `AOE_FAMILY_ROSTER` searched by
 * `rpg-render.ts::devApplyStatusCombo()`'s nearest-enemy lookup (Phase Eight).
 * This is intentionally a subset — the dev tool does not search the full
 * 15-family AoE roster, only the 7 families below plus `eliteEnemies`.
 */
const DEV_STATUS_COMBO_FAMILY_KEYS = [
  'enemies', 'rubyEnemies', 'emeraldEnemies', 'sapphireEnemies',
  'nullstoneEnemies', 'fracterylEnemies', 'eigensteinEnemies',
] as const satisfies readonly AoeFamilyKey[];

const DEV_STATUS_COMBO_FAMILY_KEY_SET: ReadonlySet<AoeFamilyKey> = new Set(DEV_STATUS_COMBO_FAMILY_KEYS);

/**
 * Find the nearest live enemy to `mote` across `devApplyStatusCombo()`'s
 * fixed 8-family subset (7 `AOE_FAMILY_ROSTER` families plus `eliteEnemies`),
 * with the live boss enemy taking precedence when it is strictly closer.
 */
export function findDevStatusComboNearestTarget(
  collections: RpgEncounterCollections,
  mote: { x: number; y: number },
  bossEnemy: { x: number; y: number; hp: number } | null,
): object | null {
  let nearest: object | null = null;
  let nearestDist = Infinity;
  for (const { key } of AOE_FAMILY_ROSTER) {
    if (!DEV_STATUS_COMBO_FAMILY_KEY_SET.has(key)) continue;
    for (const e of collections[key]) {
      if (e.hp <= 0) continue;
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d < nearestDist) { nearestDist = d; nearest = e; }
    }
  }
  for (const e of collections[AOE_ELITE_FAMILY_KEY]) {
    if (e.hp <= 0) continue;
    const dx = e.x - mote.x, dy = e.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d < nearestDist) { nearestDist = d; nearest = e; }
  }
  if (bossEnemy && bossEnemy.hp > 0) {
    const dx = bossEnemy.x - mote.x, dy = bossEnemy.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d < nearestDist) { nearest = bossEnemy as unknown as object; }
  }
  return nearest;
}
