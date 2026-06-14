const glowCache = new Map<string, HTMLCanvasElement>();

export function drawCachedProjectileGlow(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  color: string,
  radius: number,
  alpha = 1,
): void {
  const size = Math.ceil(radius * 2);
  const key = `${color}:${size}`;
  let sprite = glowCache.get(key);
  if (!sprite) {
    sprite = document.createElement('canvas');
    sprite.width = size; sprite.height = size;
    const c = sprite.getContext('2d')!;
    const r = size * 0.5;
    const gradient = c.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.16, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gradient;
    c.fillRect(0, 0, size, size);
    glowCache.set(key, sprite);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, x - size * 0.5, y - size * 0.5);
  ctx.restore();
}
