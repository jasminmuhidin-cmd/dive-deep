import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { generatePathPoints, makePathTextures, pathRibbonGeometry, setPulse } from './geometry';

/**
 * Lit visitor path: a glowing core with a soft additive halo, generated from the
 * floor plan (see generatePathPoints). Optional pulse of light flowing entry → exit.
 */
export default function FloorPath({ plan, ...p }) {
  const { width, y, color, brightness, opacity, haloWidth, haloStrength, flow, flowSpeed, pulseSpacing } = p;

  const points = useMemo(
    () => generatePathPoints(plan, p),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, p.width, p.windiness, p.wavelength, p.phaseDeg, p.loopDepth, p.laneOffset, p.startOverhang, p.endX],
  );
  const core = useMemo(() => pathRibbonGeometry(points, width), [points, width]);
  const halo = useMemo(() => pathRibbonGeometry(points, width * haloWidth), [points, width, haloWidth]);
  const tex = useMemo(() => makePathTextures(), []);
  useLayoutEffect(() => () => [core, halo].forEach((g) => g.dispose()), [core, halo]);
  useLayoutEffect(() => () => [tex.pulse, tex.edge].forEach((t) => t.dispose()), [tex]);

  const glow = useMemo(() => new THREE.Color(color).multiplyScalar(brightness), [color, brightness]);

  // slide the pulse along the path
  const travelled = useRef(0);
  useLayoutEffect(() => setPulse(tex.pulse, pulseSpacing, travelled.current), [tex, pulseSpacing]);
  useFrame((_, dt) => {
    if (!flow) return;
    travelled.current += dt * flowSpeed;
    setPulse(tex.pulse, pulseSpacing, travelled.current);
  });

  return (
    <group>
      <mesh geometry={halo} position-y={y - 0.002}>
        <meshBasicMaterial
          color={glow}
          alphaMap={tex.edge}
          transparent
          opacity={haloStrength}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh geometry={core} position-y={y}>
        <meshBasicMaterial
          key={flow ? 'flow' : 'steady'} // adding/removing a map needs a fresh shader
          color={glow}
          map={flow ? tex.pulse : null}
          transparent
          opacity={opacity}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
