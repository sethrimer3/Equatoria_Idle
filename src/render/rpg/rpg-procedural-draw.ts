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
import {
  DUSTWISP_SIZE, DUSTWISP_COLOR, DUSTWISP_GLOW,
  RIBBONWORM_SIZE, RIBBONWORM_COLOR, RIBBONWORM_GLOW,
  LANTERNMOTH_SIZE, LANTERNMOTH_COLOR, LANTERNMOTH_GLOW,
  EYESTALK_SIZE, EYESTALK_COLOR, EYESTALK_GLOW,
  JELLYFISH_SIZE, JELLYFISH_COLOR, JELLYFISH_GLOW,
  CLOTHGHOST_SIZE, CLOTHGHOST_COLOR, CLOTHGHOST_GLOW,
  PLANTTURRET_SIZE, PLANTTURRET_COLOR, PLANTTURRET_GLOW,
  GEARINSECT_SIZE, GEARINSECT_COLOR, GEARINSECT_GLOW,
  SPIDERCRAWLER_SIZE, SPIDERCRAWLER_COLOR, SPIDERCRAWLER_GLOW,
  MOTESWARM_SIZE, MOTESWARM_COLOR, MOTESWARM_GLOW, MOTESWARM_ORBIT_DIST, MOTESWARM_MOTE_COUNT,
  SHADOWHAND_SIZE, SHADOWHAND_COLOR, SHADOWHAND_GLOW,
  SANDFISH_SIZE, SANDFISH_COLOR, SANDFISH_GLOW,
  QUARTZFISH_SIZE, QUARTZFISH_COLOR, QUARTZFISH_GLOW,
  RUBYFISH_SIZE, RUBYFISH_COLOR, RUBYFISH_GLOW,
  SUNSTONEFISH_SIZE, SUNSTONEFISH_COLOR, SUNSTONEFISH_GLOW,
  EMERALDFISH_SIZE, EMERALDFISH_MINI_SIZE, EMERALDFISH_COLOR, EMERALDFISH_GLOW,
  SAPPHIREFISH_SIZE, SAPPHIREFISH_COLOR, SAPPHIREFISH_GLOW,
  AMETHYSTFISH_SIZE, AMETHYSTFISH_COLOR, AMETHYSTFISH_GLOW,
  DIAMONDFISH_SIZE, DIAMONDFISH_COLOR, DIAMONDFISH_GLOW,
  PLANT_PROJ_SIZE, PLANT_PROJ_COLOR, PLANT_PROJ_GLOW,
} from './rpg-procedural-constants';

