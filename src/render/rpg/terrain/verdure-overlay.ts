/**
 * verdure-overlay.ts — Animated plant/vine visual overlay for the Verdure RPG zone.
 *
 * Renders when activeZoneId === 'verdure':
 *   1. Organic background tint      (dark forest-green / deep-teal / bioluminescent wash)
 *   2. Procedural floor decoration  (moss, grass tufts, sprouts, tiny flowers — low alpha)
 *   3. Procedural vines             (segment chains from arena edges, with sway + player disturbance)
 *   4. Drifting pollen/spore motes  (high-graphics only; low density, decorative)
 *
 * Design principles:
 *   - No per-frame object allocations: vine bend state lives in module-level Float32Arrays.
 *   - Vine geometry (segment angles/lengths) is pre-computed once at module import.
 *   - Vine bend physics uses a simple spring model: disturbance impulse → spring-damped return.
 *   - Floor plants and pollen are fully time-based (no mutable state beyond vine bends).
 *   - All visual parameters are pre-baked constants to avoid RNG on the hot path.
 *
 * Draw order expected by rpg-render-draw.ts:
 *   drawVerdureBackground()    — immediately after the initial background fill, before fluid/terrain
 *   drawVerdureFloorEffects()  — after terrain rendering, before enemies/player
 */

// ── Pre-baked seed data ────────────────────────────────────────────────────────

/**
 * Twenty deterministic fractional values used for vine/plant placement,
 * angle variation, phase offsets, and size variation.
 */
const _SEEDS: readonly number[] = [
  0.137, 0.462, 0.718, 0.293, 0.851,
  0.574, 0.039, 0.926, 0.381, 0.665,
  0.208, 0.743, 0.517, 0.084, 0.953,
  0.671, 0.342, 0.119, 0.889, 0.456,
];

/**
 * Pollen / spore particle data table — one entry per particle.
 * Layout: [baseXFrac, baseYFrac, xAmpPx, yAmpPx, xFreq, yFreq, radius, alphaBase, phase]
 * All values compile-time constants; no per-frame allocation.
 */
const _POLLEN_DATA: readonly (readonly number[])[] = [
  //  bXF    bYF   xAmp  yAmp  xFreq  yFreq   r    alpha  phase
  [  0.15,  0.30,  18,   10,   0.13,  0.11,  1.5,  0.24,  0.00 ],
  [  0.30,  0.58,  12,   18,   0.10,  0.14,  1.2,  0.21,  0.13 ],
  [  0.45,  0.22,  22,    8,   0.15,  0.09,  1.8,  0.19,  0.26 ],
  [  0.60,  0.44,  14,   16,   0.11,  0.13,  1.4,  0.23,  0.39 ],
  [  0.75,  0.68,  10,   22,   0.09,  0.12,  1.6,  0.20,  0.52 ],
  [  0.85,  0.35,  18,   12,   0.14,  0.10,  1.3,  0.22,  0.65 ],
  [  0.20,  0.78,  13,   14,   0.12,  0.11,  1.7,  0.18,  0.78 ],
  [  0.55,  0.16,  16,    9,   0.13,  0.10,  1.5,  0.21,  0.91 ],
  [  0.10,  0.50,   8,   20,   0.08,  0.13,  1.2,  0.19,  0.17 ],
  [  0.70,  0.26,  15,   13,   0.11,  0.09,  1.9,  0.20,  0.43 ],
  [  0.40,  0.73,  11,   17,   0.14,  0.12,  1.4,  0.22,  0.69 ],
  [  0.90,  0.53,  19,   10,   0.10,  0.11,  1.6,  0.17,  0.82 ],
  [  0.25,  0.40,  14,   18,   0.12,  0.14,  1.3,  0.21,  0.05 ],
  [  0.65,  0.83,   9,   15,   0.09,  0.10,  2.0,  0.18,  0.35 ],
  [  0.50,  0.55,  16,   12,   0.13,  0.11,  1.5,  0.20,  0.61 ],
  [  0.80,  0.12,  20,    8,   0.11,  0.09,  1.7,  0.19,  0.88 ],
];

// ── Vine geometry constants ────────────────────────────────────────────────────

const MAX_VINES_HIGH  = 12;
const MAX_VINES_LOW   = 6;
const MAX_SEGS        = 7;   // maximum segments per vine
const MAX_TOTAL_SEGS  = MAX_VINES_HIGH * MAX_SEGS;  // 84

