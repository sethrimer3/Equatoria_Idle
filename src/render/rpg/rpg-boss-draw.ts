/**
 * rpg-boss-draw.ts — Canvas draw functions for boss waves and related HUD elements.
 *
 * Each function is a pure draw call: it takes an explicit
 * `ctx: CanvasRenderingContext2D` plus the state it needs, instead of
 * capturing closure variables from createRpgRender.
 *
 * Extracted from rpg-render.ts to reduce that closure's line count.
 *
 * Sections:
 *   - drawBossEnemy        — boss sprite, HP bar, phase pips, INVULN label
 *   - drawBottomSafeZone   — prismatic safe-zone circle during boss waves
 *   - drawDanmakuSafeZone  — safe-angle wedge drawn from the boss position
 *   - drawWaveClearBanner  — centre-screen "Wave N Cleared!" overlay
 */

import type { BossEnemy, DanmakuSafeZone } from './rpg-enemy-types';
import {
  BOSS_SIZE_BASE, BOSS_COLORS, BOSS_GLOW_COLORS,
  BOSS_PHASE_TRANSITION_MS, BOSS_PHASE2_HP_RATIO, BOSS_PHASE3_HP_RATIO,
  BOSS_BOTTOM_SAFE_ZONE_R, BOSS_GLYPH_LABEL,
  INTER_WAVE_DELAY_MS,
} from './rpg-constants';
import { enemyHealthFraction, shouldDrawEnemyHealthBar } from './rpg-health-bar';

// ── Low-graphics mode flag ────────────────────────────────────
let isLowGraphicsMode = false;

/** Sets low-graphics mode for RPG boss draw functions (skips glow effects). */
export function setLowGraphicsMode(enabled: boolean): void {
  isLowGraphicsMode = enabled;
}

// ── Boss enemy ────────────────────────────────────────────────────────────────

/**
 * Draws the boss entity: phase-transition flash, glow rings, HP bar, body
 * sprite, phase pips, and the INVULN label for boss 7.
 *
 * @param boss       Current boss state. No-op when null.
 * @param glowTimeS  Monotonically increasing time in seconds used for colour cycling.
 */
