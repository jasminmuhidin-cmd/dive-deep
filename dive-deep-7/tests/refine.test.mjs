import { FIXTURE_THOUGHTS } from './fixtures/fixtureThoughts.mjs';
// Refinement pass: Thought-button wave, rain-patter, camera → water (people, wakes, interference), the camera monitor and its modes,
// and the sharper camera detection. No window and no camera needed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as C from '../src/config/constants.js';
import { createInstallationState, resizeView } from '../src/state/installationState.js';
import { createFlow } from '../src/visuals/flow.js';
import { RippleSystem } from '../src/visuals/ripple.js';
import { startThoughtEntry, updateEntryWaves, drawEntryWaves, waveHeadX, waveSpineY } from '../src/visuals/entryWave.js';
import { createPresence, bendAt } from '../src/visuals/presence.js';
import { addRainMark, updateRainMarks, drawRain } from '../src/visuals/rain.js';
import { createCameraRipples } from '../src/interactions/cameraRipples.js';
import { installKeyboardControls } from '../src/interactions/keyboardControls.js';
import { createMotionDetector } from '../src/camera/motionDetection.js';
import { cycleMonitorMode, drawCameraMonitor, monitorLayout, MONITOR_MODES } from '../src/ui/cameraMonitor.js';

let pass = 0; const ok = (m) => { pass++; console.log('  ✓', m); };
function world(w = 1920, h = 1080) {
  const state = createInstallationState({ dataset: FIXTURE_THOUGHTS, activateAll: true }); resizeView(state, w, h, 1);
  const flow = createFlow(state); state.flow = flow; flow.resize(w, h, state.view.scale, 18);
  for (let i = 0; i < 30; i++) flow.update(0.1);
  flow.computeGrid();
  return { state, flow, ripples: new RippleSystem(state) };
}
/** a canvas context that records what is drawn and never throws */
function fakeCtx() {
  const calls = { text: 0, strokes: 0, fills: 0, arcs: 0, images: 0 };
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get(_, k) {
      if (k === 'calls') return calls;
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => grad;
      if (k === 'fillText' || k === 'strokeText') return () => { calls.text++; };
      if (k === 'stroke' || k === 'strokeRect') return () => { calls.strokes++; };
      if (k === 'fill' || k === 'fillRect') return () => { calls.fills++; };
      if (k === 'arc' || k === 'ellipse') return () => { calls.arcs++; };
      if (k === 'drawImage') return () => { calls.images++; };
      return () => {};
    },
    set() { return true; },
  });
  return ctx;
}

console.log('config: the requested dials exist');
{
  const names = ['THOUGHT_ENTRY_WAVE_SPEED', 'THOUGHT_ENTRY_WAVE_AMPLITUDE', 'THOUGHT_ENTRY_WAVE_LENGTH', 'THOUGHT_ENTRY_SPREAD', 'THOUGHT_ENTRY_CURRENT_INFLUENCE',
    'RAIN_RIPPLE_FREQUENCY', 'RAIN_RIPPLE_SIZE', 'RAIN_RIPPLE_OPACITY', 'CAMERA_WAKE_STRENGTH', 'CAMERA_WAKE_LENGTH', 'CAMERA_INTERACTION_RADIUS',
    'CAMERA_MONITOR_MODE', 'CAMERA_MONITOR_WIDTH', 'CURRENT_SPEED', 'CURRENT_STRENGTH', 'CURRENT_DIRECTION'];
  for (const n of names) assert.ok(n in C, n);
  ok(`all ${names.length} configuration values are in constants.js`);
  assert.equal(C.CAMERA_MONITOR_MODE, 'minimal'); ok('the camera monitor defaults to "minimal" for this user-testing build');
  assert.ok(C.FLOW_DIRECTION_X > 0.4 && Math.abs(C.FLOW_DIRECTION_Y) < 0.9); ok('CURRENT_DIRECTION drives the flow (0° = left → right)');
}

