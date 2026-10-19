import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { buildTurret, buildDrone, SCENERY, sceneryMaterial } from './models.js';

// Bullets, enemy shells, hostile turrets and drones, radar targets and
// falling meteors. Talks back to the game through callbacks so missions
// can count kills and impacts.

const tmp = new THREE.Vector3();
const nearby = [];
const radarGeometry = SCENERY.radar();

const ENEMY = {
  turret: { hp: 5, radius: 3.4, points: 150, interval: 2.1, range: 430, shellSpeed: 115, damage: 12 },
  drone: { hp: 3, radius: 3.0, points: 200, interval: 1.5, range: 280, shellSpeed: 140, damage: 9, speed: 30 },
  radar: { hp: 4, radius: 4.0, points: 250 },
  meteor: { hp: 2, radius: 4.5, points: 60 },
};

export class Combat {
  constructor(scene, world, particles) {
    this.scene = scene;
    this.world = world;
    this.particles = particles;
    this.projectiles = [];
    this.enemies = [];
    this.callbacks = {};
  }

  // Remove every enemy, shell and meteor (between missions)
  clear() {
    for (const e of this.enemies) this.scene.remove(e.object);
    this.enemies = [];
    this.projectiles = [];
  }

  // --- Spawning -------------------------------------------------------------------

  spawnTurret(x, z) {
    const { group, head } = buildTurret();
    const y = heightAt(x, z);
    group.position.set(x, y, z);
    this.scene.add(group);
    return this.addEnemy({ kind: 'turret', object: group, head, position: new THREE.Vector3(x, y + 2.5, z) });
  }

  spawnDrone(x, z, altitude = 40) {
    const group = buildDrone();
    const y = Math.max(heightAt(x, z), 0) + altitude;
    group.position.set(x, y, z);
    this.scene.add(group);
    const e = this.addEnemy({ kind: 'drone', object: group, position: group.position, velocity: new THREE.Vector3(), orbit: Math.random() * 6.28 });
    e.cooldown = 1 + Math.random() * 2;
    return e;
  }

  spawnRadar(x, z) {
    const mesh = new THREE.Mesh(radarGeometry, sceneryMaterial);
    const y = heightAt(x, z);
    mesh.position.set(x, y - 0.2, z);
    mesh.rotation.y = Math.random() * 6.28;
    mesh.castShadow = true;
    this.scene.add(mesh);
    return this.addEnemy({ kind: 'radar', object: mesh, position: new THREE.Vector3(x, y + 4, z), spin: 0.4 + Math.random() * 0.5 });
  }

