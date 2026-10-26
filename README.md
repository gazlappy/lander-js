# Lander, in the browser: retro and modern

Two takes on David Braben's *Lander* (Acorn Archimedes, 1987) on one page.
The site opens on a main page where you pick a version, or play the modern
one in VR on a Meta Quest. Each version has
its own address (`#retro`, `#modern`), so you can bookmark or link straight
to either. In a game, the header button or **F2** flips to the other
version, and **Main page** (or the LANDER title) goes back. Each version
pauses itself when you switch away and picks up where it left off.

* **Retro**: a faithful, from-scratch remake of the 1987 game, checked
  bit-for-bit against the original binary.
* **Modern**: an open-world reimagining in WebGL (three.js). It has a 4.5 km
  island, four craft, seven missions, a hangar, dynamic lighting, reflective
  sea, particles, enemies and synthesised sound.

No build step and no dependencies to install: three.js is vendored in
`vendor/three`.

## Running it

Serve the folder over HTTP (ES modules don't load from `file://`):

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. It also works as-is on GitHub Pages.

---

## Modern version

### Controls

| Input                   | Action |
|-------------------------|--------|
| Mouse / WASD            | Tilt the ship: how far the mouse is from the centre sets the tilt, its direction sets which way. `R` recentres |
| Left button / `Space` / `Z` | Full thrust |
| Middle button / `Shift` | Hover (gentle thrust). `H` toggles an optional hover hold that keeps your height |
| Right button / `F` / `X` | Fire |
| `C`                     | Classic camera (fixed heading, like 1987) or chase camera |
| `M`                     | Enlarge the minimap |
| `Esc` / `P`             | Pause |

The ship flies exactly like the 1987 original and the retro version, using
the same mouse handling, coarse polar maths (with its small dead zone in
the middle), tilt easing, thrust, hover, gravity, friction and fuel burn. The
original's per-tick numbers are converted at 20 ticks a second and 4.2 m a
tile (`PHYSICS` in `config.js`). Flown through the same inputs, a modern ship
stays within a tile or two of a retro one. The other craft scale the engine
(`power`) and how fast the ship follows the mouse (`steer`). Touch down
gently and level; the **LAND** light turns green when a landing would be
safe. Sit on a friendly pad to refuel and repair.

### What's in it

* **The island**: continental and ridged noise for coastline and mountains,
  with the original game's six sine waves still shaping the rolling hills.
  Terrain streams in 128 m chunks with three levels of detail. Forests,
  villages, rocks, towers and fuel tanks are scattered deterministically and
  can all be destroyed.
* **Bases**: Braben Field (home, with the three rockets from the original),
  five outposts and the hostile Red Valley.
* **Craft**: Lander Mk I (the 1987 hull, rebuilt from the original's
  vertices), Hopper, Hauler (carries three crates) and Striker (twin
  cannons). Buy them with credits in the hangar.
* **Missions**: First Flight, Supply Run, Clean Sweep, Search and Rescue,
  Meteor Storm, Long Haul and Drone Swarm. Each unlocks the next. Free
  flight has no objectives.
* **Graphics presets**: Low, Medium, High and Ultra. They set view distance,
  terrain detail, shadow resolution, sea reflections, bloom and pixel ratio.
* **Progress**: credits, owned craft, completed missions, best times and
  settings are saved in the browser.

### VR (Meta Quest 3 / 3S)

Open the site in the **Meta Quest browser** and pick *Play in VR* on the
main page (or go straight to `#vr`). Then press **Enter VR**. You hover
in the sky behind the ship, like the original's camera, with a fixed
heading for comfort. The ship flies exactly as it does on the desktop,
through the same virtual mouse.

| Touch controller | Action |
|------------------|--------|
| Right stick      | Tilt the ship (forward flies away from you; VR options can switch to the original mouse direction) |
| Right trigger    | Full thrust |
| Either grip      | Hover |
| Left trigger     | Fire |
| A                | Hover hold on/off |
| B or Y           | Pause menu |
| Left stick       | Snap turn 45 degrees |
| Point + trigger  | Choose in menus |

In the headset, the HUD is a panel below your view, with an arrow to the
current objective. Mission targets get floating markers, and menus are
panels you point at. The controllers rumble with the engine, on hits and
on crashes. A lighter **VR** graphics preset is used automatically: shorter
view distance, no shadows, sea reflections or bloom. It goes back to your
desktop setting when you leave VR. Any WebXR headset should work; it was
developed against Meta's Quest 3 emulator (iwer).

### Code layout

```
src/shell.js       main page and routing between the two versions
assets/            the screenshots on the main page

src/modern/
  app.js           wires everything together; title, missions, free flight, saving
  config.js        world size, physics limits, graphics presets
  terrain.js       height function, ground colours, forest density
  noise.js         simplex/fractal/ridged noise and hashing
  bases.js         base and pad positions (flattened into the terrain)
  world.js         chunk streaming, instanced scenery, destruction, collision queries
  environment.js   sky, sun and shadows, fog, sea, bloom
  models.js        procedural low-poly models for craft, scenery, enemies, props
  crafts.js        craft stats
  ship.js          the original's flight model, landing, damage, refuelling
  camera.js        classic and chase cameras
  input.js         mouse stick, keys, pointer lock
  particles.js     GPU point sprites for exhaust, smoke, explosions, tracers
  combat.js        bullets, shells, turrets, drones, radar dishes, meteors
  missions.js      mission classes and the mission list
  hud.js           gauges, objective, 3D markers, gunsight, minimap
  menus.js         title, missions, hangar, options, credits, pause, results
  audio.js         WebAudio synthesis: engine, wind, guns, explosions, cues
  vr.js            WebXR mode: camera rig, Touch controllers, haptics, HUD and menu panels
```

To add a mission, subclass `Mission` in `missions.js` (`start`, `update`
returning `'success'`/`'failed'`, `objective`, `markers`) and add it to
`MISSIONS`. To add a craft, add stats to `crafts.js` and a model to
`CRAFT_MODELS` in `models.js`.

---

## Retro version

A from-scratch reimplementation of the original, written as small plain
JavaScript modules in `src/retro/`. It was checked against the original
binary running in an emulator:

* The landscape, object placement and random numbers are bit-exact. The
  object map is identical, all 1,168 objects.
* The opening frame matches the original to the pixel, apart from 17 of the
  76,800 pixels in the 3D view.
* A scripted 200-frame flight gives the same score, fuel, lives and particle
  counts as the original on every frame. Ship positions agree to three
  decimal places.

It opens on a main menu with New game, Continue, Options, Credits and Go
modern. Progress is saved in the browser whenever you pause or leave the
page, so Continue resumes the exact game. New game starts from the original's
1987 world.

| Input                   | Action |
|-------------------------|--------|
| Mouse position          | Steer: distance from centre = tilt, angle = direction |
| Left button / `Z`       | Full thrust |
| Middle button / `Space` | Hover thrust |
| Right button / `X`      | Fire (each shot costs a point) |
| `Esc` / `P`             | Pause and open the menu |

```
src/retro/
  config.js            every tunable constant: physics, scoring, sizes, screen
  game.js              game state machine and the per-tick update order
  app.js               menu/play modes, fixed-rate loop, canvas
  settings.js          options (speed, resolution, colours, mouse) and storage
  core/                RNG, orientation maths, save/restore
  world/               terrain, object map, 3D models
  entities/            player flight model, particle system
  render/              software rasteriser, scene, palette, font
  ui/                  HUD, menus, input
```

The ship's orientation uses the original's sine table and 8-bit multiplies,
and the mouse uses its coarse atan and sqrt tables. This reproduces the
original handling, including a small dead zone in the middle of the mouse
range.

---

## Credits

Lander © D.J. Braben 1987. Both versions reimplement its game logic, 3D models
and constants from Mark Moxon's annotated disassembly at
[lander.bbcelite.com](https://lander.bbcelite.com). three.js is © the
three.js authors (MIT licence, `vendor/three/LICENSE`).
