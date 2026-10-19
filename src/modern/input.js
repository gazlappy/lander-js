// Mouse and keyboard for the modern version. The mouse works like the
// original: moving it sets how far and which way the ship tilts, as a
// virtual stick that stays where you leave it. WASD or the arrow keys
// tilt too, and spring back when released.

const KEYS = {
  thrust: ['Space', 'KeyK'],
  hover: ['ShiftLeft', 'ShiftRight', 'KeyL'],
  fire: ['KeyF', 'KeyJ', 'ControlLeft'],
};

export class ModernInput {
  constructor(canvas) {
    this.canvas = canvas;
    this.enabled = false;
    this.sensitivity = 1;
    this.swapButtons = false;
    this.stick = { x: 0, y: 0 };        // mouse stick, -1..1, y up
    this.keyStick = { x: 0, y: 0 };
    this.keys = new Set();
    this.mouse = { left: false, middle: false, right: false };
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
    this.mouse.left = this.mouse.middle = this.mouse.right = false;
    this.keys.clear();
  }

  centre() { this.stick.x = 0; this.stick.y = 0; }

  // Current controls in screen space: aim right/up (-1..1) and buttons
  read(dt) {
    const k = this.keys;
    const kx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const ky = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const ease = Math.min(1, dt * 4);
    this.keyStick.x += (kx * 0.85 - this.keyStick.x) * ease;
    this.keyStick.y += (ky * 0.85 - this.keyStick.y) * ease;
    let x = this.stick.x + this.keyStick.x, y = this.stick.y + this.keyStick.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    const held = (names) => names.some((n) => k.has(n));
    const primary = this.swapButtons ? this.mouse.right : this.mouse.left;
    const secondary = this.swapButtons ? this.mouse.left : this.mouse.right;
    return {
      aimRight: x, aimUp: y,
      thrust: primary || held(KEYS.thrust),
      hover: this.mouse.middle || held(KEYS.hover) || this.hoverLatch,
      fire: secondary || held(KEYS.fire),
    };
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
      if (this.locked) {
        const s = 0.0028 * this.sensitivity;
        this.stick.x += e.movementX * s;
        this.stick.y -= e.movementY * s;
        const len = Math.hypot(this.stick.x, this.stick.y);
        if (len > 1) { this.stick.x /= len; this.stick.y /= len; }
      } else if (e.target === canvas) {
        const r = canvas.getBoundingClientRect();
        const s = 2.2 * this.sensitivity;
        this.stick.x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * s));
        this.stick.y = Math.max(-1, Math.min(1, -((e.clientY - r.top) / r.height - 0.5) * s));
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      if (!this.locked) this.lock();
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 1) this.mouse.middle = true;
      if (e.button === 2) this.mouse.right = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 1) this.mouse.middle = false;
      if (e.button === 2) this.mouse.right = false;
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
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.middle = this.mouse.right = false; });
  }
}
