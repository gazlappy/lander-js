import { FrameBuffer } from '../render/framebuffer.js';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../config.js';
import { SETTINGS } from '../settings.js';

// The menus are drawn into the game's framebuffer in the same 8x8 font as
// the game, over a darkened view of the landscape. They work with the
// keyboard (arrows, Enter, Esc) or the mouse (hover and click; right-click
// steps an option backwards).

const CREDITS = [
  ['Lander', 'title'],
  ['David Braben, 1987', ''],
  ['The first game for the Acorn', 'dim'],
  ['Archimedes and the ARM chip', 'dim'],
  ['', ''],
  ['Source archaeology', 'title'],
  ['Mark Moxon', ''],
  ['lander.bbcelite.com', 'dim'],
  ['', ''],
  ['JavaScript remake', 'title'],
  ['gazlappy', ''],
];

export class Menu {
  // `actions` supplies newGame, carryOn, canCarryOn, toggleFullscreen,
  // isFullscreen and onSettingChanged
  constructor(settings, actions) {
    this.settings = settings;
    this.actions = actions;
    this.screen = 'main';
    this.selected = 0;
    this.hitBoxes = [];
  }

  open(screen = 'main') {
    this.screen = screen;
    this.selected = 0;
    this.skipDisabled(1);
  }

  items() {
    const a = this.actions;
    if (this.screen === 'main') {
      return [
        { label: 'New game', run: () => a.newGame() },
        { label: 'Continue', run: () => a.carryOn(), enabled: a.canCarryOn() },
        { label: 'Options', run: () => this.open('options') },
        { label: 'Credits', run: () => this.open('credits') },
      ];
    }
    if (this.screen === 'options') {
      const items = Object.keys(SETTINGS).map((key) => ({
        label: SETTINGS[key].label,
        value: this.settings.describe(key),
        adjust: (dir) => a.onSettingChanged(key, this.settings.cycle(key, dir)),
      }));
      items.push({
        label: 'Fullscreen',
        value: a.isFullscreen() ? 'On' : 'Off',
        adjust: () => a.toggleFullscreen(),
      });
      items.push({ label: 'Back', run: () => this.open('main') });
      return items;
    }
    return [{ label: 'Back', run: () => this.open('main') }];
  }

  skipDisabled(dir) {
    const items = this.items();
    for (let n = 0; n < items.length && items[this.selected].enabled === false; n++) {
      this.selected = (this.selected + dir + items.length) % items.length;
    }
  }

  move(dir) {
    const count = this.items().length;
    this.selected = (this.selected + dir + count) % count;
    this.skipDisabled(dir);
  }

  activate(dir = 1) {
    const item = this.items()[this.selected];
    if (!item || item.enabled === false) return;
    if (item.adjust) item.adjust(dir);
    else item.run();
  }

  back() {
    if (this.screen !== 'main') this.open('main');
    else if (this.actions.canCarryOn()) this.actions.carryOn();
  }

  // Returns true if the key was used
  key(code) {
    switch (code) {
      case 'ArrowUp': case 'KeyW': this.move(-1); return true;
      case 'ArrowDown': case 'KeyS': this.move(1); return true;
      case 'ArrowLeft': case 'KeyA': this.adjustSelected(-1); return true;
      case 'ArrowRight': case 'KeyD': this.adjustSelected(1); return true;
      case 'Enter': case 'Space': this.activate(1); return true;
      case 'Escape': case 'Backspace': this.back(); return true;
      default: return false;
    }
  }

  adjustSelected(dir) {
    const item = this.items()[this.selected];
    if (item?.adjust) item.adjust(dir);
  }

  // Pointer position in 320x256 screen coordinates
  hover(x, y) {
    const hit = this.hitBoxes.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
    if (!hit || hit.index === this.selected) return false;
    if (this.items()[hit.index].enabled === false) return false;
    this.selected = hit.index;
    return true;
  }

  click(x, y, button) {
    const hit = this.hitBoxes.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
    if (!hit) return false;
    this.selected = hit.index;
    this.activate(button === 2 ? -1 : 1);
    return true;
  }

  // --- Drawing ---------------------------------------------------------------

  draw(frame, backdrop, colourOf) {
    frame.copyFrom(backdrop);
    frame.darken(0.3);
    const c = {
      title: colourOf(6, 15, 7),
      shadow: colourOf(0, 0, 0),
      text: colourOf(13, 13, 13),
      dim: colourOf(8, 8, 9),
      off: colourOf(5, 5, 5),
      selected: colourOf(15, 13, 3),
    };
    this.hitBoxes = [];
    if (this.screen === 'main') this.drawMain(frame, c);
    else if (this.screen === 'options') this.drawOptions(frame, c);
    else this.drawCredits(frame, c);
  }

  centred(frame, y, str, colour, size = 1, shadow = null) {
    const x = Math.round((SCREEN_WIDTH - FrameBuffer.textWidth(str, size)) / 2);
    if (shadow !== null) frame.textAt(x + size, y + size, str, shadow, null, size);
    frame.textAt(x, y, str, colour, null, size);
  }

  heading(frame, c, str, size) {
    this.centred(frame, 24, str, c.title, size, c.shadow);
  }

  footer(frame, c, str) {
    this.centred(frame, SCREEN_HEIGHT - 20, str, c.dim);
  }

  drawMain(frame, c) {
    this.heading(frame, c, 'LANDER', 5);
    this.centred(frame, 72, 'Acorn Archimedes 1987', c.dim);
    this.items().forEach((item, i) => {
      const y = 104 + i * 24;
      const chosen = i === this.selected;
      const colour = item.enabled === false ? c.off : chosen ? c.selected : c.text;
      const label = chosen ? `>${item.label}<` : item.label;
      this.centred(frame, y, label, colour, 2, c.shadow);
      this.hitBoxes.push({ index: i, x: 64, y: y - 4, w: SCREEN_WIDTH - 128, h: 24 });
    });
    this.footer(frame, c, 'Arrows + Enter, or the mouse');
  }

  drawOptions(frame, c) {
    this.heading(frame, c, 'OPTIONS', 3);
    this.items().forEach((item, i) => {
      const y = 80 + i * 18;
      const chosen = i === this.selected;
      const colour = chosen ? c.selected : c.text;
      if (item.value !== undefined) {
        frame.textAt(40, y, item.label, colour);
        const value = chosen ? `< ${item.value} >` : `  ${item.value}  `;
        frame.textAt(152, y, value, colour);
      } else {
        this.centred(frame, y + 8, chosen ? `>${item.label}<` : item.label, colour);
      }
      this.hitBoxes.push({ index: i, x: 32, y: y - 4, w: SCREEN_WIDTH - 64, h: 18 });
    });
    this.footer(frame, c, 'Left/Right or click to change');
  }

  drawCredits(frame, c) {
    this.heading(frame, c, 'CREDITS', 3);
    CREDITS.forEach(([line, style], i) => {
      this.centred(frame, 64 + i * 12, line, style === 'title' ? c.selected : style === 'dim' ? c.dim : c.text);
    });
    const y = 210;
    this.centred(frame, y, '>Back<', c.selected);
    this.hitBoxes.push({ index: 0, x: 120, y: y - 4, w: 80, h: 16 });
  }
}
