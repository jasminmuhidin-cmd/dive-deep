"use client";

import type { FishForm } from "@/lib/types";
import { FISH_GRADIENTS, FISH_PATHS, FISH_VIEWBOX } from "./fishPaths";

/** Fish vessel — user text contained inside the silhouette via foreignObject */
export default function FishTextVessel({
  form = "betta",
  text,
  insight,
  className = "",
  size = 360,
}: {
  form?: FishForm;
  text: string;
  insight?: string | null;
  className?: string;
  size?: number;
}) {
  const g = FISH_GRADIENTS[form];
  const uid = `fv-${form}-${Math.round(size)}`;

  return (
    <div
      className={`relative mx-auto ${className}`}
      style={{
        width: size,
        height: size * 0.78,
        filter: `drop-shadow(0 0 28px ${g.glow})`,
      }}
    >
      <svg
        viewBox={FISH_VIEWBOX[form]}
        className="h-full w-full overflow-visible"
        role="img"
        aria-label={text}
      >
        <defs>
          <linearGradient id={`${uid}-g`} x1="0%" y1="100%" x2="90%" y2="0%">
            <stop offset="0%" stopColor={g.from} />
            <stop offset="50%" stopColor={g.mid} />
            <stop offset="100%" stopColor={g.to} />
          </linearGradient>
          <clipPath id={`${uid}-c`}>
            <path d={FISH_PATHS[form]} />
          </clipPath>
        </defs>
        <path d={FISH_PATHS[form]} fill={`url(#${uid}-g)`} opacity="0.95" />
        <foreignObject
          x="16%"
          y="30%"
          width="58%"
          height="42%"
          clipPath={`url(#${uid}-c)`}
        >
          <div className="flex h-full w-full flex-col items-center justify-center overflow-hidden px-1 text-center">
            <p
              style={{
                margin: 0,
                fontFamily: "Georgia, serif",
                fontSize: insight ? "12px" : "14px",
                lineHeight: 1.35,
                color: "#121826",
                wordBreak: "break-word",
              }}
            >
              {text || "…"}
            </p>
            {insight ? (
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: "10px",
                  lineHeight: 1.3,
                  color: "rgba(45,54,81,0.85)",
                }}
              >
                {insight}
              </p>
            ) : null}
          </div>
        </foreignObject>
      </svg>
    </div>
  );
}
