/**
 * rpg-player-attack-aoe.ts — AOE weapon attack handler.
 *
 * Extracted from rpg-player-attack.ts. Handles the `aoe` weapon effect kind:
 * damages every enemy within a radius centred on the player mote, then emits
 * a fluid explosion.
 *
 * Imported and called by `performWeaponAttack` in rpg-player-attack.ts.
 */

import type { RpgPlayerAttackCtx } from './rpg-player-attack';
import {
  FLUID_EXPLOSION_STRENGTH, FLUID_PLAYER_R, FLUID_PLAYER_G, FLUID_PLAYER_B,
} from './rpg-constants';
import { POLYOMINO_CELL_SIZE } from './polyomino-enemy-factories';
import type { CraftedWeaponModifiers } from '../../data/rpg/crafted-weapon-types';
import { applyCraftedPostHit, makeFracterylPool } from './rpg-crafted-post-hit';
import { applyTier1LensStatusesToEnemy } from '../../sim/rpg/enemy-status-application';
import { handleLensTier2EffectsOnWeaponHit, extractT2TargetEntity } from './lens-tier2-effects';
import { handleLensTier3EffectsOnWeaponHit } from './lens-tier3-effects';
import { evaluateStatusCombosOnStatusApplied } from '../../sim/rpg/enemy-status-combos';
import { applyComboResults } from './rpg-combo-apply';