export function drawBossEnemy(
  ctx: CanvasRenderingContext2D,
  boss: BossEnemy | null,
  glowTimeS: number,
): void {
  if (!boss) return;
  const bossSize = BOSS_SIZE_BASE + boss.bossId * 1.5;
  const half = bossSize / 2;
  const pulseT = boss.pulseMs / 3000;
  const pulseFactor = (Math.sin(pulseT * Math.PI * 2) + 1) * 0.5;
  const color     = BOSS_COLORS[Math.min(boss.bossId, BOSS_COLORS.length - 1)];
  const glowColor = BOSS_GLOW_COLORS[Math.min(boss.bossId, BOSS_GLOW_COLORS.length - 1)];

  ctx.save();

  if (boss.phaseTransitionMs > 0) {
    const flashT = boss.phaseTransitionMs / BOSS_PHASE_TRANSITION_MS;
    // The flash covers the full canvas; callers must supply widthPx/heightPx
    // via the canvas element or pre-pass them. Here we read from the canvas
    // directly to avoid an extra parameter.
    ctx.globalAlpha = flashT * 0.6;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.globalAlpha = 1;
  }

  let drawColor   = color;
  let drawGlow    = glowColor;
  if (boss.bossId === 7 && boss.isInvuln) {
    const hue = (glowTimeS * 120) % 360;
    drawColor = `hsl(${hue}, 90%, 80%)`;
    drawGlow  = `hsl(${hue}, 100%, 90%)`;
  }
  if (boss.bossId === 8 && boss.isAbsorbing) {
    drawGlow = '#d090ff';
  }

  const ringCount = 1 + boss.phaseIndex;
  for (let r = 0; r < ringCount; r++) {
    const ringR = bossSize * (1.5 + r * 0.7 + pulseFactor * 0.4);
    ctx.globalAlpha = (0.15 - r * 0.04) * (0.6 + pulseFactor * 0.4);
    if (!isLowGraphicsMode) {
      ctx.shadowBlur = ringR * 2; ctx.shadowColor = drawGlow;
    }
    ctx.strokeStyle = drawGlow; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(boss.x, boss.y, ringR, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;

  if (shouldDrawEnemyHealthBar(boss)) {
    const barW = bossSize * 5;
    const barH = 4;
    const barX = boss.x - barW / 2;
    const barY = boss.y - bossSize - 12;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#111'; ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = drawColor; ctx.fillRect(barX, barY, barW * enemyHealthFraction(boss), barH);
    ctx.globalAlpha = 0.5; ctx.fillStyle = '#ffffff';
    ctx.fillRect(barX + barW * BOSS_PHASE2_HP_RATIO - 0.5, barY, 1.5, barH);
    ctx.fillRect(barX + barW * BOSS_PHASE3_HP_RATIO - 0.5, barY, 1.5, barH);
    ctx.globalAlpha = 1;

    if (boss.maxShieldHp > 0) {
      const sBarY = barY - 6;
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#111'; ctx.fillRect(barX, sBarY, barW, 3);
      ctx.fillStyle = '#74c0fc'; ctx.fillRect(barX, sBarY, barW * (boss.shieldHp / boss.maxShieldHp), 3);
      ctx.globalAlpha = 1;
    }
  }

  if (!isLowGraphicsMode) {
    ctx.shadowBlur = bossSize * (4 + pulseFactor * 4); ctx.shadowColor = drawGlow;
  }
  if (boss.bossId === 7 || boss.bossId === 10) {
    ctx.save();
    ctx.translate(boss.x, boss.y);
    ctx.rotate(Math.PI / 4 + glowTimeS * 0.3);
    ctx.fillStyle = drawColor;
    ctx.fillRect(-half * 0.85, -half * 0.85, bossSize * 0.85, bossSize * 0.85);
    ctx.restore();
  } else if (boss.bossId === 8) {
    ctx.fillStyle = drawColor;
    ctx.fillRect(Math.floor(boss.x - half), Math.floor(boss.y - half), Math.ceil(bossSize), Math.ceil(bossSize));
    ctx.shadowBlur = 0;
    for (let r = 1; r <= 3; r++) {
      const ringAlpha = boss.isAbsorbing ? 0.5 - r * 0.1 : 0.2 - r * 0.04;
      ctx.globalAlpha = Math.max(0, ringAlpha) * (0.7 + pulseFactor * 0.3);
      if (!isLowGraphicsMode) {
        ctx.shadowBlur = 6; ctx.shadowColor = drawGlow;
      }
      ctx.strokeStyle = drawGlow; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(boss.x, boss.y, bossSize * (0.9 + r * 0.55), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  } else {
    ctx.fillStyle = drawColor;
    ctx.fillRect(Math.floor(boss.x - half), Math.floor(boss.y - half), Math.ceil(bossSize), Math.ceil(bossSize));
  }
  ctx.shadowBlur = 0;

  const pipRadius = 2;
  const pipSpacing = 8;
  const totalPips = 3;
  const pipsStartX = boss.x - (totalPips - 1) * pipSpacing / 2;
  const pipY = boss.y + half + 8;
  for (let p = 0; p < totalPips; p++) {
    const filled = p <= boss.phaseIndex;
    ctx.globalAlpha = filled ? 0.95 : 0.25;
    if (!isLowGraphicsMode && filled) {
      ctx.shadowBlur = 5; ctx.shadowColor = drawGlow;
    }
    ctx.fillStyle = filled ? drawGlow : '#444';
    ctx.beginPath(); ctx.arc(pipsStartX + p * pipSpacing, pipY, pipRadius, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;

  if (boss.bossId === 7 && boss.isInvuln) {
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = drawGlow;
    ctx.font = '9px "Cormorant Garamond", serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (!isLowGraphicsMode) {
      ctx.shadowBlur = 4; ctx.shadowColor = drawGlow;
    }
    ctx.fillText('INVULN', boss.x, boss.y - half - 20);
    ctx.shadowBlur = 0; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ── Bottom safe zone ──────────────────────────────────────────────────────────

/**
 * Draws the prismatic ring that marks the player's safe zone at the bottom of
 * the canvas during boss waves.  No-op when `isBossWaveActive` is false.
 */
export function drawBottomSafeZone(
  ctx: CanvasRenderingContext2D,
  isBossWaveActive: boolean,
  widthPx: number,
  heightPx: number,
  glowTimeS: number,
): void {
  if (!isBossWaveActive) return;
  const szX = widthPx / 2, szY = heightPx * 0.85;
  const hue = (glowTimeS * 60) % 360;
  ctx.save();
  ctx.globalAlpha = 0.30 + Math.sin(glowTimeS * 3) * 0.08;
  if (!isLowGraphicsMode) {
    ctx.shadowBlur = 16; ctx.shadowColor = `hsl(${hue}, 100%, 80%)`;
  }
  ctx.strokeStyle = `hsl(${hue}, 80%, 75%)`; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(szX, szY, BOSS_BOTTOM_SAFE_ZONE_R, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = `hsl(${hue}, 80%, 75%)`;
  ctx.beginPath(); ctx.arc(szX, szY, BOSS_BOTTOM_SAFE_ZONE_R, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

// ── Danmaku safe zone ─────────────────────────────────────────────────────────

/**
 * Draws the wedge-shaped safe-angle indicator that appears before and during
 * danmaku phases.  No-op when boss or safeZone is null, or when
 * boss.danmakuLevel is 0.
 */
export function drawDanmakuSafeZone(
  ctx: CanvasRenderingContext2D,
  boss: BossEnemy | null,
  safeZone: DanmakuSafeZone | null,
): void {
  if (!boss || !safeZone || boss.danmakuLevel === 0) return;
  const sz = safeZone;
  const halfAngle = sz.width / 2;
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#00ff88';
  ctx.beginPath();
  ctx.moveTo(sz.x, sz.y);
  ctx.arc(sz.x, sz.y, 80, sz.angle - halfAngle, sz.angle + halfAngle);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  const warnProgress = 1 - Math.min(1, sz.timerMs / sz.maxTimerMs);
  if (warnProgress < 1) {
    ctx.globalAlpha = 0.7 * (1 - warnProgress);
    ctx.fillStyle = '#00ff88';
    ctx.font = '6px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SAFE', Math.round(sz.x + Math.cos(sz.angle) * 50), Math.round(sz.y + Math.sin(sz.angle) * 50));
    ctx.globalAlpha = 1;
  }
}

// ── Wave clear banner ─────────────────────────────────────────────────────────

/**
 * Draws the centred "Wave N Cleared!" overlay with fade-in/out animation.
 * No-op when `isInterWave` is false or `currentWave` is 0.
 */
export function drawWaveClearBanner(
  ctx: CanvasRenderingContext2D,
  isInterWave: boolean,
  currentWave: number,
  interWaveTimerMs: number,
  widthPx: number,
  heightPx: number,
): void {
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
  if (!isLowGraphicsMode) {
    ctx.shadowBlur = 8; ctx.shadowColor = '#ffe599';
  }
  const isBoss = currentWave > 0 && currentWave % 100 === 0;
  const bannerText = isBoss
    ? `${BOSS_GLYPH_LABEL} ${currentWave / 100} Cleared!`
    : `Wave ${currentWave} Cleared!`;
  ctx.fillText(bannerText, widthPx / 2, heightPx / 2 - 8);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff172'; ctx.font = '10px "Poiret One", sans-serif';
  ctx.fillText('Next wave incoming\u2026', widthPx / 2, heightPx / 2 + 10);
  if (currentWave > 0 && currentWave % 10 === 0) {
    ctx.fillStyle = '#69db7c'; ctx.font = '9px "Poiret One", sans-serif';
    if (!isLowGraphicsMode) {
      ctx.shadowBlur = 6; ctx.shadowColor = '#69db7c';
    }
    ctx.fillText('✦ Checkpoint unlocked! See RPG Menu.', widthPx / 2, heightPx / 2 + 22);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}
