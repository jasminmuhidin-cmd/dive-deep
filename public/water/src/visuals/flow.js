// ---------------------------------------------------------------------------
// flow.js — the water's shared flow field.
//
// One place decides how the water moves. Everything that should be *carried by the
// water* asks it: ripples (deformed and pulled sideways), the words (a few px of drift),
// the warmth (colour travelling through the currents) and the faint suspended motes.
//
//   currentVector = getFlowAt(x, y)          // px/s, screen space
//
// Layers (slow, independent, never perfectly periodic — every rate is slightly detuned):
//   0  a broad drift  →           horizontal bands that speed up / slow down as they slide
//   1  a diagonal drift  ↗        a little slower
//   2  a soft counter-current  ←  flows the other way in some bands, and the bands wander
//   3  a fine cross-flow          small local movements on top
//   +  the LOCAL layer: brief, decaying pulls around interactions (a person's wake, the
//      Thought ripple, touches that converge, connection paths). Always on.
//
// Each layer's velocity is a sum of a few slow sinusoids that vary in both x and y, plus a
// steady drift. Because they are sinusoids, their integral (how far the water has been
// displaced) is analytic — so the texture the water is drawn with and the velocity the
// ripples feel come from exactly the same numbers, with nothing accumulating or looping.
//
// Pure module: no DOM. Cheap: the field is evaluated on a coarse grid (aDiv px per cell).
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import { makeNoiseTile, makeRng, sampleTile, NOISE_N } from './noise.js';
import { clamp, smoothstep } from '../utils/math.js';

const TAU = Math.PI * 2;

// sine lookup — the grid evaluates a few hundred thousand of these per update
const LUT_N = 2048;
const INV_TAU = 1 / TAU;
const SIN_LUT = new Float32Array(LUT_N + 1);
for (let i = 0; i <= LUT_N; i++) SIN_LUT[i] = Math.sin((i / LUT_N) * TAU);
const lsin = (x) => { const p = x * INV_TAU; return SIN_LUT[((p - Math.floor(p)) * LUT_N) | 0]; };
const lcos = (x) => lsin(x + Math.PI / 2);

/**
 * Layer definitions, authored in 1080p-space (px, px/s; auto-scaled).
 *   drift     steady velocity of the layer
 *   comps     slow oscillating velocity terms: axis 0 = x, 1 = y; a = px/s; kx, ky = cycles/px; period = s
 *   pa, pb    size of the texture tile along / across the layer's own direction (px) — elongated: currents, not clouds
 *   texAngle  direction the texture streaks point
 *   texAmp    how much this layer adds to the surface height
 *   weight    how much this layer contributes to the velocity ripples and words feel
 */
const LAYER_DEFS = [
  { name: 'drift',    drift: [12, 0.6],     texAngle: 0.02,  pa: 2600, pb: 760, texAmp: 1.0,  weight: 1.0,
    comps: [ { axis: 0, a: 4.5, ky: 1 / 780,  kx: 1 / 8500, period: 74 },
             { axis: 0, a: 2.5, ky: 1 / 410,  kx: -1 / 5250, period: 51 },
             { axis: 1, a: 1.2, ky: 1 / 2600, kx: 1 / 2750, period: 63 } ] },
  { name: 'diagonal', drift: [8, -0.8],     texAngle: -0.12, pa: 2200, pb: 900, texAmp: 0.8,  weight: 0.75,
    comps: [ { axis: 0, a: 3.5, ky: 1 / 900,  kx: 1 / 6500, period: 97 },
             { axis: 1, a: 1.0, ky: 1 / 1500, kx: 1 / 2250,  period: 69 } ] },
  { name: 'slow',     drift: [6, 0],        texAngle: 0.0,   pa: 2900, pb: 640, texAmp: 0.65, weight: 0.95,     // a slower layer: bands overtake each other, but nothing flows backwards
    comps: [ { axis: 0, a: 3.6, ky: 1 / 560, kx: 1 / 4750, period: 83 },
             { axis: 0, a: 2.0, ky: 1 / 330,  kx: -1 / 3500, period: 57 } ] },
  { name: 'fine',     drift: [6, 0.5],      texAngle: 0.1,   pa: 1300, pb: 520, texAmp: 0.4,  weight: 0.35,
    comps: [ { axis: 0, a: 2.5, ky: 1 / 300,  kx: 1 / 2500, period: 41 },
             { axis: 1, a: 1.0, ky: 1 / 700,  kx: 1 / 1250,  period: 47 } ] },
];

