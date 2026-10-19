import { createRetroApp } from './retro/app.js';

// Hosts both versions on one page and flips between them with the header
// button or F2. The modern version is only downloaded the first time it's
// shown. Each version pauses itself when hidden.

const VERSION_KEY = 'lander-version';
const stage = document.getElementById('stage');
const retroBox = document.getElementById('retro');
const modernBox = document.getElementById('modern');
const button = document.getElementById('switch');
const fpsLabel = document.getElementById('fps');
const help = { retro: document.getElementById('help-retro'), modern: document.getElementById('help-modern') };

let current = null;
let modern = null;
let modernFailed = false;

const retro = createRetroApp({
  canvas: document.getElementById('retro-screen'),
  fullscreenTarget: stage,
  fpsLabel,
  onSwitch: () => show('modern'),
});

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

async function loadModern() {
  if (modern || modernFailed) return modern;
  modernBox.classList.add('loading');
  try {
    const { createModernApp } = await import('./modern/app.js');
    modern = createModernApp({ container: modernBox, onSwitch: () => show('retro') });
    window.landerModern = modern.debug;
  } catch (e) {
    console.error(e);
    modernFailed = true;
  }
  modernBox.classList.remove('loading');
  return modern;
}

async function show(version) {
  if (version === current) return;
  if (version === 'modern' && (!webglAvailable() || !(await loadModern()))) {
    button.textContent = 'Modern version unavailable';
    button.disabled = true;
    version = 'retro';
  }
  if (current === 'retro') retro.deactivate();
  if (current === 'modern') modern?.deactivate();
  current = version;
  stage.dataset.version = version;
  retroBox.hidden = version !== 'retro';
  modernBox.hidden = version !== 'modern';
  help.retro.hidden = version !== 'retro';
  help.modern.hidden = version !== 'modern';
  fpsLabel.textContent = '';
  if (!button.disabled) button.textContent = version === 'retro' ? 'Switch to modern (F2)' : 'Switch to retro (F2)';
  try { localStorage.setItem(VERSION_KEY, version); } catch { /* storage unavailable */ }
  if (version === 'retro') retro.activate();
  else modern.activate();
}

button.addEventListener('click', () => show(current === 'retro' ? 'modern' : 'retro'));
document.addEventListener('keydown', (e) => {
  if (e.code !== 'F2') return;
  e.preventDefault();
  show(current === 'retro' ? 'modern' : 'retro');
});

let start = 'modern';
try { start = localStorage.getItem(VERSION_KEY) || 'modern'; } catch { /* storage unavailable */ }
show(start);

window.lander = retro.game;
