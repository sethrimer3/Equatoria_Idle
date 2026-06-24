/** One-shot gold magic-circle effect for boss arrivals. */
import { getCachedImage, loadImage } from '../assets/asset-loader';

const SPRITE_PATH = 'ASSETS/ANIMATIONS/goldMagicCircle/spritesheet.png';
const FRAME_COUNT = 96;
const FRAME_SIZE_PX = 512;
const FRAME_STRIDE_PX = 516;
const PLAY_DURATION_MS = 960;
export const BOSS_SPAWN_FADE_MS = 240;
export const BOSS_SPAWN_INTRO_DURATION_MS = PLAY_DURATION_MS + BOSS_SPAWN_FADE_MS;
const DRAW_SIZE_PX = 190;

interface BossSpawnCircle { x: number; y: number; elapsedMs: number; }
const circles: BossSpawnCircle[] = [];

export function pushBossSpawnCircle(x: number, y: number): void {
  circles.push({ x, y, elapsedMs: 0 });
  loadImage(SPRITE_PATH).catch(() => { /* optional visual asset */ });
}

export function updateBossSpawnCircles(deltaMs: number): void {
  for (let i = circles.length - 1; i >= 0; i--) {
    circles[i].elapsedMs += deltaMs;
    if (circles[i].elapsedMs >= BOSS_SPAWN_INTRO_DURATION_MS) circles.splice(i, 1);
  }
}

export function drawBossSpawnCircles(ctx: CanvasRenderingContext2D): void {
  if (circles.length === 0) return;
  const image = getCachedImage(SPRITE_PATH);
  if (!image) return;
  const half = DRAW_SIZE_PX / 2;
  ctx.save();
  for (const circle of circles) {
    const frame = Math.min(FRAME_COUNT - 1, Math.floor(circle.elapsedMs / PLAY_DURATION_MS * FRAME_COUNT));
    const fade = Math.max(0, (circle.elapsedMs - PLAY_DURATION_MS) / BOSS_SPAWN_FADE_MS);
    ctx.globalAlpha = 1 - fade;
    ctx.drawImage(image, 2 + frame * FRAME_STRIDE_PX, 2, FRAME_SIZE_PX, FRAME_SIZE_PX,
      circle.x - half, circle.y - half, DRAW_SIZE_PX, DRAW_SIZE_PX);
  }
  ctx.restore();
}
