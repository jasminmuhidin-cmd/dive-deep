// ---------------------------------------------------------------------------
// placement.js — where a thought goes in the water.
//
// Thoughts are scattered at random (never listed), but with "best-candidate"
// sampling: for each new thought we try several random spots and keep the one
// farthest from everything already there. The result looks organic yet avoids
// heavy overlap. Pure functions — no DOM, easy to test.
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';

/** The space a thought occupies for spacing purposes: its words plus a little air. */
export function footprint(t, scale, spacing = 1) {
  const sp = t.sprite;
  return {
    w: ((sp ? sp.textW : 320 * scale) * 0.7 + 10 * scale) * spacing,     // the words' core (× spacing for the air kept around it)
    h: ((sp ? sp.textH : 110 * scale) * 0.95 + 14 * scale) * spacing,
  };
}

/** The rectangle in which a thought's CENTRE may sit (clear of the left control and the print zone). */
export function placementBounds(view, halfW, halfH) {
  const s = view.scale;
  let left = C.LEFT_CONTROL_RESERVE * s + halfW;
  let right = view.w - C.PLACEMENT_EDGE_MARGIN * s - halfW;
  let top = C.PLACEMENT_EDGE_MARGIN * s + halfH;
  let bottom = view.h * (1 - C.PRINT_ZONE_HEIGHT) - 16 * s - halfH;
  if (right < left) left = right = (left + right) / 2;      // very small windows: centre it
  if (bottom < top) top = bottom = (top + bottom) / 2;
  return { left, right, top, bottom };
}

/** < 1 means the two footprints overlap; larger = more space between them. */
export function separation(ax, ay, fa, bx, by, fb) {
  return Math.max(Math.abs(ax - bx) / ((fa.w + fb.w) / 2), Math.abs(ay - by) / ((fa.h + fb.h) / 2));
}

/**
 * Choose a spot for `thought` among the thoughts already in the water.
 * @returns {{px:number, py:number, score:number}} score = separation from the nearest neighbour
 */
export function findPlacement({ view, thought, others, rng = Math.random, attempts = C.PLACEMENT_ATTEMPTS }) {
  const f = footprint(thought, view.scale);
  const fs = footprint(thought, view.scale, C.PLACEMENT_SPACING);      // spacing footprint: generous air between words
  const b = placementBounds(view, f.w / 2, f.h / 2);
  const neighbours = others.map((o) => ({ x: o.px, y: o.py, f: footprint(o, view.scale, C.PLACEMENT_SPACING) }));

  let best = null;
  for (let i = 0; i < attempts; i++) {
    const px = b.left + (b.right - b.left) * rng();
    const py = b.top + (b.bottom - b.top) * rng();
    let score = Infinity;
    for (const n of neighbours) score = Math.min(score, separation(px, py, fs, n.x, n.y, n.f));
    const jittered = score * (0.96 + 0.08 * rng());          // keeps the pattern from looking regular
    if (!best || jittered > best.score) best = { px, py, score: jittered };
  }
  return best;
}

/** How crowded is a layout? Used by tests and the debug overlay. */
export function overlapStats(thoughts, scale) {
  let pairs = 0, overlapping = 0, worst = Infinity;
  for (let i = 0; i < thoughts.length; i++) {
    for (let j = i + 1; j < thoughts.length; j++) {
      const a = thoughts[i], b = thoughts[j];
      const sep = separation(a.px, a.py, footprint(a, scale), b.px, b.py, footprint(b, scale));
      pairs++;
      if (sep < 1) overlapping++;
      worst = Math.min(worst, sep);
    }
  }
  return { pairs, overlapping, worst };
}
