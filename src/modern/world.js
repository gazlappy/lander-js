import * as THREE from 'three';
import { WORLD } from './config.js';
import { heightAt, groundColour, forestDensity } from './terrain.js';
import { hash2 } from './noise.js';
import { BASES, isNearBase } from './bases.js';
import { SCENERY, SCENERY_INFO, sceneryMaterial, buildPad } from './models.js';

// The streamed open world: terrain chunks around the camera, each with its
// own instanced scenery, plus the bases. Also answers "what's near here?"
// for collisions.

const SCENERY_RADIUS = 4;      // default chunks around the player that get scenery
const CELL = 11;               // scenery scatter grid in metres

function detailTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = 200 + 55 * (hash2(x, y, 9) * 0.6 + hash2(x >> 2, y >> 2, 3) * 0.4);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export class World {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.chunks = new Map();
    this.destroyed = new Set();
    this.terrainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.95, metalness: 0, map: detailTexture(),
    });
    this.sceneryGeometry = Object.fromEntries(Object.entries(SCENERY).map(([k, f]) => [k, f()]));
    this.staticObjects = [];
    this.wrecks = this.createWrecks();
    this.buildBases();
    this.centre = null;
  }

  setQuality(quality) {
    this.quality = quality;
    for (const chunk of this.chunks.values()) this.disposeChunk(chunk);
    this.chunks.clear();
  }

  // --- Bases -----------------------------------------------------------------

  buildBases() {
    const add = (type, x, z, rotY = 0, scale = 1) => {
      const y = heightAt(x, z);
      const mesh = new THREE.Mesh(this.sceneryGeometry[type], sceneryMaterial);
      mesh.position.set(x, y, z);
      mesh.rotation.y = rotY;
      mesh.scale.setScalar(scale);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
      const info = SCENERY_INFO[type];
      this.staticObjects.push({ type, x, y, z, radius: info.radius * scale, height: info.height * scale, alive: true, indestructible: true, mesh });
    };
    for (const base of BASES) {
      for (const pad of base.pads) {
        const mesh = buildPad(pad.size, base.kind === 'home' ? 0x50ff80 : 0x60c0ff);
        mesh.position.set(pad.x, pad.y, pad.z);
        this.scene.add(mesh);
        pad.mesh = mesh;
      }
      const { x, z } = base;
      if (base.kind === 'home') {
        add('hangar', x - 30, z - 58, 0);
        add('hangar', x + 30, z - 58, 0);
        add('tower', x + 70, z - 20);
        add('tank', x - 74, z + 20);
        add('tank', x - 74, z + 36);
        add('house', x + 62, z + 40, 0.3);
        // The three rockets beside the launchpad, as in the original
        for (const dx of [-22, 0, 22]) add('rocket', x + dx, z + 34);
      } else if (base.kind === 'outpost') {
        add('house', x + 26, z - 18, 0.6);
        add('tank', x - 26, z + 14);
        add('tower', x - 22, z - 24, 0, 0.8);
      }
    }
  }

  // --- Wreckage --------------------------------------------------------------

  createWrecks() {
    const mesh = new THREE.InstancedMesh(this.sceneryGeometry.wreck, sceneryMaterial, 600);
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    return { mesh, list: [] };
  }

  addWreck(x, y, z, scale) {
    const w = this.wrecks;
    if (w.mesh.count >= 600) return;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28),
      new THREE.Vector3(scale, scale, scale));
    w.mesh.setMatrixAt(w.mesh.count++, m);
    w.mesh.instanceMatrix.needsUpdate = true;
    w.list.push({ x, y, z, smokeTimer: 0 });
  }

  // --- Streaming -------------------------------------------------------------

  // Load and unload chunks around (x, z). Builds at most a few chunks per
  // call so flying fast never stalls a frame for long.
  update(x, z, budgetMs = 8) {
    const size = WORLD.chunkSize;
    const cx = Math.floor(x / size), cz = Math.floor(z / size);
    const radius = this.quality.viewChunks;
    const wanted = [];
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const d = Math.hypot(dx, dz);
        if (d > radius + 0.5) continue;
        wanted.push({ cx: cx + dx, cz: cz + dz, d });
      }
    }
    wanted.sort((a, b) => a.d - b.d);
    const keep = new Set();
    const started = performance.now();
    for (const w of wanted) {
      const key = `${w.cx},${w.cz}`;
      keep.add(key);
      const lod = w.d <= 2.5 ? 0 : w.d <= 5.5 ? 1 : 2;
      const scenery = w.d <= (this.quality.sceneryChunks ?? SCENERY_RADIUS);
      let chunk = this.chunks.get(key);
      if (chunk && chunk.lod === lod && chunk.hasScenery === scenery) continue;
      if (performance.now() - started > budgetMs) continue;
      if (chunk) {
        if (chunk.lod !== lod) this.rebuildTerrain(chunk, lod);
        if (chunk.hasScenery !== scenery) this.setScenery(chunk, scenery);
      } else {
        chunk = this.buildChunk(w.cx, w.cz, lod, scenery);
        this.chunks.set(key, chunk);
      }
    }
    for (const [key, chunk] of this.chunks) {
      if (!keep.has(key)) { this.disposeChunk(chunk); this.chunks.delete(key); }
    }
  }

  // True once the chunks right around (x, z) exist, for loading screens
  isReady(x, z) {
    const size = WORLD.chunkSize;
    const cx = Math.floor(x / size), cz = Math.floor(z / size);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!this.chunks.has(`${cx + dx},${cz + dz}`)) return false;
    return true;
  }

  buildChunk(cx, cz, lod, scenery) {
    const chunk = { cx, cz, lod: -1, terrain: null, hasScenery: false, objects: [], instanced: [] };
    this.rebuildTerrain(chunk, lod);
    this.setScenery(chunk, scenery);
    return chunk;
  }

  rebuildTerrain(chunk, lod) {
    if (chunk.terrain) { this.scene.remove(chunk.terrain); chunk.terrain.geometry.dispose(); }
    const segments = Math.max(4, this.quality.segments >> lod);
    chunk.terrain = new THREE.Mesh(terrainGeometry(chunk.cx, chunk.cz, segments), this.terrainMaterial);
    chunk.terrain.receiveShadow = this.quality.shadows;
    chunk.terrain.castShadow = false;
    this.scene.add(chunk.terrain);
    chunk.lod = lod;
  }

  setScenery(chunk, on) {
    for (const m of chunk.instanced) { this.scene.remove(m); m.dispose(); }
    chunk.instanced = [];
    chunk.objects = [];
    chunk.hasScenery = on;
    if (!on) return;
    const items = scatterScenery(chunk.cx, chunk.cz);
    const byType = {};
    items.forEach((item, i) => {
      item.key = `${chunk.cx},${chunk.cz},${i}`;
      item.alive = !this.destroyed.has(item.key);
      (byType[item.type] ||= []).push(item);
    });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const colour = new THREE.Color();
    for (const [type, list] of Object.entries(byType)) {
      const mesh = new THREE.InstancedMesh(this.sceneryGeometry[type], sceneryMaterial, list.length);
      mesh.castShadow = this.quality.shadows;
      mesh.receiveShadow = this.quality.shadows;
      list.forEach((item, i) => {
        q.setFromAxisAngle(up, item.rot);
        s.setScalar(item.alive ? item.scale : 0);
        p.set(item.x, item.y, item.z);
        mesh.setMatrixAt(i, m.compose(p, q, s));
        colour.setHSL(0, 0, 0.82 + item.tint * 0.3);
        mesh.setColorAt(i, colour);
        item.mesh = mesh;
        item.index = i;
      });
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
      chunk.instanced.push(mesh);
    }
    chunk.objects = items;
  }

  disposeChunk(chunk) {
    this.scene.remove(chunk.terrain);
    chunk.terrain.geometry.dispose();
    for (const m of chunk.instanced) { this.scene.remove(m); m.dispose(); }
  }

  // --- Queries -----------------------------------------------------------------

  // Every live object whose base is within `radius` of (x, z)
  objectsNear(x, z, radius, out = []) {
    out.length = 0;
    const size = WORLD.chunkSize;
    const x0 = Math.floor((x - radius - 12) / size), x1 = Math.floor((x + radius + 12) / size);
    const z0 = Math.floor((z - radius - 12) / size), z1 = Math.floor((z + radius + 12) / size);
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const chunk = this.chunks.get(`${cx},${cz}`);
        if (!chunk) continue;
        for (const o of chunk.objects) if (o.alive && Math.hypot(o.x - x, o.z - z) < radius + o.radius) out.push(o);
      }
    }
    for (const o of this.staticObjects) if (o.alive && Math.hypot(o.x - x, o.z - z) < radius + o.radius) out.push(o);
    return out;
  }

  // Remove a scenery object, leaving a smouldering wreck
  destroyObject(o) {
    o.alive = false;
    if (o.indestructible) return;
    this.destroyed.add(o.key);
    const m = new THREE.Matrix4();
    o.mesh.getMatrixAt(o.index, m);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    m.decompose(p, q, s);
    o.mesh.setMatrixAt(o.index, m.compose(p, q, s.setScalar(0)));
    o.mesh.instanceMatrix.needsUpdate = true;
    if (o.type !== 'rock') this.addWreck(o.x, o.y, o.z, Math.min(o.radius / 1.6, 3));
  }
}

