// ---------------------------------------------------------------------------
// thoughtReveal.js — attention: which thoughts are being attended to, and the
// submerged → revealing → revealed → blurring state machine.
//
//   submerged ──touch──▶ revealing ──sharp──▶ revealed
//        ▲                   │                    │
//        └──── blurring ◀────┴── attention gone / time's up
//
//   entering (Thought button) ──touch──▶ revealing     (see thoughtEntry.js)
//        └──────────────────────────────▶ submerged    (settles by itself)
//
// Only TOUCH makes a thought readable. Camera presence never appears here.
//
// One "reveal cycle" runs from the first touch until the thought is fully
// submerged again. The 8–12 s clock (maxRevealDuration) starts when the thought
// first becomes readable in that cycle and is NOT reset by re-touching during
// the blur, so attention can't hold a thought open forever. Nobody is ever
// shown that clock: it only surfaces as `idle` (0–1), which the renderer turns
// into a slow shimmer as the water begins to return.
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import { THOUGHT_STATE as S } from '../state/installationState.js';
import { advanceEntry } from './thoughtEntry.js';
import { clamp01, rand } from '../utils/math.js';

/** Call once per frame. */
export function updateThoughtReveal(state, pointerList, ripples, dt, now) {
  const engaged = findEngagedThoughts(state, pointerList, now);
  for (const t of state.thoughts) {
    advanceThought(t, engaged.has(t.id), ripples, dt, now);
  }
}

/** Which thoughts is at least one pointer currently attending to? */
export function findEngagedThoughts(state, pointerList, now) {
  const collective = state.collectiveTouchMode;
  const startR = C.THOUGHT_TOUCH_RADIUS * state.view.scale * (collective ? C.COLLECTIVE_RADIUS_MULT : 1);
  const holdR = startR * C.THOUGHT_HOLD_RADIUS_MULT;
  const maxN = collective ? C.COLLECTIVE_MAX_THOUGHTS_PER_TOUCH : C.MAX_THOUGHTS_PER_TOUCH;

  const engaged = new Set();
  for (const p of pointerList) {
    if (p.dragging) continue;            // a finger carrying a thought doesn't wake others
    const candidates = [];
    for (const t of state.thoughts) {
      if (t.retiring) continue;          // dissolving out of the water
      if (now < t.cooldownUntil) continue; // timed out — let the finger move on to a neighbour
      const d = Math.hypot(t.px - p.x, t.py - p.y);
      const reach = t.sharpness > 0.02 ? holdR : startR; // hysteresis for visible thoughts
      if (d <= reach) candidates.push({ id: t.id, d });
    }
    candidates.sort((a, b) => a.d - b.d);
    for (let i = 0; i < Math.min(maxN, candidates.length); i++) engaged.add(candidates[i].id);
  }
  return engaged;
}

function beginReveal(t, ripples, now) {
  t.state = S.REVEALING;
  t.revealStartTime = now;
  t.readableSince = null;
  t.maxRevealDuration = rand(C.MIN_REVEAL_TIME, C.MAX_REVEAL_TIME);
  t.nextPulseAt = now + C.BREATH_PERIOD * 0.5;   // pulses ride the top of each breath (see thoughtRenderer)
  t.entryReveal = 1;                             // a thought touched mid-entry stops "emerging" and simply reveals
  t.presence = 1;
  t.entrySettling = false;
  // the small ripple that opens beneath a thought as attention arrives
  ripples.create({ x: t.px, y: t.py, type: 'reveal', strength: C.REVEAL_RIPPLE_STRENGTH });
}

function submerge(t) {
  t.state = S.SUBMERGED;
  t.sharpness = 0;
  t.revealStartTime = null;
  t.readableSince = null;
  t.revealedAt = null;
  t.printed = false;                   // a new cycle may be taken again
  t.entryReveal = 1;
  t.entrySettling = false;
  t.presence = t.retiring ? t.presence : 1;
}

/** Let a thought sink back under the water and stay down for `cooldown` seconds (after printing). */
export function beginSink(t, now, cooldown) {
  t.state = S.BLURRING;
  t.cooldownUntil = now + cooldown;
}

