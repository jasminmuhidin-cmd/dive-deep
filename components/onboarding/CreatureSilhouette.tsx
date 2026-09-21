"use client";

import type { FishForm } from "@/lib/types";
import { FISH_GRADIENTS, FISH_PATHS, FISH_VIEWBOX } from "./fishPaths";

export default function CreatureSilhouette({
  form,
  className = "",
  size = 280,
}: {
  form: FishForm;
  className?: string;
  size?: number;
}) {
  const g = FISH_GRADIENTS[form];
  const id = `grad-${form}-${size}`;
  const noiseId = `noise-${form}-${size}`;

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
        filter: `drop-shadow(0 0 28px ${g.glow})`,
      }}
    >
      <svg
        viewBox={FISH_VIEWBOX[form]}
        width={size}
        height={size}
        aria-hidden
        className="overflow-visible"
      >
        <defs>
          <linearGradient id={id} x1="0%" y1="100%" x2="80%" y2="0%">
            <stop offset="0%" stopColor={g.from} />
            <stop offset="45%" stopColor={g.mid} />
            <stop offset="100%" stopColor={g.to} />
          </linearGradient>
          <filter id={noiseId}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="3"
              stitchTiles="stitch"
              result="noise"
            />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.15  0 0 0 0 0.12  0 0 0 0 0.2  0 0 0 0.35 0"
              in="noise"
              result="colored"
            />
            <feComposite in="colored" in2="SourceGraphic" operator="in" />
          </filter>
        </defs>
        <path d={FISH_PATHS[form]} fill={`url(#${id})`} opacity="0.95" />
        <path
          d={FISH_PATHS[form]}
          fill={`url(#${id})`}
          filter={`url(#${noiseId})`}
          opacity="0.55"
        />
      </svg>
    </div>
  );
}
