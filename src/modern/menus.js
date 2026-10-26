import { CRAFTS } from './crafts.js';
import { MISSIONS } from './missions.js';
import { QUALITY } from './config.js';

// The modern version's menus, as HTML over the 3D scene. Buttons carry a
// data-action attribute; `actions` supplies what each one does.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Craft stats scaled to 0..1 for the hangar bars
function craftStats(c) {
  return [
    ['Thrust', c.power / 1.3],
    ['Agility', c.steer / 1.5],
    ['Fuel', c.fuel / 200],
    ['Hull', c.hull / 200],
    ['Firepower', (c.gun.damage / c.gun.interval) / 22],
    ['Cargo', c.cargo / 3],
  ];
}

export class Menus {
  constructor(root, actions) {
    this.root = root;
    this.actions = actions;
    this.screen = null;
    this.selectedMission = 0;
    root.classList.add('menus');
    root.addEventListener('click', (e) => {
      const button = e.target.closest('[data-action]');
      if (!button || button.disabled) return;
      this.actions.sound?.();
      this.handle(button.dataset.action, button.dataset.arg);
    });
    root.addEventListener('change', (e) => {
      const input = e.target.closest('[data-setting]');
      if (input) this.actions.setting(input.dataset.setting, input.type === 'checkbox' ? input.checked : input.value);
    });
    root.addEventListener('input', (e) => {
      const input = e.target.closest('input[type=range][data-setting]');
      if (input) this.actions.setting(input.dataset.setting, input.value);
    });
  }

  get visible() { return this.screen !== null; }

  hide() {
    this.screen = null;
    this.root.innerHTML = '';
    this.root.style.display = 'none';
  }

  show(screen, data = {}) {
    this.screen = screen;
    this.data = data;
    if (screen === 'pause' && data.free !== undefined) this.pauseData = data;
    this.actions.onShow?.(screen);
    this.root.style.display = '';
    this.root.innerHTML = `<div class="menu-panel menu-${screen}">${this[screen]()}</div>`;
    this.root.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
  }

  refresh() { if (this.screen) this.show(this.screen, this.data); }

  handle(action, arg) {
    const a = this.actions;
    switch (action) {
      case 'screen': this.show(arg, { from: this.screen }); break;
      case 'mission': this.selectedMission = Number(arg); this.show('missions'); break;
      case 'launch': a.launch(MISSIONS[this.selectedMission]); break;
      case 'free': a.launchFree(); break;
      case 'buy': a.buyCraft(arg); this.refresh(); break;
      case 'fly': a.selectCraft(arg); this.refresh(); break;
      case 'resume': a.resume(); break;
      case 'restart': a.restart(); break;
      case 'abandon': a.abandon(); break;
      case 'retro': a.switchVersion(); break;
      case 'vr': a.enterVr(); break;
      case 'back': this.show(this.data.from || 'title'); break;
      default: break;
    }
  }

  // Back out of the current screen (Esc)
  back() {
    if (this.screen === 'pause') this.actions.resume();
    else if (this.screen === 'options' && this.data.from === 'pause') this.show('pause');
    else if (this.screen !== 'title' && this.screen !== 'results') this.show('title');
  }

  // --- Screens ---------------------------------------------------------------------

  title() {
    const p = this.actions.progress();
    return `
      <h1 class="logo">LANDER</h1>
      <div class="tagline">Open world</div>
      <div class="menu-buttons">
        ${this.actions.vrSupported() ? `<button class="${this.data.vrFocus ? 'primary' : ''}" data-action="vr">Enter VR</button>` : ''}
        ${this.data.vrFocus && !this.actions.vrSupported() ? '<p class="warn">No VR headset found. Open this page in the Meta Quest browser to play in VR.</p>' : ''}
        <button data-action="screen" data-arg="missions">Missions</button>
        <button data-action="free">Free flight</button>
        <button data-action="screen" data-arg="hangar">Hangar</button>
        <button data-action="screen" data-arg="options">Options</button>
        <button data-action="screen" data-arg="credits">Credits</button>
        <button class="secondary" data-action="retro">Play the 1987 retro version</button>
      </div>
      <div class="menu-footer">${p.credits.toLocaleString()} credits &middot; ${Object.keys(p.completed).length} of ${MISSIONS.length} missions complete</div>`;
  }

  missions() {
    const p = this.actions.progress();
    const unlocked = (i) => i === 0 || p.completed[MISSIONS[i - 1].id] !== undefined;
    const sel = MISSIONS[this.selectedMission];
    const craft = this.actions.craft();
    const blocked = sel.needsCargo && craft.cargo === 0;
    const best = p.completed[sel.id];
    return `
      <h2>Missions</h2>
      <div class="mission-layout">
        <div class="mission-list">
          ${MISSIONS.map((m, i) => `
            <button class="mission-item ${i === this.selectedMission ? 'selected' : ''}" data-action="mission" data-arg="${i}" ${unlocked(i) ? '' : 'disabled'}>
              <span>${unlocked(i) ? '' : '&#128274; '}${esc(m.name)}</span>
              <span class="mission-reward">${p.completed[m.id] !== undefined ? '&#10003;' : `${m.reward} cr`}</span>
            </button>`).join('')}
        </div>
        <div class="mission-brief">
          <h3>${esc(sel.name)}</h3>
          <p>${esc(sel.brief)}</p>
          <dl>
            <dt>Reward</dt><dd>${sel.reward} credits${best !== undefined ? ' (replays pay half)' : ''}</dd>
            ${sel.timeLimit ? `<dt>Time limit</dt><dd>${Math.floor(sel.timeLimit / 60)}:${String(sel.timeLimit % 60).padStart(2, '0')}</dd>` : ''}
            ${best !== undefined ? `<dt>Best time</dt><dd>${best.toFixed(1)} s</dd>` : ''}
            <dt>Craft</dt><dd>${esc(craft.name)} <button class="link" data-action="screen" data-arg="hangar">change</button></dd>
          </dl>
          ${blocked ? '<p class="warn">This mission needs a craft that can carry cargo.</p>' : ''}
          <button class="primary" data-action="launch" ${blocked || !unlocked(this.selectedMission) ? 'disabled' : ''}>Launch</button>
        </div>
      </div>
      <button class="back" data-action="screen" data-arg="title">Back</button>`;
  }

