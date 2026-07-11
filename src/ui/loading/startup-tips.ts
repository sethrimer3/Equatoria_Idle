export interface StartupTip { id: string; text: string; platforms?: readonly ('web' | 'desktop' | 'touch')[] }

export const STARTUP_TIPS: readonly StartupTip[] = [
  { id: 'generator-double-tap', text: 'Double-tap a generator to pull all matching motes toward it.' },
  { id: 'mote-drag', text: 'Drag motes around the field; matching motes combine when they meet.' },
  { id: 'forge-drag', text: 'Drag a larger mote onto the forge to convert it into refined progress.' },
  { id: 'loom-capture', text: 'Guide a mote into its matching loom to convert it into the next tier.' },
  { id: 'skill-tree-pan', text: 'Drag the Skill Tree background to explore its branches.' },
  { id: 'zone-select', text: 'Tap the RPG zone name to open the zone map and change destinations.' },
  { id: 'auto-move', text: 'Auto-move can steer your RPG character toward a selected destination.' },
  { id: 'weapon-slots', text: 'Equip purchased weapons into rack slots to use them in combat.' },
  { id: 'lens-attach', text: 'Attach a lens to a crafted weapon to add its combat effects.' },
  { id: 'weave-slots', text: 'Equip crafted weaves in loadout slots to combine their passive bonuses.' },
  { id: 'elite-drops', text: 'Elites can drop equipment; bosses have stronger lens and weave rewards.' },
  { id: 'boss-speed', text: 'Previously cleared bosses can be challenged at different speed settings.' },
  { id: 'touch-controls', text: 'Touch controls support the same tapping and mote-dragging actions as a mouse.' },
];

export interface StartupTipDeckState { order: string[]; cursor: number; lastShownId?: string }

function shuffle(ids: readonly string[], rng: () => number): string[] {
  const result = [...ids];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function selectStartupTip(
  state: StartupTipDeckState,
  tips: readonly StartupTip[] = STARTUP_TIPS,
  rng: () => number = Math.random,
): StartupTip | null {
  const byId = new Map(tips.map(tip => [tip.id, tip]));
  const eligibleIds = tips.map(tip => tip.id);
  const validRemaining = state.order.slice(Math.max(0, state.cursor)).filter(id => byId.has(id));
  const missing = eligibleIds.filter(id => !validRemaining.includes(id));
  state.order = [...validRemaining, ...shuffle(missing, rng)];
  state.cursor = 0;
  if (state.order.length === 0) return null;
  if (validRemaining.length === 0 && state.order.length > 1 && state.order[0] === state.lastShownId) {
    [state.order[0], state.order[1]] = [state.order[1], state.order[0]];
  }
  const id = state.order[state.cursor++];
  state.lastShownId = id;
  return byId.get(id) ?? null;
}
