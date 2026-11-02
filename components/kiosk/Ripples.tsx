"use client";

import { useEffect, useRef } from "react";

/**
 * Faint rings spreading out from a point (default: the middle of the screen),
 * like the projection's water where a thought surfaces. A new ring every few
 * seconds plus the odd small drop elsewhere — calm, never busy.
 */
export default function Ripples({
  cx = 0.5,
  cy = 0.5,
  every = 3.2,
  strength = 0.16,
  rgb = "255,255,255",
}: {
  cx?: number;
  cy?: number;
  /** Seconds between rings from the centre */
  every?: number;
  /** Peak ring opacity (keep low) */
  strength?: number;
  /** Ring colour as "r,g,b" */
  rgb?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 1, h = 1, dpr = 1;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    type Ring = { x: number; y: number; born: number; life: number; max: number; a: number };
    const rings: Ring[] = [];
    const t0 = performance.now() / 1000;
    let nextMain = 0, nextDrop = 2;

    const drawStatic = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const m = Math.min(w, h);
      for (let i = 1; i <= 4; i++) {
        ctx.strokeStyle = `rgba(${rgb},${strength * (1 - i / 5)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(w * cx, h * cy, m * 0.12 * i, m * 0.12 * i * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    };
    if (reduced) {
      drawStatic();
      return () => ro.disconnect();
    }

    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const t = performance.now() / 1000 - t0;
      const m = Math.min(w, h);
      if (t >= nextMain) {
        rings.push({ x: w * cx, y: h * cy, born: t, life: 9, max: m * 0.62, a: strength });
        nextMain = t + every;
      }
      if (t >= nextDrop) {
        rings.push({
          x: w * (0.1 + Math.random() * 0.8), y: h * (0.15 + Math.random() * 0.75),
          born: t, life: 5, max: m * 0.14, a: strength * 0.6,
        });
        nextDrop = t + 2.5 + Math.random() * 3;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1.2;
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i]!;
        const k = (t - r.born) / r.life;
        if (k >= 1) { rings.splice(i, 1); continue; }
        const ease = 1 - Math.pow(1 - k, 2.2);
        const rad = 8 + r.max * ease;
        const alpha = r.a * Math.sin(Math.PI * Math.min(1, k * 1.15)) * (1 - k);
        ctx.strokeStyle = `rgba(${rgb},${alpha.toFixed(3)})`;
        ctx.beginPath();
        // flattened: we look across the water, not down on it
        ctx.ellipse(r.x, r.y, rad, rad * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [cx, cy, every, strength, rgb]);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}
