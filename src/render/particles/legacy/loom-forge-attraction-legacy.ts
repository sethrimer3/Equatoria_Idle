/**
 * Legacy loom/forge attraction implementation.
 *
 * This code is intentionally no longer imported by runtime systems. It is
 * preserved only for reference/history. Current normal equation-render mote
 * movement intentionally does not include loom or forge attraction.
 */

import type { TierId } from '../../../data/tiers';
import type { EquatoriaParticle } from '../particle-types';
import type { ForgeCrunchState } from '../../../sim/forge/forge-state';
import { FORGE_TOTAL_WARMUP_MS } from '../../../sim/forge/forge-state';
import type { GeneratorInfo } from '../../../sim/particles/generator-state';
import {
  EXTRA_LARGE_SIZE_INDEX,
  getSizeSmallEquivalent,
  MEDIUM_SIZE_INDEX,
  SMALL_SIZE_INDEX,
} from '../../../data/particles/size-tiers';

const FORGE_GRAVITY_BASE = 0.4;
const FORGE_GRAVITY_MAX = 2.0;
const DISTANCE_SCALE = 0.01;
const FORCE_SCALE = 0.006;
const GRAVITY_MIN_DIST = 0.5;
const MAX_FORGE_ATTRACTION_DISTANCE = 50.4;
const SPAWNER_GRAVITY_STRENGTH = 1.5;
const SMALL_TIER_GENERATOR_GRAVITY_STRENGTH = 1.5;
const MEDIUM_TIER_FORGE_GRAVITY_STRENGTH = 0.30;
const FORGE_ATTRACTION_STRENGTH = 3.0;
const GENERATOR_ROTATION_STRENGTH = 0.4;
const GENERATOR_ROTATION_PHASE_OFFSET = 1.23;
const GENERATOR_ROTATION_TIME_SCALE = 0.00018;

// ─── Types ───────────────────────────────────────────────────────

/** A capture/attraction field at a given canvas position. */
interface ForgeFieldInfo {
  /** Unique identifier: 'forge' or 'loom_<tierId>'. */
  id: string;
  x: number;
  y: number;
  /** Inner radius — particles inside are captured. */
  captureRadius: number;
  /** Outer radius — particles inside receive a gentle attraction pull. */
  outerRadius: number;
  /**
   * Which particle tier this field attracts/captures.
   * null means all tiers (used by the equation forge).
   */
  compatibleTierId: TierId | null;
  isUnlocked: boolean;
}

interface LoomCapture {
  particle: EquatoriaParticle;
  fieldId: string;
  inputTierId: TierId;
  mass: number;
}

// ─── Constants ───────────────────────────────────────────────────

/** Weak attraction strength toward a loom field (canvas px/s per unit). */
const LOOM_ATTRACTION_STRENGTH = 1.2;
/** Velocity steering strength that keeps compatible motes from slingshotting past loom fields. */
const LOOM_STEERING_BLEND = 0.25;
/** Maximum inward target speed used by loom steering. */
const LOOM_MAX_STEER_SPEED = 2.0;

// ─── Loom containment governor constants ─────────────────────────

/**
 * Speed cap (canvas px/frame-unit) for motes that have escaped their loom field.
 * 10× the old outer cap so escaped motes move freely without being completely unconstrained.
 */
const LOOM_OUTSIDE_MAX_SPEED = 6.5;
/**
 * Detection margin (canvas px) beyond outerRadius used for catching motes that
 * stepped just outside during the frame's position integration.
 * Must be >= PL_MAX_VELOCITY * FIXED_STEP_DELTA = 1.5 * 0.5 = 0.75 px.
 */
const LOOM_CONTAINMENT_MARGIN_PX = 2.0;
/**
 * Power for the smooth outward-velocity suppression multiplier inside the loom.
 * multiplier = (1 - dist/outerRadius)^POWER
 * Power = 2 gives ~1% outward velocity at 90% of outerRadius and 0% at the edge,
 * while leaving the inner ~50% of the loom relatively unconstrained.
 */
