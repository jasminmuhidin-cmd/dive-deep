// ---------------------------------------------------------------------------
// installationState.js — the single shared state object.
// Modules receive `state` as an argument; nothing here touches the DOM.
//
//   state.allThoughts   every thought from the dataset (runtime objects)
//   state.thoughts      the ACTIVE ones — those currently in the water
//   (activation / retirement lives in thoughtPool.js; drawing in thoughtRenderer.js)
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import { FALLBACK_THOUGHTS } from '../data/fallbackThoughts.js';
import { updatePalette } from '../visuals/palette.js';

export const THOUGHT_STATE = Object.freeze({
  INACTIVE: 'inactive',     // in the dataset, not in the water
  ENTERING: 'entering',     // just introduced by the Thought button: disturbance → ripple → emerging → settling
  SUBMERGED: 'submerged',
  REVEALING: 'revealing',
  REVEALED: 'revealed',
  BLURRING: 'blurring',
  DRAGGING: 'dragging',     // carried toward the print zone
  PRINTING: 'printing',     // released inside the trigger zone: printThought() has been called (once); it settles into the lower edge
});

/** Build the runtime thought from a dataset definition. */
export function createThought(def, index) {
  return {
    // ---- from the dataset (thought_id, response, theme, feeling_tag, connection_group) ----
    id: def.id,
    text: def.text,
    theme: def.theme ?? '',
    feelingTag: def.feelingTag ?? '',
    connectionGroup: def.connectionGroup ?? '',
    source: def.source ?? '',

    // ---- position: normalised 0–1 (null until placed; dataset rows with x/y keep them) ----
    x: Number.isFinite(def.x) ? def.x : null,
    y: Number.isFinite(def.y) ? def.y : null,
    fixed: Number.isFinite(def.x) && Number.isFinite(def.y),

    state: THOUGHT_STATE.INACTIVE,
    active: false,
    retiring: false,                         // fading out of the water (to make room for a new thought)
    presence: 1,                             // 0–1 multiplier on its faint under-water shape
    revealed: false,                         // true while sharpness ≥ READABLE_THRESHOLD
    printed: false,                          // true from a print until the thought sinks again (blocks duplicates)
    printCount: 0,
    activatedAt: null,
    timesShown: 0,                           // how often it has been in the water (fresh thoughts are introduced first)

    // attention bookkeeping
    revealStartTime: null,                   // when this reveal cycle began
    readableSince: null,                     // when it first became fully readable this cycle
    lastInteractionTime: -Infinity,
    revealedAt: null,                        // when the state last became 'revealed'
    maxRevealDuration: 0,                    // random 8–12 s, counted from readableSince (never shown to anyone)
    isBeingEngaged: false,
    cooldownUntil: 0,
    idle: 0,                                 // 0–1: how far attention has drifted (drives a shimmer, not a number)

    // entry (Thought button) bookkeeping
    entryStart: null,
    entryTravel: 0,                          // s the entry wave takes to reach this thought from the Thought button
    entryWaved: false,
    entryDisturbed: false,
    entryRippled: false,
    entrySettling: false,
    entryReveal: 1,                          // 0–1: how far the words have surfaced from the ripple's centre

    // visual bookkeeping
    sharpness: 0,                            // 0 submerged → 1 readable
    connectionGlow: 0,                       // 0–1: how strongly a feeling-connection touches this thought
    washDir: 0,                              // 0 = clearing, 1 = submerging (smoothed)
    nextPulseAt: 0,
    phase: (index * 2.399963) % (Math.PI * 2), // per-thought offset so nothing moves in lockstep
    px: 0, py: 0,                            // current pixel position (follows a drag)
    homeX: 0, homeY: 0,                      // where it lives; thoughts drift back here
    isDragging: false,
    helperAlpha: 0,                          // "take this thought with you" visibility 0–1
    ringRadius: 0,
    sprite: null,                            // cached text renders (thoughtRenderer); built only while active
  };
}

/** Put a thought into the water in the submerged state (position is set separately). */
export function activateThought(state, t) {
  if (t.active) return t;
  t.active = true;
  t.retiring = false;
  t.presence = 1;
  t.state = THOUGHT_STATE.SUBMERGED;
  t.sharpness = 0;
  t.revealed = false;
  t.printed = false;
  t.entryReveal = 1;
  t.connectionGlow = 0;
  t.helperAlpha = 0;
  t.isDragging = false;
  t.lastInteractionTime = -Infinity;
  t.cooldownUntil = 0;
  t.activatedAt = state.time.now;
  state.thoughts.push(t);
  return t;
}

/**
 * @param {{dataset?:object[], activateAll?:boolean}} [opts]
 *   activateAll: put every thought in the water straight away (tests / fixed layouts)
 */
