/**
 * rpg-enemies-tab.ts — Enemies sub-tab for the RPG overlay panel.
 *
 * Shows a bestiary of all enemy types the player has encountered, plus any
 * bosses they have defeated. Each entry displays:
 *   • A small canvas icon showing the enemy's in-game appearance.
 *   • The enemy's name and base stats (HP, ATK, DEF).
 *   • A one-sentence description.
 *
 * Visibility rules:
 *   • Regular enemies: visible once the player has reached the wave where
 *     the enemy first appears (highestWaveReached >= firstWave).
 *   • Bosses: visible once the boss has been beaten (bossCompletions has
 *     a non-zero entry for the boss ID).
 *   • In developer mode: ALL entries are visible regardless of progress.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { TOTAL_BOSS_COUNT } from '../../sim/rpg/rpg-state';
import type { ActionHandler } from '../../input';
import {
  BOSS_COLORS, BOSS_GLOW_COLORS, BOSS_NAMES, BOSS_HP_INIT, BOSS_ATK_INIT, BOSS_DEF_INIT,
  BOSS_SIZE_BASE,
} from '../../render/rpg/rpg-constants';
import { type EnemyCatalogEntry, ENEMY_CATALOG, BOSS_DESCRIPTIONS } from './rpg-enemies-catalog';

// ─── Types ────────────────────────────────────────────────────────

export interface RpgEnemiesTabPane {
  element: HTMLElement;
  update(rpgState: RpgSimState | null, isDevMode: boolean): void;
}

// ─── Icon canvas size ─────────────────────────────────────────────

const ICON_SIZE = 40;

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
function createAlivenIconCanvas(entry: EnemyCatalogEntry): HTMLCanvasElement {
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

// ─── Icon drawing ─────────────────────────────────────────────────

function drawPolygonPath(
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

function drawEnemyIcon(canvas: HTMLCanvasElement, entry: EnemyCatalogEntry): void {
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

function drawBossIcon(canvas: HTMLCanvasElement, bossId: number): void {
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

// ─── Entry builders ───────────────────────────────────────────────

function buildEnemyEntry(
  entry: EnemyCatalogEntry,
  isLocked: boolean,
  isDevMode: boolean,
): HTMLElement {
  const box = document.createElement('div');
  box.style.cssText =
    `display:flex;gap:10px;align-items:flex-start;` +
    `background:${isLocked && !isDevMode ? 'rgba(15,10,20,0.5)' : 'rgba(20,15,35,0.85)'};` +
    `border:1px solid ${isLocked && !isDevMode ? 'rgba(255,255,255,0.07)' : entry.glowColor + '44'};` +
    `border-radius:6px;padding:10px 12px;opacity:${isLocked && !isDevMode ? '0.45' : '1'};`;

  // Icon canvas — aliven entries get an animated mini-sim; others get a static icon.
  const isAliven = entry.id.startsWith('aliven_');
  const showLocked = isLocked && !isDevMode;
  let canvas: HTMLCanvasElement;

  if (isAliven && !showLocked) {
    canvas = createAlivenIconCanvas(entry);
  } else {
    canvas = document.createElement('canvas');
    canvas.width  = ICON_SIZE;
    canvas.height = ICON_SIZE;
    canvas.style.cssText = 'flex-shrink:0;border-radius:4px;background:rgba(0,0,0,0.35);';
    if (!showLocked) {
      drawEnemyIcon(canvas, entry);
    } else {
      // Draw a question mark for undiscovered entries
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = `bold ${ICON_SIZE * 0.5}px sans-serif`;
        ctx.fillStyle = '#555';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', ICON_SIZE / 2, ICON_SIZE / 2);
      }
    }
  }
  box.appendChild(canvas);

  // Text area
  const textArea = document.createElement('div');
  textArea.style.cssText = 'flex:1;min-width:0;';

  // Name row
  const nameRow = document.createElement('div');
  nameRow.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;';

  const nameEl = document.createElement('span');
  nameEl.style.cssText = `font-weight:700;font-size:0.88em;color:${isLocked && !isDevMode ? '#555' : entry.glowColor};`;
  nameEl.textContent = isLocked && !isDevMode ? `🔒 ??? (wave ${entry.firstWave}+)` : entry.name;
  nameRow.appendChild(nameEl);

  if (isDevMode && isLocked) {
    const devBadge = document.createElement('span');
    devBadge.style.cssText = 'font-size:0.68em;color:#ff8844;font-weight:600;margin-left:6px;white-space:nowrap;';
    devBadge.textContent = `wave ${entry.firstWave}+`;
    nameRow.appendChild(devBadge);
  }
  textArea.appendChild(nameRow);

  if (!isLocked || isDevMode) {
    // Stats row
    const statsRow = document.createElement('div');
    statsRow.style.cssText = 'display:flex;gap:8px;margin-bottom:4px;flex-wrap:wrap;';
    const stats: Array<[string, number, string]> = [
      ['HP', entry.hp, '#69db7c'],
      ['ATK', entry.atk, '#ff6b6b'],
      ['DEF', entry.def, '#74c0fc'],
    ];
    for (const [label, val, col] of stats) {
      const chip = document.createElement('span');
      chip.style.cssText = `font-size:0.72em;color:${col};white-space:nowrap;`;
      chip.textContent = `${label} ${val}`;
      statsRow.appendChild(chip);
    }
    textArea.appendChild(statsRow);

    // Description
    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:0.75em;color:#99a;line-height:1.35;';
    desc.textContent = entry.description;
    textArea.appendChild(desc);
  }

  box.appendChild(textArea);
  return box;
}

function buildBossEntry(
  bossId: number,
  isLocked: boolean,
  isDevMode: boolean,
  bestSpeed: number,
): HTMLElement {
  const glowColor = BOSS_GLOW_COLORS[Math.min(bossId, BOSS_GLOW_COLORS.length - 1)];
  const bossName = BOSS_NAMES[Math.min(bossId, BOSS_NAMES.length - 1)];
  const description = BOSS_DESCRIPTIONS[Math.min(bossId, BOSS_DESCRIPTIONS.length - 1)] ?? '';

  const box = document.createElement('div');
  box.style.cssText =
    `display:flex;gap:10px;align-items:flex-start;` +
    `background:${isLocked && !isDevMode ? 'rgba(15,10,20,0.5)' : 'rgba(25,10,40,0.9)'};` +
    `border:1px solid ${isLocked && !isDevMode ? 'rgba(255,255,255,0.07)' : glowColor + '55'};` +
    `border-radius:6px;padding:10px 12px;opacity:${isLocked && !isDevMode ? '0.4' : '1'};`;

  // Icon canvas
  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  canvas.style.cssText = 'flex-shrink:0;border-radius:4px;background:rgba(0,0,0,0.45);';
  if (!isLocked || isDevMode) {
    drawBossIcon(canvas, bossId);
  } else {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = `bold ${ICON_SIZE * 0.5}px sans-serif`;
      ctx.fillStyle = '#444';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', ICON_SIZE / 2, ICON_SIZE / 2);
    }
  }
  box.appendChild(canvas);

  // Text area
  const textArea = document.createElement('div');
  textArea.style.cssText = 'flex:1;min-width:0;';

  // Name row
  const nameRow = document.createElement('div');
  nameRow.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;';

  const nameEl = document.createElement('span');
  nameEl.style.cssText = `font-weight:700;font-size:0.88em;color:${isLocked && !isDevMode ? '#555' : glowColor};`;
  if (isLocked && !isDevMode) {
    nameEl.textContent = `🔒 Boss ${bossId} (wave ${bossId * 100})`;
  } else {
    nameEl.textContent = `${bestSpeed > 0 ? '✦ ' : ''}Boss ${bossId}: ${bossName}`;
  }
  nameRow.appendChild(nameEl);

  if (isDevMode && isLocked) {
    const devBadge = document.createElement('span');
    devBadge.style.cssText = 'font-size:0.68em;color:#ff8844;font-weight:600;margin-left:6px;white-space:nowrap;';
    devBadge.textContent = `wave ${bossId * 100}`;
    nameRow.appendChild(devBadge);
  }
  textArea.appendChild(nameRow);

  if (!isLocked || isDevMode) {
    // Stats row
    const statsRow = document.createElement('div');
    statsRow.style.cssText = 'display:flex;gap:8px;margin-bottom:4px;flex-wrap:wrap;';
    const stats: Array<[string, number, string]> = [
      ['HP', BOSS_HP_INIT, '#69db7c'],
      ['ATK', BOSS_ATK_INIT, '#ff6b6b'],
      ['DEF', BOSS_DEF_INIT, '#74c0fc'],
    ];
    for (const [label, val, col] of stats) {
      const chip = document.createElement('span');
      chip.style.cssText = `font-size:0.72em;color:${col};white-space:nowrap;`;
      chip.textContent = `${label} ${val}`;
      statsRow.appendChild(chip);
    }
    if (bestSpeed > 0) {
      const beatChip = document.createElement('span');
      beatChip.style.cssText = 'font-size:0.72em;color:#69db7c;white-space:nowrap;';
      beatChip.textContent = `Best: ${bestSpeed}% speed`;
      statsRow.appendChild(beatChip);
    }
    textArea.appendChild(statsRow);

    // Description
    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:0.75em;color:#99a;line-height:1.35;';
    desc.textContent = description;
    textArea.appendChild(desc);
  }

  box.appendChild(textArea);
  return box;
}

// ─── Factory ─────────────────────────────────────────────────────

export function createRpgEnemiesTabPane(_dispatch: ActionHandler): RpgEnemiesTabPane {
  const element = document.createElement('div');
  element.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:4px 0;';

  function update(rpgState: RpgSimState | null, isDevMode: boolean): void {
    element.innerHTML = '';
    if (!rpgState) return;

    const highestWave = rpgState.highestWaveReached;

    // ── Section heading ───────────────────────────────────────
    const heading = document.createElement('div');
    heading.style.cssText = 'font-size:0.78em;color:#888;text-align:center;margin-bottom:2px;';
    heading.textContent = isDevMode
      ? '🔧 Dev Mode — all entries visible'
      : `Encountered through wave ${highestWave}`;
    element.appendChild(heading);

    // ── Regular enemies ───────────────────────────────────────
    const enemiesHeading = document.createElement('div');
    enemiesHeading.style.cssText =
      'font-size:0.8em;font-weight:700;color:#aaa;letter-spacing:0.05em;' +
      'padding:4px 0 2px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:4px;';
    enemiesHeading.textContent = '⚔ Enemies';
    element.appendChild(enemiesHeading);

    for (const entry of ENEMY_CATALOG) {
      const isLocked = highestWave < entry.firstWave;
      // Skip locked entries unless in dev mode
      if (isLocked && !isDevMode) continue;
      element.appendChild(buildEnemyEntry(entry, isLocked, isDevMode));
    }

    // ── Bosses ────────────────────────────────────────────────
    const bossesHeading = document.createElement('div');
    bossesHeading.style.cssText =
      'font-size:0.8em;font-weight:700;color:#aaa;letter-spacing:0.05em;' +
      'padding:8px 0 2px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:4px;';
    bossesHeading.textContent = '👑 Bosses';
    element.appendChild(bossesHeading);

    let anyBossVisible = false;
    for (let bossId = 1; bossId <= TOTAL_BOSS_COUNT; bossId++) {
      const bestSpeed = rpgState.bossCompletions.get(bossId) ?? 0;
      const isBeaten = bestSpeed > 0;
      // Locked = not yet beaten
      if (!isBeaten && !isDevMode) continue;
      anyBossVisible = true;
      element.appendChild(buildBossEntry(bossId, !isBeaten, isDevMode, bestSpeed));
    }

    if (!anyBossVisible) {
      const noBosses = document.createElement('div');
      noBosses.style.cssText = 'font-size:0.78em;color:#666;text-align:center;padding:6px 0;';
      noBosses.textContent = 'No bosses defeated yet.';
      element.appendChild(noBosses);
    }
  }

  const pane: RpgEnemiesTabPane = { element, update };
  return pane;
}
