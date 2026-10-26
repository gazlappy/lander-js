// Tunable constants for the modern version. Units are metres and seconds,
// with y pointing up.

export const WORLD = {
  seed: 1987,
  islandRadius: 2600,     // rough radius of the island's coast
  tileSize: 8,            // metres per original Lander tile, for the hills
  chunkSize: 128,         // terrain chunk edge length
  seaLevel: 0,
};

// The ship handles exactly like the 1987 original (and the retro version):
// the original's per-tick physics are converted to metres and seconds using
// the retro version's default 20 ticks a second and a tile of 4.2 m (the
// size the classic hull is scaled to).
const TICKS = 20;
const TILE = 4.2;
const perTick2 = TILE * TICKS * TICKS;   // tiles/tick^2 -> m/s^2

export const PHYSICS = {
  ticks: TICKS,
  tile: TILE,
  gravity: (0x30000 / 2 ** 24) * perTick2,        // 19.7 m/s^2
  fullThrust: (1 / 16) * perTick2,                // 105 m/s^2 along the floor
  hoverThrust: (1 / 64) * perTick2,               // 26 m/s^2
  friction: TICKS * Math.log(64 / 63),            // velocity loses 1/64 a tick
  // Safe touchdown: |vx| + |vy| + |vz| under 1/8 tile a tick, as the original
  landingSpeed: (1 / 8) * TILE * TICKS,           // 10.5 m/s
  landingTilt: 0.42,      // max tilt for a safe touchdown (radians)
  crashDamagePerMs: 6,    // hull damage per m/s over the landing speed
  ceiling: 650,           // engines weaken above this height
};

// Graphics presets: view distance in chunks, terrain detail, shadows,
// water reflections, bloom and maximum pixel ratio
export const QUALITY = {
  low: { label: 'Low', viewChunks: 5, segments: 16, shadows: false, reflections: false, bloom: false, pixelRatio: 1 },
  medium: { label: 'Medium', viewChunks: 7, segments: 24, shadows: true, shadowSize: 1024, reflections: false, bloom: true, pixelRatio: 1.25 },
  high: { label: 'High', viewChunks: 9, segments: 32, shadows: true, shadowSize: 2048, reflections: true, bloom: true, pixelRatio: 1.5 },
  ultra: { label: 'Ultra', viewChunks: 12, segments: 32, shadows: true, shadowSize: 4096, reflections: true, bloom: true, pixelRatio: 2 },
  // Used automatically in a VR headset: Quest-class hardware draws every
  // frame twice at 72-90 Hz, so detail, scenery range and effects come down
  vr: { label: 'VR', viewChunks: 6, segments: 16, sceneryChunks: 3, shadows: false, reflections: false, bloom: false, pixelRatio: 1 },
};

export const STORAGE_KEY = 'lander-modern';
