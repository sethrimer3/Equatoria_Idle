/**
 * caustics-texture.ts — Procedural caustic-light texture generator and cache.
 *
 * Generates two distinct tileable caustic textures per quality tier using
 * Voronoi cell-boundary (Worley F2−F1) noise, baked once into ImageData.
 * Per-frame work is limited to drawing the cached canvases with
 * CanvasPattern transforms — no putImageData or pixel loops at runtime.
 *
 * Visual model:
 *   Real underwater caustics are bright where refracted light rays converge.
 *   Convergence zones trace the Voronoi cell boundaries of a random point
 *   network — thin bright filaments, bright knots at intersections, dark
 *   cell interiors.  Worley F2−F1 distance reproduces this naturally:
 *   the field is zero at Voronoi edges and positive in cell interiors.
 *
 *   Two-component brightness:
 *     sharp = exp(−edge² · SHARP_K)   ← thin bright filament core
 *     glow  = exp(−edge² · GLOW_K)    ← soft aqua halo
 *     total = min(1, sharp + glow · GLOW_WEIGHT)
 *
 *   Color interpolates from cool white-blue (on-filament) to aqua (glow halo).
 *
 * Tile properties:
 *   High: 256 × 256 px, 25 seeds — cell size ≈ 51 px
 *   Low:  128 × 128 px, 16 seeds — cell size ≈ 32 px
 *   Seamlessly tileable via periodic (toroidal) boundary conditions.
 *
 *   Two variants (A and B) are generated with different RNG seeds, giving
 *   distinct Voronoi topologies.  caustics-overlay.ts assigns each layer to
 *   a different variant, reducing the visible tiling / wallpaper effect.
 *
 * Performance:
 *   putImageData is called once per tile at generation time, never per frame.
 *   Tile generation: ~5–30 ms per tile (amortised one-time cost at zone entry).
 *   prewarmCausticsTextures() pre-generates all four tiles before the first
 *   Caustics frame to eliminate first-entry stutter.
 *   Module-level cache; regenerates only when invalidated explicitly.
 */

// ── Tile dimensions ────────────────────────────────────────────────────────────

/** Side length of the high-quality caustic tile in pixels. */
const _TILE_HIGH = 256;

/** Side length of the low-graphics caustic tile in pixels. */
const _TILE_LOW  = 128;

// ── Seed counts ────────────────────────────────────────────────────────────────

/**
 * Number of Voronoi seeds for the high-quality tile.
 * `ceil(sqrt(25)) = 5`, so a 5 × 5 jittered grid is used (25 seeds total).
 */
const _SEEDS_HIGH = 25;

/**
 * Number of Voronoi seeds for the low-graphics tile.
 * `ceil(sqrt(16)) = 4`, so a 4 × 4 jittered grid is used (16 seeds total).
 */
const _SEEDS_LOW  = 16;

// ── RNG seeds for the two tile variants ───────────────────────────────────────

/**
 * Seed for the first (A) tile variant.
 * Original deterministic seed — produces the primary caustic network topology.
 */
const _SEED_A = 0x9E3779B9 >>> 0;

/**
 * Seed for the second (B) tile variant.
 * Different Voronoi topology so Layer B looks visually distinct from A/C.
 * Chosen to avoid any correlation with _SEED_A (different bit pattern).
 */
const _SEED_B = 0xB5AD4ECE >>> 0;

// ── Brightness formula constants (pixel-space) ────────────────────────────────

/**
 * Sharpness exponent for the thin filament core.
 * In pixel space for a 256-px tile: half-brightness at edge ≈ 1.2 px.
 * Produces a ~2–3 px wide bright core line.
 */
const _SHARP_K = 0.50;

/**
 * Spread exponent for the soft glow halo.
 * In pixel space: half-brightness at edge ≈ 5.3 px.
 * Produces a soft 10–15 px aqua halo around each filament.
 */
const _GLOW_K = 0.025;

/** Weight applied to the glow component relative to the sharp core. */
const _GLOW_WEIGHT = 0.32;

/**
 * Maximum per-pixel alpha (0–255) for caustic filaments.
 * Keeps individual tiles translucent; full brightness only at knot intersections
 * where two or more screen-blended layers overlap.
 */
const _ALPHA_MAX = 190;

// ── Module-level cache ────────────────────────────────────────────────────────
// Variant A: primary tile — used for Layers A and C.
// Variant B: alternate Voronoi topology — used for Layer B to break tiling.

let _tileHighA: HTMLCanvasElement | null = null;
let _tileLowA:  HTMLCanvasElement | null = null;
let _tileHighB: HTMLCanvasElement | null = null;
let _tileLowB:  HTMLCanvasElement | null = null;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the primary (variant A) cached caustic tile, generating it on first
 * access.  The tile is seamlessly tileable (periodic boundary conditions).
 *
 * @param lowGraphics  When true, returns the smaller, cheaper 128×128 tile.
 */
export function getCausticsTextureTile(lowGraphics: boolean): HTMLCanvasElement {
  if (lowGraphics) {
    if (!_tileLowA) _tileLowA = _generateTile(_TILE_LOW, _SEEDS_LOW, _SEED_A);
    return _tileLowA;
  }
  if (!_tileHighA) _tileHighA = _generateTile(_TILE_HIGH, _SEEDS_HIGH, _SEED_A);
  return _tileHighA;
}

/**
 * Returns the alternate (variant B) cached caustic tile.
 * Variant B uses a different Voronoi seed, giving a distinct cellular topology
 * so Layer B looks different from Layer A/C when pattern-blended.
 *
 * @param lowGraphics  When true, returns the smaller, cheaper 128×128 tile.
 */
