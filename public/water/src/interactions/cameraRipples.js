// ---------------------------------------------------------------------------
// cameraRipples.js — turns camera-detected people into calm movement ripples and wakes.
//
// The camera affects ONLY the water. Nothing in this file touches a thought:
// movement ripples have `affects: 0`, and revealing is decided solely by touch.
//
// How "more people" stays calm rather than chaotic:
//   • one person  → a ripple at their position about every ~2 s while they move
//   • n people    → each person's gap grows (MOVEMENT_CROWD_SLOWDOWN), so the water gets
//                   livelier but sub-linearly; ripples are NOT bigger or faster
//   • a patch of water can't ripple again within MOVEMENT_AREA_COOLDOWN
//   • a token bucket enforces MOVEMENT_MAX_RATE ripples/second overall, and the
//     ripple system itself caps simultaneous movement ripples (MAX_MOVEMENT_RIPPLES)
//   • someone standing still sends only an occasional, gentler "presence" ripple
//
// Movement is a WAKE, not a stone dropped in a pond: each person's direction of travel is
// tracked, and a movement ripple is drawn out along it (blended with the local current), with
// two short crescents left behind on their path and a brief pull on the water around them.
// Someone merely present gets a ripple that the current stretches sideways — no trail.
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';

export function createCameraRipples({ state, ripples, rng = Math.random }) {
  const people = new Map();      // id → { nextMove, nextPresence, seen }
  const areaNext = new Map();    // "cx,cy" → time the patch may ripple again
  let lastCam = -99;             // CAMERA_RIPPLE_COOLDOWN: at most one camera ripple per cooldown, however many people
  let bucket = 1.5;              // token bucket (ripples)
  let sim = null;                // simulated mouse "person" (dev fallback when there is no camera)
  const r = (a, b) => a + (b - a) * rng();

  /** Dev fallback: feed a mouse position (only used when there is no camera and S is on). */
  function simulate(px, py, speed) {
    sim = { x: px / state.view.w, y: py / state.view.h, energy: Math.min(1, speed / 900), at: state.time.now };
  }

  function points(now) {
    if (state.camera.status === 'ready') return state.movementPoints;
    if (state.camera.simulate && sim && now - sim.at < 0.25) {
      return [{ id: 'sim', x: sim.x, y: sim.y, strength: sim.energy, moving: sim.energy >= C.MOVEMENT_MIN_ENERGY, present: true }];
    }
    return [];
  }

  /** A smoothed velocity (screen px/s) for one person, from where they were ~¼ s ago. */
  function trackVelocity(m, x, y, now) {
    if (!m.p0) { m.p0 = { x, y, t: now }; return; }
    const dt = now - m.p0.t;
    if (dt < 0.25) return;
    m.vx += ((x - m.p0.x) / dt - m.vx) * 0.5;
    m.vy += ((y - m.p0.y) / dt - m.vy) * 0.5;
    m.p0 = { x, y, t: now };
  }

  /** Which way the wake points: their direction of travel, gently blended with the local current. */
  function wakeDirection(m, x, y) {
    const sp = Math.hypot(m.vx, m.vy);
    const f = state.flow ? state.flow.velocityAt(x, y, flowVec) : { vx: 0, vy: 0 };
    const fs = Math.hypot(f.vx, f.vy) || 1;
    // wakeDirection = normalize(movementVector * 0.6 + FLOW_DIRECTION * 0.4); with unreliable movement, just go with the current
    const fd = Math.hypot(C.FLOW_DIRECTION_X, C.FLOW_DIRECTION_Y) || 1;
    const dx = C.FLOW_DIRECTION_X / fd, dy = C.FLOW_DIRECTION_Y / fd;
    if (sp < 25 * state.view.scale) return Math.atan2(fs > 0.5 ? f.vy : dy, fs > 0.5 ? f.vx : dx);
    return Math.atan2((m.vy / sp) * 0.6 + dy * 0.4, (m.vx / sp) * 0.6 + dx * 0.4);
  }
  const flowVec = { vx: 0, vy: 0 };

  /** People right now, in screen px — for things that should react to a body in the water (the Thought wave, the presence patterns). */
  function peoplePx(now) {
    const { w, h } = state.view;
    return points(now).filter((p) => p.present !== false).map((p) => ({
      id: p.id, x: p.x * w, y: p.y * h, moving: !!p.moving, energy: p.strength || 0, area: p.area || 0.06,
    }));
  }

  function update(dt, now) {
    bucket = Math.min(2, bucket + C.MOVEMENT_MAX_RATE * dt);
    const pts = points(now);
    if (state.camera.simulate && state.camera.status !== 'ready') {
      state.personCount = pts.length ? 1 : 0;
      state.movementIntensity = pts.length ? pts[0].strength : 0;
    }

    const n = pts.length;
    const crowd = 1 + C.MOVEMENT_CROWD_SLOWDOWN * Math.max(0, n - 1);
    const { w, h } = state.view;

    for (const p of pts) {
      let m = people.get(p.id);
      if (!m) { m = { nextMove: now + r(0.15, 0.6), nextPresence: now + r(...C.PRESENCE_RIPPLE_INTERVAL), p0: null, vx: 0, vy: 0 }; people.set(p.id, m); }
      m.seen = now;
      trackVelocity(m, p.x * w, p.y * h, now);
      // A body in the water: a small, lingering local displacement (the current parts around them and closes behind them).
      // Gentle for someone standing still, stronger and directional for someone moving — but never more than a small pull.
      if (state.flow && p.present && now >= (m.nextPull ?? 0)) {
        const sp = Math.hypot(m.vx, m.vy), s = state.view.scale;
        const k = Math.min(1, sp / (500 * s));
        state.flow.impulse(p.x * w, p.y * h, (sp > 1 ? m.vx / sp : 0) * (3 + 9 * k) * s, (sp > 1 ? m.vy / sp : 0) * (3 + 9 * k) * s,
                           { radius: 0.72 * C.CAMERA_INTERACTION_RADIUS * s, life: 2.2 });
        m.nextPull = now + 0.9 / Math.sqrt(crowd);
      }

      const cell = `${Math.floor(p.x * 6)},${Math.floor(p.y * 4)}`;
      const areaFree = now >= (areaNext.get(cell) ?? 0);
      const px = p.x * w + r(-14, 14) * state.view.scale;      // a little scatter: never the exact same spot
      const py = p.y * h + r(-14, 14) * state.view.scale;

      if (p.moving && p.present && now >= m.nextMove && areaFree && bucket >= 1 && now - lastCam >= C.CAMERA_RIPPLE_COOLDOWN) {
        // Strength varies only slightly with how much they move — never "bigger ripples for more motion".
        const k = 0.8 + 0.2 * Math.min(1, p.strength / 0.6);
        if (ripples.createWake({ x: px, y: py, dir: wakeDirection(m, px, py), speed: Math.hypot(m.vx, m.vy) / (500 * state.view.scale),
                                 strength: C.RIPPLE_TYPES.movement.strength * k, moving: true })) {
          bucket -= 1; lastCam = now;
          areaNext.set(cell, now + C.MOVEMENT_AREA_COOLDOWN);
        }
        m.nextMove = now + C.MOVEMENT_RIPPLE_COOLDOWN * crowd * r(0.85, 1.25);
        m.nextPresence = now + r(...C.PRESENCE_RIPPLE_INTERVAL);
      } else if (!p.moving && p.present && now >= m.nextPresence && areaFree && bucket >= 1 && now - lastCam >= C.CAMERA_RIPPLE_COOLDOWN) {
        // Someone standing quietly: an occasional very gentle ripple ("someone is here").
        if (ripples.createWake({ x: px, y: py, strength: C.RIPPLE_TYPES.movement.strength * C.PRESENCE_RIPPLE_STRENGTH, moving: false })) {
          bucket -= 1; lastCam = now;
          areaNext.set(cell, now + C.MOVEMENT_AREA_COOLDOWN);
        }
        m.nextPresence = now + r(...C.PRESENCE_RIPPLE_INTERVAL) * crowd;
      }
    }

    for (const [id, m] of people) if (now - m.seen > 5) people.delete(id);
    if (areaNext.size > 64) for (const [k, t] of areaNext) if (t < now) areaNext.delete(k);
  }

  return { update, simulate, peoplePx, get tracked() { return people.size; } };
}
