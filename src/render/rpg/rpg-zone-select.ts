/**
 * rpg-zone-select.ts — Canvas node-map UI for RPG zone selection.
 *
 * Renders a pannable / zoomable map of floating icon nodes connected by
 * particle-string ropes.  Preserves the original RpgZoneSelectPanel interface
 * so no changes are required in rpg-render.ts.
 *
 * Layout (world coordinates):
 *   Zone chain  — left/center  (x: ~120–530)
 *   Horizon triad — branching from Verdure
 *   Boss S-curve — right side  (x: ~700–820)
 */

import type { RpgZoneId } from '../../data/rpg/rpg-zone-definitions';
import { RPG_ZONE_DEFINITIONS } from '../../data/rpg/rpg-zone-definitions';
import type { RpgSimState, HorizonSubzoneId } from '../../sim/rpg/rpg-state';
import {
  BOSS_SPEED_STEP, MAX_BOSS_SPEED_PCT, MIN_BOSS_SPEED_PCT,
  getBossXpMultiplier, isBossUnlocked,
} from '../../sim/rpg/rpg-state';
import { loadImage, getCachedImage } from '../assets/asset-loader';

export type { HorizonSubzoneId };

// ─── Constants ─────────────────────────────────────────────────────────────

const NODE_SIZE         = 80;    // zone node square side (world px)
const BOSS_NODE_SIZE    = 60;    // boss node square side
const HORIZON_R         = 44;    // horizon subnode circle radius
const HORIZON_TRIAD_R   = 90;    // radius of the invisible triad circle
const FLOAT_AMP         = 5;     // float oscillation amplitude (world px)
const FLOAT_SPD         = 0.0008;// radians per ms
const MOTES_PER_CONN     = 5;
const MOTE_SPEED_MIN     = 0.000055;
const MOTE_SPEED_MAX     = 0.000095;
const MOTE_RADIUS_MIN    = 1.25;
const MOTE_RADIUS_MAX    = 2.15;
const MOTE_WOBBLE_MIN    = 1.5;
const MOTE_WOBBLE_MAX    = 4.5;
const MOTE_TRAIL_STEPS   = 3;
const MOTE_TRAIL_GAP_MS  = 42;
const MOTE_GLOW_ALPHA    = 0.62;
const BOSS_CURVE_OFFSET  = 28;
const GOLD_PALETTE       = ['#fff4a8', '#ffd866', '#f2b84b', '#cfae52'] as const;
const ZOOM_MIN          = 0.28;
const ZOOM_MAX          = 2.6;
const CORNER_R          = 12;    // rounded-rect corner radius
const EXIT_SIZE         = 46;    // exit button CSS px
const EXIT_MARGIN       = 12;
const DRAG_THRESHOLD    = 5;     // px before a tap becomes a drag
const NODE_HOME_SPRING  = 0.000018;
const ROPE_SPRING       = 0.000012;
const NODE_DAMPING      = 0.92;
const MAX_PHYSICS_DT_MS = 32;
const BACKGROUND_PATH   = 'ASSETS/ANIMATIONS/rpgBackground/rpgBackground_animation.webp';

// Pan soft-limits in world coordinates (camera center)
const PAN_MIN_X = -100;
const PAN_MAX_X = 1000;
const PAN_MIN_Y = -100;
const PAN_MAX_Y = 800;

// ─── Asset path helpers ────────────────────────────────────────────────────

const ZONE_ICON_LABEL: Partial<Record<string, string>> = {
  euhedral: 'Euhedral',
  impetus:  'Impetus',
  caustics: 'Caustics',
  verdure:  'Verdure',
  zenith:   'Zenith',
  nadir:    'Nadir',
  true:     'True',
};

function getZoneIconPath(id: string): string {
  const name = ZONE_ICON_LABEL[id] ?? id;
  return `ASSETS/SPRITES/zoneIcons/ZoneIcon_${name}.png`;
}

const BOSS_IDS = [
  'quartz', 'ruby', 'sunstone', 'citrine', 'iolite', 'amethyst',
  'diamond', 'nullstone', 'fracteryl', 'eigenstein', 'equation', 'void',
] as const;

function getBossIconPath(id: string): string {
  return `ASSETS/SPRITES/bossIcons/bossIcon_${id}.png`;
}

// ─── World layout ──────────────────────────────────────────────────────────

const ZONE_POS: Record<RpgZoneId, { x: number; y: number }> = {
  euhedral: { x: 130, y: 230 },
  impetus:  { x: 270, y: 130 },
  caustics: { x: 420, y: 215 },
  verdure:  { x: 305, y: 375 },
  horizon:  { x: 480, y: 400 }, // triad center (not drawn itself)
};

const HORIZON_SUBZONE_IDS: HorizonSubzoneId[] = ['zenith', 'true', 'nadir'];

const HORIZON_SUBZONE_ANGLES: Record<HorizonSubzoneId, number> = {
  zenith: -Math.PI / 2,
  true:   -Math.PI / 2 + (2 * Math.PI / 3),
  nadir:  -Math.PI / 2 + (4 * Math.PI / 3),
};

