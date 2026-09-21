import { FIXTURE_THOUGHTS } from './fixtures/fixtureThoughts.mjs';
// Drag-to-print, helper text and the mock printer. (Connections are tested in logic.test.mjs.)
import assert from 'node:assert/strict';
import * as C from '../src/config/constants.js';
import { createInstallationState, resizeView, updateMode, THOUGHT_STATE as S } from '../src/state/installationState.js';
import { updateThoughtReveal } from '../src/interactions/thoughtReveal.js';
import { updateCollectiveTouch } from '../src/interactions/collectiveTouch.js';
import { createDragToPrint } from '../src/interactions/dragToPrint.js';
import { createConnections } from '../src/visuals/connections.js';
import { updatePalette } from '../src/visuals/palette.js';
import { RippleSystem } from '../src/visuals/ripple.js';
import { printThought, formatReceipt, setPrinterStatusHandler } from '../src/printer/printer.js';

let pass = 0; const ok = (m) => { pass++; console.log('  ✓', m); };

function fakePointers() {
  const L = { down: [], move: [], up: [] }; const map = new Map();
  return {
    on: (t, f) => L[t].push(f), list: () => [...map.values()],
    down(id, x, y) { const p = { id, x, y, type: 'touch', virtual: false, nextRippleAt: 0 }; map.set(id, p); L.down.forEach((f) => f(p)); return p; },
    move(p, x, y) { p.x = x; p.y = y; L.move.forEach((f) => f(p)); },
    up(p) { map.delete(p.id); L.up.forEach((f) => f(p)); },
  };
}

function setup() {
  const state = createInstallationState({ dataset: FIXTURE_THOUGHTS, activateAll: true });
  resizeView(state, 1920, 1080, 1);
  for (const t of state.thoughts) { t.px = t.homeX = t.x * 1920; t.py = t.homeY = t.y * 1080; t.ringRadius = 165; }
  const ripples = new RippleSystem(state);
  const pointers = fakePointers();
  const printed = [];
  let now = 100; const dt = 1 / 60;
  const connections = createConnections(state, ripples);
  const drag = createDragToPrint({ state, pointers, ripples, printThought: async (t) => { printed.push(t.id); return { ok: true }; }, clock: () => now });
  const step = (secs) => {
    for (let i = 0; i < Math.round(secs / dt); i++) {
      now += dt;
      const list = pointers.list();
      updateCollectiveTouch(state, list, ripples, dt, now);
      updatePalette(state);
      drag.update(dt, now);
      updateThoughtReveal(state, list, ripples, dt, now);
      updateMode(state, list);
      connections.update(dt);
      ripples.update(dt);
    }
  };
  const T = (id) => state.thoughts.find((t) => t.id === id);
  /** hold a finger on a thought until it's readable; returns the pointer (still down) */
  const raise = (id, pid = 1) => { const t = T(id); const p = pointers.down(pid, t.px, t.py); step(0.9); return p; };
  /** move a pointer gradually */
  const glide = (p, x, y, secs = 0.8) => {
    const n = Math.round(secs / dt), x0 = p.x, y0 = p.y;
    for (let i = 1; i <= n; i++) { pointers.move(p, x0 + (x - x0) * i / n, y0 + (y - y0) * i / n); step(dt); }
  };
  return { state, ripples, pointers, drag, printed, step, T, raise, glide, get now() { return now; } };
}

