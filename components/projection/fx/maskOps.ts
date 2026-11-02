/**
 * Small image operations on W×H float masks (0–1), used to turn MediaPipe's
 * noisy silhouette into a solid, steady body shape.
 */

/** Separable box blur, radius r (pixels): out ← blur(src). tmp is scratch. */
export function boxBlurWH(
  src: Float32Array,
  out: Float32Array,
  tmp: Float32Array,
  W: number,
  H: number,
  r: number,
) {
  if (r <= 0) {
    out.set(src);
    return;
  }
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < H; y++) {
    let acc = 0;
    const row = y * W;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(W - 1, Math.max(0, x))]!;
    for (let x = 0; x < W; x++) {
      tmp[row + x] = acc * inv;
      acc += src[row + Math.min(W - 1, x + r + 1)]! - src[row + Math.max(0, x - r)]!;
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(H - 1, Math.max(0, y)) * W + x]!;
    for (let y = 0; y < H; y++) {
      out[y * W + x] = acc * inv;
      acc += tmp[Math.min(H - 1, y + r + 1) * W + x]! - tmp[Math.max(0, y - r) * W + x]!;
    }
  }
}

export function smoothstep(lo: number, hi: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}
