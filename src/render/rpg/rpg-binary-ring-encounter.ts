/**
 * rpg-binary-ring-encounter.ts — Binary Ring elite encounter logic + draw.
 */

export type BinaryRingAge = 'light' | 'dark';
export type BinaryRingPhase =
  | 'evolve'
  | 'telegraph_laser'
  | 'laser'
  | 'recover'
  | 'telegraph_missile'
  | 'missiles'
  | 'age_transition';

export interface BinaryRingEnemy {
  readonly kind: 'binary_ring';
  x: number; y: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  age: BinaryRingAge;
  phase: BinaryRingPhase;
  phaseMs: number;
  cycleCount: number;
  pulseMs: number;
  driftAngle: number;
  driftSpeed: number;
  laserAngle: number;
  laserSweepDir: 1 | -1;
}

export interface BinaryRingMissile {
  x: number; y: number;
  vx: number; vy: number;
  hp: number;
  atk: number;
  age: BinaryRingAge;
  lifeMs: number;
  hasHitPlayer: boolean;
  hitCdMs: number;
  trailX: Float32Array;
  trailY: Float32Array;
  trailHead: number;
  trailLen: number;
}

export interface BinaryLaserSweep {
  originX: number; originY: number;
  angle: number;
  sweepDir: 1 | -1;
  age: BinaryRingAge;
  lifeMs: number;
  maxLifeMs: number;
  hitCdMs: number;
  hasHitPlayer: boolean;
}

export const BINARY_RING_CONFIG = {
  HP: 2400,
  ATK: 18,
  DEF: 4,
  RADIUS: 28,

  EVOLVE_MIN_MS: 4000,
  EVOLVE_MAX_MS: 6000,
  TELEGRAPH_LASER_MS: 1500,
  LASER_ACTIVE_MS: 4000,
  RECOVER_MS: 1000,
  TELEGRAPH_MISSILE_MS: 1200,
  MISSILES_ACTIVE_MS: 6000,
  AGE_TRANSITION_MS: 2000,

  LASER_SWEEP_SPEED_RAD_PER_S: 0.65,
  LASER_DAMAGE_PER_HIT: 16,
  LASER_HIT_CD_MS: 400,
  LASER_RANGE: 320,

  MISSILE_COUNT: 3,
  MISSILE_SPEED: 68,
  MISSILE_TURN_RATE: 1.4,
  MISSILE_ATK: 14,
  MISSILE_HP: 60,
  MISSILE_TRAIL_LEN: 36,
  MISSILE_RADIUS: 10,
  MISSILE_LIFETIME_MS: 9000,
  MISSILE_HIT_CD_MS: 600,

  DRIFT_SPEED: 8,

  LOW_GRAPHICS_SCALE: 0.5,
  INTERNAL_RENDER_SCALE_HIGH: 1.0,
  INTERNAL_RENDER_SCALE_LOW: 0.5,
} as const;

const PLAYER_HIT_RADIUS = 6;
const LASER_ARC_HALF_WIDTH = 0.12;
const TWO_PI = Math.PI * 2;

const LIGHT_RING_COLORS = ['#fffef0', '#f5f0d0', '#e8e4c0'] as const;
const DARK_RING_COLORS = ['#2a1a3e', '#3a2850', '#4a2060'] as const;
const LIGHT_OPPOSITE_COLORS = ['#fffff0', '#f0ecc0', '#e8e4a0'] as const;
const DARK_OPPOSITE_COLORS = ['#1a0828', '#3a1050', '#4a1868'] as const;

function oppositeAge(age: BinaryRingAge): BinaryRingAge {
  return age === 'light' ? 'dark' : 'light';
}

function angleWrap(angle: number): number {
  while (angle > Math.PI) angle -= TWO_PI;
  while (angle < -Math.PI) angle += TWO_PI;
  return angle;
}


