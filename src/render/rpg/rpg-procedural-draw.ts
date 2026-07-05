/**
 * rpg-procedural-draw.ts — Canvas rendering for the 11 procedural creature types.
 *
 * Each draw function receives an explicit CanvasRenderingContext2D so the
 * functions can be called from rpg-render-draw.ts without any closure coupling.
 *
 * Visual identity per creature:
 *   DustWisp     — soft radial gradient with three slow-orbit sparkle dots
 *   RibbonWorm   — chain of shrinking circles, body colour on segments
 *   LanternMoth  — teardrop body + two wing ellipses that flap up/down
 *   EyeStalk     — blob base, arched stalk line, iris + pupil circle
 *   Jellyfish    — semi-circle bell (expands/contracts) with trailing tentacle lines
 *   ClothGhost   — three-point flowing sheet rendered as a bezier fill
 *   PlantTurret  — Y-shaped stem with a circular flower-head
 *   GearInsect   — central gear polygon + 6 leg lines
 *   SpiderCrawler— oval body + 8 radiating leg pairs
 *   MoteSwarm    — small core + 5 orbiting coloured dots
 *   ShadowHand   — dark palm arc + 4 finger lines reaching toward player
 *   PlantProjectile — small spinning hexagon
 */

import type {
  DustWispEnemy, RibbonWormEnemy, LanternMothEnemy, EyeStalkEnemy,
  JellyfishEnemy, ClothGhostEnemy, PlantTurretEnemy, GearInsectEnemy,
  SpiderCrawlerEnemy, MoteSwarmEnemy, ShadowHandEnemy, PlantProjectile,
  SandFishEnemy, QuartzFishEnemy, RubyFishEnemy, SunstoneFishEnemy,
  EmeraldFishEnemy, SapphireFishEnemy, AmethystFishEnemy, DiamondFishEnemy,
  FishMine, FishSpike, FishBolt, FishDecoy,
} from './rpg-procedural-types';
import type { EliteJellyfishEnemy } from './rpg-jellyfish-elite-types';
import { drawEliteJellyfishEnemies, setEliteJellyfishLowGraphics } from './rpg-jellyfish-elite-draw';
import {
  DUSTWISP_SIZE, DUSTWISP_COLOR, DUSTWISP_GLOW,
  RIBBONWORM_SIZE, RIBBONWORM_COLOR, RIBBONWORM_GLOW,
  LANTERNMOTH_SIZE, LANTERNMOTH_COLOR, LANTERNMOTH_GLOW,
  EYESTALK_SIZE, EYESTALK_COLOR, EYESTALK_GLOW,
  JELLYFISH_SIZE, JELLYFISH_GLOW,
  CLOTHGHOST_SIZE, CLOTHGHOST_COLOR, CLOTHGHOST_GLOW,
  PLANTTURRET_SIZE, PLANTTURRET_COLOR, PLANTTURRET_GLOW,
  GEARINSECT_SIZE, GEARINSECT_COLOR, GEARINSECT_GLOW,
  SPIDERCRAWLER_SIZE, SPIDERCRAWLER_COLOR, SPIDERCRAWLER_GLOW,
  MOTESWARM_SIZE, MOTESWARM_COLOR, MOTESWARM_GLOW, MOTESWARM_ORBIT_DIST, MOTESWARM_MOTE_COUNT,
  SHADOWHAND_SIZE, SHADOWHAND_COLOR, SHADOWHAND_GLOW,
  PLANT_PROJ_SIZE, PLANT_PROJ_COLOR, PLANT_PROJ_GLOW,
  LANTERNMOTH_PULSE_RADIUS,
  EYESTALK_CHARGE_MS, EYESTALK_BEAM_HALFWIDTH_RAD, EYESTALK_BEAM_RANGE,
  CLOTHGHOST_WRAP_RANGE,
  PLANTTURRET_BUD_OPEN_MS, PLANTTURRET_RECOIL_MS,
  SPIDERCRAWLER_WEB_ACTIVE_MS, SPIDERCRAWLER_WEB_HALFWIDTH_RAD, SPIDERCRAWLER_WEB_RANGE,
} from './rpg-procedural-constants';
import {
  drawSandFishEnemies, drawQuartzFishEnemies, drawRubyFishEnemies,
  drawSunstoneFishEnemies, drawEmeraldFishEnemies, drawSapphireFishEnemies,
  drawAmethystFishEnemies, drawDiamondFishEnemies,
  drawFishMines, drawFishSpikes, drawFishBolts, drawFishDecoys,
  setFishDrawLowGraphics,
} from './rpg-procedural-fish-draw';
import { ENEMY_HEALTH_BAR_VISIBLE_THRESHOLD, enemyHealthFraction, shouldDrawEnemyHealthBar } from './rpg-health-bar';

// Re-export fish draw functions so consumers that import from this module continue to work.
export * from './rpg-procedural-fish-draw';

