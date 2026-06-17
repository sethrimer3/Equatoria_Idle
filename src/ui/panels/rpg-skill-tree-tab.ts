/**
 * rpg-skill-tree-tab.ts — Skill Tree sub-tab for the RPG overlay panel.
 *
 * Renders a pannable/zoomable canvas-based skill tree that mirrors the
 * visual language of rpg-zone-select.ts (dark cosmic background, floating
 * nodes, connection motes, ambient particles).
 *
 * Tree layout is data-driven via SKILL_TREE_NODES.  Adding a future node
 * only requires adding an entry there — no other file needs to change.
 */

import { RPG_UPGRADE_BY_ID } from '../../data/rpg/rpg-upgrade-definitions';
import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getRpgUpgradeLevel } from '../../sim/rpg/rpg-state';
import type { ResourceState } from '../../sim/resources';
import { getMotes } from '../../sim/resources';
import type { ActionHandler } from '../../input';
import { formatNumberAs } from '../../util';
import type { NumberFormat } from '../../util';
import { getCachedImage, loadImage } from '../../render/assets/asset-loader';

// ─── Constants ────────────────────────────────────────────────────────────

const BACKGROUND_PATH = 'ASSETS/ANIMATIONS/rpgBackground/rpgBackground_animation.webp';

const FLOAT_AMP    = 4;
const FLOAT_SPD    = 0.0007;
const ZOOM_MIN     = 0.30;
const ZOOM_MAX     = 2.2;
const DRAG_THRESHOLD = 5;
const SELECTED_SCALE = 1.18;

// ── Branch colours ──────────────────────────────────────────────────────
const BRANCH_COLOR: Record<string, string> = {
  movement:  '#40d4e0',
  defense:   '#e08840',
  weapons:   '#b064ff',
  resources: '#60d870',
  root:      '#ffd060',
};

// ── Node radii (world pixels) ───────────────────────────────────────────
const RADIUS_ROOT       = 46;
const RADIUS_UNLOCK     = 34;
const RADIUS_REPEATABLE = 25;

const MOTES_PER_CONN  = 4;
const MOTE_SPEED_MIN  = 0.00005;
const MOTE_SPEED_MAX  = 0.000085;
const MOTE_RADIUS_MIN = 1.15;
const MOTE_RADIUS_MAX = 2.0;
const MOTE_WOBBLE_MIN = 1.5;
const MOTE_WOBBLE_MAX = 4.0;
const MOTE_TRAIL_STEPS = 3;
const MOTE_TRAIL_GAP_MS = 42;
const MOTE_GLOW_ALPHA = 0.58;
const GOLD_PALETTE = ['#fff4a8', '#ffd866', '#f2b84b', '#cfae52'] as const;

const AMBIENT_PARTICLE_COUNT = 120;
const AMBIENT_TRAIL_CAP = 8;
const AMBIENT_TRAIL_SAMPLE_MS = 28;
const AMBIENT_COLORS = [
  '#fff4a8', '#ffd866', '#c4b5fd', '#a78bfa',
  '#86efac', '#4fdfff', '#93c5fd', '#fca5a5',
] as const;

const PAN_MIN_X = -620;
const PAN_MAX_X = 620;
const PAN_MIN_Y = -520;
const PAN_MAX_Y = 520;

// ─── Skill tree data definitions ──────────────────────────────────────────

interface SkillTreeNodeDef {
  upgradeId: string | null;
  x: number;
  y: number;
  icon: string;
  /** null = requires root; string = upgradeId of required parent */
  prerequisiteId: string | null;
  branch: 'movement' | 'defense' | 'weapons' | 'resources' | 'root';
  /** root = gold large medallion; unlock = one-time medallion; repeatable = smaller circle */
  nodeType: 'root' | 'unlock' | 'repeatable';
}

