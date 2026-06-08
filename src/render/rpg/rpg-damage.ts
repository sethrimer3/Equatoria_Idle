/**
 * rpg-damage.ts — Per-entity damage functions for the RPG tab.
 *
 * Uses a factory pattern: createDamageFns() takes a recordDps callback
 * and returns all damage functions with the same signatures as before,
 * so they can be destructured in rpg-render.ts without changing call sites.
 */

import type {
  LaserEnemy,
  SapphireEnemy, SapphireMissile,
} from './rpg-types';
import type {
  EmeraldEnemy,
  AmberEnemy, AmberShard,
  VoidEnemy,
  QuartzEnemy, QuartzSpike,
  RubyEnemy, RubyBolt,
  SunstoneEnemy,
  CitrineEnemy, CitrineBolt,
  IoliteEnemy,
  AmethystEnemy, AmethystShard,
  DiamondEnemy, DiamondShard,
  NullstoneEnemy, VoidTendril,
  FracterylEnemy, FracterylShard,
  EigensteinEnemy,
  EliteEnemy,
} from './rpg-enemy-types';
import type { AlivenParticle, AlivenParticleGroup } from './rpg-aliven-types';
import type {
  DustWispEnemy, RibbonWormEnemy, LanternMothEnemy, EyeStalkEnemy,
  JellyfishEnemy, ClothGhostEnemy, PlantTurretEnemy, GearInsectEnemy,
  SpiderCrawlerEnemy, MoteSwarmEnemy, ShadowHandEnemy, PlantProjectile,
  SandFishEnemy, QuartzFishEnemy, RubyFishEnemy, SunstoneFishEnemy,
  EmeraldFishEnemy, SapphireFishEnemy, AmethystFishEnemy, DiamondFishEnemy,
} from './rpg-procedural-types';
import type {
  PolyominoEnemy, FissilePolyominoEnemy, RefractorPolyominoEnemy,
} from './polyomino-enemy-types';
import type { BinaryRingEnemy } from './rpg-binary-ring-encounter';
import type { NadirCubePointEnemy } from './nadir-cube-point-types';
import type { HorizonPentagonGroup, HorizonMissile } from './horizon-pentagon-types';
import { triggerHorizonPentagonSwap } from './horizon-pentagon-update';
import { handleAlivenParticleDeath } from './rpg-aliven-updates';
import { ALIVEN_HIT_FLASH_MS } from './rpg-aliven-constants';
import { MINIMUM_SHIELD_DAMAGE } from './rpg-constants';
import {
  ELITE_AMETHYST_GLOW, ELITE_CITRINE_GLOW, ELITE_DIAMOND_GLOW,
  ELITE_IOLITE_GLOW, ELITE_NULLSTONE_GLOW, ELITE_QUARTZ_GLOW,
  ELITE_RUBY_GLOW, ELITE_SUNSTONE_GLOW,
} from './rpg-enemy-constants';
import {
  PROC_HIT_FLASH_MS,
  SANDFISH_COLOR, QUARTZFISH_COLOR, RUBYFISH_COLOR, SUNSTONEFISH_COLOR,
  EMERALDFISH_COLOR, SAPPHIREFISH_COLOR, AMETHYSTFISH_COLOR, DIAMONDFISH_COLOR,
} from './rpg-procedural-constants';

export interface DamageCtx {
  recordDps(dmg: number, color?: string): void;
}

