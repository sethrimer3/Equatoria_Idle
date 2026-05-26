/**
 * zenith-binary-ring-background.ts — path-traced Zenith Binary Ring backdrop.
 */

export interface ZenithBinaryRingBackground {
  update(now: number, width: number, height: number, age: 'light' | 'dark'): void;
  draw(ctx: CanvasRenderingContext2D): void;
  reset(): void;
  destroy(): void;
}

const PARTICLE_COUNT = {
  high: 500,
  medium: 220,
  low: 90,
} as const;

const TRAIL_FADE = {
  high: 0.008,
  medium: 0.016,
  low: 0.03,
} as const;

const RENDER_SCALE = {
  high: 1,
  medium: 0.75,
  low: 0.5,
} as const;

const N_BUCKETS = 8;
const AGE_LERP_MS = 1500;
const BASE_RING_RADIUS_HIGH = 55;
const BREATHE_SPEED = 0.00115;
const BASE_DT = 1 / 60;

const LIGHT_H = new Float32Array([45, 48, 50, 55, 60, 65, 195, 210]);
const LIGHT_S = new Float32Array([20, 35, 45, 55, 50, 45, 15, 20]);
const LIGHT_L = new Float32Array([95, 90, 84, 78, 70, 62, 55, 45]);

const DARK_H = new Float32Array([280, 290, 300, 310, 270, 260, 250, 240]);
const DARK_S = new Float32Array([30, 40, 35, 30, 25, 20, 15, 10]);
const DARK_L = new Float32Array([15, 20, 22, 18, 15, 12, 10, 8]);

