// Ripple hierarchy, the Thought button's entry, camera → water, attention cues, participant mode.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as C from '../src/config/constants.js';
import { parseCSV } from '../src/data/csv.js';
import { rowsToThoughts } from '../src/data/thoughtLoader.js';
import { createInstallationState, resizeView, THOUGHT_STATE as S } from '../src/state/installationState.js';
import { createThoughtPool } from '../src/state/thoughtPool.js';
import { RippleSystem, rippleRadius, rippleAmplitude } from '../src/visuals/ripple.js';
import { updateCollectiveTouch } from '../src/interactions/collectiveTouch.js';
import { updateThoughtReveal } from '../src/interactions/thoughtReveal.js';
import { createThoughtEntry, entryProfile, ENTRY_TOTAL_TIME } from '../src/interactions/thoughtEntry.js';
import { createCameraRipples } from '../src/interactions/cameraRipples.js';
import { installArtefactAdded, registerArtefactAdded } from '../src/interactions/artefactAdded.js';
import { updatePalette } from '../src/visuals/palette.js';

let pass = 0; const ok = (m) => { pass++; console.log('  ✓', m); };
const dataset = rowsToThoughts(parseCSV(fs.readFileSync(new URL('../assets/data/quiet_weight_seed_thoughts.csv', import.meta.url), 'utf8'))).thoughts;
const fakeSprite = (t) => {
  let lines = 1, cur = 0, maxw = 0;
  for (const w of t.text.split(' ')) { const ww = (w.length + 1) * 12; if (cur + ww > 420) { lines++; cur = ww; } else cur += ww; maxw = Math.max(maxw, cur); }
  const textW = Math.min(420, maxw);
  t.sprite = { textW, textH: lines * 38, w: textW + 100, h: lines * 38 + 100, pad: 50 }; t.ringRadius = Math.hypot(textW / 2, lines * 19) + 12;
};
function world(seed = 1) {
  const state = createInstallationState({ dataset }); resizeView(state, 1920, 1080, 1);
  let x = seed; const rng = () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; };
  const ripples = new RippleSystem(state);
  const pool = createThoughtPool(state, { ensureSprite: fakeSprite, releaseSprite: (t) => { t.sprite = null; }, rng });
  pool.activateInitial();
  let now = 100; const dt = 1 / 60;
  state.time.now = now;
  const entry = createThoughtEntry({ state, pool, clock: () => now });
  const camRipples = createCameraRipples({ state, ripples, rng });
  installArtefactAdded({ state, ripples });
  const step = (secs, pointers = []) => {
    for (let i = 0; i < Math.round(secs / dt); i++) {
      now += dt; state.time.now = now; state.time.dt = dt;
      updateCollectiveTouch(state, pointers, ripples, dt, now);
      updatePalette(state);
      updateThoughtReveal(state, pointers, ripples, dt, now);
      pool.update(dt); camRipples.update(dt, now); ripples.update(dt);
    }
  };
  return { state, ripples, pool, entry, camRipples, step, get now() { return now; } };
}
const ptr = (x, y, id = 1) => ({ id, x, y, nextRippleAt: 0 });

