// ---------------------------------------------------------------------------
// artefactAdded.js — the facilitator's "a printed artefact has just been added
// to the collective" moment.
//
// One very large, very slow `collective` ripple crosses the whole water. It is the
// strongest ripple in the system (larger and slower than a new thought's) and it
// briefly stirs the thoughts it passes, without making any of them readable.
// Trigger: press A (works even in installation mode), or call registerArtefactAdded().
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';

let context = null;

export function installArtefactAdded({ state, ripples }) {
  context = { state, ripples };
}

/** Create the collective ripple. Returns it, or null if not installed / refused. */
export function registerArtefactAdded() {
  if (!context) return null;
  const { state, ripples } = context;
  const [fx, fy] = C.ARTEFACT_RIPPLE_ORIGIN;
  return ripples.create({ x: state.view.w * fx, y: state.view.h * fy, type: 'collective' });
}
