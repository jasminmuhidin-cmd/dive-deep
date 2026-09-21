# deep dive

Interactive installation: Next.js kiosk + archive, dive-deep-7 Electron water projection.

## Live site

Public URL: **https://dive-deep.vercel.app**  
Receipt QR codes and the Electron kiosk bridge default to this host.  
For local API testing: `window.__KIOSK_API__ = 'http://localhost:3000'` in Electron DevTools.

## Quick start

**Terminal 1 — kiosk & archive**

```bash
npm install
npm run seed
npm run dev
```

Open http://localhost:3000/kiosk and http://localhost:3000/gallery  
(or the live site at https://dive-deep.vercel.app)

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

WalkPrint app remains a fallback if the OS cannot talk to the device directly.
