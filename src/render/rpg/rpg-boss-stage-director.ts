/**
 * rpg-boss-stage-director.ts — Stage director for boss-wave fights.
 *
 * Choreographs a bottom-to-boss traversal loop for each boss-wave stage:
 *   1. Player begins at the bottom safe zone.
 *   2. A luminous corridor leads from the safe zone up to the boss.
 *   3. Stage hazards (vertical rain streams, sweep bars) are spawned around
 *      the corridor, deliberately leaving the corridor navigable.
 *   4. When the player reaches the boss a short damage-window opens; the
 *      diamond-blade combo can land hits.
 *   5. After enough hits the player is teleported back; the stage advances.
 *
 * This module does NOT replace the existing danmaku system; it suppresses
 * the random special-attack scheduler during boss-wave fights and provides
 * corridor-aware hazards instead.
 *
 * Exports (used by rpg-render.ts, rpg-render-update.ts, rpg-boss-stage-draw.ts):
 *   BossStageDirectorState, BossStageDirectorCtx
 *   createBossStageDirectorState()
 *   resetBossStageDirector(state)         — call from enterBossWave
 *   advanceBossStage(state)               — call from teleportPlayerToSafeZone
 *   deactivateBossStageDirector(state)    — call from exitBossWave
 *   updateBossStageDirector(...)          — call once per frame when boss wave active
 *   getCorridorCenterX(...)               — shared by draw module
 *   isPlayerInStageDirectorSafeZone(...)  — shared safe-zone guard
 */

import {
  BOSS_BOTTOM_SAFE_ZONE_R, BOSS_SAFE_ZONE_Y_FACTOR,
  PLAYER_HIT_RADIUS,
  PLAYER_IFRAME_MIN_MS,
  PLAYER_IFRAME_MAX_ADD_MS,
} from './rpg-constants';

// ── Fairness & tuning constants ───────────────────────────────────────────────

/** Half-width of the safe corridor per stage (px). Wider = easier. */
export const CORRIDOR_HALF_WIDTH_STAGE: readonly number[] = [55, 42, 32];

/** Extra clearance added inside the corridor on top of PLAYER_HIT_RADIUS (px). */
export const CORRIDOR_SAFETY_MARGIN = 8;

/** Radius around the boss center that opens the damage window (px). */
export const BOSS_DAMAGE_WINDOW_RADIUS = 32;

/** Duration of the visual flash when the player first contacts the boss (ms). */
export const BOSS_CONNECT_FLASH_MS = 500;

// ── Route types ───────────────────────────────────────────────────────────────

export type BossRouteType = 'centerVertical' | 'sCurveRight' | 'sCurveLeft';

const ROUTE_TYPES: readonly BossRouteType[] = [
  'centerVertical',
  'sCurveRight',
  'sCurveLeft',
];

// ── Wisp particle type ────────────────────────────────────────────────────────

export interface WispParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeMs: number;
  maxLifeMs: number;
  size: number;
  color: string;
}

const WISP_COLORS: readonly string[] = [
  '#ffd764', '#ffe599', '#d6aaff', '#a0f0d0', '#ffffff', '#ffb3f0', '#88d4ff',
];
const WISP_LIFE_MS = 2400;
const WISP_SPAWN_INTERVAL_MS = 160;
const MAX_WISPS = 65;

// ── Stage hazard types ────────────────────────────────────────────────────────

export type StageHazardPhase = 'telegraph' | 'active' | 'fading';

/** A single rain-stream particle. Stream x is the baseline; sinePhase offsets horizontally. */
export interface RainParticle {
  y: number;
  lifeMs: number;
  /** Elapsed ms since spawn — drives the sine-wave x displacement. */
  ageMs: number;
  /** Per-particle phase offset so adjacent particles don't move in lockstep. */
  sinePhase: number;
}

export interface RainStream {
  x: number;
  particles: RainParticle[];
  nextSpawnMs: number;
}

