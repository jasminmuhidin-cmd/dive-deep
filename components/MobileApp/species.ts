import type { WorryWeight } from "@/lib/types";
import { ANGEL, FRILL } from "./frillyFish";

type Circle = { cx: number; cy: number; r: number };

/** One stippled layer of a creature, moving on its own (a tail beating, a bell pulsing) */
export type Part = {
  paths: string[];
  /** Bare circles cut out of it — an eye, a mouth */
  holes?: Circle[];
  /** Solid circles painted on top — a pupil, a row of lights */
  solid?: Circle[];
  /** CSS animation class, and the point it pivots on as a share of the box */
  motion?: string;
  origin?: string;
  /** Seconds per beat, relative to the creature's own rhythm */
  pace?: number;
  /** Drawn in the zone's bioluminescent colour rather than the creature's */
  lume?: boolean;
  /** Thin parts (tentacles, streamers) take a finer grid, so they keep their dots */
  fine?: boolean;
};

export type Species = {
  key: string;
  /** For screen readers: "the lanternfish" */
  name: string;
  /** Drawing box */
  w: number;
  h: number;
  /** Shift into the box, for drawings made round another origin */
  offset?: { x: number; y: number };
  /** On-screen width at its usual size, px — each one is scaled up or down from this */
  width: number;
  /** Swimmers cross their water and turn; drifters rise and fall where they are */
  moves: "swim" | "drift";
  parts: Part[];
};

/** A run of circles along a straight line, for lights and mouths */
function dotted(from: [number, number], to: [number, number], n: number, r: number): Circle[] {
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : i / (n - 1);
    return { cx: from[0] + (to[0] - from[0]) * t, cy: from[1] + (to[1] - from[1]) * t, r };
  });
}

/* ------------------------------------------------------------------ */
/* Epipelagic — the sunlight zone                                     */
/* ------------------------------------------------------------------ */

const FRILLY: Species = {
  key: "frilly",
  name: "frilly fish",
  w: 120,
  h: 62,
  width: 112,
  moves: "swim",
  parts: [
    { paths: [FRILL.tail, FRILL.tailInner], motion: "dive-tail-3d", origin: "53% 48%" },
    { paths: [FRILL.pectoral], motion: "dive-fin", origin: "20% 52%", pace: 1.6, fine: true },
    {
      paths: [FRILL.body, FRILL.dorsal, FRILL.anal],
      holes: [{ cx: 15, cy: 28, r: 3 }],
    },
  ],
};

const ANGELFISH: Species = {
  key: "angel",
  name: "angelfish",
  w: 124,
  h: 120,
  offset: { x: 2, y: 26 },
  width: 98,
  moves: "swim",
  parts: [
    { paths: [ANGEL.tail], motion: "dive-tail-3d", origin: "56% 47%" },
    { paths: ANGEL.streamers, motion: "dive-sway", origin: "30% 62%", pace: 3, fine: true },
    {
      paths: [ANGEL.body, ANGEL.dorsal, ANGEL.anal],
      holes: [{ cx: 18, cy: 27, r: 2.8 }],
    },
  ],
};

const TURTLE: Species = {
  key: "turtle",
  name: "sea turtle",
  w: 130,
  h: 70,
  width: 136,
  moves: "swim",
  parts: [
    // the far flipper, behind the shell
    { paths: ["M52 36C62 30 74 26 88 26C92 26 92 29 88 30C76 33 64 38 56 42Z"], motion: "dive-flipper", origin: "40% 54%", pace: 2.4 },
    {
      paths: [
        // shell, belly, head and neck, hind flipper
        "M30 34C34 18 56 8 80 10C100 12 114 22 118 34C110 40 90 44 70 44C52 44 38 41 30 34Z",
        "M32 36C46 44 70 47 94 45C104 44 112 40 116 36C108 46 88 52 66 52C50 52 38 46 32 36Z",
        "M34 37C28 32 18 29 10 31C4 32 2 36 4 39C8 43 18 44 26 42C30 41 33 39 35 38Z",
        "M108 42C114 47 120 50 126 50C128 50 128 48 126 46C120 42 114 40 110 39Z",
      ],
      holes: [{ cx: 11, cy: 35, r: 2 }],
    },
    // the near flipper, sweeping like a wing
    { paths: ["M44 41C52 52 62 60 78 66C82 67 84 64 80 62C68 56 58 47 52 39Z"], motion: "dive-flipper", origin: "36% 58%", pace: 2.4 },
  ],
};

