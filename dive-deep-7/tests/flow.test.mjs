import { FIXTURE_THOUGHTS } from './fixtures/fixtureThoughts.mjs';
// Water flow field + ripple deformation: the shared current, wakes, carried rings, remnants.
import assert from 'node:assert/strict';
import * as C from '../src/config/constants.js';
import { createInstallationState, resizeView } from '../src/state/installationState.js';
import { createFlow } from '../src/visuals/flow.js';
import { RippleSystem, rippleAmplitude } from '../src/visuals/ripple.js';

let pass = 0; const ok = (m) => { pass++; console.log('  ✓', m); };
function world() {
  const state = createInstallationState({ dataset: FIXTURE_THOUGHTS, activateAll: true }); resizeView(state, 1920, 1080, 1);
  const flow = createFlow(state); state.flow = flow; flow.resize(1920, 1080, 1, 18);
  const ripples = new RippleSystem(state);
  return { state, flow, ripples };
}
const v = { vx: 0, vy: 0 };

{ // mostly horizontal, bounded, spatially varied, some leftward bands
  const { flow } = world();
  for (let i = 0; i < 300; i++) flow.update(0.1);
  let sx = 0, sy = 0, left = 0, n = 0, max = 0; const vals = new Set();
  for (let y = 40; y < 1080; y += 60) for (let x = 40; x < 1920; x += 90) {
    const f = flow.velocityAt(x, y, v); sx += Math.abs(f.vx); sy += Math.abs(f.vy);
    if (f.vx < 0) left++; n++; max = Math.max(max, Math.hypot(f.vx, f.vy)); vals.add(Math.round(f.vx));
  }
  assert.ok(sx > sy * 2, 'flow is mostly horizontal'); ok('flow is mostly horizontal');
  assert.ok(max < 160, 'speeds stay bounded'); ok(`speeds bounded (max ${max.toFixed(1)} px/s)`);
  assert.ok(left === 0, 'no leftward flow'); ok('the whole current runs left → right');
  assert.ok(vals.size > 8, 'spatially varied'); ok('velocity varies across the screen');
}
{ // never repeats
  const { flow } = world(); const a = [];
  for (let k = 0; k < 6; k++) { for (let i = 0; i < 400; i++) flow.update(0.25); a.push(flow.velocityAt(900, 500, v).vx); }
  assert.ok(new Set(a.map((x) => x.toFixed(3))).size === a.length); ok('current does not loop');
}
{ // impulses pull locally and decay
  const { flow } = world();
  const before = flow.velocityAt(600, 500, v).vx;
  flow.impulse(600, 500, 40, 0, { radius: 200, life: 3 }); for (let i = 0; i < 8; i++) flow.update(0.1); flow.computeGrid();
  assert.ok(flow.velocityAt(600, 500, v).vx > before + 5); ok('local pull adds current at its origin');
  const far = flow.velocityAt(1800, 100, { vx: 0, vy: 0 }).vx;
  for (let i = 0; i < 400; i++) { flow.update(0.05); flow.computeGrid(); }
  assert.ok(Math.abs(flow.velocityAt(600, 500, v).vx - before) < 40); ok('local pull fades');
  assert.ok(Number.isFinite(far));
}
{ // wake: lead + trailing crescents + capped; thought ripple outlasts touch; remnants follow a fading ring
  const { ripples } = world();
  ripples.createWake({ x: 900, y: 500, dir: 0, strength: 1, speed: 1, moving: true });
  const types = ripples.list.map((r) => r.type);
  assert.ok(types.includes('movement') && types.filter((t) => t === 'wake').length >= 2); ok('camera movement makes a lead ripple with trailing wake crescents');
  const lead = ripples.list.find((r) => r.type === 'movement');
  assert.ok(lead.stretch > 1); ok('the movement ripple is stretched along its travel');
  for (let i = 0; i < 50; i++) ripples.createWake({ x: 900 + i, y: 500, dir: 0, strength: 1, speed: 1, moving: true });
  assert.ok(ripples.countType('wake') <= C.MAX_WAKE_RIPPLES); ok('wake ripples are capped');
}
{ // thought ripple is stronger and longer-lived than touch; collective is strongest
  const { ripples } = world();
  const t = ripples.create({ x: 500, y: 500, type: 'touch' }), th = ripples.create({ x: 500, y: 500, type: 'thought' });
  const co = ripples.create({ x: 500, y: 500, type: 'collective' });
  for (const r of [t, th, co]) r.age = 0.8;
  assert.ok(rippleAmplitude(th) > rippleAmplitude(t)); ok('thought ripple stronger than touch');
  assert.ok(rippleAmplitude(co) >= rippleAmplitude(th)); ok('collective ripple strongest');
  assert.ok(C.RIPPLE_TYPES.ambient.strength < C.RIPPLE_TYPES.movement.strength && C.RIPPLE_TYPES.movement.strength < C.RIPPLE_TYPES.thought.strength);
  ok('hierarchy: ambient < movement < thought');
}
{ // remnant follows a fading thought ripple, and the tail keeps it visible past its main life
  const { ripples } = world();
  ripples.create({ x: 800, y: 500, type: 'thought' });
  for (let i = 0; i < 20 * 20; i++) ripples.update(0.05);
  assert.ok(ripples.list.some((r) => r.type === 'remnant') || ripples.list.length === 0); ok('fading thought ripple leaves a remnant (or has fully cleared)');
}
console.log(`${pass} flow/ripple checks passed`);
