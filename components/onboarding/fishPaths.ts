"use client";

import type { FishForm } from "@/lib/types";

export const FISH_PATHS: Record<FishForm, string> = {
  turtle:
    "M78 118c22-8 48-6 68 8 14 10 22 26 18 42-3 14-14 24-28 28-8 18-28 30-50 28-24-2-42-18-48-40-16-4-28-18-28-34 0-20 16-36 36-38 8-14 22-22 32 6zm-8-6c-6-18 4-34 20-40 10-4 22 0 28 10-18 4-32 14-40 30zm52 8c8-14 24-20 38-12 8 4 12 14 10 22-14-2-28 0-48-10z",
  seahorse:
    "M118 28c18 4 28 22 24 40-2 12-10 20-20 26 8 6 12 16 10 28-2 18-16 30-34 34-6 18-4 36 8 50-18-4-34-18-36-38-2-14 4-26 14-34-12-8-18-22-14-36 4-18 20-32 40-36 2-12 8-22 18-28 4-2 8 2 6 8-6 8-8 16-6 24z",
  angelfish:
    "M40 100c0-36 36-68 78-68 28 0 52 14 66 36l36-40c4-4 12-2 12 4v48c18 8 28 22 28 40s-10 32-28 40v48c0 6-8 8-12 4l-36-40c-14 22-38 36-66 36-42 0-78-32-78-68 0-12 4-24 12-34-8-10-12-22-12-34z",
  betta:
    "M48 110c20-40 56-58 96-52 18 2 34 12 44 26 22-18 48-28 74-24 6 1 8 8 4 12-20 18-36 42-40 70 8 22 6 48-10 66-4 4-12 2-12-4 0-20 2-38-6-54-16 18-40 30-66 28-34-2-62-24-74-54-2-6 2-12 8-12 6 0 14 2 22 6-8-14-12-28-10-42 2-6 8-8 14-6z",
};

/** Simple side-facing fish for projection nodes */
export const PROJECTION_FISH_PATH =
  "M2 12c4-6 12-10 22-10 8 0 14 2 20 6l10-8c1-1 3 0 3 2v6c4 2 6 5 6 8s-2 6-6 8v6c0 2-2 3-3 2l-10-8c-6 4-12 6-20 6-10 0-18-4-22-10 2-2 3-5 0-8z";

export const FISH_GRADIENTS: Record<
  FishForm,
  { from: string; mid: string; to: string; glow: string }
> = {
  turtle: {
    from: "#e9d68c",
    mid: "#4b908d",
    to: "#147a90",
    glow: "rgba(75, 144, 141, 0.45)",
  },
  seahorse: {
    from: "#e9d68c",
    mid: "#c6979d",
    to: "#8b5f7a",
    glow: "rgba(198, 151, 157, 0.5)",
  },
  angelfish: {
    from: "#c6979d",
    mid: "#147a90",
    to: "#2d3651",
    glow: "rgba(20, 122, 144, 0.45)",
  },
  betta: {
    from: "#e9d68c",
    mid: "#c6979d",
    to: "#4b908d",
    glow: "rgba(233, 214, 140, 0.4)",
  },
};

export const FISH_VIEWBOX: Record<FishForm, string> = {
  turtle: "0 0 200 200",
  seahorse: "0 0 200 220",
  angelfish: "0 0 280 220",
  betta: "0 0 280 220",
};
