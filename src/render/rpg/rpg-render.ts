/**
 * rpg-render.ts — RPG tab rendering system.
 *
 * Manages an independent low-resolution canvas with:
 *   - A player-controllable sand mote (3×3 pixels, always-glowing)
 *   - Touch joystick (mobile) and WASD / Arrow key (desktop) controls
 *   - An exaggerated glowing comet trail behind the player mote
 *   - Laser enemies (2×2 red motes) with patrol, attack-detect, dash, and cooldown phases
 *   - A bezier lineDash attack-trail effect during the enemy dash
 *   - A DOM stats panel (HP / ATK / DEF) rendered above the navigation bar
 *
 * Internal resolution is FIXED at 320×568 (≈9:16 portrait).  CSS letterboxes
 * or pillarboxes the canvas inside its container so pixels always scale uniformly
 * rather than stretching to fill on desktop.
 */

// ─── Constants ────────────────────────────────────────────────────

/** Internal game-world width in logical pixels. */
const INTERNAL_WIDTH  = 320;
/** Internal game-world height in logical pixels (fixed 9:16 portrait aspect). */
const INTERNAL_HEIGHT = 568;

// ── Player ──
const RPG_TRAIL_CAPACITY   = 60;
const MAX_RPG_SPEED        = 3.0;
const RPG_VELOCITY_DAMPING = 0.88;
const RPG_MOTE_SIZE        = 3;
const RPG_MOTE_COLOR       = '#ffd764';
const RPG_MOTE_GLOW        = '#ffe599';
const TRAIL_SPEED_THRESHOLD = 0.15;
const GLOW_PULSE_SPEED      = 2.5;   // radians per second

// ── Player starting stats ──
const PLAYER_HP_INIT  = 100;
const PLAYER_ATK_INIT =  10;
const PLAYER_DEF_INIT =   5;

// ── Joystick ──
const JOYSTICK_OUTER_RADIUS = 28;
const JOYSTICK_THUMB_RADIUS = 12;

// ── Laser enemy ──
const LASER_ENEMY_SIZE        =   2;
const LASER_ENEMY_COLOR       = '#ff3333';
const LASER_ENEMY_GLOW        = '#ff6666';
const LASER_HP_INIT           =  20;
const LASER_ATK_INIT          =  10;
const LASER_DEF_INIT          =   5;
const LASER_ATTACK_RADIUS     =  80;   // pixels
const LASER_DECEL_DURATION_MS = 500;   // ms – smooth stop before dash
const LASER_DASH_SPEED        =   8.0; // pixels per normalised 60fps frame
const LASER_DASH_DISTANCE     = 100;   // pixels
const LASER_COOLDOWN_MS       = 1250;  // ms
const LASER_OVERSHOOT_DAMPING = 0.72;  // aggressive decel after dash
const LASER_OVERSHOOT_STOP    = 0.15;  // speed threshold to end overshoot
const LASER_TRAIL_ERASE_MS    = 450;   // ms – trail linger after dash ends
const LASER_PATROL_SPEED_MAX  = 0.7;
const LASER_PATROL_DAMPING    = 0.97;
const LASER_PATROL_TURN_MS    = 2500;  // ms between random direction changes

// ── Enemy spawning ──
const ENEMY_SPAWN_INTERVAL_MS = 5000;
const ENEMY_MAX_COUNT         =    5;
const ENEMY_MIN_SPAWN_DIST    =  80;   // min distance from player on spawn

// ── Hitbox ──
const PLAYER_HIT_RADIUS = 4;           // forgiving overlap radius for combat

// ─── Types ────────────────────────────────────────────────────────

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

/**
 * Animation state for the bezier lineDash trail drawn during a laser dash.
 *
 * Draw phase  (trailEndMs === Infinity):  trail grows from startX/Y toward endX/Y.
 * Erase phase (trailEndMs < Infinity):    trail shrinks from startX/Y over LASER_TRAIL_ERASE_MS.
 */
interface AttackTrailState {
  active: boolean;
  startX: number; startY: number;
  endX:   number; endY:   number;
  /** Small perpendicular Bezier bend — set randomly on dash start for visual interest. */
  controlAngle: number;
  trailStartMs: number;
  trailEndMs:   number; // set to performance.now() when dash completes; Infinity while dashing
}