function evolveDurationMs(enemy: BinaryRingEnemy): number {
  const span = BINARY_RING_CONFIG.EVOLVE_MAX_MS - BINARY_RING_CONFIG.EVOLVE_MIN_MS;
  const t = 0.5 + 0.5 * Math.sin(enemy.driftAngle * 1.73 + enemy.cycleCount * 1.31);
  return BINARY_RING_CONFIG.EVOLVE_MIN_MS + span * t;
}

function getRingColors(age: BinaryRingAge): readonly string[] {
  return age === 'light' ? LIGHT_RING_COLORS : DARK_RING_COLORS;
}

function getOppositeColors(age: BinaryRingAge): readonly string[] {
  return age === 'light' ? DARK_OPPOSITE_COLORS : LIGHT_OPPOSITE_COLORS;
}

function updateMissileTrail(missile: BinaryRingMissile): void {
  missile.trailX[missile.trailHead] = missile.x;
  missile.trailY[missile.trailHead] = missile.y;
  missile.trailHead = (missile.trailHead + 1) % missile.trailX.length;
  if (missile.trailLen < missile.trailX.length) missile.trailLen += 1;
}

export function createBinaryRingEnemy(
  cx: number, cy: number,
  wave: number,
): BinaryRingEnemy {
  const dirSeed = Math.sin(wave * 1.913 + 0.73);
  const driftAngle = dirSeed * Math.PI;
  const driftSpeed = BINARY_RING_CONFIG.DRIFT_SPEED * (0.5 + 0.5 * Math.abs(Math.cos(wave * 0.91)));
  return {
    kind: 'binary_ring',
    x: cx,
    y: cy,
    hp: BINARY_RING_CONFIG.HP,
    maxHp: BINARY_RING_CONFIG.HP,
    atk: BINARY_RING_CONFIG.ATK + Math.max(0, wave - 3) * 1.25,
    def: BINARY_RING_CONFIG.DEF + Math.floor(Math.max(0, wave - 3) * 0.35),
    age: 'light',
    phase: 'evolve',
    phaseMs: 0,
    cycleCount: 0,
    pulseMs: wave * 173,
    driftAngle,
    driftSpeed,
    laserAngle: driftAngle,
    laserSweepDir: Math.cos(wave * 2.17) >= 0 ? 1 : -1,
  };
}

export function createBinaryRingMissile(
  x: number, y: number,
  targetX: number, targetY: number,
  age: BinaryRingAge,
  wave: number,
): BinaryRingMissile {
  const dx = targetX - x;
  const dy = targetY - y;
  const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const speed = BINARY_RING_CONFIG.MISSILE_SPEED + Math.max(0, wave - 3) * 1.2;
  const trailX = new Float32Array(BINARY_RING_CONFIG.MISSILE_TRAIL_LEN);
  const trailY = new Float32Array(BINARY_RING_CONFIG.MISSILE_TRAIL_LEN);
  for (let i = 0; i < BINARY_RING_CONFIG.MISSILE_TRAIL_LEN; i++) {
    trailX[i] = x;
    trailY[i] = y;
  }
  return {
    x,
    y,
    vx: (dx / dist) * speed,
    vy: (dy / dist) * speed,
    hp: BINARY_RING_CONFIG.MISSILE_HP + Math.max(0, wave - 3) * 4,
    atk: BINARY_RING_CONFIG.MISSILE_ATK + Math.max(0, wave - 3) * 1.1,
    age,
    lifeMs: BINARY_RING_CONFIG.MISSILE_LIFETIME_MS,
    hasHitPlayer: false,
    hitCdMs: 0,
    trailX,
    trailY,
    trailHead: 0,
    trailLen: 1,
  };
}

export function createBinaryLaserSweep(
  originX: number, originY: number,
  angle: number,
  sweepDir: 1 | -1,
  age: BinaryRingAge,
): BinaryLaserSweep {
  return {
    originX,
    originY,
    angle,
    sweepDir,
    age,
    lifeMs: BINARY_RING_CONFIG.LASER_ACTIVE_MS,
    maxLifeMs: BINARY_RING_CONFIG.LASER_ACTIVE_MS,
    hitCdMs: 0,
    hasHitPlayer: false,
  };
}

