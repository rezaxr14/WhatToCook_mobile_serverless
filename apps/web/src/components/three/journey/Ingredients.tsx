import * as THREE from 'three';
import React, { useMemo } from 'react';
import { GroupProps } from '@react-three/fiber';

type G = GroupProps;

const lathe = (pts: [number, number][], segments = 40) =>
  new THREE.LatheGeometry(
    pts.map(([x, y]) => new THREE.Vector2(x, y)),
    segments
  );

const rand = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

// All models are authored base-origin: y = 0 is the surface they stand on.

// ---------------- Tomato ----------------

const TOMATO_BODY = lathe([
  [0.0, 0.0], [0.24, 0.04], [0.44, 0.15], [0.58, 0.33], [0.63, 0.52],
  [0.60, 0.70], [0.48, 0.83], [0.31, 0.89], [0.14, 0.91], [0.05, 0.88], [0.0, 0.86],
]);

const TomatoCalyxLeaf: React.FC<{ angle: number }> = ({ angle }) => (
  <mesh position={[Math.sin(angle) * 0.16, 0.86, Math.cos(angle) * 0.16]} rotation={[0.85 * Math.cos(angle), angle, -0.85 * Math.sin(angle)]}>
    <coneGeometry args={[0.075, 0.3, 6]} />
    <meshStandardMaterial color="#2f7a33" roughness={0.55} />
  </mesh>
);

export const Tomato: React.FC<G> = (props) => (
  <group {...props}>
    <mesh geometry={TOMATO_BODY} castShadow>
      <meshPhysicalMaterial color="#c62f2a" roughness={0.32} clearcoat={0.35} clearcoatRoughness={0.35} sheen={0.4} sheenColor="#ff8a7a" />
    </mesh>
    <TomatoCalyxLeaf angle={0} />
    <TomatoCalyxLeaf angle={Math.PI * 0.4} />
    <TomatoCalyxLeaf angle={Math.PI * 0.8} />
    <TomatoCalyxLeaf angle={Math.PI * 1.2} />
    <TomatoCalyxLeaf angle={Math.PI * 1.6} />
    <mesh position={[0, 0.92, 0]}>
      <cylinderGeometry args={[0.028, 0.04, 0.12, 8]} />
      <meshStandardMaterial color="#3d6b2f" roughness={0.6} />
    </mesh>
  </group>
);

export const TomatoChunk: React.FC<G> = (props) => (
  <group {...props}>
    <mesh scale={[1, 0.72, 1.25]} rotation={[0.4, 0.9, 0.2]} position={[0, 0.17, 0]} castShadow>
      <dodecahedronGeometry args={[0.16, 0]} />
      <meshPhysicalMaterial color="#e04b34" roughness={0.2} clearcoat={0.9} clearcoatRoughness={0.15} />
    </mesh>
    <mesh scale={[0.6, 0.4, 0.7]} rotation={[0.4, 0.9, 0.2]} position={[0.03, 0.2, 0.02]}>
      <dodecahedronGeometry args={[0.16, 0]} />
      <meshStandardMaterial color="#f5977d" roughness={0.45} />
    </mesh>
  </group>
);

// ---------------- Penne (pasta) ----------------

/** A raw penne tube, lying flat. The cooking scene needs actual pasta in the
 *  pan so the finished plated pasta dish feels earned — tomatoes + garlic
 *  alone can't become a pasta nest.
 *
 *  Cylinder axis runs along X after the rotation; vertical extent is just
 *  the tube radius (±0.055), so the piece's underside sits at origin − 0.055.
 */
export const Penne: React.FC<G> = (props) => (
  <group {...props}>
    {/* pale durum tube */}
    <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[0.055, 0.055, 0.17, 14]} />
      <meshPhysicalMaterial color="#e6c98f" roughness={0.5} clearcoat={0.25} clearcoatRoughness={0.4} sheen={0.3} sheenColor="#fff2cf" />
    </mesh>
    {/* darker end bevels so it reads as an open tube, not a stick */}
    <mesh position={[0.085, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.058, 0.058, 0.012, 14]} />
      <meshStandardMaterial color="#d8b574" roughness={0.65} />
    </mesh>
    <mesh position={[-0.085, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.058, 0.058, 0.012, 14]} />
      <meshStandardMaterial color="#d8b574" roughness={0.65} />
    </mesh>
  </group>
);

