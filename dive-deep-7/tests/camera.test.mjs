// Motion / presence detection on synthetic frames (no camera needed).
import assert from 'node:assert/strict';
import * as C from '../src/config/constants.js';
import { createMotionDetector } from '../src/camera/motionDetection.js';

let pass = 0; const ok = (m) => { pass++; console.log('  ✓', m); };
const W = 96, H = 72, HZ = 12;

let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.7;     // ≈ N(0,1)

/** A room: soft gradient + fixed texture, sensor noise, optional lighting offset and "people" (bright blocks). */
const texture = new Float32Array(W * H).map((_, i) => 90 + 40 * Math.sin((i % W) * 0.13) + 30 * Math.cos(Math.floor(i / W) * 0.21) + rnd() * 10);
function frame({ noise = 3, light = 0, people = [], specks = [] } = {}) {
  const g = new Uint8Array(W * H);
  for (let i = 0; i < g.length; i++) g[i] = Math.max(0, Math.min(255, texture[i] + light + gauss() * noise));
  for (const p of people) {
    for (let y = Math.max(0, Math.round(p.y - 13)); y < Math.min(H, Math.round(p.y + 13)); y++)
      for (let x = Math.max(0, Math.round(p.x - 5)); x < Math.min(W, Math.round(p.x + 5)); x++)
        g[y * W + x] = Math.max(0, Math.min(255, texture[y * W + x] + (p.gain ?? 75) + gauss() * noise));
  }
  for (const s of specks) for (let y = s.y; y < s.y + 3; y++) for (let x = s.x; x < s.x + 3; x++) g[y * W + x] = 255;
  return g;
}
const run = (det, n, make, t0 = 0) => { let r; for (let i = 0; i < n; i++) r = det.process(make(i), W, H, t0 + i / HZ); return r; };

console.log('noise and flicker');
{
  const det = createMotionDetector();
  let max = 0;
  for (let i = 0; i < 120; i++) { const r = det.process(frame({ noise: 4 }), W, H, i / HZ); max = Math.max(max, r.personCount); }
  assert.equal(max, 0); ok('sensor noise alone never creates a person or movement');

  const det2 = createMotionDetector(); let seen = 0;
  for (let i = 0; i < 120; i++) { const r = det2.process(frame({ noise: 3, specks: i % 5 === 0 ? [{ x: 40, y: 30 }] : [] }), W, H, i / HZ); seen = Math.max(seen, r.personCount); }
  assert.equal(seen, 0); ok('tiny flickering specks are ignored (below the minimum region size)');

  const det3 = createMotionDetector(); let seen3 = 0;
  for (let i = 0; i < 200; i++) { const r = det3.process(frame({ light: i * 0.25 }), W, H, i / HZ); seen3 = Math.max(seen3, r.personCount); }
  assert.equal(seen3, 0); ok('slow lighting drift (auto-exposure creep) is not movement');

  const det4 = createMotionDetector(); run(det4, 30, () => frame());
  const jump = det4.process(frame({ light: 55 }), W, H, 30 / HZ);
  assert.equal(jump.suppressed, true); assert.equal(jump.personCount, 0);
  const after = run(det4, 30, () => frame({ light: 55 }), 31 / HZ);
  assert.equal(after.personCount, 0); assert.equal(after.suppressed, false);
  ok('a sudden whole-frame lighting change is suppressed and relearned — no ghost people afterwards');
}

