/**
 * WebGL ROUT Card (portrait 1 : 1.588). Loaded lazily, client only.
 * One useFrame drives physics (mass-spring tilt), idle spin, flip, zoom,
 * the moving light and the shader clock; per-frame state lives in refs.
 * Text is SDF (troika, generated in a worker) so it stays sharp at any zoom.
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, Text } from "@react-three/drei";
import * as THREE from "three";
import { CARD_RATIO, FACE_H, FACE_W, type CardFaces } from "./card-faces";
import { stepSpring, type Spring } from "./card-physics";
import { createSecurityMaterial } from "./card-shader";

export type CardFinish = "metal" | "glass" | "holo";
export type TiltRef = { current: { x: number; y: number; at: number } };
export type LiveRef = { current: { seed: [number, number, number, number]; expiresAt: number; windowMs: number } };
export type ZoomRef = { current: number };

const W = 1;
const H = CARD_RATIO;
const DEPTH = 0.018;
const RADIUS = 0.07;
const FRONT_Z = DEPTH / 2 + 0.0025;
const BACK_Z = -DEPTH / 2 - 0.0025;
/** Feel constants. */
const IDLE_PERIOD_S = 28;
const IDLE_AFTER_MS = 3500;
const FLIP_DAMP = 6;
const TILT_YAW = 0.5;
const TILT_PITCH = 0.34;
const CAMERA_FAR = 3.7;
const CAMERA_NEAR = 1.15;
const ZOOM_DAMP = 5;
const FONT = "/fonts/Inter-SemiBold.ttf";
const MONO = "/fonts/og-jetbrains-mono.ttf";
const MICRO = "ROUT · SOVEREIGN PROFILE · ZELFBESCHIKKING OVER JE IDENTITEIT · ".repeat(6);
const FINISH_INDEX: Record<CardFinish, number> = { metal: 0, glass: 1, holo: 2 };

/** Canvas pixel → card-local coordinates. */
const cx = (px: number) => (px / FACE_W - 0.5) * W;
const cy = (py: number) => (0.5 - py / FACE_H) * H;

function cardShape(): THREE.Shape {
  const s = new THREE.Shape();
  const x = -W / 2;
  const y = -H / 2;
  s.moveTo(x + RADIUS, y);
  s.lineTo(x + W - RADIUS, y);
  s.quadraticCurveTo(x + W, y, x + W, y + RADIUS);
  s.lineTo(x + W, y + H - RADIUS);
  s.quadraticCurveTo(x + W, y + H, x + W - RADIUS, y + H);
  s.lineTo(x + RADIUS, y + H);
  s.quadraticCurveTo(x, y + H, x, y + H - RADIUS);
  s.lineTo(x, y + RADIUS);
  s.quadraticCurveTo(x, y, x + RADIUS, y);
  return s;
}

/** ShapeGeometry UVs are in shape units; remap them to 0..1 for the face textures. */
function faceGeometry(shape: THREE.Shape): THREE.ShapeGeometry {
  const g = new THREE.ShapeGeometry(shape, 12);
  const pos = g.attributes["position"] as THREE.BufferAttribute;
  const uv = g.attributes["uv"] as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + W / 2) / W, (pos.getY(i) + H / 2) / H);
  uv.needsUpdate = true;
  return g;
}

type CardProps = {
  faces: CardFaces;
  finish: CardFinish;
  flipped: boolean;
  tilt: TiltRef;
  live: LiveRef;
  zoom: ZoomRef;
  onFlip: () => void;
  text: { displayName: string; handle: string; subheader: string; fg: string; sovereignId: string; code: string | null };
};

