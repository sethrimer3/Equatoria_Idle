/**
 * rpg-player-damage.ts — Player damage application and hit-visual helpers.
 *
 * Extracted from rpg-render.ts to reduce file size.
 * Uses a `createPlayerDamageFns` factory pattern matching the style of
 * `rpg-damage.ts` (enemy damage fns) and `rpg-targeting.ts`.
 *
 * Owned state references (mote, playerStats, hitEffects, shotLines,
 * damageNumbers, playerIFramesMs) are injected via `PlayerDamageCtx`
 * so rpg-render.ts retains authoritative ownership.
 */

import type { HitEffect, ShotLine, DamageNumber, LaserEnemy } from './rpg-types';
import {
  HIT_EFFECT_DURATION_MS, SHOT_LINE_DURATION_MS,
  TARGET_FRAME_MS, DAMAGE_NUM_DECEL,
  DAMAGE_NUM_MIN_FONT_PX, DAMAGE_NUM_MAX_FONT_PX,
  DAMAGE_NUM_INITIAL_SPEED, DAMAGE_NUM_DURATION_MS,
  PLAYER_IFRAME_MIN_MS, PLAYER_IFRAME_MAX_ADD_MS,
  PLAYER_KNOCKBACK_MAX,
} from './rpg-constants';

const DAMAGE_NUM_VECTOR_VARIATION_RAD = Math.PI / 12;
const DAMAGE_NUM_SPEED_VARIATION_MIN = 0.85;
const DAMAGE_NUM_SPEED_VARIATION_RANGE = 0.3;
const XP_NUM_FONT_SCALE = 0.72;

// ── Context ─────────────────────────────────────────────────────────

export interface PlayerDamageCtx {
  mote: { x: number; y: number; vx: number; vy: number };
  playerStats: { hp: number; maxHp: number; def: number };
  getPlayerIFramesMs(): number;
  setPlayerIFramesMs(ms: number): void;
  hitEffects: HitEffect[];
  shotLines: ShotLine[];
  damageNumbers: DamageNumber[];
  /** Returns the current canvas dimensions for damage-number bounce clamping. */
  getDim(): { w: number; h: number };
  /** Returns true when invincibility mode is enabled (dev mode feature). */
  isInvincibilityMode(): boolean;
  /** Optional callback fired each time the player actually takes damage (not blocked, not iframes). */
  onPlayerHit?: () => void;
}

// ── Return handle ────────────────────────────────────────────────────

export interface PlayerDamageHandle {
  /**
   * Spawns a floating damage/blocked number at (x, y) travelling in
   * (dirX, dirY). `ratio` is dmg / maxHp clamped to [0, 1] and controls
   * font size.
   */
  spawnDamageNumber(
    x: number, y: number,
    dirX: number, dirY: number,
    text: string,
    ratio: number,
    color: string,
  ): void;

  /** Registers a hit-flash and shot-line visual at (tx, ty) and spawns a damage number. */
  spawnHitVisualsAt(tx: number, ty: number, maxHp: number, dmg: number, color: string): void;

  /** Registers a hit-flash and shot-line visual for a laser enemy and spawns a damage number. */
  spawnHitVisuals(enemy: LaserEnemy, dmg: number, color: string): void;

  /**
   * Applies raw enemy ATK damage to the player after blocking a percentage
   * equal to playerStats.def (e.g. def=5 blocks 5 % of incoming damage),
   * subject to iframes. Mutates playerStats.hp and playerIFramesMs.
   */
  dealDamageToPlayer(atkValue: number): void;

  /**
   * Applies damage to the player with a directional knockback impulse.
   * Used exclusively by Amber shards which carry velocity-based knockback.
   * Prefer `dealDamageToPlayer` for all other enemy contact/projectile damage.
   * @param atkValue - raw attack value (defence percentage applied internally)
   * @param normDirX - normalised knockback / damage-number direction X
   * @param normDirY - normalised knockback / damage-number direction Y
   */
  dealDamageToPlayerKnockback(atkValue: number, normDirX: number, normDirY: number): void;

  /** Advances hit-flash and shot-line timers, pruning expired entries. */
  updateShotVisuals(deltaMs: number): void;

  /** Advances damage-number positions (decelerating velocity) and iframes timer. */
  updateDamageNumbers(deltaMs: number): void;
}

