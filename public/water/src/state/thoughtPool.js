// ---------------------------------------------------------------------------
// thoughtPool.js — which thoughts are in the water right now.
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import { activateThought, createThought, THOUGHT_STATE as S } from './installationState.js';
import { findPlacement, footprint } from '../layout/placement.js';

export function createThoughtPool(state, { ensureSprite, releaseSprite = () => {}, rng = Math.random } = {}) {
  const recent = [];

  const inactive = () => state.allThoughts.filter((t) => !t.active);
  const settled = () => state.thoughts.filter((t) => !t.retiring);

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function setPosition(t, px, py) {
    const { w, h } = state.view;
    t.px = t.homeX = px;
    t.py = t.homeY = py;
    t.x = px / w;
    t.y = py / h;
  }

  function activate(t) {
    ensureSprite(t);
    const { w, h } = state.view;
    if (t.fixed) {
      setPosition(t, t.x * w, t.y * h);
    } else {
      const spot = findPlacement({ view: state.view, thought: t, others: settled(), rng });
      setPosition(t, spot.px, spot.py);
    }
    activateThought(state, t);
    t.timesShown += 1;
    return t;
  }

  function activateInitial(n = C.INITIAL_ACTIVE_THOUGHTS) {
    const chosen = shuffle(inactive()).slice(0, n);
    for (const t of chosen) ensureSprite(t);
    const area = (t) => {
      const f = footprint(t, state.view.scale);
      return f.w * f.h;
    };
    chosen.sort((a, b) => area(b) - area(a));
    for (const t of chosen) activate(t);
    return chosen;
  }

  function retireOldestQuiet() {
    const quiet = settled()
      .filter((t) => t.state === S.SUBMERGED && !t.isBeingEngaged)
      .sort((a, b) => (a.activatedAt ?? 0) - (b.activatedAt ?? 0));
    if (!quiet.length) return null;
    quiet[0].retiring = true;
    return quiet[0];
  }

  function makeRoom() {
    while (settled().length >= C.MAX_ACTIVE_THOUGHTS) if (!retireOldestQuiet()) break;
  }

  function pickNext() {
    const waiting = inactive();
    if (!waiting.length) return null;
    const fewest = Math.min(...waiting.map((t) => t.timesShown));
    const pool = waiting.filter((t) => t.timesShown === fewest && !recent.includes(t.id));
    const pickFrom = pool.length ? pool : waiting.filter((t) => t.timesShown === fewest);
    const t = pickFrom[Math.floor(rng() * pickFrom.length)];
    recent.push(t.id);
    while (recent.length > C.RECENT_THOUGHT_MEMORY) recent.shift();
    return t;
  }

  function introduce() {
    makeRoom();
    let t = pickNext();
    if (t) return activate(t);

    const quiet = settled()
      .filter((x) => x.state === S.SUBMERGED && !x.isBeingEngaged)
      .sort((a, b) => (a.activatedAt ?? 0) - (b.activatedAt ?? 0))[0];
    if (!quiet) return null;
    ensureSprite(quiet);
    const spot = findPlacement({
      view: state.view,
      thought: quiet,
      others: settled().filter((o) => o !== quiet),
      rng,
    });
    setPosition(quiet, spot.px, spot.py);
    quiet.activatedAt = state.time.now;
    return quiet;
  }

  /**
   * Inject a kiosk ripple into the dataset, then activate it for entry animation.
   * Idempotent on id — if already active, returns null.
   */
  function injectExternal(def) {
    if (!def?.id || !def?.text) return null;
    let t = state.allThoughts.find((x) => x.id === def.id);
    if (t?.active) return null;
    if (!t) {
      t = createThought(
        {
          id: def.id,
          text: def.text,
          theme: def.theme ?? 'unspecified',
          feelingTag: def.feelingTag ?? 'quiet',
          connectionGroup: def.connectionGroup ?? def.theme ?? 'shared',
          source: def.source ?? 'kiosk',
        },
        state.allThoughts.length,
      );
      t.anonymousCode = def.anonymousCode ?? null;
      state.allThoughts.push(t);
    } else {
      t.text = def.text;
      t.theme = def.theme ?? t.theme;
      t.feelingTag = def.feelingTag ?? t.feelingTag;
      t.connectionGroup = def.connectionGroup ?? t.connectionGroup;
      t.anonymousCode = def.anonymousCode ?? t.anonymousCode;
      t.source = def.source ?? t.source ?? 'kiosk';
    }
    makeRoom();
    return activate(t);
  }

  function update(dt) {
    for (const t of [...state.thoughts]) {
      if (!t.retiring) continue;
      t.presence -= dt / C.RETIRE_FADE_TIME;
      if (t.presence > 0) continue;
      state.thoughts.splice(state.thoughts.indexOf(t), 1);
      t.active = false;
      t.retiring = false;
      t.state = S.INACTIVE;
      t.sharpness = 0;
      t.presence = 1;
      if (!t.fixed) {
        t.x = null;
        t.y = null;
      }
      releaseSprite(t);
    }
  }

  return {
    activate,
    activateInitial,
    introduce,
    injectExternal,
    update,
    inactive,
    pickNext,
    retireOldestQuiet,
    makeRoom,
  };
}