console.log('one person');
{
  const det = createMotionDetector(); run(det, 24, () => frame());
  let ids = new Set(), lastX = 0, sawMoving = false, firstCountAt = null;
  for (let i = 0; i < 80; i++) {
    const x = 18 + i * 0.9;                                // walks left → right
    const r = det.process(frame({ people: [{ x, y: 38 }] }), W, H, (24 + i) / HZ);
    if (r.personCount === 1 && firstCountAt === null) firstCountAt = i / HZ;
    for (const t of r.tracks) { ids.add(t.id); lastX = t.x; sawMoving ||= t.moving; }
  }
  assert.equal(ids.size, 1, 'one stable id, got ' + ids.size);
  assert.ok(sawMoving); assert.ok(Math.abs(lastX - (18 + 79 * 0.9) / W) < 0.12, 'x ' + lastX);
  assert.ok(firstCountAt <= 1.2, 'counted after ' + firstCountAt);
  ok(`a walking person: one stable id, position follows (x≈${lastX.toFixed(2)}), counted after ~${firstCountAt.toFixed(1)}s`);
}
{
  const det = createMotionDetector(); run(det, 24, () => frame());
  let r; const moving = [];
  for (let i = 0; i < 90; i++) { r = det.process(frame({ people: [{ x: 48, y: 38 }] }), W, H, (24 + i) / HZ); if (i > 10) moving.push(r.tracks[0]?.moving); }
  const still = moving.slice(-30).filter(Boolean).length;
  assert.equal(r.personCount, 1); assert.ok(still <= 2, 'still person flagged moving ' + still);
  ok('a person standing still stays counted (presence) but is not "moving"');
}
{
  // leaves → forgotten after the hold time, not instantly
  const det = createMotionDetector(); run(det, 24, () => frame());
  run(det, 40, () => frame({ people: [{ x: 30, y: 38 }] }), 2);
  const t0 = 42 / HZ + 2;
  const gone = []; for (let i = 0; i < 40; i++) gone.push(det.process(frame(), W, H, t0 + i / HZ).personCount);
  assert.ok(gone[0] === 1 || gone[1] === 1, 'lingers briefly'); assert.equal(gone.at(-1), 0);
  const lastWithPerson = gone.lastIndexOf(1) / HZ; assert.ok(lastWithPerson <= C.TRACK_HOLD_SECONDS + 0.5, 'held ' + lastWithPerson);
  ok(`when someone leaves they linger ~${lastWithPerson.toFixed(1)}s (no flicker), then disappear`);
}

console.log('several people');
{
  const det = createMotionDetector(); run(det, 24, () => frame());
  let r; const ids = new Set();
  for (let i = 0; i < 60; i++) {
    r = det.process(frame({ people: [{ x: 14 + i * 0.25, y: 34 }, { x: 80 - i * 0.25, y: 40 }] }), W, H, (24 + i) / HZ);
    r.tracks.forEach((t) => ids.add(t.id));
  }
  assert.equal(r.personCount, 2); assert.equal(ids.size, 2);
  const xs = r.tracks.map((t) => t.x).sort();
  assert.ok(xs[0] < 0.4 && xs[1] > 0.6);
  ok('two people far apart: two tracks, two stable ids, positions on the correct sides');

  const det3 = createMotionDetector(); run(det3, 24, () => frame());
  for (let i = 0; i < 50; i++) r = det3.process(frame({ people: [{ x: 14, y: 34 }, { x: 42, y: 38 }, { x: 80, y: 40 }] }), W, H, (24 + i) / HZ);
  assert.equal(r.personCount, 3); ok('three people → three tracks');

  const det2 = createMotionDetector(); run(det2, 24, () => frame());
  for (let i = 0; i < 50; i++) r = det2.process(frame({ people: [{ x: 44, y: 38 }, { x: 52, y: 38 }] }), W, H, (24 + i) / HZ);
  assert.equal(r.personCount, 1); ok('two bodies almost touching are treated as one region (no double counting)');
}

console.log('still people are eventually absorbed into the background');
{
  const det = createMotionDetector(); run(det, 24, () => frame());
  let r; for (let i = 0; i < 900; i++) r = det.process(frame({ people: [{ x: 48, y: 38 }] }), W, H, (24 + i) / HZ);
  assert.equal(r.personCount, 0);
  ok('after ~75 s motionless a person fades into the background (then reappears the moment they move)');
  const back = run(det, 20, (i) => frame({ people: [{ x: 48 + i * 1.2, y: 38 }] }), 24 + 900 / HZ);
  assert.ok(back.tracks.some((t) => t.moving), 'moving person found');
  assert.ok(back.personCount <= 2, 'at most one leftover "ghost" of where they stood');
  assert.ok(back.tracks.filter((t) => t.moving).length === 1, 'only the real person is "moving"');
  ok('…and is detected again as soon as they move (a presence-only "ghost" of where they stood may linger, but it can never emit movement ripples)');
}
console.log(`\n${pass} camera-detection checks passed`);
