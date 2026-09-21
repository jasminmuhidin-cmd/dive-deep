// ---------------------------------------------------------------------------
// cameraTab.js — the small side tab that collapses / reopens the camera panel (works in minimal AND debug mode).
// A real DOM button: canvas clicks would reach the water. It rides on the panel's left edge, and stays as a slim
// tab at the screen edge when the panel is slid away. Hidden only when the monitor mode is 'hidden'.
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import { monitorLayout, slideEase, togglePanel } from './cameraMonitor.js';

export function createCameraTab(state, camera = null) {
  const btn = document.createElement('button');
  btn.id = 'camera-tab'; btn.type = 'button';
  btn.setAttribute('aria-label', 'toggle camera panel');
  Object.assign(btn.style, {
    position: 'fixed', zIndex: '20', top: '14px', height: '54px', width: '22px', padding: '0', margin: '0',
    background: 'rgba(5,9,13,0.84)', border: '1px solid rgba(160,180,190,0.35)', borderRight: 'none',
    color: 'rgba(200,215,222,0.85)', font: '10px ui-monospace, Menlo, Consolas, "Courier New", monospace',
    cursor: 'pointer', display: 'none', writingMode: 'vertical-rl', letterSpacing: '0.08em', touchAction: 'manipulation',
  });
  for (const ev of ['pointerdown', 'pointerup', 'click', 'touchstart', 'mousedown']) btn.addEventListener(ev, (e) => e.stopPropagation());
  btn.addEventListener('click', () => { togglePanel(state); update(); });
  document.body.appendChild(btn);

  function update() {
    const cam = state.camera;
    if (cam.monitorMode === 'hidden' || !state.view.w) { btn.style.display = 'none'; return; }
    btn.style.display = 'block';
    const prev = camera && camera.previewCanvas;
    const L = monitorLayout(state, prev && prev.width ? prev.height / prev.width : 0.75);
    const off = (1 - slideEase(cam.panelSlide)) * (L.width + 14 + 2);
    btn.style.left = `${Math.round(L.x + off - 22)}px`;
    btn.textContent = `${cam.panelOpen ? '\u203A ' : '\u2039 '}${C.CAMERA_PANEL_TAB_LABEL}`;
    btn.setAttribute('aria-expanded', String(!!cam.panelOpen));
  }
  return { el: btn, update };
}
