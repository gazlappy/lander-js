import * as THREE from 'three';
import { QUALITY, STORAGE_KEY } from './config.js';
import { World } from './world.js';
import { Environment } from './environment.js';
import { Particles } from './particles.js';
import { Combat } from './combat.js';
import { Ship } from './ship.js';
import { ChaseCamera } from './camera.js';
import { ModernInput } from './input.js';
import { Hud } from './hud.js';
import { Menus } from './menus.js';
import { Audio } from './audio.js';
import { CRAFT_BY_ID } from './crafts.js';
import { HOME } from './bases.js';
import { heightAt } from './terrain.js';
import { createMission, FREE_FLIGHT } from './missions.js';

// The modern version: an open-world Lander in WebGL. This module wires the
// pieces together and runs the title screen, missions and free flight.

const DEFAULT_PROGRESS = {
  credits: 0,
  owned: ['classic'],
  craft: 'classic',
  completed: {},              // mission id -> best time
  settings: { quality: 'high', camera: 'classic', sensitivity: 1, volume: 0.7, swapButtons: false, showFps: false },
};

function loadProgress() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...DEFAULT_PROGRESS, ...stored, settings: { ...DEFAULT_PROGRESS.settings, ...stored.settings } };
  } catch { return structuredClone(DEFAULT_PROGRESS); }
}

