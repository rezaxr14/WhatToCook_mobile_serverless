import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { journey, seg, win } from './state';

/** Soft radial sprite texture generated once (no external assets). */
export const makeGlowTexture = (color: string = 'rgba(255,244,230,0.9)'): THREE.CanvasTexture => {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, 'rgba(255,236,214,0.4)');
  grad.addColorStop(1, 'rgba(255,236,214,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

interface SteamEmitterProps {
  position: [number, number, number];
  /** journey-progress window [inStart, inEnd, outStart, outEnd]. */
  window: [number, number, number, number];
  count?: number;
  spread?: number;
  rise?: number;
}

/** Rising, fading steam puffs — the kitchen always feels alive. */
export const SteamEmitter: React.FC<SteamEmitterProps> = ({
  position,
  window: w,
  count = 12,
  spread = 0.3,
  rise = 1.5,
}) => {
  const group = useRef<THREE.Group>(null);
  const tex = useMemo(() => makeGlowTexture('rgba(255,248,238,0.8)'), []);
  const parts = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        off: Math.random(),
        speed: 0.16 + Math.random() * 0.2,
        x: (Math.random() - 0.5) * spread,
        z: (Math.random() - 0.5) * spread,
        size: 0.35 + Math.random() * 0.5,
      })),
    [count, spread]
  );

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const strength = win(journey.progress, w[0], w[1], w[2], w[3]);
    g.visible = strength > 0.01;
    if (!g.visible) return;
    const t = clock.elapsedTime;
    g.children.forEach((child, i) => {
      const pt = parts[i];
      const cyc = (t * pt.speed + pt.off) % 1;
      child.position.set(pt.x * (0.5 + cyc), cyc * rise, pt.z * (0.5 + cyc));
      const mat = (child as THREE.Sprite).material as THREE.SpriteMaterial;
      mat.opacity = Math.sin(Math.PI * cyc) * 0.26 * strength;
      child.scale.setScalar(pt.size * (0.45 + cyc * 1.5));
    });
  });

  return (
    <group ref={group} position={position}>
      {parts.map((_, i) => (
        <sprite key={i}>
          <spriteMaterial map={tex} transparent depthWrite={false} opacity={0} />
        </sprite>
      ))}
    </group>
  );
};

/** Ambient dust motes drifting through the light for volumetric depth.
 *  Optional hide/show progress windows: dust is lovely in wide shots but in
 *  bright close-ups (the fridge interior) drifting specks read as wall
 *  flicker, so the scene fades dust out before those shots. */
export const DustField: React.FC<{
  count?: number;
  /** fade the whole field out over [a,b] */
  hide?: [number, number];
  /** fade it back in over [a,b] */
  show?: [number, number];
}> = ({ count = 160, hide, show }) => {
  const ref = useRef<THREE.Points>(null);
  const { positions, drift } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const drift = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = Math.random() * 4.2;
      positions[i * 3 + 2] = -6 + Math.random() * 15;
      drift[i] = Math.random() * Math.PI * 2;
    }
    return { positions, drift };
  }, [count]);

  useFrame(({ clock }) => {
    const pts = ref.current;
    if (!pts) return;
    const t = clock.elapsedTime;
    const p = journey.progress;
    const pos = pts.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      pos.setY(i, 0.4 + Math.abs(Math.sin(t * 0.08 + drift[i])) * 3.6);
      pos.setX(i, pos.getX(i) + Math.sin(t * 0.05 + drift[i]) * 0.0006);
    }
    pos.needsUpdate = true;
    const mat = pts.material as THREE.PointsMaterial;
    let presence = 0.16 + seg(p, 0.86, 0.95) * 0.1;
    if (hide) presence *= 1 - seg(p, hide[0], hide[1]);
    if (show) presence *= seg(p, show[0], show[1]);
    mat.opacity = presence;
    pts.visible = presence > 0.004;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.022}
        color="#ffe8c4"
        transparent
        opacity={0.18}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
};

