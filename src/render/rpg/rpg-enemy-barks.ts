/**
 * rpg-enemy-barks.ts — Enemy combat bark / speech bubble system.
 *
 * Enemies occasionally display short contextual speech bubbles during combat
 * events (taking damage, blocking, status effects, dealing damage to player).
 *
 * Usage:
 *   1. Call initEnemyBarkSystem() once during rpg-render.ts setup.
 *   2. Call notifyEnemyHit() from DamageCtx.onEnemyHit in rpg-damage.ts.
 *   3. Call notifyPlayerDamaged() from PlayerDamageCtx.onPlayerDamaged in rpg-player-damage.ts.
 *   4. Call tickEnemySpeechBubbles(dt) + tickNoDamageBarks(dt, ...arrays) each frame.
 *   5. Call renderEnemySpeechBubbles(ctx, viewport) in the draw loop.
 *
 * To add or edit enemy dialogue, edit src/data/enemy-barks.ts — no changes needed here.
 */

import { setStatusAppliedCallback } from '../../sim/rpg/enemy-status-effects';
import {
  DAMAGE_NUM_DECEL, DAMAGE_NUM_DURATION_MS, DAMAGE_NUM_FONT_FAMILY, DAMAGE_NUM_INITIAL_SPEED,
  LASER_ENEMY_COLOR, SAPPHIRE_ENEMY_COLOR,
} from './rpg-constants';
import {
  AMBER_ENEMY_COLOR, AMETHYST_ENEMY_COLOR, CITRINE_ENEMY_COLOR, DIAMOND_ENEMY_COLOR,
  EIGENSTEIN_ENEMY_COLOR, EMERALD_ENEMY_COLOR, FRACTERYL_ENEMY_COLOR, IOLITE_ENEMY_COLOR,
  NULLSTONE_ENEMY_COLOR, QUARTZ_ENEMY_COLOR, RUBY_ENEMY_COLOR, SUNSTONE_ENEMY_COLOR,
  VOID_ENEMY_COLOR,
} from './rpg-enemy-constants';
import { getEnemyBarkLine } from '../../data/enemy-barks';
export type { BarkEventType } from '../../data/enemy-barks';
import type { BarkEventType, BarkContext } from '../../data/enemy-barks';

// ── Balancing constants ───────────────────────────────────────────────────────

/** Base probability for minor bark events (small damage, status, etc.). */
export const ENEMY_BARK_BASE_CHANCE           = 0.05;   // 5 %
/** Probability for major events (big hit, dealing major damage to player). */
export const ENEMY_BARK_MAJOR_CHANCE          = 0.08;   // 8 %
/** Probability for the kill-player bark — usually guaranteed-ish for flavor. */
export const ENEMY_BARK_KILL_CHANCE           = 0.75;   // 75 %
/** Minimum ms between barks from the same enemy. */
export const ENEMY_BARK_PER_ENEMY_COOLDOWN_MS = 6000;   // 6 s
/** Minimum ms between any two barks across all enemies (global throttle). */
export const ENEMY_BARK_GLOBAL_COOLDOWN_MS    = 1800;   // 1.8 s
/** How long a speech bubble stays visible. */
export const ENEMY_BARK_DURATION_MS           = DAMAGE_NUM_DURATION_MS * 3;
/** Seconds without taking damage before an enemy fires a taunt bark. */
export const ENEMY_NO_DAMAGE_BARK_DELAY_MS    = 5000;   // 5 s

// Damage-ratio thresholds used to classify hits on enemies.
const SMALL_DAMAGE_RATIO  = 0.04;   // < 4 % of enemy maxHp = "small"
const MAJOR_DAMAGE_RATIO  = 0.20;   // > 20 % of enemy maxHp = "major"

// Damage-ratio thresholds used to classify hits on the player.
const PLAYER_TINY_DAMAGE_RATIO  = 0.025; // < 2.5 % of player maxHp
const PLAYER_MAJOR_DAMAGE_RATIO = 0.18;  // > 18 % of player maxHp

// Bark dialogue lives in src/data/enemy-barks.ts — edit there to add/change lines.

