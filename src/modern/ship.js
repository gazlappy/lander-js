import * as THREE from 'three';
import { PHYSICS } from './config.js';
import { heightAt } from './terrain.js';
import { padAt, BASE_BY_ID } from './bases.js';
import { buildCraft } from './models.js';
import { clamp } from './noise.js';
import { Orientation, mouseToPolar } from '../retro/core/maths.js';

// The player's ship. It flies exactly like the 1987 original and the retro
// version: the mouse position sets how far and which way the ship tilts
// (through the original's coarse polar maths, dead zone and all), the
// tilt eases in by halving the gap every tick, and the engine pushes along
// the ship's floor. Hover is simply a gentler thrust. The original's
// per-tick numbers are converted to metres and seconds in config.js.

const UP = new THREE.Vector3(0, 1, 0);
const MOUSE_CENTRE = 512;
const MAX_TILT = 0x3FFFFFFF;
const MAX_STEP = 0x30000000;
const FUEL_AT_START = 3413;      // the original's starting fuel, for burn rates
const nearby = [];
const basis = new THREE.Matrix4();
const tmpV = new THREE.Vector3();

export class Ship {
  constructor(scene, craft) {
    this.scene = scene;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.orientation = new Orientation();
    this.up = new THREE.Vector3(0, 1, 0);
    this.forward = new THREE.Vector3(0, 0, 1);
    this.side = new THREE.Vector3(1, 0, 0);
    this.quaternion = new THREE.Quaternion();
    this.yaw = 0;
    this.setCraft(craft);
  }

  setCraft(craft) {
    if (this.model) this.scene.remove(this.model.group);
    this.craft = craft;
    this.model = buildCraft(craft.id);
    this.scene.add(this.model.group);
    this.reset(this.position, 0);
  }

  // Sit the ship on the ground at (position.x, position.z)
  reset(position) {
    this.position.copy(position);
    this.position.y = heightAt(position.x, position.z) + this.model.gear;
    this.velocity.set(0, 0, 0);
    this.direction = 0;          // 32-bit angles, as the original kept them
    this.pitch = 1;
    this.hull = this.craft.hull;
    this.fuel = this.craft.fuel;
    this.landed = true;
    this.destroyed = false;
    this.throttle = 0;
    this.gunCooldown = 0;
    this.cargo = [];
    this.pad = padAt(this.position.x, this.position.z);
    this.updateOrientation(0);
    this.sync();
  }

  get altitude() {
    return this.position.y - this.model.gear - Math.max(heightAt(this.position.x, this.position.z), 0);
  }

  get tiltAngle() {
    return Math.acos(clamp(this.up.y, -1, 1));
  }

  // Ease the pitch and direction towards the mouse. The original halves
  // the gap each tick (capped at a fixed turn per tick); this is the same
  // curve in continuous time.
  steer(dt, mouseX, mouseY) {
    const mx = Math.min(mouseX, 1023) - MOUSE_CENTRE;
    const my = MOUSE_CENTRE - mouseY;
    const [distance, angle] = mouseToPolar(mx, my);
    const tilt = Math.min(distance, MAX_TILT) * 2;
    const ticks = dt * PHYSICS.ticks * this.craft.steer;
    const ease = (current, target) => {
      const gap = (current - target) | 0;
      const size = Math.abs(gap);
      const step = size > MAX_STEP ? (MAX_STEP / 2) * ticks : size * (1 - 0.5 ** ticks);
      return (current - Math.sign(gap) * Math.min(Math.round(step), size)) | 0;
    };
    this.direction = ease(this.direction, angle);
    this.pitch = ease(this.pitch, tilt);
  }

  // controls: { mouseX, mouseY (the retro mouse, 0-1279 x 0-1023),
  // thrust, hover, hoverHold, fire, heading (camera yaw) }
  // Returns events: 'landed', 'takeoff', 'scrape', 'destroyed', 'splashed'
  update(dt, controls, game) {
    const events = [];
    if (this.destroyed) return events;
    const c = this.craft;

    this.steer(dt, controls.mouseX, controls.mouseY);
    this.updateOrientation(controls.heading || 0);

    // Engine: full thrust and hover both push along the floor, as the
    // original's left and middle buttons did
    let accel = 0;
    let burn = controls.fire ? 1 : 0;
    if (this.fuel > 0) {
      if (controls.thrust) { accel += PHYSICS.fullThrust; burn += 4; }
      if (controls.hover) { accel += PHYSICS.hoverThrust; burn += 2; }
      if (!controls.thrust && !controls.hover && controls.hoverHold) {
        // Optional assist (H): just enough thrust to hold the current height
        const needed = (PHYSICS.gravity - this.velocity.y * 1.6) / Math.max(this.up.y, 0.3);
        accel = clamp(needed, 0, PHYSICS.hoverThrust * 1.6);
        burn += 2 * (accel / PHYSICS.hoverThrust);
      }
      accel *= c.power;
      if (this.position.y > PHYSICS.ceiling) accel *= 0.4;
    }
    this.fuel = Math.max(0, this.fuel - burn * PHYSICS.ticks * dt * (c.fuel / FUEL_AT_START));
    this.throttle = Math.min(accel / (PHYSICS.fullThrust * c.power), 1.2);

    if (this.landed) {
      if (accel * this.up.y <= PHYSICS.gravity) {
        // Sitting on the ground. Tipping too far drags a wingtip into it.
        if (this.tiltAngle > PHYSICS.landingTilt + 0.2) {
          this.damage(40, events);
          if (!this.destroyed) { this.landed = false; this.velocity.y = 4; events.push('scrape'); }
        } else {
          this.velocity.set(0, 0, 0);
          this.serviceAtPad(dt, game);
        }
        this.sync();
        return events;
      }
      this.landed = false;
      this.pad = null;
      events.push('takeoff');
    }

    // Friction, thrust along the floor, gravity
    this.velocity.multiplyScalar(Math.exp(-PHYSICS.friction * dt));
    this.velocity.addScaledVector(this.up, accel * dt);
    this.velocity.y -= PHYSICS.gravity * dt;
    this.position.addScaledVector(this.velocity, dt);

    this.collideWithGround(events, game);
    if (!this.destroyed) this.collideWithObjects(events, game);
    this.sync();
    return events;
  }

