/**
 * rpgFieldSpace.ts — Centralized RPG field-space abstraction.
 *
 * Provides a single authoritative description of the RPG world viewport at a
 * given canvas size and scale.  Every RPG subsystem (terrain, spawn, enemies,
 * effects, particles, lasers) should consume its bounds from here rather than
 * inventing its own assumptions about canvas/arena/logical size.
 *
 * Core idea:
 *   `computeRpgFieldSpace()` is called once per viewport resize.  The result is
 *   stored and threaded through draw/update contexts so all systems share the
 *   same bounds without re-deriving them independently.
 *
 * Bound hierarchy:
 *   paddedEffectBounds  (visibleBounds + effectPaddingWorld on each edge)
 *     └─ visibleBounds / activeBounds  (full canvas in world coords)
 *          └─ safeCoreBounds            (fixed 360×640 legacy gameplay area)
 *
 * Coordinate conventions:
 *   - World coordinates: the game's logical space; player/enemy positions live here.
 *   - Screen coordinates: CSS pixels relative to the canvas top-left corner.
 *   - Physical coordinates: screen × devicePixelRatio (used for canvas backing store).
 *
 * Scale invariant (checked by rpgFieldSpace.test.ts):
 *   The full 360×640 safe core must always fit inside the visible canvas.
 *   Scale = min(containerW / 360, containerH / 640, 1).
 *   Growing the canvas beyond the safe core reveals more world without zooming in.
 *   Shrinking the host reduces the scale so the full safe core remains visible.
 */

// ── Core types ────────────────────────────────────────────────────────────────

/** A 2-D point in either world or screen space. */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * An axis-aligned rectangle described by its four edges plus convenience
 * `width` / `height` fields (always non-negative).
 */
export interface WorldRect {
  left:   number;
  top:    number;
  right:  number;
  bottom: number;
  width:  number;
  height: number;
}

/**
 * One authoritative snapshot of the RPG world viewport computed after every
 * canvas resize.
 *
 * All RPG subsystems should read their bounds from here instead of using local
 * variables derived from canvas dimensions or old fixed constants.
 */
export interface RpgFieldSpace {
  // ── Canvas metrics ────────────────────────────────────────────
  /** Canvas CSS width (== container CSS width after doResize). */
  canvasCssW: number;
  /** Canvas CSS height (== container CSS height after doResize). */
  canvasCssH: number;
  /** Physical backing-store width in device pixels (canvasCssW × dpr, rounded). */
  backingW: number;
  /** Physical backing-store height in device pixels (canvasCssH × dpr, rounded). */
  backingH: number;
  /** Device pixel ratio at the time of computation. */
  dpr: number;

  // ── World-space scale ─────────────────────────────────────────
  /**
   * Stable pixels-per-world-unit scale.
   * Derived from `Math.min(canvasCssW / safeCoreWorldW, canvasCssH / safeCoreWorldH, 1)`.
   * This ensures the full safe core (360×640) always fits inside the canvas.
   * Growing the canvas beyond the safe core reveals more world without zooming in;
   * shrinking the host below safe-core size reduces scale so the full safe core
   * remains visible.
   */
  scale: number;

  /**
   * CSS-pixel offset from the canvas left edge to where world x=0 appears.
   * `offsetX = canvasCssW / 2 - cameraCenterX * scale`.
   * Positive means the world origin is right of the canvas left edge (which happens
   * on a reference-sized or narrow canvas).  Zero means the world origin is at the
   * canvas left edge.
   */
  offsetX: number;
  /**
   * CSS-pixel offset from the canvas top edge to where world y=0 appears.
   * `offsetY = canvasCssH / 2 - cameraCenterY * scale`.
   */
  offsetY: number;

  // ── Camera ────────────────────────────────────────────────────
  /** World-space X of the view centre (centre of `safeCoreBounds`). */
  cameraCenterX: number;
  /** World-space Y of the view centre (centre of `safeCoreBounds`). */
  cameraCenterY: number;

  // ── Bounds ────────────────────────────────────────────────────
  /**
   * The full world rectangle currently visible through the RPG camera.
   * Equals `canvasCssW / scale` wide and `canvasCssH / scale` tall, centred on the
   * camera.  Growing the canvas grows these bounds without changing `scale`.
   *
   * Use this as the primary reference for world rendering, culling, and
   * coordinate conversion.
   */
  visibleBounds: WorldRect;

