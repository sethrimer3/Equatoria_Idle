/**
 * rpg-render.ts — RPG tab rendering system.
 *
 * Manages an independent low-resolution canvas with:
 *   - A player-controllable sand mote (3x3 pixels, always-glowing)
 *   - Touch joystick (mobile) and WASD / Arrow key (desktop) controls
 *   - A smoothly interpolated comet-glow effect behind the player mote
 *   - Laser enemies (2x2 red motes) with patrol, attack-detect, dash, and cooldown phases
 *   - A bezier lineDash attack-trail effect during the enemy dash
 *   - A DOM stats panel (HP / ATK / DEF / WAVE / BOOST) above the navigation bar
 *   - A data-driven wave system (see src/data/rpg/wave-definitions.ts)
 *   - A smooth death to restart loop with visual transition effects
 *   - Player auto-attack: shoots the closest enemy each cooldown tick.
 *     Weapon effects: single (closest), multi (N closest), aoe (all in radius),
 *     piercing (closest, partial DEF bypass).
 *
 * Internal resolution is FIXED at 320x568 (9:16 portrait). CSS letterboxes
 * or pillarboxes the canvas inside its container so pixels always scale uniformly
 * rather than stretching to fill on desktop.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getWaveDefinition } from '../../data/rpg/wave-definitions';
import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';

const INTERNAL_WIDTH  = 320;
const INTERNAL_HEIGHT = 568;

const RPG_TRAIL_CAPACITY   = 60;
const MAX_RPG_SPEED        = 3.0;
const RPG_VELOCITY_DAMPING = 0.88;
const RPG_MOTE_SIZE        = 3;
const RPG_MOTE_COLOR       = '#ffd764';
const RPG_MOTE_GLOW        = '#ffe599';
const TRAIL_SPEED_THRESHOLD = 0.15;
const GLOW_PULSE_SPEED      = 2.5;
const GLOW_MOVE_RAMP_UP   = 0.007;
const GLOW_MOVE_RAMP_DOWN = 0.004;

const PLAYER_HP_INIT  = 100;
const PLAYER_ATK_INIT =  10;
const PLAYER_DEF_INIT =   5;

const JOYSTICK_OUTER_RADIUS = 28;
const JOYSTICK_THUMB_RADIUS = 12;

const LASER_ENEMY_SIZE        =   2;
const LASER_ENEMY_COLOR       = '#ff3333';
const LASER_ENEMY_GLOW        = '#ff6666';
const LASER_HP_INIT           =  20;
const LASER_ATK_INIT          =  10;
const LASER_DEF_INIT          =   5;
const LASER_ATTACK_RADIUS     =  80;
const LASER_DECEL_DURATION_MS = 500;
const LASER_DASH_SPEED        =   8.0;
const LASER_DASH_DISTANCE     = 100;
const LASER_COOLDOWN_MS       = 1250;
const LASER_OVERSHOOT_DAMPING = 0.72;
const LASER_OVERSHOOT_STOP    = 0.15;
const LASER_TRAIL_ERASE_MS    = 450;
const LASER_PATROL_SPEED_MAX  = 0.7;
const LASER_PATROL_DAMPING    = 0.97;
const LASER_PATROL_TURN_MS    = 2500;

const PLAYER_HIT_RADIUS = 4;

const LASER_DECEL_FACTOR             = 0.80;
const ATTACK_TRAIL_CURVE_VARIATION   = 0.35;
const ATTACK_TRAIL_LENGTH_SCALE      = 1.1;
const ATTACK_TRAIL_ALPHA             = 0.9;
const ATTACK_TRAIL_ERASE_FADE        = 0.5;
const PATROL_TURN_DELAY_MIN_FACTOR   = 0.6;
const PATROL_TURN_DELAY_RANGE_FACTOR = 0.8;

const INTER_WAVE_DELAY_MS = 2500;
const DEATH_ANIM_DURATION_MS = 1800;
const DEATH_HOLD_DURATION_MS = 400;
const RESTART_FADE_IN_MS     = 700;
const DEATH_BURST_COUNT      = 20;
/** Colors used for the radial death burst particles. */
const DEATH_PARTICLE_COLORS  = ['#ffd764', '#ffe599', '#ffcc33', '#ffffff'] as const;

// ── Player attack constants ────────────────────────────────────────
/** Cooldown (ms) when no weapon is equipped. */
const PLAYER_BASE_COOLDOWN_MS  = 1200;
/** Attack range (px) when no weapon is equipped. */
const PLAYER_BASE_RANGE_PX     = 50;
/** Duration (ms) for the hit-flash visual effect. */
const HIT_EFFECT_DURATION_MS   = 220;
/** Duration (ms) for the shot-line visual effect. */
const SHOT_LINE_DURATION_MS    = 120;

interface RpgMote {
  x: number; y: number;
  vx: number; vy: number;
  trailX: Float64Array; trailY: Float64Array;
  trailHead: number; trailCount: number;
}

interface RpgJoystick {
  isActive: boolean; pointerId: number;
  baseX: number; baseY: number;
  thumbX: number; thumbY: number;
}

interface RpgKeyState {
  left: boolean; right: boolean;
  up: boolean; down: boolean;
}

interface RpgPlayerStats {
  hp: number; maxHp: number;
  atk: number; def: number;
}

