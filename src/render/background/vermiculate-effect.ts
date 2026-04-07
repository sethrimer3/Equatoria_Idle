/**
 * VermiculateEffect
 *
 * Ambient background effect — a purely decorative, non-interactive layer that
 * renders behind the particle simulation.
 *
 * Two motion families coexist:
 *   1. Orthogonal tracers travel in straight segments and turn in 90° steps.
 *   2. Circular tracers constantly curve and rebound when touching trails.
 *
 * Art direction is contact-driven:
 *   • Base line bodies render at 0% opacity (invisible).
 *   • Leading dots render at 10% opacity.
 *   • Only contact zones fade in, topping out at 15% opacity where segments cross.
 *
 * Ported from Thero_Idle_TD / assets/playfield/render/VermiculateEffect.js
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const TRACER_COUNT = 14;
const MAX_SEGMENTS = 30;
const SPEED = 28;
const STEP_DISTANCE = 3.5;
const RIGHT_ANGLE = Math.PI / 2;
const CIRCULAR_TURN_RATE = 1.05;
const ORTHO_TURN_INTERVAL_MIN = 0.9;
const ORTHO_TURN_INTERVAL_MAX = 1.8;
const BOUNCE_COOLDOWN = 0.09;
const LINE_OPACITY = 0;
const HEAD_DOT_OPACITY = 0.10;
const CONTACT_MAX_OPACITY = 0.15;
const CONTACT_LIFETIME = 1.1;
const LINE_WIDTH = 1.2;
const CONTACT_WIDTH = 2.2;
const HEAD_DOT_SIZE = 10;
const MIN_SEGMENT_LENGTH_SQ = 0.04;
/** Skip own newest segments when testing self-intersection. */
const SELF_SKIP_SEGMENTS = 2;
const TWO_PI = Math.PI * 2;
/** Number of prewarm steps so the effect starts with existing geometry. */
const PREWARM_STEPS = 90;
const PREWARM_DT = 0.025;

// ─── Palette ──────────────────────────────────────────────────────────────────

interface PaletteColor {
  r: number;
  g: number;
  b: number;
}

const PALETTE: readonly PaletteColor[] = [
  { r: 255, g: 255, b: 255 },   // white
  { r: 214, g: 224, b: 255 },   // cool blue-white
  { r: 255, g: 239, b: 214 },   // warm amber-white
];

// ─── Internal types ───────────────────────────────────────────────────────────

interface TracerSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dx: number;
  dy: number;
  tracerId: number;
  lengthSq: number;
}

interface TracerStyles {
  line: string;
  contact: string;
}

type TracerMode = 'orthogonal' | 'circular';

interface Tracer {
  id: number;
  mode: TracerMode;
  color: PaletteColor;
  styles: TracerStyles;
  x: number;
  y: number;
  angle: number;
  segments: TracerSegment[];
  turnTimer: number;
  curveDirection: 1 | -1;
  bounceCooldown: number;
}

interface ContactHighlight {
  x: number;
  y: number;
  life: number;
  color: PaletteColor;
}

interface SegmentHit {
  x: number;
  y: number;
  normalX: number;
  normalY: number;
  t: number;
  u: number;
  otherTracer: Tracer;
  otherSegment: TracerSegment;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pickColor(): PaletteColor {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

function randomOrthogonalAngle(): number {
  return Math.floor(Math.random() * 4) * RIGHT_ANGLE;
}

function randomOrthogonalTurnInterval(): number {
  return ORTHO_TURN_INTERVAL_MIN + Math.random() * (ORTHO_TURN_INTERVAL_MAX - ORTHO_TURN_INTERVAL_MIN);
}

function normalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized <= -Math.PI) normalized += TWO_PI;
  while (normalized > Math.PI) normalized -= TWO_PI;
  return normalized;
}

function reflectAngle(angle: number, normalX: number, normalY: number): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const dot = dx * normalX + dy * normalY;
  const rx = dx - 2 * dot * normalX;
  const ry = dy - 2 * dot * normalY;
  return Math.atan2(ry, rx);
}