  /**
   * The active playable / combat field. This is the largest rect with the
   * safe-core aspect ratio that fits inside `visibleBounds`, centred on the
   * camera. Larger hosts expand the arena until either width or height is
   * exhausted, while preserving the intended 9:16 level shape.
   */
  activeBounds: WorldRect;

  /**
   * The centred essential-gameplay / safe-composition region.
   * This is the fixed `safeCoreWorldW × safeCoreWorldH` area centred on the camera.
   * On the reference 360×640 phone this equals `visibleBounds`.
   * On wider/taller canvases it is a strict sub-rect of `visibleBounds`.
   *
   * Important gameplay elements should remain readable within this region, but
   * it must NOT be used to clip rendering, spawning, projectiles, or effects.
   */
  safeCoreBounds: WorldRect;

  /**
   * Bounds used for enemy spawn placement. Currently equals `activeBounds` so
   * enemies spawn inside the hard-clamped playable arena.
   */
  spawnBounds: WorldRect;

  /**
   * `visibleBounds` expanded by `effectPaddingWorld` on all four edges.
   * Use for: terrain background passes, caustics, particles, trails, lasers,
   * culling margins, and any effect that should extend slightly beyond the screen
   * edge to avoid hard pop-in at canvas borders.
   */
  paddedEffectBounds: WorldRect;

  // ── Coordinate helpers ────────────────────────────────────────
  /**
   * Convert a world-space position to CSS-pixel screen coordinates.
   * `screen.x = (world.x - visibleBounds.left) * scale`
   * Returns a NEW `Vec2` object each call; not suitable for hot paths.
   */
  worldToScreen(pos: Vec2): Vec2;

  /**
   * Convert a CSS-pixel screen position back to world coordinates.
   * `world.x = screen.x / scale + visibleBounds.left`
   * Returns a NEW `Vec2` object each call; not suitable for hot paths.
   */
  screenToWorld(pos: Vec2): Vec2;
}

// ── Helper functions ──────────────────────────────────────────────────────────

/**
 * Builds a `WorldRect` centred on `center` with the given dimensions.
 * `width` and `height` are clamped to be non-negative.
 */
export function rectCenteredOn(center: Vec2, width: number, height: number): WorldRect {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const left   = center.x - w / 2;
  const top    = center.y - h / 2;
  const right  = center.x + w / 2;
  const bottom = center.y + h / 2;
  return { left, top, right, bottom, width: w, height: h };
}

/**
 * Returns the largest rectangle with `targetW:targetH` aspect ratio that fits
 * inside `container`, centred on `center`.
 */
export function fitAspectRectInside(
  container: WorldRect,
  targetW: number,
  targetH: number,
  center: Vec2,
): WorldRect {
  const aspect = targetW > 0 && targetH > 0 ? targetW / targetH : 1;
  let width = container.width;
  let height = width / aspect;
  if (height > container.height) {
    height = container.height;
    width = height * aspect;
  }
  return rectCenteredOn(center, width, height);
}

/**
 * Expands a `WorldRect` by `padding` on all four edges.
 * `padding` may be negative to shrink the rect; `width`/`height` are clamped ≥ 0.
 */
export function padRect(rect: WorldRect, padding: number): WorldRect {
  const left   = rect.left   - padding;
  const top    = rect.top    - padding;
  const right  = rect.right  + padding;
  const bottom = rect.bottom + padding;
  return {
    left, top, right, bottom,
    width:  Math.max(0, right  - left),
    height: Math.max(0, bottom - top),
  };
}

/**
 * Derives the spawn bounds from the field's active/visible bounds.
 *
 * Current policy: spawns are placed inside `activeBounds` so enemies always
 * appear within the live gameplay field.
 *
 * Future: pass `{ ring: true }` to spawn just outside `visibleBounds` for
 * intentional off-screen approach spawns.
 */
export function makeSpawnBounds(_args: {
  visibleBounds:  WorldRect;
  activeBounds:   WorldRect;
  safeCoreBounds: WorldRect;
}): WorldRect {
  // Current policy: spawn inside the full active field.
  return _args.activeBounds;
}

// ── Main factory ──────────────────────────────────────────────────────────────

