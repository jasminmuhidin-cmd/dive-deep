// ─────────────────────────────────────────────────────────────────────────────
// Dive Deep installation — single source of truth for the 3D diorama.
//
// Units: 1 unit = 1 metre. The floor is the XZ plane and +Y is up.
//
// The room is a U (see the diagram in geometry.js):
//   entry hallway (+Z side) ─┐
//                            ├─ main room with the curved projection wall (−X end)
//   exit hallway  (−Z side) ─┘
// Visitors enter at the +X end of the entry hallway, walk to the main room,
// turn round the divider and leave along the exit hallway.
// x = 0 is the main-room end of the divider; z = 0 is the divider's centreline.
//
// Floor positions are written [x, z]. Rotations are in degrees about +Y
// (0 = facing +Z, 90 = facing +X, i.e. towards people coming in).
// Most values are live-editable in the leva panel (press D); use "Log values"
// there to copy your tweaks back into this file.
// ─────────────────────────────────────────────────────────────────────────────

// Downscaled copies of the originals in /3d/textures (some originals are larger
// than the GPU's max texture size and would render black). Re-export with
// `sips -Z 4096 in.png --out web/in.png` if you replace an original.
const TEX = '/3d/textures/web';

export const ASSETS = {
  rippleWall: `${TEX}/ripple-wall.jpg`,
  exitWall: `${TEX}/exit-wall.jpg`,
  receipt: `${TEX}/receipt.png`,
  banners: [`${TEX}/banner-1.png`, `${TEX}/banner-2.png`, `${TEX}/banner-3.png`],
  kiosk: {
    // MTL textures (screen_ui.png, receipt_design.png) resolve relative to this folder
    dir: '/3d/models/dive_deep_kiosk_obj_and_textures/',
    obj: 'dive_deep_kiosk.obj',
    mtl: 'dive_deep_kiosk.mtl',
  },
};

