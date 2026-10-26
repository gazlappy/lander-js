import { createRetroApp } from './retro/app.js';

// Hosts the main page and both versions. The URL hash picks the view:
// none for the main page, #retro or #modern for a game (#vr is the modern
// version with Enter VR up front), so any of them can be bookmarked or
// linked. In a game, the header button or F2 flips to the
// other version. The modern version is only downloaded the first time it's
// shown, and each version pauses itself when hidden.

const VERSION_KEY = 'lander-version';
const home = document.getElementById('home');
const gameView = document.getElementById('game');
const stage = document.getElementById('stage');
const retroBox = document.getElementById('retro');
const modernBox = document.getElementById('modern');
const switchButton = document.getElementById('switch');
const backLink = document.getElementById('back');
const fpsLabel = document.getElementById('fps');
const help = { retro: document.getElementById('help-retro'), modern: document.getElementById('help-modern') };

let current = null;      // 'home', 'retro' or 'modern'
let vrFocus = false;     // came in through #vr
let modern = null;
let modernFailed = false;

const retro = createRetroApp({
  canvas: document.getElementById('retro-screen'),
  fullscreenTarget: stage,
  fpsLabel,
  onSwitch: () => go('modern'),
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
    modern = createModernApp({ container: modernBox, onSwitch: () => go('retro') });
    window.landerModern = modern.debug;
  } catch (e) {
    console.error(e);
    modernFailed = true;
  }
  modernBox.classList.remove('loading');
  return modern;
}

// Change view by changing the URL, so Back and bookmarks work
function go(view) {
  const hash = view === 'home' ? '' : `#${view}`;
  if (location.hash === hash || (!hash && !location.hash)) { show(view); return; }
  location.hash = hash;
}

function viewFromHash() {
  const h = location.hash.slice(1);
  vrFocus = h === 'vr';
  if (vrFocus) return 'modern';
  return h === 'retro' || h === 'modern' ? h : 'home';
}

async function show(view) {
  if (view === current) return;
  if (view === 'modern' && (!webglAvailable() || !(await loadModern()))) {
    alert('The modern version needs WebGL, which this browser does not offer. Opening the retro version instead.');
    history.replaceState(null, '', '#retro');
    view = 'retro';
  }
  if (current === 'retro') retro.deactivate();
  if (current === 'modern') modern?.deactivate();
  current = view;
  const inGame = view !== 'home';
  home.hidden = inGame;
  gameView.hidden = !inGame;
  document.body.classList.toggle('on-home', !inGame);
  switchButton.hidden = !inGame;
  backLink.hidden = !inGame;
  fpsLabel.textContent = '';
  document.title = inGame ? `Lander: ${view === 'retro' ? 'Retro' : 'Modern'}` : 'Lander';
  if (!inGame) { markLastPlayed(); return; }
  stage.dataset.version = view;
  retroBox.hidden = view !== 'retro';
  modernBox.hidden = view !== 'modern';
  help.retro.hidden = view !== 'retro';
  help.modern.hidden = view !== 'modern';
  switchButton.textContent = view === 'retro' ? 'Switch to modern (F2)' : 'Switch to retro (F2)';
  try { localStorage.setItem(VERSION_KEY, view); } catch { /* storage unavailable */ }
  if (view === 'retro') retro.activate();
  else modern.activate({ vrFocus });
}

// Flag the version played last on the main page
function markLastPlayed() {
  let last = null;
  try { last = localStorage.getItem(VERSION_KEY); } catch { /* storage unavailable */ }
  for (const card of home.querySelectorAll('.version-card')) {
    card.classList.toggle('last', card.dataset.version === last);
  }
}

switchButton.addEventListener('click', () => go(current === 'retro' ? 'modern' : 'retro'));
document.addEventListener('keydown', (e) => {
  if (e.code !== 'F2' || current === 'home') return;
  e.preventDefault();
  go(current === 'retro' ? 'modern' : 'retro');
});
window.addEventListener('hashchange', () => show(viewFromHash()));

show(viewFromHash());

window.lander = retro.game;
