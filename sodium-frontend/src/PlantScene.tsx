import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Billboard, Html, OrbitControls, Text, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

import keuvModelUrl from './assets/KEUV_export_aero.glb?url';

useGLTF.preload(keuvModelUrl);

const TARGET_SIZE = 5;

const GlbModel: React.FC<{
  url: string;
  /** World position of the model base (where it meets the floor). */
  position?: [number, number, number];
  rotation?: [number, number, number];
}> = ({ url, position = [0, 0, 0], rotation = [0, 0, 0] }) => {
  const { scene } = useGLTF(url);

  const { cloned, scale, height } = useMemo(() => {
    const c = scene.clone();
    const box = new THREE.Box3().setFromObject(c);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Center model around origin so X/Z are symmetric; keep Y extent for base alignment.
    const center = new THREE.Vector3();
    box.getCenter(center);
    c.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
    const s = TARGET_SIZE / maxDim;
    return { cloned: c, scale: s, height: size.y };
  }, [scene]);

  useEffect(() => {
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [cloned]);

  // Raise the centered model so its base sits on the global floor (y = 0).
  const [px, py, pz] = position;
  const yOffset = (height * scale) / 2;

  return (
    <group position={[px, py + yOffset, pz]} rotation={rotation} scale={[scale, scale, scale]}>
      <primitive object={cloned} />
    </group>
  );
};

const GlbModelWithFallback: React.FC = () => (
  <Suspense
    fallback={
      <mesh position={[4, 0.5, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#22c55e" />
        <Html center>
          <span style={{ color: '#22c55e', fontSize: 12 }}>Loading model…</span>
        </Html>
      </mesh>
    }
  >
    {/* Wall panel: sit on floor, face the viewer like the reference render */}
    <group>
      <GlbModel url={keuvModelUrl} position={[4, 0, 0]} rotation={[0, -Math.PI / 2, 0]} />
      <Billboard position={[4, 3.2, 0.3]}>
        <Text
          fontSize={0.45}
          color="#111827"
          outlineWidth={0.03}
          outlineColor="#e5e7eb"
          anchorX="center"
          anchorY="middle"
        >
          Gas Purifier
        </Text>
      </Billboard>
    </group>
  </Suspense>
);

type PlantSceneProps = {
  productionKg: number;
  currentA: number;
  running: boolean;
  h2Kg: number;
  onCathodeClick?: () => void;
  onAnodeClick?: () => void;
  onElectrolyteClick?: () => void;
};

function polylinePointAt(points: THREE.Vector3[], u: number): THREE.Vector3 {
  if (points.length === 0) return new THREE.Vector3();
  if (points.length === 1) return points[0].clone();

  const clamped = ((u % 1) + 1) % 1;
  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const d = points[i].distanceTo(points[i + 1]);
    segLens.push(d);
    total += d;
  }
  const target = clamped * total;
  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    const next = acc + segLens[i];
    if (target <= next || i === segLens.length - 1) {
      const t = segLens[i] <= 1e-9 ? 0 : (target - acc) / segLens[i];
      return points[i].clone().lerp(points[i + 1], t);
    }
    acc = next;
  }
  return points[points.length - 1].clone();
}

const TubePipe: React.FC<{
  points: [number, number, number][];
  radius: number;
  color: string;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
}> = ({ points, radius, color, emissive, emissiveIntensity = 0.0, opacity = 1.0 }) => {
  const curve = useMemo(() => {
    const pts = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  }, [points]);

  const geom = useMemo(() => new THREE.TubeGeometry(curve, 64, radius, 14, false), [curve, radius]);

  return (
    <mesh geometry={geom}>
      <meshStandardMaterial
        color={color}
        metalness={0.4}
        roughness={0.35}
        emissive={emissive ?? '#000000'}
        emissiveIntensity={emissiveIntensity}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
};

const GasFlowParticles: React.FC<{
  points: [number, number, number][];
  count: number;
  color: string;
  speed: number;
  running: boolean;
  size: number;
}> = ({ points, count, color, speed, running, size }) => {
  const meshRef = useRef<THREE.InstancedMesh | null>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const pts = useMemo(() => points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), [points]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;

    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    const targetOpacity = running ? 0.95 : 0.0;
    mat.opacity += (targetOpacity - mat.opacity) * 0.15;
    mat.transparent = true;

    if (!running) return;

    const t = clock.getElapsedTime();
    for (let i = 0; i < count; i++) {
      const u = (t * speed + i / count) % 1;
      const p = polylinePointAt(pts, u);
      dummy.position.copy(p);
      dummy.scale.set(size, size, size);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined as any, undefined as any, count]}>
      <sphereGeometry args={[1, 10, 10]} />
      <meshStandardMaterial color={color} transparent opacity={0.0} />
    </instancedMesh>
  );
};