// ── Low-graphics flag ─────────────────────────────────────────────────────────
let isLowGraphicsMode = false;
export function setProcLowGraphicsMode(enabled: boolean): void {
  isLowGraphicsMode = enabled;
  setFishDrawLowGraphics(enabled);
  setEliteJellyfishLowGraphics(enabled);
}

// ── Shared glow helper ─────────────────────────────────────────────────────────
function applyGlow(ctx: CanvasRenderingContext2D, color: string, blur: number): void {
  if (isLowGraphicsMode) return;
  ctx.shadowBlur  = blur;
  ctx.shadowColor = color;
}
function clearGlow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowBlur = 0;
}

/** HP-bar fraction 0-1. */
function hpFrac(e: { hp: number; maxHp: number }): number {
  return enemyHealthFraction(e);
}

/** Draw a small hit-flash overlay (white circle, fades quickly). */
function drawHitFlash(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, flashMs: number): void {
  if (flashMs <= 0 || isLowGraphicsMode) return;
  ctx.save();
  ctx.globalAlpha = Math.min(flashMs / 80, 1) * 0.7;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x, y, r * 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Draw an HP bar 2px tall below the enemy. */
function drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, frac: number): void {
  if (frac >= ENEMY_HEALTH_BAR_VISIBLE_THRESHOLD) return;
  const w = r * 2.5, h = 2, bx = x - w / 2, by = y + r + 2;
  ctx.fillStyle = '#333';
  ctx.fillRect(bx, by, w, h);
  ctx.fillStyle = frac > 0.5 ? '#44ff44' : frac > 0.25 ? '#ffaa00' : '#ff3333';
  ctx.fillRect(bx, by, w * frac, h);
}

// ── Dust Wisp ──────────────────────────────────────────────────────────────────

export function drawDustWispEnemies(
  canvas: CanvasRenderingContext2D,
  enemies: DustWispEnemy[],
): void {
  for (const e of enemies) {
    canvas.save();
    const pulse = 0.7 + 0.3 * Math.sin(e.animPhase * 2.2);
    applyGlow(canvas, DUSTWISP_GLOW, 10 * pulse);
    canvas.globalAlpha = 0.85 * pulse;
    canvas.fillStyle = DUSTWISP_COLOR;
    canvas.beginPath(); canvas.arc(e.x, e.y, DUSTWISP_SIZE, 0, Math.PI * 2); canvas.fill();
    // Three orbiting sparkle dots
    for (let i = 0; i < 3; i++) {
      const a = e.animPhase * 1.5 + (i / 3) * Math.PI * 2;
      const ox = e.x + Math.cos(a) * (DUSTWISP_SIZE + 4);
      const oy = e.y + Math.sin(a) * (DUSTWISP_SIZE + 4);
      canvas.beginPath(); canvas.arc(ox, oy, 1.5, 0, Math.PI * 2); canvas.fill();
    }
    clearGlow(canvas);
    canvas.globalAlpha = 1;
    drawHitFlash(canvas, e.x, e.y, DUSTWISP_SIZE, e.hitFlashMs);
    if (shouldDrawEnemyHealthBar(e)) drawHpBar(canvas, e.x, e.y, DUSTWISP_SIZE, hpFrac(e));
    canvas.restore();
  }
}

// ── Ribbon Worm ────────────────────────────────────────────────────────────────

export function drawRibbonWormEnemies(
  canvas: CanvasRenderingContext2D,
  enemies: RibbonWormEnemy[],
): void {
  for (const e of enemies) {
    if (e.segX.length === 0) continue;
    canvas.save();
    // Coil telegraph: glow intensifies and shifts warmer as the lunge approaches.
    const telegraph = e.wormState === 'coil' ? e.coilAmount : 0;
    applyGlow(canvas, RIBBONWORM_GLOW, 6 + telegraph * 10);
    canvas.strokeStyle = telegraph > 0.5 ? '#e8f088' : RIBBONWORM_COLOR;
    canvas.lineWidth = RIBBONWORM_SIZE * (1.5 + (e.wormState === 'lunge' ? 0.3 : 0));
    canvas.lineCap = 'round';
    canvas.lineJoin = 'round';
    canvas.beginPath(); canvas.moveTo(e.segX[0], e.segY[0]);
    for (let i = 1; i < e.segX.length; i++) canvas.lineTo(e.segX[i], e.segY[i]);
    canvas.stroke();
    // Head circle
    canvas.fillStyle = RIBBONWORM_GLOW;
    canvas.beginPath(); canvas.arc(e.segX[0], e.segY[0], RIBBONWORM_SIZE, 0, Math.PI * 2); canvas.fill();
    clearGlow(canvas);
    drawHitFlash(canvas, e.x, e.y, RIBBONWORM_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, RIBBONWORM_SIZE, hpFrac(e));
    canvas.restore();
  }
}