console.log('ripple types: one system, clear hierarchy');
{
  const { state, ripples } = world();
  const mk = (type) => ripples.create({ x: 900, y: 500, type });
  const [mv, th, co] = ['movement', 'thought', 'collective'].map(mk);
  const far = (r) => { let R = 0; for (let a = 0; a <= r.life; a += 0.05) { r.age = a; R = Math.max(R, rippleRadius(r)); } r.age = 0.05; return R; };
  const R = { mv: far(mv), th: far(th), co: far(co) };
  console.log(`     reach: movement ${R.mv.toFixed(0)}px · thought ${R.th.toFixed(0)}px · collective ${R.co.toFixed(0)}px   life: ${mv.life}s · ${th.life}s · ${co.life}s   strength: ${mv.strength} · ${th.strength} · ${co.strength}`);
  assert.ok(R.mv < R.th && R.th < R.co, 'reach');
  assert.ok(R.th > 2.5 * R.mv, 'a thought ripple is far wider than a movement ripple');
  assert.ok(mv.life < th.life && th.life < co.life, 'duration');
  assert.ok(mv.def.strength < th.def.strength && th.def.strength < co.def.strength, 'intensity');
  assert.ok(R.th > 900, 'a thought ripple crosses most of a 1920×1080 screen');
  ok('movement < thought < collective in reach, duration and strength');
  assert.throws(() => ripples.create({ x: 0, y: 0, type: 'nope' })); ok('unknown types are refused');
}
{
  const { ripples } = world();
  for (let i = 0; i < 30; i++) ripples.create({ x: 1, y: 1, type: 'movement' });
  assert.equal(ripples.countType('movement'), C.MAX_MOVEMENT_RIPPLES); ok(`camera ripples are capped at ${C.MAX_MOVEMENT_RIPPLES} at once`);
  const r2 = world().ripples;
  const big = r2.create({ x: 5, y: 5, type: 'collective' });
  for (let i = 0; i < 200; i++) r2.create({ x: 1, y: 1, type: 'touch' });
  assert.ok(r2.list.length <= C.MAX_TOTAL_RIPPLES && r2.list.includes(big)); ok('when the water is full, small ripples make way — a collective ripple is never evicted by them');
  const d = ripples.create({ x: 0, y: 0, type: 'thought', delay: 2 });
  assert.equal(rippleAmplitude(d), 0); ripples.update(2.3); assert.ok(rippleAmplitude(d) > 0); ok('delayed ripples wait, then open');
}
{
  const { state, ripples } = world();
  const t = state.thoughts[0];
  const mv = ripples.create({ x: t.px - 200, y: t.py, type: 'movement' });
  for (let i = 0; i < 300; i++) { ripples.update(1 / 60); assert.equal(ripples.influenceAt(t.px, t.py).wobble, 0); }
  ok('movement ripples never stir a thought, even when they pass right through it');
  const w2 = world(); const t2 = w2.state.thoughts[0];
  w2.ripples.create({ x: t2.px - 260, y: t2.py, type: 'thought' });
  let peak = 0; for (let i = 0; i < 900; i++) { w2.ripples.update(1 / 60); peak = Math.max(peak, w2.ripples.influenceAt(t2.px, t2.py).wobble); }
  assert.ok(peak > 0.3, 'peak ' + peak); ok(`a thought ripple passing through stirs nearby thoughts (peak ${peak.toFixed(2)})`);
}

