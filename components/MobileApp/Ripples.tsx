import type { CSSProperties } from "react";
import { seeded } from "./seeded";

/** Seconds for one ring to spread out and fade */
const SPREAD = 6;

/** Ripples and the lines between them are drawn through this, rather than glowing */
export const CHALK = "url(#dive-chalk)";

/** The darkest blue, for the faint shadow inside each ring's crest */
const TROUGH = "rgba(6, 27, 53, 0.16)";

/**
 * The page's shared filter, rendered once. Chalk softens a line and roughs it
 * up so it reads as something drawn by hand, like chalk dragged across wet
 * paper: its edges wobble a touch, it's blurred slightly, and grain breaks it up.
 */
export function DiveFilters() {
  return (
    <svg width={0} height={0} className="absolute" aria-hidden focusable="false">
      <filter id="dive-chalk" x="-15%" y="-15%" width="130%" height="130%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency={0.75} numOctaves={2} seed={5} result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale={1.8} xChannelSelector="R" yChannelSelector="G" result="wobble" />
        <feGaussianBlur in="wobble" stdDeviation={0.7} result="soft" />
        {/* the noise turned into cover that's full almost everywhere, with just a little grain left in it */}
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 3 -0.2" result="grain" />
        <feComposite in="soft" in2="grain" operator="in" />
      </filter>
    </svg>
  );
}

const r1 = (v: number) => Math.round(v * 100) / 100;

/** The chain's line and every ring share one stroke: this thickness, in px */
export const LINE_WIDTH = 1.1;
/** …and these uneven dashes, in px */
export const LINE_DASH = [9, 7, 2, 7, 14, 8, 3, 8];

/**
 * A ring as water draws it: never quite a circle, its edge swelling and
 * slackening gently as it goes round. Drawn at radius 47 round the origin.
 */
function ringPath(seed: string, ring: number): string {
  const lobes = 2 + Math.floor(seeded(seed, ring * 4) * 3);
  const p1 = seeded(seed, ring * 4 + 1) * Math.PI * 2;
  const p2 = seeded(seed, ring * 4 + 2) * Math.PI * 2;
  const pts = Array.from({ length: 36 }, (_, j) => {
    const t = (j / 36) * Math.PI * 2;
    const r = 47 * (1 + 0.022 * Math.sin(lobes * t + p1) + 0.012 * Math.sin((lobes + 3) * t + p2));
    return [r * Math.cos(t), r * Math.sin(t)];
  });
  // a smooth closed curve through them (Catmull-Rom, as Béziers)
  const at = (k: number) => pts[(k + pts.length) % pts.length];
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let k = 0; k < pts.length; k++) {
    const [p0, p1_, p2_, p3] = [at(k - 1), at(k), at(k + 1), at(k + 2)];
    d += `C${r1(p1_[0] + (p2_[0] - p0[0]) / 6)} ${r1(p1_[1] + (p2_[1] - p0[1]) / 6)} ${r1(p2_[0] - (p3[0] - p1_[0]) / 6)} ${r1(p2_[1] - (p3[1] - p1_[1]) / 6)} ${r1(p2_[0])} ${r1(p2_[1])}`;
  }
  return `${d}Z`;
}

/** Real ripples bunch together toward the middle and open out as they spread */
function restingScale(i: number, rings: number): number {
  return Math.sqrt((i + 1) / rings);
}

/**
 * Rings spreading from a point, like a drop landing in still water: rings
 * leave the centre one after another, evenly and without a pause, each
 * slowing as it widens and fading away as the next follows. Each ring is a
 * pale crest with a faint shadow just inside it, dashed like the chain's
 * line, slightly irregular, fading
 * as it spreads. Drawn in `currentColor`; keep it faint. Held still (reduced
 * motion), the rings rest where they'd be mid-spread.
 *
 * `once` lets them spread a single time, as a splash. `still` holds them
 * round something (from `inner` out to the edge), barely breathing.
 */
export default function Ripples({
  size = 88,
  rings = 4,
  delay = 0,
  seed = "ripple",
  once = false,
  still = false,
  inner = 0.7,
  className = "",
  style,
}: {
  size?: number;
  rings?: number;
  /** Seconds to offset the spreading by, so neighbouring ripples don't pulse in step */
  delay?: number;
  /** Shapes each ring's irregular edge */
  seed?: string;
  once?: boolean;
  still?: boolean;
  /** For `still` rings: how far out the innermost sits, as a share of the whole */
  inner?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const motion = still ? "dive-ripple-still" : once ? "dive-ripple-once" : "dive-ripple";
  // the line's dashes, from px into this drawing's units, so they match it at full spread
  // and stretch with the ring as it widens, never travelling round it
  const unit = 100 / size;
  const dash = {
    strokeDasharray: LINE_DASH.map((v) => +(v * unit).toFixed(2)).join(" "),
    strokeLinecap: "round" as const,
  };
  return (
    <svg
      viewBox="-50 -50 100 100"
      width={size}
      height={size}
      className={`pointer-events-none overflow-visible ${className}`}
      style={style}
      aria-hidden
    >
      <g filter={CHALK}>
        {Array.from({ length: rings }, (_, i) => {
          const d = ringPath(seed, i);
          // each ring a touch fainter than the one inside it
          const fade = 1 - (i / Math.max(1, rings)) * 0.2;
          return (
            <g
              key={i}
              className={motion}
              style={
                {
                  "--ring": still ? inner + ((1 - inner) * i) / Math.max(1, rings - 1) : restingScale(i, rings),
                  animationDuration: once ? "2.4s" : still ? "7s" : `${SPREAD}s`,
                  // spaced evenly through the cycle, so there's always a ring on its way out
                  animationDelay: once ? `${i * 0.3}s` : `${delay - (i * (still ? 7 : SPREAD)) / rings}s`,
                } as CSSProperties
              }
            >
              <path d={d} {...dash} fill="none" stroke="currentColor" strokeOpacity={fade} strokeWidth={LINE_WIDTH} vectorEffect="non-scaling-stroke" />
              <path d={d} {...dash} transform="scale(0.955)" fill="none" stroke={TROUGH} strokeWidth={LINE_WIDTH} vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
