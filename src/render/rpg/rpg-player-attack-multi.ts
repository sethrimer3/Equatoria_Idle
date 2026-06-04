/**
 * rpg-player-attack-multi.ts — Multi-target weapon attack handler.
 *
 * Extracted from rpg-player-attack.ts. Handles the `multi` weapon effect kind:
 * collects all enemies within range, sorts by distance, and damages the
 * closest N targets (where N = targetCount from the weapon definition).
 *
 * Imported and called by `performWeaponAttack` in rpg-player-attack.ts.
 */

import type {
  LaserEnemy, SapphireEnemy, SapphireMissile,
} from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy, AmberShard,
  VoidEnemy, QuartzEnemy, QuartzSpike,
  RubyEnemy, RubyBolt, SunstoneEnemy,
  CitrineEnemy, CitrineBolt, IoliteEnemy,
  AmethystEnemy, AmethystShard, DiamondEnemy, DiamondShard,
  NullstoneEnemy, VoidTendril, FracterylEnemy, FracterylShard,
  EigensteinEnemy, BossEnemy, EliteEnemy,
} from './rpg-enemy-types';
import type { AlivenParticle, AlivenParticleGroup } from './rpg-aliven-types';
import type { RpgPlayerAttackCtx } from './rpg-player-attack';
import { POLYOMINO_CELL_SIZE } from './polyomino-enemy-factories';
import type {
  PolyominoEnemy, FissilePolyominoEnemy, RefractorPolyominoEnemy,
} from './polyomino-enemy-types';
import type { CraftedWeaponModifiers } from '../../data/rpg/crafted-weapon-types';
import { applyCraftedPostHit, makeFracterylPool } from './rpg-crafted-post-hit';
import { applyLensStatus, incrementRiftScarredStacks } from '../../sim/rpg/enemy-status-effects';
import { buildAllTier1StatusParams } from '../../data/rpg/lens-status-effects';

// ── Sort-entry type (local to this module) ────────────────────────────────────

/** Extract world position from a MultiSortEntry, falling back to (fallX, fallY). */
function getSortEntryPos(t: MultiSortEntry, fallX: number, fallY: number): [number, number] {
  const x = t.laser?.x ?? t.sapphire?.x ?? t.emerald?.x ?? t.amber?.x ?? t.void?.x
    ?? t.quartz?.x ?? t.ruby?.x ?? t.sunstone?.x ?? t.citrine?.x ?? t.iolite?.x
    ?? t.amethyst?.x ?? t.diamond?.x ?? t.nullstone?.x ?? t.fracteryl?.x ?? t.eigenstein?.x
    ?? t.polyomino?.x ?? t.fissilePolyomino?.x ?? t.refractorPolyomino?.x ?? t.elite?.x
    ?? t.boss?.x ?? t.alivenParticle?.x ?? fallX;
  const y = t.laser?.y ?? t.sapphire?.y ?? t.emerald?.y ?? t.amber?.y ?? t.void?.y
    ?? t.quartz?.y ?? t.ruby?.y ?? t.sunstone?.y ?? t.citrine?.y ?? t.iolite?.y
    ?? t.amethyst?.y ?? t.diamond?.y ?? t.nullstone?.y ?? t.fracteryl?.y ?? t.eigenstein?.y
    ?? t.polyomino?.y ?? t.fissilePolyomino?.y ?? t.refractorPolyomino?.y ?? t.elite?.y
    ?? t.boss?.y ?? t.alivenParticle?.y ?? fallY;
  return [x, y];
}

