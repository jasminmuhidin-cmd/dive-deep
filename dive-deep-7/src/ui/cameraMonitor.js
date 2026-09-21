// ---------------------------------------------------------------------------
// cameraMonitor.js — a small, deliberately technical "behind the scenes" monitor (top-right corner).
//
// It exists so that during setup and testing you can tell at a glance whether camera detection works: a low-res,
// desaturated live preview, outlines around every detected person / movement region, centre points, a person count
// and a status light. It is drawn like an instrument panel (monospace, square, dim) so it never reads as part of the water.
// It never identifies anyone — it only shows where movement / presence is being detected.
//
//   state.camera.monitorMode
//     'hidden'   nothing drawn, and the camera does not even build a preview (final installation)
//     'minimal'  small feed · detection outlines · centre points · "camera active" light · detected count
//     'debug'    larger feed · movement (warm) and presence (cool) masks · thirds guide · per person: id, x/y, movement,
//                velocity arrow · movement intensity · motion % · threshold · analysis FPS
//
//   Press C to cycle: hidden → minimal → debug → hidden.
//
// Pure canvas drawing: the layout helper `monitorLayout` is exported so tests can check it without a DOM.
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';

export const MONITOR_MODES = ['hidden', 'minimal', 'debug'];

/** hidden → minimal → debug → hidden. Returns the new mode. */
export function cycleMonitorMode(state) {
  const i = MONITOR_MODES.indexOf(state.camera.monitorMode);
  state.camera.monitorMode = MONITOR_MODES[(i + 1) % MONITOR_MODES.length];
  return state.camera.monitorMode;
}

export function setMonitorMode(state, mode) {
  if (MONITOR_MODES.includes(mode)) state.camera.monitorMode = mode;
  return state.camera.monitorMode;
}

const MARGIN = 14, HEAD = 20, PAD = 6;
const FONT = '10px ui-monospace, Menlo, Consolas, "Courier New", monospace';
const GREEN = '124,255,178';

/** Where everything sits, in CSS px (independent of the artwork's scale). */
export function monitorLayout(state, aspect = 0.75) {
  const mode = state.camera.monitorMode;
  const debug = mode === 'debug';
  const feedW = Math.round(C.CAMERA_MONITOR_WIDTH * (debug ? 1.35 : 1));
  const feedH = Math.round(feedW * aspect);
  const persons = Math.min(state.movementPoints.length || state.people.length, 6);
  const foot = debug ? 12 * (4 + persons) + 8 : 20;
  const width = feedW + PAD * 2;
  const height = HEAD + feedH + foot + PAD;
  const x = state.view.w - width - MARGIN, y = MARGIN;
  return { x, y, width, height, feed: { x: x + PAD, y: y + HEAD, w: feedW, h: feedH }, footY: y + HEAD + feedH };
}

function statusLight(cam, now) {
  switch (cam.status) {
    case 'ready': return { rgb: GREEN, label: 'ACTIVE', pulse: true };      // camera.js drops to 'error' itself if frames stop
    case 'starting': return { rgb: '255,200,90', label: 'STARTING', pulse: true };
    case 'denied': return { rgb: '255,110,100', label: 'PERMISSION DENIED', pulse: false };
    case 'error': return { rgb: '255,110,100', label: 'ERROR', pulse: false };
    case 'unavailable': return { rgb: '255,160,90', label: 'NO CAMERA', pulse: false };
    default: return { rgb: '150,160,170', label: cam.simulate ? 'MOUSE SIM' : 'OFF', pulse: false };
  }
}

function corners(ctx, x0, y0, x1, y1, len) {
  ctx.beginPath();
  ctx.moveTo(x0, y0 + len); ctx.lineTo(x0, y0); ctx.lineTo(x0 + len, y0);
  ctx.moveTo(x1 - len, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + len);
  ctx.moveTo(x1, y1 - len); ctx.lineTo(x1, y1); ctx.lineTo(x1 - len, y1);
  ctx.moveTo(x0 + len, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - len);
  ctx.stroke();
}

