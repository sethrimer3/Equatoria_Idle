/**
 * rpg-render-draw.ts — Per-frame canvas drawing for the RPG tab.
 *
 * Extracted from rpg-render.ts to keep that file under a manageable size.
 *
 * Exports:
 *   - `RpgDrawCtx`       — dependency-injection context passed once at setup time.
 *   - `RpgDrawFrameState`— small mutable object that survives between frames
 *                          (currently only `waveOverlapAlpha`).
 *   - `drawRpgFrame(ctx, state, nowMs)` — renders one frame to the canvas.
 *   - `setAllDrawLowGraphics(enabled)` — forwards the low-graphics flag to all
 *                          draw-side modules; call from RpgRender.setLowGraphicsMode().
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import {
  drawSapphireEnemies, drawSapphireMissiles,
  drawEmeraldEnemies,
  drawAmberEnemies, drawAmberShards,
  drawVoidEnemies,
  drawLaserEnemies, drawEnemyIndicators,
  setLowGraphicsMode as setEnemyLowGraphics,
} from './rpg-enemy-draw';
import {
  drawQuartzEnemies, drawQuartzSpikes,
  drawRubyEnemies, drawRubyBolts,
  drawSunstoneEnemies,
  drawCitrineEnemies, drawCitrineBolts,
  drawIoliteEnemies,
  drawAmethystEnemies, drawAmethystShards,
  drawDiamondEnemies, drawDiamondShards,
  drawNullstoneEnemies, drawVoidTendrils,
  drawFracterylEnemies,
  drawEigensteinEnemies, drawEigensteinBeams,
  drawTeleportParticles,
} from './rpg-enemy-draw-adv';
import { drawBossAttacks, setDrawBossAttacksLowGraphics } from './rpg-boss-attacks-draw';
import {
  drawBossProjectiles,
  drawSandProjectiles,
  drawPoisonBolts,
  drawLaserBeamEffect,
  drawEmeraldPlayerMissiles, drawEmeraldSubMissiles, drawEmeraldSwirlParticles, drawSunstoneMines,
  setLowGraphicsMode as setEntityLowGraphics,
} from './rpg-entity-draw';
import {
  drawWeaponOrbitParticle, drawOrbitProjectile,
  drawTargetReticle,
  drawPlayerMote,
  setLowGraphicsMode as setPlayerDrawLowGraphics,
} from './rpg-player-draw';
import {
  drawDeathParticles, drawShotLines, drawHitEffects, drawDamageNumbers,
  setLowGraphicsMode as setCombatEffectsLowGraphics,
} from './rpg-combat-effects-draw';
import {
  drawSapphireShips, drawSapphireLasers,
  drawAmethystShips, drawAmethystLasers,
  setLowGraphicsMode as setCompanionLowGraphics,
} from './rpg-companion-draw';
import { drawChainWhip, drawVortexes, setLowGraphicsMode as setWeaponChainLowGraphics } from './rpg-weapon-draw';
import { drawSwordCombos, drawSandBladeCombo, drawSandDriftPixels, setLowGraphicsMode as setWeaponSwordLowGraphics } from './rpg-weapon-draw-sword';
import { drawLuckyMotes, drawLuckyMotePopups } from './rpg-lucky-motes';
import { drawBossEnemy, drawBottomSafeZone, drawDanmakuSafeZone, drawWaveClearBanner, setLowGraphicsMode as setBossLowGraphics } from './rpg-boss-draw';
import { drawAlivenGroups, setAlivenLowGraphics } from './rpg-aliven-draw';
import { drawProceduralEnemies } from './rpg-procedural-draw';
import {
  drawEliteEnemies,
  setLowGraphicsMode as setEliteDrawLowGraphics,
} from './rpg-elite-enemy-draw';
import { drawStardustEnemies, setLowGraphicsMode as setStardustDrawLowGraphics } from './rpg-stardust-draw';
import type {
  RpgMote, RpgJoystick, RpgPhase,
  HitEffect, ShotLine, DamageNumber, DeathParticle,
  WeaponOrbitParticle, OrbitProjectile,
  SapphireEnemy, SapphireMissile, LaserEnemy,
  ClosestTarget,
} from './rpg-types';
import type {
  EmeraldEnemy,
  AmberEnemy, AmberShard,
  VoidEnemy, QuartzEnemy, QuartzSpike,
  RubyEnemy, RubyBolt,
  SunstoneEnemy, CitrineEnemy, CitrineBolt,
  IoliteEnemy, AmethystEnemy, AmethystShard,
  DiamondEnemy, DiamondShard,
  NullstoneEnemy, VoidTendril,
  BossEnemy, BossProjectile,
  FracterylEnemy, FracterylShard,
  EigensteinEnemy, EigensteinBeam,
  DanmakuSafeZone, TeleportParticle,
  LuckyMote, LuckyMotePopup, EliteEnemy,
} from './rpg-enemy-types';
import type {
  DustWispEnemy, RibbonWormEnemy, LanternMothEnemy, EyeStalkEnemy,
  JellyfishEnemy, ClothGhostEnemy, PlantTurretEnemy, GearInsectEnemy,
  SpiderCrawlerEnemy, MoteSwarmEnemy, ShadowHandEnemy, PlantProjectile,
  SandFishEnemy, QuartzFishEnemy, RubyFishEnemy, SunstoneFishEnemy,
  EmeraldFishEnemy, SapphireFishEnemy, AmethystFishEnemy, DiamondFishEnemy,
  FishMine, FishSpike, FishBolt, FishDecoy,
} from './rpg-procedural-types';
import type { BossAttackState } from './rpg-boss-attack-types';
import type { RpgWeaponHandle } from './rpg-weapon-systems';
import type { AlivenParticleGroup } from './rpg-aliven-types';
import { JOYSTICK_OUTER_RADIUS, JOYSTICK_THUMB_RADIUS, BASE_ATTACK_TIMER_KEY, DIAMOND_BLADE_ID } from './rpg-constants';
import { renderTopographicTerrain } from './terrain/topographic-terrain';
import { renderPersistentTopographySunlight, renderTopographyLighting } from './terrain/topographic-lighting';
import type { TopographicTerrainState } from './terrain/topographic-terrain';

// ── Context passed once at setup time ─────────────────────────────────────────

/**
 * All the arrays/objects that drawRpgFrame needs, passed once when the system
 * is constructed (arrays are always mutated in place, so references stay valid).
 */
