"use client";

import { useEffect, useRef, useState } from "react";
import type {
  PoseLandmarker,
  PoseLandmarkerResult,
  TasksVisionModule,
} from "./mediapipeTypes";
import { FX } from "./fxConfig";
import { boxBlurWH, smoothstep } from "./maskOps";

/** Downsampled body mask in CAMERA space (not mirrored, not cropped). */
/**
 * Mask grid in camera space. 240×135 (16:9, matches the 1280×720 camera):
 * 2.7× the old 160×120 grid, so outlines are smoother and less blocky.
 */
export const MASK_W = 240;
export const MASK_H = 135;

/** Bilinear sample of a w×h float mask at uv (0–1) — smooth downsampling. */
function bilinear(src: Float32Array, w: number, h: number, u: number, v: number) {
  const x = Math.min(w - 1.001, Math.max(0, u * w - 0.5));
  const y = Math.min(h - 1.001, Math.max(0, v * h - 0.5));
  const x0 = x | 0;
  const y0 = y | 0;
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * w + x0;
  const a = src[i]! + (src[i + 1]! - src[i]!) * fx;
  const b = src[i + w]! + (src[i + w + 1]! - src[i + w]!) * fx;
  return a + (b - a) * fy;
}

type LM = { x: number; y: number; visibility?: number };

/**
 * Body shape drawn from the pose skeleton (camera space, MASK_W × MASK_H):
 * head disc, filled torso, and soft capsules for neck, arms, hands and legs,
 * sized from the shoulder width. Used whenever the segmentation mask is
 * missing — some GPUs/drivers return an all-zero mask from MediaPipe's GPU
 * delegate even though landmarks are fine — so a detected person ALWAYS
 * gets a body shape. Writes max(existing, shape) into `out`.
 */
