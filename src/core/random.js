// The original's 64-bit shift-register generator. Keeping it means the
// object map is laid out exactly as it was in 1987.

export class Random {
  constructor() {
    this.reseed();
  }

  reseed(seed1 = 0x4F9C3490, seed2 = 0xDA0383CF) {
    this.seed1 = seed1 | 0;
    this.seed2 = seed2 | 0;
  }

  // Advances the generator and returns two fresh 32-bit signed values
  next() {
    const s1 = this.seed1, s2 = this.seed2;
    const carryIn = s2 & 1;
    let t = ((carryIn << 31) | (s1 >>> 1)) | 0;
    const carryOut = s1 & 1;
    const n1 = (s2 + s2 + carryOut) | 0;
    t ^= s1 << 12;
    const n2 = (t ^ (t >>> 20)) | 0;
    this.seed1 = n1;
    this.seed2 = n2;
    this.a = n2;
    this.b = n1;
    return n2;
  }

  // Signed value in [-range, range) where range = 2^(31 - shift)
  signed(shift) {
    return this.next() >> shift;
  }

  // Unsigned value in [0, 2^(32 - shift))
  unsigned(shift) {
    return this.next() >>> shift;
  }
}