console.log('the Thought wave: the button is the physical origin');
{
  const { state, flow, ripples } = world();
  state.thoughtOrigin = { x: 92, y: 540 };
  const t = { id: 'T', px: 1500, py: 300 };
  const w = startThoughtEntry(t, state, ripples, 10);
  assert.equal(w.ox, 92); assert.equal(w.oy, 540);
  assert.ok(waveHeadX(w, 10) === 92 && waveHeadX(w, 10 + w.lead * 0.5) === 92); ok('nothing has left the button yet during the first disturbance');
  assert.ok(ripples.list.some((r) => r.type === 'reveal' && r.x === 92 && r.y === 540)); ok('a small disturbance opens directly at the button');
  let last = 0;
  for (let s = 0; s <= 8; s += 0.25) { const hx = waveHeadX(w, 10 + w.lead + s); assert.ok(hx >= last); last = hx; }
  assert.ok(waveHeadX(w, 10 + w.lead + 0.5) - 92 > 60 && waveHeadX(w, 10 + w.lead + 0.5) < 700); ok('the front travels left → right, steadily (no teleporting to the middle)');
  assert.ok(Math.abs(waveHeadX(w, 10 + w.travel) - 1500) < 2); ok('it reaches the thought’s place exactly when thoughtEntry starts counting (travel)');
  const endY = waveSpineY(w, 1500);
  assert.ok(waveSpineY(w, 92) === 540 && endY < 540 && endY > 300); ok('its path leaves the button and bends only part-way toward the height where the thought will emerge (the ripple field covers the rest)');
  let maxSlope = 0; for (let x = 92; x < 1500; x += 20) maxSlope = Math.max(maxSlope, Math.abs(waveSpineY(w, x + 20) - waveSpineY(w, x)) / 20);
  assert.ok(maxSlope < 0.6, 'slope ' + maxSlope); ok(`the centre-line stays shallow (max slope ${maxSlope.toFixed(2)}): it is a horizontal wave, not a diagonal`);
  const steep = startThoughtEntry({ id: 'S', px: 700, py: 60 }, state, ripples, 20); let s2 = 0;
  for (let x = 92; x < 700; x += 10) s2 = Math.max(s2, Math.abs(waveSpineY(steep, x + 10) - waveSpineY(steep, x)) / 10);
  assert.ok(s2 < 0.6, 'steep slope ' + s2); ok('even when the thought lands high above the button the wave itself stays shallow');
  assert.ok(w.travel > w.lead + C.ENTRY_MIN_TRAVEL - 1e-9); ok('the thought is never revealed at once — travel ≥ lead + minimum travel');
  const bands = w.lam.length; assert.ok(bands >= 3 && new Set(w.lam.map((x) => x.toFixed(4))).size === bands && new Set(w.ph.map((x) => x.toFixed(4))).size === bands); ok('several bands, each with its own wavelength and phase: never one perfect curve');

  // it keeps pulling the nearby current along as it travels, then relaxes (does not alter the whole screen permanently)
  const n0 = flow.impulseCount;
  for (let now = 10; now < 14; now += 0.1) updateEntryWaves(state, now, ripples);
  assert.ok(flow.impulseCount > n0 + 2); ok('as it travels it pulls the current along its path');
  flow.update(1); for (let i = 0; i < 400; i++) flow.update(0.1);
  assert.equal(flow.impulseCount, 0); ok('…and every pull relaxes away: each thought only briefly changes the collective current');
}

