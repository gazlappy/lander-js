import { Game, GAME_OVER } from './game.js';
import { Input } from './ui/input.js';

const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayText = document.getElementById('overlay-text');
const settings = {
  speed: document.getElementById('speed'),
  scale: document.getElementById('scale'),
  colour: document.getElementById('colour'),
  sensitivity: document.getElementById('sensitivity'),
};
const fsButton = document.getElementById('fullscreen');
const fpsLabel = document.getElementById('fps');

const STORAGE_KEY = 'lander-js';

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function save(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...load(), ...data })); } catch { /* storage unavailable */ }
}

const prefs = load();
for (const [key, el] of Object.entries(settings)) {
  if (prefs[key] !== undefined) el.value = String(prefs[key]);
}

const game = new Game({
  scale: Number(settings.scale.value),
  trueColour: settings.colour.value === 'true',
  highScore: prefs.highScore,
});

let image = null;
function resizeCanvas() {
  canvas.width = game.frame.width;
  canvas.height = game.frame.height;
  image = ctx.createImageData(canvas.width, canvas.height);
}
resizeCanvas();

function present() {
  new Uint32Array(image.data.buffer).set(game.frame.pixels);
  ctx.putImageData(image, 0, 0);
}

let running = false;
let started = false;
let accumulator = 0;
let lastTime = 0;
let ticks = 0, fpsTime = 0;

const input = new Input(canvas, game, {
  onPauseRequest: () => pause(),
  onKey: () => {
    if (game.state === GAME_OVER) {
      game.newGame();
      save({ highScore: game.highScore });
    }
  },
});
input.sensitivity = Number(settings.sensitivity.value);

function showOverlay(title, html) {
  overlayTitle.textContent = title;
  overlayText.innerHTML = html;
  overlay.hidden = false;
}

function start() {
  overlay.hidden = true;
  running = true;
  started = true;
  input.enabled = true;
  lastTime = performance.now();
  accumulator = 0;
  input.lock();
}

function pause() {
  if (!running) return;
  running = false;
  input.enabled = false;
  input.release();
  showOverlay('Paused', 'Click to carry on');
}

function frame(now) {
  requestAnimationFrame(frame);
  if (!running) return;
  const tickLength = 1000 / Number(settings.speed.value);
  accumulator += Math.min(now - lastTime, 250);
  lastTime = now;
  let changed = false;
  while (accumulator >= tickLength) {
    accumulator -= tickLength;
    const before = game.highScore;
    if (game.step(input.buttons)) { changed = true; ticks++; }
    if (game.highScore !== before) save({ highScore: game.highScore });
  }
  if (changed) present();
  if (now - fpsTime >= 1000) {
    fpsLabel.textContent = `${Math.round((ticks * 1000) / (now - fpsTime))} fps`;
    ticks = 0;
    fpsTime = now;
  }
}

overlay.addEventListener('click', start);

for (const [key, el] of Object.entries(settings)) {
  el.addEventListener('change', () => {
    save({ [key]: el.value });
    if (key === 'scale' || key === 'colour') {
      game.setGraphics(Number(settings.scale.value), settings.colour.value === 'true');
      resizeCanvas();
      if (started) { game.step(0); present(); }
    }
    if (key === 'sensitivity') input.sensitivity = Number(el.value);
    el.blur();
  });
}

fsButton.addEventListener('click', () => {
  const stage = document.getElementById('stage');
  if (document.fullscreenElement) document.exitFullscreen();
  else stage.requestFullscreen?.();
});

// Draw the opening scene behind the title overlay
game.step(0);
present();
showOverlay('Lander', 'Click to play');
requestAnimationFrame(frame);

// Exposed for debugging from the console
window.lander = game;
