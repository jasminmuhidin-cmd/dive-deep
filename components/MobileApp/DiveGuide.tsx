"use client";

import { useState, type ReactNode, type RefObject } from "react";
import { motion } from "framer-motion";
import MosaicCreature from "./MosaicCreature";
import RippleChain, { type RippleNode } from "./RippleChain";
import Ripples from "./Ripples";
import { SPECIES } from "./species";
import { MosaicSubmarine } from "./SurfaceSubmarine";

/** The ring of words round the guide fish */
const ORBIT_R = 84;
/** The guide fish's tappable square, ring of words and all */
export const GUIDE_BOX = (ORBIT_R + 14) * 2;
const ORBIT = "tap the fish \u00b7 learn how to explore \u00b7 tap the fish \u00b7 learn how to explore \u00b7 ";

/**
 * The first fish you meet: it swims up into the opening screen, then waits
 * inside a slowly turning ring of words, rippling, asking to be tapped.
 * Tapped, the guide unfolds beneath it — so you learn how the dive works by
 * doing it once.
 */
export function GuidePrompt({
  fishRef,
  open,
  onToggle,
}: {
  fishRef: RefObject<HTMLSpanElement | null>;
  open: boolean;
  onToggle: () => void;
}) {
  /** It swims in first; only once it's here does it call for a tap */
  const [arrived, setArrived] = useState(false);
  const calling = arrived && !open;
  const box = GUIDE_BOX;
  return (
    <div className="flex flex-col items-center">
      <motion.button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="dive-guide"
        aria-label={open ? "Hide how to explore" : "Tap the fish to learn how to explore"}
        className="relative grid place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        style={{ width: box, height: box }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
      >
        {/* the words, set round the fish like a ring on the water and turning with it */}
        <motion.svg
          viewBox={`${-box / 2} ${-box / 2} ${box} ${box}`}
          width={box}
          height={box}
          className="dive-orbit pointer-events-none absolute inset-0 overflow-visible"
          initial={{ opacity: 0 }}
          animate={{ opacity: calling ? 1 : 0 }}
          transition={{ duration: 1.2 }}
          aria-hidden
        >
          <path id="guide-orbit" d={`M0 ${-ORBIT_R}a${ORBIT_R} ${ORBIT_R} 0 1 1 -0.01 0`} fill="none" />
          <text className="fill-current italic">
            <textPath href="#guide-orbit" textLength={2 * Math.PI * ORBIT_R - 4} lengthAdjust="spacing">
              {ORBIT}
            </textPath>
          </text>
        </motion.svg>
        {/* swims up from the deep, nose tilted up, settling as it arrives */}
        <motion.span
          ref={fishRef}
          className="relative block"
          initial={{ x: "30vw", y: "16vh", rotate: 18, scale: 0.5, opacity: 0 }}
          animate={{ x: "0vw", y: "0vh", rotate: 0, scale: 1, opacity: 1 }}
          transition={{ duration: 2.4, delay: 0.8, ease: "easeOut" }}
          onAnimationComplete={() => setArrived(true)}
        >
          {calling && (
            <Ripples size={128} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white" />
          )}
          <span className="relative block text-[var(--fish)] transition-colors duration-700">
            <MosaicCreature species={SPECIES.FRILLY} seed="guide" width={112} />
          </span>
        </motion.span>
      </motion.button>
    </div>
  );
}

/** One step of the guide: what to do, then a line on why */
function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h3 className="text-lg font-bold leading-snug">{title}</h3>
      <p className="mt-1 opacity-85">{children}</p>
    </>
  );
}

const GUIDE: RippleNode[] = [
  {
    key: "scroll",
    content: (
      <Step title="Scroll to sink deeper">
        Thoughts are sorted by how closely someone holds them: recent thoughts near the surface, heavier ones
        further down.
      </Step>
    ),
  },
  {
    key: "tap",
    content: (
      <Step title="Tap a fish">
        Every creature below carries something a visitor left behind. Tap one and its thought unfolds, just like
        this.
      </Step>
    ),
  },
  {
    key: "ripple",
    content: <Step title="Add a ripple">Leave a reply if you wish.</Step>,
  },
  {
    key: "surface",
    content: (
      <Step title="Head back up">
        When you&apos;re ready to return to the surface, tap the submarine.
        <span className="mt-2 block w-fit text-[var(--fish)]">
          <MosaicSubmarine width={48} />
        </span>
      </Step>
    ),
  },
];

/** How to explore, unfolding out of the guide fish the same way every thought does */
export function GuideSteps({ fishRef }: { fishRef: RefObject<HTMLElement | null> }) {
  return (
    <section id="dive-guide" aria-label="How to explore" className="mx-auto max-w-lg pb-[4svh] pl-3 pr-16 md:max-w-2xl">
      <RippleChain nodes={GUIDE} anchorRef={fishRef} seed="guide" />
    </section>
  );
}
