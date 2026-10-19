import * as THREE from 'three';
import { PLAYER_SHIP } from '../retro/world/blueprints.js';

// Procedural low-poly models. Each model is assembled from simple shapes,
// flattened into one geometry with per-vertex colours so it draws in a
// single call (and can be instanced for scenery).

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();

class ModelBuilder {
  constructor() {
    this.parts = [];
  }

  // Add a shape with a colour (hex), position, rotation (Euler radians)
  // and scale
  add(geometry, colour, { at = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    tmpEuler.set(rot[0], rot[1], rot[2]);
    tmpQuat.setFromEuler(tmpEuler);
    tmpMatrix.compose(new THREE.Vector3(...at), tmpQuat, new THREE.Vector3(...scale));
    g.applyMatrix4(tmpMatrix);
    const c = new THREE.Color(colour);
    const n = g.attributes.position.count;
    const colours = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { colours[i * 3] = c.r; colours[i * 3 + 1] = c.g; colours[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(key)) g.deleteAttribute(key);
    this.parts.push(g);
    return this;
  }

  build() {
    let total = 0;
    for (const p of this.parts) total += p.attributes.position.count;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    let o = 0;
    for (const p of this.parts) {
      pos.set(p.attributes.position.array, o * 3);
      nor.set(p.attributes.normal.array, o * 3);
      col.set(p.attributes.color.array, o * 3);
      o += p.attributes.position.count;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export const sceneryMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0.05 });
export const hullMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.42, metalness: 0.45 });
export const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x1b2a3a, roughness: 0.08, metalness: 0.9, emissive: 0x0a2840, emissiveIntensity: 0.6 });

export function glowMaterial(colour, intensity = 3) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(colour).multiplyScalar(intensity), toneMapped: false });
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
const cone = (r, h, seg = 8) => new THREE.ConeGeometry(r, h, seg);
const ico = (r, detail = 0) => new THREE.IcosahedronGeometry(r, detail);

// --- Crafts --------------------------------------------------------------------
// Crafts face +z with +y up. Each returns the mesh plus where its engines
// and guns are, in local coordinates.

function classicHull() {
  // The 1987 ship's own vertices: original x (forwards) becomes z, original
  // y (down) becomes -y, original z becomes x, scaled up to metres
  const s = 4.2;
  const v = PLAYER_SHIP.vertices.map(([x, y, z]) => new THREE.Vector3(z * s, -y * s, x * s - 0.5));
  const b = new ModelBuilder();
  for (const face of PLAYER_SHIP.faces) {
    const [i, j, k] = face.vertices;
    const g = new THREE.BufferGeometry().setFromPoints([v[i], v[j], v[k], v[i], v[k], v[j]]);
    g.computeVertexNormals();
    const r = ((face.colour >> 8) & 15) / 15, gr = ((face.colour >> 4) & 15) / 15, bl = (face.colour & 15) / 15;
    const colour = new THREE.Color(0.25 + r * 0.6, 0.25 + gr * 0.6, 0.25 + bl * 0.6);
    b.add(g, colour);
  }
  return b;
}

