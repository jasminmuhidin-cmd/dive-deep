// ---------------------------------------------------------------------------
// noise.js — small, seeded, tileable noise textures for the water's current layers.
//
// A tile is a NOISE_N × NOISE_N grid of smooth values (roughly −1…1) that wraps in both
// directions, so a layer can slide across it forever without a seam. Built once at
// start-up from a few octaves of lattice value noise; sampled with bilinear filtering.
// Pure: no DOM, deterministic for a given seed.
// ---------------------------------------------------------------------------

export const NOISE_N = 128;

/** Small fast seeded PRNG (mulberry32). */
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t) => t * t * (3 - 2 * t);

/**
 * @param {number} seed
 * @param {number[]} [octaves] lattice cells per side for each octave (each must divide NOISE_N)
 * @param {number[]} [weights] amplitude of each octave
 * @returns {Float32Array} NOISE_N*NOISE_N, zero-mean, unit-ish variance, tileable
 */
export function makeNoiseTile(seed, octaves = [4, 8, 16], weights = [1, 0.55, 0.3]) {
  const N = NOISE_N;
  const rng = makeRng(seed);
  const tile = new Float32Array(N * N);
  octaves.forEach((G, o) => {
    const lattice = new Float32Array(G * G);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rng() * 2 - 1;
    const cell = N / G;
    for (let y = 0; y < N; y++) {
      const gy = y / cell, y0 = Math.floor(gy), fy = smooth(gy - y0);
      const ya = (y0 % G) * G, yb = ((y0 + 1) % G) * G;
      for (let x = 0; x < N; x++) {
        const gx = x / cell, x0 = Math.floor(gx), fx = smooth(gx - x0);
        const xa = x0 % G, xb = (x0 + 1) % G;
        const top = lattice[ya + xa] + (lattice[ya + xb] - lattice[ya + xa]) * fx;
        const bot = lattice[yb + xa] + (lattice[yb + xb] - lattice[yb + xa]) * fx;
        tile[y * N + x] += (top + (bot - top) * fy) * weights[o];
      }
    }
  });
  let mean = 0;
  for (let i = 0; i < tile.length; i++) mean += tile[i];
  mean /= tile.length;
  let varSum = 0;
  for (let i = 0; i < tile.length; i++) { tile[i] -= mean; varSum += tile[i] * tile[i]; }
  const inv = 1 / Math.sqrt(varSum / tile.length || 1);
  for (let i = 0; i < tile.length; i++) tile[i] *= inv * 0.5;      // std ≈ 0.5: values mostly within ±1
  return tile;
}

/** Bilinear sample; (tx, ty) in texels, any real value (wraps). */
export function sampleTile(tile, tx, ty) {
  const M = NOISE_N - 1;
  const fx = Math.floor(tx), fy = Math.floor(ty);
  const ax = tx - fx, ay = ty - fy;
  const x0 = fx & M, y0 = fy & M, x1 = (x0 + 1) & M, y1 = (y0 + 1) & M;
  const r0 = y0 * NOISE_N, r1 = y1 * NOISE_N;
  const top = tile[r0 + x0] + (tile[r0 + x1] - tile[r0 + x0]) * ax;
  const bot = tile[r1 + x0] + (tile[r1 + x1] - tile[r1 + x0]) * ax;
  return top + (bot - top) * ay;
}
