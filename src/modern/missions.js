import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { BASE_BY_ID, HOME } from './bases.js';
import { buildRing, buildBeacon, SCENERY, sceneryMaterial } from './models.js';

// Missions. Each one sets up its world in start(), checks progress in
// update(), and reports its current objective text and markers for the HUD.
// update() returns 'success', 'failed' (with this.reason set) or nothing.

const crateGeometry = SCENERY.crate();

class Mission {
  constructor(def, game) {
    this.def = def;
    this.game = game;
    this.time = 0;
    this.props = [];
    this.markers = [];       // { position, label, colour } for the HUD
    this.reason = '';
    this.objective = '';
  }

  get timeLeft() { return this.def.timeLimit ? Math.max(0, this.def.timeLimit - this.time) : null; }

  addProp(object) { this.game.scene.add(object); this.props.push(object); return object; }

  beacon(x, z, colour, height = 0) {
    const b = buildBeacon(colour);
    b.position.set(x, Math.max(heightAt(x, z), 0) + height, z);
    return this.addProp(b);
  }

  crateOnPad(pad) {
    const crate = new THREE.Mesh(crateGeometry, sceneryMaterial);
    crate.position.set(pad.x + pad.size * 0.32, pad.y + 0.6, pad.z + pad.size * 0.32);
    crate.castShadow = true;
    return this.addProp(crate);
  }

  // Shared cargo handling: true if the ship is sitting on `pad`
  onPad(pad) {
    const s = this.game.ship;
    return s.landed && s.pad === pad;
  }

  dispose() {
    for (const p of this.props) this.game.scene.remove(p);
    this.props = [];
  }

  baseUpdate(dt) {
    this.time += dt;
    if (this.def.timeLimit && this.time > this.def.timeLimit) {
      this.reason = 'Out of time.';
      return 'failed';
    }
    for (const p of this.props) if (p.userData.core) p.userData.core.rotation.y += dt * 2;
    return null;
  }

  start() {}
  update() { return null; }
  onEvent() {}
}

// --- The missions ------------------------------------------------------------------

class FirstFlight extends Mission {
  start() {
    const h = HOME;
    const points = [[h.x + 40, h.z + 260, 45], [h.x + 300, h.z + 420, 70], [h.x + 420, h.z + 140, 95], [h.x + 160, h.z - 120, 55]];
    this.rings = points.map(([x, z, alt], i) => {
      const ring = buildRing();
      ring.position.set(x, Math.max(heightAt(x, z), 0) + alt, z);
      const next = points[(i + 1) % points.length];
      ring.lookAt(next[0], ring.position.y, next[1]);
      ring.material = ring.material.clone();
      this.addProp(ring);
      return ring;
    });
    this.next = 0;
    this.landing = false;
  }

  update(dt) {
    const result = this.baseUpdate(dt);
    if (result) return result;
    const ship = this.game.ship;
    this.rings.forEach((r, i) => { r.material.color.setScalar(i === this.next ? 2.5 : i < this.next ? 0.2 : 0.8); r.rotation.z += dt * (i === this.next ? 1 : 0.2); });
    if (!this.landing) {
      const ring = this.rings[this.next];
      this.objective = `Fly through the rings (${this.next + 1} of ${this.rings.length})`;
      this.markers = [{ position: ring.position, label: `Ring ${this.next + 1}`, colour: '#40c8ff' }];
      if (ship.position.distanceTo(ring.position) < 10) {
        ring.visible = false;
        this.game.audio.ring();
        this.next++;
        if (this.next === this.rings.length) this.landing = true;
      }
      return null;
    }
    this.objective = 'Land gently on a pad at Braben Field';
    this.markers = [{ position: new THREE.Vector3(HOME.x, HOME.y, HOME.z), label: 'Braben Field', colour: '#50ff80' }];
    if (ship.landed && ship.pad?.base === 'home') return 'success';
    return null;
  }
}

