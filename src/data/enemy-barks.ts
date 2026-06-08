/**
 * enemy-barks.ts — Centralized bark dialogue data for enemy speech bubbles.
 *
 * HOW TO ADD DIALOGUE FOR A NEW ENEMY TYPE:
 *   1. Find the enemy's stable type identifier — it's the `kind` field on the enemy
 *      object (e.g. 'proc_dustwisp', 'laser', 'horizon_pentagon', 'elite_quartz').
 *      If unsure, search rpg-enemy-types.ts or rpg-procedural-types.ts.
 *   2. Add an entry to BARK_TABLE.enemies keyed by that identifier.
 *   3. For each bark event you want to customize, add:
 *        - A string array for generic lines:
 *            TOOK_MAJOR_DAMAGE: ["Dispersing!", "Not yet!"]
 *        - A status-keyed map for status-specific lines:
 *            STATUS_WEAK: { burning: ["It burns!", "Charring!"], chilled: ["Too cold!"] }
 *      Events not listed in the enemy entry fall back to BARK_TABLE.defaults automatically.
 *   4. That's it — no other files need to be changed.
 *
 * LOOKUP ORDER (most to least specific):
 *   1. Enemy-specific, status-specific  (enemies[kind][event] is a map, statusType matches)
 *   2. Enemy-specific, generic          (enemies[kind][event] is a string array)
 *   3. Default, status-specific         (defaults[event] is a map, statusType matches)
 *   4. Default, generic                 (defaults[event] is a string array)
 *   5. null → no bark fires
 *
 * STATUS KEY STRINGS come from EnemyStatusKey in sim/rpg/enemy-status-effects.ts:
 *   'abraded' | 'refracted' | 'burning' | 'radiant' | 'poisoned' | 'chilled' |
 *   'timeWarped' | 'echoMarked' | 'cracked' | 'gravitized' | 'fractalWound' |
 *   'riftScarred' | 'frozen'
 */

// ── Bark event types ──────────────────────────────────────────────────────────

export type BarkEventType =
  | 'NO_DAMAGE_FOR_A_WHILE'
  | 'BLOCKED_ATTACK'
  | 'TOOK_SMALL_DAMAGE'
  | 'TOOK_MAJOR_DAMAGE'
  | 'STATUS_RESISTED'
  | 'STATUS_WEAK'
  | 'STATUS_NEUTRAL'
  | 'DEALT_MAJOR_PLAYER_DAMAGE'
  | 'KILLED_PLAYER'
  | 'PLAYER_BLOCKED_DAMAGE'
  | 'DEALT_TINY_PLAYER_DAMAGE';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Generic string array, OR a map from status key → lines for status-specific events. */
export type BarkLineEntry = string[] | Record<string, string[]>;

export interface EnemyBarkTable {
  defaults: Partial<Record<BarkEventType, BarkLineEntry>>;
  enemies:  Record<string, Partial<Record<BarkEventType, BarkLineEntry>>>;
}

/** Context passed to getEnemyBarkLine to enable narrower lookups. */
export interface BarkContext {
  /** Status key that triggered the bark (e.g. 'burning', 'frozen'). */
  statusType?:   string;
  damageAmount?: number;
  damageRatio?:  number;
  zoneId?:       string;
  isElite?:      boolean;
}

// ── Bark table ────────────────────────────────────────────────────────────────

