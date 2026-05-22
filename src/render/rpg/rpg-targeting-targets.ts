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
import type { RpgTargetingCtx, TargetCollectionOptions } from './rpg-targeting-types';
import { hasTopographicTerrainLineOfSight } from './terrain/topographic-terrain';

export function collectEnemyBodyTargets(ctx: RpgTargetingCtx, opts?: TargetCollectionOptions): ClosestTarget[] {
  const requireLos = opts?.requireLineOfSight ?? false;
  const terrain = requireLos ? ctx.getTerrainState() : null;
  const ox = opts?.originX ?? ctx.mote.x;
  const oy = opts?.originY ?? ctx.mote.y;

  const targets: ClosestTarget[] = [];
  const addTarget = <T extends { x: number; y: number }>(
    kind: TargetKind,
    enemy: T,
    key: keyof ClosestTarget,
  ) => {
    if (requireLos && !hasTopographicTerrainLineOfSight(terrain, ox, oy, enemy.x, enemy.y)) return;
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
      if (requireLos && !hasTopographicTerrainLineOfSight(terrain, ox, oy, p.x, p.y)) continue;
      const dx = p.x - ctx.mote.x, dy = p.y - ctx.mote.y;
      targets.push({ kind: 'aliven_particle', x: p.x, y: p.y, distSq: dx * dx + dy * dy, alivenParticle: p, alivenGroup: group });
    }
  }
  if (ctx.bossEnemy) addTarget('boss', ctx.bossEnemy, 'boss');
  // ── Procedural creature enemies ──────────────────────────────────────────────
  for (const e of ctx.dustWispEnemies) addTarget('proc_dustwisp', e, 'dustWisp');
  for (const e of ctx.ribbonWormEnemies) addTarget('proc_ribbonworm', e, 'ribbonWorm');
  for (const e of ctx.lanternMothEnemies) addTarget('proc_lanternmoth', e, 'lanternMoth');
  for (const e of ctx.eyeStalkEnemies) addTarget('proc_eyestalk', e, 'eyeStalk');
  for (const e of ctx.jellyfishEnemies) addTarget('proc_jellyfish', e, 'jellyfish');
  for (const e of ctx.clothGhostEnemies) addTarget('proc_clothghost', e, 'clothGhost');
  for (const e of ctx.plantTurretEnemies) addTarget('proc_plantturret', e, 'plantTurret');
  for (const e of ctx.gearInsectEnemies) addTarget('proc_gearinsect', e, 'gearInsect');
  for (const e of ctx.spiderCrawlerEnemies) addTarget('proc_spidercrawler', e, 'spiderCrawler');
  for (const e of ctx.moteSwarmEnemies) addTarget('proc_moteswarm', e, 'moteSwarm');
  for (const e of ctx.shadowHandEnemies) addTarget('proc_shadowhand', e, 'shadowHand');
  for (const p of ctx.plantProjectiles) {
    if (p.hp <= 0) continue;
    // Plant projectiles are not LOS-filtered (they are already airborne toward the player)
    const dx = p.x - ctx.mote.x, dy = p.y - ctx.mote.y;
    targets.push({ kind: 'proc_plantproj', x: p.x, y: p.y, distSq: dx*dx+dy*dy, plantProj: p });
  }
  // ── Optional: flying projectile bodies ──────────────────────────────────────
  if (opts?.includeProjectiles) {
    for (const m of ctx.sapphireMissiles) {
      const dx = m.x - ctx.mote.x, dy = m.y - ctx.mote.y;
      targets.push({ kind: 'missile', x: m.x, y: m.y, distSq: dx*dx+dy*dy, missile: m });
    }
    for (const s of ctx.amberShards) {
      const dx = s.x - ctx.mote.x, dy = s.y - ctx.mote.y;
      targets.push({ kind: 'ambershard', x: s.x, y: s.y, distSq: dx*dx+dy*dy, ambershard: s });
    }
    for (const s of ctx.quartzSpikes) {
      const dx = s.x - ctx.mote.x, dy = s.y - ctx.mote.y;
      targets.push({ kind: 'quartzspike', x: s.x, y: s.y, distSq: dx*dx+dy*dy, quartzspike: s });
    }
    for (const b of ctx.rubyBolts) {
      const dx = b.x - ctx.mote.x, dy = b.y - ctx.mote.y;
      targets.push({ kind: 'rubybolt', x: b.x, y: b.y, distSq: dx*dx+dy*dy, rubybolt: b });
    }
    for (const b of ctx.citrineBolts) {
      const dx = b.x - ctx.mote.x, dy = b.y - ctx.mote.y;
      targets.push({ kind: 'citrinebolt', x: b.x, y: b.y, distSq: dx*dx+dy*dy, citrinebolt: b });
    }
    for (const s of ctx.amethystShards) {
      const dx = s.x - ctx.mote.x, dy = s.y - ctx.mote.y;
      targets.push({ kind: 'amethystshard', x: s.x, y: s.y, distSq: dx*dx+dy*dy, amethystshard: s });
    }
    for (const s of ctx.diamondShards) {
      const dx = s.x - ctx.mote.x, dy = s.y - ctx.mote.y;
      targets.push({ kind: 'diamondshard', x: s.x, y: s.y, distSq: dx*dx+dy*dy, diamondshard: s });
    }
    for (const t of ctx.voidTendrils) {
      const dx = t.x - ctx.mote.x, dy = t.y - ctx.mote.y;
      targets.push({ kind: 'voidtendril', x: t.x, y: t.y, distSq: dx*dx+dy*dy, voidtendril: t });
    }
    for (const s of ctx.fracterylShards) {
      const dx = s.x - ctx.mote.x, dy = s.y - ctx.mote.y;
      targets.push({ kind: 'fracterylshard', x: s.x, y: s.y, distSq: dx*dx+dy*dy, fracterylshard: s });
    }
  }
  return targets;
}

export function findClosestEnemyFrom(
  ctx: RpgTargetingCtx,
  x: number,
  y: number,
  rangeSq: number,
  opts?: TargetCollectionOptions,
): ClosestTarget | null {
  // When LOS checking, default the origin to the query position (x, y) rather than the player mote.
  const losOpts: TargetCollectionOptions | undefined = opts?.requireLineOfSight
    ? { ...opts, originX: opts.originX ?? x, originY: opts.originY ?? y }
    : opts;

  let best: ClosestTarget | null = null;
  let bestSq = rangeSq;
  for (const target of collectEnemyBodyTargets(ctx, losOpts)) {
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
