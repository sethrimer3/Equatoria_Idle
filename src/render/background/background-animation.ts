/**
 * Background animation player.
 * Streams frames from a sequence of webp images, maintaining a small
 * rolling buffer to avoid loading all 2402 frames into memory at once.
 */

import {
  BG_ANIMATION_FRAME_COUNT,
  BG_ANIMATION_FPS,
  getBgAnimationFramePath,
} from '../assets/asset-paths';

/** How many frames to keep loaded ahead of the current playback position. */
const BUFFER_AHEAD = 60;
/** How many frames behind the current position to keep before evicting. */
const BUFFER_BEHIND = 10;

export interface BackgroundAnimation {
  /** The canvas element to insert into the DOM. */
  readonly canvas: HTMLCanvasElement;
  /** Advance the animation by deltaMs. Call every frame. */
  update(deltaMs: number): void;
  /** Resize the canvas to fill the given dimensions. */
  resize(width: number, height: number): void;
  /** Stop loading and clean up. */
  destroy(): void;
}

export function createBackgroundAnimation(): BackgroundAnimation {
  const canvas = document.createElement('canvas');
  canvas.className = 'bg-animation-canvas';
  const ctx = canvas.getContext('2d')!;

  let displayWidth = 0;
  let displayHeight = 0;

  // Frame buffer: maps frame index → loaded Image
  const frameBuffer = new Map<number, HTMLImageElement>();
  let currentFrameIndex = 0;
  let elapsedMs = 0;
  let isDestroyed = false;
  let isLoadingBatch = false;
  let loadFrameId: number | null = null;

  const frameDurationMs = 1000 / BG_ANIMATION_FPS;

  // Start preloading the first batch
  loadBatchAround(0);

  function loadBatchAround(centerFrame: number): void {
    if (isLoadingBatch || isDestroyed) return;
    isLoadingBatch = true;

    const startFrame = Math.max(0, centerFrame - BUFFER_BEHIND);
    const endFrame = Math.min(BG_ANIMATION_FRAME_COUNT - 1, centerFrame + BUFFER_AHEAD);

    // Evict frames outside the window
    for (const key of frameBuffer.keys()) {
      if (key < startFrame - BUFFER_BEHIND * 2 || key > endFrame + BUFFER_AHEAD) {
        frameBuffer.delete(key);
      }
    }

    // Load missing frames in the window
    let loadIndex = startFrame;
    const loadNext = (): void => {
      if (isDestroyed || loadIndex > endFrame) {
        isLoadingBatch = false;
        return;
      }

      if (frameBuffer.has(loadIndex)) {
        loadIndex++;
        loadNext();
        return;
      }

      const idx = loadIndex;
      const img = new Image();
      img.onload = () => {
        if (isDestroyed) { isLoadingBatch = false; return; }
        frameBuffer.set(idx, img);
        loadIndex++;
        // Load a few at a time, then yield to avoid blocking
        if (loadIndex % 5 === 0) {
          loadFrameId = requestAnimationFrame(() => {
            loadFrameId = null;
            loadNext();
          });
        } else {
          loadNext();
        }
      };
      img.onerror = () => {
        loadIndex++;
        loadNext();
      };
      img.src = getBgAnimationFramePath(idx);
    };

    loadNext();
  }

  function update(deltaMs: number): void {
    if (isDestroyed) return;

    elapsedMs += deltaMs;
    const targetFrame = Math.floor(elapsedMs / frameDurationMs) % BG_ANIMATION_FRAME_COUNT;

    // Check if we need to load more frames
    if (Math.abs(targetFrame - currentFrameIndex) > BUFFER_AHEAD / 2 || !frameBuffer.has(targetFrame)) {
      loadBatchAround(targetFrame);
    }

    currentFrameIndex = targetFrame;

    // Draw current frame if available
    const frameImg = frameBuffer.get(currentFrameIndex);
    if (frameImg && displayWidth > 0 && displayHeight > 0) {
      ctx.drawImage(frameImg, 0, 0, displayWidth, displayHeight);
    }
  }

  function resize(width: number, height: number): void {
    displayWidth = width;
    displayHeight = height;
    canvas.width = width;
    canvas.height = height;
  }

  function destroy(): void {
    if (isDestroyed) return;
    isDestroyed = true;
    if (loadFrameId !== null) cancelAnimationFrame(loadFrameId);
    loadFrameId = null;
    frameBuffer.clear();
  }

  return { canvas, update, resize, destroy };
}
