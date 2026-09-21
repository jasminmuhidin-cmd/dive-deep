// ---------------------------------------------------------------------------
// constants.js — every tunable value lives here.
//
// UNITS
//   • Durations are in SECONDS.
//   • Pixel sizes are authored for a 1920×1080 display and scaled automatically
//     (state.view.scale = min(width/1920, height/1080)), so they behave the same
//     on a laptop, a projector and a large touchscreen.
//   • "Sharpness" is 0 (fully submerged) → 1 (fully readable).
// ---------------------------------------------------------------------------

// --- Modes ------------------------------------------------------------------
export const INSTALLATION_MODE = false; // true: hides cursor + disables debug/dev keys
export const DEBUG_AT_START = false;    // participant mode by default; press D to toggle debug overlays


// ===========================================================================
// INSTALLATION TEST DIALS — the values to adjust first when testing in the space.
// (Everything else further down is finer tuning.) All are plain numbers: edit, save, reload.
// ===========================================================================
// Ambient current: continuous, mostly horizontal, soft and slow
export const CURRENT_DIRECTION = 0;            // degrees. 0 = straight left → right; +10 tilts it slightly downward. Clamped to ±60° (it always flows rightwards)
// (CURRENT_SPEED and CURRENT_STRENGTH are defined with the rest of the water tuning below)

// Thought button → horizontal wave that enters the water at the left edge
export const THOUGHT_ENTRY_WAVE_SPEED = 320;      // px/s (1080p): how fast the wave front travels left → right (lower = slower, more contemplative)
export const THOUGHT_ENTRY_WAVE_AMPLITUDE = 1.0;  // how strongly it swells and how bright its bands are (also scales the ripples it sends)
export const THOUGHT_ENTRY_WAVE_LENGTH = 560;     // px (1080p): distance between crests of the travelling wave (larger = broader, slower undulation)
export const THOUGHT_ENTRY_LINE_WIDTH = 1.3;      // px (1080p): thickness of the thin current lines the Thought wave is drawn with (there is no thick band any more)
export const THOUGHT_ENTRY_OPACITY = 0.42;        // overall opacity of those lines (0 = invisible; the surface ripples still travel)
export const THOUGHT_ENTRY_SPREAD = 1.0;          // how far the wave widens (vertically) as it travels. 0 = a thin line, 2 = a broad field
export const THOUGHT_ENTRY_CURRENT_INFLUENCE = 1.0; // how much the wave bends with the ambient current, AND how much it pulls the nearby current along (0 = ignores it)

// Soft rain-patter: sparse, tiny, irregular
export const RAIN_RIPPLE_FREQUENCY = 0.25;        // average tiny rain events per second (0 = none). Sparse: about one every 4 s, now and then two close together
export const RAIN_RIPPLE_SIZE = 1.0;              // size of a raindrop's incomplete ring
export const RAIN_RIPPLE_OPACITY = 0.5;           // how visible the drawn rain marks are (dots, small arcs, radial ticks). 0 = only the faint surface ripple

// Camera → water
export const CAMERA_WAKE_STRENGTH = 1.0;          // how strongly a moving person drags the water and leaves a wake (0 = camera ripples stay plain)
export const CAMERA_WAKE_LENGTH = 150;            // px (1080p): how far the wake trails behind a moving person
export const CAMERA_INTERACTION_RADIUS = 210;     // px (1080p): how far a person's body reaches into the water: the Thought wave bends around it, patterns form inside it
export const CAMERA_SENSITIVITY = 1.3;            // detection sensitivity. 1 = plain, 1.3 = default (notices people whose clothes are close to the background), 1.6+ = dim rooms, 0.7 = calmer