function rasterSkeleton(
  lm: LM[],
  camAspect: number,
  out: Float32Array,
  minVis: number,
  opts: { gain?: number; armsOnly?: boolean } = {},
) {
  const gain = opts.gain ?? 1;
  const ok = (i: number) => (lm[i]?.visibility ?? 0) >= minVis;
  if (!ok(11) || !ok(12)) return false;
  const A = camAspect; // x distances in "height units"
  const sw = Math.max(0.03, Math.hypot((lm[11]!.x - lm[12]!.x) * A, lm[11]!.y - lm[12]!.y));
  const stamp = (
    ax: number, ay: number, bx: number, by: number, r: number, soft = 0.45,
  ) => {
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - r / A) * MASK_W) - 1);
    const x1 = Math.min(MASK_W - 1, Math.ceil((Math.max(ax, bx) + r / A) * MASK_W) + 1);
    const y0 = Math.max(0, Math.floor((Math.min(ay, by) - r) * MASK_H) - 1);
    const y1 = Math.min(MASK_H - 1, Math.ceil((Math.max(ay, by) + r) * MASK_H) + 1);
    const dx = (bx - ax) * A;
    const dy = by - ay;
    const L2 = dx * dx + dy * dy || 1e-9;
    for (let y = y0; y <= y1; y++) {
      const py = (y + 0.5) / MASK_H - ay;
      for (let x = x0; x <= x1; x++) {
        const px = ((x + 0.5) / MASK_W - ax) * A;
        const t = Math.min(1, Math.max(0, (px * dx + py * dy) / L2));
        const d = Math.hypot(px - dx * t, py - dy * t);
        const v = 1 - Math.min(1, Math.max(0, (d - r * (1 - soft)) / (r * soft)));
        const i = y * MASK_W + x;
        const g = v * gain;
        if (g > out[i]!) out[i] = g;
      }
    }
  };
  const P = (i: number) => lm[i]!;
  if (opts.armsOnly) {
    // Arms + hands only: upper arm, forearm, a palm disc. Segmentation often
    // loses thin or fast-moving arms; the skeleton still knows where they are.
    const arms: [number, number, number][] = [
      [11, 13, 0.15], [13, 15, 0.12], [12, 14, 0.15], [14, 16, 0.12],
      [15, 19, 0.1], [16, 20, 0.1], [15, 17, 0.1], [16, 18, 0.1],
    ];
    for (const [a, b, r] of arms)
      if (ok(a) && ok(b)) stamp(P(a).x, P(a).y, P(b).x, P(b).y, sw * r);
    for (const w of [15, 16])
      if (ok(w)) stamp(P(w).x, P(w).y, P(w).x, P(w).y, sw * 0.16);
    return true;
  }
  const shX = (P(11).x + P(12).x) / 2;
  const shY = (P(11).y + P(12).y) / 2;
  // Hips: real if visible, else assume a torso ~1.5 shoulder-widths long.
  const hasHips = ok(23) || ok(24);
  const hL = ok(23) ? P(23) : ok(24) ? P(24) : { x: P(11).x, y: shY + sw * 1.5 };
  const hR = ok(24) ? P(24) : ok(23) ? P(23) : { x: P(12).x, y: shY + sw * 1.5 };
  // Torso: thick capsules between shoulders and hips + across them fill it.
  const tr = sw * 0.42;
  stamp(P(11).x, P(11).y, hL.x, hL.y, tr);
  stamp(P(12).x, P(12).y, hR.x, hR.y, tr);
  stamp(shX, shY, (hL.x + hR.x) / 2, (hL.y + hR.y) / 2, sw * 0.5);
  stamp(P(11).x, P(11).y, P(12).x, P(12).y, sw * 0.22);
  // Head + neck.
  const hx = ok(0) ? P(0).x : shX;
  const hy = ok(0) ? P(0).y : shY - sw * 0.7;
  stamp(shX, shY, hx, hy, sw * 0.2);
  stamp(hx, hy - sw * 0.08, hx, hy - sw * 0.08, sw * 0.4);
  // Limbs [a, b, radius in shoulder widths].
  const limbs: [number, number, number][] = [
    [11, 13, 0.17], [13, 15, 0.14], [12, 14, 0.17], [14, 16, 0.14],
    [15, 19, 0.13], [16, 20, 0.13],
  ];
  if (hasHips)
    limbs.push([23, 25, 0.24], [25, 27, 0.17], [24, 26, 0.24], [26, 28, 0.17]);
  for (const [a, b, r] of limbs)
    if (ok(a) && ok(b)) stamp(P(a).x, P(a).y, P(b).x, P(b).y, sw * r);
  return true;
}

export type WristSample = {
  /** Camera uv, 0–1, y down. */
  x: number;
  y: number;
  side: "L" | "R";
};

/**
 * Latest vision output. Written by the inference loop, read by render-loop
 * consumers each frame. Plain mutable object in a ref → zero React renders.
 */
export type BodyVisionFrame = {
  /** Max-combined person mask (pose segmentation), MASK_W × MASK_H, 0–1. */
  mask: Float32Array;
  /**
   * Motion energy from camera frame-difference, MASK_W × MASK_H, 0–1.
   * Catches ANY moving mass (partial bodies, objects, groups) — not just a
   * recognised person. Rises instantly, releases over FX.body.motionMask.holdTau.
   */
  motion: Float32Array;
  /** Motion happening NOW (fast decay ~0.15 s) — used to judge stillness. */
  motionNow: Float32Array;
  /** Mean motion energy over the frame (0–1). */
  motionAmount: number;
  /** People passing the posture gate (standing, head + torso visible). */
  qualified: number;
  /**
   * Partial human parts, MASK_W × MASK_H, 0–1: arms outside a qualified
   * person's body column, and people who don't pass the posture gate.
   * BodyField turns these into small, sparse dots — only while held still.
   */
  partial: Float32Array;
  camAspect: number;
  wrists: WristSample[];
  people: number;
  /** Largest person's vertical extent in the camera frame (0–1), for setup hints. */
  bodySpan: number;
  /** True when both ankles are visible (whole body in frame). */
  feetVisible: boolean;
  /**
   * Where dots may appear, MASK_W × MASK_H, 0–1: the cleaned silhouette plus a
   * soft band just outside it (FX.vision.halo). The outline uses `mask`.
   */
  dotZone: Float32Array;
  /** Pose model currently running (may drop to a lighter one on slow GPUs). */
  model: string;
  /** Rolling average inference time per frame (ms), for the debug HUD. */
  inferMs: number;
  /** Where the body shape came from (debug). */
  maskSource: "none" | "segmentation" | "skeleton";
  /** performance.now() of the frame these results belong to. */
  t: number;
  /** Increments on every new result so consumers can detect fresh data. */
  seq: number;
};

