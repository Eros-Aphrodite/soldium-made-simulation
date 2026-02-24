import React, { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';

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

  // World-space paths: hood -> manifold -> tanks/well
  const hoodOut: [number, number, number] = [0.9, 3.6, 0.0];
  const manifold: [number, number, number] = [1.6, 2.2, -0.4];
  const o2In: [number, number, number] = [2.8, 1.95, -2.2];
  const h2In: [number, number, number] = [4.0, 1.95, -1.8];
  const wellIn: [number, number, number] = [6.1, 2.0, -1.1];

  const trunk: [number, number, number][] = [hoodOut, [1.2, 3.0, -0.6], manifold];
  const toO2: [number, number, number][] = [manifold, [2.1, 2.05, -1.2], o2In];
  const toH2: [number, number, number][] = [manifold, [2.9, 2.0, -1.0], h2In];
  const toWell: [number, number, number][] = [manifold, [3.9, 2.0, -0.6], wellIn];

  return (
    <group>
      {/* Pipes */}
      <TubePipe points={trunk} radius={0.08} color="#94a3b8" emissive="#38bdf8" emissiveIntensity={running ? 0.25 : 0.0} />
      <TubePipe points={toO2} radius={0.07} color="#60a5fa" emissive="#60a5fa" emissiveIntensity={running ? 0.25 : 0.0} opacity={0.85} />
      <TubePipe points={toH2} radius={0.07} color="#22c55e" emissive="#22c55e" emissiveIntensity={running ? 0.25 : 0.0} opacity={0.85} />
      <TubePipe points={toWell} radius={0.075} color="#a3a3a3" emissive="#e5e7eb" emissiveIntensity={running ? 0.12 : 0.0} opacity={0.7} />

      {/* Flow particles (clearly show gas moving) */}
      <GasFlowParticles points={trunk} count={90} color="#e0f2fe" speed={baseSpeed} running={running} size={0.06} />
      <GasFlowParticles points={toO2} count={70} color="#93c5fd" speed={baseSpeed * 1.2} running={running} size={0.055} />
      <GasFlowParticles points={toH2} count={70} color="#86efac" speed={baseSpeed * 1.2} running={running} size={0.055} />
      <GasFlowParticles points={toWell} count={80} color="#e5e7eb" speed={baseSpeed} running={running} size={0.05} />

      {/* Manifold junction */}
      <mesh position={manifold}>
        <sphereGeometry args={[0.12, 20, 20]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.35} emissive="#38bdf8" emissiveIntensity={running ? 0.2 : 0.0} />
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
}> = ({ productionKg, currentA, running, onCathodeClick, onAnodeClick, onElectrolyteClick }) => {
  // Clamp a reasonable range for visual scaling of the sodium collection pot
  const collectionHeight = 0.4 + Math.min(productionKg / 50, 2.5);
  // Activity is driven by current and only when simulation is running
  const currentScaled = Math.min(Math.abs(currentA) / 10_000, 2.0);
  const activity = running ? Math.min(currentScaled, 1.0) : 0; // 0–1 activity metric

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

  const electrolyteColor = electrolytePulse > 0.05 ? '#a3e635' : '#38bdf8';

  return (
    <group position={[0, 0, 0]}>
      {/* Transparent ceramic crucible walls */}
      <mesh
        position={[0, 1, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          setElectrolytePulse(1);
          onElectrolyteClick?.();
        }}
      >
        <cylinderGeometry args={[1.2, 1.0, 2, 64, 1, true]} />
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

      {/* Molten NaOH pool (slightly inset, semi‑transparent) */}
      <mesh
        position={[0, 0.55, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          setElectrolytePulse(1);
          onElectrolyteClick?.();
        }}
      >
        <cylinderGeometry args={[0.95, 0.95, 1.1, 64]} />
        <meshPhysicalMaterial
          color={electrolyteColor}
          transparent
          opacity={0.35}
          roughness={0.15}
          metalness={0.0}
          clearcoat={0.6}
          clearcoatRoughness={0.3}
        />
      </mesh>

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

      {/* Side neck leading to collection device (B → P) */}
      <group position={[1.6, 1.2, 0]}>
        {/* neck */}
        <mesh rotation={[0, 0, 0]}>
          <boxGeometry args={[1.0, 0.35, 0.5]} />
          <meshStandardMaterial color="#e5e7eb" roughness={0.85} metalness={0.05} />
        </mesh>
        {/* collection pot; height represents accumulated sodium */}
        <mesh position={[0.9, collectionHeight / 2, 0]}>
          <cylinderGeometry args={[0.45, 0.45, collectionHeight, 32]} />
          <meshStandardMaterial color="#facc15" metalness={0.6} roughness={0.3} />
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

const GasCollectors: React.FC = () => (
  <group position={[2.8, 0.8, -2.2]}>
    {/* manifold from hood to tanks */}
    <mesh position={[-1.2, 1.4, 1.8]} rotation={[0, 0.6, 0]}>
      <cylinderGeometry args={[0.08, 0.08, 3.0, 20]} />
      <meshStandardMaterial color="#9ca3af" />
    </mesh>

    {/* O2 tank */}
    <group position={[0, 0, 0]}>
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

    {/* H2 tank */}
    <group position={[1.2, 0, 0.4]}>
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
      <Text
        position={[0, 2.35, 0]}
        fontSize={0.26}
        color="#bbf7d0"
        outlineWidth={0.02}
        outlineColor="#0f172a"
        anchorX="center"
        anchorY="middle"
      >
        H2
      </Text>
    </group>

    {/* Large gas well / storage vessel connected to manifold */}
    <group position={[3.3, 1.15, 1.1]}>
      {/* connector pipe from manifold area */}
      <mesh position={[-1.5, 0.5, 0.3]} rotation={[0, -0.6, 0.15]}>
        <cylinderGeometry args={[0.1, 0.1, 3.2, 20]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.4} roughness={0.45} />
      </mesh>

      {/* gas well body */}
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.9, 0.9, 2.6, 48]} />
        <meshPhysicalMaterial
          color="#94a3b8"
          transparent
          opacity={0.18}
          roughness={0.15}
          clearcoat={0.6}
          clearcoatRoughness={0.25}
        />
      </mesh>
      <mesh position={[0, 2.25, 0]}>
        <sphereGeometry args={[0.85, 32, 32]} />
        <meshPhysicalMaterial
          color="#94a3b8"
          transparent
          opacity={0.18}
          roughness={0.15}
          clearcoat={0.6}
          clearcoatRoughness={0.25}
        />
      </mesh>
      <Text
        position={[0, 3.1, 0]}
        fontSize={0.22}
        color="#e5e7eb"
        outlineWidth={0.02}
        outlineColor="#0f172a"
        anchorX="center"
        anchorY="middle"
      >
        Gas well
      </Text>
    </group>
  </group>
);

const GasHood: React.FC = () => (
  <group position={[0, 2.7, 0]}>
    <mesh>
      <boxGeometry args={[2.4, 0.25, 2.4]} />
      <meshStandardMaterial color="#374151" />
    </mesh>
    {/* exhaust stack */}
    <mesh position={[0.9, 0.9, 0]}>
      <cylinderGeometry args={[0.35, 0.35, 1.5, 32]} />
      <meshStandardMaterial color="#f97316" />
    </mesh>
  </group>
);

const Floor: React.FC = () => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
    <planeGeometry args={[16, 16]} />
    <meshStandardMaterial color="#020617" />
  </mesh>
);

