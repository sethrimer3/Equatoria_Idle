export { createGameCanvas, resizeCanvas, resetCanvasRenderState, clearCanvas, drawBackground, IDLE_LOGICAL_WIDTH, IDLE_LOGICAL_HEIGHT } from './game-canvas';
export type { CanvasContext } from './game-canvas';
export {
  computeRenderResolution,
  pixelBudgetForQuality,
  readNativeDevicePixelRatio,
  AUTO_MAX_BACKING_PIXELS,
  HIGH_MAX_BACKING_PIXELS,
  BALANCED_MAX_BACKING_PIXELS,
  PERFORMANCE_MAX_BACKING_PIXELS,
  OVERLAY_MAX_BACKING_PIXELS,
} from './render-resolution-policy';
export type {
  RenderResolutionQuality,
  RenderResolutionPolicyInput,
  RenderResolutionPolicyResult,
} from './render-resolution-policy';
