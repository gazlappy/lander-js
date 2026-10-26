import * as THREE from 'three';
import { MISSIONS } from './missions.js';
import { PHYSICS } from './config.js';
import { heightAt } from './terrain.js';
import { HOME } from './bases.js';

// VR for Meta Quest (and any WebXR headset). You hover in the sky behind
// the ship, like the original's camera, with a fixed heading and snap
// turns for comfort. The Touch controllers fly the ship through the same
// virtual mouse as the desktop game, a HUD panel floats below your view,
// and menus are panels you point at with the controllers' lasers.
//
// Controls:
//   right stick       tilt the ship
//   right trigger     full thrust
//   either grip       hover
//   left trigger      fire
//   A                 hover hold on/off
//   B or Y            pause menu
//   left stick        snap turn

const STICK_REACH = 230;      // mouse units at full stick (about 80 degrees of tilt)
const STICK_CURVE = 1.7;      // gentler near the centre for fine control
const SNAP_ANGLE = Math.PI / 4;
const UP = new THREE.Vector3(0, 1, 0);

// A flat panel showing a canvas, for the HUD and menus
class Panel {
  constructor(width, height, pixelsWide) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = pixelsWide;
    this.canvas.height = Math.round((pixelsWide * height) / width);
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }),
    );
    this.mesh.renderOrder = 20;
    this.mesh.visible = false;
  }

  get w() { return this.canvas.width; }
  get h() { return this.canvas.height; }

  // Convert a raycast uv to canvas pixels
  toPixels(uv) { return [uv.x * this.w, (1 - uv.y) * this.h]; }

  commit() { this.texture.needsUpdate = true; }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function markerTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.translate(32, 32);
  ctx.rotate(Math.PI / 4);
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(-17, -17, 34, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class VRMode {
  // host supplies: state(), progress(), craft(), mission(), shipsLeft(),
  // lastResult(), launch(def), launchFree(), resume(), restart(),
  // abandon(), pause(), onEnter(), onExit()
  constructor(renderer, scene, camera, host) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.host = host;
    this.session = null;
    this.supported = false;
    this.heading = 0;
    this.hoverLatch = false;
    this.naturalStick = true;
    this.snapReady = true;
    this.blockTrigger = false;
    this.menuScreen = 'main';
    this.buttons = [];
    this.hovered = null;
    this.flashText = '';
    this.flashTimer = 0;
    this.hudTimer = 0;
    this.rumbleTimer = 0;

    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local');

    this.rig = new THREE.Group();
    this.rig.name = 'vr-rig';

    this.hud = new Panel(0.95, 0.38, 1024);
    this.hud.mesh.position.set(0, -0.5, -1.15);
    this.hud.mesh.rotation.x = -0.42;
    this.menu = new Panel(1.3, 0.95, 1024);
    this.menu.mesh.position.set(0, -0.05, -1.7);
    this.rig.add(this.hud.mesh, this.menu.mesh);

    this.markerMaterial = new THREE.SpriteMaterial({ map: markerTexture(), sizeAttenuation: false, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
    this.markers = [];

    this.controllers = [0, 1].map((i) => this.makeController(i));
    this.raycaster = new THREE.Raycaster();

    navigator.xr?.isSessionSupported?.('immersive-vr').then((ok) => {
      this.supported = ok;
      host.onSupportChanged?.(ok);
    }).catch(() => {});
  }

  get presenting() { return this.renderer.xr.isPresenting; }

  // --- Session --------------------------------------------------------------------

  async enter() {
    if (this.session || !navigator.xr) return;
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
    this.session = session;
    session.addEventListener('end', () => this.onSessionEnd());
    await this.renderer.xr.setSession(session);
    this.renderer.xr.setFoveation(1);
    this.scene.add(this.rig);
    this.rig.add(this.camera);
    this.camera.position.set(0, 0, 0);
    this.camera.quaternion.identity();
    this.menuScreen = 'main';
    this.host.onEnter();
  }

  exit() { this.session?.end(); }

  onSessionEnd() {
    this.session = null;
    this.viewKey = null;
    this.rig.remove(this.camera);
    this.scene.add(this.camera);
    this.scene.remove(this.rig);
    for (const m of this.markers) m.visible = false;
    this.host.onExit();
  }

  // --- Controllers ------------------------------------------------------------------

  makeController(index) {
    const xr = this.renderer.xr;
    const ray = xr.getController(index);
    const grip = xr.getControllerGrip(index);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
      new THREE.LineBasicMaterial({ color: 0x8ff0ff, transparent: true, opacity: 0.8, toneMapped: false }),
    );
    line.scale.z = 2;
    line.visible = false;
    ray.add(line);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, depthTest: false }));
    dot.renderOrder = 30;
    dot.visible = false;
    this.rig.add(dot);
    // A simple handle so you can see your hands
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.11, 10), new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.5, metalness: 0.3 }));
    body.rotation.x = -Math.PI / 2.6;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 6, 20), new THREE.MeshBasicMaterial({ color: 0x5fd16b, toneMapped: false }));
    ring.position.set(0, 0.02, -0.03);
    ring.rotation.x = Math.PI / 3;
    grip.add(body, ring);
    this.rig.add(ray, grip);
    const c = { ray, grip, line, dot, handedness: null };
    ray.addEventListener('connected', (e) => { c.handedness = e.data.handedness; });
    ray.addEventListener('disconnected', () => { c.handedness = null; });
    ray.addEventListener('selectstart', () => this.onSelect(c));
    return c;
  }

  gamepad(handedness) {
    for (const src of this.session?.inputSources || []) {
      if (src.handedness === handedness && src.gamepad) return src.gamepad;
    }
    return null;
  }

  pulse(handedness, intensity, ms) {
    const gp = this.gamepad(handedness);
    const h = gp?.hapticActuators?.[0];
    try { h?.pulse?.(Math.min(intensity, 1), ms); } catch { /* no haptics */ }
  }

  // Called by the game for things worth feeling
  onEvent(type) {
    if (!this.presenting) return;
    if (type === 'destroyed' || type === 'splashed') { this.pulse('right', 1, 400); this.pulse('left', 1, 400); }
    else if (type === 'scrape' || type === 'hit') { this.pulse('right', 0.6, 120); this.pulse('left', 0.6, 120); }
    else if (type === 'landed') this.pulse('right', 0.3, 60);
    else if (type === 'fire') this.pulse('left', 0.12, 20);
  }

  flash(text) { this.flashText = text; this.flashTimer = 1.6; }

  // Flight controls from the Touch controllers, in the same form as the
  // desktop input (a virtual mouse plus buttons)
  readControls(dt) {
    const r = this.gamepad('right'), l = this.gamepad('left');
    const btn = (gp, i) => !!gp?.buttons[i]?.pressed;
    const val = (gp, i) => gp?.buttons[i]?.value || 0;
    let sx = r?.axes[2] || 0, sy = r?.axes[3] || 0;
    const len = Math.hypot(sx, sy);
    const dead = 0.08;
    if (len < dead) { sx = 0; sy = 0; } else {
      const k = (Math.pow((Math.min(len, 1) - dead) / (1 - dead), STICK_CURVE) * STICK_REACH) / len;
      sx *= k; sy *= k;
    }
    // Natural: stick forward flies away from you. Original: as the mouse did,
    // where pushing up brings the ship towards the camera.
    const mouseX = 512 + sx;
    const mouseY = this.naturalStick ? 512 - sy : 512 + sy;

    // A toggles hover hold; left stick snap-turns
    const a = btn(r, 4);
    if (a && !this.aWas) { this.hoverLatch = !this.hoverLatch; this.flash(this.hoverLatch ? 'Hover hold on' : 'Hover hold off'); }
    this.aWas = a;
    const lx = l?.axes[2] || 0;
    if (this.snapReady && Math.abs(lx) > 0.7) { this.heading -= Math.sign(lx) * SNAP_ANGLE; this.snapReady = false; this.snapFrames = 0; }
    if (Math.abs(lx) < 0.3) this.snapReady = true;

    const triggerHeld = val(r, 0) > 0.4;
    if (this.blockTrigger && !triggerHeld) this.blockTrigger = false;
    const controls = {
      mouseX, mouseY,
      thrust: triggerHeld && !this.blockTrigger,
      hover: val(r, 1) > 0.4 || val(l, 1) > 0.4,
      hoverHold: this.hoverLatch,
      fire: val(l, 0) > 0.4,
      heading: this.heading,
    };
    // B or Y opens the pause menu
    const menuButton = btn(r, 5) || btn(l, 5);
    if (menuButton && !this.menuWas) this.host.pause();
    this.menuWas = menuButton;
    return controls;
  }

  // --- Per-frame -----------------------------------------------------------------------

  update(dt, ship) {
    if (!this.presenting) return;
    const state = this.host.state();
    const flying = state === 'playing' || state === 'dead';
    // Menu buttons work from every screen
    if (!flying) {
      const menuButton = btn2(this.gamepad('right'), 5) || btn2(this.gamepad('left'), 5);
      if (menuButton && !this.menuWas && (state === 'paused' || state === 'deadPaused')) this.host.resume();
      this.menuWas = menuButton;
    }
    this.placeRig(dt, ship, state);
    this.measureView();
    this.hud.mesh.visible = flying;
    this.menu.mesh.visible = !flying;
    if (flying) {
      this.hudTimer -= dt;
      if (this.hudTimer <= 0) { this.hudTimer = 1 / 15; this.drawHud(ship); }
      this.rumble(dt, ship);
    } else {
      this.drawMenu(state);
    }
    this.updatePointers(!flying);
    this.updateMarkers(flying);
    if (this.flashTimer > 0) this.flashTimer -= dt;
  }

  // Particle sizes depend on the eye's resolution and field of view, which
  // vary by headset, so read them from the XR camera
  measureView() {
    const eye = this.renderer.xr.getCamera().cameras[0];
    if (!eye?.viewport?.w) return;
    const tanHalf = 1 / eye.projectionMatrix.elements[5];
    const key = `${eye.viewport.w}x${eye.viewport.w}:${tanHalf.toFixed(3)}`;
    if (key === this.viewKey) return;
    this.viewKey = key;
    this.host.onViewport(eye.viewport.w, tanHalf);
  }

  // Behind and above the ship at a fixed heading, easing after it; on the
  // title screen, looking over the launchpad
  placeRig(dt, ship, state) {
    const rig = this.rig;
    let target;
    if (state === 'title') {
      const pad = HOME.pads[0];
      target = new THREE.Vector3(pad.x, pad.y + 7, pad.z - 28);
      this.heading = 0;
    } else {
      const h = this.heading;
      const back = 21 + ship.velocity.length() * 0.12;
      target = new THREE.Vector3(ship.position.x - Math.sin(h) * back, ship.position.y + 5.5, ship.position.z - Math.cos(h) * back);
      const floor = Math.max(heightAt(target.x, target.z), 0) + 3;
      if (target.y < floor) target.y = floor;
    }
    const snap = !this.rigPlaced || rig.position.distanceTo(target) > 200;
    rig.position.lerp(target, snap ? 1 : 1 - Math.exp(-dt * 2.6));
    rig.quaternion.setFromAxisAngle(UP, this.heading + Math.PI);
    this.rigPlaced = true;
  }

  rumble(dt, ship) {
    this.rumbleTimer -= dt;
    if (this.rumbleTimer > 0 || ship.throttle < 0.05) return;
    this.rumbleTimer = 0.1;
    this.pulse('right', 0.06 + ship.throttle * 0.18, 90);
  }

  // --- Pointers and menus ------------------------------------------------------------------

  updatePointers(menuOpen) {
    this.hovered = null;
    for (const c of this.controllers) {
      c.line.visible = menuOpen && !!c.handedness;
      c.dot.visible = false;
      if (!menuOpen || !c.handedness) continue;
      const origin = new THREE.Vector3().setFromMatrixPosition(c.ray.matrixWorld);
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(c.ray.getWorldQuaternion(new THREE.Quaternion()));
      this.raycaster.set(origin, dir);
      const hit = this.raycaster.intersectObject(this.menu.mesh, false)[0];
      if (!hit) { c.line.scale.z = 2; continue; }
      c.line.scale.z = hit.distance / this.rig.scale.z;
      c.dot.visible = true;
      c.dot.position.copy(this.rig.worldToLocal(hit.point.clone()));
      const [px, py] = this.menu.toPixels(hit.uv);
      const b = this.buttons.find((k) => px >= k.x && px <= k.x + k.w && py >= k.y && py <= k.y + k.h);
      if (b && b.enabled !== false) { this.hovered = b; c.hovering = b; } else c.hovering = null;
    }
  }

  onSelect(c) {
    const state = this.host.state();
    if (!this.presenting || state === 'playing' || state === 'dead') return;
    const b = c.hovering;
    if (!b || b.enabled === false) return;
    this.pulse(c.handedness, 0.3, 40);
    this.blockTrigger = true;    // don't let the click become thrust
    b.run();
  }

  menuItems(state) {
    const h = this.host;
    const p = h.progress();
    if (state === 'paused' || state === 'deadPaused') {
      return { title: 'Paused', items: [
        { label: 'Resume', run: () => h.resume() },
        { label: 'Restart mission', run: () => h.restart(), enabled: !h.isFree() },
        { label: 'Abandon', run: () => { h.abandon(); this.menuScreen = 'main'; } },
        { label: 'Exit VR', run: () => this.exit() },
      ] };
    }
    if (state === 'results') {
      const r = h.lastResult();
      return {
        title: r.success ? 'Mission complete' : 'Mission failed',
        lines: [r.name, r.reason || '', `Time ${r.time.toFixed(1)} s   Reward ${r.reward} cr   Bonus ${r.bonus} cr`],
        items: [
          { label: r.success ? 'Play again' : 'Try again', run: () => h.restart() },
          { label: 'Main menu', run: () => { h.abandon(); this.menuScreen = 'main'; } },
        ],
      };
    }
    if (this.menuScreen === 'missions') {
      const unlocked = (i) => i === 0 || p.completed[MISSIONS[i - 1].id] !== undefined;
      const craft = h.craft();
      return { title: 'Missions', items: [
        ...MISSIONS.map((m, i) => ({
          label: `${m.name}${p.completed[m.id] !== undefined ? '  ✓' : ''}`,
          enabled: unlocked(i) && !(m.needsCargo && craft.cargo === 0),
          run: () => h.launch(m),
        })),
        { label: 'Back', run: () => { this.menuScreen = 'main'; } },
      ] };
    }
    if (this.menuScreen === 'options') {
      return { title: 'VR options', items: [
        { label: `Stick forward: ${this.naturalStick ? 'flies away' : 'as the original mouse'}`, run: () => { this.naturalStick = !this.naturalStick; h.saveVr({ naturalStick: this.naturalStick }); } },
        { label: `Hover hold: ${this.hoverLatch ? 'on' : 'off'}`, run: () => { this.hoverLatch = !this.hoverLatch; } },
        { label: 'Back', run: () => { this.menuScreen = 'main'; } },
      ] };
    }
    return {
      title: 'LANDER VR',
      lines: [`${p.credits.toLocaleString()} credits  ·  flying the ${h.craft().name}`],
      items: [
        { label: 'Free flight', run: () => h.launchFree() },
        { label: 'Missions', run: () => { this.menuScreen = 'missions'; } },
        { label: 'VR options', run: () => { this.menuScreen = 'options'; } },
        { label: 'Exit VR', run: () => this.exit() },
      ],
    };
  }

  drawMenu(state) {
    const { title, lines = [], items } = this.menuItems(state);
    const key = JSON.stringify([title, lines, items.map((i) => [i.label, i.enabled]), this.hovered?.label]);
    if (key === this.menuKey) return;
    this.menuKey = key;
    const { ctx, w, h } = this.menu;
    ctx.clearRect(0, 0, w, h);
    roundRect(ctx, 6, 6, w - 12, h - 12, 36);
    ctx.fillStyle = 'rgba(10, 16, 26, 0.86)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(233, 246, 255, 0.18)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 64px system-ui, sans-serif';
    ctx.fillStyle = '#7fe08a';
    ctx.fillText(title, w / 2, 78);
    ctx.font = '28px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(233, 246, 255, 0.7)';
    lines.filter(Boolean).forEach((l, i) => ctx.fillText(l, w / 2, 138 + i * 38));
    const top = 138 + Math.max(lines.filter(Boolean).length, 0.5) * 38 + 10;
    const bh = Math.min(74, (h - top - 30) / items.length - 10);
    this.buttons = items.map((item, i) => {
      const b = { ...item, x: 150, y: top + i * (bh + 10), w: w - 300, h: bh };
      const hot = this.hovered && this.hovered.label === item.label && item.enabled !== false;
      roundRect(ctx, b.x, b.y, b.w, b.h, 16);
      ctx.fillStyle = item.enabled === false ? 'rgba(233, 246, 255, 0.04)' : hot ? 'rgba(95, 209, 107, 0.42)' : 'rgba(233, 246, 255, 0.1)';
      ctx.fill();
      ctx.strokeStyle = hot ? '#5fd16b' : 'rgba(233, 246, 255, 0.22)';
      ctx.stroke();
      ctx.font = `${Math.min(36, bh * 0.5)}px system-ui, sans-serif`;
      ctx.fillStyle = item.enabled === false ? 'rgba(233, 246, 255, 0.3)' : '#eef6ff';
      ctx.fillText(item.label, w / 2, b.y + b.h / 2);
      return b;
    });
    this.menu.commit();
  }

  // --- HUD ------------------------------------------------------------------------------

  drawHud(ship) {
    const { ctx, w, h } = this.hud;
    const c = ship.craft;
    const m = this.host.mission();
    ctx.clearRect(0, 0, w, h);
    roundRect(ctx, 4, 4, w - 8, h - 8, 28);
    ctx.fillStyle = 'rgba(8, 14, 22, 0.62)';
    ctx.fill();
    ctx.textBaseline = 'middle';

    // Left: craft, hull, fuel, cargo
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e9f6ff';
    ctx.font = '600 30px system-ui, sans-serif';
    ctx.fillText(c.name, 34, 46);
    const bar = (label, frac, y) => {
      ctx.font = '24px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(233, 246, 255, 0.6)';
      ctx.fillText(label, 34, y);
      roundRect(ctx, 110, y - 9, 190, 18, 9);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fill();
      roundRect(ctx, 110, y - 9, Math.max(190 * Math.max(frac, 0), 1), 18, 9);
      ctx.fillStyle = frac < 0.25 ? '#ff6a4f' : '#6fdcff';
      ctx.fill();
    };
    bar('Hull', ship.hull / c.hull, 96);
    bar('Fuel', ship.fuel / c.fuel, 134);
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(233, 246, 255, 0.6)';
    if (c.cargo) ctx.fillText(`Cargo ${ship.cargo.length}/${c.cargo}`, 34, 174);
    const ships = this.host.shipsLeft();
    if (ships !== Infinity) ctx.fillText(`Ships ${ships}`, 34, 210);

    // Centre: objective, timer, messages
    ctx.textAlign = 'center';
    ctx.font = '26px system-ui, sans-serif';
    ctx.fillStyle = '#e9f6ff';
    wrapText(ctx, m?.objective || '', 400).slice(0, 3).forEach((l, i) => ctx.fillText(l, w / 2, 44 + i * 32));
    const left = m?.timeLeft;
    if (left !== null && left !== undefined) {
      ctx.font = '600 38px system-ui, sans-serif';
      ctx.fillStyle = left < 20 ? '#ff6a4f' : '#e9f6ff';
      ctx.fillText(`${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`, w / 2, 158);
    }
    let message = '';
    if (ship.destroyed) message = 'SHIP LOST';
    else if (this.flashTimer > 0) message = this.flashText;
    else if (ship.hull / c.hull < 0.25) message = 'HULL CRITICAL';
    else if (ship.fuel / c.fuel < 0.15) message = ship.fuel <= 0 ? 'OUT OF FUEL' : 'LOW FUEL';
    if (message) {
      ctx.font = '700 36px system-ui, sans-serif';
      ctx.fillStyle = message === this.flashText ? '#ffb340' : '#ff6a4f';
      ctx.fillText(message, w / 2, 214);
    }
    if (this.hoverLatch) {
      ctx.font = '22px system-ui, sans-serif';
      ctx.fillStyle = '#5fe08a';
      ctx.fillText('HOVER HOLD', w / 2, 252);
    }

    // Objective direction, relative to the way you're facing
    const target = m?.markers?.[0];
    if (target) {
      const dx = target.position.x - ship.position.x, dz = target.position.z - ship.position.z;
      const angle = Math.atan2(dx, dz) - this.heading;
      const cx = w / 2, cy = 330;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath(); ctx.arc(0, 0, 44, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(233, 246, 255, 0.3)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.rotate(-angle);
      ctx.beginPath(); ctx.moveTo(0, -38); ctx.lineTo(16, 6); ctx.lineTo(-16, 6); ctx.closePath();
      ctx.fillStyle = target.colour; ctx.fill();
      ctx.restore();
      const dist = Math.hypot(dx, dz);
      ctx.font = '22px system-ui, sans-serif';
      ctx.fillStyle = target.colour;
      ctx.fillText(`${target.label} ${dist > 999 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`}`, cx, cy + 66 > h - 14 ? h - 14 : cy + 64);
    }

    // Right: instruments and the landing light
    const v = ship.velocity;
    const read = (label, value, y) => {
      ctx.textAlign = 'right';
      ctx.font = '600 40px system-ui, sans-serif';
      ctx.fillStyle = '#e9f6ff';
      ctx.fillText(value, w - 150, y);
      ctx.textAlign = 'left';
      ctx.font = '22px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(233, 246, 255, 0.6)';
      ctx.fillText(label, w - 138, y);
    };
    read('m/s', v.length().toFixed(0), 50);
    read('climb', (v.y >= 0 ? '+' : '') + v.y.toFixed(1), 100);
    read('m up', ship.altitude.toFixed(0), 150);
    let state = 'off', label = 'LAND';
    if (ship.landed) { state = 'down'; label = ship.pad ? 'ON PAD' : 'LANDED'; }
    else if (ship.altitude < 40) {
      const impact = Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z);
      state = impact < PHYSICS.landingSpeed && ship.tiltAngle <= PHYSICS.landingTilt ? 'safe' : 'danger';
    }
    const colours = { off: 'rgba(255, 255, 255, 0.08)', safe: 'rgba(40, 170, 80, 0.9)', danger: 'rgba(210, 50, 40, 0.9)', down: 'rgba(60, 120, 210, 0.85)' };
    roundRect(ctx, w - 300, 190, 260, 64, 14);
    ctx.fillStyle = colours[state];
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = '700 32px system-ui, sans-serif';
    ctx.fillStyle = state === 'off' ? 'rgba(255, 255, 255, 0.3)' : '#fff';
    ctx.fillText(label, w - 170, 222);
    this.hud.commit();
  }

  // Diamonds over mission targets, a fixed size whatever the distance
  updateMarkers(flying) {
    const list = flying ? this.host.mission()?.markers || [] : [];
    while (this.markers.length < list.length) {
      const s = new THREE.Sprite(this.markerMaterial.clone());
      s.scale.set(0.035, 0.035, 1);
      s.renderOrder = 25;
      this.scene.add(s);
      this.markers.push(s);
    }
    this.markers.forEach((s, i) => {
      const m = list[i];
      s.visible = !!m;
      if (!m) return;
      s.position.copy(m.position).y += 7;
      s.material.color.set(m.colour);
    });
  }
}

function btn2(gp, i) { return !!gp?.buttons[i]?.pressed; }