const H2TankMotion: React.FC<{ h2Kg: number }> = ({ h2Kg }) => {
  const meshRef = useRef<THREE.InstancedMesh | null>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const count = 160;

  const seeds = useMemo(
    () =>
      new Array(count).fill(0).map(() => ({
        x: (Math.random() * 2 - 1) * 0.25,
        y: Math.random() * 1.2 + 0.3,
        z: (Math.random() * 2 - 1) * 0.25,
        phase: Math.random() * 10,
      })),
    [count],
  );

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    const intensity = Math.min(h2Kg / 10, 1.5);

    seeds.forEach((s, i) => {
      const jitter = 0.05 * intensity;
      dummy.position.set(
        s.x + Math.sin(t * 3 + s.phase) * jitter,
        s.y + Math.cos(t * 2.5 + s.phase) * jitter,
        s.z + Math.sin(t * 2 + s.phase) * jitter,
      );
      const scale = 0.04;
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
      <CastnerCell
        productionKg={productionKg}
        currentA={currentA}
        running={running}
        onCathodeClick={onCathodeClick}
        onAnodeClick={onAnodeClick}
        onElectrolyteClick={onElectrolyteClick}
      />
      <GasHood />
      <Transformer />
      <GasCollectors />
      <GasPipesAndFlow running={running} currentA={currentA} />
      {/* H2 thermal motion inside H2 tank, positioned to match the green tank group */}
      <group position={[4.0, 0.8, -1.8]}>
        <H2TankMotion h2Kg={h2Kg} />
      </group>
      <WiringAndMeter />
      <OrbitControls enableDamping />
    </Canvas>
  );
};

