// ---------------------------------------------------------------------------
// Public archive host (receipt QR) vs live kiosk API (projection bridge).
// On Vercel / any non-local host, the API is same-origin by default.
// Override: window.__KIOSK_API__ = 'http://localhost:3000'
// ---------------------------------------------------------------------------
export const PUBLIC_APP_URL = 'https://dive-deep.vercel.app';

/** Local Next.js when developing with Electron on the same machine. */
export const DEFAULT_API_URL = 'http://localhost:3000';

export function resolveApiBase(override) {
  if (typeof override === 'string' && override) {
    return String(override).replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    if (window.__KIOSK_API__) {
      return String(window.__KIOSK_API__).replace(/\/$/, '');
    }
    const host = window.location?.hostname || '';
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return String(window.location.origin).replace(/\/$/, '');
    }
  }
  return DEFAULT_API_URL;
}
