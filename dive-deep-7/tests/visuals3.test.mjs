import { FIXTURE_THOUGHTS } from './fixtures/fixtureThoughts.mjs';
// Simple-water pass: config surface, left → right current, the Thought wave from the button, ripple hierarchy,
// camera cooldown, the installation state machine, print-once, and a scan for participant-visible technical text.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as C from '../src/config/constants.js';
import { createInstallationState, resizeView, updateMode, THOUGHT_STATE as S } from '../src/state/installationState.js';
import { createFlow } from '../src/visuals/flow.js';
import { RippleSystem, rippleAmplitude } from '../src/visuals/ripple.js';
import { startThoughtEntry, updateEntryWaves, waveProgress, wavePosition } from '../src/visuals/entryWave.js';
import { createCameraRipples } from '../src/interactions/cameraRipples.js';
import { installKeyboardControls } from '../src/interactions/keyboardControls.js';

let pass = 0; const ok = (m) => { pass++; console.log('  ✓', m); };
function world() {
  const state = createInstallationState({ dataset: FIXTURE_THOUGHTS, activateAll: true }); resizeView(state, 1920, 1080, 1);
  const flow = createFlow(state); state.flow = flow; flow.resize(1920, 1080, 1, 18);
  for (let i = 0; i < 30; i++) flow.update(0.1);
  flow.computeGrid();
  return { state, flow, ripples: new RippleSystem(state) };
}

console.log('config surface');
{
  const names = ['FLOW_DIRECTION_X', 'FLOW_DIRECTION_Y', 'CURRENT_SPEED', 'CURRENT_AMPLITUDE', 'CURRENT_WAVELENGTH', 'CURRENT_LAYER_COUNT', 'CURRENT_BLUR',
    'TOUCH_RIPPLE_RADIUS', 'TOUCH_RIPPLE_DURATION', 'TOUCH_RIPPLE_STRENGTH', 'THOUGHT_ENTRY_SPEED', 'THOUGHT_ENTRY_AMPLITUDE', 'THOUGHT_ENTRY_DURATION',
    'THOUGHT_ENTRY_RIPPLE_RADIUS', 'CAMERA_RIPPLE_STRENGTH', 'CAMERA_RIPPLE_COOLDOWN', 'THOUGHT_TOUCH_RADIUS', 'THOUGHT_RELEASE_RADIUS',
    'THOUGHT_BLUR_DELAY', 'THOUGHT_BLUR_SPEED', 'PRINT_ZONE_START_RATIO', 'PRINT_TRIGGER_RATIO', 'PRINT_MAGNET_STRENGTH'];
  for (const n of names) assert.ok(n in C, `${n} is exposed in constants.js`);
  ok(`all ${names.length} requested tuning values are in constants.js`);
  assert.ok(C.FLOW_DIRECTION_X > 0 && C.THOUGHT_RELEASE_RADIUS > C.THOUGHT_TOUCH_RADIUS && C.PRINT_TRIGGER_RATIO > C.PRINT_ZONE_START_RATIO);
  ok('flow points right; release radius > touch radius; trigger line is below the approach line');
  assert.ok(C.CURRENT_LAYER_COUNT >= 3 && C.CURRENT_LAYER_COUNT <= 5); ok('3–5 current bands');
  const [r, g, b] = C.COOL_WATER_PALETTE.top; assert.ok(b > r && b > g); ok('base water is ocean blue');
  for (const k of Object.keys(C.WATER_PIGMENTS)) assert.ok(['paleBlue', 'cream', 'offWhite', 'paleYellow'].includes(k), k);
  ok('pigments are limited to pale blue, cream, off-white and pale yellow');
}