export function updateBinaryRingEnemy(
  enemy: BinaryRingEnemy,
  missiles: BinaryRingMissile[],
  laserSweep: BinaryLaserSweep | null,
  deltaMs: number,
  playerX: number, playerY: number,
  canvasW: number, canvasH: number,
): {
  newLaserSweep: BinaryLaserSweep | null;
  newMissiles: BinaryRingMissile[];
  setLaserSweep: BinaryLaserSweep | null;
} {
  const dt = deltaMs / 1000;
  enemy.phaseMs += deltaMs;
  enemy.pulseMs += deltaMs;

  // Ring stays locked at arena centre — no drift.
  const canvasCx = canvasW * 0.5;
  const canvasCy = canvasH * 0.5;
  enemy.x = canvasCx;
  enemy.y = canvasCy;

  const playerAngle = Math.atan2(playerY - enemy.y, playerX - enemy.x);
  enemy.laserAngle = angleWrap(enemy.laserAngle + angleWrap(playerAngle - enemy.laserAngle) * Math.min(1, dt * 1.2));

  let newLaserSweep: BinaryLaserSweep | null = null;
  const newMissiles: BinaryRingMissile[] = [];
  let setLaserSweep = laserSweep;

  if (enemy.phase === 'evolve') {
    if (enemy.phaseMs >= evolveDurationMs(enemy)) {
      enemy.phase = 'telegraph_laser';
      enemy.phaseMs = 0;
    }
  } else if (enemy.phase === 'telegraph_laser') {
    enemy.laserAngle = angleWrap(enemy.laserAngle + angleWrap(playerAngle - enemy.laserAngle) * Math.min(1, dt * 2.4));
    if (enemy.phaseMs >= BINARY_RING_CONFIG.TELEGRAPH_LASER_MS) {
      enemy.phase = 'laser';
      enemy.phaseMs = 0;
      newLaserSweep = createBinaryLaserSweep(enemy.x, enemy.y, enemy.laserAngle, enemy.laserSweepDir, oppositeAge(enemy.age));
      setLaserSweep = newLaserSweep;
    }
  } else if (enemy.phase === 'laser') {
    if (setLaserSweep) {
      setLaserSweep.originX = enemy.x;
      setLaserSweep.originY = enemy.y;
      setLaserSweep.sweepDir = enemy.laserSweepDir;
    }
    if (enemy.phaseMs >= BINARY_RING_CONFIG.LASER_ACTIVE_MS) {
      enemy.phase = 'recover';
      enemy.phaseMs = 0;
    }
  } else if (enemy.phase === 'recover') {
    if (enemy.phaseMs >= BINARY_RING_CONFIG.RECOVER_MS) {
      enemy.phase = 'telegraph_missile';
      enemy.phaseMs = 0;
    }
  } else if (enemy.phase === 'telegraph_missile') {
    if (enemy.phaseMs >= BINARY_RING_CONFIG.TELEGRAPH_MISSILE_MS) {
      enemy.phase = 'missiles';
      enemy.phaseMs = 0;
      const spawnAge = oppositeAge(enemy.age);
      for (let i = 0; i < BINARY_RING_CONFIG.MISSILE_COUNT; i++) {
        const angle = playerAngle + ((i - (BINARY_RING_CONFIG.MISSILE_COUNT - 1) * 0.5) * 0.62);
        const spawnRadius = BINARY_RING_CONFIG.RADIUS + 10;
        const mx = enemy.x + Math.cos(angle) * spawnRadius;
        const my = enemy.y + Math.sin(angle) * spawnRadius;
        newMissiles.push(createBinaryRingMissile(mx, my, playerX, playerY, spawnAge, enemy.cycleCount + 3));
      }
    }
  } else if (enemy.phase === 'missiles') {
    if (enemy.phaseMs >= BINARY_RING_CONFIG.MISSILES_ACTIVE_MS) {
      enemy.phaseMs = 0;
      enemy.cycleCount += 1;
      enemy.laserSweepDir = enemy.laserSweepDir === 1 ? -1 : 1;
      enemy.phase = enemy.cycleCount % 2 === 0 ? 'age_transition' : 'evolve';
    }
  } else if (enemy.phase === 'age_transition') {
    if (enemy.phaseMs >= BINARY_RING_CONFIG.AGE_TRANSITION_MS) {
      enemy.phase = 'evolve';
      enemy.phaseMs = 0;
      enemy.age = oppositeAge(enemy.age);
    }
  }

  void missiles;

  return { newLaserSweep, newMissiles, setLaserSweep };
}

