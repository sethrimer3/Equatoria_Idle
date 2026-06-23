/**
 * lens-tier2-effects.ts — Tier 2 lens effect handler for RPG combat.
 *
 * Exports:
 *   handleLensTier2EffectsOnWeaponHit(params) — call after a weapon hit to proc
 *                                               implemented Tier 2 effects.
 *   tickLensTier2DelayedEffects(deltaMs)       — call once per frame to process
 *                                               Iolite delayed echo strikes.
 *   clearPendingTier2DelayedStrikes()          — clear pending strikes (for tests).
 *
 * Safety rules:
 *   - Secondary hits use ctx.findClosestTarget and direct damage fns — they do NOT
 *     re-enter performWeaponAttack, so Tier 2 effects cannot trigger recursively.
 *   - Iolite delayed strikes modify hp directly, bypassing the hit pipeline.
 *   - Amethyst Phantom Repeat uses the echoMarked pending-echo system (tickEnemyStatuses)
 *     with echoDamage; it does NOT re-enter the T2 handler.
 *   - All Tier 3 effects are silently skipped.
 */

import type { RpgPlayerAttackCtx } from './rpg-player-attack';
import type { CraftedLensData } from '../../data/rpg/lens-types';
import type { ClosestTarget } from './rpg-types';
import { applyLensStatus } from '../../sim/rpg/enemy-status-effects';
import type { LensStatusParams, EnemyStatusKey } from '../../sim/rpg/enemy-status-effects';
import type { TierId } from '../../data/tiers';
import { LENS_T2_IMPLEMENTED_TIER_IDS } from '../../data/rpg/lens-definitions';
import {
  LENS_T2_RANGE_SQ,
  LENS_T2_PROC_MAGNITUDE_FACTOR,
  LENS_T2_PROC_CHANCE_MIN, LENS_T2_PROC_CHANCE_MAX,
  LENS_T2_DMG_MAGNITUDE_FACTOR,
  LENS_T2_DMG_FRACTION_MIN, LENS_T2_DMG_FRACTION_MAX,
  LENS_T2_MAX_HITS_PER_EFFECT, LENS_T2_MAX_TOTAL_SPAWNS,
  LENS_T2_PROC_COOLDOWN_MS,
} from '../../data/rpg/lens-weave-balance';
import { recordEquipmentProcEvent } from '../../dev/equipment-proc-log';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Re-export for callers that imported the old local name. */
export const T2_PROC_COOLDOWN_MS = LENS_T2_PROC_COOLDOWN_MS;
const _lastT2ProcMs = new Map<string, number>();

