"use client";

import { useEffect, useRef } from "react";
import { motion, type MotionValue } from "framer-motion";
import { mosaicFromPaths } from "./dotMosaic";
import { FRILL } from "./frillyFish";
import { seeded } from "./seeded";

/** The frilly fish's body (no fins) is ~58 units long, centred near (37, 30), facing left */
const BODY_LENGTH = 58;

type Boid = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Body length in px — the veil tail trails about as far again behind */
  size: number;
  alpha: number;
  phase: number;
  /** Which ring of the mill it keeps to (1 = the goal's edge), so a milling school fills out into a ball */
  lane: number;
  /** Tail-beat phase — runs faster the harder the fish swims */
  swim: number;
};

/** An ellipse the flock mills around, in screen px */
type Goal = { x: number; y: number; rx: number; ry: number };

type FlockOptions = {
  seed: string;
  count: number;
  size: [number, number];
  /** Cruising speed in px/s */
  speed: number;
  colour: MotionValue<string>;
  opacity: MotionValue<number>;
  /** Where each fish starts, given the viewport */
  spawn: (w: number, h: number, i: number) => { x: number; y: number };
  /** Wrap around the screen edges (ambient schools) instead of roaming free */
  wrap?: boolean;
  /** Ring to circle around, if any */
  goal?: (w: number, h: number) => Goal | null;
  /** Spread fish across inner rings too, so the mill fills out into a ball */
  fill?: boolean;
};

/** The frilly fish's drawing box, in its own units */
const FRILL_BOX = { w: 120, h: 62 };

/** Background dots are drawn this much smaller than the mosaic's own, so the gaps between them show from afar */
const DOT_SHRINK = 0.68;

/**
 * Each part of the fish as a halftone dot grid (like every other creature on
 * the dive), gathered into one path so a whole part still fills in one go.
 * `step` is the dot pitch in the fish's units.
 */
function dottedPart(path: string, step: number, seed: string): Path2D {
  const dots = new Path2D();
  for (const { x, y, r } of mosaicFromPaths([path], { ...FRILL_BOX, step, seed })) {
    const dot = r * DOT_SHRINK;
    dots.moveTo(x + dot, y);
    dots.arc(x, y, dot, 0, Math.PI * 2);
  }
  return dots;
}

/**
 * Dot pitch, in the fish's units, for each band of fish length (px) — so
 * whatever its size, a fish's dots land about 4px apart on screen.
 */
const DOT_BANDS: { from: number; step: number }[] = [
  { from: 28, step: 7.5 },
  { from: 22, step: 10 },
  { from: 0, step: 13 },
];

/** How far a fish looks for schoolmates, at least — bigger fish see further */
const NEIGHBOUR = 70;
const SEPARATION = 1.3; // × combined body length

/**
 * Reynolds flocking — each fish steers to match its neighbours' heading,
 * drift toward their centre and keep out of each other's way, drawn as dot
 * mosaics to a full-screen canvas.
 */
