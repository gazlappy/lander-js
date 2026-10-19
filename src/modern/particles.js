import * as THREE from 'three';
import { heightAt } from './terrain.js';

// Point-sprite particles: one additive system for fire, sparks and tracers
// and one normally-blended system for smoke, dust, debris and spray. Each
// particle fades and grows over its life; some bounce off the ground.

const VERT = /* glsl */`
  attribute float size;
  attribute vec4 tint;
  varying vec4 vTint;
  uniform float scale;
  void main() {
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */`
  varying vec4 vTint;
  uniform float soft;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = dot(p, p);
    if (d > 1.0) discard;
    float a = mix(1.0, 1.0 - d, soft);
    gl_FragColor = vec4(vTint.rgb, vTint.a * a);
  }
`;

// Particle behaviour flags
export const BOUNCE = 1;      // bounces off the ground (else stops)
export const DIE_ON_GROUND = 2;
export const FLOAT = 4;       // ignores gravity

class PointSystem {
  constructor(scene, capacity, blending, soft) {
    this.capacity = capacity;
    this.count = 0;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size0 = new Float32Array(capacity);
    this.size1 = new Float32Array(capacity);
    this.c0 = new Float32Array(capacity * 4);
    this.c1 = new Float32Array(capacity * 4);
    this.drag = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.flags = new Uint8Array(capacity);
    this.geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    this.tintAttr = new THREE.BufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('size', this.sizeAttr);
    this.geometry.setAttribute('tint', this.tintAttr);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { scale: { value: 600 }, soft: { value: soft } },
      transparent: true, depthWrite: false, blending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  add(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, drag = 0, gravity = 1, flags = 0) {
    let i;
    if (this.count < this.capacity) i = this.count++;
    else i = Math.floor(Math.random() * this.capacity);   // full: recycle one at random
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = this.maxLife[i] = life;
    this.size0[i] = s0; this.size1[i] = s1;
    this.c0.set(c0, i * 4); this.c1.set(c1, i * 4);
    this.drag[i] = drag; this.gravity[i] = gravity; this.flags[i] = flags;
  }

  update(dt, g) {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); continue; }
      const k = i * 3;
      const drag = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= drag; this.vel[k + 1] *= drag; this.vel[k + 2] *= drag;
      if (!(this.flags[i] & FLOAT)) this.vel[k + 1] -= g * this.gravity[i] * dt;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.flags[i] & (BOUNCE | DIE_ON_GROUND)) {
        const ground = Math.max(heightAt(this.pos[k], this.pos[k + 2]), 0);
        if (this.pos[k + 1] < ground) {
          if (this.flags[i] & DIE_ON_GROUND) { this.kill(i); continue; }
          this.pos[k + 1] = ground;
          this.vel[k + 1] = Math.abs(this.vel[k + 1]) * 0.35;
          this.vel[k] *= 0.6; this.vel[k + 2] *= 0.6;
        }
      }
      i++;
    }
    const pa = this.posAttr.array, sa = this.sizeAttr.array, ta = this.tintAttr.array;
    for (let j = 0; j < this.count; j++) {
      const t = 1 - this.life[j] / this.maxLife[j];
      pa[j * 3] = this.pos[j * 3]; pa[j * 3 + 1] = this.pos[j * 3 + 1]; pa[j * 3 + 2] = this.pos[j * 3 + 2];
      sa[j] = this.size0[j] + (this.size1[j] - this.size0[j]) * t;
      for (let c = 0; c < 4; c++) ta[j * 4 + c] = this.c0[j * 4 + c] + (this.c1[j * 4 + c] - this.c0[j * 4 + c]) * t;
    }
    this.geometry.setDrawRange(0, this.count);
    this.posAttr.needsUpdate = this.sizeAttr.needsUpdate = this.tintAttr.needsUpdate = true;
    this.posAttr.clearUpdateRanges(); this.posAttr.addUpdateRange(0, this.count * 3);
    this.sizeAttr.clearUpdateRanges(); this.sizeAttr.addUpdateRange(0, this.count);
    this.tintAttr.clearUpdateRanges(); this.tintAttr.addUpdateRange(0, this.count * 4);
  }

  // Swap-remove particle i
  kill(i) {
    const last = --this.count;
    if (i === last) return;
    this.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.c0.copyWithin(i * 4, last * 4, last * 4 + 4);
    this.c1.copyWithin(i * 4, last * 4, last * 4 + 4);
    this.life[i] = this.life[last]; this.maxLife[i] = this.maxLife[last];
    this.size0[i] = this.size0[last]; this.size1[i] = this.size1[last];
    this.drag[i] = this.drag[last]; this.gravity[i] = this.gravity[last]; this.flags[i] = this.flags[last];
  }

  clear() { this.count = 0; }

  setScale(pixelHeight) { this.material.uniforms.scale.value = pixelHeight; }
}

const rand = (a, b) => a + Math.random() * (b - a);
const spread = (s) => (Math.random() - 0.5) * 2 * s;

export class Particles {
  constructor(scene) {
    this.glow = new PointSystem(scene, 6000, THREE.AdditiveBlending, 0.8);
    this.smoke = new PointSystem(scene, 5000, THREE.NormalBlending, 1.0);
    this.gravity = 9;
  }

  setViewport(height, fovDeg) {
    const scale = height / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
    this.glow.setScale(scale);
    this.smoke.setScale(scale);
  }

  update(dt) {
    this.glow.update(dt, this.gravity);
    this.smoke.update(dt, this.gravity);
  }

  clear() { this.glow.clear(); this.smoke.clear(); }

  // Engine exhaust from a nozzle, blowing out along `dir` (unit, world)
  exhaust(p, dir, shipVel, power) {
    const speed = 22 + 18 * power;
    this.glow.add(p.x, p.y, p.z,
      shipVel.x + dir.x * speed + spread(3), shipVel.y + dir.y * speed + spread(3), shipVel.z + dir.z * speed + spread(3),
      rand(0.18, 0.32), 1.6 + power, 0.4, [1.0, 0.75, 0.35, 0.9], [0.9, 0.2, 0.05, 0], 2.5, 0.2, DIE_ON_GROUND);
    if (Math.random() < 0.12 + power * 0.1) {
      this.smoke.add(p.x, p.y, p.z,
        shipVel.x * 0.5 + dir.x * speed * 0.4 + spread(2), shipVel.y * 0.5 + dir.y * speed * 0.4, shipVel.z * 0.5 + dir.z * speed * 0.4 + spread(2),
        rand(0.7, 1.3), 1.0, 4, [0.6, 0.6, 0.6, 0.22], [0.7, 0.7, 0.7, 0], 1.5, -0.08, BOUNCE);
    }
  }

  // Dust kicked up when the exhaust is near the ground
  dust(x, y, z, strength) {
    const a = Math.random() * Math.PI * 2;
    const v = 8 + Math.random() * 10 * strength;
    this.smoke.add(x, y + 0.3, z, Math.cos(a) * v, 1 + Math.random() * 2, Math.sin(a) * v,
      rand(0.8, 1.6), 1.5, 6, [0.55, 0.5, 0.4, 0.45], [0.6, 0.56, 0.48, 0], 1.6, 0.05, BOUNCE);
  }

  tracer(p, colour = [1, 0.9, 0.5, 1]) {
    this.glow.add(p.x, p.y, p.z, 0, 0, 0, 0.06, 1.3, 0.5, colour, [colour[0], colour[1] * 0.5, colour[2] * 0.3, 0], 0, 0, FLOAT);
  }

  smokePuff(x, y, z, size = 4, dark = 0.25) {
    this.smoke.add(x + spread(1), y, z + spread(1), spread(1.2), rand(2.5, 4.5), spread(1.2),
      rand(3, 5.5), size, size * 3.2, [dark, dark, dark, 0.6], [dark + 0.2, dark + 0.2, dark + 0.2, 0], 0.4, -0.06, FLOAT);
  }

  // A fireball, sparks, debris and smoke. `size` 1 is a tree going up.
  explosion(x, y, z, size = 1) {
    const n = Math.round(30 * size);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(spread(1), Math.random(), spread(1)).normalize().multiplyScalar(rand(4, 22) * Math.sqrt(size));
      this.glow.add(x, y, z, v.x, v.y, v.z, rand(0.3, 0.8), rand(3, 6) * Math.sqrt(size), 1,
        [1, 0.85, 0.45, 1], [0.8, 0.15, 0.02, 0], 3, 0.3, 0);
    }
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(spread(1), rand(0.3, 1.2), spread(1)).normalize().multiplyScalar(rand(10, 40) * Math.sqrt(size));
      this.glow.add(x, y, z, v.x, v.y, v.z, rand(0.6, 1.6), 0.7, 0.3, [1, 0.95, 0.7, 1], [1, 0.3, 0.05, 0], 0.5, 1, BOUNCE);
    }
    for (let i = 0; i < n * 0.6; i++) {
      const v = new THREE.Vector3(spread(1), rand(0.4, 1.4), spread(1)).normalize().multiplyScalar(rand(6, 24) * Math.sqrt(size));
      this.smoke.add(x, y, z, v.x, v.y, v.z, rand(1.5, 3), 0.9, 0.7, [0.3, 0.25, 0.2, 1], [0.25, 0.22, 0.2, 1], 0.3, 1, BOUNCE);
    }
    for (let i = 0; i < n * 0.7; i++) {
      this.smoke.add(x + spread(2 * size), y + spread(1), z + spread(2 * size), spread(4), rand(1, 6), spread(4),
        rand(2, 4.5), 3 * Math.sqrt(size), 12 * Math.sqrt(size), [0.18, 0.16, 0.15, 0.75], [0.4, 0.4, 0.4, 0], 0.8, -0.05, FLOAT);
    }
  }

  // Bullet hitting the ground
  impact(x, y, z) {
    for (let i = 0; i < 6; i++) {
      this.glow.add(x, y, z, spread(8), rand(2, 10), spread(8), rand(0.2, 0.4), 1.2, 0.3, [1, 0.8, 0.4, 1], [1, 0.3, 0.1, 0], 1, 1, BOUNCE);
    }
    this.smoke.add(x, y, z, 0, 2, 0, 0.9, 1, 3.5, [0.45, 0.4, 0.35, 0.6], [0.5, 0.48, 0.45, 0], 1, 0, FLOAT);
  }

  splash(x, z, size = 1) {
    const n = Math.round(20 * size);
    for (let i = 0; i < n; i++) {
      this.smoke.add(x + spread(size), 0.2, z + spread(size), spread(5) * size, rand(5, 14) * Math.sqrt(size), spread(5) * size,
        rand(0.8, 1.5), 1.2, 2.5, [0.8, 0.9, 1, 0.8], [0.9, 0.95, 1, 0], 0.5, 1, DIE_ON_GROUND);
    }
  }

  // A burning meteor's trail
  meteorTrail(p) {
    this.glow.add(p.x + spread(0.6), p.y, p.z + spread(0.6), spread(2), spread(2), spread(2), rand(0.3, 0.6), 4, 1.5,
      [1, 0.7, 0.3, 1], [0.8, 0.1, 0, 0], 1, 0, FLOAT);
    if (Math.random() < 0.5) this.smoke.add(p.x, p.y, p.z, 0, 1, 0, rand(2, 3.5), 3, 9, [0.3, 0.28, 0.25, 0.5], [0.5, 0.5, 0.5, 0], 0.5, 0, FLOAT);
  }
}