// Camera → currents: movement starts thin, soft currents that run out across the screen, join the left → right flow, and fade
export const CAMERA_CURRENT_STRENGTH = 1.0;       // how strongly a movement-born current pulls the water AND how visible its lines are (0 = no camera currents)
export const CAMERA_CURRENT_LINE_WIDTH = 1.1;     // px (1080p): thickness of a current's lines
export const CAMERA_CURRENT_OPACITY = 0.26;       // peak opacity of one current's main line
export const CAMERA_CURRENT_LIFE = 13;            // s a current takes to fade away
export const CAMERA_CURRENT_SPEED = 260;          // px/s: how fast a current extends outward from where the movement was
export const CAMERA_CURRENT_MAX = 8;              // most currents alive at once, however much movement there is (richer, never chaotic)

// Ripple look
export const RIPPLE_EDGE_SOFTNESS = 0.35;         // 0 = crisp, fine rings … 1 = soft, broad rings. How wide each ripple's crest packet is (this is the ripple "blur")
export const RIPPLE_FRONT_STRENGTH = 0.55;        // brightness of the thin lit line riding big ripples' crests (0 = none; was a thick glowing ring)

// Camera monitor (a small technical preview in the top-right corner, for setup and testing)
//   'hidden'  nothing drawn — the final clean installation
//   'minimal' small feed + detection outlines + a "camera active" dot  (press C to cycle)
//   'debug'   larger feed + movement/presence masks, person count, centroids, intensity, FPS
export const CAMERA_MONITOR_MODE = 'minimal';
export const CAMERA_PANEL_OPEN_AT_START = true;   // the panel starts open; the side tab collapses it off-screen and reopens it (any monitor mode except 'hidden')
export const CAMERA_PANEL_SLIDE_TIME = 0.45;     // s for the panel to slide in / out
export const CAMERA_PANEL_TAB_LABEL = 'camera';   // text on the side tab
export const CAMERA_MONITOR_WIDTH = 220;          // px (CSS pixels, not scaled): the monitor is a tool, its size does not follow the artwork

// --- Dataset ----------------------------------------------------------------
// CSV sources, loaded in order. To add real participant submissions later, append
// a file with the same columns; optional sources may be missing without error.
export const DATASET_SOURCES = [
  { url: './assets/data/quiet_weight_seed_thoughts.csv', required: true },
];
export const INITIAL_ACTIVE_THOUGHTS = 10;   // thoughts already beneath the water at start (words average ~400×125 px, so ~16 is what fits with light overlap)
export const MAX_ACTIVE_THOUGHTS = 12;       // the Thought button retires the oldest quiet one beyond this
export const RETIRE_FADE_TIME = 4;           // s for a retired thought's faint shape to dissolve
export const RECENT_THOUGHT_MEMORY = 12;     // don't re-introduce anything picked in the last N presses

// --- Placement --------------------------------------------------------------
export const LEFT_CONTROL_RESERVE = 150;     // px kept clear on the left for the Thought control
export const PLACEMENT_SPACING = 1.7;        // × each thought's footprint kept clear around it: words never sit close together
export const PLACEMENT_ATTEMPTS = 60;        // best-candidate samples per thought (more = more even)
export const PLACEMENT_EDGE_MARGIN = 36;     // px from the other screen edges

// --- Thought reveal & attention --------------------------------------------
export const MIN_REVEAL_TIME = 8;        // max readable time is random in [MIN, MAX]…
export const MAX_REVEAL_TIME = 12;       // …counted from the moment the thought is fully readable
export const REVEAL_SPEED = 3.0;         // sharpness gained per second: the words appear almost at once (≈0.35 s)
export const THOUGHT_BLUR_DELAY = 2.0;   // grace period after attention leaves, before blurring starts
export const THOUGHT_BLUR_SPEED = 1.1;   // sharpness lost per second (≈0.9 s to disappear once its 8–12 s are up)
export const BLUR_DELAY = THOUGHT_BLUR_DELAY;
export const BLUR_SPEED = THOUGHT_BLUR_SPEED;
export const REVEAL_COOLDOWN = 5;        // after a thought times out, it can't be re-raised for this long
export const READABLE_THRESHOLD = 0.85;  // sharpness at which a thought counts as "readable"
export const EXPIRY_WARNING = 1.0;       // s before the maximum: the water begins to return (shown only as shimmer, never as a number)
export const BREATH_PERIOD = 4.2;        // s: a visible thought's ripple gently expands and settles, and sends a soft pulse
export const BREATH_AMPLITUDE = 0.03;    // how far the ring breathes (fraction of its radius)

