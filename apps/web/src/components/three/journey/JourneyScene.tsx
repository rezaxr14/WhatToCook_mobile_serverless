import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { journey, seg, win, pointer, isMobileDevice, prefersReducedMotion, canAffordPostFX } from './state';
import { KitchenRoom } from './KitchenRoom';
import { Constellation } from './Constellation';
import { Galaxy, RecipeMatchCards } from './Galaxy';
import { Cooking } from './Cooking';
import { DustField, EmberField, ShootingStar, Starback } from './Effects';
import { CinematicFX } from './FX';

/**
 * The full journey world. One continuous scene; the scroll position is the
 * timeline. Chapters:
 *   0.00–0.30 arrival + fridge    0.30–0.50 AI constellation
 *   0.42–0.63 recipe galaxy       0.55–0.78 cooking
 *   0.73–1.00 finished dish + homecoming + CTA
 */

// ---------- Camera choreography ----------

interface Key {
  p: number;
  pos: [number, number, number];
  look: [number, number, number];
}

const KEYS: Key[] = [
  { p: 0.0, pos: [0, 1.6, 7.6], look: [0, 1.35, -0.5] },
  { p: 0.09, pos: [1.0, 1.65, 3.4], look: [2.4, 1.55, -3.0] },
  { p: 0.16, pos: [2.75, 1.7, 1.35], look: [2.4, 1.7, -3.0] },
  { p: 0.24, pos: [3.55, 1.95, 0.3], look: [2.4, 1.95, -3.05] },
  { p: 0.31, pos: [3.2, 1.85, -0.1], look: [2.35, 1.8, -3.05] },
  { p: 0.4, pos: [0, 1.75, 9.2], look: [0, 1.5, 0.5] },
  { p: 0.47, pos: [0, 1.65, 11.8], look: [0, 1.45, 2.0] },
  { p: 0.58, pos: [0, 1.5, 3.6], look: [0, 1.35, -1.0] },
  { p: 0.64, pos: [0, 2.1, 5.0], look: [0, 1.15, 0] },
  { p: 0.73, pos: [1.7, 1.75, 4.0], look: [0, 1.15, 0] },
  { p: 0.9, pos: [0, 1.8, 7.2], look: [0, 1.1, 0] },
  { p: 1.0, pos: [0, 1.65, 5.9], look: [0, 1.02, 0.2] },
];

const DISH = new THREE.Vector3(0, 1.06, 0);

// Scratch vectors — reused every frame so the rig allocates nothing at 60fps.
const _posA = new THREE.Vector3();
const _posB = new THREE.Vector3();
const _lookA = new THREE.Vector3();
const _lookB = new THREE.Vector3();
const _orb = new THREE.Vector3();
const _sway = new THREE.Vector3();

const CameraRig: React.FC = () => {
  const target = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3() });
  const reduced = useRef(prefersReducedMotion());

  useFrame(({ camera, clock }, delta) => {
    const p = journey.progress;
    const { pos, look } = target.current;
    const t = clock.elapsedTime;

    let i = 0;
    while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const tt = seg(p, a.p, b.p);
    pos.lerpVectors(_posA.fromArray(a.pos), _posB.fromArray(b.pos), tt);
    look.lerpVectors(_lookA.fromArray(a.look), _lookB.fromArray(b.look), tt);

    // Cinematic orbit around the finished dish during chapter VI
    const orbitW = seg(p, 0.735, 0.79) * (1 - seg(p, 0.845, 0.9));
    if (orbitW > 0.001) {
      const th = THREE.MathUtils.lerp(-0.7, 2.6, seg(p, 0.735, 0.895));
      pos.lerp(_orb.set(Math.sin(th) * 3.3, 0.45, Math.cos(th) * 3.3).add(DISH), orbitW);
      look.lerp(DISH, orbitW);
    }

    // Idle breathing drift at the hero (keeps even the first frame alive)
    const heroBreath = (1 - seg(p, 0, 0.1)) * (pointer.active ? 0.25 : 1);
    pos.x += Math.sin(t * 0.21) * 0.045 * heroBreath;
    pos.y += Math.sin(t * 0.17 + 1.3) * 0.02 * heroBreath;
    look.y += Math.sin(t * 0.13) * 0.02 * heroBreath;

    // Mouse parallax — cinematic "shot on a gimbal" sway (desktop mouse only)
    if (pointer.active && !reduced.current) {
      pointer.x += (pointer.tx - pointer.x) * Math.min(1, delta * 3.2);
      pointer.y += (pointer.ty - pointer.y) * Math.min(1, delta * 3.2);
      pos.x += pointer.x * 0.16;
      pos.y += -pointer.y * 0.08;
      look.x += pointer.x * 0.34;
      look.y += -pointer.y * 0.22;
    } else {
      pointer.x += (0 - pointer.x) * Math.min(1, delta * 2);
      pointer.y += (0 - pointer.y) * Math.min(1, delta * 2);
    }

    // Whisker-soft handheld life during active chapters — deliberately held
    // back for the fridge close-up (p .2–.4) and kept to one slow, smooth
    // harmonic so bright interiors never shimmer or look like they flicker.
    if (!reduced.current && p > 0.4) {
      _sway.set(
        Math.sin(t * 1.05) * 0.0045,
        Math.cos(t * 0.9) * 0.0035,
        Math.sin(t * 0.75) * 0.003
      );
      pos.add(_sway);
    }

    if (reduced.current) {
      camera.position.copy(pos);
    } else {
      const k = 1 - Math.exp(-5 * delta);
      camera.position.lerp(pos, k);
    }
    camera.lookAt(look);
  });

  return null;
};