const LOOM_SMOOTH_DAMP_POWER = 2;

/** Dev-mode rate limiter: log at most once per this many substeps (~1.5 s at 60 fps). */
let _devLogSubstep = 0;
const DEV_LOG_SUBSTEP_INTERVAL = 180;

// ─── Implementation ──────────────────────────────────────────────

/**
 * Historical normal-mote generator/"own loom" and forge attraction forces.
 * Runtime physics no longer calls this helper.
 */
export function legacyApplyNormalMoteLoomForgeAttraction(
  p: EquatoriaParticle,
  generators: readonly GeneratorInfo[],
  forgeX: number,
  forgeY: number,
  isForgeUnlocked: boolean,
  clampedDelta: number,
  nowMs: number,
): boolean {
  let isInsideGeneratorField = false;

  if (p.sizeIndex < EXTRA_LARGE_SIZE_INDEX) {
    for (let gi = 0, glen = generators.length; gi < glen; gi++) {
      const gen = generators[gi];
      if (gen.tierId !== p.tierId) continue;
      const dx = gen.x - p.x;
      const dy = gen.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= gen.range && dist > GRAVITY_MIN_DIST) {
        isInsideGeneratorField = true;
        const force = (SPAWNER_GRAVITY_STRENGTH / (dist * DISTANCE_SCALE)) * p.forceModifier;
        const angle = Math.atan2(dy, dx);
        p.vx += Math.cos(angle) * force * FORCE_SCALE * clampedDelta;
        p.vy += Math.sin(angle) * force * FORCE_SCALE * clampedDelta;
        const rotPhase = gen.tierIndex * GENERATOR_ROTATION_PHASE_OFFSET + nowMs * GENERATOR_ROTATION_TIME_SCALE;
        const rotStrength = Math.sin(rotPhase) * GENERATOR_ROTATION_STRENGTH;
        p.vx += -(dy / dist) * rotStrength * FORCE_SCALE * clampedDelta;
        p.vy += (dx / dist) * rotStrength * FORCE_SCALE * clampedDelta;
      }
      if (p.sizeIndex === SMALL_SIZE_INDEX && dist > GRAVITY_MIN_DIST && dist <= gen.range * 2) {
        const force = (SMALL_TIER_GENERATOR_GRAVITY_STRENGTH / (dist * DISTANCE_SCALE)) * p.forceModifier;
        const angle = Math.atan2(dy, dx);
        p.vx += Math.cos(angle) * force * FORCE_SCALE * clampedDelta;
        p.vy += Math.sin(angle) * force * FORCE_SCALE * clampedDelta;
      }
    }
  }

  if (isForgeUnlocked) {
    const fdx = forgeX - p.x;
    const fdy = forgeY - p.y;
    const fdist = Math.sqrt(fdx * fdx + fdy * fdy);
    const forgeRange = p.sizeIndex >= EXTRA_LARGE_SIZE_INDEX ? Infinity : MAX_FORGE_ATTRACTION_DISTANCE;
    if (p.sizeIndex >= MEDIUM_SIZE_INDEX && fdist <= forgeRange && fdist > 1) {
      const force = (FORGE_ATTRACTION_STRENGTH / (fdist * DISTANCE_SCALE)) * p.forceModifier;
      const angle = Math.atan2(fdy, fdx);
      p.vx += Math.cos(angle) * force * FORCE_SCALE * clampedDelta;
      p.vy += Math.sin(angle) * force * FORCE_SCALE * clampedDelta;
    }
    if (p.sizeIndex === MEDIUM_SIZE_INDEX && fdist > GRAVITY_MIN_DIST) {
      const force = (MEDIUM_TIER_FORGE_GRAVITY_STRENGTH / (fdist * DISTANCE_SCALE)) * p.forceModifier;
      const angle = Math.atan2(fdy, fdx);
      p.vx += Math.cos(angle) * force * FORCE_SCALE * clampedDelta;
      p.vy += Math.sin(angle) * force * FORCE_SCALE * clampedDelta;
    }
  }

  return isInsideGeneratorField;
}

