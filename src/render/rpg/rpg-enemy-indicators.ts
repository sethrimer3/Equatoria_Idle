import type {
  SapphireEnemy,
  LaserEnemy,
} from './rpg-types';
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
  BossEnemy,
} from './rpg-enemy-types';
import type { AlivenParticleGroup } from './rpg-aliven-types';
import {
  SAPPHIRE_ENEMY_SIZE,
  LASER_ENEMY_SIZE,
  BOSS_SIZE_BASE,
} from './rpg-constants';
import {
  EMERALD_ENEMY_SIZE,
  AMBER_ENEMY_SIZE,
  VOID_ENEMY_SIZE,
  QUARTZ_ENEMY_SIZE,
  RUBY_ENEMY_SIZE,
  SUNSTONE_ENEMY_SIZE,
  CITRINE_ENEMY_SIZE,
  IOLITE_ENEMY_SIZE,
  AMETHYST_ENEMY_SIZE,
  DIAMOND_ENEMY_SIZE,
  NULLSTONE_ENEMY_SIZE,
  FRACTERYL_ENEMY_SIZE,
  EIGENSTEIN_ENEMY_SIZE,
} from './rpg-enemy-constants';

let isLowGraphicsMode = false;

export function setEnemyIndicatorLowGraphicsMode(enabled: boolean): void {
  isLowGraphicsMode = enabled;
}

/** Draws red triangle or outline indicators above all living enemies.
 *  Aliven groups receive a tier-colored marker at their group centroid. */
export function drawEnemyIndicators(
  ctx: CanvasRenderingContext2D,
  style: 'triangle' | 'outline' | 'off',
  enemies: LaserEnemy[],
  sapphireEnemies: SapphireEnemy[],
  emeraldEnemies: EmeraldEnemy[],
  amberEnemies: AmberEnemy[],
  voidEnemies: VoidEnemy[],
  quartzEnemies: QuartzEnemy[],
  rubyEnemies: RubyEnemy[],
  sunstoneEnemies: SunstoneEnemy[],
  citrineEnemies: CitrineEnemy[],
  ioliteEnemies: IoliteEnemy[],
  amethystEnemies: AmethystEnemy[],
  diamondEnemies: DiamondEnemy[],
  nullstoneEnemies: NullstoneEnemy[],
  fracterylEnemies: FracterylEnemy[],
  eigensteinEnemies: EigensteinEnemy[],
  bossEnemy: BossEnemy | null,
  alivenGroups: AlivenParticleGroup[],
): void {
  if (style === 'off') return;
  const drawMarker = (x: number, y: number, size: number, color = '#ff3b30'): void => {
    if (style === 'outline') {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      if (!isLowGraphicsMode) {
        ctx.shadowBlur = 6;
        ctx.shadowColor = color;
      }
      ctx.strokeRect(x - size / 2 - 2, y - size / 2 - 2, size + 4, size + 4);
      ctx.restore();
      return;
    }
    ctx.save();
    const markerY = y - size * 0.9 - 5;
    ctx.fillStyle = color;
    if (!isLowGraphicsMode) {
      ctx.shadowBlur = 5;
      ctx.shadowColor = color;
    }
    ctx.beginPath();
    ctx.moveTo(x, markerY);
    ctx.lineTo(x - 3, markerY - 5);
    ctx.lineTo(x + 3, markerY - 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  for (const enemy of enemies)          drawMarker(enemy.x, enemy.y, LASER_ENEMY_SIZE);
  for (const enemy of sapphireEnemies)  drawMarker(enemy.x, enemy.y, SAPPHIRE_ENEMY_SIZE);
  for (const enemy of emeraldEnemies)   drawMarker(enemy.x, enemy.y, EMERALD_ENEMY_SIZE);
  for (const enemy of amberEnemies)     drawMarker(enemy.x, enemy.y, AMBER_ENEMY_SIZE);
  for (const enemy of voidEnemies)      drawMarker(enemy.x, enemy.y, VOID_ENEMY_SIZE);
  for (const enemy of quartzEnemies)    drawMarker(enemy.x, enemy.y, QUARTZ_ENEMY_SIZE);
  for (const enemy of rubyEnemies)      drawMarker(enemy.x, enemy.y, RUBY_ENEMY_SIZE);
  for (const enemy of sunstoneEnemies)  drawMarker(enemy.x, enemy.y, SUNSTONE_ENEMY_SIZE);
  for (const enemy of citrineEnemies)   drawMarker(enemy.x, enemy.y, CITRINE_ENEMY_SIZE);
  for (const enemy of ioliteEnemies)    drawMarker(enemy.x, enemy.y, IOLITE_ENEMY_SIZE);
  for (const enemy of amethystEnemies)  drawMarker(enemy.x, enemy.y, AMETHYST_ENEMY_SIZE);
  for (const enemy of diamondEnemies)   drawMarker(enemy.x, enemy.y, DIAMOND_ENEMY_SIZE);
  for (const enemy of nullstoneEnemies) drawMarker(enemy.x, enemy.y, NULLSTONE_ENEMY_SIZE);
  for (const enemy of fracterylEnemies) drawMarker(enemy.x, enemy.y, FRACTERYL_ENEMY_SIZE);
  for (const enemy of eigensteinEnemies) drawMarker(enemy.x, enemy.y, EIGENSTEIN_ENEMY_SIZE);
  if (bossEnemy) drawMarker(bossEnemy.x, bossEnemy.y, BOSS_SIZE_BASE * 2);
  for (const group of alivenGroups) {
    if (group.aliveCount <= 0) continue;
    const groupColor = group.particles.find(p => p.isAlive)?.glowColor ?? '#aaaaff';
    drawMarker(group.cx, group.cy, 8, groupColor);
  }
}
