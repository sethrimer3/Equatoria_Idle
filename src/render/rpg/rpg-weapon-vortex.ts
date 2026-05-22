/**
 * rpg-weapon-vortex.ts — Nullstone vortex weapon system for the RPG tab.
 *
 * Extracted from rpg-weapon-systems.ts to keep that module focused on
 * orchestration. This module owns the full lifecycle of nullstone vortexes:
 *
 *   • Spawning vortexes in a spread pattern around the player.
 *   • Per-frame update: duration countdown, spin animation, gravity pull on
 *     all nearby enemies, fluid swirl injection, and periodic damage ticks.
 *   • Per-weapon cooldown management so vortexes re-fire automatically.
 *
 * The factory `createVortexWeaponSystem(ctx)` receives a `VortexWeaponCtx`
 * dependency-injection object and returns a `VortexWeaponHandle` exposing
 * the vortex state arrays (consumed by rpg-weapon-draw.ts for rendering) and
 * per-frame update functions (called from rpg-weapon-systems.ts).
 */

import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import { getScaledWeaponDamage } from '../../sim/rpg/rpg-state';
import {
  VORTEX_PULL_STRENGTH, VORTEX_DAMAGE_INTERVAL_MS,
  VORTEX_SPAWN_DIST, VORTEX_COLOR, VORTEX_SPIN_RATE,
} from './rpg-weapon-constants';
import {
  TARGET_FRAME_MS,
} from './rpg-constants';
import { getVortexTierRadius, getVortexTierDurationMs, getVortexCount } from './rpg-helpers';
import type { FluidImpulse } from './rpg-fluid';
import type { NullstoneVortex, VortexWeaponState, LaserEnemy, SapphireEnemy } from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy, VoidEnemy, QuartzEnemy, RubyEnemy,
  SunstoneEnemy, CitrineEnemy, IoliteEnemy, AmethystEnemy, DiamondEnemy,
  NullstoneEnemy, FracterylEnemy, EigensteinEnemy, EliteEnemy, BossEnemy,
} from './rpg-enemy-types';
import {
  pushPointOutsideTopographicTerrain,
  hasTopographicTerrainLineOfSight,
} from './terrain/topographic-terrain';

// Module-level scratch object to avoid per-pull allocation during the vortex pull sweep.
const _vortexPullScratch = { x: 0, y: 0 };

// ── Dependency-injection context ─────────────────────────────────────────────

/** Structural subset of RpgWeaponCtx containing only what the vortex system needs. */
export interface VortexWeaponCtx {
  mote: { x: number; y: number };
  rpgSimState: { weaponTiersByWeaponId: Map<string, number> };
  playerStats: { atk: number };
  readonly playerAimAngle: number;
  fluid: { addForce(impulse: FluidImpulse): void };
  readonly bossEnemy: BossEnemy | null;
  // Enemy body arrays
  enemies: LaserEnemy[];
  sapphireEnemies: SapphireEnemy[];
  emeraldEnemies: EmeraldEnemy[];
  amberEnemies: AmberEnemy[];
  voidEnemies: VoidEnemy[];
  quartzEnemies: QuartzEnemy[];
  rubyEnemies: RubyEnemy[];
  sunstoneEnemies: SunstoneEnemy[];
  citrineEnemies: CitrineEnemy[];
  ioliteEnemies: IoliteEnemy[];
  amethystEnemies: AmethystEnemy[];
  diamondEnemies: DiamondEnemy[];
  nullstoneEnemies: NullstoneEnemy[];
  fracterylEnemies: FracterylEnemy[];
  eigensteinEnemies: EigensteinEnemy[];
  eliteEnemies: EliteEnemy[];
  // Damage functions (body enemies)
  damageEnemy: (enemy: LaserEnemy, dmg: number, armorMult: number) => number;
  damageSapphireEnemy: (enemy: SapphireEnemy, dmg: number, armorMult: number, isImpact: boolean) => number;
  damageEmeraldEnemy: (enemy: EmeraldEnemy, dmg: number, armorMult: number) => number;
  damageAmberEnemy: (enemy: AmberEnemy, dmg: number, armorMult: number) => number;
  damageVoidEnemy: (enemy: VoidEnemy, dmg: number, armorMult: number) => number;
  damageQuartzEnemy: (enemy: QuartzEnemy, dmg: number, armorMult: number) => number;
  damageRubyEnemy: (enemy: RubyEnemy, dmg: number, armorMult: number) => number;
  damageSunstoneEnemy: (enemy: SunstoneEnemy, dmg: number, armorMult: number) => number;
  damageCitrineEnemy: (enemy: CitrineEnemy, dmg: number, armorMult: number) => number;
  damageIoliteEnemy: (enemy: IoliteEnemy, dmg: number, armorMult: number) => number;
  damageAmethystEnemy: (enemy: AmethystEnemy, dmg: number, armorMult: number, isImpact: boolean) => number;
  damageDiamondEnemy: (enemy: DiamondEnemy, dmg: number, armorMult: number) => number;
  damageNullstoneEnemy: (enemy: NullstoneEnemy, dmg: number, armorMult: number) => number;
  damageFracterylEnemy: (enemy: FracterylEnemy, dmg: number, armorMult: number) => number;
  damageEigensteinEnemy: (enemy: EigensteinEnemy, dmg: number, armorMult: number) => number;
  damageEliteEnemy: (enemy: EliteEnemy, dmg: number, armorMult: number) => number;
  damageBossEnemy: (rawDamage: number, defPierceRatio: number, fromDiamondBlade?: boolean) => number;
  // Visual feedback
  spawnDamageNumber: (x: number, y: number, vx: number, vy: number, text: string, healthFraction: number, color: string) => void;
  // Game-flow callbacks
  removeDeadEnemies: () => void;
  checkWaveCompletion: () => void;
  /** Returns current terrain state, or null if terrain is not active. */
  getTerrainState?: () => import('./terrain/topographic-terrain').TopographicTerrainState | null;
}

