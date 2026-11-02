/**
 * The frilly (betta-like) fish from the Saskia mobile site
 * (components/MobileApp/frillyFish.ts there), drawn facing LEFT in a
 * 120 × 62 box. Body is ~58 units long, centred near (37, 30).
 */
export const FRILL = {
  body: "M8 30C14 18 30 13 46 15C56 16 62 22 66 30C62 38 56 44 46 45C30 47 14 42 8 30Z",
  tail: "M62 30C70 16 84 5 100 2C98 7 106 8 112 6C108 12 116 16 113 21C119 24 115 29 118 32C114 36 118 41 112 44C114 50 107 52 104 57C100 55 98 59 94 61C80 56 70 44 62 30Z",
  tailInner: "M64 30C72 20 84 12 96 10C96 16 104 20 102 26C106 30 102 34 104 38C100 42 98 48 92 52C80 48 70 40 64 30Z",
  dorsal: "M22 18C24 9 34 2 46 1C46 5 52 4 56 6C55 10 60 11 59 15C62 17 60 20 58 20C48 15 34 14 22 18Z",
  anal: "M30 43C34 51 42 58 52 61C51 57 57 58 59 54C56 52 60 49 57 46C50 46 40 46 30 43Z",
  pectoral: "M24 32C30 34 35 40 33 47C30 43 26 41 22 41C25 38 25 35 24 32Z",
};
export const FRILL_BOX = { w: 120, h: 62 };

/**
 * Paint the fish as a white silhouette (alpha = coverage) into a canvas.
 * Body fully opaque; the frilly fins very slightly lighter so the shape
 * still reads as layered fins when it's large.
 */
export function paintFishSprite(w: number, h: number, blurPx = 0): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.scale(w / FRILL_BOX.w, h / FRILL_BOX.h);
  if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
  ctx.fillStyle = "#fff";
  ctx.globalAlpha = 1;
  ctx.fill(new Path2D(FRILL.tail));
  ctx.fill(new Path2D(FRILL.dorsal));
  ctx.fill(new Path2D(FRILL.anal));
  ctx.globalAlpha = 1;
  ctx.fill(new Path2D(FRILL.tailInner));
  ctx.fill(new Path2D(FRILL.body));
  ctx.fill(new Path2D(FRILL.pectoral));
  return c;
}
