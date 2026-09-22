// ---------------------------------------------------------------------------
// pointerManager.js — tracks every active pointer (touch, pen, mouse).
//
// Uses Pointer Events, so multi-touch works on touchscreens. For development
// with a single mouse, SHIFT+CLICK drops (or removes) a "virtual" pointer that
// stays down — hold a second, real click to test collective touch.
// ---------------------------------------------------------------------------

const VIRTUAL_REMOVE_RADIUS = 36; // px

export function createPointerManager(canvas) {
  /** @type {Map<number|string, object>} */
  const pointers = new Map();
  const listeners = { down: [], up: [], move: [] };
  let virtualCounter = 0;

  const now = () => performance.now() / 1000;
  const emit = (type, p) => listeners[type].forEach((fn) => fn(p));

  function local(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function add(p) {
    pointers.set(p.id, p);
    emit('down', p);
  }
  function remove(id) {
    const p = pointers.get(id);
    if (!p) return;
    pointers.delete(id);
    emit('up', p);
  }

  function toggleVirtual({ x, y }) {
    for (const p of pointers.values()) {
      if (p.virtual && Math.hypot(p.x - x, p.y - y) < VIRTUAL_REMOVE_RADIUS) {
        remove(p.id);
        return;
      }
    }
    add({ id: `virtual-${++virtualCounter}`, type: 'virtual', virtual: true, x, y, downTime: now(), nextRippleAt: 0 });
  }

  function clearVirtual() {
    for (const p of [...pointers.values()]) if (p.virtual) remove(p.id);
  }

  canvas.style.touchAction = 'none';

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.pointerType === 'mouse' && e.shiftKey) { toggleVirtual(local(e)); return; }
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events can't be captured */ }
    add({ id: e.pointerId, type: e.pointerType, virtual: false, ...local(e), downTime: now(), nextRippleAt: 0 });
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    Object.assign(p, local(e));
    emit('move', p);
  });

  const end = (e) => remove(e.pointerId);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', end);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Never leave a ghost touch behind if the window loses focus.
  window.addEventListener('blur', () => {
    for (const p of [...pointers.values()]) if (!p.virtual) remove(p.id);
  });

  return {
    /** Active pointers as an array (real + virtual). */
    list: () => [...pointers.values()],
    get count() { return pointers.size; },
    toggleVirtual,
    clearVirtual,
    on(type, fn) { listeners[type].push(fn); },
  };
}