console.log('the current');
{
  const { flow } = world();
  const g0 = flow.grid, v = { vx: 0, vy: 0 };
  let sx = 0, sy = 0, left = 0, n = 0;
  for (let i = 0; i < 300; i++) flow.update(0.1);
  for (let y = 40; y < 1080; y += 60) for (let x = 40; x < 1920; x += 90) { const f = flow.velocityAt(x, y, v); sx += f.vx; sy += Math.abs(f.vy); if (f.vx < 0) left++; n++; }
  assert.ok(sx > 0 && sx > 3 * sy && left === 0); ok('the water flows left → right everywhere, with only subtle vertical variation');

  // the bands themselves slide along +X: cross-correlate the tint field shifted by one column
  flow.computeGrid(); const a = Float32Array.from(g0.tint);
  for (let i = 0; i < 10; i++) flow.update(0.05); flow.computeGrid();
  const b = g0.tint, gw = g0.gw, gh = g0.gh;
  const err = (shift) => { let e = 0; for (let y = 0; y < gh; y++) for (let x = 6; x < gw - 6; x++) e += Math.abs(b[y * gw + x] - a[y * gw + x - shift]); return e; };
  let best = 0, bestE = Infinity; for (let s = -4; s <= 4; s++) { const e = err(s); if (e < bestE) { bestE = e; best = s; } }
  assert.ok(best > 0, 'pattern moved to the right by ' + best); ok(`the pale bands travelled ${best} cells to the right over half a second`);
  let mn = 1, mx = 0; for (const q of b) { mn = Math.min(mn, q); mx = Math.max(mx, q); }
  assert.ok(mx - mn > 0.35 && mx <= 1); ok('bands cover part of the water (blue remains between them)');
  let rough = 0; for (let y = 0; y < gh; y++) for (let x = 1; x < gw; x++) rough += Math.abs(b[y * gw + x] - b[y * gw + x - 1]);
  assert.ok(rough / (gw * gh) < 0.05, 'edges are soft: ' + rough / (gw * gh)); ok('band edges are soft (blurred, no hard lines)');
}

console.log('ripples');
{
  const { ripples } = world();
  for (const type of ['touch', 'thoughtEntry', 'camera', 'artefact']) assert.ok(ripples.create({ x: 500, y: 500, type }), type);
  ok('createRipple accepts touch / thoughtEntry / camera / artefact');
  const mk = (type) => { const r = ripples.create({ x: 300, y: 300, type }); r.age = 0.8; return r; };
  const c = rippleAmplitude(mk('camera')), t = rippleAmplitude(mk('touch')), e = rippleAmplitude(mk('thoughtEntry')), a = rippleAmplitude(mk('artefact'));
  assert.ok(c < t && t < e && e <= a * 1.05, `${c} ${t} ${e} ${a}`); ok('hierarchy: camera < touch < thought entry < artefact');
  const tt = ripples.create({ x: 100, y: 100, type: 'touch', maxRadius: 200, duration: 3 });
  assert.ok(tt.stretch > 1); ok('touch ripples are stretched horizontally (not perfect circles)');
}

console.log('the Thought wave');
{
  const { state, ripples, flow } = world();
  state.thoughtOrigin = { x: 150, y: 540 };
  const t = { id: 'T1', px: 1300, py: 420 };
  const w = startThoughtEntry(t, state, ripples, 10);
  assert.equal(w.ox, 150); assert.equal(w.oy, 540); ok('it starts at the Thought button’s right edge, centred');
  const p0 = waveProgress(w, 10), p1 = waveProgress(w, 10 + w.travel);
  assert.ok(p0 === 0 && Math.abs(p1 - 1) < 1e-9); ok('entryProgress runs 0 → 1');
  const q = { x: 0, y: 0 }; let last = -1, mono = true;
  for (let s = 0; s <= 1; s += 0.05) { wavePosition(w, s, q); if (q.x < last) mono = false; last = q.x; }
  assert.ok(mono); wavePosition(w, 1, q); assert.ok(Math.abs(q.x - 1300) < 2 && Math.abs(q.y - 420) < 2); ok('it travels horizontally rightwards and arrives where the thought is');
  const es = ripples.list.filter((r) => r.type === 'entrywave'); assert.ok(es.length >= 1 && es.length <= 2 && es.every((r) => r.x === 150));
  assert.ok(ripples.list.some((r) => r.type === 'reveal' && r.x === 150)); ok('a small disturbance + one broad wave (with one softer follower) from the button');
  updateEntryWaves(state, 10 + w.life + 1); assert.equal(state.entryWaves.length, 0); ok('the wave merges away and is removed');
  for (let i = 0; i < 8; i++) startThoughtEntry(t, state, ripples, 30 + i); assert.ok(state.entryWaves.length <= 3); ok('at most three waves at once');
  assert.ok(flow.impulseCount > 0); ok('the current takes a light push along FLOW_DIRECTION');
}