function clamp01(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

function hueLerp(a: number, b: number, t: number): number {
  let diff = b - a;
  if (diff > 180) diff -= 360;
  else if (diff < -180) diff += 360;
  let result = a + diff * t;
  if (result < 0) result += 360;
  else if (result >= 360) result -= 360;
  return result;
}

function hslToCss(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)},${Math.round(s)}%,${Math.round(l)}%)`;
}

export function createZenithBinaryRingBackground(
  opts: { quality?: 'low' | 'medium' | 'high' } = {},
): ZenithBinaryRingBackground {
  const quality = opts.quality ?? 'high';
  const particleCount = PARTICLE_COUNT[quality];
  const trailFade = TRAIL_FADE[quality];
  const renderScale = RENDER_SCALE[quality];

  const px = new Float32Array(particleCount);
  const py = new Float32Array(particleCount);
  const ppx = new Float32Array(particleCount);
  const ppy = new Float32Array(particleCount);
  const pvx = new Float32Array(particleCount);
  const pvy = new Float32Array(particleCount);
  const pphase = new Float32Array(particleCount);
  const pradiusJitter = new Float32Array(particleCount);
  const pbucket = new Uint8Array(particleCount);

  const currentH = new Float32Array(N_BUCKETS);
  const currentS = new Float32Array(N_BUCKETS);
  const currentL = new Float32Array(N_BUCKETS);
  const startH = new Float32Array(N_BUCKETS);
  const startS = new Float32Array(N_BUCKETS);
  const startL = new Float32Array(N_BUCKETS);
  const targetH = new Float32Array(N_BUCKETS);
  const targetS = new Float32Array(N_BUCKETS);
  const targetL = new Float32Array(N_BUCKETS);
  const bucketStyles: string[] = new Array(N_BUCKETS);

  let offCanvas: HTMLCanvasElement | null = null;
  let offCtx: CanvasRenderingContext2D | null = null;
  let W = 0;
  let H = 0;
  let IW = 0;
  let IH = 0;
  let cx = 0;
  let cy = 0;
  let ringRadius = BASE_RING_RADIUS_HIGH;
  let lastNow: number | null = null;
  let timeS = 0;
  let currentAge: 'light' | 'dark' = 'light';
  let lerpStartMs = 0;
  let lerpAgeActive = false;
  let paletteDirty = true;

  function applyTargetPalette(age: 'light' | 'dark', destH: Float32Array, destS: Float32Array, destL: Float32Array): void {
    const srcH = age === 'light' ? LIGHT_H : DARK_H;
    const srcS = age === 'light' ? LIGHT_S : DARK_S;
    const srcL = age === 'light' ? LIGHT_L : DARK_L;
    for (let i = 0; i < N_BUCKETS; i++) {
      destH[i] = srcH[i]!;
      destS[i] = srcS[i]!;
      destL[i] = srcL[i]!;
    }
  }

  function refreshBucketStyles(): void {
    for (let i = 0; i < N_BUCKETS; i++) {
      bucketStyles[i] = hslToCss(currentH[i]!, currentS[i]!, currentL[i]!);
    }
    paletteDirty = false;
  }

  function syncPalette(now: number): void {
    if (lerpAgeActive) {
      const t = clamp01((now - lerpStartMs) / AGE_LERP_MS);
      for (let i = 0; i < N_BUCKETS; i++) {
        currentH[i] = hueLerp(startH[i]!, targetH[i]!, t);
        currentS[i] = startS[i]! + (targetS[i]! - startS[i]!) * t;
        currentL[i] = startL[i]! + (targetL[i]! - startL[i]!) * t;
      }
      paletteDirty = true;
      if (t >= 1) lerpAgeActive = false;
    }
    if (paletteDirty) refreshBucketStyles();
  }

  function bucketForParticle(i: number): number {
    const dist = Math.sqrt((px[i]! - cx) * (px[i]! - cx) + (py[i]! - cy) * (py[i]! - cy));
    const delta = Math.abs(dist - ringRadius);
    const range = ringRadius * 0.72 + 1;
    const t = clamp01(delta / range);
    return Math.min(N_BUCKETS - 1, Math.floor(t * N_BUCKETS));
  }

  function seedParticle(i: number, scatterPhase: boolean): void {
    const a = Math.random() * Math.PI * 2;
    const radialJitter = (Math.random() * 2 - 1) * ringRadius * 0.18;
    const spawnR = ringRadius + radialJitter;
    const x = cx + Math.cos(a) * spawnR;
    const y = cy + Math.sin(a) * spawnR;
    px[i] = x;
    py[i] = y;
    ppx[i] = x;
    ppy[i] = y;
    pvx[i] = 0;
    pvy[i] = 0;
    pphase[i] = scatterPhase ? Math.random() * Math.PI * 2 : (i / Math.max(1, particleCount)) * Math.PI * 2;
    pradiusJitter[i] = (Math.random() * 2 - 1) * 0.26;
    pbucket[i] = bucketForParticle(i);
  }

  function init(w: number, h: number): void {
    W = w;
    H = h;
    IW = Math.max(1, Math.round(w * renderScale));
    IH = Math.max(1, Math.round(h * renderScale));
    cx = IW * 0.5;
    cy = IH * 0.5;
    ringRadius = Math.min(IW, IH) * (BASE_RING_RADIUS_HIGH / 360);

    offCanvas = document.createElement('canvas');
    offCanvas.width = IW;
    offCanvas.height = IH;
    offCtx = offCanvas.getContext('2d');
    if (!offCtx) throw new Error('Failed to create Zenith Binary Ring offscreen context');
    offCtx.fillStyle = '#000';
    offCtx.fillRect(0, 0, IW, IH);
    offCtx.lineCap = 'round';
    offCtx.lineJoin = 'round';
    offCtx.imageSmoothingEnabled = false;

    applyTargetPalette(currentAge, currentH, currentS, currentL);
    applyTargetPalette(currentAge, startH, startS, startL);
    applyTargetPalette(currentAge, targetH, targetS, targetL);
    paletteDirty = true;
    refreshBucketStyles();

    for (let i = 0; i < particleCount; i++) seedParticle(i, true);
    lastNow = null;
    timeS = 0;
  }

  function ensureInit(w: number, h: number): void {
    if (!offCanvas || !offCtx || w !== W || h !== H) init(w, h);
  }

  function maybeStartAgeTransition(now: number, age: 'light' | 'dark'): void {
    if (age === currentAge) return;
    currentAge = age;
    for (let i = 0; i < N_BUCKETS; i++) {
      startH[i] = currentH[i]!;
      startS[i] = currentS[i]!;
      startL[i] = currentL[i]!;
    }
    applyTargetPalette(age, targetH, targetS, targetL);
    lerpStartMs = now;
    lerpAgeActive = true;
    paletteDirty = true;
  }

  function drawRingGlow(oc: CanvasRenderingContext2D, breathe: number): void {
    oc.save();
    oc.globalCompositeOperation = 'lighter';
    oc.strokeStyle = currentAge === 'light' ? '#f6f1dc' : '#482358';
    oc.lineWidth = 1.35 + breathe * 0.9;
    oc.globalAlpha = currentAge === 'light' ? 0.12 + breathe * 0.07 : 0.08 + breathe * 0.05;
    oc.beginPath();
    oc.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    oc.stroke();

    oc.globalAlpha = currentAge === 'light' ? 0.025 + breathe * 0.025 : 0.02 + breathe * 0.02;
    oc.fillStyle = currentAge === 'light' ? '#f8f2dd' : '#331931';
    oc.beginPath();
    oc.arc(cx, cy, ringRadius * (0.88 + breathe * 0.02), 0, Math.PI * 2);
    oc.fill();
    oc.restore();
  }

  function respawnIfNeeded(i: number, breatheRadius: number): boolean {
    const dx = px[i]! - cx;
    const dy = py[i]! - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < breatheRadius * 0.42 || dist > breatheRadius * 1.9) {
      seedParticle(i, false);
      return true;
    }
    return false;
  }

  return {
    update(now: number, width: number, height: number, age: 'light' | 'dark'): void {
      ensureInit(width, height);
      maybeStartAgeTransition(now, age);
      syncPalette(now);
      if (!offCtx) return;

      const prevNow = lastNow ?? now;
      let dt = (now - prevNow) / 1000;
      if (dt < 0.001) dt = BASE_DT;
      if (dt > 0.05) dt = 0.05;
      lastNow = now;
      timeS += dt;

      const breathe = 0.5 + 0.5 * Math.sin(now * BREATHE_SPEED);
      const breatheRadius = ringRadius * (0.97 + breathe * 0.06);

      offCtx.globalCompositeOperation = 'source-over';
      offCtx.globalAlpha = trailFade;
      offCtx.fillStyle = '#000';
      offCtx.fillRect(0, 0, IW, IH);
      offCtx.globalAlpha = 1;

      drawRingGlow(offCtx, breathe);

      for (let bucket = 0; bucket < N_BUCKETS; bucket++) {
        offCtx.strokeStyle = bucketStyles[bucket]!;
        offCtx.lineWidth = bucket === 0 ? 1.3 : bucket < 3 ? 1.05 : 0.85;
        offCtx.globalAlpha = currentAge === 'light'
          ? (bucket < 3 ? 0.085 : 0.055)
          : (bucket < 3 ? 0.065 : 0.045);
        offCtx.beginPath();
        for (let i = 0; i < particleCount; i++) {
          if (pbucket[i] !== bucket) continue;
          ppx[i] = px[i]!;
          ppy[i] = py[i]!;

          const dx = px[i]! - cx;
          const dy = py[i]! - cy;
          const dist = Math.max(0.0001, Math.sqrt(dx * dx + dy * dy));
          const dirX = dx / dist;
          const dirY = dy / dist;
          const tanX = -dirY;
          const tanY = dirX;
          const angle = Math.atan2(dy, dx);
          const ringDelta = breatheRadius - dist;
          const spring = ringDelta * 1.75;
          const flowPhase = angle + timeS * 1.35 + pphase[i]!;
          const tangentialSpeed = 22 + Math.sin(flowPhase * 1.7 + pphase[i]! * 0.7) * 6;
          const radialDrift = spring * 11 + Math.sin(timeS * 2.6 + angle * 3 + pphase[i]!) * 5.5;
          const wobble = Math.sin(timeS * 3.8 + angle * 2.5 + pphase[i]! * 1.3) * 4.8;
          const wobble2 = Math.cos(timeS * 2.1 + angle * 3.2 + pphase[i]! * 0.9) * 3.2;

          pvx[i] = pvx[i]! * 0.84 + (tanX * tangentialSpeed + dirX * radialDrift + tanX * wobble * pradiusJitter[i]!) * dt * 16;
          pvy[i] = pvy[i]! * 0.84 + (tanY * tangentialSpeed + dirY * radialDrift + dirY * wobble2 * pradiusJitter[i]!) * dt * 16;

          px[i] += pvx[i]! * dt;
          py[i] += pvy[i]! * dt;

          if (!respawnIfNeeded(i, breatheRadius)) {
            pbucket[i] = bucketForParticle(i);
          }

          offCtx.moveTo(ppx[i]!, ppy[i]!);
          offCtx.lineTo(px[i]!, py[i]!);
        }
        offCtx.stroke();
      }

      offCtx.globalAlpha = 1;
      offCtx.globalCompositeOperation = 'source-over';
    },

    draw(ctx: CanvasRenderingContext2D): void {
      if (!offCanvas) return;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offCanvas, 0, 0, W, H);
      ctx.restore();
    },

    reset(): void {
      offCanvas = null;
      offCtx = null;
      W = 0;
      H = 0;
      IW = 0;
      IH = 0;
      lastNow = null;
      timeS = 0;
    },

    destroy(): void {
      this.reset();
    },
  };
}
