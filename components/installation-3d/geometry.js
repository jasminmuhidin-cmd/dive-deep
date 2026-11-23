import * as THREE from 'three';

export const DEG = Math.PI / 180;

/*
 * Floor plan (top view, +X right, +Z towards the viewer):
 *
 *        main room            exit hallway  →  exits at +X
 *     ╭───────────────┬─────────────────────────────  z = −R   (exit wall)
 *    (    beanbags    │ ═══════ divider ═══════════  z = 0
 *     ╰───────────────┴─────────────────────────────  z = +R   (entry wall)
 *   curved             x = 0   entry hallway  ←  enters at +X        x = hallLength
 *   projection wall
 *
 * R = hallWidth + dividerThickness / 2, so both hallways are hallWidth wide.
 */
export function derivePlan(plan) {
  const { hallWidth, hallLength, dividerThickness, mainRoomDepth, curveDepth } = plan;
  const R = hallWidth + dividerThickness / 2;
  return {
    R,
    xMin: -(mainRoomDepth + curveDepth),
    xMax: hallLength,
    divider: { start: [0, 0], end: [hallLength, 0] },
    // straight walls run so that their face points into the hallway
    exitWall: { start: [0, -R], end: [hallLength, -R] },
    entryWall: { start: [hallLength, R], end: [0, R] },
  };
}

/**
 * Main-room wall: straight run along the entry side, elliptical curve round the
 * end, straight run back along the exit side. Ordered left → right as seen from
 * inside the main room, so the projection isn't mirrored. `offset` pushes it outward.
 */
export function mainRoomWallPath(plan, offset = 0, segments = 72) {
  const { mainRoomDepth: d, curveDepth } = plan;
  const R = plan.hallWidth + plan.dividerThickness / 2 + offset;
  const rx = curveDepth + offset;
  const pts = [[0, R]];
  for (let i = 0; i <= segments; i++) {
    const t = (Math.PI * i) / segments;
    pts.push([-d - rx * Math.sin(t), R * Math.cos(t)]);
  }
  pts.push([0, -R]);
  // drop zero-length segments (e.g. mainRoomDepth = 0)
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-6);
}

/** Points spread evenly along a polyline (by length), pushed `inset` metres into the room. */
export function pointsAlong(points, fractions, inset = 0) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const total = cum[cum.length - 1];
  return fractions.map((f) => {
    const target = f * total;
    let i = 0;
    while (i < points.length - 2 && cum[i + 1] < target) i++;
    const seg = cum[i + 1] - cum[i] || 1;
    const dx = (points[i + 1][0] - points[i][0]) / seg;
    const dz = (points[i + 1][1] - points[i][1]) / seg;
    const along = target - cum[i];
    // left→right ordering means (−dz, dx) points into the room
    return [points[i][0] + dx * along - dz * inset, points[i][1] + dz * along + dx * inset];
  });
}

