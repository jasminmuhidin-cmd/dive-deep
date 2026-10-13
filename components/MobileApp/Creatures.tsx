"use client";

import type { CSSProperties, ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CATEGORY_LABELS, type Category, type Submission } from "@/lib/types";
import CreatureSilhouette from "@/components/onboarding/CreatureSilhouette";
import { PROJECTION_FISH_PATH } from "@/components/onboarding/fishPaths";

/** Bioluminescent tint per theme — doubles as fish colour in the shallows */
export const CATEGORY_GLOW: Record<Category, string> = {
  environment: "#7fe3c4",
  community: "#f2a7c3",
  future: "#7cc8ff",
  belonging: "#f5df8a",
  economy: "#b9a4ff",
  unspecified: "#cfe9ff",
};

const UNSPECIFIED_TINTS = ["#cfe9ff", "#a8e6ef", "#ffd6b8", "#d7c8ff", "#bfeccf"];

/** Theme colour; untagged thoughts get a stable tint so the water isn't monochrome */
export function tintFor(s: Submission): string {
  if (s.category && s.category !== "unspecified") {
    return CATEGORY_GLOW[s.category] ?? CATEGORY_GLOW.unspecified;
  }
  return UNSPECIFIED_TINTS[Math.floor(seeded(s.id, 10) * UNSPECIFIED_TINTS.length)];
}

/** Only label creatures that carry a theme */
function labelFor(s: Submission): string | null {
  return s.category && s.category !== "unspecified"
    ? CATEGORY_LABELS[s.category]
    : null;
}

