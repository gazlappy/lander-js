# Lander (JavaScript remake)

A from-scratch browser version of David Braben's *Lander* (Acorn Archimedes,
1987), written as plain, readable JavaScript modules that are easy to change
and build on. No emulation, no build step and no dependencies.

The game logic follows Mark Moxon's
[fully documented Lander source](https://lander.bbcelite.com), and the remake
was checked against the original binary running in an emulator:

* The landscape, object placement and random numbers are bit-exact. The
  object map comes out identical, all 1,168 objects.
* The opening frame matches the original to the pixel, apart from 17 of the
  76,800 pixels in the 3D view.
* A scripted 200-frame flight gives the same score, fuel, lives and particle
  counts as the original on every frame. Ship positions agree to three
  decimal places.

## Running it

Serve the folder over HTTP (ES modules don't load from `file://`):

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. It also works as-is on GitHub Pages.

## Controls

| Input                   | Action |
|-------------------------|--------|
| Mouse position          | Tilt the ship: distance from centre = how far, angle = which way |
| Left button / `Z`       | Full thrust |
| Middle button / `Space` | Hover |
| Right button / `X`      | Fire (each shot costs a point) |
| `Esc` / `P`             | Pause and open the menu |

The game opens on a main menu with New game, Continue, Options and Credits.
Use the arrow keys and Enter, or the mouse; in Options, Left/Right or a
left/right click changes a setting. Progress is saved in the browser
whenever you pause or leave the page, so Continue resumes the exact game,
including the particles in flight, even after a reload. New game always
starts from the original's 1987 world. Restarting after game over carries
on the random sequence instead, as the original did, so you get a different
world.

Click the screen to capture the mouse. If the browser won't allow pointer
lock, the pointer's position over the screen steers instead.

## Code layout

```
src/
  config.js            every tunable constant: physics, scoring, sizes, screen
  game.js              game state machine and the per-tick update order
  main.js              page wiring: menu/play modes, fixed-rate loop, canvas
  settings.js          options (speed, resolution, colours, mouse) and storage
  core/
    random.js          the original's shift-register RNG
    save.js            snapshot and restore a game in progress for Continue
    maths.js           orientation matrix, mouse-to-polar conversion
  world/
    terrain.js         the six-sine-wave landscape and tile colours
    objectMap.js       256x256 wrapping map of trees, buildings and rockets
    blueprints.js      3D models (vertices, faces, normals, colours)
  entities/
    player.js          flight model, landing, refuelling, exhaust, bullets
    particles.js       particle system: exhaust, bullets, smoke, debris, rocks
  render/
    framebuffer.js     software rasteriser at any multiple of 320x256
    scene.js           projection, landscape, depth layers, object drawing
    palette.js         Archimedes 256-colour palette or true colour
    font.js            8x8 system-style font
  ui/
    hud.js             score bar, lives, high score and fuel gauge
    menu.js            main menu, options and credits, drawn in the game's font
    input.js           mouse (pointer lock or absolute) and keyboard
```

World units are tiles, and the y-axis points down, as in the original. A
tick runs these steps in the original's main-loop order:

1. Fly the player.
2. Spin the rocks.
3. Maybe drop a rock.
4. Move the particles.
5. Queue the map objects.
6. Draw the landscape back to front, interleaving the depth layers.
7. Draw the HUD.

## Where to start changing things

* **Physics and difficulty**: `src/config.js` (gravity, thrust, friction,
  landing speed, scores, when rocks start falling).
* **New objects**: add a model to `src/world/blueprints.js` and put its type
  in `OBJECT_TYPES`. `ObjectMap.populate` decides where things go.
* **New particle effects**: add a spawner to `ParticleSystem` built from the
  behaviour flags (`FALLS`, `BOUNCES`, `SPLASHES`, `DESTROYS`, `EXPLODES`).
* **Menus**: screens are lists of items in `Menu.items()`. An item has
  either `run` (a button) or `adjust` (an option that cycles). New options go
  in `SETTINGS` in `src/settings.js` and show up in the Options screen
  automatically.
* **Graphics**: `FrameBuffer` is a plain RGBA software renderer, and the
  Resolution setting already renders at up to 4x. Swapping it for WebGL means
  replacing `FrameBuffer` and `Scene.drawLayer`.
* **Feel vs fidelity**: the ship's orientation uses the original's sine
  table and 8-bit multiplies (`Orientation.set`), and the mouse uses its
  coarse atan and sqrt tables (`mouseToPolar`). These give the same handling,
  including a small dead zone in the middle of the mouse range. Swap in
  `Math.sin`/`Math.atan2` for smoother controls.

The game runs at a fixed tick rate (20 per second by default; the original ran
at roughly 17 on an 8 MHz A310). Physics are per tick, so the Game speed option
changes how fast the game plays as well as how smooth it looks.

## Credits

Lander © D.J. Braben 1987. This remake reimplements its game logic, 3D models
and constants from Mark Moxon's annotated disassembly at
[lander.bbcelite.com](https://lander.bbcelite.com).
