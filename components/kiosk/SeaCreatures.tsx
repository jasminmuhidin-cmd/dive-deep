"use client";

import { ANGEL, FRILL } from "./frillyFish";
import { LEVELS } from "./DepthWater";

/**
 * Sea creatures from Saskia's site as soft, solid silhouettes with a faint
 * glow (like the projection's fish), each roaming its own level: frilly and
 * angel fish in the sunlight zone, jellyfish and a nautilus in the twilight,
 * an anglerfish, starfish and clam in the midnight zone.
 *
 * Swimmers cross their level and turn around at each end (the row moves,
 * the fish flips at the turn); jellies drift and bob; the floor creatures
 * only glow.
 */

const TONE = ["#bcdcf0", "#a9cbea", "#9dbde6"] as const;

/* Every shape faces left in its box; the row flips it when swimming right. */
function Frilly({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 120 62" width="100%" height="100%" fill={c}>
      <path d={FRILL.tail} />
      <path d={FRILL.dorsal} />
      <path d={FRILL.anal} />
      <path d={FRILL.body} />
      <path d={FRILL.pectoral} />
    </svg>
  );
}

function Angel({ c }: { c: string }) {
  return (
    <svg viewBox={ANGEL.viewBox} width="100%" height="100%" fill={c}>
      <path d={ANGEL.dorsal} />
      <path d={ANGEL.anal} />
      <path d={ANGEL.tail} />
      <path d={ANGEL.body} />
    </svg>
  );
}

function Jelly({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 100 130" width="100%" height="100%" className="kiosk-jelly">
      {[24, 38, 50, 62, 76].map((x, i) => (
        <path
          key={x}
          d={`M${x} 50 q ${i % 2 ? 5 : -5} 14 0 28 q ${i % 2 ? -5 : 5} 14 0 28`}
          fill="none"
          stroke={c}
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.8}
        />
      ))}
      <path d="M10 50C10 22 30 8 50 8C70 8 90 22 90 50C82 55 74 50 66 55C58 50 42 50 34 55C26 50 18 55 10 50Z" fill={c} />
    </svg>
  );
}

function Nautilus({ c }: { c: string }) {
  const cx = 52, cy = 50;
  const r = (a: number) => 2.4 * Math.exp(0.22 * a);
  const at = (a: number) => [cx + Math.cos(a) * r(a), cy + Math.sin(a) * r(a)] as const;
  const d = Array.from({ length: 61 }, (_, i) => at(2 * Math.PI + (2 * Math.PI * i) / 60))
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join("");
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <path d={`${d}Z`} fill={c} />
      {/* tentacles, facing left */}
      <path d="M22 56C14 58 8 62 4 66M24 60C18 64 14 70 12 76" fill="none" stroke={c} strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

function Angler({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 142 92" width="100%" height="100%" className="overflow-visible">
      <path d="M46 32C42 12 24 6 12 14" fill="none" stroke={c} strokeWidth={2.4} />
      <circle cx={12} cy={16} r={6} fill="#ffffff" className="kiosk-lure" />
      <path
        d="M30 52C34 30 62 22 88 30C104 35 112 44 116 50L136 34C138 33 140 34 139 36L132 54L139 72C140 74 138 75 136 74L116 60C110 72 96 82 76 84C52 86 32 76 30 62Z"
        fill={c}
      />
    </svg>
  );
}

function Star({ c }: { c: string }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const rad = i % 2 === 0 ? 44 : 18;
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    return `${(50 + Math.cos(a) * rad).toFixed(1)} ${(50 + Math.sin(a) * rad).toFixed(1)}`;
  });
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <path d={`M${pts.join("L")}Z`} fill={c} strokeLinejoin="round" stroke={c} strokeWidth={6} />
    </svg>
  );
}

function Clam({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 120 90" width="100%" height="100%">
      <path d="M12 58C22 22 96 20 108 58C108 76 90 86 60 86C30 86 12 76 12 58Z" fill={c} />
    </svg>
  );
}

const mid = (i: 0 | 1 | 2) => (LEVELS[i].from + LEVELS[i].to) / 2;

type Shape = (p: { c: string }) => React.ReactElement;
type Member = {
  C: Shape;
  lvl: 0 | 1 | 2;
  y: number;
  w: string;
  ar: number;
  /** swim: crosses from x0 to x1 and back; bob: drifts gently; floor: stays */
  move: "swim" | "bob" | "floor";
  x0: number;
  x1: number;
  dur: number;
  delay: number;
};

/** Roam ranges stay right of the level labels on the left. */
const CAST: Member[] = [
  { C: Frilly, lvl: 0, y: mid(0) - 0.05, w: "5.6em", ar: 120 / 62, move: "swim", x0: 0.36, x1: 0.9, dur: 24, delay: 0 },
  { C: Frilly, lvl: 0, y: mid(0) + 0.05, w: "4em", ar: 120 / 62, move: "swim", x0: 0.5, x1: 0.94, dur: 19, delay: -7 },
  { C: Angel, lvl: 0, y: mid(0) + 0.01, w: "3.8em", ar: 124 / 120, move: "swim", x0: 0.34, x1: 0.78, dur: 29, delay: -15 },
  { C: Jelly, lvl: 1, y: mid(1) - 0.02, w: "3.4em", ar: 100 / 130, move: "bob", x0: 0.6, x1: 0.72, dur: 16, delay: -3 },
  { C: Jelly, lvl: 1, y: mid(1) + 0.02, w: "2.6em", ar: 100 / 130, move: "bob", x0: 0.84, x1: 0.92, dur: 13, delay: -9 },
  { C: Nautilus, lvl: 1, y: mid(1) + 0.03, w: "3.4em", ar: 1, move: "swim", x0: 0.36, x1: 0.66, dur: 34, delay: -11 },
  { C: Angler, lvl: 2, y: mid(2) - 0.02, w: "5.4em", ar: 142 / 92, move: "swim", x0: 0.4, x1: 0.86, dur: 36, delay: -20 },
  { C: Star, lvl: 2, y: LEVELS[2].to - 0.025, w: "2.8em", ar: 1, move: "floor", x0: 0.46, x1: 0.46, dur: 0, delay: 0 },
  { C: Clam, lvl: 2, y: LEVELS[2].to - 0.03, w: "3.4em", ar: 120 / 90, move: "floor", x0: 0.68, x1: 0.68, dur: 0, delay: 0 },
];

export default function SeaCreatures() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {CAST.map(({ C, lvl, y, w, ar, move, x0, x1, dur, delay }, i) => {
        const time = move === "floor" ? undefined : { animationDuration: `${dur}s`, animationDelay: `${delay}s` };
        return (
          // the row is full-width, so its translateX % is a share of the screen
          <div
            key={i}
            className={`kiosk-row is-${move}`}
            style={{ top: `${y * 100}%`, ["--x0" as string]: `${x0 * 100}%`, ["--x1" as string]: `${x1 * 100}%`, ...time }}
          >
            <div
              className={`kiosk-creature is-${move}`}
              style={{
                width: w,
                aspectRatio: String(ar),
                ...(move === "swim" && { animationDuration: `${dur * 2}s`, animationDelay: `${delay}s` }),
              }}
            >
              <C c={TONE[lvl]} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
