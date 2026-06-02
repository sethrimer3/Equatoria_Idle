/**
 * rpg-weapon-chain.ts — Quartz chain whip weapon system for the RPG tab.
 *
 * Extracted from rpg-weapon-systems.ts to keep that module focused on
 * orchestration. This module owns the full lifecycle of the chain whip:
 *
 *   • Building the initial ChainWhipState (softbody rope of CHAIN_NODES nodes).
 *   • Spring-physics integration via stepChainPhysics (asymmetric force to
 *     propagate energy toward the tip, mimicking a real whip crack).
 *   • Three-phase state machine: idle → lashing → retracting.
 *   • Contact damage against all enemy body types and the boss enemy.
 *   • Fluid force injection along the chain length during lashing.
 *
 * The factory `createChainWeaponSystem(ctx)` receives a `ChainWeaponCtx`
 * dependency-injection object and returns a `ChainWeaponHandle` exposing
 * the chain state map (consumed by rpg-weapon-draw.ts for rendering) and
 * the per-frame update function (called from rpg-weapon-systems.ts).
 */

import { resolveWeaponDefinition } from '../../data/rpg/crafted-weapon-helpers';
import { getScaledWeaponDamage } from '../../sim/rpg/rpg-state';
import {
  CHAIN_NODES, CHAIN_NODE_COLOR,
  CHAIN_LASH_MS, CHAIN_RETRACT_MS, CHAIN_HIT_CD_MS,
  CHAIN_REST_LENGTH, CHAIN_SPRING_K, CHAIN_ANCHOR_K, CHAIN_RETRACT_ANCHOR_K,
  CHAIN_DAMPING_COEFF, CHAIN_DAMPING_SPEED_SCALE,
} from './rpg-weapon-constants';
import {
  HIT_EFFECT_DURATION_MS, TARGET_FRAME_MS, BOSS_SIZE_BASE,
  FLUID_CHAIN_R, FLUID_CHAIN_G, FLUID_CHAIN_B, FLUID_VEL_FRAME_TO_PX_S,
  LASER_ENEMY_SIZE,
} from './rpg-constants';
import { chainNodeRadius, chainNodeInvMass } from './rpg-helpers';
import type { FluidImpulse } from './rpg-fluid';
import type { ChainWhipState, ChainPhase, ClosestTarget, HitEffect, LaserEnemy, SapphireEnemy } from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy, VoidEnemy, QuartzEnemy, RubyEnemy,
  SunstoneEnemy, CitrineEnemy, IoliteEnemy, AmethystEnemy, DiamondEnemy,
  NullstoneEnemy, FracterylEnemy, EigensteinEnemy, EliteEnemy, BossEnemy,
} from './rpg-enemy-types';
import { segmentIntersectsTopographicTerrain, type TopographicTerrainState } from './terrain/topographic-terrain';

// ── Dependency-injection context ─────────────────────────────────────────────

/** Structural subset of RpgWeaponCtx containing only what the chain whip system needs. */
export interface ChainWeaponCtx {
  mote: { x: number; y: number };
  rpgSimState: { weaponTiersByWeaponId: Map<string, number> };
  playerStats: { atk: number };
  fluid: { addForce(impulse: FluidImpulse): void };
  readonly bossEnemy: BossEnemy | null;
  // Enemy body arrays (projectile arrays not needed by chain whip)
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
  // Damage functions (body enemies only — projectile damage not needed)
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
  hitEffects: HitEffect[];
  spawnDamageNumber: (x: number, y: number, vx: number, vy: number, text: string, healthFraction: number, color: string) => void;
  // Targeting — only the closest-body-enemy finder is needed
  findClosestEnemy: (rangeSq: number) => { x: number; y: number } | null;
  collectEnemyBodyTargets: () => ClosestTarget[];
  damageBodyTarget: (target: ClosestTarget, rawDamage: number, defPierceRatio: number, bypassShield: boolean) => number;
  /** Returns current terrain state, or null if terrain is not active. */
  getTerrainState?: () => TopographicTerrainState | null;
}

// ── Public handle ─────────────────────────────────────────────────────────────

