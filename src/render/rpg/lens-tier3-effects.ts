/**
 * lens-tier3-effects.ts — Tier 3 lens effect handler for RPG combat.
 *
 * Exports:
 *   handleLensTier3EffectsOnWeaponHit(params) — call after T2 handler on each weapon hit.
 *   tickLensTier3Effects(deltaMs)              — call once per frame for bloom/freeze decay.
 *   clearPendingTier3Effects()                 — reset module state (for tests).
 *
 * Implemented effects:
 *   Sand      → Sandstorm Cascade  (enhances Sand Spray; depth-capped cascade)
 *   Quartz    → Perfect Refraction (Prism Split shard bounces once; no infinite loop)
 *   Ruby      → Meltdown Core      (heat build-up → capped fire explosion)
 *   Citrine   → Radiant Detonation (death-triggered golden explosion from Radiant enemies)
 *   Emerald   → Viridian Bloom     (death-triggered toxic zone from Poisoned enemies)
 *   Sapphire  → Absolute Zero      (chill-stack freeze + shatter on next hit)
 *   Iolite    → Time Fracture      (burst hits against Time-Warped enemies; depth-capped)
 *   Amethyst  → Mirror Volley      (ghostly mirror hits to nearby enemies; chain depth capped)
 *   Diamond   → Faultline Break    (fracture burst against Cracked enemies; depth-capped)
 *   Nullstone → Event Horizon      (micro black-hole zone on Gravitized enemies; capped zones)
 *   Fracteryl → Infinite Descent   (Fractal Wound reapplied on expiry; repeat cap = 2)
 *   Eigenstein→ Reality Cascade    (per-enemy/source instability → rift burst at threshold)
 *
 * Anti-recursion rules:
 *   - Secondary/T3 hits call damageSecTarget (same as T2) — bypass weapon-attack pipeline.
 *   - Sand/Quartz/Iolite/Amethyst/Diamond depth capped at 1 via synchronous boolean flags.
 *   - Citrine/Emerald detonation caps per death: at most T3_MAX_SPAWNS_PER_DEATH secondary hits.
 *   - Bloom ticking cannot trigger further death blooms (bloom damage bypasses T3 death check).
 *   - Ruby explosion capped by per-enemy heat cap and explosion cooldown.
 *   - Event Horizon zone damage bypasses T3/T2 proc pipeline entirely.
 *   - Infinite Descent repeat count hard-capped at INFINITE_DESCENT_MAX_REPEATS (2).
 *   - Reality Cascade instability per enemy/source; break partially clears instability.
 */

