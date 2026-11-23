import { useMemo } from 'react';
import { button, folder, levaStore, useControls } from 'leva';
import base from './layoutConfig';
import saved from './savedLayout.json';

const num = (value, min, max, step = 0.01) => ({ value, min, max, step });
const xz = (value) => ({ value, step: 0.05 });

/**
 * Swap each control's default for the value saved from the panel (savedLayout.json),
 * keyed by leva path, e.g. "Lighting.ambient" or "Path.Shape.width".
 */
function withSaved(prefix, schema) {
  return Object.fromEntries(
    Object.entries(schema).map(([key, input]) => {
      const path = `${prefix}.${key}`;
      if (input?.type === 'FOLDER') return [key, { ...input, schema: withSaved(path, input.schema) }];
      if (!(path in saved)) return [key, input];
      let value = saved[path];
      const current = input !== null && typeof input === 'object' && 'value' in input ? input.value : input;
      if (Array.isArray(current) && value && typeof value === 'object' && !Array.isArray(value)) value = Object.values(value);
      if (typeof value !== typeof current) return [key, input]; // control changed type since saving
      return [key, current === input ? value : { ...input, value }];
    }),
  );
}

/** Current panel values (minus buttons), keyed by leva path. */
function panelValues() {
  return Object.fromEntries(
    Object.entries(levaStore.getData())
      .filter(([, input]) => 'value' in input && !input.type?.startsWith?.('BUTTON'))
      .map(([path, input]) => [path, input.value]),
  );
}