export type VisionStatus = "off" | "loading" | "running" | "error";

type Variant = "lite" | "full" | "heavy";

async function createLandmarker(v: Variant): Promise<PoseLandmarker> {
  // Runtime import (not bundled): local copy first so the installation works
  // offline; CDN as a fallback.
  let mod: TasksVisionModule | null = null;
  let base: string = FX.vision.wasmLocal;
  for (const [url, wasm] of [
    [FX.vision.bundleLocal, FX.vision.wasmLocal],
    [FX.vision.bundleCdn, FX.vision.wasmCdn],
  ] as const) {
    try {
      mod = (await import(/* webpackIgnore: true */ url)) as TasksVisionModule;
      base = wasm;
      break;
    } catch (e) {
      console.warn("[vision] could not load", url, e);
    }
  }
  if (!mod) throw new Error("tasks-vision unavailable");
  const { FilesetResolver, PoseLandmarker } = mod;

  const attempts: [string, string][] = [
    [base, `/mediapipe/pose_landmarker_${v}.task`],
    [
      base,
      `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${v}/float16/1/pose_landmarker_${v}.task`,
    ],
  ];
  let lastErr: unknown;
  for (const [wasm, model] of attempts) {
    for (const delegate of ["GPU", "CPU"] as const) {
      try {
        const fileset = await FilesetResolver.forVisionTasks(wasm);
        return await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: model, delegate },
          runningMode: "VIDEO",
          numPoses: FX.vision.numPoses,
          outputSegmentationMasks: true,
          // Lower thresholds: people further away / half-turned are picked
          // up and held instead of flickering in and out.
          minPoseDetectionConfidence: FX.vision.detectConfidence,
          minPosePresenceConfidence: FX.vision.presenceConfidence,
          minTrackingConfidence: FX.vision.trackingConfidence,
        });
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw lastErr;
}

/**
 * Runs MediaPipe PoseLandmarker on the webcam at ≤ FX.vision.maxFps.
 *
 * One model gives us BOTH things we need:
 *  - segmentationMasks → the body silhouette for the circle figure
 *  - landmarks 15/16 (wrists) → hand velocity for the waves
 * Pose wrists are far more reliable than HandLandmarker at installation
 * distances (2–4 m), where hands are only ~20 px tall in the camera.
 */
