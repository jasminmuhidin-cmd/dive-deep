"use client";

import { useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { mosaicMaskUrl } from "./dotMosaic";
import { stippleMask, useStipple } from "./useStipple";

/** Show once the diver has left the opening screen behind */
const SHOW_AFTER_SCREENS = 0.6;

/** The submarine's drawing box — nose on the left, propeller on the right */
const SUB_W = 132;
const SUB_H = 72;

function paintSubmarine() {
  return {
    hull: mosaicMaskUrl(
      [
        "M34 28H100A16 16 0 0 1 100 60H34A16 16 0 0 1 34 28Z",
        "M50 30L54 16H76L82 30Z",
        // periscope, looking ahead
        "M55 17V4H45V8H52V17Z",
        "M110 34L124 26L120 40Z",
        "M110 54L124 62L120 48Z",
      ],
      {
        w: SUB_W,
        h: SUB_H,
        step: 4.6,
        seed: "submarine",
        // bare portholes, so the water shows through
        holes: [44, 66, 88].map((cx) => ({ cx, cy: 44, r: 5.5 })),
      },
    ),
    prop: mosaicMaskUrl(["M126 35A3 9 0 1 0 126 53A3 9 0 1 0 126 35Z"], {
      w: SUB_W,
      h: SUB_H,
      step: 2.4,
      soften: 0,
      seed: "submarine-prop",
    }),
  };
}

/** A little stippled submarine in `currentColor`, its propeller turning */
export function MosaicSubmarine({ width = 64, fast = false }: { width?: number; fast?: boolean }) {
  const m = useStipple("submarine", paintSubmarine);
  return (
    <span className="relative block" style={{ width, height: (width * SUB_H) / SUB_W }} aria-hidden>
      {m && (
        <>
          <span className="absolute inset-0 bg-current" style={stippleMask(m.hull)} />
          <span
            className="dive-prop absolute inset-0 bg-current"
            style={{ ...stippleMask(m.prop), transformOrigin: "95.5% 61%", animationDuration: fast ? "0.12s" : "0.4s" }}
          />
        </>
      )}
    </span>
  );
}

/**
 * A little submarine waiting in the corner once you've dived. Tapped, it
 * tilts its nose up and carries you back to the surface.
 */
export default function SurfaceSubmarine() {
  const { scrollY } = useScroll();
  const [visible, setVisible] = useState(false);
  const [ascending, setAscending] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => {
    setVisible(y > window.innerHeight * SHOW_AFTER_SCREENS);
    if (y < 8) setAscending(false);
  });

  function surface() {
    setAscending(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={surface}
          aria-label="Back to the surface"
          className="group fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 z-30 flex flex-col items-center rounded-2xl p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current md:left-6"
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <span className="dive-sub-bob relative block">
            <motion.span
              className="block text-[var(--fish)] transition-colors duration-700"
              // nose on the left, so tilting anticlockwise points it up
              animate={{ rotate: ascending ? -24 : 0 }}
              transition={{ type: "spring", stiffness: 60, damping: 12 }}
            >
              <MosaicSubmarine fast={ascending} />
            </motion.span>
            {/* bubbles trailing off the propeller */}
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="dive-sub-bubble absolute right-0 top-1/2 block h-1 w-1 rounded-full border border-white/80 bg-white/30"
                style={{ animationDelay: `${i * 0.5}s`, animationDuration: ascending ? "0.7s" : "1.6s" }}
                aria-hidden
              />
            ))}
          </span>
          <span className="mt-1 flex items-center gap-0.5 tracking-[0.04em] opacity-75 transition group-hover:opacity-100">
            <ArrowUp className="h-3 w-3" aria-hidden />
            {ascending ? "surfacing" : "surface"}
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
