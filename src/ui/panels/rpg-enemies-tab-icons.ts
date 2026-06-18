/**
 * rpg-enemies-tab-icons.ts — Icon rendering helpers for the RPG enemies bestiary tab.
 *
 * Provides:
 *   - createAlivenIconCanvas: animated mini-sim canvas for swarm-type enemies.
 *   - createProcIconCanvas: animated canvas reusing procedural draw functions.
 *   - drawEnemyIcon: static icon for regular enemies.
 *   - drawBossIcon: static icon for boss entries.
 *   - drawPolygonPath: utility for polygon rendering.
 *
 * All functions are used by rpg-enemies-tab.ts to build enemy entry cards.
 */

import {
  BOSS_COLORS, BOSS_GLOW_COLORS, BOSS_SIZE_BASE,
} from '../../render/rpg/rpg-constants';
import type { EnemyCatalogEntry } from './rpg-enemies-catalog';
import type {
  DustWispEnemy, RibbonWormEnemy, LanternMothEnemy, EyeStalkEnemy,
  JellyfishEnemy, ClothGhostEnemy, PlantTurretEnemy, GearInsectEnemy,
  SpiderCrawlerEnemy, MoteSwarmEnemy, ShadowHandEnemy,
  SandFishEnemy, QuartzFishEnemy, RubyFishEnemy, SunstoneFishEnemy,
  EmeraldFishEnemy, SapphireFishEnemy, AmethystFishEnemy, DiamondFishEnemy,
} from '../../render/rpg/rpg-procedural-types';
import {
  drawDustWispEnemies, drawRibbonWormEnemies, drawLanternMothEnemies,
  drawEyeStalkEnemies, drawJellyfishEnemies, drawClothGhostEnemies,
  drawPlantTurretEnemies, drawGearInsectEnemies, drawSpiderCrawlerEnemies,
  drawMoteSwarmEnemies, drawShadowHandEnemies,
  drawSandFishEnemies, drawQuartzFishEnemies, drawRubyFishEnemies, drawSunstoneFishEnemies,
  drawEmeraldFishEnemies, drawSapphireFishEnemies, drawAmethystFishEnemies, drawDiamondFishEnemies,
} from '../../render/rpg/rpg-procedural-draw';
import {
  RIBBONWORM_SEG_COUNT, MOTESWARM_MOTE_COUNT,
  QUARTZFISH_SHIELD_HP,
  RUBYFISH_DASH_WINDUP_MS,
  SUNSTONEFISH_MINE_CD_MS,
  SAPPHIREFISH_BOLT_CD_MS,
  AMETHYSTFISH_TELEPORT_CD_MS,
  DIAMONDFISH_ARMOR_OFF_MS,
} from '../../render/rpg/rpg-procedural-constants';
import { createRpgPathState } from '../../render/rpg/terrain/rpg-pathfinding';

// ─── Icon canvas size ─────────────────────────────────────────────

export const ICON_SIZE = 54;

// ─── Animated aliven mini-sim ─────────────────────────────────────

interface MiniParticle {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  color: string;
  glowColor: string;
  phase: number;
}

/**
 * Creates an animated canvas that simulates a small cluster of aliven
 * particles bouncing inside the icon box. The RAF loop stops automatically
 * once the canvas is removed from the DOM.
 */
