import * as THREE from "three";
import { FX } from "./fxConfig";
import type { HandOut } from "./HandWaveController";

const MAX_DROPS = 16;
const MAX_WAKES = 4;
/** Active tap ripples tracked for collision damping. */
const MAX_SOURCES = 10;

const simVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Height-field water on the GPU (ping-pong render targets).
 *   R = hand-wake height, G = its velocity      (FX.ripples)
 *   B = tap-ripple height, A = its velocity     (FX.tapRipples: slower, fades sooner)
 * Readers use R + B as the surface height.
 *
 * Per texel, per step:
 *   v += (avg(h) − h) · k            wave equation; speed c ∝ √k
 *   v += (avg(v) − v) · ν            viscosity: smooths v, so short, sharp
 *                                    wavelengths die first — rings broaden,
 *                                    soften and melt into the water as they
 *                                    travel, like real ripples
 *   v *= damping · sponge            gentle global loss; "sponge" only
 *                                    near the screen edges so rings leave
 *                                    the frame instead of bouncing back
 *   h += v
 * Rings travel outward without any limit; their fade comes from 2-D
 * spreading (amplitude ∝ 1/√r), viscosity and damping together — no masks,
 * zones or borders.
 */
const simFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D uState;
  uniform vec2 uTexel;
  uniform float uAspect;
  uniform float uDamping;
  uniform float uStiffness;
  uniform float uViscosity;
  uniform float uSponge;               // edge band width (screen-h units)
  uniform vec4 uDrops[${MAX_DROPS}];   // x, y (gl uv), radius (screen-h units), strength
  uniform int uDropCount;
  uniform vec4 uWakes[${MAX_WAKES}];   // x, y, vx, vy  (vy in gl orientation)
  uniform float uWakeStrength[${MAX_WAKES}];
  uniform float uWakeRadius;
  uniform float uWakeGain;
  uniform vec4 uSources[${MAX_SOURCES}];  // x, y (gl uv), wavefront radius, weight
  uniform float uCollisionDamping;
  uniform float uTapDamping;
  uniform float uTapStiffness;
  uniform float uTapViscosity;
  varying vec2 vUv;

  const float PI = 3.14159265;

  void main() {
    vec4 info = texture2D(uState, vUv);
    vec4 l = texture2D(uState, vUv - vec2(uTexel.x, 0.0));
    vec4 r = texture2D(uState, vUv + vec2(uTexel.x, 0.0));
    vec4 d = texture2D(uState, vUv - vec2(0.0, uTexel.y));
    vec4 u = texture2D(uState, vUv + vec2(0.0, uTexel.y));
    vec4 avg = (l + r + d + u) * 0.25;

    vec2 asp = vec2(uAspect, 1.0);

    // Open-water edges: absorb smoothly in a thin band at the frame border.
    float edge = min(min(vUv.x, 1.0 - vUv.x) * uAspect, min(vUv.y, 1.0 - vUv.y));
    float sponge = mix(0.9, 1.0, smoothstep(0.0, uSponge, edge));

    // Collision zones: count how many active ripple disks cover this texel.
    // Inside one disk → normal water. Where two or more overlap → extra
    // damping, so intersecting rings dissipate quickly instead of stacking.
    // Soft disk edges (±0.03) and a soft count threshold keep it seamless.
    float cover = 0.0;
    for (int i = 0; i < ${MAX_SOURCES}; i++) {
      vec4 src = uSources[i];
      if (src.w <= 0.0) continue;
      float dd = length((vUv - src.xy) * asp);
      cover += src.w * (1.0 - smoothstep(src.z - 0.03, src.z + 0.03, dd));
    }
    float overlap = smoothstep(1.05, 1.8, cover);

    // R/G: hand wakes (original water settings).
    info.g += (avg.r - info.r) * uStiffness;
    info.g += (avg.g - info.g) * uViscosity;
    info.g *= uDamping * sponge;
    info.r += info.g;
    info.r *= 0.9985 * sponge; // bleed DC offset so the surface returns to rest

    // B/A: tap ripples — slower and fading sooner (FX.tapRipples). Crossing
    // tap rings lose energy faster (collision damping).
    float tapDamp = mix(uTapDamping, uCollisionDamping, overlap);
    info.a += (avg.b - info.b) * uTapStiffness;
    info.a += (avg.a - info.a) * uTapViscosity;
    info.a *= tapDamp * sponge;
    info.b += info.a;
    info.b *= 0.9985 * sponge;

    // Touch drops (into the tap layer): raised-cosine bump → concentric rings.
    for (int i = 0; i < ${MAX_DROPS}; i++) {
      if (i >= uDropCount) break;
      vec4 dr = uDrops[i];
      float dist = length((vUv - dr.xy) * asp) / dr.z;
      float b = max(0.0, 1.0 - dist);
      b = 0.5 - 0.5 * cos(b * PI);
      info.b += b * dr.w;
    }

    // Hand wakes, injected every step at the hand's current position, so the
    // disturbance traces the hand's path like a palm dragged through water:
    //   bow (+ ahead, − behind)  +  a trough under the hand
    // both scaled by speed — a still hand leaves the water calm.
    for (int i = 0; i < ${MAX_WAKES}; i++) {
      float s = uWakeStrength[i];
      if (s <= 0.0) continue;
      vec4 w = uWakes[i];
      vec2 rel = (vUv - w.xy) * asp / uWakeRadius;
      vec2 v = w.zw * asp;
      float speed = length(v);
      if (speed < 0.02) continue;
      float g = exp(-dot(rel, rel));
      float sp = min(speed, 2.5);
      // Into the main water (same field as touch ripples), so the hand's
      // wake refracts the surface, spreads as real waves and interacts
      // with taps:  bow (+ ahead, − behind) + a trough under the hand.
      info.r += (dot(rel, v / speed) * 0.9 - 0.5) * g * sp * uWakeGain * s * 0.02;
    }

    gl_FragColor = info;
  }
