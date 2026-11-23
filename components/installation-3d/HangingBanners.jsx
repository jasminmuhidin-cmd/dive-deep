import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { Line, useTexture } from '@react-three/drei';
import { ASSETS } from './layoutConfig';
import { DEG, generateBanners, prepTexture } from './geometry';

function Banner({ texture, size, bottomY, ceilingY, backing, wireColor, position, rotationDeg, opacity = 1 }) {
  const [w, h] = size;
  const solid = opacity >= 0.99;
  const shadow = opacity >= 0.5; // faint banners shouldn't cast a full black shadow
  const cy = bottomY + h / 2;
  const top = h / 2;
  const rise = ceilingY - cy;
  return (
    <group position={[position[0], cy, position[1]]} rotation-y={rotationDeg * DEG}>
      {backing && (
        <mesh castShadow={shadow} receiveShadow>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial
            color={backing}
            roughness={0.95}
            side={THREE.DoubleSide}
            transparent={!solid}
            opacity={opacity}
            depthWrite={solid}
          />
        </mesh>
      )}
      <mesh position-z={backing ? 0.003 : 0} castShadow={!backing && shadow}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial
          map={texture}
          transparent
          opacity={opacity}
          depthWrite={solid}
          alphaTest={0.02}
          roughness={0.95}
          side={backing ? THREE.FrontSide : THREE.DoubleSide}
        />
      </mesh>
      {/* two hanging wires, from the banner's top edge up to the top of the walls */}
      {rise > top && [-1, 1].map((side) => (
        <Line
          key={side}
          points={[
            [(side * w) / 2.4, top, 0],
            [(side * w) / 2.4, rise, 0],
          ]}
          color={wireColor}
          lineWidth={1}
          transparent
          opacity={0.7}
        />
      ))}
    </group>
  );
}

export default function HangingBanners({ banners, plan, kiosks }) {
  const gl = useThree((s) => s.gl);
  const textures = useTexture(ASSETS.banners);
  useLayoutEffect(() => textures.forEach((t) => prepTexture(t, gl)), [textures, gl]);

  const items = useMemo(
    () => generateBanners(plan, banners, kiosks, textures.length),
    [plan, banners, kiosks, textures.length],
  );
  const { size, bottomY, ceilingY, backing, wireColor, opacity } = banners;
  return items.map((b, i) => (
    <Banner
      key={i}
      {...{ size, bottomY, ceilingY, backing, wireColor, opacity }}
      {...b}
      texture={textures[b.texture]}
    />
  ));
}
