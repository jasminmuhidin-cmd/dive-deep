/**
 * Every tunable for the projection lives here so the installation can be
 * dialled in on site without touching shader code.
 *
 * Units: "screen units" = normalised 0–1 across the projection (x left→right,
 * y top→bottom). Velocities are screen units per second. Times in seconds.
 *
 * Design intent: subtle, calming, fluid. Everything is slow-in / slow-out,
 * low-frequency and low-contrast; nothing snaps.
 */
export const FX = {
  vision: {
    /** Served from /public first (offline install); CDN used as fallback. */
    bundleLocal: "/mediapipe/vision_bundle.mjs",
    bundleCdn:
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/vision_bundle.mjs",
    wasmLocal: "/mediapipe/wasm",
    wasmCdn: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm",
    /**
     * "full" is markedly better than "lite" at installation distances (cleaner
     * silhouette, steadier wrists) and still runs ~30 fps on a laptop GPU.
     * "heavy" is the most accurate but usually too slow for live use.
     */
    /**
     * Which pose model to use: "full" (default, good balance), "heavy" (most
     * accurate silhouette + wrists, needs a decent GPU) or "lite" (fastest).
     * The file is loaded from /public/mediapipe if present (npm run
     * fetch-model), otherwise downloaded from Google on first run.
     */
    modelVariant: "full" as "lite" | "full" | "heavy",
    /** Inference width: frames are downscaled to this before tracking. */
    inferWidth: 960,
    /** Lower = picks people up sooner and holds them through hard poses. */
    detectConfidence: 0.3,
    presenceConfidence: 0.3,
    trackingConfidence: 0.3,
    /** Camera resolution requested (higher = better detection at distance). */
    cameraWidth: 1280,
    cameraHeight: 720,
    numPoses: 4,
    /**
     * Body shape from the pose skeleton. "fallback" = only when the
     * silhouette mask is missing/blank (some GPUs return a blank mask);
     * "always" = also add it on top of the silhouette (bolder figure).
     */
    skeletonBody: "fallback" as "fallback" | "always",
    /** Landmark visibility needed to draw a limb from the skeleton. */
    skeletonMinVis: 0.25,
    /**
     * Arms from the pose skeleton merged into the silhouette (0 = off,
     * 1 = full strength). Segmentation often drops thin or fast-moving arms;
     * the landmarks rarely do, so the body outline keeps its arms.
     */
    armFill: 0.9,
    /**
     * Silhouette clean-up, run on every result: blur by blurPx, then
     * re-threshold (smoothstep lo → hi) into a solid shape — fills small holes
     * and smooths ragged edges. holdTau (s) lets a pixel fade instead of
     * vanishing, so one bad frame doesn't flicker the body.
     * Arms disappearing? lower lo/hi. Background creeping in? raise them.
     */
    maskClean: { blurPx: 2, lo: 0.3, hi: 0.6, holdTau: 0.12 },
    /**
     * Dot zone: dots fill the body and a soft band just outside the outline.
     * radiusPx = band width in mask pixels (240 across the camera image);
     * strength = how full the band is at the outline (0 = no band).
     */
    halo: { radiusPx: 8, strength: 0.85 },
    /**
     * If inference averages more than slowMs per frame (after warmupFrames),
     * step down to a lighter model: heavy → full → lite. Keeps it smooth on
     * modest GPUs such as a Surface Hub. A ?model= URL parameter disables it.
     */
    autoDowngrade: { enabled: true, slowMs: 50, warmupFrames: 60 },
    /** Inference cap — 30 is plenty; rendering still runs at display rate. */
    maxFps: 30,
    /** Mirror like a looking-glass (camera faces the audience). */
    mirror: true,
    /**
     * Camera → projection calibration, applied in camera-uv space after the
     * cover-fit. Nudge on site until the figure sits on the person.
     */
    calib: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
  },

  /**
   * Background: a two-colour contrast gradient (top ↔ bottom) whose two
   * colours sit at opposite points of a dark → medium → light loop, so one
   * end is always deeper than the other. Both drift slowly through the loop
   * over `cycleSeconds` (5 minutes), swapping places halfway.
   */
  background: {
    /**
     * Light aqua loop: the deeper blue from before → #60B3CC → #ABDEED.
     * Note: white text on these is only ~1.4–3.1 : 1, so the thoughts are
     * bold white with a thin dark letter outline (see TapThoughts). Deep
     * navy #0A2540 text would pass WCAG AA (4.7–10.7 : 1) if ever needed.
     * Earlier palettes:
     *   #348CBA / #60BAD2 / #96DEE6   (Saskia site aquas)
     *   #5692C7 / #79A7CD / #7FACD2   (light blues)
     *   #3873A8 / #4C8ABD / #528FC2   (before that)
     */
    dark: [0.337, 0.573, 0.78] as [number, number, number], //    #5692C7
    medium: [0.376, 0.702, 0.8] as [number, number, number], //   #60B3CC
    light: [0.671, 0.871, 0.929] as [number, number, number], //  #ABDEED
    cycleSeconds: 300,
    /**
     * Accessibility: most of the water uses these deeper versions of the three
     * stops (same hues), where white text reaches about 5 : 1 — WCAG AA for
     * the 12pt thought text (normal text, 4.5 : 1), with a margin for wave
     * light, sheen and colour clouds. The light stops above only show in
     * lightPatches.
     */
    accessible: {
      dark: [0.218, 0.451, 0.658] as [number, number, number], //   #3873A8 (5.0 : 1)
      medium: [0.179, 0.47, 0.558] as [number, number, number], //  #2E788E (5.0 : 1)
      light: [0.123, 0.472, 0.575] as [number, number, number], //  #1F7893 (5.0 : 1)
    },
    /**
     * Broad, soft gradients where the original light blues show through,
     * drifting slowly like light moving through water (no edges). Near a
     * thought they slowly fade (tapThoughts.deepenInSec), so the words sit
     * over deep water.
     *   lo / hi  — where the light starts / reaches full: raise lo for less light
     *   scale    — gradient size (lower = broader)
     *   speed    — drift speed
     *   strength — how light it gets at its brightest (0–1)
     */
    lightPatches: { lo: 0.7, hi: 1.0, scale: 1.0, speed: 0.06, strength: 0.7 },
    /**
     * Where in the loop it starts (0–1). 0.5 = light aqua at the top fading to
     * the deeper blue at the bottom, like the Saskia site's surface.
     */
    startPhase: 0.5,
    /** Hue drift over the loop (degrees). Was 10 — lowered so it never leans violet. */
    hueSwing: 6,
    /** Very slow drift of the faint broad swell. */
    drift: 0.02,
    /**
     * Mandy Lai-style dreamy layer, in blues. Soft colour clouds are hue-shifted
     * versions of the current palette colour (violet / teal / orchid) at the SAME
     * lightness, so they follow the 5-minute colour loop and never hurt contrast.
     */
    clouds: {
      /** How strongly the clouds tint the gradient (0 = off). */
      strength: 0.55,
      /**
       * Hue shifts in degrees for the three cloud colours — all blues now
       * (soft blue / teal / deeper blue). Was [22, -18, 40] (violet / teal /
       * orchid), which read as purple over the deeper blue.
       */
      hues: [8, -14, 14] as [number, number, number],
      /** Extra saturation for the clouds (0–1). */
      saturate: 0.06,
    },
    /** Faint glowing rings drifting slowly upward (0 = off). */
    orbs: 0.03,
    /** Tiny twinkling stars (peak opacity; 0 = off). */
    sparkles: 0.22,
    /**
     * Cap on how much any light effect (orbs, idle wave light) may brighten the
     * water, so white text stays ≥ 3 : 1 on the lightest blue.
     */
    maxLift: 0.025,
  },

  body: {
    /** Dot grid across the projection width; rows follow the aspect ratio. */
    cols: 100,
    /** Mask value treated as "inside the body" (pose masks are soft 0–1). */
    maskThreshold: 0.15,
    /** Contour (UX feedback) follows fast → it appears first. */
    contourTau: 0.12,
    /**
     * Adaptive (1-Euro-style) outline smoothing per mask pixel: changes below
     * changeLo are treated as jitter (slowTau), above changeHi as real motion
     * (fastTau), blended in between.
     */
    outlineSmoothing: { slowTau: 0.22, fastTau: 0.03, changeLo: 0.04, changeHi: 0.35 },
    /** Dots fill in slower than the contour, and dissolve slower still. */
    dotAttackTau: 0.8,
    dotReleaseTau: 0.9,
    /** Trailing "liquid smear" layer. */
    trailTau: 0.6,
    trailWeight: 0.12,
    /** Gaussian blob radius (σ) as a fraction of cell size. */
    blobSigma: 0.36,
    /** Metaball iso band: field below lo = water, above hi = full dot. */
    isoLo: 0.3,
    isoHi: 0.95,
    /** Dots drift on the ripple slope (screen units per unit slope). */
    rippleDrift: 0.006,
    /**
     * Motion-responsive opacity: dots are faint while their area moves and
     * ease up when it is still.
     */
    /** Faint while that area moves, easing up when still. */
    /** Raised from 0.15 / 0.25 so the body reads clearly on the wall. */
    /** Lowered from 0.75 / 0.95 so the text stays the main focus. */
    alphaMoving: 0.34,
    alphaStill: 0.59,
    /**
     * A cell's dot appears only after its area has been still for
     * stillDelay + (random 0…stillStagger) seconds — dots arrive a few at a
     * time instead of all at once.
     */
    stillDelay: 0.1,
    stillStagger: 0.4,
    /**
     * Dot colour = the background colour behind it mixed toward white, so the
     * dots follow the gradient but are always a bit lighter.
     * 0 = same as the water, 1 = pure white.
     */
    dotLighten: 0.45,
    /** Faint pale-blue veil that blends neighbouring dots together (0 = off). */
    dotBlend: 0.16,
    /** Share of body cells that carry a dot (keeps the figure airy, not crowded). */
    dotDensity: 0.72,
    /**
     * Light iridescent glints on some bubbles. A few twinkle on their own;
     * around a moving hand some light up — most when the arm lifts — and
     * the glint lingers along the path for armDots.holdTau seconds.
     */
    shimmer: {
      ambientShare: 0.08,
      ambient: 0.45,
      twinkle: 0.5,
      handShare: 0.8,
      handRadius: 0.14,
      /** Hand speed / upward speed (screen units/s) for full glow. */
      speedFull: 0.5,
      liftFull: 0.35,
    },
    /**
     * Figure size relative to the person (shrunk toward each person's centre).
     * 1 = dots sit exactly on the body + halo band (FX.vision.halo); was 0.8.
     */
    figureScale: 1,
    /** A cell needs at least this much body coverage to hold a bubble. */
    insideMin: 0.6,
    /**
     * Far-away visitors: a figure spanning less than farSpanLo of the wall
     * height counts as fully "far" (no shrinking, fuller bubbles, brighter);
     * above farSpanHi it is treated normally.
     */
    farSpanLo: 0.22,
    farSpanHi: 0.5,
    farAlphaBoost: 0.15,
    /** Extra light/shimmer on far figures' bubbles (0–1). */
    farGlow: 0.55,
    /** Bubbles re-pick which cells they occupy about this often (s). */
    bubbleShuffleSec: 6,
    /**
     * Arm dots: around each tracked hand the dots stay visible while the arm
     * waves (instead of dimming with motion), leaving a fading dotted wake
     * along the hand's path next to the water wave.
     */
    armDots: {
      /** Dot opacity right at the hand (bubbles brighten around a moving arm). */
      alpha: 0.65,
      /** Radius of the bright area around the hand (screen-h units). */
      radius: 0.12,
      /** How long the dotted wake lingers after the hand passes (s). */
      holdTau: 1.4,
    },
    /** Local motion energy that counts as "moving" (smoothstep lo → hi). */
    motionLo: 0.05,
    motionHi: 0.3,
    /** Fade to faint fast when motion starts; ease back up slowly. */
    alphaFallTau: 0.5,
    alphaRiseTau: 1.6,
    /**
     * Camera frame-difference → motion energy. Used ONLY to judge how much
     * the (posture-gated) body is moving, for the velocity-based opacity.
     */
    motionMask: {
      /** Per-pixel brightness change (0–255) treated as motion. */
      threshold: 18,
      /** How long motion lingers after it stops (s). */
      holdTau: 4.0,
      /** Weight of motion vs the silhouette in the combined mask (0 = off). */
      /** 0 = motion never creates dots (only dims them); dots come from detected people only. */
      gain: 0,
      /** Share of motion-only cells allowed to emit a dot (sparse). */
      density: 0.4,
    },
    /** Contour lines: core outline + two outward "echo" outlines. */
    /** Old static outline (replaced by FX.outlineFX; 0 = off). */
    contourAlpha: 0,
    echoAlpha: 0,
    /** Contour line width in device pixels. */
    contourWidthPx: 1.0,
  },

  hands: {
    /** Landmark visibility below this is ignored. */
    minVisibility: 0.35,
    /** One-Euro filter on wrist position (kills jitter, keeps intent). */
    oneEuro: { minCutoff: 0.8, beta: 0.6, dCutoff: 1.0 },
    /**
     * Speed → energy uses a soft saturation, never a hard clip:
     *   e = 1 − exp(−max(0, E − deadzone) / vSoft)
     */
    deadzone: 0.06,
    /** How slowly the shore waves turn toward a new hand direction (s). */
    dirTau: 1.2,
    vSoft: 0.35,
    /** Energy envelope: unhurried attack, long release (seconds). */
    attackTau: 0.35,
    releaseTau: 3.0,
    /**
     * Critically-damped spring on every wave parameter (rad/s). Lower = more
     * languid. Springs have continuous velocity, so nothing ever "corners".
     */
    springOmega: 2.0,
  },

  waves: {
    /** Horizontal displacement amplitude (screen widths). */
    ampIdle: 0.002,
    ampMax: 0.01,
    /** Light/shade on the travelling page-wide crests (scales with hand motion). */
    shoreShade: 0.13,
    /** Spatial frequency: wave crests across the screen width (low = long, shore-like waves). */
    freqIdle: 0.5,
    freqMax: 0.8,
    /** Temporal angular speed (rad/s). Phase is integrated, never t·ω. */
    speedIdle: 0.1,
    speedMax: 0.3,
    /** Gentle local sway around each hand (gaussian radius, gain). */
    handSwayRadius: 0.22,
    handSwayGain: 0,
    /**
     * Gentle waves even when no one is waving: the travelling shore bands keep
     * this share of their light/shade at rest (0 = flat until hands move).
     */
    idleShore: 0.35,
    /**
     * true = upright wave crests that only travel left/right (natural swell);
     * false = crests turn to follow the hand's direction (the old behaviour).
     */
    horizontalOnly: true,
    /** How much each crest curves (0 = perfectly straight; was 0.18). */
    crestBend: 0.04,
    /** Soft shine riding the crests across the whole page (0 = off). */
    sheen: 0.045,
  },

  ripples: {
    /** Simulation grid width; height follows aspect ratio. */
    simWidth: 320,
    /** Fixed sim rate. */
    stepsPerSecond: 60,
    /**
     * Wave-equation stiffness k in  v += (avg − h)·k.  Propagation speed
     * scales with √k (k = 2 is the classic, brisk value). 0.32 ≈ 0.4× speed.
     */
    stiffness: 0.32,
    damping: 0.9986,
    /**
     * Viscosity ν in  v += (avg(v) − v)·ν. Damps short wavelengths fastest,
     * so rings soften and widen as they spread, then melt away. Raise for
     * a quicker natural fade, lower for rings that carry further.
     */
    viscosity: 0.025,
    /** Absorbing band at the frame edge (screen-h units): no bounce-back. */
    edgeSponge: 0.05,
    /**
     * Ripple collisions: each tap's wavefront is tracked as an expanding
     * disk (r = c·age). Where two or more active disks overlap, the water
     * loses energy much faster, so crossing rings dissolve instead of piling
     * up. collisionDamping is the per-step factor inside an overlap.
     */
    collisionDamping: 0.965,
    /** How long a tap counts as an "active ripple" for collisions (s). */
    rippleLife: 9,
    /** Taps closer than this (screen-h) within 1 s count as the same ripple. */
    mergeRadius: 0.06,
    /** Wider drop → longer wavelength → calmer, more widely spaced rings. */
    touchRadius: 0.06,
    touchStrength: 0.42,
    /**
     * A touch emits a short decaying oscillation → concentric ring train.
     * Ring spacing ≈ wave speed × gap (≈ 0.09 screen-h at 1 s): wide, calm.
     */
    /** Rings per tap (was 3, then 2 — now a single ring). */
    touchPulses: 1,
    /**
     * Gap between a tap's rings. Longer than the original 1000 ms to match the
     * slower tap-ripple speed (FX.tapRipples), so ring spacing looks the same.
     */
    touchPulseGapMs: 1270,
    touchPulseDecay: 0.7,
    /** Hand wakes: strong, local, trace the hand's path through the water. */
    /** Hand wakes: strong, local, trace the hand's path through the water. */
    handWakeRadius: 0.14,
    handWakeGain: 1.2,
    /** Shading */
    refraction: 0.018,
    normalScale: 9,
    specular: 0.22,
    /** Thin iridescent outline traced along each ripple ring (matches the body outline). */
    outlineAlpha: 0,
    outlineWidthPx: 1.1,
  },

  /**
   * Tapped ripples only (taps, finger drags, the soft drops around a thought).
   * They run in their own water layer so they can be slower and fade sooner
   * without changing the hand / arm wakes, which use FX.ripples above.
   */
  tapRipples: {
    /** Speed ∝ √stiffness: 0.2 ≈ 23 % faster than the previous 0.132. */
    stiffness: 0.2,
    /**
     * Per-step energy loss: lower = rings fade out sooner and don't travel as
     * far (0.9962 ≈ 20 % loss per second vs 8 % for hand wakes).
     */
    damping: 0.9962,
    /** Rings soften and melt away as they spread (higher = sooner). */
    viscosity: 0.04,
    /** How long a tap counts as an active ripple for collision damping (s). */
    rippleLife: 7,
  },

  /**
   * Proximity: when someone stands close to the wall their silhouette
   * becomes huge. Measured as the share of the screen the body covers;
   * between coverLo and coverHi the dots and outline fade to `closeFloor`
   * of their normal strength.
   */
  proximity: {
    coverLo: 0.3,
    coverHi: 0.6,
    /** A body spanning nearly the full height also counts as "close". */
    spanLo: 0.88,
    /**
     * Raised from 0.25: on a touch screen (Surface Hub) people stand close to
     * tap, and the body should stay clearly visible then too.
     */
    closeFloor: 0.65,
    /** Fade out quickly when someone steps in; return slowly. */
    fadeOutTau: 0.35,
    fadeInTau: 1.2,
  },

  /**
   * Clear zones: dots and outline are suppressed in a soft ellipse around
   * every thought (teasers and revealed text) so text is never covered.
   */
  clearZones: {
    /** Ellipse radii in screen units (x, y) around each teaser. */
    teaser: [0.14, 0.1] as [number, number],
    revealed: [0.2, 0.12] as [number, number],
    /** Dot strength left inside a zone (0 = fully clear). */
    /** 1 = off: no holes around text (dots are already sparse and still-only). */
    floor: 1,
  },

  /**
   * Spare second wave field in the sim (it used to drive the horizontal
   * "hand lines", now removed). Hand wakes go into the main water instead.
   */
  handLines: {
    damping: 0.9975,
    viscosity: 0.06,
  },

  /** Posture gate: dots only for a standing person with head + torso visible. */
  posture: {
    /**
     * On = dense dots ONLY for a detected human with a visible face above
     * both shoulders (upright if hips are visible). Background objects,
     * still or moving, never produce dots. Off = every silhouette makes dots.
     */
    enabled: false,
    /**
     * true = restrict dots to a column over head + torso (no arms).
     * false = the person's whole silhouette, arms included.
     */
    armColumn: false,
    /** Landmark visibility needed for head (nose/eyes), shoulders and hips. */
    minVisibility: 0.55,
    /** Max torso lean from vertical (degrees) to count as standing. */
    maxLeanDeg: 35,
    /** Keep the body field alive this long through brief detection drops (ms). */
    holdMs: 450,
    /**
     * Dots are limited to a soft vertical column over head, torso and legs
     * (half-width = shoulder width × this). Arms reaching or waving outside
     * it never produce dots — hands are shown only through the water.
     */
    columnWidth: 0.75,
    /**
     * Partial human parts (an arm outside the body column, or a person who
     * doesn't pass the gate) only ever produce small, sparse dots, and only
     * while that part is held still.
     */
    partial: {
      /** Dot size relative to a full body dot (area ∝ this). */
      /** 0 = partial parts never make dots (they still get the outline). */
      scale: 0,
      /** Share of cells allowed to emit (sparse). */
      density: 0.5,
      /** Motion energy below this counts as "held still". */
      stillBelow: 0.04,
    },
  },

  /**
   * Ambient fish schools: a deep, purely decorative layer. Each school swims
   * along a slowly meandering flow path; its fish follow the same path with
   * staggered lags and side offsets (the look of a cohesive school), facing
   * their direction of travel. They are drawn at the raw screen position
   * (ignoring ripples, hand waves and tracking) as very faint translucent white.
   */
  fish: {
    /** Faint groups wandering the background — texture, never the focus. */
    schools: 6, // max 6 (shader limit)
    /** Fish per school (shader loop bound is 12). */
    perSchool: 8,
    /** How fast each school wanders its path (path radians / s; lower = calmer). */
    speed: 0.07,
    /** Body half-length (screen heights); further schools are drawn smaller. */
    size: 0.0065,
    /** Translucent white: how much white is mixed in (very faint). */
    alpha: 0.13,
  },

  /**
   * Tapping the water spawns a thought at the tap point, and ONE of Saskia's
   * frilly fish appears right beside it (fading up soft → crisp, solid white)
   * and swims slowly around the words with the Saskia site's school steering:
   * along a loose ring, easing back if it drifts, with a gentle private wander.
   */
  surfaceFish: {
    /** Body half-length when fully surfaced (screen heights) — small, the words lead. */
    size: 0.012,
    /** Faint white, with a gentle glow — never competes with the text. */
    alpha: 0.65,
    glow: 0.12,
    /** 0 = crisp, 1 = fully soft/blurred silhouette. */
    blur: 0.65,
    /** The ring it swims around the text (screen heights) — close to the words. */
    ringRx: 0.19,
    ringRy: 0.075,
    /** Cruising speed (screen heights / s) — gentle but lively. */
    speed: 0.055,
    /** Seconds to fade up / to sink back. */
    riseSec: 2.0,
    sinkSec: 1.8,
  },

  /** Tapped thoughts: how long they stay, how many at once, the water beneath. */
  tapThoughts: {
    holdMs: 11000,
    maxAtOnce: 3,
    /** One tap = one thought; faster taps only ripple. */
    cooldownMs: 450,
    /** Area around each thought kept free of sparkles (no darkening). */
    poolRadius: [0.34, 0.2] as [number, number],
    /**
     * Readability floor near the words: brief highlights (wave light, sheen,
     * dots) close to a thought are toned down so white text keeps at least
     * this contrast. 4.7 = WCAG AA for the 12pt text (4.5 : 1) with a margin
     * (3.2 would be enough only for large text, ≥ 14pt bold).
     */
    textContrast: 4.7,
    /** How far around a thought the light gaps close (screen heights, soft). */
    calmRadius: 0.22,
    /** Seconds for nearby light gaps to close when a thought appears, and to
     * reopen as it leaves. */
    deepenInSec: 4,
    deepenOutSec: 2,
  },

  /**
   * TouchDesigner-style body + hand outline (see OutlineFX.ts):
   * Edge → Feedback (zoom / rise / swirl / decay) → Blur glow → Add.
   */
  outlineFX: {
    enabled: false,
    /** Outline line width (pixels of the half-res buffer). */
    edgeWidthPx: 0.9,
    edgeGain: 0.8,
    /** Glowing point at each tracked hand (radius in screen-h units). */
    handRadius: 0.035,
    handGain: 0.3,
    /** Feedback: how long trails linger (s), and their slow drift. */
    trailTau: 0.8,
    zoomPerSec: 0.025,
    risePerSec: 0.005,
    swirl: 0.12,
    /** Composite: core line strength, neon glow strength, overall opacity. */
    core: 0.75,
    glow: 0.22,
    alpha: 0.17,
  },

  /**
   * Hidden words drift toward the surface while visitors' arms stir the
   * water (hand-wave energy). Only some words rise, and they stay blurred
   * (never readable) until tapped.
   */
  surfacing: {
    riseTau: 2.0,
    sinkTau: 5.0,
    /** Extra teaser opacity at full energy (base 0.3). */
    alphaGain: 0.28,
    /** Slight growth, as if nearer the surface. */
    scaleGain: 0.05,
    /** Blur at full energy (base 7 px). Keep ≥ 4 so words stay unreadable. */
    minBlurPx: 4.5,
  },

  /** Thin-film iridescence (shared by ripples, dots and contour). */
  iridescence: {
    /** Film index of refraction (soap ≈ 1.33). */
    filmIor: 1.33,
    /** Film thickness range in nanometres (thin → pastel, thick → banded). */
    thicknessMin: 280,
    thicknessMax: 520,
    strength: 0.22,
  },

  /** Old frame-difference motion → ripple splashes. Off. */
  legacyMotionSplashes: false,
} as const;

export type FxConfig = typeof FX;