// ---------------- Lemon ----------------

const LEMON_BODY = lathe(
  [
    [0.0, 0.08], [0.09, 0.10], [0.21, 0.18], [0.33, 0.32], [0.41, 0.52],
    [0.44, 0.74], [0.41, 0.96], [0.33, 1.16], [0.21, 1.30], [0.09, 1.38], [0.0, 1.40],
  ]
);

export const Lemon: React.FC<G> = (props) => (
  <group {...props}>
    {/* Lemon laid on its side so it reads naturally on the counter */}
    <group rotation={[Math.PI / 2, 0, 0.35]} position={[0, 0.44, 0]}>
      <mesh geometry={LEMON_BODY} castShadow>
        <meshPhysicalMaterial color="#f3c11b" roughness={0.32} clearcoat={0.85} clearcoatRoughness={0.28} sheen={0.6} sheenColor="#fff3b0" />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <sphereGeometry args={[0.062, 14, 10]} />
        <meshPhysicalMaterial color="#e9b512" roughness={0.32} clearcoat={0.85} clearcoatRoughness={0.28} />
      </mesh>
      <mesh position={[0, 1.42, 0]}>
        <sphereGeometry args={[0.062, 14, 10]} />
        <meshPhysicalMaterial color="#e9b512" roughness={0.32} clearcoat={0.85} clearcoatRoughness={0.28} />
      </mesh>
    </group>
  </group>
);

// ---------------- Carrot ----------------

const CARROT_BODY = lathe(
  [
    [0.0, 0.0], [0.055, 0.06], [0.088, 0.18], [0.128, 0.32], [0.158, 0.47],
    [0.180, 0.65], [0.193, 0.84], [0.205, 1.02], [0.222, 1.18], [0.245, 1.30],
    [0.235, 1.35], [0.16, 1.37], [0.0, 1.38],
  ],
  32
);

const CARROT_FROND = new THREE.ConeGeometry(0.05, 0.34, 6);

export const Carrot: React.FC<G> = (props) => {
  const fronds = useMemo(() => {
    const r = rand(7);
    return Array.from({ length: 5 }, (_, i) => ({
      key: i,
      // vertical fan offset (-: toward the carrot's center line)
        up: -(0.04 + r() * 0.1),
        z: (r() - 0.5) * 0.18,
        tilt: -0.5 + r() * 1.0,
        s: 0.7 + r() * 0.5,
    }));
  }, []);
  return (
    <group {...props}>
      {/* Carrot laid flat on the counter. The model grows upward from its
          root (y0) to its greens tip (y≈1.38); rotating the group -90°
          about Z lays the body along +X. The +Y lift (≈ body radius)
          keeps the carrot resting ON the surface instead of half-buried. */}
      <group rotation={[0, 0, -Math.PI / 2]} position={[0, 0.25, 0]}>
        <mesh geometry={CARROT_BODY} castShadow>
          <meshPhysicalMaterial color="#ef6c1f" roughness={0.48} clearcoat={0.35} clearcoatRoughness={0.4} />
        </mesh>
        {fronds.map((f) => (
          <mesh
            key={f.key}
            geometry={CARROT_FROND}
            position={[f.up, 1.45 + f.s * 0.1, f.z]}
            rotation={[f.tilt, 0, Math.PI / 2]}
            scale={f.s}
          >
            <meshStandardMaterial color="#4f8f3a" roughness={0.65} />
          </mesh>
        ))}
      </group>
    </group>
  );
};

// ---------------- Egg ----------------

const EGG_BODY = lathe(
  [
    [0.0, 0.0], [0.115, 0.03], [0.195, 0.12], [0.24, 0.25], [0.24, 0.40],
    [0.215, 0.54], [0.16, 0.65], [0.08, 0.72], [0.0, 0.74],
  ],
  36
);

