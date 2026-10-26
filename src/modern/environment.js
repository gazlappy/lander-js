import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { hash2 } from './noise.js';

// Sky, sun, fog, sea and post-processing

const SUN_ELEVATION = 28;   // degrees above the horizon
const SUN_AZIMUTH = 205;
const FOG_COLOUR = new THREE.Color(0x9fb7cc);

// A tileable normal map of gentle ripples, so the sea needs no image files
function waterNormals() {
  const size = 256;
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (let k = 1; k <= 4; k++) {
        const f = (2 * Math.PI * k * 2) / size;
        v += Math.sin(x * f + hash2(k, 1) * 6.28 + Math.sin(y * f * 0.7) * 1.3) / k;
        v += Math.sin(y * f * 1.3 + hash2(k, 2) * 6.28 + Math.sin(x * f * 0.6) * 1.1) / k;
      }
      h[y * size + x] = v;
    }
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = h[y * size + ((x + 1) % size)] - h[y * size + ((x + size - 1) % size)];
      const dy = h[((y + 1) % size) * size + x] - h[((y + size - 1) % size) * size + x];
      const n = new THREE.Vector3(-dx, -dy, 4).normalize();
      const i = (y * size + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

export class Environment {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.sunDirection = new THREE.Vector3().setFromSphericalCoords(1,
      THREE.MathUtils.degToRad(90 - SUN_ELEVATION), THREE.MathUtils.degToRad(SUN_AZIMUTH));

    const sky = new Sky();
    sky.scale.setScalar(20000);
    const u = sky.material.uniforms;
    u.turbidity.value = 6;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.8;
    u.sunPosition.value.copy(this.sunDirection);
    scene.add(sky);
    this.sky = sky;

    // Image-based lighting from the sky, so metal hulls catch a reflection
    const pmrem = new THREE.PMREMGenerator(renderer);
    const skyScene = new THREE.Scene();
    skyScene.add(sky.clone());
    scene.environment = pmrem.fromScene(skyScene, 0.02).texture;
    scene.environmentIntensity = 0.3;

    scene.fog = new THREE.Fog(FOG_COLOUR, 300, 1400);

    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4a5a3a, 0.4);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);

    this.waterNormalMap = waterNormals();
    this.setQuality(quality);
  }

  setQuality(quality) {
    this.quality = quality;
    const { renderer, scene } = this;
    renderer.shadowMap.enabled = quality.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.sun.castShadow = quality.shadows;
    if (quality.shadows) {
      this.sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      const s = this.sun.shadow.camera;
      s.left = s.bottom = -160; s.right = s.top = 160; s.near = 1; s.far = 1200;
      s.updateProjectionMatrix();
    }
    const far = quality.viewChunks * 128;
    scene.fog.near = far * 0.25;
    scene.fog.far = far * 1.05;
    this.camera.far = far * 1.6 + 2000;
    this.camera.updateProjectionMatrix();
    this.buildWater(quality.reflections);
    this.buildComposer(quality.bloom);
  }

  buildWater(reflections) {
    if (this.water) { this.scene.remove(this.water); this.water.geometry.dispose(); this.water.material.dispose(); }
    const geometry = new THREE.PlaneGeometry(14000, 14000);
    if (reflections) {
      this.water = new Water(geometry, {
        textureWidth: 512, textureHeight: 512,
        waterNormals: this.waterNormalMap,
        sunDirection: this.sunDirection.clone(),
        sunColor: 0xfff1dc, waterColor: 0x0a3a52, distortionScale: 2.2,
        fog: true,
      });
      this.water.material.uniforms.size.value = 6;
    } else {
      const normalMap = this.waterNormalMap.clone();
      normalMap.repeat.set(400, 400);
      normalMap.needsUpdate = true;
      this.water = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        color: 0x14506e, roughness: 0.12, metalness: 0.2, normalMap, normalScale: new THREE.Vector2(0.4, 0.4),
        transparent: true, opacity: 0.92,
      }));
    }
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 0;
    this.scene.add(this.water);
  }

  buildComposer(bloom) {
    this.composer?.dispose();
    this.composer = null;
    if (!bloom) return;
    const size = this.renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // A high threshold so only emissive parts (flames, lights, explosions)
    // and the sun glow, not every sunlit surface
    this.bloom = new UnrealBloomPass(size, 0.6, 0.4, 3.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.setSize(size.x, size.y);
  }

  resize(width, height) {
    this.composer?.setSize(width, height);
  }

  // Keep the sea, sky and shadow camera centred on the action
  update(dt, focus) {
    this.water.position.x = Math.round(focus.x / 64) * 64;
    this.water.position.z = Math.round(focus.z / 64) * 64;
    if (this.water.material.uniforms?.time) this.water.material.uniforms.time.value += dt * 0.6;
    else if (this.water.material.normalMap) this.water.material.normalMap.offset.x += dt * 0.004;
    this.camera.getWorldPosition(this.sky.position);
    this.sun.position.copy(focus).addScaledVector(this.sunDirection, 500);
    this.sun.target.position.copy(focus);
  }

  render() {
    // Post-processing can't draw into a headset, so VR renders directly
    if (this.composer && !this.renderer.xr.isPresenting) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
