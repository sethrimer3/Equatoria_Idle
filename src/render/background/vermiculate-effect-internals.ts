/**
 * vermiculate-effect-internals.ts — Constants, types, and pure helper functions
 * for VermiculateEffect.
 *
 * Imported by vermiculate-effect.ts; not part of the public API.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const TRACER_COUNT = 14;
export const MAX_SEGMENTS = 30;
export const SPEED = 28;
export const STEP_DISTANCE = 3.5;
export const RIGHT_ANGLE = Math.PI / 2;
export const CIRCULAR_TURN_RATE = 1.05;
export const ORTHO_TURN_INTERVAL_MIN = 0.9;
export const ORTHO_TURN_INTERVAL_MAX = 1.8;
export const BOUNCE_COOLDOWN = 0.09;
export const LINE_OPACITY = 0;
export const HEAD_DOT_OPACITY = 0.10;
export const CONTACT_MAX_OPACITY = 0.15;
export const CONTACT_LIFETIME = 1.1;
export const LINE_WIDTH = 1.2;
export const CONTACT_WIDTH = 2.2;
export const HEAD_DOT_SIZE = 10;
export const MIN_SEGMENT_LENGTH_SQ = 0.04;
/** Skip own newest segments when testing self-intersection. */
export const SELF_SKIP_SEGMENTS = 2;
export const TWO_PI = Math.PI * 2;
/** Number of prewarm steps so the effect starts with existing geometry. */
export const PREWARM_STEPS = 90;
export const PREWARM_DT = 0.025;

// ─── Palette ──────────────────────────────────────────────────────────────────

export interface PaletteColor {
  r: number;
  g: number;
  b: number;
}

export const PALETTE: readonly PaletteColor[] = [
  { r: 255, g: 255, b: 255 },   // white
  { r: 214, g: 224, b: 255 },   // cool blue-white
  { r: 255, g: 239, b: 214 },   // warm amber-white
];

// ─── Internal types ───────────────────────────────────────────────────────────

export interface TracerSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dx: number;
  dy: number;
  tracerId: number;
  lengthSq: number;
}

export interface TracerStyles {
  line: string;
  contact: string;
}

export type TracerMode = 'orthogonal' | 'circular';

export interface Tracer {
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

export interface ContactHighlight {
  x: number;
  y: number;
  life: number;
  color: PaletteColor;
}

export interface SegmentHit {
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

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function pickColor(): PaletteColor {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

export function randomOrthogonalAngle(): number {
  return Math.floor(Math.random() * 4) * RIGHT_ANGLE;
}

export function randomOrthogonalTurnInterval(): number {
  return ORTHO_TURN_INTERVAL_MIN + Math.random() * (ORTHO_TURN_INTERVAL_MAX - ORTHO_TURN_INTERVAL_MIN);
}

export function normalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized <= -Math.PI) normalized += TWO_PI;
  while (normalized > Math.PI) normalized -= TWO_PI;
  return normalized;
}

export function reflectAngle(angle: number, normalX: number, normalY: number): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const dot = dx * normalX + dy * normalY;
  const rx = dx - 2 * dot * normalX;
  const ry = dy - 2 * dot * normalY;
  return Math.atan2(ry, rx);
}

export function createDotSprite(r: number, g: number, b: number, size: number): HTMLCanvasElement {
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

export function buildStyles(color: PaletteColor): TracerStyles {
  return {
    line: `rgba(${color.r},${color.g},${color.b},${LINE_OPACITY.toFixed(3)})`,
    contact: `rgba(${color.r},${color.g},${color.b},${CONTACT_MAX_OPACITY.toFixed(3)})`,
  };
}

export function createTracerSegment(
  x1: number, y1: number, x2: number, y2: number, tracerId: number,
): TracerSegment {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return { x1, y1, x2, y2, dx, dy, tracerId, lengthSq: dx * dx + dy * dy };
}

export function getSegmentIntersection(a: TracerSegment, b: TracerSegment): Omit<SegmentHit, 'otherTracer' | 'otherSegment'> | null {
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
