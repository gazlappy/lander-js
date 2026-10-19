// 3D models. Coordinates are in tiles, with y pointing down (negative y is
// up). Face normals are unit-ish vectors used for back-face culling on
// rotating objects and for shading; colours are 12-bit 0xRGB.

export const ROTATES = 1;
export const HAS_SHADOW = 2;

export const ROCK = {
  flags: ROTATES | HAS_SHADOW,
  vertices: [
    [0, 0, 0.625],
    [0.625, 0.625, 0],
    [-0.625, 0.625, 0],
    [0.625, -0.625, 0],
    [-0.625, -0.625, 0],
    [0, 0, -0.625],
  ],
  faces: [
    { normal: [0, 0.6629, 0.6629], vertices: [0, 1, 2], colour: 0x444 },
    { normal: [0.6629, 0, 0.6629], vertices: [0, 3, 1], colour: 0x444 },
    { normal: [0, -0.6629, 0.6629], vertices: [0, 4, 3], colour: 0x444 },
    { normal: [-0.6629, 0, 0.6629], vertices: [0, 2, 4], colour: 0x444 },
    { normal: [0, 0.6629, -0.6629], vertices: [5, 1, 2], colour: 0x444 },
    { normal: [0.6629, 0, -0.6629], vertices: [5, 3, 1], colour: 0x444 },
    { normal: [0, -0.6629, -0.6629], vertices: [5, 4, 3], colour: 0x444 },
    { normal: [-0.6629, 0, -0.6629], vertices: [5, 2, 4], colour: 0x444 },
  ],
};

export const PYRAMID = {
  flags: ROTATES,
  vertices: [
    [0, 1, 0],
    [0.75, -0.5, 0.75],
    [-0.75, -0.5, 0.75],
    [0.75, -0.5, -0.75],
    [-0.75, -0.5, -0.75],
  ],
  faces: [
    { normal: [0, 0.4193, 0.8385], vertices: [0, 1, 2], colour: 0x800 },
    { normal: [0.8385, 0.4193, 0], vertices: [0, 3, 1], colour: 0x088 },
    { normal: [0, 0.4193, -0.8385], vertices: [0, 4, 3], colour: 0x880 },
    { normal: [-0.8385, 0.4193, 0], vertices: [0, 2, 4], colour: 0x808 },
    { normal: [0, -0.9375, 0], vertices: [1, 2, 3], colour: 0x444 },
    { normal: [0, -0.9375, 0], vertices: [2, 3, 4], colour: 0x008 },
  ],
};

export const PLAYER_SHIP = {
  flags: ROTATES | HAS_SHADOW,
  vertices: [
    [1, 0.3125, 0.5],
    [1, 0.3125, -0.5],
    [0, 0.0391, -1.2],
    [-0.9, 0.3125, 0],
    [0, 0.0391, 1.2],
    [-0.1, -0.4688, 0],
    [0.3333, 0.3125, 0.25],
    [0.3333, 0.3125, -0.25],
    [-0.2, 0.3125, 0],
  ],
  faces: [
    { normal: [0.5429, -0.7643, 0], vertices: [0, 1, 5], colour: 0x080 },
    { normal: [0.4216, -0.7832, -0.2963], vertices: [1, 2, 5], colour: 0x040 },
    { normal: [0.4216, -0.7832, 0.2963], vertices: [0, 5, 4], colour: 0x040 },
    { normal: [-0.6161, -0.6309, -0.3183], vertices: [2, 3, 5], colour: 0x040 },
    { normal: [-0.6161, -0.6309, 0.3183], vertices: [3, 4, 5], colour: 0x040 },
    { normal: [-0.0672, 0.8995, -0.2554], vertices: [1, 2, 3], colour: 0x088 },
    { normal: [-0.0672, 0.8995, 0.2554], vertices: [0, 3, 4], colour: 0x088 },
    { normal: [0, 0.9375, 0], vertices: [0, 1, 3], colour: 0x044 },
    { normal: [0, 0.9375, 0], vertices: [6, 7, 8], colour: 0xC80 },
  ],
};