export const Egg: React.FC<G> = (props) => (
  <group {...props}>
    <mesh geometry={EGG_BODY} castShadow>
      <meshPhysicalMaterial color="#f6ecd8" roughness={0.32} clearcoat={0.55} clearcoatRoughness={0.3} sheen={0.5} sheenColor="#ffffff" />
    </mesh>
  </group>
);

// ---------------- Cheese wedge ----------------

const CHEESE_SHAPE = new THREE.Shape();
CHEESE_SHAPE.moveTo(0, 0);
CHEESE_SHAPE.lineTo(0.68, 0);
CHEESE_SHAPE.absarc(0, 0, 0.68, 0, Math.PI * 0.56, false);
CHEESE_SHAPE.lineTo(0, 0);

const CHEESE_GEO = new THREE.ExtrudeGeometry(CHEESE_SHAPE, {
  depth: 0.42,
  bevelEnabled: true,
  bevelThickness: 0.03,
  bevelSize: 0.03,
  bevelSegments: 2,
  curveSegments: 28,
});
CHEESE_GEO.rotateX(-Math.PI / 2);

const CHEESE_HOLES: { p: [number, number, number]; r: number }[] = [
  { p: [0.30, 0.40, -0.16], r: 0.065 },
  { p: [0.22, 0.40, -0.32], r: 0.055 },
  { p: [0.44, 0.24, -0.26], r: 0.060 },
  { p: [0.48, 0.26, -0.12], r: 0.065 },
  { p: [0.34, 0.28, -0.38], r: 0.050 },
];

export const CheeseWedge: React.FC<G> = (props) => (
  <group {...props}>
    <mesh geometry={CHEESE_GEO} castShadow>
      <meshPhysicalMaterial color="#f0b93f" roughness={0.5} clearcoat={0.25} clearcoatRoughness={0.5} />
    </mesh>
    {CHEESE_HOLES.map((h, i) => (
      <mesh key={i} position={h.p}>
        <sphereGeometry args={[h.r, 14, 10]} />
        <meshStandardMaterial color="#cf9526" roughness={0.65} />
      </mesh>
    ))}
  </group>
);

// ---------------- Mushroom ----------------

const MUSHROOM_CAP = lathe(
  [
    [0.0, 0.92], [0.13, 0.905], [0.245, 0.84], [0.345, 0.72], [0.415, 0.56],
    [0.435, 0.48], [0.43, 0.46],
  ],
  36
);
const MUSHROOM_GILLS = lathe([[0.42, 0.46], [0.30, 0.405], [0.14, 0.375], [0.0, 0.365]], 36);
const MUSHROOM_STEM = lathe(
  [[0.105, 0.0], [0.125, 0.16], [0.118, 0.40], [0.135, 0.56], [0.165, 0.64], [0.10, 0.66]],
  28
);

export const Mushroom: React.FC<G> = (props) => (
  <group {...props}>
    <mesh geometry={MUSHROOM_STEM} castShadow>
      <meshPhysicalMaterial color="#f1e6d2" roughness={0.45} clearcoat={0.2} />
    </mesh>
    <mesh geometry={MUSHROOM_CAP}>
      <meshPhysicalMaterial color="#cfa276" roughness={0.42} clearcoat={0.3} clearcoatRoughness={0.45} />
    </mesh>
    <mesh geometry={MUSHROOM_GILLS}>
      <meshStandardMaterial color="#a98a67" roughness={0.7} side={THREE.DoubleSide} />
    </mesh>
  </group>
);

// ---------------- Garlic ----------------

const GARLIC_CLOVE = lathe(
  [[0.0, -0.34], [0.09, -0.29], [0.15, -0.13], [0.16, 0.02], [0.13, 0.20], [0.06, 0.33], [0.0, 0.40]],
  24
);

export type ProducePose = 'flat' | 'up';

/** Garlic — lies flat by default (countertops); pass pose="up" where the
 *  original upright bulb reads better (fridge shelves, cooking drops). */