  hangar() {
    const p = this.actions.progress();
    const current = this.actions.craft().id;
    return `
      <h2>Hangar</h2>
      <div class="menu-footer">${p.credits.toLocaleString()} credits</div>
      <div class="craft-grid">
        ${CRAFTS.map((c) => {
          const owned = p.owned.includes(c.id);
          return `
          <div class="craft-card ${c.id === current ? 'selected' : ''}">
            <h3>${esc(c.name)}</h3>
            <p>${esc(c.blurb)}</p>
            ${craftStats(c).map(([label, v]) => `<div class="stat"><span>${label}</span><div class="stat-track"><div style="width:${Math.min(v, 1) * 100}%"></div></div></div>`).join('')}
            ${c.id === current ? '<button disabled>Flying</button>'
              : owned ? `<button data-action="fly" data-arg="${c.id}">Fly this</button>`
                : `<button data-action="buy" data-arg="${c.id}" ${p.credits < c.price ? 'disabled' : ''}>Buy for ${c.price.toLocaleString()} cr</button>`}
          </div>`;
        }).join('')}
      </div>
      <button class="back" data-action="screen" data-arg="title">Back</button>`;
  }

  options() {
    const s = this.actions.settings();
    const from = this.data.from === 'pause' ? 'pause' : 'title';
    return `
      <h2>Options</h2>
      <div class="options-grid">
        <label>Graphics
          <select data-setting="quality">
            ${Object.entries(QUALITY).filter(([k]) => k !== 'vr').map(([k, q]) => `<option value="${k}" ${s.quality === k ? 'selected' : ''}>${q.label}</option>`).join('')}
          </select>
        </label>
        <label>Camera
          <select data-setting="camera">
            <option value="classic" ${s.camera === 'classic' ? 'selected' : ''}>Classic (fixed heading)</option>
            <option value="chase" ${s.camera === 'chase' ? 'selected' : ''}>Chase (turns with you)</option>
          </select>
        </label>
        <label>Mouse speed
          <input type="range" min="0.3" max="2.5" step="0.1" value="${s.sensitivity}" data-setting="sensitivity">
        </label>
        <label>Volume
          <input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-setting="volume">
        </label>
        <label class="check"><input type="checkbox" data-setting="swapButtons" ${s.swapButtons ? 'checked' : ''}> Fire with the left button, thrust with the right</label>
        <label class="check"><input type="checkbox" data-setting="showFps" ${s.showFps ? 'checked' : ''}> Show frame rate</label>
      </div>
      <button class="back" data-action="screen" data-arg="${from}">Back</button>`;
  }

  credits() {
    return `
      <h2>Credits</h2>
      <div class="credits">
        <p><strong>Lander</strong> by David Braben, 1987: the first game for the Acorn Archimedes.</p>
        <p>Original source decoded and documented by <strong>Mark Moxon</strong> at lander.bbcelite.com.</p>
        <p>Browser versions by <strong>gazlappy</strong>. 3D rendering by three.js.</p>
        <p>The island's rolling hills still come from the six sine waves of the 1987 landscape.</p>
      </div>
      <button class="back" data-action="screen" data-arg="title">Back</button>`;
  }

  pause() {
    const free = this.pauseData?.free;
    return `
      <h2>Paused</h2>
      <div class="menu-buttons">
        <button data-action="resume">Resume</button>
        ${free ? '' : '<button data-action="restart">Restart mission</button>'}
        <button data-action="screen" data-arg="options">Options</button>
        ${this.actions.vrSupported() ? '<button data-action="vr">Enter VR</button>' : ''}
        <button data-action="abandon">${free ? 'Return to menu' : 'Abandon mission'}</button>
      </div>`;
  }

  results() {
    const d = this.data;
    return `
      <h2 class="${d.success ? 'good' : 'bad'}">${d.success ? 'Mission complete' : 'Mission failed'}</h2>
      <p class="result-name">${esc(d.name)}</p>
      ${d.reason ? `<p>${esc(d.reason)}</p>` : ''}
      <dl class="result-stats">
        <dt>Time</dt><dd>${d.time.toFixed(1)} s</dd>
        <dt>Reward</dt><dd>${d.reward.toLocaleString()} cr</dd>
        <dt>Destruction bonus</dt><dd>${d.bonus.toLocaleString()} cr</dd>
      </dl>
      <div class="menu-buttons">
        <button data-action="restart">${d.success ? 'Play again' : 'Try again'}</button>
        <button data-action="screen" data-arg="missions">Missions</button>
      </div>`;
  }
}
