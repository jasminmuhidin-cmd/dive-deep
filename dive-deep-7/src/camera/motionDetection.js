// ---------------------------------------------------------------------------
// motionDetection.js — presence and movement from tiny grayscale frames.
//
// Pure: no DOM, no camera. Give it frames (Uint8 grayscale, ~96×72), get back
// "people" — regions with a position, an amount of movement, and a stable id.
//
// What makes it "refined" rather than a plain frame-difference:
//   • exposure compensation — the median brightness shift between frames (webcam auto-exposure, a cloud,
//     someone switching a lamp) is subtracted before anything is compared, so lighting drift can't mask or fake movement;
//   • a short motion history — a moving person's difference image is mostly an outline; remembering it for ~0.4 s
//     turns the outline into a solid silhouette, so one body becomes one steady region with a believable box;
//   • CAMERA_SENSITIVITY scales every threshold at once (1.3 = notices fainter / smaller movement);
//   • each person carries a smoothed bounding box and a velocity, which the water uses (wakes point the way they walk).
//
// How it stays calm and reliable:
//   • frames are blurred, so sensor speckle never counts;
//   • two comparisons: against the PREVIOUS frame (movement) and against a slowly
//     learned BACKGROUND (presence — a person who stands still is still there);
//   • thresholds adapt upward with measured noise (a noisy webcam is not "movement");
//   • if most of the frame changes at once it's lighting / auto-exposure, and is ignored;
//   • small specks are discarded; regions that belong to one body are merged;
//   • regions are tracked over time with hold-time, so a person doesn't flicker in
//     and out of existence, and a person only counts after persisting briefly.
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function createMotionDetector(options = {}) {
  const cfg = {
    sensitivity: C.CAMERA_SENSITIVITY,
    motionThreshold: C.MOTION_THRESHOLD,
    presenceThreshold: C.PRESENCE_THRESHOLD,
    mhiDecay: C.MOTION_HISTORY_DECAY,
    noiseFactor: C.MOTION_NOISE_FACTOR,
    globalChange: C.GLOBAL_CHANGE_FRACTION,
    minBlob: C.MIN_BLOB_AREA,
    mergeDistance: C.BLOB_MERGE_DISTANCE,
    assocDistance: C.TRACK_ASSOC_DISTANCE,
    trackHold: C.TRACK_HOLD_SECONDS,
    minTrackAge: C.MIN_TRACK_AGE,
    maxPeople: C.MAX_PEOPLE,
    learnRate: C.BACKGROUND_LEARN_RATE,
    moveMinEnergy: C.MOVEMENT_MIN_ENERGY,
    ...options,
  };

  let w = 0, h = 0, N = 0;
  let cur, prev, bg, tmp, motion, pres, dil, labels, stack, mhi, mhiMask;
  let frames = 0;
  let noise = 1.5;
  let intensity = 0;
  const tracks = [];
  let nextId = 1;
  const hist = new Uint32Array(256);
  const histS = new Uint32Array(511);          // signed differences, for exposure compensation

  /** Median of a signed-difference histogram (offset 255), clamped: the frame's overall brightness shift. */
  function medianShift(limit) {
    let acc = 0;
    for (let v = 0; v < 511; v++) { acc += histS[v]; if (acc >= N / 2) return Math.max(-limit, Math.min(limit, v - 255)); }
    return 0;
  }

  const debug = { width: 0, height: 0, motion: null, presence: null, blobs: [], suppressed: false };
  const result = { tracks: [], personCount: 0, movementIntensity: 0, motionFraction: 0, threshold: 0, suppressed: false };

  function alloc(nw, nh) {
    w = nw; h = nh; N = w * h;
    cur = new Float32Array(N); prev = new Float32Array(N); bg = new Float32Array(N); tmp = new Float32Array(N);
    motion = new Uint8Array(N); pres = new Uint8Array(N); dil = new Uint8Array(N);
    mhi = new Float32Array(N); mhiMask = new Uint8Array(N);
    labels = new Int32Array(N); stack = new Int32Array(N);
    debug.width = w; debug.height = h; debug.motion = mhiMask; debug.presence = pres;
    frames = 0; tracks.length = 0; intensity = 0;
  }

  /** 3×3 box blur of a Uint8 frame into `cur`. */
  function blur(gray) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const l = x > 0 ? x - 1 : x, r = x < w - 1 ? x + 1 : x;
        tmp[row + x] = (gray[row + l] + gray[row + x] + gray[row + r]) / 3;
      }
    }
    for (let y = 0; y < h; y++) {
      const u = (y > 0 ? y - 1 : y) * w, m = y * w, d = (y < h - 1 ? y + 1 : y) * w;
      for (let x = 0; x < w; x++) cur[m + x] = (tmp[u + x] + tmp[m + x] + tmp[d + x]) / 3;
    }
  }

  function process(gray, width, height, now) {
    if (width !== w || height !== h) alloc(width, height);
    blur(gray);

    if (frames === 0) {                       // first frame: learn the scene
      bg.set(cur); prev.set(cur); frames++;
      return publish(now, false, 0, 0);
    }

    // --- movement (vs previous frame) and its noise floor -------------------------------
    hist.fill(0); histS.fill(0);
    for (let i = 0; i < N; i++) {
      const d = cur[i] - prev[i];
      const a = d < 0 ? -d : d;
      hist[a > 255 ? 255 : a | 0]++;
      histS[(d + 255.5) | 0]++;
    }
    let acc = 0, median = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= N / 2) { median = v; break; } }
    noise += (median - noise) * 0.05;
    const sens = Math.max(0.3, cfg.sensitivity);
    const motionT = Math.max(cfg.motionThreshold / sens, cfg.noiseFactor * noise + 6);
    const presT = Math.max(cfg.presenceThreshold / sens, cfg.noiseFactor * noise + 12);

    // a sudden whole-frame change (lighting / exposure jump) is judged on the RAW difference
    let rawCount = 0;
    for (let i = 0; i < N; i++) if (Math.abs(cur[i] - prev[i]) > motionT) rawCount++;
    if (rawCount / N > cfg.globalChange) {
      bg.set(cur); prev.set(cur); mhi.fill(0); mhiMask.fill(0);
      motion.fill(0); pres.fill(0);
      return publish(now, true, rawCount / N, motionT);
    }

    // …otherwise the median brightness shift (auto-exposure creep) is removed before comparing
    const expo = medianShift(25);
    let motionCount = 0;
    for (let i = 0; i < N; i++) {
      const m = Math.abs(cur[i] - prev[i] - expo) > motionT ? 1 : 0;
      motion[i] = m; motionCount += m;
    }
    const motionFrac = motionCount / N;

    // --- presence (vs slowly learned background), and background upkeep ------------------
    histS.fill(0);
    for (let i = 0; i < N; i++) histS[(cur[i] - bg[i] + 255.5) | 0]++;
    const bgShift = medianShift(40);
    for (let i = 0; i < N; i++) {
      const isFg = Math.abs(cur[i] - bg[i] - bgShift) > presT;
      pres[i] = isFg ? 1 : 0;
      bg[i] += (cur[i] - bg[i]) * (isFg ? cfg.learnRate : 0.05);   // a motionless person is absorbed only very slowly
    }
    prev.set(cur);
    frames++;

    // --- motion history: outlines fill in to a silhouette that lingers ~0.4 s ---------------------
    const decay = cfg.mhiDecay;
    for (let i = 0; i < N; i++) {
      const v = motion[i] ? 1 : mhi[i] * decay;
      mhi[i] = v; mhiMask[i] = v > 0.32 ? 1 : 0;
    }

    // --- regions -----------------------------------------------------------------------
    for (let i = 0; i < N; i++) tmp[i] = mhiMask[i] | pres[i];      // union, reusing tmp as a mask
    dil.fill(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!tmp[y * w + x]) continue;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx >= 0 && xx < w) dil[yy * w + xx] = 1; }
        }
      }
    }
    labels.fill(0);
    const comps = [];
    let label = 0;
    for (let start = 0; start < N; start++) {
      if (!dil[start] || labels[start]) continue;
      label++;
      let sp = 0; stack[sp++] = start; labels[start] = label;
      const c = { area: 0, motionPx: 0, sx: 0, sy: 0, minX: w, minY: h, maxX: 0, maxY: 0 };
      while (sp) {
        const i = stack[--sp]; const x = i % w, y = (i / w) | 0;
        if (tmp[i]) {
          c.area++; c.motionPx += motion[i]; c.sx += x; c.sy += y;
          if (x < c.minX) c.minX = x; if (x > c.maxX) c.maxX = x; if (y < c.minY) c.minY = y; if (y > c.maxY) c.maxY = y;
        }
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= w) continue;
            const j = yy * w + xx;
            if (dil[j] && !labels[j]) { labels[j] = label; stack[sp++] = j; }
          }
        }
      }
      if (c.area >= cfg.minBlob * N) comps.push(c);        // size is not affected by sensitivity: sensitivity is about contrast, not about specks
    }

    // merge regions that are probably one body (torso + arm, two halves of a person)
    const md = cfg.mergeDistance * w;
    let merged = true;
    while (merged) {
      merged = false;
      outer: for (let a = 0; a < comps.length; a++) {
        for (let b = a + 1; b < comps.length; b++) {
          const A = comps[a], B = comps[b];
          if (Math.hypot(A.sx / A.area - B.sx / B.area, A.sy / A.area - B.sy / B.area) < md) {
            A.area += B.area; A.motionPx += B.motionPx; A.sx += B.sx; A.sy += B.sy;
            A.minX = Math.min(A.minX, B.minX); A.minY = Math.min(A.minY, B.minY);
            A.maxX = Math.max(A.maxX, B.maxX); A.maxY = Math.max(A.maxY, B.maxY);
            comps.splice(b, 1); merged = true; break outer;
          }
        }
      }
    }
    comps.sort((a, b) => b.area - a.area);
    const blobs = comps.slice(0, cfg.maxPeople).map((c) => ({
      x: c.sx / c.area, y: c.sy / c.area, area: c.area / N,
      energy: clamp01((3 * c.motionPx) / c.area),
      box: { x0: c.minX / w, y0: c.minY / h, x1: (c.maxX + 1) / w, y1: (c.maxY + 1) / h },
    }));

    track(blobs, now);
    intensity += (clamp01(motionFrac * 8) - intensity) * 0.15;
    debug.blobs = blobs.map((b) => b.box);
    debug.motionPixels = motionCount;
    return publish(now, false, motionFrac, motionT);
  }

  /** Match this frame's regions to known people; new ones start a track, missing ones linger then vanish. */
  function track(blobs, now) {
    const used = new Set();
    const pairs = [];
    for (const t of tracks) for (let j = 0; j < blobs.length; j++) {
      const d = Math.hypot(t.px - blobs[j].x, t.py - blobs[j].y);
      if (d <= cfg.assocDistance * w) pairs.push({ t, j, d });
    }
    pairs.sort((a, b) => a.d - b.d);
    const matched = new Set();
    for (const p of pairs) {
      if (matched.has(p.t) || used.has(p.j)) continue;
      matched.add(p.t); used.add(p.j);
      const b = blobs[p.j];
      const dtT = Math.max(0.02, now - p.t.lastSeen);
      const nx = p.t.px + (b.x - p.t.px) * 0.6, ny = p.t.py + (b.y - p.t.py) * 0.6;
      p.t.vx += (((nx - p.t.px) / w) / dtT - p.t.vx) * 0.35;      // fraction of frame width / height per second
      p.t.vy += (((ny - p.t.py) / h) / dtT - p.t.vy) * 0.35;
      p.t.px = nx; p.t.py = ny;
      for (const k of ['x0', 'y0', 'x1', 'y1']) p.t.box[k] += (b.box[k] - p.t.box[k]) * 0.45;   // a steady, un-jittery box
      p.t.energy += (b.energy - p.t.energy) * 0.5;
      p.t.area = b.area; p.t.lastSeen = now; p.t.present = true;
    }
    for (let j = 0; j < blobs.length; j++) {
      if (used.has(j)) continue;
      tracks.push({ id: nextId++, px: blobs[j].x, py: blobs[j].y, energy: blobs[j].energy, area: blobs[j].area,
                    vx: 0, vy: 0, box: { ...blobs[j].box }, born: now, lastSeen: now, present: true });
    }
    for (let i = tracks.length - 1; i >= 0; i--) {
      const t = tracks[i];
      if (!matched.has(t) && t.lastSeen !== now) { t.present = false; t.energy *= 0.7; t.vx *= 0.8; t.vy *= 0.8; }
      if (now - t.lastSeen > cfg.trackHold) tracks.splice(i, 1);
    }
  }

  function publish(now, suppressed, motionFrac, threshold) {
    if (suppressed) for (const t of tracks) { t.present = false; t.energy *= 0.7; }
    const people = tracks.filter((t) => now - t.born >= cfg.minTrackAge).slice(0, cfg.maxPeople);
    result.tracks = people.map((t) => ({
      id: t.id, x: t.px / w, y: t.py / h, area: t.area, energy: t.energy, vx: t.vx, vy: t.vy, box: { ...t.box },
      moving: t.present && t.energy >= cfg.moveMinEnergy, present: t.present, age: now - t.born,
    }));
    result.personCount = people.length;
    result.movementIntensity = intensity;
    result.motionFraction = motionFrac;
    result.threshold = threshold;
    result.suppressed = suppressed;
    debug.suppressed = suppressed;
    return result;
  }

  return { process, debug, get noise() { return noise; }, reset() { frames = 0; tracks.length = 0; intensity = 0; } };
}