console.log('people bend the wave, never block it');
{
  const { state, ripples } = world();
  state.thoughtOrigin = { x: 92, y: 540 };
  const w = startThoughtEntry({ id: 'T', px: 1500, py: 540 }, state, ripples, 0);
  state.people = [{ id: 'p', x: 800, y: 540, vx: 0, vy: 0, R: 210, amt: 1, moving: false, run: 0, energy: 0.3 }];
  const above = bendAt(state, 800, 480, { dy: 0, gap: 1, near: 0 }).dy, below = bendAt(state, 800, 600, { dy: 0, gap: 1, near: 0 }).dy;
  assert.ok(above < -10 && below > 10); ok('bands passing above a person bend up, bands below bend down: the wave parts around the body');
  const centre = bendAt(state, 800, 540, {}); assert.ok(centre.gap < 0.6 && centre.gap > 0.2); ok('right through the body the band thins, but is not removed');
  const far = bendAt(state, 1500, 540, {}); assert.ok(Math.abs(far.dy) < 1 && far.gap > 0.99); ok('far from anyone the wave is untouched');
  state.people = [];
  assert.equal(bendAt(state, 800, 540, {}).gap, 1); ok('with no camera / no one there nothing changes');

  state.people = [{ id: 'p', x: 800, y: 540, vx: 0, vy: 0, R: 210, amt: 1, moving: false, run: 0, energy: 0.3 }];
  const before = ripples.list.filter((r) => r.type === 'wake').length;
  for (let now = 0; now < 8; now += 0.1) updateEntryWaves(state, now, ripples);
  const wakes = ripples.list.filter((r) => r.type === 'wake').length - before;
  assert.equal(wakes, 2); ok('when the wave reaches a person, two small secondary wakes appear beside them (once per person)');
  assert.ok(w.touched.has('p'));

  // drawing with people present must work and draw shapes but never text
  const ctx = fakeCtx(); state.entryWaves[0].t0 = 0;
  drawEntryWaves(ctx, state, 4.5); assert.ok(ctx.calls.strokes > 20 && ctx.calls.text === 0); ok('drawing the wave with people in the water works and writes no text');
}

console.log('rain-patter');
{
  const { state } = world();
  for (let i = 0; i < 30; i++) addRainMark(state, 100 + i, 100, 0);
  assert.ok(state.rain.length <= 8); ok('at most a handful of marks exist at once (sparse)');
  updateRainMarks(state, 30); assert.equal(state.rain.length, 0); ok('marks are short-lived and removed');
  addRainMark(state, 400, 400, 0, 1, () => 0.5);
  const ctx = fakeCtx(); drawRain(ctx, state, 0.4); assert.ok(ctx.calls.arcs > 0 && ctx.calls.text === 0); ok('a mark is drawn as a dot / small incomplete ring, never text');
  assert.ok(C.RAIN_RIPPLE_FREQUENCY <= 0.5 && C.MAX_RAIN_RIPPLES <= 6); ok('the default frequency is low (about one drop every few seconds)');
}

