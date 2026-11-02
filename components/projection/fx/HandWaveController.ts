import { FX } from "./fxConfig";
import { camToScreen, expAlpha, OneEuro } from "./mapping";
import type { BodyVisionFrame } from "./useBodyVision";

export const MAX_HANDS = 4;

export type HandOut = {
  x: number;
  y: number;
  /** Filtered velocity, screen units / s. */
  vx: number;
  vy: number;
  /** Smoothed velocity used for the visual warp. */
  svx: number;
  svy: number;
  /** 0–1: fades in on acquire, out on loss. */
  strength: number;
};

type Track = {
  id: number;
  fx: OneEuro;
  fy: OneEuro;
  x: number;
  y: number;
  vx: number;
  vy: number;
  svx: number;
  svy: number;
  lastT: number;
  strength: number;
  seen: boolean;
};

/**
 * Critically-damped spring:  x'' = ω²(target − x) − 2ω·x'
 * Reaches the target as fast as possible WITHOUT overshoot, and its velocity
 * is continuous — parameter changes ease in and out instead of cornering.
 */
class Spring {
  v = 0;
  constructor(public x: number) {}
  step(target: number, omega: number, dt: number) {
    // Semi-implicit integration, sub-stepped for stability at low fps.
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (omega * omega * (target - this.x) - 2 * omega * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

/**
 * Turns wrist landmarks into calm wave parameters.
 *
 *  1. Wrist camera-uv → screen-uv; One-Euro filter; velocity v = Δp / Δt.
 *  2. Horizontal speed  s = max |vx|  over visible hands.
 *  3. Energy envelope (unhurried attack, long release):
 *        E += (s − E)·(1 − e^(−dt/τ)),   τ = s > E ? τ_attack : τ_release
 *  4. Soft saturation — never a hard clip, so frantic waving still only
 *     asymptotically approaches the maximum:
 *        e = 1 − exp(−max(0, E − deadzone) / vSoft)
 *  5. Targets  A* = lerp(A_idle, A_max, e),  f* = lerp(f_idle, f_max, e²),
 *              ω* = lerp(ω_idle, ω_max, e)
 *     Frequency rises with e² so gentle movement only swells the waves;
 *     only sustained movement tightens them.
 *  6. A, f, ω each follow their target through a critically-damped spring.
 *  7. Phase is integrated:  φ += ω·dir·dt  (never sin(k·y − ω·t), which jumps
 *     whenever ω changes). dir eases toward sign(vx) so the waves drift the
 *     way the hand moves.
 */
export class HandWaveController {
  private tracks: Track[] = [];
  private nextId = 1;
  private lastSeq = -1;
  private E = 0;
  private dir = 1;
  /** Doubled-angle travel axis (cos 2θ, sin 2θ): eases without flipping. */
  private ax2 = 1;
  private ay2 = 0;
  private sAmp = new Spring(FX.waves.ampIdle);
  private sFreq = new Spring(FX.waves.freqIdle);
  private sOmega = new Spring(FX.waves.speedIdle);

  amp: number = FX.waves.ampIdle;
  freq: number = FX.waves.freqIdle;
  phase = 0;
  energy = 0;
  /** Unit travel direction of the shore waves (screen, y down). */
  dirX = 1;
  dirY = 0;
  hands: HandOut[] = [];

  update(frame: BodyVisionFrame, screenAspect: number, dt: number) {
    if (frame.seq !== this.lastSeq) {
      this.lastSeq = frame.seq;
      this.ingest(frame, screenAspect);
    }

    // Stale tracks (person left / occluded): fade and decay velocity.
    const now = performance.now();
    for (const t of this.tracks) {
      const stale = now - t.lastT > 250;
      t.strength += ((stale ? 0 : 1) - t.strength) * expAlpha(dt, stale ? 0.8 : 0.4);
      if (stale) {
        const k = expAlpha(dt, 0.5);
        t.vx -= t.vx * k;
        t.vy -= t.vy * k;
      }
      // Extra-smoothed velocity for the visual sway (seconds-scale).
      // Short smoothing: the warp should follow the hand closely.
      // Short smoothing: the warp follows the hand closely.
      t.svx += (t.vx - t.svx) * expAlpha(dt, 0.12);
      t.svy += (t.vy - t.svy) * expAlpha(dt, 0.12);
    }
    this.tracks = this.tracks.filter(
      (t) => t.strength > 0.01 || now - t.lastT < 250,
    );

    // Strongest-moving hand drives the waves: its SPEED (any direction)
    // sets the strength, its direction sets where the crests travel.
    let s = 0;
    let mvx = 0;
    let mvy = 0;
    for (const t of this.tracks) {
      const m = Math.hypot(t.vx, t.vy) * t.strength;
      if (m > s) {
        s = m;
        mvx = t.vx;
        mvy = t.vy;
      }
    }
    const signed = s;

    const H = FX.hands;
    this.E += (s - this.E) * expAlpha(dt, s > this.E ? H.attackTau : H.releaseTau);
    const e = 1 - Math.exp(-Math.max(0, this.E - H.deadzone) / H.vSoft);
    this.energy = e;

    if (signed > H.deadzone && FX.waves.horizontalOnly) {
      // Vertical crests that travel sideways only: the hand's left/right
      // motion picks the direction, up/down motion just adds strength.
      if (Math.abs(mvx) > H.deadzone * 0.5)
        this.dir += (Math.sign(mvx) - this.dir) * expAlpha(dt, H.dirTau);
      this.dirX = 1;
      this.dirY = 0;
    } else if (signed > H.deadzone) {
      // Ease the travel AXIS in doubled-angle space (so a hand sweeping back
      // and forth keeps one axis instead of spinning), and the sign along it
      // separately — the waves turn slowly toward the motion, never snap.
      const a = Math.atan2(mvy, mvx);
      const k = expAlpha(dt, H.dirTau);
      this.ax2 += (Math.cos(2 * a) - this.ax2) * k;
      this.ay2 += (Math.sin(2 * a) - this.ay2) * k;
      const half = Math.atan2(this.ay2, this.ax2) / 2;
      const ux = Math.cos(half);
      const uy = Math.sin(half);
      const along = Math.sign(mvx * ux + mvy * uy) || 1;
      this.dir += (along - this.dir) * expAlpha(dt, H.dirTau);
      this.dirX = ux;
      this.dirY = uy;
    }

    const W = FX.waves;
    const w0 = H.springOmega;
    this.amp = this.sAmp.step(lerp(W.ampIdle, W.ampMax, e), w0, dt);
    this.freq = this.sFreq.step(lerp(W.freqIdle, W.freqMax, e * e), w0 * 0.7, dt);
    const omega = this.sOmega.step(lerp(W.speedIdle, W.speedMax, e), w0, dt);
    this.phase = (this.phase + omega * this.dir * dt) % (Math.PI * 2000);

    this.hands = this.tracks.slice(0, MAX_HANDS).map((t) => ({
      x: t.x,
      y: t.y,
      vx: t.vx,
      vy: t.vy,
      svx: t.svx,
      svy: t.svy,
      strength: t.strength,
    }));
  }

  /** New vision frame → associate wrists with tracks (greedy nearest). */
  private ingest(frame: BodyVisionFrame, screenAspect: number) {
    const pts = frame.wrists.map((w) =>
      camToScreen(w.x, w.y, frame.camAspect, screenAspect),
    );
    for (const t of this.tracks) t.seen = false;

    for (const [px, py] of pts) {
      let best: Track | null = null;
      let bestD = Infinity;
      for (const t of this.tracks) {
        if (t.seen) continue;
        const d = Math.hypot(t.x - px, t.y - py);
        // Allow bigger jumps when more time has passed (dropped frames,
        // fast sweeps): up to ~2 screen widths per second of hand travel.
        const gap = Math.max(0, (frame.t - t.lastT) / 1000);
        const reach = 0.25 + 2.0 * gap;
        if (d < reach && d < bestD) {
          bestD = d;
          best = t;
        }
      }
      const tNow = frame.t;
      if (best) {
        const dt = Math.max(1e-3, (tNow - best.lastT) / 1000);
        const nx = best.fx.filter(px, dt);
        const ny = best.fy.filter(py, dt);
        // Velocity from filtered positions, lightly smoothed again.
        const k = expAlpha(dt, 0.05);
        best.vx += ((nx - best.x) / dt - best.vx) * k;
        best.vy += ((ny - best.y) / dt - best.vy) * k;
        best.x = nx;
        best.y = ny;
        best.lastT = tNow;
        best.seen = true;
      } else if (this.tracks.length < MAX_HANDS * 2) {
        const o = FX.hands.oneEuro;
        const t: Track = {
          id: this.nextId++,
          fx: new OneEuro(o.minCutoff, o.beta, o.dCutoff),
          fy: new OneEuro(o.minCutoff, o.beta, o.dCutoff),
          x: px,
          y: py,
          vx: 0,
          vy: 0,
          svx: 0,
          svy: 0,
          lastT: tNow,
          strength: 0,
          seen: true,
        };
        t.fx.reset(px);
        t.fy.reset(py);
        this.tracks.push(t);
      }
    }
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
