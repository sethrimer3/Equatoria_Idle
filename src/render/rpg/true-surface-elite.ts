import type { NadirCubePointEnemy } from './nadir-cube-point-types';

export type TrueSurfaceKind = 'corkscrew' | 'dini';

const U_STEPS = 12;
const V_STEPS = 5;

function point(
  id: number, kind: TrueSurfaceKind, uIndex: number, vIndex: number,
  x: number, y: number, z: number, wave: number, isCore: boolean,
): NadirCubePointEnemy {
  const hp = isCore ? 1800 + wave * 80 : kind === 'dini' ? 1 : 180 + wave * 12;
  return {
    kind: 'nadir_cube_point', id, anchorX: x, anchorY: y, anchorZ: z,
    x, y, prevX: x, prevY: y, hp, maxHp: hp, atk: 18 + wave, def: isCore ? 8 : 3,
    behavior: 'turret', cooldownMs: Number.POSITIVE_INFINITY, pulseMs: id * 41,
    hitFlashMs: 0, projectedVisible: true, depthAlpha: 1,
    surfaceKind: kind, surfaceUIndex: uIndex, surfaceVIndex: vIndex,
    surfaceCore: isCore, surfaceActivated: false,
  };
}

export function createTrueSurfaceElite(kind: TrueSurfaceKind, wave: number): NadirCubePointEnemy[] {
  const result: NadirCubePointEnemy[] = [];
  let id = wave * 1000;
  for (let ui = 0; ui < U_STEPS; ui++) {
    const u = kind === 'corkscrew' ? (ui / (U_STEPS - 1) - 0.5) * Math.PI * 4 : ui / (U_STEPS - 1) * Math.PI * 4;
    for (let vi = 0; vi < V_STEPS; vi++) {
      const v = kind === 'corkscrew'
        ? (vi / (V_STEPS - 1) - 0.5) * Math.PI
        : 0.18 + vi / (V_STEPS - 1) * 1.72;
      let x: number; let y: number; let z: number;
      if (kind === 'corkscrew') {
        x = Math.cos(u) * Math.cos(v);
        y = Math.sin(u) * Math.cos(v);
        z = Math.sin(v) + 0.22 * u;
      } else {
        x = Math.cos(u) * Math.sin(v);
        y = Math.sin(u) * Math.sin(v);
        z = Math.cos(v) + Math.log(Math.tan(v * 0.5)) + 0.2 * u;
      }
      result.push(point(id++, kind, ui, vi, x, y, z, wave, false));
    }
  }
  result.push(point(id, kind, -1, -1, 0, 0, 0, wave, true));
  return result;
}

export function isTrueSurfaceCoreVulnerable(core: NadirCubePointEnemy, all: NadirCubePointEnemy[]): boolean {
  if (!core.surfaceCore || !core.surfaceKind) return true;
  if (core.surfaceKind === 'corkscrew') return true;
  return all.every(p => p.surfaceKind !== core.surfaceKind || p.surfaceCore || p.surfaceActivated);
}

export function isTrueSurfacePointTargetable(point: NadirCubePointEnemy, all: NadirCubePointEnemy[]): boolean {
  if (!point.surfaceKind) return true;
  return point.surfaceCore ? isTrueSurfaceCoreVulnerable(point, all) : !point.surfaceActivated;
}

export function updateTrueSurfaceElite(points: NadirCubePointEnemy[], width: number, height: number, nowMs: number): void {
  const surface = points.find(p => p.surfaceKind);
  if (!surface) return;
  const angle = nowMs * 0.00018;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const scaleX = width * 0.43;
  const scaleY = height * 0.26;
  for (const p of points) {
    if (!p.surfaceKind) continue;
    p.pulseMs += 16;
    p.hitFlashMs = Math.max(0, p.hitFlashMs - 16);
    if (p.surfaceCore) {
      p.x = width * 0.5; p.y = height * 0.48; p.depthAlpha = 1;
      continue;
    }
    const rx = p.anchorX * ca - p.anchorZ * sa;
    const rz = p.anchorX * sa + p.anchorZ * ca;
    p.prevX = p.x; p.prevY = p.y;
    p.x = width * 0.5 + rx * scaleX;
    p.y = height * 0.48 + (p.anchorY * 0.75 + rz * 0.18) * scaleY;
    p.depthAlpha = Math.max(0.35, Math.min(1, 0.65 + rz * 0.15));
  }
}

export function drawTrueSurfaceElite(ctx: CanvasRenderingContext2D, points: NadirCubePointEnemy[]): void {
  const surface = points.find(p => p.surfaceKind);
  if (!surface) return;
  const nodes = points.filter(p => p.surfaceKind === surface.surfaceKind && !p.surfaceCore);
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = surface.surfaceKind === 'dini' ? 'rgba(255,90,210,.45)' : 'rgba(90,240,255,.48)';
  for (const a of nodes) {
    for (const b of nodes) {
      const adjacent = (a.surfaceUIndex === b.surfaceUIndex && Math.abs(a.surfaceVIndex! - b.surfaceVIndex!) === 1)
        || (a.surfaceVIndex === b.surfaceVIndex && b.surfaceUIndex === a.surfaceUIndex! + 1);
      if (!adjacent) continue;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }
  for (const p of points) {
    if (p.surfaceKind !== surface.surfaceKind || p.hp <= 0) continue;
    const active = p.surfaceActivated || p.surfaceCore;
    ctx.fillStyle = active ? '#ffffff' : surface.surfaceKind === 'dini' ? '#ff309f' : '#35e8ff';
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = active ? 14 : 6;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.surfaceCore ? 13 : 4.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