const layout = {
  // ── Floor plan — every wall and the floor are generated from these ────────
  plan: {
    hallWidth: 3.6, // clear width of BOTH the entry and the exit hallway
    hallLength: 8, // length of the hallways (= the divider)
    dividerThickness: 0.2,
    mainRoomDepth: 2.5, // straight part of the main room beyond the divider's end
    curveDepth: 3.8, // how far the curved wall bulges past that (≈ hallWidth for a semicircle)
  },

  floor: {
    color: '#121722',
    margin: 0, // extra floor outside the walls' outer faces
    endExtension: 0.3, // floor past the open hallway ends
  },

  // Walls facing away from the camera are hidden as you orbit, so the inside
  // always stays visible (dollhouse cutaway). Their top edges stay as an outline.
  cutaway: true,
  capColor: '#2a3346',

  // ── Scene & camera ────────────────────────────────────────────────────────
  background: '#05070c',
  camera: {
    // the orbit target is the centre of the plan; the camera sits at this offset from it
    offset: [17, 16, 14],
    zoom: 52, // pixels per metre
    minZoom: 18,
    maxZoom: 220,
    minPolarDeg: 12, // can't flip over the top
    maxPolarDeg: 80, // can't drop to / under the floor
  },

  // ── Lighting ──────────────────────────────────────────────────────────────
  lighting: {
    ambient: { color: '#9fb4d6', intensity: 0.35 },
    hemisphere: { sky: '#6f8fb8', ground: '#0b0f17', intensity: 0.6 },
    key: { color: '#dfe8ff', intensity: 1.4, position: [9, 14, 10], shadows: true },
    // blue spill from the projection, spaced along the curved wall
    wallLights: { color: '#5aa6c4', intensity: 8, distance: 8, count: 4, inset: 1.4, y: 2.2 },
    pillarLight: { color: '#cfeaff', intensity: 3, distance: 3 },
  },

  // ── Walls ─────────────────────────────────────────────────────────────────
  // Main-room wall with the projection. Modular: it takes any THREE.Texture,
  // so the live ripple canvas can replace the still image later.
  curvedWall: {
    height: 3.6,
    thickness: 0.15,
    segments: 72,
    texture: ASSETS.rippleWall,
    textureFit: 'tile', // 'tile' keeps the image's aspect and repeats; 'stretch' spans once
    glow: 1.0, // emissive brightness of the projection
  },

  // Outer wall of the exit hallway
  exitWall: {
    height: 3.6,
    thickness: 0.15,
    color: '#d9d9d6', // matches the mural's canvas so the edges blend
    mural: {
      texture: ASSETS.exitWall,
      height: 3.6, // width follows the image aspect (1.5:1)
      u: 3.0, // centre, in metres along the wall from the main-room end
      centerY: 1.8,
      offset: 0.004,
    },
    // Receipts stuck on the wall, laid out over an area (u = metres along the wall from the main-room end)
    receipts: {
      texture: ASSETS.receipt,
      height: 0.32, // width follows the receipt image aspect
      offset: 0.01, // off the wall face, avoids z-fighting
      count: 14,
      fromU: 5.5,
      toU: 7.7,
      fromY: 1.35,
      toY: 2.6,
      scatter: 0.5, // 0 = neat grid, 1 = messy
      tiltDeg: 5, // max random tilt
      seed: 1, // change to reshuffle
    },
  },

  // Outer wall of the entry hallway
  entryWall: {
    height: 3.6,
    thickness: 0.15,
    color: '#1a2030',
  },

  divider: {
    height: 3,
    color: '#1a2030',
  },

  // ── Main room ─────────────────────────────────────────────────────────────
  // Placeholder for the concentric floor ripples
  rippleFloor: {
    center: [-3.3, 0],
    radius: 2.9,
    color: '#0f1b2b',
  },

  // Round rugs with beanbags, like the reference photo
  beanbags: {
    color: '#41598a',
    rugColor: '#b9bfcc',
    scale: 1,
    rugs: [
      {
        center: [-3.6, 1.5],
        radius: 1.25,
        // [dx, dz, rotation°, scale] relative to the rug centre
        bags: [[-0.55, 0.35, 30, 1], [0.5, 0.45, -20, 0.95], [0.05, -0.55, 80, 1.05]],
      },
      {
        center: [-3.8, -1.5],
        radius: 1.25,
        bags: [[-0.5, -0.4, 10, 1], [0.55, -0.3, 60, 1.05], [0.0, 0.55, -40, 0.95]],
      },
      {
        center: [-5.2, 0],
        radius: 0.75,
        bags: [[0, 0, 0, 1.05]],
      },
    ],
  },

  // ── Exit hallway ──────────────────────────────────────────────────────────
  // "tap your phone on the light at the end"
  pillar: {
    position: [6.8, -2.6],
    radius: 0.28,
    height: 1.1,
    color: '#2a3242',
    glowColor: '#cfeaff',
  },

  // ── Entry hallway ─────────────────────────────────────────────────────────
  kiosk: {
    // The .obj is modelled in metres (~0.58 × 1.24 × 0.57 without its backdrop), so it loads 1:1.
    // Set a number to force the kiosk to that height instead; `scale` multiplies either way.
    fitHeight: null,
    scale: 1,
    rotationDeg: 0, // orientation fix for the .obj, applied to every kiosk
    hideParts: ['Studio_Cyclorama_Backdrop'], // mesh names (substring) stripped from the model
    instances: [
      { position: [6.2, 2.9], rotationDeg: 90 },
      { position: [3.8, 0.9], rotationDeg: 90 },
      { position: [1.5, 2.9], rotationDeg: 90 },
    ],
  },

  banners: {
    size: [0.841, 1.189], // A0 portrait, matches the artwork's aspect
    bottomY: 1.0, // height of the banner's bottom edge
    ceilingY: 3.6, // where the hanging wires attach (the panel keeps this at the wall height)
    backing: '#eef1f4', // printed-media colour behind the transparent PNG; null = see-through
    opacity: 1, // 0 = invisible, 1 = solid (applies to artwork and backing)
    wireColor: '#8a95a8',
    // Arrangement — banners are spread along the hallway(s) in two staggered lanes
    // and cycle through ASSETS.banners
    count: 8,
    zone: 'entry', // 'entry' | 'exit' | 'both'
    fromX: 7.5, // first banner (near the hallway opening)…
    toX: 0.4, // …last banner (near the main room)
    stagger: 0.85, // how far each lane sits either side of the hallway centre
    rotationDeg: 90, // 90 = facing visitors as they come in
    turnDeg: 15, // alternating angle between lanes
    jitter: 0.1, // random nudge in position (m) and angle
    clearance: 0.8, // banners closer than this to a kiosk swap lanes
    seed: 3, // change to reshuffle the jitter
  },

  // Lit visitor path, generated from the floor plan:
  // entry hallway → loop into the main room → round the divider → exit hallway.
  floorPath: {
    // shape
    width: 0.5,
    windiness: 0.6, // side-to-side sway in metres (auto-limited to stay inside the hallways)
    wavelength: 4.5, // metres per full S-bend — smaller = tighter wiggles
    phaseDeg: 0, // slides the bends along the path
    loopDepth: 2.1, // how far the path reaches into the main room past the divider
    laneOffset: 0, // + moves the path towards the outer walls, − towards the divider
    startOverhang: 0.3, // metres beyond the entry-hallway opening where it starts
    endX: 6.0, // where it stops in the exit hallway (the pillar is at x = 6.8)
    // light
    y: 0.008,
    color: '#8fd3ff',
    brightness: 1.0,
    opacity: 0.9,
    haloWidth: 2.6, // halo width × path width
    haloStrength: 0.35,
    flow: true, // pulses of light travelling from entry to exit
    flowSpeed: 0.8, // m/s
    pulseSpacing: 3, // metres between pulses
  },
};

export default layout;
