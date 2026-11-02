"use client";

import { useId } from "react";
import { useReducedMotion } from "framer-motion";
import { seeded } from "./seeded";

/* ------------------------------------------------------------------ */
/* Which form a thought takes                                          */
/* ------------------------------------------------------------------ */

/** Weighted so the deep is mostly microbes, with the odd fish and shell */
const DEEP_KIND_WEIGHTS = [
  ["amoeba", 3],
  ["pseudopod", 3],
  ["bacillus", 2],
  ["cocci", 2],
  ["spirillum", 2],
  ["diatom", 1],
  ["angler", 1],
  ["jelly", 1],
  ["pearl", 1],
  ["clam", 1],
  ["nautilus", 1],
  ["starfish", 1],
] as const;

export type DeepKind = (typeof DEEP_KIND_WEIGHTS)[number][0];

/** Shells and pearls don't drift — they settle on the abyssal floor */
export function isFloorKind(kind: DeepKind): boolean {
  return kind === "pearl" || kind === "clam" || kind === "nautilus" || kind === "starfish";
}

/** A stable form for a thought — a drifting creature, or a shell or pearl if it's settled on the floor */
export function deepKindFor(id: string, floor = false): DeepKind {
  const pool = DEEP_KIND_WEIGHTS.filter(([kind]) => isFloorKind(kind) === floor);
  let r = seeded(id, 8) * pool.reduce((n, [, w]) => n + w, 0);
  for (const [kind, weight] of pool) {
    if (r < weight) return kind;
    r -= weight;
  }
  return pool[0][0];
}

/**
 * Pearlescent sheen — aqua, pale lemon and rose washed through the theme tint,
 * slowly sliding across the creature like light on a soap film.
 */
export function IridescentGradient({ id, tint }: { id: string; tint: string }) {
  const reduced = useReducedMotion();
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={64} y2={64} spreadMethod="reflect">
      <stop offset="0%" stopColor={tint} />
      <stop offset="22%" stopColor="#aef5e9" />
      <stop offset="44%" stopColor="#f3f6b4" />
      <stop offset="62%" stopColor={tint} />
      <stop offset="80%" stopColor="#f6c6e6" />
      <stop offset="100%" stopColor="#b8eef7" />
      {!reduced && (
        <animateTransform
          attributeName="gradientTransform"
          type="translate"
          values="0 0;64 64;0 0"
          dur="16s"
          repeatCount="indefinite"
        />
      )}
    </linearGradient>
  );
}

export function DeepForm({ kind, glow, seed }: { kind: DeepKind; glow: string; seed: string }) {
  const id = useSvgId("irid");
  return (
    <>
      <svg width={0} height={0} className="absolute" aria-hidden focusable="false">
        <defs>
          <IridescentGradient id={id} tint={glow} />
        </defs>
      </svg>
      <Form kind={kind} glow={`url(#${id})`} tint={glow} seed={seed} />
    </>
  );
}

/** `glow` is the iridescent paint; `tint` the plain theme colour, for gradient stops */
function Form({ kind, glow, tint, seed }: { kind: DeepKind; glow: string; tint: string; seed: string }) {
  switch (kind) {
    case "amoeba":
      return <Amoeba glow={glow} seed={seed} />;
    case "pseudopod":
      return <PseudopodAmoeba glow={glow} seed={seed} />;
    case "bacillus":
      return <Bacillus glow={glow} seed={seed} />;
    case "cocci":
      return <Cocci glow={glow} seed={seed} />;
    case "spirillum":
      return <Spirillum glow={glow} seed={seed} />;
    case "diatom":
      return <Diatom glow={glow} seed={seed} />;
    case "angler":
      return <Anglerfish glow={glow} flip={seeded(seed, 9) > 0.5} />;
    case "jelly":
      return <Jellyfish glow={glow} seed={seed} />;
    case "pearl":
      return <Pearl glow={glow} tint={tint} />;
    case "clam":
      return <Clam glow={glow} tint={tint} seed={seed} />;
    case "nautilus":
      return <Nautilus glow={glow} flip={seeded(seed, 9) > 0.5} />;
    case "starfish":
      return <Starfish glow={glow} seed={seed} />;
  }
}

