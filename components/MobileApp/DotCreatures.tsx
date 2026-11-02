"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { ANGEL, FRILL } from "./frillyFish";
import { mosaicFromPaths, type MosaicDot } from "./dotMosaic";
import type { DeepKind } from "./DeepForms";

export type DotKind = DeepKind | "frilly" | "angel";

export function isDotFish(kind: DotKind) {
  return kind === "frilly" || kind === "angel" || kind === "angler";
}

export function dotKindLabel(kind: DotKind): string {
  if (kind === "frilly") return "a frilly fish";
  if (kind === "angel") return "an angelfish";
  if (kind === "angler") return "an anglerfish";
  if (kind === "jelly") return "a jellyfish";
  return `a ${kind}`;
}

type Size = { w: number; h: number; displayW: number; displayH: number };

const SIZE: Record<DotKind, Size> = {
  frilly: { w: 120, h: 62, displayW: 120, displayH: 62 },
  angel: { w: 124, h: 120, displayW: 100, displayH: 97 },
  angler: { w: 110, h: 70, displayW: 110, displayH: 70 },
  jelly: { w: 72, h: 96, displayW: 72, displayH: 96 },
  amoeba: { w: 88, h: 88, displayW: 88, displayH: 88 },
  pseudopod: { w: 96, h: 96, displayW: 96, displayH: 96 },
  bacillus: { w: 100, h: 40, displayW: 100, displayH: 40 },
  cocci: { w: 72, h: 72, displayW: 72, displayH: 72 },
  spirillum: { w: 108, h: 48, displayW: 108, displayH: 48 },
  diatom: { w: 80, h: 80, displayW: 80, displayH: 80 },
  pearl: { w: 56, h: 56, displayW: 56, displayH: 56 },
  clam: { w: 80, h: 56, displayW: 80, displayH: 56 },
  nautilus: { w: 72, h: 72, displayW: 72, displayH: 72 },
  starfish: { w: 88, h: 88, displayW: 88, displayH: 88 },
};

