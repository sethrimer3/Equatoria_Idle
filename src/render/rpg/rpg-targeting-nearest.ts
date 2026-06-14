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
import type {
  PolyominoEnemy, FissilePolyominoEnemy, RefractorPolyominoEnemy,
} from './polyomino-enemy-types';
import type { RpgTargetingCtx } from './rpg-targeting-types';
import type { BinaryRingEnemy } from './rpg-binary-ring-encounter';
import type { NadirCubePointEnemy } from './nadir-cube-point-types';
import type { HorizonPentagonGroup } from './horizon-pentagon-types';
import type {
  DustWispEnemy, RibbonWormEnemy, LanternMothEnemy, EyeStalkEnemy,
  JellyfishEnemy, ClothGhostEnemy, PlantTurretEnemy, GearInsectEnemy,
  SpiderCrawlerEnemy, MoteSwarmEnemy, ShadowHandEnemy,
  SandFishEnemy, QuartzFishEnemy, RubyFishEnemy, SunstoneFishEnemy,
  EmeraldFishEnemy, SapphireFishEnemy, AmethystFishEnemy, DiamondFishEnemy,
} from './rpg-procedural-types';
import { POLYOMINO_CELL_SIZE } from './polyomino-enemy-factories';
import { segmentIntersectsTopographicTerrain, type TopographicTerrainState } from './terrain/topographic-terrain';

/**
 * Returns true when the straight line from (mx, my) to (ex, ey) is blocked by
 * terrain.  Pass `null` for terrain when none is active.
 */
function isLosBlocked(terrain: TopographicTerrainState | null, mx: number, my: number, ex: number, ey: number): boolean {
  return terrain !== null && segmentIntersectsTopographicTerrain(terrain, mx, my, ex, ey);
}