// --- Touch targeting --------------------------------------------------------
export const THOUGHT_TOUCH_RADIUS = 150;       // px: a touch starts revealing thoughts this close
export const THOUGHT_RELEASE_RADIUS = 225;     // px: a visible thought stays attended until the finger is this far away (larger than the touch radius: stops flicker)
export const THOUGHT_HOLD_RADIUS_MULT = THOUGHT_RELEASE_RADIUS / THOUGHT_TOUCH_RADIUS;
export const MAX_THOUGHTS_PER_TOUCH = 1;       // a single touch reveals at most this many (nearest first)

// --- Collective touch -------------------------------------------------------
export const COLLECTIVE_TOUCH_THRESHOLD = 2;         // simultaneous touch points needed
export const COLLECTIVE_WARM_TIME = 4;               // s to fully warm the water
export const COLLECTIVE_COOL_TIME = 7;               // s to fully return to cool
export const COLLECTIVE_RADIUS_MULT = 1.4;           // wider touch radius while collective
export const COLLECTIVE_MAX_THOUGHTS_PER_TOUCH = 3;  // wider set of thoughts per touch
export const COLLECTIVE_POINTER_RIPPLE_INTERVAL = 1.8; // each touch point emits soft ripples (non-colour cue)
export const COLLECTIVE_POINTER_RIPPLE_STRENGTH = 0.34;
export const COLLECTIVE_WATER_ACTIVITY = 0.4;        // extra ambient wave motion at full collective (0.4 = +40 %)

// --- Feeling connections (only while collective touch is active / fading) ---
export const CONNECTION_MIN_SHARPNESS = 0.45;   // a thought must be at least this emerged to be linked
export const MAX_CONNECTIONS = 5;               // hard cap: keeps it atmospheric, not a network diagram
export const MAX_CONNECTIONS_PER_THOUGHT = 2;
export const CONNECTION_GROUP_WEIGHT = 1.0;     // same connection_group (strongest)
export const CONNECTION_SAME_WEIGHT = 0.8;      // same feeling_tag
export const CONNECTION_RELATED_WEIGHT = 0.55;  // manually related tag (dimmer)
export const CONNECTION_FADE_IN = 1.6;          // s
export const CONNECTION_FADE_OUT = 3.0;         // s
export const CONNECTION_LINE_ALPHA = 0.2;
export const CONNECTION_WOBBLE = 7;             // px: how much the current undulates sideways
export const CONNECTION_PULSE_PERIOD = 14;      // s for the two pulses to travel to the middle
export const CONNECTION_RING_GLOW = 0.7;        // how much a linked thought's ripple brightens
export const CONNECTION_MEET_RIPPLE = 0.2;      // tiny ripple where the two pulses meet

