import {
  MAX_PARTICLES, SMOKE_RISING_SPEED, SPLASH_HEIGHT, SAFE_HEIGHT, SEA_LEVEL,
  LANDSCAPE_Z, LANDSCAPE_Z_FRONT, LANDSCAPE_X_HALF, LANDSCAPE_Z_MID, FIXED_ONE,
  OBJECT_SCORE,
} from '../config.js';
import { altitude } from '../world/terrain.js';
import { EMPTY } from '../world/objectMap.js';
import { ROCK } from '../world/blueprints.js';

// Particle behaviour flags
export const FADES = 1 << 0;        // colour cools from white-hot to red
export const IS_ROCK = 1 << 1;      // drawn as a tumbling 3D rock
export const SPLASHES = 1 << 2;     // makes spray when it lands in the sea
export const BOUNCES = 1 << 3;      // bounces off the ground (else vanishes)
export const FALLS = 1 << 4;        // affected by gravity
export const DESTROYS = 1 << 5;     // destroys objects it hits
export const BIG_SPLASH = 1 << 6;   // big splash rather than a small one
export const EXPLODES = 1 << 7;     // explodes when it hits the ground

// Velocity jitter as in the original: random signed 32-bit values shifted
// right, then expressed in tiles
const jitter = (random, shift) => random.signed(shift) / FIXED_ONE;

export class Particle {
  constructor() {
    this.x = 0; this.y = 0; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.life = 0;
    this.flags = 0;
    this.r = 0; this.g = 0; this.b = 0;
  }
}

export class ParticleSystem {
  constructor(random) {
    this.random = random;
    this.list = [];
    this.pool = [];
  }

  get count() { return this.list.length; }

  clear() {
    this.pool.push(...this.list);
    this.list.length = 0;
  }

  // Low-level add; `velShift` and `lifeShift` set the size of the random
  // jitter added to the velocity and lifespan (bigger shift = less jitter).
  // Returns null if the particle limit has been reached.
  add(x, y, z, vx, vy, vz, life, flags, rgb, velShift, lifeShift) {
    if (this.list.length >= MAX_PARTICLES) return null;
    const rnd = this.random;
    if (velShift !== undefined) {
      vx += jitter(rnd, velShift);
      vy += jitter(rnd, velShift);
      vz += jitter(rnd, velShift);
      life += rnd.unsigned(lifeShift);
    }
    const p = this.pool.pop() || new Particle();
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = life;
    p.flags = flags;
    if (rgb) { p.r = rgb[0]; p.g = rgb[1]; p.b = rgb[2]; } else { p.r = p.g = p.b = 0; }
    this.list.push(p);
    return p;
  }

  // --- Spawners ------------------------------------------------------------

  exhaust(x, y, z, vx, vy, vz) {
    this.add(x, y, z, vx, vy, vz, 8, FADES | SPLASHES | BOUNCES | FALLS, null, 10, 29);
  }

  bullet(x, y, z, vx, vy, vz) {
    this.add(x, y, z, vx, vy, vz, 20,
      SPLASHES | BOUNCES | FALLS | DESTROYS | BIG_SPLASH | EXPLODES, [15, 15, 15]);
  }

  smoke(x, y, z) {
    const grey = (this.random.next() & 7) + 3;
    this.add(x, y, z, 0, -SMOKE_RISING_SPEED, 0, 15, BOUNCES, [grey, grey, grey], 13, 25);
  }

  // Purple-brownish-green colours shared by debris and rocks
  earthColour() {
    const a = this.random.next();
    const b = this.random.b;
    return [(a & 7) + 4, (b >>> 29) + 2, (a >>> 30) + 4];
  }

  debris(x, y, z) {
    this.add(x, y, z, 0, 0, 0, 15, SPLASHES | BOUNCES | FALLS, this.earthColour(), 10, 26);
  }

  spark(x, y, z) {
    this.add(x, y, z, 0, 0, 0, 8, FADES | SPLASHES | BOUNCES | FALLS, null, 8, 29);
  }

  spray(x, y, z) {
    const r = this.random.next();
    const grey = (r & 4) + 8;
    this.add(x, y, z, 0, 0, 0, 20, FALLS, [grey, grey, (r & 3) + 12], 10, 26);
  }

