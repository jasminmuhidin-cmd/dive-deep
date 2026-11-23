import * as THREE from 'three';

/**
 * A straight wall from `start` to `end` ([x, z]). Its face points to the left of
 * that direction (into the room) and its thickness goes behind. Children are
 * placed in wall-local space: x = metres along the wall, y = height, z = off the face.
 * With `cutaway`, the face disappears when seen from behind; the top edge stays.
 */
export default function StraightWall({ start, end, height, thickness, color, capColor, cutaway, children }) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length = Math.hypot(dx, dz);
  return (
    <group position={[start[0], 0, start[1]]} rotation-y={-Math.atan2(dz, dx)}>
      <mesh position={[length / 2, height / 2, 0]} receiveShadow>
        <planeGeometry args={[length, height]} />
        <meshStandardMaterial
          color={color}
          roughness={0.95}
          side={cutaway ? THREE.FrontSide : THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[length / 2, height, -thickness / 2]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[length, thickness]} />
        <meshStandardMaterial color={capColor} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {children}
    </group>
  );
}
