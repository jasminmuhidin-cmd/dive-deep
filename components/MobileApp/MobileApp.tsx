"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  AnimatePresence,
  motion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Submission } from "@/lib/types";
import { PROJECTION_FISH_PATH } from "@/components/onboarding/fishPaths";
import { DeepCreature, ShallowCreature, seeded } from "./Creatures";
import ThoughtSheet from "./ThoughtSheet";

const MAX_DEPTH_M = 4000;
/** Share of thoughts (the oldest) that have sunk into the deep */
const DEEP_SHARE = 0.35;

const WATER_STOPS: [number, [number, number, number]][] = [
  [0, [138, 211, 220]],
  [0.12, [63, 157, 179]],
  [0.35, [29, 106, 134]],
  [0.6, [30, 42, 68]],
  [0.8, [11, 16, 32]],
  [1, [2, 3, 8]],
];

/** Water colour at scroll progress `p` — light aqua at the surface to near-black at the floor */
function waterAt(p: number): string {
  const t = Math.max(0, Math.min(1, p));
  const i = WATER_STOPS.findIndex(([stop]) => stop >= t);
  if (i <= 0) return `rgb(${WATER_STOPS[0][1].join(",")})`;
  const [a, from] = WATER_STOPS[i - 1];
  const [b, to] = WATER_STOPS[i];
  const k = (t - a) / (b - a);
  const rgb = from.map((c, j) => Math.round(c + (to[j] - c) * k));
  return `rgb(${rgb.join(",")})`;
}

/** 0 before `inStart`, rises to 1 by `inEnd`, holds, then falls to 0 between `outStart` and `outEnd` */
function ramp(p: number, inStart: number, inEnd: number, outStart: number, outEnd: number) {
  const rise = inEnd <= inStart ? 1 : (p - inStart) / (inEnd - inStart);
  const fall = (outEnd - p) / (outEnd - outStart);
  return Math.max(0, Math.min(1, rise, fall));
}

export default function MobileApp() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Submission | null>(null);

  useEffect(() => {
    fetch("/api/submissions")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Submission[]) => {
        setSubmissions(
          [...data].sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime(),
          ),
        );
      })
      .catch(() => setSubmissions([]))
      .finally(() => setLoading(false));
  }, []);

  // Newest thoughts swim near the light; the oldest have sunk to the floor.
  const { sunlight, twilight, deep } = useMemo(() => {
    const n = submissions.length;
    const deepCount = n === 0 ? 0 : Math.max(1, Math.round(n * DEEP_SHARE));
    const shallow = submissions.slice(0, n - deepCount);
    const half = Math.ceil(shallow.length / 2);
    return {
      sunlight: shallow.slice(0, half),
      twilight: shallow.slice(half),
      deep: submissions.slice(n - deepCount),
    };
  }, [submissions]);

  const close = useCallback(() => setSelected(null), []);

  const { scrollYProgress } = useScroll();
  // Function form so it's recomputed in JS on every scroll (up or down),
  // rather than handed to a native scroll timeline some browsers don't support.
  const water = useTransform(scrollYProgress, waterAt);
  const lightOpacity = useTransform(scrollYProgress, (p) => ramp(p, 0, 0, 0.05, 0.28));
  const schoolOpacity = useTransform(scrollYProgress, (p) =>
    ramp(p, 0.04, 0.14, 0.45, 0.62),
  );
  const snowOpacity = useTransform(
    scrollYProgress,
    (p) => ramp(p, 0.45, 0.75, 2, 2) * 0.9,
  );
  const depthLabel = useTransform(
    scrollYProgress,
    (p) => `${Math.round(Math.max(0, p) * MAX_DEPTH_M).toLocaleString()} m`,
  );

  return (
    <main className="relative min-h-svh overflow-x-hidden text-foam">
      <motion.div
        className="fixed inset-0 z-0"
        style={{ backgroundColor: water }}
        aria-hidden
      />
      <SunRays opacity={lightOpacity} />
      <AmbientSchools opacity={schoolOpacity} />
      <MarineSnow opacity={snowOpacity} />

      <div className="pointer-events-none fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 rounded-full bg-ink/35 px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] text-foam backdrop-blur-md">
        <motion.span>{depthLabel}</motion.span>
      </div>

      <div className="relative z-10 mx-auto max-w-lg">
        <Intro />

        <ZoneHeader
          title="The sunlight zone"
          body="The newest thoughts swim here, close to the light — still finding their shape."
        />
        <CreatureList items={sunlight} onOpen={setSelected} kind="shallow" />

        <ZoneHeader
          title="The twilight zone"
          body="The light is thinning. These have been drifting a little longer."
        />
        <CreatureList items={twilight} onOpen={setSelected} kind="shallow" />

        <ZoneHeader
          title="The midnight zone"
          body="No sunlight reaches this far. The oldest thoughts settle here, glowing on their own."
        />
        <CreatureList items={deep} onOpen={setSelected} kind="deep" />

        {!loading && submissions.length === 0 && (
          <p className="px-6 py-16 text-center text-foam/60">
            The water is still quiet. Send a ripple from the kiosk.
          </p>
        )}

        <Seafloor count={submissions.length} />
      </div>

      <AnimatePresence>
        {selected && (
          <ThoughtSheet key={selected.id} submission={selected} onClose={close} />
        )}
      </AnimatePresence>
    </main>
  );
}