// --- New thought entering (the Thought button) ------------------------------
export const THOUGHT_BUTTON_LABEL = 'Thought';
export const THOUGHT_BUTTON_COOLDOWN = 2.2;   // s before another press is accepted (protects the calm)
// The Thought entry runs as one internal progress 0 → 1 over THOUGHT_ENTRY_DURATION (never displayed):
//   0.00–0.15 a small disturbance at the button · 0.15–0.45 a wave travels right · 0.45–0.70 it spreads into a larger ripple
//   0.60–0.85 the thought emerges · 0.85–1.00 it settles and the residual current fades
export const THOUGHT_ENTRY_DURATION = 10;     // s, nominal total (the wave's travel time flexes a little with distance)
export const THOUGHT_ENTRY_SPEED = THOUGHT_ENTRY_WAVE_SPEED;         // (older names for the test dials at the top of this file)
export const THOUGHT_ENTRY_AMPLITUDE = THOUGHT_ENTRY_WAVE_AMPLITUDE;
export const ENTRY_MAX_TRAVEL = 6.5;          // s: the longest the wave takes to reach where the thought will emerge
export const ENTRY_MIN_TRAVEL = 2.6;          // s: the shortest
export const THOUGHT_ENTRY_RIPPLE_RADIUS = 1100; // px (1080p): how far the ripple opened where the thought emerges reaches
export const ENTRY_LEAD_TIME = 1.3;            // s: the disturbance at the button before the wave sets off
export const ENTRY_DISTURB_TIME = 0.15 * THOUGHT_ENTRY_DURATION;   // s from the wave's arrival (ripple opens) until the words begin to emerge
export const ENTRY_EMERGE_TIME = 0.25 * THOUGHT_ENTRY_DURATION;    // s: the words surface from the centre of the ripple
export const ENTRY_HOLD_TIME = 0.03 * THOUGHT_ENTRY_DURATION;      // s: it lingers, partly resolved
export const ENTRY_SETTLE_TIME = 0.15 * THOUGHT_ENTRY_DURATION;    // s: the water passes back over it
export const ENTRY_PEAK_SHARPNESS = 0.32;     // how clear it gets on its own: a soft shape, not readable — reading still needs touch
export const ENTRY_RING_DELAYS = [0, 1.5, 3.0];      // s: three concentric rings follow one another outward
export const ENTRY_RING_STRENGTHS = [1, 0.62, 0.38];

// --- WATER: visual tuning (the values to adjust first during installation testing) ------------------
// Soft, washed, horizontal: a few broad blurred bands of pale blue / cream drift LEFT → RIGHT over ocean blue.
// One shared flow (visuals/flow.js) carries the bands, the ripples, the words' slight drift and the warmth.
const _dirRad = (Math.max(-60, Math.min(60, CURRENT_DIRECTION)) * Math.PI) / 180;
export const FLOW_DIRECTION_X = Math.cos(_dirRad);   // derived from CURRENT_DIRECTION: the dominant direction of everything. Always left → right
export const FLOW_DIRECTION_Y = Math.sin(_dirRad);
export const CURRENT_SPEED = 2.2;          // overall pace of the currents. 0.5 = half as fast, 0 = still water
export const CURRENT_STRENGTH = 1.0;       // how pronounced the bands are (brightness of the pale bands and the sideways pull). 0 = flat colour
export const CURRENT_AMPLITUDE = 55;       // px (1080p): how far each band's centre-line undulates up and down
export const CURRENT_WAVELENGTH = 1100;    // px (1080p): length of one undulation along the flow (bigger = broader, calmer)
export const CURRENT_LAYER_COUNT = 4;      // number of broad bands, 3–5
export const CURRENT_BLUR = 1.0;           // softness of the bands' edges. 1 = very soft; <1 = more defined
export const CURRENT_SCALE = 1.0;          // size of the fine current texture (secondary)
export const WAVE_AMPLITUDE = 1.3;         // height of the faint always-on surface texture (light on the surface). 0 = perfectly smooth water
export const WAVE_FREQUENCY = 1.0;         // spacing of that faint texture
export const RIPPLE_CURRENT_INFLUENCE = 1.0; // how much the current carries and stretches every ripple sideways. 0 = perfect rings
export const THOUGHT_RIPPLE_STRENGTH = 1.9;  // the new-thought ripple's strength…
export const THOUGHT_RIPPLE_DURATION = 14;   // …and how long its main body lasts, s
export const TOUCH_RIPPLE_STRENGTH = 1.1;    // a touch's local ripple
export const TOUCH_RIPPLE_RADIUS = 300;      // px (1080p): how far a touch ripple spreads
export const TOUCH_RIPPLE_DURATION = 4.5;    // s
export const CAMERA_RIPPLE_STRENGTH = 0.72;  // camera ripples and wakes (× their base strength). Always weaker than a touch
export const CAMERA_RIPPLE_COOLDOWN = 0.5;   // s between camera ripples for one person (0.5–0.9 keeps sensor noise from flooding the water)
export const COLLECTIVE_FLOW_STRENGTH = 1.0; // how strongly several touches make the currents converge, align and pull along connections
export const TEXT_DRIFT_AMOUNT = 0;      // px: how far submerged words wander with the water (readable words keep ~⅓ of it)
export const WARMTH_SPREAD_SPEED = 1.0;    // how quickly the pale warm cream spreads out from the touches and is carried by the currents
export const CURRENT_MOTE_COUNT = 0;       // faint suspended specks (0 = none — the aesthetic is minimal)
export const WATER_SEED = 7;               // fixes the look of the water between runs (0 = different every launch)