const GasPipesAndFlow: React.FC<{ running: boolean; currentA: number }> = ({ running, currentA }) => {
  // Speeds scale gently with current
  const currentScaled = Math.min(Math.abs(currentA) / 10_000, 2.0);
  const baseSpeed = 0.22 + currentScaled * 0.18;

  // Short vertical risers from lid -> bottles on top plate,
  // plus a clean header to the external Gas Purifier tower on the right.
  const lidO2Out: [number, number, number] = [0.55, 2.95, 0.65];
  const lidH2Out: [number, number, number] = [-0.55, 2.95, 0.65];
  const o2BottleIn: [number, number, number] = [0.85, 3.35, 0.95];
  const h2BottleIn: [number, number, number] = [-0.85, 3.35, 0.95];

  const header: [number, number, number] = [1.55, 2.85, 0.2];
  // Entry point into the side wall of the Gas Purifier tower (front face)
  const purifierIn: [number, number, number] = [4.0, 2.0, 0.3];

  const toO2: [number, number, number][] = [lidO2Out, [0.7, 3.1, 0.9], o2BottleIn];
  const toH2: [number, number, number][] = [lidH2Out, [-0.7, 3.1, 0.9], h2BottleIn];
  const toPurifier: [number, number, number][] = [header, [2.7, 2.8, 0.25], purifierIn];

  return (
    <group>
      {/* Pipes */}
      <TubePipe
        points={toO2}
        radius={0.05}
        color="#60a5fa"
        emissive="#60a5fa"
        emissiveIntensity={running ? 0.35 : 0.0}
        opacity={0.92}
      />
      <TubePipe
        points={toH2}
        radius={0.05}
        color="#22c55e"
        emissive="#22c55e"
        emissiveIntensity={running ? 0.35 : 0.0}
        opacity={0.92}
      />
      <TubePipe
        points={toPurifier}
        radius={0.06}
        color="#cbd5e1"
        emissive="#e5e7eb"
        emissiveIntensity={running ? 0.15 : 0.0}
        opacity={0.75}
      />

      {/* Flow particles (clearly show gas moving) */}
      <GasFlowParticles points={toO2} count={55} color="#bfdbfe" speed={baseSpeed * 1.35} running={running} size={0.06} />
      <GasFlowParticles points={toH2} count={55} color="#bbf7d0" speed={baseSpeed * 1.35} running={running} size={0.06} />
      <GasFlowParticles points={toPurifier} count={70} color="#e5e7eb" speed={baseSpeed * 1.05} running={running} size={0.05} />

      {/* Lid ports + header junction */}
      <mesh position={lidO2Out}>
        <cylinderGeometry args={[0.07, 0.07, 0.08, 18]} />
        <meshStandardMaterial color="#93c5fd" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={lidH2Out}>
        <cylinderGeometry args={[0.07, 0.07, 0.08, 18]} />
        <meshStandardMaterial color="#86efac" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={header}>
        <sphereGeometry args={[0.12, 20, 20]} />
        <meshStandardMaterial
          color="#cbd5e1"
          metalness={0.55}
          roughness={0.35}
          emissive="#e5e7eb"
          emissiveIntensity={running ? 0.12 : 0.0}
        />
      </mesh>
    </group>
  );
};

