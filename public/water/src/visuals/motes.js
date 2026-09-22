// ---------------------------------------------------------------------------
// motes.js — a handful of faint suspended specks carried by the current.
//
// They make the flow readable without anyone touching the water: you can see which way the
// water is going, that different bands run at different speeds, and (because each mote sits at
// its own depth and moves at a different fraction of the current) that the water has depth.
// Deliberately restrained: CURRENT_MOTE_COUNT of them (default 56), each a tiny soft streak at very low
// alpha. They are reused for ever — nothing is created or destroyed after start-up. Set the count to 0 to remove them.
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import { rgba } from './palette.js';

export function createMotes(state, flow) {
  let motes = [];
  const vel = { vx: 0, vy: 0 };

  function reset() {
    const { w, h } = state.view;
    motes = [];
    for (let i = 0; i < C.CURRENT_MOTE_COUNT; i++) {
      motes.push({
        x: Math.random() * w, y: Math.random() * h,
        depth: 0.35 + Math.random() * 0.75,            // fraction of the current it follows: deeper = slower
        size: 0.8 + Math.random() * 0.9,
        alpha: 0.05 + Math.random() * 0.09,
        phase: Math.random() * 6.283,
      });
    }
  }

  function update(dt) {
    const { w, h, scale } = state.view;
    if (motes.length !== C.CURRENT_MOTE_COUNT) reset();
    const pad = 24 * scale;
    for (const m of motes) {
      flow.velocityAt(m.x, m.y, vel);
      m.x += vel.vx * m.depth * dt;
      m.y += vel.vy * m.depth * dt + Math.sin(m.phase + state.time.now * 0.15) * 0.6 * scale * dt;   // a slow bob
      if (m.x > w + pad) m.x = -pad; else if (m.x < -pad) m.x = w + pad;
      if (m.y > h + pad) m.y = -pad; else if (m.y < -pad) m.y = h + pad;
    }
  }

  function draw(ctx, now) {
    if (!motes.length) return;
    const { w, h, scale } = state.view;
    const light = state.palette.light;
    ctx.save();
    ctx.lineCap = 'round';
    const edge = 80 * scale;
    for (const m of motes) {
      const fade = Math.min(1, m.x / edge, (w - m.x) / edge, m.y / edge, (h - m.y) / edge);   // never pops in at an edge
      if (fade <= 0) continue;
      flow.velocityAt(m.x, m.y, vel);
      const sp = m.depth * 0.9;                          // streak ≈ 0.9 s of travel: longer where the current runs faster
      const a = m.alpha * fade * (0.75 + 0.25 * Math.sin(now * 0.3 + m.phase));
      ctx.strokeStyle = rgba(light, a);
      ctx.lineWidth = m.size * Math.max(0.7, scale);
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x - vel.vx * sp, m.y - vel.vy * sp);
      ctx.stroke();
    }
    ctx.restore();
  }

  return { update, draw, reset };
}
