import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { journey, seg } from './state';
import { Tomato, Garlic, BasilPot, CheeseWedge, Egg, Lemon, BellPepper, Mushroom } from './Ingredients';
import { makeGlowTexture } from './Effects';

/**
 * Chapter III: the AI moment. The fridge ingredients levitate into a rotating
 * constellation while luminous lines draw the relationships between them —
 * the machine quietly understanding the kitchen. A hot core pulses at the
 * center and little "thought pulses" travel the links.
 */

const RING: Array<[number, number, number]> = [
  [2.55, 0.35, 0],
  [1.8, 1.4, 0.55],
  [0.4, 2.0, 0.8],
  [-1.15, 1.5, 0.5],
  [-2.4, 0.45, 0],
  [-1.55, -0.65, -0.55],
  [0.15, -1.25, -0.8],
  [1.65, -0.8, -0.5],
];

const LINKS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0],
  [0, 3], [1, 4], [2, 5], [2, 6], [0, 5], [3, 6],
];

const PULSE_COUNT = 5;
const _A = new THREE.Vector3();
const _B = new THREE.Vector3();

export const Constellation: React.FC = () => {
  const group = useRef<THREE.Group>(null);
  const lines = useRef<THREE.LineSegments>(null);
  const halo = useRef<THREE.Mesh>(null);
  const core = useRef<THREE.Mesh>(null);
  const coreGlow = useRef<THREE.Sprite>(null);
  const sparks = useRef<THREE.Points>(null);
  const pulses = useRef<Array<THREE.Sprite | null>>([]);
  const tex = useMemo(() => makeGlowTexture('rgba(255,225,160,0.95)'), []);

  const nodes = useMemo(
    () => [
      <Tomato key="tomato" scale={0.75} position={[0, -0.32, 0]} />,
      <Garlic key="garlic" scale={0.8} position={[0, -0.4, 0]} />,
      <BasilPot key="basil" scale={0.7} position={[0, -0.25, 0]} />,
      <CheeseWedge key="cheese" scale={0.7} position={[-0.24, -0.16, 0.21]} />,
      <Egg key="egg" scale={0.85} position={[0, -0.31, 0]} />,
      <Lemon key="lemon" scale={0.7} position={[0, -0.52, 0]} />,
      <BellPepper key="pepper" scale={0.75} position={[0, -0.33, 0]} />,
      <Mushroom key="mushroom" scale={0.75} position={[0, -0.25, 0]} />,
    ],
    []
  );

  const lineGeometry = useMemo(() => {
    const pts: number[] = [];
    for (const [a, b] of LINKS) {
      pts.push(...RING[a], ...RING[b]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return geo;
  }, []);

  // orbiting spark particles (two tilted rings)
  const { sparkPositions } = useMemo(() => {
    const sparkPositions = new Float32Array(140 * 3);
    for (let i = 0; i < 140; i++) {
      const a = (i / 140) * Math.PI * 2;
      const tilt = i % 2 === 0 ? 0.5 : -0.5;
      const r = 3.35 + Math.sin(i * 3.7) * 0.14;
      sparkPositions[i * 3] = Math.cos(a) * r;
      sparkPositions[i * 3 + 1] = Math.sin(a + tilt) * r * 0.32;
      sparkPositions[i * 3 + 2] = Math.sin(a) * r * 0.55;
    }
    return { sparkPositions };
  }, []);

  const pulseMeta = useMemo(
    () =>
      Array.from({ length: PULSE_COUNT }, (_, i) => ({
        speed: 0.05 + (i % 3) * 0.014,
        off: i / PULSE_COUNT + Math.random() * 0.08,
      })),
    []
  );

  useFrame(({ clock }, delta) => {
    const p = journey.progress;
    const g = group.current;
    if (!g) return;
    const presence = seg(p, 0.335, 0.4) * (1 - seg(p, 0.455, 0.5));
    g.visible = presence > 0.001;
    if (!g.visible) return;

    const s = Math.max(presence, 0.001);
    g.scale.setScalar(s);
    g.rotation.y = clock.elapsedTime * 0.14;
    g.position.y = 1.55 + Math.sin(clock.elapsedTime * 0.5) * 0.06;

    const mat = lines.current?.material as THREE.LineBasicMaterial | undefined;
    if (mat) {
      mat.opacity = presence * (0.34 + Math.sin(clock.elapsedTime * 1.8) * 0.08);
    }
    if (halo.current) {
      const hm = halo.current.material as THREE.MeshBasicMaterial;
      hm.opacity = presence * (0.05 + Math.sin(clock.elapsedTime * 0.9) * 0.012);
      halo.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 0.9) * 0.04);
    }
    // Core: breathing white-hot heart of the constellation
    const t = clock.elapsedTime;
    if (core.current) {
      core.current.rotation.x = t * 0.6;
      core.current.rotation.y = t * 0.9;
      const cm = core.current.material as THREE.MeshStandardMaterial;
      cm.emissiveIntensity = presence * (2.4 + Math.sin(t * 2.3) * 0.7);
      const cs = 1 + Math.sin(t * 2.3) * 0.06;
      core.current.scale.setScalar(cs);
    }
    if (coreGlow.current) {
      const sm = coreGlow.current.material as THREE.SpriteMaterial;
      sm.opacity = presence * (0.6 + Math.sin(t * 2.1) * 0.15);
      coreGlow.current.scale.setScalar(2.6 + Math.sin(t * 2.1) * 0.35);
    }
    // Spark ring counter-rotation
    if (sparks.current) {
      const smat = sparks.current.material as THREE.PointsMaterial;
      smat.opacity = presence * 0.5;
      sparks.current.rotation.y = -t * 0.32;
      sparks.current.rotation.z = Math.sin(t * 0.12) * 0.06;
    }
    // Gentle per-node breathing around each node's ring height
    g.children.forEach((child, i) => {
      if (!RING[i]) return; // halo mesh / link lines / core
      child.position.y = RING[i][1] + Math.sin(t * 0.9 + i * 1.7) * 0.05;
    });

    // Thought pulses travelling the links
    pulses.current.forEach((sprite, i) => {
      if (!sprite) return;
      const meta = pulseMeta[i];
      const cyc = (t * meta.speed + meta.off) % 1;
      const edgeIdx = Math.floor(cyc * LINKS.length);
      const local = cyc * LINKS.length - edgeIdx;
      const [aIdx, bIdx] = LINKS[edgeIdx];
      _A.fromArray(RING[aIdx]);
      _B.fromArray(RING[bIdx]);
      _A.lerp(_B, local);
      sprite.position.copy(_A);
      const fade = Math.min(1, Math.min(local, 1 - local) * 8);
      const sm = sprite.material as THREE.SpriteMaterial;
      sm.opacity = presence * fade * 0.9;
      const size = 0.22 + Math.sin(t * 6 + i) * 0.03;
      sprite.scale.setScalar(size);
    });
    void delta;
  });

  return (
    <group ref={group} position={[0, 1.55, 0.6]} scale={0.001}>
      {nodes.map((node, i) => (
        <group key={i} position={RING[i]}>
          {node}
        </group>
      ))}
      <mesh ref={halo}>
        <sphereGeometry args={[3.2, 24, 24]} />
        <meshBasicMaterial color="#f5c97b" transparent opacity={0.05} depthWrite={false} />
      </mesh>
      <lineSegments ref={lines} geometry={lineGeometry}>
        <lineBasicMaterial color="#f5c97b" transparent opacity={0} depthWrite={false} />
      </lineSegments>
      {/* White-hot core */}
      <mesh ref={core} position={[0, 0.05, 0]}>
        <icosahedronGeometry args={[0.2, 1]} />
        <meshStandardMaterial
          color="#2a241a"
          emissive="#ffe7b0"
          emissiveIntensity={2.4}
          roughness={0.3}
          metalness={0.4}
          toneMapped={false}
        />
      </mesh>
      <sprite ref={coreGlow} position={[0, 0.05, 0]} scale={2.6}>
        <spriteMaterial map={tex} color="#fff1cf" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <points ref={sparks}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[sparkPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.028}
          color="#ffe3ae"
          transparent
          opacity={0}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      {pulseMeta.map((_, i) => (
        <sprite
          key={i}
          ref={(el) => {
            pulses.current[i] = el;
          }}
          scale={0.22}
        >
          <spriteMaterial map={tex} color="#fff6de" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
    </group>
  );
};
