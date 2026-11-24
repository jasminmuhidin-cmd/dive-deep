"use client";

import FishSchool from "./FishSchool";

/**
 * A few creatures drifting through the placement water: soft halftone
 * amoebas (from the kiosk artwork) and a small loose school of Saskia's
 * fish. Faint and slow — atmosphere, never in the way.
 */
const AMOEBAS = [
  { src: 1, left: "62%", top: "40%", size: "9vmin", dur: 46, delay: 0 },
  { src: 3, left: "78%", top: "64%", size: "12vmin", dur: 58, delay: -20 },
  { src: 4, left: "40%", top: "80%", size: "10vmin", dur: 52, delay: -35 },
  { src: 5, left: "88%", top: "34%", size: "7vmin", dur: 40, delay: -12 },
];

export default function Floaters() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {AMOEBAS.map((a) => {
        const url = `/kiosk/amoeba-${a.src}.png`;
        return (
          <div
            key={a.src}
            className="kiosk-floater absolute"
            style={{
              left: a.left,
              top: a.top,
              width: a.size,
              height: a.size,
              animationDuration: `${a.dur}s`,
              animationDelay: `${a.delay}s`,
              background: "rgba(255,255,255,0.55)",
              WebkitMaskImage: `url(${url})`,
              maskImage: `url(${url})`,
              WebkitMaskSize: "contain",
              maskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
            }}
          />
        );
      })}
      <FishSchool seed="place" count={10} size={[10, 18]} speed={45} colour="#ffffff" opacity={0.5} />
    </div>
  );
}
