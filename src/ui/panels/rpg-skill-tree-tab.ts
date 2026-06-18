/**
 * rpg-skill-tree-tab.ts — Skill Tree sub-tab for the RPG overlay panel.
 *
 * Renders a pannable/zoomable canvas-based skill tree. The node detail card
 * is drawn in world/canvas coordinates so it pans and zooms with the tree.
 */

import { RPG_UPGRADE_BY_ID } from '../../data/rpg/rpg-upgrade-definitions';
import {
  VISIBLE_SKILL_TREE_NODES,
  SKILL_TREE_TOTAL_POINTS,
  getVisibleSkillTreeSpentPoints,
  validateSkillTreeBudget,
  canPurchaseRpgSkill,
} from '../../data/rpg/rpg-skill-tree-definitions';
import type { SkillTreeNodeDef, PurchaseBlockReason } from '../../data/rpg/rpg-skill-tree-definitions';
import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getRpgUpgradeLevel } from '../../sim/rpg/rpg-state';
import type { ResourceState } from '../../sim/resources';
import { getMotes } from '../../sim/resources';
import type { ActionHandler } from '../../input';
import { formatNumberAs } from '../../util';
import type { NumberFormat } from '../../util';
import { getCachedImage, loadImage } from '../../render/assets/asset-loader';

validateSkillTreeBudget();

// ─── Constants ────────────────────────────────────────────────────────────

const BACKGROUND_PATH = 'ASSETS/ANIMATIONS/rpgBackground/rpgBackground_animation.webp';

const FLOAT_AMP    = 4;
const FLOAT_SPD    = 0.0007;
const ZOOM_MIN     = 0.30;
const ZOOM_MAX     = 2.2;
const DRAG_THRESHOLD = 5;
const SELECTED_SCALE = 1.18;

// Detail card world-space dimensions
const CARD_W   = 220;
const CARD_PAD = 14;
const CARD_BTN_H = 44;

// Named line heights used for both card-height measurement and drawing
const NAME_LINE_H        = 18;
const DESC_LINE_H        = 14;
const META_LINE_H        = 14;
const PLACEHOLDER_LINE_H = 13;

function formatPurchaseBlockReason(reason: PurchaseBlockReason | undefined): string {
  switch (reason) {
    case 'missing_prerequisite':    return 'Prerequisites not met';
    case 'not_enough_skill_points': return 'Need skill points';
    case 'not_enough_resource':     return 'Need motes';
    case 'max_level':               return 'Max level reached';
    case 'unknown_upgrade':         return 'Unknown skill';
    case 'not_in_skill_tree':       return 'Not in skill tree';
    default:                        return 'Cannot purchase';
  }
}