// All positions are world-space, centred on the root at (0,0).
const SKILL_TREE_NODES: SkillTreeNodeDef[] = [
  // ── Root ─────────────────────────────────────────────────────────────
  { upgradeId: null,              x:    0, y:    0, icon: '✦', prerequisiteId: null,              branch: 'root',      nodeType: 'root'       },
  // ── Movement branch ──────────────────────────────────────────────────
  { upgradeId: 'speed',           x: -320, y:  -80, icon: '▲', prerequisiteId: null,              branch: 'movement',  nodeType: 'repeatable' },
  { upgradeId: 'dash',            x: -480, y: -220, icon: '⚡', prerequisiteId: 'speed',           branch: 'movement',  nodeType: 'unlock'     },
  { upgradeId: 'evasion',         x: -320, y: -260, icon: '◌', prerequisiteId: 'speed',           branch: 'movement',  nodeType: 'repeatable' },
  // ── Defense branch ───────────────────────────────────────────────────
  { upgradeId: 'block_chance',    x:  200, y: -220, icon: '▣', prerequisiteId: null,              branch: 'defense',   nodeType: 'repeatable' },
  { upgradeId: 'block_strength',  x:  340, y: -360, icon: '⊞', prerequisiteId: 'block_chance',    branch: 'defense',   nodeType: 'repeatable' },
  { upgradeId: 'second_wind',     x:  140, y: -390, icon: '♥', prerequisiteId: 'block_chance',    branch: 'defense',   nodeType: 'unlock'     },
  // ── Weapons branch ───────────────────────────────────────────────────
  { upgradeId: 'orbit_projectile',x:  220, y:   80, icon: '◎', prerequisiteId: null,              branch: 'weapons',   nodeType: 'unlock'     },
  { upgradeId: 'orbit_count',     x:  380, y:  180, icon: '⊕', prerequisiteId: 'orbit_projectile',branch: 'weapons',   nodeType: 'repeatable' },
  { upgradeId: 'orbit_detonation',x:  380, y:   60, icon: '✸', prerequisiteId: 'orbit_count',     branch: 'weapons',   nodeType: 'repeatable' },
  { upgradeId: 'extra_weapon_slot',x:  80, y:  220, icon: '⚔', prerequisiteId: null,              branch: 'weapons',   nodeType: 'repeatable' },
  { upgradeId: 'weapon_mastery',  x:  240, y:  300, icon: '◆', prerequisiteId: 'extra_weapon_slot',branch: 'weapons',  nodeType: 'repeatable' },
  { upgradeId: 'dominance_amp',   x:  400, y:  350, icon: '★', prerequisiteId: 'weapon_mastery',  branch: 'weapons',   nodeType: 'repeatable' },
  // ── Resources branch ─────────────────────────────────────────────────
  { upgradeId: 'mote_magnetism',  x: -240, y:  240, icon: '◉', prerequisiteId: null,              branch: 'resources', nodeType: 'repeatable' },
  { upgradeId: 'xp_gain',        x: -380, y:  160, icon: '⬆', prerequisiteId: 'mote_magnetism',  branch: 'resources', nodeType: 'repeatable' },
];

// ─── Internal types ───────────────────────────────────────────────────────