// ── Lantern Moth ───────────────────────────────────────────────────────────────

export function drawLanternMothEnemies(
  canvas: CanvasRenderingContext2D,
  enemies: LanternMothEnemy[],
): void {
  for (const e of enemies) {
    canvas.save();
    // Asymmetric wing phase offsets + squash/stretch so wings don't mirror perfectly.
    const flapOpenL = Math.abs(Math.sin(e.flapPhase * 5.0 + e.wingPhaseOffsetL));
    const flapOpenR = Math.abs(Math.sin(e.flapPhase * 5.0 + e.wingPhaseOffsetR));
    const wingWL = LANTERNMOTH_SIZE * 2.0 * flapOpenL + 1;
    const wingWR = LANTERNMOTH_SIZE * 2.0 * flapOpenR + 1;
    const wingHL = LANTERNMOTH_SIZE * (0.9 - flapOpenL * 0.15);
    const wingHR = LANTERNMOTH_SIZE * (0.9 - flapOpenR * 0.15);
    applyGlow(canvas, LANTERNMOTH_GLOW, 8 + e.chargeGlow * 8);
    canvas.globalAlpha = 0.6;
    canvas.fillStyle = LANTERNMOTH_COLOR;
    // Left wing
    canvas.save(); canvas.translate(e.x - LANTERNMOTH_SIZE * 1.2, e.y);
    canvas.scale(wingWL / LANTERNMOTH_SIZE, wingHL / LANTERNMOTH_SIZE);
    canvas.beginPath(); canvas.arc(0, 0, LANTERNMOTH_SIZE, 0, Math.PI * 2); canvas.fill();
    canvas.restore();
    // Right wing
    canvas.save(); canvas.translate(e.x + LANTERNMOTH_SIZE * 1.2, e.y);
    canvas.scale(wingWR / LANTERNMOTH_SIZE, wingHR / LANTERNMOTH_SIZE);
    canvas.beginPath(); canvas.arc(0, 0, LANTERNMOTH_SIZE, 0, Math.PI * 2); canvas.fill();
    canvas.restore();
    // Body teardrop
    canvas.globalAlpha = 1;
    canvas.fillStyle = LANTERNMOTH_GLOW;
    canvas.beginPath(); canvas.arc(e.x, e.y, LANTERNMOTH_SIZE * 0.7, 0, Math.PI * 2); canvas.fill();
    // Charge-up glow ring — grows brighter as the lure attack approaches.
    if (e.chargeGlow > 0.01) {
      canvas.globalAlpha = e.chargeGlow * 0.55;
      canvas.strokeStyle = '#fff2c0';
      canvas.lineWidth = 1.5;
      canvas.beginPath();
      canvas.arc(e.x, e.y, LANTERNMOTH_SIZE * (1.3 + e.chargeGlow * 0.6), 0, Math.PI * 2);
      canvas.stroke();
    }
    // Lure pulse — an outward ring while actively pulsing.
    if (e.lureState === 'pulse') {
      canvas.globalAlpha = 0.35;
      canvas.strokeStyle = LANTERNMOTH_GLOW;
      canvas.lineWidth = 1;
      canvas.beginPath();
      canvas.arc(e.x, e.y, LANTERNMOTH_PULSE_RADIUS, 0, Math.PI * 2);
      canvas.stroke();
    }
    clearGlow(canvas);
    canvas.globalAlpha = 1;
    drawHitFlash(canvas, e.x, e.y, LANTERNMOTH_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, LANTERNMOTH_SIZE, hpFrac(e));
    canvas.restore();
  }
}

// ── Eye Stalk ──────────────────────────────────────────────────────────────────

