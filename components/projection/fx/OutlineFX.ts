import * as THREE from "three";
import { FX } from "./fxConfig";
import type { HandOut } from "./HandWaveController";

/**
 * TouchDesigner-style outline pass, entirely on the GPU (one feedback buffer,
 * ping-pong render targets at half resolution):
 *
 *   Edge TOP      → crisp silhouette outline traced from the smoothed body
 *                   mask (iso-line at 0.5, constant pixel width)
 *   + hand points → soft glowing points at each tracked hand (brighter when
 *                   the hand moves)
 *   Feedback TOP  → previous frame, slightly zoomed, drifting upward and
 *   + Transform     swirling, multiplied by a decay → lines leave soft,
 *   + Level         flowing trails instead of snapping
 *
 * The result (R channel) is composited by WaterPlane with a two-radius
 * blur (Blur TOP → neon glow) and the same iridescent tint as the water.
 */

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const frag = /* glsl */ `
  precision highp float;
  uniform sampler2D uPrev;
  uniform sampler2D uMask;          // camera space, R = smoothed silhouette
  uniform float uAspect, uCamAspect, uMirror;
  uniform vec4 uCalib;
  uniform float uDecay, uZoom, uRise, uSwirl, uTime;
  uniform float uEdgeGain, uEdgeWidth, uVis;
  uniform vec4 uHands[4];           // x, y (screen, y down), speed01, strength
  uniform float uHandR, uHandGain;
  varying vec2 vUv;

  vec2 screenToCam(vec2 s) {
    float m = uMirror > 0.5 ? 1.0 - s.x : s.x;
    float k = uAspect / uCamAspect;
    vec2 c = k < 1.0 ? vec2(0.5 + (m - 0.5) * k, s.y) : vec2(m, 0.5 + (s.y - 0.5) / k);
    return 0.5 + (c - 0.5) * uCalib.xy + uCalib.zw;
  }

  void main() {
    // ---- Feedback + Transform: sample last frame slightly zoomed in toward
    // the centre (so trails expand outward), risen (drift up) and swirled.
    vec2 c = vUv - 0.5;
    float a = uSwirl * sin(uTime * 0.21 + c.y * 3.0);
    c = mat2(cos(a), -sin(a), sin(a), cos(a)) * c;
    vec2 puv = 0.5 + c * (1.0 - uZoom) - vec2(0.0, uRise);
    float prev = texture2D(uPrev, puv).r * uDecay;

    // ---- Edge: iso-line of the smoothed mask, ~uEdgeWidth px wide.
    vec2 s = vec2(vUv.x, 1.0 - vUv.y);
    vec2 cu = screenToCam(s);
    float m = (cu.x < 0.0 || cu.y < 0.0 || cu.x > 1.0 || cu.y > 1.0) ? 0.0 : texture2D(uMask, cu).r;
    float w = max(fwidth(m), 1e-4);
    float edge = 1.0 - smoothstep(0.0, uEdgeWidth, abs(m - 0.5) / w);
    edge *= uEdgeGain * uVis;

    // ---- Hand points.
    float hand = 0.0;
    for (int i = 0; i < 4; i++) {
      vec4 h = uHands[i];
      if (h.w <= 0.0) continue;
      vec2 d = (s - h.xy) * vec2(uAspect, 1.0);
      hand += exp(-dot(d, d) / (uHandR * uHandR)) * (0.35 + 0.65 * h.z) * h.w;
    }
    hand *= uHandGain;

    gl_FragColor = vec4(max(prev, max(edge, hand)), 0.0, 0.0, 1.0);
  }
`;

export class OutlineFX {
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;

  constructor(
    private gl: THREE.WebGLRenderer,
    width: number,
    height: number,
  ) {
    const mk = () =>
      new THREE.WebGLRenderTarget(width, height, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
      });
    this.rtA = mk();
    this.rtB = mk();
    for (const rt of [this.rtA, this.rtB]) {
      const prev = gl.getRenderTarget();
      gl.setRenderTarget(rt);
      gl.setClearColor(0x000000, 0);
      gl.clear(true, false, false);
      gl.setRenderTarget(prev);
    }
    const c = FX.vision.calib;
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uPrev: { value: this.rtA.texture },
        uMask: { value: null as THREE.Texture | null },
        uAspect: { value: 16 / 9 },
        uCamAspect: { value: 16 / 9 },
        uMirror: { value: FX.vision.mirror ? 1 : 0 },
        uCalib: { value: new THREE.Vector4(c.scaleX, c.scaleY, c.offsetX, c.offsetY) },
        uDecay: { value: 0.9 },
        uZoom: { value: 0 },
        uRise: { value: 0 },
        uSwirl: { value: 0 },
        uTime: { value: 0 },
        uEdgeGain: { value: 1 },
        uEdgeWidth: { value: FX.outlineFX.edgeWidthPx },
        uVis: { value: 1 },
        uHands: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },
        uHandR: { value: FX.outlineFX.handRadius },
        uHandGain: { value: FX.outlineFX.handGain },
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  get texture(): THREE.Texture {
    return this.rtA.texture;
  }
  get texel(): THREE.Vector2 {
    return new THREE.Vector2(1 / this.rtA.width, 1 / this.rtA.height);
  }

  update(opts: {
    mask: THREE.Texture;
    aspect: number;
    camAspect: number;
    visibility: number;
    presence: number;
    hands: HandOut[];
    dt: number;
    time: number;
  }) {
    const O = FX.outlineFX;
    const u = this.material.uniforms;
    u.uPrev!.value = this.rtA.texture;
    u.uMask!.value = opts.mask;
    u.uAspect!.value = opts.aspect;
    u.uCamAspect!.value = opts.camAspect;
    u.uVis!.value = opts.visibility * Math.min(1, opts.presence * 1.5);
    u.uEdgeGain!.value = O.edgeGain;
    // Frame-rate independent feedback: per-second rates → per-frame factors.
    u.uDecay!.value = Math.exp(-opts.dt / O.trailTau);
    u.uZoom!.value = O.zoomPerSec * opts.dt;
    u.uRise!.value = O.risePerSec * opts.dt;
    u.uSwirl!.value = O.swirl * opts.dt;
    u.uTime!.value = opts.time;
    const hv = u.uHands!.value as THREE.Vector4[];
    for (let i = 0; i < 4; i++) {
      const h = opts.hands[i];
      if (h) hv[i]!.set(h.x, h.y, Math.min(1, Math.hypot(h.svx, h.svy) / 0.6), h.strength);
      else hv[i]!.set(0, 0, 0, 0);
    }
    const prev = this.gl.getRenderTarget();
    this.gl.setRenderTarget(this.rtB);
    this.gl.render(this.scene, this.camera);
    this.gl.setRenderTarget(prev);
    const t = this.rtA;
    this.rtA = this.rtB;
    this.rtB = t;
  }

  dispose() {
    this.rtA.dispose();
    this.rtB.dispose();
    this.material.dispose();
    (this.scene.children[0] as THREE.Mesh).geometry.dispose();
  }
}