interface SkillNode {
  def: SkillTreeNodeDef;
  x: number;
  y: number;
  nodeRadius: number;
  phase: number;
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

interface SkillConnection {
  a: SkillNode;
  b: SkillNode;
  motes: ConnectionMote[];
  curveOffset: number;
}

interface AmbientParticle {
  x: number; y: number; vx: number; vy: number;
  radius: number; alpha: number;
  colorR: number; colorG: number; colorB: number;
  color: string;
  trailX: Float32Array; trailY: Float32Array;
  trailHead: number; trailCount: number; trailSampleMs: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function seededUnit(seed: number): number {
  const x = Math.sin(seed * 91.731 + 17.17) * 43758.5453;
  return x - Math.floor(x);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function getNodeRadius(def: SkillTreeNodeDef): number {
  if (def.nodeType === 'root')      return RADIUS_ROOT;
  if (def.nodeType === 'unlock')    return RADIUS_UNLOCK;
  return RADIUS_REPEATABLE;
}

function getBranchColor(branch: string): string {
  return BRANCH_COLOR[branch] ?? '#888888';
}

function makeGlowSprite(size: number, color: string): HTMLCanvasElement {
  const sprite = document.createElement('canvas');
  sprite.width = size; sprite.height = size;
  const sc = sprite.getContext('2d')!;
  const ctr = size / 2;
  const grad = sc.createRadialGradient(ctr, ctr, 0, ctr, ctr, ctr);
  grad.addColorStop(0, color + 'e8');
  grad.addColorStop(0.3, color + '70');
  grad.addColorStop(1, color + '00');
  sc.fillStyle = grad;
  sc.fillRect(0, 0, size, size);
  return sprite;
}

function makeMotes(index: number): ConnectionMote[] {
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
  return motes;
}

function sampleConn(
  ax: number, ay: number, bx: number, by: number, curveOffset: number,
  t: number, wobble: number,
): { x: number; y: number } {
  const dx = bx - ax; const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len; const ny = dx / len;
  const cx = (ax + bx) * 0.5 + nx * curveOffset;
  const cy = (ay + by) * 0.5 + ny * curveOffset;
  const inv = 1 - t;
  return {
    x: inv * inv * ax + 2 * inv * t * cx + t * t * bx + nx * wobble,
    y: inv * inv * ay + 2 * inv * t * cy + t * t * by + ny * wobble,
  };
}

function drawConnection(
  ctx: CanvasRenderingContext2D,
  conn: SkillConnection,
  ay: number, by: number,
  tMs: number,
  glowSprites: readonly HTMLCanvasElement[],
  alpha: number,
): void {
  ctx.globalAlpha = alpha;

  // Subtle guide line
  const lineColor = '#4466cc20';
  ctx.beginPath();
  const start = sampleConn(conn.a.x, ay, conn.b.x, by, conn.curveOffset, 0, 0);
  ctx.moveTo(start.x, start.y);
  for (let i = 1; i <= 8; i++) {
    const pt = sampleConn(conn.a.x, ay, conn.b.x, by, conn.curveOffset, i / 8, 0);
    ctx.lineTo(pt.x, pt.y);
  }
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 0.9;
  ctx.stroke();

  for (const mote of conn.motes) {
    const cycle = (tMs * mote.speed + mote.phase) % 1;
    const t = 1 - Math.abs(cycle * 2 - 1);
    const wobble = mote.wobble * Math.sin(tMs * 0.0013 + mote.wobblePhase) * Math.sin(t * Math.PI);
    const pt = sampleConn(conn.a.x, ay, conn.b.x, by, conn.curveOffset, t, wobble);

    for (let trail = MOTE_TRAIL_STEPS; trail >= 1; trail--) {
      const tc = ((tMs - trail * MOTE_TRAIL_GAP_MS) * mote.speed + mote.phase + 1) % 1;
      const tt = 1 - Math.abs(tc * 2 - 1);
      const tw = mote.wobble * Math.sin((tMs - trail * MOTE_TRAIL_GAP_MS) * 0.0013 + mote.wobblePhase) * Math.sin(tt * Math.PI);
      const tp = sampleConn(conn.a.x, ay, conn.b.x, by, conn.curveOffset, tt, tw);
      ctx.beginPath();
      ctx.moveTo(tp.x, tp.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.strokeStyle = mote.color;
      ctx.globalAlpha = alpha * 0.07 * (MOTE_TRAIL_STEPS - trail + 1);
      ctx.lineWidth = mote.radius * 0.55;
      ctx.stroke();
    }

    const glow = glowSprites[mote.glowIndex];
    const gs = glow.width * 0.5;
    ctx.globalAlpha = alpha * MOTE_GLOW_ALPHA;
    ctx.drawImage(glow, pt.x - gs / 2, pt.y - gs / 2, gs, gs);
    ctx.globalAlpha = alpha * 0.88;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, mote.radius, 0, Math.PI * 2);
    ctx.fillStyle = mote.color;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

type NodeStatus = 'purchased' | 'available' | 'locked';

function getNodeStatus(
  def: SkillTreeNodeDef,
  rpgState: RpgSimState,
  isDevMode: boolean,
): NodeStatus {
  if (def.upgradeId === null) return 'purchased'; // root always purchased
  const level = getRpgUpgradeLevel(rpgState, def.upgradeId);
  const upgradeDef = RPG_UPGRADE_BY_ID.get(def.upgradeId);
  const isMaxed = upgradeDef ? level >= upgradeDef.maxLevel : false;

  // Root-level nodes: always available (prerequisite = root = always purchased)
  if (def.prerequisiteId === null) {
    if (level > 0 || isMaxed) return 'purchased';
    return isDevMode ? 'available' : 'available';
  }

  // Nodes with a specific upgrade prerequisite
  const prereqLevel = getRpgUpgradeLevel(rpgState, def.prerequisiteId);
  if (prereqLevel < 1 && !isDevMode) return 'locked';
  if (level > 0 || isMaxed) return 'purchased';
  return 'available';
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  node: SkillNode,
  cy: number,
  status: NodeStatus,
  _isHovered: boolean,
  _isSelected: boolean,
  rpgState: RpgSimState,
  tMs: number,
): void {
  const r = node.nodeRadius;
  const x = node.x;
  const branch = node.def.branch;
  const branchCol = getBranchColor(branch);
  const isRoot = node.def.nodeType === 'root';
  const isMedallion = node.def.nodeType !== 'repeatable';
  const pulse = (Math.sin(tMs * 0.0018) + 1) * 0.5;

  // ── Outer glow / pulse ──────────────────────────────────────────────
  if (status !== 'locked') {
    ctx.save();
    const glowStr = status === 'purchased'
      ? (isRoot ? 28 : isMedallion ? 20 : 14)
      : (isRoot ? 20 : isMedallion ? 14 : 10) * (0.6 + pulse * 0.4);
    ctx.shadowColor = branchCol;
    ctx.shadowBlur  = glowStr;
    ctx.beginPath();
    ctx.arc(x, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = branchCol;
    ctx.lineWidth   = status === 'purchased' ? (isMedallion ? 2.8 : 2.2) : (isMedallion ? 1.6 : 1.2);
    ctx.globalAlpha = status === 'available' ? (0.6 + pulse * 0.4) : 1;
    ctx.stroke();
    ctx.restore();
  }

  // ── Background fill ─────────────────────────────────────────────────
  ctx.beginPath();
  ctx.arc(x, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = status === 'locked' ? 'rgba(5,5,12,0.90)' : 'rgba(8,6,20,0.95)';
  ctx.fill();

  // ── Border ring ─────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.arc(x, cy, r, 0, Math.PI * 2);
  if (status === 'locked') {
    ctx.strokeStyle = '#1e1e30';
    ctx.lineWidth   = 1.2;
  } else {
    ctx.strokeStyle = branchCol;
    ctx.lineWidth   = status === 'purchased' ? (isMedallion ? 2.6 : 2.0) : (isMedallion ? 1.4 : 1.0);
    ctx.globalAlpha = status === 'available' ? (0.65 + pulse * 0.35) : 1;
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // ── Inner accent ring (medallions only) ─────────────────────────────
  if (isMedallion && status !== 'locked') {
    ctx.beginPath();
    ctx.arc(x, cy, r - 7, 0, Math.PI * 2);
    ctx.strokeStyle = branchCol + (status === 'purchased' ? '55' : '30');
    ctx.lineWidth   = 1;
    ctx.stroke();
  }

  // ── Rank progress arc (repeatable nodes) ────────────────────────────
  if (!isMedallion && node.def.upgradeId) {
    const upgDef = RPG_UPGRADE_BY_ID.get(node.def.upgradeId);
    if (upgDef && upgDef.maxLevel > 1) {
      const rank = rpgState.rpgUpgradeLevels?.get(node.def.upgradeId) ?? 0;
      if (rank > 0) {
        const frac = rank / upgDef.maxLevel;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, cy, r + 5, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        ctx.strokeStyle = branchCol;
        ctx.lineWidth   = 3.5;
        ctx.globalAlpha = 0.85;
        ctx.lineCap     = 'round';
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // ── Icon ────────────────────────────────────────────────────────────
  ctx.save();
  ctx.globalAlpha = status === 'locked' ? 0.20 : 1;
  ctx.font        = `${isRoot ? 24 : isMedallion ? 17 : 13}px sans-serif`;
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = status === 'locked' ? '#333355' : branchCol;
  ctx.fillText(node.def.icon, x, cy);
  ctx.restore();

  // ── Label below ─────────────────────────────────────────────────────
  const upgDef = node.def.upgradeId ? RPG_UPGRADE_BY_ID.get(node.def.upgradeId) : null;
  const label  = upgDef ? upgDef.name : 'Awakening';
  ctx.save();
  ctx.font         = 'bold 8px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.globalAlpha  = status === 'locked' ? 0.28 : 0.88;
  ctx.fillStyle    = status === 'locked' ? '#33335a' : branchCol;
  ctx.fillText(label, x, cy + r + 5);
  ctx.restore();

  // ── Rank badge (purchased repeatable) ───────────────────────────────
  if (status === 'purchased' && upgDef && upgDef.maxLevel > 1) {
    const rank = getRpgUpgradeLevel(rpgState, upgDef.id);
    ctx.save();
    ctx.font         = 'bold 7px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle    = branchCol;
    ctx.globalAlpha  = 0.9;
    ctx.fillText(`${rank}/${upgDef.maxLevel}`, x, cy - r - 3);
    ctx.restore();
  }
}

// ─── Public interface ─────────────────────────────────────────────────────

export interface RpgSkillTreeTabPane {
  element: HTMLElement;
  update(rpgState: RpgSimState, resources: ResourceState, numberFormat: NumberFormat, isDevMode: boolean): void;
  startLoop(): void;
  stopLoop(): void;
}

// ─── Factory ─────────────────────────────────────────────────────────────

export function createRpgSkillTreeTabPane(dispatch: ActionHandler): RpgSkillTreeTabPane {
  // Outer container fills the rpg-menu__content area
  const element = document.createElement('div');
  element.className = 'skill-tree-pane';

  // ── Skill point header bar ────────────────────────────────────────────
  const headerBar = document.createElement('div');
  headerBar.className = 'skill-tree__header';
  const spLabel = document.createElement('span');
  spLabel.className = 'skill-tree__sp-label';
  spLabel.textContent = '✦ 0 skill points available';
  headerBar.appendChild(spLabel);
  element.appendChild(headerBar);

  // ── Canvas area ───────────────────────────────────────────────────────
  const canvasArea = document.createElement('div');
  canvasArea.className = 'skill-tree__canvas-area';
  element.appendChild(canvasArea);

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;';
  canvas.setAttribute('aria-label', 'Skill tree');
  canvasArea.appendChild(canvas);
  const ctx2d = canvas.getContext('2d')!;

  // ── Detail panel (DOM overlay) ────────────────────────────────────────
  const detailPanel = document.createElement('div');
  detailPanel.className = 'skill-tree__detail';
  detailPanel.style.display = 'none';
  canvasArea.appendChild(detailPanel);

  // ── State ─────────────────────────────────────────────────────────────
  let _rpgState: RpgSimState | null = null;
  let _resources: ResourceState | null = null;
  let _format: NumberFormat = 'letters';
  let _isDevMode = false;
  let _rafId = 0;
  let _isLooping = false;
  let _lastTMs = 0;

  // Camera
  let camX = 420;
  let camY = 220;
  let camZoom = 1;

  function clampCam(): void {
    camX = Math.max(PAN_MIN_X, Math.min(PAN_MAX_X, camX));
    camY = Math.max(PAN_MIN_Y, Math.min(PAN_MAX_Y, camY));
  }

  function resetCamera(): void {
    const w = canvas.width  || canvasArea.clientWidth  || 400;
    const h = canvas.height || canvasArea.clientHeight || 300;
    camX = 0;
    camY = 0;
    camZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(w / 620, h / 440)));
  }

  function screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - canvas.width  / 2) / camZoom + camX,
      y: (sy - canvas.height / 2) / camZoom + camY,
    };
  }

  // ── Build nodes and connections ───────────────────────────────────────
  const nodes: SkillNode[] = SKILL_TREE_NODES.map((def, i) => ({
    def,
    x: def.x,
    y: def.y,
    nodeRadius: getNodeRadius(def),
    phase: i * 1.17 + 0.3,
  }));

  const rootNode = nodes[0];

  function getNodeById(upgradeId: string | null): SkillNode | undefined {
    return nodes.find(n => n.def.upgradeId === upgradeId);
  }

  const connections: SkillConnection[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i];
    const parentId = node.def.prerequisiteId;
    const parent = parentId !== null ? getNodeById(parentId) : rootNode;
    if (!parent) continue;
    const index = connections.length;
    const curveOffset = (index % 2 === 0 ? 1 : -1) * 20;
    connections.push({ a: parent, b: node, motes: makeMotes(index), curveOffset });
  }

  // Glow sprites (reusable offscreen canvases)
  const glowSprites = [
    makeGlowSprite(14, '#fff4a8'),
    makeGlowSprite(20, '#ffd866'),
    makeGlowSprite(28, '#e2a83e'),
  ] as const;

  // ── Ambient particles ─────────────────────────────────────────────────
  const ambientParticles: AmbientParticle[] = Array.from({ length: AMBIENT_PARTICLE_COUNT }, (_, i) => {
    const hexColor = AMBIENT_COLORS[Math.floor(seededUnit(i + 1501) * AMBIENT_COLORS.length)];
    const rgb = hexToRgb(hexColor);
    return {
      x: (seededUnit(i + 301) - 0.5) * 1200,
      y: (seededUnit(i + 503) - 0.5) * 1000,
      vx: (seededUnit(i + 701) - 0.5) * 0.018,
      vy: (seededUnit(i + 907) - 0.5) * 0.018,
      radius: 0.7 + seededUnit(i + 1103) * 1.8,
      alpha: 0.16 + seededUnit(i + 1301) * 0.42,
      colorR: rgb.r, colorG: rgb.g, colorB: rgb.b,
      color: hexColor,
      trailX: new Float32Array(AMBIENT_TRAIL_CAP),
      trailY: new Float32Array(AMBIENT_TRAIL_CAP),
      trailHead: 0, trailCount: 0,
      trailSampleMs: seededUnit(i + 1701) * AMBIENT_TRAIL_SAMPLE_MS,
    };
  });

  function updateAmbientParticles(dt: number): void {
    for (const p of ambientParticles) {
      p.trailSampleMs += dt;
      if (p.trailSampleMs >= AMBIENT_TRAIL_SAMPLE_MS) {
        p.trailSampleMs %= AMBIENT_TRAIL_SAMPLE_MS;
        p.trailX[p.trailHead] = p.x;
        p.trailY[p.trailHead] = p.y;
        p.trailHead = (p.trailHead + 1) % AMBIENT_TRAIL_CAP;
        if (p.trailCount < AMBIENT_TRAIL_CAP) p.trailCount++;
      }
      p.vx *= 0.987; p.vy *= 0.987;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x < -700) { p.x = 700; p.trailCount = 0; }
      else if (p.x > 700) { p.x = -700; p.trailCount = 0; }
      if (p.y < -600) { p.y = 600; p.trailCount = 0; }
      else if (p.y > 600) { p.y = -600; p.trailCount = 0; }
    }
  }

  function drawAmbientParticles(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of ambientParticles) {
      for (let i = 1; i < p.trailCount; i++) {
        const prev = (p.trailHead - p.trailCount + i - 1 + AMBIENT_TRAIL_CAP) % AMBIENT_TRAIL_CAP;
        const cur  = (p.trailHead - p.trailCount + i     + AMBIENT_TRAIL_CAP) % AMBIENT_TRAIL_CAP;
        const t = i / p.trailCount;
        ctx.globalAlpha = p.alpha * t * 0.35;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.4, p.radius * t);
        ctx.beginPath();
        ctx.moveTo(p.trailX[prev], p.trailY[prev]);
        ctx.lineTo(p.trailX[cur],  p.trailY[cur]);
        ctx.stroke();
      }
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ── Interaction ───────────────────────────────────────────────────────
  interface PtrState { startX: number; startY: number; lastX: number; lastY: number }
  const ptrs = new Map<number, PtrState>();
  let isDragging = false;
  let dragBaseCamX = 0; let dragBaseCamY = 0;
  let dragBaseMidX = 0; let dragBaseMidY = 0;
  let pinchBaseDist = 0; let pinchBaseZoom = 1;
  let hoveredIdx: number = -1;
  let selectedIdx: number = -1;

  function hitTest(wx: number, wy: number, tMs: number): number {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const fy = FLOAT_AMP * Math.sin(tMs * FLOAT_SPD + node.phase);
      const cy = node.y + fy;
      const dx = wx - node.x;
      const dy = wy - cy;
      if (dx * dx + dy * dy <= node.nodeRadius * node.nodeRadius) return i;
    }
    return -1;
  }

  function canvasXY(e: PointerEvent): { sx: number; sy: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      sx: (e.clientX - rect.left) * (canvas.width  / rect.width),
      sy: (e.clientY - rect.top)  * (canvas.height / rect.height),
    };
  }

  function handleTap(sx: number, sy: number): void {
    const wp = screenToWorld(sx, sy);
    const idx = hitTest(wp.x, wp.y, _lastTMs);
    if (idx < 0) {
      selectedIdx = -1;
      closeDetailPanel();
      return;
    }
    if (selectedIdx !== idx) {
      selectedIdx = idx;
      closeDetailPanel();
      return;
    }
    // Second tap on same node → open detail panel
    openDetailPanel(idx);
  }

  canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault();
    const { sx, sy } = canvasXY(e);
    ptrs.set(e.pointerId, { startX: sx, startY: sy, lastX: sx, lastY: sy });
    if (ptrs.size === 1) {
      isDragging = false;
      dragBaseCamX = camX; dragBaseCamY = camY;
      dragBaseMidX = sx; dragBaseMidY = sy;
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinchBaseDist = Math.hypot(a.lastX - b.lastX, a.lastY - b.lastY);
      pinchBaseZoom = camZoom;
      dragBaseMidX  = (a.lastX + b.lastX) / 2;
      dragBaseMidY  = (a.lastY + b.lastY) / 2;
      dragBaseCamX  = camX; dragBaseCamY = camY;
      isDragging    = true;
    }
  });

