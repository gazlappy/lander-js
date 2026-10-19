// Colours are specified as 4-bit-per-channel (r, g, b). The Archimedes
// showed them through its fixed 256-colour palette, which can't represent
// every combination; "authentic" mode reproduces that quantisation, while
// "true colour" mode shows the intended 12-bit colour.

// Pack r, g, b (0-15) into the VIDC 256-colour byte, bit for bit as the
// original did (including what happens to out-of-range channels)
export function vidcByte(r, g, b) {
  let v = (((g | b) & 3) | r) & 7;
  if (r & 8) v |= 0x10;
  v |= (g & 12) << 3;
  if (b & 4) v |= 0x08;
  if (b & 8) v |= 0x80;
  return v;
}

const rgba = (r, g, b) => ((0xFF << 24) | ((b * 17) << 16) | ((g * 17) << 8) | (r * 17)) >>> 0;

// The default Archimedes 256-colour palette as RGBA pixels
export const VIDC_PALETTE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  const t = i & 3;
  VIDC_PALETTE[i] = rgba(
    t | ((i >> 2) & 1) << 2 | ((i >> 4) & 1) << 3,
    t | ((i >> 5) & 1) << 2 | ((i >> 6) & 1) << 3,
    t | ((i >> 3) & 1) << 2 | ((i >> 7) & 1) << 3,
  );
}

export const BLACK = VIDC_PALETTE[0];

export function makeColourMapper(trueColour) {
  if (trueColour) {
    const c = (v) => (v < 0 ? 0 : v > 15 ? 15 : v);
    return (r, g, b) => rgba(c(r), c(g), c(b));
  }
  return (r, g, b) => VIDC_PALETTE[vidcByte(r, g, b)];
}

export const fromVidc = (byte) => VIDC_PALETTE[byte & 255];
