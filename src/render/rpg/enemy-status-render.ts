/**
 * enemy-status-render.ts — Canvas overlay for active enemy status effects.
 *
 * Draws small status icons above enemies that have at least one active
 * Tier 1 lens status. Each icon is the tier sprite from
 * ASSETS/SPRITES/statusEffectIcons/ clipped to a small rounded square with
 * a colored glow tint, arranged in a row above the enemy.
 *
 * Falls back to the previous abbreviated text tag if the sprite is not yet
 * loaded (e.g. first frame before preload completes).
 *
 * Labels are sorted and drawn in a single pass after enemy sprites are rendered.
 */

import { getActiveStatuses } from '../../sim/rpg/enemy-status-effects';
import type { EnemyStatusKey } from '../../sim/rpg/enemy-status-effects';
import { getStatusEffectIconPath } from '../../render/assets/asset-paths';
import { getCachedImage } from '../../render/assets/asset-loader';

// ── Label config ───────────────────────────────────────────────────────────────

interface StatusLabel {
  text: string;   // fallback text tag
  color: string;  // glow / tint color
}

const STATUS_LABELS: Record<EnemyStatusKey, StatusLabel> = {
  abraded:     { text: 'ABR', color: '#d4a042' },
  refracted:   { text: 'RFR', color: '#c8e0ff' },
  burning:     { text: 'BRN', color: '#ff5533' },
  radiant:     { text: 'RAD', color: '#ffe066' },
  poisoned:    { text: 'PSN', color: '#66dd44' },
  chilled:     { text: 'CHL', color: '#55ccff' },
  timeWarped:  { text: 'TWP', color: '#9966cc' },
  echoMarked:  { text: 'ECH', color: '#cc88ff' },
  cracked:     { text: 'CRK', color: '#aaccff' },
  gravitized:  { text: 'GRV', color: '#666688' },
  fractalWound:{ text: 'FRC', color: '#ff44aa' },
  riftScarred: { text: 'RFT', color: '#44ffee' },
  frozen:      { text: 'FRZ', color: '#aaeeff' },
};

// Body VFX color per status — drawn as a faint rim overlay on the enemy sprite.
const STATUS_BODY_COLORS: Partial<Record<EnemyStatusKey, string>> = {
  burning:     '#ff5533',
  poisoned:    '#44cc33',
  chilled:     '#55ccff',
  frozen:      '#aaeeff',
  timeWarped:  '#9966cc',
  gravitized:  '#5555aa',
  fractalWound:'#ff44aa',
  riftScarred: '#44ffee',
  echoMarked:  '#cc88ff',
  abraded:     '#d4a042',
  cracked:     '#aaccff',
};

/** Icon size in canvas pixels (world-space). */
const ICON_SIZE = 10;
/** Gap between icon centres. */
const ICON_GAP = 12;
/** Minimum HP to render status icons (avoids labelling dying enemies). */
const MIN_HP_FOR_LABEL = 1;

// ── Per-enemy icon renderer ───────────────────────────────────────────────────