// How the currents organise themselves during collective touch (all at full collective; eased in/out):
// the counter-current fades, the diagonal flattens toward horizontal, the main drift firms up.
const ALIGN = [
  { drift: 0.35, band: -0.45, dy: 0 },
  { drift: 0,    band: -0.30, dy: -0.6 },
  { drift: 0,    band: -0.85, dy: 0 },
  { drift: 0,    band: -0.30, dy: 0 },
];

const DISP_TAU = 5;            // s: how long a local pull lingers before the water relaxes back
const MAX_IMPULSES = 48;
const MAX_PATHS = 8;

export function createFlow(state, { seed = C.WATER_SEED } = {}) {
  const rng = makeRng(seed || ((Math.random() * 1e9) | 0));

  const layers = LAYER_DEFS.map((d) => {
    const comps = d.comps.map((c) => ({
      axis: c.axis, a: c.a, kx: c.kx * TAU, ky: c.ky * TAU,
      w: (TAU / c.period) * (0.92 + 0.16 * rng()),        // detuned: the combination never repeats
      ph: rng() * TAU,
    }));
    const oscMax = [1e-6, 1e-6];
    for (const c of comps) oscMax[c.axis] += c.a / c.w;
    return {
      ...d, comps, oscMax,
      cosT: Math.cos(d.texAngle), sinT: Math.sin(d.texAngle),
      tile: makeNoiseTile(Math.floor(rng() * 1e9)),
      dpx: 0, dpy: 0,                                     // accumulated steady drift, 1080p px
      driftGain: 1, bandGain: 1, dyGain: 1,               // eased by collective touch
      warp: [rng() * TAU, rng() * TAU],
    };
  });
  // The broad blurred bands (3–5): pale blue / cream currents drifting along FLOW_DIRECTION. Each has its own
  // amplitude, wavelength, speed, phase, thickness and opacity, varied within a restrained range (speed ×0.9–1.1,
  // amplitude ×0.85–1.15) so they feel organic but controlled. Geometry (baseY) is set at resize.
  const OPAC = [0.7, 0.95, 0.6, 0.85, 0.55];
  const bands = Array.from({ length: 5 }, (_, i) => ({
    amp: 0.85 + 0.3 * rng(), wl: 0.85 + 0.4 * rng(), speed: 34 * (0.9 + 0.2 * rng()), phase: rng() * TAU, phase2: rng() * TAU, phase3: rng() * TAU,
    thick: 62 + 42 * rng(), opacity: OPAC[i], yellow: i === 2, baseY: 0,
  }));
  const bandCount = () => clamp(C.CURRENT_LAYER_COUNT | 0, 3, 5);
  const dirVec = { x: 1, y: 0 };
  function updateDir() {
    const fx = C.FLOW_DIRECTION_X, fy = C.FLOW_DIRECTION_Y, m = Math.hypot(fx, fy) || 1;
    dirVec.x = fx / m; dirVec.y = fy / m;
    if (dirVec.x < 0.2) { dirVec.x = 0.2; const q = Math.hypot(dirVec.x, dirVec.y); dirVec.x /= q; dirVec.y /= q; }   // always left → right, whatever the config says
    return dirVec;
  }
  const deepTile = makeNoiseTile(Math.floor(rng() * 1e9), [2, 4, 8], [1, 0.6, 0.3]);
  let deepX = rng() * 4000, deepY = rng() * 2000;

  // ---- runtime state ---------------------------------------------------------
  let tau = 0;                 // flow clock (advances with CURRENT_SPEED)
  let pendingDt = 0;
  let w = 0, h = 0, sc = 1, aDiv = 12, gw = 0, gh = 0;
  let vx = null, vy = null, height = null, tone = null, tint = null, lav = null;            // the grid the water reads
  let vlx = null, vly = null, glow = null, dispX = null, dispY = null;
  let conv = 0;                                                    // eased collective strength 0–1
  let touchPts = [];
  let paths = [];
  const impulses = [];
  const tmp = { vx: 0, vy: 0, ox: 0, oy: 0, vxo: 0 };
  // The grid the water reads (one persistent object, refreshed in place — no per-frame allocation)
  const gridObj = { gw: 0, gh: 0, div: 12, vx: null, vy: null, height: null, tone: null, tint: null, lav: null, maxV: 0,
                    midVx: 0, midVy: 0, spreadV: 0 };   // spreadV: half the range of velocities — how far parts of a ripple can be pulled apart

  function resize(width, height_, scale, cellPx) {
    w = width; h = height_; sc = scale; aDiv = cellPx;
    gw = Math.max(4, Math.ceil(w / aDiv));
    gh = Math.max(4, Math.ceil(h / aDiv));
    const n = gw * gh;
    vx = new Float32Array(n); vy = new Float32Array(n);
    height = new Float32Array(n); tone = new Float32Array(n).fill(1); tint = new Float32Array(n).fill(0.5); lav = new Float32Array(n);
    vlx = new Float32Array(n); vly = new Float32Array(n); glow = new Float32Array(n);
    dispX = new Float32Array(n); dispY = new Float32Array(n);
    Object.assign(gridObj, { gw, gh, div: aDiv, vx, vy, height, tone, tint, lav, maxV: 0 });
    const nb = bandCount(), H = h / sc;
    for (let i = 0; i < 5; i++) bands[i].baseY = (((i % nb) + 0.5) / nb) * H;
  }

  // ---- per-layer analytic evaluation ---------------------------------------------
  /** velocity (1080p px per flow-second) and oscillating displacement of layer L at (u, v) — 1080p space */
  function evalLayer(L, u, v, out) {
    const bg = L.bandGain * C.CURRENT_STRENGTH;
    let vxo = 0, vyo = 0, ox = 0, oy = 0;
    for (let i = 0; i < L.comps.length; i++) {
      const c = L.comps[i];
      const ph = c.kx * u + c.ky * v + c.w * tau + c.ph;
      const a = c.a * bg;
      const s = lsin(ph), co = lcos(ph);
      if (c.axis === 0) { vxo += a * s; ox -= (a / c.w) * co; } else { vyo += a * s; oy -= (a / c.w) * co; }
    }
    out.vxo = vxo;
    out.vx = L.drift[0] * L.driftGain + vxo;
    out.vy = L.drift[1] * L.driftGain * L.dyGain + vyo;
    out.ox = ox; out.oy = oy;
  }

  function layerCount() { return LAYER_DEFS.length; }

  // ---- public: points ------------------------------------------------------------
  /** Water velocity at a screen point, px/s. Includes the local (interaction) pulls. */
  function velocityAt(x, y, out = { vx: 0, vy: 0 }) {
    const u = x / sc, v = y / sc;
    let sx = 0, sy = 0;
    const n = layerCount();
    for (let l = 0; l < n; l++) {
      const L = layers[l];
      evalLayer(L, u, v, tmp);
      sx += L.weight * tmp.vx; sy += L.weight * tmp.vy;
    }
    const k = C.CURRENT_SPEED * sc, D = updateDir();
    out.vx = (sx * D.x - sy * D.y) * k; out.vy = (sx * D.y + sy * D.x) * k;      // the whole current follows FLOW_DIRECTION
    if (vlx) {
      const gx = clamp((x / aDiv) | 0, 0, gw - 1), gy = clamp((y / aDiv) | 0, 0, gh - 1);
      out.vx += vlx[gy * gw + gx]; out.vy += vly[gy * gw + gx];
    }
    return out;
  }

  /**
   * How far the water has wandered from its mean position at this point, in px: a slow, bounded
   * displacement used to let words drift with the water by a few px. Returns x/y in ≈ ±TEXT_DRIFT_AMOUNT.
   */
  function textDrift(x, y, out = { x: 0, y: 0 }) {
    const u = x / sc, v = y / sc;
    const norm = (L, axis) => {
      let s = 0;
      for (const c of L.comps) {
        if (c.axis !== axis) continue;
        s -= (c.a / c.w) * lcos(c.kx * u + c.ky * v + c.w * tau + c.ph);
      }
      return s / L.oscMax[axis];
    };
    const amt = C.TEXT_DRIFT_AMOUNT * sc * (0.5 + 0.5 * Math.min(2, C.CURRENT_STRENGTH));
    out.x = amt * (0.65 * norm(layers[0], 0) + 0.35 * norm(layers[2], 0));
    out.y = amt * 0.55 * (0.6 * norm(layers[0], 1) + 0.4 * norm(layers[1], 1));
    return out;
  }

  // ---- public: local pulls ---------------------------------------------------------
  /**
   * A brief pull on the water around (x, y): a person's wake, the Thought ripple entering, etc.
   * vx, vy are screen px/s; it fades over `life` seconds and the water then relaxes back.
   */
  function impulse(x, y, ivx, ivy, { radius = 220, life = 4 } = {}) {
    if (impulses.length >= MAX_IMPULSES) impulses.shift();
    impulses.push({ x, y, vx: ivx, vy: ivy, radius, life, age: 0 });
  }

  /** Current touch points (screen px) — several at once make the currents converge and align. */
  function setTouchPoints(pts) { touchPts = pts; }

  /** Connection paths for this frame: [{ ax, ay, bx, by, strength }] — the water is drawn gently along them. */
  function setPaths(list) { paths = list.length > MAX_PATHS ? list.slice(0, MAX_PATHS) : list; }

  // ---- per-frame ---------------------------------------------------------------
  function update(dt) {
    dt = clamp(dt, 0, 0.1);
    const dTau = dt * C.CURRENT_SPEED;
    tau += dTau;
    pendingDt += dt;

    const a = C.COLLECTIVE_FLOW_STRENGTH * smoothstep(state.collectiveAmount || 0);
    const ease = 1 - Math.exp(-dt / 2.5);
    conv += (a - conv) * ease;
    layers.forEach((L, i) => {
      const al = ALIGN[i];
      L.driftGain += (1 + al.drift * a - L.driftGain) * ease;
      L.bandGain += (Math.max(0.05, 1 + al.band * a) - L.bandGain) * ease;
      L.dyGain += (1 + al.dy * a - L.dyGain) * ease;
      L.dpx += L.drift[0] * L.driftGain * dTau;
      L.dpy += L.drift[1] * L.driftGain * L.dyGain * dTau;
    });
    deepX += 3.0 * dTau; deepY += 0.5 * dTau;

    for (let i = impulses.length - 1; i >= 0; i--) {
      impulses[i].age += dt;
      if (impulses[i].age >= impulses[i].life) impulses.splice(i, 1);
    }
  }

  // ---- the grid -------------------------------------------------------------------
  function splatLocal() {
    vlx.fill(0); vly.fill(0); glow.fill(0);

    // impulses (wakes, the Thought ripple entering)
    for (const p of impulses) {
      const env = smoothstep(p.age / 0.5) * Math.pow(Math.max(0, 1 - p.age / p.life), 1.5);
      if (env < 0.01) continue;
      const sig = p.radius * sc * 0.5, inv = 1 / (2 * sig * sig), reach = sig * 2.6;
      const x0 = Math.max(0, ((p.x - reach) / aDiv) | 0), x1 = Math.min(gw - 1, ((p.x + reach) / aDiv) | 0);
      const y0 = Math.max(0, ((p.y - reach) / aDiv) | 0), y1 = Math.min(gh - 1, ((p.y + reach) / aDiv) | 0);
      for (let gy = y0; gy <= y1; gy++) {
        const dy = (gy + 0.5) * aDiv - p.y;
        for (let gx = x0; gx <= x1; gx++) {
          const dx = (gx + 0.5) * aDiv - p.x;
          const g = Math.exp(-(dx * dx + dy * dy) * inv) * env;
          vlx[gy * gw + gx] += p.vx * g; vly[gy * gw + gx] += p.vy * g;
        }
      }
    }

    // several touches: the currents lean toward where the people are — flows converge
    if (conv > 0.01 && touchPts.length >= 2) {
      let cx = 0, cy = 0;
      for (const p of touchPts) { cx += p.x; cy += p.y; }
      cx /= touchPts.length; cy /= touchPts.length;
      const L = 0.55 * Math.min(w, h), V = 9 * sc * conv;
      for (let gy = 0; gy < gh; gy++) {
        const dy = cy - (gy + 0.5) * aDiv;
        for (let gx = 0; gx < gw; gx++) {
          const dx = cx - (gx + 0.5) * aDiv;
          const d = Math.hypot(dx, dy);
          if (d < 1) continue;
          const g = Math.exp(-d / L) * (d / (d + 60 * sc)) * V / d;      // soft near the centre: no jitter
          vlx[gy * gw + gx] += dx * g; vly[gy * gw + gx] += dy * g;
        }
      }
    }

    // connection paths: the water is drawn along them, and they hold a little more light
    for (const p of paths) {
      const dx = p.bx - p.ax, dy = p.by - p.ay, len2 = dx * dx + dy * dy, len = Math.sqrt(len2);
      if (len < 4 || p.strength < 0.02) continue;
      const sig = 95 * sc, inv = 1 / (2 * sig * sig), reach = sig * 2.6;
      const x0 = Math.max(0, ((Math.min(p.ax, p.bx) - reach) / aDiv) | 0), x1 = Math.min(gw - 1, ((Math.max(p.ax, p.bx) + reach) / aDiv) | 0);
      const y0 = Math.max(0, ((Math.min(p.ay, p.by) - reach) / aDiv) | 0), y1 = Math.min(gh - 1, ((Math.max(p.ay, p.by) + reach) / aDiv) | 0);
      const V = 8 * sc * C.COLLECTIVE_FLOW_STRENGTH * p.strength / len;
      for (let gy = y0; gy <= y1; gy++) {
        const py = (gy + 0.5) * aDiv;
        for (let gx = x0; gx <= x1; gx++) {
          const px = (gx + 0.5) * aDiv;
          const t = clamp(((px - p.ax) * dx + (py - p.ay) * dy) / len2, 0, 1);
          const ex = px - (p.ax + dx * t), ey = py - (p.ay + dy * t);
          const g = Math.exp(-(ex * ex + ey * ey) * inv);
          const i = gy * gw + gx;
          vlx[i] += dx * V * g; vly[i] += dy * V * g;
          glow[i] += 0.055 * p.strength * g * C.COLLECTIVE_FLOW_STRENGTH;
        }
      }
    }
  }

  /** Recompute the coarse grid the water reads: total velocity, ambient height, tone. Call ~30×/s. */
  function computeGrid() {
    if (!vx) return;
    const dt = pendingDt; pendingDt = 0;

    splatLocal();
    const keep = Math.exp(-dt / DISP_TAU);
    for (let i = 0; i < vlx.length; i++) {
      dispX[i] = dispX[i] * keep + vlx[i] * dt;
      dispY[i] = dispY[i] * keep + vly[i] * dt;
    }

    const STR = C.CURRENT_STRENGTH, S = C.CURRENT_SPEED, CS = Math.max(0.2, C.CURRENT_SCALE);
    const heightGain = C.WAVE_AMPLITUDE * (0.45 + 0.55 * STR);
    const bandK = C.WAVE_FREQUENCY / (300 * CS);
    const n = layerCount(), nb = bandCount(), D = updateDir(), blurK = 0.8 + 0.6 * C.CURRENT_BLUR;
    const N = NOISE_N;
    let maxV2 = 0, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;

    for (let gy = 0; gy < gh; gy++) {
      const v = ((gy + 0.5) * aDiv) / sc;
      for (let gx = 0; gx < gw; gx++) {
        const u = ((gx + 0.5) * aDiv) / sc;
        const idx = gy * gw + gx;
        const dux = dispX[idx] / sc, duy = dispY[idx] / sc;
        let sx = 0, sy = 0, hh = 0, s0 = 0, s1 = 0, s2 = 0, bandSig = 0;

        for (let l = 0; l < n; l++) {
          const L = layers[l];
          evalLayer(L, u, v, tmp);
          sx += L.weight * tmp.vx; sy += L.weight * tmp.vy;
          // where this bit of water came from: its steady drift + slow oscillation + any local pull
          const du = u - L.dpx - tmp.ox - dux;
          const dv = v - L.dpy - tmp.oy - duy;
          const a = (du * L.cosT + dv * L.sinT) / (L.pa * CS) + 0.03 * lsin(TAU * v / 1900 + L.warp[0] + 0.013 * tau);
          const b = (-du * L.sinT + dv * L.cosT) / (L.pb * CS) + 0.05 * lsin(TAU * u / 2300 + L.warp[1] + 0.009 * tau);
          const sm = sampleTile(L.tile, a * N, b * N);
          hh += L.texAmp * sm;
          if (l === 0) { s0 = sm; bandSig = tmp.vxo / 8; } else if (l === 1) s1 = sm; else if (l === 2) s2 = sm;
        }

        // soft wave bands: long crests whose lines meander with the main current
        hh += 0.5 * lsin(TAU * v * bandK + 2.4 * s0 + 0.04 * tau);
        // pigment: 3–5 broad, blurred bands (pale blue / cream) sliding along FLOW_DIRECTION; the cream one carries the faint yellow
        const al = u * D.x + v * D.y, ac = -u * D.y + v * D.x;       // along / across the flow
        let free = 1, yfree = 1;
        for (let b = 0; b < nb; b++) {
          const B = bands[b];
          const arg = (TAU * (al - B.speed * tau)) / (C.CURRENT_WAVELENGTH * B.wl) + B.phase;
          const yb = B.baseY + C.CURRENT_AMPLITUDE * B.amp * (lsin(arg) + 0.4 * lsin(arg * 0.53 + B.phase2) + 0.3 * lsin(arg * 1.7 + B.phase3 + 0.02 * tau));
          const z = (ac - yb) / (B.thick * blurK);
          const cov = Math.exp(-z * z) * B.opacity;
          free *= 1 - cov;
          if (B.yellow) yfree *= 1 - cov;
        }
        tint[idx] = 1 - free;
        lav[idx] = 1 - yfree;
        height[idx] = hh * heightGain;

        // tone: deep, very slow, broad; plus faintly brighter where the current runs strongest
        const deep = sampleTile(deepTile, ((u - deepX) / 5200) * N, ((v - deepY) / 2800) * N);
        tone[idx] = 1 + 0.06 * deep + 0.05 * STR * bandSig + glow[idx];

        const fx = (sx * D.x - sy * D.y) * S * sc + vlx[idx], fy = (sx * D.y + sy * D.x) * S * sc + vly[idx];
        vx[idx] = fx; vy[idx] = fy;
        const m2 = fx * fx + fy * fy;
        if (m2 > maxV2) maxV2 = m2;
        if (fx < minX) minX = fx; if (fx > maxX) maxX = fx;
        if (fy < minY) minY = fy; if (fy > maxY) maxY = fy;
      }
    }
    gridObj.maxV = Math.sqrt(maxV2);
    gridObj.midVx = (minX + maxX) / 2; gridObj.midVy = (minY + maxY) / 2;
    gridObj.spreadV = Math.hypot(maxX - minX, maxY - minY) / 2;   // together these bound where a carried ripple can be
  }

  function reset() {
    tau = 0; pendingDt = 0; impulses.length = 0; paths = []; touchPts = []; conv = 0;
    for (const L of layers) { L.dpx = L.dpy = 0; L.driftGain = L.bandGain = L.dyGain = 1; }
    if (vlx) { vlx.fill(0); vly.fill(0); dispX.fill(0); dispY.fill(0); }
  }

  return {
    resize, update, computeGrid, velocityAt, textDrift, impulse, setTouchPoints, setPaths, reset,
    get grid() { return gridObj; },
    get time() { return tau; },
    get layers() { return layers; },
    get impulseCount() { return impulses.length; },
    /** upper bound on |velocity| in px/s — lets the ripples bound how far they can be carried */
    get maxSpeed() {
      let s = 0;
      for (let l = 0; l < layerCount(); l++) {
        const L = layers[l];
        s += L.weight * (Math.hypot(L.drift[0], L.drift[1]) * 1.4 + L.comps.reduce((q, c) => q + c.a, 0) * C.CURRENT_STRENGTH);
      }
      return s * C.CURRENT_SPEED * sc + 30 * sc;
    },
  };
}

// ---- convenience: getFlowAt(x, y) on the running flow ---------------------------------
let active = null;
export function setActiveFlow(flow) { active = flow; }
/** `const { vx, vy } = getFlowAt(x, y)` — the current at a screen point, px/s. Zero if no flow is running. */
export function getFlowAt(x, y, out = { vx: 0, vy: 0 }) {
  if (!active) { out.vx = 0; out.vy = 0; return out; }
  return active.velocityAt(x, y, out);
}