export interface RpgDrawCtx {
  canvas2d: CanvasRenderingContext2D;
  fluid: { render(ctx: CanvasRenderingContext2D): void };
  getWidthPx(): number;
  getHeightPx(): number;

  // ── Enemy arrays (all mutated in-place by update loops) ───
  enemies: LaserEnemy[];
  sapphireEnemies: SapphireEnemy[];
  sapphireMissiles: SapphireMissile[];
  emeraldEnemies: EmeraldEnemy[];
  amberEnemies: AmberEnemy[];
  amberShards: AmberShard[];
  voidEnemies: VoidEnemy[];
  quartzEnemies: QuartzEnemy[];
  quartzSpikes: QuartzSpike[];
  rubyEnemies: RubyEnemy[];
  rubyBolts: RubyBolt[];
  sunstoneEnemies: SunstoneEnemy[];
  citrineEnemies: CitrineEnemy[];
  citrineBolts: CitrineBolt[];
  ioliteEnemies: IoliteEnemy[];
  amethystEnemies: AmethystEnemy[];
  amethystShards: AmethystShard[];
  diamondEnemies: DiamondEnemy[];
  diamondShards: DiamondShard[];
  nullstoneEnemies: NullstoneEnemy[];
  voidTendrils: VoidTendril[];
  fracterylEnemies: FracterylEnemy[];
  fracterylShards: FracterylShard[];
  eigensteinEnemies: EigensteinEnemy[];
  eigensteinBeams: EigensteinBeam[];
  eliteEnemies: EliteEnemy[];
  stardustEnemies: import('./rpg-enemy-types').StardustEnemy[];
  alivenGroups: AlivenParticleGroup[];
  // ── Procedural creature arrays ──────────────────────────────────────────────
  dustWispEnemies: DustWispEnemy[];
  ribbonWormEnemies: RibbonWormEnemy[];
  lanternMothEnemies: LanternMothEnemy[];
  eyeStalkEnemies: EyeStalkEnemy[];
  jellyfishEnemies: JellyfishEnemy[];
  clothGhostEnemies: ClothGhostEnemy[];
  plantTurretEnemies: PlantTurretEnemy[];
  gearInsectEnemies: GearInsectEnemy[];
  spiderCrawlerEnemies: SpiderCrawlerEnemy[];
  moteSwarmEnemies: MoteSwarmEnemy[];
  shadowHandEnemies: ShadowHandEnemy[];
  sandFishEnemies: SandFishEnemy[];
  quartzFishEnemies: QuartzFishEnemy[];
  rubyFishEnemies: RubyFishEnemy[];
  sunstoneFishEnemies: SunstoneFishEnemy[];
  emeraldFishEnemies: EmeraldFishEnemy[];
  sapphireFishEnemies: SapphireFishEnemy[];
  amethystFishEnemies: AmethystFishEnemy[];
  diamondFishEnemies: DiamondFishEnemy[];
  plantProjectiles: PlantProjectile[];
  fishMines: FishMine[];
  fishSpikes: FishSpike[];
  fishBolts: FishBolt[];
  fishDecoys: FishDecoy[];