export const SMALL_LEAFY_TREE = {
  flags: HAS_SHADOW,
  vertices: [
    [0.1875, -1.5, 0.1875],
    [-0.15, 0, 0],
    [0.15, 0, 0],
    [0, -1.05, -0.75],
    [0.5, -0.75, -0.5],
    [-0.75, -1.2, -0.1667],
    [-0.5, -1.35, 0.25],
    [0.5, -1.65, 0.1667],
    [0.75, -1.35, -0.25],
    [-0.375, -1.2, 0.6],
    [0.75, -0.75, 0.75],
  ],
  faces: [
    { normal: [0.1611, -0.6284, 0.6768], vertices: [0, 9, 10], colour: 0x040 },
    { normal: [0, 0, 0], vertices: [0, 1, 2], colour: 0x400 },
    { normal: [0.575, -0.6161, -0.4107], vertices: [0, 3, 4], colour: 0x080 },
    { normal: [-0.2123, -0.8923, -0.1939], vertices: [0, 5, 6], colour: 0x080 },
    { normal: [-0.3325, -0.6045, -0.6348], vertices: [0, 7, 8], colour: 0x080 },
  ],
};

export const TALL_LEAFY_TREE = {
  flags: HAS_SHADOW,
  vertices: [
    [0.2143, -2.55, 0.1875],
    [-0.1875, 0, 0],
    [0.1875, 0, 0],
    [0, -1.95, -0.75],
    [0.5, -1.65, -0.5],
    [-0.675, -1.8, -0.2143],
    [-0.75, -1.35, 0.375],
    [0, -0.9, -0.6],
    [-0.5, -0.75, -0.375],
    [-0.375, -1.5, 0.6],
    [0.75, -1.2, 0.75],
    [-0.3, -0.9, 0.9],
    [0.5, -0.75, 0.75],
    [0.1875, -1.65, 0.1875],
  ],
  faces: [
    { normal: [-0.0216, -0.3532, 0.8682], vertices: [0, 9, 10], colour: 0x040 },
    { normal: [0.2378, -0.5386, 0.7296], vertices: [13, 11, 12], colour: 0x080 },
    { normal: [0, 0, 0], vertices: [0, 1, 2], colour: 0x400 },
    { normal: [0.5769, -0.5554, -0.4874], vertices: [0, 3, 4], colour: 0x080 },
    { normal: [-0.6474, -0.5761, 0.3575], vertices: [0, 5, 6], colour: 0x040 },
    { normal: [-0.4292, -0.6522, -0.519], vertices: [13, 7, 8], colour: 0x040 },
  ],
};

export const SMOKING_REMAINS_LEFT = {
  flags: 0,
  vertices: [
    [-0.15, 0, 0],
    [0.15, 0, 0],
    [0.1687, -0.25, 0],
    [0.1875, -0.5, 0],
    [-0.1667, -1.2, 0],
  ],
  faces: [
    { normal: [0, 0, 0], vertices: [0, 1, 3], colour: 0x000 },
    { normal: [0, 0, 0], vertices: [2, 3, 4], colour: 0x000 },
  ],
};

export const SMOKING_REMAINS_RIGHT = {
  flags: 0,
  vertices: [
    [0.1667, 0, 0],
    [-0.1667, 0, 0],
    [-0.1687, -0.1875, 0],
    [-0.1875, -0.375, 0],
    [0.1667, -1.35, 0],
  ],
  faces: [
    { normal: [0, 0, 0], vertices: [0, 1, 3], colour: 0x000 },
    { normal: [0, 0, 0], vertices: [2, 3, 4], colour: 0x000 },
  ],
};

export const FIR_TREE = {
  flags: HAS_SHADOW,
  vertices: [
    [-0.375, -0.2143, -0.2143],
    [0.375, -0.2143, -0.2143],
    [0, -1.8, 0.2143],
    [0.15, 0, 0],
    [-0.15, 0, 0],
  ],
  faces: [
    { normal: [0, 0, 0], vertices: [2, 3, 4], colour: 0x400 },
    { normal: [0, -0.2446, -0.905], vertices: [0, 1, 2], colour: 0x040 },
  ],
};

