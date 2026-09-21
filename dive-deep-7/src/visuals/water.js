// ---------------------------------------------------------------------------
// water.js — the living body of water.
//
// Technique: a low-resolution height field (default 1/6 screen size) is lit like a water
// surface and drawn smoothed-up behind the thoughts. It is built from three depths:
//
//   DEEP     very slow, broad tone — the water's depth, and the shadows of submerged thoughts
//   MID      the currents: layered, elongated texture sliding horizontally at different speeds
//            in different bands, plus soft meandering wave bands (all from flow.js)
//   SURFACE  ripples, wakes and touches (ripple.js) — carried, sheared and stretched by those
//            same currents, and lit on top
//
// Colour is per pixel: warmth (warmth.js) is a field that begins at the touches and is carried
// by the currents, not a flat overlay.
//
// Ambient swells are scheduled here. They never touch thought text.
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import {
  rippleRadius, rippleAmplitude, rippleWavelength, ringHarmonics, carryTime,
} from './ripple.js';
import { createWarmth } from './warmth.js';
import { addRainMark } from './rain.js';
import { THOUGHT_STATE } from '../state/installationState.js';
import { clamp, clamp01, lerp, rand, randRange, smoothstep } from '../utils/math.js';

const TWO_PI = Math.PI * 2;

// Fast cosine lookup for ripple profiles (phase given in whole periods).
const LUT_SIZE = 1024;
const COS_LUT = new Float32Array(LUT_SIZE + 1);
for (let i = 0; i <= LUT_SIZE; i++) COS_LUT[i] = Math.cos((i / LUT_SIZE) * TWO_PI);
const fastCos = (periods) => COS_LUT[((periods - Math.floor(periods)) * LUT_SIZE) | 0];