export function createInstallationState({ dataset = FALLBACK_THOUGHTS, activateAll = false } = {}) {
  const state = {
    view: { w: 0, h: 0, dpr: 1, scale: 1 },
    time: { now: 0, dt: 0 },

    allThoughts: dataset.map(createThought),
    thoughts: [],
    dataset: { count: dataset.length, warnings: [], loaded: [] },

    // Camera-derived values (camera/ writes them; they only ever affect the water)
    personCount: 0,
    movementIntensity: 0,   // 0–1
    movementPoints: [],     // [{ id, x, y, strength, moving }] x,y are 0–1 in SCREEN space (mirroring already applied)
    camera: { status: 'off', message: '', mirror: C.CAMERA_MIRROR, simulate: false,
              panelOpen: C.CAMERA_PANEL_OPEN_AT_START, panelSlide: C.CAMERA_PANEL_OPEN_AT_START ? 1 : 0,   // side-tab collapsible panel (ui/cameraTab.js)
              monitorMode: C.CAMERA_MONITOR_MODE,        // 'hidden' | 'minimal' | 'debug' — cycled with C (ui/cameraMonitor.js)
              frames: 0, lastFrameAt: 0,
              motionFraction: 0, threshold: 0, analysisFps: 0, size: { w: 0, h: 0 } },
    people: [],             // the same people in SCREEN px, with velocity and body size — refreshed each frame (visuals/presence.js)

    // Touch
    touchPoints: [],        // [{ x, y }] every finger currently on the water (screen px) — the flow and warmth read these
    // ---- the installation's own explicit state (kept simple; animation is driven by these) ----
    mode: 'ambient',                         // ambient | thoughtEntry | revealing | dragging | printing  (see updateMode)
    activeThoughtId: null,
    activePointers: new Map(),               // pointer id → pointer (every finger / virtual pointer on the water)
    isDraggingThought: false,
    draggedThoughtId: null,
    printArmed: false,                       // a carried thought has reached the approach line (PRINT_ZONE_START_RATIO)
    entryWaves: [],         // Thought waves travelling in from the button (visuals/entryWave.js)
    thoughtOrigin: null,    // {x, y} screen px: where the Thought button meets the water (set from the DOM); null = left edge, mid-height
    flow: null,             // the shared water flow (visuals/flow.js), set at start-up
    collectiveTouchMode: false,
    collectiveAmount: 0,    // 0–1, eased; drives the warm palette
    forceCollective: false, // dev toggle (C key)
    lastTouchTime: 0,       // for the idle hint

    connectionCount: 0,     // active feeling connections (debug readout)
    // Connections between thoughts that share a group / feeling — key "idA|idB"
    connections: new Map(),

    // Taking a thought
    drag: { active: false, count: 0, inZone: false },
    printZone: { visible: 0, hover: 0, flash: 0, approach: 0 },
    printLockUntil: 0,

    palette: null,
    paletteMix: 0,

    debug: { enabled: C.DEBUG_AT_START && !C.INSTALLATION_MODE },
    printer: { mode: C.PRINTER_MODE, status: 'idle', count: 0, lastJobId: null, lastResult: null, lastReceipt: '' },
  };
  if (activateAll) for (const t of state.allThoughts) activateThought(state, t);
  updatePalette(state);
  return state;
}

export function resizeView(state, w, h, dpr) {
  state.view.w = w;
  state.view.h = h;
  state.view.dpr = dpr;
  state.view.scale = Math.min(w / 1920, h / 1080);
}

/** Put every active thought back under the water (R key). */
export function resetThoughts(state) {
  for (const t of state.thoughts) {
    t.state = THOUGHT_STATE.SUBMERGED;
    t.sharpness = 0;
    t.revealed = false;
    t.revealStartTime = null;
    t.readableSince = null;
    t.lastInteractionTime = -Infinity;
    t.isBeingEngaged = false;
    t.cooldownUntil = 0;
    t.washDir = 0;
    t.connectionGlow = 0;
    t.revealedAt = null;
    t.isDragging = false;
    t.printed = false;
    t.helperAlpha = 0;
    t.idle = 0;
    t.presence = 1;
    t.entryReveal = 1;
    t.px = t.homeX;
    t.py = t.homeY;
  }
  state.connections.clear();
  state.connectionCount = 0;
  state.drag = { active: false, count: 0, inZone: false };
}

/**
 * Keep the installation-level state explicit and predictable. Call once per frame after the interactions have run.
 *   ambient       nothing in particular is happening
 *   thoughtEntry  a new thought is travelling in / emerging (Thought button)
 *   revealing     someone's attention is bringing a thought into focus
 *   dragging      a readable thought is being carried
 *   printing      a thought was released in the print zone and is settling (one print, then back to ambient)
 */
export function updateMode(state, pointerList = []) {
  state.activePointers.clear();
  for (const p of pointerList) state.activePointers.set(p.id, p);
  let dragged = null, printing = null, entering = null, revealing = null;
  for (const t of state.thoughts) {
    if (t.state === THOUGHT_STATE.DRAGGING) dragged = t;
    else if (t.state === THOUGHT_STATE.PRINTING) printing = t;
    else if (t.state === THOUGHT_STATE.ENTERING) entering = t;
    else if ((t.state === THOUGHT_STATE.REVEALING || t.state === THOUGHT_STATE.REVEALED) && t.isBeingEngaged) revealing = revealing && revealing.sharpness > t.sharpness ? revealing : t;
  }
  state.isDraggingThought = !!dragged;
  state.draggedThoughtId = dragged ? dragged.id : null;
  if (!dragged) state.printArmed = false;
  const active = printing || dragged || entering || revealing;
  state.mode = printing ? 'printing' : dragged ? 'dragging' : entering ? 'thoughtEntry' : revealing ? 'revealing' : 'ambient';
  state.activeThoughtId = active ? active.id : null;
  return state.mode;
}
