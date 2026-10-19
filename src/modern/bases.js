import { addFlatArea } from './terrain.js';

// Landing sites around the island. Each has flat ground carved into the
// terrain, one or more pads and some buildings. Positions were chosen by
// searching the terrain for flat, dry ground near each region.

const SITES = [
  { id: 'home', name: 'Braben Field', kind: 'home', x: 160, z: 280, pads: 3 },
  { id: 'nyx', name: 'Nyx Outpost', kind: 'outpost', x: 1320, z: -1220, pads: 1 },
  { id: 'cobalt', name: 'Cobalt Ridge', kind: 'outpost', x: -1690, z: -340, pads: 1 },
  { id: 'delta', name: 'Delta Station', kind: 'outpost', x: 1200, z: 740, pads: 1 },
  { id: 'north', name: 'North Light', kind: 'outpost', x: -80, z: -1540, pads: 1 },
  { id: 'summit', name: 'Summit Relay', kind: 'outpost', x: -480, z: -320, pads: 1 },
  { id: 'red', name: 'Red Valley', kind: 'hostile', x: -340, z: 1180, pads: 0 },
];

export const PAD_SIZE = 24;

export const BASES = SITES.map((site) => {
  const radius = site.kind === 'home' ? 95 : 55;
  const height = addFlatArea(site.x, site.z, radius, radius + 60);
  const pads = [];
  for (let i = 0; i < site.pads; i++) {
    // Home has a row of pads; outposts have one in the middle
    const offset = site.pads === 1 ? 0 : (i - (site.pads - 1) / 2) * 42;
    pads.push({ base: site.id, index: i, x: site.x + offset, z: site.z, y: height, size: PAD_SIZE });
  }
  return { ...site, y: height, radius, pads };
});

export const BASE_BY_ID = Object.fromEntries(BASES.map((b) => [b.id, b]));
export const HOME = BASE_BY_ID.home;
export const ALL_PADS = BASES.flatMap((b) => b.pads);

// The pad under (x, z), if any
export function padAt(x, z) {
  return ALL_PADS.find((p) => Math.abs(x - p.x) < p.size / 2 && Math.abs(z - p.z) < p.size / 2) || null;
}

// True if (x, z) is somewhere scenery shouldn't be scattered
export function isNearBase(x, z, margin = 0) {
  return BASES.some((b) => Math.hypot(x - b.x, z - b.z) < b.radius + margin);
}
