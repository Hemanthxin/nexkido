"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const IMG = "/images/road.jpg";
const DEPTH = "/images/road-depth.png";

const vert = /* glsl */ `
  uniform sampler2D uDepth; uniform float uStrength;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z += (texture2D(uDepth, uv).r - 0.25) * uStrength;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const frag = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(texture2D(uMap, vUv).rgb, 1.0);
    #include <colorspace_fragment>
  }`;

function Photo({ map, depth, progress }: { map: THREE.Texture; depth: THREE.Texture; progress: React.MutableRefObject<number> }) {
  const img = map.image as HTMLImageElement;
  const aspect = img.width / img.height;
  const uniforms = useMemo(() => ({ uMap: { value: map }, uDepth: { value: depth }, uStrength: { value: 1.6 } }), [map, depth]);
  const ptr = useRef({ x: 0, y: 0, sx: 0, sy: 0 });
  const z = useRef(5.8);

  useEffect(() => {
    const move = (e: PointerEvent) => { ptr.current.x = (e.clientX / innerWidth) * 2 - 1; ptr.current.y = -((e.clientY / innerHeight) * 2 - 1); };
    addEventListener("pointermove", move);
    return () => removeEventListener("pointermove", move);
  }, []);

  useFrame((s, dt) => {
    const k = 1 - Math.pow(0.002, dt), q = ptr.current;
    q.sx += (q.x - q.sx) * k; q.sy += (q.y - q.sy) * k;
    // scrolling drives the camera down the road, toward the vanishing point
    z.current = THREE.MathUtils.damp(z.current, 5.8 - progress.current * 2.3, 3, dt);
    const cam = s.camera as THREE.PerspectiveCamera;
    cam.position.set(q.sx * 0.35, q.sy * 0.18 + 0.05, z.current);
    cam.lookAt(0.05, 0.1, 0);
  });

  const h = 2 * 5 * Math.tan(THREE.MathUtils.degToRad(19));
  const w = h * (typeof window === "undefined" ? 1.78 : window.innerWidth / window.innerHeight);
  const pw = Math.max(w, h * aspect) * 1.45, ph = pw / aspect;
  return (
    <mesh>
      <planeGeometry args={[pw, ph, 240, Math.round(240 / aspect)]} />
      <shaderMaterial uniforms={uniforms} vertexShader={vert} fragmentShader={frag} />
    </mesh>
  );
}

export default function RoadPhoto({ progress }: { progress: React.MutableRefObject<number> }) {
  const [tex, setTex] = useState<{ map: THREE.Texture; depth: THREE.Texture } | null>(null);
  useEffect(() => {
    let dead = false;
    const L = new THREE.TextureLoader();
    const load = (u: string) => new Promise<THREE.Texture | null>((r) => L.load(u, (t) => r(t), undefined, () => r(null)));
    (async () => {
      const [map, depth] = await Promise.all([load(IMG), load(DEPTH)]);
      if (dead || !map) return;
      map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
      const d = depth ?? new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
      if (!depth) d.needsUpdate = true;
      setTex({ map, depth: d });
    })();
    return () => { dead = true; };
  }, []);
  if (!tex) return null;
  return (
    <Canvas camera={{ position: [0, 0, 5.8], fov: 38, near: 0.1, far: 50 }} dpr={[1, 2]} gl={{ antialias: true }}>
      <Photo map={tex.map} depth={tex.depth} progress={progress} />
    </Canvas>
  );
}
