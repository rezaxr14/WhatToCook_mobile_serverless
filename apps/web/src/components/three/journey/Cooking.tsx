import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { journey, seg, win } from './state';
import { TomatoChunk, Penne, Garlic, BasilPot } from './Ingredients';
import { SteamEmitter, EmberField } from './Effects';

// Sauce tint endpoints — hoisted so the per-frame update allocates nothing.
const SAUCE_BASE = new THREE.Color('#e2603f');
const SAUCE_DARK = new THREE.Color('#a83520');

// Hoisted dish garnish geometries and materials to avoid allocations and reduce draw overhead
const PARMESAN_GEO = new THREE.BoxGeometry(0.03, 0.008, 0.03);
const PARMESAN_MAT = new THREE.MeshStandardMaterial({ color: '#f7f2e6', roughness: 0.45 });

const BASIL_GARNISH_GEO = new THREE.SphereGeometry(1, 8, 6);
const BASIL_GARNISH_MAT = new THREE.MeshStandardMaterial({ color: '#2e6b34', roughness: 0.35 });

const PARMESAN_ITEMS = Array.from({ length: 26 }, (_, i) => {
  const a = i * 2.39996;
  const r = 0.12 + (i % 5) * 0.09;
  return {
    position: [Math.cos(a) * r, 0.26 + (i % 3) * 0.02, Math.sin(a) * r] as [number, number, number],
    rotation: [i, i * 0.7, 0] as [number, number, number],
  };
});

const BASIL_GARNISH_ITEMS = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2 + 0.5;
  return {
    position: [Math.cos(a) * 0.26, 0.31, Math.sin(a) * 0.26] as [number, number, number],
    rotation: [0, -a, 0.5] as [number, number, number],
  };
});

/**
 * Chapter V–VI: the magic moment. Ingredients drop into the pan, the flame
 * roars, the sauce develops — then the pan gives way to the finished dish,
 * plated and steaming, slowly presenting itself.
 */
