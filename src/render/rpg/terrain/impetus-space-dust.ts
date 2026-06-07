/**
 * impetus-space-dust.ts — Persistent colored space-dust particle field for the Impetus RPG zone.
 *
 * Two rendering layers:
 *   drawImpetusDustFar  — call from drawImpetusBackground() after starfield
 *   drawImpetusDustNear — call from drawImpetusFloorEffects() after shadow blit, before asteroids
 *
 * Update (call once per frame in the Impetus zone tick block):
 *   updateImpetusDust(...)
 *
 * Reset (call when entering the Impetus zone):
 *   resetImpetusDust()
 *
 * Performance notes:
 *   - All particle data is preallocated in typed arrays (no per-frame heap allocation).
 *   - Influence sampling is capped and skipped on low graphics.
 *   - No canvas filter used on the main canvas.
 *   - Particle positions are in local canvas coords (0..vwW, 0..vwH) at world scale,
 *     so DPR is irrelevant — the canvas transform already encodes DPR.
 *
 * NOTE: No asteroid-attack class was found in the codebase.  Decorative asteroid
 * center positions (mirrored from impetus-overlay.ts) are used to subtly disturb
 * nearby dust.  A TODO marker is left for future hookup if an attack class is added.
 */

import type { AlivenParticleGroup } from '../rpg-aliven-types';
import type { RpgWeaponHandle } from '../rpg-weapon-systems';

// ── Color palette ─────────────────────────────────────────────────────────────

const _COLORS: readonly string[] = [
  '#b064ff', // violet
  '#40d4e0', // cyan
  '#d8c472', // pale gold
  '#c050a8', // dim magenta
  '#b8c8ff', // blue-white
];
const _COLOR_COUNT = _COLORS.length;

// ── Particle counts ───────────────────────────────────────────────────────────

const _MAX_PARTICLES = 320;
const _COUNT_HI      = 320; // high graphics
const _COUNT_LO      = 120; // low graphics
const _FAR_RATIO     = 0.55; // fraction of particles on the "far" (background) layer

// ── Influence radii (world / local canvas units) ──────────────────────────────

const _PLAYER_PUSH_R    = 65;
const _PLAYER_PUSH_RSQ  = _PLAYER_PUSH_R * _PLAYER_PUSH_R;
const _PLAYER_WAKE_R    = 45;
const _PLAYER_WAKE_RSQ  = _PLAYER_WAKE_R * _PLAYER_WAKE_R;
const _ALIVEN_R         = 100;
const _ALIVEN_RSQ       = _ALIVEN_R * _ALIVEN_R;
const _WEAPON_R         = 55;
const _WEAPON_RSQ       = _WEAPON_R * _WEAPON_R;
const _ASTEROID_R       = 30;
const _ASTEROID_RSQ     = _ASTEROID_R * _ASTEROID_R;

const _MAX_WEAPON_SOURCES = 12; // cap on weapon influence sources per frame

// ── Preallocated particle arrays (struct-of-arrays) ───────────────────────────

const _px  = new Float32Array(_MAX_PARTICLES); // x in local canvas coords (0..vwW)
const _py  = new Float32Array(_MAX_PARTICLES); // y in local canvas coords (0..vwH)
const _pvx = new Float32Array(_MAX_PARTICLES); // base drift vx (px/ms)
const _pvy = new Float32Array(_MAX_PARTICLES); // base drift vy (px/ms)
const _pal = new Float32Array(_MAX_PARTICLES); // alpha peak (0.04..0.15)
const _pra = new Float32Array(_MAX_PARTICLES); // draw radius (px)
const _pph = new Float32Array(_MAX_PARTICLES); // animation phase (0..2π)
const _pcl = new Uint8Array(_MAX_PARTICLES);   // color index (0..4)

// ── State ─────────────────────────────────────────────────────────────────────

let _count    = 0;
let _farCount = 0; // particles [0, _farCount) are "far"; [_farCount, _count) are "near"
let _initW    = -1;
let _initH    = -1;

// Dev telemetry
let _updateMs    = 0;
let _drawFarMs   = 0;
let _drawNearMs  = 0;
let _influenceCt = 0;

