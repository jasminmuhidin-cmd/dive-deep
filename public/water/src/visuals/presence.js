// ---------------------------------------------------------------------------
// presence.js — people in front of the camera, as bodies in the water.
//
// The camera never reveals or touches a thought; it only changes the water. This module turns each detected person
// into a small local field, in screen px (the camera's x already matches the screen — mirroring is applied upstream):
//
//   state.people = [{ id, x, y, vx, vy, R, amt, moving, run, energy }]
//     R    how far the body reaches into the water (CAMERA_INTERACTION_RADIUS, a little larger for a bigger body)
//     amt  0–1, eased in / out: a person fades into the water and out of it, they never pop
//     run  seconds of continuous movement (a walk across the room, not a twitch)
//
// What that field does, from quiet to busy (all slow, all the same visual language as the Thought wave):
//   still / small movement   the water parts gently around them: a few fine bands bend, a soft lens of light
//   continuous movement      a stretched, directional wake trails behind them: nested bow-wave arcs and a line of dots,
//                            carried and lengthened by the current, fading over a few seconds
//   several people           each has its own calm region; where two regions overlap, the two sets of rings interfere:
//                            a soft lattice of dots and crossing arcs appears only in the overlap
//
//   bendAt(state, x, y)      how the people displace a band passing at (x, y) and how much they open it — used by the
//                            Thought wave, which is never blocked by a body but bends, thins and re-forms around it.
//
// `update` only reads state and writes state.people; `draw` only reads. Both are safe with no camera (people = []).
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import { clamp, smoothstep } from '../utils/math.js';

const CREAM = [246, 240, 222], PALE = [196, 226, 244];
const RNG = (seed) => { let t = seed >>> 0; return () => ((t = (t * 1664525 + 1013904223) >>> 0) / 4294967296); };
const css = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// ---- how bodies bend a passing band ------------------------------------------------------------
const _bend = { dy: 0, gap: 1, near: 0 };
/**
 * For a band point at (x, y): `dy` = how far the people push it (px, away from their centre line — bands above bend up,
 * bands below bend down), `gap` = how much of it survives (1 = untouched, ~0.4 = thinned right through a body),
 * `near` = 0–1, how close to any person (drives small secondary patterning).
 */
export function bendAt(state, x, y, out = _bend) {
  out.dy = 0; out.gap = 1; out.near = 0;
  const list = state.people;
  if (!list || !list.length) return out;
  for (const p of list) {
    if (p.amt < 0.02) continue;
    const R = p.R;
    const dx = x - p.x, dy = y - p.y;
    const gx = Math.exp(-(dx * dx) / (2 * (0.95 * R) * (0.95 * R)));
    if (gx < 0.01) continue;
    const s = dy / (0.5 * R);
    const side = s / (1 + Math.abs(s));                      // −1 … 1 : which side of the body, and how far from its centre line
    const along = p.moving ? 1.25 : 1;                        // people in motion push a little harder
    const gy = Math.exp(-(dy * dy) / (2 * (1.3 * R) * (1.3 * R)));   // bands far above / below them are left alone
    out.dy += side * 0.62 * R * gx * gy * p.amt * along;
    out.gap *= 1 - 0.58 * p.amt * gx * Math.exp(-(s * s));   // opens (thins) the band right at the body
    out.near = Math.max(out.near, gx * p.amt);
  }
  return out;
}

