export interface PolyominoCell {
  col: number;
  row: number;
  state: 'fadingIn' | 'visible' | 'fadingOut';
  alpha: number;
  addedAtMs: number;
}

export interface PolyominoLaser {
  originX: number;
  originY: number;
  dirX: number;
  dirY: number;
  atk: number;
  lifeMs: number;
  hasHitPlayer: boolean;
}

export interface PolyominoEnemy {
  readonly kind: 'verdure_polyomino';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  cells: PolyominoCell[];
  driftAngle: number;
  lastStepMs: number;
  lastDriftChangeMs: number;
  gridOriginX: number;
  gridOriginY: number;
  hitFlashMs: number;
  contactCdMs: number;
}

export interface FissilePolyominoEnemy {
  readonly kind: 'verdure_polyomino_fissile';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  cells: PolyominoCell[];
  driftAngle: number;
  lastStepMs: number;
  lastDriftChangeMs: number;
  gridOriginX: number;
  gridOriginY: number;
  hitFlashMs: number;
  contactCdMs: number;
  splitGeneration: number;
  splitCdMs: number;
  pendingSplit?: boolean;
}

export interface RefractorPolyominoEnemy {
  readonly kind: 'verdure_polyomino_refractor';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  cells: PolyominoCell[];
  driftAngle: number;
  lastStepMs: number;
  lastDriftChangeMs: number;
  gridOriginX: number;
  gridOriginY: number;
  hitFlashMs: number;
  contactCdMs: number;
  lasers: PolyominoLaser[];
}
