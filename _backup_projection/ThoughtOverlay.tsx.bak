"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { ThoughtPlacement } from "./useThoughts";

const REVEAL_MS = 5000;
const VISIBLE_COUNT = 6;
const HOLD_MS = 16000;
const FADE_MS = 2800;

/** Fixed screen slots — keeps taps comfortably apart */
const SLOTS: { x: number; y: number }[] = [
  { x: 0.2, y: 0.22 },
  { x: 0.55, y: 0.2 },
  { x: 0.8, y: 0.28 },
  { x: 0.25, y: 0.5 },
  { x: 0.72, y: 0.55 },
  { x: 0.48, y: 0.74 },
];

export type ActivePrompt = {
  thoughtId: string;
  text: string;
  x: number;
  y: number;
  until: number;
};

type SlotState = {
  thought: ThoughtPlacement;
  opacity: number;
};

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

/**
 * Blurry teasers painted into a canvas so the water shader can distort them
 * with the same Larose displacement filter (in place — not moved as boxes).
 * Invisible DOM buttons sit on top for taps.
 */
export default function ThoughtOverlay({
  thoughts,
  active,
  now,
  onSelect,
  onTextTexture,
}: {
  thoughts: ThoughtPlacement[];
  active: ActivePrompt | null;
  now: number;
  onSelect: (thought: ThoughtPlacement) => void;
  onTextTexture: (tex: THREE.CanvasTexture | null) => void;
}) {
  const [slots, setSlots] = useState<SlotState[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);

  const thoughtsRef = useRef(thoughts);
  thoughtsRef.current = thoughts;
  const nextPoolRef = useRef(0);
  const swapSlotRef = useRef(0);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const activeRef = useRef(active);
  activeRef.current = active;

  // Seed slots
  useEffect(() => {
    if (thoughts.length === 0) {
      setSlots([]);
      return;
    }
    setSlots((prev) => {
      if (prev.length > 0) {
        if (prev.length >= Math.min(VISIBLE_COUNT, thoughts.length)) return prev;
      }
      const n = Math.min(VISIBLE_COUNT, thoughts.length);
      nextPoolRef.current = n % thoughts.length;
      swapSlotRef.current = 0;
      return Array.from({ length: n }, (_, i) => ({
        thought: thoughts[i]!,
        opacity: 1,
      }));
    });
  }, [thoughts]);

  // Text canvas + texture for shader filter
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    canvasRef.current = canvas;

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.flipY = true;
    textureRef.current = tex;
    onTextTexture(tex);

    return () => {
      tex.dispose();
      textureRef.current = null;
      canvasRef.current = null;
      onTextTexture(null);
    };
  }, [onTextTexture]);

  // Paint prompts each frame — teasers heavily blurred until click-reveal
  useEffect(() => {
    let raf = 0;
    const scratch = document.createElement("canvas");
    scratch.width = 1024;
    scratch.height = 1024;

    const tick = () => {
      const canvas = canvasRef.current;
      const tex = textureRef.current;
      if (!canvas || !tex) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const ctx = canvas.getContext("2d");
      const sctx = scratch.getContext("2d");
      if (!ctx || !sctx) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const w = canvas.width;
      const h = canvas.height;
      const tSec = performance.now() / 1000;
      const act = activeRef.current;

      ctx.clearRect(0, 0, w, h);
      sctx.clearRect(0, 0, w, h);
      sctx.textAlign = "center";
      sctx.textBaseline = "middle";
      sctx.font =
        "500 28px 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";

      // Draw anonymous teasers sharp onto scratch, then blur hard into main
      for (let i = 0; i < slotsRef.current.length; i++) {
        const slotState = slotsRef.current[i]!;
        const thought = slotState.thought;
        if (act?.thoughtId === thought.id) continue;

        const slot = SLOTS[i]!;
        const fx = Math.sin(tSec * 0.22 + thought.phase) * 0.012;
        const fy = Math.cos(tSec * 0.17 + thought.phase * 1.3) * 0.01;
        const cx = (slot.x + fx) * w;
        const cy = (slot.y + fy) * h;
        const alpha = 0.85 * slotState.opacity;
        if (alpha < 0.02) continue;

        const lines = wrapText(sctx, thought.text, w * 0.22);
        const lineH = 34;

        sctx.save();
        sctx.globalAlpha = alpha;
        sctx.fillStyle = "rgba(12, 70, 90, 0.95)";
        sctx.shadowColor = "rgba(255, 255, 255, 0.45)";
        sctx.shadowBlur = 14;
        lines.forEach((line, li) => {
          sctx.fillText(
            line,
            cx,
            cy + (li - (lines.length - 1) / 2) * lineH,
          );
        });
        sctx.restore();
      }

      // Soft blur — readable as “text to tap”, not fully anonymous-opaque
      ctx.save();
      ctx.filter = "blur(5px)";
      ctx.globalAlpha = 0.88;
      ctx.drawImage(scratch, 0, 0);
      ctx.restore();

      // Revealed text is DOM-only (never painted here → no ripple warp)
      tex.needsUpdate = true;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // One-by-one fade cycle
  useEffect(() => {
    if (slots.length === 0) return;
    if (thoughts.length <= slots.length) return;

    let cancelled = false;
    let timer = 0;

    const fadeTo = (slotIndex: number, target: number, duration: number) =>
      new Promise<void>((resolve) => {
        const start = performance.now();
        const from = slotsRef.current[slotIndex]?.opacity ?? 1;
        const step = (t: number) => {
          if (cancelled) {
            resolve();
            return;
          }
          const p = Math.min(1, (t - start) / duration);
          const eased = p * p * (3 - 2 * p);
          const opacity = from + (target - from) * eased;
          setSlots((prev) =>
            prev.map((s, i) => (i === slotIndex ? { ...s, opacity } : s)),
          );
          if (p < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });

    const pickNextThought = (): ThoughtPlacement | null => {
      const pool = thoughtsRef.current;
      if (pool.length === 0) return null;
      const visible = new Set(slotsRef.current.map((s) => s.thought.id));
      for (let tries = 0; tries < pool.length; tries++) {
        const idx = nextPoolRef.current % pool.length;
        nextPoolRef.current = idx + 1;
        const candidate = pool[idx]!;
        if (!visible.has(candidate.id)) return candidate;
      }
      return pool[nextPoolRef.current % pool.length] ?? null;
    };

    const cycleOnce = async () => {
      if (cancelled) return;
      const slotIndex = swapSlotRef.current % slotsRef.current.length;

      await fadeTo(slotIndex, 0, FADE_MS);
      if (cancelled) return;

      const next = pickNextThought();
      if (next) {
        setSlots((prev) =>
          prev.map((s, i) =>
            i === slotIndex ? { thought: next, opacity: 0 } : s,
          ),
        );
        await new Promise((r) => setTimeout(r, 40));
        if (cancelled) return;
        await fadeTo(slotIndex, 1, FADE_MS);
      }

      if (cancelled) return;
      swapSlotRef.current = (slotIndex + 1) % slotsRef.current.length;
      timer = window.setTimeout(() => {
        void cycleOnce();
      }, HOLD_MS);
    };

    timer = window.setTimeout(() => {
      void cycleOnce();
    }, HOLD_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots.length, thoughts.length > VISIBLE_COUNT]);

  let activeOpacity = 0;
  if (active) {
    const remaining = active.until - now;
    if (remaining > 0) {
      const elapsed = REVEAL_MS - remaining;
      activeOpacity = 1;
      if (elapsed < 280) activeOpacity = elapsed / 280;
      else if (remaining < 800) activeOpacity = remaining / 800;
    }
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      {/* Invisible hit targets — blurred text lives in the water shader */}
      {slots.map((slotState, i) => {
        const thought = slotState.thought;
        const slot = SLOTS[i] ?? { x: thought.x, y: thought.y };
        const isActive =
          active?.thoughtId === thought.id && activeOpacity > 0.02;
        if (isActive) return null;
        if (slotState.opacity < 0.05) return null;

        return (
          <button
            key={`slot-${i}`}
            type="button"
            aria-label="Reveal thought"
            className="pointer-events-auto absolute max-w-[min(14rem,48vw)] -translate-x-1/2 -translate-y-1/2 cursor-pointer border-0 bg-transparent px-3 py-2 text-[15px] leading-snug text-transparent sm:text-[16px]"
            style={{
              left: `${slot.x * 100}%`,
              top: `${slot.y * 100}%`,
              opacity: slotState.opacity,
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onSelect({ ...thought, x: slot.x, y: slot.y });
            }}
          >
            {thought.text}
          </button>
        );
      })}

      {/* Sharp reveal above water — glow behind, never distorted by ripples */}
      {active && activeOpacity > 0.02 && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${active.x * 100}%`,
            top: `${active.y * 100}%`,
            opacity: activeOpacity,
          }}
        >
          {/* Soft backlight behind the prompt */}
          <div
            aria-hidden
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              width: "min(28rem, 85vw)",
              height: "12rem",
              background:
                "radial-gradient(ellipse at center, rgba(255, 255, 255, 0.65) 0%, rgba(180, 235, 245, 0.4) 35%, rgba(100, 200, 220, 0.15) 60%, transparent 75%)",
              filter: "blur(18px)",
            }}
          />
          <p
            className="relative max-w-[min(22rem,72vw)] px-5 py-4 text-center font-serif text-[18px] leading-snug text-[#063a4a] sm:text-[20px]"
            style={{
              textShadow:
                "0 0 16px rgba(255, 255, 255, 0.9), 0 0 32px rgba(200, 240, 250, 0.7), 0 1px 2px rgba(255,255,255,0.5)",
            }}
          >
            {active.text}
          </p>
        </div>
      )}
    </div>
  );
}

export { REVEAL_MS };
