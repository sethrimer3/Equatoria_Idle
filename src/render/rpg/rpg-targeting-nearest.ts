import type { ClosestTarget, LaserEnemy, SapphireEnemy } from './rpg-types';
import type {
  BossEnemy,
  EliteEnemy,
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
} from './rpg-enemy-types';
import type { RpgTargetingCtx } from './rpg-targeting-types';
import type {
  DustWispEnemy, RibbonWormEnemy, LanternMothEnemy, EyeStalkEnemy,
  JellyfishEnemy, ClothGhostEnemy, PlantTurretEnemy, GearInsectEnemy,
  SpiderCrawlerEnemy, MoteSwarmEnemy, ShadowHandEnemy,
} from './rpg-procedural-types';

export function findClosestTarget(ctx: RpgTargetingCtx, rangeSq: number): ClosestTarget | null {
  let best: ClosestTarget | null = null;
  let bestSq = rangeSq;

  for (const e of ctx.enemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'laser', x: e.x, y: e.y, distSq: d, laser: e }; }
  }
  for (const e of ctx.sapphireEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'sapphire', x: e.x, y: e.y, distSq: d, sapphire: e }; }
  }
  for (const m of ctx.sapphireMissiles) {
    const dx = m.x - ctx.mote.x, dy = m.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'missile', x: m.x, y: m.y, distSq: d, missile: m }; }
  }
  for (const e of ctx.emeraldEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'emerald', x: e.x, y: e.y, distSq: d, emerald: e }; }
  }
  for (const e of ctx.amberEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'amber', x: e.x, y: e.y, distSq: d, amber: e }; }
  }
  for (const s of ctx.amberShards) {
    const dx = s.x - ctx.mote.x, dy = s.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'ambershard', x: s.x, y: s.y, distSq: d, ambershard: s }; }
  }
  for (const e of ctx.voidEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'void', x: e.x, y: e.y, distSq: d, void: e }; }
  }
  for (const e of ctx.quartzEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'quartz', x: e.x, y: e.y, distSq: d, quartz: e }; }
  }
  for (const s of ctx.quartzSpikes) {
    const dx = s.x - ctx.mote.x, dy = s.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'quartzspike', x: s.x, y: s.y, distSq: d, quartzspike: s }; }
  }
  for (const e of ctx.rubyEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'ruby', x: e.x, y: e.y, distSq: d, ruby: e }; }
  }
  for (const b of ctx.rubyBolts) {
    const dx = b.x - ctx.mote.x, dy = b.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'rubybolt', x: b.x, y: b.y, distSq: d, rubybolt: b }; }
  }
  for (const e of ctx.sunstoneEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'sunstone', x: e.x, y: e.y, distSq: d, sunstone: e }; }
  }
  for (const e of ctx.citrineEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'citrine', x: e.x, y: e.y, distSq: d, citrine: e }; }
  }
  for (const b of ctx.citrineBolts) {
    const dx = b.x - ctx.mote.x, dy = b.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'citrinebolt', x: b.x, y: b.y, distSq: d, citrinebolt: b }; }
  }
  for (const e of ctx.ioliteEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'iolite', x: e.x, y: e.y, distSq: d, iolite: e }; }
  }
  for (const e of ctx.amethystEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'amethyst', x: e.x, y: e.y, distSq: d, amethyst: e }; }
  }
  for (const s of ctx.amethystShards) {
    const dx = s.x - ctx.mote.x, dy = s.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'amethystshard', x: s.x, y: s.y, distSq: d, amethystshard: s }; }
  }
  for (const e of ctx.diamondEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'diamond', x: e.x, y: e.y, distSq: d, diamond: e }; }
  }
  for (const s of ctx.diamondShards) {
    const dx = s.x - ctx.mote.x, dy = s.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'diamondshard', x: s.x, y: s.y, distSq: d, diamondshard: s }; }
  }
  for (const e of ctx.nullstoneEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'nullstone', x: e.x, y: e.y, distSq: d, nullstone: e }; }
  }
  for (const t of ctx.voidTendrils) {
    const dx = t.x - ctx.mote.x, dy = t.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'voidtendril', x: t.x, y: t.y, distSq: d, voidtendril: t }; }
  }
  for (const e of ctx.fracterylEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'fracteryl', x: e.x, y: e.y, distSq: d, fracteryl: e }; }
  }
  for (const s of ctx.fracterylShards) {
    const dx = s.x - ctx.mote.x, dy = s.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'fracterylshard', x: s.x, y: s.y, distSq: d, fracterylshard: s }; }
  }
  for (const e of ctx.eigensteinEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'eigenstein', x: e.x, y: e.y, distSq: d, eigenstein: e }; }
  }
  for (const e of ctx.eliteEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'elite', x: e.x, y: e.y, distSq: d, elite: e }; }
  }
  // Aliven particle groups — target individual particles
  for (const group of ctx.alivenGroups) {
    for (const p of group.particles) {
      if (!p.isAlive) continue;
      const dx = p.x - ctx.mote.x, dy = p.y - ctx.mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'aliven_particle', x: p.x, y: p.y, distSq: d, alivenParticle: p, alivenGroup: group }; }
    }
  }
  if (ctx.bossEnemy) {
    const dx = ctx.bossEnemy.x - ctx.mote.x, dy = ctx.bossEnemy.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'boss', x: ctx.bossEnemy.x, y: ctx.bossEnemy.y, distSq: d, boss: ctx.bossEnemy }; }
  }
  // ── Procedural creature enemies (targetable by weapons) ──────────────────────
  for (const e of ctx.dustWispEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'proc_dustwisp', x: e.x, y: e.y, distSq: d, dustWisp: e }; }
  }
  for (const e of ctx.ribbonWormEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'proc_ribbonworm', x: e.x, y: e.y, distSq: d, ribbonWorm: e }; }
  }
  for (const e of ctx.lanternMothEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'proc_lanternmoth', x: e.x, y: e.y, distSq: d, lanternMoth: e }; }
  }
  for (const e of ctx.eyeStalkEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'proc_eyestalk', x: e.x, y: e.y, distSq: d, eyeStalk: e }; }
  }
  for (const e of ctx.jellyfishEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'proc_jellyfish', x: e.x, y: e.y, distSq: d, jellyfish: e }; }
  }
  for (const e of ctx.clothGhostEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'proc_clothghost', x: e.x, y: e.y, distSq: d, clothGhost: e }; }
  }
  for (const e of ctx.plantTurretEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'proc_plantturret', x: e.x, y: e.y, distSq: d, plantTurret: e }; }
  }
  for (const e of ctx.gearInsectEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'proc_gearinsect', x: e.x, y: e.y, distSq: d, gearInsect: e }; }
  }
  for (const e of ctx.spiderCrawlerEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'proc_spidercrawler', x: e.x, y: e.y, distSq: d, spiderCrawler: e }; }
  }
  for (const e of ctx.moteSwarmEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'proc_moteswarm', x: e.x, y: e.y, distSq: d, moteSwarm: e }; }
  }
  for (const e of ctx.shadowHandEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'proc_shadowhand', x: e.x, y: e.y, distSq: d, shadowHand: e }; }
  }
  for (const p of ctx.plantProjectiles) {
    if (p.hp <= 0) continue;
    const dx = p.x - ctx.mote.x, dy = p.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'proc_plantproj', x: p.x, y: p.y, distSq: d, plantProj: p }; }
  }
  return best;
}

