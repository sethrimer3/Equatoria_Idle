/**
 * enemy-status-effects.ts — Tier 1 lens status effect system for RPG combat.
 *
 * Uses a WeakMap registry so status state is co-located with enemy objects
 * without modifying any enemy type interfaces.
 *
 * Public surface:
 *   applyLensStatus(enemy, status)          — apply / refresh a status
 *   clearEnemyStatuses(enemy)               — call on enemy death/despawn
 *   getIncomingDamageMult(enemy)            — total vulnerability multiplier (≥1)
 *   getMovementSlowMult(enemy)              — speed multiplier (0.2–1.0)
 *   getRiftScarredDamageMult(enemy, srcKey) — bonus for eigenstein stacks
 *   incrementRiftScarredStacks(enemy,srcKey)— call after each eigenstein hit
 *   tickEnemyStatuses(arrays, deltaMs, moteX, moteY) — per-frame tick
 */

import type { TierId } from '../../data/tiers';

// ── Status key type ────────────────────────────────────────────────────────────

export type EnemyStatusKey =
  | 'abraded'
  | 'refracted'
  | 'burning'
  | 'radiant'
  | 'poisoned'
  | 'chilled'
  | 'timeWarped'
  | 'echoMarked'
  | 'cracked'
  | 'gravitized'
  | 'fractalWound'
  | 'riftScarred';

// ── Pending echo (Amethyst echo-marked) ───────────────────────────────────────

export interface PendingEcho {
  remainingMs: number;
  damage: number;
}

// ── Status record ──────────────────────────────────────────────────────────────

export interface ActiveEnemyStatus {
  key: EnemyStatusKey;
  sourceTierId: TierId;
  sourceLensId?: string;
  sourceWeaponId?: string;
  durationMs: number;
  remainingMs: number;
  magnitude: number;
  /** tick interval for DoT effects */
  tickEveryMs?: number;
  /** accumulated tick timer */
  tickMs: number;
  /** Fractal Wound: remaining ticks count */
  fractalTicksLeft?: number;
  /** Fractal Wound: current tick damage (decays 70% per tick) */
  fractalTickDamage?: number;
  /** Echo-Marked pending echoes */
  pendingEchoes?: PendingEcho[];
}

// ── Per-enemy state ────────────────────────────────────────────────────────────

interface EnemyStatusState {
  statuses: ActiveEnemyStatus[];
  /** Eigenstein stacks per source key (lensId or weaponId). Resets on death. */
  riftScarredStacks: Map<string, number>;
}

// ── Registry ───────────────────────────────────────────────────────────────────

const _registry = new WeakMap<object, EnemyStatusState>();

function _getOrCreate(enemy: object): EnemyStatusState {
  let s = _registry.get(enemy);
  if (!s) { s = { statuses: [], riftScarredStacks: new Map() }; _registry.set(enemy, s); }
  return s;
}

export function clearEnemyStatuses(enemy: object): void {
  _registry.delete(enemy);
}

// ── Status magnitude helpers (normalise raw lens magnitude to gameplay values) ──

const VULN_RATE    = 0.015;   // % per magnitude unit for damage vulnerability
const CHILL_RATE   = 0.020;   // % per magnitude unit for Chilled slow
const WARP_RATE    = 0.012;   // % per magnitude unit for Time-Warped slow
const GRAV_RATE    = 0.010;   // % per magnitude unit for Gravitized slow
const BURN_DPS     = 0.50;    // damage per second per magnitude unit (Burning)
const POISON_DPS   = 0.30;    // damage per second per magnitude unit (Poisoned)
const ECHO_RATE    = 0.015;   // fraction of hit damage echoed per magnitude unit
const RIFT_RATE    = 0.003;   // bonus per magnitude per stack (Rift-Scarred)

