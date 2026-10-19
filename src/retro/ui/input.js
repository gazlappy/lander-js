import { FIRE, HOVER, THRUST } from '../entities/player.js';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../config.js';

// The game reads the mouse the way RISC OS reported it: a position in
// 0-1279 x 0-1023 (y up) plus a button mask. Pointer lock gives relative
// movement like a real Archimedes mouse; without it, the pointer's position
// over the screen is mapped straight onto the same range.

// Map a mouse event to 320x256 screen coordinates, allowing for the
// letterboxing the canvas gets in fullscreen
export function screenPoint(canvas, e) {
  const r = canvas.getBoundingClientRect();
  const s = Math.min(r.width / SCREEN_WIDTH, r.height / SCREEN_HEIGHT);
  const left = r.left + (r.width - SCREEN_WIDTH * s) / 2;
  const top = r.top + (r.height - SCREEN_HEIGHT * s) / 2;
  return [(e.clientX - left) / s, (e.clientY - top) / s];
}

const MOUSE_MAX_X = 1279;
const MOUSE_MAX_Y = 1023;
const BUTTON_BITS = [THRUST, HOVER, FIRE];   // left, middle, right
const KEY_BUTTONS = { KeyZ: THRUST, Space: HOVER, ShiftLeft: HOVER, KeyX: FIRE };

export class Input {
  constructor(canvas, game, { onPauseRequest, onKey }) {
    this.canvas = canvas;
    this.game = game;
    this.sensitivity = 1;
    this.mouseButtons = 0;
    this.keyButtons = 0;
    this.enabled = false;
    this.wasLocked = false;
    this.onPauseRequest = onPauseRequest;
    this.onKey = onKey;
    this.bind();
  }

  get buttons() { return this.mouseButtons | this.keyButtons; }

  get locked() { return document.pointerLockElement === this.canvas; }

  lock() {
    try {
      const p = this.canvas.requestPointerLock?.();
      p?.catch?.(() => {});
    } catch { /* pointer lock unavailable: absolute positioning still works */ }
  }

  release() {
    if (this.locked) document.exitPointerLock();
    this.mouseButtons = 0;
    this.keyButtons = 0;
  }

  bind() {
    const { canvas } = this;
    document.addEventListener('pointerlockchange', () => {
      if (this.locked) { this.wasLocked = true; return; }
      if (this.wasLocked && this.enabled) this.onPauseRequest();
      this.wasLocked = false;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      const m = this.game.mouse;
      if (this.locked) {
        const s = this.sensitivity * 2;
        m.x = Math.round(Math.max(0, Math.min(MOUSE_MAX_X, m.x + e.movementX * s)));
        m.y = Math.round(Math.max(0, Math.min(MOUSE_MAX_Y, m.y - e.movementY * s)));
      } else if (e.target === canvas) {
        const [sx, sy] = screenPoint(canvas, e);
        const fx = sx / SCREEN_WIDTH - 0.5;
        const fy = sy / SCREEN_HEIGHT - 0.5;
        const s = this.sensitivity * 1024;
        m.x = Math.round(Math.max(0, Math.min(MOUSE_MAX_X, 512 + fx * s)));
        m.y = Math.round(Math.max(0, Math.min(MOUSE_MAX_Y, 512 - fy * s)));
      }
    });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      if (!this.locked) this.lock();
      this.mouseButtons |= BUTTON_BITS[e.button] || 0;
      this.onKey?.();
    });
    document.addEventListener('mouseup', (e) => {
      this.mouseButtons &= ~(BUTTON_BITS[e.button] || 0);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        // Stop the menu's own key handler seeing the same press
        e.stopImmediatePropagation();
        e.preventDefault();
        this.onPauseRequest();
        return;
      }
      if (KEY_BUTTONS[e.code]) {
        this.keyButtons |= KEY_BUTTONS[e.code];
        e.preventDefault();
      }
      if (!e.repeat) this.onKey?.();
    });
    document.addEventListener('keyup', (e) => {
      if (KEY_BUTTONS[e.code]) this.keyButtons &= ~KEY_BUTTONS[e.code];
    });
    window.addEventListener('blur', () => { this.mouseButtons = 0; this.keyButtons = 0; });
  }
}