/** Deterministic 0–1 value from a string (integer maths, so SSR and client agree) */
export function seeded(key: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function CreatureSlot({
  submission,
  onOpen,
  label,
  labelColor,
  children,
}: {
  submission: Submission;
  onOpen: (s: Submission) => void;
  label: string | null;
  labelColor: string;
  children: ReactNode;
}) {
  const id = submission.id;
  const left = 4 + seeded(id, 1) * 54;
  const swimX = (seeded(id, 2) > 0.5 ? 1 : -1) * (14 + seeded(id, 3) * 22);
  const duration = 7 + seeded(id, 4) * 6;
  const gap = 4 + seeded(id, 5) * 10;

  return (
    <div style={{ paddingLeft: `${left}%`, marginTop: `${gap}svh` }}>
      <motion.button
        type="button"
        onClick={() => onOpen(submission)}
        aria-label={`Open thought: ${submission.worry_text}`}
        initial={{ opacity: 0, y: 28, scale: 0.9 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: "-8% 0px" }}
        transition={{ duration: 1.4, ease: "easeOut" }}
        className="group flex flex-col items-center rounded-3xl p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foam/70"
      >
        <span
          className="dive-swim block transition-transform duration-300 group-active:scale-95"
          style={
            {
              "--swim-x": `${swimX}px`,
              animationDuration: `${duration}s`,
              animationDelay: `-${seeded(id, 6) * duration}s`,
            } as CSSProperties
          }
        >
          {children}
        </span>
        {label && (
          <span
            className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] opacity-70"
            style={{ color: labelColor }}
          >
            {label}
          </span>
        )}
      </motion.button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shallows                                                            */
/* ------------------------------------------------------------------ */

export function ShallowCreature({
  submission,
  onOpen,
}: {
  submission: Submission;
  onOpen: (s: Submission) => void;
}) {
  const tint = tintFor(submission);
  const facingRight = seeded(submission.id, 7) > 0.5;

  return (
    <CreatureSlot
      submission={submission}
      onOpen={onOpen}
      label={labelFor(submission)}
      labelColor="var(--foam)"
    >
      {submission.fish_form ? (
        <CreatureSilhouette form={submission.fish_form} size={92} />
      ) : (
        <svg
          viewBox="0 -1 66 34"
          width={96}
          height={50}
          aria-hidden
          style={{
            transform: facingRight ? "scaleX(-1)" : undefined,
            filter: `drop-shadow(0 0 10px ${tint}88)`,
          }}
        >
          <path d={PROJECTION_FISH_PATH} fill={tint} opacity={0.92} />
          <circle cx={10} cy={14} r={1.8} fill="#121826" />
        </svg>
      )}
    </CreatureSlot>
  );
}

/* ------------------------------------------------------------------ */
/* The deep                                                            */
/* ------------------------------------------------------------------ */

const DEEP_KINDS = ["amoeba", "angler", "jelly"] as const;
type DeepKind = (typeof DEEP_KINDS)[number];

export function DeepCreature({
  submission,
  onOpen,
}: {
  submission: Submission;
  onOpen: (s: Submission) => void;
}) {
  const glow = tintFor(submission);
  const kind: DeepKind =
    DEEP_KINDS[Math.floor(seeded(submission.id, 8) * DEEP_KINDS.length)];

  return (
    <CreatureSlot
      submission={submission}
      onOpen={onOpen}
      label={labelFor(submission)}
      labelColor={glow}
    >
      <span
        className="block"
        style={{ filter: `drop-shadow(0 0 14px ${glow}99)` }}
      >
        {kind === "amoeba" && <Amoeba glow={glow} />}
        {kind === "angler" && (
          <Anglerfish glow={glow} flip={seeded(submission.id, 9) > 0.5} />
        )}
        {kind === "jelly" && <Jellyfish glow={glow} />}
      </span>
    </CreatureSlot>
  );
}

const AMOEBA_SHAPES = [
  "M50 10C75 10 90 30 90 50C90 75 70 90 50 90C25 90 10 72 10 50C10 28 28 10 50 10Z",
  "M54 6C80 14 96 34 86 56C80 80 62 94 44 88C20 84 6 64 14 44C20 22 32 2 54 6Z",
  "M46 14C70 4 98 26 90 50C86 74 74 88 52 92C28 96 4 76 12 52C16 30 26 20 46 14Z",
];

function Amoeba({ glow }: { glow: string }) {
  const reduced = useReducedMotion();
  const cycle = [...AMOEBA_SHAPES, AMOEBA_SHAPES[0]].join(";");

  return (
    <svg viewBox="0 0 100 100" width={96} height={96} aria-hidden>
      <path
        d={AMOEBA_SHAPES[0]}
        fill={glow}
        fillOpacity={0.18}
        stroke={glow}
        strokeOpacity={0.75}
        strokeWidth={1.5}
      >
        {!reduced && (
          <animate
            attributeName="d"
            dur="7s"
            repeatCount="indefinite"
            values={cycle}
            calcMode="spline"
            keySplines="0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1"
          />
        )}
      </path>
      <circle cx={48} cy={48} r={11} fill={glow} fillOpacity={0.45}>
        {!reduced && (
          <animate
            attributeName="cx"
            dur="9s"
            repeatCount="indefinite"
            values="48;56;44;48"
          />
        )}
      </circle>
      <circle cx={48} cy={48} r={4} fill={glow} />
      <circle cx={30} cy={36} r={2} fill={glow} fillOpacity={0.7} />
      <circle cx={68} cy={62} r={2.4} fill={glow} fillOpacity={0.6} />
      <circle cx={36} cy={68} r={1.6} fill={glow} fillOpacity={0.7} />
      <circle cx={66} cy={30} r={1.4} fill={glow} fillOpacity={0.6} />
    </svg>
  );
}

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
      {/* stalk + lure */}
      <path
        d="M46 32C42 12 24 6 12 14"
        fill="none"
        stroke={glow}
        strokeOpacity={0.55}
        strokeWidth={1.4}
      />
      <circle cx={12} cy={16} r={13} fill={glow} opacity={0.18} className="dive-lure" />
      <circle cx={12} cy={16} r={4.5} fill={glow} className="dive-lure" />
      {/* body */}
      <path
        d="M30 52C34 30 62 22 88 30C104 35 112 44 116 50L136 34C138 33 140 34 139 36L132 54L139 72C140 74 138 75 136 74L116 60C110 72 96 82 76 84C52 86 32 76 30 62Z"
        fill="#0b1120"
        stroke={glow}
        strokeOpacity={0.5}
        strokeWidth={1.2}
      />
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
        strokeOpacity={0.75}
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
      {/* eye */}
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

const TENTACLES = [
  "M22 52C16 70 28 84 20 110",
  "M36 54C32 74 42 90 34 122",
  "M50 54C50 76 56 92 50 126",
  "M64 54C68 74 58 90 66 122",
  "M78 52C84 70 72 84 80 110",
];

function Jellyfish({ glow }: { glow: string }) {
  return (
    <svg viewBox="0 0 100 130" width={84} height={110} aria-hidden>
      <g className="dive-tentacles">
        {TENTACLES.map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke={glow}
            strokeOpacity={0.55}
            strokeWidth={1.3}
            strokeLinecap="round"
          />
        ))}
      </g>
      <path
        d="M10 50C10 22 30 8 50 8C70 8 90 22 90 50C82 55 74 50 66 55C58 50 42 50 34 55C26 50 18 55 10 50Z"
        fill={glow}
        fillOpacity={0.2}
        stroke={glow}
        strokeOpacity={0.85}
        strokeWidth={1.4}
      />
      <ellipse cx={50} cy={34} rx={18} ry={10} fill={glow} fillOpacity={0.35} />
      <ellipse cx={50} cy={32} rx={6} ry={3.5} fill={glow} fillOpacity={0.8} />
    </svg>
  );
}
