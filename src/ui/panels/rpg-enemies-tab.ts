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
  LASER_ENEMY_SIZE, LASER_ENEMY_COLOR, LASER_ENEMY_GLOW,
  SAPPHIRE_ENEMY_SIZE, SAPPHIRE_ENEMY_COLOR, SAPPHIRE_ENEMY_GLOW, SAPPHIRE_SHIELD_RADIUS,
  BOSS_COLORS, BOSS_GLOW_COLORS, BOSS_NAMES, BOSS_HP_INIT, BOSS_ATK_INIT, BOSS_DEF_INIT,
  BOSS_SIZE_BASE,
} from '../../render/rpg/rpg-constants';
import {
  EMERALD_ENEMY_SIZE, EMERALD_ENEMY_COLOR, EMERALD_ENEMY_GLOW,
  AMBER_ENEMY_SIZE, AMBER_ENEMY_COLOR, AMBER_ENEMY_GLOW,
  VOID_ENEMY_SIZE, VOID_ENEMY_COLOR, VOID_ENEMY_GLOW, VOID_AURA_RADIUS,
  QUARTZ_ENEMY_SIZE, QUARTZ_ENEMY_COLOR, QUARTZ_ENEMY_GLOW,
  RUBY_ENEMY_SIZE, RUBY_ENEMY_COLOR, RUBY_ENEMY_GLOW,
  SUNSTONE_ENEMY_SIZE, SUNSTONE_ENEMY_COLOR, SUNSTONE_ENEMY_GLOW,
  CITRINE_ENEMY_SIZE, CITRINE_ENEMY_COLOR, CITRINE_ENEMY_GLOW,
  IOLITE_ENEMY_SIZE, IOLITE_ENEMY_COLOR, IOLITE_ENEMY_GLOW,
  AMETHYST_ENEMY_SIZE, AMETHYST_ENEMY_COLOR, AMETHYST_ENEMY_GLOW,
  DIAMOND_ENEMY_SIZE, DIAMOND_ENEMY_COLOR, DIAMOND_ENEMY_GLOW,
  NULLSTONE_ENEMY_SIZE, NULLSTONE_ENEMY_COLOR, NULLSTONE_ENEMY_GLOW, NULLSTONE_GRAVITY_RADIUS,
  FRACTERYL_ENEMY_SIZE, FRACTERYL_ENEMY_COLOR, FRACTERYL_ENEMY_GLOW,
  EIGENSTEIN_ENEMY_SIZE, EIGENSTEIN_ENEMY_COLOR, EIGENSTEIN_ENEMY_GLOW,
  EMERALD_HP_INIT, EMERALD_ATK_INIT, EMERALD_DEF_INIT,
  AMBER_HP_INIT, AMBER_ATK_INIT, AMBER_DEF_INIT,
  VOID_HP_INIT, VOID_ATK_INIT, VOID_DEF_INIT,
  QUARTZ_HP_INIT, QUARTZ_ATK_INIT, QUARTZ_DEF_INIT,
  RUBY_HP_INIT, RUBY_ATK_INIT, RUBY_DEF_INIT,
  SUNSTONE_HP_INIT, SUNSTONE_ATK_INIT, SUNSTONE_DEF_INIT,
  CITRINE_HP_INIT, CITRINE_ATK_INIT, CITRINE_DEF_INIT,
  IOLITE_HP_INIT, IOLITE_ATK_INIT, IOLITE_DEF_INIT,
  AMETHYST_HP_INIT, AMETHYST_ATK_INIT, AMETHYST_DEF_INIT,
  DIAMOND_HP_INIT, DIAMOND_ATK_INIT, DIAMOND_DEF_INIT,
  NULLSTONE_HP_INIT, NULLSTONE_ATK_INIT, NULLSTONE_DEF_INIT,
  FRACTERYL_HP_INIT, FRACTERYL_ATK_INIT, FRACTERYL_DEF_INIT,
  EIGENSTEIN_HP_INIT, EIGENSTEIN_ATK_INIT, EIGENSTEIN_DEF_INIT,
} from '../../render/rpg/rpg-enemy-constants';
import {
  LASER_HP_INIT, LASER_ATK_INIT, LASER_DEF_INIT,
  SAPPHIRE_HP_INIT, SAPPHIRE_ATK_INIT, SAPPHIRE_DEF_INIT,
} from '../../render/rpg/rpg-constants';