  // ── Boss & projectile state ───────────────────────────────
  getBossEnemy(): BossEnemy | null;
  getDanmakuSafeZone(): DanmakuSafeZone | null;
  bossProjectiles: BossProjectile[];
  bossAttackState: BossAttackState;
  teleportParticles: TeleportParticle[];

  // ── Weapon systems handle (exposes all weapon arrays) ─────
  weaponSystems: RpgWeaponHandle;

  // ── Player & input state ──────────────────────────────────
  mote: RpgMote;
  joystick: RpgJoystick;

  // ── Visual effect arrays ──────────────────────────────────
  hitEffects: HitEffect[];
  shotLines: ShotLine[];
  damageNumbers: DamageNumber[];
  luckyMotes: LuckyMote[];
  luckyMotePopups: LuckyMotePopup[];
  deathParticles: DeathParticle[];
  weaponOrbitParticles: WeaponOrbitParticle[];
  getOrbitProjectile(): OrbitProjectile | null;

  // ── Scalar getters (mutated elsewhere, so read via function) ─
  getGlowMovementIntensity(): number;
  getRpgPhase(): RpgPhase;
  getDeathAlpha(): number;
  getGlowTimeS(): number;
  getPlayerIFramesMs(): number;
  getIsInterWave(): boolean;
  getCurrentWave(): number;
  getInterWaveTimerMs(): number;
  getIsBossWaveActive(): boolean;
  getScreenDarken(): number;
  getRestartFadeAlpha(): number;
  getIsLowGraphicsMode(): boolean;
  getEnemyIndicatorStyle(): 'triangle' | 'outline' | 'off';
  getTopographicTerrainState(): TopographicTerrainState | null;

  // ── Callbacks & shared context ────────────────────────────
  getEffectiveEquippedIds(): Set<string>;
  getTargetedEnemy(): ClosestTarget | null;
  rpgSimState: RpgSimState;
}

// ── Small mutable state that persists across frames ───────────────────────────

/**
 * Mutable state owned by the draw system.
 * Create once and pass to every drawRpgFrame call.
 */
export interface RpgDrawFrameState {
  /** Smoothly interpolated alpha for the top-left wave number; dims when entities overlap it. */
  waveOverlapAlpha: number;
}

/** Creates the initial draw frame state. */
export function createRpgDrawFrameState(): RpgDrawFrameState {
  return { waveOverlapAlpha: 1.0 };
}

// ── Main draw function ─────────────────────────────────────────────────────────