export interface VerticalRainHazard {
  readonly kind: 'verticalRain';
  phase: StageHazardPhase;
  phaseMs: number;
  readonly telegraphDuration: number;
  readonly activeDuration: number;
  readonly fadingDuration: number;
  streams: RainStream[];
  readonly particleColor: string;
  readonly particleGlow: string;
  readonly speed: number;
  readonly particleRadius: number;
  readonly atk: number;
}

export interface SweepBarHazard {
  readonly kind: 'sweepBar';
  phase: StageHazardPhase;
  phaseMs: number;
  readonly telegraphDuration: number;
  readonly activeDuration: number;
  readonly fadingDuration: number;
  y: number;
  readonly vy: number;
  readonly barHalfHeight: number;
  readonly color: string;
  readonly glowColor: string;
  readonly atk: number;
  gapCenterX: number;
  readonly gapHalfWidth: number;
}

export type StageHazard = VerticalRainHazard | SweepBarHazard;

// ── Director state ────────────────────────────────────────────────────────────

export interface BossStageDirectorState {
  isActive: boolean;
  /** 0-based stage index, wraps modulo 3. */
  stageIndex: number;
  /** Total time elapsed in the current stage (ms). */
  stageTimerMs: number;
  /** Half-width of the corridor for the current stage. */
  corridorHalfWidth: number;
  /** Active stage hazards. */
  hazards: StageHazard[];
  /** Countdown until the next hazard set should spawn (ms). */
  nextHazardMs: number;
  /** Wisp particles floating along the corridor. */
  wisps: WispParticle[];
  /** Countdown until the next wisp spawn (ms). */
  wispSpawnMs: number;
  /** Positive while the boss-contact flash visual is playing (ms remaining). */
  bossConnectFlashMs: number;
  /** True while the player is within BOSS_DAMAGE_WINDOW_RADIUS of the boss. */
  playerNearBoss: boolean;
  /** Whether developer debug overlay should be drawn. */
  isDevMode: boolean;
  /** Total number of stages cleared since the fight started. */
  stagesCompleted: number;
}

export function createBossStageDirectorState(): BossStageDirectorState {
  return {
    isActive: false,
    stageIndex: 0,
    stageTimerMs: 0,
    corridorHalfWidth: CORRIDOR_HALF_WIDTH_STAGE[0],
    hazards: [],
    nextHazardMs: 2200,
    wisps: [],
    wispSpawnMs: WISP_SPAWN_INTERVAL_MS,
    bossConnectFlashMs: 0,
    playerNearBoss: false,
    isDevMode: false,
    stagesCompleted: 0,
  };
}

/** Call when enterBossWave fires. Resets to stage 0. */
export function resetBossStageDirector(state: BossStageDirectorState): void {
  state.isActive = true;
  state.stageIndex = 0;
  state.stageTimerMs = 0;
  state.corridorHalfWidth = CORRIDOR_HALF_WIDTH_STAGE[0];
  state.hazards.length = 0;
  state.nextHazardMs = 2200;
  state.wisps.length = 0;
  state.wispSpawnMs = WISP_SPAWN_INTERVAL_MS;
  state.bossConnectFlashMs = 0;
  state.playerNearBoss = false;
  state.stagesCompleted = 0;
}

/**
 * Call when teleportPlayerToSafeZone fires (after SWORD_COMBO_THRESHOLD hits).
 * Advances the stage, widens or narrows the corridor, clears old hazards.
 */
export function advanceBossStage(state: BossStageDirectorState): void {
  if (!state.isActive) return;
  state.stagesCompleted++;
  state.stageIndex = (state.stageIndex + 1) % 3;
  state.stageTimerMs = 0;
  state.corridorHalfWidth = CORRIDOR_HALF_WIDTH_STAGE[state.stageIndex];
  state.hazards.length = 0;
  state.nextHazardMs = 1800;
  state.bossConnectFlashMs = 0;
  state.playerNearBoss = false;
}

/** Call when exitBossWave fires. */
export function deactivateBossStageDirector(state: BossStageDirectorState): void {
  state.isActive = false;
  state.hazards.length = 0;
  state.wisps.length = 0;
  state.bossConnectFlashMs = 0;
  state.playerNearBoss = false;
}

