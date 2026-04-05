/** Canonical tier identifiers, ordered by unlock progression. */
export type TierId =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'prismatic'   // secret tier 8
  | 'void';       // secret tier 9

/** Full tier definition — single source of truth for colours, names, order. */
export interface TierDefinition {
  readonly id: TierId;
  readonly displayName: string;
  readonly color: string;          // CSS colour value
  readonly glowColor: string;      // lighter variant for particles / glow
  readonly unlockOrder: number;     // 0-based
  readonly isSecret: boolean;
}

/** All tiers in canonical order. */
export const TIERS: readonly TierDefinition[] = [
  { id: 'red',       displayName: 'Red',       color: '#e74c3c', glowColor: '#ff6b6b', unlockOrder: 0, isSecret: false },
  { id: 'orange',    displayName: 'Orange',    color: '#e67e22', glowColor: '#f5a623', unlockOrder: 1, isSecret: false },
  { id: 'yellow',    displayName: 'Yellow',    color: '#f1c40f', glowColor: '#ffe066', unlockOrder: 2, isSecret: false },
  { id: 'green',     displayName: 'Green',     color: '#2ecc71', glowColor: '#69db7c', unlockOrder: 3, isSecret: false },
  { id: 'blue',      displayName: 'Blue',      color: '#3498db', glowColor: '#74c0fc', unlockOrder: 4, isSecret: false },
  { id: 'indigo',    displayName: 'Indigo',    color: '#8e44ad', glowColor: '#b07cd8', unlockOrder: 5, isSecret: false },
  { id: 'violet',    displayName: 'Violet',    color: '#9b59b6', glowColor: '#c49bde', unlockOrder: 6, isSecret: false },
  { id: 'prismatic', displayName: 'Prismatic', color: '#ecf0f1', glowColor: '#ffffff', unlockOrder: 7, isSecret: true  },
  { id: 'void',      displayName: 'Void',      color: '#2c3e50', glowColor: '#4a6274', unlockOrder: 8, isSecret: true  },
] as const;

/** Quick lookup by id. */
export const TIER_BY_ID: ReadonlyMap<TierId, TierDefinition> = new Map(
  TIERS.map(t => [t.id, t]),
);

/** Visible (non-secret) tiers. */
export const VISIBLE_TIERS: readonly TierDefinition[] = TIERS.filter(t => !t.isSecret);

/** Number of visible tiers (7). */
export const VISIBLE_TIER_COUNT = VISIBLE_TIERS.length;
