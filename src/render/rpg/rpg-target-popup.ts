import type { ClosestTarget, TargetKind } from './rpg-types';
import { getBossEnemyIconPath, FALLBACK_ENEMY_ICON_PATH } from '../assets/asset-paths';
import { getCachedImage, loadImage } from '../assets/asset-loader';
import type { WorldRect } from './rpgFieldSpace';

const POPUP_VISIBLE_MS = 3000;
const POPUP_FADE_MS = 1000;
const POPUP_ICON_PX = 18;
const POPUP_PAD_X = 5;
const POPUP_PAD_Y = 4;
const POPUP_GAP = 5;
const POPUP_MARGIN = 3;
const POPUP_MIN_W = POPUP_ICON_PX + POPUP_PAD_X * 2;

const TARGET_LABELS: Record<TargetKind, string> = {
  laser: 'Laser Striker',
  sapphire: 'Sapphire Guard',
  missile: 'Sapphire Missile',
  emerald: 'Emerald Blinker',
  amber: 'Amber Gunner',
  ambershard: 'Amber Shard',
  void: 'Void Bruiser',
  quartz: 'Quartz Orbiter',
  quartzspike: 'Quartz Spike',
  ruby: 'Ruby Patroller',
  rubybolt: 'Ruby Bolt',
  sunstone: 'Sunstone Orbiter',
  citrine: 'Citrine Chaser',
  citrinebolt: 'Citrine Bolt',
  iolite: 'Iolite Colossus',
  amethyst: 'Amethyst Shielder',
  amethystshard: 'Amethyst Shard',
  diamond: 'Diamond Phase-Shifter',
  diamondshard: 'Diamond Shard',
  nullstone: 'Nullstone Gravity Well',
  voidtendril: 'Void Tendril',
  fracteryl: 'Fracteryl Manifestation',
  fracterylshard: 'Fracteryl Shard',
  eigenstein: 'Eigenstein Entity',
  verdure_polyomino: 'Verdure Polyomino',
  verdure_polyomino_fissile: 'Fissile Polyomino',
  verdure_polyomino_refractor: 'Refractor Polyomino',
  elite: 'Elite Enemy',
  aliven_particle: 'Aliven Particle',
  boss: 'Boss',
  proc_dustwisp: 'Dust Wisp',
  proc_ribbonworm: 'Ribbon Worm',
  proc_lanternmoth: 'Lantern Moth',
  proc_eyestalk: 'Eye Stalk',
  proc_jellyfish: 'Floating Jellyfish',
  proc_jellyfish_elite: 'Elite Jellyfish',
  proc_clothghost: 'Cloth Ghost',
  proc_plantturret: 'Plant Turret',
  proc_gearinsect: 'Gear Insect',
  proc_spidercrawler: 'Spider Crawler',
  proc_moteswarm: 'Magnetic Swarm',
  proc_shadowhand: 'Shadow Hand',
  proc_sandfish: 'Sand Fish',
  proc_quartzfish: 'Quartz Fish',
  proc_rubyfish: 'Ruby Fish',
  proc_sunstonefish: 'Sunstone Fish',
  proc_emeraldfish: 'Emerald Fish',
  proc_sapphirefish: 'Sapphire Fish',
  proc_amethystfish: 'Amethyst Fish',
  proc_diamondfish: 'Diamond Fish',
  proc_plantproj: 'Plant Projectile',
  verdure_plant: 'Verdure Plant',
  binary_ring: 'Binary Ring',
  nadir_cube_point: 'Nadir Cube Point',
  horizon_pentagon_real: 'Bohemian Dome',
  horizon_missile: 'Horizon Missile',
};

const TARGET_ICON_FILES: Partial<Record<TargetKind, string>> = {
  laser: 'Euhedral/EnemyIcon_Laser-Striker.png',
  quartz: 'Euhedral/EnemyIcon_Quartz-Orbiter.png',
  sapphire: 'Euhedral/EnemyIcon_Sapphire-Guard.png',
  emerald: 'Euhedral/EnemyIcon_Emerald-Blinker.png',
  ruby: 'Euhedral/EnemyIcon_Ruby-Patroller.png',
  amber: 'Euhedral/EnemyIcon_Amber-Gunner.png',
  void: 'Euhedral/EnemyIcon_Void-Bruiser.png',
  sunstone: 'Euhedral/EnemyIcon_Sunstone-Orbiter.png',
  citrine: 'Euhedral/EnemyIcon_Citrine-Chaser.png',
  iolite: 'Euhedral/EnemyIcon_Iolite-Colossus.png',
  amethyst: 'Euhedral/EnemyIcon_Amethyst-Shielder.png',
  diamond: 'Euhedral/EnemyIcon_Diamond-Phase-Shifter.png',
  nullstone: 'Euhedral/EnemyIcon_Nullstone-Gravity-Well.png',
  fracteryl: 'Euhedral/EnemyIcon_Fracteryl-Manifestation.png',
  eigenstein: 'Euhedral/EnemyIcon_Eigenstein-Entity.png',
  verdure_polyomino: 'Verdure/EnemyIcon_Verdure-Polyomino.png',
  verdure_polyomino_fissile: 'Verdure/EnemyIcon_Fissile-Polyomino.png',
  verdure_polyomino_refractor: 'Verdure/EnemyIcon_Refractor-Polyomino.png',
  proc_dustwisp: 'Impetus/EnemyIcon_Dust-Wisp.png',
  proc_ribbonworm: 'Impetus/EnemyIcon_Ribbon-Worm.png',
  proc_lanternmoth: 'Impetus/EnemyIcon_Lantern-Moth.png',
  proc_eyestalk: 'Impetus/EnemyIcon_Eye-Stalk.png',
  proc_jellyfish: 'Impetus/EnemyIcon_Floating-Jellyfish.png',
  proc_clothghost: 'Verdure/EnemyIcon_Cloth-Ghost.png',
  proc_plantturret: 'Verdure/EnemyIcon_Plant-Turret.png',
  proc_gearinsect: 'Verdure/EnemyIcon_Gear-Insect.png',
  proc_spidercrawler: 'Verdure/EnemyIcon_Spider-Crawler.png',
  proc_moteswarm: 'Verdure/EnemyIcon_Magnetic-Swarm.png',
  proc_shadowhand: 'Verdure/EnemyIcon_Shadow-Hand.png',
  proc_sandfish: 'Caustics/EnemyIcon_Sand-Fish.png',
  proc_quartzfish: 'Caustics/EnemyIcon_Quartz-Fish.png',
  proc_rubyfish: 'Caustics/EnemyIcon_Ruby-Fish.png',
  proc_sunstonefish: 'Caustics/EnemyIcon_Sunstone-Fish.png',
  proc_emeraldfish: 'Caustics/EnemyIcon_Emerald-Fish.png',
  proc_sapphirefish: 'Caustics/EnemyIcon_Sapphire-Fish.png',
  proc_amethystfish: 'Caustics/EnemyIcon_Amethyst-Fish.png',
  proc_diamondfish: 'Caustics/EnemyIcon_Diamond-Fish.png',
};

