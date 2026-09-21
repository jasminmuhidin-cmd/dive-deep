# Thought Water — installation prototype

A collective body of anonymous thoughts beneath calm water.

```
CAMERA PRESENCE      → subtle ripples                 (never reveals a thought)
MORE PEOPLE          → more calm, overlapping ripples
THOUGHT BUTTON       → a new dataset thought enters   (clearly visible expanding ripple, words emerge)
INDIVIDUAL TOUCH     → reveals an existing thought
ATTENTION REMAINS    → it stays clear
ATTENTION MOVES AWAY → the water blurs it and it submerges
MULTIPLE TOUCHES     → warmer water, shared-group / shared-feeling connections
DRAG DOWN            → print zone
PRINT                → take the thought into the physical world
```

These behaviours are deliberately kept separate in the code. Nothing merges them.

## Run

```bash
npm install
npm start            # Electron window
npm run kiosk        # fullscreen kiosk (also: INSTALLATION=1 npm start)
npm test             # all logic tests (no window, no camera needed)
```

No Electron? `npm run serve`, then open http://localhost:5173 in Chrome/Edge (plain browsers can't load ES modules from
`file://`; Safari lacks the canvas blur filter used for submerged text). Browsers ask for camera permission themselves.

## The dataset

`assets/data/quiet_weight_seed_thoughts.csv` — 100 seed responses to *"What is a quiet weight or worry you carry about our world?"*

| CSV column | becomes |
| --- | --- |
| `thought_id` | `id` |
| `response` | `text` |
| `theme` | `theme` |
| `feeling_tag` | `feelingTag` |
| `connection_group` | `connectionGroup` |

Each thought also has `x`, `y` (normalised 0–1, set when it enters the water), `state` and `printed`.

* **One dataset only:** `assets/data/quiet_weight_seed_thoughts.csv` (100 thoughts) is the sole seed source. To use another file, replace that CSV (same columns); nothing is merged.
  (already listed as an optional source in `DATASET_SOURCES`, `src/config/constants.js`). Header names are case-insensitive,
  duplicate ids are skipped with a console warning. No visualisation code changes.
* **Only some thoughts are in the water at once.** The words average ~400×125 px, so ~16 fit with light overlap
  (`INITIAL_ACTIVE_THOUGHTS`, max `MAX_ACTIVE_THOUGHTS = 22`). The rest wait; the **Thought** button introduces them, retiring the
  oldest quiet one when the water is full. Every thought is used before any repeats.
* If the CSV cannot be loaded the app logs an error and runs with a small built-in set (`src/data/fallbackThoughts.js`).

## Try it

| Do this | Expect |
| --- | --- |
| Nothing | Cool water, faint unreadable smudges scattered at random, soft ripples, and now and then a tiny rain-drop mark (dot · small incomplete ring · short ticks). After 30 s untouched, a very quiet *touch the water*. |
| Press **Thought** (left edge) | The control itself is where it enters: half-rings and a soft streak leave its edge, then a horizontal, sine-like wave (several uneven, blurred bands) travels **left → right** across the water, widening, bending with the current and pulling it along. Where it gathers structure it turns into thin repeated lines and dots, then a larger field of nested arcs — and only then does the thought surface there. A few residual waves drift on and everything softens back into the water. |
| Touch a smudge | A small ripple opens under it; the water clears down the words. |
| Keep touching | It stays clear; its ring gently breathes with a soft pulse each breath. Near the maximum (8–12 s, internal) the words start to shimmer and the water returns. **No numbers or timers are ever shown.** |
| Let go | A short grace period (the words begin to shimmer), then the water passes back over them and it sinks. Touch again mid-blur and it clears. |
| Two touches at once | Water warms; a wider set of thoughts emerges; thoughts sharing a `connection_group`, a `feeling_tag`, or a related feeling are joined by soft braided strands (group > feeling > related; ≤5 links, never a closed loop). |
| Readable thought | *take this thought with you* + a small printer icon. |
| Drag it down | The print zone rises gently; let go inside it: one `printThought()` call, then it sinks. |
| Move in front of the camera | The water knows where you are (left in the frame = left in the water): a few fine bands part around you and a small ripple opens. Keep moving and a stretched, directional wake trails behind you. Two people close together make an interference pattern where their regions overlap. If the Thought wave passes you it bends, thins and re-forms around you and leaves small wakes beside you — it is never blocked. Never reveals text. |

**Mouse testing of multi-touch:** Shift+click drops a "virtual finger" that stays down; hold a normal click elsewhere for the second
touch. Shift+click it again (or Esc) to remove.

## The three ripple types

One system (`src/visuals/ripple.js`), typed like `createRipple({ x, y, type: 'movement' | 'thought' | 'collective' })`. Same kind of ring,
different scale — tune in `RIPPLE_TYPES`:

| type | means | reach | lasts | strength |
| --- | --- | --- | --- | --- |
| `movement` | someone is here / moving | ~320 px | 5.5 s | subtle |
| `thought` | a new thought entered the collective | ~1,280 px | 14 s | strong, with a faint drawn wave-crest |
| `collective` | an artefact was added to the collective | ~2,060 px (whole screen) | 20 s | strongest, slowest |

(plus small local `touch` / `reveal` / `ambient` ripples). Camera ripples have `affects: 0`: they can never stir or reveal a thought.
Thought and collective ripples make the thoughts they pass shimmer faintly, but never readable.

## Camera

Works with any webcam, Electron or browser. It is analysed at 160×120 and is **never shown to participants**; for setup there is a small technical monitor (below).

**How detection was sharpened** (`src/camera/motionDetection.js`): exposure compensation (auto-exposure / a lamp changing is subtracted before comparing), a short motion history (moving outlines fill into a solid silhouette, so one body = one steady region and box), and a `CAMERA_SENSITIVITY` dial that scales every threshold (default 1.3; try 1.6+ in a dim room, 1.0 for the plain behaviour). Each person now has a smoothed bounding box and velocity, which drive the wakes.

### Camera monitor (top-right, for setup)
`CAMERA_MONITOR_MODE = 'hidden' | 'minimal' | 'debug'` (default **minimal**); press **C** to cycle hidden → minimal → debug → hidden, or open `index.html?monitor=debug`.
* **minimal** — small desaturated live feed, outlines and centre points on each detection, a status light (green = active, amber = starting, red = denied/error) and `detected: N`.
* **debug** — larger; adds the movement (warm) and presence (cool) masks, a thirds guide, per-person id / x,y / movement / velocity arrow, movement intensity, motion %, threshold, analysis Hz and render FPS.
* **hidden** — nothing drawn, and no preview is even built. Use for the final installation.
It is labelled `CAMERA / DETECTION`, is drawn like an instrument panel (not part of the water), and never identifies anyone. `CAMERA_MONITOR_WIDTH` sets its size.

* **Permission / failure:** if permission is denied, no camera exists, or it's in use, a clear message goes to the console, the water
  carries on, and (except after a denial) it retries every 10 s. `state.camera.status` records the reason (visible in debug mode).
  On macOS, the OS asks once; if refused: System Settings → Privacy & Security → Camera.
* **Mirroring:** `CAMERA_MIRROR = true` for a camera facing the visitors (their right = screen right). Press `M` to flip while testing.
* **Noise control:** blur, noise-adaptive thresholds, minimum region size, whole-frame lighting jumps ignored, regions merged into one body,
  tracks held briefly so people don't flicker, per-person and per-area cooldowns, a global ripples-per-second ceiling
  and a cap on simultaneous camera ripples. A person standing still gets only an occasional gentler ripple.
* **Known limitation:** someone motionless for ~1 minute fades into the background model; when they then walk away, a presence-only
  "ghost" of where they stood can linger for a while. It can't create movement ripples, but the people count may be one too high.
* **No webcam?** Press `S` and move the mouse (hover, no buttons) — it stands in for a moving person.

## Participant mode vs debug mode

Participant mode (default) shows only: water, thoughts, ripples, the Thought control, *take this thought with you* + printer icon,
*let go to print*, connections, and the idle hint. **Never** camera views/boxes, coordinates, state names, FPS, counts, percentages,
timers, radii or thresholds — a test scans the drawing code to enforce this.

`D` toggles debug mode (**off** at start): detection markers, people/movement/threshold readouts, ripple counts by
type, touch points, per-thought state and time-left, FPS, printer.

## Keys (all but `A` and `C` disabled when `INSTALLATION_MODE = true`)

`A` artefact added (one big slow collective ripple; facilitator) · `T` press Thought · `D` debug · `M` mirror camera ·
`S` simulate movement with mouse · `C` cycle the camera monitor · `G` force collective mode · `R` put every thought back · `F` fullscreen · `Esc` clear virtual touches

## Thought wave, rain, and camera patterns (test dials at the top of `src/config/constants.js`)

One disturbance hierarchy, one visual language (soft blurred blue/cream water, plus thin rounded lines and dots as things become defined):
ambient current → soft rain → camera presence → camera movement → touch → Thought button → collective touch → artefact added.

