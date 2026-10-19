// Game constants. World units are tiles; the y-axis points down, so
// smaller y is higher up. Values match the 1987 original unless noted.

// The original stored coordinates as 32-bit fixed point with one tile =
// 2^24. The terrain generator still works in that format so the landscape
// (and its colour pattern) comes out the same.
export const FIXED_ONE = 1 << 24;


// --- Landscape --------------------------------------------------------------

export const TILES_X = 13;                 // tile corners across the view
export const TILES_Z = 11;                 // tile corners into the view
export const LANDSCAPE_X = (TILES_X - 2) / 2;   // 5.5: half the view width
export const LANDSCAPE_Z = (TILES_Z - 1) + 10;  // 20: back of the view
export const LANDSCAPE_Z_FRONT = 10;            // front of the view
export const LANDSCAPE_Z_MID = 15;              // where the ship is drawn
export const LANDSCAPE_X_HALF = Math.floor(TILES_X / 2); // particle cull width
export const CAMERA_PLAYER_Z = TILES_Z - 6;     // camera sits 5 tiles behind

export const LAND_MID_HEIGHT = 5;
export const SEA_LEVEL = 0x05500000 / FIXED_ONE;           // 5.3125
export const LAUNCHPAD_ALTITUDE = 0x03500000 / FIXED_ONE;  // 3.3125
export const LAUNCHPAD_SIZE = 8;                            // tiles 0-7 square
export const WORLD_SIZE = 256;                              // map wraps every 256 tiles

// --- Ship -------------------------------------------------------------------

export const UNDERCARRIAGE_Y = 0x00640000 / FIXED_ONE;
export const LAUNCHPAD_Y = LAUNCHPAD_ALTITUDE - UNDERCARRIAGE_Y;
export const SAFE_HEIGHT = 1.5;            // clear of anything on the ground
export const LANDING_SPEED = 0x00200000 / FIXED_ONE;  // max |vx|+|vy|+|vz|
export const HIGHEST_ALTITUDE = 52;        // engines cut out above this

export const FRICTION = 1 / 64;            // velocity lost per tick
export const FULL_THRUST = 1 / 16;         // acceleration from the left button
export const HOVER_THRUST = 1 / 64;        // acceleration from the middle button
export const GRAVITY_START = 0x30000 / FIXED_ONE;
export const GRAVITY_STEPS = [             // gravity rises with the score
  { score: 1024, gravity: 0x50000 / FIXED_ONE },
  { score: 1488, gravity: 0x70000 / FIXED_ONE },
];

export const MAX_PITCH_STEP = 0x30000000;  // control damping limits (angle units)

// --- Game -------------------------------------------------------------------

export const INITIAL_SCORE = 500;
export const INITIAL_HIGH_SCORE = 500;
export const INITIAL_FUEL = 3413;
export const MAX_FUEL = 0x1400;
export const REFUEL_RATE = 0x20;
export const LIVES = 3;
export const BULLET_COST = 1;
export const OBJECT_SCORE = 20;
export const ROCKS_FROM_SCORE = 800;
export const CRASH_FRAMES = 31;
export const OBJECTS_TO_PLACE = 2049;
export const LAUNCHPAD_ROCKET = 9;

// --- Particles --------------------------------------------------------------

export const MAX_PARTICLES = 484;
export const SMOKE_RISING_SPEED = 0x00080000 / FIXED_ONE;
export const SMOKE_HEIGHT = 0.75;
export const SPLASH_HEIGHT = 1 / 16;
export const CRASH_CLOUD_Y = 5 / 16;
export const ROCK_HEIGHT = 32;
export const PLAYER_FRONT_Z = TILES_Z - 5;

// --- Screen -----------------------------------------------------------------

export const SCREEN_WIDTH = 320;
export const SCREEN_HEIGHT = 256;
export const TEXT_ROWS = 2;                // rows of 8x8 text above the view
export const VIEW_TOP = TEXT_ROWS * 8;     // first pixel row of the 3D view
export const VIEW_HEIGHT = 239;            // pixel rows the 3D view may use
export const PROJECTION_X = 160;           // screen centre x
export const PROJECTION_Y = 64;            // screen y of the horizon line
export const PROJECTION_SCALE = 256;       // pixels per unit of x/z
