import { useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { ASSETS } from './layoutConfig';
import { DEG } from './geometry';

const { dir, obj: OBJ_FILE, mtl: MTL_FILE } = ASSETS.kiosk;

// One prepared template per loaded OBJ; every kiosk clones it (geometry + materials shared).
const templates = new WeakMap();

function buildTemplate(source, hideParts) {
  const root = source.clone(true);
  const strip = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (hideParts.some((p) => o.name.includes(p))) strip.push(o);
    else {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  strip.forEach((o) => o.removeFromParent());

  // Re-centre on its footprint, base sitting on y = 0
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  root.position.set(-center.x, -box.min.y, -center.z);
  const wrapper = new THREE.Group();
  wrapper.add(root);

  console.info(
    '[installation-3d] kiosk model size without backdrop (model units):',
    size.toArray().map((n) => +n.toFixed(3)),
  );
  return { object: wrapper, height: size.y || 1 };
}

function useKioskTemplate(hideParts) {
  const materials = useLoader(MTLLoader, dir + MTL_FILE, (loader) => loader.setResourcePath(dir));
  const source = useLoader(OBJLoader, dir + OBJ_FILE, (loader) => {
    materials.preload();
    loader.setMaterials(materials);
  });
  if (!templates.has(source)) templates.set(source, buildTemplate(source, hideParts));
  return templates.get(source);
}

/**
 * One kiosk from the .obj/.mtl. `model` holds the shared scale/orientation settings,
 * `position` is [x, z] on the floor and `rotationDeg` this kiosk's own turn.
 */
export default function Kiosk({ model, position, rotationDeg = 0 }) {
  const template = useKioskTemplate(model.hideParts);
  const instance = useMemo(() => template.object.clone(true), [template]);
  const fit = model.fitHeight ? model.fitHeight / template.height : 1;
  const s = fit * model.scale;
  return (
    <group position={[position[0], 0, position[1]]} rotation-y={(rotationDeg + model.rotationDeg) * DEG}>
      <primitive object={instance} scale={s} />
    </group>
  );
}

export function Kiosks({ model }) {
  return model.instances.map((k, i) => <Kiosk key={i} model={model} {...k} />);
}
