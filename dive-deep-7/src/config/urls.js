// ---------------------------------------------------------------------------
// Public archive host (receipt QR) vs live kiosk API (Electron bridge).
// Override API at runtime: window.__KIOSK_API__ = 'https://dive-deep.vercel.app'
// ---------------------------------------------------------------------------
export const PUBLIC_APP_URL = 'https://dive-deep.vercel.app';

/** Where the projection polls for new ripples (local Next.js by default). */
export const DEFAULT_API_URL = 'http://localhost:3000';

export function resolveApiBase(override) {
  const raw =
    (typeof override === 'string' && override) ||
    (typeof window !== 'undefined' && window.__KIOSK_API__) ||
    DEFAULT_API_URL;
  return String(raw).replace(/\/$/, '');
}
