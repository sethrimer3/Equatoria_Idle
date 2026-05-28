import type {
  FissilePolyominoEnemy,
  PolyominoCell,
  PolyominoEnemy,
  RefractorPolyominoEnemy,
} from './polyomino-enemy-types';

export const POLYOMINO_CELL_SIZE = 20;
export const POLYOMINO_STEP_MS = 420;
export const POLYOMINO_FADE_MS = 1600;
export const POLYOMINO_CLUSTER = 12;
export const POLYOMINO_DRIFT_CHANGE_MS = 3200;
export const POLYOMINO_CONTACT_CD_MS = 600;
export const POLYOMINO_LASER_LIFE_MS = 400;
export const FISSILE_SPLIT_CD_MS = 1200;

const CARDINAL_ANGLES = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5] as const;

function _pickCardinalToward(dx: number, dy: number): number {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 0 : Math.PI;
  return dy >= 0 ? Math.PI * 0.5 : Math.PI * 1.5;
}

function _angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

function _cellKey(col: number, row: number): string {
  return `${col}:${row}`;
}

function _toCellWorldX(originX: number, col: number): number {
  return originX + col * POLYOMINO_CELL_SIZE;
}

function _toCellWorldY(originY: number, row: number): number {
  return originY + row * POLYOMINO_CELL_SIZE;
}

function _refreshCentroid(enemy: {
  x: number;
  y: number;
  gridOriginX: number;
  gridOriginY: number;
  cells: PolyominoCell[];
}): void {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i < enemy.cells.length; i++) {
    const c = enemy.cells[i]!;
    if (c.state === 'fadingOut') continue;
    sx += _toCellWorldX(enemy.gridOriginX, c.col);
    sy += _toCellWorldY(enemy.gridOriginY, c.row);
    n += 1;
  }
  if (n <= 0) {
    enemy.x = enemy.gridOriginX;
    enemy.y = enemy.gridOriginY;
    return;
  }
  enemy.x = sx / n;
  enemy.y = sy / n;
}

function _tickCells(cells: PolyominoCell[], nowMs: number): void {
  for (let i = cells.length - 1; i >= 0; i--) {
    const c = cells[i]!;
    const age = nowMs - c.addedAtMs;
    if (c.state === 'fadingIn') {
      c.alpha = Math.max(0, Math.min(1, age / POLYOMINO_FADE_MS));
      if (age >= POLYOMINO_FADE_MS) {
        c.state = 'visible';
        c.alpha = 1;
      }
    } else if (c.state === 'fadingOut') {
      c.alpha = Math.max(0, 1 - age / POLYOMINO_FADE_MS);
      if (age >= POLYOMINO_FADE_MS) {
        cells.splice(i, 1);
      }
    } else {
      c.alpha = 1;
    }
  }
}

function _selectStepAngle(
  driftAngle: number,
  headX: number,
  headY: number,
  targetX: number,
  targetY: number,
): number {
  const toward = _pickCardinalToward(targetX - headX, targetY - headY);
  let bestAngle: number = CARDINAL_ANGLES[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < CARDINAL_ANGLES.length; i++) {
    const a = CARDINAL_ANGLES[i]!;
    const score = _angleDiff(a, driftAngle) + _angleDiff(a, toward) * 0.8;
    if (score < bestScore) {
      bestScore = score;
      bestAngle = a;
    }
  }
  return bestAngle;
}

function _stepDir(angle: number): { dc: number; dr: number } {
  const a = _pickCardinalToward(Math.cos(angle), Math.sin(angle));
  if (a === 0) return { dc: 1, dr: 0 };
  if (a === Math.PI) return { dc: -1, dr: 0 };
  if (a === Math.PI * 0.5) return { dc: 0, dr: 1 };
  return { dc: 0, dr: -1 };
}