/** Vertical ribbon standing on a polyline. Faces point into the room; u runs along it. */
export function wallRibbonGeometry(points, height) {
  const pos = [];
  const uv = [];
  const idx = [];
  const dist = [0];
  for (let i = 1; i < points.length; i++) {
    dist.push(dist[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const total = dist[dist.length - 1];
  points.forEach(([x, z], i) => {
    pos.push(x, 0, z, x, height, z);
    uv.push(dist[i] / total, 0, dist[i] / total, 1);
  });
  for (let i = 0; i < points.length - 1; i++) {
    const a = 2 * i;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.length = total;
  return g;
}

/** Horizontal strip joining two equal-length polylines at height y (a wall's top edge). */
export function capGeometry(inner, outer, y) {
  const pos = [];
  const idx = [];
  inner.forEach(([x, z], i) => pos.push(x, y, z, outer[i][0], y, outer[i][1]));
  for (let i = 0; i < inner.length - 1; i++) {
    const a = 2 * i;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * U-shaped floor: follows the outside of the walls (+ `margin`) and stops
 * `endExtension` metres past the open hallway ends.
 */
export function floorGeometry(plan, wallThickness, floor) {
  const off = wallThickness + floor.margin;
  const edge = mainRoomWallPath(plan, off, 96);
  const R = plan.hallWidth + plan.dividerThickness / 2 + off;
  const xEnd = plan.hallLength + floor.endExtension;
  // Shape lives in XY; rotating the mesh −90° about X maps (x, y) → (x, 0, −y)
  const shape = new THREE.Shape();
  shape.moveTo(edge[0][0], -edge[0][1]);
  edge.slice(1).forEach(([x, z]) => shape.lineTo(x, -z));
  shape.lineTo(xEnd, R);
  shape.lineTo(xEnd, -R);
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 1);
}

/** Flat ribbon on the floor following a smooth curve through [x, z] points. */
export function pathRibbonGeometry(points, width, samples = 300) {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'centripetal',
  );
  const len = curve.getLength();
  const pos = [];
  const nrm = [];
  const uv = [];
  const idx = [];
  const half = width / 2;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const nx = -tan.z;
    const nz = tan.x;
    pos.push(p.x + nx * half, 0, p.z + nz * half, p.x - nx * half, 0, p.z - nz * half);
    nrm.push(0, 1, 0, 0, 1, 0);
    uv.push(0, t * len, 1, t * len);
  }
  for (let i = 0; i < samples; i++) {
    const a = 2 * i;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); // wound to face up
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Soft pouf-style beanbag (≈0.77 m across, 0.36 m tall) with a dimpled top. */
export function beanbagGeometry() {
  const profile = [
    [0, 0], [0.2, 0], [0.3, 0.015], [0.36, 0.07], [0.385, 0.16],
    [0.37, 0.26], [0.31, 0.33], [0.22, 0.355], [0.1, 0.33], [0, 0.3],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(profile, 40);
  g.computeVertexNormals();
  return g;
}

/** Colour-space + anisotropy setup for image textures seen at grazing angles. */
export function prepTexture(tex, gl) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = gl.capabilities.getMaxAnisotropy();
  tex.needsUpdate = true;
  return tex;
}

/** Repeat a texture along a wall of `length` × `height` so the image keeps its aspect ('tile') or spans once ('stretch'). */
export function fitTextureToWall(tex, length, height, fit = 'tile') {
  const img = tex.image;
  const aspect = img && img.width ? img.width / img.height : 16 / 9;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(fit === 'stretch' ? 1 : length / (height * aspect), 1);
  tex.needsUpdate = true;
}

/**
 * Visitor path, generated from the plan so it follows the U:
 * entry-hallway centreline → loop into the main room → exit-hallway centreline.
 * A sine wiggle on top makes it wind; its amplitude is clamped so the path
 * stays inside the hallways, and it eases in/out at both ends.
 */
export function generatePathPoints(plan, p) {
  const { R } = derivePlan(plan);
  const zc = (plan.dividerThickness / 2 + R) / 2 + p.laneOffset;
  const step = 0.15;
  const spine = [];
  const startX = plan.hallLength + p.startOverhang;
  for (let x = startX; x > 0; x -= step) spine.push([x, zc]);
  const n = Math.max(12, Math.ceil((Math.PI * Math.max(p.loopDepth, zc)) / step));
  for (let i = 0; i <= n; i++) {
    const t = (Math.PI * i) / n;
    spine.push([-p.loopDepth * Math.sin(t), zc * Math.cos(t)]);
  }
  for (let x = step; x < p.endX; x += step) spine.push([x, -zc]);
  spine.push([p.endX, -zc]);

  // arc length along the spine
  const s = [0];
  for (let i = 1; i < spine.length; i++) {
    s.push(s[i - 1] + Math.hypot(spine[i][0] - spine[i - 1][0], spine[i][1] - spine[i - 1][1]));
  }
  const total = s[s.length - 1];
  const room = plan.hallWidth / 2 - p.width / 2 - Math.abs(p.laneOffset) - 0.1;
  const amp = Math.min(p.windiness, Math.max(0, room));
  const ease = (v) => {
    const c = Math.min(1, Math.max(0, v));
    return c * c * (3 - 2 * c);
  };
  const k = (2 * Math.PI) / Math.max(0.5, p.wavelength);
  const phase = p.phaseDeg * DEG;

  return spine.map(([x, z], i) => {
    const a = spine[Math.max(0, i - 1)];
    const b = spine[Math.min(spine.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const nz = (b[0] - a[0]) / len;
    const off = amp * ease(s[i] / 1.2) * ease((total - s[i]) / 1.2) * Math.sin(k * s[i] + phase);
    return [x + nx * off, z + nz * off];
  });
}

/** Canvas textures for the lit path: `pulse` repeats along its length, `edge` fades across its width. */
export function makePathTextures() {
  const make = (w, h, paint) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paint(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const pulse = make(4, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#b4b4b4');
    g.addColorStop(0.42, '#b4b4b4');
    g.addColorStop(0.5, '#ffffff');
    g.addColorStop(0.58, '#b4b4b4');
    g.addColorStop(1, '#b4b4b4');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  pulse.colorSpace = THREE.SRGBColorSpace;
  const edge = make(64, 4, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#000');
    g.addColorStop(0.5, '#fff');
    g.addColorStop(1, '#000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  return { pulse, edge };
}

/** Configure the pulse spacing, and slide it along the path (entry → exit). */
export function setPulse(tex, spacing, distance) {
  tex.repeat.set(1, 1 / Math.max(0.2, spacing));
  tex.offset.y = -distance / Math.max(0.2, spacing);
}

/** Small seeded RNG so "random" layouts stay put between reloads (change the seed to reshuffle). */
export function seededRandom(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hanging banners spread along a hallway in two staggered lanes.
 * Banners that land on a kiosk swap to the other lane.
 * Returns [{ position: [x, z], rotationDeg, texture }].
 */
export function generateBanners(plan, a, kiosks = [], textureCount = 1) {
  const { R } = derivePlan(plan);
  const zc = (plan.dividerThickness / 2 + R) / 2;
  const rand = seededRandom(a.seed);
  const halls = a.zone === 'both' ? ['entry', 'exit'] : [a.zone];
  const perHall = halls.map((_, h) => Math.floor(a.count / halls.length) + (h < a.count % halls.length ? 1 : 0));
  const maxLane = plan.hallWidth / 2 - 0.45;
  const lane = Math.min(a.stagger, Math.max(0, maxLane));
  const out = [];
  halls.forEach((hall, h) => {
    const n = perHall[h];
    const side = hall === 'entry' ? 1 : -1;
    // entry visitors walk −X (banners face +X), exit visitors walk +X (banners face −X)
    const face = hall === 'entry' ? a.rotationDeg : a.rotationDeg + 180;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const x = a.fromX + (a.toX - a.fromX) * t + (rand() - 0.5) * 2 * a.jitter;
      let l = i % 2 === 0 ? 1 : -1;
      const jz = (rand() - 0.5) * 2 * a.jitter;
      const zFor = (ll) => side * zc + ll * lane + jz;
      const clash = (z) => kiosks.some(({ position: [kx, kz] }) => Math.hypot(kx - x, kz - z) < a.clearance);
      if (clash(zFor(l)) && !clash(zFor(-l))) l = -l;
      out.push({
        position: [x, zFor(l)],
        rotationDeg: face + l * a.turnDeg + (rand() - 0.5) * 2 * a.jitter * 20,
        texture: out.length % textureCount,
      });
    }
  });
  return out;
}

/**
 * Receipts stuck on the exit wall: a grid over an area of the wall, loosened by `scatter`
 * (0 = neat grid, 1 = fully messy). Returns [[u, y, rotationDeg]].
 */
export function generateReceipts(r) {
  const w = Math.max(0.05, r.toU - r.fromU);
  const h = Math.max(0.05, r.toY - r.fromY);
  const cols = Math.max(1, Math.round(Math.sqrt((r.count * w) / h)));
  const rows = Math.max(1, Math.ceil(r.count / cols));
  const cw = w / cols;
  const ch = h / rows;
  const rand = seededRandom(r.seed);
  const out = [];
  for (let i = 0; i < r.count; i++) {
    const c = i % cols;
    const row = Math.floor(i / cols);
    const rowShift = row % 2 ? 0.5 * r.scatter : 0; // brick-like offset as it gets messier
    out.push([
      r.fromU + (c + 0.5 + rowShift * 0.5) * cw + (rand() - 0.5) * cw * r.scatter,
      r.toY - (row + 0.5) * ch + (rand() - 0.5) * ch * r.scatter,
      (rand() * 2 - 1) * r.tiltDeg,
    ]);
  }
  return out;
}
