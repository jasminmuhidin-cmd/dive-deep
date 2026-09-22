// ---------------------------------------------------------------------------
// connections.js — different thoughts, shared feelings.
//
// While the water is in collective mode, revealed thoughts that share a connection_group,
// share a feeling_tag, or carry manually related feelings (data/feelings.js) are joined by two loosely
// braided strands of light. From each end a soft pulse drifts toward the middle;
// where the two meet, a tiny ripple opens in the water: two thoughts, one feeling.
//
// Restraint is part of the design, so this can never become a network diagram:
//   • only thoughts that are already emerging (CONNECTION_MIN_SHARPNESS) can link
//     — a hidden thought is never hinted at by a line;
//   • links form a forest (no closed loops), at most MAX_CONNECTIONS in total and
//     MAX_CONNECTIONS_PER_THOUGHT per thought; same-feeling links win, nearer first;
//   • strength eases in and out, gated by collective warmth, so links grow in as
//     the water warms and dissolve slowly after collective touch ends.
// Linked thoughts also get `connectionGlow` (0–1), which the renderer uses to make
// their circular ripples resonate gently.
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import { thoughtAffinity } from '../data/feelings.js';
import { THOUGHT_STATE as S } from '../state/installationState.js';
import { smoothstep } from '../utils/math.js';
import { rgba } from './palette.js';

const KEY = (a, b) => (a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);

/**
 * Pure selection: which pairs of currently visible thoughts should be linked?
 * @param {object[]} thoughts
 * @param {Set<string>} [keep] keys of links already showing (small preference → no flicker)
 * @returns {{a:object,b:object,same:boolean,weight:number,key:string}[]}
 */
export function selectConnections(thoughts, keep = null) {
  // Only thoughts that were revealed by attention can link — a thought that is submerged, or
  // still surfacing on its own after entering, is never hinted at by a line.
  const visible = thoughts.filter((t) => !t.retiring && t.state !== S.SUBMERGED && t.state !== S.ENTERING
                                          && t.state !== S.INACTIVE && t.sharpness >= C.CONNECTION_MIN_SHARPNESS);

  const edges = [];
  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      const a = visible[i], b = visible[j];
      const { weight, kind } = thoughtAffinity(a, b);   // same connection_group > same feeling_tag > related feeling
      if (!weight) continue;
      const same = kind !== 'related';
      const key = KEY(a, b);
      edges.push({ a, b, same, kind, weight, key, rank: weight + (keep?.has(key) ? 0.15 : 0),
                   dist: Math.hypot(a.px - b.px, a.py - b.py) });
    }
  }
  edges.sort((p, q) => (q.rank - p.rank) || (p.dist - q.dist));

  // Kruskal-style: strongest, nearest edges first; skip anything that would close a loop.
  const parent = new Map(visible.map((t) => [t.id, t.id]));
  const find = (id) => { while (parent.get(id) !== id) { parent.set(id, parent.get(parent.get(id))); id = parent.get(id); } return id; };
  const degree = new Map();
  const deg = (t) => degree.get(t.id) || 0;
  const out = [];
  for (const e of edges) {
    if (out.length >= C.MAX_CONNECTIONS) break;
    if (deg(e.a) >= C.MAX_CONNECTIONS_PER_THOUGHT || deg(e.b) >= C.MAX_CONNECTIONS_PER_THOUGHT) continue;
    const ra = find(e.a.id), rb = find(e.b.id);
    if (ra === rb) continue;
    parent.set(ra, rb);
    degree.set(e.a.id, deg(e.a) + 1);
    degree.set(e.b.id, deg(e.b) + 1);
    out.push(e);
  }
  return out;
}

