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
import {
  LASER_ENEMY_SIZE, SAPPHIRE_ENEMY_SIZE,
} from './rpg-constants';
import {
  EMERALD_ENEMY_SIZE, AMBER_ENEMY_SIZE,
  QUARTZ_ENEMY_SIZE, RUBY_ENEMY_SIZE, SUNSTONE_ENEMY_SIZE,
  CITRINE_ENEMY_SIZE, IOLITE_ENEMY_SIZE, AMETHYST_ENEMY_SIZE,
  DIAMOND_ENEMY_SIZE,
  FRACTERYL_ENEMY_SIZE, EIGENSTEIN_ENEMY_SIZE,
} from './rpg-enemy-constants';
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

  if (enemyTypeId === 'laser') {
    const half = LASER_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - LASER_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - LASER_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist) break;
      attempts++;
    } while (attempts < 20);
    ctx.enemies.push(makeLaserEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'sapphire') {
    const half = SAPPHIRE_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - SAPPHIRE_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - SAPPHIRE_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist) break;
      attempts++;
    } while (attempts < 20);
    ctx.sapphireEnemies.push(makeSapphireEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'emerald') {
    const half = EMERALD_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - EMERALD_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - EMERALD_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist) break;
      attempts++;
    } while (attempts < 20);
    ctx.emeraldEnemies.push(makeEmeraldEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'amber') {
    const half = AMBER_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - AMBER_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - AMBER_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist) break;
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
      if (dx * dx + dy * dy >= minDist * minDist) break;
      attempts++;
    } while (attempts < 20);
    ctx.quartzEnemies.push(makeQuartzEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'ruby') {
    const half = RUBY_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - RUBY_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - RUBY_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist) break;
      attempts++;
    } while (attempts < 20);
    ctx.rubyEnemies.push(makeRubyEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'sunstone') {
    const half = SUNSTONE_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - SUNSTONE_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - SUNSTONE_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist) break;
      attempts++;
    } while (attempts < 20);
    ctx.sunstoneEnemies.push(makeSunstoneEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'citrine') {
    const half = CITRINE_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - CITRINE_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - CITRINE_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist) break;
      attempts++;
    } while (attempts < 20);
    ctx.citrineEnemies.push(makeCitrineEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'iolite') {
    const half = IOLITE_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - IOLITE_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - IOLITE_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist) break;
      attempts++;
    } while (attempts < 20);
    ctx.ioliteEnemies.push(makeIoliteEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'amethyst') {
    const half = AMETHYST_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - AMETHYST_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - AMETHYST_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist) break;
      attempts++;
    } while (attempts < 20);
    ctx.amethystEnemies.push(makeAmethystEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'diamond') {
    const half = DIAMOND_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - DIAMOND_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - DIAMOND_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist) break;
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
      if (dx * dx + dy * dy >= minDist * minDist) break;
      attempts++;
    } while (attempts < 20);
    ctx.fracterylEnemies.push(makeFracterylEnemy(spawnX, spawnY, wn));
  } else if (enemyTypeId === 'eigenstein') {
    const half = EIGENSTEIN_ENEMY_SIZE / 2;
    do {
      spawnX = half + Math.random() * (widthPx  - EIGENSTEIN_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - EIGENSTEIN_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= minDist * minDist) break;
      attempts++;
    } while (attempts < 20);
    ctx.eigensteinEnemies.push(makeEigensteinEnemy(spawnX, spawnY, wn));
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
  }
}