// Collect crates at one pad and drop them at others
class CargoRun extends Mission {
  start() {
    this.source = HOME.pads[1];
    this.drops = this.def.destinations.map((id) => ({ base: BASE_BY_ID[id], done: false }));
    this.waiting = this.drops.length;
    this.sourceCrates = [];
    for (let i = 0; i < Math.min(this.waiting, 3); i++) {
      const c = this.crateOnPad(this.source);
      c.position.x -= i * 3;
      this.sourceCrates.push(c);
    }
    this.dropBeacons = this.drops.map((d) => this.beacon(d.base.x, d.base.z, 0xffb040));
  }

  update(dt) {
    const result = this.baseUpdate(dt);
    if (result) return result;
    const ship = this.game.ship;
    const carrying = ship.cargo.filter((c) => c === 'crate').length;
    const remaining = this.drops.filter((d) => !d.done);
    if (this.onPad(this.source) && carrying < ship.craft.cargo && this.waiting > carrying) {
      const load = Math.min(ship.craft.cargo - carrying, this.waiting - carrying);
      for (let i = 0; i < load; i++) { ship.cargo.push('crate'); this.sourceCrates.pop()?.removeFromParent(); }
      this.game.audio.pickup();
      this.game.hud.flash(`Loaded ${load} crate${load > 1 ? 's' : ''}`);
    }
    for (const d of remaining) {
      if (carrying > 0 && ship.landed && ship.pad?.base === d.base.id) {
        d.done = true;
        ship.cargo.splice(ship.cargo.indexOf('crate'), 1);
        this.waiting--;
        this.crateOnPad(d.base.pads[0]);
        this.dropBeacons[this.drops.indexOf(d)].visible = false;
        this.game.audio.pickup();
        this.game.hud.flash(`Delivered to ${d.base.name}`);
        if (this.waiting === 0) return 'success';
      }
    }
    if (carrying === 0) {
      this.objective = `Land on the pad with the crates at Braben Field to load up`;
      this.markers = [{ position: new THREE.Vector3(this.source.x, this.source.y, this.source.z), label: 'Crates', colour: '#ffb040' }];
    } else {
      this.objective = `Deliver ${carrying === 1 ? 'the crate' : `${carrying} crates`}: ${remaining.map((d) => d.base.name).join(', ')}`;
      this.markers = remaining.map((d) => ({ position: new THREE.Vector3(d.base.x, d.base.y, d.base.z), label: d.base.name, colour: '#ffb040' }));
    }
    return null;
  }

  onEvent(type) {
    if (type !== 'shipLost') return;
    // Crates lost with the ship are replaced at the depot
    const lost = this.game.ship.cargo.filter((c) => c === 'crate').length;
    for (let i = 0; i < lost; i++) this.sourceCrates.push(this.crateOnPad(this.source));
  }
}

class CleanSweep extends Mission {
  start() {
    const red = BASE_BY_ID.red;
    const combat = this.game.combat;
    this.radars = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const r = 70 + (i % 2) * 60;
      this.radars.push(combat.spawnRadar(red.x + Math.cos(a) * r, red.z + Math.sin(a) * r));
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 1.1;
      combat.spawnTurret(red.x + Math.cos(a) * 105, red.z + Math.sin(a) * 105);
    }
  }

  update(dt) {
    const result = this.baseUpdate(dt);
    if (result) return result;
    const left = this.radars.filter((r) => r.alive);
    this.objective = `Destroy the radar dishes in Red Valley (${6 - left.length} of 6). Watch out for the turrets.`;
    this.markers = left.map((r) => ({ position: r.position, label: 'Radar', colour: '#ff5050' }));
    return left.length === 0 ? 'success' : null;
  }
}

class Rescue extends Mission {
  start() {
    this.failNow = false;
    this.teams = this.def.sites.map(([x, z]) => ({ x, z, picked: false, beacon: this.beacon(x, z, 0x40ff90) }));
    this.saved = 0;
    this.smokeTimer = 0;
  }

