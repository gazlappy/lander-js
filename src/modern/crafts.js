// The ships you can fly. Accelerations are in m/s^2, fuel in units, burn
// rates in units per second, tilt in radians, response rates per second.

export const CRAFTS = [
  {
    id: 'classic',
    name: 'Lander Mk I',
    price: 0,
    blurb: 'The 1987 original, rebuilt. Balanced, forgiving and cheap to run.',
    thrust: 23, hover: 12, maxTilt: 1.0, tiltRate: 2.8, yawRate: 2.2, drag: 0.16,
    fuel: 100, burnFull: 4.0, burnHover: 1.6, hull: 100, cargo: 1, radius: 3.6,
    gun: { interval: 0.1, speed: 190, damage: 1, spread: 0.012 },
  },
  {
    id: 'hopper',
    name: 'Hopper',
    price: 1500,
    blurb: 'A nimble pod with a big engine. Twitchy, thirsty and fragile.',
    thrust: 29, hover: 14, maxTilt: 1.2, tiltRate: 4.2, yawRate: 3.2, drag: 0.13,
    fuel: 70, burnFull: 3.4, burnHover: 1.3, hull: 70, cargo: 1, radius: 2.8,
    gun: { interval: 0.14, speed: 170, damage: 1, spread: 0.02 },
  },
  {
    id: 'hauler',
    name: 'Hauler',
    price: 3000,
    blurb: 'Four engines, a cargo pod for three crates and a tank to match.',
    thrust: 18, hover: 11.5, maxTilt: 0.75, tiltRate: 1.9, yawRate: 1.4, drag: 0.22,
    fuel: 190, burnFull: 4.6, burnHover: 1.9, hull: 190, cargo: 3, radius: 5,
    gun: { interval: 0.2, speed: 170, damage: 1, spread: 0.015 },
  },
  {
    id: 'striker',
    name: 'Striker',
    price: 5000,
    blurb: 'A fast attack craft with twin cannons. No room for cargo.',
    thrust: 31, hover: 12.5, maxTilt: 1.15, tiltRate: 3.6, yawRate: 2.8, drag: 0.1,
    fuel: 110, burnFull: 5.0, burnHover: 1.8, hull: 130, cargo: 0, radius: 4.2,
    gun: { interval: 0.07, speed: 270, damage: 1.5, spread: 0.008 },
  },
];

export const CRAFT_BY_ID = Object.fromEntries(CRAFTS.map((c) => [c.id, c]));
