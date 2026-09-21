// ---------------------------------------------------------------------------
// main.js — wires the modules together and runs the frame loop.
//
// The interaction hierarchy (kept separate — nothing here merges behaviours):
//   camera presence / movement → subtle ripples only (never reveals a thought)
//   Thought button             → a wave enters the water AT the button, travels right, and the thought emerges from it
//   individual touch           → reveals an existing thought; attention keeps it, its absence blurs it
//   several touches            → warmer water, shared-feeling / shared-group connections
//   drag a clear thought down  → print zone → printThought()
//
// Frame order:
//   pointers → collective mode → drag → attention → mode → connections → pool → camera ripples → flow → ripples → water → draw
// Draw order: background gradient + horizontal current + sparse ambient ripples (water) → interaction ripples →
//   thoughts → print feedback
// ---------------------------------------------------------------------------
import * as C from './config/constants.js';
import { FALLBACK_THOUGHTS } from './data/fallbackThoughts.js';
import { loadThoughtDataset } from './data/thoughtLoader.js';
import { createInstallationState, resizeView, updateMode } from './state/installationState.js';
import { createThoughtPool } from './state/thoughtPool.js';
import { createPointerManager } from './interactions/pointerManager.js';
import { updateCollectiveTouch } from './interactions/collectiveTouch.js';
import { updateThoughtReveal } from './interactions/thoughtReveal.js';
import { createThoughtEntry } from './interactions/thoughtEntry.js';
import { createDragToPrint } from './interactions/dragToPrint.js';
import { installKeyboardControls } from './interactions/keyboardControls.js';
import { installArtefactAdded, registerArtefactAdded } from './interactions/artefactAdded.js';
import { createCameraRipples } from './interactions/cameraRipples.js';
import { createCamera } from './camera/camera.js';
import { RippleSystem, drawRippleFronts, setActiveRippleSystem } from './visuals/ripple.js';
import { createWater } from './visuals/water.js';
import { createFlow, setActiveFlow } from './visuals/flow.js';
import { createMotes } from './visuals/motes.js';
import { createConnections } from './visuals/connections.js';
import { updatePalette } from './visuals/palette.js';
import { drawPrintZone } from './visuals/printZone.js';
import { buildThoughtSprites, drawThoughts, ensureSprite, releaseSprite } from './visuals/thoughtRenderer.js';
import { drawIdleHint } from './visuals/hint.js';
import { createThoughtButton } from './ui/thoughtButton.js';
import { printThought, setPrinterStatusHandler } from './printer/printer.js';
import { drawDebug } from './visuals/debugOverlay.js';
import { updateEntryWaves, drawEntryWaves } from './visuals/entryWave.js';
import { createPresence } from './visuals/presence.js';
import { updateRainMarks, drawRain } from './visuals/rain.js';
import { drawCameraMonitor, setMonitorMode, updatePanelSlide } from './ui/cameraMonitor.js';
import { createCameraTab } from './ui/cameraTab.js';
import { startKioskBridge } from './integrations/kioskBridge.js';
import { resolveApiBase } from './config/urls.js';

async function loadDataset() {
  const result = await loadThoughtDataset();
  for (const w of result.warnings) console.warn(`[dataset] ${w}`);
  if (!result.thoughts.length) {
    console.error('[dataset] no thoughts could be loaded — running with the small built-in set. ' +
                  `Check that ${C.DATASET_SOURCES[0].url} exists next to index.html.`);
    return { thoughts: FALLBACK_THOUGHTS, ...result, loaded: ['(built-in fallback)'] };
  }
  console.info(`[dataset] ${result.thoughts.length} thoughts from ${result.loaded.join(', ')}`);
  return result;
}