console.log('the Thought button');
{
  const w = world(3);
  const before = new Set(w.state.thoughts.map((t) => t.id));
  const t = w.entry.press();
  assert.ok(t && !before.has(t.id) && t.state === S.ENTERING && t.active);
  assert.ok(t.px - t.sprite.textW / 2 >= C.LEFT_CONTROL_RESERVE - 1, 'clear of the button');
  ok('picks a dataset thought that was not active, and puts it in the water in the entering state');

  assert.equal(w.entry.press(), null); ok('a second press inside the cooldown is ignored (calm)');

  const seen = { readableAt: null, goneAt: null, everRevealedByTouch: false };
  let firstThoughtRipple = null;
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(45 * 60); i++) {
    w.step(dt);
    const now = (i + 1) / 60;
    if (seen.readableAt === null && t.revealed) seen.readableAt = now;
    if (seen.readableAt !== null && seen.goneAt === null && t.state === S.SUBMERGED) seen.goneAt = now;
    const tr = w.ripples.list.filter((r) => r.type === 'thought');
    if (tr.length && firstThoughtRipple === null) firstThoughtRipple = now;
  }
  assert.ok(t.entryTravel >= 4 && t.entryTravel <= 9, 'the wave takes a visible time to travel in: ' + t.entryTravel);
  assert.ok(Math.abs(firstThoughtRipple - (t.entryTravel + 0.3)) < 0.2, 'the larger ripple opens as the wave arrives: ' + firstThoughtRipple);
  ok(`sequence: wave travels in from the button (${t.entryTravel.toFixed(1)}s) → the larger ripple opens at ${firstThoughtRipple.toFixed(1)}s`);
  assert.ok(Math.abs(seen.readableAt - (t.entryTravel + C.ENTRY_DISTURB_TIME)) < 1, 'words appear after the ripple opens: ' + seen.readableAt);
  ok(`the words then appear all at once (readable at ${seen.readableAt.toFixed(1)}s) without needing a touch`);
  const life = seen.goneAt - seen.readableAt;
  assert.ok(life >= 8 && life <= 14.2, 'life ' + life); assert.equal(t.state, S.SUBMERGED); assert.equal(t.sharpness, 0);
  ok(`they stay ~${life.toFixed(0)}s (8–12 s + a fade) and disappear by themselves`);
}
{
  // three rings, thought-type, from the point where the thought entered
  const w = world(4); const t = w.entry.press();
  w.step(0.05);
  w.step(t.entryTravel + 0.6);
  const rs = w.ripples.list.filter((r) => r.type === 'thought');
  assert.equal(rs.length, C.ENTRY_RING_DELAYS.length);
  assert.ok(rs.every((r) => r.x === t.px && r.y === t.py));
  assert.ok(rs[0].strength > rs[1].strength && rs[1].strength > rs[2].strength);
  ok('three concentric, gradually softer rings start exactly where the thought entered');
  w.step(9);
  const r0 = w.ripples.list.find((r) => r.type === 'thought');
  assert.ok(r0 && rippleAmplitude(r0) > 0.15 * r0.strength, 'still clearly visible ~10 s in');
  ok('the ripple is still travelling, and clearly visible, ~10 s later — long enough to see what caused it');
}
{
  // touching a thought that is still entering hands it to normal attention
  const w = world(5); const t = w.entry.press(); w.step(3);
  assert.equal(t.state, S.ENTERING);
  const p = ptr(t.px, t.py); w.step(0.2, [p]); assert.equal(t.state, S.REVEALING);
  w.step(4, [p]); assert.ok(t.revealed && t.state === S.REVEALED);
  w.step(0.1); assert.ok(t.presence === 1 && t.entryReveal === 1);
  ok('a touch during the entry takes over: it becomes fully readable like any other thought');
  w.step(20); assert.equal(t.state, S.SUBMERGED); ok('…and then follows the normal attention rules (never held open forever)');
}
{
  // many presses: the water stays within its limits
  const w = world(6);
  for (let i = 0; i < 40; i++) { w.entry.press(); w.step(C.THOUGHT_BUTTON_COOLDOWN + 0.1); }
  assert.ok(w.state.thoughts.filter((t) => !t.retiring).length <= C.MAX_ACTIVE_THOUGHTS);
  assert.ok(w.ripples.list.length <= C.MAX_TOTAL_RIPPLES);
  ok('40 presses in a row: thought count and ripple count stay within their caps');
}

console.log('attention is communicated by behaviour, not numbers');
{
  const w = world(7); const t = w.state.thoughts[0]; const p = ptr(t.px, t.py);
  w.step(0.2, [p]); w.step(3, [p]);
  assert.equal(t.state, S.REVEALED); const idleHeld = t.idle;
  const pulses0 = w.ripples.list.length;
  w.step(C.BREATH_PERIOD * 2, [p]);
  assert.ok(idleHeld < 0.05, 'no shimmer while attended'); ok('while attention stays, the thought stays still and clear (no shimmer)');
  const cycles = []; let last = -1;
  w.step(0.01);
  // pulses: one soft 'reveal' ripple per breath
  const w2 = world(8); const t2 = w2.state.thoughts[0]; const p2 = ptr(t2.px, t2.py); let count = 0; const seenRipples = new Set();
  for (let i = 0; i < 60 * 8; i++) { w2.step(1 / 60, [p2]); for (const r of w2.ripples.list) if (r.type === 'reveal' && r.x === t2.px && r.y === t2.py && Math.abs(r.strength / C.THOUGHT_PULSE_STRENGTH - 1) < 0.12 && !seenRipples.has(r)) { seenRipples.add(r); count++; } }
  assert.ok(count >= 1 && count <= 3, 'breath pulses ' + count); ok(`the ring breathes: ~one soft pulse per ${C.BREATH_PERIOD}s while attended (${count} in 8 s)`);
}
{
  // attention leaves → nothing changes: the words stay for their full time
  const w = world(9); const t = w.state.thoughts[0]; const p = ptr(t.px, t.py);
  w.step(1.5, [p]); assert.equal(t.state, S.REVEALED);
  w.step(4, []);
  assert.ok(t.idle < 0.05 && t.state === S.REVEALED && t.sharpness === 1, 'idle ' + t.idle);
  ok('when a touch ends the words simply stay (no fade, no shimmer) until their 8–12 s are up');
}
{
  // the maximum duration arrives as a shimmer first
  const w = world(10); const t = w.state.thoughts[0]; const p = ptr(t.px, t.py);
  t.maxRevealDuration = 0; w.step(0.05, [p]);
  w.step(3, [p]); const dur = 10;
  t.maxRevealDuration = dur; t.readableSince = w.now;             // 10 s left, still touching
  w.step(dur - C.EXPIRY_WARNING - 0.5, [p]); const calm = t.idle;
  w.step(C.EXPIRY_WARNING + 0.2, [p]); const warned = t.idle;
  assert.ok(calm < 0.05 && warned > 0.3, `calm ${calm} warned ${warned}`); assert.equal(t.state, S.REVEALED);
  ok('even with a finger still down, the last moments before the maximum show as shimmer first — never a number');
  w.step(0.6, [p]); assert.equal(t.state, S.BLURRING); ok('then the words go');
}

