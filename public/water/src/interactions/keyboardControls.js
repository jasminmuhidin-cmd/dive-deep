// ---------------------------------------------------------------------------
// keyboardControls.js — facilitator and development shortcuts.
//
//   A  artefact added: one large, slow collective ripple   (always available)
//   C  camera monitor: hidden → minimal → debug → hidden   (always available: it is a setup tool)
//   D  toggle debug overlays                               (off by default)
//   T  press the Thought control                           G  force collective mode
//   R  put all thoughts back under the water               F  fullscreen
//   M  mirror camera left↔right                            S  simulate movement with the mouse when there is no camera
//   Esc  clear virtual touches
// With INSTALLATION_MODE = true, only A and C remain active.
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import { resetThoughts } from '../state/installationState.js';
import { cycleMonitorMode } from '../ui/cameraMonitor.js';

export function installKeyboardControls({ state, pointers, onArtefact, onThought }) {
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const key = e.key.toLowerCase();

    if (key === 'a') { onArtefact?.(); return; }          // facilitator: works in installation mode too
    if (key === 'c') { cycleMonitorMode(state); console.info(`[camera monitor] ${state.camera.monitorMode}`); return; }
    if (C.INSTALLATION_MODE) return;                       // participants' keyboards do nothing

    switch (key) {
      case 'd': state.debug.enabled = !state.debug.enabled; break;
      case 't': onThought?.(); break;
      case 'g': state.forceCollective = !state.forceCollective; break;
      case 'r': resetThoughts(state); break;
      case 'm': state.camera.mirror = !state.camera.mirror; break;
      case 's': state.camera.simulate = !state.camera.simulate; break;
      case 'escape': pointers.clearVirtual(); break;
      case 'f':
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen?.();
        break;
    }
  });
}