`;

export class GpuRippleSim {
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private pending: THREE.Vector4[] = [];
  /** Active tap ripples (gl uv) and when they started (ms). */
  private sources: { x: number; y: number; t0: number }[] = [];

  private acc = 0;
  width: number;
  height: number;
  aspect: number;

  constructor(
    private gl: THREE.WebGLRenderer,
    aspect: number,
  ) {
    this.aspect = aspect;
    this.width = FX.ripples.simWidth;
    this.height = Math.max(32, Math.round(this.width / aspect));
    this.rtA = this.makeRT();
    this.rtB = this.makeRT();

    this.material = new THREE.ShaderMaterial({
      vertexShader: simVert,
      fragmentShader: simFrag,
      uniforms: {
        uState: { value: this.rtA.texture },
        uTexel: { value: new THREE.Vector2(1 / this.width, 1 / this.height) },
        uAspect: { value: aspect },
        uDamping: { value: FX.ripples.damping },
        uStiffness: { value: FX.ripples.stiffness },
        uDrops: {
          value: Array.from({ length: MAX_DROPS }, () => new THREE.Vector4()),
        },
        uDropCount: { value: 0 },
        uWakes: {
          value: Array.from({ length: MAX_WAKES }, () => new THREE.Vector4()),
        },
        uWakeStrength: { value: new Array(MAX_WAKES).fill(0) },
        uWakeRadius: { value: FX.ripples.handWakeRadius },
        uWakeGain: { value: FX.ripples.handWakeGain },
        uViscosity: { value: FX.ripples.viscosity },
        uSources: {
          value: Array.from({ length: MAX_SOURCES }, () => new THREE.Vector4()),
        },
        uCollisionDamping: { value: FX.ripples.collisionDamping },
        uTapDamping: { value: FX.tapRipples.damping },
        uTapStiffness: { value: FX.tapRipples.stiffness },
        uTapViscosity: { value: FX.tapRipples.viscosity },
        uSponge: { value: FX.ripples.edgeSponge },
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  private makeRT() {
    const rt = new THREE.WebGLRenderTarget(this.width, this.height, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    });
    rt.texture.generateMipmaps = false;
    // Start flat.
    const prev = this.gl.getRenderTarget();
    this.gl.setRenderTarget(rt);
    this.gl.setClearColor(0x000000, 0);
    this.gl.clear(true, false, false);
    this.gl.setRenderTarget(prev);
    return rt;
  }

  /** The current height fields (surface height = R + B). */
  get texture(): THREE.Texture {
    return this.rtA.texture;
  }
  get texel(): THREE.Vector2 {
    return this.material.uniforms.uTexel.value as THREE.Vector2;
  }

  /**
   * Queue a drop. sx, sy are screen uv (y DOWN, as from pointer events).
   * radius is in screen-height units.
   */
  drop(
    sx: number,
    sy: number,
    radius: number = FX.ripples.touchRadius,
    strength: number = FX.ripples.touchStrength,
  ) {
    if (this.pending.length >= MAX_DROPS) this.pending.shift();
    this.pending.push(new THREE.Vector4(sx, 1 - sy, radius, strength));
    this.addSource(sx, 1 - sy);
  }

  /** Register a ripple source; nearby taps within 1 s are the same ripple. */
  private addSource(x: number, y: number) {
    const now = performance.now();
    const R = FX.ripples;
    for (const src of this.sources) {
      if (
        now - src.t0 < 1000 &&
        Math.hypot((src.x - x) * this.aspect, src.y - y) < R.mergeRadius
      )
        return;
    }
    if (this.sources.length >= MAX_SOURCES) this.sources.shift();
    this.sources.push({ x, y, t0: now });
  }

  /**
   * Wavefront speed of the discrete wave equation: c = √(k/4) texels per
   * step → screen heights per second. Used to grow each source's disk.
   */
  private get ringSpeed() {
    return (Math.sqrt(FX.tapRipples.stiffness / 4) * FX.ripples.stepsPerSecond) / this.height;
  }

  private updateSources() {
    const now = performance.now();
    const life = FX.tapRipples.rippleLife;
    this.sources = this.sources.filter((src) => now - src.t0 < life * 1000);
    const u = this.material.uniforms.uSources!.value as THREE.Vector4[];
    const c = this.ringSpeed;
    for (let i = 0; i < MAX_SOURCES; i++) {
      const src = this.sources[i];
      if (!src) {
        u[i]!.set(0, 0, 0, 0);
        continue;
      }
      const age = (now - src.t0) / 1000;
      // Slightly ahead of the visible front (dispersion), fading out with age.
      const r = c * age * 1.1 + 0.03;
      const w = 1 - Math.min(1, Math.max(0, (age / life - 0.7) / 0.3));
      u[i]!.set(src.x, src.y, r, w);
    }
  }

  private scheduled: { at: number; v: THREE.Vector4 }[] = [];

  /**
   * A finger touch: a drop followed by a few alternating-sign, decaying
   * pulses at the same spot. Like a drip, this radiates a *train* of
   * concentric rings instead of a single ring.
   */
  touch(
    sx: number,
    sy: number,
    strength: number = FX.ripples.touchStrength,
    radius: number = FX.ripples.touchRadius,
  ) {
    const R = FX.ripples;
    const now = performance.now();
    for (let i = 0; i < R.touchPulses; i++) {
      const k = strength * Math.pow(R.touchPulseDecay, i) * (i % 2 ? -1 : 1);
      const r = radius * (1 - i * 0.15);
      if (i === 0) this.drop(sx, sy, r, k);
      else
        this.scheduled.push({
          at: now + i * R.touchPulseGapMs,
          v: new THREE.Vector4(sx, 1 - sy, r, k),
        });
    }
  }

  setWakes(hands: HandOut[]) {
    const u = this.material.uniforms;
    const w = u.uWakes.value as THREE.Vector4[];
    const s = u.uWakeStrength.value as number[];
    for (let i = 0; i < MAX_WAKES; i++) {
      const h = hands[i];
      if (!h) {
        s[i] = 0;
        continue;
      }
      // screen y down → gl y up (flip vy too)
      w[i]!.set(h.x, 1 - h.y, h.vx, -h.vy);
      s[i] = h.strength;
    }
  }

  /** Advance at a fixed rate so ripple speed is display-independent. */
  step(dt: number) {
    const stepDt = 1 / FX.ripples.stepsPerSecond;
    this.acc = Math.min(this.acc + dt, stepDt * 6);
    if (this.scheduled.length) {
      const now = performance.now();
      this.scheduled = this.scheduled.filter((d) => {
        if (d.at > now) return true;
        if (this.pending.length >= MAX_DROPS) this.pending.shift();
        this.pending.push(d.v);
        return false;
      });
    }
    const u = this.material.uniforms;
    this.updateSources();
    const prev = this.gl.getRenderTarget();
    let first = true;
    while (this.acc >= stepDt) {
      this.acc -= stepDt;
      const drops = u.uDrops.value as THREE.Vector4[];
      if (first && this.pending.length) {
        for (let i = 0; i < this.pending.length; i++) drops[i]!.copy(this.pending[i]!);
        u.uDropCount.value = this.pending.length;
        this.pending.length = 0;
      } else {
        u.uDropCount.value = 0;
      }
      first = false;
      u.uState.value = this.rtA.texture;
      this.gl.setRenderTarget(this.rtB);
      this.gl.render(this.scene, this.camera);
      const t = this.rtA;
      this.rtA = this.rtB;
      this.rtB = t;
    }
    this.gl.setRenderTarget(prev);
  }

  dispose() {
    this.rtA.dispose();
    this.rtB.dispose();
    this.material.dispose();
    (this.scene.children[0] as THREE.Mesh).geometry.dispose();
  }
}