export const CRAFT_MODELS = {
  classic() {
    const b = classicHull();
    b.add(cyl(0.55, 0.85, 0.9), 0x555c66, { at: [0, -0.9, -0.3] });
    b.add(box(0.25, 1.4, 0.25), 0x444a52, { at: [1.6, -1.2, 1.2], rot: [0, 0, 0.25] });
    b.add(box(0.25, 1.4, 0.25), 0x444a52, { at: [-1.6, -1.2, 1.2], rot: [0, 0, -0.25] });
    b.add(box(0.25, 1.4, 0.25), 0x444a52, { at: [0, -1.2, -2.6], rot: [-0.25, 0, 0] });
    return { geometry: b.build(), cockpit: [0, 0.9, 1.6, 0.7], nozzles: [[0, -1.45, -0.3]], guns: [[0, 0.1, 3.8]], gear: 1.95 };
  },
  hopper() {
    const b = new ModelBuilder();
    b.add(new THREE.SphereGeometry(1.6, 10, 7), 0xe0a020, { scale: [1, 0.75, 1.1] });
    b.add(cyl(1.3, 1.7, 0.5, 12), 0x3a3f46, { at: [0, -0.9, 0] });
    b.add(cyl(0.6, 0.9, 1.0, 10), 0x2c3036, { at: [0, -1.5, 0] });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.add(box(0.18, 2.2, 0.18), 0x5a6068, { at: [Math.cos(a) * 1.7, -1.6, Math.sin(a) * 1.7], rot: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35] });
      b.add(cyl(0.35, 0.35, 0.12, 8), 0x2c3036, { at: [Math.cos(a) * 2.1, -2.65, Math.sin(a) * 2.1] });
    }
    b.add(box(0.2, 0.2, 1.2), 0x30343a, { at: [0, -0.2, 1.8] });
    return { geometry: b.build(), cockpit: [0, 0.65, 0.9, 0.75], nozzles: [[0, -2.05, 0]], guns: [[0, -0.2, 2.5]], gear: 2.7 };
  },
  hauler() {
    const b = new ModelBuilder();
    b.add(box(3.0, 1.8, 7.5), 0x3d6a8f, { at: [0, 0.6, 0] });
    b.add(box(2.6, 1.2, 2.0), 0x325a7a, { at: [0, 1.0, 3.7], rot: [0.35, 0, 0] });
    b.add(box(2.4, 1.6, 4.6), 0xb06a2a, { at: [0, -1.0, -0.4] });            // cargo pod
    b.add(box(2.5, 0.2, 4.7), 0x6a3f19, { at: [0, -0.15, -0.4] });
    for (const [x, z] of [[-2.2, 2.4], [2.2, 2.4], [-2.2, -2.8], [2.2, -2.8]]) {
      b.add(cyl(0.65, 0.8, 1.6, 10), 0x2e3238, { at: [x, 0.2, z] });
      b.add(box(1.2, 0.3, 0.4), 0x50565e, { at: [x * 0.75, 0.6, z] });
      b.add(box(0.2, 1.6, 0.2), 0x50565e, { at: [x * 0.8, -1.4, z] });
    }
    return {
      geometry: b.build(), cockpit: [0, 1.5, 4.3, 0.9],
      nozzles: [[-2.2, -0.7, 2.4], [2.2, -0.7, 2.4], [-2.2, -0.7, -2.8], [2.2, -0.7, -2.8]],
      guns: [[0, 0.3, 4.8]], gear: 2.2,
    };
  },
  striker() {
    const b = new ModelBuilder();
    const wing = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 4.5), new THREE.Vector3(4.2, -0.2, -2.6), new THREE.Vector3(-4.2, -0.2, -2.6),
      new THREE.Vector3(0, 0, 4.5), new THREE.Vector3(-4.2, -0.2, -2.6), new THREE.Vector3(4.2, -0.2, -2.6),
    ]);
    wing.computeVertexNormals();
    b.add(wing, 0x7a1c22);
    b.add(cone(0.9, 6.5, 6), 0x2b2f36, { at: [0, 0.35, 0.8], rot: [Math.PI / 2, 0, 0] });
    b.add(box(0.15, 1.6, 1.6), 0x7a1c22, { at: [0, 1.0, -2.2] });
    for (const x of [-1.5, 1.5]) {
      b.add(cyl(0.5, 0.6, 1.4, 8), 0x23262b, { at: [x, -0.55, -1.4] });
      b.add(box(0.14, 0.14, 2.0), 0x1a1c20, { at: [x * 1.6, -0.25, 1.0] });
      b.add(box(0.15, 1.2, 0.15), 0x50565e, { at: [x, -1.2, 0.4] });
    }
    return {
      geometry: b.build(), cockpit: [0, 0.75, 1.6, 0.6],
      nozzles: [[-1.5, -1.3, -1.4], [1.5, -1.3, -1.4]], guns: [[-2.4, -0.25, 2.1], [2.4, -0.25, 2.1]], gear: 1.75,
    };
  },
};