  canvas.addEventListener('pointermove', (e: PointerEvent) => {
    const { sx, sy } = canvasXY(e);
    const ps = ptrs.get(e.pointerId);
    if (!ps) {
      const wp = screenToWorld(sx, sy);
      hoveredIdx = hitTest(wp.x, wp.y, _lastTMs);
      canvas.style.cursor = hoveredIdx >= 0 ? 'pointer' : 'default';
      return;
    }
    ps.lastX = sx; ps.lastY = sy;

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
      const dx = sx - ps.startX; const dy = sy - ps.startY;
      if (!isDragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) isDragging = true;
      if (isDragging) {
        camX = dragBaseCamX - (sx - dragBaseMidX) / camZoom;
        camY = dragBaseCamY - (sy - dragBaseMidY) / camZoom;
        clampCam();
      }
      const wp = screenToWorld(sx, sy);
      hoveredIdx = hitTest(wp.x, wp.y, _lastTMs);
      canvas.style.cursor = hoveredIdx >= 0 ? 'pointer' : 'default';
    }
  });

  canvas.addEventListener('pointerup', (e: PointerEvent) => {
    const ps = ptrs.get(e.pointerId);
    if (!ps) return;
    const { sx, sy } = canvasXY(e);
    if (!isDragging && ptrs.size === 1) handleTap(sx, sy);
    ptrs.delete(e.pointerId);
    isDragging = false;
    if (ptrs.size === 1) {
      const rem = [...ptrs.values()][0];
      dragBaseCamX = camX; dragBaseCamY = camY;
      dragBaseMidX = rem.lastX; dragBaseMidY = rem.lastY;
    }
  });

  canvas.addEventListener('pointercancel', (e: PointerEvent) => {
    ptrs.delete(e.pointerId);
    isDragging = false;
  });

  canvas.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    const factor  = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, camZoom * factor));
    const rect    = canvas.getBoundingClientRect();
    const mx      = (e.clientX - rect.left) * (canvas.width  / rect.width);
    const my      = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const wx      = (mx - canvas.width  / 2) / camZoom + camX;
    const wy      = (my - canvas.height / 2) / camZoom + camY;
    camX          = wx - (mx - canvas.width  / 2) / newZoom;
    camY          = wy - (my - canvas.height / 2) / newZoom;
    camZoom       = newZoom;
    clampCam();
  }, { passive: false });

  // ── Detail panel ──────────────────────────────────────────────────────

  function closeDetailPanel(): void {
    detailPanel.style.display = 'none';
  }

  function openDetailPanel(nodeIdx: number): void {
    if (!_rpgState || !_resources) return;
    const node = nodes[nodeIdx];
    const def = node.def;

    // Root node: just show info, no purchase
    if (def.upgradeId === null) {
      buildRootDetail();
      detailPanel.style.display = 'block';
      return;
    }

    const upgradeDef = RPG_UPGRADE_BY_ID.get(def.upgradeId);
    if (!upgradeDef) return;

    const currentLevel = getRpgUpgradeLevel(_rpgState, def.upgradeId);
    const isMaxed = currentLevel >= upgradeDef.maxLevel;
    const status = getNodeStatus(def, _rpgState, _isDevMode);

    const hasSkillPoint = _rpgState.unspentSkillPoints >= 1;
    const moteBalance = getMotes(_resources, upgradeDef.costTierId);
    const canAffordMotes = _isDevMode || moteBalance >= upgradeDef.costPerLevel;
    const canPurchase = !isMaxed && (_isDevMode || (hasSkillPoint && canAffordMotes));

    detailPanel.innerHTML = '';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'skill-tree__detail-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', closeDetailPanel);
    detailPanel.appendChild(closeBtn);

    const nameEl = document.createElement('div');
    nameEl.className = 'skill-tree__detail-name';
    nameEl.textContent = upgradeDef.name;
    detailPanel.appendChild(nameEl);

    const descEl = document.createElement('div');
    descEl.className = 'skill-tree__detail-desc';
    descEl.textContent = upgradeDef.description;
    detailPanel.appendChild(descEl);

    const levelEl = document.createElement('div');
    levelEl.className = 'skill-tree__detail-level';
    if (upgradeDef.maxLevel === 1) {
      levelEl.textContent = isMaxed ? '✓ Unlocked' : 'Not yet unlocked';
    } else {
      levelEl.textContent = `Level ${currentLevel} / ${upgradeDef.maxLevel}`;
    }
    detailPanel.appendChild(levelEl);

    if (!isMaxed) {
      const costsEl = document.createElement('div');
      costsEl.className = 'skill-tree__detail-costs';

      const spCost = document.createElement('span');
      spCost.className = 'skill-tree__detail-cost' + (hasSkillPoint || _isDevMode ? '' : ' skill-tree__detail-cost--unmet');
      spCost.textContent = `✦ 1 skill point${_rpgState.unspentSkillPoints > 0 ? ` (have ${_rpgState.unspentSkillPoints})` : ' (none available)'}`;
      costsEl.appendChild(spCost);

      const moteCost = document.createElement('span');
      moteCost.className = 'skill-tree__detail-cost' + (canAffordMotes ? '' : ' skill-tree__detail-cost--unmet');
      moteCost.textContent = `${formatNumberAs(upgradeDef.costPerLevel, _format)} ${upgradeDef.costTierId} motes`;
      costsEl.appendChild(moteCost);

      detailPanel.appendChild(costsEl);

      if (status === 'locked') {
        const lockEl = document.createElement('div');
        lockEl.className = 'skill-tree__detail-locked';
        lockEl.textContent = 'Prerequisite not met';
        detailPanel.appendChild(lockEl);
      }

      const buyBtn = document.createElement('button');
      buyBtn.className = 'skill-tree__detail-buy';
      if (canPurchase && status !== 'locked') {
        buyBtn.textContent = upgradeDef.maxLevel === 1 ? 'Unlock' : 'Upgrade';
        buyBtn.addEventListener('click', () => {
          dispatch({ kind: 'purchase_rpg_upgrade', upgradeId: upgradeDef.id });
          // Refresh the panel after purchase
          if (_rpgState && _resources) openDetailPanel(nodeIdx);
        });
      } else {
        buyBtn.textContent = !hasSkillPoint && !_isDevMode
          ? 'Need skill point'
          : !canAffordMotes
            ? 'Need motes'
            : status === 'locked'
              ? 'Prerequisites not met'
              : 'Cannot purchase';
        buyBtn.disabled = true;
      }
      detailPanel.appendChild(buyBtn);
    }

    detailPanel.style.display = 'block';
  }

  function buildRootDetail(): void {
    detailPanel.innerHTML = '';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'skill-tree__detail-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', closeDetailPanel);
    detailPanel.appendChild(closeBtn);

    const nameEl = document.createElement('div');
    nameEl.className = 'skill-tree__detail-name';
    nameEl.textContent = '✦ Player Core';
    detailPanel.appendChild(nameEl);

    const descEl = document.createElement('div');
    descEl.className = 'skill-tree__detail-desc';
    descEl.textContent = 'The root of all your abilities. Grants access to every first-tier skill.';
    detailPanel.appendChild(descEl);

    const statusEl = document.createElement('div');
    statusEl.className = 'skill-tree__detail-level';
    statusEl.textContent = '✓ Always active';
    detailPanel.appendChild(statusEl);
  }

  // ── Render ────────────────────────────────────────────────────────────

  function syncSize(): void {
    const w = canvasArea.clientWidth;
    const h = canvasArea.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
    }
  }

  function drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    ctx.fillStyle = '#04040c';
    ctx.fillRect(0, 0, W, H);
    const img = getCachedImage(BACKGROUND_PATH);
    if (img && img.naturalWidth > 1) {
      const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
    ctx.fillStyle = 'rgba(4,4,12,0.62)';
    ctx.fillRect(0, 0, W, H);
  }

  function drawFrame(tMs: number): void {
    const dt = _lastTMs > 0 ? Math.min(tMs - _lastTMs, 40) : 0;
    updateAmbientParticles(dt);
    _lastTMs = tMs;

    syncSize();
    const W = canvas.width;
    const H = canvas.height;
    if (W === 0 || H === 0) return;

    drawBackground(ctx2d, W, H);

    ctx2d.save();
    ctx2d.translate(W / 2, H / 2);
    ctx2d.scale(camZoom, camZoom);
    ctx2d.translate(-camX, -camY);

    drawAmbientParticles(ctx2d);

    const fy = (n: SkillNode): number => FLOAT_AMP * Math.sin(tMs * FLOAT_SPD + n.phase);

    // Draw connections
    for (const conn of connections) {
      const aStatus = _rpgState ? getNodeStatus(conn.a.def, _rpgState, _isDevMode) : 'locked';
      const bStatus = _rpgState ? getNodeStatus(conn.b.def, _rpgState, _isDevMode) : 'locked';
      const connAlpha = (aStatus === 'purchased' || bStatus === 'available') ? 1 : 0.35;
      drawConnection(ctx2d, conn, conn.a.y + fy(conn.a), conn.b.y + fy(conn.b), tMs, glowSprites, connAlpha);
    }

    // Draw nodes
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const cy = node.y + fy(node);
      const status = _rpgState ? getNodeStatus(node.def, _rpgState, _isDevMode) : 'locked';
      const isSelected = selectedIdx === i;
      const isHov = hoveredIdx === i;

      ctx2d.save();
      if (isSelected || isHov) {
        ctx2d.translate(node.x, cy);
        ctx2d.scale(isSelected ? SELECTED_SCALE : 1.06, isSelected ? SELECTED_SCALE : 1.06);
        ctx2d.translate(-node.x, -cy);
      }
      drawNode(ctx2d, node, cy, status, isHov, isSelected, _rpgState ?? ({} as RpgSimState), tMs);
      ctx2d.restore();
    }

    ctx2d.restore(); // end world transform

    // Screen-space title hint
    ctx2d.font = 'bold 11px monospace';
    ctx2d.textAlign = 'left';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillStyle = '#fff172aa';
    ctx2d.fillText('✦ Skill Tree', 10, 14);
    ctx2d.textBaseline = 'alphabetic';
  }

  function loop(tMs: number): void {
    if (!_isLooping) return;
    drawFrame(tMs);
    _rafId = requestAnimationFrame(loop);
  }

  // ── Public API ────────────────────────────────────────────────────────

  loadImage(BACKGROUND_PATH).catch(() => undefined);

  return {
    element,

    update(rpgState: RpgSimState, resources: ResourceState, numberFormat: NumberFormat, isDevMode: boolean): void {
      _rpgState   = rpgState;
      _resources  = resources;
      _format     = numberFormat;
      _isDevMode  = isDevMode;

      const sp = rpgState.unspentSkillPoints;
      spLabel.textContent = sp === 1
        ? '✦ 1 skill point available'
        : `✦ ${sp} skill points available`;
      spLabel.className = 'skill-tree__sp-label' + (sp > 0 ? ' skill-tree__sp-label--has-points' : '');

      // Refresh detail panel if open
      if (detailPanel.style.display !== 'none' && selectedIdx >= 0) {
        openDetailPanel(selectedIdx);
      }
    },

    startLoop(): void {
      if (_isLooping) return;
      _isLooping = true;
      _lastTMs = 0;
      resetCamera();
      selectedIdx = -1;
      closeDetailPanel();
      syncSize();
      cancelAnimationFrame(_rafId);
      _rafId = requestAnimationFrame(loop);
    },

    stopLoop(): void {
      _isLooping = false;
      cancelAnimationFrame(_rafId);
    },
  };
}
