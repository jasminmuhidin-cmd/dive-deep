import { FIXTURE_THOUGHTS } from './fixtures/fixtureThoughts.mjs';
import assert from 'node:assert/strict';
import * as C from '../src/config/constants.js';
import { createInstallationState, resizeView, THOUGHT_STATE as S } from '../src/state/installationState.js';
import { updateThoughtReveal } from '../src/interactions/thoughtReveal.js';
import { updateCollectiveTouch } from '../src/interactions/collectiveTouch.js';
import { updatePalette } from '../src/visuals/palette.js';
import { RippleSystem, rippleRadius } from '../src/visuals/ripple.js';
import { createConnections, selectConnections } from '../src/visuals/connections.js';

function setup() {
  const state = createInstallationState({ dataset: FIXTURE_THOUGHTS, activateAll: true });
  resizeView(state, 1920, 1080, 1);
  for (const t of state.thoughts) { t.px = t.x * 1920; t.py = t.y * 1080; }
  const ripples = new RippleSystem(state);
  let now = 100; const dt = 1 / 60;
  const ptr = (x, y, id = 1) => ({ id, x, y, nextRippleAt: 0 });
  const step = (pointers, secs) => {
    for (let i = 0; i < Math.round(secs / dt); i++) {
      now += dt;
      updateCollectiveTouch(state, pointers, ripples, dt, now);
      updatePalette(state);
      updateThoughtReveal(state, pointers, ripples, dt, now);
      ripples.update(dt);
    }
  };
  return { state, ripples, step, ptr, get now() { return now; } };
}
const T = (state, id) => state.thoughts.find((t) => t.id === id);
let pass = 0; const ok = (name) => { pass++; console.log('  ✓', name); };