export function findClosestTarget(ctx: RpgTargetingCtx, rangeSq: number): ClosestTarget | null {
  let best: ClosestTarget | null = null;
  let bestSq = rangeSq;
  const terrain = ctx.getTerrainState();
  const mx = ctx.mote.x, my = ctx.mote.y;

  for (const e of ctx.enemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'laser', x: e.x, y: e.y, distSq: d, laser: e }; }
  }
  for (const e of ctx.sapphireEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'sapphire', x: e.x, y: e.y, distSq: d, sapphire: e }; }
  }
  for (const m of ctx.sapphireMissiles) {
    const dx = m.x - mx, dy = m.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'missile', x: m.x, y: m.y, distSq: d, missile: m }; }
  }
  for (const e of ctx.emeraldEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'emerald', x: e.x, y: e.y, distSq: d, emerald: e }; }
  }
  for (const e of ctx.amberEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'amber', x: e.x, y: e.y, distSq: d, amber: e }; }
  }
  for (const s of ctx.amberShards) {
    const dx = s.x - mx, dy = s.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'ambershard', x: s.x, y: s.y, distSq: d, ambershard: s }; }
  }
  for (const e of ctx.voidEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'void', x: e.x, y: e.y, distSq: d, void: e }; }
  }
  for (const e of ctx.quartzEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'quartz', x: e.x, y: e.y, distSq: d, quartz: e }; }
  }
  for (const s of ctx.quartzSpikes) {
    const dx = s.x - mx, dy = s.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'quartzspike', x: s.x, y: s.y, distSq: d, quartzspike: s }; }
  }
  for (const e of ctx.rubyEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'ruby', x: e.x, y: e.y, distSq: d, ruby: e }; }
  }
  for (const b of ctx.rubyBolts) {
    const dx = b.x - mx, dy = b.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'rubybolt', x: b.x, y: b.y, distSq: d, rubybolt: b }; }
  }
  for (const e of ctx.sunstoneEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'sunstone', x: e.x, y: e.y, distSq: d, sunstone: e }; }
  }
  for (const e of ctx.citrineEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'citrine', x: e.x, y: e.y, distSq: d, citrine: e }; }
  }
  for (const b of ctx.citrineBolts) {
    const dx = b.x - mx, dy = b.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'citrinebolt', x: b.x, y: b.y, distSq: d, citrinebolt: b }; }
  }
  for (const e of ctx.ioliteEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'iolite', x: e.x, y: e.y, distSq: d, iolite: e }; }
  }
  for (const e of ctx.amethystEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'amethyst', x: e.x, y: e.y, distSq: d, amethyst: e }; }
  }
  for (const s of ctx.amethystShards) {
    const dx = s.x - mx, dy = s.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'amethystshard', x: s.x, y: s.y, distSq: d, amethystshard: s }; }
  }
  for (const e of ctx.diamondEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'diamond', x: e.x, y: e.y, distSq: d, diamond: e }; }
  }
  for (const s of ctx.diamondShards) {
    const dx = s.x - mx, dy = s.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'diamondshard', x: s.x, y: s.y, distSq: d, diamondshard: s }; }
  }
  for (const e of ctx.nullstoneEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'nullstone', x: e.x, y: e.y, distSq: d, nullstone: e }; }
  }
  for (const t of ctx.voidTendrils) {
    const dx = t.x - mx, dy = t.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'voidtendril', x: t.x, y: t.y, distSq: d, voidtendril: t }; }
  }
  for (const e of ctx.fracterylEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'fracteryl', x: e.x, y: e.y, distSq: d, fracteryl: e }; }
  }
  for (const s of ctx.fracterylShards) {
    const dx = s.x - mx, dy = s.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'fracterylshard', x: s.x, y: s.y, distSq: d, fracterylshard: s }; }
  }
  for (const e of ctx.eigensteinEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'eigenstein', x: e.x, y: e.y, distSq: d, eigenstein: e }; }
  }
  for (const e of ctx.polyominoEnemies) {
    for (let i = 0; i < e.cells.length; i++) {
      const c = e.cells[i]!;
      if (c.state === 'fadingOut') continue;
      const ex = e.gridOriginX + c.col * POLYOMINO_CELL_SIZE;
      const ey = e.gridOriginY + c.row * POLYOMINO_CELL_SIZE;
      const dx = ex - mx, dy = ey - my;
      const d = dx * dx + dy * dy;
      if (d <= bestSq && !isLosBlocked(terrain, mx, my, ex, ey)) { bestSq = d; best = { kind: 'verdure_polyomino', x: ex, y: ey, distSq: d, polyomino: e }; }
    }
  }
  for (const e of ctx.fissilePolyominoEnemies) {
    for (let i = 0; i < e.cells.length; i++) {
      const c = e.cells[i]!;
      if (c.state === 'fadingOut') continue;
      const ex = e.gridOriginX + c.col * POLYOMINO_CELL_SIZE;
      const ey = e.gridOriginY + c.row * POLYOMINO_CELL_SIZE;
      const dx = ex - mx, dy = ey - my;
      const d = dx * dx + dy * dy;
      if (d <= bestSq && !isLosBlocked(terrain, mx, my, ex, ey)) { bestSq = d; best = { kind: 'verdure_polyomino_fissile', x: ex, y: ey, distSq: d, fissilePolyomino: e }; }
    }
  }
  for (const e of ctx.refractorPolyominoEnemies) {
    for (let i = 0; i < e.cells.length; i++) {
      const c = e.cells[i]!;
      if (c.state === 'fadingOut') continue;
      const ex = e.gridOriginX + c.col * POLYOMINO_CELL_SIZE;
      const ey = e.gridOriginY + c.row * POLYOMINO_CELL_SIZE;
      const dx = ex - mx, dy = ey - my;
      const d = dx * dx + dy * dy;
      if (d <= bestSq && !isLosBlocked(terrain, mx, my, ex, ey)) { bestSq = d; best = { kind: 'verdure_polyomino_refractor', x: ex, y: ey, distSq: d, refractorPolyomino: e }; }
    }
  }
  for (const e of ctx.eliteEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'elite', x: e.x, y: e.y, distSq: d, elite: e }; }
  }
  for (const e of ctx.binaryRingEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'binary_ring', x: e.x, y: e.y, distSq: d, binaryRing: e }; }
  }
  for (const e of ctx.nadirCubePointEnemies) {
    if (e.hp <= 0 || !e.projectedVisible || e.surfaceActivated) continue;
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'nadir_cube_point', x: e.x, y: e.y, distSq: d, nadirCubePoint: e }; }
  }
  // Horizon pentagon — real body + missiles
  for (const g of ctx.horizonPentagonGroups) {
    if (g.hp <= 0) continue;
    const dx = g.x - mx, dy = g.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, g.x, g.y)) { bestSq = d; best = { kind: 'horizon_pentagon_real', x: g.x, y: g.y, distSq: d, horizonPentagonReal: g }; }
    for (const shadow of g.shadows) {
      const sdx = shadow.x - mx, sdy = shadow.y - my;
      const sd = sdx * sdx + sdy * sdy;
      if (sd <= bestSq && !isLosBlocked(terrain, mx, my, shadow.x, shadow.y)) {
        bestSq = sd;
        best = { kind: 'horizon_pentagon_real', x: shadow.x, y: shadow.y, distSq: sd, horizonPentagonReal: g };
      }
    }
    for (const m of g.missiles) {
      if (m.hp <= 0 || m.explodeFlashMs > 0) continue;
      const mdx = m.x - mx, mdy = m.y - my;
      const md = mdx * mdx + mdy * mdy;
      if (md <= bestSq && !isLosBlocked(terrain, mx, my, m.x, m.y)) { bestSq = md; best = { kind: 'horizon_missile', x: m.x, y: m.y, distSq: md, horizonMissile: m }; }
    }
  }
  // Aliven particle groups — target individual particles
  for (const group of ctx.alivenGroups) {
    for (const p of group.particles) {
      if (!p.isAlive) continue;
      const dx = p.x - mx, dy = p.y - my;
      const d = dx * dx + dy * dy;
      if (d <= bestSq && !isLosBlocked(terrain, mx, my, p.x, p.y)) { bestSq = d; best = { kind: 'aliven_particle', x: p.x, y: p.y, distSq: d, alivenParticle: p, alivenGroup: group }; }
    }
  }
  if (ctx.bossEnemy) {
    const dx = ctx.bossEnemy.x - mx, dy = ctx.bossEnemy.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, ctx.bossEnemy.x, ctx.bossEnemy.y)) { bestSq = d; best = { kind: 'boss', x: ctx.bossEnemy.x, y: ctx.bossEnemy.y, distSq: d, boss: ctx.bossEnemy }; }
  }
  // ── Procedural creature enemies (targetable by weapons) ──────────────────────
  for (const e of ctx.dustWispEnemies) {
    const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'proc_dustwisp', x: e.x, y: e.y, distSq: d, dustWisp: e }; }
  }
  for (const e of ctx.ribbonWormEnemies) {
    const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'proc_ribbonworm', x: e.x, y: e.y, distSq: d, ribbonWorm: e }; }
  }
  for (const e of ctx.lanternMothEnemies) {
    const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'proc_lanternmoth', x: e.x, y: e.y, distSq: d, lanternMoth: e }; }
  }
  for (const e of ctx.eyeStalkEnemies) {
    const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'proc_eyestalk', x: e.x, y: e.y, distSq: d, eyeStalk: e }; }
  }
  for (const e of ctx.jellyfishEnemies) {
    const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'proc_jellyfish', x: e.x, y: e.y, distSq: d, jellyfish: e }; }
  }
  for (const e of ctx.eliteJellyfishEnemies) {
    const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'proc_jellyfish_elite', x: e.x, y: e.y, distSq: d, eliteJellyfish: e }; }
  }
  for (const e of ctx.clothGhostEnemies) {
    const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'proc_clothghost', x: e.x, y: e.y, distSq: d, clothGhost: e }; }
  }
  for (const e of ctx.plantTurretEnemies) {
    const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'proc_plantturret', x: e.x, y: e.y, distSq: d, plantTurret: e }; }
  }
  for (const e of ctx.gearInsectEnemies) {
    const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'proc_gearinsect', x: e.x, y: e.y, distSq: d, gearInsect: e }; }
  }
  for (const e of ctx.spiderCrawlerEnemies) {
    const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'proc_spidercrawler', x: e.x, y: e.y, distSq: d, spiderCrawler: e }; }
  }
  for (const e of ctx.moteSwarmEnemies) {
    const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'proc_moteswarm', x: e.x, y: e.y, distSq: d, moteSwarm: e }; }
  }
  for (const e of ctx.shadowHandEnemies) {
    const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'proc_shadowhand', x: e.x, y: e.y, distSq: d, shadowHand: e }; }
  }
  for (const e of ctx.sandFishEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'proc_sandfish', x: e.x, y: e.y, distSq: d, sandFish: e }; } }
  for (const e of ctx.quartzFishEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'proc_quartzfish', x: e.x, y: e.y, distSq: d, quartzFish: e }; } }
  for (const e of ctx.rubyFishEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'proc_rubyfish', x: e.x, y: e.y, distSq: d, rubyFish: e }; } }
  for (const e of ctx.sunstoneFishEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'proc_sunstonefish', x: e.x, y: e.y, distSq: d, sunstoneFish: e }; } }
  for (const e of ctx.emeraldFishEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'proc_emeraldfish', x: e.x, y: e.y, distSq: d, emeraldFish: e }; } }
  for (const e of ctx.sapphireFishEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'proc_sapphirefish', x: e.x, y: e.y, distSq: d, sapphireFish: e }; } }
  for (const e of ctx.amethystFishEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'proc_amethystfish', x: e.x, y: e.y, distSq: d, amethystFish: e }; } }
  for (const e of ctx.diamondFishEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = { kind: 'proc_diamondfish', x: e.x, y: e.y, distSq: d, diamondFish: e }; } }
  for (const p of ctx.plantProjectiles) {
    if (p.hp <= 0) continue;
    const dx = p.x - mx, dy = p.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq) { bestSq = d; best = { kind: 'proc_plantproj', x: p.x, y: p.y, distSq: d, plantProj: p }; }
  }
  // ── Verdure zone environmental plants ──────────────────────────────────────
  // Only checked when plants are present (non-Verdure zones have empty array).
  // Plants use pre-computed nearestSegDistPx for efficiency; we only do the
  // squared-distance comparison here (rootX/rootY as proxy for target position).
  for (const plant of ctx.verdurePlants) {
    if (!plant.isTargetable) continue;
    const dSq = plant.nearestSegDistPx * plant.nearestSegDistPx;
    if (dSq <= bestSq) {
      bestSq = dSq;
      // Use the root as the representative position (close enough for targeting)
      best = { kind: 'verdure_plant', x: plant.rootX, y: plant.rootY, distSq: dSq, verdurePlant: plant };
    }
  }
  return best;
}