// Assemble a craft model: hull, glass canopy and engine flames
export function buildCraft(id) {
  const spec = CRAFT_MODELS[id]();
  const group = new THREE.Group();
  const hull = new THREE.Mesh(spec.geometry, hullMaterial);
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);
  const [cx, cy, cz, cr] = spec.cockpit;
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(cr, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glassMaterial);
  canopy.position.set(cx, cy, cz);
  canopy.scale.set(1, 0.8, 1.5);
  group.add(canopy);
  const flames = spec.nozzles.map(([x, y, z]) => {
    const flame = new THREE.Mesh(cone(0.55, 2.6, 10), glowMaterial(0xffa040, 4));
    flame.geometry.rotateX(Math.PI);
    flame.geometry.translate(0, -1.3, 0);
    flame.position.set(x, y, z);
    flame.visible = false;
    group.add(flame);
    return flame;
  });
  return { group, flames, nozzles: spec.nozzles.map((n) => new THREE.Vector3(...n)), guns: spec.guns.map((g) => new THREE.Vector3(...g)), gear: spec.gear };
}

// --- Scenery (instanced) ---------------------------------------------------------

export const SCENERY = {
  pine: () => new ModelBuilder()
    .add(cyl(0.25, 0.4, 3, 6), 0x5a3a22, { at: [0, 1.5, 0] })
    .add(cone(2.4, 4.5, 7), 0x1f5a2c, { at: [0, 4.4, 0] })
    .add(cone(1.8, 3.6, 7), 0x26693a, { at: [0, 6.3, 0] })
    .add(cone(1.1, 2.6, 7), 0x2f7a44, { at: [0, 7.9, 0] }).build(),
  broadleaf: () => new ModelBuilder()
    .add(cyl(0.3, 0.5, 3.4, 6), 0x60412a, { at: [0, 1.7, 0] })
    .add(ico(2.6, 1), 0x3d7d34, { at: [0, 5.2, 0], scale: [1, 0.85, 1] })
    .add(ico(1.6, 0), 0x4a9140, { at: [1.2, 6.1, 0.6] }).build(),
  rock: () => new ModelBuilder()
    .add(new THREE.DodecahedronGeometry(1.6, 0), 0x77736c, { scale: [1.3, 0.7, 1] }).build(),
  house: () => new ModelBuilder()
    .add(box(7, 4, 6), 0xd8d0bc, { at: [0, 2, 0] })
    .add(cyl(0.01, 4.9, 2.6, 4), 0xa0402c, { at: [0, 5.3, 0], rot: [0, Math.PI / 4, 0], scale: [1.05, 1, 0.9] })
    .add(box(1.2, 2, 0.1), 0x4a3424, { at: [0, 1, 3.02] })
    .add(box(1.2, 1, 0.1), 0x6fa0c8, { at: [2.2, 2.4, 3.02] }).build(),
  tower: () => new ModelBuilder()
    .add(cyl(1.2, 1.8, 14, 8), 0xbcbcc4, { at: [0, 7, 0] })
    .add(cyl(2.4, 2.4, 2.2, 8), 0x44484e, { at: [0, 15, 0] })
    .add(cone(0.2, 3, 4), 0xcc3333, { at: [0, 17.6, 0] }).build(),
  tank: () => new ModelBuilder()
    .add(cyl(3.2, 3.2, 6, 14), 0xe2e2e6, { at: [0, 3, 0] })
    .add(new THREE.SphereGeometry(3.2, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xcfcfd4, { at: [0, 6, 0] })
    .add(box(0.4, 6, 0.4), 0x666a70, { at: [3.3, 3, 0] }).build(),
  hangar: () => new ModelBuilder()
    .add(new THREE.CylinderGeometry(9, 9, 22, 16, 1, false, 0, Math.PI), 0x8c939c, { at: [0, 0, 0], rot: [Math.PI / 2, Math.PI / 2, 0] })
    .add(box(14, 7, 0.4), 0x2a2e33, { at: [0, 3.5, 11] }).build(),
  rocket: () => new ModelBuilder()
    .add(cyl(1.1, 1.1, 11, 10), 0xe8e4dc, { at: [0, 6.5, 0] })
    .add(cone(1.1, 3.4, 10), 0xd23a2a, { at: [0, 13.7, 0] })
    .add(cyl(1.1, 1.1, 1.0, 10), 0xd23a2a, { at: [0, 3.0, 0] })
    .add(cone(1.4, 1.6, 10), 0x3a3e44, { at: [0, 0.8, 0], rot: [Math.PI, 0, 0] })
    .add(box(0.15, 3, 2.2), 0xe0c020, { at: [1.6, 2.6, 0] })
    .add(box(0.15, 3, 2.2), 0xe0c020, { at: [-1.6, 2.6, 0] })
    .add(box(2.2, 3, 0.15), 0xe0c020, { at: [0, 2.6, 1.6] })
    .add(box(2.2, 3, 0.15), 0xe0c020, { at: [0, 2.6, -1.6] }).build(),
  radar: () => new ModelBuilder()
    .add(box(4, 3, 4), 0x5a2a28, { at: [0, 1.5, 0] })
    .add(cyl(0.4, 0.4, 4, 6), 0x3a3a3a, { at: [0, 5, 0] })
    .add(new THREE.SphereGeometry(3.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 3.2), 0xc8c8c8, { at: [0, 6.5, 0], rot: [-0.9, 0, 0] }).build(),
  crate: () => new ModelBuilder()
    .add(box(2.4, 2.4, 2.4), 0xb07a30, { at: [0, 1.2, 0] })
    .add(box(2.5, 0.3, 2.5), 0x6a4a1c, { at: [0, 1.2, 0] }).build(),
  wreck: () => new ModelBuilder()
    .add(new THREE.DodecahedronGeometry(1.4, 0), 0x2a2522, { at: [0, 0.6, 0], scale: [1.6, 0.6, 1.2] })
    .add(box(0.4, 2.6, 0.4), 0x1d1a18, { at: [0.6, 1.2, 0.2], rot: [0.3, 0, 0.4] }).build(),
};

// Collision shape and toughness for each scenery type
export const SCENERY_INFO = {
  pine: { radius: 2.0, height: 9, hp: 1, points: 10 },
  broadleaf: { radius: 2.4, height: 7.5, hp: 1, points: 10 },
  rock: { radius: 2.0, height: 2, hp: 4, points: 5 },
  house: { radius: 4.5, height: 7, hp: 3, points: 40 },
  tower: { radius: 2.4, height: 18, hp: 4, points: 50 },
  tank: { radius: 3.4, height: 9, hp: 3, points: 60 },
  hangar: { radius: 10, height: 9, hp: 8, points: 120 },
  rocket: { radius: 1.6, height: 15, hp: 2, points: 80 },
  radar: { radius: 3.2, height: 9, hp: 4, points: 150 },
  crate: { radius: 1.6, height: 2.4, hp: 99, points: 0 },
  wreck: { radius: 1.5, height: 1.5, hp: 99, points: 0 },
};

// --- Enemies and mission props ------------------------------------------------------

export function buildTurret() {
  const base = new THREE.Mesh(new ModelBuilder()
    .add(cyl(2.4, 3.0, 1.6, 8), 0x3b3f36, { at: [0, 0.8, 0] })
    .add(box(3.4, 0.4, 3.4), 0x2c2f28, { at: [0, 0.2, 0] }).build(), sceneryMaterial);
  const head = new THREE.Group();
  head.position.y = 2.2;
  const headMesh = new THREE.Mesh(new ModelBuilder()
    .add(new THREE.SphereGeometry(1.6, 10, 6), 0x55604a, { scale: [1, 0.8, 1] })
    .add(box(0.5, 0.5, 3.6), 0x1f211c, { at: [0.5, 0.3, 1.8] })
    .add(box(0.5, 0.5, 3.6), 0x1f211c, { at: [-0.5, 0.3, 1.8] }).build(), sceneryMaterial);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), glowMaterial(0xff2020, 5));
  eye.position.set(0, 0.6, 1.2);
  head.add(headMesh, eye);
  const group = new THREE.Group();
  group.add(base, head);
  base.castShadow = headMesh.castShadow = true;
  return { group, head };
}