// ---------- Chapter lighting ----------

const ChapterLights: React.FC = () => {
  const ambient = useRef<THREE.AmbientLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const aiLight = useRef<THREE.PointLight>(null);
  const keyLight = useRef<THREE.SpotLight>(null);
  const galaxyFill = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    const p = journey.progress;
    const finale = seg(p, 0.87, 0.96);
    if (ambient.current) ambient.current.intensity = 0.5 + finale * 0.5;
    if (hemi.current) hemi.current.intensity = 0.45 + finale * 0.4;
    if (fill.current) fill.current.intensity = 0.55 + finale * 0.5;
    if (aiLight.current) {
      aiLight.current.intensity =
        win(p, 0.33, 0.38, 0.46, 0.52) * (2.2 + Math.sin(clock.elapsedTime * 1.4) * 0.3);
    }
    if (galaxyFill.current) {
      galaxyFill.current.intensity = win(p, 0.44, 0.5, 0.58, 0.64) * 1.2;
    }
    if (keyLight.current) {
      keyLight.current.intensity = 1.4 * win(p, 0.72, 0.78, 1.02, 1.04) + finale * 0.8;
      keyLight.current.visible = keyLight.current.intensity > 0.02;
    }
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={0.5} color="#ffedd5" />
      <hemisphereLight ref={hemi} args={['#6b543a', '#1a120b', 0.45]} />
      <directionalLight ref={fill} position={[2.5, 5.5, 7]} intensity={0.55} color="#ffe6c4" />
      <pointLight ref={aiLight} position={[0, 3.4, 2.4]} intensity={0} distance={12} decay={1.6} color="#ffe1a8" />
      <pointLight ref={galaxyFill} position={[0, 2.2, 4]} intensity={0} distance={18} decay={1.4} color="#ffcf9a" />
      <spotLight
        ref={keyLight}
        position={[3.2, 6.5, 4.5]}
        angle={0.5}
        penumbra={0.9}
        intensity={0}
        distance={20}
        decay={1.4}
        color="#fff1dc"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0004}
      />
    </>
  );
};

// ---------- Scene ----------

export const JourneyScene: React.FC<{ onReady: () => void }> = ({ onReady }) => {
  const mobile = isMobileDevice();
  const reduced = prefersReducedMotion();
  const fx = canAffordPostFX();

  return (
    <Canvas
      dpr={mobile ? [1, 1.1] : [1, 1.15]}
      camera={{ position: [0, 1.6, 7.6], fov: mobile ? 58 : 44, near: 0.1, far: 80 }}
      gl={{
        antialias: false,
        alpha: false,
        powerPreference: 'high-performance',
      }}
      shadows="basic"
      onCreated={({ scene, camera, gl }) => {
        scene.fog = new THREE.FogExp2('#070503', 0.042);
        (window as unknown as Record<string, unknown>).__wtcScene = scene;
        (window as unknown as Record<string, unknown>).__wtcCamera = camera;
        (window as unknown as Record<string, unknown>).__wtcRenderer = gl;

        // Procedural studio environment (image-based lighting) — no network.
        if (!prefersReducedMotion()) {
          const pmrem = new THREE.PMREMGenerator(gl);
          const env = new RoomEnvironment();
          const envRt = pmrem.fromScene(env, 0.04);
          scene.environment = envRt.texture;
          (scene as unknown as { environmentIntensity?: number }).environmentIntensity = 0.5;
          pmrem.dispose();
          envRt.dispose();
        }

        // Pre-compile all scene shaders & geometries on the client GPU
        // so that scrolling through later chapters has zero shader compilation frame drops.
        try {
          const hiddenObjects: THREE.Object3D[] = [];
          scene.traverse((obj) => {
            if (!obj.visible) {
              hiddenObjects.push(obj);
              obj.visible = true;
            }
          });

          // Compile all scene programs ahead of time
          gl.compile(scene, camera);

          // Restore initial visibility states
          for (const obj of hiddenObjects) {
            obj.visible = false;
          }
        } catch (err) {
          console.warn('Three.js pre-compile warning:', err);
        }

        setTimeout(onReady, 650);
      }}
      style={{ position: 'absolute', inset: 0, background: '#070503' }}
      aria-hidden
    >
      <ChapterLights />
      <CameraRig />
      <KitchenRoom />
      <Constellation />
      <Galaxy />
      <RecipeMatchCards />
      <Cooking />
      <Starback />
      <ShootingStar />
      <EmberField position={[0, 0.9, -0.1]} window={[0.93, 0.95, 1.01, 1.02]} count={10} spread={1.1} rise={0.8} />
      <DustField count={mobile ? 45 : 120} hide={[0.1, 0.16]} show={[0.42, 0.5]} />
      {fx && !reduced && <CinematicFX />}
    </Canvas>
  );
};
