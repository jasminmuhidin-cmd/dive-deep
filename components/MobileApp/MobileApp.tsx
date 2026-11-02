"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Ref, type RefObject } from "react";
import {
  AnimatePresence,
  animate,
  MotionConfig,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import { Search } from "lucide-react";
import type { Submission, WorryWeight } from "@/lib/types";
import { sortByWeight, worryWeight } from "@/lib/issue-depth";
import SAMPLE_RESPONSES from "@/lib/sample-responses.json";
import { AmbientFlock } from "./Boids";
import DepthRail, { type Checkpoint } from "./DepthRail";
import { GUIDE_BOX, GuidePrompt, GuideSteps } from "./DiveGuide";
import DiveSearch from "./DiveSearch";
import { DiveFilters } from "./Ripples";
import SeaFloor from "./SeaFloor";
import SurfaceSubmarine from "./SurfaceSubmarine";
import { ZONES } from "./species";
import ThoughtFish from "./ThoughtFish";

type Stops = [number, [number, number, number]][];

/** Pale grey-blue at the surface, through teal and ocean blue, down to the darkest navy */
const WATER_STOPS: Stops = [
  [0, [209, 226, 230]],
  [0.1, [209, 226, 230]],
  [0.15, [194, 224, 227]],
  [0.2, [175, 219, 224]],
  [0.25, [160, 210, 219]],
  [0.3, [146, 202, 214]],
  [0.35, [131, 195, 208]],
  [0.4, [116, 187, 203]],
  [0.45, [100, 169, 190]],
  [0.5, [85, 148, 175]],
  [0.55, [69, 127, 159]],
  [0.6, [53, 106, 144]],
  [0.65, [36, 84, 128]],
  [0.7, [20, 63, 112]],
  [0.75, [15, 54, 99]],
  [0.8, [13, 46, 86]],
  [0.85, [10, 38, 73]],
  [0.9, [8, 31, 60]],
  [0.93, [6, 27, 53]],
  [1, [6, 27, 53]],
];

/** Colour along `stops` at `p` (clamped to 0–1) */
function colourAt(stops: Stops, p: number): string {
  const t = Math.max(0, Math.min(1, p));
  const i = stops.findIndex(([stop]) => stop >= t);
  if (i === -1) return `rgb(${stops[stops.length - 1][1].join(",")})`;
  if (i === 0) return `rgb(${stops[0][1].join(",")})`;
  const [a, from] = stops[i - 1];
  const [b, to] = stops[i];
  const k = (t - a) / (b - a);
  const rgb = from.map((c, j) => Math.round(c + (to[j] - c) * k));
  return `rgb(${rgb.join(",")})`;
}

/** Past this depth the water mid-screen is dark enough that text, fish and the rail turn pale */
const DARK_AT = 0.48;

/** The darkest colour on the page — a very dark blue, never black */
const DEEP_INK = "#0c2a4c";

/**
 * Dark blue on the bright shallows, foam in the dark — fish a softer slate,
 * pale in the deep. A faint halo of the water's own colour sits behind the
 * text, so it stays readable where the water is mid-blue.
 */
const LIGHT_WATER = {
  color: DEEP_INK,
  textShadow: "0 0 10px rgba(214,236,241,0.55), 0 0 2px rgba(214,236,241,0.35)",
  "--fish": "#2f4b74",
} as CSSProperties;
const DARK_WATER = {
  color: "#f4efe4",
  textShadow: "0 1px 2px rgba(6,27,53,0.45), 0 0 12px rgba(6,27,53,0.55)",
  "--fish": "#c3d1e4",
} as CSSProperties;

const SECTIONS: { weight: WorryWeight; title: string; line: string }[] = [
  { weight: "recent", title: "sunlight zone", line: "A recent worry." },
  { weight: "common", title: "twilight zone", line: "A worry that keeps coming back." },
  { weight: "deep", title: "midnight zone", line: "Stays with people, carried deeply." },
];

/** The column everything hangs in. The right margin is wider, to keep clear of the depth line. */
const FRAME = "mx-auto max-w-lg pl-6 pr-10 md:max-w-3xl md:pr-16";

const sectionOf = (s: Submission) => SECTIONS.find((x) => x.weight === worryWeight(s))?.title ?? "";

/** How deep the water is at each checkpoint on the rail: start, sunlight, twilight, midnight, the floor */
const CHECKPOINT_DEPTHS = [0.2, 0.45, 0.68, 0.86, 1];

/**
 * Scroll progress to depth, passing through each checkpoint's depth as it's
 * reached — so the water darkens section by section however many thoughts
 * each one holds.
 */
function depthAt(progress: number, stops: number[]): number {
  const p = Math.max(0, Math.min(1, progress));
  const xs = [0];
  const ys = [0];
  stops.forEach((stop, i) => {
    if (stop < 0) return;
    xs.push(Math.max(stop, xs[xs.length - 1] + 0.001));
    ys.push(CHECKPOINT_DEPTHS[i]);
  });
  if (xs[xs.length - 1] < 1) {
    xs.push(1);
    ys.push(1);
  }
  const i = xs.findIndex((x) => x >= p);
  if (i <= 0) return ys[0];
  return ys[i - 1] + ((p - xs[i - 1]) / (xs[i] - xs[i - 1])) * (ys[i] - ys[i - 1]);
}

/**
 * Top up the live thoughts with the sample kiosk spreadsheet while real
 * responses are thin. Set to false to show only live thoughts. Regenerate the
 * samples after editing the spreadsheet with `npm run import-responses`.
 */
const USE_SAMPLE_RESPONSES = true;
const SAMPLES = USE_SAMPLE_RESPONSES ? (SAMPLE_RESPONSES as Submission[]) : [];

const newestFirst = (subs: Submission[]) =>
  [...subs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

export default function MobileApp({ className = "" }: { className?: string }) {
  const [submissions, setSubmissions] = useState<Submission[]>(() => newestFirst(SAMPLES));
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [dark, setDark] = useState(false);
  const [railShown, setRailShown] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLElement>(null);
  const depthsRef = useRef<HTMLElement>(null);
  const deepestRef = useRef<HTMLElement>(null);
  const floorRef = useRef<HTMLElement>(null);

  // Live thoughts from the kiosk, with the samples as filler. A link like
  // /?thought=<id> opens that thought on arrival.
  useEffect(() => {
    const linked = new URLSearchParams(window.location.search).get("thought");
    fetch("/api/submissions")
      .then((r) => (r.ok ? r.json() : []))
      .then((live: Submission[]) => {
        setSubmissions(newestFirst([...live, ...SAMPLES]));
        if (linked && live.some((s) => s.id === linked)) setOpenId(linked);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const sections = useMemo(() => sortByWeight(submissions), [submissions]);
  const sectionRefs: Record<WorryWeight, RefObject<HTMLElement | null>> = {
    recent: surfaceRef,
    common: depthsRef,
    deep: deepestRef,
  };

  const checkpoints = useMemo<Checkpoint[]>(
    () => [
      { label: "start", ref: startRef },
      { label: "sunlight", ref: surfaceRef },
      { label: "twilight", ref: depthsRef },
      { label: "midnight", ref: deepestRef },
      { label: "the floor", ref: floorRef },
    ],
    [],
  );

  // Where along the scroll each checkpoint reaches the middle of the screen, 0–1
  const [stops, setStops] = useState<number[]>([]);
  const stopsValue = useMotionValue<number[]>([]);
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const next = checkpoints.map(({ ref }) => {
        const el = ref.current;
        if (!el) return -1;
        const top = el.getBoundingClientRect().top + window.scrollY;
        return Math.min(1, Math.max(0, (top - window.innerHeight * 0.5) / scrollable));
      });
      setStops(next);
      stopsValue.set(next);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(content);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [checkpoints, stopsValue]);

  // Function transforms are recomputed in JS on every scroll (up or down),
  // rather than handed to a native scroll timeline some browsers don't support.
  const { scrollY, scrollYProgress } = useScroll();
  const depth = useTransform(() => depthAt(scrollYProgress.get(), stopsValue.get()));
  // The screen shades deeper toward its foot, and a little deeper on the left, as light slants in
  // from the right. Near the top it takes in a long stretch of the gradient — pale grey-blue easing
  // into aqua, as the water opens — narrowing further down, where text needs the water even.
  const water = useTransform(depth, (d) => {
    const reach = 0.26 - 0.14 * Math.min(1, d / 0.4);
    return `linear-gradient(200deg, ${colourAt(WATER_STOPS, d - 0.02)}, ${colourAt(WATER_STOPS, d + reach * 0.45)} 50%, ${colourAt(WATER_STOPS, d + reach)})`;
  });
  // schools of small fish roaming behind it all, slate in the shallows and pale in the deep
  const schoolColour = useTransform(depth, (d): string => (d > DARK_AT ? "rgb(195,209,228)" : "rgb(47,75,116)"));
  const schoolOpacity = useTransform(depth, (d) => 0.26 + Math.min(1, d) * 0.08);
  // text turns pale in one quick fade, rather than passing through a grey that reads on neither
  useMotionValueEvent(depth, "change", (d) => setDark(d > DARK_AT));
  useMotionValueEvent(scrollY, "change", (y) => setRailShown(y > window.innerHeight * 0.45));

  const toggle = useCallback((sub: Submission) => setOpenId((cur) => (cur === sub.id ? null : sub.id)), []);
  const openSearch = useCallback(() => setSearching(true), []);
  const closeSearch = useCallback(() => setSearching(false), []);
  const pick = useCallback((sub: Submission) => {
    setSearching(false);
    setOpenId(sub.id);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <main
        // Averia Serif Libre throughout, at a comfortable 15px; headings step up from there
        className={`relative min-h-svh overflow-x-hidden text-[15px] leading-[1.7] tracking-[0.01em] transition-colors duration-700 ${className}`}
        style={dark ? DARK_WATER : LIGHT_WATER}
      >
        <motion.div className="fixed inset-0 z-0" style={{ background: water }} aria-hidden />
        <AmbientFlock colour={schoolColour} opacity={schoolOpacity} />
        <DiveFilters />

        <div ref={contentRef} className="relative z-10">
          <Intro startRef={startRef} onSearch={openSearch} count={submissions.length} />

          {SECTIONS.map(({ weight, title, line }) => (
            <section key={weight} aria-labelledby={`section-${weight}`}>
              <SectionHeader ref={sectionRefs[weight]} id={`section-${weight}`} title={title} line={line} />
              {/* fish swim their share of this column, so it's their size container */}
              <div className="mx-auto max-w-lg pb-[6svh] pl-3 pr-10 md:max-w-3xl md:pr-24">
                <div className="@container" style={{ "--lume": ZONES[weight].lume } as CSSProperties}>
                  {sections[weight].map((sub, i) => (
                    <ThoughtFish
                      key={sub.id}
                      submission={sub}
                      zone={ZONES[weight].species}
                      index={i}
                      open={openId === sub.id}
                      dimmed={openId !== null && openId !== sub.id}
                      onToggle={toggle}
                    />
                  ))}
                  {!loading && sections[weight].length === 0 && (
                    <p className="py-10 text-center opacity-70">Nothing has settled here yet.</p>
                  )}
                </div>
              </div>
            </section>
          ))}

          <SeaFloor ref={floorRef} count={submissions.length} />
        </div>

        <DepthRail checkpoints={checkpoints} stops={stops} progress={scrollYProgress} shown={railShown} />
        <SurfaceSubmarine />
        <FilmGrain />
        <AnimatePresence>
          {searching && (
            <DiveSearch submissions={submissions} sectionOf={sectionOf} onPick={pick} onClose={closeSearch} />
          )}
        </AnimatePresence>
      </main>
    </MotionConfig>
  );
}

/**
 * The opening screen: the ways in and out, the name, what this is, how many
 * thoughts are in the water, and a fish waiting at the bottom to show you how
 * to explore.
 */
function Intro({
  startRef,
  onSearch,
  count,
}: {
  startRef: Ref<HTMLDivElement>;
  onSearch: () => void;
  /** How many thoughts are in the water */
  count: number;
}) {
  const fishRef = useRef<HTMLSpanElement>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  // Opening the guide carries you down a little, so its steps come into view below the fish
  useEffect(() => {
    if (!guideOpen) return;
    const raf = requestAnimationFrame(() => {
      const fish = fishRef.current?.getBoundingClientRect();
      if (!fish) return;
      window.scrollTo({ top: window.scrollY + fish.top - window.innerHeight * 0.2, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  }, [guideOpen]);

  const fade = (delay: number) => ({
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 1.1, delay, ease: "easeOut" as const },
  });

  return (
    <section className="relative">
      {/* one screen and half the guide fish tall, so only the fish's top half peeks up at the foot of the screen */}
      <div
        className={`${FRAME} flex flex-col pt-[calc(env(safe-area-inset-top)+0.5rem)]`}
        style={{ minHeight: `calc(100svh + ${GUIDE_BOX / 2}px)` }}
      >
        <DiveNav onSearch={onSearch} />

        <motion.div className="mt-[6svh]" {...fade(0)}>
          <OutlineLogo />
        </motion.div>

        {/* a little live status: how many thoughts are in the water right now */}
        <motion.p
          className="mt-5 flex items-center gap-2 self-center rounded-full border border-current/25 py-1 pl-2.5 pr-3.5 text-[13px]"
          {...fade(0.45)}
        >
          <span className="relative grid h-2 w-2 place-items-center" aria-hidden>
            <span className="absolute h-full w-full animate-ping rounded-full bg-current opacity-60 motion-reduce:hidden" />
            <span className="h-2 w-2 rounded-full bg-current" />
          </span>
          <span className="sr-only">{count.toLocaleString()} thoughts in the water</span>
          <span aria-hidden>
            <CountUp to={count} className="font-bold tabular-nums" /> thoughts in the water
          </span>
        </motion.p>

        {/* the words sit low, just above the fish */}
        <motion.p
          // justified edge to edge, last line included, and never hyphenated, so the gaps open into white rivers
          className="mt-auto pt-[6svh] text-justify leading-[2.3] tracking-[0.02em] [hyphens:none] [text-align-last:justify] [word-spacing:0.08em]"
          {...fade(0.3)}
        >
          Dive Deep is an interactive, multi-touch installation and web experience that transforms individual
          care into collective ripples. Step into a space where your private thoughts dissolve into a shared
          ecosystem of care.
        </motion.p>

        <div ref={startRef} className="mt-[3svh] self-center">
          <GuidePrompt fishRef={fishRef} open={guideOpen} onToggle={() => setGuideOpen((o) => !o)} />
        </div>
      </div>
      {guideOpen && <GuideSteps fishRef={fishRef} />}
    </section>
  );
}

/** A number rising to `to` from wherever it last was — from nothing on arrival */
function CountUp({ to, className = "" }: { to: number; className?: string }) {
  const reduced = useReducedMotion();
  const value = useMotionValue(0);
  const shown = useTransform(value, (v) => Math.round(v).toLocaleString());
  useEffect(() => {
    const run = animate(value, to, { duration: reduced ? 0 : 2.2, delay: reduced ? 0 : 0.6, ease: "easeOut" });
    return () => run.stop();
  }, [to, value, reduced]);
  return <motion.span className={className}>{shown}</motion.span>;
}

/** Plain words across the top, spread evenly, the way in to search at the far edge */
function DiveNav({ onSearch }: { onSearch: () => void }) {
  const link = "flex min-h-11 items-center tracking-[0.04em] transition hover:opacity-60";
  return (
    <nav aria-label="Main" className="flex items-center justify-between">
      <Link href="/" className={link}>
        home
      </Link>
      <Link href="/kiosk" className={link}>
        kiosk
      </Link>
      <Link href="/projection" className={link}>
        installation
      </Link>
      <button
        type="button"
        onClick={onSearch}
        aria-label="Search the thoughts"
        className="-mr-3 grid h-11 w-11 place-items-center rounded-full transition hover:opacity-60"
      >
        <Search className="h-4 w-4" strokeWidth={1.5} aria-hidden />
      </button>
    </nav>
  );
}

/** The wordmark, drawn in fine dark-blue outline, wavering as if seen through moving water */
function OutlineLogo({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  return (
    <h1 className={className}>
      <svg width={0} height={0} className="absolute" aria-hidden focusable="false">
        <filter id="logo-wave" x="-5%" y="-20%" width="110%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.06" numOctaves={2} seed={7} result="noise">
            {!reduced && (
              <animate
                attributeName="baseFrequency"
                dur="9s"
                values="0.012 0.06;0.016 0.08;0.01 0.05;0.012 0.06"
                repeatCount="indefinite"
              />
            )}
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={reduced ? 0 : 7} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <Image
        src="/branding/logo-outline.svg"
        alt="Dive Deep"
        width={300}
        height={67}
        priority
        className="block h-auto w-full"
        style={{ filter: "url(#logo-wave)" }}
      />
    </h1>
  );
}

/** A section's heading under a line across the water: its name, and a line on what's here */
function SectionHeader({ ref, id, title, line }: { ref?: Ref<HTMLElement>; id: string; title: string; line: string }) {
  return (
    <motion.header
      ref={ref}
      className={`${FRAME} pb-[5svh] pt-[16svh]`}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-15% 0px" }}
      transition={{ duration: 1.1, ease: "easeOut" }}
    >
      <span className="mb-4 block h-px bg-current opacity-30" aria-hidden />
      <h2 id={id} className="text-2xl font-bold leading-tight">
        {title}
      </h2>
      <p className="mt-1.5 italic opacity-85">{line}</p>
    </motion.header>
  );
}

/** Fine film grain over everything, soft-light blended so it settles into whatever colour lies beneath */
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='g' x='0' y='0'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' seed='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncR type='linear' slope='1.7' intercept='-0.35'/><feFuncG type='linear' slope='1.7' intercept='-0.35'/><feFuncB type='linear' slope='1.7' intercept='-0.35'/><feFuncA type='table' tableValues='1 1'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(#g)'/></svg>",
)}")`;

function FilmGrain() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-40 opacity-40 mix-blend-soft-light"
      style={{ backgroundImage: GRAIN, backgroundSize: "300px 300px" }}
      aria-hidden
    />
  );
}