// ── Asteroid center data (mirrored from impetus-overlay.ts _ASTEROID_DATA) ────
// Only fields needed to compute animated center position at a given tS.
// Layout per row: [xFrac, yFrac, driftXSign, driftYSign, driftSpeedFrac, phase]
const _AST_DATA: readonly (readonly number[])[] = [
  [ 0.10, 0.20,  1.0,   0.3,  0.018, 0.00 ],
  [ 0.33, 0.55, -1.0,   0.5,  0.012, 0.14 ],
  [ 0.60, 0.15,  0.5,   1.0,  0.015, 0.27 ],
  [ 0.80, 0.70, -0.7,  -1.0,  0.010, 0.41 ],
  [ 0.45, 0.40,  1.0,  -0.4,  0.020, 0.55 ],
  [ 0.15, 0.85,  0.8,   0.6,  0.013, 0.68 ],
  [ 0.90, 0.30, -1.0,   0.2,  0.016, 0.82 ],
];

// ── Deterministic seeded PRNG (used only during _scatter) ────────────────────

let _seed = 12345;
function _rand(): number {
  _seed = (_seed * 1664525 + 1013904223) & 0x7fffffff;
  return _seed / 0x7fffffff;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Force a particle re-scatter on next update.  Call when entering the Impetus zone. */
export function resetImpetusDust(): void {
  _initW = -1;
}

/**
 * Advance all dust particles one simulation tick.
 *
 * Call from the Impetus zone block in rpg-render-update.ts, after tickParticleLifeMatrix.
 *
 * Coordinate notes:
 *   - Particles are stored in local canvas coords: local = world − (vwX, vwY).
 *   - Player/enemy positions are world-space; converted internally via vwX/vwY.
 *   - vwW, vwH are the full visible canvas dimensions in world units.
 */
export function updateImpetusDust(
  dt: number,
  vwX: number, vwY: number, vwW: number, vwH: number,
  moteWorldX: number, moteWorldY: number, moteVx: number, moteVy: number,
  alivenGroups: readonly AlivenParticleGroup[],
  weaponSystems: RpgWeaponHandle,
  lowGraphics: boolean,
  nowMs: number,
): void {
  const t0 = performance.now();

  if (_initW !== vwW || _initH !== vwH) {
    _scatter(vwW, vwH, lowGraphics);
    _initW = vwW;
    _initH = vwH;
  }

  const tS = nowMs * 0.001;
  _influenceCt = 0;

  const moteLocalX = moteWorldX - vwX;
  const moteLocalY = moteWorldY - vwY;
  const moteSpdSq  = moteVx * moteVx + moteVy * moteVy;

  // ── Base drift and wrap ───────────────────────────────────────────────────
  for (let i = 0; i < _count; i++) {
    _px[i] += _pvx[i] * dt;
    _py[i] += _pvy[i] * dt;
    _pph[i] += dt * 0.0010;
    if (_px[i] < -2)           _px[i] += vwW + 4;
    else if (_px[i] > vwW + 2) _px[i] -= vwW + 4;
    if (_py[i] < -2)           _py[i] += vwH + 4;
    else if (_py[i] > vwH + 2) _py[i] -= vwH + 4;
  }

  // ── Player push and wake trail ────────────────────────────────────────────
  const hasWake = !lowGraphics && moteSpdSq > 0.006;
  const mSpd    = hasWake ? Math.sqrt(moteSpdSq) : 0;
  for (let i = 0; i < _count; i++) {
    const dpx = _px[i] - moteLocalX;
    const dpy = _py[i] - moteLocalY;
    const dSq = dpx * dpx + dpy * dpy;
    if (dSq > 0.01) {
      if (dSq < _PLAYER_PUSH_RSQ) {
        const d     = Math.sqrt(dSq);
        const tf    = 1 - d / _PLAYER_PUSH_R;
        const force = tf * tf * 0.022 * dt;
        _px[i] += (dpx / d) * force;
        _py[i] += (dpy / d) * force;
        _influenceCt++;
      }
      if (hasWake && dSq < _PLAYER_WAKE_RSQ) {
        const d    = Math.sqrt(dSq);
        const tw   = 1 - d / _PLAYER_WAKE_R;
        const wStr = tw * 0.008 * dt;
        _px[i] += (moteVx / mSpd) * wStr;
        _py[i] += (moteVy / mSpd) * wStr;
      }
    }
  }

  // ── Aliven group influences (skipped on low graphics) ─────────────────────
  if (!lowGraphics) {
    for (let g = 0; g < alivenGroups.length; g++) {
      const grp = alivenGroups[g];
      if (!grp || grp.aliveCount === 0) continue;
      const gx  = grp.cx - vwX;
      const gy  = grp.cy - vwY;
      const vid = grp.variantId;
      // Cheap stable hash → force type: 0=attract, 1=repel, 2=swirl
      const ftype = (vid.charCodeAt(0) + vid.charCodeAt(vid.length - 1)) % 3;
      for (let i = 0; i < _count; i++) {
        const dx  = _px[i] - gx;
        const dy  = _py[i] - gy;
        const dSq = dx * dx + dy * dy;
        if (dSq >= _ALIVEN_RSQ || dSq < 0.01) continue;
        const d   = Math.sqrt(dSq);
        const t   = 1 - d / _ALIVEN_R;
        const str = t * t * 0.012 * dt;
        _influenceCt++;
        if (ftype === 0) {
          _px[i] -= (dx / d) * str; // attract toward centroid
          _py[i] -= (dy / d) * str;
        } else if (ftype === 1) {
          _px[i] += (dx / d) * str; // repel from centroid
          _py[i] += (dy / d) * str;
        } else {
          _px[i] += (-dy / d) * str; // swirl (tangential force)
          _py[i] +=  (dx / d) * str;
        }
      }
    }
  }

  // ── Weapon projectile influences (skipped on low graphics) ────────────────
  if (!lowGraphics) {
    let wpnN = 0;
    const sp = weaponSystems.sandProjectiles;
    for (let wi = 0; wi < sp.length && wpnN < _MAX_WEAPON_SOURCES; wi++, wpnN++)
      _pushDust(sp[wi]!.x - vwX, sp[wi]!.y - vwY, dt);

    const pb = weaponSystems.poisonBolts;
    for (let wi = 0; wi < pb.length && wpnN < _MAX_WEAPON_SOURCES; wi++, wpnN++)
      _pushDust(pb[wi]!.x - vwX, pb[wi]!.y - vwY, dt);

    const em = weaponSystems.emeraldPlayerMissiles;
    for (let wi = 0; wi < em.length && wpnN < _MAX_WEAPON_SOURCES; wi++, wpnN++)
      _pushDust(em[wi]!.x - vwX, em[wi]!.y - vwY, dt);

    const es = weaponSystems.emeraldSubMissiles;
    for (let wi = 0; wi < es.length && wpnN < _MAX_WEAPON_SOURCES; wi++, wpnN++)
      _pushDust(es[wi]!.x - vwX, es[wi]!.y - vwY, dt);

    const sm = weaponSystems.sunstoneMines;
    for (let wi = 0; wi < sm.length && wpnN < _MAX_WEAPON_SOURCES; wi++, wpnN++)
      _pushDust(sm[wi]!.x - vwX, sm[wi]!.y - vwY, dt);

    const fs = weaponSystems.fracterylSpears;
    for (let wi = 0; wi < fs.length && wpnN < _MAX_WEAPON_SOURCES; wi++, wpnN++)
      _pushDust(fs[wi]!.x - vwX, fs[wi]!.y - vwY, dt);

    // Ruby laser beam: strong disturbance at beam source and midpoint
    const lb = weaponSystems.laserBeamEffect;
    if (lb?.active && wpnN < _MAX_WEAPON_SOURCES) {
      _pushDust(lb.startX - vwX, lb.startY - vwY, dt * 3);
      _pushDust((lb.startX + lb.endX) * 0.5 - vwX, (lb.startY + lb.endY) * 0.5 - vwY, dt * 2);
    }
  }

  // ── Decorative asteroid disturbance ───────────────────────────────────────
  // TODO: No asteroid-attack class found in the codebase.  When one is added,
  // hook it in here as a push source alongside the decorative asteroids below.
  const astN = lowGraphics ? 3 : _AST_DATA.length;
  for (let a = 0; a < astN; a++) {
    const row    = _AST_DATA[a]!;
    const driftT = (tS * row[4]! + row[5]!) % 1.0;
    const astLX  = ((row[0]! + row[2]! * driftT + 2.0) % 1.2 - 0.1) * vwW;
    const astLY  = ((row[1]! + row[3]! * driftT + 2.0) % 1.2 - 0.1) * vwH;
    for (let i = 0; i < _count; i++) {
      const dx  = _px[i] - astLX;
      const dy  = _py[i] - astLY;
      const dSq = dx * dx + dy * dy;
      if (dSq >= _ASTEROID_RSQ || dSq < 0.01) continue;
      const d   = Math.sqrt(dSq);
      const t   = 1 - d / _ASTEROID_R;
      const str = t * t * 0.008 * dt;
      _px[i] += (dx / d) * str;
      _py[i] += (dy / d) * str;
      _influenceCt++;
    }
  }

  _updateMs = performance.now() - t0;
}

/**
 * Draw the far (background) dust layer.
 * Call inside drawImpetusBackground() after the starfield, with the canvas
 * context already translated by (vwX, vwY).
 */
export function drawImpetusDustFar(
  canvas2d: CanvasRenderingContext2D,
  nowMs: number,
): void {
  if (_farCount === 0) return;
  const t0 = performance.now();
  const tS = nowMs * 0.001;
  canvas2d.save();
  let lastCi = -1;
  for (let i = 0; i < _farCount; i++) {
    const twinkle = 0.55 + 0.45 * Math.sin(tS * 0.8 + _pph[i]);
    const alpha   = _pal[i] * twinkle;
    if (alpha < 0.005) continue;
    const ci = _pcl[i];
    if (ci !== lastCi) {
      canvas2d.fillStyle = _COLORS[ci] ?? _COLORS[0]!;
      lastCi = ci;
    }
    canvas2d.globalAlpha = alpha;
    canvas2d.beginPath();
    canvas2d.arc(_px[i], _py[i], _pra[i], 0, 6.2832);
    canvas2d.fill();
  }
  canvas2d.restore();
  _drawFarMs = performance.now() - t0;
}

/**
 * Draw the near (reactive) dust layer.
 * Call inside drawImpetusFloorEffects() after the shadow blit and before the
 * asteroid field, with the canvas context already translated by (vwX, vwY).
 */
export function drawImpetusDustNear(
  canvas2d: CanvasRenderingContext2D,
  nowMs: number,
): void {
  if (_count <= _farCount) return;
  const t0 = performance.now();
  const tS = nowMs * 0.001;
  canvas2d.save();
  let lastCi = -1;
  for (let i = _farCount; i < _count; i++) {
    const twinkle = 0.60 + 0.40 * Math.sin(tS * 1.1 + _pph[i]);
    const alpha   = _pal[i] * twinkle;
    if (alpha < 0.008) continue;
    const ci = _pcl[i];
    if (ci !== lastCi) {
      canvas2d.fillStyle = _COLORS[ci] ?? _COLORS[0]!;
      lastCi = ci;
    }
    canvas2d.globalAlpha = alpha;
    canvas2d.beginPath();
    canvas2d.arc(_px[i], _py[i], _pra[i], 0, 6.2832);
    canvas2d.fill();
  }
  canvas2d.restore();
  _drawNearMs = performance.now() - t0;
}

/** Short diagnostic string for the Impetus dev overlay. */
export function getImpetusDustDevLine(): string {
  return [
    `dust: ${_count}p (${_farCount}far/${_count - _farCount}near)`,
    `influences: ${_influenceCt}`,
    `dustUpdateMs: ${_updateMs.toFixed(1)}`,
    `dustDrawMs: ${(_drawFarMs + _drawNearMs).toFixed(1)}`,
  ].join(' | ');
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _scatter(vwW: number, vwH: number, lowGraphics: boolean): void {
  _seed     = 12345;
  const n   = lowGraphics ? _COUNT_LO : _COUNT_HI;
  _farCount = Math.floor(n * _FAR_RATIO);
  _count    = n;

  for (let i = 0; i < n; i++) {
    const isFar = i < _farCount;
    _px[i]  = _rand() * vwW;
    _py[i]  = _rand() * vwH;
    const angle = _rand() * 6.2832;
    const spd   = isFar
      ? 0.003 + _rand() * 0.007  // far:  0.003..0.010 px/ms
      : 0.006 + _rand() * 0.010; // near: 0.006..0.016 px/ms
    _pvx[i] = Math.cos(angle) * spd;
    _pvy[i] = Math.sin(angle) * spd;
    _pal[i] = isFar ? 0.04 + _rand() * 0.04 : 0.06 + _rand() * 0.09;
    _pra[i] = isFar ? 0.6  + _rand() * 0.4  : 0.8  + _rand() * 0.8;
    _pcl[i] = Math.floor(_rand() * _COLOR_COUNT);
    _pph[i] = _rand() * 6.2832;
  }
}

function _pushDust(localX: number, localY: number, dt: number): void {
  for (let i = 0; i < _count; i++) {
    const dx  = _px[i] - localX;
    const dy  = _py[i] - localY;
    const dSq = dx * dx + dy * dy;
    if (dSq >= _WEAPON_RSQ || dSq < 0.01) continue;
    const d   = Math.sqrt(dSq);
    const t   = 1 - d / _WEAPON_R;
    const str = t * t * 0.015 * dt;
    _px[i] += (dx / d) * str;
    _py[i] += (dy / d) * str;
    _influenceCt++;
  }
}