async function start() {
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  if (C.INSTALLATION_MODE) document.body.classList.add('installation');

  const dataset = await loadDataset();
  const urlMonitor = new URLSearchParams(window.location.search).get('monitor');   // e.g. index.html?monitor=debug
  const state = createInstallationState({ dataset: dataset.thoughts });
  if (urlMonitor) setMonitorMode(state, urlMonitor);
  state.dataset = { count: dataset.thoughts.length, warnings: dataset.warnings, loaded: dataset.loaded };

  // One shared flow carries everything that lives in the water: the currents, the ripples,
  // the words' drift, the warmth and the motes. (Must exist before the ripples are created.)
  const flow = createFlow(state);
  state.flow = flow;
  setActiveFlow(flow);

  const ripples = new RippleSystem(state);
  setActiveRippleSystem(ripples);
  installArtefactAdded({ state, ripples });
  const water = createWater(state, ripples, flow);
  const motes = createMotes(state, flow);
  const connections = createConnections(state, ripples);
  const pointers = createPointerManager(canvas);

  // Which thoughts are in the water (state) — kept apart from how they are drawn (renderer).
  const pool = createThoughtPool(state, { ensureSprite: (t) => ensureSprite(t, state), releaseSprite });
  const entry = createThoughtEntry({ state, pool, clock: () => state.time.now });

  // Camera → water only. Never touches thoughts.
  const camera = createCamera({ state, clock: () => state.time.now || performance.now() / 1000 });
  const cameraRipples = createCameraRipples({ state, ripples });
  const cameraTab = createCameraTab(state, camera);
  const presence = createPresence({ state, cameraRipples, flow });   // people as bodies in the water: bands part, wakes trail, overlaps interfere

  function pressThought() {
    const t = entry.press();
    if (t) state.lastTouchTime = state.time.now;
    return !!t;
  }
  const thoughtButton = createThoughtButton({ onPress: pressThought });
  // The Thought wave starts where the button meets the water.
  const updateThoughtOrigin = () => {
    const r = thoughtButton.element.getBoundingClientRect();
    state.thoughtOrigin = r.width ? { x: r.right, y: r.top + r.height / 2 } : null;
  };
  installKeyboardControls({ state, pointers, onArtefact: registerArtefactAdded, onThought: pressThought });

  // The printer reports status into state (for the debug overlay); visuals never wait on it.
  setPrinterStatusHandler((update) => Object.assign(state.printer, update));
  const drag = createDragToPrint({ state, pointers, ripples, printThought });
  startKioskBridge({
    entry,
    state,
    apiBase: resolveApiBase(),
  });

  // A finger landing on the water gets a small acknowledging ripple.
  pointers.on('down', (p) => {
    state.lastTouchTime = state.time.now;
    ripples.create({ x: p.x, y: p.y, type: 'touch', strength: C.TOUCH_RIPPLE_STRENGTH, maxRadius: C.TOUCH_RIPPLE_RADIUS, duration: C.TOUCH_RIPPLE_DURATION });
  });

  // Dev fallback: with no camera, S lets mouse hover stand in for a moving person.
  let hover = null;
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons !== 0) { hover = null; return; }
    const t = performance.now() / 1000;
    if (hover) cameraRipples.simulate(e.clientX, e.clientY, Math.hypot(e.clientX - hover.x, e.clientY - hover.y) / Math.max(0.008, t - hover.t));
    hover = { x: e.clientX, y: e.clientY, t };
  });

  // ---- sizing ----------------------------------------------------------------
  let spriteTimer = null;
  let populated = false;
  function resize(initial = false) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    resizeView(state, w, h, dpr);
    water.resize();
    updateThoughtOrigin();
    motes.reset();
    clearTimeout(spriteTimer);
    if (initial) {
      pool.activateInitial();                         // scatter the opening thoughts, all submerged
      populated = true;
    } else if (populated) {
      spriteTimer = setTimeout(() => buildThoughtSprites(state), 200); // rebuilds are debounced (heavier)
    }
  }
  await document.fonts.ready;
  resize(true);
  window.addEventListener('resize', () => resize());

  camera.start().catch((err) => console.error('[camera] unexpected error:', err)); // never blocks or crashes the water

  // ---- frame loop ------------------------------------------------------------
  let last = performance.now() / 1000;
  let fps = 60;
  let errorLogged = false;

  function frame() {
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, Math.max(0.0001, now - last));
    last = now;
    fps += (1 / dt - fps) * 0.05;
    state.time.now = now;
    state.time.dt = dt;

    try {
      const list = pointers.list();
      if (list.length) state.lastTouchTime = now;
      updateCollectiveTouch(state, list, ripples, dt, now);
      updatePalette(state);
      drag.update(dt, now);
      updateThoughtReveal(state, list, ripples, dt, now);
      updateMode(state, list);                 // installationState.mode: ambient | thoughtEntry | revealing | dragging | printing
      connections.update(dt);
      pool.update(dt);
      cameraRipples.update(dt, now);
      presence.update(dt, now);
      updatePanelSlide(state, dt); cameraTab.update();
      flow.setTouchPoints(state.touchPoints);
      flow.update(dt);
      motes.update(dt);
      updateEntryWaves(state, now, ripples);
      updateRainMarks(state, now);
      ripples.update(dt);
      water.update(dt, now);

      water.render(ctx);
      motes.draw(ctx, now);                    // faint specks carried by the current
      drawRain(ctx, state, now);               // sparse tiny drops: dots, incomplete rings, short ticks
      drawRippleFronts(ctx, ripples, state);   // the faint crest ring of big ripples
      connections.draw(ctx, now);              // beneath the words, above the water
      presence.draw(ctx, now);                 // camera currents: thin streamlines born at movement, joining the global flow
      drawEntryWaves(ctx, state, now);         // the Thought wave: enters at the button, travels right, bends around people
      drawThoughts(ctx, state, now, ripples);
      drawPrintZone(ctx, state, now);          // print feedback, last: only visible while a thought is being carried
      drawIdleHint(ctx, state, now, dt);
      if (state.debug.enabled) drawDebug(ctx, state, list, fps, now, { ripples, camera });
      drawCameraMonitor(ctx, state, camera, fps, now);   // setup tool, top-right: hidden | minimal | debug (press C). Drawn last, apart from the water
    } catch (err) {
      if (!errorLogged) { console.error('Frame error:', err); errorLogged = true; }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // handy in DevTools and in the test harness
  window.__installation = { state, ripples, flow, motes, pointers, water, connections, drag, pool, entry, camera, cameraRipples, presence, pressThought, registerArtefactAdded };
}

start();
