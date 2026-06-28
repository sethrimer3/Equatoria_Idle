/** Draws the boss spawn circle animation, driven by boss-intro-director. */

// Legacy constants kept for callers that reference them (e.g. rpg-factories-late, rpg-boss-draw).
export const BOSS_SPAWN_FADE_MS = 240;
export const BOSS_SPAWN_INTRO_DURATION_MS = 960 + BOSS_SPAWN_FADE_MS;

// Legacy no-op — spawn circle is now started via startBossIntro in rpg-render.ts.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function pushBossSpawnCircle(_x: number, _y: number): void { /* no-op */ }
import { getBossIntroDrawState } from './boss-intro-director';
import { getCachedImage, loadImage } from '../assets/asset-loader';

const SPRITE_PATH = 'ASSETS/ANIMATIONS/goldMagicCircle/spritesheet.png';
const FRAME_SIZE_PX = 512;
const FRAME_STRIDE_PX = 516;
const DRAW_SIZE_PX = 190;

export function preloadBossSpawnCircleAsset(): void {
  loadImage(SPRITE_PATH).catch(() => { /* optional visual asset */ });
}

export function drawBossSpawnCircles(ctx: CanvasRenderingContext2D): void {
  const intro = getBossIntroDrawState();
  if (!intro.isActive || intro.circleAlpha <= 0) return;
  const image = getCachedImage(SPRITE_PATH);
  if (!image) return;
  const half = DRAW_SIZE_PX / 2;
  ctx.save();
  ctx.globalAlpha = intro.circleAlpha;
  ctx.drawImage(
    image,
    2 + intro.animFrame * FRAME_STRIDE_PX, 2,
    FRAME_SIZE_PX, FRAME_SIZE_PX,
    intro.circleX - half, intro.circleY - half,
    DRAW_SIZE_PX, DRAW_SIZE_PX,
  );
  ctx.restore();
}
