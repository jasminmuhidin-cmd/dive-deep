// ---------------------------------------------------------------------------
// printZone.js — a quiet band of lighter water along the bottom edge.
// Invisible normally; it fades in gradually as a carried thought approaches (armed at
// PRINT_ZONE_START_RATIO), brightens toward PRINT_TRIGGER_RATIO, and lingers softly after a print.
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import { rgba } from './palette.js';
import { drawPrinterIcon } from './icons.js';

export function drawPrintZone(ctx, state, now) {
  const z = state.printZone;
  const vis = Math.max(z.visible, z.flash * 0.9);
  const { w, h, scale } = state.view;
  const zh = h * C.PRINT_ZONE_HEIGHT;
  const top = h - zh;
  if (vis < 0.01) {                                  // resting state: the water band is hidden, but the printer icon is always there
    if (C.PRINT_ICON_ALWAYS_VISIBLE) drawRestingIcon(ctx, state, w / 2, top + zh * 0.5 - 8 * scale, scale);
    return;
  }
  const light = state.palette.light;
  const ap = z.approach || 0;
  const glow = ap * 0.6 + z.hover * 0.2 + z.flash * 0.5;      // brighter as the thought nears the trigger line

  // Body: lighter water rising from the bottom, with a gently moving surface edge.
  const g = ctx.createLinearGradient(0, top, 0, h);
  g.addColorStop(0, rgba(light, 0));
  g.addColorStop(0.25, rgba(light, (0.07 + 0.1 * glow) * vis));
  g.addColorStop(1, rgba(light, (0.16 + 0.14 * glow) * vis));
  const edgeY = (x) => top + Math.sin(x * 0.011 + now * 0.6) * 3.5 * scale + Math.sin(x * 0.027 - now * 0.4) * 2 * scale;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w + 16; x += 16) ctx.lineTo(x, edgeY(x));
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();

  ctx.beginPath();
  for (let x = 0; x <= w + 16; x += 16) (x === 0 ? ctx.moveTo(x, edgeY(x)) : ctx.lineTo(x, edgeY(x)));
  ctx.strokeStyle = rgba(light, (0.22 + 0.25 * glow) * vis);
  ctx.lineWidth = 1.2 * Math.max(0.7, scale);
  ctx.stroke();

  // Icon and a slow ring that rises while a finger is over the zone.
  const cx = w / 2, cy = top + zh * 0.5;
  if (ap > 0.05) {
    const ph = (now * 0.35) % 1;
    ctx.beginPath();
    ctx.arc(cx, cy - 8 * scale, (26 + ph * 70) * scale, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(light, (1 - ph) * 0.22 * ap * vis);
    ctx.lineWidth = 1.2 * Math.max(0.7, scale);
    ctx.stroke();
  }
  // Don't fight with a thought being carried across the icon: fade only when the words overlap it.
  let cover = 0;
  for (const t of state.thoughts) {
    if (!t.isDragging || !t.sprite) continue;
    const gapX = Math.abs(t.px - cx) - t.sprite.textW / 2;
    const gapY = Math.abs(t.py - cy) - t.sprite.textH / 2;
    cover = Math.max(cover, 1 - Math.min(1, Math.max(0, Math.max(gapX, gapY) / (60 * scale))));
  }
  const dim = 1 - 0.85 * cover;
  const printing = state.printer.status === 'printing';
  const breathe = printing ? 0.85 + 0.15 * Math.sin(now * 3) : 1;
  drawPrinterIcon(ctx, cx, cy - 8 * scale, 34 * scale, rgba([248, 244, 232], Math.max(C.PRINT_ICON_ALWAYS_VISIBLE ? C.PRINT_ICON_IDLE_OPACITY : 0, (0.3 + 0.6 * Math.max(ap, z.flash)) * vis) * breathe * dim));

  if (ap > 0.7) {                                   // the only words: a quiet instruction, never a status
    ctx.font = `italic ${Math.round(15 * scale)}px ${C.THOUGHT_FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba([248, 244, 232], ap * vis * 0.8 * dim);
    ctx.fillText('let go to print', cx, cy + 30 * scale);
  }
}

/** The quiet, always-visible printer icon at the bottom centre (fades only while a carried thought passes over it). */
function drawRestingIcon(ctx, state, cx, cy, scale) {
  let cover = 0;
  for (const t of state.thoughts) {
    if (!t.isDragging || !t.sprite) continue;
    const gapX = Math.abs(t.px - cx) - t.sprite.textW / 2, gapY = Math.abs(t.py - cy) - t.sprite.textH / 2;
    cover = Math.max(cover, 1 - Math.min(1, Math.max(0, Math.max(gapX, gapY) / (60 * scale))));
  }
  drawPrinterIcon(ctx, cx, cy, 34 * scale, rgba([248, 244, 232], C.PRINT_ICON_IDLE_OPACITY * (1 - 0.85 * cover)));
}
