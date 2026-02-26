import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
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
  /** Optional multiplier to scale the auto-normalised model up/down. */
  scaleMultiplier?: number;
}> = ({ url, position = [0, 0, 0], rotation = [0, 0, 0], scaleMultiplier = 1 }) => {
  const { scene } = useGLTF(url);

  const groupRef = useRef<THREE.Group | null>(null);
  const focusLevelRef = useRef(0);
  const [detailActive, setDetailActive] = useState(false);

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
    const s = (TARGET_SIZE * scaleMultiplier) / maxDim;
    return { cloned: c, scale: s, height: size.y };
  }, [scene, scaleMultiplier]);

  useEffect(() => {
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [cloned]);

  // Smoothly enlarge / highlight the GLB when a numbered hotspot dot is clicked.
  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const target = detailActive ? 1 : 0;
    const prev = focusLevelRef.current;
    const next = prev + (target - prev) * Math.min(1, delta * 4);
    focusLevelRef.current = next;

    const sExtra = 1 + next * 0.35;
    group.scale.set(scale * sExtra, scale * sExtra, scale * sExtra);
  });

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    const name = (e.object as THREE.Object3D).name?.toLowerCase?.() ?? '';
    // Treat meshes whose names suggest dots/markers as hotspots for detail view.
    if (name.includes('dot') || name.includes('spot') || name.includes('marker')) {
      e.stopPropagation();
      setDetailActive((v) => !v);
    }
  };

  // Raise the centered model so its base sits on the global floor (y = 0).
  const [px, py, pz] = position;
  const yOffset = (height * scale) / 2;

  return (
    <group
      ref={groupRef}
      position={[px, py + yOffset, pz]}
      rotation={rotation}
      scale={[scale, scale, scale]}
      onPointerDown={handlePointerDown}
    >
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
    {/* Gas purification skid with integrated control room */}
    <group>
      <GlbModel
        url={keuvModelUrl}
        position={[6.0, 0.0, 14.5]}
        rotation={[0, 0, 0]}
        scaleMultiplier={1.3}
      />
      {/* Label positioned above the actual gas purification tower */}
      <Billboard position={[6, 7.0, 14.5]}>
        <Text
          fontSize={0.38}
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
  activeModel: 'plant' | 'hv-room';
  warningActive: boolean;
  exploded: boolean;
  warningElapsed_s: number;
  onCathodeClick?: () => void;
  onAnodeClick?: () => void;
  onElectrolyteClick?: () => void;
};

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
  const curve = useMemo(
    () => new THREE.CatmullRomCurve3(pts, false, 'centripetal'),
    [pts],
  );

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
      const p = curve.getPointAt(u);
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
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={1.2}
        transparent
        opacity={0.0}
      />
    </instancedMesh>
  );
};

