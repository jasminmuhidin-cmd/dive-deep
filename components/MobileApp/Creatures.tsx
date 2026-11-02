"use client";

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { AnimatePresence, motion, type TargetAndTransition, type Transition } from "framer-motion";
import { X } from "lucide-react";
import { CATEGORY_LABELS, type Category, type Submission } from "@/lib/types";
import Constellation from "./Constellation";
import type { DepthBand } from "@/lib/issue-depth";
import { deepKindFor, isFloorKind, type DeepKind } from "./DeepForms";
import { DotCreature, dotKindLabel, isDotFish, type DotKind } from "./DotCreatures";
import { seeded } from "./seeded";

/** Bioluminescent tint per theme */
export const CATEGORY_GLOW: Record<Category, string> = {
  environment: "#7fe3c4",
  community: "#f2a7c3",
  future: "#7cc8ff",
  belonging: "#f5df8a",
  economy: "#b9a4ff",
  unspecified: "#cfe9ff",
};

/** Theme colour — the glow always means the same thing, so it can stand in for a label */
export function tintFor(s: Submission): string {
  return CATEGORY_GLOW[s.category] ?? CATEGORY_GLOW.unspecified;
}

/** Only label creatures that carry a theme */
function labelFor(s: Submission): string | null {
  return s.category && s.category !== "unspecified"
    ? CATEGORY_LABELS[s.category]
    : null;
}

/* ------------------------------------------------------------------ */
/* Fish — near the surface, thoughts take the shape of fish            */
/* ------------------------------------------------------------------ */

/** The guide's companion — stippled frilly fish */
export function GuideFish({ tint }: { tint: string; beat?: number }) {
  return (
    <span className="dive-bob-small inline-block" aria-hidden>
      <DotCreature kind="frilly" tint={tint} seed="guide-fish" open />
    </span>
  );
}

/**
 * Turns the fish a few degrees toward and away from the viewer on every
 * stroke, inside a slower wander — so it reads as a body in water, not a sticker.
 */
function Yaw({ beat, children }: { beat: number; children: React.ReactNode }) {
  return (
    <span className="inline-block [perspective:420px]">
      <span className="dive-turn inline-block" style={{ animationDuration: `${beat * 9}s` }}>
        <span className="dive-yaw inline-block" style={{ animationDuration: `${beat * 1.4}s` }}>
          {children}
        </span>
      </span>
    </span>
  );
}

/** Surface fish as a stipple mosaic — yaw + bob kept from the old swim */
function ThoughtFish({ kind, tint, seed }: { kind: FishKind; tint: string; seed: string }) {
  const angel = kind === "angel";
  const beat = angel ? 0.8 + seeded(seed, 9) * 0.4 : 0.6 + seeded(seed, 9) * 0.3;
  return (
    <Yaw beat={beat}>
      <span
        className="dive-bob-small inline-block overflow-visible"
        style={{
          animationDelay: `-${seeded(seed, 1) * 2}s`,
          transform: facesRight(seed) ? "scaleX(-1)" : undefined,
        }}
      >
        <DotCreature kind={kind} tint={tint} seed={seed} />
      </span>
    </Yaw>
  );
}

/* ------------------------------------------------------------------ */
/* The deep — each creature carries a thought                          */
/* ------------------------------------------------------------------ */

const r1 = (v: number) => Math.round(v * 10) / 10;

const REST = { x: "0vw", y: 0, rotate: 0, scaleX: 1, scaleY: 1 };

/**
 * Turning points alternating either side of the resting spot. Eased from one
 * to the next, x and y on different clocks, they trace a slow, unrepeating
 * wander — the way a microbe drifts rather than a pendulum swinging.
 */
function wander(seed: string, points: number, range: number): number[] {
  const pts = Array.from({ length: points }, (_, i) => {
    const mag = range * (0.35 + seeded(seed, 40 + i) * 0.65);
    return Math.round((i % 2 ? -mag : mag) * 10) / 10;
  });
  return [...pts, pts[0]];
}

const forever = (duration: number, extra?: Transition): Transition => ({
  duration,
  repeat: Infinity,
  ease: "easeInOut",
  ...extra,
});

