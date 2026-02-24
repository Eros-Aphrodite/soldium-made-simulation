import React, { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
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
          color="#9ca3af"
          metalness={0.8}
          roughness={0.3}
          emissive="#38bdf8"
          emissiveIntensity={0.8 * cathodePulse}
        />
      </mesh>
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
          color="#9ca3af"
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
          color="#9ca3af"
          metalness={0.8}
          roughness={0.3}
          emissive="#f97316"
          emissiveIntensity={0.8 * anodePulse}
        />
      </mesh>
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
      {/* H2 thermal motion inside H2 tank, positioned to match the green tank group */}
      <group position={[4.0, 0.8, -1.8]}>
        <H2TankMotion h2Kg={h2Kg} />
      </group>
      <WiringAndMeter />
      <OrbitControls enableDamping />
    </Canvas>
  );
};