const GasPipesAndFlow: React.FC<{ running: boolean; currentA: number }> = ({ running, currentA }) => {
  // Speeds scale gently with current
  const currentScaled = Math.min(Math.abs(currentA) / 10_000, 2.0);
  const baseSpeed = 0.22 + currentScaled * 0.18;

  // Short vertical risers from lid -> bottles on top plate.
  const lidO2Out: [number, number, number] = [0.55, 2.95, 0.65];
  const lidH2Out: [number, number, number] = [-0.55, 2.95, 0.65];
  const o2BottleIn: [number, number, number] = [0.85, 3.75, 0.95];
  const h2BottleIn: [number, number, number] = [-0.85, 3.75, 0.95];

  // Outlet from the H2 storage bottle (top of the green H2 tank).
  const h2TankOutTop: [number, number, number] = [-0.85, 4.0, 0.95];

  // Connection from H2 tank outlet that runs as a high, straight header
  // following the perimeter path indicated by your arrow: first inboard,
  // then along the long wall, then down and into the gas purifier.
  const purifierInlet: [number, number, number] = [6.4, 1.8, 14];
  const toPurifier: [number, number, number][] = [
    h2TankOutTop,
    // step inward from the tank towards the inner wall
    [-0.85, 4.0, 6.5],
    // long straight run along the top of the wall in the arrow direction
    [7.0, 4.0, 6.5],
    // drop down near the purifier skid at the far corner
    [7.0, 1.8, 14.0],
    // short horizontal into the inlet
    [purifierInlet[0], 1.8, purifierInlet[2]],
    purifierInlet,
  ];

  const toO2: [number, number, number][] = [lidO2Out, [0.7, 3.1, 0.9], o2BottleIn];
  const toH2: [number, number, number][] = [lidH2Out, [-0.7, 3.1, 0.9], h2BottleIn];

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

      {/* Header -> Gas Purifier tower transfer line */}
      <TubePipe
        points={toPurifier}
        radius={0.1}
        color="#e5e7eb"
        emissive="#e5e7eb"
        emissiveIntensity={running ? 0.2 : 0.0}
        opacity={0.45}
      />

      {/* Flow particles (clearly show gas moving within the plant and into purifier) */}
      <GasFlowParticles
        points={toO2}
        count={55}
        color="#bfdbfe"
        speed={baseSpeed * 1.35}
        running={running}
        size={0.06}
      />
      <GasFlowParticles
        points={toH2}
        count={55}
        color="#bbf7d0"
        speed={baseSpeed * 1.35}
        running={running}
        size={0.06}
      />
      <GasFlowParticles
        points={toPurifier}
        count={140}
        color="#facc15"
        speed={baseSpeed * 1.7}
        running={running}
        size={0.09}
      />

      {/* Lid ports where gas exits into pipes */}
      <mesh position={lidO2Out}>
        <cylinderGeometry args={[0.07, 0.07, 0.08, 18]} />
        <meshStandardMaterial color="#93c5fd" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={lidH2Out}>
        <cylinderGeometry args={[0.07, 0.07, 0.08, 18]} />
        <meshStandardMaterial color="#86efac" metalness={0.6} roughness={0.3} />
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

const HelicalCoolingCoil: React.FC<{ offsetZ?: number }> = ({ offsetZ = 0 }) => {
  const curve = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const turns = 6;
    const height = 1.6;
    const radius = 0.55;
    const segments = 160;

    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2 * turns;
      const y = (height * i) / segments - height / 2;
      const x = radius * Math.cos(t);
      const z = radius * Math.sin(t);
      points.push(new THREE.Vector3(x, y, z));
    }

    return new THREE.CatmullRomCurve3(points, false, 'centripetal');
  }, []);

  const geom = useMemo(() => new THREE.TubeGeometry(curve, 320, 0.06, 20, false), [curve]);

  return (
    <group position={[0, 0, offsetZ]}>
      <mesh geometry={geom}>
        <meshStandardMaterial color="#9ca3af" metalness={0.85} roughness={0.25} />
      </mesh>
    </group>
  );
};