export function drawEyeStalkEnemies(
  canvas: CanvasRenderingContext2D,
  enemies: EyeStalkEnemy[],
): void {
  for (const e of enemies) {
    canvas.save();
    const swayX = Math.sin(e.stalkPhase * 2.0) * 4;
    // Spring-lag offset trails the stalk tip slightly behind the body's own motion.
    const tipX = e.x + swayX + e.stalkLagX * 0.4, tipY = e.y - EYESTALK_SIZE * 2.2 + e.stalkLagY * 0.4;
    // Stalk line
    const charging = e.gazeState === 'charge';
    applyGlow(canvas, EYESTALK_GLOW, charging ? 8 : 5);
    canvas.strokeStyle = charging ? '#fff0a0' : EYESTALK_COLOR;
    canvas.lineWidth = 2;
    canvas.beginPath(); canvas.moveTo(e.x, e.y); canvas.lineTo(tipX, tipY); canvas.stroke();
    // Blob base
    canvas.fillStyle = EYESTALK_COLOR;
    canvas.beginPath(); canvas.arc(e.x, e.y, EYESTALK_SIZE, 0, Math.PI * 2); canvas.fill();
    // Eye sclera — vertical scale collapses toward 0 during a blink.
    const openFrac = 1 - e.blinkAmount;
    canvas.save();
    canvas.translate(tipX, tipY);
    canvas.scale(1, Math.max(0.05, openFrac));
    canvas.fillStyle = '#f0f0e0';
    canvas.beginPath(); canvas.arc(0, 0, 4, 0, Math.PI * 2); canvas.fill();
    if (openFrac > 0.2) {
      const px = Math.cos(e.eyeAngle) * 1.5;
      const py = Math.sin(e.eyeAngle) * 1.5 / Math.max(0.05, openFrac);
      canvas.fillStyle = '#202030';
      canvas.beginPath(); canvas.arc(px, py, 2, 0, Math.PI * 2); canvas.fill();
    }
    canvas.restore();

    // Gaze charge cone — narrows as the charge timer counts down toward fire.
    if (e.gazeState === 'charge' || e.gazeState === 'fire') {
      const chargeFrac = e.gazeState === 'fire' ? 0 : Math.max(0, Math.min(1, 1 - e.gazeTimerMs / EYESTALK_CHARGE_MS));
      const halfWidth = e.gazeState === 'fire' ? EYESTALK_BEAM_HALFWIDTH_RAD : EYESTALK_BEAM_HALFWIDTH_RAD + (1 - chargeFrac) * 0.35;
      canvas.globalAlpha = e.gazeState === 'fire' ? 0.55 : 0.22 + chargeFrac * 0.2;
      canvas.fillStyle = e.gazeState === 'fire' ? '#fff6c8' : EYESTALK_GLOW;
      canvas.beginPath();
      canvas.moveTo(tipX, tipY);
      canvas.lineTo(tipX + Math.cos(e.beamAngle - halfWidth) * EYESTALK_BEAM_RANGE, tipY + Math.sin(e.beamAngle - halfWidth) * EYESTALK_BEAM_RANGE);
      canvas.lineTo(tipX + Math.cos(e.beamAngle + halfWidth) * EYESTALK_BEAM_RANGE, tipY + Math.sin(e.beamAngle + halfWidth) * EYESTALK_BEAM_RANGE);
      canvas.closePath();
      canvas.fill();
      canvas.globalAlpha = 1;
    }
    clearGlow(canvas);
    drawHitFlash(canvas, e.x, e.y, EYESTALK_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, EYESTALK_SIZE, hpFrac(e));
    canvas.restore();
  }
}

// ── Floating Jellyfish ─────────────────────────────────────────────────────────

export function drawJellyfishEnemies(
  canvas: CanvasRenderingContext2D,
  enemies: JellyfishEnemy[],
): void {
  for (const e of enemies) {
    canvas.save();
    const bellScale = e.movementState === 'compress' ? 1.2 : e.movementState === 'pulse' ? 0.76 : 1;
    applyGlow(canvas, JELLYFISH_GLOW, 12);
    canvas.globalAlpha = 0.65;
    canvas.fillStyle = e.bellTint;
    // Bell — upper half arc
    canvas.save();
    canvas.translate(e.x, e.y);
    canvas.rotate(e.facingRad + Math.PI / 2);
    canvas.scale(bellScale, 2 - bellScale);
    canvas.beginPath();
    canvas.arc(0, 0, e.bellSize, Math.PI, 0, false);
    canvas.closePath();
    canvas.fill();
    canvas.restore();
    // Tentacles
    canvas.globalAlpha = 0.45;
    canvas.strokeStyle = e.bellTint;
    canvas.lineWidth = 1;
    for (let t = 0; t < e.tailCount; t++) {
      const base = t * e.segmentsPerTail;
      canvas.beginPath();
      canvas.moveTo(e.segX[base], e.segY[base]);
      for (let s = 1; s < e.segmentsPerTail; s++) canvas.lineTo(e.segX[base + s], e.segY[base + s]);
      canvas.stroke();
    }
    clearGlow(canvas);
    canvas.globalAlpha = 1;
    drawHitFlash(canvas, e.x, e.y, JELLYFISH_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, JELLYFISH_SIZE, hpFrac(e));
    canvas.restore();
  }
}

// ── Cloth Ghost ────────────────────────────────────────────────────────────────