console.log('camera → water: spatial, calm');
{
  const { state, ripples, flow } = world();
  state.camera.status = 'ready';
  const cr = createCameraRipples({ state, ripples, rng: () => 0.5 });
  const presence = createPresence({ state, cameraRipples: cr, flow });
  state.movementPoints = [{ id: 1, x: 0.2, y: 0.5, strength: 0.6, moving: true, present: true, area: 0.08 }, { id: 2, x: 0.8, y: 0.4, strength: 0.4, moving: true, present: true, area: 0.08 }];
  const px = cr.peoplePx(0);
  assert.ok(Math.abs(px[0].x - 0.2 * 1920) < 1 && Math.abs(px[1].x - 0.8 * 1920) < 1 && Math.abs(px[1].y - 0.4 * 1080) < 1); ok('camera positions map onto the same place on the canvas (left in the frame → left in the water)');

  // one person walking left → right for 6 s: continuous movement leaves a trail; the field follows them
  let now = 0;
  for (let i = 0; i < 360; i++) {
    now += 1 / 60; state.time.now = now;
    state.movementPoints = [{ id: 1, x: 0.2 + 0.1 * now, y: 0.5, strength: 0.6, moving: true, present: true, area: 0.08 }];
    presence.update(1 / 60, now); ripples.update(1 / 60);
  }
  const me = state.people[0];
  assert.ok(me && me.amt > 0.9 && me.run > 3); ok('someone who keeps moving becomes a “continuous” mover');
  assert.ok(me.vx > 40 && Math.abs(me.vy) < 40 && me.x > 0.5 * 1920 * 0.6); ok('their velocity points the way they walk (rightwards) and the field tracks their position');
  assert.ok(presence.currents.length >= 1); ok('continuous movement gives birth to a camera current');
  const ctx = fakeCtx(); presence.draw(ctx, now); assert.ok(ctx.calls.strokes > 5 && ctx.calls.text === 0); ok('the current is drawn as thin strokes (no text)');
  const cur = presence.currents[0];
  assert.ok(cur.len > 1920 * 0.6 && cur.pts[cur.pts.length - 1].x > 1920 * 0.9); ok('a current spans most of the screen (it joins the global left-to-right flow), not a local patch');

  // still water: no movement, no currents
  const runN = (n, secs = 20) => {
    const q = world(); q.state.camera.status = 'ready';
    const c2 = createCameraRipples({ state: q.state, ripples: q.ripples, rng: () => 0.5 });
    const pr = createPresence({ state: q.state, cameraRipples: c2, flow: q.flow });
    let t = 0, peak = 0;
    for (let i = 0; i < secs * 60; i++) {
      t += 1 / 60;
      q.state.movementPoints = Array.from({ length: n }, (_, k) => ({ id: k + 1, x: 0.15 + 0.1 * k + 0.05 * Math.sin(t + k), y: 0.3 + 0.1 * k, strength: 0.6, moving: true, present: true, area: 0.08 }));
      pr.update(1 / 60, t); peak = Math.max(peak, pr.currents.length);
    }
    return peak;
  };
  {
    const q = world(); q.state.camera.status = 'ready';
    const c2 = createCameraRipples({ state: q.state, ripples: q.ripples, rng: () => 0.5 });
    const pr = createPresence({ state: q.state, cameraRipples: c2, flow: q.flow });
    let t = 0;
    for (let i = 0; i < 600; i++) { t += 1 / 60; q.state.movementPoints = [{ id: 1, x: 0.5, y: 0.5, strength: 0.1, moving: false, present: true, area: 0.08 }]; pr.update(1 / 60, t); }
    assert.equal(pr.currents.length, 0); ok('no movement: still water, no currents');
  }
  const p1 = runN(1), p4 = runN(4);
  assert.ok(p1 >= 1 && p4 > p1 && p4 <= C.CAMERA_CURRENT_MAX); ok(`more movement → more currents, capped (1 mover ${p1}, 4 movers ${p4}, cap ${C.CAMERA_CURRENT_MAX})`);

  const m = world(); m.state.camera.status = 'ready';
  const cr3 = createCameraRipples({ state: m.state, ripples: m.ripples, rng: () => 0.5 });
  const pr3 = createPresence({ state: m.state, cameraRipples: cr3, flow: m.flow });
  pr3.update(1 / 60, 1);
  assert.equal(pr3.memory.size, 0); ok('(no people → nothing kept)');
}

