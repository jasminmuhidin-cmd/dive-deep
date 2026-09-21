// ---------------------------------------------------------------------------
// entryWave.js — a new thought enters the collective water AT the Thought button and travels in.
//
//   Thought button pressed
//   → a small disturbance opens at the button's edge (fine half-rings)
//   → 1. a NARROW TRAVELLING CURRENT: three thin, low-opacity lines (THOUGHT_ENTRY_LINE_WIDTH / _OPACITY) run in from the button,
//        left → right, gently undulating with the ambient current — no thick band, no glow, no blur
//   → 2. a WIDENING RIPPLE RESPONSE: as the front passes, the water answers with fine surface ripples (lit rings that widen the
//        further the current has come) and the lines fan slightly apart; at the end a larger, irregular ring field opens
//        where the thought surfaces (thoughtEntry.js) — it joins the collective there
//   → 3. a SUBTLE RESIDUAL CURRENT: a couple of faint lines carry on to the right and melt back into the flow
//
// It is water, not a graph: every line has its own wavelength, phase and amplitude, and is carried by the real flow field.
// People (camera) near the path: the lines bend around them, thin where they cross, and re-form; small wakes appear beside them.
//
// Waves are plain objects in state.entryWaves; positions come from time, so there is no hidden state
// (and it is unit-testable without a DOM). Nothing here draws text, numbers or timers.
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import { clamp, clamp01, smoothstep } from '../utils/math.js';
import { bendAt } from './presence.js';

const CREAM = [246, 240, 222], PALE = [190, 222, 240], ICE = [222, 238, 250];
const TAU = Math.PI * 2;
const STRANDS = 3;
const STEP = 34;                                   // px (1080p) between samples along a band
const TAIL_TAU = 6.5;                              // s: how quickly the part of the wave that has already passed melts into the current
const STRAND_WEIGHT = [0.55, 1.0, 0.5];
const STRAND_OFFSET = [-1, 0, 0.9];

/** Where the wave starts: the Thought button's right edge, centre (set by main from the DOM), else the left edge, mid-height. */
export function originOf(state) {
  return state.thoughtOrigin || { x: 0, y: state.view.h * 0.5 };
}

function flowDir() {
  const fx = C.FLOW_DIRECTION_X, fy = C.FLOW_DIRECTION_Y, m = Math.hypot(fx, fy) || 1;
  return { x: Math.max(0.2, fx / m), y: fy / m };
}

/** Eased entry progress of a wave's travelling front, 0 → 1 over `travel` seconds (after the small lead-in). */
export function waveProgress(w, now) {
  return smoothstep(clamp01((now - w.t0 - w.lead) / Math.max(0.01, w.travel - w.lead)));
}

/**
 * The wave front's position: waveX = origin.x + progress * travelDistance; waveY = origin.y + sin(progress * 2π) * amplitude
 * (plus a gentle convergence to the thought's height so it arrives where the thought is).
 */
export function wavePosition(w, progress, out = { x: 0, y: 0 }) {
  out.x = w.ox + progress * w.distX;
  out.y = w.oy + Math.sin(progress * Math.PI * 2) * w.amp + (w.target.y - w.oy) * smoothstep(progress) ;
  return out;
}

/** x of the wave's leading edge (px). Constant speed: the bands behind it are older, the ones ahead do not exist yet. */
export function waveHeadX(w, now) {
  return w.ox + w.v * Math.max(0, now - w.t0 - w.lead);
}

/**
 * The wave's centre-line at x: it leaves the button horizontally and only bends toward the height where the thought will emerge
 * late in its journey, and never by more than a shallow slope (`bendK`) — it stays a horizontal wave; the ripple field that opens
 * at the end (and the widening fan of bands) covers the remaining distance to the thought.
 */
export function waveSpineY(w, x) {
  const u = clamp01((x - w.ox) / Math.max(1, w.distX));
  return w.oy + (w.target.y - w.oy) * w.bendK * smoothstep(Math.pow(u, 1.25));
}

let seq = 0;
const rr = (a, b) => a + Math.random() * (b - a);

