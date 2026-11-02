"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useWebcamFeed } from "./useWebcamFeed";
import { useThoughts } from "./useThoughts";
import { useMotionSense } from "./useMotionSense";
import TapThoughts, { type SpawnedThought } from "./TapThoughts";
import { FxLayer, type FxApi } from "./fx/FxLayer";
import type { FocusSpot, SurfaceSpot } from "./WaterPlane";
import type { ClearZone } from "./fx/clearZones";
import {
  useBodyVision,
  MASK_W,
  MASK_H,
  type BodyVisionFrame,
} from "./fx/useBodyVision";
import { FX } from "./fx/fxConfig";

/** Only clear movement leaves ripples — still people are ignored */
const MOVE_DELTA = 0.02;
/** Min frame motion (0–1) before we treat it as “general movement” */
const AMOUNT_MIN = 0.05;
/** Soft organic touches while text is revealed — irregular timing & jitter. */
/** Gentle drops near a visible thought — rare (was 1.4–2.4 s, then 2.8–4.8 s). */
const REVEAL_GAP_MIN = 5600;
const REVEAL_GAP_MAX = 9600;

/** Used only when no submissions have loaded (offline / empty database). */
const FALLBACK_THOUGHTS = [
  "Will there be enough for everyone?",
  "I worry no one is really listening.",
  "What kind of world are we leaving behind?",
  "Am I doing enough for the people I love?",
  "I'm scared of falling behind.",
];

type FxRef = React.MutableRefObject<FxApi | null>;