export function findClosestEnemy(
  ctx: RpgTargetingCtx,
  rangeSq: number,
): LaserEnemy | SapphireEnemy | EmeraldEnemy | AmberEnemy | VoidEnemy
  | QuartzEnemy | RubyEnemy | SunstoneEnemy | CitrineEnemy | IoliteEnemy | AmethystEnemy | DiamondEnemy | NullstoneEnemy
  | FracterylEnemy | EigensteinEnemy | EliteEnemy | BossEnemy
  | DustWispEnemy | RibbonWormEnemy | LanternMothEnemy | EyeStalkEnemy
  | JellyfishEnemy | ClothGhostEnemy | PlantTurretEnemy | GearInsectEnemy
  | SpiderCrawlerEnemy | MoteSwarmEnemy | ShadowHandEnemy | null {
  let bestSq = rangeSq;
  let best: LaserEnemy | SapphireEnemy | EmeraldEnemy | AmberEnemy | VoidEnemy
    | QuartzEnemy | RubyEnemy | SunstoneEnemy | CitrineEnemy | IoliteEnemy | AmethystEnemy | DiamondEnemy | NullstoneEnemy
    | FracterylEnemy | EigensteinEnemy | EliteEnemy | BossEnemy
    | DustWispEnemy | RibbonWormEnemy | LanternMothEnemy | EyeStalkEnemy
    | JellyfishEnemy | ClothGhostEnemy | PlantTurretEnemy | GearInsectEnemy
    | SpiderCrawlerEnemy | MoteSwarmEnemy | ShadowHandEnemy | null = null;
  for (const e of ctx.enemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = e; }
  }
  for (const e of ctx.sapphireEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = e; }
  }
  for (const e of ctx.emeraldEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = e; }
  }
  for (const e of ctx.amberEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = e; }
  }
  for (const e of ctx.voidEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = e; }
  }
  for (const e of ctx.quartzEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = e; }
  }
  for (const e of ctx.rubyEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = e; }
  }
  for (const e of ctx.sunstoneEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = e; }
  }
  for (const e of ctx.citrineEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = e; }
  }
  for (const e of ctx.ioliteEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = e; }
  }
  for (const e of ctx.amethystEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = e; }
  }
  for (const e of ctx.diamondEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = e; }
  }
  for (const e of ctx.nullstoneEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = e; }
  }
  for (const e of ctx.fracterylEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = e; }
  }
  for (const e of ctx.eigensteinEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = e; }
  }
  for (const e of ctx.eliteEnemies) {
    const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = e; }
  }
  if (ctx.bossEnemy) {
    const dx = ctx.bossEnemy.x - ctx.mote.x, dy = ctx.bossEnemy.y - ctx.mote.y;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = ctx.bossEnemy; }
  }
  // Proc enemies
  for (const e of ctx.dustWispEnemies) { const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y; const d = dx*dx+dy*dy; if (d <= bestSq) { bestSq = d; best = e; } }
  for (const e of ctx.ribbonWormEnemies) { const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y; const d = dx*dx+dy*dy; if (d <= bestSq) { bestSq = d; best = e; } }
  for (const e of ctx.lanternMothEnemies) { const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y; const d = dx*dx+dy*dy; if (d <= bestSq) { bestSq = d; best = e; } }
  for (const e of ctx.eyeStalkEnemies) { const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y; const d = dx*dx+dy*dy; if (d <= bestSq) { bestSq = d; best = e; } }
  for (const e of ctx.jellyfishEnemies) { const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y; const d = dx*dx+dy*dy; if (d <= bestSq) { bestSq = d; best = e; } }
  for (const e of ctx.clothGhostEnemies) { const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y; const d = dx*dx+dy*dy; if (d <= bestSq) { bestSq = d; best = e; } }
  for (const e of ctx.plantTurretEnemies) { const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y; const d = dx*dx+dy*dy; if (d <= bestSq) { bestSq = d; best = e; } }
  for (const e of ctx.gearInsectEnemies) { const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y; const d = dx*dx+dy*dy; if (d <= bestSq) { bestSq = d; best = e; } }
  for (const e of ctx.spiderCrawlerEnemies) { const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y; const d = dx*dx+dy*dy; if (d <= bestSq) { bestSq = d; best = e; } }
  for (const e of ctx.moteSwarmEnemies) { const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y; const d = dx*dx+dy*dy; if (d <= bestSq) { bestSq = d; best = e; } }
  for (const e of ctx.shadowHandEnemies) { const dx = e.x - ctx.mote.x, dy = e.y - ctx.mote.y; const d = dx*dx+dy*dy; if (d <= bestSq) { bestSq = d; best = e; } }
  return best;
}
