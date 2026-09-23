"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

const SIZE = 128;
const DAMPING = 0.985; // high = waves linger & stay jiggly
const CLIP = 2.5;

export type RippleSim = {
  texture: THREE.DataTexture | null;
  /** Drop a soft splash (nx/ny CSS 0–1, y from top). */
  splash: (nx: number, ny: number, radius?: number, pressure?: number) => void;
  /** Evolve the wave field — call once per frame. */
  step: () => void;
};

/**
 * Classic 2D height-field water: splash → expanding rings that keep moving.
 */
export function useRippleSim(): RippleSim {
  const currRef = useRef<Float32Array | null>(null);
  const prevRef = useRef<Float32Array | null>(null);
  const pixelsRef = useRef<Uint8Array | null>(null);
  const textureRef = useRef<THREE.DataTexture | null>(null);
  const [texture, setTexture] = useState<THREE.DataTexture | null>(null);

  useEffect(() => {
    const n = SIZE * SIZE;
    currRef.current = new Float32Array(n);
    prevRef.current = new Float32Array(n);
    const pixels = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      pixels[i * 4] = 128;
      pixels[i * 4 + 1] = 128;
      pixels[i * 4 + 2] = 128;
      pixels[i * 4 + 3] = 255;
    }
    pixelsRef.current = pixels;

    const tex = new THREE.DataTexture(pixels, SIZE, SIZE, THREE.RGBAFormat);
    tex.colorSpace = THREE.NoColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.flipY = true;
    tex.needsUpdate = true;

    textureRef.current = tex;
    setTexture(tex);

    return () => {
      tex.dispose();
      textureRef.current = null;
      currRef.current = null;
      prevRef.current = null;
      pixelsRef.current = null;
      setTexture(null);
    };
  }, []);

  const splash = useCallback(
    (nx: number, ny: number, radius = 14, pressure = 1.8) => {
      const curr = currRef.current;
      if (!curr) return;

      const cx = Math.floor(Math.min(1, Math.max(0, nx)) * (SIZE - 1));
      // CSS y from top → array y from top (flipY handles shader)
      const cy = Math.floor(Math.min(1, Math.max(0, ny)) * (SIZE - 1));
      const r = Math.max(4, radius);
      const r2 = r * r;

      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          const d2 = x * x + y * y;
          if (d2 > r2) continue;
          const px = cx + x;
          const py = cy + y;
          if (px < 1 || px >= SIZE - 1 || py < 1 || py >= SIZE - 1) continue;
          // Soft cosine falloff — big gentle drop
          const fall = 0.5 + 0.5 * Math.cos((Math.sqrt(d2) / r) * Math.PI);
          curr[py * SIZE + px] += pressure * fall;
        }
      }
    },
    [],
  );

  const step = useCallback(() => {
    const curr = currRef.current;
    const prev = prevRef.current;
    const pixels = pixelsRef.current;
    const tex = textureRef.current;
    if (!curr || !prev || !pixels || !tex) return;

    // Wave equation: average neighbors − previous, with damping
    for (let y = 1; y < SIZE - 1; y++) {
      for (let x = 1; x < SIZE - 1; x++) {
        const i = y * SIZE + x;
        let h =
          (curr[i - 1] +
            curr[i + 1] +
            curr[i - SIZE] +
            curr[i + SIZE]) /
            2 -
          prev[i];
        h *= DAMPING;
        if (h > CLIP) h = CLIP;
        if (h < -CLIP) h = -CLIP;
        prev[i] = h;
      }
    }

    // Swap buffers
    currRef.current = prev;
    prevRef.current = curr;

    // Encode height → texture (128 = calm)
    const height = currRef.current!;
    for (let i = 0; i < SIZE * SIZE; i++) {
      const v = Math.max(0, Math.min(255, height[i] * 48 + 128));
      pixels[i * 4] = v;
      pixels[i * 4 + 1] = v;
      pixels[i * 4 + 2] = v;
    }
    tex.needsUpdate = true;
  }, []);

  return { texture, splash, step };
}
