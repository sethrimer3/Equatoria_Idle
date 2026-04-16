/**
 * rpg-render.ts — RPG tab rendering system.
 *
 * Manages an independent low-resolution canvas with:
 *   - A single controllable sand mote (3×3 pixels, internal resolution)
 *   - A virtual touchscreen joystick (appears at the player's tap location)
 *   - An exaggerated glowing comet trail behind the mote
 *
 * The canvas matches the same internal resolution strategy used by the
 * main game canvas (INTERNAL_WIDTH = 320 logical pixels, scaled up via CSS).
 */

// ─── Constants ────────────────────────────────────────────────────

/** Internal (game-world) width in logical pixels, matching the main canvas. */
const INTERNAL_WIDTH = 320;

/** Trail ring-buffer capacity — much longer than normal large-mote trails (10). */
const RPG_TRAIL_CAPACITY = 60;

/** Maximum RPG mote speed (logical pixels per normalised frame). */
const MAX_RPG_SPEED = 3.0;

/** Radius of the joystick outer ring in internal canvas pixels. */
const JOYSTICK_OUTER_RADIUS = 28;

/** Radius of the joystick thumb knob in internal canvas pixels. */
const JOYSTICK_THUMB_RADIUS = 12;

/** Velocity decay factor applied each frame when the joystick is released. */
const RPG_VELOCITY_DAMPING = 0.88;

/** Visual size of the RPG mote in internal canvas pixels. */
const RPG_MOTE_SIZE = 3;

/** Sand tier color. */
const RPG_MOTE_COLOR = '#ffd764';

/** Sand tier glow color. */
const RPG_MOTE_GLOW = '#ffe599';

/** Speed threshold below which trail rendering is skipped (avoids phantom glows). */
const TRAIL_SPEED_THRESHOLD = 0.15;

// ─── Types ────────────────────────────────────────────────────────

interface RpgMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Ring-buffer of past positions. */
  trailX: Float64Array;
  trailY: Float64Array;
  trailHead: number;
  trailCount: number;
}

interface RpgJoystick {
  isActive: boolean;
  pointerId: number;
  /** Fixed anchor position of the joystick base (set on pointerdown). */
  baseX: number;
  baseY: number;
  /** Current thumb position (follows the pointer, clamped to JOYSTICK_OUTER_RADIUS). */
  thumbX: number;
  thumbY: number;
}

// ─── Public interface ─────────────────────────────────────────────

export interface RpgRender {
  /** The RPG canvas element to mount in the DOM. */
  canvas: HTMLCanvasElement;
  /** Update physics and redraw. Call from the main game loop each frame. */
  update(deltaMs: number): void;
  /** Recalculate internal dimensions to match the given container. */
  resize(container: HTMLElement): void;
}

// ─── Factory ──────────────────────────────────────────────────────