// ─── Types ────────────────────────────────────────────────────────

export interface RpgEnemiesTabPane {
  element: HTMLElement;
  update(rpgState: RpgSimState | null, isDevMode: boolean): void;
}

// ─── Icon canvas size ─────────────────────────────────────────────

const ICON_SIZE = 40;

// ─── Enemy catalog ────────────────────────────────────────────────

type EnemyShape = 'square' | 'diamond' | 'circle';

interface EnemyCatalogEntry {
  id: string;
  name: string;
  color: string;
  glowColor: string;
  size: number;
  hp: number;
  atk: number;
  def: number;
  /** Wave number at which this enemy first appears. */
  firstWave: number;
  description: string;
  shape: EnemyShape;
  /** Optional second ring/aura radius for special visual effects. */
  auraRadius?: number;
  /** Show a shield circle around the enemy in the icon. */
  hasShield?: boolean;
  shieldRadius?: number;
  shieldColor?: string;
}

const ENEMY_CATALOG: readonly EnemyCatalogEntry[] = [
  {
    id: 'laser',
    name: 'Laser Striker',
    color: LASER_ENEMY_COLOR,
    glowColor: LASER_ENEMY_GLOW,
    size: LASER_ENEMY_SIZE,
    hp: LASER_HP_INIT, atk: LASER_ATK_INIT, def: LASER_DEF_INIT,
    firstWave: 1,
    description: 'A nimble red assailant that dashes straight through the player, leaving a glowing curved trail.',
    shape: 'square',
  },
  {
    id: 'quartz',
    name: 'Quartz Orbiter',
    color: QUARTZ_ENEMY_COLOR,
    glowColor: QUARTZ_ENEMY_GLOW,
    size: QUARTZ_ENEMY_SIZE,
    hp: QUARTZ_HP_INIT, atk: QUARTZ_ATK_INIT, def: QUARTZ_DEF_INIT,
    firstWave: 1,
    description: 'A pale crystal that strafe-orbits the player and periodically fires sharp spikes.',
    shape: 'diamond',
  },
  {
    id: 'sapphire',
    name: 'Sapphire Guard',
    color: SAPPHIRE_ENEMY_COLOR,
    glowColor: SAPPHIRE_ENEMY_GLOW,
    size: SAPPHIRE_ENEMY_SIZE,
    hp: SAPPHIRE_HP_INIT, atk: SAPPHIRE_ATK_INIT, def: SAPPHIRE_DEF_INIT,
    firstWave: 6,
    description: 'A shielded blue sentry that fires homing missiles while staying behind its protective barrier.',
    shape: 'square',
    hasShield: true,
    shieldRadius: SAPPHIRE_SHIELD_RADIUS,
    shieldColor: SAPPHIRE_ENEMY_GLOW,
  },
  {
    id: 'emerald',
    name: 'Emerald Blinker',
    color: EMERALD_ENEMY_COLOR,
    glowColor: EMERALD_ENEMY_GLOW,
    size: EMERALD_ENEMY_SIZE,
    hp: EMERALD_HP_INIT, atk: EMERALD_ATK_INIT, def: EMERALD_DEF_INIT,
    firstWave: 9,
    description: 'A teleporting green sprite that charges briefly then blinks directly onto the player.',
    shape: 'square',
  },
  {
    id: 'ruby',
    name: 'Ruby Patroller',
    color: RUBY_ENEMY_COLOR,
    glowColor: RUBY_ENEMY_GLOW,
    size: RUBY_ENEMY_SIZE,
    hp: RUBY_HP_INIT, atk: RUBY_ATK_INIT, def: RUBY_DEF_INIT,
    firstWave: 10,
    description: 'A fast crimson marauder that closes range quickly and unleashes rapid bursts of bolts.',
    shape: 'square',
  },
  {
    id: 'amber',
    name: 'Amber Gunner',
    color: AMBER_ENEMY_COLOR,
    glowColor: AMBER_ENEMY_GLOW,
    size: AMBER_ENEMY_SIZE,
    hp: AMBER_HP_INIT, atk: AMBER_ATK_INIT, def: AMBER_DEF_INIT,
    firstWave: 12,
    description: 'A stocky orange artillery unit that fires a spread of three homing shards in a fan.',
    shape: 'square',
  },
  {
    id: 'void',
    name: 'Void Bruiser',
    color: VOID_ENEMY_COLOR,
    glowColor: VOID_ENEMY_GLOW,
    size: VOID_ENEMY_SIZE,
    hp: VOID_HP_INIT, atk: VOID_ATK_INIT, def: VOID_DEF_INIT,
    firstWave: 15,
    description: 'A massive purple predator that relentlessly pursues the player and deals heavy contact damage.',
    shape: 'square',
    auraRadius: VOID_AURA_RADIUS,
  },
  {
    id: 'sunstone',
    name: 'Sunstone Orbiter',
    color: SUNSTONE_ENEMY_COLOR,
    glowColor: SUNSTONE_ENEMY_GLOW,
    size: SUNSTONE_ENEMY_SIZE,
    hp: SUNSTONE_HP_INIT, atk: SUNSTONE_ATK_INIT, def: SUNSTONE_DEF_INIT,
    firstWave: 20,
    description: 'A blazing orange planet-like enemy that circles at range and emits damaging area pulses.',
    shape: 'circle',
  },
  {
    id: 'citrine',
    name: 'Citrine Chaser',
    color: CITRINE_ENEMY_COLOR,
    glowColor: CITRINE_ENEMY_GLOW,
    size: CITRINE_ENEMY_SIZE,
    hp: CITRINE_HP_INIT, atk: CITRINE_ATK_INIT, def: CITRINE_DEF_INIT,
    firstWave: 30,
    description: 'A swift golden tracker that patrols at high speed and launches homing bolts that curve toward the player.',
    shape: 'square',
  },
  {
    id: 'iolite',
    name: 'Iolite Colossus',
    color: IOLITE_ENEMY_COLOR,
    glowColor: IOLITE_ENEMY_GLOW,
    size: IOLITE_ENEMY_SIZE,
    hp: IOLITE_HP_INIT, atk: IOLITE_ATK_INIT, def: IOLITE_DEF_INIT,
    firstWave: 40,
    description: 'A heavily armored indigo titan that fires a spread of five beams in a wide arc.',
    shape: 'circle',
  },
  {
    id: 'amethyst',
    name: 'Amethyst Shielder',
    color: AMETHYST_ENEMY_COLOR,
    glowColor: AMETHYST_ENEMY_GLOW,
    size: AMETHYST_ENEMY_SIZE,
    hp: AMETHYST_HP_INIT, atk: AMETHYST_ATK_INIT, def: AMETHYST_DEF_INIT,
    firstWave: 50,
    description: 'A crystal-shielded violet tank that periodically shatters its own barrier into a burst of shards.',
    shape: 'circle',
    hasShield: true,
    shieldRadius: AMETHYST_ENEMY_SIZE * 2.4,
    shieldColor: AMETHYST_ENEMY_GLOW,
  },
  {
    id: 'diamond',
    name: 'Diamond Phase-Shifter',
    color: DIAMOND_ENEMY_COLOR,
    glowColor: DIAMOND_ENEMY_GLOW,
    size: DIAMOND_ENEMY_SIZE,
    hp: DIAMOND_HP_INIT, atk: DIAMOND_ATK_INIT, def: DIAMOND_DEF_INIT,
    firstWave: 60,
    description: 'A prismatic phase-shifter that cycles between invulnerable and vulnerable states while firing orbiting shards.',
    shape: 'diamond',
  },
  {
    id: 'nullstone',
    name: 'Nullstone Gravity Well',
    color: NULLSTONE_ENEMY_COLOR,
    glowColor: NULLSTONE_ENEMY_GLOW,
    size: NULLSTONE_ENEMY_SIZE,
    hp: NULLSTONE_HP_INIT, atk: NULLSTONE_ATK_INIT, def: NULLSTONE_DEF_INIT,
    firstWave: 70,
    description: 'A dark gravitational horror that pulls the player into its core and launches void tendrils.',
    shape: 'circle',
    auraRadius: NULLSTONE_GRAVITY_RADIUS * 0.22,
  },
  {
    id: 'fracteryl',
    name: 'Fracteryl Manifestation',
    color: FRACTERYL_ENEMY_COLOR,
    glowColor: FRACTERYL_ENEMY_GLOW,
    size: FRACTERYL_ENEMY_SIZE,
    hp: FRACTERYL_HP_INIT, atk: FRACTERYL_ATK_INIT, def: FRACTERYL_DEF_INIT,
    firstWave: 74,
    description: 'A fractal purple entity that explodes into recursive shard storms that themselves split on impact.',
    shape: 'diamond',
  },
  {
    id: 'eigenstein',
    name: 'Eigenstein Entity',
    color: EIGENSTEIN_ENEMY_COLOR,
    glowColor: EIGENSTEIN_ENEMY_GLOW,
    size: EIGENSTEIN_ENEMY_SIZE,
    hp: EIGENSTEIN_HP_INIT, atk: EIGENSTEIN_ATK_INIT, def: EIGENSTEIN_DEF_INIT,
    firstWave: 85,
    description: 'A transcendent cyan construct that charges a sweeping beam of pure mathematics before firing.',
    shape: 'circle',
  },
] as const;