/** Reset per-effect proc cooldown state — use in tests to avoid state leakage. */
export function clearT2ProcCooldowns(): void {
  _lastT2ProcMs.clear();
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function getProcChance(magnitude: number): number {
  return clamp(magnitude * 0.012, T2_PROC_MIN, T2_PROC_MAX);
}

function getSecDmgFraction(magnitude: number): number {
  return clamp(magnitude * 0.012, T2_DMG_MIN, T2_DMG_MAX);
}

// ── Entity extraction ─────────────────────────────────────────────────────────

/** Extract the primary enemy entity from a ClosestTarget for status application. */
export function extractT2TargetEntity(t: ClosestTarget): object | null {
  return t.laser ?? t.sapphire ?? t.emerald ?? t.amber ?? t.void
    ?? t.quartz ?? t.ruby ?? t.sunstone ?? t.citrine ?? t.iolite
    ?? t.amethyst ?? t.diamond ?? t.nullstone ?? t.fracteryl ?? t.eigenstein
    ?? t.polyomino ?? t.fissilePolyomino ?? t.refractorPolyomino
    ?? t.elite ?? t.boss ?? t.alivenParticle
    ?? t.dustWisp ?? t.ribbonWorm ?? t.lanternMoth ?? t.eyeStalk
    ?? t.jellyfish ?? t.clothGhost ?? t.plantTurret ?? t.gearInsect
    ?? t.spiderCrawler ?? t.moteSwarm ?? t.shadowHand
    ?? t.sandFish ?? t.quartzFish ?? t.rubyFish ?? t.sunstoneFish
    ?? t.emeraldFish ?? t.sapphireFish ?? t.amethystFish ?? t.diamondFish
    ?? null;
}

// ── Secondary damage dispatch ─────────────────────────────────────────────────

/**
 * Damage a ClosestTarget using the appropriate ctx damage function.
 * No pierce ratio is applied for secondary T2 hits.
 * Returns actual damage dealt (0 for unhandled variants).
 */
function damageSecTarget(ctx: RpgPlayerAttackCtx, t: ClosestTarget, dmg: number): number {
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

// ── Status application helper ──────────────────────────────────────────────────

function applyT2Status(
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
    tickEveryMs: (statusKey === 'burning' || statusKey === 'poisoned' || statusKey === 'fractalWound') ? 1000 : undefined,
  };
  applyLensStatus(entity, params);
}

// ── Multi-hit effect helper ────────────────────────────────────────────────────

/**
 * Find up to `maxHits` targets via findClosestTarget and deal secondary damage +
 * apply a T1 status to each. Returns the number of successful hits.
 */
function fireMultiHitEffect(
  ctx: RpgPlayerAttackCtx,
  secDmg: number,
  spawnBudget: number,
  maxHits: number,
  statusKey: EnemyStatusKey,
  tierId: TierId,
  magnitude: number,
  lensId: string,
  weaponId: string,
  hitColor: string,
): number {
  const count = Math.min(spawnBudget, maxHits);
  let hits = 0;
  for (let i = 0; i < count; i++) {
    const target = ctx.findClosestTarget(T2_RANGE_SQ);
    if (!target) break;
    const dmg = damageSecTarget(ctx, target, secDmg);
    if (dmg > 0) {
      const entity = extractT2TargetEntity(target);
      if (entity) applyT2Status(entity, statusKey, tierId, magnitude, lensId, weaponId);
      ctx.spawnHitVisualsAt(target.x, target.y, 200, dmg, hitColor, hitColor);
      hits++;
    }
  }
  return hits;
}

// ── Iolite: Delayed Echo Strike ────────────────────────────────────────────────

interface PendingDelayedStrike {
  remainingMs: number;
  targetEntity: object;
  damage: number;
  magnitude: number;
  lensId: string;
  weaponId: string;
  spawnVisuals: (x: number, y: number) => void;
}

const _pendingIoliteStrikes: PendingDelayedStrike[] = [];

/** Reset pending delayed strikes — use in tests to avoid state leakage. */
export function clearPendingTier2DelayedStrikes(): void {
  _pendingIoliteStrikes.length = 0;
}

/**
 * Tick Iolite delayed echo strikes.
 * Call once per frame from rpg-render-update after tickLensStatuses.
 */
export function tickLensTier2DelayedEffects(deltaMs: number): void {
  for (let i = _pendingIoliteStrikes.length - 1; i >= 0; i--) {
    const strike = _pendingIoliteStrikes[i]!;
    strike.remainingMs -= deltaMs;
    if (strike.remainingMs > 0) continue;

    _pendingIoliteStrikes.splice(i, 1);
    const target = strike.targetEntity as { hp?: number; x?: number; y?: number };
    if (typeof target.hp !== 'number' || target.hp <= 0) continue;

    target.hp = Math.max(0, target.hp - strike.damage);
    strike.spawnVisuals(target.x ?? 0, target.y ?? 0);
    applyT2Status(strike.targetEntity, 'timeWarped', 'iolite', strike.magnitude, strike.lensId, strike.weaponId);
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────

export interface LensTier2HitParams {
  /** Primary hit entity; used for Iolite delayed echo. May be null for AoE attacks. */
  targetEntity: object | null;
  /** Base weapon damage of the triggering hit (before any T2 scaling). */
  hitDamage: number;
  lens: CraftedLensData;
  weaponId: string;
  ctx: RpgPlayerAttackCtx;
}

/**
 * Process all Tier 2 lens effects for a weapon hit.
 * Call after applyLensStatusesOnHit in each attack handler.
 *
 * Secondary damage goes through normal damage functions but does NOT re-enter
 * the weapon attack pipeline, so Tier 2 effects cannot trigger recursively.
 */
export function handleLensTier2EffectsOnWeaponHit(params: LensTier2HitParams): void {
  const { lens, hitDamage, targetEntity, weaponId, ctx } = params;

  let totalSpawns = 0;

  const now = Date.now();

  for (const effect of lens.effects) {
    if (effect.effectTier !== 2) continue;
    if (!LENS_T2_IMPLEMENTED_TIER_IDS.has(effect.tierId)) continue;

    if (Math.random() >= getProcChance(effect.magnitude)) continue;

    const cooldownKey = `${weaponId}:${effect.key}`;
    if (now - (_lastT2ProcMs.get(cooldownKey) ?? 0) < T2_PROC_COOLDOWN_MS) continue;
    _lastT2ProcMs.set(cooldownKey, now);

    const secDmg = hitDamage * getSecDmgFraction(effect.magnitude);
    const spawnBudget = Math.min(T2_MAX_HITS_PER_EFFECT, T2_MAX_TOTAL_SPAWNS - totalSpawns);
    if (spawnBudget <= 0) break;

    const tierId = effect.tierId as TierId;

    switch (tierId) {
      case 'sand':
        // Sand Spray: 2–6 fragments that apply Abraded
        totalSpawns += fireMultiHitEffect(
          ctx, secDmg, spawnBudget,
          Math.min(6, 2 + Math.floor(effect.magnitude * 0.15)),
          'abraded', tierId, effect.magnitude, lens.id, weaponId,
          '#d4a055',
        );
        break;

      case 'quartz':
        // Prism Split: 2–5 crystal beams that apply Refracted
        totalSpawns += fireMultiHitEffect(
          ctx, secDmg, spawnBudget,
          Math.min(5, 2 + Math.floor(effect.magnitude * 0.12)),
          'refracted', tierId, effect.magnitude, lens.id, weaponId,
          '#c0e8ff',
        );
        break;

      case 'ruby':
        // Ruby Beam Splinters: 2–6 beamlets that apply Burning
        totalSpawns += fireMultiHitEffect(
          ctx, secDmg, spawnBudget,
          Math.min(6, 2 + Math.floor(effect.magnitude * 0.15)),
          'burning', tierId, effect.magnitude, lens.id, weaponId,
          '#ff4020',
        );
        break;

      case 'citrine': {
        // Solar Flare Burst: fluid flash + 2–5 hits that apply Radiant
        ctx.fluid.addExplosion(ctx.mote.x, ctx.mote.y, 0.4, 1.0, 0.9, 0.1);
        totalSpawns += fireMultiHitEffect(
          ctx, secDmg, spawnBudget,
          Math.min(5, 2 + Math.floor(effect.magnitude * 0.12)),
          'radiant', tierId, effect.magnitude, lens.id, weaponId,
          '#ffdd00',
        );
        break;
      }

      case 'emerald':
        // Venom Spores: 2–5 spore hits that apply Poisoned
        totalSpawns += fireMultiHitEffect(
          ctx, secDmg, spawnBudget,
          Math.min(5, 2 + Math.floor(effect.magnitude * 0.12)),
          'poisoned', tierId, effect.magnitude, lens.id, weaponId,
          '#44dd44',
        );
        break;

      case 'sapphire':
        // Ice Shards: 2–6 shard hits that apply Chilled
        totalSpawns += fireMultiHitEffect(
          ctx, secDmg, spawnBudget,
          Math.min(6, 2 + Math.floor(effect.magnitude * 0.15)),
          'chilled', tierId, effect.magnitude, lens.id, weaponId,
          '#66eeff',
        );
        break;

      case 'iolite':
        // Delayed Echo Strike: schedule a strike after 500–800ms
        if (targetEntity) {
          const delay = 500 + Math.random() * 300;
          const capturedDmg = secDmg;
          const capturedCtx = ctx;
          _pendingIoliteStrikes.push({
            remainingMs: delay,
            targetEntity,
            damage: capturedDmg,
            magnitude: effect.magnitude,
            lensId: lens.id,
            weaponId,
            spawnVisuals: (x, y) => capturedCtx.spawnHitVisualsAt(x, y, 200, capturedDmg, '#8866ff', '#8866ff'),
          });
          totalSpawns += 1;
        }
        break;

      case 'amethyst': {
        // Phantom Repeat: queue a delayed ghost echo via the echoMarked pending-echo system.
        // Damage fires ~600ms later inside tickEnemyStatuses — does NOT re-enter the T2 handler.
        if (targetEntity) {
          const te = targetEntity as { x?: number; y?: number };
          applyLensStatus(targetEntity, {
            key: 'echoMarked',
            sourceTierId: tierId,
            sourceLensId: lens.id,
            sourceWeaponId: weaponId,
            durationMs: 3500,
            magnitude: effect.magnitude,
            echoDamage: secDmg,
          });
          ctx.spawnHitVisualsAt(te.x ?? 0, te.y ?? 0, 200, secDmg, '#bb77ff', '#cc88ff');
          totalSpawns += 1;
        }
        break;
      }

      case 'diamond':
        // Diamond Shrapnel: 2–5 angular shard hits that apply Cracked
        totalSpawns += fireMultiHitEffect(
          ctx, secDmg, spawnBudget,
          Math.min(5, 2 + Math.floor(effect.magnitude * 0.12)),
          'cracked', tierId, effect.magnitude, lens.id, weaponId,
          '#d8f4ff',
        );
        break;

      case 'nullstone': {
        // Gravity Pulse: inward void ripple + 2–5 hits that apply Gravitized
        ctx.fluid.addExplosion(ctx.mote.x, ctx.mote.y, 0.2, 0.1, 0.1, 0.3);
        totalSpawns += fireMultiHitEffect(
          ctx, secDmg, spawnBudget,
          Math.min(5, 2 + Math.floor(effect.magnitude * 0.12)),
          'gravitized', tierId, effect.magnitude, lens.id, weaponId,
          '#6633aa',
        );
        break;
      }

      case 'fracteryl':
        // Recursive Splinter: fractal shard hits (depth capped at 1) that apply Fractal Wound.
        // Reduced damage fraction reflects the split/decay nature of fractal shards.
        totalSpawns += fireMultiHitEffect(
          ctx, secDmg * 0.7, spawnBudget,
          Math.min(4, 1 + Math.floor(effect.magnitude * 0.10)),
          'fractalWound', tierId, effect.magnitude, lens.id, weaponId,
          '#55ee77',
        );
        break;

      case 'eigenstein':
        // Rift Slash: 1–2 dimensional rift hits that apply Rift-Scarred
        totalSpawns += fireMultiHitEffect(
          ctx, secDmg, spawnBudget,
          Math.min(2, 1 + Math.floor(effect.magnitude * 0.04)),
          'riftScarred', tierId, effect.magnitude, lens.id, weaponId,
          '#9933cc',
        );
        break;
    }
  }
}