// ---- the presence field ------------------------------------------------------------------------------
export function createPresence({ state, cameraRipples, flow = null }) {
  const mem = new Map();          // id → smoothed person + trail
  let raw = [];

  function update(dt, now) {
    const s = state.view.scale;
    raw = cameraRipples ? cameraRipples.peoplePx(now) : [];
    const seen = new Set();
    for (const q of raw) {
      seen.add(q.id);
      let m = mem.get(q.id);
      if (!m) {
        m = { id: q.id, x: q.x, y: q.y, vx: 0, vy: 0, amt: 0, run: 0, energy: 0, moving: false, R: 0 };
        mem.set(q.id, m);
      }
      const k = 1 - Math.exp(-dt / 0.16);                       // position smoothing: no jitter from the detector
      const px = m.x, py = m.y;
      m.x += (q.x - m.x) * k; m.y += (q.y - m.y) * k;
      if (dt > 0) {
        const kv = 1 - Math.exp(-dt / 0.4);
        m.vx += ((m.x - px) / dt - m.vx) * kv; m.vy += ((m.y - py) / dt - m.vy) * kv;
      }
      m.energy += (q.energy - m.energy) * (1 - Math.exp(-dt / 0.3));
      const speed = Math.hypot(m.vx, m.vy);
      m.moving = !!q.moving && speed > 40 * s;
      m.run = m.moving ? m.run + dt : Math.max(0, m.run - dt * 2);
      m.R = C.CAMERA_INTERACTION_RADIUS * s * clamp(0.8 + 0.9 * Math.sqrt(q.area || 0.06), 0.85, 1.3);
      m.amt += (1 - m.amt) * (1 - Math.exp(-dt / 0.7));
      m.present = true;

    }
    for (const [id, m] of mem) {
      if (!seen.has(id)) {
        m.present = false; m.moving = false; m.run = 0;
        m.amt *= Math.exp(-dt / 1.4);
        m.vx *= 0.9; m.vy *= 0.9;
        if (m.amt < 0.02) mem.delete(id);
      }
    }
    state.people = [...mem.values()].filter((m) => m.amt > 0.02 && m.present)
      .map((m) => ({ id: m.id, x: m.x, y: m.y, vx: m.vx, vy: m.vy, R: m.R, amt: m.amt, moving: m.moving, run: m.run, energy: m.energy }));
  }

  // ---- camera currents ---------------------------------------------------------------------------------
  // movement → a current is born near the mover → it extends outward, its direction turning into the global
  // left-to-right flow → it reaches across the screen → it slowly fades. No movement = no new currents.
  const currents = [];
  let nextSpawn = 0, spawnSeed = 1, rr = 0;

  function makeCurrent(m, now) {
    const s = state.view.scale, W = state.view.w, H = state.view.h;
    const rnd = RNG(spawnSeed++ * 7919 + 13);
    const sp = Math.hypot(m.vx, m.vy) || 1;
    // start slightly ahead of the mover, heading roughly where they move (but never far against the flow)
    let ang = Math.atan2(m.vy, m.vx);
    ang = clamp(Math.atan2(Math.sin(ang), Math.cos(ang) * 0.6 + 0.5), -1.2, 1.2);   // pulled toward "rightward"
    const step = 14 * s;
    const pts = [];
    let x = m.x + (m.vx / sp) * m.R * 0.3, y = m.y + (m.vy / sp) * m.R * 0.3;
    const ph = rnd() * 6.28, wob = (10 + 14 * rnd()) * s, per = (260 + 180 * rnd()) * s;
    let a = ang, dist = 0;
    for (let i = 0; i < 400 && x < W + 60 * s; i++) {
      pts.push({ x, y, d: dist });
      const join = smoothstep(dist / (W * 0.45));            // the further out, the more it follows the global flow
      const fl = flow ? flow.velocityAt(x, y, { vx: 0, vy: 0 }) : { vx: 1, vy: 0 };
      const fa = Math.atan2(fl.vy, Math.abs(fl.vx) + 1e-3 + 0.0001);
      const target = fa * 0.5;
      a += (target - a) * (0.03 + 0.05 * join) + Math.sin(dist / per * 6.28 + ph) * 0.02;
      x += Math.cos(a) * step; y += Math.sin(a) * step; dist += step;
      if (y < -40 || y > H + 40) break;
    }
    return { pts, born: now, life: C.CAMERA_CURRENT_LIFE * (0.8 + 0.4 * rnd()), ph, wob, strength: clamp(0.5 + m.energy * 1.5, 0.5, 1), len: dist, ang, sx: x, seed: rnd() };
  }

  function updateCurrents(dt, now) {
    for (let i = currents.length - 1; i >= 0; i--) if (now - currents[i].born > currents[i].life) currents.splice(i, 1);
    const movers = state.people.filter((p) => p.moving);
    if (!movers.length || C.CAMERA_CURRENT_STRENGTH <= 0) return;
    const total = movers.reduce((t, p) => t + clamp(p.energy * 2, 0.15, 1), 0);
    const cap = clamp(1 + Math.round(total * 2.2), 1, C.CAMERA_CURRENT_MAX);
    if (currents.length >= cap || now < nextSpawn) return;
    const m = movers[rr++ % movers.length];
    const c = makeCurrent(m, now);
    if (c.pts.length < 6) return;
    currents.push(c);
    nextSpawn = now + 1.4 / Math.max(0.3, movers.length);
    if (flow) flow.impulse(m.x, m.y, 60 * C.CAMERA_CURRENT_STRENGTH * state.view.scale, 0, { radius: 260 * state.view.scale, life: 5 });
  }

  const origUpdate = update;
  function fullUpdate(dt, now) { origUpdate(dt, now); updateCurrents(dt, now); }

  function drawCurrents(ctx, now) {
    if (!currents.length) return;
    const s = state.view.scale, sp = C.CAMERA_CURRENT_SPEED * s;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const c of currents) {
      const age = now - c.born, u = age / c.life;
      const env = smoothstep(age / 1.2) * Math.pow(1 - u, 1.4) * c.strength * C.CAMERA_CURRENT_OPACITY * C.CAMERA_CURRENT_STRENGTH;
      if (env < 0.004) continue;
      const head = age * sp, tailStart = Math.max(0, (age - c.life * 0.35) * sp * 0.9);   // it detaches from its source and drifts on
      const strands = [[-1, 0.55], [0, 1], [1.1, 0.5]];
      for (const [off, wgt] of strands) {
        ctx.lineWidth = C.CAMERA_CURRENT_LINE_WIDTH * Math.max(0.8, s) * (off === 0 ? 1 : 0.8);
        ctx.strokeStyle = css(off === 0 ? CREAM : PALE, 1);
        let px = 0, py = 0, first = true;
        for (const p of c.pts) {
          if (p.d > head) break;
          const o = off * (5 + 5 * (p.d / c.len)) * s * (1 + 0.4 * Math.sin(p.d * 0.01 + c.ph));
          const x = p.x, y = p.y + o + c.wob * 0.25 * Math.sin(p.d * 0.006 + c.ph + off);
          if (!first && p.d > tailStart) {
            const tip = smoothstep((head - p.d) / (90 * s));                      // soft leading tip
            const far = 1 - 0.55 * smoothstep(p.d / (state.view.w * 1.1));       // thins out as it spreads
            const tl = smoothstep((p.d - tailStart) / (160 * s));                // trailing end dissolves
            ctx.globalAlpha = env * wgt * tip * far * tl;
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
          }
          px = x; py = y; first = false;
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function draw(ctx, now) { drawCurrents(ctx, now); }

  return { update: fullUpdate, draw, get memory() { return mem; }, get currents() { return currents; } };
}
