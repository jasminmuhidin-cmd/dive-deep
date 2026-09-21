// ---------------------------------------------------------------------------
// collectiveTouch.js — two or more simultaneous touches = collective mode.
//
// This module only decides the mode and eases `collectiveAmount` (0–1), which
// the palette turns into the slow cool → warm shift. It never flashes: the
// amount ramps linearly over COLLECTIVE_WARM_TIME / COLLECTIVE_COOL_TIME.
//
// Non-colour cues (accessibility): a wider set of thoughts is revealed
// (thoughtReveal.js), every touch point emits soft ripples (below), and the
// ambient water moves a little more (water.js). The currents themselves change too (flow.js: they converge on
// the touches, the counter-current fades, bands align) and warmth spreads from the touches (warmth.js).
// Feeling connections: connections.js.
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import { clamp01, rand } from '../utils/math.js';

export function updateCollectiveTouch(state, pointerList, ripples, dt, now) {
  const active = pointerList.length >= C.COLLECTIVE_TOUCH_THRESHOLD || state.forceCollective;
  state.collectiveTouchMode = active;
  state.touchPoints = pointerList.map((p) => ({ x: p.x, y: p.y }));   // read by the flow (convergence) and the warmth field

  const rate = active ? 1 / C.COLLECTIVE_WARM_TIME : -1 / C.COLLECTIVE_COOL_TIME;
  state.collectiveAmount = clamp01(state.collectiveAmount + rate * dt);

  if (!active) return;
  for (const p of pointerList) {
    if (now < p.nextRippleAt) continue;
    // Broader and slower than a lone touch, so the rings from different people overlap and interfere.
    ripples.create({ x: p.x, y: p.y, type: 'touch', strength: C.COLLECTIVE_POINTER_RIPPLE_STRENGTH,
                     wavelengthMul: 1.55, lifeMul: 1.7, speedMul: 1.2 });
    p.nextRippleAt = now + C.COLLECTIVE_POINTER_RIPPLE_INTERVAL * rand(0.85, 1.15);
  }
}
