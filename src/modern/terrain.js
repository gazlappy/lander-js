import { Noise, smoothstep, lerp, clamp } from './noise.js';
import { WORLD } from './config.js';

// The open world is one big island: continental noise for the broad shape,
// ridged noise for mountain ranges, and the original Lander's six sine
// waves layered on top for its familiar rolling hills. The y-axis points
// up and units are metres; sea level is y = 0.

const noise = new Noise(WORLD.seed);
const TAU = Math.PI * 2;

// The 1987 landscape formula, in tiles of 256 per wave period, giving
// roughly -5 to +5
function landerHills(tx, tz) {
  const w = TAU / 256;
  return Math.sin(w * (tx - 2 * tz)) + Math.sin(w * (4 * tx + 3 * tz))
    + Math.sin(w * (3 * tz - 5 * tx)) + Math.sin(w * (7 * tx + 5 * tz))
    + 0.5 * Math.sin(w * (5 * tx + 11 * tz)) + 0.5 * Math.sin(w * (10 * tx + 7 * tz));
}

// Height before bases are flattened into it
export function naturalHeight(x, z) {
  const coast = Math.hypot(x, z) / WORLD.islandRadius + 0.18 * noise.fbm(x * 0.0006 + 11, z * 0.0006 - 7, 3);
  const land = 1 - smoothstep(0.62, 1.0, coast);
  const continent = noise.fbm(x * 0.00045, z * 0.00045, 4);
  const mountains = noise.ridged(x * 0.0011 + 3.1, z * 0.0011 + 5.7, 5) * 260 * smoothstep(-0.05, 0.45, continent);
  const hills = -landerHills(x / WORLD.tileSize, z / WORLD.tileSize) * 4.5;
  const detail = noise.fbm(x * 0.012, z * 0.012, 3) * 2.5;
  const height = 22 + continent * 40 + mountains + hills + detail;
  return lerp(-45, height, land);
}

// Bases get flat ground for their pads, blending back into the hills
const flats = [];
export function addFlatArea(x, z, innerRadius, outerRadius) {
  const height = Math.max(naturalHeight(x, z), 6);
  flats.push({ x, z, innerRadius, outerRadius, height });
  return height;
}

export function heightAt(x, z) {
  let h = naturalHeight(x, z);
  for (const f of flats) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < f.outerRadius) h = lerp(f.height, h, smoothstep(f.innerRadius, f.outerRadius, d));
  }
  return h;
}

export function normalAt(x, z, out = [0, 1, 0]) {
  const e = 1.5;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  const len = Math.hypot(dx, 2 * e, dz);
  out[0] = -dx / len; out[1] = (2 * e) / len; out[2] = -dz / len;
  return out;
}

// Ground colour from height, steepness (normal y) and a little noise, as
// linear RGB 0..1
export function groundColour(x, z, h, ny, out) {
  const n = noise.simplex(x * 0.02, z * 0.02) * 0.5 + noise.simplex(x * 0.13, z * 0.13) * 0.2;
  let r, g, b;
  if (h < 2.5) { r = 0.62; g = 0.56; b = 0.38; }                       // sand
  else {
    // Grass, turning to darker forest green in damp hollows
    const lush = clamp(0.5 + n, 0, 1);
    r = lerp(0.16, 0.08, lush); g = lerp(0.36, 0.24, lush); b = lerp(0.10, 0.07, lush);
    // The original's speckled earth patches
    const earth = smoothstep(0.35, 0.55, noise.simplex(x * 0.05 + 40, z * 0.05));
    r = lerp(r, 0.36, earth * 0.6); g = lerp(g, 0.26, earth * 0.6); b = lerp(b, 0.14, earth * 0.6);
    // Rock on steep slopes and high ground
    const rock = Math.max(smoothstep(0.86, 0.72, ny), smoothstep(110, 160, h + n * 20));
    r = lerp(r, 0.34 + n * 0.05, rock); g = lerp(g, 0.32 + n * 0.05, rock); b = lerp(b, 0.30 + n * 0.05, rock);
    // Snow on the peaks
    const snow = smoothstep(185, 215, h + n * 25) * smoothstep(0.7, 0.85, ny);
    r = lerp(r, 0.92, snow); g = lerp(g, 0.94, snow); b = lerp(b, 0.97, snow);
  }
  out[0] = r; out[1] = g; out[2] = b;
  return out;
}

// How wooded the ground is here, 0..1, for scattering trees
export function forestDensity(x, z) {
  return smoothstep(-0.1, 0.5, noise.fbm(x * 0.003 + 70, z * 0.003 - 30, 3));
}
