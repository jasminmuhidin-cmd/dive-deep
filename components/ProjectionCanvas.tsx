"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { Category, Submission } from "@/lib/types";
import {
  CATEGORY_LABELS,
  FISH_FORM_LABELS,
  PROMPT_LABELS,
  insightForFriction,
} from "@/lib/types";
import { PROJECTION_FISH_PATH } from "@/components/onboarding/fishPaths";

const CATEGORY_COLORS: Record<Category, string> = {
  environment: "#4b908d",
  community: "#c6979d",
  future: "#147a90",
  belonging: "#e9d68c",
  economy: "#8a9aa8",
  unspecified: "#6b7c8a",
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
  expand: number;
  pinned: boolean;
}

const SPOTLIGHT_MS = 20_000;
const POLL_MS = 5_000;
const HIT_PAD = 28;

export default function ProjectionCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const spotlightIndexRef = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);

  const [spotlight, setSpotlight] = useState<Submission | null>(null);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [count, setCount] = useState(0);
  const knownIdsRef = useRef<Set<string>>(new Set());

  const upsertSubmissions = useCallback((list: Submission[]) => {
    const w = window.innerWidth || 1200;
    const h = window.innerHeight || 800;

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
        radius: 7 + Math.random() * 5,
        phase: Math.random() * Math.PI * 2,
        expand: 0,
        pinned: false,
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
        // ignore
      }
    });
    return () => {
      window.clearInterval(poll);
      es.close();
    };
  }, [loadSubmissions, upsertSubmissions]);

  useEffect(() => {
    if (selected) return;
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
  }, [count, selected]);

  const hitTest = useCallback((x: number, y: number): Node | null => {
    const nodes = nodesRef.current;
    let best: Node | null = null;
    let bestDist = Infinity;
    for (const n of nodes) {
      const r = n.radius * (1 + n.expand * 1.8) + HIT_PAD;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d <= r && d < bestDist) {
        best = n;
        bestDist = d;
      }
    }
    return best;
  }, []);

  const openNode = useCallback((node: Node) => {
    selectedIdRef.current = node.id;
    setSelected(node.submission);
    setSpotlight(node.submission);
    for (const n of nodesRef.current) {
      n.pinned = n.id === node.id;
    }
  }, []);

  const closeSelected = useCallback(() => {
    selectedIdRef.current = null;
    setSelected(null);
    for (const n of nodesRef.current) {
      n.pinned = false;
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const toLocal = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onDown = (e: PointerEvent) => {
      const { x, y } = toLocal(e);
      const hit = hitTest(x, y);
      if (!hit) {
        if (selectedIdRef.current) closeSelected();
        return;
      }
      canvas.setPointerCapture(e.pointerId);
      hit.pinned = true;
      hit.vx = 0;
      hit.vy = 0;
      dragRef.current = {
        id: hit.id,
        startX: x,
        startY: y,
        moved: false,
        pointerId: e.pointerId,
      };
    };

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const { x, y } = toLocal(e);
      const node = nodesRef.current.find((n) => n.id === drag.id);
      if (!node) return;
      if (Math.hypot(x - drag.startX, y - drag.startY) > 8) {
        drag.moved = true;
      }
      if (drag.moved) {
        node.x = x;
        node.y = y;
        node.vx = 0;
        node.vy = 0;
      }
    };

    const onUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const node = nodesRef.current.find((n) => n.id === drag.id);
      dragRef.current = null;
      if (!node) return;
      if (!drag.moved) {
        openNode(node);
      } else if (selectedIdRef.current !== node.id) {
        node.pinned = false;
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, [hitTest, openNode, closeSelected]);

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
      const selectedId = selectedIdRef.current;

      ctx.fillStyle = "#121826";
      ctx.fillRect(0, 0, w, h);

      const grad = ctx.createRadialGradient(
        w * 0.5,
        h * 0.45,
        40,
        w * 0.5,
        h * 0.45,
        Math.max(w, h) * 0.7,
      );
      grad.addColorStop(0, "rgba(20, 122, 144, 0.22)");
      grad.addColorStop(0.45, "rgba(45, 54, 81, 0.35)");
      grad.addColorStop(1, "rgba(18, 24, 38, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const targetExpand = n.id === selectedId ? 1 : 0;
        n.expand += (targetExpand - n.expand) * 0.08;

        if (!n.pinned) {
          const anchor = CATEGORY_ANCHORS[n.submission.category];
          const ax = anchor.x * w;
          const ay = anchor.y * h;
          n.vx += (ax - n.x) * 0.00028;
          n.vy += (ay - n.y) * 0.00028;

          for (let j = i + 1; j < nodes.length; j++) {
            const o = nodes[j];
            const dx = n.x - o.x;
            const dy = n.y - o.y;
            const dist = Math.hypot(dx, dy) || 1;
            if (dist < 100) {
              const force = ((100 - dist) / 100) * 0.018;
              n.vx += (dx / dist) * force;
              n.vy += (dy / dist) * force;
              if (!o.pinned) {
                o.vx -= (dx / dist) * force;
                o.vy -= (dy / dist) * force;
              }
            }
          }

          n.vx *= 0.96;
          n.vy *= 0.96;
          n.x += n.vx + Math.cos(t * 0.4 + n.phase) * 0.08;
          n.y += n.vy + Math.sin(t * 0.5 + n.phase) * 0.08;
          n.x = Math.max(24, Math.min(w - 24, n.x));
          n.y = Math.max(24, Math.min(h - 24, n.y));
        }

        const breathe = Math.sin(t * 0.7 + n.phase) * 3;
        const scale =
          (n.radius / 8 + breathe * 0.02) * (1 + n.expand * 1.4);
        const color = CATEGORY_COLORS[n.submission.category];
        const isSpot = spotlight?.id === n.id || n.id === selectedId;

        // soft glow under fish
        ctx.beginPath();
        ctx.ellipse(
          n.x,
          n.y,
          22 * scale * (1.3 + n.expand),
          14 * scale * (1.3 + n.expand),
          0,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = isSpot
          ? `rgba(233, 214, 140, ${0.14 + n.expand * 0.2})`
          : "rgba(244, 239, 228, 0.04)";
        ctx.fill();

        ctx.save();
        ctx.translate(n.x, n.y);
        ctx.rotate(Math.sin(t * 0.3 + n.phase) * 0.08 + n.phase * 0.02);
        ctx.scale(scale * 1.35, scale * 1.35);
        ctx.translate(-28, -12);
        const fish = new Path2D(PROJECTION_FISH_PATH);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.72 + n.expand * 0.28;
        ctx.fill(fish);
        ctx.globalAlpha = 1;
        if (n.expand > 0.2) {
          ctx.strokeStyle = `rgba(233, 214, 140, ${0.45 * n.expand})`;
          ctx.lineWidth = 1.2 / scale;
          ctx.stroke(fish);
        }
        ctx.restore();
      }

      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          if (a.submission.category !== b.submission.category) continue;
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist > 160) continue;
          ctx.strokeStyle = `rgba(244, 239, 228, ${0.1 * (1 - dist / 160)})`;
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

  const selectedInsight = selected
    ? insightForFriction(selected.frictions?.[0])
    : null;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-depth text-foam touch-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block touch-none"
        style={{ touchAction: "none" }}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-6 md:p-10">
        <div>
          <p className="font-serif text-xl text-foam/90">deep dive</p>
          <p className="mt-2 font-mono text-xs text-foam/45">
            {count} · tap or drag a fish
          </p>
        </div>
      </div>

      {!selected && spotlight && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-6 pb-10 md:pb-14">
          <div className="max-w-3xl text-center opacity-80">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-sand/60">
              {CATEGORY_LABELS[spotlight.category]}
            </p>
            <p className="mt-3 font-serif text-2xl leading-snug text-foam/90 md:text-3xl">
              {spotlight.worry_text}
            </p>
          </div>
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <motion.div
            className="pointer-events-none absolute inset-0 flex items-center justify-center p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-auto relative max-h-[70vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-foam/15 bg-depth/80 p-6 shadow-[0_0_60px_rgba(20,122,144,0.25)] backdrop-blur-md md:p-8"
            >
              <button
                type="button"
                onClick={closeSelected}
                className="absolute right-4 top-4 rounded-full p-2 text-foam/60 transition hover:bg-foam/10 hover:text-foam"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-sand/70">
                {CATEGORY_LABELS[selected.category]}
                {selected.prompt_type
                  ? ` · ${PROMPT_LABELS[selected.prompt_type]}`
                  : ""}
                {selected.fish_form
                  ? ` · ${FISH_FORM_LABELS[selected.fish_form]}`
                  : ""}
              </p>
              <p className="mt-4 pr-8 font-serif text-2xl leading-snug text-foam md:text-3xl">
                {selected.worry_text}
              </p>
              {selectedInsight && (
                <p className="mt-4 text-sm leading-relaxed text-sand/80">
                  {selectedInsight}
                </p>
              )}
              {(selected.frictions?.length ?? 0) > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {(selected.frictions ?? []).map((f) => (
                    <span
                      key={`${f.id}-${f.label}`}
                      className="rounded-full border border-seafoam/35 bg-seafoam/10 px-3 py-1 text-xs text-sand"
                    >
                      {f.label}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