function makeBossPositions(): Array<{ x: number; y: number }> {
  return BOSS_IDS.map((_, i) => {
    const angle = -Math.PI * 0.7 + i * 0.82;
    const radius = 82 + i * 24;
    return {
      x: 720 + Math.cos(angle) * radius,
      y: 390 + Math.sin(angle) * radius,
    };
  });
}

// ─── Node data type ────────────────────────────────────────────────────────

interface MapNode {
  id: string;
  label: string;
  x: number;
  y: number;
  /** Half-dimension: radius for circles, half-side for squares */
  half: number;
  isCircle: boolean;
  /** Phase offset so every node floats out of sync */
  phase: number;
  iconPath: string;
  homeX: number;
  homeY: number;
  vx: number;
  vy: number;
}

interface ConnectionMote {
  phase: number;
  speed: number;
  radius: number;
  wobble: number;
  wobblePhase: number;
  color: string;
  glowIndex: number;
}

interface MapConnection {
  a: MapNode;
  b: MapNode;
  curveOffset: number;
  guideColor: string;
  motes: ConnectionMote[];
  restLength: number;
}

// ─── Render helpers ────────────────────────────────────────────────────────

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | undefined,
  width: number,
  height: number,
): void {
  ctx.fillStyle = '#04040c';
  ctx.fillRect(0, 0, width, height);

  if (image && image.naturalWidth > 1 && image.naturalHeight > 1) {
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  }

  ctx.fillStyle = 'rgba(4,4,12,0.58)';
  ctx.fillRect(0, 0, width, height);
}

function drawSquareNode(
  ctx: CanvasRenderingContext2D,
  node: MapNode,
  cy: number,       // current float-adjusted y
  isActive: boolean,
  isHovered: boolean,
): void {
  const s  = node.half * 2;
  const x  = node.x - node.half;
  const y  = cy - node.half;
  const frameColor = isActive ? '#fff172' : isHovered ? '#88aaff' : '#3a3a66';
  const bgColor    = isActive ? 'rgba(30,26,8,0.92)' : 'rgba(10,10,24,0.88)';
  const lw         = isActive ? 2.2 : 1.4;

  if (isActive || isHovered) {
    ctx.save();
    ctx.shadowColor = isActive ? '#fff17280' : '#88aaff60';
    ctx.shadowBlur  = 20;
    roundedRect(ctx, x, y, s, s, CORNER_R);
    ctx.strokeStyle = frameColor;
    ctx.lineWidth   = lw + 1;
    ctx.stroke();
    ctx.restore();
  }

  roundedRect(ctx, x, y, s, s, CORNER_R);
  ctx.fillStyle   = bgColor;
  ctx.fill();
  ctx.strokeStyle = frameColor;
  ctx.lineWidth   = lw;
  ctx.stroke();

  const img = getCachedImage(node.iconPath);
  if (img && img.naturalWidth > 1) {
    const pad = 10;
    ctx.drawImage(img, x + pad, y + pad, s - pad * 2, s - pad * 2);
  } else {
    ctx.fillStyle = '#223';
    roundedRect(ctx, x + 6, y + 6, s - 12, s - 12, CORNER_R * 0.5);
    ctx.fill();
  }

  // Label below node
  ctx.font        = `bold 10px monospace`;
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle   = isActive ? '#fff172' : '#b0a880';
  ctx.fillText(node.label, node.x, cy + node.half + 4);
  ctx.textBaseline = 'alphabetic';
}

function drawLockedBossNode(
  ctx: CanvasRenderingContext2D,
  node: MapNode,
  cy: number,
  isHovered: boolean,
): void {
  ctx.save();
  ctx.globalAlpha = isHovered ? 0.62 : 0.42;
  drawSquareNode(ctx, { ...node, label: '?????' }, cy, false, isHovered);
  ctx.globalAlpha = isHovered ? 0.9 : 0.72;
  const lockY = cy - 2;
  ctx.fillStyle = '#090912';
  ctx.strokeStyle = '#c0b98a';
  ctx.lineWidth = 2.5;
  roundedRect(ctx, node.x - 12, lockY - 4, 24, 19, 4);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(node.x, lockY - 4, 8, Math.PI, 0);
  ctx.stroke();
  ctx.restore();
}

