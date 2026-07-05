import type { AlivenParticle, AlivenParticleGroup } from './rpg-aliven-types';
import type {
  BossEnemy,
  EliteEnemy,
  EmeraldEnemy,
  AmberEnemy,
  AmberShard,
  VoidEnemy,
  QuartzEnemy,
  QuartzSpike,
  RubyEnemy,
  RubyBolt,
  SunstoneEnemy,
  CitrineEnemy,
  CitrineBolt,
  IoliteEnemy,
  AmethystEnemy,
  AmethystShard,
  DiamondEnemy,
  DiamondShard,
  NullstoneEnemy,
  VoidTendril,
  FracterylEnemy,
  FracterylShard,
  EigensteinEnemy,
} from './rpg-enemy-types';
import type { ClosestTarget, LaserEnemy, SapphireEnemy, SapphireMissile } from './rpg-types';
import type {
  DustWispEnemy, RibbonWormEnemy, LanternMothEnemy, EyeStalkEnemy,
  JellyfishEnemy, ClothGhostEnemy, PlantTurretEnemy, GearInsectEnemy,
  SpiderCrawlerEnemy, MoteSwarmEnemy, ShadowHandEnemy, PlantProjectile,
  SandFishEnemy, QuartzFishEnemy, RubyFishEnemy, SunstoneFishEnemy,
  EmeraldFishEnemy, SapphireFishEnemy, AmethystFishEnemy, DiamondFishEnemy,
} from './rpg-procedural-types';
import type { EliteJellyfishEnemy } from './rpg-jellyfish-elite-types';
import type { TopographicTerrainState } from './terrain/topographic-terrain';
import type { BinaryRingEnemy } from './rpg-binary-ring-encounter';
import type { NadirCubePointEnemy } from './nadir-cube-point-types';
import type { HorizonPentagonGroup } from './horizon-pentagon-types';
import type {
  PolyominoEnemy, FissilePolyominoEnemy, RefractorPolyominoEnemy,
} from './polyomino-enemy-types';