export function findClosestEnemy(
  ctx: RpgTargetingCtx,
  rangeSq: number,
): LaserEnemy | SapphireEnemy | EmeraldEnemy | AmberEnemy | VoidEnemy
  | QuartzEnemy | RubyEnemy | SunstoneEnemy | CitrineEnemy | IoliteEnemy | AmethystEnemy | DiamondEnemy | NullstoneEnemy
  | FracterylEnemy | EigensteinEnemy | PolyominoEnemy | FissilePolyominoEnemy | RefractorPolyominoEnemy
  | BinaryRingEnemy | EliteEnemy | BossEnemy
  | DustWispEnemy | RibbonWormEnemy | LanternMothEnemy | EyeStalkEnemy
  | JellyfishEnemy | ClothGhostEnemy | PlantTurretEnemy | GearInsectEnemy
  | SpiderCrawlerEnemy | MoteSwarmEnemy | ShadowHandEnemy
  | SandFishEnemy | QuartzFishEnemy | RubyFishEnemy | SunstoneFishEnemy
  | EmeraldFishEnemy | SapphireFishEnemy | AmethystFishEnemy | DiamondFishEnemy
  | NadirCubePointEnemy | HorizonPentagonGroup | null {
  let bestSq = rangeSq;
  let best: LaserEnemy | SapphireEnemy | EmeraldEnemy | AmberEnemy | VoidEnemy
    | QuartzEnemy | RubyEnemy | SunstoneEnemy | CitrineEnemy | IoliteEnemy | AmethystEnemy | DiamondEnemy | NullstoneEnemy
    | FracterylEnemy | EigensteinEnemy | PolyominoEnemy | FissilePolyominoEnemy | RefractorPolyominoEnemy
    | BinaryRingEnemy | EliteEnemy | BossEnemy
    | DustWispEnemy | RibbonWormEnemy | LanternMothEnemy | EyeStalkEnemy
    | JellyfishEnemy | ClothGhostEnemy | PlantTurretEnemy | GearInsectEnemy
    | SpiderCrawlerEnemy | MoteSwarmEnemy | ShadowHandEnemy
    | SandFishEnemy | QuartzFishEnemy | RubyFishEnemy | SunstoneFishEnemy
    | EmeraldFishEnemy | SapphireFishEnemy | AmethystFishEnemy | DiamondFishEnemy
    | NadirCubePointEnemy | HorizonPentagonGroup | null = null;
  const terrain = ctx.getTerrainState();
  const mx = ctx.mote.x, my = ctx.mote.y;
  for (const e of ctx.enemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; }
  }
  for (const e of ctx.sapphireEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; }
  }
  for (const e of ctx.emeraldEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; }
  }
  for (const e of ctx.amberEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; }
  }
  for (const e of ctx.voidEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; }
  }
  for (const e of ctx.quartzEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; }
  }
  for (const e of ctx.rubyEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; }
  }
  for (const e of ctx.sunstoneEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; }
  }
  for (const e of ctx.citrineEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; }
  }
  for (const e of ctx.ioliteEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; }
  }
  for (const e of ctx.amethystEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; }
  }
  for (const e of ctx.diamondEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; }
  }
  for (const e of ctx.nullstoneEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; }
  }
  for (const e of ctx.fracterylEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; }
  }
  for (const e of ctx.eigensteinEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; }
  }
  for (const e of ctx.polyominoEnemies) {
    for (let i = 0; i < e.cells.length; i++) {
      const c = e.cells[i]!;
      if (c.state === 'fadingOut') continue;
      const ex = e.gridOriginX + c.col * POLYOMINO_CELL_SIZE;
      const ey = e.gridOriginY + c.row * POLYOMINO_CELL_SIZE;
      const dx = ex - mx, dy = ey - my;
      const d = dx * dx + dy * dy;
      if (d <= bestSq && !isLosBlocked(terrain, mx, my, ex, ey)) { bestSq = d; best = e; }
    }
  }
  for (const e of ctx.fissilePolyominoEnemies) {
    for (let i = 0; i < e.cells.length; i++) {
      const c = e.cells[i]!;
      if (c.state === 'fadingOut') continue;
      const ex = e.gridOriginX + c.col * POLYOMINO_CELL_SIZE;
      const ey = e.gridOriginY + c.row * POLYOMINO_CELL_SIZE;
      const dx = ex - mx, dy = ey - my;
      const d = dx * dx + dy * dy;
      if (d <= bestSq && !isLosBlocked(terrain, mx, my, ex, ey)) { bestSq = d; best = e; }
    }
  }
  for (const e of ctx.refractorPolyominoEnemies) {
    for (let i = 0; i < e.cells.length; i++) {
      const c = e.cells[i]!;
      if (c.state === 'fadingOut') continue;
      const ex = e.gridOriginX + c.col * POLYOMINO_CELL_SIZE;
      const ey = e.gridOriginY + c.row * POLYOMINO_CELL_SIZE;
      const dx = ex - mx, dy = ey - my;
      const d = dx * dx + dy * dy;
      if (d <= bestSq && !isLosBlocked(terrain, mx, my, ex, ey)) { bestSq = d; best = e; }
    }
  }
  for (const e of ctx.eliteEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; }
  }
  for (const e of ctx.binaryRingEnemies) {
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; }
  }
  for (const e of ctx.nadirCubePointEnemies) {
    if (e.hp <= 0 || !e.projectedVisible || e.surfaceActivated) continue;
    const dx = e.x - mx, dy = e.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; }
  }
  if (ctx.bossEnemy) {
    const dx = ctx.bossEnemy.x - mx, dy = ctx.bossEnemy.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, ctx.bossEnemy.x, ctx.bossEnemy.y)) { bestSq = d; best = ctx.bossEnemy; }
  }
  // Proc enemies
  for (const e of ctx.dustWispEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; } }
  for (const e of ctx.ribbonWormEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; } }
  for (const e of ctx.lanternMothEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; } }
  for (const e of ctx.eyeStalkEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; } }
  for (const e of ctx.jellyfishEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; } }
  for (const e of ctx.clothGhostEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; } }
  for (const e of ctx.plantTurretEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; } }
  for (const e of ctx.gearInsectEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; } }
  for (const e of ctx.spiderCrawlerEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; } }
  for (const e of ctx.moteSwarmEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; } }
  for (const e of ctx.shadowHandEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; } }
  for (const e of ctx.sandFishEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; } }
  for (const e of ctx.quartzFishEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; } }
  for (const e of ctx.rubyFishEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; } }
  for (const e of ctx.sunstoneFishEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; } }
  for (const e of ctx.emeraldFishEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; } }
  for (const e of ctx.sapphireFishEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; } }
  for (const e of ctx.amethystFishEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; } }
  for (const e of ctx.diamondFishEnemies) { const dx = e.x - mx, dy = e.y - my; const d = dx*dx+dy*dy; if (d <= bestSq && !isLosBlocked(terrain, mx, my, e.x, e.y)) { bestSq = d; best = e; } }
  for (const g of ctx.horizonPentagonGroups) {
    if (g.hp <= 0) continue;
    const dx = g.x - mx, dy = g.y - my;
    const d = dx * dx + dy * dy;
    if (d <= bestSq && !isLosBlocked(terrain, mx, my, g.x, g.y)) { bestSq = d; best = g; }
  }
  return best;
}