function drawCircleNode(
  ctx: CanvasRenderingContext2D,
  node: MapNode,
  cy: number,
  isActive: boolean,
  isHovered: boolean,
): void {
  const r = node.half;
  const frameColor = isActive ? '#fff172' : isHovered ? '#88aaff' : '#3a3a66';
  const bgColor    = isActive ? 'rgba(30,26,8,0.92)' : 'rgba(10,10,24,0.88)';
  const lw         = isActive ? 2.2 : 1.4;

  if (isActive || isHovered) {
    ctx.save();
    ctx.shadowColor = isActive ? '#fff17280' : '#88aaff60';
    ctx.shadowBlur  = 18;
    ctx.beginPath();
    ctx.arc(node.x, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = frameColor;
    ctx.lineWidth   = lw + 1;
    ctx.stroke();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(node.x, cy, r, 0, Math.PI * 2);
  ctx.fillStyle   = bgColor;
  ctx.fill();
  ctx.strokeStyle = frameColor;
  ctx.lineWidth   = lw;
  ctx.stroke();

  const img = getCachedImage(node.iconPath);
  if (img && img.naturalWidth > 1) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(node.x, cy, r - 5, 0, Math.PI * 2);
    ctx.clip();
    const d = (r - 5) * 2;
    ctx.drawImage(img, node.x - r + 5, cy - r + 5, d, d);
    ctx.restore();
  }

  ctx.font        = `bold 9px monospace`;
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle   = isActive ? '#fff172' : '#b0a880';
  ctx.fillText(node.label, node.x, cy + r + 3);
  ctx.textBaseline = 'alphabetic';
}

function makeGlowSprite(size: number, color: string): HTMLCanvasElement {
  const sprite = document.createElement('canvas');
  sprite.width = size;
  sprite.height = size;
  const spriteCtx = sprite.getContext('2d')!;
  const center = size / 2;
  const gradient = spriteCtx.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, color + 'e8');
  gradient.addColorStop(0.28, color + '80');
  gradient.addColorStop(1, color + '00');
  spriteCtx.fillStyle = gradient;
  spriteCtx.fillRect(0, 0, size, size);
  return sprite;
}

function seededUnit(seed: number): number {
  const x = Math.sin(seed * 91.731 + 17.17) * 43758.5453;
  return x - Math.floor(x);
}

function makeConnection(a: MapNode, b: MapNode, index: number, guideColor: string, curveOffset = 0): MapConnection {
  const motes: ConnectionMote[] = [];
  for (let i = 0; i < MOTES_PER_CONN; i++) {
    const seed = index * MOTES_PER_CONN + i + 1;
    motes.push({
      phase: (i / MOTES_PER_CONN + seededUnit(seed) * 0.18) % 1,
      speed: MOTE_SPEED_MIN + seededUnit(seed + 11) * (MOTE_SPEED_MAX - MOTE_SPEED_MIN),
      radius: MOTE_RADIUS_MIN + seededUnit(seed + 23) * (MOTE_RADIUS_MAX - MOTE_RADIUS_MIN),
      wobble: MOTE_WOBBLE_MIN + seededUnit(seed + 37) * (MOTE_WOBBLE_MAX - MOTE_WOBBLE_MIN),
      wobblePhase: seededUnit(seed + 51) * Math.PI * 2,
      color: GOLD_PALETTE[Math.floor(seededUnit(seed + 67) * GOLD_PALETTE.length)],
      glowIndex: seededUnit(seed + 79) > 0.7 ? 2 : seededUnit(seed + 83) > 0.45 ? 1 : 0,
    });
  }
  return { a, b, curveOffset, guideColor, motes, restLength: Math.hypot(b.x - a.x, b.y - a.y) };
}

function sampleConnection(
  conn: MapConnection,
  ay: number,
  by: number,
  t: number,
  wobble: number,
): { x: number; y: number } {
  const dx = conn.b.x - conn.a.x;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const controlX = (conn.a.x + conn.b.x) * 0.5 + nx * conn.curveOffset;
  const controlY = (ay + by) * 0.5 + ny * conn.curveOffset;
  const inv = 1 - t;
  return {
    x: inv * inv * conn.a.x + 2 * inv * t * controlX + t * t * conn.b.x + nx * wobble,
    y: inv * inv * ay + 2 * inv * t * controlY + t * t * by + ny * wobble,
  };
}

