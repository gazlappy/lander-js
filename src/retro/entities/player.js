import {
  LAUNCHPAD_SIZE, LAUNCHPAD_Y, UNDERCARRIAGE_Y, SAFE_HEIGHT, LANDING_SPEED,
  HIGHEST_ALTITUDE, FRICTION, FULL_THRUST, HOVER_THRUST, MAX_PITCH_STEP,
  CAMERA_PLAYER_Z, LANDSCAPE_Z_MID, MAX_FUEL, REFUEL_RATE, BULLET_COST,
} from '../config.js';
import { Orientation, mouseToPolar, clamp } from '../core/maths.js';
import { altitude, isOverLaunchpad } from '../world/terrain.js';
import { PLAYER_SHIP } from '../world/blueprints.js';

// Mouse buttons, which double as the fuel burn rate per tick
export const FIRE = 1;
export const HOVER = 2;
export const THRUST = 4;

// The mouse range the game reads: 1024 units across, centred on 512
const MOUSE_CENTRE = 512;
const MAX_TILT = 0x3FFFFFFF;

export class Player {
  constructor() {
    this.orientation = new Orientation();
    this.reset();
  }

  // Sit the ship on the middle of the launchpad
  reset() {
    this.x = LAUNCHPAD_SIZE / 2;
    this.y = LAUNCHPAD_Y;
    this.z = LAUNCHPAD_SIZE / 2;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.direction = 0;
    this.pitch = 1;
    this.burn = 0;
  }

  // Steer from the mouse. Distance from the centre sets how far the ship
  // tilts, the angle sets which way; both are damped by halving the change.
  steer(mouseX, mouseY) {
    const mx = Math.min(mouseX, 1023) - MOUSE_CENTRE;
    const my = MOUSE_CENTRE - mouseY;
    const [distance, angle] = mouseToPolar(mx, my);
    // Half a turn of tilt at the edge of the mouse range
    const tilt = Math.min(distance, MAX_TILT) * 2;

    const dDir = clamp((this.direction - angle) | 0, -MAX_PITCH_STEP - 1, MAX_PITCH_STEP);
    const dPitch = clamp((this.pitch - tilt) | 0, -MAX_PITCH_STEP - 1, MAX_PITCH_STEP);
    this.direction = (this.direction - (dDir >> 1)) | 0;
    this.pitch = (this.pitch - (dPitch >> 1)) | 0;
    this.orientation.set(this.pitch, this.direction);
  }

  // One tick of flight. Returns 'crash' if the ship hit something.
  update(game, buttons) {
    this.burn = game.fuel === 0 ? 0 : buttons;
    this.steer(game.mouse.x, game.mouse.y);

    if (this.y < -HIGHEST_ALTITUDE) this.burn &= ~(THRUST | HOVER);

    // Thrust pushes opposite to the exhaust, which leaves through the floor
    const roof = this.orientation.roof;
    const full = this.burn & THRUST;
    this.vx -= this.vx * FRICTION; if (full) this.vx -= roof[0] * FULL_THRUST;
    this.x += this.vx;
    this.vy -= this.vy * FRICTION; if (full) this.vy -= roof[1] * FULL_THRUST;
    this.y += this.vy;
    this.vz -= this.vz * FRICTION; if (full) this.vz -= roof[2] * FULL_THRUST;
    this.z += this.vz;
    // Hover thrust lands a tick late, which gives it a floaty feel
    if (this.burn & HOVER) {
      this.vx -= roof[0] * HOVER_THRUST;
      this.vy -= roof[1] * HOVER_THRUST;
      this.vz -= roof[2] * HOVER_THRUST;
    }
    this.vy += game.gravity;

    // The camera follows the ship but stops dropping near the ground
    const camera = game.camera;
    camera.x = this.x;
    camera.y = Math.min(this.y, 0);
    camera.z = this.z + CAMERA_PLAYER_Z;

    const safeY = altitude(this.x, this.z) - UNDERCARRIAGE_Y;
    const clearance = safeY - this.y;
    if (clearance >= 0 && clearance < SAFE_HEIGHT && game.objects.isIntact(game.objects.get(this.x, this.z))) {
      return 'crash';
    }
    if (this.y > safeY && this.land(game) === 'crash') return 'crash';

    const crashed = game.scene.drawObject(PLAYER_SHIP, 0, this.y - camera.y, LANDSCAPE_Z_MID, this.orientation);
    if (crashed) return 'crash';

    this.emitExhaust(game.particles);
    if (this.burn & FIRE) this.fire(game);
    return null;
  }

  // Below the safe height: either a gentle landing on the pad (refuel) or
  // a crash anywhere else. Too fast over the pad sinks the ship until the
  // shadow check in drawObject catches it.
  land(game) {
    if (!isOverLaunchpad(this.x, this.z)) return 'crash';
    if (Math.abs(this.vx) + Math.abs(this.vy) + Math.abs(this.vz) >= LANDING_SPEED) return null;
    if (game.fuel + REFUEL_RATE < MAX_FUEL) game.fuel += REFUEL_RATE;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.y = LAUNCHPAD_Y;
    return null;
  }

  emitExhaust(particles) {
    if (!(this.burn & (THRUST | HOVER))) return;
    const roof = this.orientation.roof;
    // Exhaust leaves the engine at half the ship's speed plus a kick along
    // the thrust vector; the start position allows for the first move
    const vx = (this.vx + roof[0]) / 2, vy = (this.vy + roof[1]) / 2, vz = (this.vz + roof[2]) / 2;
    const x = this.x - vx + roof[0], y = this.y - vy + roof[1], z = this.z - vz + roof[2];
    const count = this.burn & THRUST ? 8 : 2;
    for (let i = 0; i < count; i++) particles.exhaust(x, y, z, vx, vy, vz);
  }

  fire(game) {
    game.score -= BULLET_COST;
    const nose = this.orientation.nose;
    const vx = this.vx + nose[0] / 2, vy = this.vy + nose[1] / 2, vz = this.vz + nose[2] / 2;
    game.particles.bullet(this.x - vx + nose[0], this.y - vy + nose[1], this.z - vz + nose[2], vx, vy, vz);
  }
}
