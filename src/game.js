import {
  INITIAL_SCORE, INITIAL_HIGH_SCORE, INITIAL_FUEL, LIVES, GRAVITY_START, GRAVITY_STEPS,
  ROCKS_FROM_SCORE, ROCK_HEIGHT, PLAYER_FRONT_Z, CRASH_CLOUD_Y, CRASH_FRAMES,
  SEA_LEVEL, SMOKE_HEIGHT, TILES_X, TILES_Z, LANDSCAPE_X, LANDSCAPE_Z,
} from './config.js';
import { Random } from './core/random.js';
import { Orientation } from './core/maths.js';
import { ObjectMap, EMPTY } from './world/objectMap.js';
import { OBJECT_TYPES, DESTROYED_OFFSET } from './world/blueprints.js';
import { altitude } from './world/terrain.js';
import { Player } from './entities/player.js';
import { ParticleSystem } from './entities/particles.js';
import { FrameBuffer } from './render/framebuffer.js';
import { Scene } from './render/scene.js';
import { makeColourMapper } from './render/palette.js';
import { drawHud, drawGameOver } from './ui/hud.js';

export const MOUSE_START = 511;

// Game states
export const PLAYING = 'playing';
export const CRASHING = 'crashing';
export const GAME_OVER = 'gameOver';

export class Game {
  constructor({ scale = 1, trueColour = false, highScore = INITIAL_HIGH_SCORE } = {}) {
    this.random = new Random();
    this.objects = new ObjectMap();
    this.player = new Player();
    this.particles = new ParticleSystem(this.random);
    this.rockOrientation = new Orientation();
    this.camera = { x: 0, y: 0, z: 0 };
    this.mouse = { x: MOUSE_START, y: MOUSE_START };
    this.highScore = highScore;
    this.score = INITIAL_SCORE;
    this.tick = 0;
    this.setGraphics(scale, trueColour);
    this.newGame();
  }

  setGraphics(scale, trueColour) {
    this.frame = new FrameBuffer(scale);
    this.colourOf = makeColourMapper(trueColour);
    this.scene = new Scene(this.frame, this.colourOf);
    this.scene.begin(this.camera);
  }

  get playing() { return this.state === PLAYING; }

  newGame() {
    if (this.score > this.highScore) this.highScore = this.score;
    this.score = INITIAL_SCORE;
    this.fuel = INITIAL_FUEL;
    this.gravity = GRAVITY_START;
    this.lives = LIVES;
    this.objects.populate(this.random);
    this.newLife();
  }

  newLife() {
    this.state = PLAYING;
    this.player.reset();
    this.camera.x = 0; this.camera.z = 0;
    this.mouse.x = MOUSE_START;
    this.mouse.y = MOUSE_START;
  }

  // Advance one tick. `buttons` is the mouse button state (see player.js).
  // Returns true if the frame changed.
  step(buttons) {
    if (this.state === GAME_OVER) return false;
    if (this.state === PLAYING) {
      if (this.playFrame(buttons)) return true;
      this.startCrash();
    }
    this.crashFrame();
    return true;
  }

  // One pass of the main loop. Returns false if the ship was lost.
  playFrame(buttons) {
    this.scene.begin(this.camera);
    if (this.player.update(this, buttons) === 'crash') return false;
    this.spinRocks();
    this.dropRocks();
    if (this.particles.update(this)) return false;
    this.drawObjects();
    this.render(true);
    return true;
  }

  // The ship explodes and the world carries on for a moment without it
  startCrash() {
    this.state = CRASHING;
    this.crashFrames = CRASH_FRAMES;
    const p = this.player;
    this.particles.explosion(p.x, p.y - CRASH_CLOUD_Y, p.z, 81);
  }

  crashFrame() {
    this.scene.begin(this.camera);
    this.spinRocks();
    this.particles.update(this);
    this.drawObjects();
    this.render(false);
    if (--this.crashFrames > 0) return;
    this.lives--;
    if (this.lives > 0) {
      this.newLife();
    } else {
      this.state = GAME_OVER;
      drawGameOver(this);
    }
  }

  spinRocks() {
    this.rockOrientation.set(this.tick << 24, this.tick << 25);
  }

  // Above 800 points, rocks start falling, more often as the score rises
  dropRocks() {
    const chance = this.score - ROCKS_FROM_SCORE;
    if (chance < 0) return;
    if ((this.random.next() >>> 18) >= chance) return;
    this.particles.rock(this.camera.x, -ROCK_HEIGHT, this.camera.z - PLAYER_FRONT_Z);
  }

  // Queue every object on the visible part of the map, back to front.
  // Wreckage smoulders, sending up a puff of smoke every fourth tick.
  drawObjects() {
    const cam = this.camera;
    const x0 = Math.floor(cam.x) - LANDSCAPE_X;
    let z = Math.floor(cam.z);
    for (let row = 0; row < TILES_Z; row++, z--) {
      for (let col = 0, x = x0; col < TILES_X; col++, x++) {
        const type = this.objects.get(x, z);
        if (type === EMPTY) continue;
        const ground = altitude(x, z);
        if (ground === SEA_LEVEL) continue;
        if (type >= DESTROYED_OFFSET && (this.tick & 3) === 0) {
          this.particles.smoke(x, ground - SMOKE_HEIGHT, z);
        }
        this.scene.drawObject(OBJECT_TYPES[type], x - cam.x, ground - cam.y, z - cam.z + LANDSCAPE_Z, this.player.orientation);
      }
    }
  }

  render(showFuel) {
    this.frame.clear(this.colourOf(0, 0, 0));
    this.scene.render();
    for (const step of GRAVITY_STEPS) if (this.score >= step.score) this.gravity = step.gravity;
    if (showFuel) {
      this.fuel = Math.max(this.fuel - this.player.burn, 0);
    }
    drawHud(this, showFuel);
    this.tick++;
  }
}
