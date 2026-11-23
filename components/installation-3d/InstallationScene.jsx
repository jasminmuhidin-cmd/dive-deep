'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Loader, OrbitControls, OrthographicCamera } from '@react-three/drei';
import { Leva } from 'leva';
import useLayoutControls from './useLayoutControls';
import { derivePlan, DEG } from './geometry';
import RoomShell from './RoomShell';
import BeanBags from './BeanBags';
import { Kiosks } from './Kiosk';
import HangingBanners from './HangingBanners';
import FloorPath from './FloorPath';

/** Centre + generous bounds of the U plan, used for the orbit target and pan clamp. */
function planFrame(layout) {
  const { R, xMin, xMax } = derivePlan(layout.plan);
  const pad = 1.5;
  return {
    center: [(xMin + xMax) / 2, 1, 0],
    min: new THREE.Vector3(xMin - pad, 0, -R - pad),
    max: new THREE.Vector3(xMax + pad, 3, R + pad),
  };
}

function CameraRig({ layout, controlsRef, zoomTarget, embedded, touch }) {
  const cfg = layout.camera;
  // camera framing is fixed at load; "Reset camera" returns here
  const [initial] = useState(() => {
    const { center } = planFrame(layout);
    return { target: center, position: center.map((v, i) => v + cfg.offset[i]) };
  });
  const bounds = useRef(planFrame(layout));
  useEffect(() => {
    bounds.current = planFrame(layout);
  }, [layout]);
  const before = useRef(new THREE.Vector3());

  // Embedded zoom (buttons / pinch) eases the camera toward a target instead of jumping
  useFrame(({ camera }, dt) => {
    const goal = zoomTarget?.current;
    if (goal == null || Math.abs(camera.zoom - goal) < 0.01) return;
    camera.zoom += (goal - camera.zoom) * Math.min(1, dt * 8);
    camera.updateProjectionMatrix();
  });

  // Keep the orbit target inside the room so panning can never lose the model
  const clampTarget = useCallback(() => {
    const c = controlsRef.current;
    if (!c) return;
    before.current.copy(c.target);
    c.target.clamp(bounds.current.min, bounds.current.max);
    c.object.position.add(before.current.sub(c.target).negate());
  }, [controlsRef]);

  return (
    <>
      <OrthographicCamera makeDefault position={initial.position} zoom={cfg.zoom} near={0.1} far={200} />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={initial.target}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.6}
        zoomSpeed={0.8}
        minZoom={cfg.minZoom}
        maxZoom={cfg.maxZoom}
        minPolarAngle={cfg.minPolarDeg * DEG}
        maxPolarAngle={cfg.maxPolarDeg * DEG}
        onChange={clampTarget}
        // Inside a page, the wheel scrolls the page and phones swipe past the scene
        enabled={!(embedded && touch)}
        enableZoom={!embedded}
        enablePan={!embedded}
      />
    </>
  );
}

function Lights({ lighting }) {
  const { ambient, hemisphere, key } = lighting;
  return (
    <>
      <ambientLight color={ambient.color} intensity={ambient.intensity} />
      <hemisphereLight args={[hemisphere.sky, hemisphere.ground, hemisphere.intensity]} />
      <directionalLight
        color={key.color}
        intensity={key.intensity}
        position={key.position}
        castShadow={key.shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-near={1}
        shadow-camera-far={50}
      />
    </>
  );
}

const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

/**
 * `embedded` renders the same model inside a page section (e.g. /about) instead of
 * full-screen: no layout panel unless ?debug, no hint bar, and no plain wheel-zoom or touch
 * capture so the page still scrolls; zoom is via +/− buttons or pinch / ctrl+scroll instead. The model itself is identical in both modes.
 */
export default function InstallationScene({ embedded = false }) {
  const controlsRef = useRef(null);
  const [debug, setDebug] = useState(() => {
    const flag = new URLSearchParams(window.location.search).has('debug');
    return embedded ? flag : process.env.NODE_ENV !== 'production' || flag;
  });
  const [touch] = useState(() => window.matchMedia('(pointer: coarse)').matches);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key.toLowerCase() === 'd' && !e.metaKey && !e.ctrlKey && !isTyping(document.activeElement)) {
        setDebug((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const zoomTarget = useRef(null);
  const containerRef = useRef(null);
  const layout = useLayoutControls({
    onResetCamera: () => {
      controlsRef.current?.reset();
      zoomTarget.current = null;
    },
  });
  const { minZoom, maxZoom } = layout.camera;

  // Embedded: the wheel scrolls the page, so zoom comes from the buttons or a pinch
  // (trackpad pinch and ctrl/⌘+scroll arrive as a wheel event with ctrlKey set)
  const zoomBy = useCallback(
    (factor) => {
      const cam = controlsRef.current?.object;
      if (!cam) return;
      const from = zoomTarget.current ?? cam.zoom;
      zoomTarget.current = THREE.MathUtils.clamp(from * factor, minZoom, maxZoom);
    },
    [minZoom, maxZoom],
  );
  useEffect(() => {
    const el = containerRef.current;
    if (!embedded || !el) return;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY * 0.01));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [embedded, zoomBy]);

  return (
    <div
      ref={containerRef}
      style={{
        position: embedded ? 'absolute' : 'fixed',
        inset: 0,
        background: layout.background,
        pointerEvents: embedded && touch ? 'none' : undefined,
      }}
    >
      <Leva hidden={!debug} collapsed={false} titleBar={{ title: 'installation layout' }} />
      <Canvas shadows="percentage" flat dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={[layout.background]} />
        <CameraRig layout={layout} controlsRef={controlsRef} zoomTarget={zoomTarget} embedded={embedded} touch={touch} />
        <Lights lighting={layout.lighting} />
        <Suspense fallback={null}>
          <RoomShell layout={layout} />
          <BeanBags {...layout.beanbags} />
          <FloorPath plan={layout.plan} {...layout.floorPath} />
          <HangingBanners banners={layout.banners} plan={layout.plan} kiosks={layout.kiosk.instances} />
          <Kiosks model={layout.kiosk} />
        </Suspense>
      </Canvas>
      <Loader />
      {embedded && (
        <div className="installation-zoom" role="group" aria-label="Zoom the model">
          <button type="button" onClick={() => zoomBy(1.35)} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => zoomBy(1 / 1.35)} aria-label="Zoom out">−</button>
        </div>
      )}
      {!embedded && <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: 14,
          font: '12px/1.4 ui-monospace, monospace',
          color: 'rgba(200,215,235,0.55)',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        drag to orbit · right-drag to pan · scroll to zoom · D toggles the layout panel
      </div>}
    </div>
  );
}