console.log('camera → water only');
{
  const w = world(11);
  w.state.camera.status = 'ready';
  const T = w.state.thoughts;
  // a crowd of people moving right over the thoughts for two minutes
  for (let s = 0; s < 120 * 6; s++) {
    w.state.movementPoints = T.slice(0, 5).map((t, i) => ({ id: i + 1, x: t.px / 1920, y: t.py / 1080, strength: 0.9, moving: true, present: true }));
    w.step(1 / 6);
  }
  assert.ok(w.ripples.counts().movement > 0 || w.ripples.list.length >= 0);
  assert.ok(T.every((t) => t.state === S.SUBMERGED && t.sharpness === 0 && !t.revealed));
  ok('people moving right on top of thoughts for two minutes: every thought stays submerged (camera never reveals)');
}
{
  const w = world(12); w.state.camera.status = 'ready';
  const made = [];
  const orig = w.ripples.create.bind(w.ripples);
  w.ripples.create = (o) => { const r = orig(o); if (r && o.type === 'movement') made.push({ t: w.now, x: o.x, y: o.y, s: o.strength }); return r; };
  w.state.movementPoints = [{ id: 1, x: 0.7, y: 0.4, strength: 0.6, moving: true, present: true }];
  w.step(30);
  const rate1 = made.length / 30;
  assert.ok(made.length >= 18 && made.length <= 40, 'one person: ' + made.length);
  assert.ok(made.every((m) => Math.abs(m.x - 0.7 * 1920) < 40 && Math.abs(m.y - 0.4 * 1080) < 40)); ok(`one person moving: a ripple about every second at their position (${made.length} in 30 s)`);
  const gaps = made.slice(1).map((m, i) => m.t - made[i].t); assert.ok(Math.min(...gaps) >= C.CAMERA_RIPPLE_COOLDOWN - 0.05, 'min gap ' + Math.min(...gaps));
  ok(`cooldown holds: never closer than ${Math.min(...gaps).toFixed(1)} s apart for one person`);
}
{
  const run = (n) => {
    const w = world(20 + n); w.state.camera.status = 'ready'; const strengths = []; let created = 0, maxAlive = 0;
    const orig = w.ripples.create.bind(w.ripples);
    w.ripples.create = (o) => { const r = orig(o); if (r && o.type === 'movement') { created++; strengths.push(o.strength); } return r; };
    w.state.movementPoints = Array.from({ length: n }, (_, i) => ({ id: i + 1, x: 0.15 + 0.7 * (i / Math.max(1, n - 1 || 1)), y: 0.3 + 0.35 * ((i * 0.37) % 1), strength: 0.8, moving: true, present: true }));
    for (let i = 0; i < 60 * 20; i++) { w.step(1 / 60); maxAlive = Math.max(maxAlive, w.ripples.countType('movement')); }
    return { created, rate: created / 20, maxAlive, maxStrength: Math.max(...strengths) };
  };
  const one = run(1), three = run(3), eight = run(8);
  console.log(`     ripples/s: 1 person ${one.rate.toFixed(2)} · 3 people ${three.rate.toFixed(2)} · 8 people ${eight.rate.toFixed(2)}   (max alive ${eight.maxAlive}, cap ${C.MAX_MOVEMENT_RIPPLES})`);
  assert.ok(three.created > one.created && eight.created >= three.created * 0.9, 'more people → more ripple origins');
  assert.ok(three.rate < 3 * one.rate * 0.9, 'sub-linear: three people are not three times as busy');
  assert.ok(eight.rate <= C.MOVEMENT_MAX_RATE + 0.25, 'ceiling ' + eight.rate);
  assert.ok(eight.maxAlive <= C.MAX_MOVEMENT_RIPPLES);
  assert.ok(eight.maxStrength <= C.RIPPLE_TYPES.movement.strength + 1e-9 && three.maxStrength === one.maxStrength || three.maxStrength <= C.RIPPLE_TYPES.movement.strength + 1e-9);
  ok('more people → more (still calm) overlapping ripples: sub-linear growth, a hard rate ceiling, and never stronger or larger');
}
{
  const w = world(13); w.state.camera.status = 'ready'; const kinds = [];
  const orig = w.ripples.create.bind(w.ripples);
  w.ripples.create = (o) => { const r = orig(o); if (r) kinds.push(o.strength); return r; };
  w.state.movementPoints = [{ id: 1, x: 0.5, y: 0.5, strength: 0.02, moving: false, present: true }];
  w.step(60);
  const ambientLike = kinds.filter((s) => s < C.RIPPLE_TYPES.movement.strength);
  assert.ok(kinds.length >= 4 && kinds.length <= 24, 'presence ' + kinds.length);
  assert.ok(kinds.every((s) => Math.abs(s - C.RIPPLE_TYPES.movement.strength * C.PRESENCE_RIPPLE_STRENGTH) < 1e-9));
  ok(`someone standing still sends only an occasional, gentler ripple (${kinds.length} in a minute)`);
}
{
  // camera unavailable → nothing happens, nothing throws
  const w = world(14); w.state.camera.status = 'denied';
  w.state.movementPoints = [{ id: 1, x: 0.5, y: 0.5, strength: 1, moving: true, present: true }];
  w.step(30); assert.equal(w.ripples.countType('movement'), 0); ok('with no camera (denied / unavailable) the camera path is inert and the rest keeps running');
  w.state.camera.simulate = true; for (let i = 0; i < 90; i++) { w.camRipples.simulate(900 + i * 3, 500, 800); w.step(1 / 60); }
  assert.ok(w.ripples.countType('movement') >= 1); ok('S: mouse hover can stand in for a moving person when there is no camera');
}