interface LaserEnemy {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  phase: LaserPhase;
  /** General-purpose elapsed-time counter for the current phase. */
  phaseElapsedMs: number;
  // Dash state
  dashDirX: number; dashDirY: number;
  dashTraveled: number;
  lockedTargetX: number; lockedTargetY: number;
  attackTrail: AttackTrailState;
  // Patrol wander
  patrolTimerMs: number;
  /** Prevents multiple damage hits from a single dash pass. */
  hasHitPlayer: boolean;
}

// ─── Public interface ─────────────────────────────────────────────

export interface RpgRender {
  /** The RPG canvas element — already appended to the container by the factory. */
  canvas: HTMLCanvasElement;
  /**
   * Stats panel DOM element — callers must append this to the root `#app`
   * element (above the tab bar) and show/hide it alongside the RPG tab.
   */
  statsPanel: HTMLElement;
  /** Update physics and redraw.  Call every frame while the RPG tab is active. */
  update(deltaMs: number): void;
  /** Re-assert canvas dimensions and re-clamp entities.  Call on window resize. */
  resize(container: HTMLElement): void;
  /**
   * Notify the renderer when the RPG tab becomes active or inactive.
   * Enables/disables keyboard input capture and resets stale key state.
   */
  setActive(active: boolean): void;
}

// ─── Helpers ──────────────────────────────────────────────────────

function makeAttackTrail(): AttackTrailState {
  return {
    active: false,
    startX: 0, startY: 0,
    endX:   0, endY:   0,
    controlAngle: 0,
    trailStartMs: 0,
    trailEndMs:   Infinity,
  };
}

function makeLaserEnemy(x: number, y: number): LaserEnemy {
  return {
    x, y, vx: 0, vy: 0,
    hp: LASER_HP_INIT, maxHp: LASER_HP_INIT,
    atk: LASER_ATK_INIT, def: LASER_DEF_INIT,
    phase: 'idle',
    phaseElapsedMs: 0,
    dashDirX: 0, dashDirY: 0,
    dashTraveled: 0,
    lockedTargetX: 0, lockedTargetY: 0,
    attackTrail: makeAttackTrail(),
    patrolTimerMs: Math.random() * LASER_PATROL_TURN_MS,
    hasHitPlayer: false,
  };
}

// ─── Factory ──────────────────────────────────────────────────────