// Very simple visual interpretation of the Castner cell:
// - Tall crucible with molten NaOH
// - Central cathode rod
// - Two anode rods
// - Wire gauze / hood near the top where sodium accumulates
// - Side neck / collection pot whose height grows with production

const BubbleColumn: React.FC<{
  count: number;
  areaRadius: number;
  height: number;
  origin: [number, number, number];
  color: string;
  activity: number; // 0–1, scales bubble speed
}> = ({ count, areaRadius, height, origin, color, activity }) => {
  const meshRef = useRef<THREE.InstancedMesh | null>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const seeds = useMemo(
    () =>
      new Array(count).fill(0).map(() => ({
        x: (Math.random() * 2 - 1) * areaRadius,
        z: (Math.random() * 2 - 1) * areaRadius,
        phase: Math.random() * 10,
      })),
    [count, areaRadius],
  );

  useFrame(({ clock }) => {
    if (!meshRef.current) return;

    // Fade bubbles in/out with activity; hide completely when activity ~ 0
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    const targetOpacity = activity > 0.02 ? 0.9 : 0.0;
    mat.opacity += (targetOpacity - mat.opacity) * 0.2;
    mat.transparent = true;

    if (activity <= 0.02) return;

    const t = clock.getElapsedTime();
    const speed = 0.4 + activity * 1.6; // faster with higher activity

    seeds.forEach((s, i) => {
      const yBase = ((t * speed + s.phase) % height) - height / 2;
      dummy.position.set(origin[0] + s.x, origin[1] + yBase, origin[2] + s.z);
      const scale = 0.06 + Math.random() * 0.04;
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined as any, undefined as any, count]}>
      <sphereGeometry args={[1, 12, 12]} />
      <meshStandardMaterial color={color} transparent opacity={0.9} />
    </instancedMesh>
  );
};

const CastnerCell: React.FC<{
  productionKg: number;
  currentA: number;
  running: boolean;
  onCathodeClick?: () => void;
  onAnodeClick?: () => void;
  onElectrolyteClick?: () => void;
}> = ({ productionKg: _productionKg, currentA, running, onCathodeClick, onAnodeClick, onElectrolyteClick }) => {
  // Activity is driven by current and only when simulation is running
  const currentScaled = Math.min(Math.abs(currentA) / 10_000, 2.0);
  const activity = running ? Math.min(currentScaled, 1.0) : 0; // 0–1 activity metric

  // Approximate depletion of the NaOH bath from produced sodium.
  const MAX_BATCH_NA_KG = 10;
  const depletion = Math.min(productionKg / MAX_BATCH_NA_KG, 1.0);
  const electrolyteFill = 1 - depletion * 0.75; // never fully empty visually

  const [cathodePulse, setCathodePulse] = useState(0);
  const [anodePulse, setAnodePulse] = useState(0);
  const [electrolytePulse, setElectrolytePulse] = useState(0);

  useFrame((_, delta) => {
    if (cathodePulse > 0) {
      setCathodePulse((v) => Math.max(0, v - delta * 0.6));
    }
    if (anodePulse > 0) {
      setAnodePulse((v) => Math.max(0, v - delta * 0.6));
    }
    if (electrolytePulse > 0) {
      setElectrolytePulse((v) => Math.max(0, v - delta * 0.6));
    }
  });

  const electrolyteColor = electrolytePulse > 0.05 ? '#fbbf24' : '#f59e0b';

  return (
    <group position={[0, 0, 0]}>
      {/* Rectangular steel furnace housing (matches drawing style) */}
      <group>
        {/* main body */}
        <mesh position={[0, 1.45, 0]}>
          <boxGeometry args={[3.4, 2.9, 2.8]} />
          <meshStandardMaterial color="#374151" metalness={0.75} roughness={0.35} />
        </mesh>
        {/* top plate */}
        <mesh position={[0, 2.95, 0]}>
          <boxGeometry args={[3.7, 0.25, 3.05]} />
          <meshStandardMaterial color="#4b5563" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* front window frame */}
        <mesh position={[0, 1.45, 1.41]}>
          <boxGeometry args={[2.6, 1.6, 0.08]} />
          <meshStandardMaterial color="#111827" metalness={0.6} roughness={0.45} />
        </mesh>
        {/* glass window (slightly inset) */}
        <mesh position={[0, 1.45, 1.37]}>
          <planeGeometry args={[2.3, 1.35]} />
          <meshPhysicalMaterial
            color="#93c5fd"
            transparent
            opacity={0.18}
            roughness={0.05}
            metalness={0.0}
            clearcoat={0.9}
            clearcoatRoughness={0.1}
          />
        </mesh>
        {/* base plinth */}
        <mesh position={[0, 0.2, 0]}>
          <boxGeometry args={[3.8, 0.4, 3.2]} />
          <meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.6} />
        </mesh>
      </group>

      {/* Inner transparent crucible walls (molten NaOH vessel) */}
      <mesh
        position={[0, 1.35, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          setElectrolytePulse(1);
          onElectrolyteClick?.();
        }}
      >
        <cylinderGeometry args={[1.18, 1.0, 2.05, 64, 1, true]} />
        <meshPhysicalMaterial
          color="#f9fafb"
          transparent
          opacity={0.3}
          roughness={0.2}
          metalness={0.0}
          clearcoat={0.7}
          clearcoatRoughness={0.3}
        />
      </mesh>

      {/* Molten NaOH pool (bright, semi‑transparent, gradually depleting) */}
      <mesh
        position={[0, 0.95, 0]}
        scale={[1, electrolyteFill, 1]}
        onPointerDown={(e) => {
          e.stopPropagation();
          setElectrolytePulse(1);
          onElectrolyteClick?.();
        }}
      >
        <cylinderGeometry args={[1.02, 1.02, 1.35, 64]} />
        <meshPhysicalMaterial
          color={electrolyteColor}
          transparent
          opacity={0.55}
          roughness={0.2}
          metalness={0.1}
          clearcoat={0.8}
          clearcoatRoughness={0.25}
        />
      </mesh>

      {/* Sodium overflow lip */}
      <mesh position={[0, 1.68, 0]}>
        <torusGeometry args={[1.07, 0.07, 16, 64]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.6} roughness={0.25} />
      </mesh>

      {/* Right-side cooling coil (stylised, like drawing) */}
      <group position={[1.85, 1.1, 0.0]} rotation={[0, 0, 0]}>
        {Array.from({ length: 7 }).map((_, i) => (
          <mesh key={i} position={[0, i * 0.22, 0]}>
            <torusGeometry args={[0.55, 0.06, 16, 48]} />
            <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.25} />
          </mesh>
        ))}
        {/* inlet/outlet stubs */}
        <mesh position={[-0.62, 0.66, -0.25]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.06, 0.6, 16]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh position={[0.62, 0.22, -0.25]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.06, 0.6, 16]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.25} />
        </mesh>
      </group>

      {/* Central cathode (C) */}
      <mesh
        position={[0, 2.0, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          setCathodePulse(1);
          onCathodeClick?.();
        }}
      >
        <cylinderGeometry args={[0.18, 0.18, 3.0, 32]} />
        <meshStandardMaterial
          color="#1d4ed8"
          metalness={0.8}
          roughness={0.3}
          emissive="#38bdf8"
          emissiveIntensity={0.8 * cathodePulse}
        />
      </mesh>
      {/* cathode cap */}
      <mesh position={[0, 3.6, 0]}>
        <cylinderGeometry args={[0.26, 0.26, 0.18, 32]} />
        <meshStandardMaterial color="#60a5fa" metalness={0.9} roughness={0.25} />
      </mesh>
      {/* cathode label (-) */}
      <Text
        position={[0, 4.1, 0]}
        fontSize={0.35}
        color="#e5e7eb"
        outlineWidth={0.02}
        outlineColor="#0f172a"
        anchorX="center"
        anchorY="middle"
      >
        −
      </Text>
      {/* Cathode reaction halo near base */}
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.45, 0.45, 0.18, 32]} />
        <meshStandardMaterial
          color="#38bdf8"
          emissive="#38bdf8"
          emissiveIntensity={1.2 * cathodePulse}
          transparent
          opacity={0.35 * cathodePulse}
        />
      </mesh>

      {/* Two anodes (A) */}
      <mesh
        position={[-0.7, 2.0, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          setAnodePulse(1);
          onAnodeClick?.();
        }}
      >
        <cylinderGeometry args={[0.16, 0.16, 3.0, 32]} />
        <meshStandardMaterial
          color="#b91c1c"
          metalness={0.8}
          roughness={0.3}
          emissive="#f97316"
          emissiveIntensity={0.8 * anodePulse}
        />
      </mesh>
      <mesh
        position={[0.7, 2.0, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          setAnodePulse(1);
          onAnodeClick?.();
        }}
      >
        <cylinderGeometry args={[0.16, 0.16, 3.0, 32]} />
        <meshStandardMaterial
          color="#b91c1c"
          metalness={0.8}
          roughness={0.3}
          emissive="#f97316"
          emissiveIntensity={0.8 * anodePulse}
        />
      </mesh>
      {/* anode caps */}
      <mesh position={[-0.7, 3.5, 0]}>
        <cylinderGeometry args={[0.24, 0.24, 0.16, 32]} />
        <meshStandardMaterial color="#f97316" metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh position={[0.7, 3.5, 0]}>
        <cylinderGeometry args={[0.24, 0.24, 0.16, 32]} />
        <meshStandardMaterial color="#f97316" metalness={0.9} roughness={0.3} />
      </mesh>
      {/* anode labels (+) */}
      <Text
        position={[-0.7, 4.0, 0]}
        fontSize={0.32}
        color="#fee2e2"
        outlineWidth={0.02}
        outlineColor="#0f172a"
        anchorX="center"
        anchorY="middle"
      >
        +
      </Text>
      <Text
        position={[0.7, 4.0, 0]}
        fontSize={0.32}
        color="#fee2e2"
        outlineWidth={0.02}
        outlineColor="#0f172a"
        anchorX="center"
        anchorY="middle"
      >
        +
      </Text>
      {/* Anode oxidation halo near bases */}
      <mesh position={[-0.7, 0.6, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.16, 32]} />
        <meshStandardMaterial
          color="#f97316"
          emissive="#f97316"
          emissiveIntensity={1.1 * anodePulse}
          transparent
          opacity={0.3 * anodePulse}
        />
      </mesh>
      <mesh position={[0.7, 0.6, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.16, 32]} />
        <meshStandardMaterial
          color="#f97316"
          emissive="#f97316"
          emissiveIntensity={1.1 * anodePulse}
          transparent
          opacity={0.3 * anodePulse}
        />
      </mesh>

      {/* Gas bubbles from cathode and anodes */}
      <BubbleColumn
        count={220}
        areaRadius={0.18}
        height={1.4}
        origin={[0, 0.4, 0]}
        color="#e5f0ff"
        activity={activity}
      />
      <BubbleColumn
        count={160}
        areaRadius={0.16}
        height={1.4}
        origin={[-0.7, 0.4, 0]}
        color="#ffffff"
        activity={activity * 0.9}
      />
      <BubbleColumn
        count={160}
        areaRadius={0.16}
        height={1.4}
        origin={[0.7, 0.4, 0]}
        color="#ffffff"
        activity={activity * 0.9}
      />

      {/* Wire gauze / hood near top (G) */}
      <mesh position={[0, 2.6, 0]}>
        <cylinderGeometry args={[1.0, 1.0, 0.2, 48]} />
        <meshStandardMaterial color="#6b7280" metalness={0.7} roughness={0.4} />
      </mesh>

      {/* Sodium outlet channel and collection pot (front) */}
      <group position={[0, 0, 1.4]}>
        {/* short vertical throat */}
        <mesh position={[0, 0.2, -0.15]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.6, 24]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.3} />
        </mesh>
        {/* horizontal channel */}
        <mesh position={[0, -0.1, 0.25]} rotation={[0, 0, 0]}>
          <boxGeometry args={[0.6, 0.18, 0.5]} />
          <meshStandardMaterial color="#facc15" metalness={0.7} roughness={0.35} />
        </mesh>
        {/* collection pot */}
        <mesh position={[0, -0.55, 0.45]}>
          <cylinderGeometry args={[0.6, 0.6, 0.25, 48]} />
          <meshStandardMaterial color="#374151" metalness={0.65} roughness={0.4} />
        </mesh>
        <mesh position={[0, -0.6, 0.45]}>
          <cylinderGeometry args={[0.52, 0.52, 0.05, 48]} />
          <meshStandardMaterial color="#facc15" metalness={0.7} roughness={0.25} />
        </mesh>
      </group>
    </group>
  );
};