function didCrossCaptureRadius(
  p: EquatoriaParticle,
  field: ForgeFieldInfo,
  captureRadiusSq: number,
  clampedDelta: number,
): boolean {
  const previousX = p.x - p.vx * clampedDelta;
  const previousY = p.y - p.vy * clampedDelta;
  const stepX = p.x - previousX;
  const stepY = p.y - previousY;
  const stepLenSq = stepX * stepX + stepY * stepY;
  if (stepLenSq <= 0.0001) return false;

  const toFieldX = field.x - previousX;
  const toFieldY = field.y - previousY;
  const closestT = Math.max(0, Math.min(1, (toFieldX * stepX + toFieldY * stepY) / stepLenSq));
  const closestX = previousX + stepX * closestT;
  const closestY = previousY + stepY * closestT;
  const closestDx = field.x - closestX;
  const closestDy = field.y - closestY;
  return closestDx * closestDx + closestDy * closestDy <= captureRadiusSq;
}

/**
 * Apply capture-field forces to all eligible particles.
 *
 * - Particles within `captureRadius` of a field are captured (isCaptured=true).
 *   - Forge captures only happen during an active crunch (crunchState.isActive).
 *   - Loom captures are added to `newLoomCaptures` for post-loop processing.
 * - During forge warm-up, particles within `outerRadius` receive a gravitational
 *   pull that scales with warmup progress (FORGE_GRAVITY_BASE → FORGE_GRAVITY_MAX).
 * - Particles within `outerRadius` but outside `captureRadius` of loom fields
 *   receive a gentle pull.
 *
 * Eligible particles: sizeIndex >= MEDIUM_SIZE_INDEX, not isMerging, not already isCaptured.
 *
 * Performance: squared-distance comparisons are used to avoid Math.sqrt for the
 * majority of particles that are outside capture/outer range.
 */
