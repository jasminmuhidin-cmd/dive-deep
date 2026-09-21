// CSV parsing, dataset loading, thought shape, placement and the active pool.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as C from '../src/config/constants.js';
import { parseCSV } from '../src/data/csv.js';
import { loadThoughtDataset, rowsToThoughts } from '../src/data/thoughtLoader.js';
import { createInstallationState, resizeView, THOUGHT_STATE as S } from '../src/state/installationState.js';
import { createThoughtPool } from '../src/state/thoughtPool.js';
import { overlapStats, placementBounds, footprint } from '../src/layout/placement.js';
import { thoughtAffinity } from '../src/data/feelings.js';
import { FIXTURE_THOUGHTS } from './fixtures/fixtureThoughts.mjs';
import { FALLBACK_THOUGHTS } from '../src/data/fallbackThoughts.js';

let pass = 0; const ok = (m) => { pass++; console.log('  ✓', m); };
const CSV_PATH = new URL('../assets/data/quiet_weight_seed_thoughts.csv', import.meta.url);
const csvText = fs.readFileSync(CSV_PATH, 'utf8');

console.log('csv parser');
{
  assert.deepEqual(parseCSV('\ufeffa,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]); ok('BOM + CRLF');
  assert.deepEqual(parseCSV('a,b\n"x, y","say ""hi"""\n'), [['a', 'b'], ['x, y', 'say "hi"']]); ok('quoted commas and escaped quotes');
  assert.deepEqual(parseCSV('a\n"line1\nline2"\nlast'), [['a'], ['line1\nline2'], ['last']]); ok('line break inside quotes, no trailing newline');
  assert.deepEqual(parseCSV('a,b\n\n1,2\n\n'), [['a', 'b'], ['1', '2']]); ok('blank lines skipped');
  assert.deepEqual(parseCSV('a,b,c\n1,,3'), [['a', 'b', 'c'], ['1', '', '3']]); ok('empty fields kept');
}

console.log('quiet_weight_seed_thoughts.csv');
let dataset;
{
  const rows = parseCSV(csvText);
  assert.deepEqual(rows[0], ['thought_id', 'response', 'theme', 'feeling_tag', 'connection_group']);
  const { thoughts, warnings } = rowsToThoughts(rows, { source: 'seed' });
  assert.equal(thoughts.length, 100); assert.deepEqual(warnings, []);
  assert.equal(new Set(thoughts.map((t) => t.id)).size, 100);
  const t1 = thoughts[0];
  assert.equal(t1.id, 'T001'); assert.match(t1.text, /^I worry that people are getting used to seeing suffering/);
  assert.equal(t1.theme, 'media & global crises'); assert.equal(t1.feelingTag, 'overwhelmed'); assert.equal(t1.connectionGroup, 'numbness');
  const t2 = thoughts[1];
  assert.match(t2.text, /^The climate feels like this huge thing hanging over everything, even on normal days/); // quoted, has a comma
  assert.ok(thoughts.every((t) => t.text && t.feelingTag && t.connectionGroup && t.theme));
  ok('all 100 rows load with thought_id→id, response→text, theme, feeling_tag→feelingTag, connection_group→connectionGroup');
  dataset = thoughts;

  const s = createInstallationState({ dataset });
  const t = s.allThoughts[0];
  for (const k of ['id', 'text', 'theme', 'feelingTag', 'connectionGroup', 'x', 'y', 'state', 'printed']) assert.ok(k in t, k);
  assert.equal(t.state, S.INACTIVE); assert.equal(t.printed, false);
  assert.equal(s.thoughts.length, 0); assert.equal(s.allThoughts.length, 100);
  ok('runtime thought has { id, text, theme, feelingTag, connectionGroup, x, y, state, printed }; nothing in the water until placed');
}

console.log('loader');
{
  const reads = [];
  const reader = async (url) => { reads.push(url); return csvText; };
  const r = await loadThoughtDataset(C.DATASET_SOURCES, reader);
  assert.equal(r.thoughts.length, 100); assert.deepEqual(r.warnings, []); assert.equal(r.loaded.length, 1);
  assert.equal(C.DATASET_SOURCES.length, 1); assert.ok(reads[0].endsWith('quiet_weight_seed_thoughts.csv'));
  ok('quiet_weight_seed_thoughts.csv is the one and only dataset source (100 thoughts, nothing merged)');

  const { FALLBACK_THOUGHTS: FB } = await import('../src/data/fallbackThoughts.js');
  assert.equal(FB.length, 100); assert.deepEqual(FB.map((t) => t.id), r.thoughts.map((t) => t.id)); assert.deepEqual(FB.map((t) => t.text), r.thoughts.map((t) => t.text));
  ok('the built-in fallback is an exact copy of the new CSV (no old thoughts remain anywhere)');

  const r3 = await loadThoughtDataset([{ url: './nope.csv', required: true }], async () => { throw new Error('HTTP 404'); });
  assert.equal(r3.thoughts.length, 0); assert.ok(r3.warnings[0].includes('could not load'));
  ok('a missing required file is reported, not thrown (the app then falls back)');

  const r4 = rowsToThoughts(parseCSV('Response,FEELING_TAG\nHello there,  Sad \n,\n'));
  assert.equal(r4.thoughts.length, 1); assert.equal(r4.thoughts[0].feelingTag, 'sad'); assert.equal(r4.warnings.length, 1);
  ok('header names are case-insensitive, values trimmed, empty responses skipped');
}

console.log('placement & pool');
// stand-in for the renderer: sprite size from text length (≈12.5px per character at 1080p, 420px wrap)
const fakeSprite = (t) => {
  let lines = 1, cur = 0, maxw = 0;
  for (const w of t.text.split(' ')) { const ww = (w.length + 1) * 12; if (cur + ww > 420) { lines++; cur = ww; } else cur += ww; maxw = Math.max(maxw, cur); }
  const textW = Math.min(420, maxw);
  t.sprite = { textW, textH: lines * 38, w: textW + 100, h: lines * 38 + 100, pad: 50 };
  t.ringRadius = Math.hypot(textW / 2, lines * 19) + 12;
};
const makePool = (ds, seed = 1, view = [1920, 1080]) => {
  const state = createInstallationState({ dataset: ds }); resizeView(state, view[0], view[1], 1);
  let x = seed; const rng = () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; };
  const pool = createThoughtPool(state, { ensureSprite: fakeSprite, releaseSprite: (t) => { t.sprite = null; }, rng });
  return { state, pool, rng };
};
{
  const { state, pool } = makePool(dataset, 7);
  pool.activateInitial();
  assert.equal(state.thoughts.length, C.INITIAL_ACTIVE_THOUGHTS);
  assert.ok(state.thoughts.every((t) => t.state === S.SUBMERGED && !t.revealed && t.sharpness === 0 && t.printed === false));
  ok(`${C.INITIAL_ACTIVE_THOUGHTS} thoughts start submerged, none readable`);

  const zoneTop = 1080 * (1 - C.PRINT_ZONE_HEIGHT);
  for (const t of state.thoughts) {
    const f = footprint(t, 1);
    assert.ok(t.px - f.w / 2 >= C.LEFT_CONTROL_RESERVE - 1, 'left reserve'); assert.ok(t.py + f.h / 2 <= zoneTop, 'above print zone');
    assert.ok(t.px + f.w / 2 <= 1920 && t.py - f.h / 2 >= 0);
    assert.ok(Math.abs(t.x - t.px / 1920) < 1e-9 && t.x > 0 && t.x < 1 && t.y > 0 && t.y < 1);
  }
  ok('every thought sits inside the water: clear of the left control, the print zone and the edges; x/y normalised');

  let over = 0, worst = 0, spread = [];
  const N = 200;
  for (let seed = 1; seed <= N; seed++) {
    const p = makePool(dataset, seed); p.pool.activateInitial();
    const st = overlapStats(p.state.thoughts, 1); over += st.overlapping; worst = Math.max(worst, st.overlapping);
    spread.push(p.state.thoughts.reduce((a, t) => a + t.px, 0) / p.state.thoughts.length);
  }
  const avg = over / N;
  console.log(`     ${C.INITIAL_ACTIVE_THOUGHTS} thoughts, 200 random layouts: avg overlapping pairs ${avg.toFixed(2)} (worst ${worst}) of ${C.INITIAL_ACTIVE_THOUGHTS * (C.INITIAL_ACTIVE_THOUGHTS - 1) / 2}`);
  assert.ok(avg < 2 && worst <= 6, `avg ${avg} worst ${worst}`);
  ok('random scatter keeps overlap light (no list / grid, no heavy piles)');
  const meanX = spread.reduce((a, b) => a + b, 0) / N; assert.ok(meanX > 800 && meanX < 1200);
  ok('layouts differ every launch but stay balanced across the water');
}
{
  // Thought-button style introductions
  const { state, pool } = makePool(dataset, 3);
  pool.activateInitial();
  const seen = new Set(state.thoughts.map((t) => t.id));
  let maxActive = 0, repeats = 0;
  for (let i = 0; i < 90; i++) {
    const t = pool.introduce();
    assert.ok(t && t.active && t.state === S.SUBMERGED);
    if (seen.has(t.id) && !state.thoughts.includes(t)) repeats++;
    seen.add(t.id);
    const settled = state.thoughts.filter((x) => !x.retiring).length;
    maxActive = Math.max(maxActive, settled);
    for (let k = 0; k < 250; k++) pool.update(1 / 60);            // ~4 s: retiring thoughts dissolve
  }
  assert.ok(maxActive <= C.MAX_ACTIVE_THOUGHTS, 'cap ' + maxActive);
  assert.ok(state.thoughts.length <= C.MAX_ACTIVE_THOUGHTS && state.thoughts.every((t) => !t.retiring));
  assert.equal(seen.size, 100, 'every thought is used before any repeats: ' + seen.size);
  assert.ok(state.allThoughts.filter((t) => !t.active).every((t) => t.sprite === null && t.x === null && t.state === S.INACTIVE));
  ok(`90 Thought presses: never more than ${C.MAX_ACTIVE_THOUGHTS} in the water, the whole dataset used before any repeat, retired ones fully released`);
}
{
  // recent-memory: consecutive presses never repeat
  const { state, pool } = makePool(dataset, 5); pool.activateInitial();
  const ids = []; for (let i = 0; i < 30; i++) { ids.push(pool.introduce().id); for (let k = 0; k < 250; k++) pool.update(1 / 60); }
  assert.equal(new Set(ids).size, 30); ok('no repeats within the recent-memory window');
}
{
  // dataset smaller than the water (the built-in fallback): re-enter the oldest quiet thought
  const { state, pool } = makePool(FIXTURE_THOUGHTS.map((t) => ({ ...t, x: undefined, y: undefined })), 9);
  pool.activateInitial(18);
  assert.equal(pool.inactive().length, 0);
  const before = state.thoughts.map((t) => [t.id, t.px, t.py]);
  const t = pool.introduce();
  assert.ok(t && state.thoughts.length === 18);
  assert.ok(before.find(([id]) => id === t.id)[1] !== t.px || before.find(([id]) => id === t.id)[2] !== t.py);
  ok('when every thought is already in the water, the oldest quiet one is moved to a fresh spot');
}
{
  // fixed x/y from data are honoured (fallback fixture)
  const state = createInstallationState({ dataset: FIXTURE_THOUGHTS, activateAll: true }); resizeView(state, 1920, 1080, 1);
  const pool = createThoughtPool(state, { ensureSprite: fakeSprite });
  assert.equal(state.thoughts.length, 18);
  ok('activateAll builds a fixed-layout fixture for tests');
}

console.log('feeling / group relations');
{
  const T = (tag, group) => ({ feelingTag: tag, connectionGroup: group });
  assert.equal(thoughtAffinity(T('sad', 'loss'), T('grieving', 'loss')).kind, 'group');
  assert.equal(thoughtAffinity(T('sad', 'loss'), T('sad', 'trust')).kind, 'feeling');
  assert.equal(thoughtAffinity(T('sad', 'loss'), T('grieving', 'trust')).kind, 'related');
  assert.equal(thoughtAffinity(T('sad', 'loss'), T('hopeful', 'trust')).kind, null);
  assert.ok(thoughtAffinity(T('a', 'g'), T('b', 'g')).weight > thoughtAffinity(T('a', 'g'), T('a', 'h')).weight);
  const tags = new Set(dataset.map((t) => t.feelingTag)); assert.equal(tags.size, 15);
  const linked = dataset.filter((t) => dataset.some((u) => u !== t && thoughtAffinity(t, u).weight > 0)).length;
  assert.equal(linked, 100);
  ok('same group > same feeling > related feeling > none; every CSV thought has someone it can connect to');
}
console.log(`\n${pass} dataset checks passed`);