/**
 * Computes the stable RPG safe-core scale from container CSS dimensions.
 *
 * The scale is the largest value ≤ 1 that makes the full `RPG_LOGICAL_WIDTH ×
 * RPG_LOGICAL_HEIGHT` safe core fit inside the container:
 *
 * ```ts
 * Math.min(containerW / RPG_LOGICAL_WIDTH, containerH / RPG_LOGICAL_HEIGHT, 1)
 * ```
 *
 * Use this in `doResize()` and tests to ensure the formula cannot drift.
 */
export function computeRpgSafeCoreScale(
  containerW: number,
  containerH: number,
  safeCoreW: number,
  safeCoreH: number,
): number {
  return Math.min(containerW / safeCoreW, containerH / safeCoreH, 1);
}

/**
 * Computes a complete `RpgFieldSpace` snapshot from raw canvas metrics and the
 * stable scale.
 *
 * Called once per canvas resize (inside `doResize()`) and the result is stored
 * so subsystems can read it without recomputing it.
 *
 * @param args.stableScale
 *   The already-computed stable scale:
 *   `Math.min(canvasCssW / safeCoreWorldW, canvasCssH / safeCoreWorldH, 1)`.
 *   Must be passed in pre-computed so callers control exactly which scale
 *   formula is used; this function does NOT derive a scale independently.
 *
 * @param args.cameraCenter
 *   World-space centre of the camera view.  Typically the centre of the safe
 *   core: `{ x: safeCoreWorldW / 2, y: safeCoreWorldH / 2 }`.
 *
 * @param args.effectPaddingWorld
 *   Extra world-unit padding added to `visibleBounds` to form `paddedEffectBounds`.
 *   Defaults to 96 world units (≈ 1.5 × a typical enemy radius at scale 1).
 */
export function computeRpgFieldSpace(args: {
  canvasCssW:       number;
  canvasCssH:       number;
  backingW:         number;
  backingH:         number;
  dpr:              number;
  stableScale:      number;
  cameraCenter:     Vec2;
  safeCoreWorldW:   number;
  safeCoreWorldH:   number;
  effectPaddingWorld?: number;
}): RpgFieldSpace {
  const {
    canvasCssW, canvasCssH, backingW, backingH, dpr,
    stableScale, cameraCenter, safeCoreWorldW, safeCoreWorldH,
  } = args;
  const effectPadding = args.effectPaddingWorld ?? 96;

  // Guard against degenerate scale (e.g. during initial zero-size render).
  const scale = stableScale > 0 ? stableScale : 1;

  // ── Visible bounds ────────────────────────────────────────────
  const visibleWorldW = canvasCssW / scale;
  const visibleWorldH = canvasCssH / scale;
  const visibleBounds = rectCenteredOn(cameraCenter, visibleWorldW, visibleWorldH);

  // ── Safe core bounds ──────────────────────────────────────────
  const safeCoreBounds = rectCenteredOn(cameraCenter, safeCoreWorldW, safeCoreWorldH);

  // ── Active and spawn bounds ───────────────────────────────────
  // activeBounds = largest safe-core-ratio arena that fits in the visible world.
  const activeBounds = fitAspectRectInside(visibleBounds, safeCoreWorldW, safeCoreWorldH, cameraCenter);
  const spawnBounds  = makeSpawnBounds({ visibleBounds, activeBounds, safeCoreBounds });

  // ── Padded effect bounds ──────────────────────────────────────
  const paddedEffectBounds = padRect(visibleBounds, effectPadding);

  // ── CSS offsets (canvas-left → world-origin mapping) ─────────
  // offsetX = how many CSS pixels from the canvas left edge to world x=0.
  const offsetX = canvasCssW / 2 - cameraCenter.x * scale;
  const offsetY = canvasCssH / 2 - cameraCenter.y * scale;

  // ── Coordinate conversion helpers ────────────────────────────
  function worldToScreen(pos: Vec2): Vec2 {
    return {
      x: pos.x * scale + offsetX,
      y: pos.y * scale + offsetY,
    };
  }

  function screenToWorld(pos: Vec2): Vec2 {
    return {
      x: (pos.x - offsetX) / scale,
      y: (pos.y - offsetY) / scale,
    };
  }

  return {
    canvasCssW, canvasCssH, backingW, backingH, dpr,
    scale,
    offsetX, offsetY,
    cameraCenterX: cameraCenter.x,
    cameraCenterY: cameraCenter.y,
    visibleBounds,
    activeBounds,
    safeCoreBounds,
    spawnBounds,
    paddedEffectBounds,
    worldToScreen,
    screenToWorld,
  };
}
