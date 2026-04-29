/**
 * rpg-lucky-motes.ts — Pure-function module for the lucky mote drop system.
 *
 * Lucky motes spawn on enemy death (chance based on luck%), drift toward the
 * player, and are collected on contact for a bonus Mote reward.
 *
 * All functions take explicit state parameters — no closure captures.
 */

import type { LuckyMote, LuckyMotePopup } from './rpg-types';
import {
  LUCKY_MOTE_RADIUS, LUCKY_MOTE_BORDER_COLOR, LUCKY_MOTE_MAGNET_DIST, LUCKY_MOTE_COLLECT_DIST,
  LUCKY_MOTE_MAGNET_SPEED, LUCKY_MOTE_BONUS_PCT, LUCKY_MOTE_SPAWN_SPEED, LUCKY_MOTE_DAMPING,
  LUCKY_POPUP_DURATION_MS, LUCKY_POPUP_SPEED, LUCKY_POPUP_DECEL, LUCKY_PULSE_SPEED,
  TARGET_FRAME_MS,
} from './rpg-constants';
import { TIER_BY_ID } from '../../data/tiers';
import type { TierId } from '../../data/tiers';

/** Maps enemy type strings to the mote tier they drop.
 * Most enemies map to the tier of the same name. Exceptions:
 *   'laser'  → 'sand'      (laser enemy is the basic yellow-sand tier enemy)
 *   'amber'  → 'sunstone'  (amber/orange enemy maps to the orange sunstone tier)
 *   'void'   → 'nullstone' (void/dark enemy maps to the dark nullstone tier)
 */
export const ENEMY_TYPE_TO_TIER: Record<string, TierId> = {
  laser:      'sand',
  quartz:     'quartz',
  sapphire:   'sapphire',
  emerald:    'emerald',
  amber:      'sunstone',  // amber → sunstone (closest orange tier)
  void:       'nullstone', // void  → nullstone (closest dark/void tier)
  ruby:       'ruby',
  sunstone:   'sunstone',
  citrine:    'citrine',
  iolite:     'iolite',
  amethyst:   'amethyst',
  diamond:    'diamond',
  nullstone:  'nullstone',
  fracteryl:  'fracteryl',
  eigenstein: 'eigenstein',
};

/**
 * Tries to spawn a lucky mote at (x, y) for the given enemy type.
 * Rolls against the provided luckPct. Does nothing if luck check fails.
 */
export function trySpawnLuckyMote(
  luckyMotes: LuckyMote[],
  enemyTypeId: string,
  x: number,
  y: number,
  luckPct: number,
): void {
  if (luckPct <= 0 || Math.random() * 100 > luckPct) return;
  const tierId = ENEMY_TYPE_TO_TIER[enemyTypeId];
  if (!tierId) return;
  const tierDef = TIER_BY_ID.get(tierId);
  if (!tierDef) return;
  const angle = Math.random() * Math.PI * 2;
  luckyMotes.push({
    x, y,
    vx: Math.cos(angle) * LUCKY_MOTE_SPAWN_SPEED,
    vy: Math.sin(angle) * LUCKY_MOTE_SPAWN_SPEED,
    tierId,
    color: tierDef.color,
    glowColor: tierDef.glowColor,
    bonusPct: LUCKY_MOTE_BONUS_PCT,
    pulseTimeS: 0,
  });
}

/** Updates lucky motes: magnetism, collection, and popup spawning. */
export function updateLuckyMotes(
  luckyMotes: LuckyMote[],
  luckyMotePopups: LuckyMotePopup[],
  moteX: number,
  moteY: number,
  deltaMs: number,
  onCollected: (tierId: TierId, bonusPct: number) => void,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (let i = luckyMotes.length - 1; i >= 0; i--) {
    const lm = luckyMotes[i];
    lm.pulseTimeS += deltaMs / 1000;
    const dx = moteX - lm.x;
    const dy = moteY - lm.y;
    const distSq = dx * dx + dy * dy;
    const collectDistSq = LUCKY_MOTE_COLLECT_DIST * LUCKY_MOTE_COLLECT_DIST;
    if (distSq <= collectDistSq) {
      // Collected — apply bonus via callback and spawn popup
      onCollected(lm.tierId as TierId, lm.bonusPct);
      // Direction vector: from player toward where the mote was
      const dist = Math.sqrt(distSq) || 1;
      const nx = -dx / dist;
      const ny = -dy / dist;
      luckyMotePopups.push({
        x: moteX,
        y: moteY,
        vx: nx * LUCKY_POPUP_SPEED,
        vy: ny * LUCKY_POPUP_SPEED - 1.2,
        text: '+' + lm.bonusPct.toFixed(1) + '% ↑',
        color: lm.color,
        swatchColor: lm.color,
        timerMs: LUCKY_POPUP_DURATION_MS,
        maxTimerMs: LUCKY_POPUP_DURATION_MS,
      });
      luckyMotes.splice(i, 1);
      continue;
    }
    // Magnetism when player is close enough
    const magnetDistSq = LUCKY_MOTE_MAGNET_DIST * LUCKY_MOTE_MAGNET_DIST;
    if (distSq <= magnetDistSq) {
      const dist = Math.sqrt(distSq);
      const pullStr = LUCKY_MOTE_MAGNET_SPEED * dt * (1 - dist / LUCKY_MOTE_MAGNET_DIST + 0.3);
      lm.vx += (dx / dist) * pullStr;
      lm.vy += (dy / dist) * pullStr;
    }
    lm.x += lm.vx * dt;
    lm.y += lm.vy * dt;
    lm.vx *= Math.pow(LUCKY_MOTE_DAMPING, dt);
    lm.vy *= Math.pow(LUCKY_MOTE_DAMPING, dt);
  }
}

