/**
 * rpg-death-fade.ts — Darkening-and-fading ghost drawn after an enemy dies.
 *
 * Module-level singleton array; no context threading required.
 * Call pushDyingEnemy from rpg-wave-dead-enemies-standard.ts before splicing
 * an enemy, updateDyingEnemies from rpg-render-update.ts each frame, and
 * drawDyingEnemies from rpg-render-draw.ts each frame.
 * Call clearDyingEnemies in doRestart (rpg-death-restart.ts).
 */

export const DEATH_FADE_DURATION_MS = 420;

export interface DyingEnemyGhost {
  x: number;
  y: number;
  timerMs: number; // counts down from DEATH_FADE_DURATION_MS to 0
  r: number;
  g: number;
  b: number;
  size: number; // radius in canvas px
}

const _dyingEnemies: DyingEnemyGhost[] = [];

export function pushDyingEnemy(
  x: number, y: number,
  r: number, g: number, b: number,
  size: number,
): void {
  _dyingEnemies.push({ x, y, timerMs: DEATH_FADE_DURATION_MS, r, g, b, size });
}

export function clearDyingEnemies(): void {
  _dyingEnemies.length = 0;
}

export function updateDyingEnemies(deltaMs: number): void {
  for (let i = _dyingEnemies.length - 1; i >= 0; i--) {
    _dyingEnemies[i].timerMs -= deltaMs;
    if (_dyingEnemies[i].timerMs <= 0) _dyingEnemies.splice(i, 1);
  }
}

export function drawDyingEnemies(cc: CanvasRenderingContext2D, isLowGraphics: boolean): void {
  if (_dyingEnemies.length === 0) return;
  cc.save();
  for (const ghost of _dyingEnemies) {
    // t: 1 at death → 0 at end (drives both alpha and color darkening)
    const t = ghost.timerMs / DEATH_FADE_DURATION_MS;
    const ri = Math.round(ghost.r * t);
    const gi = Math.round(ghost.g * t);
    const bi = Math.round(ghost.b * t);
    cc.globalAlpha = t;
    cc.fillStyle = `rgb(${ri},${gi},${bi})`;
    if (!isLowGraphics) {
      cc.shadowBlur = ghost.size * 1.5;
      cc.shadowColor = `rgb(${ri},${gi},${bi})`;
    }
    cc.beginPath();
    cc.arc(ghost.x, ghost.y, ghost.size, 0, Math.PI * 2);
    cc.fill();
  }
  cc.shadowBlur = 0;
  cc.globalAlpha = 1;
  cc.restore();
}
