/**
 * enemy-status-render.ts — Minimal canvas overlay for active enemy status effects.
 *
 * Draws small colored status labels above enemies that have at least one
 * active Tier 1 lens status. Keeps it simple: abbreviated text tags in the
 * enemy's glow color, positioned above the enemy sprite.
 *
 * Rendering is intentionally lightweight — no icons, no health-bar integration.
 * Labels are sorted and drawn in a single pass after enemy sprites are rendered.
 */

import { getActiveStatuses } from '../../sim/rpg/enemy-status-effects';
import type { EnemyStatusKey } from '../../sim/rpg/enemy-status-effects';

// ── Label config ───────────────────────────────────────────────────────────────

interface StatusLabel {
  text: string;
  color: string;
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
};

/** Minimum HP an enemy must have for labels to render (avoids labelling dying enemies). */
const MIN_HP_FOR_LABEL = 1;

// ── Per-enemy label renderer ───────────────────────────────────────────────────

function _drawLabelsForEnemy(
  c: CanvasRenderingContext2D,
  enemy: { x: number; y: number; hp: number },
  halfSize: number,
): void {
  if (enemy.hp < MIN_HP_FOR_LABEL) return;
  const statuses = getActiveStatuses(enemy);
  if (statuses.length === 0) return;

  const x = enemy.x;
  const topY = enemy.y - halfSize - 4;

  c.font = '5px monospace';
  c.textAlign = 'center';
  c.textBaseline = 'bottom';

  let xOffset = 0;
  const GAP = 13;
  const totalW = statuses.length * GAP;
  const startX = x - totalW / 2 + GAP / 2;

  for (let i = 0; i < statuses.length; i++) {
    const s = statuses[i]!;
    const label = STATUS_LABELS[s.key];
    if (!label) continue;

    const lx = startX + i * GAP + xOffset;
    // Background tag
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(lx - 6, topY - 6, 12, 7);
    // Text
    c.fillStyle = label.color;
    c.fillText(label.text, lx, topY);
  }
  void xOffset; // used above
}

// ── Main render entry point ────────────────────────────────────────────────────

/**
 * Renders status labels above all enemies that have active Tier 1 statuses.
 * Call after enemy sprites are drawn, while the world transform is active.
 *
 * Accepts a minimal duck-type subset of RpgDrawCtx so this file does not
 * import the large draw-context type.
 */
export function renderEnemyStatusLabels(
  c: CanvasRenderingContext2D,
  arrays: {
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
  c.save();

  const draw6 = (e: { x: number; y: number; hp: number }) => _drawLabelsForEnemy(c, e, 6);
  const draw8 = (e: { x: number; y: number; hp: number }) => _drawLabelsForEnemy(c, e, 8);
  const draw10 = (e: { x: number; y: number; hp: number }) => _drawLabelsForEnemy(c, e, 10);

  for (const e of arrays.enemies)                  draw6(e);
  for (const e of arrays.sapphireEnemies)          draw8(e);
  for (const e of arrays.emeraldEnemies)           draw6(e);
  for (const e of arrays.amberEnemies)             draw6(e);
  for (const e of arrays.voidEnemies)              draw6(e);
  for (const e of arrays.quartzEnemies)            draw8(e);
  for (const e of arrays.rubyEnemies)              draw6(e);
  for (const e of arrays.sunstoneEnemies)          draw8(e);
  for (const e of arrays.citrineEnemies)           draw6(e);
  for (const e of arrays.ioliteEnemies)            draw6(e);
  for (const e of arrays.amethystEnemies)          draw8(e);
  for (const e of arrays.diamondEnemies)           draw8(e);
  for (const e of arrays.nullstoneEnemies)         draw8(e);
  for (const e of arrays.fracterylEnemies)         draw6(e);
  for (const e of arrays.eigensteinEnemies)        draw8(e);
  for (const e of arrays.eliteEnemies)             draw10(e);
  for (const e of arrays.polyominoEnemies)         draw6(e);
  for (const e of arrays.fissilePolyominoEnemies)  draw6(e);
  for (const e of arrays.refractorPolyominoEnemies)draw6(e);
  for (const e of arrays.dustWispEnemies)          draw6(e);
  for (const e of arrays.ribbonWormEnemies)        draw6(e);
  for (const e of arrays.lanternMothEnemies)       draw6(e);
  for (const e of arrays.eyeStalkEnemies)          draw6(e);
  for (const e of arrays.jellyfishEnemies)         draw6(e);
  for (const e of arrays.clothGhostEnemies)        draw6(e);
  for (const e of arrays.plantTurretEnemies)       draw6(e);
  for (const e of arrays.gearInsectEnemies)        draw6(e);
  for (const e of arrays.spiderCrawlerEnemies)     draw6(e);
  for (const e of arrays.moteSwarmEnemies)         draw6(e);
  for (const e of arrays.shadowHandEnemies)        draw6(e);
  for (const e of arrays.sandFishEnemies)          draw6(e);
  for (const e of arrays.quartzFishEnemies)        draw6(e);
  for (const e of arrays.rubyFishEnemies)          draw6(e);
  for (const e of arrays.sunstoneFishEnemies)      draw6(e);
  for (const e of arrays.emeraldFishEnemies)       draw6(e);
  for (const e of arrays.sapphireFishEnemies)      draw6(e);
  for (const e of arrays.amethystFishEnemies)      draw6(e);
  for (const e of arrays.diamondFishEnemies)       draw6(e);

  c.restore();
}