// ── Internal types ────────────────────────────────────────────────────────────

/** Minimal enemy shape needed by the bark system. */
export interface BarkableEnemy {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Stable type identifier used to look up per-enemy dialogue (e.g. 'proc_dustwisp'). */
  kind?: string;
  tier?: string;
  color?: string;
}

interface SpeechBubble {
  enemy: BarkableEnemy;
  text: string;
  /** Independent floating-text position and velocity in world-space pixels. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  timerMs: number;
  maxTimerMs: number;
}

// ── Module state ──────────────────────────────────────────────────────────────

let _globalCooldownMs                      = 0;
const _enemyCooldowns                      = new WeakMap<object, number>();
const _noDamageTimers                      = new WeakMap<object, number>();
const _activeBubbles: SpeechBubble[]       = [];

let _getClosestLivingEnemy: (() => BarkableEnemy | null) | null = null;
let _initialized                           = false;

// ── Visual constants ──────────────────────────────────────────────────────────

const BARK_FONT_PX      = 21;
const BARK_FONT         = `bold ${BARK_FONT_PX}px ${DAMAGE_NUM_FONT_FAMILY}`;
const STARDUST_ENEMY_COLOR = '#c88cff';

const BARK_COLORS: Readonly<Record<string, string>> = {
  laser: LASER_ENEMY_COLOR, sapphire: SAPPHIRE_ENEMY_COLOR, emerald: EMERALD_ENEMY_COLOR,
  amber: AMBER_ENEMY_COLOR, void: VOID_ENEMY_COLOR, quartz: QUARTZ_ENEMY_COLOR,
  ruby: RUBY_ENEMY_COLOR, sunstone: SUNSTONE_ENEMY_COLOR, citrine: CITRINE_ENEMY_COLOR,
  iolite: IOLITE_ENEMY_COLOR, amethyst: AMETHYST_ENEMY_COLOR, diamond: DIAMOND_ENEMY_COLOR,
  nullstone: NULLSTONE_ENEMY_COLOR, fracteryl: FRACTERYL_ENEMY_COLOR,
  eigenstein: EIGENSTEIN_ENEMY_COLOR, stardust: STARDUST_ENEMY_COLOR,
};

function _getBarkColor(enemy: BarkableEnemy): string {
  if (enemy.color) return enemy.color;
  if (enemy.tier) return BARK_COLORS[enemy.tier] ?? '#ffffff';
  if (enemy.kind) return BARK_COLORS[enemy.kind] ?? '#ffffff';
  if ('phase' in enemy) return LASER_ENEMY_COLOR;
  if ('shieldHp' in enemy) return SAPPHIRE_ENEMY_COLOR;
  return '#ffffff';
}

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * One-time init — call from rpg-render.ts after targeting is ready.
 * Registers the status-applied callback so status events can trigger barks.
 */
export function initEnemyBarkSystem(opts: {
  /** Returns the closest live enemy to the player, or null if the field is empty. */
  getClosestLivingEnemy: () => BarkableEnemy | null;
}): void {
  _getClosestLivingEnemy = opts.getClosestLivingEnemy;
  _initialized           = true;
  // Wire into the status-effect system so status application fires a bark.
  setStatusAppliedCallback((enemy, statusKey) => {
    _handleStatusApplied(
      enemy as BarkableEnemy,
      statusKey,
    );
  });
}

// ── Core try-bark ─────────────────────────────────────────────────────────────

function _tryBark(
  enemy:     BarkableEnemy,
  eventType: BarkEventType,
  chance:    number,
  context?:  BarkContext,
): void {
  if (!_initialized)             return;
  if (enemy.hp <= 0)             return;   // dead enemy — no bark
  if (_globalCooldownMs > 0)     return;   // global throttle active
  if ((_enemyCooldowns.get(enemy) ?? 0) > 0) return;  // per-enemy cooldown
  if (Math.random() > chance)    return;   // probability roll

  const text = getEnemyBarkLine(enemy, eventType, context);
  if (text === null) return;   // no dialogue defined for this event/enemy combo

  const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 2);

