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
): () => void {
  let isDisposed = false;

  function onPointerDown(event: PointerEvent): void {
    if (isDisposed) return;
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
  }

  function onPointerMove(event: PointerEvent): void {
    if (isDisposed) return;
    const pos = canvasCoordsFromPointerEvent(cc, event);
    if (appState.activeTab !== 'rpg') {
      updateGeneratorPointerPos(pos.x, pos.y);
    }
    if (!appState.particleDrag.isDown) return;
    event.preventDefault();
    // Record only the latest position; the game loop batches the actual move.
    recordParticleDragMove(appState.particleDrag, pos.x, pos.y, event.timeStamp);
  }

  function onPointerLeave(): void {
    if (isDisposed) return;
    clearGeneratorPointerPos();
  }

  function onPointerUp(event: PointerEvent): void {
    if (isDisposed) return;
    const pos = canvasCoordsFromPointerEvent(cc, event);
    handleParticleDragUp(appState.particleDrag, pos.x, pos.y, event.timeStamp, particles.particles);
    clearGeneratorPointerPos();
  }

  function onPointerCancel(event: PointerEvent): void {
    if (isDisposed) return;
    const pos = canvasCoordsFromPointerEvent(cc, event);
    handleParticleDragUp(appState.particleDrag, pos.x, pos.y, event.timeStamp, particles.particles);
    clearGeneratorPointerPos();
  }

  cc.canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  cc.canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  cc.canvas.addEventListener('pointerleave', onPointerLeave);
  cc.canvas.addEventListener('pointerup', onPointerUp);
  cc.canvas.addEventListener('pointercancel', onPointerCancel);

  return () => {
    if (isDisposed) return;
    isDisposed = true;
    cc.canvas.removeEventListener('pointerdown', onPointerDown);
    cc.canvas.removeEventListener('pointermove', onPointerMove);
    cc.canvas.removeEventListener('pointerleave', onPointerLeave);
    cc.canvas.removeEventListener('pointerup', onPointerUp);
    cc.canvas.removeEventListener('pointercancel', onPointerCancel);
    if (appState.particleDrag.isDown || appState.particleDrag.lockedParticles.length > 0) {
      handleParticleDragUp(
        appState.particleDrag,
        appState.particleDrag.canvasX,
        appState.particleDrag.canvasY,
        performance.now(),
        particles.particles,
      );
    }
    clearGeneratorPointerPos();
  };
}