export const BARK_TABLE: EnemyBarkTable = {

  // Fallback lines used when no enemy-specific entry exists.
  defaults: {
    NO_DAMAGE_FOR_A_WHILE:     ['Missed again.', 'Still standing.', 'Try harder.'],
    BLOCKED_ATTACK:            ['Denied.', 'Too weak.', 'Not enough.'],
    TOOK_SMALL_DAMAGE:         ['Was that it?', 'Barely felt it.', 'A scratch.'],
    TOOK_MAJOR_DAMAGE:         ['That hurt!', 'Impossible...', 'Cracked!'],
    STATUS_RESISTED:           ['I resist that.', 'No effect.', 'Wrong element.'],
    STATUS_WEAK:               ['My weakness!', 'Not that!', 'It burns!'],
    STATUS_NEUTRAL:            ['Annoying.', 'I feel it.', 'Tch.'],
    DEALT_MAJOR_PLAYER_DAMAGE: ['Direct hit.', 'Break.', 'Good hit.'],
    KILLED_PLAYER:             ['Fall.', 'Ended.', 'Silence.'],
    PLAYER_BLOCKED_DAMAGE:     ['A shield?', 'Blocked?', 'Stand still.'],
    DEALT_TINY_PLAYER_DAMAGE:  ['Hmph.', 'No...', 'Too guarded.'],
  },

  // Per-enemy overrides. Key is the enemy's `kind` string.
  enemies: {

    proc_dustwisp: {
      NO_DAMAGE_FOR_A_WHILE:     ['You cannot catch dust.', 'Drift...', 'I am everywhere.'],
      TOOK_MAJOR_DAMAGE:         ['Dispersing!', 'Not yet!', 'Still here...'],
      TOOK_SMALL_DAMAGE:         ['Dust endures.', 'Barely a stir.'],
      KILLED_PLAYER:             ['Scatter.', 'Dust remains.'],
      STATUS_WEAK: {
        frozen:    ['Too cold!', 'Movement... failing...'],
        chilled:   ['Slowing...', 'The cold...'],
      },
      STATUS_RESISTED: {
        burning:   ['I am already dust.', 'Fire feeds me.'],
      },
    },

    proc_jellyfish: {
      NO_DAMAGE_FOR_A_WHILE:     ['Float...', 'Pulse.', 'Drift and sting.'],
      TOOK_MAJOR_DAMAGE:         ['Ripped!', 'Membrane torn.'],
      TOOK_SMALL_DAMAGE:         ['Felt nothing.', 'Jelly absorbs.'],
      KILLED_PLAYER:             ['Pulse complete.', 'Consumed.'],
      DEALT_MAJOR_PLAYER_DAMAGE: ['Stung.', 'Venom flows.'],
    },

    proc_clothghost: {
      NO_DAMAGE_FOR_A_WHILE:     ['Fading...', 'I pass through.'],
      BLOCKED_ATTACK:            ['Untouchable.', 'Through cloth.'],
      TOOK_MAJOR_DAMAGE:         ['Torn!', 'My fabric...!'],
      KILLED_PLAYER:             ['Wrapped.', 'Silence.'],
      STATUS_WEAK: {
        burning:   ['It burns!', 'My cloth ignites!'],
        radiant:   ['Too much light!', 'Exposed!'],
      },
      STATUS_RESISTED: {
        frozen:    ['Cold cannot hold me.'],
        chilled:   ['I have no warmth to lose.'],
      },
    },

    proc_shadowhand: {
      NO_DAMAGE_FOR_A_WHILE:     ['Reach.', 'Nowhere to run.', 'I extend.'],
      TOOK_MAJOR_DAMAGE:         ['Severed?!', 'Still attached.'],
      TOOK_SMALL_DAMAGE:         ['Shadows do not bleed.'],
      DEALT_MAJOR_PLAYER_DAMAGE: ['Grasp.', 'Crushing.'],
      KILLED_PLAYER:             ['Claimed.', 'Into shadow.'],
      STATUS_RESISTED: {
        radiant:   ['Shadows absorb light.', 'Darkness holds.'],
      },
    },

    proc_eyestalk: {
      NO_DAMAGE_FOR_A_WHILE:     ['Observed.', 'I watch.', 'Every movement noted.'],
      BLOCKED_ATTACK:            ['Predicted.', 'I saw that coming.'],
      TOOK_MAJOR_DAMAGE:         ['My eye!', 'Vision... blurring...'],
      KILLED_PLAYER:             ['Witnessed.', 'Filed.'],
    },

    proc_moteswarm: {
      NO_DAMAGE_FOR_A_WHILE:     ['We scatter.', 'You cannot hit us all.', 'Swarm.'],
      TOOK_MAJOR_DAMAGE:         ['Reduced.', 'Fewer now.'],
      TOOK_SMALL_DAMAGE:         ['One less mote.', 'Negligible.'],
      KILLED_PLAYER:             ['Consumed.', 'Motes devour.'],
      STATUS_WEAK: {
        frozen:    ['Slowing down...', 'Freezing!'],
        chilled:   ['Dispersal... slowing...'],
      },
    },

    proc_lanternmoth: {
      NO_DAMAGE_FOR_A_WHILE:     ['You chase the light.', 'Glow and flee.'],
      TOOK_MAJOR_DAMAGE:         ['Wing singed!', 'Still lit.'],
      KILLED_PLAYER:             ['Drawn in.', 'The flame consumes.'],
    },

    proc_ribbonworm: {
      NO_DAMAGE_FOR_A_WHILE:     ['Coil.', 'Endlessly.'],
      TOOK_MAJOR_DAMAGE:         ['Cut!', 'I will regrow.'],
      TOOK_SMALL_DAMAGE:         ['Ribbon tears heal.'],
      KILLED_PLAYER:             ['Wrapped tight.', 'Ensnared.'],
    },

    proc_spidercrawler: {
      NO_DAMAGE_FOR_A_WHILE:     ['Eight eyes on you.', 'Patience, little prey.'],
      BLOCKED_ATTACK:            ['Dodge is easy.', 'Too slow.'],
      TOOK_MAJOR_DAMAGE:         ['Three legs!', 'Still crawling.'],
      KILLED_PLAYER:             ['Web complete.', 'Bundled.'],
    },

    proc_plantturret: {
      NO_DAMAGE_FOR_A_WHILE:     ['Root deep.', 'I do not move.'],
      BLOCKED_ATTACK:            ['Bark deflects.', 'Thick hide.'],
      TOOK_MAJOR_DAMAGE:         ['Splintered!', 'Bark stripped.'],
      KILLED_PLAYER:             ['Fertilizer.', 'Growth.'],
    },

    proc_gearinsect: {
      NO_DAMAGE_FOR_A_WHILE:     ['Calibrated.', 'Spinning.', 'No rust here.'],
      TOOK_MAJOR_DAMAGE:         ['Gears jammed!', 'Structural damage.'],
      KILLED_PLAYER:             ['Processed.', 'Efficient.'],
      STATUS_WEAK: {
        abraded:   ['Jamming!', 'Friction!', 'Grinding to a halt...'],
      },
      STATUS_RESISTED: {
        burning:   ['Metal does not burn.'],
        chilled:   ['Cold only sharpens gears.'],
      },
    },

    proc_sandfish: {
      NO_DAMAGE_FOR_A_WHILE:     ['Under the sand.', 'You cannot see me.'],
      TOOK_MAJOR_DAMAGE:         ['Sand scattered!', 'Exposed!'],
      KILLED_PLAYER:             ['Submerged.', 'Buried.'],
    },

    horizon_pentagon: {
      NO_DAMAGE_FOR_A_WHILE:     ['Geometric perfection.', 'Five sides. Infinite patience.'],
      BLOCKED_ATTACK:            ['Angle deflected.', 'Geometry holds.'],
      TOOK_MAJOR_DAMAGE:         ['Vertex cracked!', 'Shape... distorted...'],
      DEALT_MAJOR_PLAYER_DAMAGE: ['Calculated.', 'Optimal angle.'],
      KILLED_PLAYER:             ['Theorem proven.', 'Solved.'],
    },

    stardust: {
      NO_DAMAGE_FOR_A_WHILE:     ['Shimmer.', 'Prismatic.'],
      TOOK_MAJOR_DAMAGE:         ['Scattered!', 'Dispersing spectrum.'],
      KILLED_PLAYER:             ['Dust to dust.', 'Light consumes.'],
      STATUS_RESISTED: {
        burning:   ['Already burning.', 'Stardust is heat.'],
        frozen:    ['Cold space? I am space.'],
        radiant:   ['I am radiance.'],
      },
    },

    laser: {
      BLOCKED_ATTACK:            ['Reflected?', 'Your shield...'],
      TOOK_MAJOR_DAMAGE:         ['Beam interrupted!', 'Power failing.'],
      KILLED_PLAYER:             ['Lased.', 'Critical hit.'],
    },

    sapphire: {
      NO_DAMAGE_FOR_A_WHILE:     ['Crystal composure.', 'Focus.'],
      TOOK_MAJOR_DAMAGE:         ['Facet shattered!', 'Compromised!'],
      KILLED_PLAYER:             ['Crystallized.', 'Preserved.'],
      STATUS_WEAK: {
        abraded:   ['Scratched!', 'The facets!'],
      },
    },

    elite_quartz: {
      NO_DAMAGE_FOR_A_WHILE:     ['Crystalline patience.', 'I can wait forever.'],
      TOOK_MAJOR_DAMAGE:         ['A fracture?!', 'This formation holds.'],
      KILLED_PLAYER:             ['Shattered.', 'Quartz endures.'],
    },

    elite_ruby: {
      NO_DAMAGE_FOR_A_WHILE:     ['Burning bright.', 'Come closer.'],
      TOOK_MAJOR_DAMAGE:         ['Cracked gem!', 'Still aflame.'],
      KILLED_PLAYER:             ['Scorched.', 'Ruby fire claims all.'],
    },

    elite_diamond: {
      NO_DAMAGE_FOR_A_WHILE:     ['Unbreakable.', 'Your patience will fail first.'],
      BLOCKED_ATTACK:            ['Diamond deflects.', 'Futile.'],
      TOOK_MAJOR_DAMAGE:         ['Impossible!', 'A chip...'],
      KILLED_PLAYER:             ['Cleaved.', 'Precision.'],
    },

  },
};

