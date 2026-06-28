/**
 * rpg-boss-wave.ts — Boss wave lifecycle and boss damage management.
 *
 * Extracted from rpg-render.ts to keep that closure manageable. Follows the
 * context-object pattern used in rpg-boss-update.ts and rpg-wave-manager.ts:
 * the factory createBossWaveManager receives a BossWaveCtx containing
 * getter/setter callbacks for all mutable let-variables it needs to read or
 * write in rpg-render.ts, plus direct references for array state.
 *
 * Owns:
 *   - enterBossWave     — equip override, safe-zone positioning, stats rebuild
 *   - exitBossWave      — restore pre-wave weapon tiers, stats rebuild
 *   - startBossFight    — construct boss entity and enter the wave
 *   - teleportPlayerToSafeZone — visual teleport + boss pause-firing reset
 *   - damageBossEnemy   — damage routing with shield, isBossWaveActive guard
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import type { RpgMote } from './rpg-types';
import type { BossEnemy, TeleportParticle } from './rpg-enemy-types';
import type { BossDialogueEvent } from '../../data/boss-dialogue';
import { makeBossEnemy } from './rpg-factories';
import { preloadBossSpawnCircleAsset } from './rpg-boss-spawn-circle';
import {
  SWORD_COMBO_THRESHOLD,
  MAX_DANMAKU_LEVEL,
} from './rpg-weapon-constants';
import {
  BOSS_GLOW_COLORS, BOSS_SAFE_ZONE_Y_FACTOR,
} from './rpg-constants';

// ── Context interface ─────────────────────────────────────────────────────────

/**
 * All dependencies that createBossWaveManager needs from rpg-render.ts.
 *
 * Mutable closure state (let-variables) is exposed via getter/setter callbacks
 * so writes made inside these functions are always reflected back in the caller.
 */
export interface BossWaveCtx {
  /** Player mote — position, velocity, and trail ring-buffer (mutable reference). */
  readonly mote: RpgMote;
  /** Canvas dimensions — updated on resize via shared object. */
  readonly dim: { w: number; h: number };
  /** RPG simulation state — weaponTiersByWeaponId, equippedWeaponIds, highestWaveReached. */
  readonly rpgSimState: RpgSimState;
  /** Teleport particle array — populated on player teleport, cleared on exitBossWave. */
  readonly teleportParticles: TeleportParticle[];

  // ── Mutable let-variable getters/setters ──────────────────────────────────
  getIsBossWaveActive(): boolean;
  setIsBossWaveActive(v: boolean): void;
  getBossActiveEquipIds(): Set<string> | null;
  setBossActiveEquipIds(v: Set<string> | null): void;
  getBossPreWaveWeaponTiers(): Map<string, number>;
  setBossPreWaveWeaponTiers(v: Map<string, number>): void;
  getBossHitsInRound(): number;
  setBossHitsInRound(v: number): void;
  getBossEnemy(): BossEnemy | null;
  setBossEnemy(v: BossEnemy | null): void;
  getPlayerIFramesMs(): number;
  setPlayerIFramesMs(v: number): void;
  setIsBossFightFromMenu(v: boolean): void;

  // ── Callbacks ──────────────────────────────────────────────────────────────
  /** Rebuilds player stats and weapon orbit particles from current equipment. */
  applyEquipmentStats(): void;
  /** Spawns a floating damage number at position (x, y) drifting in direction (vx, vy). */
  spawnDamageNumber(
    x: number, y: number,
    vx: number, vy: number,
    text: string,
    ratio: number,
    color: string,
  ): void;
  /** Records damage dealt for the DPS tracker. */
  recordDps(dmg: number, color?: string): void;

  // ── Stage director lifecycle hooks (optional) ─────────────────────────────
  /** Called just after isBossWaveActive is set to true (enterBossWave). */
  onEnterBossWave?: () => void;
  /** Called just after isBossWaveActive is set to false (exitBossWave). */
  onExitBossWave?: () => void;
  /** Called each time the player is teleported back to the safe zone. */
  onTeleportToSafeZone?: () => void;
  onBossSpawned?(boss: BossEnemy): void;
  onBossDamaged?(boss: BossEnemy, damageAmount: number): void;
  onBossEvent?(boss: BossEnemy, eventType: BossDialogueEvent): void;
}