  update(dt) {
    const result = this.baseUpdate(dt);
    if (result) return result;
    if (this.failNow) return 'failed';
    const ship = this.game.ship;
    this.smokeTimer -= dt;
    for (const t of this.teams) {
      if (t.picked) continue;
      if (this.smokeTimer <= 0) this.game.particles.smokePuff(t.x, Math.max(heightAt(t.x, t.z), 0) + 1, t.z, 3, 0.75);
      const near = Math.hypot(ship.position.x - t.x, ship.position.z - t.z) < 16;
      if (near && ship.landed) {
        if (ship.cargo.length < Math.max(ship.craft.cargo, 1)) {
          t.picked = true;
          t.beacon.visible = false;
          ship.cargo.push('team');
          this.game.audio.pickup();
          this.game.hud.flash('Survey team aboard');
        } else {
          this.game.hud.flash('No room aboard: take the others home first');
        }
      }
    }
    if (this.smokeTimer <= 0) this.smokeTimer = 0.25;
    const aboard = ship.cargo.filter((c) => c === 'team').length;
    if (aboard && ship.landed && ship.pad?.base === 'home') {
      this.saved += aboard;
      ship.cargo = ship.cargo.filter((c) => c !== 'team');
      this.game.audio.pickup();
      this.game.hud.flash(`${aboard} rescued`);
      if (this.saved === this.teams.length) return 'success';
    }
    const waiting = this.teams.filter((t) => !t.picked);
    this.objective = `Rescue the survey teams: land beside each flare (${this.saved} of ${this.teams.length} home${aboard ? `, ${aboard} aboard` : ''})`;
    this.markers = [];
    if (aboard && (aboard >= Math.max(ship.craft.cargo, 1) || waiting.length === 0)) {
      this.markers.push({ position: new THREE.Vector3(HOME.x, HOME.y, HOME.z), label: 'Braben Field', colour: '#50ff80' });
    }
    for (const t of waiting) this.markers.push({ position: new THREE.Vector3(t.x, heightAt(t.x, t.z), t.z), label: 'Survey team', colour: '#40ff90' });
    return null;
  }

  onEvent(type) {
    if (type === 'shipLost') {
      // Anyone aboard is lost with the ship
      if (this.game.ship.cargo.includes('team')) { this.reason = 'The survey team was lost.'; this.failNow = true; }
    }
  }
}

class MeteorStorm extends Mission {
  start() {
    this.integrity = 100;
    this.nextMeteor = 4;
    this.game.combat.callbacks.onMeteorImpact = (p) => {
      const d = Math.hypot(p.x - HOME.x, p.z - HOME.z);
      if (d < 130) {
        this.integrity -= 14 * (1 - d / 160);
        this.game.hud.flash('The base was hit!');
        this.game.chase.shake = Math.max(this.game.chase.shake, 1.5);
      }
    };
  }

  update(dt) {
    const result = this.baseUpdate(dt);
    if (result === 'failed') return 'success';   // surviving the clock is the goal
    this.nextMeteor -= dt;
    if (this.nextMeteor <= 0) {
      this.nextMeteor = Math.max(1.2, 3.2 - this.time / 60);
      const a = Math.random() * Math.PI * 2, r = Math.random() * 110;
      this.game.combat.spawnMeteor(HOME.x + Math.cos(a) * r, HOME.z + Math.sin(a) * r, 8);
    }
    if (this.integrity <= 0) { this.reason = 'Braben Field was flattened.'; return 'failed'; }
    this.objective = `Shoot down meteors before they hit Braben Field. Base integrity ${Math.max(0, Math.round(this.integrity))}%`;
    this.markers = this.game.combat.enemies.filter((e) => e.kind === 'meteor').map((e) => ({ position: e.position, label: 'Meteor', colour: '#ff9040' }));
    return null;
  }

  dispose() {
    super.dispose();
    this.game.combat.callbacks.onMeteorImpact = null;
  }
}

