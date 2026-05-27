/**
 * rpg-elite-empower-particles.ts — Wave-start visual effect for elite
 * empowerment.
 *
 * When an elite enemy spawns (or a non-elite spawns while elites are alive),
 * faint orange/amber particles travel from elite spawn positions toward
 * non-elite enemy positions.  The particles are purely cosmetic; they carry no
 * gameplay meaning.
 *
 * Visual design (per spec):
 *   • Velocity-aligned glowing capsule trails — NOT chains of dots.
 *   • Linear gradient: transparent tail → amber body → near-white head.
 *   • Two-pass render: blurred glow composited first, crisp core drawn on top.
 *   • Particles fade to full transparency before reaching the target and despawn
 *     just before arrival, giving a "transfer of energy" feel.
 *   • Maximum particle count is capped to prevent lag on large waves.
 *
 * Public API:
 *   spawnEmpowerParticles(eliteX, eliteY, targets)   — emit from one elite
 *   updateEmpowerParticles(deltaMs)                  — advance simulation
 *   drawEmpowerParticles(ctx2d, widthPx, heightPx)   — render two-pass effect
 *   clearEmpowerParticles()                          — discard all particles
 */

/** Hard cap: never exceed this many live particles at once. */
const MAX_PARTICLES = 48;

/** px/ms speed range for spawned particles. */
const SPEED_MIN = 0.14;   // px/ms  ≈ 140 px/s
const SPEED_MAX = 0.21;   // px/ms  ≈ 210 px/s

/**
 * Fraction of total travel time at which the particle despawns.
 * 0.88 → despawns when it would be 88% of the way to the target.
 */
const LIFETIME_RATIO = 0.88;

/** Life fraction at which alpha starts fading. */
const FADE_START_RATIO = 0.55;

/** Base trail length (px), independent of speed. */
const BASE_TRAIL_LENGTH = 8;

/**
 * Additional trail length per unit of speed (px / (px/ms)).
 * At 0.18 px/ms: trailLength = 8 + 0.18 * 35 = ~14 px.
 */
const TRAIL_LENGTH_SCALE = 35;

// ── Particle type ──────────────────────────────────────────────────────────────

interface EmpowerParticle {
  x: number; y: number;
  vx: number; vy: number;
  elapsedMs: number;
  maxLifeMs: number;
}

// ── Module-level state ─────────────────────────────────────────────────────────

let _particles: EmpowerParticle[] = [];
let _glowCanvas: HTMLCanvasElement | null = null;
let _glowCtx: CanvasRenderingContext2D | null = null;

function _ensureGlowCanvas(gw: number, gh: number): CanvasRenderingContext2D {
  if (!_glowCanvas || _glowCanvas.width !== gw || _glowCanvas.height !== gh) {
    _glowCanvas = document.createElement('canvas');
    _glowCanvas.width  = gw;
    _glowCanvas.height = gh;
    _glowCtx = _glowCanvas.getContext('2d')!;
  }
  return _glowCtx!;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Spawns particles travelling from the given elite position toward each target.
 * Silently skips if the particle cap is already reached.
 *
 * @param eliteX  Elite enemy X position (spawn-time coordinate).
 * @param eliteY  Elite enemy Y position (spawn-time coordinate).
 * @param targets Positions of non-elite enemies to travel toward.
 */
export function spawnEmpowerParticles(
  eliteX: number,
  eliteY: number,
  targets: ReadonlyArray<{ x: number; y: number }>,
): void {
  for (let t = 0; t < targets.length; t++) {
    if (_particles.length >= MAX_PARTICLES) return;
    const { x: tx, y: ty } = targets[t]!;
    const dx = tx - eliteX;
    const dy = ty - eliteY;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) continue;
    const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;
    const travelTimeMs = dist / speed;
    _particles.push({
      x: eliteX, y: eliteY,
      vx, vy,
      elapsedMs: 0,
      maxLifeMs: travelTimeMs * LIFETIME_RATIO,
    });
  }
}

/**
 * Advances all live particles by `deltaMs` milliseconds.
 * Removes particles whose lifetime has expired.
 */
export function updateEmpowerParticles(deltaMs: number): void {
  for (let i = _particles.length - 1; i >= 0; i--) {
    const p = _particles[i]!;
    p.x += p.vx * deltaMs;
    p.y += p.vy * deltaMs;
    p.elapsedMs += deltaMs;
    if (p.elapsedMs >= p.maxLifeMs) {
      _particles.splice(i, 1);
    }
  }
}

/** Removes all live particles.  Called when a wave ends or enemies are cleared. */
export function clearEmpowerParticles(): void {
  _particles.length = 0;
}

