"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FX } from "./fx/fxConfig";
import type { GpuRippleSim } from "./fx/GpuRippleSim";
import type { HandWaveController } from "./fx/HandWaveController";
import type { BodyField } from "./fx/BodyField";
import type { OutlineFX } from "./fx/OutlineFX";
import { MAX_CLEAR_ZONES, type ClearZone } from "./fx/clearZones";
import { paintFishSprite } from "./fx/frillyFish";

/** sRGB (0–1) → HSL (0–1 each), for the colour-wheel uniforms. */
function rgbToHsl([r, g, b]: readonly [number, number, number]): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

export type FocusSpot = { x: number; y: number; amount: number };

/** A tapped thought: where it sits, when it appeared / leaves, and how its fish starts. */
export type SurfaceSpot = {
  x: number; // screen uv, y down
  y: number;
  born: number; // performance.now()
  until: number;
  /** 0–1, where beside the words its fish appears */
  seed: number;
  /** +1 / −1, which way the fish circles */
  spin: number;
};
export const MAX_SPOTS = 3;

/** State of the fish swimming beside one thought (aspect space, screen heights). */
type SurfFishState = { x: number; y: number; vx: number; vy: number; swim: number; lane: number; phase: number };

/**
 * One step of the Saskia-site school steering (Boids.tsx "mill"), for a single
 * fish around a thought: swim along a loose ellipse around the words and ease
 * back onto its lane if it drifts off, plus a slow private wander so it never
 * swims a perfect circle. Speed is clamped softly; the tail beats faster the
 * harder it swims.
 */
