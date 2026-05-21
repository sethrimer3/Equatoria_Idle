/** Canonical tier identifiers, ordered by unlock progression. */
export type TierId =
  | 'sand'
  | 'quartz'
  | 'ruby'
  | 'sunstone'
  | 'citrine'
  | 'emerald'
  | 'sapphire'
  | 'iolite'
  | 'amethyst'
  | 'diamond'
  | 'nullstone'
  | 'fracteryl'
  | 'eigenstein';

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
  { id: 'sand',      displayName: 'Sand',      color: '#ffd764', glowColor: '#ffe599', unlockOrder: 0,  isSecret: false },
  { id: 'quartz',    displayName: 'Quartz',    color: '#f5f0eb', glowColor: '#faf8f5', unlockOrder: 1,  isSecret: false },
  { id: 'ruby',      displayName: 'Ruby',      color: '#dc3232', glowColor: '#ff6b6b', unlockOrder: 2,  isSecret: false },
  { id: 'sunstone',  displayName: 'Sunstone',  color: '#ff8c3c', glowColor: '#ffb366', unlockOrder: 3,  isSecret: false },
  { id: 'citrine',   displayName: 'Citrine',   color: '#e6c850', glowColor: '#f0d870', unlockOrder: 4,  isSecret: false },
  { id: 'emerald',   displayName: 'Emerald',   color: '#50b464', glowColor: '#69db7c', unlockOrder: 5,  isSecret: false },
  { id: 'sapphire',  displayName: 'Sapphire',  color: '#3c78c8', glowColor: '#74c0fc', unlockOrder: 6,  isSecret: false },
  { id: 'iolite',    displayName: 'Iolite',    color: '#6464b4', glowColor: '#8888cc', unlockOrder: 7,  isSecret: false },
  { id: 'amethyst',  displayName: 'Amethyst',  color: '#b464c8', glowColor: '#d088e0', unlockOrder: 8,  isSecret: false },
  { id: 'diamond',   displayName: 'Diamond',   color: '#f0f5fa', glowColor: '#ffffff', unlockOrder: 9,  isSecret: false },
  { id: 'nullstone', displayName: 'Nullstone', color: '#1e1e28', glowColor: '#9664c8', unlockOrder: 10, isSecret: false },
  { id: 'fracteryl', displayName: 'Fracteryl', color: '#7A2CFF', glowColor: '#D6A3FF', unlockOrder: 11, isSecret: false },
  { id: 'eigenstein', displayName: 'Eigenstein', color: '#A34728', glowColor: '#E38A4A', unlockOrder: 12, isSecret: false },
] as const;

/** Quick lookup by id. */
export const TIER_BY_ID: ReadonlyMap<TierId, TierDefinition> = new Map(
  TIERS.map(t => [t.id, t]),
);

/** Visible (non-secret) tiers. */
export const VISIBLE_TIERS: readonly TierDefinition[] = TIERS.filter(t => !t.isSecret);

/** Number of visible (non-secret) tiers — derived at runtime, currently 13. */
export const VISIBLE_TIER_COUNT = VISIBLE_TIERS.length;