function createDotSprite(r: number, g: number, b: number, size: number): HTMLCanvasElement {
  const offscreen = document.createElement('canvas');
  offscreen.width = size;
  offscreen.height = size;
  const ctx = offscreen.getContext('2d')!;
  const radius = size / 2;
  const center = radius;

  const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.35, `rgba(${r},${g},${b},0.45)`);
  gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, TWO_PI);
  ctx.fill();
  return offscreen;
}

function buildStyles(color: PaletteColor): TracerStyles {
  return {
    line: `rgba(${color.r},${color.g},${color.b},${LINE_OPACITY.toFixed(3)})`,
    contact: `rgba(${color.r},${color.g},${color.b},${CONTACT_MAX_OPACITY.toFixed(3)})`,
  };
}

function createTracerSegment(
  x1: number, y1: number, x2: number, y2: number, tracerId: number,
): TracerSegment {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return { x1, y1, x2, y2, dx, dy, tracerId, lengthSq: dx * dx + dy * dy };
}

function getSegmentIntersection(a: TracerSegment, b: TracerSegment): Omit<SegmentHit, 'otherTracer' | 'otherSegment'> | null {
  const denominator = a.dx * b.dy - a.dy * b.dx;
  if (Math.abs(denominator) < 0.000001) return null;

  const qpx = b.x1 - a.x1;
  const qpy = b.y1 - a.y1;
  const t = (qpx * b.dy - qpy * b.dx) / denominator;
  const u = (qpx * a.dy - qpy * a.dx) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  const ix = a.x1 + a.dx * t;
  const iy = a.y1 + a.dy * t;
  const segLength = Math.hypot(b.dx, b.dy) || 1;
  const normalX = -b.dy / segLength;
  const normalY = b.dx / segLength;
  return { x: ix, y: iy, normalX, normalY, t, u };
}

// ─── Public interface ─────────────────────────────────────────────────────────