/* ------------------------------------------------------------------ */
/* Shape helpers                                                       */
/* ------------------------------------------------------------------ */

type Pt = [number, number];
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Smooth closed curve through points (Catmull-Rom as cubic Béziers) */
function smoothClosed(pts: Pt[]): string {
  const n = pts.length;
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return `${d}Z`;
}

/** Closed blob with one radius per evenly spaced angle */
function radialBlob(radii: number[], cx = 50, cy = 50, rot = 0): string {
  return smoothClosed(
    radii.map((r, i) => {
      const a = rot + (i / radii.length) * Math.PI * 2;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    }),
  );
}

/** Morph an attribute through `frames` and back, unless the viewer prefers reduced motion */
function Morph({
  frames,
  dur,
  attr = "d",
  begin,
  linear = false,
}: {
  frames: (string | number)[];
  dur: number;
  attr?: string;
  begin?: string;
  /** Constant speed — for waves travelling along a body rather than breathing */
  linear?: boolean;
}) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <animate
      attributeName={attr}
      dur={`${dur}s`}
      begin={begin}
      repeatCount="indefinite"
      values={[...frames, frames[0]].join(";")}
      {...(linear
        ? { calcMode: "linear" }
        : {
            calcMode: "spline",
            keySplines: Array(frames.length).fill("0.45 0 0.55 1").join(";"),
          })}
    />
  );
}

/** Sine wave along x, as a polyline with a fixed point count so frames can morph */
function wavePath(x0: number, x1: number, y: number, amp: (x: number) => number, wavelength: number, phase: number) {
  const pts: string[] = [];
  for (let x = x0; x <= x1 + 0.01; x += 3) {
    pts.push(`${r1(x)} ${r1(y + Math.sin((x - x0) / wavelength + phase) * amp(x))}`);
  }
  return `M${pts.join("L")}`;
}

/** Frames of a wave travelling one full cycle — loops seamlessly at constant speed */
function travellingWave(make: (phase: number) => string, steps = 8) {
  return Array.from({ length: steps }, (_, i) => make((-i / steps) * Math.PI * 2));
}