const CoolingCoilAssembly: React.FC = () => {
  const spacing = 0.5;
  const height = 1.6;
  const connectorCount = 6;
  const connectorRadius = 0.04;

  const connectors = useMemo(
    () =>
      Array.from({ length: connectorCount }).map((_, i) => {
        const t = i / (connectorCount - 1 || 1);
        return height * t - height / 2;
      }),
    [connectorCount, height],
  );

  return (
    <group>
      {/* Left and right springs */}
      <HelicalCoolingCoil offsetZ={-spacing / 2} />
      <HelicalCoolingCoil offsetZ={spacing / 2} />

      {/* Connecting rods between the two springs */}
      {connectors.map((y, idx) => (
        <mesh key={idx} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[connectorRadius, connectorRadius, spacing, 12]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.85} roughness={0.25} />
        </mesh>
      ))}
    </group>
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
  // Activity is driven by current and only when simulation is running
  const currentScaled = Math.min(Math.abs(currentA) / 10_000, 2.0);
  const activity = running ? Math.min(currentScaled, 1.0) : 0; // 0–1 activity metric

  // Approximate depletion of the NaOH bath from produced sodium.
  const MAX_BATCH_NA_KG = 10;
  const depletion = Math.min(productionKg / MAX_BATCH_NA_KG, 1.0);
  const electrolyteFill = 1 - depletion * 0.75; // never fully empty visually
   // Y position of the top surface of the molten bath (used for a domed meniscus cap).
  const electrolyteTopY = 0.95 + (1.35 * electrolyteFill) / 2;

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
      {/* Rectangular furnace housing – now semi‑transparent so the reaction is visible */}
      <group>
        {/* main body */}
        <mesh position={[0, 1.45, 0]}>
          <boxGeometry args={[3.4, 2.9, 2.8]} />
          <meshPhysicalMaterial
            color="#4b5563"
            transparent
            opacity={0.32}
            roughness={0.25}
            metalness={0.2}
            clearcoat={0.6}
            clearcoatRoughness={0.25}
          />
        </mesh>
        {/* top plate */}
        <mesh position={[0, 2.95, 0]}>
          <boxGeometry args={[3.7, 0.25, 3.05]} />
          <meshPhysicalMaterial
            color="#6b7280"
            transparent
            opacity={0.4}
            roughness={0.3}
            metalness={0.3}
            clearcoat={0.7}
            clearcoatRoughness={0.25}
          />
        </mesh>
        {/* base plinth */}
        <mesh position={[0, 0.2, 0]}>
          <boxGeometry args={[3.8, 0.4, 3.2]} />
          <meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.6} />
        </mesh>
      </group>

      {/* Raw material (NaOH) supply device near the cell */}
      <group position={[-3.4, 0.0, -1.2]}>
        {/* Larger feed tank that reaches down to the floor */}
        <mesh position={[0, 1.1, 0]}>
          <cylinderGeometry args={[1.95, 0.95, 2.2, 24]} />
          <meshStandardMaterial color="#0ea5e9" metalness={0.3} roughness={0.45} />
        </mesh>
        <mesh position={[0, 2.3, 0]}>
          <cylinderGeometry args={[0.55, 0.55, 0.35, 24]} />
          <meshStandardMaterial color="#38bdf8" metalness={0.5} roughness={0.3} />
        </mesh>
        <Billboard position={[0, 3.0, 0]}>
          <Text fontSize={0.28} color="#e5f0ff" outlineWidth={0.02} outlineColor="#0f172a">
            NaOH feed
          </Text>
        </Billboard>
      </group>

      {/* Sodium treatment / storage tank: large quartz cylinder filled with paraffin */}
      <group position={[4.4, 0.0, -4.0]}>
        {/* Quartz outer wall, transparent and reaching to the floor */}
        <mesh position={[0, 1.4, 0]}>
          <cylinderGeometry args={[1.3, 1.3, 2.8, 40]} />
          <meshPhysicalMaterial
            color="#e5e7eb"
            transparent
            opacity={0.35}
            roughness={0.15}
            metalness={0.0}
            clearcoat={0.8}
            clearcoatRoughness={0.25}
          />
        </mesh>
        {/* Paraffin fill inside the quartz tank */}
        <mesh position={[0, 1.1, 0]} scale={[1, 0.75, 1]}>
          <cylinderGeometry args={[1.1, 1.1, 2.0, 40]} />
          <meshPhysicalMaterial
            color="#facc15"
            transparent
            opacity={0.7}
            roughness={0.25}
            metalness={0.05}
            clearcoat={0.6}
            clearcoatRoughness={0.3}
          />
        </mesh>
        {/* Simple dark base ring under the tank */}
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[1.35, 1.35, 0.2, 40]} />
          <meshStandardMaterial color="#111827" metalness={0.6} roughness={0.6} />
        </mesh>
        <Billboard position={[0, 3.8, 0]}>
          <Text fontSize={0.3} color="#fef9c3" outlineWidth={0.02} outlineColor="#0f172a">
            Na treatment tank
          </Text>
        </Billboard>
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

      {/* Slightly domed meniscus on top of the molten bath so the side view is not a perfectly flat line */}
      <mesh position={[0, electrolyteTopY, 0]} scale={[1.02, 0.22, 1.02]}>
        <sphereGeometry args={[1, 32, 24]} />
        <meshPhysicalMaterial
          color={electrolyteColor}
          transparent
          opacity={0.45}
          roughness={0.25}
          metalness={0.1}
          clearcoat={0.85}
          clearcoatRoughness={0.25}
        />
      </mesh>

      {/* Sodium overflow lip */}
      <mesh position={[0, 1.68, 0]}>
        <torusGeometry args={[1.07, 0.07, 16, 64]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.6} roughness={0.25} />
      </mesh>

      {/* Pipe carrying molten sodium from the cell overflow to the Na treatment tank */}
      <TubePipe
        points={[
          // vertical riser from overflow lip
          [0.95, 1.68, 0.45],
          [0.95, 3.0, 0.45],
          // long horizontal run towards the Na treatment tank (diagonal in X/Z plane)
          [4.4, 3.0, -4.0],
          // vertical drop into the paraffin inside the tank
          [4.4, 2.0, -4.0],
        ]}
        radius={0.08}
        color="#facc15"
        emissive="#facc15"
        emissiveIntensity={running ? 0.6 : 0.1}
        opacity={0.9}
      />

      {/* Right-side cooling coil – twin springs with cross-connectors (as per sketch) */}
      <group position={[1.85, 1.0, 0]} rotation={[0, 0, 0]}>
        <CoolingCoilAssembly />
        {/* inlet/outlet stubs */}
        <mesh position={[-0.9, 0.75, -0.45]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.06, 0.9, 16]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh position={[0.9, -0.15, -0.45]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.06, 0.9, 16]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.25} />
        </mesh>
      </group>

      {/* Left-side cooling coil – mirrored twin springs assembly */}
      <group position={[-1.85, 1.0, 0]} rotation={[0, Math.PI, 0]}>
        <CoolingCoilAssembly />
        {/* inlet/outlet stubs */}
        <mesh position={[-0.9, 0.75, -0.45]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.06, 0.9, 16]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh position={[0.9, -0.15, -0.45]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.06, 0.9, 16]} />
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

    </group>
  );
};

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
  <mesh position={[0, -0.2, 0]}>
    {/* Slightly thick slab so the grey pad is visible even from below */}
    <boxGeometry args={[30, 0.4, 30]} />
    <meshStandardMaterial color="#9ca3af" roughness={0.7} metalness={0.0} />
  </mesh>
);

