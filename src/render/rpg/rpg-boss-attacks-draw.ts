/**
 * rpg-boss-attacks-draw.ts — Visual rendering for all boss special attack families.
 *
 * Each draw function wraps its canvas operations in ctx.save() / ctx.restore().
 * NeonTrailConfig objects are module-level constants (never allocated per frame).
 * All glow passes are batched: caller wraps the full drawBossAttacks call with
 * beginNeonGlowBatch / endNeonGlowBatch.
 */

import type { NeonTrailConfig } from './neon-trail-draw';
import {
  beginNeonGlowBatch, endNeonGlowBatch,
  drawNeonTrailGlow, drawNeonTrailCore,
} from './neon-trail-draw';
import type {
  BossAttackState,
  GravAttackInstance,
  HexAttackInstance,
  MandalaAttackInstance,
  MissileAttackInstance,
  QuartzSignatureAttackInstance,
  SwarmAttackInstance,
  TrailRing,
  VermiculateAttackInstance,
} from './rpg-boss-attack-types';
import { hexToWorld } from './attacks/rpg-attack-hex';

// ── Module-level NeonTrailConfig constants ────────────────────────────────────
// One config per logical style; shared by all instances of that family.

const GRAV_TRAIL_CFG: NeonTrailConfig = {
  coreColor: '#aaccff', glowColor: '#6699ff',
  coreHeadWidth: 2.5, coreTailWidth: 0.5, glowWidth: 7, taperSegments: 8,
};

const MANDALA_TRAIL_CFG: NeonTrailConfig = {
  coreColor: '#ffcc44', glowColor: '#ffaa00',
  coreHeadWidth: 2.0, coreTailWidth: 0.5, glowWidth: 6, taperSegments: 6,
};

const WORM_TRAIL_CFG: NeonTrailConfig = {
  coreColor: '#44ffbb', glowColor: '#00ddaa',
  coreHeadWidth: 3.0, coreTailWidth: 0.8, glowWidth: 9, taperSegments: 10,
};

const MISSILE_TRAIL_CFG: NeonTrailConfig = {
  coreColor: '#ff8844', glowColor: '#ff4400',
  coreHeadWidth: 2.5, coreTailWidth: 0.5, glowWidth: 8, taperSegments: 7,
};

const MOTHER_TRAIL_CFG: NeonTrailConfig = {
  coreColor: '#ff44ff', glowColor: '#cc00cc',
  coreHeadWidth: 3.5, coreTailWidth: 0.8, glowWidth: 11, taperSegments: 8,
};

const FOLLOWER_TRAIL_CFG: NeonTrailConfig = {
  coreColor: '#cc88ff', glowColor: '#9900cc',
  coreHeadWidth: 1.5, coreTailWidth: 0.3, glowWidth: 5, taperSegments: 5,
};

// ── Low-graphics mode ─────────────────────────────────────────────────────────

let _lowGraphics = false;

export function setDrawBossAttacksLowGraphics(enabled: boolean): void {
  _lowGraphics = enabled;
}

// ── Main draw entry point ─────────────────────────────────────────────────────

export function drawBossAttacks(
  ctx: CanvasRenderingContext2D,
  state: BossAttackState,
): void {
  if (state.attacks.length === 0) return;

  beginNeonGlowBatch(ctx);

  for (const atk of state.attacks) {
    switch (atk.kind) {
      case 'grav':        _drawGrav(ctx, atk as GravAttackInstance); break;
      case 'hexTrail':    _drawHex(ctx, atk as HexAttackInstance); break;
      case 'mandala':     _drawMandala(ctx, atk as MandalaAttackInstance); break;
      case 'vermiculate': _drawVermiculate(ctx, atk as VermiculateAttackInstance); break;
      case 'missileRing': _drawMissile(ctx, atk as MissileAttackInstance); break;
      case 'motherSwarm': _drawSwarm(ctx, atk as SwarmAttackInstance); break;
      case 'quartzSignature': _drawQuartzSignature(ctx, atk as QuartzSignatureAttackInstance); break;
    }
  }

  endNeonGlowBatch(ctx);
}

// ── Trail helper ──────────────────────────────────────────────────────────────

function _drawTrail(
  ctx: CanvasRenderingContext2D,
  trail: TrailRing,
  cfg: NeonTrailConfig,
  alpha: number,
): void {
  drawNeonTrailGlow(trail.pointsX, trail.pointsY, trail.head, trail.count, trail.cap, cfg, alpha);
  drawNeonTrailCore(ctx, trail.pointsX, trail.pointsY, trail.head, trail.count, trail.cap, cfg, alpha);
}

// ── Grav ──────────────────────────────────────────────────────────────────────