export function createWater(state, ripples, flow) {
  const warmth = createWarmth();
  const surface = document.createElement('canvas');
  const sctx = surface.getContext('2d');

  let lw = 0, lh = 0, div = 1;
  let imageData = null;
  let height = null;           // water-resolution height: ambient currents + ripples
  let ambientH = null;         // the ambient part alone, refreshed at WATER_FLOW_HZ and copied in each tick
  let colG = null, rowG = null;   // water pixel → flow-grid column / row (for the carry lookups in addRipple)
  let toneF = null;            // water-resolution brightness (deep layer, current bands, connection light)
  let warmF = null;            // water-resolution warmth 0–1
  let tintF = null, lavF = null;   // water-resolution pigment: cyan/cream drifting through the cobalt, and lavender
  let vignette = null;         // per-pixel darkening toward the edges, baked in at resize
  let rowCool = null, rowWarm = null;   // per-row base colours (cool / warm), baked at resize
  let colI = null, colF = null, rowI = null, rowF = null;   // bilinear taps from the coarse grid to the water grid
  let lastFieldTime = -Infinity;
  let lastFlowTime = -Infinity;
  let nextAmbientAt = 2.5;
  const sources = [];

  // ---- setup ---------------------------------------------------------------
  function resize() {
    const { w, h, scale } = state.view;
    div = C.WATER_RESOLUTION_DIVISOR;
    lw = Math.max(8, Math.ceil(w / div));
    lh = Math.max(8, Math.ceil(h / div));
    surface.width = lw;
    surface.height = lh;
    imageData = sctx.createImageData(lw, lh);
    for (let i = 3; i < imageData.data.length; i += 4) imageData.data[i] = 255;
    height = new Float32Array(lw * lh);
    ambientH = new Float32Array(lw * lh);
    toneF = new Float32Array(lw * lh);
    warmF = new Float32Array(lw * lh);
    tintF = new Float32Array(lw * lh);
    lavF = new Float32Array(lw * lh);

    // The flow / warmth grid is coarser than the water: the currents are broad and slow.
    const F = Math.max(1, C.WATER_FLOW_CELL | 0);
    flow.resize(w, h, scale, div * F);
    const g = flow.grid;
    warmth.resize(g.gw, g.gh, g.div);
    const tap = (n, gn) => {
      const idx = new Int32Array(n), fr = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const f = clamp((i + 0.5) / F - 0.5, 0, gn - 1.001);  // where water pixel i's centre falls, in coarse-cell units
        idx[i] = f | 0; fr[i] = f - idx[i];
      }
      return [idx, fr];
    };
    [colI, colF] = tap(lw, g.gw);
    [rowI, rowF] = tap(lh, g.gh);
    colG = new Int32Array(lw); rowG = new Int32Array(lh);
    for (let i = 0; i < lw; i++) colG[i] = Math.min(g.gw - 1, Math.floor(i / F));
    for (let j = 0; j < lh; j++) rowG[j] = Math.min(g.gh - 1, Math.floor(j / F)) * g.gw;

    // Soft vignette baked into the water itself: deep edges, calm centre.
    vignette = new Float32Array(lw * lh);
    const cx = w / 2, cy = h * 0.46, reach = Math.max(w, h) * 0.78;
    for (let j = 0; j < lh; j++) {
      for (let i = 0; i < lw; i++) {
        const r = Math.hypot((i + 0.5) * div - cx, (j + 0.5) * div - cy) / reach;
        vignette[j * lw + i] = 1 - C.VIGNETTE_STRENGTH * smoothstep((r - 0.22) / 0.78);
      }
    }

    // Base colour per row for the cool and the warm water (top → bottom gradient)
    rowCool = new Float32Array(lh * 3);
    rowWarm = new Float32Array(lh * 3);
    for (let j = 0; j < lh; j++) {
      const t = j / (lh - 1);
      for (let k = 0; k < 3; k++) {
        rowCool[j * 3 + k] = lerp(C.COOL_WATER_PALETTE.top[k], C.COOL_WATER_PALETTE.bottom[k], t);
        rowWarm[j * 3 + k] = lerp(C.WARM_WATER_PALETTE.top[k], C.WARM_WATER_PALETTE.bottom[k], t);
      }
    }
    lastFieldTime = -Infinity;
    lastFlowTime = -Infinity;
  }

  // ---- ambient swells ------------------------------------------------------
  // Faint, broad arcs that drift with the current — not round drops. Camera hook: personCount /
  // movementIntensity make them a little more frequent (capped).
  function updateAmbientRipples(now) {
    if (now < nextAmbientAt) return;
    const activity = clamp01(state.personCount * 0.14 + state.movementIntensity * 0.35);
    const gap = randRange(C.AMBIENT_RIPPLE_INTERVAL) * lerp(1, 0.55, activity) / (1 + 0.6 * state.collectiveAmount);
    nextAmbientAt = now + gap;

    const { w, h } = state.view;
    let x = rand(w * 0.08, w * 0.92);
    let y = rand(h * 0.08, h * 0.85);
    if (Math.random() < 0.45) {
      // A quiet stir above a thought that is still under the water.
      const under = state.thoughts.filter((t) => t.state === THOUGHT_STATE.SUBMERGED);
      if (under.length) {
        const t = under[(Math.random() * under.length) | 0];
        x = t.px + rand(-30, 30) * state.view.scale;
        y = t.py + rand(-20, 20) * state.view.scale;
      }
    }
    ripples.create({
      x, y, type: 'ambient', strength: C.RIPPLE_TYPES.ambient.strength * rand(0.7, 1.2),
      wavelengthMul: rand(1.3, 1.9),
      sector: { ahead: Math.random() < 0.55, width: rand(1.1, 2.0) },
    });
  }

  // ---- rain -----------------------------------------------------------------------
  // Very sparse, small, irregular: a tiny dot, then an incomplete ring that the current pulls sideways. Texture, not weather.
  let nextRainAt = 4, rainNear = 0;
  const rainAt = { x: 0, y: 0 };
  function updateRain(now) {
    if (C.RAIN_RIPPLE_FREQUENCY <= 0 || now < nextRainAt) return;
    const u = Math.max(1e-3, Math.random());
    nextRainAt = now + clamp(-Math.log(u) / C.RAIN_RIPPLE_FREQUENCY, 0.9, 9 / Math.max(0.2, C.RAIN_RIPPLE_FREQUENCY * 3));
    const { w, h } = state.view;
    const size = C.RAIN_RIPPLE_SIZE * rand(0.7, 1.25);
    // now and then a second drop lands close by a moment later: a patter, not a metronome
    let x = rand(w * 0.05, w * 0.95), y = rand(h * 0.06, h * 0.94);
    if (rainNear > 0) { x = clamp(rainAt.x + rand(-110, 110) * state.view.scale, 20, w - 20); y = clamp(rainAt.y + rand(-80, 80) * state.view.scale, 20, h - 20); rainNear--; nextRainAt = now + rand(0.25, 0.8); }
    else if (Math.random() < 0.16) rainNear = 1;
    rainAt.x = x; rainAt.y = y;
    addRainMark(state, x, y, now, size);
    ripples.create({
      x, y, type: 'rain',
      strength: C.RIPPLE_TYPES.rain.strength * rand(0.7, 1.2),
      wavelengthMul: size, speedMul: size * rand(0.8, 1.2), lifeMul: rand(0.75, 1.3),
      dir: rand(-0.5, 0.5) + (Math.random() < 0.25 ? Math.PI : 0),
      sector: { ahead: true, width: rand(1.3, 2.7) },              // tiny INCOMPLETE rings
    });
  }

  // ---- height field --------------------------------------------------------
  /** Bilinear-upsample the coarse grid (ambient height, tone, warmth) to the water's resolution. */
  function upsampleAmbient() {
    const g = flow.grid;
    const gw = g.gw;
    const wf = warmth.field;
    const people = clamp01(state.personCount / 5);
    // More people (and collective touch) → the water is a little more alive. Never chaotic.
    const activity = 1 + C.COLLECTIVE_WATER_ACTIVITY * state.collectiveAmount
                       + 0.18 * people + 0.14 * clamp01(state.movementIntensity);
    const floor = warmth.floor * smoothstep(state.collectiveAmount);
    for (let j = 0; j < lh; j++) {
      const j0 = rowI[j], fy = rowF[j];
      const a = j0 * gw, b = (j0 + 1) * gw;
      const row = j * lw;
      for (let i = 0; i < lw; i++) {
        const i0 = colI[i], fx = colF[i];
        const p00 = a + i0, p01 = p00 + 1, p10 = b + i0, p11 = p10 + 1;
        const w00 = (1 - fx) * (1 - fy), w01 = fx * (1 - fy), w10 = (1 - fx) * fy, w11 = fx * fy;
        const o = row + i;
        ambientH[o] = activity * (g.height[p00] * w00 + g.height[p01] * w01 + g.height[p10] * w10 + g.height[p11] * w11);
        toneF[o] = g.tone[p00] * w00 + g.tone[p01] * w01 + g.tone[p10] * w10 + g.tone[p11] * w11;
        tintF[o] = g.tint[p00] * w00 + g.tint[p01] * w01 + g.tint[p10] * w10 + g.tint[p11] * w11;
        lavF[o] = g.lav[p00] * w00 + g.lav[p01] * w01 + g.lav[p10] * w10 + g.lav[p11] * w11;
        warmF[o] = Math.min(1, floor + wf[p00] * w00 + wf[p01] * w01 + wf[p10] * w10 + wf[p11] * w11);
      }
    }
  }

  /**
   * Add one ripple to the height field. The ring is measured in a frame that is
   * (a) carried by the local current (source point = pixel − current × age),
   * (b) drawn out along the ripple's direction, and
   * (c) uneven — three slow harmonics of the radius — so the crest is never a perfect circle.
   */
  function addRipple(r, g) {
    const A = rippleAmplitude(r);
    if (A < 0.004) return;
    const lamPx = rippleWavelength(r);
    const lam = lamPx / div;
    const half = lam * (0.7 + 1.3 * clamp01(C.RIPPLE_EDGE_SOFTNESS));   // half-width of the wave packet: RIPPLE_EDGE_SOFTNESS 0 = fine crisp rings, 1 = broad soft ones
    const invLam = 1 / lam, invHalf = 1 / half;
    const R = rippleRadius(r) / div;
    const hc = ringHarmonics(r);
    const epsMax = Math.abs(hc[0]) + Math.abs(hc[1]) + Math.abs(hc[2]) + Math.abs(hc[3]) + Math.abs(hc[4]) + Math.abs(hc[5]);
    const ct = r.carry * carryTime(r);
    const carrying = ct > 0 && !!g.vx;
    const ctd = ct / div;
    // Where can the carried ring be? Its centre is shifted by the typical current; only the SPREAD of
    // currents across the screen pulls parts of it apart.
    const dMax = carrying ? (g.spreadV * ct) / div : 0;
    const shx = carrying ? (g.midVx * ct) / div : 0, shy = carrying ? (g.midVy * ct) / div : 0;
    const sMax = Math.max(1, r.stretch);
    const invS = 1 / r.stretch, cd = r.cd, sd = r.sd, phase = r.phase;
    const stretched = r.stretch !== 1;
    const sector = r.sector;
    const sgn = sector ? sector.sign : 0;
    const c0 = sector ? sector.c0 : 0;
    const invSec = sector ? 1 / (1 - sector.c0) : 0;
    const [h1c, h1s, h2c, h2s, h3c, h3s] = hc;

    const cx = r.x / div, cy = r.y / div;
    const bx = cx + shx, by = cy + shy;                    // bounding-circle centre
    const rOut = (R * (1 + epsMax) + half) * sMax + dMax;
    const rIn = R * (1 - epsMax) - half - dMax;          // inside this nothing is painted (minor-axis bound)
    const jMin = Math.max(0, Math.floor(by - rOut));
    const jMax = Math.min(lh - 1, Math.ceil(by + rOut));
    // In the ring's own frame, nothing outside [inR, outR] can be painted — reject those pixels before any sqrt.
    const outR = R * (1 + epsMax) + half, inR = Math.max(0, R * (1 - epsMax) - half);
    const out2 = outR * outR, in2 = inR * inR;
    const sectorFast = sector && c0 >= 0;                 // arcs narrower than a half-circle: reject the wrong side cheaply
    const c02 = c0 * c0;

    const paint = (j, dyc, i0, i1) => {
      const a = Math.max(0, Math.ceil(i0)), b = Math.min(lw - 1, Math.floor(i1));
      const row = j * lw;
      const gr0 = rowI[j] * g.gw, gr1 = Math.min(g.gh - 1, rowI[j] + 1) * g.gw, fy = rowF[j];
      for (let i = a; i <= b; i++) {
        let dx = i + 0.5 - cx, dy = dyc;
        if (carrying) {
          const c0i = colI[i], c1i = Math.min(g.gw - 1, c0i + 1), fx = colF[i];
          const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
          dx -= (g.vx[gr0 + c0i] * w00 + g.vx[gr0 + c1i] * w10 + g.vx[gr1 + c0i] * w01 + g.vx[gr1 + c1i] * w11) * ctd;
          dy -= (g.vy[gr0 + c0i] * w00 + g.vy[gr0 + c1i] * w10 + g.vy[gr1 + c0i] * w01 + g.vy[gr1 + c1i] * w11) * ctd;
        }
        let u = dx, v = dy;
        if (stretched) { u = (dx * cd + dy * sd) * invS; v = -dx * sd + dy * cd; }
        const d2 = u * u + v * v;
        if (d2 > out2 || d2 < in2) continue;
        if (sectorFast && (sgn * u <= 0 || u * u <= c02 * d2)) continue;
        const d = Math.sqrt(d2);
        const id = d > 1e-4 ? 1 / d : 0;
        const c = u * id, s = v * id;
        const c2 = c * c - s * s, s2 = 2 * c * s;
        const eps = h1c * c + h1s * s + h2c * c2 + h2s * s2 + h3c * (c * c2 - s * s2) + h3s * (s * c2 + c * s2);
        const dd = d - R * (1 + eps);
        const t = dd * invHalf;
        let env = 1 - t * t;
        if (env <= 0) continue;
        env *= env;
        if (sector) {
          const cs = sgn * c;
          if (cs <= c0) continue;
          const q = (cs - c0) * invSec;
          env *= q * q * (3 - 2 * q);
        }
        height[row + i] += A * env * fastCos(dd * invLam + phase);
      }
    };

    for (let j = jMin; j <= jMax; j++) {
      const dyc = j + 0.5 - cy;                            // (paint measures from the true centre; the bounds use the shifted one)
      const dyb = j + 0.5 - by;
      const dy2 = dyb * dyb;
      if (dy2 >= rOut * rOut) continue;
      const xo = Math.sqrt(rOut * rOut - dy2);
      if (rIn > 0 && dy2 < rIn * rIn) {
        const xi = Math.sqrt(rIn * rIn - dy2);
        paint(j, dyc, bx - xo, bx - xi);
        paint(j, dyc, bx + xi, bx + xo);
      } else {
        paint(j, dyc, bx - xo, bx + xo);
      }
    }
  }

  // ---- flowing line texture ------------------------------------------------
  // Fine horizontal lines that flow left → right and undulate: added to the height field so the lighting turns them into
  // glints (like the streaks in flowing water). Stronger inside the pale bands.
  let colWarp = null, colMod = null, rowOff = null;
  function addLines(now) {
    const K = C.WATER_LINE_STRENGTH;
    if (K <= 0) return;
    const sc = state.view.scale, t = flow.time;
    const inv = div / (C.WATER_LINE_SPACING * sc);
    const w1 = TWO_PI / (760 * sc), w2 = TWO_PI / (300 * sc), sp = 34 * sc;
    if (!colWarp || colWarp.length !== lw) { colWarp = new Float32Array(lw); colMod = new Float32Array(lw); }
    if (!rowOff || rowOff.length !== lh) rowOff = new Float32Array(lh);
    for (let i = 0; i < lw; i++) {                   // per column: how the lines undulate as they flow right
      const x = (i + 0.5) * div;
      colWarp[i] = 0.16 * (2.4 * Math.sin((x - sp * t) * w1) + 1.1 * Math.sin((x - 1.35 * sp * t) * w2 + 1.7));
      colMod[i] = 0.5 + 0.5 * Math.sin((x - 0.8 * sp * t) * w1 * 0.7);
    }
    for (let j = 0; j < lh; j++) rowOff[j] = j * inv + 0.35 * Math.sin(j * 0.09 + 0.05 * t) + 0.25 * Math.sin(j * 0.31 - 0.11 * t);
    for (let j = 0; j < lh; j++) {
      const row = j * lw, ro = rowOff[j];
      for (let i = 0; i < lw; i++) {
        const tt = tintF[row + i], mod = colMod[i];
        const ph = ro + colWarp[i] + 0.05 * tt;
        // two line sets of slightly different spacing, so the lines cluster and part instead of forming a regular grille
        height[row + i] += K * (0.4 + 0.9 * tt) * (0.6 + 0.8 * mod) * fastCos(ph + 0.35 * fastCos(ph * 0.37 + mod));
      }
    }
  }

  // ---- lighting ------------------------------------------------------------
  // Colour per pixel: cobalt water; pale cyan and cream drift through it in the broad current bands (tintF),
  // lavender in the counter-current (lavF); warm pigment (coral / peach / yellow, muted orange in the depths)
  // is the warmth field, so it enters wherever the currents have carried it — never a flat overlay.
  // ---- flat gradient background -------------------------------------------------------
  // Two colours glide through BACKGROUND_GRADIENT_KEYS (cosine-eased, looping); the axis between them slowly turns.
  const gradA = [0, 0, 0], gradB = [0, 0, 0];
  let gradT0 = 0, gradDx = 0, gradDy = 0;
  function computeGradient(now) {
    const keys = C.BACKGROUND_GRADIENT_KEYS, n = keys.length;
    const u = ((now / Math.max(1, C.BACKGROUND_GRADIENT_PERIOD)) % 1 + 1) % 1 * n;
    const k0 = Math.floor(u) % n, k1 = (k0 + 1) % n, f = u - Math.floor(u), e = 0.5 - 0.5 * Math.cos(Math.PI * f);
    for (let c = 0; c < 3; c++) {
      gradA[c] = keys[k0][0][c] + (keys[k1][0][c] - keys[k0][0][c]) * e;
      gradB[c] = keys[k0][1][c] + (keys[k1][1][c] - keys[k0][1][c]) * e;
    }
    // direction: mostly top → bottom, swaying slowly; t runs 0 → 1 across the screen along that axis
    const ang = Math.PI / 2 + 0.6 * Math.sin(now * C.BACKGROUND_GRADIENT_TURN) + 0.25 * Math.sin(now * C.BACKGROUND_GRADIENT_TURN * 0.37 + 1);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const wpx = lw * div, hpx = lh * div;
    const len = Math.abs(ca) * wpx + Math.abs(sa) * hpx || 1;
    gradDx = (ca * div) / len; gradDy = (sa * div) / len;
    gradT0 = 0.5 - (ca * wpx * 0.5 + sa * hpx * 0.5) / len + (ca * div * 0.5 + sa * div * 0.5) / len;
  }

  const sstep = (q) => (q <= 0 ? 0 : q >= 1 ? 1 : q * q * (3 - 2 * q));
  const PG = C.WATER_PIGMENTS, WP = C.WARM_PIGMENTS;
  function shade() {
    const K = C.WATER_LIGHT_STRENGTH, G = C.WATER_GLOSS;
    const px = imageData.data;
    const LC = C.COOL_WATER_PALETTE.light, LW = C.WARM_WATER_PALETTE.light;
    const PB = PG.paleBlue, CR = PG.cream, OW = PG.offWhite, PY = PG.paleYellow;
    const flat = C.BACKGROUND_STYLE === 'gradient';
    if (flat) computeGradient(state.time.now || 0);
    for (let j = 0; j < lh; j++) {
      const up = j > 0 ? -lw : 0;
      const down = j < lh - 1 ? lw : 0;
      const cr = rowCool[j * 3], cg = rowCool[j * 3 + 1], cb = rowCool[j * 3 + 2];
      for (let i = 0; i < lw; i++) {
        const idx = j * lw + i;
        const left = i > 0 ? -1 : 0;
        const right = i < lw - 1 ? 1 : 0;
        const wm = warmF[idx];
        // pigment: ocean blue → pale blue → cream / off-white in the broad current bands; a restrained pale yellow only in one band
        const t = tintF[idx];
        const paleA = 0.9 * sstep(t / 0.6);
        const creamA = 0.9 * sstep((t - 0.62) / 0.36);
        const yelA = 0.28 * lavF[idx] * creamA;
        let r = cr + (PB[0] - cr) * paleA, g = cg + (PB[1] - cg) * paleA, bl = cb + (PB[2] - cb) * paleA;
        if (flat) {                                          // a flat colour field: position along the (slowly turning) gradient, nothing else
          const q = clamp01(gradT0 + i * gradDx + j * gradDy);
          r = gradA[0] + (gradB[0] - gradA[0]) * q; g = gradA[1] + (gradB[1] - gradA[1]) * q; bl = gradA[2] + (gradB[2] - gradA[2]) * q;
        }
        const kr = CR[0] + (OW[0] - CR[0]) * 0.4, kg = CR[1] + (OW[1] - CR[1]) * 0.4, kb = CR[2] + (OW[2] - CR[2]) * 0.4;
        if (!flat) {
          r += (kr - r) * creamA; g += (kg - g) * creamA; bl += (kb - bl) * creamA;
          r += (PY[0] - r) * yelA; g += (PY[1] - g) * yelA; bl += (PY[2] - bl) * yelA;
        }
        // warmth (collective touch): only towards pale cream / pale yellow, low alpha
        let br = r, bg = g, bb = bl;
        if (wm > 0.004) {
          const q = Math.min(1, wm);
          const pr = WP.cream[0] + (WP.paleYellow[0] - WP.cream[0]) * q * 0.6, pg = WP.cream[1] + (WP.paleYellow[1] - WP.cream[1]) * q * 0.6, pb = WP.cream[2] + (WP.paleYellow[2] - WP.cream[2]) * q * 0.6;
          const a = Math.min(0.4, wm * (0.3 + 0.3 * t));
          br = r + (pr - r) * a; bg = g + (pg - g) * a; bb = bl + (pb - bl) * a;
        }
        // Light from the upper-left: slopes that tilt toward it become glints, the others deep blue troughs (glossy, high contrast).
        let b = (0.6 * (height[idx + right] - height[idx + left]) +
                 0.4 * (height[idx + down] - height[idx + up])) * K;
        b = clamp(b, -1, 1);
        const o = idx * 4;
        const v = flat ? 1 : vignette[idx] * toneF[idx];
        if (b >= 0) {
          const q = sstep((b - 0.06) / (0.62 - 0.4 * G));                       // sharper with WATER_GLOSS
          const m = 0.85 * q, wq = q * q;
          const lr = LC[0] + (LW[0] - LC[0]) * wm, lg = LC[1] + (LW[1] - LC[1]) * wm, lb = LC[2] + (LW[2] - LC[2]) * wm;
          px[o] = (br + (lr - br) * m + (255 - lr) * 0.35 * wq) * v;
          px[o + 1] = (bg + (lg - bg) * m + (255 - lg) * 0.35 * wq) * v;
          px[o + 2] = (bb + (lb - bb) * m + (255 - lb) * 0.35 * wq) * v;
        } else {
          const q = sstep((-b - 0.06) / (0.7 - 0.3 * G));
          const m = (1 - 0.5 * q) * v;             // deep royal-blue troughs
          px[o] = br * m * (1 - 0.25 * q);
          px[o + 1] = bg * m * (1 - 0.08 * q);
          px[o + 2] = bb * m * (1 + 0.05 * q);
        }
      }
    }
  }

  // ---- warmth sources ---------------------------------------------------------
  function gatherWarmthSources() {
    sources.length = 0;
    const s = state.view.scale;
    if (state.collectiveTouchMode) {
      const pts = state.touchPoints || [];
      for (const p of pts) sources.push({ x: p.x, y: p.y, sigma: 200 * s, rate: 0.3 });
      if (!pts.length) sources.push({ x: state.view.w * 0.5, y: state.view.h * 0.5, sigma: 300 * s, rate: 0.28 });   // forced collective (dev key)
    }
    for (const l of state.connections.values()) {     // connections carry a little warmth along their length
      if (l.strength < 0.1) continue;
      for (const t of [0.15, 0.5, 0.85]) {
        sources.push({ x: l.a.px + (l.b.px - l.a.px) * t, y: l.a.py + (l.b.py - l.a.py) * t, sigma: 110 * s, rate: 0.07 * l.strength });
      }
    }
  }

  // ---- public --------------------------------------------------------------
  function update(dt, now) {
    updateAmbientRipples(now);
    updateRain(now);
    if (now < lastFieldTime) lastFieldTime = -Infinity;      // clock went backwards: recompute
    if (now - lastFieldTime < 1 / C.WATER_UPDATE_HZ) return;
    const tick = lastFieldTime === -Infinity ? 1 / C.WATER_UPDATE_HZ : now - lastFieldTime;
    lastFieldTime = now;

    // The slow layers (currents, warmth, tone) refresh at WATER_FLOW_HZ; ripples and lighting every tick.
    if (now < lastFlowTime) lastFlowTime = -Infinity;
    if (now - lastFlowTime >= 1 / C.WATER_FLOW_HZ - 1e-4) {
      const flowDt = lastFlowTime === -Infinity ? 1 / C.WATER_FLOW_HZ : now - lastFlowTime;
      lastFlowTime = now;
      flow.computeGrid();                                     // currents, ambient height, tone
      gatherWarmthSources();
      warmth.update(flowDt, flow.grid, sources, state.collectiveTouchMode);
      upsampleAmbient();
    }
    if (C.BACKGROUND_STYLE === 'gradient') height.fill(0); else { height.set(ambientH); addLines(now); }
    const g = flow.grid;
    for (const r of ripples.list) addRipple(r, g);            // surface layer, carried by the same currents
    shade();
    sctx.putImageData(imageData, 0, 0);
  }

  function render(ctx) {
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';   // bilinear upscale keeps the surface soft
    ctx.drawImage(surface, 0, 0, lw * div, lh * div);
  }

  return { resize, update, render, warmth };
}
