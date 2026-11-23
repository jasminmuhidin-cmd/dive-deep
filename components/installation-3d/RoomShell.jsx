import { useLayoutEffect, useMemo } from 'react';
import { derivePlan, floorGeometry } from './geometry';
import CurvedWallImage from './CurvedWall';
import ExitWall from './ExitWall';
import StraightWall from './StraightWall';

function Floor({ plan, wallThickness, floor }) {
  const geo = useMemo(() => floorGeometry(plan, wallThickness, floor), [plan, wallThickness, floor]);
  useLayoutEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} rotation-x={-Math.PI / 2} receiveShadow>
      <meshStandardMaterial color={floor.color} roughness={0.95} />
    </mesh>
  );
}

/** Dark placeholder in the main room — concentric floor ripples go here later. */
export function RippleFloor({ center, radius, color }) {
  return (
    <mesh position={[center[0], 0.003, center[1]]} rotation-x={-Math.PI / 2} receiveShadow>
      <circleGeometry args={[radius, 96]} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}

function Divider({ start, end, height, thickness, color }) {
  const length = end[0] - start[0];
  return (
    <mesh position={[(start[0] + end[0]) / 2, height / 2, start[1]]} castShadow receiveShadow>
      <boxGeometry args={[length, height, thickness]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

function Pillar({ position, radius, height, color, glowColor, light }) {
  const [x, z] = position;
  return (
    <group position={[x, 0, z]}>
      <mesh position-y={height / 2} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius, height, 48]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.3} />
      </mesh>
      {/* the light you tap your phone on */}
      <mesh position-y={height + 0.002} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[radius * 0.8, 48]} />
        <meshBasicMaterial color={glowColor} toneMapped={false} />
      </mesh>
      <mesh position-y={0.007} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[radius + 0.08, radius + 0.22, 64]} />
        <meshBasicMaterial color={glowColor} transparent opacity={0.6} toneMapped={false} />
      </mesh>
      <pointLight
        position-y={height + 0.3}
        color={light.color}
        intensity={light.intensity}
        distance={light.distance}
        decay={2}
      />
    </group>
  );
}

/** Floor + every wall of the U, generated from `layout.plan`. */
export default function RoomShell({ layout }) {
  const { plan, floor, curvedWall, exitWall, entryWall, divider, rippleFloor, pillar, lighting, cutaway, capColor } =
    layout;
  const derived = useMemo(() => derivePlan(plan), [plan]);
  return (
    <group>
      <Floor plan={plan} wallThickness={curvedWall.thickness} floor={floor} />
      <RippleFloor {...rippleFloor} />
      <CurvedWallImage
        plan={plan}
        wall={curvedWall}
        lights={lighting.wallLights}
        cutaway={cutaway}
        capColor={capColor}
      />
      <ExitWall {...exitWall} {...derived.exitWall} cutaway={cutaway} capColor={capColor} />
      <StraightWall {...entryWall} {...derived.entryWall} cutaway={cutaway} capColor={capColor} />
      <Divider {...divider} {...derived.divider} thickness={plan.dividerThickness} />
      <Pillar {...pillar} light={lighting.pillarLight} />
    </group>
  );
}
