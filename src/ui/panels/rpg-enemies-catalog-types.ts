export type EnemyShape = 'square' | 'diamond' | 'circle' | 'polygon';

/** Broad grouping used for display and validation. */
export type EnemyCategory = 'standard' | 'elite' | 'aliven' | 'procedural' | 'boss';

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
  /** Broad category for display/filtering. */
  category?: EnemyCategory;
  /** Number of polygon sides — required when shape === 'polygon'. Range: 3 (triangle) to 10 (decagon). */
  sides?: number;
  /** Optional second ring/aura radius for special visual effects. */
  auraRadius?: number;
  /** Show a shield circle around the enemy in the icon. */
  hasShield?: boolean;
  shieldRadius?: number;
  shieldColor?: string;
}
