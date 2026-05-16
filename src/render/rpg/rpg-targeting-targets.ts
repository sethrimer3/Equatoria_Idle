import type { ClosestTarget, TargetKind, LaserEnemy, SapphireEnemy } from './rpg-types';
import type {
  EmeraldEnemy,
  AmberEnemy,
  VoidEnemy,
  QuartzEnemy,
  RubyEnemy,
  SunstoneEnemy,
  CitrineEnemy,
  IoliteEnemy,
  AmethystEnemy,
  DiamondEnemy,
  NullstoneEnemy,
  FracterylEnemy,
  EigensteinEnemy,
  EliteEnemy,
} from './rpg-enemy-types';
import type { RpgTargetingCtx } from './rpg-targeting-types';

export function collectEnemyBodyTargets(ctx: RpgTargetingCtx): ClosestTarget[] {
  const targets: ClosestTarget[] = [];
  const addTarget = <T extends { x: number; y: number }>(
    kind: TargetKind,
    enemy: T,
    key: keyof ClosestTarget,
  ) => {
    const dx = enemy.x - ctx.mote.x, dy = enemy.y - ctx.mote.y;
    targets.push({ kind, x: enemy.x, y: enemy.y, distSq: dx * dx + dy * dy, [key]: enemy } as ClosestTarget);
  };
  for (const e of ctx.enemies) addTarget('laser', e, 'laser');
  for (const e of ctx.sapphireEnemies) addTarget('sapphire', e, 'sapphire');
  for (const e of ctx.emeraldEnemies) addTarget('emerald', e, 'emerald');
  for (const e of ctx.amberEnemies) addTarget('amber', e, 'amber');
  for (const e of ctx.voidEnemies) addTarget('void', e, 'void');
  for (const e of ctx.quartzEnemies) addTarget('quartz', e, 'quartz');
  for (const e of ctx.rubyEnemies) addTarget('ruby', e, 'ruby');
  for (const e of ctx.sunstoneEnemies) addTarget('sunstone', e, 'sunstone');
  for (const e of ctx.citrineEnemies) addTarget('citrine', e, 'citrine');
  for (const e of ctx.ioliteEnemies) addTarget('iolite', e, 'iolite');
  for (const e of ctx.amethystEnemies) addTarget('amethyst', e, 'amethyst');
  for (const e of ctx.diamondEnemies) addTarget('diamond', e, 'diamond');
  for (const e of ctx.nullstoneEnemies) addTarget('nullstone', e, 'nullstone');
  for (const e of ctx.fracterylEnemies) addTarget('fracteryl', e, 'fracteryl');
  for (const e of ctx.eigensteinEnemies) addTarget('eigenstein', e, 'eigenstein');
  for (const e of ctx.eliteEnemies) addTarget('elite', e, 'elite');
  // Aliven: add each alive particle as an individual target
  for (const group of ctx.alivenGroups) {
    for (const p of group.particles) {
      if (!p.isAlive) continue;
      const dx = p.x - ctx.mote.x, dy = p.y - ctx.mote.y;
      targets.push({ kind: 'aliven_particle', x: p.x, y: p.y, distSq: dx * dx + dy * dy, alivenParticle: p, alivenGroup: group });
    }
  }
  if (ctx.bossEnemy) addTarget('boss', ctx.bossEnemy, 'boss');
  return targets;
}

export function findClosestEnemyFrom(
  ctx: RpgTargetingCtx,
  x: number,
  y: number,
  rangeSq: number,
): ClosestTarget | null {
  let best: ClosestTarget | null = null;
  let bestSq = rangeSq;
  for (const target of collectEnemyBodyTargets(ctx)) {
    const dx = target.x - x, dy = target.y - y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) {
      bestSq = d;
      best = { ...target, distSq: d };
    }
  }
  return best;
}

