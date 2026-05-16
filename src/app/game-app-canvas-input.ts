import { updateGeneratorPointerPos, clearGeneratorPointerPos } from '../render/generators/generator-renderer';
import {
  handleParticleDragDown,
  handleParticleDragMove,
  handleParticleDragUp,
} from '../input/particle-drag';
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
): void {
  cc.canvas.addEventListener('pointerdown', (event: PointerEvent) => {
    cc.canvas.setPointerCapture(event.pointerId);
    audioSystem.resumeContext().catch(() => { /* silently ignore */ });
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
  });

  cc.canvas.addEventListener('pointermove', (event: PointerEvent) => {
    const pos = canvasCoordsFromPointerEvent(cc, event);
    if (appState.activeTab !== 'rpg') {
      updateGeneratorPointerPos(pos.x, pos.y);
    }
    if (!appState.particleDrag.isDown) return;
    event.preventDefault();
    handleParticleDragMove(appState.particleDrag, pos.x, pos.y, event.timeStamp, particles.particles);
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