type MultiSortEntry = {
  distSq: number;
  laser?: LaserEnemy;
  sapphire?: SapphireEnemy;
  missile?: SapphireMissile;
  emerald?: EmeraldEnemy;
  amber?: AmberEnemy;
  ambershard?: AmberShard;
  void?: VoidEnemy;
  quartz?: QuartzEnemy;
  quartzspike?: QuartzSpike;
  ruby?: RubyEnemy;
  rubybolt?: RubyBolt;
  sunstone?: SunstoneEnemy;
  citrine?: CitrineEnemy;
  citrinebolt?: CitrineBolt;
  iolite?: IoliteEnemy;
  amethyst?: AmethystEnemy;
  amethystshard?: AmethystShard;
  diamond?: DiamondEnemy;
  diamondshard?: DiamondShard;
  nullstone?: NullstoneEnemy;
  voidtendril?: VoidTendril;
  fracteryl?: FracterylEnemy;
  fracterylshard?: FracterylShard;
  eigenstein?: EigensteinEnemy;
  polyomino?: PolyominoEnemy;
  fissilePolyomino?: FissilePolyominoEnemy;
  refractorPolyomino?: RefractorPolyominoEnemy;
  elite?: EliteEnemy;
  boss?: BossEnemy;
  alivenParticle?: AlivenParticle;
  alivenGroup?: AlivenParticleGroup;
};

// ── Lens status helpers ───────────────────────────────────────────────────────

