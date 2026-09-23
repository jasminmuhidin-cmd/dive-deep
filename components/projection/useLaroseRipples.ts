"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

const RESOLUTION = 512;
const MAX_WAVES = 100;
/** Gentle fade — soft rings that travel farther before settling */
const LIFE_DECAY = 0.945;
const SCALE_KEEP = 0.982;
const SCALE_GROW = 0.13;
const ROT_SPEED = 0.018;
const INITIAL_SCALE = 1.25;
const INITIAL_LIFE = 0.85;
const MAX_SCALE = 5.5;
const SCALE_TO_SIZE = 0.2;

type Wave = {
  x: number;
  y: number;
  life: number;
  scale: number;
  rotation: number;
  /** Soft Larose brush vs circular pond ring (text prompts) */
  kind: "brush" | "ring";
};

export type DispSample = {
  d: number;
  dx: number;
  dy: number;
};

export type LaroseRipples = {
  texture: THREE.CanvasTexture | null;
  /** Motion / pointer — Larose brush splat */
  splash: (nx: number, ny: number, size?: number) => void;
  /** Text reveal — circular pond ring expanding from center */
  splashRing: (nx: number, ny: number, size?: number) => void;
  tick: () => void;
  sample: (nx: number, ny: number) => DispSample;
};

/**
 * Olivier Larose ripple technique (exact params from the tutorial /
 * https://github.com/Akash1000x/Ripple-Shader):
 * brush.png stamps → expand + fade + rotate → displacement FBO →
 * θ = r·2π UV warp at strength 0.075.
 * @see https://blog.olivierlarose.com/tutorials/ripple-shader
 */
export function useLaroseRipples(): LaroseRipples {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const wavesRef = useRef<Wave[]>([]);
  const brushRef = useRef<HTMLImageElement | HTMLCanvasElement | null>(null);
  const ringRef = useRef<HTMLCanvasElement | null>(null);
  const pixelsRef = useRef<Uint8ClampedArray | null>(null);
  const waveIndexRef = useRef(0);
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = RESOLUTION;
    canvas.height = RESOLUTION;
    canvas.style.display = "none";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, RESOLUTION, RESOLUTION);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.NoColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.flipY = true;

    canvasRef.current = canvas;
    textureRef.current = tex;
    setTexture(tex);

    // Larose's actual brush.png
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      brushRef.current = img;
    };
    img.onerror = () => {
      // Fallback soft brush if asset missing
      const brush = document.createElement("canvas");
      brush.width = 256;
      brush.height = 256;
      const bctx = brush.getContext("2d")!;
      const g = bctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.35, "rgba(255,255,255,0.55)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      bctx.fillStyle = g;
      bctx.fillRect(0, 0, 256, 256);
      brushRef.current = brush;
    };
    img.src = "/projection/brush.png";

    // Circular pond-ring brush for text reveals
    const ring = document.createElement("canvas");
    ring.width = 256;
    ring.height = 256;
    const rctx = ring.getContext("2d")!;
    const mid = 128;
    // Soft ring: clear center → bright band → fade out (reads as a circle)
    const rg = rctx.createRadialGradient(mid, mid, 28, mid, mid, 120);
    rg.addColorStop(0, "rgba(255,255,255,0)");
    rg.addColorStop(0.35, "rgba(255,255,255,0.15)");
    rg.addColorStop(0.55, "rgba(255,255,255,1)");
    rg.addColorStop(0.72, "rgba(255,255,255,0.55)");
    rg.addColorStop(1, "rgba(255,255,255,0)");
    rctx.fillStyle = rg;
    rctx.fillRect(0, 0, 256, 256);
    ringRef.current = ring;

    wavesRef.current = [];

    return () => {
      tex.dispose();
      canvas.remove();
      canvasRef.current = null;
      brushRef.current = null;
      ringRef.current = null;
      textureRef.current = null;
      pixelsRef.current = null;
      wavesRef.current = [];
      setTexture(null);
    };
  }, []);

  const pushWave = useCallback(
    (nx: number, ny: number, size: number, kind: "brush" | "ring") => {
      const waves = wavesRef.current;
      const i = waveIndexRef.current % MAX_WAVES;
      waveIndexRef.current = i + 1;

      const wave: Wave = {
        x: Math.min(1, Math.max(0, nx)),
        y: Math.min(1, Math.max(0, ny)),
        life: kind === "ring" ? 0.72 : INITIAL_LIFE,
        scale:
          (kind === "ring" ? 0.85 : INITIAL_SCALE) *
          Math.max(0.45, Math.min(1.6, size)),
        rotation: kind === "ring" ? 0 : Math.random() * Math.PI * 2,
        kind,
      };

      if (i < waves.length) waves[i] = wave;
      else waves.push(wave);
    },
    [],
  );

  const splash = useCallback(
    (nx: number, ny: number, size = 1) => pushWave(nx, ny, size, "brush"),
    [pushWave],
  );

  const splashRing = useCallback(
    (nx: number, ny: number, size = 1) => pushWave(nx, ny, size, "ring"),
    [pushWave],
  );

  const tick = useCallback(() => {
    const canvas = canvasRef.current;
    const brush = brushRef.current;
    const ring = ringRef.current;
    const tex = textureRef.current;
    if (!canvas || !tex) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const waves = wavesRef.current;

    for (const w of waves) {
      if (w.life <= 0.05) {
        w.life = 0;
        continue;
      }
      if (w.kind === "brush") w.rotation += ROT_SPEED;
      // Rings: slower, softer expansion
      w.life *= w.kind === "ring" ? 0.968 : LIFE_DECAY;
      const grow = w.kind === "ring" ? 0.085 : SCALE_GROW;
      const keep = w.kind === "ring" ? 0.99 : SCALE_KEEP;
      const maxS = w.kind === "ring" ? 5.8 : MAX_SCALE;
      w.scale = Math.min(maxS, keep * w.scale + grow);
      if (w.life < 0.05) w.life = 0;
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, RESOLUTION, RESOLUTION);

    ctx.globalCompositeOperation = "lighter";
    for (const w of waves) {
      if (w.life <= 0.05) continue;
      const sprite = w.kind === "ring" ? ring : brush;
      if (!sprite) continue;
      const cx = w.x * RESOLUTION;
      const cy = w.y * RESOLUTION;
      const sizeMul = w.kind === "ring" ? 0.2 : SCALE_TO_SIZE;
      const size = w.scale * RESOLUTION * sizeMul;
      ctx.save();
      ctx.translate(cx, cy);
      if (w.kind === "brush") ctx.rotate(w.rotation);
      ctx.globalAlpha = w.life * (w.kind === "ring" ? 0.75 : 1);
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    try {
      pixelsRef.current = ctx.getImageData(0, 0, RESOLUTION, RESOLUTION).data;
    } catch {
      pixelsRef.current = null;
    }

    tex.needsUpdate = true;
  }, []);

  const sample = useCallback((nx: number, ny: number): DispSample => {
    const pixels = pixelsRef.current;
    if (!pixels) return { d: 0, dx: 0, dy: 0 };

    const x = Math.min(
      RESOLUTION - 1,
      Math.max(0, Math.floor(nx * RESOLUTION)),
    );
    const y = Math.min(
      RESOLUTION - 1,
      Math.max(0, Math.floor(ny * RESOLUTION)),
    );
    const i = (y * RESOLUTION + x) * 4;
    const d = (pixels[i] ?? 0) / 255;
    const theta = d * Math.PI * 2;
    return {
      d,
      dx: Math.sin(theta) * d,
      dy: Math.cos(theta) * d,
    };
  }, []);

  return { texture, splash, tick, sample, splashRing };
}

