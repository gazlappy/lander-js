import {
  TILES_X, TILES_Z, LANDSCAPE_X, LANDSCAPE_Z, PROJECTION_X, PROJECTION_Y,
  PROJECTION_SCALE, SCREEN_WIDTH, VIEW_HEIGHT, FIXED_ONE,
} from '../config.js';
import { altitudeFixed, altitude, tileColour, toFixed } from '../world/terrain.js';
import { ROTATES, HAS_SHADOW } from '../world/blueprints.js';
import { BLACK } from './palette.js';

// Projection: the camera looks along +z with x to the right and y down.
// Coordinates passed in here are relative to the camera. Results snap to
// the framebuffer's pixel grid, rounding towards the centre of the screen
// as the original's integer maths did.
export function project(x, y, z, scale, out) {
  out[0] = PROJECTION_X + Math.trunc((PROJECTION_SCALE * scale * x) / z) / scale;
  out[1] = PROJECTION_Y + Math.trunc((PROJECTION_SCALE * scale * y) / z) / scale;
  return out;
}

const LAYERS = TILES_Z + 1;

// The scene is drawn with the painter's algorithm, like the original. The
// landscape is drawn row by row from the back, and each object or particle
// is queued on a depth layer (one per tile row) that is drawn just after
// the landscape rows in front of it.
export class Scene {
  constructor(frame, colourOf) {
    this.frame = frame;
    this.colourOf = colourOf;
    this.layers = Array.from({ length: LAYERS }, () => []);
    this.camera = null;
    this.scratch = { p: [0, 0], v: [0, 0, 0], n: [0, 0, 0], rgb: [0, 0, 0] };
    this.projected = [];
    this.shadows = [];
  }

  // Start a frame; the camera is read live, as the player moves it
  // part-way through building the frame
  begin(camera) {
    this.camera = camera;
    for (const layer of this.layers) layer.length = 0;
  }

  // Layer for something at view depth z; `nearer` lifts it one layer so
  // things are drawn after their own shadows
  static layerFor(z, nearer) {
    let d = LANDSCAPE_Z - z + (nearer ? 1 : 0);
    if (d >= TILES_Z || d < 0) d = TILES_Z - 1;
    return Math.floor(d);
  }

  queueTriangle(layer, x1, y1, x2, y2, x3, y3, colour) {
    this.layers[layer].push(0, x1, y1, x2, y2, x3, y3, colour);
  }

  queueBlock(layer, x, y, w, h, colour) {
    this.layers[layer].push(1, x, y, w, h, colour);
  }

  // Draw a 3D object at view-relative position (x, y, z). Returns true if
  // any vertex ended up below its own shadow, i.e. it has hit the ground.
  drawObject(blueprint, x, y, z, orientation) {
    const { v, n, p, rgb } = this.scratch;
    const rotates = blueprint.flags & ROTATES;
    const verts = blueprint.vertices;
    const proj = this.projected, shad = this.shadows;
    let crashed = false;
    for (let i = 0; i < verts.length; i++) {
      if (rotates) orientation.apply(verts[i], v);
      else { v[0] = verts[i][0]; v[1] = verts[i][1]; v[2] = verts[i][2]; }
      const vx = x + v[0], vy = y + v[1], vz = z + v[2];
      const scale = this.frame.scale;
      project(vx, vy, vz, scale, p);
      const px = p[0], py = p[1];
      const ground = altitude(vx + this.camera.x, vz + this.camera.z - LANDSCAPE_Z) - this.camera.y;
      project(vx, ground, vz, scale, p);
      const sx = p[0], sy = p[1];
      proj[i * 2] = px; proj[i * 2 + 1] = py;
      shad[i * 2] = sx; shad[i * 2 + 1] = sy;
      if (py >= sy) crashed = true;
    }
    const shadowLayer = Scene.layerFor(z, false);
    const faceLayer = Scene.layerFor(z, true);
    for (const face of blueprint.faces) {
      let visible = true;
      if (rotates) {
        orientation.apply(face.normal, n);
        visible = n[0] * x + n[1] * y + n[2] * z < 0;
      } else {
        n[0] = face.normal[0]; n[1] = face.normal[1]; n[2] = face.normal[2];
      }
      const [a, b, c] = face.vertices;
      if ((blueprint.flags & HAS_SHADOW) && (!rotates || n[1] < 0)) {
        this.queueTriangle(shadowLayer, shad[a * 2], shad[a * 2 + 1], shad[b * 2], shad[b * 2 + 1],
          shad[c * 2], shad[c * 2 + 1], BLACK);
      }
      if (!visible) continue;
      // Lit from above and slightly to the left
      let light = Math.floor((1 - n[1]) * 8) & 15;
      if (n[0] < 0) light++;
      light = Math.max(light - 5, 0);
      rgb[0] = ((face.colour >> 8) & 15) + light;
      rgb[1] = ((face.colour >> 4) & 15) + light;
      rgb[2] = (face.colour & 15) + light;
      const colour = this.colourOf(Math.min(rgb[0], 15), Math.min(rgb[1], 15), Math.min(rgb[2], 15));
      this.queueTriangle(faceLayer, proj[a * 2], proj[a * 2 + 1], proj[b * 2], proj[b * 2 + 1],
        proj[c * 2], proj[c * 2 + 1], colour);
    }
    return crashed;
  }

