import * as THREE from 'three';
import { naturalHeight } from './terrain.js';
import { BASES } from './bases.js';
import { PHYSICS } from './config.js';

// The heads-up display: gauges, objective, markers that track targets in
// 3D (with edge arrows when they're off-screen), a gunsight and a minimap.
// Plain DOM over the WebGL canvas, so text stays crisp at any size.

const MAP_RANGE = 3000;     // metres from the centre to the minimap edge
const MAP_PIXELS = 256;

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

// A top-down picture of the island, drawn once. The map is oriented like
// the classic camera view: +z (the way the camera faces) is up and -x is
// to the right.
function islandMap() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = MAP_PIXELS;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(MAP_PIXELS, MAP_PIXELS);
  for (let j = 0; j < MAP_PIXELS; j++) {
    for (let i = 0; i < MAP_PIXELS; i++) {
      const x = (0.5 - i / MAP_PIXELS) * 2 * MAP_RANGE, z = (0.5 - j / MAP_PIXELS) * 2 * MAP_RANGE;
      const h = naturalHeight(x, z);
      const k = (j * MAP_PIXELS + i) * 4;
      if (h < 0) { img.data[k] = 18; img.data[k + 1] = 44 + h * 0.2; img.data[k + 2] = 78 + h * 0.3; }
      else if (h < 3) { img.data[k] = 170; img.data[k + 1] = 156; img.data[k + 2] = 110; }
      else {
        const t = Math.min(h / 220, 1);
        img.data[k] = 50 + t * 130; img.data[k + 1] = 105 + t * 70; img.data[k + 2] = 50 + t * 120;
      }
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export class Hud {
  constructor(root) {
    this.root = root;
    root.classList.add('hud');
    root.innerHTML = '';

    const left = el('div', 'hud-panel hud-left', root);
    this.craftName = el('div', 'hud-title', left);
    this.hullBar = this.bar(left, 'Hull');
    this.fuelBar = this.bar(left, 'Fuel');
    this.cargo = el('div', 'hud-cargo', left);

    const top = el('div', 'hud-top', root);
    this.objective = el('div', 'hud-objective', top);
    this.timer = el('div', 'hud-timer', top);
    this.flashBox = el('div', 'hud-flash', top);

    const right = el('div', 'hud-panel hud-right', root);
    this.credits = el('div', 'hud-credits', right);
    this.ships = el('div', 'hud-ships', right);
    this.fps = el('div', 'hud-fps', right);

    const instruments = el('div', 'hud-instruments', root);
    this.speed = this.readout(instruments, 'Speed', 'm/s');
    this.climb = this.readout(instruments, 'Climb', 'm/s');
    this.alt = this.readout(instruments, 'Height', 'm');
    this.landLight = el('div', 'hud-land', instruments, 'LAND');
    this.modeTag = el('div', 'hud-mode', root);
    this.warning = el('div', 'hud-warning', root);

    this.sight = el('div', 'hud-sight', root);
    this.markerLayer = el('div', 'hud-markers', root);
    this.markerPool = [];

    this.mapBox = el('div', 'hud-map', root);
    this.mapCanvas = el('canvas', '', this.mapBox);
    this.mapCanvas.width = this.mapCanvas.height = 200;
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.mapImage = islandMap();
    this.big = false;

    this.message = el('div', 'hud-message', root);
    this.flashTimer = 0;
    this.tmp = new THREE.Vector3();
  }

  bar(parent, label) {
    const row = el('div', 'hud-bar', parent);
    el('span', 'hud-bar-label', row, label);
    const track = el('div', 'hud-bar-track', row);
    const fill = el('div', 'hud-bar-fill', track);
    return fill;
  }

  readout(parent, label, unit) {
    const box = el('div', 'hud-readout', parent);
    const value = el('div', 'hud-readout-value', box, '0');
    el('div', 'hud-readout-label', box, `${label} ${unit}`);
    return value;
  }

  show(on) { this.root.style.display = on ? '' : 'none'; }

  toggleMap() {
    this.big = !this.big;
    this.mapBox.classList.toggle('big', this.big);
    const size = this.big ? 420 : 200;
    this.mapCanvas.width = this.mapCanvas.height = size;
  }

  flash(text, seconds = 2.5) {
    this.flashBox.textContent = text;
    this.flashBox.classList.add('on');
    this.flashTimer = seconds;
  }

  // Big centred message ("SHIP LOST" etc), or '' to clear
  banner(text) {
    this.message.textContent = text;
    this.message.classList.toggle('on', !!text);
  }

  update(dt, game) {
    const { ship, camera } = game;
    const c = ship.craft;
    this.craftName.textContent = c.name;
    const hull = ship.hull / c.hull, fuel = ship.fuel / c.fuel;
    this.hullBar.style.width = `${Math.max(0, hull) * 100}%`;
    this.hullBar.classList.toggle('low', hull < 0.3);
    this.fuelBar.style.width = `${Math.max(0, fuel) * 100}%`;
    this.fuelBar.classList.toggle('low', fuel < 0.2);
    this.cargo.textContent = c.cargo ? `Cargo ${ship.cargo.length}/${c.cargo}` : '';

    const m = game.mission;
    this.objective.textContent = m?.objective || '';
    const left = m?.timeLeft;
    this.timer.textContent = left === null || left === undefined ? '' : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    this.timer.classList.toggle('low', left !== null && left < 20);
    if (this.flashTimer > 0) { this.flashTimer -= dt; if (this.flashTimer <= 0) this.flashBox.classList.remove('on'); }

    this.credits.textContent = `${game.progress.credits.toLocaleString()} cr`;
    this.ships.textContent = game.shipsLeft === Infinity ? '' : `Ships ${game.shipsLeft}`;

    const v = ship.velocity;
    this.speed.textContent = v.length().toFixed(0);
    this.climb.textContent = (v.y >= 0 ? '+' : '') + v.y.toFixed(1);
    const alt = ship.altitude;
    this.alt.textContent = alt.toFixed(0);
    // Landing light: green when a touchdown now would be safe
    let state = 'off';
    if (ship.landed) state = 'down';
    else if (alt < 40) {
      const impact = Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z);
      state = impact < PHYSICS.landingSpeed && ship.tiltAngle <= PHYSICS.landingTilt ? 'safe' : 'danger';
    }
    this.landLight.className = `hud-land ${state}`;
    this.landLight.textContent = ship.landed ? (ship.pad ? 'ON PAD' : 'LANDED') : 'LAND';
    this.modeTag.textContent = game.input.hoverLatch ? 'HOVER HOLD' : '';

    let warn = '';
    if (!ship.destroyed) {
      if (fuel < 0.15) warn = fuel <= 0 ? 'OUT OF FUEL' : 'LOW FUEL';
      if (hull < 0.25) warn = 'HULL CRITICAL';
    }
    this.warning.textContent = warn;

    this.updateSight(game);
    this.updateMarkers(game, m?.markers || []);
    this.drawMap(game, m?.markers || []);
  }

  project(position, camera, out) {
    const v = this.tmp.copy(position).project(camera);
    const w = this.root.clientWidth, h = this.root.clientHeight;
    out.x = (v.x * 0.5 + 0.5) * w;
    out.y = (-v.y * 0.5 + 0.5) * h;
    out.behind = v.z > 1;
    out.w = w; out.h = h;
    return out;
  }

  updateSight(game) {
    const { ship, camera } = game;
    if (ship.destroyed) { this.sight.style.display = 'none'; return; }
    const aim = ship.position.clone().addScaledVector(ship.forward, 140);
    const p = this.project(aim, camera, {});
    this.sight.style.display = p.behind ? 'none' : '';
    this.sight.style.transform = `translate(${p.x}px, ${p.y}px)`;
  }

  updateMarkers(game, markers) {
    const { ship, camera } = game;
    while (this.markerPool.length < markers.length) {
      const m = el('div', 'hud-marker', this.markerLayer);
      el('div', 'hud-marker-pip', m);
      el('div', 'hud-marker-label', m);
      this.markerPool.push(m);
    }
    this.markerPool.forEach((node, i) => {
      const mk = markers[i];
      if (!mk) { node.style.display = 'none'; return; }
      node.style.display = '';
      const p = this.project(mk.position, camera, {});
      const dist = ship.position.distanceTo(mk.position);
      node.lastChild.textContent = `${mk.label} ${dist > 999 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`}`;
      node.style.setProperty('--c', mk.colour);
      const margin = 40;
      let x = p.x, y = p.y;
      let off = p.behind || x < margin || y < margin || x > p.w - margin || y > p.h - margin;
      if (off) {
        // Pin to the screen edge, pointing the way to turn
        let dx = x - p.w / 2, dy = y - p.h / 2;
        if (p.behind) { dx = -dx; dy = -dy; }
        const s = Math.min((p.w / 2 - margin) / Math.abs(dx || 1), (p.h / 2 - margin) / Math.abs(dy || 1));
        x = p.w / 2 + dx * s; y = p.h / 2 + dy * s;
        node.style.setProperty('--angle', `${Math.atan2(dy, dx)}rad`);
      }
      node.classList.toggle('edge', off);
      node.style.transform = `translate(${x}px, ${y}px)`;
    });
  }

  drawMap(game, markers) {
    const ctx = this.mapCtx;
    const size = this.mapCanvas.width;
    const scale = size / (2 * MAP_RANGE);
    const toMap = (x, z) => [(MAP_RANGE - x) * scale, (MAP_RANGE - z) * scale];
    ctx.drawImage(this.mapImage, 0, 0, size, size);
    ctx.font = `${this.big ? 12 : 9}px system-ui, sans-serif`;
    for (const b of BASES) {
      const [x, y] = toMap(b.x, b.z);
      ctx.fillStyle = b.kind === 'home' ? '#50ff80' : b.kind === 'hostile' ? '#ff5050' : '#60c0ff';
      ctx.fillRect(x - 3, y - 3, 6, 6);
      if (this.big) { ctx.fillStyle = '#fff'; ctx.fillText(b.name, x + 6, y + 4); }
    }
    for (const mk of markers) {
      const [x, y] = toMap(mk.position.x, mk.position.z);
      ctx.strokeStyle = mk.colour;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.stroke();
    }
    for (const e of game.combat.enemies) {
      const [x, y] = toMap(e.position.x, e.position.z);
      ctx.fillStyle = '#ff4040';
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // The ship, pointing the way it faces
    const s = game.ship;
    const [x, y] = toMap(s.position.x, s.position.z);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-s.yaw);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  setFps(text) { this.fps.textContent = text; }
}