// Caps per status
const VULN_CAP     = 0.50;    // 50% max vulnerability
const CHILL_CAP    = 0.60;    // 60% max chilled slow
const WARP_CAP     = 0.40;    // 40% max time-warped slow
const GRAV_CAP     = 0.40;    // 40% max gravitized slow
const TOTAL_SLOW   = 0.80;    // 80% max movement slow across all statuses
const MIN_SPEED    = 0.20;    // 20% minimum speed (cannot fully stop)
const ECHO_CAP     = 0.40;    // 40% max echo fraction
const RIFT_CAP     = 0.05;    // 5% max bonus per stack
const RIFT_STACKS  = 20;      // hard stack cap
const FRAC_TICKS   = 4;       // Fractal Wound tick count
const FRAC_DECAY   = 0.70;    // Fractal Wound decay per tick

/** Clamp value between min and max. */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ── Apply / refresh a status ───────────────────────────────────────────────────

export interface LensStatusParams {
  key: EnemyStatusKey;
  sourceTierId: TierId;
  sourceLensId?: string;
  sourceWeaponId?: string;
  durationMs: number;
  magnitude: number;
  tickEveryMs?: number;
  /** For Fractal Wound: initial tick damage */
  fractalInitialDamage?: number;
  /** For Echo-Marked: damage to echo */
  echoDamage?: number;
}

export function applyLensStatus(enemy: object, params: LensStatusParams): void {
  const state = _getOrCreate(enemy);
  const existing = state.statuses.find(s => s.key === params.key);

  if (params.key === 'fractalWound') {
    // Fractal Wound: always add a new independent wound (up to a max of 2 active)
    const active = state.statuses.filter(s => s.key === 'fractalWound');
    if (active.length < 2) {
      state.statuses.push({
        key: 'fractalWound',
        sourceTierId: params.sourceTierId,
        sourceLensId: params.sourceLensId,
        durationMs: params.durationMs,
        remainingMs: params.durationMs,
        magnitude: params.magnitude,
        tickEveryMs: params.tickEveryMs,
        tickMs: 0,
        fractalTicksLeft: FRAC_TICKS,
        fractalTickDamage: clamp(params.fractalInitialDamage ?? params.magnitude * 0.5, 0, 200),
      });
    }
    return;
  }

  if (params.key === 'echoMarked') {
    // Echo-Marked: queue a new echo (up to 3 pending)
    const echoTarget = existing ?? state.statuses.find(s => s.key === 'echoMarked');
    if (echoTarget) {
      echoTarget.remainingMs = params.durationMs;
      if (!echoTarget.pendingEchoes) echoTarget.pendingEchoes = [];
      if (echoTarget.pendingEchoes.length < 3) {
        echoTarget.pendingEchoes.push({ remainingMs: 600, damage: clamp(params.echoDamage ?? 0, 0, 5000) });
      }
    } else {
      state.statuses.push({
        key: 'echoMarked',
        sourceTierId: params.sourceTierId,
        sourceLensId: params.sourceLensId,
        durationMs: params.durationMs,
        remainingMs: params.durationMs,
        magnitude: params.magnitude,
        tickMs: 0,
        pendingEchoes: [{ remainingMs: 600, damage: clamp(params.echoDamage ?? 0, 0, 5000) }],
      });
    }
    return;
  }

  if (params.key === 'riftScarred') {
    // Rift-Scarred: refresh duration only (stacks tracked separately)
    if (existing) {
      existing.remainingMs = params.durationMs;
      existing.magnitude = Math.max(existing.magnitude, params.magnitude);
    } else {
      state.statuses.push({
        key: 'riftScarred',
        sourceTierId: params.sourceTierId,
        sourceLensId: params.sourceLensId,
        durationMs: params.durationMs,
        remainingMs: params.durationMs,
        magnitude: params.magnitude,
        tickMs: 0,
      });
    }
    return;
  }

  if (existing) {
    // Refresh duration and update magnitude to max
    existing.remainingMs = params.durationMs;
    existing.magnitude = Math.max(existing.magnitude, params.magnitude);
  } else {
    state.statuses.push({
      key: params.key,
      sourceTierId: params.sourceTierId,
      sourceLensId: params.sourceLensId,
      durationMs: params.durationMs,
      remainingMs: params.durationMs,
      magnitude: params.magnitude,
      tickEveryMs: params.tickEveryMs,
      tickMs: 0,
    });
  }
}

