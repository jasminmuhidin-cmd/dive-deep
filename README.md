# deep dive

Interactive installation MVP for initial user testing — swipeable onboarding prompts, sea-creature artefacts, live projection wall, searchable archive, and stewardship via QR.

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
| `/kiosk` | Deep dive onboarding (prompt cards → fish → friction → release) |
| `/gallery` | Searchable archive of all submissions |
| `/projection` | Live constellation wall (second screen) |
| `/steward/[id]` | Mobile stewardship via QR |

### Prompt → creature

| Prompt | Creature |
|--------|----------|
| Care | Turtle |
| Worry | Seahorse |
| Curiosity | Angelfish |
| Voice | Betta |

## Phone / QR testing

Set your machine's LAN IP in `.env.local`:

```
NEXT_PUBLIC_BASE_URL=http://192.168.x.x:3000
```

Restart `npm run dev`, submit on the kiosk, then scan the on-screen QR from a phone on the same Wi‑Fi.

## Notes

- Data is stored in local SQLite at `data/shared-burdens.db`
- Branding references live in `public/branding/`
- Thermal printing is stubbed; use on-screen receipt or browser print
- Re-run `npm run seed` anytime to reset demo content
