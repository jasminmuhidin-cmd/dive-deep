"use client";

import type { CSSProperties } from "react";
import { useReducedMotion } from "framer-motion";

/** Every glass layer is cut to the logo's letterforms */
const LOGO_MASK: CSSProperties = {
  WebkitMaskImage: "url(/branding/logo-white.png)",
  maskImage: "url(/branding/logo-white.png)",
  WebkitMaskSize: "contain",
  maskSize: "contain",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
  WebkitMaskPosition: "center",
  maskPosition: "center",
};

/**
 * The Dive Deep wordmark as liquid glass: a translucent aqua body with a
 * bright rim, a highlight sliding across it, and a slow ripple running
 * through the whole thing as if seen through moving water.
 */
export default function GlassLogo({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  return (
    <h1 className={`relative ${className}`}>
      <span className="sr-only">Dive Deep</span>
      <svg width={0} height={0} className="absolute" aria-hidden focusable="false">
        <filter id="glass-logo-ripple" x="-10%" y="-25%" width="120%" height="150%">
          <feTurbulence type="fractalNoise" baseFrequency="0.006 0.035" numOctaves={2} seed={4} result="noise">
            {!reduced && (
              <animate
                attributeName="baseFrequency"
                dur="10s"
                values="0.006 0.035;0.009 0.05;0.007 0.03;0.006 0.035"
                repeatCount="indefinite"
              />
            )}
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={reduced ? 0 : 6} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <span
        className="relative block aspect-[1882/434] w-full"
        aria-hidden
        style={{
          // ripple first, then a thin dark outline, a fine bright rim and a soft shadow so it sits above the water
          filter:
            "url(#glass-logo-ripple) drop-shadow(0 0 0.6px rgba(8,24,48,0.85)) drop-shadow(0 0 0.5px rgba(255,255,255,0.9)) drop-shadow(0 0 3px rgba(255,255,255,0.35)) drop-shadow(0 6px 14px rgba(8,30,56,0.45))",
        }}
      >
        {/* the glass itself: deep ocean blue, lighter where light enters at the top — dark enough to stand out on bright water */}
        <span
          className="absolute inset-0"
          style={{
            ...LOGO_MASK,
            background:
              "linear-gradient(170deg, rgba(70,150,186,0.95) 0%, rgba(24,92,138,0.97) 30%, rgba(14,52,92,1) 65%, rgba(10,28,58,1) 100%)",
          }}
        />
        {/* caustic shimmer inside the glass */}
        <span
          className="dive-glass-caustic absolute inset-0 mix-blend-overlay"
          style={{
            ...LOGO_MASK,
            background:
              "radial-gradient(ellipse 30% 60% at 20% 30%, rgba(255,255,255,0.7), transparent 70%), radial-gradient(ellipse 25% 50% at 70% 70%, rgba(246,198,230,0.6), transparent 70%), radial-gradient(ellipse 30% 55% at 50% 20%, rgba(243,246,180,0.6), transparent 70%)",
            backgroundSize: "200% 200%",
          }}
        />
        {/* a highlight gliding across, as the surface catches the light */}
        <span
          className="dive-glass-sheen absolute inset-0"
          style={{
            ...LOGO_MASK,
            background: "linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.95) 48%, rgba(255,255,255,0.2) 54%, transparent 62%)",
            backgroundSize: "260% 100%",
          }}
        />
      </span>
    </h1>
  );
}