export function buildDrone() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new ModelBuilder()
    .add(new THREE.SphereGeometry(1.8, 12, 6), 0x2e3136, { scale: [1, 0.45, 1] })
    .add(cyl(0.9, 1.2, 0.8, 10), 0x45494f, { at: [0, 0.6, 0] })
    .add(box(5.4, 0.2, 0.6), 0x2a2c30, { at: [0, 0, 0] })
    .add(box(0.6, 0.2, 5.4), 0x2a2c30, { at: [0, 0, 0] }).build(), hullMaterial);
  body.castShadow = true;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), glowMaterial(0xff3018, 6));
  eye.position.set(0, -0.3, 1.5);
  group.add(body, eye);
  for (const [x, z] of [[2.7, 0], [-2.7, 0], [0, 2.7], [0, -2.7]]) {
    const rotor = new THREE.Mesh(cyl(1.1, 1.1, 0.05, 12), new THREE.MeshBasicMaterial({ color: 0x9aa0a8, transparent: true, opacity: 0.35 }));
    rotor.position.set(x, 0.25, z);
    group.add(rotor);
  }
  return group;
}

export function buildRing() {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 0.7, 8, 32), glowMaterial(0x40c8ff, 2.5));
  return ring;
}

// A tall glowing column marking an objective
export function buildBeacon(colour = 0x40ff90) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 160, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 80;
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.4), glowMaterial(colour, 4));
  core.position.y = 4;
  group.add(beam, core);
  group.userData.core = core;
  return group;
}

