"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WaterPlane } from "./WaterPlane";
import { useWebcamFeed } from "./useWebcamFeed";
import { useThoughts, type ThoughtPlacement } from "./useThoughts";
import { useLaroseRipples } from "./useLaroseRipples";
import { useMotionSense } from "./useMotionSense";
import ThoughtOverlay, { REVEAL_MS, type ActivePrompt } from "./ThoughtOverlay";

/** Only clear movement leaves ripples — still people are ignored */
const MOVE_DELTA = 0.02;
/** Min frame motion (0–1) before we treat it as “general movement” */
const AMOUNT_MIN = 0.05;
/**
 * Soft organic touches while text is revealed — irregular timing & jitter.
 */
const REVEAL_GAP_MIN = 220;
const REVEAL_GAP_MAX = 480;

function softTouch(
  ripples: ReturnType<typeof useLaroseRipples>,
  cx: number,
  cy: number,
  strength = 1,
) {
  // Several gentle rings near the point of touch — like fingertips on water
  const n = 2 + Math.floor(Math.random() * 3); // 2–4
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = 0.008 + Math.random() * 0.028;
    const x = Math.min(1, Math.max(0, cx + Math.cos(ang) * rad));
    const y = Math.min(1, Math.max(0, cy + Math.sin(ang) * rad * 0.75));
    const size = (0.55 + Math.random() * 0.45) * strength;
    // Stagger slightly so they don’t fire as one robotic pulse
    const delay = i * (40 + Math.random() * 70);
    if (delay < 4) ripples.splashRing(x, y, size);
    else window.setTimeout(() => ripples.splashRing(x, y, size), delay);
  }
}

function MotionDriver({
  sample,
  ripples,
  activeRef,
}: {
  sample: ReturnType<typeof useMotionSense>["sample"];
  ripples: ReturnType<typeof useLaroseRipples>;
  activeRef: React.MutableRefObject<ActivePrompt | null>;
}) {
  const prevByTrack = useRef(new Map<number, { x: number; y: number }>());
  const nextRevealAt = useRef(0);
  const wasRevealing = useRef(false);

  useFrame(() => {
    ripples.tick();

    const active = activeRef.current;
    const now = performance.now();
    const revealing = !!(active && active.until > now);

    if (revealing && active) {
      if (!wasRevealing.current) {
        // First organic touch already fired on click — schedule the next
        nextRevealAt.current =
          now + REVEAL_GAP_MIN + Math.random() * (REVEAL_GAP_MAX - REVEAL_GAP_MIN);
      } else if (now >= nextRevealAt.current) {
        softTouch(ripples, active.x, active.y, 0.85);
        nextRevealAt.current =
          now + REVEAL_GAP_MIN + Math.random() * (REVEAL_GAP_MAX - REVEAL_GAP_MIN);
      }
      wasRevealing.current = true;
    } else if (wasRevealing.current) {
      wasRevealing.current = false;
      nextRevealAt.current = 0;
    }

    const motion = sample();
    const alive = new Set<number>();

    if (motion.amount < AMOUNT_MIN) {
      prevByTrack.current.clear();
      return;
    }

    for (const track of motion.tracks) {
      alive.add(track.id);
      const prev = prevByTrack.current.get(track.id);
      if (!prev) {
        ripples.splash(track.x, track.y, 0.95);
        prevByTrack.current.set(track.id, { x: track.x, y: track.y });
        continue;
      }

      const dx = track.x - prev.x;
      const dy = track.y - prev.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= MOVE_DELTA) continue;

      const steps = Math.max(1, Math.min(3, Math.ceil(dist / 0.05)));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        ripples.splash(prev.x + dx * t, prev.y + dy * t, 0.9);
      }
      prevByTrack.current.set(track.id, { x: track.x, y: track.y });
    }

    for (const id of [...prevByTrack.current.keys()]) {
      if (!alive.has(id)) prevByTrack.current.delete(id);
    }
  });

  return null;
}

export default function ProjectionScene() {
  const { video, status } = useWebcamFeed();
  const thoughts = useThoughts(48);
  const ripples = useLaroseRipples();
  const { sample } = useMotionSense(video);

  const [textTexture, setTextTexture] = useState<THREE.CanvasTexture | null>(
    null,
  );

  const [active, setActive] = useState<ActivePrompt | null>(null);
  const [now, setNow] = useState(() => performance.now());
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const lastDrawPos = useRef<{ x: number; y: number } | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const onTextTexture = useCallback((tex: THREE.CanvasTexture | null) => {
    setTextTexture(tex);
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = performance.now();
      setNow(t);
      if (activeRef.current && activeRef.current.until <= t) {
        setActive(null);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const coordsFromEvent = useCallback((clientX: number, clientY: number) => {
    const el = wrapRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      yCss: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }, []);

  const splashAt = useCallback(
    (x: number, yCss: number, strong = false) => {
      if (strong) {
        softTouch(ripples, x, yCss, 1.05);
      } else {
        ripples.splash(x, yCss, 0.9);
      }
    },
    [ripples],
  );

  const onSelectThought = useCallback(
    (thought: ThoughtPlacement) => {
      splashAt(thought.x, thought.y, true);
      setActive({
        thoughtId: thought.id,
        text: thought.text,
        x: thought.x,
        y: thought.y,
        until: performance.now() + REVEAL_MS,
      });
    },
    [splashAt],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (e.target !== e.currentTarget) return;

      drawingRef.current = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);

      const c = coordsFromEvent(e.clientX, e.clientY);
      if (!c) return;
      splashAt(c.x, c.yCss);
      lastDrawPos.current = { x: c.x, y: c.yCss };
    },
    [coordsFromEvent, splashAt],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drawingRef.current) return;
      const c = coordsFromEvent(e.clientX, e.clientY);
      if (!c) return;
      const prev = lastDrawPos.current;
      if (
        !prev ||
        Math.abs(c.x - prev.x) > 0.008 ||
        Math.abs(c.yCss - prev.y) > 0.008
      ) {
        splashAt(c.x, c.yCss);
        lastDrawPos.current = { x: c.x, y: c.yCss };
      }
    },
    [coordsFromEvent, splashAt],
  );

  const onPointerUp = useCallback(() => {
    drawingRef.current = false;
    lastDrawPos.current = null;
  }, []);

  return (
    <div
      ref={wrapRef}
      className="fixed inset-0 z-0 touch-none bg-[#3a9bb8]"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="presentation"
    >
      <Canvas
        orthographic
        camera={{ position: [0, 0, 1], zoom: 1, near: 0.1, far: 10 }}
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          preserveDrawingBuffer: true,
        }}
        style={{ width: "100%", height: "100%", pointerEvents: "none" }}
      >
        <MotionDriver
          sample={sample}
          ripples={ripples}
          activeRef={activeRef}
        />
        <WaterPlane ripples={ripples} textTexture={textTexture} />
      </Canvas>

      <ThoughtOverlay
        thoughts={thoughts}
        active={active}
        now={now}
        onSelect={onSelectThought}
        onTextTexture={onTextTexture}
      />

      <p className="pointer-events-none absolute bottom-6 right-6 z-10 font-mono text-[10px] uppercase tracking-[0.22em] text-[#0d4a5c]/45">
        {status === "requesting"
          ? "waiting for camera…"
          : status === "ready"
            ? "move · tap a blurry thought"
            : "tap a blurry thought"}
      </p>
    </div>
  );
}
