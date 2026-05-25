/**
 * rpg-input.ts — Pointer and keyboard input handling for the RPG tab.
 *
 * Extracted from rpg-render.ts to separate input translation from game logic.
 * Handles:
 *
 *   • Canvas pointer events → virtual joystick state.
 *   • Tap detection (short press without significant movement) →
 *     calls `tryTargetEnemyAt` so the player can manually lock onto an enemy.
 *   • Keyboard WASD / arrow-key events → key state object.
 *
 * The factory `createRpgInput(ctx)` receives an `RpgInputCtx` and
 * immediately registers all event listeners.  Call `handle.dispose()` to
 * remove the document-level keyboard listeners when the RPG view is torn down.
 */

import { JOYSTICK_OUTER_RADIUS } from './rpg-constants';
import type { RpgJoystick, RpgKeyState } from './rpg-types';

// ── Dependency-injection context ─────────────────────────────────────────────

export interface RpgInputCtx {
  canvas: HTMLCanvasElement;
  /** Internal render dimensions, kept in sync with widthPx/heightPx. */
  dim: { w: number; h: number };
  joystick: RpgJoystick;
  keys: RpgKeyState;
  /** Returns true while the RPG view is the active tab. */
  getIsActive: () => boolean;
  /** Called on a confirmed tap to lock player targeting onto a nearby enemy. */
  tryTargetEnemyAt: (x: number, y: number) => void;
  /**
   * Optional callback invoked when the player taps the zone-name / wave label
   * at the top-left of the canvas.  The label hit region is approximately
   * x < 210, y < 45 (canvas coordinate space).
   */
  onZoneLabelTap?: () => void;
}

// ── Public handle ─────────────────────────────────────────────────────────────

export interface RpgInputHandle {
  /** Remove document-level keyboard listeners. Call when the RPG view is torn down. */
  dispose(): void;
}

// ── Tap detection constants ───────────────────────────────────────────────────

const TAP_MAX_MS      = 250;   // max duration in ms for a press to count as a tap
const TAP_MAX_MOVE_PX = 10;   // max pointer movement in px for a press to count as a tap

// ── Factory ───────────────────────────────────────────────────────────────────

export function createRpgInput(ctx: RpgInputCtx): RpgInputHandle {
  const { canvas, dim, joystick, keys, getIsActive, tryTargetEnemyAt, onZoneLabelTap } = ctx;

  // ── Coordinate conversion ──────────────────────────────────────────────────

  function toCanvasCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width  > 0 ? dim.w / rect.width  : 1;
    const scaleY = rect.height > 0 ? dim.h / rect.height : 1;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  // ── Tap tracking state ─────────────────────────────────────────────────────

  let pointerDownTime = 0;
  let pointerDownX = 0;
  let pointerDownY = 0;

  // ── Pointer event listeners ────────────────────────────────────────────────

  canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    canvas.setPointerCapture(e.pointerId);
    const pos = toCanvasCoords(e.clientX, e.clientY);
    joystick.isActive = true; joystick.pointerId = e.pointerId;
    joystick.baseX = pos.x; joystick.baseY = pos.y;
    joystick.thumbX = pos.x; joystick.thumbY = pos.y;
    // Record for tap detection
    pointerDownTime = Date.now();
    pointerDownX = pos.x;
    pointerDownY = pos.y;
  }, { passive: false });

  canvas.addEventListener('pointermove', (e: PointerEvent) => {
    if (!joystick.isActive || e.pointerId !== joystick.pointerId) return;
    e.preventDefault();
    const pos = toCanvasCoords(e.clientX, e.clientY);
    const dx = pos.x - joystick.baseX;
    const dy = pos.y - joystick.baseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > JOYSTICK_OUTER_RADIUS) {
      joystick.thumbX = joystick.baseX + (dx / dist) * JOYSTICK_OUTER_RADIUS;
      joystick.thumbY = joystick.baseY + (dy / dist) * JOYSTICK_OUTER_RADIUS;
    } else {
      joystick.thumbX = pos.x; joystick.thumbY = pos.y;
    }
  }, { passive: false });

  function endJoystick(pointerId: number, pos?: { x: number; y: number }): void {
    if (pointerId !== joystick.pointerId) return;
    // Check for tap-to-target / zone label tap
    if (pos) {
      const elapsed = Date.now() - pointerDownTime;
      const dx = pos.x - pointerDownX;
      const dy = pos.y - pointerDownY;
      const moveDist = Math.sqrt(dx * dx + dy * dy);
      if (elapsed <= TAP_MAX_MS && moveDist <= TAP_MAX_MOVE_PX) {
        // Zone label region: top-left corner (generous tap target)
        if (onZoneLabelTap && pos.x < 210 && pos.y < 45) {
          onZoneLabelTap();
        } else {
          // Regular tap — find enemy at tap location
          tryTargetEnemyAt(pos.x, pos.y);
        }
      }
    }
    joystick.isActive = false; joystick.pointerId = -1;
  }

  canvas.addEventListener('pointerup', (e: PointerEvent) => {
    const pos = toCanvasCoords(e.clientX, e.clientY);
    endJoystick(e.pointerId, pos);
  });

  canvas.addEventListener('pointercancel', (e: PointerEvent) => endJoystick(e.pointerId));

  // ── Keyboard event listeners ───────────────────────────────────────────────

  function handleKeyDown(e: KeyboardEvent): void {
    if (!getIsActive()) return;
    switch (e.code) {
      case 'ArrowLeft':  case 'KeyA': keys.left  = true;  break;
      case 'ArrowRight': case 'KeyD': keys.right = true;  break;
      case 'ArrowUp':    case 'KeyW': keys.up    = true;  break;
      case 'ArrowDown':  case 'KeyS': keys.down  = true;  break;
      default: return;
    }
    if (e.code.startsWith('Arrow')) e.preventDefault();
  }

  function handleKeyUp(e: KeyboardEvent): void {
    if (!getIsActive()) return;
    switch (e.code) {
      case 'ArrowLeft':  case 'KeyA': keys.left  = false; break;
      case 'ArrowRight': case 'KeyD': keys.right = false; break;
      case 'ArrowUp':    case 'KeyW': keys.up    = false; break;
      case 'ArrowDown':  case 'KeyS': keys.down  = false; break;
    }
  }

  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup',   handleKeyUp);

  return {
    dispose(): void {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup',   handleKeyUp);
    },
  };
}