function _drawGrav(ctx: CanvasRenderingContext2D, atk: GravAttackInstance): void {
  const fadeRatio = Math.min(1, (atk.durationMs - atk.ageMs) / atk.trailPersistenceMs);

  for (const body of atk.bodies) {
    _drawTrail(ctx, body.trail, {
      ...GRAV_TRAIL_CFG,
      coreColor: body.color,
      glowColor: body.glowColor,
    }, fadeRatio);

    ctx.save();
    ctx.globalAlpha = fadeRatio;
    ctx.beginPath();
    ctx.arc(body.x, body.y, body.radius, 0, Math.PI * 2);
    ctx.fillStyle = body.color;
    ctx.shadowColor = body.glowColor;
    ctx.shadowBlur = _lowGraphics ? 0 : 8;
    ctx.fill();
    ctx.restore();
  }

  if (!_lowGraphics) {
    // Draw well markers
    for (const well of atk.wells) {
      ctx.save();
      ctx.globalAlpha = 0.35 * fadeRatio;
      ctx.beginPath();
      ctx.arc(well.x, well.y, 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#6699ff';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ── Hex trail ─────────────────────────────────────────────────────────────────

function _drawHex(ctx: CanvasRenderingContext2D, atk: HexAttackInstance): void {
  ctx.save();
  const globalFade = Math.min(1, (atk.durationMs - atk.ageMs) / 2000);
  ctx.globalAlpha = globalFade;

  for (const bolt of atk.bolts) {
    // Draw lingering segments
    for (const seg of bolt.segments) {
      const segAge = seg.lingeringMs / atk.lingeringTrailMs;
      const alpha  = Math.max(0, 1 - segAge) * globalFade;
      const isHazard = seg.ageMs < seg.hazardMs;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round';
      ctx.lineWidth = isHazard ? 2 : 1;
      ctx.strokeStyle = seg.color;
      if (!_lowGraphics) {
        ctx.shadowColor = seg.color;
        ctx.shadowBlur  = isHazard ? 8 : 3;
      }
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
      ctx.restore();
    }

    // Draw bolt head
    const headPos = hexToWorld(bolt.qNow, bolt.rNow, atk.cellSize, atk.originX, atk.originY);
    ctx.save();
    ctx.globalAlpha = globalFade;
    ctx.beginPath();
    ctx.arc(headPos.x, headPos.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = bolt.color;
    if (!_lowGraphics) {
      ctx.shadowColor = bolt.glowColor;
      ctx.shadowBlur  = 10;
    }
    ctx.fill();
    ctx.restore();

    // Warning indicator: dim target cell
    if (bolt.isWarning && (bolt.qNext !== bolt.qNow || bolt.rNext !== bolt.rNow)) {
      const warnPos = hexToWorld(bolt.qNext, bolt.rNext, atk.cellSize, atk.originX, atk.originY);
      ctx.save();
      ctx.globalAlpha = 0.4 * globalFade;
      ctx.beginPath();
      ctx.arc(warnPos.x, warnPos.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = bolt.color;
      ctx.fill();
      ctx.restore();

      // Dim warning segment line
      ctx.save();
      ctx.globalAlpha = 0.25 * globalFade;
      ctx.lineCap = 'round';
      ctx.lineWidth = 1;
      ctx.strokeStyle = bolt.color;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(headPos.x, headPos.y);
      ctx.lineTo(warnPos.x, warnPos.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
  ctx.restore();

  // Draw hex bolt heads as simple circles (avoids per-frame Float64Array allocation)
  for (const bolt of atk.bolts) {
    const headPos = hexToWorld(bolt.qNow, bolt.rNow, atk.cellSize, atk.originX, atk.originY);
    ctx.save();
    ctx.globalAlpha = globalFade * 0.95;
    if (!_lowGraphics) { ctx.shadowBlur = 10; ctx.shadowColor = bolt.glowColor; }
    ctx.fillStyle = bolt.color;
    ctx.beginPath();
    ctx.arc(headPos.x, headPos.y, 4, 0, Math.PI * 2);
    ctx.fill();
    // Inner bright core
    ctx.globalAlpha = globalFade;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(headPos.x, headPos.y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

// ── Mandala ───────────────────────────────────────────────────────────────────

function _drawMandala(ctx: CanvasRenderingContext2D, atk: MandalaAttackInstance): void {
  const globalFade = Math.min(1, (atk.durationMs - atk.ageMs) / 1500);

  for (const p of atk.projectiles) {
    const trailCfg: NeonTrailConfig = {
      ...MANDALA_TRAIL_CFG,
      coreColor: p.color,
      glowColor: p.glowColor,
    };
    _drawTrail(ctx, p.trail, trailCfg, globalFade);

    ctx.save();
    ctx.globalAlpha = globalFade;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    if (!_lowGraphics) {
      ctx.shadowColor = p.glowColor;
      ctx.shadowBlur  = 7;
    }
    ctx.fill();
    ctx.restore();
  }
}

// ── Vermiculate ───────────────────────────────────────────────────────────────

function _drawVermiculate(ctx: CanvasRenderingContext2D, atk: VermiculateAttackInstance): void {
  const globalFade = Math.min(1, (atk.durationMs - atk.ageMs) / atk.trailPersistenceMs);

  for (const worm of atk.worms) {
    _drawTrail(ctx, worm.trail, {
      ...WORM_TRAIL_CFG,
      coreColor: worm.color,
      glowColor: worm.glowColor,
    }, globalFade);

    ctx.save();
    ctx.globalAlpha = globalFade;
    ctx.beginPath();
    ctx.arc(worm.x, worm.y, worm.radius, 0, Math.PI * 2);
    ctx.fillStyle = worm.color;
    if (!_lowGraphics) {
      ctx.shadowColor = worm.glowColor;
      ctx.shadowBlur  = 10;
    }
    ctx.fill();
    ctx.restore();
  }
}

// ── Missile ring ──────────────────────────────────────────────────────────────

function _drawMissile(ctx: CanvasRenderingContext2D, atk: MissileAttackInstance): void {
  for (const m of atk.missiles) {
    if (!m.hasFired) continue;

    const stateAlpha = m.state === 'fading' ? Math.max(0, 1 - m.stateTimerMs / 400) : 1;

    if (m.state === 'flying') {
      _drawTrail(ctx, m.trail, {
        ...MISSILE_TRAIL_CFG,
        coreColor: m.color,
        glowColor: m.glowColor,
      }, stateAlpha);

      ctx.save();
      ctx.globalAlpha = stateAlpha;
      ctx.translate(m.x, m.y);
      ctx.rotate(m.angle);
      ctx.beginPath();
      ctx.moveTo(5, 0);
      ctx.lineTo(-4, 3);
      ctx.lineTo(-4, -3);
      ctx.closePath();
      ctx.fillStyle = m.color;
      if (!_lowGraphics) {
        ctx.shadowColor = m.glowColor;
        ctx.shadowBlur  = 9;
      }
      ctx.fill();
      ctx.restore();
    }

    if (m.state === 'exploding' || m.state === 'lingering' || m.state === 'fading') {
      ctx.save();
      ctx.globalAlpha = stateAlpha * (m.state === 'exploding' ? 0.9 : 0.6);
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.explodeRingRadius, 0, Math.PI * 2);
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 2.5;
      if (!_lowGraphics) {
        ctx.shadowColor = m.glowColor;
        ctx.shadowBlur  = 12;
      }
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ── Mother swarm ──────────────────────────────────────────────────────────────

function _drawQuartzSignature(ctx: CanvasRenderingContext2D, atk: QuartzSignatureAttackInstance): void {
  for (const segment of atk.trailSegments) {
    const fadeAge = Math.max(0, segment.ageMs - segment.hazardMs);
    const alpha = segment.ageMs <= segment.hazardMs
      ? 0.95
      : Math.max(0, 1 - fadeAge / atk.trailFadeMs) * 0.95;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = atk.color;
    ctx.lineWidth = 10;
    if (!_lowGraphics) {
      ctx.shadowColor = atk.glowColor;
      ctx.shadowBlur = 12;
    }
    ctx.beginPath();
    ctx.moveTo(segment.x1, segment.y1);
    ctx.lineTo(segment.x2, segment.y2);
    ctx.stroke();
    ctx.restore();
  }

  for (const missile of atk.missiles) {
    if (!missile.active) continue;
    ctx.save();
    ctx.translate(missile.x, missile.y);
    ctx.rotate(missile.angle);
    ctx.fillStyle = atk.color;
    ctx.strokeStyle = '#bdb6a8';
    ctx.lineWidth = 1;
    if (!_lowGraphics) {
      ctx.shadowColor = atk.glowColor;
      ctx.shadowBlur = 14;
    }
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(0, 8);
    ctx.lineTo(-8, 0);
    ctx.lineTo(0, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function _drawSwarm(ctx: CanvasRenderingContext2D, atk: SwarmAttackInstance): void {
  const globalFade = Math.min(1, (atk.durationMs - atk.ageMs) / atk.trailPersistenceMs);

  // Followers
  for (const f of atk.followers) {
    _drawTrail(ctx, f.trail, {
      ...FOLLOWER_TRAIL_CFG,
      coreColor: f.color,
      glowColor: f.glowColor,
    }, globalFade * 0.8);

    ctx.save();
    ctx.globalAlpha = globalFade * 0.75;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
    ctx.fillStyle = f.color;
    if (!_lowGraphics) {
      ctx.shadowColor = f.glowColor;
      ctx.shadowBlur  = 5;
    }
    ctx.fill();
    ctx.restore();
  }

  // Mother
  const m = atk.mother;
  _drawTrail(ctx, m.trail, {
    ...MOTHER_TRAIL_CFG,
    coreColor: m.color,
    glowColor: m.glowColor,
  }, globalFade);

  ctx.save();
  ctx.globalAlpha = globalFade;
  ctx.beginPath();
  ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
  ctx.fillStyle = m.color;
  if (!_lowGraphics) {
    ctx.shadowColor = m.glowColor;
    ctx.shadowBlur  = 14;
  }
  ctx.fill();
  ctx.restore();
}
