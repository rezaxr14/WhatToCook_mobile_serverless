import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { journey, seg, isMobileDevice } from './state';
import { makeGlowTexture } from './Effects';

/**
 * Chapter IV: the recipe galaxy. Hundreds of glowing dish-stars fill the space,
 * accented with celestial orbital rings, lower-right star clusters, and
 * luminous constellation filaments.
 */

const WARM = ['#ffe9c4', '#f5b95c', '#ff9d5c', '#e8654f', '#ffd180'];
const COOL = ['#9ad7c9', '#c9b89a', '#7ad0e2'];

/** Soft volumetric dust clouds floating inside the galaxy. */
const Nebula: React.FC = () => {
  const group = useRef<THREE.Group>(null);
  const tex = useMemo(() => makeGlowTexture('rgba(255,196,140,0.85)'), []);
  const puffs = useMemo(
    () =>
      Array.from({ length: 11 }, (_, i) => ({
        pos: [
          (i - 5) * 2.4 + (Math.random() - 0.5) * 1.8,
          (Math.random() - 0.5) * 3.6,
          -2 + Math.random() * 16,
        ] as [number, number, number],
        r: 2.8 + Math.random() * 4.6,
        color: i % 3 === 0 ? '#7c4a3a' : i % 3 === 1 ? '#c07a3f' : '#4a5a7c',
        spin: (Math.random() - 0.5) * 0.02,
      })),
    []
  );

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const presence = seg(journey.progress, 0.41, 0.47) * (1 - seg(journey.progress, 0.59, 0.64));
    g.visible = presence > 0.005;
    if (!g.visible) return;
    const t = clock.elapsedTime;
    g.children.forEach((child, i) => {
      const puff = puffs[i];
      const sm = (child as THREE.Sprite).material as THREE.SpriteMaterial;
      sm.opacity = presence * 0.065;
      child.rotation.z = t * puff.spin;
      child.position.y = puff.pos[1] + Math.sin(t * 0.1 + i * 2.2) * 0.25;
    });
    g.rotation.y = t * 0.004;
  });

  return (
    <group ref={group}>
      {puffs.map((puff, i) => (
        <sprite key={i} position={puff.pos} scale={puff.r}>
          <spriteMaterial map={tex} color={puff.color} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
    </group>
  );
};

/** Luminous celestial orbital rings that embrace the galaxy path. */
const OrbitRings: React.FC = () => {
  const group = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const p = journey.progress;
    const presence = seg(p, 0.41, 0.47) * (1 - seg(p, 0.585, 0.64));
    group.current.visible = presence > 0.001;
    if (!group.current.visible) return;
    const t = clock.elapsedTime;
    group.current.rotation.y = t * 0.012;
    group.current.rotation.z = Math.sin(t * 0.03) * 0.08;
    group.current.children.forEach((c, idx) => {
      const mesh = c as THREE.Mesh;
      if (mesh.material) {
        (mesh.material as THREE.MeshBasicMaterial).opacity = presence * (idx === 0 ? 0.32 : idx === 1 ? 0.24 : 0.18);
      }
    });
  });

  return (
    <group ref={group} position={[0, 1.2, 5]} rotation={[0.45, 0.2, -0.15]}>
      {/* Inner vibrant orbit ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[3.8, 0.014, 12, 80]} />
        <meshBasicMaterial color="#f5b95c" transparent opacity={0.32} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* Mid orbit ring */}
      <mesh rotation={[Math.PI / 2.1, 0.3, 0]}>
        <torusGeometry args={[5.8, 0.016, 12, 96]} />
        <meshBasicMaterial color="#ff9d5c" transparent opacity={0.24} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* Outer faint celestial ring */}
      <mesh rotation={[Math.PI / 1.9, -0.2, 0]}>
        <torusGeometry args={[8.4, 0.018, 12, 108]} />
        <meshBasicMaterial color="#ffe9c4" transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
};