export function updateBinaryRingMissiles(
  missiles: BinaryRingMissile[],
  deltaMs: number,
  playerX: number, playerY: number,
): number {
  let damage = 0;
  const dt = deltaMs / 1000;
  for (let i = missiles.length - 1; i >= 0; i--) {
    const missile = missiles[i]!;
    missile.lifeMs -= deltaMs;
    if (missile.hitCdMs > 0) missile.hitCdMs -= deltaMs;

    const currentAngle = Math.atan2(missile.vy, missile.vx);
    const targetAngle = Math.atan2(playerY - missile.y, playerX - missile.x);
    const maxTurn = BINARY_RING_CONFIG.MISSILE_TURN_RATE * dt;
    const deltaAngle = angleWrap(targetAngle - currentAngle);
    const newAngle = currentAngle + Math.max(-maxTurn, Math.min(maxTurn, deltaAngle));
    const speed = BINARY_RING_CONFIG.MISSILE_SPEED;
    missile.vx = Math.cos(newAngle) * speed;
    missile.vy = Math.sin(newAngle) * speed;

    missile.x += missile.vx * dt;
    missile.y += missile.vy * dt;
    updateMissileTrail(missile);

    const dx = playerX - missile.x;
    const dy = playerY - missile.y;
    const hitRadius = BINARY_RING_CONFIG.MISSILE_RADIUS + PLAYER_HIT_RADIUS;
    if (dx * dx + dy * dy <= hitRadius * hitRadius && missile.hitCdMs <= 0) {
      damage += missile.atk;
      missile.hitCdMs = BINARY_RING_CONFIG.MISSILE_HIT_CD_MS;
      missile.hasHitPlayer = true;
      missile.lifeMs = 0;
    }

    if (missile.lifeMs <= 0 || missile.hp <= 0) {
      missiles.splice(i, 1);
    }
  }
  return damage;
}

export function updateBinaryLaserSweep(
  sweep: BinaryLaserSweep,
  deltaMs: number,
  playerX: number, playerY: number,
  originX: number, originY: number,
): number {
  sweep.originX = originX;
  sweep.originY = originY;
  sweep.lifeMs -= deltaMs;
  if (sweep.hitCdMs > 0) sweep.hitCdMs -= deltaMs;
  sweep.angle = angleWrap(
    sweep.angle + BINARY_RING_CONFIG.LASER_SWEEP_SPEED_RAD_PER_S * (deltaMs / 1000) * sweep.sweepDir,
  );
  if (sweep.lifeMs <= 0) return 0;

  const dx = playerX - originX;
  const dy = playerY - originY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > BINARY_RING_CONFIG.LASER_RANGE) return 0;
  const playerAngle = Math.atan2(dy, dx);
  const angleDelta = Math.abs(angleWrap(playerAngle - sweep.angle));
  if (angleDelta > LASER_ARC_HALF_WIDTH || sweep.hitCdMs > 0) return 0;

  sweep.hitCdMs = BINARY_RING_CONFIG.LASER_HIT_CD_MS;
  sweep.hasHitPlayer = true;
  return BINARY_RING_CONFIG.LASER_DAMAGE_PER_HIT;
}

function drawTelegraphGlow(
  ctx: CanvasRenderingContext2D,
  enemy: BinaryRingEnemy,
  nowMs: number,
  phaseScale: number,
  colors: readonly string[],
): void {
  const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.01 + enemy.phaseMs * 0.012);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.18 + pulse * 0.22;
  ctx.strokeStyle = colors[1];
  ctx.lineWidth = 2.5 + pulse * 4 * phaseScale;
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y, BINARY_RING_CONFIG.RADIUS + 6 + pulse * 8 * phaseScale, 0, TWO_PI);
  ctx.stroke();
  ctx.restore();
}

