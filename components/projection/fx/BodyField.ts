import * as THREE from "three";
import { FX } from "./fxConfig";
import { expAlpha, screenToCam } from "./mapping";
import { MASK_H, MASK_W, type BodyVisionFrame } from "./useBodyVision";
import type { GpuRippleSim } from "./GpuRippleSim";
import type { HandOut } from "./HandWaveController";

/**
 * Body layer, produced as two textures that the water composite shades:
 *
 *  maskTexture (camera space, MASK_W×MASK_H, linear-filtered)
 *     R = silhouette, fast-smoothed + 1-px blur   → core contour line (iso 0.5)
 *     G = silhouette, wide blur (~6 px)           → outer "echo" contours
 *
 *  fieldTexture (screen space, half resolution, half-float)
 *     R = Σ Gaussian blobs, one per occupied grid cell (metaball field)
 *
 * Why a field instead of drawing circles directly: each dot is a soft
 * Gaussian  g(r) = exp(−r² / 2σ²). Summed and thresholded with a wide
 * smoothstep, isolated dots read as soft round droplets, while neighbours
 * that drift close grow liquid "necks" and merge — surface-tension
 * behaviour for free. The field's gradient also gives each droplet a normal,
 * which drives the iridescent rim.
 */

const blobVert = /* glsl */ `
  attribute vec2 aCell;          // cell centre, screen uv (y down)
  uniform sampler2D uGrid;       // R = dot coverage, G = trail coverage
  uniform sampler2D uSim;
  uniform vec2 uSimTexel;
  uniform vec2 uCell;            // cell size in NDC
  uniform float uLayer;          // 0 = dots, 1 = trail
  uniform float uSigma;          // σ as fraction of cell
  uniform float uDrift;
  uniform float uTime;
  varying vec2 vLocal;           // in units of σ
  varying float vAmp;
  varying float vOpacity;
  varying float vSpark;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743); }

  void main() {
    vec4 g = texture2D(uGrid, aCell);
    float cov = mix(g.r, g.g, uLayer);
    vAmp = 1.0;
    vOpacity = g.b;                // motion-responsive opacity for this cell
    vSpark = g.a;                  // iridescent shimmer for this bubble
    if (cov < 0.015) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vLocal = vec2(9.0); return; }

    // Area ∝ coverage  →  σ ∝ √coverage. Shrinking σ (not amplitude) keeps
    // small dots round instead of fading into blur.
    float h1 = hash(aCell), h2 = hash(aCell + 7.1), h3 = hash(aCell + 3.7);
    // Bubbles of mixed sizes: a few large, many small.
    float sigma = uSigma * sqrt(cov) * mix(0.45, 1.05, h3 * h3);

    // Floating: each bubble bobs and sways slowly, smaller ones faster,
    // drifting a little upward then settling — like bubbles held in water.
    float spd = 1.0 + (1.0 - h3) * 0.8;
    vec2 wander = vec2(0.12 * sin(uTime * (0.17 + 0.12 * h1) * spd + h1 * 6.283),
                       0.15 * sin(uTime * (0.13 + 0.10 * h2) * spd + h2 * 6.283));
    vec2 simUv = vec2(aCell.x, 1.0 - aCell.y);
    vec2 slope = vec2(
      // surface height = hand wakes (r) + tap ripples (b)
      dot(texture2D(uSim, simUv + vec2(uSimTexel.x, 0.0)).rb - texture2D(uSim, simUv - vec2(uSimTexel.x, 0.0)).rb, vec2(1.0)),
      dot(texture2D(uSim, simUv + vec2(0.0, uSimTexel.y)).rb - texture2D(uSim, simUv - vec2(0.0, uSimTexel.y)).rb, vec2(1.0)));

    vec2 centre = vec2(aCell.x * 2.0 - 1.0, 1.0 - aCell.y * 2.0);
    centre += wander * uCell + clamp(slope * uDrift * 80.0, -0.012, 0.012);

    // Quad spans ±3σ (Gaussian is ~0 beyond that).
    vLocal = position.xy * 2.0 * 3.0;
    gl_Position = vec4(centre + position.xy * uCell * sigma * 6.0, 0.0, 1.0);
  }
`;