  // Particles are drawn as small blocks that shrink with distance, with a
  // dark speck on the ground beneath as a shadow
  drawParticle(x, y, z, groundY, colour) {
    const p = this.scratch.p;
    const size = Math.min(Math.floor(z / 2), 8);
    if (this.projectParticle(x, groundY, z, p)) {
      const w = size <= 5 ? 3 : size <= 7 ? 2 : 1;
      this.queueBlock(Scene.layerFor(z, false), p[0] - (w === 3 ? 1 : 0), p[1], w, 1, BLACK);
    }
    if (this.projectParticle(x, y, z, p)) {
      const [w, h] = size <= 5 ? [3, 2] : size === 6 ? [2, 2] : size === 7 ? [2, 1] : [1, 1];
      this.queueBlock(Scene.layerFor(z, true), p[0] - (w === 3 ? 1 : 0), p[1], w, h, colour);
    }
  }

  // Particles are only drawn inside a 45-degree cone and fully on-screen
  projectParticle(x, y, z, out) {
    if (z <= 0 || Math.abs(x) >= z || Math.abs(y) >= z) return false;
    out[0] = PROJECTION_X + Math.sign(x) * Math.floor((PROJECTION_SCALE * Math.abs(x)) / z);
    out[1] = PROJECTION_Y + Math.sign(y) * Math.floor((PROJECTION_SCALE * Math.abs(y)) / z);
    return out[0] >= 0 && out[0] < SCREEN_WIDTH && out[1] >= 0 && out[1] < VIEW_HEIGHT;
  }

  // Draw the landscape back to front, interleaving the depth layers
  render() {
    const cam = this.camera;
    const frame = this.frame;
    const tileX = Math.floor(cam.x), tileZ = Math.floor(cam.z);
    const p = this.scratch.p, rgb = this.scratch.rgb;
    let prevRow = null;
    let row = new Float64Array(TILES_X * 2);
    let spare = new Float64Array(TILES_X * 2);
    for (let r = 0; r < TILES_Z; r++) {
      const worldZ = tileZ - r;
      const viewZ = worldZ - cam.z + LANDSCAPE_Z;
      const zFixed = toFixed(worldZ);
      let prevAlt = 0;
      for (let c = 0; c < TILES_X; c++) {
        const worldX = tileX - LANDSCAPE_X + c;
        const alt = altitudeFixed(toFixed(worldX), zFixed);
        project(worldX - cam.x, alt / FIXED_ONE - cam.y, viewZ, frame.scale, p);
        row[c * 2] = p[0];
        row[c * 2 + 1] = p[1];
        if (prevRow && c > 0) {
          tileColour(prevAlt, alt, r, rgb);
          const colour = this.colourOf(rgb[0], rgb[1], rgb[2]);
          const i = c * 2, j = (c - 1) * 2;
          frame.triangle(row[i], row[i + 1], prevRow[i], prevRow[i + 1], row[j], row[j + 1], colour);
          frame.triangle(prevRow[i], prevRow[i + 1], row[j], row[j + 1], prevRow[j], prevRow[j + 1], colour);
        }
        prevAlt = alt;
      }
      if (r >= 2) this.drawLayer(r - 2);
      prevRow = row;
      [row, spare] = [spare, row];
    }
    this.drawLayer(TILES_Z - 2);
    this.drawLayer(TILES_Z - 1);
  }

  drawLayer(i) {
    const cmds = this.layers[i];
    const frame = this.frame;
    for (let k = 0; k < cmds.length;) {
      if (cmds[k] === 0) {
        frame.triangle(cmds[k + 1], cmds[k + 2], cmds[k + 3], cmds[k + 4], cmds[k + 5], cmds[k + 6], cmds[k + 7]);
        k += 8;
      } else {
        frame.block(cmds[k + 1], cmds[k + 2], cmds[k + 3], cmds[k + 4], cmds[k + 5]);
        k += 6;
      }
    }
  }
}