export function createConnections(state, ripples = null) {
  const links = state.connections; // Map key → link (lives in state so R can clear it)

  function update(dt) {
    const gate = smoothstep((state.collectiveAmount - 0.1) / 0.7);
    const keep = new Set([...links.entries()].filter(([, l]) => l.strength > 0.15).map(([k]) => k));
    const selected = gate > 0.001 ? selectConnections(state.thoughts, keep) : [];

    for (const l of links.values()) l.target = 0;
    for (const e of selected) {
      let l = links.get(e.key);
      if (!l) {
        l = { key: e.key, a: e.a, b: e.b, same: e.same, weight: e.weight, strength: 0, target: 0,
              seed: (links.size * 2.7 + e.a.phase + e.b.phase) % 6.283, u: 0 };
        links.set(e.key, l);
      }
      const clarity = smoothstep((Math.min(e.a.sharpness, e.b.sharpness) - C.CONNECTION_MIN_SHARPNESS)
                                 / (1 - C.CONNECTION_MIN_SHARPNESS));
      l.target = e.weight * gate * clarity;
    }

    for (const t of state.thoughts) t.connectionGlow = 0;
    for (const [key, l] of links) {
      const tau = l.target > l.strength ? C.CONNECTION_FADE_IN : C.CONNECTION_FADE_OUT;
      l.strength += (l.target - l.strength) * (1 - Math.exp(-dt / tau));
      if (l.target === 0 && l.strength < 0.02) { links.delete(key); continue; }

      l.a.connectionGlow = Math.max(l.a.connectionGlow, l.strength);
      l.b.connectionGlow = Math.max(l.b.connectionGlow, l.strength);

      // Two pulses drift toward the middle; where they meet, the water answers.
      l.u += dt / C.CONNECTION_PULSE_PERIOD;
      if (l.u >= 1) {
        l.u -= 1;
        if (ripples && l.strength > 0.3) {
          ripples.create({ x: (l.a.px + l.b.px) / 2, y: (l.a.py + l.b.py) / 2,
                          type: 'reveal', strength: C.CONNECTION_MEET_RIPPLE * l.strength, lifeMul: 0.5 });
        }
      }
    }
    state.connectionCount = links.size;

    // The water is drawn gently along each connection, and it carries a little more light there.
    if (state.flow) {
      state.flow.setPaths([...links.values()].filter((l) => l.strength > 0.05)
        .map((l) => ({ ax: l.a.px, ay: l.a.py, bx: l.b.px, by: l.b.py, strength: l.strength })));
    }
  }

  // ---- drawing -----------------------------------------------------------------
  const bez = (p0, p1, p2, p3, t) => {
    const m = 1 - t;
    return m * m * m * p0 + 3 * m * m * t * p1 + 3 * m * t * t * p2 + t * t * t * p3;
  };

  /** Cubic control points for one strand, ring edge to ring edge, gently undulating. */
  function strand(l, now, which) {
    const { a, b } = l;
    const s = state.view.scale;
    const dx = b.px - a.px, dy = b.py - a.py;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    const ra = Math.min(a.ringRadius, len * 0.32);
    const rb = Math.min(b.ringRadius, len * 0.32);
    const x0 = a.px + ux * ra, y0 = a.py + uy * ra;
    const x3 = b.px - ux * rb, y3 = b.py - uy * rb;
    const span = Math.hypot(x3 - x0, y3 - y0);
    const side = Math.sin(l.seed * 12.9) > 0 ? 1 : -1;
    const bow = span * (which === 0 ? 0.09 : -0.06) * side;
    const wob = C.CONNECTION_WOBBLE * s;
    const o1 = bow + wob * Math.sin(now * 0.23 + l.seed + which * 2.1);
    const o2 = bow + wob * Math.sin(now * 0.19 + l.seed * 1.7 + which * 1.3 + 1);
    return {
      x0, y0, x3, y3,
      x1: x0 + (x3 - x0) * 0.33 + nx * o1, y1: y0 + (y3 - y0) * 0.33 + ny * o1,
      x2: x0 + (x3 - x0) * 0.66 + nx * o2, y2: y0 + (y3 - y0) * 0.66 + ny * o2,
    };
  }

  function draw(ctx, now) {
    if (links.size === 0) return;
    const { scale } = state.view;
    const light = state.palette.light;
    ctx.save();
    ctx.lineCap = 'round';

    for (const l of links.values()) {
      if (l.strength < 0.01) continue;
      const peak = C.CONNECTION_LINE_ALPHA * l.strength;

      for (let which = 0; which < 2; which++) {
        const p = strand(l, now, which);
        const g = ctx.createLinearGradient(p.x0, p.y0, p.x3, p.y3);
        const a = peak * (which === 0 ? 1 : 0.55);
        g.addColorStop(0, rgba(light, 0));
        g.addColorStop(0.12, rgba(light, a));
        g.addColorStop(0.88, rgba(light, a));
        g.addColorStop(1, rgba(light, 0));
        ctx.strokeStyle = g;
        ctx.lineWidth = (which === 0 ? 1.5 : 1) * Math.max(0.7, scale);
        ctx.beginPath();
        ctx.moveTo(p.x0, p.y0);
        ctx.bezierCurveTo(p.x1, p.y1, p.x2, p.y2, p.x3, p.y3);
        ctx.stroke();
      }

      // Two pulses, one from each thought, easing toward their meeting point.
      const p = strand(l, now, 0);
      const e = smoothstep(l.u) * 0.5;                          // 0 → 0.5 along the strand
      const fade = smoothstep(l.u / 0.15) * (1 - smoothstep((l.u - 0.9) / 0.1));
      for (const from of [0, 1]) {
        for (let k = 0; k < 5; k++) {
          const along = e - k * 0.02;
          if (along < 0) continue;
          const s = from === 0 ? along : 1 - along;
          const x = bez(p.x0, p.x1, p.x2, p.x3, s);
          const y = bez(p.y0, p.y1, p.y2, p.y3, s);
          const alpha = 0.5 * l.strength * fade * (1 - k / 5);
          const r = (12 - k * 1.5) * Math.max(0.7, scale);
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, rgba(light, alpha));
          g.addColorStop(1, rgba(light, 0));
          ctx.fillStyle = g;
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
      }
    }
    ctx.restore();
  }

  return { update, draw, get count() { return links.size; } };
}
