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

export function performAoeAttack(
  ctx: RpgPlayerAttackCtx,
  rawDamage: number,
  aoeRadius: number,
): void {
  const {
    mote,
    enemies, sapphireEnemies, emeraldEnemies, amberEnemies, voidEnemies,
    quartzEnemies, rubyEnemies, sunstoneEnemies, citrineEnemies, ioliteEnemies,
    amethystEnemies, diamondEnemies, nullstoneEnemies, fracterylEnemies, eigensteinEnemies,
    eliteEnemies, alivenGroups,
    damageEnemy, damageSapphireEnemy, damageEmeraldEnemy, damageAmberEnemy, damageVoidEnemy,
    damageQuartzEnemy, damageRubyEnemy, damageSunstoneEnemy, damageCitrineEnemy,
    damageIoliteEnemy, damageAmethystEnemy, damageDiamondEnemy, damageNullstoneEnemy,
    damageFracterylEnemy, damageEigensteinEnemy, damageEliteEnemy, damageBossEnemy,
    spawnHitVisuals, spawnHitVisualsAt, fluid,
  } = ctx;
  const bossEnemy = ctx.bossEnemy;
  const aoeSq = aoeRadius * aoeRadius;

  for (const enemy of enemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageEnemy(enemy, rawDamage, 0);
      spawnHitVisuals(enemy, dmg, '#e6c850');
    }
  }
  for (const enemy of sapphireEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageSapphireEnemy(enemy, rawDamage, 0, false);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of emeraldEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageEmeraldEnemy(enemy, rawDamage, 0);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of amberEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageAmberEnemy(enemy, rawDamage, 0);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of voidEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageVoidEnemy(enemy, rawDamage, 0);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of quartzEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageQuartzEnemy(enemy, rawDamage, 0);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of rubyEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageRubyEnemy(enemy, rawDamage, 0);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of sunstoneEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageSunstoneEnemy(enemy, rawDamage, 0);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of citrineEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageCitrineEnemy(enemy, rawDamage, 0);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of ioliteEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageIoliteEnemy(enemy, rawDamage, 0);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of amethystEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageAmethystEnemy(enemy, rawDamage, 0, false);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of diamondEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageDiamondEnemy(enemy, rawDamage, 0);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of nullstoneEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageNullstoneEnemy(enemy, rawDamage, 0);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of fracterylEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageFracterylEnemy(enemy, rawDamage, 0);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of eigensteinEnemies) {
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageEigensteinEnemy(enemy, rawDamage, 0);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
    }
  }
  for (const enemy of eliteEnemies) {
    if (enemy.isInvuln) continue;
    const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageEliteEnemy(enemy, rawDamage, 0);
      spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#ffe060');
    }
  }
  if (bossEnemy) {
    const dx = bossEnemy.x - mote.x, dy = bossEnemy.y - mote.y;
    if (dx * dx + dy * dy <= aoeSq) {
      const dmg = damageBossEnemy(rawDamage, 0);
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
  fluid.addExplosion(mote.x, mote.y, FLUID_EXPLOSION_STRENGTH,
    FLUID_PLAYER_R, FLUID_PLAYER_G, FLUID_PLAYER_B);
}
