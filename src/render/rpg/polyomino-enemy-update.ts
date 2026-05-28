import type { RpgEnemyCtx } from './rpg-enemy-updates';
import type {
  FissilePolyominoEnemy,
  PolyominoEnemy,
  PolyominoLaser,
  RefractorPolyominoEnemy,
} from './polyomino-enemy-types';
import {
  FISSILE_SPLIT_CD_MS,
  POLYOMINO_CELL_SIZE,
  POLYOMINO_CLUSTER,
  POLYOMINO_CONTACT_CD_MS,
  POLYOMINO_LASER_LIFE_MS,
  stepPolyomino,
  getPolyominoCellWorldPos,
} from './polyomino-enemy-factories';
import { PLAYER_HIT_RADIUS } from './rpg-constants';

const CELL_CONTACT_RADIUS = POLYOMINO_CELL_SIZE * 0.5 + PLAYER_HIT_RADIUS;
const CELL_CONTACT_RADIUS_SQ = CELL_CONTACT_RADIUS * CELL_CONTACT_RADIUS;
const LASER_WIDTH_HALF = 2;
const LASER_RANGE = 200;

function _updateContact(
  enemy: { atk: number; contactCdMs: number; cells: { state: string; col: number; row: number }[]; gridOriginX: number; gridOriginY: number },
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  enemy.contactCdMs = Math.max(0, enemy.contactCdMs - deltaMs);
  if (enemy.contactCdMs > 0) return;
  for (let i = 0; i < enemy.cells.length; i++) {
    const cell = enemy.cells[i]!;
    if (cell.state === 'fadingOut') continue;
    const cx = enemy.gridOriginX + cell.col * POLYOMINO_CELL_SIZE;
    const cy = enemy.gridOriginY + cell.row * POLYOMINO_CELL_SIZE;
    const dx = cx - ctx.mote.x;
    const dy = cy - ctx.mote.y;
    if (dx * dx + dy * dy <= CELL_CONTACT_RADIUS_SQ) {
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      ctx.dealDamageToPlayerKnockback(enemy.atk, dx / len, dy / len);
      enemy.contactCdMs = POLYOMINO_CONTACT_CD_MS;
      return;
    }
  }
}

function _makeSplitChild(
  parent: FissilePolyominoEnemy,
  childCells: FissilePolyominoEnemy['cells'],
  driftAngle: number,
): FissilePolyominoEnemy {
  const hp = Math.max(1, parent.hp * 0.5);
  const maxHp = Math.max(hp, parent.maxHp * 0.5);
  return {
    kind: 'verdure_polyomino_fissile',
    x: parent.x,
    y: parent.y,
    hp,
    maxHp,
    atk: parent.atk,
    def: parent.def,
    cells: childCells,
    driftAngle,
    lastStepMs: parent.lastStepMs,
    lastDriftChangeMs: parent.lastDriftChangeMs,
    gridOriginX: parent.gridOriginX,
    gridOriginY: parent.gridOriginY,
    hitFlashMs: parent.hitFlashMs,
    contactCdMs: 0,
    splitGeneration: Math.min(4, parent.splitGeneration + 1),
    splitCdMs: FISSILE_SPLIT_CD_MS,
  };
}

function _splitFissile(enemies: FissilePolyominoEnemy[], index: number): void {
  const parent = enemies[index]!;
  if (parent.splitGeneration >= 4 || parent.hp <= 0) {
    parent.pendingSplit = false;
    return;
  }
  const evenCells: FissilePolyominoEnemy['cells'] = [];
  const oddCells: FissilePolyominoEnemy['cells'] = [];
  for (let i = 0; i < parent.cells.length; i++) {
    const src = parent.cells[i]!;
    const clone = {
      col: src.col,
      row: src.row,
      state: src.state,
      alpha: src.alpha,
      addedAtMs: src.addedAtMs,
    };
    if ((i & 1) === 0) evenCells.push(clone);
    else oddCells.push(clone);
  }
  if (evenCells.length === 0 || oddCells.length === 0) {
    parent.pendingSplit = false;
    return;
  }
  const c1 = _makeSplitChild(parent, evenCells, parent.driftAngle + Math.PI * 0.25);
  const c2 = _makeSplitChild(parent, oddCells, parent.driftAngle - Math.PI * 0.25);
  enemies.splice(index, 1, c1, c2);
}