/** Bake a luminous mermaid-ocean field — calm, mystical, thoughtful. */
export function createWaterImageTexture(size = 1024): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Soft depth: pale aqua surface → deeper sapphire (still light)
  const bg = ctx.createLinearGradient(0, 0, 0, size);
  bg.addColorStop(0, "#b8e8f0");
  bg.addColorStop(0.22, "#7ed4e4");
  bg.addColorStop(0.5, "#4bb8d0");
  bg.addColorStop(0.78, "#2a8fad");
  bg.addColorStop(1, "#1a6a88");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Soft light bloom from above (sun through water)
  const bloom = ctx.createRadialGradient(
    size * 0.5,
    size * 0.15,
    0,
    size * 0.5,
    size * 0.35,
    size * 0.7,
  );
  bloom.addColorStop(0, "rgba(255, 255, 255, 0.35)");
  bloom.addColorStop(0.4, "rgba(200, 240, 250, 0.18)");
  bloom.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, size, size);

  // Pearly caustics / shimmer
  for (let i = 0; i < 160; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 25 + Math.random() * 100;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.05 + Math.random() * 0.1;
    g.addColorStop(0, `rgba(230, 255, 255, ${a})`);
    g.addColorStop(0.45, `rgba(140, 220, 235, ${a * 0.45})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Soft current streaks
  for (let i = 0; i < 36; i++) {
    const y = Math.random() * size;
    const h = 2 + Math.random() * 5;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.03 + Math.random() * 0.05})`;
    ctx.fillRect(0, y, size, h);
  }

  // Gentle grain (less contrast than before)
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    img.data[i] = Math.max(0, Math.min(255, img.data[i]! + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1]! + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2]! + n));
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
