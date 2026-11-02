"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GpuRippleSim } from "./GpuRippleSim";
import { HandWaveController } from "./HandWaveController";
import { BodyField } from "./BodyField";
import { OutlineFX } from "./OutlineFX";
import { FX } from "./fxConfig";
import { WaterPlane, type FocusSpot, type SurfaceSpot } from "../WaterPlane";
import type { BodyVisionFrame } from "./useBodyVision";
import type { ClearZone } from "./clearZones";

export type FxApi = {
  /** Screen uv (y down). radius in screen-height units. */
  drop: (x: number, y: number, radius?: number, strength?: number) => void;
  /** Finger touch → slow concentric ring train. */
  touch: (x: number, y: number, strength?: number, radius?: number) => void;
  /** Live wave state, e.g. for a debug HUD. */
  waves: HandWaveController;
  /** Body layer (proximity / visibility, for the debug HUD). */
  body: () => BodyField | null;
};

/**
 * Everything inside the R3F <Canvas>, per frame (priority −1, before draw):
 *
 *   vision frame ─┬─► HandWaveController ─► calm wave params + hand wakes
 *                 └─► BodyField ─► mask texture (contours) + metaball field
 *   touches ─────────► GpuRippleSim ◄─ hand wakes
 *   all of it ───────► WaterPlane composite (one full-screen pass)
 */
export function FxLayer({
  frameRef,
  apiRef,
  textTexture,
  focusRef,
  clearZonesRef,
  spotsRef,
}: {
  frameRef: React.RefObject<BodyVisionFrame>;
  apiRef: React.MutableRefObject<FxApi | null>;
  textTexture: THREE.CanvasTexture | null;
  focusRef?: React.RefObject<FocusSpot | null>;
  clearZonesRef?: React.RefObject<ClearZone[]>;
  /** Tapped thoughts (water deepens beneath; one fish surfaces at each). */
  spotsRef?: React.RefObject<SurfaceSpot[]>;
}) {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const aspect = size.width / Math.max(1, size.height);
  const aspectKey = Math.round(aspect * 100);
  const fieldW = Math.max(64, Math.round((size.width * dpr) / 2));
  const fieldH = Math.max(64, Math.round((size.height * dpr) / 2));

  const waves = useMemo(() => new HandWaveController(), []);
  const [sim, setSim] = useState<GpuRippleSim | null>(null);
  const [body, setBody] = useState<BodyField | null>(null);
  const bodyRef = useRef<BodyField | null>(null);
  bodyRef.current = body;

  useEffect(() => {
    const s = new GpuRippleSim(gl, aspectKey / 100);
    setSim(s);
    apiRef.current = {
      drop: (x, y, r, k) => s.drop(x, y, r, k),
      touch: (x, y, k, r) => s.touch(x, y, k, r),
      waves,
      body: () => bodyRef.current,
    };
    return () => {
      apiRef.current = null;
      s.dispose();
    };
  }, [gl, aspectKey, apiRef, waves]);

  useEffect(() => {
    const b = new BodyField(gl, aspectKey / 100, fieldW, fieldH);
    setBody(b);
    return () => b.dispose();
  }, [gl, aspectKey, fieldW, fieldH]);

  const [outline, setOutline] = useState<OutlineFX | null>(null);
  useEffect(() => {
    if (!FX.outlineFX.enabled) return;
    const o = new OutlineFX(gl, fieldW, fieldH);
    setOutline(o);
    return () => o.dispose();
  }, [gl, fieldW, fieldH]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    // Fades/trails use real elapsed time (only the wave sim needs the cap),
    // so trails never linger on a slow machine.
    const realDt = Math.min(delta, 1);
    const f = frameRef.current;
    if (f) waves.update(f, aspect, dt);
    if (sim) {
      sim.setWakes(waves.hands);
      sim.step(dt);
    }
    if (body && f) body.update(f, realDt, state.clock.elapsedTime, sim, waves.hands);
    if (outline && body && f)
      outline.update({
        mask: body.maskTexture,
        aspect,
        camAspect: f.camAspect,
        visibility: body.visibility,
        presence: body.presence,
        hands: waves.hands,
        dt: realDt,
        time: state.clock.elapsedTime,
      });
  }, -1);

  return (
    <WaterPlane
      sim={sim}
      waves={waves}
      body={body}
      outline={outline}
      textTexture={textTexture}
      aspect={aspect}
      camAspect={() => frameRef.current?.camAspect ?? 4 / 3}
      focusRef={focusRef}
      clearZonesRef={clearZonesRef}
      spotsRef={spotsRef}
    />
  );
}