export const Garlic: React.FC<G & { pose?: ProducePose }> = ({ pose = 'flat', ...props }) => (
  <group {...props}>
    {pose === 'up' ? (
      <>
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2;
          return (
            <mesh
              key={i}
              geometry={GARLIC_CLOVE}
              position={[Math.sin(a) * 0.115, 0.4, Math.cos(a) * 0.115]}
              rotation={[0.16 * Math.cos(a), a, -0.16 * Math.sin(a)]}
              scale={1.06}
              castShadow
            >
              <meshPhysicalMaterial color="#f2e9d6" roughness={0.5} clearcoat={0.35} clearcoatRoughness={0.4} sheen={0.6} sheenColor="#fffdf5" />
            </mesh>
          );
        })}
        <mesh geometry={GARLIC_CLOVE} position={[0, 0.46, 0]} scale={1.15} castShadow>
          <meshPhysicalMaterial color="#efe5d0" roughness={0.5} clearcoat={0.35} clearcoatRoughness={0.4} />
        </mesh>
        <mesh position={[0, 0.92, 0]} rotation={[0.12, 0, -0.08]}>
          <coneGeometry args={[0.035, 0.22, 8]} />
          <meshStandardMaterial color="#cbb98f" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.05, 0]}>
          <coneGeometry args={[0.05, 0.09, 8]} />
          <meshStandardMaterial color="#c9b691" roughness={0.85} />
        </mesh>
      </>
    ) : (
      <group rotation={[Math.PI / 2, 0, 0.5]} position={[0, 0.28, 0]}>
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2;
          return (
            <mesh
              key={i}
              geometry={GARLIC_CLOVE}
              position={[Math.sin(a) * 0.115, 0.4, Math.cos(a) * 0.115]}
              rotation={[0.16 * Math.cos(a), a, -0.16 * Math.sin(a)]}
              scale={1.06}
              castShadow
            >
              <meshPhysicalMaterial color="#f2e9d6" roughness={0.5} clearcoat={0.35} clearcoatRoughness={0.4} sheen={0.6} sheenColor="#fffdf5" />
            </mesh>
          );
        })}
        <mesh geometry={GARLIC_CLOVE} position={[0, 0.46, 0]} scale={1.15} castShadow>
          <meshPhysicalMaterial color="#efe5d0" roughness={0.5} clearcoat={0.35} clearcoatRoughness={0.4} />
        </mesh>
        <mesh position={[0, 0.92, 0]} rotation={[0.12, 0, -0.08]}>
          <coneGeometry args={[0.035, 0.22, 8]} />
          <meshStandardMaterial color="#cbb98f" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.05, 0]}>
          <coneGeometry args={[0.05, 0.09, 8]} />
          <meshStandardMaterial color="#c9b691" roughness={0.85} />
        </mesh>
      </group>
    )}
  </group>
);

// ---------------- Onion ----------------

const ONION_BODY = lathe(
  [
    [0.0, 0.0], [0.15, 0.04], [0.29, 0.15], [0.395, 0.36], [0.415, 0.54],
    [0.375, 0.73], [0.255, 0.87], [0.11, 0.95], [0.04, 0.98], [0.0, 0.99],
  ],
  40
);

/** Onion — lies flat by default (countertops); pass pose="up" for the
 *  original upright bulb (fridge shelves). */