function _drawStatusIconsForEnemy(
  c: CanvasRenderingContext2D,
  enemy: { x: number; y: number; hp: number },
  halfSize: number,
  nowMs?: number,
): void {
  if (enemy.hp < MIN_HP_FOR_LABEL) return;
  const statuses = getActiveStatuses(enemy);
  if (statuses.length === 0) return;

  // Draw a faint colored rim on the enemy body for the primary active status.
  const primaryStatus = statuses[0]!;
  const bodyColor = STATUS_BODY_COLORS[primaryStatus.key];
  if (bodyColor) {
    const pct = Math.max(0, primaryStatus.remainingMs / primaryStatus.durationMs);
    const pulse = nowMs !== undefined ? 0.5 + 0.5 * Math.sin(nowMs / 250) : 0.8;
    c.save();
    c.globalAlpha = pct * (0.35 + pulse * 0.25);
    c.strokeStyle = bodyColor;
    c.shadowBlur = halfSize * 1.5;
    c.shadowColor = bodyColor;
    c.lineWidth = 1.2;
    c.strokeRect(enemy.x - halfSize - 0.5, enemy.y - halfSize - 0.5, halfSize * 2 + 1, halfSize * 2 + 1);
    c.shadowBlur = 0;
    c.restore();
  }

  const topY = enemy.y - halfSize - ICON_SIZE - 4;
  const totalW = statuses.length * ICON_GAP;
  const startX = enemy.x - totalW / 2 + ICON_GAP / 2;
  const half = ICON_SIZE / 2;

  c.save();

  for (let i = 0; i < statuses.length; i++) {
    const s = statuses[i]!;
    const label = STATUS_LABELS[s.key];
    if (!label) continue;

    const cx = startX + i * ICON_GAP;
    const lx = cx - half;
    const ly = topY;

    const sprite = getCachedImage(getStatusEffectIconPath(s.key));

    if (sprite) {
      // Dark background square
      c.fillStyle = 'rgba(0,0,0,0.6)';
      c.beginPath();
      c.roundRect(lx - 1, ly - 1, ICON_SIZE + 2, ICON_SIZE + 2, 2);
      c.fill();

      // Sprite
      c.drawImage(sprite, lx, ly, ICON_SIZE, ICON_SIZE);

      // Colored glow border
      c.strokeStyle = label.color + 'bb';
      c.lineWidth = 0.8;
      c.beginPath();
      c.roundRect(lx - 1, ly - 1, ICON_SIZE + 2, ICON_SIZE + 2, 2);
      c.stroke();
    } else {
      // Fallback: text tag (used on first frame before sprites are cached)
      c.fillStyle = 'rgba(0,0,0,0.55)';
      c.fillRect(cx - 6, topY - 6, 12, 7);
      c.font = '5px monospace';
      c.textAlign = 'center';
      c.textBaseline = 'bottom';
      c.fillStyle = label.color;
      c.fillText(label.text, cx, topY);
    }
  }

  c.restore();
}

// ── Main render entry point ────────────────────────────────────────────────────

/**
 * Renders status icons above all enemies that have active Tier 1 statuses.
 * Call after enemy sprites are drawn, while the world transform is active.
 *
 * Accepts a minimal duck-type subset of RpgDrawCtx so this file does not
 * import the large draw-context type.
 */
