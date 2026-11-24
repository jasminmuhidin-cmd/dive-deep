"use client";

/**
 * The placement water: a watercolour wash on paper, from white through sky blue to deep blue.
 * Three sea levels, each a clearly different blue, blending into one
 * another over a short soft band (no hard lines). Paper white at the top so the
 * heading sits on the same white as the rest of the kiosk.
 *
 * White text reads on every level (≥ 4.7 : 1 sunlight, 6.5 twilight,
 * 10 midnight); the heading sits on the near-white top in dark ink.
 *
 * LEVELS: each level's band, as fractions of the height. KioskFlow uses the
 * same numbers to tell which level the thought is in.
 */
export const LEVELS = [
  { id: "surface", from: 0.24, to: 0.43 },
  { id: "below", from: 0.43, to: 0.6 },
  { id: "depths", from: 0.6, to: 0.84 },
] as const;

/**
 * The wash itself is an image (public/kiosk/bg-depth.jpg, made by
 * scripts/make-kiosk-backgrounds.py) whose band edges sit on LEVELS, so it
 * is stretched to fill the screen exactly.
 */
export default function DepthWater() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0"
        style={{ background: "#9ad2ea url('/kiosk/bg-depth.jpg') 0 0 / 100% 100% no-repeat" }}
      />
    </div>
  );
}
