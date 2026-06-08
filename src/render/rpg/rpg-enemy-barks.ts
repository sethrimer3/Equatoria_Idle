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
 * Enemy-specific and zone-specific line overrides can be added to ENEMY_BARK_OVERRIDES.
 * Add lines like: ENEMY_BARK_OVERRIDES['laser'] = { TOOK_MAJOR_DAMAGE: ["Pierced!"] }
 */

import { setStatusAppliedCallback } from '../../sim/rpg/enemy-status-effects';
import { DAMAGE_NUM_FONT_FAMILY } from './rpg-constants';

// ── Bark event types ──────────────────────────────────────────────────────────

export type BarkEventType =
  | 'NO_DAMAGE_FOR_A_WHILE'
  | 'BLOCKED_ATTACK'
  | 'TOOK_SMALL_DAMAGE'
  | 'TOOK_MAJOR_DAMAGE'
  | 'STATUS_RESISTED'
  | 'STATUS_WEAK'
  | 'STATUS_NEUTRAL'
  | 'DEALT_MAJOR_PLAYER_DAMAGE'
  | 'KILLED_PLAYER'
  | 'PLAYER_BLOCKED_DAMAGE'
  | 'DEALT_TINY_PLAYER_DAMAGE';

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
export const ENEMY_BARK_DURATION_MS           = 2200;   // 2.2 s
/** Seconds without taking damage before an enemy fires a taunt bark. */
export const ENEMY_NO_DAMAGE_BARK_DELAY_MS    = 5000;   // 5 s

// Damage-ratio thresholds used to classify hits on enemies.
const SMALL_DAMAGE_RATIO  = 0.04;   // < 4 % of enemy maxHp = "small"
const MAJOR_DAMAGE_RATIO  = 0.20;   // > 20 % of enemy maxHp = "major"

// Damage-ratio thresholds used to classify hits on the player.
const PLAYER_TINY_DAMAGE_RATIO  = 0.025; // < 2.5 % of player maxHp
const PLAYER_MAJOR_DAMAGE_RATIO = 0.18;  // > 18 % of player maxHp

// ── Bark text table ───────────────────────────────────────────────────────────

const DEFAULT_BARKS: Record<BarkEventType, string[]> = {
  NO_DAMAGE_FOR_A_WHILE:     ['Missed again.', 'Still standing.', 'Try harder.'],
  BLOCKED_ATTACK:            ['Denied.', 'Too weak.', 'Not enough.'],
  TOOK_SMALL_DAMAGE:         ['Was that it?', 'Barely felt it.', 'A scratch.'],
  TOOK_MAJOR_DAMAGE:         ['That hurt!', 'Impossible...', 'Cracked!'],
  STATUS_RESISTED:           ['I resist that.', 'No effect.', 'Wrong element.'],
  STATUS_WEAK:               ['My weakness!', 'Not that!', 'It burns!'],
  STATUS_NEUTRAL:            ['Annoying.', 'I feel it.', 'Tch.'],
  DEALT_MAJOR_PLAYER_DAMAGE: ['Direct hit.', 'Break.', 'Good hit.'],
  KILLED_PLAYER:             ['Fall.', 'Ended.', 'Silence.'],
  PLAYER_BLOCKED_DAMAGE:     ['A shield?', 'Blocked?', 'Stand still.'],
  DEALT_TINY_PLAYER_DAMAGE:  ['Hmph.', 'No...', 'Too guarded.'],
};

/**
 * Per-enemy-type or per-zone bark overrides.
 * Key is enemy type string (e.g. 'laser', 'elite', 'rubyfish').
 * Add entries here as the game grows with distinct enemy personalities.
 *
 * Example:
 *   ENEMY_BARK_OVERRIDES['laser'] = { TOOK_MAJOR_DAMAGE: ['Pierced!'] };
 *   ENEMY_BARK_OVERRIDES['elite'] = { KILLED_PLAYER: ['Pathetic.', 'Too easy.'] };
 */
export const ENEMY_BARK_OVERRIDES: Partial<Record<string, Partial<Record<BarkEventType, string[]>>>> = {};

// ── Internal types ────────────────────────────────────────────────────────────

/** Minimal enemy shape needed by the bark system. */
export interface BarkableEnemy {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
}