/** Spring stiffness — higher = snappier return to rest. */
const VINE_SPRING_K          = 4.5;
/** Per-frame velocity damping factor (applied as Math.pow(base, dt*60)). */
const VINE_DAMPING_BASE      = 0.91;
/** Player proximity radius (logical px) that triggers a vine disturbance impulse. */
const VINE_DISTURB_RADIUS    = 52;
/** Magnitude of the velocity impulse applied when a player is within disturb radius. */
const VINE_DISTURB_IMPULSE   = 16;
/** Maximum total bend displacement (logical px) clamped per vine. */
const VINE_MAX_BEND          = 22;
/** Sway amplitude in radians per segment. */
const VINE_SWAY_AMP          = 0.11;

// ── Vine geometry typed arrays (computed once at module import) ────────────────

/** Natural angle deviation of each segment from its parent (radians). */
const _segDeltaAngle = new Float32Array(MAX_TOTAL_SEGS);
/** Length of each segment (logical px). */
const _segLengthPx   = new Float32Array(MAX_TOTAL_SEGS);

// ── Vine bend physics (spring model; mutable between frames) ──────────────────

/** Current lateral bend displacement X per vine (logical px). */
const _vineBendX  = new Float32Array(MAX_VINES_HIGH);
/** Current lateral bend displacement Y per vine (logical px). */
const _vineBendY  = new Float32Array(MAX_VINES_HIGH);
/** Current bend velocity X per vine (logical px / s). */
const _vineBendVX = new Float32Array(MAX_VINES_HIGH);
/** Current bend velocity Y per vine (logical px / s). */
const _vineBendVY = new Float32Array(MAX_VINES_HIGH);

/** Previous time-seconds value, used to derive dt between frames. */
let _lastVineTineS = -1;

// ── One-time geometry initialisation (runs synchronously at module import) ────

{
  for (let i = 0; i < MAX_VINES_HIGH; i++) {
    for (let s = 0; s < MAX_SEGS; s++) {
      const idx = i * MAX_SEGS + s;
      // Natural curve: each segment deviates from parent by up to ±0.3 rad
      _segDeltaAngle[idx] = (_SEEDS[(i * 3 + s + 1) % 20] - 0.5) * 0.6;
      // Segment length: 7–13 logical px
      _segLengthPx[idx]   = 7 + _SEEDS[(i * 5 + s + 2) % 20] * 6;
    }
  }
}

// ── Visual constants ───────────────────────────────────────────────────────────

/** Vine stroke colour palette (dark-forest greens with teal hints). */
const _VINE_COLORS: readonly string[] = [
  '#2d5c2a',  // forest green
  '#1e4d1b',  // deep forest
  '#3a7832',  // mid green
  '#4a9940',  // vibrant green
  '#265e22',  // mossy dark
];

/** Bioluminescent glow tint for vine shadows. */
const _VINE_GLOW_COLOR  = '#44dd60';

/** Pollen particle fill colour. */
const _POLLEN_COLOR      = '#c8ff88';

/** Floor plant stroke / fill palette. */
const _FLOOR_PLANT_COLORS: readonly string[] = [
  '#1a3d18',
  '#0f2b0e',
  '#2a5228',
  '#183316',
];

/** Bioluminescent flower head colour. */
const _FLOWER_GLOW_COLOR = '#50ff78';

const _HIGH_POLLEN_COUNT = 16;

/** Atmosphere tint opacity (layered over the base '#0a0a12' fill). */
const _TINT_ALPHA_HIGH = 0.28;
const _TINT_ALPHA_LOW  = 0.20;

// ── Vine root / base-angle helpers ────────────────────────────────────────────

/** Returns the root X position of vine i (fraction of arena width). */
function _vineRootXFrac(i: number): number {
  const s = _SEEDS[i % 20];
  if (i < 4) return 0.06 + s * 0.88;     // bottom edge: spread across arena width
  if (i < 8) return 0.02 + s * 0.10;     // left edge: near left border
  return 0.88 + s * 0.10;                 // right edge: near right border
}