class DroneSwarm extends Mission {
  start() {
    this.wave = 0;
    this.waves = [3, 4, 6];
    this.gap = 3;
  }

  update(dt) {
    const result = this.baseUpdate(dt);
    if (result) return result;
    const left = this.game.combat.count('drone');
    if (left === 0) {
      if (this.wave === this.waves.length) return 'success';
      this.gap -= dt;
      this.objective = `Wave ${this.wave + 1} of ${this.waves.length} incoming...`;
      if (this.gap <= 0) {
        const s = this.game.ship.position;
        for (let i = 0; i < this.waves[this.wave]; i++) {
          const a = (i / this.waves[this.wave]) * Math.PI * 2;
          this.game.combat.spawnDrone(s.x + Math.cos(a) * 320, s.z + Math.sin(a) * 320, 60);
        }
        this.wave++;
        this.gap = 4;
        this.game.audio.warning();
      }
      this.markers = [];
      return null;
    }
    this.objective = `Destroy the drones: wave ${this.wave} of ${this.waves.length}, ${left} left`;
    this.markers = this.game.combat.enemies.filter((e) => e.kind === 'drone').map((e) => ({ position: e.position, label: 'Drone', colour: '#ff5050' }));
    return null;
  }
}

class FreeFlight extends Mission {
  update(dt) {
    this.baseUpdate(dt);
    this.objective = 'Free flight: explore the island. Land on any pad to refuel.';
    this.markers = [];
    return null;
  }
}

// --- Catalogue ------------------------------------------------------------------------

export const MISSIONS = [
  {
    id: 'first-flight', name: 'First Flight', reward: 500, type: FirstFlight,
    brief: 'Get a feel for the controls. Lift off, fly through the four rings around Braben Field, then land back on a pad. Tilt with the mouse, thrust with the left button, hover with Shift.',
  },
  {
    id: 'supply-run', name: 'Supply Run', reward: 900, type: CargoRun, destinations: ['nyx'], timeLimit: 300, needsCargo: true,
    brief: 'Nyx Outpost is short of parts. Land on the crate pad at Braben Field to load up, then fly the crate north-east to Nyx and land on their pad.',
  },
  {
    id: 'clean-sweep', name: 'Clean Sweep', reward: 1600, type: CleanSweep,
    brief: 'Someone has set up radar dishes in Red Valley to the south, guarded by gun turrets. Destroy all six dishes. Shells can be dodged, so keep moving.',
  },
  {
    id: 'rescue', name: 'Search and Rescue', reward: 2200, type: Rescue, timeLimit: 480,
    sites: [[-900, 820], [620, -620], [-1180, -1300]],
    brief: 'Three survey teams are stranded in the wilds. Land beside each smoke flare to pick them up and bring them home. Small craft can only carry one at a time.',
  },
  {
    id: 'meteor-storm', name: 'Meteor Storm', reward: 2800, type: MeteorStorm, timeLimit: 120,
    brief: 'A meteor shower is heading for Braben Field. Shoot down as many as you can for two minutes. If the base takes too many hits, it is over.',
  },
  {
    id: 'long-haul', name: 'Long Haul', reward: 3400, type: CargoRun, destinations: ['cobalt', 'delta', 'north'], timeLimit: 720, needsCargo: true,
    brief: 'Three outposts need supplies: Cobalt Ridge in the west, Delta Station in the east and North Light up the coast. A Hauler can carry all three crates at once.',
  },
  {
    id: 'drone-swarm', name: 'Drone Swarm', reward: 4500, type: DroneSwarm,
    brief: 'Hostile drones are hunting over the island in waves. Destroy every wave. They circle and shoot, so keep the throttle working.',
  },
];

export const FREE_FLIGHT = { id: 'free', name: 'Free Flight', reward: 0, type: FreeFlight, brief: 'No objectives. Explore the island.' };

export function createMission(def, game) {
  const m = new def.type(def, game);
  m.start();
  return m;
}
