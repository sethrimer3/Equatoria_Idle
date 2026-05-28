import type {
  FissilePolyominoEnemy,
  PolyominoCell,
  PolyominoEnemy,
  RefractorPolyominoEnemy,
} from './polyomino-enemy-types';
import {
  POLYOMINO_CELL_SIZE,
  POLYOMINO_FADE_MS,
  getPolyominoCellWorldPos,
} from './polyomino-enemy-factories';
import { shouldDrawEnemyHealthBar, enemyHealthFraction } from './rpg-health-bar';

const HALF_CELL = POLYOMINO_CELL_SIZE * 0.5;
const LASER_RANGE = 200;

function _drawCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  alpha: number,
  fillColor: string,
  strokeColor: string,
  hitFlashMs: number,
): void {
  if (alpha <= 0.01) return;
  const x0 = Math.floor(x - HALF_CELL);
  const y0 = Math.floor(y - HALF_CELL);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fillColor;
  ctx.fillRect(x0, y0, POLYOMINO_CELL_SIZE, POLYOMINO_CELL_SIZE);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = hitFlashMs > 0 ? 2.5 : 1.5;
  ctx.globalAlpha = Math.min(1, alpha + (hitFlashMs > 0 ? 0.45 : 0));
  ctx.strokeRect(x0, y0, POLYOMINO_CELL_SIZE, POLYOMINO_CELL_SIZE);
  ctx.restore();
}

function _drawCells(
  ctx: CanvasRenderingContext2D,
  enemy: {
    cells: PolyominoCell[];
    gridOriginX: number;
    gridOriginY: number;
    hitFlashMs: number;
  },
  fillColor: string,
  strokeColor: string,
  nowMs: number,
): void {
  for (let i = 0; i < enemy.cells.length; i++) {
    const cell = enemy.cells[i]!;
    const pos = getPolyominoCellWorldPos(enemy, cell);
    let alpha = cell.alpha;
    if (cell.state === 'fadingIn') {
      alpha = Math.max(alpha, Math.min(1, (nowMs - cell.addedAtMs) / POLYOMINO_FADE_MS));
    }
    _drawCell(ctx, pos.x, pos.y, alpha, fillColor, strokeColor, enemy.hitFlashMs);
  }
}

function _drawHpBar(
  ctx: CanvasRenderingContext2D,
  enemy: { x: number; y: number; hp: number; maxHp: number },
  color: string,
): void {
  if (!shouldDrawEnemyHealthBar(enemy)) return;
  const barW = 30;
  const barH = 2;
  const x = enemy.x - barW * 0.5;
  const y = enemy.y + HALF_CELL + 4;
  ctx.fillStyle = '#1b1b1b';
  ctx.fillRect(x, y, barW, barH);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, barW * enemyHealthFraction(enemy), barH);
}

export function drawPolyominoEnemies(
  ctx: CanvasRenderingContext2D,
  enemies: PolyominoEnemy[],
  nowMs: number,
): void {
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i]!;
    _drawCells(ctx, enemy, 'rgba(45,106,79,0.25)', '#52b788', nowMs);
    _drawHpBar(ctx, enemy, '#52b788');
  }
}

export function drawFissilePolyominoEnemies(
  ctx: CanvasRenderingContext2D,
  enemies: FissilePolyominoEnemy[],
  nowMs: number,
): void {
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i]!;
    _drawCells(ctx, enemy, 'rgba(212,168,67,0.22)', '#e9c46a', nowMs);
    _drawHpBar(ctx, enemy, '#e9c46a');
  }
}

export function drawRefractorPolyominoEnemies(
  ctx: CanvasRenderingContext2D,
  enemies: RefractorPolyominoEnemy[],
  nowMs: number,
): void {
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i]!;
    _drawCells(ctx, enemy, 'rgba(0,245,212,0.18)', '#90e0ef', nowMs);
    _drawHpBar(ctx, enemy, '#90e0ef');

    ctx.save();
    ctx.strokeStyle = '#00f5d4';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#00f5d4';
    for (let li = 0; li < enemy.lasers.length; li++) {
      const laser = enemy.lasers[li]!;
      const alpha = Math.max(0, Math.min(1, laser.lifeMs / 400));
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(laser.originX, laser.originY);
      ctx.lineTo(
        laser.originX + laser.dirX * LASER_RANGE,
        laser.originY + laser.dirY * LASER_RANGE,
      );
      ctx.stroke();
    }
    ctx.restore();
  }
}