import type { RpgPlayerAttackCtx } from './rpg-player-attack';
import type { CraftedLensData } from '../../data/rpg/lens-types';
import { LENS_T3_IMPLEMENTED_TIER_IDS } from '../../data/rpg/lens-definitions';
import {
  applyLensStatus,
  hasStatus,
  removeStatus,
  getRiftScarredDamageMult,
} from '../../sim/rpg/enemy-status-effects';
import type { LensStatusParams, EnemyStatusKey } from '../../sim/rpg/enemy-status-effects';
import type { TierId } from '../../data/tiers';
import { extractT2TargetEntity } from './lens-tier2-effects';
import type { ClosestTarget } from './rpg-types';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Squared radius for T3 secondary effects (slightly larger than T2's 200px). */
const T3_RANGE_SQ = 250 * 250;

const T3_PROC_MIN = 0.03;
const T3_PROC_MAX = 0.25;

const T3_MAX_SPAWNS_PER_HIT    = 8;
const T3_MAX_SPAWNS_PER_DEATH  = 12;

// Ruby – Meltdown Core
const MELTDOWN_HEAT_PER_HIT   = 1;
const MELTDOWN_HEAT_MAX        = 8;
const MELTDOWN_HEAT_THRESHOLD  = 5;
const MELTDOWN_COOLDOWN_MS     = 2500;
const MELTDOWN_EXPLOSION_HITS  = 4;

// Sapphire – Absolute Zero
const CHILL_FREEZE_HITS        = 8;   // hits from the same T3 lens to freeze
const FREEZE_DURATION_MS       = 900; // normal enemies
const FREEZE_DURATION_ELITE_MS = 400; // reduced for elite/boss (duck-typed)

// Emerald – Viridian Bloom
const BLOOM_DURATION_MS        = 3000;
const BLOOM_TICK_MS            = 900;
const BLOOM_MAX_ACTIVE         = 6;
const BLOOM_RANGE_SQ           = 140 * 140;

// Citrine – Radiant Detonation
const DETONATE_CHANCE          = 0.60; // per-death proc chance

// Nullstone – Event Horizon
const EVENT_HORIZON_DURATION_MS = 1800;
const EVENT_HORIZON_TICK_MS     = 600;
const EVENT_HORIZON_MAX_ACTIVE  = 3;
const EVENT_HORIZON_RANGE_SQ    = 120 * 120;
const EVENT_HORIZON_PULL_STR    = 0.015; // conservative pull per ms

// Fracteryl – Infinite Descent
const INFINITE_DESCENT_MAX_REPEATS = 2;
const INFINITE_DESCENT_PROC_CHANCE = 0.25;
const INFINITE_DESCENT_MAG_DECAY   = 0.55; // magnitude multiplier per repeat

// Eigenstein – Reality Cascade
const REALITY_CASCADE_THRESHOLD    = 6;    // instability hits to trigger break
const REALITY_CASCADE_BASE_MULT    = 0.80; // base damage multiplier
const REALITY_CASCADE_MAX_CHAIN    = 5;    // max secondary hits from cascade

// ── Module-level state ─────────────────────────────────────────────────────────

/** Depth guard for Sand Cascade — prevents T3 from recursively cascading. */
let _sandCascading = false;

/** Depth guard for Quartz Bounce — prevents T3 from recursively bouncing. */
let _quartzBouncing = false;

/** Ruby heat per enemy: meltdown heat accumulation. */
const _meltdownHeat = new WeakMap<object, number>();

/** Ruby explosion cooldown per enemy: timestamp (ms) of last explosion. */
const _meltdownLastExplosionTs = new WeakMap<object, number>();

/** Sapphire chill-hit counter: enemy → lensId → hitCount */
const _sapphireChillHits = new WeakMap<object, Map<string, number>>();

/** Citrine: enemies tagged as detonation candidates (hit by T3 Citrine lens). */
const _t3CitrineTagged = new WeakSet<object>();

/** Emerald: enemies tagged as bloom candidates (hit by T3 Emerald lens). */
const _t3EmeraldTagged = new WeakSet<object>();

/** Depth guard for Iolite Time Fracture — prevents recursion. */
let _ioliteTimeFracturing = false;

/** Depth guard for Amethyst Mirror Volley — prevents mirror hits triggering more mirrors. */
let _amethystMirroring = false;

/** Depth guard for Diamond Faultline Break — prevents recursion. */
let _diamondFaultlining = false;

interface EventHorizonZone {
  x: number;
  y: number;
  remainingMs: number;
  tickTimer: number;
  damage: number;
  magnitude: number;
  lensId: string;
  weaponId: string;
}

const _eventHorizonZones: EventHorizonZone[] = [];

interface DescentData {
  hadFractalWound: boolean;
  repeatCount: number;
  lensId: string;
  weaponId: string;
  magnitude: number;
}

/** Fracteryl: per-enemy Infinite Descent tracking data. */
const _fracterylDescentData = new WeakMap<object, DescentData>();

/** Eigenstein: per-enemy, per-source instability stacks for Reality Cascade. */
const _realityCascadeInstability = new WeakMap<object, Map<string, number>>();

interface BloomZone {
  x: number;
  y: number;
  remainingMs: number;
  tickTimer: number;
  damage: number;
  magnitude: number;
  lensId: string;
  weaponId: string;
}

const _bloomZones: BloomZone[] = [];

/** Stored attack ctx — set by handleLensTier3EffectsOnWeaponHit each call.
 *  Used by tickLensTier3Effects for death-effect damage dispatch. */
let _storedCtx: RpgPlayerAttackCtx | null = null;

// ── Exported interface ─────────────────────────────────────────────────────────

export interface LensTier3HitParams {
  targetEntity: object | null;
  hitDamage: number;
  lens: CraftedLensData;
  weaponId: string;
  ctx: RpgPlayerAttackCtx;
}

// ── Test helpers ───────────────────────────────────────────────────────────────

export function clearPendingTier3Effects(): void {
  _bloomZones.length = 0;
  _eventHorizonZones.length = 0;
  _sandCascading = false;
  _quartzBouncing = false;
  _ioliteTimeFracturing = false;
  _amethystMirroring = false;
  _diamondFaultlining = false;
  _storedCtx = null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function getProcChance(magnitude: number): number {
  return clamp(magnitude * 0.012, T3_PROC_MIN, T3_PROC_MAX);
}

/** Apply a T1 status via the same params structure as T2 uses. */
function applyT3Status(
  entity: object,
  statusKey: EnemyStatusKey,
  tierId: TierId,
  magnitude: number,
  lensId: string,
  weaponId: string,
): void {
  const params: LensStatusParams = {
    key: statusKey,
    sourceTierId: tierId,
    sourceLensId: lensId,
    sourceWeaponId: weaponId,
    durationMs: statusKey === 'poisoned' ? 6000 : statusKey === 'burning' ? 4000 : 3500,
    magnitude,
    tickEveryMs: (statusKey === 'burning' || statusKey === 'poisoned') ? 1000 : undefined,
  };
  applyLensStatus(entity, params);
}

/** Direct-damage a ClosestTarget — mirrors T2's damageSecTarget. */
function damageT3Target(ctx: RpgPlayerAttackCtx, t: ClosestTarget, dmg: number): number {
  // Re-use the same routing as T2 — all calls bypass the weapon-attack pipeline.
  if (t.laser)              return ctx.damageEnemy(t.laser, dmg, 0);
  if (t.sapphire)           return ctx.damageSapphireEnemy(t.sapphire, dmg, 0, false);
  if (t.missile)            return ctx.damageMissile(t.missile, dmg);
  if (t.emerald)            return ctx.damageEmeraldEnemy(t.emerald, dmg, 0);
  if (t.amber)              return ctx.damageAmberEnemy(t.amber, dmg, 0);
  if (t.ambershard)         return ctx.damageAmberShard(t.ambershard, dmg);
  if (t.void)               return ctx.damageVoidEnemy(t.void, dmg, 0);
  if (t.quartz)             return ctx.damageQuartzEnemy(t.quartz, dmg, 0);
  if (t.quartzspike)        return ctx.damageQuartzSpike(t.quartzspike, dmg);
  if (t.ruby)               return ctx.damageRubyEnemy(t.ruby, dmg, 0);
  if (t.rubybolt)           return ctx.damageRubyBolt(t.rubybolt, dmg);
  if (t.sunstone)           return ctx.damageSunstoneEnemy(t.sunstone, dmg, 0);
  if (t.citrine)            return ctx.damageCitrineEnemy(t.citrine, dmg, 0);
  if (t.citrinebolt)        return ctx.damageCitrineBolt(t.citrinebolt, dmg);
  if (t.iolite)             return ctx.damageIoliteEnemy(t.iolite, dmg, 0);
  if (t.amethyst)           return ctx.damageAmethystEnemy(t.amethyst, dmg, 0, false);
  if (t.amethystshard)      return ctx.damageAmethystShard(t.amethystshard, dmg);
  if (t.diamond)            return ctx.damageDiamondEnemy(t.diamond, dmg, 0);
  if (t.diamondshard)       return ctx.damageDiamondShard(t.diamondshard, dmg);
  if (t.nullstone)          return ctx.damageNullstoneEnemy(t.nullstone, dmg, 0);
  if (t.voidtendril)        return ctx.damageVoidTendril(t.voidtendril, dmg);
  if (t.fracteryl)          return ctx.damageFracterylEnemy(t.fracteryl, dmg, 0);
  if (t.fracterylshard)     return ctx.damageFracterylShard(t.fracterylshard, dmg);
  if (t.eigenstein)         return ctx.damageEigensteinEnemy(t.eigenstein, dmg, 0);
  if (t.polyomino)          return ctx.damagePolyominoEnemy(t.polyomino, dmg, 0);
  if (t.fissilePolyomino)   return ctx.damageFissilePolyominoEnemy(t.fissilePolyomino, dmg, 0);
  if (t.refractorPolyomino) return ctx.damageRefractorPolyominoEnemy(t.refractorPolyomino, dmg, 0);
  if (t.elite)              return ctx.damageEliteEnemy(t.elite, dmg, 0);
  if (t.boss)               return ctx.damageBossEnemy(dmg, 0);
  if (t.alivenParticle && t.alivenGroup) return ctx.damageAlivenParticle(t.alivenParticle, t.alivenGroup, dmg);
  if (t.dustWisp)           return ctx.damageDustWispEnemy(t.dustWisp, dmg, 0);
  if (t.ribbonWorm)         return ctx.damageRibbonWormEnemy(t.ribbonWorm, dmg, 0);
  if (t.lanternMoth)        return ctx.damageLanternMothEnemy(t.lanternMoth, dmg, 0);
  if (t.eyeStalk)           return ctx.damageEyeStalkEnemy(t.eyeStalk, dmg, 0);
  if (t.jellyfish)          return ctx.damageJellyfishEnemy(t.jellyfish, dmg, 0);
  if (t.clothGhost)         return ctx.damageClothGhostEnemy(t.clothGhost, dmg, 0);
  if (t.plantTurret)        return ctx.damagePlantTurretEnemy(t.plantTurret, dmg, 0);
  if (t.gearInsect)         return ctx.damageGearInsectEnemy(t.gearInsect, dmg, 0);
  if (t.spiderCrawler)      return ctx.damageSpiderCrawlerEnemy(t.spiderCrawler, dmg, 0);
  if (t.moteSwarm)          return ctx.damageMoteSwarmEnemy(t.moteSwarm, dmg, 0);
  if (t.shadowHand)         return ctx.damageShadowHandEnemy(t.shadowHand, dmg, 0);
  if (t.sandFish)           return ctx.damageSandFishEnemy(t.sandFish, dmg, 0);
  if (t.quartzFish)         return ctx.damageQuartzFishEnemy(t.quartzFish, dmg, 0, false);
  if (t.rubyFish)           return ctx.damageRubyFishEnemy(t.rubyFish, dmg, 0);
  if (t.sunstoneFish)       return ctx.damageSunstoneFishEnemy(t.sunstoneFish, dmg, 0);
  if (t.emeraldFish)        return ctx.damageEmeraldFishEnemy(t.emeraldFish, dmg, 0);
  if (t.sapphireFish)       return ctx.damageSapphireFishEnemy(t.sapphireFish, dmg, 0);
  if (t.amethystFish)       return ctx.damageAmethystFishEnemy(t.amethystFish, dmg, 0);
  if (t.diamondFish)        return ctx.damageDiamondFishEnemy(t.diamondFish, dmg, 0);
  if (t.plantProj)          return ctx.damagePlantProjectile(t.plantProj, dmg);
  return 0;
}

/**
 * Fire up to `maxHits` secondary hits, deal T3 damage, apply status.
 * Returns number of hits landed.
 */
function fireT3MultiHit(
  ctx: RpgPlayerAttackCtx,
  secDmg: number,
  maxHits: number,
  statusKey: EnemyStatusKey,
  tierId: TierId,
  magnitude: number,
  lensId: string,
  weaponId: string,
  hitColor: string,
): number {
  let hits = 0;
  for (let i = 0; i < maxHits; i++) {
    const target = ctx.findClosestTarget(T3_RANGE_SQ);
    if (!target) break;
    const dmg = damageT3Target(ctx, target, secDmg);
    if (dmg > 0) {
      const entity = extractT2TargetEntity(target);
      if (entity) applyT3Status(entity, statusKey, tierId, magnitude, lensId, weaponId);
      ctx.spawnHitVisualsAt(target.x, target.y, 200, dmg, hitColor, hitColor);
      hits++;
    }
  }
  return hits;
}

/** Returns true if the entity looks like an elite or boss (duck-typed). */
function isEliteOrBoss(entity: object): boolean {
  const e = entity as Record<string, unknown>;
  return typeof e['bossId'] === 'number' || e['isElite'] === true || typeof e['eliteTier'] === 'number';
}

// ── Citrine: fire detonation from a dead tagged enemy ─────────────────────────

function _fireCitrineDetonation(
  ctx: RpgPlayerAttackCtx,
  sourceX: number,
  sourceY: number,
  damage: number,
  magnitude: number,
  lensId: string,
  weaponId: string,
): void {
  ctx.fluid.addExplosion(sourceX, sourceY, 0.6, 1.0, 0.85, 0.0);
  ctx.spawnHitVisualsAt(sourceX, sourceY, 200, damage, '#ffd700', '#ffaa00');
  let spawns = 0;
  for (let i = 0; i < T3_MAX_SPAWNS_PER_DEATH && spawns < T3_MAX_SPAWNS_PER_DEATH; i++) {
    const target = ctx.findClosestTarget(T3_RANGE_SQ);
    if (!target) break;
    const dmg = damageT3Target(ctx, target, damage * 0.6);
    if (dmg > 0) {
      const entity = extractT2TargetEntity(target);
      if (entity) applyT3Status(entity, 'radiant', 'citrine', magnitude, lensId, weaponId);
      ctx.spawnHitVisualsAt(target.x, target.y, 200, dmg, '#ffd700', '#ffdd44');
      spawns++;
    }
  }
}

// ── Emerald: fire bloom zone creation from a dead tagged enemy ────────────────

function _fireEmeraldBloom(
  sourceX: number,
  sourceY: number,
  damage: number,
  magnitude: number,
  lensId: string,
  weaponId: string,
  ctx: RpgPlayerAttackCtx,
): void {
  if (_bloomZones.length >= BLOOM_MAX_ACTIVE) return;
  _bloomZones.push({
    x: sourceX,
    y: sourceY,
    remainingMs: BLOOM_DURATION_MS,
    tickTimer: BLOOM_TICK_MS,
    damage,
    magnitude,
    lensId,
    weaponId,
  });
  ctx.fluid.addExplosion(sourceX, sourceY, 0.3, 0.1, 0.8, 0.1);
  ctx.spawnHitVisualsAt(sourceX, sourceY, 200, 0, '#44dd44', '#44dd44');
}

// ── Death-effect detection helper ─────────────────────────────────────────────

/**
 * Check if entity just died (hp ≤ 0) and is tagged for Citrine/Emerald death effects.
 * Fires the appropriate effect synchronously using `ctx`.
 * Must be called BEFORE the entity's statuses are cleared.
 */
function _checkDeathEffects(
  entity: object,
  ctx: RpgPlayerAttackCtx,
  damage: number,
  magnitude: number,
  lensId: string,
  weaponId: string,
): void {
  const e = entity as { hp?: number; x?: number; y?: number };
  if (typeof e.hp !== 'number' || e.hp > 0) return;
  const x = e.x ?? 0;
  const y = e.y ?? 0;

  if (_t3CitrineTagged.has(entity)) {
    if (hasStatus(entity, 'radiant') && Math.random() < DETONATE_CHANCE) {
      _fireCitrineDetonation(ctx, x, y, damage, magnitude, lensId, weaponId);
    }
    // Tag remains (WeakSet auto-GCs with entity)
  }

  if (_t3EmeraldTagged.has(entity)) {
    if (hasStatus(entity, 'poisoned')) {
      _fireEmeraldBloom(x, y, damage, magnitude, lensId, weaponId, ctx);
    }
    // Tag remains (WeakSet auto-GCs with entity)
  }
}

// ── Main weapon-hit handler ────────────────────────────────────────────────────

/**
 * Process all Tier 3 lens effects for a weapon hit.
 * Call after handleLensTier2EffectsOnWeaponHit in each attack handler.
 *
 * Secondary T3 damage goes through the same direct-damage path as T2 — it does NOT
 * re-enter the weapon-attack pipeline, so T3 effects cannot trigger recursively.
 */
export function handleLensTier3EffectsOnWeaponHit(params: LensTier3HitParams): void {
  const { lens, hitDamage, targetEntity, weaponId, ctx } = params;

  // Store ctx for tick-based death detection in tickLensTier3Effects.
  _storedCtx = ctx;

  for (const effect of lens.effects) {
    if (effect.effectTier !== 3) continue;
    if (!LENS_T3_IMPLEMENTED_TIER_IDS.has(effect.tierId)) continue;

    const tierId = effect.tierId as TierId;
    const mag    = effect.magnitude;
    const lensId = lens.id;

    switch (tierId) {

      // ── Sand: Sandstorm Cascade ──────────────────────────────────────────────
      case 'sand': {
        if (_sandCascading) break; // depth guard
        if (Math.random() >= getProcChance(mag)) break;

        _sandCascading = true;
        const cascadeDmg = hitDamage * 0.30;
        const cascadeHits = clamp(1 + Math.floor(mag * 0.08), 1, T3_MAX_SPAWNS_PER_HIT);
        fireT3MultiHit(ctx, cascadeDmg, cascadeHits, 'abraded', tierId, mag, lensId, weaponId, '#c8963c');
        ctx.fluid.addExplosion(ctx.mote.x, ctx.mote.y, 0.15, 0.8, 0.6, 0.2);
        _sandCascading = false;
        break;
      }

      // ── Quartz: Perfect Refraction ───────────────────────────────────────────
      case 'quartz': {
        if (_quartzBouncing) break; // depth guard
        if (Math.random() >= getProcChance(mag)) break;

        _quartzBouncing = true;
        const bounceDmg = hitDamage * 0.35;
        // Fire 1 bounce hit (to whatever closest target is — may differ from primary)
        const target = ctx.findClosestTarget(T3_RANGE_SQ);
        if (target) {
          const dmg = damageT3Target(ctx, target, bounceDmg);
          if (dmg > 0) {
            const entity = extractT2TargetEntity(target);
            if (entity) applyT3Status(entity, 'refracted', tierId, mag, lensId, weaponId);
            ctx.spawnHitVisualsAt(target.x, target.y, 200, dmg, '#e8f8ff', '#c0e8ff');
          }
        }
        _quartzBouncing = false;
        break;
      }

      // ── Ruby: Meltdown Core ──────────────────────────────────────────────────
      case 'ruby': {
        if (!targetEntity) break;

        const nowMs = performance.now();
        const lastExplosion = _meltdownLastExplosionTs.get(targetEntity) ?? -Infinity;
        const onCooldown = (nowMs - lastExplosion) < MELTDOWN_COOLDOWN_MS;

        // Accumulate heat
        const heat = Math.min((_meltdownHeat.get(targetEntity) ?? 0) + MELTDOWN_HEAT_PER_HIT, MELTDOWN_HEAT_MAX);
        _meltdownHeat.set(targetEntity, heat);

        if (heat >= MELTDOWN_HEAT_THRESHOLD && !onCooldown) {
          // Trigger meltdown explosion
          _meltdownHeat.set(targetEntity, 0);
          _meltdownLastExplosionTs.set(targetEntity, nowMs);

          const e = targetEntity as { x?: number; y?: number };
          const ex = e.x ?? ctx.mote.x;
          const ey = e.y ?? ctx.mote.y;
          const explosionDmg = hitDamage * clamp(mag * 0.015, 0.15, 0.50);

          ctx.fluid.addExplosion(ex, ey, 0.7, 1.0, 0.3, 0.0);
          ctx.spawnHitVisualsAt(ex, ey, 300, explosionDmg, '#ff5500', '#ff2200');

          let spawns = 0;
          for (let i = 0; i < MELTDOWN_EXPLOSION_HITS && spawns < T3_MAX_SPAWNS_PER_HIT; i++) {
            const t = ctx.findClosestTarget(T3_RANGE_SQ);
            if (!t) break;
            const dmg = damageT3Target(ctx, t, explosionDmg);
            if (dmg > 0) {
              const entity = extractT2TargetEntity(t);
              if (entity) applyT3Status(entity, 'burning', tierId, mag, lensId, weaponId);
              ctx.spawnHitVisualsAt(t.x, t.y, 200, dmg, '#ff6600', '#ff3300');
              spawns++;
            }
          }
        }

        // Check death effects after meltdown
        _checkDeathEffects(targetEntity, ctx, hitDamage, mag, lensId, weaponId);
        break;
      }

      // ── Citrine: Radiant Detonation ──────────────────────────────────────────
      case 'citrine': {
        if (!targetEntity) break;
        // Tag this enemy as a detonation candidate (checked on death)
        _t3CitrineTagged.add(targetEntity);
        // Check if this hit killed it
        _checkDeathEffects(targetEntity, ctx, hitDamage * 0.8, mag, lensId, weaponId);
        break;
      }

      // ── Emerald: Viridian Bloom ──────────────────────────────────────────────
      case 'emerald': {
        if (!targetEntity) break;
        // Tag this enemy as a bloom candidate (checked on death)
        _t3EmeraldTagged.add(targetEntity);
        // Check if this hit killed it
        _checkDeathEffects(targetEntity, ctx, hitDamage * 0.5, mag, lensId, weaponId);
        break;
      }

      // ── Sapphire: Absolute Zero ──────────────────────────────────────────────
      case 'sapphire': {
        if (!targetEntity) break;

        // Check if target is already frozen — shatter on hit (damage bonus already applied
        // via getIncomingDamageMult returning 1.5× for frozen; here we remove frozen status
        // and show shatter visual).
        if (hasStatus(targetEntity, 'frozen')) {
          removeStatus(targetEntity, 'frozen');
          const e = targetEntity as { x?: number; y?: number };
          ctx.spawnHitVisualsAt(e.x ?? 0, e.y ?? 0, 200, hitDamage * 0.5, '#aaeeff', '#66ddff');
          // Remove chill-hit counter for this lens after shatter
          const hitMap = _sapphireChillHits.get(targetEntity);
          if (hitMap) hitMap.delete(lensId);
          break;
        }

        // Accumulate chill hits from this lens
        let hitMap = _sapphireChillHits.get(targetEntity);
        if (!hitMap) {
          hitMap = new Map<string, number>();
          _sapphireChillHits.set(targetEntity, hitMap);
        }
        const chillHits = (hitMap.get(lensId) ?? 0) + 1;
        hitMap.set(lensId, chillHits);

        if (chillHits >= CHILL_FREEZE_HITS && hasStatus(targetEntity, 'chilled')) {
          // Freeze the enemy
          hitMap.set(lensId, 0);
          const freezeDuration = isEliteOrBoss(targetEntity) ? FREEZE_DURATION_ELITE_MS : FREEZE_DURATION_MS;
          applyLensStatus(targetEntity, {
            key: 'frozen',
            sourceTierId: tierId,
            sourceLensId: lensId,
            sourceWeaponId: weaponId,
            durationMs: freezeDuration,
            magnitude: mag,
          });
          const e = targetEntity as { x?: number; y?: number };
          ctx.spawnHitVisualsAt(e.x ?? 0, e.y ?? 0, 200, 0, '#aaeeff', '#66ccff');
          ctx.fluid.addExplosion(e.x ?? 0, e.y ?? 0, 0.3, 0.4, 0.8, 1.0);
        }
        break;
      }

      // ── Iolite: Time Fracture ────────────────────────────────────────────────
      case 'iolite': {
        if (!targetEntity) break;
        if (_ioliteTimeFracturing) break;          // depth guard
        if (!hasStatus(targetEntity, 'timeWarped')) break;
        if (Math.random() >= getProcChance(mag)) break;

        _ioliteTimeFracturing = true;
        const fractureDmg  = hitDamage * 0.40;
        const fractureHits = clamp(1 + Math.floor(mag * 0.06), 1, T3_MAX_SPAWNS_PER_HIT);
        fireT3MultiHit(ctx, fractureDmg, fractureHits, 'timeWarped', tierId, mag, lensId, weaponId, '#8866ff');
        const ite = targetEntity as { x?: number; y?: number };
        ctx.fluid.addExplosion(ite.x ?? ctx.mote.x, ite.y ?? ctx.mote.y, 0.25, 0.55, 0.9, 0.25);
        _ioliteTimeFracturing = false;
        break;
      }

      // ── Amethyst: Mirror Volley ──────────────────────────────────────────────
      case 'amethyst': {
        if (_amethystMirroring) break;             // depth guard — mirror hits cannot mirror
        if (Math.random() >= getProcChance(mag)) break;

        _amethystMirroring = true;
        const mirrorDmg  = hitDamage * 0.35;
        const mirrorHits = clamp(2 + Math.floor(mag * 0.06), 2, Math.min(T3_MAX_SPAWNS_PER_HIT, 5));
        for (let i = 0; i < mirrorHits; i++) {
          const t = ctx.findClosestTarget(T3_RANGE_SQ);
          if (!t) break;
          const dmg = damageT3Target(ctx, t, mirrorDmg);
          if (dmg > 0) {
            const entity = extractT2TargetEntity(t);
            if (entity) {
              // Apply Echo-Marked with a real echo damage so the mark has value.
              applyLensStatus(entity, {
                key: 'echoMarked',
                sourceTierId: tierId,
                sourceLensId: lensId,
                sourceWeaponId: weaponId,
                durationMs: 3500,
                magnitude: mag,
                echoDamage: mirrorDmg * 0.5,
              });
            }
            ctx.spawnHitVisualsAt(t.x, t.y, 200, dmg, '#dd88ff', '#bb66dd');
          }
        }
        const ame = targetEntity as { x?: number; y?: number } | null;
        const ameSrcX = ame?.x ?? ctx.mote.x;
        const ameSrcY = ame?.y ?? ctx.mote.y;
        ctx.fluid.addExplosion(ameSrcX, ameSrcY, 0.2, 0.8, 0.45, 0.9);
        _amethystMirroring = false;
        break;
      }

      // ── Diamond: Faultline Break ─────────────────────────────────────────────
      case 'diamond': {
        if (!targetEntity) break;
        if (_diamondFaultlining) break;            // depth guard
        if (!hasStatus(targetEntity, 'cracked')) break;
        if (Math.random() >= getProcChance(mag)) break;

        _diamondFaultlining = true;
        // TODO: scale faultlineDmg from armor/defense reduction when armor system exists.
        const faultlineDmg  = hitDamage * 0.45;
        const faultlineHits = clamp(1 + Math.floor(mag * 0.05), 1, T3_MAX_SPAWNS_PER_HIT);
        fireT3MultiHit(ctx, faultlineDmg, faultlineHits, 'cracked', tierId, mag, lensId, weaponId, '#ccffff');
        const die = targetEntity as { x?: number; y?: number };
        ctx.fluid.addExplosion(die.x ?? ctx.mote.x, die.y ?? ctx.mote.y, 0.5, 0.95, 1.0, 0.9);
        _diamondFaultlining = false;
        break;
      }

      // ── Nullstone: Event Horizon ─────────────────────────────────────────────
      case 'nullstone': {
        if (!targetEntity) break;
        if (!hasStatus(targetEntity, 'gravitized')) break;
        if (Math.random() >= getProcChance(mag)) break;
        if (_eventHorizonZones.length >= EVENT_HORIZON_MAX_ACTIVE) break;

        const nse = targetEntity as { x?: number; y?: number };
        const ehX = nse.x ?? ctx.mote.x;
        const ehY = nse.y ?? ctx.mote.y;
        _eventHorizonZones.push({
          x: ehX, y: ehY,
          remainingMs: EVENT_HORIZON_DURATION_MS,
          tickTimer: EVENT_HORIZON_TICK_MS,
          damage: hitDamage * 0.20,
          magnitude: mag,
          lensId,
          weaponId,
        });
        applyT3Status(targetEntity, 'gravitized', tierId, mag, lensId, weaponId);
        ctx.spawnHitVisualsAt(ehX, ehY, 200, 0, '#220033', '#440066');
        ctx.fluid.addExplosion(ehX, ehY, 0.05, 0.1, 0.0, 0.3);
        break;
      }

      // ── Fracteryl: Infinite Descent ──────────────────────────────────────────
      case 'fracteryl': {
        if (!targetEntity) break;
        if (Math.random() >= getProcChance(mag)) break;

        // Tag enemy for descent monitoring; update if already tagged.
        const existingDescent = _fracterylDescentData.get(targetEntity);
        if (!existingDescent) {
          _fracterylDescentData.set(targetEntity, {
            hadFractalWound: hasStatus(targetEntity, 'fractalWound'),
            repeatCount: 0,
            lensId,
            weaponId,
            magnitude: mag,
          });
        } else {
          existingDescent.hadFractalWound = existingDescent.hadFractalWound || hasStatus(targetEntity, 'fractalWound');
          existingDescent.magnitude       = Math.max(existingDescent.magnitude, mag);
        }
        break;
      }

      // ── Eigenstein: Reality Cascade ──────────────────────────────────────────
      case 'eigenstein': {
        if (!targetEntity) break;
        if (!hasStatus(targetEntity, 'riftScarred')) break;

        // Increment per-enemy/source instability (reset when riftScarred expires).
        let instabilityMap = _realityCascadeInstability.get(targetEntity);
        if (!instabilityMap) {
          instabilityMap = new Map<string, number>();
          _realityCascadeInstability.set(targetEntity, instabilityMap);
        }
        const sourceKey   = lensId || weaponId;
        const instability = (instabilityMap.get(sourceKey) ?? 0) + 1;
        instabilityMap.set(sourceKey, instability);

        if (instability >= REALITY_CASCADE_THRESHOLD) {
          // Partial clear: floor(instability / 2) remains.
          instabilityMap.set(sourceKey, Math.floor(instability / 2));

          const riftMult    = getRiftScarredDamageMult(targetEntity, sourceKey);
          const rawDmg      = hitDamage * REALITY_CASCADE_BASE_MULT * riftMult;
          const cascadeDmg  = clamp(rawDmg, hitDamage * 0.5, hitDamage * 3.0);

          const ege = targetEntity as { x?: number; y?: number };
          const egX = ege.x ?? ctx.mote.x;
          const egY = ege.y ?? ctx.mote.y;
          ctx.spawnHitVisualsAt(egX, egY, 300, cascadeDmg, '#9922cc', '#440088');
          ctx.fluid.addExplosion(egX, egY, 0.1, 0.5, 0.0, 0.7);

          const chainHits = clamp(2 + Math.floor(mag * 0.04), 2, REALITY_CASCADE_MAX_CHAIN);
          fireT3MultiHit(ctx, cascadeDmg * 0.6, chainHits, 'riftScarred', tierId, mag, lensId, weaponId, '#9922cc');
        }
        break;
      }
    }
  }
}

// ── Per-frame tick ─────────────────────────────────────────────────────────────

interface MinimalEnemy {
  hp: number;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
}

/** Iterate all enemy arrays looking for dead tagged enemies; returns those arrays. */
type EnemyArrays = {
  enemies: MinimalEnemy[];
  sapphireEnemies: MinimalEnemy[];
  emeraldEnemies: MinimalEnemy[];
  amberEnemies: MinimalEnemy[];
  voidEnemies: MinimalEnemy[];
  quartzEnemies: MinimalEnemy[];
  rubyEnemies: MinimalEnemy[];
  sunstoneEnemies: MinimalEnemy[];
  citrineEnemies: MinimalEnemy[];
  ioliteEnemies: MinimalEnemy[];
  amethystEnemies: MinimalEnemy[];
  diamondEnemies: MinimalEnemy[];
  nullstoneEnemies: MinimalEnemy[];
  fracterylEnemies: MinimalEnemy[];
  eigensteinEnemies: MinimalEnemy[];
  eliteEnemies: MinimalEnemy[];
  polyominoEnemies: MinimalEnemy[];
  fissilePolyominoEnemies: MinimalEnemy[];
  refractorPolyominoEnemies: MinimalEnemy[];
  dustWispEnemies: MinimalEnemy[];
  ribbonWormEnemies: MinimalEnemy[];
  lanternMothEnemies: MinimalEnemy[];
  eyeStalkEnemies: MinimalEnemy[];
  jellyfishEnemies: MinimalEnemy[];
  clothGhostEnemies: MinimalEnemy[];
  plantTurretEnemies: MinimalEnemy[];
  gearInsectEnemies: MinimalEnemy[];
  spiderCrawlerEnemies: MinimalEnemy[];
  moteSwarmEnemies: MinimalEnemy[];
  shadowHandEnemies: MinimalEnemy[];
  sandFishEnemies: MinimalEnemy[];
  quartzFishEnemies: MinimalEnemy[];
  rubyFishEnemies: MinimalEnemy[];
  sunstoneFishEnemies: MinimalEnemy[];
  emeraldFishEnemies: MinimalEnemy[];
  sapphireFishEnemies: MinimalEnemy[];
  amethystFishEnemies: MinimalEnemy[];
  diamondFishEnemies: MinimalEnemy[];
};

/**
 * Per-frame tick for T3 effects:
 *   1. Tick Ruby meltdown cooldowns.
 *   2. Detect dead tagged enemies in all arrays and fire Citrine/Emerald death effects.
 *   3. Tick active Emerald bloom zones.
 *
 * Call once per frame from rpg-render-update, after tickLensTier2DelayedEffects.
 */
export function tickLensTier3Effects(arrays: EnemyArrays, deltaMs: number): void {
  const ctx = _storedCtx;

  // ── 1. Ruby cooldowns use performance.now() timestamps — no per-frame update needed. ──

  // ── 2. Detect dead tagged enemies across all arrays ───────────────────────────
  if (ctx) {
    const allArrays: MinimalEnemy[][] = [
      arrays.enemies, arrays.sapphireEnemies, arrays.emeraldEnemies,
      arrays.amberEnemies, arrays.voidEnemies, arrays.quartzEnemies,
      arrays.rubyEnemies, arrays.sunstoneEnemies, arrays.citrineEnemies,
      arrays.ioliteEnemies, arrays.amethystEnemies, arrays.diamondEnemies,
      arrays.nullstoneEnemies, arrays.fracterylEnemies, arrays.eigensteinEnemies,
      arrays.eliteEnemies, arrays.polyominoEnemies, arrays.fissilePolyominoEnemies,
      arrays.refractorPolyominoEnemies,
      arrays.dustWispEnemies, arrays.ribbonWormEnemies, arrays.lanternMothEnemies,
      arrays.eyeStalkEnemies, arrays.jellyfishEnemies, arrays.clothGhostEnemies,
      arrays.plantTurretEnemies, arrays.gearInsectEnemies, arrays.spiderCrawlerEnemies,
      arrays.moteSwarmEnemies, arrays.shadowHandEnemies, arrays.sandFishEnemies,
      arrays.quartzFishEnemies, arrays.rubyFishEnemies, arrays.sunstoneFishEnemies,
      arrays.emeraldFishEnemies, arrays.sapphireFishEnemies, arrays.amethystFishEnemies,
      arrays.diamondFishEnemies,
    ];

    for (const arr of allArrays) {
      for (let i = 0; i < arr.length; i++) {
        const enemy = arr[i]!;
        if (enemy.hp > 0) continue;
        const obj = enemy as object;

        if (_t3CitrineTagged.has(obj)) {
          if (hasStatus(obj, 'radiant') && Math.random() < DETONATE_CHANCE) {
            _fireCitrineDetonation(ctx, enemy.x, enemy.y, 30, 20, '', '');
          }
          // WeakSet auto-cleans when obj is GC'd; no explicit delete needed
        }

        if (_t3EmeraldTagged.has(obj)) {
          if (hasStatus(obj, 'poisoned')) {
            _fireEmeraldBloom(enemy.x, enemy.y, 20, 20, '', '', ctx);
          }
        }
      }
    }
  }

  // ── 3. Tick active Event Horizon zones (pull + damage + Gravitized) ─────────
  if (ctx) {
    for (let i = _eventHorizonZones.length - 1; i >= 0; i--) {
      const zone = _eventHorizonZones[i]!;
      zone.remainingMs -= deltaMs;
      if (zone.remainingMs <= 0) {
        _eventHorizonZones.splice(i, 1);
        continue;
      }

      zone.tickTimer -= deltaMs;
      if (zone.tickTimer <= 0) {
        zone.tickTimer += EVENT_HORIZON_TICK_MS;

        const ehAllArrays: MinimalEnemy[][] = [
          arrays.enemies, arrays.sapphireEnemies, arrays.emeraldEnemies,
          arrays.amberEnemies, arrays.voidEnemies, arrays.quartzEnemies,
          arrays.rubyEnemies, arrays.sunstoneEnemies, arrays.citrineEnemies,
          arrays.ioliteEnemies, arrays.amethystEnemies, arrays.diamondEnemies,
          arrays.nullstoneEnemies, arrays.fracterylEnemies, arrays.eigensteinEnemies,
          arrays.eliteEnemies, arrays.polyominoEnemies, arrays.fissilePolyominoEnemies,
          arrays.refractorPolyominoEnemies,
          arrays.dustWispEnemies, arrays.ribbonWormEnemies, arrays.lanternMothEnemies,
          arrays.eyeStalkEnemies, arrays.jellyfishEnemies, arrays.clothGhostEnemies,
          arrays.plantTurretEnemies, arrays.gearInsectEnemies, arrays.spiderCrawlerEnemies,
          arrays.moteSwarmEnemies, arrays.shadowHandEnemies,
          arrays.sandFishEnemies, arrays.quartzFishEnemies, arrays.rubyFishEnemies,
          arrays.sunstoneFishEnemies, arrays.emeraldFishEnemies, arrays.sapphireFishEnemies,
          arrays.amethystFishEnemies, arrays.diamondFishEnemies,
        ];

        let ehHits = 0;
        for (const arr of ehAllArrays) {
          for (let j = 0; j < arr.length && ehHits < 6; j++) {
            const e = arr[j]!;
            if (e.hp <= 0) continue;
            const dx = e.x - zone.x;
            const dy = e.y - zone.y;
            if (dx * dx + dy * dy > EVENT_HORIZON_RANGE_SQ) continue;

            // Inward pull (capped, conservative)
            if (typeof e.vx === 'number' && typeof e.vy === 'number') {
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const pull = Math.min(EVENT_HORIZON_PULL_STR * deltaMs, 5);
              e.vx -= (dx / dist) * pull;
              e.vy -= (dy / dist) * pull;
            }

            // Periodic void damage (direct hp modification, bypasses T3 pipeline)
            const dmgAmt = clamp(zone.damage, 1, 150);
            e.hp = Math.max(0, e.hp - dmgAmt);
            applyT3Status(e as object, 'gravitized', 'nullstone', zone.magnitude, zone.lensId, zone.weaponId);
            ctx.spawnHitVisualsAt(e.x, e.y, 200, dmgAmt, '#330055', '#660099');
            ehHits++;
          }
        }
      }
    }
  }

  // ── 4. Fracteryl: Infinite Descent — check for fractalWound expiry ──────────
  {
    const descentArrays: MinimalEnemy[][] = [
      arrays.enemies, arrays.sapphireEnemies, arrays.emeraldEnemies,
      arrays.amberEnemies, arrays.voidEnemies, arrays.quartzEnemies,
      arrays.rubyEnemies, arrays.sunstoneEnemies, arrays.citrineEnemies,
      arrays.ioliteEnemies, arrays.amethystEnemies, arrays.diamondEnemies,
      arrays.nullstoneEnemies, arrays.fracterylEnemies, arrays.eigensteinEnemies,
      arrays.eliteEnemies, arrays.polyominoEnemies, arrays.fissilePolyominoEnemies,
      arrays.refractorPolyominoEnemies,
      arrays.dustWispEnemies, arrays.ribbonWormEnemies, arrays.lanternMothEnemies,
      arrays.eyeStalkEnemies, arrays.jellyfishEnemies, arrays.clothGhostEnemies,
      arrays.plantTurretEnemies, arrays.gearInsectEnemies, arrays.spiderCrawlerEnemies,
      arrays.moteSwarmEnemies, arrays.shadowHandEnemies,
      arrays.sandFishEnemies, arrays.quartzFishEnemies, arrays.rubyFishEnemies,
      arrays.sunstoneFishEnemies, arrays.emeraldFishEnemies, arrays.sapphireFishEnemies,
      arrays.amethystFishEnemies, arrays.diamondFishEnemies,
    ];

    for (const arr of descentArrays) {
      for (let j = 0; j < arr.length; j++) {
        const e = arr[j]!;
        const obj = e as object;

        // Eigenstein: clear per-source instability when riftScarred expires (check all living enemies)
        if (e.hp > 0) {
          const instabilityMap = _realityCascadeInstability.get(obj);
          if (instabilityMap && instabilityMap.size > 0 && !hasStatus(obj, 'riftScarred')) {
            instabilityMap.clear();
          }
        }

        const descent = _fracterylDescentData.get(obj);
        if (!descent) continue;

        // Enemy died — WeakMap auto-GCs; just skip
        if (e.hp <= 0) continue;

        const hasFractalWound = hasStatus(obj, 'fractalWound');

        if (hasFractalWound) {
          // Record that a wound has been active
          descent.hadFractalWound = true;
        } else if (descent.hadFractalWound) {
          // Wound was present but is now gone — check for descent
          if (descent.repeatCount < INFINITE_DESCENT_MAX_REPEATS && Math.random() < INFINITE_DESCENT_PROC_CHANCE) {
            descent.repeatCount++;
            // hadFractalWound = false so we wait for the new wound to appear before re-triggering
            descent.hadFractalWound = false;
            const reducedMag = descent.magnitude * Math.pow(INFINITE_DESCENT_MAG_DECAY, descent.repeatCount);
            applyLensStatus(obj, {
              key: 'fractalWound',
              sourceTierId: 'fracteryl',
              sourceLensId: descent.lensId,
              sourceWeaponId: descent.weaponId,
              durationMs: 3500,
              magnitude: reducedMag,
              tickEveryMs: 900,
              fractalInitialDamage: reducedMag * 0.5,
            });
            if (ctx) ctx.spawnHitVisualsAt(e.x, e.y, 150, 0, '#44ff88', '#22aa44');
          } else {
            // Failed roll or cap reached — clear descent data for this enemy
            _fracterylDescentData.delete(obj);
          }
        }
      }
    }
  }

  // ── 5. Tick active Emerald bloom zones ────────────────────────────────────────
  if (ctx) {
    for (let i = _bloomZones.length - 1; i >= 0; i--) {
      const zone = _bloomZones[i]!;
      zone.remainingMs -= deltaMs;
      if (zone.remainingMs <= 0) {
        _bloomZones.splice(i, 1);
        continue;
      }

      zone.tickTimer -= deltaMs;
      if (zone.tickTimer <= 0) {
        zone.tickTimer += BLOOM_TICK_MS;

        // Damage enemies in bloom radius
        // We iterate all arrays instead of findClosestTarget (which is mote-relative)
        const allArrays: MinimalEnemy[][] = [
          arrays.enemies, arrays.sapphireEnemies, arrays.emeraldEnemies,
          arrays.amberEnemies, arrays.voidEnemies, arrays.quartzEnemies,
          arrays.rubyEnemies, arrays.sunstoneEnemies, arrays.citrineEnemies,
          arrays.ioliteEnemies, arrays.amethystEnemies, arrays.diamondEnemies,
          arrays.nullstoneEnemies, arrays.fracterylEnemies, arrays.eigensteinEnemies,
          arrays.eliteEnemies, arrays.polyominoEnemies, arrays.fissilePolyominoEnemies,
          arrays.refractorPolyominoEnemies,
          arrays.dustWispEnemies, arrays.ribbonWormEnemies, arrays.lanternMothEnemies,
          arrays.eyeStalkEnemies, arrays.jellyfishEnemies, arrays.clothGhostEnemies,
          arrays.plantTurretEnemies, arrays.gearInsectEnemies, arrays.spiderCrawlerEnemies,
          arrays.moteSwarmEnemies, arrays.shadowHandEnemies,
          arrays.sandFishEnemies, arrays.quartzFishEnemies, arrays.rubyFishEnemies,
          arrays.sunstoneFishEnemies, arrays.emeraldFishEnemies, arrays.sapphireFishEnemies,
          arrays.amethystFishEnemies, arrays.diamondFishEnemies,
        ];

        let bloomHits = 0;
        for (const arr of allArrays) {
          for (let j = 0; j < arr.length && bloomHits < 6; j++) {
            const e = arr[j]!;
            if (e.hp <= 0) continue;
            const dx = e.x - zone.x;
            const dy = e.y - zone.y;
            if (dx * dx + dy * dy > BLOOM_RANGE_SQ) continue;

            // Damage directly on the enemy object (bypass ctx.damageEnemy to keep
            // source: lens_tier3 semantic and avoid re-entering damage pipeline).
            const dmgAmt = clamp(zone.damage, 1, 200);
            e.hp = Math.max(0, e.hp - dmgAmt);
            applyT3Status(e as object, 'poisoned', 'emerald', zone.magnitude, zone.lensId, zone.weaponId);
            ctx.spawnHitVisualsAt(e.x, e.y, 200, dmgAmt, '#44dd44', '#22aa22');
            bloomHits++;
          }
        }
      }
    }
  }
}

// ── Exported query helpers ─────────────────────────────────────────────────────

/** Returns the number of active Emerald bloom zones (for tests). */
export function getActiveBloomZoneCount(): number {
  return _bloomZones.length;
}

/** Returns the current meltdown heat for an enemy (for tests). */
export function getMeltdownHeat(enemy: object): number {
  return _meltdownHeat.get(enemy) ?? 0;
}

/** Returns true if an enemy is tagged for Citrine detonation (for tests). */
export function isCitrineTagged(enemy: object): boolean {
  return _t3CitrineTagged.has(enemy);
}

/** Returns true if an enemy is tagged for Emerald bloom (for tests). */
export function isEmeraldTagged(enemy: object): boolean {
  return _t3EmeraldTagged.has(enemy);
}

/** Returns the number of active Event Horizon zones (for tests). */
export function getEventHorizonZoneCount(): number {
  return _eventHorizonZones.length;
}

/** Returns Infinite Descent repeat count for an enemy (for tests). */
export function getDescentRepeatCount(enemy: object): number {
  return _fracterylDescentData.get(enemy)?.repeatCount ?? 0;
}

/** Returns Reality Cascade instability for an enemy/source (for tests). */
export function getRealityCascadeInstability(enemy: object, sourceKey: string): number {
  return _realityCascadeInstability.get(enemy)?.get(sourceKey) ?? 0;
}