const blobFrag = /* glsl */ `
  precision highp float;
  uniform float uWeight;
  uniform float uLayer;
  varying vec2 vLocal;
  varying float vAmp;
  varying float vOpacity;
  varying float vSpark;
  void main() {
    float g = exp(-0.5 * dot(vLocal, vLocal)) * vAmp * uWeight;
    // R = Σ blob, G = Σ blob·opacity, B = Σ blob·shimmer → the composite
    // divides by R for smooth local opacity / shimmer.
    gl_FragColor = vec4(g, g * vOpacity, g * vSpark * (1.0 - uLayer), 1.0);
  }
`;

export class BodyField {
  readonly cols: number;
  readonly rows: number;
  private n: number;
  private gridData: Uint8Array;
  private gridTex: THREE.DataTexture;
  private target: Float32Array;
  private rawTarget: Float32Array;
  /** Per grid column: 1 when the person there is small (far away). */
  private farCol: Float32Array;
  private remap: Float32Array;
  private dots: Float32Array;
  private trail: Float32Array;
  private opacity: Float32Array;
  private cellMotion: Float32Array;
  /** Seconds each cell has been still (motion below motionLo). */
  private stillFor: Float32Array;
  /** Per-cell random delay before its dot may appear (staggered fade-in). */
  private stillNeed: Float32Array;
  private cellHash: Float32Array;
  /** Per-cell glow left by a passing hand (0–1, decays over armDots.holdTau). */
  private handBoost: Float32Array;
  private outline = new Float32Array(MASK_W * MASK_H);
  private combined = new Float32Array(MASK_W * MASK_H);
  private lookup: Int32Array;
  private lookupKey = -1;
  private lastSeq = -1;

  private maskFast = new Float32Array(MASK_W * MASK_H);
  private tmpA = new Float32Array(MASK_W * MASK_H);
  private tmpB = new Float32Array(MASK_W * MASK_H);
  private core = new Float32Array(MASK_W * MASK_H);
  private maskData = new Uint8Array(MASK_W * MASK_H * 4);
  readonly maskTexture: THREE.DataTexture;

  private rt: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private geo: THREE.InstancedBufferGeometry;
  private base: THREE.PlaneGeometry;
  private mats: THREE.ShaderMaterial[];
  /** True once any body has been seen (lets the shader skip work). */
  presence = 0;
  /**
   * 0–1 multiplier on dots + outline. Drops toward FX.proximity.closeFloor
   * when someone is close enough that their silhouette would flood the wall.
   */
  visibility = 1;
  /** Raw proximity estimate 0 (far) – 1 (very close), for the debug HUD. */
  proximity = 0;
  private proxTarget = 0;

  constructor(
    private gl: THREE.WebGLRenderer,
    private aspect: number,
    fieldW: number,
    fieldH: number,
  ) {
    this.cols = FX.body.cols;
    this.rows = Math.max(8, Math.round(this.cols / aspect));
    const n = (this.n = this.cols * this.rows);

    this.gridData = new Uint8Array(n * 4);
    this.gridTex = new THREE.DataTexture(this.gridData, this.cols, this.rows, THREE.RGBAFormat);
    this.gridTex.minFilter = THREE.NearestFilter;
    this.gridTex.magFilter = THREE.NearestFilter;
    this.gridTex.needsUpdate = true;
    this.target = new Float32Array(n);
    this.rawTarget = new Float32Array(n);
    this.farCol = new Float32Array(this.cols);
    this.remap = new Float32Array(n);
    this.dots = new Float32Array(n);
    this.trail = new Float32Array(n);
    this.opacity = new Float32Array(n).fill(FX.body.alphaStill);
    this.cellMotion = new Float32Array(n);
    this.stillFor = new Float32Array(n);
    this.stillNeed = new Float32Array(n).map((_, i) => {
      const x = Math.sin(i * 91.7 + 17.3) * 24634.6345;
      return FX.body.stillDelay + (x - Math.floor(x)) * FX.body.stillStagger;
    });
    this.handBoost = new Float32Array(n);
    this.cellHash = new Float32Array(n).map((_, i) => {
      const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    });
    this.lookup = new Int32Array(n * 4);

    this.maskTexture = new THREE.DataTexture(this.maskData, MASK_W, MASK_H, THREE.RGBAFormat);
    this.maskTexture.minFilter = THREE.LinearFilter;
    this.maskTexture.magFilter = THREE.LinearFilter;
    this.maskTexture.needsUpdate = true;

    this.rt = new THREE.WebGLRenderTarget(fieldW, fieldH, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });

    const cells = new Float32Array(n * 2);
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        cells[i * 2] = (c + 0.5) / this.cols;
        cells[i * 2 + 1] = (r + 0.5) / this.rows;
      }
    this.base = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = this.base.index;
    this.geo.setAttribute("position", this.base.getAttribute("position"));
    this.geo.setAttribute("aCell", new THREE.InstancedBufferAttribute(cells, 2));
    this.geo.instanceCount = n;

    this.mats = [0, 1].map(
      (layer) =>
        new THREE.ShaderMaterial({
          vertexShader: blobVert,
          fragmentShader: blobFrag,
          uniforms: {
            uGrid: { value: this.gridTex },
            uSim: { value: null as THREE.Texture | null },
            uSimTexel: { value: new THREE.Vector2(1 / 256, 1 / 144) },
            uCell: { value: new THREE.Vector2(2 / this.cols, 2 / this.rows) },
            uLayer: { value: layer },
            uSigma: { value: FX.body.blobSigma },
            uDrift: { value: FX.body.rippleDrift },
            uTime: { value: 0 },
            uWeight: { value: layer ? FX.body.trailWeight : 1 },
          },
          // Pure additive accumulation: field = Σ blobs.
          blending: THREE.CustomBlending,
          blendSrc: THREE.OneFactor,
          blendDst: THREE.OneFactor,
          blendEquation: THREE.AddEquation,
          depthTest: false,
          depthWrite: false,
          transparent: true,
        }),
    );
    for (const m of this.mats) {
      const mesh = new THREE.Mesh(this.geo, m);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
    }
  }

  get fieldTexture(): THREE.Texture {
    return this.rt.texture;
  }
  get fieldTexel(): THREE.Vector2 {
    return new THREE.Vector2(1 / this.rt.width, 1 / this.rt.height);
  }

  update(
    frame: BodyVisionFrame,
    dt: number,
    time: number,
    sim: GpuRippleSim | null,
    hands: HandOut[] = [],
  ) {
    const B = FX.body;

    // ---- camera-space mask: fast follow + blur → contour texture -------
    // Posture-gated silhouette only (see useBodyVision): motion no longer
    // creates dots by itself; it only drives the velocity-based opacity.
    const m = this.combined;
    const pose = frame.mask;
    const mot = frame.motion;
    const motNow = frame.motionNow;
    const part = frame.partial;
    // Silhouette, plus any moving mass at reduced weight (previous
    // behaviour; FX.body.motionMask.gain = 0 turns motion dots off).
    // Dots: gated silhouette (+ optional motion). Outline: EVERY detected
    // person — gated mask plus the partial/ungated silhouettes.
    // Dots use the dot zone (body + a soft band just outside the outline);
    // the outline itself follows the cleaned silhouette.
    const zone = frame.dotZone;
    const gain = B.motionMask.gain;
    for (let i = 0; i < m.length; i++) m[i] = Math.max(zone[i]!, mot[i]! * gain);
    const outline = this.outline;
    for (let i = 0; i < outline.length; i++)
      outline[i] = Math.max(pose[i]!, mot[i]! * gain, part[i]!);
    const mf = this.maskFast;
    // Per-pixel 1-Euro-style smoothing: the cutoff rises with how much the
    // pixel is changing. Tiny flicker (segmentation noise at the edge) is
    // smoothed heavily (τ = slowTau); a real movement (large change) passes
    // almost straight through (τ = fastTau) — steady AND responsive lines.
    const S = B.outlineSmoothing;
    const aSlow = expAlpha(dt, S.slowTau);
    const aFast = expAlpha(dt, S.fastTau);
    let any = 0;
    for (let i = 0; i < mf.length; i++) {
      const d = outline[i]! - mf[i]!;
      let k = (Math.abs(d) - S.changeLo) / (S.changeHi - S.changeLo);
      k = k < 0 ? 0 : k > 1 ? 1 : k;
      mf[i] = mf[i]! + d * (aSlow + (aFast - aSlow) * k);
      if (mf[i]! > 0.3) any++;
    }
    this.presence += ((any > 30 ? 1 : 0) - this.presence) * expAlpha(dt, 0.6);
    const core = this.core;
    boxBlur(mf, core, this.tmpB, 1);
    boxBlur(mf, this.tmpA, this.tmpB, 6);
    const d = this.maskData;
    for (let i = 0; i < mf.length; i++) {
      d[i * 4] = (Math.min(1, core[i]!) * 255) | 0;
      d[i * 4 + 1] = (Math.min(1, this.tmpA[i]! * 1.4) * 255) | 0;
    }
    this.maskTexture.needsUpdate = true;

    // ---- cell lookup (screen cell → 4 camera mask samples) --------------
    const key = frame.camAspect * 1000 + this.aspect;
    if (key !== this.lookupKey) {
      this.lookupKey = key;
      const off = [-0.25, 0.25];
      for (let r = 0; r < this.rows; r++)
        for (let c = 0; c < this.cols; c++) {
          const i = r * this.cols + c;
          let k = 0;
          for (const oy of off)
            for (const ox of off) {
              const [cx, cy] = screenToCam(
                (c + 0.5 + ox) / this.cols,
                (r + 0.5 + oy) / this.rows,
                frame.camAspect,
                this.aspect,
              );
              const mx = Math.floor(cx * MASK_W);
              const my = Math.floor(cy * MASK_H);
              this.lookup[i * 4 + k++] =
                mx < 0 || my < 0 || mx >= MASK_W || my >= MASK_H ? -1 : my * MASK_W + mx;
            }
        }
    }

    if (frame.seq !== this.lastSeq) {
      this.lastSeq = frame.seq;
      for (let i = 0; i < this.n; i++) {
        let acc = 0;
        let mv = 0;
        let pa = 0;
        let ps = 0;
        for (let k = 0; k < 4; k++) {
          const j = this.lookup[i * 4 + k]!;
          if (j >= 0) {
            acc += m[j]!;
            mv += motNow[j]!;
            pa += part[j]!;
            ps += zone[j]!;
          }
        }
        this.cellMotion[i] = mv * 0.25;
        // Motion-only cells (no silhouette here) emit sparsely: a light
        // sprinkle for arm / passer-by motion, not a filled shape.
        if (ps * 0.25 < 0.3 && this.cellHash[i]! > B.motionMask.density) acc = 0;

        const t = Math.min(1, Math.max(0, (acc * 0.25 - B.maskThreshold) / 0.4));
        let target = t * t * (3 - 2 * t);

        // Partial human parts (a still hand, an arm, someone half in view):
        // only small, sparse dots, and only while that area is held still.
        const PP = FX.posture.partial;
        if (
          pa * 0.25 > B.maskThreshold &&
          this.cellMotion[i]! < PP.stillBelow &&
          this.cellHash[i]! < PP.density
        ) {
          const tp = Math.min(1, (pa * 0.25 - B.maskThreshold) / 0.4);
          target = Math.max(target, tp * PP.scale);
        }
        this.target[i] = target;
      }
      // Proximity is judged on the full silhouette (before shrinking/sparsifying).
      this.rawTarget.set(this.target);
      this.shapeBubbles(time);

      // ---- proximity: how much of the wall would the body fill? ----------
      //   cover = share of grid cells inside the body
      //   span  = share of rows that contain any body
      // A close visitor fills a large share of cells or spans the full
      // height with a lot of area; both map smoothly to proxTarget ∈ [0,1].
      const P = FX.proximity;
      let inside = 0;
      let rowsHit = 0;
      for (let r = 0; r < this.rows; r++) {
        let hit = false;
        for (let c = 0; c < this.cols; c++) {
          if (this.rawTarget[r * this.cols + c]! > 0.5) {
            inside++;
            hit = true;
          }
        }
        if (hit) rowsHit++;
      }
      const cover = inside / this.n;
      const span = rowsHit / this.rows;
      const ss = (a: number, b: number, x: number) => {
        const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
      };
      this.proxTarget = Math.max(
        ss(P.coverLo, P.coverHi, cover),
        ss(P.spanLo, 1.0, span) * ss(P.coverLo * 0.5, P.coverLo, cover),
      );
    }

    // Fade out fast when someone steps in, return slowly when they step back.
    {
      const P = FX.proximity;
      const up = this.proxTarget > this.proximity;
      this.proximity +=
        (this.proxTarget - this.proximity) * expAlpha(dt, up ? P.fadeOutTau : P.fadeInTau);
      this.visibility = 1 - (1 - P.closeFloor) * this.proximity;
    }

    // ---- dots: slow fill-in after the contour; trail even slower --------
    const aU = expAlpha(dt, B.dotAttackTau);
    const aD = expAlpha(dt, B.dotReleaseTau);
    const aT = expAlpha(dt, B.trailTau);
    // Motion-responsive opacity: local motion, plus some of the overall
    // motion so a moving body dims as a whole. Fast fall, slow rise.
    const aFall = expAlpha(dt, B.alphaFallTau);
    const aRise = expAlpha(dt, B.alphaRiseTau);
    const globalMotion = Math.min(1, frame.motionAmount * 6);

    // Arm dots: around each tracked hand the dots stay bright even while
    // moving, and that brightness lingers along the hand's path (decaying
    // over armDots.holdTau). So a waving arm shows as dots and leaves a
    // fading dotted wake alongside the water wave it makes.
    const A = B.armDots;
    const keep = Math.exp(-dt / A.holdTau);
    // Each tracked hand lights the bubbles around it — a little when it
    // moves, most when the arm LIFTS (screen y up = negative vy).
    const SH = B.shimmer;
    const lit = hands.map((h) => {
      const up = Math.max(0, -h.svy);
      const sp = Math.hypot(h.svx, h.svy);
      return {
        x: h.x,
        y: h.y,
        k: Math.min(1, 0.25 + sp / SH.speedFull * 0.8 + up / SH.liftFull) * h.strength,
      };
    });
    const r2 = SH.handRadius * SH.handRadius;

    const g = this.gridData;
    for (let i = 0; i < this.n; i++) {
      let hb = this.handBoost[i]! * keep;
      const ch = this.cellHash[i]!;
      // Only some bubbles take the light, so it reads as a few glints.
      if (lit.length && ((ch * 7.31) % 1) < SH.handShare) {
        const cx = ((i % this.cols) + 0.5) / this.cols;
        const cy = (Math.floor(i / this.cols) + 0.5) / this.rows;
        for (const h of lit) {
          if (h.k <= 0.01) continue;
          const dx = (cx - h.x) * this.aspect;
          const dy = cy - h.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < r2 * 4) hb = Math.max(hb, Math.exp(-d2 / r2) * h.k);
        }
      }
      this.handBoost[i] = hb;
      // Ambient shimmer: a small share of bubbles slowly glint on and off.
      const amb = ((ch * 13.7) % 1) < SH.ambientShare
        ? SH.ambient * Math.max(0, Math.sin(time * SH.twinkle * (0.6 + ch) + ch * 40))
        : 0;
      // Far-away figures' bubbles also catch more light, so they read clearly.
      const farG = this.farCol[i % this.cols]! * B.farGlow;
      g[i * 4 + 3] = (Math.min(1, Math.max(amb, hb, farG)) * 255) | 0;
      const mv = Math.max(this.cellMotion[i]!, globalMotion * 0.6);
      // Dots only when STILL, and not all at once: each cell must stay still
      // for its own random delay (stillDelay + up to stillStagger seconds)
      // before its dot fades in, so a figure fills in gradually.
      this.stillFor[i] = mv < B.motionLo ? this.stillFor[i]! + dt : 0;
      const still = this.stillFor[i]! >= this.stillNeed[i]!;
      const farO = this.farCol[i % this.cols]!;
      const opT = Math.max(
        (still ? B.alphaStill : B.alphaMoving) + farO * B.farAlphaBoost,
        A.alpha * this.handBoost[i]!,
      );
      const op = this.opacity[i]!;
      this.opacity[i] = op + (opT - op) * (opT < op ? aFall : aRise);
      g[i * 4 + 2] = (this.opacity[i]! * this.visibility * 255) | 0;
      const t = this.target[i]!;
      const dv = this.dots[i]!;
      const nd = dv + (t - dv) * (t > dv ? aU : aD);
      const nt = this.trail[i]! + (nd - this.trail[i]!) * aT;
      this.dots[i] = nd;
      this.trail[i] = nt;
      g[i * 4] = (nd * 255) | 0;
      // Trail only where the body has *left* → a liquid wake, not a halo.
      g[i * 4 + 1] = (Math.max(0, nt - nd) * 255) | 0;
    }
    this.gridTex.needsUpdate = true;

    // ---- render the metaball field -------------------------------------
    for (const mat of this.mats) {
      mat.uniforms.uTime!.value = time;
      if (sim) {
        mat.uniforms.uSim!.value = sim.texture;
        (mat.uniforms.uSimTexel!.value as THREE.Vector2).copy(sim.texel);
      }
    }
    const prev = this.gl.getRenderTarget();
    const prevClear = this.gl.getClearColor(new THREE.Color());
    const prevAlpha = this.gl.getClearAlpha();
    this.gl.setRenderTarget(this.rt);
    this.gl.setClearColor(0x000000, 0);
    this.gl.clear(true, false, false);
    this.gl.render(this.scene, this.camera);
    this.gl.setRenderTarget(prev);
    this.gl.setClearColor(prevClear, prevAlpha);
  }

  /**
   * Turn the silhouette into a loose cloud of bubbles:
   *  1. each person (a run of occupied columns) is shrunk toward its own
   *     centre by FX.body.figureScale, so the figure floats in the water
   *     instead of filling the wall;
   *  2. only a sparse, slowly changing share of cells keeps a bubble, and
   *     fewer still toward the edges — the outline (round head etc.)
   *     dissolves into scattered bubbles rather than a crisp shape.
   */
  private shapeBubbles(time: number) {
    const B = FX.body;
    const C = this.cols;
    const R = this.rows;
    const src = this.rawTarget;
    const dst = this.remap;
    dst.fill(0);
    const farCol = this.farCol;
    farCol.fill(0);
    // Column occupancy → runs (one per person, roughly).
    const colW = new Float32Array(C);
    for (let r = 0; r < R; r++)
      for (let c = 0; c < C; c++) colW[c] += src[r * C + c]!;
    let c = 0;
    while (c < C) {
      if (colW[c]! < 0.5) { c++; continue; }
      const c0 = c;
      while (c < C && colW[c]! >= 0.5) c++;
      const c1 = c - 1;
      // Centre of mass of this run.
      let sw = 0, sx = 0, sy = 0;
      for (let r = 0; r < R; r++)
        for (let k = c0; k <= c1; k++) {
          const w = src[r * C + k]!;
          sw += w; sx += w * k; sy += w * r;
        }
      if (sw <= 0) continue;
      const cx = sx / sw;
      const cy = sy / sw;
      // How small (far away) is this person? Rows spanned / grid height.
      let r0 = R, r1 = -1;
      for (let r = 0; r < R; r++)
        for (let k = c0; k <= c1; k++)
          if (src[r * C + k]! > 0.3) { if (r < r0) r0 = r; if (r > r1) r1 = r; break; }
      const frac = r1 >= r0 ? (r1 - r0 + 1) / R : 0;
      const tt = Math.min(1, Math.max(0, (frac - B.farSpanLo) / (B.farSpanHi - B.farSpanLo)));
      const far = 1 - tt * tt * (3 - 2 * tt); // 1 = small/far, 0 = big/near
      // Far figures keep full size and get a fuller, clearer bubble fill.
      const s = B.figureScale + (1 - B.figureScale) * far;
      for (let k = c0; k <= c1; k++) farCol[k] = far;
      const lo = Math.max(0, Math.floor(cx + (c0 - cx) * s));
      const hi = Math.min(C - 1, Math.ceil(cx + (c1 - cx) * s));
      for (let r = 0; r < R; r++) {
        const sr = Math.round(cy + (r - cy) / s);
        if (sr < 0 || sr >= R) continue;
        for (let k = lo; k <= hi; k++) {
          const sc = Math.round(cx + (k - cx) / s);
          if (sc < c0 || sc > c1) continue;
          const v = src[sr * C + sc]!;
          if (v > dst[r * C + k]!) dst[r * C + k] = v;
        }
      }
    }
    // Sparse, edge-eroded, slowly re-shuffling bubble selection.
    for (let i = 0; i < this.n; i++) {
      const v = dst[i]!;
      // Only cells well inside the silhouette carry a bubble, so the cloud
      // stays within the body instead of spilling past its edge.
      // Around a tracked hand the threshold relaxes so the thin arm and
      // hand still get bubbles.
      const farI = this.farCol[i % C]!;
      const need = (this.handBoost[i]! > 0.15 ? B.insideMin * 0.5 : B.insideMin) * (1 - 0.5 * farI);
      if (v < need) { this.target[i] = 0; continue; }
      // Each cell re-rolls its chance every bubbleShuffleSec (offset per cell
      // so they never all change at once); dot fade times blend the swap.
      const ph = Math.floor(time / B.bubbleShuffleSec + this.cellHash[i]!);
      const x = Math.sin((i + 1) * 12.9898 + ph * 78.233) * 43758.5453;
      const h = x - Math.floor(x);
      const far = this.farCol[i % C]!;
      const keep = Math.min(1, B.dotDensity * (0.55 + 0.45 * v * v) + far * 0.3);
      this.target[i] = h < keep ? v : 0;
    }
  }

  dispose() {
    this.rt.dispose();
    this.gridTex.dispose();
    this.maskTexture.dispose();
    this.geo.dispose();
    this.base.dispose();
    for (const m of this.mats) m.dispose();
  }
}

/** Separable box blur, radius r, out ← blur(src). tmp is scratch. */
function boxBlur(src: Float32Array, out: Float32Array, tmp: Float32Array, r: number) {
  const W = MASK_W;
  const H = MASK_H;
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < H; y++) {
    let acc = 0;
    const row = y * W;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(W - 1, Math.max(0, x))]!;
    for (let x = 0; x < W; x++) {
      tmp[row + x] = acc * inv;
      acc += src[row + Math.min(W - 1, x + r + 1)]! - src[row + Math.max(0, x - r)]!;
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(H - 1, Math.max(0, y)) * W + x]!;
    for (let y = 0; y < H; y++) {
      out[y * W + x] = acc * inv;
      acc += tmp[Math.min(H - 1, y + r + 1) * W + x]! - tmp[Math.max(0, y - r) * W + x]!;
    }
  }
}
