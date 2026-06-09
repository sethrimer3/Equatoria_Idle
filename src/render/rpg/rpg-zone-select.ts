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
import { loadImage, getCachedImage } from '../assets/asset-loader';

export type { HorizonSubzoneId };

// ─── Constants ─────────────────────────────────────────────────────────────

const NODE_SIZE         = 80;    // zone node square side (world px)
const BOSS_NODE_SIZE    = 60;    // boss node square side
const HORIZON_R         = 44;    // horizon subnode circle radius
const HORIZON_TRIAD_R   = 90;    // radius of the invisible triad circle
const FLOAT_AMP         = 5;     // float oscillation amplitude (world px)
const FLOAT_SPD         = 0.0008;// radians per ms
const PARTICLES_PER_CONN = 8;
const PARTICLE_RADIUS   = 2.5;
const ZOOM_MIN          = 0.28;
const ZOOM_MAX          = 2.6;
const CORNER_R          = 12;    // rounded-rect corner radius
const EXIT_SIZE         = 46;    // exit button CSS px
const EXIT_MARGIN       = 12;
const DRAG_THRESHOLD    = 5;     // px before a tap becomes a drag

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
    const t = i / (BOSS_IDS.length - 1);
    return {
      x: 730 + 52 * Math.sin(t * Math.PI * 2.2),
      y: 80 + t * 560,
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

function drawParticleConn(
  ctx: CanvasRenderingContext2D,
  ax: number, ay: number,
  bx: number, by: number,
  tMs: number,
  connIdx: number,
  hexColor: string,
): void {
  const dx  = bx - ax;
  const dy  = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 2) return;
  const nx = -dy / len;
  const ny =  dx / len;

  // Subtle guide line
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.strokeStyle = hexColor + '20';
  ctx.lineWidth   = 0.8;
  ctx.stroke();

  // Particles
  for (let p = 0; p < PARTICLES_PER_CONN; p++) {
    const phase = (p / PARTICLES_PER_CONN) + connIdx * 0.19;
    const t     = ((tMs * 0.00028 + phase) % 1 + 1) % 1;
    const px    = ax + dx * t;
    const py    = ay + dy * t;
    const wiggle = 5 * Math.sin(tMs * 0.0011 + p * 2.3 + connIdx * 3.1) * Math.sin(t * Math.PI);
    const alpha = 0.25 + 0.55 * Math.sin(t * Math.PI);
    const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, '0');
    ctx.beginPath();
    ctx.arc(px + nx * wiggle, py + ny * wiggle, PARTICLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = hexColor + alphaHex;
    ctx.fill();
  }
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
  }));

  // Kick off icon preloads (fire-and-forget; getCachedImage used during draw)
  for (const node of [...zoneNodes, ...horizonNodes, ...bossNodes]) {
    loadImage(node.iconPath).catch(() => {
      // eslint-disable-next-line no-console
      console.warn(`[ZoneSelect] missing icon: ${node.iconPath}`);
    });
  }

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

  function allNodes(): MapNode[] {
    return [...zoneNodes, ...horizonNodes, ...bossNodes];
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
    if (!node) return;

    if (isBossNode(node.id)) return; // placeholder — no behavior yet

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
        camX = dragBaseCamX - (sx - dragBaseMidX) / camZoom;
        camY = dragBaseCamY - (sy - dragBaseMidY) / camZoom;
        clampCam();
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
    _lastTMs = tMs;
    syncCanvasSize();
    const W = canvas.width;
    const H = canvas.height;

    // Background
    ctx.fillStyle = 'rgba(4,4,12,0.93)';
    ctx.fillRect(0, 0, W, H);

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

    // Zone chain: euhedral→impetus→caustics→verdure
    for (let i = 0; i < zoneNodes.length - 1; i++) {
      const a = zoneNodes[i], b = zoneNodes[i + 1];
      drawParticleConn(ctx,
        a.x, a.y + fy(a),
        b.x, b.y + fy(b),
        tMs, i, '#4466cc');
    }

    // Verdure → each horizon subnode
    const verdure = zoneNodes.find(n => n.id === 'verdure')!;
    for (let i = 0; i < horizonNodes.length; i++) {
      const hn = horizonNodes[i];
      drawParticleConn(ctx,
        verdure.x, verdure.y + fy(verdure),
        hn.x, hn.y + fy(hn),
        tMs, 10 + i, '#7755cc');
    }

    // Horizon subnode ring connections
    for (let i = 0; i < horizonNodes.length; i++) {
      const a = horizonNodes[i];
      const b = horizonNodes[(i + 1) % horizonNodes.length];
      drawParticleConn(ctx,
        a.x, a.y + fy(a),
        b.x, b.y + fy(b),
        tMs, 20 + i, '#9966dd');
    }

    // Boss S-curve connections
    for (let i = 0; i < bossNodes.length - 1; i++) {
      const a = bossNodes[i], b = bossNodes[i + 1];
      drawParticleConn(ctx,
        a.x, a.y + fy(a),
        b.x, b.y + fy(b),
        tMs, 30 + i, '#cc6644');
    }

    // ── Zone nodes ───────────────────────────────────────────────────────────

    for (const node of zoneNodes) {
      const isActive  = node.id === activeZone;
      const isHov     = node.id === hoveredId;
      ctx.save();
      if (isHov && !isActive) {
        ctx.translate(node.x, node.y + fy(node));
        ctx.scale(1.07, 1.07);
        ctx.translate(-node.x, -(node.y + fy(node)));
      }
      drawSquareNode(ctx, node, node.y + fy(node), isActive, isHov);
      ctx.restore();
    }

    // ── Horizon triad nodes ───────────────────────────────────────────────────

    for (const node of horizonNodes) {
      const isActive  = activeZone === 'horizon' && node.id === (activeSub as string);
      const isHov     = node.id === hoveredId;
      ctx.save();
      if (isHov && !isActive) {
        ctx.translate(node.x, node.y + fy(node));
        ctx.scale(1.07, 1.07);
        ctx.translate(-node.x, -(node.y + fy(node)));
      }
      drawCircleNode(ctx, node, node.y + fy(node), isActive, isHov);
      ctx.restore();
    }

    // ── Boss nodes ────────────────────────────────────────────────────────────

    for (const node of bossNodes) {
      const isHov = node.id === hoveredId;
      ctx.save();
      if (isHov) {
        ctx.translate(node.x, node.y + fy(node));
        ctx.scale(1.07, 1.07);
        ctx.translate(-node.x, -(node.y + fy(node)));
      }
      drawSquareNode(ctx, node, node.y + fy(node), false, isHov);
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
      ptrs.clear();
      isDragging = false;
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
