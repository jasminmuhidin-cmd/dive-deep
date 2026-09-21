// ---------------------------------------------------------------------------
// thoughtEntry.js — a NEW thought entering the collective (the Thought button).
//
//   Thought button pressed
//   → a small disturbance at the button, a soft wave fans out left → right (visuals/entryWave.js), gathering
//     structure as it travels; the thought does not exist anywhere until the wave reaches its place
//     (entryTravel seconds later; everything below is timed from that arrival)
//   → a small disturbance appears                     (ENTRY_DISTURB_TIME)
//   → circular ripples begin expanding, three rings   (thought-type ripples)
//   → the words surface from the centre of the ripple (ENTRY_EMERGE_TIME)
//   → the ripple travels outward through the collective, stirring what it passes — and, once it has
//     opened, the water takes hold of it: it is carried and stretched along the current, and a
//     couple of softer arcs follow it downstream (and one faintly upstream)
//   → the thought lingers, partly resolved            (ENTRY_HOLD_TIME)
//   → the water passes back over it and it settles    (ENTRY_SETTLE_TIME)
//
// Everything is communicated by motion — no numbers, no labels. The thought only
// ever reaches ENTRY_PEAK_SHARPNESS on its own; being fully readable still needs
// someone to touch it (and touching it hands it to the normal reveal logic).
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import { THOUGHT_STATE as S } from '../state/installationState.js';
import { clamp01, smoothstep } from '../utils/math.js';
import { startThoughtEntry } from '../visuals/entryWave.js';

/** Pure timeline: what the thought looks like `tau` seconds after it was introduced. */
export function entryProfile(tau) {
  const D = C.ENTRY_DISTURB_TIME, E = C.ENTRY_EMERGE_TIME, H = C.ENTRY_HOLD_TIME, T = C.ENTRY_SETTLE_TIME;
  const peak = C.ENTRY_PEAK_SHARPNESS;
  if (tau < D) return { sharpness: 0, reveal: 0, settling: false, done: false };
  if (tau < D + E) {
    const p = smoothstep((tau - D) / E);
    return { sharpness: peak * p, reveal: p, settling: false, done: false };
  }
  if (tau < D + E + H) return { sharpness: peak, reveal: 1, settling: false, done: false };
  const q = smoothstep((tau - D - E - H) / T);
  return { sharpness: peak * (1 - q), reveal: 1, settling: true, done: tau >= D + E + H + T };
}

export const ENTRY_TOTAL_TIME = C.ENTRY_DISTURB_TIME + C.ENTRY_EMERGE_TIME + C.ENTRY_HOLD_TIME + C.ENTRY_SETTLE_TIME;

/**
 * "This thought entered here and its effect moved through the collective": pull the local
 * current sideways for a while, and send softer secondary arcs downstream (one faint arc upstream).
 */
function carryIntoCurrent(t, ripples) {
  const flow = ripples.state.flow;
  const s = ripples.state.view.scale;
  if (!flow) return;
  const f = flow.velocityAt(t.px, t.py, { vx: 0, vy: 0 });
  const sp = Math.hypot(f.vx, f.vy);
  const dir = sp > 0.5 ? Math.atan2(f.vy, f.vx) : 0;
  const k = 18 * s * Math.min(1.5, C.RIPPLE_CURRENT_INFLUENCE);
  flow.impulse(t.px, t.py, Math.cos(dir) * k, Math.sin(dir) * k, { radius: 560, life: 10 });
  const T = C.RIPPLE_TYPES.thought.strength;
  // a wider, slower swell behind the rings: the larger secondary disturbance, stretched along the current
  ripples.create({ x: t.px, y: t.py, type: 'thought', strength: T * 0.3, delay: 1.6, dir, lifeMul: 1.1, speedMul: 0.55,
                   wavelengthMul: 1.7, stretch: 1.5, sector: { ahead: true, width: 1.9 } });
  [[0, 0.16, 1.0], [1.1, 0.11, 0.85]].forEach(([delay, k2, wl]) => {
    ripples.create({ x: t.px, y: t.py, type: 'thought', strength: T * k2, delay, dir, lifeMul: 0.7, speedMul: 0.6,
                     wavelengthMul: 0.8 * wl, sector: { ahead: true, width: 1.35 } });
  });
  ripples.create({ x: t.px, y: t.py, type: 'thought', strength: T * 0.07, delay: 0.6, dir, lifeMul: 0.6, speedMul: 0.45,
                   wavelengthMul: 0.75, sector: { ahead: false, width: 1.1 } });
}