type LaserPhase = 'idle' | 'decelerate' | 'dash' | 'overshoot' | 'cooldown';

interface AttackTrailState {
  active: boolean;
  startX: number; startY: number;
  endX:   number; endY:   number;
  controlAngle: number;
  trailStartMs: number;
  trailEndMs:   number;
}

interface LaserEnemy {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  phase: LaserPhase;
  phaseElapsedMs: number;
  dashDirX: number; dashDirY: number;
  dashTraveled: number;
  lockedTargetX: number; lockedTargetY: number;
  attackTrail: AttackTrailState;
  patrolTimerMs: number;
  hasHitPlayer: boolean;
}

type RpgPhase = 'alive' | 'dying' | 'restarting';

interface DeathParticle {
  x: number; y: number;
  vx: number; vy: number;
  alpha: number;
  size: number;
  color: string;
}

interface SpawnEntry {
  enemyTypeId: string;
  timerMs: number;
}

/** Visual flash drawn at the point an enemy is hit by the player. */
interface HitEffect {
  x: number; y: number;
  timerMs: number;
  color: string;
}

/** Visual line drawn from the player toward a struck enemy. */
interface ShotLine {
  x1: number; y1: number;
  x2: number; y2: number;
  timerMs: number;
  color: string;
}

export interface RpgRender {
  canvas: HTMLCanvasElement;
  statsPanel: HTMLElement;
  update(deltaMs: number): void;
  resize(container: HTMLElement): void;
  setActive(active: boolean): void;
}

function makeAttackTrail(): AttackTrailState {
  return { active: false, startX: 0, startY: 0, endX: 0, endY: 0,
           controlAngle: 0, trailStartMs: 0, trailEndMs: Infinity };
}

function makeLaserEnemy(x: number, y: number): LaserEnemy {
  return {
    x, y, vx: 0, vy: 0,
    hp: LASER_HP_INIT, maxHp: LASER_HP_INIT,
    atk: LASER_ATK_INIT, def: LASER_DEF_INIT,
    phase: 'idle', phaseElapsedMs: 0,
    dashDirX: 0, dashDirY: 0, dashTraveled: 0,
    lockedTargetX: 0, lockedTargetY: 0,
    attackTrail: makeAttackTrail(),
    patrolTimerMs: Math.random() * LASER_PATROL_TURN_MS,
    hasHitPlayer: false,
  };
}