// ── Lookup ────────────────────────────────────────────────────────────────────

function _pick(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)]!;
}

function _resolveEntry(entry: BarkLineEntry, statusType?: string): string | null {
  if (Array.isArray(entry)) return _pick(entry);
  // Status map: only resolves when a matching status type is present.
  if (statusType) {
    const lines = entry[statusType];
    if (lines && lines.length > 0) return _pick(lines);
  }
  return null;
}

/**
 * Returns a bark line for the given enemy and event, or null if none applies.
 *
 * Lookup order:
 *   1. Enemy-specific status-specific  (enemies[kind][event] is a map & statusType matches)
 *   2. Enemy-specific generic          (enemies[kind][event] is an array)
 *   3. Default status-specific         (defaults[event] is a map & statusType matches)
 *   4. Default generic                 (defaults[event] is an array)
 *   5. null
 */
export function getEnemyBarkLine(
  enemy:     { kind?: string },
  eventType: BarkEventType,
  context?:  BarkContext,
): string | null {
  const statusType = context?.statusType;

  // Steps 1+2: enemy-specific (try the enemy's own entry first)
  const kind = enemy.kind;
  if (kind) {
    const enemyEntry = BARK_TABLE.enemies[kind]?.[eventType];
    if (enemyEntry !== undefined) {
      const result = _resolveEntry(enemyEntry, statusType);
      if (result !== null) return result;
      // Entry exists but didn't match (status map with no matching statusType).
      // Fall through to defaults rather than returning null prematurely.
    }
  }

  // Steps 3+4: defaults
  const defEntry = BARK_TABLE.defaults[eventType];
  if (defEntry !== undefined) {
    const result = _resolveEntry(defEntry, statusType);
    if (result !== null) return result;
  }

  // Step 5: no bark
  return null;
}