/** Ease the slide toward open/closed. Returns 0 (fully off screen) … 1 (fully in). */
export function updatePanelSlide(state, dt) {
  const cam = state.camera, target = cam.panelOpen ? 1 : 0;
  const step = dt / Math.max(0.05, C.CAMERA_PANEL_SLIDE_TIME);
  cam.panelSlide = cam.panelSlide < target ? Math.min(target, cam.panelSlide + step) : Math.max(target, cam.panelSlide - step);
  return cam.panelSlide;
}
export const slideEase = (t) => t * t * (3 - 2 * t);
export function togglePanel(state) { state.camera.panelOpen = !state.camera.panelOpen; return state.camera.panelOpen; }

export function drawCameraMonitor(ctx, state, camera, fps, now) {
  const cam = state.camera;
  const mode = cam.monitorMode;
  if (mode === 'hidden' || !state.view.w) return;
  if (cam.panelSlide <= 0.001) return;                     // fully collapsed: only the DOM tab remains
  const debug = mode === 'debug';
  const prev = camera && camera.previewCanvas;
  const aspect = prev && prev.width ? prev.height / prev.width : 0.75;
  const L = monitorLayout(state, aspect);
  const off = (1 - slideEase(cam.panelSlide)) * (L.width + MARGIN + 2);   // slides off the right edge
  L.x += off; L.feed.x += off;
  const F = L.feed;
  const light = statusLight(cam, now);
  const live = cam.status === 'ready' && prev;

  ctx.save();
  ctx.font = FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';

  // panel
  ctx.fillStyle = 'rgba(5, 9, 13, 0.84)';
  ctx.fillRect(L.x, L.y, L.width, L.height);
  ctx.strokeStyle = 'rgba(160, 180, 190, 0.35)'; ctx.lineWidth = 1;
  ctx.strokeRect(L.x + 0.5, L.y + 0.5, L.width - 1, L.height - 1);

  // header: label + status light
  ctx.fillStyle = 'rgba(200, 215, 222, 0.85)';
  ctx.fillText('CAMERA / DETECTION', L.x + PAD, L.y + HEAD / 2 + 1);
  const pulse = light.pulse ? 0.65 + 0.35 * Math.sin(now * 3.2) : 1;
  ctx.fillStyle = `rgba(${light.rgb},${pulse})`;
  ctx.beginPath(); ctx.arc(L.x + L.width - PAD - 5, L.y + HEAD / 2, 3.5, 0, Math.PI * 2); ctx.fill();
  if (debug) {
    ctx.textAlign = 'right'; ctx.fillStyle = `rgba(${light.rgb},0.9)`;
    ctx.fillText(light.label, L.x + L.width - PAD - 14, L.y + HEAD / 2 + 1);
    ctx.textAlign = 'left';
  }

  // feed
  ctx.fillStyle = '#0a1116'; ctx.fillRect(F.x, F.y, F.w, F.h);
  if (live) {
    ctx.save();
    ctx.beginPath(); ctx.rect(F.x, F.y, F.w, F.h); ctx.clip();
    if (cam.mirror) { ctx.translate(F.x + F.w, F.y); ctx.scale(-1, 1); ctx.drawImage(prev, 0, 0, F.w, F.h); }
    else ctx.drawImage(prev, F.x, F.y, F.w, F.h);
    if (debug && camera.maskCanvas) {
      if (cam.mirror) ctx.drawImage(camera.maskCanvas, 0, 0, F.w, F.h);   // (the context is already flipped and translated)
      else ctx.drawImage(camera.maskCanvas, F.x, F.y, F.w, F.h);
    }
    ctx.restore();
  } else {
    ctx.strokeStyle = 'rgba(150,165,175,0.18)';
    ctx.beginPath(); ctx.moveTo(F.x, F.y); ctx.lineTo(F.x + F.w, F.y + F.h); ctx.moveTo(F.x + F.w, F.y); ctx.lineTo(F.x, F.y + F.h); ctx.stroke();
    ctx.fillStyle = 'rgba(190,205,212,0.75)'; ctx.textAlign = 'center';
    ctx.fillText('NO SIGNAL', F.x + F.w / 2, F.y + F.h - 22);
    ctx.fillStyle = `rgba(${light.rgb},0.85)`;
    ctx.fillText(light.label, F.x + F.w / 2, F.y + F.h - 9);
    ctx.textAlign = 'left';
  }

  // thirds guide (debug): shows how the camera frame maps onto the water — left third = left of the screen
  if (debug) {
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    for (const k of [1 / 3, 2 / 3]) { ctx.moveTo(F.x + F.w * k, F.y); ctx.lineTo(F.x + F.w * k, F.y + F.h); ctx.moveTo(F.x, F.y + F.h * k); ctx.lineTo(F.x + F.w, F.y + F.h * k); }
    ctx.stroke();
  }

  // detections: outlines + centre points (positions are already in screen space — mirroring applied — like the water)
  const pts = state.movementPoints;
  ctx.lineWidth = 1;
  for (const p of pts) {
    const moving = p.moving && p.present;
    const a = p.present ? (moving ? 0.95 : 0.6) : 0.3;
    ctx.strokeStyle = `rgba(${GREEN},${a})`;
    if (p.box) {
      const x0 = F.x + p.box.x0 * F.w, y0 = F.y + p.box.y0 * F.h, x1 = F.x + p.box.x1 * F.w, y1 = F.y + p.box.y1 * F.h;
      ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(x1 - x0), Math.round(y1 - y0));
      if (moving) { ctx.lineWidth = 2; corners(ctx, x0, y0, x1, y1, Math.min(8, (x1 - x0) / 3)); ctx.lineWidth = 1; }
    }
    const cx = F.x + p.x * F.w, cy = F.y + p.y * F.h;
    ctx.beginPath(); ctx.moveTo(cx - 4, cy); ctx.lineTo(cx + 4, cy); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx, cy + 4); ctx.stroke();
    if (debug) {
      ctx.fillStyle = `rgba(${GREEN},0.95)`; ctx.fillText(`#${p.id}`, cx + 6, cy - 6);
      const sp = Math.hypot(p.vx || 0, p.vy || 0);
      if (sp > 0.02) {                                   // velocity arrow, screen-space
        const k = Math.min(1, 0.4 / sp) * F.w * 0.5;
        ctx.strokeStyle = 'rgba(255,225,140,0.9)';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + p.vx * k, cy + (p.vy * k * F.w) / F.h); ctx.stroke();
      }
    }
  }
  // no camera but the mouse is standing in (S): show its point too
  if (!live && state.people.length && !pts.length) {
    ctx.strokeStyle = 'rgba(255,225,140,0.85)';
    for (const q of state.people) {
      const cx = F.x + (q.x / state.view.w) * F.w, cy = F.y + (q.y / state.view.h) * F.h;
      ctx.strokeRect(cx - 7.5, cy - 7.5, 15, 15);
    }
  }
  ctx.strokeStyle = 'rgba(160,180,190,0.35)'; ctx.strokeRect(F.x + 0.5, F.y + 0.5, F.w - 1, F.h - 1);

  // footer
  ctx.textAlign = 'left';
  const n = state.personCount;
  ctx.fillStyle = 'rgba(210, 225, 232, 0.9)';
  if (!debug) {
    ctx.fillText(`detected: ${n}`, F.x, L.footY + 11);
  } else {
    let ly = L.footY + 11;
    const row = (txt, col = 'rgba(200,215,222,0.85)') => { ctx.fillStyle = col; ctx.fillText(txt, F.x, ly); ly += 12; };
    row(`detected: ${n}   movement ${state.movementIntensity.toFixed(2)}   motion ${(cam.motionFraction * 100).toFixed(1)}%`, 'rgba(225,238,244,0.95)');
    row(`${(cam.analysisFps || 0).toFixed(0)} Hz @ ${cam.size.w}×${cam.size.h}   thr ${cam.threshold.toFixed(1)}   sens ${C.CAMERA_SENSITIVITY}   render ${fps.toFixed(0)} fps`);
    row(`mirror ${cam.mirror ? 'on' : 'off'}   ${cam.status}${cam.simulate ? '   mouse-sim' : ''}   [C] cycle   [M] mirror`, 'rgba(160,178,188,0.8)');
    if (!pts.length) row('no one detected', 'rgba(160,178,188,0.7)');
    for (const p of pts.slice(0, 6)) {
      row(`#${p.id}  x ${p.x.toFixed(2)}  y ${p.y.toFixed(2)}  e ${p.strength.toFixed(2)}  ${p.present ? (p.moving ? 'moving' : 'still') : 'fading'}`,
          p.moving ? `rgba(${GREEN},0.95)` : 'rgba(200,215,222,0.75)');
    }
  }
  ctx.restore();
}
