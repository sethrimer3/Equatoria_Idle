/**
 * offline-time.ts — Lightweight helpers for tracking the last-active timestamp.
 *
 * The timestamp is stored under its own localStorage key so it can be written
 * cheaply on visibilitychange without serialising the full save file.
 */

const LAST_ACTIVE_KEY = 'equatoria_last_active';

/**
 * Return the stored timestamp (ms since epoch), or null if none exists.
 */
export function readLastActiveTimestamp(): number | null {
  try {
    const raw = localStorage.getItem(LAST_ACTIVE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Write the current time as the last-active timestamp.
 * Call this on app start (after reading the old value) and on visibility hide.
 */
export function writeLastActiveTimestamp(): void {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
  } catch {
    // ignore — storage may be full or unavailable
  }
}