/** SVG ids must be unique per instance and safe inside url(#…) */
export function useSvgId(prefix: string) {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/* ------------------------------------------------------------------ */
/* Microbes                                                            */
/* ------------------------------------------------------------------ */

function Amoeba({ glow, seed }: { glow: string; seed: string }) {
  const n = 8;
  const frames = [0, 1, 2].map((f) =>
    radialBlob(Array.from({ length: n }, (_, i) => 32 + seeded(`${seed}-a${f}-${i}`) * 10)),
  );
  const inner = [0, 1, 2].map((f) =>
    radialBlob(Array.from({ length: n }, (_, i) => 16 + seeded(`${seed}-ai${f}-${i}`) * 6), 48, 50),
  );
  const membrane = [0, 1, 2].map((f) =>
    radialBlob(Array.from({ length: n }, (_, i) => 28 + seeded(`${seed}-am${f}-${i}`) * 12), 50, 50, 0.4),
  );
  const dur = 7 + seeded(seed, 11) * 3;
  return (
    <svg viewBox="0 0 100 100" width={96} height={96} aria-hidden className="overflow-visible">
      <path d={frames[0]} fill="none" stroke={glow} strokeOpacity={0.09} strokeWidth={7}>
        <Morph frames={frames} dur={dur} />
      </path>
      <path d={frames[0]} fill={glow} fillOpacity={0.16} stroke={glow} strokeOpacity={0.55} strokeWidth={1.1}>
        <Morph frames={frames} dur={dur} />
      </path>
      <path d={membrane[0]} fill="none" stroke={glow} strokeOpacity={0.45} strokeWidth={1}>
        <Morph frames={membrane} dur={dur * 1.3} />
      </path>
      <circle cx={38} cy={58} r={5} fill="#06121c" fillOpacity={0.45} />
      <circle cx={62} cy={42} r={3.6} fill="#06121c" fillOpacity={0.4} />
      <path d={inner[0]} fill={glow} fillOpacity={0.14}>
        <Morph frames={inner} dur={9} />
      </path>
      <circle cx={48} cy={48} r={9} fill={glow} fillOpacity={0.45}>
        <Morph attr="cx" frames={[48, 55, 44]} dur={9} />
      </circle>
      <circle cx={48} cy={48} r={3.5} fill={glow}>
        <Morph attr="cx" frames={[48, 55, 44]} dur={9} />
      </circle>
      <circle cx={30} cy={36} r={2} fill={glow} fillOpacity={0.7} />
      <circle cx={68} cy={62} r={2.4} fill={glow} fillOpacity={0.6} />
      <circle cx={36} cy={66} r={1.6} fill={glow} fillOpacity={0.7} />
      <circle cx={64} cy={32} r={1.4} fill={glow} fillOpacity={0.6} />
    </svg>
  );
}

/** Amoeba reaching out with arms (pseudopods) that extend and retract */
function PseudopodAmoeba({ glow, seed }: { glow: string; seed: string }) {
  const n = 12;
  const arms = [0, 1, 2].map((a) => Math.floor(seeded(seed, 20 + a) * n));
  const radii = (frame: number, scale: number) =>
    Array.from({ length: n }, (_, i) => {
      const base = 20 + seeded(`${seed}-p${frame}-${i}`) * 5;
      const reach = arms.includes(i) ? 8 + seeded(`${seed}-reach${frame}-${i}`) * 18 : 0;
      return (base + reach) * scale;
    });
  const outer = [0, 1, 2].map((f) => radialBlob(radii(f, 1)));
  const inner = [0, 1, 2].map((f) => radialBlob(radii(f, 0.6)));
  return (
    <svg viewBox="0 0 100 100" width={104} height={104} aria-hidden className="overflow-visible">
      <path d={outer[0]} fill="none" stroke={glow} strokeOpacity={0.08} strokeWidth={7}>
        <Morph frames={outer} dur={8 + seeded(seed, 12) * 4} />
      </path>
      <path d={outer[0]} fill={glow} fillOpacity={0.14} stroke={glow} strokeOpacity={0.45} strokeWidth={1}>
        <Morph frames={outer} dur={8 + seeded(seed, 12) * 4} />
      </path>
      <path d={inner[0]} fill={glow} fillOpacity={0.16}>
        <Morph frames={inner} dur={8 + seeded(seed, 12) * 4} />
      </path>
      <circle cx={50} cy={50} r={6} fill={glow} fillOpacity={0.6} />
      <circle cx={50} cy={50} r={2.5} fill={glow} />
      <circle cx={42} cy={58} r={3.2} fill="none" stroke={glow} strokeOpacity={0.39} />
      <circle cx={58} cy={44} r={2.2} fill="none" stroke={glow} strokeOpacity={0.39} />
    </svg>
  );
}

/** Body angle in degrees; it swims along this axis, flagella trailing */
export function bacillusTilt(seed: string) {
  return -30 + seeded(seed, 13) * 60;
}

/** Rod-shaped bacterium trailing whip-like flagella */
function Bacillus({ glow, seed }: { glow: string; seed: string }) {
  const tilt = bacillusTilt(seed);
  // amplitude grows toward the free end, like a real flagellum
  const flagellum = (y: number) =>
    travellingWave((phase) => wavePath(88, 136, y, (x) => 1 + ((x - 88) / 48) * 6, 5, phase));
  return (
    <svg viewBox="0 0 140 70" width={124} height={62} aria-hidden className="overflow-visible">
      <g transform={`rotate(${r1(tilt)} 70 35)`}>
        {[31, 39].map((y, i) => {
          const frames = flagellum(y);
          return (
            <path
              key={y}
              d={frames[0]}
              fill="none"
              stroke={glow}
              strokeOpacity={0.39}
              strokeWidth={0.9}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Morph frames={frames} dur={0.5 + i * 0.12} linear />
            </path>
          );
        })}
        {/* pili */}
        {[36, 46, 56, 66, 76].map((x) => (
          <g key={x} stroke={glow} strokeOpacity={0.45} strokeWidth={0.8}>
            <line x1={x} y1={22} x2={x - 2} y2={16} />
            <line x1={x} y1={48} x2={x + 2} y2={54} />
          </g>
        ))}
        <rect x={28} y={22} width={60} height={26} rx={13} fill="none" stroke={glow} strokeOpacity={0.08} strokeWidth={7} />
        <rect x={28} y={22} width={60} height={26} rx={13} fill={glow} fillOpacity={0.2} stroke={glow} strokeOpacity={0.55} strokeWidth={1} />
        <ellipse cx={48} cy={35} rx={6} ry={3.5} fill={glow} fillOpacity={0.5} />
        <ellipse cx={66} cy={33} rx={4} ry={2.5} fill={glow} fillOpacity={0.4} />
        <circle cx={76} cy={38} r={2} fill={glow} fillOpacity={0.7} />
      </g>
    </svg>
  );
}

/** A curling chain of round bacteria, softly pulsing one after another */
function Cocci({ glow, seed }: { glow: string; seed: string }) {
  const count = 5 + Math.floor(seeded(seed, 14) * 3);
  const bend = 0.5 + seeded(seed, 15) * 0.8;
  const cells = Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const a = Math.PI * (0.15 + t * bend);
    return { x: r1(55 - Math.cos(a) * 40), y: r1(70 - Math.sin(a) * 40), r: 7 + seeded(`${seed}-c${i}`) * 2.5 };
  });
  return (
    <svg viewBox="0 0 110 80" width={104} height={76} aria-hidden className="overflow-visible">
      {cells.map((c, i) => (
        <g key={i}>
          <circle cx={c.x} cy={c.y} r={c.r} fill="none" stroke={glow} strokeOpacity={0.07} strokeWidth={6} />
          <circle cx={c.x} cy={c.y} r={c.r} fill={glow} fillOpacity={0.2} stroke={glow} strokeOpacity={0.52} strokeWidth={0.9}>
            <Morph attr="r" frames={[c.r, c.r * 1.12]} dur={2.4} begin={`${-i * 0.3}s`} />
          </circle>
          <circle cx={c.x} cy={c.y} r={2} fill={glow} fillOpacity={0.8} />
        </g>
      ))}
    </svg>
  );
}