// --- Ripples ----------------------------------------------------------------
// One ripple system, several types. All are the same kind of ring, distinguished by
// scale (speed × life), strength and duration, so they read as a family:
//   movement   presence in front of the camera — small, quick, subtle
//   thought    a new thought entering — wide, strong, long-lasting, clearly visible
//   collective a contribution reaching the whole collective — the largest and slowest
// speed = px/s and wavelength = px between crests (both for 1080p, auto-scaled);
// life = s; decay = how quickly the ring fades (lower = carries further);
// affects = how much the ring stirs thoughts it passes through (0 = never — camera ripples never do);
// front = brightness of a faint drawn ring that rides the wave crest (0 = none).
export const RIPPLE_SPEED = 95;          // base (ambient) speed
export const RIPPLE_LIFETIME = 9;        // base (ambient) life
export const RIPPLE_WAVELENGTH = 52;     // base (ambient) wavelength
export const MAX_AMBIENT_RIPPLES = 4;    // cap on simultaneous ambient ripples
export const MAX_MOVEMENT_RIPPLES = 7;   // cap on simultaneous camera ripples
export const MAX_WAKE_RIPPLES = 10;      // cap on the small trailing crescents behind a moving person
export const MAX_RAIN_RIPPLES = 5;      // cap on simultaneous rain-like ripples
export const MAX_TOTAL_RIPPLES = 44;     // hard cap on everything (protects calm + performance)
// Extra per-type fields (all about how the WATER treats the ripple, see visuals/ripple.js):
//   carry     how strongly the local current carries / shears the ripple as it ages (× RIPPLE_CURRENT_INFLUENCE)
//   stretch   how much the ring is drawn out along the current (1 = round)
//   irregular how far the ring departs from a perfect circle (fraction of its radius)
//   tail      extra life, as a fraction of `life`, during which a faint remnant lingers and is carried away
//   remnant   (major ripples) strength of the soft swells left behind at the origin as the ripple fades, as a fraction of its own
export const RIPPLE_TYPES = {
  rain:       { strength: 0.26, speed: 24,           life: 2.8,             wavelength: 15,               decay: 1.5, affects: 0,   front: 0,    priority: 0, carry: 1.0,  stretch: 1.3,  irregular: 0.12,  tail: 0.2 },
  entrywave:  { strength: 1.3,  speed: 380,          life: 7,               wavelength: 74,               decay: 0.55, affects: 0.5, front: 0, priority: 4, carry: 0.6, stretch: 1.12, irregular: 0.05, tail: 0.5 },
  remnant:    { strength: 0.6,  speed: 14,           life: 11,              wavelength: 150,              decay: 0.9, affects: 0,   front: 0,    priority: 3, carry: 1.4,  stretch: 2.0,  irregular: 0.09,  tail: 0.8 },
  ambient:    { strength: 0.45, speed: RIPPLE_SPEED, life: RIPPLE_LIFETIME, wavelength: RIPPLE_WAVELENGTH, decay: 1.6, affects: 0,   front: 0,    priority: 0, carry: 1.2,  stretch: 2.2,  irregular: 0.10,  tail: 0.35 },
  touch:      { strength: TOUCH_RIPPLE_STRENGTH, speed: 95, life: 4.5, wavelength: 52,                      decay: 1.6, affects: 0,   front: 0.5,    priority: 1, carry: 0.6, stretch: 1.25,  irregular: 0.035, tail: 0.30 },
  movement:   { strength: 0.9 * CAMERA_RIPPLE_STRENGTH, speed: 115,          life: 4.5,             wavelength: 46,               decay: 1.25, affects: 0,   front: 0.3,  priority: 1, carry: 1.0,  stretch: 1.45, irregular: 0.07,  tail: 0.35 },
  surface:    { strength: 0.5,  speed: 70,           life: 3.4,             wavelength: 34,               decay: 1.3, affects: 0,   front: 0.3,  priority: 2, carry: 0.9,  stretch: 1.5,  irregular: 0.06,  tail: 0.3 },
  wake:       { strength: 0.62 * CAMERA_RIPPLE_STRENGTH, speed: 80,           life: 4,             wavelength: 40,               decay: 1.2, affects: 0,   front: 0,    priority: 1, carry: 1.0,  stretch: 1.6,  irregular: 0.08,  tail: 0.25 },
  reveal:     { strength: 1.0,  speed: 62,           life: 8,               wavelength: 52,               decay: 1.6, affects: 0,   front: 0,    priority: 2, carry: 0.35, stretch: 1.0,  irregular: 0.03,  tail: 0.25 },
  thought:    { strength: THOUGHT_RIPPLE_STRENGTH, speed: 165, life: THOUGHT_RIPPLE_DURATION, wavelength: 80, decay: 1.0, affects: 1,   front: 1.0, priority: 4, carry: 0.8,  stretch: 1.0,  irregular: 0.028, tail: 0.6, remnant: 0.26 },
  collective: { strength: 2.6,  speed: 170,          life: 20,              wavelength: 110,              decay: 0.85, affects: 0.7, front: 0.9, priority: 5, carry: 1.0,  stretch: 1.0,  irregular: 0.022, tail: 0.5, remnant: 0.22 },
};
export const AMBIENT_RIPPLE_INTERVAL = [3.5, 6.5];  // s between ambient swells when nobody is around (drifting arcs, not round drops)
export const REVEAL_RIPPLE_STRENGTH = 0.95;      // the small ripple beneath a thought that is being attended to
export const THOUGHT_PULSE_STRENGTH = 0.32;      // the quiet breath-synced pulse while it stays clear
export const ARTEFACT_RIPPLE_ORIGIN = [0.5, 0.55]; // where the facilitator's "artefact added" ripple starts (fraction of screen)

