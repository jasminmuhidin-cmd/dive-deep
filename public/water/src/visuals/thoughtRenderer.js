// ---------------------------------------------------------------------------
// thoughtRenderer.js — draws thoughts as text embedded in the water.
//
// Rendering only: it reads thought state, it never changes it.
//
// Each ACTIVE thought's text is rendered once into a few pre-blurred sprites
// (BLUR_LEVELS; the blurriest are stored at half resolution to save memory).
// Sprites exist only while a thought is in the water, so a large dataset costs
// nothing extra. Every frame the sprite is drawn in thin horizontal slices, each
// nudged sideways by a slow wave and cross-faded between blur levels; sharpness
// varies by height, so a band of water appears to pass over the words as they
// emerge or sink — never a plain opacity fade.
//
// Extra behaviours (all motion, no labels):
//   • a newly entered thought surfaces from the centre of its ripple (radial mask)
//   • large ripples passing through stir the words and make them glimmer faintly
//   • as attention drifts (`idle`) the words begin to shimmer
//   • a visible thought's ring breathes
//   • the words are embedded in the moving water: they drift a few px with the local current
//     (TEXT_DRIFT_AMOUNT; readable words keep about a third of it), their blur breathes slightly,
//     and the faint shadow beneath — the DEEP layer — moves on its own slower rhythm (parallax)
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import { THOUGHT_STATE as S } from '../state/installationState.js';
import { clamp01, lerp, smoothstep } from '../utils/math.js';
import { rgba } from './palette.js';
import { drawPrinterIcon } from './icons.js';

const WASH_SPREAD = 0.7; // how much of the text height the wash band covers
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 2);

