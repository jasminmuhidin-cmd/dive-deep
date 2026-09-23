"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  createWaterImageTexture,
  type LaroseRipples,
} from "./useLaroseRipples";

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Larose displacement over water + anonymous (blurred) prompt layer.
 * Revealed prompts are DOM — never go through this warp.
 */
const fragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uTexture;
  uniform sampler2D uDisplacement;
  uniform sampler2D uText;
  uniform float uTime;

  varying vec2 vUv;

  float PI = 3.141592653589793238;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec4 displacement = texture2D(uDisplacement, vUv);
    float theta = displacement.r * 2.0 * PI;
    vec2 dir = vec2(sin(theta), cos(theta));
    vec2 uv = vUv + dir * displacement.r * 0.08;

    vec4 color = texture2D(uTexture, clamp(uv, 0.001, 0.999));

    float ambient = fbm(vUv * 12.0 + uTime * 0.06) - 0.4;
    // Soft pearl shimmer on the surface
    color.rgb += vec3(0.08, 0.14, 0.16) * ambient * 0.35;
    // Slight lift so the whole field feels luminous
    color.rgb = mix(color.rgb, color.rgb * vec3(1.05, 1.08, 1.1) + vec3(0.04, 0.08, 0.1), 0.2);

    // Blurred teasers only — sampled with same warp
    vec4 text = texture2D(uText, clamp(uv, 0.001, 0.999));
    color.rgb = mix(color.rgb, text.rgb, text.a);

    gl_FragColor = color;
  }
`;

export function WaterPlane({
  ripples,
  textTexture,
}: {
  ripples: LaroseRipples;
  textTexture: THREE.CanvasTexture | null;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const blackTex = useMemo(() => {
    const data = new Uint8Array([0, 0, 0, 255]);
    const t = new THREE.DataTexture(data, 1, 1);
    t.needsUpdate = true;
    return t;
  }, []);

  const emptyText = useMemo(() => {
    const data = new Uint8Array([0, 0, 0, 0]);
    const t = new THREE.DataTexture(data, 1, 1);
    t.needsUpdate = true;
    return t;
  }, []);

  const waterTex = useMemo(() => createWaterImageTexture(1024), []);

  const uniforms = useMemo(
    () => ({
      uTexture: { value: waterTex as THREE.Texture },
      uDisplacement: { value: blackTex as THREE.Texture },
      uText: { value: emptyText as THREE.Texture },
      uTime: { value: 0 },
    }),
    [waterTex, blackTex, emptyText],
  );

  useEffect(() => {
    const mat = materialRef.current;
    const tex = ripples.texture ?? blackTex;
    uniforms.uDisplacement.value = tex;
    if (mat) mat.uniforms.uDisplacement.value = tex;
  }, [ripples.texture, blackTex, uniforms]);

  useEffect(() => {
    const mat = materialRef.current;
    const tex = textTexture ?? emptyText;
    uniforms.uText.value = tex;
    if (mat) mat.uniforms.uText.value = tex;
  }, [textTexture, emptyText, uniforms]);

  useEffect(() => {
    return () => {
      blackTex.dispose();
      emptyText.dispose();
      waterTex.dispose();
    };
  }, [blackTex, emptyText, waterTex]);

  useFrame((state) => {
    const mat = materialRef.current;
    if (!mat) return;
    if (ripples.texture) mat.uniforms.uDisplacement.value = ripples.texture;
    if (textTexture) {
      textTexture.needsUpdate = true;
      mat.uniforms.uText.value = textTexture;
    }
    mat.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
        transparent
      />
    </mesh>
  );
}
