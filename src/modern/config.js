// Tunable constants for the modern version. Units are metres and seconds,
// with y pointing up.

export const WORLD = {
  seed: 1987,
  islandRadius: 2600,     // rough radius of the island's coast
  tileSize: 8,            // metres per original Lander tile, for the hills
  chunkSize: 128,         // terrain chunk edge length
  seaLevel: 0,
};

export const PHYSICS = {
  gravity: 9.0,
  landingSpeed: 6.5,      // max impact speed for a safe touchdown (m/s)
  landingTilt: 0.42,      // max tilt for a safe touchdown (radians)
  crashDamagePerMs: 9,    // hull damage per m/s over the landing speed
};

// Graphics presets: view distance in chunks, terrain detail, shadows,
// water reflections, bloom and maximum pixel ratio
export const QUALITY = {
  low: { label: 'Low', viewChunks: 5, segments: 16, shadows: false, reflections: false, bloom: false, pixelRatio: 1 },
  medium: { label: 'Medium', viewChunks: 7, segments: 24, shadows: true, shadowSize: 1024, reflections: false, bloom: true, pixelRatio: 1.25 },
  high: { label: 'High', viewChunks: 9, segments: 32, shadows: true, shadowSize: 2048, reflections: true, bloom: true, pixelRatio: 1.5 },
  ultra: { label: 'Ultra', viewChunks: 12, segments: 32, shadows: true, shadowSize: 4096, reflections: true, bloom: true, pixelRatio: 2 },
};

export const STORAGE_KEY = 'lander-modern';
