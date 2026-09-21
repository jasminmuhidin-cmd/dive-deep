// ---------------------------------------------------------------------------
// debugOverlay.js — development readout. Toggle with D (off by default).
// EVERYTHING numeric or technical lives here — participant mode shows none of it:
// no state names, timers, FPS, counts, coordinates, thresholds or camera views.
// INSTALLATION_MODE = true disables the overlay entirely.
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import { THOUGHT_STATE as S } from '../state/installationState.js';

const STATE_COLOUR = {
  [S.ENTERING]: 'rgb(170, 190, 255)',
  [S.SUBMERGED]: 'rgba(180, 200, 215, 0.45)',
  [S.REVEALING]: 'rgb(140, 230, 190)',
  [S.REVEALED]: 'rgb(255, 245, 160)',
  [S.BLURRING]: 'rgb(255, 170, 130)',
};

export function drawDebug(ctx, state, pointerList, fps, now, { ripples, camera } = {}) {
  const { scale, w, h } = state.view;

  // Touch radii
  const collective = state.collectiveTouchMode;
  const startR = C.THOUGHT_TOUCH_RADIUS * scale * (collective ? C.COLLECTIVE_RADIUS_MULT : 1);
  ctx.save();
  ctx.lineWidth = 1;
  for (const p of pointerList) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.arc(p.x, p.y, startR, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.arc(p.x, p.y, startR * C.THOUGHT_HOLD_RADIUS_MULT, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = p.virtual ? 'rgba(255,200,120,0.9)' : 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // Per-thought anchor + state
  ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const t of state.thoughts) {
    ctx.fillStyle = STATE_COLOUR[t.state] ?? '#fff';
    ctx.beginPath(); ctx.arc(t.px, t.py, 3, 0, Math.PI * 2); ctx.fill();
    if (t.state === S.SUBMERGED) continue;
    let label = `${t.feelingTag} · ${t.state} ${t.sharpness.toFixed(2)}`;
    if (t.readableSince !== null) {
      const left = Math.max(0, t.maxRevealDuration - (now - t.readableSince));
      label += ` · ${left.toFixed(1)}s left`;
    }
    if (t.isBeingEngaged) label += ' · attended';
    if (t.isDragging) label += ' · DRAGGING';
    if (t.printed) label += ' · printed';
    ctx.fillText(label, t.px, t.py + t.ringRadius * 1.25 + 14);
  }

  // Camera: where people / movement were detected (screen space, mirroring already applied)
  ctx.save();
  ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  for (const p of state.movementPoints) {
    const x = p.x * w, y = p.y * h;
    ctx.strokeStyle = p.moving ? 'rgba(124,255,178,0.9)' : 'rgba(124,255,178,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 26 * scale, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(124,255,178,0.95)';
    ctx.fillText(`#${p.id} ${p.moving ? 'moving' : 'still'} ${p.strength.toFixed(2)}`, x, y - 32 * scale);
  }
  ctx.restore();
  // (the camera picture itself lives in the camera monitor, top-right — ui/cameraMonitor.js, mode 'debug' shows the masks)

  // Print zone outline + last mock receipt
  const zoneTop = state.view.h * (1 - C.PRINT_ZONE_HEIGHT);
  ctx.save();
  ctx.setLineDash([2, 8]);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath(); ctx.moveTo(0, zoneTop); ctx.lineTo(state.view.w, zoneTop); ctx.stroke();
  ctx.restore();
  if (state.printer.lastReceipt) {
    const rl = state.printer.lastReceipt.split('\n');
    ctx.textAlign = 'left';
    ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = 'rgba(0, 10, 18, 0.55)';
    ctx.fillRect(10, state.view.h - rl.length * 13 - 26, 270, rl.length * 13 + 16);
    ctx.fillStyle = 'rgba(225, 240, 248, 0.9)';
    rl.forEach((l, i) => ctx.fillText(l, 16, state.view.h - rl.length * 13 - 10 + i * 13));
  }

  // Readout
  const cam = state.camera;
  const counts = ripples ? Object.entries(ripples.counts()).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none' : '—';
  const lines = [
    `FPS            ${fps.toFixed(0)}`,
    `touch points   ${pointerList.length}${pointerList.some((p) => p.virtual) ? '  (incl. virtual)' : ''}`,
    `collective     ${state.collectiveTouchMode}  (warmth ${state.collectiveAmount.toFixed(2)})`,
    `camera         ${cam.status}${cam.message ? ' — ' + cam.message : ''}${cam.simulate ? '  [mouse-simulated]' : ''}`,
    `people         ${state.personCount}   movement ${state.movementIntensity.toFixed(2)}   motion ${(cam.motionFraction * 100).toFixed(1)}%   threshold ${cam.threshold.toFixed(1)}`,
    `camera detail  ${cam.analysisFps.toFixed(0)} Hz @ ${cam.size.w}×${cam.size.h}   mirror ${cam.mirror ? 'on' : 'off'}`,
    `ripples        ${counts}`,
    `dragging       ${state.drag.count}${state.drag.inZone ? '  (over print zone)' : ''}`,
    `printer        ${state.printer.mode} — ${state.printer.status} · printed ${state.printer.count} · last ${state.printer.lastJobId ?? '—'}`,
    `connections    ${state.connectionCount}`,
    `thoughts       ${state.thoughts.length} in the water / ${state.allThoughts.length} in dataset · ${state.thoughts.filter((t) => t.state !== S.SUBMERGED).length} visible`,
    '',
    'D debug · T thought · A artefact ripple · C camera monitor (hidden/minimal/debug) · G force collective · R reset · F fullscreen',
    'M mirror camera · S simulate movement with mouse (no camera) · Shift+click virtual touch · Esc clear',
  ];
  ctx.textAlign = 'left';
  ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillStyle = 'rgba(0, 10, 18, 0.55)';
  ctx.fillRect(10, 10, 700, lines.length * 17 + 12);
  ctx.fillStyle = 'rgba(225, 240, 248, 0.95)';
  lines.forEach((l, i) => ctx.fillText(l, 18, 29 + i * 17));
}