interface SpeechBubble {
  enemy: BarkableEnemy;
  text: string;
  /** Cached text width in world-space px (measured once at spawn, avoids per-frame layout). */
  textWidth: number;
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

const BARK_FONT_PX      = 7;
const BARK_FONT         = `bold ${BARK_FONT_PX}px ${DAMAGE_NUM_FONT_FAMILY}`;
const BUBBLE_PAD_X      = 5;   // horizontal padding inside bubble
const BUBBLE_PAD_Y      = 3;   // vertical padding inside bubble
const BUBBLE_ABOVE_Y    = 16;  // world-px above enemy center where bubble sits
const BUBBLE_TAIL_H     = 5;   // height of the pointing tail
const BUBBLE_CORNER_R   = 3;   // rounded-corner radius
const BUBBLE_BG_COLOR   = 'rgba(235, 240, 255, 0.93)';
const BUBBLE_TEXT_COLOR = '#181828';

// ── Text measurement ─────────────────────────────────────────────────────────

let _measureCtx: CanvasRenderingContext2D | null = null;

function _measureText(text: string): number {
  if (!_measureCtx) {
    const c  = document.createElement('canvas');
    c.width  = 1;
    c.height = 1;
    _measureCtx = c.getContext('2d')!;
  }
  _measureCtx.font = BARK_FONT;
  return _measureCtx.measureText(text).width;
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

function _pickLine(eventType: BarkEventType, enemyTypeHint?: string): string {
  // Look up per-type override first, fall back to defaults.
  const overrideTable = enemyTypeHint ? ENEMY_BARK_OVERRIDES[enemyTypeHint] : undefined;
  const lines         = overrideTable?.[eventType] ?? DEFAULT_BARKS[eventType];
  return lines[Math.floor(Math.random() * lines.length)]!;
}

function _tryBark(enemy: BarkableEnemy, eventType: BarkEventType, chance: number): void {
  if (!_initialized)             return;
  if (enemy.hp <= 0)             return;   // dead enemy — no bark
  if (_globalCooldownMs > 0)     return;   // global throttle active
  if ((_enemyCooldowns.get(enemy) ?? 0) > 0) return;  // per-enemy cooldown
  if (Math.random() > chance)    return;   // probability roll

  const text      = _pickLine(eventType);
  const textWidth = _measureText(text);

  // Replace any existing bubble for this enemy (one at a time per enemy).
  for (let i = _activeBubbles.length - 1; i >= 0; i--) {
    if (_activeBubbles[i]!.enemy === enemy) { _activeBubbles.splice(i, 1); break; }
  }

  _activeBubbles.push({
    enemy,
    text,
    textWidth,
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
function _handleStatusApplied(enemy: BarkableEnemy, _statusKey: string): void {
  // Future hook points:
  //   STATUS_RESISTED — if enemy has explicit resistance to this status type
  //   STATUS_WEAK     — if enemy has explicit weakness to this status type
  _tryBark(enemy, 'STATUS_NEUTRAL', ENEMY_BARK_BASE_CHANCE);
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
  viewport: { left: number; top: number; right: number; bottom: number },
): void {
  if (_activeBubbles.length === 0) return;

  ctx.save();
  ctx.font          = BARK_FONT;
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'middle';

  for (const b of _activeBubbles) {
    if (b.enemy.hp <= 0) continue;

    // Fade out in the last 30 % of lifetime; fully visible otherwise.
    const progress = b.timerMs / b.maxTimerMs;
    const alpha    = progress < 0.3 ? progress / 0.3 : 1.0;
    if (alpha <= 0) continue;

    const bubbleW = b.textWidth + BUBBLE_PAD_X * 2;
    const bubbleH = BARK_FONT_PX + BUBBLE_PAD_Y * 2;
    // Tail base is at the bottom of the bubble box; tip points down toward the enemy.
    const tailHalfW = Math.min(4, bubbleW * 0.18);

    // Horizontal centre — clamped so bubble stays inside viewport.
    const minCx = viewport.left  + bubbleW / 2 + 2;
    const maxCx = viewport.right - bubbleW / 2 - 2;
    const cx    = Math.max(minCx, Math.min(maxCx, b.enemy.x));

    // Vertical position — prefer above the enemy; flip below if no room.
    const flipped   = (b.enemy.y - BUBBLE_ABOVE_Y - bubbleH) < viewport.top + 2;
    const bubbleTop = flipped
      ? b.enemy.y + BUBBLE_ABOVE_Y
      : b.enemy.y - BUBBLE_ABOVE_Y - bubbleH;

    const bubbleLeft = cx - bubbleW / 2;
    const bubbleMidY = bubbleTop + bubbleH / 2;
    // Tail extends from the bubble edge nearest the enemy, pointing toward it.
    const tailBaseY  = flipped ? bubbleTop : bubbleTop + bubbleH;
    const tailTipY   = flipped ? tailBaseY - BUBBLE_TAIL_H : tailBaseY + BUBBLE_TAIL_H;
    // Tail tip x clamps to bubble left/right so the tail never detaches.
    const tailTipX   = Math.max(bubbleLeft + tailHalfW, Math.min(bubbleLeft + bubbleW - tailHalfW, b.enemy.x));

    ctx.globalAlpha = alpha;

    // Background box
    ctx.fillStyle = BUBBLE_BG_COLOR;
    ctx.beginPath();
    _rrect(ctx, bubbleLeft, bubbleTop, bubbleW, bubbleH, BUBBLE_CORNER_R);
    ctx.fill();

    // Pointer tail
    ctx.beginPath();
    ctx.moveTo(tailTipX - tailHalfW, tailBaseY);
    ctx.lineTo(tailTipX + tailHalfW, tailBaseY);
    ctx.lineTo(tailTipX, tailTipY);
    ctx.closePath();
    ctx.fill();

    // Text
    ctx.fillStyle = BUBBLE_TEXT_COLOR;
    ctx.fillText(b.text, cx, bubbleMidY);
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── Helper ────────────────────────────────────────────────────────────────────

function _rrect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x,     y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
}
