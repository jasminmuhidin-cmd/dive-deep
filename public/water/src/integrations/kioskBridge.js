// ---------------------------------------------------------------------------
// kioskBridge.js — listen for Next.js kiosk ripples and inject them into the water.
// Uses poll (reliable in Electron) with optional EventSource when available.
// ---------------------------------------------------------------------------

import { DEFAULT_API_URL } from '../config/urls.js';

const DEFAULT_API = DEFAULT_API_URL;
const POLL_MS = 2500;

/**
 * @param {{
 *   entry: { pressExternal: (def: object) => object|null },
 *   state: object,
 *   apiBase?: string,
 *   printThought?: (thought: object) => Promise<unknown>,
 * }} opts
 */
export function startKioskBridge({ entry, state, apiBase, printThought }) {
  const base = (apiBase || DEFAULT_API).replace(/\/$/, '');
  let since = new Date().toISOString();
  const seen = new Set();

  async function ingest(thoughts) {
    if (!Array.isArray(thoughts)) return;
    for (const def of thoughts) {
      if (!def?.id || seen.has(def.id)) continue;
      seen.add(def.id);
      const t = entry.pressExternal(def);
      if (t) {
        state.lastTouchTime = state.time.now;
        console.info('[kioskBridge] ripple entered:', def.id, def.text?.slice?.(0, 48));
        // Every kiosk prompt prints a receipt (privacy: text can stay submerged)
        if (typeof printThought === 'function' && !t.printed) {
          t.printed = true;
          t.printCount = (t.printCount || 0) + 1;
          Promise.resolve(printThought(t))
            .then((res) => {
              if (res && res.ok === false) t.printed = false;
              else console.info('[kioskBridge] receipt printed for', def.id);
            })
            .catch((err) => {
              t.printed = false;
              console.warn('[kioskBridge] print failed:', err?.message || err);
            });
        }
      }
    }
  }

  async function poll() {
    try {
      const url = `${base}/api/ripples/pending?since=${encodeURIComponent(since)}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (data.serverTime) since = data.serverTime;
      await ingest(data.thoughts);
    } catch (err) {
      // Next.js may not be running during projection-only testing
      if (!state._kioskBridgeWarned) {
        console.warn('[kioskBridge] cannot reach kiosk API at', base, '—', String(err?.message || err));
        state._kioskBridgeWarned = true;
      }
    }
  }

  // Seed seen ids so we don't re-inject the whole archive on first poll
  fetch(`${base}/api/ripples/pending?since=${encodeURIComponent(since)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data?.serverTime) since = data.serverTime;
      for (const t of data?.thoughts || []) seen.add(t.id);
    })
    .catch(() => {});

  const pollId = setInterval(poll, POLL_MS);

  let es = null;
  try {
    es = new EventSource(`${base}/api/events`);
    es.addEventListener('ripple', (ev) => {
      try {
        const def = JSON.parse(ev.data);
        ingest([def]);
        since = new Date().toISOString();
      } catch {
        // ignore
      }
    });
  } catch {
    // EventSource unavailable
  }

  return {
    stop() {
      clearInterval(pollId);
      es?.close?.();
    },
  };
}