// ── Context interface ─────────────────────────────────────────────────────────

export interface BossStageDirectorCtx {
  readonly dim: { w: number; h: number };
  readonly playerStats: { hp: number; maxHp: number; def: number };
  getPlayerIFramesMs(): number;
  setPlayerIFramesMs(ms: number): void;
  setPlayerHp(hp: number): void;
  spawnDamageNumber(
    x: number, y: number,
    vx: number, vy: number,
    text: string,
    ratio: number,
    color: string,
  ): void;
}

// ── Route computation ─────────────────────────────────────────────────────────

/**
 * Returns the x-coordinate of the corridor centre at a given worldY.
 * t=0 → safe zone bottom, t=1 → boss position.
 */
export function getCorridorCenterX(
  worldY: number,
  bossX: number,
  bossY: number,
  safeZoneX: number,
  safeZoneY: number,
  stageIndex: number,
  dimW: number,
): number {
  const span = safeZoneY - bossY;
  const t = span > 0.1
    ? Math.max(0, Math.min(1, (safeZoneY - worldY) / span))
    : 0.5;

  const baseX = safeZoneX + (bossX - safeZoneX) * t;
  const routeType = ROUTE_TYPES[Math.min(stageIndex, ROUTE_TYPES.length - 1)];

  if (routeType === 'centerVertical') {
    return baseX;
  }
  // S-curve amplitude: 8% of screen width for stage 1, 7% for stage 2 (mirrored)
  const amp = dimW * (stageIndex === 1 ? 0.09 : 0.07);
  const sign = routeType === 'sCurveRight' ? 1 : -1;
  return baseX + sign * Math.sin(t * Math.PI) * amp;
}

// ── Safe-zone guard ───────────────────────────────────────────────────────────

/** Returns true while the player is inside the bottom safe zone (with a small margin). */
export function isPlayerInStageDirectorSafeZone(
  px: number,
  py: number,
  dim: { w: number; h: number },
): boolean {
  const dx = px - dim.w / 2;
  const dy = py - dim.h * BOSS_SAFE_ZONE_Y_FACTOR;
  const r = BOSS_BOTTOM_SAFE_ZONE_R + CORRIDOR_SAFETY_MARGIN;
  return dx * dx + dy * dy <= r * r;
}

// ── Hazard spawning helpers ───────────────────────────────────────────────────

const RAIN_COLORS: readonly { color: string; glow: string }[] = [
  { color: '#4488ff', glow: '#88bbff' },
  { color: '#ff8844', glow: '#ffbb88' },
  { color: '#cc44ff', glow: '#ee88ff' },
];

const SWEEP_COLORS: readonly { color: string; glow: string }[] = [
  { color: '#00ccff', glow: '#44eeff' },
  { color: '#ffcc00', glow: '#ffee66' },
  { color: '#ff44aa', glow: '#ff88cc' },
];

const RAIN_SPEED_BY_STAGE: readonly number[] = [65, 88, 112];
const HAZARD_INTERVAL_MS: readonly number[] = [3200, 2400, 1900];
const RAIN_PARTICLE_LIFE_MS = 5500;
const RAIN_PARTICLE_RADIUS = 4.5;
const RAIN_SPAWN_INTERVAL_MS = 700;
/** Horizontal amplitude (px) of the sine-wave drift applied to rain particles. */
const RAIN_SINE_AMPLITUDE = 16;
/** Angular frequency (rad/ms) — one full swing every ~2 seconds. */
const RAIN_SINE_FREQ = Math.PI * 2 / 2000;
const SWEEP_SPEED = 58; // px/s