export interface RpgTargetingCtx {
  mote: { x: number; y: number };
  readonly bossEnemy: BossEnemy | null;
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
  eliteEnemies: EliteEnemy[];
  polyominoEnemies: PolyominoEnemy[];
  fissilePolyominoEnemies: FissilePolyominoEnemy[];
  refractorPolyominoEnemies: RefractorPolyominoEnemy[];
  binaryRingEnemies: BinaryRingEnemy[];
  stardustEnemies: import('./rpg-enemy-types').StardustEnemy[];
  alivenGroups: AlivenParticleGroup[];
  lifeColonies: import('./life-types').LifeColonyController[];
  // ── Procedural creature arrays ──────────────────────────────────────────────
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
  damageEnemy: (e: LaserEnemy, raw: number, pierce: number) => number;
  damageSapphireEnemy: (e: SapphireEnemy, raw: number, pierce: number, bypass: boolean) => number;
  damageMissile: (m: SapphireMissile, raw: number, pierce: number) => number;
  damageEmeraldEnemy: (e: EmeraldEnemy, raw: number, pierce: number) => number;
  damageAmberEnemy: (e: AmberEnemy, raw: number, pierce: number) => number;
  damageAmberShard: (s: AmberShard, raw: number, pierce: number) => number;
  damageVoidEnemy: (e: VoidEnemy, raw: number, pierce: number) => number;
  damageQuartzEnemy: (e: QuartzEnemy, raw: number, pierce: number) => number;
  damageQuartzSpike: (s: QuartzSpike, raw: number, pierce: number) => number;
  damageRubyEnemy: (e: RubyEnemy, raw: number, pierce: number) => number;
  damageRubyBolt: (b: RubyBolt, raw: number, pierce: number) => number;
  damageSunstoneEnemy: (e: SunstoneEnemy, raw: number, pierce: number) => number;
  damageCitrineEnemy: (e: CitrineEnemy, raw: number, pierce: number) => number;
  damageCitrineBolt: (b: CitrineBolt, raw: number, pierce: number) => number;
  damageIoliteEnemy: (e: IoliteEnemy, raw: number, pierce: number) => number;
  damageAmethystEnemy: (e: AmethystEnemy, raw: number, pierce: number, bypass: boolean) => number;
  damageAmethystShard: (s: AmethystShard, raw: number, pierce: number) => number;
  damageDiamondEnemy: (e: DiamondEnemy, raw: number, pierce: number) => number;
  damageDiamondShard: (s: DiamondShard, raw: number, pierce: number) => number;
  damageNullstoneEnemy: (e: NullstoneEnemy, raw: number, pierce: number) => number;
  damageVoidTendril: (t: VoidTendril, raw: number, pierce: number) => number;
  damageFracterylEnemy: (e: FracterylEnemy, raw: number, pierce: number) => number;
  damageFracterylShard: (s: FracterylShard, raw: number, pierce: number) => number;
  damageEigensteinEnemy: (e: EigensteinEnemy, raw: number, pierce: number) => number;
  damagePolyominoEnemy: (e: PolyominoEnemy, raw: number, pierce: number) => number;
  damageFissilePolyominoEnemy: (e: FissilePolyominoEnemy, raw: number, pierce: number) => number;
  damageRefractorPolyominoEnemy: (e: RefractorPolyominoEnemy, raw: number, pierce: number) => number;
  damageBinaryRingEnemy: (e: BinaryRingEnemy, raw: number, pierce: number) => number;
  damageEliteEnemy: (e: EliteEnemy, raw: number, pierce: number) => number;
  damageAlivenParticle: (particle: AlivenParticle, group: AlivenParticleGroup, raw: number) => number;
  damageLifeCell: (cell: import('./life-types').LifeCellEntity, raw: number) => number;
  damageLifeCore: (colony: import('./life-types').LifeColonyController, raw: number) => number;
  damageBossEnemy: (raw: number, pierce: number, fromDiamond?: boolean) => number;
  // ── Procedural creature damage callbacks ──────────────────────────────────
  damageDustWispEnemy: (e: DustWispEnemy, raw: number, pierce: number) => number;
  damageRibbonWormEnemy: (e: RibbonWormEnemy, raw: number, pierce: number) => number;
  damageLanternMothEnemy: (e: LanternMothEnemy, raw: number, pierce: number) => number;
  damageEyeStalkEnemy: (e: EyeStalkEnemy, raw: number, pierce: number) => number;
  damageJellyfishEnemy: (e: JellyfishEnemy, raw: number, pierce: number) => number;
  damageEliteJellyfishEnemy: (e: EliteJellyfishEnemy, raw: number, pierce: number) => number;
  damageClothGhostEnemy: (e: ClothGhostEnemy, raw: number, pierce: number) => number;
  damagePlantTurretEnemy: (e: PlantTurretEnemy, raw: number, pierce: number) => number;
  damageGearInsectEnemy: (e: GearInsectEnemy, raw: number, pierce: number) => number;
  damageSpiderCrawlerEnemy: (e: SpiderCrawlerEnemy, raw: number, pierce: number) => number;
  damageMoteSwarmEnemy: (e: MoteSwarmEnemy, raw: number, pierce: number) => number;
  damageShadowHandEnemy: (e: ShadowHandEnemy, raw: number, pierce: number) => number;
  damageSandFishEnemy: (e: SandFishEnemy, raw: number, pierce: number) => number;
  damageQuartzFishEnemy: (e: QuartzFishEnemy, raw: number, pierce: number, bypassShield: boolean) => number;
  damageRubyFishEnemy: (e: RubyFishEnemy, raw: number, pierce: number) => number;
  damageSunstoneFishEnemy: (e: SunstoneFishEnemy, raw: number, pierce: number) => number;
  damageEmeraldFishEnemy: (e: EmeraldFishEnemy, raw: number, pierce: number) => number;
  damageSapphireFishEnemy: (e: SapphireFishEnemy, raw: number, pierce: number) => number;
  damageAmethystFishEnemy: (e: AmethystFishEnemy, raw: number, pierce: number) => number;
  damageDiamondFishEnemy: (e: DiamondFishEnemy, raw: number, pierce: number) => number;
  damagePlantProjectile: (p: PlantProjectile, raw: number) => number;
  /** Verdure zone plant array — empty when not in Verdure zone. */
  verdurePlants: import('./terrain/rpg-verdure-growth').VerdurePlant[];
  /** Applies damage to a Verdure plant environmental hazard. */
  damageVerdurePlant: (plant: import('./terrain/rpg-verdure-growth').VerdurePlant, raw: number) => number;
  nadirCubePointEnemies: NadirCubePointEnemy[];
  damageNadirCubePointEnemy: (e: NadirCubePointEnemy, raw: number, pierce: number) => number;
  horizonPentagonGroups: import('./horizon-pentagon-types').HorizonPentagonGroup[];
  damageHorizonPentagonReal: (g: import('./horizon-pentagon-types').HorizonPentagonGroup, raw: number, pierce: number) => number;
  damageHorizonMissile: (m: import('./horizon-pentagon-types').HorizonMissile, raw: number, pierce: number) => number;
  /** Returns the current topographic terrain state, or null if none is active. */
  getTerrainState(): TopographicTerrainState | null;
}