/** Start a thought entry from the button: returns the wave (`.travel` = seconds until its front reaches the thought). */
export function startThoughtEntry(t, state, ripples, now, origin = originOf(state)) {
  const s = state.view.scale;
  const D = flowDir();
  const o = origin;
  const distX = Math.max(120 * s, t.px - o.x);
  const lead = C.ENTRY_LEAD_TIME;
  const travel = lead + clamp(distX / (C.THOUGHT_ENTRY_WAVE_SPEED * s), C.ENTRY_MIN_TRAVEL, C.ENTRY_MAX_TRAVEL);
  const amp = 26 * s * C.THOUGHT_ENTRY_WAVE_AMPLITUDE;
  const ang = Math.atan2(t.py - o.y, distX);
  const v = distX / (travel - lead);
  const dyT = t.py - o.y;
  const bendK = Math.abs(dyT) > 1 ? Math.min(0.65, (0.34 * distX) / Math.abs(dyT)) : 0.65;
  const wave = {
    id: ++seq, t0: now, ox: o.x, oy: o.y, distX, amp, lead, travel, life: travel + 9, dir: ang, v, bendK,
    xEnd: Math.max(state.view.w, o.x + distX) + 120 * s,
    target: { x: t.px, y: t.py }, thoughtId: t.id,
    // every band is a little different, so the wave never reads as one mathematical curve
    lam: Array.from({ length: STRANDS }, () => rr(0.8, 1.28)),
    ph: Array.from({ length: STRANDS }, () => rr(0, TAU)),
    ph2: Array.from({ length: STRANDS }, () => rr(0, TAU)),
    am: Array.from({ length: STRANDS }, () => rr(0.62, 1.2)),
    cph: Array.from({ length: STRANDS }, () => v * rr(0.86, 1.08)),
    off: STRANDS_OFFSETS(),
    seed: Math.random() * 100,
    nextPull: now + lead, touched: new Set(), respNext: 0,
  };
  (state.entryWaves = state.entryWaves || []).push(wave);
  if (state.entryWaves.length > 3) state.entryWaves.shift();

  // the current takes a light push along FLOW_DIRECTION at the button (the wave then keeps pulling it as it travels — see updateEntryWaves)
  if (state.flow) {
    const k = C.THOUGHT_ENTRY_SPEED * 0.06 * s * C.THOUGHT_ENTRY_CURRENT_INFLUENCE;
    state.flow.impulse(o.x, o.y, D.x * k, D.y * k, { radius: 300, life: 6 });
  }

  // the water: a small disturbance, then one narrow travelling ripple with a softer follower
  const T = C.RIPPLE_TYPES.entrywave;
  const speed = distX / Math.max(1, travel - lead);
  const speedMul = speed / (T.speed * s);
  const lifeMul = (travel + 6) / T.life;
  ripples.create({ x: o.x, y: o.y, type: 'reveal', strength: 0.7, lifeMul: 0.6, dir: ang, sector: { ahead: true, width: 1.6 } });
  [[0, 1.0], [1.2, 0.5]].forEach(([delay, k]) => {
    ripples.create({ x: o.x, y: o.y, type: 'entrywave', strength: T.strength * C.THOUGHT_ENTRY_WAVE_AMPLITUDE * k, delay: lead + delay,
                     dir: ang, speedMul, lifeMul, stretch: 1.3, sector: { ahead: true, width: 0.55 } });
  });
  return wave;
}
export const launchEntryWave = startThoughtEntry;          // (older name)

function STRANDS_OFFSETS() { return STRAND_OFFSET.map((o) => o * rr(0.82, 1.2)); }

/**
 * Per frame: the wave keeps hold of the water as it passes (small pulls along its path, so each thought briefly
 * changes the collective current — never permanently), makes small wakes beside any person it passes, and retires
 * finished waves.
 */
export function updateEntryWaves(state, now, ripples = null) {
  const list = state.entryWaves;
  if (!list) return;
  const s = state.view.scale;
  const D = flowDir();
  for (let i = list.length - 1; i >= 0; i--) {
    const w = list[i];
    if (now - w.t0 > w.life) { list.splice(i, 1); continue; }
    if (now < w.t0 + w.lead) continue;
    const head = waveHeadX(w, now);

    // pull the nearby current along, a little behind the front, as it goes
    if (state.flow && now >= w.nextPull && head < w.xEnd - 100 * s && C.THOUGHT_ENTRY_CURRENT_INFLUENCE > 0) {
      w.nextPull = now + 0.55;
      const x = head - 90 * s, y = waveSpineY(w, x);
      const k = (10 + 8 * smoothstep((x - w.ox) / (600 * s))) * s * C.THOUGHT_ENTRY_CURRENT_INFLUENCE;
      state.flow.impulse(x, y, D.x * k, D.y * k, { radius: (200 + 130 * C.THOUGHT_ENTRY_SPREAD) , life: 5 });
    }

    // the water's answer: fine surface ripples where the front has passed, widening the further it has come
    while (ripples && w.respNext < 12 && head >= w.ox + (w.respNext + 1) * 200 * s && head < w.xEnd) {
      const k = ++w.respNext, x = w.ox + k * 200 * s, y = waveSpineY(w, x);
      const grow = 0.7 + 0.16 * k;
      ripples.create({ x, y, type: 'surface', strength: C.RIPPLE_TYPES.surface.strength * C.THOUGHT_ENTRY_WAVE_AMPLITUDE * (0.7 + 0.05 * k),
                       dir: 0, speedMul: grow, wavelengthMul: 0.9 + 0.05 * k, sector: { ahead: true, width: 1.0 + 0.06 * k } });
    }

    // a person the wave reaches: two small secondary wakes beside them (the wave itself bends around them in drawing)
    if (ripples && state.people) {
      for (const p of state.people) {
        if (w.touched.has(p.id) || p.amt < 0.25) continue;
        if (head < p.x - 0.4 * p.R) continue;
        w.touched.add(p.id);
        if (Math.abs(p.y - waveSpineY(w, p.x)) > 2.4 * p.R) continue;
        const T = C.RIPPLE_TYPES.wake.strength;
        [[-1, 0.0], [1, 0.5]].forEach(([side, delay]) => {
          ripples.create({ x: p.x + 0.45 * p.R, y: p.y + side * 0.6 * p.R, type: 'wake', strength: T * 1.1, delay, dir: side * 0.55,
                           sector: { ahead: true, width: 1.0 } });
        });
      }
    }
  }
}

