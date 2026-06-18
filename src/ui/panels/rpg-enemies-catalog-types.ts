export type EnemyShape = 'square' | 'diamond' | 'circle' | 'polygon';

/** Broad grouping used for display and validation. */
export type EnemyCategory = 'standard' | 'elite' | 'aliven' | 'procedural' | 'boss';

/** RPG zone used by the encyclopedia's local filter tabs. */
export type EnemyZoneId = 'euhedral' | 'impetus' | 'caustics' | 'verdure' | 'horizon';

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
  /** Zone assignment for encyclopedia filtering. Unassigned entries remain visible in ALL. */
  zone?: EnemyZoneId;
  /** Number of polygon sides — required when shape === 'polygon'. Range: 3 (triangle) to 10 (decagon). */
  sides?: number;
  /** Optional second ring/aura radius for special visual effects. */
  auraRadius?: number;
  /** Show a shield circle around the enemy in the icon. */
  hasShield?: boolean;
  shieldRadius?: number;
  shieldColor?: string;
  /**
   * Filename of the dedicated icon PNG within the zone's enemyIcons subfolder.
   * When absent the codex falls back to fallBack_icon.png.
   */
  iconFile?: string;
  /**
   * Sub-zone within the Horizon zone. Required for Horizon enemies when
   * iconFile is set, so the correct subfolder path can be resolved.
   */
  horizonSubZone?: 'Zenith' | 'Nadir' | 'True';
}
