import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { journey, seg } from './state';
import { Tomato, Egg, CheeseWedge, BasilPot, MilkCarton, Garlic, Onion, BellPepper, Lemon, Carrot, Mushroom } from './Ingredients';
import { SteamEmitter } from './Effects';

/**
 * Chapter I environment: a dark, cinematic kitchen. The refrigerator is the
 * centerpiece — its door swings open as the camera approaches (scroll 0.12–0.20)
 * spilling warm light across the room. The whole room sinks into darkness for
 * the middle chapters and rises again, bright and warm, for the finale, where
 * a bistro table rises at center stage for the finished dish.
 */

/** 1D canvas texture helpers (brick/tile/herringbone) — zero network assets. */
const makeCanvasTexture = (
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  w = 256,
  h = 256,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
};

const KitchenRoom: React.FC = () => {
  const room = useRef<THREE.Group>(null);
  const door = useRef<THREE.Group>(null);
  const doorYawRef = useRef(0); // smoothed door yaw (no stepped scroll jumps)
  const fridgeLight = useRef<THREE.PointLight>(null);
  const fridgeLightIntensityRef = useRef(0);
  const cavityMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const bulb1 = useRef<THREE.PointLight>(null);
  const bulb2 = useRef<THREE.PointLight>(null);
  const table = useRef<THREE.Group>(null);
  const moonLight = useRef<THREE.PointLight>(null);
  const windowGlow = useRef<THREE.MeshBasicMaterial>(null);

  // Tile + wood textures built once
  const tiles = useMemo(
    () =>
      makeCanvasTexture((ctx, w, h) => {
        ctx.fillStyle = '#3a2f22';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(245,235,215,0.16)';
        ctx.lineWidth = 3;
        const cw = w / 4;
        for (let x = 0; x < w; x += cw) {
          for (let y = 0; y < h; y += h / 3) {
            ctx.strokeRect(x + 2, y + 2, cw - 4, h / 3 - 4);
          }
        }
      },
      256,
      256,
      8,
      2
    ),
    []
  );
  const plankTex = useMemo(
    () =>
      makeCanvasTexture((ctx, w, h) => {
        ctx.fillStyle = '#4a3624';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(30,20,10,0.25)';
        const rows = 9;
        for (let i = 0; i < rows; i++) {
          const y = (h / rows) * (i + 0.5);
          ctx.fillRect(0, y - 1, w, 2);
          ctx.fillRect((i % 2) * (w / 2), y - h / rows + 2, 2, h / rows - 4);
        }
      },
      512,
      512,
      12,
      12
    ),
    []
  );
  const wood = useMemo(
    () =>
      makeCanvasTexture((ctx, w, h) => {
        ctx.fillStyle = '#5a4027';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 40; i++) {
          ctx.strokeStyle = `rgba(${40 + Math.random() * 40},${25 + Math.random() * 30},${10 + Math.random() * 20},0.22)`;
          ctx.lineWidth = 1 + Math.random() * 3;
          ctx.beginPath();
          const y = Math.random() * h;
          ctx.moveTo(0, y);
          ctx.bezierCurveTo(w * 0.3, y + 6, w * 0.7, y - 6, w, y + 2);
          ctx.stroke();
        }
      },
      512,
      512,
      2,
      2
    ),
    []
  );

  useFrame(({ clock }, delta) => {
    const p = journey.progress;
    const g = room.current;
    if (!g) return;

    // Room sinks away for the AI/galaxy chapters, returns for the finale.
    const sink = seg(p, 0.3, 0.385) * (1 - seg(p, 0.875, 0.95));
    g.position.y = -sink * 9.5;
    g.visible = sink < 0.999;

    // Fridge door: opens on approach, closes again for the finale.
    // Door yaw and interior light are frame-smoothed toward their targets so
    // even a stepped wheel-scroll eases them — no discrete jumps in the
    // shadows or wall brightness while the door swings.
    const open = seg(p, 0.12, 0.17) * (1 - seg(p, 0.9, 0.97));
    const ease = 1 - Math.exp(-8 * Math.min(delta, 0.1));
    const doorYawT = -open * 1.95;
    doorYawRef.current += (doorYawT - doorYawRef.current) * ease;
    if (door.current) door.current.rotation.y = doorYawRef.current;

    // Fridge interior light: gracefully illuminates as the door cracks open,
    // and turns fully off when closed so zero light bleeds into the dark hero kitchen.
    const openRatio = Math.min(1, Math.max(0, -doorYawRef.current / 0.85));
    const targetLight = openRatio * 1.25;
    fridgeLightIntensityRef.current += (targetLight - fridgeLightIntensityRef.current) * ease;
    if (fridgeLight.current) {
      fridgeLight.current.intensity = fridgeLightIntensityRef.current;
      fridgeLight.current.visible = fridgeLightIntensityRef.current > 0.005;
    }
    if (cavityMaterial.current) {
      cavityMaterial.current.emissiveIntensity = 0.02 + fridgeLightIntensityRef.current * 0.22;
    }

    // Warm pendant pools of light — brighter once home again. Intentionally
    // ROCK-STEADY: any high-frequency intensity wobble reads as buzzing on
    // bright surfaces (and inside the fridge when the door opens).
    const warmth = 0.85 + seg(p, 0.88, 0.96) * 0.9;
    if (bulb1.current) bulb1.current.intensity = 3.4 * warmth;
    if (bulb2.current) bulb2.current.intensity = 2.8 * warmth;

    // Moonlight: most present at hero, fades as the room sinks. Steady too.
    if (moonLight.current) moonLight.current.intensity = 0.9 * (1 - sink);
    if (windowGlow.current) windowGlow.current.opacity = 0.5 * (1 - sink);

    // Bistro table rises for the finale meal.
    if (table.current) {
      const rise = seg(p, 0.86, 0.93);
      table.current.visible = rise > 0.01;
      table.current.scale.setScalar(Math.max(rise, 0.001));
      table.current.position.y = -0.01 * (1 - rise);
    }
  });

  return (
    <group ref={room}>
      {/* Floor — warm walnut catching pools of light */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[26, 48]} />
        <meshPhysicalMaterial map={plankTex} color="#ffffff" roughness={0.3} clearcoat={0.4} clearcoatRoughness={0.35} />
      </mesh>

      {/* Back wall */}
      <mesh position={[0, 5, -6.6]} receiveShadow>
        <planeGeometry args={[42, 12]} />
        <meshStandardMaterial color="#33271b" roughness={0.9} />
      </mesh>
      {/* Left wall hint */}
      <mesh position={[-9, 4, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[16, 10]} />
        <meshStandardMaterial color="#2b2117" roughness={0.95} />
      </mesh>

      {/* ---------- Moonlit window on the far wall ---------- */}
      <group position={[-4.6, 3.05, -6.55]}>
        {/* Frame */}
        <mesh position={[0, 0, -0.02]}>
          <boxGeometry args={[2.3, 1.7, 0.14]} />
          <meshPhysicalMaterial color="#241a10" roughness={0.6} metalness={0.4} />
        </mesh>
        {/* Night sky pane */}
        <mesh position={[0, 0, 0.01]}>
          <planeGeometry args={[2.05, 1.45]} />
          <meshBasicMaterial ref={windowGlow} color="#0e1428" toneMapped={false} />
        </mesh>
        {/* Moon */}
        <mesh position={[0.62, 0.44, 0.03]}>
          <sphereGeometry args={[0.16, 24, 24]} />
          <meshBasicMaterial color="#e8ecf5" toneMapped={false} />
        </mesh>
        {/* Cross bars */}
        {[0].map((y) => (
          <mesh key={y} position={[0, 0, 0.03]} rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[2.1, 0.05, 0.03]} />
            <meshStandardMaterial color="#1c130b" />
          </mesh>
        ))}
        <mesh position={[0, 0, 0.03]}>
          <boxGeometry args={[0.05, 1.5, 0.03]} />
          <meshStandardMaterial color="#1c130b" />
        </mesh>
      </group>
      <pointLight ref={moonLight} position={[-4.6, 3.2, -5.6]} intensity={0} distance={11} decay={1.6} color="#9db8e8" />

      {/* Tile backsplash band along the far wall */}
      <mesh position={[-0.8, 2.15, -6.53]}>
        <planeGeometry args={[9, 1.5]} />
        <meshStandardMaterial map={tiles} color="#ffffff" roughness={0.5} />
      </mesh>
      <mesh position={[-0.8, 2.9, -6.58]}>
        <boxGeometry args={[9.05, 0.06, 0.06]} />
        <meshPhysicalMaterial color="#6b5235" roughness={0.4} metalness={0.5} />
      </mesh>

      {/* Counter along the back — truncated to stop flush at X = 1.5 before the fridge wall at X = 1.55 */}
      <mesh position={[-1.2, 0.45, -3.3]} receiveShadow>
        <boxGeometry args={[5.4, 0.9, 1.25]} />
        <meshStandardMaterial color="#57422c" roughness={0.75} />
      </mesh>
      <mesh position={[-1.18, 0.94, -3.3]} receiveShadow>
        <boxGeometry args={[5.48, 0.07, 1.32]} />
        <meshPhysicalMaterial color="#7a6a55" roughness={0.28} clearcoat={0.8} clearcoatRoughness={0.25} />
      </mesh>

      {/* Counter items: cutting board, knife, bowl, jars, hanging herbs */}
      <group position={[-2.35, 0.975, -3.4]}>
        {/* cutting board */}
        <mesh rotation={[0, 0.6, 0]}>
          <boxGeometry args={[0.85, 0.035, 0.4]} />
          <meshPhysicalMaterial color="#9c6b38" roughness={0.5} />
        </mesh>
        <mesh position={[0.28, 0.08, 0.02]} rotation={[Math.PI / 2, 0.1, 0]}>
          <boxGeometry args={[0.42, 0.05, 0.02]} />
          <meshPhysicalMaterial color="#c9cdd4" metalness={0.85} roughness={0.22} />
        </mesh>
      </group>
      {/* mixing bowl */}
      <mesh position={[-1.35, 1.06, -3.15]}>
        <sphereGeometry args={[0.24, 28, 20, 0, Math.PI * 2, 0, Math.PI / 2.6]} />
        <meshPhysicalMaterial color="#8a8f98" roughness={0.25} metalness={0.7} />
      </mesh>
      {/* spice jars row */}
      {[0.5, 0.8, 1.1].map((x, i) => (
        <group key={i} position={[x, 0.975, -3.0]}>
          <mesh>
            <cylinderGeometry args={[0.055, 0.05, 0.16, 12]} />
            <meshPhysicalMaterial color={i === 1 ? '#4a5560' : '#5d4a34'} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.04, 12]} />
            <meshPhysicalMaterial color="#2c2c30" roughness={0.4} />
          </mesh>
        </group>
      ))}
      {/* hanging herb bundle from a wall hook */}
      <group position={[1.3, 2.62, -3.25]}>
        <mesh>
          <cylinderGeometry args={[0.01, 0.01, 0.24, 6]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} position={[(i - 3) * 0.035, -0.3, Math.sin(i * 1.7) * 0.02]} rotation={[0.4 + i * 0.09, i * 0.8, 0.12]}>
            <boxGeometry args={[0.012, 0.26, 0.035]} />
            <meshStandardMaterial color="#4c6b2f" roughness={0.7} />
          </mesh>
        ))}
      </group>

      {/* Pot with gentle steam on the stove area */}
      <mesh position={[0.2, 1.12, -3.25]} castShadow>
        <cylinderGeometry args={[0.3, 0.27, 0.26, 28]} />
        <meshPhysicalMaterial color="#26262c" roughness={0.35} metalness={0.75} />
      </mesh>
      <mesh position={[0.2, 1.27, -3.25]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.28, 0.018, 10, 32]} />
        <meshStandardMaterial color="#3a3a42" metalness={0.8} roughness={0.3} />
      </mesh>
      <SteamEmitter position={[0.2, 1.35, -3.25]} window={[0, 0.02, 0.14, 0.19]} count={9} rise={1.1} />

      {/* Hanging pendant lights above the counter */}
      {[-1.6, 0.2].map((x, i) => (
        <group key={i} position={[x, 0, -3.25]}>
          <mesh position={[0, 3.35, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 1.1, 6]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
          <mesh position={[0, 2.78, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.24, 0.22, 24, 1, true]} />
            <meshStandardMaterial color="#171512" roughness={0.4} metalness={0.6} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 2.7, 0]}>
            <sphereGeometry args={[0.055, 16, 16]} />
            <meshStandardMaterial color="#ffd9a0" emissive="#ffb45e" emissiveIntensity={3} toneMapped={false} />
          </mesh>
          <pointLight
            ref={i === 0 ? bulb1 : bulb2}
            position={[0, 2.62, 0]}
            intensity={3.2}
            distance={9.5}
            decay={1.45}
            color="#ffbe78"
          />
        </group>
      ))}

      {/* ============ THE REFRIGERATOR ============ */}
      <group position={[2.4, 0, -3.05]}>
        {/* Body — five panels, open at the front so the interior reads */}
        <mesh position={[0, 1.75, -0.525]} castShadow>
          <boxGeometry args={[1.7, 3.5, 0.1]} />
          <meshStandardMaterial color="#4d565e" roughness={0.45} metalness={0.25} />
        </mesh>
        <mesh position={[-0.8, 1.75, 0]}>
          <boxGeometry args={[0.1, 3.5, 1.15]} />
          <meshStandardMaterial color="#4d565e" roughness={0.45} metalness={0.25} />
        </mesh>
        <mesh position={[0.8, 1.75, 0]}>
          <boxGeometry args={[0.1, 3.5, 1.15]} />
          <meshStandardMaterial color="#4d565e" roughness={0.45} metalness={0.25} />
        </mesh>
        <mesh position={[0, 3.45, 0]}>
          <boxGeometry args={[1.7, 0.1, 1.15]} />
          <meshStandardMaterial color="#4d565e" roughness={0.45} metalness={0.25} />
        </mesh>
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={[1.7, 0.1, 1.15]} />
          <meshStandardMaterial color="#4d565e" roughness={0.45} metalness={0.25} />
        </mesh>

        {/* Interior cavity — recessed with 20mm clearance on all axes to completely prevent Z-fighting */}
        <mesh position={[0, 1.75, 0.0]}>
          <boxGeometry args={[1.44, 3.20, 0.92]} />
          <meshStandardMaterial
            ref={cavityMaterial}
            color="#f5ede0"
            emissive="#ffeed4"
            emissiveIntensity={0.02}
            roughness={0.92}
            metalness={0}
            side={THREE.BackSide}
          />
        </mesh>

        {/* Crisper drawer zone at bottom */}
        <group position={[0, 0.47, 0.02]}>
          <mesh>
            <boxGeometry args={[1.36, 0.62, 0.82]} />
            <meshStandardMaterial color="#f0f4f8" roughness={0.45} transparent opacity={0.85} />
          </mesh>
          <mesh position={[0, 0.28, 0.415]}>
            <boxGeometry args={[0.42, 0.04, 0.025]} />
            <meshStandardMaterial color="#c2c7ce" roughness={0.3} metalness={0.7} />
          </mesh>
        </group>

        {/* Shelves */}
        {[0.85, 1.7, 2.5].map((y) => (
          <mesh key={y} position={[0, y, 0.0]}>
            <boxGeometry args={[1.40, 0.022, 0.86]} />
            <meshPhysicalMaterial color="#eef0f2" roughness={0.55} clearcoat={0.2} transparent opacity={0.8} />
          </mesh>
        ))}

        {/* Fridge contents — proportioned and spaced with zero collision */}
        {/* Shelf 1 (Bottom, y = 0.85): Garlic, Onion, BasilPot, BellPepper */}
        <Garlic pose="up" position={[-0.48, 0.861, -0.05]} scale={0.52} />
        <Onion pose="up" position={[-0.20, 0.861, -0.18]} scale={0.48} />
        <BasilPot position={[0.12, 0.861, 0.02]} scale={0.55} />
        <BellPepper position={[0.46, 0.861, 0.04]} scale={0.50} />

        {/* Shelf 2 (Middle, y = 1.70): Two Vine Tomatoes + Mushroom */}
        <Tomato position={[-0.42, 1.711, 0.05]} scale={0.35} />
        <Tomato position={[-0.10, 1.711, -0.15]} scale={0.30} />
        <Mushroom position={[0.40, 1.711, 0.02]} scale={0.46} />

        {/* Shelf 3 (Top, y = 2.50): Cheese, Farm Eggs, Milk Carton */}
        <CheeseWedge position={[-0.40, 2.511, 0.08]} rotation={[0, 0.15, 0]} scale={0.42} />
        <Egg position={[-0.16, 2.511, 0.16]} scale={0.45} />
        <Egg position={[0.08, 2.511, 0.20]} scale={0.42} />
        <MilkCarton position={[0.42, 2.511, 0.0]} rotation={[0, 0.35, 0]} scale={0.72} />

        {/* Door — hinged on the left edge, with playful magnet notes */}
        <group ref={door} position={[-0.85, 1.75, 0.585]}>
          <mesh position={[0.85, 0, 0]} castShadow>
            <boxGeometry args={[1.68, 3.42, 0.09]} />
            <meshPhysicalMaterial color="#565f68" roughness={0.6} metalness={0.1} clearcoat={0.12} clearcoatRoughness={0.5} />
          </mesh>
          <mesh position={[1.56, 0.15, 0.09]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.022, 0.022, 0.7, 10]} />
            <meshStandardMaterial color="#c8ccd2" metalness={0.8} roughness={0.3} />
          </mesh>
          {/* magnets */}
          {[
            { p: [0.55, 1.1, 0.05] as [number, number, number], c: '#ffd9a0' },
            { p: [0.42, 2.25, 0.05] as [number, number, number], c: '#f4e6c5' },
            { p: [1.08, 1.75, 0.05] as [number, number, number], c: '#e3b9a2' },
          ].map((m, i) => (
            <mesh key={i} position={m.p}>
              <boxGeometry args={[0.13, 0.15, 0.012]} />
              <meshStandardMaterial color={m.c} emissive={m.c} emissiveIntensity={0.35} />
            </mesh>
          ))}
          {/* handle */}
          <mesh position={[1.5, 1.75, 0.045]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.028, 0.028, 0.5, 10]} />
            <meshStandardMaterial color="#c8ccd2" metalness={0.85} roughness={0.25} />
          </mesh>
        </group>

        {/* Interior light — smooth door-driven warm wash, dark when shut */}
        <pointLight ref={fridgeLight} position={[0, 1.8, 0.3]} intensity={0} distance={4.2} decay={1.8} color="#ffedc9" visible={false} />
      </group>

      {/* Scattered counter ingredients — the room feels used, alive */}
      <Lemon position={[-2.1, 0.975, -3.0]} scale={0.9} />
      <Carrot position={[-2.6, 0.975, -3.35]} scale={0.9} />
      <Tomato position={[-3.2, 0.975, -3.1]} scale={0.85} />
      <Garlic position={[-1.1, 0.975, -3.05]} scale={0.85} />

      {/* ============ Finale bistro table (dish settles on it) ============ */}
      <group ref={table} position={[0, -0.01, 0]} scale={0.001} visible={false}>
        {/* legs/pedestal */}
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.1, 0.9, 18]} />
          <meshStandardMaterial color="#241a10" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.005, 0]}>
          <cylinderGeometry args={[0.42, 0.44, 0.045, 26]} />
          <meshStandardMaterial color="#181008" roughness={0.8} />
        </mesh>
        {/* round wood top */}
        <mesh position={[0, 0.935, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[1.04, 1.04, 0.06, 48]} />
          <meshPhysicalMaterial map={wood} color="#ffffff" roughness={0.38} clearcoat={0.5} clearcoatRoughness={0.35} />
        </mesh>
        {/* linen runner */}
        <mesh position={[0, 0.966, 0]}>
          <cylinderGeometry args={[0.82, 0.82, 0.012, 48]} />
          <meshPhysicalMaterial color="#efe6d8" roughness={0.9} />
        </mesh>
      </group>
    </group>
  );
};

export { KitchenRoom };
export default KitchenRoom;
