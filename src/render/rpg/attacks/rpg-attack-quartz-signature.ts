/**
 * rpg-attack-quartz-signature.ts - Quartz boss beat-step splitting missiles.
 *
 * Each missile moves once per 60 BPM beat with smooth acceleration/deceleration
 * and lands exactly at the next node when the beat completes.
 */

import type {
  QuartzSignatureAttackInstance,
  QuartzSignatureMissile,
} from '../rpg-boss-attack-types';

const BEAT_MS = 1000;
const MISSILE_RADIUS = 7;
const TRAIL_HALF_WIDTH = 5;
const MAX_TRAIL_SEGMENTS = 16;

export function spawnQuartzSignatureAttack(
  _bossX: number,
  _bossY: number,
  dim: { w: number; h: number },
  params: Record<string, number | boolean | string>,
  difficulty: number,
): QuartzSignatureAttackInstance {
  const stepDistance = (params.stepDistance as number | undefined) ?? 112;
  const startX = (params.startX as number | undefined) ?? dim.w * 0.5;
  const startY = (params.startY as number | undefined) ?? -18;
  const firstStopY = (params.firstStopY as number | undefined) ?? 90;
  const maxIteration = (params.maxIteration as number | undefined) ?? 3;
  const trailHazardMs = (params.trailHazardMs as number | undefined) ?? BEAT_MS * 2;
  const trailFadeMs = (params.trailFadeMs as number | undefined) ?? 450;

  return {
    kind: 'quartzSignature',
    ageMs: 0,
    durationMs: BEAT_MS * (maxIteration + 1) + trailHazardMs + trailFadeMs,
    missiles: [{
      x: startX,
      y: startY,
      fromX: startX,
      fromY: startY,
      toX: startX,
      toY: firstStopY,
      angle: Math.PI / 2,
      iteration: 0,
      beatProgressMs: 0,
      active: true,
    }],
    trailSegments: [],
    beatMs: BEAT_MS,
    stepDistance,
    maxIteration,
    trailHazardMs,
    trailFadeMs,
    color: '#f7f2e8',
    glowColor: '#fff9d6',
    difficulty,
  };
}

export function updateQuartzSignatureAttack(
  atk: QuartzSignatureAttackInstance,
  _playerX: number,
  _playerY: number,
  _dim: { w: number; h: number },
  deltaMs: number,
): void {
  atk.ageMs += deltaMs;

  for (let i = atk.trailSegments.length - 1; i >= 0; i--) {
    const segment = atk.trailSegments[i];
    segment.ageMs += deltaMs;
    if (segment.ageMs >= atk.trailHazardMs + atk.trailFadeMs) {
      atk.trailSegments.splice(i, 1);
    }
  }

  for (let i = atk.missiles.length - 1; i >= 0; i--) {
    const missile = atk.missiles[i];
    if (!missile.active) continue;
    missile.beatProgressMs += deltaMs;
    const t = Math.min(1, missile.beatProgressMs / atk.beatMs);
    const eased = t * t * (3 - 2 * t);
    missile.x = missile.fromX + (missile.toX - missile.fromX) * eased;
    missile.y = missile.fromY + (missile.toY - missile.fromY) * eased;

    if (t >= 1) {
      missile.x = missile.toX;
      missile.y = missile.toY;
      _addTrailSegment(atk, missile.fromX, missile.fromY, missile.toX, missile.toY, missile.iteration);
      missile.active = false;
      if (missile.iteration < atk.maxIteration) {
        _splitMissile(atk, missile);
      }
    }
  }

  for (let i = atk.missiles.length - 1; i >= 0; i--) {
    if (!atk.missiles[i].active) atk.missiles.splice(i, 1);
  }
}

export function getQuartzSignatureHazardCircles(
  atk: QuartzSignatureAttackInstance,
): Array<{ x: number; y: number; r: number; damage: number }> {
  const result: Array<{ x: number; y: number; r: number; damage: number }> = [];
  for (const missile of atk.missiles) {
    if (missile.active) result.push({ x: missile.x, y: missile.y, r: MISSILE_RADIUS, damage: 13 });
  }
  return result;
}

export function getQuartzSignatureHazardCapsules(
  atk: QuartzSignatureAttackInstance,
): Array<{ x1: number; y1: number; x2: number; y2: number; r: number }> {
  const result: Array<{ x1: number; y1: number; x2: number; y2: number; r: number }> = [];
  for (const segment of atk.trailSegments) {
    if (segment.ageMs <= segment.hazardMs) {
      result.push({ x1: segment.x1, y1: segment.y1, x2: segment.x2, y2: segment.y2, r: TRAIL_HALF_WIDTH });
    }
  }
  return result;
}

function _splitMissile(atk: QuartzSignatureAttackInstance, source: QuartzSignatureMissile): void {
  const nextIteration = source.iteration + 1;
  const baseAngle = source.iteration === 0 ? Math.PI / 2 : source.angle;
  _pushMissile(atk, source.x, source.y, baseAngle - Math.PI / 4, nextIteration);
  _pushMissile(atk, source.x, source.y, baseAngle + Math.PI / 4, nextIteration);
}

function _pushMissile(
  atk: QuartzSignatureAttackInstance,
  x: number,
  y: number,
  angle: number,
  iteration: number,
): void {
  atk.missiles.push({
    x,
    y,
    fromX: x,
    fromY: y,
    toX: x + Math.cos(angle) * atk.stepDistance,
    toY: y + Math.sin(angle) * atk.stepDistance,
    angle,
    iteration,
    beatProgressMs: 0,
    active: true,
  });
}

function _addTrailSegment(
  atk: QuartzSignatureAttackInstance,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  iteration: number,
): void {
  atk.trailSegments.push({
    x1,
    y1,
    x2,
    y2,
    iteration,
    ageMs: 0,
    hazardMs: atk.trailHazardMs,
  });
  if (atk.trailSegments.length > MAX_TRAIL_SEGMENTS) atk.trailSegments.shift();
}
