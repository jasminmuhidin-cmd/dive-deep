// ---------------------------------------------------------------------------
// rain.js — soft rain-patter: very small, sparse marks where the odd drop touches the moving surface.
//
// water.js schedules the drops (irregular gaps, occasionally two close together) and gives each one a faint ripple in the
// height field; this file draws the little graphic that goes with it, in the same language as everything else:
//   a dot that briefly swells · a small INCOMPLETE ring (or two) · a few short radial ticks
// The marks are carried a little way along by the current while they fade. They are tiny (a few dozen px at most), quiet
// (RAIN_RIPPLE_OPACITY) and never frequent (RAIN_RIPPLE_FREQUENCY): texture, not weather. They never touch thoughts.
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import { clamp01, smoothstep } from '../utils/math.js';

const TAU = Math.PI * 2;
const MAX_MARKS = 8;
const _v = { vx: 0, vy: 0 };

/** Add a rain mark to the state (called by water.js when it schedules a drop). */
export function addRainMark(state, x, y, now, size = 1, rng = Math.random) {
  const list = state.rain || (state.rain = []);
  const r = rng();
  const mark = {
    x, y, t0: now, size, life: 2.6 + 1.4 * rng(),
    kind: r < 0.34 ? 'dot' : r < 0.72 ? 'arc' : 'ticks',
    a0: rng() * TAU, span: 1.5 + 1.1 * rng(), a1: rng() * TAU, n: 5 + ((rng() * 3) | 0),
  };
  list.push(mark);
  while (list.length > MAX_MARKS) list.shift();
  return mark;
}

export function updateRainMarks(state, now) {
  const list = state.rain;
  if (!list || !list.length) return;
  for (let i = list.length - 1; i >= 0; i--) if (now - list[i].t0 > list[i].life) list.splice(i, 1);
}

export function drawRain(ctx, state, now) {
  const list = state.rain;
  const OP = C.RAIN_RIPPLE_OPACITY;
  if (!list || !list.length || OP <= 0) return;
  const s = state.view.scale, flow = state.flow || null;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineCap = 'round';
  for (const m of list) {
    const age = now - m.t0, u = clamp01(age / m.life);
    if (age < 0) continue;
    let cx = m.x, cy = m.y;
    if (flow) { flow.velocityAt(m.x, m.y, _v); cx += _v.vx * age * 0.8; cy += _v.vy * age * 0.8; }   // the current takes it along a little
    const grow = smoothstep(u), fade = Math.pow(1 - u, 1.5) * smoothstep(u / 0.08);
    const r = (3 + 30 * m.size * grow) * s;
    const col = (a) => `rgba(236,244,252,${(a * OP).toFixed(3)})`;

    // the dot: it swells for a moment
    const dotA = (1 - smoothstep((u - 0.05) / 0.3)) * smoothstep(u / 0.03 + 0.2);
    if (dotA > 0.01) {
      ctx.fillStyle = col(0.85 * dotA);
      ctx.beginPath(); ctx.arc(cx, cy, (1.3 + 1.2 * u * 4) * s * Math.min(1.4, m.size), 0, TAU); ctx.fill();
    }
    if (m.kind === 'dot') {                                   // just a dot that opens into a soft, faint, nearly-round ring
      ctx.lineWidth = 1 * Math.max(0.8, s); ctx.strokeStyle = col(0.42 * fade);
      ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.2, r * 0.9, 0, m.a0, m.a0 + 4.4); ctx.stroke();
    } else if (m.kind === 'arc') {                            // small incomplete rings, one behind the other
      ctx.lineWidth = 1.1 * Math.max(0.8, s);
      ctx.strokeStyle = col(0.55 * fade);
      ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.25, r, 0, m.a0, m.a0 + m.span); ctx.stroke();
      ctx.strokeStyle = col(0.3 * fade);
      ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.85, r * 1.45, 0, m.a1, m.a1 + m.span * 0.7); ctx.stroke();
    } else {                                                  // short radial marks with gaps between them
      ctx.lineWidth = 1 * Math.max(0.8, s); ctx.strokeStyle = col(0.5 * fade);
      const r0 = r * 0.75, r1 = r * 0.75 + (4 + 5 * m.size) * s;
      for (let k = 0; k < m.n; k++) {
        const th = m.a0 + (k / m.n) * TAU * 0.86;
        const c = Math.cos(th), sn = Math.sin(th);
        ctx.beginPath(); ctx.moveTo(cx + c * r0 * 1.2, cy + sn * r0); ctx.lineTo(cx + c * r1 * 1.2, cy + sn * r1); ctx.stroke();
      }
    }
  }
  ctx.restore();
}
