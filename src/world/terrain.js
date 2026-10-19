import {
  FIXED_ONE, LAND_MID_HEIGHT, SEA_LEVEL, LAUNCHPAD_ALTITUDE, LAUNCHPAD_SIZE,
} from '../config.js';

// The landscape is a sum of six sine waves, worked out in 32-bit fixed point
// exactly as the original did. Coordinates wrap every 256 tiles.

const SIN = new Int32Array(1024);
for (let i = 0; i < 1024; i++) SIN[i] = Math.trunc((2 ** 31 - 1) * Math.sin((2 * Math.PI * i) / 1024));

const sin = (v) => SIN[(v >>> 22) & 1023];

const MID_FIXED = LAND_MID_HEIGHT * FIXED_ONE;
export const SEA_FIXED = SEA_LEVEL * FIXED_ONE;
export const LAUNCHPAD_FIXED = LAUNCHPAD_ALTITUDE * FIXED_ONE;
const PAD_FIXED = LAUNCHPAD_SIZE * FIXED_ONE;

export function toFixed(v) {
  return Math.floor(v * FIXED_ONE) | 0;
}

// Altitude (y, pointing down) at fixed-point map coordinates
export function altitudeFixed(x, z) {
  const m = Math.imul;
  let r = sin((x - m(z, 2)) | 0) >> 7;
  r += sin((m(x, 4) + m(z, 3)) | 0) >> 7;
  r += sin((m(z, 3) - m(x, 5)) | 0) >> 7;
  r += sin((m(x, 7) + m(z, 5)) | 0) >> 7;
  r += sin((m(x, 5) + m(z, 11)) | 0) >> 8;
  r += sin((m(x, 10) + m(z, 7)) | 0) >> 8;
  let alt = (MID_FIXED - r) | 0;
  if (alt > SEA_FIXED) alt = SEA_FIXED;
  if ((x >>> 0) < PAD_FIXED && (z >>> 0) < PAD_FIXED) alt = LAUNCHPAD_FIXED;
  return alt;
}

export function altitude(x, z) {
  return altitudeFixed(toFixed(x), toFixed(z)) / FIXED_ONE;
}

export function isOverLaunchpad(x, z) {
  return (toFixed(x) >>> 0) < PAD_FIXED && (toFixed(z) >>> 0) < PAD_FIXED;
}

// Tile colour as 4-bit [r, g, b]. Low bits of the altitude speckle the
// grass with patches of earth, slopes facing left catch the light, and
// rows nearer the viewer (higher row numbers) are brighter.
export function tileColour(prevAltFixed, altFixed, row, out) {
  let slope = prevAltFixed - altFixed;
  if (slope < 0) slope = 0;
  let r = altFixed & 4;
  let g = ((altFixed & 8) >> 1) + 4;
  let b = 0;
  if (altFixed === LAUNCHPAD_FIXED) { r = 4; g = 4; b = 4; }
  if (altFixed === SEA_FIXED && prevAltFixed === SEA_FIXED) { r = 0; g = 0; b = 4; }
  const brightness = row + (slope >>> 22);
  out[0] = Math.min(r + brightness, 15);
  out[1] = Math.min(g + brightness, 15);
  out[2] = Math.min(b + brightness, 15);
  return out;
}
