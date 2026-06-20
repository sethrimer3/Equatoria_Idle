/**
 * weave-enemy-debuffs.ts — Ephemeral per-enemy debuff state driven by weave procs.
 *
 * Separate from the lens status combo system intentionally: weave debuffs do not
 * count as poison/burn/frost/rift/etc. and do not trigger status combos.
 * This avoids weave procs accidentally feeding combo chains designed for lenses.
 *
 * Current debuffs:
 *   Lingering Hex (weave_lingering_hex) — enemy takes +valuePct% damage for durationMs.
 *
 * Storage: WeakMap (auto-GC on enemy death) + companion Set for iteration during tick.
 * These debuffs are never saved or loaded — they are ephemeral combat state.
 */

// ─── Lingering Hex ────────────────────────────────────────────────────────────

interface LingeringHexDebuff {
  valuePct: number;
  remainingMs: number;
}

/** WeakMap ensures debuff entries are GC'd when the enemy object is collected. */
const _hexRegistry = new WeakMap<object, LingeringHexDebuff>();
/** Companion Set for deterministic iteration during tick. */
const _hexEnemies = new Set<object>();

/**
 * Applies or refreshes a Lingering Hex debuff on an enemy.
 * If a debuff already exists for this enemy: refreshes duration and keeps the
 * stronger valuePct. Does not create duplicate entries.
 */
export function applyLingeringHex(enemy: object, valuePct: number, durationMs: number): void {
  const existing = _hexRegistry.get(enemy);
  if (existing) {
    existing.remainingMs = durationMs;
    if (valuePct > existing.valuePct) existing.valuePct = valuePct;
  } else {
    _hexRegistry.set(enemy, { valuePct, remainingMs: durationMs });
    _hexEnemies.add(enemy);
  }
}

/**
 * Returns the incoming-damage multiplier for Lingering Hex on this enemy.
 * Returns 1 (no effect) if the enemy has no active hex or the hex has expired.
 * Interpretation: multiplier = 1 + valuePct / 100.
 */
export function getLingeringHexDamageMult(enemy: object): number {
  const debuff = _hexRegistry.get(enemy);
  if (!debuff || debuff.remainingMs <= 0) return 1;
  return 1 + debuff.valuePct / 100;
}

/**
 * Ticks all active Lingering Hex debuffs by deltaMs.
 * Removes expired entries from both the registry and the tracking Set.
 * Call each RPG frame (before damage computation is not required; after is fine).
 */
export function tickLingeringHexDebuffs(deltaMs: number): void {
  for (const enemy of _hexEnemies) {
    const debuff = _hexRegistry.get(enemy);
    if (!debuff) {
      _hexEnemies.delete(enemy);
      continue;
    }
    debuff.remainingMs -= deltaMs;
    if (debuff.remainingMs <= 0) {
      _hexRegistry.delete(enemy);
      _hexEnemies.delete(enemy);
    }
  }
}

/**
 * Immediately removes a Lingering Hex debuff from an enemy.
 * Call on enemy death or despawn for timely cleanup (WeakMap will eventually GC
 * the entry anyway, but clearing promptly keeps the tracking Set lean).
 */
export function clearLingeringHex(enemy: object): void {
  _hexRegistry.delete(enemy);
  _hexEnemies.delete(enemy);
}
