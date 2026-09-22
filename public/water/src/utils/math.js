// Small shared helpers.
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const clamp01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const rand = (a, b) => a + Math.random() * (b - a);
export const randRange = ([a, b]) => rand(a, b);
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