// ── Public handle ─────────────────────────────────────────────────────────────

export interface VortexWeaponHandle {
  /** Live array of active vortexes — read by rpg-weapon-draw.ts. */
  readonly activeVortexes: NullstoneVortex[];
  /** Per-weapon state for vortex cooldown — read by rpg-weapon-systems.ts to clean up on unequip. */
  readonly vortexWeaponStates: Map<string, VortexWeaponState>;
  updateVortexWeapon(weaponId: string, deltaMs: number): void;
  updateVortexes(deltaMs: number): void;
  reset(): void;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createVortexWeaponSystem(ctx: VortexWeaponCtx): VortexWeaponHandle {
  const {
    mote, rpgSimState, playerStats, fluid, spawnDamageNumber,
    removeDeadEnemies, checkWaveCompletion,
    damageEnemy, damageSapphireEnemy, damageEmeraldEnemy, damageAmberEnemy,
    damageVoidEnemy, damageQuartzEnemy, damageRubyEnemy, damageSunstoneEnemy,
    damageCitrineEnemy, damageIoliteEnemy, damageAmethystEnemy, damageDiamondEnemy,
    damageNullstoneEnemy, damageFracterylEnemy, damageEigensteinEnemy, damageEliteEnemy, damageBossEnemy,
  } = ctx;

  const activeVortexes: NullstoneVortex[] = [];
  const vortexWeaponStates: Map<string, VortexWeaponState> = new Map();

  function fireVortex(weaponId: string, tier: number): void {
    const weaponDef = WEAPON_BY_ID.get(weaponId);
    const rawDamage = weaponDef
      ? getScaledWeaponDamage(weaponDef.stats.damage, tier, playerStats.atk)
      : playerStats.atk;
    const radiusPx    = getVortexTierRadius(tier);
    const durationMs  = getVortexTierDurationMs(tier);
    const count       = getVortexCount(tier);
    // Set the per-weapon cooldown to 2× duration before spawning vortexes.
    vortexWeaponStates.set(weaponId, { cooldownMs: durationMs * 2 });
    const terrain = ctx.getTerrainState ? ctx.getTerrainState() : null;
    for (let i = 0; i < count; i++) {
      const angle = ctx.playerAimAngle + (i / count) * Math.PI * 2;
      let vx = mote.x + Math.cos(angle) * VORTEX_SPAWN_DIST;
      let vy = mote.y + Math.sin(angle) * VORTEX_SPAWN_DIST;
      // Push vortex spawn point out of terrain so it does not overlap islands.
      if (terrain) {
        const out = { x: vx, y: vy };
        if (pushPointOutsideTopographicTerrain(terrain, vx, vy, out, radiusPx)) {
          vx = out.x; vy = out.y;
        }
      }
      activeVortexes.push({
        x: vx,
        y: vy,
        radiusPx,
        durationMs,
        maxDurationMs: durationMs,
        spinAngle: 0,
        damageTimerMs: VORTEX_DAMAGE_INTERVAL_MS,
        scaledDamage: rawDamage / 3,
        weaponId,
      });
    }
  }

  function updateVortexWeapon(weaponId: string, deltaMs: number): void {
    const tier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    if (!vortexWeaponStates.has(weaponId)) vortexWeaponStates.set(weaponId, { cooldownMs: 0 });
    const state = vortexWeaponStates.get(weaponId)!;
    state.cooldownMs -= deltaMs;
    if (state.cooldownMs <= 0) fireVortex(weaponId, tier);
  }

  /** Applies vortex damage to one enemy; shows a damage number if any dealt.
   *  Terrain blocks the vortex: enemies with no line of sight from the vortex
   *  centre are neither pulled nor damaged through an island. */
  function applyVortexTickToEnemy<T extends { x: number; y: number; maxHp: number }>(
    vortex: NullstoneVortex,
    e: T,
    damageFn: (enemy: T, dmg: number, pierce: number) => number,
    terrain: import('./terrain/topographic-terrain').TopographicTerrainState | null,
  ): void {
    const dx = e.x - vortex.x, dy = e.y - vortex.y;
    if (dx * dx + dy * dy > vortex.radiusPx * vortex.radiusPx) return;
    // Skip enemies whose centre is behind a terrain island — the vortex
    // gravitational field does not penetrate solid obstacles.
    if (!hasTopographicTerrainLineOfSight(terrain, vortex.x, vortex.y, e.x, e.y)) return;
    const dmg = damageFn(e, vortex.scaledDamage, 0);
    if (dmg > 0) spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, VORTEX_COLOR);
  }