export function createModernApp({ container, onSwitch }) {
  const canvas = container.querySelector('canvas');
  const progress = loadProgress();
  const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch { /* storage unavailable */ } };
  let quality = QUALITY[progress.settings.quality] || QUALITY.high;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.5, 4000);
  const environment = new Environment(renderer, scene, camera, quality);
  const world = new World(scene, quality);
  const particles = new Particles(scene);
  const combat = new Combat(scene, world, particles);
  const ship = new Ship(scene, CRAFT_BY_ID[progress.craft] || CRAFT_BY_ID.classic);
  const chase = new ChaseCamera(camera);
  chase.mode = progress.settings.camera;
  const input = new ModernInput(canvas);
  const hud = new Hud(container.querySelector('.modern-hud'));
  const audio = new Audio();
  audio.setVolume(progress.settings.volume);
  input.sensitivity = progress.settings.sensitivity;
  input.swapButtons = progress.settings.swapButtons;

  // Shared state that missions and the HUD read
  const game = {
    scene, world, combat, particles, ship, audio, hud, input, progress, camera, chase,
    mission: null,
    shipsLeft: Infinity,
    onObjectRammed(o) { combat.damageObject(o, 99, false); },
  };

  let state = 'title';
  let active = false;
  let missionDef = null;
  let bonus = 0;
  let respawnTimer = 0;
  let titleAngle = 0;
  const guns = [];
  let fpsFrames = 0, fpsTime = 0;

  // --- Combat callbacks ----------------------------------------------------------

  combat.callbacks.onObjectDestroyed = (o, byPlayer) => {
    audio.explosion(o.radius / 3);
    if (byPlayer && o.points) bonus += Math.round(o.points / 2);
  };
  combat.callbacks.onEnemyDestroyed = (e) => {
    audio.explosion(1.5);
    bonus += Math.round(e.points / 2);
  };
  combat.callbacks.onEnemyFire = (from) => {
    if (from.distanceTo(ship.position) < 500) audio.enemyGun();
  };
  combat.callbacks.onPlayerHit = (amount) => {
    if (ship.destroyed || state !== 'playing') return;
    const events = [];
    ship.damage(amount, events);
    audio.hit();
    chase.shake = Math.max(chase.shake, 0.8);
    handleShipEvents(events);
  };

  // --- Sizing --------------------------------------------------------------------

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatio));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    environment.resize(w, h);
    particles.setViewport(h * renderer.getPixelRatio(), camera.fov);
  }
  new ResizeObserver(resize).observe(container);

  // --- Flow ----------------------------------------------------------------------

  function placeShipAtHome() {
    const pad = HOME.pads[0];
    ship.reset(new THREE.Vector3(pad.x, 0, pad.z), 0);
    ship.model.group.visible = true;
    input.centre();
    chase.snapTo(ship);
  }

  function preload(x, z) {
    for (let i = 0; i < 40 && !world.isReady(x, z); i++) world.update(x, z, 50);
    world.update(x, z, 120);
  }

  function launch(def) {
    audio.start();
    missionDef = def;
    game.mission?.dispose();
    combat.clear();
    particles.clear();
    placeShipAtHome();
    bonus = 0;
    game.shipsLeft = def === FREE_FLIGHT ? Infinity : 3;
    game.mission = createMission(def, game);
    hud.banner('');
    state = 'playing';
    menus.hide();
    hud.show(true);
    input.enabled = true;
    input.hoverLatch = false;
    input.lock();
  }

  function finish(success, reason) {
    if (state !== 'playing' && state !== 'dead') return;
    const def = missionDef;
    const m = game.mission;
    const first = progress.completed[def.id] === undefined;
    const reward = success ? (first ? def.reward : Math.round(def.reward / 2)) : 0;
    progress.credits += reward + bonus;
    if (success) progress.completed[def.id] = Math.min(progress.completed[def.id] ?? Infinity, m.time);
    save();
    success ? audio.success() : audio.failure();
    state = 'results';
    input.enabled = false;
    input.release();
    hud.banner('');
    hud.show(false);
    menus.show('results', { success, name: def.name, reason: reason || m.reason, time: m.time, reward, bonus });
  }

  // Back to the title screen's orbiting view of Braben Field
  function toTitle(showMenu = true) {
    game.mission?.dispose();
    game.mission = null;
    combat.clear();
    // Cash in anything earned in free flight
    if (missionDef === FREE_FLIGHT && bonus) { progress.credits += bonus; bonus = 0; save(); }
    missionDef = null;
    placeShipAtHome();
    state = 'title';
    input.enabled = false;
    input.release();
    hud.show(false);
    hud.banner('');
    if (showMenu) menus.show('title');
  }

  function pause() {
    if (state !== 'playing' && state !== 'dead') return;
    state = state === 'dead' ? 'deadPaused' : 'paused';
    input.enabled = false;
    input.release();
    menus.show('pause', { free: missionDef === FREE_FLIGHT });
  }

  function resume() {
    if (state !== 'paused' && state !== 'deadPaused') return;
    state = state === 'deadPaused' ? 'dead' : 'playing';
    menus.hide();
    input.enabled = true;
    input.lock();
  }

  function shipLost() {
    game.mission?.onEvent('shipLost');
    game.shipsLeft--;
    if (game.mission?.failNow) { finish(false); return; }
    if (game.shipsLeft <= 0) { finish(false, 'You ran out of ships.'); return; }
    state = 'dead';
    respawnTimer = 3;
    hud.banner('SHIP LOST');
  }

  function handleShipEvents(events) {
    for (const e of events) {
      if (e === 'landed') audio.land();
      else if (e === 'scrape') { audio.scrape(); chase.shake = Math.max(chase.shake, 1); }
      else if (e === 'destroyed') {
        particles.explosion(ship.position.x, ship.position.y, ship.position.z, 3);
        world.addWreck(ship.position.x, heightAt(ship.position.x, ship.position.z), ship.position.z, 1.6);
        audio.explosion(3);
        chase.shake = 2.5;
        shipLost();
      } else if (e === 'splashed') {
        particles.splash(ship.position.x, ship.position.z, 3);
        audio.explosion(1);
        shipLost();
      }
    }
  }

  // --- Per-frame update ------------------------------------------------------------

  function updatePlaying(dt) {
    const controls = input.read(dt);
    controls.heading = chase.heading;
    const events = ship.update(dt, controls, game);
    handleShipEvents(events);
    if (ship.destroyed) return;

    ship.gunCooldown -= dt;
    if (controls.fire && ship.gunCooldown <= 0) {
      combat.firePlayer(ship, ship.gunPositions(guns));
      ship.gunCooldown = ship.craft.gun.interval;
      audio.gun();
    }
    emitExhaust(dt);
    const result = game.mission.update(dt);
    if (result === 'success') finish(true);
    else if (result === 'failed') finish(false);
  }

  const nozzle = new THREE.Vector3(), down = new THREE.Vector3();
  function emitExhaust(dt) {
    if (ship.throttle < 0.02) return;
    down.copy(ship.up).negate();
    const rate = Math.ceil(ship.throttle * 3);
    for (const n of ship.model.nozzles) {
      nozzle.copy(n).applyQuaternion(ship.quaternion).add(ship.position);
      for (let i = 0; i < rate; i++) particles.exhaust(nozzle, down, ship.velocity, ship.throttle);
    }
    const alt = ship.altitude;
    if (alt < 14 && Math.random() < ship.throttle * (1 - alt / 14) * 1.5) {
      const ground = Math.max(heightAt(ship.position.x, ship.position.z), 0);
      if (ground > 0) particles.dust(ship.position.x, ground, ship.position.z, ship.throttle);
      else particles.splash(ship.position.x, ship.position.z, 0.2);
    }
  }

  // Burnt-out wrecks near the player keep smoking
  function smoulder(dt) {
    for (const w of world.wrecks.list) {
      w.smokeTimer -= dt;
      if (w.smokeTimer > 0) continue;
      w.smokeTimer = 0.35 + Math.random() * 0.3;
      if (Math.abs(w.x - ship.position.x) < 350 && Math.abs(w.z - ship.position.z) < 350) particles.smokePuff(w.x, w.y + 1.5, w.z, 3, 0.2);
    }
  }

  function updateTitle(dt) {
    titleAngle += dt * 0.06;
    const r = 70;
    camera.position.set(HOME.x + Math.sin(titleAngle) * r, HOME.y + 26, HOME.z - 10 + Math.cos(titleAngle) * r);
    camera.lookAt(HOME.pads[0].x, HOME.y + 4, HOME.pads[0].z);
  }

  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!active) { last = now; return; }
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!dt) return;

    if (state === 'playing') {
      // Small fixed steps keep the flight model stable at low frame rates
      const steps = Math.ceil(dt / (1 / 60));
      for (let i = 0; i < steps && state === 'playing'; i++) updatePlaying(dt / steps);
    }
    if (state === 'dead') {
      respawnTimer -= dt;
      if (respawnTimer <= 0) {
        placeShipAtHome();
        hud.banner('');
        state = 'playing';
      }
    }
    const running = state === 'playing' || state === 'dead' || state === 'title' || state === 'results';
    if (running) {
      if (state === 'playing' || state === 'dead') combat.update(dt, ship);
      particles.update(dt);
      smoulder(dt);
      ship.sync();
    }
    if (state === 'title') updateTitle(dt);
    else if (state !== 'paused' && state !== 'deadPaused') chase.update(dt, ship);
    const focus = state === 'title' ? new THREE.Vector3(HOME.x, HOME.y, HOME.z) : ship.position;
    world.update(focus.x, focus.z);
    environment.update(dt, focus);
    audio.engine(ship.throttle, ship.velocity.length(), state === 'playing');
    if (state === 'playing' || state === 'dead') hud.update(dt, game);
    environment.render();

    fpsFrames++;
    if (now - fpsTime > 500) {
      hud.setFps(progress.settings.showFps ? `${Math.round((fpsFrames * 1000) / (now - fpsTime))} fps` : '');
      fpsFrames = 0;
      fpsTime = now;
    }
  }

  // --- Menus -----------------------------------------------------------------------

  const menus = new Menus(container.querySelector('.modern-menus'), {
    progress: () => progress,
    craft: () => ship.craft,
    settings: () => progress.settings,
    sound: () => { audio.start(); audio.select(); },
    // Leaving the results screen for the title puts the world back
    onShow(screen) { if (screen === 'title' && state === 'results') toTitle(false); },
    launch,
    launchFree: () => launch(FREE_FLIGHT),
    resume,
    restart: () => launch(missionDef),
    abandon: () => toTitle(),
    switchVersion: () => onSwitch(),
    buyCraft(id) {
      const c = CRAFT_BY_ID[id];
      if (progress.credits < c.price || progress.owned.includes(id)) return;
      progress.credits -= c.price;
      progress.owned.push(id);
      this.selectCraft(id);
    },
    selectCraft(id) {
      progress.craft = id;
      save();
      ship.setCraft(CRAFT_BY_ID[id]);
      placeShipAtHome();
    },
    setting(key, value) {
      const s = progress.settings;
      if (key === 'quality') {
        s.quality = value;
        quality = QUALITY[value];
        environment.setQuality(quality);
        world.setQuality(quality);
        resize();
        preload(ship.position.x, ship.position.z);
      } else if (key === 'camera') { s.camera = value; chase.mode = value; }
      else if (key === 'sensitivity') { s.sensitivity = Number(value); input.sensitivity = s.sensitivity; }
      else if (key === 'volume') { s.volume = Number(value); audio.setVolume(s.volume); }
      else if (key === 'swapButtons') { s.swapButtons = value; input.swapButtons = value; }
      else if (key === 'showFps') s.showFps = value;
      save();
    },
  });

  input.on('pause', pause);
  input.on('camera', () => {
    chase.mode = chase.mode === 'classic' ? 'chase' : 'classic';
    progress.settings.camera = chase.mode;
    save();
    hud.flash(chase.mode === 'classic' ? 'Classic camera' : 'Chase camera', 1.2);
  });
  input.on('map', () => hud.toggleMap());
  input.on('hoverLatch', (on) => hud.flash(on ? 'Hover hold on' : 'Hover hold off', 1.2));

  // Esc in a menu goes back (pause resumes)
  document.addEventListener('keydown', (e) => {
    if (!active || input.enabled || !menus.visible) return;
    if (e.code === 'Escape') { e.preventDefault(); menus.back(); }
  });

  // --- Start-up ----------------------------------------------------------------------

  resize();
  placeShipAtHome();
  preload(HOME.x, HOME.z);
  hud.show(false);
  requestAnimationFrame(frame);

  return {
    activate() {
      active = true;
      resize();
      if (state === 'title') menus.show('title');
    },
    deactivate() {
      if (state === 'playing' || state === 'dead') pause();
      audio.engine(0, 0, false);
      active = false;
    },
    debug: { game, scene, camera, world, ship, combat, environment, renderer, launch, get state() { return state; } },
  };
}
