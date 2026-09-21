// ---------------------------------------------------------------------------
// camera.js — webcam access. Low-res frames go to motionDetection.js; the result
// is written into `state` (personCount, movementIntensity, movementPoints).
//
// The video is NEVER shown to participants: it lives in a detached <video> element
// and is only ever analysed at a tiny size. For setup and testing, a low-res grey
// preview is kept for the small camera monitor (ui/cameraMonitor.js) — but ONLY while
// the monitor is not 'hidden'; in the final installation nothing is drawn or built.
//
// If the camera can't start (no device, permission denied, in use) the reason is
// logged clearly to the console, `state.camera.status` records it, and the rest of
// the installation carries on. Errors other than a permission denial are retried.
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';
import { createMotionDetector } from './motionDetection.js';

const TAG = '[camera]';

export function createCamera({ state, detector = createMotionDetector(), clock = () => performance.now() / 1000 }) {
  const cam = state.camera;
  let stream = null, video = null, timer = null, retryTimer = null;
  let canvas = null, cctx = null, gray = null;
  let lastFrameAt = 0, lastTickAt = 0, fpsEma = 0;
  let previewCanvas = null, maskCanvas = null;

  const setStatus = (status, message = '') => { cam.status = status; cam.message = message; };

  function clearOutput() {
    state.personCount = 0;
    state.movementIntensity = 0;
    state.movementPoints = [];
    cam.motionFraction = 0;
  }

  let lastFailure = '';
  function fail(status, message, { retry = true, error } = {}) {
    setStatus(status, message);
    if (message !== lastFailure) {                         // say it clearly once; quiet retries afterwards
      console.error(`${TAG} ${message}`, error?.name ? `(${error.name})` : '');
      console.warn(`${TAG} the installation continues without camera input. With no camera, press S to simulate movement with the mouse.`);
      lastFailure = message;
    }
    clearOutput();
    stop(false);
    if (retry) retryTimer = setTimeout(start, C.CAMERA_RETRY_SECONDS * 1000);
  }

  function explain(err) {
    switch (err?.name) {
      case 'NotAllowedError': case 'PermissionDeniedError': case 'SecurityError':
        return { status: 'denied', retry: false, message:
          'Camera permission was denied. Allow camera access for this app (macOS: System Settings → Privacy & Security → Camera; ' +
          'browser: the padlock next to the address bar) and restart. Ripples from movement are disabled until then.' };
      case 'NotFoundError': case 'DevicesNotFoundError': case 'OverconstrainedError':
        return { status: 'unavailable', retry: true, message: 'No camera was found. Connect a webcam — this will retry automatically.' };
      case 'NotReadableError': case 'TrackStartError':
        return { status: 'error', retry: true, message: 'The camera is busy or cannot be read (is another app using it?). Will retry.' };
      default:
        return { status: 'error', retry: true, message: `The camera could not start (${err?.name || 'unknown error'}: ${err?.message || ''}). Will retry.` };
    }
  }

  async function start() {
    if (!C.CAMERA_ENABLED) { setStatus('off', 'camera disabled in constants.js'); return; }
    if (stream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      fail('unavailable', 'This environment has no camera API (navigator.mediaDevices.getUserMedia). Running without camera.', { retry: false });
      return;
    }
    setStatus('starting', 'requesting camera…');
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: 'user' },
        audio: false,
      });
    } catch (err) {
      const e = explain(err);
      fail(e.status, e.message, { retry: e.retry, error: err });
      return;
    }

    try {
      video = document.createElement('video');            // never attached to the page: never visible
      video.muted = true; video.playsInline = true; video.srcObject = stream;
      await video.play();
    } catch (err) {
      fail('error', 'The camera opened but its video would not play. Will retry.', { error: err });
      return;
    }
    stream.getVideoTracks().forEach((tr) => { tr.onended = () => fail('error', 'The camera stopped (unplugged?). Will retry.'); });

    detector.reset();
    lastFrameAt = clock();
    lastFailure = '';
    setStatus('ready', `${stream.getVideoTracks()[0]?.label || 'camera'} (${video.videoWidth}×${video.videoHeight})`);
    console.info(`${TAG} ready — ${cam.message}. Analysing at ${C.CAMERA_ANALYSIS_WIDTH}px wide, ${C.CAMERA_ANALYSIS_HZ} Hz. The video is never displayed.`);
    timer = setInterval(tick, 1000 / C.CAMERA_ANALYSIS_HZ);
  }

  function stop(clear = true) {
    if (timer) { clearInterval(timer); timer = null; }
    if (retryTimer && clear) { clearTimeout(retryTimer); retryTimer = null; }
    if (stream) { stream.getTracks().forEach((tr) => { tr.onended = null; tr.stop(); }); stream = null; }
    video = null;
    if (clear) { setStatus('off', ''); clearOutput(); }
  }

  function tick() {
    const now = clock();
    if (!video || video.readyState < 2 || !video.videoWidth) {
      if (now - lastFrameAt > 4) fail('error', 'The camera stopped delivering frames. Will retry.');
      return;
    }
    lastFrameAt = now;

    const aw = C.CAMERA_ANALYSIS_WIDTH;
    const ah = Math.max(8, Math.round((aw * video.videoHeight) / video.videoWidth));
    if (!canvas || canvas.width !== aw || canvas.height !== ah) {
      canvas = document.createElement('canvas'); canvas.width = aw; canvas.height = ah;
      cctx = canvas.getContext('2d', { willReadFrequently: true });
      gray = new Uint8Array(aw * ah);
      cam.size = { w: aw, h: ah };
    }
    cctx.drawImage(video, 0, 0, aw, ah);                   // the browser's own downscale also averages away noise
    const px = cctx.getImageData(0, 0, aw, ah).data;
    for (let i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = (px[j] * 77 + px[j + 1] * 150 + px[j + 2] * 29) >> 8;

    const res = detector.process(gray, aw, ah, now);
    if (lastTickAt) fpsEma += (1 / Math.max(0.001, now - lastTickAt) - fpsEma) * 0.1;
    lastTickAt = now;

    // Publish. Mirroring: a camera facing the visitors sees their right on the image's left,
    // so flip x to make movement appear on the matching side of the screen.
    const mirror = cam.mirror;
    state.personCount = res.personCount;
    state.movementIntensity = res.movementIntensity;
    state.movementPoints = res.tracks.map((t) => ({
      id: t.id, x: mirror ? 1 - t.x : t.x, y: t.y, strength: t.energy, moving: t.moving, present: t.present,
      // velocity in screen space (fraction of the screen per second) and the body's box, mirrored like the position
      vx: mirror ? -t.vx : t.vx, vy: t.vy, area: t.area,
      box: mirror ? { x0: 1 - t.box.x1, x1: 1 - t.box.x0, y0: t.box.y0, y1: t.box.y1 } : { ...t.box },
    }));
    cam.motionFraction = res.motionFraction;
    cam.threshold = res.threshold;
    cam.analysisFps = fpsEma;

    cam.frames = (cam.frames || 0) + 1;
    cam.lastFrameAt = now;
    if (cam.monitorMode && cam.monitorMode !== 'hidden' && cam.panelSlide > 0.001) renderPreview(cam.monitorMode === 'debug' || state.debug.enabled);
  }

  /**
   * The camera monitor's picture: a dim, low-contrast grey frame (never colour), and — in debug — a transparent
   * overlay of what the detector counts as movement (warm) and presence (cool). Not built while the monitor is hidden.
   */
  function renderPreview(withMasks) {
    const { width: w, height: h, motion, presence } = detector.debug;
    if (!w || !motion) return;
    if (!previewCanvas || previewCanvas.width !== w || previewCanvas.height !== h) {
      previewCanvas = document.createElement('canvas'); previewCanvas.width = w; previewCanvas.height = h;
      maskCanvas = document.createElement('canvas'); maskCanvas.width = w; maskCanvas.height = h;
    }
    const pctx = previewCanvas.getContext('2d');
    const img = pctx.createImageData(w, h);
    for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
      const g = 26 + gray[i] * 0.55;                       // desaturated, contrast reduced
      img.data[j] = g; img.data[j + 1] = g; img.data[j + 2] = g; img.data[j + 3] = 255;
    }
    pctx.putImageData(img, 0, 0);
    if (withMasks) {
      const mctx = maskCanvas.getContext('2d');
      const m = mctx.createImageData(w, h);
      for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
        if (motion[i]) { m.data[j] = 255; m.data[j + 1] = 90; m.data[j + 2] = 70; m.data[j + 3] = 130; }
        else if (presence[i]) { m.data[j] = 70; m.data[j + 1] = 210; m.data[j + 2] = 200; m.data[j + 3] = 90; }
      }
      mctx.putImageData(m, 0, 0);
    }
  }

  return { start, stop, get previewCanvas() { return previewCanvas; }, get maskCanvas() { return maskCanvas; }, detector };
}