export function getTargetDisplayName(target: ClosestTarget): string {
  if (target.boss?.bossId) return `Boss ${target.boss.bossId}`;
  if (target.elite?.tier) {
    const base = String(target.elite.tier);
    return `Elite ${base.charAt(0).toUpperCase()}${base.slice(1)}`;
  }
  return TARGET_LABELS[target.kind] ?? 'Enemy';
}

export function drawTargetNamePopup(
  ctx: CanvasRenderingContext2D,
  target: ClosestTarget | null,
  selectedAtMs: number,
  nowMs: number,
  visibleBounds: WorldRect,
): void {
  if (!target || selectedAtMs <= 0) return;
  const ageMs = nowMs - selectedAtMs;
  if (ageMs >= POPUP_VISIBLE_MS + POPUP_FADE_MS) return;
  const alpha = ageMs <= POPUP_VISIBLE_MS ? 1 : 1 - ((ageMs - POPUP_VISIBLE_MS) / POPUP_FADE_MS);
  if (alpha <= 0) return;

  const label = getTargetDisplayName(target);
  ctx.save();
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const boundsW = Math.max(POPUP_MIN_W, visibleBounds.width - POPUP_MARGIN * 2);
  const maxTextW = Math.max(0, boundsW - POPUP_ICON_PX - POPUP_GAP - POPUP_PAD_X * 2);
  const text = fitText(ctx, label, maxTextW);
  const textW = Math.min(maxTextW, ctx.measureText(text).width);
  const boxW = Math.min(boundsW, Math.max(POPUP_MIN_W, POPUP_PAD_X * 2 + POPUP_ICON_PX + POPUP_GAP + textW));
  const boxH = POPUP_ICON_PX + POPUP_PAD_Y * 2;
  let boxX = target.x - boxW / 2;
  let boxY = target.y - 28 - boxH;
  if (boxY < visibleBounds.top + POPUP_MARGIN) boxY = target.y + 16;
  boxX = Math.max(visibleBounds.left + POPUP_MARGIN, Math.min(visibleBounds.right - POPUP_MARGIN - boxW, boxX));
  boxY = Math.max(visibleBounds.top + POPUP_MARGIN, Math.min(visibleBounds.bottom - POPUP_MARGIN - boxH, boxY));

  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(7, 9, 18, 0.88)';
  ctx.strokeStyle = 'rgba(255, 225, 120, 0.72)';
  ctx.lineWidth = 1;
  roundRect(ctx, boxX, boxY, boxW, boxH, 4);
  ctx.fill();
  ctx.stroke();

  const iconX = boxX + POPUP_PAD_X;
  const iconY = boxY + POPUP_PAD_Y;
  drawPopupIcon(ctx, target, iconX, iconY, POPUP_ICON_PX);

  ctx.fillStyle = '#fff2a8';
  ctx.shadowBlur = 3;
  ctx.shadowColor = 'rgba(255, 220, 120, 0.55)';
  ctx.fillText(text, iconX + POPUP_ICON_PX + POPUP_GAP, boxY + boxH / 2 + 0.5, maxTextW);
  ctx.restore();
}

function drawPopupIcon(ctx: CanvasRenderingContext2D, target: ClosestTarget, x: number, y: number, size: number): void {
  const path = getTargetIconPath(target);
  const image = getCachedImage(path);
  if (image) {
    ctx.drawImage(image, x, y, size, size);
    return;
  }
  loadImage(path).catch(() => {});
  ctx.fillStyle = 'rgba(255, 241, 114, 0.18)';
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = 'rgba(255, 241, 114, 0.55)';
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  ctx.fillStyle = '#fff172';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(getTargetDisplayName(target).charAt(0), x + size / 2, y + size / 2 + 0.5);
}

function getTargetIconPath(target: ClosestTarget): string {
  if (target.boss?.bossId) return getBossEnemyIconPath(target.boss.bossId);
  const relative = TARGET_ICON_FILES[target.kind];
  return relative ? `ASSETS/SPRITES/enemyIcons/${relative}` : FALLBACK_ENEMY_ICON_PATH;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = '...';
  let out = text;
  while (out.length > 1 && ctx.measureText(out + ellipsis).width > maxWidth) out = out.slice(0, -1);
  return out.length > 1 ? out + ellipsis : text.charAt(0);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