// ── Factory ──────────────────────────────────────────────────────────

export function createPlayerDamageFns(pCtx: PlayerDamageCtx): PlayerDamageHandle {
  const { mote, playerStats, hitEffects, shotLines, damageNumbers } = pCtx;

  function isXpPopup(text: string): boolean {
    return text.includes('XP');
  }

  function isEnemyDamagePopup(text: string, x: number, y: number): boolean {
    if (text === 'BLOCKED' || isXpPopup(text)) return false;
    if (!Number.isFinite(Number(text))) return false;
    const dx = x - mote.x;
    const dy = y - mote.y;
    return dx * dx + dy * dy > 0.01;
  }

  function randomizePopupVector(dirX: number, dirY: number): { dirX: number; dirY: number; speedScale: number } {
    const deviation = (Math.random() * 2 - 1) * DAMAGE_NUM_VECTOR_VARIATION_RAD;
    const cosD = Math.cos(deviation);
    const sinD = Math.sin(deviation);
    return {
      dirX: dirX * cosD - dirY * sinD,
      dirY: dirX * sinD + dirY * cosD,
      speedScale: DAMAGE_NUM_SPEED_VARIATION_MIN + Math.random() * DAMAGE_NUM_SPEED_VARIATION_RANGE,
    };
  }

  function spawnDamageNumber(
    x: number, y: number,
    dirX: number, dirY: number,
    text: string,
    ratio: number,
    color: string,
  ): void {
    const clampedRatio = Math.min(1, Math.max(0, ratio));
    const isXp = isXpPopup(text);
    const fontScale = isXp ? XP_NUM_FONT_SCALE : 1;
    const fontPx = (DAMAGE_NUM_MIN_FONT_PX + clampedRatio * (DAMAGE_NUM_MAX_FONT_PX - DAMAGE_NUM_MIN_FONT_PX)) * fontScale;
    let vector = {
      dirX,
      dirY,
      speedScale: 1,
    };
    if (isEnemyDamagePopup(text, x, y)) {
      // Direction from player toward enemy = away from player.
      const awayX = x - mote.x;
      const awayY = y - mote.y;
      const dist = Math.max(0.001, Math.hypot(awayX, awayY));
      vector = randomizePopupVector(awayX / dist, awayY / dist);
    } else if (!isXp) {
      vector = randomizePopupVector(dirX, dirY);
    }
    const initialSpeed = DAMAGE_NUM_INITIAL_SPEED * (0.5 + clampedRatio * 0.5) * vector.speedScale;
    damageNumbers.push({
      x, y,
      vx: vector.dirX * initialSpeed,
      vy: vector.dirY * initialSpeed,
      text,
      fontPx: Math.max(DAMAGE_NUM_MIN_FONT_PX, fontPx),
      color,
      timerMs: DAMAGE_NUM_DURATION_MS,
    });
  }

  function spawnHitVisualsAt(tx: number, ty: number, maxHp: number, dmg: number, color: string): void {
    hitEffects.push({ x: tx, y: ty, timerMs: HIT_EFFECT_DURATION_MS, color });
    shotLines.push({ x1: mote.x, y1: mote.y, x2: tx, y2: ty, timerMs: SHOT_LINE_DURATION_MS, color });
    const dx = tx - mote.x, dy = ty - mote.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let dirX = dist > 0.01 ? dx / dist : 0;
    let dirY = dist > 0.01 ? dy / dist : -1;
    // Apply ±15° random angle deviation with triangular distribution (lower probability at extremes).
    // Summing two uniform [0,1] random numbers and subtracting 1 gives a triangular distribution
    // on [-1, 1], making extreme angles (±15°) less likely than small deviations near 0.
    const deviation = (Math.random() + Math.random() - 1) * (Math.PI / 12);
    const cosD = Math.cos(deviation), sinD = Math.sin(deviation);
    const rotX = dirX * cosD - dirY * sinD;
    const rotY = dirX * sinD + dirY * cosD;
    dirX = rotX; dirY = rotY;
    if (dmg <= 0) {
      spawnDamageNumber(tx, ty, dirX, dirY, 'BLOCKED', 0.25, '#74c0fc');
    } else {
      spawnDamageNumber(tx, ty, dirX, dirY, String(Math.round(dmg)), dmg / maxHp, '#ffffff');
    }
  }

  function spawnHitVisuals(enemy: LaserEnemy, dmg: number, color: string): void {
    spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, color);
  }

  function dealDamageToPlayer(atkValue: number): void {
    if (pCtx.getPlayerIFramesMs() > 0) return;
    if (pCtx.isInvincibilityMode()) {
      spawnDamageNumber(mote.x, mote.y, 0, -1, 'BLOCKED', 0.25, '#74c0fc');
      return;
    }
    const dmg = Math.max(0, atkValue * (1 - Math.min(100, playerStats.def) / 100));
    if (dmg <= 0) {
      spawnDamageNumber(mote.x, mote.y, 0, -1, 'BLOCKED', 0.25, '#74c0fc');
    } else {
      playerStats.hp = Math.max(0, playerStats.hp - dmg);
      const ratio = Math.min(1, dmg / playerStats.maxHp);
      pCtx.setPlayerIFramesMs(PLAYER_IFRAME_MIN_MS + ratio * PLAYER_IFRAME_MAX_ADD_MS);
      spawnDamageNumber(mote.x, mote.y, 0, -1, String(Math.round(dmg)), ratio, '#ff6666');
      pCtx.onPlayerHit?.();
    }
  }

  function dealDamageToPlayerKnockback(atkValue: number, normDirX: number, normDirY: number): void {
    if (pCtx.getPlayerIFramesMs() > 0) return;
    if (pCtx.isInvincibilityMode()) {
      spawnDamageNumber(mote.x, mote.y, normDirX, normDirY, 'BLOCKED', 0.25, '#74c0fc');
      return;
    }
    const dmg = Math.max(0, atkValue * (1 - Math.min(100, playerStats.def) / 100));
    if (dmg <= 0) {
      spawnDamageNumber(mote.x, mote.y, normDirX, normDirY, 'BLOCKED', 0.25, '#74c0fc');
    } else {
      playerStats.hp = Math.max(0, playerStats.hp - dmg);
      const ratio = Math.min(1, dmg / playerStats.maxHp);
      mote.vx += normDirX * PLAYER_KNOCKBACK_MAX * ratio;
      mote.vy += normDirY * PLAYER_KNOCKBACK_MAX * ratio;
      pCtx.onPlayerHit?.();
      pCtx.setPlayerIFramesMs(PLAYER_IFRAME_MIN_MS + ratio * PLAYER_IFRAME_MAX_ADD_MS);
      spawnDamageNumber(mote.x, mote.y, normDirX, normDirY, String(Math.round(dmg)), ratio, '#ff6666');
    }
  }

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

  function updateDamageNumbers(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const decelFactor = Math.pow(DAMAGE_NUM_DECEL, dt);
    const dim = pCtx.getDim();
    for (let i = damageNumbers.length - 1; i >= 0; i--) {
      const dn = damageNumbers[i];
      dn.timerMs -= deltaMs;
      if (dn.timerMs <= 0) { damageNumbers.splice(i, 1); continue; }
      dn.x += dn.vx * dt;
      dn.y += dn.vy * dt;
      dn.vx *= decelFactor;
      dn.vy *= decelFactor;
      // Bounce off playfield edges.
      const halfFont = dn.fontPx / 2;
      if (dn.x < halfFont) { dn.x = halfFont; dn.vx = Math.abs(dn.vx); }
      else if (dn.x > dim.w - halfFont) { dn.x = dim.w - halfFont; dn.vx = -Math.abs(dn.vx); }
      if (dn.y < halfFont) { dn.y = halfFont; dn.vy = Math.abs(dn.vy); }
      else if (dn.y > dim.h - halfFont) { dn.y = dim.h - halfFont; dn.vy = -Math.abs(dn.vy); }
    }
    if (pCtx.getPlayerIFramesMs() > 0) {
      pCtx.setPlayerIFramesMs(Math.max(0, pCtx.getPlayerIFramesMs() - deltaMs));
    }
  }

  return {
    spawnDamageNumber,
    spawnHitVisualsAt,
    spawnHitVisuals,
    dealDamageToPlayer,
    dealDamageToPlayerKnockback,
    updateShotVisuals,
    updateDamageNumbers,
  };
}
