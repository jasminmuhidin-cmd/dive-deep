# deep dive

Interactive installation MVP for initial user testing — swipeable onboarding prompts, sea-creature artefacts, live projection wall, searchable archive, and stewardship via QR.

## Quick start

**Terminal 1 — kiosk & archive**

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

**Terminal 2 — projection**

```bash
cd dive-deep-7
npm install
npm start
```

Send a ripple from the kiosk; it enters the water with the Thought entry animation.

## Print (Anko MX06)

1. Pair **MX06** in macOS Bluetooth settings  
2. Print from projection (drag a readable thought to the printer icon)  
3. Composites onto `dive-deep-7/assets/branding/receipt.png`  
4. Saves PNG to `dive-deep-7/data/prints/` and attempts system print  

- Data is stored in local SQLite at `data/shared-burdens.db`
- Branding references live in `public/branding/`
- Thermal printing is stubbed; use on-screen receipt or browser print
- Re-run `npm run seed` anytime to reset demo content
