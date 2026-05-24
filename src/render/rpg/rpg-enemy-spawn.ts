/**
 * rpg-enemy-spawn.ts — Enemy placement logic for the RPG tab.
 *
 * Contains `spawnEnemyById`, which places a single enemy of the given type at
 * a valid random position on the canvas.  Extracted from rpg-wave-manager.ts
 * to keep that module focused on wave lifecycle (XP/kill sweeping, queue
 * ticking, inter-wave timing) rather than spawn positioning.
 *
 * Usage:
 *   import { spawnEnemyById } from './rpg-enemy-spawn';
 *   spawnEnemyById(ctx, enemyTypeId);
 */

import type { LaserEnemy, SapphireEnemy } from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy,
  VoidEnemy, QuartzEnemy,
  RubyEnemy, SunstoneEnemy, CitrineEnemy,
  IoliteEnemy, AmethystEnemy, DiamondEnemy,
  NullstoneEnemy, FracterylEnemy, EigensteinEnemy,
  BossEnemy, EliteEnemy, EliteTier,
} from './rpg-enemy-types';
import type {
  DustWispEnemy, RibbonWormEnemy, LanternMothEnemy, EyeStalkEnemy,
  JellyfishEnemy, ClothGhostEnemy, PlantTurretEnemy, GearInsectEnemy,
  SpiderCrawlerEnemy, MoteSwarmEnemy, ShadowHandEnemy,
  SandFishEnemy, QuartzFishEnemy, RubyFishEnemy, SunstoneFishEnemy,
  EmeraldFishEnemy, SapphireFishEnemy, AmethystFishEnemy, DiamondFishEnemy,
} from './rpg-procedural-types';
import {
  LASER_ENEMY_SIZE, SAPPHIRE_ENEMY_SIZE,
} from './rpg-constants';
import {
  EMERALD_ENEMY_SIZE, AMBER_ENEMY_SIZE,
  QUARTZ_ENEMY_SIZE, RUBY_ENEMY_SIZE, SUNSTONE_ENEMY_SIZE,
  CITRINE_ENEMY_SIZE, IOLITE_ENEMY_SIZE, AMETHYST_ENEMY_SIZE,
  DIAMOND_ENEMY_SIZE,
  FRACTERYL_ENEMY_SIZE, EIGENSTEIN_ENEMY_SIZE,
  STARDUST_SIZE,
} from './rpg-enemy-constants';
import {
  DUSTWISP_SIZE, RIBBONWORM_SIZE, LANTERNMOTH_SIZE, EYESTALK_SIZE,
  JELLYFISH_SIZE, CLOTHGHOST_SIZE, PLANTTURRET_SIZE, GEARINSECT_SIZE,
  SPIDERCRAWLER_SIZE, MOTESWARM_SIZE, SHADOWHAND_SIZE,
  SANDFISH_SIZE, QUARTZFISH_SIZE, RUBYFISH_SIZE, SUNSTONEFISH_SIZE,
  EMERALDFISH_SIZE, SAPPHIREFISH_SIZE, AMETHYSTFISH_SIZE, DIAMONDFISH_SIZE,
} from './rpg-procedural-constants';
import {
  makeLaserEnemy, makeSapphireEnemy,
  makeEmeraldEnemy, makeAmberEnemy, makeVoidEnemy,
  makeQuartzEnemy, makeRubyEnemy,
  makeSunstoneEnemy, makeCitrineEnemy, makeIoliteEnemy,
  makeAmethystEnemy, makeDiamondEnemy,
  makeNullstoneEnemy,
  makeFracterylEnemy,
  makeEigensteinEnemy, makeBossEnemy,
  makeEliteEnemy,
} from './rpg-factories';
import { makeStardustEnemy } from './rpg-stardust-factories';
import {
  makeDustWispEnemy, makeRibbonWormEnemy, makeLanternMothEnemy, makeEyeStalkEnemy,
  makeJellyfishEnemy, makeClothGhostEnemy, makePlantTurretEnemy, makeGearInsectEnemy,
  makeSpiderCrawlerEnemy, makeMoteSwarmEnemy, makeShadowHandEnemy,
  makeSandFishEnemy, makeQuartzFishEnemy, makeRubyFishEnemy, makeSunstoneFishEnemy,
  makeEmeraldFishEnemy, makeSapphireFishEnemy, makeAmethystFishEnemy, makeDiamondFishEnemy,
} from './rpg-procedural-factories';
import { makeAlivenGroup } from './rpg-aliven-factories';
import { ALIVEN_VARIANTS, MAX_ACTIVE_ALIVEN_GROUPS } from './rpg-aliven-constants';
import {
  recordAlivenSpawn,
  recordAlivenCapSkip,
} from '../../dev/session-telemetry';
import {
  isPointInsideTopographicTerrain,
  type TopographicTerrainState,
} from './terrain/topographic-terrain';

