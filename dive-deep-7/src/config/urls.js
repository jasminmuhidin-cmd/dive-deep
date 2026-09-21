// ---------------------------------------------------------------------------
// Public host for archive QR links and (by default) the kiosk API.
// Override at runtime: window.__KIOSK_API__ = 'http://localhost:3000'
// ---------------------------------------------------------------------------
export const PUBLIC_APP_URL = 'https://dive-deep.vercel.app';

export function resolveApiBase(override) {
  const raw =
    (typeof override === 'string' && override) ||
    (typeof window !== 'undefined' && window.__KIOSK_API__) ||
    PUBLIC_APP_URL;
  return String(raw).replace(/\/$/, '');
}