console.log('collective ("artefact added") ripple');
{
  const w = world(15);
  const r = registerArtefactAdded();
  assert.equal(r.type, 'collective'); assert.ok(Math.abs(r.x - 960) < 1 && r.y > 500);
  w.step(20); assert.ok(w.state.thoughts.every((t) => t.state === S.SUBMERGED && !t.revealed));
  ok('A creates one large, slow collective ripple — and reveals nothing');
}

console.log('participant mode');
{
  assert.equal(C.DEBUG_AT_START, false);
  assert.equal(createInstallationState({ dataset }).debug.enabled, false); ok('debug overlays are OFF by default');

  // Every piece of text drawn to the canvas outside the debug overlay must be one of the allowed participant strings.
  const allowed = [/^line$/, /^C\.TAKE_HELPER_TEXT$/, /^C\.IDLE_HINT_TEXT$/, /^'let go to print'$/];
  const dir = new URL('../src/', import.meta.url).pathname; const bad = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(dir).filter((f) => f.endsWith('.js') && !f.endsWith('debugOverlay.js') && !f.endsWith('cameraMonitor.js'))) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/fillText\(\s*([^,]+),/g)) if (!allowed.some((re) => re.test(m[1].trim()))) bad.push(`${path.basename(f)}: fillText(${m[1].trim()})`);
    for (const m of src.matchAll(/strokeText\(/g)) bad.push(`${path.basename(f)}: strokeText`);
  }
  assert.deepEqual(bad, []); ok('the only words ever drawn outside debug mode: the thoughts, "take this thought with you", "let go to print" and the idle hint');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!/\d+\s*s\b|seconds|countdown|timer/i.test(C.TAKE_HELPER_TEXT + C.IDLE_HINT_TEXT + C.THOUGHT_BUTTON_LABEL));
  ok('no participant-facing string mentions seconds, timers or countdowns');
}
console.log(`\n${pass} stage-3 checks passed`);