export interface VermiculateEffect {
  /** Advance the simulation and prepare for drawing. */
  update(now: number, width: number, height: number): void;
  /** Draw to the provided canvas context. */
  draw(ctx: CanvasRenderingContext2D): void;
  /** Reset the effect (e.g., on resize). */
  reset(): void;
  /** Clean up resources. */
  destroy(): void;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createVermiculateEffect(): VermiculateEffect {
  let tracers: Tracer[] = [];
  let contactHighlights: ContactHighlight[] = [];
  let lastTimestampMs: number | null = null;
  let viewWidth = 0;
  let viewHeight = 0;
  let dotSprites: Map<string, HTMLCanvasElement> | null = null;

  function ensureDotSprites(): void {
    if (dotSprites) return;
    dotSprites = new Map();
    for (const color of PALETTE) {
      dotSprites.set(`${color.r},${color.g},${color.b}`, createDotSprite(color.r, color.g, color.b, HEAD_DOT_SIZE));
    }
  }

  function createTracer(width: number, height: number, index: number): Tracer {
    const color = pickColor();
    const mode: TracerMode = index % 2 === 0 ? 'orthogonal' : 'circular';
    const angle = mode === 'orthogonal' ? randomOrthogonalAngle() : Math.random() * TWO_PI;
    return {
      id: index,
      mode,
      color,
      styles: buildStyles(color),
      x: Math.random() * width,
      y: Math.random() * height,
      angle,
      segments: [],
      turnTimer: randomOrthogonalTurnInterval(),
      curveDirection: Math.random() < 0.5 ? -1 : 1,
      bounceCooldown: 0,
    };
  }

  function initialize(width: number, height: number): void {
    tracers = [];
    contactHighlights = [];
    for (let i = 0; i < TRACER_COUNT; i++) {
      tracers.push(createTracer(width, height, i));
    }
    lastTimestampMs = null;
    // Prewarm so the effect starts with existing geometry.
    for (let step = 0; step < PREWARM_STEPS; step++) {
      simulate(PREWARM_DT, width, height);
    }
  }

  function ageHighlights(dt: number): void {
    for (let i = contactHighlights.length - 1; i >= 0; i--) {
      contactHighlights[i].life -= dt;
      if (contactHighlights[i].life <= 0) {
        contactHighlights.splice(i, 1);
      }
    }
  }

  function registerContact(x: number, y: number, colorA: PaletteColor, colorB: PaletteColor): void {
    const blend: PaletteColor = {
      r: Math.round((colorA.r + colorB.r + 255) / 3),
      g: Math.round((colorA.g + colorB.g + 255) / 3),
      b: Math.round((colorA.b + colorB.b + 255) / 3),
    };
    contactHighlights.push({ x, y, life: CONTACT_LIFETIME, color: blend });
  }

  function detectSegmentHit(tracer: Tracer, segment: TracerSegment): SegmentHit | null {
    for (const other of tracers) {
      const isSelf = other.id === tracer.id;
      const limit = other.segments.length - (isSelf ? SELF_SKIP_SEGMENTS : 0);
      for (let i = 0; i < limit; i++) {
        const candidate = other.segments[i];
        if (!candidate || candidate.lengthSq < MIN_SEGMENT_LENGTH_SQ) continue;

        const hit = getSegmentIntersection(segment, candidate);
        if (!hit) continue;

        // Ignore immediate self-contact at the new segment origin.
        if (isSelf && hit.t < 0.08) continue;

        return { ...hit, otherTracer: other, otherSegment: candidate };
      }
    }
    return null;
  }

  function advanceTracer(tracer: Tracer, dt: number, width: number, height: number): void {
    tracer.bounceCooldown = Math.max(0, tracer.bounceCooldown - dt);

    if (tracer.mode === 'orthogonal') {
      tracer.turnTimer -= dt;
      if (tracer.turnTimer <= 0) {
        tracer.angle += (Math.random() < 0.5 ? -1 : 1) * RIGHT_ANGLE;
        tracer.turnTimer = randomOrthogonalTurnInterval();
      }
    } else {
      tracer.angle += tracer.curveDirection * CIRCULAR_TURN_RATE * dt;
    }

    const totalDistance = SPEED * dt;
    const steps = Math.max(1, Math.ceil(totalDistance / STEP_DISTANCE));
    const microDt = dt / steps;

    for (let step = 0; step < steps; step++) {
      if (tracer.mode === 'circular') {
        tracer.angle += tracer.curveDirection * CIRCULAR_TURN_RATE * microDt;
      }

      const startX = tracer.x;
      const startY = tracer.y;
      const distance = SPEED * microDt;
      const nextX = startX + Math.cos(tracer.angle) * distance;
      const nextY = startY + Math.sin(tracer.angle) * distance;
      const segment = createTracerSegment(startX, startY, nextX, nextY, tracer.id);

      if (segment.lengthSq < MIN_SEGMENT_LENGTH_SQ) {
        tracer.x = nextX;
        tracer.y = nextY;
        continue;
      }

      let bounced = false;
      if (tracer.bounceCooldown <= 0) {
        const hit = detectSegmentHit(tracer, segment);
        if (hit) {
          registerContact(hit.x, hit.y, tracer.color, hit.otherTracer.color);
          tracer.angle = reflectAngle(tracer.angle, hit.normalX, hit.normalY);
          tracer.angle = normalizeAngle(tracer.angle);
          tracer.bounceCooldown = BOUNCE_COOLDOWN;
          tracer.x = hit.x + Math.cos(tracer.angle) * 1.4;
          tracer.y = hit.y + Math.sin(tracer.angle) * 1.4;
          bounced = true;
        }
      }

      if (bounced) continue;

      tracer.x = nextX;
      tracer.y = nextY;

      if (tracer.x <= 0 || tracer.x >= width) {
        tracer.angle = reflectAngle(tracer.angle, tracer.x <= 0 ? 1 : -1, 0);
        tracer.x = clamp(tracer.x, 0, width);
      }
      if (tracer.y <= 0 || tracer.y >= height) {
        tracer.angle = reflectAngle(tracer.angle, 0, tracer.y <= 0 ? 1 : -1);
        tracer.y = clamp(tracer.y, 0, height);
      }
      tracer.x = clamp(tracer.x, 0, width);
      tracer.y = clamp(tracer.y, 0, height);

      const committed = createTracerSegment(startX, startY, tracer.x, tracer.y, tracer.id);
      if (committed.lengthSq >= MIN_SEGMENT_LENGTH_SQ) {
        tracer.segments.push(committed);
        if (tracer.segments.length > MAX_SEGMENTS) {
          tracer.segments.shift();
        }
      }
    }
  }

  function simulate(dt: number, width: number, height: number): void {
    ageHighlights(dt);
    for (const tracer of tracers) {
      advanceTracer(tracer, dt, width, height);
    }
  }

  // ── Public methods ──────────────────────────────────────────────

  function update(now: number, width: number, height: number): void {
    const resized = tracers.length === 0 || Math.abs(width - viewWidth) > 100 || Math.abs(height - viewHeight) > 100;
    viewWidth = width;
    viewHeight = height;
    if (resized) {
      initialize(width, height);
    }
    ensureDotSprites();

    const dt = lastTimestampMs === null ? 0.016 : Math.min((now - lastTimestampMs) / 1000, 0.05);
    lastTimestampMs = now;
    simulate(dt, width, height);
  }

  function draw(ctx: CanvasRenderingContext2D): void {
    if (!tracers.length) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Base lines exist geometrically but their body is invisible (LINE_OPACITY = 0).
    for (const tracer of tracers) {
      if (!tracer.segments.length) continue;
      ctx.beginPath();
      ctx.lineWidth = LINE_WIDTH;
      ctx.strokeStyle = tracer.styles.line;
      ctx.moveTo(tracer.segments[0].x1, tracer.segments[0].y1);
      for (const seg of tracer.segments) {
        ctx.lineTo(seg.x2, seg.y2);
      }
      ctx.stroke();
    }

    // Contact highlights are the only revealed portions.
    for (const highlight of contactHighlights) {
      const alpha = CONTACT_MAX_OPACITY * clamp(highlight.life / CONTACT_LIFETIME, 0, 1);
      const { r, g, b } = highlight.color;
      const grad = ctx.createRadialGradient(highlight.x, highlight.y, 0, highlight.x, highlight.y, 18);
      grad.addColorStop(0, `rgba(${r},${g},${b},${alpha.toFixed(3)})`);
      grad.addColorStop(0.55, `rgba(${r},${g},${b},${(alpha * 0.45).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(highlight.x, highlight.y, 18, 0, TWO_PI);
      ctx.fill();
    }

    // Short visible fragments near contact points reinforce that lines fade in there.
    for (const tracer of tracers) {
      ctx.strokeStyle = tracer.styles.contact;
      ctx.lineWidth = CONTACT_WIDTH;
      for (const seg of tracer.segments) {
        for (const highlight of contactHighlights) {
          const minX = Math.min(seg.x1, seg.x2) - 8;
          const maxX = Math.max(seg.x1, seg.x2) + 8;
          const minY = Math.min(seg.y1, seg.y2) - 8;
          const maxY = Math.max(seg.y1, seg.y2) + 8;
          if (highlight.x < minX || highlight.x > maxX || highlight.y < minY || highlight.y > maxY) {
            continue;
          }
          ctx.globalAlpha = clamp(highlight.life / CONTACT_LIFETIME, 0, 1);
          ctx.beginPath();
          ctx.moveTo(seg.x1, seg.y1);
          ctx.lineTo(seg.x2, seg.y2);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;

    // Head dots are faintly visible at all times.
    for (const tracer of tracers) {
      const key = `${tracer.color.r},${tracer.color.g},${tracer.color.b}`;
      const sprite = dotSprites?.get(key);
      if (!sprite) continue;
      const half = HEAD_DOT_SIZE / 2;
      ctx.save();
      ctx.globalAlpha = HEAD_DOT_OPACITY;
      ctx.drawImage(sprite, tracer.x - half, tracer.y - half);
      ctx.restore();
    }

    ctx.restore();
  }

  function reset(): void {
    tracers = [];
    contactHighlights = [];
    lastTimestampMs = null;
  }

  function destroy(): void {
    reset();
    dotSprites = null;
  }

  return { update, draw, reset, destroy };
}