/**
 * Options for `collectEnemyBodyTargets` and `findClosestEnemyFrom`.
 *
 * All fields are optional — omitting an option keeps the existing behaviour
 * (no LOS check, projectile bodies excluded).
 */
export interface TargetCollectionOptions {
  /** Origin for LOS check (defaults to player mote position for collectEnemyBodyTargets,
   *  or to the query (x, y) position for findClosestEnemyFrom). */
  originX?: number;
  originY?: number;
  /** When true, excludes targets whose origin-to-target line is blocked by terrain. */
  requireLineOfSight?: boolean;
  /** When true, also includes flying projectiles (bolts, spikes, shards, missiles, tendrils). */
  includeProjectiles?: boolean;
}

export interface RpgTargetingHandle {
  findClosestTarget(rangeSq: number): ClosestTarget | null;
  findClosestEnemy(rangeSq: number): LaserEnemy | SapphireEnemy | EmeraldEnemy | AmberEnemy | VoidEnemy
    | QuartzEnemy | RubyEnemy | SunstoneEnemy | CitrineEnemy | IoliteEnemy | AmethystEnemy | DiamondEnemy
    | NullstoneEnemy | FracterylEnemy | EigensteinEnemy | PolyominoEnemy | FissilePolyominoEnemy | RefractorPolyominoEnemy
    | BinaryRingEnemy | EliteEnemy | BossEnemy
    | DustWispEnemy | RibbonWormEnemy | LanternMothEnemy | EyeStalkEnemy
    | JellyfishEnemy | ClothGhostEnemy | PlantTurretEnemy | GearInsectEnemy
    | SpiderCrawlerEnemy | MoteSwarmEnemy | ShadowHandEnemy
    | SandFishEnemy | QuartzFishEnemy | RubyFishEnemy | SunstoneFishEnemy
    | EmeraldFishEnemy | SapphireFishEnemy | AmethystFishEnemy | DiamondFishEnemy
    | NadirCubePointEnemy | HorizonPentagonGroup | null;
  collectEnemyBodyTargets(opts?: TargetCollectionOptions): ClosestTarget[];
  findClosestEnemyFrom(x: number, y: number, rangeSq: number, opts?: TargetCollectionOptions): ClosestTarget | null;
  getTargetedEnemy(): ClosestTarget | null;
  getManualTargetedEnemy(): ClosestTarget | null;
  clearTargetedEnemy(): void;
  tryTargetEnemyAt(tapX: number, tapY: number): void;
  damageBodyTarget(target: ClosestTarget, rawDamage: number, defPierceRatio: number, bypassShield: boolean): number;
}