function drawRingBody(
  ctx: CanvasRenderingContext2D,
  enemy: BinaryRingEnemy,
  nowMs: number,
): void {
  const colors = getRingColors(enemy.age);
  const pulse  = 0.5 + 0.5 * Math.sin(enemy.pulseMs * 0.0045);
  const ringR  = BINARY_RING_CONFIG.RADIUS + Math.sin(nowMs * 0.0014 + enemy.cycleCount) * 1.25;

  ctx.save();

  // Void core — a dark area so the accumulated field strands appear to orbit
  // something rather than dissolving into the background.
  ctx.globalAlpha = 0.5;
  ctx.fillStyle   = '#000';
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y, ringR * 1.2, 0, TWO_PI);
  ctx.fill();

  // Soft ambient glow layers — very low alpha, no hard circle edge.
  // These are drawn 'lighter' so they add a subtle luminous haze.
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const r = ringR * (0.85 + i * 0.38);
    ctx.globalAlpha = (0.038 + pulse * 0.018) * (1 - i * 0.25);
    ctx.fillStyle   = colors[Math.min(colors.length - 1, i)] ?? colors[0]!;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, r, 0, TWO_PI);
    ctx.fill();
  }

  // Minimal void-boundary ring — very thin, very faint; exists only for
  // targeting readability.  Not meant to look like a clean UI stroke.
  ctx.globalAlpha  = 0.07 + pulse * 0.05;
  ctx.strokeStyle  = colors[0]!;
  ctx.lineWidth    = 0.9;
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y, ringR, 0, TWO_PI);
  ctx.stroke();

  ctx.restore();

  // HP bar — gameplay-critical readability element.
  const hpRatio = Math.max(0, Math.min(1, enemy.hp / Math.max(1, enemy.maxHp)));
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = '#20181f';
  ctx.lineWidth   = 3;
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y - ringR - 10, 16, Math.PI, TWO_PI);
  ctx.stroke();
  ctx.strokeStyle = enemy.age === 'light' ? '#f7f2d0' : '#704890';
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y - ringR - 10, 16, Math.PI, Math.PI + Math.PI * hpRatio);
  ctx.stroke();
  ctx.restore();
}