export function legacyApplyForgeFieldForces(
  particles: EquatoriaParticle[],
  fields: readonly ForgeFieldInfo[],
  crunchState: ForgeCrunchState,
  newLoomCaptures: LoomCapture[],
  clampedDelta: number,
  nowMs: number,
): void {
  const fieldCount = fields.length;
  if (fieldCount === 0) return;

  // Pre-compute per-field squared radii and forge-check outside the particle loop
  // so these values are not recomputed for every particle.
  const captureRadSq = new Float64Array(fieldCount);
  const outerRadSq   = new Float64Array(fieldCount);
  const isForgeField = new Uint8Array(fieldCount);
  for (let fi = 0; fi < fieldCount; fi++) {
    const field = fields[fi];
    captureRadSq[fi] = field.captureRadius * field.captureRadius;
    outerRadSq[fi]   = field.outerRadius   * field.outerRadius;
    isForgeField[fi] = field.id === 'forge' ? 1 : 0;
  }

  // Pre-compute forge warmup gravity strength (same for all particles this step)
  let forgeWarmupGravity = 0;
  if (crunchState.isWarmingUp && crunchState.warmupStartMs !== null) {
    const warmupProgress = Math.min(1, (nowMs - crunchState.warmupStartMs) / FORGE_TOTAL_WARMUP_MS);
    forgeWarmupGravity = FORGE_GRAVITY_BASE + (FORGE_GRAVITY_MAX - FORGE_GRAVITY_BASE) * warmupProgress;
  }

  for (let i = 0, len = particles.length; i < len; i++) {
    const p = particles[i];
    if (p.isCaptured || p.isMerging || p.sizeIndex < MEDIUM_SIZE_INDEX) continue;

    for (let fi = 0; fi < fieldCount; fi++) {
      const field = fields[fi];
      if (!field.isUnlocked) continue;
      if (field.compatibleTierId !== null && field.compatibleTierId !== p.tierId) continue;

      const dx = field.x - p.x;
      const dy = field.y - p.y;
      const distSq = dx * dx + dy * dy;

      if (distSq <= captureRadSq[fi] || didCrossCaptureRadius(p, field, captureRadSq[fi], clampedDelta)) {
        if (isForgeField[fi]) {
          // Forge capture only during active crunch
          if (crunchState.isActive) {
            p.isCaptured = true;
            p.capturedById = field.id;
            p.vx = 0;
            p.vy = 0;
          }
        } else {
          // Loom: immediate capture
          p.isCaptured = true;
          p.capturedById = field.id;
          p.vx = 0;
          p.vy = 0;
          newLoomCaptures.push({
            particle: p,
            fieldId: field.id,
            inputTierId: p.tierId,
            mass: getSizeSmallEquivalent(p.sizeIndex),
          });
        }
        break;
      }

      if (distSq <= outerRadSq[fi] && distSq > 1) {
        if (isForgeField[fi]) {
          // Forge warm-up: pull eligible particles toward the forge
          if (forgeWarmupGravity > 0) {
            const dist = Math.sqrt(distSq);
            const force = forgeWarmupGravity / (dist + 1);
            p.vx += (dx / dist) * force * clampedDelta;
            p.vy += (dy / dist) * force * clampedDelta;
          }
        } else {
          // Loom: gentle pull plus inward steering. Higher-tier motes can carry
          // enough generator/Particle-Life velocity to slingshot past the field,
          // so steer their velocity toward the center while they are inside it.
          const dist = Math.sqrt(distSq);
          const force = LOOM_ATTRACTION_STRENGTH / (dist + 1);
          const nx = dx / dist;
          const ny = dy / dist;
          p.vx += nx * force * clampedDelta;
          p.vy += ny * force * clampedDelta;

          const desiredSpeed = Math.min(LOOM_MAX_STEER_SPEED, 0.25 + dist * 0.035);
          const blend = Math.min(1, LOOM_STEERING_BLEND * clampedDelta);
          p.vx += (nx * desiredSpeed - p.vx) * blend;
          p.vy += (ny * desiredSpeed - p.vy) * blend;
        }
      }
    }
  }
}

/**
 * Velocity governor for compatible motes relative to their loom fields.
 *
 * Must be called AFTER applyParticleLifeDamping in each substep.
 *
 * For motes OUTSIDE their loom (within MARGIN_PX):
 *   - Position-correct back to outerRadius - 0.5 px (failsafe against one-step escape).
 *   - Cap total speed at LOOM_OUTSIDE_MAX_SPEED (6.5 px/frame-unit) — free movement,
 *     just not unlimited.
 *
 * For motes INSIDE their loom:
 *   - Smooth outward-velocity suppression:
 *       multiplier = (1 - dist/outerRadius)^LOOM_SMOOTH_DAMP_POWER
 *     This is ~1 at the centre (no suppression) and 0 at the exact edge (full suppression).
 *     Only the outward radial component is scaled; tangential and inward velocity untouched.
 *   - Minimum velocity boosts in the inner 75%/50%/25% zones using tangential (swirl) motion.
 *     Applied only when the mote is not locked to the pointer.
 *
 * Non-compatible motes are not affected. Forge fields are skipped.
 */
