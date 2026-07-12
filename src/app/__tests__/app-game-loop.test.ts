import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsState } from '../../settings';
import type { ParticleSystem } from '../../render/particles/particle-system';
import type { AppState, UIPanels } from '../app-types';
import type { GameLoopContext, GameLoopFrameScheduler } from '../app-game-loop';

const loopMocks = vi.hoisted(() => ({
  order: [] as string[],
  simTick: vi.fn(() => {
    loopMocks.order.push('sim');
    return { newlyUnlockedAchievementIds: [], autoTapped: false, autoTapGains: null };
  }),
  tickForgeWarmup: vi.fn(() => { loopMocks.order.push('forge'); }),
}));

vi.mock('../../sim', () => ({
  simTick: loopMocks.simTick,
  getLoomRate: vi.fn(() => 0),
  getWaveBoostMultiplier: vi.fn(() => 1),
  processLoomCapture: vi.fn(),
  applyForgeSacrifice: vi.fn(() => new Map()),
  addMotes: vi.fn(),
  pendingMoteValue: vi.fn(() => 1),
}));

vi.mock('../../sim/forge/forge-state', () => ({
  tickForgeWarmup: loopMocks.tickForgeWarmup,
}));

import { createGameLoop } from '../app-game-loop';

class FakeRaf implements GameLoopFrameScheduler {
  readonly callbacks = new Map<number, FrameRequestCallback>();
  readonly cancelled: number[] = [];
  private nextId = 1;

  requestFrame(callback: FrameRequestCallback): number {
    const id = this.nextId++;
    this.callbacks.set(id, callback);
    return id;
  }

  cancelFrame(id: number): void {
    this.cancelled.push(id);
    this.callbacks.delete(id);
  }

  takeNext(): FrameRequestCallback {
    const next = this.callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
    expect(next).toBeDefined();
    this.callbacks.delete(next![0]);
    return next![1];
  }
}

function createContext(fpsLimit: SettingsState['fpsLimit'] = 'unlimited'): GameLoopContext {
  const rpgRender = {
    setLowGraphicsMode: vi.fn(),
    setScreenShakeEnabled: vi.fn(),
    setEnemyIndicatorStyle: vi.fn(),
    setNumberFormat: vi.fn(),
    setDevMode: vi.fn(),
    setInvincibilityMode: vi.fn(),
    setDeveloperVisuals: vi.fn(),
    setTopographicTerrainDebugEnabled: vi.fn(),
    update: vi.fn(() => { loopMocks.order.push('rpg'); }),
  };
  const appState = {
    activeTab: 'rpg',
    game: { lastSaveMs: 0 },
    forge: {},
  } as unknown as AppState;
  const particles = {
    onParticleCapturedByLoom: undefined,
    onEquationForgeCrunchCompleted: undefined,
  } as unknown as ParticleSystem;
  return {
    appState,
    cc: {} as GameLoopContext['cc'],
    particles,
    settings: {
      fpsLimit,
      graphicsQuality: 'high',
      isScreenShakeEnabled: true,
      rpgEnemyIndicatorStyle: 'triangle',
      numberFormat: 'letters',
      isDevMode: false,
      isInvincibilityMode: false,
      isRpgViewportDebugEnabled: false,
      isRpgPathfindingDebugEnabled: false,
      isRpgVerdureWallDebugEnabled: false,
      isRpgNadirAnchorDebugEnabled: false,
      isRpgBossStageDebugEnabled: false,
      isTopographyLightingDebugEnabled: false,
      isSoftImpetusAsteroidShadows: false,
      isRpgPixelatedRender: false,
      isTopographicTerrainDebugEnabled: false,
    } as SettingsState,
    uiPanels: {
      rpgMenuPanel: { isAutoMoveEnabled: false },
      rpgRender,
    } as unknown as UIPanels,
    bgAnimation: {} as GameLoopContext['bgAnimation'],
    vermiculateEffect: {} as GameLoopContext['vermiculateEffect'],
    substrateEffect: {} as GameLoopContext['substrateEffect'],
    recomputeGenerators: vi.fn(),
    hudOverlay: {} as GameLoopContext['hudOverlay'],
    lastUnlockedTierCount: { value: 1 },
    lastFrameMs: { value: 0 },
  };
}

describe('createGameLoop lifecycle', () => {
  beforeEach(() => {
    loopMocks.order.length = 0;
    vi.clearAllMocks();
  });

  it('starts once, owns exactly one pending frame, and schedules one successor per callback', () => {
    const raf = new FakeRaf();
    const loop = createGameLoop(createContext(), raf);

    loop.start();
    loop.start();
    expect(loop.isRunning).toBe(true);
    expect(raf.callbacks.size).toBe(1);

    raf.takeNext()(16);
    expect(raf.callbacks.size).toBe(1);
    expect(loopMocks.order).toEqual(['sim', 'forge', 'rpg']);
  });

  it('stop cancels the pending frame and stop during a callback prevents rescheduling', () => {
    const raf = new FakeRaf();
    const ctx = createContext();
    const loop = createGameLoop(ctx, raf);
    loop.start();
    loop.stop();
    expect(loop.isRunning).toBe(false);
    expect(raf.callbacks.size).toBe(0);
    expect(raf.cancelled).toHaveLength(1);

    loop.start();
    (ctx.uiPanels.rpgRender.update as ReturnType<typeof vi.fn>).mockImplementationOnce(() => loop.stop());
    raf.takeNext()(32);
    expect(raf.callbacks.size).toBe(0);
  });

  it('dispose is idempotent and stale callbacks cannot simulate', () => {
    const raf = new FakeRaf();
    const ctx = createContext();
    const loop = createGameLoop(ctx, raf);
    loop.start();
    const staleCallback = raf.takeNext();

    loop.dispose();
    loop.dispose();
    staleCallback(48);

    expect(loop.isRunning).toBe(false);
    expect(loopMocks.simTick).not.toHaveBeenCalled();
    expect(ctx.particles.onParticleCapturedByLoom).toBeUndefined();
    expect(ctx.particles.onEquationForgeCrunchCompleted).toBeUndefined();
    expect(raf.callbacks.size).toBe(0);
  });

  it('FPS-limited skipped callbacks still own exactly one successor', () => {
    const raf = new FakeRaf();
    const loop = createGameLoop(createContext(60), raf);
    loop.start();

    raf.takeNext()(100);
    expect(loopMocks.simTick).toHaveBeenCalledTimes(1);
    expect(raf.callbacks.size).toBe(1);

    raf.takeNext()(101);
    expect(loopMocks.simTick).toHaveBeenCalledTimes(1);
    expect(raf.callbacks.size).toBe(1);
  });
});