/** Corkscrew bacterium wriggling through the dark */
function Spirillum({ glow, seed }: { glow: string; seed: string }) {
  const amp = 9 + seeded(seed, 16) * 6;
  const envelope = (x: number) => amp * (0.4 + Math.sin(((x - 10) / 100) * Math.PI) * 0.6);
  const frames = travellingWave((phase) => wavePath(10, 110, 40, envelope, 9, phase), 10);
  const dur = 1.4 + seeded(seed, 17) * 0.8;
  return (
    <svg viewBox="0 0 120 80" width={116} height={78} aria-hidden className="overflow-visible">
      <path d={frames[0]} fill="none" stroke={glow} strokeOpacity={0.15} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round">
        <Morph frames={frames} dur={dur} linear />
      </path>
      <path d={frames[0]} fill="none" stroke={glow} strokeOpacity={0.62} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        <Morph frames={frames} dur={dur} linear />
      </path>
    </svg>
  );
}

/** Glassy, radially symmetrical diatom slowly turning */
function Diatom({ glow, seed }: { glow: string; seed: string }) {
  const spokes = 14 + Math.floor(seeded(seed, 18) * 8);
  const reduced = useReducedMotion();
  return (
    <svg viewBox="0 0 100 100" width={92} height={92} aria-hidden>
      <g>
        {!reduced && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 50 50"
            to="360 50 50"
            dur="60s"
            repeatCount="indefinite"
          />
        )}
        <circle cx={50} cy={50} r={40} fill={glow} fillOpacity={0.1} stroke={glow} strokeOpacity={0.55} strokeWidth={1} />
        <circle cx={50} cy={50} r={30} fill="none" stroke={glow} strokeOpacity={0.33} strokeDasharray="2 3" />
        {Array.from({ length: spokes }, (_, i) => {
          const a = (i / spokes) * Math.PI * 2;
          return (
            <line
              key={i}
              x1={r1(50 + Math.cos(a) * 10)}
              y1={r1(50 + Math.sin(a) * 10)}
              x2={r1(50 + Math.cos(a) * 38)}
              y2={r1(50 + Math.sin(a) * 38)}
              stroke={glow}
              strokeOpacity={0.4}
              strokeWidth={0.8}
            />
          );
        })}
        {Array.from({ length: spokes }, (_, i) => {
          const a = ((i + 0.5) / spokes) * Math.PI * 2;
          return <circle key={i} cx={r1(50 + Math.cos(a) * 34)} cy={r1(50 + Math.sin(a) * 34)} r={1.1} fill={glow} fillOpacity={0.8} />;
        })}
        <circle cx={50} cy={50} r={7} fill={glow} fillOpacity={0.5} />
        <circle cx={50} cy={50} r={2.5} fill={glow} />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* The abyssal floor                                                   */
/* ------------------------------------------------------------------ */

function PearlGradient({ id, glow }: { id: string; glow: string }) {
  return (
    <radialGradient id={id} cx="38%" cy="32%" r="70%">
      <stop offset="0%" stopColor="#ffffff" />
      <stop offset="35%" stopColor="#f6f0ff" />
      <stop offset="60%" stopColor="#f6c6e6" />
      <stop offset="80%" stopColor="#aef5e9" />
      <stop offset="100%" stopColor={glow} />
    </radialGradient>
  );
}

function Pearl({ glow, tint }: { glow: string; tint: string }) {
  const id = useSvgId("pearl");
  return (
    <svg viewBox="0 0 80 80" width={78} height={78} aria-hidden className="overflow-visible">
      <defs>
        <PearlGradient id={id} glow={tint} />
      </defs>
      <circle cx={40} cy={40} r={28} fill={glow} fillOpacity={0.12}>
        <Morph attr="r" frames={[26, 33]} dur={3.2} />
      </circle>
      <circle cx={40} cy={40} r={18} fill={`url(#${id})`} />
      <ellipse cx={33} cy={32} rx={5} ry={3.4} fill="#ffffff" fillOpacity={0.85} transform="rotate(-30 33 32)">
        <Morph attr="cx" frames={[33, 36, 32]} dur={7} />
        <Morph attr="fill-opacity" frames={[0.85, 0.55, 0.95]} dur={5} />
      </ellipse>
      <path d="M26 50C32 56 46 58 54 50" fill="none" stroke="#ffd6e8" strokeOpacity={0.45} strokeWidth={1.1} strokeLinecap="round" />
    </svg>
  );
}

/** Clam that slowly opens to reveal a glowing pearl */
function Clam({ glow, tint, seed }: { glow: string; tint: string; seed: string }) {
  const id = useSvgId("clam-pearl");
  const reduced = useReducedMotion();
  const dur = 11 + seeded(seed, 19) * 6;
  return (
    <svg viewBox="0 0 120 90" width={118} height={88} aria-hidden className="overflow-visible">
      <defs>
        <PearlGradient id={id} glow={tint} />
      </defs>
      {/* lower shell */}
      <path d="M12 58C24 88 96 88 108 58C90 66 30 66 12 58Z" fill="#0b1120" stroke={glow} strokeOpacity={0.45} strokeWidth={1} />
      {[30, 48, 66, 84].map((x) => (
        <path key={x} d={`M${x} 64Q${x + 2} 74 ${x + 4} 82`} fill="none" stroke={glow} strokeOpacity={0.3} strokeWidth={0.9} />
      ))}
      {/* pearl */}
      <circle cx={62} cy={58} r={16} fill={glow} fillOpacity={0.18} />
      <circle cx={62} cy={58} r={8.5} fill={`url(#${id})`} />
      <circle cx={59} cy={55} r={2} fill="#ffffff" fillOpacity={0.9} />
      {/* upper shell, hinged at the left */}
      <g transform={reduced ? "rotate(-18 12 58)" : undefined}>
        {!reduced && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            values="0 12 58;-24 12 58;-22 12 58;0 12 58;0 12 58"
            keyTimes="0;0.32;0.66;0.7;1"
            calcMode="spline"
            keySplines="0.35 0 0.25 1;0.4 0 0.6 1;0.8 0 1 1;0 0 1 1"
            dur={`${dur}s`}
            repeatCount="indefinite"
          />
        )}
        <path d="M12 58C22 22 96 20 108 58C90 52 30 52 12 58Z" fill="#0d1424" stroke={glow} strokeOpacity={0.55} strokeWidth={1} />
        {[0.2, 0.4, 0.6, 0.8].map((t) => (
          <path
            key={t}
            d={`M16 56Q${r1(30 + t * 60)} ${r1(30 + Math.abs(t - 0.5) * 12)} ${r1(20 + t * 84)} ${r1(48 + Math.abs(t - 0.5) * 10)}`}
            fill="none"
            stroke={glow}
            strokeOpacity={0.35}
            strokeWidth={0.9}
          />
        ))}
      </g>
    </svg>
  );
}

