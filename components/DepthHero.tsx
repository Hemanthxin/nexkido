"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const IMG = "/images/bus-hero.jpg";
const DEPTH = "/images/bus-depth.png";

// Shared input so both canvases (photo layer and cutout layer) move in lockstep.
const input = { x: 0, y: 0, p: 0 };

const vert = /* glsl */ `
  uniform sampler2D uDepth; uniform float uStrength;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z += (texture2D(uDepth, uv).r - 0.3) * uStrength;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const frag = /* glsl */ `
  uniform sampler2D uMap; uniform sampler2D uDepth; uniform float uCut; uniform float uThreshold; uniform float uFeather; uniform float uBottom; uniform float uBias; uniform float uUvScale;
  varying vec2 vUv;
  void main() {
    vec2 muv = (vUv - 0.5) * uUvScale + 0.5; // the backdrop shows the photo a little larger, mirrored beyond its borders
    vec3 c = texture2D(uMap, muv, uBias).rgb;
    float d = texture2D(uDepth, vUv).r;
    // In cutout mode only near surfaces (the bus, foreground leaves) are kept, so type can sit behind them.
    float a = mix(1.0, smoothstep(uThreshold - 0.02, uThreshold + 0.02, d), uCut);
    // the photo's edges melt into the sky behind it
    a *= mix(1.0, smoothstep(1.0, 0.84, vUv.y) * smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x), uFeather);
    a *= mix(1.0, smoothstep(0.0, 0.16, vUv.y), uBottom);
    gl_FragColor = vec4(c, a);
    #include <colorspace_fragment>
  }`;

type U = Record<string, { value: unknown }>;
const uniformsFor = (map: THREE.Texture, depth: THREE.Texture, cut: number, o: { bias?: number; feather?: number; strength?: number } = {}): U => ({
  uMap: { value: map }, uDepth: { value: depth }, uStrength: { value: o.strength ?? 1.1 },
  uCut: { value: cut }, uThreshold: { value: 0.045 }, uFeather: { value: o.feather ?? 1 }, uBottom: { value: 0 }, uBias: { value: o.bias ?? 0 }, uUvScale: { value: 1 },
});

type Layout = { H: number; W: number; top: number; bottom: number };

/** Where the title ends and the buttons begin, in real pixels, so the bus can use whatever space is left. */
function measure(root: HTMLElement | null): Layout {
  const H = innerHeight, W = innerWidth;
  const h1 = root?.querySelector("h1");
  const top = h1 ? h1.getBoundingClientRect().bottom : H * 0.3;
  const cta = document.querySelector("[data-hero-cta]");
  const portrait = W / H < 1;
  const bottom = portrait && cta ? Math.max(0, H - (cta.getBoundingClientRect().top + scrollY)) : 0;
  return { H, W, top, bottom };
}

/** Size and position (world units) of the bus photo for this screen. */
function place(ia: number, h: number, w: number, L: Layout) {
  const px = (v: number) => (v / L.H) * h;
  const bandTop = h / 2 - px(Math.max(0, L.top - L.H * 0.12)); // the roof may rise a little behind the title, for depth
  const bandBottom = -h / 2 + px(L.bottom);
  const bandH = Math.max(0.5, bandTop - bandBottom);
  if (L.W / L.H < 1) {
    // portrait: the bus fills the width, centred in the space between title and buttons
    let pw = w * 1.85, ph = pw / ia;
    if (ph > bandH * 1.12) { ph = bandH * 1.12; pw = ph * ia; }
    return { pw, ph, x: 0.13 * pw, y: (bandTop + bandBottom) / 2 };
  }
  // landscape: the photo covers the whole screen edge to edge, the way a background image does
  // slightly oversized so the depth effect never reveals the photo's edges; it starts a little below the top so the title shows above the roof
  const ph = Math.min(Math.max(h * 0.94, (w / ia) * 1.05), h * 1.08), pw = ph * ia;
  const y = h / 2 - 0.06 * h - ph / 2;
  return { pw, ph, x: 0, y };
}

function Layer({ map, depth, cut, L }: { map: THREE.Texture; depth: THREE.Texture; cut: boolean; L: Layout }) {
  const img = map.image as HTMLImageElement;
  const aspect = img.width / img.height;
  const u = useMemo(() => uniformsFor(map, depth, cut ? 1 : 0), [map, depth, cut]);
  const back = useMemo(() => uniformsFor(map, depth, 0, { bias: 8, feather: 0, strength: 0 }), [map, depth]);
  const sm = useRef({ x: 0, y: 0 });

  useFrame((s, dt) => {
    const k = 1 - Math.pow(0.002, dt);
    sm.current.x += (input.x - sm.current.x) * k;
    sm.current.y += (input.y - sm.current.y) * k;
    const t = s.clock.elapsedTime, intro = 1 - Math.exp(-t * 1.5), p = input.p;
    const cam = s.camera as THREE.PerspectiveCamera;
    cam.position.set(sm.current.x * 0.55, sm.current.y * 0.28 - p * 0.15, 5.7 - intro * 0.7 - p * 2.1);
    cam.lookAt(sm.current.x * 0.1, p * -0.1, 0);
    cam.fov = 38 - p * 6; cam.updateProjectionMatrix();
    u.uStrength.value = 1.1 + p * 0.8;
  });

  const h = 2 * 5 * Math.tan(THREE.MathUtils.degToRad(19));
  const w = h * (L.W / L.H);
  const { pw, ph, x, y } = place(aspect, h, w, L);
  u.uBottom.value = L.W / L.H < 1 ? 1 : 0;
  u.uFeather.value = 1;
  const landscape = L.W / L.H >= 1;
  const bw = Math.max(w, h * aspect) * 1.7, bh = bw / aspect;
  (back.uUvScale as { value: number }).value = bw / (pw * 1.12);
  return (
    <>
      {landscape && !cut && (
        <mesh position={[x, y, -0.5]}>
          <planeGeometry args={[bw, bh, 2, 2]} />
          <shaderMaterial uniforms={back} vertexShader={vert} fragmentShader={frag} />
        </mesh>
      )}
      <mesh position={[x, y, 0]}>
        <planeGeometry args={[pw, ph, 220, Math.round(220 / aspect)]} />
        <shaderMaterial uniforms={u} vertexShader={vert} fragmentShader={frag} transparent />
      </mesh>
    </>
  );
}

export default function DepthHero({ headline }: { headline: React.ReactNode }) {
  const [tex, setTex] = useState<{ map: THREE.Texture; depth: THREE.Texture } | null>(null);
  const [L, setL] = useState<Layout>({ H: 810, W: 1440, top: 240, bottom: 0 });
  const wrap = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dead = false;
    const loader = new THREE.TextureLoader();
    const load = (u: string) => new Promise<THREE.Texture | null>((r) => loader.load(u, (t) => r(t), undefined, () => r(null)));
    (async () => {
      const [map, depth] = await Promise.all([load(IMG), load(DEPTH)]);
      if (dead || !map) return;
      map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
      map.wrapS = map.wrapT = THREE.MirroredRepeatWrapping;
      const d = depth ?? new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
      if (!depth) d.needsUpdate = true;
      setTex({ map, depth: d });
    })();
    const move = (e: PointerEvent) => { input.x = (e.clientX / innerWidth) * 2 - 1; input.y = -((e.clientY / innerHeight) * 2 - 1); };
    const onScroll = () => {
      const p = window.scrollY / window.innerHeight;
      input.p = Math.min(1, p);
      if (wrap.current) wrap.current.style.opacity = String(Math.max(0, 1 - (p - 0.55) / 0.45));
    };
    const remeasure = () => setL(measure(head.current));
    remeasure();
    document.fonts?.ready.then(remeasure);
    onScroll();
    addEventListener("resize", remeasure);
    addEventListener("orientationchange", remeasure);
    addEventListener("pointermove", move);
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      dead = true;
      removeEventListener("resize", remeasure);
      removeEventListener("orientationchange", remeasure);
      removeEventListener("pointermove", move);
      removeEventListener("scroll", onScroll);
    };
  }, []);

  const canvas = (cut: boolean) => tex && (
    <div className="absolute inset-0" aria-hidden>
      <Canvas camera={{ position: [0, 0, 5], fov: 38, near: 0.1, far: 50 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <Layer map={tex.map} depth={tex.depth} cut={cut} L={L} />
      </Canvas>
    </div>
  );

  return (
    <div ref={wrap} className="pointer-events-none fixed inset-0 z-[1] bg-[#7db6ee]">
      {canvas(false)}
      <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(122,182,242,1) 0%, rgba(140,194,244,.85) 12%, rgba(150,200,246,0) 30%)" }} />
      <div ref={head} className="absolute inset-0">{headline}</div>
      {canvas(true)}
      <div className="absolute inset-x-0 bottom-0 h-[34%]" style={{ background: "linear-gradient(to top, rgba(246,250,253,.96), rgba(246,250,253,.65) 45%, rgba(246,250,253,0))" }} />
      <div aria-hidden className="grain absolute inset-0" />
    </div>
  );
}