export function createRpgRender(container: HTMLElement): RpgRender {
  const canvas = document.createElement('canvas');
  canvas.id = 'rpg-canvas';
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.imageRendering = 'pixelated';
  // Disable native touch pan/zoom so pointer events are captured properly.
  canvas.style.touchAction = 'none';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d')!;
  let widthPx = INTERNAL_WIDTH;
  let heightPx = 0;

  function doResize(cont: HTMLElement): void {
    const containerW = cont.clientWidth;
    const containerH = cont.clientHeight;
    const aspect = containerH > 0 && containerW > 0 ? containerH / containerW : 1;
    widthPx = INTERNAL_WIDTH;
    heightPx = Math.round(INTERNAL_WIDTH * aspect);
    canvas.width = widthPx;
    canvas.height = heightPx;
  }
  doResize(container);

  const mote: RpgMote = {
    x: widthPx / 2,
    y: heightPx / 2,
    vx: 0,
    vy: 0,
    trailX: new Float64Array(RPG_TRAIL_CAPACITY),
    trailY: new Float64Array(RPG_TRAIL_CAPACITY),
    trailHead: 0,
    trailCount: 0,
  };

  const joystick: RpgJoystick = {
    isActive: false,
    pointerId: -1,
    baseX: 0,
    baseY: 0,
    thumbX: 0,
    thumbY: 0,
  };

  // ── Coordinate conversion ──────────────────────────────────────

  function toCanvasCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? widthPx / rect.width : 1;
    const scaleY = rect.height > 0 ? heightPx / rect.height : 1;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  // ── Pointer events ────────────────────────────────────────────

  canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    canvas.setPointerCapture(e.pointerId);
    const pos = toCanvasCoords(e.clientX, e.clientY);
    joystick.isActive = true;
    joystick.pointerId = e.pointerId;
    joystick.baseX = pos.x;
    joystick.baseY = pos.y;
    joystick.thumbX = pos.x;
    joystick.thumbY = pos.y;
  }, { passive: false });

  canvas.addEventListener('pointermove', (e: PointerEvent) => {
    if (!joystick.isActive || e.pointerId !== joystick.pointerId) return;
    e.preventDefault();
    const pos = toCanvasCoords(e.clientX, e.clientY);
    const dx = pos.x - joystick.baseX;
    const dy = pos.y - joystick.baseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > JOYSTICK_OUTER_RADIUS) {
      // Clamp thumb to outer ring
      joystick.thumbX = joystick.baseX + (dx / dist) * JOYSTICK_OUTER_RADIUS;
      joystick.thumbY = joystick.baseY + (dy / dist) * JOYSTICK_OUTER_RADIUS;
    } else {
      joystick.thumbX = pos.x;
      joystick.thumbY = pos.y;
    }
  }, { passive: false });

  function endJoystick(pointerId: number): void {
    if (pointerId !== joystick.pointerId) return;
    joystick.isActive = false;
    joystick.pointerId = -1;
  }

  canvas.addEventListener('pointerup', (e: PointerEvent) => endJoystick(e.pointerId));
  canvas.addEventListener('pointercancel', (e: PointerEvent) => endJoystick(e.pointerId));

  // ── Physics ───────────────────────────────────────────────────

  function updatePhysics(deltaMs: number): void {
    // Normalise to 60 fps; cap at 3 frames to avoid spiral-of-death on slow frames.
    const dt = Math.min(deltaMs / 16.667, 3);

    if (joystick.isActive) {
      const dx = joystick.thumbX - joystick.baseX;
      const dy = joystick.thumbY - joystick.baseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.5) {
        const speed = (dist / JOYSTICK_OUTER_RADIUS) * MAX_RPG_SPEED;
        mote.vx = (dx / dist) * speed;
        mote.vy = (dy / dist) * speed;
      } else {
        mote.vx *= RPG_VELOCITY_DAMPING;
        mote.vy *= RPG_VELOCITY_DAMPING;
      }
    } else {
      mote.vx *= RPG_VELOCITY_DAMPING;
      mote.vy *= RPG_VELOCITY_DAMPING;
    }

    mote.x += mote.vx * dt;
    mote.y += mote.vy * dt;

    // Clamp to canvas bounds and stop velocity against the wall
    const half = RPG_MOTE_SIZE / 2;
    if (mote.x < half) { mote.x = half; mote.vx = 0; }
    if (mote.x > widthPx - half) { mote.x = widthPx - half; mote.vx = 0; }
    if (mote.y < half) { mote.y = half; mote.vy = 0; }
    if (mote.y > heightPx - half) { mote.y = heightPx - half; mote.vy = 0; }

    // Record trail position every frame
    mote.trailX[mote.trailHead] = mote.x;
    mote.trailY[mote.trailHead] = mote.y;
    mote.trailHead = (mote.trailHead + 1) % RPG_TRAIL_CAPACITY;
    if (mote.trailCount < RPG_TRAIL_CAPACITY) mote.trailCount++;
  }

  // ── Draw ──────────────────────────────────────────────────────

  function draw(): void {
    ctx.clearRect(0, 0, widthPx, heightPx);

    // Dark background matching the main game background color.
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, widthPx, heightPx);

    const speed = Math.sqrt(mote.vx * mote.vx + mote.vy * mote.vy);
    const isMoving = speed > TRAIL_SPEED_THRESHOLD;

    // ── Comet trail ──
    if (isMoving && mote.trailCount >= 2) {
      const trailLen = mote.trailCount;
      for (let i = 0; i < trailLen; i++) {
        // t = 0 → oldest (tail), t = 1 → newest (head)
        const t = i / trailLen;

        // Ring-buffer index for position i (oldest first)
        const bufIdx = (mote.trailHead - trailLen + i + RPG_TRAIL_CAPACITY) % RPG_TRAIL_CAPACITY;
        const tx = mote.trailX[bufIdx];
        const ty = mote.trailY[bufIdx];

        const trailSize = RPG_MOTE_SIZE * t * 1.3;
        if (trailSize < 0.3) continue;

        const half = trailSize / 2;

        // Glow halo
        ctx.globalAlpha = t * 0.45;
        ctx.shadowBlur = trailSize * 6;
        ctx.shadowColor = RPG_MOTE_GLOW;
        ctx.fillStyle = RPG_MOTE_GLOW;
        const glowHalf = half * 2.2;
        ctx.fillRect(
          Math.floor(tx - glowHalf),
          Math.floor(ty - glowHalf),
          Math.ceil(glowHalf * 2),
          Math.ceil(glowHalf * 2),
        );
        ctx.shadowBlur = 0;

        // Core trail pixel
        ctx.globalAlpha = t * 0.7;
        ctx.fillStyle = RPG_MOTE_COLOR;
        ctx.fillRect(
          Math.floor(tx - half),
          Math.floor(ty - half),
          Math.ceil(trailSize),
          Math.ceil(trailSize),
        );
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }

    // ── Sand mote ──
    const moteHalf = RPG_MOTE_SIZE / 2;
    ctx.shadowBlur = RPG_MOTE_SIZE * 5;
    ctx.shadowColor = RPG_MOTE_GLOW;
    ctx.fillStyle = RPG_MOTE_COLOR;
    ctx.fillRect(
      Math.floor(mote.x - moteHalf),
      Math.floor(mote.y - moteHalf),
      RPG_MOTE_SIZE,
      RPG_MOTE_SIZE,
    );
    ctx.shadowBlur = 0;

    // ── Virtual joystick ──
    if (joystick.isActive) {
      ctx.save();

      // Outer ring
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#c9a84c';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(joystick.baseX, joystick.baseY, JOYSTICK_OUTER_RADIUS, 0, Math.PI * 2);
      ctx.stroke();

      // Thumb knob
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#c9a84c';
      ctx.shadowBlur = JOYSTICK_THUMB_RADIUS * 2;
      ctx.shadowColor = 'rgba(201, 168, 76, 0.6)';
      ctx.beginPath();
      ctx.arc(joystick.thumbX, joystick.thumbY, JOYSTICK_THUMB_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.restore();
    }
  }

  // ── Public interface ──────────────────────────────────────────

  return {
    canvas,
    update(deltaMs: number): void {
      updatePhysics(deltaMs);
      draw();
    },
    resize(cont: HTMLElement): void {
      doResize(cont);
      // Re-centre mote if it is now out of bounds after resize
      const half = RPG_MOTE_SIZE / 2;
      mote.x = Math.max(half, Math.min(widthPx - half, mote.x));
      mote.y = Math.max(half, Math.min(heightPx - half, mote.y));
    },
  };
}
