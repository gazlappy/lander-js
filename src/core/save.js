import { EMPTY } from '../world/objectMap.js';
import { GAME_OVER } from '../game.js';

// Snapshot of everything needed to carry on a game later: the world, the
// ship, the particles in flight and the random number generator, so the
// game continues exactly as it would have.

const VERSION = 1;
const PARTICLE_FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'flags', 'r', 'g', 'b'];
const PLAYER_FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'direction', 'pitch'];

export function serialise(game) {
  if (game.state === GAME_OVER) return null;
  // The object map is mostly empty, so store [index, type] pairs
  const objects = [];
  game.objects.cells.forEach((type, i) => { if (type !== EMPTY) objects.push(i, type); });
  const pick = (o, fields) => fields.map((f) => o[f]);
  return {
    version: VERSION,
    state: game.state,
    crashFrames: game.crashFrames,
    score: game.score,
    fuel: game.fuel,
    gravity: game.gravity,
    lives: game.lives,
    tick: game.tick,
    seeds: [game.random.seed1, game.random.seed2],
    camera: [game.camera.x, game.camera.y, game.camera.z],
    mouse: [game.mouse.x, game.mouse.y],
    player: pick(game.player, PLAYER_FIELDS),
    particles: game.particles.list.map((p) => pick(p, PARTICLE_FIELDS)),
    objects,
  };
}

// Returns false if the save can't be used
export function restore(game, data) {
  if (!data || data.version !== VERSION) return false;
  const put = (o, fields, values) => fields.forEach((f, i) => { o[f] = values[i]; });
  game.state = data.state;
  game.crashFrames = data.crashFrames;
  game.score = data.score;
  game.fuel = data.fuel;
  game.gravity = data.gravity;
  game.lives = data.lives;
  game.tick = data.tick;
  [game.random.seed1, game.random.seed2] = data.seeds;
  [game.camera.x, game.camera.y, game.camera.z] = data.camera;
  [game.mouse.x, game.mouse.y] = data.mouse;
  put(game.player, PLAYER_FIELDS, data.player);
  game.player.orientation.set(game.player.pitch, game.player.direction);
  game.particles.clear();
  for (const values of data.particles) {
    const p = game.particles.add(0, 0, 0, 0, 0, 0, 1, 0, null);
    if (p) put(p, PARTICLE_FIELDS, values);
  }
  game.objects.cells.fill(EMPTY);
  for (let i = 0; i < data.objects.length; i += 2) game.objects.cells[data.objects[i]] = data.objects[i + 1];
  return true;
}