export function createAlivenIconCanvas(entry: EnemyCatalogEntry): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width  = ICON_SIZE;
  canvas.height = ICON_SIZE;
  canvas.style.cssText = 'flex-shrink:0;border-radius:4px;background:rgba(0,0,0,0.5);';

  // Cache the context once — it remains valid for the canvas's lifetime.
  const ctx2 = canvas.getContext('2d');
  if (!ctx2) return canvas;
  // ctx2 is guaranteed non-null here; use non-null assertion inside the RAF closure.
  const drawCtx = ctx2;

  // Use 6 particles for the mini-sim regardless of actual count.
  const count   = 6;
  const iconR   = Math.max(1.5, Math.min(entry.size / 2, 4));
  const margin  = iconR + 3;
  const particles: MiniParticle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x:        margin + Math.random() * (ICON_SIZE - margin * 2),
      y:        margin + Math.random() * (ICON_SIZE - margin * 2),
      vx:       (Math.random() - 0.5) * 0.08,
      vy:       (Math.random() - 0.5) * 0.08,
      r:        iconR,
      color:    entry.color,
      glowColor: entry.glowColor,
      phase:    Math.random() * Math.PI * 2,
    });
  }

  let lastTime = performance.now();
  let rafId = 0;

  function frame(t: number): void {
    if (!canvas.isConnected) {
      cancelAnimationFrame(rafId);
      return;
    }
    const dt = Math.min(t - lastTime, 50);
    lastTime = t;

    drawCtx.clearRect(0, 0, ICON_SIZE, ICON_SIZE);
    drawCtx.fillStyle = 'rgba(0,0,0,0.55)';
    drawCtx.fillRect(0, 0, ICON_SIZE, ICON_SIZE);

    for (const p of particles) {
      // Wander noise
      p.vx += (Math.random() - 0.5) * 0.0001 * dt;
      p.vy += (Math.random() - 0.5) * 0.0001 * dt;
      // Gentle pull toward centre
      const dcx = ICON_SIZE / 2 - p.x;
      const dcy = ICON_SIZE / 2 - p.y;
      const dist = Math.sqrt(dcx * dcx + dcy * dcy);
      if (dist > 3) {
        p.vx += (dcx / dist) * 0.00008 * dt;
        p.vy += (dcy / dist) * 0.00008 * dt;
      }
      // Speed cap + friction
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > 0.12) { p.vx *= 0.12 / speed; p.vy *= 0.12 / speed; }
      p.vx *= 0.985; p.vy *= 0.985;
      // Integrate
      p.x += p.vx * dt; p.y += p.vy * dt;
      // Bounce
      const m = p.r + 2;
      if (p.x < m)              { p.x = m;              p.vx =  Math.abs(p.vx); }
      if (p.x > ICON_SIZE - m)  { p.x = ICON_SIZE - m;  p.vx = -Math.abs(p.vx); }
      if (p.y < m)              { p.y = m;              p.vy =  Math.abs(p.vy); }
      if (p.y > ICON_SIZE - m)  { p.y = ICON_SIZE - m;  p.vy = -Math.abs(p.vy); }
      // Advance phase
      p.phase += dt * 0.003;
      // Draw
      const pf = 0.8 + 0.2 * Math.sin(p.phase);
      drawCtx.save();
      drawCtx.shadowBlur  = p.r * 3.5;
      drawCtx.shadowColor = p.glowColor;
      drawCtx.globalAlpha = 0.90;
      drawCtx.fillStyle   = p.color;
      drawCtx.beginPath();
      drawCtx.arc(p.x, p.y, p.r * pf, 0, Math.PI * 2);
      drawCtx.fill();
      drawCtx.restore();
    }

    rafId = requestAnimationFrame(frame);
  }

  rafId = requestAnimationFrame(frame);
  return canvas;
}

// ─── Procedural enemy mini-sim ────────────────────────────────────

/**
 * Creates an animated canvas that renders a small preview of a procedural enemy
 * using the same draw functions used in gameplay. The preview object is kept
 * in-place (not moving) with only animation phases advancing each frame.
 * The RAF loop stops automatically once the canvas is removed from the DOM.
 */