export const GAZEBO = {
  flags: HAS_SHADOW,
  vertices: [
    [0, -1, 0],
    [-0.5, -0.75, 0.5],
    [-0.5, -0.75, -0.5],
    [0.5, -0.75, -0.5],
    [0.5, -0.75, 0.5],
    [-0.5, 0, 0.5],
    [-0.5, 0, -0.5],
    [0.5, 0, -0.5],
    [0.5, 0, 0.5],
    [-0.4, -0.75, 0.5],
    [-0.4, -0.75, -0.5],
    [0.4, -0.75, -0.5],
    [0.4, -0.75, 0.5],
  ],
  faces: [
    { normal: [0, 0, 0.9375], vertices: [1, 5, 9], colour: 0x444 },
    { normal: [0, 0, -0.9375], vertices: [2, 6, 10], colour: 0x444 },
    { normal: [0, -0.8385, 0.4193], vertices: [0, 1, 4], colour: 0x400 },
    { normal: [0, 0, -0.9375], vertices: [3, 7, 11], colour: 0x444 },
    { normal: [0, 0, 0.9375], vertices: [4, 8, 12], colour: 0x444 },
    { normal: [-0.4193, -0.8385, 0], vertices: [0, 1, 2], colour: 0x840 },
    { normal: [0.4193, -0.8385, 0], vertices: [0, 3, 4], colour: 0x840 },
    { normal: [0, -0.8385, -0.4193], vertices: [0, 2, 3], colour: 0x400 },
  ],
};

export const BUILDING = {
  flags: 0,
  vertices: [
    [-0.9, -0.85, 0],
    [-0.75, -0.85, 0],
    [0.75, -0.85, 0],
    [0.9, -0.85, 0],
    [-0.9, -0.45, 0.65],
    [-0.9, -0.45, -0.65],
    [0.9, -0.45, 0.65],
    [0.9, -0.45, -0.65],
    [-0.75, -0.6, 0.5],
    [-0.75, -0.6, -0.5],
    [0.75, -0.6, 0.5],
    [0.75, -0.6, -0.5],
    [-0.75, 0, 0.5],
    [-0.75, 0, -0.5],
    [0.75, 0, 0.5],
    [0.75, 0, -0.5],
  ],
  faces: [
    { normal: [0, -0.7984, 0.4913], vertices: [0, 4, 6], colour: 0x400 },
    { normal: [0, -0.7984, 0.4913], vertices: [0, 3, 6], colour: 0x400 },
    { normal: [-0.9375, 0, 0], vertices: [1, 8, 9], colour: 0xDDD },
    { normal: [0.9375, 0, 0], vertices: [2, 10, 11], colour: 0x555 },
    { normal: [-0.9375, 0, 0], vertices: [8, 12, 13], colour: 0xFFF },
    { normal: [-0.9375, 0, 0], vertices: [8, 9, 13], colour: 0xFFF },
    { normal: [0.9375, 0, 0], vertices: [10, 14, 15], colour: 0x777 },
    { normal: [0.9375, 0, 0], vertices: [10, 11, 15], colour: 0x777 },
    { normal: [0, 0, -0.9375], vertices: [9, 13, 15], colour: 0xBBB },
    { normal: [0, 0, -0.9375], vertices: [9, 11, 15], colour: 0xBBB },
    { normal: [0, -0.7984, -0.4913], vertices: [0, 5, 7], colour: 0x800 },
    { normal: [0, -0.7984, -0.4913], vertices: [0, 3, 7], colour: 0x800 },
  ],
};

export const SMOKING_BUILDING = {
  flags: 0,
  vertices: [
    [-0.75, 0, 0.5],
    [-0.75, 0, -0.5],
    [0.75, 0, 0.5],
    [0.75, 0, -0.5],
    [-0.75, -0.4, 0.5],
    [0.75, -0.3, -0.5],
  ],
  faces: [
    { normal: [0, 0.9375, 0], vertices: [0, 1, 2], colour: 0x000 },
    { normal: [0, 0.9375, 0], vertices: [1, 2, 3], colour: 0x000 },
    { normal: [0, 0, 0.9375], vertices: [0, 2, 4], colour: 0x333 },
    { normal: [-0.9375, 0, 0], vertices: [0, 1, 4], colour: 0x666 },
    { normal: [0.9375, 0, 0], vertices: [2, 3, 5], colour: 0x555 },
    { normal: [0, 0, -0.9375], vertices: [1, 3, 5], colour: 0x777 },
  ],
};