function _spawnVerticalRain(
  stageIndex: number,
  bossX: number,
  bossY: number,
  safeZoneX: number,
  safeZoneY: number,
  corridorHalfWidth: number,
  dim: { w: number; h: number },
): VerticalRainHazard {
  const c = RAIN_COLORS[stageIndex % RAIN_COLORS.length];
  const speed = RAIN_SPEED_BY_STAGE[stageIndex];
  const exclusion = corridorHalfWidth + CORRIDOR_SAFETY_MARGIN + RAIN_PARTICLE_RADIUS + PLAYER_HIT_RADIUS;

  // Sample several Y heights to determine whether a column is in the corridor
  const sampleHeights = [
    safeZoneY,
    safeZoneY * 0.7 + bossY * 0.3,
    (safeZoneY + bossY) * 0.5,
    safeZoneY * 0.3 + bossY * 0.7,
    bossY,
  ];

  const N = 15;
  const streams: RainStream[] = [];
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * dim.w;
    let blocked = false;
    for (const hy of sampleHeights) {
      const cx = getCorridorCenterX(hy, bossX, bossY, safeZoneX, safeZoneY, stageIndex, dim.w);
      if (Math.abs(x - cx) < exclusion) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      streams.push({
        x,
        particles: [],
        nextSpawnMs: Math.random() * RAIN_SPAWN_INTERVAL_MS,
      });
    }
  }

  return {
    kind: 'verticalRain',
    phase: 'telegraph',
    phaseMs: 900,
    telegraphDuration: 900,
    activeDuration: 5200,
    fadingDuration: 700,
    streams,
    particleColor: c.color,
    particleGlow: c.glow,
    speed,
    particleRadius: RAIN_PARTICLE_RADIUS,
    atk: 12 + stageIndex * 3,
  };
}

function _spawnSweepBar(
  stageIndex: number,
  bossX: number,
  bossY: number,
  safeZoneX: number,
  safeZoneY: number,
  corridorHalfWidth: number,
  dim: { w: number; h: number },
): SweepBarHazard {
  const c = SWEEP_COLORS[stageIndex % SWEEP_COLORS.length];
  // Bar starts just below the boss and sweeps downward
  const startY = bossY + 25;
  const gapCenterX = getCorridorCenterX(
    startY, bossX, bossY, safeZoneX, safeZoneY, stageIndex, dim.w,
  );
  const gapHalfWidth = corridorHalfWidth + CORRIDOR_SAFETY_MARGIN;

  return {
    kind: 'sweepBar',
    phase: 'telegraph',
    phaseMs: 800,
    telegraphDuration: 800,
    activeDuration: 4200,
    fadingDuration: 600,
    y: startY,
    vy: SWEEP_SPEED,
    barHalfHeight: 6,
    color: c.color,
    glowColor: c.glow,
    atk: 10 + stageIndex * 3,
    gapCenterX,
    gapHalfWidth,
  };
}

// ── Vertical rain update ──────────────────────────────────────────────────────

function _updateVerticalRain(
  h: VerticalRainHazard,
  dim: { w: number; h: number },
  deltaMs: number,
): void {
  const distPerMs = h.speed / 1000;
  const spawnActive = h.phase === 'active';

  for (const stream of h.streams) {
    // Advance existing particles
    for (let i = stream.particles.length - 1; i >= 0; i--) {
      const p = stream.particles[i];
      p.y += distPerMs * deltaMs;
      p.ageMs += deltaMs;
      p.lifeMs -= deltaMs;
      if (p.lifeMs <= 0 || p.y > dim.h + h.particleRadius * 2) {
        stream.particles.splice(i, 1);
      }
    }
    // Spawn new particles during active phase
    if (spawnActive) {
      stream.nextSpawnMs -= deltaMs;
      if (stream.nextSpawnMs <= 0) {
        stream.nextSpawnMs = RAIN_SPAWN_INTERVAL_MS + Math.random() * 120;
        stream.particles.push({
          y: -h.particleRadius * 2,
          lifeMs: RAIN_PARTICLE_LIFE_MS,
          ageMs: 0,
          sinePhase: Math.random() * Math.PI * 2,
        });
      }
    }
  }
}

// ── Collision helpers ─────────────────────────────────────────────────────────

export function rainParticleX(streamX: number, p: RainParticle): number {
  return streamX + RAIN_SINE_AMPLITUDE * Math.sin(p.ageMs * RAIN_SINE_FREQ + p.sinePhase);
}

