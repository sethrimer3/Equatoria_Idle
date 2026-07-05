import type {
  FissilePolyominoEnemy,
  PolyominoCell,
  PolyominoEnemy,
  RefractorPolyominoEnemy,
} from './polyomino-enemy-types';
import {
  POLYOMINO_CELL_SIZE,
  POLYOMINO_FADE_MS,
  POLYOMINO_STEP_MS,
  FISSILE_SPLIT_CD_MS,
  getPolyominoCellWorldPos,
} from './polyomino-enemy-factories';
import { shouldDrawEnemyHealthBar, enemyHealthFraction } from './rpg-health-bar';

const HALF_CELL = POLYOMINO_CELL_SIZE * 0.5;
const LASER_RANGE = 200;

/** 0-1 anticipation fraction — rises toward 1 just before the next growth step lands. */
function _growthPulseFraction(enemy: { lastStepMs: number }, nowMs: number): number {
  const frac = (nowMs - enemy.lastStepMs) / POLYOMINO_STEP_MS;
  return Math.max(0, Math.min(1, frac));
}

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
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fillColor;
  ctx.fillRect(x0, y0, POLYOMINO_CELL_SIZE, POLYOMINO_CELL_SIZE);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = hitFlashMs > 0 ? 2.5 : 1.5;
  ctx.globalAlpha = Math.min(1, alpha + (hitFlashMs > 0 ? 0.45 : 0));
  ctx.strokeRect(x0, y0, POLYOMINO_CELL_SIZE, POLYOMINO_CELL_SIZE);
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
  ctx.globalAlpha = 1;
}

function _drawHpBar(
  ctx: CanvasRenderingContext2D,
  enemy: { hp: number; maxHp: number },
  displayX: number,
  displayY: number,
  color: string,
): void {
  if (!shouldDrawEnemyHealthBar(enemy)) return;
  const barW = 30;
  const barH = 2;
  const x = displayX - barW * 0.5;
  const y = displayY + HALF_CELL + 4;
  ctx.fillStyle = '#1b1b1b';
  ctx.fillRect(x, y, barW, barH);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, barW * enemyHealthFraction(enemy), barH);
}

/** Growth-pulse telegraph: a soft ring that brightens right before the next cell lands. */
function _drawGrowthPulse(
  ctx: CanvasRenderingContext2D,
  displayX: number,
  displayY: number,
  pulseFrac: number,
  color: string,
): void {
  if (pulseFrac < 0.55) return;
  const intensity = (pulseFrac - 0.55) / 0.45;
  ctx.save();
  ctx.globalAlpha = intensity * 0.35;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(displayX, displayY, HALF_CELL * (2 + intensity), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawPolyominoEnemies(
  ctx: CanvasRenderingContext2D,
  enemies: PolyominoEnemy[],
  nowMs: number,
): void {
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i]!;
    _drawCells(ctx, enemy, 'rgba(45,106,79,0.25)', '#52b788', nowMs);
    _drawGrowthPulse(ctx, enemy.displayX, enemy.displayY, _growthPulseFraction(enemy, nowMs), '#8ff0b8');
    _drawHpBar(ctx, enemy, enemy.displayX, enemy.displayY, '#52b788');
  }
}

export function drawFissilePolyominoEnemies(
  ctx: CanvasRenderingContext2D,
  enemies: FissilePolyominoEnemy[],
  nowMs: number,
): void {
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i]!;
    // Swelling/strain telegraph while a split is pending — cells visually bulge before shedding.
    const swelling = enemy.pendingSplit && enemy.splitGeneration < 4;
    const swellFrac = swelling ? 1 - Math.max(0, enemy.splitCdMs) / FISSILE_SPLIT_CD_MS : 0;
    if (swelling) {
      ctx.save();
      ctx.translate(enemy.displayX, enemy.displayY);
      ctx.scale(1 + swellFrac * 0.22, 1 + swellFrac * 0.22);
      ctx.translate(-enemy.displayX, -enemy.displayY);
      _drawCells(ctx, enemy, 'rgba(233,140,74,0.3)', '#f4a860', nowMs);
      ctx.restore();
    } else {
      _drawCells(ctx, enemy, 'rgba(212,168,67,0.22)', '#e9c46a', nowMs);
    }
    _drawGrowthPulse(ctx, enemy.displayX, enemy.displayY, _growthPulseFraction(enemy, nowMs), '#f4d888');
    _drawHpBar(ctx, enemy, enemy.displayX, enemy.displayY, '#e9c46a');
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
    // Origin cells glow and aim just before a growth step spawns fresh lasers.
    _drawGrowthPulse(ctx, enemy.displayX, enemy.displayY, _growthPulseFraction(enemy, nowMs), '#00f5d4');
    _drawHpBar(ctx, enemy, enemy.displayX, enemy.displayY, '#90e0ef');

    ctx.save();
    for (let li = 0; li < enemy.lasers.length; li++) {
      const laser = enemy.lasers[li]!;
      const warmingUp = laser.warmupMs > 0;
      const alpha = Math.max(0, Math.min(1, laser.lifeMs / 400));
      // Warning line: thin and dim while warming up, then thickens into the full damaging beam.
      ctx.strokeStyle = warmingUp ? '#ffffff' : '#00f5d4';
      ctx.lineWidth = warmingUp ? 1 : 2;
      ctx.shadowBlur = warmingUp ? 3 : 8;
      ctx.shadowColor = warmingUp ? '#ffffff' : '#00f5d4';
      ctx.globalAlpha = warmingUp ? alpha * 0.5 : alpha;
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