// --- Water rendering --------------------------------------------------------
export const WATER_RESOLUTION_DIVISOR = 3; // water is simulated at 1/6 resolution and smoothed up
export const WATER_UPDATE_HZ = 30;        // ripples + lighting
export const WATER_FLOW_HZ = 15;          // the slow currents, warmth and tone are refreshed less often (they move ~10 px/s)
export const WATER_FLOW_CELL = 4;         // the flow/warmth grid cell, in water pixels (3 → one cell per 18 px at the default 1/6 resolution)
export const WATER_LINE_STRENGTH = 0.22;    // the fine flowing line texture on the surface (0 = none)
export const WATER_LINE_SPACING = 44;      // px (1080p) between the flowing lines
export const WATER_GLOSS = 0.7;            // how sharply slopes turn into white glints / deep blue troughs (0 = soft, matte)
export const WATER_LIGHT_STRENGTH = 0.55;  // how strongly surface slope becomes light/shadow
export const VIGNETTE_STRENGTH = 0.5;

// Background: 'gradient' = a flat, smooth colour field whose gradient slowly changes (no blurry current bands, no streaky texture; ripples,
// wakes and the Thought wave still move across it). 'waves' = the previous blurred current bands.
export const BACKGROUND_STYLE = 'gradient';
export const BACKGROUND_GRADIENT_PERIOD = 70;    // s for the gradient to drift through all its colours and back (bigger = calmer)
export const BACKGROUND_GRADIENT_TURN = 0.05;    // rad/s: how fast the gradient's direction slowly turns (0 = always top → bottom)
// Each key is a [from, to] pair of [r, g, b]; the background glides through them in order, looping.
export const BACKGROUND_GRADIENT_KEYS = [
  [[24, 104, 214], [6, 52, 156]],      // ocean blue
  [[34, 138, 214], [10, 74, 160]],     // clear cyan-blue
  [[70, 110, 220], [22, 46, 146]],     // periwinkle
  [[44, 92, 206], [8, 40, 128]],       // deep cobalt
];