export function drawRpgFrame(
  ctx: RpgDrawCtx,
  state: RpgDrawFrameState,
  nowMs: number,
): void {
  const canvas2d   = ctx.canvas2d;
  const widthPx    = ctx.getWidthPx();
  const heightPx   = ctx.getHeightPx();
  const rpgPhase   = ctx.getRpgPhase();
  const glowTimeS  = ctx.getGlowTimeS();
  const bossEnemy  = ctx.getBossEnemy();

  canvas2d.clearRect(0, 0, widthPx, heightPx);
  canvas2d.fillStyle = '#0a0a12';
  canvas2d.fillRect(0, 0, widthPx, heightPx);

  // Fluid background — rendered first so all gameplay elements appear above it.
  ctx.fluid.render(canvas2d);

  const terrainState = ctx.getTopographicTerrainState();
  renderPersistentTopographySunlight(canvas2d, widthPx, heightPx, terrainState?.paletteId ?? 'mono');
  if (terrainState) {
    renderTopographicTerrain(canvas2d, terrainState, nowMs);
    renderTopographyLighting(canvas2d, terrainState, widthPx, heightPx);
  }

  drawLaserEnemies(canvas2d, ctx.enemies, nowMs);
  drawSapphireEnemies(canvas2d, ctx.sapphireEnemies);
  drawSapphireMissiles(canvas2d, ctx.sapphireMissiles);
  drawEmeraldEnemies(canvas2d, ctx.emeraldEnemies);
  drawAmberEnemies(canvas2d, ctx.amberEnemies);
  drawAmberShards(canvas2d, ctx.amberShards);
  drawVoidEnemies(canvas2d, ctx.voidEnemies);
  drawQuartzEnemies(canvas2d, ctx.quartzEnemies);
  drawQuartzSpikes(canvas2d, ctx.quartzSpikes);
  drawRubyEnemies(canvas2d, ctx.rubyEnemies);
  drawRubyBolts(canvas2d, ctx.rubyBolts);
  drawSunstoneEnemies(canvas2d, ctx.sunstoneEnemies);
  drawCitrineEnemies(canvas2d, ctx.citrineEnemies);
  drawCitrineBolts(canvas2d, ctx.citrineBolts);
  drawIoliteEnemies(canvas2d, ctx.ioliteEnemies);
  drawAmethystEnemies(canvas2d, ctx.amethystEnemies);
  drawAmethystShards(canvas2d, ctx.amethystShards);
  drawDiamondEnemies(canvas2d, ctx.diamondEnemies);
  drawDiamondShards(canvas2d, ctx.diamondShards);
  drawNullstoneEnemies(canvas2d, ctx.nullstoneEnemies);
  drawVoidTendrils(canvas2d, ctx.voidTendrils);
  drawFracterylEnemies(canvas2d, ctx.fracterylEnemies, ctx.fracterylShards);
  drawEigensteinEnemies(canvas2d, ctx.eigensteinEnemies);
  drawEigensteinBeams(canvas2d, ctx.eigensteinBeams, widthPx, heightPx);
  drawEliteEnemies(canvas2d, ctx.eliteEnemies);
  drawStardustEnemies(canvas2d, ctx.stardustEnemies);
  drawAlivenGroups(canvas2d, ctx.alivenGroups);
  drawProceduralEnemies(canvas2d, ctx, nowMs);
  drawBottomSafeZone(canvas2d, ctx.getIsBossWaveActive(), widthPx, heightPx, glowTimeS);
  drawDanmakuSafeZone(canvas2d, bossEnemy, ctx.getDanmakuSafeZone());
  drawBossProjectiles(canvas2d, ctx.bossProjectiles);
  drawBossAttacks(canvas2d, ctx.bossAttackState);
  drawBossEnemy(canvas2d, bossEnemy, glowTimeS);
  drawTeleportParticles(canvas2d, ctx.teleportParticles);
  drawShotLines(canvas2d, ctx.shotLines);
  drawVortexes(canvas2d, ctx.weaponSystems.activeVortexes);
  drawSandProjectiles(canvas2d, ctx.weaponSystems.sandProjectiles);
  drawPoisonBolts(canvas2d, ctx.weaponSystems.poisonBolts);
  drawEmeraldPlayerMissiles(canvas2d, ctx.weaponSystems.emeraldPlayerMissiles);
  drawEmeraldSubMissiles(canvas2d, ctx.weaponSystems.emeraldSubMissiles);
  drawEmeraldSwirlParticles(canvas2d, ctx.weaponSystems.emeraldSwirlParticles);
  drawSunstoneMines(canvas2d, ctx.weaponSystems.sunstoneMines);
  drawLaserBeamEffect(canvas2d, ctx.weaponSystems.laserBeamEffect);
  drawEnemyIndicators(canvas2d, ctx.getEnemyIndicatorStyle(),
    ctx.enemies, ctx.sapphireEnemies, ctx.emeraldEnemies, ctx.amberEnemies, ctx.voidEnemies,
    ctx.quartzEnemies, ctx.rubyEnemies, ctx.sunstoneEnemies, ctx.citrineEnemies, ctx.ioliteEnemies,
    ctx.amethystEnemies, ctx.diamondEnemies, ctx.nullstoneEnemies, ctx.fracterylEnemies, ctx.eigensteinEnemies,
    bossEnemy, ctx.alivenGroups);

  drawPlayerMote(canvas2d, ctx.mote, ctx.getGlowMovementIntensity(), rpgPhase, ctx.getDeathAlpha(), glowTimeS, ctx.getPlayerIFramesMs());

  drawHitEffects(canvas2d, ctx.hitEffects);
  drawLuckyMotes(canvas2d, ctx.luckyMotes, ctx.getIsLowGraphicsMode());
  drawDamageNumbers(canvas2d, ctx.damageNumbers);
  drawLuckyMotePopups(canvas2d, ctx.luckyMotePopups, ctx.getIsLowGraphicsMode());
  if (ctx.deathParticles.length > 0) drawDeathParticles(canvas2d, ctx.deathParticles);

  // Draw weapon orbit particles, orbit projectile, and special weapon visuals above the player.
  if (rpgPhase === 'alive') {
    for (const p of ctx.weaponOrbitParticles) drawWeaponOrbitParticle(canvas2d, p);
    drawOrbitProjectile(canvas2d, ctx.getOrbitProjectile());
    for (const ws of ctx.weaponSystems.chainWhipStates.values()) drawChainWhip(canvas2d, ws);
    const effectiveEquippedIds = ctx.getEffectiveEquippedIds();
    // Draw prismatic diamond sword combos only when Diamond Blade is equipped.
    if (effectiveEquippedIds.has(DIAMOND_BLADE_ID)) {
      drawSwordCombos(canvas2d, ctx.weaponSystems.swordComboStates, ctx.mote, ctx.rpgSimState.weaponTiersByWeaponId);
    }
    // Draw the Sand Blade when Diamond Blade is not equipped.
    // Sand Blade is the permanent default melee weapon; it is only suppressed
    // by Diamond Blade, not by any other equipped weapon.
    if (!effectiveEquippedIds.has(DIAMOND_BLADE_ID)) {
      drawSandBladeCombo(canvas2d, ctx.weaponSystems.swordComboStates.get(BASE_ATTACK_TIMER_KEY), ctx.mote);
      drawSandDriftPixels(canvas2d);
    }
    // ── Companion ships and lasers ────────────────────────────────
    drawSapphireShips(canvas2d, ctx.weaponSystems.sapphireShips);
    drawSapphireLasers(canvas2d, ctx.weaponSystems.sapphireLasers);
    drawAmethystShips(canvas2d, ctx.weaponSystems.amethystShips);
    drawAmethystLasers(canvas2d, ctx.weaponSystems.amethystLasers);
    // ── Target reticle ────────────────────────────────────────────
    const te = ctx.getTargetedEnemy();
    if (te) {
      drawTargetReticle(canvas2d, te.x, te.y, 10, performance.now());
    }
  }

  if (ctx.joystick.isActive && rpgPhase === 'alive') {
    canvas2d.save();
    canvas2d.globalAlpha = 0.35; canvas2d.strokeStyle = '#fff172'; canvas2d.lineWidth = 1;
    canvas2d.beginPath(); canvas2d.arc(ctx.joystick.baseX, ctx.joystick.baseY, JOYSTICK_OUTER_RADIUS, 0, Math.PI * 2); canvas2d.stroke();
    canvas2d.globalAlpha = 0.55; canvas2d.fillStyle = '#fff172';
    canvas2d.shadowBlur = JOYSTICK_THUMB_RADIUS * 2; canvas2d.shadowColor = 'rgba(255, 241, 114, 0.6)';
    canvas2d.beginPath(); canvas2d.arc(ctx.joystick.thumbX, ctx.joystick.thumbY, JOYSTICK_THUMB_RADIUS, 0, Math.PI * 2); canvas2d.fill();
    canvas2d.shadowBlur = 0; canvas2d.restore();
  }

  if (rpgPhase === 'alive') drawWaveClearBanner(canvas2d, ctx.getIsInterWave(), ctx.getCurrentWave(), ctx.getInterWaveTimerMs(), widthPx, heightPx);

  // ── Top-left wave number overlay ──────────────────────────────
  const currentWave = ctx.getCurrentWave();
  if (currentWave > 0) {
    // Check if any enemy or player is near the top-left corner region
    const TL_X = 190, TL_Y = 55;
    let anyOverlap = false;
    const moteNear = ctx.mote.x < TL_X && ctx.mote.y < TL_Y;
    if (moteNear) {
      anyOverlap = true;
    } else {
      for (const e of ctx.enemies) {
        if (e.x < TL_X && e.y < TL_Y) { anyOverlap = true; break; }
      }
      if (!anyOverlap) {
        for (const e of ctx.sapphireEnemies) {
          if (e.x < TL_X && e.y < TL_Y) { anyOverlap = true; break; }
        }
      }
      if (!anyOverlap) {
        for (const e of ctx.emeraldEnemies) {
          if (e.x < TL_X && e.y < TL_Y) { anyOverlap = true; break; }
        }
      }
    }
    const targetAlpha = anyOverlap ? 0.30 : 1.0;
    state.waveOverlapAlpha += (targetAlpha - state.waveOverlapAlpha) * 0.1;

    canvas2d.save();
    canvas2d.globalAlpha = state.waveOverlapAlpha;
    canvas2d.font = 'bold 22px monospace';
    canvas2d.fillStyle = '#fff172';
    canvas2d.fillText('Wave: x' + currentWave, 8, 30);
    canvas2d.restore();
  }

  const screenDarken = ctx.getScreenDarken();
  if (screenDarken > 0) {
    canvas2d.globalAlpha = screenDarken; canvas2d.fillStyle = '#000000';
    canvas2d.fillRect(0, 0, widthPx, heightPx); canvas2d.globalAlpha = 1;
  }
  if (rpgPhase === 'restarting') {
    canvas2d.globalAlpha = 1 - ctx.getRestartFadeAlpha(); canvas2d.fillStyle = '#000000';
    canvas2d.fillRect(0, 0, widthPx, heightPx); canvas2d.globalAlpha = 1;
  }
}

// ── Low-graphics mode forwarding ──────────────────────────────────────────────

/**
 * Propagates the low-graphics flag to every draw-side module.
 * Call from `RpgRender.setLowGraphicsMode()`.
 */
export function setAllDrawLowGraphics(enabled: boolean): void {
  setEnemyLowGraphics(enabled);
  setEntityLowGraphics(enabled);
  setPlayerDrawLowGraphics(enabled);
  setCombatEffectsLowGraphics(enabled);
  setCompanionLowGraphics(enabled);
  setWeaponChainLowGraphics(enabled);
  setWeaponSwordLowGraphics(enabled);
  setBossLowGraphics(enabled);
  setEliteDrawLowGraphics(enabled);
  setStardustDrawLowGraphics(enabled);
  setAlivenLowGraphics(enabled);
  setDrawBossAttacksLowGraphics(enabled);
  // No per-module low-graphics for terrain (it already skips when hidden)
}