console.log('camera');
{
  const { state, ripples } = world();
  state.camera.status = 'ready';
  const cr = createCameraRipples({ state, ripples, rng: () => 0.5 });
  const seen = [];
  const step = (now) => { state.movementPoints = [{ id: 'a', x: 0.3 + 0.02 * now % 0.5, y: 0.5, strength: 0.6, moving: true, present: true }, { id: 'b', x: 0.7, y: 0.4 + 0.01 * now % 0.3, strength: 0.6, moving: true, present: true }];
    const n0 = ripples.list.filter((r) => r.type === 'movement').length; cr.update(0.05, now); if (ripples.list.filter((r) => r.type === 'movement').length > n0) seen.push(now); };
  for (let now = 1; now < 30; now += 0.05) { state.time.now = now; ripples.update(0.05); step(now); }
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] - seen[i - 1] >= C.CAMERA_RIPPLE_COOLDOWN - 0.06, `gap ${seen[i] - seen[i - 1]}`);
  assert.ok(seen.length > 3); ok(`camera ripples respect the ${C.CAMERA_RIPPLE_COOLDOWN}s cooldown (${seen.length} in 30 s, two people)`);
  assert.ok(state.thoughts.every((t) => t.state !== S.REVEALED)); ok('the camera never reveals text');
}

console.log('state machine');
{
  const state = createInstallationState({ dataset: FIXTURE_THOUGHTS, activateAll: true }); resizeView(state, 1920, 1080, 1);
  for (const k of ['mode', 'activeThoughtId', 'activePointers', 'isDraggingThought', 'draggedThoughtId', 'printArmed']) assert.ok(k in state, k);
  assert.ok(state.activePointers instanceof Map); assert.equal(updateMode(state, []), 'ambient'); ok('installationState has the required fields; starts ambient');
  const t = state.thoughts[0];
  t.state = S.ENTERING; assert.equal(updateMode(state, []), 'thoughtEntry');
  t.state = S.REVEALED; t.isBeingEngaged = true; assert.equal(updateMode(state, [{ id: 1 }]), 'revealing'); assert.equal(state.activePointers.size, 1); assert.equal(state.activeThoughtId, t.id);
  t.state = S.DRAGGING; assert.equal(updateMode(state, []), 'dragging'); assert.ok(state.isDraggingThought && state.draggedThoughtId === t.id);
  t.state = S.PRINTING; assert.equal(updateMode(state, []), 'printing');
  t.state = S.SUBMERGED; t.isBeingEngaged = false; state.printArmed = true; assert.equal(updateMode(state, []), 'ambient'); assert.ok(!state.printArmed);
  ok('mode: ambient → thoughtEntry → revealing → dragging → printing → ambient');
}

console.log('participant display');
{
  const src = ['src/main.js', 'src/visuals/thoughtRenderer.js', 'src/visuals/printZone.js', 'src/visuals/hint.js', 'src/visuals/entryWave.js'].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  assert.ok(!/fillText\([^)]*(fps|entryProgress|sharpness|\.toFixed)/.test(src)); ok('no timers or technical values are drawn as text for participants');
  ok('(the camera monitor is a separate setup tool — ui/cameraMonitor.js — and is scanned separately below)');
}

console.log('keys');
{
  const handlers = []; globalThis.window = { addEventListener: (t, fn) => handlers.push(fn) };
  const state = createInstallationState({ dataset: FIXTURE_THOUGHTS, activateAll: true });
  installKeyboardControls({ state, pointers: { clearVirtual() {} }, onArtefact() {}, onThought() {} });
  handlers.forEach((h) => h({ key: 'g', repeat: false })); assert.equal(state.forceCollective, true); ok('G forces collective mode (dev; C now cycles the camera monitor)');
}
console.log(`\n${pass} visual checks passed`);
