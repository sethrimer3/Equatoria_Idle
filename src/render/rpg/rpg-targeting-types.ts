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
} from './rpg-procedural-types';
import type { TopographicTerrainState } from './terrain/topographic-terrain';

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
  alivenGroups: AlivenParticleGroup[];
  // ── Procedural creature arrays ──────────────────────────────────────────────
  dustWispEnemies: DustWispEnemy[];
  ribbonWormEnemies: RibbonWormEnemy[];
  lanternMothEnemies: LanternMothEnemy[];
  eyeStalkEnemies: EyeStalkEnemy[];
  jellyfishEnemies: JellyfishEnemy[];
  clothGhostEnemies: ClothGhostEnemy[];
  plantTurretEnemies: PlantTurretEnemy[];
  gearInsectEnemies: GearInsectEnemy[];
  spiderCrawlerEnemies: SpiderCrawlerEnemy[];
  moteSwarmEnemies: MoteSwarmEnemy[];
  shadowHandEnemies: ShadowHandEnemy[];
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
  damageEliteEnemy: (e: EliteEnemy, raw: number, pierce: number) => number;
  damageAlivenParticle: (particle: AlivenParticle, group: AlivenParticleGroup, raw: number) => number;
  damageBossEnemy: (raw: number, pierce: number, fromDiamond?: boolean) => number;
  // ── Procedural creature damage callbacks ──────────────────────────────────
  damageDustWispEnemy: (e: DustWispEnemy, raw: number, pierce: number) => number;
  damageRibbonWormEnemy: (e: RibbonWormEnemy, raw: number, pierce: number) => number;
  damageLanternMothEnemy: (e: LanternMothEnemy, raw: number, pierce: number) => number;
  damageEyeStalkEnemy: (e: EyeStalkEnemy, raw: number, pierce: number) => number;
  damageJellyfishEnemy: (e: JellyfishEnemy, raw: number, pierce: number) => number;
  damageClothGhostEnemy: (e: ClothGhostEnemy, raw: number, pierce: number) => number;
  damagePlantTurretEnemy: (e: PlantTurretEnemy, raw: number, pierce: number) => number;
  damageGearInsectEnemy: (e: GearInsectEnemy, raw: number, pierce: number) => number;
  damageSpiderCrawlerEnemy: (e: SpiderCrawlerEnemy, raw: number, pierce: number) => number;
  damageMoteSwarmEnemy: (e: MoteSwarmEnemy, raw: number, pierce: number) => number;
  damageShadowHandEnemy: (e: ShadowHandEnemy, raw: number, pierce: number) => number;
  damagePlantProjectile: (p: PlantProjectile, raw: number) => number;
  /** Returns the current topographic terrain state, or null if none is active. */
  getTerrainState(): TopographicTerrainState | null;
}

export interface RpgTargetingHandle {
  findClosestTarget(rangeSq: number): ClosestTarget | null;
  findClosestEnemy(rangeSq: number): LaserEnemy | SapphireEnemy | EmeraldEnemy | AmberEnemy | VoidEnemy
    | QuartzEnemy | RubyEnemy | SunstoneEnemy | CitrineEnemy | IoliteEnemy | AmethystEnemy | DiamondEnemy
    | NullstoneEnemy | FracterylEnemy | EigensteinEnemy | EliteEnemy | BossEnemy
    | DustWispEnemy | RibbonWormEnemy | LanternMothEnemy | EyeStalkEnemy
    | JellyfishEnemy | ClothGhostEnemy | PlantTurretEnemy | GearInsectEnemy
    | SpiderCrawlerEnemy | MoteSwarmEnemy | ShadowHandEnemy | null;
  collectEnemyBodyTargets(): ClosestTarget[];
  findClosestEnemyFrom(x: number, y: number, rangeSq: number): ClosestTarget | null;
  getTargetedEnemy(): ClosestTarget | null;
  tryTargetEnemyAt(tapX: number, tapY: number): void;
  damageBodyTarget(target: ClosestTarget, rawDamage: number, defPierceRatio: number, bypassShield: boolean): number;
}
