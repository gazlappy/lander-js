// The ships you can fly. All of them use the original Lander's flight
// model (see ship.js); `power` scales its engine thrust and `steer` how
// quickly the ship follows the mouse (1 = exactly the 1987 ship). Fuel and
// hull are in units, burning at the original's rates.

export const CRAFTS = [
  {
    id: 'classic',
    name: 'Lander Mk I',
    price: 0,
    blurb: 'The 1987 original, rebuilt, and it flies exactly like it.',
    power: 1, steer: 1,
    fuel: 100, hull: 100, cargo: 1, radius: 3.6,
    gun: { interval: 0.1, speed: 190, damage: 1, spread: 0.012 },
  },
  {
    id: 'hopper',
    name: 'Hopper',
    price: 1500,
    blurb: 'A nimble pod with a big engine. Twitchy, thirsty and fragile.',
    power: 1.15, steer: 1.35,
    fuel: 70, hull: 70, cargo: 1, radius: 2.8,
    gun: { interval: 0.14, speed: 170, damage: 1, spread: 0.02 },
  },
  {
    id: 'hauler',
    name: 'Hauler',
    price: 3000,
    blurb: 'Four engines, a cargo pod for three crates and a tank to match.',
    power: 0.85, steer: 0.7,
    fuel: 190, hull: 190, cargo: 3, radius: 5,
    gun: { interval: 0.2, speed: 170, damage: 1, spread: 0.015 },
  },
  {
    id: 'striker',
    name: 'Striker',
    price: 5000,
    blurb: 'A fast attack craft with twin cannons. No room for cargo.',
    power: 1.2, steer: 1.15,
    fuel: 110, hull: 130, cargo: 0, radius: 4.2,
    gun: { interval: 0.07, speed: 270, damage: 1.5, spread: 0.008 },
  },
];

export const CRAFT_BY_ID = Object.fromEntries(CRAFTS.map((c) => [c.id, c]));