/** Updates floating lucky mote popup texts. */
export function updateLuckyMotePopups(
  luckyMotePopups: LuckyMotePopup[],
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (let i = luckyMotePopups.length - 1; i >= 0; i--) {
    const p = luckyMotePopups[i];
    p.timerMs -= deltaMs;
    if (p.timerMs <= 0) { luckyMotePopups.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(LUCKY_POPUP_DECEL, dt);
    p.vy *= Math.pow(LUCKY_POPUP_DECEL, dt);
  }
}

/** Draws lucky motes: colored fill + pulsing golden border. */
export function drawLuckyMotes(
  ctx: CanvasRenderingContext2D,
  luckyMotes: LuckyMote[],
  isLowGraphicsMode: boolean,
): void {
  if (luckyMotes.length === 0) return;
  ctx.save();
  for (const lm of luckyMotes) {
    const pulseT = (Math.sin(lm.pulseTimeS * LUCKY_PULSE_SPEED) + 1) * 0.5;
    const borderAlpha = 0.65 + pulseT * 0.35;
    const outerR = LUCKY_MOTE_RADIUS + 1.5 + pulseT * 1.5;
    // Golden glow halo
    if (!isLowGraphicsMode) {
      ctx.globalAlpha = borderAlpha * 0.45;
      ctx.shadowBlur = outerR * 3;
      ctx.shadowColor = LUCKY_MOTE_BORDER_COLOR;
      ctx.fillStyle = LUCKY_MOTE_BORDER_COLOR;
      ctx.beginPath();
      ctx.arc(lm.x, lm.y, outerR + 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    // Golden border ring
    ctx.globalAlpha = borderAlpha;
    ctx.strokeStyle = LUCKY_MOTE_BORDER_COLOR;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(lm.x, lm.y, outerR, 0, Math.PI * 2);
    ctx.stroke();
    // Tier-colored fill
    ctx.globalAlpha = 1;
    if (!isLowGraphicsMode) {
      ctx.shadowBlur = LUCKY_MOTE_RADIUS * 3;
      ctx.shadowColor = lm.glowColor;
    }
    ctx.fillStyle = lm.color;
    ctx.beginPath();
    ctx.arc(lm.x, lm.y, LUCKY_MOTE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Draws floating "+X% ↑" popups for lucky mote collection. */
export function drawLuckyMotePopups(
  ctx: CanvasRenderingContext2D,
  luckyMotePopups: LuckyMotePopup[],
  isLowGraphicsMode: boolean,
): void {
  if (luckyMotePopups.length === 0) return;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.font = 'bold 9px "Pixelify Sans", monospace';
  for (const p of luckyMotePopups) {
    const progress = 1 - p.timerMs / p.maxTimerMs;
    const alpha = progress < 0.15 ? progress / 0.15 : Math.max(0, 1 - (progress - 0.5) / 0.5);
    if (alpha <= 0) continue;
    ctx.globalAlpha = alpha;
    // Small colored swatch circle
    const swatchR = 3;
    if (!isLowGraphicsMode) {
      ctx.shadowBlur = swatchR * 3;
      ctx.shadowColor = p.swatchColor;
    }
    ctx.fillStyle = p.swatchColor;
    ctx.beginPath();
    ctx.arc(p.x, p.y, swatchR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Text
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x + swatchR + 2, p.y + 3);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
  ctx.restore();
}