// ── Low-graphics flag ─────────────────────────────────────────────────────────
let isLowGraphicsMode = false;
export function setProcLowGraphicsMode(enabled: boolean): void {
  isLowGraphicsMode = enabled;
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
  return e.maxHp > 0 ? Math.max(0, e.hp / e.maxHp) : 0;
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
    drawHpBar(canvas, e.x, e.y, DUSTWISP_SIZE, hpFrac(e));
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
    applyGlow(canvas, RIBBONWORM_GLOW, 6);
    canvas.strokeStyle = RIBBONWORM_COLOR;
    canvas.lineWidth = RIBBONWORM_SIZE * 1.5;
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
    const flapOpen = Math.abs(Math.sin(e.flapPhase * 5.0));
    // Wing ellipses
    const wingW = LANTERNMOTH_SIZE * 2.0 * flapOpen + 1;
    const wingH = LANTERNMOTH_SIZE * 0.9;
    applyGlow(canvas, LANTERNMOTH_GLOW, 8);
    canvas.globalAlpha = 0.6;
    canvas.fillStyle = LANTERNMOTH_COLOR;
    // Left wing
    canvas.save(); canvas.translate(e.x - LANTERNMOTH_SIZE * 1.2, e.y);
    canvas.scale(wingW / LANTERNMOTH_SIZE, wingH / LANTERNMOTH_SIZE);
    canvas.beginPath(); canvas.arc(0, 0, LANTERNMOTH_SIZE, 0, Math.PI * 2); canvas.fill();
    canvas.restore();
    // Right wing
    canvas.save(); canvas.translate(e.x + LANTERNMOTH_SIZE * 1.2, e.y);
    canvas.scale(wingW / LANTERNMOTH_SIZE, wingH / LANTERNMOTH_SIZE);
    canvas.beginPath(); canvas.arc(0, 0, LANTERNMOTH_SIZE, 0, Math.PI * 2); canvas.fill();
    canvas.restore();
    // Body teardrop
    canvas.globalAlpha = 1;
    canvas.fillStyle = LANTERNMOTH_GLOW;
    canvas.beginPath(); canvas.arc(e.x, e.y, LANTERNMOTH_SIZE * 0.7, 0, Math.PI * 2); canvas.fill();
    clearGlow(canvas);
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
    const tipX = e.x + swayX, tipY = e.y - EYESTALK_SIZE * 2.2;
    // Stalk line
    applyGlow(canvas, EYESTALK_GLOW, 5);
    canvas.strokeStyle = EYESTALK_COLOR;
    canvas.lineWidth = 2;
    canvas.beginPath(); canvas.moveTo(e.x, e.y); canvas.lineTo(tipX, tipY); canvas.stroke();
    // Blob base
    canvas.fillStyle = EYESTALK_COLOR;
    canvas.beginPath(); canvas.arc(e.x, e.y, EYESTALK_SIZE, 0, Math.PI * 2); canvas.fill();
    // Eye sclera
    canvas.fillStyle = '#f0f0e0';
    canvas.beginPath(); canvas.arc(tipX, tipY, 4, 0, Math.PI * 2); canvas.fill();
    // Pupil
    const px = tipX + Math.cos(e.eyeAngle) * 1.5;
    const py = tipY + Math.sin(e.eyeAngle) * 1.5;
    canvas.fillStyle = '#202030';
    canvas.beginPath(); canvas.arc(px, py, 2, 0, Math.PI * 2); canvas.fill();
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
    const bellScale = 0.7 + 0.3 * Math.sin(e.bellPhase * 2.5);
    applyGlow(canvas, JELLYFISH_GLOW, 12);
    canvas.globalAlpha = 0.65;
    canvas.fillStyle = JELLYFISH_COLOR;
    // Bell — upper half arc
    canvas.save();
    canvas.translate(e.x, e.y);
    canvas.scale(bellScale, 1);
    canvas.beginPath();
    canvas.arc(0, 0, JELLYFISH_SIZE, Math.PI, 0, false);
    canvas.closePath();
    canvas.fill();
    canvas.restore();
    // Tentacles
    canvas.globalAlpha = 0.45;
    canvas.strokeStyle = JELLYFISH_COLOR;
    canvas.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      const tx = e.x + i * JELLYFISH_SIZE * 0.38;
      const ty = e.y + JELLYFISH_SIZE * 0.1;
      const wobble = Math.sin(e.bellPhase * 3 + i) * 3;
      canvas.beginPath();
      canvas.moveTo(tx, ty);
      canvas.quadraticCurveTo(tx + wobble, ty + JELLYFISH_SIZE * 1.2, tx - wobble, ty + JELLYFISH_SIZE * 2.0);
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
    const opacity = 0.55 + 0.2 * Math.sin(e.animPhase * 1.8);
    applyGlow(canvas, CLOTHGHOST_GLOW, 10);
    canvas.globalAlpha = opacity;
    canvas.fillStyle = CLOTHGHOST_COLOR;
    // Sheet: three-point bezier
    const topY = e.y - CLOTHGHOST_SIZE * 1.5;
    canvas.beginPath();
    canvas.moveTo(e.x - CLOTHGHOST_SIZE * 1.2, topY);
    canvas.quadraticCurveTo(e.x + flutter, e.y - CLOTHGHOST_SIZE * 0.5, e.x - CLOTHGHOST_SIZE * 0.5, e.y + CLOTHGHOST_SIZE * 1.2);
    canvas.quadraticCurveTo(e.x, e.y + CLOTHGHOST_SIZE * 1.8, e.x + CLOTHGHOST_SIZE * 0.5, e.y + CLOTHGHOST_SIZE * 1.2);
    canvas.quadraticCurveTo(e.x - flutter, e.y - CLOTHGHOST_SIZE * 0.5, e.x + CLOTHGHOST_SIZE * 1.2, topY);
    canvas.closePath();
    canvas.fill();
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
    const sway = Math.sin(e.stemPhase * 1.8) * 3;
    applyGlow(canvas, PLANTTURRET_GLOW, 8);
    canvas.strokeStyle = PLANTTURRET_COLOR;
    canvas.lineWidth = 3;
    canvas.lineCap = 'round';
    // Stem
    canvas.beginPath();
    canvas.moveTo(e.x, e.y + PLANTTURRET_SIZE + 4);
    canvas.quadraticCurveTo(e.x + sway, e.y, e.x + sway, e.y - PLANTTURRET_SIZE);
    canvas.stroke();
    // Flower head
    canvas.fillStyle = PLANTTURRET_GLOW;
    canvas.beginPath(); canvas.arc(e.x + sway, e.y - PLANTTURRET_SIZE, PLANTTURRET_SIZE, 0, Math.PI * 2); canvas.fill();
    // Petal ring
    canvas.fillStyle = '#c8ff80';
    for (let i = 0; i < 6; i++) {
      const pa = (i / 6) * Math.PI * 2 + e.stemPhase;
      const px = e.x + sway + Math.cos(pa) * (PLANTTURRET_SIZE + 3);
      const py = e.y - PLANTTURRET_SIZE + Math.sin(pa) * (PLANTTURRET_SIZE + 3);
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
    applyGlow(canvas, GEARINSECT_GLOW, 6);
    // Legs (3 per side)
    canvas.strokeStyle = GEARINSECT_COLOR;
    canvas.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const legSwing = Math.sin(e.legPhase * 4 + i * 1.2) * 0.4;
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
    // Gear body
    canvas.fillStyle = GEARINSECT_COLOR;
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
    applyGlow(canvas, SPIDERCRAWLER_GLOW, 5);
    canvas.strokeStyle = SPIDERCRAWLER_COLOR;
    canvas.lineWidth = 1.5;
    // 8 legs (4 per side), alternating pairs
    for (let i = 0; i < 4; i++) {
      const swing = Math.sin(e.legPhase * 5 + i * Math.PI / 2) * 0.45;
      const baseY = e.y - SPIDERCRAWLER_SIZE * 0.5 + i * 3;
      // Left
      canvas.beginPath();
      canvas.moveTo(e.x - SPIDERCRAWLER_SIZE, baseY);
      canvas.lineTo(e.x - SPIDERCRAWLER_SIZE - 7 + swing * 3, baseY + 7 + swing * 3);
      canvas.stroke();
      // Right
      canvas.beginPath();
      canvas.moveTo(e.x + SPIDERCRAWLER_SIZE, baseY);
      canvas.lineTo(e.x + SPIDERCRAWLER_SIZE + 7 - swing * 3, baseY + 7 + swing * 3);
      canvas.stroke();
    }
    // Body (abdomen ellipse)
    canvas.fillStyle = SPIDERCRAWLER_COLOR;
    canvas.beginPath();
    canvas.ellipse(e.x, e.y, SPIDERCRAWLER_SIZE, SPIDERCRAWLER_SIZE * 0.65, 0, 0, Math.PI * 2);
    canvas.fill();
    // Head dot
    canvas.fillStyle = SPIDERCRAWLER_GLOW;
    canvas.beginPath(); canvas.arc(e.x, e.y - SPIDERCRAWLER_SIZE * 0.7, SPIDERCRAWLER_SIZE * 0.4, 0, Math.PI * 2); canvas.fill();
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


// ── Fish enemies and projectiles ───────────────────────────────────────────────

/** Options forwarded to the fish silhouette renderer. */
interface FishDrawOpts {
  /** Overall opacity [0–1]; undefined = fully opaque. */
  alpha?: number;
  /** When true, draw white diamond-armor facets inside the body. */
  diamond?: boolean;
  /** When true, reduce swim-bend amplitude (ruby dash: body straightens). */
  rubyDash?: boolean;
  /** When true, increase tail-beat frequency (mini emerald fish). */
  fastTwitch?: boolean;
}

/**
 * Build a function that maps a local x coordinate to a Y swim-bend offset.
 * Bend is zero near the head and grows toward the tail, modelled as a power
 * curve so the body looks natural.  Amplitude is tuned per fish state.
 */
function getFishBendFn(
  animPhase: number,
  size: number,
  opts?: FishDrawOpts,
): (px: number) => number {
  const beatFreq = opts?.fastTwitch ? 3.4 : 2.8;
  let amplitude = size * 0.38;
  if (opts?.rubyDash) amplitude *= 0.25;  // straighten during high-speed dash
  if (opts?.diamond)  amplitude *= 0.70;  // gentler sway when armour is up

  const rawBend   = Math.sin(animPhase * beatFreq) * amplitude;
  const xHead     =  size * 1.20;
  const xTailBase = -size * 1.05;
  const range     = xHead - xTailBase;

  return (px: number): number => {
    const t = (xHead - px) / range;
    return rawBend * Math.pow(Math.max(0, t), 1.5);
  };
}

/**
 * Draw two small pectoral fins near the front of the fish body.
 * Each fin is a short ellipse rotated slightly outward and rendered at
 * reduced opacity so the body silhouette remains the dominant shape.
 */
function drawFishFins(
  ctx: CanvasRenderingContext2D,
  s: number,
  bendFn: (px: number) => number,
  bodyColor: string,
): void {
  const attachX  = s * 0.35;
  const bFin     = bendFn(attachX);
  const finHalfL = s * 0.58;   // half-length along body axis
  const finHalfW = s * 0.22;   // half-width perpendicular
  const fanAngle = 0.50;        // rotation outward (rad)

  ctx.save();
  ctx.fillStyle = bodyColor;
  ctx.globalAlpha *= 0.68;

  // Upper fin (top-down left)
  ctx.save();
  ctx.translate(attachX, bFin - s * 0.48);
  ctx.rotate(-fanAngle);
  ctx.beginPath();
  ctx.ellipse(0, 0, finHalfL, finHalfW, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Lower fin (top-down right)
  ctx.save();
  ctx.translate(attachX, bFin + s * 0.48);
  ctx.rotate(fanAngle);
  ctx.beginPath();
  ctx.ellipse(0, 0, finHalfL, finHalfW, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

/**
 * Draw two subtle internal crystal-facet lines.
 * Uses a very low alpha so they read as gemstone highlights without looking
 * like cartoon eye markings.  Skipped entirely in low-graphics mode.
 */
function drawFishFacets(
  ctx: CanvasRenderingContext2D,
  s: number,
  bendFn: (px: number) => number,
): void {
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth   = Math.max(0.5, s * 0.08);
  ctx.globalAlpha = 0.18;
  ctx.lineCap     = 'round';

  // Facet line A: diagonal across the front half of the body
  ctx.beginPath();
  ctx.moveTo(s * 0.80, bendFn(s * 0.80) - s * 0.22);
  ctx.lineTo(s * 0.10, bendFn(s * 0.10) + s * 0.30);
  ctx.stroke();

  // Facet line B: shorter cut across the mid-body
  ctx.beginPath();
  ctx.moveTo(s * 0.15, bendFn(s * 0.15) - s * 0.40);
  ctx.lineTo(-s * 0.30, bendFn(-s * 0.30) + s * 0.12);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw a single gem-fish using a top-down silhouette approach.
 *
 * The fish is rendered in local space (faces +X), then rotated by `swimAngle`.
 * A bezier-curve outline produces a rounded head, tapered body, pectoral fins,
 * and a forked caudal tail.  A swim-bend function displaces body and tail points
 * along Y so the fish visibly undulates with `animPhase`.  No eye or pupil is
 * drawn at any point.
 */
function drawProceduralFishSilhouette(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  swimAngle: number,
  animPhase: number,
  bodyColor: string,
  glowColor: string,
  opts?: FishDrawOpts,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(swimAngle);
  if (opts?.alpha !== undefined && opts.alpha < 1) ctx.globalAlpha = opts.alpha;

  const s      = size;
  const bendFn = getFishBendFn(animPhase, s, opts);

  // Key x positions (local coords; fish faces +X)
  const xH   =  s * 1.20;   // head tip
  const xM   =  s * 0.05;   // mid-body (widest)
  const xTB  = -s * 1.05;   // tail base
  const xTT  = -s * 1.80;   // tail lobe tips

  // Half-widths at key sections
  const hwH  = s * 0.30;    // head
  const hwM  = s * 0.60;    // mid (widest)
  const hwTB = s * 0.18;    // tail base

  // Y bend offsets at each key x
  const bH   = bendFn(xH);
  const bM   = bendFn(xM);
  const bTB  = bendFn(xTB);
  const bTT  = bendFn(xTT);

  // Forked tail lobe tips (slight asymmetry for organic feel)
  const lobeSpread = s * 0.30;
  const upperTipY  = bTT - lobeSpread;
  const lowerTipY  = bTT + lobeSpread;

  // Notch between tail lobes (slightly inward from tips in X)
  const xNotch = xTT + s * 0.20;
  const bNotch = bendFn(xNotch);

  // ── Body silhouette ──────────────────────────────────────────────
  applyGlow(ctx, glowColor, s + 4);
  ctx.fillStyle = bodyColor;
  ctx.beginPath();

  // Head tip (rounded nose: both top and bottom beziers meet here smoothly)
  ctx.moveTo(xH, bH);

  // Top outline: head → widest body → tail base
  ctx.bezierCurveTo(
    xH - s * 0.05, bH - hwH,
    xM + s * 0.55, bM - hwM,
    xM, bM - hwM,
  );
  ctx.bezierCurveTo(
    xM - s * 0.50, bM - hwM,
    xTB + s * 0.28, bTB - hwTB,
    xTB, bTB - hwTB,
  );

  // Upper tail lobe
  ctx.bezierCurveTo(
    xTB - s * 0.22, bTB - hwTB * 1.6,
    xTT + s * 0.18, upperTipY - s * 0.04,
    xTT, upperTipY,
  );

  // Tail notch (concave between lobes)
  ctx.bezierCurveTo(
    xTT + s * 0.10, upperTipY + s * 0.10,
    xNotch + s * 0.05, bNotch - s * 0.04,
    xNotch, bNotch,
  );

  // Lower tail lobe
  ctx.bezierCurveTo(
    xNotch + s * 0.05, bNotch + s * 0.04,
    xTT + s * 0.10, lowerTipY - s * 0.10,
    xTT, lowerTipY,
  );

  // Bottom outline: tail base → widest body → head tip
  ctx.bezierCurveTo(
    xTT + s * 0.18, lowerTipY + s * 0.04,
    xTB - s * 0.22, bTB + hwTB * 1.6,
    xTB, bTB + hwTB,
  );
  ctx.bezierCurveTo(
    xTB + s * 0.28, bTB + hwTB,
    xM - s * 0.50, bM + hwM,
    xM, bM + hwM,
  );
  ctx.bezierCurveTo(
    xM + s * 0.55, bM + hwM,
    xH - s * 0.05, bH + hwH,
    xH, bH,
  );

  ctx.closePath();
  ctx.fill();
  clearGlow(ctx);

  // ── Pectoral fins ────────────────────────────────────────────────
  drawFishFins(ctx, s, bendFn, bodyColor);

  // ── Internal crystal facets (detail pass, skipped in low-graphics) ──
  if (!isLowGraphicsMode) {
    drawFishFacets(ctx, s, bendFn);
  }

  // ── Diamond armor overlay (white facet lines when armor is active) ──
  if (opts?.diamond) {
    ctx.save();
    ctx.strokeStyle = '#ddfbff';
    ctx.lineWidth   = Math.max(0.7, s * 0.10);
    ctx.globalAlpha = 0.55;
    ctx.lineCap     = 'round';

    const fA = bendFn(s * 0.50);
    const fB = bendFn(-s * 0.30);
    // Diagonal armour shard crossing the body
    ctx.beginPath();
    ctx.moveTo(s * 0.50, fA - hwM * 0.60);
    ctx.lineTo(-s * 0.30, fB + hwM * 0.55);
    ctx.stroke();
    // Transverse shard at mid-body
    ctx.beginPath();
    ctx.moveTo(s * 0.05, bM - hwM * 0.48);
    ctx.lineTo(s * 0.05, bM + hwM * 0.48);
    ctx.stroke();

    ctx.restore();
  }

  ctx.restore();
}

export function drawSandFishEnemies(canvas: CanvasRenderingContext2D, enemies: SandFishEnemy[]): void {
  for (const e of enemies) {
    drawProceduralFishSilhouette(canvas, e.x, e.y, SANDFISH_SIZE, e.swimAngle, e.animPhase, SANDFISH_COLOR, SANDFISH_GLOW);
    drawHitFlash(canvas, e.x, e.y, SANDFISH_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, SANDFISH_SIZE, hpFrac(e));
  }
}

export function drawQuartzFishEnemies(canvas: CanvasRenderingContext2D, enemies: QuartzFishEnemy[]): void {
  for (const e of enemies) {
    drawProceduralFishSilhouette(canvas, e.x, e.y, QUARTZFISH_SIZE, e.swimAngle, e.animPhase, QUARTZFISH_COLOR, QUARTZFISH_GLOW);
    if (!e.shieldBroken && e.shieldHp > 0) {
      canvas.save();
      canvas.strokeStyle = QUARTZFISH_GLOW;
      canvas.globalAlpha = 0.6;
      canvas.lineWidth = 1.5;
      canvas.beginPath();
      canvas.arc(e.x, e.y, QUARTZFISH_SIZE + 4, 0, Math.PI * 2);
      canvas.stroke();
      canvas.restore();
    }
    drawHitFlash(canvas, e.x, e.y, QUARTZFISH_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, QUARTZFISH_SIZE, hpFrac(e));
  }
}

export function drawRubyFishEnemies(canvas: CanvasRenderingContext2D, enemies: RubyFishEnemy[]): void {
  for (const e of enemies) {
    const alpha    = e.dashState === 'windup' ? 0.65 : 1;
    const rubyDash = e.dashState === 'dash';
    drawProceduralFishSilhouette(canvas, e.x, e.y, RUBYFISH_SIZE, e.swimAngle, e.animPhase, RUBYFISH_COLOR, RUBYFISH_GLOW, { alpha, rubyDash });
    drawHitFlash(canvas, e.x, e.y, RUBYFISH_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, RUBYFISH_SIZE, hpFrac(e));
  }
}

export function drawSunstoneFishEnemies(canvas: CanvasRenderingContext2D, enemies: SunstoneFishEnemy[]): void {
  for (const e of enemies) {
    drawProceduralFishSilhouette(canvas, e.x, e.y, SUNSTONEFISH_SIZE, e.swimAngle, e.animPhase, SUNSTONEFISH_COLOR, SUNSTONEFISH_GLOW);
    drawHitFlash(canvas, e.x, e.y, SUNSTONEFISH_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, SUNSTONEFISH_SIZE, hpFrac(e));
  }
}

export function drawEmeraldFishEnemies(canvas: CanvasRenderingContext2D, enemies: EmeraldFishEnemy[]): void {
  for (const e of enemies) {
    const size = e.isMini ? EMERALDFISH_MINI_SIZE : EMERALDFISH_SIZE;
    drawProceduralFishSilhouette(canvas, e.x, e.y, size, e.swimAngle, e.animPhase, EMERALDFISH_COLOR, EMERALDFISH_GLOW, { alpha: e.isMini ? 0.9 : 1, fastTwitch: e.isMini });
    drawHitFlash(canvas, e.x, e.y, size, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, size, hpFrac(e));
  }
}

export function drawSapphireFishEnemies(canvas: CanvasRenderingContext2D, enemies: SapphireFishEnemy[]): void {
  for (const e of enemies) {
    drawProceduralFishSilhouette(canvas, e.x, e.y, SAPPHIREFISH_SIZE, e.swimAngle, e.animPhase, SAPPHIREFISH_COLOR, SAPPHIREFISH_GLOW);
    drawHitFlash(canvas, e.x, e.y, SAPPHIREFISH_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, SAPPHIREFISH_SIZE, hpFrac(e));
  }
}

export function drawAmethystFishEnemies(canvas: CanvasRenderingContext2D, enemies: AmethystFishEnemy[]): void {
  for (const e of enemies) {
    drawProceduralFishSilhouette(canvas, e.x, e.y, AMETHYSTFISH_SIZE, e.swimAngle, e.animPhase, AMETHYSTFISH_COLOR, AMETHYSTFISH_GLOW);
    drawHitFlash(canvas, e.x, e.y, AMETHYSTFISH_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, AMETHYSTFISH_SIZE, hpFrac(e));
  }
}

export function drawDiamondFishEnemies(canvas: CanvasRenderingContext2D, enemies: DiamondFishEnemy[]): void {
  for (const e of enemies) {
    drawProceduralFishSilhouette(canvas, e.x, e.y, DIAMONDFISH_SIZE, e.swimAngle, e.animPhase, DIAMONDFISH_COLOR, DIAMONDFISH_GLOW, { diamond: e.armorActive });
    if (e.armorActive) {
      canvas.save();
      canvas.strokeStyle = DIAMONDFISH_GLOW;
      canvas.globalAlpha = 0.75;
      canvas.lineWidth = 2;
      canvas.beginPath();
      canvas.arc(e.x, e.y, DIAMONDFISH_SIZE + 3, 0, Math.PI * 2);
      canvas.stroke();
      canvas.restore();
    }
    drawHitFlash(canvas, e.x, e.y, DIAMONDFISH_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, DIAMONDFISH_SIZE, hpFrac(e));
  }
}

export function drawFishMines(canvas: CanvasRenderingContext2D, mines: FishMine[]): void {
  for (const m of mines) {
    canvas.save();
    applyGlow(canvas, SUNSTONEFISH_GLOW, 6);
    canvas.globalAlpha = m.armedMs > 0 ? 0.75 : 1;
    canvas.fillStyle = SUNSTONEFISH_COLOR;
    canvas.beginPath();
    canvas.arc(m.x, m.y, 4, 0, Math.PI * 2);
    canvas.fill();
    clearGlow(canvas);
    canvas.restore();
  }
}

export function drawFishSpikes(canvas: CanvasRenderingContext2D, spikes: FishSpike[]): void {
  for (const s of spikes) {
    canvas.save();
    canvas.translate(s.x, s.y);
    canvas.rotate(Math.atan2(s.vy, s.vx));
    canvas.fillStyle = SUNSTONEFISH_GLOW;
    canvas.beginPath();
    canvas.moveTo(5, 0);
    canvas.lineTo(-4, -2);
    canvas.lineTo(-4, 2);
    canvas.closePath();
    canvas.fill();
    canvas.restore();
  }
}

export function drawFishBolts(canvas: CanvasRenderingContext2D, bolts: FishBolt[]): void {
  for (const b of bolts) {
    canvas.save();
    applyGlow(canvas, SAPPHIREFISH_GLOW, 6);
    canvas.fillStyle = SAPPHIREFISH_COLOR;
    canvas.beginPath();
    canvas.arc(b.x, b.y, 3, 0, Math.PI * 2);
    canvas.fill();
    clearGlow(canvas);
    canvas.restore();
  }
}

export function drawFishDecoys(canvas: CanvasRenderingContext2D, decoys: FishDecoy[]): void {
  for (const d of decoys) {
    const alpha = Math.max(0, d.lifeMs / 1500) * 0.5;
    drawProceduralFishSilhouette(canvas, d.x, d.y, AMETHYSTFISH_SIZE, d.swimAngle, d.animPhase, AMETHYSTFISH_COLOR, AMETHYSTFISH_GLOW, { alpha });
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