export function buildPolyominoSeedCells(clusterSize = POLYOMINO_CLUSTER, nowMs = performance.now()): PolyominoCell[] {
  const cells: PolyominoCell[] = [];
  const occupied = new Set<string>();
  let col = 0;
  let row = 0;
  for (let i = 0; i < clusterSize; i++) {
    cells.push({
      col,
      row,
      state: 'visible',
      alpha: 1,
      addedAtMs: nowMs,
    });
    occupied.add(_cellKey(col, row));
    const order = [0, 1, 2, 3];
    for (let j = order.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      const tmp = order[j]!;
      order[j] = order[k]!;
      order[k] = tmp;
    }
    let moved = false;
    for (let j = 0; j < order.length; j++) {
      const dir = order[j]!;
      const dc = dir === 0 ? 1 : dir === 1 ? -1 : 0;
      const dr = dir === 2 ? 1 : dir === 3 ? -1 : 0;
      const nc = col + dc;
      const nr = row + dr;
      if (occupied.has(_cellKey(nc, nr))) continue;
      col = nc;
      row = nr;
      moved = true;
      break;
    }
    if (!moved) {
      col += 1;
    }
  }
  return cells;
}

export function stepPolyomino(
  enemy: {
    driftAngle: number;
    lastStepMs: number;
    lastDriftChangeMs: number;
    gridOriginX: number;
    gridOriginY: number;
    cells: PolyominoCell[];
    x: number;
    y: number;
  },
  targetX: number,
  targetY: number,
  nowMs: number,
  targetLiveCells: number,
): { stepped: boolean; placedCell: PolyominoCell | null } {
  _tickCells(enemy.cells, nowMs);

  if (nowMs - enemy.lastDriftChangeMs >= POLYOMINO_DRIFT_CHANGE_MS) {
    enemy.lastDriftChangeMs = nowMs;
    const toward = _pickCardinalToward(targetX - enemy.x, targetY - enemy.y);
    enemy.driftAngle = toward + (Math.random() - 0.5) * (Math.PI / 3);
  }

  if (nowMs - enemy.lastStepMs < POLYOMINO_STEP_MS) {
    _refreshCentroid(enemy);
    return { stepped: false, placedCell: null };
  }

  enemy.lastStepMs = nowMs;
  const lastCell = enemy.cells.length > 0 ? enemy.cells[enemy.cells.length - 1]! : null;
  const headCol = lastCell?.col ?? 0;
  const headRow = lastCell?.row ?? 0;
  const headX = _toCellWorldX(enemy.gridOriginX, headCol);
  const headY = _toCellWorldY(enemy.gridOriginY, headRow);
  const stepAngle = _selectStepAngle(enemy.driftAngle, headX, headY, targetX, targetY);
  enemy.driftAngle = stepAngle;

  const occupied = new Set<string>();
  for (let i = 0; i < enemy.cells.length; i++) {
    const c = enemy.cells[i]!;
    if (c.state !== 'fadingOut') occupied.add(_cellKey(c.col, c.row));
  }

  const primary = _stepDir(stepAngle);
  const choices = [
    primary,
    { dc: -primary.dr, dr: primary.dc },
    { dc: primary.dr, dr: -primary.dc },
    { dc: -primary.dc, dr: -primary.dr },
  ];

  let nextCol = headCol + primary.dc;
  let nextRow = headRow + primary.dr;
  for (let i = 0; i < choices.length; i++) {
    const c = choices[i]!;
    const cc = headCol + c.dc;
    const rr = headRow + c.dr;
    if (!occupied.has(_cellKey(cc, rr))) {
      nextCol = cc;
      nextRow = rr;
      break;
    }
  }

  const placedCell: PolyominoCell = {
    col: nextCol,
    row: nextRow,
    state: 'fadingIn',
    alpha: 0,
    addedAtMs: nowMs,
  };
  enemy.cells.push(placedCell);

  let liveCount = 0;
  for (let i = 0; i < enemy.cells.length; i++) {
    if (enemy.cells[i]!.state !== 'fadingOut') liveCount += 1;
  }
  if (liveCount > targetLiveCells) {
    for (let i = 0; i < enemy.cells.length; i++) {
      const c = enemy.cells[i]!;
      if (c.state === 'fadingOut') continue;
      c.state = 'fadingOut';
      c.alpha = 1;
      c.addedAtMs = nowMs;
      break;
    }
  }

  _refreshCentroid(enemy);
  return { stepped: true, placedCell };
}

