"use client";

import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import { motion } from "framer-motion";
import type { Submission } from "@/lib/types";
import MosaicCreature from "./MosaicCreature";
import Ripples from "./Ripples";
import RippleThought from "./RippleThought";
import { seeded } from "./seeded";
import type { Species } from "./species";

/**
 * A creature carrying one thought, from the species of its zone. Swimmers
 * cross their own stretch of water and turn at each end; drifters rise and
 * fall where they are. Tapped, it comes home, holds still, and its thought
 * unfolds below it as a chain of ripples.
 */
export default function ThoughtFish({
  submission,
  zone,
  index,
  open,
  dimmed,
  onToggle,
}: {
  submission: Submission;
  /** The species that live at this thought's depth */
  zone: Species[];
  /** Its place in its section — the first keeps clear of the heading */
  index: number;
  open: boolean;
  dimmed: boolean;
  onToggle: (s: Submission) => void;
}) {
  const id = submission.id;
  const species = zone[Math.floor(seeded(id, 11) * zone.length)];
  // most are smaller, as if further off, with the odd big one close by
  const nearness = seeded(id, 2) ** 1.4;
  const width = Math.round(species.width * (0.5 + nearness * 0.95));
  const drifts = species.moves === "drift";
  // swimmers are drawn facing left, and some are mirrored to face right; drifters drift rightward, unmirrored
  const face = !drifts && seeded(id, 9) > 0.5 ? -1 : 1;
  /** How far it swims each way, as a share of the column */
  const swim = `${Math.round(14 + seeded(id, 3) * 14)}cqw`;
  const lap = 22 + seeded(id, 4) * 16;
  /** How far it climbs or sinks on the way out, so swims aren't dead level */
  const rise = Math.round((seeded(id, 7) - 0.5) * 40);
  // its resting spot: somewhere along the column that leaves room for the swim, leaning
  // left and right in turn, so neighbours can tuck in beside each other without colliding
  const lean = index % 2 ? 0.55 + seeded(id, 1) * 0.45 : seeded(id, 1) * 0.45;
  const room = `max(0px, (100% - ${swim} - ${width + 16}px) * ${lean.toFixed(3)})`;
  const home = face === 1 && !drifts ? `calc(${swim} + ${room})` : `calc(${room})`;

  const swimRef = useRef<HTMLSpanElement>(null);
  /** The fish's resting spot — the ripples are drawn out of here */
  const anchorRef = useRef<HTMLSpanElement>(null);

  // Opened, it glides home from wherever it had got to; closed, it sets off again from there
  useLayoutEffect(() => {
    const el = swimRef.current;
    if (!el) return;
    if (open) {
      const from = getComputedStyle(el).transform;
      el.style.animation = "none";
      const to = getComputedStyle(el).transform;
      if (from !== to) el.animate([{ transform: from }, { transform: to }], { duration: 900, easing: "ease-out" });
    } else if (el.style.animation) {
      el.style.removeProperty("animation");
      el.style.setProperty("--swim-delay", "0s");
    }
  }, [open]);

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + r.top - window.innerHeight * 0.12, behavior: "smooth" });
  }, [open]);

  return (
    // Rows tuck into one another, so creatures scatter rather than queue;
    // only the creature and its thought catch taps
    <div
      className="pointer-events-none transition-opacity duration-700"
      style={{
        marginTop: `${(index === 0 ? 2 + seeded(id, 5) * 4 : -4 + seeded(id, 5) * 16).toFixed(1)}svh`,
        // the far-off ones are a little fainter
        opacity: dimmed ? 0.3 : 0.62 + nearness * 0.38,
      }}
    >
      <div className="w-fit" style={{ marginLeft: home }}>
        <span ref={anchorRef} className="relative block">
          {open && (
            <Ripples
              size={width * 1.8}
              once
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white"
            />
          )}
          <span
            ref={swimRef}
            className={`${drifts ? "dive-drift" : "dive-swim"} block`}
            style={
              {
                "--face": face,
                "--swim": swim,
                "--rise": `${rise}px`,
                "--swim-dur": `${lap.toFixed(1)}s`,
                "--swim-delay": `-${(seeded(id, 6) * lap).toFixed(1)}s`,
              } as CSSProperties
            }
          >
            <motion.button
              type="button"
              onClick={() => onToggle(submission)}
              aria-expanded={open}
              aria-label={open ? "Close this thought" : `Open the thought this ${species.name} carries: ${submission.worry_text}`}
              className="pointer-events-auto block rounded-3xl p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.95 }}
              viewport={{ once: true, margin: "-8% 0px" }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            >
              <span className="block text-[var(--fish)] transition-colors duration-700">
                <MosaicCreature species={species} seed={id} width={width} />
              </span>
            </motion.button>
          </span>
        </span>
      </div>
      {open && (
        <div className="pointer-events-auto pr-16 md:pr-24">
          <RippleThought submission={submission} anchorRef={anchorRef} onClose={() => onToggle(submission)} />
        </div>
      )}
    </div>
  );
}