// A landing pad with a painted H and edge lights
export function buildPad(size, lightColour = 0x50ff80) {
  const group = new THREE.Group();
  const deck = new THREE.Mesh(new ModelBuilder()
    .add(box(size, 0.6, size), 0x5c6168, { at: [0, 0.3, 0] })
    .add(box(size - 2, 0.05, size - 2), 0x4a4f55, { at: [0, 0.62, 0] })
    .add(box(1.6, 0.06, size * 0.45), 0xe8e070, { at: [-size * 0.15, 0.66, 0] })
    .add(box(1.6, 0.06, size * 0.45), 0xe8e070, { at: [size * 0.15, 0.66, 0] })
    .add(box(size * 0.3, 0.06, 1.6), 0xe8e070, { at: [0, 0.66, 0] }).build(), sceneryMaterial);
  deck.receiveShadow = true;
  group.add(deck);
  const lightGeo = new THREE.SphereGeometry(0.35, 6, 4);
  const lightMat = glowMaterial(lightColour, 4);
  const half = size / 2 - 0.4;
  for (let i = 0; i < 4; i++) {
    for (let k = -2; k <= 2; k++) {
      const light = new THREE.Mesh(lightGeo, lightMat);
      const t = (k / 2) * half;
      const [x, z] = [[t, half], [t, -half], [half, t], [-half, t]][i];
      light.position.set(x, 0.75, z);
      group.add(light);
    }
  }
  group.userData.lightMaterial = lightMat;
  return group;
}