/** Returns the root Y position of vine i (fraction of arena height). */
function _vineRootYFrac(i: number): number {
  const s = _SEEDS[(i + 5) % 20];
  if (i < 4) return 0.88 + s * 0.10;     // bottom edge: near bottom border
  if (i < 8) return 0.15 + s * 0.70;     // left edge: distributed vertically
  return 0.15 + s * 0.70;                 // right edge: distributed vertically
}

/** Returns the inward-pointing base angle for vine i (radians). */
function _vineBaseAngle(i: number): number {
  const s = _SEEDS[(i + 11) % 20];
  if (i < 4) return -Math.PI * 0.5 + (s - 0.5) * 0.8;   // mostly upward
  if (i < 8) return  0.0            + (s - 0.5) * 0.9;   // mostly rightward
  return              Math.PI        + (s - 0.5) * 0.9;   // mostly leftward
}

/** Returns the number of segments for vine i (4 – 6). */
function _vineSegCount(i: number): number {
  return 4 + (i % 3);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Draw the Verdure atmospheric tint behind the entire battlefield.
 *
 * Call immediately after the initial background fill (`fillRect('#0a0a12')`),
 * before fluid and terrain rendering, so it sits at the very bottom of the
 * visual stack.
 *
 * The tint is a dark forest-green gradient with a faint bioluminescent radial
 * accent near the lower arena floor (where vines root).
 */
export function drawVerdureBackground(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  lowGraphics: boolean,
): void {
  canvas2d.save();

  // ── Dark forest gradient ─────────────────────────────────────────────────
  const grad = canvas2d.createLinearGradient(0, 0, 0, heightPx);
  grad.addColorStop(0.0, '#040e04');   // very dark canopy top
  grad.addColorStop(0.5, '#091208');   // deep green mid
  grad.addColorStop(1.0, '#0b1a08');   // forest floor bottom
  canvas2d.fillStyle = grad;
  canvas2d.globalAlpha = lowGraphics ? _TINT_ALPHA_LOW : _TINT_ALPHA_HIGH;
  canvas2d.fillRect(0, 0, widthPx, heightPx);

  // ── Bioluminescent floor accent (high-graphics only) ─────────────────────
  // Faint green radial glow at the bottom corners — suggests root energy.
  if (!lowGraphics) {
    const glowR = canvas2d.createRadialGradient(
      widthPx * 0.5, heightPx * 1.05, 0,
      widthPx * 0.5, heightPx * 1.05, widthPx * 0.65,
    );
    glowR.addColorStop(0.0, 'rgba(48, 220, 80, 0.10)');
    glowR.addColorStop(1.0, 'rgba(48, 220, 80, 0.00)');
    canvas2d.fillStyle = glowR;
    canvas2d.globalAlpha = 1.0;
    canvas2d.fillRect(0, heightPx * 0.55, widthPx, heightPx * 0.45);
  }

  canvas2d.restore();
}

/**
 * Draw animated floor plant decoration, procedural vines with sway/disturbance,
 * and sparse pollen particles on top of the terrain but below enemies and player.
 *
 * Call after terrain rendering and before the first enemy draw call.
 *
 * @param playerX  Player mote X in logical canvas coordinates (for vine disturbance).
 * @param playerY  Player mote Y in logical canvas coordinates (for vine disturbance).
 */
export function drawVerdureFloorEffects(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  nowMs: number,
  playerX: number,
  playerY: number,
  lowGraphics: boolean,
): void {
  const tS = nowMs * 0.001;

  // Update vine bend physics first so rendered positions are current.
  _updateVineBendPhysics(tS, widthPx, heightPx, playerX, playerY, lowGraphics);

  _drawFloorPlants(canvas2d, widthPx, heightPx, tS, lowGraphics);
  _drawVines(canvas2d, widthPx, heightPx, tS, lowGraphics);

  if (!lowGraphics) {
    _drawPollenParticles(canvas2d, widthPx, heightPx, tS);
  }
}

// ── Private: vine bend physics ─────────────────────────────────────────────────

/**
 * Advance vine bend spring physics by the elapsed dt and apply player disturbance.
 *
 * The model is a per-vine 2-D spring:
 *   - An external impulse is added when the player comes within VINE_DISTURB_RADIUS.
 *   - The bend velocity is damped each frame and the bend position springs back to 0.
 *   - Maximum bend is clamped to VINE_MAX_BEND to prevent wild flailing.
 *
 * Only vines that are currently rendered (vineCount depends on low-graphics mode)
 * are updated; dormant vines remain at rest (all-zero state).
 */
function _updateVineBendPhysics(
  tS: number,
  widthPx: number,
  heightPx: number,
  playerX: number,
  playerY: number,
  lowGraphics: boolean,
): void {
  if (_lastVineTineS < 0) {
    _lastVineTineS = tS;
    return;
  }
  const dt = Math.min(tS - _lastVineTineS, 0.1);
  _lastVineTineS = tS;
  if (dt <= 0) return;

  const vineCount   = lowGraphics ? MAX_VINES_LOW : MAX_VINES_HIGH;
  const dampFactor  = Math.pow(VINE_DAMPING_BASE, dt * 60);
  const distR2      = VINE_DISTURB_RADIUS * VINE_DISTURB_RADIUS;

  for (let i = 0; i < vineCount; i++) {
    // Spring force toward rest (Hooke's law)
    _vineBendVX[i] -= _vineBendX[i] * VINE_SPRING_K * dt;
    _vineBendVY[i] -= _vineBendY[i] * VINE_SPRING_K * dt;

    // Velocity damping
    _vineBendVX[i] *= dampFactor;
    _vineBendVY[i] *= dampFactor;

    // Integrate velocity → position
    _vineBendX[i] += _vineBendVX[i] * dt;
    _vineBendY[i] += _vineBendVY[i] * dt;

    // Clamp maximum bend
    const bLen2 = _vineBendX[i] * _vineBendX[i] + _vineBendY[i] * _vineBendY[i];
    if (bLen2 > VINE_MAX_BEND * VINE_MAX_BEND) {
      const inv = VINE_MAX_BEND / Math.sqrt(bLen2);
      _vineBendX[i] *= inv;
      _vineBendY[i] *= inv;
    }

    // Player disturbance: check distance from player to vine midpoint
    const baseAngle = _vineBaseAngle(i);
    const approxMidLen = 28; // rough half-vine length in logical px
    const midX = widthPx  * _vineRootXFrac(i) + Math.cos(baseAngle) * approxMidLen;
    const midY = heightPx * _vineRootYFrac(i) + Math.sin(baseAngle) * approxMidLen;

    const dx  = playerX - midX;
    const dy  = playerY - midY;
    const d2  = dx * dx + dy * dy;
    if (d2 < distR2) {
      const dist     = Math.sqrt(d2);
      const strength = (1 - dist / VINE_DISTURB_RADIUS) * VINE_DISTURB_IMPULSE;
      const invDist  = dist > 0.5 ? 1 / dist : 1;
      // Push vine away from player direction
      _vineBendVX[i] -= dx * invDist * strength;
      _vineBendVY[i] -= dy * invDist * strength;
    }
  }
}

// ── Private: floor plant decoration ───────────────────────────────────────────

/**
 * Draw sparse low-alpha floor decoration scattered across the lower arena.
 * Four plant types alternate per index:
 *   0 — grass tuft (2–3 short curved blades)
 *   1 — sprout     (thin stem + small leaf ellipse)
 *   2 — moss patch (flat filled ellipse, very low alpha)
 *   3 — tiny flower (thin stem + glowing bioluminescent dot)
 *
 * All positions and sizes are deterministic from _SEEDS; only the gentle
 * bob/sway animation is time-driven, so the layout is stable between frames.
 */
function _drawFloorPlants(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  tS: number,
  lowGraphics: boolean,
): void {
  const plantCount = lowGraphics ? 8 : 16;
  canvas2d.save();

  for (let i = 0; i < plantCount; i++) {
    const s0 = _SEEDS[i % 20];
    const s1 = _SEEDS[(i + 6) % 20];
    const s2 = _SEEDS[(i + 12) % 20];

    // Scatter plants across the lower 50% of the arena
    const cx = widthPx  * (0.05 + s0 * 0.90);
    const cy = heightPx * (0.52 + s1 * 0.44);

    // Gentle per-plant bob
    const bob = Math.sin(tS * (0.38 + s0 * 0.28) + s2 * 6.283) * 1.2;

    const plantType = i % 4;

    if (plantType === 0) {
      // ── Grass tuft ──
      canvas2d.globalAlpha = 0.36 + s2 * 0.18;
      canvas2d.strokeStyle = _FLOOR_PLANT_COLORS[i % 4];
      canvas2d.lineWidth   = 0.7;
      const bladeCount = 3;
      for (let b = 0; b < bladeCount; b++) {
        const bladeAngle = -Math.PI * 0.5 + (b - 1) * 0.40;
        const len = 5 + s1 * 5;
        const tx  = cx + Math.cos(bladeAngle) * len;
        const ty  = cy + Math.sin(bladeAngle) * len + bob;
        const cpx = cx + (b - 1) * 2.5;
        const cpy = cy - len * 0.55 + bob * 0.5;
        canvas2d.beginPath();
        canvas2d.moveTo(cx, cy);
        canvas2d.quadraticCurveTo(cpx, cpy, tx, ty);
        canvas2d.stroke();
      }
    } else if (plantType === 1) {
      // ── Sprout ──
      const stemH   = 5 + s0 * 4;
      const stemTipX = cx + (s1 - 0.5) * 3;
      const stemTipY = cy - stemH + bob;
      canvas2d.globalAlpha = 0.38 + s2 * 0.16;
      canvas2d.strokeStyle = _FLOOR_PLANT_COLORS[(i + 1) % 4];
      canvas2d.lineWidth   = 0.65;
      canvas2d.beginPath();
      canvas2d.moveTo(cx, cy);
      canvas2d.lineTo(stemTipX, stemTipY);
      canvas2d.stroke();
      // Tiny leaf
      canvas2d.fillStyle   = _FLOOR_PLANT_COLORS[(i + 2) % 4];
      canvas2d.globalAlpha = 0.40 + s0 * 0.15;
      canvas2d.beginPath();
      canvas2d.ellipse(stemTipX, stemTipY - 1.5, 2.5, 1.4, (s2 - 0.5) * 1.0, 0, Math.PI * 2);
      canvas2d.fill();
    } else if (plantType === 2) {
      // ── Moss patch ──
      canvas2d.fillStyle   = _FLOOR_PLANT_COLORS[(i + 2) % 4];
      canvas2d.globalAlpha = 0.15 + s2 * 0.10;
      canvas2d.beginPath();
      canvas2d.ellipse(cx, cy, 9 + s0 * 10, 2.5 + s1 * 2.5, s2 * Math.PI, 0, Math.PI * 2);
      canvas2d.fill();
    } else {
      // ── Tiny bioluminescent flower ──
      const stemH = 5 + s0 * 4;
      canvas2d.globalAlpha = 0.35 + s2 * 0.15;
      canvas2d.strokeStyle = _FLOOR_PLANT_COLORS[1];
      canvas2d.lineWidth   = 0.60;
      canvas2d.beginPath();
      canvas2d.moveTo(cx, cy);
      canvas2d.lineTo(cx + (s1 - 0.5) * 2.5, cy - stemH + bob);
      canvas2d.stroke();
      // Glowing head
      canvas2d.fillStyle   = _FLOWER_GLOW_COLOR;
      canvas2d.globalAlpha = 0.45 + s2 * 0.25;
      canvas2d.beginPath();
      canvas2d.arc(cx + (s1 - 0.5) * 2.5, cy - stemH - 1.2 + bob, 1.6, 0, Math.PI * 2);
      canvas2d.fill();
    }
  }

  canvas2d.restore();
}

// ── Private: vine rendering ────────────────────────────────────────────────────

/**
 * Draw all active vines as tapered segment chains.
 *
 * Each vine starts at a root point on or near an arena edge and grows inward
 * following a pre-computed set of per-segment angle deviations.  Vine tips are
 * thinner than roots (line width tapers linearly toward 0.4 px).
 *
 * Sway: each segment's angle accumulates a small sinusoidal offset that varies
 * with time, creating an organic slow-breathing motion.
 *
 * Lean / disturbance: the current bend displacement (_vineBendX/Y) is applied as
 * a "lean" offset that increases linearly from zero at the root to full bend at
 * the tip, creating a convincing whole-vine lean effect when disturbed.
 */
function _drawVines(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  tS: number,
  lowGraphics: boolean,
): void {
  const vineCount = lowGraphics ? MAX_VINES_LOW : MAX_VINES_HIGH;

  canvas2d.save();

  // Bioluminescent shadow blur applied once for all vines (high-graphics only)
  if (!lowGraphics) {
    canvas2d.shadowBlur  = 3;
    canvas2d.shadowColor = _VINE_GLOW_COLOR;
  }

  for (let i = 0; i < vineCount; i++) {
    const s0        = _SEEDS[i % 20];
    const s1        = _SEEDS[(i + 9) % 20];
    const s2        = _SEEDS[(i + 15) % 20];

    const rootX     = widthPx  * _vineRootXFrac(i);
    const rootY     = heightPx * _vineRootYFrac(i);
    const baseAngle = _vineBaseAngle(i);
    const segCount  = _vineSegCount(i);
    const baseThick = 2.0 + s0 * 1.8;
    const swayFreq  = 0.48 + s1 * 0.32;
    const swayPhase = _SEEDS[(i + 4) % 20] * Math.PI * 2;
    const colorIdx  = i % _VINE_COLORS.length;
    const alpha     = 0.68 + s2 * 0.18;

    canvas2d.globalAlpha = alpha;
    canvas2d.strokeStyle = _VINE_COLORS[colorIdx];

    const bendX = _vineBendX[i];
    const bendY = _vineBendY[i];

    let cx    = rootX;
    let cy    = rootY;
    let angle = baseAngle;

    for (let s = 0; s < segCount; s++) {
      const t    = (s + 1) / segCount;        // 0 at root → 1 at tip
      const idx  = i * MAX_SEGS + s;
      const segLen = _segLengthPx[idx];

      // Advance angle: natural curve + gentle sway
      const swayDelta = Math.sin(tS * swayFreq + swayPhase + s * 0.65) * VINE_SWAY_AMP;
      angle += _segDeltaAngle[idx] + swayDelta;

      // Natural (undeflected) next position
      const nx = cx + Math.cos(angle) * segLen;
      const ny = cy + Math.sin(angle) * segLen;

      // Lean offset: zero at root, full bend at tip
      const prevLeanScale = t - 1 / segCount;  // lean at segment start
      const nextLeanScale = t;                  // lean at segment end

      const fromX = cx + bendX * prevLeanScale;
      const fromY = cy + bendY * prevLeanScale;
      const toX   = nx + bendX * nextLeanScale;
      const toY   = ny + bendY * nextLeanScale;

      // Tapering line width: thick at root, thin at tip
      canvas2d.lineWidth = Math.max(0.4, baseThick * (1 - t * 0.82));

      canvas2d.beginPath();
      canvas2d.moveTo(fromX, fromY);
      canvas2d.lineTo(toX, toY);
      canvas2d.stroke();

      // Advance natural position (lean is purely visual, does not affect geometry)
      cx = nx;
      cy = ny;
    }
  }

  // Reset shadow (important — non-zero shadowBlur is expensive for subsequent draws)
  if (!lowGraphics) {
    canvas2d.shadowBlur  = 0;
    canvas2d.shadowColor = 'transparent';
  }

  canvas2d.restore();
}

// ── Private: pollen / spore particles ─────────────────────────────────────────

/**
 * Draw _HIGH_POLLEN_COUNT sparse drifting pollen motes.
 * Each particle follows a gentle 2-D oscillation driven purely by time and
 * its pre-baked phase/amplitude — no mutable per-particle state.
 * Skipped entirely in low-graphics mode.
 */
function _drawPollenParticles(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  tS: number,
): void {
  canvas2d.save();
  canvas2d.fillStyle = _POLLEN_COLOR;

  for (let i = 0; i < _HIGH_POLLEN_COUNT; i++) {
    const row    = _POLLEN_DATA[i];
    const baseXF = row[0];
    const baseYF = row[1];
    const xAmp   = row[2];
    const yAmp   = row[3];
    const xFreq  = row[4];
    const yFreq  = row[5];
    const radius = row[6];
    const alphaB = row[7];
    const phase  = row[8];

    const x = widthPx  * baseXF + xAmp * Math.sin(tS * xFreq + phase * 6.283);
    const y = heightPx * baseYF + yAmp * Math.cos(tS * yFreq + phase * 5.134);

    // Gentle pulse
    const pulse = 0.55 + 0.45 * Math.sin(tS * 1.4 + phase * 3.14159);
    canvas2d.globalAlpha = alphaB * pulse;

    canvas2d.beginPath();
    canvas2d.arc(x, y, radius, 0, Math.PI * 2);
    canvas2d.fill();
  }

  canvas2d.restore();
}
