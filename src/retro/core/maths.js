// Angles are kept as wrapping 32-bit integers, as in the original, so the
// damping maths can rely on signed overflow to take the short way round.

// Lookup tables as the original built them
const SIN = new Int32Array(1024);
for (let i = 0; i < 1024; i++) SIN[i] = Math.trunc((2 ** 31 - 1) * Math.sin((2 * Math.PI * i) / 1024));
const ATAN = new Int32Array(128);
for (let i = 0; i < 128; i++) ATAN[i] = Math.trunc(((2 ** 31 - 1) / Math.PI) * Math.atan(i / 128));
const SQRT = new Int32Array(1024);
for (let i = 0; i < 1024; i++) SQRT[i] = Math.trunc((2 ** 31 - 1) * Math.sqrt(i / 1024));

// sin of a 32-bit angle from the 1024-entry table, as a 1.31 fixed-point value
const sinFixed = (angle) => SIN[(angle >>> 22) & 1023];
const cosFixed = (angle) => SIN[((angle + 0x40000000) >>> 22) & 1023];

// The original's fast multiply of two 1.31 fixed-point values. Only the top
// seven bits of `m` take part, so results are accurate to about 1 in 128;
// the ship's handling depends on this, so it's reproduced exactly.
function coarseMultiply(m, v) {
  const negative = (m ^ v) < 0;
  let a = Math.abs(m) >>> 0;
  let carry = (a >>> 30) & 1;
  a = ((((a << 2) >>> 0) & 0xFE000000) | 0x01000000) >>> 0;
  let b = (Math.abs(v) * 2) >>> 0;
  let sum = 0;
  do {
    b >>>= 1;
    if (carry) sum += b;
    carry = a >>> 31;
    a = (a << 1) >>> 0;
  } while (a !== 0);
  sum = Math.floor(sum / 2);
  return negative ? -sum : sum;
}

// The original's 8-bit-precision square of a 32-bit value, giving v^2 / 2^32
function coarseSquare(v) {
  let sum = 0;
  for (let k = 1; k <= 8; k++) if ((v >>> (32 - k)) & 1) sum += v >>> k;
  return (sum + (v >>> 9)) >>> 0;
}

// Convert a mouse offset (each axis -512 to 512) to polar form, using the
// original's low-precision tables. The coarse maths matters to the feel:
// the angle has 128 steps per octant, and offsets under ~32 units read as
// zero distance, which gives the controls a small dead zone in the middle.
// Returns [distance, angle] as 32-bit values.
export function mouseToPolar(mx, my) {
  let quadrant = 0;
  if (mx < 0) quadrant ^= 3;
  if (my < 0) quadrant ^= 7;
  const ax = Math.abs(mx), ay = Math.abs(my);
  if (ax < ay) quadrant ^= 1;
  const num = ax < ay ? ax : ay, den = ax < ay ? ay : ax;
  // 8-bit fraction num/den, all ones when both are zero
  const fraction = den === 0 ? 255 : Math.min(Math.floor((num * 256) / den), 255);
  const a = ATAN[fraction >> 1];
  const angle = quadrant & 1 ? (((quadrant + 1) << 29) - a) | 0 : (a + (quadrant << 29)) | 0;
  const sumSquares = (coarseSquare((ax << 22) >>> 0) + coarseSquare((ay << 22) >>> 0)) >>> 0;
  const distance = SQRT[(sumSquares >>> 22) & 1023];
  return [distance, angle];
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// A 3x3 orientation matrix stored as its three column vectors:
// nose (forwards), roof (down through the floor) and side.
export class Orientation {
  constructor() {
    this.nose = [1, 0, 0];
    this.roof = [0, 1, 0];
    this.side = [0, 0, 1];
  }

  // Pitch by angle a, then turn by angle b (both 32-bit angles), using the
  // original's table lookups and coarse products
  set(a, b) {
    const sa = sinFixed(a), ca = cosFixed(a), sb = sinFixed(b), cb = cosFixed(b);
    const f = 2 ** 31;
    this.nose[0] = coarseMultiply(ca, cb) / f;
    this.nose[1] = sa / f;
    this.nose[2] = -coarseMultiply(sb, ca) / f;
    this.roof[0] = -coarseMultiply(sa, cb) / f;
    this.roof[1] = ca / f;
    this.roof[2] = coarseMultiply(sa, sb) / f;
    this.side[0] = sb / f;
    this.side[1] = 0;
    this.side[2] = cb / f;
    return this;
  }

  // out = M . v
  apply(v, out) {
    const x = v[0], y = v[1], z = v[2];
    out[0] = this.nose[0] * x + this.roof[0] * y + this.side[0] * z;
    out[1] = this.nose[1] * x + this.roof[1] * y + this.side[1] * z;
    out[2] = this.nose[2] * x + this.roof[2] * y + this.side[2] * z;
    return out;
  }
}
