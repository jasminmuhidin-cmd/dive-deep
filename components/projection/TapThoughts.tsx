"use client";

import { useEffect, useRef, useState } from "react";

export type SpawnedThought = {
  /** Unique per tap (the same words can surface twice) */
  key: string;
  text: string;
  /** Tap point, screen uv 0–1 (x from left, y from top) */
  x: number;
  y: number;
  born: number;
  until: number;
  /** For the fish that surfaces beside it */
  seed: number;
  spin: number;
};

/** Fade in / out duration (ms) */
const FADE_MS = 1400;
/** Slow rise out of the water when a thought first appears (ms). */
const ENTER_MS = 2000;
/** How long the angled lines take to drift straight and aligned (ms). */
const SETTLE_MS = 3600;
/** Each line surfaces a little after the one above it (ms). */
const LINE_STAGGER_MS = 190;
/** Quick fade for a thought covered by a newer one (ms), so words never overlap. */
const QUICK_FADE_MS = 450;

type Shown = SpawnedThought & { leaving: boolean };

/**
 * Thoughts rise to the surface exactly where the water was tapped.
 * Nothing is previewed before a tap — no blurred teasers, no placeholders.
 * No dark backdrop: the words appear on the water with a faint light glow
 * behind them (like the glow around the tapped fish).
 *
 * Plain CSS transitions (no animation library). A thought that is removed
 * stays mounted for FADE_MS while it fades out.
 *
 * Type keeps the projection's font ("Ethereal Ming" / Playfair, the
 * .ethereal-text class) at 10 pt, bold white with a faint light halo (no dark
 * outline). Each thought is set as a few short lines that surface gently
 * tilted and offset, then slowly drift straight and aligned as they float. The words sit
 * above the water (ripples pass behind them, they never follow the ripples)
 * and sway on their own slow rhythm, rising slowly out of the water when tapped.
 */