export function performAoeAttack(
  ctx: RpgPlayerAttackCtx,
  rawDamage: number,
  aoeRadius: number,
  armorIgnore = 0,
  craftedMods?: CraftedWeaponModifiers,
  rangeSq?: number,
  attachedLens?: import('../../data/rpg/lens-types').CraftedLensData,
  weaponId?: string,
): void {
  const {
    mote,
    enemies, sapphireEnemies, emeraldEnemies, amberEnemies, voidEnemies,
    quartzEnemies, rubyEnemies, sunstoneEnemies, citrineEnemies, ioliteEnemies,
    amethystEnemies, diamondEnemies, nullstoneEnemies, fracterylEnemies, eigensteinEnemies,
    polyominoEnemies, fissilePolyominoEnemies, refractorPolyominoEnemies,
    eliteEnemies, alivenGroups, horizonPentagonGroups,
    damageEnemy, damageSapphireEnemy, damageEmeraldEnemy, damageAmberEnemy, damageVoidEnemy,
    damageQuartzEnemy, damageRubyEnemy, damageSunstoneEnemy, damageCitrineEnemy,
    damageIoliteEnemy, damageAmethystEnemy, damageDiamondEnemy, damageNullstoneEnemy,
    damageFracterylEnemy, damageEigensteinEnemy,
    damagePolyominoEnemy, damageFissilePolyominoEnemy, damageRefractorPolyominoEnemy,
    damageEliteEnemy, damageBossEnemy,
    spawnHitVisuals, spawnHitVisualsAt, fluid,
  } = ctx;
  const bossEnemy = ctx.bossEnemy;
  const aoeSq = aoeRadius * aoeRadius;

  for (const enemy of enemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageEnemy(enemy, rawDamage, armorIgnore);
      spawnHitVisuals(enemy, dmg, '#e6c850');
    }
  }
  for (const enemy of sapphireEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageSapphireEnemy(enemy, rawDamage, armorIgnore, false);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of emeraldEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageEmeraldEnemy(enemy, rawDamage, armorIgnore);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of amberEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageAmberEnemy(enemy, rawDamage, armorIgnore);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of voidEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageVoidEnemy(enemy, rawDamage, armorIgnore);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of quartzEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageQuartzEnemy(enemy, rawDamage, armorIgnore);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of rubyEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageRubyEnemy(enemy, rawDamage, armorIgnore);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of sunstoneEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageSunstoneEnemy(enemy, rawDamage, armorIgnore);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of citrineEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageCitrineEnemy(enemy, rawDamage, armorIgnore);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of ioliteEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageIoliteEnemy(enemy, rawDamage, armorIgnore);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of amethystEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageAmethystEnemy(enemy, rawDamage, armorIgnore, false);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of diamondEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageDiamondEnemy(enemy, rawDamage, armorIgnore);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of nullstoneEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageNullstoneEnemy(enemy, rawDamage, armorIgnore);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of fracterylEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageFracterylEnemy(enemy, rawDamage, armorIgnore);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of eigensteinEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageEigensteinEnemy(enemy, rawDamage, armorIgnore);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of polyominoEnemies) {
    let inRange = false;
    for (let i = 0; i < enemy.cells.length; i++) {
      const c = enemy.cells[i]!;
      if (c.state === 'fadingOut') continue;
      const cx = enemy.gridOriginX + c.col * POLYOMINO_CELL_SIZE;
      const cy = enemy.gridOriginY + c.row * POLYOMINO_CELL_SIZE;
      const dx = cx - mote.x, dy = cy - mote.y;
      if (dx * dx + dy * dy <= aoeSq) { inRange = true; break; }
    }
    if (inRange) {
      const dmg = damagePolyominoEnemy(enemy, rawDamage, armorIgnore);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#52b788');
    }
  }
  for (const enemy of fissilePolyominoEnemies) {
    let inRange = false;
    for (let i = 0; i < enemy.cells.length; i++) {
      const c = enemy.cells[i]!;
      if (c.state === 'fadingOut') continue;
      const cx = enemy.gridOriginX + c.col * POLYOMINO_CELL_SIZE;
      const cy = enemy.gridOriginY + c.row * POLYOMINO_CELL_SIZE;
      const dx = cx - mote.x, dy = cy - mote.y;
      if (dx * dx + dy * dy <= aoeSq) { inRange = true; break; }
    }
    if (inRange) {
      const dmg = damageFissilePolyominoEnemy(enemy, rawDamage, armorIgnore);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e9c46a');
    }
  }
  for (const enemy of refractorPolyominoEnemies) {
    let inRange = false;
    for (let i = 0; i < enemy.cells.length; i++) {
      const c = enemy.cells[i]!;
      if (c.state === 'fadingOut') continue;
      const cx = enemy.gridOriginX + c.col * POLYOMINO_CELL_SIZE;
      const cy = enemy.gridOriginY + c.row * POLYOMINO_CELL_SIZE;
      const dx = cx - mote.x, dy = cy - mote.y;
      if (dx * dx + dy * dy <= aoeSq) { inRange = true; break; }
    }
    if (inRange) {
      const dmg = damageRefractorPolyominoEnemy(enemy, rawDamage, armorIgnore);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#00f5d4');
    }
  }
  for (const enemy of eliteEnemies) {
    if (enemy.isInvuln) continue;
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageEliteEnemy(enemy, rawDamage, armorIgnore);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#ffe060');
    }
  }
  if (bossEnemy) {
    const dx = bossEnemy.x - mote.x, dy = bossEnemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageBossEnemy(rawDamage, armorIgnore);
      if (dmg > 0) spawnHitVisualsAt(bossEnemy.x, bossEnemy.y, bossEnemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const group of alivenGroups) {
    for (const p of group.particles) {
      if (!p.isAlive) continue;
      const dx = p.x - mote.x, dy = p.y - mote.y;
      if (dx * dx + dy * dy <= aoeSq) {
        const dmg = ctx.damageAlivenParticle(p, group, rawDamage);
        if (dmg > 0) spawnHitVisualsAt(p.x, p.y, p.maxHp, dmg, p.glowColor);
      }
    }
  }
  for (const g of horizonPentagonGroups) {
    if (g.hp <= 0 || g.swapCdMs > 0) continue;
    const dx = g.x - mote.x, dy = g.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = ctx.damageHorizonPentagonReal(g, rawDamage, armorIgnore);
      if (dmg > 0) spawnHitVisualsAt(g.x, g.y, g.maxHp, dmg, '#6699ff');
    }
  }
  fluid.addExplosion(mote.x, mote.y, FLUID_EXPLOSION_STRENGTH,
    FLUID_PLAYER_R, FLUID_PLAYER_G, FLUID_PLAYER_B);

  // Lens status post-hit: apply Tier 1 statuses to all in-range enemies.
  if (attachedLens && weaponId) {
    const lensParams = buildAllTier1StatusParams(attachedLens, weaponId, rawDamage);
    if (lensParams.length > 0) {
      const mainArrays = [
        ...enemies, ...sapphireEnemies, ...emeraldEnemies, ...amberEnemies,
        ...voidEnemies, ...quartzEnemies, ...rubyEnemies, ...sunstoneEnemies,
        ...citrineEnemies, ...ioliteEnemies, ...amethystEnemies, ...diamondEnemies,
        ...nullstoneEnemies, ...fracterylEnemies, ...eigensteinEnemies, ...eliteEnemies,
      ];
      for (const e of mainArrays) {
        if (e.hp <= 0) continue;
        const dx = e.x - mote.x, dy = e.y - mote.y;
        if (dx * dx + dy * dy <= aoeSq) {
          for (const p of lensParams) applyLensStatus(e, p);
        }
      }
      if (bossEnemy && bossEnemy.hp > 0) {
        const bx = bossEnemy.x - mote.x, by = bossEnemy.y - mote.y;
        if (bx * bx + by * by <= aoeSq) {
          for (const p of lensParams) applyLensStatus(bossEnemy, p);
        }
      }
    }
  }

  // Lens Tier 2 post-hit: fired once per AoE burst (same as crafted post-hit).
  if (attachedLens && weaponId) {
    const closestForT2 = ctx.findClosestTarget(rangeSq ?? (300 * 300));
    const t2Entity = closestForT2 ? extractT2TargetEntity(closestForT2) : null;
    handleLensTier2EffectsOnWeaponHit({ targetEntity: t2Entity, hitDamage: rawDamage, lens: attachedLens, weaponId, ctx });
    handleLensTier3EffectsOnWeaponHit({ targetEntity: t2Entity, hitDamage: rawDamage, lens: attachedLens, weaponId, ctx });
  }

  // AoE status combo evaluation: check each in-range enemy for combo conditions.
  if (attachedLens && weaponId) {
    const nowMs = performance.now();
    type MinE = { x: number; y: number; hp: number };
    const regularArrays: MinE[][] = [
      enemies as unknown as MinE[],
      sapphireEnemies as unknown as MinE[],
      emeraldEnemies as unknown as MinE[],
      amberEnemies as unknown as MinE[],
      voidEnemies as unknown as MinE[],
      quartzEnemies as unknown as MinE[],
      rubyEnemies as unknown as MinE[],
      sunstoneEnemies as unknown as MinE[],
      citrineEnemies as unknown as MinE[],
      ioliteEnemies as unknown as MinE[],
      amethystEnemies as unknown as MinE[],
      diamondEnemies as unknown as MinE[],
      nullstoneEnemies as unknown as MinE[],
      fracterylEnemies as unknown as MinE[],
      eigensteinEnemies as unknown as MinE[],
    ];
    for (const arr of regularArrays) {
      for (const e of arr) {
        if (e.hp <= 0) continue;
        const dx = e.x - mote.x, dy = e.y - mote.y;
        if (dx * dx + dy * dy <= aoeSq) {
          const results = evaluateStatusCombosOnStatusApplied({
            enemy: e, enemyTypeId: 'other', x: e.x, y: e.y, baseDamage: rawDamage, nowMs,
          });
          applyComboResults(ctx, results);
        }
      }
    }
    for (const e of eliteEnemies) {
      if (e.isInvuln || e.hp <= 0) continue;
      const dx = e.x - mote.x, dy = e.y - mote.y;
      if (dx * dx + dy * dy <= aoeSq) {
        const results = evaluateStatusCombosOnStatusApplied({
          enemy: e, enemyTypeId: `elite_${e.tier}`, x: e.x, y: e.y, baseDamage: rawDamage, nowMs,
        });
        applyComboResults(ctx, results);
      }
    }
    if (bossEnemy && bossEnemy.hp > 0) {
      const bx = bossEnemy.x - mote.x, by = bossEnemy.y - mote.y;
      if (bx * bx + by * by <= aoeSq) {
        const results = evaluateStatusCombosOnStatusApplied({
          enemy: bossEnemy, enemyTypeId: 'boss', x: bossEnemy.x, y: bossEnemy.y, baseDamage: rawDamage, nowMs,
        });
        applyComboResults(ctx, results);
      }
    }
  }

  // Crafted post-hit: Nullstone pulls toward mote center; Fracteryl fires capped follow-ups.
  // Both are applied once per AoE burst (not per enemy hit) to avoid O(n²) pull cost.
  if (craftedMods && rangeSq !== undefined) {
    const pool = makeFracterylPool(craftedMods.fracterylStrikes);
    applyCraftedPostHit(ctx, mote.x, mote.y, rawDamage, armorIgnore, craftedMods, rangeSq, pool, '#e6c850');
  }
}
