# Shared Burdens

Interactive installation MVP for initial user testing — kiosk, live projection wall, and stewardship via QR.

## Quick start

```bash
npm install
npm run seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Route | Purpose |
|-------|---------|
| `/` | Testing hub |
| `/kiosk` | Private multi-step submission |
| `/gallery` | Searchable archive of all submissions |
| `/projection` | Live constellation wall (second screen) |
| `/steward/[id]` | Mobile stewardship via QR |

## Phone / QR testing

Set your machine's LAN IP in `.env.local`:

```
NEXT_PUBLIC_BASE_URL=http://192.168.x.x:3000
```

Restart `npm run dev`, submit on the kiosk, then scan the on-screen QR from a phone on the same Wi‑Fi.

## Notes

- Data is stored in local SQLite at `data/shared-burdens.db`
- Thermal printing is stubbed; use on-screen receipt or browser print
- Re-run `npm run seed` anytime to reset demo content