/** Chambered nautilus shell (logarithmic spiral) */
function Nautilus({ glow, flip }: { glow: string; flip: boolean }) {
  const cx = 52;
  const cy = 50;
  const r = (t: number) => 2.4 * Math.exp(0.22 * t);
  const at = (t: number): Pt => [cx + Math.cos(t) * r(t), cy + Math.sin(t) * r(t)];
  const steps = 80;
  const start = 2 * Math.PI;
  const end = 4 * Math.PI;
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = start + ((end - start) * i) / steps;
    outer.push(at(t));
    inner.push(at(t - 2 * Math.PI));
  }
  const toPath = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${r1(x)} ${r1(y)}`).join("");
  const whorl = `${toPath(outer)}${toPath([...inner].reverse()).replace("M", "L")}Z`;
  const septa = Array.from({ length: 9 }, (_, i) => {
    const t = start + 0.6 + i * 0.62;
    const [x1, y1] = at(t - 2 * Math.PI);
    const [x2, y2] = at(t);
    const mx = (x1 + x2) / 2 - Math.cos(t) * 3;
    const my = (y1 + y2) / 2 - Math.sin(t) * 3;
    return `M${r1(x1)} ${r1(y1)}Q${r1(mx)} ${r1(my)} ${r1(x2)} ${r1(y2)}`;
  });
  const coil: Pt[] = [];
  for (let i = 0; i <= 60; i++) coil.push(at((2 * Math.PI * i) / 60));
  return (
    <svg
      viewBox="0 0 100 100"
      width={96}
      height={96}
      aria-hidden
      style={{ transform: flip ? "scaleX(-1)" : undefined }}
    >
      <path d={whorl} fill={glow} fillOpacity={0.16} stroke={glow} strokeOpacity={0.55} strokeWidth={1} strokeLinejoin="round" />
      <path d={toPath(coil)} fill="none" stroke={glow} strokeOpacity={0.39} strokeWidth={1} />
      {septa.map((d) => (
        <path key={d} d={d} fill="none" stroke={glow} strokeOpacity={0.45} strokeWidth={0.9} />
      ))}
      <circle cx={cx} cy={cy} r={1.6} fill={glow} />
    </svg>
  );
}

function Starfish({ glow, seed }: { glow: string; seed: string }) {
  const rot = -Math.PI / 2 + (seeded(seed, 20) - 0.5) * 0.8;
  const star = (curl: number) =>
    smoothClosed(
      Array.from({ length: 10 }, (_, i) => {
        const tip = i % 2 === 0;
        const radius = tip ? 42 + seeded(`${seed}-arm${i}`) * 4 - curl * ((i / 2) % 2) : 15;
        const a = rot + (i / 10) * Math.PI * 2 + (tip ? curl * 0.04 : 0);
        return [50 + Math.cos(a) * radius, 50 + Math.sin(a) * radius] as Pt;
      }),
    );
  const frames = [star(0), star(4)];
  return (
    <svg viewBox="0 0 100 100" width={96} height={96} aria-hidden className="overflow-visible">
      <path d={frames[0]} fill={glow} fillOpacity={0.18} stroke={glow} strokeOpacity={0.55} strokeWidth={1} strokeLinejoin="round">
        <Morph frames={frames} dur={14 + seeded(seed, 21) * 8} />
      </path>
      {Array.from({ length: 5 }, (_, arm) =>
        [14, 23, 32].map((d) => {
          const a = rot + (arm / 5) * Math.PI * 2;
          return (
            <circle
              key={`${arm}-${d}`}
              cx={r1(50 + Math.cos(a) * d)}
              cy={r1(50 + Math.sin(a) * d)}
              r={d === 32 ? 1.2 : 1.7}
              fill={glow}
              fillOpacity={0.75}
            />
          );
        }),
      )}
      <circle cx={50} cy={50} r={4} fill={glow} fillOpacity={0.6} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Fish & jellies                                                      */
/* ------------------------------------------------------------------ */

function Anglerfish({ glow, flip }: { glow: string; flip: boolean }) {
  return (
    <svg
      viewBox="0 0 142 92"
      width={128}
      height={83}
      aria-hidden
      className="overflow-visible"
      style={{ transform: flip ? "scaleX(-1)" : undefined }}
    >
      {/* stalk + lure, swaying from the base of the stalk */}
      <g className="dive-lure-sway" style={{ transformOrigin: "46px 32px" }}>
        <path
          d="M46 32C42 12 24 6 12 14"
          fill="none"
          stroke={glow}
          strokeOpacity={0.36}
          strokeWidth={1}
        />
        <circle cx={12} cy={16} r={13} fill={glow} opacity={0.18} className="dive-lure" />
        <circle cx={12} cy={16} r={4.5} fill={glow} className="dive-lure" />
      </g>
      {/* body */}
      <path
        d="M30 52C34 30 62 22 88 30C104 35 112 44 116 50L136 34C138 33 140 34 139 36L132 54L139 72C140 74 138 75 136 74L116 60C110 72 96 82 76 84C52 86 32 76 30 62Z"
        fill={glow}
        fillOpacity={0.32}
        stroke={glow}
        strokeOpacity={0.59}
        strokeWidth={1}
      />
      {/* gill + fin lines */}
      <path d="M64 40C70 50 70 62 64 72" fill="none" stroke={glow} strokeOpacity={0.36} strokeWidth={1} />
      <path d="M118 52C124 50 130 46 134 40M118 58C124 60 130 64 134 70" fill="none" stroke={glow} strokeOpacity={0.4} strokeWidth={0.8} />
      {/* jaw + teeth */}
      <path
        d="M30 58C40 60 50 64 58 72"
        fill="none"
        stroke={glow}
        strokeOpacity={0.4}
        strokeWidth={1}
      />
      <path
        d="M32 55l3 6 3-6 3 6 3-6 3 6 3-5"
        fill="none"
        stroke="#f4efe4"
        strokeOpacity={0.49}
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
      {/* eye */}
      <circle cx={52} cy={41} r={7} fill="none" stroke={glow} strokeOpacity={0.45} strokeWidth={0.9} />
      <circle cx={52} cy={41} r={4.2} fill={glow} fillOpacity={0.85} />
      <circle cx={51} cy={41} r={1.7} fill="#020308" />
      {/* photophores */}
      <circle cx={74} cy={70} r={1.4} fill={glow} />
      <circle cx={84} cy={68} r={1.4} fill={glow} />
      <circle cx={94} cy={64} r={1.4} fill={glow} />
      <circle cx={104} cy={59} r={1.2} fill={glow} />
    </svg>
  );
}

/** Seconds per jellyfish pulse — shared so the bell squeeze and the upward push line up */
export function jellyPulse(seed: string) {
  return 3.2 + seeded(seed, 22) * 1.2;
}

const BELL_RELAXED =
  "M10 50C10 22 30 8 50 8C70 8 90 22 90 50C82 55 74 50 66 55C58 50 42 50 34 55C26 50 18 55 10 50Z";
const BELL_CONTRACTED =
  "M18 52C16 20 32 4 50 4C68 4 84 20 82 52C76 56 70 52 64 56C56 52 44 52 36 56C30 52 24 56 18 52Z";

/** Vertical wave hanging from (x0, y0) — tentacles ripple more toward their tips */
function tentacleFrames(x0: number, length: number, seed: string) {
  return travellingWave((phase) => {
    const pts: string[] = [];
    for (let y = 0; y <= length + 0.01; y += 4) {
      const amp = 1 + (y / length) * (4 + seeded(seed) * 3);
      pts.push(`${r1(x0 + Math.sin(y / 9 + phase) * amp)} ${r1(52 + y)}`);
    }
    return `M${pts.join("L")}`;
  }, 8);
}

function Jellyfish({ glow, seed }: { glow: string; seed: string }) {
  const reduced = useReducedMotion();
  const pulse = jellyPulse(seed);
  const tentacles = [22, 36, 50, 64, 78].map((x, i) => ({
    x,
    frames: tentacleFrames(x, 52 + seeded(`${seed}-t${i}`) * 22, `${seed}-t${i}`),
    dur: 2.6 + seeded(`${seed}-td${i}`) * 1.2,
  }));
  return (
    <svg viewBox="0 0 100 130" width={84} height={110} aria-hidden className="overflow-visible">
      {tentacles.map((t) => (
        <path
          key={t.x}
          d={t.frames[0]}
          fill="none"
          stroke={glow}
          strokeOpacity={0.36}
          strokeWidth={0.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Morph frames={t.frames} dur={t.dur} linear />
        </path>
      ))}
      <path
        d={BELL_RELAXED}
        fill={glow}
        fillOpacity={0.2}
        stroke={glow}
        strokeOpacity={0.55}
        strokeWidth={1}
      >
        {!reduced && (
          <animate
            attributeName="d"
            dur={`${pulse}s`}
            repeatCount="indefinite"
            values={`${BELL_RELAXED};${BELL_CONTRACTED};${BELL_RELAXED};${BELL_RELAXED}`}
            keyTimes="0;0.16;0.6;1"
            calcMode="spline"
            keySplines="0.3 0 0.2 1;0.4 0 0.4 1;0 0 1 1"
          />
        )}
      </path>
      <path d="M30 40c0-8 8-12 12-6s-2 9-6 6M58 26c4-6 12-4 12 2s-6 6-8 3M44 20c2-4 8-4 9 0" fill="none" stroke={glow} strokeOpacity={0.45} strokeWidth={1} strokeLinecap="round" />
      <ellipse cx={50} cy={34} rx={18} ry={10} fill={glow} fillOpacity={0.3} />
      <ellipse cx={50} cy={32} rx={6} ry={3.5} fill={glow} fillOpacity={0.8} />
    </svg>
  );
}