// ---- drawing -------------------------------------------------------------------------
const css = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const nz = (x, k, t) => 0.5 * (Math.sin(x * 0.0061 + k * 1.7 + t * 0.23) + 0.6 * Math.sin(x * 0.0137 - k * 2.3 - t * 0.31)) / 1.3 * 1.6;   // ≈ ±0.6, slowly drifting

// per-frame sample buffers (no allocation while drawing)
const MAXS = 96;
const XS = new Float32Array(MAXS), SPR = new Float32Array(MAXS);
const YS = new Float32Array(STRANDS * MAXS), AS = new Float32Array(STRANDS * MAXS);
const _fv = { vx: 0, vy: 0 };
const _b = { dy: 0, gap: 1, near: 0 };

/** Fine half-rings leaving the button: the first small disturbance. */
function drawSource(ctx, w, now, s, A) {
  const age = now - w.t0, span = w.lead + 1.6;
  if (age > span + 1) return;
  const q = clamp01(age / span);
  ctx.save();
  ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    const p = clamp01((q - k * 0.17) / 0.7);
    if (p <= 0) continue;
    const r = (8 + 66 * smoothstep(p)) * s;
    ctx.lineWidth = (1.3 - 0.2 * k) * Math.max(0.8, s);
    ctx.strokeStyle = css(CREAM, 0.5 * A * C.THOUGHT_ENTRY_OPACITY / 0.42 * Math.sin(Math.PI * Math.min(1, p * 1.05)) * (1 - k * 0.22));
    ctx.beginPath(); ctx.arc(w.ox, w.oy, r, -1.3, 1.3); ctx.stroke();
  }
  ctx.restore();
}