function extractMultiEntity(t: MultiSortEntry): object | null {
  return t.laser ?? t.sapphire ?? t.emerald ?? t.amber ?? t.void ?? t.quartz
    ?? t.ruby ?? t.sunstone ?? t.citrine ?? t.iolite ?? t.amethyst ?? t.diamond
    ?? t.nullstone ?? t.fracteryl ?? t.eigenstein ?? t.polyomino ?? t.fissilePolyomino
    ?? t.refractorPolyomino ?? t.elite ?? t.boss ?? t.alivenParticle ?? null;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export function performMultiAttack(
  ctx: RpgPlayerAttackCtx,
  rawDamage: number,
  rangeSq: number,
  targetCount: number,
  armorIgnore = 0,
  craftedMods?: CraftedWeaponModifiers,
  attachedLens?: import('../../data/rpg/lens-types').CraftedLensData,
  weaponId?: string,
): void {
  const {
    mote,
    enemies, sapphireEnemies, sapphireMissiles,
    emeraldEnemies, amberEnemies, amberShards, voidEnemies,
    quartzEnemies, quartzSpikes, rubyEnemies, rubyBolts,
    sunstoneEnemies, citrineEnemies, citrineBolts, ioliteEnemies,
    amethystEnemies, amethystShards, diamondEnemies, diamondShards,
    nullstoneEnemies, voidTendrils, fracterylEnemies, fracterylShards,
    eigensteinEnemies, polyominoEnemies, fissilePolyominoEnemies, refractorPolyominoEnemies, eliteEnemies, alivenGroups,
    damageEnemy, damageSapphireEnemy, damageMissile,
    damageEmeraldEnemy, damageAmberEnemy, damageAmberShard, damageVoidEnemy,
    damageQuartzEnemy, damageQuartzSpike, damageRubyEnemy, damageRubyBolt,
    damageSunstoneEnemy, damageCitrineEnemy, damageCitrineBolt, damageIoliteEnemy,
    damageAmethystEnemy, damageAmethystShard, damageDiamondEnemy, damageDiamondShard,
    damageNullstoneEnemy, damageVoidTendril, damageFracterylEnemy, damageFracterylShard,
    damageEigensteinEnemy, damagePolyominoEnemy, damageFissilePolyominoEnemy, damageRefractorPolyominoEnemy,
    damageEliteEnemy, damageBossEnemy,
    spawnHitVisuals, spawnHitVisualsAt,
  } = ctx;
  const bossEnemy = ctx.bossEnemy;

  // ── Collect all in-range targets ──────────────────────────────────────────

  const inRange: MultiSortEntry[] = [];

  for (const e of enemies) {
    const dx = e.x - mote.x, dy = e.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, laser: e });
  }
  for (const e of sapphireEnemies) {
    const dx = e.x - mote.x, dy = e.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, sapphire: e });
  }
  for (const m of sapphireMissiles) {
    const dx = m.x - mote.x, dy = m.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, missile: m });
  }
  for (const e of emeraldEnemies) {
    const dx = e.x - mote.x, dy = e.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, emerald: e });
  }
  for (const e of amberEnemies) {
    const dx = e.x - mote.x, dy = e.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, amber: e });
  }
  for (const s of amberShards) {
    const dx = s.x - mote.x, dy = s.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, ambershard: s });
  }
  for (const e of voidEnemies) {
    const dx = e.x - mote.x, dy = e.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, void: e });
  }
  for (const e of quartzEnemies) {
    const dx = e.x - mote.x, dy = e.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, quartz: e });
  }
  for (const s of quartzSpikes) {
    const dx = s.x - mote.x, dy = s.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, quartzspike: s });
  }
  for (const e of rubyEnemies) {
    const dx = e.x - mote.x, dy = e.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, ruby: e });
  }
  for (const b of rubyBolts) {
    const dx = b.x - mote.x, dy = b.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, rubybolt: b });
  }
  for (const e of sunstoneEnemies) {
    const dx = e.x - mote.x, dy = e.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, sunstone: e });
  }
  for (const e of citrineEnemies) {
    const dx = e.x - mote.x, dy = e.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, citrine: e });
  }
  for (const b of citrineBolts) {
    const dx = b.x - mote.x, dy = b.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, citrinebolt: b });
  }
  for (const e of ioliteEnemies) {
    const dx = e.x - mote.x, dy = e.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, iolite: e });
  }
  for (const e of amethystEnemies) {
    const dx = e.x - mote.x, dy = e.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, amethyst: e });
  }
  for (const s of amethystShards) {
    const dx = s.x - mote.x, dy = s.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, amethystshard: s });
  }
  for (const e of diamondEnemies) {
    const dx = e.x - mote.x, dy = e.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, diamond: e });
  }
  for (const s of diamondShards) {
    const dx = s.x - mote.x, dy = s.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, diamondshard: s });
  }
  for (const e of nullstoneEnemies) {
    const dx = e.x - mote.x, dy = e.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, nullstone: e });
  }
  for (const t of voidTendrils) {
    const dx = t.x - mote.x, dy = t.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, voidtendril: t });
  }
  for (const e of fracterylEnemies) {
    const dx = e.x - mote.x, dy = e.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, fracteryl: e });
  }
  for (const s of fracterylShards) {
    const dx = s.x - mote.x, dy = s.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, fracterylshard: s });
  }
  for (const e of eigensteinEnemies) {
    const dx = e.x - mote.x, dy = e.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, eigenstein: e });
  }
  for (const e of polyominoEnemies) {
    let bestCellDist = Infinity;
    for (let i = 0; i < e.cells.length; i++) {
      const c = e.cells[i]!;
      if (c.state === 'fadingOut') continue;
      const cx = e.gridOriginX + c.col * POLYOMINO_CELL_SIZE;
      const cy = e.gridOriginY + c.row * POLYOMINO_CELL_SIZE;
      const dx = cx - mote.x, dy = cy - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= rangeSq && d < bestCellDist) bestCellDist = d;
    }
    if (bestCellDist <= rangeSq) inRange.push({ distSq: bestCellDist, polyomino: e });
  }
  for (const e of fissilePolyominoEnemies) {
    let bestCellDist = Infinity;
    for (let i = 0; i < e.cells.length; i++) {
      const c = e.cells[i]!;
      if (c.state === 'fadingOut') continue;
      const cx = e.gridOriginX + c.col * POLYOMINO_CELL_SIZE;
      const cy = e.gridOriginY + c.row * POLYOMINO_CELL_SIZE;
      const dx = cx - mote.x, dy = cy - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= rangeSq && d < bestCellDist) bestCellDist = d;
    }
    if (bestCellDist <= rangeSq) inRange.push({ distSq: bestCellDist, fissilePolyomino: e });
  }
  for (const e of refractorPolyominoEnemies) {
    let bestCellDist = Infinity;
    for (let i = 0; i < e.cells.length; i++) {
      const c = e.cells[i]!;
      if (c.state === 'fadingOut') continue;
      const cx = e.gridOriginX + c.col * POLYOMINO_CELL_SIZE;
      const cy = e.gridOriginY + c.row * POLYOMINO_CELL_SIZE;
      const dx = cx - mote.x, dy = cy - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= rangeSq && d < bestCellDist) bestCellDist = d;
    }
    if (bestCellDist <= rangeSq) inRange.push({ distSq: bestCellDist, refractorPolyomino: e });
  }
  for (const e of eliteEnemies) {
    if (e.isInvuln) continue;
    const dx = e.x - mote.x, dy = e.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, elite: e });
  }
  if (bossEnemy) {
    const dx = bossEnemy.x - mote.x, dy = bossEnemy.y - mote.y;
    const d = dx * dx + dy * dy;
    if (d <= rangeSq) inRange.push({ distSq: d, boss: bossEnemy });
  }
  for (const group of alivenGroups) {
    for (const p of group.particles) {
      if (!p.isAlive) continue;
      const dx = p.x - mote.x, dy = p.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= rangeSq) inRange.push({ distSq: d, alivenParticle: p, alivenGroup: group });
    }
  }

  // ── Sort and damage the N closest ────────────────────────────────────────

  inRange.sort((a, b) => a.distSq - b.distSq);
  const targets = inRange.slice(0, targetCount);

  // Shared Fracteryl pool: capped at fracterylStrikes total across all targets.
  const fracterylPool = craftedMods ? makeFracterylPool(craftedMods.fracterylStrikes) : null;

  for (const t of targets) {
    if (t.laser) {
      const dmg = damageEnemy(t.laser, rawDamage, armorIgnore);
      spawnHitVisuals(t.laser, dmg, '#50b464');
    } else if (t.sapphire) {
      const dmg = damageSapphireEnemy(t.sapphire, rawDamage, armorIgnore, false);
      spawnHitVisualsAt(t.sapphire.x, t.sapphire.y, t.sapphire.maxHp, dmg, '#50b464');
    } else if (t.missile) {
      damageMissile(t.missile, rawDamage);
    } else if (t.emerald) {
      const dmg = damageEmeraldEnemy(t.emerald, rawDamage, armorIgnore);
      spawnHitVisualsAt(t.emerald.x, t.emerald.y, t.emerald.maxHp, dmg, '#50b464');
    } else if (t.amber) {
      const dmg = damageAmberEnemy(t.amber, rawDamage, armorIgnore);
      spawnHitVisualsAt(t.amber.x, t.amber.y, t.amber.maxHp, dmg, '#50b464');
    } else if (t.ambershard) {
      damageAmberShard(t.ambershard, rawDamage);
    } else if (t.void) {
      const dmg = damageVoidEnemy(t.void, rawDamage, armorIgnore);
      spawnHitVisualsAt(t.void.x, t.void.y, t.void.maxHp, dmg, '#50b464');
    } else if (t.quartz) {
      const dmg = damageQuartzEnemy(t.quartz, rawDamage, armorIgnore);
      spawnHitVisualsAt(t.quartz.x, t.quartz.y, t.quartz.maxHp, dmg, '#50b464');
    } else if (t.quartzspike) {
      damageQuartzSpike(t.quartzspike, rawDamage);
    } else if (t.ruby) {
      const dmg = damageRubyEnemy(t.ruby, rawDamage, armorIgnore);
      spawnHitVisualsAt(t.ruby.x, t.ruby.y, t.ruby.maxHp, dmg, '#50b464');
    } else if (t.rubybolt) {
      damageRubyBolt(t.rubybolt, rawDamage);
    } else if (t.sunstone) {
      const dmg = damageSunstoneEnemy(t.sunstone, rawDamage, armorIgnore);
      spawnHitVisualsAt(t.sunstone.x, t.sunstone.y, t.sunstone.maxHp, dmg, '#50b464');
    } else if (t.citrine) {
      const dmg = damageCitrineEnemy(t.citrine, rawDamage, armorIgnore);
      spawnHitVisualsAt(t.citrine.x, t.citrine.y, t.citrine.maxHp, dmg, '#50b464');
    } else if (t.citrinebolt) {
      damageCitrineBolt(t.citrinebolt, rawDamage);
    } else if (t.iolite) {
      const dmg = damageIoliteEnemy(t.iolite, rawDamage, armorIgnore);
      spawnHitVisualsAt(t.iolite.x, t.iolite.y, t.iolite.maxHp, dmg, '#50b464');
    } else if (t.amethyst) {
      const dmg = damageAmethystEnemy(t.amethyst, rawDamage, armorIgnore, false);
      spawnHitVisualsAt(t.amethyst.x, t.amethyst.y, t.amethyst.maxHp, dmg, '#50b464');
    } else if (t.amethystshard) {
      damageAmethystShard(t.amethystshard, rawDamage);
    } else if (t.diamond) {
      const dmg = damageDiamondEnemy(t.diamond, rawDamage, armorIgnore);
      spawnHitVisualsAt(t.diamond.x, t.diamond.y, t.diamond.maxHp, dmg, '#50b464');
    } else if (t.diamondshard) {
      damageDiamondShard(t.diamondshard, rawDamage);
    } else if (t.nullstone) {
      const dmg = damageNullstoneEnemy(t.nullstone, rawDamage, armorIgnore);
      spawnHitVisualsAt(t.nullstone.x, t.nullstone.y, t.nullstone.maxHp, dmg, '#50b464');
    } else if (t.voidtendril) {
      damageVoidTendril(t.voidtendril, rawDamage);
    } else if (t.fracteryl) {
      const dmg = damageFracterylEnemy(t.fracteryl, rawDamage, armorIgnore);
      spawnHitVisualsAt(t.fracteryl.x, t.fracteryl.y, t.fracteryl.maxHp, dmg, '#50b464');
    } else if (t.fracterylshard) {
      damageFracterylShard(t.fracterylshard, rawDamage);
    } else if (t.eigenstein) {
      const dmg = damageEigensteinEnemy(t.eigenstein, rawDamage, armorIgnore);
      spawnHitVisualsAt(t.eigenstein.x, t.eigenstein.y, t.eigenstein.maxHp, dmg, '#50b464');
    } else if (t.polyomino) {
      const dmg = damagePolyominoEnemy(t.polyomino, rawDamage, armorIgnore);
      spawnHitVisualsAt(t.polyomino.x, t.polyomino.y, t.polyomino.maxHp, dmg, '#52b788');
    } else if (t.fissilePolyomino) {
      const dmg = damageFissilePolyominoEnemy(t.fissilePolyomino, rawDamage, armorIgnore);
      spawnHitVisualsAt(t.fissilePolyomino.x, t.fissilePolyomino.y, t.fissilePolyomino.maxHp, dmg, '#e9c46a');
    } else if (t.refractorPolyomino) {
      const dmg = damageRefractorPolyominoEnemy(t.refractorPolyomino, rawDamage, armorIgnore);
      spawnHitVisualsAt(t.refractorPolyomino.x, t.refractorPolyomino.y, t.refractorPolyomino.maxHp, dmg, '#00f5d4');
    } else if (t.elite) {
      const dmg = damageEliteEnemy(t.elite, rawDamage, armorIgnore);
      spawnHitVisualsAt(t.elite.x, t.elite.y, t.elite.maxHp, dmg, '#ffe060');
    } else if (t.boss) {
      const dmg = damageBossEnemy(rawDamage, armorIgnore);
      if (dmg > 0) spawnHitVisualsAt(t.boss.x, t.boss.y, t.boss.maxHp, dmg, '#50b464');
    } else if (t.alivenParticle && t.alivenGroup) {
      const dmg = ctx.damageAlivenParticle(t.alivenParticle, t.alivenGroup, rawDamage);
      if (dmg > 0) spawnHitVisualsAt(t.alivenParticle.x, t.alivenParticle.y, t.alivenParticle.maxHp, dmg, t.alivenParticle.glowColor);
    }
    // Lens status post-hit: apply Tier 1 statuses to target.
    if (attachedLens && weaponId) {
      const entity = extractMultiEntity(t);
      if (entity) {
        const statusParams = buildAllTier1StatusParams(attachedLens, weaponId, rawDamage);
        for (const p of statusParams) applyLensStatus(entity, p);
        const hasRift = attachedLens.effects.some(e => e.effectTier === 1 && e.tierId === 'eigenstein');
        if (hasRift) incrementRiftScarredStacks(entity, attachedLens.id);
      }
    }
    // Crafted post-hit: Nullstone pull at this target's position; Fracteryl from shared pool.
    if (craftedMods && fracterylPool) {
      const [hitX, hitY] = getSortEntryPos(t, mote.x, mote.y);
      applyCraftedPostHit(ctx, hitX, hitY, rawDamage, armorIgnore, craftedMods, rangeSq, fracterylPool, '#50b464');
    }
  }
}
