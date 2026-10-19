import { Game, GAME_OVER } from './game.js';
import { Input, screenPoint } from './ui/input.js';
import { Menu } from './ui/menu.js';
import { Settings } from './settings.js';
import { serialise, restore } from './core/save.js';
import { FrameBuffer } from './render/framebuffer.js';

const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
const fpsLabel = document.getElementById('fps');

const settings = new Settings();
const game = new Game({
  scale: settings.get('scale'),
  trueColour: settings.get('trueColour'),
  highScore: settings.highScore,
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

// 'menu' or 'play'
let mode = 'menu';
// True once a game has been started or continued in this visit
let sessionActive = false;
// What the menu draws behind itself: the last frame of the game
let backdrop = null;

function snapshotBackdrop() {
  backdrop = new FrameBuffer(game.frame.scale);
  backdrop.pixels.set(game.frame.pixels);
}

function saveProgress() {
  if (sessionActive) settings.saveGame(serialise(game));
}

function recordHighScore() {
  if (game.highScore !== settings.highScore) settings.saveHighScore(game.highScore);
}

// --- Playing -----------------------------------------------------------------

let accumulator = 0;
let lastTime = 0;
let ticks = 0, fpsTime = 0;

const input = new Input(canvas, game, {
  onPauseRequest: () => openMenu(),
  onKey: () => {
    if (game.state === GAME_OVER) {
      game.newGame();
      recordHighScore();
    }
  },
});
input.sensitivity = settings.get('sensitivity');

function startPlay() {
  mode = 'play';
  input.enabled = true;
  accumulator = 0;
  lastTime = performance.now();
  input.lock();
}

function frame(now) {
  requestAnimationFrame(frame);
  if (mode !== 'play') return;
  const tickLength = 1000 / settings.get('speed');
  accumulator += Math.min(now - lastTime, 250);
  lastTime = now;
  let changed = false;
  while (accumulator >= tickLength) {
    accumulator -= tickLength;
    const wasOver = game.state === GAME_OVER;
    if (game.step(input.buttons)) { changed = true; ticks++; }
    if (game.state === GAME_OVER && !wasOver) {
      if (game.score > game.highScore) game.highScore = game.score;
      recordHighScore();
      settings.saveGame(null);
    }
  }
  if (changed) present();
  if (now - fpsTime >= 1000) {
    fpsLabel.textContent = `${Math.round((ticks * 1000) / (now - fpsTime))} fps`;
    ticks = 0;
    fpsTime = now;
  }
}

// --- Menu --------------------------------------------------------------------

const menu = new Menu(settings, {
  newGame() {
    game.freshGame();
    recordHighScore();
    sessionActive = true;
    settings.saveGame(null);
    startPlay();
  },
  carryOn() {
    if (!sessionActive && settings.savedGame) {
      if (!restore(game, settings.savedGame)) { settings.saveGame(null); drawMenu(); return; }
      sessionActive = true;
    }
    startPlay();
  },
  canCarryOn() {
    return sessionActive ? game.state !== GAME_OVER : !!settings.savedGame;
  },
  isFullscreen: () => document.fullscreenElement === stage,
  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else stage.requestFullscreen?.().catch?.(() => {});
  },
  onSettingChanged(key, value) {
    if (key === 'scale' || key === 'trueColour') {
      game.setGraphics(settings.get('scale'), settings.get('trueColour'));
      resizeCanvas();
    }
    if (key === 'sensitivity') input.sensitivity = value;
  },
});

function drawMenu() {
  menu.draw(game.frame, backdrop, game.colourOf);
  present();
}

function openMenu() {
  if (mode === 'menu') return;
  mode = 'menu';
  input.enabled = false;
  input.release();
  fpsLabel.textContent = '';
  if (game.state !== GAME_OVER) saveProgress();
  snapshotBackdrop();
  menu.open('main');
  drawMenu();
}

document.addEventListener('keydown', (e) => {
  if (mode !== 'menu') return;
  if (menu.key(e.code)) {
    e.preventDefault();
    if (mode === 'menu') drawMenu();
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (mode !== 'menu') return;
  const [x, y] = screenPoint(canvas, e);
  if (menu.hover(x, y)) drawMenu();
});

canvas.addEventListener('mousedown', (e) => {
  if (mode !== 'menu') return;
  e.preventDefault();
  const [x, y] = screenPoint(canvas, e);
  if (menu.click(x, y, e.button) && mode === 'menu') drawMenu();
});

document.addEventListener('fullscreenchange', () => { if (mode === 'menu') drawMenu(); });

// Keep progress if the tab is closed or hidden mid-game
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'play') saveProgress();
});
window.addEventListener('pagehide', () => { if (mode === 'play') saveProgress(); });

// Start on the main menu, over the opening scene
game.step(0);
snapshotBackdrop();
menu.open('main');
drawMenu();
requestAnimationFrame(frame);

// Exposed for debugging from the console
window.lander = game;