export default function TapThoughts({
  thoughts,
  quickExitRef,
}: {
  thoughts: SpawnedThought[];
  /** Keys of thoughts replaced by an overlapping newer one: they fade out quickly. */
  quickExitRef?: React.RefObject<Set<string>>;
}) {
  const [shown, setShown] = useState<Shown[]>([]);
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    const keys = new Set(thoughts.map((t) => t.key));
    setShown((prev) => {
      const prevKeys = new Set(prev.map((p) => p.key));
      const next: Shown[] = prev.map((p) =>
        keys.has(p.key) ? { ...p, leaving: false } : { ...p, leaving: true },
      );
      for (const t of thoughts) if (!prevKeys.has(t.key)) next.push({ ...t, leaving: false });
      return next;
    });
  }, [thoughts]);

  // Unmount thoughts once they've faded out
  useEffect(() => {
    for (const s of shown) {
      if (s.leaving && !timers.current.has(s.key)) {
        const quick = quickExitRef?.current?.has(s.key) ?? false;
        timers.current.set(
          s.key,
          window.setTimeout(() => {
            timers.current.delete(s.key);
            quickExitRef?.current?.delete(s.key);
            setShown((prev) => prev.filter((p) => p.key !== s.key || !p.leaving));
          }, quick ? QUICK_FADE_MS : FADE_MS),
        );
      }
    }
  }, [shown]);

  useEffect(() => {
    const t = timers.current;
    return () => {
      for (const id of t.values()) window.clearTimeout(id);
      t.clear();
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      {/* Gentle floating sway — its own slow rhythm, never driven by the ripples. */}
      <style>{`
        /* Drift only (no tilt), so once the lines settle they stay straight. */
        @keyframes tt-bob {
          from { transform: translate(-2px, 2px); }
          to   { transform: translate(2px, -2px); }
        }
        @keyframes tt-sway {
          from { transform: translate(-2px, 1px); }
          to   { transform: translate(2px, -1px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .tt-bob, .tt-sway { animation: none !important; }
        }
      `}</style>
      {shown.map((t) => (
        <ThoughtText
          key={t.key}
          thought={t}
          quick={t.leaving && (quickExitRef?.current?.has(t.key) ?? false)}
        />
      ))}
    </div>
  );
}

/**
 * Break a thought into short, compact lines (about 3–4 words, ≤ 24 characters)
 * and give each a small, gentle tilt and sideways offset, alternating. Lines
 * surface at these angles and slowly drift straight and aligned (SETTLE_MS).
 * Deterministic per thought (seeded), so a thought never jumps around.
 */
function floatLines(text: string, seed: number) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (test.length > 24 && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  // Avoid a lonely last word: pull one word down from the previous line.
  if (lines.length > 1 && !lines[lines.length - 1]!.includes(" ")) {
    const prev = lines[lines.length - 2]!.split(" ");
    if (prev.length > 2) {
      const moved = prev.pop()!;
      lines[lines.length - 2] = prev.join(" ");
      lines[lines.length - 1] = `${moved} ${lines[lines.length - 1]}`;
    }
  }
  const rnd = (i: number) => {
    const x = Math.sin((seed + 1) * 9301 + i * 49297) * 233280;
    return x - Math.floor(x);
  };
  const start = rnd(0) < 0.5 ? -1 : 1;
  return lines.map((t, i) => {
    const side = i % 2 === 0 ? start : -start;
    return {
      text: t,
      // 1.5–3.5° tilt, alternating direction
      rot: side * (1.5 + rnd(i + 1) * 2),
      // 4–12 px sideways, alternating
      dx: side * (4 + rnd(i + 11) * 8),
    };
  });
}

function ThoughtText({ thought, quick }: { thought: Shown; quick: boolean }) {
  // Start hidden, then show a moment later so the rise-in transition runs.
  // (A short timer rather than animation frames, so it can never stall.)
  const [entered, setEntered] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Make the browser register the starting pose (low, blurred, angled)
    // before we switch to the settled one, so the transitions always play.
    rootRef.current?.getBoundingClientRect();
    if (rootRef.current) void getComputedStyle(rootRef.current).opacity;
    const id = window.setTimeout(() => setEntered(true), 60);
    return () => window.clearTimeout(id);
  }, []);

  const visible = entered && !thought.leaving;
  // Rising in is slow; fading out uses the normal (or quick) duration.
  const ms = thought.leaving ? (quick ? QUICK_FADE_MS : FADE_MS) : ENTER_MS;
  const ease = "cubic-bezier(0.22, 1, 0.36, 1)";
  // Seeded rhythm so each thought floats a little differently.
  const bobDur = 5 + thought.seed * 2; // 5–7 s

  return (
    <div
      ref={rootRef}
      style={{
        position: "absolute",
        left: `${thought.x * 100}%`,
        top: `${thought.y * 100}%`,
        // Surfaces from below: starts lower, a touch smaller and blurred,
        // and rises slowly into focus.
        transform: `translate(-50%, -50%) translateY(${visible ? 0 : thought.leaving ? -6 : 16}px) scale(${visible || thought.leaving ? 1 : 0.96})`,
        opacity: visible ? 1 : 0,
        filter: visible ? "blur(0px)" : `blur(${thought.leaving ? 6 : 8}px)`,
        transition: `opacity ${ms}ms ${ease}, filter ${ms}ms ${ease}, transform ${ms}ms ${ease}`,
      }}
    >
      <div
        className="tt-bob"
        style={{
          position: "relative",
          animation: `tt-bob ${bobDur.toFixed(2)}s ease-in-out ${(-thought.seed * bobDur).toFixed(2)}s infinite alternate`,
        }}
      >
      {/* Soft background glow, like the glow around the tapped fish — light
          and faint so the white words stay readable. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          // Half the earlier size (was 115% × 170%).
          width: "58%",
          height: "85%",
          transform: "translate(-50%, -50%)",
          background:
            // Half the earlier opacity (was 0.2 / 0.11 / 0.04).
            "radial-gradient(ellipse at center, rgba(225, 242, 255, 0.1) 0%, rgba(210, 236, 255, 0.055) 40%, rgba(200, 232, 255, 0.02) 62%, transparent 75%)",
          filter: "blur(8px)",
          pointerEvents: "none",
        }}
      />
      <div
        data-thought-key={thought.key}
        className="ethereal-text ethereal-light relative px-5 py-4"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          // Lines sit a little apart, like words drifting on the water.
          gap: "0.3em",
          fontSize: "10pt",
          lineHeight: 1.3,
          color: "rgb(255, 255, 255)",
          // Bold for readability on the light blues (the font has one weight,
          // so the browser emboldens it).
          fontWeight: 700,
          letterSpacing: "-0.01em",
          // A faint light halo only — no dark outline.
          textShadow: "0 0 6px rgba(255, 255, 255, 0.25)",
        }}
      >
        {floatLines(thought.text, thought.seed).map((l, i) => {
          // Each line rises a moment after the one above it.
          const delay = thought.leaving ? 0 : i * LINE_STAGGER_MS;
          // Surfaces angled and offset, then slowly drifts straight and aligned
          // (and stays straight while it fades out).
          const settled = entered;
          const settleMs = thought.leaving ? ms : SETTLE_MS;
          // Each line sways on its own rhythm (3.5–5.5 s), out of step.
          const swayDur = 3.5 + ((thought.seed * 7 + i * 1.37) % 2);
          return (
            <span
              key={i}
              style={{
                display: "block",
                whiteSpace: "nowrap",
                opacity: visible ? 1 : 0,
                transform: settled
                  ? "translateX(0px) translateY(0px) rotate(0deg)"
                  : `translateX(${l.dx}px) translateY(6px) rotate(${l.rot}deg)`,
                transition: `opacity ${ms}ms ${ease} ${delay}ms, transform ${settleMs}ms ${ease} ${delay}ms`,
              }}
            >
              <span
                className="tt-sway"
                style={{
                  display: "inline-block",
                  animation: `tt-sway ${swayDur.toFixed(2)}s ease-in-out ${(-(i * 1.9 + thought.seed * 4)).toFixed(2)}s infinite alternate`,
                }}
              >
                {l.text}
              </span>
            </span>
          );
        })}
      </div>
      </div>
    </div>
  );
}
