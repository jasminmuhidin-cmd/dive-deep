"use client";

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { motion } from "framer-motion";
import Ripples, { CHALK, LINE_DASH, LINE_WIDTH } from "./Ripples";
import { seeded } from "./seeded";

/** Seconds between each ripple surfacing */
const STEP = 0.24;

export type RippleNode = { key: string; content: ReactNode };
/** Where the line passes through, and how far up and down it must hold straight there (a ring's whole row) */
type Stop = { x: number; y: number; top: number; bottom: number };

/** Each ripple sits a little left or right of the last, so the chain wanders down */
function indent(seed: string, key: string, i: number): number {
  return (i % 2 ? 6 : 0) + seeded(`${seed}-${key}`) * 5;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Px above and below the middle of each gap the line takes to cross over to the next ring */
const EASE = 14;

/**
 * One smooth line down through every stop: straight down through each ring's
 * row, so it never crosses the words beside it, then easing across to the
 * next ring in a single soft S-bend in the gap between rows. The bends meet
 * the straights head-on, so there are no corners anywhere along it.
 */
function waterLine(stops: Stop[]): string {
  if (stops.length < 2) return "";
  let d = `M${r1(stops[0].x)} ${r1(stops[0].y)}`;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (Math.abs(b.x - a.x) < 0.5) {
      d += `L${r1(b.x)} ${r1(b.y)}`;
      continue;
    }
    const gap = (a.bottom + b.top) / 2;
    const ease = Math.max(1, Math.min(EASE, gap - a.y, b.y - gap));
    d += `L${r1(a.x)} ${r1(gap - ease)}`;
    d += `C${r1(a.x)} ${r1(gap)} ${r1(b.x)} ${r1(gap)} ${r1(b.x)} ${r1(gap + ease)}`;
    d += `L${r1(b.x)} ${r1(b.y)}`;
  }
  return d;
}

/**
 * Ripples surfacing one after another, joined by a dashed line drifting
 * through the water from `anchorRef` (the fish) — ending at `reply`, if there is one.
 */
export default function RippleChain({
  nodes,
  reply,
  anchorRef,
  seed,
}: {
  nodes: RippleNode[];
  reply?: ReactNode;
  anchorRef: RefObject<HTMLElement | null>;
  seed: string;
}) {
  const [stops, setStops] = useState<Stop[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const ringRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const replyRef = useRef<HTMLSpanElement>(null);
  const replyWrapRef = useRef<HTMLDivElement>(null);

  // Re-measure whenever the layout settles (text wrapping, a new reply)
  const count = nodes.length;
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const base = wrap.getBoundingClientRect();
      const at = (r: DOMRect, fx: number, fy: number) => ({
        x: r.left + r.width * fx - base.left,
        y: r.top + r.height * fy - base.top,
      });
      // The line keeps to the rings' own column: it drops straight down out of each
      // ring and only crosses over to the next in the gap between rows, clear of the words
      const pts: Stop[] = [];
      const point = (p: { x: number; y: number }): Stop => ({ ...p, top: p.y, bottom: p.y });
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (anchor) pts.push(point(at(anchor, 0.5, 0.8)));
      for (const el of ringRefs.current.slice(0, count)) {
        const row = el?.parentElement?.getBoundingClientRect();
        if (!el || !row) continue;
        pts.push({ ...at(el.getBoundingClientRect(), 0.5, 0.5), top: row.top - base.top, bottom: row.bottom - base.top });
      }
      // ending at the top edge of the reply's pool, if it marks one, so the two join
      const endEl = replyWrapRef.current?.querySelector("[data-chain-end]") ?? replyRef.current;
      const end = endEl?.getBoundingClientRect();
      if (end) pts.push(point(at(end, 0, 0)));
      setStops(pts);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [anchorRef, count]);

  const d = waterLine(stops);

  return (
    <div ref={wrapRef} className="relative pb-8">
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-white" aria-hidden>
        {stops.length > 1 && (
          // uneven dashes drifting slowly down the line, like a current
          <motion.path
            d={d}
            className="dive-current"
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.9}
            strokeWidth={LINE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={LINE_DASH.join(" ")}
            filter={CHALK}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: (count + 1) * STEP + 0.4, ease: "easeOut" }}
          />
        )}
      </svg>

      {nodes.map((node, i) => (
        <motion.div
          key={node.key}
          className="relative flex items-center"
          style={{ paddingLeft: `${indent(seed, node.key, i)}%` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: (i + 1) * STEP, duration: 0.7 }}
        >
          <span
            ref={(el) => {
              ringRefs.current[i] = el;
            }}
            className="relative grid h-14 w-14 shrink-0 place-items-center text-white"
          >
            <Ripples size={56} seed={`${seed}-${node.key}`} delay={-seeded(`${seed}-${node.key}`, 2) * 6} />
          </span>
          {/* beside the rings, never under them, with room enough that the rings never reach the words */}
          <div className="ml-5 min-w-0 flex-1 py-4 leading-[1.5]">{node.content}</div>
        </motion.div>
      ))}

      {reply && (
        <motion.div
          ref={replyWrapRef}
          className="relative ml-[6%] mt-8 w-fit"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: (count + 1) * STEP, duration: 0.7 }}
        >
          {/* the line comes to rest at the top of the reply's own ripple (or its marked `data-chain-end`) */}
          <span ref={replyRef} className="absolute left-1/2 top-0" aria-hidden />
          {reply}
        </motion.div>
      )}
    </div>
  );
}