export function legacyApplyLoomContainmentCap(
  particles: EquatoriaParticle[],
  fields: readonly ForgeFieldInfo[],
  devMode: boolean,
): void {
  const fieldCount = fields.length;
  if (fieldCount === 0) return;

  _devLogSubstep++;
  const doLog = devMode && _devLogSubstep >= DEV_LOG_SUBSTEP_INTERVAL;
  if (doLog) _devLogSubstep = 0;

  for (let i = 0, len = particles.length; i < len; i++) {
    const p = particles[i];
    if (p.isCaptured || p.isMerging || p.sizeIndex < MEDIUM_SIZE_INDEX) continue;

    for (let fi = 0; fi < fieldCount; fi++) {
      const field = fields[fi];
      if (!field.isUnlocked || field.id === 'forge') continue;
      if (field.compatibleTierId !== p.tierId) continue;

      // Outward vector: field centre → particle
      let dx = p.x - field.x;
      let dy = p.y - field.y;
      const distSq = dx * dx + dy * dy;

      const checkR = field.outerRadius + LOOM_CONTAINMENT_MARGIN_PX;
      if (distSq > checkR * checkR) continue;

      let dist = Math.sqrt(distSq);
      const speedBefore = doLog ? Math.sqrt(p.vx * p.vx + p.vy * p.vy) : 0;

      if (dist > field.outerRadius) {
        // ── Outside: position correct + speed cap ─────────────────
        if (dist > 0.01) {
          const pullScale = (field.outerRadius - 0.5) / dist;
          p.x = field.x + dx * pullScale;
          p.y = field.y + dy * pullScale;
          dx = p.x - field.x;
          dy = p.y - field.y;
          dist = Math.sqrt(dx * dx + dy * dy);
        }
        const speedNow = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speedNow > LOOM_OUTSIDE_MAX_SPEED && speedNow > 0) {
          const capScale = LOOM_OUTSIDE_MAX_SPEED / speedNow;
          p.vx *= capScale;
          p.vy *= capScale;
        }
        // Fall through to inside suppression so newly-corrected motes
        // don't retain their outward velocity after being snapped back.
      }

      if (!p.isLockedToPointer) {
        // ── Inside: smooth outward suppression + minimum velocity ──
        // Also runs immediately after position correction above so motes
        // snapped back to the edge have their outward velocity zeroed.
        const nx = dist > 0.01 ? dx / dist : 0;
        const ny = dist > 0.01 ? dy / dist : 0;
        const ratio = dist / field.outerRadius; // 0..1

        const radialV = p.vx * nx + p.vy * ny; // positive = outward
        if (radialV > 0) {
          // Suppression multiplier fades from 1 (centre) to 0 (edge)
          const multiplier = Math.pow(Math.max(0, 1 - ratio), LOOM_SMOOTH_DAMP_POWER);
          // Remove the fraction of outward velocity that the multiplier suppresses
          const toRemove = radialV * (1 - multiplier);
          p.vx -= nx * toRemove;
          p.vy -= ny * toRemove;
        }

        // Inner zone minimum tangential velocity (swirl, not outward)
        if (ratio < 0.75) {
          const minV = ratio < 0.25
            ? p.minVelocity * 2.0
            : ratio < 0.5
            ? p.minVelocity * 1.5
            : p.minVelocity;
          // Tangential component: positive = CCW relative to outward radial
          const tangV = -p.vx * ny + p.vy * nx;
          const tangSpeed = Math.abs(tangV);
          if (tangSpeed < minV) {
            const dir = tangV >= 0 ? 1 : -1;
            const boost = (minV - tangSpeed) * dir;
            p.vx -= ny * boost;
            p.vy += nx * boost;
          }
        }
      }

      // ── Dev diagnostics ──────────────────────────────────────────
      if (doLog) {
        const distFinal = Math.sqrt((p.x - field.x) ** 2 + (p.y - field.y) ** 2);
        const speedAfter = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        console.debug(
          `[loomContainment] field=${field.id} tier=${p.tierId}`,
          `dist=${distFinal.toFixed(1)}/${field.outerRadius.toFixed(1)}`,
          `speed: ${speedBefore.toFixed(3)}→${speedAfter.toFixed(3)}`,
        );
      }

      break; // each particle tier matches at most one loom field
    }
  }
}