// ── Branch colours ──────────────────────────────────────────────────────
const BRANCH_COLOR: Record<string, string> = {
  movement:  '#40d4e0',
  defense:   '#e08840',
  weapons:   '#b064ff',
  resources: '#60d870',
  root:      '#ffd060',
  orbits:    '#ffaa44',
  elemental: '#6cbfff',
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

const PAN_MIN_X = -720;
const PAN_MAX_X = 720;
const PAN_MIN_Y = -560;
const PAN_MAX_Y = 640;

// ─── Skill tree data ─────────────────────────────────────────────────────────
// Nodes and node type are imported from rpg-skill-tree-definitions.ts.
// Use VISIBLE_SKILL_TREE_NODES as the authoritative list for rendering.

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

interface WorldRect { x: number; y: number; w: number; h: number }

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

type NodeStatus = 'maxed' | 'purchased' | 'available' | 'locked';

function getNodeStatus(
  def: SkillTreeNodeDef,
  rpgState: RpgSimState,
  isDevMode: boolean,
): NodeStatus {
  // Awakening root node — always purchased once tree is active
  if (def.upgradeId === 'awakening') {
    const level = getRpgUpgradeLevel(rpgState, 'awakening');
    return level >= 1 ? 'maxed' : 'available';
  }
  if (def.upgradeId === null) return 'maxed';

  const level = getRpgUpgradeLevel(rpgState, def.upgradeId);
  const upgradeDef = RPG_UPGRADE_BY_ID.get(def.upgradeId);
  const isMaxed = upgradeDef ? level >= upgradeDef.maxLevel : false;

  // Root-prerequisite nodes: unlocked once the tree root (awakening) is purchased
  if (def.prerequisiteId === null) {
    const awakeningLevel = getRpgUpgradeLevel(rpgState, 'awakening');
    if (awakeningLevel < 1 && !isDevMode) return 'locked';
    if (isMaxed) return 'maxed';
    if (level > 0) return 'purchased';
    return 'available';
  }

  // Nodes with a specific upgrade prerequisite
  const prereqLevel = getRpgUpgradeLevel(rpgState, def.prerequisiteId);
  if (prereqLevel < 1 && !isDevMode) return 'locked';
  if (isMaxed) return 'maxed';
  if (level > 0) return 'purchased';
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
  const isMaxed = status === 'maxed';
  const glowColor = isMaxed ? '#ffd060' : branchCol;

  // ── Outer glow / pulse ──────────────────────────────────────────────
  if (status !== 'locked') {
    ctx.save();
    const glowStr = (isMaxed || status === 'purchased')
      ? (isRoot ? 32 : isMedallion ? 22 : 16)
      : (isRoot ? 20 : isMedallion ? 14 : 10) * (0.6 + pulse * 0.4);
    ctx.shadowColor = glowColor;
    ctx.shadowBlur  = glowStr;
    ctx.beginPath();
    ctx.arc(x, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = glowColor;
    ctx.lineWidth   = (isMaxed || status === 'purchased') ? (isMedallion ? 2.8 : 2.2) : (isMedallion ? 1.6 : 1.2);
    ctx.globalAlpha = status === 'available' ? (0.6 + pulse * 0.4) : 1;
    ctx.stroke();
    ctx.restore();
  }

  // ── Background fill ─────────────────────────────────────────────────
  ctx.beginPath();
  ctx.arc(x, cy, r, 0, Math.PI * 2);
  if (status === 'locked') {
    ctx.fillStyle = 'rgba(5,5,12,0.90)';
  } else if (isMaxed) {
    // Ornate gold fill for maxed nodes
    const grad = ctx.createRadialGradient(x, cy - r * 0.3, r * 0.1, x, cy, r);
    grad.addColorStop(0, 'rgba(255,240,140,0.30)');
    grad.addColorStop(0.6, 'rgba(200,140,20,0.18)');
    grad.addColorStop(1, 'rgba(8,6,20,0.95)');
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = 'rgba(8,6,20,0.95)';
  }
  ctx.fill();

  // ── Border ring ─────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.arc(x, cy, r, 0, Math.PI * 2);
  if (status === 'locked') {
    ctx.strokeStyle = '#1e1e30';
    ctx.lineWidth   = 1.2;
  } else {
    ctx.strokeStyle = glowColor;
    ctx.lineWidth   = (isMaxed || status === 'purchased') ? (isMedallion ? 2.6 : 2.0) : (isMedallion ? 1.4 : 1.0);
    ctx.globalAlpha = status === 'available' ? (0.65 + pulse * 0.35) : 1;
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // ── Inner accent ring (medallions only) ─────────────────────────────
  if (isMedallion && status !== 'locked') {
    ctx.beginPath();
    ctx.arc(x, cy, r - 7, 0, Math.PI * 2);
    ctx.strokeStyle = glowColor + (isMaxed ? '88' : status === 'purchased' ? '55' : '30');
    ctx.lineWidth   = isMaxed ? 1.4 : 1;
    ctx.stroke();
  }

  // ── Ornate outer ring (maxed nodes get an extra decorative ring) ─────
  if (isMaxed) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, cy, r + 5, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffd060';
    ctx.lineWidth   = 1.2;
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([3, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── Rank progress arc (purchased/repeatable nodes) ───────────────────
  if (!isMaxed && !isMedallion && node.def.upgradeId) {
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
  ctx.globalAlpha  = status === 'locked' ? 0.20 : 1;
  ctx.font         = `${isRoot ? 24 : isMedallion ? 17 : 13}px sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = status === 'locked' ? '#333355' : glowColor;
  ctx.fillText(node.def.icon, x, cy);
  ctx.restore();

  // ── Label below ─────────────────────────────────────────────────────
  const upgDef = node.def.upgradeId ? RPG_UPGRADE_BY_ID.get(node.def.upgradeId) : null;
  const label  = upgDef ? upgDef.name : 'Awakening';
  ctx.save();
  ctx.font         = 'bold 10px "Cormorant Garamond", serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.globalAlpha  = status === 'locked' ? 0.28 : 0.88;
  ctx.fillStyle    = status === 'locked' ? '#33335a' : glowColor;
  ctx.fillText(label, x, cy + r + 5);
  ctx.restore();

  // ── Rank badge (purchased repeatable, not maxed) ─────────────────────
  if ((status === 'purchased') && upgDef && upgDef.maxLevel > 1) {
    const rank = getRpgUpgradeLevel(rpgState, upgDef.id);
    ctx.save();
    ctx.font         = 'bold 9px "Cormorant Garamond", serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle    = branchCol;
    ctx.globalAlpha  = 0.9;
    ctx.fillText(`${rank}/${upgDef.maxLevel}`, x, cy - r - 3);
    ctx.restore();
  }

  // ── Max rank checkmark badge ─────────────────────────────────────────
  if (isMaxed && !isRoot) {
    ctx.save();
    ctx.font         = 'bold 10px "Cormorant Garamond", serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle    = '#ffd060';
    ctx.globalAlpha  = 0.95;
    ctx.fillText('MAX', x, cy - r - 3);
    ctx.restore();
  }
}

// ─── Card drawing helpers ─────────────────────────────────────────────────

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  maxWidth: number,
): string[] {
  ctx.font = font;
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth) {
      if (current) { lines.push(current); current = word; }
      else { lines.push(word); }
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,       x + w, y + r,       r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h,   x + w - r, y + h,   r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h,   x,     y + h - r,   r);
  ctx.lineTo(x,     y + r);
  ctx.arcTo(x,     y,       x + r, y,            r);
  ctx.closePath();
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

  // ── State ─────────────────────────────────────────────────────────────
  let _rpgState: RpgSimState | null = null;
  let _resources: ResourceState | null = null;
  let _format: NumberFormat = 'letters';
  let _isDevMode = false;
  let _rafId = 0;
  let _isLooping = false;
  let _lastTMs = 0;

  // Camera
  let camX = 0;
  let camY = 0;
  let camZoom = 1;

  function clampCam(): void {
    camX = Math.max(PAN_MIN_X, Math.min(PAN_MAX_X, camX));
    camY = Math.max(PAN_MIN_Y, Math.min(PAN_MAX_Y, camY));
  }

  function resetCamera(): void {
    const w = canvas.width  || canvasArea.clientWidth  || 400;
    const h = canvas.height || canvasArea.clientHeight || 300;
    camX = 0;
    camY = 150;
    // Fit the full tree extent (~1400 × 1180 world units) with a 15 % margin.
    // Cap at 0.55 so the tree is never tiny on large screens.
    camZoom = Math.max(ZOOM_MIN, Math.min(0.55, Math.min(w / 1400, h / 1180)));
  }

  function screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - canvas.width  / 2) / camZoom + camX,
      y: (sy - canvas.height / 2) / camZoom + camY,
    };
  }

  // Visible canvas bounds in world space
  function worldBounds(): { left: number; right: number; top: number; bottom: number } {
    const W = canvas.width  || canvasArea.clientWidth  || 400;
    const H = canvas.height || canvasArea.clientHeight || 300;
    return {
      left:   camX - W / (2 * camZoom),
      right:  camX + W / (2 * camZoom),
      top:    camY - H / (2 * camZoom),
      bottom: camY + H / (2 * camZoom),
    };
  }

  // ── Build nodes and connections ───────────────────────────────────────
  const nodes: SkillNode[] = VISIBLE_SKILL_TREE_NODES.map((def, i) => ({
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
  // Set to true once a second pointer goes down; suppresses tap-on-up for the
  // whole gesture so pinch-zoom never accidentally deselects the card.
  let gestureWasPinch = false;

  // World-space rects of the currently drawn card and its buy button.
  // Updated every frame in drawDetailCard; read in handleTap.
  let cardBoundsWorldRect: WorldRect | null = null;
  let cardButtonWorldRect: WorldRect | null = null;

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

  // ── Trigger purchase ───────────────────────────────────────────────────
  // Dispatch to the action handler; canPurchaseRpgSkill there is authoritative.
  function triggerPurchase(): void {
    if (selectedIdx < 0) return;
    const node = nodes[selectedIdx];
    if (!node.def.upgradeId) return;
    dispatch({ kind: 'purchase_rpg_upgrade', upgradeId: node.def.upgradeId });
  }

  // ── Auto-pan to show card ─────────────────────────────────────────────
  function autoPanToShowCard(nodeIdx: number): void {
    if (nodeIdx < 0) return;
    const node   = nodes[nodeIdx];
    const fy     = FLOAT_AMP * Math.sin(_lastTMs * FLOAT_SPD + node.phase);
    const nodeCY = node.y + fy;
    const wb     = worldBounds();
    const MARG   = 12;
    const GAP    = 14;

    // Estimate card below node
    const cx = node.x - CARD_W / 2;
    const cy = nodeCY + node.nodeRadius + GAP;
    const cr = cx + CARD_W;
    const cb = cy + 280;   // generous height estimate (covers placeholder + costs + button)

    let dx = 0, dy = 0;
    if      (cx < wb.left   + MARG) dx = cx - MARG - wb.left;
    else if (cr > wb.right  - MARG) dx = cr + MARG - wb.right;
    if      (cy < wb.top    + MARG) dy = cy - MARG - wb.top;
    else if (cb > wb.bottom - MARG) dy = cb + MARG - wb.bottom;

    camX += dx;
    camY += dy;
    clampCam();
  }

  // ── Handle tap ────────────────────────────────────────────────────────
  function handleTap(sx: number, sy: number): void {
    const wp = screenToWorld(sx, sy);

    // Buy-button hit?
    if (selectedIdx >= 0 && cardButtonWorldRect) {
      const b = cardButtonWorldRect;
      if (wp.x >= b.x && wp.x <= b.x + b.w && wp.y >= b.y && wp.y <= b.y + b.h) {
        triggerPurchase();
        return;
      }
    }

    // Tap on card body (not a node, not the button) → keep card open
    if (selectedIdx >= 0 && cardBoundsWorldRect) {
      const b = cardBoundsWorldRect;
      if (wp.x >= b.x && wp.x <= b.x + b.w && wp.y >= b.y && wp.y <= b.y + b.h) {
        return;
      }
    }

    // Node hit?
    const idx = hitTest(wp.x, wp.y, _lastTMs);
    if (idx < 0) {
      selectedIdx = -1;
      return;
    }
    selectedIdx = idx;
    autoPanToShowCard(idx);
  }

  canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault();
    const { sx, sy } = canvasXY(e);
    ptrs.set(e.pointerId, { startX: sx, startY: sy, lastX: sx, lastY: sy });
    if (ptrs.size === 1) {
      gestureWasPinch = false;
      isDragging = false;
      dragBaseCamX = camX; dragBaseCamY = camY;
      dragBaseMidX = sx; dragBaseMidY = sy;
    } else if (ptrs.size >= 2) {
      gestureWasPinch = true;
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
    // Only fire a tap if this was a single-finger gesture with no pinch
    if (!isDragging && ptrs.size === 1 && !gestureWasPinch) handleTap(sx, sy);
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

  // ── Draw world-space detail card ───────────────────────────────────────
  //
  // Called inside the active world transform so the card naturally pans and
  // zooms with the rest of the tree.  cardBoundsWorldRect and
  // cardButtonWorldRect are updated every frame for hit-testing in handleTap.
  //
  function drawDetailCard(ctx: CanvasRenderingContext2D, nodeIdx: number, tMs: number): void {
    if (nodeIdx < 0 || !_rpgState) {
      cardBoundsWorldRect = null;
      cardButtonWorldRect = null;
      return;
    }

    const node    = nodes[nodeIdx];
    const def     = node.def;
    const fy      = FLOAT_AMP * Math.sin(tMs * FLOAT_SPD + node.phase);
    const nodeCY  = node.y + fy;

    const isRoot     = def.upgradeId === null;
    const upgradeDef = isRoot ? null : RPG_UPGRADE_BY_ID.get(def.upgradeId!);
    const name       = upgradeDef ? upgradeDef.name : 'Player Core';
    const descStr    = upgradeDef
      ? upgradeDef.description
      : 'The root of all your abilities. Grants access to every first-tier skill.';

    const curLevel       = upgradeDef ? getRpgUpgradeLevel(_rpgState, upgradeDef.id) : 0;
    const maxLevel       = upgradeDef ? upgradeDef.maxLevel : 1;
    const isMaxed        = upgradeDef ? curLevel >= maxLevel : false;
    const spCost         = upgradeDef ? upgradeDef.skillPointCost : 1;
    const status         = def.upgradeId ? getNodeStatus(def, _rpgState, _isDevMode) : 'maxed';
    const isLocked       = status === 'locked';
    // Keep these for display-color purposes only (not for purchase gate)
    const hasSkillPt     = _rpgState.unspentSkillPoints >= spCost;
    const moteBalance    = (upgradeDef && _resources) ? getMotes(_resources, upgradeDef.costTierId) : 0;
    const canAffordMotes = _isDevMode || (upgradeDef ? (upgradeDef.costPerLevel === 0 || moteBalance >= upgradeDef.costPerLevel) : false);
    // Purchase gate comes from the shared helper so UI and action handler always agree
    const purchaseCheck  = (!isRoot && def.upgradeId && _resources)
      ? canPurchaseRpgSkill(_rpgState, _resources, def.upgradeId, _isDevMode)
      : { ok: false, reason: undefined };
    const canPurchase    = !isRoot && !isMaxed && purchaseCheck.ok;

    // Measure wrapped description before computing card height
    const DESC_FONT = '12px "Cormorant Garamond", serif';
    const innerW    = CARD_W - CARD_PAD * 2;
    ctx.save();
    const descLines = wrapText(ctx, descStr, DESC_FONT, innerW);
    ctx.restore();

    // ── Pre-compute layout booleans (must match the draw code below) ────────
    const showPlaceholderNotice = upgradeDef?.implementationStatus === 'placeholder';
    const showCostsAndButton    = !isRoot && !!upgradeDef && !isMaxed;
    const showLockedReason      = showCostsAndButton && isLocked;

    // ── Compute card height ──────────────────────────────────────────────
    let cardH  = CARD_PAD;                                       // top padding
    cardH += NAME_LINE_H;                                        // name
    cardH += 5;                                                  // gap
    cardH += descLines.length * DESC_LINE_H;                     // description lines
    cardH += 6;                                                  // gap
    cardH += META_LINE_H;                                        // level text
    if (showPlaceholderNotice) { cardH += 4; cardH += PLACEHOLDER_LINE_H; }
    if (showCostsAndButton) {
      cardH += 8;                                                // gap
      cardH += META_LINE_H;                                      // SP cost
      cardH += 4;                                                // gap
      cardH += META_LINE_H;                                      // mote cost
      if (showLockedReason) { cardH += 4; cardH += META_LINE_H; }
      cardH += 8;                                                // gap before button
      cardH += CARD_BTN_H;                                       // button
    }
    cardH += CARD_PAD;                                           // bottom padding

    // ── Position card in world space ─────────────────────────────────────
    const wb   = worldBounds();
    const r    = node.nodeRadius;
    const GAP  = 14;
    const MARG = 12;

    let cardX = node.x - CARD_W / 2;
    let cardY = nodeCY + r + GAP;
    type ConnSide = 'top' | 'bottom' | 'left' | 'right';
    let connSide: ConnSide = 'top';

    if (cardY + cardH > wb.bottom - MARG) {
      const tryAbove = nodeCY - r - GAP - cardH;
      if (tryAbove >= wb.top + MARG) {
        cardY    = tryAbove;
        connSide = 'bottom';
      } else {
        const tryRight = node.x + r + GAP;
        if (tryRight + CARD_W <= wb.right - MARG) {
          cardX    = tryRight;
          cardY    = nodeCY - cardH / 2;
          connSide = 'left';
        } else {
          cardX    = node.x - r - GAP - CARD_W;
          cardY    = nodeCY - cardH / 2;
          connSide = 'right';
        }
      }
    }

    // Clamp into visible viewport
    cardX = Math.max(wb.left  + MARG, Math.min(wb.right  - MARG - CARD_W, cardX));
    cardY = Math.max(wb.top   + MARG, Math.min(wb.bottom - MARG - cardH,  cardY));

    // Store rects for hit-testing (overwrite each frame)
    cardBoundsWorldRect = { x: cardX, y: cardY, w: CARD_W, h: cardH };
    cardButtonWorldRect = null;

    // ── Connector line from node to card ─────────────────────────────────
    let connEndX = cardX + CARD_W / 2;
    let connEndY = cardY;
    if      (connSide === 'bottom') { connEndY = cardY + cardH; }
    else if (connSide === 'left')   { connEndX = cardX;          connEndY = cardY + cardH / 2; }
    else if (connSide === 'right')  { connEndX = cardX + CARD_W; connEndY = cardY + cardH / 2; }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(node.x, nodeCY);
    ctx.lineTo(connEndX, connEndY);
    ctx.strokeStyle = '#ffd060';
    ctx.lineWidth   = 1;
    ctx.globalAlpha = 0.45;
    ctx.stroke();
    ctx.restore();

    // ── Card background ──────────────────────────────────────────────────
    ctx.save();

    // Subtle outer glow
    ctx.shadowColor = 'rgba(255, 208, 96, 0.5)';
    ctx.shadowBlur  = 20;
    drawRoundRect(ctx, cardX, cardY, CARD_W, cardH, 10);
    ctx.fillStyle = 'rgba(10, 8, 20, 0.94)';
    ctx.fill();
    ctx.shadowBlur = 0;

    // Gold border
    drawRoundRect(ctx, cardX, cardY, CARD_W, cardH, 10);
    ctx.strokeStyle = '#ffd060';
    ctx.lineWidth   = 1.3;
    ctx.globalAlpha = 0.68;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Ornamental corner accents (diagonal gold lines)
    const CL = 8;   // line length
    const CO = 5;   // inset from corner
    ctx.strokeStyle = '#ffd060';
    ctx.lineWidth   = 1.8;
    ctx.globalAlpha = 0.82;
    ctx.beginPath(); ctx.moveTo(cardX + CO,          cardY + CO + CL);    ctx.lineTo(cardX + CO,          cardY + CO);         ctx.lineTo(cardX + CO + CL,    cardY + CO);         ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cardX + CARD_W - CO - CL, cardY + CO);    ctx.lineTo(cardX + CARD_W - CO, cardY + CO);         ctx.lineTo(cardX + CARD_W - CO, cardY + CO + CL);   ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cardX + CO,          cardY + cardH - CO - CL); ctx.lineTo(cardX + CO,     cardY + cardH - CO); ctx.lineTo(cardX + CO + CL,    cardY + cardH - CO); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cardX + CARD_W - CO - CL, cardY + cardH - CO); ctx.lineTo(cardX + CARD_W - CO, cardY + cardH - CO); ctx.lineTo(cardX + CARD_W - CO, cardY + cardH - CO - CL); ctx.stroke();
    ctx.globalAlpha = 1;

    // ── Text content ─────────────────────────────────────────────────────
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    const textX = cardX + CARD_PAD;
    let   textY = cardY + CARD_PAD;

    // Name (gold, bold)
    ctx.font      = 'bold 15px "Cormorant Garamond", serif';
    ctx.fillStyle = '#ffd060';
    ctx.fillText(name, textX, textY);
    textY += NAME_LINE_H;

    // Description (light grey, word-wrapped)
    textY += 5;
    ctx.font      = DESC_FONT;
    ctx.fillStyle = 'rgba(215, 210, 238, 0.85)';
    for (const line of descLines) {
      ctx.fillText(line, textX, textY);
      textY += DESC_LINE_H;
    }

    // Level indicator
    textY += 6;
    ctx.font = '10px monospace';
    if (isRoot) {
      ctx.fillStyle = '#7de88a';
      ctx.fillText('✓ Always active', textX, textY);
    } else if (upgradeDef) {
      ctx.fillStyle = isMaxed ? '#7de88a' : 'rgba(255,255,255,0.72)';
      ctx.fillText(
        maxLevel === 1
          ? (isMaxed ? '✓ Unlocked' : 'Not yet unlocked')
          : `Level ${curLevel} / ${maxLevel}`,
        textX, textY,
      );
    }
    textY += META_LINE_H;

    // Placeholder notice (only for pending skills)
    if (showPlaceholderNotice) {
      textY += 4;
      ctx.font      = '9px monospace';
      ctx.fillStyle = 'rgba(200, 170, 80, 0.65)';
      ctx.fillText('⚠ Effect hook pending', textX, textY);
      textY += PLACEHOLDER_LINE_H;
    }

    // ── Costs & buy button (upgradeable only) ────────────────────────────
    if (showCostsAndButton) {
      textY += 8;

      // SP cost
      ctx.font      = '10px monospace';
      ctx.fillStyle = (hasSkillPt || _isDevMode) ? '#8ec87a' : '#e07070';
      ctx.fillText(`✦ ${spCost} SP  (have ${_rpgState.unspentSkillPoints})`, textX, textY);
      textY += META_LINE_H;

      // Mote cost (hide if free)
      textY += 4;
      if (upgradeDef!.costPerLevel > 0) {
        ctx.fillStyle = canAffordMotes ? '#8ec87a' : '#e07070';
        ctx.fillText(
          `${formatNumberAs(upgradeDef!.costPerLevel, _format)} ${upgradeDef!.costTierId} motes`,
          textX, textY,
        );
      } else {
        ctx.fillStyle = '#8ec87a';
        ctx.fillText('No mote cost', textX, textY);
      }
      textY += META_LINE_H;

      // Locked reason (from shared helper)
      if (showLockedReason) {
        textY += 4;
        ctx.fillStyle = '#e07070';
        ctx.fillText(formatPurchaseBlockReason(purchaseCheck.reason), textX, textY);
        textY += META_LINE_H;
      }

      // Buy button
      textY += 8;
      const btnX = cardX + CARD_PAD;
      const btnY = textY;
      const btnW = CARD_W - CARD_PAD * 2;
      const btnH = CARD_BTN_H;

      drawRoundRect(ctx, btnX, btnY, btnW, btnH, 6);
      ctx.fillStyle = canPurchase
        ? 'rgba(196, 164, 74, 0.22)'
        : 'rgba(55, 55, 55, 0.22)';
      ctx.fill();

      drawRoundRect(ctx, btnX, btnY, btnW, btnH, 6);
      ctx.strokeStyle = canPurchase ? 'rgba(240, 208, 96, 0.82)' : 'rgba(85, 85, 85, 0.50)';
      ctx.lineWidth   = 1.2;
      ctx.stroke();

      const btnLabel = canPurchase
        ? (maxLevel === 1 ? 'Unlock' : 'Upgrade')
        : formatPurchaseBlockReason(purchaseCheck.reason);

      ctx.save();
      ctx.beginPath(); ctx.rect(btnX, btnY, btnW, btnH); ctx.clip();
      ctx.font         = 'bold 11px monospace';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle    = canPurchase ? '#f0d070' : 'rgba(135, 135, 135, 0.70)';
      ctx.fillText(btnLabel, btnX + btnW / 2, btnY + btnH / 2);
      ctx.restore();

      // Store button rect for hit-testing (always record so taps register even disabled)
      cardButtonWorldRect = { x: btnX, y: btnY, w: btnW, h: btnH };
    }

    ctx.restore();
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
      const connAlpha = (aStatus === 'purchased' || aStatus === 'maxed' || bStatus === 'available') ? 1 : 0.35;
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

    // Detail card drawn in world space — pans and zooms with the tree
    drawDetailCard(ctx2d, selectedIdx, tMs);

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
      const totalSpent = getVisibleSkillTreeSpentPoints(rpgState);
      spLabel.textContent = `✦ ${sp} available  ·  ${totalSpent} / ${SKILL_TREE_TOTAL_POINTS} spent`;
      spLabel.className = 'skill-tree__sp-label' + (sp > 0 ? ' skill-tree__sp-label--has-points' : '');
      // The canvas-drawn card auto-refreshes from _rpgState each frame — no DOM refresh needed.
    },

    startLoop(): void {
      if (_isLooping) return;
      _isLooping = true;
      _lastTMs = 0;
      resetCamera();
      selectedIdx = -1;
      cardBoundsWorldRect = null;
      cardButtonWorldRect = null;
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