function stepSurfaceFish(f: SurfFishState, cx: number, cy: number, spin: number, dt: number, t: number) {
  const SF = FX.surfaceFish;
  const speed = SF.speed;
  const rx = SF.ringRx;
  const ry = SF.ringRy;
  const nx = (f.x - cx) / rx;
  const ny = (f.y - cy) / ry;
  const r = Math.hypot(nx, ny) || 1;
  const tx = (-ny / r) * rx * spin;
  const ty = (nx / r) * ry * spin;
  const tl = Math.hypot(tx, ty) || 1;
  const pull = Math.max(-1.5, Math.min(1.5, r - f.lane));
  const dvx = (tx / tl) * speed - (nx / r) * pull * speed * 1.6;
  const dvy = (ty / tl) * speed - (ny / r) * pull * speed * 1.6;
  let ax = (dvx - f.vx) * 2.2;
  let ay = (dvy - f.vy) * 2.2;
  // A slow private wander, so it doesn't swim dead regular.
  ax += Math.cos(t * 0.7 + f.phase) * speed * 0.35;
  ay += Math.sin(t * 0.5 + f.phase * 1.3) * speed * 0.25;
  f.vx += ax * dt;
  f.vy += ay * dt;
  const v = Math.hypot(f.vx, f.vy) || 1;
  const clamped = Math.max(speed * 0.5, Math.min(speed * 1.6, v));
  f.vx = (f.vx / v) * clamped;
  f.vy = (f.vy / v) * clamped;
  f.x += f.vx * dt;
  f.y += f.vy * dt;
  f.swim += dt * (5 + (clamped / speed) * 3);
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Single full-screen composite, back to front:
 *
 *  1. Background  — pristine: darker → medium → light blue on a seamless 15 s cycle,
 *     sampled at a horizontally displaced uv:
 *        x' = x + A·sin(2π·f·y + φ) + Σ sway_hand
 *     (A, f, φ eased by HandWaveController; low f → long, slow swells.)
 *  2. Ripples     — normal from the height field; refraction offsets the
 *     background lookup; soft specular; thin-film iridescence on slopes.
 *  3. Focus pool  — the water deepens a little under revealed text so pure
 *     white type stays legible on a light background.
 *  4. Body echoes — faint outer contour lines (UX feedback, appear first).
 *  5. Body dots   — metaball field → soft droplets, iridescent rims.
 *  6. Core contour line on top.
 *  7. Tapped thoughts — a single translucent-white fish surfaces and circles
 *     each one (no backdrop behind the words).
 *  Plus a Mandy Lai-style dreamy layer in blues: soft hue-shifted colour
 *  clouds that ride the palette loop, faint rising orbs, tiny sparkles.
 *
 * Thin-film iridescence (soap-bubble physics, per RGB wavelength):
 *    sinθt = sinθi / n                        (Snell)
 *    OPD   = 2·n·d·cosθt                      (optical path difference)
 *    R(λ)  = ½ − ½·cos(2π·OPD/λ)              (interference, incl. π shift)
 * evaluated at λ = 650/532/450 nm. cosθi comes from the surface normal vs
 * the view direction (0,0,1); d (thickness) drifts slowly with noise and
 * the local height, so the colours flow over the surface.
 */
const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uAspect;
  uniform vec3 uDark, uMedium, uLight;   // light stops in HSL (h,s,l ∈ 0–1): only in the peeking patches
  uniform vec3 uDarkA, uMediumA, uLightA;   // accessible stops (white text ≥ ~4:1): most of the screen
  uniform float uPatchLo, uPatchHi, uPatchScale, uPatchSpeed, uPatchStr, uTextCalmR;
  uniform float uHueSwing;
  uniform float uCycle, uDrift;
  uniform float uFishSchools, uFishPer, uFishSpeed, uFishSize, uFishA;
  uniform float uCloudStr, uCloudSat, uOrbs, uSparkles, uMaxLift, uIdleShore;
  uniform float uCrestBend, uSheen;
  uniform float uDotLighten, uDotBlend;
  uniform vec3 uCloudHues;              // hue shifts (0–1 turns)
  uniform vec4 uSpots[${MAX_SPOTS}];        // x, y (screen, y down), fade-in amount, unused
  uniform float uSurfSize, uSurfA, uSurfGlow, uSurfBlur;
  uniform vec4 uSurfFish[${MAX_SPOTS}];     // x, y (aspect space), heading (rad), swim phase
  uniform vec2 uPoolR;
  uniform float uTextContrast;   // white-text contrast floor near thoughts
  uniform sampler2D uFishSmall;         // Saskia frilly fish, soft (background / rising)
  uniform sampler2D uFishLarge;         // same fish, crisp (surfaced)

  uniform float uAmp, uFreq, uPhase, uAmpIdle, uAmpMax, uShoreShade;
  uniform vec2 uWaveDir;   // unit travel axis (screen, y down)
  uniform vec4 uHands[4];        // x, y (screen, y down), smoothed vx, strength
  uniform float uSwayRadius, uSwayGain;
  uniform vec4 uHandsV[4];       // smoothed vx, vy (screen, y down)

  uniform sampler2D uSim;
  uniform vec2 uSimTexel;
  uniform float uRefract, uNormalScale, uSpecular;
  uniform float uRippleLineA, uRippleLineW;

  uniform float uFilmIor, uThickMin, uThickMax, uIri;

  uniform sampler2D uField;      // metaball field (screen space)
  uniform vec2 uFieldTexel;
  uniform float uIsoLo, uIsoHi;

  uniform sampler2D uMask;       // camera space: R core, G wide
  uniform float uCamAspect, uMirror;
  uniform vec4 uCalib;           // scaleX, scaleY, offsetX, offsetY
  uniform float uContourA, uEchoA, uLineW, uPresence;

  uniform vec4 uClear[${MAX_CLEAR_ZONES}];   // x, y (screen, y down), rx, ry
  uniform float uClearFloor;
  uniform vec4 uFocus;           // x, y (screen, y down), radius, amount
  uniform sampler2D uOutline;    // OutlineFX feedback buffer (R)
  uniform vec2 uOutlineTexel;
  uniform float uOutCore, uOutGlow, uOutA;
  uniform sampler2D uText;

  varying vec2 vUv;
  const float TAU = 6.28318530718;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 1.7; a *= 0.5; }
    return v;
  }

  // ---- 1. background: 3-minute "night to day" loop ------------------------
  //
  // uCycle c ∈ [0,1) = (t mod 180)/180, computed on the CPU.
  // Day-ness d(c) is a plateau that is 0 at c = 0 and c → 1 (seamless):
  //   d = smoothstep(0, rise, c) · (1 − smoothstep(fall, 1, c))
  // smoothstep has zero slope at both ends, so the loop point is smooth.
  // d 0 → ½ blends dark → medium, ½ → 1 medium → light (in HSL, hue along
  // the shortest arc). On the plateau the water lingers in the daytime
  // blues, wandering gently between light and medium-light so it stays alive.
  vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
  }
  vec3 mixHsl(vec3 a, vec3 b, float t) {
    float dh = fract(b.x - a.x + 0.5) - 0.5;           // shortest way round
    return vec3(fract(a.x + dh * t), mix(a.yz, b.yz, t));
  }

  // Palette walk: a seamless loop dark → medium → light → medium → dark.
  //   k = ½ − ½·cos(2πc)   (0 = dark, ½ = medium, 1 = light)
  vec3 paletteHslS(float c, vec3 sd, vec3 sm, vec3 sl) {
    float k = 0.5 - 0.5 * cos(TAU * c);
    vec3 hsl = k < 0.5 ? mixHsl(sd, sm, smoothstep(0.0, 0.5, k))
                       : mixHsl(sm, sl, smoothstep(0.5, 1.0, k));
    hsl.x = fract(hsl.x + uHueSwing * sin(TAU * 2.0 * c));
    return hsl;
  }
  vec3 paletteHsl(float c) { return paletteHslS(c, uDarkA, uMediumA, uLightA); }
  vec3 paletteAt(float c) { return hsl2rgb(paletteHsl(c)); }

  // ---- readable water under text -----------------------------------------
  // WCAG relative luminance (sRGB → linear).
  float relLum(vec3 c) {
    vec3 l = mix(c / 12.92, pow((max(c, 0.0) + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
    return dot(l, vec3(0.2126, 0.7152, 0.0722));
  }


  // ---- Mandy Lai-style soft colour clouds, in blues ----------------------
  // Three big gaussian clouds drift very slowly. Each is the local gradient
  // colour, hue-shifted (violet / teal / orchid) at the SAME lightness, so the
  // clouds ride the same 5-minute colour loop and never lower text contrast.
  float cloudW(vec2 p, vec2 c, float r) { vec2 d = p - c; return exp(-dot(d, d) / (r * r)); }
  vec3 shiftHue(vec3 hsl, float dh) {
    return hsl2rgb(vec3(fract(hsl.x + dh), clamp(hsl.y + uCloudSat, 0.0, 1.0), hsl.z));
  }

  // ---- background: two-colour contrast gradient, 5-minute drift --------
  // Two colours from OPPOSITE points of the palette loop (phase c and
  // c + ½), so whenever one end is dark the other is light — the gradient
  // always has contrast. Over 5 minutes both ends travel the loop, so the
  // pair slowly swaps and passes through every blue in between:
  //   0 min  dark top  → light bottom
  //   1¼ min medium     → medium-ish (softest contrast)
  //   2½ min light top → dark bottom
  //   5 min  back to the start (seamless).
  // The blend runs mostly top → bottom with a slight diagonal and a soft
  // S-curve, plus the faint broad swell so hand waves stay readable.
  vec3 bgFrom(vec2 uv, vec3 sd, vec3 sm, vec3 sl) {
    vec2 s0 = vec2(uv.x, 1.0 - uv.y);
    vec3 ha = paletteHslS(uCycle, sd, sm, sl);
    vec3 hb = paletteHslS(uCycle + 0.5, sd, sm, sl);
    vec3 a = hsl2rgb(ha);
    vec3 b = hsl2rgb(hb);
    float g = clamp(s0.y * 0.85 + s0.x * 0.15, 0.0, 1.0);
    g = smoothstep(0.0, 1.0, g);
    vec3 col = mix(a, b, g);
    if (uCloudStr > 0.0) {
      vec3 hl = mixHsl(ha, hb, g);
      vec2 p = vec2(uv.x * uAspect, uv.y);
      float ct = uTime;
      vec2 c1 = vec2((0.25 + 0.18 * sin(ct * 0.031)) * uAspect, 0.30 + 0.16 * cos(ct * 0.027));
      vec2 c2 = vec2((0.78 + 0.15 * cos(ct * 0.024 + 1.0)) * uAspect, 0.72 + 0.14 * sin(ct * 0.029 + 2.0));
      vec2 c3 = vec2((0.60 + 0.20 * sin(ct * 0.019 + 4.0)) * uAspect, 0.22 + 0.12 * sin(ct * 0.033));
      col = mix(col, shiftHue(hl, uCloudHues.x), uCloudStr * cloudW(p, c1, 0.55));
      col = mix(col, shiftHue(hl, uCloudHues.y), uCloudStr * 0.85 * cloudW(p, c2, 0.6));
      col = mix(col, shiftHue(hl, uCloudHues.z), uCloudStr * 0.75 * cloudW(p, c3, 0.45));
    }
    float t = uTime * uDrift;
    float swell = noise(vec2(uv.x * 1.2 + t * 0.4, uv.y * 0.5 - t)) - 0.5;
    col *= 1.0 + swell * 0.08;
    return col;
  }

  // ---- light gradients: where the original light blues show through ----
  // Most of the water uses the accessible deep stops. Three very broad,
  // slow sine swells crossing at different angles add up to a smooth field;
  // where they meet, the water eases into the original light aqua and back
  // out again — wide soft gradients drifting across, no edges or clouds.
  float lightPatch(vec2 uv) {
    float t = uTime * uPatchSpeed;
    vec2 p = vec2(uv.x * uAspect, uv.y) * uPatchScale;
    float g = sin(dot(p, vec2(0.92, 0.39)) * 2.1 + t)
            + sin(dot(p, vec2(-0.48, 0.88)) * 1.7 - t * 0.83 + 1.7)
            + sin(dot(p, vec2(0.21, -0.98)) * 2.6 + t * 0.61 + 4.2);
    float n = g / 6.0 + 0.5;                         // 0–1, smooth everywhere
    return smoothstep(uPatchLo, uPatchHi, n);
  }
  // 0 near a thought that is showing (light gaps there slowly close), 1 elsewhere.
  // A wide, soft falloff that only thins the patches — never a visible shape.
  float textCalm(vec2 s0) {
    float k = 1.0;
    for (int i = 0; i < ${MAX_SPOTS}; i++) {
      vec4 sp = uSpots[i];
      if (sp.w <= 0.001) continue;
      vec2 d = (s0 - sp.xy) * vec2(uAspect, 1.0) / uTextCalmR;
      k *= 1.0 - sp.w * exp(-dot(d, d));
    }
    return k;
  }
  vec3 background(vec2 uv) {
    vec3 deep = bgFrom(uv, uDarkA, uMediumA, uLightA);
    float m = lightPatch(uv) * uPatchStr * textCalm(vec2(uv.x, 1.0 - uv.y));
    if (m <= 0.001) return deep;
    return mix(deep, bgFrom(uv, uDark, uMedium, uLight), m);
  }

  // ---- ambient fish schools (deep, decorative, NON-interactive) ----------
  // Each school travels a meandering flow path P(t):
  //   x(t) = wrap(x0 + dir·v·t),   y(t) = y0 + 0.08·sin(0.07t+a) + 0.04·sin(0.13t+b)
  // Fish j sits at P(t − lag_j) + side_j · n̂ (n̂ = path normal) plus a small
  // individual sway — so the school strings out along the current and every
  // fish follows the same flow, like a real school. Heading = P'(t − lag_j).
  // Returns coverage 0–1; the caller tints it as darker, faded background.
  float fishSDF(vec2 q, float size, float wagPhase) {
    float wag = 0.3 * sin(uTime * 2.2 + wagPhase);
    float body = (length(q / vec2(size, size * 0.38)) - 1.0) * size * 0.38;
    vec2 tq = q + vec2(size * 0.95, 0.0);
    float u = -tq.x;
    float tail = max(abs(tq.y - wag * u) - u * 0.7, max(-u, u - size * 0.6));
    return min(body, tail);
  }

  // ---- Saskia's frilly fish, as a sprite --------------------------------
  // q is in the fish's own frame (x = forward, y = toward its belly side),
  // in screen-height units; size = half the body length. The sprite faces
  // left with the body centred at (37, 30) in a 120 × 62 box. The swim
  // wobble is a travelling wave down the body that grows toward the tail,
  // so the veil tail and frills sway behind a calmer head.
  float fishSprite(sampler2D tex, vec2 q, float size, float phase) {
    float k = size / 29.0;
    float X = 37.0 - q.x / k;
    float Y = 30.0 + q.y / k;
    float behind = max(X - 48.0, 0.0);
    Y -= sin(phase - X * 0.07) * (0.8 + behind * 0.1);
    vec2 uv = vec2(X / 120.0, Y / 62.0);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
    return texture2D(tex, uv).a;
  }

  // Natural schools: each school's leader wanders the whole screen along a
  // smooth Lissajous-style path (incommensurate sines in x and y, so it never
  // repeats or snaps), cruising speed breathing gently. Fish follow the same
  // path a little behind each other (lag), spread sideways in a loose,
  // slowly shifting formation, each with its own wobble — so the school
  // bends, stretches and turns together like real fish.
  vec2 schoolPath(float tau, float fk) {
    float a = hash(vec2(fk, 1.3)) * TAU, b = hash(vec2(fk, 2.9)) * TAU;
    float c = hash(vec2(fk, 4.1)) * TAU, d = hash(vec2(fk, 6.7)) * TAU;
    float x = sin(tau + a) * 0.62 + sin(tau * 2.37 + b) * 0.28;
    float y = sin(tau * 1.31 + c) * 0.58 + sin(tau * 0.71 + d) * 0.3;
    return vec2((0.5 + 0.44 * x) * uAspect, 0.5 + 0.4 * y);
  }

  float fishSchools(vec2 s) {
    vec2 p = vec2(s.x * uAspect, s.y);              // aspect-correct, y down
    float t = uTime;
    float cover = 0.0;
    for (int k = 0; k < 6; k++) {
      float fk = float(k);
      if (fk >= uFishSchools) break;
      float sp = uFishSpeed * (0.75 + 0.5 * hash(vec2(fk, 8.3)));
      // Path "time": cruising speed eases up and down a little.
      float tau = t * sp + 0.35 * sin(t * 0.045 + fk * 2.0) + fk * 17.0;
      vec2 lead = schoolPath(tau, fk);
      if (length(p - lead) > 0.4) continue;           // cheap bounding test
      float depth = 0.6 + 0.4 * hash(vec2(fk, 9.7));  // further schools are smaller / fainter
      for (int j = 0; j < 12; j++) {
        float fj = float(j);
        if (fj >= uFishPer) break;
        float r1 = hash(vec2(fk * 13.0 + fj, 1.1));
        float r2 = hash(vec2(fk * 13.0 + fj, 4.4));
        float tj = tau - (fj * 0.03 + r1 * 0.025);    // follow the leader's path
        vec2 c = schoolPath(tj, fk);
        // Skip fish nowhere near this pixel before the costlier maths.
        vec2 dc0 = p - c;
        if (dot(dc0, dc0) > 0.012) continue;
        vec2 ahead = schoolPath(tj + 0.004, fk);
        vec2 head = normalize(ahead - c + 1e-6);
        vec2 nrm = vec2(-head.y, head.x);
        // Loose formation: side offset that slowly breathes, plus a tiny wobble.
        float side = (r2 - 0.5) * 0.06 * (1.0 + 0.35 * sin(t * 0.21 + fj * 1.7 + fk));
        c += nrm * side + head * 0.006 * sin(t * 0.5 + r1 * 20.0);
        // Body sways a few degrees as it swims.
        float yaw = 0.12 * sin(t * 1.6 + r2 * 12.0);
        head = vec2(head.x * cos(yaw) - head.y * sin(yaw), head.x * sin(yaw) + head.y * cos(yaw));
        nrm = vec2(-head.y, head.x);
        vec2 q = p - c;
        if (dot(q, q) > 0.004) continue;
        float flip = head.x < 0.0 ? -1.0 : 1.0;       // keep the belly down
        q = vec2(dot(q, head), dot(q, nrm) * flip);  // into the fish's frame
        float sz = uFishSize * depth * (0.8 + 0.4 * r1);
        float a = fishSprite(uFishSmall, q, sz, t * (3.2 + r1) + fj * 1.7 + fk);
        cover = max(cover, depth * a);
      }
    }
    return cover;
  }

  // ---- faint glowing rings drifting upward (the soft orbs in the reference) ---
  float orbs(vec2 p) {
    float o = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float x = (0.12 + fract(fi * 0.37 + 0.11) * 0.8) * uAspect + 0.04 * sin(uTime * 0.05 + fi);
      float y = 1.2 - fract(fi * 0.29 + uTime * (0.004 + fi * 0.0012)) * 1.4;
      float r = 0.07 + fract(fi * 0.53) * 0.12;
      float d = length(p - vec2(x, y));
      float rim = smoothstep(r * 0.86, r, d) * (1.0 - smoothstep(r, r * 1.12, d));
      o += rim + (1.0 - smoothstep(0.0, r, d)) * 0.25;
    }
    return o;
  }

  // ---- tiny twinkling four-point stars ----------------------------------------
  float sparkles(vec2 p) {
    float sp = 0.0;
    vec2 grid = p * 14.0;
    vec2 cell = floor(grid);
    for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 cc = cell + vec2(float(i), float(j));
      float hh = hash(cc);
      if (hh < 0.86) continue;
      vec2 pos = cc + vec2(hash(cc + 3.1), hash(cc + 7.7));
      vec2 d = (grid - pos) * 14.0;
      float tw = 0.5 + 0.5 * sin(uTime * (0.6 + hh * 1.2) + hh * 40.0);
      tw *= tw;
      float core = exp(-dot(d, d) * 0.8);
      float rays = exp(-abs(d.x) * 1.6) * exp(-d.y * d.y * 0.6)
                 + exp(-abs(d.y) * 1.6) * exp(-d.x * d.x * 0.6);
      sp += (core + rays * 0.35) * tw * (0.5 + 0.5 * hh);
    }
    return sp;
  }

  // ---- the one fish that surfaces beside a tapped thought ---------------------
  // Its position, heading and tail-beat come from a small steering sim on the
  // CPU (same rules as the Saskia site's schools — see stepSurfaceFish). Here it
  // is only drawn: it fades up right beside the words, soft → crisp, solid white.
  // x = cover, y = glow.
  vec2 surfaceFish(vec2 p, vec4 spot, vec4 fish) {
    float amt = spot.z;
    if (amt <= 0.001) return vec2(0.0);
    float swim = fish.w;
    // The head yaws against the tail stroke, so the whole body swims.
    float ang = fish.z + sin(swim) * 0.05;
    vec2 head = vec2(cos(ang), sin(ang));
    vec2 nrm = vec2(-head.y, head.x);
    vec2 q = p - fish.xy;
    float d2 = dot(q, q);
    if (d2 > 0.03) return vec2(0.0);
    float flip = head.x < 0.0 ? -1.0 : 1.0;          // keep the belly down
    q = vec2(dot(q, head), dot(q, nrm) * flip);
    float sz = uSurfSize * (0.85 + 0.15 * amt);
    // Soft sprite while it rises → crisp, solid fish once surfaced.
    float aSoft = fishSprite(uFishSmall, q, sz, swim);
    float aSharp = fishSprite(uFishLarge, q, sz, swim);
    // Soft (blurred) while rising, settling to a slightly blurry fish (uSurfBlur).
    float cover = mix(aSoft * 0.7, mix(aSharp, aSoft, uSurfBlur), smoothstep(0.25, 0.9, amt));
    // Soft glow: the fish's own shape blurred outward (soft sprite at a larger
    // size), plus a faint round halo.
    float halo = fishSprite(uFishSmall, q, sz * 1.35, swim);
    float glow = clamp(halo * 0.7 + exp(-sqrt(d2) / (sz * 2.2)) * 0.5, 0.0, 1.0);
    return vec2(cover * amt, glow * amt);
  }

  vec3 thinFilm(float cosI, float d) {
    float sinT2 = (1.0 - cosI * cosI) / (uFilmIor * uFilmIor);
    float cosT = sqrt(max(0.0, 1.0 - sinT2));
    float opd = 2.0 * uFilmIor * d * cosT;
    return 0.5 - 0.5 * cos(TAU * opd / vec3(650.0, 532.0, 450.0));
  }

  // Apply iridescence as a gentle hue shift around the existing colour.
  vec3 iridesce(vec3 col, vec3 n, float weight, float hOffset, vec2 p) {
    float cosI = clamp(n.z, 0.0, 1.0);
    float d = mix(uThickMin, uThickMax, noise(p * 2.2 + uTime * 0.03)) + hOffset;
    vec3 film = thinFilm(cosI, d);
    // Pastel: pull the film colour halfway to grey, then shift around it.
    film = mix(vec3(dot(film, vec3(0.3333))), film, 0.55);
    return col + (film - 0.42) * weight * uIri;
  }

  vec2 screenToCam(vec2 s) {
    float m = uMirror > 0.5 ? 1.0 - s.x : s.x;
    float k = uAspect / uCamAspect;
    vec2 c = k < 1.0 ? vec2(0.5 + (m - 0.5) * k, s.y) : vec2(m, 0.5 + (s.y - 0.5) / k);
    return 0.5 + (c - 0.5) * uCalib.xy + uCalib.zw;
  }

  // Anti-aliased iso-line of a scalar field, constant width in pixels.
  float isoLine(float v, float iso, float widthPx) {
    float w = max(fwidth(v), 1e-4);
    return 1.0 - smoothstep(0.0, widthPx, abs(v - iso) / w);
  }

  // 1 outside every text zone → uClearFloor inside one (soft ellipse edge).
  float clearMul(vec2 s) {
    float m = 1.0;
    for (int i = 0; i < ${MAX_CLEAR_ZONES}; i++) {
      vec4 z = uClear[i];
      if (z.z <= 0.0) continue;
      float e = length((s - z.xy) / z.zw);
      float inside = 1.0 - smoothstep(0.7, 1.15, e);
      m *= 1.0 - (1.0 - uClearFloor) * inside;
    }
    return m;
  }

  void main() {
    vec2 s = vec2(vUv.x, 1.0 - vUv.y);   // screen uv, y down
    float textClear = clearMul(s);

    // ---- hand-driven horizontal waves -----------------------------------
    // Hand-driven "shore" waves across the WHOLE page. Wave crests are
    // vertical-ish bands that travel sideways in the direction the hands
    // moved (uPhase is integrated with that direction), slowly, and only as
    // strongly as the hands have been moving (uAmp eases up with motion and
    // back down when it stops). Each crest wobbles: its position bends with
    // a slow vertical sine, and the surface is lifted up/down as well as
    // pushed along, so the smooth gradient visibly ripples.
    // Coordinates along the travel axis and across it (aspect-correct).
    vec2 ps = (s - 0.5) * vec2(uAspect, 1.0);
    float sx = dot(ps, uWaveDir);
    float sy = dot(ps, vec2(-uWaveDir.y, uWaveDir.x));
    // Crests stay upright: only a slight, slow curve so they look natural.
    float bend = uCrestBend * (sin(TAU * 0.45 * sy + uPhase * 0.35)
               + 0.4 * sin(TAU * 1.1 * sy - uPhase * 0.6));
    float arg = TAU * uFreq * (sx + bend) - uPhase;
    float wave = sin(arg) + 0.35 * sin(arg * 1.9 + 1.3);
    vec2 dGL = vec2(uWaveDir.x, -uWaveDir.y);          // → gl y-up
    vec2 pGL = vec2(-dGL.y, dGL.x);
    // No page warp any more: the hand waves are shown as COLOUR only
    // (see "shallow-water swell" below). warp stays as a tiny residual so
    // the water never looks frozen, but nothing visibly wobbles.
    // Push ALONG the travel direction only. (The old sideways cos term was
    // 90° out of phase with this one, so every point moved in a small
    // circle — that made the whole page look like it was turning.)
    vec2 warp = uAmp * 0.15 * dGL * 0.45 * wave;
    // How strongly the hands are moving the page (0 idle → 1 vigorous).
    float shoreE = clamp((uAmp - uAmpIdle) / max(uAmpMax - uAmpIdle, 1e-4), 0.0, 1.0);
    // Gentle waves at rest: the shore bands never fully stop.
    shoreE = max(shoreE, uIdleShore);
    for (int i = 0; i < 4; i++) {
      vec4 hd = uHands[i];
      if (hd.w <= 0.0) continue;
      vec2 rel = (s - hd.xy) * vec2(uAspect, 1.0) / uSwayRadius;
      vec2 hv = clamp(uHandsV[i].xy, vec2(-1.5), vec2(1.5)) * vec2(1.0, -1.0); // → gl y-up
      warp += hv * uSwayGain * exp(-dot(rel, rel)) * hd.w;
    }

    // ---- 2. ripples -----------------------------------------------------
    // Surface height = hand wakes (R) + tap ripples (B).
    vec4 s0 = texture2D(uSim, vUv);
    float h  = s0.r + s0.b;
    vec4 sL = texture2D(uSim, vUv - vec2(uSimTexel.x, 0.0));
    vec4 sR = texture2D(uSim, vUv + vec2(uSimTexel.x, 0.0));
    vec4 sD = texture2D(uSim, vUv - vec2(0.0, uSimTexel.y));
    vec4 sU = texture2D(uSim, vUv + vec2(0.0, uSimTexel.y));
    float hL = sL.r + sL.b;
    float hR = sR.r + sR.b;
    float hD = sD.r + sD.b;
    float hU = sU.r + sU.b;
    vec2 grad = vec2(hR - hL, hU - hD);
    vec3 n = normalize(vec3(-grad * uNormalScale, 1.0));

    vec2 uv = vUv + warp + n.xy * uRefract;
    vec3 col = background(uv);
    // Shore light: the travelling crests catch a little light and the
    // troughs dim, so the page-wide waves read as soft bands sweeping
    // across in the direction of motion. Fades to nothing when hands rest.
    // Shallow-water swell: as each broad crest passes, the water over it
    // turns a touch lighter and more turquoise — like a wave lifting over
    // a sandbar toward the shore — with a whisper of foam-light on the
    // leading edge, and slightly deeper blue in the trough behind it.
    {
      float crest = smoothstep(0.35, 1.0, sin(arg));                 // broad lifted band
      float lead  = smoothstep(0.82, 1.0, sin(arg + 0.55)) * 0.5;     // thin bright front
      float trough = smoothstep(0.4, 1.0, -sin(arg));
      vec3 shallow = col * vec3(0.92, 1.10, 1.06) + vec3(0.03, 0.07, 0.06);
      float k = uShoreShade * shoreE;
      col = mix(col, shallow, k * crest * 2.2);
      col += vec3(0.75, 0.92, 1.0) * k * lead * 0.35;
      col *= 1.0 - k * trough * 0.35;
      // Soft sheen: a wide, gentle glow riding each crest, plus a slow
      // long-wavelength shimmer across the whole page, like light on water.
      float glow = pow(0.5 + 0.5 * sin(arg - 0.3), 3.0);
      float drift = 0.5 + 0.5 * sin(TAU * 0.18 * (sx + 0.3 * sy) - uPhase * 0.4);
      col += vec3(0.85, 0.95, 1.0) * uSheen * (0.35 + 0.65 * shoreE) * (glow * 0.75 + drift * 0.25);
    }

    // Deep fish schools at the RAW screen position (no warp / refraction):
    // a darker, faded shade of the current water, so they always sit below
    // the surface whatever the time of "day".
    // Dreamy light: faint rising orbs, capped so the water never gets too light.
    vec2 pa = vec2(s.x * uAspect, s.y);
    if (uOrbs > 0.0) col = mix(col, vec3(0.91, 0.96, 1.0), min(orbs(pa) * uOrbs, uMaxLift));

    // Very faint translucent-white fish, few and small.
    float fsh = fishSchools(s);
    col = mix(col, vec3(0.96, 0.98, 1.0), fsh * uFishA);

    vec3 L = normalize(vec3(-0.3, 0.5, 1.0));
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 40.0);
    col += vec3(1.0) * spec * uSpecular * smoothstep(0.0, 0.02, length(grad));
    // Film angle uses an exaggerated normal: a projected surface is flat,
    // so true view-angle variation is tiny; this keeps the physics' colour
    // ordering while making it visible on ripple flanks.
    vec3 nIri = normalize(vec3(-grad * uNormalScale * 6.0, 1.0));
    float rippleW = 0.8 * smoothstep(0.003, 0.04, length(grad));
    col = iridesce(col, nIri, rippleW, h * 120.0, s);

    // Ripple outlines: a thin hairline where the surface crosses its rest
    // level (h = 0), i.e. along every ring of a ripple — the same delicate,
    // iridescent line language as the body outline. Weighted by the local
    // slope so the lines fade out smoothly as the ripple dies away.
    float rl = isoLine(h, 0.0, uRippleLineW);
    float rlW = smoothstep(0.004, 0.03, length(grad));
    vec3 rlCol = iridesce(vec3(0.95, 0.98, 1.0), nIri, 0.9, h * 200.0, s * 2.0);
    col = mix(col, rlCol, rl * rlW * uRippleLineA);

    // (No darkened pool behind revealed text: type sits cleanly on the water.)

    // ---- 4. body echo contours (fast; appear before the dots) -----------
    vec2 cu = screenToCam(s);
    bool inCam = all(greaterThanEqual(cu, vec2(0.0))) && all(lessThanEqual(cu, vec2(1.0)));
    vec2 mk = inCam ? texture2D(uMask, cu).rg : vec2(0.0);
    if (uPresence > 0.001) {
      float breathe = 0.03 * sin(uTime * 0.5);
      float e1 = isoLine(mk.g, 0.30 + breathe, uLineW);
      float e2 = isoLine(mk.g, 0.12 + breathe * 0.6, uLineW * 0.9);
      vec3 lineCol = iridesce(vec3(1.0), normalize(vec3(0.6, 0.3, 0.75)), 0.8, mk.g * 200.0, s * 3.0);
      col = mix(col, lineCol, (e1 * uEchoA + e2 * uEchoA * 0.55) * uPresence * textClear);
    }

    // ---- 5. bubbles beneath the surface ------------------------------------
    // The field is sampled through the water: the page waves and the ripple
    // slope bend where the bubbles appear (stronger than the background, as
    // if they sit deeper), so they wobble with every wave and tap.
    vec2 fuv = vUv + warp * 0.5 + n.xy * uRefract * 0.8;
    float f  = texture2D(uField, fuv).r;
    // Faint blend: a very soft, pale-blue veil where neighbouring dots'
    // fields overlap, so the dots melt into each other instead of sitting
    // as separate discs. Lighter than the water, never darker.
    if (f > 0.01 && uDotBlend > 0.0) {
      vec3 veilUnder = background(fuv + warp);
      vec3 veil = mix(veilUnder, vec3(0.80, 0.91, 1.0), 0.45);
      float vk = smoothstep(0.03, uIsoLo + 0.15, f) * uDotBlend * textClear;
      col = mix(col, veil, vk);
    }
    if (f > 0.02) {
      vec4 fv = texture2D(uField, fuv);
      float op = clamp(fv.g / max(f, 1e-3), 0.0, 1.0);
      float spark = clamp(fv.b / max(f, 1e-3), 0.0, 1.0);
      float body = smoothstep(uIsoLo, uIsoHi, f);
      // Solid, evenly filled dots (no rim, no clear centre).
      float a = body * mix(op, 1.0, spark * 0.3) * textClear;
      // Soft opaque white tinted by the water behind it: the same colour as
      // the background, just lighter, so it changes as the gradient cycles.
      vec3 under = background(fuv + warp);
      vec3 drop = mix(under, vec3(1.0), uDotLighten + spark * 0.1);
      col = mix(col, drop, a);
    }

    // ---- TouchDesigner-style outline: core line + two-radius blur glow ----
    //   core  = the feedback buffer itself (crisp edge + fading trails)
    //   glow  = 8 taps at ~2 px and ~6 px (Blur TOP), added on top
    // Tinted with the same thin-film iridescence, added (screen-like) so it
    // reads as light on the water.
    if (uOutA > 0.0) {
      vec2 t1 = uOutlineTexel * 1.5, t2 = uOutlineTexel * 4.5;
      float oc = texture2D(uOutline, vUv).r;
      float g1 = (texture2D(uOutline, vUv + vec2(t1.x, 0.0)).r + texture2D(uOutline, vUv - vec2(t1.x, 0.0)).r
                + texture2D(uOutline, vUv + vec2(0.0, t1.y)).r + texture2D(uOutline, vUv - vec2(0.0, t1.y)).r) * 0.25;
      float g2 = (texture2D(uOutline, vUv + t2).r + texture2D(uOutline, vUv - t2).r
                + texture2D(uOutline, vUv + vec2(t2.x, -t2.y)).r + texture2D(uOutline, vUv + vec2(-t2.x, t2.y)).r) * 0.25;
      float neon = oc * uOutCore + (g1 * 0.6 + g2 * 0.4) * uOutGlow;
      vec3 neonCol = iridesce(vec3(0.78, 0.95, 1.0), normalize(vec3(0.4, -0.3, 0.8)), 1.2, oc * 300.0, s * 2.0);
      col += neonCol * neon * uOutA * textClear;
    }

    // ---- 6. core contour line --------------------------------------------
    if (uPresence > 0.001) {
      float c0 = isoLine(mk.r, 0.5, uLineW);
      vec3 lineCol = iridesce(vec3(1.0), normalize(vec3(0.5, -0.4, 0.77)), 0.7, 0.0, s * 2.0);
      col = mix(col, lineCol, c0 * uContourA * uPresence * textClear);
    }

    // ---- readability floor right under thoughts ----------------------------
    // The deep water already passes for white text; this only tones down
    // brief highlights (wave light, sheen, dots) close to the words, by
    // scaling brightness — no shape, no colour change.
    {
      float near = 1.0 - textCalm(s);
      if (near > 0.001) {
        float tY = 1.05 / uTextContrast - 0.05;
        float Y = relLum(col);
        if (Y > tY) {
          vec3 lin = pow(max(col, 0.0), vec3(2.2)) * (tY / Y);
          col = mix(col, pow(lin, vec3(1.0 / 2.2)), near);
        }
      }
    }

    // ---- tapped thoughts: one surfaced fish each (no backdrop behind text) ---
    for (int i = 0; i < ${MAX_SPOTS}; i++) {
      vec2 sf = surfaceFish(pa, uSpots[i], uSurfFish[i]);
      col = mix(col, vec3(0.91, 0.96, 1.0), sf.y * uSurfGlow);
      col = mix(col, vec3(0.96, 0.98, 1.0), sf.x * uSurfA);
    }

    // Tiny sparkles (kept out of the deepened pools under text).
    if (uSparkles > 0.0) {
      float sk = clamp(sparkles(pa), 0.0, 1.0) * uSparkles;
      for (int i = 0; i < ${MAX_SPOTS}; i++) {
        vec4 sp = uSpots[i];
        if (sp.z <= 0.001) continue;
        sk *= 1.0 - sp.z * (1.0 - smoothstep(0.5, 1.0, length((s - sp.xy) / uPoolR)));
      }
      col = mix(col, vec3(0.96, 0.98, 1.0), sk);
    }

    // Teaser text is NOT moved by hand motion: no swell / hand-drag warp,
    // and only a little of the ripple refraction (tap ripples still bend it
    // gently; a passing hand wake barely nudges it).
    vec2 tuv = vUv + n.xy * uRefract * 0.35;
    vec4 text = texture2D(uText, clamp(tuv, 0.001, 0.999));
    col = mix(col, text.rgb, text.a);

    // Dither: kills 8-bit banding on large smooth gradients (projectors!).
    col += (hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function WaterPlane({
  sim,
  waves,
  body,
  outline,
  textTexture,
  aspect,
  camAspect,
  focusRef,
  clearZonesRef,
  spotsRef,
}: {
  sim: GpuRippleSim | null;
  waves: HandWaveController;
  body: BodyField | null;
  outline?: OutlineFX | null;
  textTexture: THREE.CanvasTexture | null;
  aspect: number;
  camAspect: () => number;
  focusRef?: React.RefObject<FocusSpot | null>;
  clearZonesRef?: React.RefObject<ClearZone[]>;
  spotsRef?: React.RefObject<SurfaceSpot[]>;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  /** Fish beside each thought, keyed by the thought's birth time. */
  const surfFishRef = useRef(new Map<number, SurfFishState>());

  const blank = useMemo(() => {
    const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    t.needsUpdate = true;
    return t;
  }, []);

  // Saskia's frilly fish as two sprites: soft/small for the faint background
  // schools and a rising fish, crisp/large for the surfaced one. No mipmaps,
  // so sampling stays valid inside the shader's loops.
  const fishSprites = useMemo(() => {
    const mk = (c: HTMLCanvasElement) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.NoColorSpace;
      t.flipY = false;
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.wrapS = THREE.ClampToEdgeWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
      t.needsUpdate = true;
      return t;
    };
    return {
      small: mk(paintFishSprite(128, 66, 1.2)),
      large: mk(paintFishSprite(512, 264)),
    };
  }, []);
  useEffect(
    () => () => {
      fishSprites.small.dispose();
      fishSprites.large.dispose();
    },
    [fishSprites],
  );

  const uniforms = useMemo(() => {
    const B = FX.background;
    const c = FX.vision.calib;
    return {
      uTime: { value: 0 },
      uAspect: { value: 16 / 9 },
      uDark: { value: new THREE.Vector3(...rgbToHsl(B.dark)) },
      uMedium: { value: new THREE.Vector3(...rgbToHsl(B.medium)) },
      uLight: { value: new THREE.Vector3(...rgbToHsl(B.light)) },
      uDarkA: { value: new THREE.Vector3(...rgbToHsl(B.accessible.dark)) },
      uMediumA: { value: new THREE.Vector3(...rgbToHsl(B.accessible.medium)) },
      uLightA: { value: new THREE.Vector3(...rgbToHsl(B.accessible.light)) },
      uPatchLo: { value: B.lightPatches.lo },
      uPatchHi: { value: B.lightPatches.hi },
      uPatchScale: { value: B.lightPatches.scale },
      uPatchSpeed: { value: B.lightPatches.speed },
      uPatchStr: { value: B.lightPatches.strength },
      uHueSwing: { value: B.hueSwing / 360 },
      uFishSchools: { value: FX.fish.schools },
      uFishPer: { value: FX.fish.perSchool },
      uFishSpeed: { value: FX.fish.speed },
      uFishSize: { value: FX.fish.size },
      uFishA: { value: FX.fish.alpha },
      uCloudStr: { value: B.clouds.strength },
      uCloudHues: {
        value: new THREE.Vector3(...B.clouds.hues.map((d) => d / 360)),
      },
      uCloudSat: { value: B.clouds.saturate },
      uOrbs: { value: B.orbs },
      uSparkles: { value: B.sparkles },
      uMaxLift: { value: B.maxLift },
      uIdleShore: { value: FX.waves.idleShore },
      uCrestBend: { value: FX.waves.crestBend },
      uSheen: { value: FX.waves.sheen },
      uDotLighten: { value: FX.body.dotLighten },
      uDotBlend: { value: FX.body.dotBlend },
      uSpots: { value: Array.from({ length: MAX_SPOTS }, () => new THREE.Vector4()) },
      uSurfSize: { value: FX.surfaceFish.size },
      uSurfA: { value: FX.surfaceFish.alpha },
      uSurfGlow: { value: FX.surfaceFish.glow },
      uSurfBlur: { value: FX.surfaceFish.blur },
      uSurfFish: { value: Array.from({ length: MAX_SPOTS }, () => new THREE.Vector4()) },
      uPoolR: { value: new THREE.Vector2(...FX.tapThoughts.poolRadius) },
      uTextContrast: { value: FX.tapThoughts.textContrast },
      uTextCalmR: { value: FX.tapThoughts.calmRadius },
      uFishSmall: { value: fishSprites.small as THREE.Texture },
      uFishLarge: { value: fishSprites.large as THREE.Texture },
      uCycle: { value: 0 },
      uDrift: { value: B.drift },
      uAmp: { value: 0 },
      uAmpIdle: { value: FX.waves.ampIdle },
      uAmpMax: { value: FX.waves.ampMax },
      uShoreShade: { value: FX.waves.shoreShade },
      uFreq: { value: 0.5 },
      uPhase: { value: 0 },
      uWaveDir: { value: new THREE.Vector2(1, 0) },
      uHands: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },
      uSwayRadius: { value: FX.waves.handSwayRadius },
      uSwayGain: { value: FX.waves.handSwayGain },
      uHandsV: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },
      uSim: { value: blank as THREE.Texture },
      uSimTexel: { value: new THREE.Vector2(1 / 256, 1 / 144) },
      uRefract: { value: FX.ripples.refraction },
      uNormalScale: { value: FX.ripples.normalScale },
      uSpecular: { value: FX.ripples.specular },
      uRippleLineA: { value: FX.ripples.outlineAlpha },
      uRippleLineW: { value: FX.ripples.outlineWidthPx },
      uFilmIor: { value: FX.iridescence.filmIor },
      uThickMin: { value: FX.iridescence.thicknessMin },
      uThickMax: { value: FX.iridescence.thicknessMax },
      uIri: { value: FX.iridescence.strength },
      uField: { value: blank as THREE.Texture },
      uFieldTexel: { value: new THREE.Vector2(1 / 960, 1 / 540) },
      uIsoLo: { value: FX.body.isoLo },
      uIsoHi: { value: FX.body.isoHi },
      uMask: { value: blank as THREE.Texture },
      uCamAspect: { value: 4 / 3 },
      uMirror: { value: FX.vision.mirror ? 1 : 0 },
      uCalib: { value: new THREE.Vector4(c.scaleX, c.scaleY, c.offsetX, c.offsetY) },
      uContourA: { value: FX.body.contourAlpha },
      uEchoA: { value: FX.body.echoAlpha },
      uLineW: { value: FX.body.contourWidthPx },
      uPresence: { value: 0 },
      uFocus: { value: new THREE.Vector4(0.5, 0.5, 0.25, 0) },
      uClear: {
        value: Array.from({ length: MAX_CLEAR_ZONES }, () => new THREE.Vector4()),
      },
      uClearFloor: { value: FX.clearZones.floor },
      uOutline: { value: blank as THREE.Texture },
      uOutlineTexel: { value: new THREE.Vector2(1 / 960, 1 / 540) },
      uOutCore: { value: FX.outlineFX.core },
      uOutGlow: { value: FX.outlineFX.glow },
      uOutA: { value: FX.outlineFX.enabled ? FX.outlineFX.alpha : 0 },
      uText: { value: blank as THREE.Texture },
    };
  }, [blank, fishSprites]);

  useEffect(() => () => blank.dispose(), [blank]);

  useFrame((state, delta) => {
    const u = materialRef.current?.uniforms;
    if (!u) return;
    u.uTime!.value = state.clock.elapsedTime;
    const period = FX.background.cycleSeconds;
    // Starts at FX.background.startPhase (light aqua on top), then drifts.
    u.uCycle!.value =
      ((state.clock.elapsedTime + FX.background.startPhase * period) % period) / period;
    u.uAspect!.value = aspect;
    if (sim) {
      u.uSim!.value = sim.texture;
      (u.uSimTexel!.value as THREE.Vector2).copy(sim.texel);
    }
    if (body) {
      u.uField!.value = body.fieldTexture;
      (u.uFieldTexel!.value as THREE.Vector2).copy(body.fieldTexel);
      u.uMask!.value = body.maskTexture;
      if (outline) {
        u.uOutline!.value = outline.texture;
        (u.uOutlineTexel!.value as THREE.Vector2).copy(outline.texel);
      }
      // Proximity fade applies to the outline too.
      u.uPresence!.value = body.presence * body.visibility;
    }
    u.uCamAspect!.value = camAspect();
    if (textTexture) {
      textTexture.needsUpdate = true;
      u.uText!.value = textTexture;
    } else u.uText!.value = blank;

    u.uAmp!.value = waves.amp;
    (u.uWaveDir!.value as THREE.Vector2).set(waves.dirX, waves.dirY);
    u.uFreq!.value = waves.freq;
    u.uPhase!.value = waves.phase;
    const hv = u.uHands!.value as THREE.Vector4[];
    for (let i = 0; i < 4; i++) {
      const h = waves.hands[i];
      const vv = (u.uHandsV!.value as THREE.Vector4[])[i]!;
      if (h) {
        hv[i]!.set(h.x, h.y, h.svx, h.strength);
        vv.set(h.svx, h.svy, 0, 0);
      } else {
        hv[i]!.set(0, 0, 0, 0);
        vv.set(0, 0, 0, 0);
      }
    }


    const cz = u.uClear!.value as THREE.Vector4[];
    const zones = clearZonesRef?.current ?? [];
    for (let i = 0; i < MAX_CLEAR_ZONES; i++) {
      const z = zones[i];
      if (z) cz[i]!.set(z.x, z.y, z.rx, z.ry);
      else cz[i]!.set(0, 0, 0, 0);
    }

    // Tapped thoughts → surfaced fish. Rise over riseSec, sink over
    // sinkSec before the thought leaves.
    const spotsU = u.uSpots!.value as THREE.Vector4[];
    const spots = spotsRef?.current ?? [];
    const nowMs = performance.now();
    const SF = FX.surfaceFish;
    const ease = (x: number) => {
      const t = Math.min(1, Math.max(0, x));
      return t * t * (3 - 2 * t);
    };
    const fishU = u.uSurfFish!.value as THREE.Vector4[];
    const fishes = surfFishRef.current;
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    const recent = spots.slice(-MAX_SPOTS);
    const alive = new Set<number>();
    for (let i = 0; i < MAX_SPOTS; i++) {
      const use = recent[i];
      if (!use) {
        spotsU[i]!.set(0, 0, 0, 0);
        fishU[i]!.set(0, 0, 0, 0);
        continue;
      }
      alive.add(use.born);
      const amt =
        ease((nowMs - use.born) / 1000 / SF.riseSec) *
        ease((use.until - nowMs) / 1000 / SF.sinkSec);
      // Slower ease for the deepening water under the words.
      const TT = FX.tapThoughts;
      const deep =
        ease((nowMs - use.born) / 1000 / TT.deepenInSec) *
        ease((use.until - nowMs) / 1000 / TT.deepenOutSec);
      spotsU[i]!.set(use.x, use.y, amt, deep);

      // The fish appears right beside the words, already swimming along its lane.
      const cx = use.x * aspect;
      const cy = use.y;
      let f = fishes.get(use.born);
      if (!f) {
        const a0 = use.seed * Math.PI * 2;
        const lane = 0.9 + use.seed * 0.25;
        const x = cx + Math.cos(a0) * SF.ringRx * lane;
        const y = cy + Math.sin(a0) * SF.ringRy * lane;
        f = {
          x,
          y,
          vx: -Math.sin(a0) * SF.speed * use.spin,
          vy: Math.cos(a0) * SF.speed * use.spin * (SF.ringRy / SF.ringRx),
          swim: use.seed * 20,
          lane,
          phase: use.seed * Math.PI * 2,
        };
        fishes.set(use.born, f);
      }
      stepSurfaceFish(f, cx, cy, use.spin, dt, t);
      fishU[i]!.set(f.x, f.y, Math.atan2(f.vy, f.vx), f.swim);
    }
    for (const k of [...fishes.keys()]) if (!alive.has(k)) fishes.delete(k);

    const fv = u.uFocus!.value as THREE.Vector4;
    const fs = focusRef?.current;
    const target = fs ? fs.amount : 0;
    if (fs) fv.set(fs.x, fs.y, 0.22, fv.w);
    fv.w += (target - fv.w) * 0.06; // eased in/out
  });

  return (
    <mesh frustumCulled={false} renderOrder={0}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}