function _rainHitsPlayer(h: VerticalRainHazard, px: number, py: number): boolean {
  const threshold = (PLAYER_HIT_RADIUS + h.particleRadius) ** 2;
  for (const stream of h.streams) {
    for (const p of stream.particles) {
      const dx = px - rainParticleX(stream.x, p);
      const dy = py - p.y;
      if (dx * dx + dy * dy < threshold) return true;
    }
  }
  return false;
}

function _sweepHitsPlayer(h: SweepBarHazard, px: number, py: number): boolean {
  // Check vertical overlap with the bar
  if (Math.abs(py - h.y) > h.barHalfHeight + PLAYER_HIT_RADIUS) return false;
  // Player is safe if fully inside the gap
  const halfGap = h.gapHalfWidth;
  return (
    px < h.gapCenterX - halfGap + PLAYER_HIT_RADIUS ||
    px > h.gapCenterX + halfGap - PLAYER_HIT_RADIUS
  );
}

function _applyHazardDamage(
  h: StageHazard,
  ctx: BossStageDirectorCtx,
  px: number,
  py: number,
): void {
  const rawDmg = h.atk - ctx.playerStats.def;
  const dmg = Math.max(1, rawDmg);
  ctx.setPlayerHp(Math.max(0, ctx.playerStats.hp - dmg));
  const ratio = Math.min(1, dmg / Math.max(1, ctx.playerStats.maxHp));
  const iframeMs = PLAYER_IFRAME_MIN_MS + ratio * PLAYER_IFRAME_MAX_ADD_MS;
  ctx.setPlayerIFramesMs(iframeMs);

  // Compute knock direction (away from hazard origin toward player)
  const kx = h.kind === 'sweepBar' ? (px < h.gapCenterX ? -1 : 1) : 0;
  const ky = h.kind === 'sweepBar' ? 0 : 1;
  ctx.spawnDamageNumber(px, py, kx, ky, String(Math.round(dmg)), ratio, '#ff6666');
}

// ── Main update ───────────────────────────────────────────────────────────────

/**
 * Advances the stage director by one frame.
 * Call from runRpgUpdate while isBossWaveActive is true.
 *
 * @param deltaMs Time since last frame, already scaled by bossSpeedPct/100.
 */