export function useBodyVision(video: HTMLVideoElement | null) {
  const frameRef = useRef<BodyVisionFrame>({
    mask: new Float32Array(MASK_W * MASK_H),
    dotZone: new Float32Array(MASK_W * MASK_H),
    model: "",
    inferMs: 0,
    motion: new Float32Array(MASK_W * MASK_H),
    motionNow: new Float32Array(MASK_W * MASK_H),
    motionAmount: 0,
    qualified: 0,
    partial: new Float32Array(MASK_W * MASK_H),
    camAspect: 4 / 3,
    wrists: [],
    people: 0,
    bodySpan: 0,
    feetVisible: false,
    maskSource: "none",
    t: 0,
    seq: 0,
  });
  const [status, setStatus] = useState<VisionStatus>("off");

  useEffect(() => {
    if (!video) return;
    let cancelled = false;
    let landmarker: PoseLandmarker | null = null;
    let handle = 0;
    let lastRun = 0;
    let lastTs = 0;
    const minGap = 1000 / FX.vision.maxFps;
    const hasRVFC = "requestVideoFrameCallback" in HTMLVideoElement.prototype;

    // ---- frame-difference motion (runs with or without the pose model) ----
    const mc = document.createElement("canvas");
    mc.width = MASK_W;
    mc.height = MASK_H;
    const mctx = mc.getContext("2d", { willReadFrequently: true });
    let prevGray: Float32Array | null = null;
    let lastMotionT = 0;
    const updateMotion = (now: number) => {
      if (!mctx) return;
      mctx.drawImage(video, 0, 0, MASK_W, MASK_H);
      const px = mctx.getImageData(0, 0, MASK_W, MASK_H).data;
      const gray = new Float32Array(MASK_W * MASK_H);
      for (let i = 0; i < gray.length; i++)
        gray[i] = px[i * 4]! * 0.299 + px[i * 4 + 1]! * 0.587 + px[i * 4 + 2]! * 0.114;
      const f = frameRef.current;
      const M = FX.body.motionMask;
      const dt = lastMotionT ? (now - lastMotionT) / 1000 : 0;
      lastMotionT = now;
      const keep = Math.exp(-dt / M.holdTau);
      const keepNow = Math.exp(-dt / 0.15);
      let sum = 0;
      if (prevGray) {
        for (let i = 0; i < gray.length; i++) {
          const d = Math.abs(gray[i]! - prevGray[i]!);
          const t = Math.min(1, Math.max(0, (d - M.threshold) / (M.threshold * 2)));
          const raw = t * t * (3 - 2 * t);
          const v = Math.max(f.motion[i]! * keep, raw);
          f.motion[i] = v;
          f.motionNow[i] = Math.max(f.motionNow[i]! * keepNow, raw);
          sum += v;
        }
      }
      prevGray = gray;
      f.motionAmount = sum / gray.length;
      f.camAspect = (video.videoWidth || 4) / (video.videoHeight || 3);
      f.t = now;
      f.seq++;
    };

    let lastQualifiedAt = -Infinity;

    // ---- body-shape buffers ----------------------------------------------
    // raw:   this frame's silhouette (segmentation + skeleton arms), noisy
    // mask:  cleaned → blurred + re-thresholded into a solid shape, with a
    //        short hold so one bad frame doesn't punch holes in the body
    // zone:  mask + a soft band just outside it, where dots may appear
    const N = MASK_W * MASK_H;
    const raw = new Float32Array(N);
    const bufA = new Float32Array(N);
    const bufT = new Float32Array(N);
    let lastCleanT = 0;
    const cleanMask = (now: number) => {
      const f = frameRef.current;
      const C = FX.vision.maskClean;
      boxBlurWH(raw, bufA, bufT, MASK_W, MASK_H, C.blurPx);
      const dt = lastCleanT ? Math.min(0.5, (now - lastCleanT) / 1000) : 0;
      lastCleanT = now;
      const decay = Math.exp(-dt / C.holdTau);
      const m = f.mask;
      for (let i = 0; i < N; i++) {
        const c = smoothstep(C.lo, C.hi, bufA[i]!);
        const held = m[i]! * decay;
        m[i] = c > held ? c : held;
      }
      const HL = FX.vision.halo;
      const zone = f.dotZone;
      if (HL.radiusPx > 0 && HL.strength > 0) {
        boxBlurWH(m, bufA, bufT, MASK_W, MASK_H, HL.radiusPx);
        // Box blur of the edge ≈ a linear ramp: 0.5 on the outline → 0 at
        // radiusPx outside it. ×2 turns that into 1 → 0 across the band.
        for (let i = 0; i < N; i++) {
          const h = Math.min(1, bufA[i]! * 2) * HL.strength;
          zone[i] = m[i]! > h ? m[i]! : h;
        }
      } else zone.set(m);
    };

    const onResult = (res: PoseLandmarkerResult, now: number) => {
      const f = frameRef.current;
      const out = raw;
      const masks = res.segmentationMasks ?? [];

      // ---- posture gate: only a standing person with head + torso -------
      //  head:      nose or an eye visible
      //  torso:     both shoulders + at least one hip visible
      //  standing:  shoulders above hips, head above shoulders, and the
      //             hip→shoulder axis within maxLeanDeg of vertical
      // Random objects, a lone arm or someone crouching/lying never pass,
      // so they never produce body dots.
      const P = FX.posture;
      const vis = (lm: (typeof res.landmarks)[number], i: number) =>
        (lm[i]?.visibility ?? 0) >= P.minVisibility;
      const keep: number[] = [];
      res.landmarks.forEach((lm, i) => {
        const head = vis(lm, 0) || vis(lm, 2) || vis(lm, 5);
        const shoulders = vis(lm, 11) && vis(lm, 12);
        const hips = vis(lm, 23) || vis(lm, 24);
        // A human = a visible face (nose / eyes) above both shoulders.
        // Background objects never have pose landmarks, so they never pass.
        if (!head || !shoulders) return;
        const headTop = Math.min(lm[0]?.y ?? 1, lm[2]?.y ?? 1, lm[5]?.y ?? 1);
        const shY = (lm[11]!.y + lm[12]!.y) / 2;
        if (!hips) {
          // Upper body only (e.g. close to the wall): face above shoulders is enough.
          if (headTop < shY) keep.push(i);
          return;
        }
        const sx = (lm[11]!.x + lm[12]!.x) / 2;
        const sy = (lm[11]!.y + lm[12]!.y) / 2;
        const hipL = vis(lm, 23) ? lm[23]! : lm[24]!;
        const hipR = vis(lm, 24) ? lm[24]! : lm[23]!;
        const hx = (hipL.x + hipR.x) / 2;
        const hy = (hipL.y + hipR.y) / 2;
        const lean = (Math.atan2(Math.abs(sx - hx), hy - sy) * 180) / Math.PI;
        const headY = Math.min(lm[0]?.y ?? 1, lm[2]?.y ?? 1, lm[5]?.y ?? 1);
        if (sy < hy && headY < sy && lean <= P.maxLeanDeg) keep.push(i);
      });
      // Gate off → previous behaviour: every detected person counts in full.
      if (!P.enabled) {
        keep.length = 0;
        res.landmarks.forEach((_, i) => keep.push(i));
      }
      f.qualified = keep.length;
      const part = f.partial;
      part.fill(0);

      // People who did NOT pass the gate still count as partial presence.
      const kept = new Set(keep);
      masks.forEach((m, idx) => {
        if (kept.has(idx) || !m) return;
        const src = m.getAsFloat32Array();
        const sw = m.width;
        const sh = m.height;
        for (let y = 0; y < MASK_H; y++) {
          const vv = (y + 0.5) / MASK_H;
          for (let x = 0; x < MASK_W; x++) {
            const v = bilinear(src, sw, sh, (x + 0.5) / MASK_W, vv);
            const i = y * MASK_W + x;
            if (v > part[i]!) part[i] = v;
          }
        }
      });

      if (keep.length > 0) {
        lastQualifiedAt = now;
        out.fill(0);
      } else if (now - lastQualifiedAt > P.holdMs) {
        out.fill(0); // nobody qualifies (after a short grace period) → no body
      }

      const camAspect = (video.videoWidth || 4) / (video.videoHeight || 3);
      for (const idx of keep) {
        const m = masks[idx];
        const lm = res.landmarks[idx]!;
        // No usable silhouette (missing, or the GPU returned all zeros) →
        // build the body from the skeleton instead.
        let empty = !m;
        if (m) {
          const a = m.getAsFloat32Array();
          let mx = 0;
          for (let i = 0; i < a.length; i += 7) if (a[i]! > mx) mx = a[i]!;
          empty = mx < 0.05;
        }
        if (empty || FX.vision.skeletonBody === "always") {
          rasterSkeleton(lm, camAspect, out, FX.vision.skeletonMinVis);
          f.maskSource = "skeleton";
          if (empty) continue;
        } else f.maskSource = "segmentation";
        if (!m) continue;

        // Body column (no arms): a soft vertical band centred on the torso,
        // half-width = shoulder width × columnWidth, from just above the head
        // down to the feet. Arms held out or waving fall outside it, so they
        // never create dots — hands are expressed only through the water.
        const shW = Math.max(0.04, Math.abs(lm[11]!.x - lm[12]!.x));
        const hipA = (lm[23]?.visibility ?? 0) >= P.minVisibility ? lm[23]! : lm[24]!;
        const hipB = (lm[24]?.visibility ?? 0) >= P.minVisibility ? lm[24]! : lm[23]!;
        const shX = (lm[11]!.x + lm[12]!.x) / 2;
        const shY = (lm[11]!.y + lm[12]!.y) / 2;
        const hpX = (hipA.x + hipB.x) / 2;
        const hpY = (hipA.y + hipB.y) / 2;
        const headY = Math.min(lm[0]?.y ?? shY, lm[2]?.y ?? shY, lm[5]?.y ?? shY);
        const top = headY - (shY - headY) * 0.9;
        const half = shW * P.columnWidth;
        const column = (cx: number, cy: number) => {
          if (!P.enabled || !P.armColumn) return 1; // whole silhouette, arms included
          if (cy < top) return 0;
          // follow the torso's lean: interpolate the centre between hips and shoulders
          const k = Math.min(1, Math.max(0, (cy - shY) / Math.max(1e-3, hpY - shY)));
          const mid = cy < shY ? shX : shX + (hpX - shX) * k;
          const d = Math.abs(cx - mid) / half;
          return 1 - Math.min(1, Math.max(0, (d - 0.85) / 0.35));
        };

        // Masks are only valid inside this callback → copy (downsampled) now.
        const src = m.getAsFloat32Array();
        const sw = m.width;
        const sh = m.height;
        for (let y = 0; y < MASK_H; y++) {
          const cy = (y + 0.5) / MASK_H;
          for (let x = 0; x < MASK_W; x++) {
            const raw = bilinear(src, sw, sh, (x + 0.5) / MASK_W, cy);
            const col = column((x + 0.5) / MASK_W, cy);
            const v = raw * col;
            const i = y * MASK_W + x;
            if (v > out[i]!) out[i] = v;
            // Arms / hands outside the body column → partial presence.
            const pv = raw * (1 - col);
            if (pv > part[i]!) part[i] = pv;
          }
        }
      }

      // Arms from the skeleton, merged into the silhouette: segmentation
      // often drops thin or fast arms, the pose landmarks rarely do.
      const AF = FX.vision.armFill;
      if (AF > 0) {
        const toPart = P.enabled && P.armColumn; // arms excluded from dots
        for (const idx of keep)
          rasterSkeleton(res.landmarks[idx]!, camAspect, toPart ? part : out,
            FX.vision.skeletonMinVis, { gain: AF, armsOnly: true });
      }
      cleanMask(now);

      const wrists: WristSample[] = [];
      // Hand point = visibility-weighted mean of wrist, index and pinky
      // knuckles (15/19/17 left, 16/20/18 right). Averaging three landmarks
      // cancels much of each one's jitter and tracks the palm, not the wrist.
      const handPoint = (lm: (typeof res.landmarks)[number], ids: number[]) => {
        let sx = 0, sy = 0, sw = 0;
        for (const id of ids) {
          const p = lm[id];
          const w = p?.visibility ?? 0;
          if (!p || w < FX.hands.minVisibility) continue;
          sx += p.x * w;
          sy += p.y * w;
          sw += w;
        }
        return sw > 0 ? { x: sx / sw, y: sy / sw } : null;
      };
      for (const lm of res.landmarks) {
        const l = handPoint(lm, [15, 19, 17]);
        const r = handPoint(lm, [16, 20, 18]);
        if (l) wrists.push({ ...l, side: "L" });
        if (r) wrists.push({ ...r, side: "R" });
      }

      let span = 0;
      let feet = false;
      for (const lm of res.landmarks) {
        let lo = 1;
        let hi = 0;
        for (const p of lm) {
          if ((p.visibility ?? 1) < 0.5) continue;
          lo = Math.min(lo, p.y);
          hi = Math.max(hi, p.y);
        }
        if (hi > lo && hi - lo > span) {
          span = hi - lo;
          feet =
            (lm[27]?.visibility ?? 0) > 0.5 && (lm[28]?.visibility ?? 0) > 0.5;
        }
      }
      f.bodySpan = span;
      f.feetVisible = feet;
      f.wrists = wrists;
      f.people = res.landmarks.length;
      f.camAspect = (video.videoWidth || 4) / (video.videoHeight || 3);
      f.t = now;
      f.seq++;
    };

    const ic = document.createElement("canvas");
    const ictx = ic.getContext("2d");

    const tick = () => {
      if (cancelled) return;
      const now = performance.now();
      if (now - lastRun >= minGap && video.readyState >= 2) {
        lastRun = now;
        updateMotion(now);
        if (landmarker) {
          // detectForVideo requires strictly increasing timestamps.
          const ts = Math.max(now, lastTs + 1);
          lastTs = ts;
          try {
            // Infer on a downscaled copy: the model works at 256 px anyway,
            // and the segmentation mask comes back at INPUT size — reading a
            // 1280×720 mask off the GPU every frame was the main slowdown.
            const vw = video.videoWidth || 1280;
            const vh = video.videoHeight || 720;
            const iw = Math.min(vw, FX.vision.inferWidth);
            const ih = Math.round((iw * vh) / vw);
            if (ic.width !== iw || ic.height !== ih) {
              ic.width = iw;
              ic.height = ih;
            }
            ictx?.drawImage(video, 0, 0, iw, ih);
            const t0 = performance.now();
            landmarker.detectForVideo(ic, ts, (res) => onResult(res, now));
            const ms = performance.now() - t0;
            const f = frameRef.current;
            f.inferMs = f.inferMs ? f.inferMs + (ms - f.inferMs) * 0.05 : ms;
            framesOnModel++;
            maybeDowngrade();
          } catch (e) {
            console.warn("[vision] detect failed", e);
          }
        }
      }
      schedule();
    };

    const schedule = () => {
      if (cancelled) return;
      if (hasRVFC) {
        // Fires once per *new* camera frame — no wasted inference on dupes.
        handle = video.requestVideoFrameCallback(tick);
      } else {
        handle = requestAnimationFrame(tick);
      }
    };

    // ---- model choice -------------------------------------------------
    // ?model=lite|full|heavy in the URL overrides fxConfig (handy on site)
    // and turns auto-downgrade off. Otherwise, if the device can't keep up
    // (e.g. a Surface Hub's integrated GPU), step down heavy → full → lite.
    const qsModel = new URLSearchParams(window.location.search).get("model");
    const forced = qsModel === "lite" || qsModel === "full" || qsModel === "heavy";
    let variant: Variant = forced ? (qsModel as Variant) : FX.vision.modelVariant;
    let framesOnModel = 0;
    let switching = false;
    const start = (v: Variant) => {
      variant = v;
      framesOnModel = 0;
      frameRef.current.inferMs = 0;
      return createLandmarker(v).then((lm) => {
        if (cancelled) {
          lm.close();
          return;
        }
        landmarker = lm;
        frameRef.current.model = v;
        console.info(`[vision] pose model: ${v}`);
        setStatus("running");
      });
    };
    const maybeDowngrade = () => {
      const A = FX.vision.autoDowngrade;
      if (forced || !A.enabled || switching || variant === "lite") return;
      if (framesOnModel < A.warmupFrames || frameRef.current.inferMs < A.slowMs) return;
      const next: Variant = variant === "heavy" ? "full" : "lite";
      console.info(
        `[vision] ${variant} too slow (${frameRef.current.inferMs.toFixed(0)} ms/frame) → ${next}`,
      );
      switching = true;
      const old = landmarker;
      landmarker = null; // body shape holds; motion keeps running meanwhile
      old?.close();
      start(next)
        .catch((e) => console.warn("[vision] downgrade failed", e))
        .finally(() => (switching = false));
    };

    setStatus("loading");
    schedule(); // motion starts now; pose joins when the model is ready
    start(variant).catch((e) => {
      console.warn("[vision] could not start PoseLandmarker", e);
      if (!cancelled) setStatus("error");
    });

    return () => {
      cancelled = true;
      if (hasRVFC) video.cancelVideoFrameCallback?.(handle);
      else cancelAnimationFrame(handle);
      landmarker?.close();
      landmarker = null;
    };
  }, [video]);

  return { frameRef, status };
}