| Dial | Does |
| --- | --- |
| `THOUGHT_ENTRY_WAVE_SPEED` / `_AMPLITUDE` / `_LENGTH` / `THOUGHT_ENTRY_SPREAD` / `THOUGHT_ENTRY_CURRENT_INFLUENCE` | how fast, how strong, how long-crested and how widely the Thought wave travels, and how much it bends with / pulls the current |
| `RAIN_RIPPLE_FREQUENCY` / `_SIZE` / `_OPACITY` | sparse tiny drops: a dot, a small incomplete ring or a few radial ticks (`0` frequency = none) |
| `CAMERA_WAKE_STRENGTH` / `CAMERA_WAKE_LENGTH` / `CAMERA_INTERACTION_RADIUS` | how strongly and how far a person's body affects the water and the Thought wave |
| `CAMERA_SENSITIVITY`, `CAMERA_MONITOR_MODE`, `CAMERA_MONITOR_WIDTH` | detection sharpness and the setup monitor |
| `CURRENT_SPEED` / `CURRENT_STRENGTH` / `CURRENT_DIRECTION` | the ambient current (direction in degrees, 0 = straight left → right) |

Code: `visuals/entryWave.js` (the wave, its ripple field, and how it bends around people), `visuals/presence.js` (bodies in the water: parted bands, trailing wakes, interference), `visuals/rain.js`, `ui/cameraMonitor.js`. Tests: `npm test` (includes `tests/refine.test.mjs`).

## Printing (mock)

`PRINTER_MODE = 'electron'`: print goes through `electron/main.js` (composites `receipt.png`, saves under `data/prints/`, silent system print for a paired MX06). Falls back to mock console receipt if the IPC bridge is missing.

## Visual language: calm, washed, left → right

Royal-blue water with glossy white glints and fine flowing lines (`WATER_LINE_*`, `WATER_GLOSS`), crossed by 3–5 broad translucent bands (azure, icy white) that slide
left → right along `FLOW_DIRECTION_X/Y`. No camera monitor, boxes, patterns or dots for participants; the camera preview exists only behind `D` (debug).
Layer order: background gradient → horizontal current → sparse ambient ripples → interaction ripples (touch, Thought entry) → thoughts → print feedback.

- `installationState.mode`: `ambient | thoughtEntry | revealing | dragging | printing` (with `activeThoughtId`, `activePointers`, `isDraggingThought`,
  `draggedThoughtId`, `printArmed`). Thought states: submerged · revealing · revealed · blurring · dragging · printing.
- Thought button: a small disturbance at the button's right edge, one broad soft wave travelling right, a larger ripple where the thought appears, then it settles
  into the current (`THOUGHT_ENTRY_*`).
- Print: crossing `PRINT_ZONE_START_RATIO` arms it (the zone fades in, the icon clears, a gentle magnetic pull); printing fires only when released at or below
  `PRINT_TRIGGER_RATIO`, once per drag.
- Camera → invisible input: subtle ripples/wakes with a `CAMERA_RIPPLE_COOLDOWN`, never revealing text.

Words: touch → they appear at once, stay fully readable for 8–12 s (`MIN/MAX_REVEAL_TIME`), then disappear; no drift (`TEXT_DRIFT_AMOUNT = 0`); `PLACEMENT_SPACING` keeps them well apart.
Movement: `CURRENT_SPEED`, ripple speeds in `RIPPLE_TYPES`, and camera sensitivity (`MOTION_THRESHOLD`, `MIN_BLOB_AREA`, `MOVEMENT_MIN_ENERGY`, `MOVEMENT_RIPPLE_COOLDOWN`).

Tune first: `CURRENT_SPEED`, `CURRENT_STRENGTH`, `CURRENT_AMPLITUDE`; `THOUGHT_ENTRY_AMPLITUDE`, `THOUGHT_ENTRY_SPEED`, `THOUGHT_ENTRY_RIPPLE_RADIUS`;
`TOUCH_RIPPLE_STRENGTH`, `TOUCH_RIPPLE_RADIUS`; `PRINT_ZONE_START_RATIO`, `PRINT_TRIGGER_RATIO`, `PRINT_MAGNET_STRENGTH`.

## Water visual tuning

The water is a living surface: several independent slow currents (a broad drift, a diagonal drift, a
counter-current that runs leftward in some bands, and a fine cross-flow) plus a decaying local layer around
interactions. One shared flow (`src/visuals/flow.js`, `getFlowAt(x, y)`) carries everything: ripples are
deformed and dragged sideways, words drift 1-3 px, warmth travels through the currents, and a few faint motes
show the bands. Ripple types: `ambient` < `movement` / `wake` (camera) < `touch` < `thought` < `collective`
< artefact; big rings leave `remnant` swells that keep drifting after they fade.

Everything is in `src/config/constants.js`. If the water is too active, lower first: `CURRENT_SPEED`,
`CURRENT_STRENGTH`, `WAVE_AMPLITUDE`, `RIPPLE_CURRENT_INFLUENCE`. If too subtle, raise those, then
`CAMERA_WAKE_STRENGTH`, `THOUGHT_RIPPLE_STRENGTH`, `TEXT_DRIFT_AMOUNT`, `COLLECTIVE_FLOW_STRENGTH`,
`WARMTH_SPREAD_SPEED`, `CURRENT_MOTE_COUNT`. Others: `CURRENT_SCALE`, `WAVE_FREQUENCY`, `CURRENT_LAYER_COUNT`,
`CAMERA_WAKE_LENGTH`, `TOUCH_RIPPLE_STRENGTH`, `THOUGHT_RIPPLE_DURATION`. If a laptop struggles, raise
`WATER_RESOLUTION_DIVISOR` or lower `WATER_FLOW_HZ`.