const facesRight = (id: string) => seeded(id, 9) > 0.5;

type FishKind = "frilly" | "angel";
/** Every form a thought can take, from surface fish to floor shells */
type CreatureKind = DotKind;

const isFish = (kind: CreatureKind) => isDotFish(kind);
const settles = (kind: CreatureKind) => kind !== "frilly" && kind !== "angel" && isFloorKind(kind as DeepKind);

/** The form a thought takes at its depth: fish near the surface, creatures below, shells on the floor */
function kindFor(id: string, band: DepthBand): CreatureKind {
  if (band === "surface" || band === "below") return seeded(id, 11) < 0.4 ? "angel" : "frilly";
  return deepKindFor(id, band === "deepest");
}

type Idle = { animate: TargetAndTransition; transition: Transition };

/** Seconds for one full trip off screen and back — fish dart, shells and jellies drift */
function roamDuration(id: string, kind: CreatureKind): number {
  const jitter = seeded(id, 4);
  if (isFish(kind)) return 45 + jitter * 15;
  if (kind === "jelly" || settles(kind)) return 120 + jitter * 40;
  return 80 + jitter * 25;
}

/**
 * Linger at home for most of the loop, wander unhurriedly out of sight,
 * slip straight back — on screen far more than off, so it invites a tap
 */
const ROAM_TIMES = [0, 0.35, 0.6, 0.64, 0.92, 1];

/**
 * Every creature wanders off one edge of the screen and back again, on a loop.
 * `travel` moves the whole button (so the tap target goes with it);
 * `body` turns or tumbles just the creature, leaving its label upright.
 */
function roamMotion(id: string, kind: CreatureKind): { travel: Idle; body: Idle } {
  const d = roamDuration(id, kind);
  const fish = isFish(kind);
  const rightward = fish ? facesRight(id) : seeded(id, 3) > 0.5;
  const out = `${rightward ? 120 : -120}vw`;
  // start partway through the loop so creatures don't all leave together
  const delay = seeded(id, 6) * d * 0.5;
  const travel: Idle = {
    animate: {
      x: ["0vw", "0vw", out, out, "0vw", "0vw"],
      // a slow rise and fall as it roams…
      y: wander(`${id}y`, 4, fish ? 22 : kind === "jelly" ? 34 : settles(kind) ? 12 : 26),
    },
    transition: { x: forever(d, { times: ROAM_TIMES, delay }), y: forever(10 + seeded(id, 7) * 6) },
  };
  // …plus a quicker little bob, so it never sits dead still
  const bob = {
    y: wander(`${id}b`, 2, kind === "jelly" ? 7 : 4),
  };
  const bobTransition: Transition = { y: forever(2.6 + seeded(id, 12) * 1.6) };
  // fish always swim head first, turning round while out of sight
  const body: Idle = fish
    ? {
        animate: { scaleX: [1, 1, 1, -1, -1, 1], ...bob },
        transition: { scaleX: forever(d, { times: [0, 0.35, 0.61, 0.63, 0.99, 1], delay }), ...bobTransition },
      }
    : {
        animate: { rotate: wander(`${id}r`, 5, kind === "jelly" ? 4 : settles(kind) ? 8 : 16), ...bob },
        transition: { rotate: forever(d * 0.3), ...bobTransition },
      };
  return { travel, body };
}