// ── Damage multiplier ──────────────────────────────────────────────────────────

/** Returns the incoming weapon damage multiplier for this enemy (≥1). */
export function getIncomingDamageMult(enemy: object): number {
  const state = _registry.get(enemy);
  if (!state) return 1;
  let mult = 1;
  for (const s of state.statuses) {
    switch (s.key) {
      case 'abraded':   mult *= 1 + clamp(s.magnitude * VULN_RATE, 0, VULN_CAP); break;
      case 'refracted': mult *= 1 + clamp(s.magnitude * VULN_RATE, 0, VULN_CAP); break;
      case 'radiant':   mult *= 1 + clamp(s.magnitude * VULN_RATE, 0, VULN_CAP); break;
      case 'cracked':   mult *= 1 + clamp(s.magnitude * VULN_RATE, 0, VULN_CAP); break;
    }
  }
  return mult;
}

/** Returns the rift-scarred incoming damage multiplier for a specific source key (≥1). */
export function getRiftScarredDamageMult(enemy: object, sourceKey: string): number {
  const state = _registry.get(enemy);
  if (!state) return 1;
  const stacks = state.riftScarredStacks.get(sourceKey) ?? 0;
  if (stacks === 0) return 1;
  const magn = state.statuses.find(s => s.key === 'riftScarred')?.magnitude ?? 10;
  const bonusPerStack = clamp(magn * RIFT_RATE, 0, RIFT_CAP);
  return 1 + stacks * bonusPerStack;
}

/** Increment Rift-Scarred stacks for a source key. Call after a damaging hit. */
export function incrementRiftScarredStacks(enemy: object, sourceKey: string): void {
  const state = _registry.get(enemy);
  if (!state) return;
  if (!state.statuses.some(s => s.key === 'riftScarred')) return;
  const cur = state.riftScarredStacks.get(sourceKey) ?? 0;
  state.riftScarredStacks.set(sourceKey, Math.min(RIFT_STACKS, cur + 1));
}

// ── Movement slow multiplier ───────────────────────────────────────────────────

/** Returns effective speed multiplier for this enemy (MIN_SPEED–1.0). */
export function getMovementSlowMult(enemy: object): number {
  const state = _registry.get(enemy);
  if (!state) return 1;
  let totalSlow = 0;
  for (const s of state.statuses) {
    switch (s.key) {
      case 'chilled':    totalSlow += clamp(s.magnitude * CHILL_RATE, 0, CHILL_CAP); break;
      case 'timeWarped': totalSlow += clamp(s.magnitude * WARP_RATE,  0, WARP_CAP);  break;
      case 'gravitized': totalSlow += clamp(s.magnitude * GRAV_RATE,  0, GRAV_CAP);  break;
    }
  }
  if (totalSlow === 0) return 1;
  return Math.max(MIN_SPEED, 1 - clamp(totalSlow, 0, TOTAL_SLOW));
}

// ── Echo fraction helper ───────────────────────────────────────────────────────

export function getEchoFraction(magnitude: number): number {
  return clamp(magnitude * ECHO_RATE, 0, ECHO_CAP);
}

// ── Burn/Poison DPS helpers ────────────────────────────────────────────────────

function _burnDmgPerTick(magnitude: number, tickMs: number): number {
  return clamp((magnitude * BURN_DPS) * (tickMs / 1000), 0, 500);
}

function _poisonDmgPerTick(magnitude: number, tickMs: number): number {
  return clamp((magnitude * POISON_DPS) * (tickMs / 1000), 0, 300);
}

// ── Per-frame tick ─────────────────────────────────────────────────────────────

