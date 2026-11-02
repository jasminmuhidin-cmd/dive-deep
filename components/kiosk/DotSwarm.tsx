"use client";

import { useEffect, useRef } from "react";
/** Simple fish in a 120 × 62 box, facing left (body, forked tail, fins). */
const FISH = {
  body: "M6 31C14 14 40 8 62 14C74 18 82 24 86 31C82 38 74 44 62 48C40 54 14 48 6 31Z",
  tail: "M82 31L116 7C111 19 109 26 109 31C109 36 111 43 116 55Z",
  dorsal: "M32 14C40 3 56 0 68 4C61 8 58 12 57 16Z",
  pectoral: "M30 35C37 39 41 45 39 52C34 48 30 43 28 39Z",
};

/**
 * "Your thought is taking shape": the visitor's words appear as dots, the dots
 * break away and swirl like a school of fish, then gather into a halftone
 * fish (dot size = how much of the fish covers that cell, like the
 * dotted-figure reference) that swims gently in place.
 *
 *   0.0–1.0 s  words as dots
 *   1.0–3.2 s  swirl
 *   3.2–5.0 s  gather into the fish
 *   5.0 s +    the fish swims
 */

type P = { tx: number; ty: number; fx: number; fy: number; fr: number; ang: number; rad: number; spd: number; ph: number };

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export default function DotSwarm({ text, colour = "#ffffff" }: { text: string; colour?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    // --- the fish as a halftone grid -----------------------------------
    const off = document.createElement("canvas");
    off.width = Math.ceil(w);
    off.height = Math.ceil(h);
    const o = off.getContext("2d", { willReadFrequently: true })!;
    const fishW = Math.min(w * 0.62, h * 0.95);
    const s = fishW / 120;
    const cx = w / 2, cy = h * 0.52;
    o.save();
    o.translate(cx + (60 * s), cy - 31 * s);
    o.scale(-s, s); // face right, toward the next screen's reading direction
    o.fillStyle = "#fff";
    // A clear, simple fish silhouette (facing left in its box): fins lighter
    // than the body so the halftone shows the shape; the eye left empty.
    o.globalAlpha = 0.55;
    o.fill(new Path2D(FISH.tail));
    o.fill(new Path2D(FISH.dorsal));
    o.fill(new Path2D(FISH.pectoral));
    o.globalAlpha = 1;
    o.fill(new Path2D(FISH.body));
    o.globalCompositeOperation = "destination-out";
    o.beginPath();
    o.arc(20, 27, 3.4, 0, Math.PI * 2);
    o.fill();
    o.globalCompositeOperation = "source-over";
    o.restore();
    const g = Math.max(9, Math.round(fishW / 34));
    const fishPx = o.getImageData(0, 0, off.width, off.height).data;
    const fish: [number, number, number][] = [];
    for (let y = g / 2; y < h; y += g)
      for (let x = g / 2; x < w; x += g) {
        let cov = 0, n = 0;
        for (let yy = -g / 2 + 1; yy < g / 2; yy += 2)
          for (let xx = -g / 2 + 1; xx < g / 2; xx += 2) {
            const px = Math.round(x + xx), py = Math.round(y + yy);
            if (px < 0 || py < 0 || px >= off.width || py >= off.height) continue;
            cov += fishPx[(py * off.width + px) * 4 + 3]! / 255;
            n++;
          }
        cov /= Math.max(1, n);
        if (cov > 0.06) fish.push([x, y, g * 0.4 * Math.sqrt(cov) * (0.75 + 0.25 * Math.random())]);
      }

    // --- the words as dots --------------------------------------------
    o.clearRect(0, 0, off.width, off.height);
    const fontPx = Math.round(Math.min(w / 18, 40));
    o.font = `700 ${fontPx}px Georgia, serif`;
    o.textAlign = "center";
    o.textBaseline = "middle";
    o.fillStyle = "#fff";
    const words = text.trim().split(/\s+/).slice(0, 18);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const t = line ? `${line} ${word}` : word;
      if (o.measureText(t).width > w * 0.7 && line) { lines.push(line); line = word; } else line = t;
    }
    if (line) lines.push(line);
    lines.slice(0, 4).forEach((l, i, arr) => o.fillText(l, cx, cy + (i - (arr.length - 1) / 2) * fontPx * 1.3));
    const textPx = o.getImageData(0, 0, off.width, off.height).data;
    const words2: [number, number][] = [];
    const tg = 4;
    for (let y = 0; y < h; y += tg)
      for (let x = 0; x < w; x += tg) if (textPx[(Math.floor(y) * off.width + Math.floor(x)) * 4 + 3]! > 120) words2.push([x, y]);
    if (!words2.length) words2.push([cx, cy]);

    const ps: P[] = fish.map(([fx, fy, fr], i) => {
      const [tx, ty] = words2[Math.floor((i / fish.length) * words2.length)]!;
      const a = Math.random() * Math.PI * 2;
      return {
        tx, ty, fx, fy, fr,
        ang: a,
        rad: Math.min(w, h) * (0.12 + Math.random() * 0.3),
        spd: (0.6 + Math.random() * 0.8) * (Math.random() < 0.5 ? 1 : 1.15),
        ph: Math.random() * Math.PI * 2,
      };
    });

    const t0 = performance.now();
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const t = reduced ? 6 : (performance.now() - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = colour;
      const kSwirl = ease((t - 1.0) / 1.0); // words → swirl
      const kFish = ease((t - 3.2) / 1.8); // swirl → fish
      const appear = ease(t / 0.8);
      const swimX = Math.sin(t * 0.6) * w * 0.02;
      for (const p of ps) {
        // swirl: each dot circles the centre on its own lane, like a milling school
        const a = p.ang + t * p.spd * 0.9;
        const wob = Math.sin(t * 1.7 + p.ph) * 14;
        const sx = cx + Math.cos(a) * (p.rad + wob);
        const sy = cy + Math.sin(a) * (p.rad + wob) * 0.62;
        let x = p.tx + (sx - p.tx) * kSwirl;
        let y = p.ty + (sy - p.ty) * kSwirl;
        // fish: settle into the halftone, then swim — the tail (left side) waves
        const tail = Math.max(0, (cx - p.fx) / (fishW * 0.5));
        const fx = p.fx + swimX;
        const fy = p.fy + Math.sin(t * 3 - (p.fx - cx) * 0.02) * tail * 10 * kFish;
        x += (fx - x) * kFish;
        y += (fy - y) * kFish;
        const rad = 1.6 + (p.fr - 1.6) * kFish;
        ctx.globalAlpha = appear * (0.55 + 0.45 * kFish);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.6, rad), 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [text, colour]);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}
