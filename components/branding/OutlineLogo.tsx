"use client";

import Image from "next/image";
import { useId } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * The wordmark, drawn in fine outline, wavering as if seen through moving water.
 * `tone="light"` turns the dark-blue outline pale for dark backgrounds.
 */
export default function OutlineLogo({
  className = "",
  tone = "dark",
}: {
  className?: string;
  tone?: "dark" | "light";
}) {
  const reduced = useReducedMotion();
  const id = `logo-wave-${useId().replace(/:/g, "")}`;
  const tint = tone === "light" ? " brightness(0) invert(0.92)" : "";
  return (
    <h1 className={className}>
      <svg width={0} height={0} className="absolute" aria-hidden focusable="false">
        <filter id={id} x="-5%" y="-20%" width="110%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.06" numOctaves={2} seed={7} result="noise">
            {!reduced && (
              <animate
                attributeName="baseFrequency"
                dur="9s"
                values="0.012 0.06;0.016 0.08;0.01 0.05;0.012 0.06"
                repeatCount="indefinite"
              />
            )}
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={reduced ? 0 : 7} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <Image
        src="/branding/logo-outline.svg"
        alt="Dive Deep"
        width={300}
        height={67}
        priority
        className="block h-auto w-full"
        style={{ filter: `url(#${id})${tint}` }}
      />
    </h1>
  );
}
