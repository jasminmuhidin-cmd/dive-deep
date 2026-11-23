import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import {
  capGeometry,
  fitTextureToWall,
  mainRoomWallPath,
  pointsAlong,
  prepTexture,
  wallRibbonGeometry,
} from './geometry';

/**
 * The main room's projection wall (straight runs + curved end). Takes ANY
 * THREE.Texture via `texture`, so the still image can later be swapped for a
 * live CanvasTexture/VideoTexture from the ripple screen without touching the geometry.
 */
export function CurvedWall({ plan, wall, texture, lights, cutaway, capColor }) {
  const { height, thickness, glow, textureFit, segments } = wall;

  const { inner, cap, length, lightPositions } = useMemo(() => {
    const innerPts = mainRoomWallPath(plan, 0, segments);
    const outerPts = mainRoomWallPath(plan, thickness, segments);
    const innerGeo = wallRibbonGeometry(innerPts, height);
    const fractions = Array.from({ length: lights.count }, (_, i) => (i + 0.5) / lights.count);
    return {
      inner: innerGeo,
      cap: capGeometry(innerPts, outerPts, height),
      length: innerGeo.userData.length,
      lightPositions: pointsAlong(innerPts, fractions, lights.inset),
    };
  }, [plan, height, thickness, segments, lights.count, lights.inset]);

  useLayoutEffect(() => () => [inner, cap].forEach((g) => g.dispose()), [inner, cap]);

  // Keep the projection's aspect ratio by repeating it along the wall
  useLayoutEffect(() => {
    if (texture) fitTextureToWall(texture, length, height, textureFit);
  }, [texture, textureFit, length, height]);

  return (
    <group>
      <mesh geometry={inner} receiveShadow>
        <meshStandardMaterial
          color="#000000"
          emissive="#ffffff"
          emissiveMap={texture ?? null}
          emissiveIntensity={glow}
          roughness={0.9}
          side={cutaway ? THREE.FrontSide : THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={cap}>
        <meshStandardMaterial color={capColor} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {lightPositions.map(([x, z], i) => (
        <pointLight
          key={i}
          position={[x, lights.y, z]}
          color={lights.color}
          intensity={lights.intensity}
          distance={lights.distance}
          decay={2}
        />
      ))}
    </group>
  );
}

/** First-pass version: the wall showing the static ripple-wall image. */
export default function CurvedWallImage(props) {
  const gl = useThree((s) => s.gl);
  const tex = useTexture(props.wall.texture);
  useLayoutEffect(() => void prepTexture(tex, gl), [tex, gl]);
  return <CurvedWall {...props} texture={tex} />;
}
