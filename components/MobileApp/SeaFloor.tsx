"use client";

import type { CSSProperties, Ref } from "react";
import { ChevronUp } from "lucide-react";
import { mosaicMaskUrl } from "./dotMosaic";
import { seeded } from "./seeded";
import { stippleMask, useStipple } from "./useStipple";

/** Deep blues for the floor, a shade lighter than the water above so the banks stand out */
const FAR_BANK = "#0c2848";
const SAND = "#143a63";

/** A bank's crest in a 400 × 80 box, stretched to whatever width the screen is */
const FAR_RIDGE = "M0 30C40 14 80 18 130 26C180 34 220 8 280 12C330 16 370 30 400 22V80H0Z";
const NEAR_RIDGE = "M0 26C50 42 100 36 160 24C220 12 260 26 310 34C350 40 380 28 400 22V80H0Z";

const ridge = (d: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 80' preserveAspectRatio='none'><path fill='white' d='${d}'/></svg>`,
  )}`;

/** Paler grains scattered sparsely through the sand, quiet enough to read words over */
const SAND_GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='s' x='0' y='0'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='11' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.38  0 0 0 0 0.52  0 0 0 0 0.68  7 0 0 0 -4.5'/></filter><rect width='100%' height='100%' filter='url(#s)'/></svg>",
)}")`;

/** The near bank: its crest cut by the ridge, solid below it */
const NEAR_BANK: CSSProperties = {
  backgroundColor: SAND,
  backgroundImage: SAND_GRAIN,
  backgroundSize: "160px 160px",
  WebkitMaskImage: `url("${ridge(NEAR_RIDGE)}"), linear-gradient(white, white)`,
  maskImage: `url("${ridge(NEAR_RIDGE)}"), linear-gradient(white, white)`,
  WebkitMaskSize: "100% 80px, 100% calc(100% - 79px)",
  maskSize: "100% 80px, 100% calc(100% - 79px)",
  WebkitMaskPosition: "top, bottom",
  maskPosition: "top, bottom",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
};

/** Blades of seagrass in a 32 × 140 box, rooted at the bottom */
const BLADE_PATHS = [
  "M14 140C12 110 9 80 12 54C14 34 19 16 25 2C27 0 28 2 27 4C23 20 20 38 20 58C20 86 21 112 20 140Z",
  "M16 140C18 114 19 88 15 64C12 44 7 24 3 6C2 3 4 2 5 4C11 20 17 38 21 60C25 86 24 114 22 140Z",
  "M15 140C11 118 18 100 14 80C10 60 18 42 14 22C13 14 15 6 17 2C19 8 19 16 20 24C23 44 16 62 20 82C24 102 18 120 21 140Z",
];

/** Where each blade grows, as a share of the width, and how tall */
const BLADES = [
  { left: 4, h: 118 },
  { left: 8, h: 92 },
  { left: 12, h: 128 },
  { left: 17, h: 80 },
  { left: 63, h: 96 },
  { left: 68, h: 132 },
  { left: 72, h: 104 },
  { left: 77, h: 86 },
];

/** Rays fanning out of a scallop's hinge, left bare so its ribs show */
function scallopRibs() {
  const holes: { cx: number; cy: number; r: number }[] = [];
  for (let a = -150; a <= -30; a += 20) {
    const t = (a * Math.PI) / 180;
    for (let d = 12; d <= 42; d += 3) holes.push({ cx: 32 + d * Math.cos(t), cy: 50 + d * Math.sin(t), r: 0.8 });
  }
  return holes;
}

function paintFloor() {
  return {
    blades: BLADE_PATHS.map((d, i) => mosaicMaskUrl([d], { w: 32, h: 140, step: 2.6, soften: 0, seed: `blade-${i}` })),
    scallop: mosaicMaskUrl(["M32 50L8 28C4 20 8 9 18 5C26 1 38 1 46 5C56 9 60 20 56 28Z", "M25 45L19 54H45L39 45Z"], {
      w: 64,
      h: 56,
      step: 3,
      seed: "scallop",
      holes: scallopRibs(),
    }),
    pebble: mosaicMaskUrl(["M2 10C2 4 10 0 20 0C30 0 38 4 38 10C38 16 30 20 20 20C10 20 2 16 2 10Z"], {
      w: 40,
      h: 20,
      step: 3.4,
      seed: "pebble",
    }),
  };
}

/**
 * The bottom of the dive: two banks of stippled sand, seagrass swaying
 * between them, a starfish and a scallop resting in the sand — with how many
 * thoughts are down here, and the way back up.
 */
export default function SeaFloor({ ref, count }: { ref?: Ref<HTMLElement>; count: number }) {
  const floor = useStipple("sea-floor", paintFloor);
  return (
    <footer ref={ref} className="relative mt-[16svh] text-foam">
      {/* the far bank, with seagrass rooted behind the near one */}
      <div className="relative h-[120px]" aria-hidden>
        <div
          className="absolute inset-x-0 bottom-0 h-[90px]"
          style={{ backgroundColor: FAR_BANK, ...stippleMask(ridge(FAR_RIDGE)) }}
        />
        {floor &&
          BLADES.map(({ left, h }, i) => (
            <span
              key={i}
              className="dive-sway absolute bottom-[-40px] block bg-current text-[#1f5276]"
              style={{
                left: `${left}%`,
                width: (h * 32) / 140,
                height: h,
                animationDuration: `${5 + seeded(`blade-${i}`) * 3}s`,
                animationDelay: `-${seeded(`blade-${i}`, 2) * 6}s`,
                ...stippleMask(floor.blades[i % floor.blades.length]),
              }}
            />
          ))}
      </div>

      {/* the near bank, where the words rest */}
      <div className="relative -mt-[60px] pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pl-6 pr-16 pt-[92px] text-center md:px-6" style={NEAR_BANK}>
        <h2 className="mx-auto max-w-[18rem] text-xl font-bold leading-snug">
          {count > 0
            ? `${count.toLocaleString()} ${count === 1 ? "thought is" : "thoughts are"} held down here with you.`
            : "You've reached the floor."}
        </h2>
        <p className="mt-1 italic opacity-85">None of them are carried alone.</p>
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="mx-auto mt-8 flex min-h-11 items-center gap-1.5 px-4 opacity-85 transition hover:opacity-100"
        >
          <ChevronUp className="h-4 w-4" aria-hidden />
          back to surface
        </button>

        {/* what's settled in the sand */}
        <div className="relative mx-auto mt-6 h-24 max-w-sm text-[#86a3c2]" aria-hidden>
          {floor && (
            <>
              <span className="absolute bottom-3 left-[20%] block h-[42px] w-12 -rotate-12 bg-current" style={stippleMask(floor.scallop)} />
              <span className="absolute bottom-2 left-[38%] block h-3 w-6 bg-current opacity-80" style={stippleMask(floor.pebble)} />
              <span className="absolute bottom-6 left-[47%] block h-2 w-4 bg-current opacity-70" style={stippleMask(floor.pebble)} />
              <span className="absolute bottom-1 right-[38%] block h-3.5 w-7 bg-current opacity-80" style={stippleMask(floor.pebble)} />
            </>
          )}
          <span
            className="absolute bottom-0 right-[16%] block h-20 w-20 rotate-[18deg] bg-current"
            style={stippleMask("/branding/starfish-stipple.png")}
          />
        </div>
      </div>
    </footer>
  );
}