/** The larger ripple where the thought joins the collective: fine, irregular, partly open rings (not perfect circles). */
function drawField(ctx, w, now, s, A) {
  const e = now - (w.t0 + w.travel);
  const fin = smoothstep((e + 1.6) / 2.0), fout = 1 - smoothstep((e - 3.6) / 5.5);
  const a = fin * fout * A * 0.42;
  if (a < 0.012) return;
  const grow = 1 + 0.16 * Math.max(0, e + 1.6);
  const { x: cx, y: cy } = w.target;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let k = 0; k < 6; k++) {
    const ringA = smoothstep((e + 1.6 - k * 0.34) / 1.2);
    if (ringA < 0.02) continue;
    const R = (36 + 52 * k) * s * grow;
    const half = 3.0 - 0.14 * k;
    const c0 = 0.5 * Math.sin(w.seed + k * 1.9) + 0.35 * Math.sin(now * 0.07 + k);
    ctx.lineWidth = (1.2 - 0.09 * k) * Math.max(0.8, s);
    ctx.strokeStyle = css(k % 2 ? ICE : CREAM, a * ringA * (0.85 - 0.09 * k));
    ctx.beginPath();
    const n = 64;
    for (let i = 0; i <= n; i++) {
      const th = c0 - half + (2 * half * i) / n;
      const rad = R * (1 + 0.04 * Math.sin(3 * th + w.seed + k) + 0.025 * Math.sin(5 * th - k * 0.7 + now * 0.07));
      const px = cx + Math.cos(th) * rad * 1.1, py = cy + Math.sin(th) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw every wave that is in the water: three thin, low-opacity current lines from the button, the ring field where the thought
 * joins, and a faint residual current beyond it. (The water's own fine ripples are drawn by the water, from ripple.js.)
 */
export function drawEntryWaves(ctx, state, now) {
  const list = state.entryWaves;
  if (!list || !list.length) return;
  const s = state.view.scale, H = state.view.h;
  const A = Math.min(1.5, C.THOUGHT_ENTRY_WAVE_AMPLITUDE), CI = C.THOUGHT_ENTRY_CURRENT_INFLUENCE, SP = C.THOUGHT_ENTRY_SPREAD;
  const OP = C.THOUGHT_ENTRY_OPACITY, LW = C.THOUGHT_ENTRY_LINE_WIDTH;
  const flow = state.flow || null;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const w of list) {
    const age = now - w.t0;
    const tStart = w.t0 + w.lead, tArrive = w.t0 + w.travel;
    const fadeIn = smoothstep((age - 0.15) / (w.lead + 0.4));
    const merge = 1 - smoothstep((age - w.travel - 1.5) / Math.max(1, w.life - w.travel - 1.5));
    drawSource(ctx, w, now, s, A);
    if (age < w.lead * 0.5) continue;

    const head = waveHeadX(w, now);
    const end = Math.min(head, w.xEnd);
    const L = Math.max(w.distX, 700 * s);
    const ampBase = 20 * s * A * (C.THOUGHT_ENTRY_WAVE_LENGTH / 560);
    const lamBase = C.THOUGHT_ENTRY_WAVE_LENGTH * s;
    const step = STEP * s;
    const tphase = Math.max(0, now - tStart);

    // ---- sample the lines ---------------------------------------------------------------
    let n = 0;
    for (let x = w.ox; ; x += step) {
      const xx = Math.min(x, end);
      if (n >= MAXS) break;
      const dx = xx - w.ox;
      const ageX = now - (tStart + dx / w.v);
      const front = smoothstep((head - xx) / (170 * s));
      const rootA = 0.35 + 0.65 * smoothstep(dx / (120 * s));
      const tail = Math.exp(-Math.max(0, ageX) / TAIL_TAU);
      const past = smoothstep((xx - w.target.x) / (240 * s));       // beyond the thought's place only a faint residual current goes on
      const ampX = ampBase * (0.3 + 0.7 * smoothstep(dx / (0.62 * L))) * (1 - 0.4 * past);
      const spread = SP * (3 * s + 52 * s * smoothstep(dx / (0.9 * L)));   // narrow at the button, fanning slightly as it goes
      const baseA = OP * A * fadeIn * merge * front * rootA * tail * (1 - 0.55 * past);
      const spine = waveSpineY(w, xx);
      XS[n] = xx; SPR[n] = spread;
      for (let i = 0; i < STRANDS; i++) {
        const arg = (TAU * (xx - w.cph[i] * tphase)) / (lamBase * w.lam[i]) + w.ph[i] + 1.1 * nz(xx, w.seed + i, now);
        let y = spine + w.off[i] * spread + ampX * w.am[i] * (Math.sin(arg) + 0.3 * Math.sin(arg * 2.13 + w.ph2[i]));
        if (flow && CI > 0) {                                        // the current carries the older part sideways
          flow.velocityAt(xx, y, _fv);
          y += clamp(_fv.vy * Math.max(0, ageX) * 0.6 * CI, -60 * s, 60 * s);
        }
        bendAt(state, xx, y, _b);                                    // people in the water: it bends, thins and re-forms
        y = clamp(y + _b.dy, 10, H - 10);
        YS[i * MAXS + n] = y;
        AS[i * MAXS + n] = baseA * STRAND_WEIGHT[i] * _b.gap * (past > 0.05 && i !== 1 ? 0.5 : 1);
      }
      n++;
      if (xx >= end) break;
    }
    if (n >= 2) {
      for (let i = 0; i < STRANDS; i++) {
        ctx.lineWidth = LW * (i === 1 ? 1 : 0.7) * Math.max(0.8, s);
        for (let j = 0; j < n - 1; j++) {
          const a = (AS[i * MAXS + j] + AS[i * MAXS + j + 1]) * 0.5;
          if (a < 0.006) continue;
          ctx.strokeStyle = css(i === 1 ? CREAM : ICE, Math.min(0.7, a));
          ctx.beginPath(); ctx.moveTo(XS[j], YS[i * MAXS + j]); ctx.lineTo(XS[j + 1], YS[i * MAXS + j + 1]); ctx.stroke();
        }
      }
    }
    drawField(ctx, w, now, s, A);
  }
  ctx.restore();
}