export function createProcIconCanvas(entry: EnemyCatalogEntry): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width  = ICON_SIZE;
  canvas.height = ICON_SIZE;
  canvas.style.cssText = 'flex-shrink:0;border-radius:4px;background:rgba(0,0,0,0.5);';

  const ctx2 = canvas.getContext('2d');
  if (!ctx2) return canvas;
  // ctx2 is guaranteed non-null here; capture as drawCtx so the closure is non-nullable.
  const drawCtx = ctx2;

  const cx = ICON_SIZE / 2;
  const cy = ICON_SIZE / 2;

  // Base fields shared by all proc preview objects.
  const base = { x: cx, y: cy, vx: 0, vy: 0, hp: 100, maxHp: 100, atk: 10, def: 2, hitFlashMs: 0, contactCdMs: 0 };

  // Build a preview state object specific to this enemy type.
  // These are plain objects typed via a tagged union so TypeScript knows the shape.
  type ProcState =
    | { kind: 'dustwisp';      e: DustWispEnemy }
    | { kind: 'ribbonworm';    e: RibbonWormEnemy }
    | { kind: 'lanternmoth';   e: LanternMothEnemy }
    | { kind: 'eyestalk';      e: EyeStalkEnemy }
    | { kind: 'jellyfish';     e: JellyfishEnemy }
    | { kind: 'clothghost';    e: ClothGhostEnemy }
    | { kind: 'plantturret';   e: PlantTurretEnemy }
    | { kind: 'gearinsect';    e: GearInsectEnemy }
    | { kind: 'spidercrawler'; e: SpiderCrawlerEnemy }
    | { kind: 'moteswarm';     e: MoteSwarmEnemy }
    | { kind: 'shadowhand';    e: ShadowHandEnemy }
    | { kind: 'sandfish';      e: SandFishEnemy }
    | { kind: 'quartzfish';    e: QuartzFishEnemy }
    | { kind: 'rubyfish';      e: RubyFishEnemy }
    | { kind: 'sunstonefish';  e: SunstoneFishEnemy }
    | { kind: 'emeraldfish';   e: EmeraldFishEnemy }
    | { kind: 'sapphirefish';  e: SapphireFishEnemy }
    | { kind: 'amethystfish';  e: AmethystFishEnemy }
    | { kind: 'diamondfish';   e: DiamondFishEnemy };

  let state: ProcState | null = null;
  const ap = Math.random() * Math.PI * 2;

  // Build segX/segY for RibbonWorm preview — pre-positioned in a gentle arc.
  function makeRibbonSegs(startX: number, startY: number): { segX: Float64Array; segY: Float64Array } {
    const segX = new Float64Array(RIBBONWORM_SEG_COUNT);
    const segY = new Float64Array(RIBBONWORM_SEG_COUNT);
    for (let i = 0; i < RIBBONWORM_SEG_COUNT; i++) {
      // Spread segments in a gentle rightward diagonal for a visible worm shape.
      segX[i] = startX - i * 2.5;
      segY[i] = startY + i * 1.5;
    }
    return { segX, segY };
  }

  // Build moteAngles for MoteSwarm preview.
  function makeMoteAngles(): Float64Array {
    const angles = new Float64Array(MOTESWARM_MOTE_COUNT);
    for (let i = 0; i < MOTESWARM_MOTE_COUNT; i++) {
      angles[i] = (i / MOTESWARM_MOTE_COUNT) * Math.PI * 2;
    }
    return angles;
  }

  switch (entry.id) {
    case 'proc_dustwisp':
      state = { kind: 'dustwisp',   e: { ...base, kind: 'proc_dustwisp', animPhase: ap, patrolTimerMs: 0 } };
      break;
    case 'proc_ribbonworm': {
      const { segX, segY } = makeRibbonSegs(cx, cy);
      state = { kind: 'ribbonworm', e: { ...base, kind: 'proc_ribbonworm', animPhase: ap, segX, segY } };
      break;
    }
    case 'proc_lanternmoth':
      state = { kind: 'lanternmoth', e: { ...base, kind: 'proc_lanternmoth', animPhase: ap, flapPhase: ap } };
      break;
    case 'proc_eyestalk':
      state = { kind: 'eyestalk',   e: { ...base, kind: 'proc_eyestalk', animPhase: ap, stalkPhase: ap, eyeAngle: ap } };
      break;
    case 'proc_jellyfish': {
      const segX = new Float64Array(24).fill(cx), segY = new Float64Array(24).fill(cy);
      state = { kind: 'jellyfish', e: { ...base, kind: 'proc_jellyfish', animPhase: ap, bellPhase: ap, movementState: 'coast', stateTimerMs: 9999, facingRad: -Math.PI / 2, targetX: cx, targetY: cy, wanderPhase: ap, bellSize: 8, bellTint: '#96d8f0', pulseCadenceMs: 1900, tailCount: 4, segmentsPerTail: 6, segLength: 3.8, segX, segY, segPrevX: segX.slice(), segPrevY: segY.slice() } };
      break;
    }
    case 'proc_clothghost':
      state = { kind: 'clothghost', e: { ...base, kind: 'proc_clothghost', animPhase: ap, flutterPhase: ap } };
      break;
    case 'proc_plantturret':
      // Position the plant turret slightly lower so the stem and flower both fit.
      state = { kind: 'plantturret', e: { ...base, x: cx, y: cy + 4, kind: 'proc_plantturret', animPhase: ap, stemPhase: ap, fireTimerMs: 9999, rootX: cx, rootY: cy + 4 } };
      break;
    case 'proc_gearinsect':
      state = { kind: 'gearinsect', e: { ...base, kind: 'proc_gearinsect', animPhase: ap, gearAngle: ap, legPhase: ap } };
      break;
    case 'proc_spidercrawler':
      state = { kind: 'spidercrawler', e: { ...base, kind: 'proc_spidercrawler', animPhase: ap, legPhase: ap } };
      break;
    case 'proc_moteswarm':
      state = { kind: 'moteswarm', e: { ...base, kind: 'proc_moteswarm', animPhase: ap, swarmAngle: ap, moteAngles: makeMoteAngles() } };
      break;
    case 'proc_shadowhand':
      // Show fingers partially extended for a recognisable preview.
      state = { kind: 'shadowhand', e: { ...base, kind: 'proc_shadowhand', animPhase: ap, graspPhase: 0, reachFraction: 0.55 } };
      break;
    case 'proc_sandfish':
      state = { kind: 'sandfish', e: { ...base, kind: 'proc_sandfish', animPhase: ap, swimAngle: 0, turnPhase: ap, lungeTimerMs: 1200, pathState: createRpgPathState(), stuckMs: 0, stuckRecoveryMs: 0 } };
      break;
    case 'proc_quartzfish':
      state = { kind: 'quartzfish', e: { ...base, kind: 'proc_quartzfish', animPhase: ap, swimAngle: 0, turnPhase: ap, shieldHp: QUARTZFISH_SHIELD_HP, shieldBroken: false, pathState: createRpgPathState(), stuckMs: 0, stuckRecoveryMs: 0 } };
      break;
    case 'proc_rubyfish':
      state = { kind: 'rubyfish', e: { ...base, kind: 'proc_rubyfish', animPhase: ap, swimAngle: 0, turnPhase: ap, dashState: 'idle', dashTimerMs: RUBYFISH_DASH_WINDUP_MS, dashVx: 0, dashVy: 0, pathState: createRpgPathState(), stuckMs: 0, stuckRecoveryMs: 0 } };
      break;
    case 'proc_sunstonefish':
      state = { kind: 'sunstonefish', e: { ...base, kind: 'proc_sunstonefish', animPhase: ap, swimAngle: 0, turnPhase: ap, mineTimerMs: SUNSTONEFISH_MINE_CD_MS, pathState: createRpgPathState(), stuckMs: 0, stuckRecoveryMs: 0 } };
      break;
    case 'proc_emeraldfish':
      state = { kind: 'emeraldfish', e: { ...base, kind: 'proc_emeraldfish', animPhase: ap, swimAngle: 0, turnPhase: ap, isMini: false, splitDone: false, pathState: createRpgPathState(), stuckMs: 0, stuckRecoveryMs: 0 } };
      break;
    case 'proc_sapphirefish':
      state = { kind: 'sapphirefish', e: { ...base, kind: 'proc_sapphirefish', animPhase: ap, swimAngle: 0, turnPhase: ap, boltTimerMs: SAPPHIREFISH_BOLT_CD_MS, pathState: createRpgPathState(), stuckMs: 0, stuckRecoveryMs: 0 } };
      break;
    case 'proc_amethystfish':
      state = { kind: 'amethystfish', e: { ...base, kind: 'proc_amethystfish', animPhase: ap, swimAngle: 0, turnPhase: ap, teleportCdMs: AMETHYSTFISH_TELEPORT_CD_MS, pathState: createRpgPathState(), stuckMs: 0, stuckRecoveryMs: 0 } };
      break;
    case 'proc_diamondfish':
      state = { kind: 'diamondfish', e: { ...base, kind: 'proc_diamondfish', animPhase: ap, swimAngle: 0, turnPhase: ap, armorActive: true, armorTimerMs: DIAMONDFISH_ARMOR_OFF_MS, pathState: createRpgPathState(), stuckMs: 0, stuckRecoveryMs: 0 } };
      break;
    default:
      return canvas;
  }

  let lastTime = performance.now();
  let rafId = 0;

  function frame(t: number): void {
    if (!canvas.isConnected) {
      cancelAnimationFrame(rafId);
      return;
    }
    if (state === null) return;

    const dt = Math.min(t - lastTime, 50);
    lastTime = t;

    // Advance animation phases (all proc types use animPhase; some have extra phases).
    const phaseStep = dt * 0.003;
    const e = state.e;
    e.animPhase += phaseStep;

    // Advance type-specific phases.
    switch (state.kind) {
      case 'lanternmoth':   state.e.flapPhase    += phaseStep * 1.2; break;
      case 'eyestalk':      state.e.stalkPhase   += phaseStep * 0.8; break;
      case 'jellyfish':     state.e.bellPhase    += phaseStep * 0.9; break;
      case 'clothghost':    state.e.flutterPhase += phaseStep * 1.1; break;
      case 'plantturret':   state.e.stemPhase    += phaseStep * 0.5; break;
      case 'gearinsect':    state.e.gearAngle    += phaseStep * 1.5; state.e.legPhase += phaseStep * 0.8; break;
      case 'spidercrawler': state.e.legPhase     += phaseStep * 0.9; break;
      case 'moteswarm':
        state.e.swarmAngle += phaseStep * 0.6;
        for (let i = 0; i < state.e.moteAngles.length; i++) {
          state.e.moteAngles[i] += phaseStep * 0.8;
        }
        break;
      case 'shadowhand':
        state.e.reachFraction = 0.4 + 0.35 * Math.sin(e.animPhase * 0.7);
        break;
      case 'sandfish':
      case 'quartzfish':
      case 'rubyfish':
      case 'sunstonefish':
      case 'emeraldfish':
      case 'sapphirefish':
      case 'amethystfish':
      case 'diamondfish':
        state.e.swimAngle = Math.sin(e.animPhase * 0.9) * 0.35;
        break;
      default: break;
    }

    drawCtx.clearRect(0, 0, ICON_SIZE, ICON_SIZE);
    drawCtx.fillStyle = 'rgba(0,0,0,0.55)';
    drawCtx.fillRect(0, 0, ICON_SIZE, ICON_SIZE);

    // Render using the real gameplay draw functions.
    switch (state.kind) {
      case 'dustwisp':      drawDustWispEnemies(drawCtx, [state.e]); break;
      case 'ribbonworm':    drawRibbonWormEnemies(drawCtx, [state.e]); break;
      case 'lanternmoth':   drawLanternMothEnemies(drawCtx, [state.e]); break;
      case 'eyestalk':      drawEyeStalkEnemies(drawCtx, [state.e]); break;
      case 'jellyfish':     drawJellyfishEnemies(drawCtx, [state.e]); break;
      case 'clothghost':    drawClothGhostEnemies(drawCtx, [state.e]); break;
      case 'plantturret':   drawPlantTurretEnemies(drawCtx, [state.e]); break;
      case 'gearinsect':    drawGearInsectEnemies(drawCtx, [state.e]); break;
      case 'spidercrawler': drawSpiderCrawlerEnemies(drawCtx, [state.e]); break;
      case 'moteswarm':     drawMoteSwarmEnemies(drawCtx, [state.e]); break;
      case 'shadowhand':    drawShadowHandEnemies(drawCtx, [state.e]); break;
      case 'sandfish':      drawSandFishEnemies(drawCtx, [state.e]); break;
      case 'quartzfish':    drawQuartzFishEnemies(drawCtx, [state.e]); break;
      case 'rubyfish':      drawRubyFishEnemies(drawCtx, [state.e]); break;
      case 'sunstonefish':  drawSunstoneFishEnemies(drawCtx, [state.e]); break;
      case 'emeraldfish':   drawEmeraldFishEnemies(drawCtx, [state.e]); break;
      case 'sapphirefish':  drawSapphireFishEnemies(drawCtx, [state.e]); break;
      case 'amethystfish':  drawAmethystFishEnemies(drawCtx, [state.e]); break;
      case 'diamondfish':   drawDiamondFishEnemies(drawCtx, [state.e]); break;
    }

    rafId = requestAnimationFrame(frame);
  }

  rafId = requestAnimationFrame(frame);
  return canvas;
}

