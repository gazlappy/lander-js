import { FIRE, HOVER, THRUST } from '../entities/player.js';

// The game reads the mouse the way RISC OS reported it: a position in
// 0-1279 x 0-1023 (y up) plus a button mask. Pointer lock gives relative
// movement like a real Archimedes mouse; without it, the pointer's position
// over the screen is mapped straight onto the same range.

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
        const rect = canvas.getBoundingClientRect();
        const fx = (e.clientX - rect.left) / rect.width - 0.5;
        const fy = (e.clientY - rect.top) / rect.height - 0.5;
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
        this.onPauseRequest();
        e.preventDefault();
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
