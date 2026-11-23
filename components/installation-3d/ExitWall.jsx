import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { DEG, generateReceipts, prepTexture } from './geometry';
import StraightWall from './StraightWall';

const aspectOf = (tex) => (tex.image?.width ? tex.image.width / tex.image.height : 1);

/**
 * Outer wall of the exit hallway, with the "thank you" mural and the receipts.
 * Mural and receipts are placed by `u` = metres along the wall from the main-room end.
 */
export default function ExitWall({ start, end, mural, receipts, cutaway, ...wall }) {
  const gl = useThree((s) => s.gl);
  const [muralTex, receiptTex] = useTexture([mural.texture, receipts.texture]);
  useLayoutEffect(() => {
    prepTexture(muralTex, gl);
    prepTexture(receiptTex, gl);
  }, [muralTex, receiptTex, gl]);

  const receiptItems = useMemo(() => generateReceipts(receipts), [receipts]);
  const side = cutaway ? THREE.FrontSide : THREE.DoubleSide;
  const muralW = mural.height * aspectOf(muralTex);
  const receiptW = receipts.height * aspectOf(receiptTex);

  return (
    <StraightWall start={start} end={end} cutaway={cutaway} {...wall}>
      <mesh position={[mural.u, mural.centerY, mural.offset]} receiveShadow>
        <planeGeometry args={[muralW, mural.height]} />
        <meshStandardMaterial map={muralTex} roughness={0.95} side={side} />
      </mesh>
      {receiptItems.map(([u, y, rot], i) => (
        <mesh key={i} position={[u, y, receipts.offset]} rotation-z={rot * DEG}>
          <planeGeometry args={[receiptW, receipts.height]} />
          <meshStandardMaterial map={receiptTex} transparent alphaTest={0.05} roughness={0.8} side={side} />
        </mesh>
      ))}
    </StraightWall>
  );
}