## Tuning

Everything is in `src/config/constants.js` (durations in seconds; pixel sizes are authored for 1920×1080 and auto-scale). The main ones:
`INITIAL_ACTIVE_THOUGHTS`, `ENTRY_*` (the new-thought timeline; `ENTRY_PEAK_SHARPNESS` is how clear it gets by itself),
`RIPPLE_TYPES`, `BLUR_DELAY`, `EXPIRY_WARNING`, `BREATH_PERIOD`, and the camera block (`MOTION_THRESHOLD`, `MOVEMENT_RIPPLE_COOLDOWN`,
`MOVEMENT_CROWD_SLOWDOWN`, `MOVEMENT_MAX_RATE`, …). Related feelings are a hand-written table in `src/data/feelings.js`.

## Structure

```
assets/data/      quiet_weight_seed_thoughts.csv
electron/         main process (camera permissions) + preload
src/main.js       wiring + frame loop
src/config/       constants.js
src/data/         csv.js (parser) · thoughtLoader.js (CSV → thought definitions) · feelings.js · fallbackThoughts.js
src/state/        installationState.js (shared state, thought shape) · thoughtPool.js (which thoughts are in the water)
src/layout/       placement.js (random scatter that avoids heavy overlap)
src/interactions/ pointerManager · thoughtReveal (attention) · thoughtEntry (the Thought button's animation) · collectiveTouch
                  dragToPrint · cameraRipples (people → ripples) · artefactAdded · keyboardControls
src/camera/       camera.js (getUserMedia, permissions, mirroring) · motionDetection.js (pure: presence, regions, people)
src/ui/           thoughtButton.js
src/visuals/      water · ripple · thoughtRenderer · connections · printZone · hint · icons · palette · debugOverlay
src/printer/      printer.js (formatReceipt, printThought, mock backend)
tests/            dataset · camera · logic · stage2 · stage3  (`npm test`)
```

## Refinement pass 3 (thin entry · camera currents · water ripples · collapsible panel)

- **Thought entry** (`visuals/entryWave.js`): three thin travelling lines (`THOUGHT_ENTRY_LINE_WIDTH`, `THOUGHT_ENTRY_OPACITY`) → the water answers with widening `surface` ripples along the front → a larger ripple at the target → a faint residual current. No glow or blobs.
- **Camera currents** (`visuals/presence.js`): movement spawns a thin streamline near the mover that bends into the global left-to-right flow, spans the screen and fades. No movement = none; more movers = more (capped by `CAMERA_CURRENT_MAX`). Dials: `CAMERA_CURRENT_STRENGTH / LINE_WIDTH / OPACITY / LIFE / SPEED / MAX`.
- **Ripples**: `RIPPLE_EDGE_SOFTNESS`, `RIPPLE_FRONT_STRENGTH`, `WATER_RESOLUTION_DIVISOR` (now 3); the current-carry lookup is bilinear (no blocky stipple).
- **Camera panel** (`ui/cameraTab.js`): a side tab slides the panel off-screen and back (minimal and debug). `CAMERA_PANEL_OPEN_AT_START`, `CAMERA_PANEL_SLIDE_TIME`, `CAMERA_PANEL_TAB_LABEL`.

## Kiosk bridge (deep dive Next.js)

When the Next.js kiosk is running on `http://localhost:3000`, this app polls `/api/ripples/pending` and listens to `/api/events` for `ripple` events. Each new kiosk submission is injected with the same Thought entry animation (`pool.injectExternal` → `entry.pressExternal`).

Default API base: `http://localhost:3000`. Override in DevTools: `window.__KIOSK_API__ = 'https://dive-deep.vercel.app'`.

Receipt QR codes link to `https://dive-deep.vercel.app/gallery?id=…` (once that site is deployed).

### Print

Drag a readable thought down to the printer icon (or release in the print zone) to composite onto `assets/branding/receipt.png` and print (Electron IPC / mock).

Receipt layout: 48px italic text with a white rectangle behind each line, 40px top/left inset, 80px right inset, QR bottom-left to the archive, anonymous code on the slip.

### Anko MX06 Bluetooth

Pair **MX06** in macOS Bluetooth. Electron saves a PNG under `data/prints/` and attempts a silent system print. If WalkPrint-only RFCOMM is required, use the saved PNG with WalkPrint as fallback, or extend `electron/main.js` with ESC/POS over Bluetooth SPP.