  // A meteor falling towards (x, z), arriving in about `eta` seconds
  spawnMeteor(x, z, eta = 7) {
    const start = new THREE.Vector3(x + (Math.random() - 0.5) * 300, 480, z + (Math.random() - 0.5) * 300);
    const target = new THREE.Vector3(x, heightAt(x, z), z);
    const velocity = target.clone().sub(start).divideScalar(eta);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(3.2, 0), new THREE.MeshStandardMaterial({
      color: 0x3a2a20, emissive: 0xff5010, emissiveIntensity: 0.6, flatShading: true,
    }));
    rock.position.copy(start);
    this.scene.add(rock);
    return this.addEnemy({ kind: 'meteor', object: rock, position: rock.position, velocity, target });
  }

  addEnemy(e) {
    const def = ENEMY[e.kind];
    e.hp = def.hp;
    e.radius = def.radius;
    e.points = def.points;
    e.cooldown ??= def.interval ? Math.random() * def.interval : 0;
    e.alive = true;
    this.enemies.push(e);
    return e;
  }

  // --- Firing ---------------------------------------------------------------------

  firePlayer(ship, guns) {
    const g = ship.craft.gun;
    for (const p of guns) {
      const dir = tmp.copy(ship.forward);
      dir.x += (Math.random() - 0.5) * g.spread;
      dir.y += (Math.random() - 0.5) * g.spread;
      dir.z += (Math.random() - 0.5) * g.spread;
      dir.normalize();
      this.projectiles.push({
        position: p.clone(), velocity: dir.multiplyScalar(g.speed).add(ship.velocity),
        life: 2.2, damage: g.damage, owner: 'player',
      });
    }
  }

  fireEnemy(from, target, targetVelocity, def) {
    // Lead the target, then add some scatter so shells can be dodged
    const t = from.distanceTo(target) / def.shellSpeed;
    const aim = target.clone().addScaledVector(targetVelocity, t * 0.8);
    aim.x += (Math.random() - 0.5) * 8; aim.y += (Math.random() - 0.5) * 6; aim.z += (Math.random() - 0.5) * 8;
    const v = aim.sub(from).normalize().multiplyScalar(def.shellSpeed);
    this.projectiles.push({ position: from.clone(), velocity: v, life: 5, damage: def.damage, owner: 'enemy' });
    this.callbacks.onEnemyFire?.(from);
  }

  // --- Simulation -------------------------------------------------------------------

  update(dt, ship) {
    this.updateEnemies(dt, ship);
    this.updateProjectiles(dt, ship);
    this.enemies = this.enemies.filter((e) => e.alive);
  }

  updateEnemies(dt, ship) {
    const target = ship.destroyed ? null : ship.position;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const def = ENEMY[e.kind];
      if (e.kind === 'turret') {
        if (!target) continue;
        const d = e.position.distanceTo(target);
        if (d > def.range) continue;
        e.head.rotation.y = Math.atan2(target.x - e.position.x, target.z - e.position.z);
        e.cooldown -= dt;
        if (e.cooldown <= 0) {
          e.cooldown = def.interval * (0.8 + Math.random() * 0.4);
          this.fireEnemy(e.position.clone().add(new THREE.Vector3(0, 0.6, 0)), target, ship.velocity, def);
        }
      } else if (e.kind === 'drone') {
        this.flyDrone(e, dt, ship, def);
      } else if (e.kind === 'radar') {
        e.object.rotation.y += e.spin * dt;
      } else if (e.kind === 'meteor') {
        e.position.addScaledVector(e.velocity, dt);
        e.object.rotation.x += dt * 2; e.object.rotation.z += dt * 1.3;
        this.particles.meteorTrail(e.position);
        const ground = heightAt(e.position.x, e.position.z);
        if (e.position.y <= Math.max(ground, 0) + 1) this.meteorImpact(e, ship);
      }
    }
  }

  // Drones circle the player at a distance and take pot shots
  flyDrone(e, dt, ship, def) {
    e.object.children.forEach((c, i) => { if (i > 1) c.rotation.y += dt * 30; });
    const focus = ship.destroyed ? e.position : ship.position;
    e.orbit += dt * 0.35;
    const want = new THREE.Vector3(focus.x + Math.cos(e.orbit) * 90, 0, focus.z + Math.sin(e.orbit) * 90);
    want.y = Math.max(focus.y + 18, Math.max(heightAt(want.x, want.z), 0) + 30);
    const steer = want.sub(e.position);
    if (steer.length() > def.speed) steer.setLength(def.speed);
    e.velocity.lerp(steer, Math.min(1, dt * 0.9));
    e.position.addScaledVector(e.velocity, dt);
    const floor = Math.max(heightAt(e.position.x, e.position.z), 0) + 12;
    if (e.position.y < floor) e.position.y = floor;
    e.object.lookAt(focus.x, e.position.y, focus.z);
    if (ship.destroyed) return;
    const d = e.position.distanceTo(ship.position);
    e.cooldown -= dt;
    if (d < def.range && e.cooldown <= 0) {
      e.cooldown = def.interval * (0.8 + Math.random() * 0.5);
      this.fireEnemy(e.position.clone(), ship.position, ship.velocity, def);
    }
  }

  meteorImpact(e, ship) {
    e.alive = false;
    this.scene.remove(e.object);
    const p = e.position;
    const ground = heightAt(p.x, p.z);
    if (ground < 0) this.particles.splash(p.x, p.z, 3);
    else this.particles.explosion(p.x, Math.max(ground, 0) + 1, p.z, 2.5);
    for (const o of this.world.objectsNear(p.x, p.z, 12, nearby)) this.damageObject(o, 99, false);
    if (!ship.destroyed) {
      const d = ship.position.distanceTo(p);
      if (d < 22) this.callbacks.onPlayerHit?.(45 * (1 - d / 22), 'meteor');
    }
    this.callbacks.onMeteorImpact?.(p);
  }

  updateProjectiles(dt, ship) {
    const list = this.projectiles;
    let i = 0;
    while (i < list.length) {
      const b = list[i];
      b.life -= dt;
      const prev = tmp.copy(b.position);
      b.velocity.y -= 3 * dt;
      b.position.addScaledVector(b.velocity, dt);
      let hit = b.life <= 0;
      if (!hit) hit = b.owner === 'player' ? this.playerShotHits(b, prev) : this.enemyShotHits(b, ship);
      if (hit) { list[i] = list[list.length - 1]; list.pop(); continue; }
      this.particles.tracer(b.position, b.owner === 'player' ? [1, 0.9, 0.55, 1] : [1, 0.25, 0.15, 1]);
      i++;
    }
  }

  // Returns true if the shot was used up
  playerShotHits(b, prev) {
    const p = b.position;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (distanceToSegment(e.position, prev, p) < e.radius) {
        this.particles.impact(p.x, p.y, p.z);
        this.damageEnemy(e, b.damage);
        return true;
      }
    }
    for (const o of this.world.objectsNear(p.x, p.z, 1.5, nearby)) {
      if (p.y < o.y + o.height && p.y > o.y - 1) {
        this.particles.impact(p.x, p.y, p.z);
        this.damageObject(o, b.damage, true);
        return true;
      }
    }
    return this.hitsGround(p);
  }

  enemyShotHits(b, ship) {
    if (!ship.destroyed && b.position.distanceTo(ship.position) < ship.craft.radius) {
      this.particles.explosion(b.position.x, b.position.y, b.position.z, 0.3);
      this.callbacks.onPlayerHit?.(b.damage, 'shell');
      return true;
    }
    return this.hitsGround(b.position);
  }

  hitsGround(p) {
    const ground = heightAt(p.x, p.z);
    if (p.y > Math.max(ground, 0)) return false;
    if (ground < 0) this.particles.splash(p.x, p.z, 0.3);
    else this.particles.impact(p.x, ground, p.z);
    return true;
  }

  damageEnemy(e, amount) {
    e.hp -= amount;
    if (e.hp > 0) return;
    e.alive = false;
    this.scene.remove(e.object);
    this.particles.explosion(e.position.x, e.position.y, e.position.z, e.kind === 'radar' ? 2 : 1.4);
    this.callbacks.onEnemyDestroyed?.(e);
  }

  damageObject(o, amount, byPlayer) {
    if (o.indestructible) return;
    o.hp -= amount;
    if (o.hp > 0) return;
    this.world.destroyObject(o);
    this.particles.explosion(o.x, o.y + o.height * 0.4, o.z, Math.min(0.6 + o.radius / 3, 2.5));
    this.callbacks.onObjectDestroyed?.(o, byPlayer);
  }

  count(kind) {
    return this.enemies.filter((e) => e.alive && e.kind === kind).length;
  }
}

function distanceToSegment(p, a, b) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const t = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(p, a).dot(ab) / Math.max(ab.lengthSq(), 1e-6)));
  return a.clone().addScaledVector(ab, t).distanceTo(p);
}