// ── Dependency-injection context ──────────────────────────────────────────────

/**
 * Minimal context required by `spawnEnemyById`.
 * `WaveManagerCtx` (rpg-wave-manager.ts) is a structural superset of this
 * interface, so it can be passed directly.
 */
export interface EnemySpawnCtx {
  dim: { w: number; h: number };
  mote: { x: number; y: number };
  getCurrentWave(): number;
  setBossEnemy(boss: BossEnemy | null): void;
  enterBossWave(): void;
  /** Returns the current topographic terrain state, or null if none is active. */
  getTopographicTerrainState(): TopographicTerrainState | null;

  // Enemy body arrays that receive newly spawned entities
  enemies: LaserEnemy[];
  sapphireEnemies: SapphireEnemy[];
  emeraldEnemies: EmeraldEnemy[];
  amberEnemies: AmberEnemy[];
  voidEnemies: VoidEnemy[];
  quartzEnemies: QuartzEnemy[];
  rubyEnemies: RubyEnemy[];
  sunstoneEnemies: SunstoneEnemy[];
  citrineEnemies: CitrineEnemy[];
  ioliteEnemies: IoliteEnemy[];
  amethystEnemies: AmethystEnemy[];
  diamondEnemies: DiamondEnemy[];
  nullstoneEnemies: NullstoneEnemy[];
  fracterylEnemies: FracterylEnemy[];
  eigensteinEnemies: EigensteinEnemy[];
  eliteEnemies: EliteEnemy[];
  alivenGroups: import('./rpg-aliven-types').AlivenParticleGroup[];
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
  sandFishEnemies: SandFishEnemy[];
  quartzFishEnemies: QuartzFishEnemy[];
  rubyFishEnemies: RubyFishEnemy[];
  sunstoneFishEnemies: SunstoneFishEnemy[];
  emeraldFishEnemies: EmeraldFishEnemy[];
  sapphireFishEnemies: SapphireFishEnemy[];
  amethystFishEnemies: AmethystFishEnemy[];
  diamondFishEnemies: DiamondFishEnemy[];
  stardustEnemies: import('./rpg-enemy-types').StardustEnemy[];
}

// ── Spawn helper ──────────────────────────────────────────────────────────────

/**
 * Places a single enemy of the given `enemyTypeId` at a valid random position
 * on the canvas, then pushes it to the appropriate array on `ctx`.
 *
 * Void-type and Nullstone enemies spawn at canvas edges (so they approach from
 * a distance); all others use rejection sampling to avoid spawning on top of
 * the player mote.
 */