// ---- sprite building --------------------------------------------------------
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function blurredCopy(source, blurDevicePx, res) {
  const c = makeCanvas(source.width * res, source.height * res);
  const cx = c.getContext('2d');
  cx.filter = `blur(${blurDevicePx * res}px)`;
  cx.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

let measureCtx = null;

function buildSprite(t, state) {
  measureCtx = measureCtx || makeCanvas(4, 4).getContext('2d');
  const { scale, dpr } = state.view;
  const fontPx = Math.max(10, Math.round(C.THOUGHT_FONT_SIZE * scale));
  const lineH = fontPx * C.THOUGHT_LINE_HEIGHT;
  measureCtx.font = `${fontPx}px ${C.THOUGHT_FONT_FAMILY}`;

  const lines = wrapLines(measureCtx, t.text, C.THOUGHT_MAX_TEXT_WIDTH * scale);
  const textW = Math.max(...lines.map((l) => measureCtx.measureText(l).width));
  const textH = lines.length * lineH;
  const pad = Math.ceil(Math.max(...C.BLUR_LEVELS) * scale * 2 + 12 * scale);
  const w = Math.ceil(textW + pad * 2);
  const h = Math.ceil(textH + pad * 2);

  const sharp = makeCanvas(w * dpr, h * dpr);
  const sc = sharp.getContext('2d');
  sc.scale(dpr, dpr);
  sc.font = `${fontPx}px ${C.THOUGHT_FONT_FAMILY}`;
  sc.textAlign = 'center';
  sc.textBaseline = 'middle';
  sc.fillStyle = C.THOUGHT_TEXT_COLOR;
  sc.shadowColor = 'rgba(10, 40, 90, 0.85)';   // a deep-blue halo keeps the words readable over the cream bands
  sc.shadowBlur = 9 * scale * dpr;
  lines.forEach((line, i) => sc.fillText(line, w / 2, pad + lineH * (i + 0.5)));

  const res = C.BLUR_LEVELS.map((b) => (b >= 8 ? 0.5 : 1));                 // heavy blur hides resolution
  const levels = C.BLUR_LEVELS.map((b, i) => (b === 0 ? sharp : blurredCopy(sharp, b * scale * dpr, res[i])));
  t.sprite = { w, h, pad, textW, textH, dpr, scale, levels, res };
  t.ringRadius = Math.hypot(textW / 2, textH / 2) + C.THOUGHT_RIPPLE_MARGIN * scale;
}

/** Make sure a thought has an up-to-date sprite (needed before placement, which uses its size). */
export function ensureSprite(t, state) {
  if (t.sprite && t.sprite.dpr === state.view.dpr && t.sprite.scale === state.view.scale) return t.sprite;
  buildSprite(t, state);
  return t.sprite;
}

export function releaseSprite(t) {
  t.sprite = null;
}

/** Rebuild every active sprite and re-derive pixel positions from the normalised x / y (window resized). */
export function buildThoughtSprites(state) {
  const { w, h } = state.view;
  for (const t of state.thoughts) {
    buildSprite(t, state);
    if (t.x === null || t.y === null) continue;
    const halfW = t.sprite.w / 2 - t.sprite.pad * 0.5;
    const halfH = t.sprite.h / 2 - t.sprite.pad * 0.5;
    t.px = Math.min(w - halfW, Math.max(halfW, t.x * w));
    t.py = Math.min(h - halfH, Math.max(halfH, t.y * h));
    t.homeX = t.px;
    t.homeY = t.py;
  }
}

// ---- drawing ------------------------------------------------------------------
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {number} now seconds
 * @param {import('./ripple.js').RippleSystem} [ripples] big ripples stir the thoughts they pass through
 */
export function drawThoughts(ctx, state, now, ripples = null) {
  // Faintest first so the most readable (or carried) thought is always on top.
  const rank = (t) => t.sharpness + (t.isDragging ? 10 : 0);
  const order = [...state.thoughts].sort((a, b) => rank(a) - rank(b));
  const dpr = state.view.dpr;
  for (const t of order) {
    if (!t.sprite) continue;
    const inf = ripples ? ripples.influenceAt(t.px, t.py) : { wobble: 0, glimmer: 0 };
    drawPresence(ctx, t, state, now);
    if (t.state === S.ENTERING) drawEntryDisturbance(ctx, t, state, now);

    // Move with the water: a few px of drift, most when submerged, a third of it once readable.
    // (Snapped to device pixels so the slices of the text never show seams.)
    let dx = 0, dy = 0;
    if (state.flow && !t.isDragging) {
      state.flow.textDrift(t.px, t.py, driftTmp);
      const keep = 1 - 0.65 * smoothstep(t.sharpness);
      dx = Math.round(driftTmp.x * keep * dpr) / dpr;
      dy = Math.round(driftTmp.y * keep * dpr) / dpr;
    }
    ctx.save();
    ctx.translate(dx, dy);
    drawRing(ctx, t, state, now, inf);
    drawText(ctx, t, state, now, inf);
    if (t.helperAlpha > 0.01) drawTakeHelper(ctx, t, state, now);
    ctx.restore();
  }
}
const driftTmp = { x: 0, y: 0 };

/** "take this thought with you [print icon]" — small, quiet, just under the words. */
function drawTakeHelper(ctx, t, state, now) {
  const { scale } = state.view;
  const fontPx = Math.max(9, Math.round(C.THOUGHT_FONT_SIZE * scale * 0.56));
  const a = t.helperAlpha;
  const y = t.py + t.sprite.textH / 2 + 30 * scale + Math.sin(now * 0.5 + t.phase) * 1.2 * scale;

  ctx.save();
  ctx.font = `italic ${fontPx}px ${C.THOUGHT_FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const textW = ctx.measureText(C.TAKE_HELPER_TEXT).width;
  const iconW = fontPx * 1.9;                 // the printer icon is clearly visible next to the words
  const gap = fontPx * 0.8;
  const x0 = t.px - (textW + gap + iconW) / 2;

  ctx.globalAlpha = 0.9 * a;
  ctx.shadowColor = 'rgba(10, 40, 90, 0.85)';
  ctx.shadowBlur = 5 * scale * state.view.dpr;
  ctx.fillStyle = C.THOUGHT_TEXT_COLOR;
  ctx.fillText(C.TAKE_HELPER_TEXT, x0, y);
  drawPrinterIcon(ctx, x0 + textW + gap + iconW / 2, y - fontPx * 0.05, iconW, C.THOUGHT_TEXT_COLOR);   // (keeps the soft shadow so it reads on the water)
  ctx.restore();
}

/** A soft shadow-shape under the surface: something is there, but not what. */
function drawPresence(ctx, t, state, now) {
  const e = smoothstep(t.sharpness);
  const breathe = 0.85 + 0.15 * Math.sin(now * 0.4 + t.phase);
  const a = (0.11 * (1 - e) + 0.34 * e) * breathe * t.presence;      // a soft deep-blue pool behind readable words keeps them legible over glints
  if (a < 0.01) return;
  const r = t.ringRadius * 1.05 * (1 + 0.03 * Math.sin(now * 0.11 + t.phase * 1.7));
  // The deep layer drifts on its own, slower rhythm — the shadow is not pinned beneath the words
  const { scale } = state.view;
  const cx = t.px + Math.sin(now * 0.085 + t.phase) * 6 * scale;
  const cy = t.py + Math.sin(now * 0.062 + t.phase * 1.3) * 3.5 * scale;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(24, 70, 140, ${a})`);
  g.addColorStop(1, 'rgba(24, 70, 140, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}

/** The first moment of a new thought: a tiny, still disturbance before the ripple opens. */
function drawEntryDisturbance(ctx, t, state, now) {
  const tau = now - t.entryStart - (t.entryTravel || 0);
  const D = C.ENTRY_DISTURB_TIME;
  if (tau < 0 || tau > D + 1.4) return;
  const { scale } = state.view;
  const p = clamp01(tau / D);
  const fade = tau < D ? 1 : 1 - (tau - D) / 1.4;
  const light = state.palette.light;

  const g = ctx.createRadialGradient(t.px, t.py, 0, t.px, t.py, 46 * scale);   // a shallow dimple in the water
  g.addColorStop(0, `rgba(24, 70, 140, ${0.2 * Math.sin(Math.PI * Math.min(1, p * 1.1)) * fade})`);
  g.addColorStop(1, 'rgba(24, 70, 140, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(t.px - 46 * scale, t.py - 46 * scale, 92 * scale, 92 * scale);

  ctx.lineWidth = 1.3 * Math.max(0.7, scale);
  for (const [k, a] of [[1, 0.5], [0.55, 0.32]]) {
    ctx.beginPath();
    ctx.arc(t.px, t.py, (5 + 40 * easeOut(p)) * k * scale, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(light, a * fade);
    ctx.stroke();
  }
}

/**
 * The thought's own circular ripple — its boundary. It breathes while the thought is
 * visible; while a new thought is entering it grows outward from the centre.
 */
function drawRing(ctx, t, state, now, inf) {
  const entering = t.state === S.ENTERING;
  const e = smoothstep(t.sharpness);
  const strength = entering ? Math.min(1, t.entryReveal * 0.85) : e;
  if (strength < 0.02) return;

  const { scale } = state.view;
  const glow = 1 + C.CONNECTION_RING_GLOW * t.connectionGlow;        // linked thoughts' ripples resonate
  const size = entering ? 0.3 + 0.7 * easeOut(t.entryReveal) : 0.8 + 0.2 * e;
  let breath = 1 + 0.012 * Math.sin(now * 0.9 + t.phase);            // always a hint of life…
  if ((t.state === S.REVEALING || t.state === S.REVEALED) && t.revealStartTime !== null) {
    // …and while attended to, a slow visible breath: small at the start of each cycle, largest as the pulse leaves.
    breath = 1 - C.BREATH_AMPLITUDE * Math.cos((2 * Math.PI * (now - t.revealStartTime)) / C.BREATH_PERIOD) * e;
  }
  const dim = 1 - 0.4 * t.idle;                                       // fades gently as attention drifts
  const base = t.ringRadius * size * breath;
  const rings = [
    { k: 1.0, alpha: 0.32, width: 1.6 },
    { k: 1.09, alpha: 0.17, width: 1.2 },
    { k: 1.2, alpha: 0.08, width: 1.0 },
  ];
  ctx.lineJoin = 'round';
  for (const ring of rings) {
    const r0 = base * ring.k;
    ctx.beginPath();
    const steps = 72;
    for (let s = 0; s <= steps; s++) {
      const a = (s / steps) * Math.PI * 2;
      const wob = Math.sin(3 * a + now * 0.5 + t.phase) * 2.2 + Math.sin(5 * a - now * 0.33 + t.phase * 1.7) * 1.4;
      const rr = r0 + wob * scale * (strength + inf.wobble * 2);
      const x = t.px + Math.cos(a) * rr;
      const y = t.py + Math.sin(a) * rr;
      if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = rgba(state.palette.light, Math.min(1, ring.alpha * strength * glow * dim));
    ctx.lineWidth = ring.width * Math.max(0.7, scale);
    ctx.stroke();
  }
}

// One shared scratch canvas for the emerging-from-centre mask (only one thought enters at a time).
let layer = null;
function getLayer(w, h) {
  if (!layer) layer = { canvas: document.createElement('canvas'), ctx: null };
  if (layer.canvas.width !== w || layer.canvas.height !== h) { layer.canvas.width = w; layer.canvas.height = h; }
  layer.ctx = layer.canvas.getContext('2d');
  return layer;
}

function drawText(ctx, t, state, now, inf) {
  const sp = t.sprite;
  const { scale } = state.view;
  const dpr = sp.dpr;
  const s = t.sharpness;
  const e = smoothstep(s);

  // Faint shape beneath the surface; a passing thought/collective ripple makes it glimmer (still unreadable).
  const base = C.SUBMERGED_ALPHA * t.presence + inf.glimmer * 0.3 * (1 - e) * t.presence;
  let alpha = lerp(base, 1, e) * (s < 0.5 ? 0.9 + 0.1 * Math.sin(now * 0.5 + t.phase) : 1);
  if (alpha < 0.01) return;

  const bob = (Math.sin(now * 0.35 + t.phase) * 2.5 + inf.wobble * 3 * Math.sin(now * 2.1 + t.phase)) * scale * (1 - e);
  const y0 = Math.round((t.py - sp.h / 2 + bob) * dpr) / dpr;    // snap to device pixels: no seams
  const x0 = t.px - sp.w / 2;

  if (t.state === S.ENTERING && t.entryReveal < 0.999) {
    // Surface from the centre of the ripple: paint into a scratch layer, mask it with a soft
    // circle that grows from the middle outward, then lay it on the water.
    const lyr = getLayer(sp.levels[0].width, sp.levels[0].height);
    const lctx = lyr.ctx;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, lyr.canvas.width, lyr.canvas.height);
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintSlices(lctx, t, state, now, inf, alpha, 0, 0);
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    const R = easeOut(t.entryReveal) * (Math.hypot(sp.textW / 2, sp.textH / 2) * 1.15 + 24 * scale) * dpr;
    const soft = Math.max(30 * scale * dpr, R * 0.4);
    const g = lctx.createRadialGradient(lyr.canvas.width / 2, lyr.canvas.height / 2, Math.max(0, R - soft),
                                        lyr.canvas.width / 2, lyr.canvas.height / 2, Math.max(1, R));
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.globalCompositeOperation = 'destination-in';
    lctx.fillStyle = g;
    lctx.fillRect(0, 0, lyr.canvas.width, lyr.canvas.height);
    lctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(lyr.canvas, 0, 0, lyr.canvas.width, lyr.canvas.height, x0, y0, lyr.canvas.width / dpr, lyr.canvas.height / dpr);
    return;
  }
  paintSlices(ctx, t, state, now, inf, alpha, x0, y0);
}

/** Draw the sprite as water-distorted slices onto `target`, with its top-left at (x0, y0) in CSS px. */
function paintSlices(target, t, state, now, inf, alpha, x0, y0) {
  const sp = t.sprite;
  const { scale } = state.view;
  const dpr = sp.dpr;
  const s = t.sharpness;
  const e = smoothstep(s);
  const maxLevel = sp.levels.length - 1;

  const sliceDev = Math.max(2, Math.round(lerp(9, 3, e) * dpr)); // thicker slices are fine when very blurred
  // Readable text is nearly still — a hair of movement so it still belongs to the water — and stirs
  // when a big ripple passes and as attention drifts.
  const ampBase = (lerp(7, 0.4, e * e) + inf.wobble * 4.5 + t.idle * 2.4) * scale;

  const total = sp.levels[0].height;
  const destW = sp.levels[0].width / dpr;
  for (let sy = 0; sy < total; sy += sliceDev) {
    const sh = Math.min(sliceDev, total - sy);
    const yCss = sy / dpr;
    const yN = clamp01((yCss + sh / dpr / 2 - sp.pad) / sp.textH); // 0 = top of text, 1 = bottom

    // Wash: local clarity varies with height, so a band sweeps down the text.
    const g = lerp(yN, 1 - yN, t.washDir);
    const local = clamp01(s * (1 + WASH_SPREAD) - WASH_SPREAD * g);
    // The water's depth over the words changes a little from moment to moment: the blur breathes.
    const breathe = 0.22 * (1 - e) * (0.5 + 0.5 * Math.sin(now * 0.4 + t.phase + yCss * 0.011));
    const pos = Math.max(0, (1 - smoothstep(local)) * maxLevel - breathe);   // 0 = sharp … maxLevel = blurriest
    const lo = Math.min(maxLevel - 1, Math.floor(pos));
    const f = pos - lo;                                      // 0..1 toward the blurrier level

    // Sideways ripple of the water; strongest inside the passing band.
    const band = 4 * local * (1 - local);
    const amp = ampBase * (1 + 1.4 * band);
    const dx = amp * (Math.sin(yCss * 0.05 + now * 0.7 + t.phase) +
                      0.55 * Math.sin(yCss * 0.021 - now * 0.45 + t.phase * 1.7));

    target.globalAlpha = alpha;
    drawSlice(target, sp, lo + 1, sy, sh, x0 + dx, y0 + yCss, destW, dpr);
    if (f < 0.995) {
      target.globalAlpha = alpha * (1 - f);
      drawSlice(target, sp, lo, sy, sh, x0 + dx, y0 + yCss, destW, dpr);
    }
  }
  target.globalAlpha = 1;
}

function drawSlice(target, sp, level, sy, sh, dx, dy, destW, dpr) {
  const lv = sp.levels[level];
  const r = sp.res[level];                     // half-resolution levels sample a proportionally smaller source rect
  target.drawImage(lv, 0, sy * r, lv.width, sh * r, dx, dy, destW, sh / dpr);
}