/**
 * Renders all live empower particles onto `ctx` using a two-pass approach:
 *
 *   Pass 1 — Draw velocity-aligned capsule trails into a half-resolution
 *             offscreen canvas; stretch-composite it back (free blur).
 *   Pass 2 — Draw crisp thin cores directly on the main canvas.
 *
 * Both passes use additive blending ('lighter') for a glowing look.
 * Does nothing when there are no live particles.
 *
 * @param ctx      Main 2-D rendering context.
 * @param widthPx  Canvas logical width in pixels.
 * @param heightPx Canvas logical height in pixels.
 */
export function drawEmpowerParticles(
  ctx: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
): void {
  if (_particles.length === 0) return;

  const glowW = Math.ceil(widthPx  / 2);
  const glowH = Math.ceil(heightPx / 2);
  const glowCtx = _ensureGlowCanvas(glowW, glowH);
  const glowCanvas = _glowCanvas!;
  const scale = 0.5;

  // ── Pass 1: draw all trails to half-res offscreen glow canvas ──────────────

  glowCtx.clearRect(0, 0, glowW, glowH);
  glowCtx.save();
  glowCtx.scale(scale, scale);
  glowCtx.globalCompositeOperation = 'lighter';
  glowCtx.lineCap = 'round';

  for (let i = 0; i < _particles.length; i++) {
    const p = _particles[i]!;
    const lifeRatio = p.elapsedMs / p.maxLifeMs;
    const alpha = lifeRatio < FADE_START_RATIO
      ? 1.0
      : 1.0 - (lifeRatio - FADE_START_RATIO) / (1.0 - FADE_START_RATIO);
    if (alpha <= 0.01) continue;

    const speed    = Math.hypot(p.vx, p.vy);
    const invSpeed = speed > 0.001 ? 1 / speed : 0;
    const dirX     = p.vx * invSpeed;
    const dirY     = p.vy * invSpeed;
    const trailLen = BASE_TRAIL_LENGTH + speed * TRAIL_LENGTH_SCALE;
    const tx       = p.x - dirX * trailLen;
    const ty       = p.y - dirY * trailLen;

    const grad = glowCtx.createLinearGradient(tx, ty, p.x, p.y);
    grad.addColorStop(0,    'rgba(0,0,0,0)');
    grad.addColorStop(0.50, `rgba(255,150,30,${(0.50 * alpha).toFixed(3)})`);
    grad.addColorStop(0.82, `rgba(255,210,70,${(0.75 * alpha).toFixed(3)})`);
    grad.addColorStop(1,    `rgba(255,245,190,${(0.88 * alpha).toFixed(3)})`);

    glowCtx.beginPath();
    glowCtx.moveTo(tx, ty);
    glowCtx.lineTo(p.x, p.y);
    glowCtx.lineWidth    = 5;
    glowCtx.strokeStyle = grad;
    glowCtx.stroke();
  }

  glowCtx.restore();

  // ── Composite blurred glow back onto main canvas ───────────────────────────
  // Stretching the half-res canvas to full size provides a cheap, natural blur.

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.65;
  ctx.drawImage(glowCanvas, 0, 0, widthPx, heightPx);
  ctx.globalAlpha = 1;
  ctx.restore();

  // ── Pass 2: draw crisp trail cores on main canvas ──────────────────────────

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';

  for (let i = 0; i < _particles.length; i++) {
    const p = _particles[i]!;
    const lifeRatio = p.elapsedMs / p.maxLifeMs;
    const alpha = lifeRatio < FADE_START_RATIO
      ? 1.0
      : 1.0 - (lifeRatio - FADE_START_RATIO) / (1.0 - FADE_START_RATIO);
    if (alpha <= 0.01) continue;

    const speed    = Math.hypot(p.vx, p.vy);
    const invSpeed = speed > 0.001 ? 1 / speed : 0;
    const dirX     = p.vx * invSpeed;
    const dirY     = p.vy * invSpeed;
    const trailLen = BASE_TRAIL_LENGTH + speed * TRAIL_LENGTH_SCALE;
    const tx       = p.x - dirX * trailLen;
    const ty       = p.y - dirY * trailLen;

    const grad = ctx.createLinearGradient(tx, ty, p.x, p.y);
    grad.addColorStop(0,    'rgba(0,0,0,0)');
    grad.addColorStop(0.45, `rgba(255,130,20,${(0.30 * alpha).toFixed(3)})`);
    grad.addColorStop(0.78, `rgba(255,200,55,${(0.55 * alpha).toFixed(3)})`);
    grad.addColorStop(1,    `rgba(255,252,225,${(0.85 * alpha).toFixed(3)})`);

    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(p.x, p.y);
    ctx.lineWidth   = 1.5;
    ctx.strokeStyle = grad;
    ctx.stroke();

    // Bright radial head glow
    const headGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 3.5);
    headGrad.addColorStop(0, `rgba(255,255,235,${(0.90 * alpha).toFixed(3)})`);
    headGrad.addColorStop(1, 'rgba(255,190,60,0)');
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = headGrad;
    ctx.fill();
  }

  ctx.restore();
}
