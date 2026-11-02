// From Saskia's mobile site (components/MobileApp/frillyFish.ts).
/** Veil-tail fins (betta-like), drawn facing left in a 120×62 box */
export const FRILL = {
  body: "M8 30C14 18 30 13 46 15C56 16 62 22 66 30C62 38 56 44 46 45C30 47 14 42 8 30Z",
  tail: "M62 30C70 16 84 5 100 2C98 7 106 8 112 6C108 12 116 16 113 21C119 24 115 29 118 32C114 36 118 41 112 44C114 50 107 52 104 57C100 55 98 59 94 61C80 56 70 44 62 30Z",
  tailInner: "M64 30C72 20 84 12 96 10C96 16 104 20 102 26C106 30 102 34 104 38C100 42 98 48 92 52C80 48 70 40 64 30Z",
  dorsal: "M22 18C24 9 34 2 46 1C46 5 52 4 56 6C55 10 60 11 59 15C62 17 60 20 58 20C48 15 34 14 22 18Z",
  anal: "M30 43C34 51 42 58 52 61C51 57 57 58 59 54C56 52 60 49 57 46C50 46 40 46 30 43Z",
  pectoral: "M24 32C30 34 35 40 33 47C30 43 26 41 22 41C25 38 25 35 24 32Z",
  /** Gill arc behind the eye */
  gill: "M27 19Q22 30 27 41",
  /** Highlight along the back, for roundness */
  sheen: "M14 23C22 17 34 15 48 17",
};

/** Where the tail's fin lines end, along the tail's edge */
export const TAIL_RAYS = [8, 16, 24, 32, 40, 48, 56];

/** Angelfish: a tall disc with swept-back sails and belly streamers, facing left */
export const ANGEL = {
  viewBox: "-2 -26 124 120",
  body: "M8 31C12 16 28 8 44 10C58 12 68 22 70 31C68 40 58 50 44 52C28 54 12 46 8 31Z",
  tail: "M68 31C76 22 86 17 97 15C93 25 93 37 97 47C86 45 76 40 68 31Z",
  dorsal: "M24 13C34 2 56 -12 82 -20C76 -8 71 6 66 21C58 14 42 9 24 13Z",
  anal: "M24 49C34 60 56 74 82 82C76 70 71 56 66 41C58 48 42 53 24 49Z",
  dorsalRay: "M76 -16Q90 -20 104 -24",
  analRay: "M76 78Q90 82 104 86",
  sheen: "M16 20C24 14 36 12 50 14",
  streamers: ["M34 48C38 62 46 76 60 90", "M38 47C44 60 54 72 70 82"],
};

/** Soft vertical stripes across the angelfish's body */
export const ANGEL_BANDS = ["M28 12Q24 31 28 51", "M46 10Q42 31 46 52", "M62 18Q59 31 62 45"];