export function renderEnemyStatusLabels(
  c: CanvasRenderingContext2D,
  arrays: {
    nowMs?: number;
    enemies: Array<{ x: number; y: number; hp: number }>;
    sapphireEnemies: Array<{ x: number; y: number; hp: number }>;
    emeraldEnemies: Array<{ x: number; y: number; hp: number }>;
    amberEnemies: Array<{ x: number; y: number; hp: number }>;
    voidEnemies: Array<{ x: number; y: number; hp: number }>;
    quartzEnemies: Array<{ x: number; y: number; hp: number }>;
    rubyEnemies: Array<{ x: number; y: number; hp: number }>;
    sunstoneEnemies: Array<{ x: number; y: number; hp: number }>;
    citrineEnemies: Array<{ x: number; y: number; hp: number }>;
    ioliteEnemies: Array<{ x: number; y: number; hp: number }>;
    amethystEnemies: Array<{ x: number; y: number; hp: number }>;
    diamondEnemies: Array<{ x: number; y: number; hp: number }>;
    nullstoneEnemies: Array<{ x: number; y: number; hp: number }>;
    fracterylEnemies: Array<{ x: number; y: number; hp: number }>;
    eigensteinEnemies: Array<{ x: number; y: number; hp: number }>;
    eliteEnemies: Array<{ x: number; y: number; hp: number }>;
    polyominoEnemies: Array<{ x: number; y: number; hp: number }>;
    fissilePolyominoEnemies: Array<{ x: number; y: number; hp: number }>;
    refractorPolyominoEnemies: Array<{ x: number; y: number; hp: number }>;
    dustWispEnemies: Array<{ x: number; y: number; hp: number }>;
    ribbonWormEnemies: Array<{ x: number; y: number; hp: number }>;
    lanternMothEnemies: Array<{ x: number; y: number; hp: number }>;
    eyeStalkEnemies: Array<{ x: number; y: number; hp: number }>;
    jellyfishEnemies: Array<{ x: number; y: number; hp: number }>;
    clothGhostEnemies: Array<{ x: number; y: number; hp: number }>;
    plantTurretEnemies: Array<{ x: number; y: number; hp: number }>;
    gearInsectEnemies: Array<{ x: number; y: number; hp: number }>;
    spiderCrawlerEnemies: Array<{ x: number; y: number; hp: number }>;
    moteSwarmEnemies: Array<{ x: number; y: number; hp: number }>;
    shadowHandEnemies: Array<{ x: number; y: number; hp: number }>;
    sandFishEnemies: Array<{ x: number; y: number; hp: number }>;
    quartzFishEnemies: Array<{ x: number; y: number; hp: number }>;
    rubyFishEnemies: Array<{ x: number; y: number; hp: number }>;
    sunstoneFishEnemies: Array<{ x: number; y: number; hp: number }>;
    emeraldFishEnemies: Array<{ x: number; y: number; hp: number }>;
    sapphireFishEnemies: Array<{ x: number; y: number; hp: number }>;
    amethystFishEnemies: Array<{ x: number; y: number; hp: number }>;
    diamondFishEnemies: Array<{ x: number; y: number; hp: number }>;
  },
): void {
  const draw6  = (e: { x: number; y: number; hp: number }) => _drawStatusIconsForEnemy(c, e, 6);
  const draw8  = (e: { x: number; y: number; hp: number }) => _drawStatusIconsForEnemy(c, e, 8);
  const draw10 = (e: { x: number; y: number; hp: number }) => _drawStatusIconsForEnemy(c, e, 10);

  for (const e of arrays.enemies)                   draw6(e);
  for (const e of arrays.sapphireEnemies)           draw8(e);
  for (const e of arrays.emeraldEnemies)            draw6(e);
  for (const e of arrays.amberEnemies)              draw6(e);
  for (const e of arrays.voidEnemies)               draw6(e);
  for (const e of arrays.quartzEnemies)             draw8(e);
  for (const e of arrays.rubyEnemies)               draw6(e);
  for (const e of arrays.sunstoneEnemies)           draw8(e);
  for (const e of arrays.citrineEnemies)            draw6(e);
  for (const e of arrays.ioliteEnemies)             draw6(e);
  for (const e of arrays.amethystEnemies)           draw8(e);
  for (const e of arrays.diamondEnemies)            draw8(e);
  for (const e of arrays.nullstoneEnemies)          draw8(e);
  for (const e of arrays.fracterylEnemies)          draw6(e);
  for (const e of arrays.eigensteinEnemies)         draw8(e);
  for (const e of arrays.eliteEnemies)              draw10(e);
  for (const e of arrays.polyominoEnemies)          draw6(e);
  for (const e of arrays.fissilePolyominoEnemies)   draw6(e);
  for (const e of arrays.refractorPolyominoEnemies) draw6(e);
  for (const e of arrays.dustWispEnemies)           draw6(e);
  for (const e of arrays.ribbonWormEnemies)         draw6(e);
  for (const e of arrays.lanternMothEnemies)        draw6(e);
  for (const e of arrays.eyeStalkEnemies)           draw6(e);
  for (const e of arrays.jellyfishEnemies)          draw6(e);
  for (const e of arrays.clothGhostEnemies)         draw6(e);
  for (const e of arrays.plantTurretEnemies)        draw6(e);
  for (const e of arrays.gearInsectEnemies)         draw6(e);
  for (const e of arrays.spiderCrawlerEnemies)      draw6(e);
  for (const e of arrays.moteSwarmEnemies)          draw6(e);
  for (const e of arrays.shadowHandEnemies)         draw6(e);
  for (const e of arrays.sandFishEnemies)           draw6(e);
  for (const e of arrays.quartzFishEnemies)         draw6(e);
  for (const e of arrays.rubyFishEnemies)           draw6(e);
  for (const e of arrays.sunstoneFishEnemies)       draw6(e);
  for (const e of arrays.emeraldFishEnemies)        draw6(e);
  for (const e of arrays.sapphireFishEnemies)       draw6(e);
  for (const e of arrays.amethystFishEnemies)       draw6(e);
  for (const e of arrays.diamondFishEnemies)        draw6(e);
}
