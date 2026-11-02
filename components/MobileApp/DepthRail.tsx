"use client";

import { useState, type RefObject } from "react";
import { motion, useMotionValueEvent, useTransform, type MotionValue } from "framer-motion";

export type Checkpoint = { label: string; ref: RefObject<HTMLElement | null> };

const clamp01 = (p: number) => Math.max(0, Math.min(1, p));

/** Closest two labels may sit, as a share of the rail, so neighbouring levels never overlap */
const MIN_GAP = 0.045;

/** Each label at its stop, nudged down past the one above it when they'd collide */
function spaced(stops: number[]): number[] {
  let last = -MIN_GAP;
  return stops.map((stop) => {
    if (stop < 0) return stop;
    last = Math.max(stop, last + MIN_GAP);
    return last;
  });
}

/**
 * How long a mark's name stays out, in screen heights of scrolling: it pops out
 * just before you reach it, and tucks back in once you've scrolled this far past.
 */
const OPEN_BEFORE = 0.15;
const OPEN_AFTER = 0.6;

/** Clear space round each mark on the line, px: a dot, and the open label */
const DOT_GAP = 8;
const PILL_GAP = 16;

/**
 * The line, cut away round each mark — the marks are outlines, so the line
 * mustn't run through them.
 */
function lineMask(placed: number[], current: number): string {
  const bands = placed
    .map((stop, i) => ({ stop, gap: i === current ? PILL_GAP : DOT_GAP }))
    .filter(({ stop }) => stop >= 0)
    .map(
      ({ stop, gap }) =>
        `#fff calc(${stop * 100}% - ${gap}px), transparent calc(${stop * 100}% - ${gap}px), transparent calc(${stop * 100}% + ${gap}px), #fff calc(${stop * 100}% + ${gap}px)`,
    );
  return `linear-gradient(to bottom, #fff 0%, ${bands.join(", ")}${bands.length ? ", " : ""}#fff 100%)`;
}

/**
 * A fine line down the right edge with an outlined mark for each part of the
 * dive. The line darkens behind you; as you reach each part, its name pops out
 * of its mark, inward across the screen, and tucks back in once you've
 * scrolled on past. Tap a mark to go there.
 */
export default function DepthRail({
  checkpoints,
  stops,
  progress,
  shown,
}: {
  checkpoints: Checkpoint[];
  /** Where along the scroll each checkpoint is reached, 0–1 (-1 if it isn't on the page) */
  stops: number[];
  progress: MotionValue<number>;
  /** Kept out of the way of the opening screen */
  shown: boolean;
}) {
  const [reached, setReached] = useState(-1);
  /** The mark whose name is out right now, if you're at one */
  const [open, setOpen] = useState(-1);
  const filled = useTransform(progress, (p) => `${clamp01(p) * 100}%`);
  const placed = spaced(stops);
  const mask = lineMask(placed, open);

  useMotionValueEvent(progress, "change", (p) => {
    setReached(stops.reduce((last, stop, i) => (stop >= 0 && p >= stop - 0.002 ? i : last), -1));
    // the window round each stop, from scroll share into screen heights
    const screens = (document.documentElement.scrollHeight - window.innerHeight) / window.innerHeight;
    setOpen(
      stops.findIndex((stop) => {
        if (stop < 0) return false;
        const away = (p - stop) * screens;
        return away >= -OPEN_BEFORE && away <= OPEN_AFTER;
      }),
    );
  });

  return (
    <nav
      aria-label="How deep you are"
      className={`pointer-events-none fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-1.5 top-[calc(env(safe-area-inset-top)+1.5rem)] z-20 w-6 transition-opacity duration-700 md:right-3 ${
        shown ? "opacity-100" : "opacity-0"
      }`}
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2" style={{ WebkitMaskImage: mask, maskImage: mask }} aria-hidden>
        <span className="absolute inset-0 bg-current opacity-25" />
        <motion.span className="absolute inset-x-0 top-0 bg-current opacity-80" style={{ height: filled }} />
      </span>
      {checkpoints.map(({ label, ref }, i) => {
        const stop = placed[i];
        if (stop === undefined || stop < 0) return null;
        const current = i === reached;
        const out = i === open;
        const passed = i <= reached && !out;
        return (
          <button
            key={label}
            type="button"
            tabIndex={shown ? 0 : -1}
            onClick={() => {
              const el = ref.current;
              if (!el) return;
              const top = el.getBoundingClientRect().top + window.scrollY;
              window.scrollTo({ top: top - window.innerHeight * 0.15, behavior: "smooth" });
            }}
            aria-label={`Go to ${label}`}
            aria-current={current ? "location" : undefined}
            // pinned by its right edge, so it opens leftward, into the screen; a finger-sized target round a small mark
            className={`absolute right-0 flex min-h-8 min-w-8 -translate-y-1/2 items-center justify-end rounded-full focus-visible:outline focus-visible:outline-1 focus-visible:outline-current ${
              shown ? "pointer-events-auto" : ""
            }`}
            style={{ top: `${stop * 100}%` }}
          >
            <span
              className={`flex items-center justify-end whitespace-nowrap rounded-full border border-current transition-all duration-500 ease-out ${
                out ? "mr-0 h-6 pl-3 pr-3" : `mr-[7px] h-2.5 min-w-2.5 px-0 ${passed ? "opacity-90" : "opacity-45"}`
              }`}
            >
              {/* the name unrolls out of the mark as you arrive, and rolls back in as you leave */}
              <span
                className={`overflow-hidden leading-none tracking-[0.04em] transition-[max-width,opacity] duration-500 ease-out ${
                  out ? "max-w-24 opacity-100" : "max-w-0 opacity-0"
                }`}
              >
                {label}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