const HighVoltageRoom: React.FC = () => (
  <group>
    {/* Integrated 10 kV high-voltage power distribution room occupying ~40% of the grey pad */}
    <GlbModel
      url="/models/10kv_high-voltage_power_distribution_room.glb"
      position={[0, 0, 9]}
      rotation={[0, Math.PI / 2, 0]}
      scaleMultiplier={3.0}
    />
  </group>
);

const VoltmeterPanel: React.FC = () => {
  // Mounted on the inner wall at the same control position as the previous ammeter
  const x = -1.2;
  const y = 0.8;
  const z = 14.6;

  return (
    <>
      {/* Physical voltmeter model mounted horizontally against the wall */}
      <GlbModel
        url="/models/voltmeter-freepoly.org.glb"
        position={[x + 0.02, y, z]}
        rotation={[0, Math.PI / 2, 0]}
        scaleMultiplier={0.45}
      />
      {/* Simple voltage label above the instrument */}
      <Billboard position={[x, y + 1.9, z]}>
        <Text
          fontSize={0.42}
          color="#f9fafb"
          outlineWidth={0.04}
          outlineColor="#0f172a"
          anchorX="center"
          anchorY="middle"
        >
          V
        </Text>
      </Billboard>
    </>
  );
};

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
  activeModel,
  warningActive,
  exploded,
  warningElapsed_s,
  onCathodeClick,
  onAnodeClick,
  onElectrolyteClick,
}) => {
  const [gasExploded, setGasExploded] = useState(false);

  useEffect(() => {
    if (!exploded) {
      setGasExploded(false);
      return;
    }
    const id = setTimeout(() => setGasExploded(true), 1000);
    return () => clearTimeout(id);
  }, [exploded]);

  return (
    <Canvas camera={{ position: [6, 5, 8], fov: 45 }}>
      <color attach="background" args={['#020617']} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[5, 10, 6]} intensity={1.3} />
      <Floor />
      {warningActive && !exploded && (
        <>
          <Billboard position={[0, 6.0, 0]}>
            <Text
              fontSize={1.1}
              color="#fecaca"
              outlineWidth={0.09}
              outlineColor="#7f1d1d"
              anchorX="center"
              anchorY="middle"
            >
              WARNING: Electrode limit / over-current
            </Text>
          </Billboard>
          <Billboard position={[0, 4.8, 0]}>
            <Text
              fontSize={1.4}
              color="#fee2e2"
              outlineWidth={0.12}
              outlineColor="#7f1d1d"
              anchorX="center"
              anchorY="middle"
            >
              {Math.max(0, 10 - warningElapsed_s).toFixed(1)} s
            </Text>
          </Billboard>
        </>
      )}
      {/* Only one major 3D model group is shown at a time for clear inspection. */}
      {activeModel === 'plant' &&
        (exploded ? (
          <group position={[0, 0, -4.5]}>
            {/* Chaotic explosion: fractured fire, jagged debris, dark smoke – not a single smooth egg */}
            <group>
              {/* Scorched ground */}
              <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.5, 4.5, 32]} />
                <meshStandardMaterial color="#0a0a0a" roughness={1} metalness={0} />
              </mesh>

              {/* Fractured fire core – multiple irregular blobs instead of one sphere */}
              <mesh position={[0.3, 1.8, -0.2]} scale={[1.1, 1.6, 0.9]} rotation={[0.1, 0.2, 0]}>
                <dodecahedronGeometry args={[1.4, 0]} />
                <meshStandardMaterial
                  color="#dc2626"
                  emissive="#dc2626"
                  emissiveIntensity={4}
                  transparent
                  opacity={0.9}
                  roughness={0.35}
                />
              </mesh>
              <mesh position={[-0.5, 2.2, 0.3]} scale={[0.8, 1.2, 1.0]} rotation={[0.3, -0.2, 0.1]}>
                <octahedronGeometry args={[1.2, 0]} />
                <meshStandardMaterial
                  color="#ea580c"
                  emissive="#f97316"
                  emissiveIntensity={4.2}
                  transparent
                  opacity={0.9}
                />
              </mesh>
              <mesh position={[0.4, 2.6, -0.4]} scale={[1.0, 0.9, 1.2]} rotation={[-0.2, 0.4, 0]}>
                <tetrahedronGeometry args={[1.3, 0]} />
                <meshStandardMaterial
                  color="#f97316"
                  emissive="#fbbf24"
                  emissiveIntensity={3.2}
                  transparent
                  opacity={0.85}
                />
              </mesh>

              {/* Soft outer glow shell to punch up brightness without going back to an 'egg' */}
              <mesh position={[0, 2.2, -0.1]} scale={[2.4, 1.8, 2.4]}>
                <sphereGeometry args={[2.0, 32, 32]} />
                <meshStandardMaterial
                  color="#facc15"
                  emissive="#facc15"
                  emissiveIntensity={1.6}
                  transparent
                  opacity={0.22}
                />
              </mesh>

              {/* Floating embers around the blast to make it feel fancier and more alive */}
              <mesh position={[-1.6, 2.9, 0.4]} scale={[0.2, 0.2, 0.2]}>
                <sphereGeometry args={[0.6, 16, 16]} />
                <meshStandardMaterial
                  color="#f97316"
                  emissive="#f97316"
                  emissiveIntensity={2.5}
                  transparent
                  opacity={0.85}
                />
              </mesh>
              <mesh position={[1.2, 3.3, -0.6]} scale={[0.18, 0.18, 0.18]}>
                <sphereGeometry args={[0.6, 16, 16]} />
                <meshStandardMaterial
                  color="#fb923c"
                  emissive="#fb923c"
                  emissiveIntensity={2.2}
                  transparent
                  opacity={0.9}
                />
              </mesh>
              <mesh position={[0.1, 3.0, 1.1]} scale={[0.16, 0.16, 0.16]}>
                <sphereGeometry args={[0.5, 16, 16]} />
                <meshStandardMaterial
                  color="#fed7aa"
                  emissive="#fed7aa"
                  emissiveIntensity={2}
                  transparent
                  opacity={0.9}
                />
              </mesh>

              {/* Rising jagged flame tongues */}
              <mesh position={[0, 3.2, 0]} rotation={[0.2, 0, 0]}>
                <coneGeometry args={[1.8, 2.2, 8]} />
                <meshStandardMaterial
                  color="#b91c1c"
                  emissive="#dc2626"
                  emissiveIntensity={2.4}
                  transparent
                  opacity={0.55}
                />
              </mesh>

              {/* Dark smoke plume – breaks the "egg" silhouette */}
              <mesh position={[0.2, 3.8, 0.1]} scale={[2.2, 1.8, 2.0]} rotation={[0.1, 0.3, 0]}>
                <dodecahedronGeometry args={[1.2, 0]} />
                <meshStandardMaterial
                  color="#1f2937"
                  emissive="#374151"
                  emissiveIntensity={0.3}
                  transparent
                  opacity={0.5}
                  roughness={0.9}
                />
              </mesh>

              {/* Jagged debris – angular, scattered */}
              <mesh position={[-2.6, 0.3, 0.8]} rotation={[0.4, 0.5, 0.6]}>
                <boxGeometry args={[1.2, 0.4, 0.8]} />
                <meshStandardMaterial color="#0f172a" metalness={0.7} roughness={0.6} />
              </mesh>
              <mesh position={[2.2, 0.35, -0.6]} rotation={[0.2, -0.6, -0.4]}>
                <boxGeometry args={[0.9, 0.35, 1.1]} />
                <meshStandardMaterial color="#111827" metalness={0.6} roughness={0.7} />
              </mesh>
              <mesh position={[0.5, 0.4, 2.0]} rotation={[0.3, 0.2, -0.5]}>
                <boxGeometry args={[1.4, 0.25, 0.7]} />
                <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.8} />
              </mesh>
              <mesh position={[-1.4, 0.5, -1.2]} rotation={[-0.3, 0.8, 0.2]}>
                <boxGeometry args={[0.6, 0.5, 0.5]} />
                <meshStandardMaterial color="#0c0a09" metalness={0.8} roughness={0.5} />
              </mesh>
              <mesh position={[1.8, 0.25, 1.2]} rotation={[0.1, -0.3, 0.7]}>
                <boxGeometry args={[0.8, 0.2, 1.0]} />
                <meshStandardMaterial color="#292524" metalness={0.6} roughness={0.6} />
              </mesh>
              <mesh position={[-0.8, 0.6, -0.5]} rotation={[0.5, 0, 0.4]}>
                <boxGeometry args={[0.5, 0.45, 0.4]} />
                <meshStandardMaterial color="#1c1917" metalness={0.7} roughness={0.5} />
              </mesh>

              {/* Gas / Na treatment tank explodes 1s after cell */}
              {gasExploded && (
                <group position={[4.4, 0.2, -4.0]} rotation={[0.7, 0.4, 0]}>
                  <mesh position={[0, 1.4, 0]}>
                    <cylinderGeometry args={[1.3, 1.3, 2.8, 32]} />
                    <meshStandardMaterial
                      color="#e5e7eb"
                      transparent
                      opacity={0.25}
                      metalness={0}
                      roughness={0.2}
                    />
                  </mesh>
                  <mesh position={[0, 1.1, 0]} scale={[1, 0.75, 1]}>
                    <cylinderGeometry args={[1.1, 1.1, 2.0, 32]} />
                    <meshStandardMaterial
                      color="#facc15"
                      transparent
                      opacity={0.6}
                      roughness={0.3}
                    />
                  </mesh>
                </group>
              )}
            </group>

            <Billboard position={[0, 9.0, 0]}>
              <Text
                fontSize={1.1}
                color="#fecaca"
                outlineWidth={0.1}
                outlineColor="#7f1d1d"
                anchorX="center"
                anchorY="middle"
              >
                TEST FAILED – CELL EXPLODED
              </Text>
            </Billboard>
          </group>
        ) : (
          // Center the integrated plant + gas purification + control room block on the grey pad
          <group position={[0, 0, -4.5]}>
            {/* Core sodium production cell */}
            <CastnerCell
              productionKg={productionKg}
              currentA={currentA}
              running={running}
              onCathodeClick={onCathodeClick}
              onAnodeClick={onAnodeClick}
              onElectrolyteClick={onElectrolyteClick}
            />
            {/* Gas handling: bottles on top of the cell and external purifier to the right */}
            <GasCollectors h2Kg={h2Kg} />
            <GasPipesAndFlow running={running} currentA={currentA} />
            {/* Gas purification tower and enlarged control room on the grey pad */}
            <GlbModelWithFallback />
            <HighVoltageRoom />
            {/* Voltmeter panel mounted in the control room */}
            <VoltmeterPanel />
          </group>
        ))}
      {activeModel === 'hv-room' && <HighVoltageRoom />}
      <OrbitControls enableDamping />
    </Canvas>
  );
};

