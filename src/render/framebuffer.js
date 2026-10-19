import { FONT } from './font.js';
import {
  SCREEN_WIDTH, SCREEN_HEIGHT, VIEW_TOP, VIEW_HEIGHT,
} from '../config.js';

// A software framebuffer of RGBA pixels. Everything is drawn in original
// 320x256 screen coordinates and multiplied by `scale`, so higher scales
// give sharper polygons without changing the layout.
export class FrameBuffer {
  constructor(scale = 1) {
    this.scale = scale;
    this.width = SCREEN_WIDTH * scale;
    this.height = SCREEN_HEIGHT * scale;
    this.pixels = new Uint32Array(this.width * this.height);
    this.viewTop = VIEW_TOP * scale;
    this.viewHeight = VIEW_HEIGHT * scale;
  }

  clear(colour) {
    this.pixels.fill(colour);
  }

  // Clear the 3D view below the text rows
  clearView(colour) {
    this.pixels.fill(colour, this.viewTop * this.width);
  }

  span(y, x0, x1, colour) {
    if (x0 < 0) x0 = 0;
    if (x1 >= this.width) x1 = this.width - 1;
    if (x0 > x1) return;
    const row = y * this.width;
    this.pixels.fill(colour, row + x0, row + x1 + 1);
  }

  // Filled triangle in view coordinates (pixels, origin at the top-left of
  // the 3D view), clipped to the view. This follows the original's fill
  // rule so edges land on the same pixels: the edges are sampled at row Y
  // and the span is drawn on row Y + 1, from round(left) up to but not
  // including round(right).
  triangle(x1, y1, x2, y2, x3, y3, colour) {
    const s = this.scale;
    x1 *= s; y1 *= s; x2 *= s; y2 *= s; x3 *= s; y3 *= s;
    // Sort so y1 <= y2 <= y3 (top to bottom)
    let t;
    if (y2 < y1) { t = x1; x1 = x2; x2 = t; t = y1; y1 = y2; y2 = t; }
    if (y3 < y1) { t = x1; x1 = x3; x3 = t; t = y1; y1 = y3; y3 = t; }
    if (y3 < y2) { t = x2; x2 = x3; x3 = t; t = y2; y2 = y3; y3 = t; }
    const yStart = Math.max(Math.ceil(y1), -1);
    const yEnd = Math.min(Math.ceil(y3) - 1, this.viewHeight - 2);
    if (yStart > yEnd) return;
    const top = this.viewTop + 1;
    const longSlope = (x3 - x1) / (y3 - y1);
    for (let y = yStart; y <= yEnd; y++) {
      const xa = x1 + longSlope * (y - y1);
      const xb = y < y2
        ? x1 + ((x2 - x1) * (y - y1)) / (y2 - y1)
        : y3 === y2 ? x2 : x2 + ((x3 - x2) * (y - y2)) / (y3 - y2);
      const l = xa < xb ? xa : xb, r = xa < xb ? xb : xa;
      this.span(top + y, Math.floor(l + 0.5), Math.floor(r + 0.5) - 1, colour);
    }
  }

  // Axis-aligned block in view coordinates, used for particles
  block(x, y, w, h, colour) {
    const s = this.scale;
    const x0 = x * s, y0 = y * s;
    const y1 = Math.min(y0 + h * s, this.viewHeight);
    for (let py = Math.max(y0, 0); py < y1; py++) {
      this.span(this.viewTop + py, x0, x0 + w * s - 1, colour);
    }
  }

  // Horizontal bar in screen coordinates
  bar(x, y, length, thickness, colour) {
    const s = this.scale;
    for (let py = y * s; py < (y + thickness) * s; py++) {
      this.span(py, x * s, (x + length) * s - 1, colour);
    }
  }

  // 8x8 text on the 40x32 character grid
  text(col, row, str, fg, bg) {
    this.textAt(col * 8, row * 8, str.slice(0, Math.max(40 - col, 0)), fg, bg);
  }

  // Text at a screen pixel position, with each glyph pixel `size` pixels
  // square. A null background leaves the pixels behind the text alone.
  textAt(x, y, str, fg, bg = null, size = 1) {
    const s = this.scale;
    const dot = size * s;
    for (let i = 0; i < str.length; i++) {
      const glyph = FONT[str.charCodeAt(i) - 32] || FONT[0];
      for (let gy = 0; gy < 8; gy++) {
        const bits = glyph[gy];
        for (let gx = 0; gx < 8; gx++) {
          const colour = bits & (0x80 >> gx) ? fg : bg;
          if (colour === null) continue;
          const px = (x + (i * 8 + gx) * size) * s, py = (y + gy * size) * s;
          if (px < 0 || py < 0 || px + dot > this.width || py + dot > this.height) continue;
          for (let yy = 0; yy < dot; yy++) {
            const row = (py + yy) * this.width;
            this.pixels.fill(colour, row + px, row + px + dot);
          }
        }
      }
    }
  }

  static textWidth(str, size = 1) {
    return str.length * 8 * size;
  }

  // Scale every pixel's brightness by `amount` (0-1)
  darken(amount) {
    const p = this.pixels;
    const k = Math.round(amount * 256);
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      p[i] = (0xFF000000 | ((((c >> 16) & 255) * k >> 8) << 16) | ((((c >> 8) & 255) * k >> 8) << 8) | (((c & 255) * k) >> 8)) >>> 0;
    }
  }

  // Copy another framebuffer's pixels, resampling if the scales differ
  copyFrom(other) {
    if (other.width === this.width) { this.pixels.set(other.pixels); return; }
    for (let y = 0; y < this.height; y++) {
      const sy = Math.floor((y * other.height) / this.height) * other.width;
      for (let x = 0; x < this.width; x++) {
        this.pixels[y * this.width + x] = other.pixels[sy + Math.floor((x * other.width) / this.width)];
      }
    }
  }
}