console.log('camera monitor');
{
  const state = createInstallationState({ dataset: FIXTURE_THOUGHTS, activateAll: true }); resizeView(state, 1920, 1080, 1);
  assert.equal(state.camera.monitorMode, 'minimal'); ok('starts in minimal mode');
  assert.deepEqual([cycleMonitorMode(state), cycleMonitorMode(state), cycleMonitorMode(state)], ['debug', 'hidden', 'minimal']); ok('cycles minimal → debug → hidden → minimal (hidden → minimal → debug → hidden)');
  assert.deepEqual(MONITOR_MODES, ['hidden', 'minimal', 'debug']);

  state.camera.monitorMode = 'hidden'; let ctx = fakeCtx(); drawCameraMonitor(ctx, state, null, 60, 1);
  assert.equal(ctx.calls.fills + ctx.calls.strokes + ctx.calls.text, 0); ok('hidden: nothing is drawn');
  state.camera.monitorMode = 'minimal'; ctx = fakeCtx(); drawCameraMonitor(ctx, state, null, 60, 1);
  assert.ok(ctx.calls.text >= 2 && ctx.calls.fills > 1); ok('minimal: panel, label, status light and person count');
  const L = monitorLayout(state);
  assert.ok(L.x + L.width <= 1920 && L.x > 1920 * 0.7 && L.y >= 0 && L.y < 60 && L.width <= 320 && L.height <= 340); ok('it is small and sits in the top-right corner');
  state.movementPoints = [{ id: 3, x: 0.3, y: 0.5, strength: 0.7, moving: true, present: true, vx: 0.1, vy: 0, box: { x0: 0.2, y0: 0.2, x1: 0.4, y1: 0.8 } }]; state.personCount = 1;
  const m1 = fakeCtx(); drawCameraMonitor(m1, state, null, 60, 1);
  state.camera.monitorMode = 'debug'; const m2 = fakeCtx(); drawCameraMonitor(m2, state, null, 60, 1);
  assert.ok(m2.calls.text > m1.calls.text + 3); ok('debug: more detail (per-person id / position / movement, FPS, thresholds)');
  assert.ok(monitorLayout(state).width > L.width); ok('debug is a little larger than minimal — still small');

  const src = fs.readFileSync('src/ui/cameraMonitor.js', 'utf8');
  assert.ok(/CAMERA \/ DETECTION/.test(src) && !/name|identity|recogni[sz]e\(/i.test(src.replace(/no identity|never identifies/gi, ''))); ok('labelled CAMERA / DETECTION; no names or identity of any kind');
  const cam = fs.readFileSync('src/camera/camera.js', 'utf8');
  assert.ok(/monitorMode !== 'hidden'/.test(cam)); ok('while hidden, the camera does not even build a preview');

  const handlers = []; globalThis.window = { addEventListener: (t, fn) => handlers.push(fn) };
  const s2 = createInstallationState({ dataset: FIXTURE_THOUGHTS, activateAll: true }); installKeyboardControls({ state: s2, pointers: { clearVirtual() {} }, onArtefact() {}, onThought() {} });
  const seq = []; for (let i = 0; i < 3; i++) { handlers.forEach((h) => h({ key: 'c', repeat: false })); seq.push(s2.camera.monitorMode); }
  assert.deepEqual(seq, ['debug', 'hidden', 'minimal']); ok('the C key cycles the monitor');
  assert.equal(s2.forceCollective, false); ok('(and no longer toggles collective mode — that moved to G)');
}

console.log('sharper camera detection');
{
  const W = 160, H = 120, HZ = 15;
  let seed = 99; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const tex = new Float32Array(W * H).map((_, i) => 90 + 40 * Math.sin((i % W) * 0.09) + 30 * Math.cos(Math.floor(i / W) * 0.13) + rnd() * 8);
  const frame = ({ light = 0, people = [], noise = 3 } = {}) => {
    const g = new Uint8Array(W * H);
    for (let i = 0; i < g.length; i++) g[i] = Math.max(0, Math.min(255, tex[i] + light + (rnd() + rnd() + rnd() + rnd() - 2) * noise * 1.7));
    for (const p of people) for (let y = Math.round(p.y - 20); y < Math.round(p.y + 20); y++) for (let x = Math.round(p.x - 8); x < Math.round(p.x + 8); x++)
      if (x >= 0 && x < W && y >= 0 && y < H) g[y * W + x] = Math.max(0, Math.min(255, tex[y * W + x] + light + p.gain + (rnd() - 0.5) * noise));
    return g;
  };
  const drive = (det, n, mk, t0 = 0) => { let r; for (let i = 0; i < n; i++) r = det.process(mk(i), W, H, t0 + i / HZ); return r; };

  // a person walking in auto-exposure creep (slow brightness drift while they move) is still found
  {
    const det = createMotionDetector(); drive(det, 30, () => frame());
    let seen = 0, r;
    for (let i = 0; i < 80; i++) { r = det.process(frame({ light: i * 0.3, people: [{ x: 30 + i * 1.1, y: 60, gain: -55 }] }), W, H, (30 + i) / HZ); if (r.personCount) seen++; }
    assert.ok(seen > 60, 'seen in ' + seen); ok(`a walking person is still detected through slow exposure drift (${seen}/80 frames)`);
    assert.ok(r.tracks[0].box && r.tracks[0].box.x1 > r.tracks[0].box.x0 && r.tracks[0].vx > 0); ok('each person carries a bounding box and a rightward velocity');
    const t = r.tracks[0]; assert.ok(t.x >= t.box.x0 && t.x <= t.box.x1 && t.y >= t.box.y0 && t.y <= t.box.y1); ok('the centre point lies inside the box');
  }
  // a fainter person (low contrast) needs the sensitivity dial
  {
    const run = (sens) => { const det = createMotionDetector({ sensitivity: sens }); drive(det, 30, () => frame()); let n = 0;
      for (let i = 0; i < 90; i++) { const r = det.process(frame({ people: [{ x: 20 + i * 1.2, y: 60, gain: -16 }] }), W, H, (30 + i) / HZ); if (r.personCount) n++; } return n; };
    const lo = run(1), hi = run(1.6);
    assert.ok(hi > lo && hi > 60, `sens 1: ${lo}, 1.6: ${hi}`); ok(`CAMERA_SENSITIVITY helps in dim rooms: a low-contrast person is seen in ${hi}/90 frames at 1.6 (vs ${lo} at 1.0)`);
    assert.ok(C.CAMERA_SENSITIVITY >= 1.2); ok('the default sensitivity is already raised (1.3) so people in similar-coloured clothes are noticed');
    const det = createMotionDetector({ sensitivity: 1.6 }); let bad = 0;
    for (let i = 0; i < 200; i++) bad += det.process(frame({ noise: 4 }), W, H, i / HZ).personCount;
    assert.equal(bad, 0); ok('even at higher sensitivity, sensor noise alone never creates a person');
  }
  // solid silhouette: one steady region for one body, not fragments
  {
    const det = createMotionDetector(); drive(det, 30, () => frame()); const ids = new Set(); let maxCount = 0;
    for (let i = 0; i < 90; i++) { const r = det.process(frame({ people: [{ x: 30 + i * 1.2, y: 60, gain: -60 }] }), W, H, (30 + i) / HZ); r.tracks.forEach((t) => ids.add(t.id)); maxCount = Math.max(maxCount, r.personCount); }
    assert.equal(ids.size, 1); assert.equal(maxCount, 1); ok('one moving body stays one person (one stable id, no fragments)');
  }
}

console.log(`\n${pass} refinement checks passed`);

console.log('collapsible camera panel');
{
  const { updatePanelSlide, togglePanel, drawCameraMonitor: dm } = await import('../src/ui/cameraMonitor.js');
  const state = createInstallationState({ dataset: FIXTURE_THOUGHTS, activateAll: true }); resizeView(state, 1920, 1080, 1);
  state.camera.monitorMode = 'minimal';
  assert.equal(state.camera.panelOpen, C.CAMERA_PANEL_OPEN_AT_START);
  const c0 = fakeCtx(); dm(c0, state, null, 60, 1); assert.ok(c0.calls.fills > 1); ok('open: the panel is drawn (minimal mode)');
  togglePanel(state); for (let i = 0; i < 90; i++) updatePanelSlide(state, 1 / 60);
  assert.equal(state.camera.panelSlide, 0);
  const c1 = fakeCtx(); dm(c1, state, null, 60, 1); assert.equal(c1.calls.fills, 0); ok('tab click: the panel slides away completely (only the DOM tab remains)');
  togglePanel(state); for (let i = 0; i < 90; i++) updatePanelSlide(state, 1 / 60);
  assert.equal(state.camera.panelSlide, 1); ok('click again: it slides back');
}