export function drawClothGhostEnemies(
  canvas: CanvasRenderingContext2D,
  enemies: ClothGhostEnemy[],
): void {
  for (const e of enemies) {
    canvas.save();
    const flutter = Math.sin(e.flutterPhase * 4.0) * CLOTHGHOST_SIZE * 0.5;
    const intangible = e.ghostState === 'intangible';
    const opacity = (intangible ? 0.28 : 0.55) + 0.2 * Math.sin(e.animPhase * 1.8);
    applyGlow(canvas, CLOTHGHOST_GLOW, intangible ? 16 : 10);
    canvas.globalAlpha = opacity;
    canvas.fillStyle = CLOTHGHOST_COLOR;
    // Sheet: four corners lag behind body motion (cloth-in-air drag), fluttering as it moves.
    const topY = e.y - CLOTHGHOST_SIZE * 1.5 + e.cornerLagY[0] * 0.5;
    const topX1 = e.x - CLOTHGHOST_SIZE * 1.2 + e.cornerLagX[0] * 0.5;
    const topX2 = e.x + CLOTHGHOST_SIZE * 1.2 + e.cornerLagX[1] * 0.5;
    const botY = e.y + CLOTHGHOST_SIZE * 1.2 + e.cornerLagY[2] * 0.5;
    const botX1 = e.x - CLOTHGHOST_SIZE * 0.5 + e.cornerLagX[2] * 0.5;
    const botX2 = e.x + CLOTHGHOST_SIZE * 0.5 + e.cornerLagX[3] * 0.5;
    canvas.beginPath();
    canvas.moveTo(topX1, topY);
    canvas.quadraticCurveTo(e.x + flutter, e.y - CLOTHGHOST_SIZE * 0.5, botX1, botY);
    canvas.quadraticCurveTo(e.x, e.y + CLOTHGHOST_SIZE * 1.8, botX2, botY);
    canvas.quadraticCurveTo(e.x - flutter, e.y - CLOTHGHOST_SIZE * 0.5, topX2, topY);
    canvas.closePath();
    canvas.fill();
    // Wrap telegraph — an expanding cloth arc that reads as an incoming grab.
    if (e.ghostState === 'wrap') {
      canvas.globalAlpha = 0.4 * (1 - e.wrapFraction * 0.4);
      canvas.strokeStyle = '#ffffff';
      canvas.lineWidth = 2;
      canvas.beginPath();
      canvas.arc(e.x, e.y, CLOTHGHOST_SIZE + e.wrapFraction * CLOTHGHOST_WRAP_RANGE, 0, Math.PI * 2);
      canvas.stroke();
    }
    clearGlow(canvas);
    canvas.globalAlpha = 1;
    drawHitFlash(canvas, e.x, e.y, CLOTHGHOST_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, CLOTHGHOST_SIZE, hpFrac(e));
    canvas.restore();
  }
}

// ── Plant Turret ───────────────────────────────────────────────────────────────

export function drawPlantTurretEnemies(
  canvas: CanvasRenderingContext2D,
  enemies: PlantTurretEnemy[],
): void {
  for (const e of enemies) {
    canvas.save();
    const sway = Math.sin(e.stemPhase * 1.8) * 3 + e.bendX;
    // Bud scale: closed → opening (telegraph) → open (fire) → recoil (bounce back).
    const budScale = e.budState === 'closed' ? 0.72
      : e.budState === 'opening' ? 0.72 + 0.28 * (1 - e.budTimerMs / PLANTTURRET_BUD_OPEN_MS)
      : e.budState === 'open' ? 1.15
      : 0.85 + 0.15 * (e.budTimerMs / PLANTTURRET_RECOIL_MS);
    const headSize = PLANTTURRET_SIZE * budScale;
    const recoilPull = e.budState === 'recoil' ? (e.budTimerMs / PLANTTURRET_RECOIL_MS) * 2 : 0;
    applyGlow(canvas, PLANTTURRET_GLOW, 8 + (e.budState === 'opening' ? 6 : 0));
    canvas.strokeStyle = PLANTTURRET_COLOR;
    canvas.lineWidth = 3;
    canvas.lineCap = 'round';
    // Stem bends toward the player and recoils slightly opposite after firing.
    canvas.beginPath();
    canvas.moveTo(e.x, e.y + PLANTTURRET_SIZE + 4);
    canvas.quadraticCurveTo(e.x + sway - recoilPull, e.y, e.x + sway - recoilPull, e.y - PLANTTURRET_SIZE - e.bendY);
    canvas.stroke();
    // Flower head
    canvas.fillStyle = PLANTTURRET_GLOW;
    canvas.beginPath(); canvas.arc(e.x + sway - recoilPull, e.y - PLANTTURRET_SIZE - e.bendY, headSize, 0, Math.PI * 2); canvas.fill();
    // Petal ring
    canvas.fillStyle = '#c8ff80';
    for (let i = 0; i < 6; i++) {
      const pa = (i / 6) * Math.PI * 2 + e.stemPhase;
      const px = e.x + sway - recoilPull + Math.cos(pa) * (headSize + 3);
      const py = e.y - PLANTTURRET_SIZE - e.bendY + Math.sin(pa) * (headSize + 3);
      canvas.beginPath(); canvas.arc(px, py, 2.5, 0, Math.PI * 2); canvas.fill();
    }
    clearGlow(canvas);
    drawHitFlash(canvas, e.x, e.y, PLANTTURRET_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, PLANTTURRET_SIZE, hpFrac(e));
    canvas.restore();
  }
}