/* ------------------------------------------------------------------ */
/* Mesopelagic — the twilight zone                                    */
/* ------------------------------------------------------------------ */

const LANTERNFISH: Species = {
  key: "lantern",
  name: "lanternfish",
  w: 120,
  h: 48,
  width: 104,
  moves: "swim",
  parts: [
    { paths: ["M88 24C97 16 105 9 116 5C113 15 113 33 116 43C105 39 97 32 88 24Z"], motion: "dive-tail-3d", origin: "74% 50%", pace: 0.8 },
    {
      paths: [
        "M6 24C10 14 24 10 40 10C60 10 78 14 92 20C96 22 96 26 92 28C78 34 60 38 40 38C24 38 10 34 6 24Z",
        "M44 11C48 4 56 2 62 4C60 8 58 11 58 13Z",
        "M58 37C62 42 68 44 74 43C70 40 68 37 68 35Z",
      ],
      // the big eye that gathers what little light there is
      holes: [{ cx: 15, cy: 21, r: 4.6 }],
    },
    // the lights along its belly it's named for
    { paths: [], solid: dotted([22, 33], [84, 29], 10, 1.4), lume: true },
  ],
};

const JELLYFISH: Species = {
  key: "jelly",
  name: "jellyfish",
  w: 80,
  h: 120,
  width: 72,
  moves: "drift",
  parts: [
    {
      paths: [
        "M14 44C12 64 18 82 12 104C11 108 13 109 14 106C20 84 15 64 17 44Z",
        "M26 45C25 66 30 86 26 112C26 116 28 116 29 112C33 86 28 66 29 45Z",
        "M54 45C55 66 50 86 54 112C54 116 52 116 51 112C47 86 52 66 51 45Z",
        "M66 44C68 64 62 82 68 104C69 108 67 109 66 106C60 84 65 64 63 44Z",
      ],
      motion: "dive-sway",
      origin: "50% 36%",
      pace: 3.2,
      fine: true,
    },
    {
      // frilled mouth-arms trailing from the middle
      paths: [
        "M34 44C30 60 38 72 32 88C30 96 34 100 38 96C42 86 36 74 42 60C44 54 42 48 40 44Z",
        "M46 44C50 58 44 70 50 84C52 90 48 94 45 90C41 80 47 68 42 56Z",
      ],
      motion: "dive-sway",
      origin: "50% 36%",
      pace: 2.6,
      fine: true,
    },
    {
      // the bell, its rim gently scalloped
      paths: [
        "M8 40C8 18 24 4 40 4C56 4 72 18 72 40C72 44 68 46 64 44C58 42 54 46 48 44C44 43 36 43 32 44C26 46 22 42 16 44C12 46 8 44 8 40Z",
      ],
      motion: "dive-pulse",
      origin: "50% 10%",
      pace: 1.8,
    },
    { paths: [], solid: dotted([20, 41], [60, 41], 6, 1.1), lume: true, motion: "dive-pulse", origin: "50% 10%", pace: 1.8 },
  ],
};