export function createDamageFns(ctx: DamageCtx) {
  const { recordDps } = ctx;

  /** Deals damage from the player to one laser enemy, respecting DEF and a DEF pierce ratio.
   *  Returns the actual damage dealt (0 if DEF fully absorbed the hit). */
  function damageEnemy(enemy: LaserEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) {
      enemy.hp -= dmg;
      recordDps(dmg, '#d3f3ff');
    }
    return dmg;
  }

  /**
   * Deals damage to a sapphire enemy, handling the shield.
   * bypassShield = true means the ruby laser is firing — ignore the shield.
   * Returns { dmg, wasShield } where dmg is the effective damage applied.
   */
  function damageSapphireEnemy(
    enemy: SapphireEnemy,
    rawDamage: number,
    defPierceRatio: number,
    bypassShield: boolean,
  ): number {
    if (!bypassShield && enemy.shieldHp > 0) {
      // Shields always absorb at least MINIMUM_SHIELD_DAMAGE, making chip damage possible.
      const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
      enemy.shieldHp = Math.max(0, enemy.shieldHp - dmg);
      recordDps(dmg, '#6bd9ff');
      return dmg;
    }
    // Hit the enemy body.
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) {
      enemy.hp -= dmg;
      recordDps(dmg, '#6bd9ff');
    }
    return dmg;
  }

  /** Deals damage to a missile (no DEF, no shield). Returns actual damage dealt. */
  function damageMissile(missile: SapphireMissile, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    missile.hp = Math.max(0, missile.hp - dmg);
    recordDps(dmg, '#6bd9ff');
    return dmg;
  }

  /** Deals damage to an emerald enemy. Returns actual damage dealt. */
  function damageEmeraldEnemy(enemy: EmeraldEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) {
      enemy.hp -= dmg;
      recordDps(dmg, '#8fff8f');
    }
    return dmg;
  }

  /** Deals damage to an amber enemy. Returns actual damage dealt. */
  function damageAmberEnemy(enemy: AmberEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) {
      enemy.hp -= dmg;
      recordDps(dmg, '#ffb86c');
    }
    return dmg;
  }

  /** Deals damage to an amber shard (no DEF). Returns actual damage dealt. */
  function damageAmberShard(shard: AmberShard, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    shard.hp = Math.max(0, shard.hp - dmg);
    recordDps(dmg, '#ffb86c');
    return dmg;
  }

  /** Deals damage to a void enemy (high DEF). Returns actual damage dealt. */
  function damageVoidEnemy(enemy: VoidEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) {
      enemy.hp -= dmg;
      recordDps(dmg, '#7b68ee');
    }
    return dmg;
  }

  function damageQuartzEnemy(enemy: QuartzEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) {
      enemy.hp -= dmg;
      recordDps(dmg, '#e0e0e0');
    }
    return dmg;
  }

  function damageQuartzSpike(spike: QuartzSpike, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    spike.hp = Math.max(0, spike.hp - dmg);
    recordDps(dmg, '#e0e0e0');
    return dmg;
  }

  function damageRubyEnemy(enemy: RubyEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) {
      enemy.hp -= dmg;
      recordDps(dmg, '#ff6b6b');
    }
    return dmg;
  }

  function damageRubyBolt(bolt: RubyBolt, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    bolt.hp = Math.max(0, bolt.hp - dmg);
    recordDps(dmg, '#ff6b6b');
    return dmg;
  }

  function damageSunstoneEnemy(enemy: SunstoneEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) {
      enemy.hp -= dmg;
      recordDps(dmg, '#ffd700');
    }
    return dmg;
  }

  function damageCitrineEnemy(enemy: CitrineEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) {
      enemy.hp -= dmg;
      recordDps(dmg, '#fff176');
    }
    return dmg;
  }

  function damageCitrineBolt(bolt: CitrineBolt, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    bolt.hp = Math.max(0, bolt.hp - dmg);
    recordDps(dmg, '#fff176');
    return dmg;
  }

  function damageIoliteEnemy(enemy: IoliteEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) {
      enemy.hp -= dmg;
      recordDps(dmg, '#9b59b6');
    }
    return dmg;
  }

  function damageAmethystEnemy(enemy: AmethystEnemy, rawDamage: number, defPierceRatio: number, bypassShield: boolean): number {
    if (!bypassShield && enemy.shieldHp > 0) {
      const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
      enemy.shieldHp = Math.max(0, enemy.shieldHp - dmg);
      recordDps(dmg, '#b388ff');
      return dmg;
    }
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) {
      enemy.hp -= dmg;
      recordDps(dmg, '#b388ff');
    }
    return dmg;
  }

  function damageAmethystShard(shard: AmethystShard, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    shard.hp = Math.max(0, shard.hp - dmg);
    recordDps(dmg, '#b388ff');
    return dmg;
  }

  function damageDiamondEnemy(enemy: DiamondEnemy, rawDamage: number, defPierceRatio: number): number {
    if (enemy.phaseInvuln) return 0;
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) {
      enemy.hp -= dmg;
      recordDps(dmg, '#e0e0ff');
    }
    return dmg;
  }

  function damageDiamondShard(shard: DiamondShard, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    shard.hp = Math.max(0, shard.hp - dmg);
    recordDps(dmg, '#e0e0ff');
    return dmg;
  }

  function damageNullstoneEnemy(enemy: NullstoneEnemy, rawDamage: number, defPierceRatio: number): number {
    if (enemy.isAbsorbing) return 0;
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) {
      enemy.hp -= dmg;
      recordDps(dmg, '#2c2c2c');
    }
    return dmg;
  }

  function damageVoidTendril(tendril: VoidTendril, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    tendril.hp = Math.max(0, tendril.hp - dmg);
    recordDps(dmg, '#7b68ee');
    return dmg;
  }

  function damageFracterylEnemy(enemy: FracterylEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) {
      enemy.hp -= dmg;
      recordDps(dmg, '#ff69b4');
    }
    return dmg;
  }

  function damageFracterylShard(shard: FracterylShard, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    shard.hp = Math.max(0, shard.hp - dmg);
    recordDps(dmg, '#ff69b4');
    return dmg;
  }

  function damageEigensteinEnemy(enemy: EigensteinEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) {
      enemy.hp -= dmg;
      recordDps(dmg, '#00ffff');
    }
    return dmg;
  }

  function damagePolyominoEnemy(enemy: PolyominoEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) {
      enemy.hp -= dmg;
      enemy.hitFlashMs = 120;
      recordDps(dmg, '#52b788');
    }
    return dmg;
  }

  function damageFissilePolyominoEnemy(enemy: FissilePolyominoEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) {
      enemy.hp -= dmg;
      enemy.hitFlashMs = 120;
      enemy.pendingSplit = true;
      recordDps(dmg, '#e9c46a');
    }
    return dmg;
  }

  function damageRefractorPolyominoEnemy(enemy: RefractorPolyominoEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) {
      enemy.hp -= dmg;
      enemy.hitFlashMs = 120;
      recordDps(dmg, '#00f5d4');
    }
    return dmg;
  }

  /**
   * Deals damage to an elite enemy.
   *
   * - Diamond elite is immune while isInvuln (fast-orbit phase).
   * - Nullstone elite is immune while isInvuln (singularity burst).
   * - Amethyst elite shield blocks damage first (min MINIMUM_SHIELD_DAMAGE).
   */
  function damageBinaryRingEnemy(enemy: BinaryRingEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) {
      enemy.hp -= dmg;
      recordDps(dmg, '#f5f0d0');
    }
    return dmg;
  }

  function damageNadirCubePointEnemy(e: NadirCubePointEnemy, raw: number, pierce: number): number {
    const actual = Math.max(1, raw - e.def * (1 - pierce));
    e.hp -= actual;
    e.hitFlashMs = 120;
    recordDps(actual, '#80ffff');
    return actual;
  }

  function damageEliteEnemy(enemy: EliteEnemy, rawDamage: number, defPierceRatio: number): number {
    // Invuln check for diamond and nullstone elites
    if (enemy.isInvuln && (enemy.tier === 'diamond' || enemy.tier === 'nullstone')) return 0;

    // Amethyst elite shield
    if (enemy.tier === 'amethyst' && enemy.shieldHp > 0) {
      const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
      enemy.shieldHp = Math.max(0, enemy.shieldHp - dmg);
      recordDps(dmg, ELITE_AMETHYST_GLOW);
      return dmg;
    }

    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) {
      enemy.hp -= dmg;
      const GLOW_MAP: Record<string, string> = {
        quartz: ELITE_QUARTZ_GLOW, ruby: ELITE_RUBY_GLOW, sunstone: ELITE_SUNSTONE_GLOW,
        citrine: ELITE_CITRINE_GLOW, iolite: ELITE_IOLITE_GLOW, amethyst: ELITE_AMETHYST_GLOW,
        diamond: ELITE_DIAMOND_GLOW, nullstone: ELITE_NULLSTONE_GLOW,
      };
      recordDps(dmg, GLOW_MAP[enemy.tier] ?? '#ffffff');
    }
    return dmg;
  }

  // ── Procedural creature damage functions ────────────────────────────────────

  /** Generic proc damage: DEF pierce, hit-flash, no special shield. */
  function _damageProcEnemy(
    enemy: { hp: number; def: number; hitFlashMs: number },
    rawDamage: number,
    defPierceRatio: number,
    color: string,
  ): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) {
      enemy.hp -= dmg;
      enemy.hitFlashMs = PROC_HIT_FLASH_MS;
      recordDps(dmg, color);
    }
    return dmg;
  }

  function damageDustWispEnemy(e: DustWispEnemy, raw: number, pierce: number): number { return _damageProcEnemy(e, raw, pierce, '#b4d4e8'); }
  function damageRibbonWormEnemy(e: RibbonWormEnemy, raw: number, pierce: number): number { return _damageProcEnemy(e, raw, pierce, '#78c878'); }
  function damageLanternMothEnemy(e: LanternMothEnemy, raw: number, pierce: number): number { return _damageProcEnemy(e, raw, pierce, '#f0d088'); }
  function damageEyeStalkEnemy(e: EyeStalkEnemy, raw: number, pierce: number): number { return _damageProcEnemy(e, raw, pierce, '#d0b870'); }
  function damageJellyfishEnemy(e: JellyfishEnemy, raw: number, pierce: number): number { return _damageProcEnemy(e, raw, pierce, '#96d8f0'); }
  function damageClothGhostEnemy(e: ClothGhostEnemy, raw: number, pierce: number): number { return _damageProcEnemy(e, raw, pierce, '#c8c8e8'); }
  function damagePlantTurretEnemy(e: PlantTurretEnemy, raw: number, pierce: number): number { return _damageProcEnemy(e, raw, pierce, '#50b850'); }
  function damageGearInsectEnemy(e: GearInsectEnemy, raw: number, pierce: number): number { return _damageProcEnemy(e, raw, pierce, '#a0a0b0'); }
  function damageSpiderCrawlerEnemy(e: SpiderCrawlerEnemy, raw: number, pierce: number): number { return _damageProcEnemy(e, raw, pierce, '#a06850'); }
  function damageMoteSwarmEnemy(e: MoteSwarmEnemy, raw: number, pierce: number): number { return _damageProcEnemy(e, raw, pierce, '#f0d860'); }
  function damageShadowHandEnemy(e: ShadowHandEnemy, raw: number, pierce: number): number { return _damageProcEnemy(e, raw, pierce, '#484868'); }
  function damageSandFishEnemy(e: SandFishEnemy, raw: number, pierce: number): number { return _damageProcEnemy(e, raw, pierce, SANDFISH_COLOR); }
  function damageQuartzFishEnemy(e: QuartzFishEnemy, raw: number, pierce: number, bypassShield: boolean): number {
    if (!bypassShield && !e.shieldBroken && e.shieldHp > 0) {
      const shieldDmg = Math.max(MINIMUM_SHIELD_DAMAGE, raw);
      e.shieldHp = Math.max(0, e.shieldHp - shieldDmg);
      if (e.shieldHp <= 0) e.shieldBroken = true;
      recordDps(shieldDmg, QUARTZFISH_COLOR);
      return shieldDmg;
    }
    return _damageProcEnemy(e, raw, pierce, QUARTZFISH_COLOR);
  }
  function damageRubyFishEnemy(e: RubyFishEnemy, raw: number, pierce: number): number { return _damageProcEnemy(e, raw, pierce, RUBYFISH_COLOR); }
  function damageSunstoneFishEnemy(e: SunstoneFishEnemy, raw: number, pierce: number): number { return _damageProcEnemy(e, raw, pierce, SUNSTONEFISH_COLOR); }
  function damageEmeraldFishEnemy(e: EmeraldFishEnemy, raw: number, pierce: number): number { return _damageProcEnemy(e, raw, pierce, EMERALDFISH_COLOR); }
  function damageSapphireFishEnemy(e: SapphireFishEnemy, raw: number, pierce: number): number { return _damageProcEnemy(e, raw, pierce, SAPPHIREFISH_COLOR); }
  function damageAmethystFishEnemy(e: AmethystFishEnemy, raw: number, pierce: number): number { return _damageProcEnemy(e, raw, pierce, AMETHYSTFISH_COLOR); }
  function damageDiamondFishEnemy(e: DiamondFishEnemy, raw: number, pierce: number): number {
    const scaledRaw = e.armorActive ? raw * 0.4 : raw;
    return _damageProcEnemy(e, scaledRaw, pierce, DIAMONDFISH_COLOR);
  }

  /** Damage a plant projectile (no DEF). Returns actual damage dealt. */
  function damagePlantProjectile(p: PlantProjectile, rawDamage: number): number {
    const dmg = Math.max(1, Math.floor(rawDamage));
    p.hp = Math.max(0, p.hp - dmg);
    recordDps(dmg, '#78d848');
    return dmg;
  }

  return {
    damageEnemy,
    damageSapphireEnemy,
    damageMissile,
    damageEmeraldEnemy,
    damageAmberEnemy,
    damageAmberShard,
    damageVoidEnemy,
    damageQuartzEnemy,
    damageQuartzSpike,
    damageRubyEnemy,
    damageRubyBolt,
    damageSunstoneEnemy,
    damageCitrineEnemy,
    damageCitrineBolt,
    damageIoliteEnemy,
    damageAmethystEnemy,
    damageAmethystShard,
    damageDiamondEnemy,
    damageDiamondShard,
    damageNullstoneEnemy,
    damageVoidTendril,
    damageFracterylEnemy,
    damageFracterylShard,
    damageEigensteinEnemy,
    damagePolyominoEnemy,
    damageFissilePolyominoEnemy,
    damageRefractorPolyominoEnemy,
    damageBinaryRingEnemy,
    damageNadirCubePointEnemy,
    damageEliteEnemy,
    damageAlivenParticle,
    damageDustWispEnemy,
    damageRibbonWormEnemy,
    damageLanternMothEnemy,
    damageEyeStalkEnemy,
    damageJellyfishEnemy,
    damageClothGhostEnemy,
    damagePlantTurretEnemy,
    damageGearInsectEnemy,
    damageSpiderCrawlerEnemy,
    damageMoteSwarmEnemy,
    damageShadowHandEnemy,
    damageSandFishEnemy,
    damageQuartzFishEnemy,
    damageRubyFishEnemy,
    damageSunstoneFishEnemy,
    damageEmeraldFishEnemy,
    damageSapphireFishEnemy,
    damageAmethystFishEnemy,
    damageDiamondFishEnemy,
    damagePlantProjectile,
    damageHorizonPentagonReal,
    damageHorizonMissile,
  };

  function damageHorizonPentagonReal(g: HorizonPentagonGroup, rawDamage: number, defPierceRatio: number): number {
    if (g.swapCdMs > 0) return 0;
    const effectiveDef = g.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) {
      g.hp -= dmg;
      recordDps(dmg, '#6699ff');
      if (g.hp > 0) triggerHorizonPentagonSwap(g);
    }
    return dmg;
  }

  function damageHorizonMissile(m: HorizonMissile, rawDamage: number, _pierce: number): number {
    const dmg = Math.min(rawDamage, m.hp);
    m.hp -= dmg;
    recordDps(dmg, '#ff99cc');
    return dmg;
  }
}

/**
 * Deals damage to an individual AlivenParticle.
 * Handles hit-flash, death, and splitter on-death.
 * Returns the actual damage dealt.
 */
export function damageAlivenParticle(
  particle: AlivenParticle,
  group: AlivenParticleGroup,
  rawDamage: number,
  recordDps: (dmg: number, color?: string) => void,
): number {
  if (!particle.isAlive) return 0;
  if (particle.ghostMs > 0) return 0;
  const dmg = Math.max(1, Math.floor(rawDamage));
  particle.hp -= dmg;
  particle.hitFlashMs = ALIVEN_HIT_FLASH_MS;
  recordDps(dmg, particle.glowColor);
  if (particle.hp <= 0) {
    particle.hp     = 0;
    particle.isAlive = false;
    particle.trail.length = 0;
    handleAlivenParticleDeath(group, particle);
  }
  return dmg;
}
