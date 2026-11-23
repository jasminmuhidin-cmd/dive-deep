import { useLayoutEffect, useMemo } from 'react';
import { beanbagGeometry, DEG } from './geometry';

/** Round rugs with beanbags on them, for the middle of the main room. */
export default function BeanBags({ rugs, color, rugColor, scale }) {
  const bagGeo = useMemo(() => beanbagGeometry(), []);
  useLayoutEffect(() => () => bagGeo.dispose(), [bagGeo]);

  return rugs.map((rug, r) => (
    <group key={r} position={[rug.center[0], 0, rug.center[1]]}>
      <mesh position-y={0.012} receiveShadow>
        <cylinderGeometry args={[rug.radius, rug.radius, 0.02, 72]} />
        <meshStandardMaterial color={rugColor} roughness={1} />
      </mesh>
      {rug.bags.map(([dx, dz, rot, s = 1], i) => (
        <mesh
          key={i}
          geometry={bagGeo}
          position={[dx, 0.022, dz]}
          rotation-y={rot * DEG}
          scale={[s * scale, s * scale * 0.95, s * scale * 1.04]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
      ))}
    </group>
  ));
}
