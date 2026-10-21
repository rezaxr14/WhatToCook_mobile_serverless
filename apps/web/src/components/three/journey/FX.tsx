import React, { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { journey, seg, win, isMobileDevice } from './state';

/**
 * Cinematic post-production stack:
 *  - Bloom   — light sources bloom; intensity breathes per chapter
 *  - Chromatic aberration — very subtle, quiet in bright close-ups
 *  - Vignette + ACES tone mapping — filmic frame and highlight rolloff
 *
 * Deliberately NO film-grain noise effect: its per-frame random pixels read
 * as light flicker on large bright surfaces (fridge interior, pendant-lit
 * walls), which reads as a broken lamp instead of "shot on film".
 *
 * All values are driven from journey.progress each frame (no React renders).
 *
 * Adaptive quality: never unmounts (an unmount mid-scroll pops the whole
 * look and reads as a glitch). If frames stay heavy the bloom simply backs
 * off to a whisper, and it breathes back up once the framerate recovers.
 * MSAA is kept off — the composer's multisampled targets re-allocate on
 * resize and double the fill cost for almost no visible gain here.
 */
export const CinematicFX: React.FC = () => {
  const bloom = useRef<any>(null);
  const mobile = useMemo(() => isMobileDevice(), []);
  // Post-processing renders at reduced internal resolution (half the pixels
  // on mobile, ~60% on desktop): bloom is a soft effect, so this is visually
  // nearly identical but much cheaper — the single biggest FPS win here.
  const resScale = mobile ? 0.5 : 0.62;
  const [degraded, setDegraded] = useState(false);
  // ?fx=full disables the adaptive governor (used for visual QA of the full
  // post stack, e.g. capturing what a real GPU shows).
  const fxFull = useMemo(
    () => typeof window !== 'undefined' && window.location.search.includes('fx=full'),
    []
  );
  const emaRef = useRef(0);
  const heavyFrames = useRef(0);
  const lightFrames = useRef(0);

  useFrame((_, delta) => {
    if (fxFull) return;
    const dt = Math.min(delta, 0.25);
    emaRef.current = emaRef.current * 0.94 + dt * 0.06;
    if (!degraded) {
      if (emaRef.current > 0.042) {
        heavyFrames.current += 1;
        if (heavyFrames.current > 150) setDegraded(true); // ~6s at <24fps
      } else {
        heavyFrames.current = Math.max(0, heavyFrames.current - 1);
      }
    } else if (emaRef.current < 0.02) {
      lightFrames.current += 1;
      if (lightFrames.current > 120) {
        setDegraded(false); // framerate recovered — bloom returns
        lightFrames.current = 0;
      }
    } else {
      lightFrames.current = Math.max(0, lightFrames.current - 1);
    }
  });

  useFrame(({ clock }) => {
    const p = journey.progress;
    const t = clock.elapsedTime;

    // --- Chapter light "looks" ------------------------------------------
    const aiGlow = win(p, 0.335, 0.42, 0.5, 0.55); // AI constellation
    const galaxy = win(p, 0.44, 0.5, 0.6, 0.66);
    const flame = win(p, 0.6, 0.64, 0.75, 0.8); // cooking fire
    const finale = win(p, 0.88, 0.96, 1.001, 1.002);
    const hero = 1 - seg(p, 0, 0.12);

    // Bloom intensity is STEADY per chapter — no time-based breathing at
    // all. Time-based pulsing is what makes bright walls (fridge interior)
    // visibly throb white. Only the flame keeps its own fast flicker, which
    // reads as fire, not as broken lighting.
    const flameFlick = 1 + Math.sin(t * 19.3) * 0.09 * flame;
    const bloomI = 0.36 + aiGlow * 0.55 + galaxy * 0.26 + flame * 0.32 * flameFlick + finale * 0.22 + hero * 0.13;

    if (bloom.current) {
      // Degraded = framerate starving: keep the stack mounted but drop the
      // bloom to a whisper; it breathes back once frames recover.
      bloom.current.intensity = degraded ? 0.08 : bloomI;
      // In postprocessing, luminance threshold and smoothing uniforms are on luminanceMaterial.
      // Setting them directly configures the shader pass, ensuring non-emissive surfaces never bloom.
      if (bloom.current.luminanceMaterial) {
        bloom.current.luminanceMaterial.threshold = 0.72 - aiGlow * 0.12;
        bloom.current.luminanceMaterial.smoothing = 0.30;
      }
    }
  });

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom
        ref={bloom}
        intensity={0.4}
        luminanceThreshold={0.72}
        luminanceSmoothing={0.30}
        radius={0.65}
        resolutionScale={resScale}
      />
      <Vignette eskil={false} offset={0.22} darkness={0.82} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
};