export const Onion: React.FC<G & { pose?: ProducePose }> = ({ pose = 'flat', ...props }) => (
  <group {...props}>
    {pose === 'up' ? (
      <>
        <mesh geometry={ONION_BODY} castShadow>
          <meshPhysicalMaterial color="#d19a4f" roughness={0.38} clearcoat={0.5} clearcoatRoughness={0.3} sheen={0.5} sheenColor="#ffe9bf" />
        </mesh>
        <mesh position={[0, 1.04, 0]} rotation={[0.1, 0, -0.12]}>
          <coneGeometry args={[0.028, 0.24, 6]} />
          <meshStandardMaterial color="#a9bd7e" roughness={0.65} />
        </mesh>
        <mesh position={[0.02, 1.02, 0.02]} rotation={[-0.14, 0.5, 0.1]}>
          <coneGeometry args={[0.022, 0.18, 6]} />
          <meshStandardMaterial color="#96ad6d" roughness={0.65} />
        </mesh>
        <mesh position={[0, 0.05, 0]}>
          <coneGeometry args={[0.055, 0.1, 8]} />
          <meshStandardMaterial color="#b99a63" roughness={0.85} />
        </mesh>
      </>
    ) : (
      <group rotation={[Math.PI / 2, 0, 0.2]} position={[0, 0.42, 0]}>
        <mesh geometry={ONION_BODY} castShadow>
          <meshPhysicalMaterial color="#d19a4f" roughness={0.38} clearcoat={0.5} clearcoatRoughness={0.3} sheen={0.5} sheenColor="#ffe9bf" />
        </mesh>
        <mesh position={[0, 1.04, 0]} rotation={[0.1, 0, -0.12]}>
          <coneGeometry args={[0.028, 0.24, 6]} />
          <meshStandardMaterial color="#a9bd7e" roughness={0.65} />
        </mesh>
        <mesh position={[0.02, 1.02, 0.02]} rotation={[-0.14, 0.5, 0.1]}>
          <coneGeometry args={[0.022, 0.18, 6]} />
          <meshStandardMaterial color="#96ad6d" roughness={0.65} />
        </mesh>
        <mesh position={[0, 0.05, 0]}>
          <coneGeometry args={[0.055, 0.1, 8]} />
          <meshStandardMaterial color="#b99a63" roughness={0.85} />
        </mesh>
      </group>
    )}
  </group>
);

// ---------------- Bell pepper ----------------

const PEPPER_LOBE = new THREE.SphereGeometry(0.30, 26, 20);

export const BellPepper: React.FC<G> = (props) => (
  <group {...props}>
    <mesh geometry={PEPPER_LOBE} scale={[1, 1.42, 1]} position={[0, 0.44, 0]} castShadow>
      <meshPhysicalMaterial color="#3f9b42" roughness={0.28} clearcoat={0.35} clearcoatRoughness={0.35} sheen={0.5} sheenColor="#b8f5b0" />
    </mesh>
    {[0, 1, 2].map((i) => {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      return (
        <mesh
          key={i}
          geometry={PEPPER_LOBE}
          scale={[0.92, 1.32, 0.92]}
          position={[Math.sin(a) * 0.17, 0.4, Math.cos(a) * 0.17]}
          castShadow
        >
          <meshPhysicalMaterial color="#3f9b42" roughness={0.28} clearcoat={0.35} clearcoatRoughness={0.35} />
        </mesh>
      );
    })}
    {[0, 1, 2, 3].map((i) => {
      const a = (i / 4) * Math.PI * 2;
      return (
        <mesh
          key={`calyx-${i}`}
          position={[Math.sin(a) * 0.1, 0.86, Math.cos(a) * 0.1]}
          rotation={[0.7 * Math.cos(a), a, -0.7 * Math.sin(a)]}
        >
          <boxGeometry args={[0.16, 0.02, 0.09]} />
          <meshStandardMaterial color="#2c6e2f" roughness={0.55} />
        </mesh>
      );
    })}
    <mesh position={[0, 0.94, 0]} rotation={[0.15, 0, -0.2]}>
      <cylinderGeometry args={[0.032, 0.05, 0.2, 8]} />
      <meshStandardMaterial color="#5d7a3a" roughness={0.55} />
    </mesh>
  </group>
);

// ---------------- Basil pot ----------------

const BASIL_LEAF_SHAPE = new THREE.Shape();
BASIL_LEAF_SHAPE.moveTo(0, 0);
BASIL_LEAF_SHAPE.quadraticCurveTo(0.085, 0.06, 0.095, 0.16);
BASIL_LEAF_SHAPE.quadraticCurveTo(0.085, 0.28, 0, 0.35);
BASIL_LEAF_SHAPE.quadraticCurveTo(-0.085, 0.28, -0.095, 0.16);
BASIL_LEAF_SHAPE.quadraticCurveTo(-0.085, 0.06, 0, 0);
const BASIL_LEAF_GEO = new THREE.ShapeGeometry(BASIL_LEAF_SHAPE, 12);