export function drawPlantProjectiles(
  canvas: CanvasRenderingContext2D,
  projectiles: PlantProjectile[],
): void {
  for (const p of projectiles) {
    if (p.hp <= 0) continue;
    canvas.save();
    const angle = Math.atan2(p.vy, p.vx);
    canvas.translate(p.x, p.y);
    canvas.rotate(angle + p.lifeMs / 400);
    if (!isLowGraphicsMode) {
      canvas.shadowBlur  = 6;
      canvas.shadowColor = PLANT_PROJ_GLOW;
    }
    canvas.fillStyle = PLANT_PROJ_COLOR;
    canvas.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = Math.cos(a) * PLANT_PROJ_SIZE;
      const y = Math.sin(a) * PLANT_PROJ_SIZE;
      if (i === 0) canvas.moveTo(x, y); else canvas.lineTo(x, y);
    }
    canvas.closePath(); canvas.fill();
    canvas.shadowBlur = 0;
    canvas.restore();
  }
}

// ── Gear Insect ────────────────────────────────────────────────────────────────

export function drawGearInsectEnemies(
  canvas: CanvasRenderingContext2D,
  enemies: GearInsectEnemy[],
): void {
  const TEETH = 8;
  for (const e of enemies) {
    canvas.save();
    const charging = e.moveState === 'charge';
    const paused = e.moveState === 'pause';
    applyGlow(canvas, GEARINSECT_GLOW, charging ? 12 : 6);
    // Legs (3 per side) — alternating pairs; nearly still while paused/charging.
    canvas.strokeStyle = charging ? '#e8c860' : GEARINSECT_COLOR;
    canvas.lineWidth = 1.5;
    const legRate = paused || charging ? 0.3 : 4;
    for (let i = 0; i < 3; i++) {
      const legSwing = Math.sin(e.legPhase * legRate + i * 1.2) * (paused || charging ? 0.08 : 0.4);
      const baseAngle = (Math.PI * 0.25 + i * 0.55);
      // Left leg
      const lax = e.x - GEARINSECT_SIZE * Math.cos(baseAngle);
      const lay = e.y + GEARINSECT_SIZE * 0.4 + i * 2;
      canvas.beginPath();
      canvas.moveTo(e.x - GEARINSECT_SIZE, e.y + i * 2);
      canvas.lineTo(lax - 6 + legSwing * 4, lay + 5);
      canvas.stroke();
      // Right leg
      canvas.beginPath();
      canvas.moveTo(e.x + GEARINSECT_SIZE, e.y + i * 2);
      canvas.lineTo(e.x + GEARINSECT_SIZE + 6 - legSwing * 4, lay + 5);
      canvas.stroke();
    }
    // Gear body — spins faster while charging/ricocheting for a "revving" read.
    canvas.fillStyle = charging ? '#e8c860' : GEARINSECT_COLOR;
    canvas.translate(e.x, e.y);
    canvas.rotate(e.gearAngle);
    canvas.beginPath();
    for (let i = 0; i < TEETH * 2; i++) {
      const a = (i / (TEETH * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? GEARINSECT_SIZE : GEARINSECT_SIZE * 0.7;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) canvas.moveTo(x, y); else canvas.lineTo(x, y);
    }
    canvas.closePath(); canvas.fill();
    // Inner circle
    canvas.fillStyle = '#606070';
    canvas.beginPath(); canvas.arc(0, 0, GEARINSECT_SIZE * 0.45, 0, Math.PI * 2); canvas.fill();
    clearGlow(canvas);
    canvas.restore();
    drawHitFlash(canvas, e.x, e.y, GEARINSECT_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, GEARINSECT_SIZE, hpFrac(e));
  }
}

// ── Spider Crawler ─────────────────────────────────────────────────────────────

export function drawSpiderCrawlerEnemies(
  canvas: CanvasRenderingContext2D,
  enemies: SpiderCrawlerEnemy[],
): void {
  for (const e of enemies) {
    canvas.save();
    const crouching = e.spiderState === 'crouch';
    applyGlow(canvas, SPIDERCRAWLER_GLOW, crouching ? 9 : 5);
    canvas.strokeStyle = crouching ? '#ffd090' : SPIDERCRAWLER_COLOR;
    canvas.lineWidth = 1.5;
    // 8 legs (4 per side) drawn IK-style: from a body attach point out to the planted foot.
    for (let i = 0; i < 4; i++) {
      const attachY = e.y + (i < 2 ? -SPIDERCRAWLER_SIZE * 0.5 : SPIDERCRAWLER_SIZE * 0.5);
      const side = i % 2 === 0 ? -1 : 1;
      const attachX = e.x + side * SPIDERCRAWLER_SIZE * 0.6;
      const footIdx = i;
      canvas.beginPath();
      canvas.moveTo(attachX, attachY);
      canvas.lineTo(e.footX[footIdx], e.footY[footIdx]);
      canvas.stroke();
    }
    // Body (abdomen ellipse) — squashes down during the crouch telegraph.
    const squashY = 1 - e.crouchAmount * 0.35;
    const squashX = 1 + e.crouchAmount * 0.2;
    canvas.fillStyle = SPIDERCRAWLER_COLOR;
    canvas.beginPath();
    canvas.ellipse(e.x, e.y, SPIDERCRAWLER_SIZE * squashX, SPIDERCRAWLER_SIZE * 0.65 * squashY, 0, 0, Math.PI * 2);
    canvas.fill();
    // Head dot
    canvas.fillStyle = SPIDERCRAWLER_GLOW;
    canvas.beginPath(); canvas.arc(e.x, e.y - SPIDERCRAWLER_SIZE * 0.7 * squashY, SPIDERCRAWLER_SIZE * 0.4, 0, Math.PI * 2); canvas.fill();
    // Web-cone telegraph/hazard
    if (e.webActiveMs > 0) {
      const frac = Math.max(0, Math.min(1, e.webActiveMs / SPIDERCRAWLER_WEB_ACTIVE_MS));
      canvas.globalAlpha = 0.22 + frac * 0.15;
      canvas.fillStyle = '#e8f0ff';
      canvas.beginPath();
      canvas.moveTo(e.x, e.y);
      canvas.lineTo(e.x + Math.cos(e.webAngle - SPIDERCRAWLER_WEB_HALFWIDTH_RAD) * SPIDERCRAWLER_WEB_RANGE, e.y + Math.sin(e.webAngle - SPIDERCRAWLER_WEB_HALFWIDTH_RAD) * SPIDERCRAWLER_WEB_RANGE);
      canvas.lineTo(e.x + Math.cos(e.webAngle + SPIDERCRAWLER_WEB_HALFWIDTH_RAD) * SPIDERCRAWLER_WEB_RANGE, e.y + Math.sin(e.webAngle + SPIDERCRAWLER_WEB_HALFWIDTH_RAD) * SPIDERCRAWLER_WEB_RANGE);
      canvas.closePath();
      canvas.fill();
      canvas.globalAlpha = 1;
    }
    clearGlow(canvas);
    drawHitFlash(canvas, e.x, e.y, SPIDERCRAWLER_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, SPIDERCRAWLER_SIZE, hpFrac(e));
    canvas.restore();
  }
}

// ── Magnetic Mote Swarm ────────────────────────────────────────────────────────

export function drawMoteSwarmEnemies(
  canvas: CanvasRenderingContext2D,
  enemies: MoteSwarmEnemy[],
): void {
  const MOTE_COLORS = ['#f0d860', '#f8f060', '#e8c040', '#fce880', '#d8b030'];
  for (const e of enemies) {
    canvas.save();
    // Core
    applyGlow(canvas, MOTESWARM_GLOW, 8);
    canvas.fillStyle = MOTESWARM_COLOR;
    canvas.beginPath(); canvas.arc(e.x, e.y, MOTESWARM_SIZE * 0.55, 0, Math.PI * 2); canvas.fill();
    // Orbiting motes
    for (let i = 0; i < Math.min(e.moteAngles.length, MOTESWARM_MOTE_COUNT); i++) {
      const mx = e.x + Math.cos(e.moteAngles[i]) * MOTESWARM_ORBIT_DIST;
      const my = e.y + Math.sin(e.moteAngles[i]) * MOTESWARM_ORBIT_DIST;
      canvas.fillStyle = MOTE_COLORS[i % MOTE_COLORS.length];
      canvas.beginPath(); canvas.arc(mx, my, 2.5, 0, Math.PI * 2); canvas.fill();
    }
    clearGlow(canvas);
    drawHitFlash(canvas, e.x, e.y, MOTESWARM_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, MOTESWARM_SIZE, hpFrac(e));
    canvas.restore();
  }
}

// ── Shadow Hand ────────────────────────────────────────────────────────────────

export function drawShadowHandEnemies(
  canvas: CanvasRenderingContext2D,
  enemies: ShadowHandEnemy[],
): void {
  for (const e of enemies) {
    canvas.save();
    applyGlow(canvas, SHADOWHAND_GLOW, 14);
    canvas.globalAlpha = 0.80;
    // Palm (dark arc / circle)
    canvas.fillStyle = SHADOWHAND_COLOR;
    canvas.beginPath(); canvas.arc(e.x, e.y, SHADOWHAND_SIZE * 0.9, 0, Math.PI * 2); canvas.fill();
    // Four finger lines reaching upward, length modulated by reachFraction
    const fingerLen = SHADOWHAND_SIZE * 1.6 * e.reachFraction;
    canvas.strokeStyle = SHADOWHAND_GLOW;
    canvas.lineWidth = 2;
    canvas.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const fa = -Math.PI * 0.6 + (i / 3) * Math.PI * 1.2;
      canvas.beginPath();
      canvas.moveTo(e.x + Math.cos(fa) * SHADOWHAND_SIZE * 0.6, e.y + Math.sin(fa) * SHADOWHAND_SIZE * 0.6);
      canvas.lineTo(e.x + Math.cos(fa) * (SHADOWHAND_SIZE * 0.6 + fingerLen), e.y + Math.sin(fa) * (SHADOWHAND_SIZE * 0.6 + fingerLen));
      canvas.stroke();
    }
    clearGlow(canvas);
    canvas.globalAlpha = 1;
    drawHitFlash(canvas, e.x, e.y, SHADOWHAND_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, SHADOWHAND_SIZE, hpFrac(e));
    canvas.restore();
  }
}



