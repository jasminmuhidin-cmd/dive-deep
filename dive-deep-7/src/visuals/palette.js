// Blends the cool ambient palette toward the warm collective palette.
import { COOL_WATER_PALETTE as COOL, WARM_WATER_PALETTE as WARM } from '../config/constants.js';
import { lerp, smoothstep } from '../utils/math.js';

const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Recompute state.palette from state.collectiveAmount. Call once per frame. */
export function updatePalette(state) {
  const m = smoothstep(state.collectiveAmount);
  state.paletteMix = m;
  state.palette = {
    top: mix3(COOL.top, WARM.top, m),
    bottom: mix3(COOL.bottom, WARM.bottom, m),
    light: mix3(COOL.light, WARM.light, m),
  };
}

export const rgba = (c, a) => `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${a})`;