interface BasilSprig {
  key: number;
  a: number;
  r: number;
  h: number;
  tilt: number;
  leaves: { y: number; s: number; rot: number; side: number }[];
}

export const BasilPot: React.FC<G> = (props) => {
  const sprigs = useMemo<BasilSprig[]>(() => {
    const r = rand(23);
    return Array.from({ length: 6 }, (_, i) => ({
      key: i,
      a: (i / 6) * Math.PI * 2 + r() * 0.6,
      r: 0.05 + r() * 0.1,
      h: 0.34 + r() * 0.2,
      tilt: 0.18 + r() * 0.3,
      leaves: Array.from({ length: 3 }, (_, j) => ({
        y: 0.35 + j * 0.14 + r() * 0.05,
        s: 0.85 + r() * 0.5,
        rot: r() * Math.PI,
        side: j % 2 === 0 ? 1 : -1,
      })),
    }));
  }, []);
  return (
    <group {...props}>
      <mesh position={[0, 0.16, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.175, 0.32, 24]} />
        <meshStandardMaterial color="#a8593b" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.33, 0]}>
        <cylinderGeometry args={[0.265, 0.245, 0.07, 24]} />
        <meshStandardMaterial color="#b26445" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.365, 0]}>
        <cylinderGeometry args={[0.225, 0.225, 0.02, 24]} />
        <meshStandardMaterial color="#3a2a1c" roughness={1} />
      </mesh>
      {sprigs.map((s) => (
        <group key={s.key} rotation={[0, s.a, 0]}>
          <mesh position={[s.r, s.h / 2 + 0.2, 0]} rotation={[0, 0, -s.tilt]}>
            <cylinderGeometry args={[0.014, 0.02, s.h + 0.25, 6]} />
            <meshStandardMaterial color="#4d7c2e" roughness={0.6} />
          </mesh>
          {s.leaves.map((l, j) => (
            <mesh
              key={j}
              geometry={BASIL_LEAF_GEO}
              position={[s.r + l.side * 0.02 * l.s, l.y, 0]}
              rotation={[-Math.PI / 2 + s.tilt * 1.6 + 0.25, l.rot, l.side * 0.5]}
              scale={l.s}
            >
              <meshStandardMaterial color={j % 2 === 0 ? '#2f7a33' : '#3c9440'} roughness={0.5} side={THREE.DoubleSide} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
};

// ---------------- Milk carton ----------------

const GABLE_SHAPE = new THREE.Shape();
GABLE_SHAPE.moveTo(-0.21, 0);
GABLE_SHAPE.lineTo(0.21, 0);
GABLE_SHAPE.lineTo(0, 0.17);
GABLE_SHAPE.closePath();
const GABLE_GEO = new THREE.ExtrudeGeometry(GABLE_SHAPE, { depth: 0.42, bevelEnabled: false });
GABLE_GEO.translate(0, 0, -0.21);

export const MilkCarton: React.FC<G> = (props) => (
  <group {...props}>
    <mesh position={[0, 0.31, 0]} castShadow>
      <boxGeometry args={[0.42, 0.62, 0.42]} />
      <meshStandardMaterial color="#f7f4ec" roughness={0.55} />
    </mesh>
    <mesh geometry={GABLE_GEO} position={[0, 0.62, 0]} castShadow>
      <meshStandardMaterial color="#f2eee4" roughness={0.55} />
    </mesh>
    <mesh position={[0, 0.47, 0]}>
      <boxGeometry args={[0.425, 0.1, 0.425]} />
      <meshStandardMaterial color="#3b6fb4" roughness={0.5} />
    </mesh>
    <mesh position={[0, 0.79, 0]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.05, 0.05, 0.07, 14]} />
      <meshStandardMaterial color="#3b6fb4" roughness={0.4} />
    </mesh>
  </group>
);