// ── Handle returned by factory ────────────────────────────────────────────────

export interface BossWaveHandle {
  teleportPlayerToSafeZone(): void;
  enterBossWave(): void;
  exitBossWave(): void;
  startBossFight(bossId: number): void;
  damageBossEnemy(rawDamage: number, defPierceRatio: number, fromDiamondBlade?: boolean): number;
}

// ── Module constants ──────────────────────────────────────────────────────────

const TELEPORT_PRISMATIC_COLORS = ['#e8f0fa', '#ffffff', '#b0c8ff', '#d6aaff', '#a0f0d0', '#fff4a0'];

// ── Factory ───────────────────────────────────────────────────────────────────

export function createBossWaveManager(ctx: BossWaveCtx): BossWaveHandle {

  function getSafeZoneX(): number { return ctx.dim.w / 2; }
  function getSafeZoneY(): number { return ctx.dim.h * BOSS_SAFE_ZONE_Y_FACTOR; }

  function teleportPlayerToSafeZone(): void {
    const { mote, teleportParticles } = ctx;
    const tx = getSafeZoneX(), ty = getSafeZoneY();
    // Spawn comet trail particles fanning from current player position toward the safe zone
    for (let i = 0; i < 20; i++) {
      const t = i / 20;
      const px = mote.x + (tx - mote.x) * t + (Math.random() - 0.5) * 14;
      const py = mote.y + (ty - mote.y) * t + (Math.random() - 0.5) * 14;
      const angle = Math.atan2(ty - mote.y, tx - mote.x) + (Math.random() - 0.5) * 0.7;
      const spd = 1.2 + Math.random() * 2.5;
      teleportParticles.push({
        x: px, y: py,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        alpha: 0.85 + Math.random() * 0.15,
        color: TELEPORT_PRISMATIC_COLORS[Math.floor(Math.random() * TELEPORT_PRISMATIC_COLORS.length)],
      });
    }
    mote.x = tx; mote.y = ty;
    mote.vx = 0; mote.vy = 0;
    mote.trailHead = 0; mote.trailCount = 0;
    ctx.setPlayerIFramesMs(1400); // brief invulnerability after teleport
    ctx.setBossHitsInRound(0); // reset hit counter for the next engagement
    const boss = ctx.getBossEnemy();
    if (boss) {
      boss.isFiringPaused = false;
      boss.attackTimerMs = Math.max(boss.attackTimerMs, 450);
      boss.secondaryTimerMs = Math.max(boss.secondaryTimerMs, 650);
    }
    ctx.onTeleportToSafeZone?.();
  }

  function enterBossWave(): void {
    if (ctx.getIsBossWaveActive()) return;
    ctx.setIsBossWaveActive(true);
    // Save weapon tiers so we can restore them after the boss fight.
    ctx.setBossPreWaveWeaponTiers(new Map(ctx.rpgSimState.weaponTiersByWeaponId));
    // Override active weapons for boss combat — wooden_sword for Sand Warden, diamond_bastion otherwise.
    // The player's rpgSimState.equippedWeaponIds is intentionally NOT modified,
    // so equip actions, saves, and the weapons UI are unaffected.
    const bossWeaponId = ctx.getBossEnemy()?.bossId === 0 ? 'wooden_sword' : 'diamond_bastion';
    ctx.setBossActiveEquipIds(new Set([bossWeaponId]));
    ctx.rpgSimState.weaponTiersByWeaponId.set(bossWeaponId, 1);
    // Move player to safe zone at bottom-middle
    const { mote } = ctx;
    mote.x = getSafeZoneX(); mote.y = getSafeZoneY();
    mote.vx = 0; mote.vy = 0;
    mote.trailHead = 0; mote.trailCount = 0;
    ctx.setPlayerIFramesMs(1000);
    ctx.applyEquipmentStats();
    ctx.onEnterBossWave?.();
  }

  function exitBossWave(): void {
    if (!ctx.getIsBossWaveActive()) return;
    ctx.setIsBossWaveActive(false);
    // Clear the boss-fight weapon override before rebuilding stats.
    ctx.setBossActiveEquipIds(null);
    // Restore weapon tiers that may have been overridden during the boss fight.
    const bossPreWaveWeaponTiers = ctx.getBossPreWaveWeaponTiers();
    for (const [id, tier] of bossPreWaveWeaponTiers) {
      ctx.rpgSimState.weaponTiersByWeaponId.set(id, tier);
    }
    // Remove any entry that was injected by enterBossWave but was not in the
    // pre-fight snapshot (e.g. the temporary diamond_bastion tier-1 entry added
    // for bosses the player has never purchased).
    for (const id of Array.from(ctx.rpgSimState.weaponTiersByWeaponId.keys())) {
      if (!bossPreWaveWeaponTiers.has(id)) ctx.rpgSimState.weaponTiersByWeaponId.delete(id);
    }
    ctx.setBossPreWaveWeaponTiers(new Map());
    ctx.teleportParticles.length = 0;
    ctx.applyEquipmentStats();
    ctx.onExitBossWave?.();
  }

  function startBossFight(bossId: number): void {
    if (ctx.getIsBossWaveActive()) return;
    const waveForScaling = Math.max(bossId * 100, ctx.rpgSimState.highestWaveReached);
    const boss = makeBossEnemy(bossId, waveForScaling, ctx.dim.w, ctx.dim.h);
    ctx.setBossEnemy(boss);
    preloadBossSpawnCircleAsset();
    ctx.onBossSpawned?.(boss);
    ctx.setIsBossFightFromMenu(true);
    enterBossWave();
  }

  function damageBossEnemy(rawDamage: number, defPierceRatio: number, fromDiamondBlade = false): number {
    const boss = ctx.getBossEnemy();
    if (!boss) return 0;
    if (boss.isInvuln || (boss.bossId === 8 && boss.isAbsorbing)) return 0;
    // During a boss wave only the diamond_bastion (swordCombo blade) can deal damage
    if (ctx.getIsBossWaveActive() && !fromDiamondBlade) {
      const glowC = BOSS_GLOW_COLORS[Math.min(boss.bossId, BOSS_GLOW_COLORS.length - 1)];
      ctx.spawnDamageNumber(boss.x, boss.y, 0, -1, '∞', 0.3, glowC);
      return 0;
    }
    if (boss.shieldHp > 0) {
      const previousShieldHp = boss.shieldHp;
      const shieldDmg = Math.min(boss.shieldHp, rawDamage);
      boss.shieldHp -= shieldDmg;
      ctx.recordDps(shieldDmg, '#ffd700');
      ctx.onBossDamaged?.(boss, previousShieldHp - boss.shieldHp);
      if (previousShieldHp > 0 && boss.shieldHp <= 0) ctx.onBossEvent?.(boss, 'BOSS_SHIELD_BROKEN');
      return shieldDmg;
    }
    const effectiveDef = boss.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    boss.hp = Math.max(0, boss.hp - dmg);
    if (dmg > 0) {
      ctx.onBossDamaged?.(boss, dmg);
      ctx.recordDps(dmg, '#ffd700');
      boss.isFiringPaused = true;
      if (ctx.getIsBossWaveActive()) {
        // Allow SWORD_COMBO_THRESHOLD hits before teleporting — gives the player
        // exactly enough hits to build up and complete the 4-hit spin combo.
        ctx.setBossHitsInRound(ctx.getBossHitsInRound() + 1);
        if (ctx.getBossHitsInRound() >= SWORD_COMBO_THRESHOLD) {
          boss.danmakuLevel = Math.min(boss.danmakuLevel + 1, MAX_DANMAKU_LEVEL);
          teleportPlayerToSafeZone(); // resets bossHitsInRound to 0
        }
      }
    }
    return dmg;
  }

  return {
    teleportPlayerToSafeZone,
    enterBossWave,
    exitBossWave,
    startBossFight,
    damageBossEnemy,
  };
}
