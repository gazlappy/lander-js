import * as THREE from 'three';
import { heightAt } from './terrain.js';

// Third-person camera. In "classic" mode it keeps a fixed heading, like
// the original's view, so screen directions always match world directions.
// In "chase" mode it swings round behind the ship as it turns.

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'classic';
    this.heading = 0;           // camera yaw: 0 looks along +z
    this.distance = 34;
    this.height = 14;
    this.position = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.shake = 0;
  }

  snapTo(ship) {
    this.heading = this.mode === 'chase' ? ship.yaw : 0;
    this.update(1, ship, true);
  }

  update(dt, ship, snap = false) {
    if (this.mode === 'chase') {
      let d = ship.yaw - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * 1.6);
    } else {
      this.heading += (0 - this.heading) * Math.min(1, dt * 3);
    }
    const speed = ship.velocity.length();
    const back = this.distance + speed * 0.25;
    const want = new THREE.Vector3(
      ship.position.x - Math.sin(this.heading) * back,
      ship.position.y + this.height + speed * 0.06,
      ship.position.z - Math.cos(this.heading) * back,
    );
    // Lag behind a little, but never so far the ship leaves the screen
    const k = snap ? 1 : 1 - Math.exp(-dt * 5);
    this.position.lerp(want, k);
    const floor = Math.max(heightAt(this.position.x, this.position.z), 0) + 4;
    if (this.position.y < floor) this.position.y = floor;
    const ahead = new THREE.Vector3().copy(ship.velocity).multiplyScalar(0.18);
    ahead.y *= 0.4;
    const target = new THREE.Vector3().copy(ship.position).add(ahead);
    this.lookAt.lerp(target, snap ? 1 : 1 - Math.exp(-dt * 8));
    this.camera.position.copy(this.position);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 4);
    }
    this.camera.lookAt(this.lookAt);
  }

  // Turn a screen-space aim (right, up) into world x/z for the controls
  toWorld(right, up) {
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    // Camera forward is (s, c) on the ground; its right is (-c, s)
    return [right * -c + up * s, right * s + up * c];
  }
}
