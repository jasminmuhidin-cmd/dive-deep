// ---------------------------------------------------------------------------
// dragToPrint.js — taking a thought.
//
//   touch thought → readable → "take this thought with you" → drag it down →
//   the print zone fades in as it nears → cross PRINT_ZONE_START_RATIO (armed) → let go at or below
//   PRINT_TRIGGER_RATIO → printThought(thought), once per drag.
//
// • Only a fully readable, un-printed thought can be picked up. A finger that
//   is already resting on the water can slide onto one and carry it away.
// • The thought is pulled through the water (a short lag), not snapped; under a
//   finger it floats slightly above the fingertip so it stays readable.
// • Dropping anywhere else, or after a very short carry, just lets it drift home.
// • After a print the thought sinks, drifts back to its place and can't be
//   raised again for a while. `printed` blocks duplicates until it has sunk;
//   PRINT_LOCKOUT blocks a second job right behind the first.
// • Several people can carry different thoughts at the same time.
// The printer is fire-and-forget: animation never waits for it.
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import { THOUGHT_STATE as S } from '../state/installationState.js';
import { beginSink } from './thoughtReveal.js';
import { clamp, smoothstep } from '../utils/math.js';

export function createDragToPrint({ state, pointers, ripples, printThought, clock = () => performance.now() / 1000 }) {
  /** pointerId → { p, t, offX, offY, startX, startY, targetX, targetY } */
  const drags = new Map();
  /** pointerId → { thoughtId, startX, startY, offX, offY } (touched a readable thought, not moving yet) */
  const pending = new Map();

  const now = clock;
  const startY = () => state.view.h * C.PRINT_ZONE_START_RATIO;      // approach line: arms printing, the zone fades in
  const triggerY = () => state.view.h * C.PRINT_TRIGGER_RATIO;       // trigger line: release here (while armed) to print
  const zoneTop = startY;
  /** 0 at the approach line → 1 at the trigger line (eased). Drives the zone's brightness, the icon and the magnetic pull. */
  const proximity = (y) => smoothstep((y - startY()) / Math.max(1, triggerY() - startY()));
  const byId = (id) => state.thoughts.find((t) => t.id === id);
  const startThreshold = () => Math.max(10, C.DRAG_START_DISTANCE * state.view.scale);

  const isTakeable = (t) => t.state === S.REVEALED && t.revealed && !t.printed && !t.isDragging;

  function candidateFor(p) {
    let best = null, bestD = Infinity;
    for (const t of state.thoughts) {
      if (!isTakeable(t)) continue;
      const d = Math.hypot(t.px - p.x, t.py - p.y);
      if (d <= t.ringRadius && d < bestD) { best = t; bestD = d; }
    }
    return best;
  }

  function arm(p) {
    if (p.virtual || p.dragging || pending.has(p.id)) return;
    const t = candidateFor(p);
    if (t) pending.set(p.id, { thoughtId: t.id, startX: p.x, startY: p.y, offX: t.px - p.x, offY: t.py - p.y });
  }

  function startDrag(p, pd, t) {
    pending.delete(p.id);
    if (t.isDragging) return;
    p.dragging = true;
    t.isDragging = true;
    t.state = S.DRAGGING;
    state.draggedThoughtId = t.id; state.isDraggingThought = true;
    drags.set(p.id, { p, t, offX: pd.offX, offY: pd.offY, startX: pd.startX, startY: pd.startY,
                      armed: false, prox: 0, lift: 0, canLift: p.type === 'touch' || p.type === 'pen' });
  }

  function commitPrint(t, at) {
    t.printed = true;                       // blocks a duplicate until the thought has sunk
    t.printCount += 1;
    t.state = S.PRINTING;
    t.printStart = at; t.printY0 = t.py;
    state.printLockUntil = at + C.PRINT_LOCKOUT;   // interaction lock: no second job right behind this one
    state.printArmed = false;
    state.printZone.flash = 1;              // quiet feedback: the icon brightens and the zone glows, then fades
    ripples.create({ x: t.px, y: t.py, type: 'reveal', strength: 0.5, lifeMul: 0.7 });

    // Fire and forget, exactly once: the visuals never depend on the printer.
    Promise.resolve(printThought(t))
      .then((res) => { if (res && res.ok === false) t.printed = false; })
      .catch(() => { t.printed = false; });
  }

  function drop(d, at) {
    const { p, t } = d;
    drags.delete(p.id);
    p.dragging = false;
    t.isDragging = false;
    if (t.state === S.DRAGGING) t.state = S.REVEALED;        // a plain release: back to normal attention rules
    const carried = Math.hypot(p.x - d.startX, p.y - d.startY);
    const minCarry = C.MIN_PRINT_DRAG_DISTANCE * state.view.scale;
    // print only if: armed (crossed the approach line) AND released AND at/below the trigger line AND not already printed
    if (d.armed && p.y >= triggerY() && carried >= minCarry && !t.printed && at >= state.printLockUntil) commitPrint(t, at);
    // otherwise: it simply drifts home (see update) and follows the normal attention rules
  }

  // ---- pointer events -------------------------------------------------------------
  pointers.on('down', (p) => arm(p));

  pointers.on('move', (p) => {
    if (drags.has(p.id)) return;          // carried thoughts follow the pointer in update()
    const pd = pending.get(p.id);
    if (!pd) { arm(p); return; }          // a resting finger slid onto a readable thought
    const t = byId(pd.thoughtId);
    if (!isTakeable(t) || Math.hypot(t.px - p.x, t.py - p.y) > t.ringRadius * 1.4) {
      pending.delete(p.id);
      arm(p);
      return;
    }
    if (Math.hypot(p.x - pd.startX, p.y - pd.startY) >= startThreshold()) startDrag(p, pd, t);
  });

  pointers.on('up', (p) => {
    pending.delete(p.id);
    const d = drags.get(p.id);
    if (d) drop(d, now());
  });

  // ---- per frame ------------------------------------------------------------------
  function update(dt, at) {
    const { w, h } = state.view;
    const follow = 1 - Math.exp(-dt / C.DRAG_FOLLOW_TIME);
    const home = 1 - Math.exp(-dt / C.RETURN_HOME_TIME);
    let anyInZone = false, armedAny = false, maxProx = 0;

    for (const [id, d] of drags) {
      if (!d.t.isDragging) { d.p.dragging = false; drags.delete(id); continue; } // e.g. reset with R
      // A finger would hide what it carries, so touch lifts the thought a little above the fingertip.
      if (d.canLift) d.lift += (C.DRAG_LIFT * state.view.scale - d.lift) * (1 - Math.exp(-dt / 0.25));
      d.armed = d.p.y >= startY();
      d.prox = d.armed ? proximity(d.p.y) : 0;
      // magnetic pull: a slight downward attraction between the two lines (never a snap)
      const pull = C.PRINT_MAGNET_STRENGTH * d.prox * 46 * state.view.scale;
      d.t.px += (clamp(d.p.x + d.offX, 0, w) - d.t.px) * follow;
      d.t.py += (clamp(d.p.y + d.offY - d.lift + pull, 0, h) - d.t.py) * follow;
      if (d.armed) armedAny = true;
      if (d.p.y >= triggerY()) anyInZone = true;
      maxProx = Math.max(maxProx, d.prox);
    }
    state.printArmed = armedAny;

    for (const t of state.thoughts) {
      // Everything not being carried drifts back to its place.
      if (t.state === S.PRINTING) {                  // settles a little downward and fades into the lower edge
        const q = smoothstep((at - t.printStart) / C.PRINT_SETTLE_TIME);
        t.py = t.printY0 + 26 * state.view.scale * q;
      } else if (!t.isDragging) {
        t.px += (t.homeX - t.px) * home;
        t.py += (t.homeY - t.py) * home;
        if (Math.abs(t.homeX - t.px) < 0.15 && Math.abs(t.homeY - t.py) < 0.15) { t.px = t.homeX; t.py = t.homeY; }
      }
      // "take this thought with you": quiet in, quicker out.
      const show = isTakeable(t) && at - t.revealedAt > C.TAKE_HELPER_DELAY;
      t.helperAlpha = clamp(t.helperAlpha + (show ? dt / 1.2 : -dt / 0.35), 0, 1);
    }

    state.drag = { active: drags.size > 0, count: drags.size, inZone: anyInZone };
    const z = state.printZone;
    // the zone is revealed gradually by approach: nothing at the approach line's edge, brighter as the thought nears the trigger line
    z.approach += (maxProx - z.approach) * (1 - Math.exp(-dt / 0.2));
    const zoneTarget = armedAny ? 0.35 + 0.65 * maxProx : (drags.size > 0 ? 0.06 : 0);
    z.visible += (zoneTarget - z.visible) * (1 - Math.exp(-dt / 0.4));
    z.hover += ((anyInZone ? 1 : 0) - z.hover) * (1 - Math.exp(-dt / 0.25));
    z.flash = Math.max(0, z.flash - dt / C.PRINT_FLASH_TIME);
  }

  return { update, isTakeable, get dragCount() { return drags.size; } };
}
