"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Category, Submission } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/types";

const CATEGORY_COLORS: Record<Category, string> = {
  environment: "#7d9b7a",
  community: "#c4a484",
  future: "#8fa3b8",
  belonging: "#b8927a",
  economy: "#9a8b7a",
  unspecified: "#5eb0c0",
};

const CATEGORY_ANCHORS: Record<Category, { x: number; y: number }> = {
  environment: { x: 0.22, y: 0.32 },
  community: { x: 0.5, y: 0.28 },
  future: { x: 0.78, y: 0.35 },
  belonging: { x: 0.35, y: 0.68 },
  economy: { x: 0.68, y: 0.7 },
  unspecified: { x: 0.5, y: 0.5 },
};

interface Node {
  id: string;
  submission: Submission;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
}

const SPOTLIGHT_MS = 20_000;
const POLL_MS = 5_000;

export default function ProjectionCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const spotlightIndexRef = useRef(0);
  const [spotlight, setSpotlight] = useState<Submission | null>(null);
  const [count, setCount] = useState(0);
  const knownIdsRef = useRef<Set<string>>(new Set());

  const upsertSubmissions = useCallback((list: Submission[]) => {
    const canvas = canvasRef.current;
    const w = canvas?.width || 1200;
    const h = canvas?.height || 800;

    for (const submission of list) {
      if (knownIdsRef.current.has(submission.id)) continue;
      knownIdsRef.current.add(submission.id);

      const anchor = CATEGORY_ANCHORS[submission.category];
      const jitter = () => (Math.random() - 0.5) * 120;

      nodesRef.current.push({
        id: submission.id,
        submission,
        x: anchor.x * w + jitter(),
        y: anchor.y * h + jitter(),
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        radius: 5 + Math.random() * 4,
        phase: Math.random() * Math.PI * 2,
      });
    }

    setCount(nodesRef.current.length);
  }, []);

  const loadSubmissions = useCallback(async () => {
    try {
      const res = await fetch("/api/submissions");
      if (!res.ok) return;
      const data = (await res.json()) as Submission[];
      upsertSubmissions(data);
    } catch {
      // poll will retry
    }
  }, [upsertSubmissions]);

  useEffect(() => {
    loadSubmissions();
    const poll = window.setInterval(loadSubmissions, POLL_MS);

    const es = new EventSource("/api/events");
    es.addEventListener("submission", (event) => {
      try {
        const submission = JSON.parse(
          (event as MessageEvent).data,
        ) as Submission;
        upsertSubmissions([submission]);
      } catch {
        // ignore malformed events
      }
    });

    return () => {
      window.clearInterval(poll);
      es.close();
    };
  }, [loadSubmissions, upsertSubmissions]);

  useEffect(() => {
    const tickSpotlight = () => {
      const nodes = nodesRef.current;
      if (nodes.length === 0) {
        setSpotlight(null);
        return;
      }
      spotlightIndexRef.current =
        (spotlightIndexRef.current + 1) % nodes.length;
      setSpotlight(nodes[spotlightIndexRef.current].submission);
    };

    tickSpotlight();
    const id = window.setInterval(tickSpotlight, SPOTLIGHT_MS);
    return () => window.clearInterval(id);
  }, [count]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let running = true;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const draw = (time: number) => {
      if (!running) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const nodes = nodesRef.current;
      const t = time / 1000;

      ctx.fillStyle = "#141210";
      ctx.fillRect(0, 0, w, h);

      // soft vignette glow
      const grad = ctx.createRadialGradient(
        w * 0.5,
        h * 0.45,
        40,
        w * 0.5,
        h * 0.45,
        Math.max(w, h) * 0.7,
      );
      grad.addColorStop(0, "rgba(60, 50, 40, 0.35)");
      grad.addColorStop(1, "rgba(20, 18, 16, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // physics: breathe + soft category attraction + mild repulsion
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const anchor = CATEGORY_ANCHORS[n.submission.category];
        const ax = anchor.x * w;
        const ay = anchor.y * h;

        n.vx += (ax - n.x) * 0.00035;
        n.vy += (ay - n.y) * 0.00035;

        for (let j = i + 1; j < nodes.length; j++) {
          const o = nodes[j];
          const dx = n.x - o.x;
          const dy = n.y - o.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < 90) {
            const force = ((90 - dist) / 90) * 0.02;
            n.vx += (dx / dist) * force;
            n.vy += (dy / dist) * force;
            o.vx -= (dx / dist) * force;
            o.vy -= (dy / dist) * force;
          }
        }

        n.vx *= 0.96;
        n.vy *= 0.96;
        n.x += n.vx;
        n.y += n.vy;

        const breathe = Math.sin(t * 0.7 + n.phase) * 3;
        n.x += Math.cos(t * 0.4 + n.phase) * 0.08;
        n.y += Math.sin(t * 0.5 + n.phase) * 0.08;

        const r = n.radius + breathe * 0.15;
        const color = CATEGORY_COLORS[n.submission.category];
        const isSpot = spotlight?.id === n.id;

        ctx.beginPath();
        ctx.arc(n.x, n.y, isSpot ? r * 2.2 : r * 1.8, 0, Math.PI * 2);
        ctx.fillStyle = isSpot
          ? "rgba(240, 230, 216, 0.18)"
          : "rgba(240, 230, 216, 0.05)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(n.x, n.y, isSpot ? r * 1.35 : r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = isSpot ? 1 : 0.75;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // faint links between nearby same-category nodes
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          if (a.submission.category !== b.submission.category) continue;
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist > 160) continue;
          ctx.strokeStyle = `rgba(240, 230, 216, ${0.12 * (1 - dist / 160)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [spotlight]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#141210] text-glow">
      <canvas ref={canvasRef} className="absolute inset-0 block" />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-6 md:p-10">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-warm-soft/70">
            Shared Burdens
          </p>
          <p className="mt-2 font-mono text-xs text-warm-soft/50">
            {count} quiet weight{count === 1 ? "" : "s"} held together
          </p>
        </div>
      </div>

      {spotlight && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-6 pb-10 md:pb-14">
          <div className="max-w-3xl text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-warm-soft/60">
              {CATEGORY_LABELS[spotlight.category]}
            </p>
            <p className="mt-3 font-serif text-2xl leading-snug text-glow/95 md:text-4xl">
              {spotlight.worry_text}
            </p>
            <p className="mt-4 text-base leading-relaxed text-warm-soft/80 md:text-lg">
              {spotlight.offering_text}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
