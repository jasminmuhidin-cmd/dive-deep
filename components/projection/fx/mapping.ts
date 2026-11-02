import { FX } from "./fxConfig";

/**
 * Camera ↔ screen mapping.
 *
 * The camera (usually 4:3) is "cover-fitted" onto the projection (usually
 * 16:9): the camera image is scaled to fill the screen and the overflow is
 * cropped, exactly like CSS `object-fit: cover`. Then it is mirrored and a
 * small calibration transform is applied so the projected dots land on the
 * real person.
 *
 *   s = screen uv (0–1, y down)        c = camera uv (0–1, y down)
 *   k = screenAspect / cameraAspect
 *   if k < 1 (camera wider):  cx = 0.5 + (sx' − 0.5)·k,  cy = sy
 *   else      (camera taller): cx = sx',                 cy = 0.5 + (sy − 0.5)/k
 *   where sx' = 1 − sx when mirrored.
 */
export function screenToCam(
  sx: number,
  sy: number,
  camAspect: number,
  screenAspect: number,
): [number, number] {
  const m = FX.vision.mirror ? 1 - sx : sx;
  const k = screenAspect / camAspect;
  let cx: number;
  let cy: number;
  if (k < 1) {
    cx = 0.5 + (m - 0.5) * k;
    cy = sy;
  } else {
    cx = m;
    cy = 0.5 + (sy - 0.5) / k;
  }
  const c = FX.vision.calib;
  return [
    0.5 + (cx - 0.5) * c.scaleX + c.offsetX,
    0.5 + (cy - 0.5) * c.scaleY + c.offsetY,
  ];
}

/** Exact inverse of screenToCam (used for wrist landmarks). */
export function camToScreen(
  cx0: number,
  cy0: number,
  camAspect: number,
  screenAspect: number,
): [number, number] {
  const c = FX.vision.calib;
  const cx = 0.5 + (cx0 - c.offsetX - 0.5) / c.scaleX;
  const cy = 0.5 + (cy0 - c.offsetY - 0.5) / c.scaleY;
  const k = screenAspect / camAspect;
  let m: number;
  let sy: number;
  if (k < 1) {
    m = 0.5 + (cx - 0.5) / k;
    sy = cy;
  } else {
    m = cx;
    sy = 0.5 + (cy - 0.5) * k;
  }
  return [FX.vision.mirror ? 1 - m : m, sy];
}

/** dt-correct exponential smoothing factor for a time constant τ. */
export function expAlpha(dt: number, tau: number): number {
  return tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
}

/**
 * One-Euro filter (Casiez et al. 2012): adaptive low-pass whose cutoff rises
 * with speed — heavy smoothing when the hand is still, almost none when it
 * sweeps. Ideal for jittery landmarks that must still feel responsive.
 */
export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  constructor(
    private minCutoff: number,
    private beta: number,
    private dCutoff: number,
  ) {}
  private static a(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  reset(v: number) {
    this.x = v;
    this.dx = 0;
  }
  filter(v: number, dt: number): number {
    if (this.x === null || dt <= 0) {
      this.x = v;
      return v;
    }
    const rawDx = (v - this.x) / dt;
    this.dx += OneEuro.a(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.a(cutoff, dt) * (v - this.x);
    return this.x;
  }
}