/** Setup view: what the tracker sees (mirrored silhouette + wrists). */
function drawMaskPreview(c: HTMLCanvasElement | null, f: BodyVisionFrame) {
  const ctx = c?.getContext("2d");
  if (!c || !ctx) return;
  const img = ctx.createImageData(MASK_W, MASK_H);
  for (let y = 0; y < MASK_H; y++)
    for (let x = 0; x < MASK_W; x++) {
      const v = f.mask[y * MASK_W + (MASK_W - 1 - x)]!; // mirrored like the wall
      const i = (y * MASK_W + x) * 4;
      img.data[i] = 20 + v * 235;
      img.data[i + 1] = 40 + v * 215;
      img.data[i + 2] = 70 + v * 185;
      img.data[i + 3] = 230;
    }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = "#ff6fa0";
  for (const w of f.wrists) {
    ctx.beginPath();
    ctx.arc((1 - w.x) * MASK_W, w.y * MASK_H, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}


/** Several small drops near a point — fingertips on water. */
function softTouch(fx: FxRef, cx: number, cy: number, strength = 1) {
  const n = 1; // one drop (was 2–4, then 1–2)
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = 0.008 + Math.random() * 0.028;
    const x = Math.min(1, Math.max(0, cx + Math.cos(ang) * rad));
    const y = Math.min(1, Math.max(0, cy + Math.sin(ang) * rad * 0.75));
    const k = (0.35 + Math.random() * 0.3) * strength;
    const r = 0.018 + Math.random() * 0.014;
    const delay = i * (300 + Math.random() * 340);
    if (delay < 4) fx.current?.drop(x, y, r, k);
    else window.setTimeout(() => fx.current?.drop(x, y, r, k), delay);
  }
}

function RevealDriver({
  sample,
  fx,
  thoughtsRef,
}: {
  sample: ReturnType<typeof useMotionSense>["sample"];
  fx: FxRef;
  thoughtsRef: React.MutableRefObject<SpawnedThought[]>;
}) {
  const prevByTrack = useRef(new Map<number, { x: number; y: number }>());
  const nextRevealAt = useRef(new Map<string, number>());

  useFrame(() => {
    // Soft organic touches keep breathing out from every visible thought.
    const now = performance.now();
    const live = new Set<string>();
    for (const t of thoughtsRef.current) {
      if (t.until <= now) continue;
      live.add(t.key);
      const due = nextRevealAt.current.get(t.key);
      if (due === undefined) {
        nextRevealAt.current.set(
          t.key,
          now + REVEAL_GAP_MIN + Math.random() * (REVEAL_GAP_MAX - REVEAL_GAP_MIN),
        );
      } else if (now >= due && t.until - now > 1200) {
        softTouch(fx, t.x, t.y, 0.85);
        nextRevealAt.current.set(
          t.key,
          now + REVEAL_GAP_MIN + Math.random() * (REVEAL_GAP_MAX - REVEAL_GAP_MIN),
        );
      }
    }
    for (const k of [...nextRevealAt.current.keys()]) {
      if (!live.has(k)) nextRevealAt.current.delete(k);
    }

    // Legacy: frame-difference motion → splashes (off by default; the pose
    // tracker now drives waves from hands and the body becomes dots).
    if (!FX.legacyMotionSplashes) return;
    const motion = sample();
    if (motion.amount < AMOUNT_MIN) {
      prevByTrack.current.clear();
      return;
    }
    const alive = new Set<number>();
    for (const track of motion.tracks) {
      alive.add(track.id);
      const prev = prevByTrack.current.get(track.id);
      prevByTrack.current.set(track.id, { x: track.x, y: track.y });
      if (!prev) continue;
      if (Math.hypot(track.x - prev.x, track.y - prev.y) <= MOVE_DELTA) continue;
      fx.current?.drop(track.x, track.y, 0.03, 0.25);
    }
    for (const id of [...prevByTrack.current.keys()]) {
      if (!alive.has(id)) prevByTrack.current.delete(id);
    }
  });

  return null;
}

/**
 * @param tapThoughts  true (default): a tap surfaces a thought with its fish.
 *                     false: a tap only makes a ripple — no text, no fish
 *                     (used by /projection-ripples).
 */
export default function ProjectionScene({ tapThoughts = true }: { tapThoughts?: boolean } = {}) {
  const { video, status } = useWebcamFeed();
  const pool = useThoughts(48);
  const { sample } = useMotionSense(FX.legacyMotionSplashes ? video : null);
  const { frameRef, status: visionStatus } = useBodyVision(video);
  const visionStatusRef = useRef<string>("");
  visionStatusRef.current = `camera ${status} · tracker ${visionStatus}`;
  const fxRef = useRef<FxApi | null>(null);
  /** Where revealed text sits → the water deepens there for legibility. */
  const focusRef = useRef<FocusSpot | null>(null);
  /** Where every thought floats right now (dots are kept out of these). */
  const clearZonesRef = useRef<ClearZone[]>([]);
  /** Thoughts spawned by taps (also drive the surfacing fish). */
  const [spawned, setSpawned] = useState<SpawnedThought[]>([]);
  const spawnedRef = useRef<SpawnedThought[]>([]);
  const spotsRef = useRef<SurfaceSpot[]>([]);
  const lastTapAt = useRef(0);
  const nextPoolIdx = useRef(0);
  const tapCounter = useRef(0);
  const timers = useRef(new Map<string, number>());
  /** Thoughts replaced by an overlapping newer one (fade out quickly). */
  const quickExitRef = useRef<Set<string>>(new Set());
  const poolRef = useRef(pool);
  poolRef.current = pool;

  const [debug, setDebug] = useState(false);
  const debugRef = useRef<HTMLPreElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  /** Last position per pointer id — supports simultaneous multi-touch. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    const t = timers.current;
    return () => {
      for (const id of t.values()) window.clearTimeout(id);
      t.clear();
    };
  }, []);

  useEffect(() => {
    setDebug(new URLSearchParams(window.location.search).has("debug"));
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = performance.now();
      const live = spawnedRef.current.filter((s) => s.until > t);
      const a = live[live.length - 1];
      focusRef.current = a ? { x: a.x, y: a.y, amount: 0.9 } : null;
      // Keep dots / outline clear of the words (see FX.clearZones).
      clearZonesRef.current = live.map((s) => ({
        x: s.x,
        y: s.y,
        rx: FX.clearZones.revealed[0],
        ry: FX.clearZones.revealed[1],
        kind: "revealed" as const,
      }));

      const dbg = debugRef.current;
      const fx = fxRef.current;
      if (dbg && fx) {
        const w = fx.waves;
        const f = frameRef.current;
        const hint =
          f.people === 0
            ? "no one detected — step into view, face the camera"
            : f.bodySpan < 0.45
              ? "too far — step closer"
              : f.bodySpan > 0.9 && !f.feetVisible
                ? "too close — step back"
                : "good distance ✓";
        const bar = "█".repeat(Math.round(w.energy * 20)).padEnd(20, "·");
        dbg.textContent =
          `${visionStatusRef.current}  ·  people ${f.people} (standing ${f.qualified})  wrists ${f.wrists.length}  body ${f.maskSource}\n` +
          `${hint}  (body fills ${(f.bodySpan * 100).toFixed(0)}% of frame)\n` +
          `model ${f.model || "…"}  ${f.inferMs.toFixed(0)} ms/frame${f.inferMs > 50 ? "  (slow)" : ""}\n` +
          `wave energy ${bar} ${w.energy.toFixed(2)}\n` +
          `proximity ${(fx.body()?.proximity ?? 0).toFixed(2)}  dots ×${(fx.body()?.visibility ?? 1).toFixed(2)}\n` +
          w.hands
            .map((h) => `hand (${h.x.toFixed(2)},${h.y.toFixed(2)}) vx ${h.vx.toFixed(2)}`)
            .join("\n");
        drawMaskPreview(maskCanvasRef.current, f);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frameRef]);

  const coordsFromEvent = useCallback((clientX: number, clientY: number) => {
    const el = wrapRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }, []);

  /** Next thought text, skipping any already on the surface. */
  const pickText = useCallback((): string => {
    const list = poolRef.current.length
      ? poolRef.current.map((t) => t.text)
      : FALLBACK_THOUGHTS;
    const showing = new Set(spawnedRef.current.map((s) => s.text));
    for (let tries = 0; tries < list.length; tries++) {
      const idx = nextPoolIdx.current % list.length;
      nextPoolIdx.current = idx + 1;
      const text = list[idx]!;
      if (!showing.has(text)) return text;
    }
    return list[nextPoolIdx.current++ % list.length]!;
  }, []);

  const setThoughts = useCallback((next: SpawnedThought[]) => {
    spawnedRef.current = next;
    spotsRef.current = next;
    setSpawned(next);
  }, []);

  const removeThought = useCallback(
    (key: string) => {
      const timer = timers.current.get(key);
      if (timer) window.clearTimeout(timer);
      timers.current.delete(key);
      setThoughts(spawnedRef.current.filter((s) => s.key !== key));
    },
    [setThoughts],
  );

  /**
   * Which visible thoughts would overlap a new one. Existing thoughts are
   * measured from the page; the new one's box is estimated from its text
   * (same max width / font size as TapThoughts), with a small margin.
   */
  const overlappingThoughts = useCallback((next: SpawnedThought): Set<string> => {
    const out = new Set<string>();
    const wrap = wrapRef.current;
    if (!wrap) return out;
    const W = wrap.clientWidth || window.innerWidth;
    const H = wrap.clientHeight || window.innerHeight;
    const wrapRect = wrap.getBoundingClientRect();
    // Estimate the new thought's box (10 pt text, max width min(20rem, 60vw), 20/16 px padding).
    const maxW = Math.min(320, W * 0.6);
    const textW = next.text.length * 6.4;
    const lines = Math.max(1, Math.ceil(textW / maxW));
    const halfW = Math.min(maxW, textW) / 2 + 20;
    const halfH = (lines * 19.5) / 2 + 16;
    const nx = next.x * W;
    const ny = next.y * H;
    const MARGIN = 8;
    for (const el of wrap.querySelectorAll<HTMLElement>("[data-thought-key]")) {
      const key = el.dataset.thoughtKey;
      if (!key || !spawnedRef.current.some((s) => s.key === key)) continue;
      const r = el.getBoundingClientRect();
      const cx = r.left - wrapRect.left + r.width / 2;
      const cy = r.top - wrapRect.top + r.height / 2;
      if (
        Math.abs(cx - nx) < r.width / 2 + halfW + MARGIN &&
        Math.abs(cy - ny) < r.height / 2 + halfH + MARGIN
      )
        out.add(key);
    }
    return out;
  }, []);

  /** Tap → a thought surfaces exactly here, and one fish rises beside it. */
  const spawnThought = useCallback(
    (x: number, y: number) => {
      const T = FX.tapThoughts;
      const now = performance.now();
      const key = `tap-${++tapCounter.current}`;
      const thought: SpawnedThought = {
        key,
        text: pickText(),
        x,
        y,
        born: now,
        until: now + T.holdMs,
        seed: Math.random(),
        spin: Math.random() < 0.5 ? -1 : 1,
      };
      // Never let words overlap: any thought whose text box would touch the
      // new one fades out (quickly), so the newest words are always clear.
      const covered = overlappingThoughts(thought);
      let current = spawnedRef.current.filter((s) => {
        if (!covered.has(s.key)) return true;
        const timer = timers.current.get(s.key);
        if (timer) window.clearTimeout(timer);
        timers.current.delete(s.key);
        quickExitRef.current.add(s.key);
        return false;
      });
      // Make room: the oldest thought sinks first.
      while (current.length >= T.maxAtOnce) {
        const oldest = current[0]!;
        const timer = timers.current.get(oldest.key);
        if (timer) window.clearTimeout(timer);
        timers.current.delete(oldest.key);
        current = current.slice(1);
      }
      setThoughts([...current, thought]);
      softTouch(fxRef, x, y, 1.05);
      timers.current.set(key, window.setTimeout(() => removeThought(key), T.holdMs));
    },
    [pickText, removeThought, setThoughts, overlappingThoughts],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (e.target !== e.currentTarget) return;
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        // Some touch overlays report pointers that can't be captured — the tap
        // should still work.
      }
      const c = coordsFromEvent(e.clientX, e.clientY);
      if (!c) return;
      // Pressure (touch overlays / pens report it) scales the drop.
      const p = e.pressure > 0 && e.pressure !== 0.5 ? e.pressure : 0.6;
      fxRef.current?.touch(c.x, c.y, FX.ripples.touchStrength * (0.6 + p * 0.7));
      pointers.current.set(e.pointerId, c);

      const now = performance.now();
      if (now - lastTapAt.current >= FX.tapThoughts.cooldownMs) {
        lastTapAt.current = now;
        if (tapThoughts) spawnThought(c.x, c.y);
        // Ripple-only mode: the same tap ripple, without a thought or fish.
        else softTouch(fxRef, c.x, c.y, 1.05);
      }
    },
    [coordsFromEvent, spawnThought, tapThoughts],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const prev = pointers.current.get(e.pointerId);
      if (!prev) return;
      const c = coordsFromEvent(e.clientX, e.clientY);
      if (!c) return;
      const dist = Math.hypot(c.x - prev.x, c.y - prev.y);
      if (dist > 0.024) {
        // Dragging a finger = a trail of small drops (a finger through water).
        fxRef.current?.drop(c.x, c.y, FX.ripples.touchRadius * 0.6, 0.25);
        pointers.current.set(e.pointerId, c);
      }
    },
    [coordsFromEvent],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
  }, []);

  return (
    <div
      ref={wrapRef}
      className="fixed inset-0 z-0 touch-none bg-[#60B3CC]"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="presentation"
    >
      <Canvas
        orthographic
        camera={{ position: [0, 0, 1], zoom: 1, near: 0.1, far: 10 }}
        // Pixel density cap: 1.25 (was 1.75) roughly halves the shading work
        // per frame on projectors / laptop GPUs, for smooth motion.
        dpr={[1, 1.25]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          // Not needed (nothing reads the canvas back) and slows drawing on
          // some GPUs.
          preserveDrawingBuffer: false,
        }}
        style={{ width: "100%", height: "100%", pointerEvents: "none" }}
      >
        <RevealDriver sample={sample} fx={fxRef} thoughtsRef={spawnedRef} />
        <FxLayer
          frameRef={frameRef}
          apiRef={fxRef}
          textTexture={null}
          focusRef={focusRef}
          clearZonesRef={clearZonesRef}
          spotsRef={spotsRef}
        />
      </Canvas>

      {tapThoughts && <TapThoughts thoughts={spawned} quickExitRef={quickExitRef} />}

      {debug && (
        <canvas
          ref={maskCanvasRef}
          width={MASK_W}
          height={MASK_H}
          className="pointer-events-none absolute right-6 top-6 z-20 w-[240px] rounded border border-white/40"
        />
      )}
      {debug && (
        <pre
          ref={debugRef}
          className="pointer-events-none absolute left-6 top-6 z-20 rounded bg-black/40 p-3 font-mono text-[11px] leading-4 text-white"
        />
      )}

    </div>
  );
}
