# Platform Achievements

This is the framework that syncs achievement unlocks to external platforms
(Steam, Google Play). It is separate from the in-game bonus achievement
system in `src/sim/achievements` (which grants gameplay multipliers) — the
two do not share state or IDs.

Code lives in `src/achievements/`:

- `achievementTypes.ts` — `AchievementDef`, `AchievementType`, `AchievementRarity`, `AchievementPlatformAdapter`.
- `achievementRegistry.ts` — the list of all `AchievementDef`s, keyed by stable internal id.
- `achievementService.ts` — `AchievementService`: tracks unlock/progress/reveal state and queues platform syncs.
- `adapters/noopAdapter.ts` — default adapter, always safe, does nothing.
- `adapters/steamAdapter.ts`, `adapters/googlePlayAdapter.ts` — guarded stubs; inert until a real SDK is wired in.
- `achievementHooks.ts` — the functions gameplay code calls (`onEnemyDefeated`, `onBossDefeated`, etc.).

## Adding a new achievement

1. Add an `AchievementDef` entry to `ACHIEVEMENT_REGISTRY` in `achievementRegistry.ts`. Pick a stable `id` (e.g. `SNAKE_CASE`) — this id is permanent once shipped; never rename or reuse it.
2. Fill in `platformIds.steam` / `platformIds.googlePlay` with placeholder strings until the achievement is created in each store's dashboard, then replace them with the real store ids.
3. Add or extend a hook in `achievementHooks.ts` if no existing hook fits, and call `service.unlock(id)` / `service.increment(id, amount)` / `service.setProgress(id, value)` from it.
4. Call that hook from the real gameplay trigger site — only hook into code paths that actually exist (see "Trigger sites" below for examples already wired up).
5. Add a case to `achievementService.test.ts` if the new achievement exercises a code path not already covered.

## Internal ID → platform ID mapping

Each `AchievementDef.platformIds` maps the internal id to the id registered
in Steamworks (`platformIds.steam`) and Google Play Console
(`platformIds.googlePlay`). Internal ids never change; platform ids can be
filled in or corrected without touching any gameplay code, since hooks only
ever reference the internal id.

## Trigger sites currently wired up

| Hook | Called from |
| --- | --- |
| `onEnemyDefeated` | `src/render/rpg/rpg-wave-manager.ts` (`addKill`) |
| `onBossDefeated` | `src/render/rpg/rpg-wave-dead-enemies-special.ts` (boss-defeat handler) |
| `onMoteForged` | `src/sim/game-state.ts` (`craftWeapon`) |
| `onSkillUnlocked` | `src/app/app-actions.ts` (`purchase_rpg_upgrade` action) |
| `onZoneEntered` | `src/render/rpg/rpg-render.ts` (zone-select callback) |
| `onWaveClearedWithSingleWeapon`, `onWaveClearedAt1Hp` | `src/render/rpg/rpg-wave-dead-enemies-special.ts` |

`ENDLESS_SEEKER` from the original spec was intentionally **not** added — no endless mode exists in the codebase today. Add it (and its hook) once one ships.

## Testing locally

- Run `npx vitest run src/achievements` to run the framework's own tests.
- In Developer Mode, open Settings → Playtesting Tools → **Platform Achievements**:
  - **List** — prints unlock/progress state for every registered achievement.
  - **Force Unlock All** — unlocks everything immediately (dev only).
  - **Reset State** — clears all platform achievement state.
  - **Print Sync Queue** — shows ids still waiting on the active adapter.
- With no platform SDK present (the default), the `NoopAchievementAdapter` is active — unlocks/progress are tracked locally and persist through saves, but nothing is sent anywhere. This is expected and is what "the game must work normally with no platform SDK" means in practice.

## Verifying before release

1. `npx tsc --noEmit` — no type errors.
2. `npx vitest run` — full suite passes, including `achievementService.test.ts` and the save-migration tests.
3. Load an old save (pre-v39) and confirm it still loads — `platformAchievements` should default to an empty record set, not throw.
4. Confirm `steamAdapter.ts` / `googlePlayAdapter.ts` do not import any Steamworks/Play Games package — they must stay inert stubs until a real integration lands, and shared game code must never hard-require those packages.
5. Once a platform SDK is integrated, replace the relevant adapter's `isReady()` check and wire `unlock`/`setProgress` to the real SDK calls, then fill in the placeholder `platformIds` for each achievement from that store's dashboard.
