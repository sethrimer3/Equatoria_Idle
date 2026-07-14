/**
 * rpg-elite-buff.ts — Elite-enemy empowerment buff system.
 *
 * Each living elite enemy grants +25% to all non-elite enemy stats except
 * movement speed.  The stacking rule is additive:
 *
 *   activeStat = baseStat * (1 + livingEliteCount * 0.25)
 *
 * Base stats are recorded once, the moment each non-elite is registered (at
 * spawn).  The buff is always derived from those stored base stats, so calling
 * `applyBuffToEnemy` multiple times with the same eliteCount is idempotent and
 * never compounds.
 *
 * HP percentage is preserved across buff changes:
 *   if an enemy is at 50% HP before recalc, it remains at ~50% after.
 *
 * Affected stats: maxHp (+ hp scaled proportionally), atk, def,
 *                 maxShieldHp + shieldHp (for shield-bearing types).
 * Movement speed is intentionally NOT affected.
 */

/** Buff multiplier contributed by each living elite enemy. */
export const ELITE_BUFF_PER_ELITE = 0.25;

/**
 * Minimum stat fields every buffable non-elite enemy must expose.
 * All concrete enemy types in EnemySpawnCtx satisfy this structurally.
 */
export interface BuffableEnemy {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  /** Present only on shield-bearing enemy types (SapphireEnemy, AmethystEnemy, etc.). */
  shieldHp?: number;
  maxShieldHp?: number;
}

/** Base stat values captured at the moment of spawn (before any buff). */
interface BaseStats {
  maxHp: number;
  atk: number;
  def: number;
  /** Defined only for shield-bearing enemy types (SapphireEnemy, AmethystEnemy). */
  maxShieldHp?: number;
}

/**
 * WeakMap keyed on live enemy objects.  Entries are automatically GC'd when
 * enemies are spliced from their arrays and no other references remain.
 * Declared as `let` so `clearEliteBuffRegistry` can replace the map.
 */
let _baseStats = new WeakMap<object, BaseStats>();

/**
 * Records the base stats of a newly-spawned non-elite enemy.
 * Must be called before any call to `applyBuffToEnemy` for this enemy.
 */
export function registerNonEliteEnemy(enemy: BuffableEnemy): void {
  _baseStats.set(enemy, {
    maxHp: enemy.maxHp,
    atk: enemy.atk,
    def: enemy.def,
    maxShieldHp: enemy.maxShieldHp,
  });
}

/**
 * (Re-)applies the elite buff to a single non-elite enemy.
 * Derives active stats from stored base stats, so calling this multiple
 * times with the same eliteCount is idempotent.
 *
 * HP percentage is preserved: if maxHp changes, current hp scales with it.
 */
export function applyBuffToEnemy(enemy: BuffableEnemy, eliteCount: number): void {
  const base = _baseStats.get(enemy);
  if (!base) return;

  const mult = 1 + eliteCount * ELITE_BUFF_PER_ELITE;

  // Health — preserve current HP percentage
  const hpPct = enemy.maxHp > 0 ? Math.min(1, enemy.hp / enemy.maxHp) : 1;
  enemy.maxHp = Math.max(1, Math.ceil(base.maxHp * mult));
  enemy.hp    = Math.max(1, Math.round(hpPct * enemy.maxHp));

  // Attack and defense
  enemy.atk = Math.max(1, Math.ceil(base.atk * mult));
  enemy.def = Math.ceil(base.def * mult);   // def = 0 is valid, no min-1 guard

  // Shield (SapphireEnemy, AmethystEnemy) — preserve shield HP percentage
  if (base.maxShieldHp !== undefined && base.maxShieldHp > 0) {
    const curMaxShieldHp = enemy.maxShieldHp ?? 0;
    const curShieldHp = enemy.shieldHp ?? 0;
    const shieldPct = curMaxShieldHp > 0 ? Math.min(1, curShieldHp / curMaxShieldHp) : 1;
    enemy.maxShieldHp = Math.max(1, Math.ceil(base.maxShieldHp * mult));
    enemy.shieldHp    = Math.max(0, Math.round(shieldPct * enemy.maxShieldHp));
  }
}

/**
 * Re-applies the elite buff to every enemy across all provided arrays.
 * Call this whenever the living elite count changes (elite spawns or dies).
 *
 * Only enemies that have been registered via `registerNonEliteEnemy` are
 * affected; unregistered entries are silently skipped.
 */
export function recalcAllNonEliteBuffs(
  nonEliteArrays: ReadonlyArray<ReadonlyArray<BuffableEnemy>>,
  eliteCount: number,
): void {
  for (let a = 0; a < nonEliteArrays.length; a++) {
    const arr = nonEliteArrays[a]!;
    for (let i = 0; i < arr.length; i++) {
      applyBuffToEnemy(arr[i]!, eliteCount);
    }
  }
}

/**
 * Clears the base-stat registry.  Called when a wave ends and all enemies have
 * been removed.  The WeakMap GCs entries automatically when enemy objects
 * become unreachable, so this call is a defensive belt-and-suspenders measure.
 *
 * Replacing the WeakMap reference is the only way to clear a WeakMap (the spec
 * does not expose a `.clear()` method).  Old enemy objects that somehow remain
 * referenced after a wave clear will find no base stats in the new map, causing
 * `applyBuffToEnemy` to be a no-op for them — which is the correct behaviour.
 */
export function clearEliteBuffRegistry(): void {
  _baseStats = new WeakMap<object, BaseStats>();
}
