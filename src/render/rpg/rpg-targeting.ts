/**
 * rpg-targeting.ts — Targeting system for the RPG tab.
 *
 * Provides closest-target lookup functions and damage dispatch across all
 * enemy types. Extracted from rpg-render.ts to reduce file size.
 *
 * Use createRpgTargeting(ctx) to create the targeting handle.
 */

import type { ClosestTarget, TargetKind, LaserEnemy, SapphireMissile, SapphireEnemy } from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy, AmberShard,
  VoidEnemy, QuartzEnemy, QuartzSpike,
  RubyEnemy, RubyBolt,
  SunstoneEnemy, CitrineEnemy, CitrineBolt,
  IoliteEnemy, AmethystEnemy, AmethystShard,
  DiamondEnemy, DiamondShard,
  NullstoneEnemy, VoidTendril,
  FracterylEnemy, FracterylShard,
  EigensteinEnemy,
  BossEnemy, EliteEnemy,
} from './rpg-enemy-types';

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
  damageBossEnemy: (raw: number, pierce: number, fromDiamond?: boolean) => number;
}

export interface RpgTargetingHandle {
  findClosestTarget(rangeSq: number): ClosestTarget | null;
  findClosestEnemy(rangeSq: number): LaserEnemy | SapphireEnemy | EmeraldEnemy | AmberEnemy | VoidEnemy
    | QuartzEnemy | RubyEnemy | SunstoneEnemy | CitrineEnemy | IoliteEnemy | AmethystEnemy | DiamondEnemy
    | NullstoneEnemy | FracterylEnemy | EigensteinEnemy | EliteEnemy | BossEnemy | null;
  collectEnemyBodyTargets(): ClosestTarget[];
  findClosestEnemyFrom(x: number, y: number, rangeSq: number): ClosestTarget | null;
  getTargetedEnemy(): ClosestTarget | null;
  tryTargetEnemyAt(tapX: number, tapY: number): void;
  damageBodyTarget(target: ClosestTarget, rawDamage: number, defPierceRatio: number, bypassShield: boolean): number;
}

export function createRpgTargeting(ctx: RpgTargetingCtx): RpgTargetingHandle {

  let targetedEnemy: object | null = null;

  function findClosestTarget(rangeSq: number): ClosestTarget | null {
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
    if (ctx.bossEnemy) {
      const dx = ctx.bossEnemy.x - ctx.mote.x, dy = ctx.bossEnemy.y - ctx.mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'boss', x: ctx.bossEnemy.x, y: ctx.bossEnemy.y, distSq: d, boss: ctx.bossEnemy }; }
    }
    return best;
  }

  function findClosestEnemy(rangeSq: number): LaserEnemy | SapphireEnemy | EmeraldEnemy | AmberEnemy | VoidEnemy
    | QuartzEnemy | RubyEnemy | SunstoneEnemy | CitrineEnemy | IoliteEnemy | AmethystEnemy | DiamondEnemy | NullstoneEnemy
    | FracterylEnemy | EigensteinEnemy | EliteEnemy | BossEnemy | null {
    let bestSq = rangeSq;
    let best: LaserEnemy | SapphireEnemy | EmeraldEnemy | AmberEnemy | VoidEnemy
      | QuartzEnemy | RubyEnemy | SunstoneEnemy | CitrineEnemy | IoliteEnemy | AmethystEnemy | DiamondEnemy | NullstoneEnemy
      | FracterylEnemy | EigensteinEnemy | EliteEnemy | BossEnemy | null = null;
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
    return best;
  }

  function tryTargetEnemyAt(tapX: number, tapY: number): void {
    // Manual tap-to-target is currently disabled by design — the function clears
    // the stored target so the next getTargetedEnemy() call falls back to the
    // closest automatic target.  The tap position is received but not yet used.
    void tapX;
    void tapY;
    targetedEnemy = null;
  }

  function getTargetedEnemy(): ClosestTarget | null {
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

      if (!isAlive) {
        targetedEnemy = null;
      } else {
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
    return findClosestEnemyFrom(ctx.mote.x, ctx.mote.y, Infinity);
  }

  function collectEnemyBodyTargets(): ClosestTarget[] {
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
    if (ctx.bossEnemy) addTarget('boss', ctx.bossEnemy, 'boss');
    return targets;
  }

  function findClosestEnemyFrom(x: number, y: number, rangeSq: number): ClosestTarget | null {
    let best: ClosestTarget | null = null;
    let bestSq = rangeSq;
    for (const target of collectEnemyBodyTargets()) {
      const dx = target.x - x, dy = target.y - y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) {
        bestSq = d;
        best = { ...target, distSq: d };
      }
    }
    return best;
  }

  function damageBodyTarget(target: ClosestTarget, rawDamage: number, defPierceRatio: number, bypassShield: boolean): number {
    if (target.laser) return ctx.damageEnemy(target.laser, rawDamage, defPierceRatio);
    if (target.sapphire) return ctx.damageSapphireEnemy(target.sapphire, rawDamage, defPierceRatio, bypassShield);
    if (target.emerald) return ctx.damageEmeraldEnemy(target.emerald, rawDamage, defPierceRatio);
    if (target.amber) return ctx.damageAmberEnemy(target.amber, rawDamage, defPierceRatio);
    if (target.void) return ctx.damageVoidEnemy(target.void, rawDamage, defPierceRatio);
    if (target.quartz) return ctx.damageQuartzEnemy(target.quartz, rawDamage, defPierceRatio);
    if (target.ruby) return ctx.damageRubyEnemy(target.ruby, rawDamage, defPierceRatio);
    if (target.sunstone) return ctx.damageSunstoneEnemy(target.sunstone, rawDamage, defPierceRatio);
    if (target.citrine) return ctx.damageCitrineEnemy(target.citrine, rawDamage, defPierceRatio);
    if (target.iolite) return ctx.damageIoliteEnemy(target.iolite, rawDamage, defPierceRatio);
    if (target.amethyst) return ctx.damageAmethystEnemy(target.amethyst, rawDamage, defPierceRatio, bypassShield);
    if (target.diamond) return ctx.damageDiamondEnemy(target.diamond, rawDamage, defPierceRatio);
    if (target.nullstone) return ctx.damageNullstoneEnemy(target.nullstone, rawDamage, defPierceRatio);
    if (target.fracteryl) return ctx.damageFracterylEnemy(target.fracteryl, rawDamage, defPierceRatio);
    if (target.eigenstein) return ctx.damageEigensteinEnemy(target.eigenstein, rawDamage, defPierceRatio);
    if (target.elite) return ctx.damageEliteEnemy(target.elite, rawDamage, defPierceRatio);
    if (target.boss) return ctx.damageBossEnemy(rawDamage, defPierceRatio);
    return 0;
  }

  return {
    findClosestTarget,
    findClosestEnemy,
    collectEnemyBodyTargets,
    findClosestEnemyFrom,
    getTargetedEnemy,
    tryTargetEnemyAt,
    damageBodyTarget,
  };
}