export const SMOKING_GAZEBO = {
  flags: HAS_SHADOW,
  vertices: [
    [0, -0.45, -0.0625],
    [0.1, -0.45, -0.0625],
    [0.5, 0, 0.5],
    [-0.5, 0, 0.5],
    [0.5, 0, -0.5],
    [-0.5, 0, -0.5],
  ],
  faces: [
    { normal: [0, -0.7321, 0.5857], vertices: [0, 1, 2], colour: 0x000 },
    { normal: [0, -0.7321, 0.5857], vertices: [0, 1, 3], colour: 0x333 },
    { normal: [0, -0.6535, -0.6722], vertices: [0, 1, 4], colour: 0x444 },
    { normal: [0, -0.6535, -0.6722], vertices: [0, 1, 5], colour: 0x000 },
  ],
};

export const ROCKET = {
  flags: HAS_SHADOW,
  vertices: [
    [0, -1.75, 0],
    [-0.2188, -0.1591, 0.2188],
    [-0.2188, -0.1591, -0.2188],
    [0.2188, -0.1591, 0.2188],
    [0.2188, -0.1591, -0.2188],
    [-0.4375, 0, 0.4375],
    [-0.4375, 0, -0.4375],
    [0.4375, 0, 0.4375],
    [0.4375, 0, -0.4375],
    [-0.1094, -0.9722, 0.1094],
    [-0.1094, -0.9722, -0.1094],
    [0.1094, -0.9722, 0.1094],
    [0.1094, -0.9722, -0.1094],
  ],
  faces: [
    { normal: [0, 0, 0], vertices: [9, 1, 5], colour: 0xCC0 },
    { normal: [0, 0, 0], vertices: [11, 3, 7], colour: 0xCC0 },
    { normal: [0, -0.1277, 0.9288], vertices: [0, 1, 3], colour: 0xC00 },
    { normal: [-0.9288, -0.1277, 0], vertices: [0, 1, 2], colour: 0x800 },
    { normal: [0.9288, -0.1277, 0], vertices: [3, 0, 4], colour: 0x800 },
    { normal: [0, -0.1277, -0.9288], vertices: [0, 2, 4], colour: 0xC00 },
    { normal: [0, 0, 0], vertices: [10, 2, 6], colour: 0xCC0 },
    { normal: [0, 0, 0], vertices: [12, 4, 8], colour: 0xCC0 },
  ],
};

// Object map entries 1-11 are intact objects; adding DESTROYED_OFFSET gives
// the wreckage that replaces them once shot.
export const DESTROYED_OFFSET = 12;

export const OBJECT_TYPES = [
  PYRAMID,                // 0  (unused)
  SMALL_LEAFY_TREE,       // 1
  TALL_LEAFY_TREE,        // 2
  SMALL_LEAFY_TREE,       // 3
  SMALL_LEAFY_TREE,       // 4
  GAZEBO,                 // 5
  TALL_LEAFY_TREE,        // 6
  FIR_TREE,               // 7
  BUILDING,               // 8
  ROCKET,                 // 9  (launchpad rockets)
  ROCKET,                 // 10
  ROCKET,                 // 11
  ROCKET,                 // 12 (unused)
  SMOKING_REMAINS_RIGHT,  // 13
  SMOKING_REMAINS_LEFT,   // 14
  SMOKING_REMAINS_LEFT,   // 15
  SMOKING_REMAINS_LEFT,   // 16
  SMOKING_GAZEBO,         // 17
  SMOKING_REMAINS_RIGHT,  // 18
  SMOKING_REMAINS_RIGHT,  // 19
  SMOKING_BUILDING,       // 20
  SMOKING_REMAINS_RIGHT,  // 21
  SMOKING_REMAINS_LEFT,   // 22
  SMOKING_REMAINS_LEFT,   // 23
];
