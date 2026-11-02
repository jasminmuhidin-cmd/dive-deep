"use client";

import { Fragment } from "react";
import { mosaicMaskUrl } from "./dotMosaic";
import { seeded } from "./seeded";
import type { Species } from "./species";
import { stippleMask, useStipple } from "./useStipple";

/** A few variants per species give a school some grain, without painting one per creature */
const VARIANTS = 3;

/** Screen pixels from one dot to the next, whatever size the creature is */
const DOT_PITCH = 3.6;

/** The grid step, in the species' drawing units, that lands dots DOT_PITCH apart at `width` on screen */
function stepFor(species: Species, width: number): number {
  // rounded, so creatures of similar size share one painting
  return Math.round(((species.w / width) * DOT_PITCH) * 4) / 4;
}

function paint(species: Species, variant: number, step: number): string[] {
  return species.parts.map((part, i) =>
    mosaicMaskUrl(part.paths, {
      w: species.w,
      h: species.h,
      offset: species.offset,
      step: part.fine ? step * 0.5 : step,
      soften: part.fine ? 0 : undefined,
      seed: `${species.key}-${variant}-${i}`,
      holes: part.holes,
      solid: part.solid,
      resolution: 4,
    }),
  );
}

/**
 * A sea creature as a halftone dot grid, drawn in `currentColor`, its lights
 * in the zone's `--lume`. Each part moves on its own — a tail beating, a bell
 * pulsing, a lure swaying — and the whole body turns a few degrees toward and
 * away from you, so it reads as something alive in the water.
 */
export default function MosaicCreature({ species, seed, width }: { species: Species; seed: string; width?: number }) {
  const variant = Math.floor(seeded(seed, 21) * VARIANTS);
  const w = width ?? species.width;
  const step = stepFor(species, w);
  const layers = useStipple(`${species.key}-${variant}-${step}`, () => paint(species, variant, step));
  const beat = 0.75 + seeded(seed, 9) * 0.5;
  return (
    <span className="block [perspective:420px]" style={{ width: w, height: (w * species.h) / species.w }} aria-hidden>
      <span className="dive-turn block h-full" style={{ animationDuration: `${beat * 9}s` }}>
        <span className="dive-yaw block h-full" style={{ animationDuration: `${beat * 1.4}s` }}>
          <span
            className="dive-bob-small relative block h-full"
            style={{ animationDelay: `-${seeded(seed, 1) * 2}s` }}
          >
            {layers?.map((src, i) => {
              const part = species.parts[i];
              const layer = (
                <span
                  className={`absolute inset-0 bg-current ${part.motion ?? ""}`}
                  style={{
                    ...stippleMask(src),
                    transformOrigin: part.origin,
                    animationDuration: part.motion ? `${(beat * (part.pace ?? 1)).toFixed(2)}s` : undefined,
                  }}
                />
              );
              // a mask would clip a glow away, so lights glow from a layer around them
              return part.lume ? (
                <span key={i} className="absolute inset-0 text-[var(--lume)] [filter:drop-shadow(0_0_3px_var(--lume))]">
                  {layer}
                </span>
              ) : (
                <Fragment key={i}>{layer}</Fragment>
              );
            })}
          </span>
        </span>
      </span>
    </span>
  );
}