function Intro() {
  return (
    <section className="relative flex min-h-svh flex-col justify-center px-6 pb-28 pt-20 text-ink">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ink/60">
          deep dive
        </p>
        <h1 className="mt-4 font-serif text-[2.6rem] leading-[1.05] tracking-tight">
          Don&apos;t just skim the surface.
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-ink/80">
          Everyone who visits leaves something in the water — a care, a worry,
          a question, a wish to be heard. They&apos;ve been drifting here ever
          since.
        </p>
        <p className="mt-4 leading-relaxed text-ink/70">
          Dive down. The newest thoughts swim near the light; the oldest have
          sunk to the deep. Tap any creature to read what it carries.
        </p>
      </motion.div>

      <motion.div
        className="absolute inset-x-0 bottom-[max(2rem,env(safe-area-inset-bottom))] flex flex-col items-center text-ink/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 1 }}
      >
        <span className="font-mono text-[11px] uppercase tracking-[0.28em]">
          Scroll to dive
        </span>
        <ChevronDown className="dive-bob mt-2 h-6 w-6" aria-hidden />
      </motion.div>
    </section>
  );
}

function ZoneHeader({ title, body }: { title: string; body: string }) {
  return (
    <motion.header
      className="px-6 pb-4 pt-[24svh]"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-15% 0px" }}
      transition={{ duration: 1.1, ease: "easeOut" }}
    >
      <h2 className="font-serif text-3xl leading-tight text-foam [text-shadow:0_1px_18px_rgba(2,3,8,0.35)]">
        {title}
      </h2>
      <p className="mt-3 max-w-sm leading-relaxed text-foam/70">{body}</p>
    </motion.header>
  );
}

function CreatureList({
  items,
  onOpen,
  kind,
}: {
  items: Submission[];
  onOpen: (s: Submission) => void;
  kind: "shallow" | "deep";
}) {
  const Creature = kind === "deep" ? DeepCreature : ShallowCreature;
  return (
    <div className="px-4 pb-[8svh]">
      {items.map((s) => (
        <Creature key={s.id} submission={s} onOpen={onOpen} />
      ))}
    </div>
  );
}

