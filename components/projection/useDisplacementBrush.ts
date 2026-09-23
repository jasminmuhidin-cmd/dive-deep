"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

export type DisplacementBrush = {
  texture: THREE.CanvasTexture | null;
  /** Stamp sized by velocity (Larose). radiusNorm ~ 0.02–0.2 */
  stamp: (nx: number, ny: number, radiusNorm?: number) => void;
  fade: () => void;
};

/**
 * Hidden brush canvas — white soft dots + fade trail.
 * Same technique as Olivier Larose ripple / mouse-distortion demos.
 * @see https://blog.olivierlarose.com/demos/ripple-shader
 */
export function useDisplacementBrush(resolution = 256): DisplacementBrush {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = resolution;
    canvas.height = resolution;
    canvas.style.display = "none";
    canvas.setAttribute("aria-hidden", "true");
    canvas.dataset.displacementBrush = "1";
    document.body.appendChild(canvas);

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, resolution, resolution);

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

    return () => {
      tex.dispose();
      canvas.remove();
      canvasRef.current = null;
      textureRef.current = null;
      setTexture(null);
    };
  }, [resolution]);

  const stamp = useCallback((nx: number, ny: number, radiusNorm = 0.1) => {
    const canvas = canvasRef.current;
    const tex = textureRef.current;
    if (!canvas || !tex) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const x = Math.min(1, Math.max(0, nx)) * canvas.width;
    const y = Math.min(1, Math.max(0, ny)) * canvas.height;
    const r = Math.max(6, radiusNorm * Math.min(canvas.width, canvas.height));

    // Solid soft circle (Larose draws filled arcs, then fades)
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.4, "rgba(255,255,255,0.5)");
    grad.addColorStop(1, "rgba(0,0,0,0)");

    ctx.globalCompositeOperation = "lighten";
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    tex.needsUpdate = true;
  }, []);

  const fade = useCallback(() => {
    const canvas = canvasRef.current;
    const tex = textureRef.current;
    if (!canvas || !tex) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Larose typically uses ~0.1 alpha black each frame
    ctx.fillStyle = "rgba(0,0,0,0.1)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    tex.needsUpdate = true;
  }, []);

  return { texture, stamp, fade };
}

/**
 * Bake a detailed water "photo" once — Larose displaces an image, not math color.
 */
export function createWaterImageTexture(size = 1024): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Depth gradient
  const bg = ctx.createLinearGradient(0, 0, 0, size);
  bg.addColorStop(0, "#1a6a78");
  bg.addColorStop(0.35, "#147a90");
  bg.addColorStop(0.65, "#0d3d4a");
  bg.addColorStop(1, "#0a121c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Caustic / ripple detail (high frequency so displacement reads)
  for (let i = 0; i < 180; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 20 + Math.random() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.04 + Math.random() * 0.08;
    g.addColorStop(0, `rgba(180, 230, 235, ${a})`);
    g.addColorStop(0.5, `rgba(80, 160, 170, ${a * 0.4})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Horizontal current streaks
  for (let i = 0; i < 40; i++) {
    const y = Math.random() * size;
    const h = 2 + Math.random() * 6;
    ctx.fillStyle = `rgba(120, 200, 210, ${0.03 + Math.random() * 0.06})`;
    ctx.fillRect(0, y, size, h);
  }

  // Fine noise
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