export function drawPolygonPath(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  radius: number, sides: number,
): void {
  ctx.beginPath();
  for (let i = 0; i <= sides; i++) {
    // Start at the top (-π/2) so the first vertex points up for all polygons.
    const angle = -Math.PI / 2 + (i / sides) * Math.PI * 2;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function drawEnemyIcon(canvas: HTMLCanvasElement, entry: EnemyCatalogEntry): void {
  // Aliven entries get an animated mini-sim — callers handle this separately.
  // This function only handles static icons.
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, ICON_SIZE, ICON_SIZE);

  const cx = ICON_SIZE / 2;
  const cy = ICON_SIZE / 2;
  const s = entry.size;
  const half = s / 2;

  // Glow / aura
  if (entry.auraRadius) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = entry.glowColor;
    ctx.beginPath();
    ctx.arc(cx, cy, entry.auraRadius + s, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Shield ring
  if (entry.hasShield && entry.shieldRadius) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = entry.shieldColor ?? entry.glowColor;
    ctx.lineWidth = 1.2;
    ctx.shadowBlur = 6;
    ctx.shadowColor = entry.shieldColor ?? entry.glowColor;
    ctx.beginPath();
    ctx.arc(cx, cy, entry.shieldRadius * (ICON_SIZE / (ICON_SIZE * 1.6)), 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Main body
  ctx.save();
  ctx.shadowBlur = s * 3.5;
  ctx.shadowColor = entry.glowColor;
  ctx.fillStyle = entry.color;

  if (entry.shape === 'polygon' && entry.sides) {
    drawPolygonPath(ctx, cx, cy, half, entry.sides);
    ctx.fill();
    // Stroke the edge brighter
    ctx.shadowBlur  = 0;
    ctx.strokeStyle = entry.glowColor;
    ctx.lineWidth   = 1;
    drawPolygonPath(ctx, cx, cy, half, entry.sides);
    ctx.stroke();
  } else if (entry.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(cx, cy, half, 0, Math.PI * 2);
    ctx.fill();
  } else if (entry.shape === 'diamond') {
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-half, -half, s, s);
  } else {
    ctx.fillRect(cx - half, cy - half, s, s);
  }
  ctx.restore();
}

export function drawBossIcon(canvas: HTMLCanvasElement, bossId: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, ICON_SIZE, ICON_SIZE);

  const color = BOSS_COLORS[Math.min(bossId, BOSS_COLORS.length - 1)];
  const glowColor = BOSS_GLOW_COLORS[Math.min(bossId, BOSS_GLOW_COLORS.length - 1)];
  const bossSize = Math.min(BOSS_SIZE_BASE + bossId * 1.2, ICON_SIZE * 0.6);
  const half = bossSize / 2;
  const cx = ICON_SIZE / 2;
  const cy = ICON_SIZE / 2;

  // Outer glow ring
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = glowColor;
  ctx.beginPath();
  ctx.arc(cx, cy, half + 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Phase rings (3 rings for visual complexity)
  for (let r = 0; r < 3; r++) {
    const ringR = half * (0.55 + r * 0.2);
    ctx.save();
    ctx.globalAlpha = 0.35 - r * 0.08;
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Body (rotated diamond for distinctive boss look)
  ctx.save();
  ctx.shadowBlur = half * 3;
  ctx.shadowColor = glowColor;
  ctx.fillStyle = color;
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-half, -half, bossSize, bossSize);
  ctx.restore();
}