const Transformer: React.FC = () => (
  <group position={[-3.2, 0.7, -1.5]}>
    <mesh>
      <boxGeometry args={[2.4, 1.2, 1.4]} />
      <meshStandardMaterial color="#6b7280" metalness={0.4} roughness={0.5} />
    </mesh>
    {/* bushings */}
    <mesh position={[-0.7, 0.9, 0.5]}>
      <cylinderGeometry args={[0.12, 0.12, 0.5, 32]} />
      <meshStandardMaterial color="#e5e7eb" />
    </mesh>
    <mesh position={[0.7, 0.9, 0.5]}>
      <cylinderGeometry args={[0.12, 0.12, 0.5, 32]} />
      <meshStandardMaterial color="#e5e7eb" />
    </mesh>
  </group>
);

const WiringAndMeter: React.FC = () => (
  <group>
    {/* Leads from transformer bushings to electrodes */}
    <mesh position={[-1.6, 1.1, -0.5]} rotation={[0, 0.4, 0]}>
      <cylinderGeometry args={[0.05, 0.05, 3.2, 16]} />
      <meshStandardMaterial color="#ef4444" />
    </mesh>
    <mesh position={[1.6, 1.1, -0.5]} rotation={[0, -0.4, 0]}>
      <cylinderGeometry args={[0.05, 0.05, 3.2, 16]} />
      <meshStandardMaterial color="#22c55e" />
    </mesh>

    {/* Simple voltmeter box */}
    <group position={[-2.8, 1.1, 1.4]}>
      <mesh>
        <boxGeometry args={[1.2, 0.6, 0.4]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[0, 0.02, 0.22]} rotation={[0, 0, 0]}>
        <planeGeometry args={[0.9, 0.4]} />
        <meshBasicMaterial color="#0f172a" />
      </mesh>
      {/* indicator needle */}
      <mesh position={[-0.25, 0.05, 0.24]}>
        <boxGeometry args={[0.5, 0.02, 0.02]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
    </group>
  </group>
);

const GasCollectors: React.FC<{ h2Kg: number }> = ({ h2Kg }) => (
  // O2 / H2 capture bottles on the top plate
  <group position={[0, 0, 0]}>
    {/* O2 bottle */}
    <group position={[0.85, 3.35, 0.95]}>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 1.6, 32]} />
        <meshPhysicalMaterial
          color="#60a5fa"
          transparent
          opacity={0.45}
          roughness={0.2}
          clearcoat={0.4}
        />
      </mesh>
      <mesh position={[0, 1.8, 0]}>
        <sphereGeometry args={[0.35, 24, 24]} />
        <meshPhysicalMaterial
          color="#60a5fa"
          transparent
          opacity={0.5}
          roughness={0.2}
          clearcoat={0.4}
        />
      </mesh>
      <Text
        position={[0, 2.5, 0]}
        fontSize={0.26}
        color="#bfdbfe"
        outlineWidth={0.02}
        outlineColor="#0f172a"
        anchorX="center"
        anchorY="middle"
      >
        O2
      </Text>
    </group>

    {/* H2 bottle */}
    <group position={[-0.85, 3.35, 0.95]}>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 1.5, 32]} />
        <meshPhysicalMaterial
          color="#22c55e"
          transparent
          opacity={0.35}
          roughness={0.2}
          clearcoat={0.5}
        />
      </mesh>
      <mesh position={[0, 1.7, 0]}>
        <sphereGeometry args={[0.3, 24, 24]} />
        <meshPhysicalMaterial
          color="#22c55e"
          transparent
          opacity={0.4}
          roughness={0.2}
          clearcoat={0.5}
        />
      </mesh>
      <Billboard position={[0, 2.35, 0]}>
        <Text fontSize={0.26} color="#bbf7d0" outlineWidth={0.02} outlineColor="#0f172a">
          H2
        </Text>
      </Billboard>

      {/* H2 thermal motion INSIDE the bottle */}
      <group position={[0, 0.95, 0]}>
        <H2TankMotion h2Kg={h2Kg} />
      </group>
    </group>
  </group>
);