/** Rising embers / sparkles, great over the flame and on the finished dish. */
export const EmberField: React.FC<{
  position?: [number, number, number];
  window: [number, number, number, number];
  count?: number;
  spread?: number;
  rise?: number;
  color?: string;
}> = ({ position = [0, 0, 0], window: w, count = 18, spread = 0.9, rise = 2.2, color = '#ffb45e' }) => {
  const group = useRef<THREE.Group>(null);
  const tex = useMemo(() => makeGlowTexture('rgba(255,240,220,0.95)'), []);
  const parts = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        off: Math.random() * 10,
        speed: 0.5 + Math.random() * 0.9,
        x: (Math.random() - 0.5) * spread,
        z: (Math.random() - 0.5) * spread,
        size: 0.02 + Math.random() * 0.05,
      })),
    [count, spread]
  );

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const strength = win(journey.progress, w[0], w[1], w[2], w[3]);
    g.visible = strength > 0.01;
    if (!g.visible) return;
    const t = clock.elapsedTime;
    g.children.forEach((child, i) => {
      const pt = parts[i];
      const cyc = (t * pt.speed + pt.off) % 1;
      const par = 1 - cyc;
      child.position.set(pt.x * (1 + cyc * 2.2), cyc * rise, pt.z * (1 + cyc * 2.2));
      const mat = (child as THREE.Sprite).material as THREE.SpriteMaterial;
      mat.opacity = Math.sin(Math.PI * cyc) * 0.85 * strength;
      child.scale.setScalar(pt.size * (0.7 + cyc));
    });
  });

  return (
    <group ref={group} position={position}>
      {parts.map((_, i) => (
        <sprite key={i}>
          <spriteMaterial map={tex} color={color} transparent depthWrite={false} opacity={0} />
        </sprite>
      ))}
    </group>
  );
};

/** A rare shooting star that streaks across the galaxy chapter. */
export const ShootingStar: React.FC = () => {
  const star = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({
      color: '#fff4dd',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.visible = false;
    return line;
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const p = journey.progress;
    // Only active during the galaxy window
    const active = p > 0.44 && p < 0.585;
    if (!active) {
      star.visible = false;
      return;
    }
    // one streak every ~11s
    const cycle = 11;
    const local = (t % cycle) / cycle;
    const visible = local < 0.22;
    star.visible = visible;
    if (!visible) return;
    const k = local / 0.22;
    const headX = -6 + k * 13;
    const headY = 3.2 - k * 1.4;
    const tail = 0.9;
    const positions = (star.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
    positions.setXYZ(0, headX, headY, 1.5 + k * 2);
    positions.setXYZ(1, headX - tail * 0.62, headY + tail * 0.18, 2 + k * 2);
    positions.needsUpdate = true;
    const mat = star.material as THREE.LineBasicMaterial;
    mat.opacity = 0.85 * Math.sin(Math.PI * Math.min(1, k * 1.1));
  });

  return <primitive object={star} />;
};

/** Twinkling distant stars that appear behind the galaxy chapter. */
export const Starback: React.FC = () => {
  const ref = useRef<THREE.Points>(null);
  const count = 220;
  const { positions } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const r = 16 + Math.random() * 30;
      positions[i * 3] = Math.cos(theta) * r;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 24;
      positions[i * 3 + 2] = -20 - Math.random() * 30;
    }
    return { positions };
  }, []);

  useFrame(({ clock }) => {
    const pts = ref.current;
    if (!pts) return;
    const presence = win(journey.progress, 0.4, 0.44, 0.6, 0.65);
    pts.visible = presence > 0.01;
    if (!pts.visible) return;
    const mat = pts.material as THREE.PointsMaterial;
    mat.opacity = presence * (0.5 + Math.sin(clock.elapsedTime * 3 + pts.position.x) * 0.18);
    pts.rotation.y = clock.elapsedTime * 0.006;
  });

  return (
    <points ref={ref} visible={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.11}
        color="#ffe9c9"
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