// 1. Touch reveals only the nearby thought — all at once
{
  const { state, step, ptr } = setup();
  const t1 = T(state, 'thought-01');
  const p = ptr(t1.px, t1.py);
  step([p], 0.12);
  assert.equal(t1.state, S.REVEALING); assert.ok(t1.sharpness > 0.2 && t1.sharpness < 0.6, `sharp ${t1.sharpness}`);
  step([p], 0.6);
  assert.equal(t1.state, S.REVEALED); assert.equal(t1.sharpness, 1); assert.ok(t1.revealed);
  const others = state.thoughts.filter((t) => t.id !== 'thought-01' && t.state !== S.SUBMERGED);
  assert.equal(others.length, 0);
  ok('the touched thought appears almost at once (<1 s); nothing else reveals');
}
// 2. Once revealed it stays for its 8–12 s whether or not it is still touched, then disappears
{
  const { state, step, ptr } = setup();
  const t = T(state, 'thought-02'); const p = ptr(t.px, t.py);
  step([p], 0.8); assert.equal(t.state, S.REVEALED);
  assert.ok(t.maxRevealDuration >= 8 && t.maxRevealDuration <= 12);
  step([], t.maxRevealDuration - 1.2); assert.equal(t.state, S.REVEALED); assert.equal(t.sharpness, 1); ok('stays fully readable after the finger leaves, for its 8–12 s');
  step([], 1.6); assert.equal(t.state, S.BLURRING); ok('then disappears');
  step([], 2); assert.equal(t.state, S.SUBMERGED); assert.equal(t.sharpness, 0); assert.equal(t.readableSince, null);
  ok(`gone ~1 s later (life ${t.maxRevealDuration.toFixed(1)} s); cycle reset`);
}
// 3. Max reveal duration even with continued touch, then cooldown
{
  const { state, step, ptr } = setup();
  const t = T(state, 'thought-04'); const p = ptr(t.px, t.py);
  step([p], 0.6); assert.equal(t.state, S.REVEALED);
  step([p], t.maxRevealDuration - 0.3); assert.equal(t.state, S.REVEALED);
  step([p], 0.9);
  assert.equal(t.state, S.BLURRING); ok(`times out at ${t.maxRevealDuration.toFixed(1)}s even while touched`);
  step([p], 2.5); assert.equal(t.state, S.SUBMERGED); ok('no instant re-reveal under a held finger (cooldown)');
  step([p], 3);  // cooldown ends
  assert.notEqual(t.state, S.SUBMERGED); ok('can be raised again after cooldown');
}
// 4. Touching again while revealed does not restart the clock
{
  const { state, step, ptr } = setup();
  const t = T(state, 'thought-06'); const p = ptr(t.px, t.py);
  step([p], 1); const since = t.readableSince;
  step([], 1); step([p], 3);
  assert.equal(t.state, S.REVEALED); assert.equal(t.readableSince, since);
  ok('re-touching does not extend the 8–12 s');
}
// 5. Collective mode: warm gradually, wider reveal, cools slowly
{
  const { state, step, ptr, ripples } = setup();
  const a = T(state, 'thought-15'); // (0.489,0.282)
  const p1 = ptr(a.px, a.py, 1), p2 = ptr(200, 1000, 2);
  step([p1], 1); assert.equal(state.collectiveTouchMode, false); assert.equal(state.collectiveAmount, 0);
  const single = state.thoughts.filter((t) => t.state !== S.SUBMERGED).length;
  step([p1, p2], 1); assert.equal(state.collectiveTouchMode, true);
  assert.ok(state.collectiveAmount > 0.2 && state.collectiveAmount < 0.3, 'ramp ' + state.collectiveAmount);
  ok('collective mode on with 2 touches; warms gradually (1s → ' + state.collectiveAmount.toFixed(2) + ')');
  assert.ok(ripples.list.some((r) => r.type === 'touch'));
  step([p1, p2], 4); assert.equal(state.collectiveAmount, 1);
  const wide = state.thoughts.filter((t) => t.state !== S.SUBMERGED).length;
  console.log(`     revealed: single-touch=${single}, collective=${wide}`);
  step([p1], 3.5); assert.equal(state.collectiveTouchMode, false);
  assert.ok(state.collectiveAmount > 0.4 && state.collectiveAmount < 0.6, 'cool ' + state.collectiveAmount);
  ok('cools back slowly after collective ends (3.5s → ' + state.collectiveAmount.toFixed(2) + ')');
  const m0 = state.paletteMix; step([p1], 4); assert.ok(state.paletteMix < m0); ok('palette follows');
}
// 6. Ripple caps
{
  const { state, ripples } = setup();
  for (let i = 0; i < 20; i++) ripples.create({ x: 1, y: 1, type: 'ambient' });
  assert.equal(ripples.countType('ambient'), C.MAX_AMBIENT_RIPPLES);
  for (let i = 0; i < 100; i++) ripples.create({ x: 1, y: 1, type: 'touch' });
  assert.ok(ripples.list.length <= C.MAX_TOTAL_RIPPLES);
  ok('ambient + total ripple caps hold');
}

