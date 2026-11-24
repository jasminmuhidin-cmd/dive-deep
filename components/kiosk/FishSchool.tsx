"use client";

import { useEffect, useRef } from "react";
import { FRILL, TAIL_RAYS } from "./frillyFish";
import { seeded } from "./seeded";

/**
 * Schooling frilly fish, drawn to a canvas that fills its parent.
 *
 * The movement is Saskia's (components/MobileApp/Boids.tsx on her site):
 * Reynolds flocking — match neighbours' heading, drift toward their centre,
 * keep apart — plus a slow private wander, and an optional ring ("goal") the
 * school mills around. The tail beats faster the harder a fish swims, and the
 * veil tail and fins sway a beat behind the head.
 */

const BODY_LENGTH = 58;
const NEIGHBOUR = 70;
const SEPARATION = 1.3;

export type Goal = { x: number; y: number; rx: number; ry: number };

type Boid = {
  x: number; y: number; vx: number; vy: number;
  size: number; alpha: number; phase: number; lane: number; swim: number;
};

export default function FishSchool({
  seed = "kiosk",
  count = 40,
  size = [10, 20],
  speed = 80,
  colour = "#ffffff",
  opacity = 0.5,
  wrap = true,
  fill = true,
  goal,
  className = "",
}: {
  seed?: string;
  count?: number;
  size?: [number, number];
  /** Cruising speed in px/s */
  speed?: number;
  colour?: string;
  opacity?: number;
  wrap?: boolean;
  fill?: boolean;
  /** Ring to mill around (in canvas px), given the canvas size and time; null = roam */
  goal?: (w: number, h: number, t: number) => Goal | null;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const opts = useRef({ speed, colour, wrap, goal, opacity });
  useEffect(() => {
    opts.current = { speed, colour, wrap, goal, opacity };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const part = {
      body: new Path2D(FRILL.body),
      tail: new Path2D(FRILL.tail),
      tailInner: new Path2D(FRILL.tailInner),
      dorsal: new Path2D(FRILL.dorsal),
      anal: new Path2D(FRILL.anal),
      pectoral: new Path2D(FRILL.pectoral),
      rays: new Path2D(TAIL_RAYS.map((y) => `M64 30Q86 ${30 + (y - 30) * 0.5} 108 ${y}`).join("")),
    };

    let w = 1, h = 1, dpr = 1;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const boids: Boid[] = Array.from({ length: count }, (_, i) => {
      const key = `${seed}-${i}`;
      const heading = seeded(key, 2) * Math.PI * 2;
      return {
        x: seeded(key) * w,
        y: seeded(key, 1) * h,
        vx: Math.cos(heading) * speed,
        vy: Math.sin(heading) * speed * 0.4,
        size: size[0] + seeded(key, 3) * (size[1] - size[0]),
        alpha: 0.55 + seeded(key, 4) * 0.4,
        phase: seeded(key, 5) * Math.PI * 2,
        lane: fill ? 0.3 + seeded(key, 6) * 0.75 : 1,
        swim: seeded(key, 5) * Math.PI * 2,
      };
    });

    const step = (dt: number, t: number) => {
      const { speed, wrap, goal } = opts.current;
      const g = goal?.(w, h, t) ?? null;
      for (const b of boids) {
        let ax = 0, ay = 0, n = 0, avx = 0, avy = 0, cx = 0, cy = 0, sx = 0, sy = 0;
        const sight = Math.max(NEIGHBOUR, b.size * 2.5);
        for (const o of boids) {
          if (o === b) continue;
          const dx = o.x - b.x, dy = o.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > sight * sight) continue;
          n++; avx += o.vx; avy += o.vy; cx += dx; cy += dy;
          const keep = ((b.size + o.size) / 2) * SEPARATION;
          if (d2 < keep * keep && d2 > 0) {
            const d = Math.sqrt(d2);
            const push = (keep - d) / keep;
            sx -= (dx / d) * push;
            sy -= (dy / d) * push;
          }
        }
        if (n > 0) {
          ax += (avx / n - b.vx) * 1.4;
          ay += (avy / n - b.vy) * 1.4;
          ax += (cx / n) * 0.9;
          ay += (cy / n) * 0.9;
        }
        ax += sx * speed * 9;
        ay += sy * speed * 9;
        ax += Math.cos(t * 0.7 + b.phase) * speed * 0.35;
        ay += Math.sin(t * 0.5 + b.phase * 1.3) * speed * 0.25;
        if (g) {
          const nx = (b.x - g.x) / g.rx, ny = (b.y - g.y) / g.ry;
          const r = Math.hypot(nx, ny) || 1;
          const tx = (-ny / r) * g.rx, ty = (nx / r) * g.ry;
          const tl = Math.hypot(tx, ty) || 1;
          const pull = Math.max(-1.5, Math.min(1.5, r - b.lane));
          const dvx = (tx / tl) * speed - (nx / r) * pull * speed * 1.6;
          const dvy = (ty / tl) * speed - (ny / r) * pull * speed * 1.6;
          ax += (dvx - b.vx) * 2.2;
          ay += (dvy - b.vy) * 2.2;
        }
        b.vx += ax * dt;
        b.vy += ay * dt;
        const v = Math.hypot(b.vx, b.vy) || 1;
        const c = Math.max(speed * 0.5, Math.min(speed * 1.6, v));
        b.vx = (b.vx / v) * c;
        b.vy = (b.vy / v) * c;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.swim += dt * (5 + (c / speed) * 3);
        if (wrap) {
          const m = b.size * 2;
          if (b.x < -m) b.x += w + m * 2; else if (b.x > w + m) b.x -= w + m * 2;
          if (b.y < -m) b.y += h + m * 2; else if (b.y > h + m) b.y -= h + m * 2;
        }
      }
    };

    const swung = (ox: number, oy: number, a: number, paint: () => void) => {
      ctx.save(); ctx.translate(ox, oy); ctx.rotate(a); ctx.translate(-ox, -oy); paint(); ctx.restore();
    };
    const skewed = (ox: number, oy: number, kx: number, ky: number, paint: () => void) => {
      ctx.save(); ctx.translate(ox, oy); ctx.transform(1, ky, kx, 1, 0, 0); ctx.translate(-ox, -oy); paint(); ctx.restore();
    };

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const { colour } = opts.current;
      ctx.fillStyle = colour;
      ctx.strokeStyle = colour;
      for (const b of boids) {
        const m = b.size * 2;
        if (b.x < -m || b.x > w + m || b.y < -m || b.y > h + m) continue;
        const heading = Math.atan2(b.vy, b.vx);
        const s = b.size / BODY_LENGTH;
        const beat = Math.sin(b.swim);
        const a = b.alpha;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(heading + beat * 0.05);
        ctx.scale(-s, Math.cos(heading) < 0 ? -s : s);
        ctx.translate(-37, -30);
        const stroke = Math.sin(b.swim - 1.1);
        const depth = 0.6 + 0.4 * Math.abs(Math.cos(b.swim - 1.1));
        swung(60, 30, -stroke * 0.26, () =>
          skewed(62, 30, 0, Math.sin(b.swim - 1.8) * 0.12, () => {
            ctx.translate(60, 30); ctx.scale(depth, 1); ctx.translate(-60, -30);
            ctx.globalAlpha = a * 0.38;
            ctx.fill(part.tail);
            if (b.size >= 20) { ctx.globalAlpha = a * 0.5; ctx.lineWidth = 0.6; ctx.stroke(part.rays); }
          }),
        );
        swung(60, 30, -Math.sin(b.swim - 1.7) * 0.3, () => { ctx.globalAlpha = a * 0.4; ctx.fill(part.tailInner); });
        const frill = Math.sin(b.swim * 0.55);
        ctx.globalAlpha = a * 0.45;
        skewed(40, 18, frill * 0.15, 0, () => ctx.fill(part.dorsal));
        skewed(44, 44, -frill * 0.15, 0, () => ctx.fill(part.anal));
        ctx.globalAlpha = a * 0.85;
        ctx.fill(part.body);
        ctx.globalAlpha = a * 0.55;
        swung(24, 33, Math.sin(b.swim * 0.8) * 0.12, () => ctx.fill(part.pectoral));
        ctx.restore();
      }
    };

    let raf = 0;
    let last = performance.now();
    const t0 = last;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduced) step(dt, (now - t0) / 1000);
      draw();
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // The school is created once; live props flow through `opts`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      style={{ opacity, transition: "opacity 1.2s ease" }}
      aria-hidden
    />
  );
}