export function DeepCreature({
  submission,
  band,
  index,
  open,
  dimmed,
  onToggle,
}: {
  submission: Submission;
  /** How deep it sits — sets the form it takes */
  band: DepthBand;
  /** Position in its zone — on wide screens creatures alternate sides */
  index: number;
  open: boolean;
  dimmed: boolean;
  onToggle: (s: Submission) => void;
}) {
  const id = submission.id;
  const glow = tintFor(submission);
  const label = labelFor(submission);
  const kind = kindFor(id, band);
  // fixed per creature, so opening another thought never restarts or jolts this one's swim
  const { travel, body } = useMemo(() => roamMotion(id, kind), [id, kind]);
  const settle: Transition = { duration: 0.9, ease: "easeOut" };
  // Phones: one loose column. Wide screens: scattered left and right, rows
  // tucked into one another, so they're come across rather than listed.
  const left = 4 + seeded(id, 1) * 54;
  const gap = 1 + seeded(id, 5) * 5;
  const onRight = index % 2 === 1;
  const wideLeft = onRight ? 56 + seeded(id, 1) * 30 : 2 + seeded(id, 1) * 30;
  const wideGap = index === 0 ? 2 : -12 + seeded(id, 5) * 14;

  const buttonRef = useRef<HTMLButtonElement>(null);
  /** The creature's resting spot — the constellation is drawn out of here */
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + r.top - window.innerHeight * 0.12, behavior: "smooth" });
  }, [open]);

  return (
    // Rows overlap on wide screens, so only the creature and its thought catch taps
    <div
      className="pointer-events-none mt-[var(--gap)] transition-opacity duration-700 md:mt-[var(--gap-wide)]"
      style={
        {
          "--gap": `${gap}svh`,
          "--gap-wide": `${r1(wideGap)}svh`,
          opacity: dimmed ? 0.3 : 1,
        } as CSSProperties
      }
    >
      {/* Roams off screen and back; comes home and holds still while its thought is open */}
      <motion.div
        className="pl-[var(--left)] md:pl-[var(--left-wide)]"
        style={{ "--left": `${left}%`, "--left-wide": `${r1(wideLeft)}%` } as CSSProperties}
        animate={open ? REST : travel.animate}
        transition={open ? settle : travel.transition}
      >
        <span className="relative inline-block">
          <motion.button
            ref={buttonRef}
            type="button"
            onClick={() => onToggle(submission)}
            aria-expanded={open}
            aria-label={
              open
                ? "Close thought"
                : `Open thought carried by ${dotKindLabel(kind)}: ${submission.key_worry ?? submission.worry_text}`
            }
            initial={{ opacity: 0, y: 28, scale: 0.9 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            // swells toward the finger or pointer, so it's clear it can be opened
            whileHover={{ scale: 1.07 }}
            viewport={{ once: true, margin: "-8% 0px" }}
            transition={{ duration: 1.4, ease: "easeOut" }}
            className="group pointer-events-auto flex flex-col items-center rounded-3xl p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foam/70"
          >
            <span ref={anchorRef} className="block">
              <motion.span
                className="block transition-[scale] duration-300 group-active:scale-95"
                animate={open ? REST : body.animate}
                transition={open ? settle : body.transition}
              >
                <span className="block">
                  {kind === "frilly" || kind === "angel" ? (
                    <ThoughtFish kind={kind} tint={glow} seed={id} />
                  ) : (
                    <span className="dive-bob-small inline-block">
                      <DotCreature kind={kind} tint={glow} seed={id} open={open} />
                    </span>
                  )}
                </span>
              </motion.span>
            </span>
            {/* the theme is named only once it's opened; until then the glow carries it */}
            {open && label && (
              <span
                className="mt-1 text-xs opacity-70"
                style={{ color: glow }}
              >
                {label}
              </span>
            )}
          </motion.button>
          {/* a little way out on the creature's upper right; the hit area reaches past the dot for fingers */}
          <AnimatePresence>
            {open && (
              <motion.button
                type="button"
                onClick={() => onToggle(submission)}
                aria-label="Close thought"
                className="pointer-events-auto absolute right-0 top-0 z-10 grid h-6 w-6 place-items-center rounded-full border bg-ink/55 text-foam backdrop-blur-md transition before:absolute before:-inset-2.5 before:content-[''] hover:bg-ink/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foam/70"
                style={{ borderColor: `${glow}88`, boxShadow: `0 0 10px ${glow}88, 0 0 2px #effffbaa` }}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              >
                <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              </motion.button>
            )}
          </AnimatePresence>
        </span>
      </motion.div>
      {open && (
        // on wide screens the thought opens on its creature's side
        <div className={`pointer-events-auto md:max-w-xl ${onRight ? "md:ml-auto" : ""}`}>
          <Constellation
            submission={submission}
            tint={glow}
            anchorRef={anchorRef}
            onClose={() => onToggle(submission)}
          />
        </div>
      )}
    </div>
  );
}
