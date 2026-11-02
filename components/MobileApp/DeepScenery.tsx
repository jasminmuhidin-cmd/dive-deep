"use client";

import { motion, useTransform, type MotionValue } from "framer-motion";
import { seeded } from "./seeded";

/** Height in px of one repeat of a cliff face; the rock tiles seamlessly down the dive */
const CLIFF_TILE = 1400;

const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * One tile of a jagged rock face as an SVG data URI, the rock on the left.
 * The outline is periodic (it ends where it starts), so tiles stack without a seam.
 */
function cliffFace(seed: string, fill: string) {
  const n = 34;
  const tau = Math.PI * 2;
  const pts = Array.from({ length: n }, (_, i) => {
    const t = i / n;
    const x =
      48 +
      20 * Math.sin(tau * t + seeded(seed, 1) * tau) +
      9 * Math.sin(tau * 3 * t + seeded(seed, 2) * tau) +
      (seeded(seed, 10 + i) - 0.5) * 18;
    // a little vertical jitter breaks the edge into ledges and overhangs
    const y = t * CLIFF_TILE + (i ? (seeded(seed, 60 + i) - 0.5) * 22 : 0);
    return [r1(Math.max(6, Math.min(94, x))), r1(y)] as const;
  });
  const edge = [...pts, [pts[0][0], CLIFF_TILE] as const];
  const line = edge.map(([x, y]) => `L${x} ${y}`).join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 ${CLIFF_TILE}" preserveAspectRatio="none">` +
    `<path d="M0 0${line}L0 ${CLIFF_TILE}Z" fill="${fill}"/>` +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Fill-only, a shade off the water and softly blurred — felt more than seen */
const CLIFFS = [
  { seed: "far-l", side: "left", width: "min(34vw, 300px)", speed: 0.18, fill: "rgba(1,3,10,0.22)", blur: 6 },
  { seed: "far-r", side: "right", width: "min(30vw, 260px)", speed: 0.22, fill: "rgba(1,3,10,0.22)", blur: 6 },
  { seed: "near-l", side: "left", width: "min(20vw, 190px)", speed: 0.45, fill: "rgba(1,2,6,0.38)", blur: 3 },
  { seed: "near-r", side: "right", width: "min(17vw, 170px)", speed: 0.5, fill: "rgba(1,2,6,0.38)", blur: 3 },
] as const;

function CliffWall({ cliff, scrollY }: { cliff: (typeof CLIFFS)[number]; scrollY: MotionValue<number> }) {
  // the rock slides up past you as you dive: nearer faces move faster
  const backgroundPositionY = useTransform(scrollY, (y) => `${r1(-y * cliff.speed)}px`);
  return (
    <motion.div
      className="absolute inset-y-0"
      style={{
        [cliff.side]: 0,
        width: cliff.width,
        backgroundImage: cliffFace(cliff.seed, cliff.fill),
        backgroundSize: `100% ${CLIFF_TILE}px`,
        backgroundRepeat: "repeat-y",
        backgroundPositionY,
        transform: cliff.side === "right" ? "scaleX(-1)" : undefined,
        filter: `blur(${cliff.blur}px)`,
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Kelp — tall, faint fronds swaying up from the edges of the dark     */
/* ------------------------------------------------------------------ */

/** A frond's outline: a gently curving stalk with leaf blades either side, fill only */
function kelpPath(seed: string, height: number): string {
  const tau = Math.PI * 2;
  const bend = (y: number) => 10 + Math.sin((y / height) * tau * 0.8 + seeded(seed, 1) * tau) * 6;
  const stalk: string[] = [];
  const back: string[] = [];
  for (let y = height; y >= 0; y -= 10) {
    const w = 1.2 + (y / height) * 1.4;
    stalk.push(`${r1(bend(y) - w)} ${y}`);
    back.unshift(`${r1(bend(y) + w)} ${y}`);
  }
  let d = `M${stalk.join("L")}L${back.join("L")}Z`;
  // blades alternate sides up the stalk, smaller toward the tip
  for (let y = height - 30, i = 0; y > 20; y -= 26 + seeded(seed, 10 + i) * 14, i++) {
    const side = i % 2 ? 1 : -1;
    const x = bend(y);
    const len = 14 + (y / height) * 12;
    const tipX = r1(x + side * len);
    const tipY = r1(y - len * 0.9);
    d += `M${r1(x)} ${r1(y)}Q${r1(x + side * len * 0.9)} ${r1(y - 2)} ${tipX} ${tipY}Q${r1(x + side * 3)} ${r1(y - len * 0.6)} ${r1(x)} ${r1(y - 8)}Z`;
  }
  return d;
}

const KELP = [
  { seed: "k1", side: "left", inset: "2%", height: 78, sway: 3, dur: 9 },
  { seed: "k2", side: "left", inset: "11%", height: 56, sway: 4, dur: 7.5 },
  { seed: "k3", side: "right", inset: "4%", height: 70, sway: 3.5, dur: 8.5 },
  { seed: "k4", side: "right", inset: "14%", height: 48, sway: 4.5, dur: 7 },
] as const;

function Kelp({ frond }: { frond: (typeof KELP)[number] }) {
  const h = 400;
  return (
    <motion.svg
      viewBox={`0 0 40 ${h}`}
      preserveAspectRatio="xMidYMax meet"
      className="absolute bottom-[-2vh]"
      style={{
        [frond.side]: frond.inset,
        height: `${frond.height}vh`,
        transformOrigin: "50% 100%",
        filter: "blur(2.5px)",
      }}
      animate={{ rotate: [-frond.sway, frond.sway, -frond.sway], skewX: [frond.sway, -frond.sway, frond.sway] }}
      transition={{ duration: frond.dur, repeat: Infinity, ease: "easeInOut", delay: -seeded(frond.seed, 2) * frond.dur }}
    >
      <path d={kelpPath(frond.seed, h)} fill="rgba(1,3,9,0.3)" />
    </motion.svg>
  );
}

/**
 * Backdrop for the midnight zone: faint cliff walls sliding past as you
 * descend, with kelp swaying up from the edges — depth, never a distraction.
 */
export default function DeepScenery({
  opacity,
  scrollY,
}: {
  opacity: MotionValue<number>;
  scrollY: MotionValue<number>;
}) {
  const [farLeft, farRight, nearLeft, nearRight] = CLIFFS;
  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{ opacity }}
      aria-hidden
    >
      <CliffWall cliff={farLeft} scrollY={scrollY} />
      <CliffWall cliff={farRight} scrollY={scrollY} />
      {KELP.map((frond) => (
        <Kelp key={frond.seed} frond={frond} />
      ))}
      <CliffWall cliff={nearLeft} scrollY={scrollY} />
      <CliffWall cliff={nearRight} scrollY={scrollY} />
    </motion.div>
  );
}
