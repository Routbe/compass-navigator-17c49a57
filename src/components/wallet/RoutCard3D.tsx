/**
 * WebGL ROUT Card (portrait 1 : 1.588). Loaded lazily, client only.
 * One useFrame drives idle rotation, flip, tilt (pointer/gyro) and the
 * moving highlight; per-frame state lives in refs, never in React state.
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { CARD_RATIO, type CardFaces } from "./card-faces";

export type CardFinish = "metal" | "glass" | "holo";

export type TiltRef = { current: { x: number; y: number; at: number } };

const W = 1;
const H = CARD_RATIO;
const DEPTH = 0.018;
const RADIUS = 0.07;
/** Feel constants. */
const IDLE_PERIOD_S = 28;
const IDLE_AFTER_MS = 3500;
const FLIP_DAMP = 7;
const TILT_DAMP = 6;
const TILT_YAW = 0.45;
const TILT_PITCH = 0.3;

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

function finishProps(finish: CardFinish): Partial<THREE.MeshPhysicalMaterialParameters> {
  if (finish === "glass") return { metalness: 0, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03, sheen: 0.4, sheenColor: new THREE.Color("#ffffff") };
  if (finish === "holo") return { metalness: 0.35, roughness: 0.22, iridescence: 1, iridescenceIOR: 1.65, iridescenceThicknessRange: [180, 620], clearcoat: 0.7 };
  return { metalness: 0.55, roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.25 };
}

function Card({ faces, finish, flipped, tilt, onFlip }: { faces: CardFaces; finish: CardFinish; flipped: boolean; tilt: TiltRef; onFlip: () => void }) {
  const group = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const motion = useRef({ idle: 0, yaw: 0, pitch: 0, flip: 0 });
  const shape = useMemo(cardShape, []);
  const body = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 12 });
    g.translate(0, 0, -DEPTH / 2);
    return g;
  }, [shape]);
  const face = useMemo(() => faceGeometry(shape), [shape]);
  const textures = useMemo(() => {
    const make = (c: HTMLCanvasElement) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    };
    return { front: make(faces.front), back: make(faces.back) };
  }, [faces]);
  useEffect(() => () => {
    textures.front.dispose();
    textures.back.dispose();
    body.dispose();
    face.dispose();
  }, [textures, body, face]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const m = motion.current;
    const t = tilt.current;
    const interacting = performance.now() - t.at < IDLE_AFTER_MS;
    const k = (rate: number) => 1 - Math.exp(-rate * dt);
    if (interacting) {
      // Settle the idle spin to the nearest full turn so the chosen face shows.
      const target = Math.round(m.idle / (Math.PI * 2)) * Math.PI * 2;
      m.idle += (target - m.idle) * k(FLIP_DAMP);
    } else {
      m.idle += dt * ((Math.PI * 2) / IDLE_PERIOD_S);
    }
    m.flip += ((flipped ? Math.PI : 0) - m.flip) * k(FLIP_DAMP);
    m.yaw += (t.x * TILT_YAW - m.yaw) * k(TILT_DAMP);
    m.pitch += (-t.y * TILT_PITCH - m.pitch) * k(TILT_DAMP);
    const g = group.current;
    if (g) {
      g.rotation.y = m.idle + m.flip + m.yaw;
      g.rotation.x = m.pitch;
      g.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.025;
    }
    if (light.current) light.current.position.set(t.x * 2.2, t.y * 2 + 0.6, 2.4);
  });

  return (
    <group ref={group} onClick={(e) => { e.stopPropagation(); onFlip(); }}>
      <mesh geometry={body}>
        <meshPhysicalMaterial color="#1b1b1f" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh geometry={face} position={[0, 0, DEPTH / 2 + 0.0025]}>
        <meshPhysicalMaterial key={finish} map={textures.front} {...finishProps(finish)} />
      </mesh>
      <mesh geometry={face} position={[0, 0, -DEPTH / 2 - 0.0025]} rotation={[0, Math.PI, 0]}>
        <meshStandardMaterial map={textures.back} roughness={0.7} metalness={0} />
      </mesh>
      <pointLight ref={light} intensity={6} distance={6} color="#ffffff" />
    </group>
  );
}

function ReadySignal({ onReady }: { onReady: () => void }) {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    onReady();
  });
  return null;
}

export default function RoutCard3D(props: { faces: CardFaces; finish: CardFinish; flipped: boolean; tilt: TiltRef; onFlip: () => void; onReady: () => void }) {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 3.7], fov: 30 }} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}>
      <ambientLight intensity={0.55} />
      <directionalLight position={[2, 3, 4]} intensity={1.1} />
      <Environment resolution={128}>
        <Lightformer intensity={2} position={[0, 4, 2]} scale={[8, 2, 1]} />
        <Lightformer intensity={1.2} color="#9bb7ff" position={[-4, 0, 1]} rotation-y={Math.PI / 2} scale={[8, 2, 1]} />
        <Lightformer intensity={1} color="#ffd1e8" position={[4, -1, 1]} rotation-y={-Math.PI / 2} scale={[8, 2, 1]} />
      </Environment>
      <Card faces={props.faces} finish={props.finish} flipped={props.flipped} tilt={props.tilt} onFlip={props.onFlip} />
      <ReadySignal onReady={props.onReady} />
    </Canvas>
  );
}