// Colours are [r, g, b], sampled from the soft blue / cream references: ocean blue water, pale blue and cream bands,
// off-white highlights, and only a whisper of pale yellow. No saturated accents.
// `light` is the sheen colour that catches ripple crests.
export const COOL_WATER_PALETTE = { top: [22, 100, 210], bottom: [6, 56, 158], light: [232, 244, 255] };
export const WARM_WATER_PALETTE = { top: [40, 112, 206], bottom: [16, 68, 164], light: [250, 246, 230] };
export const WATER_PIGMENTS = { paleBlue: [70, 150, 230], cream: [206, 228, 250], offWhite: [242, 249, 255], paleYellow: [236, 244, 250] };
export const WARM_PIGMENTS = { cream: [246, 244, 232], paleYellow: [250, 244, 214] };   // collective touch: the same currents carry warm cream (never orange)

// --- Thought appearance -----------------------------------------------------
export const THOUGHT_FONT_FAMILY = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif';
export const THOUGHT_FONT_SIZE = 27;          // px
export const THOUGHT_LINE_HEIGHT = 1.4;
export const THOUGHT_MAX_TEXT_WIDTH = 400;    // px before wrapping
export const THOUGHT_TEXT_COLOR = 'rgb(244, 249, 252)';
export const BLUR_LEVELS = [0, 1.5, 4, 8, 14]; // px; pre-rendered once, cross-faded per frame
export const SUBMERGED_ALPHA = 0.22;           // how faintly a submerged thought shows
export const THOUGHT_RIPPLE_MARGIN = 12;       // px between text and its circular ripple