const SQUID: Species = {
  key: "squid",
  name: "squid",
  w: 130,
  h: 50,
  width: 122,
  moves: "swim",
  parts: [
    {
      // arms streaming out behind as it jets forward
      paths: [
        "M94 20C104 16 114 13 126 11C127 12 126 14 125 14C114 17 104 20 96 23Z",
        "M95 23C106 22 116 22 128 20C129 21 128 23 127 23C116 25 106 25 96 25Z",
        "M95 27C106 28 116 29 128 31C129 32 128 33 127 33C116 32 106 31 96 29Z",
        "M94 30C104 34 114 37 124 41C125 42 124 43 123 43C113 40 103 36 95 32Z",
      ],
      motion: "dive-sway",
      origin: "73% 50%",
      pace: 1.4,
      fine: true,
    },
    {
      paths: [
        // mantle, with its fins at the pointed end
        "M4 25C10 18 18 16 22 18L60 14C70 13 78 15 82 18C86 21 86 29 82 32C78 35 70 37 60 36L22 32C18 34 10 32 4 25Z",
        "M6 25C10 12 16 6 22 4C22 10 22 16 24 18Z",
        "M6 25C10 38 16 44 22 46C22 40 22 34 24 32Z",
        // head
        "M80 16C88 14 94 18 96 25C94 32 88 36 80 34Z",
      ],
      holes: [{ cx: 88, cy: 22, r: 2.8 }],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Bathypelagic — the midnight zone                                   */
/* ------------------------------------------------------------------ */

const ANGLERFISH: Species = {
  key: "angler",
  name: "anglerfish",
  w: 120,
  h: 84,
  width: 112,
  moves: "swim",
  parts: [
    { paths: ["M90 46C99 37 107 31 116 28C113 40 113 52 116 64C107 61 99 55 90 46Z"], motion: "dive-tail-3d", origin: "76% 55%", pace: 1.2 },
    {
      paths: [
        // a heavy round body with an underbite
        "M8 50C6 33 22 20 46 20C70 20 88 32 94 46C88 60 70 70 48 72C30 73 14 66 8 50Z",
        "M60 21C64 15 70 13 74 15C72 19 70 22 68 23Z",
        "M58 66C62 72 68 76 74 76C70 72 68 68 68 66Z",
      ],
      // a wide mouth set with needle teeth: bare gaps, with the dots between them standing as teeth
      holes: [...dotted([7, 52], [36, 56], 10, 1.7), { cx: 34, cy: 34, r: 2.4 }],
    },
    // the lure on its rod, swaying to draw things in
    { paths: ["M40 21C38 13 32 7 22 7C20 7 20 9 22 9C30 9 36 13 38 21Z"], motion: "dive-lure-sway", origin: "33% 25%", pace: 3.5, fine: true },
    { paths: [], solid: [{ cx: 21, cy: 8, r: 3.6 }], lume: true, motion: "dive-lure-sway", origin: "33% 25%", pace: 3.5 },
  ],
};

const GULPER: Species = {
  key: "gulper",
  name: "gulper eel",
  w: 150,
  h: 60,
  width: 156,
  moves: "swim",
  parts: [
    {
      // the long whip of a body, rippling
      paths: ["M54 23C78 21 102 25 122 27C132 28 140 29 146 29C140 31 132 32 122 33C102 35 78 37 54 35Z"],
      motion: "dive-undulate",
      origin: "36% 50%",
      pace: 1.6,
      fine: true,
    },
    { paths: [], solid: [{ cx: 146, cy: 30, r: 2.2 }], lume: true, motion: "dive-undulate", origin: "36% 50%", pace: 1.6 },
    {
      // a vast hinged mouth gaping open: a thin upper jaw over a hanging pouch
      paths: [
        "M2 14C16 10 34 11 48 16C56 19 61 23 63 28L48 27C36 23 20 19 3 18Z",
        "M4 30C18 31 34 31 48 30L63 31C61 42 52 52 36 54C20 56 6 46 4 30Z",
      ],
      holes: [{ cx: 52, cy: 22, r: 1.8 }],
    },
  ],
};

const DUMBO: Species = {
  key: "dumbo",
  name: "dumbo octopus",
  w: 90,
  h: 90,
  width: 82,
  moves: "drift",
  parts: [
    // ear-like fins, flapping
    { paths: ["M18 30C10 21 4 21 2 27C1 34 8 39 17 37Z"], motion: "dive-flap", origin: "20% 36%", pace: 1.6 },
    { paths: ["M72 30C80 21 86 21 88 27C89 34 82 39 73 37Z"], motion: "dive-flap-r", origin: "80% 36%", pace: 1.6 },
    {
      // webbed arms, opening and closing like a parasol
      paths: [
        "M22 56C18 66 12 74 8 84C16 86 24 80 30 72C34 80 40 86 45 88C50 86 56 80 60 72C66 80 74 86 82 84C78 74 72 66 68 56Z",
      ],
      motion: "dive-pulse",
      origin: "50% 62%",
      pace: 2.2,
    },
    {
      paths: ["M45 6C64 6 76 20 76 36C76 48 70 56 60 60L30 60C20 56 14 48 14 36C14 20 26 6 45 6Z"],
      holes: [
        { cx: 35, cy: 36, r: 3.4 },
        { cx: 55, cy: 36, r: 3.4 },
      ],
    },
  ],
};

export const SPECIES = { FRILLY, ANGELFISH, TURTLE, LANTERNFISH, JELLYFISH, SQUID, ANGLERFISH, GULPER, DUMBO };

/** Who lives in each part of the dive, and the colour their lights glow */
export const ZONES: Record<WorryWeight, { lume: string; species: Species[] }> = {
  // epipelagic, the sunlight zone
  recent: { lume: "#fff4c2", species: [FRILLY, ANGELFISH, TURTLE] },
  // mesopelagic, the twilight zone
  common: { lume: "#9ff0e4", species: [LANTERNFISH, JELLYFISH, SQUID] },
  // bathypelagic, the midnight zone
  deep: { lume: "#ffd98a", species: [ANGLERFISH, GULPER, DUMBO] },
};