function useFlock(canvasRef: React.RefObject<HTMLCanvasElement | null>, opts: FlockOptions) {
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dotted = (step: number) => ({
      body: dottedPart(FRILL.body, step, "school-body"),
      tail: dottedPart(FRILL.tail, step, "school-tail"),
      tailInner: dottedPart(FRILL.tailInner, step * 0.8, "school-tail-inner"),
      dorsal: dottedPart(FRILL.dorsal, step, "school-dorsal"),
      anal: dottedPart(FRILL.anal, step, "school-anal"),
      pectoral: dottedPart(FRILL.pectoral, step * 0.7, "school-pectoral"),
    });
    const bands = DOT_BANDS.map(({ from, step }) => ({ from, part: dotted(step) }));
    let w = window.innerWidth;
    let h = window.innerHeight;
    let dpr = Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const { seed, count, size, speed, spawn, fill } = optsRef.current;
    const boids: Boid[] = Array.from({ length: count }, (_, i) => {
      const key = `${seed}-${i}`;
      const { x, y } = spawn(w, h, i);
      const heading = seeded(key, 2) * Math.PI * 2;
      return {
        x,
        y,
        vx: Math.cos(heading) * speed,
        vy: Math.sin(heading) * speed * 0.4,
        size: size[0] + seeded(key, 3) * (size[1] - size[0]),
        alpha: 0.55 + seeded(key, 4) * 0.4,
        phase: seeded(key, 5) * Math.PI * 2,
        lane: fill ? 0.3 + seeded(key, 6) * 0.75 : 1,
        swim: seeded(key, 5) * Math.PI * 2,
      };
    });

    let raf = 0;
    let last = performance.now();
    let cleared = false;

    const step = (dt: number) => {
      const { speed, wrap, goal } = optsRef.current;
      const g = goal?.(w, h) ?? null;

      for (const b of boids) {
        let ax = 0;
        let ay = 0;
        let n = 0;
        let avx = 0;
        let avy = 0;
        let cx = 0;
        let cy = 0;
        let sx = 0;
        let sy = 0;

        const sight = Math.max(NEIGHBOUR, b.size * 2.5);
        for (const o of boids) {
          if (o === b) continue;
          const dx = o.x - b.x;
          const dy = o.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > sight * sight) continue;
          n++;
          avx += o.vx;
          avy += o.vy;
          cx += dx;
          cy += dy;
          const keep = ((b.size + o.size) / 2) * SEPARATION;
          if (d2 < keep * keep && d2 > 0) {
            const d = Math.sqrt(d2);
            const push = (keep - d) / keep;
            sx -= (dx / d) * push;
            sy -= (dy / d) * push;
          }
        }

        if (n > 0) {
          ax += (avx / n - b.vx) * 1.4; // alignment
          ay += (avy / n - b.vy) * 1.4;
          ax += (cx / n) * 0.9; // cohesion
          ay += (cy / n) * 0.9;
        }
        ax += sx * speed * 9; // separation
        ay += sy * speed * 9;

        // A slow private wander, so lone fish don't swim dead straight.
        const t = performance.now() / 1000;
        ax += Math.cos(t * 0.7 + b.phase) * speed * 0.35;
        ay += Math.sin(t * 0.5 + b.phase * 1.3) * speed * 0.25;

        if (g) {
          // Mill around the ring: swim along it, and ease back onto it if off.
          const nx = (b.x - g.x) / g.rx;
          const ny = (b.y - g.y) / g.ry;
          const r = Math.hypot(nx, ny) || 1;
          const tx = (-ny / r) * g.rx;
          const ty = (nx / r) * g.ry;
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
        const clamped = Math.max(speed * 0.5, Math.min(speed * 1.6, v));
        b.vx = (b.vx / v) * clamped;
        b.vy = (b.vy / v) * clamped;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        // Beat the tail faster the faster it's going
        b.swim += dt * (5 + (clamped / speed) * 3);

        if (wrap) {
          const m = b.size * 2;
          if (b.x < -m) b.x += w + m * 2;
          else if (b.x > w + m) b.x -= w + m * 2;
          if (b.y < -m) b.y += h + m * 2;
          else if (b.y > h + m) b.y -= h + m * 2;
        }
      }
    };

    /** Swing a part about its root by `angle`, draw it, and put the transform back */
    const swung = (ox: number, oy: number, angle: number, paint: () => void) => {
      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(angle);
      ctx.translate(-ox, -oy);
      paint();
      ctx.restore();
    };

    /** Skew a fin about its base by `k`, draw it, and put the transform back */
    const skewed = (ox: number, oy: number, kx: number, ky: number, paint: () => void) => {
      ctx.save();
      ctx.translate(ox, oy);
      ctx.transform(1, ky, kx, 1, 0, 0);
      ctx.translate(-ox, -oy);
      paint();
      ctx.restore();
    };

    // Light along the back, shadow under the belly, in the fish's own units
    const shade = ctx.createLinearGradient(0, 12, 0, 48);
    shade.addColorStop(0, "rgba(255,255,255,0.45)");
    shade.addColorStop(0.35, "rgba(255,255,255,0)");
    shade.addColorStop(0.65, "rgba(11,29,51,0)");
    shade.addColorStop(1, "rgba(11,29,51,0.4)");

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const colour = optsRef.current.colour.get();
      ctx.fillStyle = colour;
      ctx.strokeStyle = colour;
      for (const b of boids) {
        const m = b.size * 2;
        if (b.x < -m || b.x > w + m || b.y < -m || b.y > h + m) continue;
        const heading = Math.atan2(b.vy, b.vx);
        const s = b.size / BODY_LENGTH;
        const beat = Math.sin(b.swim);
        const a = b.alpha;
        const { part } = bands.find(({ from }) => b.size >= from) ?? bands[bands.length - 1];
        ctx.save();
        ctx.translate(b.x, b.y);
        // The head yaws against the tail stroke, so the whole body swims
        ctx.rotate(heading + beat * 0.05);
        // The fish faces left: mirror it to face the heading, keeping the belly down.
        ctx.scale(-s, Math.cos(heading) < 0 ? -s : s);
        ctx.translate(-37, -30);

        // Veil tail sweeps from the tail root a beat behind the head, flexing
        // as it goes; the inner layer lags further for a layered ripple
        const stroke = Math.sin(b.swim - 1.1);
        // broadside mid-stroke, foreshortened as it swings toward or away from you
        const depth = 0.6 + 0.4 * Math.abs(Math.cos(b.swim - 1.1));
        swung(60, 30, -stroke * 0.26, () =>
          skewed(62, 30, 0, Math.sin(b.swim - 1.8) * 0.12, () => {
            ctx.translate(60, 30);
            ctx.scale(depth, 1);
            ctx.translate(-60, -30);
            ctx.globalAlpha = a * 0.5;
            ctx.fill(part.tail);
          }),
        );
        swung(60, 30, -Math.sin(b.swim - 1.7) * 0.3, () => {
          ctx.globalAlpha = a * 0.55;
          ctx.fill(part.tailInner);
        });
        const frill = Math.sin(b.swim * 0.55);
        ctx.globalAlpha = a * 0.6;
        skewed(40, 18, frill * 0.15, 0, () => ctx.fill(part.dorsal));
        skewed(44, 44, -frill * 0.15, 0, () => ctx.fill(part.anal));
        ctx.globalAlpha = a;
        ctx.fill(part.body);
        ctx.fillStyle = shade;
        ctx.fill(part.body);
        ctx.fillStyle = colour;
        ctx.globalAlpha = a * 0.55;
        swung(24, 33, Math.sin(b.swim * 0.8) * 0.12, () => ctx.fill(part.pectoral));
        ctx.restore();
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const { opacity } = optsRef.current;

      // Nothing to show: skip the work, but keep the fish where they are.
      if (opacity.get() < 0.01) {
        if (!cleared) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          cleared = true;
        }
        return;
      }
      cleared = false;

      if (!reduced) step(dt);
      draw();
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [canvasRef]);
}

/** Loose schools roaming behind everything, on their own course whatever the scroll */
export function AmbientFlock({
  colour,
  opacity,
}: {
  colour: MotionValue<string>;
  opacity: MotionValue<number>;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useFlock(ref, {
    seed: "ambient",
    count: 36,
    // big enough that each fish's dots can be made out
    size: [18, 34],
    speed: 70,
    colour,
    opacity,
    wrap: true,
    // four schools to start with, each bunched round its own spot, so they read as schools straight away
    spawn: (w, h, i) => {
      const school = i % 4;
      return {
        x: (seeded(`school-${school}`) * 0.8 + 0.1) * w + (seeded(`ambient-${i}`) - 0.5) * 70,
        y: (seeded(`school-${school}`, 1) * 0.8 + 0.1) * h + (seeded(`ambient-${i}`, 1) - 0.5) * 50,
      };
    },
  });

  return (
    <motion.canvas
      ref={ref}
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      style={{ opacity }}
      aria-hidden
    />
  );
}

