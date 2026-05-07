/**
 * rpg-enemies-catalog.ts — Static bestiary data for the RPG enemies tab.
 *
 * Contains the enemy catalog entries (ENEMY_CATALOG) and boss descriptions
 * (BOSS_DESCRIPTIONS) extracted from rpg-enemies-tab.ts to keep the UI
 * module focused on rendering rather than data.
 */

import {
  LASER_ENEMY_SIZE, LASER_ENEMY_COLOR, LASER_ENEMY_GLOW,
  SAPPHIRE_ENEMY_SIZE, SAPPHIRE_ENEMY_COLOR, SAPPHIRE_ENEMY_GLOW, SAPPHIRE_SHIELD_RADIUS,
  LASER_HP_INIT, LASER_ATK_INIT, LASER_DEF_INIT,
  SAPPHIRE_HP_INIT, SAPPHIRE_ATK_INIT, SAPPHIRE_DEF_INIT,
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

// ─── Types ────────────────────────────────────────────────────────

export type EnemyShape = 'square' | 'diamond' | 'circle';

export interface EnemyCatalogEntry {
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

// ─── Enemy catalog ────────────────────────────────────────────────

export const ENEMY_CATALOG: readonly EnemyCatalogEntry[] = [
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

export const BOSS_DESCRIPTIONS: readonly string[] = [
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
