// Tiny canvas-drawn icons (no image assets, so they inherit the water's palette).

/** A simple printer: paper in at the top, paper out at the bottom. Centered on (cx, cy). */
export function drawPrinterIcon(ctx, cx, cy, size, color) {
  const w = size, h = size * 0.86;
  const x = cx - w / 2, y = cy - h / 2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.4, size * 0.085);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.rect(x + w * 0.26, y, w * 0.48, h * 0.34); ctx.stroke();                 // paper in
  ctx.beginPath(); ctx.roundRect(x, y + h * 0.3, w, h * 0.42, size * 0.1); ctx.stroke();        // body
  ctx.beginPath(); ctx.rect(x + w * 0.22, y + h * 0.58, w * 0.56, h * 0.42); ctx.stroke();      // paper out
  ctx.beginPath();
  ctx.moveTo(x + w * 0.34, y + h * 0.74); ctx.lineTo(x + w * 0.66, y + h * 0.74);
  ctx.moveTo(x + w * 0.34, y + h * 0.87); ctx.lineTo(x + w * 0.58, y + h * 0.87);
  ctx.stroke();
  ctx.restore();
}