// ---------------- drag to print ----------------
console.log('drag to print');
{
  const { state, step, T, raise, glide, pointers, printed, drag } = setup();
  const t = T('thought-15');
  const p = raise('thought-15');
  assert.equal(t.state, S.REVEALED); assert.ok(t.helperAlpha < 0.5, 'helper starts hidden/quiet: ' + t.helperAlpha);
  step(1.6);
  assert.ok(t.helperAlpha > 0.9, 'helper ' + t.helperAlpha);
  ok(`"take this thought with you" shown once readable (alpha ${t.helperAlpha.toFixed(2)})`);
  assert.ok(drag.isTakeable(t));

  const other = T('thought-01');
  assert.equal(other.state, S.SUBMERGED);
  glide(p, t.homeX, 1010, 1.0);                // carry it down into the zone
  assert.ok(t.isDragging && state.drag.active && state.drag.inZone && t.state === S.DRAGGING && state.printArmed);
  step(0.8); assert.ok(state.printZone.visible > 0.6); assert.ok(t.helperAlpha < 0.2);
  assert.ok(state.thoughts.filter((x) => x.state !== S.SUBMERGED).length === 1, 'carrying must not wake other thoughts');
  ok('print zone rises while carrying; helper hides; other thoughts stay under');

  pointers.up(p); step(0.1);
  assert.deepEqual(printed, ['thought-15']); assert.ok(t.printed && t.printCount === 1);
  assert.equal(t.state, S.PRINTING); assert.ok(state.printZone.flash > 0.8);
  ok('dropped in zone → printThought called exactly once; thought sinks; quiet flash');

  step(6);
  assert.equal(t.state, S.SUBMERGED); assert.ok(Math.hypot(t.px - t.homeX, t.py - t.homeY) < 10);
  ok('thought sinks and drifts softly back to its place');
  assert.equal(state.printZone.visible < 0.05 && state.printZone.flash < 0.05, true);
  assert.equal(t.printed, false); ok('printed flag clears once it has sunk');

  // duplicate protection: a just-printed thought stays down for its cooldown even under a held finger
  const p2 = pointers.down(2, t.px, t.py); step(1);
  assert.equal(t.state, S.SUBMERGED); assert.equal(printed.length, 1);
  ok('no duplicate: cooldown keeps a just-printed thought down');
  step(6);                                          // cooldown is over
  assert.notEqual(t.state, S.SUBMERGED); pointers.up(p2);
  ok('…and it can be raised (and taken) again afterwards');
}
{
  // drop outside the zone: no print, returns home
  const { state, step, T, raise, glide, pointers, printed } = setup();
  const t = T('thought-06'); const p = raise('thought-06');
  glide(p, t.homeX + 200, t.homeY + 150, 0.6); pointers.up(p); step(3);
  assert.equal(printed.length, 0); assert.ok(!t.printed);
  assert.ok(Math.hypot(t.px - t.homeX, t.py - t.homeY) < 25);
  ok('drop outside the zone prints nothing; thought drifts home');
}
{
  // approach line arms but does not print; only release at/below the trigger line does — and only once per drag
  const { state, step, T, raise, glide, pointers, printed } = setup();
  const h = state.view.h;
  const t = T('thought-15'); const p = raise('thought-15');
  glide(p, t.homeX, h * C.PRINT_ZONE_START_RATIO + 8, 1.0);
  assert.ok(state.printArmed && t.state === S.DRAGGING && state.mode === 'dragging'); assert.equal(printed.length, 0);
  glide(p, t.homeX, h * 0.5, 0.6); assert.ok(!state.printArmed);                 // pulled back up: disarmed
  glide(p, t.homeX, h * (C.PRINT_ZONE_START_RATIO + C.PRINT_TRIGGER_RATIO) / 2, 1.0);
  assert.ok(state.printArmed); pointers.up(p); step(0.1);
  assert.equal(printed.length, 0); assert.ok(!t.printed); ok('released between the two lines: armed but no print');
}
{
  const { state, step, T, raise, glide, pointers, printed } = setup();
  const h = state.view.h;
  const t = T('thought-15'); const p = raise('thought-15');
  glide(p, t.homeX, h * (C.PRINT_TRIGGER_RATIO + 0.02), 1.2);
  assert.equal(printed.length, 0); step(0.5); assert.equal(printed.length, 0, 'nothing prints while still held');
  pointers.up(p); step(0.05); assert.equal(printed.length, 1); assert.equal(state.mode, 'printing');
  step(0.5); assert.ok(t.py > t.printY0); assert.equal(printed.length, 1);
  ok('print fires only on release past the trigger line, once; the thought settles downward (mode = printing)');
  step(4); assert.equal(state.mode, 'ambient'); assert.equal(printed.length, 1); ok('…then back to ambient');
}
{
  // low thought: a tiny wobble that ends inside the zone must NOT print
  const { state, step, T, raise, glide, pointers, printed } = setup();
  const t = T('thought-12');                         // y ≈ 0.776 → 838px, zone top ≈ 907
  const p = raise('thought-12');
  glide(p, p.x, 915, 0.3);                           // 77px: over the start threshold but under the minimum carry
  assert.ok(state.printArmed && !state.drag.inZone); pointers.up(p); step(0.1);
  assert.equal(printed.length, 0); ok('release above the trigger line does not print');
}
{
  // lockout: two drops in quick succession → only one job
  const { state, step, T, raise, glide, pointers, printed } = setup();
  const a = T('thought-15'), b = T('thought-16');
  const pa = raise('thought-15', 1), pb = raise('thought-16', 2);
  glide(pa, a.homeX, 1010, 0.6); glide(pb, b.homeX, 1010, 0.6);
  assert.equal(state.drag.count, 2); ok('two people can carry two thoughts at once');
  pointers.up(pa); pointers.up(pb); step(0.1);
  assert.equal(printed.length, 1); ok('PRINT_LOCKOUT stops a second job right behind the first');
}
{
  // dragging keeps a thought alive past its max reveal time; releasing lets the clock resume
  const { state, step, T, raise, glide, pointers } = setup();
  const t = T('thought-02'); const p = raise('thought-02');
  glide(p, p.x + 20, p.y + 60, 0.4);
  step(t.maxRevealDuration + 3);
  assert.ok(t.isDragging && t.state === S.DRAGGING); ok('carrying pauses the 8–12 s clock');
  pointers.up(p); step(0.1); step(10);
  assert.equal(t.state, S.SUBMERGED); ok('after release it fades normally');
}
{
  // touch floats the thought above the fingertip; a mouse carries it exactly under the cursor
  const a = setup(); const ta = a.T('thought-15'); const pa = a.raise('thought-15');
  a.glide(pa, pa.x, pa.y + 200, 0.6); a.step(1.2);
  const b = setup(); const tb = b.T('thought-15'); const pb = b.raise('thought-15'); pb.type = 'mouse';
  b.glide(pb, pb.x, pb.y + 200, 0.6); b.step(1.2);
  const lifted = (pa.y - ta.py) - (pb.y - tb.py);          // identical grab, only the pointer type differs
  assert.ok(Math.abs(lifted - C.DRAG_LIFT * a.state.view.scale) < 3, 'lift ' + lifted);
  ok(`touch lifts the carried thought ${Math.round(lifted)}px above the finger; a mouse doesn't`);
}
{
  // a virtual (dev) pointer can't carry
  const { state, step, T, pointers } = setup();
  const t = T('thought-04');
  const p = pointers.down(1, t.px, t.py); step(3.2);
  p.virtual = true; pointers.move(p, t.px, t.py + 80); step(0.3);
  assert.ok(!t.isDragging); ok('virtual pointers never pick up thoughts');
}

// ---------------- printer ----------------
console.log('printer (mock)');
{
  const thought = { id: 'thought-01', feelingTag: 'overwhelmed', text: 'I care about what is happening, but sometimes it feels too big to know where to begin.' };
  const r = formatReceipt(thought);
  assert.ok(r.lines.every((l) => l.length <= C.PRINT_LINE_WIDTH), 'line width');
  assert.ok(r.plainText.includes('feeling: overwhelmed') && r.plainText.includes('I care about'));
  ok(`receipt fits ${C.PRINT_LINE_WIDTH} columns and includes text + feeling`);

  const events = []; setPrinterStatusHandler((u) => events.push(u));
  const log = console.log; console.log = () => {};           // silence the mock receipt in test output
  const t0 = Date.now(); const res = await printThought(thought); console.log = log;
  assert.equal(res.ok, true); assert.equal(res.backend, 'mock');
  assert.ok(Date.now() - t0 >= C.MOCK_PRINT_DELAY * 900);
  assert.deepEqual(events.map((e) => e.status), ['printing', 'idle']);
  assert.equal(events[1].count, 1);
  ok('mock print resolves ok, reports printing → idle, needs no hardware');
}

console.log(`\n${pass} stage-2 checks passed`);