/**
 * Convenience umbrella: draws all proc creature arrays in one call.
 * Called from rpg-render-draw.ts drawRpgFrame.
 * The `ctx` parameter must satisfy the subset of RpgDrawCtx that carries
 * the proc arrays; we accept an object literal here to avoid circular imports.
 */
export function drawProceduralEnemies(
  canvas: CanvasRenderingContext2D,
  ctx: {
    dustWispEnemies: DustWispEnemy[];
    ribbonWormEnemies: RibbonWormEnemy[];
    lanternMothEnemies: LanternMothEnemy[];
    eyeStalkEnemies: EyeStalkEnemy[];
    jellyfishEnemies: JellyfishEnemy[];
    eliteJellyfishEnemies: EliteJellyfishEnemy[];
    clothGhostEnemies: ClothGhostEnemy[];
    plantTurretEnemies: PlantTurretEnemy[];
    gearInsectEnemies: GearInsectEnemy[];
    spiderCrawlerEnemies: SpiderCrawlerEnemy[];
    moteSwarmEnemies: MoteSwarmEnemy[];
    shadowHandEnemies: ShadowHandEnemy[];
    sandFishEnemies: SandFishEnemy[];
    quartzFishEnemies: QuartzFishEnemy[];
    rubyFishEnemies: RubyFishEnemy[];
    sunstoneFishEnemies: SunstoneFishEnemy[];
    emeraldFishEnemies: EmeraldFishEnemy[];
    sapphireFishEnemies: SapphireFishEnemy[];
    amethystFishEnemies: AmethystFishEnemy[];
    diamondFishEnemies: DiamondFishEnemy[];
    plantProjectiles: PlantProjectile[];
    fishMines: FishMine[];
    fishSpikes: FishSpike[];
    fishBolts: FishBolt[];
    fishDecoys: FishDecoy[];
  },
  _nowMs: number,
): void {
  drawDustWispEnemies(canvas, ctx.dustWispEnemies);
  drawRibbonWormEnemies(canvas, ctx.ribbonWormEnemies);
  drawLanternMothEnemies(canvas, ctx.lanternMothEnemies);
  drawEyeStalkEnemies(canvas, ctx.eyeStalkEnemies);
  drawJellyfishEnemies(canvas, ctx.jellyfishEnemies);
  drawEliteJellyfishEnemies(canvas, ctx.eliteJellyfishEnemies);
  drawClothGhostEnemies(canvas, ctx.clothGhostEnemies);
  drawPlantTurretEnemies(canvas, ctx.plantTurretEnemies);
  drawPlantProjectiles(canvas, ctx.plantProjectiles);
  drawGearInsectEnemies(canvas, ctx.gearInsectEnemies);
  drawSpiderCrawlerEnemies(canvas, ctx.spiderCrawlerEnemies);
  drawMoteSwarmEnemies(canvas, ctx.moteSwarmEnemies);
  drawShadowHandEnemies(canvas, ctx.shadowHandEnemies);
  drawSandFishEnemies(canvas, ctx.sandFishEnemies);
  drawQuartzFishEnemies(canvas, ctx.quartzFishEnemies);
  drawRubyFishEnemies(canvas, ctx.rubyFishEnemies);
  drawSunstoneFishEnemies(canvas, ctx.sunstoneFishEnemies);
  drawEmeraldFishEnemies(canvas, ctx.emeraldFishEnemies);
  drawSapphireFishEnemies(canvas, ctx.sapphireFishEnemies);
  drawAmethystFishEnemies(canvas, ctx.amethystFishEnemies);
  drawDiamondFishEnemies(canvas, ctx.diamondFishEnemies);
  drawFishMines(canvas, ctx.fishMines);
  drawFishSpikes(canvas, ctx.fishSpikes);
  drawFishBolts(canvas, ctx.fishBolts);
  drawFishDecoys(canvas, ctx.fishDecoys);
}