function drawLaserSweep(
  ctx: CanvasRenderingContext2D,
  sweep: BinaryLaserSweep,
  nowMs: number,
  isLowGraphics: boolean,
): void {
  const colors = sweep.age === 'light' ? LIGHT_OPPOSITE_COLORS : DARK_OPPOSITE_COLORS;
  const dirX = Math.cos(sweep.angle);
  const dirY = Math.sin(sweep.angle);
  const perpX = -dirY;
  const perpY = dirX;
  const strandCount = isLowGraphics ? 14 : 28;
  const lifeT = 1 - Math.max(0, Math.min(1, sweep.lifeMs / sweep.maxLifeMs));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < strandCount; i++) {
    const lane = strandCount <= 1 ? 0 : (i / (strandCount - 1)) * 2 - 1;
    const offset = lane * (isLowGraphics ? 4 : 8);
    const jitter = Math.sin(nowMs * 0.003 + i * 1.17 + lifeT * 2.3) * (isLowGraphics ? 1.5 : 3);
    const startX = sweep.originX + perpX * offset;
    const startY = sweep.originY + perpY * offset;
    const segCount = isLowGraphics ? 10 : 18;
    ctx.globalAlpha = 0.05 + (1 - Math.abs(lane)) * 0.11;
    ctx.strokeStyle = colors[i % colors.length];
    ctx.lineWidth = isLowGraphics ? 0.8 : 1.1;
    ctx.beginPath();
    for (let s = 0; s <= segCount; s++) {
      const t = s / segCount;
      const wobble = Math.sin(t * 11 + nowMs * 0.0022 + i * 0.51) * jitter;
      const x = startX + dirX * BINARY_RING_CONFIG.LASER_RANGE * t + perpX * wobble;
      const y = startY + dirY * BINARY_RING_CONFIG.LASER_RANGE * t + perpY * wobble;
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.globalAlpha = 0.28;
  ctx.fillStyle = colors[0];
  ctx.beginPath();
  ctx.arc(
    sweep.originX + dirX * BINARY_RING_CONFIG.LASER_RANGE,
    sweep.originY + dirY * BINARY_RING_CONFIG.LASER_RANGE,
    isLowGraphics ? 5 : 8,
    0,
    TWO_PI,
  );
  ctx.fill();
  ctx.restore();
}

function drawMissiles(
  ctx: CanvasRenderingContext2D,
  missiles: BinaryRingMissile[],
  _nowMs: number,
  isLowGraphics: boolean,
): void {
  for (let i = 0; i < missiles.length; i++) {
    const missile = missiles[i]!;
    const colors  = missile.age === 'light' ? LIGHT_OPPOSITE_COLORS : DARK_OPPOSITE_COLORS;
    ctx.save();

    // Strand trail — drawn back-to-front so the head is brightest.
    const trailLen = Math.min(missile.trailLen - 1, isLowGraphics ? 14 : missile.trailX.length - 1);
    for (let t = 0; t < trailLen; t++) {
      const i0 = (missile.trailHead - 1 - t + missile.trailX.length)  % missile.trailX.length;
      const i1 = (missile.trailHead - 2 - t + missile.trailX.length)  % missile.trailX.length;
      const alpha = 0.28 * (1 - t / Math.max(1, trailLen));
      ctx.globalAlpha  = alpha;
      ctx.strokeStyle  = colors[t % colors.length];
      ctx.lineWidth    = isLowGraphics ? 0.9 : 1.1;
      ctx.beginPath();
      ctx.moveTo(missile.trailX[i0]!, missile.trailY[i0]!);
      ctx.lineTo(missile.trailX[i1]!, missile.trailY[i1]!);
      ctx.stroke();
    }

    // Soft ambient halo — no hard ring stroke.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.14;
    ctx.fillStyle   = colors[1];
    ctx.beginPath();
    ctx.arc(missile.x, missile.y, 10, 0, TWO_PI);
    ctx.fill();

    // Tiny bright core — much smaller than before, not a ring.
    ctx.globalAlpha = 0.6;
    ctx.fillStyle   = colors[0];
    ctx.beginPath();
    ctx.arc(missile.x, missile.y, 2, 0, TWO_PI);
    ctx.fill();

    ctx.restore();

    // Void-boundary hint ring for targeting readability — very thin and faint.
    ctx.save();
    ctx.globalAlpha  = 0.22;
    ctx.strokeStyle  = colors[1];
    ctx.lineWidth    = 0.8;
    ctx.beginPath();
    ctx.arc(missile.x, missile.y, 5, 0, TWO_PI);
    ctx.stroke();
    ctx.restore();
  }
}

export function drawBinaryRingEncounter(
  ctx: CanvasRenderingContext2D,
  enemy: BinaryRingEnemy,
  missiles: BinaryRingMissile[],
  laserSweep: BinaryLaserSweep | null,
  nowMs: number,
  isLowGraphics: boolean,
): void {
  drawRingBody(ctx, enemy, nowMs);

  if (enemy.phase === 'telegraph_laser') {
    drawTelegraphGlow(ctx, enemy, nowMs, 1, getOppositeColors(enemy.age));
  }
  if (enemy.phase === 'telegraph_missile') {
    drawTelegraphGlow(ctx, enemy, nowMs, 0.8, getOppositeColors(enemy.age));
  }
  if (enemy.phase === 'age_transition') {
    drawTelegraphGlow(ctx, enemy, nowMs, 1.2, getRingColors(oppositeAge(enemy.age)));
  }

  if (laserSweep) drawLaserSweep(ctx, laserSweep, nowMs, isLowGraphics);
  if (missiles.length > 0) drawMissiles(ctx, missiles, nowMs, isLowGraphics);
}