  // Replace any existing bubble for this enemy (one at a time per enemy).
  for (let i = _activeBubbles.length - 1; i >= 0; i--) {
    if (_activeBubbles[i]!.enemy === enemy) { _activeBubbles.splice(i, 1); break; }
  }

  _activeBubbles.push({
    enemy,
    text,
    x: enemy.x,
    y: enemy.y,
    vx: Math.cos(angle) * DAMAGE_NUM_INITIAL_SPEED,
    vy: Math.sin(angle) * DAMAGE_NUM_INITIAL_SPEED,
    color: _getBarkColor(enemy),
    timerMs:    ENEMY_BARK_DURATION_MS,
    maxTimerMs: ENEMY_BARK_DURATION_MS,
  });
  _enemyCooldowns.set(enemy, ENEMY_BARK_PER_ENEMY_COOLDOWN_MS);
  _globalCooldownMs = ENEMY_BARK_GLOBAL_COOLDOWN_MS;
}

// ── Public notify functions ───────────────────────────────────────────────────

/**
 * Notify the bark system that an enemy was hit.
 * Called by DamageCtx.onEnemyHit (rpg-damage.ts) after damage is applied.
 *   dmg=0 & blocked=true  → BLOCKED_ATTACK (shield, invuln, full DEF absorption)
 *   dmg>0                 → TOOK_SMALL_DAMAGE or TOOK_MAJOR_DAMAGE by ratio
 */
export function notifyEnemyHit(
  enemy: BarkableEnemy,
  dmg: number,
  blocked: boolean,
): void {
  if (!_initialized) return;
  if (enemy.kind === 'boss') return;
  // Always reset the no-damage timer on any hit (blocked or not).
  _noDamageTimers.set(enemy, 0);

  if (blocked || dmg <= 0) {
    _tryBark(enemy, 'BLOCKED_ATTACK', ENEMY_BARK_BASE_CHANCE);
    return;
  }
  const ratio = dmg / Math.max(1, enemy.maxHp);
  if (ratio >= MAJOR_DAMAGE_RATIO) {
    _tryBark(enemy, 'TOOK_MAJOR_DAMAGE', ENEMY_BARK_MAJOR_CHANCE);
  } else if (ratio < SMALL_DAMAGE_RATIO) {
    _tryBark(enemy, 'TOOK_SMALL_DAMAGE', ENEMY_BARK_BASE_CHANCE);
  }
}

/**
 * Notify the bark system that the player took damage (or was blocked).
 * Called by PlayerDamageCtx.onPlayerDamaged (rpg-player-damage.ts).
 * The closest living enemy at the time of the hit will say the line.
 */
export function notifyPlayerDamaged(
  dmg: number,
  blocked: boolean,
  playerDied: boolean,
  playerMaxHp: number,
): void {
  if (!_initialized) return;
  const attacker = _getClosestLivingEnemy?.();
  if (!attacker) return;
  if (attacker.kind === 'boss') return;

  if (playerDied) {
    _tryBark(attacker, 'KILLED_PLAYER', ENEMY_BARK_KILL_CHANCE);
    return;
  }
  if (blocked || dmg <= 0) {
    _tryBark(attacker, 'PLAYER_BLOCKED_DAMAGE', ENEMY_BARK_BASE_CHANCE);
    return;
  }
  const ratio = dmg / Math.max(1, playerMaxHp);
  if (ratio >= PLAYER_MAJOR_DAMAGE_RATIO) {
    _tryBark(attacker, 'DEALT_MAJOR_PLAYER_DAMAGE', ENEMY_BARK_MAJOR_CHANCE);
  } else if (ratio < PLAYER_TINY_DAMAGE_RATIO) {
    _tryBark(attacker, 'DEALT_TINY_PLAYER_DAMAGE', ENEMY_BARK_BASE_CHANCE);
  }
}

/**
 * Internal handler for status-effect application events.
 * No native affinity system exists yet; all statuses are classified as neutral.
 * Future: check an enemy affinity table and fire STATUS_RESISTED or STATUS_WEAK.
 */
