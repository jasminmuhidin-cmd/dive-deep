# dive deep

A mobile-first dive through the thoughts people leave at the Dive Deep installation. Scroll down through the sunlight, twilight and midnight zones, tap a fish to read the thought it carries, and add your own ripple.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Old `/mobile` links (including `?thought=<id>`) redirect to `/`.

## Routes

| Route | Purpose |
|-------|---------|
| `/` | The dive |
| `GET /api/submissions` | Every thought in the water |
| `POST /api/submissions` | A new thought from the kiosk (`worry_text`, 1–50 words) |
| `POST /api/submissions/[id]/uncover` | Count someone uncovering a thought |
| `GET/POST /api/responses` | Ripples (replies) on a thought, by `submission_id` |

## Data

Thoughts are stored in SQLite (`data/shared-burdens.db`) locally and in Vercel Blob on Vercel. Until there are enough live thoughts, the dive also shows sample responses from `lib/sample-responses.json`.

| Script | What it does |
|--------|--------------|
| `npm run import-responses` | Rebuilds the samples from `components/MobileApp/Kiosk_Worries_Responses.xlsx` |
| `npm run key-worries` | Names the key worry for any thought that doesn't have one (needs `ANTHROPIC_API_KEY`) |
| `npm run wipe -- --yes` | Deletes every thought and reply |