export function startEntry(t, now) {
  t.state = S.ENTERING;
  t.entryStart = now;
  t.entryRippled = false;
  t.entryCarried = false;
  t.entryWaved = false;
  t.entryTravel = 0;
  t.entryDisturbed = false;
  t.entryReveal = 0;
  t.entrySettling = false;
  t.presence = 0;
  t.sharpness = 0;
  t.revealed = false;
  t.washDir = 0;
}

/** Advance one frame of the entry. Returns true when the thought has finished settling. */
export function advanceEntry(t, ripples, now) {
  if (!t.entryWaved) {                                       // 0. it enters at the Thought button and travels
    t.entryWaved = true;
    const wave = ripples.state.view ? startThoughtEntry(t, ripples.state, ripples, now, ripples.state.thoughtOrigin || undefined) : null;
    t.entryTravel = wave ? wave.travel : 0;
  }
  const tau = now - t.entryStart - t.entryTravel;             // 0 = the wave reaches the thought's place

  if (!t.entryDisturbed && tau >= 0) {                       // 1. a small disturbance where it arrives
    t.entryDisturbed = true;
    ripples.create({ x: t.px, y: t.py, type: 'reveal', strength: 0.7, lifeMul: 0.5 });
    t.entryProgress = 0;
  }
  if (!t.entryRippled && tau >= 0.3) {                        // 2. the larger ripple opens as the wave arrives: three rings, one after another
    t.entryRippled = true;
    C.ENTRY_RING_DELAYS.forEach((delay, i) => {
      ripples.create({ x: t.px, y: t.py, type: 'thoughtEntry', strength: C.RIPPLE_TYPES.thought.strength * C.ENTRY_RING_STRENGTHS[i], delay,
                       maxRadius: C.THOUGHT_ENTRY_RIPPLE_RADIUS, duration: C.THOUGHT_RIPPLE_DURATION });
    });
  }

  // 2b. Once the first clear rings are out, the water takes hold of them.
  if (!t.entryCarried && tau >= 1.0) {
    t.entryCarried = true;
    carryIntoCurrent(t, ripples);
  }

  t.entryProgress = clamp01((now - t.entryStart) / (t.entryTravel + ENTRY_TOTAL_TIME));   // internal only, never displayed
  // The words appear all at once once the ripple has opened (the caller hands the thought to the normal reveal,
  // which holds it fully readable for 8–12 s and then lets it go).
  return tau >= C.ENTRY_DISTURB_TIME;
}

/**
 * The Thought button's behaviour. Kept apart from the DOM so it can be driven by
 * the button, a facilitator key, or tests.
 */
export function createThoughtEntry({ state, pool, clock = () => performance.now() / 1000 }) {
  let lockedUntil = 0;
  return {
    /** @returns the thought that entered, or null if refused (cooldown / nothing to introduce) */
    press() {
      const now = clock();
      if (now < lockedUntil) return null;
      const t = pool.introduce();
      if (!t) return null;
      lockedUntil = now + C.THOUGHT_BUTTON_COOLDOWN;
      startEntry(t, now);
      return t;
    },
    /**
     * Introduce a kiosk-sourced thought with the same entry animation (bypasses Thought-button cooldown).
     */
    pressExternal(def) {
      const now = clock();
      const t = pool.injectExternal(def);
      if (!t) return null;
      startEntry(t, now);
      return t;
    },
    get cooling() { return clock() < lockedUntil; },
  };
}
