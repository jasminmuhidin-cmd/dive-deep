# deep dive

Interactive installation: Next.js kiosk + archive, dive-deep-7 Electron water projection.

## Live site

Archive QR target: **https://dive-deep.vercel.app** (deploy Next.js there when ready).  
Electron still polls **http://localhost:3000** for live ripples during the installation.

On the **local Mac** kiosk (`npm run dev`), each receipt PNG is also sent via **Messages / iMessage** to `IMESSAGE_TO` (default `0422322522` → `+61422322522`). Requires Messages signed in and Automation permission for Terminal/Node (System Settings → Privacy & Security → Automation). Set `IMESSAGE_SEND=0` to disable. Does not run on Vercel.

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
