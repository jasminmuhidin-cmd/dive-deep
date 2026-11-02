import { seeded } from "./seeded";

export type MosaicDot = { x: number; y: number; r: number; a: number };

type SampleOpts = {
  w: number;
  h: number;
  /** Grid pitch in drawing units — the gap from one dot's centre to the next */
  step?: number;
  /**
   * How far round each dot to look when sizing it, in drawing units: dots
   * shrink where the shape thins out or ends, so edges soften rather than cut
   * off. 0 for thin parts (tentacles, streamers) that would otherwise vanish.
   */
  soften?: number;
  seed: string;
  /** Extra filled circles drawn into the mask before sampling */
  circles?: Circle[];
  /** Circles cut back out of the silhouette, left bare (an eye, a porthole) */
  holes?: Circle[];
  /** Shifts the drawing into the box, for shapes drawn round a different origin */
  offset?: { x: number; y: number };
};

type Circle = { cx: number; cy: number; r: number };

/** The largest dot, as a share of the pitch — always leaves a gap, so it reads as dots, not a solid */
const FULL_DOT = 0.41;

/**
 * Stamp SVG path silhouettes onto an offscreen canvas and sample them as a
 * halftone dot grid: dots on a regular pitch, each sized by how much of the
 * shape surrounds it — full in the body, shrinking toward the edges, and a
 * touch smaller underneath, as if lit from above.
 */
export function mosaicFromPaths(paths: string[], opts: SampleOpts): MosaicDot[] {
  if (typeof document === "undefined") return [];
  const { w, h, seed, circles = [], holes = [], offset = { x: 0, y: 0 } } = opts;
  const step = opts.step ?? 2.6;
  const soften = opts.soften ?? step * 0.9;
  const canvas = document.createElement("canvas");
  const scale = 4;
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, offset.x * scale, offset.y * scale);
  ctx.fillStyle = "#fff";
  for (const d of paths) {
    try {
      const p = new Path2D(d);
      ctx.fill(p);
    } catch {
      // skip invalid path
    }
  }
  for (const c of circles) {
    ctx.beginPath();
    ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "destination-out";
  for (const c of holes) {
    ctx.beginPath();
    ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  /** How solid the shape is at a point in drawing units, 0–1 */
  const solidAt = (x: number, y: number) => {
    const ix = Math.floor(x * scale);
    const iy = Math.floor(y * scale);
    if (ix < 0 || iy < 0 || ix >= canvas.width || iy >= canvas.height) return 0;
    return data[(iy * canvas.width + ix) * 4 + 3] / 255;
  };
  /** The share of the neighbourhood round a point that's inside the shape */
  const coverAt = (x: number, y: number) => {
    if (soften <= 0) return 1;
    let sum = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) sum += solidAt(x + (dx * soften) / 2, y + (dy * soften) / 2);
    }
    return sum / 25;
  };

  const dots: MosaicDot[] = [];
  let i = 0;
  for (let y = step / 2; y < h; y += step) {
    for (let x = step / 2; x < w; x += step) {
      if (solidAt(x, y) < 0.2) continue;
      const lit = 1 - 0.2 * (y / h);
      const r = step * FULL_DOT * Math.sqrt(Math.min(1, coverAt(x, y) * 1.35)) * lit * (0.93 + seeded(seed, i++) * 0.14);
      if (r < step * 0.08) continue;
      dots.push({ x, y, r, a: 1 });
    }
  }
  return dots;
}

/**
 * The stipple painted once into an image, to use as a CSS mask over
 * `currentColor` — so a creature is a single layer that takes on any colour,
 * rather than thousands of circles in the page. `solid` circles are painted
 * whole on top (a pupil, say). Browser only.
 */
export function mosaicMaskUrl(
  paths: string[],
  opts: SampleOpts & { solid?: Circle[]; resolution?: number },
): string {
  const dots = mosaicFromPaths(paths, opts);
  const res = opts.resolution ?? 3;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(opts.w * res);
  canvas.height = Math.ceil(opts.h * res);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.setTransform(res, 0, 0, res, 0, 0);
  // only the alpha matters: this becomes a mask
  ctx.fillStyle = "#fff";
  for (const d of dots) {
    ctx.globalAlpha = d.a;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const { x: ox, y: oy } = opts.offset ?? { x: 0, y: 0 };
  for (const c of opts.solid ?? []) {
    ctx.beginPath();
    ctx.arc(c.cx + ox, c.cy + oy, c.r, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas.toDataURL("image/png");
}
