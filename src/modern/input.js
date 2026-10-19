// Mouse and keyboard for the modern version. The mouse is read exactly as
// the retro version and the 1987 original read it: a position in
// 0-1279 x 0-1023 (y up) that the ship's tilt follows, recentred at the
// start of each life. With pointer lock, moving the mouse moves that
// position (like the Archimedes mouse); without it, the pointer's place
// over the screen does. WASD or the arrow keys push the position off
// centre while held.

const MOUSE_MAX_X = 1279;
const MOUSE_MAX_Y = 1023;
const MOUSE_START = 511;
const KEY_REACH = 420;     // how far the keys move the mouse from where it is

const KEYS = {
  thrust: ['Space', 'KeyZ', 'KeyK'],
  hover: ['ShiftLeft', 'ShiftRight', 'KeyL'],
  fire: ['KeyF', 'KeyX', 'KeyJ', 'ControlLeft'],
};

export class ModernInput {
  constructor(canvas) {
    this.canvas = canvas;
    this.enabled = false;
    this.sensitivity = 1;
    this.swapButtons = false;
    this.mouse = { x: MOUSE_START, y: MOUSE_START };
    this.keyStick = { x: 0, y: 0 };
    this.keys = new Set();
    this.buttons = { left: false, middle: false, right: false };
    this.hoverLatch = false;
    this.handlers = {};
    this.wasLocked = false;
    this.bind();
  }

  on(name, fn) { this.handlers[name] = fn; }

  get locked() { return document.pointerLockElement === this.canvas; }

  lock() {
    try { this.canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* not available */ }
  }

  release() {
    if (this.locked) document.exitPointerLock();
    this.buttons.left = this.buttons.middle = this.buttons.right = false;
    this.keys.clear();
  }

  centre() {
    this.mouse.x = MOUSE_START;
    this.mouse.y = MOUSE_START;
  }

  // Current controls: the mouse position the game sees, and buttons
  read(dt) {
    const k = this.keys;
    const kx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const ky = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const ease = Math.min(1, dt * 5);
    this.keyStick.x += (kx - this.keyStick.x) * ease;
    this.keyStick.y += (ky - this.keyStick.y) * ease;
    const held = (names) => names.some((n) => k.has(n));
    const primary = this.swapButtons ? this.buttons.right : this.buttons.left;
    const secondary = this.swapButtons ? this.buttons.left : this.buttons.right;
    return {
      mouseX: Math.max(0, Math.min(MOUSE_MAX_X, this.mouse.x + this.keyStick.x * KEY_REACH)),
      mouseY: Math.max(0, Math.min(MOUSE_MAX_Y, this.mouse.y - this.keyStick.y * KEY_REACH)),
      thrust: primary || held(KEYS.thrust),
      hover: this.buttons.middle || held(KEYS.hover),
      hoverHold: this.hoverLatch,
      fire: secondary || held(KEYS.fire),
    };
  }

  // How far the mouse is from centre, -1..1 each way (for the HUD)
  get offset() {
    return { x: (Math.min(this.mouse.x, 1023) - 512) / 512, y: (512 - this.mouse.y) / 512 };
  }

  bind() {
    const { canvas } = this;
    document.addEventListener('pointerlockchange', () => {
      if (this.locked) { this.wasLocked = true; return; }
      if (this.wasLocked && this.enabled) this.handlers.pause?.();
      this.wasLocked = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      const m = this.mouse;
      if (this.locked) {
        // Two mouse units per pixel, as the retro version
        const s = 2 * this.sensitivity;
        m.x = Math.round(Math.max(0, Math.min(MOUSE_MAX_X, m.x + e.movementX * s)));
        m.y = Math.round(Math.max(0, Math.min(MOUSE_MAX_Y, m.y - e.movementY * s)));
      } else if (e.target === canvas) {
        const r = canvas.getBoundingClientRect();
        const s = 1024 * this.sensitivity;
        m.x = Math.round(Math.max(0, Math.min(MOUSE_MAX_X, 512 + ((e.clientX - r.left) / r.width - 0.5) * s)));
        m.y = Math.round(Math.max(0, Math.min(MOUSE_MAX_Y, 512 - ((e.clientY - r.top) / r.height - 0.5) * s)));
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      if (!this.locked) this.lock();
      if (e.button === 0) this.buttons.left = true;
      if (e.button === 1) this.buttons.middle = true;
      if (e.button === 2) this.buttons.right = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.buttons.left = false;
      if (e.button === 1) this.buttons.middle = false;
      if (e.button === 2) this.buttons.right = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.handlers.pause?.();
        return;
      }
      if (e.code === 'KeyH' && !e.repeat) { this.hoverLatch = !this.hoverLatch; this.handlers.hoverLatch?.(this.hoverLatch); }
      if (e.code === 'KeyC' && !e.repeat) this.handlers.camera?.();
      if (e.code === 'KeyR' && !e.repeat) this.centre();
      if (e.code === 'KeyM' && !e.repeat) this.handlers.map?.();
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons.left = this.buttons.middle = this.buttons.right = false; });
  }
}
