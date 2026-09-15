# Project Overview: Interactive Installation – "Collective Efficacy & Shared Burdens"
We are building the complete digital stack for an interactive physical installation addressing compassion fatigue and detachment by fostering empathy and collective efficacy. 

The installation has four interconnected digital touchpoints:
1. **Input Kiosk (Touch/Keyboard UI):** A private, low-distraction interface where visitors submit a personal worry and an offering/action.
2. **Ambient Projection Screen (Visualizer):** A dynamic, living canvas that projects visitor submissions as interconnected clusters rather than a high-speed noise wall.
3. **Receipt/Card Print Service:** A background service or webhook triggered upon submission to print a physical artifact containing the submission ID, text, and a unique QR code.
4. **Stewardship Web App (Mobile View via QR):** A lightweight web page tied to each specific artifact where another visitor can log a response or micro-action, notifying the original author that their burden was acknowledged.

---

## Tech Stack Recommendations
- **Frontend / Kiosk & Web App:** Next.js (App Router), Tailwind CSS, Framer Motion, Lucide icons.
- **Visualizer / Projection Canvas:** React + HTML5 Canvas or `@react-three/fiber` / `p5.js` / D3-force for an organic, breathing constellation/node layout.
- **Backend & Database:** Supabase or SQLite/PostgreSQL with WebSockets (or Supabase Realtime) so new submissions appear seamlessly on the projection screen without page refreshes.
- **Print Integration:** Node.js thermal receipt printer bridge (using `escpos` or a local print queue script) triggered via API route.

---

## Data Schema Requirements

### Table: `submissions`
- `id` (UUID, primary key)
- `worry_text` (Text, max 280 chars) – "A quiet worry you carry"
- `offering_text` (Text, max 280 chars) – "One small offering/perspective you give to others"
- `category` (Enum / Tag: e.g., 'environment', 'community', 'future', 'belonging', 'economy')
- `created_at` (Timestamp)
- `is_claimed` (Boolean, default: false) – Flags if a visitor has scanned/adopted the artifact

### Table: `stewardship_actions`
- `id` (UUID, primary key)
- `submission_id` (UUID, references submissions.id)
- `response_text` (Text, max 500 chars) – Anonymous action or message of solidarity logged by the finder
- `action_type` (Enum: 'conversation', 'direct_action', 'reflection')
- `created_at` (Timestamp)

---

## Key Views to Implement

### 1. `/kiosk` (Private Terminal UI)
- Fullscreen, minimalist, distraction-free aesthetic with warm, subdued tones (e.g., stone, charcoal, warm cream; no harsh clinical whites).
- Multi-step flow:
  1. Ambient welcome screen: *"Take a breath. You are not carrying this alone."* Tap/type to begin.
  2. Input 1: *"What is a quiet weight or worry you carry about our world?"* (Textarea, character countdown, gentle placeholder).
  3. Input 2: *"What is one small thing you can offer someone carrying this same weight?"* (Words of comfort, local action, listening).
  4. Review & release button: Triggers submission to DB and calls the print endpoint.
  5. Gentle thank-you message that auto-resets after 10 seconds of inactivity.

### 2. `/projection` (Live Generative Collective Wall)
- Fullscreen, ultra-wide friendly, black/deep charcoal background.
- Submissions float organically like quiet luminous nodes or water ripples.
- Real-time updates: When a new submission arrives, smoothly animate it entering the space, gently gravitating toward submissions with similar themes.
- Idle animation: Subtle hovering/breathing motion. No aggressive ticker tapes or jarring transitions.
- Every ~20 seconds, gently highlight one submission and its paired offering in a legible, elegant serif or clean grotesque typeface.

### 3. `/steward/[id]` (Mobile Response Page via QR)
- Clean, responsive mobile web page accessed when someone scans the physical artifact.
- Displays the original worry and offering from that specific card.
- Interaction: *"You are holding someone's burden. What is one small step, conversation, or reflection you will do in solidarity?"*
- Input form to submit an anonymous response to `stewardship_actions`.
- Live feed of previous reflections left on this card, creating an ongoing lineage of care.

### 4. `/api/print` (Local Print Driver Route)
- Receives submission ID, texts, and timestamp.
- Formats receipt layout:
  - Header: Installation title & submission timestamp.
  - Body: The visitor's worry & paired offering.
  - Dynamic QR code generated with URL pointing to `https://[domain]/steward/[id]`.
  - Footer: Instructions on whether to keep, trade, or gift this artifact.

---

## Tone & Design System Constraints
- **Aesthetic:** Thoughtful, grounded, empathetic. Avoid corporate SaaS UI tropes, gamified badges, or over-saturated gradients.
- **Typography:** Expressive serif for headlines/vulnerability (e.g., Editorial New or Fraunces vibe) paired with a clear, readable mono or sans for prompts.
- **Accessibility:** High legibility, large touch targets, keyboard-navigable.

Please scaffold the project directory, install the required packages, set up the database client and schema types, and start by implementing the `/kiosk` multi-step form and the real-time `/projection` canvas.