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
import { getLingeringHexDamageMult } from '../../sim/rpg/weave-enemy-debuffs';
import { applyTier1LensStatusesToEnemy } from '../../sim/rpg/enemy-status-application';
import { getEmberDurationMult, getEmberPotencyMult, getEmberOverloadChancePct } from '../../data/rpg/weave-proc-effects';
import { handleLensTier2EffectsOnWeaponHit } from './lens-tier2-effects';
import { handleLensTier3EffectsOnWeaponHit } from './lens-tier3-effects';
import type { CombinedEquipmentModifiers } from '../../data/rpg/equipment-modifiers';

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

function getMultiEnemyTypeId(t: MultiSortEntry): string {
  if (t.sapphire) return 'sapphire';
  if (t.emerald) return 'emerald';
  if (t.ruby) return 'ruby';
  if (t.nullstone) return 'nullstone';
  if (t.fracteryl) return 'fracteryl';
  if (t.eigenstein) return 'eigenstein';
  if (t.elite) return `elite_${t.elite.tier}`;
  if (t.boss) return 'boss';
  return 'other';
}

// ── Handler ───────────────────────────────────────────────────────────────────

export function performMultiAttack(
  ctx: RpgPlayerAttackCtx,
  rawDamage: number,
  rangeSq: number,
  targetCount: number,
  armorIgnore = 0,
  craftedMods?: CraftedWeaponModifiers,
  equipment?: CombinedEquipmentModifiers,
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
    const hexEntity = extractMultiEntity(t);
    const effectiveDmg = hexEntity ? rawDamage * getLingeringHexDamageMult(hexEntity) : rawDamage;
    if (t.laser) {
      const dmg = damageEnemy(t.laser, effectiveDmg, armorIgnore);
      spawnHitVisuals(t.laser, dmg, '#50b464');
      if (dmg > 0) ctx.onWeaponHitEnemy?.(dmg, t.laser.x, t.laser.y, t.laser.maxHp, (b) => damageEnemy(t.laser!, b, 1), hexEntity ?? undefined);
    } else if (t.sapphire) {
      const dmg = damageSapphireEnemy(t.sapphire, effectiveDmg, armorIgnore, false);
      spawnHitVisualsAt(t.sapphire.x, t.sapphire.y, t.sapphire.maxHp, dmg, '#50b464');
      if (dmg > 0) ctx.onWeaponHitEnemy?.(dmg, t.sapphire.x, t.sapphire.y, t.sapphire.maxHp, (b) => damageSapphireEnemy(t.sapphire!, b, 1, false), hexEntity ?? undefined);
    } else if (t.missile) {
      // Echo Strike does not trigger from sapphire sub-missiles.
      damageMissile(t.missile, effectiveDmg);
    } else if (t.emerald) {
      const dmg = damageEmeraldEnemy(t.emerald, effectiveDmg, armorIgnore);
      spawnHitVisualsAt(t.emerald.x, t.emerald.y, t.emerald.maxHp, dmg, '#50b464');
      if (dmg > 0) ctx.onWeaponHitEnemy?.(dmg, t.emerald.x, t.emerald.y, t.emerald.maxHp, (b) => damageEmeraldEnemy(t.emerald!, b, 1), hexEntity ?? undefined);
    } else if (t.amber) {
      const dmg = damageAmberEnemy(t.amber, effectiveDmg, armorIgnore);
      spawnHitVisualsAt(t.amber.x, t.amber.y, t.amber.maxHp, dmg, '#50b464');
      if (dmg > 0) ctx.onWeaponHitEnemy?.(dmg, t.amber.x, t.amber.y, t.amber.maxHp, (b) => damageAmberEnemy(t.amber!, b, 1), hexEntity ?? undefined);
    } else if (t.ambershard) {
      // Echo Strike does not trigger from amber sub-shards.
      damageAmberShard(t.ambershard, effectiveDmg);
    } else if (t.void) {
      const dmg = damageVoidEnemy(t.void, effectiveDmg, armorIgnore);
      spawnHitVisualsAt(t.void.x, t.void.y, t.void.maxHp, dmg, '#50b464');
      if (dmg > 0) ctx.onWeaponHitEnemy?.(dmg, t.void.x, t.void.y, t.void.maxHp, (b) => damageVoidEnemy(t.void!, b, 1), hexEntity ?? undefined);
    } else if (t.quartz) {
      const dmg = damageQuartzEnemy(t.quartz, effectiveDmg, armorIgnore);
      spawnHitVisualsAt(t.quartz.x, t.quartz.y, t.quartz.maxHp, dmg, '#50b464');
      if (dmg > 0) ctx.onWeaponHitEnemy?.(dmg, t.quartz.x, t.quartz.y, t.quartz.maxHp, (b) => damageQuartzEnemy(t.quartz!, b, 1), hexEntity ?? undefined);
    } else if (t.quartzspike) {
      // Echo Strike does not trigger from quartz sub-spikes.
      damageQuartzSpike(t.quartzspike, effectiveDmg);
    } else if (t.ruby) {
      const dmg = damageRubyEnemy(t.ruby, effectiveDmg, armorIgnore);
      spawnHitVisualsAt(t.ruby.x, t.ruby.y, t.ruby.maxHp, dmg, '#50b464');
      if (dmg > 0) ctx.onWeaponHitEnemy?.(dmg, t.ruby.x, t.ruby.y, t.ruby.maxHp, (b) => damageRubyEnemy(t.ruby!, b, 1), hexEntity ?? undefined);
    } else if (t.rubybolt) {
      // Echo Strike does not trigger from ruby sub-bolts.
      damageRubyBolt(t.rubybolt, effectiveDmg);
    } else if (t.sunstone) {
      const dmg = damageSunstoneEnemy(t.sunstone, effectiveDmg, armorIgnore);
      spawnHitVisualsAt(t.sunstone.x, t.sunstone.y, t.sunstone.maxHp, dmg, '#50b464');
      if (dmg > 0) ctx.onWeaponHitEnemy?.(dmg, t.sunstone.x, t.sunstone.y, t.sunstone.maxHp, (b) => damageSunstoneEnemy(t.sunstone!, b, 1), hexEntity ?? undefined);
    } else if (t.citrine) {
      const dmg = damageCitrineEnemy(t.citrine, effectiveDmg, armorIgnore);
      spawnHitVisualsAt(t.citrine.x, t.citrine.y, t.citrine.maxHp, dmg, '#50b464');
      if (dmg > 0) ctx.onWeaponHitEnemy?.(dmg, t.citrine.x, t.citrine.y, t.citrine.maxHp, (b) => damageCitrineEnemy(t.citrine!, b, 1), hexEntity ?? undefined);
    } else if (t.citrinebolt) {
      // Echo Strike does not trigger from citrine sub-bolts.
      damageCitrineBolt(t.citrinebolt, effectiveDmg);
    } else if (t.iolite) {
      const dmg = damageIoliteEnemy(t.iolite, effectiveDmg, armorIgnore);
      spawnHitVisualsAt(t.iolite.x, t.iolite.y, t.iolite.maxHp, dmg, '#50b464');
      if (dmg > 0) ctx.onWeaponHitEnemy?.(dmg, t.iolite.x, t.iolite.y, t.iolite.maxHp, (b) => damageIoliteEnemy(t.iolite!, b, 1), hexEntity ?? undefined);
    } else if (t.amethyst) {
      const dmg = damageAmethystEnemy(t.amethyst, effectiveDmg, armorIgnore, false);
      spawnHitVisualsAt(t.amethyst.x, t.amethyst.y, t.amethyst.maxHp, dmg, '#50b464');
      if (dmg > 0) ctx.onWeaponHitEnemy?.(dmg, t.amethyst.x, t.amethyst.y, t.amethyst.maxHp, (b) => damageAmethystEnemy(t.amethyst!, b, 1, false), hexEntity ?? undefined);
    } else if (t.amethystshard) {
      // Echo Strike does not trigger from amethyst sub-shards.
      damageAmethystShard(t.amethystshard, effectiveDmg);
    } else if (t.diamond) {
      const dmg = damageDiamondEnemy(t.diamond, effectiveDmg, armorIgnore);
      spawnHitVisualsAt(t.diamond.x, t.diamond.y, t.diamond.maxHp, dmg, '#50b464');
      if (dmg > 0) ctx.onWeaponHitEnemy?.(dmg, t.diamond.x, t.diamond.y, t.diamond.maxHp, (b) => damageDiamondEnemy(t.diamond!, b, 1), hexEntity ?? undefined);
    } else if (t.diamondshard) {
      // Echo Strike does not trigger from diamond sub-shards.
      damageDiamondShard(t.diamondshard, effectiveDmg);
    } else if (t.nullstone) {
      const dmg = damageNullstoneEnemy(t.nullstone, effectiveDmg, armorIgnore);
      spawnHitVisualsAt(t.nullstone.x, t.nullstone.y, t.nullstone.maxHp, dmg, '#50b464');
      if (dmg > 0) ctx.onWeaponHitEnemy?.(dmg, t.nullstone.x, t.nullstone.y, t.nullstone.maxHp, (b) => damageNullstoneEnemy(t.nullstone!, b, 1), hexEntity ?? undefined);
    } else if (t.voidtendril) {
      // Echo Strike does not trigger from void sub-tendrils.
      damageVoidTendril(t.voidtendril, effectiveDmg);
    } else if (t.fracteryl) {
      const dmg = damageFracterylEnemy(t.fracteryl, effectiveDmg, armorIgnore);
      spawnHitVisualsAt(t.fracteryl.x, t.fracteryl.y, t.fracteryl.maxHp, dmg, '#50b464');
      if (dmg > 0) ctx.onWeaponHitEnemy?.(dmg, t.fracteryl.x, t.fracteryl.y, t.fracteryl.maxHp, (b) => damageFracterylEnemy(t.fracteryl!, b, 1), hexEntity ?? undefined);
    } else if (t.fracterylshard) {
      // Echo Strike does not trigger from fracteryl sub-shards.
      damageFracterylShard(t.fracterylshard, effectiveDmg);
    } else if (t.eigenstein) {
      const dmg = damageEigensteinEnemy(t.eigenstein, effectiveDmg, armorIgnore);
      spawnHitVisualsAt(t.eigenstein.x, t.eigenstein.y, t.eigenstein.maxHp, dmg, '#50b464');
      if (dmg > 0) ctx.onWeaponHitEnemy?.(dmg, t.eigenstein.x, t.eigenstein.y, t.eigenstein.maxHp, (b) => damageEigensteinEnemy(t.eigenstein!, b, 1), hexEntity ?? undefined);
    } else if (t.polyomino) {
      const dmg = damagePolyominoEnemy(t.polyomino, effectiveDmg, armorIgnore);
      spawnHitVisualsAt(t.polyomino.x, t.polyomino.y, t.polyomino.maxHp, dmg, '#52b788');
      if (dmg > 0) ctx.onWeaponHitEnemy?.(dmg, t.polyomino.x, t.polyomino.y, t.polyomino.maxHp, (b) => damagePolyominoEnemy(t.polyomino!, b, 1), hexEntity ?? undefined);
    } else if (t.fissilePolyomino) {
      const dmg = damageFissilePolyominoEnemy(t.fissilePolyomino, effectiveDmg, armorIgnore);
      spawnHitVisualsAt(t.fissilePolyomino.x, t.fissilePolyomino.y, t.fissilePolyomino.maxHp, dmg, '#e9c46a');
      if (dmg > 0) ctx.onWeaponHitEnemy?.(dmg, t.fissilePolyomino.x, t.fissilePolyomino.y, t.fissilePolyomino.maxHp, (b) => damageFissilePolyominoEnemy(t.fissilePolyomino!, b, 1), hexEntity ?? undefined);
    } else if (t.refractorPolyomino) {
      const dmg = damageRefractorPolyominoEnemy(t.refractorPolyomino, effectiveDmg, armorIgnore);
      spawnHitVisualsAt(t.refractorPolyomino.x, t.refractorPolyomino.y, t.refractorPolyomino.maxHp, dmg, '#00f5d4');
      if (dmg > 0) ctx.onWeaponHitEnemy?.(dmg, t.refractorPolyomino.x, t.refractorPolyomino.y, t.refractorPolyomino.maxHp, (b) => damageRefractorPolyominoEnemy(t.refractorPolyomino!, b, 1), hexEntity ?? undefined);
    } else if (t.elite) {
      const dmg = damageEliteEnemy(t.elite, effectiveDmg, armorIgnore);
      spawnHitVisualsAt(t.elite.x, t.elite.y, t.elite.maxHp, dmg, '#ffe060');
      if (dmg > 0) ctx.onWeaponHitEnemy?.(dmg, t.elite.x, t.elite.y, t.elite.maxHp, (b) => damageEliteEnemy(t.elite!, b, 1), hexEntity ?? undefined);
    } else if (t.boss) {
      const dmg = damageBossEnemy(effectiveDmg, armorIgnore);
      if (dmg > 0) spawnHitVisualsAt(t.boss.x, t.boss.y, t.boss.maxHp, dmg, '#50b464');
      if (dmg > 0) ctx.onWeaponHitEnemy?.(dmg, t.boss.x, t.boss.y, t.boss.maxHp, (b) => damageBossEnemy(b, 1), hexEntity ?? undefined);
    } else if (t.alivenParticle && t.alivenGroup) {
      const dmg = ctx.damageAlivenParticle(t.alivenParticle, t.alivenGroup, effectiveDmg);
      if (dmg > 0) spawnHitVisualsAt(t.alivenParticle.x, t.alivenParticle.y, t.alivenParticle.maxHp, dmg, t.alivenParticle.glowColor);
      if (dmg > 0) ctx.onWeaponHitEnemy?.(dmg, t.alivenParticle.x, t.alivenParticle.y, t.alivenParticle.maxHp, (b) => ctx.damageAlivenParticle(t.alivenParticle!, t.alivenGroup!, b), hexEntity ?? undefined);
    }
    // Lens status post-hit: apply Tier 1 statuses to target.
    if (equipment?.lens && weaponId) {
      if (hexEntity) {
        applyTier1LensStatusesToEnemy({
          enemy: hexEntity,
          lens: equipment.lens,
          weaponId,
          hitDamage: rawDamage,
          enemyTypeId: getMultiEnemyTypeId(t),
          statusPowerPct: equipment?.statusChancePct,
          emberDurationMult: getEmberDurationMult(ctx.rpgSimState),
          emberPotencyMult: getEmberPotencyMult(ctx.rpgSimState),
          emberOverloadChancePct: getEmberOverloadChancePct(ctx.rpgSimState),
        });
        handleLensTier2EffectsOnWeaponHit({ targetEntity: hexEntity, hitDamage: rawDamage, lens: equipment.lens, weaponId, ctx });
        handleLensTier3EffectsOnWeaponHit({ targetEntity: hexEntity, hitDamage: rawDamage, lens: equipment.lens, weaponId, ctx });
      }
    }
    // Crafted post-hit: Nullstone pull at this target's position; Fracteryl from shared pool.
    if (craftedMods && fracterylPool) {
      const [hitX, hitY] = getSortEntryPos(t, mote.x, mote.y);
      applyCraftedPostHit(ctx, hitX, hitY, rawDamage, armorIgnore, craftedMods, rangeSq, fracterylPool, '#50b464');
    }
  }
}