  rock(x, y, z) {
    this.add(x, y, z, 0, 0, 0, 170,
      IS_ROCK | SPLASHES | BOUNCES | FALLS | DESTROYS | BIG_SPLASH, this.earthColour(), 10, 27);
  }

  // An explosion of (clusters + 1) groups of four particles
  explosion(x, y, z, clusters) {
    for (let i = 0; i <= clusters; i++) {
      this.spark(x, y, z);
      this.debris(x, y, z);
      this.smoke(x, y, z);
      this.spark(x, y, z);
    }
  }

  // --- Simulation ----------------------------------------------------------

  // Move every particle, handle collisions and queue them for drawing.
  // Returns true if a rock hit the player's ship.
  update(game) {
    const { scene, objects, camera, player } = game;
    const list = this.list;
    let i = 0;
    while (i < list.length) {
      const p = list[i];
      if (--p.life === 0) { this.remove(i); continue; }
      p.x += p.vx; p.y += p.vy; p.z += p.vz;
      if (p.flags & FALLS) p.vy += game.gravity;
      if (p.flags & FADES) this.fade(p);

      const ground = altitude(p.x, p.z);

      if ((p.flags & DESTROYS) && this.hitObject(p, ground, game)) { this.remove(i); continue; }

      if (p.y > ground) {
        p.y = ground;
        if (ground === SEA_LEVEL) {
          if (p.flags & SPLASHES) {
            const n = p.flags & BIG_SPLASH ? 65 : 4;
            for (let k = 0; k < n; k++) this.spray(p.x, p.y - SPLASH_HEIGHT, p.z);
          }
          this.remove(i); continue;
        }
        if (!(p.flags & BOUNCES)) { this.remove(i); continue; }
        if (p.flags & EXPLODES) { this.explosion(p.x, p.y, p.z, 3); this.remove(i); continue; }
        p.vx /= 2; p.vy = -p.vy / 2; p.vz /= 2;
      }
      i++;

      // View-relative position, culled to the visible landscape
      const vx = p.x - camera.x, vy = p.y - camera.y;
      const vz = p.z - camera.z + LANDSCAPE_Z;
      if (vz >= LANDSCAPE_Z || vz < LANDSCAPE_Z_FRONT || Math.abs(vx) >= LANDSCAPE_X_HALF) continue;

      if (p.flags & IS_ROCK) {
        if (game.playing && Math.abs(vx) < 1 && Math.abs(vz - LANDSCAPE_Z_MID) < 1
          && Math.abs(p.y - player.y) < 1) return true;
        scene.drawObject(ROCK, vx, vy, vz, game.rockOrientation);
      } else {
        scene.drawParticle(vx, vy, vz, ground - camera.y, game.colourOf(p.r, p.g, p.b));
      }
    }
    return false;
  }

  // Swap-remove keeps the loop O(1) per deletion; the particle moved into
  // slot i hasn't been processed yet, so the caller re-examines slot i
  remove(i) {
    const list = this.list;
    const last = list.pop();
    if (i < list.length) {
      this.pool.push(list[i]);
      list[i] = last;
    } else {
      this.pool.push(last);
    }
  }

  // White-hot at first, losing blue then green as the particle ages
  fade(p) {
    p.r = 15;
    if (p.life >= 8) { p.g = 15; p.b = (p.life - 8) * 2; }
    else { p.g = p.life * 2; p.b = 0; }
  }

  // Returns true if the particle was used up hitting an object
  hitObject(p, ground, game) {
    const height = ground - p.y;
    if (height < 0 || height >= SAFE_HEIGHT) return false;
    const type = game.objects.get(p.x, p.z);
    if (type === EMPTY) return false;
    if (!game.objects.isIntact(type)) {
      this.explosion(p.x, p.y, p.z, 3);
      return true;
    }
    game.objects.destroy(p.x, p.z);
    if (!(p.flags & IS_ROCK)) game.score += OBJECT_SCORE;
    this.explosion(p.x, p.y, p.z, 20);
    return true;
  }
}