/** Minimal enemy interface needed for status ticking. */
interface TickableEnemy {
  hp: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function _tickEnemy(enemy: TickableEnemy, deltaMs: number, moteX: number, moteY: number): void {
  const state = _registry.get(enemy);
  if (!state) return;

  const toRemove: number[] = [];

  for (let i = 0; i < state.statuses.length; i++) {
    const s = state.statuses[i]!;
    s.remainingMs -= deltaMs;

    // ── Echo-Marked: tick pending echoes ─────────────────────────────────────
    if (s.key === 'echoMarked' && s.pendingEchoes) {
      for (let j = s.pendingEchoes.length - 1; j >= 0; j--) {
        const echo = s.pendingEchoes[j]!;
        echo.remainingMs -= deltaMs;
        if (echo.remainingMs <= 0) {
          if (enemy.hp > 0) enemy.hp -= echo.damage;
          s.pendingEchoes.splice(j, 1);
        }
      }
      // Keep echoMarked status alive if there are pending echoes, even if duration expired
      if (s.remainingMs <= 0 && (!s.pendingEchoes || s.pendingEchoes.length === 0)) {
        toRemove.push(i);
      }
      continue;
    }

    // ── Status expired ────────────────────────────────────────────────────────
    if (s.remainingMs <= 0) {
      // Fractal Wound: finish remaining ticks immediately on expire? No — just remove.
      toRemove.push(i);
      continue;
    }

    // ── Tick-based DoT (Burning, Poisoned, Fractal Wound) ────────────────────
    if (s.tickEveryMs && s.tickEveryMs > 0) {
      s.tickMs += deltaMs;
      while (s.tickMs >= s.tickEveryMs) {
        s.tickMs -= s.tickEveryMs;

        if (s.key === 'burning') {
          const dmg = _burnDmgPerTick(s.magnitude, s.tickEveryMs);
          if (enemy.hp > 0) enemy.hp = Math.max(0, enemy.hp - dmg);
        } else if (s.key === 'poisoned') {
          const dmg = _poisonDmgPerTick(s.magnitude, s.tickEveryMs);
          if (enemy.hp > 0) enemy.hp = Math.max(0, enemy.hp - dmg);
        } else if (s.key === 'fractalWound') {
          if ((s.fractalTicksLeft ?? 0) > 0 && s.fractalTickDamage !== undefined) {
            if (enemy.hp > 0) enemy.hp = Math.max(0, enemy.hp - s.fractalTickDamage);
            s.fractalTickDamage = clamp(s.fractalTickDamage * FRAC_DECAY, 0, 5000);
            s.fractalTicksLeft = (s.fractalTicksLeft ?? 1) - 1;
          }
          if ((s.fractalTicksLeft ?? 0) <= 0) {
            toRemove.push(i);
            break;
          }
        }
      }
    }

    // ── Gravitized: small pull toward player mote ─────────────────────────────
    if (s.key === 'gravitized') {
      const dx = moteX - enemy.x;
      const dy = moteY - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const pullStr = clamp(s.magnitude * 0.0005, 0, 0.02);
      enemy.vx += (dx / dist) * pullStr * deltaMs;
      enemy.vy += (dy / dist) * pullStr * deltaMs;
    }
  }

  // Remove expired statuses (iterate in reverse to keep indices valid)
  for (let i = toRemove.length - 1; i >= 0; i--) {
    state.statuses.splice(toRemove[i]!, 1);
  }

  // Clean up riftScarredStacks when riftScarred status expires
  if (!state.statuses.some(s => s.key === 'riftScarred') && state.riftScarredStacks.size > 0) {
    state.riftScarredStacks.clear();
  }
}

/** Apply movement slow to enemy velocity (post-update pass). */
function _applySlowToEnemy(enemy: TickableEnemy): void {
  const slowMult = getMovementSlowMult(enemy);
  if (slowMult < 1) {
    enemy.vx *= slowMult;
    enemy.vy *= slowMult;
  }
}

// ── Tick all enemy arrays ──────────────────────────────────────────────────────

/**
 * Ticks all active lens statuses across every enemy array.
 * Call once per frame from runRpgUpdate, after enemy updates.
 */
export function tickLensStatuses(
  arrays: {
    enemies: TickableEnemy[];
    sapphireEnemies: TickableEnemy[];
    emeraldEnemies: TickableEnemy[];
    amberEnemies: TickableEnemy[];
    voidEnemies: TickableEnemy[];
    quartzEnemies: TickableEnemy[];
    rubyEnemies: TickableEnemy[];
    sunstoneEnemies: TickableEnemy[];
    citrineEnemies: TickableEnemy[];
    ioliteEnemies: TickableEnemy[];
    amethystEnemies: TickableEnemy[];
    diamondEnemies: TickableEnemy[];
    nullstoneEnemies: TickableEnemy[];
    fracterylEnemies: TickableEnemy[];
    eigensteinEnemies: TickableEnemy[];
    eliteEnemies: TickableEnemy[];
    polyominoEnemies: TickableEnemy[];
    fissilePolyominoEnemies: TickableEnemy[];
    refractorPolyominoEnemies: TickableEnemy[];
    dustWispEnemies: TickableEnemy[];
    ribbonWormEnemies: TickableEnemy[];
    lanternMothEnemies: TickableEnemy[];
    eyeStalkEnemies: TickableEnemy[];
    jellyfishEnemies: TickableEnemy[];
    clothGhostEnemies: TickableEnemy[];
    plantTurretEnemies: TickableEnemy[];
    gearInsectEnemies: TickableEnemy[];
    spiderCrawlerEnemies: TickableEnemy[];
    moteSwarmEnemies: TickableEnemy[];
    shadowHandEnemies: TickableEnemy[];
    sandFishEnemies: TickableEnemy[];
    quartzFishEnemies: TickableEnemy[];
    rubyFishEnemies: TickableEnemy[];
    sunstoneFishEnemies: TickableEnemy[];
    emeraldFishEnemies: TickableEnemy[];
    sapphireFishEnemies: TickableEnemy[];
    amethystFishEnemies: TickableEnemy[];
    diamondFishEnemies: TickableEnemy[];
  },
  deltaMs: number,
  moteX: number,
  moteY: number,
): void {
  const tick = (e: TickableEnemy) => _tickEnemy(e, deltaMs, moteX, moteY);
  const slow = (e: TickableEnemy) => _applySlowToEnemy(e);

  const allArrays: TickableEnemy[][] = [
    arrays.enemies, arrays.sapphireEnemies, arrays.emeraldEnemies,
    arrays.amberEnemies, arrays.voidEnemies, arrays.quartzEnemies,
    arrays.rubyEnemies, arrays.sunstoneEnemies, arrays.citrineEnemies,
    arrays.ioliteEnemies, arrays.amethystEnemies, arrays.diamondEnemies,
    arrays.nullstoneEnemies, arrays.fracterylEnemies, arrays.eigensteinEnemies,
    arrays.eliteEnemies, arrays.polyominoEnemies, arrays.fissilePolyominoEnemies,
    arrays.refractorPolyominoEnemies,
    arrays.dustWispEnemies, arrays.ribbonWormEnemies, arrays.lanternMothEnemies,
    arrays.eyeStalkEnemies, arrays.jellyfishEnemies, arrays.clothGhostEnemies,
    arrays.plantTurretEnemies, arrays.gearInsectEnemies, arrays.spiderCrawlerEnemies,
    arrays.moteSwarmEnemies, arrays.shadowHandEnemies, arrays.sandFishEnemies,
    arrays.quartzFishEnemies, arrays.rubyFishEnemies, arrays.sunstoneFishEnemies,
    arrays.emeraldFishEnemies, arrays.sapphireFishEnemies, arrays.amethystFishEnemies,
    arrays.diamondFishEnemies,
  ];

  for (const arr of allArrays) {
    for (let i = 0; i < arr.length; i++) { tick(arr[i]!); }
  }
  // Apply movement slow after tick (velocity is post-update at this point)
  for (const arr of allArrays) {
    for (let i = 0; i < arr.length; i++) { slow(arr[i]!); }
  }
}

// ── Status query helpers ───────────────────────────────────────────────────────

/** Returns all active statuses for an enemy (empty array if none). */
export function getActiveStatuses(enemy: object): readonly ActiveEnemyStatus[] {
  return _registry.get(enemy)?.statuses ?? [];
}
