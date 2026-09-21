/** Public origin for archive links / QR codes (no trailing slash). */
export const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://dive-deep.vercel.app"
).replace(/\/$/, "");