const Floor: React.FC = () => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
    <planeGeometry args={[18, 18]} />
    <meshStandardMaterial color="#9ca3af" roughness={0.7} metalness={0.0} />
  </mesh>
);

const H2TankMotion: React.FC<{ h2Kg: number }> = ({ h2Kg }) => {
  const meshRef = useRef<THREE.InstancedMesh | null>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const count = 55;

  const seeds = useMemo(
    () =>
      new Array(count).fill(0).map(() => ({
        // Center in the tank: tight radius so particles cluster in the middle
        x: (Math.random() * 2 - 1) * 0.12,
        y: Math.random() * 0.55 + 0.3,
        z: (Math.random() * 2 - 1) * 0.12,
        phase: Math.random() * 10,
      })),
    [count],
  );

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    const intensity = Math.min(h2Kg / 25, 0.85);

    seeds.forEach((s, i) => {
      const jitter = 0.025 * intensity;
      const x = s.x + Math.sin(t * 3 + s.phase) * jitter;
      const baseY = s.y + Math.cos(t * 2.5 + s.phase) * jitter;
      const y = Math.min(0.95, Math.max(0.25, baseY));
      const z = s.z + Math.sin(t * 2 + s.phase) * jitter;
      dummy.position.set(x, y, z);
      const scale = 0.028;
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined as any, undefined as any, count]}>
      <sphereGeometry args={[1, 12, 12]} />
      <meshStandardMaterial color="#bbf7d0" transparent opacity={0.9} />
    </instancedMesh>
  );
};

export const PlantScene: React.FC<PlantSceneProps> = ({
  productionKg,
  currentA,
  running,
  h2Kg,
  onCathodeClick,
  onAnodeClick,
  onElectrolyteClick,
}) => {
  return (
    <Canvas camera={{ position: [6, 5, 8], fov: 45 }}>
      <color attach="background" args={['#020617']} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[5, 10, 6]} intensity={1.3} />
      <Floor />
      <GlbModelWithFallback />
      <CastnerCell
        productionKg={productionKg}
        currentA={currentA}
        running={running}
        onCathodeClick={onCathodeClick}
        onAnodeClick={onAnodeClick}
        onElectrolyteClick={onElectrolyteClick}
      />
      <GasCollectors h2Kg={h2Kg} />
      <Transformer />
      <WiringAndMeter />
      <OrbitControls enableDamping />
    </Canvas>
  );
};

