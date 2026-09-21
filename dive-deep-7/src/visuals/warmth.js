// ---------------------------------------------------------------------------
// warmth.js — colour travelling through the water.
//
// During collective touch the water does not flush uniformly warm. Warmth is a field on the
// same coarse grid as the flow:
//   • it BEGINS around the touch points (and, faintly, along the connections between thoughts);
//   • it is CARRIED by the currents (semi-Lagrangian advection along the flow field);
//   • it slowly SPREADS (diffusion), mixing with the cooler water;
//   • when collective touch ends it FADES away gently, still drifting with the current.
// A small uniform floor (WARM_FLOOR × collectiveAmount) keeps the overall mood readable.
// Pure module: no DOM.
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import { clamp } from '../utils/math.js';

const WARM_FLOOR = 0.10;
const WARM_MAX = 0.82;          // even at the touches the water only ever becomes warm-tinted, never a red flood

export function createWarmth() {
  let gw = 0, gh = 0, cell = 12;
  let field = null, next = null;

  function resize(w, h, cellPx) {
    gw = w; gh = h; cell = cellPx;
    field = new Float32Array(gw * gh);
    next = new Float32Array(gw * gh);
  }

  /**
   * @param {number} dt seconds since the last call
   * @param {{gw:number,gh:number,vx:Float32Array,vy:Float32Array}} grid the flow grid (px/s)
   * @param {{x:number,y:number,sigma:number,rate:number}[]} sources where warmth is being made (screen px; rate = per s)
   * @param {boolean} active collective touch is on (warmth is fading otherwise)
   */
  function update(dt, grid, sources, active) {
    if (!field) return;
    dt = clamp(dt, 0, 0.1);
    const speed = C.WARMTH_SPREAD_SPEED;

    // 1. carried by the current
    const k = (speed * dt) / cell;
    const { vx, vy } = grid;
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const idx = j * gw + i;
        const sx = clamp(i - vx[idx] * k, 0, gw - 1.001), sy = clamp(j - vy[idx] * k, 0, gh - 1.001);
        const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0, a = y0 * gw + x0;
        const top = field[a] + (field[a + 1] - field[a]) * fx;
        const bot = field[a + gw] + (field[a + gw + 1] - field[a + gw]) * fx;
        next[idx] = top + (bot - top) * fy;
      }
    }

    // 2. slowly spreading, mixing with the cool water
    const m = clamp(2.2 * speed * dt, 0, 0.3);
    for (let j = 0; j < gh; j++) {
      const up = (j > 0 ? j - 1 : j) * gw, dn = (j < gh - 1 ? j + 1 : j) * gw, row = j * gw;
      for (let i = 0; i < gw; i++) {
        const l = i > 0 ? i - 1 : i, r = i < gw - 1 ? i + 1 : i;
        const avg = 0.25 * (next[row + l] + next[row + r] + next[up + i] + next[dn + i]);
        field[row + i] = next[row + i] + m * (avg - next[row + i]);
      }
    }

    // 3. made around the touches
    for (const s of sources) {
      const inv = 1 / (2 * s.sigma * s.sigma), reach = s.sigma * 2.6;
      const x0 = Math.max(0, ((s.x - reach) / cell) | 0), x1 = Math.min(gw - 1, ((s.x + reach) / cell) | 0);
      const y0 = Math.max(0, ((s.y - reach) / cell) | 0), y1 = Math.min(gh - 1, ((s.y + reach) / cell) | 0);
      for (let j = y0; j <= y1; j++) {
        const dy = (j + 0.5) * cell - s.y;
        for (let i = x0; i <= x1; i++) {
          const dx = (i + 0.5) * cell - s.x;
          const idx = j * gw + i;
          field[idx] = Math.min(WARM_MAX, field[idx] + s.rate * dt * Math.exp(-(dx * dx + dy * dy) * inv));
        }
      }
    }

    // 4. fades: slowly while touching, at the collective cool-down pace once it ends
    const decay = Math.exp(-dt * (active ? 0.03 : 3 / C.COLLECTIVE_COOL_TIME));
    for (let i = 0; i < field.length; i++) field[i] *= decay;
  }

  return {
    resize, update,
    get field() { return field; },
    get floor() { return WARM_FLOOR; },
    max() { let m = 0; if (field) for (let i = 0; i < field.length; i++) if (field[i] > m) m = field[i]; return m; },
  };
}