export function getCausticsTextureTile2(lowGraphics: boolean): HTMLCanvasElement {
  if (lowGraphics) {
    if (!_tileLowB) _tileLowB = _generateTile(_TILE_LOW, _SEEDS_LOW, _SEED_B);
    return _tileLowB;
  }
  if (!_tileHighB) _tileHighB = _generateTile(_TILE_HIGH, _SEEDS_HIGH, _SEED_B);
  return _tileHighB;
}

/**
 * Pre-generates all four caustic tile canvases (high + low, variant A + B)
 * so that the first Caustics render frame does not stutter.
 *
 * Call before the first Caustics zone render — either on zone switch into
 * Caustics, or early in the RPG renderer init path via a deferred callback.
 * Safe to call multiple times; already-cached tiles are not regenerated.
 */
export function prewarmCausticsTextures(): void {
  if (!_tileHighA) _tileHighA = _generateTile(_TILE_HIGH, _SEEDS_HIGH, _SEED_A);
  if (!_tileLowA)  _tileLowA  = _generateTile(_TILE_LOW,  _SEEDS_LOW,  _SEED_A);
  if (!_tileHighB) _tileHighB = _generateTile(_TILE_HIGH, _SEEDS_HIGH, _SEED_B);
  if (!_tileLowB)  _tileLowB  = _generateTile(_TILE_LOW,  _SEEDS_LOW,  _SEED_B);
}

/**
 * Discards all cached tiles so they will be regenerated on next access.
 * Call if quality settings change at runtime.
 */
export function invalidateCausticsTextureCache(): void {
  _tileHighA = null;
  _tileLowA  = null;
  _tileHighB = null;
  _tileLowB  = null;
}

// ── Tile generation ───────────────────────────────────────────────────────────

/**
 * Generates a `size × size` caustic tile using the Worley F2−F1 distance field.
 *
 * Algorithm:
 *   1. Place `nSeeds` control points on a jittered grid within [0, size).
 *   2. For each pixel, find the two nearest control points with wrapped
 *      (toroidal) distance — ensuring seamless tiling.
 *   3. edge = F2 − F1 (zero at Voronoi boundaries, positive in interiors).
 *   4. Composite sharp core + soft glow → total brightness.
 *   5. Color shifts from aqua (glow) to cool white-blue (filament core).
 *
 * @param seed  Initial xorshift32 state; different seeds produce distinct
 *              Voronoi topologies.  Must be a non-zero 32-bit unsigned integer.
 */
function _generateTile(size: number, nSeeds: number, seed: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // ── Seed placement: jittered grid ───────────────────────────────────────
  // ceil(sqrt(nSeeds)) × ceil(sqrt(nSeeds)) grid; one seed per cell with
  // uniform jitter within (0.15, 0.85) relative to each cell's bounds.
  // Deterministic RNG (xorshift32) seeded to a fixed constant so the tile
  // appearance is stable across sessions.
  const gridN    = Math.ceil(Math.sqrt(nSeeds));
  const cellPx   = size / gridN;
  const total    = gridN * gridN;
  const sx       = new Float32Array(total);
  const sy       = new Float32Array(total);

  let rngState = seed >>> 0;
  const _rng = (): number => {
    rngState ^= rngState << 13;
    rngState ^= rngState >>> 17;
    rngState ^= rngState << 5;
    return (rngState >>> 0) / 4294967296;
  };

  for (let gy = 0; gy < gridN; gy++) {
    for (let gx = 0; gx < gridN; gx++) {
      const i = gy * gridN + gx;
      sx[i] = (gx + 0.15 + _rng() * 0.70) * cellPx;
      sy[i] = (gy + 0.15 + _rng() * 0.70) * cellPx;
    }
  }

  // ── Pixel loop: Worley F2−F1 ────────────────────────────────────────────
  const imgData = ctx.createImageData(size, size);
  const data    = imgData.data;
  const half    = size * 0.5;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // Find the two nearest seed distances using squared-distance comparisons
      // to avoid per-seed sqrt calls.
      let d1sq = 1e18;
      let d2sq = 1e18;

      for (let s = 0; s < total; s++) {
        // Toroidal (wrapped) distance for seamless tiling.
        let dx = px - sx[s];
        let dy = py - sy[s];
        if      (dx >  half) dx -= size;
        else if (dx < -half) dx += size;
        if      (dy >  half) dy -= size;
        else if (dy < -half) dy += size;
        const dsq = dx * dx + dy * dy;
        if (dsq < d1sq) { d2sq = d1sq; d1sq = dsq; }
        else if (dsq < d2sq) { d2sq = dsq; }
      }

      // edge = F2 − F1 in pixels (0 at Voronoi boundary).
      const edge   = Math.sqrt(d2sq) - Math.sqrt(d1sq);
      const edgeSq = edge * edge;

      const sharp = Math.exp(-edgeSq * _SHARP_K);
      const glow  = Math.exp(-edgeSq * _GLOW_K);
      const total_ = Math.min(1.0, sharp + glow * _GLOW_WEIGHT);

      if (total_ < 0.004) {
        // Fully transparent — skip to avoid touching alpha channel.
        // (ImageData is zero-initialised so alpha is already 0.)
        continue;
      }

      // Color interpolates: aqua (glow) → cool white-blue (filament core).
      const tCore = sharp / (total_ + 0.001);   // 0 = glow, 1 = filament
      const r = (140 + tCore * 100 + 0.5) | 0;  // 140..240
      const g = (200 + tCore * 45  + 0.5) | 0;  // 200..245
      // b = 255 always

      const a   = (total_ * _ALPHA_MAX + 0.5) | 0;
      const idx = (py * size + px) * 4;
      data[idx]     = r;
      data[idx + 1] = g;
      data[idx + 2] = 255;
      data[idx + 3] = a;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}