export interface ChainWeaponHandle {
  /** Live map of per-weapon chain whip states — read by rpg-weapon-draw.ts. */
  readonly chainWhipStates: Map<string, ChainWhipState>;
  updateChainWhip(weaponId: string, deltaMs: number): void;
  reset(): void;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createChainWeaponSystem(ctx: ChainWeaponCtx): ChainWeaponHandle {
  const {
    mote, rpgSimState, playerStats, fluid, hitEffects, spawnDamageNumber, findClosestEnemy,
    damageEnemy, damageSapphireEnemy, damageEmeraldEnemy, damageAmberEnemy,
    damageVoidEnemy, damageQuartzEnemy, damageRubyEnemy, damageSunstoneEnemy,
    damageCitrineEnemy, damageIoliteEnemy, damageAmethystEnemy, damageDiamondEnemy,
    damageNullstoneEnemy, damageFracterylEnemy, damageEigensteinEnemy, damageEliteEnemy, damageBossEnemy,
  } = ctx;

  const chainWhipStates: Map<string, ChainWhipState> = new Map();

  function buildChainWhip(weaponId: string): ChainWhipState {
    const nodesX  = new Float64Array(CHAIN_NODES);
    const nodesY  = new Float64Array(CHAIN_NODES);
    const nodesVx = new Float64Array(CHAIN_NODES);
    const nodesVy = new Float64Array(CHAIN_NODES);
    const linkSides = new Uint8Array(CHAIN_NODES);
    for (let i = 0; i < CHAIN_NODES; i++) { nodesX[i] = mote.x; nodesY[i] = mote.y; }
    for (let i = 0; i < CHAIN_NODES; i++) linkSides[i] = 3 + Math.floor(Math.random() * 5);
    const weaponDef = resolveWeaponDefinition(weaponId);
    return {
      phase: 'idle' as ChainPhase,
      phaseMs: 0,
      cooldownMs: weaponDef?.stats.cooldownMs ?? 2500,
      targetX: mote.x, targetY: mote.y,
      nodesX, nodesY, nodesVx, nodesVy, linkSides,
      hitCooldowns: new Map(),
    };
  }

  function updateChainWhipCooldowns(ws: ChainWhipState, deltaMs: number): void {
    for (const [key, cd] of ws.hitCooldowns) {
      const next = cd - deltaMs;
      if (next <= 0) ws.hitCooldowns.delete(key);
      else ws.hitCooldowns.set(key, next);
    }
  }

  /**
   * Advances the softbody spring physics for all chain nodes.
   * anchorK controls how strongly node 0 is pulled toward the player.
   *
   * Force asymmetry: the force an inner node exerts on the outer node it is
   * connected to is 2.2x as strong as the force the outer node exerts back on
   * the inner node.  This propagates energy outward like a real whip crack.
   */
  function stepChainPhysics(ws: ChainWhipState, dt: number, anchorK: number): void {
    // Node 0: spring anchor toward player (rest length 0)
    ws.nodesVx[0] += (mote.x - ws.nodesX[0]) * anchorK * chainNodeInvMass(0) * dt;
    ws.nodesVy[0] += (mote.y - ws.nodesY[0]) * anchorK * chainNodeInvMass(0) * dt;

    // Asymmetric spring forces between adjacent pairs.
    for (let i = 0; i < CHAIN_NODES - 1; i++) {
      const sdx = ws.nodesX[i + 1] - ws.nodesX[i];
      const sdy = ws.nodesY[i + 1] - ws.nodesY[i];
      const sdist = Math.sqrt(sdx * sdx + sdy * sdy);
      if (sdist < 0.001) continue;
      const stretch = sdist - CHAIN_REST_LENGTH;
      const fx = (sdx / sdist) * stretch * CHAIN_SPRING_K;
      const fy = (sdy / sdist) * stretch * CHAIN_SPRING_K;
      // Outer node pulled/pushed by inner with 2.2× force
      ws.nodesVx[i + 1] -= fx * 2.2 * chainNodeInvMass(i + 1) * dt;
      ws.nodesVy[i + 1] -= fy * 2.2 * chainNodeInvMass(i + 1) * dt;
      // Inner node pulled/pushed by outer with 1× force
      ws.nodesVx[i]     += fx * chainNodeInvMass(i)     * dt;
      ws.nodesVy[i]     += fy * chainNodeInvMass(i)     * dt;
    }

    // Integrate positions + apply damping that rises linearly with node speed.
    for (let i = 0; i < CHAIN_NODES; i++) {
      const vx = ws.nodesVx[i];
      const vy = ws.nodesVy[i];
      const speed = Math.hypot(vx, vy);
      const linearDamp = Math.min(0.98, CHAIN_DAMPING_COEFF * (1 + CHAIN_DAMPING_SPEED_SCALE * speed) * dt);
      const retain = 1 - linearDamp;
      ws.nodesVx[i] *= retain;
      ws.nodesVy[i] *= retain;
      ws.nodesX[i] += ws.nodesVx[i] * dt;
      ws.nodesY[i] += ws.nodesVy[i] * dt;
    }
  }

  function updateChainWhip(weaponId: string, deltaMs: number): void {
    const weaponDef = resolveWeaponDefinition(weaponId);
    if (!weaponDef || weaponDef.stats.effect?.kind !== 'chainWhip') {
      chainWhipStates.delete(weaponId);
      return;
    }
    if (!chainWhipStates.has(weaponId)) chainWhipStates.set(weaponId, buildChainWhip(weaponId));
    const ws = chainWhipStates.get(weaponId)!;
    const range = weaponDef.stats.range;
    const tier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const contactDamage = getScaledWeaponDamage(weaponDef.stats.damage, tier, playerStats.atk);

    updateChainWhipCooldowns(ws, deltaMs);

    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);

    if (ws.phase === 'idle') {
      // Soft anchor during idle — nodes settle back toward player
      stepChainPhysics(ws, dt, CHAIN_ANCHOR_K);
      ws.phaseMs += deltaMs;
      if (ws.phaseMs >= ws.cooldownMs) {
        const target = findClosestEnemy(range * range);
        if (target) {
          ws.targetX = target.x; ws.targetY = target.y;
          ws.phase = 'lashing'; ws.phaseMs = 0;
        } else {
          ws.phaseMs = ws.cooldownMs;
        }
      }
    } else if (ws.phase === 'lashing') {
      ws.phaseMs += deltaMs;
      stepChainPhysics(ws, dt, CHAIN_ANCHOR_K);

      // Contact damage: check all nodes against all enemies.
      // Terrain LOS: if the player-to-node segment crosses terrain, that node cannot deal damage.
      const terrain = ctx.getTerrainState ? ctx.getTerrainState() : null;
      const applyContactDamage = (tx: number, ty: number, target: LaserEnemy | SapphireEnemy | EmeraldEnemy | AmberEnemy | VoidEnemy | QuartzEnemy | RubyEnemy | SunstoneEnemy | CitrineEnemy | IoliteEnemy | AmethystEnemy | DiamondEnemy | NullstoneEnemy | FracterylEnemy | EigensteinEnemy | EliteEnemy, nodeIdx: number): void => {
        const nodeR = chainNodeRadius(CHAIN_NODES - 1); // use tip radius for hit detection
        const r = nodeR + LASER_ENEMY_SIZE;
        const dx = tx - target.x, dy = ty - target.y;
        if (dx * dx + dy * dy < r * r) {
          if (!ws.hitCooldowns.has(target)) {
            // Terrain LOS: skip if the line from player to this node crosses terrain.
            if (terrain && segmentIntersectsTopographicTerrain(terrain, mote.x, mote.y, ws.nodesX[nodeIdx], ws.nodesY[nodeIdx])) return;
            let dmg = 0;
            // Sapphire is the only enemy type with `shieldHp` but without a `kind` discriminator.
            if ('shieldHp' in target && !('kind' in target)) {
              dmg = damageSapphireEnemy(target as SapphireEnemy, contactDamage, 0, false);
            } else if ('kind' in target) {
              const t = target as EmeraldEnemy | AmberEnemy | VoidEnemy | QuartzEnemy | RubyEnemy | SunstoneEnemy | CitrineEnemy | IoliteEnemy | AmethystEnemy | DiamondEnemy | NullstoneEnemy | FracterylEnemy | EigensteinEnemy | EliteEnemy;
              switch (t.kind) {
                case 'emerald':    dmg = damageEmeraldEnemy(t, contactDamage, 0); break;
                case 'amber':      dmg = damageAmberEnemy(t, contactDamage, 0); break;
                case 'void':       dmg = damageVoidEnemy(t, contactDamage, 0); break;
                case 'quartz':     dmg = damageQuartzEnemy(t, contactDamage, 0); break;
                case 'ruby':       dmg = damageRubyEnemy(t, contactDamage, 0); break;
                case 'sunstone':   dmg = damageSunstoneEnemy(t, contactDamage, 0); break;
                case 'citrine':    dmg = damageCitrineEnemy(t, contactDamage, 0); break;
                case 'iolite':     dmg = damageIoliteEnemy(t, contactDamage, 0); break;
                case 'amethyst':   dmg = damageAmethystEnemy(t, contactDamage, 0, false); break;
                case 'diamond':    dmg = damageDiamondEnemy(t, contactDamage, 0); break;
                case 'nullstone':  dmg = damageNullstoneEnemy(t, contactDamage, 0); break;
                case 'fracteryl':  dmg = damageFracterylEnemy(t, contactDamage, 0); break;
                case 'eigenstein': dmg = damageEigensteinEnemy(t, contactDamage, 0); break;
                case 'elite':      dmg = damageEliteEnemy(t, contactDamage, 0); break;
              }
            } else {
              dmg = damageEnemy(target as LaserEnemy, contactDamage, 0);
            }
            ws.hitCooldowns.set(target, CHAIN_HIT_CD_MS);
            hitEffects.push({ x: target.x, y: target.y, timerMs: HIT_EFFECT_DURATION_MS, color: CHAIN_NODE_COLOR });
            spawnDamageNumber(target.x, target.y, 0, -1, String(Math.round(dmg)), dmg / target.maxHp, CHAIN_NODE_COLOR);
          }
        }
      };
      const applyBodyTargetDamage = (tx: number, ty: number, target: ClosestTarget, nodeIdx: number): void => {
        if (!target.kind.startsWith('proc_') && target.kind !== 'verdure_plant') return;
        const body = getChainTargetBody(target);
        if (!body || ws.hitCooldowns.has(body)) return;
        const nodeR = chainNodeRadius(CHAIN_NODES - 1);
        const r = nodeR + LASER_ENEMY_SIZE;
        const dx = tx - target.x, dy = ty - target.y;
        if (dx * dx + dy * dy >= r * r) return;
        if (terrain && segmentIntersectsTopographicTerrain(terrain, mote.x, mote.y, ws.nodesX[nodeIdx], ws.nodesY[nodeIdx])) return;
        const dmg = ctx.damageBodyTarget(target, contactDamage, 0, false);
        ws.hitCooldowns.set(body, CHAIN_HIT_CD_MS);
        if (dmg > 0) {
          hitEffects.push({ x: target.x, y: target.y, timerMs: HIT_EFFECT_DURATION_MS, color: CHAIN_NODE_COLOR });
          spawnDamageNumber(target.x, target.y, 0, -1, String(Math.round(dmg)), dmg / body.maxHp, CHAIN_NODE_COLOR);
        }
      };
      const bodyTargets = ctx.collectEnemyBodyTargets();
      for (let ni = 0; ni < CHAIN_NODES; ni++) {
        const nx = ws.nodesX[ni], ny = ws.nodesY[ni];
        for (const e of ctx.enemies)           applyContactDamage(nx, ny, e, ni);
        for (const e of ctx.sapphireEnemies)   applyContactDamage(nx, ny, e, ni);
        for (const e of ctx.emeraldEnemies)    applyContactDamage(nx, ny, e, ni);
        for (const e of ctx.amberEnemies)      applyContactDamage(nx, ny, e, ni);
        for (const e of ctx.voidEnemies)       applyContactDamage(nx, ny, e, ni);
        for (const e of ctx.quartzEnemies)     applyContactDamage(nx, ny, e, ni);
        for (const e of ctx.rubyEnemies)       applyContactDamage(nx, ny, e, ni);
        for (const e of ctx.sunstoneEnemies)   applyContactDamage(nx, ny, e, ni);
        for (const e of ctx.citrineEnemies)    applyContactDamage(nx, ny, e, ni);
        for (const e of ctx.ioliteEnemies)     applyContactDamage(nx, ny, e, ni);
        for (const e of ctx.amethystEnemies)   applyContactDamage(nx, ny, e, ni);
        for (const e of ctx.diamondEnemies)    applyContactDamage(nx, ny, e, ni);
        for (const e of ctx.nullstoneEnemies)  applyContactDamage(nx, ny, e, ni);
        for (const e of ctx.fracterylEnemies)  applyContactDamage(nx, ny, e, ni);
        for (const e of ctx.eigensteinEnemies) applyContactDamage(nx, ny, e, ni);
        for (const e of ctx.eliteEnemies) { if (!e.isInvuln) applyContactDamage(nx, ny, e, ni); }
        for (const target of bodyTargets) applyBodyTargetDamage(nx, ny, target, ni);
      }
      // Apply chain whip damage to boss
      if (ctx.bossEnemy) {
        const bossHitR = BOSS_SIZE_BASE + ctx.bossEnemy.bossId * 1.5 + chainNodeRadius(CHAIN_NODES - 1);
        for (let ni = 0; ni < CHAIN_NODES; ni++) {
          const nx = ws.nodesX[ni], ny = ws.nodesY[ni];
          if (ws.hitCooldowns.has(ctx.bossEnemy)) break;
          // Terrain LOS: skip if the line from player to this node crosses terrain.
          if (terrain && segmentIntersectsTopographicTerrain(terrain, mote.x, mote.y, nx, ny)) continue;
          const dx = nx - ctx.bossEnemy.x, dy = ny - ctx.bossEnemy.y;
          if (dx * dx + dy * dy < bossHitR * bossHitR) {
            const dmg = damageBossEnemy(contactDamage, 0);
            ws.hitCooldowns.set(ctx.bossEnemy, CHAIN_HIT_CD_MS);
            hitEffects.push({ x: ctx.bossEnemy.x, y: ctx.bossEnemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: CHAIN_NODE_COLOR });
            if (dmg > 0) spawnDamageNumber(ctx.bossEnemy.x, ctx.bossEnemy.y, 0, -1, String(Math.round(dmg)), dmg / ctx.bossEnemy.maxHp, CHAIN_NODE_COLOR);
          }
        }
      }

      // Inject fluid force along the chain length
      const tipDx = ws.targetX - mote.x;
      const tipDy = ws.targetY - mote.y;
      const tipDist = Math.sqrt(tipDx * tipDx + tipDy * tipDy);
      if (tipDist > 0.1) {
        for (let ni = 0; ni < CHAIN_NODES; ni++) {
          fluid.addForce({
            x: ws.nodesX[ni], y: ws.nodesY[ni],
            vx: (tipDx / tipDist) * FLUID_VEL_FRAME_TO_PX_S * 1.5,
            vy: (tipDy / tipDist) * FLUID_VEL_FRAME_TO_PX_S * 1.5,
            r: FLUID_CHAIN_R, g: FLUID_CHAIN_G, b: FLUID_CHAIN_B,
            strength: 1.2,
          });
        }
      }

      if (ws.phaseMs >= CHAIN_LASH_MS) { ws.phase = 'retracting'; ws.phaseMs = 0; }
    } else if (ws.phase === 'retracting') {
      ws.phaseMs += deltaMs;
      // Use stronger anchor spring to pull nodes back toward player
      stepChainPhysics(ws, dt, CHAIN_RETRACT_ANCHOR_K);
      if (ws.phaseMs >= CHAIN_RETRACT_MS) { ws.phase = 'idle'; ws.phaseMs = 0; }
    }
  }

  return {
    get chainWhipStates() { return chainWhipStates; },
    updateChainWhip,
    reset() { chainWhipStates.clear(); },
  };
}

function getChainTargetBody(target: ClosestTarget): { maxHp: number } | null {
  const body =
    target.dustWisp ?? target.ribbonWorm ?? target.lanternMoth ?? target.eyeStalk ??
    target.jellyfish ?? target.clothGhost ?? target.plantTurret ?? target.gearInsect ??
    target.spiderCrawler ?? target.moteSwarm ?? target.shadowHand ?? target.sandFish ??
    target.quartzFish ?? target.rubyFish ?? target.sunstoneFish ?? target.emeraldFish ??
    target.sapphireFish ?? target.amethystFish ?? target.diamondFish ?? target.plantProj ??
    target.verdurePlant;
  return typeof body === 'object' && body !== null && 'maxHp' in body && typeof body.maxHp === 'number'
    ? { maxHp: body.maxHp }
    : null;
}