// --- Terrain geometry --------------------------------------------------------------

// A chunk's height grid with one extra ring of samples so normals match
// across chunk edges, plus a skirt hanging down the sides to hide cracks
// between chunks of different detail
function terrainGeometry(cx, cz, segments) {
  const size = WORLD.chunkSize;
  const step = size / segments;
  const x0 = cx * size, z0 = cz * size;
  const n = segments + 1;
  const g = n + 2;
  const heights = new Float32Array(g * g);
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) heights[j * g + i] = heightAt(x0 + (i - 1) * step, z0 + (j - 1) * step);
  const skirt = 4 * segments;
  const count = n * n + skirt * 2;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  const c = [0, 0, 0];
  const put = (k, x, y, z, nx, ny, nz) => {
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz;
    groundColour(x, z, y, ny, c);
    col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
    uv[k * 2] = x / 9; uv[k * 2 + 1] = z / 9;
  };
  const normalAtGrid = (i, j) => {
    const dx = heights[j * g + i + 1] - heights[j * g + i - 1];
    const dz = heights[(j + 1) * g + i] - heights[(j - 1) * g + i];
    const len = Math.hypot(dx, 2 * step, dz);
    return [-dx / len, (2 * step) / len, -dz / len];
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const [nx, ny, nz] = normalAtGrid(i + 1, j + 1);
      put(j * n + i, x0 + i * step, heights[(j + 1) * g + i + 1], z0 + j * step, nx, ny, nz);
    }
  }
  const index = [];
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * n + i, b = a + 1, d = a + n, e = d + 1;
      index.push(a, d, b, b, d, e);
    }
  }
  // Skirt: walk the edge and drop a copy of each vertex 12 m down
  const edge = [];
  for (let i = 0; i < segments; i++) edge.push(i);
  for (let j = 0; j < segments; j++) edge.push(j * n + segments);
  for (let i = segments; i > 0; i--) edge.push(segments * n + i);
  for (let j = segments; j > 0; j--) edge.push(j * n);
  let k = n * n;
  const top = [], bottom = [];
  for (const v of edge) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    put(k, x, y, z, nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]); top.push(k++);
    put(k, x, y - 12, z, nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]); bottom.push(k++);
  }
  for (let s = 0; s < edge.length; s++) {
    const t = (s + 1) % edge.length;
    index.push(top[s], bottom[s], top[t], top[t], bottom[s], bottom[t]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return geo;
}

// --- Scenery scatter -------------------------------------------------------------------

function scatterScenery(cx, cz) {
  const size = WORLD.chunkSize;
  const items = [];
  const g0x = Math.floor((cx * size) / CELL), g1x = Math.floor(((cx + 1) * size) / CELL);
  const g0z = Math.floor((cz * size) / CELL), g1z = Math.floor(((cz + 1) * size) / CELL);
  for (let gz = g0z; gz < g1z; gz++) {
    for (let gx = g0x; gx < g1x; gx++) {
      const r = hash2(gx, gz, 1);
      const x = (gx + 0.15 + 0.7 * hash2(gx, gz, 2)) * CELL;
      const z = (gz + 0.15 + 0.7 * hash2(gx, gz, 3)) * CELL;
      if (Math.floor(x / size) !== cx || Math.floor(z / size) !== cz) continue;
      const y = heightAt(x, z);
      if (y < 3 || isNearBase(x, z, 10)) continue;
      const slope = Math.abs(heightAt(x + 2, z) - heightAt(x - 2, z)) + Math.abs(heightAt(x, z + 2) - heightAt(x, z - 2));
      let type = null;
      const forest = forestDensity(x, z);
      if (slope > 5) {
        if (r < 0.04) type = 'rock';
      } else if (y < 150 && r < forest * 0.5) {
        type = y > 70 || hash2(gx, gz, 4) < 0.55 ? 'pine' : 'broadleaf';
      } else if (y < 60 && slope < 1.6 && r > 0.9965) {
        type = 'house';
      } else if (r > 0.9993) {
        type = hash2(gx, gz, 5) < 0.5 ? 'tower' : 'tank';
      } else if (r < 0.012) {
        type = 'rock';
      }
      if (!type) continue;
      const scale = type === 'pine' || type === 'broadleaf' ? 0.75 + hash2(gx, gz, 6) * 0.65 : 0.85 + hash2(gx, gz, 6) * 0.3;
      const info = SCENERY_INFO[type];
      items.push({
        type, x, y: y - 0.2, z, scale, rot: hash2(gx, gz, 7) * Math.PI * 2, tint: hash2(gx, gz, 8) - 0.5,
        radius: info.radius * scale, height: info.height * scale, hp: info.hp, points: info.points,
      });
    }
  }
  return items;
}