  // Build the ship's orientation from the original's matrix. The original
  // works with x to the right, y down and z into the screen; here that
  // screen frame is turned to face the camera's heading.
  updateOrientation(heading) {
    const o = this.orientation.set(this.pitch, this.direction);
    const right = tmpV.set(-Math.cos(heading), 0, Math.sin(heading));
    const ahead = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    const toWorld = (v, out) => out.set(0, -v[1], 0).addScaledVector(right, v[0]).addScaledVector(ahead, v[2]);
    toWorld(o.nose, this.forward).normalize();
    toWorld(o.roof, this.up).negate();
    // Tidy the coarse matrix into a clean rotation
    this.up.addScaledVector(this.forward, -this.up.dot(this.forward)).normalize();
    this.side.crossVectors(this.up, this.forward).normalize();
    basis.makeBasis(this.side, this.up, this.forward);
    this.quaternion.setFromRotationMatrix(basis);
    this.yaw = Math.atan2(this.forward.x, this.forward.z);
  }

  collideWithGround(events, game) {
    const ground = heightAt(this.position.x, this.position.z);
    const floor = Math.max(ground, 0) + this.model.gear;
    if (this.position.y > floor) return;
    if (ground < 0) {
      this.position.y = floor;
      this.destroy(events, 'splash');
      return;
    }
    const v = this.velocity;
    const speed = Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z);
    const tilt = this.tiltAngle;
    this.position.y = floor;
    if (speed < PHYSICS.landingSpeed && tilt <= PHYSICS.landingTilt) {
      v.set(0, 0, 0);
      this.landed = true;
      this.pad = padAt(this.position.x, this.position.z);
      events.push('landed');
      return;
    }
    const damage = Math.max(speed - PHYSICS.landingSpeed, 2) * PHYSICS.crashDamagePerMs + (tilt > PHYSICS.landingTilt ? 15 : 0);
    this.damage(damage, events);
    v.y = Math.abs(v.y) * 0.35;
    v.x *= 0.5;
    v.z *= 0.5;
    events.push('scrape');
  }

  collideWithObjects(events, game) {
    const r = this.craft.radius;
    for (const o of game.world.objectsNear(this.position.x, this.position.z, r, nearby)) {
      const top = o.y + o.height;
      if (this.position.y - this.model.gear > top) continue;
      const dx = this.position.x - o.x, dz = this.position.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d > r + o.radius * 0.8) continue;
      this.damage(10 + this.velocity.length() * 3, events);
      // Knock the ship back out of the object
      const push = (r + o.radius * 0.8 - d) + 0.5;
      this.position.x += (dx / (d || 1)) * push;
      this.position.z += (dz / (d || 1)) * push;
      this.velocity.multiplyScalar(-0.3);
      game.onObjectRammed(o);
      events.push('scrape');
      if (this.destroyed) return;
    }
  }

  damage(amount, events) {
    this.hull -= amount;
    if (this.hull <= 0) this.destroy(events, 'crash');
  }

  destroy(events, how) {
    this.hull = 0;
    this.destroyed = true;
    this.model.group.visible = false;
    events.push(how === 'splash' ? 'splashed' : 'destroyed');
  }

  // Sitting on a friendly pad refuels at the original's rate and repairs
  serviceAtPad(dt, game) {
    if (!this.pad) return;
    const base = BASE_BY_ID[this.pad.base];
    if (!base || base.kind === 'hostile') return;
    this.fuel = Math.min(this.craft.fuel, this.fuel + 0x20 * PHYSICS.ticks * dt * (this.craft.fuel / FUEL_AT_START));
    this.hull = Math.min(this.craft.hull, this.hull + this.craft.hull * 0.12 * dt);
  }

  // World positions of the guns, for firing
  gunPositions(out) {
    out.length = 0;
    for (const g of this.model.guns) out.push(g.clone().applyQuaternion(this.quaternion).add(this.position));
    return out;
  }

  // Copy the physics state onto the model, and size the engine flames
  sync() {
    const g = this.model.group;
    g.position.copy(this.position);
    g.quaternion.copy(this.quaternion);
    const flicker = 0.85 + Math.random() * 0.3;
    for (const f of this.model.flames) {
      f.visible = this.throttle > 0.02 && !this.destroyed;
      f.scale.set(1, Math.max(this.throttle, 0.25) * flicker * 1.4, 1);
    }
  }
}
