import type { HorizonPentagonGroup } from './horizon-pentagon-types';
import { drawCachedProjectileGlow } from './horizon-projectile-glow';

export interface GalaxyParticle { radius: number; angle: number; speed: number; flatten: number; phase: number }
export interface GalaxyStreamParticle {
  x: number; y: number; vx: number; vy: number; lifeMs: number;
  trailX: Float32Array; trailY: Float32Array; trailHead: number; trailCount: number;
}
export interface GalaxyState {
  particles: GalaxyParticle[];
  streams: GalaxyStreamParticle[];
  fireMs: number;
  rotation: number;
  color: string;
}

let waveHitCount = 0;
export function resetGalaxyWaveHitChain(): void { waveHitCount = 0; }
export function nextGalaxyStreamDamage(): number {
  const damage = 2 * 2 ** Math.min(waveHitCount, 12);
  waveHitCount++;
  return damage;
}

export function makeGalaxyState(seed: number): GalaxyState {
  const particles: GalaxyParticle[] = [];
  for (let i = 0; i < 180; i++) {
    const t = (i + 0.5) / 180;
    particles.push({
      radius: 3 + Math.sqrt(t) * 31,
      angle: i * 2.399963 + seed * 0.17,
      speed: 0.35 + (1 - t) * 1.3,
      flatten: 0.28 + (i % 11) * 0.018,
      phase: (i * 47 % 101) / 101,
    });
  }
  return { particles, streams: [], fireMs: 700 + seed % 900, rotation: seed, color: seed % 2 ? '#ff70c8' : '#ff9a58' };
}

export function updateGalaxyGroup(
  g: HorizonPentagonGroup, playerX: number, playerY: number, deltaMs: number,
  dealDamageToPlayer: (damage: number) => void,
): boolean {
  const galaxy = g.galaxy;
  if (!galaxy) return false;
  galaxy.rotation += deltaMs * 0.00065;
  galaxy.fireMs -= deltaMs;
  if (galaxy.fireMs <= 0) {
    const dx = playerX - g.x, dy = playerY - g.y;
    for (let i = -2; i <= 2; i++) {
      const a = Math.atan2(dy, dx) + i * 0.045 + (Math.random() - 0.5) * 0.06;
      const speed = 2.2 * (0.82 + Math.random() * 0.38);
      galaxy.streams.push({
        x: g.x, y: g.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, lifeMs: 2600,
        trailX: new Float32Array(32), trailY: new Float32Array(32), trailHead: 0, trailCount: 0,
      });
    }
    galaxy.fireMs = 1300;
  }
  const fr = deltaMs * 0.06;
  for (let i = galaxy.streams.length - 1; i >= 0; i--) {
    const p = galaxy.streams[i]!;
    p.trailX[p.trailHead] = p.x; p.trailY[p.trailHead] = p.y;
    p.trailHead = (p.trailHead + 1) % p.trailX.length;
    p.trailCount = Math.min(p.trailX.length, p.trailCount + 1);
    p.lifeMs -= deltaMs; p.x += p.vx * fr; p.y += p.vy * fr;
    if (p.lifeMs <= 0) { galaxy.streams.splice(i, 1); continue; }
    const dx = playerX - p.x, dy = playerY - p.y;
    if (dx * dx + dy * dy < 8 * 8) {
      dealDamageToPlayer(nextGalaxyStreamDamage());
      galaxy.streams.splice(i, 1);
    }
  }
  return true;
}

export function drawGalaxyGroup(ctx: CanvasRenderingContext2D, g: HorizonPentagonGroup): boolean {
  const galaxy = g.galaxy;
  if (!galaxy) return false;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of galaxy.particles) {
    const a = p.angle + galaxy.rotation * p.speed;
    const wobble = Math.sin(galaxy.rotation * 0.7 + p.phase * Math.PI * 2) * 3;
    const x = g.x + Math.cos(a) * p.radius;
    const y = g.y + Math.sin(a) * p.radius * p.flatten + wobble;
    ctx.globalAlpha = 0.22 + p.phase * 0.6;
    ctx.fillStyle = galaxy.color;
    ctx.fillRect(x, y, p.phase > 0.72 ? 2 : 1, p.phase > 0.72 ? 2 : 1);
  }
  ctx.globalAlpha = 0.85; ctx.fillStyle = '#ffffff'; ctx.shadowColor = galaxy.color; ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.arc(g.x, g.y, 4, 0, Math.PI * 2); ctx.fill();
  for (const p of galaxy.streams) {
    ctx.strokeStyle = galaxy.color; ctx.lineWidth = 1.5;
    for (let i = 1; i < p.trailCount; i++) {
      const a = (p.trailHead - i - 1 + p.trailX.length) % p.trailX.length;
      const b = (p.trailHead - i + p.trailX.length) % p.trailX.length;
      ctx.globalAlpha = (1 - i / p.trailCount) * 0.42;
      ctx.beginPath(); ctx.moveTo(p.trailX[a]!, p.trailY[a]!); ctx.lineTo(p.trailX[b]!, p.trailY[b]!); ctx.stroke();
    }
    drawCachedProjectileGlow(ctx, p.x, p.y, galaxy.color, 18, 0.68);
    ctx.globalAlpha = Math.min(1, p.lifeMs / 500);
    ctx.fillStyle = galaxy.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  return true;
}