async function saveValues(values, done) {
  try {
    const res = await fetch('/api/installation-layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
    console.log(`[installation-3d] ${done}`);
  } catch (err) {
    console.error('[installation-3d] could not save the layout:', err);
    alert(`Could not save the layout: ${err.message}`);
  }
}

/**
 * Leva panel wired to layoutConfig.js. Returns a layout object with the same
 * shape as the config, with live tweaks merged in. Defaults always come from
 * the config file — use "Log values" to copy tweaks back into it.
 */
export default function useLayoutControls({ onResetCamera } = {}) {
  const L = base.lighting;
  const P = base.plan;

  const plan = useControls('Floor plan', withSaved('Floor plan', {
    hallWidth: { label: 'hallway width', ...num(P.hallWidth, 1.5, 8, 0.05) },
    hallLength: { label: 'hallway length', ...num(P.hallLength, 2, 20, 0.05) },
    mainRoomDepth: { label: 'main room depth', ...num(P.mainRoomDepth, 0, 12, 0.05) },
    curveDepth: { label: 'curve depth', ...num(P.curveDepth, 0.5, 10, 0.05) },
    dividerThickness: { label: 'divider thick', ...num(P.dividerThickness, 0.05, 1, 0.01) },
    wallHeight: { label: 'wall height', ...num(base.curvedWall.height, 1.5, 6, 0.05) },
    dividerHeight: { label: 'divider height', ...num(base.divider.height, 0.5, 6, 0.05) },
    cutaway: { label: 'cutaway walls', value: base.cutaway },
    Floor: folder({
      floorMargin: { label: 'outside walls', ...num(base.floor.margin, 0, 5, 0.05) },
      floorEnd: { label: 'past hall ends', ...num(base.floor.endExtension, 0, 6, 0.05) },
      floorColor: { label: 'colour', value: base.floor.color },
    }),
  }));

  const light = useControls(
    'Lighting',
    withSaved('Lighting', {
      ambient: num(L.ambient.intensity, 0, 3),
      hemisphere: num(L.hemisphere.intensity, 0, 3),
      key: num(L.key.intensity, 0, 6),
      keyPosition: { value: L.key.position, step: 0.5 },
      shadows: L.key.shadows,
      wallGlow: num(base.curvedWall.glow, 0, 3),
      wallLights: num(L.wallLights.intensity, 0, 40, 0.1),
      pillarLight: num(L.pillarLight.intensity, 0, 20, 0.1),
    }),
    { collapsed: true },
  );

  const kiosk = useControls(
    'Kiosks',
    withSaved('Kiosks', {
      autoFit: { value: base.kiosk.fitHeight != null, label: 'auto-fit height' },
      fitHeight: { ...num(base.kiosk.fitHeight ?? 1.24, 0.3, 3), render: (get) => get('Kiosks.autoFit') },
      scale: num(base.kiosk.scale, 0.1, 5),
      rotationDeg: { label: 'model rotation', ...num(base.kiosk.rotationDeg, -180, 180, 1) },
      ...Object.fromEntries(
        base.kiosk.instances.map((k, i) => [
          `kiosk ${i + 1}`,
          folder(
            {
              [`k${i}pos`]: { label: 'position', ...xz(k.position) },
              [`k${i}rot`]: { label: 'rotation', ...num(k.rotationDeg, -180, 180, 1) },
            },
            { collapsed: true },
          ),
        ]),
      ),
    }),
    { collapsed: true },
  );

  const B = base.beanbags;
  const bags = useControls(
    'Beanbags',
    withSaved('Beanbags', {
      bagScale: { label: 'size', ...num(B.scale, 0.3, 2.5, 0.05) },
      bagColor: { label: 'colour', value: B.color },
      rugColor: { label: 'rug colour', value: B.rugColor },
      ...Object.fromEntries(
        B.rugs.flatMap((rug, i) => [
          [`rug${i}pos`, { label: `rug ${i + 1}`, ...xz(rug.center) }],
          [`rug${i}r`, { label: `rug ${i + 1} radius`, ...num(rug.radius, 0.3, 3, 0.05) }],
        ]),
      ),
    }),
    { collapsed: true },
  );

  const other = useControls(
    'Objects',
    withSaved('Objects', {
      pillarPos: { label: 'pillar', ...xz(base.pillar.position) },
      pillarHeight: { label: 'pillar height', ...num(base.pillar.height, 0.3, 4, 0.05) },
      rippleCenter: { label: 'ripple zone', ...xz(base.rippleFloor.center) },
      rippleRadius: { label: 'ripple radius', ...num(base.rippleFloor.radius, 0.5, 6, 0.05) },
    }),
    { collapsed: true },
  );

  const BN = base.banners;
  const banners = useControls(
    'Banners',
    withSaved('Banners', {
      count: num(BN.count, 0, 40, 1),
      zone: { label: 'hallway', value: BN.zone, options: ['entry', 'exit', 'both'] },
      fromX: { label: 'from x', ...num(BN.fromX, -6, 20, 0.05) },
      toX: { label: 'to x', ...num(BN.toX, -6, 20, 0.05) },
      stagger: { label: 'lane spread', ...num(BN.stagger, 0, 3, 0.05) },
      rotationDeg: { label: 'facing', ...num(BN.rotationDeg, -180, 180, 1) },
      turnDeg: { label: 'lane angle', ...num(BN.turnDeg, 0, 90, 1) },
      jitter: { label: 'randomness', ...num(BN.jitter, 0, 1, 0.01) },
      clearance: { label: 'kiosk clearance', ...num(BN.clearance, 0, 2, 0.05) },
      seed: { label: 'shuffle', ...num(BN.seed, 1, 99, 1) },
      bottomY: { label: 'bottom height', ...num(BN.bottomY, 0, 3, 0.05) },
      bannerScale: { label: 'size', ...num(1, 0.3, 3, 0.05) },
      opacity: num(BN.opacity, 0, 1, 0.01),
      backed: { label: 'opaque backing', value: BN.backing != null },
    }),
    { collapsed: true },
  );

  const RC = base.exitWall.receipts;
  const receipts = useControls(
    'Receipts',
    withSaved('Receipts', {
      count: num(RC.count, 0, 150, 1),
      fromU: { label: 'from (m along wall)', ...num(RC.fromU, 0, 20, 0.05) },
      toU: { label: 'to (m along wall)', ...num(RC.toU, 0, 20, 0.05) },
      fromY: { label: 'lowest', ...num(RC.fromY, 0, 4, 0.05) },
      toY: { label: 'highest', ...num(RC.toY, 0, 4, 0.05) },
      height: { label: 'size', ...num(RC.height, 0.05, 1, 0.01) },
      scatter: { label: 'messiness', ...num(RC.scatter, 0, 1, 0.01) },
      tiltDeg: { label: 'tilt', ...num(RC.tiltDeg, 0, 45, 1) },
      seed: { label: 'shuffle', ...num(RC.seed, 1, 99, 1) },
    }),
    { collapsed: true },
  );

  const F = base.floorPath;
  const path = useControls(
    'Path',
    withSaved('Path', {
      Shape: folder({
        width: num(F.width, 0.1, 2, 0.05),
        windiness: num(F.windiness, 0, 2, 0.05),
        wavelength: { label: 'bend length', ...num(F.wavelength, 0.5, 15, 0.1) },
        phaseDeg: { label: 'bend shift', ...num(F.phaseDeg, -180, 180, 1) },
        loopDepth: { label: 'loop depth', ...num(F.loopDepth, 0.2, 10, 0.05) },
        laneOffset: { label: 'lane offset', ...num(F.laneOffset, -1.5, 1.5, 0.05) },
        startOverhang: { label: 'start past end', ...num(F.startOverhang, -4, 3, 0.05) },
        endX: { label: 'end x', ...num(F.endX, 0.5, 20, 0.05) },
      }),
      Light: folder({
        color: { label: 'colour', value: F.color },
        brightness: num(F.brightness, 0, 2, 0.01),
        opacity: num(F.opacity, 0, 1, 0.01),
        haloWidth: { label: 'halo width', ...num(F.haloWidth, 1, 6, 0.05) },
        haloStrength: { label: 'halo strength', ...num(F.haloStrength, 0, 1, 0.01) },
        flow: { label: 'flowing pulse', value: F.flow },
        flowSpeed: { label: 'pulse speed', ...num(F.flowSpeed, 0, 4, 0.05), render: (get) => get('Path.Light.flow') },
        pulseSpacing: { label: 'pulse spacing', ...num(F.pulseSpacing, 0.5, 12, 0.1), render: (get) => get('Path.Light.flow') },
      }),
    }),
    { collapsed: true },
  );

  useControls('Tools', {
    'Reset camera': button(() => onResetCamera?.()),
    'Save as default': button(() => saveValues(panelValues(), 'saved to savedLayout.json')),
    'Forget saved': button(() => {
      if (confirm('Go back to the values in layoutConfig.js? (reload the page afterwards)')) {
        saveValues({}, 'cleared savedLayout.json');
      }
    }),
    'Log values': button(() => {
      const json = JSON.stringify(panelValues(), null, 2);
      console.log('[installation-3d] current leva values:\n' + json);
      navigator.clipboard?.writeText(json).catch(() => {});
    }),
  });

  // Rebuild the derived layout only when a value actually changes (keeps geometry memoised)
  const key = JSON.stringify({ plan, light, kiosk, bags, other, path, banners, receipts });
  return useMemo(() => {
    const wallH = plan.wallHeight;
    return {
      ...base,
      plan: {
        hallWidth: plan.hallWidth,
        hallLength: plan.hallLength,
        mainRoomDepth: plan.mainRoomDepth,
        curveDepth: plan.curveDepth,
        dividerThickness: plan.dividerThickness,
      },
      floor: { color: plan.floorColor, margin: plan.floorMargin, endExtension: plan.floorEnd },
      cutaway: plan.cutaway,
      curvedWall: { ...base.curvedWall, height: wallH, glow: light.wallGlow },
      exitWall: { ...base.exitWall, height: wallH, receipts: { ...RC, ...receipts } },
      entryWall: { ...base.entryWall, height: wallH },
      divider: { ...base.divider, height: plan.dividerHeight },
      lighting: {
        ...L,
        ambient: { ...L.ambient, intensity: light.ambient },
        hemisphere: { ...L.hemisphere, intensity: light.hemisphere },
        key: { ...L.key, intensity: light.key, position: light.keyPosition, shadows: light.shadows },
        wallLights: { ...L.wallLights, intensity: light.wallLights },
        pillarLight: { ...L.pillarLight, intensity: light.pillarLight },
      },
      floorPath: { ...F, ...path },
      pillar: { ...base.pillar, position: other.pillarPos, height: other.pillarHeight },
      rippleFloor: { ...base.rippleFloor, center: other.rippleCenter, radius: other.rippleRadius },
      banners: (({ bannerScale, backed, ...rest }) => ({
        ...BN,
        ...rest,
        ceilingY: wallH, // wires reach the top of the walls
        size: BN.size.map((v) => v * bannerScale),
        backing: backed ? BN.backing ?? '#eef1f4' : null,
      }))(banners),
      beanbags: {
        ...B,
        scale: bags.bagScale,
        color: bags.bagColor,
        rugColor: bags.rugColor,
        rugs: B.rugs.map((rug, i) => ({ ...rug, center: bags[`rug${i}pos`], radius: bags[`rug${i}r`] })),
      },
      kiosk: {
        ...base.kiosk,
        fitHeight: kiosk.autoFit ? kiosk.fitHeight : null,
        scale: kiosk.scale,
        rotationDeg: kiosk.rotationDeg,
        instances: base.kiosk.instances.map((k, i) => ({
          position: kiosk[`k${i}pos`],
          rotationDeg: kiosk[`k${i}rot`],
        })),
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