export const Cooking: React.FC = () => {
  const station = useRef<THREE.Group>(null);
  const pan = useRef<THREE.Group>(null);
  const flame = useRef<THREE.Mesh>(null);
  const flameMid = useRef<THREE.Mesh>(null);
  const flameCore = useRef<THREE.Mesh>(null);
  const flameLight = useRef<THREE.PointLight>(null);
  const sauce = useRef<THREE.Mesh>(null);
  const drops = useRef<THREE.Group>(null);
  const dish = useRef<THREE.Group>(null);
  const pasta = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const p = journey.progress;
    const t = clock.elapsedTime;

    // Cooking station lifecycle
    const stationIn = seg(p, 0.555, 0.6);
    const stationOut = 1 - seg(p, 0.725, 0.775);
    const st = stationIn * stationOut;
    if (station.current) {
      station.current.visible = st > 0.001;
      station.current.scale.setScalar(Math.max(st, 0.001));
      station.current.position.y = 1.02 + (1 - st) * -0.4;
    }

    // Flame flicker (three layered cones driven together)
    const flameOn = win(p, 0.6, 0.625, 0.72, 0.775);
    const flick = 0.85 + Math.sin(t * 21) * 0.12 + Math.sin(t * 47.3) * 0.06;
    const flameScalars: Array<THREE.Mesh | null> = [flame.current, flameMid.current, flameCore.current];
    flameScalars.forEach((m, ci) => {
      if (!m) return;
      const visible = flameOn > 0.01;
      m.visible = visible;
      if (!visible) return;
      const f2 = 0.8 + Math.sin(t * (21 + ci * 11) + ci * 4) * 0.16 + Math.sin(t * (47 + ci * 7)) * 0.06;
      m.scale.set(flameOn * f2, flameOn * (0.95 + f2 * 0.4), flameOn * f2);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = flameOn * (ci === 0 ? 0.5 : ci === 1 ? 0.55 : 0.85);
    });
    if (flameLight.current) {
      flameLight.current.intensity = flameOn * (2.6 + Math.sin(t * 31.7) * 0.7);
    }

    // Sauce developing in the pan
    if (sauce.current) {
      const s = seg(p, 0.655, 0.715);
      sauce.current.scale.setScalar(Math.max(s, 0.001) * (1 + Math.sin(t * 2.4) * 0.015));
      sauce.current.visible = s > 0.001;
      const sm = sauce.current.material as THREE.MeshPhysicalMaterial;
      sm.color.copy(SAUCE_BASE).lerp(SAUCE_DARK, s);
    }

    // Ingredients dropping into the pan: tomato wedges, raw penne tubes, and garlic
    // ease down from above the frame onto the developing sauce (≈0.30 station-local)
    // and glide onto their own spots on a ring so nothing touches or piles up.
    if (drops.current) {
      const drop = seg(p, 0.585, 0.645);
      drops.current.visible = drop > 0.001 && p < 0.73;
      // rest heights: wedge chunks sit on sauce (0.29), penne tubes (0.345 - radius 0.055 = 0.29),
      // garlic bulb base (0.31)
      const REST_Y = [0.29, 0.345, 0.31, 0.345, 0.29];
      const SPREAD: Array<[number, number]> = [
        [0.36, 0],
        [0.11, 0.34],
        [-0.29, 0.21],
        [-0.29, -0.21],
        [0.11, -0.34],
      ];
      const YAW = [0.9, 2.4, -0.8, 0.6, 2.1];
      drops.current.children.forEach((child, i) => {
        // remember the authored start position once (before first mutation)
        if (child.userData.x0 === undefined) {
          child.userData.x0 = child.position.x;
          child.userData.z0 = child.position.z;
        }
        const local = THREE.MathUtils.clamp(drop * 1.6 - i * 0.09, 0, 1);
        const ease = 1 - Math.pow(1 - local, 2.4);
        child.position.y = 2.6 - ease * (2.6 - REST_Y[i]);
        // glide sideways onto the resting spot only in the final stretch
        const land = THREE.MathUtils.smoothstep(local, 0.55, 0.95);
        const x0 = child.userData.x0 ?? 0;
        const z0 = child.userData.z0 ?? 0;
        child.position.x = x0 + (SPREAD[i][0] - x0) * land;
        child.position.z = z0 + (SPREAD[i][1] - z0) * land;
        // tumble while airborne, settle into calm resting pose
        child.rotation.x = (local * 5 + i) * (1 - land);
        child.rotation.y = YAW[i] * land;
        child.rotation.z = (local * 3.5) * (1 - land);
      });
    }

    // The finished dish takes over — then settles on the bistro table for
    // the warm homecoming finale (room & table rise at 0.86+).
    const dishIn = seg(p, 0.725, 0.785);
    const settle = seg(p, 0.885, 0.95);
    if (dish.current) {
      dish.current.visible = dishIn > 0.001;
      dish.current.scale.setScalar(Math.max(dishIn, 0.001));
      dish.current.position.y = 1.12 * (1 - settle) + 0.96 * settle + (1 - dishIn) * -0.5;
      dish.current.rotation.y = settle < 0.5 ? t * 0.22 : t * 0.05 + 0.6;
      // gentle "placed" breathing once it rests on the table
      dish.current.position.y += Math.sin(t * 1.8) * 0.004 * settle;
    }
    if (pasta.current) {
      const nest = seg(p, 0.74, 0.8);
      pasta.current.scale.setScalar(Math.max(nest, 0.001));
      pasta.current.rotation.y = nest * 2.4;
    }
  });

  return (
    <>
      {/* ---- Cooking station ---- */}
      <group ref={station} scale={0.001}>
        {/* Stone slab cooktop */}
        <mesh position={[0, 0.06, 0]}>
          <boxGeometry args={[2.7, 0.12, 1.7]} />
          <meshPhysicalMaterial color="#211b15" roughness={0.4} clearcoat={0.5} />
        </mesh>

        {/* Pan */}
        <group ref={pan} position={[0, 0.24, 0]}>
          <mesh>
            <cylinderGeometry args={[0.72, 0.6, 0.14, 40]} />
            <meshPhysicalMaterial color="#1c1c20" roughness={0.32} metalness={0.8} />
          </mesh>
          <mesh position={[0, 0.075, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.66, 0.022, 10, 40]} />
            <meshStandardMaterial color="#2c2c33" metalness={0.85} roughness={0.3} />
          </mesh>
          <mesh position={[0.98, 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.045, 0.05, 0.62, 12]} />
            <meshPhysicalMaterial color="#3a2c1e" roughness={0.6} />
          </mesh>

          {/* Sauce forming inside */}
          <mesh ref={sauce} position={[0, 0.06, 0]} scale={0.001} visible={false}>
            <cylinderGeometry args={[0.56, 0.5, 0.05, 32]} />
            <meshPhysicalMaterial color="#e2603f" roughness={0.22} clearcoat={0.9} clearcoatRoughness={0.2} />
          </mesh>
        </group>

        {/* Flame between slab and pan — layered so bloom reads it beautifully */}
        <mesh ref={flame} position={[0, 0.165, 0]} visible={false}>
          <coneGeometry args={[0.52, 0.34, 24, 1, true]} />
          <meshBasicMaterial color="#ff7a1e" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh ref={flameMid} position={[0, 0.2, 0]} visible={false}>
          <coneGeometry args={[0.3, 0.34, 20, 1, true]} />
          <meshBasicMaterial color="#ffb257" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh ref={flameCore} position={[0, 0.24, 0]} visible={false}>
          <coneGeometry args={[0.13, 0.3, 14, 1, true]} />
          <meshBasicMaterial color="#fff3cf" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>
        <pointLight ref={flameLight} position={[0, 0.35, 0.2]} intensity={0} distance={4.5} decay={1.7} color="#ff9a4a" />
        <EmberField position={[0, 0.45, 0]} window={[0.6, 0.625, 0.72, 0.775]} count={16} spread={0.75} rise={1.5} />

        {/* Falling ingredients: tomato wedge, penne, garlic, penne, tomato wedge */}
        <group ref={drops}>
          <TomatoChunk position={[-0.25, 2.3, 0.05]} />
          <Penne position={[0.15, 2.3, 0.22]} scale={1.05} />
          <Garlic pose="up" position={[-0.05, 2.3, -0.05]} scale={0.7} />
          <Penne position={[-0.2, 2.3, -0.18]} scale={1.05} />
          <TomatoChunk position={[0.2, 2.3, -0.12]} />
        </group>

        <SteamEmitter position={[0, 0.5, 0]} window={[0.635, 0.66, 0.71, 0.78]} count={10} spread={0.5} rise={1.4} />
        <BasilPot position={[-0.95, 0.2, 0.55]} scale={0.8} />
      </group>

      {/* ---- The finished dish ---- */}
      <group ref={dish} position={[0, 1.12, 0]} scale={0.001} visible={false}>
        {/* Ceramic plate */}
        <mesh>
          <cylinderGeometry args={[1.02, 0.82, 0.07, 56]} />
          <meshPhysicalMaterial color="#f3ece1" roughness={0.22} clearcoat={0.95} clearcoatRoughness={0.12} />
        </mesh>
        <mesh position={[0, 0.045, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.94, 0.045, 14, 56]} />
          <meshPhysicalMaterial color="#faf5ec" roughness={0.2} clearcoat={1} />
        </mesh>

        {/* Pasta nest */}
        <group ref={pasta} position={[0, 0.16, 0]} scale={0.001}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.5, 0.085, 14, 48]} />
            <meshPhysicalMaterial color="#eed7a3" roughness={0.48} clearcoat={0.35} />
          </mesh>
          <mesh rotation={[Math.PI / 2.15, 0.5, 0.3]} position={[0.03, 0.07, -0.02]}>
            <torusGeometry args={[0.37, 0.075, 14, 44]} />
            <meshPhysicalMaterial color="#f0d9a8" roughness={0.48} clearcoat={0.35} />
          </mesh>
          <mesh rotation={[Math.PI / 1.9, -0.4, -0.2]} position={[-0.04, 0.13, 0.03]}>
            <torusGeometry args={[0.24, 0.065, 12, 40]} />
            <meshPhysicalMaterial color="#ecd096" roughness={0.5} clearcoat={0.35} />
          </mesh>
        </group>

        {/* Sauce pools */}
        {[[0.28, 0.2, -0.1, 0.13], [-0.3, 0.19, 0.12, 0.11], [0.02, 0.21, 0.3, 0.09]].map(([x, y, z, r], i) => (
          <mesh key={i} position={[x, y, z]} scale={[1, 0.45, 1]}>
            <sphereGeometry args={[r, 20, 20]} />
            <meshPhysicalMaterial color="#b8402a" roughness={0.24} clearcoat={0.9} clearcoatRoughness={0.18} />
          </mesh>
        ))}

        {/* Fresh basil + parmesan finish */}
        {BASIL_GARNISH_ITEMS.map((item, i) => (
          <group key={i} position={item.position} rotation={item.rotation}>
            <mesh scale={[0.075, 0.012, 0.05]} geometry={BASIL_GARNISH_GEO} material={BASIL_GARNISH_MAT} />
          </group>
        ))}
        {PARMESAN_ITEMS.map((item, i) => (
          <mesh key={i} position={item.position} rotation={item.rotation} geometry={PARMESAN_GEO} material={PARMESAN_MAT} />
        ))}

        <SteamEmitter position={[0, 0.45, 0]} window={[0.78, 0.81, 0.97, 1.01]} count={12} spread={0.55} rise={1.7} />
      </group>
    </>
  );
};