function Seafloor({ count }: { count: number }) {
  return (
    <footer className="relative mt-[20svh]">
      <svg
        viewBox="0 0 400 80"
        preserveAspectRatio="none"
        className="block h-20 w-full"
        aria-hidden
      >
        <path
          d="M0 50C40 30 80 40 120 46C170 54 200 24 250 30C300 36 330 56 400 40V80H0Z"
          fill="#0a0e18"
        />
      </svg>
      <div className="bg-[#0a0e18] px-6 pb-[max(3rem,env(safe-area-inset-bottom))] pt-6 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-foam/40">
          {MAX_DEPTH_M.toLocaleString()} m · the floor
        </p>
        <p className="mx-auto mt-4 max-w-xs font-serif text-2xl leading-snug text-foam/85">
          {count > 0
            ? `${count.toLocaleString()} thought${count === 1 ? "" : "s"} are held down here with you.`
            : "You've reached the floor."}
        </p>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-foam/50">
          None of them are carried alone.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Link
            href="/gallery"
            className="min-h-11 rounded-full border border-ripple/40 px-6 py-3 text-sm text-foam transition hover:border-ripple/70"
          >
            Browse the full archive
          </Link>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-foam/55 transition hover:text-foam"
          >
            <ChevronUp className="h-4 w-4" aria-hidden />
            Back to the surface
          </button>
        </div>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/* Atmosphere (fixed, decorative)                                      */
/* ------------------------------------------------------------------ */

const RAYS = [
  { left: "6%", width: "16vw", rot: 14, delay: 0 },
  { left: "22%", width: "9vw", rot: 9, delay: -2.5 },
  { left: "38%", width: "20vw", rot: 4, delay: -5 },
  { left: "58%", width: "11vw", rot: -3, delay: -1.2 },
  { left: "72%", width: "17vw", rot: -9, delay: -3.8 },
  { left: "88%", width: "8vw", rot: -14, delay: -6.1 },
];

function SunRays({ opacity }: { opacity: MotionValue<number> }) {
  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{ opacity }}
      aria-hidden
    >
      <div
        className="dive-shimmer absolute inset-x-[-20%] top-[-30%] h-[70%]"
        style={{
          background:
            "radial-gradient(closest-side at 50% 50%, rgba(255,251,226,0.85), rgba(255,251,226,0.25) 55%, transparent 100%)",
        }}
      />
      {RAYS.map((r) => (
        <div
          key={r.left}
          className="dive-ray absolute top-[-10%] h-[120%] origin-top blur-[6px]"
          style={
            {
              left: r.left,
              width: r.width,
              "--ray-rot": `${r.rot}deg`,
              animationDelay: `${r.delay}s`,
              background:
                "linear-gradient(to bottom, rgba(255,250,222,0.7), rgba(255,250,222,0.18) 55%, transparent 85%)",
            } as CSSProperties
          }
        />
      ))}
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className="dive-bubble absolute bottom-[-4%] rounded-full border border-white/60 bg-white/15"
          style={{
            left: `${5 + seeded(`bubble-${i}`) * 90}%`,
            width: 4 + seeded(`bubble-${i}`, 1) * 8,
            height: 4 + seeded(`bubble-${i}`, 1) * 8,
            animationDuration: `${9 + seeded(`bubble-${i}`, 2) * 9}s`,
            animationDelay: `-${seeded(`bubble-${i}`, 3) * 18}s`,
          }}
        />
      ))}
    </motion.div>
  );
}

const SCHOOLS = [
  { top: "22%", size: 16, duration: 34, delay: 0, color: "#f4efe4" },
  { top: "48%", size: 11, duration: 46, delay: -18, color: "#e9d68c" },
  { top: "70%", size: 13, duration: 40, delay: -8, color: "#cfe9ff" },
];

function AmbientSchools({ opacity }: { opacity: MotionValue<number> }) {
  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{ opacity }}
      aria-hidden
    >
      {SCHOOLS.map((school, si) => (
        <div
          key={school.top}
          className="dive-school absolute left-0"
          style={{
            top: school.top,
            animationDuration: `${school.duration}s`,
            animationDelay: `${school.delay}s`,
          }}
        >
          {Array.from({ length: 6 }, (_, i) => (
            <svg
              key={i}
              viewBox="0 -1 66 34"
              width={school.size * 2.3}
              height={school.size}
              className="absolute opacity-50"
              style={{
                left: seeded(`school-${si}-${i}`) * 70,
                top: seeded(`school-${si}-${i}`, 1) * 46 - 23,
                transform: "scaleX(-1)",
              }}
            >
              <path d={PROJECTION_FISH_PATH} fill={school.color} />
            </svg>
          ))}
        </div>
      ))}
    </motion.div>
  );
}

function MarineSnow({ opacity }: { opacity: MotionValue<number> }) {
  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{ opacity }}
      aria-hidden
    >
      {Array.from({ length: 36 }, (_, i) => {
        const key = `snow-${i}`;
        const size = 1 + seeded(key, 1) * 2.5;
        return (
          <span
            key={key}
            className="dive-snow absolute top-[-4%] rounded-full bg-foam/70"
            style={{
              left: `${seeded(key) * 100}%`,
              width: size,
              height: size,
              animationDuration: `${16 + seeded(key, 2) * 18}s`,
              animationDelay: `-${seeded(key, 3) * 34}s`,
            }}
          />
        );
      })}
    </motion.div>
  );
}