function drawParticleConn(
  ctx: CanvasRenderingContext2D,
  conn: MapConnection,
  ay: number,
  by: number,
  tMs: number,
  glowSprites: readonly HTMLCanvasElement[],
): void {
  // Subtle guide line
  ctx.beginPath();
  const guideStart = sampleConnection(conn, ay, by, 0, 0);
  ctx.moveTo(guideStart.x, guideStart.y);
  for (let i = 1; i <= 8; i++) {
    const point = sampleConnection(conn, ay, by, i / 8, 0);
    ctx.lineTo(point.x, point.y);
  }
  ctx.strokeStyle = conn.guideColor;
  ctx.lineWidth   = 0.8;
  ctx.stroke();

  for (const mote of conn.motes) {
    const cycle = (tMs * mote.speed + mote.phase) % 1;
    const t = 1 - Math.abs(cycle * 2 - 1);
    const wobble = mote.wobble * Math.sin(tMs * 0.0013 + mote.wobblePhase) * Math.sin(t * Math.PI);
    const point = sampleConnection(conn, ay, by, t, wobble);

    for (let trail = MOTE_TRAIL_STEPS; trail >= 1; trail--) {
      const trailCycle = ((tMs - trail * MOTE_TRAIL_GAP_MS) * mote.speed + mote.phase + 1) % 1;
      const trailT = 1 - Math.abs(trailCycle * 2 - 1);
      const trailWobble = mote.wobble * Math.sin((tMs - trail * MOTE_TRAIL_GAP_MS) * 0.0013 + mote.wobblePhase) * Math.sin(trailT * Math.PI);
      const trailPoint = sampleConnection(conn, ay, by, trailT, trailWobble);
      ctx.beginPath();
      ctx.moveTo(trailPoint.x, trailPoint.y);
      ctx.lineTo(point.x, point.y);
      ctx.strokeStyle = mote.color;
      ctx.globalAlpha = 0.07 * (MOTE_TRAIL_STEPS - trail + 1);
      ctx.lineWidth = mote.radius * 0.55;
      ctx.stroke();
    }

    const glow = glowSprites[mote.glowIndex];
    const glowSize = glow.width * 0.5;
    ctx.globalAlpha = MOTE_GLOW_ALPHA;
    ctx.drawImage(glow, point.x - glowSize / 2, point.y - glowSize / 2, glowSize, glowSize);
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(point.x, point.y, mote.radius, 0, Math.PI * 2);
    ctx.fillStyle = mote.color;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ─── Public interface ──────────────────────────────────────────────────────

export interface RpgZoneSelectPanel {
  /** Root element — appended to #rpg-area. */
  element: HTMLElement;
  open(): void;
  close(): void;
  isOpen: boolean;
}

// ─── Factory ───────────────────────────────────────────────────────────────

export function createRpgZoneSelectPanel(
  rpgSimState: RpgSimState,
  onZoneSelect: (zoneId: RpgZoneId) => void,
  onSubzoneSelect?: (subzoneId: HorizonSubzoneId) => void,
  onBossFight?: (bossId: number) => void,
): RpgZoneSelectPanel {

  let _isOpen  = false;
  let _rafId   = 0;
  let _lastTMs = 0;

  // ── Overlay div ───────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'rpg-zone-select';
  overlay.style.cssText = [
    'display:none',
    'position:absolute',
    'inset:0',
    'z-index:20',
    'overflow:hidden',
    'touch-action:none',
    'cursor:default',
  ].join(';');

  // ── Map canvas ────────────────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  overlay.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  // ── Exit button (screen-space DOM so it stays accessible at any zoom) ─────
  const exitBtn = document.createElement('button');
  exitBtn.setAttribute('aria-label', 'Close zone selection');
  exitBtn.style.cssText = [
    'position:absolute',
    `top:${EXIT_MARGIN}px`,
    `right:${EXIT_MARGIN}px`,
    `width:${EXIT_SIZE}px`,
    `height:${EXIT_SIZE}px`,
    'background:rgba(10,10,24,0.92)',
    'border:1.5px solid #3a3a66',
    'border-radius:10px',
    'color:#999',
    'font-size:19px',
    'line-height:1',
    'cursor:pointer',
    'z-index:22',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:0',
    'animation:zs-float-btn 2.8s ease-in-out infinite',
  ].join(';');
  exitBtn.textContent = '✕';

  // Inject keyframe if not already present
  if (!document.getElementById('zs-float-style')) {
    const style = document.createElement('style');
    style.id = 'zs-float-style';
    style.textContent = `
      @keyframes zs-float-btn {
        0%,100% { transform: translateY(0px); }
        50%      { transform: translateY(-4px); }
      }
    `;
    document.head.appendChild(style);
  }

  exitBtn.addEventListener('mouseenter', () => {
    exitBtn.style.background   = 'rgba(28,28,50,0.97)';
    exitBtn.style.borderColor  = '#88aaff';
    exitBtn.style.color        = '#fff';
  });
  exitBtn.addEventListener('mouseleave', () => {
    exitBtn.style.background   = 'rgba(10,10,24,0.92)';
    exitBtn.style.borderColor  = '#3a3a66';
    exitBtn.style.color        = '#999';
  });
  exitBtn.addEventListener('click', () => handle.close());
  overlay.appendChild(exitBtn);

  const bossModal = document.createElement('div');
  bossModal.style.cssText = 'display:none;position:absolute;inset:0;z-index:23;background:rgba(2,2,10,.72);align-items:center;justify-content:center;padding:16px;';
  const bossCard = document.createElement('div');
  bossCard.style.cssText = 'width:min(560px,100%);background:rgba(14,14,30,.98);border:1.5px solid #fff17266;border-radius:10px;padding:16px;box-shadow:0 0 30px #000;';
  bossModal.appendChild(bossCard);
  overlay.appendChild(bossModal);

  function closeBossModal(): void {
    bossModal.style.display = 'none';
  }

  // ── Build node arrays ─────────────────────────────────────────────────────

  // Non-horizon zone nodes
  const zoneNodes: MapNode[] = RPG_ZONE_DEFINITIONS
    .filter(z => z.id !== 'horizon')
    .map((z, i) => ({
      id:       z.id,
      label:    z.displayName,
      x:        ZONE_POS[z.id].x,
      y:        ZONE_POS[z.id].y,
      half:     NODE_SIZE / 2,
      isCircle: false,
      phase:    i * 1.3,
      iconPath: getZoneIconPath(z.id),
      homeX: ZONE_POS[z.id].x, homeY: ZONE_POS[z.id].y, vx: 0, vy: 0,
    }));

  // Horizon triad nodes
  const hCenter = ZONE_POS.horizon;
  const horizonNodes: MapNode[] = HORIZON_SUBZONE_IDS.map((sub, i) => {
    const ang = HORIZON_SUBZONE_ANGLES[sub];
    return {
      id:       sub,
      label:    sub.charAt(0).toUpperCase() + sub.slice(1),
      x:        hCenter.x + HORIZON_TRIAD_R * Math.cos(ang),
      y:        hCenter.y + HORIZON_TRIAD_R * Math.sin(ang),
      half:     HORIZON_R,
      isCircle: true,
      phase:    i * 0.9 + 5,
      iconPath: getZoneIconPath(sub),
      homeX: hCenter.x + HORIZON_TRIAD_R * Math.cos(ang),
      homeY: hCenter.y + HORIZON_TRIAD_R * Math.sin(ang),
      vx: 0, vy: 0,
    };
  });

  // Boss S-curve nodes
  const bossPos = makeBossPositions();
  const bossNodes: MapNode[] = BOSS_IDS.map((id, i) => ({
    id:       `boss_${id}`,
    label:    id.charAt(0).toUpperCase() + id.slice(1),
    x:        bossPos[i].x,
    y:        bossPos[i].y,
    half:     BOSS_NODE_SIZE / 2,
    isCircle: false,
    phase:    i * 0.85 + 2.1,
    iconPath: getBossIconPath(id),
    homeX: bossPos[i].x, homeY: bossPos[i].y, vx: 0, vy: 0,
  }));

  const connections: MapConnection[] = [];
  for (let i = 0; i < zoneNodes.length - 1; i++) {
    connections.push(makeConnection(zoneNodes[i], zoneNodes[i + 1], connections.length, '#4466cc20'));
  }
  const verdure = zoneNodes.find(n => n.id === 'verdure')!;
  for (const node of horizonNodes) {
    connections.push(makeConnection(verdure, node, connections.length, '#7755cc20'));
  }
  for (let i = 0; i < horizonNodes.length; i++) {
    connections.push(makeConnection(horizonNodes[i], horizonNodes[(i + 1) % horizonNodes.length], connections.length, '#9966dd20'));
  }
  const bossConnections: MapConnection[] = [];
  for (let i = 0; i < bossNodes.length - 1; i++) {
    bossConnections.push(makeConnection(bossNodes[i], bossNodes[i + 1], connections.length + i, '#cc664420', BOSS_CURVE_OFFSET));
  }

  // Cached radial sprites provide soft blur without per-frame gradients, filters, or shadowBlur.
  const glowSprites = [
    makeGlowSprite(16, '#fff4a8'),
    makeGlowSprite(24, '#ffd866'),
    makeGlowSprite(32, '#e2a83e'),
  ];

  function openBossModal(bossId: number): void {
    bossCard.innerHTML = `<div style="color:#fff172;font-weight:700;margin-bottom:10px">Boss ${bossId}: ${bossNodes[bossId - 1].label}</div>`;
    const description = document.createElement('div');
    description.style.cssText = 'color:#999;font-size:.8rem;margin-bottom:12px;';
    description.textContent = `Speed ${rpgSimState.bossSpeedPct}% · XP multiplier ${getBossXpMultiplier(rpgSimState.bossSpeedPct).toFixed(0)}x`;
    bossCard.appendChild(description);
    const speeds = document.createElement('div');
    speeds.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;';
    for (let pct = MIN_BOSS_SPEED_PCT; pct <= MAX_BOSS_SPEED_PCT; pct += BOSS_SPEED_STEP) {
      const button = document.createElement('button');
      const active = pct === rpgSimState.bossSpeedPct;
      button.textContent = `${pct}%`;
      button.style.cssText = `padding:7px 9px;border-radius:5px;background:${active ? '#fff17233' : '#141428'};color:${active ? '#fff172' : '#aaa'};border:1px solid ${active ? '#fff17299' : '#ffffff22'};`;
      button.addEventListener('click', () => { rpgSimState.bossSpeedPct = pct; openBossModal(bossId); });
      speeds.appendChild(button);
    }
    bossCard.appendChild(speeds);
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';
    const back = document.createElement('button');
    back.textContent = 'Back';
    back.style.cssText = 'padding:8px 18px;border-radius:5px;background:#18182c;color:#bbb;border:1px solid #ffffff33;';
    back.addEventListener('click', closeBossModal);
    const fight = document.createElement('button');
    fight.textContent = 'Fight!';
    fight.style.cssText = 'padding:8px 18px;border-radius:5px;background:#fff17233;color:#fff172;border:1px solid #fff17299;font-weight:700;';
    fight.addEventListener('click', () => { onBossFight?.(bossId); handle.close(); });
    actions.append(back, fight);
    bossCard.appendChild(actions);
    bossModal.style.display = 'flex';
  }

  // Kick off icon preloads (fire-and-forget; getCachedImage used during draw)
  for (const node of [...zoneNodes, ...horizonNodes, ...bossNodes]) {
    loadImage(node.iconPath).catch(() => {
      // eslint-disable-next-line no-console
      console.warn(`[ZoneSelect] missing icon: ${node.iconPath}`);
    });
  }
  loadImage(BACKGROUND_PATH).catch(() => {
    // eslint-disable-next-line no-console
    console.warn(`[ZoneSelect] missing background: ${BACKGROUND_PATH}`);
  });

  // ── Camera ────────────────────────────────────────────────────────────────

  let camX    = 420;
  let camY    = 330;
  let camZoom = 1;

  function clampCam(): void {
    camX = Math.max(PAN_MIN_X, Math.min(PAN_MAX_X, camX));
    camY = Math.max(PAN_MIN_Y, Math.min(PAN_MAX_Y, camY));
  }

  function resetCamera(): void {
    const w = canvas.width  || overlay.clientWidth  || 600;
    const h = canvas.height || overlay.clientHeight || 400;
    camX    = 420;
    camY    = 330;
    camZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(w / 960, h / 740) * 0.88));
  }

  function screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - canvas.width  / 2) / camZoom + camX,
      y: (sy - canvas.height / 2) / camZoom + camY,
    };
  }

  // ── Interaction ───────────────────────────────────────────────────────────

  interface PtrState { startX: number; startY: number; lastX: number; lastY: number }
  const ptrs = new Map<number, PtrState>();
  let isDragging      = false;
  let dragBaseCamX    = 0;
  let dragBaseCamY    = 0;
  let dragBaseMidX    = 0;
  let dragBaseMidY    = 0;
  let pinchBaseDist   = 0;
  let pinchBaseZoom   = 1;
  let hoveredId: string | null = null;
  let selectedId: string | null = null;
  let draggedNode: MapNode | null = null;
  let dragNodeOffsetX = 0;
  let dragNodeOffsetY = 0;

  function visibleBossCount(): number {
    let unlockedCount = 0;
    while (unlockedCount < bossNodes.length
      && isBossUnlocked(unlockedCount + 1, rpgSimState.highestWaveReached)) {
      unlockedCount++;
    }
    return Math.min(bossNodes.length, unlockedCount + (unlockedCount < bossNodes.length ? 1 : 0));
  }

  function visibleBossNodes(): MapNode[] {
    return bossNodes.slice(0, visibleBossCount());
  }

  function allNodes(): MapNode[] {
    return [...zoneNodes, ...horizonNodes, ...visibleBossNodes()];
  }

  function visibleConnections(): MapConnection[] {
    const result = connections.slice();
    const bossCount = visibleBossCount();
    for (let i = 0; i < bossCount - 1; i++) result.push(bossConnections[i]);
    return result;
  }

  function updateNodePhysics(deltaMs: number): void {
    const dt = Math.min(MAX_PHYSICS_DT_MS, Math.max(0, deltaMs));
    if (dt <= 0) return;
    const nodes = allNodes();
    for (const node of nodes) {
      if (node === draggedNode) continue;
      node.vx += (node.homeX - node.x) * NODE_HOME_SPRING * dt;
      node.vy += (node.homeY - node.y) * NODE_HOME_SPRING * dt;
    }
    for (const connection of visibleConnections()) {
      const dx = connection.b.x - connection.a.x;
      const dy = connection.b.y - connection.a.y;
      const length = Math.hypot(dx, dy) || 1;
      const force = (length - connection.restLength) * ROPE_SPRING * dt;
      const fx = dx / length * force;
      const fy = dy / length * force;
      if (connection.a !== draggedNode) { connection.a.vx += fx; connection.a.vy += fy; }
      if (connection.b !== draggedNode) { connection.b.vx -= fx; connection.b.vy -= fy; }
    }
    const damping = Math.pow(NODE_DAMPING, dt / 16.67);
    for (const node of nodes) {
      if (node === draggedNode) continue;
      node.vx *= damping;
      node.vy *= damping;
      node.x += node.vx * dt;
      node.y += node.vy * dt;
    }
  }

  function hitTest(wx: number, wy: number, tMs: number): MapNode | null {
    for (const node of allNodes()) {
      const fy  = FLOAT_AMP * Math.sin(tMs * FLOAT_SPD + node.phase);
      const cy  = node.y + fy;
      if (node.isCircle) {
        if (Math.hypot(wx - node.x, wy - cy) <= node.half) return node;
      } else {
        if (wx >= node.x - node.half && wx <= node.x + node.half
         && wy >= cy - node.half     && wy <= cy + node.half) return node;
      }
    }
    return null;
  }

  function isBossNode(id: string): boolean {
    return id.startsWith('boss_');
  }

  function handleTap(sx: number, sy: number): void {
    const wp   = screenToWorld(sx, sy);
    const node = hitTest(wp.x, wp.y, _lastTMs);
    if (!node) { selectedId = null; return; }
    if (selectedId !== node.id) {
      selectedId = node.id;
      return;
    }

    if (isBossNode(node.id)) {
      const bossId = bossNodes.indexOf(node) + 1;
      if (isBossUnlocked(bossId, rpgSimState.highestWaveReached)) openBossModal(bossId);
      return;
    }

    if (HORIZON_SUBZONE_IDS.includes(node.id as HorizonSubzoneId)) {
      if (rpgSimState.activeZoneId !== 'horizon') {
        onZoneSelect('horizon');
      }
      onSubzoneSelect?.(node.id as HorizonSubzoneId);
      handle.close();
      return;
    }

    const zoneId = node.id as RpgZoneId;
    if (zoneId !== rpgSimState.activeZoneId) {
      onZoneSelect(zoneId);
    }
    handle.close();
  }

  function canvasXY(e: PointerEvent): { sx: number; sy: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      sx: (e.clientX - rect.left) * (canvas.width  / rect.width),
      sy: (e.clientY - rect.top)  * (canvas.height / rect.height),
    };
  }

  overlay.addEventListener('pointerdown', (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const { sx, sy } = canvasXY(e);
    ptrs.set(e.pointerId, { startX: sx, startY: sy, lastX: sx, lastY: sy });

    if (ptrs.size === 1) {
      isDragging   = false;
      const wp = screenToWorld(sx, sy);
      draggedNode = hitTest(wp.x, wp.y, _lastTMs);
      if (draggedNode) {
        dragNodeOffsetX = wp.x - draggedNode.x;
        dragNodeOffsetY = wp.y - draggedNode.y;
        draggedNode.vx = 0;
        draggedNode.vy = 0;
      }
      dragBaseCamX = camX;
      dragBaseCamY = camY;
      dragBaseMidX = sx;
      dragBaseMidY = sy;
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinchBaseDist = Math.hypot(a.lastX - b.lastX, a.lastY - b.lastY);
      pinchBaseZoom = camZoom;
      dragBaseMidX  = (a.lastX + b.lastX) / 2;
      dragBaseMidY  = (a.lastY + b.lastY) / 2;
      dragBaseCamX  = camX;
      dragBaseCamY  = camY;
      isDragging    = true;
      draggedNode   = null;
    }
  });

  overlay.addEventListener('pointermove', (e: PointerEvent) => {
    const ps = ptrs.get(e.pointerId);
    if (!ps) return;
    const { sx, sy } = canvasXY(e);
    ps.lastX = sx;
    ps.lastY = sy;

    if (ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const dist  = Math.hypot(a.lastX - b.lastX, a.lastY - b.lastY);
      const midX  = (a.lastX + b.lastX) / 2;
      const midY  = (a.lastY + b.lastY) / 2;
      camZoom     = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pinchBaseZoom * dist / pinchBaseDist));
      camX        = dragBaseCamX - (midX - dragBaseMidX) / camZoom;
      camY        = dragBaseCamY - (midY - dragBaseMidY) / camZoom;
      clampCam();
    } else if (ptrs.size === 1) {
      const dx = sx - ps.startX;
      const dy = sy - ps.startY;
      if (!isDragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) isDragging = true;
      if (isDragging) {
        if (draggedNode) {
          const wp = screenToWorld(sx, sy);
          draggedNode.x = wp.x - dragNodeOffsetX;
          draggedNode.y = wp.y - dragNodeOffsetY;
          draggedNode.vx = 0;
          draggedNode.vy = 0;
        } else {
          camX = dragBaseCamX - (sx - dragBaseMidX) / camZoom;
          camY = dragBaseCamY - (sy - dragBaseMidY) / camZoom;
          clampCam();
        }
      }
      // Hover
      const wp   = screenToWorld(sx, sy);
      const node = hitTest(wp.x, wp.y, _lastTMs);
      hoveredId  = node?.id ?? null;
      overlay.style.cursor = node ? 'pointer' : 'default';
    }
  });

  overlay.addEventListener('pointerup', (e: PointerEvent) => {
    const ps = ptrs.get(e.pointerId);
    if (!ps) return;
    const { sx, sy } = canvasXY(e);
    if (!isDragging && ptrs.size === 1) handleTap(sx, sy);
    ptrs.delete(e.pointerId);
    draggedNode = null;
    isDragging = false;
    if (ptrs.size === 1) {
      const rem    = [...ptrs.values()][0];
      dragBaseCamX = camX;
      dragBaseCamY = camY;
      dragBaseMidX = rem.lastX;
      dragBaseMidY = rem.lastY;
    }
  });

  overlay.addEventListener('pointercancel', (e: PointerEvent) => {
    ptrs.delete(e.pointerId);
    draggedNode = null;
    isDragging = false;
  });

  overlay.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    const factor   = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const newZoom  = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, camZoom * factor));
    const rect     = canvas.getBoundingClientRect();
    const mx       = (e.clientX - rect.left) * (canvas.width  / rect.width);
    const my       = (e.clientY - rect.top)  * (canvas.height / rect.height);
    // Keep world point under cursor stationary
    const wx       = (mx - canvas.width  / 2) / camZoom + camX;
    const wy       = (my - canvas.height / 2) / camZoom + camY;
    camX           = wx - (mx - canvas.width  / 2) / newZoom;
    camY           = wy - (my - canvas.height / 2) / newZoom;
    camZoom        = newZoom;
    clampCam();
  }, { passive: false });

  // ── Render ────────────────────────────────────────────────────────────────

  function syncCanvasSize(): void {
    const w = overlay.clientWidth;
    const h = overlay.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
    }
  }

  function drawFrame(tMs: number): void {
    updateNodePhysics(_lastTMs > 0 ? tMs - _lastTMs : 0);
    _lastTMs = tMs;
    syncCanvasSize();
    const W = canvas.width;
    const H = canvas.height;

    drawBackground(ctx, getCachedImage(BACKGROUND_PATH), W, H);

    // Screen-space title (drawn before world transform)
    ctx.font         = 'bold 13px monospace';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#fff172cc';
    ctx.fillText('⬡ Select Zone', EXIT_MARGIN, EXIT_MARGIN + EXIT_SIZE / 2);
    ctx.textBaseline = 'alphabetic';

    // World transform
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(camZoom, camZoom);
    ctx.translate(-camX, -camY);

    const activeZone    = rpgSimState.activeZoneId;
    const activeSub     = rpgSimState.activeSubzoneId;

    // Helper: current float-y for a node
    const fy = (n: MapNode): number => FLOAT_AMP * Math.sin(tMs * FLOAT_SPD + n.phase);

    // ── Connections ──────────────────────────────────────────────────────────

    for (const connection of connections) {
      drawParticleConn(ctx,
        connection,
        connection.a.y + fy(connection.a),
        connection.b.y + fy(connection.b),
        tMs,
        glowSprites);
    }
    const bossCount = visibleBossCount();
    if (bossCount >= 2) {
      for (let i = 0; i < bossCount - 1; i++) {
        const connection = bossConnections[i];
        drawParticleConn(ctx,
          connection,
          connection.a.y + fy(connection.a),
          connection.b.y + fy(connection.b),
          tMs,
          glowSprites);
      }
    }

    // ── Zone nodes ───────────────────────────────────────────────────────────

    for (const node of zoneNodes) {
      const isActive  = node.id === activeZone;
      const isHov     = node.id === hoveredId;
      const isSelected = node.id === selectedId;
      ctx.save();
      if (isSelected || (isHov && !isActive)) {
        ctx.translate(node.x, node.y + fy(node));
        ctx.scale(isSelected ? SELECTED_SCALE : 1.07, isSelected ? SELECTED_SCALE : 1.07);
        ctx.translate(-node.x, -(node.y + fy(node)));
      }
      drawSquareNode(ctx, node, node.y + fy(node), isActive, isHov);
      ctx.restore();
    }

    // ── Horizon triad nodes ───────────────────────────────────────────────────

    for (const node of horizonNodes) {
      const isActive  = activeZone === 'horizon' && node.id === (activeSub as string);
      const isHov     = node.id === hoveredId;
      const isSelected = node.id === selectedId;
      ctx.save();
      if (isSelected || (isHov && !isActive)) {
        ctx.translate(node.x, node.y + fy(node));
        ctx.scale(isSelected ? SELECTED_SCALE : 1.07, isSelected ? SELECTED_SCALE : 1.07);
        ctx.translate(-node.x, -(node.y + fy(node)));
      }
      drawCircleNode(ctx, node, node.y + fy(node), isActive, isHov);
      ctx.restore();
    }

    // ── Boss nodes ────────────────────────────────────────────────────────────

    for (let i = 0; i < bossCount; i++) {
      const node = bossNodes[i];
      const isUnlocked = isBossUnlocked(i + 1, rpgSimState.highestWaveReached);
      const isHov = node.id === hoveredId;
      const isSelected = node.id === selectedId;
      ctx.save();
      if (isSelected || isHov) {
        ctx.translate(node.x, node.y + fy(node));
        ctx.scale(isSelected ? SELECTED_SCALE : 1.07, isSelected ? SELECTED_SCALE : 1.07);
        ctx.translate(-node.x, -(node.y + fy(node)));
      }
      if (isUnlocked) drawSquareNode(ctx, node, node.y + fy(node), false, isHov);
      else drawLockedBossNode(ctx, node, node.y + fy(node), isHov);
      ctx.restore();
    }

    ctx.restore(); // end world transform
  }

  function loop(tMs: number): void {
    if (!_isOpen) return;
    drawFrame(tMs);
    _rafId = requestAnimationFrame(loop);
  }

  // ── Public handle ─────────────────────────────────────────────────────────

  const handle: RpgZoneSelectPanel = {
    element: overlay,

    open(): void {
      overlay.style.display = 'block';
      _isOpen   = true;
      hoveredId = null;
      selectedId = null;
      draggedNode = null;
      ptrs.clear();
      isDragging = false;
      closeBossModal();
      syncCanvasSize();
      resetCamera();
      cancelAnimationFrame(_rafId);
      _rafId = requestAnimationFrame(loop);
    },

    close(): void {
      overlay.style.display = 'none';
      _isOpen = false;
      cancelAnimationFrame(_rafId);
    },

    get isOpen(): boolean {
      return _isOpen;
    },
  };

  return handle;
}