  function updateVortexes(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const pull = VORTEX_PULL_STRENGTH * dt;
    const terrain = ctx.getTerrainState ? ctx.getTerrainState() : null;

    for (let i = activeVortexes.length - 1; i >= 0; i--) {
      const v = activeVortexes[i];
      v.durationMs -= deltaMs;
      if (v.durationMs <= 0) { activeVortexes.splice(i, 1); continue; }

      v.spinAngle += VORTEX_SPIN_RATE * deltaMs / 1000;

      // Gravity pull — nudge each enemy toward the vortex center.
      // Terrain blocks the pull: enemies with no LOS from the vortex are not pulled.
      const applyPull = (e: { x: number; y: number }) => {
        const dx = v.x - e.x, dy = v.y - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.01 && dist <= v.radiusPx) {
          // Do not pull enemies that are behind a terrain island.
          if (!hasTopographicTerrainLineOfSight(terrain, v.x, v.y, e.x, e.y)) return;
          e.x += (dx / dist) * pull;
          e.y += (dy / dist) * pull;
          // Push back out of terrain if the pull moved the enemy into an island.
          if (terrain) {
            _vortexPullScratch.x = e.x;
            _vortexPullScratch.y = e.y;
            if (pushPointOutsideTopographicTerrain(terrain, e.x, e.y, _vortexPullScratch, 0)) {
              e.x = _vortexPullScratch.x;
              e.y = _vortexPullScratch.y;
            }
          }
        }
      };
      for (const e of ctx.enemies)           applyPull(e);
      for (const e of ctx.sapphireEnemies)   applyPull(e);
      for (const e of ctx.emeraldEnemies)    applyPull(e);
      for (const e of ctx.amberEnemies)      applyPull(e);
      for (const e of ctx.voidEnemies)       applyPull(e);
      for (const e of ctx.quartzEnemies)     applyPull(e);
      for (const e of ctx.rubyEnemies)       applyPull(e);
      for (const e of ctx.sunstoneEnemies)   applyPull(e);
      for (const e of ctx.citrineEnemies)    applyPull(e);
      for (const e of ctx.ioliteEnemies)     applyPull(e);
      for (const e of ctx.amethystEnemies)   applyPull(e);
      for (const e of ctx.diamondEnemies)    applyPull(e);
      for (const e of ctx.nullstoneEnemies)  applyPull(e);
      for (const e of ctx.fracterylEnemies)  applyPull(e);
      for (const e of ctx.eigensteinEnemies) applyPull(e);
      for (const e of ctx.eliteEnemies) applyPull(e);
      if (ctx.bossEnemy) applyPull(ctx.bossEnemy);

      // Fluid inward swirl
      fluid.addForce({
        x: v.x, y: v.y, vx: 0, vy: 0,
        r: 150, g: 100, b: 200,
        strength: 0.4,
      });

      // Damage ticks
      v.damageTimerMs -= deltaMs;
      if (v.damageTimerMs <= 0) {
        v.damageTimerMs += VORTEX_DAMAGE_INTERVAL_MS;
        for (const e of ctx.enemies)           applyVortexTickToEnemy(v, e, damageEnemy, terrain);
        for (const e of ctx.sapphireEnemies)   applyVortexTickToEnemy(v, e, (en, dmg, p) => damageSapphireEnemy(en, dmg, p, false), terrain);
        for (const e of ctx.emeraldEnemies)    applyVortexTickToEnemy(v, e, damageEmeraldEnemy, terrain);
        for (const e of ctx.amberEnemies)      applyVortexTickToEnemy(v, e, damageAmberEnemy, terrain);
        for (const e of ctx.voidEnemies)       applyVortexTickToEnemy(v, e, damageVoidEnemy, terrain);
        for (const e of ctx.quartzEnemies)     applyVortexTickToEnemy(v, e, damageQuartzEnemy, terrain);
        for (const e of ctx.rubyEnemies)       applyVortexTickToEnemy(v, e, damageRubyEnemy, terrain);
        for (const e of ctx.sunstoneEnemies)   applyVortexTickToEnemy(v, e, damageSunstoneEnemy, terrain);
        for (const e of ctx.citrineEnemies)    applyVortexTickToEnemy(v, e, damageCitrineEnemy, terrain);
        for (const e of ctx.ioliteEnemies)     applyVortexTickToEnemy(v, e, damageIoliteEnemy, terrain);
        for (const e of ctx.amethystEnemies)   applyVortexTickToEnemy(v, e, (en, dmg, p) => damageAmethystEnemy(en, dmg, p, false), terrain);
        for (const e of ctx.diamondEnemies)    applyVortexTickToEnemy(v, e, damageDiamondEnemy, terrain);
        for (const e of ctx.nullstoneEnemies)  applyVortexTickToEnemy(v, e, damageNullstoneEnemy, terrain);
        for (const e of ctx.fracterylEnemies)  applyVortexTickToEnemy(v, e, (en, dmg, p) => damageFracterylEnemy(en, dmg, p), terrain);
        for (const e of ctx.eigensteinEnemies) applyVortexTickToEnemy(v, e, (en, dmg, p) => damageEigensteinEnemy(en, dmg, p), terrain);
        for (const e of ctx.eliteEnemies) { if (!e.isInvuln) applyVortexTickToEnemy(v, e, (en, dmg, p) => damageEliteEnemy(en, dmg, p), terrain); }
        if (ctx.bossEnemy) {
          const bx = ctx.bossEnemy.x - v.x, by = ctx.bossEnemy.y - v.y;
          if (bx * bx + by * by <= v.radiusPx * v.radiusPx
              && hasTopographicTerrainLineOfSight(terrain, v.x, v.y, ctx.bossEnemy.x, ctx.bossEnemy.y)) {
            const dmg = damageBossEnemy(v.scaledDamage, 0);
            if (dmg > 0) spawnDamageNumber(ctx.bossEnemy.x, ctx.bossEnemy.y, 0, -1, String(Math.round(dmg)), dmg / ctx.bossEnemy.maxHp, VORTEX_COLOR);
          }
        }
        removeDeadEnemies();
        checkWaveCompletion();
      }
    }
  }

  return {
    get activeVortexes() { return activeVortexes; },
    get vortexWeaponStates() { return vortexWeaponStates; },
    updateVortexWeapon,
    updateVortexes,
    reset() {
      activeVortexes.length = 0;
      vortexWeaponStates.clear();
    },
  };
}