export function spawnEnemyById(ctx: EnemySpawnCtx, enemyTypeId: string): void {
  const { dim, mote } = ctx;
  const widthPx  = dim.w;
  const heightPx = dim.h;
  const minDist  = 80;
  let spawnX = 0, spawnY = 0, attempts = 0;
  const wn = ctx.getCurrentWave();
  const terrain = ctx.getTopographicTerrainState();

  if (enemyTypeId === 'laser') {
    const half = LASER_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - LASER_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - LASER_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    ctx.enemies.push(makeLaserEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'sapphire') {
    const half = SAPPHIRE_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - SAPPHIRE_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - SAPPHIRE_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    ctx.sapphireEnemies.push(makeSapphireEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'emerald') {
    const half = EMERALD_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - EMERALD_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - EMERALD_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    ctx.emeraldEnemies.push(makeEmeraldEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'amber') {
    const half = AMBER_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - AMBER_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - AMBER_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    ctx.amberEnemies.push(makeAmberEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'void') {
    // Void enemies spawn at edges so they approach from a distance.
    const edge = Math.floor(Math.random() * 4);
    if      (edge === 0) { spawnX = Math.random() * widthPx;  spawnY = 0; }
    else if (edge === 1) { spawnX = Math.random() * widthPx;  spawnY = heightPx; }
    else if (edge === 2) { spawnX = 0;        spawnY = Math.random() * heightPx; }
    else                 { spawnX = widthPx;  spawnY = Math.random() * heightPx; }
    ctx.voidEnemies.push(makeVoidEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'quartz') {
    const half = QUARTZ_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - QUARTZ_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - QUARTZ_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    ctx.quartzEnemies.push(makeQuartzEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'ruby') {
    const half = RUBY_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - RUBY_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - RUBY_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    ctx.rubyEnemies.push(makeRubyEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'sunstone') {
    const half = SUNSTONE_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - SUNSTONE_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - SUNSTONE_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    ctx.sunstoneEnemies.push(makeSunstoneEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'citrine') {
    const half = CITRINE_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - CITRINE_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - CITRINE_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    ctx.citrineEnemies.push(makeCitrineEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'iolite') {
    const half = IOLITE_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - IOLITE_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - IOLITE_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    ctx.ioliteEnemies.push(makeIoliteEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'amethyst') {
    const half = AMETHYST_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - AMETHYST_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - AMETHYST_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    ctx.amethystEnemies.push(makeAmethystEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'diamond') {
    const half = DIAMOND_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - DIAMOND_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - DIAMOND_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    ctx.diamondEnemies.push(makeDiamondEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'nullstone') {
    // Nullstone spawns at edges to approach from a distance.
    const edge = Math.floor(Math.random() * 4);
    if      (edge === 0) { spawnX = Math.random() * widthPx;  spawnY = 0; }
    else if (edge === 1) { spawnX = Math.random() * widthPx;  spawnY = heightPx; }
    else if (edge === 2) { spawnX = 0;       spawnY = Math.random() * heightPx; }
    else                 { spawnX = widthPx; spawnY = Math.random() * heightPx; }
    ctx.nullstoneEnemies.push(makeNullstoneEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'fracteryl') {
    const half = FRACTERYL_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - FRACTERYL_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - FRACTERYL_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    ctx.fracterylEnemies.push(makeFracterylEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'eigenstein') {
    const half = EIGENSTEIN_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - EIGENSTEIN_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - EIGENSTEIN_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    ctx.eigensteinEnemies.push(makeEigensteinEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'stardust') {
    const half = STARDUST_SIZE;
    do {
      spawnX = half + Math.random() * (widthPx - STARDUST_SIZE * 2);
      spawnY = half + Math.random() * (heightPx - STARDUST_SIZE * 2);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist
          && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))) break;
      attempts++;
    } while (attempts < 20);
    ctx.stardustEnemies.push(makeStardustEnemy(spawnX, spawnY, wn, widthPx, heightPx));
  } else if (enemyTypeId === 'boss') {
    ctx.setBossEnemy(makeBossEnemy(Math.ceil(wn / 100), wn, widthPx, heightPx));
    ctx.enterBossWave();
  } else if (
    enemyTypeId === 'elite_quartz' || enemyTypeId === 'elite_ruby'   ||
    enemyTypeId === 'elite_sunstone' || enemyTypeId === 'elite_citrine' ||
    enemyTypeId === 'elite_iolite'  || enemyTypeId === 'elite_amethyst' ||
    enemyTypeId === 'elite_diamond' || enemyTypeId === 'elite_nullstone'
  ) {
    // Elite enemies spawn at canvas edges so the player sees them approaching.
    const tier = enemyTypeId.slice(6) as EliteTier; // strip "elite_"
    const edge = Math.floor(Math.random() * 4);
    if      (edge === 0) { spawnX = Math.random() * widthPx;  spawnY = 0; }
    else if (edge === 1) { spawnX = Math.random() * widthPx;  spawnY = heightPx; }
    else if (edge === 2) { spawnX = 0;        spawnY = Math.random() * heightPx; }
    else                 { spawnX = widthPx;  spawnY = Math.random() * heightPx; }
    ctx.eliteEnemies.push(makeEliteEnemy(tier, spawnX, spawnY, wn));
  } else if (ALIVEN_VARIANTS.includes(enemyTypeId as typeof ALIVEN_VARIANTS[number])) {
    // Guard: skip spawning if the active group count is at the cap.
    if (ctx.alivenGroups.length >= MAX_ACTIVE_ALIVEN_GROUPS) {
      recordAlivenCapSkip();
      return;
    }
    // Aliven particle groups spawn near the edge, away from the player.
    const margin = 30;
    const edge = Math.floor(Math.random() * 4);
    if      (edge === 0) { spawnX = margin + Math.random() * (widthPx  - margin * 2); spawnY = margin; }
    else if (edge === 1) { spawnX = margin + Math.random() * (widthPx  - margin * 2); spawnY = heightPx - margin; }
    else if (edge === 2) { spawnX = margin; spawnY = margin + Math.random() * (heightPx - margin * 2); }
    else                 { spawnX = widthPx - margin; spawnY = margin + Math.random() * (heightPx - margin * 2); }
    ctx.alivenGroups.push(makeAlivenGroup(
      enemyTypeId as typeof ALIVEN_VARIANTS[number],
      spawnX, spawnY, wn,
    ));
    recordAlivenSpawn(enemyTypeId, ctx.alivenGroups.length);
  } else {
    // ── Procedural creature spawns ────────────────────────────────
    const procSizeMap: Record<string, number> = {
      'proc_dustwisp': DUSTWISP_SIZE, 'proc_ribbonworm': RIBBONWORM_SIZE,
      'proc_lanternmoth': LANTERNMOTH_SIZE, 'proc_eyestalk': EYESTALK_SIZE,
      'proc_jellyfish': JELLYFISH_SIZE, 'proc_clothghost': CLOTHGHOST_SIZE,
      'proc_plantturret': PLANTTURRET_SIZE, 'proc_gearinsect': GEARINSECT_SIZE,
      'proc_spidercrawler': SPIDERCRAWLER_SIZE, 'proc_moteswarm': MOTESWARM_SIZE,
      'proc_shadowhand': SHADOWHAND_SIZE,
      'proc_sandfish': SANDFISH_SIZE, 'proc_quartzfish': QUARTZFISH_SIZE,
      'proc_rubyfish': RUBYFISH_SIZE, 'proc_sunstonefish': SUNSTONEFISH_SIZE,
      'proc_emeraldfish': EMERALDFISH_SIZE, 'proc_sapphirefish': SAPPHIREFISH_SIZE,
      'proc_amethystfish': AMETHYSTFISH_SIZE, 'proc_diamondfish': DIAMONDFISH_SIZE,
    };
    const procSize = procSizeMap[enemyTypeId];
    if (procSize !== undefined) {
      const half = procSize;
      do {
        spawnX = half + Math.random() * (widthPx  - procSize * 2);
        spawnY = half + Math.random() * (heightPx - procSize * 2);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist
            && !(terrain && isPointInsideTopographicTerrain(terrain, spawnX, spawnY))) break;
        attempts++;
      } while (attempts < 20);
      if (enemyTypeId === 'proc_dustwisp')      ctx.dustWispEnemies.push(makeDustWispEnemy(spawnX, spawnY, wn));
      else if (enemyTypeId === 'proc_ribbonworm')  ctx.ribbonWormEnemies.push(makeRibbonWormEnemy(spawnX, spawnY, wn));
      else if (enemyTypeId === 'proc_lanternmoth') ctx.lanternMothEnemies.push(makeLanternMothEnemy(spawnX, spawnY, wn));
      else if (enemyTypeId === 'proc_eyestalk')    ctx.eyeStalkEnemies.push(makeEyeStalkEnemy(spawnX, spawnY, wn));
      else if (enemyTypeId === 'proc_jellyfish')   ctx.jellyfishEnemies.push(makeJellyfishEnemy(spawnX, spawnY, wn));
      else if (enemyTypeId === 'proc_clothghost')  ctx.clothGhostEnemies.push(makeClothGhostEnemy(spawnX, spawnY, wn));
      else if (enemyTypeId === 'proc_plantturret') ctx.plantTurretEnemies.push(makePlantTurretEnemy(spawnX, spawnY, wn));
      else if (enemyTypeId === 'proc_gearinsect')  ctx.gearInsectEnemies.push(makeGearInsectEnemy(spawnX, spawnY, wn));
      else if (enemyTypeId === 'proc_spidercrawler') ctx.spiderCrawlerEnemies.push(makeSpiderCrawlerEnemy(spawnX, spawnY, wn));
      else if (enemyTypeId === 'proc_moteswarm')   ctx.moteSwarmEnemies.push(makeMoteSwarmEnemy(spawnX, spawnY, wn));
      else if (enemyTypeId === 'proc_shadowhand')  ctx.shadowHandEnemies.push(makeShadowHandEnemy(spawnX, spawnY, wn));
      else if (enemyTypeId === 'proc_sandfish') ctx.sandFishEnemies.push(makeSandFishEnemy(spawnX, spawnY, wn));
      else if (enemyTypeId === 'proc_quartzfish') ctx.quartzFishEnemies.push(makeQuartzFishEnemy(spawnX, spawnY, wn));
      else if (enemyTypeId === 'proc_rubyfish') ctx.rubyFishEnemies.push(makeRubyFishEnemy(spawnX, spawnY, wn));
      else if (enemyTypeId === 'proc_sunstonefish') ctx.sunstoneFishEnemies.push(makeSunstoneFishEnemy(spawnX, spawnY, wn));
      else if (enemyTypeId === 'proc_emeraldfish') ctx.emeraldFishEnemies.push(makeEmeraldFishEnemy(spawnX, spawnY, wn));
      else if (enemyTypeId === 'proc_sapphirefish') ctx.sapphireFishEnemies.push(makeSapphireFishEnemy(spawnX, spawnY, wn));
      else if (enemyTypeId === 'proc_amethystfish') ctx.amethystFishEnemies.push(makeAmethystFishEnemy(spawnX, spawnY, wn));
      else if (enemyTypeId === 'proc_diamondfish') ctx.diamondFishEnemies.push(makeDiamondFishEnemy(spawnX, spawnY, wn));
    }
  }
}