/** Pulsating culinary star beacons positioned across the galaxy path. */
const BeaconStars: React.FC = () => {
  const group = useRef<THREE.Group>(null);
  const beacons = useMemo(
    () => [
      { pos: [-1.8, 0.9, 7.0] as [number, number, number], color: '#f5b95c', scale: 0.14 },
      { pos: [1.9, -0.1, 5.6] as [number, number, number], color: '#ff9d5c', scale: 0.13 },
      { pos: [-0.6, 1.8, 4.2] as [number, number, number], color: '#ffe9c4', scale: 0.15 },
      { pos: [0.8, 2.2, 8.5] as [number, number, number], color: '#ffd180', scale: 0.12 },
      { pos: [2.8, -0.9, 6.2] as [number, number, number], color: '#f5b95c', scale: 0.13 },
    ],
    []
  );

  useFrame(({ clock }) => {
    if (!group.current) return;
    const p = journey.progress;
    const presence = seg(p, 0.41, 0.47) * (1 - seg(p, 0.585, 0.64));
    group.current.visible = presence > 0.001;
    if (!group.current.visible) return;
    const t = clock.elapsedTime;
    group.current.children.forEach((child, i) => {
      const pulse = 1 + Math.sin(t * 3.5 + i * 1.8) * 0.2;
      child.scale.setScalar(beacons[i].scale * pulse * presence);
    });
  });

  return (
    <group ref={group}>
      {beacons.map((b, i) => (
        <mesh key={i} position={b.pos}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial color={b.color} transparent opacity={0.88} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  );
};

/** Glowing celestial constellation filaments linking key beacons. */
const ConstellationFilaments: React.FC = () => {
  const lineRef = useRef<THREE.LineSegments>(null);

  const lineGeometry = useMemo(() => {
    const coords = [
      // Beacon 0 to Beacon 1
      -1.8, 0.9, 7.0, 1.9, -0.1, 5.6,
      // Beacon 1 to Beacon 2
      1.9, -0.1, 5.6, -0.6, 1.8, 4.2,
      // Beacon 2 to Beacon 3
      -0.6, 1.8, 4.2, 0.8, 2.2, 8.5,
      // Beacon 3 to Beacon 0
      0.8, 2.2, 8.5, -1.8, 0.9, 7.0,
      // Lower right filaments
      1.9, -0.1, 5.6, 2.8, -0.9, 6.2,
      2.8, -0.9, 6.2, 2.2, -1.5, 4.5,
    ];
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
    return geom;
  }, []);

  useFrame(({ clock }) => {
    if (!lineRef.current) return;
    const p = journey.progress;
    const presence = seg(p, 0.42, 0.48) * (1 - seg(p, 0.585, 0.64));
    lineRef.current.visible = presence > 0.001;
    if (!lineRef.current.visible) return;
    const mat = lineRef.current.material as THREE.LineBasicMaterial;
    mat.opacity = presence * (0.32 + Math.sin(clock.elapsedTime * 2.5) * 0.08);
  });

  return (
    <lineSegments ref={lineRef} geometry={lineGeometry} visible={false}>
      <lineBasicMaterial color="#f5b95c" transparent opacity={0.32} blending={THREE.AdditiveBlending} depthWrite={false} />
    </lineSegments>
  );
};

/** Luminous star cluster & warm dust in the lower right quadrant. */
const LowerRightCluster: React.FC = () => {
  const pts = useRef<THREE.Points>(null);
  const count = 360;

  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // Clustered in lower right: x > 1.2, y < 0.2, z between 3.5 and 9.5
      positions[i * 3] = 1.5 + Math.random() * 3.6;
      positions[i * 3 + 1] = -1.9 + Math.random() * 2.2;
      positions[i * 3 + 2] = 3.5 + Math.random() * 6.5;

      c.set(i % 2 === 0 ? '#f5b95c' : '#ff9d5c');
      const dim = 0.55 + Math.random() * 0.45;
      colors[i * 3] = c.r * dim;
      colors[i * 3 + 1] = c.g * dim;
      colors[i * 3 + 2] = c.b * dim;
    }
    return { positions, colors };
  }, [count]);

  useFrame(({ clock }) => {
    if (!pts.current) return;
    const p = journey.progress;
    const presence = seg(p, 0.41, 0.47) * (1 - seg(p, 0.585, 0.64));
    pts.current.visible = presence > 0.001;
    if (!pts.current.visible) return;
    const mat = pts.current.material as THREE.PointsMaterial;
    mat.opacity = presence * (0.9 + Math.sin(clock.elapsedTime * 2.0) * 0.1);
  });

  return (
    <points ref={pts} visible={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        vertexColors
        transparent
        opacity={0}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        fog={false}
      />
    </points>
  );
};

export const Galaxy: React.FC = () => {
  const points = useRef<THREE.Points>(null);
  const count = useMemo(() => (isMobileDevice() ? 550 : 1400), []);

  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // Hollow cylinder shell so the camera can fly through the middle
      const angle = Math.random() * Math.PI * 2;
      // two density shells: dense core + sparse arms
      const shell = Math.random();
      const radius =
        shell < 0.55 ? 2.1 + Math.pow(Math.random(), 1.4) * 3.4 : 5.5 + Math.pow(Math.random(), 0.6) * 5.2;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = (Math.random() - 0.5) * (shell < 0.55 ? 1.8 : 4.6);
      positions[i * 3 + 2] = -3 + Math.random() * 19 + (shell < 0.55 ? Math.sin(angle) * 1.5 : 0);

      c.set(Math.random() < 0.82 ? WARM[Math.floor(Math.random() * WARM.length)] : COOL[Math.floor(Math.random() * COOL.length)]);
      const dim = 0.5 + Math.random() * 0.5;
      colors[i * 3] = c.r * dim;
      colors[i * 3 + 1] = c.g * dim;
      colors[i * 3 + 2] = c.b * dim;
    }
    return { positions, colors };
  }, [count]);

  useFrame(({ clock }) => {
    const pts = points.current;
    if (!pts) return;
    const p = journey.progress;
    const presence = seg(p, 0.41, 0.47) * (1 - seg(p, 0.585, 0.64));
    pts.visible = presence > 0.001;
    if (!pts.visible) return;
    const mat = pts.material as THREE.PointsMaterial;
    mat.opacity = presence * (0.9 + Math.sin(clock.elapsedTime * 2.2) * 0.1);
    pts.rotation.y = clock.elapsedTime * 0.016;
    pts.rotation.x = Math.sin(clock.elapsedTime * 0.05) * 0.05;
  });

  return (
    <>
      <Nebula />
      <OrbitRings />
      <BeaconStars />
      <ConstellationFilaments />
      <LowerRightCluster />
      <points ref={points} visible={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.075}
          vertexColors
          transparent
          opacity={0}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </points>
    </>
  );
};

/** Kept for backwards compatibility with JourneyScene imports */
export const RecipeMatchCards: React.FC = () => null;
