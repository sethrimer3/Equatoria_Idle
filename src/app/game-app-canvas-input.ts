import { updateGeneratorPointerPos, clearGeneratorPointerPos } from '../render/generators/generator-renderer';
import {
  handleParticleDragDown,
  recordParticleDragMove,
  handleParticleDragUp,
} from '../input/particle-drag';
import type { ActionHandler } from '../input';
import type { AudioSystem } from '../audio';
import type { CanvasContext } from '../render/canvas/game-canvas';
import type { ParticleSystem } from '../render/particles/particle-system';
import type { AppState } from './app-types';

function canvasCoordsFromPointerEvent(
  cc: CanvasContext,
  event: PointerEvent,
): { x: number; y: number } {
  const rect = cc.canvas.getBoundingClientRect();
  const scaleX = cc.widthPx / rect.width;
  const scaleY = cc.heightPx / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

export function wireCanvasPointerInput(
  cc: CanvasContext,
  appState: AppState,
  particles: ParticleSystem,
  audioSystem: AudioSystem,
  dispatch: ActionHandler,
): void {
  cc.canvas.addEventListener('pointerdown', (event: PointerEvent) => {
    // Prevent synthetic mouse events that mobile browsers fire after touch,
    // which would otherwise trigger a second tap dispatch on the same gesture.
    event.preventDefault();
    cc.canvas.setPointerCapture(event.pointerId);
    audioSystem.resumeContext().catch(() => { /* silently ignore */ });

    // Dispatch the forge/equation tap from the canvas element directly.
    // This is more reliable on mobile than listening on the container, because
    // the canvas has touch-action: none and pointer capture is set immediately.
    dispatch({
      kind: 'tap',
      xScreen: event.clientX,
      yScreen: event.clientY,
      isTouchInput: event.pointerType === 'touch',
    });

    const pos = canvasCoordsFromPointerEvent(cc, event);
    if (appState.activeTab !== 'rpg') {
      updateGeneratorPointerPos(pos.x, pos.y);
    }
    handleParticleDragDown(
      appState.particleDrag,
      pos.x,
      pos.y,
      event.timeStamp,
      particles.particles,
      cc.widthPx,
      cc.heightPx,
    );
  }, { passive: false });


  cc.canvas.addEventListener('pointermove', (event: PointerEvent) => {
    const pos = canvasCoordsFromPointerEvent(cc, event);
    if (appState.activeTab !== 'rpg') {
      updateGeneratorPointerPos(pos.x, pos.y);
    }
    if (!appState.particleDrag.isDown) return;
    event.preventDefault();
    // Record latest position only — actual particle update is batched to the game loop via flushParticleDragMove
    recordParticleDragMove(appState.particleDrag, pos.x, pos.y, event.timeStamp);
  }, { passive: false });

  cc.canvas.addEventListener('pointerleave', () => {
    clearGeneratorPointerPos();
  });

  cc.canvas.addEventListener('pointerup', (event: PointerEvent) => {
    const pos = canvasCoordsFromPointerEvent(cc, event);
    handleParticleDragUp(appState.particleDrag, pos.x, pos.y, event.timeStamp, particles.particles);
    clearGeneratorPointerPos();
  });

  cc.canvas.addEventListener('pointercancel', (event: PointerEvent) => {
    const pos = canvasCoordsFromPointerEvent(cc, event);
    handleParticleDragUp(appState.particleDrag, pos.x, pos.y, event.timeStamp, particles.particles);
    clearGeneratorPointerPos();
  });
}