function _updateLaserPlayerHit(laser: PolyominoLaser, ctx: RpgEnemyCtx): void {
  if (laser.hasHitPlayer) return;
  const px = ctx.mote.x - laser.originX;
  const py = ctx.mote.y - laser.originY;
  const dot = px * laser.dirX + py * laser.dirY;
  if (dot < 0 || dot > LASER_RANGE) return;
  const perp = Math.abs(px * laser.dirY - py * laser.dirX);
  if (perp > LASER_WIDTH_HALF + PLAYER_HIT_RADIUS) return;
  laser.hasHitPlayer = true;
  ctx.dealDamageToPlayer(laser.atk);
}

function _spawnRefractorLasers(
  enemy: RefractorPolyominoEnemy,
  x: number,
  y: number,
): void {
  enemy.lasers.push({ originX: x, originY: y, dirX: 1, dirY: 0, atk: enemy.atk, lifeMs: POLYOMINO_LASER_LIFE_MS, hasHitPlayer: false });
  enemy.lasers.push({ originX: x, originY: y, dirX: -1, dirY: 0, atk: enemy.atk, lifeMs: POLYOMINO_LASER_LIFE_MS, hasHitPlayer: false });
  enemy.lasers.push({ originX: x, originY: y, dirX: 0, dirY: 1, atk: enemy.atk, lifeMs: POLYOMINO_LASER_LIFE_MS, hasHitPlayer: false });
  enemy.lasers.push({ originX: x, originY: y, dirX: 0, dirY: -1, atk: enemy.atk, lifeMs: POLYOMINO_LASER_LIFE_MS, hasHitPlayer: false });
}

export function updatePolyominoEnemies(
  enemies: PolyominoEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
  nowMs: number,
): void {
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i]!;
    enemy.hitFlashMs = Math.max(0, enemy.hitFlashMs - deltaMs);
    stepPolyomino(enemy, ctx.mote.x, ctx.mote.y, nowMs, POLYOMINO_CLUSTER);
    _updateContact(enemy, ctx, deltaMs);
  }
}

export function updateFissilePolyominoEnemies(
  enemies: FissilePolyominoEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
  nowMs: number,
): void {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i]!;
    enemy.hitFlashMs = Math.max(0, enemy.hitFlashMs - deltaMs);
    enemy.splitCdMs = Math.max(0, enemy.splitCdMs - deltaMs);

    if (enemy.pendingSplit && enemy.splitGeneration < 4 && enemy.splitCdMs <= 0) {
      _splitFissile(enemies, i);
      continue;
    }
    enemy.pendingSplit = false;
    stepPolyomino(enemy, ctx.mote.x, ctx.mote.y, nowMs, POLYOMINO_CLUSTER + 2);
    _updateContact(enemy, ctx, deltaMs);
  }
}

export function updateRefractorPolyominoEnemies(
  enemies: RefractorPolyominoEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
  nowMs: number,
): void {
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i]!;
    enemy.hitFlashMs = Math.max(0, enemy.hitFlashMs - deltaMs);
    const step = stepPolyomino(enemy, ctx.mote.x, ctx.mote.y, nowMs, POLYOMINO_CLUSTER + 1);
    if (step.stepped && step.placedCell) {
      const pos = getPolyominoCellWorldPos(enemy, step.placedCell);
      _spawnRefractorLasers(enemy, pos.x, pos.y);
    }

    for (let li = enemy.lasers.length - 1; li >= 0; li--) {
      const laser = enemy.lasers[li]!;
      laser.lifeMs -= deltaMs;
      _updateLaserPlayerHit(laser, ctx);
      if (laser.lifeMs <= 0) enemy.lasers.splice(li, 1);
    }

    _updateContact(enemy, ctx, deltaMs);
  }
}