export function classifyEnemyStatusAffinity(
  _enemy: BarkableEnemy,
  _statusKey: string,
): 'resisted' | 'weak' | 'neutral' {
  return 'neutral';
}

function _handleStatusApplied(enemy: BarkableEnemy, statusKey: string): void {
  const affinity = classifyEnemyStatusAffinity(enemy, statusKey);
  const eventType: BarkEventType = affinity === 'resisted'
    ? 'STATUS_RESISTED'
    : affinity === 'weak'
      ? 'STATUS_WEAK'
      : 'STATUS_NEUTRAL';
  _tryBark(enemy, eventType, ENEMY_BARK_BASE_CHANCE, { statusType: statusKey });
}

// ── Tick ──────────────────────────────────────────────────────────────────────

/**
 * Advances speech bubble timers and the global cooldown. Prunes expired / dead bubbles.
 * Call once per frame from runRpgUpdate.
 */
export function tickEnemySpeechBubbles(deltaMs: number): void {
  if (!_initialized) return;
  if (_globalCooldownMs > 0) _globalCooldownMs = Math.max(0, _globalCooldownMs - deltaMs);
  for (let i = _activeBubbles.length - 1; i >= 0; i--) {
    const b = _activeBubbles[i]!;
    b.timerMs -= deltaMs;
    const dtScale = deltaMs / 16.667;
    b.x += b.vx * dtScale;
    b.y += b.vy * dtScale;
    const damp = Math.pow(DAMAGE_NUM_DECEL, dtScale);
    b.vx *= damp;
    b.vy *= damp;
    if (b.timerMs <= 0 || b.enemy.hp <= 0) _activeBubbles.splice(i, 1);
  }
}

/**
 * Ticks per-enemy "no-damage" timers and fires a taunt bark when an enemy crosses
 * the ENEMY_NO_DAMAGE_BARK_DELAY_MS threshold.
 *
 * Pass arrays of main enemy bodies (skip projectile / shard / spike arrays).
 * Call once per frame from runRpgUpdate, after tickEnemySpeechBubbles.
 */
export function tickNoDamageBarks(
  deltaMs: number,
  ...enemyArrays: ReadonlyArray<ReadonlyArray<BarkableEnemy>>
): void {
  if (!_initialized) return;
  for (const arr of enemyArrays) {
    for (const enemy of arr) {
      if (enemy.hp <= 0) continue;
      const prev = _noDamageTimers.get(enemy) ?? 0;
      const next = prev + deltaMs;
      _noDamageTimers.set(enemy, next);
      // Fire once when the timer crosses the threshold for the first time.
      if (prev < ENEMY_NO_DAMAGE_BARK_DELAY_MS && next >= ENEMY_NO_DAMAGE_BARK_DELAY_MS) {
        _tryBark(enemy, 'NO_DAMAGE_FOR_A_WHILE', ENEMY_BARK_BASE_CHANCE);
      }
    }
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

/**
 * Draws all active speech bubbles using the current world transform.
 * Call after drawDamageNumbers in the main draw loop.
 * Bubbles follow their enemy in world coordinates and clamp inside the viewport.
 */
export function renderEnemySpeechBubbles(
  ctx: CanvasRenderingContext2D,
  _viewport: { left: number; top: number; right: number; bottom: number },
): void {
  if (_activeBubbles.length === 0) return;

  ctx.save();
  ctx.font          = BARK_FONT;
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'middle';
  ctx.lineWidth     = 2;
  ctx.strokeStyle   = '#000000';

  for (const b of _activeBubbles) {
    if (b.enemy.hp <= 0) continue;

    // Fade out in the last 30 % of lifetime; fully visible otherwise.
    const progress = b.timerMs / b.maxTimerMs;
    const alpha    = progress < 0.3 ? progress / 0.3 : 1.0;
    if (alpha <= 0) continue;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = b.color;
    ctx.strokeText(b.text, Math.round(b.x), Math.round(b.y));
    ctx.fillText(b.text, Math.round(b.x), Math.round(b.y));
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}