// ─── Boss descriptions ─────────────────────────────────────────────

const BOSS_DESCRIPTIONS: readonly string[] = [
  '', // index 0 unused
  'The crystalline sovereign commands orbiting quartz shards and turns the arena into a lethal prism field.',
  'The Ruby King charges with blazing speed, slashing through defences with devastating bolt salvos.',
  'The Sunstone Herald radiates scorching pulses across the battlefield and summons orbital fire rings.',
  'The Citrine Weaver spins a web of homing bolts that tighten relentlessly around the player.',
  'The Iolite Colossus unleashes a full-spectrum beam spread that fills every angle with lethal energy.',
  'The Amethyst Breaker shatters its own titanic shield repeatedly, flooding the arena with crystal shrapnel.',
  'The Diamond Eternal flickers between phases of absolute invulnerability and furious prismatic assault.',
  'The Nullstone Devourer warps gravity itself, dragging the player into void tendrils from all directions.',
  'The Void Nexus tears open portals across the arena and channels streams of antimatter at the player.',
  'The Equation Incarnate is a living mathematical singularity whose attack patterns defy prediction.',
  'The Fracteryl Manifestation spawns fractal shard storms that recursively multiply across the arena.',
  'The Eigenstein Entity focuses infinite eigenvalues into a sweeping beam that rewrites the laws of physics.',
];

// ─── Icon drawing ─────────────────────────────────────────────────

function drawEnemyIcon(canvas: HTMLCanvasElement, entry: EnemyCatalogEntry): void {
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

  // Glow halo
  ctx.save();
  ctx.shadowBlur = s * 3.5;
  ctx.shadowColor = entry.glowColor;
  ctx.fillStyle = entry.color;

  if (entry.shape === 'circle') {
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

  // Icon canvas
  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  canvas.style.cssText = 'flex-shrink:0;border-radius:4px;background:rgba(0,0,0,0.35);';
  if (!isLocked || isDevMode) {
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
