/**
 * rpg-spawn-flash.ts — Expanding ring flash shown when an enemy spawns.
 *
 * Module-level singleton array so callers do not need to thread context.
 * Call pushSpawnFlash from rpg-enemy-spawn.ts after each enemy placement,
 * updateSpawnFlashes from rpg-render-update.ts each frame, and
 * drawSpawnFlashes from rpg-render-draw.ts each frame.
 * Call clearSpawnFlashes in doRestart (rpg-death-restart.ts).
 */

export const SPAWN_FLASH_DURATION_MS = 200;
const SPAWN_FLASH_MAX_RADIUS_PX = 22;

export interface SpawnFlashEffect {
  x: number;
  y: number;
  timerMs: number; // counts down from SPAWN_FLASH_DURATION_MS to 0
}

const _spawnFlashes: SpawnFlashEffect[] = [];

export function pushSpawnFlash(x: number, y: number): void {
  _spawnFlashes.push({ x, y, timerMs: SPAWN_FLASH_DURATION_MS });
}

export function clearSpawnFlashes(): void {
  _spawnFlashes.length = 0;
}

export function updateSpawnFlashes(deltaMs: number): void {
  for (let i = _spawnFlashes.length - 1; i >= 0; i--) {
    _spawnFlashes[i].timerMs -= deltaMs;
    if (_spawnFlashes[i].timerMs <= 0) _spawnFlashes.splice(i, 1);
  }
}

export function drawSpawnFlashes(cc: CanvasRenderingContext2D, isLowGraphics: boolean): void {
  if (_spawnFlashes.length === 0) return;
  cc.save();
  cc.strokeStyle = '#ffffff';
  cc.lineWidth = 1.5;
  if (!isLowGraphics) cc.shadowColor = '#ffffff';
  for (const f of _spawnFlashes) {
    // t: 0 at spawn → 1 at end; alpha fades from 1 → 0, ring expands 0 → max
    const t = 1 - f.timerMs / SPAWN_FLASH_DURATION_MS;
    cc.globalAlpha = Math.max(0, 1 - t) * 0.85;
    const radius = Math.max(1, SPAWN_FLASH_MAX_RADIUS_PX * t);
    if (!isLowGraphics) cc.shadowBlur = 8 * (1 - t);
    cc.beginPath();
    cc.arc(f.x, f.y, radius, 0, Math.PI * 2);
    cc.stroke();
  }
  cc.shadowBlur = 0;
  cc.globalAlpha = 1;
  cc.restore();
}