/** Name pressed into the material: a dark offset "shadow" under a metallic face. */
function Embossed({ children, y, size, color, weight }: { children: string; y: number; size: number; color: string; weight?: "mono" }) {
  const font = weight === "mono" ? MONO : FONT;
  return (
    <group position={[0, y, FRONT_Z + 0.0006]}>
      <Text font={font} fontSize={size} maxWidth={W * 0.86} anchorX="center" anchorY="middle" position={[0.0018, -0.0018, 0]} color="#000000" fillOpacity={0.35}>
        {children}
      </Text>
      <Text font={font} fontSize={size} maxWidth={W * 0.86} anchorX="center" anchorY="middle" position={[0, 0, 0.0004]}>
        {children}
        <meshStandardMaterial color={color} metalness={0.85} roughness={0.28} />
      </Text>
    </group>
  );
}

function Card({ faces, finish, flipped, tilt, live, zoom, onFlip, text }: CardProps) {
  const group = useRef<THREE.Group>(null);
  const timer = useRef<THREE.Mesh>(null);
  const motion = useRef({ idle: 0, flip: 0, z: CAMERA_FAR, yaw: { x: 0, v: 0 } as Spring, pitch: { x: 0, v: 0 } as Spring });
  const camera = useThree((s) => s.camera);
  const shape = useMemo(cardShape, []);
  const body = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 3, curveSegments: 16 });
    g.translate(0, 0, -DEPTH / 2);
    return g;
  }, [shape]);
  const face = useMemo(() => faceGeometry(shape), [shape]);
  const textures = useMemo(() => {
    const make = (c: HTMLCanvasElement, srgb: boolean) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      return t;
    };
    return { front: make(faces.front, true), back: make(faces.back, true), mask: make(faces.mask, false) };
  }, [faces]);
  const security = useMemo(() => createSecurityMaterial(textures.front, textures.mask, [1 / FACE_W, 1 / FACE_H]), [textures]);
  useEffect(() => {
    security.uniforms["uFinish"]!.value = FINISH_INDEX[finish];
  }, [security, finish]);
  useEffect(() => () => {
    textures.front.dispose();
    textures.back.dispose();
    textures.mask.dispose();
    security.dispose();
    body.dispose();
    face.dispose();
  }, [textures, security, body, face]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const m = motion.current;
    const t = tilt.current;
    const now = performance.now();
    const interacting = now - t.at < IDLE_AFTER_MS || zoom.current > 0;
    const k = (rate: number) => 1 - Math.exp(-rate * dt);
    if (interacting) {
      // Settle the idle spin to the nearest full turn so the chosen face shows.
      const target = Math.round(m.idle / (Math.PI * 2)) * Math.PI * 2;
      m.idle += (target - m.idle) * k(FLIP_DAMP);
    } else {
      m.idle += dt * ((Math.PI * 2) / IDLE_PERIOD_S);
    }
    m.flip += ((flipped ? Math.PI : 0) - m.flip) * k(FLIP_DAMP);
    m.yaw = stepSpring(m.yaw, t.x * TILT_YAW, dt);
    m.pitch = stepSpring(m.pitch, -t.y * TILT_PITCH, dt);
    const g = group.current;
    if (g) {
      g.rotation.y = m.idle + m.flip + m.yaw.x;
      g.rotation.x = m.pitch.x;
      g.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.02 * (1 - zoom.current);
    }
    m.z += (CAMERA_FAR + (CAMERA_NEAR - CAMERA_FAR) * zoom.current - m.z) * k(ZOOM_DAMP);
    camera.position.z = m.z;
    const u = security.uniforms;
    // Real wall-clock time, so a replayed recording drifts out of phase.
    u["uTime"]!.value = (Date.now() % 3_600_000) / 1000;
    const s = live.current.seed;
    (u["uSeed"]!.value as THREE.Vector4).set(s[0], s[1], s[2], s[3]);
    (u["uLightPos"]!.value as THREE.Vector3).set(t.x * 2.2 + Math.sin(state.clock.elapsedTime * 0.3) * 0.4, t.y * 2 + 0.8, 2.4);
    if (timer.current) {
      const left = Math.max(0, Math.min(1, (live.current.expiresAt - Date.now()) / live.current.windowMs));
      timer.current.scale.x = Math.max(left, 0.0001);
    }
  });

  // Back-face layout in canvas pixels (matches card-faces.ts).
  const qrSize = FACE_W - 176;
  const qy = Math.round(FACE_H * 0.13);
  const slotY = qy + qrSize + 80 + 40;
  const microY = [cy(30), cy(FACE_H - 30)];

  return (
    <group ref={group} onClick={(e) => { e.stopPropagation(); onFlip(); }}>
      <mesh geometry={body}>
        <meshPhysicalMaterial color="#26262b" metalness={0.95} roughness={0.32} clearcoat={0.4} />
      </mesh>
      <mesh geometry={face} position={[0, 0, FRONT_Z]} material={security} />
      <mesh geometry={face} position={[0, 0, BACK_Z]} rotation={[0, Math.PI, 0]}>
        <meshStandardMaterial map={textures.back} roughness={0.55} metalness={0.1} />
      </mesh>

      {/* Front: SDF name / handle / tagline and micro-text border. */}
      <Embossed y={cy(FACE_H * 0.7) + 0.012} size={0.075} color={text.fg}>{text.displayName}</Embossed>
      <Embossed y={cy(FACE_H * 0.7 + 48) + 0.01} size={0.042} color={text.fg}>{`@${text.handle}`}</Embossed>
      <Embossed y={cy(FACE_H * 0.7 + 92) + 0.008} size={0.03} color={text.fg}>{text.subheader}</Embossed>
      {microY.map((y) => (
        <Text key={y} font={MONO} fontSize={0.0065} position={[0, y, FRONT_Z + 0.0005]} anchorX="center" anchorY="middle" clipRect={[-W * 0.44, -0.01, W * 0.44, 0.01]} color={text.fg} fillOpacity={0.5}>
          {MICRO}
        </Text>
      ))}

      {/* Back: rotating live code + countdown. */}
      <group position={[0, 0, BACK_Z - 0.0006]} rotation={[0, Math.PI, 0]}>
        <Text font={MONO} fontSize={0.06} letterSpacing={0.18} position={[0, cy(slotY), 0]} anchorX="center" anchorY="middle" color="#f4f4f5">
          {text.code ? `${text.code.slice(0, 3)} ${text.code.slice(3)}` : "··· ···"}
        </Text>
        <mesh ref={timer} position={[0, cy(slotY + 22), 0.0002]}>
          <planeGeometry args={[cx(FACE_W - 64) - cx(64), 0.004]} />
          <meshBasicMaterial color="#34d399" toneMapped={false} />
        </mesh>
        {microY.map((y) => (
          <Text key={y} font={MONO} fontSize={0.0065} position={[0, y, 0]} anchorX="center" anchorY="middle" clipRect={[-W * 0.44, -0.01, W * 0.44, 0.01]} color="#a1a1aa" fillOpacity={0.6}>
            {`${MICRO}${text.sovereignId} · `}
          </Text>
        ))}
      </group>
    </group>
  );
}

function ReadySignal({ onReady }: { onReady: () => void }) {
  const frames = useRef(0);
  useFrame(() => {
    // Two frames: textures uploaded and SDF glyphs placed.
    frames.current += 1;
    if (frames.current === 2) onReady();
  });
  return null;
}

export default function RoutCard3D(props: CardProps & { onReady: () => void }) {
  const { onReady, ...card } = props;
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, CAMERA_FAR], fov: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[2, 3, 4]} intensity={1.2} />
      <Environment resolution={128}>
        <Lightformer intensity={2} position={[0, 4, 2]} scale={[8, 2, 1]} />
        <Lightformer intensity={1.2} color="#9bb7ff" position={[-4, 0, 1]} rotation-y={Math.PI / 2} scale={[8, 2, 1]} />
        <Lightformer intensity={1} color="#ffd1a8" position={[4, -1, 1]} rotation-y={-Math.PI / 2} scale={[8, 2, 1]} />
      </Environment>
      <Card {...card} />
      <ReadySignal onReady={onReady} />
    </Canvas>
  );
}
