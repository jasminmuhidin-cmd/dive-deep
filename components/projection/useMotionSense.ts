"use client";

import { useCallback, useEffect, useRef } from "react";

const SAMPLE_W = 160;
const SAMPLE_H = 120;
/** Ignore tiny pixel noise from a mostly-still person */
const DIFF_THRESHOLD = 22;
/** Need a real chunk of the frame moving (walk / wave), not fidgets */
const MIN_MOTION_PIXELS = 45;
/** At most two people = two Larose cursors */
const MAX_CURSORS = 2;
/** People must be this far apart (UV) to get separate cursors */
const PERSON_SEP = 0.28;
const CURSOR_LERP = 0.28;
const CURSOR_TTL = 14;

export type MotionTrack = {
  id: number;
  /** Mirrored screen X 0–1 — this is the ripple cursor */
  x: number;
  y: number;
  weight: number;
};

export type MotionSample = {
  x: number;
  y: number;
  amount: number;
  /** One cursor per person (walk / wave). Max 2. */
  tracks: MotionTrack[];
  hotspots: { x: number; y: number }[];
};

type InternalCursor = MotionTrack & { miss: number };

/**
 * Person-scale motion cursors (Larose mouse analogue):
 * - One person walking or waving → one cursor that follows their motion
 * - Two people → two cursors
 */
export function useMotionSense(video: HTMLVideoElement | null) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevRef = useRef<Uint8ClampedArray | null>(null);
  const cursorsRef = useRef<InternalCursor[]>([]);
  const nextIdRef = useRef(1);
  const lastRef = useRef<MotionSample>({
    x: 0.5,
    y: 0.5,
    amount: 0,
    tracks: [],
    hotspots: [],
  });

  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = SAMPLE_W;
    c.height = SAMPLE_H;
    c.style.display = "none";
    c.setAttribute("aria-hidden", "true");
    document.body.appendChild(c);
    canvasRef.current = c;
    return () => {
      c.remove();
      canvasRef.current = null;
      prevRef.current = null;
      cursorsRef.current = [];
    };
  }, []);

  const sample = useCallback((): MotionSample => {
    const idle = lastRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !video || video.readyState < 2 || video.videoWidth < 2) {
      return { ...idle, amount: 0, tracks: [], hotspots: [] };
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { ...idle, amount: 0, tracks: [], hotspots: [] };

    ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
    const frame = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
    const cur = frame.data;
    const prev = prevRef.current;

    if (!prev || prev.length !== cur.length) {
      prevRef.current = new Uint8ClampedArray(cur);
      return { ...idle, amount: 0, tracks: [], hotspots: [] };
    }

    // Collect moving pixels (camera space)
    const pts: { x: number; y: number }[] = [];
    for (let y = 0; y < SAMPLE_H; y++) {
      for (let x = 0; x < SAMPLE_W; x++) {
        const i = (y * SAMPLE_W + x) * 4;
        const diff =
          (Math.abs(cur[i]! - prev[i]!) +
            Math.abs(cur[i + 1]! - prev[i + 1]!) +
            Math.abs(cur[i + 2]! - prev[i + 2]!)) /
          3;
        if (diff < DIFF_THRESHOLD) continue;
        pts.push({ x, y });
      }
    }
    prevRef.current!.set(cur);

    const amount = Math.min(1, pts.length / (SAMPLE_W * SAMPLE_H * 0.2));

    if (pts.length < MIN_MOTION_PIXELS) {
      cursorsRef.current = cursorsRef.current
        .map((c) => ({ ...c, miss: c.miss + 1 }))
        .filter((c) => c.miss < CURSOR_TTL);
      const tracks = cursorsRef.current.map(({ id, x, y, weight }) => ({
        id,
        x,
        y,
        weight,
      }));
      const quiet: MotionSample = {
        x: tracks[0]?.x ?? idle.x,
        y: tracks[0]?.y ?? idle.y,
        amount,
        tracks,
        hotspots: tracks.map((t) => ({ x: t.x, y: t.y })),
      };
      lastRef.current = quiet;
      return quiet;
    }

    // Centroid in camera space
    let sx = 0;
    let sy = 0;
    for (const p of pts) {
      sx += p.x;
      sy += p.y;
    }
    const mx = sx / pts.length;
    const my = sy / pts.length;

    // Try split into two people by X (left/right of centroid)
    let lSumX = 0;
    let lSumY = 0;
    let lN = 0;
    let rSumX = 0;
    let rSumY = 0;
    let rN = 0;
    for (const p of pts) {
      if (p.x < mx) {
        lSumX += p.x;
        lSumY += p.y;
        lN++;
      } else {
        rSumX += p.x;
        rSumY += p.y;
        rN++;
      }
    }

    const toScreen = (cx: number, cy: number) => ({
      x: 1 - cx / SAMPLE_W,
      y: cy / SAMPLE_H,
    });

    type Peak = { x: number; y: number; weight: number };
    const peaks: Peak[] = [];

    const minSide = Math.max(12, pts.length * 0.18);
    if (lN >= minSide && rN >= minSide) {
      const left = toScreen(lSumX / lN, lSumY / lN);
      const right = toScreen(rSumX / rN, rSumY / rN);
      // Only two cursors if the two groups are clearly separate people
      if (Math.hypot(left.x - right.x, left.y - right.y) >= PERSON_SEP) {
        peaks.push({ ...left, weight: lN });
        peaks.push({ ...right, weight: rN });
      }
    }

    // One person (walk past or single wave) → one cursor at motion centroid
    if (peaks.length === 0) {
      const one = toScreen(mx, my);
      peaks.push({ ...one, weight: pts.length });
    }

    peaks.sort((a, b) => b.weight - a.weight);
    const selected = peaks.slice(0, MAX_CURSORS);

    // Persist cursors (stable ids so each person keeps their ripple trail)
    const prevCursors = cursorsRef.current;
    const used = new Set<number>();
    const next: InternalCursor[] = [];

    for (const peak of selected) {
      let best = -1;
      let bestD = PERSON_SEP * 1.35;
      for (let i = 0; i < prevCursors.length; i++) {
        if (used.has(i)) continue;
        const d = Math.hypot(
          prevCursors[i]!.x - peak.x,
          prevCursors[i]!.y - peak.y,
        );
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0) {
        used.add(best);
        const t = prevCursors[best]!;
        next.push({
          id: t.id,
          x: t.x + (peak.x - t.x) * CURSOR_LERP,
          y: t.y + (peak.y - t.y) * CURSOR_LERP,
          weight: peak.weight,
          miss: 0,
        });
      } else {
        next.push({
          id: nextIdRef.current++,
          x: peak.x,
          y: peak.y,
          weight: peak.weight,
          miss: 0,
        });
      }
    }

    for (let i = 0; i < prevCursors.length; i++) {
      if (used.has(i)) continue;
      const t = prevCursors[i]!;
      if (t.miss + 1 < CURSOR_TTL && next.length < MAX_CURSORS) {
        next.push({ ...t, miss: t.miss + 1 });
      }
    }

    cursorsRef.current = next;
    const tracks = next.map(({ id, x, y, weight }) => ({ id, x, y, weight }));

    const result: MotionSample = {
      x: tracks[0]?.x ?? toScreen(mx, my).x,
      y: tracks[0]?.y ?? toScreen(mx, my).y,
      amount,
      tracks,
      hotspots: tracks.map((t) => ({ x: t.x, y: t.y })),
    };
    lastRef.current = result;
    return result;
  }, [video]);

  return { sample, lastRef };
}