function pathsFor(kind: DotKind): { paths: string[]; circles?: { cx: number; cy: number; r: number }[]; step?: number } {
  switch (kind) {
    case "frilly":
      return {
        paths: [FRILL.body, FRILL.tail, FRILL.tailInner, FRILL.dorsal, FRILL.anal, FRILL.pectoral],
        circles: [{ cx: 15, cy: 28, r: 2.2 }],
        step: 1.25,
      };
    case "angel":
      return {
        // shift angel paths into positive box (viewBox starts at -2,-26)
        paths: [
          shiftPath(ANGEL.body, 2, 26),
          shiftPath(ANGEL.tail, 2, 26),
          shiftPath(ANGEL.dorsal, 2, 26),
          shiftPath(ANGEL.anal, 2, 26),
          ...ANGEL.streamers.map((d) => shiftPath(d, 2, 26)),
        ],
        circles: [{ cx: 20, cy: 53, r: 2 }],
        step: 1.4,
      };
    case "angler":
      return {
        paths: [
          "M12 38C18 22 40 14 62 18C78 21 92 32 96 42C90 52 74 58 56 56C36 54 18 50 12 38Z",
          "M88 36C98 28 108 22 118 18C112 30 108 40 112 48C104 44 96 42 88 36Z",
          "M48 16C50 6 54 0 58 -2C56 6 55 12 54 18",
        ],
        circles: [
          { cx: 58, cy: -2, r: 2.5 },
          { cx: 28, cy: 34, r: 2 },
        ],
        step: 1.35,
      };
    case "jelly":
      return {
        paths: [
          "M12 28C12 12 28 4 36 4C44 4 60 12 60 28C60 40 48 46 36 46C24 46 12 40 12 28Z",
          "M20 46C18 62 16 78 18 92",
          "M28 46C28 64 30 80 28 94",
          "M36 46C38 66 36 82 38 96",
          "M44 46C46 64 48 80 46 92",
          "M52 46C54 62 56 78 54 90",
        ],
        step: 1.3,
      };
    case "amoeba":
      return {
        paths: [
          "M44 16C58 12 72 22 76 36C80 52 70 68 54 72C36 76 20 64 18 46C16 28 30 20 44 16Z",
        ],
        step: 1.4,
      };
    case "pseudopod":
      return {
        paths: [
          "M40 20C56 14 72 24 74 40C76 56 64 70 48 72C32 74 18 62 20 44C22 28 28 24 40 20Z",
          "M72 36C86 28 98 34 100 46C102 56 92 62 80 56",
          "M24 58C14 68 12 82 22 88C32 94 42 84 38 72",
        ],
        step: 1.35,
      };
    case "bacillus":
      return {
        paths: ["M12 20C12 10 20 6 50 6C80 6 88 10 88 20C88 30 80 34 50 34C20 34 12 30 12 20Z"],
        step: 1.2,
      };
    case "cocci":
      return {
        paths: [],
        circles: [
          { cx: 26, cy: 28, r: 14 },
          { cx: 46, cy: 36, r: 13 },
          { cx: 36, cy: 48, r: 12 },
        ],
        step: 1.35,
      };
    case "spirillum":
      return {
        paths: [
          "M6 24C18 10 30 10 42 24C54 38 66 38 78 24C90 10 102 14 108 24C102 34 90 38 78 28C66 18 54 18 42 28C30 38 18 36 6 24Z",
        ],
        step: 1.25,
      };
    case "diatom":
      return {
        paths: [
          "M40 8C56 8 68 20 68 36C68 52 56 64 40 64C24 64 12 52 12 36C12 20 24 8 40 8Z",
        ],
        step: 1.35,
      };
    case "pearl":
      return {
        paths: [],
        circles: [{ cx: 28, cy: 28, r: 22 }],
        step: 1.3,
      };
    case "clam":
      return {
        paths: [
          "M8 32C12 16 28 8 40 8C52 8 68 16 72 32C68 48 52 52 40 52C28 52 12 48 8 32Z",
        ],
        step: 1.3,
      };
    case "nautilus":
      return {
        paths: [
          "M36 8C56 8 68 24 64 42C60 58 42 68 26 62C12 56 8 38 16 24C22 14 28 8 36 8Z",
        ],
        circles: [{ cx: 40, cy: 36, r: 10 }],
        step: 1.35,
      };
    case "starfish":
      return {
        paths: [
          "M44 6L50 30L74 24L56 42L70 64L44 52L18 64L32 42L14 24L38 30Z",
        ],
        step: 1.35,
      };
  }
}

/** Rough translate for absolute path numbers (angel viewBox offset) */
function shiftPath(d: string, dx: number, dy: number) {
  return d.replace(/(-?\d*\.?\d+) (-?\d*\.?\d+)/g, (_, xs: string, ys: string) => {
    const x = Number(xs) + dx;
    const y = Number(ys) + dy;
    return `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`;
  });
}

const cache = new Map<string, MosaicDot[]>();

function dotsFor(kind: DotKind, seed: string): MosaicDot[] {
  const key = `${kind}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const size = SIZE[kind];
  const spec = pathsFor(kind);
  const dots = mosaicFromPaths(spec.paths, {
    w: size.w,
    h: size.h,
    step: spec.step,
    seed,
    circles: spec.circles,
  });
  cache.set(key, dots);
  return dots;
}

/**
 * Fine stipple creature — muted ink grain silhouette.
 * Tint comes from the existing category glow; containers keep swim animations.
 */
export function DotCreature({
  kind,
  tint,
  seed,
  open = false,
  className = "",
}: {
  kind: DotKind;
  tint: string;
  seed: string;
  open?: boolean;
  className?: string;
}) {
  const size = SIZE[kind];
  const [dots, setDots] = useState<MosaicDot[]>([]);
  useEffect(() => {
    setDots(dotsFor(kind, seed));
  }, [kind, seed]);
  const scale = open ? 1.06 : 1;

  const style: CSSProperties = {
    width: size.displayW * scale,
    height: size.displayH * scale,
    filter: `drop-shadow(0 0 ${open ? 14 : 8}px ${tint}99)`,
    opacity: open ? 1 : 0.94,
  };

  return (
    <svg
      viewBox={`0 0 ${size.w} ${size.h}`}
      width={size.displayW * scale}
      height={size.displayH * scale}
      className={`block overflow-visible ${className}`}
      style={style}
      aria-hidden
    >
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={tint} opacity={d.a} />
      ))}
    </svg>
  );
}