function _buildBaseStats(waveNumber: number, hpScale: number, atkScale: number): {
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
} {
  const maxHp = Math.max(45, Math.floor((70 + waveNumber * 14) * hpScale));
  return {
    hp: maxHp,
    maxHp,
    atk: Math.max(3, Math.floor((7 + waveNumber * 0.65) * atkScale)),
    def: Math.max(0, Math.floor(5 + waveNumber * 0.12)),
  };
}

function _initialOriginFor(x: number, y: number, cells: PolyominoCell[]): { ox: number; oy: number } {
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < cells.length; i++) {
    sx += cells[i]!.col;
    sy += cells[i]!.row;
  }
  const cx = cells.length > 0 ? sx / cells.length : 0;
  const cy = cells.length > 0 ? sy / cells.length : 0;
  return {
    ox: x - cx * POLYOMINO_CELL_SIZE,
    oy: y - cy * POLYOMINO_CELL_SIZE,
  };
}

export function makePolyominoEnemy(x: number, y: number, waveNumber: number): PolyominoEnemy {
  const nowMs = performance.now();
  const cells = buildPolyominoSeedCells(POLYOMINO_CLUSTER, nowMs);
  const origin = _initialOriginFor(x, y, cells);
  const stats = _buildBaseStats(waveNumber, 1.0, 1.0);
  return {
    kind: 'verdure_polyomino',
    x,
    y,
    ...stats,
    cells,
    driftAngle: Math.random() * Math.PI * 2,
    lastStepMs: nowMs,
    lastDriftChangeMs: nowMs,
    gridOriginX: origin.ox,
    gridOriginY: origin.oy,
    hitFlashMs: 0,
    contactCdMs: 0,
  };
}

export function makeFissilePolyominoEnemy(
  x: number,
  y: number,
  waveNumber: number,
  generation = 0,
): FissilePolyominoEnemy {
  const nowMs = performance.now();
  const cells = buildPolyominoSeedCells(POLYOMINO_CLUSTER + 2, nowMs);
  const origin = _initialOriginFor(x, y, cells);
  const stats = _buildBaseStats(waveNumber, 1.18, 1.05);
  return {
    kind: 'verdure_polyomino_fissile',
    x,
    y,
    ...stats,
    cells,
    driftAngle: Math.random() * Math.PI * 2,
    lastStepMs: nowMs,
    lastDriftChangeMs: nowMs,
    gridOriginX: origin.ox,
    gridOriginY: origin.oy,
    hitFlashMs: 0,
    contactCdMs: 0,
    splitGeneration: Math.max(0, Math.min(4, generation)),
    splitCdMs: 0,
  };
}

export function makeRefractorPolyominoEnemy(x: number, y: number, waveNumber: number): RefractorPolyominoEnemy {
  const nowMs = performance.now();
  const cells = buildPolyominoSeedCells(POLYOMINO_CLUSTER + 1, nowMs);
  const origin = _initialOriginFor(x, y, cells);
  const stats = _buildBaseStats(waveNumber, 0.95, 1.15);
  return {
    kind: 'verdure_polyomino_refractor',
    x,
    y,
    ...stats,
    cells,
    driftAngle: Math.random() * Math.PI * 2,
    lastStepMs: nowMs,
    lastDriftChangeMs: nowMs,
    gridOriginX: origin.ox,
    gridOriginY: origin.oy,
    hitFlashMs: 0,
    contactCdMs: 0,
    lasers: [],
  };
}

export function getPolyominoCellWorldPos(
  enemy: { gridOriginX: number; gridOriginY: number },
  cell: PolyominoCell,
): { x: number; y: number } {
  return {
    x: _toCellWorldX(enemy.gridOriginX, cell.col),
    y: _toCellWorldY(enemy.gridOriginY, cell.row),
  };
}

export function getPolyominoLiveCellCount(cells: PolyominoCell[]): number {
  let n = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i]!.state !== 'fadingOut') n += 1;
  }
  return n;
}
