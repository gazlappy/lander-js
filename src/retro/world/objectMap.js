import { WORLD_SIZE, OBJECTS_TO_PLACE, LAUNCHPAD_ROCKET } from '../config.js';
import { DESTROYED_OFFSET } from './blueprints.js';
import { altitudeFixed, SEA_FIXED, LAUNCHPAD_FIXED } from './terrain.js';

export const EMPTY = 0xFF;

// A 256x256 grid of object types, one per tile, wrapping in both directions
export class ObjectMap {
  constructor() {
    this.cells = new Uint8Array(WORLD_SIZE * WORLD_SIZE).fill(EMPTY);
  }

  static index(x, z) {
    return (Math.floor(x) & 255) + ((Math.floor(z) & 255) << 8);
  }

  get(x, z) {
    return this.cells[ObjectMap.index(x, z)];
  }

  // Scatter trees and buildings over dry land, then put the three rockets
  // beside the launchpad
  populate(random) {
    this.cells.fill(EMPTY);
    for (let i = 0; i < OBJECTS_TO_PLACE; i++) {
      const r = random.next();
      const alt = altitudeFixed(r, r << 8);
      if (alt === SEA_FIXED || alt === LAUNCHPAD_FIXED) continue;
      this.cells[(r >>> 24) + (((r << 8) >>> 24) << 8)] = (r & 7) + 1;
    }
    for (const z of [1, 3, 5]) this.cells[7 + (z << 8)] = LAUNCHPAD_ROCKET;
  }

  isIntact(type) {
    return type !== EMPTY && type < DESTROYED_OFFSET;
  }

  // Returns the object type that was destroyed, or EMPTY if nothing was
  // there or it was already wreckage
  destroy(x, z) {
    const i = ObjectMap.index(x, z);
    const type = this.cells[i];
    if (!this.isIntact(type)) return EMPTY;
    this.cells[i] = type + DESTROYED_OFFSET;
    return type;
  }
}
