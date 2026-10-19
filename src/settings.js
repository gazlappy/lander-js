// Player preferences, saved in the browser between visits. Each setting
// cycles through a fixed list of choices in the Options menu.

const STORAGE_KEY = 'lander-js';

export const SETTINGS = {
  speed: {
    label: 'Game speed',
    choices: [[17, 'Original'], [20, 'Classic'], [25, 'Brisk'], [33, 'Fast']],
    initial: 20,
  },
  scale: {
    label: 'Resolution',
    choices: [[1, '320x256'], [2, '640x512'], [3, '960x768'], [4, '1280x1024']],
    initial: 2,
  },
  trueColour: {
    label: 'Colours',
    choices: [[false, 'Archimedes'], [true, 'True colour']],
    initial: false,
  },
  sensitivity: {
    label: 'Mouse speed',
    choices: [[0.5, 'Slow'], [0.75, 'Steady'], [1, 'Normal'], [1.5, 'Quick'], [2, 'Fast'], [3, 'Twitchy']],
    initial: 1,
  },
};

function read() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function write(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...read(), ...data })); } catch { /* storage unavailable */ }
}

export class Settings {
  constructor() {
    const stored = read();
    this.values = {};
    for (const [key, def] of Object.entries(SETTINGS)) {
      const known = def.choices.some(([v]) => v === stored[key]);
      this.values[key] = known ? stored[key] : def.initial;
    }
    this.highScore = stored.highScore;
    this.savedGame = stored.savedGame || null;
  }

  get(key) { return this.values[key]; }

  // Step a setting to the next (dir = 1) or previous (dir = -1) choice
  cycle(key, dir) {
    const { choices } = SETTINGS[key];
    const i = choices.findIndex(([v]) => v === this.values[key]);
    this.values[key] = choices[(i + dir + choices.length) % choices.length][0];
    write({ [key]: this.values[key] });
    return this.values[key];
  }

  describe(key) {
    const def = SETTINGS[key];
    return (def.choices.find(([v]) => v === this.values[key]) || def.choices[0])[1];
  }

  saveHighScore(score) {
    this.highScore = score;
    write({ highScore: score });
  }

  saveGame(data) {
    this.savedGame = data;
    write({ savedGame: data });
  }
}