export function getTargetedEnemy(ctx: RpgTargetingCtx, targetedEnemy: object | null): ClosestTarget | null {
  // Validate existing target is still alive
  if (targetedEnemy) {
    // Check all enemy arrays to see if target still exists
    const isAlive =
      ctx.enemies.includes(targetedEnemy as LaserEnemy) ||
      ctx.sapphireEnemies.includes(targetedEnemy as SapphireEnemy) ||
      ctx.emeraldEnemies.includes(targetedEnemy as EmeraldEnemy) ||
      ctx.amberEnemies.includes(targetedEnemy as AmberEnemy) ||
      ctx.voidEnemies.includes(targetedEnemy as VoidEnemy) ||
      ctx.quartzEnemies.includes(targetedEnemy as QuartzEnemy) ||
      ctx.rubyEnemies.includes(targetedEnemy as RubyEnemy) ||
      ctx.sunstoneEnemies.includes(targetedEnemy as SunstoneEnemy) ||
      ctx.citrineEnemies.includes(targetedEnemy as CitrineEnemy) ||
      ctx.ioliteEnemies.includes(targetedEnemy as IoliteEnemy) ||
      ctx.amethystEnemies.includes(targetedEnemy as AmethystEnemy) ||
      ctx.diamondEnemies.includes(targetedEnemy as DiamondEnemy) ||
      ctx.nullstoneEnemies.includes(targetedEnemy as NullstoneEnemy) ||
      ctx.fracterylEnemies.includes(targetedEnemy as FracterylEnemy) ||
      ctx.eigensteinEnemies.includes(targetedEnemy as EigensteinEnemy) ||
      ctx.eliteEnemies.includes(targetedEnemy as EliteEnemy) ||
      (ctx.bossEnemy === targetedEnemy);

    if (isAlive) {
      // Build a ClosestTarget from the targeted enemy
      const e = targetedEnemy as { x: number; y: number };
      const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
      const distSq = dx * dx + dy * dy;

      if (ctx.enemies.includes(targetedEnemy as LaserEnemy)) {
        return { kind: 'laser', x: e.x, y: e.y, distSq, laser: targetedEnemy as LaserEnemy };
      }
      if (ctx.sapphireEnemies.includes(targetedEnemy as SapphireEnemy)) {
        return { kind: 'sapphire', x: e.x, y: e.y, distSq, sapphire: targetedEnemy as SapphireEnemy };
      }
      if (ctx.emeraldEnemies.includes(targetedEnemy as EmeraldEnemy)) {
        return { kind: 'emerald', x: e.x, y: e.y, distSq, emerald: targetedEnemy as EmeraldEnemy };
      }
      if (ctx.amberEnemies.includes(targetedEnemy as AmberEnemy)) {
        return { kind: 'amber', x: e.x, y: e.y, distSq, amber: targetedEnemy as AmberEnemy };
      }
      if (ctx.voidEnemies.includes(targetedEnemy as VoidEnemy)) {
        return { kind: 'void', x: e.x, y: e.y, distSq, void: targetedEnemy as VoidEnemy };
      }
      if (ctx.quartzEnemies.includes(targetedEnemy as QuartzEnemy)) {
        return { kind: 'quartz', x: e.x, y: e.y, distSq, quartz: targetedEnemy as QuartzEnemy };
      }
      if (ctx.rubyEnemies.includes(targetedEnemy as RubyEnemy)) {
        return { kind: 'ruby', x: e.x, y: e.y, distSq, ruby: targetedEnemy as RubyEnemy };
      }
      if (ctx.sunstoneEnemies.includes(targetedEnemy as SunstoneEnemy)) {
        return { kind: 'sunstone', x: e.x, y: e.y, distSq, sunstone: targetedEnemy as SunstoneEnemy };
      }
      if (ctx.citrineEnemies.includes(targetedEnemy as CitrineEnemy)) {
        return { kind: 'citrine', x: e.x, y: e.y, distSq, citrine: targetedEnemy as CitrineEnemy };
      }
      if (ctx.ioliteEnemies.includes(targetedEnemy as IoliteEnemy)) {
        return { kind: 'iolite', x: e.x, y: e.y, distSq, iolite: targetedEnemy as IoliteEnemy };
      }
      if (ctx.amethystEnemies.includes(targetedEnemy as AmethystEnemy)) {
        return { kind: 'amethyst', x: e.x, y: e.y, distSq, amethyst: targetedEnemy as AmethystEnemy };
      }
      if (ctx.diamondEnemies.includes(targetedEnemy as DiamondEnemy)) {
        return { kind: 'diamond', x: e.x, y: e.y, distSq, diamond: targetedEnemy as DiamondEnemy };
      }
      if (ctx.nullstoneEnemies.includes(targetedEnemy as NullstoneEnemy)) {
        return { kind: 'nullstone', x: e.x, y: e.y, distSq, nullstone: targetedEnemy as NullstoneEnemy };
      }
      if (ctx.fracterylEnemies.includes(targetedEnemy as FracterylEnemy)) {
        return { kind: 'fracteryl', x: e.x, y: e.y, distSq, fracteryl: targetedEnemy as FracterylEnemy };
      }
      if (ctx.eigensteinEnemies.includes(targetedEnemy as EigensteinEnemy)) {
        return { kind: 'eigenstein', x: e.x, y: e.y, distSq, eigenstein: targetedEnemy as EigensteinEnemy };
      }
      if (ctx.eliteEnemies.includes(targetedEnemy as EliteEnemy)) {
        return { kind: 'elite', x: e.x, y: e.y, distSq, elite: targetedEnemy as EliteEnemy };
      }
      if (ctx.bossEnemy === targetedEnemy) {
        return { kind: 'boss', x: e.x, y: e.y, distSq, boss: ctx.bossEnemy };
      }
    }
  }

  // Fallback to closest enemy body from the player.
  return findClosestEnemyFrom(ctx, ctx.mote.x, ctx.mote.y, Infinity);
}