// 7. Feeling connections
{
  // 7a. pure selection
  const { state } = setup();
  const show = (id, sharp = 1) => { const t = T(state, id); t.state = S.REVEALED; t.sharpness = sharp; return t; };
  show('thought-01'); show('thought-08'); show('thought-14'); // three 'overwhelmed'
  const sel = selectConnections(state.thoughts);
  assert.ok(sel.length >= 2 && sel.every((c) => c.same), 'same-tag pairs found');
  const deg = {}; sel.forEach((c) => { deg[c.a.id] = (deg[c.a.id] || 0) + 1; deg[c.b.id] = (deg[c.b.id] || 0) + 1; });
  assert.ok(Object.values(deg).every((d) => d <= C.MAX_CONNECTIONS_PER_THOUGHT));
  ok(`same-feeling thoughts link (${sel.length} pairs), per-thought cap respected`);

  const t02 = show('thought-02', 1);            // frustrated: related to overwhelmed
  const sel2 = selectConnections(state.thoughts);
  assert.ok(sel2.some((c) => !c.same), 'related-tag pair found');
  assert.ok(sel2.length <= C.MAX_CONNECTIONS);
  ok('manually related tags link too (frustrated ↔ overwhelmed), total cap respected');

  t02.sharpness = 0.2;                           // barely emerged → excluded
  assert.ok(!selectConnections(state.thoughts).some((c) => c.a.id === 'thought-02' || c.b.id === 'thought-02'));
  T(state, 'thought-08').state = S.SUBMERGED;
  assert.ok(!selectConnections(state.thoughts).some((c) => c.a.id === 'thought-08' || c.b.id === 'thought-08'));
  ok('submerged / barely-emerged thoughts are never linked (no leaking hidden thoughts)');
}
{
  // 7b. lifecycle: none without collective touch, fade in, fade out slowly
  const { state, step, ptr } = setup();
  const conn = createConnections(state);
  const a = T(state, 'thought-01'), b = T(state, 'thought-14'); // both 'overwhelmed', far apart
  const pa = ptr(a.px, a.py, 1), pb = ptr(b.px, b.py, 2);
  const run = (pointers, secs) => { for (let i = 0; i < Math.round(secs * 60); i++) { step(pointers, 1 / 60); conn.update(1 / 60); } };

  run([pa], 4);
  assert.equal(conn.count, 0); ok('single touch: no connections (even with a thought readable)');

  run([pa, pb], 0.6);
  assert.equal(state.collectiveTouchMode, true);
  run([pa, pb], 3);
  assert.equal(conn.count >= 1, true);
  assert.ok(a.connectionGlow > 0 && b.connectionGlow > 0); ok('collective touch: connection appears between same-feeling thoughts');

  // Fade-in must be gradual, not a pop
  const fresh = setup(); const c2 = createConnections(fresh.state);
  const fa = T(fresh.state, 'thought-01'), fb = T(fresh.state, 'thought-14');
  fa.state = fb.state = S.REVEALED; fa.sharpness = fb.sharpness = 1;
  fresh.state.collectiveAmount = 1;
  let prev = 0, maxJump = 0;
  for (let i = 0; i < 120; i++) { c2.update(1 / 60); const g = fa.connectionGlow; maxJump = Math.max(maxJump, Math.abs(g - prev)); prev = g; }
  assert.ok(maxJump < 0.06, 'max per-frame glow change ' + maxJump.toFixed(3)); ok('fade-in is gradual (max per-frame change ' + maxJump.toFixed(3) + ')');

  run([], 0.1);
  const before = state.connectionCount;
  run([], 20);
  assert.equal(conn.count, 0); assert.equal(a.connectionGlow, 0);
  ok(`after touches end, connections fade away naturally (${before} → 0 within 20 s)`);
}
{
  // 7c. how often do two people's touches produce at least one link?
  const trials = 300; let withLink = 0, total = 0, maxSeen = 0;
  for (let n = 0; n < trials; n++) {
    const { state, step, ptr } = setup();
    const conn = createConnections(state);
    const p1 = ptr(Math.random() * 1700 + 100, Math.random() * 800 + 100, 1);
    const p2 = ptr(Math.random() * 1700 + 100, Math.random() * 800 + 100, 2);
    for (let i = 0; i < 6 * 60; i++) { step([p1, p2], 1 / 60); conn.update(1 / 60); }
    if (conn.count) withLink++;
    total += conn.count; maxSeen = Math.max(maxSeen, conn.count);
    assert.ok(conn.count <= C.MAX_CONNECTIONS);
  }
  console.log(`     random two-person touches: ${(100 * withLink / trials).toFixed(0)}% show ≥1 connection, avg ${(total / trials).toFixed(2)}, max ${maxSeen}`);
  ok('connections stay within the cap across 300 random two-person scenarios');
}

console.log(`\n${pass} checks passed`);
