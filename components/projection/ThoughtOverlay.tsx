"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { ThoughtPlacement } from "./useThoughts";
import { FX } from "./fx/fxConfig";
import type { ClearZone } from "./fx/clearZones";

const REVEAL_MS = 7000;
/** Reveal fade-in / fade-out (ms). */
const REVEAL_IN_MS = 1400;
const REVEAL_OUT_MS = 1100;
const VISIBLE_COUNT = 10;
const HOLD_MS = 16000;
const FADE_MS = 2800;

/** Fixed screen slots — keeps taps comfortably apart */
const SLOTS: { x: number; y: number }[] = [
  // Staggered 3 / 2 / 3 / 2 rows: ten thoughts, each with room to drift.
  { x: 0.17, y: 0.15 },
  { x: 0.5, y: 0.13 },
  { x: 0.83, y: 0.16 },
  { x: 0.33, y: 0.37 },
  { x: 0.68, y: 0.38 },
  { x: 0.16, y: 0.6 },
  { x: 0.5, y: 0.59 },
  { x: 0.84, y: 0.61 },
  { x: 0.33, y: 0.82 },
  { x: 0.67, y: 0.83 },
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

/**
 * Suspended drift for a teaser: two slow, incommensurate sines per axis
 * (so the path never visibly repeats) plus a gentle rocking rotation.
 * Shared by the canvas painter and the invisible tap targets so they stay
 * aligned. Periods are ~2–6 minutes: felt more than seen.
 */
function teaserPose(phase: number, tSec: number) {
  return {
    dx:
      Math.sin(tSec * 0.05 + phase) * 0.03 +
      Math.sin(tSec * 0.021 + phase * 2.1) * 0.015,
    dy:
      Math.cos(tSec * 0.041 + phase * 1.3) * 0.022 +
      Math.sin(tSec * 0.017 + phase * 0.7) * 0.01,
    /** radians, about ±8° */
    rot:
      Math.sin(tSec * 0.03 + phase * 1.7) * 0.11 +
      Math.sin(tSec * 0.013 + phase * 0.4) * 0.035,
  };
}

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

let cachedFamily = "";
/** Canvas text uses the same family stack as the DOM type (--ethereal-family). */
function teaserFamily(): string {
  if (cachedFamily) return cachedFamily;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--ethereal-family")
    .trim();
  if (v) {
    cachedFamily = v;
    void document.fonts?.load(`400 30px ${v}`);
  }
  return cachedFamily || "Georgia, serif";
}

/**
 * Blurry teasers painted into a canvas so the water shader can distort them
 * with the same Larose displacement filter (in place — not moved as boxes).
 * Invisible DOM buttons sit on top for taps.
 */
/** Stable 0.25–1 per thought: how far it rises when the water is stirred. */
function thoughtLift(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const u = ((h >>> 0) % 1000) / 1000;
  return u < 0.45 ? 0.25 : 0.55 + u * 0.45;
}

export default function ThoughtOverlay({
  thoughts,
  active,
  now,
  onSelect,
  onTextTexture,
  clearZonesRef,
  readRef,
  waveEnergy,
}: {
  /**
   * Live hand-wave energy (0–1). The more visitors move their arms, the
   * closer some hidden words drift toward the surface: a little brighter and
   * less blurred — but never readable until tapped.
   */
  waveEnergy?: () => number;
  /** Written every frame: where each thought floats (keeps dots off text). */
  clearZonesRef?: React.MutableRefObject<ClearZone[]>;
  /** Ids of thoughts a visitor has already revealed (no nudge for these). */
  readRef?: React.RefObject<Set<string>>;
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
  const waveEnergyRef = useRef(waveEnergy);
  waveEnergyRef.current = waveEnergy;

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
    // Smoothed surfacing: rises over a few seconds of movement, sinks back
    // slowly after it stops — never a jump.
    let surf = 0;
    let lastT = performance.now();

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
      const tNow = performance.now();
      const tSec = tNow / 1000;
      const act = activeRef.current;
      const dtS = Math.min(0.25, (tNow - lastT) / 1000);
      lastT = tNow;
      const SU = FX.surfacing;
      const e = Math.min(1, Math.max(0, waveEnergyRef.current?.() ?? 0));
      surf += (e - surf) * (1 - Math.exp(-dtS / (e > surf ? SU.riseTau : SU.sinkTau)));

      ctx.clearRect(0, 0, w, h);
      sctx.clearRect(0, 0, w, h);
      sctx.textAlign = "center";
      sctx.textBaseline = "middle";
      // Same family as the DOM type (next/font exposes it as a CSS var).
      sctx.font = `400 30px ${teaserFamily()}`; // ≈ 11pt on screen, matching the DOM text
      (sctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "-3px"; // −0.1em

      const zones: ClearZone[] = [];
      const CZ = FX.clearZones;
      if (act && act.until > performance.now()) {
        zones.push({
          x: act.x,
          y: act.y,
          rx: CZ.revealed[0],
          ry: CZ.revealed[1],
          id: act.thoughtId,
          kind: "revealed",
          read: true,
        });
      }

      // Draw anonymous teasers sharp onto scratch, then blur hard into main
      for (let i = 0; i < slotsRef.current.length; i++) {
        const slotState = slotsRef.current[i]!;
        const thought = slotState.thought;
        if (act?.thoughtId === thought.id) continue;

        const slot = SLOTS[i]!;
        const pose = teaserPose(thought.phase, tSec);
        const cx = (slot.x + pose.dx) * w;
        const cy = (slot.y + pose.dy) * h;
        // Barely-there: just a hint of words deep under the surface. They
        // only become readable when tapped (the sharp DOM reveal).
        // Some words (not all) drift up toward the surface with wave energy.
        const lift = surf * thoughtLift(thought.id);
        const alpha = (0.3 + SU.alphaGain * lift) * slotState.opacity;
        if (alpha < 0.02) continue;

        const lines = wrapText(sctx, thought.text, w * 0.22);
        const lineH = 37;
        const read = readRef?.current?.has(thought.id) ?? false;
        zones.push({
          x: slot.x + pose.dx,
          y: slot.y + pose.dy,
          rx: CZ.teaser[0],
          ry: CZ.teaser[1],
          id: thought.id,
          kind: "teaser",
          read,
        });


        sctx.save();
        sctx.globalAlpha = alpha;
        // Clean type: no glow, no shadow — the soft blur below is the only
        // treatment, so the words read as if suspended in the water.
        sctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        sctx.translate(cx, cy);
        sctx.rotate(pose.rot);
        const sc = 1 + SU.scaleGain * lift;
        sctx.scale(sc, sc);
        lines.forEach((line, li) => {
          sctx.fillText(line, 0, (li - (lines.length - 1) / 2) * lineH);
        });
        sctx.restore();
      }

      // Soft blur — readable as “text to tap”, not fully anonymous-opaque
      ctx.save();
      // Blur thins a little as the words surface, but never below
      // minBlurPx — still unreadable until tapped.
      ctx.filter = `blur(${Math.max(SU.minBlurPx, 7 - (7 - SU.minBlurPx) * surf).toFixed(2)}px)`;
      ctx.globalAlpha = 0.88;
      ctx.drawImage(scratch, 0, 0);
      ctx.restore();

      if (clearZonesRef) clearZonesRef.current = zones;

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
      // Slow, eased fade-in (and a gentler fade-out), so a revealed thought
      // surfaces like something rising through water.
      const ease = (t: number) => t * t * (3 - 2 * t);
      activeOpacity = 1;
      if (elapsed < REVEAL_IN_MS) activeOpacity = ease(Math.max(0, elapsed) / REVEAL_IN_MS);
      else if (remaining < REVEAL_OUT_MS) activeOpacity = ease(remaining / REVEAL_OUT_MS);
    }
  }
  // While fading in, the words also come into focus (blur 6px → 0) and
  // rise a few pixels, then settle.
  const revealBlur = (1 - activeOpacity) * 6;
  const revealRise = (1 - activeOpacity) * 10;

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      {/* Invisible hit targets — blurred text lives in the water shader */}
      {slots.map((slotState, i) => {
        const thought = slotState.thought;
        const base = SLOTS[i] ?? { x: thought.x, y: thought.y };
        const pose = teaserPose(thought.phase, now / 1000);
        const slot = { x: base.x + pose.dx, y: base.y + pose.dy };
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
              rotate: `${pose.rot}rad`,
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
            // Keep the whole text block (and its aura) on screen.
            left: `clamp(min(15rem, 42vw), ${active.x * 100}%, calc(100% - min(15rem, 42vw)))`,
            top: `clamp(5rem, ${active.y * 100}%, calc(100% - 5rem))`,
            opacity: activeOpacity,
            filter: revealBlur > 0.05 ? `blur(${revealBlur.toFixed(2)}px)` : undefined,
            marginTop: `${revealRise.toFixed(1)}px`,
          }}
        >
          {/* Pure white Playfair with a soft aura. Legibility comes from the
              water deepening beneath it (focus pool in the water shader). */}
          <p className="ethereal-text ethereal-light ethereal-aura max-w-[min(22rem,72vw)] px-5 py-4 text-center">
            {active.text}
          </p>
        </div>
      )}
    </div>
  );
}

export { REVEAL_MS };
