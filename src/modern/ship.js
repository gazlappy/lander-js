import * as THREE from 'three';
import { PHYSICS } from './config.js';
import { heightAt } from './terrain.js';
import { padAt, BASE_BY_ID } from './bases.js';
import { buildCraft } from './models.js';
import { clamp } from './noise.js';

// The player's ship. Steering works like the 1987 original: you choose a
// tilt direction and amount (with the mouse or keys), and the engine
// pushes along the tilted ship's floor. Hover mode holds altitude for you.

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const nearby = [];

export class Ship {
  constructor(scene, craft) {
    this.scene = scene;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.tilt = new THREE.Vector2();      // tilt as a vector in the ground plane
    this.yaw = 0;
    this.up = new THREE.Vector3(0, 1, 0);
    this.forward = new THREE.Vector3(0, 0, 1);
    this.quaternion = new THREE.Quaternion();
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
  reset(position, yaw) {
    this.position.copy(position);
    this.position.y = heightAt(position.x, position.z) + this.model.gear;
    this.velocity.set(0, 0, 0);
    this.tilt.set(0, 0);
    this.yaw = yaw;
    this.hull = this.craft.hull;
    this.fuel = this.craft.fuel;
    this.landed = true;
    this.destroyed = false;
    this.throttle = 0;
    this.gunCooldown = 0;
    this.cargo = [];
    this.pad = padAt(this.position.x, this.position.z);
    this.updateOrientation();
    this.sync();
  }

  get altitude() {
    return this.position.y - this.model.gear - Math.max(heightAt(this.position.x, this.position.z), 0);
  }

  get tiltAngle() {
    return this.tilt.length();
  }

  // controls: { aimX, aimZ (world-space -1..1), thrust, hover, fire }
  // Returns a list of events: 'landed', 'crash', 'destroyed', 'scrape'
  update(dt, controls, game) {
    const events = [];
    if (this.destroyed) return events;
    const c = this.craft;

    // Ease the tilt towards where the controls point
    const target = tmpV.set(controls.aimX, 0, controls.aimZ);
    if (target.length() > 1) target.normalize();
    target.multiplyScalar(c.maxTilt);
    if (this.landed && !controls.thrust && !controls.hover) target.set(0, 0, 0);
    const k = Math.min(1, c.tiltRate * dt);
    this.tilt.x += (target.x - this.tilt.x) * k;
    this.tilt.y += (target.z - this.tilt.y) * k;

    // Turn the nose towards the direction of travel, or of the tilt
    const flat = Math.hypot(this.velocity.x, this.velocity.z);
    if (flat > 3 || this.tilt.length() > 0.15) {
      const desired = flat > 3 ? Math.atan2(this.velocity.x, this.velocity.z) : Math.atan2(this.tilt.x, this.tilt.y);
      let d = desired - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += clamp(d, -c.yawRate * dt, c.yawRate * dt);
    }
    this.updateOrientation();

    // Engine
    let thrust = 0;
    if (this.fuel > 0) {
      if (controls.thrust) {
        thrust = c.thrust;
        this.fuel -= c.burnFull * dt;
      } else if (controls.hover) {
        // Hover assist: just enough thrust to cancel gravity and any climb or sink
        const needed = (PHYSICS.gravity - this.velocity.y * 1.6) / Math.max(this.up.y, 0.25);
        thrust = clamp(needed, 0, c.hover * 1.5);
        this.fuel -= c.burnHover * (thrust / c.hover) * dt;
      }
      if (this.position.y > 650) thrust *= 0.4;
    }
    this.fuel = Math.max(this.fuel, 0);
    this.throttle = thrust / c.thrust;

    if (this.landed && thrust * this.up.y < PHYSICS.gravity + 0.5) {
      this.velocity.set(0, 0, 0);
      this.serviceAtPad(dt, game);
      this.sync();
      return events;
    }
    if (this.landed) { this.landed = false; this.pad = null; events.push('takeoff'); }

    const a = tmpV.copy(this.up).multiplyScalar(thrust);
    a.y -= PHYSICS.gravity;
    a.addScaledVector(this.velocity, -c.drag);
    this.velocity.addScaledVector(a, dt);
    this.position.addScaledVector(this.velocity, dt);

    this.collideWithGround(events, game);
    if (!this.destroyed) this.collideWithObjects(events, game);
    this.sync();
    return events;
  }

  updateOrientation() {
    const t = this.tilt.length();
    if (t > 1e-5) {
      this.up.set(Math.sin(t) * (this.tilt.x / t), Math.cos(t), Math.sin(t) * (this.tilt.y / t));
    } else {
      this.up.set(0, 1, 0);
    }
    tmpQ.setFromUnitVectors(UP, this.up);
    this.quaternion.setFromAxisAngle(UP, this.yaw).premultiply(tmpQ);
    this.forward.set(0, 0, 1).applyQuaternion(this.quaternion);
  }

  collideWithGround(events, game) {
    const ground = heightAt(this.position.x, this.position.z);
    const floor = Math.max(ground, 0) + this.model.gear;
    if (this.position.y > floor) return;
    if (ground < 0) {
      // Into the sea
      this.position.y = floor;
      this.destroy(events, 'splash');
      return;
    }
    const speed = this.velocity.length();
    const tilt = this.tiltAngle;
    this.position.y = floor;
    if (speed <= PHYSICS.landingSpeed && tilt <= PHYSICS.landingTilt) {
      this.velocity.set(0, 0, 0);
      this.landed = true;
      this.pad = padAt(this.position.x, this.position.z);
      events.push('landed');
      return;
    }
    const damage = Math.max(speed - PHYSICS.landingSpeed, 2) * PHYSICS.crashDamagePerMs + (tilt > PHYSICS.landingTilt ? 12 : 0);
    this.damage(damage, events);
    this.velocity.y = Math.abs(this.velocity.y) * 0.35;
    this.velocity.x *= 0.5;
    this.velocity.z *= 0.5;
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
      const speed = this.velocity.length();
      this.damage(10 + speed * 4, events);
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

  // Sitting on a friendly pad slowly refuels and repairs the ship
  serviceAtPad(dt, game) {
    if (!this.pad) return;
    const base = BASE_BY_ID[this.pad.base];
    if (!base || base.kind === 'hostile') return;
    this.fuel = Math.min(this.craft.fuel, this.fuel + this.craft.fuel * 0.18 * dt);
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