function advanceThought(t, engaged, ripples, dt, now) {
  if (t.retiring) { t.isBeingEngaged = false; return; }
  if (t.isDragging) engaged = true;    // being carried is the strongest form of attention
  t.isBeingEngaged = engaged;
  if (engaged) t.lastInteractionTime = now;

  switch (t.state) {
    case S.SUBMERGED:
      if (engaged) beginReveal(t, ripples, now);
      break;

    case S.ENTERING:
      if (engaged && now >= t.cooldownUntil) { beginReveal(t, ripples, now); break; }
      if (advanceEntry(t, ripples, now)) {
        // Kiosk ripples: water disturbance only — words stay under the surface until someone touches
        // (privacy). Thought-button entries still surface on their own for the installation flow.
        if (t.source === 'kiosk') submerge(t);
        else beginReveal(t, ripples, now);
      }
      break;

    case S.REVEALING:
      t.sharpness = Math.min(1, t.sharpness + C.REVEAL_SPEED * dt);
      if (t.sharpness >= 1) {
        t.state = S.REVEALED;
        t.revealedAt = now;
        if (t.readableSince === null) t.readableSince = now;
      }
      break;

    case S.DRAGGING:                                 // carried: fully clear, the attention clock pauses
      t.sharpness = 1;
      if (!t.isDragging) t.state = S.REVEALED;
      break;

    case S.PRINTING: {                               // the print has fired: it settles, fades into the lower edge and submerges
      const q = (now - t.printStart) / C.PRINT_SETTLE_TIME;
      t.sharpness = Math.max(0, 1 - q);
      if (q >= 1) { t.cooldownUntil = now + C.REVEAL_COOLDOWN + 2; submerge(t); }
      break;
    }

    case S.REVEALED:
      if (t.isDragging) break;                       // the clock pauses while it is being carried
      if (now - t.readableSince >= t.maxRevealDuration) {
        t.state = S.BLURRING;                       // attention is temporary
        t.cooldownUntil = now + C.REVEAL_COOLDOWN;
      }                                              // (attention leaving does not cut it short: the words stay for their full 8–12 s)
      break;

    case S.BLURRING:
      if (engaged && now >= t.cooldownUntil) {     // attention returned before it sank
        t.state = S.REVEALING;                     // resumes sharpening; readableSince (the clock) is kept
        break;
      }
      t.sharpness = Math.max(0, t.sharpness - C.BLUR_SPEED * dt);
      if (t.sharpness <= 0) submerge(t);
      break;
  }

  t.revealed = t.sharpness >= C.READABLE_THRESHOLD;

  // A visible thought breathes: its ring gently expands and settles, and at the top
  // of each breath a soft pulse leaves it. (No counters anywhere — just rhythm.)
  if ((t.state === S.REVEALING || t.state === S.REVEALED) && t.sharpness > 0.5 && now >= t.nextPulseAt) {
    ripples.create({ x: t.px, y: t.py, type: 'reveal', strength: C.THOUGHT_PULSE_STRENGTH, lifeMul: 0.6 });
    t.nextPulseAt += C.BREATH_PERIOD;
    if (t.nextPulseAt < now) t.nextPulseAt = now + C.BREATH_PERIOD;
  }

  // `idle` (0–1): how far attention has drifted. Rises through the grace period after a
  // touch ends, and in the last moments before the maximum — as shimmer, not as a number.
  const grace = 0;                      // words no longer fade when attention leaves: only the warning before their time is up shimmers
  let warn = 0;
  if (t.state === S.REVEALED && t.readableSince !== null && !t.isDragging) {
    warn = clamp01(1 - (t.maxRevealDuration - (now - t.readableSince)) / C.EXPIRY_WARNING);
  }
  const idleTarget = t.state === S.BLURRING ? 1
    : (t.state === S.REVEALING || t.state === S.REVEALED) ? Math.max(grace * 0.9, warn) : 0;
  t.idle += (idleTarget - t.idle) * (1 - Math.exp(-dt / 0.4));

  // Direction of the "wash": clearing sweeps top→bottom, submerging sweeps top→bottom too,
  // smoothed so re-touching mid-blur doesn't pop.
  const washTarget = (t.state === S.BLURRING || t.entrySettling) ? 1 : 0;
  t.washDir += (washTarget - t.washDir) * (1 - Math.exp(-dt / 0.5));
}