export function createRpgRender(container: HTMLElement): RpgRender {

  // ── Canvas setup ───────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.id = 'rpg-canvas';
  // CSS handles sizing via #rpg-canvas rules (letterboxed, aspect-ratio: 320/568).
  // Touch pan/zoom disabled so pointer events are captured correctly.
  canvas.style.imageRendering = 'pixelated';
  canvas.style.touchAction = 'none';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d')!;
  const widthPx  = INTERNAL_WIDTH;
  const heightPx = INTERNAL_HEIGHT;

  function doResize(): void {
    canvas.width  = widthPx;
    canvas.height = heightPx;
  }
  doResize();

  // ── State ──────────────────────────────────────────────────────

  const mote: RpgMote = {
    x: widthPx / 2, y: heightPx / 2,
    vx: 0, vy: 0,
    trailX: new Float64Array(RPG_TRAIL_CAPACITY),
    trailY: new Float64Array(RPG_TRAIL_CAPACITY),
    trailHead: 0, trailCount: 0,
  };

  const joystick: RpgJoystick = {
    isActive: false, pointerId: -1,
    baseX: 0, baseY: 0,
    thumbX: 0, thumbY: 0,
  };

  const keys: RpgKeyState = { left: false, right: false, up: false, down: false };

  const playerStats: RpgPlayerStats = {
    hp: PLAYER_HP_INIT, maxHp: PLAYER_HP_INIT,
    atk: PLAYER_ATK_INIT, def: PLAYER_DEF_INIT,
  };

  const enemies: LaserEnemy[] = [];
  let spawnTimerMs      = ENEMY_SPAWN_INTERVAL_MS * 0.5; // first spawn at half interval
  let glowTimeS         = 0;
  let _isActive         = false;

  // ── Stats panel DOM ────────────────────────────────────────────

  const statsPanel = document.createElement('div');
  statsPanel.id = 'rpg-stats-panel';
  statsPanel.style.display = 'none';

  function makeStatWidget(
    label: string,
    extraClass: string,
  ): { root: HTMLElement; valueEl: HTMLSpanElement } {
    const root = document.createElement('div');
    root.className = 'rpg-stat';
    const labelEl = document.createElement('span');
    labelEl.className = 'rpg-stat-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = `rpg-stat-value${extraClass ? ` ${extraClass}` : ''}`;
    root.appendChild(labelEl);
    root.appendChild(valueEl);
    statsPanel.appendChild(root);
    return { root, valueEl };
  }

  const hpWidget  = makeStatWidget('HP',  'rpg-stat-value--hp');
  const atkWidget = makeStatWidget('ATK', '');
  const defWidget = makeStatWidget('DEF', '');

  function updateStatsPanelDom(): void {
    hpWidget.valueEl.textContent  = `${playerStats.hp} / ${playerStats.maxHp}`;
    atkWidget.valueEl.textContent = String(playerStats.atk);
    defWidget.valueEl.textContent = String(playerStats.def);
  }
  updateStatsPanelDom();

  // ── Coordinate conversion ──────────────────────────────────────

  function toCanvasCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width  > 0 ? widthPx  / rect.width  : 1;
    const scaleY = rect.height > 0 ? heightPx / rect.height : 1;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top)  * scaleY,
    };
  }

  // ── Pointer events (touch joystick) ───────────────────────────

  canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    canvas.setPointerCapture(e.pointerId);
    const pos = toCanvasCoords(e.clientX, e.clientY);
    joystick.isActive  = true;
    joystick.pointerId = e.pointerId;
    joystick.baseX  = pos.x; joystick.baseY  = pos.y;
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
      joystick.thumbX = pos.x;
      joystick.thumbY = pos.y;
    }
  }, { passive: false });

  function endJoystick(pointerId: number): void {
    if (pointerId !== joystick.pointerId) return;
    joystick.isActive  = false;
    joystick.pointerId = -1;
  }

  canvas.addEventListener('pointerup',     (e: PointerEvent) => endJoystick(e.pointerId));
  canvas.addEventListener('pointercancel', (e: PointerEvent) => endJoystick(e.pointerId));

  // ── Keyboard events (WASD + Arrow keys, desktop) ──────────────

  function handleKeyDown(e: KeyboardEvent): void {
    if (!_isActive) return;
    switch (e.code) {
      case 'ArrowLeft':  case 'KeyA': keys.left  = true; break;
      case 'ArrowRight': case 'KeyD': keys.right = true; break;
      case 'ArrowUp':    case 'KeyW': keys.up    = true; break;
      case 'ArrowDown':  case 'KeyS': keys.down  = true; break;
      default: return;
    }
    // Prevent arrow keys from scrolling the page.
    if (e.code.startsWith('Arrow')) e.preventDefault();
  }

  function handleKeyUp(e: KeyboardEvent): void {
    if (!_isActive) return;
    switch (e.code) {
      case 'ArrowLeft':  case 'KeyA': keys.left  = false; break;
      case 'ArrowRight': case 'KeyD': keys.right = false; break;
      case 'ArrowUp':    case 'KeyW': keys.up    = false; break;
      case 'ArrowDown':  case 'KeyS': keys.down  = false; break;
    }
  }

  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup',   handleKeyUp);

  // ── Enemy helpers ─────────────────────────────────────────────

  function clampEnemyToBounds(enemy: LaserEnemy): void {
    const half = LASER_ENEMY_SIZE / 2;
    if (enemy.x < half)           { enemy.x = half;              enemy.vx =  Math.abs(enemy.vx) * 0.5; }
    if (enemy.x > widthPx  - half) { enemy.x = widthPx  - half;  enemy.vx = -Math.abs(enemy.vx) * 0.5; }
    if (enemy.y < half)           { enemy.y = half;              enemy.vy =  Math.abs(enemy.vy) * 0.5; }
    if (enemy.y > heightPx - half) { enemy.y = heightPx - half;  enemy.vy = -Math.abs(enemy.vy) * 0.5; }
  }

  function trySpawnEnemy(): void {
    if (enemies.length >= ENEMY_MAX_COUNT) return;
    // Pick a random position away from the player.
    const half = LASER_ENEMY_SIZE / 2;
    let spawnX = 0;
    let spawnY = 0;
    let attempts = 0;
    do {
      spawnX = half + Math.random() * (widthPx  - LASER_ENEMY_SIZE);
      spawnY = half + Math.random() * (heightPx - LASER_ENEMY_SIZE);
      const dx = spawnX - mote.x;
      const dy = spawnY - mote.y;
      if (dx * dx + dy * dy >= ENEMY_MIN_SPAWN_DIST * ENEMY_MIN_SPAWN_DIST) break;
      attempts++;
    } while (attempts < 20);
    enemies.push(makeLaserEnemy(spawnX, spawnY));
  }

  // ── Enemy update logic ────────────────────────────────────────

  function updateEnemyIdle(enemy: LaserEnemy, dt: number, deltaMs: number): void {
    // Wander: periodically pick a new random direction.
    enemy.patrolTimerMs -= deltaMs;
    if (enemy.patrolTimerMs <= 0) {
      const angle = Math.random() * Math.PI * 2;
      enemy.vx = Math.cos(angle) * LASER_PATROL_SPEED_MAX;
      enemy.vy = Math.sin(angle) * LASER_PATROL_SPEED_MAX;
      enemy.patrolTimerMs = LASER_PATROL_TURN_MS * (0.6 + Math.random() * 0.8);
    }

    const dampFactor = Math.pow(LASER_PATROL_DAMPING, dt);
    enemy.vx *= dampFactor;
    enemy.vy *= dampFactor;
    enemy.x  += enemy.vx * dt;
    enemy.y  += enemy.vy * dt;
    clampEnemyToBounds(enemy);

    // Check if player has entered attack radius.
    const dx = mote.x - enemy.x;
    const dy = mote.y - enemy.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < LASER_ATTACK_RADIUS * LASER_ATTACK_RADIUS) {
      // Lock onto current player position and begin deceleration.
      enemy.lockedTargetX = mote.x;
      enemy.lockedTargetY = mote.y;
      enemy.phase         = 'decelerate';
      enemy.phaseElapsedMs = 0;
    }
  }

  function updateEnemyDecelerate(enemy: LaserEnemy, dt: number, deltaMs: number): void {
    enemy.phaseElapsedMs += deltaMs;

    // Aggressive exponential deceleration to a near-stop over the phase duration.
    const decelFactor = Math.pow(0.80, dt);
    enemy.vx *= decelFactor;
    enemy.vy *= decelFactor;
    enemy.x  += enemy.vx * dt;
    enemy.y  += enemy.vy * dt;
    clampEnemyToBounds(enemy);

    if (enemy.phaseElapsedMs >= LASER_DECEL_DURATION_MS) {
      // Fully stop and compute dash direction toward the locked target.
      enemy.vx = 0;
      enemy.vy = 0;

      const dx = enemy.lockedTargetX - enemy.x;
      const dy = enemy.lockedTargetY - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.1) {
        enemy.dashDirX = dx / dist;
        enemy.dashDirY = dy / dist;
      } else {
        const angle = Math.random() * Math.PI * 2;
        enemy.dashDirX = Math.cos(angle);
        enemy.dashDirY = Math.sin(angle);
      }

      enemy.dashTraveled   = 0;
      enemy.hasHitPlayer   = false;
      enemy.phase          = 'dash';
      enemy.phaseElapsedMs = 0;

      // Initialise the bezier attack trail.
      enemy.attackTrail = {
        active:       true,
        startX:       enemy.x,
        startY:       enemy.y,
        endX:         enemy.x + enemy.dashDirX * LASER_DASH_DISTANCE,
        endY:         enemy.y + enemy.dashDirY * LASER_DASH_DISTANCE,
        controlAngle: (Math.random() - 0.5) * 0.35,
        trailStartMs: performance.now(),
        trailEndMs:   Infinity,
      };
    }
  }

  function updateEnemyDash(enemy: LaserEnemy, dt: number, nowMs: number): void {
    const stepDist = LASER_DASH_SPEED * dt;
    enemy.x           += enemy.dashDirX * stepDist;
    enemy.y           += enemy.dashDirY * stepDist;
    enemy.dashTraveled += stepDist;
    clampEnemyToBounds(enemy);

    // Damage player on first hitbox overlap during this dash.
    if (!enemy.hasHitPlayer) {
      const dx = enemy.x - mote.x;
      const dy = enemy.y - mote.y;
      if (dx * dx + dy * dy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
        const dmg = Math.max(1, enemy.atk - playerStats.def);
        playerStats.hp = Math.max(0, playerStats.hp - dmg);
        enemy.hasHitPlayer = true;
      }
    }

    if (enemy.dashTraveled >= LASER_DASH_DISTANCE) {
      // Dash complete — record trail end and apply overshoot velocity.
      enemy.attackTrail.trailEndMs = nowMs;
      enemy.vx            = enemy.dashDirX * LASER_DASH_SPEED;
      enemy.vy            = enemy.dashDirY * LASER_DASH_SPEED;
      enemy.phase         = 'overshoot';
      enemy.phaseElapsedMs = 0;
    }
  }

  function updateEnemyOvershoot(enemy: LaserEnemy, dt: number): void {
    // Aggressively decelerate to a quick stop after the dash.
    const dampFactor = Math.pow(LASER_OVERSHOOT_DAMPING, dt);
    enemy.vx *= dampFactor;
    enemy.vy *= dampFactor;
    enemy.x  += enemy.vx * dt;
    enemy.y  += enemy.vy * dt;
    clampEnemyToBounds(enemy);

    const speed = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
    if (speed < LASER_OVERSHOOT_STOP) {
      enemy.vx            = 0;
      enemy.vy            = 0;
      enemy.phase         = 'cooldown';
      enemy.phaseElapsedMs = 0;
    }
  }

  function updateEnemyCooldown(enemy: LaserEnemy, deltaMs: number): void {
    enemy.phaseElapsedMs += deltaMs;
    if (enemy.phaseElapsedMs >= LASER_COOLDOWN_MS) {
      enemy.phase          = 'idle';
      enemy.phaseElapsedMs = 0;
    }
  }

  function updateEnemies(deltaMs: number, nowMs: number): void {
    const dt = Math.min(deltaMs / 16.667, 3);
    for (const enemy of enemies) {
      switch (enemy.phase) {
        case 'idle':       updateEnemyIdle(enemy, dt, deltaMs);        break;
        case 'decelerate': updateEnemyDecelerate(enemy, dt, deltaMs);  break;
        case 'dash':       updateEnemyDash(enemy, dt, nowMs);          break;
        case 'overshoot':  updateEnemyOvershoot(enemy, dt);            break;
        case 'cooldown':   updateEnemyCooldown(enemy, deltaMs);        break;
      }
    }
  }

  // ── Player physics ────────────────────────────────────────────

  function updatePhysics(deltaMs: number): void {
    const dt = Math.min(deltaMs / 16.667, 3);

    if (joystick.isActive) {
      // Touch joystick overrides velocity.
      const dx   = joystick.thumbX - joystick.baseX;
      const dy   = joystick.thumbY - joystick.baseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.5) {
        const speed = (dist / JOYSTICK_OUTER_RADIUS) * MAX_RPG_SPEED;
        mote.vx = (dx / dist) * speed;
        mote.vy = (dy / dist) * speed;
      } else {
        mote.vx *= RPG_VELOCITY_DAMPING;
        mote.vy *= RPG_VELOCITY_DAMPING;
      }
    } else {
      // Keyboard: build normalised direction vector from active keys.
      const dirX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const dirY = (keys.down  ? 1 : 0) - (keys.up   ? 1 : 0);
      const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
      if (dirLen > 0) {
        mote.vx = (dirX / dirLen) * MAX_RPG_SPEED;
        mote.vy = (dirY / dirLen) * MAX_RPG_SPEED;
      } else {
        mote.vx *= RPG_VELOCITY_DAMPING;
        mote.vy *= RPG_VELOCITY_DAMPING;
      }
    }

    mote.x += mote.vx * dt;
    mote.y += mote.vy * dt;

    const half = RPG_MOTE_SIZE / 2;
    if (mote.x < half)            { mote.x = half;             mote.vx = 0; }
    if (mote.x > widthPx  - half) { mote.x = widthPx  - half;  mote.vx = 0; }
    if (mote.y < half)            { mote.y = half;             mote.vy = 0; }
    if (mote.y > heightPx - half) { mote.y = heightPx - half;  mote.vy = 0; }

    mote.trailX[mote.trailHead] = mote.x;
    mote.trailY[mote.trailHead] = mote.y;
    mote.trailHead = (mote.trailHead + 1) % RPG_TRAIL_CAPACITY;
    if (mote.trailCount < RPG_TRAIL_CAPACITY) mote.trailCount++;
  }

  // ── Draw helpers ──────────────────────────────────────────────

  /**
   * Draw the bezier lineDash attack trail for a laser enemy.
   *
   * Uses the same draw-then-erase animated technique as the mote-merge
   * trail in particle-renderer.ts: lineDashOffset drives a growing strip
   * (draw phase) then a shrinking strip (erase phase).
   */
  function drawAttackTrail(enemy: LaserEnemy, nowMs: number): void {
    const trail = enemy.attackTrail;
    if (!trail.active) return;

    const isDashing = trail.trailEndMs === Infinity;
    let drawProgress: number;
    let eraseProgress: number;

    if (isDashing) {
      drawProgress  = Math.min(enemy.dashTraveled / LASER_DASH_DISTANCE, 1.0);
      eraseProgress = 0;
    } else {
      drawProgress  = 1.0;
      eraseProgress = Math.min((nowMs - trail.trailEndMs) / LASER_TRAIL_ERASE_MS, 1.0);
      if (eraseProgress >= 1.0) {
        trail.active = false;
        return;
      }
    }

    const sx = trail.startX;
    const sy = trail.startY;
    const tx = trail.endX;
    const ty = trail.endY;

    const ddx = tx - sx;
    const ddy = ty - sy;
    const L   = Math.sqrt(ddx * ddx + ddy * ddy);
    if (L < 1) return;

    // Bezier control point — perpendicular offset for a slight curve.
    const midX       = (sx + tx) * 0.5;
    const midY       = (sy + ty) * 0.5;
    const perpX      = -ddy / L;
    const perpY      =  ddx / L;
    const curveOffset = L * Math.tan(trail.controlAngle);
    const controlX   = midX + perpX * curveOffset;
    const controlY   = midY + perpY * curveOffset;

    // Dash length slightly exceeds the geometric distance (covers bezier arc length).
    const dashLen   = L * 1.1;
    const dashOffset = isDashing
      ? dashLen * (1 - drawProgress)   // trail grows from start toward end
      : -(dashLen * eraseProgress);    // trail shrinks from start

    ctx.save();
    ctx.setLineDash([dashLen, dashLen]);
    ctx.lineDashOffset = dashOffset;
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    const alpha = isDashing ? 0.9 : 0.9 * (1 - eraseProgress * 0.5);

    // Glow pass.
    ctx.globalAlpha = alpha;
    ctx.shadowBlur  = 5;
    ctx.shadowColor = LASER_ENEMY_GLOW;
    ctx.strokeStyle = LASER_ENEMY_GLOW;
    ctx.lineWidth   = 2.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(controlX, controlY, tx, ty);
    ctx.stroke();

    // Core line.
    ctx.shadowBlur  = 0;
    ctx.strokeStyle = LASER_ENEMY_COLOR;
    ctx.lineWidth   = 1.2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(controlX, controlY, tx, ty);
    ctx.stroke();

    ctx.restore();
  }

  function drawEnemies(nowMs: number): void {
    for (const enemy of enemies) {
      drawAttackTrail(enemy, nowMs);

      const half = LASER_ENEMY_SIZE / 2;
      ctx.shadowBlur  = LASER_ENEMY_SIZE * 5;
      ctx.shadowColor = LASER_ENEMY_GLOW;
      ctx.fillStyle   = LASER_ENEMY_COLOR;
      ctx.fillRect(
        Math.floor(enemy.x - half),
        Math.floor(enemy.y - half),
        LASER_ENEMY_SIZE,
        LASER_ENEMY_SIZE,
      );
      ctx.shadowBlur = 0;
    }
  }

  // ── Main draw ─────────────────────────────────────────────────

  function draw(nowMs: number): void {
    ctx.clearRect(0, 0, widthPx, heightPx);

    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, widthPx, heightPx);

    // ── Enemy trails + bodies ──
    drawEnemies(nowMs);

    // ── Player comet trail (movement-dependent) ──
    const speed    = Math.sqrt(mote.vx * mote.vx + mote.vy * mote.vy);
    const isMoving = speed > TRAIL_SPEED_THRESHOLD;

    if (isMoving && mote.trailCount >= 2) {
      const trailLen = mote.trailCount;
      for (let i = 0; i < trailLen; i++) {
        const t      = i / trailLen;
        const bufIdx = (mote.trailHead - trailLen + i + RPG_TRAIL_CAPACITY) % RPG_TRAIL_CAPACITY;
        const tx     = mote.trailX[bufIdx];
        const ty     = mote.trailY[bufIdx];

        const trailSize = RPG_MOTE_SIZE * t * 1.3;
        if (trailSize < 0.3) continue;
        const half = trailSize / 2;

        // Glow halo.
        ctx.globalAlpha = t * 0.45;
        ctx.shadowBlur  = trailSize * 6;
        ctx.shadowColor = RPG_MOTE_GLOW;
        ctx.fillStyle   = RPG_MOTE_GLOW;
        const glowHalf  = half * 2.2;
        ctx.fillRect(Math.floor(tx - glowHalf), Math.floor(ty - glowHalf), Math.ceil(glowHalf * 2), Math.ceil(glowHalf * 2));
        ctx.shadowBlur  = 0;

        // Core trail pixel.
        ctx.globalAlpha = t * 0.7;
        ctx.fillStyle   = RPG_MOTE_COLOR;
        ctx.fillRect(Math.floor(tx - half), Math.floor(ty - half), Math.ceil(trailSize), Math.ceil(trailSize));
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;
    }

    // ── Always-on player glow (pulsing aura, independent of movement) ──
    const pulseT    = (Math.sin(glowTimeS * GLOW_PULSE_SPEED) + 1) * 0.5; // 0..1
    const glowSize  = RPG_MOTE_SIZE * (2.2 + pulseT * 1.4);
    const glowHalf  = glowSize / 2;
    ctx.globalAlpha = 0.18 + pulseT * 0.22;
    ctx.shadowBlur  = glowSize * 3;
    ctx.shadowColor = RPG_MOTE_GLOW;
    ctx.fillStyle   = RPG_MOTE_GLOW;
    ctx.fillRect(Math.floor(mote.x - glowHalf), Math.floor(mote.y - glowHalf), Math.ceil(glowSize), Math.ceil(glowSize));
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;

    // ── Player mote core ──
    const moteHalf = RPG_MOTE_SIZE / 2;
    ctx.shadowBlur  = RPG_MOTE_SIZE * 5;
    ctx.shadowColor = RPG_MOTE_GLOW;
    ctx.fillStyle   = RPG_MOTE_COLOR;
    ctx.fillRect(Math.floor(mote.x - moteHalf), Math.floor(mote.y - moteHalf), RPG_MOTE_SIZE, RPG_MOTE_SIZE);
    ctx.shadowBlur  = 0;

    // ── Virtual joystick (touch only) ──
    if (joystick.isActive) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#c9a84c';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.arc(joystick.baseX, joystick.baseY, JOYSTICK_OUTER_RADIUS, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.55;
      ctx.fillStyle   = '#c9a84c';
      ctx.shadowBlur  = JOYSTICK_THUMB_RADIUS * 2;
      ctx.shadowColor = 'rgba(201, 168, 76, 0.6)';
      ctx.beginPath();
      ctx.arc(joystick.thumbX, joystick.thumbY, JOYSTICK_THUMB_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  // ── Public interface ──────────────────────────────────────────

  return {
    canvas,
    statsPanel,

    update(deltaMs: number): void {
      const nowMs = performance.now();

      // Spawn timer.
      spawnTimerMs -= deltaMs;
      if (spawnTimerMs <= 0) {
        trySpawnEnemy();
        spawnTimerMs = ENEMY_SPAWN_INTERVAL_MS;
      }

      glowTimeS += deltaMs / 1000;

      updatePhysics(deltaMs);
      updateEnemies(deltaMs, nowMs);
      updateStatsPanelDom();
      draw(nowMs);
    },

    resize(_cont: HTMLElement): void {
      doResize();
      // Re-clamp entities to fixed bounds (guards against any future dynamic resizing).
      const half = RPG_MOTE_SIZE / 2;
      mote.x = Math.max(half, Math.min(widthPx  - half, mote.x));
      mote.y = Math.max(half, Math.min(heightPx - half, mote.y));
    },

    setActive(active: boolean): void {
      _isActive = active;
      if (!active) {
        // Clear key state so no phantom movement on re-activation.
        keys.left = keys.right = keys.up = keys.down = false;
      }
    },
  };
}