// --- Camera (presence & movement → water only; never reveals thoughts) -------
export const CAMERA_ENABLED = true;
export const CAMERA_MIRROR = true;             // true when the camera faces the visitors: their right = screen right
export const CAMERA_ANALYSIS_WIDTH = 160;       // px; frames are analysed at this tiny size (height follows aspect)
export const CAMERA_ANALYSIS_HZ = 15;
export const CAMERA_RETRY_SECONDS = 10;        // try again if the camera drops out (not after a permission denial)
export const MOTION_HISTORY_DECAY = 0.8;       // per analysis frame: how long a moving outline is remembered (0.8 at 15 Hz ≈ 0.4 s) — fills outlines into silhouettes
export const MOTION_THRESHOLD = 12;            // 0–255 brightness change counted as movement (noise-adaptive floor)
export const PRESENCE_THRESHOLD = 28;          // brightness difference from the learned background counted as "someone is here"
export const MOTION_NOISE_FACTOR = 3.0;        // threshold never drops below this × measured sensor noise
export const GLOBAL_CHANGE_FRACTION = 0.45;    // if this much of the frame changes at once it's lighting/exposure — ignored
export const MIN_BLOB_AREA = 0.004;            // smallest region (fraction of frame) that can be a person / movement
export const BLOB_MERGE_DISTANCE = 0.13;       // regions closer than this (fraction of width) are one person
export const TRACK_ASSOC_DISTANCE = 0.2;       // how far a person may move between frames and stay the same person
export const TRACK_HOLD_SECONDS = 1.6;         // a person who stops being detected lingers this long before being forgotten
export const MIN_TRACK_AGE = 0.25;              // s a region must persist before it counts as a person
export const MAX_PEOPLE = 8;
export const BACKGROUND_LEARN_RATE = 0.002;    // how fast a motionless person is absorbed into the background
export const MOVEMENT_MIN_ENERGY = 0.09;       // how much motion inside a region counts as "moving" (0–1)
export const MOVEMENT_RIPPLE_COOLDOWN = 0.9;   // s between ripples for one person…
export const MOVEMENT_CROWD_SLOWDOWN = 0.25;   // …each extra person stretches everyone's gap by this fraction (more people ≠ more chaos)
export const MOVEMENT_AREA_COOLDOWN = 0.7;     // s before the same patch of water (≈1/6 screen) can ripple again
export const MOVEMENT_MAX_RATE = 1.6;          // hard ceiling on camera ripples per second, however many people
export const PRESENCE_RIPPLE_INTERVAL = [7, 12]; // s: a person standing still sends an occasional very gentle ripple
export const PRESENCE_RIPPLE_STRENGTH = 0.6;   // × movement strength

// --- Participant-facing hint (very quiet, only when nobody has touched for a while)
export const IDLE_HINT_TEXT = 'touch the water';
export const IDLE_HINT_DELAY = 30;             // s of no touching before it appears

// --- Taking a thought: drag → print zone → print ------------------------------
export const TAKE_HELPER_TEXT = 'take this thought with you';
export const TAKE_HELPER_DELAY = 0.6;           // s after becoming readable before the helper appears
export const DRAG_START_DISTANCE = 14;          // px of movement before a touch becomes a drag
export const MIN_PRINT_DRAG_DISTANCE = 80;      // px a thought must be carried before a drop can print
export const DRAG_LIFT = 80;                    // px a touch-carried thought floats above the fingertip (not for mouse)
export const DRAG_FOLLOW_TIME = 0.07;           // s lag: the thought is pulled through the water, not snapped
export const RETURN_HOME_TIME = 1.0;            // s time-constant for drifting back to its place
export const PRINT_ZONE_START_RATIO = 0.82;     // a carried thought that reaches this fraction of the screen height ARMS printing: the zone fades in
export const PRINT_TRIGGER_RATIO = 0.90;        // …and printing happens only if it is released at or below this line, while armed
export const PRINT_MAGNET_STRENGTH = 0.35;      // 0–1: how firmly the zone draws a thought that is approaching the trigger line (0 = none)
export const PRINT_ICON_ALWAYS_VISIBLE = true;   // the printer icon rests at the bottom centre at all times (the water band still only appears when a thought is carried near)
export const PRINT_ICON_IDLE_OPACITY = 0.5;       // its resting opacity
export const PRINT_ZONE_HEIGHT = 1 - PRINT_ZONE_START_RATIO;   // fraction of screen height the zone covers (derived)
export const PRINT_SETTLE_TIME = 1.6;           // s: after the print fires the thought settles downward and fades into the lower edge
export const PRINT_LOCKOUT = 2.5;               // s: no second print can start within this window
export const PRINT_FLASH_TIME = 2.2;            // s the quiet "printed" feedback lingers

// --- Printer (separate module; the visuals never wait on it) ------------------
export const PRINTER_MODE = 'electron';         // 'mock' | 'electron' — falls back to mock if IPC missing
export const PRINT_LINE_WIDTH = 32;             // characters per line: 58 mm roll ≈ 32, 80 mm ≈ 48
export const MOCK_PRINT_DELAY = 0.9;            // s of pretend paper feed