export function updateBossStageDirector(
  state: BossStageDirectorState,
  ctx: BossStageDirectorCtx,
  playerX: number,
  playerY: number,
  bossX: number,
  bossY: number,
  deltaMs: number,
): void {
  if (!state.isActive) return;

  const { dim } = ctx;
  const safeZoneX = dim.w / 2;
  const safeZoneY = dim.h * BOSS_SAFE_ZONE_Y_FACTOR;

  state.stageTimerMs += deltaMs;

  // ── Damage-window check ───────────────────────────────────────────────────
  const dx = playerX - bossX;
  const dy = playerY - bossY;
  const distSq = dx * dx + dy * dy;
  const wasNear = state.playerNearBoss;
  state.playerNearBoss = distSq < BOSS_DAMAGE_WINDOW_RADIUS * BOSS_DAMAGE_WINDOW_RADIUS;
  if (state.playerNearBoss && !wasNear) {
    state.bossConnectFlashMs = BOSS_CONNECT_FLASH_MS;
  }
  if (state.bossConnectFlashMs > 0) {
    state.bossConnectFlashMs = Math.max(0, state.bossConnectFlashMs - deltaMs);
  }

  // ── Wisp particles ────────────────────────────────────────────────────────
  state.wispSpawnMs -= deltaMs;
  if (state.wispSpawnMs <= 0 && state.wisps.length < MAX_WISPS) {
    state.wispSpawnMs = WISP_SPAWN_INTERVAL_MS + Math.random() * 60;
    const tRng = Math.random();
    const wispY = safeZoneY + (bossY - safeZoneY) * tRng;
    const cx = getCorridorCenterX(
      wispY, bossX, bossY, safeZoneX, safeZoneY, state.stageIndex, dim.w,
    );
    const offsetX = (Math.random() - 0.5) * state.corridorHalfWidth * 0.7;
    state.wisps.push({
      x: cx + offsetX,
      y: wispY,
      vx: (Math.random() - 0.5) * 0.25,
      vy: -(0.4 + Math.random() * 0.5),
      lifeMs: WISP_LIFE_MS,
      maxLifeMs: WISP_LIFE_MS,
      size: 1.5 + Math.random() * 2.5,
      color: WISP_COLORS[Math.floor(Math.random() * WISP_COLORS.length)],
    });
  }
  const dtF = deltaMs / 16.667; // normalised to 60fps
  for (let i = state.wisps.length - 1; i >= 0; i--) {
    const w = state.wisps[i];
    w.x += w.vx * dtF;
    w.y += w.vy * dtF;
    w.lifeMs -= deltaMs;
    if (w.lifeMs <= 0) state.wisps.splice(i, 1);
  }

  // ── Hazard scheduling ─────────────────────────────────────────────────────
  state.nextHazardMs -= deltaMs;
  if (state.nextHazardMs <= 0 && state.hazards.length < 3) {
    const interval = HAZARD_INTERVAL_MS[state.stageIndex];
    state.nextHazardMs = interval;

    // Stage 0: only vertical rain
    // Stage 1+: alternate rain / sweep; pick the kind not last spawned
    let spawnSweep = false;
    if (state.stageIndex >= 1) {
      let lastRainIdx = -1;
      let lastSweepIdx = -1;
      for (let i = state.hazards.length - 1; i >= 0; i--) {
        if (state.hazards[i].kind === 'verticalRain' && lastRainIdx < 0) lastRainIdx = i;
        if (state.hazards[i].kind === 'sweepBar' && lastSweepIdx < 0) lastSweepIdx = i;
      }
      spawnSweep = lastRainIdx >= lastSweepIdx;
    }

    if (spawnSweep) {
      state.hazards.push(_spawnSweepBar(
        state.stageIndex, bossX, bossY, safeZoneX, safeZoneY,
        state.corridorHalfWidth, dim,
      ));
    } else {
      state.hazards.push(_spawnVerticalRain(
        state.stageIndex, bossX, bossY, safeZoneX, safeZoneY,
        state.corridorHalfWidth, dim,
      ));
    }
  }

  // ── Update active hazards ─────────────────────────────────────────────────
  for (let i = state.hazards.length - 1; i >= 0; i--) {
    const h = state.hazards[i];
    h.phaseMs -= deltaMs;
    if (h.phaseMs <= 0) {
      if (h.phase === 'telegraph') {
        h.phase = 'active';
        h.phaseMs = h.activeDuration;
      } else if (h.phase === 'active') {
        h.phase = 'fading';
        h.phaseMs = h.fadingDuration;
      } else {
        // fading → expired
        state.hazards.splice(i, 1);
        continue;
      }
    }

    if (h.kind === 'verticalRain') {
      _updateVerticalRain(h, dim, deltaMs);
    } else {
      // sweepBar: advance position and update gap to track the corridor
      h.y += h.vy * deltaMs / 1000;
      h.gapCenterX = getCorridorCenterX(
        h.y, bossX, bossY, safeZoneX, safeZoneY, state.stageIndex, dim.w,
      );
      // If bar has exited the screen, force it to start fading
      if (h.y > dim.h + 60) {
        h.phase = 'fading';
        h.phaseMs = Math.min(h.phaseMs, h.fadingDuration);
      }
    }
  }

  // ── Collision detection ───────────────────────────────────────────────────
  if (ctx.getPlayerIFramesMs() > 0) return;
  if (isPlayerInStageDirectorSafeZone(playerX, playerY, dim)) return;
  if (state.playerNearBoss) return; // damage window → no hazard damage

  for (const h of state.hazards) {
    if (h.phase !== 'active') continue;
    const hit =
      h.kind === 'verticalRain'
        ? _rainHitsPlayer(h, playerX, playerY)
        : _sweepHitsPlayer(h, playerX, playerY);
    if (hit) {
      _applyHazardDamage(h, ctx, playerX, playerY);
      return; // one hit per frame
    }
  }
}
