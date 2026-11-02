"use client";

import { useId, useMemo } from "react";

/**
 * The visitor's own words, set small along a tight spiral — a ripple made of
 * their thought — with a few faint rings spreading from it.
 * The spiral grows only as many turns as the text needs, so it stays compact.
 */
const FONT = 6.4; // in viewBox units
const GAP = FONT * 1.45; // distance between turns
const B = GAP / (2 * Math.PI);
const R0 = 9; // inner radius
const MAX_CHARS = 200;

function spiralPath(text: string) {
  const need = Math.max(60, text.length * FONT * 0.56);
  // Walk outward until the spiral is long enough, then write it outside → in.
  const pts: [number, number][] = [];
  let th = R0 / B;
  let len = 0;
  let prev: [number, number] | null = null;
  while (len < need && pts.length < 4000) {
    const r = B * th;
    const p: [number, number] = [r * Math.cos(th), r * Math.sin(th)];
    if (prev) len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    pts.push(p);
    prev = p;
    th += 0.06;
  }
  const outer = B * th;
  pts.reverse();
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join("");
  return { d, outer };
}

export default function ThoughtSpiral({ text, size = 170, colour = "#0e2a44" }: { text: string; size?: number; colour?: string }) {
  const id = useId().replace(/:/g, "");
  const words = text.trim().replace(/\s+/g, " ");
  const shown = words.length > MAX_CHARS ? `${words.slice(0, MAX_CHARS - 1)}…` : words;
  const { d, outer } = useMemo(() => spiralPath(shown), [shown]);
  const vb = outer + FONT * 2;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* faint rings spreading from the thought */}
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="kiosk-ring absolute inset-0 rounded-full border"
          style={{ animationDelay: `${i * 1.6}s`, borderColor: colour }}
          aria-hidden
        />
      ))}
      <svg
        viewBox={`${-vb} ${-vb} ${vb * 2} ${vb * 2}`}
        className="kiosk-spiral relative h-full w-full"
        role="img"
        aria-label={`Your thought: ${words}`}
      >
        <defs>
          <path id={`s-${id}`} d={d} />
        </defs>
        <circle r={R0 * 0.55} fill={colour} opacity={0.9} />
        <text fill={colour} fontSize={FONT} fontWeight={700} style={{ letterSpacing: "0.02em" }}>
          <textPath href={`#s-${id}`}>{shown}</textPath>
        </text>
      </svg>
    </div>
  );
}