export function createRpgRender(container: HTMLElement, rpgSimState: RpgSimState): RpgRender {

  const canvas = document.createElement('canvas');
  canvas.id = 'rpg-canvas';
  canvas.style.imageRendering = 'pixelated';
  canvas.style.touchAction = 'none';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d')!;
  const widthPx  = INTERNAL_WIDTH;
  const heightPx = INTERNAL_HEIGHT;

  function doResize(): void { canvas.width = widthPx; canvas.height = heightPx; }
  doResize();

  const mote: RpgMote = {
    x: widthPx / 2, y: heightPx / 2, vx: 0, vy: 0,
    trailX: new Float64Array(RPG_TRAIL_CAPACITY),
    trailY: new Float64Array(RPG_TRAIL_CAPACITY),
    trailHead: 0, trailCount: 0,
  };

  const joystick: RpgJoystick = { isActive: false, pointerId: -1, baseX: 0, baseY: 0, thumbX: 0, thumbY: 0 };
  const keys: RpgKeyState = { left: false, right: false, up: false, down: false };
  const playerStats: RpgPlayerStats = { hp: PLAYER_HP_INIT, maxHp: PLAYER_HP_INIT, atk: PLAYER_ATK_INIT, def: PLAYER_DEF_INIT };

  let glowMovementIntensity = 0;
  let currentWave      = 0;
  let interWaveTimerMs = 0;
  let isInterWave      = true;
  const enemies: LaserEnemy[]    = [];
  const spawnQueue: SpawnEntry[] = [];
  let glowTimeS = 0;
  let _isActive = false;
  let rpgPhase: RpgPhase = 'alive';
  let phaseTimerMs     = 0;
  let deathAlpha       = 1;
  let screenDarken     = 0;
  let restartFadeAlpha = 0;
  const deathParticles: DeathParticle[] = [];

  // ── Player attack state ────────────────────────────────────────
  let playerAttackTimerMs = 0;
  const hitEffects: HitEffect[] = [];
  const shotLines:  ShotLine[]  = [];

  function applyEquipmentStats(): void {
    const weaponDef = rpgSimState.equippedWeaponId ? WEAPON_BY_ID.get(rpgSimState.equippedWeaponId) : undefined;
    playerStats.def = PLAYER_DEF_INIT + (weaponDef?.stats.defBonus ?? 0);
    playerStats.atk = PLAYER_ATK_INIT + (weaponDef?.stats.damage  ?? 0);
  }

  // ── Player attack helpers ──────────────────────────────────────

  /** Deals damage from the player to one enemy, respecting DEF and a DEF pierce ratio. */
  function damageEnemy(enemy: LaserEnemy, rawDamage: number, defPierceRatio: number): void {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(1, rawDamage - effectiveDef);
    enemy.hp -= dmg;
  }

  /** Registers a hit-flash and shot-line visual for one target. */
  function spawnHitVisuals(targetX: number, targetY: number, color: string): void {
    hitEffects.push({ x: targetX, y: targetY, timerMs: HIT_EFFECT_DURATION_MS, color });
    shotLines.push({
      x1: mote.x, y1: mote.y,
      x2: targetX, y2: targetY,
      timerMs: SHOT_LINE_DURATION_MS, color,
    });
  }

  /**
   * Fires the player's current weapon at the nearest enemy within range.
   * Handles all WeaponEffect variants. Enemies are removed after the attack
   * loop via removeDeadEnemies().
   */
  function performPlayerAttack(): void {
    if (enemies.length === 0) return;
    const weaponDef  = rpgSimState.equippedWeaponId ? WEAPON_BY_ID.get(rpgSimState.equippedWeaponId) : undefined;
    const range      = weaponDef?.stats.range ?? PLAYER_BASE_RANGE_PX;
    const rawDamage  = playerStats.atk;
    const effect     = weaponDef?.stats.effect ?? { kind: 'single' as const };
    const shotColor  = '#ffd764';

    if (effect.kind === 'aoe') {
      // Hit every enemy within aoeRadius of the player.
      const r = effect.aoeRadius;
      for (const enemy of enemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= r * r) {
          damageEnemy(enemy, rawDamage, 0);
          spawnHitVisuals(enemy.x, enemy.y, '#e6c850');
        }
      }
      return;
    }

    if (effect.kind === 'multi') {
      // Collect enemies in range, sorted by distance, take the N closest.
      const rangeSq = range * range;
      const inRange = enemies
        .filter(e => { const dx = e.x - mote.x, dy = e.y - mote.y; return dx * dx + dy * dy <= rangeSq; })
        .sort((a, b) => {
          const da = (a.x - mote.x) ** 2 + (a.y - mote.y) ** 2;
          const db = (b.x - mote.x) ** 2 + (b.y - mote.y) ** 2;
          return da - db;
        })
        .slice(0, effect.targetCount);
      for (const enemy of inRange) {
        damageEnemy(enemy, rawDamage, 0);
        spawnHitVisuals(enemy.x, enemy.y, '#50b464');
      }
      return;
    }

    // single / piercing — target the single closest enemy in range.
    const defPierceRatio = effect.kind === 'piercing' ? effect.defPierceRatio : 0;
    const rangeSq = range * range;
    let target: LaserEnemy | null = null;
    let closestSq = Infinity;
    for (const enemy of enemies) {
      const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= rangeSq && distSq < closestSq) {
        closestSq = distSq;
        target = enemy;
      }
    }
    if (target) {
      damageEnemy(target, rawDamage, defPierceRatio);
      spawnHitVisuals(target.x, target.y, effect.kind === 'piercing' ? '#74c0fc' : shotColor);
    }
  }

  /** Removes any enemies whose HP has reached zero or below. */
  function removeDeadEnemies(): void {
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].hp <= 0) enemies.splice(i, 1);
    }
  }

  /** Advances hit-flash and shot-line timers, pruning expired entries. */
  function updateShotVisuals(deltaMs: number): void {
    for (let i = hitEffects.length - 1; i >= 0; i--) {
      hitEffects[i].timerMs -= deltaMs;
      if (hitEffects[i].timerMs <= 0) hitEffects.splice(i, 1);
    }
    for (let i = shotLines.length - 1; i >= 0; i--) {
      shotLines[i].timerMs -= deltaMs;
      if (shotLines[i].timerMs <= 0) shotLines.splice(i, 1);
    }
  }

  const statsPanel = document.createElement('div');
  statsPanel.id = 'rpg-stats-panel';
  statsPanel.style.display = 'none';

  function makeStatWidget(label: string, extraClass: string): { root: HTMLElement; valueEl: HTMLSpanElement } {
    const root = document.createElement('div');
    root.className = 'rpg-stat';
    const labelEl = document.createElement('span');
    labelEl.className = 'rpg-stat-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'rpg-stat-value' + (extraClass ? (' ' + extraClass) : '');
    root.appendChild(labelEl);
    root.appendChild(valueEl);
    statsPanel.appendChild(root);
    return { root, valueEl };
  }

  const hpWidget    = makeStatWidget('HP',    'rpg-stat-value--hp');
  const atkWidget   = makeStatWidget('ATK',   '');
  const defWidget   = makeStatWidget('DEF',   '');
  const waveWidget  = makeStatWidget('WAVE',  'rpg-stat-value--wave');
  const boostWidget = makeStatWidget('BOOST', 'rpg-stat-value--boost');

  function updateStatsPanelDom(): void {
    hpWidget.valueEl.textContent   = Math.max(0, Math.ceil(playerStats.hp)) + ' / ' + playerStats.maxHp;
    atkWidget.valueEl.textContent  = String(playerStats.atk);
    defWidget.valueEl.textContent  = String(playerStats.def);
    waveWidget.valueEl.textContent = String(currentWave);
    boostWidget.valueEl.textContent = rpgSimState.highestWaveReached > 0
      ? '+' + Math.pow(rpgSimState.highestWaveReached, 1.2).toFixed(1) + '%'
      : '+0.0%';
  }
  updateStatsPanelDom();

  function toCanvasCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width  > 0 ? widthPx  / rect.width  : 1;
    const scaleY = rect.height > 0 ? heightPx / rect.height : 1;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    canvas.setPointerCapture(e.pointerId);
    const pos = toCanvasCoords(e.clientX, e.clientY);
    joystick.isActive = true; joystick.pointerId = e.pointerId;
    joystick.baseX = pos.x; joystick.baseY = pos.y;
    joystick.thumbX = pos.x; joystick.thumbY = pos.y;
  }, { passive: false });

  canvas.addEventListener('pointermove', (e: PointerEvent) => {
    if (!joystick.isActive || e.pointerId !== joystick.pointerId) return;
    e.preventDefault();
    const pos = toCanvasCoords(e.clientX, e.clientY);
    const dx = pos.x - joystick.baseX;
    const dy = pos.y - joystick.baseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > JOYSTICK_OUTER_RADIUS) {
      joystick.thumbX = joystick.baseX + (dx / dist) * JOYSTICK_OUTER_RADIUS;
      joystick.thumbY = joystick.baseY + (dy / dist) * JOYSTICK_OUTER_RADIUS;
    } else {
      joystick.thumbX = pos.x; joystick.thumbY = pos.y;
    }
  }, { passive: false });

  function endJoystick(pointerId: number): void {
    if (pointerId !== joystick.pointerId) return;
    joystick.isActive = false; joystick.pointerId = -1;
  }
  canvas.addEventListener('pointerup',     (e: PointerEvent) => endJoystick(e.pointerId));
  canvas.addEventListener('pointercancel', (e: PointerEvent) => endJoystick(e.pointerId));

  function handleKeyDown(e: KeyboardEvent): void {
    if (!_isActive) return;
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA':  keys.left  = true; break;
      case 'ArrowRight': case 'KeyD': keys.right = true; break;
      case 'ArrowUp': case 'KeyW':    keys.up    = true; break;
      case 'ArrowDown': case 'KeyS':  keys.down  = true; break;
      default: return;
    }
    if (e.code.startsWith('Arrow')) e.preventDefault();
  }
  function handleKeyUp(e: KeyboardEvent): void {
    if (!_isActive) return;
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA':  keys.left  = false; break;
      case 'ArrowRight': case 'KeyD': keys.right = false; break;
      case 'ArrowUp': case 'KeyW':    keys.up    = false; break;
      case 'ArrowDown': case 'KeyS':  keys.down  = false; break;
    }
  }
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup',   handleKeyUp);

  function clampEnemyToBounds(enemy: LaserEnemy): void {
    const half = LASER_ENEMY_SIZE / 2;
    if (enemy.x < half)            { enemy.x = half;            enemy.vx =  Math.abs(enemy.vx) * 0.5; }
    if (enemy.x > widthPx  - half) { enemy.x = widthPx  - half; enemy.vx = -Math.abs(enemy.vx) * 0.5; }
    if (enemy.y < half)            { enemy.y = half;            enemy.vy =  Math.abs(enemy.vy) * 0.5; }
    if (enemy.y > heightPx - half) { enemy.y = heightPx - half; enemy.vy = -Math.abs(enemy.vy) * 0.5; }
  }

  function spawnEnemyById(enemyTypeId: string): void {
    if (enemyTypeId !== 'laser') return;
    const half = LASER_ENEMY_SIZE / 2;
    let spawnX = 0, spawnY = 0, attempts = 0;
    do {
      spawnX = half + Math.random() * (widthPx  - LASER_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - LASER_ENEMY_SIZE);
      const dx = spawnX - mote.x; const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= 80 * 80) break;
      attempts++;
    } while (attempts < 20);
    enemies.push(makeLaserEnemy(spawnX, spawnY));
  }

  function startNextWave(): void {
    currentWave += 1;
    if (currentWave > rpgSimState.highestWaveReached) {
      rpgSimState.highestWaveReached = currentWave;
    }
    const waveDef = getWaveDefinition(currentWave);
    spawnQueue.length = 0;
    for (const spawn of waveDef.spawns) {
      for (let i = 0; i < spawn.count; i++) {
        spawnQueue.push({ enemyTypeId: spawn.enemyTypeId, timerMs: spawn.spawnDelay * i });
      }
    }
    isInterWave = false;
  }

  function checkWaveCompletion(): void {
    if (isInterWave || spawnQueue.length > 0 || enemies.length > 0) return;
    isInterWave = true;
    interWaveTimerMs = INTER_WAVE_DELAY_MS;
  }

  function tickSpawnQueue(deltaMs: number): void {
    if (isInterWave) return;
    for (let i = spawnQueue.length - 1; i >= 0; i--) {
      spawnQueue[i].timerMs -= deltaMs;
      if (spawnQueue[i].timerMs <= 0) {
        spawnEnemyById(spawnQueue[i].enemyTypeId);
        spawnQueue.splice(i, 1);
      }
    }
  }

  function updateEnemyIdle(enemy: LaserEnemy, dt: number, deltaMs: number): void {
    enemy.patrolTimerMs -= deltaMs;
    if (enemy.patrolTimerMs <= 0) {
      const angle = Math.random() * Math.PI * 2;
      enemy.vx = Math.cos(angle) * LASER_PATROL_SPEED_MAX;
      enemy.vy = Math.sin(angle) * LASER_PATROL_SPEED_MAX;
      enemy.patrolTimerMs = LASER_PATROL_TURN_MS * (PATROL_TURN_DELAY_MIN_FACTOR + Math.random() * PATROL_TURN_DELAY_RANGE_FACTOR);
    }
    const dampFactor = Math.pow(LASER_PATROL_DAMPING, dt);
    enemy.vx *= dampFactor; enemy.vy *= dampFactor;
    enemy.x  += enemy.vx * dt; enemy.y += enemy.vy * dt;
    clampEnemyToBounds(enemy);
    const dx = mote.x - enemy.x; const dy = mote.y - enemy.y;
    if (dx * dx + dy * dy < LASER_ATTACK_RADIUS * LASER_ATTACK_RADIUS) {
      enemy.lockedTargetX = mote.x; enemy.lockedTargetY = mote.y;
      enemy.phase = 'decelerate'; enemy.phaseElapsedMs = 0;
    }
  }

  function updateEnemyDecelerate(enemy: LaserEnemy, dt: number, deltaMs: number): void {
    enemy.phaseElapsedMs += deltaMs;
    const dampFactor = Math.pow(LASER_DECEL_FACTOR, dt);
    enemy.vx *= dampFactor; enemy.vy *= dampFactor;
    enemy.x  += enemy.vx * dt; enemy.y += enemy.vy * dt;
    clampEnemyToBounds(enemy);
    if (enemy.phaseElapsedMs >= LASER_DECEL_DURATION_MS) {
      enemy.vx = 0; enemy.vy = 0;
      const dx = enemy.lockedTargetX - enemy.x; const dy = enemy.lockedTargetY - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.1) { enemy.dashDirX = dx / dist; enemy.dashDirY = dy / dist; }
      else { const a = Math.random() * Math.PI * 2; enemy.dashDirX = Math.cos(a); enemy.dashDirY = Math.sin(a); }
      enemy.dashTraveled = 0; enemy.hasHitPlayer = false;
      enemy.phase = 'dash'; enemy.phaseElapsedMs = 0;
      enemy.attackTrail = {
        active: true,
        startX: enemy.x, startY: enemy.y,
        endX: enemy.x + enemy.dashDirX * LASER_DASH_DISTANCE,
        endY: enemy.y + enemy.dashDirY * LASER_DASH_DISTANCE,
        controlAngle: (Math.random() - 0.5) * ATTACK_TRAIL_CURVE_VARIATION,
        trailStartMs: performance.now(), trailEndMs: Infinity,
      };
    }
  }

  function updateEnemyDash(enemy: LaserEnemy, dt: number, nowMs: number): void {
    const stepDist = LASER_DASH_SPEED * dt;
    enemy.x += enemy.dashDirX * stepDist; enemy.y += enemy.dashDirY * stepDist;
    enemy.dashTraveled += stepDist;
    clampEnemyToBounds(enemy);
    if (!enemy.hasHitPlayer) {
      const dx = enemy.x - mote.x; const dy = enemy.y - mote.y;
      if (dx * dx + dy * dy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
        const dmg = Math.max(1, enemy.atk - playerStats.def);
        playerStats.hp = Math.max(0, playerStats.hp - dmg);
        enemy.hasHitPlayer = true;
      }
    }
    if (enemy.dashTraveled >= LASER_DASH_DISTANCE) {
      enemy.attackTrail.trailEndMs = nowMs;
      enemy.vx = enemy.dashDirX * LASER_DASH_SPEED;
      enemy.vy = enemy.dashDirY * LASER_DASH_SPEED;
      enemy.phase = 'overshoot'; enemy.phaseElapsedMs = 0;
    }
  }

  function updateEnemyOvershoot(enemy: LaserEnemy, dt: number): void {
    const dampFactor = Math.pow(LASER_OVERSHOOT_DAMPING, dt);
    enemy.vx *= dampFactor; enemy.vy *= dampFactor;
    enemy.x  += enemy.vx * dt; enemy.y += enemy.vy * dt;
    clampEnemyToBounds(enemy);
    if (Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy) < LASER_OVERSHOOT_STOP) {
      enemy.vx = 0; enemy.vy = 0;
      enemy.phase = 'cooldown'; enemy.phaseElapsedMs = 0;
    }
  }

  function updateEnemyCooldown(enemy: LaserEnemy, deltaMs: number): void {
    enemy.phaseElapsedMs += deltaMs;
    if (enemy.phaseElapsedMs >= LASER_COOLDOWN_MS) { enemy.phase = 'idle'; enemy.phaseElapsedMs = 0; }
  }

  function updateEnemies(deltaMs: number, nowMs: number): void {
    const dt = Math.min(deltaMs / 16.667, 3);
    for (const enemy of enemies) {
      switch (enemy.phase) {
        case 'idle':       updateEnemyIdle(enemy, dt, deltaMs);       break;
        case 'decelerate': updateEnemyDecelerate(enemy, dt, deltaMs); break;
        case 'dash':       updateEnemyDash(enemy, dt, nowMs);         break;
        case 'overshoot':  updateEnemyOvershoot(enemy, dt);           break;
        case 'cooldown':   updateEnemyCooldown(enemy, deltaMs);       break;
      }
    }
  }

  function updatePhysics(deltaMs: number): void {
    const dt = Math.min(deltaMs / 16.667, 3);
    if (joystick.isActive) {
      const dx = joystick.thumbX - joystick.baseX;
      const dy = joystick.thumbY - joystick.baseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.5) { const speed = (dist / JOYSTICK_OUTER_RADIUS) * MAX_RPG_SPEED; mote.vx = (dx / dist) * speed; mote.vy = (dy / dist) * speed; }
      else { mote.vx *= RPG_VELOCITY_DAMPING; mote.vy *= RPG_VELOCITY_DAMPING; }
    } else {
      const dirX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const dirY = (keys.down  ? 1 : 0) - (keys.up   ? 1 : 0);
      const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
      if (dirLen > 0) { mote.vx = (dirX / dirLen) * MAX_RPG_SPEED; mote.vy = (dirY / dirLen) * MAX_RPG_SPEED; }
      else { mote.vx *= RPG_VELOCITY_DAMPING; mote.vy *= RPG_VELOCITY_DAMPING; }
    }
    mote.x += mote.vx * dt; mote.y += mote.vy * dt;
    const half = RPG_MOTE_SIZE / 2;
    if (mote.x < half)            { mote.x = half;            mote.vx = 0; }
    if (mote.x > widthPx  - half) { mote.x = widthPx  - half; mote.vx = 0; }
    if (mote.y < half)            { mote.y = half;            mote.vy = 0; }
    if (mote.y > heightPx - half) { mote.y = heightPx - half; mote.vy = 0; }
    mote.trailX[mote.trailHead] = mote.x;
    mote.trailY[mote.trailHead] = mote.y;
    mote.trailHead = (mote.trailHead + 1) % RPG_TRAIL_CAPACITY;
    if (mote.trailCount < RPG_TRAIL_CAPACITY) mote.trailCount++;
    // Movement glow smoothing via LERP
    const speed = Math.sqrt(mote.vx * mote.vx + mote.vy * mote.vy);
    if (speed > TRAIL_SPEED_THRESHOLD) {
      glowMovementIntensity = Math.min(1, glowMovementIntensity + GLOW_MOVE_RAMP_UP * deltaMs);
    } else {
      glowMovementIntensity = Math.max(0, glowMovementIntensity - GLOW_MOVE_RAMP_DOWN * deltaMs);
    }
  }

  function triggerDeath(): void {
    rpgPhase = 'dying'; phaseTimerMs = 0; deathAlpha = 1;
    deathParticles.length = 0;
    for (let i = 0; i < DEATH_BURST_COUNT; i++) {
      const angle = (i / DEATH_BURST_COUNT) * Math.PI * 2 + Math.random() * 0.35;
      const speed = 0.8 + Math.random() * 1.8;
      deathParticles.push({
        x: mote.x, y: mote.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        alpha: 1, size: 1.5 + Math.random() * 2,
        color: DEATH_PARTICLE_COLORS[Math.floor(Math.random() * DEATH_PARTICLE_COLORS.length)],
      });
    }
  }

  function doRestart(): void {
    playerStats.hp = playerStats.maxHp;
    enemies.length = 0; spawnQueue.length = 0;
    mote.x = widthPx / 2; mote.y = heightPx / 2;
    mote.vx = mote.vy = 0; mote.trailHead = 0; mote.trailCount = 0;
    deathParticles.length = 0; glowMovementIntensity = 0;
    currentWave = 0; isInterWave = true;
    interWaveTimerMs = INTER_WAVE_DELAY_MS * 0.4;
    screenDarken = 0;
    playerAttackTimerMs = 0;
    hitEffects.length = 0; shotLines.length = 0;
    applyEquipmentStats();
  }

  function drawAttackTrail(enemy: LaserEnemy, nowMs: number): void {
    const trail = enemy.attackTrail;
    if (!trail.active) return;
    const isDashing = trail.trailEndMs === Infinity;
    let drawProgress: number, eraseProgress: number;
    if (isDashing) {
      drawProgress = Math.min(enemy.dashTraveled / LASER_DASH_DISTANCE, 1.0);
      eraseProgress = 0;
    } else {
      drawProgress = 1.0;
      eraseProgress = Math.min((nowMs - trail.trailEndMs) / LASER_TRAIL_ERASE_MS, 1.0);
      if (eraseProgress >= 1.0) { trail.active = false; return; }
    }
    const sx = trail.startX, sy = trail.startY, tx = trail.endX, ty = trail.endY;
    const ddx = tx - sx, ddy = ty - sy;
    const L = Math.sqrt(ddx * ddx + ddy * ddy);
    if (L < 1) return;
    const midX = (sx + tx) * 0.5, midY = (sy + ty) * 0.5;
    const perpX = -ddy / L, perpY = ddx / L;
    const curveOffset = L * Math.tan(trail.controlAngle);
    const controlX = midX + perpX * curveOffset, controlY = midY + perpY * curveOffset;
    const dashLen    = L * ATTACK_TRAIL_LENGTH_SCALE;
    const dashOffset = isDashing ? dashLen * (1 - drawProgress) : -(dashLen * eraseProgress);
    const alpha = isDashing ? ATTACK_TRAIL_ALPHA : ATTACK_TRAIL_ALPHA * (1 - eraseProgress * ATTACK_TRAIL_ERASE_FADE);
    ctx.save();
    ctx.setLineDash([dashLen, dashLen]);
    ctx.lineDashOffset = dashOffset;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 5; ctx.shadowColor = LASER_ENEMY_GLOW;
    ctx.strokeStyle = LASER_ENEMY_GLOW; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(controlX, controlY, tx, ty); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = LASER_ENEMY_COLOR; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(controlX, controlY, tx, ty); ctx.stroke();
    ctx.restore();
  }

  function drawEnemies(nowMs: number): void {
    for (const enemy of enemies) {
      drawAttackTrail(enemy, nowMs);
      const half = LASER_ENEMY_SIZE / 2;
      ctx.shadowBlur = LASER_ENEMY_SIZE * 5; ctx.shadowColor = LASER_ENEMY_GLOW;
      ctx.fillStyle = LASER_ENEMY_COLOR;
      ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), LASER_ENEMY_SIZE, LASER_ENEMY_SIZE);
      ctx.shadowBlur = 0;
    }
  }

  function drawDeathParticles(): void {
    for (const p of deathParticles) {
      ctx.globalAlpha = p.alpha; ctx.shadowBlur = p.size * 3; ctx.shadowColor = p.color;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.floor(p.x - p.size / 2), Math.floor(p.y - p.size / 2), Math.ceil(p.size), Math.ceil(p.size));
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }

  /** Draws thin tracer lines from the player toward each recently struck enemy. */
  function drawShotLines(): void {
    if (shotLines.length === 0) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (const line of shotLines) {
      const t = line.timerMs / SHOT_LINE_DURATION_MS;
      ctx.globalAlpha = t * 0.7;
      ctx.strokeStyle = line.color;
      ctx.shadowBlur  = 3; ctx.shadowColor = line.color;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** Draws a small expanding square flash at each recently hit enemy position. */
  function drawHitEffects(): void {
    if (hitEffects.length === 0) return;
    ctx.save();
    for (const h of hitEffects) {
      const t    = h.timerMs / HIT_EFFECT_DURATION_MS;
      const size = 3 + (1 - t) * 5;
      const half = size / 2;
      ctx.globalAlpha = t * 0.9;
      ctx.shadowBlur  = size * 3; ctx.shadowColor = h.color; ctx.fillStyle = h.color;
      ctx.fillRect(Math.floor(h.x - half), Math.floor(h.y - half), Math.ceil(size), Math.ceil(size));
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawWaveClearBanner(): void {
    if (!isInterWave || currentWave === 0) return;
    const t = 1 - interWaveTimerMs / INTER_WAVE_DELAY_MS;
    const fadeIn  = Math.min(t / 0.15, 1);
    const fadeOut = t > 0.75 ? Math.max(0, 1 - (t - 0.75) / 0.15) : 1;
    const alpha   = fadeIn * fadeOut * 0.85;
    if (alpha < 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(10, 10, 18, 0.75)';
    ctx.fillRect(0, heightPx / 2 - 32, widthPx, 64);
    ctx.fillStyle = '#ffd764'; ctx.font = 'bold 14px "Poiret One", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowBlur = 8; ctx.shadowColor = '#ffe599';
    ctx.fillText('Wave ' + currentWave + ' Cleared!', widthPx / 2, heightPx / 2 - 8);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#c9a84c'; ctx.font = '10px "Poiret One", sans-serif';
    ctx.fillText('Next wave incoming\u2026', widthPx / 2, heightPx / 2 + 10);
    ctx.restore();
  }

  function draw(nowMs: number): void {
    ctx.clearRect(0, 0, widthPx, heightPx);
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, widthPx, heightPx);

    drawEnemies(nowMs);
    drawShotLines();

    // Player comet trail — smoothly gated by glowMovementIntensity
    if (glowMovementIntensity > 0.02 && mote.trailCount >= 2) {
      const trailLen = mote.trailCount;
      for (let i = 0; i < trailLen; i++) {
        const t      = i / trailLen;
        const bufIdx = (mote.trailHead - trailLen + i + RPG_TRAIL_CAPACITY) % RPG_TRAIL_CAPACITY;
        const trailSize = RPG_MOTE_SIZE * t * 1.3;
        if (trailSize < 0.3) continue;
        const half = trailSize / 2;
        ctx.globalAlpha = t * 0.45 * glowMovementIntensity;
        ctx.shadowBlur  = trailSize * 6; ctx.shadowColor = RPG_MOTE_GLOW; ctx.fillStyle = RPG_MOTE_GLOW;
        const gh = half * 2.2;
        ctx.fillRect(Math.floor(mote.trailX[bufIdx] - gh), Math.floor(mote.trailY[bufIdx] - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
        ctx.shadowBlur = 0;
        ctx.globalAlpha = t * 0.7 * glowMovementIntensity;
        ctx.fillStyle   = RPG_MOTE_COLOR;
        ctx.fillRect(Math.floor(mote.trailX[bufIdx] - half), Math.floor(mote.trailY[bufIdx] - half), Math.ceil(trailSize), Math.ceil(trailSize));
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    const playerVisible = rpgPhase === 'alive' || rpgPhase === 'dying';
    if (playerVisible) {
      const pa = rpgPhase === 'dying' ? deathAlpha : 1;
      const pulseT   = (Math.sin(glowTimeS * GLOW_PULSE_SPEED) + 1) * 0.5;
      const glowSize = RPG_MOTE_SIZE * (2.2 + pulseT * 1.4);
      const glowHalf = glowSize / 2;
      ctx.globalAlpha = (0.18 + pulseT * 0.22) * pa;
      ctx.shadowBlur  = glowSize * 3; ctx.shadowColor = RPG_MOTE_GLOW; ctx.fillStyle = RPG_MOTE_GLOW;
      ctx.fillRect(Math.floor(mote.x - glowHalf), Math.floor(mote.y - glowHalf), Math.ceil(glowSize), Math.ceil(glowSize));
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      ctx.globalAlpha = pa;
      ctx.shadowBlur  = RPG_MOTE_SIZE * 5; ctx.shadowColor = RPG_MOTE_GLOW; ctx.fillStyle = RPG_MOTE_COLOR;
      const mh = RPG_MOTE_SIZE / 2;
      ctx.fillRect(Math.floor(mote.x - mh), Math.floor(mote.y - mh), RPG_MOTE_SIZE, RPG_MOTE_SIZE);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }

    drawHitEffects();
    if (deathParticles.length > 0) drawDeathParticles();

    if (joystick.isActive && rpgPhase === 'alive') {
      ctx.save();
      ctx.globalAlpha = 0.35; ctx.strokeStyle = '#c9a84c'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(joystick.baseX, joystick.baseY, JOYSTICK_OUTER_RADIUS, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.55; ctx.fillStyle = '#c9a84c';
      ctx.shadowBlur = JOYSTICK_THUMB_RADIUS * 2; ctx.shadowColor = 'rgba(201, 168, 76, 0.6)';
      ctx.beginPath(); ctx.arc(joystick.thumbX, joystick.thumbY, JOYSTICK_THUMB_RADIUS, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.restore();
    }

    if (rpgPhase === 'alive') drawWaveClearBanner();

    if (screenDarken > 0) {
      ctx.globalAlpha = screenDarken; ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, widthPx, heightPx); ctx.globalAlpha = 1;
    }
    if (rpgPhase === 'restarting') {
      ctx.globalAlpha = 1 - restartFadeAlpha; ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, widthPx, heightPx); ctx.globalAlpha = 1;
    }
  }

  function updateDying(deltaMs: number): void {
    phaseTimerMs += deltaMs;
    const t = Math.min(phaseTimerMs / DEATH_ANIM_DURATION_MS, 1);
    deathAlpha   = Math.max(0, 1 - t * 1.25);
    screenDarken = Math.min(t * 0.85, 0.85);
    for (const p of deathParticles) {
      p.x += p.vx * deltaMs * 0.06; p.y += p.vy * deltaMs * 0.06;
      p.alpha = Math.max(0, 1 - t * 1.5);
      p.vx *= 0.97; p.vy *= 0.97;
    }
    if (phaseTimerMs >= DEATH_ANIM_DURATION_MS + DEATH_HOLD_DURATION_MS) {
      screenDarken = 1;
      doRestart();
      rpgPhase = 'restarting'; phaseTimerMs = 0; restartFadeAlpha = 0;
    }
  }

  function updateRestarting(deltaMs: number): void {
    phaseTimerMs    += deltaMs;
    restartFadeAlpha = Math.min(1, phaseTimerMs / RESTART_FADE_IN_MS);
    screenDarken     = 0;
    if (phaseTimerMs >= RESTART_FADE_IN_MS) rpgPhase = 'alive';
  }

  return {
    canvas,
    statsPanel,

    update(deltaMs: number): void {
      const nowMs = performance.now();
      glowTimeS += deltaMs / 1000;

      if (rpgPhase === 'dying') {
        updateDying(deltaMs);
        draw(nowMs);
        updateStatsPanelDom();
        return;
      }
      if (rpgPhase === 'restarting') {
        updateRestarting(deltaMs);
        draw(nowMs);
        updateStatsPanelDom();
        return;
      }

      if (isInterWave) {
        interWaveTimerMs -= deltaMs;
        if (interWaveTimerMs <= 0) startNextWave();
      } else {
        tickSpawnQueue(deltaMs);
        checkWaveCompletion();
      }

      updatePhysics(deltaMs);
      updateEnemies(deltaMs, nowMs);

      // ── Player auto-attack ────────────────────────────────────
      playerAttackTimerMs -= deltaMs;
      if (playerAttackTimerMs <= 0) {
        const weaponDef  = rpgSimState.equippedWeaponId ? WEAPON_BY_ID.get(rpgSimState.equippedWeaponId) : undefined;
        const cooldownMs = weaponDef?.stats.cooldownMs ?? PLAYER_BASE_COOLDOWN_MS;
        playerAttackTimerMs = cooldownMs;
        performPlayerAttack();
        removeDeadEnemies();
        checkWaveCompletion();
      }
      updateShotVisuals(deltaMs);

      if (playerStats.hp <= 0) triggerDeath();
      updateStatsPanelDom();
      draw(nowMs);
    },

    resize(_cont: HTMLElement): void {
      doResize();
      const half = RPG_MOTE_SIZE / 2;
      mote.x = Math.max(half, Math.min(widthPx  - half, mote.x));
      mote.y = Math.max(half, Math.min(heightPx - half, mote.y));
    },

    setActive(active: boolean): void {
      _isActive = active;
      if (!active) { keys.left = keys.right = keys.up = keys.down = false; }
      if (active) {
        applyEquipmentStats();
        if (currentWave === 0 && rpgPhase === 'alive') {
          isInterWave = true;
          interWaveTimerMs = INTER_WAVE_DELAY_MS * 0.4;
        }
      }
    },
  };
}
